import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runForensicPipeline } from '../src/pipeline.js';
import { clearDomainIntelligenceCache } from '@mailiac/scoring-identity';

const mockDomainDoc: { doc: Record<string, unknown> | null } = { doc: null };

vi.mock('@mailiac/db', () => ({
  connectDb: vi.fn().mockResolvedValue(undefined),
  AnalysisReportModel: {
    findOneAndUpdate: vi.fn().mockImplementation((filter, update) => Promise.resolve({ ...filter, ...update.$set })),
  },
  EmailAnalysisRecordModel: {
    findOneAndUpdate: vi.fn().mockImplementation((filter, update) => Promise.resolve({ ...filter, ...update.$set })),
  },
  RawEmailModel: {
    findOneAndUpdate: vi.fn().mockResolvedValue({}),
  },
  DomainIntelligenceModel: {
    findOne: vi.fn().mockImplementation(() => ({
      lean: vi.fn().mockImplementation(() => Promise.resolve(mockDomainDoc.doc)),
    })),
    findOneAndUpdate: vi.fn().mockImplementation((filter, update) => {
      mockDomainDoc.doc = { ...filter, ...update.$set };
      return Promise.resolve(mockDomainDoc.doc);
    }),
  },
}));

vi.mock('@mailiac/reporting-pdf', () => ({
  generateForensicPdf: vi.fn().mockResolvedValue(Buffer.from('mock-pdf')),
}));

import { DomainIntelligenceModel } from '@mailiac/db';

describe('Worker Forensic Pipeline - Domain Intelligence & RDAP Integration', () => {
  const fixturesDir = path.resolve(__dirname, '../../../packages/parsing/mime/test/fixtures');
  const happyPathEmlPath = path.join(fixturesDir, 'happy-path.eml');
  const rawEmlBuffer = fs.readFileSync(happyPathEmlPath);

  beforeEach(() => {
    clearDomainIntelligenceCache();
    mockDomainDoc.doc = null;
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('enriches email analysis with domain registration findings and caches in MongoDB', async () => {
    // Mock global fetch to return an RDAP registration from 3 days ago (VERY_NEW)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const mockRdap = {
      events: [
        { eventAction: 'registration', eventDate: threeDaysAgo },
        { eventAction: 'expiration', eventDate: '2028-01-01T00:00:00Z' },
      ],
      entities: [
        {
          roles: ['registrar'],
          vcardArray: ['vcard', [['fn', {}, 'text', 'Cloudflare, Inc.']]],
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockRdap,
    } as unknown as Response);

    const report = await runForensicPipeline('test-domain-intel-job-1', rawEmlBuffer);

    expect(report).toBeDefined();
    expect(report.senderDomain).toBeDefined();

    // Verify identity pillar received domain age finding
    const identityFindings = report.riskMatrix.pillars.identity.findings;
    const hasDomainAgeFinding = identityFindings.some(
      (f) => f.type === 'VERY_NEW_DOMAIN' || f.type === 'NEWLY_REGISTERED_DOMAIN'
    );
    expect(hasDomainAgeFinding).toBe(true);

    // Verify MongoDB domain cache was updated
    expect(DomainIntelligenceModel.findOneAndUpdate).toHaveBeenCalled();
  }, 15000);

  it('uses MongoDB cache when available to avoid redundant RDAP lookups', async () => {
    const cachedCreatedAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000); // 20 days ago (NEWLY_REGISTERED)
    mockDomainDoc.doc = {
      domain: 'example.com',
      registrableDomain: 'example.com',
      registration: {
        createdAt: cachedCreatedAt,
        expiresAt: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000),
      },
      registrar: {
        name: 'MarkMonitor Inc.',
      },
      rdap: {
        available: true,
        source: 'https://rdap.markmonitor.com',
        fetchedAt: new Date(),
        httpStatus: 200,
      },
      age: {
        ageDays: 20,
        classification: 'NEWLY_REGISTERED',
      },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const report = await runForensicPipeline('test-cached-intel-job-2', rawEmlBuffer);

    expect(report).toBeDefined();
    const identityFindings = report.riskMatrix.pillars.identity.findings;
    expect(identityFindings.some((f) => f.type === 'NEWLY_REGISTERED_DOMAIN')).toBe(true);

    // Global fetch for RDAP was NOT invoked because MongoDB cache was hit
    expect(fetchSpy).not.toHaveBeenCalled();
  }, 15000);

  it('continues analysis smoothly without crashing when RDAP lookup fails or times out', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network connection timeout'));

    const report = await runForensicPipeline('test-failed-rdap-job-3', rawEmlBuffer);

    expect(report).toBeDefined();
    expect(report.messageId).toBe('test-failed-rdap-job-3');
    // Still produces a complete forensic report with other signals
    expect(report.riskMatrix).toBeDefined();
    expect(report.riskMatrix.finalScore).toBeGreaterThanOrEqual(0);
  }, 15000);
});
