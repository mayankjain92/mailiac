import type { AnalysisReport } from '@mailiac/shared-types';

export async function generateForensicPdf(report: AnalysisReport): Promise<Buffer> {
  void report;
  throw new Error('TODO: implement generateForensicPdf');
}
