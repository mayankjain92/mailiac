import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { connectDb, AnalysisReportModel } from '@mailiac/db';
import { generateForensicPdf } from '@mailiac/reporting-pdf';
import type { AnalysisReport } from '@mailiac/shared-types';

export const reportsRouter: IRouter = Router();

reportsRouter.get('/reports/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawId = req.params['id'];
    if (!rawId || typeof rawId !== 'string' || rawId.trim() === '') {
      res.status(400).json({ error: 'Report ID is required.' });
      return;
    }

    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    const decodedId = decodeURIComponent(rawId);

    const reportDoc = await AnalysisReportModel.findOne({
      $or: [{ messageId: rawId }, { messageId: decodedId }],
    }).lean<Record<string, unknown> | null>();

    if (!reportDoc) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }

    delete reportDoc['_id'];
    delete reportDoc['__v'];
    delete reportDoc['expireAt'];

    res.json(reportDoc as unknown as AnalysisReport);
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/reports/:id/pdf', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawId = req.params['id'];
    if (!rawId || typeof rawId !== 'string' || rawId.trim() === '') {
      res.status(400).json({ error: 'Report ID is required.' });
      return;
    }

    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    const decodedId = decodeURIComponent(rawId);

    const reportDoc = await AnalysisReportModel.findOne({
      $or: [{ messageId: rawId }, { messageId: decodedId }],
    }).lean<Record<string, unknown> | null>();

    if (!reportDoc) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }

    delete reportDoc['_id'];
    delete reportDoc['__v'];
    delete reportDoc['expireAt'];

    const pdfBuffer = await generateForensicPdf(reportDoc as unknown as AnalysisReport);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="forensic-report-${encodeURIComponent(rawId)}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});
