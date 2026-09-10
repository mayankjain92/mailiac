import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import {
  connectDb,
  AnalysisReportModel,
  EmailAnalysisRecordModel,
  AnalystFeedbackModel,
  RawEmailModel,
  DomainIntelligenceModel,
} from '@mailiac/db';
import { generateForensicPdf } from '@mailiac/reporting-pdf';
import { emailQueue } from '../queue.js';
import type { AnalysisReport } from '@mailiac/shared-types';
import { getOAuthClient } from '../services/googleAuth.js';
import { fetchRawMessage } from '../services/gmailClient.js';
import { resolveSessionId, findConnectedAccount } from './gmail.js';
import { requireAuth } from '../middleware/auth.js';

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

async function safelyQueryLean<T = Record<string, unknown>>(query: unknown): Promise<T | null> {
  if (!query) return null;
  try {
    if (typeof (query as { lean?: unknown }).lean === 'function') {
      return (await (query as { lean: () => Promise<T | null> }).lean()) ?? null;
    }
    return (await (query as Promise<T | null>)) ?? null;
  } catch {
    return null;
  }
}

export const reportsRouter: IRouter = Router();

/**
 * GET /api/reports/history
 * Returns a paginated/filtered list of recent forensic email analysis records (.eml and Gmail).
 * Scoped to the authenticated user when logged in.
 */
reportsRouter.get('/reports/history', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    const pageNum = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
    const rawLimit = parseInt(String(req.query['limit'] ?? '25'), 10) || 25;
    const limitNum = Math.min(Math.max(1, rawLimit), 100);
    const skip = (pageNum - 1) * limitNum;

    const source = typeof req.query['source'] === 'string' ? req.query['source'].trim().toLowerCase() : undefined;
    const verdict = typeof req.query['verdict'] === 'string' ? req.query['verdict'].trim().toUpperCase() : undefined;
    const q = typeof req.query['q'] === 'string' ? req.query['q'].trim() : undefined;

    const filter: Record<string, unknown> = {
      userId: req.user!.id,
    };

    if (source && source !== 'all') {
      if (source === 'eml' || source === 'gmail') {
        filter['source'] = source;
      } else {
        res.status(400).json({ error: "Invalid source filter. Must be 'all', 'gmail', or 'eml'." });
        return;
      }
    }

    if (verdict && verdict !== 'all') {
      if (verdict === 'QUARANTINE' || verdict === 'FLAG' || verdict === 'SAFE') {
        filter['verdict'] = verdict;
      } else {
        res.status(400).json({ error: "Invalid verdict filter. Must be 'all', 'QUARANTINE', 'FLAG', or 'SAFE'." });
        return;
      }
    }

    if (q) {
      const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedQuery, 'i');
      filter['$or'] = [
        { subject: regex },
        { sender: regex },
        { senderDomain: regex },
      ];
    }

    const hasSkip = (q: unknown): q is { skip: (n: number) => typeof queryBuilder } =>
      typeof (q as { skip?: unknown })?.skip === 'function';

    let queryBuilder = EmailAnalysisRecordModel.find(filter).sort({ createdAt: -1 });
    if (hasSkip(queryBuilder)) {
      queryBuilder = queryBuilder.skip(skip);
    }
    const queryPromise = queryBuilder.limit(limitNum).lean();

    const countPromise =
      typeof EmailAnalysisRecordModel.countDocuments === 'function'
        ? EmailAnalysisRecordModel.countDocuments(filter)
        : Promise.resolve(0);

    const [rawTotal, records] = await Promise.all([countPromise, queryPromise]);
    const total = rawTotal > 0 ? rawTotal : (Array.isArray(records) ? records.length : 0);
    const totalPages = Math.ceil(total / limitNum) || (records.length > 0 ? 1 : 0);

    const sanitizedRecords = records.map((rec) => {
      const copy = { ...rec } as Record<string, unknown>;
      delete copy['_id'];
      delete copy['__v'];
      return copy;
    });

    res.json({
      records: sanitizedRecords,
      total,
      page: pageNum,
      totalPages,
    });
  } catch (err) {
    next(err);
  }
});

reportsRouter.get('/reports/:id', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawId = req.params['id'];
    if (!rawId || typeof rawId !== 'string' || rawId.trim() === '') {
      res.status(400).json({ error: 'Report ID is required.' });
      return;
    }

    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    const caseId = rawId.trim();
    const decodedId = decodeURIComponent(caseId);
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(caseId);

    const idConditions: Record<string, unknown>[] = [
      { messageId: caseId },
      { messageId: decodedId },
    ];
    if (isObjectId) {
      idConditions.push({ _id: caseId });
    }

    const reportDoc = await safelyQueryLean(
      AnalysisReportModel.findOne({
        $or: idConditions,
      })
    );

    if (!reportDoc) {
      // Check if this case exists in audit history or raw email storage
      const emailRecord = await safelyQueryLean(
        EmailAnalysisRecordModel.findOne({
          $or: [{ jobId: caseId }, { jobId: decodedId }],
        })
      );

      if (emailRecord) {
        if (emailRecord['userId'] && req.user!.id !== emailRecord['userId']) {
          res.status(403).json({ error: 'Access denied. You do not have permission to view this report.' });
          return;
        }

        res.status(404).json({
          error: 'Forensic report has expired from 24h cache.',
          expired: true,
          canReanalyze: true,
          caseId: emailRecord['jobId'],
          subject: emailRecord['subject'],
          sender: emailRecord['sender'],
        });
        return;
      }

      const rawEmailDoc = await safelyQueryLean(
        RawEmailModel.findOne({
          $or: [{ messageId: caseId }, { messageId: decodedId }],
        })
      );

      if (rawEmailDoc) {
        if (rawEmailDoc['userId'] && req.user!.id !== rawEmailDoc['userId']) {
          res.status(403).json({ error: 'Access denied. You do not have permission to view this report.' });
          return;
        }

        res.status(404).json({
          error: 'Forensic report has expired from 24h cache.',
          expired: true,
          canReanalyze: true,
          caseId: rawEmailDoc['messageId'],
        });
        return;
      }

      res.status(404).json({ error: 'Report not found.' });
      return;
    }

    // Ownership Enforcement: If report is user-owned and caller is not the owner
    if (reportDoc['userId'] && req.user!.id !== reportDoc['userId']) {
      res.status(403).json({ error: 'Access denied. You do not have permission to view this report.' });
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

reportsRouter.get('/reports/:id/pdf', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawId = req.params['id'];
    if (!rawId || typeof rawId !== 'string' || rawId.trim() === '') {
      res.status(400).json({ error: 'Report ID is required.' });
      return;
    }

    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    const caseId = rawId.trim();
    const decodedId = decodeURIComponent(caseId);
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(caseId);

    const idConditions: Record<string, unknown>[] = [
      { messageId: caseId },
      { messageId: decodedId },
    ];
    if (isObjectId) {
      idConditions.push({ _id: caseId });
    }

    const reportDoc = await AnalysisReportModel.findOne({
      $or: idConditions,
    }).lean<Record<string, unknown> | null>();

    if (!reportDoc) {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }

    // Ownership Enforcement: If report is user-owned and caller is not the owner
    if (reportDoc['userId'] && req.user!.id !== reportDoc['userId']) {
      res.status(403).json({ error: 'Access denied. You do not have permission to download this report.' });
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
reportsRouter.post('/reports/:id/feedback', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

    const caseId = rawId.trim();
    const reportDoc = await AnalysisReportModel.findOne({
      $or: [{ messageId: caseId }, { messageId: decodeURIComponent(caseId) }],
    }).lean<Record<string, unknown> | null>();

    if (reportDoc && reportDoc['userId'] && req.user!.id !== reportDoc['userId']) {
      res.status(403).json({ error: 'Access denied. You do not have permission to submit feedback on this report.' });
      return;
    }

    const targetUserId = req.user!.id;

    const feedbackDoc = await AnalystFeedbackModel.findOneAndUpdate(
      { jobId: caseId },
      {
        jobId: caseId,
        userId: targetUserId,
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
reportsRouter.get('/reports/:id/feedback', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawId = req.params['id'];
    if (!rawId || typeof rawId !== 'string' || rawId.trim() === '') {
      res.status(400).json({ error: 'Report ID is required.' });
      return;
    }

    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    const feedbackDoc = await AnalystFeedbackModel.findOne({ jobId: rawId.trim() }).lean();

    if (!feedbackDoc) {
      res.json({ feedback: null });
      return;
    }

    if (feedbackDoc.userId && req.user!.id !== feedbackDoc.userId) {
      res.status(403).json({ error: 'Access denied. You do not have permission to view this feedback.' });
      return;
    }

    res.json({
      feedback: feedbackDoc,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/reports/:id/reanalyze
 * Re-runs the complete forensic pipeline for an existing case in-place without creating duplicates.
 */
reportsRouter.post('/reports/:id/reanalyze', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

    // 1. Verify the existing analysis exists and ownership
    const existingReport = await safelyQueryLean(
      AnalysisReportModel.findOne({
        $or: [{ messageId: caseId }, { messageId: decodedId }],
      })
    );

    let canonicalMessageId = (existingReport?.['messageId'] as string) || caseId;
    let fallbackEmailRecord: Record<string, unknown> | null = null;
    let fallbackRawEmailDoc: Record<string, unknown> | null = null;

    if (!existingReport) {
      // Check if case exists in audit history or raw email storage (handles expired 24h reports)
      fallbackEmailRecord = await safelyQueryLean(
        EmailAnalysisRecordModel.findOne({
          $or: [{ jobId: caseId }, { jobId: decodedId }],
        })
      );

      if (!fallbackEmailRecord) {
        fallbackRawEmailDoc = await safelyQueryLean(
          RawEmailModel.findOne({
            $or: [{ messageId: caseId }, { messageId: decodedId }],
          })
        );
      }

      if (!fallbackEmailRecord && !fallbackRawEmailDoc) {
        res.status(404).json({ error: 'Report not found. Cannot re-analyze non-existent case.' });
        return;
      }

      const ownerUserId =
        (fallbackEmailRecord?.['userId'] as string | undefined) ||
        (fallbackRawEmailDoc?.['userId'] as string | undefined);

      if (ownerUserId && req.user!.id !== ownerUserId) {
        res.status(403).json({ error: 'Access denied. You do not have permission to re-analyze this report.' });
        return;
      }

      canonicalMessageId =
        (fallbackEmailRecord?.['jobId'] as string | undefined) ||
        (fallbackRawEmailDoc?.['messageId'] as string | undefined) ||
        caseId;
    } else {
      if (existingReport['userId'] && req.user!.id !== existingReport['userId']) {
        res.status(403).json({ error: 'Access denied. You do not have permission to re-analyze this report.' });
        return;
      }
    }

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
    const rawEmailDoc = fallbackRawEmailDoc || (await safelyQueryLean(RawEmailModel.findOne({ messageId: canonicalMessageId })));
    if (rawEmailDoc) {
      rawBuffer = coerceToBuffer(rawEmailDoc['buffer']);
      source = (rawEmailDoc['source'] as 'eml' | 'gmail') || source;
      gmailMessageId = (rawEmailDoc['gmailMessageId'] as string | undefined) || gmailMessageId;
    }

    // 3b. Fallback to BullMQ Redis job data if not found in MongoDB
    if (!rawBuffer && existingJob?.data) {
      rawBuffer = coerceToBuffer(existingJob.data.buffer);
      source = existingJob.data.source || source;
      gmailMessageId = existingJob.data.gmailMessageId || gmailMessageId;
    }

    // 3c. If still not found, check EmailAnalysisRecordModel for metadata
    if (!gmailMessageId) {
      const emailRecord = fallbackEmailRecord || (await safelyQueryLean(EmailAnalysisRecordModel.findOne({ jobId: canonicalMessageId })));
      if (emailRecord) {
        source = (emailRecord['source'] as 'eml' | 'gmail') || source;
        gmailMessageId = (emailRecord['gmailMessageId'] as string | undefined) || gmailMessageId;
      }
    }

    // 3d. Fallback: If source is Gmail and buffer is missing from storage, re-fetch live message from Gmail API
    // strictly scoped to the requesting user's Gmail connection
    if (!rawBuffer && source === 'gmail' && gmailMessageId) {
      try {
        const account = await findConnectedAccount(req.user?.id, resolveSessionId(req));
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
        expired: true,
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
          userId: req.user!.id,
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
        userId: req.user!.id,
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

/**
 * DELETE /api/reports/:id
 * Deletes a forensic report and associated analysis records owned by the authenticated user.
 */
reportsRouter.delete('/reports/:id', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawId = req.params['id'];
    if (!rawId || typeof rawId !== 'string' || rawId.trim() === '') {
      res.status(400).json({ error: 'Report ID is required.' });
      return;
    }

    const caseId = rawId.trim();
    const decodedId = decodeURIComponent(caseId);
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(caseId);

    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    const idConditions: Record<string, unknown>[] = [
      { messageId: caseId },
      { messageId: decodedId },
    ];
    if (isObjectId) {
      idConditions.push({ _id: caseId });
    }

    const report = await AnalysisReportModel.findOne({ $or: idConditions }).lean<Record<string, unknown> | null>();
    let reportMessageId = report ? (report['messageId'] as string) : undefined;

    if (!report) {
      const emailRecordConditions: Record<string, unknown>[] = [
        { jobId: caseId },
        { jobId: decodedId },
      ];
      if (isObjectId) {
        emailRecordConditions.push({ _id: caseId });
      }
      const emailRecord = await EmailAnalysisRecordModel.findOne({ $or: emailRecordConditions }).lean();
      if (!emailRecord) {
        res.status(404).json({ error: 'Report not found.' });
        return;
      }
      if (emailRecord.userId && emailRecord.userId !== req.user!.id) {
        res.status(403).json({ error: 'Access denied. You do not have permission to delete this report.' });
        return;
      }
      reportMessageId = emailRecord.jobId;
    } else {
      if (report['userId'] && report['userId'] !== req.user!.id) {
        res.status(403).json({ error: 'Access denied. You do not have permission to delete this report.' });
        return;
      }
    }

    // Delete all associated records scoped strictly to the authenticated user's ID
    if (report) {
      await AnalysisReportModel.deleteOne({ _id: report['_id'], userId: req.user!.id });
    }
    if (reportMessageId) {
      await AnalysisReportModel.deleteMany({ messageId: reportMessageId, userId: req.user!.id });
      await EmailAnalysisRecordModel.deleteMany({ jobId: reportMessageId, userId: req.user!.id });
      await RawEmailModel.deleteMany({ messageId: reportMessageId, userId: req.user!.id });
      await AnalystFeedbackModel.deleteMany({ jobId: reportMessageId, userId: req.user!.id });
    }

    res.json({ success: true, message: 'Report deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/domain/:domain
 * Returns domain registration & RDAP intelligence from database cache.
 */
reportsRouter.get('/domain/:domain', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawDomain = req.params['domain'];
    if (!rawDomain) {
      res.status(400).json({ error: 'Domain parameter is required' });
      return;
    }

    const normalized = rawDomain.trim().toLowerCase().replace(/\.+$/, '');
    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    const intel = await DomainIntelligenceModel.findOne({
      $or: [{ domain: normalized }, { registrableDomain: normalized }],
    }).lean();

    if (!intel) {
      res.status(404).json({
        domain: normalized,
        found: false,
        message: 'Domain intelligence not found in forensic cache',
      });
      return;
    }

    res.json({
      domain: intel.domain,
      registrableDomain: intel.registrableDomain,
      registration: intel.registration,
      registrar: intel.registrar,
      rdap: intel.rdap,
      age: intel.age,
      updatedAt: intel.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});


