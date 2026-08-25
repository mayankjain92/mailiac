import express, { type Application } from 'express';
import { uploadRouter } from './routes/upload.js';
import { jobsRouter } from './routes/jobs.js';
import { reportsRouter } from './routes/reports.js';
import { errorHandler } from './middleware/error.js';

const app: Application = express();

app.use(express.json());

app.use('/api', uploadRouter);
app.use('/api', jobsRouter);
app.use('/api', reportsRouter);

app.use(errorHandler);

const port = process.env['PORT'] ?? 4000;

if (process.env['NODE_ENV'] !== 'test') {
  app.listen(port, () => {
    console.info(`[api] listening on port ${port}`);
  });
}

export { app };
