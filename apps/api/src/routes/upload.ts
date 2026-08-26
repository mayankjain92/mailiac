import { Router, type IRouter } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { emailQueue } from '../queue.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

export const uploadRouter: IRouter = Router();

uploadRouter.post('/upload', upload.single('eml'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded. Send an EML file as the "eml" field.' });
      return;
    }

    const filename = req.file.originalname.toLowerCase();
    const mimetype = req.file.mimetype.toLowerCase();

    const isValidExtension = filename.endsWith('.eml');
    const isValidMime =
      mimetype === 'message/rfc822' ||
      mimetype === 'application/octet-stream' ||
      mimetype === 'text/plain' ||
      mimetype === 'message/global' ||
      mimetype === 'application/eml';

    if (!isValidExtension && !isValidMime) {
      res.status(400).json({ error: 'Invalid file type. File must have a .eml extension or message/rfc822 MIME type.' });
      return;
    }

    const messageId = randomUUID();

    await emailQueue.add(
      'process-email',
      {
        messageId,
        buffer: req.file.buffer,
      },
      { jobId: messageId }
    );

    res.status(202).json({ jobId: messageId });
  } catch (err) {
    next(err);
  }
});
