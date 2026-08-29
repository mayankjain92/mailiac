'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import UploadZone from '@/components/UploadZone';
import StitchLandingHeader from '@/components/StitchLandingHeader';
import RiskPillarGrid from '@/components/RiskPillarGrid';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export default function LandingPage() {
  const router = useRouter();

  const handleJobCreated = (jobId: string, fileName: string) => {
    // Navigate immediately to the dedicated Forensic Analysis Console page
    router.push(`/forensic-analysis?jobId=${jobId}&fileName=${encodeURIComponent(fileName)}`);
  };

  const scrollToConsole = () => {
    const consoleEl = document.getElementById('analysis-console');
    if (consoleEl) {
      consoleEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F2EE] dark:bg-[#0E1210] text-[#1a1c1c] dark:text-[#F2F2EE] transition-colors duration-200">
      
      {/* Stitch Top Navigation */}
      <StitchLandingHeader onAnalyzeClick={scrollToConsole} />

      <main>
        {/* Hero Section */}
        <section className="relative min-h-[calc(100vh-73px)] flex flex-col justify-center py-12 px-6 md:px-16 max-w-[1440px] mx-auto grid-bg overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 relative z-10 items-center w-full my-auto">
            
            {/* Hero Left Column */}
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-2 h-2 rounded-full bg-[#0052ff] dark:bg-[#3b82f6] pulse-dot"></div>
                <span className="text-xs font-mono font-bold text-[#434656] dark:text-[#A0A7A3] uppercase tracking-widest">
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
                  onClick={scrollToConsole}
                  className="bg-[#0052ff] dark:bg-[#3b82f6] text-white px-8 py-4 rounded font-medium hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors inline-flex items-center justify-center gap-2 text-base shadow-sm"
                >
                  Analyze an email <ArrowUpRight className="w-4 h-4" />
                </button>
                <Link
                  href="/forensic-analysis"
                  className="border border-[#D5D5CE] dark:border-[#29342F] text-[#1a1c1c] dark:text-[#F2F2EE] px-6 py-4 rounded font-medium hover:bg-[#EAEAE5] dark:hover:bg-[#151A17] transition-colors inline-flex items-center justify-center text-base"
                >
                  Forensic Console →
                </Link>
              </div>

              <div className="mt-12 pt-8 border-t border-[#D5D5CE] dark:border-[#29342F] flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-[#0052ff] dark:text-[#3b82f6]" />
                <span className="text-xs font-mono text-[#434656] dark:text-[#A0A7A3]">
                  Trusted by security teams
                </span>
              </div>
            </div>

            {/* Hero Right Column — Stitch Forensic Visualizer Asset & Floating Cards */}
            <div className="relative h-[480px] sm:h-[520px] lg:h-[560px] w-full">
              {/* Graphic Container */}
              <div className="absolute inset-0 bg-[#F2F2EE] dark:bg-[#0E1210] border border-[#D5D5CE] dark:border-[#29342F] rounded-lg shadow-sm flex items-center justify-center overflow-hidden p-6 transition-colors">
                <img
                  src="/screen_3_visualization.png"
                  alt="Mailiac Forensic Visualizer"
                  className="max-w-full max-h-full object-contain mix-blend-multiply dark:mix-blend-screen dark:invert opacity-95"
                />
              </div>

              {/* Floating Tech Card 1 (Top Left) */}
              <div className="absolute top-6 left-[-8px] sm:left-[-12px] forensic-card bg-[#F2F2EE] dark:bg-[#1B211E] border border-[#D5D5CE] dark:border-[#29342F] p-4 shadow-md rounded bracket-tl bracket-br max-w-[270px] z-10 transition-colors">
                <div className="text-[10px] font-mono font-bold text-[#737688] dark:text-[#A0A7A3] mb-1 uppercase tracking-wider">
                  MAILIAC · QUERY
                </div>
                <div className="text-xs font-mono text-[#1a1c1c] dark:text-[#F2F2EE] font-semibold">
                  &gt; Q3 FX exposure across desks?
                </div>
                <div className="text-xs font-mono text-[#434656] dark:text-[#A0A7A3] mt-1">
                  £42M over 3 desks · 78% hedged.
                </div>
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#D5D5CE] dark:border-[#29342F]">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#0052ff] dark:bg-[#3b82f6]"></div>
                  <span className="text-[10px] font-mono text-[#0052ff] dark:text-[#3b82f6] font-bold">6 sources · sealed</span>
                </div>
              </div>

              {/* Floating Tech Card 2 (Bottom Right) */}
              <div className="absolute bottom-6 right-[-8px] sm:right-[-12px] forensic-card bg-[#F2F2EE] dark:bg-[#1B211E] border border-[#D5D5CE] dark:border-[#29342F] p-4 shadow-md rounded bracket-tr bracket-bl max-w-[270px] z-10 transition-colors">
                <div className="text-[10px] font-mono font-bold text-[#737688] dark:text-[#A0A7A3] mb-1 uppercase tracking-wider">
                  AUTH · AUDIT
                </div>
                <div className="text-xs font-mono text-[#1a1c1c] dark:text-[#F2F2EE] flex justify-between gap-4">
                  <span>04:14:07</span> <span className="text-[#0052ff] dark:text-[#3b82f6] font-bold">PERMIT</span> <span>wf-mistral-3 · read</span>
                </div>
                <div className="text-xs font-mono text-[#1a1c1c] dark:text-[#F2F2EE] flex justify-between gap-4 mt-1">
                  <span>04:14:12</span> <span className="text-[#ba1a1a] dark:text-[#ef4444] font-bold">DENY</span> <span>egress · recorded</span>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* 4-Pillar Risk Engine Section */}
        <section id="risk-engine">
          <RiskPillarGrid />
        </section>

        {/* Live EML Forensic Ingestion Section */}
        <section id="analysis-console" className="py-20 px-6 md:px-16 max-w-[1440px] mx-auto">
          <div className="mb-10 text-center max-w-xl mx-auto">
            <div className="text-xs font-mono font-bold text-[#0052ff] dark:text-[#3b82f6] uppercase tracking-widest mb-2">
              REAL-TIME ANALYSIS INGESTION
            </div>
            <h2 className="text-3xl font-bold text-[#1a1c1c] dark:text-[#F2F2EE]">
              Analyze `.eml` Samples
            </h2>
            <p className="text-sm text-[#434656] dark:text-[#A0A7A3] mt-2">
              Submit raw email files to trigger the multi-stage forensic engine and open the dedicated analysis console.
            </p>
          </div>

          <div className="max-w-xl mx-auto">
            <UploadZone onJobCreated={handleJobCreated} />
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
            <p className="text-xs font-mono text-[#737688] dark:text-[#A0A7A3]">
              © 2026 Mailiac Forensics. All rights reserved.<br />
              Forensic Grade Email Security Pipeline.
            </p>
          </div>

        </div>
      </footer>

    </div>
  );
}
