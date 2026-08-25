import { describe, it, expect } from 'vitest';
import { AnalysisReportModel } from '../src/index.js';
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

  it('fails validation when required fields are missing', () => {
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
});
