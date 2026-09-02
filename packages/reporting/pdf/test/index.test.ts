import { describe, it, expect } from 'vitest';
import { generateForensicPdf } from '../src/index.js';
import type { AnalysisReport } from '@mailiac/shared-types';

describe('generateForensicPdf', () => {
  const sampleReport: AnalysisReport = {
    messageId: 'e3e148d8-8bab-4328-b225-e3c907c89b72',
    senderDomain: 'aon.com',
    timestamp: '2026-08-27T20:22:21.577Z',
    executionTimeMs: 4374,
    forensicPath: [
      {
        ip: '198.51.100.1',
        hostnameClaimed: 'mail.aon.com',
        ptrValid: true,
        isPrivate: false,
        city: 'Chicago',
        country: 'United States',
        asn: 'AS12345',
        trusted: true,
      },
      {
        ip: '203.0.113.195',
        hostnameClaimed: 'relay.edge.com',
        ptrValid: true,
        isPrivate: false,
        city: 'New York',
        country: 'United States',
        asn: 'AS67890',
        trusted: true,
      },
    ],
    authResults: {
      spf: 'pass',
      dkim: 'pass',
      dmarcAlignment: 'relaxed',
      arcPass: true,
      authScore: 0,
      findings: [
        {
          type: 'SPF_PASS',
          severity: 'INFO',
          description: 'Sender IP matches SPF record for aon.com',
        },
      ],
    },
    riskMatrix: {
      authScore: 0,
      identityScore: 50,
      ipScore: 12,
      nlpScore: 10,
      finalScore: 17,
      pillars: {
        authentication: {
          score: 0,
          weight: 0.3,
          findings: [
            {
              type: 'SPF_PASS',
              severity: 'INFO',
              description: 'Sender IP matches SPF record',
            },
          ],
        },
        identity: {
          score: 50,
          weight: 0.25,
          findings: [
            {
              type: 'DISPLAY_NAME_MISMATCH',
              severity: 'MEDIUM',
              description: 'Display name does not match sender domain',
            },
          ],
        },
        infrastructure: {
          score: 12,
          weight: 0.2,
          findings: [],
        },
        nlp: {
          score: 10,
          weight: 0.25,
          findings: [
            {
              type: 'CONTEXT_ANALYSIS',
              severity: 'INFO',
              description: 'Linguistic patterns match standard benign communications',
            },
          ],
        },
      },
    },
    aiSummary: {
      urgency: 10,
      intent: ['BENIGN'],
      integrityHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      confidence: 0.95,
      findings: [
        {
          type: 'LOW_URGENCY',
          severity: 'INFO',
          description: 'Low detected urgency level',
        },
      ],
      provider: 'gemini',
      providerStatus: 'success'
    },
  };

  it('generates a valid multi-page PDF 1.4 buffer for a sample report', async () => {
    const pdfBuffer = await generateForensicPdf(sampleReport);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    const pdfString = pdfBuffer.toString('binary');
    expect(pdfString.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfString.includes('/Count 6')).toBe(true); // 6 structured pages
    expect(pdfString.includes('%%EOF')).toBe(true);
    expect(pdfString.includes('MAILIAC FORENSIC REPORT')).toBe(true);
    expect(pdfString.includes('e3e148d8-8bab-4328-b225-e3c907c89b72')).toBe(true);
  });

  it('handles malicious reports with high risk score dynamically', async () => {
    const maliciousReport: AnalysisReport = {
      ...sampleReport,
      riskMatrix: {
        ...sampleReport.riskMatrix,
        finalScore: 88,
      },
      aiSummary: {
        ...sampleReport.aiSummary,
        intent: ['CREDENTIAL_HARVESTING'],
        confidence: 0.98,
        urgency: 90,
      },
    };

    const pdfBuffer = await generateForensicPdf(maliciousReport);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    const pdfString = pdfBuffer.toString('binary');
    expect(pdfString.includes('CRITICAL RISK - MALICIOUS')).toBe(true);
    expect(pdfString.includes('CREDENTIAL HARVESTING')).toBe(true);
  });

  it('handles missing or partial report fields gracefully without crashing', async () => {
    const minimalReport = {
      messageId: 'min-123',
      senderDomain: 'test.com',
      timestamp: '2026-08-31T00:00:00Z',
    } as unknown as AnalysisReport;

    const pdfBuffer = await generateForensicPdf(minimalReport);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    const pdfString = pdfBuffer.toString('binary');
    expect(pdfString.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfString.includes('min-123')).toBe(true);
  });
});
