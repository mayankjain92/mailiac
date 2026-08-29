'use client';

import React from 'react';
import type { AnalysisReport } from '@mailiac/shared-types';

interface RiskPillarGridProps {
  report?: AnalysisReport | null;
}

export default function RiskPillarGrid({ report }: RiskPillarGridProps) {
  const pillars = report?.riskMatrix?.pillars;

  const authScore = pillars?.authentication ? Math.round(pillars.authentication.score) : 91;
  const identityScore = pillars?.identity ? Math.round(pillars.identity.score) : 84;
  const infraScore = pillars?.infrastructure ? Math.round(pillars.infrastructure.score) : 72;
  const nlpScore = pillars?.nlp ? Math.round(pillars.nlp.score) : 95;

  const authWeight = pillars?.authentication ? `${Math.round(pillars.authentication.weight * 100)}%` : '30%';
  const identityWeight = pillars?.identity ? `${Math.round(pillars.identity.weight * 100)}%` : '20%';
  const infraWeight = pillars?.infrastructure ? `${Math.round(pillars.infrastructure.weight * 100)}%` : '20%';
  const nlpWeight = pillars?.nlp ? `${Math.round(pillars.nlp.weight * 100)}%` : '30%';

  return (
    <section id="risk-engine" className="py-24 px-6 md:px-16 bg-[#EAEAE5] dark:bg-[#151A17] border-y border-[#D5D5CE] dark:border-[#29342F] transition-colors duration-200">
      <div className="max-w-[1440px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
          
          {/* Section Description */}
          <div className="lg:col-span-1 pr-0 lg:pr-8">
            <div className="text-xs font-mono font-bold text-[#0052ff] dark:text-[#3b82f6] uppercase tracking-widest mb-4">
              THE 4-PILLAR RISK ENGINE
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-[#1a1c1c] dark:text-[#F2F2EE] tracking-tight mb-6">
              One score.<br />Complete clarity.
            </h2>
            <p className="text-base text-[#434656] dark:text-[#A0A7A3] mb-8 leading-relaxed">
              Explainable risk scoring across four forensic dimensions, so security operations teams know exactly why an email is dangerous.
            </p>
            <a
              href="#analysis-console"
              className="inline-flex items-center justify-center gap-2 bg-[#0052ff] dark:bg-[#3b82f6] text-white px-6 py-3 rounded font-medium hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors shadow-sm text-sm"
            >
              See live risk engine <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </a>
          </div>

          {/* 4 Pillar Cards */}
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Card 1: Authentication */}
            <div className="bg-[#F2F2EE] dark:bg-[#1B211E] border border-[#D5D5CE] dark:border-[#29342F] p-6 rounded flex flex-col gap-4 forensic-card bracket-tl shadow-sm">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#1a1c1c] dark:text-[#F2F2EE] text-2xl">shield</span>
                  <div>
                    <div className="font-bold text-[#1a1c1c] dark:text-[#F2F2EE]">Authentication</div>
                    <div className="text-xs font-mono text-[#0052ff] dark:text-[#3b82f6] font-bold">{authWeight} weight</div>
                  </div>
                </div>
                <div className="text-3xl font-bold text-[#0052ff] dark:text-[#3b82f6] font-mono">
                  {authScore}<span className="text-sm text-[#737688] dark:text-[#7D8681] font-normal">/100</span>
                </div>
              </div>
              <p className="text-xs text-[#434656] dark:text-[#A0A7A3] border-t border-[#D5D5CE] dark:border-[#29342F] pt-4 leading-normal">
                {report
                  ? `${report.authResults.spf.toUpperCase()} SPF | ${report.authResults.dkim.toUpperCase()} DKIM | DMARC: ${report.authResults.dmarcAlignment}`
                  : 'SPF, DKIM, DMARC, ARC validation and alignment checks.'}
              </p>
            </div>

            {/* Card 2: Identity */}
            <div className="bg-[#F2F2EE] dark:bg-[#1B211E] border border-[#D5D5CE] dark:border-[#29342F] p-6 rounded flex flex-col gap-4 forensic-card shadow-sm">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#1a1c1c] dark:text-[#F2F2EE] text-2xl">fingerprint</span>
                  <div>
                    <div className="font-bold text-[#1a1c1c] dark:text-[#F2F2EE]">Identity</div>
                    <div className="text-xs font-mono text-[#0052ff] dark:text-[#3b82f6] font-bold">{identityWeight} weight</div>
                  </div>
                </div>
                <div className="text-3xl font-bold text-[#0052ff] dark:text-[#3b82f6] font-mono">
                  {identityScore}<span className="text-sm text-[#737688] dark:text-[#7D8681] font-normal">/100</span>
                </div>
              </div>
              <p className="text-xs text-[#434656] dark:text-[#A0A7A3] border-t border-[#D5D5CE] dark:border-[#29342F] pt-4 leading-normal">
                {report
                  ? `Domain: ${report.senderDomain}`
                  : 'Domain similarity, impersonation and brand abuse detection.'}
              </p>
            </div>

            {/* Card 3: Infrastructure */}
            <div className="bg-[#F2F2EE] dark:bg-[#1B211E] border border-[#D5D5CE] dark:border-[#29342F] p-6 rounded flex flex-col gap-4 forensic-card shadow-sm">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#1a1c1c] dark:text-[#F2F2EE] text-2xl">language</span>
                  <div>
                    <div className="font-bold text-[#1a1c1c] dark:text-[#F2F2EE]">Infrastructure</div>
                    <div className="text-xs font-mono text-[#0052ff] dark:text-[#3b82f6] font-bold">{infraWeight} weight</div>
                  </div>
                </div>
                <div className="text-3xl font-bold text-[#0052ff] dark:text-[#3b82f6] font-mono">
                  {infraScore}<span className="text-sm text-[#737688] dark:text-[#7D8681] font-normal">/100</span>
                </div>
              </div>
              <p className="text-xs text-[#434656] dark:text-[#A0A7A3] border-t border-[#D5D5CE] dark:border-[#29342F] pt-4 leading-normal">
                {report
                  ? `${report.forensicPath.length} Hop(s) Traced across infrastructure`
                  : 'IP reputation, ASN, geolocation and routing anomalies.'}
              </p>
            </div>

            {/* Card 4: AI / Intent */}
            <div className="bg-[#F2F2EE] dark:bg-[#1B211E] border border-[#D5D5CE] dark:border-[#29342F] p-6 rounded flex flex-col gap-4 forensic-card bracket-br shadow-sm">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#1a1c1c] dark:text-[#F2F2EE] text-2xl">psychology</span>
                  <div>
                    <div className="font-bold text-[#1a1c1c] dark:text-[#F2F2EE]">AI / Intent</div>
                    <div className="text-xs font-mono text-[#0052ff] dark:text-[#3b82f6] font-bold">{nlpWeight} weight</div>
                  </div>
                </div>
                <div className="text-3xl font-bold text-[#0052ff] dark:text-[#3b82f6] font-mono">
                  {nlpScore}<span className="text-sm text-[#737688] dark:text-[#7D8681] font-normal">/100</span>
                </div>
              </div>
              <p className="text-xs text-[#434656] dark:text-[#A0A7A3] border-t border-[#D5D5CE] dark:border-[#29342F] pt-4 leading-normal">
                {report
                  ? `Intent: ${report.aiSummary.intent.join(', ') || 'General Communication'}`
                  : 'LLM-powered intent analysis, psychological & behavioral cues.'}
              </p>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
