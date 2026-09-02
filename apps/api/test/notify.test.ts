import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import { notifyRouter, broadcastJobStatus } from '../src/routes/notify.js';
import { errorHandler } from '../src/middleware/error.js';
import type { AddressInfo } from 'net';

describe('SSE Notifications API (GET /api/notify/:jobId, POST /api/notify)', () => {
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let baseUrl: string;

  beforeEach(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', notifyRouter);
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

  it('happy path: establishes SSE stream with text/event-stream headers and receives connected event', async () => {
    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/api/notify/job-test-100`, {
      signal: controller.signal,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toContain('no-cache');

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    if (reader) {
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);
      expect(text).toContain('event: connected');
      expect(text).toContain('"jobId":"job-test-100"');
      expect(text).toContain('"status":"queued"');
    }

    controller.abort();
  });

  it('real-time broadcast: receives job status update broadcast over active SSE stream', async () => {
    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/api/notify/job-broadcast-999`, {
      signal: controller.signal,
    });

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    if (reader) {
      // Read initial connection event
      await reader.read();

      // Trigger status broadcast
      broadcastJobStatus({
        jobId: 'job-broadcast-999',
        status: 'processing',
        progress: 50,
        timestamp: new Date().toISOString(),
      });

      // Read next chunk
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);
      expect(text).toContain('event: job_status');
      expect(text).toContain('"status":"processing"');
      expect(text).toContain('"progress":50');
    }

    controller.abort();
  });

  it('malformed POST /api/notify: returns 400 when missing required fields or invalid status', async () => {
    const res = await fetch(`${baseUrl}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: 'job-1' }), // Missing status
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('required fields');
  });

  it('valid POST /api/notify: broadcasts status event and returns 200 OK', async () => {
    const res = await fetch(`${baseUrl}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: 'job-post-1',
        status: 'completed',
        messageId: '<msg-xyz@example.com>',
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean; broadcasted: { jobId: string; status: string } };
    expect(data.success).toBe(true);
    expect(data.broadcasted.jobId).toBe('job-post-1');
    expect(data.broadcasted.status).toBe('completed');
  });
});
