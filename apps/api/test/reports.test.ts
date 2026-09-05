import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { reportsRouter } from '../src/routes/reports.js';
import { errorHandler } from '../src/middleware/error.js';
import type { AddressInfo } from 'net';
import type { AnalysisReport } from '@mailiac/shared-types';

vi.mock('../src/queue.js', () => ({
  emailQueue: {
    getJob: vi.fn(),
    add: vi.fn(),
  },
}));

vi.mock('@mailiac/db', () => ({
  connectDb: vi.fn().mockResolvedValue(undefined),
  AnalysisReportModel: {
    findOne: vi.fn(),
  },
  EmailAnalysisRecordModel: {
    find: vi.fn(),
    findOne: vi.fn(),
  },
  AnalystFeedbackModel: {
    findOneAndUpdate: vi.fn(),
    findOne: vi.fn(),
  },
  RawEmailModel: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

import { connectDb, AnalysisReportModel, EmailAnalysisRecordModel, AnalystFeedbackModel, RawEmailModel } from '@mailiac/db';
import { emailQueue } from '../src/queue.js';

describe('GET /api/reports/:id', () => {
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let baseUrl: string;

  const mockReport: AnalysisReport = {
    messageId: '<msg-123@example.com>',
    senderDomain: 'example.com',
    timestamp: '2026-08-25T12:00:00Z',
    forensicPath: [],
    authResults: {
      spf: 'pass',
      dkim: 'pass',
      dmarcAlignment: 'strict',
      arcPass: true,
      authScore: 100,
      findings: [],
    },
    riskMatrix: {
      authScore: 100,
      identityScore: 100,
      ipScore: 100,
      nlpScore: 100,
      finalScore: 100,
      pillars: {
        authentication: { score: 100, weight: 0.2, findings: [] },
        identity: { score: 100, weight: 0.35, findings: [] },
        infrastructure: { score: 100, weight: 0.1, findings: [] },
        nlp: { score: 100, weight: 0.35, findings: [] },
      },
    },
    aiSummary: {
      provider: 'heuristic',
      providerStatus: 'fallback',
      urgency: 0,
      intent: ['legitimate'],
      integrityHash: 'hash123',
      confidence: 1,
      findings: [],
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const app = express();
    app.use(express.json());
    app.use('/api', reportsRouter);
    app.use(errorHandler);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    return () => {
      server.close();
    };
  });

  it('happy path: connects DB and returns full AnalysisReport for existing messageId', async () => {
    (AnalysisReportModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'mongo-id-1',
        __v: 0,
        expireAt: new Date(),
        ...mockReport,
      }),
    });

    const res = await fetch(`${baseUrl}/api/reports/${encodeURIComponent('<msg-123@example.com>')}`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as AnalysisReport;
    expect(connectDb).toHaveBeenCalled();
    expect(data.messageId).toBe('<msg-123@example.com>');
    expect(data.senderDomain).toBe('example.com');
    expect((data as Record<string, unknown>)._id).toBeUndefined();
    expect((data as Record<string, unknown>).__v).toBeUndefined();
  });

  it('malformed / non-existent report: returns 404 Not Found when report is missing', async () => {
    (AnalysisReportModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });

    const res = await fetch(`${baseUrl}/api/reports/non-existent-msg-id`);
    expect(res.status).toBe(404);

    const data = (await res.json()) as { error: string };
    expect(data.error).toBe('Report not found.');
  });

  it('happy path: GET /api/reports/:id/pdf returns PDF binary with application/pdf header', async () => {
    (AnalysisReportModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'mongo-id-1',
        ...mockReport,
      }),
    });

    const res = await fetch(`${baseUrl}/api/reports/${encodeURIComponent('<msg-123@example.com>')}/pdf`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('inline;');

    const pdfText = await res.text();
    expect(pdfText).toContain('%PDF-1.4');
    expect(pdfText).toContain('MAILIAC FORENSIC REPORT');
  });

  it('PDF endpoint returns 404 when report does not exist', async () => {
    (AnalysisReportModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    });

    const res = await fetch(`${baseUrl}/api/reports/non-existent-msg-id/pdf`);
    expect(res.status).toBe(404);
  });

  describe('GET /api/reports/history', () => {
    it('returns 200 with list of sanitized analysis records', async () => {
      const mockRecords = [
        {
          _id: 'mongo-id-101',
          __v: 0,
          jobId: 'job-1',
          source: 'gmail',
          gmailMessageId: 'gmail-msg-1',
          senderDomain: 'paypal.com',
          finalScore: 85,
          verdict: 'QUARANTINE',
          authScore: 30,
          identityScore: 20,
          ipScore: 10,
          nlpScore: 80,
          timestamp: '2026-08-29T12:00:00Z',
        },
        {
          _id: 'mongo-id-102',
          __v: 0,
          jobId: 'job-2',
          source: 'eml',
          senderDomain: 'github.com',
          finalScore: 5,
          verdict: 'SAFE',
          authScore: 0,
          identityScore: 0,
          ipScore: 0,
          nlpScore: 5,
          timestamp: '2026-08-29T11:00:00Z',
        },
      ];

      (EmailAnalysisRecordModel.find as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue(mockRecords),
          }),
        }),
      });

      const res = await fetch(`${baseUrl}/api/reports/history?source=gmail&limit=10`);
      expect(res.status).toBe(200);

      const data = (await res.json()) as { records: Array<Record<string, unknown>> };
      expect(data.records).toHaveLength(2);
      expect(data.records[0]?.['jobId']).toBe('job-1');
      expect(data.records[0]?.['_id']).toBeUndefined();
      expect(data.records[0]?.['__v']).toBeUndefined();
      expect(EmailAnalysisRecordModel.find).toHaveBeenCalledWith({ source: 'gmail' });
    });
  });

  describe('POST /api/reports/:id/feedback and GET /api/reports/:id/feedback', () => {
    it('POST: returns 200 and saves valid analyst feedback', async () => {
      const mockFeedback = {
        jobId: 'case-999',
        analystVerdict: 'CONFIRMED_TRUE_POSITIVE',
        actualThreatCategory: 'Credential Harvesting',
        suggestedScore: 90,
      };

      (AnalystFeedbackModel.findOneAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockFeedback),
      });

      const res = await fetch(`${baseUrl}/api/reports/case-999/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analystVerdict: 'CONFIRMED_TRUE_POSITIVE',
          actualThreatCategory: 'Credential Harvesting',
          suggestedScore: 90,
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.feedback.jobId).toBe('case-999');
    });

    it('POST: returns 400 when analystVerdict is invalid', async () => {
      const res = await fetch(`${baseUrl}/api/reports/case-999/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analystVerdict: 'INVALID_VERDICT',
        }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Invalid analystVerdict');
    });

    it('POST: returns 200 and saves valid user mode feedback', async () => {
      const mockFeedback = {
        jobId: 'case-888',
        feedbackMode: 'user',
        analystVerdict: 'USER_ACCURATE',
        userSuspicionLevel: 4,
        userSelectedTriggers: ['Unexpected sender address or strange email format'],
      };

      (AnalystFeedbackModel.findOneAndUpdate as ReturnType<typeof vi.fn>).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockFeedback),
      });

      const res = await fetch(`${baseUrl}/api/reports/case-888/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackMode: 'user',
          analystVerdict: 'USER_ACCURATE',
          userSuspicionLevel: 4,
          userSelectedTriggers: ['Unexpected sender address or strange email format'],
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.feedback.feedbackMode).toBe('user');
      expect(json.feedback.analystVerdict).toBe('USER_ACCURATE');
    });

    it('GET: returns existing feedback for a caseId', async () => {
      const mockFeedback = {
        jobId: 'case-999',
        analystVerdict: 'FALSE_POSITIVE',
        suggestedScore: 10,
      };

      (AnalystFeedbackModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockFeedback),
      });

      const res = await fetch(`${baseUrl}/api/reports/case-999/feedback`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.feedback?.analystVerdict).toBe('FALSE_POSITIVE');
    });
  });

  describe('POST /api/reports/:id/reanalyze', () => {
    it('returns 400 when report ID is empty or whitespace', async () => {
      const res = await fetch(`${baseUrl}/api/reports/%20/reanalyze`, { method: 'POST' });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Report ID is required');
    });

    it('returns 404 when report does not exist', async () => {
      (AnalysisReportModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      const res = await fetch(`${baseUrl}/api/reports/non-existent-case/reanalyze`, { method: 'POST' });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain('Report not found');
    });

    it('returns 409 Conflict when re-analysis is already in progress (active/waiting)', async () => {
      (AnalysisReportModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        lean: vi.fn().mockResolvedValue({ messageId: 'active-case-123' }),
      });

      (emailQueue.getJob as ReturnType<typeof vi.fn>).mockResolvedValue({
        getState: vi.fn().mockResolvedValue('active'),
      });

      const res = await fetch(`${baseUrl}/api/reports/active-case-123/reanalyze`, { method: 'POST' });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain('already in progress');
      expect(json.status).toBe('processing');
      expect(json.jobId).toBe('active-case-123');
    });

    it('returns 422 when original payload buffer is completely unavailable', async () => {
      (AnalysisReportModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        lean: vi.fn().mockResolvedValue({ messageId: 'no-buf-case' }),
      });

      (emailQueue.getJob as ReturnType<typeof vi.fn>).mockResolvedValue({
        getState: vi.fn().mockResolvedValue('completed'),
        data: {},
        remove: vi.fn().mockResolvedValue(undefined),
      });

      (RawEmailModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      (EmailAnalysisRecordModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      const res = await fetch(`${baseUrl}/api/reports/no-buf-case/reanalyze`, { method: 'POST' });
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error).toContain('no longer available');
    });

    it('happy path: successfully schedules re-analysis using RawEmailModel buffer', async () => {
      const mockRawBuffer = Buffer.from('From: test@example.com\r\nSubject: Re-test\r\n\r\nBody');

      (AnalysisReportModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        lean: vi.fn().mockResolvedValue({ messageId: 'case-re-123', senderDomain: 'example.com' }),
      });

      const removeJobMock = vi.fn().mockResolvedValue(undefined);
      (emailQueue.getJob as ReturnType<typeof vi.fn>).mockResolvedValue({
        getState: vi.fn().mockResolvedValue('completed'),
        remove: removeJobMock,
      });

      (RawEmailModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          messageId: 'case-re-123',
          buffer: mockRawBuffer,
          source: 'eml',
        }),
      });

      (RawEmailModel.findOneAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (emailQueue.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'case-re-123' });

      const res = await fetch(`${baseUrl}/api/reports/case-re-123/reanalyze`, { method: 'POST' });
      expect(res.status).toBe(202);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.jobId).toBe('case-re-123');
      expect(json.messageId).toBe('case-re-123');
      expect(json.status).toBe('queued');

      expect(removeJobMock).toHaveBeenCalled();
      expect(emailQueue.add).toHaveBeenCalledWith(
        'process-email',
        expect.objectContaining({
          messageId: 'case-re-123',
          isReanalysis: true,
        }),
        { jobId: 'case-re-123' }
      );
    });

    it('happy path: successfully schedules re-analysis using BullMQ job buffer fallback', async () => {
      const mockRawBuffer = Buffer.from('From: test@example.com\r\nSubject: Fallback\r\n\r\nBody');

      (AnalysisReportModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        lean: vi.fn().mockResolvedValue({ messageId: 'case-bull-fallback', senderDomain: 'example.com' }),
      });

      // RawEmailModel has no record
      (RawEmailModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      const removeJobMock = vi.fn().mockResolvedValue(undefined);
      (emailQueue.getJob as ReturnType<typeof vi.fn>).mockResolvedValue({
        getState: vi.fn().mockResolvedValue('completed'),
        data: {
          buffer: mockRawBuffer,
          source: 'gmail',
          gmailMessageId: 'gmail-msg-999',
        },
        remove: removeJobMock,
      });

      (RawEmailModel.findOneAndUpdate as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (emailQueue.add as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'case-bull-fallback' });

      const res = await fetch(`${baseUrl}/api/reports/case-bull-fallback/reanalyze`, { method: 'POST' });
      expect(res.status).toBe(202);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.jobId).toBe('case-bull-fallback');

      expect(RawEmailModel.findOneAndUpdate).toHaveBeenCalledWith(
        { messageId: 'case-bull-fallback' },
        expect.objectContaining({
          $set: expect.objectContaining({
            messageId: 'case-bull-fallback',
            source: 'gmail',
            gmailMessageId: 'gmail-msg-999',
          }),
        }),
        { upsert: true }
      );

      expect(emailQueue.add).toHaveBeenCalledWith(
        'process-email',
        expect.objectContaining({
          messageId: 'case-bull-fallback',
          source: 'gmail',
          gmailMessageId: 'gmail-msg-999',
        }),
        { jobId: 'case-bull-fallback' }
      );
    });
  });
});

