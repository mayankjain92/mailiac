'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import StitchLandingHeader from '@/components/StitchLandingHeader';
import EvidenceExplorer from '@/components/EvidenceExplorer';
import type { AnalysisReport } from '@mailiac/shared-types';
import { Loader2, RefreshCw, UploadCloud, ShieldAlert } from 'lucide-react';
import Link from 'next/link';

export default function EvidenceExplorerPage(): React.JSX.Element {
  const params = useParams();
  const router = useRouter();
  const rawCaseId = params?.['caseId'];
  const caseId = Array.isArray(rawCaseId) ? rawCaseId[0] : rawCaseId;

  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);

  const fetchAnalysisReport = useCallback(async () => {
    if (!caseId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Try to fetch completed report
      const res = await fetch(`/api/reports/${encodeURIComponent(caseId)}`);
      
      if (res.ok) {
        const reportData: AnalysisReport = await res.json();
        setReport(reportData);
        setIsLoading(false);
        return;
      }

      // 2. If report is not yet in MongoDB, check BullMQ job status
      const jobRes = await fetch(`/api/jobs/${encodeURIComponent(caseId)}`);
      if (jobRes.ok) {
        const jobData = await jobRes.json();
        setJobStatus(jobData.status);

        if (jobData.status === 'processing' || jobData.status === 'queued' || jobData.status === 'active') {
          // If job is still in-flight, show real-time sequential pipeline execution
          router.replace(`/forensic-analysis?jobId=${encodeURIComponent(caseId)}`);
          return;
        } else if (jobData.status === 'failed') {
          setError(jobData.failedReason || 'Forensic analysis job failed during execution.');
          setIsLoading(false);
          return;
        }
      }

      // 3. If not found in reports or jobs
      setError('Forensic report not found. The case ID may be invalid or analysis has expired.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to connect to Mailiac forensic API.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [caseId, router]);

  useEffect(() => {
    fetchAnalysisReport();
  }, [fetchAnalysisReport]);

  return (
    <div className="min-h-screen bg-[#F2F2EE] dark:bg-[#0E1210] text-[#1a1c1c] dark:text-[#F2F2EE] transition-colors duration-200 flex flex-col">
      <StitchLandingHeader />

      <main className="flex-1 w-full">
        {isLoading ? (
          <div className="min-h-[75vh] flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 flex items-center justify-center mb-6 relative">
              <Loader2 className="w-8 h-8 text-[#0052ff] dark:text-[#3b82f6] animate-spin" />
            </div>

            <div className="font-mono text-xs font-bold text-[#0052ff] dark:text-[#3b82f6] uppercase tracking-widest mb-2">
              FORENSIC INVESTIGATION PIPELINE
            </div>

            <h2 className="text-2xl font-extrabold text-[#1a1c1c] dark:text-[#F2F2EE] mb-2 tracking-tight">
              LOADING FORENSIC EVIDENCE
            </h2>

            <p className="text-xs font-mono text-[#737688] dark:text-[#A0A7A3] max-w-md mb-4">
              Retrieving multi-stage forensic analysis for Case ID{' '}
              <code className="text-[#0052ff] dark:text-[#3b82f6] font-bold">{caseId}</code>...
            </p>

            {jobStatus && (
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#EAEAE5] dark:bg-[#151A17] border border-[#D5D5CE] dark:border-[#29342F] rounded text-xs font-mono text-[#434656] dark:text-[#A0A7A3]">
                <span className="w-2 h-2 rounded-full bg-[#0052ff] animate-ping" />
                Pipeline status: <strong className="uppercase">{jobStatus}</strong>
              </div>
            )}
          </div>
        ) : error || !report ? (
          <div className="min-h-[75vh] flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto">
            <div className="w-16 h-16 rounded-full bg-[#ba1a1a]/10 dark:bg-[#ba1a1a]/20 flex items-center justify-center mb-6">
              <ShieldAlert className="w-8 h-8 text-[#ba1a1a] dark:text-[#ef4444]" />
            </div>

            <div className="font-mono text-xs font-bold text-[#ba1a1a] dark:text-[#ef4444] uppercase tracking-widest mb-2">
              INVESTIGATION UNAVAILABLE
            </div>

            <h2 className="text-2xl font-extrabold text-[#1a1c1c] dark:text-[#F2F2EE] mb-3 tracking-tight">
              FORENSIC CASE UNAVAILABLE
            </h2>

            <p className="text-xs text-[#737688] dark:text-[#A0A7A3] mb-8 leading-relaxed font-mono">
              {error || 'The requested forensic investigation could not be retrieved from the database.'}
            </p>

            <div className="flex flex-wrap gap-4 justify-center">
              <button
                onClick={() => fetchAnalysisReport()}
                className="bg-[#0052ff] dark:bg-[#3b82f6] text-white px-5 py-2.5 rounded text-xs font-mono font-bold tracking-wider hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors flex items-center gap-2 shadow-sm"
              >
                <RefreshCw className="w-4 h-4" /> Retry Retrieval
              </button>

              <Link
                href="/forensic-analysis"
                className="border border-[#D5D5CE] dark:border-[#29342F] bg-[#EAEAE5] dark:bg-[#151A17] text-[#1a1c1c] dark:text-[#F2F2EE] px-5 py-2.5 rounded text-xs font-mono font-semibold hover:border-[#0052ff] transition-colors flex items-center gap-2"
              >
                <UploadCloud className="w-4 h-4 text-[#0052ff] dark:text-[#3b82f6]" /> Return to Analysis
              </Link>
            </div>
          </div>
        ) : (
          <EvidenceExplorer report={report} caseId={caseId || report.messageId} />
        )}
      </main>

      {/* Forensic Footer */}
      <footer className="bg-[#EAEAE5] dark:bg-[#151A17] border-t border-[#D5D5CE] dark:border-[#29342F] w-full px-6 md:px-16 py-8 max-w-[1440px] mx-auto transition-colors duration-200 mt-auto">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-mono text-[#737688] dark:text-[#A0A7A3]">
          <div>Mailiac Forensic Intelligence · Evidence Explorer</div>
          <div>© {new Date().getFullYear()} Mailiac. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
