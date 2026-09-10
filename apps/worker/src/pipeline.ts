import crypto from 'node:crypto';
import { parseEmlToMdm } from '@mailiac/parsing-mime';
import { decloakHtml } from '@mailiac/parsing-decloak';
import { enrichHopsWithGeo } from '@mailiac/parsing-geoip';
import { scoreIntent } from '@mailiac/parsing-ai-intent';
import { traceReverseHops } from '@mailiac/scoring-reverse-hop';
import { verifyAuth } from '@mailiac/scoring-auth';
import {
  scoreIdentity,
  getDomainIntelligence,
  extractRegistrableDomain,
  generateDomainFindings,
  type DomainIntelligence,
} from '@mailiac/scoring-identity';
import { scoreIpReputation } from '@mailiac/scoring-ip-reputation';
import { aggregateRisk } from '@mailiac/scoring-risk-engine';
import { generateForensicPdf } from '@mailiac/reporting-pdf';
import {
  connectDb,
  AnalysisReportModel,
  EmailAnalysisRecordModel,
  RawEmailModel,
  DomainIntelligenceModel,
} from '@mailiac/db';
import type { AnalysisReport } from '@mailiac/shared-types';

export interface PipelineOptions {
  mongoUri?: string;
  protectedDomains?: string[];
  skipDbPersist?: boolean;
  skipRdap?: boolean;
  source?: 'eml' | 'gmail';
  gmailMessageId?: string;
  userId?: string;
}

/**
 * Resolves domain registration intelligence using a two-tier cache:
 * in-memory TTL cache + MongoDB DomainIntelligence collection.
 */
async function resolveDomainIntelligenceWithDb(
  domain: string,
  options?: PipelineOptions
): Promise<DomainIntelligence> {
  const skipDbPersist = options?.skipDbPersist;
  const skipRdap = options?.skipRdap || process.env['RDAP_ENABLED'] === 'false';
  const registrable = extractRegistrableDomain(domain);
  if (!registrable) {
    return getDomainIntelligence(domain, { enabled: !skipRdap });
  }

  // Check MongoDB cache if persistence is enabled
  if (!skipDbPersist && typeof DomainIntelligenceModel?.findOne === 'function') {
    try {
      const existing = await DomainIntelligenceModel.findOne({ domain: registrable }).lean();
      if (existing && existing.rdap?.available && existing.rdap.fetchedAt) {
        const fetchedMs = new Date(existing.rdap.fetchedAt).getTime();
        // If cached within the last 24 hours
        if (Date.now() - fetchedMs < 24 * 60 * 60 * 1000) {
          const createdAtStr = existing.registration?.createdAt
            ? new Date(existing.registration.createdAt).toISOString()
            : undefined;
          const expiresAtStr = existing.registration?.expiresAt
            ? new Date(existing.registration.expiresAt).toISOString()
            : undefined;
          const lastChangedAtStr = existing.registration?.lastChangedAt
            ? new Date(existing.registration.lastChangedAt).toISOString()
            : undefined;
          const fetchedAtStr = new Date(existing.rdap.fetchedAt).toISOString();

          const reconstructed: DomainIntelligence = {
            domain: existing.domain,
            registrableDomain: existing.registrableDomain || existing.domain,
            registration: existing.registration
              ? {
                  createdAt: createdAtStr,
                  expiresAt: expiresAtStr,
                  lastChangedAt: lastChangedAtStr,
                }
              : undefined,
            registrar: existing.registrar,
            rdap: {
              available: existing.rdap.available,
              source: existing.rdap.source,
              fetchedAt: fetchedAtStr,
              httpStatus: existing.rdap.httpStatus,
              error: existing.rdap.error,
            },
            age: existing.age as DomainIntelligence['age'],
            findings: [],
          };
          reconstructed.findings = generateDomainFindings(reconstructed);
          return reconstructed;
        }
      }
    } catch {
      // Fallback to in-memory / RDAP lookup
    }
  }

  // Live lookup with in-memory caching and request deduplication
  const intelligence = await getDomainIntelligence(domain, { enabled: !skipRdap });

  // Persist to MongoDB if fresh and DB persistence enabled
  if (!skipDbPersist && typeof DomainIntelligenceModel?.findOneAndUpdate === 'function' && intelligence.rdap.available && intelligence.registrableDomain) {
    try {
      await DomainIntelligenceModel.findOneAndUpdate(
        { domain: intelligence.registrableDomain },
        {
          $set: {
            domain: intelligence.registrableDomain,
            registrableDomain: intelligence.registrableDomain,
            registration: {
              createdAt: intelligence.registration?.createdAt
                ? new Date(intelligence.registration.createdAt)
                : undefined,
              expiresAt: intelligence.registration?.expiresAt
                ? new Date(intelligence.registration.expiresAt)
                : undefined,
              lastChangedAt: intelligence.registration?.lastChangedAt
                ? new Date(intelligence.registration.lastChangedAt)
                : undefined,
            },
            registrar: intelligence.registrar,
            rdap: {
              available: intelligence.rdap.available,
              source: intelligence.rdap.source,
              fetchedAt: new Date(intelligence.rdap.fetchedAt),
              httpStatus: intelligence.rdap.httpStatus,
              error: intelligence.rdap.error,
            },
            age: intelligence.age,
            expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        },
        { upsert: true }
      );
    } catch {
      // Non-fatal
    }
  }

  return intelligence;
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
    const [nlpResult, forensicPath, ipReputationResult, domainIntelligence] = await Promise.all([
      scoreIntent({
        text: mdm.bodyText || decloakResult.extractedText,
        subject: mdm.subject,
        sender: mdm.from.name ? `${mdm.from.name} <${mdm.from.address}>` : mdm.from.address,
        senderDomain,
        urls: decloakResult.extractedUrls,
        arcPass: authResults.arcPass,
      }),
      enrichHopsWithGeo(reverseHopResult.path),
      scoreIpReputation(originatingIp, mdm.date),
      resolveDomainIntelligenceWithDb(senderDomain, options),
    ]);

    const identityResult = scoreIdentity(
      senderDomain,
      protectedDomains,
      mdm.from.name,
      undefined,
      domainIntelligence
    );

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
        {
          $set: {
            ...report,
            ...(options?.userId ? { userId: options.userId } : {}),
          },
        },
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
            ...(options?.userId ? { userId: options.userId } : {}),
          },
        },
        { upsert: true }
      );

      const verdict: 'QUARANTINE' | 'FLAG' | 'SAFE' =
        riskMatrix.finalScore >= 70 ? 'QUARANTINE' :
        riskMatrix.finalScore >= 30 ? 'FLAG' : 'SAFE';

      const source = options?.source ?? (options?.gmailMessageId ? 'gmail' : 'eml');
      const sender = mdm.from.name ? `${mdm.from.name} <${mdm.from.address}>` : mdm.from.address;

      try {
        if (source === 'gmail' && options?.gmailMessageId) {
          // Deduplicate on re-analysis: key on (userId, gmailMessageId)
          const gmailQuery: Record<string, unknown> = { gmailMessageId: options.gmailMessageId };
          if (options?.userId) {
            gmailQuery.userId = options.userId;
          }
          await EmailAnalysisRecordModel.findOneAndUpdate(
            gmailQuery,
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
                ...(options?.userId ? { userId: options.userId } : {}),
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
                ...(options?.userId ? { userId: options.userId } : {}),
              },
            },
            { upsert: true, new: true }
          );
        }
      } catch (recordSaveErr: unknown) {
        // Self-heal: If legacy userId_1_gmailMessageId_1 index caused duplicate key error on null gmailMessageId
        const isLegacyIndexDup =
          (recordSaveErr as { code?: number })?.code === 11000 &&
          String((recordSaveErr as Error)?.message || '').includes('userId_1_gmailMessageId_1');

        if (isLegacyIndexDup) {
          console.warn('[pipeline] Recovering from legacy userId_1_gmailMessageId_1 duplicate key error, fixing index...');
          try {
            await EmailAnalysisRecordModel.collection?.dropIndex('userId_1_gmailMessageId_1');
          } catch {
            // Index might already be dropped or in-memory mock
          }
          // Retry the findOneAndUpdate for .EML upload
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
                ...(options?.userId ? { userId: options.userId } : {}),
              },
            },
            { upsert: true, new: true }
          );
        } else {
          throw recordSaveErr;
        }
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
