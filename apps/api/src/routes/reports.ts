import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { connectDb, AnalysisReportModel, EmailAnalysisRecordModel, AnalystFeedbackModel, RawEmailModel, GmailAccountModel } from '@mailiac/db';
import { generateForensicPdf } from '@mailiac/reporting-pdf';
import { emailQueue } from '../queue.js';
import type { AnalysisReport } from '@mailiac/shared-types';
import { getOAuthClient } from '../services/googleAuth.js';
import { fetchRawMessage } from '../services/gmailClient.js';

function coerceToBuffer(val: unknown): Buffer | null {
  if (!val) return null;
  if (Buffer.isBuffer(val)) {
    return val.length > 0 ? val : null;
  }
  // BSON Binary from MongoDB / Mongoose (e.g. from .lean())
  if (typeof (val as { value?: (asBuffer?: boolean) => Buffer }).value === 'function') {
    const buf = (val as { value: (asBuffer?: boolean) => Buffer }).value(true);
    if (Buffer.isBuffer(buf) && buf.length > 0) return buf;
  }
  if ((val as { buffer?: unknown }).buffer) {
    const inner = (val as { buffer: unknown }).buffer;
    if (Buffer.isBuffer(inner) && inner.length > 0) return inner;
    if (inner instanceof Uint8Array && inner.byteLength > 0) {
      return Buffer.from(inner.buffer, inner.byteOffset, inner.byteLength);
    }
  }
  // BullMQ JSON-serialized buffer: { type: 'Buffer', data: number[] }
  if (Array.isArray((val as { data?: unknown[] }).data)) {
    const arr = (val as { data: number[] }).data;
    if (arr.length > 0) return Buffer.from(arr);
  }
  // Standard Uint8Array
  if (val instanceof Uint8Array && val.byteLength > 0) {
    return Buffer.from(val.buffer, val.byteOffset, val.byteLength);
  }
  return null;
}

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

/**
 * POST /api/reports/:id/reanalyze
 * Re-runs the complete forensic pipeline for an existing case in-place without creating duplicates.
 */
reportsRouter.post('/reports/:id/reanalyze', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawId = req.params['id'];
    if (!rawId || typeof rawId !== 'string' || rawId.trim() === '') {
      res.status(400).json({ error: 'Report ID is required.' });
      return;
    }

    const caseId = rawId.trim();
    const decodedId = decodeURIComponent(caseId);

    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    // 1. Verify the existing analysis exists
    const existingReport = await AnalysisReportModel.findOne({
      $or: [{ messageId: caseId }, { messageId: decodedId }],
    }).lean<Record<string, unknown> | null>();

    if (!existingReport) {
      res.status(404).json({ error: 'Report not found. Cannot re-analyze non-existent case.' });
      return;
    }

    const canonicalMessageId = (existingReport['messageId'] as string) || caseId;

    // 2. Check for concurrent in-flight re-analysis in BullMQ queue
    const existingJob = await emailQueue.getJob(canonicalMessageId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === 'active' || state === 'waiting' || state === 'delayed' || state === 'prioritized') {
        res.status(409).json({
          error: 'Re-analysis is already in progress for this case.',
          jobId: canonicalMessageId,
          status: 'processing',
        });
        return;
      }
    }

    // 3. Retrieve the original canonical EML / raw message bytes
    let rawBuffer: Buffer | null = null;
    let source: 'eml' | 'gmail' = 'eml';
    let gmailMessageId: string | undefined;

    // 3a. First check durable RawEmailModel in MongoDB
    const rawEmailDoc = await RawEmailModel.findOne({ messageId: canonicalMessageId }).lean();
    if (rawEmailDoc) {
      rawBuffer = coerceToBuffer(rawEmailDoc.buffer);
      source = (rawEmailDoc.source as 'eml' | 'gmail') || source;
      gmailMessageId = rawEmailDoc.gmailMessageId || gmailMessageId;
    }

    // 3b. Fallback to BullMQ Redis job data if not found in MongoDB
    if (!rawBuffer && existingJob?.data) {
      rawBuffer = coerceToBuffer(existingJob.data.buffer);
      source = existingJob.data.source || source;
      gmailMessageId = existingJob.data.gmailMessageId || gmailMessageId;
    }

    // 3c. If still not found, check EmailAnalysisRecordModel for metadata
    if (!gmailMessageId) {
      const emailRecord = await EmailAnalysisRecordModel.findOne({ jobId: canonicalMessageId }).lean();
      if (emailRecord) {
        source = (emailRecord.source as 'eml' | 'gmail') || source;
        gmailMessageId = emailRecord.gmailMessageId || gmailMessageId;
      }
    }

    // 3d. Fallback: If source is Gmail and buffer is missing from storage, re-fetch live message from Gmail API
    if (!rawBuffer && source === 'gmail' && gmailMessageId) {
      try {
        const account = await GmailAccountModel.findOne().sort({ updatedAt: -1 }).lean();
        if (account) {
          const auth = getOAuthClient();
          auth.setCredentials({
            access_token: account.accessToken,
            ...(account.refreshToken ? { refresh_token: account.refreshToken } : {}),
          });
          const fetchedBuffer = await fetchRawMessage(auth, gmailMessageId);
          if (fetchedBuffer && fetchedBuffer.length > 0) {
            rawBuffer = fetchedBuffer;
          }
        }
      } catch (gmailFetchErr) {
        console.warn(`[reanalyze] Notice: Could not re-fetch from Gmail:`, gmailFetchErr);
      }
    }

    if (!rawBuffer || rawBuffer.length === 0) {
      res.status(422).json({
        error: 'Original email payload is no longer available in storage for re-analysis.',
      });
      return;
    }

    // 4. If an old completed/failed BullMQ job exists, remove it so BullMQ accepts the re-analysis job under the same ID
    if (existingJob) {
      try {
        await existingJob.remove();
      } catch (rmErr) {
        console.warn(`[reanalyze] Notice: Could not remove previous job ${canonicalMessageId}:`, rmErr);
      }
    }

    // 5. Ensure RawEmailModel has the buffer preserved for future re-analyses
    await RawEmailModel.findOneAndUpdate(
      { messageId: canonicalMessageId },
      {
        $set: {
          messageId: canonicalMessageId,
          buffer: rawBuffer,
          source,
          gmailMessageId,
        },
      },
      { upsert: true }
    );

    // 6. Enqueue the re-analysis job into BullMQ with identical jobId for zero duplicate jobs
    await emailQueue.add(
      'process-email',
      {
        messageId: canonicalMessageId,
        buffer: rawBuffer,
        source,
        gmailMessageId,
        isReanalysis: true,
      },
      { jobId: canonicalMessageId }
    );

    res.status(202).json({
      success: true,
      jobId: canonicalMessageId,
      messageId: canonicalMessageId,
      status: 'queued',
      message: 'Forensic re-analysis scheduled. Results will update in-place upon completion.',
    });
  } catch (err) {
    next(err);
  }
});


