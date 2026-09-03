'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { AnalysisReport, ForensicHop } from '@mailiac/shared-types';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Fingerprint,
  Route,
  BrainCircuit,
  FileText,
  CheckCircle2,
  Copy,
  Check,
  Download,
  Printer,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Globe,
  ArrowRight,
  Sparkles,
  Zap,
  Info,
  RefreshCw,
  X,
  Loader2,
} from 'lucide-react';
import AnalystFeedbackModal from './AnalystFeedbackModal';
import ReverseHopMapVisualizer from './ReverseHopMapVisualizer';
import {
  getPartitionedFindings,
  getAuthPostureSummary,
  classifyForensicHop,
  getOverrideDetails,
  getReportMetadataSummary,
  getAiDiagnosticsSummary,
  normalizeIntents,
} from '@/lib/findings';

interface EvidenceExplorerProps {
  report: AnalysisReport;
  caseId: string;
  onReportUpdated?: (updated: AnalysisReport) => void;
}

interface RiskVisuals {
  hex: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  label: string;
  verdictTitle: string;
  recommendation: string;
}

function getDynamicRiskVisuals(score: number, intentLabels: string[] = []): RiskVisuals {
  const joinedIntents = intentLabels.join(' ').toUpperCase();

  if (score < 30) {
    return {
      hex: '#10B981', // Emerald Green
      badgeBg: 'bg-emerald-50 dark:bg-green-500/15',
      badgeText: 'text-emerald-700 dark:text-green-400',
      badgeBorder: 'border-emerald-200 dark:border-green-500/30',
      label: 'SAFE',
      verdictTitle: 'This email shows no significant indicators of malicious intent.',
      recommendation: 'Safe to review. No immediate action required.',
    };
  }

  if (score < 70) {
    let specificVerdict = `This email exhibits suspicious characteristics and should be inspected before trusting.`;
    if (joinedIntents.includes('CREDENTIAL') || joinedIntents.includes('HARVESTING')) {
      specificVerdict = 'This email exhibits suspicious characteristics associated with credential harvesting or sender impersonation.';
    } else if (joinedIntents.includes('FINANCIAL') || joinedIntents.includes('WIRE') || joinedIntents.includes('COERCION')) {
      specificVerdict = 'This email exhibits suspicious characteristics associated with financial requests and coercion.';
    }

    return {
      hex: '#F59E0B', // Amber
      badgeBg: 'bg-amber-50 dark:bg-amber-500/15',
      badgeText: 'text-amber-700 dark:text-amber-400',
      badgeBorder: 'border-amber-200 dark:border-amber-500/30',
      label: 'SUSPICIOUS',
      verdictTitle: specificVerdict,
      recommendation: 'Review the sender and links carefully before interacting.',
    };
  }

  // score >= 70
  let criticalVerdict = 'High-confidence malicious email identified with critical threat indicators.';
  if (joinedIntents.includes('CREDENTIAL') || joinedIntents.includes('HARVESTING')) {
    criticalVerdict = 'Critical threat: High-confidence credential harvesting and domain spoofing detected.';
  } else if (joinedIntents.includes('FINANCIAL') || joinedIntents.includes('COERCION')) {
    criticalVerdict = 'Critical threat: Aggressive financial coercion and unauthorized transaction pressure detected.';
  }

  return {
    hex: '#EF4444', // Red
    badgeBg: 'bg-red-50 dark:bg-[#EF4444]/15',
    badgeText: 'text-red-700 dark:text-[#EF4444]',
    badgeBorder: 'border-red-200 dark:border-[#EF4444]/30',
    label: 'QUARANTINE',
    verdictTitle: criticalVerdict,
    recommendation: 'Do not interact with this email. Quarantine and verify sender authenticity.',
  };
}

function synthesizeAiInterpretation(
  intentLabels: string[],
  score: number,
  senderDomain: string
): string {
  const joinedIntents = intentLabels.join(' ').toUpperCase();
  const humanIntents = intentLabels.map((i) => i.replace(/_/g, ' ').toLowerCase()).filter(Boolean);
  const primaryIntent = humanIntents[0] || 'benign communication';

  if (score <= 20) {
    if (senderDomain && senderDomain !== 'unknown') {
      return `The email shows no significant indicators of malicious intent. The sender domain (${senderDomain}) appears legitimate and the content is consistent with standard expected communication context.`;
    }
    return `The email shows no significant indicators of malicious intent. Cryptographic provenance is valid and the content is consistent with standard communication.`;
  }

  if (score <= 40) {
    return `The email exhibits minor linguistic or configuration anomalies. While no active malicious payload was confirmed, the communication context warrants review before interacting with attachments or links.`;
  }

  if (score <= 60) {
    return `The AI detected suspicious characteristics, including elevated urgency pressure or unaligned sender identity. Exercise caution and verify the sender before providing sensitive information.`;
  }

  if (score <= 80) {
    if (joinedIntents.includes('CREDENTIAL') || joinedIntents.includes('HARVESTING')) {
      return `The AI identified high-urgency credential harvesting patterns and deceptive authentication prompts. The sender domain or message structure is consistent with targeted phishing tactics.`;
    }
    if (joinedIntents.includes('FINANCIAL') || joinedIntents.includes('WIRE') || joinedIntents.includes('COERCION')) {
      return `The AI identified suspicious financial or invoice diversion requests using coercive urgency. The communication patterns deviate significantly from verified organizational protocols.`;
    }
    return `The AI detected multiple indicators of malicious intent associated with ${primaryIntent} and deceptive payload behavior.`;
  }

  // score > 80
  if (humanIntents.length > 1) {
    const listStr = humanIntents.slice(0, -1).join(', ') + ' and ' + humanIntents[humanIntents.length - 1];
    return `High-confidence malicious threat detected. The AI identified concurrent threat indicators including ${listStr}, deceptive sender impersonation, and fraudulent payload triggers requiring immediate quarantine.`;
  }

  return `High-confidence malicious threat detected. The AI identified aggressive deceptive intent, deceptive sender impersonation, and fraudulent payload triggers requiring immediate quarantine.`;
}

export default function EvidenceExplorer({ report: initialReport, caseId, onReportUpdated }: EvidenceExplorerProps): React.JSX.Element {
  const [report, setReport] = useState<AnalysisReport>(initialReport);
  useEffect(() => {
    setReport(initialReport);
  }, [initialReport]);

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isTechnicalExpanded, setIsTechnicalExpanded] = useState<boolean>(false);
  const [showRawJson, setShowRawJson] = useState<boolean>(false);
  const [animatedScore, setAnimatedScore] = useState<number>(0);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState<boolean>(false);
  const [showMinorAnomalies, setShowMinorAnomalies] = useState<boolean>(false);
  const [selectedHopIndex, setSelectedHopIndex] = useState<number | null>(null);
  const [showHopMap, setShowHopMap] = useState<boolean>(true);

  const router = useRouter();

  // Re-analysis states
  const [isConfirmReanalyzeOpen, setIsConfirmReanalyzeOpen] = useState<boolean>(false);
  const [isReanalyzing, setIsReanalyzing] = useState<boolean>(false);
  const [reanalyzeStatus, setReanalyzeStatus] = useState<string | null>(null);
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);
  const [reanalyzeSuccessToast, setReanalyzeSuccessToast] = useState<string | null>(null);

  const handleReanalyze = async (): Promise<void> => {
    setIsReanalyzing(true);
    setReanalyzeError(null);
    setReanalyzeSuccessToast(null);
    setReanalyzeStatus('Scheduling...');

    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(caseId)}/reanalyze`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Failed to schedule re-analysis' }));
        throw new Error(errData.error || `HTTP ${res.status}: Re-analysis rejected`);
      }

      const data = await res.json();
      const targetJobId = data.jobId || caseId;
      const fileName = report?.senderDomain ? `${report.senderDomain}.eml` : `case_${targetJobId.slice(0, 8)}.eml`;

      setReanalyzeStatus('Redirecting to pipeline...');

      // Redirect immediately to the sequential pipeline execution console
      router.push(`/forensic-analysis?jobId=${encodeURIComponent(targetJobId)}&fileName=${encodeURIComponent(fileName)}`);
    } catch (err: unknown) {
      setIsReanalyzing(false);
      setReanalyzeStatus(null);
      const msg = err instanceof Error ? err.message : 'Failed to execute re-analysis';
      setReanalyzeError(msg);
    }
  };

  const finalScore = Math.max(0, Math.min(100, report?.riskMatrix?.finalScore ?? 0));
  const normalizedIntents = useMemo(() => normalizeIntents(report?.aiSummary?.intent), [report?.aiSummary?.intent]);
  const intentList = useMemo(() => normalizedIntents.map((i) => i.raw), [normalizedIntents]);
  const riskVisuals = useMemo(() => getDynamicRiskVisuals(finalScore, intentList), [finalScore, intentList]);

  // Smooth score entrance animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedScore(finalScore);
    }, 100);
    return (): void => {
      clearTimeout(timer);
    };
  }, [finalScore]);

  // SVG Circle Calculations
  const radius = 45;
  const circumference = 2 * Math.PI * radius; // ~282.743
  const strokeOffset = circumference - (circumference * Math.min(100, Math.max(0, animatedScore))) / 100;

  // Copy Helper
  const handleCopy = (text: string, fieldKey: string): void => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // PDF Export Flow
  const handleExportPdf = (): void => {
    setIsExportingPdf(true);
    try {
      window.open(`/api/reports/${encodeURIComponent(caseId)}/pdf`, '_blank');
    } finally {
      setTimeout(() => setIsExportingPdf(false), 1200);
    }
  };

  // JSON Export Flow
  const handleExportJson = (): void => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `mailiac_forensic_evidence_${caseId}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Four Pillar Scores
  const pillars = report?.riskMatrix?.pillars;
  const authScore = pillars?.authentication?.score ?? report?.riskMatrix?.authScore ?? 0;
  const identityScore = pillars?.identity?.score ?? report?.riskMatrix?.identityScore ?? 0;
  const infraScore = pillars?.infrastructure?.score ?? report?.riskMatrix?.ipScore ?? 0;
  const nlpScore = pillars?.nlp?.score ?? report?.riskMatrix?.nlpScore ?? 0;

  // Traceable, Data-Driven Metadata Summary (Audited against API response)
  const metaSummary = useMemo(() => getReportMetadataSummary(report), [report]);

  // Synthesized AI Interpretation Narrative (1-3 sentences)
  const aiInterpretationNarrative = useMemo(() => {
    return synthesizeAiInterpretation(intentList, finalScore, report?.senderDomain || '');
  }, [intentList, finalScore, report?.senderDomain]);

  // Risk Matrix Override details
  const overrideDetails = useMemo(() => getOverrideDetails(report?.riskMatrix), [report?.riskMatrix]);

  // Grounded AI Diagnostics Summary
  const aiDiagnostics = useMemo(() => getAiDiagnosticsSummary(report), [report]);

  // "What This Means For You" Dynamic Synthesized Findings (3-5 human points max)
  const synthesizedKeyFindings = useMemo(() => {
    const bullets: { id: string; status: 'pass' | 'warn' | 'fail'; text: string }[] = [];

    // 1. Authentication Check (Evaluated directly from real RFC/SPF/DKIM/DMARC/ARC fields)
    const authSummary = getAuthPostureSummary(report?.authResults);
    bullets.push(authSummary);

    // 2. Domain Legitimacy Check
    const domainText = report?.senderDomain ? ` (${report.senderDomain})` : '';
    if (identityScore < 25) {
      bullets.push({
        id: 'id-pass',
        status: 'pass',
        text: `Sender domain appears legitimate${domainText}`,
      });
    } else if (identityScore < 60) {
      bullets.push({
        id: 'id-warn',
        status: 'warn',
        text: 'Display name does not clearly match sender domain',
      });
    } else {
      bullets.push({
        id: 'id-fail',
        status: 'fail',
        text: `Lookalike domain or homoglyph spoofing detected${domainText}`,
      });
    }

    // 3. AI / Phishing Intent Check (inspects across all detected intents)
    const joinedIntents = intentList.join(' ').toUpperCase();
    if (nlpScore < 25 && (joinedIntents.length === 0 || joinedIntents.includes('BENIGN'))) {
      bullets.push({
        id: 'nlp-pass',
        status: 'pass',
        text: 'No strong malicious intent detected by AI',
      });
    } else if (joinedIntents.includes('CREDENTIAL') || joinedIntents.includes('HARVESTING')) {
      bullets.push({
        id: 'nlp-cred',
        status: 'fail',
        text: 'AI detected credential harvesting patterns and phishing tactics',
      });
    } else if (joinedIntents.includes('FINANCIAL') || joinedIntents.includes('COERCION') || joinedIntents.includes('WIRE')) {
      bullets.push({
        id: 'nlp-fin',
        status: 'fail',
        text: 'AI identified suspicious financial coercion or invoice diversion requests',
      });
    } else if (joinedIntents.includes('AUTHORITY')) {
      bullets.push({
        id: 'nlp-auth-trap',
        status: 'fail',
        text: 'AI detected executive impersonation and authority trap manipulation',
      });
    } else {
      bullets.push({
        id: 'nlp-warn',
        status: 'warn',
        text: 'Suspicious urgency or psychological pressure detected in content',
      });
    }

    // 4. Infrastructure / Origin Check (if relevant)
    if (infraScore >= 40) {
      bullets.push({
        id: 'infra-flag',
        status: 'fail',
        text: 'Originating IP server flagged for proxy/VPN or abuse history',
      });
    }

    return bullets.slice(0, 4);
  }, [report, identityScore, nlpScore, infraScore, intentList]);

  // Partitioned Findings: Primary Actionable Threats (CRITICAL, HIGH, MEDIUM) & Minor Anomalies (LOW, INFO)
  const partitionedFindings = useMemo(() => {
    return getPartitionedFindings(report);
  }, [report]);

  const importantFindings = partitionedFindings.primaryFindings;


  // Pillar score color helper
  const getPillarSeverityColor = (score: number): { text: string; ring: string } => {
    if (score <= 20) return { text: 'text-[#10B981]', ring: 'bg-[#10B981]' };
    if (score <= 40) return { text: 'text-[#84CC16] dark:text-[#a3e635]', ring: 'bg-[#84CC16]' };
    if (score <= 60) return { text: 'text-[#F59E0B] dark:text-[#fbbf24]', ring: 'bg-[#F59E0B]' };
    if (score <= 80) return { text: 'text-[#F97316] dark:text-[#fb923c]', ring: 'bg-[#F97316]' };
    return { text: 'text-[#EF4444] dark:text-[#f87171]', ring: 'bg-[#EF4444]' };
  };

  // Auth Result Status Label & Color
  const getAuthBadge = (status: string | undefined): { label: string; color: string; bg: string } => {
    const s = (status || 'NONE').toUpperCase();
    if (s === 'PASS' || s === 'STRICT') {
      return { label: s, color: 'text-[#10B981]', bg: 'bg-[#10B981]/10' };
    }
    if (s === 'RELAXED') {
      return { label: 'RELAXED', color: 'text-[#10B981]', bg: 'bg-[#10B981]/10' };
    }
    if (s === 'FAIL') {
      return { label: 'FAIL', color: 'text-[#EF4444]', bg: 'bg-[#EF4444]/10' };
    }
    if (s === 'NEUTRAL') {
      return { label: 'NEUTRAL', color: 'text-[#F59E0B]', bg: 'bg-[#F59E0B]/10' };
    }
    return { label: s, color: 'text-[#737688] dark:text-[#A0A7A3]', bg: 'bg-[#EAEAE5] dark:bg-[#151A17]' };
  };

  // Truncate hash helper (data-driven, never fabricates empty-string SHA-256)
  const integrityHash = report?.aiSummary?.integrityHash || null;
  const displayHash = metaSummary.displayHash;

  return (
    <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 md:px-16 pt-8 pb-16 transition-colors duration-200">
      
      {/* ========================================================================= */}
      {/* 1. CASE HEADER & CONTROLS                                                */}
      {/* ========================================================================= */}
      <header className="mb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[#E5E5E5] dark:border-[#29342F] pb-8">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="font-mono text-[11px] font-bold tracking-wider uppercase bg-[#EAEAE5] dark:bg-[#151A17] text-[#434656] dark:text-[#A0A7A3] px-2 py-1 rounded">
                CASE ID
              </span>
              <div className="flex items-center gap-2 group">
                <span className="font-mono text-[13px] font-medium text-[#434656] dark:text-[#A0A7A3]">
                  {caseId}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(caseId, 'caseId')}
                  className="text-[#737688] hover:text-[#0052FF] dark:hover:text-[#3b82f6] transition-colors p-1"
                  title="Copy Case ID"
                >
                  {copiedField === 'caseId' ? (
                    <Check className="w-3.5 h-3.5 text-[#10B981]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
                  )}
                </button>
              </div>
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-[#121212] dark:text-[#F2F2EE]">
              Forensic Evidence
            </h1>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setIsConfirmReanalyzeOpen(true)}
              disabled={isReanalyzing}
              className="border border-[#0052ff] dark:border-[#3b82f6] text-[#0052ff] dark:text-[#3b82f6] hover:bg-[#0052ff]/10 dark:hover:bg-[#3b82f6]/20 px-4 py-2.5 rounded text-xs font-mono font-bold inline-flex items-center gap-1.5 transition-colors bg-[#FFFFFF] dark:bg-[#151A17] shadow-sm disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
              title="Re-run forensic pipeline on this email using current engine code and scoring algorithms"
            >
              <RefreshCw className={`w-4 h-4 ${isReanalyzing ? 'animate-spin' : ''}`} />
              <span>{isReanalyzing ? (reanalyzeStatus || 'RE-ANALYZING...') : 'RE-ANALYZE CASE'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFeedbackModalOpen(true)}
              className="border border-[#0052ff] dark:border-[#3b82f6] text-[#0052ff] dark:text-[#3b82f6] hover:bg-[#0052ff]/10 dark:hover:bg-[#3b82f6]/20 px-4 py-2.5 rounded text-xs font-mono font-bold inline-flex items-center gap-1.5 transition-colors bg-[#FFFFFF] dark:bg-[#151A17] shadow-sm"
              title="Submit SOC Analyst Feedback & Ground-Truth Calibration"
            >
              <ShieldCheck className="w-4 h-4" /> Submit Feedback
            </button>

            <div className="flex items-center gap-2 border border-[#E5E5E5] dark:border-[#29342F] bg-[#FFFFFF] dark:bg-[#151A17] px-4 py-2 rounded shadow-sm">
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
              <span className="font-mono text-[11px] font-bold text-[#121212] dark:text-[#F2F2EE] tracking-wider">
                Status: COMPLETE
              </span>
            </div>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="bg-[#0052FF] dark:bg-[#3b82f6] text-white font-mono text-[11px] font-bold tracking-wider px-6 py-2.5 rounded hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-all border border-[#0052FF] dark:border-[#3b82f6] shadow-sm flex items-center gap-2 active:scale-95 disabled:opacity-75 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>{isExportingPdf ? 'GENERATING REPORT...' : 'EXPORT FORENSIC REPORT'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Re-analysis Feedback Notifications */}
      {reanalyzeSuccessToast && (
        <div className="mb-6 p-4 bg-emerald-50 dark:bg-green-500/10 border border-emerald-300 dark:border-green-500/30 rounded flex items-center justify-between text-xs font-mono text-emerald-800 dark:text-green-300 animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-green-400 shrink-0" />
            <span>{reanalyzeSuccessToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setReanalyzeSuccessToast(null)}
            className="text-emerald-700 hover:text-emerald-900 dark:text-green-400 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {reanalyzeError && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded flex items-center justify-between text-xs font-mono text-red-800 dark:text-red-300 animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
            <span>{reanalyzeError}</span>
          </div>
          <button
            type="button"
            onClick={() => setReanalyzeError(null)}
            className="text-red-700 hover:text-red-900 dark:text-red-400 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. PRIMARY HERO: OVERALL VERDICT (WHAT IS THE RESULT? HOW RISKY?)         */}
      {/* ========================================================================= */}
      <section className="mb-8">
        <div className="border border-[#E5E5E5] dark:border-[#29342F] bg-[#FFFFFF] dark:bg-[#151A17] p-6 sm:p-10 rounded shadow-sm flex flex-col md:flex-row items-center md:items-start gap-8 md:gap-12 transition-colors">
          
          {/* Large Dynamic Risk Score Ring */}
          <div className="flex flex-col items-center flex-shrink-0">
            <div className="relative w-52 h-52 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                {/* Background Ring Track */}
                <circle
                  className="text-[#EAEAE5] dark:text-[#222B27] stroke-current"
                  cx="50"
                  cy="50"
                  fill="transparent"
                  r={radius}
                  strokeWidth="8"
                />
                {/* Dynamic Proportional Risk Ring Fill */}
                <circle
                  cx="50"
                  cy="50"
                  fill="transparent"
                  r={radius}
                  stroke={riskVisuals.hex}
                  strokeLinecap="round"
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeOffset}
                  style={{
                    transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.6s ease',
                  }}
                />
              </svg>

              {/* Inside Ring: Large Hero Number */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none pointer-events-none">
                <span
                  className="text-6xl sm:text-7xl font-extrabold leading-none tracking-tight transition-colors"
                  style={{ color: riskVisuals.hex }}
                >
                  {finalScore}
                </span>
                <span className="font-mono text-[11px] font-bold tracking-wider text-[#737688] dark:text-[#A0A7A3] mt-2 uppercase">
                  / 100 RISK
                </span>
              </div>
            </div>

            {/* Severity Status Badge */}
            <div className="mt-3 text-center">
              <div
                className={`inline-flex items-center gap-1.5 ${riskVisuals.badgeBg} ${riskVisuals.badgeText} ${riskVisuals.badgeBorder} border px-3 py-1 rounded font-mono text-[11px] font-bold tracking-wider uppercase`}
              >
                {finalScore <= 20 ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : finalScore <= 60 ? (
                  <AlertTriangle className="w-3.5 h-3.5" />
                ) : (
                  <ShieldAlert className="w-3.5 h-3.5" />
                )}
                <span>{riskVisuals.label}</span>
              </div>
            </div>
          </div>

          {/* Hero Content & Decision Architecture */}
          <div className="flex-grow text-center md:text-left w-full">
            
            {/* Header row: Risk verdict */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 justify-center md:justify-start">
                <span className="font-mono text-[11px] font-bold tracking-wider uppercase text-[#737688] dark:text-[#A0A7A3]">
                  OVERALL RISK VERDICT
                </span>
              </div>
            </div>

            {/* Single Concise Executive Override Callout */}
            {overrideDetails.isOverridden && (
              <div className="mb-4 p-3 bg-[#EF4444]/10 border border-[#EF4444]/25 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-left">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-[#EF4444] shrink-0" />
                  <span className="font-mono text-xs font-bold text-[#EF4444] uppercase tracking-wide">
                    Score overridden by circuit breaker
                  </span>
                  <span className="text-xs text-[#737688] dark:text-[#A0A7A3] hidden md:inline">
                    · {overrideDetails.reason || 'Fatal circuit breaker matched actionable threat indicators'}
                  </span>
                </div>
                <span className="font-mono text-xs font-bold text-[#EF4444] bg-[#EF4444]/15 px-2.5 py-0.5 rounded border border-[#EF4444]/30 shrink-0">
                  Base {overrideDetails.baseScore} → Final {overrideDetails.finalScore}
                </span>
              </div>
            )}

            {/* Clear Human-Readable Verdict */}
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#121212] dark:text-[#F2F2EE] mb-6 leading-snug">
              {riskVisuals.verdictTitle}
            </h2>

            {/* WHAT THIS MEANS FOR YOU & RECOMMENDED ACTION */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-6 border-t border-[#E5E5E5] dark:border-[#29342F]">
              
              {/* Left 7 Cols: What This Means For You */}
              <div className="md:col-span-7">
                <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#737688] dark:text-[#A0A7A3] mb-3 pb-1 border-b border-[#E5E5E5] dark:border-[#29342F]">
                  WHAT THIS MEANS FOR YOU
                </h3>
                <ul className="space-y-2.5 text-sm text-[#121212] dark:text-[#F2F2EE] text-left">
                  {synthesizedKeyFindings.map((bullet) => (
                    <li key={bullet.id} className="flex items-start gap-2">
                      {bullet.status === 'pass' ? (
                        <Check className="w-4 h-4 text-[#10B981] mt-0.5 shrink-0" />
                      ) : bullet.status === 'warn' ? (
                        <AlertTriangle className="w-4 h-4 text-[#F59E0B] mt-0.5 shrink-0" />
                      ) : (
                        <ShieldAlert className="w-4 h-4 text-[#EF4444] mt-0.5 shrink-0" />
                      )}
                      <span className="leading-tight text-xs sm:text-sm font-medium">{bullet.text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Right 5 Cols: Recommended Action */}
              <div className="md:col-span-5 flex flex-col">
                <h3 className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#737688] dark:text-[#A0A7A3] mb-3 pb-1 border-b border-[#E5E5E5] dark:border-[#29342F]">
                  RECOMMENDED ACTION
                </h3>
                <div className="bg-[#F2F2EE] dark:bg-[#1B211E] p-4 rounded border border-[#E5E5E5] dark:border-[#29342F] text-left flex-1 flex flex-col justify-center">
                  <p className="text-xs sm:text-sm font-semibold text-[#121212] dark:text-[#F2F2EE] leading-relaxed">
                    {riskVisuals.recommendation}
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. AI FORENSIC ASSESSMENT & 4-PILLAR RISK BREAKDOWN (SUPPORTING CARDS)    */}
      {/* ========================================================================= */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        
        {/* Left Column (6 Cols): AI FORENSIC ASSESSMENT CARD (SEMANTIC INTELLIGENCE) */}
        <div className="lg:col-span-6 border border-[#E5E5E5] dark:border-[#29342F] bg-[#FFFFFF] dark:bg-[#151A17] p-6 rounded shadow-sm transition-colors flex flex-col justify-between h-full">
          <div>
            {/* Header with AI indicator */}
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#E5E5E5] dark:border-[#29342F]">
              <div className="flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-[#0052FF] dark:text-[#3b82f6]" />
                <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#737688] dark:text-[#A0A7A3]">
                  AI FORENSIC ASSESSMENT
                </h2>
              </div>
              <span className="font-mono text-[10px] font-bold tracking-wider text-[#0052FF] dark:text-[#3b82f6] bg-[#0052FF]/10 dark:bg-[#3b82f6]/10 px-2 py-0.5 rounded flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> SEMANTIC INTEL
              </span>
            </div>
            
            {/* Model Interpretation Narrative */}
            <div className="mb-4">
              <div className="font-mono text-[10px] font-bold tracking-wider uppercase text-[#737688] dark:text-[#A0A7A3] mb-1.5">
                MODEL INTERPRETATION
              </div>
              <p className="text-sm font-medium text-[#121212] dark:text-[#F2F2EE] leading-relaxed">
                {aiInterpretationNarrative}
              </p>
            </div>

            {/* Behavioral Motives (Intent Vectors) */}
            <div className="mb-4">
              <div className="font-mono text-[10px] font-bold tracking-wider text-[#737688] dark:text-[#A0A7A3] uppercase mb-2 flex items-center justify-between">
                <span>BEHAVIORAL MOTIVES</span>
                {normalizedIntents.length > 0 && (
                  <span className="text-[10px] text-[#0052FF] dark:text-[#3b82f6]">
                    {normalizedIntents.length} {normalizedIntents.length === 1 ? 'Vector' : 'Vectors'} Identified
                  </span>
                )}
              </div>
              {normalizedIntents.length > 0 ? (
                <div className="flex flex-wrap gap-2 items-center">
                  {normalizedIntents.map((intentObj, idx) => (
                    <span
                      key={`${intentObj.raw}-${idx}`}
                      className={`inline-flex items-center px-2.5 py-1 rounded font-mono text-xs font-semibold border tracking-tight ${intentObj.badgeBg} ${intentObj.badgeText} ${intentObj.badgeBorder}`}
                    >
                      {intentObj.label}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-xs font-mono text-[#737688] dark:text-[#A0A7A3] italic">
                  No behavioral threat vectors identified.
                </div>
              )}
            </div>
          </div>

          {/* AI Diagnostics & Telemetry Panel (Grounded in payload data) */}
          <div className="pt-4 border-t border-[#E5E5E5] dark:border-[#29342F] mt-auto">
            <div className="font-mono text-[10px] font-bold tracking-wider uppercase text-[#737688] dark:text-[#A0A7A3] mb-2.5">
              AI DIAGNOSTICS & TELEMETRY
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Metric 1: Confidence (Primary location) */}
              <div className="p-2.5 bg-[#F2F2EE] dark:bg-[#1B211E] rounded border border-[#E5E5E5] dark:border-[#29342F]">
                <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#737688] dark:text-[#A0A7A3] mb-1">
                  CONFIDENCE
                </div>
                <div className="text-sm font-bold text-[#121212] dark:text-[#F2F2EE]">
                  {aiDiagnostics.confidencePercent !== null ? `${aiDiagnostics.confidencePercent}%` : 'Unavailable'}
                </div>
              </div>

              {/* Metric 2: Urgency */}
              <div className="p-2.5 bg-[#F2F2EE] dark:bg-[#1B211E] rounded border border-[#E5E5E5] dark:border-[#29342F]">
                <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#737688] dark:text-[#A0A7A3] mb-1">
                  URGENCY
                </div>
                <div
                  className={`text-sm font-bold ${
                    aiDiagnostics.urgencyLabel === 'HIGH'
                      ? 'text-[#EF4444]'
                      : aiDiagnostics.urgencyLabel === 'MODERATE'
                      ? 'text-[#F59E0B]'
                      : 'text-[#10B981]'
                  }`}
                >
                  {aiDiagnostics.urgencyLabel}
                </div>
              </div>

              {/* Metric 3: Engine */}
              <div className="p-2.5 bg-[#F2F2EE] dark:bg-[#1B211E] rounded border border-[#E5E5E5] dark:border-[#29342F]">
                <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#737688] dark:text-[#A0A7A3] mb-1">
                  ENGINE
                </div>
                <div className="text-xs font-bold text-[#121212] dark:text-[#F2F2EE] truncate" title={aiDiagnostics.modelLabel}>
                  {aiDiagnostics.modelLabel}
                </div>
              </div>

              {/* Metric 4: Obfuscation */}
              <div className="p-2.5 bg-[#F2F2EE] dark:bg-[#1B211E] rounded border border-[#E5E5E5] dark:border-[#29342F]">
                <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#737688] dark:text-[#A0A7A3] mb-1">
                  OBFUSCATION
                </div>
                <div
                  className={`text-xs font-bold truncate ${
                    aiDiagnostics.hasObfuscation ? 'text-[#EF4444]' : 'text-[#10B981]'
                  }`}
                  title={aiDiagnostics.obfuscationDetails || (aiDiagnostics.hasObfuscation ? 'Detected' : 'None')}
                >
                  {aiDiagnostics.hasObfuscation ? 'DETECTED' : 'CLEAN'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (6 Cols): 4-PILLAR RISK BREAKDOWN */}
        <div className="lg:col-span-6 border border-[#E5E5E5] dark:border-[#29342F] bg-[#FFFFFF] dark:bg-[#151A17] p-6 rounded shadow-sm transition-colors flex flex-col justify-between h-full">
          <div>
            <div className="flex justify-between items-center mb-4 border-b border-[#E5E5E5] dark:border-[#29342F] pb-2">
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#737688] dark:text-[#A0A7A3]">
                RISK BREAKDOWN
              </h2>
              <span className="text-[11px] font-mono text-[#737688] dark:text-[#A0A7A3]">
                4 Supporting Dimensions
              </span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Pillar 1: Authentication */}
              {(() : React.ReactNode => {
                const sev = getPillarSeverityColor(authScore);
                return (
                  <div className="bg-[#F2F2EE] dark:bg-[#1B211E] p-3 rounded border border-[#E5E5E5] dark:border-[#29342F] flex flex-col justify-between">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-mono text-xs font-bold text-[#121212] dark:text-[#F2F2EE] flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#3b82f6]" /> AUTHENTICATION
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-[#737688] dark:text-[#A0A7A3]">
                          ({Math.round(overrideDetails.pillarWeights.auth * 100)}%)
                        </span>
                        <span className={`font-mono text-xs font-extrabold ${sev.text}`}>
                          {authScore} / 100
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-[#737688] dark:text-[#A0A7A3]">
                      SPF, DKIM, DMARC and ARC checks.
                    </p>
                  </div>
                );
              })()}

              {/* Pillar 2: Identity */}
              {(() : React.ReactNode => {
                const sev = getPillarSeverityColor(identityScore);
                return (
                  <div className="bg-[#F2F2EE] dark:bg-[#1B211E] p-3 rounded border border-[#E5E5E5] dark:border-[#29342F] flex flex-col justify-between">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-mono text-xs font-bold text-[#121212] dark:text-[#F2F2EE] flex items-center gap-1.5">
                        <Fingerprint className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#3b82f6]" /> IDENTITY
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-[#737688] dark:text-[#A0A7A3]">
                          ({Math.round(overrideDetails.pillarWeights.identity * 100)}%)
                        </span>
                        <span className={`font-mono text-xs font-extrabold ${sev.text}`}>
                          {identityScore} / 100
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-[#737688] dark:text-[#A0A7A3]">
                      Sender identity and domain consistency.
                    </p>
                  </div>
                );
              })()}

              {/* Pillar 3: Infrastructure */}
              {(() : React.ReactNode => {
                const sev = getPillarSeverityColor(infraScore);
                return (
                  <div className="bg-[#F2F2EE] dark:bg-[#1B211E] p-3 rounded border border-[#E5E5E5] dark:border-[#29342F] flex flex-col justify-between">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-mono text-xs font-bold text-[#121212] dark:text-[#F2F2EE] flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#3b82f6]" /> INFRASTRUCTURE
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-[#737688] dark:text-[#A0A7A3]">
                          ({Math.round(overrideDetails.pillarWeights.infra * 100)}%)
                        </span>
                        <span className={`font-mono text-xs font-extrabold ${sev.text}`}>
                          {infraScore} / 100
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-[#737688] dark:text-[#A0A7A3]">
                      IP reputation and routing signals.
                    </p>
                  </div>
                );
              })()}

              {/* Pillar 4: AI / Intent */}
              {(() : React.ReactNode => {
                const sev = getPillarSeverityColor(nlpScore);
                return (
                  <div className="bg-[#F2F2EE] dark:bg-[#1B211E] p-3 rounded border border-[#E5E5E5] dark:border-[#29342F] flex flex-col justify-between">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-mono text-xs font-bold text-[#121212] dark:text-[#F2F2EE] flex items-center gap-1.5">
                        <BrainCircuit className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#3b82f6]" /> AI / INTENT
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-[#737688] dark:text-[#A0A7A3]">
                          ({Math.round(overrideDetails.pillarWeights.nlp * 100)}%)
                        </span>
                        <span className={`font-mono text-xs font-extrabold ${sev.text}`}>
                          {nlpScore} / 100
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-[#737688] dark:text-[#A0A7A3]">
                      Language, intent and behavioral indicators.
                    </p>
                  </div>
                );
              })()}
            </div>

            {/* Calculation Reconciliation Bar */}
            <div className="mt-3 p-3 bg-[#F2F2EE] dark:bg-[#1B211E] rounded border border-[#E5E5E5] dark:border-[#29342F] text-xs font-mono">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[#737688] dark:text-[#A0A7A3]">
                <span className="font-bold text-[#121212] dark:text-[#F2F2EE] uppercase">
                  WEIGHTED BASE SCORE:
                </span>
                <span className="text-xs">
                  ({authScore}×{Math.round(overrideDetails.pillarWeights.auth * 100)}%) + ({identityScore}×{Math.round(overrideDetails.pillarWeights.identity * 100)}%) + ({infraScore}×{Math.round(overrideDetails.pillarWeights.infra * 100)}%) + ({nlpScore}×{Math.round(overrideDetails.pillarWeights.nlp * 100)}%) = <strong className="text-[#121212] dark:text-[#F2F2EE]">{overrideDetails.baseScore}</strong> / 100
                </span>
              </div>

              {overrideDetails.isOverridden ? (
                <div className="mt-2 pt-2 border-t border-dashed border-[#E5E5E5] dark:border-[#29342F] flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                  <div className="flex items-center gap-1.5 text-[#EF4444] font-bold">
                    <Zap className="w-3.5 h-3.5 fill-[#EF4444] shrink-0" />
                    <span>CIRCUIT BREAKER OVERRIDE:</span>
                  </div>
                  <div className="font-bold text-[#EF4444]">
                    Base {overrideDetails.baseScore} → Final {overrideDetails.finalScore} ({overrideDetails.scoreDifference >= 0 ? `+${overrideDetails.scoreDifference}` : overrideDetails.scoreDifference})
                  </div>
                </div>
              ) : (
                <div className="mt-2 pt-2 border-t border-dashed border-[#E5E5E5] dark:border-[#29342F] flex items-center gap-1.5 text-[11px] text-[#10B981]">
                  <Check className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                  <span>Final risk score matches standard weighted calculation</span>
                </div>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-[#E5E5E5] dark:border-[#29342F] mt-auto flex justify-between items-center text-[11px] font-mono text-[#737688] dark:text-[#A0A7A3]">
            <span>
              {metaSummary.executionTimeFormatted ? `PIPELINE EXECUTION: ${metaSummary.executionTimeFormatted}` : 'PIPELINE: ASYNCHRONOUS'}
            </span>
            <span>
              PILLARS EVALUATED: {metaSummary.evaluatedPillarsCount} / 4
            </span>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. IMPORTANT FINDINGS (CANONICAL FORENSIC EVIDENCE)                       */}
      {/* ========================================================================= */}
      <section className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2.5">
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#737688] dark:text-[#A0A7A3]">
              IMPORTANT FINDINGS
            </h2>
            {partitionedFindings.forensicCount > 0 && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#EF4444]/10 text-[#EF4444] font-bold">
                {importantFindings.length} Actionable {importantFindings.length === 1 ? 'Signal' : 'Signals'}
              </span>
            )}
          </div>
          <span className="text-[11px] font-mono text-[#737688] dark:text-[#A0A7A3]">
            {partitionedFindings.forensicCount === 0
              ? 'Zero Threat Indicators'
              : `${partitionedFindings.forensicCount} Forensic ${partitionedFindings.forensicCount === 1 ? 'Finding' : 'Findings'}`}
          </span>
        </div>

        {importantFindings.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {importantFindings.map((card) => {
              const isCritical = card.severity === 'CRITICAL';
              const isHigh = card.severity === 'HIGH';
              const isMedium = card.severity === 'MEDIUM';

              const badgeColor = isCritical
                ? 'bg-[#EF4444] text-white border-[#EF4444]'
                : isHigh
                ? 'bg-[#EF4444]/10 text-[#EF4444] dark:text-[#f87171] border-[#EF4444]/30'
                : isMedium
                ? 'bg-[#F59E0B]/10 text-[#F59E0B] dark:text-[#fbbf24] border-[#F59E0B]/30'
                : 'bg-[#0052FF]/10 text-[#0052FF] dark:text-[#3b82f6] border-[#0052FF]/30';

              const sevPillColor = isCritical
                ? 'bg-[#EF4444] text-white border-[#EF4444]'
                : isHigh
                ? 'bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30'
                : isMedium
                ? 'bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30'
                : 'bg-[#0052FF]/15 text-[#0052FF] dark:text-[#3b82f6] border-[#0052FF]/30';

              return (
                <div
                  key={card.id}
                  className={`border ${
                    isCritical
                      ? 'border-[#EF4444]/50 bg-[#EF4444]/5 dark:bg-[#EF4444]/10'
                      : 'border-[#E5E5E5] dark:border-[#29342F] bg-[#FFFFFF] dark:bg-[#151A17]'
                  } p-5 rounded flex flex-col justify-between shadow-sm transition-colors`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded border ${badgeColor}`}
                      >
                        {card.title}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border tracking-wider uppercase ${sevPillColor}`}
                        >
                          {card.severity}
                        </span>
                        {isCritical || isHigh ? (
                          <ShieldAlert className="w-4 h-4 text-[#EF4444] shrink-0" />
                        ) : isMedium ? (
                          <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
                        ) : (
                          <Info className="w-4 h-4 text-[#0052FF] dark:text-[#3b82f6] shrink-0" />
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-[#121212] dark:text-[#F2F2EE] font-medium leading-relaxed mt-2.5">
                      {card.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : partitionedFindings.minorAnomalies.length === 0 ? (
          <div className="border border-[#10B981]/30 bg-[#10B981]/5 dark:bg-[#10B981]/10 p-6 rounded text-center">
            <CheckCircle2 className="w-6 h-6 text-[#10B981] mx-auto mb-2" />
            <div className="font-mono text-xs font-bold text-[#10B981] uppercase tracking-wider">
              No Security Findings or Threat Anomalies
            </div>
            <p className="text-xs text-[#737688] dark:text-[#A0A7A3] mt-1 max-w-md mx-auto leading-relaxed">
              All forensic pillars evaluated without actionable threats or anomalous signals.
            </p>
          </div>
        ) : null}

        {/* Minor Anomalies & Low-Severity Secondary Collapsible Tray */}
        {partitionedFindings.minorAnomalies.length > 0 && (
          <div className="mt-4 border border-[#E5E5E5] dark:border-[#29342F] bg-[#FFFFFF] dark:bg-[#151A17] rounded shadow-sm overflow-hidden transition-colors">
            <button
              type="button"
              onClick={() => setShowMinorAnomalies(!showMinorAnomalies)}
              className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-[#F2F2EE]/60 dark:hover:bg-[#1B211E]/60 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-mono text-xs font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider">
                  Minor Anomalies & Low-Severity Signals ({partitionedFindings.minorAnomalies.length})
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0052FF]/10 text-[#0052FF] dark:text-[#3b82f6] font-semibold border border-[#0052FF]/20">
                  LOW / INFO TELEMETRY
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono text-[#0052FF] dark:text-[#3b82f6] font-bold">
                <span>{showMinorAnomalies ? 'Hide Minor Signals' : 'Expand Minor Signals'}</span>
                {showMinorAnomalies ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </div>
            </button>

            {showMinorAnomalies && (
              <div className="p-4 border-t border-[#E5E5E5] dark:border-[#29342F] bg-[#F2F2EE]/40 dark:bg-[#1B211E]/40 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {partitionedFindings.minorAnomalies.map((minorCard) => (
                  <div
                    key={minorCard.id}
                    className="p-3.5 bg-[#FFFFFF] dark:bg-[#151A17] border border-[#E5E5E5] dark:border-[#29342F] rounded shadow-xs flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-[#0052FF]/10 text-[#0052FF] dark:text-[#3b82f6] border border-[#0052FF]/20">
                        {minorCard.title}
                      </span>
                      <span className="font-mono text-[10px] text-[#737688] dark:text-[#A0A7A3] font-bold">
                        {minorCard.severity}
                      </span>
                    </div>
                    <p className="text-xs text-[#434656] dark:text-[#A0A7A3] leading-relaxed mt-1">
                      {minorCard.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 5. TECHNICAL EVIDENCE (COLLAPSIBLE / SECONDARY PROGRESSIVE DISCLOSURE)    */}
      {/* ========================================================================= */}
      <section
        id="technical-evidence-section"
        className="mt-8 border border-[#E5E5E5] dark:border-[#29342F] bg-[#FFFFFF] dark:bg-[#151A17] p-6 sm:p-8 rounded shadow-sm transition-colors"
      >
        <div className="flex justify-between items-center border-b border-[#E5E5E5] dark:border-[#29342F] pb-4">
          <div>
            <h2 className="font-mono text-[11px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider">
              TECHNICAL EVIDENCE
            </h2>
            <p className="text-xs text-[#737688] dark:text-[#A0A7A3] mt-0.5">
              Detailed cryptographic records, reverse-hop routing, and system metadata.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsTechnicalExpanded(!isTechnicalExpanded)}
              className="bg-[#F2F2EE] dark:bg-[#1B211E] border border-[#E5E5E5] dark:border-[#29342F] px-4 py-2 rounded text-xs font-mono font-bold text-[#0052FF] dark:text-[#3b82f6] hover:border-[#0052FF] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>{isTechnicalExpanded ? 'Collapse Technical View' : 'Expand Technical Evidence'}</span>
              {isTechnicalExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              className="text-xs font-mono text-[#737688] dark:text-[#A0A7A3] hover:text-[#121212] dark:hover:text-[#F2F2EE] flex items-center gap-1 cursor-pointer"
              title="Download Full Evidence JSON"
            >
              <Download className="w-3.5 h-3.5" /> JSON
            </button>
          </div>
        </div>

        {/* Collapsed summary pill bar */}
        {!isTechnicalExpanded && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-[#737688] dark:text-[#A0A7A3] pt-2">
            <div className="flex items-center gap-4 flex-wrap">
              {(() : React.ReactNode => {
                const spfBadge = getAuthBadge(report?.authResults?.spf);
                const dkimBadge = getAuthBadge(report?.authResults?.dkim);
                const dmarcBadge = getAuthBadge(report?.authResults?.dmarcAlignment);
                const arcPass = report?.authResults?.arcPass;
                return (
                  <>
                    <span>SPF: <strong className={spfBadge.color}>{spfBadge.label}</strong></span>
                    <span>DKIM: <strong className={dkimBadge.color}>{dkimBadge.label}</strong></span>
                    <span>DMARC: <strong className={dmarcBadge.color}>{dmarcBadge.label}</strong></span>
                    <span>ARC: <strong className={arcPass ? 'text-[#10B981]' : 'text-[#737688] dark:text-[#A0A7A3]'}>{arcPass ? 'PASS' : 'NONE'}</strong></span>
                  </>
                );
              })()}
              <span>ROUTING: <strong>{report?.forensicPath?.length || 0} Network Hops Analyzed</strong></span>
            </div>
            <button
              type="button"
              onClick={() => setIsTechnicalExpanded(true)}
              className="text-xs font-mono text-[#0052FF] dark:text-[#3b82f6] hover:underline flex items-center gap-1"
            >
              View Full Logs <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Expanded Detailed Grid */}
        {isTechnicalExpanded && (
          <div className="mt-6 pt-2">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Left Column: Authentication Logs */}
              <div>
                <h3 className="text-sm font-bold text-[#121212] dark:text-[#F2F2EE] mb-4 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#0052FF] dark:text-[#3b82f6]" /> Authentication Logs
                </h3>
                
                <div className="flex flex-col gap-3 font-mono text-xs">
                  {/* SPF */}
                  {(() : React.ReactNode => {
                    const spfBadge = getAuthBadge(report?.authResults?.spf);
                    const desc =
                      report?.authResults?.spf === 'pass'
                        ? 'Sender IP authorized by domain policy'
                        : report?.authResults?.spf === 'fail'
                        ? 'Sender IP not authorized in SPF record'
                        : report?.authResults?.spf === 'neutral'
                        ? 'SPF policy evaluated to neutral (no policy restriction)'
                        : 'No SPF policy record published';
                    return (
                      <div className="flex justify-between items-center border-b border-[#E5E5E5] dark:border-[#29342F] pb-2.5">
                        <span className="font-bold text-[#121212] dark:text-[#F2F2EE]">SPF</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[#737688] dark:text-[#A0A7A3] hidden sm:inline">{desc}</span>
                          <span className={`font-bold px-2 py-0.5 rounded ${spfBadge.bg} ${spfBadge.color}`}>
                            {spfBadge.label}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* DKIM */}
                  {(() : React.ReactNode => {
                    const dkimBadge = getAuthBadge(report?.authResults?.dkim);
                    const desc =
                      report?.authResults?.dkim === 'pass'
                        ? 'Signature cryptographically verified'
                        : report?.authResults?.dkim === 'fail'
                        ? 'DKIM signature verification failed'
                        : 'No valid DKIM signature present';
                    return (
                      <div className="flex justify-between items-center border-b border-[#E5E5E5] dark:border-[#29342F] pb-2.5">
                        <span className="font-bold text-[#121212] dark:text-[#F2F2EE]">DKIM</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[#737688] dark:text-[#A0A7A3] hidden sm:inline">{desc}</span>
                          <span className={`font-bold px-2 py-0.5 rounded ${dkimBadge.bg} ${dkimBadge.color}`}>
                            {dkimBadge.label}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* DMARC */}
                  {(() : React.ReactNode => {
                    const dmarcBadge = getAuthBadge(report?.authResults?.dmarcAlignment);
                    const desc =
                      report?.authResults?.dmarcAlignment === 'strict'
                        ? 'Strict identifier alignment verified'
                        : report?.authResults?.dmarcAlignment === 'relaxed'
                        ? 'Relaxed domain policy alignment'
                        : 'DMARC alignment validation failed';
                    return (
                      <div className="flex justify-between items-center border-b border-[#E5E5E5] dark:border-[#29342F] pb-2.5">
                        <span className="font-bold text-[#121212] dark:text-[#F2F2EE]">DMARC</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[#737688] dark:text-[#A0A7A3] hidden sm:inline">{desc}</span>
                          <span className={`font-bold px-2 py-0.5 rounded ${dmarcBadge.bg} ${dmarcBadge.color}`}>
                            {dmarcBadge.label}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ARC */}
                  {(() : React.ReactNode => {
                    const arcPass = report?.authResults?.arcPass;
                    return (
                      <div className="flex justify-between items-center pb-1">
                        <span className="font-bold text-[#121212] dark:text-[#F2F2EE]">ARC</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-[#737688] dark:text-[#A0A7A3] hidden sm:inline">
                            {arcPass ? 'Authenticated Received Chain intact' : 'No forwarder ARC seal'}
                          </span>
                          <span
                            className={`font-bold px-2 py-0.5 rounded ${
                              arcPass ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#EAEAE5] dark:bg-[#151A17] text-[#737688] dark:text-[#A0A7A3]'
                            }`}
                          >
                            {arcPass ? 'PASS' : 'NONE'}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Right Column: Metadata */}
              <div>
                <h3 className="text-sm font-bold text-[#121212] dark:text-[#F2F2EE] mb-4 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#0052FF] dark:text-[#3b82f6]" /> Metadata & Provenance
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-xs">
                  <div className="border-t border-[#E5E5E5] dark:border-[#29342F] pt-2">
                    <div className="text-[11px] font-bold text-[#737688] dark:text-[#A0A7A3] mb-1 uppercase">
                      MESSAGE ID
                    </div>
                    <div
                      className="truncate text-[#121212] dark:text-[#F2F2EE] font-medium cursor-pointer hover:text-[#0052FF] dark:hover:text-[#3b82f6] transition-colors"
                      title={report?.messageId}
                      onClick={() => handleCopy(report?.messageId || '', 'messageId')}
                    >
                      {report?.messageId || 'N/A'}
                      {copiedField === 'messageId' && <span className="ml-1 text-[#10B981] font-bold">✓</span>}
                    </div>
                  </div>

                  <div className="border-t border-[#E5E5E5] dark:border-[#29342F] pt-2">
                    <div className="text-[11px] font-bold text-[#737688] dark:text-[#A0A7A3] mb-1 uppercase">
                      SENDER DOMAIN
                    </div>
                    <div className="text-[#121212] dark:text-[#F2F2EE] truncate font-medium">
                      {report?.senderDomain || 'N/A'}
                    </div>
                  </div>

                  <div className="border-t border-[#E5E5E5] dark:border-[#29342F] pt-2">
                    <div className="text-[11px] font-bold text-[#737688] dark:text-[#A0A7A3] mb-1 uppercase">
                      TIMESTAMP
                    </div>
                    <div className="text-[#121212] dark:text-[#F2F2EE] truncate font-medium">
                      {report?.timestamp || 'Unavailable'}
                    </div>
                  </div>

                  <div className="border-t border-[#E5E5E5] dark:border-[#29342F] pt-2">
                    <div className="text-[11px] font-bold text-[#737688] dark:text-[#A0A7A3] mb-1 uppercase">
                      EXECUTION TIME
                    </div>
                    <div className="text-[#0052FF] dark:text-[#3b82f6] font-bold">
                      {metaSummary.executionTimeFormatted ?? 'Unavailable'}
                    </div>
                  </div>

                  <div className="border-t border-[#E5E5E5] dark:border-[#29342F] pt-2 sm:col-span-2">
                    <div className="text-[11px] font-bold text-[#737688] dark:text-[#A0A7A3] mb-1 uppercase">
                      INTEGRITY HASH (HMAC-SHA256)
                    </div>
                    <div
                      className={`text-[#121212] dark:text-[#F2F2EE] truncate font-medium transition-colors ${
                        integrityHash ? 'cursor-pointer hover:text-[#0052FF] dark:hover:text-[#3b82f6]' : ''
                      }`}
                      title={integrityHash || 'Unavailable'}
                      onClick={() => {
                        if (integrityHash) handleCopy(integrityHash, 'hash');
                      }}
                    >
                      {displayHash}
                      {copiedField === 'hash' && <span className="ml-1 text-[#10B981] font-bold">✓</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Infrastructure Reverse-Hop Trace */}
            <div className="mt-8 pt-6 border-t border-[#E5E5E5] dark:border-[#29342F]">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-mono text-xs font-bold uppercase text-[#121212] dark:text-[#F2F2EE] flex items-center gap-2">
                  <Route className="w-4 h-4 text-[#0052FF] dark:text-[#3b82f6]" /> Reverse-Hop Dissection Trail ({report?.forensicPath?.length || 0} Network Hops Analyzed)
                </h4>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowHopMap(!showHopMap)}
                    className="text-xs font-mono text-[#0052FF] dark:text-[#3b82f6] hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>{showHopMap ? 'Hide Trace Map' : 'Show Trace Map'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRawJson(!showRawJson)}
                    className="text-xs font-mono text-[#0052FF] dark:text-[#3b82f6] hover:underline cursor-pointer"
                  >
                    {showRawJson ? 'Hide Raw JSON' : 'Toggle Raw JSON'}
                  </button>
                </div>
              </div>

              {/* Geographic Reverse-Hop Trace Map */}
              {showHopMap && (
                <div className="mb-4">
                  <ReverseHopMapVisualizer
                    hops={report?.forensicPath || []}
                    selectedHopIndex={selectedHopIndex}
                    onSelectHop={setSelectedHopIndex}
                  />
                </div>
              )}

              {report?.forensicPath && report.forensicPath.length > 0 ? (
                <div className="space-y-3 font-mono text-xs">
                  {report.forensicPath.map((hop: ForensicHop, index: number) => {
                    const classification = classifyForensicHop(hop);
                    const isSelected = selectedHopIndex === index;

                    return (
                      <div
                        key={index}
                        onClick={() => setSelectedHopIndex(isSelected ? null : index)}
                        className={`p-3 bg-[#F2F2EE] dark:bg-[#1B211E] rounded border ${
                          isSelected
                            ? 'border-[#0052FF] dark:border-[#3b82f6] ring-2 ring-[#0052FF]/30 dark:ring-[#3b82f6]/30 shadow-sm'
                            : 'border-[#E5E5E5] dark:border-[#29342F]'
                        } flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all cursor-pointer`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-[#0052FF]/10 text-[#0052FF] dark:text-[#3b82f6] flex items-center justify-center font-bold text-[11px]">
                            {index + 1}
                          </span>
                          <div>
                            <div className="font-bold text-[#121212] dark:text-[#F2F2EE] flex items-center gap-1.5 flex-wrap">
                              <span>{hop.ip}</span>
                              {hop.hostnameClaimed && (
                                <span className="font-normal text-[#737688] dark:text-[#A0A7A3]">
                                  ({hop.hostnameClaimed})
                                </span>
                              )}
                              {classification.isSuspiciousHostname && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/30 uppercase"
                                  title={classification.suspiciousReason || 'Suspicious pseudo-domain or non-FQDN'}
                                >
                                  SUSPICIOUS HOSTNAME
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#737688] dark:text-[#A0A7A3]">
                              {hop.city ? `${hop.city}, ` : ''}{hop.country || 'Unknown Location'} · ASN: {hop.asn || 'N/A'}
                            </div>
                            <div className="text-[10px] text-[#737688] dark:text-[#A0A7A3] mt-1 flex items-center gap-1.5 font-mono flex-wrap">
                              <span className="text-[#121212] dark:text-[#F2F2EE] font-semibold">Evidence:</span>
                              <span
                                className={
                                  classification.tier === 'LIKELY FORGED'
                                    ? 'text-[#EF4444] font-medium'
                                    : classification.tier === 'RECOGNIZED PROVIDER' || classification.tier === 'TRUSTED INFRA'
                                    ? 'text-[#0052FF] dark:text-[#3b82f6] font-medium'
                                    : 'text-[#737688] dark:text-[#A0A7A3]'
                                }
                              >
                                {classification.evidence}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0 sm:self-center">
                          {isSelected && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[#0052FF]/10 text-[#0052FF] dark:text-[#3b82f6] border border-[#0052FF]/30 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#0052FF] dark:bg-[#3b82f6] animate-ping" />
                              MAP PIN ACTIVE
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${classification.tierBadgeBg} ${classification.tierBadgeText} ${classification.tierBadgeBorder}`}
                          >
                            {classification.tier}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              hop.ptrValid ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#EF4444]/10 text-[#EF4444]'
                            }`}
                          >
                            PTR: {hop.ptrValid ? 'VALID' : 'INVALID'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs font-mono text-[#737688] dark:text-[#A0A7A3] italic py-2">
                  No intermediate reverse-hop headers recorded.
                </div>
              )}

              {showRawJson && (
                <div className="mt-4">
                  <pre className="p-4 bg-[#0E1210] text-[#10B981] font-mono text-[11px] rounded overflow-x-auto max-h-80 border border-[#29342F]">
                    {JSON.stringify(report, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 7. BOTTOM ACTION CALLOUT: EXPORT FULL PDF REPORT                           */}
      {/* ========================================================================= */}
      <div className="mt-10 flex flex-col sm:flex-row items-center justify-between p-6 bg-[#FFFFFF] dark:bg-[#151A17] border border-[#E5E5E5] dark:border-[#29342F] rounded shadow-sm gap-4 transition-colors">
        <div>
          <h3 className="text-base font-bold text-[#121212] dark:text-[#F2F2EE]">
            Need the comprehensive cryptographic dossier?
          </h3>
          <p className="text-xs text-[#737688] dark:text-[#A0A7A3] mt-0.5">
            Download the official multi-page PDF report with complete reverse-hop transport telemetry, 4-pillar risk calculations, and SHA-256 integrity seal.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportPdf}
          disabled={isExportingPdf}
          className="bg-[#0052FF] dark:bg-[#3b82f6] text-white font-mono text-xs font-bold tracking-wider px-6 py-3 rounded hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-all border border-[#0052FF] dark:border-[#3b82f6] shadow-sm flex items-center gap-2 shrink-0 active:scale-95 disabled:opacity-75 cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          <span>{isExportingPdf ? 'GENERATING PDF...' : 'EXPORT FORENSIC REPORT'}</span>
        </button>
      </div>

      <AnalystFeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
        caseId={caseId}
      />

      {/* Confirmation Modal for Case Re-Analysis */}
      {isConfirmReanalyzeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#FFFFFF] dark:bg-[#151A17] border border-[#D5D5CE] dark:border-[#29342F] rounded-lg shadow-2xl max-w-md w-full p-6 font-mono text-[#1a1c1c] dark:text-[#F2F2EE]">
            <div className="flex items-center gap-2 text-[#0052ff] dark:text-[#3b82f6] text-xs font-bold uppercase tracking-wider mb-2">
              <RefreshCw className="w-4 h-4 animate-spin-slow" />
              <span>Forensic Engine Re-analysis</span>
            </div>

            <h3 className="text-base font-bold text-[#1a1c1c] dark:text-[#F2F2EE] mb-2">
              Re-analyze Forensic Case?
            </h3>

            <p className="text-xs text-[#737688] dark:text-[#A0A7A3] mb-6 leading-relaxed">
              This will re-run the complete forensic pipeline for Case <code className="text-[#0052ff] dark:text-[#3b82f6] font-bold">{caseId}</code> using current engine code and scoring algorithms. You will be redirected to the sequential pipeline execution console to monitor all 9 forensic stages in real time.
            </p>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsConfirmReanalyzeOpen(false)}
                className="px-4 py-2 text-xs font-bold text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#fdfcf8] border border-[#D5D5CE] dark:border-[#29342F] rounded hover:bg-[#F2F2EE] dark:hover:bg-[#1b211e] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsConfirmReanalyzeOpen(false);
                  handleReanalyze();
                }}
                className="px-4 py-2 text-xs font-bold bg-[#0052ff] dark:bg-[#3b82f6] text-white rounded hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Confirm & Re-analyze</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
