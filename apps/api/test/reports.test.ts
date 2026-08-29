import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { reportsRouter } from '../src/routes/reports.js';
import { errorHandler } from '../src/middleware/error.js';
import type { AddressInfo } from 'net';
import type { AnalysisReport } from '@mailiac/shared-types';

vi.mock('@mailiac/db', () => ({
  connectDb: vi.fn().mockResolvedValue(undefined),
  AnalysisReportModel: {
    findOne: vi.fn(),
  },
  EmailAnalysisRecordModel: {
    find: vi.fn(),
  },
}));

import { connectDb, AnalysisReportModel, EmailAnalysisRecordModel } from '@mailiac/db';

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
});
