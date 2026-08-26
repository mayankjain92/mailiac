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

  try {
    await connectDb(mongoUri);

    const rawEmlBuffer = Buffer.isBuffer(job.data.buffer)
      ? job.data.buffer
      : Buffer.from((job.data.buffer as unknown as { data: number[] }).data || []);

    // Stage 1: MIME Parse
    console.info(`[${messageId}] stage: mime-parse`);
    const mdm = await parseEmlToMdm(rawEmlBuffer);

    // Stage 2: Reverse-Hop Trace
    console.info(`[${messageId}] stage: reverse-hop`);
    const reverseHopResult = await traceReverseHops(mdm.receivedHeadersRaw);

    // Stage 3: Crypto Auth Verification
    console.info(`[${messageId}] stage: auth`);
    const authResults = await verifyAuth(rawEmlBuffer);

    // Stage 4: GeoIP Enrich
    console.info(`[${messageId}] stage: geoip`);
    const forensicPath = await enrichHopsWithGeo(reverseHopResult.path);

    // Stage 5: HTML De-cloak
    console.info(`[${messageId}] stage: decloak`);
    const decloakResult = decloakHtml(mdm.bodyHtmlRaw);

    // Stage 6: AI Intent Score
    console.info(`[${messageId}] stage: ai-intent`);
    const nlpResult = await scoreIntent(mdm.bodyText);
    nlpResult.glasswormFlag = decloakResult.glasswormFlag;
    nlpResult.zeroWidthCharCount = decloakResult.zeroWidthCharCount;

    // Stage 7: Identity Score
    console.info(`[${messageId}] stage: identity`);
    const senderDomain = mdm.from.address.includes('@')
      ? (mdm.from.address.split('@').pop() ?? mdm.from.address)
      : mdm.from.address;
    const identityResult = scoreIdentity(senderDomain, protectedDomains);

    // Stage 8: IP Reputation
    console.info(`[${messageId}] stage: ip-reputation`);
    const originatingIp = reverseHopResult.originatingSenderIp ?? '';
    const ipReputationResult = await scoreIpReputation(originatingIp, mdm.date);

    // Stage 9: Aggregate Risk
    console.info(`[${messageId}] stage: risk-engine`);
    const riskMatrix = aggregateRisk(authResults, identityResult, ipReputationResult, nlpResult);

    // Stage 10: Persist + Notify
    console.info(`[${messageId}] stage: persist-notify`);
    const report: AnalysisReport = {
      messageId: messageId,
      senderDomain: senderDomain || 'unknown',
      timestamp: new Date().toISOString(),
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

    console.info(`[${messageId}] pipeline completed successfully. Final Risk Score: ${riskMatrix.finalScore}/100`);
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
