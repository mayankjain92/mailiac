'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import type { AnalysisReport } from '@mailiac/shared-types';
import {
  CheckCircle2,
  Loader2,
  XCircle,
  FileText,
  Shield,
  Layers,
  Route,
  KeyRound,
  Globe,
  Code2,
  BrainCircuit,
  BarChart3,
  Database,
  ArrowRight,
  RefreshCw,
  Clock,
  Radio,
} from 'lucide-react';

export interface ForensicJob {
  id: string;
  fileName: string;
  status: 'queued' | 'active' | 'processing' | 'completed' | 'failed';
  error?: string;
  report?: AnalysisReport;
}

interface ForensicAnalysisConsoleProps {
  job: ForensicJob;
  onReset?: () => void;
  onViewReport?: () => void;
}

interface PipelineStageDef {
  id: string;
  stepNumber: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
}

const PIPELINE_STAGES: PipelineStageDef[] = [
  { id: 'ingestion', stepNumber: '01', title: 'EML', subtitle: 'Ingestion', icon: FileText },
  { id: 'mime', stepNumber: '02', title: 'MIME', subtitle: 'Deconstruction', icon: Layers },
  { id: 'reverse-hop', stepNumber: '03', title: 'Reverse-Hop', subtitle: 'Trace', icon: Route },
  { id: 'auth', stepNumber: '04', title: 'Cryptographic', subtitle: 'Authentication', icon: KeyRound },
  { id: 'geoip', stepNumber: '05', title: 'GeoIP / ASN', subtitle: 'Enrichment', icon: Globe },
  { id: 'decloak', stepNumber: '06', title: 'HTML', subtitle: 'De-cloaking', icon: Code2 },
  { id: 'nlp', stepNumber: '07', title: 'Semantic', subtitle: 'NLP Analysis', icon: BrainCircuit },
  { id: 'risk', stepNumber: '08', title: 'Risk', subtitle: 'Aggregation', icon: BarChart3 },
  { id: 'persistence', stepNumber: '09', title: 'Persistence', subtitle: 'Database', icon: Database },
];

export default function ForensicAnalysisConsole({
  job,
  onReset,
  onViewReport,
}: ForensicAnalysisConsoleProps): React.JSX.Element {
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [activeStageIndex, setActiveStageIndex] = useState<number>(0);

  // Stage progression logic strictly derived from backend job status
  const isCompleted = job.status === 'completed' && !!job.report;
  const isFailed = job.status === 'failed';
  const isProcessing = job.status === 'processing' || job.status === 'active';
  const isQueued = job.status === 'queued';

  // Real-time elapsed execution timer while running
  useEffect(() => {
    if (job.status === 'completed' && job.report?.executionTimeMs) {
      setElapsedMs(job.report.executionTimeMs);
      return undefined;
    }

    if (job.status === 'completed' || job.status === 'failed') return undefined;

    const start = Date.now();
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 100);

    return () => clearInterval(timer);
  }, [job.status, job.report]);

  // Dynamic active stage progression during processing
  useEffect(() => {
    if (isCompleted) {
      setActiveStageIndex(9);
      return;
    }
    if (isQueued) {
      setActiveStageIndex(0);
      return;
    }
    if (isFailed) {
      return;
    }

    // In processing/active mode, periodically advance stage
    const interval = setInterval(() => {
      setActiveStageIndex((prev) => {
        if (prev < 8) return prev + 1;
        return prev;
      });
    }, 600);

    return () => clearInterval(interval);
  }, [job.status, isCompleted, isQueued, isFailed]);

  // Determine stage states
  const getStageState = (index: number): 'completed' | 'active' | 'waiting' | 'failed' => {
    if (isCompleted) return 'completed';
    if (isFailed) {
      return index === activeStageIndex ? 'failed' : index < activeStageIndex ? 'completed' : 'waiting';
    }
    if (isQueued) {
      return index === 0 ? 'active' : 'waiting';
    }
    // During active processing
    if (index < activeStageIndex) return 'completed';
    if (index === activeStageIndex) return 'active';
    return 'waiting';
  };

  const completedCount = isCompleted
    ? 9
    : isFailed
    ? activeStageIndex
    : isQueued
    ? 1
    : activeStageIndex;

  const caseIdDisplay = job.id.length > 8 ? job.id.slice(0, 8).toUpperCase() : job.id.toUpperCase();

  const handleScrollToReport = (): void => {
    if (onViewReport) {
      onViewReport();
    } else {
      const riskEl = document.getElementById('risk-engine');
      if (riskEl) {
        riskEl.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <div className="w-full max-w-[1440px] mx-auto px-6 md:px-16 py-12 transition-colors duration-200">
      
      {/* Top Case Identifier Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-8 mb-10 border-b border-[#D5D5CE] dark:border-[#29342F] gap-4">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded bg-[#0052ff] dark:bg-[#3b82f6] flex items-center justify-center text-white font-bold text-xs shadow-sm">
            M
          </div>
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-[#434656] dark:text-[#A0A7A3]">
            MAILIAC FORENSICS CONSOLE
          </span>
        </div>

        {/* Case Badge & Live Status */}
        <div className="flex items-center gap-3 bg-[#EAEAE5] dark:bg-[#151A17] border border-[#D5D5CE] dark:border-[#29342F] px-3.5 py-1.5 rounded text-xs font-mono">
          <span className="text-[#737688] dark:text-[#7D8681] uppercase tracking-wider">CASE_ID:</span>
          <span className="font-bold text-[#1a1c1c] dark:text-[#F2F2EE]">{caseIdDisplay}</span>
          
          <div className="w-px h-3.5 bg-[#D5D5CE] dark:bg-[#29342F] mx-1"></div>
          
          {isCompleted ? (
            <span className="text-[#10b981] font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#10b981]"></span>
              COMPLETE
            </span>
          ) : isFailed ? (
            <span className="text-[#ef4444] font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#ef4444]"></span>
              FAILED
            </span>
          ) : (
            <span className="text-[#0052ff] dark:text-[#3b82f6] font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#0052ff] dark:bg-[#3b82f6] animate-ping"></span>
              ANALYZING
            </span>
          )}
        </div>
      </div>

      {/* Analysis Main Header */}
      <section className="mb-14 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 border border-[#0052ff]/20 dark:border-[#3b82f6]/30 text-[#0052ff] dark:text-[#3b82f6] text-[11px] font-mono font-bold tracking-wider uppercase">
          <Radio className="w-3.5 h-3.5 animate-pulse" />
          Real-Time Pipeline Execution
        </div>

        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[#1a1c1c] dark:text-[#F2F2EE] mb-4">
          FORENSIC ANALYSIS
        </h1>

        <p className="text-base text-[#434656] dark:text-[#A0A7A3] mb-6 leading-relaxed">
          Deep inspection of the submitted email is in progress. Our multi-stage pipeline is dissecting headers, attachments, and intent.
        </p>

        {/* Uploaded File Chip */}
        <div className="inline-flex items-center gap-2.5 border border-[#D5D5CE] dark:border-[#29342F] bg-[#F2F2EE] dark:bg-[#1B211E] px-4 py-2 rounded shadow-sm">
          <FileText className="w-4 h-4 text-[#0052ff] dark:text-[#3b82f6]" />
          <span className="font-mono text-xs font-semibold text-[#1a1c1c] dark:text-[#F2F2EE] truncate max-w-[320px]">
            {job.fileName}
          </span>
        </div>
      </section>

      {/* Forensic Pipeline Visual Timeline */}
      <section className="mb-16 w-full">
        <div className="flex justify-between items-center mb-8">
          <h2 className="font-mono text-xs font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-widest">
            Forensic Pipeline Activity
          </h2>
          <span className="font-mono text-xs text-[#0052ff] dark:text-[#3b82f6] font-bold">
            {completedCount} / 9 stages complete
          </span>
        </div>

        {/* Desktop / Tablet Timeline */}
        <div className="hidden md:flex justify-between items-start relative w-full px-2">
          {PIPELINE_STAGES.map((stage, idx) => {
            const state = getStageState(idx);
            const Icon = stage.icon;
            const isLast = idx === PIPELINE_STAGES.length - 1;

            return (
              <div key={stage.id} className="flex flex-col items-center flex-1 relative pipeline-item group">
                
                {/* Stage Icon Node */}
                <div
                  className={`w-12 h-12 rounded border flex items-center justify-center mb-3 relative transition-all duration-300 ${
                    state === 'completed'
                      ? 'border-[#10b981] bg-[#10b981]/10 text-[#10b981]'
                      : state === 'active'
                      ? 'border-[#0052ff] dark:border-[#3b82f6] bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 text-[#0052ff] dark:text-[#3b82f6] pulse-border bracket-corners shadow-sm'
                      : state === 'failed'
                      ? 'border-[#ef4444] bg-[#ef4444]/10 text-[#ef4444]'
                      : 'border-[#D5D5CE] dark:border-[#29342F] bg-[#EAEAE5] dark:bg-[#151A17] text-[#737688] dark:text-[#7D8681] opacity-60'
                  }`}
                >
                  {state === 'completed' ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : state === 'active' ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : state === 'failed' ? (
                    <XCircle className="w-5 h-5" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}

                  {/* Step Number Tag */}
                  <div
                    className={`absolute -top-2 -left-2 px-1 font-mono text-[9px] font-bold rounded-sm border ${
                      state === 'active'
                        ? 'bg-[#0052ff] text-white border-[#0052ff]'
                        : state === 'completed'
                        ? 'bg-[#10b981] text-white border-[#10b981]'
                        : 'bg-[#F2F2EE] dark:bg-[#1B211E] text-[#737688] dark:text-[#7D8681] border-[#D5D5CE] dark:border-[#29342F]'
                    }`}
                  >
                    {stage.stepNumber}
                  </div>
                </div>

                {/* Stage Name */}
                <div
                  className={`font-mono text-[10px] text-center leading-tight tracking-tight px-1 ${
                    state === 'active'
                      ? 'text-[#0052ff] dark:text-[#3b82f6] font-bold'
                      : state === 'completed'
                      ? 'text-[#1a1c1c] dark:text-[#F2F2EE] font-semibold'
                      : 'text-[#737688] dark:text-[#7D8681] opacity-60'
                  }`}
                >
                  {stage.title}
                  <br />
                  {stage.subtitle}
                </div>

                {/* Connector Line to Next Node */}
                {!isLast && (
                  <div
                    className={`connector-line ${
                      idx < completedCount
                        ? 'bg-[#10b981]'
                        : 'bg-[#D5D5CE] dark:bg-[#29342F]'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Mobile Vertical Timeline */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:hidden">
          {PIPELINE_STAGES.map((stage, idx) => {
            const state = getStageState(idx);
            const Icon = stage.icon;

            return (
              <div
                key={stage.id}
                className={`p-3.5 rounded border flex items-center justify-between transition-colors ${
                  state === 'completed'
                    ? 'border-[#10b981]/40 bg-[#10b981]/5'
                    : state === 'active'
                    ? 'border-[#0052ff] dark:border-[#3b82f6] bg-[#0052ff]/10 dark:bg-[#3b82f6]/20'
                    : state === 'failed'
                    ? 'border-[#ef4444]/40 bg-[#ef4444]/5'
                    : 'border-[#D5D5CE] dark:border-[#29342F] bg-[#EAEAE5] dark:bg-[#151A17] opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-[#737688] dark:text-[#7D8681]">
                    {stage.stepNumber}
                  </span>
                  <div className="font-mono text-xs font-medium text-[#1a1c1c] dark:text-[#F2F2EE]">
                    {stage.title} {stage.subtitle}
                  </div>
                </div>

                <div>
                  {state === 'completed' ? (
                    <CheckCircle2 className="w-4 h-4 text-[#10b981]" />
                  ) : state === 'active' ? (
                    <Loader2 className="w-4 h-4 text-[#0052ff] dark:text-[#3b82f6] animate-spin" />
                  ) : state === 'failed' ? (
                    <XCircle className="w-4 h-4 text-[#ef4444]" />
                  ) : (
                    <Icon className="w-4 h-4 text-[#737688] dark:text-[#7D8681]" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3-Column Live Telemetry Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        
        {/* Telemetry Card 1: MAILIAC PIPELINE */}
        <div className="border border-[#D5D5CE] dark:border-[#29342F] bg-[#F2F2EE] dark:bg-[#1B211E] p-6 rounded shadow-sm relative transition-colors">
          <div className="font-mono text-xs font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-widest mb-4 flex justify-between items-center">
            <span>MAILIAC · PIPELINE</span>
            {isProcessing && <span className="w-2 h-2 rounded-full bg-[#0052ff] dark:bg-[#3b82f6] animate-ping" />}
            {isCompleted && <span className="w-2 h-2 rounded-full bg-[#10b981]" />}
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between border-b border-[#D5D5CE] dark:border-[#29342F] pb-2.5">
              <span className="text-[#737688] dark:text-[#7D8681]">Status</span>
              <span className="font-bold capitalize text-[#1a1c1c] dark:text-[#F2F2EE]">
                {job.status}
              </span>
            </div>

            <div className="flex justify-between border-b border-[#D5D5CE] dark:border-[#29342F] pb-2.5">
              <span className="text-[#737688] dark:text-[#7D8681]">Queue</span>
              <span className="text-[#1a1c1c] dark:text-[#F2F2EE]">email-forensics</span>
            </div>

            <div className="flex justify-between border-b border-[#D5D5CE] dark:border-[#29342F] pb-2.5">
              <span className="text-[#737688] dark:text-[#7D8681]">Worker</span>
              <span className="text-[#10b981] font-bold">Active</span>
            </div>

            <div className="flex justify-between pt-0.5">
              <span className="text-[#737688] dark:text-[#7D8681]">Execution Time</span>
              <span className="text-[#0052ff] dark:text-[#3b82f6] font-bold flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {elapsedMs > 0 ? `${(elapsedMs / 1000).toFixed(2)}s` : '0.00s'}
              </span>
            </div>
          </div>
        </div>

        {/* Telemetry Card 2: TRACE ROUTE */}
        <div className="border border-[#D5D5CE] dark:border-[#29342F] bg-[#F2F2EE] dark:bg-[#1B211E] p-6 rounded shadow-sm relative transition-colors">
          <div className="font-mono text-xs font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-widest mb-4 flex justify-between items-center">
            <span>TRACE · ROUTE</span>
            <Route className="w-3.5 h-3.5 text-[#0052ff] dark:text-[#3b82f6]" />
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center border-b border-[#D5D5CE] dark:border-[#29342F] pb-2.5">
              <span className="text-[#737688] dark:text-[#7D8681]">Hop 01</span>
              {job.report?.forensicPath?.[0] ? (
                <span className="text-[#10b981] font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {job.report.forensicPath[0].ip}
                </span>
              ) : isProcessing || isCompleted ? (
                <span className="text-[#10b981] font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Captured
                </span>
              ) : (
                <span className="text-[#737688]">Pending</span>
              )}
            </div>

            <div className="flex justify-between items-center border-b border-[#D5D5CE] dark:border-[#29342F] pb-2.5">
              <span className="text-[#737688] dark:text-[#7D8681]">Hop 02</span>
              {job.report?.forensicPath?.[1] ? (
                <span className="text-[#10b981] font-bold">
                  {job.report.forensicPath[1].ip}
                </span>
              ) : isProcessing ? (
                <span className="text-[#0052ff] dark:text-[#3b82f6] animate-pulse">
                  Identifying...
                </span>
              ) : isCompleted ? (
                <span className="text-[#10b981] font-bold">Verified</span>
              ) : (
                <span className="text-[#737688]">Pending</span>
              )}
            </div>

            <div className="flex justify-between items-center pt-0.5">
              <span className="text-[#737688] dark:text-[#7D8681]">Origin Domain</span>
              <span className="text-[#1a1c1c] dark:text-[#F2F2EE] font-semibold truncate max-w-[150px]">
                {job.report?.senderDomain || 'Extracting...'}
              </span>
            </div>
          </div>
        </div>

        {/* Telemetry Card 3: AUTHENTICATION */}
        <div className="border border-[#0052ff] dark:border-[#3b82f6] bg-[#0052ff]/5 dark:bg-[#3b82f6]/10 p-6 rounded shadow-sm relative bracket-corners overflow-hidden transition-colors">
          <div className="font-mono text-xs font-bold text-[#0052ff] dark:text-[#3b82f6] uppercase tracking-widest mb-4 flex justify-between items-center">
            <span>AUTHENTICATION</span>
            <Shield className="w-3.5 h-3.5" />
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between border-b border-[#0052ff]/20 dark:border-[#3b82f6]/20 pb-2.5">
              <span className="text-[#737688] dark:text-[#A0A7A3]">SPF</span>
              {job.report?.authResults ? (
                <span
                  className={`font-bold ${
                    job.report.authResults.spf === 'pass'
                      ? 'text-[#10b981]'
                      : 'text-[#ba1a1a] dark:text-[#ef4444]'
                  }`}
                >
                  {job.report.authResults.spf.toUpperCase()}
                </span>
              ) : isProcessing ? (
                <span className="text-[#0052ff] dark:text-[#3b82f6] animate-pulse">VALIDATING</span>
              ) : (
                <span className="text-[#737688]">PENDING</span>
              )}
            </div>

            <div className="flex justify-between border-b border-[#0052ff]/20 dark:border-[#3b82f6]/20 pb-2.5">
              <span className="text-[#737688] dark:text-[#A0A7A3]">DKIM</span>
              {job.report?.authResults ? (
                <span
                  className={`font-bold ${
                    job.report.authResults.dkim === 'pass'
                      ? 'text-[#10b981]'
                      : 'text-[#ba1a1a] dark:text-[#ef4444]'
                  }`}
                >
                  {job.report.authResults.dkim.toUpperCase()}
                </span>
              ) : isProcessing ? (
                <span className="text-[#0052ff] dark:text-[#3b82f6] animate-pulse">VALIDATING</span>
              ) : (
                <span className="text-[#737688]">PENDING</span>
              )}
            </div>

            <div className="flex justify-between pt-0.5">
              <span className="text-[#737688] dark:text-[#A0A7A3]">DMARC</span>
              {job.report?.authResults ? (
                <span
                  className={`font-bold ${
                    job.report.authResults.dmarcAlignment === 'strict' || job.report.authResults.dmarcAlignment === 'relaxed'
                      ? 'text-[#10b981]'
                      : 'text-[#ba1a1a] dark:text-[#ef4444]'
                  }`}
                >
                  {job.report.authResults.dmarcAlignment.toUpperCase()}
                </span>
              ) : isProcessing ? (
                <span className="text-[#0052ff] dark:text-[#3b82f6] animate-pulse">VALIDATING</span>
              ) : (
                <span className="text-[#737688]">PENDING</span>
              )}
            </div>
          </div>

          {/* Animated Scanning Laser Line */}
          {isProcessing && (
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0052ff]/10 dark:via-[#3b82f6]/15 to-transparent h-12 animate-[scan_2s_ease-in-out_infinite] pointer-events-none" />
          )}
        </div>
      </section>

      {/* Completion & Result Action Banner */}
      {isCompleted && (
        <div className="bg-[#10b981]/10 border border-[#10b981]/30 p-6 rounded flex flex-col sm:flex-row justify-between items-center gap-4 transition-all animate-fadeIn">
          <div>
            <div className="flex items-center gap-2 text-[#10b981] font-bold text-sm mb-1 font-mono">
              <CheckCircle2 className="w-5 h-5" />
              FORENSIC ANALYSIS COMPLETE
            </div>
            <p className="text-xs text-[#434656] dark:text-[#A0A7A3]">
              All 9 pipeline stages completed successfully in {(elapsedMs / 1000).toFixed(2)}s. Final Risk Score:{' '}
              <strong className="text-[#0052ff] dark:text-[#3b82f6]">
                {job.report?.riskMatrix.finalScore}/100
              </strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/analysis-console/${job.id}/evidence`}
              className="bg-[#0052ff] dark:bg-[#3b82f6] text-white text-xs font-semibold px-5 py-2.5 rounded hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors flex items-center gap-2 shadow-sm font-mono"
            >
              <FileText className="w-4 h-4" /> View Full Evidence Explorer <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              onClick={handleScrollToReport}
              className="border border-[#D5D5CE] dark:border-[#29342F] text-[#1a1c1c] dark:text-[#F2F2EE] text-xs font-semibold px-4 py-2.5 rounded hover:bg-[#EAEAE5] dark:hover:bg-[#151A17] transition-colors"
            >
              Overview Score
            </button>
            {onReset && (
              <button
                onClick={onReset}
                className="border border-[#D5D5CE] dark:border-[#29342F] text-[#1a1c1c] dark:text-[#F2F2EE] text-xs font-semibold px-4 py-2.5 rounded hover:bg-[#EAEAE5] dark:hover:bg-[#151A17] transition-colors"
              >
                Analyze Another
              </button>
            )}
          </div>
        </div>
      )}

      {/* Failure Action Banner */}
      {isFailed && (
        <div className="bg-[#ba1a1a]/10 border border-[#ba1a1a]/30 p-6 rounded flex flex-col sm:flex-row justify-between items-center gap-4 transition-all">
          <div>
            <div className="flex items-center gap-2 text-[#ba1a1a] dark:text-[#ef4444] font-bold text-sm mb-1 font-mono">
              <XCircle className="w-5 h-5" />
              ANALYSIS FAILED
            </div>
            <p className="text-xs text-[#434656] dark:text-[#A0A7A3]">
              The forensic worker encountered an issue: {job.error || 'Job execution interrupted.'}
            </p>
          </div>

          {onReset && (
            <button
              onClick={onReset}
              className="bg-[#ba1a1a] text-white text-xs font-semibold px-5 py-2.5 rounded hover:bg-[#93000a] transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Return to Upload
            </button>
          )}
        </div>
      )}
    </div>
  );
}
