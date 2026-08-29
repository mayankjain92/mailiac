'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

interface StitchLandingHeaderProps {
  onAnalyzeClick?: () => void;
}

export default function StitchLandingHeader({ onAnalyzeClick }: StitchLandingHeaderProps) {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDarkMode(true);
    }
  };

  const handleAnalyzeClick = () => {
    if (pathname === '/') {
      if (onAnalyzeClick) {
        onAnalyzeClick();
      } else {
        const el = document.getElementById('analysis-console');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }
    } else {
      router.push('/forensic-analysis');
    }
  };

  const isForensicPage = pathname === '/forensic-analysis';

  return (
    <nav className="bg-[#F2F2EE] dark:bg-[#0E1210] w-full px-6 md:px-16 py-4 max-w-[1440px] mx-auto border-b border-[#e2e2e2] dark:border-[#29342F] sticky top-0 z-50 backdrop-blur-md bg-opacity-95 dark:bg-opacity-95 transition-colors duration-200">
      <div className="flex justify-between items-center">
        {/* Logo & Brand */}
        <Link className="flex items-center gap-2 group cursor-pointer" href="/">
          <div className="h-8 w-8 rounded bg-[#0052ff] dark:bg-[#3b82f6] flex items-center justify-center text-white font-bold text-lg shadow-sm">
            M
          </div>
          <span className="text-2xl font-bold text-[#1a1c1c] dark:text-[#F2F2EE] tracking-tighter">
            Mailiac
          </span>
        </Link>

        {/* Navigation Links */}
        <div className="hidden md:flex gap-8 items-center text-sm font-mono">
          <Link
            className={`transition-colors duration-200 uppercase text-xs tracking-wider ${
              isForensicPage
                ? 'text-[#0052ff] dark:text-[#3b82f6] font-bold border-b-2 border-[#0052ff] dark:border-[#3b82f6] pb-1'
                : 'text-[#434656] dark:text-[#A0A7A3] hover:text-[#0052ff] dark:hover:text-[#3b82f6]'
            }`}
            href="/forensic-analysis"
          >
            Forensic Analysis
          </Link>
        </div>

        {/* Action CTA Buttons */}
        <div className="flex items-center gap-4 text-sm">
          <button
            onClick={toggleDarkMode}
            className="flex items-center justify-center h-8 w-8 rounded-full border border-[#e2e2e2] dark:border-[#29342F] bg-white dark:bg-[#151A17] hover:bg-[#EAEAE5] dark:hover:bg-[#222B27] transition-colors"
            aria-label="Theme toggle"
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode (#0E1210)'}
          >
            <span className="material-symbols-outlined text-sm text-[#434656] dark:text-[#F2F2EE]">
              {isDarkMode ? 'light_mode' : 'dark_mode'}
            </span>
          </button>
          <button
            onClick={handleAnalyzeClick}
            className="bg-[#0052ff] dark:bg-[#3b82f6] text-white px-4 py-2 rounded font-medium hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors shadow-sm font-sans"
          >
            Analyze an email
          </button>
        </div>
      </div>
    </nav>
  );
}
