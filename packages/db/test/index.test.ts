import { describe, it, expect, vi } from 'vitest';
import {
  AnalysisReportModel,
  GmailAccountModel,
  EmailAnalysisRecordModel,
  type GmailAccount,
} from '../src/index.js';
import type { AnalysisReport } from '@mailiac/shared-types';

describe('packages/db', () => {
  const validReport: AnalysisReport = {
    messageId: '<valid-123@example.com>',
    senderDomain: 'example.com',
    timestamp: '2026-08-25T12:00:00Z',
    forensicPath: [
      {
        ip: '1.2.3.4',
        hostnameClaimed: 'mail.example.com',
        ptrValid: true,
        isPrivate: false,
        city: 'New York',
        country: 'US',
        coordinates: [-74.006, 40.7128],
        asn: 'AS12345',
        trusted: true,
      },
    ],
    authResults: {
      spf: 'pass',
      dkim: 'pass',
      dmarcAlignment: 'strict',
      arcPass: true,
      authScore: 100,
    },
    riskMatrix: {
      authScore: 100,
      identityScore: 100,
      ipScore: 90,
      nlpScore: 85,
      finalScore: 93.75,
    },
    aiSummary: {
      urgency: 1,
      intent: ['informational'],
      integrityHash: 'abc123sha256hash',
    },
  };

  it('validates a correct AnalysisReport document', () => {
    const doc = new AnalysisReportModel(validReport);
    const err = doc.validateSync();
    expect(err).toBeUndefined();
    expect(doc.messageId).toBe('<valid-123@example.com>');
    expect(doc.senderDomain).toBe('example.com');
  });

  it('fails validation when required fields are missing in AnalysisReport', () => {
    const invalidDoc = new AnalysisReportModel({
      messageId: '<invalid@example.com>',
      // missing senderDomain, authResults, etc.
    });
    const err = invalidDoc.validateSync();
    expect(err).toBeDefined();
    expect(err?.errors['senderDomain']).toBeDefined();
    expect(err?.errors['authResults']).toBeDefined();
  });

  it('has indexes defined on messageId and senderDomain', () => {
    const schemaIndexes = AnalysisReportModel.schema.indexes();
    const indexFields = schemaIndexes.map((idx) => Object.keys(idx[0]));
    const hasMessageIdIndex = indexFields.some((keys) => keys.includes('messageId'));
    const hasSenderDomainIndex = indexFields.some((keys) => keys.includes('senderDomain'));
    expect(hasMessageIdIndex).toBe(true);
    expect(hasSenderDomainIndex).toBe(true);
  });

  describe('GmailAccountModel', () => {
    const validAccount: GmailAccount = {
      sessionId: 'sess_12345_abc',
      email: 'analyst@target-corp.com',
      accessToken: 'ya29.a0AfH6SMB...',
      refreshToken: '1//0gD3f9...',
      tokenExpiry: new Date(Date.now() + 3600 * 1000),
    };

    it('validates a correct GmailAccount document', () => {
      const doc = new GmailAccountModel(validAccount);
      const err = doc.validateSync();
      expect(err).toBeUndefined();
      expect(doc.sessionId).toBe('sess_12345_abc');
      expect(doc.email).toBe('analyst@target-corp.com');
      expect(doc.accessToken).toBe('ya29.a0AfH6SMB...');
      expect(doc.refreshToken).toBe('1//0gD3f9...');
      expect(doc.tokenExpiry).toBeInstanceOf(Date);
    });

    it('validates a GmailAccount document without optional refreshToken', () => {
      const { refreshToken, ...accountWithoutRefresh } = validAccount;
      const doc = new GmailAccountModel(accountWithoutRefresh);
      const err = doc.validateSync();
      expect(err).toBeUndefined();
      expect(doc.refreshToken).toBeUndefined();
    });

    it('fails validation when required fields are missing in GmailAccount', () => {
      const invalidDoc = new GmailAccountModel({
        email: 'analyst@target-corp.com',
        // missing sessionId, accessToken, tokenExpiry
      });
      const err = invalidDoc.validateSync();
      expect(err).toBeDefined();
      expect(err?.errors['sessionId']).toBeDefined();
      expect(err?.errors['accessToken']).toBeDefined();
      expect(err?.errors['tokenExpiry']).toBeDefined();
    });

    it('has index defined on sessionId', () => {
      const schemaIndexes = GmailAccountModel.schema.indexes();
      const indexFields = schemaIndexes.map((idx) => Object.keys(idx[0]));
      const hasSessionIdIndex = indexFields.some((keys) => keys.includes('sessionId'));
      expect(hasSessionIdIndex).toBe(true);
    });
  });

  describe('EmailAnalysisRecordModel', () => {
    const validRecord = {
      jobId: 'job-uuid-1234',
      source: 'gmail',
      gmailMessageId: 'msg-gmail-5678',
      sender: 'Billing <billing@corp.com>',
      subject: 'Invoice Attached',
      senderDomain: 'corp.com',
      finalScore: 85,
      verdict: 'QUARANTINE',
      authScore: 30,
      identityScore: 25,
      ipScore: 20,
      nlpScore: 80,
      timestamp: '2026-08-29T10:00:00.000Z',
    };

    it('validates a correct EmailAnalysisRecord document', () => {
      const doc = new EmailAnalysisRecordModel(validRecord);
      const err = doc.validateSync();
      expect(err).toBeUndefined();
      expect(doc.jobId).toBe('job-uuid-1234');
      expect(doc.source).toBe('gmail');
      expect(doc.gmailMessageId).toBe('msg-gmail-5678');
      expect(doc.verdict).toBe('QUARANTINE');
      expect(doc.finalScore).toBe(85);
    });

    it('validates an .eml sourced record without gmailMessageId', () => {
      const { gmailMessageId, ...emlRecord } = { ...validRecord, source: 'eml' };
      const doc = new EmailAnalysisRecordModel(emlRecord);
      const err = doc.validateSync();
      expect(err).toBeUndefined();
      expect(doc.gmailMessageId).toBeUndefined();
      expect(doc.source).toBe('eml');
    });

    it('fails validation on invalid source or verdict', () => {
      const invalidDoc = new EmailAnalysisRecordModel({
        ...validRecord,
        source: 'invalid-source',
        verdict: 'UNKNOWN_VERDICT',
      });
      const err = invalidDoc.validateSync();
      expect(err).toBeDefined();
      expect(err?.errors['source']).toBeDefined();
      expect(err?.errors['verdict']).toBeDefined();
    });

    it('has indexes defined on jobId, gmailMessageId, source, and verdict', () => {
      const schemaIndexes = EmailAnalysisRecordModel.schema.indexes();
      const indexFields = schemaIndexes.map((idx) => Object.keys(idx[0]));

      expect(indexFields.some((keys) => keys.includes('jobId'))).toBe(true);
      expect(indexFields.some((keys) => keys.includes('gmailMessageId'))).toBe(true);
      expect(indexFields.some((keys) => keys.includes('source'))).toBe(true);
      expect(indexFields.some((keys) => keys.includes('verdict'))).toBe(true);

      // Verify sparse option on gmailMessageId index
      const gmailIdx = schemaIndexes.find((idx) => 'gmailMessageId' in idx[0]);
      expect(gmailIdx?.[1]?.sparse).toBe(true);
      expect(gmailIdx?.[1]?.unique).toBe(true);
    });

    it('cleanupDuplicateGmailRecords removes older duplicate records', async () => {
      const mockAggregate = vi.spyOn(EmailAnalysisRecordModel, 'aggregate').mockResolvedValue([
        {
          _id: 'duplicate-gmail-id',
          count: 3,
          docs: [
            { id: 'doc-1', createdAt: new Date('2026-08-29T10:00:00Z') },
            { id: 'doc-3', createdAt: new Date('2026-08-29T12:00:00Z') }, // newest
            { id: 'doc-2', createdAt: new Date('2026-08-29T11:00:00Z') },
          ],
        },
      ] as unknown as ReturnType<typeof EmailAnalysisRecordModel.aggregate>);

      const mockDeleteMany = vi.spyOn(EmailAnalysisRecordModel, 'deleteMany').mockResolvedValue({
        acknowledged: true,
        deletedCount: 2,
      });

      const { cleanupDuplicateGmailRecords } = await import('../src/index.js');
      const result = await cleanupDuplicateGmailRecords();

      expect(mockAggregate).toHaveBeenCalled();
      expect(mockDeleteMany).toHaveBeenCalledWith({
        _id: { $in: ['doc-2', 'doc-1'] },
      });
      expect(result.duplicatesRemoved).toBe(2);
    });
  });
});

