import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.env['GEMINI_API_KEY'] && !process.env['MONGODB_URI']) {
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

import express, { type Application } from 'express';
import { uploadRouter } from './routes/upload.js';
import { jobsRouter } from './routes/jobs.js';
import { reportsRouter } from './routes/reports.js';
import { notifyRouter } from './routes/notify.js';
import { errorHandler } from './middleware/error.js';
import { connectDb } from '@mailiac/db';

const app: Application = express();

app.use(express.json());

app.use('/api', uploadRouter);
app.use('/api', jobsRouter);
app.use('/api', reportsRouter);
app.use('/api', notifyRouter);

app.use(errorHandler);

const port = process.env['PORT'] ?? 4000;

if (process.env['NODE_ENV'] !== 'test') {
  const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
  connectDb(mongoUri)
    .then(() => {
      console.info('[api] connected to MongoDB');
      app.listen(port, () => {
        console.info(`[api] listening on port ${port}`);
      });
    })
    .catch((err: unknown) => {
      console.error('[api] DB connection error:', err);
    });
}

export { app };
