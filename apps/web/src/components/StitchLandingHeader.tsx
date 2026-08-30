'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import ForensicIngestionModal from './ForensicIngestionModal';

import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

interface StitchLandingHeaderProps {
  onAnalyzeClick?: () => void;
  onJobCreated?: (jobId: string, fileName: string) => void;
}

export default function StitchLandingHeader({
  onAnalyzeClick,
  onJobCreated,
}: StitchLandingHeaderProps): React.JSX.Element {
  const { theme, toggleTheme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [isIngestionModalOpen, setIsIngestionModalOpen] = useState<boolean>(false);
  const [isGmailConnected, setIsGmailConnected] = useState<boolean>(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Check Gmail connection
    fetch('/api/gmail/status')
      .then((res) => (res.ok ? res.json() : { connected: false }))
      .then((data: { connected: boolean }) => setIsGmailConnected(Boolean(data.connected)))
      .catch(() => setIsGmailConnected(false));
  }, []);

  const handleAnalyzeClick = (): void => {
    if (onAnalyzeClick) {
      onAnalyzeClick();
    } else {
      setIsIngestionModalOpen(true);
    }
  };

  const isForensicPage = pathname === '/forensic-analysis';
  const isMailboxPage = pathname === '/mailbox';

  return (
    <>
      <nav className="bg-[#F2F2EE] dark:bg-[#0E1210] w-full px-6 md:px-16 py-4 max-w-[1440px] mx-auto border-b border-[#D5D5CE] dark:border-[#29342F] sticky top-0 z-40 backdrop-blur-md bg-opacity-95 dark:bg-opacity-95 transition-colors duration-200">
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
            <button
              type="button"
              onClick={handleAnalyzeClick}
              className={`transition-colors duration-200 uppercase text-xs tracking-wider cursor-pointer ${
                isForensicPage
                  ? 'text-[#0052ff] dark:text-[#3b82f6] font-bold border-b-2 border-[#0052ff] dark:border-[#3b82f6] pb-1'
                  : 'text-[#434656] dark:text-[#A0A7A3] hover:text-[#0052ff] dark:hover:text-[#3b82f6]'
              }`}
            >
              Forensic Analysis
            </button>

            <Link
              className={`transition-colors duration-200 uppercase text-xs tracking-wider flex items-center gap-1.5 ${
                isMailboxPage
                  ? 'text-[#0052ff] dark:text-[#3b82f6] font-bold border-b-2 border-[#0052ff] dark:border-[#3b82f6] pb-1'
                  : 'text-[#434656] dark:text-[#A0A7A3] hover:text-[#0052ff] dark:hover:text-[#3b82f6]'
              }`}
              href="/mailbox"
            >
              <span>Gmail Mailbox</span>
              {isGmailConnected && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse"></span>
              )}
            </Link>
          </div>

          {/* Action CTA Buttons */}
          <div className="flex items-center gap-4 text-sm">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center justify-center h-8 w-8 rounded-full border border-[#D5D5CE] dark:border-[#29342F] bg-white dark:bg-[#151A17] hover:bg-[#EAEAE5] dark:hover:bg-[#222B27] text-[#434656] dark:text-[#F2F2EE] transition-colors"
              aria-label="Theme toggle"
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDarkMode ? (
                <Sun className="w-4 h-4 text-[#fbbf24]" />
              ) : (
                <Moon className="w-4 h-4 text-[#434656]" />
              )}
            </button>
            <button
              type="button"
              onClick={handleAnalyzeClick}
              className="bg-[#0052ff] dark:bg-[#3b82f6] text-white px-4 py-2 rounded font-medium hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors shadow-sm font-sans"
            >
              Analyze an email
            </button>
          </div>
        </div>
      </nav>

      {/* Forensic Ingestion Modal */}
      <ForensicIngestionModal
        isOpen={isIngestionModalOpen}
        onClose={() => setIsIngestionModalOpen(false)}
        onJobCreated={(jobId, fileName) => {
          if (onJobCreated) {
            onJobCreated(jobId, fileName);
          } else {
            router.push(`/forensic-analysis?jobId=${jobId}&fileName=${encodeURIComponent(fileName)}`);
          }
        }}
      />
    </>
  );
}
