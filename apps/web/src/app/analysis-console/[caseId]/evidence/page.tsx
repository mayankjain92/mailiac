'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import StitchLandingHeader from '@/components/StitchLandingHeader';
import EvidenceExplorer from '@/components/EvidenceExplorer';
import SignInRequiredState from '@/components/SignInRequiredState';
import { useAuth } from '@/lib/auth';
import { api, isAuthError, isForbiddenError, reanalyzeReport, getErrorMessage, uploadEml } from '@/lib/api';
import type { AnalysisReport } from '@mailiac/shared-types';
import axios from 'axios';
import {
  Loader2,
  RefreshCw,
  UploadCloud,
  ShieldAlert,
  ArrowLeft,
  Lock,
  Clock,
  Terminal,
  ArrowRight,
  Mail,
} from 'lucide-react';
import Link from 'next/link';

export default function EvidenceExplorerPage(): React.JSX.Element {
  const { user, isLoading: isAuthLoading } = useAuth();
  const params = useParams();
  const rawCaseId = params?.['caseId'];
  const caseId = Array.isArray(rawCaseId) ? rawCaseId[0] : rawCaseId;

  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isForbidden, setIsForbidden] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);

  // Auto-reanalysis states for expired 24h reports
  const [isAutoReanalyzing, setIsAutoReanalyzing] = useState<boolean>(false);
  const [reanalyzeStep, setReanalyzeStep] = useState<string>('Initializing forensic pipeline...');
  const [isPayloadExpired, setIsPayloadExpired] = useState<boolean>(false);

  // Manual retry/reanalyze loading feedback
  const [isReanalyzingManual, setIsReanalyzingManual] = useState<boolean>(false);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearPolling = useCallback((): void => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return (): void => {
      clearPolling();
    };
  }, [clearPolling]);

  const pollForJobCompletion = useCallback(
    (targetJobId: string): void => {
      clearPolling();
      let attempts = 0;
      const maxAttempts = 75; // 75 * 1200ms = 90s max

      pollTimerRef.current = setInterval(async () => {
        attempts++;

        // 1. Check if the fresh report is already saved in the database
        try {
          const repRes = await api.get<AnalysisReport>(`/api/reports/${encodeURIComponent(targetJobId)}`);
          if (repRes.data) {
            clearPolling();
            setReport(repRes.data);
            setIsAutoReanalyzing(false);
            setIsLoading(false);
            return;
          }
        } catch {
          // Report not ready yet, continue polling job status
        }

        // 2. Poll BullMQ pipeline progress
        try {
          const jobRes = await api.get<{ status: string; failedReason?: string }>(
            `/api/jobs/${encodeURIComponent(targetJobId)}`
          );
          const jobData = jobRes.data;
          setJobStatus(jobData.status);

          if (jobData.status === 'processing') {
            setReanalyzeStep('Extracting MIME headers, verifying DKIM/SPF, and scoring risk pillars...');
          } else if (jobData.status === 'completed') {
            // Attempt to fetch the completed report immediately
            try {
              const repRes = await api.get<AnalysisReport>(`/api/reports/${encodeURIComponent(targetJobId)}`);
              if (repRes.data) {
                clearPolling();
                setReport(repRes.data);
                setIsAutoReanalyzing(false);
                setIsLoading(false);
                return;
              }
            } catch {
              setReanalyzeStep('Finalizing forensic evidence report...');
            }
          } else if (jobData.status === 'failed') {
            clearPolling();
            setIsAutoReanalyzing(false);
            setError(jobData.failedReason || 'Forensic analysis failed during re-execution.');
            return;
          }
        } catch (jobErr: unknown) {
          if (isForbiddenError(jobErr)) {
            clearPolling();
            setIsForbidden(true);
            setIsAutoReanalyzing(false);
            return;
          }
          if (isAuthError(jobErr)) {
            clearPolling();
            setIsAutoReanalyzing(false);
            return;
          }
        }

        if (attempts >= maxAttempts) {
          clearPolling();
          setIsAutoReanalyzing(false);
          setError('Automatic re-analysis timed out. You can monitor the pipeline directly in the console.');
        }
      }, 1200);
    },
    [clearPolling]
  );

  const startReanalysis = useCallback(
    async (targetCaseId: string) => {
      setIsLoading(false);
      setIsAutoReanalyzing(true);
      setError(null);
      setIsPayloadExpired(false);

      const isDemoCase =
        !targetCaseId ||
        targetCaseId === 'undefined' ||
        targetCaseId.startsWith('demo-') ||
        targetCaseId === 'sample-phish';

      if (isDemoCase) {
        setReanalyzeStep('Loading simulated sandbox email payload...');
        try {
          const res = await fetch('/samples/sample-phish.eml');
          if (!res.ok) throw new Error('Could not load sample demo payload.');
          const blob = await res.blob();
          const sampleFile = new File([blob], 'Urgent_Wire_Transfer_BEC_Phish.eml', {
            type: 'message/rfc822',
          });
          setReanalyzeStep('Ingesting sandbox payload into forensic worker queue...');
          const uploadData = await uploadEml(sampleFile);
          setJobStatus('queued');
          setReanalyzeStep('Email queued for multi-pillar forensic inspection...');
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', `/analysis-console/${encodeURIComponent(uploadData.jobId)}/evidence`);
          }
          pollForJobCompletion(uploadData.jobId);
          return;
        } catch (demoErr: unknown) {
          setIsAutoReanalyzing(false);
          if (isAuthError(demoErr)) {
            return;
          }
          setError(getErrorMessage(demoErr, 'Failed to re-analyze sandbox email.'));
          return;
        }
      }

      setReanalyzeStep('Dispatching email payload to forensic worker queue...');

      try {
        const data = await reanalyzeReport(targetCaseId);
        const resolvedJobId = data.jobId || targetCaseId;
        setJobStatus(data.status || 'queued');
        setReanalyzeStep('Email queued for multi-pillar forensic inspection...');
        pollForJobCompletion(resolvedJobId);
      } catch (err: unknown) {
        setIsAutoReanalyzing(false);
        if (isAuthError(err)) {
          return;
        }
        if (isForbiddenError(err)) {
          setIsForbidden(true);
          setError('You are not authorized to re-analyze this report.');
          return;
        }

        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        const respData = axios.isAxiosError(err) ? (err.response?.data as Record<string, unknown>) : undefined;

        if (status === 422 || respData?.['expired']) {
          setIsPayloadExpired(true);
          setError(getErrorMessage(err, 'The original email payload is no longer available in temporary cache.'));
          return;
        }

        setError(getErrorMessage(err, 'Failed to re-analyze this case.'));
      }
    },
    [pollForJobCompletion]
  );

  const fetchAnalysisReport = useCallback(async () => {
    if (!caseId) {
      return;
    }

    if (!user) {
      setIsLoading(false);
      return;
    }

    // Check if this is a demo sandbox case
    const isDemoCase =
      caseId === 'undefined' ||
      caseId.startsWith('demo-') ||
      caseId === 'sample-phish';

    if (isDemoCase) {
      await startReanalysis(caseId);
      return;
    }

    setIsLoading(true);
    setError(null);
    setIsForbidden(false);
    setIsPayloadExpired(false);
    clearPolling();

    try {
      // 1. Try to fetch completed report
      const res = await api.get<AnalysisReport>(`/api/reports/${encodeURIComponent(caseId)}`);
      if (res.data) {
        setReport(res.data);
        setIsLoading(false);
        return;
      }
    } catch (err: unknown) {
      if (isForbiddenError(err)) {
        setIsForbidden(true);
        setError('You are not authorized to access this report.');
        setIsLoading(false);
        return;
      }

      if (isAuthError(err)) {
        // Handled centrally by AuthProvider modal
        setIsLoading(false);
        return;
      }

      // 2. If report is not in database, check if an active BullMQ job is already running
      try {
        const jobRes = await api.get<{ status: string; failedReason?: string }>(
          `/api/jobs/${encodeURIComponent(caseId)}`
        );
        const jobData = jobRes.data;
        setJobStatus(jobData.status);

        if (jobData.status === 'processing' || jobData.status === 'queued' || jobData.status === 'active') {
          setIsLoading(false);
          setIsAutoReanalyzing(true);
          setReanalyzeStep(`Analysis already in progress (${jobData.status}). Monitoring pipeline...`);
          pollForJobCompletion(caseId);
          return;
        }
      } catch (jobErr: unknown) {
        if (isForbiddenError(jobErr)) {
          setIsForbidden(true);
          setError('You are not authorized to access this report.');
          setIsLoading(false);
          return;
        }
        if (isAuthError(jobErr)) {
          setIsLoading(false);
          return;
        }
      }

      // 3. Report is missing/expired from MongoDB 24h cache and no job is active:
      // AUTOMATICALLY RE-ANALYZE THAT MAIL! Don't just show 'Forensic Case Unavailable'.
      await startReanalysis(caseId);
    }
  }, [caseId, user, clearPolling, pollForJobCompletion, startReanalysis]);

  useEffect(() => {
    if (!isAuthLoading) {
      fetchAnalysisReport();
    }
  }, [fetchAnalysisReport, isAuthLoading]);

  // Logged-out state: show friendly "Sign in required" experience
  if (!isAuthLoading && !user) {
    return (
      <div className="min-h-screen bg-[#F2F2EE] dark:bg-[#0E1210] text-[#1a1c1c] dark:text-[#F2F2EE] transition-colors duration-200 flex flex-col">
        <StitchLandingHeader />
        <main className="flex-1 w-full flex items-center justify-center p-6">
          <SignInRequiredState
            title="Sign in required to view Forensic Evidence"
            description="You need to sign in with your Google account to access this forensic investigation report."
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F2EE] dark:bg-[#0E1210] text-[#1a1c1c] dark:text-[#F2F2EE] transition-colors duration-200 flex flex-col">
      <StitchLandingHeader />

      <main className="flex-1 w-full">
        {isLoading ? (
          /* Initial loading state */
          <div className="min-h-[75vh] flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 flex items-center justify-center mb-6 relative">
              <Loader2 className="w-8 h-8 text-[#0052ff] dark:text-[#3b82f6] animate-spin" />
            </div>

            <div className="text-xs font-bold text-[#0052ff] dark:text-[#3b82f6] uppercase tracking-widest mb-2">
              FORENSIC INVESTIGATION PIPELINE
            </div>

            <h2 className="text-2xl font-extrabold text-[#1a1c1c] dark:text-[#F2F2EE] mb-2 tracking-tight">
              LOADING FORENSIC EVIDENCE
            </h2>

            <p className="text-xs text-[#737688] dark:text-[#A0A7A3] max-w-md mb-4">
              Retrieving forensic analysis for Case ID{' '}
              <code className="text-[#0052ff] dark:text-[#3b82f6] font-bold font-mono">{caseId}</code>...
            </p>
          </div>
        ) : isAutoReanalyzing ? (
          /* Automatic Re-analysis in Progress State (Replaces 'Forensic Case Unavailable') */
          <div className="min-h-[75vh] flex flex-col items-center justify-center p-6 text-center max-w-xl mx-auto animate-in fade-in duration-300">
            <div className="w-20 h-20 rounded-full bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 flex items-center justify-center mb-6 relative">
              <RefreshCw className="w-10 h-10 text-[#0052ff] dark:text-[#3b82f6] animate-spin" />
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 animate-ping" />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[11px] font-bold tracking-wider uppercase mb-3">
              <Clock className="w-3.5 h-3.5" />
              <span>Report Expired · Automatically Re-Analyzing</span>
            </div>

            <h2 className="text-2xl md:text-3xl font-extrabold text-[#1a1c1c] dark:text-[#F2F2EE] mb-3 tracking-tight">
              RE-RUNNING FORENSIC INSPECTION
            </h2>

            <p className="text-xs md:text-sm text-[#737688] dark:text-[#A0A7A3] mb-6 leading-relaxed">
              The 24-hour report cache for Case{' '}
              <code className="text-[#0052ff] dark:text-[#3b82f6] font-mono font-bold">{caseId}</code> has expired.
              Mailiac is automatically re-running the multi-pillar forensic pipeline using the preserved email payload.
            </p>

            {/* Pipeline Stage Indicator */}
            <div className="w-full bg-[#EAEAE5] dark:bg-[#151A17] border border-[#D5D5CE] dark:border-[#29342F] rounded-lg p-4 mb-6 text-left shadow-sm">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-bold text-[#1a1c1c] dark:text-[#F2F2EE] flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#0052ff] dark:bg-[#3b82f6] animate-pulse" />
                  Pipeline Status: <span className="uppercase font-mono text-[#0052ff] dark:text-[#3b82f6]">{jobStatus || 'active'}</span>
                </span>
                <span className="text-[10px] text-[#737688] dark:text-[#A0A7A3]">Live Execution</span>
              </div>
              <p className="text-xs text-[#434656] dark:text-[#A0A7A3] flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0052ff] dark:text-[#3b82f6] shrink-0" />
                <span>{reanalyzeStep}</span>
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-4 justify-center">
              <Link
                href={`/forensic-analysis?jobId=${encodeURIComponent(caseId || '')}&fileName=reanalyzed_case.eml`}
                className="bg-[#0052ff] dark:bg-[#3b82f6] text-white px-5 py-2.5 rounded text-xs font-bold tracking-wider hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors flex items-center gap-2 shadow-sm"
              >
                <Terminal className="w-4 h-4" /> Watch Live Pipeline Console <ArrowRight className="w-3.5 h-3.5" />
              </Link>

              <Link
                href="/history"
                className="border border-[#D5D5CE] dark:border-[#29342F] bg-[#EAEAE5] dark:bg-[#151A17] text-[#1a1c1c] dark:text-[#F2F2EE] px-5 py-2.5 rounded text-xs font-semibold hover:border-[#0052ff] transition-colors flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Back to History
              </Link>
            </div>
          </div>
        ) : isForbidden ? (
          /* 403 Forbidden State: Logged-in user has no access to this report */
          <div className="min-h-[75vh] flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 dark:bg-amber-500/20 flex items-center justify-center mb-6 text-amber-600 dark:text-amber-400">
              <Lock className="w-8 h-8" />
            </div>

            <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-2">
              ACCESS RESTRICTED
            </div>

            <h2 className="text-2xl font-extrabold text-[#1a1c1c] dark:text-[#F2F2EE] mb-3 tracking-tight">
              You are not authorized to access this report.
            </h2>

            <p className="text-xs text-[#737688] dark:text-[#A0A7A3] mb-8 leading-relaxed">
              This forensic case belongs to another user account. Multi-tenant security policies prevent unauthorized inspection of private email analysis data.
            </p>

            <div className="flex flex-wrap gap-4 justify-center">
              <Link
                href="/history"
                className="bg-[#0052ff] dark:bg-[#3b82f6] text-white px-5 py-2.5 rounded text-xs font-bold tracking-wider hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors flex items-center gap-2 shadow-sm"
              >
                <ArrowLeft className="w-4 h-4" /> Go to Your Audit History
              </Link>

              <Link
                href="/mailbox"
                className="border border-[#D5D5CE] dark:border-[#29342F] bg-[#EAEAE5] dark:bg-[#151A17] text-[#1a1c1c] dark:text-[#F2F2EE] px-5 py-2.5 rounded text-xs font-semibold hover:border-[#0052ff] transition-colors flex items-center gap-2"
              >
                Open Mailbox
              </Link>
            </div>
          </div>
        ) : isPayloadExpired ? (
          /* Payload Expired State: Both 24h cache and raw payload buffer are expired */
          <div className="min-h-[75vh] flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 dark:bg-amber-500/20 flex items-center justify-center mb-6 text-amber-600 dark:text-amber-400">
              <Clock className="w-8 h-8" />
            </div>

            <div className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-2">
              PAYLOAD EXPIRED
            </div>

            <h2 className="text-2xl font-extrabold text-[#1a1c1c] dark:text-[#F2F2EE] mb-3 tracking-tight">
              ORIGINAL EMAIL PAYLOAD NO LONGER AVAILABLE
            </h2>

            <p className="text-xs text-[#737688] dark:text-[#A0A7A3] mb-8 leading-relaxed">
              The 24-hour detailed report has expired and the raw MIME email payload is no longer stored in temporary cache.
              To re-inspect this email, please upload the original .EML file or re-sync from your connected Gmail mailbox.
            </p>

            <div className="flex flex-wrap gap-4 justify-center">
              <Link
                href="/forensic-analysis"
                className="bg-[#0052ff] dark:bg-[#3b82f6] text-white px-5 py-2.5 rounded text-xs font-bold tracking-wider hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors flex items-center gap-2 shadow-sm"
              >
                <UploadCloud className="w-4 h-4" /> Re-upload .EML Sample
              </Link>

              <Link
                href="/mailbox"
                className="border border-[#D5D5CE] dark:border-[#29342F] bg-[#EAEAE5] dark:bg-[#151A17] text-[#1a1c1c] dark:text-[#F2F2EE] px-5 py-2.5 rounded text-xs font-semibold hover:border-[#0052ff] transition-colors flex items-center gap-2"
              >
                <Mail className="w-4 h-4 text-[#0052ff] dark:text-[#3b82f6]" /> Open Mailbox
              </Link>

              <Link
                href="/history"
                className="border border-[#D5D5CE] dark:border-[#29342F] bg-[#EAEAE5] dark:bg-[#151A17] text-[#1a1c1c] dark:text-[#F2F2EE] px-5 py-2.5 rounded text-xs font-semibold hover:border-[#0052ff] transition-colors flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Audit History
              </Link>
            </div>
          </div>
        ) : error || !report ? (
          /* General Error or Failure State with explicit Re-Analyze trigger */
          <div className="min-h-[75vh] flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-full bg-[#ba1a1a]/10 dark:bg-[#ba1a1a]/20 flex items-center justify-center mb-6">
              <ShieldAlert className="w-8 h-8 text-[#ba1a1a] dark:text-[#ef4444]" />
            </div>

            <div className="text-xs font-bold text-[#ba1a1a] dark:text-[#ef4444] uppercase tracking-widest mb-2">
              INVESTIGATION STATUS
            </div>

            <h2 className="text-2xl font-extrabold text-[#1a1c1c] dark:text-[#F2F2EE] mb-3 tracking-tight">
              FORENSIC CASE UNAVAILABLE
            </h2>

            <p className="text-xs text-[#737688] dark:text-[#A0A7A3] mb-8 leading-relaxed">
              {error || 'The requested forensic investigation could not be retrieved from the database.'}
            </p>

            <div className="flex flex-wrap gap-4 justify-center">
              {caseId && (
                <button
                  type="button"
                  onClick={async () => {
                    setIsReanalyzingManual(true);
                    try {
                      await startReanalysis(caseId);
                    } finally {
                      setIsReanalyzingManual(false);
                    }
                  }}
                  disabled={isReanalyzingManual || isRetrying}
                  className="bg-[#0052ff] dark:bg-[#3b82f6] text-white px-5 py-2.5 rounded text-xs font-bold tracking-wider hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-all flex items-center gap-2 shadow-sm disabled:opacity-50 active:scale-[0.98]"
                >
                  {isReanalyzingManual ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  <span>{isReanalyzingManual ? 'Re-analyzing...' : 'Re-analyze Case Now'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={async () => {
                  setIsRetrying(true);
                  try {
                    await fetchAnalysisReport();
                  } finally {
                    setIsRetrying(false);
                  }
                }}
                disabled={isReanalyzingManual || isRetrying}
                className="border border-[#D5D5CE] dark:border-[#29342F] bg-[#EAEAE5] dark:bg-[#151A17] text-[#1a1c1c] dark:text-[#F2F2EE] px-5 py-2.5 rounded text-xs font-semibold hover:border-[#0052ff] transition-all flex items-center gap-2 disabled:opacity-50 active:scale-[0.98]"
              >
                {isRetrying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                <span>{isRetrying ? 'Retrying...' : 'Retry Retrieval'}</span>
              </button>

              <Link
                href="/forensic-analysis"
                className="border border-[#D5D5CE] dark:border-[#29342F] bg-[#EAEAE5] dark:bg-[#151A17] text-[#1a1c1c] dark:text-[#F2F2EE] px-5 py-2.5 rounded text-xs font-semibold hover:border-[#0052ff] transition-colors flex items-center gap-2"
              >
                <UploadCloud className="w-4 h-4 text-[#0052ff] dark:text-[#3b82f6]" /> Return to Analysis
              </Link>
            </div>
          </div>
        ) : (
          <EvidenceExplorer report={report} caseId={caseId || report.messageId} onReportUpdated={setReport} />
        )}
      </main>

      {/* Forensic Footer */}
      <footer className="bg-[#EAEAE5] dark:bg-[#151A17] border-t border-[#D5D5CE] dark:border-[#29342F] w-full px-6 md:px-16 py-8 max-w-[1440px] mx-auto transition-colors duration-200 mt-auto">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-[#737688] dark:text-[#A0A7A3]">
          <div>Mailiac Forensic Intelligence · Evidence Explorer</div>
          <div>© {new Date().getFullYear()} Mailiac. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
