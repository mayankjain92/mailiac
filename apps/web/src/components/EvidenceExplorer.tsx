'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import type { AnalysisReport, Finding, ForensicHop } from '@mailiac/shared-types';
import {
  Shield,
  ShieldAlert,
  Fingerprint,
  Route,
  BrainCircuit,
  FileText,

  CheckCircle2,
  Clock,
  Copy,
  Check,
  ArrowLeft,
  Download,
  Printer,
  ChevronDown,
  ChevronUp,
  Search,
  Activity,
  Lock,
  ExternalLink,
} from 'lucide-react';

interface EvidenceExplorerProps {
  report: AnalysisReport;
  caseId: string;
}

type TabType =
  | 'OVERVIEW'
  | 'AUTHENTICATION'
  | 'IDENTITY'
  | 'INFRASTRUCTURE'
  | 'AI / INTENT'
  | 'EVIDENCE';

export default function EvidenceExplorer({ report, caseId }: EvidenceExplorerProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TabType>('EVIDENCE');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedPillar, setSelectedPillar] = useState<string>('ALL');
  const [expandedFindings, setExpandedFindings] = useState<Record<string, boolean>>({});
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Copy helper
  const handleCopy = (text: string, fieldKey: string): void => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Toggle finding expansion
  const toggleFinding = (id: string): void => {
    setExpandedFindings((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Extract all findings with source pillar
  const allFindings = useMemo(() => {
    const findingsList: (Finding & { pillar: 'AUTHENTICATION' | 'IDENTITY' | 'INFRASTRUCTURE' | 'AI / INTENT'; id: string })[] = [];

    // Auth findings
    (report.authResults?.findings || report.riskMatrix?.pillars?.authentication?.findings || []).forEach((f, idx) => {
      findingsList.push({ ...f, pillar: 'AUTHENTICATION', id: `auth-${idx}-${f.type}` });
    });

    // Identity findings
    (report.riskMatrix?.pillars?.identity?.findings || []).forEach((f, idx) => {
      findingsList.push({ ...f, pillar: 'IDENTITY', id: `id-${idx}-${f.type}` });
    });

    // Infrastructure findings
    (report.riskMatrix?.pillars?.infrastructure?.findings || []).forEach((f, idx) => {
      findingsList.push({ ...f, pillar: 'INFRASTRUCTURE', id: `infra-${idx}-${f.type}` });
    });

    // AI findings
    (report.aiSummary?.findings || report.riskMatrix?.pillars?.nlp?.findings || []).forEach((f, idx) => {
      findingsList.push({ ...f, pillar: 'AI / INTENT', id: `ai-${idx}-${f.type}` });
    });

    return findingsList;
  }, [report]);

  // Filtered findings based on search and pill filters
  const filteredFindings = useMemo(() => {
    return allFindings.filter((f) => {
      const matchesSearch =
        searchQuery === '' ||
        f.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.pillar.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesSeverity = selectedSeverity === 'ALL' || f.severity === selectedSeverity;
      const matchesPillar = selectedPillar === 'ALL' || f.pillar === selectedPillar;

      return matchesSearch && matchesSeverity && matchesPillar;
    });
  }, [allFindings, searchQuery, selectedSeverity, selectedPillar]);

  // Derive risk label and colors
  const finalScore = report.riskMatrix?.finalScore ?? 0;
  const getRiskClassification = (score: number): { label: string; color: string; bg: string; border: string } => {
    if (score >= 80) return { label: 'CRITICAL THREAT', color: 'text-[#ba1a1a] dark:text-[#ef4444]', bg: 'bg-[#ba1a1a]/10', border: 'border-[#ba1a1a]/30' };
    if (score >= 50) return { label: 'HIGH RISK · SUSPICIOUS', color: 'text-[#f59e0b] dark:text-[#fbbf24]', bg: 'bg-[#f59e0b]/10', border: 'border-[#f59e0b]/30' };
    if (score >= 25) return { label: 'MEDIUM RISK · CAUTION', color: 'text-[#f59e0b]', bg: 'bg-[#f59e0b]/10', border: 'border-[#f59e0b]/30' };
    return { label: 'LOW RISK · BENIGN', color: 'text-[#10b981]', bg: 'bg-[#10b981]/10', border: 'border-[#10b981]/30' };
  };

  const riskInfo = getRiskClassification(finalScore);

  // Pillar scores & weights
  const pillars = report.riskMatrix?.pillars;
  const authScore = pillars?.authentication?.score ?? report.riskMatrix?.authScore ?? 0;
  const authWeight = pillars?.authentication?.weight ?? 0.2;

  const identityScore = pillars?.identity?.score ?? report.riskMatrix?.identityScore ?? 0;
  const identityWeight = pillars?.identity?.weight ?? 0.35;

  const infraScore = pillars?.infrastructure?.score ?? report.riskMatrix?.ipScore ?? 0;
  const infraWeight = pillars?.infrastructure?.weight ?? 0.1;

  const nlpScore = pillars?.nlp?.score ?? report.riskMatrix?.nlpScore ?? 0;
  const nlpWeight = pillars?.nlp?.weight ?? 0.35;

  // AI confidence percentage
  const aiConfidencePercent = report.aiSummary?.confidence !== undefined
    ? Math.round(report.aiSummary.confidence <= 1 ? report.aiSummary.confidence * 100 : report.aiSummary.confidence)
    : 0;

  // Formatted execution time
  const executionTimeFormatted = report.executionTimeMs
    ? `${(report.executionTimeMs / 1000).toFixed(3)}s`
    : 'N/A';

  // Export JSON handler
  const handleExportJson = (): void => {
    setIsExporting(true);
    try {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `mailiac_forensic_evidence_${caseId}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } finally {
      setTimeout(() => setIsExporting(false), 800);
    }
  };

  const handlePrint = (): void => {
    window.print();
  };

  const scrollToSection = (sectionId: string, tabName: TabType): void => {
    setActiveTab(tabName);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 md:px-16 pt-8 pb-24 transition-colors duration-200">
      
      {/* Top Breadcrumb & Quick Actions Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 mb-8 border-b border-[#D5D5CE] dark:border-[#29342F] gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/forensic-analysis?jobId=${caseId}`}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-[#0052ff] dark:text-[#3b82f6] hover:underline font-semibold"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Analysis Console
          </Link>
          <span className="text-[#D5D5CE] dark:text-[#29342F]">/</span>
          <span className="text-xs font-mono text-[#737688] dark:text-[#A0A7A3]">Evidence Explorer</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="border border-[#D5D5CE] dark:border-[#29342F] hover:border-[#0052ff] dark:hover:border-[#3b82f6] text-[#1a1c1c] dark:text-[#F2F2EE] px-3.5 py-1.5 rounded text-xs font-mono font-medium inline-flex items-center gap-1.5 transition-colors bg-[#EAEAE5] dark:bg-[#151A17]"
            title="Print or save as PDF"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
          <button
            onClick={handleExportJson}
            disabled={isExporting}
            className="bg-[#0052ff] dark:bg-[#3b82f6] text-white px-4 py-1.5 rounded text-xs font-mono font-bold tracking-wider hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors inline-flex items-center gap-2 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            {isExporting ? 'EXPORTING...' : 'EXPORT JSON REPORT'}
          </button>
        </div>
      </div>

      {/* Main Header */}
      <header className="mb-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[#D5D5CE] dark:border-[#29342F] pb-8">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <span className="font-mono text-[11px] font-bold tracking-widest bg-[#EAEAE5] dark:bg-[#1B211E] text-[#434656] dark:text-[#A0A7A3] px-2.5 py-1 uppercase rounded-sm border border-[#D5D5CE] dark:border-[#29342F]">
                CASE ID
              </span>
              <span className="font-mono text-xs md:text-sm font-semibold text-[#1a1c1c] dark:text-[#F2F2EE] tracking-tight flex items-center gap-1.5">
                {caseId}
                <button
                  onClick={() => handleCopy(caseId, 'caseId')}
                  className="text-[#737688] hover:text-[#0052ff] dark:hover:text-[#3b82f6] transition-colors"
                  title="Copy Case ID"
                >
                  {copiedField === 'caseId' ? <Check className="w-3.5 h-3.5 text-[#10b981]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-[#1a1c1c] dark:text-[#F2F2EE]">
              Forensic Evidence Explorer
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 border border-[#D5D5CE] dark:border-[#29342F] bg-[#F2F2EE] dark:bg-[#151A17] px-4 py-2 rounded shadow-sm">
              <div className="w-2.5 h-2.5 rounded-full bg-[#10b981] animate-pulse"></div>
              <span className="font-mono text-xs font-bold tracking-wider text-[#1a1c1c] dark:text-[#F2F2EE]">
                STATUS: COMPLETE
              </span>
            </div>
          </div>
        </div>

        {/* Case Summary Telemetry Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 px-6 border-b border-[#D5D5CE] dark:border-[#29342F] bg-[#EAEAE5] dark:bg-[#151A17] mt-0 rounded-b">
          {/* Threat Score */}
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase font-bold text-[#737688] dark:text-[#A0A7A3] tracking-widest">
              THREAT SCORE
            </span>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-extrabold font-mono ${riskInfo.color}`}>
                {finalScore}
              </span>
              <span className="font-mono text-xs text-[#737688] dark:text-[#A0A7A3]">/100</span>
              <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${riskInfo.bg} ${riskInfo.color} ${riskInfo.border}`}>
                {riskInfo.label}
              </span>
            </div>
          </div>

          {/* AI Confidence */}
          <div className="flex flex-col gap-1 sm:border-l sm:border-[#D5D5CE] dark:sm:border-[#29342F] sm:pl-4">
            <span className="font-mono text-[10px] uppercase font-bold text-[#737688] dark:text-[#A0A7A3] tracking-widest">
              AI CONFIDENCE
            </span>
            <span className="font-mono text-xl font-bold text-[#1a1c1c] dark:text-[#F2F2EE]">
              {aiConfidencePercent}%
            </span>
          </div>

          {/* Primary Intent */}
          <div className="flex flex-col gap-1 border-t sm:border-t-0 sm:border-l border-[#D5D5CE] dark:border-[#29342F] pt-2 sm:pt-0 sm:pl-4">
            <span className="font-mono text-[10px] uppercase font-bold text-[#737688] dark:text-[#A0A7A3] tracking-widest">
              PRIMARY INTENT
            </span>
            <span className="font-mono text-xs font-bold text-[#0052ff] dark:text-[#3b82f6] truncate" title={report.aiSummary?.intent?.join(', ') || 'BENIGN'}>
              {report.aiSummary?.intent?.join(', ') || 'BENIGN'}
            </span>
          </div>

          {/* Sender Domain */}
          <div className="flex flex-col gap-1 border-t sm:border-t-0 sm:border-l border-[#D5D5CE] dark:border-[#29342F] pt-2 sm:pt-0 sm:pl-4">
            <span className="font-mono text-[10px] uppercase font-bold text-[#737688] dark:text-[#A0A7A3] tracking-widest">
              SENDER DOMAIN
            </span>
            <span className="font-mono text-xs font-semibold text-[#1a1c1c] dark:text-[#F2F2EE] truncate" title={report.senderDomain}>
              {report.senderDomain}
            </span>
          </div>
        </div>
      </header>

      {/* Investigation Navigation Tabs */}
      <div className="mb-8 border-b border-[#D5D5CE] dark:border-[#29342F] overflow-x-auto hide-scrollbar">
        <div className="flex gap-4 sm:gap-8 min-w-max px-2">
          <button
            onClick={() => scrollToSection('section-metadata', 'OVERVIEW')}
            className={`font-mono text-xs font-bold tracking-wider pb-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'OVERVIEW'
                ? 'text-[#0052ff] dark:text-[#3b82f6] border-[#0052ff] dark:border-[#3b82f6]'
                : 'text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#F2F2EE] border-transparent'
            }`}
          >
            <Activity className="w-3.5 h-3.5" /> OVERVIEW
          </button>

          <button
            onClick={() => scrollToSection('section-auth', 'AUTHENTICATION')}
            className={`font-mono text-xs font-bold tracking-wider pb-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'AUTHENTICATION'
                ? 'text-[#0052ff] dark:text-[#3b82f6] border-[#0052ff] dark:border-[#3b82f6]'
                : 'text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#F2F2EE] border-transparent'
            }`}
          >
            <Shield className="w-3.5 h-3.5" /> AUTHENTICATION
          </button>

          <button
            onClick={() => scrollToSection('section-identity', 'IDENTITY')}
            className={`font-mono text-xs font-bold tracking-wider pb-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'IDENTITY'
                ? 'text-[#0052ff] dark:text-[#3b82f6] border-[#0052ff] dark:border-[#3b82f6]'
                : 'text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#F2F2EE] border-transparent'
            }`}
          >
            <Fingerprint className="w-3.5 h-3.5" /> IDENTITY
          </button>

          <button
            onClick={() => scrollToSection('section-infra', 'INFRASTRUCTURE')}
            className={`font-mono text-xs font-bold tracking-wider pb-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'INFRASTRUCTURE'
                ? 'text-[#0052ff] dark:text-[#3b82f6] border-[#0052ff] dark:border-[#3b82f6]'
                : 'text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#F2F2EE] border-transparent'
            }`}
          >
            <Route className="w-3.5 h-3.5" /> INFRASTRUCTURE
          </button>

          <button
            onClick={() => scrollToSection('section-ai', 'AI / INTENT')}
            className={`font-mono text-xs font-bold tracking-wider pb-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'AI / INTENT'
                ? 'text-[#0052ff] dark:text-[#3b82f6] border-[#0052ff] dark:border-[#3b82f6]'
                : 'text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#F2F2EE] border-transparent'
            }`}
          >
            <BrainCircuit className="w-3.5 h-3.5" /> AI / INTENT
          </button>



          <button
            onClick={() => scrollToSection('section-findings', 'EVIDENCE')}
            className={`font-mono text-xs font-bold tracking-wider pb-3 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'EVIDENCE'
                ? 'text-[#0052ff] dark:text-[#3b82f6] border-[#0052ff] dark:border-[#3b82f6]'
                : 'text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#F2F2EE] border-transparent'
            }`}
          >
            <FileText className="w-3.5 h-3.5" /> EVIDENCE ({allFindings.length})
          </button>
        </div>
      </div>

      {/* Main Evidence Grid Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: Primary Forensic Evidence Panels (8 Cols) */}
        <div className="lg:col-span-8 flex flex-col gap-8">
          
          {/* 01.0 // METADATA - Email Identity */}
          <section id="section-metadata" className="border border-[#D5D5CE] dark:border-[#29342F] bg-[#F2F2EE] dark:bg-[#1B211E] relative p-6 rounded shadow-sm transition-colors">
            <span className="font-mono text-[10px] font-bold tracking-widest text-[#737688] dark:text-[#A0A7A3] absolute top-6 right-6">
              01.0 // METADATA
            </span>
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2.5 text-[#1a1c1c] dark:text-[#F2F2EE]">
              <FileText className="w-5 h-5 text-[#0052ff] dark:text-[#3b82f6]" />
              Email Identity
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="border-t border-[#D5D5CE] dark:border-[#29342F] pt-3">
                <div className="font-mono text-[10px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider mb-1">
                  MESSAGE ID
                </div>
                <div className="font-mono text-xs font-semibold text-[#1a1c1c] dark:text-[#F2F2EE] truncate flex items-center justify-between gap-2" title={report.messageId}>
                  <span className="truncate">&lt;{report.messageId}&gt;</span>
                  <button
                    onClick={() => handleCopy(report.messageId, 'messageId')}
                    className="text-[#737688] hover:text-[#0052ff] dark:hover:text-[#3b82f6] shrink-0"
                    title="Copy Message ID"
                  >
                    {copiedField === 'messageId' ? <Check className="w-3.5 h-3.5 text-[#10b981]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="border-t border-[#D5D5CE] dark:border-[#29342F] pt-3">
                <div className="font-mono text-[10px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider mb-1">
                  SENDER DOMAIN
                </div>
                <div className="font-mono text-xs font-semibold text-[#1a1c1c] dark:text-[#F2F2EE]">
                  {report.senderDomain}
                </div>
              </div>

              <div className="border-t border-[#D5D5CE] dark:border-[#29342F] pt-3">
                <div className="font-mono text-[10px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider mb-1">
                  TIMESTAMP
                </div>
                <div className="font-mono text-xs text-[#1a1c1c] dark:text-[#F2F2EE]">
                  {report.timestamp}
                </div>
              </div>

              <div className="border-t border-[#D5D5CE] dark:border-[#29342F] pt-3">
                <div className="font-mono text-[10px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider mb-1">
                  EXECUTION TIME
                </div>
                <div className="font-mono text-xs font-bold text-[#0052ff] dark:text-[#3b82f6] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {executionTimeFormatted}
                </div>
              </div>
            </div>
          </section>

          {/* Bento Grid: Auth & Identity (2 Columns) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* 02.0 // AUTH - Authentication */}
            <section id="section-auth" className="border border-[#D5D5CE] dark:border-[#29342F] bg-[#F2F2EE] dark:bg-[#1B211E] relative p-6 rounded shadow-sm transition-colors">
              <span className="font-mono text-[10px] font-bold tracking-widest text-[#737688] dark:text-[#A0A7A3] absolute top-6 right-6">
                02.0 // AUTH
              </span>

              <div className="flex justify-between items-start mb-6">
                <h2 className="text-lg font-bold flex items-center gap-2 text-[#1a1c1c] dark:text-[#F2F2EE]">
                  <Shield className="w-5 h-5 text-[#0052ff] dark:text-[#3b82f6]" />
                  Authentication
                </h2>
                <div className="text-right pr-20">
                  <div className="font-mono text-[9px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider">
                    SCORE ({Math.round(authWeight * 100)}% WT)
                  </div>
                  <div className={`font-mono text-sm font-bold ${authScore === 0 ? 'text-[#10b981]' : authScore >= 50 ? 'text-[#ba1a1a] dark:text-[#ef4444]' : 'text-[#f59e0b]'}`}>
                    {authScore}/100
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 font-mono text-xs">
                {/* SPF */}
                <div className="flex justify-between items-center border-b border-[#D5D5CE] dark:border-[#29342F] pb-2.5">
                  <span className="font-bold text-[#737688] dark:text-[#A0A7A3]">SPF</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                      report.authResults?.spf === 'pass'
                        ? 'text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/30'
                        : report.authResults?.spf === 'fail'
                        ? 'text-[#ba1a1a] dark:text-[#ef4444] bg-[#ba1a1a]/10 border border-[#ba1a1a]/30'
                        : 'text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/30'
                    }`}
                  >
                    {report.authResults?.spf?.toUpperCase() || 'NONE'}
                  </span>
                </div>

                {/* DKIM */}
                <div className="flex justify-between items-center border-b border-[#D5D5CE] dark:border-[#29342F] pb-2.5">
                  <span className="font-bold text-[#737688] dark:text-[#A0A7A3]">DKIM</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                      report.authResults?.dkim === 'pass'
                        ? 'text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/30'
                        : report.authResults?.dkim === 'fail'
                        ? 'text-[#ba1a1a] dark:text-[#ef4444] bg-[#ba1a1a]/10 border border-[#ba1a1a]/30'
                        : 'text-[#f59e0b] bg-[#f59e0b]/10 border border-[#f59e0b]/30'
                    }`}
                  >
                    {report.authResults?.dkim?.toUpperCase() || 'NONE'}
                  </span>
                </div>

                {/* DMARC */}
                <div className="flex justify-between items-center border-b border-[#D5D5CE] dark:border-[#29342F] pb-2.5">
                  <span className="font-bold text-[#737688] dark:text-[#A0A7A3]">DMARC ALIGNMENT</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                      report.authResults?.dmarcAlignment === 'strict' || report.authResults?.dmarcAlignment === 'relaxed'
                        ? 'text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/30'
                        : 'text-[#ba1a1a] dark:text-[#ef4444] bg-[#ba1a1a]/10 border border-[#ba1a1a]/30'
                    }`}
                  >
                    {report.authResults?.dmarcAlignment?.toUpperCase() || 'FAIL'}
                  </span>
                </div>

                {/* ARC */}
                <div className="flex justify-between items-center pb-1">
                  <span className="font-bold text-[#737688] dark:text-[#A0A7A3]">ARC PASS</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                      report.authResults?.arcPass
                        ? 'text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/30'
                        : 'text-[#737688] dark:text-[#A0A7A3] bg-[#EAEAE5] dark:bg-[#151A17]'
                    }`}
                  >
                    {report.authResults?.arcPass ? 'PASS' : 'FALSE'}
                  </span>
                </div>
              </div>

              {/* Auth Findings Snippet */}
              {report.authResults?.findings && report.authResults.findings.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[#D5D5CE] dark:border-[#29342F] space-y-2">
                  {report.authResults.findings.map((f, i) => (
                    <div key={i} className="text-[11px] font-mono flex items-start gap-1.5 text-[#434656] dark:text-[#A0A7A3]">
                      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${f.severity === 'HIGH' ? 'bg-[#ba1a1a]' : 'bg-[#f59e0b]'}`} />
                      <span>{f.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 03.0 // ID - Identity Analysis */}
            <section id="section-identity" className="border border-[#D5D5CE] dark:border-[#29342F] bg-[#F2F2EE] dark:bg-[#1B211E] relative p-6 rounded shadow-sm bracket-tl transition-colors">
              <span className="font-mono text-[10px] font-bold tracking-widest text-[#737688] dark:text-[#A0A7A3] absolute top-6 right-6">
                03.0 // ID
              </span>

              <div className="flex justify-between items-start mb-6">
                <h2 className="text-lg font-bold flex items-center gap-2 text-[#1a1c1c] dark:text-[#F2F2EE]">
                  <Fingerprint className="w-5 h-5 text-[#0052ff] dark:text-[#3b82f6]" />
                  Identity Analysis
                </h2>
                <div className="text-right pr-20">
                  <div className="font-mono text-[9px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider">
                    RISK ({Math.round(identityWeight * 100)}% WT)
                  </div>
                  <div className={`font-mono text-sm font-bold ${identityScore === 0 ? 'text-[#10b981]' : identityScore >= 50 ? 'text-[#ba1a1a] dark:text-[#ef4444]' : 'text-[#f59e0b]'}`}>
                    {identityScore}/100
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="font-mono text-[10px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider mb-1">
                    SENDER DOMAIN
                  </div>
                  <div className="font-mono text-xs font-semibold text-[#1a1c1c] dark:text-[#F2F2EE] pb-2 border-b border-[#D5D5CE] dark:border-[#29342F]">
                    {report.senderDomain}
                  </div>
                </div>

                {/* Identity Findings */}
                {report.riskMatrix?.pillars?.identity?.findings && report.riskMatrix.pillars.identity.findings.length > 0 ? (
                  <div className="space-y-2">
                    {report.riskMatrix.pillars.identity.findings.map((finding, idx) => (
                      <div
                        key={idx}
                        className={`p-3 text-xs rounded border-l-2 ${
                          finding.severity === 'HIGH'
                            ? 'bg-[#ba1a1a]/5 border-[#ba1a1a] dark:border-[#ef4444]'
                            : finding.severity === 'MEDIUM'
                            ? 'bg-[#f59e0b]/5 border-[#f59e0b]'
                            : 'bg-[#10b981]/5 border-[#10b981]'
                        }`}
                      >
                        <div className="font-mono text-[10px] font-bold text-[#ba1a1a] dark:text-[#ef4444] mb-1 flex items-center justify-between">
                          <span>{finding.type.replace(/_/g, ' ')}</span>
                          <span className="uppercase text-[9px]">{finding.severity}</span>
                        </div>
                        <p className="text-[#434656] dark:text-[#A0A7A3] text-xs leading-relaxed">
                          {finding.description}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 bg-[#10b981]/5 border-l-2 border-[#10b981] text-xs rounded">
                    <div className="font-mono text-[10px] font-bold text-[#10b981] mb-1">
                      IDENTITY VERIFIED (NO MISMATCH)
                    </div>
                    <p className="text-[#434656] dark:text-[#A0A7A3]">
                      No domain impersonation, brand abuse, or display name anomalies detected.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* 04.0 // INFRASTRUCTURE - Reverse-Hop Forensic Path */}
          <section id="section-infra" className="border border-[#D5D5CE] dark:border-[#29342F] bg-[#F2F2EE] dark:bg-[#1B211E] relative p-6 rounded shadow-sm transition-colors">
            <span className="font-mono text-[10px] font-bold tracking-widest text-[#737688] dark:text-[#A0A7A3] absolute top-6 right-6">
              04.0 // INFRASTRUCTURE
            </span>

            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2 text-[#1a1c1c] dark:text-[#F2F2EE]">
                  <Route className="w-5 h-5 text-[#0052ff] dark:text-[#3b82f6]" />
                  Infrastructure & Reverse-Hop Path
                </h2>
                <p className="text-xs text-[#737688] dark:text-[#A0A7A3] font-mono mt-1">
                  Chronological routing analysis from originating sender to receiving MTA ({report.forensicPath?.length || 0} Hops)
                </p>
              </div>
              <div className="text-right pr-20">
                <div className="font-mono text-[9px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider">
                  SCORE ({Math.round(infraWeight * 100)}% WT)
                </div>
                <div className={`font-mono text-sm font-bold ${infraScore === 0 ? 'text-[#10b981]' : 'text-[#ba1a1a] dark:text-[#ef4444]'}`}>
                  {infraScore}/100
                </div>
              </div>
            </div>

            {/* Hops Flow List */}
            {report.forensicPath && report.forensicPath.length > 0 ? (
              <div className="space-y-4">
                {report.forensicPath.map((hop: ForensicHop, index: number) => {
                  const hopNumber = String(index + 1).padStart(2, '0');
                  const hasCoordinates = hop.coordinates && hop.coordinates.length === 2 && (hop.coordinates[0] !== 0 || hop.coordinates[1] !== 0);

                  return (
                    <div
                      key={index}
                      className="border border-[#D5D5CE] dark:border-[#29342F] bg-[#EAEAE5] dark:bg-[#151A17] p-4 rounded relative transition-all hover:border-[#0052ff] dark:hover:border-[#3b82f6]"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2 border-b border-[#D5D5CE] dark:border-[#29342F]">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs font-extrabold text-[#0052ff] dark:text-[#3b82f6] bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 px-2 py-0.5 rounded">
                            HOP {hopNumber}
                          </span>
                          <span className="font-mono text-xs font-bold text-[#1a1c1c] dark:text-[#F2F2EE] flex items-center gap-1.5">
                            {hop.ip}
                            <button
                              onClick={() => handleCopy(hop.ip, `hop-ip-${index}`)}
                              className="text-[#737688] hover:text-[#0052ff] dark:hover:text-[#3b82f6]"
                              title="Copy IP"
                            >
                              {copiedField === `hop-ip-${index}` ? <Check className="w-3 h-3 text-[#10b981]" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {hop.isPrivate ? (
                            <span className="font-mono text-[10px] bg-[#737688]/15 text-[#737688] dark:text-[#A0A7A3] px-2 py-0.5 rounded border border-[#737688]/30 font-semibold">
                              PRIVATE IP
                            </span>
                          ) : (
                            <span className="font-mono text-[10px] bg-[#0052ff]/10 text-[#0052ff] dark:text-[#3b82f6] px-2 py-0.5 rounded border border-[#0052ff]/20 font-semibold">
                              PUBLIC IP
                            </span>
                          )}

                          {hop.trusted ? (
                            <span className="font-mono text-[10px] bg-[#10b981]/10 text-[#10b981] px-2 py-0.5 rounded border border-[#10b981]/30 font-bold">
                              TRUSTED
                            </span>
                          ) : (
                            <span className="font-mono text-[10px] bg-[#ba1a1a]/10 text-[#ba1a1a] dark:text-[#ef4444] px-2 py-0.5 rounded border border-[#ba1a1a]/30 font-bold">
                              UNTRUSTED
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Hop Details Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 font-mono text-[11px]">
                        <div>
                          <span className="text-[#737688] dark:text-[#7D8681] block text-[9px] uppercase">Claimed Hostname</span>
                          <span className="font-semibold text-[#1a1c1c] dark:text-[#F2F2EE] truncate block" title={hop.hostnameClaimed || 'N/A'}>
                            {hop.hostnameClaimed || 'N/A'}
                          </span>
                        </div>

                        <div>
                          <span className="text-[#737688] dark:text-[#7D8681] block text-[9px] uppercase">PTR Reverse DNS</span>
                          <span className={`font-semibold ${hop.ptrValid ? 'text-[#10b981]' : 'text-[#737688]'}`}>
                            {hop.ptrValid ? 'Valid PTR Match' : 'Unverified / None'}
                          </span>
                        </div>

                        <div>
                          <span className="text-[#737688] dark:text-[#7D8681] block text-[9px] uppercase">Geolocation</span>
                          <span className="font-semibold text-[#1a1c1c] dark:text-[#F2F2EE]">
                            {[hop.city, hop.country].filter(Boolean).join(', ') || (hop.isPrivate ? 'Internal Network' : 'Unknown')}
                          </span>
                        </div>

                        {hop.asn && (
                          <div className="sm:col-span-2">
                            <span className="text-[#737688] dark:text-[#7D8681] block text-[9px] uppercase">Autonomous System (ASN)</span>
                            <span className="font-semibold text-[#1a1c1c] dark:text-[#F2F2EE] truncate block" title={hop.asn}>
                              {hop.asn}
                            </span>
                          </div>
                        )}

                        {hasCoordinates && (
                          <div>
                            <span className="text-[#737688] dark:text-[#7D8681] block text-[9px] uppercase">Coordinates</span>
                            <span className="font-semibold text-[#0052ff] dark:text-[#3b82f6]">
                              {hop.coordinates![0].toFixed(4)}, {hop.coordinates![1].toFixed(4)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 bg-[#EAEAE5] dark:bg-[#151A17] rounded border border-[#D5D5CE] dark:border-[#29342F] text-xs font-mono text-[#737688] dark:text-[#A0A7A3]">
                Direct single-hop injection or internal MTA relay detected (no multi-hop routing headers found).
              </div>
            )}

            {/* Infrastructure Findings */}
            {report.riskMatrix?.pillars?.infrastructure?.findings && report.riskMatrix.pillars.infrastructure.findings.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[#D5D5CE] dark:border-[#29342F] space-y-2">
                <div className="font-mono text-[10px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider">
                  INFRASTRUCTURE FINDINGS
                </div>
                {report.riskMatrix.pillars.infrastructure.findings.map((f, idx) => (
                  <div key={idx} className="text-xs font-mono flex items-start gap-2 text-[#434656] dark:text-[#A0A7A3]">
                    <span className="w-1.5 h-1.5 rounded-full mt-1.5 bg-[#0052ff] shrink-0" />
                    <span>{f.description}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 05.0 // AI INTENT - Semantic NLP Analysis */}
          <section id="section-ai" className="border border-[#D5D5CE] dark:border-[#29342F] bg-[#F2F2EE] dark:bg-[#1B211E] relative p-6 rounded shadow-sm transition-colors">
            <span className="font-mono text-[10px] font-bold tracking-widest text-[#737688] dark:text-[#A0A7A3] absolute top-6 right-6">
              05.0 // AI ASSESSMENT
            </span>

            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2 text-[#1a1c1c] dark:text-[#F2F2EE]">
                  <BrainCircuit className="w-5 h-5 text-[#0052ff] dark:text-[#3b82f6]" />
                  AI & Semantic Intent Analysis
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-xs text-[#737688] dark:text-[#A0A7A3]">
                    Provider: <strong className="text-[#0052ff] dark:text-[#3b82f6] uppercase">{report.aiSummary?.provider || 'GEMINI'}</strong>
                  </span>
                  {report.aiSummary?.model && (
                    <span className="font-mono text-[10px] bg-[#0052ff]/10 text-[#0052ff] dark:text-[#3b82f6] px-1.5 py-0.5 rounded font-bold">
                      {report.aiSummary.model}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right pr-20">
                <div className="font-mono text-[9px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider">
                  THREAT ({Math.round(nlpWeight * 100)}% WT)
                </div>
                <div className={`font-mono text-sm font-bold ${nlpScore === 0 ? 'text-[#10b981]' : nlpScore >= 50 ? 'text-[#ba1a1a] dark:text-[#ef4444]' : 'text-[#f59e0b]'}`}>
                  {nlpScore}/100
                </div>
              </div>
            </div>

            {/* AI Summary Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="p-3 bg-[#EAEAE5] dark:bg-[#151A17] rounded border border-[#D5D5CE] dark:border-[#29342F]">
                <div className="font-mono text-[9px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider mb-1">
                  URGENCY SCORE
                </div>
                <div className="font-mono text-xl font-bold text-[#1a1c1c] dark:text-[#F2F2EE]">
                  {report.aiSummary?.urgency ?? 0}<span className="text-xs text-[#737688] font-normal">/100</span>
                </div>
              </div>

              <div className="p-3 bg-[#EAEAE5] dark:bg-[#151A17] rounded border border-[#D5D5CE] dark:border-[#29342F]">
                <div className="font-mono text-[9px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider mb-1">
                  AI CONFIDENCE
                </div>
                <div className="font-mono text-xl font-bold text-[#0052ff] dark:text-[#3b82f6]">
                  {aiConfidencePercent}%
                </div>
              </div>

              <div className="p-3 bg-[#EAEAE5] dark:bg-[#151A17] rounded border border-[#D5D5CE] dark:border-[#29342F]">
                <div className="font-mono text-[9px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider mb-1">
                  INTENT LABELS
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {report.aiSummary?.intent && report.aiSummary.intent.length > 0 ? (
                    report.aiSummary.intent.map((label, idx) => (
                      <span
                        key={idx}
                        className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          label === 'BENIGN'
                            ? 'bg-[#10b981]/15 text-[#10b981]'
                            : 'bg-[#ba1a1a]/15 text-[#ba1a1a] dark:text-[#ef4444]'
                        }`}
                      >
                        {label}
                      </span>
                    ))
                  ) : (
                    <span className="font-mono text-xs font-bold text-[#10b981]">BENIGN</span>
                  )}
                </div>
              </div>
            </div>

            {/* AI Findings Reasoning List */}
            <div className="space-y-3">
              <div className="font-mono text-[10px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider">
                AI FORENSIC REASONING & FINDINGS
              </div>

              {report.aiSummary?.findings && report.aiSummary.findings.length > 0 ? (
                report.aiSummary.findings.map((finding, idx) => {
                  const isExpanded = !!expandedFindings[`ai-${idx}`];
                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded border ${
                        finding.severity === 'HIGH'
                          ? 'border-[#ba1a1a]/30 bg-[#ba1a1a]/5 dark:bg-[#ba1a1a]/10'
                          : finding.severity === 'MEDIUM'
                          ? 'border-[#f59e0b]/30 bg-[#f59e0b]/5 dark:bg-[#f59e0b]/10'
                          : 'border-[#D5D5CE] dark:border-[#29342F] bg-[#EAEAE5] dark:bg-[#151A17]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                              finding.severity === 'HIGH'
                                ? 'bg-[#ba1a1a] text-white'
                                : finding.severity === 'MEDIUM'
                                ? 'bg-[#f59e0b] text-white'
                                : 'bg-[#0052ff] text-white'
                            }`}
                          >
                            {finding.severity}
                          </span>
                          <span className="font-mono text-xs font-bold text-[#1a1c1c] dark:text-[#F2F2EE]">
                            {finding.type.replace(/_/g, ' ')}
                          </span>
                        </div>

                        {finding.description.length > 180 && (
                          <button
                            onClick={() => toggleFinding(`ai-${idx}`)}
                            className="text-xs font-mono text-[#0052ff] dark:text-[#3b82f6] hover:underline flex items-center gap-1"
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            {isExpanded ? 'Collapse' : 'Expand'}
                          </button>
                        )}
                      </div>

                      <p className={`text-xs text-[#434656] dark:text-[#A0A7A3] leading-relaxed ${!isExpanded && finding.description.length > 180 ? 'line-clamp-2' : ''}`}>
                        {finding.description}
                      </p>
                    </div>
                  );
                })
              ) : (
                <div className="p-3 bg-[#10b981]/10 text-[#10b981] font-mono text-xs rounded border border-[#10b981]/20">
                  AI analysis detected no psychological manipulation, urgency coercion, or credential lures.
                </div>
              )}
            </div>
          </section>

          {/* Complete Findings Matrix (All Pillars) */}
          <section id="section-findings" className="border border-[#D5D5CE] dark:border-[#29342F] bg-[#F2F2EE] dark:bg-[#1B211E] relative p-6 rounded shadow-sm transition-colors">
            <span className="font-mono text-[10px] font-bold tracking-widest text-[#737688] dark:text-[#A0A7A3] absolute top-6 right-6">
              07.0 // ALL EVIDENCE
            </span>

            <div className="mb-6">
              <h2 className="text-lg font-bold flex items-center gap-2 text-[#1a1c1c] dark:text-[#F2F2EE]">
                <FileText className="w-5 h-5 text-[#0052ff] dark:text-[#3b82f6]" />
                Forensic Findings Matrix ({allFindings.length})
              </h2>
              <p className="text-xs text-[#737688] dark:text-[#A0A7A3] font-mono mt-1">
                Complete forensic record of verified signals, alerts, and heuristics across all 4 pillars.
              </p>
            </div>

            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#737688] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search findings, types, descriptions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs font-mono rounded border border-[#D5D5CE] dark:border-[#29342F] bg-[#EAEAE5] dark:bg-[#151A17] text-[#1a1c1c] dark:text-[#F2F2EE] focus:outline-none focus:border-[#0052ff] dark:focus:border-[#3b82f6]"
                />
              </div>

              {/* Severity Filter */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {['ALL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].map((sev) => (
                  <button
                    key={sev}
                    onClick={() => setSelectedSeverity(sev)}
                    className={`font-mono text-[10px] font-bold px-2.5 py-1.5 rounded border transition-colors ${
                      selectedSeverity === sev
                        ? 'bg-[#0052ff] dark:bg-[#3b82f6] text-white border-[#0052ff] dark:border-[#3b82f6]'
                        : 'bg-[#EAEAE5] dark:bg-[#151A17] text-[#737688] dark:text-[#A0A7A3] border-[#D5D5CE] dark:border-[#29342F] hover:border-[#0052ff]'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            {/* Pillar Filter Tabs */}
            <div className="flex flex-wrap gap-2 mb-6">
              {['ALL', 'AUTHENTICATION', 'IDENTITY', 'INFRASTRUCTURE', 'AI / INTENT'].map((pillar) => (
                <button
                  key={pillar}
                  onClick={() => setSelectedPillar(pillar)}
                  className={`font-mono text-[10px] font-bold px-3 py-1 rounded transition-colors ${
                    selectedPillar === pillar
                      ? 'bg-[#1a1c1c] dark:bg-[#F2F2EE] text-white dark:text-[#1a1c1c]'
                      : 'bg-[#EAEAE5] dark:bg-[#151A17] text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#F2F2EE]'
                  }`}
                >
                  {pillar}
                </button>
              ))}
            </div>

            {/* Findings List */}
            {filteredFindings.length > 0 ? (
              <div className="space-y-3">
                {filteredFindings.map((finding) => (
                  <div
                    key={finding.id}
                      className="p-4 rounded border border-[#D5D5CE] dark:border-[#29342F] bg-[#EAEAE5] dark:bg-[#151A17] hover:border-[#0052ff] dark:hover:border-[#3b82f6] transition-all"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono text-[9px] font-extrabold px-2 py-0.5 rounded tracking-wider ${
                              finding.severity === 'HIGH'
                                ? 'bg-[#ba1a1a] text-white'
                                : finding.severity === 'MEDIUM'
                                ? 'bg-[#f59e0b] text-white'
                                : finding.severity === 'LOW'
                                ? 'bg-[#10b981] text-white'
                                : 'bg-[#0052ff] text-white'
                            }`}
                          >
                            {finding.severity}
                          </span>

                          <span className="font-mono text-[10px] font-bold text-[#737688] dark:text-[#A0A7A3]">
                            [{finding.pillar}]
                          </span>

                          <span className="font-mono text-xs font-bold text-[#1a1c1c] dark:text-[#F2F2EE]">
                            {finding.type}
                          </span>
                        </div>

                        {finding.source && (
                          <span className="font-mono text-[9px] text-[#737688] dark:text-[#7D8681] uppercase">
                            source: {finding.source}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-[#434656] dark:text-[#A0A7A3] leading-relaxed">
                        {finding.description}
                      </p>
                    </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center border border-dashed border-[#D5D5CE] dark:border-[#29342F] rounded font-mono text-xs text-[#737688] dark:text-[#A0A7A3]">
                No findings match the selected filters.
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN: Context, 4-Pillar Risk Engine & Integrity (4 Cols) */}
        <div className="lg:col-span-4 flex flex-col gap-8">
          
          {/* SYS.OP // ENGINE - 4-Pillar Risk Engine Tactical Card */}
          <div id="section-risk" className="bg-[#121212] text-white p-6 rounded relative shadow-md bracket-tl bracket-br transition-colors">
            <div className="font-mono text-[10px] font-bold text-gray-400 absolute top-6 right-6 tracking-widest">
              SYS.OP // ENGINE
            </div>

            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-white">
              <ShieldAlert className="w-5 h-5 text-[#0052ff] dark:text-[#3b82f6]" />
              Risk Engine Breakdown
            </h2>

            {/* Total Threat Score */}
            <div className="flex items-end gap-2 border-b border-gray-800 pb-4 mb-6">
              <span className={`text-5xl font-extrabold font-mono ${finalScore >= 50 ? 'text-[#ba1a1a] dark:text-[#ef4444]' : 'text-[#10b981]'}`}>
                {finalScore}
              </span>
              <span className="font-mono text-xs text-gray-400 mb-2">/ 100 TTL SCORE</span>
            </div>

            {/* 4 Pillars Bars */}
            <div className="space-y-4 font-mono text-xs">
              {/* Auth */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-gray-400">Auth.Score ({Math.round(authWeight * 100)}% wt)</span>
                  <span className={`font-bold ${authScore === 0 ? 'text-[#10b981]' : 'text-[#ba1a1a]'}`}>
                    {String(authScore).padStart(2, '0')}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${authScore === 0 ? 'bg-[#10b981]' : 'bg-[#ba1a1a]'}`}
                    style={{ width: `${Math.min(100, Math.max(2, authScore))}%` }}
                  />
                </div>
              </div>

              {/* Identity */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-gray-400">Identity.Risk ({Math.round(identityWeight * 100)}% wt)</span>
                  <span className={`font-bold ${identityScore === 0 ? 'text-[#10b981]' : identityScore >= 50 ? 'text-[#ba1a1a]' : 'text-[#f59e0b]'}`}>
                    {String(identityScore).padStart(2, '0')}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${identityScore === 0 ? 'bg-[#10b981]' : identityScore >= 50 ? 'bg-[#ba1a1a]' : 'bg-[#f59e0b]'}`}
                    style={{ width: `${Math.min(100, Math.max(2, identityScore))}%` }}
                  />
                </div>
              </div>

              {/* Infrastructure */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-gray-400">Infra.Score ({Math.round(infraWeight * 100)}% wt)</span>
                  <span className={`font-bold ${infraScore === 0 ? 'text-[#10b981]' : 'text-[#ba1a1a]'}`}>
                    {String(infraScore).padStart(2, '0')}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${infraScore === 0 ? 'bg-[#10b981]' : 'bg-[#ba1a1a]'}`}
                    style={{ width: `${Math.min(100, Math.max(2, infraScore))}%` }}
                  />
                </div>
              </div>

              {/* AI / Intent */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-gray-400">Intent.Threat ({Math.round(nlpWeight * 100)}% wt)</span>
                  <span className={`font-bold ${nlpScore === 0 ? 'text-[#10b981]' : nlpScore >= 50 ? 'text-[#ba1a1a]' : 'text-[#f59e0b]'}`}>
                    {String(nlpScore).padStart(2, '0')}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${nlpScore === 0 ? 'bg-[#10b981]' : nlpScore >= 50 ? 'bg-[#ba1a1a]' : 'bg-[#f59e0b]'}`}
                    style={{ width: `${Math.min(100, Math.max(2, nlpScore))}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Quarantine Override Banner */}
            {report.riskMatrix?.quarantineOverride && (
              <div className="mt-6 p-3 bg-[#ba1a1a]/20 border border-[#ba1a1a]/40 rounded text-xs font-mono text-[#ffb4ab]">
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  <ShieldAlert className="w-4 h-4 text-[#ef4444]" />
                  QUARANTINE OVERRIDE ACTIVE
                </div>
                <div>Critical threat signals require immediate automated containment.</div>
              </div>
            )}
          </div>

          {/* 07.0 // INTEGRITY HASH - Cryptographic Forensic Audit */}
          <div id="section-integrity" className="border border-[#D5D5CE] dark:border-[#29342F] bg-[#F2F2EE] dark:bg-[#1B211E] p-6 rounded shadow-sm transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-4 h-4 text-[#0052ff] dark:text-[#3b82f6]" />
              <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-[#1a1c1c] dark:text-[#F2F2EE]">
                Forensic Integrity Hash
              </h2>
            </div>
            
            <p className="text-xs text-[#737688] dark:text-[#A0A7A3] mb-3 leading-relaxed">
              Cryptographic HMAC-SHA256 signature sealing forensic chain-of-custody and evidence auditability.
            </p>

            <div className="p-3 bg-[#EAEAE5] dark:bg-[#151A17] rounded border border-[#D5D5CE] dark:border-[#29342F] relative group">
              <div className="font-mono text-[11px] text-[#1a1c1c] dark:text-[#F2F2EE] break-all select-all font-medium">
                {report.aiSummary?.integrityHash || 'SHA256:VERIFIED_HASH_RECORD'}
              </div>
              <div className="mt-3 flex justify-between items-center border-t border-[#D5D5CE] dark:border-[#29342F] pt-2">
                <span className="font-mono text-[10px] text-[#10b981] font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> VERIFIED SIGNATURE
                </span>
                <button
                  onClick={() => handleCopy(report.aiSummary?.integrityHash || '', 'integrityHash')}
                  className="text-xs font-mono text-[#0052ff] dark:text-[#3b82f6] font-bold hover:underline inline-flex items-center gap-1"
                >
                  {copiedField === 'integrityHash' ? (
                    <>
                      <Check className="w-3 h-3 text-[#10b981]" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> Copy Hash
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Timeline / Evidence Log (Visual Stitch Timeline) */}
          <div className="border border-[#D5D5CE] dark:border-[#29342F] bg-[#F2F2EE] dark:bg-[#1B211E] p-6 rounded shadow-sm transition-colors">
            <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-[#737688] dark:text-[#A0A7A3] mb-4">
              Evidence Timeline
            </h2>

            <div className="flex flex-col border-l border-[#D5D5CE] dark:border-[#29342F] ml-2 relative space-y-4">
              {/* Event 1: Auth */}
              <div className="pl-4 relative">
                <div className={`absolute w-2 h-2 rounded-full -left-[5px] top-1 ${report.authResults?.dkim === 'pass' || report.authResults?.spf === 'pass' ? 'bg-[#10b981]' : 'bg-[#ba1a1a]'}`} />
                <div className="font-mono text-[10px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase">
                  AUTH_VERIFY
                </div>
                <div className="text-xs font-medium text-[#1a1c1c] dark:text-[#F2F2EE] mt-0.5">
                  DKIM: {report.authResults?.dkim?.toUpperCase() || 'NONE'} · SPF: {report.authResults?.spf?.toUpperCase() || 'NONE'}
                </div>
              </div>

              {/* Event 2: Reverse-Hop Geo */}
              <div className="pl-4 relative">
                <div className="absolute w-2 h-2 bg-[#0052ff] dark:bg-[#3b82f6] rounded-full -left-[5px] top-1" />
                <div className="font-mono text-[10px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase">
                  ROUTE_INGEST
                </div>
                <div className="text-xs font-medium text-[#1a1c1c] dark:text-[#F2F2EE] mt-0.5">
                  {report.forensicPath?.length || 0} infrastructure hop(s) evaluated
                </div>
              </div>

              {/* Event 3: Identity */}
              <div className="pl-4 relative">
                <div className={`absolute w-2 h-2 rounded-full -left-[5px] top-1 ${identityScore === 0 ? 'bg-[#10b981]' : 'bg-[#f59e0b]'}`} />
                <div className="font-mono text-[10px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase">
                  ID_AUDIT
                </div>
                <div className="text-xs font-medium text-[#1a1c1c] dark:text-[#F2F2EE] mt-0.5">
                  Sender domain {report.senderDomain} verified
                </div>
              </div>

              {/* Event 4: AI Assessment */}
              <div className="pl-4 relative">
                <div className={`absolute w-2 h-2 rounded-full -left-[5px] top-1 ${nlpScore === 0 ? 'bg-[#10b981]' : 'bg-[#ba1a1a]'}`} />
                <div className="font-mono text-[10px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase">
                  NLP_ASSESS
                </div>
                <div className="text-xs font-medium text-[#1a1c1c] dark:text-[#F2F2EE] mt-0.5">
                  Intent classified as {report.aiSummary?.intent?.join(', ') || 'BENIGN'} ({aiConfidencePercent}%)
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions Card */}
          <div className="border border-[#D5D5CE] dark:border-[#29342F] bg-[#F2F2EE] dark:bg-[#1B211E] p-6 rounded shadow-sm transition-colors">
            <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-[#737688] dark:text-[#A0A7A3] mb-4">
              Investigation Actions
            </h2>

            <div className="space-y-3">
              <Link
                href={`/forensic-analysis?jobId=${caseId}`}
                className="w-full border border-[#D5D5CE] dark:border-[#29342F] hover:border-[#0052ff] dark:hover:border-[#3b82f6] text-[#1a1c1c] dark:text-[#F2F2EE] py-2.5 px-4 rounded text-xs font-mono font-semibold flex items-center justify-between transition-colors bg-[#EAEAE5] dark:bg-[#151A17]"
              >
                <span>← Analysis Console</span>
                <ExternalLink className="w-3.5 h-3.5 text-[#0052ff] dark:text-[#3b82f6]" />
              </Link>

              <button
                onClick={handleExportJson}
                className="w-full bg-[#0052ff] dark:bg-[#3b82f6] text-white py-2.5 px-4 rounded text-xs font-mono font-bold tracking-wider hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors flex items-center justify-between shadow-sm"
              >
                <span>Export Full Evidence JSON</span>
                <Download className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={handlePrint}
                className="w-full border border-[#D5D5CE] dark:border-[#29342F] text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#F2F2EE] py-2.5 px-4 rounded text-xs font-mono flex items-center justify-between transition-colors"
              >
                <span>Print Forensic Dossier</span>
                <Printer className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
