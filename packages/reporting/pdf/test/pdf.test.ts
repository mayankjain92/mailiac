import { describe, it, expect } from 'vitest';
import { generateForensicPdf } from '../src/index.js';
import type { AnalysisReport } from '@mailiac/shared-types';

describe('generateForensicPdf', () => {
  it('should generate a valid PDF Buffer starting with %PDF-1.4 header', async () => {
    const mockReport: AnalysisReport = {
      messageId: '<msg-12345@phish.test>',
      senderDomain: 'paypal-verify-login.com',
      timestamp: '2026-08-27T20:00:00.000Z',
      executionTimeMs: 142,
      forensicPath: [
        {
          ip: '185.220.101.4',
          hostnameClaimed: 'relay.tor-exit.org',
          ptrValid: false,
          isPrivate: false,
          country: 'US',
          trusted: false,
        },
      ],
      authResults: {
        spf: 'fail',
        dkim: 'fail',
        dmarcAlignment: 'fail',
        arcPass: false,
        authScore: 85,
        findings: [
          {
            type: 'SPF_FAIL',
            severity: 'HIGH',
            description: 'SPF alignment failed for sender domain paypal-verify-login.com',
          },
        ],
      },
      riskMatrix: {
        authScore: 85,
        identityScore: 90,
        ipScore: 30,
        nlpScore: 80,
        finalScore: 88,
        quarantineOverride: true,
        pillars: {
          authentication: {
            score: 85,
            weight: 0.2,
            findings: [
              {
                type: 'SPF_FAIL',
                severity: 'HIGH',
                description: 'SPF alignment failed',
              },
            ],
          },
          identity: {
            score: 90,
            weight: 0.35,
            findings: [
              {
                type: 'HOMOGLYPH_MATCH',
                severity: 'HIGH',
                description: 'Homoglyph domain match detected for protected domain paypal.com',
              },
            ],
          },
          infrastructure: {
            score: 30,
            weight: 0.1,
            findings: [],
          },
          nlp: {
            score: 80,
            weight: 0.35,
            findings: [
              {
                type: 'URGENT_CALL_TO_ACTION',
                severity: 'MEDIUM',
                description: 'High urgency financial request detected by AI model',
              },
            ],
          },
        },
      },
      aiSummary: {
        provider: 'gemini',
        providerStatus: 'success',
        model: 'gemini-3.6-flash',
        urgency: 85,
        intent: ['financial_phishing', 'credential_harvesting'],
        integrityHash: 'sha256-sig-test-123456789',
        confidence: 0.95,
        findings: [],
      },
    };

    const pdfBuffer = await generateForensicPdf(mockReport);
    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(500);

    const pdfString = pdfBuffer.toString('ascii');
    expect(pdfString).toContain('%PDF-1.4');
    expect(pdfString).toContain('MAILIAC FORENSIC REPORT');
    expect(pdfString).toContain('<msg-12345@phish.test>');
    expect(pdfString).toContain('paypal-verify-login.com');
    expect(pdfString).toContain('%%EOF');
  });

  it('handles empty / partial report properties safely', async () => {
    const emptyReport = {} as unknown as AnalysisReport;
    const pdfBuffer = await generateForensicPdf(emptyReport);
    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.toString('ascii')).toContain('%PDF-1.4');
  });
});
