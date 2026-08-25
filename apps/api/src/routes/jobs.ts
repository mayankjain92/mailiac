import { Router, type IRouter } from 'express';
import { emailQueue } from '../queue.js';

export const jobsRouter: IRouter = Router();


jobsRouter.get('/jobs/:id', async (req, res) => {
  const job = await emailQueue.getJob(req.params['id'] ?? '');

  if (!job) {
    res.status(404).json({ error: 'Job not found.' });
    return;
  }

  const state = await job.getState();

  const statusMap: Record<string, 'queued' | 'processing' | 'completed' | 'failed'> = {
    waiting: 'queued',
    delayed: 'queued',
    active: 'processing',
    completed: 'completed',
    failed: 'failed',
    // 'unknown' falls through to default
  };

  const status = statusMap[state] ?? 'queued';

  res.json({ status });
});
