'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import type { AnalysisReport } from '@mailiac/shared-types';
import {
  Shield,
  Fingerprint,
  Globe,
  BrainCircuit,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import {
  getExecutiveVerdictDetails,
  getPillarScoreVisuals,
} from '@/lib/findings';

interface RiskPillarGridProps {
  report?: AnalysisReport | null;
  caseId?: string;
}

export default function RiskPillarGrid({ report, caseId }: RiskPillarGridProps): React.JSX.Element {
  const pillars = report?.riskMatrix?.pillars;

  const authScore = pillars?.authentication ? Math.round(pillars.authentication.score) : 0;
  const identityScore = pillars?.identity ? Math.round(pillars.identity.score) : 0;
  const infraScore = pillars?.infrastructure ? Math.round(pillars.infrastructure.score) : 0;
  const nlpScore = pillars?.nlp ? Math.round(pillars.nlp.score) : 0;

  const authWeight = pillars?.authentication ? `${Math.round(pillars.authentication.weight * 100)}%` : '30%';
  const identityWeight = pillars?.identity ? `${Math.round(pillars.identity.weight * 100)}%` : '25%';
  const infraWeight = pillars?.infrastructure ? `${Math.round(pillars.infrastructure.weight * 100)}%` : '20%';
  const nlpWeight = pillars?.nlp ? `${Math.round(pillars.nlp.weight * 100)}%` : '25%';

  // Executive decision data strictly derived from backend report
  const verdict = useMemo(() => getExecutiveVerdictDetails(report), [report]);

  // Semantic severity visuals for each pillar
  const authVisuals = getPillarScoreVisuals(authScore);
  const identityVisuals = getPillarScoreVisuals(identityScore);
  const infraVisuals = getPillarScoreVisuals(infraScore);
  const nlpVisuals = getPillarScoreVisuals(nlpScore);

  const authSummaryText = useMemo(() => {
    if (!report?.authResults) return 'SPF, DKIM, DMARC, ARC validation and alignment checks.';
    const { spf, dkim, dmarcAlignment } = report.authResults;
    if (dkim === 'pass' && (dmarcAlignment === 'strict' || dmarcAlignment === 'relaxed')) {
      return 'Cryptographic signatures verified; sender domain aligned.';
    }
    if (dkim === 'fail') {
      return 'Cryptographic signature mismatch; potential message tampering.';
    }
    if (spf === 'fail') {
      return 'Originating mail server is not authorized in SPF policy.';
    }
    return `SPF: ${spf.toUpperCase()} | DKIM: ${dkim.toUpperCase()} | DMARC: ${dmarcAlignment.toUpperCase()}`;
  }, [report?.authResults]);

  const identitySummaryText = useMemo(() => {
    if (!report) return 'Domain similarity, impersonation and brand abuse detection.';
    if (identityScore === 0) {
      return `Sender domain ${report.senderDomain || 'N/A'} verified with no brand lookalikes.`;
    }
    return `Identity signals for ${report.senderDomain || 'sender'} flagged with risk ${identityScore}/100.`;
  }, [report, identityScore]);

  const infraSummaryText = useMemo(() => {
    if (!report) return 'IP reputation, ASN, geolocation and routing anomalies.';
    const hops = report.forensicPath?.length || 0;
    if (infraScore === 0) {
      return `${hops} routing hop(s) traced across recognized, non-suspicious infrastructure.`;
    }
    return `${hops} routing hop(s) traced; infrastructure elevated risk ${infraScore}/100.`;
  }, [report, infraScore]);

  const nlpSummaryText = useMemo(() => {
    if (!report) return 'LLM-powered intent analysis, psychological & behavioral cues.';
    const intents = report.aiSummary?.intent || [];
    const formatted = intents.length > 0 ? intents.join(', ').replace(/_/g, ' ') : 'Benign Communication';
    return `Intent classification: ${formatted}.`;
  }, [report]);

  return (
    <section id="risk-engine" className="py-20 px-6 md:px-16 bg-[#EAEAE5] dark:bg-[#151A17] border-y border-[#D5D5CE] dark:border-[#29342F] transition-colors duration-200">
      <div className="max-w-[1440px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
          
          {/* Left Column: Executive Decision Summary Card */}
          <div className="lg:col-span-1 pr-0 lg:pr-6 flex flex-col justify-between bg-[#F2F2EE] dark:bg-[#1B211E] border border-[#D5D5CE] dark:border-[#29342F] p-6 rounded shadow-sm">
            <div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <span className="text-xs font-mono font-bold text-[#434656] dark:text-[#A0A7A3] uppercase tracking-widest">
                  FORENSIC RISK ASSESSMENT
                </span>
                {verdict.isOverridden && (
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                    <Zap className="w-3 h-3" /> Overridden
                  </span>
                )}
              </div>

              {/* Large Score & Verdict */}
              <div className="flex items-baseline gap-3 mb-3">
                <span className={`text-5xl font-extrabold font-mono tracking-tight ${verdict.colorText}`}>
                  {verdict.score}
                </span>
                <span className="text-lg font-mono text-[#737688] dark:text-[#7D8681]">/ 100</span>
              </div>

              {/* Severity Badge */}
              <div className="mb-4">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded font-mono text-xs font-bold border ${verdict.colorBg} ${verdict.colorText} ${verdict.colorBorder}`}>
                  {verdict.score <= 20 ? (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  ) : (
                    <ShieldAlert className="w-3.5 h-3.5" />
                  )}
                  {verdict.severityLabel}
                </span>
              </div>

              {/* Reconciliation / Formula summary */}
              <div className="text-xs font-mono text-[#737688] dark:text-[#7D8681] pb-3 border-b border-[#D5D5CE] dark:border-[#29342F]">
                {verdict.isOverridden ? (
                  <span>
                    Formula Base: <strong>{verdict.baseScore.toFixed(1)}</strong> → Final: <strong>{verdict.score}</strong>
                  </span>
                ) : (
                  <span>
                    Weighted Aggregate Score: <strong>{verdict.score}</strong>/100
                  </span>
                )}
              </div>

              {/* Recommended Action */}
              <div className="mt-4">
                <div className="text-[11px] font-mono font-bold text-[#434656] dark:text-[#A0A7A3] uppercase tracking-wider mb-1.5">
                  Recommended SOC Action
                </div>
                <p className="text-xs text-[#1a1c1c] dark:text-[#F2F2EE] leading-relaxed border-l-2 border-[#0052ff] dark:border-[#3b82f6] pl-3 py-1 bg-[#EAEAE5]/60 dark:bg-[#151A17]/60 rounded-r">
                  {verdict.recommendedAction}
                </p>
              </div>
            </div>

            {/* Direct Dossier Link (replaces dead button) */}
            {caseId && (
              <div className="pt-6 mt-6 border-t border-[#D5D5CE] dark:border-[#29342F]">
                <Link
                  href={`/analysis-console/${encodeURIComponent(caseId)}/evidence`}
                  className="w-full inline-flex items-center justify-center gap-2 bg-[#0052ff] dark:bg-[#3b82f6] text-white px-5 py-2.5 rounded font-medium hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors shadow-sm text-xs font-mono"
                >
                  View Full Evidence Explorer <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </div>

          {/* Right Column: 4 Dimension Cards with Semantic Risk Colors */}
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Card 1: Authentication */}
            <div className="bg-[#F2F2EE] dark:bg-[#1B211E] border border-[#D5D5CE] dark:border-[#29342F] p-6 rounded flex flex-col justify-between gap-4 forensic-card bracket-tl shadow-sm">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <Shield className="w-6 h-6 text-[#1a1c1c] dark:text-[#F2F2EE]" />
                  <div>
                    <div className="font-bold text-sm text-[#1a1c1c] dark:text-[#F2F2EE]">Authentication</div>
                    <div className="text-xs font-mono text-[#737688] dark:text-[#A0A7A3]">{authWeight} weight</div>
                  </div>
                </div>
                <div className={`text-3xl font-bold font-mono ${authVisuals.colorText}`}>
                  {authScore}<span className="text-sm text-[#737688] dark:text-[#7D8681] font-normal">/100</span>
                </div>
              </div>
              <p className="text-xs text-[#434656] dark:text-[#A0A7A3] border-t border-[#D5D5CE] dark:border-[#29342F] pt-3 leading-relaxed">
                {authSummaryText}
              </p>
            </div>

            {/* Card 2: Identity */}
            <div className="bg-[#F2F2EE] dark:bg-[#1B211E] border border-[#D5D5CE] dark:border-[#29342F] p-6 rounded flex flex-col justify-between gap-4 forensic-card shadow-sm">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <Fingerprint className="w-6 h-6 text-[#1a1c1c] dark:text-[#F2F2EE]" />
                  <div>
                    <div className="font-bold text-sm text-[#1a1c1c] dark:text-[#F2F2EE]">Identity</div>
                    <div className="text-xs font-mono text-[#737688] dark:text-[#A0A7A3]">{identityWeight} weight</div>
                  </div>
                </div>
                <div className={`text-3xl font-bold font-mono ${identityVisuals.colorText}`}>
                  {identityScore}<span className="text-sm text-[#737688] dark:text-[#7D8681] font-normal">/100</span>
                </div>
              </div>
              <p className="text-xs text-[#434656] dark:text-[#A0A7A3] border-t border-[#D5D5CE] dark:border-[#29342F] pt-3 leading-relaxed">
                {identitySummaryText}
              </p>
            </div>

            {/* Card 3: Infrastructure */}
            <div className="bg-[#F2F2EE] dark:bg-[#1B211E] border border-[#D5D5CE] dark:border-[#29342F] p-6 rounded flex flex-col justify-between gap-4 forensic-card shadow-sm">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <Globe className="w-6 h-6 text-[#1a1c1c] dark:text-[#F2F2EE]" />
                  <div>
                    <div className="font-bold text-sm text-[#1a1c1c] dark:text-[#F2F2EE]">Infrastructure</div>
                    <div className="text-xs font-mono text-[#737688] dark:text-[#A0A7A3]">{infraWeight} weight</div>
                  </div>
                </div>
                <div className={`text-3xl font-bold font-mono ${infraVisuals.colorText}`}>
                  {infraScore}<span className="text-sm text-[#737688] dark:text-[#7D8681] font-normal">/100</span>
                </div>
              </div>
              <p className="text-xs text-[#434656] dark:text-[#A0A7A3] border-t border-[#D5D5CE] dark:border-[#29342F] pt-3 leading-relaxed">
                {infraSummaryText}
              </p>
            </div>

            {/* Card 4: AI / Intent */}
            <div className="bg-[#F2F2EE] dark:bg-[#1B211E] border border-[#D5D5CE] dark:border-[#29342F] p-6 rounded flex flex-col justify-between gap-4 forensic-card bracket-br shadow-sm">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <BrainCircuit className="w-6 h-6 text-[#1a1c1c] dark:text-[#F2F2EE]" />
                  <div>
                    <div className="font-bold text-sm text-[#1a1c1c] dark:text-[#F2F2EE]">AI / Intent</div>
                    <div className="text-xs font-mono text-[#737688] dark:text-[#A0A7A3]">{nlpWeight} weight</div>
                  </div>
                </div>
                <div className={`text-3xl font-bold font-mono ${nlpVisuals.colorText}`}>
                  {nlpScore}<span className="text-sm text-[#737688] dark:text-[#7D8681] font-normal">/100</span>
                </div>
              </div>
              <p className="text-xs text-[#434656] dark:text-[#A0A7A3] border-t border-[#D5D5CE] dark:border-[#29342F] pt-3 leading-relaxed">
                {nlpSummaryText}
              </p>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
