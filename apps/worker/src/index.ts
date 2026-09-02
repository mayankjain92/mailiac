import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.env['GEMINI_API_KEY'] || !process.env['MONGODB_URI']) {
  const __filename = fileURLToPath(import.meta.url);
  let currentDir = path.dirname(__filename);
  while (currentDir !== path.parse(currentDir).root) {
    const envCandidate = path.join(currentDir, '.env');
    if (fs.existsSync(envCandidate)) {
      dotenv.config({ path: envCandidate });
      break;
    }
    currentDir = path.dirname(currentDir);
  }
}

import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { runForensicPipeline } from './pipeline.js';

export { runForensicPipeline };

interface EmailJobData {
  messageId: string;
  buffer: Buffer;
  source?: 'eml' | 'gmail';
  gmailMessageId?: string;
}

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
const protectedDomains = (process.env['PROTECTED_DOMAINS'] ?? 'target-corp.com,paypal.com,google.com,microsoft.com').split(',');

const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { messageId, source, gmailMessageId } = job.data;

  try {
    const rawEmlBuffer = Buffer.isBuffer(job.data.buffer)
      ? job.data.buffer
      : Buffer.from((job.data.buffer as unknown as { data: number[] }).data || []);

    await runForensicPipeline(messageId, rawEmlBuffer, {
      mongoUri,
      protectedDomains,
      source,
      gmailMessageId,
    });
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

