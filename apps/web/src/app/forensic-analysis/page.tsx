'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import StitchLandingHeader from '@/components/StitchLandingHeader';
import ForensicAnalysisConsole, { type ForensicJob } from '@/components/ForensicAnalysisConsole';
import RiskPillarGrid from '@/components/RiskPillarGrid';
import ForensicIngestionModal from '@/components/ForensicIngestionModal';
import type { AnalysisReport } from '@mailiac/shared-types';
import { Terminal, FileCode, Loader2, CheckCircle2, XCircle, Mail, FileText, ArrowRight, FileSearch } from 'lucide-react';

function ForensicAnalysisContent(): React.JSX.Element {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialJobId = searchParams.get('jobId');
  const initialFileName = searchParams.get('fileName') || 'uploaded_sample.eml';

  const [jobs, setJobs] = useState<ForensicJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(initialJobId);
  const [isIngestionModalOpen, setIsIngestionModalOpen] = useState<boolean>(!initialJobId);

  // Initialize job from query parameter if provided
  useEffect(() => {
    if (initialJobId) {
      setJobs((prev) => {
        const remaining = prev.filter((j) => j.id !== initialJobId);
        return [
          {
            id: initialJobId,
            fileName: decodeURIComponent(initialFileName),
            status: 'queued',
          },
          ...remaining,
        ];
      });
      setActiveJobId(initialJobId);
      setIsIngestionModalOpen(false);
    }
  }, [initialJobId, initialFileName]);

  const handleJobCreated = (jobId: string, fileName: string): void => {
    const newJob: ForensicJob = {
      id: jobId,
      fileName,
      status: 'queued',
    };
    setJobs((prev) => [newJob, ...prev.filter((j) => j.id !== jobId)]);
    setActiveJobId(jobId);
    router.push(`/forensic-analysis?jobId=${jobId}&fileName=${encodeURIComponent(fileName)}`);
  };

  const fetchReport = useCallback(async (jobId: string): Promise<boolean> => {
    try {
      const reportRes = await fetch(`/api/reports/${jobId}`);
      if (reportRes.ok) {
        const reportData: AnalysisReport = await reportRes.json();
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, status: 'completed', report: reportData } : j))
        );
        return true;
      }
    } catch (err) {
      console.error('Failed to fetch report:', err);
    }
    return false;
  }, []);

  // Poll active jobs
  useEffect(() => {
    const pendingJobs = jobs.filter(
      (j) =>
        j.status === 'queued' ||
        j.status === 'active' ||
        j.status === 'processing' ||
        (j.status === 'completed' && !j.report)
    );
    if (pendingJobs.length === 0) return;

    const interval = setInterval(async () => {
      for (const job of pendingJobs) {
        try {
          if (job.status === 'completed' && !job.report) {
            await fetchReport(job.id);
            continue;
          }

          const res = await fetch(`/api/jobs/${job.id}`);
          if (!res.ok) continue;

          const data = await res.json();
          const currentStatus = data.status as ForensicJob['status'];

          if (currentStatus === 'completed') {
            const fetched = await fetchReport(job.id);
            if (!fetched) {
              setJobs((prev) =>
                prev.map((j) => (j.id === job.id ? { ...j, status: 'completed' } : j))
              );
            }
          } else if (currentStatus === 'failed') {
            setJobs((prev) =>
              prev.map((j) =>
                j.id === job.id
                  ? { ...j, status: 'failed', error: data.failedReason || data.error || 'Job processing failed' }
                  : j
              )
            );
          } else {
            setJobs((prev) =>
              prev.map((j) => (j.id === job.id ? { ...j, status: currentStatus } : j))
            );
          }
        } catch {
          // ignore transient polling errors
        }
      }
    }, 800);

    return (): void => {
      clearInterval(interval);
    };
  }, [jobs, fetchReport]);

  const activeJob = jobs.find((j) => j.id === activeJobId);
  const otherJobs = jobs.filter((j) => j.id !== activeJobId);

  const handleReset = (): void => {
    setActiveJobId(null);
    router.push('/forensic-analysis');
  };

  return (
    <div className="min-h-screen bg-[#F2F2EE] dark:bg-[#0E1210] text-[#1a1c1c] dark:text-[#F2F2EE] transition-colors duration-200">
      <StitchLandingHeader onJobCreated={handleJobCreated} />

      <main className="w-full">
        {activeJob ? (
          <div>
            {/* Active Forensic Analysis Console */}
            <section className="min-h-[75vh] flex flex-col justify-center border-b border-[#D5D5CE] dark:border-[#29342F] grid-bg">
              <ForensicAnalysisConsole
                job={activeJob}
                onReset={handleReset}
                onViewReport={() => {
                  const riskEl = document.getElementById('risk-engine');
                  if (riskEl) {
                    riskEl.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
              />
            </section>

            {/* 4-Pillar Risk Engine Grid */}
            <RiskPillarGrid report={activeJob.report} caseId={activeJob.id} />
          </div>
        ) : (
          /* Modern Ingestion Mode State when no job is selected */
          <section className="py-16 px-6 md:px-16 max-w-[1440px] mx-auto min-h-[75vh] flex flex-col justify-center">
            <div className="mb-8 text-center max-w-2xl mx-auto">
              <div className="text-xs font-mono font-bold text-[#0052ff] dark:text-[#3b82f6] uppercase tracking-widest mb-2">
                FORENSIC INVESTIGATION PIPELINE
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold text-[#1a1c1c] dark:text-[#F2F2EE] tracking-tight mb-3">
                Select Forensic Ingestion Mode
              </h1>
              <p className="text-sm text-[#434656] dark:text-[#A0A7A3] leading-relaxed">
                Choose how you want to submit an email for asynchronous multi-stage dissection and 4-pillar risk analysis.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto w-full mb-8">
              {/* Card 1: Gmail Mailbox Ingestion */}
              <div
                onClick={() => router.push('/mailbox')}
                className="group p-6 rounded border border-[#D5D5CE] dark:border-[#29342F] bg-white dark:bg-[#121614] hover:border-[#0052ff] dark:hover:border-[#3b82f6] transition-all cursor-pointer shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="w-10 h-10 rounded bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 flex items-center justify-center text-[#0052ff] dark:text-[#3b82f6] mb-4">
                    <Mail className="w-5 h-5" />
                  </div>
                  <span className="font-mono text-[10px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider block mb-1">
                    DIRECT CLOUD INGESTION
                  </span>
                  <h3 className="text-lg font-bold text-[#1a1c1c] dark:text-[#F2F2EE] mb-2">
                    Gmail Connected Mailbox
                  </h3>
                  <p className="text-xs text-[#434656] dark:text-[#A0A7A3] leading-relaxed">
                    Triage live emails directly from your synchronized inbox with pre-parsed headers and instant 1-click forensic analysis.
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-1.5 text-xs font-mono font-bold text-[#0052ff] dark:text-[#3b82f6] group-hover:translate-x-1 transition-transform">
                  <span>Open Gmail Mailbox</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Card 2: EML File Upload */}
              <div
                onClick={() => setIsIngestionModalOpen(true)}
                className="group p-6 rounded border border-[#D5D5CE] dark:border-[#29342F] bg-white dark:bg-[#121614] hover:border-[#0052ff] dark:hover:border-[#3b82f6] transition-all cursor-pointer shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="w-10 h-10 rounded bg-purple-500/10 dark:bg-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 mb-4">
                    <FileText className="w-5 h-5" />
                  </div>
                  <span className="font-mono text-[10px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider block mb-1">
                    LOCAL RFC822 INGESTION
                  </span>
                  <h3 className="text-lg font-bold text-[#1a1c1c] dark:text-[#F2F2EE] mb-2">
                    Upload .EML File
                  </h3>
                  <p className="text-xs text-[#434656] dark:text-[#A0A7A3] leading-relaxed">
                    Upload a raw forensic email export from Outlook, Apple Mail, or Thunderbird to launch the 9-stage asynchronous pipeline.
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-1.5 text-xs font-mono font-bold text-purple-600 dark:text-purple-400 group-hover:translate-x-1 transition-transform">
                  <span>Launch Ingestion Dialog</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setIsIngestionModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0052ff] hover:bg-[#004ced] dark:bg-[#3b82f6] dark:hover:bg-[#2563eb] text-white rounded text-xs font-mono font-bold transition-colors shadow-sm uppercase tracking-wider"
              >
                <FileSearch className="w-4 h-4" />
                <span>Open Ingestion Mode Dialog</span>
              </button>
            </div>
          </section>
        )}

        {/* Previous Submissions / Pipeline History (Hides duplicate when viewing single job) */}
        {((activeJob && otherJobs.length > 0) || (!activeJob && jobs.length > 0)) && (
          <section className="py-12 px-6 md:px-16 max-w-[1440px] mx-auto border-t border-[#D5D5CE] dark:border-[#29342F]">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[#0052ff] dark:text-[#3b82f6]" />
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#1a1c1c] dark:text-[#F2F2EE]">
                  {activeJob
                    ? `Other Investigations in This Session (${otherJobs.length})`
                    : `Session Investigations (${jobs.length})`}
                </h3>
              </div>
              <button
                onClick={handleReset}
                className="text-xs font-mono text-[#0052ff] dark:text-[#3b82f6] hover:underline font-bold"
              >
                + New Analysis
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(activeJob ? otherJobs : jobs).map((job) => {
                const isActive = job.id === activeJobId;
                const isPending = job.status === 'queued' || job.status === 'active' || job.status === 'processing';

                return (
                  <div
                    key={job.id}
                    onClick={() => {
                      setActiveJobId(job.id);
                      router.push(`/forensic-analysis?jobId=${job.id}&fileName=${encodeURIComponent(job.fileName)}`);
                    }}
                    className={`p-4 rounded border transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#EAEAE5] dark:bg-[#151A17] border-[#0052ff] dark:border-[#3b82f6] shadow-sm'
                        : 'bg-[#F2F2EE] dark:bg-[#1B211E] border-[#D5D5CE] dark:border-[#29342F] hover:border-[#0052ff] dark:hover:border-[#3b82f6]'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <FileCode className="w-4 h-4 text-[#0052ff] dark:text-[#3b82f6] shrink-0" />
                        <span className="text-xs font-bold text-[#1a1c1c] dark:text-[#F2F2EE] font-mono truncate">
                          {job.fileName}
                        </span>
                      </div>

                      <span className="text-[11px] font-mono shrink-0 ml-2">
                        {isPending ? (
                          <span className="text-[#0052ff] dark:text-[#3b82f6] font-bold flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> {job.status}
                          </span>
                        ) : job.status === 'completed' ? (
                          <span className="text-[#10b981] font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> completed
                          </span>
                        ) : (
                          <span className="text-[#ef4444] font-bold flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> failed
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[11px] font-mono text-[#737688] dark:text-[#A0A7A3] pt-2 border-t border-[#D5D5CE] dark:border-[#29342F]">
                      <span>CASE: {job.id.substring(0, 8).toUpperCase()}</span>
                      {job.report && (
                        <span className="text-[#0052ff] dark:text-[#3b82f6] font-bold">
                          Risk: {job.report.riskMatrix.finalScore}/100
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Forensic Ingestion Modal */}
        <ForensicIngestionModal
          isOpen={isIngestionModalOpen}
          onClose={() => setIsIngestionModalOpen(false)}
          onJobCreated={handleJobCreated}
        />
      </main>

      {/* Footer */}
      <footer className="bg-[#EAEAE5] dark:bg-[#151A17] border-t border-[#D5D5CE] dark:border-[#29342F] w-full px-6 md:px-16 py-12 max-w-[1440px] mx-auto transition-colors duration-200">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-mono text-[#737688] dark:text-[#A0A7A3]">
          <div>Mailiac Forensic Intelligence Engine · Multi-Stage RFC822 Dissection</div>
          <div>© {new Date().getFullYear()} Mailiac. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}

export default function ForensicAnalysisPage(): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F2F2EE] dark:bg-[#0E1210] flex items-center justify-center font-mono text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-[#0052ff] dark:text-[#3b82f6] mr-2" />
          Loading Forensic Console...
        </div>
      }
    >
      <ForensicAnalysisContent />
    </Suspense>
  );
}
