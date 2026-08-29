import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { connectDb, AnalysisReportModel, EmailAnalysisRecordModel } from '@mailiac/db';
import { generateForensicPdf } from '@mailiac/reporting-pdf';
import type { AnalysisReport } from '@mailiac/shared-types';

export const reportsRouter: IRouter = Router();

/**
 * GET /api/reports/history
 * Returns a paginated/filtered list of recent forensic email analysis records (.eml and Gmail).
 */
reportsRouter.get('/reports/history', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    const source = typeof req.query['source'] === 'string' ? req.query['source'] : undefined;
    const verdict = typeof req.query['verdict'] === 'string' ? req.query['verdict'] : undefined;
    const limit = Math.min(Number(req.query['limit'] ?? 50), 100);

    const filter: Record<string, unknown> = {};
    if (source === 'eml' || source === 'gmail') {
      filter['source'] = source;
    }
    if (verdict === 'QUARANTINE' || verdict === 'FLAG' || verdict === 'SAFE') {
      filter['verdict'] = verdict;
    }

    const records = await EmailAnalysisRecordModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const sanitizedRecords = records.map((rec) => {
      const copy = { ...rec } as Record<string, unknown>;
      delete copy['_id'];
      delete copy['__v'];
      return copy;
    });

    res.json({ records: sanitizedRecords });
  } catch (err) {
    next(err);
  }
});

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
