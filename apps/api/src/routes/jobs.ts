import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { emailQueue } from '../queue.js';

export interface JobStatusResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  failedReason?: string;
}

export const jobsRouter: IRouter = Router();

jobsRouter.get('/jobs/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params['id'];
    if (!id || typeof id !== 'string' || id.trim() === '') {
      res.status(400).json({ error: 'Job ID is required.' });
      return;
    }

    const job = await emailQueue.getJob(id);

    if (!job) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }

    const state = await job.getState();

    const statusMap: Record<string, 'queued' | 'processing' | 'completed' | 'failed'> = {
      waiting: 'queued',
      delayed: 'queued',
      prioritized: 'queued',
      active: 'processing',
      completed: 'completed',
      failed: 'failed',
    };

    const status = statusMap[state] ?? 'queued';

    const response: JobStatusResponse = {
      jobId: job.id ?? id,
      status,
      ...(job.failedReason ? { failedReason: job.failedReason } : {}),
    };

    res.json(response);
  } catch (err) {
    next(err);
  }
});
