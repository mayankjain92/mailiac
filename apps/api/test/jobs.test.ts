import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { jobsRouter, type JobStatusResponse } from '../src/routes/jobs.js';
import { errorHandler } from '../src/middleware/error.js';
import type { AddressInfo } from 'net';

vi.mock('../src/queue.js', () => ({
  emailQueue: {
    getJob: vi.fn(),
  },
}));

import { emailQueue } from '../src/queue.js';

describe('GET /api/jobs/:id', () => {
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const app = express();
    app.use(express.json());
    app.use('/api', jobsRouter);
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

  it('happy path: returns job status and ID for existing job in queue', async () => {
    const mockJob = {
      id: 'job-123',
      getState: vi.fn().mockResolvedValue('active'),
    };
    (emailQueue.getJob as ReturnType<typeof vi.fn>).mockResolvedValue(mockJob);

    const res = await fetch(`${baseUrl}/api/jobs/job-123`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as JobStatusResponse;
    expect(data.jobId).toBe('job-123');
    expect(data.status).toBe('processing');
  });

  it('failed state: returns status failed and failedReason when job fails', async () => {
    const mockJob = {
      id: 'job-failed-456',
      getState: vi.fn().mockResolvedValue('failed'),
      failedReason: 'MIME parse error: Truncated header block',
    };
    (emailQueue.getJob as ReturnType<typeof vi.fn>).mockResolvedValue(mockJob);

    const res = await fetch(`${baseUrl}/api/jobs/job-failed-456`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as JobStatusResponse;
    expect(data.jobId).toBe('job-failed-456');
    expect(data.status).toBe('failed');
    expect(data.failedReason).toBe('MIME parse error: Truncated header block');
  });

  it('malformed / non-existent job: returns 404 Not Found when job is missing', async () => {
    (emailQueue.getJob as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await fetch(`${baseUrl}/api/jobs/non-existent-job-id`);
    expect(res.status).toBe(404);

    const data = (await res.json()) as { error: string };
    expect(data.error).toBe('Job not found.');
  });
});
