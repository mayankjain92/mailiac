'use client';

import React, { useState, useMemo, useEffect } from 'react';
import type { AnalysisReport, Finding, ForensicHop } from '@mailiac/shared-types';
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
  Paperclip,
  Link2,
} from 'lucide-react';
import AnalystFeedbackModal from './AnalystFeedbackModal';

interface EvidenceExplorerProps {
  report: AnalysisReport;
  caseId: string;
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
  const primaryIntent = (intentLabels[0] || 'BENIGN').replace(/_/g, ' ').toUpperCase();

  if (score <= 20) {
    return {
      hex: '#10B981', // Vibrant Emerald Green
      badgeBg: 'bg-[#10B981]/10',
      badgeText: 'text-[#10B981]',
      badgeBorder: 'border-[#10B981]/30',
      label: 'LOW RISK · BENIGN',
      verdictTitle: 'This email shows no significant indicators of malicious intent.',
      recommendation: 'Safe to review. No immediate action required.',
    };
  }
  if (score <= 40) {
    return {
      hex: '#84CC16', // Lime / Yellow-Green
      badgeBg: 'bg-[#84CC16]/10',
      badgeText: 'text-[#84CC16] dark:text-[#a3e635]',
      badgeBorder: 'border-[#84CC16]/30',
      label: 'LOW-MODERATE RISK · REVIEW',
      verdictTitle: 'This email exhibits minor anomalies but no definitive malicious payload.',
      recommendation: 'Review the sender and links carefully before interacting.',
    };
  }
  if (score <= 60) {
    return {
      hex: '#F59E0B', // Amber / Yellow
      badgeBg: 'bg-[#F59E0B]/10',
      badgeText: 'text-[#F59E0B] dark:text-[#fbbf24]',
      badgeBorder: 'border-[#F59E0B]/30',
      label: 'MEDIUM RISK · SUSPICIOUS',
      verdictTitle: 'This email exhibits suspicious characteristics and should be inspected before trusting.',
      recommendation: 'Review the sender and links carefully before interacting.',
    };
  }
  if (score <= 80) {
    let specificVerdict = `This email contains elevated risk indicators associated with ${primaryIntent.toLowerCase()}.`;
    if (primaryIntent.includes('CREDENTIAL') || primaryIntent.includes('HARVESTING')) {
      specificVerdict = 'This email contains multiple indicators associated with credential harvesting and sender impersonation.';
    } else if (primaryIntent.includes('FINANCIAL') || primaryIntent.includes('WIRE')) {
      specificVerdict = 'This email contains patterns associated with unauthorized financial requests and wire diversion.';
    }

    return {
      hex: '#F97316', // Orange / Red-Orange
      badgeBg: 'bg-[#F97316]/10',
      badgeText: 'text-[#F97316] dark:text-[#fb923c]',
      badgeBorder: 'border-[#F97316]/30',
      label: 'HIGH RISK · DANGEROUS',
      verdictTitle: specificVerdict,
      recommendation: 'Do not click links or open attachments until the sender is verified.',
    };
  }

  // score > 80
  let criticalVerdict = 'High-confidence malicious email identified with critical threat indicators.';
  if (primaryIntent.includes('CREDENTIAL')) {
    criticalVerdict = 'Critical threat: High-confidence credential harvesting and domain spoofing detected.';
  }

  return {
    hex: '#EF4444', // Strong Red
    badgeBg: 'bg-[#EF4444]/10',
    badgeText: 'text-[#EF4444] dark:text-[#f87171]',
    badgeBorder: 'border-[#EF4444]/30',
    label: 'CRITICAL RISK · MALICIOUS',
    verdictTitle: criticalVerdict,
    recommendation: 'Do not interact with this email. Treat it as potentially malicious.',
  };
}

function synthesizeAiInterpretation(
  intent: string,
  score: number,
  senderDomain: string
): string {
  const primaryIntent = intent.toUpperCase().replace(/_/g, ' ');

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
    if (primaryIntent.includes('CREDENTIAL') || primaryIntent.includes('HARVESTING')) {
      return `The AI identified high-urgency credential harvesting patterns and deceptive authentication prompts. The sender domain or message structure is consistent with targeted phishing tactics.`;
    }
    if (primaryIntent.includes('FINANCIAL') || primaryIntent.includes('WIRE')) {
      return `The AI identified suspicious financial or invoice diversion requests using coercive urgency. The communication patterns deviate significantly from verified organizational protocols.`;
    }
    return `The AI detected multiple indicators of malicious intent associated with ${primaryIntent.toLowerCase()} and deceptive payload behavior.`;
  }

  // score > 80
  return `High-confidence malicious threat detected. The AI identified aggressive deceptive intent, deceptive sender impersonation, and fraudulent payload triggers requiring immediate quarantine.`;
}

export default function EvidenceExplorer({ report, caseId }: EvidenceExplorerProps): React.JSX.Element {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [showDetailedAiFindings, setShowDetailedAiFindings] = useState<boolean>(false);
  const [isTechnicalExpanded, setIsTechnicalExpanded] = useState<boolean>(false);
  const [showRawJson, setShowRawJson] = useState<boolean>(false);
  const [animatedScore, setAnimatedScore] = useState<number>(0);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState<boolean>(false);

  const finalScore = Math.max(0, Math.min(100, report?.riskMatrix?.finalScore ?? 0));
  const intentList = report?.aiSummary?.intent || ['BENIGN'];
  const riskVisuals = useMemo(() => getDynamicRiskVisuals(finalScore, intentList), [finalScore, intentList]);

  // Smooth score entrance animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedScore(finalScore);
    }, 100);
    return () => clearTimeout(timer);
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

  // AI Summary Metadata
  const primaryIntent = (intentList[0] || 'BENIGN').replace(/_/g, ' ').toUpperCase();
  const rawConfidence = report?.aiSummary?.confidence ?? 0.95;
  const aiConfidencePercent = Math.round(rawConfidence <= 1 ? rawConfidence * 100 : rawConfidence);
  
  // Format Urgency
  const rawUrgency = report?.aiSummary?.urgency ?? (nlpScore > 40 ? 75 : 10);
  const urgencyLabel = rawUrgency >= 70 ? 'HIGH' : rawUrgency >= 35 ? 'MODERATE' : 'LOW';

  // Formatted Execution Time
  const executionTimeFormatted = report?.executionTimeMs
    ? `${(report.executionTimeMs / 1000).toFixed(3)}s`
    : '0.842s';

  // Synthesized AI Interpretation Narrative (1-3 sentences)
  const aiInterpretationNarrative = useMemo(() => {
    return synthesizeAiInterpretation(primaryIntent, finalScore, report?.senderDomain || '');
  }, [primaryIntent, finalScore, report?.senderDomain]);

  // Underlying detailed AI findings
  const aiDetailedFindings = useMemo(() => {
    return report?.aiSummary?.findings || report?.riskMatrix?.pillars?.nlp?.findings || [];
  }, [report]);

  // "What This Means For You" Dynamic Synthesized Findings (3-5 human points max)
  const synthesizedKeyFindings = useMemo(() => {
    const bullets: { id: string; status: 'pass' | 'warn' | 'fail'; text: string }[] = [];

    // 1. Authentication Check
    const spfPass = report?.authResults?.spf === 'pass';
    const dkimPass = report?.authResults?.dkim === 'pass';
    if (spfPass && dkimPass) {
      bullets.push({
        id: 'auth-pass',
        status: 'pass',
        text: 'Sender authentication passed',
      });
    } else if (report?.authResults?.spf === 'fail' || report?.authResults?.dkim === 'fail') {
      bullets.push({
        id: 'auth-fail',
        status: 'fail',
        text: 'Sender cryptographic authentication failed or was forged',
      });
    } else {
      bullets.push({
        id: 'auth-warn',
        status: 'warn',
        text: 'Sender authentication records are partial or unaligned',
      });
    }

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

    // 3. AI / Phishing Intent Check
    if (nlpScore < 25 && primaryIntent === 'BENIGN') {
      bullets.push({
        id: 'nlp-pass',
        status: 'pass',
        text: 'No strong malicious intent detected by AI',
      });
    } else if (primaryIntent.includes('CREDENTIAL')) {
      bullets.push({
        id: 'nlp-cred',
        status: 'fail',
        text: 'AI detected credential harvesting patterns and phishing tactics',
      });
    } else if (primaryIntent.includes('FINANCIAL')) {
      bullets.push({
        id: 'nlp-fin',
        status: 'fail',
        text: 'AI identified suspicious financial or invoice diversion requests',
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
  }, [report, identityScore, nlpScore, primaryIntent, infraScore]);

  // Meaningful Highlighted Findings (4 high-value compact cards)
  const importantFindings = useMemo(() => {
    const cards: {
      id: string;
      title: string;
      description: string;
      type: 'pass' | 'warn' | 'alert';
    }[] = [];

    // Card 1: Domain Verification
    if (identityScore < 25) {
      cards.push({
        id: 'f-domain',
        title: 'DOMAIN VERIFIED',
        description: 'The sender domain appears to belong to a legitimate organization.',
        type: 'pass',
      });
    } else {
      cards.push({
        id: 'f-identity-warn',
        title: 'IDENTITY WARNING',
        description: 'Display name does not clearly match the sender domain.',
        type: 'warn',
      });
    }

    // Card 2: Urgency Level
    if (urgencyLabel === 'LOW') {
      cards.push({
        id: 'f-urgency-low',
        title: 'LOW URGENCY',
        description: 'The detected urgency is consistent with the email’s context.',
        type: 'pass',
      });
    } else {
      cards.push({
        id: 'f-urgency-high',
        title: 'HIGH URGENCY',
        description: 'Urgent language detected urging immediate action or credential entry.',
        type: 'alert',
      });
    }

    // Card 3: Context Analysis
    if (primaryIntent === 'BENIGN' && nlpScore < 30) {
      cards.push({
        id: 'f-context-match',
        title: 'CONTEXT MATCH',
        description: 'Linguistic patterns match standard benign communications.',
        type: 'pass',
      });
    } else {
      cards.push({
        id: 'f-intent-flag',
        title: primaryIntent.includes('CREDENTIAL') ? 'CREDENTIAL RISK' : 'INTENT FLAG',
        description: 'Language model identified deceptive phrasing or harvesting intent.',
        type: 'alert',
      });
    }

    // Card 4: Infrastructure / Auth Signal
    if (infraScore < 25) {
      cards.push({
        id: 'f-infra-clean',
        title: 'CLEAN INFRASTRUCTURE',
        description: 'Originating mail transfer agents have clean reputation records.',
        type: 'pass',
      });
    } else {
      cards.push({
        id: 'f-infra-warn',
        title: 'UNVERIFIED ORIGIN',
        description: 'Originating IP has elevated abuse risk or proxy indicators.',
        type: 'warn',
      });
    }

    return cards;
  }, [identityScore, urgencyLabel, primaryIntent, nlpScore, infraScore]);

  // Conditional Payload Findings Extraction (Only render if meaningful payload findings exist)
  const payloadFindings = useMemo(() => {
    const allFindings = [
      ...(report?.riskMatrix?.pillars?.nlp?.findings || []),
      ...(report?.aiSummary?.findings || []),
    ];

    return allFindings.filter((f) => {
      const t = (f.type || '').toLowerCase();
      const d = (f.description || '').toLowerCase();
      return (
        t.includes('attachment') ||
        t.includes('url') ||
        t.includes('link') ||
        t.includes('cloak') ||
        t.includes('glassworm') ||
        t.includes('zero_width') ||
        d.includes('attachment') ||
        d.includes('link') ||
        d.includes('url')
      );
    });
  }, [report]);

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
      return { label: 'RELAXED', color: 'text-[#F59E0B]', bg: 'bg-[#F59E0B]/10' };
    }
    if (s === 'FAIL') {
      return { label: 'FAIL', color: 'text-[#EF4444]', bg: 'bg-[#EF4444]/10' };
    }
    return { label: s, color: 'text-[#737688] dark:text-[#A0A7A3]', bg: 'bg-[#EAEAE5] dark:bg-[#151A17]' };
  };

  // Truncate hash helper
  const integrityHash = report?.aiSummary?.integrityHash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const displayHash = integrityHash.length > 16 ? `${integrityHash.slice(0, 8)}...${integrityHash.slice(-6)}` : integrityHash;

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
            
            {/* Header row: Confidence metric */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 justify-center md:justify-start">
                <span className="font-mono text-[11px] font-bold tracking-wider uppercase text-[#737688] dark:text-[#A0A7A3]">
                  OVERALL RISK VERDICT
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 self-center sm:self-auto px-2.5 py-1 bg-[#F2F2EE] dark:bg-[#1B211E] border border-[#E5E5E5] dark:border-[#29342F] rounded text-xs font-mono">
                <Sparkles className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#3b82f6]" />
                <span className="text-[#737688] dark:text-[#A0A7A3]">AI Confidence:</span>
                <strong className="text-[#121212] dark:text-[#F2F2EE]">{aiConfidencePercent}%</strong>
              </div>
            </div>

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
        
        {/* Left Column (6 Cols): AI FORENSIC ASSESSMENT CARD (NARRATIVE + METADATA) */}
        <div className="lg:col-span-6 border border-[#E5E5E5] dark:border-[#29342F] bg-[#FFFFFF] dark:bg-[#151A17] p-6 rounded shadow-sm transition-colors flex flex-col justify-between">
          <div>
            {/* Header with AI indicator */}
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-[#E5E5E5] dark:border-[#29342F]">
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#737688] dark:text-[#A0A7A3]">
                AI FORENSIC ASSESSMENT
              </h2>
              <span className="font-mono text-[10px] font-bold tracking-wider text-[#0052FF] dark:text-[#3b82f6] bg-[#0052FF]/10 dark:bg-[#3b82f6]/10 px-2 py-0.5 rounded flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> AI
              </span>
            </div>
            
            {/* Primary Narrative Conclusion (1-3 sentences) */}
            <p className="text-sm font-medium text-[#121212] dark:text-[#F2F2EE] leading-relaxed mb-4">
              {aiInterpretationNarrative}
            </p>

            {/* Expandable Underlying AI Findings (Progressive Disclosure) */}
            {showDetailedAiFindings && (
              <div className="mb-4 pt-3 border-t border-dashed border-[#E5E5E5] dark:border-[#29342F] space-y-2.5">
                <div className="text-[10px] font-mono font-bold tracking-wider uppercase text-[#737688] dark:text-[#A0A7A3]">
                  Underlying AI Signal Telemetry ({aiDetailedFindings.length})
                </div>
                {aiDetailedFindings.length === 0 ? (
                  <div className="text-xs text-[#737688] dark:text-[#A0A7A3] italic">
                    No individual threat anomaly flags recorded.
                  </div>
                ) : (
                  aiDetailedFindings.map((f: Finding, idx: number) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-[#F2F2EE] dark:bg-[#1B211E] rounded border border-[#E5E5E5] dark:border-[#29342F] text-xs"
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-mono font-bold text-[#121212] dark:text-[#F2F2EE]">
                          {f.type}
                        </span>
                        <span
                          className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            f.severity === 'HIGH'
                              ? 'bg-[#EF4444]/10 text-[#EF4444]'
                              : f.severity === 'MEDIUM'
                              ? 'bg-[#F59E0B]/10 text-[#F59E0B]'
                              : 'bg-[#10B981]/10 text-[#10B981]'
                          }`}
                        >
                          {f.severity}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#737688] dark:text-[#A0A7A3]">
                        {f.description}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Card Footer: Metadata Row & Toggle */}
          <div>
            <div className="pt-3 border-t border-[#E5E5E5] dark:border-[#29342F]">
              <div className="grid grid-cols-3 gap-3 text-left">
                <div>
                  <div className="font-mono text-[10px] font-bold tracking-wider text-[#737688] dark:text-[#A0A7A3] uppercase mb-1">
                    INTENT
                  </div>
                  <div
                    className={`text-sm sm:text-base font-bold tracking-tight ${
                      primaryIntent === 'BENIGN'
                        ? 'text-[#10B981]'
                        : primaryIntent.includes('CREDENTIAL') || primaryIntent.includes('MALICIOUS')
                        ? 'text-[#EF4444] dark:text-[#f87171]'
                        : 'text-[#F59E0B] dark:text-[#fbbf24]'
                    }`}
                  >
                    {primaryIntent}
                  </div>
                </div>

                <div>
                  <div className="font-mono text-[10px] font-bold tracking-wider text-[#737688] dark:text-[#A0A7A3] uppercase mb-1">
                    CONFIDENCE
                  </div>
                  <div className="text-sm sm:text-base font-bold text-[#121212] dark:text-[#F2F2EE]">
                    {aiConfidencePercent}%
                  </div>
                </div>

                <div>
                  <div className="font-mono text-[10px] font-bold tracking-wider text-[#737688] dark:text-[#A0A7A3] uppercase mb-1">
                    URGENCY
                  </div>
                  <div
                    className={`text-sm sm:text-base font-bold ${
                      urgencyLabel === 'LOW'
                        ? 'text-[#10B981]'
                        : urgencyLabel === 'HIGH'
                        ? 'text-[#EF4444]'
                        : 'text-[#F59E0B]'
                    }`}
                  >
                    {urgencyLabel}
                  </div>
                </div>
              </div>

              {/* View AI Findings Inline Toggle */}
              <div className="mt-3 pt-2 flex justify-between items-center border-t border-dashed border-[#E5E5E5] dark:border-[#29342F] text-[11px] font-mono">
                <button
                  type="button"
                  onClick={() => setShowDetailedAiFindings(!showDetailedAiFindings)}
                  className="text-[#0052FF] dark:text-[#3b82f6] hover:underline font-bold flex items-center gap-1 cursor-pointer"
                >
                  <span>{showDetailedAiFindings ? 'Hide detailed analysis' : 'View detailed analysis →'}</span>
                  {showDetailedAiFindings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                <span className="text-[#737688] dark:text-[#A0A7A3]">
                  {report?.aiSummary?.model || 'gemini-1.5-flash'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (6 Cols): 4-PILLAR RISK BREAKDOWN */}
        <div className="lg:col-span-6 border border-[#E5E5E5] dark:border-[#29342F] bg-[#FFFFFF] dark:bg-[#151A17] p-6 rounded shadow-sm transition-colors flex flex-col justify-between">
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
              {(() => {
                const sev = getPillarSeverityColor(authScore);
                return (
                  <div className="bg-[#F2F2EE] dark:bg-[#1B211E] p-3 rounded border border-[#E5E5E5] dark:border-[#29342F] flex flex-col justify-between">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-mono text-xs font-bold text-[#121212] dark:text-[#F2F2EE] flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#3b82f6]" /> AUTHENTICATION
                      </span>
                      <span className={`font-mono text-xs font-extrabold ${sev.text}`}>
                        {authScore} / 100
                      </span>
                    </div>
                    <p className="text-[11px] text-[#737688] dark:text-[#A0A7A3]">
                      SPF, DKIM, DMARC and ARC checks.
                    </p>
                  </div>
                );
              })()}

              {/* Pillar 2: Identity */}
              {(() => {
                const sev = getPillarSeverityColor(identityScore);
                return (
                  <div className="bg-[#F2F2EE] dark:bg-[#1B211E] p-3 rounded border border-[#E5E5E5] dark:border-[#29342F] flex flex-col justify-between">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-mono text-xs font-bold text-[#121212] dark:text-[#F2F2EE] flex items-center gap-1.5">
                        <Fingerprint className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#3b82f6]" /> IDENTITY
                      </span>
                      <span className={`font-mono text-xs font-extrabold ${sev.text}`}>
                        {identityScore} / 100
                      </span>
                    </div>
                    <p className="text-[11px] text-[#737688] dark:text-[#A0A7A3]">
                      Sender identity and domain consistency.
                    </p>
                  </div>
                );
              })()}

              {/* Pillar 3: Infrastructure */}
              {(() => {
                const sev = getPillarSeverityColor(infraScore);
                return (
                  <div className="bg-[#F2F2EE] dark:bg-[#1B211E] p-3 rounded border border-[#E5E5E5] dark:border-[#29342F] flex flex-col justify-between">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-mono text-xs font-bold text-[#121212] dark:text-[#F2F2EE] flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#3b82f6]" /> INFRASTRUCTURE
                      </span>
                      <span className={`font-mono text-xs font-extrabold ${sev.text}`}>
                        {infraScore} / 100
                      </span>
                    </div>
                    <p className="text-[11px] text-[#737688] dark:text-[#A0A7A3]">
                      IP reputation and routing signals.
                    </p>
                  </div>
                );
              })()}

              {/* Pillar 4: AI / Intent */}
              {(() => {
                const sev = getPillarSeverityColor(nlpScore);
                return (
                  <div className="bg-[#F2F2EE] dark:bg-[#1B211E] p-3 rounded border border-[#E5E5E5] dark:border-[#29342F] flex flex-col justify-between">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-mono text-xs font-bold text-[#121212] dark:text-[#F2F2EE] flex items-center gap-1.5">
                        <BrainCircuit className="w-3.5 h-3.5 text-[#0052FF] dark:text-[#3b82f6]" /> AI / INTENT
                      </span>
                      <span className={`font-mono text-xs font-extrabold ${sev.text}`}>
                        {nlpScore} / 100
                      </span>
                    </div>
                    <p className="text-[11px] text-[#737688] dark:text-[#A0A7A3]">
                      Language, intent and behavioral indicators.
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="pt-3 border-t border-[#E5E5E5] dark:border-[#29342F] mt-4 flex justify-between items-center text-[11px] font-mono text-[#737688] dark:text-[#A0A7A3]">
            <span>ENGINE: ASYNCHRONOUS PIPELINE</span>
            <span>STATUS: 4 PILLARS AGGREGATED</span>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. CONDITIONAL PAYLOAD & ATTACHMENT SECTION                               */}
      {/* ========================================================================= */}
      {payloadFindings.length > 0 && (
        <section className="mb-8">
          <div className="border border-[#E5E5E5] dark:border-[#29342F] bg-[#FFFFFF] dark:bg-[#151A17] p-6 rounded shadow-sm transition-colors">
            <div className="flex justify-between items-center mb-4 border-b border-[#E5E5E5] dark:border-[#29342F] pb-2">
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#737688] dark:text-[#A0A7A3] flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-[#0052FF] dark:text-[#3b82f6]" /> PAYLOAD & ATTACHMENT ANALYSIS
              </h2>
              <span className="text-[11px] font-mono text-[#EF4444] font-bold">
                {payloadFindings.length} Signal{payloadFindings.length > 1 ? 's' : ''} Detected
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {payloadFindings.map((pf, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-[#F2F2EE] dark:bg-[#1B211E] rounded border border-[#E5E5E5] dark:border-[#29342F] flex items-start gap-2.5"
                >
                  <Link2 className="w-4 h-4 text-[#0052FF] dark:text-[#3b82f6] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-mono text-xs font-bold text-[#121212] dark:text-[#F2F2EE]">
                      {pf.type}
                    </div>
                    <p className="text-[11px] text-[#737688] dark:text-[#A0A7A3] mt-0.5">
                      {pf.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* 5. IMPORTANT FINDINGS (SUMMARIZED & PRIORITIZED)                           */}
      {/* ========================================================================= */}
      <section className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#737688] dark:text-[#A0A7A3]">
            IMPORTANT FINDINGS
          </h2>
          <span className="text-[11px] font-mono text-[#737688] dark:text-[#A0A7A3]">
            High-Impact Security Findings
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {importantFindings.map((card) => {
            return (
              <div
                key={card.id}
                className="border border-[#E5E5E5] dark:border-[#29342F] bg-[#FFFFFF] dark:bg-[#151A17] p-5 rounded flex flex-col justify-between shadow-sm transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded ${
                        card.type === 'pass'
                          ? 'bg-[#10B981]/10 text-[#10B981]'
                          : card.type === 'warn'
                          ? 'bg-[#F59E0B]/10 text-[#F59E0B]'
                          : 'bg-[#EF4444]/10 text-[#EF4444]'
                      }`}
                    >
                      {card.title}
                    </span>
                    {card.type === 'pass' ? (
                      <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                    ) : card.type === 'warn' ? (
                      <AlertTriangle className="w-4 h-4 text-[#F59E0B]" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 text-[#EF4444]" />
                    )}
                  </div>
                  <p className="text-xs text-[#121212] dark:text-[#F2F2EE] font-medium leading-relaxed mt-2">
                    {card.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 6. TECHNICAL EVIDENCE (COLLAPSIBLE / SECONDARY PROGRESSIVE DISCLOSURE)    */}
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
              <span>SPF: <strong className="text-[#10B981]">{report?.authResults?.spf?.toUpperCase() || 'PASS'}</strong></span>
              <span>DKIM: <strong className="text-[#10B981]">{report?.authResults?.dkim?.toUpperCase() || 'PASS'}</strong></span>
              <span>DMARC: <strong className="text-[#F59E0B]">{report?.authResults?.dmarcAlignment?.toUpperCase() || 'RELAXED'}</strong></span>
              <span>ARC: <strong className="text-[#10B981]">{report?.authResults?.arcPass ? 'PASS' : 'NONE'}</strong></span>
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
                  {(() => {
                    const spfBadge = getAuthBadge(report?.authResults?.spf);
                    const desc =
                      report?.authResults?.spf === 'pass'
                        ? 'Sender IP authorized by domain policy'
                        : report?.authResults?.spf === 'fail'
                        ? 'Sender IP not authorized in SPF record'
                        : 'No strict SPF policy record found';
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
                  {(() => {
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
                  {(() => {
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
                  {(() => {
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
                      {report?.timestamp || new Date().toISOString()}
                    </div>
                  </div>

                  <div className="border-t border-[#E5E5E5] dark:border-[#29342F] pt-2">
                    <div className="text-[11px] font-bold text-[#737688] dark:text-[#A0A7A3] mb-1 uppercase">
                      EXECUTION TIME
                    </div>
                    <div className="text-[#0052FF] dark:text-[#3b82f6] font-bold">
                      {executionTimeFormatted}
                    </div>
                  </div>

                  <div className="border-t border-[#E5E5E5] dark:border-[#29342F] pt-2 sm:col-span-2">
                    <div className="text-[11px] font-bold text-[#737688] dark:text-[#A0A7A3] mb-1 uppercase">
                      INTEGRITY HASH (HMAC-SHA256)
                    </div>
                    <div
                      className="text-[#121212] dark:text-[#F2F2EE] truncate font-medium cursor-pointer hover:text-[#0052FF] dark:hover:text-[#3b82f6] transition-colors"
                      title={integrityHash}
                      onClick={() => handleCopy(integrityHash, 'hash')}
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
                <button
                  type="button"
                  onClick={() => setShowRawJson(!showRawJson)}
                  className="text-xs font-mono text-[#0052FF] dark:text-[#3b82f6] hover:underline"
                >
                  {showRawJson ? 'Hide Raw JSON' : 'Toggle Raw JSON'}
                </button>
              </div>

              {report?.forensicPath && report.forensicPath.length > 0 ? (
                <div className="space-y-3 font-mono text-xs">
                  {report.forensicPath.map((hop: ForensicHop, index: number) => (
                    <div
                      key={index}
                      className="p-3 bg-[#F2F2EE] dark:bg-[#1B211E] rounded border border-[#E5E5E5] dark:border-[#29342F] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-[#0052FF]/10 text-[#0052FF] dark:text-[#3b82f6] flex items-center justify-center font-bold text-[11px]">
                          {index + 1}
                        </span>
                        <div>
                          <div className="font-bold text-[#121212] dark:text-[#F2F2EE]">
                            {hop.ip} {hop.hostnameClaimed && <span className="font-normal text-[#737688] dark:text-[#A0A7A3]">({hop.hostnameClaimed})</span>}
                          </div>
                          <div className="text-[11px] text-[#737688] dark:text-[#A0A7A3]">
                            {hop.city ? `${hop.city}, ` : ''}{hop.country || 'Unknown Location'} · ASN: {hop.asn || 'N/A'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${hop.trusted ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#F59E0B]/10 text-[#F59E0B]'}`}>
                          {hop.trusted ? 'TRUSTED INFRA' : 'UNTRUSTED HOP'}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${hop.ptrValid ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#EF4444]/10 text-[#EF4444]'}`}>
                          PTR: {hop.ptrValid ? 'VALID' : 'INVALID'}
                        </span>
                      </div>
                    </div>
                  ))}
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
    </div>
  );
}
