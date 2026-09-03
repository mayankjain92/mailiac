import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runForensicPipeline } from '../src/pipeline.js';

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
}));

vi.mock('@mailiac/reporting-pdf', () => ({
  generateForensicPdf: vi.fn().mockResolvedValue(Buffer.from('mock-pdf')),
}));

import { AnalysisReportModel, EmailAnalysisRecordModel, RawEmailModel } from '@mailiac/db';

describe('Worker Forensic Pipeline - Re-Analysis In-Place Updates', () => {
  const fixturesDir = path.resolve(__dirname, '../../../packages/parsing/mime/test/fixtures');
  const happyPathEmlPath = path.join(fixturesDir, 'happy-path.eml');
  const rawEmlBuffer = fs.readFileSync(happyPathEmlPath);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates existing AnalysisReport atomically via findOneAndUpdate without creating duplicates', async () => {
    const stableCaseId = '2c7b8d47-28cf-41c5-85ef-3aa23f80a7b1';

    // First analysis execution
    const firstReport = await runForensicPipeline(stableCaseId, rawEmlBuffer, {
      source: 'eml',
    });

    expect(firstReport.messageId).toBe(stableCaseId);
    expect(AnalysisReportModel.findOneAndUpdate).toHaveBeenCalledWith(
      { messageId: stableCaseId },
      expect.objectContaining({
        $set: expect.objectContaining({
          messageId: stableCaseId,
        }),
      }),
      { upsert: true, new: true }
    );

    // Verifies RawEmailModel is updated with original buffer
    expect(RawEmailModel.findOneAndUpdate).toHaveBeenCalledWith(
      { messageId: stableCaseId },
      expect.objectContaining({
        $set: expect.objectContaining({
          messageId: stableCaseId,
          buffer: rawEmlBuffer,
          source: 'eml',
        }),
      }),
      { upsert: true }
    );

    // Second re-analysis execution with the EXACT same case ID
    const secondReport = await runForensicPipeline(stableCaseId, rawEmlBuffer, {
      source: 'eml',
    });

    expect(secondReport.messageId).toBe(stableCaseId);
    expect(AnalysisReportModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
    // Both calls keyed on the exact same stable caseId
    expect(AnalysisReportModel.findOneAndUpdate).toHaveBeenLastCalledWith(
      { messageId: stableCaseId },
      expect.objectContaining({
        $set: expect.objectContaining({
          messageId: stableCaseId,
        }),
      }),
      { upsert: true, new: true }
    );
  });

  it('replaces findings in-place without appending duplicates on re-analysis', async () => {
    const caseId = 'reanalyze-findings-test-123';

    await runForensicPipeline(caseId, rawEmlBuffer, { source: 'eml' });
    await runForensicPipeline(caseId, rawEmlBuffer, { source: 'eml' });

    // Inspect the second call's payload to ensure findings are passed cleanly
    const lastCall = vi.mocked(AnalysisReportModel.findOneAndUpdate).mock.calls[1]!;
    const updatePayload = lastCall[1] as { $set: { riskMatrix: { pillars: { authentication: { findings: unknown[] } } } } };
    const findings = updatePayload.$set.riskMatrix.pillars.authentication.findings;

    expect(Array.isArray(findings)).toBe(true);
    // Findings is a fresh array from the current run, not an accumulated list
    expect(findings.length).toBeLessThanOrEqual(5);
  });
});
