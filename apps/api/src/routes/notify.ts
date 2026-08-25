import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { EventEmitter } from 'events';

export interface JobStatusEvent {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  messageId?: string;
  error?: string;
  timestamp: string;
}

// In-memory EventEmitter for real-time SSE job notification dispatch
const notifyEmitter = new EventEmitter();
notifyEmitter.setMaxListeners(500);

/**
 * Broadcasts a real-time status update for a specific job to connected SSE clients.
 */
export function broadcastJobStatus(event: JobStatusEvent): void {
  notifyEmitter.emit(`job:${event.jobId}`, event);
  notifyEmitter.emit('job:*', event);
}

export const notifyRouter: IRouter = Router();

/**
 * SSE route: GET /api/notify/:jobId
 * Streams real-time job status events to frontend client.
 */
notifyRouter.get('/notify/:jobId', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const { jobId } = req.params;
    if (!jobId || typeof jobId !== 'string' || jobId.trim() === '') {
      res.status(400).json({ error: 'Job ID parameter is required.' });
      return;
    }

    // Set Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Initial connection acknowledgement event
    const initialPayload: JobStatusEvent = {
      jobId,
      status: 'queued',
      timestamp: new Date().toISOString(),
    };
    res.write(`event: connected\ndata: ${JSON.stringify(initialPayload)}\n\n`);

    // Event listener callback for specific jobId
    const onJobStatus = (data: JobStatusEvent): void => {
      res.write(`event: job_status\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const channel = `job:${jobId}`;
    notifyEmitter.on(channel, onJobStatus);

    // Keep-alive heartbeat interval (every 15s) to prevent proxies from timing out connection
    const heartbeatTimer = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 15000);

    // Cleanup on client disconnection
    req.on('close', () => {
      clearInterval(heartbeatTimer);
      notifyEmitter.off(channel, onJobStatus);
      res.end();
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Endpoint POST /api/notify
 * Allows internal service or worker to trigger a job status event.
 */
notifyRouter.post('/notify', (req: Request, res: Response): void => {
  const { jobId, status, progress, messageId, error } = req.body as Partial<JobStatusEvent>;

  if (!jobId || !status) {
    res.status(400).json({ error: 'jobId and status are required fields.' });
    return;
  }

  const validStatuses = ['queued', 'processing', 'completed', 'failed'];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: `Invalid status '${status}'. Must be one of: ${validStatuses.join(', ')}` });
    return;
  }

  const event: JobStatusEvent = {
    jobId,
    status,
    progress,
    messageId,
    error,
    timestamp: new Date().toISOString(),
  };

  broadcastJobStatus(event);
  res.status(200).json({ success: true, broadcasted: event });
});
