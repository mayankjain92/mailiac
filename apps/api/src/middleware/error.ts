import type { ErrorRequestHandler } from 'express';
import multer from 'multer';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'File size exceeds 20MB limit.' });
      return;
    }
    res.status(400).json({ error: err.message });
    return;
  }

  const message = err instanceof Error ? err.message : 'Internal server error.';
  res.status(500).json({ error: message });
};
