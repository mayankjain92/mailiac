'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import StitchLandingHeader from '@/components/StitchLandingHeader';
import RiskPillarGrid from '@/components/RiskPillarGrid';
import ForensicIngestionModal from '@/components/ForensicIngestionModal';
import ForensicHeroVisualizer from '@/components/ForensicHeroVisualizer';
import {
  ArrowUpRight,
  ShieldCheck,
  Mail,
  FileText,
  ArrowRight,
  Sparkles,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { uploadEml, isAuthError } from '@/lib/api';

function LandingPageContent(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, openSignInModal } = useAuth();
  const [isIngestionModalOpen, setIsIngestionModalOpen] = useState(false);
  const [isLoadingSample, setIsLoadingSample] = useState(false);

  // If redirected from OAuth with ?gmail=connected, automatically navigate to /mailbox
  useEffect(() => {
    if (searchParams.get('gmail') === 'connected') {
      const sessionId = searchParams.get('sessionId');
      const target = sessionId
        ? `/mailbox?gmail=connected&sessionId=${encodeURIComponent(sessionId)}`
        : '/mailbox';
      router.push(target);
    }
  }, [searchParams, router]);

  const handleJobCreated = (jobId: string, fileName?: string): void => {
    router.push(
      `/forensic-analysis?jobId=${encodeURIComponent(jobId)}&fileName=${encodeURIComponent(
        fileName || 'Uploaded EML Sample'
      )}`
    );
  };

  const handleLoadSamplePhish = async (): Promise<void> => {
    if (!user) {
      openSignInModal('You need to sign in to run forensic analysis.');
      return;
    }

    setIsLoadingSample(true);
    try {
      const res = await fetch('/samples/sample-phish.eml');
      if (!res.ok) throw new Error('Could not retrieve sample file');
      const blob = await res.blob();
      const sampleFile = new File([blob], 'Urgent_Wire_Transfer_BEC_Phish.eml', {
        type: 'message/rfc822',
      });

      const data = await uploadEml(sampleFile);
      handleJobCreated(data.jobId, sampleFile.name);
    } catch (err: unknown) {
      if (isAuthError(err)) {
        return;
      }
      setIsIngestionModalOpen(true);
    } finally {
      setIsLoadingSample(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F2EE] dark:bg-[#0E1210] text-[#1a1c1c] dark:text-[#F2F2EE] transition-colors duration-200">
      {/* Stitch Top Navigation */}
      <StitchLandingHeader onAnalyzeClick={() => setIsIngestionModalOpen(true)} />

      <main>
        {/* Hero Section */}
        <section className="relative min-h-[calc(100vh-73px)] flex flex-col justify-center py-12 px-6 md:px-16 max-w-[1440px] mx-auto grid-bg overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 relative z-10 items-center w-full my-auto">
            {/* Hero Left Column */}
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-2 h-2 rounded-full bg-[#0052ff] dark:bg-[#3b82f6] pulse-dot"></div>
                <span className="text-xs font-bold text-[#434656] dark:text-[#A0A7A3] uppercase tracking-widest">
                  EMAIL FORENSICS PLATFORM
                </span>
              </div>

              <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter text-[#1a1c1c] dark:text-[#F2F2EE] leading-[1.05] mb-6">
                See what<br />others<br />miss<span className="text-[#0052ff] dark:text-[#3b82f6]">.</span>
              </h1>

              <p className="text-lg text-[#434656] dark:text-[#A0A7A3] max-w-md mb-10 leading-relaxed font-normal">
                Mailiac performs deep forensics, authentication validation, and AI analysis to expose phishing, BEC and spoofing attacks that bypass traditional defenses.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <button
                  onClick={() => setIsIngestionModalOpen(true)}
                  className="bg-[#0052ff] dark:bg-[#3b82f6] text-white px-8 py-4 rounded font-medium hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors inline-flex items-center justify-center gap-2 text-base shadow-sm"
                >
                  Analyze an email <ArrowUpRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleLoadSamplePhish}
                  disabled={isLoadingSample}
                  className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40 px-6 py-4 rounded text-xs font-bold transition-all inline-flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                  title="Live threat simulation: loads simulated CEO wire-transfer BEC attack"
                >
                  {isLoadingSample ? (
                    <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-amber-500" />
                  )}
                  <span>⚡ Try Sample Attack (Demo)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsIngestionModalOpen(true)}
                  className="border border-[#D5D5CE] dark:border-[#29342F] text-[#1a1c1c] dark:text-[#F2F2EE] px-6 py-4 rounded font-medium hover:bg-[#EAEAE5] dark:hover:bg-[#151A17] transition-colors inline-flex items-center justify-center text-base gap-2 cursor-pointer"
                >
                  <Mail className="w-4 h-4 text-[#0052ff] dark:text-[#3b82f6]" />
                  Gmail Mailbox →
                </button>
              </div>

              <div className="mt-12 pt-8 border-t border-[#D5D5CE] dark:border-[#29342F] flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-[#0052ff] dark:text-[#3b82f6]" />
                <span className="text-xs text-[#434656] dark:text-[#A0A7A3]">
                  Trusted by security & forensic investigation teams
                </span>
              </div>
            </div>

            {/* Hero Right Column — Forensic Intelligence Visualization & Floating Evidence Panels */}
            <div className="relative w-full flex items-center justify-center">
              <ForensicHeroVisualizer />
            </div>
          </div>
        </section>

        {/* 4-Pillar Risk Engine Section */}
        <section id="risk-engine">
          <RiskPillarGrid />
        </section>

        {/* Multi-Source Forensic Ingestion CTA Section */}
        <section id="analysis-console" className="py-20 px-6 md:px-16 max-w-[1440px] mx-auto">
          <div className="mb-10 text-center max-w-xl mx-auto">
            <div className="text-xs font-bold text-[#0052ff] dark:text-[#3b82f6] uppercase tracking-widest mb-2">
              FORENSIC INGESTION GATEWAY
            </div>
            <h2 className="text-3xl font-bold text-[#1a1c1c] dark:text-[#F2F2EE]">
              Start Email Investigation
            </h2>
            <p className="text-sm text-[#434656] dark:text-[#A0A7A3] mt-2">
              Submit an email via direct Gmail integration or raw <code className="font-mono text-[#0052ff] dark:text-[#3b82f6]">.eml</code> file upload to run the multi-stage forensic analysis.
            </p>
          </div>

          <div className="max-w-xl mx-auto">
            <div className="bg-[#F2F2EE] dark:bg-[#1B211E] border border-[#D5D5CE] dark:border-[#29342F] p-8 rounded shadow-sm forensic-card bracket-tl bracket-br text-center space-y-6">
              {/* Interactive Threat Sandbox Banner */}
              <div className="p-3.5 bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 rounded flex flex-col sm:flex-row items-center justify-between gap-3 text-left">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                      Interactive Forensic Sandbox
                    </p>
                    <p className="text-[11px] text-amber-800/80 dark:text-amber-400/80 mt-0.5">
                      No sample email file ready? Ingest a live BEC attack payload with one click to test the full pipeline.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLoadSamplePhish}
                  disabled={isLoadingSample}
                  className="shrink-0 w-full sm:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isLoadingSample ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Ingesting...</span>
                    </>
                  ) : (
                    <>
                      <span>⚡ Run Sample Attack</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                  onClick={() => setIsIngestionModalOpen(true)}
                  className="p-5 border border-[#D5D5CE] dark:border-[#29342F] rounded bg-[#EAEAE5] dark:bg-[#151A17] hover:border-[#0052ff] dark:hover:border-[#3b82f6] cursor-pointer transition-all flex flex-col items-center gap-2 group"
                >
                  <div className="w-10 h-10 rounded-full bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 flex items-center justify-center text-[#0052ff] dark:text-[#3b82f6]">
                    <FileText className="w-5 h-5" />
                  </div>
                  <h3 className="text-xs font-bold text-[#1a1c1c] dark:text-[#F2F2EE]">
                    Upload .EML
                  </h3>
                  <p className="text-[11px] text-[#737688] dark:text-[#A0A7A3]">
                    Local file analysis from workstation
                  </p>
                  <span className="text-[11px] text-[#0052ff] dark:text-[#3b82f6] font-semibold mt-1 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                    Select File <ArrowRight className="w-3 h-3" />
                  </span>
                </div>

                <div
                  onClick={() => setIsIngestionModalOpen(true)}
                  className="p-5 border border-[#0052ff]/30 dark:border-[#3b82f6]/30 rounded bg-[#0052ff]/5 dark:bg-[#3b82f6]/10 hover:border-[#0052ff] dark:hover:border-[#3b82f6] cursor-pointer transition-all flex flex-col items-center gap-2 group"
                >
                  <div className="w-10 h-10 rounded-full bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 flex items-center justify-center text-[#0052ff] dark:text-[#3b82f6]">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs font-bold text-[#1a1c1c] dark:text-[#F2F2EE]">
                      Connect Gmail
                    </h3>
                    <span className="text-[9px] px-1 py-0.5 bg-blue-500/15 text-[#0052ff] dark:text-[#3b82f6] font-bold rounded">
                      SANDBOX
                    </span>
                  </div>
                  <p className="text-[11px] text-[#737688] dark:text-[#A0A7A3]">
                    Direct mailbox investigation
                  </p>
                  <span className="text-[11px] text-[#0052ff] dark:text-[#3b82f6] font-semibold mt-1 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                    Open Mailbox <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>

              <button
                onClick={() => setIsIngestionModalOpen(true)}
                className="w-full bg-[#0052ff] dark:bg-[#3b82f6] text-white text-xs font-semibold py-3 px-4 rounded hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                <span>Analyze an email</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Stitch Footer */}
      <footer className="bg-[#EAEAE5] dark:bg-[#151A17] border-t border-[#D5D5CE] dark:border-[#29342F] w-full px-6 md:px-16 py-12 max-w-[1440px] mx-auto transition-colors duration-200">
        <div className="flex flex-col md:flex-row justify-between items-start gap-8">
          <div>
            <Link className="flex items-center gap-2 group mb-4" href="/">
              <div className="h-6 w-6 rounded bg-[#434656] dark:bg-[#29342F] flex items-center justify-center text-white font-bold text-xs">
                M
              </div>
              <span className="text-lg font-bold text-[#1a1c1c] dark:text-[#F2F2EE]">Mailiac</span>
            </Link>
            <p className="text-xs text-[#737688] dark:text-[#A0A7A3]">
              © 2026 Mailiac Forensics. All rights reserved.<br />
              Forensic Grade Email Security Pipeline.
            </p>
          </div>
        </div>
      </footer>

      {/* Forensic Ingestion Modal */}
      <ForensicIngestionModal
        isOpen={isIngestionModalOpen}
        onClose={() => setIsIngestionModalOpen(false)}
        onJobCreated={handleJobCreated}
      />
    </div>
  );
}

export default function LandingPage(): React.JSX.Element {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F2F2EE] dark:bg-[#0E1210]" />}>
      <LandingPageContent />
    </Suspense>
  );
}
