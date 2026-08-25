import { Router, type IRouter } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { emailQueue } from '../queue.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

export const uploadRouter: IRouter = Router();


uploadRouter.post('/upload', upload.single('eml'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded. Send an EML file as the "eml" field.' });
    return;
  }

  const messageId = randomUUID();

  await emailQueue.add('process-email', {
    messageId,
    buffer: req.file.buffer,
  });

  res.status(202).json({ jobId: messageId });
});
