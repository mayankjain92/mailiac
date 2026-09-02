import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { uploadRouter } from '../src/routes/upload.js';
import { errorHandler } from '../src/middleware/error.js';
import type { AddressInfo } from 'net';

vi.mock('../src/queue.js', () => ({
  emailQueue: {
    add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
  },
}));

import { emailQueue } from '../src/queue.js';

describe('POST /api/upload', () => {
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const app = express();
    app.use(express.json());
    app.use('/api', uploadRouter);
    app.use(errorHandler);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    return () => {
      server.close();
    };
  });

  it('happy path: accepts valid .eml file upload and enqueues job', async () => {
    const formData = new FormData();
    const emlContent = 'From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test EML\r\n\r\nHello World';
    const blob = new Blob([emlContent], { type: 'message/rfc822' });
    formData.append('eml', blob, 'sample_phish.eml');

    const res = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(202);
    const data = (await res.json()) as { jobId: string };
    expect(data.jobId).toBeDefined();
    expect(typeof data.jobId).toBe('string');
    expect(emailQueue.add).toHaveBeenCalledWith(
      'process-email',
      expect.objectContaining({
        messageId: data.jobId,
      }),
      { jobId: data.jobId }
    );
  });

  it('malicious/invalid input: rejects non-eml file uploads (e.g. .exe file)', async () => {
    const formData = new FormData();
    const blob = new Blob(['binary executable content'], { type: 'application/x-msdownload' });
    formData.append('eml', blob, 'payload.exe');

    const res = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('Invalid file type');
    expect(emailQueue.add).not.toHaveBeenCalled();
  });

  it('malformed input: rejects requests missing the "eml" file field', async () => {
    const res = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('No file uploaded');
    expect(emailQueue.add).not.toHaveBeenCalled();
  });
});
