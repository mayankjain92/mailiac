'use client';

import React from 'react';
import { Shield, Sparkles, Target } from 'lucide-react';

/**
 * ForensicHeroVisualizer
 *
 * Technical forensic intelligence hero visualizer:
 * - Prominent, larger central forensic email artifact (~1.6x visual scale) with fine stippled halftone shading.
 * - Slow, subtle vertical floating animation applied ONLY to the central mailbox/envelope (6s cycle, ~8px travel).
 * - Four forensic diagnostic cards physically anchored (completely stationary, no floating animation).
 * - Restrained forensic connector network with ortholinear lines and double-ring nodes.
 * - Full Light Mode (#F2F2EE) and Dark Mode (#0E1210) theme fidelity.
 */
export default function ForensicHeroVisualizer(): React.JSX.Element {
  return (
    <div className="relative w-full max-w-[700px] lg:max-w-[740px] aspect-[760/540] min-h-[460px] sm:min-h-[500px] lg:min-h-[540px] flex items-center justify-center select-none overflow-visible">
      
      {/* ============================================================ */}
      {/* 1. VECTOR FORENSIC DIAGRAM: CONNECTORS, NODES & FLOATING ENVELOPE */}
      {/* ============================================================ */}
      <svg
        viewBox="0 0 760 540"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full absolute inset-0 object-contain overflow-visible pointer-events-none"
      >
        <defs>
          {/* Fine Stipple Halftone Pattern (Light Mode) */}
          <pattern
            id="halftone-light"
            patternUnits="userSpaceOnUse"
            width="4.5"
            height="4.5"
          >
            <circle cx="2.25" cy="2.25" r="0.85" fill="#1a1c1c" fillOpacity="0.32" />
          </pattern>

          {/* Dense Stipple Halftone Pattern (Light Mode) */}
          <pattern
            id="halftone-dense-light"
            patternUnits="userSpaceOnUse"
            width="3.5"
            height="3.5"
          >
            <circle cx="1.75" cy="1.75" r="0.95" fill="#1a1c1c" fillOpacity="0.48" />
          </pattern>

          {/* Fine Stipple Halftone Pattern (Dark Mode) */}
          <pattern
            id="halftone-dark"
            patternUnits="userSpaceOnUse"
            width="4.5"
            height="4.5"
          >
            <circle cx="2.25" cy="2.25" r="0.85" fill="#F2F2EE" fillOpacity="0.35" />
          </pattern>

          {/* Dense Stipple Halftone Pattern (Dark Mode) */}
          <pattern
            id="halftone-dense-dark"
            patternUnits="userSpaceOnUse"
            width="3.5"
            height="3.5"
          >
            <circle cx="1.75" cy="1.75" r="0.95" fill="#F2F2EE" fillOpacity="0.52" />
          </pattern>

          {/* Gradient Shading for Top & Side Flaps */}
          <linearGradient id="flap-shade-left" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1a1c1c" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#1a1c1c" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="flap-shade-right" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1a1c1c" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#1a1c1c" stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="flap-shade-top" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#1a1c1c" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#1a1c1c" stopOpacity="0.1" />
          </linearGradient>

          {/* Dark Mode Gradients */}
          <linearGradient id="flap-shade-left-dark" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F2F2EE" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#F2F2EE" stopOpacity="0.03" />
          </linearGradient>
          <linearGradient id="flap-shade-right-dark" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#F2F2EE" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#F2F2EE" stopOpacity="0.04" />
          </linearGradient>

          {/* Envelope Ambient Drop Shadow Filter */}
          <filter id="forensic-shadow-filter" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="14" />
          </filter>
        </defs>

        {/* ============================================================ */}
        {/* A. BACKGROUND RADAR & CONCENTRIC GEOMETRY (STATIONARY) */}
        {/* ============================================================ */}
        <g className="stroke-[#434656]/25 dark:stroke-[#A0A7A3]/25" strokeWidth="0.75">
          {/* Outer Radar Circle */}
          <circle
            cx="380"
            cy="270"
            r="215"
            fill="none"
            strokeDasharray="3 4"
          />
          {/* Inner Radar Circle */}
          <circle
            cx="380"
            cy="270"
            r="145"
            fill="none"
            strokeDasharray="2 3"
            strokeOpacity="0.6"
          />
          {/* Micro Crosshairs & Alignment Coordinate Markers */}
          <g strokeWidth="0.75" className="stroke-[#434656]/40 dark:stroke-[#A0A7A3]/40">
            {/* Top crosshair */}
            <line x1="380" y1="52" x2="380" y2="60" />
            <line x1="376" y1="56" x2="384" y2="56" />

            {/* Left crosshair */}
            <line x1="160" y1="270" x2="168" y2="270" />
            <line x1="164" y1="266" x2="164" y2="274" />

            {/* Right crosshair */}
            <line x1="592" y1="270" x2="600" y2="270" />
            <line x1="596" y1="266" x2="596" y2="274" />

            {/* Bottom crosshair */}
            <line x1="530" y1="410" x2="538" y2="410" />
            <line x1="534" y1="406" x2="534" y2="414" />

            {/* Center subtle coordinate dots */}
            <circle cx="290" cy="140" r="1.5" className="fill-[#434656]/40 dark:fill-[#A0A7A3]/40" />
            <circle cx="470" cy="135" r="1.5" className="fill-[#434656]/40 dark:fill-[#A0A7A3]/40" />
            <circle cx="565" cy="190" r="1.5" className="fill-[#434656]/40 dark:fill-[#A0A7A3]/40" />
            <circle cx="195" cy="350" r="1.5" className="fill-[#434656]/40 dark:fill-[#A0A7A3]/40" />
          </g>
        </g>

        {/* ============================================================ */}
        {/* B. FORENSIC CONNECTOR LINES & TARGET NODES (STATIONARY) */}
        {/* ============================================================ */}
        <g className="stroke-[#1a1c1c]/40 dark:stroke-[#F2F2EE]/40" strokeWidth="0.85">
          {/* 1. Top-Left Card (EMAIL · TRACE) -> Envelope Top Area */}
          <path
            d="M 245 105 L 340 105 L 340 155"
            fill="none"
          />

          {/* 2. Top-Right Card (AUTH · VERIFY) -> Envelope Right Area */}
          <path
            d="M 530 115 L 485 115 L 485 155"
            fill="none"
          />
          <path
            d="M 570 270 L 610 270"
            fill="none"
          />

          {/* 3. Bottom-Left Card (AI · ANALYSIS) -> Envelope Left Side */}
          <path
            d="M 235 415 L 235 270 L 190 270"
            fill="none"
          />

          {/* 4. Bottom-Right Card (FORENSIC CORE) -> Envelope Bottom Side */}
          <path
            d="M 530 420 L 460 420 L 460 385"
            fill="none"
          />
        </g>

        {/* Precision Nodes */}
        {/* Top Connector Node */}
        <circle
          cx="340"
          cy="105"
          r="2"
          className="fill-[#1a1c1c] dark:fill-[#F2F2EE]"
        />

        {/* Right Connector Node (Double Ring) */}
        <g className="transition-colors">
          <circle
            cx="610"
            cy="270"
            r="4.5"
            className="fill-[#FAFAF8] dark:fill-[#151A17] stroke-[#1a1c1c] dark:stroke-[#F2F2EE]"
            strokeWidth="1.25"
          />
          <circle
            cx="610"
            cy="270"
            r="1.75"
            className="fill-[#1a1c1c] dark:fill-[#F2F2EE]"
          />
        </g>

        {/* Left Connector Node (Double Ring) */}
        <g className="transition-colors">
          <circle
            cx="235"
            cy="270"
            r="4.5"
            className="fill-[#FAFAF8] dark:fill-[#151A17] stroke-[#1a1c1c] dark:stroke-[#F2F2EE]"
            strokeWidth="1.25"
          />
          <circle
            cx="235"
            cy="270"
            r="1.75"
            className="fill-[#1a1c1c] dark:fill-[#F2F2EE]"
          />
        </g>

        {/* Bottom Connector Node (Double Ring) */}
        <g className="transition-colors">
          <circle
            cx="460"
            cy="420"
            r="4"
            className="fill-[#FAFAF8] dark:fill-[#151A17] stroke-[#1a1c1c] dark:stroke-[#F2F2EE]"
            strokeWidth="1.2"
          />
          <circle
            cx="460"
            cy="420"
            r="1.5"
            className="fill-[#1a1c1c] dark:fill-[#F2F2EE]"
          />
        </g>

        {/* ============================================================ */}
        {/* C. MAIN FORENSIC ENVELOPE (LARGE SCALE & SLOWLY FLOATING) */}
        {/* ============================================================ */}
        <g className="animate-envelope-float transition-colors duration-200">
          
          {/* Subtle Dynamic Ambient Floor Shadow tied to Envelope */}
          <ellipse
            cx="380"
            cy="410"
            rx="185"
            ry="14"
            className="fill-black/10 dark:fill-black/35"
            filter="url(#forensic-shadow-filter)"
          />

          {/* Envelope Background Body (Off-White / Light Gray) */}
          <rect
            x="190"
            y="155"
            width="380"
            height="230"
            className="fill-[#FAFAF8] dark:fill-[#181E1B]"
          />

          {/* Left Facet Triangle (with Stippled Halftone Shading) */}
          <polygon
            points="190,155 380,270 190,385"
            className="fill-[url(#halftone-light)] dark:fill-[url(#halftone-dark)]"
          />
          <polygon
            points="190,155 380,270 190,385"
            className="fill-[url(#flap-shade-left)] dark:fill-[url(#flap-shade-left-dark)]"
          />

          {/* Right Facet Triangle (with Dense Stippled Halftone Shading) */}
          <polygon
            points="570,155 380,270 570,385"
            className="fill-[url(#halftone-dense-light)] dark:fill-[url(#halftone-dense-dark)]"
          />
          <polygon
            points="570,155 380,270 570,385"
            className="fill-[url(#flap-shade-right)] dark:fill-[url(#flap-shade-right-dark)]"
          />

          {/* Bottom Flap Facet */}
          <polygon
            points="190,385 380,265 570,385"
            className="fill-[#F5F5F0] dark:fill-[#141916]"
          />
          <polygon
            points="190,385 380,265 570,385"
            className="fill-[url(#halftone-light)] dark:fill-[url(#halftone-dark)]"
            opacity="0.6"
          />

          {/* Top Triangular Flap (Folded Down) */}
          <polygon
            points="190,155 380,295 570,155"
            className="fill-[#FFFFFF] dark:fill-[#1E2521]"
          />
          <polygon
            points="190,155 380,295 570,155"
            className="fill-[url(#halftone-light)] dark:fill-[url(#halftone-dark)]"
            opacity="0.5"
          />
          <polygon
            points="190,155 380,295 570,155"
            className="fill-[url(#flap-shade-top)]"
          />

          {/* Clean Architectural Crease & Outline Strokes */}
          {/* Top Flap V-Line */}
          <polyline
            points="190,155 380,295 570,155"
            className="stroke-[#1a1c1c] dark:stroke-[#F2F2EE]"
            strokeWidth="1.35"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Internal Fold Lines to Corners */}
          <line
            x1="190"
            y1="385"
            x2="310"
            y2="242"
            className="stroke-[#1a1c1c] dark:stroke-[#F2F2EE]"
            strokeWidth="1"
            strokeLinecap="round"
          />
          <line
            x1="570"
            y1="385"
            x2="450"
            y2="242"
            className="stroke-[#1a1c1c] dark:stroke-[#F2F2EE]"
            strokeWidth="1"
            strokeLinecap="round"
          />

          {/* Envelope Outer Border */}
          <rect
            x="190"
            y="155"
            width="380"
            height="230"
            fill="none"
            className="stroke-[#1a1c1c] dark:stroke-[#F2F2EE]"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </g>
      </svg>

      {/* ============================================================ */}
      {/* 2. FOUR FORENSIC DIAGNOSTIC CARDS (STATIONARY / NO FLOATING) */}
      {/* ============================================================ */}

      {/* ------------------------------------------------------------ */}
      {/* CARD 1 — TOP LEFT: EMAIL · TRACE */}
      {/* ------------------------------------------------------------ */}
      <div
        className="absolute z-20 w-[205px] sm:w-[220px] p-3 sm:p-3.5 bg-white dark:bg-[#151A17] border border-[#D5D5CE] dark:border-[#29342F] rounded-[3px] shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.3)] font-mono transition-colors duration-200"
        style={{
          top: '6%',
          left: '3%',
        }}
      >
        {/* Blue Corner L-Brackets */}
        <div className="absolute -top-[1px] -left-[1px] w-2 h-2 border-t-[1.5px] border-l-[1.5px] border-[#0052ff] dark:border-[#3b82f6]" />
        <div className="absolute -top-[1px] -right-[1px] w-2 h-2 border-t-[1.5px] border-r-[1.5px] border-[#0052ff] dark:border-[#3b82f6]" />
        <div className="absolute -bottom-[1px] -left-[1px] w-2 h-2 border-b-[1.5px] border-l-[1.5px] border-[#0052ff] dark:border-[#3b82f6]" />
        <div className="absolute -bottom-[1px] -right-[1px] w-2 h-2 border-b-[1.5px] border-r-[1.5px] border-[#0052ff] dark:border-[#3b82f6]" />

        {/* Card Header */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-semibold tracking-wider text-[#555968] dark:text-[#A0A7A3] uppercase">
            EMAIL · TRACE
          </span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#0052ff] dark:bg-[#3b82f6]" />
        </div>

        {/* Card Body */}
        <div className="text-[11px] font-medium text-[#1a1c1c] dark:text-[#F2F2EE] leading-tight mb-2">
          &gt; sender path captured
        </div>
        <div className="text-[10px] text-[#555968] dark:text-[#A0A7A3] flex items-center gap-1.5 font-medium">
          <span>origin</span>
          <span className="text-[#0052ff] dark:text-[#3b82f6]">→</span>
          <span className="text-[#0052ff] dark:text-[#3b82f6] font-semibold">relay</span>
          <span className="text-[#0052ff] dark:text-[#3b82f6]">→</span>
          <span>destination</span>
        </div>
      </div>

      {/* ------------------------------------------------------------ */}
      {/* CARD 2 — TOP RIGHT: AUTH · VERIFY */}
      {/* ------------------------------------------------------------ */}
      <div
        className="absolute z-20 w-[165px] sm:w-[180px] p-3 sm:p-3.5 bg-white dark:bg-[#151A17] border border-[#D5D5CE] dark:border-[#29342F] rounded-[3px] shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.3)] font-mono transition-colors duration-200"
        style={{
          top: '7%',
          right: '2%',
        }}
      >
        {/* Blue Corner L-Brackets */}
        <div className="absolute -top-[1px] -left-[1px] w-2 h-2 border-t-[1.5px] border-l-[1.5px] border-[#0052ff] dark:border-[#3b82f6]" />
        <div className="absolute -top-[1px] -right-[1px] w-2 h-2 border-t-[1.5px] border-r-[1.5px] border-[#0052ff] dark:border-[#3b82f6]" />
        <div className="absolute -bottom-[1px] -left-[1px] w-2 h-2 border-b-[1.5px] border-l-[1.5px] border-[#0052ff] dark:border-[#3b82f6]" />
        <div className="absolute -bottom-[1px] -right-[1px] w-2 h-2 border-b-[1.5px] border-r-[1.5px] border-[#0052ff] dark:border-[#3b82f6]" />

        {/* Card Header */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="text-[10px] font-semibold tracking-wider text-[#555968] dark:text-[#A0A7A3] uppercase">
            AUTH · VERIFY
          </span>
          <Shield className="w-3.5 h-3.5 text-[#555968] dark:text-[#A0A7A3]" />
        </div>

        {/* Status Rows */}
        <div className="space-y-1.5 text-[10px]">
          <div className="flex justify-between items-center text-[#1a1c1c] dark:text-[#F2F2EE]">
            <span className="text-[#555968] dark:text-[#A0A7A3]">SPF</span>
            <span className="font-bold text-[#16a34a] dark:text-[#22c55e]">PASS</span>
          </div>
          <div className="flex justify-between items-center text-[#1a1c1c] dark:text-[#F2F2EE]">
            <span className="text-[#555968] dark:text-[#A0A7A3]">DKIM</span>
            <span className="font-bold text-[#16a34a] dark:text-[#22c55e]">PASS</span>
          </div>
          <div className="flex justify-between items-center text-[#1a1c1c] dark:text-[#F2F2EE]">
            <span className="text-[#555968] dark:text-[#A0A7A3]">DMARC</span>
            <span className="font-bold text-[#d97706] dark:text-[#f59e0b]">CHECK</span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ */}
      {/* CARD 3 — BOTTOM LEFT: AI · ANALYSIS */}
      {/* ------------------------------------------------------------ */}
      <div
        className="absolute z-20 w-[215px] sm:w-[230px] p-3 sm:p-3.5 bg-white dark:bg-[#151A17] border border-[#D5D5CE] dark:border-[#29342F] rounded-[3px] shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.3)] font-mono transition-colors duration-200"
        style={{
          bottom: '6%',
          left: '3%',
        }}
      >
        {/* Blue Corner L-Brackets */}
        <div className="absolute -top-[1px] -left-[1px] w-2 h-2 border-t-[1.5px] border-l-[1.5px] border-[#0052ff] dark:border-[#3b82f6]" />
        <div className="absolute -top-[1px] -right-[1px] w-2 h-2 border-t-[1.5px] border-r-[1.5px] border-[#0052ff] dark:border-[#3b82f6]" />
        <div className="absolute -bottom-[1px] -left-[1px] w-2 h-2 border-b-[1.5px] border-l-[1.5px] border-[#0052ff] dark:border-[#3b82f6]" />
        <div className="absolute -bottom-[1px] -right-[1px] w-2 h-2 border-b-[1.5px] border-r-[1.5px] border-[#0052ff] dark:border-[#3b82f6]" />

        {/* Card Header */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-semibold tracking-wider text-[#555968] dark:text-[#A0A7A3] uppercase">
            AI · ANALYSIS
          </span>
          <Sparkles className="w-3.5 h-3.5 text-[#555968] dark:text-[#A0A7A3]" />
        </div>

        {/* Card Content */}
        <div className="text-[10px] text-[#1a1c1c] dark:text-[#F2F2EE] space-y-1">
          <div className="font-medium text-[11px]">
            &gt; intent detected
          </div>
          <div className="text-[#555968] dark:text-[#A0A7A3] pl-2">
            risk signals evaluated
          </div>
          <div className="text-[#555968] dark:text-[#A0A7A3] pl-2 flex items-center justify-between pt-0.5">
            <span>forensic confidence</span>
            <span className="text-[#0052ff] dark:text-[#3b82f6] font-bold">98.4%</span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ */}
      {/* CARD 4 — BOTTOM RIGHT: FORENSIC CORE */}
      {/* ------------------------------------------------------------ */}
      <div
        className="absolute z-20 w-[195px] sm:w-[210px] p-3 sm:p-3.5 bg-white dark:bg-[#151A17] border border-[#D5D5CE] dark:border-[#29342F] rounded-[3px] shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.3)] font-mono transition-colors duration-200"
        style={{
          bottom: '6%',
          right: '3%',
        }}
      >
        {/* Blue Corner L-Brackets */}
        <div className="absolute -top-[1px] -left-[1px] w-2 h-2 border-t-[1.5px] border-l-[1.5px] border-[#0052ff] dark:border-[#3b82f6]" />
        <div className="absolute -top-[1px] -right-[1px] w-2 h-2 border-t-[1.5px] border-r-[1.5px] border-[#0052ff] dark:border-[#3b82f6]" />
        <div className="absolute -bottom-[1px] -left-[1px] w-2 h-2 border-b-[1.5px] border-l-[1.5px] border-[#0052ff] dark:border-[#3b82f6]" />
        <div className="absolute -bottom-[1px] -right-[1px] w-2 h-2 border-b-[1.5px] border-r-[1.5px] border-[#0052ff] dark:border-[#3b82f6]" />

        {/* Card Header */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-semibold tracking-wider text-[#555968] dark:text-[#A0A7A3] uppercase">
            FORENSIC CORE
          </span>
          <Target className="w-3.5 h-3.5 text-[#555968] dark:text-[#A0A7A3]" />
        </div>

        {/* Card Content */}
        <div className="text-[10px] text-[#555968] dark:text-[#A0A7A3] leading-relaxed">
          real-time signal correlation<br />
          and threat intelligence
        </div>
      </div>

    </div>
  );
}
