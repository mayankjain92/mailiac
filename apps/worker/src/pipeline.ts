import crypto from 'node:crypto';
import { parseEmlToMdm } from '@mailiac/parsing-mime';
import { decloakHtml } from '@mailiac/parsing-decloak';
import { enrichHopsWithGeo } from '@mailiac/parsing-geoip';
import { scoreIntent } from '@mailiac/parsing-ai-intent';
import { traceReverseHops } from '@mailiac/scoring-reverse-hop';
import { verifyAuth } from '@mailiac/scoring-auth';
import { scoreIdentity } from '@mailiac/scoring-identity';
import { scoreIpReputation } from '@mailiac/scoring-ip-reputation';
import { aggregateRisk } from '@mailiac/scoring-risk-engine';
import { generateForensicPdf } from '@mailiac/reporting-pdf';
import { connectDb, AnalysisReportModel, EmailAnalysisRecordModel, RawEmailModel } from '@mailiac/db';
import type { AnalysisReport } from '@mailiac/shared-types';

export interface PipelineOptions {
  mongoUri?: string;
  protectedDomains?: string[];
  skipDbPersist?: boolean;
  source?: 'eml' | 'gmail';
  gmailMessageId?: string;
}

/**
 * Executes the full 9-step asynchronous forensic pipeline for a given raw RFC 822 EML buffer.
 */
export async function runForensicPipeline(
  messageId: string,
  rawEmlBuffer: Buffer,
  options?: PipelineOptions
): Promise<AnalysisReport> {
  const startTime = Date.now();
  const mongoUri = options?.mongoUri ?? process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
  const protectedDomains =
    options?.protectedDomains ??
    (process.env['PROTECTED_DOMAINS'] ?? 'target-corp.com,paypal.com,google.com,microsoft.com').split(',');

  try {
    if (!options?.skipDbPersist) {
      await connectDb(mongoUri);
    }

    // Stage 1: MIME Parse
    const mdm = await parseEmlToMdm(rawEmlBuffer);

    const senderDomain = mdm.from.address.includes('@')
      ? (mdm.from.address.split('@').pop() ?? mdm.from.address)
      : mdm.from.address;

    // Phase 1: Parallel Execution of Independent Analysis Stages
    const [reverseHopResult, authResults, decloakResult] = await Promise.all([
      traceReverseHops(mdm.receivedHeadersRaw),
      verifyAuth(rawEmlBuffer),
      Promise.resolve(decloakHtml(mdm.bodyHtmlRaw)),
    ]);

    // Phase 2: Parallel Execution of AI Intent & Enrichment Stages
    const originatingIp = reverseHopResult.originatingSenderIp ?? '';
    const [nlpResult, forensicPath, ipReputationResult, identityResult] = await Promise.all([
      scoreIntent({
        text: mdm.bodyText || decloakResult.extractedText,
        subject: mdm.subject,
        sender: mdm.from.name ? `${mdm.from.name} <${mdm.from.address}>` : mdm.from.address,
        senderDomain,
        urls: decloakResult.extractedUrls,
      }),
      enrichHopsWithGeo(reverseHopResult.path),
      scoreIpReputation(originatingIp, mdm.date),
      Promise.resolve(scoreIdentity(senderDomain, protectedDomains, mdm.from.name)),
    ]);

    // Attach decloak results to NLP intent model
    nlpResult.glasswormFlag = decloakResult.glasswormFlag;
    nlpResult.zeroWidthCharCount = decloakResult.zeroWidthCharCount;

    // Stage 9: Aggregate Risk
    const riskMatrix = aggregateRisk(senderDomain, authResults, identityResult, ipReputationResult, nlpResult);
    const executionTimeMs = Date.now() - startTime;

    // Stage 10: Persist
    const report: AnalysisReport = {
      messageId: messageId,
      senderDomain: senderDomain || 'unknown',
      timestamp: new Date().toISOString(),
      executionTimeMs,
      forensicPath,
      authResults,
      riskMatrix,
      aiSummary: {
        provider: nlpResult.provider || 'heuristic',
        providerStatus: nlpResult.providerStatus || 'fallback',
        fallbackReason: nlpResult.fallbackReason,
        model: nlpResult.model,
        urgency: nlpResult.nlpScore,
        intent: nlpResult.intentLabels,
        integrityHash: crypto.createHash('sha256').update(JSON.stringify(riskMatrix)).digest('hex'),
        confidence: nlpResult.confidence || 0,
        findings: nlpResult.findings || [],
        aiDiagnostics: nlpResult.aiDiagnostics,
      },
    };

    if (!options?.skipDbPersist) {
      await AnalysisReportModel.findOneAndUpdate(
        { messageId },
        { $set: report },
        { upsert: true, new: true }
      );

      // Preserve raw EML bytes in MongoDB for idempotent re-analysis
      await RawEmailModel.findOneAndUpdate(
        { messageId },
        {
          $set: {
            messageId,
            buffer: rawEmlBuffer,
            source: options?.source ?? (options?.gmailMessageId ? 'gmail' : 'eml'),
            gmailMessageId: options?.gmailMessageId,
          },
        },
        { upsert: true }
      );

      const verdict: 'QUARANTINE' | 'FLAG' | 'SAFE' =
        riskMatrix.finalScore >= 70 ? 'QUARANTINE' :
        riskMatrix.finalScore >= 30 ? 'FLAG' : 'SAFE';

      const source = options?.source ?? (options?.gmailMessageId ? 'gmail' : 'eml');
      const sender = mdm.from.name ? `${mdm.from.name} <${mdm.from.address}>` : mdm.from.address;

      if (source === 'gmail' && options?.gmailMessageId) {
        // Deduplicate on re-analysis: key on gmailMessageId
        await EmailAnalysisRecordModel.findOneAndUpdate(
          { gmailMessageId: options.gmailMessageId },
          {
            $set: {
              jobId: messageId,
              source: 'gmail',
              gmailMessageId: options.gmailMessageId,
              sender,
              subject: mdm.subject,
              senderDomain,
              finalScore: riskMatrix.finalScore,
              verdict,
              authScore: riskMatrix.authScore,
              identityScore: riskMatrix.identityScore,
              ipScore: riskMatrix.ipScore,
              nlpScore: riskMatrix.nlpScore,
              timestamp: new Date().toISOString(),
            },
          },
          { upsert: true, new: true }
        );
      } else {
        // .EML file upload: key on jobId
        await EmailAnalysisRecordModel.findOneAndUpdate(
          { jobId: messageId },
          {
            $set: {
              jobId: messageId,
              source: 'eml',
              sender,
              subject: mdm.subject,
              senderDomain,
              finalScore: riskMatrix.finalScore,
              verdict,
              authScore: riskMatrix.authScore,
              identityScore: riskMatrix.identityScore,
              ipScore: riskMatrix.ipScore,
              nlpScore: riskMatrix.nlpScore,
              timestamp: new Date().toISOString(),
            },
          },
          { upsert: true, new: true }
        );
      }
    }

    // Stage 11: PDF Report
    try {
      await generateForensicPdf(report);
    } catch {
      // PDF report stage deferred
    }

    return report;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[${messageId}] pipeline failed: ${reason}`);
    throw err;
  }
}
