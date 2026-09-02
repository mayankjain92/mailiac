import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { connectDb, AnalysisReportModel, EmailAnalysisRecordModel, AnalystFeedbackModel } from '@mailiac/db';
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

/**
 * POST /api/reports/:id/feedback
 * Upserts SOC analyst feedback for a specific forensic report.
 */
reportsRouter.post('/reports/:id/feedback', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawId = req.params['id'];
    if (!rawId || typeof rawId !== 'string' || rawId.trim() === '') {
      res.status(400).json({ error: 'Report ID is required.' });
      return;
    }

    const {
      feedbackMode,
      analystVerdict,
      actualThreatCategory,
      pillarAccuracy,
      suggestedScore,
      userSuspicionLevel,
      userSelectedTriggers,
      notes,
    } = req.body || {};

    const validVerdicts = [
      'CONFIRMED_TRUE_POSITIVE',
      'CONFIRMED_TRUE_NEGATIVE',
      'FALSE_POSITIVE',
      'FALSE_NEGATIVE',
      'MISCLASSIFIED_SEVERITY',
      'USER_ACCURATE',
      'USER_FALSE_ALARM',
      'USER_MISSED_THREAT',
      'USER_UNSURE',
    ];

    if (!analystVerdict || !validVerdicts.includes(analystVerdict)) {
      res.status(400).json({
        error: `Invalid analystVerdict. Must be one of: ${validVerdicts.join(', ')}`,
      });
      return;
    }

    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    const feedbackDoc = await AnalystFeedbackModel.findOneAndUpdate(
      { jobId: rawId.trim() },
      {
        jobId: rawId.trim(),
        feedbackMode: feedbackMode === 'user' ? 'user' : 'expert',
        analystVerdict,
        actualThreatCategory: typeof actualThreatCategory === 'string' ? actualThreatCategory : undefined,
        pillarAccuracy: typeof pillarAccuracy === 'object' && pillarAccuracy !== null ? pillarAccuracy : undefined,
        suggestedScore: typeof suggestedScore === 'number' ? Math.max(0, Math.min(100, suggestedScore)) : undefined,
        userSuspicionLevel: typeof userSuspicionLevel === 'number' ? Math.max(1, Math.min(5, userSuspicionLevel)) : undefined,
        userSelectedTriggers: Array.isArray(userSelectedTriggers) ? userSelectedTriggers.map(String) : undefined,
        notes: typeof notes === 'string' ? notes : undefined,
      },
      { upsert: true, new: true }
    ).lean();

    res.status(200).json({
      success: true,
      feedback: feedbackDoc,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reports/:id/feedback
 * Retrieves previously submitted SOC analyst feedback for a specific forensic report.
 */
reportsRouter.get('/reports/:id/feedback', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawId = req.params['id'];
    if (!rawId || typeof rawId !== 'string' || rawId.trim() === '') {
      res.status(400).json({ error: 'Report ID is required.' });
      return;
    }

    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    const feedbackDoc = await AnalystFeedbackModel.findOne({ jobId: rawId.trim() }).lean();

    res.json({
      feedback: feedbackDoc ?? null,
    });
  } catch (err) {
    next(err);
  }
});

