import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';

// Stub imports — real logic will be implemented by each package owner.
// These are imported here to verify the dependency graph compiles correctly.
import { parseEmlToMdm } from '@mailiac/parsing-mime';
import { decloakHtml } from '@mailiac/parsing-decloak';
import { enrichHopsWithGeo } from '@mailiac/parsing-geoip';
import { scoreIntent } from '@mailiac/parsing-ai-intent';
import { traceReverseHops } from '@mailiac/scoring-reverse-hop';
import { verifyAuth } from '@mailiac/scoring-auth';
import { scoreIdentity } from '@mailiac/scoring-identity';
import { scoreIpReputation } from '@mailiac/scoring-ip-reputation';
import { aggregateRisk } from '@mailiac/scoring-risk-engine';
import { signPayload } from '@mailiac/webhooks';
import { generateForensicPdf } from '@mailiac/reporting-pdf';

import { connectDb, AnalysisReportModel } from '@mailiac/db';
import type { AnalysisReport } from '@mailiac/shared-types';

interface EmailJobData {
  messageId: string;
  buffer: Buffer;
}

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
const webhookSigningSecret = process.env['WEBHOOK_SIGNING_SECRET'] ?? 'default-signing-secret';
const protectedDomains = (process.env['PROTECTED_DOMAINS'] ?? 'target-corp.com,paypal.com,google.com,microsoft.com').split(',');

const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { messageId } = job.data;
  const startTime = Date.now();

  try {
    await connectDb(mongoUri);

    const rawEmlBuffer = Buffer.isBuffer(job.data.buffer)
      ? job.data.buffer
      : Buffer.from((job.data.buffer as unknown as { data: number[] }).data || []);

    // Stage 1: MIME Parse
    console.info(`[${messageId}] stage: mime-parse`);
    const mdm = await parseEmlToMdm(rawEmlBuffer);

    const senderDomain = mdm.from.address.includes('@')
      ? (mdm.from.address.split('@').pop() ?? mdm.from.address)
      : mdm.from.address;

    // Phase 1: Parallel Execution of Independent Analysis Stages
    console.info(`[${messageId}] stage: parallel-phase-1 (reverse-hop, auth, decloak, ai-intent)`);
    const [reverseHopResult, authResults, decloakResult, nlpResult] = await Promise.all([
      traceReverseHops(mdm.receivedHeadersRaw),
      verifyAuth(rawEmlBuffer),
      Promise.resolve(decloakHtml(mdm.bodyHtmlRaw)),
      scoreIntent(mdm.bodyText),
    ]);

    // Attach decloak results to NLP intent model
    nlpResult.glasswormFlag = decloakResult.glasswormFlag;
    nlpResult.zeroWidthCharCount = decloakResult.zeroWidthCharCount;

    // Phase 2: Parallel Execution of Dependent Enrichment & Scoring Stages
    console.info(`[${messageId}] stage: parallel-phase-2 (geoip, ip-reputation, identity)`);
    const originatingIp = reverseHopResult.originatingSenderIp ?? '';
    const [forensicPath, ipReputationResult, identityResult] = await Promise.all([
      enrichHopsWithGeo(reverseHopResult.path),
      scoreIpReputation(originatingIp, mdm.date),
      Promise.resolve(scoreIdentity(senderDomain, protectedDomains, mdm.from.name)),
    ]);

    // Stage 9: Aggregate Risk
    console.info(`[${messageId}] stage: risk-engine`);
    const riskMatrix = aggregateRisk(authResults, identityResult, ipReputationResult, nlpResult);
    const executionTimeMs = Date.now() - startTime;

    // Stage 10: Persist + Notify
    console.info(`[${messageId}] stage: persist-notify`);
    const report: AnalysisReport = {
      messageId: messageId,
      senderDomain: senderDomain || 'unknown',
      timestamp: new Date().toISOString(),
      executionTimeMs,
      forensicPath,
      authResults,
      riskMatrix,
      aiSummary: {
        urgency: nlpResult.nlpScore,
        intent: nlpResult.intentLabels,
        integrityHash: signPayload(JSON.stringify(riskMatrix), webhookSigningSecret, Date.now()),
      },
    };

    await AnalysisReportModel.create(report);

    // Stage 11: PDF Report
    console.info(`[${messageId}] stage: pdf`);
    try {
      await generateForensicPdf(report);
    } catch (_pdfErr) {
      console.info(`[${messageId}] PDF report stage deferred`);
    }

    console.info(`[${messageId}] pipeline completed successfully in ${executionTimeMs}ms. Final Risk Score: ${riskMatrix.finalScore}/100`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[${messageId}] pipeline failed: ${reason}`);
    throw err;
  }
}

const worker = new Worker<EmailJobData>('email-forensics', processEmailJob, { connection });

worker.on('completed', (job) => {
  console.info(`[worker] job ${job.id ?? 'unknown'} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[worker] job ${job?.id ?? 'unknown'} failed: ${err.message}`);
});

console.info('[worker] listening on queue: email-forensics');
