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

// Reference all stubs so TypeScript doesn't warn about unused imports.
// Remove these void-refs once you implement each stage.
void parseEmlToMdm;
void decloakHtml;
void enrichHopsWithGeo;
void scoreIntent;
void traceReverseHops;
void verifyAuth;
void scoreIdentity;
void scoreIpReputation;
void aggregateRisk;
void signPayload;
void generateForensicPdf;

// ---------------------------------------------------------------------------
// BullMQ Worker
// ---------------------------------------------------------------------------

interface EmailJobData {
  messageId: string;
  buffer: Buffer;
}

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { messageId } = job.data;

  try {
    // Stage 1: MIME Parse
    console.info(`[${messageId}] stage: mime-parse`);
    // await parseEmlToMdm(job.data.buffer);

    // Stage 2: Reverse-Hop Trace
    console.info(`[${messageId}] stage: reverse-hop`);
    // await traceReverseHops(mdm.receivedHeadersRaw);

    // Stage 3: Crypto Auth Verification
    console.info(`[${messageId}] stage: auth`);
    // await verifyAuth(job.data.buffer);

    // Stage 4: GeoIP Enrich
    console.info(`[${messageId}] stage: geoip`);
    // await enrichHopsWithGeo(reverseHopResult.path);

    // Stage 5: HTML De-cloak
    console.info(`[${messageId}] stage: decloak`);
    // decloakHtml(mdm.bodyHtmlRaw);

    // Stage 6: AI Intent Score
    console.info(`[${messageId}] stage: ai-intent`);
    // await scoreIntent(mdm.bodyText);

    // Stage 7: Identity Score
    console.info(`[${messageId}] stage: identity`);
    // scoreIdentity(senderDomain, protectedDomains);

    // Stage 8: IP Reputation
    console.info(`[${messageId}] stage: ip-reputation`);
    // await scoreIpReputation(originatingSenderIp, mdm.date);

    // Stage 9: Aggregate Risk
    console.info(`[${messageId}] stage: risk-engine`);
    // aggregateRisk(auth, identity, ip, nlp);

    // Stage 10: Persist + Notify
    console.info(`[${messageId}] stage: persist-notify`);
    // await AnalysisReportModel.create(report);
    // signPayload(JSON.stringify(report), signingSecret, Date.now());

    // Stage 11: PDF Report
    console.info(`[${messageId}] stage: pdf`);
    // await generateForensicPdf(report);

    console.info(`[${messageId}] pipeline complete (stub — no stages executed yet)`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[${messageId}] pipeline failed: ${reason}`);
    throw err; // BullMQ will mark the job as failed
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
