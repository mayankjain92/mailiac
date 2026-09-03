import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runForensicPipeline } from '../src/pipeline.js';

vi.mock('@mailiac/db', () => ({
  connectDb: vi.fn().mockResolvedValue(undefined),
  AnalysisReportModel: {
    create: vi.fn().mockImplementation((doc) => Promise.resolve(doc)),
    findOneAndUpdate: vi.fn().mockImplementation((filter, update) => Promise.resolve({ ...filter, ...update.$set })),
  },
  EmailAnalysisRecordModel: {
    findOneAndUpdate: vi.fn().mockImplementation((filter, update) => Promise.resolve({ ...filter, ...update.$set })),
  },
  RawEmailModel: {
    findOneAndUpdate: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@mailiac/reporting-pdf', () => ({
  generateForensicPdf: vi.fn().mockResolvedValue(Buffer.from('mock-pdf')),
}));

import { connectDb, AnalysisReportModel, EmailAnalysisRecordModel, RawEmailModel } from '@mailiac/db';

describe('Gmail Ingestion & Pipeline Forensic Parity (apps/worker/test/gmail-ingestion.test.ts)', () => {
  const fixturesDir = path.resolve(__dirname, '../../../packages/parsing/mime/test/fixtures');
  const happyPathEmlPath = path.join(fixturesDir, 'happy-path.eml');
  const maliciousPhishEmlPath = path.join(fixturesDir, 'malicious-phish.eml');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('RFC 822 base64url Decoding Parity', () => {
    it('verifies base64url simulation produces byte-for-byte identical Buffer', () => {
      const originalBuffer = fs.readFileSync(happyPathEmlPath);
      // Simulate Gmail API raw RFC 822 response payload
      const gmailRawBase64url = originalBuffer.toString('base64url');
      // Decode simulated Gmail response as done in fetchRawMessage
      const decodedBuffer = Buffer.from(gmailRawBase64url, 'base64url');

      expect(decodedBuffer.equals(originalBuffer)).toBe(true);
      expect(decodedBuffer.length).toBe(originalBuffer.length);
      expect(decodedBuffer.toString('utf8')).toBe(originalBuffer.toString('utf8'));
    });
  });

  describe('Forensic 4-Pillar Parity (Happy Path)', () => {
    it('produces identical 4-pillar scores and report for direct vs Gmail-ingested email', async () => {
      const directBuffer = fs.readFileSync(happyPathEmlPath);
      const gmailRawBase64url = directBuffer.toString('base64url');
      const gmailDecodedBuffer = Buffer.from(gmailRawBase64url, 'base64url');

      const directReport = await runForensicPipeline('direct-job-001', directBuffer, {
        protectedDomains: ['target-corp.com', 'google.com'],
      });

      const gmailReport = await runForensicPipeline('gmail-job-001', gmailDecodedBuffer, {
        protectedDomains: ['target-corp.com', 'google.com'],
      });

      // 1. Sender domain parity
      expect(gmailReport.senderDomain).toBe(directReport.senderDomain);

      // 2. Auth results parity
      expect(gmailReport.authResults.authScore).toBe(directReport.authResults.authScore);
      expect(gmailReport.authResults.spf).toBe(directReport.authResults.spf);
      expect(gmailReport.authResults.dkim).toBe(directReport.authResults.dkim);
      expect(gmailReport.authResults.dmarcAlignment).toBe(directReport.authResults.dmarcAlignment);
      expect(gmailReport.authResults.arcPass).toBe(directReport.authResults.arcPass);

      // 3. 4-Pillar Risk Matrix Parity
      expect(gmailReport.riskMatrix.authScore).toBe(directReport.riskMatrix.authScore);
      expect(gmailReport.riskMatrix.identityScore).toBe(directReport.riskMatrix.identityScore);
      expect(gmailReport.riskMatrix.ipScore).toBe(directReport.riskMatrix.ipScore);
      expect(gmailReport.riskMatrix.nlpScore).toBe(directReport.riskMatrix.nlpScore);
      expect(gmailReport.riskMatrix.finalScore).toBe(directReport.riskMatrix.finalScore);

      // 4. Pillars internal structure parity
      expect(gmailReport.riskMatrix.pillars.authentication.score).toBe(
        directReport.riskMatrix.pillars.authentication.score
      );
      expect(gmailReport.riskMatrix.pillars.identity.score).toBe(
        directReport.riskMatrix.pillars.identity.score
      );
      expect(gmailReport.riskMatrix.pillars.infrastructure.score).toBe(
        directReport.riskMatrix.pillars.infrastructure.score
      );
      expect(gmailReport.riskMatrix.pillars.nlp.score).toBe(
        directReport.riskMatrix.pillars.nlp.score
      );

      // 5. MongoDB Persistence verification
      expect(AnalysisReportModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
      expect(connectDb).toHaveBeenCalled();
    });
  });

  describe('Adversarial Phishing Parity (Malicious Phish)', () => {
    it('correctly flags phishing threats with exact parity between direct and Gmail ingestion', async () => {
      const directBuffer = fs.readFileSync(maliciousPhishEmlPath);
      const gmailRawBase64url = directBuffer.toString('base64url');
      const gmailDecodedBuffer = Buffer.from(gmailRawBase64url, 'base64url');

      const directReport = await runForensicPipeline('direct-phish-002', directBuffer, {
        protectedDomains: ['target-corp.com', 'paypal.com', 'google.com'],
      });

      const gmailReport = await runForensicPipeline('gmail-phish-002', gmailDecodedBuffer, {
        protectedDomains: ['target-corp.com', 'paypal.com', 'google.com'],
      });

      // Forensic parity
      expect(gmailReport.senderDomain).toBe(directReport.senderDomain);
      expect(gmailReport.riskMatrix.finalScore).toBe(directReport.riskMatrix.finalScore);
      expect(gmailReport.riskMatrix.authScore).toBe(directReport.riskMatrix.authScore);
      expect(gmailReport.riskMatrix.identityScore).toBe(directReport.riskMatrix.identityScore);
      expect(gmailReport.riskMatrix.ipScore).toBe(directReport.riskMatrix.ipScore);
      expect(gmailReport.riskMatrix.nlpScore).toBe(directReport.riskMatrix.nlpScore);

      // Phishing detection verification
      expect(gmailReport.riskMatrix.finalScore).toBeGreaterThanOrEqual(20);
      expect(gmailReport.aiSummary.intent).toBeDefined();
    });
  });

  describe('Deduplication on Re-Analysis', () => {
    it('upserts keyed by gmailMessageId on re-analysis without creating duplicate records', async () => {
      const directBuffer = fs.readFileSync(happyPathEmlPath);
      const gmailRawBase64url = directBuffer.toString('base64url');
      const gmailDecodedBuffer = Buffer.from(gmailRawBase64url, 'base64url');

      const gmailMessageId = 'stable-gmail-msg-777';

      // First analysis run
      await runForensicPipeline('first-job-uuid-1', gmailDecodedBuffer, {
        source: 'gmail',
        gmailMessageId,
      });

      expect(EmailAnalysisRecordModel.findOneAndUpdate).toHaveBeenCalledWith(
        { gmailMessageId: 'stable-gmail-msg-777' },
        expect.objectContaining({
          $set: expect.objectContaining({
            jobId: 'first-job-uuid-1',
            source: 'gmail',
            gmailMessageId: 'stable-gmail-msg-777',
          }),
        }),
        { upsert: true, new: true }
      );

      // Re-analysis run with new job UUID
      await runForensicPipeline('second-job-uuid-2', gmailDecodedBuffer, {
        source: 'gmail',
        gmailMessageId,
      });

      expect(EmailAnalysisRecordModel.findOneAndUpdate).toHaveBeenCalledWith(
        { gmailMessageId: 'stable-gmail-msg-777' },
        expect.objectContaining({
          $set: expect.objectContaining({
            jobId: 'second-job-uuid-2',
            source: 'gmail',
            gmailMessageId: 'stable-gmail-msg-777',
          }),
        }),
        { upsert: true, new: true }
      );
    });
  });
});
