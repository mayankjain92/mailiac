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

function coerceToBuffer(val: unknown): Buffer | null {
  if (!val) return null;
  if (Buffer.isBuffer(val)) {
    return val.length > 0 ? val : null;
  }
  if (typeof (val as { value?: (asBuffer?: boolean) => Buffer }).value === 'function') {
    const buf = (val as { value: (asBuffer?: boolean) => Buffer }).value(true);
    if (Buffer.isBuffer(buf) && buf.length > 0) return buf;
  }
  if ((val as { buffer?: unknown }).buffer) {
    const inner = (val as { buffer: unknown }).buffer;
    if (Buffer.isBuffer(inner) && inner.length > 0) return inner;
    if (inner instanceof Uint8Array && inner.byteLength > 0) {
      return Buffer.from(inner.buffer, inner.byteOffset, inner.byteLength);
    }
  }
  if (Array.isArray((val as { data?: unknown[] }).data)) {
    const arr = (val as { data: number[] }).data;
    if (arr.length > 0) return Buffer.from(arr);
  }
  if (val instanceof Uint8Array && val.byteLength > 0) {
    return Buffer.from(val.buffer, val.byteOffset, val.byteLength);
  }
  return null;
}

async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { messageId, source, gmailMessageId } = job.data;

  try {
    const rawEmlBuffer = coerceToBuffer(job.data.buffer);
    if (!rawEmlBuffer || rawEmlBuffer.length === 0) {
      throw new Error('Invalid EML input: buffer is empty');
    }

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

