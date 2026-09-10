'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import ForensicIngestionModal from './ForensicIngestionModal';

import { Sun, Moon, Menu, X } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { sessionFetch } from '@/lib/session';
import { useAuth } from '@/lib/auth';

interface AppHeaderProps {
  onAnalyzeClick?: () => void;
  onJobCreated?: (jobId: string, fileName: string) => void;
}

export function AppHeader({
  onAnalyzeClick,
  onJobCreated,
}: AppHeaderProps): React.JSX.Element {
  const { theme, toggleTheme } = useTheme();
  const { user, isLoading: isAuthLoading, login, logout } = useAuth();
  const isDarkMode = theme === 'dark';
  const [isIngestionModalOpen, setIsIngestionModalOpen] = useState<boolean>(false);
  const [isGmailConnected, setIsGmailConnected] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      setIsGmailConnected(false);
      return;
    }
    // Check Gmail connection strictly when authenticated
    sessionFetch('/api/gmail/status')
      .then((res) => (res.ok ? res.json() : { connected: false }))
      .then((data: { connected: boolean }) => setIsGmailConnected(Boolean(data.connected)))
      .catch(() => setIsGmailConnected(false));
  }, [user]);

  const handleAnalyzeClick = (): void => {
    if (onAnalyzeClick) {
      onAnalyzeClick();
    } else {
      setIsIngestionModalOpen(true);
    }
  };

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
          <div className="hidden md:flex gap-8 items-center text-sm font-medium">
            <button
              type="button"
              onClick={handleAnalyzeClick}
              className="transition-colors duration-200 uppercase text-xs tracking-wider cursor-pointer text-[#434656] dark:text-[#A0A7A3] hover:text-[#0052ff] dark:hover:text-[#3b82f6]"
            >
              Forensic Analysis
            </button>

            <Link
              href="/mailbox"
              className={`transition-colors duration-200 uppercase text-xs tracking-wider flex items-center gap-1.5 cursor-pointer ${
                isMailboxPage
                  ? 'text-[#0052ff] dark:text-[#3b82f6] font-bold border-b-2 border-[#0052ff] dark:border-[#3b82f6] pb-1'
                  : 'text-[#434656] dark:text-[#A0A7A3] hover:text-[#0052ff] dark:hover:text-[#3b82f6]'
              }`}
            >
              <span>Gmail Mailbox</span>
              {isGmailConnected && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse"></span>
              )}
            </Link>

            <Link
              href="/history"
              className={`transition-colors duration-200 uppercase text-xs tracking-wider cursor-pointer ${
                pathname === '/history'
                  ? 'text-[#0052ff] dark:text-[#3b82f6] font-bold border-b-2 border-[#0052ff] dark:border-[#3b82f6] pb-1'
                  : 'text-[#434656] dark:text-[#A0A7A3] hover:text-[#0052ff] dark:hover:text-[#3b82f6]'
              }`}
            >
              Audit History
            </Link>
          </div>

          {/* Action CTA Buttons */}
          <div className="flex items-center gap-3 text-sm">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center justify-center h-8 w-8 rounded-full border border-[#D5D5CE] dark:border-[#29342F] bg-white dark:bg-[#151A17] hover:bg-[#EAEAE5] dark:hover:bg-[#222B27] text-[#434656] dark:text-[#F2F2EE] transition-all active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#0052ff] focus-visible:outline-none"
              aria-label="Theme toggle"
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDarkMode ? (
                <Sun className="w-4 h-4 text-[#fbbf24]" />
              ) : (
                <Moon className="w-4 h-4 text-[#434656]" />
              )}
            </button>

            {!isAuthLoading && (
              <>
                {user ? (
                  <div className="flex items-center gap-2 pl-2 border-l border-[#D5D5CE] dark:border-[#29342F]">
                    {user.picture ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={user.picture}
                        alt={user.name || user.email}
                        className="w-7 h-7 rounded-full border border-[#D5D5CE] dark:border-[#29342F] object-cover"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-[#0052ff] dark:bg-[#3b82f6] text-white flex items-center justify-center text-xs font-bold">
                        {(user.name || user.email || 'U')[0].toUpperCase()}
                      </div>
                    )}
                    <span
                      className="hidden xl:inline text-xs text-[#434656] dark:text-[#A0A7A3] max-w-[120px] truncate"
                      title={user.email}
                    >
                      {user.name || user.email}
                    </span>
                    <button
                      type="button"
                      onClick={() => logout()}
                      className="text-xs text-[#434656] dark:text-[#A0A7A3] hover:text-red-500 dark:hover:text-red-400 transition-colors ml-1 font-medium active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none"
                      title="Sign Out"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={login}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#D5D5CE] dark:border-[#29342F] bg-white dark:bg-[#151A17] hover:bg-[#EAEAE5] dark:hover:bg-[#222B27] text-xs font-medium text-[#1a1c1c] dark:text-[#F2F2EE] transition-all shadow-sm active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#0052ff] focus-visible:outline-none"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Sign In</span>
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={handleAnalyzeClick}
              className="hidden sm:inline-flex bg-[#0052ff] dark:bg-[#3b82f6] text-white px-4 py-2 rounded font-medium hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-all shadow-sm font-sans text-xs uppercase tracking-wider active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#0052ff] focus-visible:outline-none"
            >
              Analyze an email
            </button>

            {/* Mobile Navigation Toggle */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden flex items-center justify-center h-8 w-8 rounded-full border border-[#D5D5CE] dark:border-[#29342F] bg-white dark:bg-[#151A17] hover:bg-[#EAEAE5] dark:hover:bg-[#222B27] text-[#434656] dark:text-[#F2F2EE] transition-all active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#0052ff] focus-visible:outline-none"
              aria-label="Toggle navigation menu"
            >
              {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden pt-4 pb-2 border-t border-[#D5D5CE] dark:border-[#29342F] mt-3 space-y-3">
            <button
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                handleAnalyzeClick();
              }}
              className="w-full text-left py-1 text-xs font-semibold uppercase tracking-wider text-[#434656] dark:text-[#A0A7A3] hover:text-[#0052ff] dark:hover:text-[#3b82f6]"
            >
              Forensic Analysis
            </button>
            <Link
              href="/mailbox"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center justify-between py-1 text-xs font-semibold uppercase tracking-wider ${
                isMailboxPage
                  ? 'text-[#0052ff] dark:text-[#3b82f6] font-bold'
                  : 'text-[#434656] dark:text-[#A0A7A3] hover:text-[#0052ff] dark:hover:text-[#3b82f6]'
              }`}
            >
              <span>Gmail Mailbox</span>
              {isGmailConnected && <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse"></span>}
            </Link>
            <Link
              href="/history"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`block py-1 text-xs font-semibold uppercase tracking-wider ${
                pathname === '/history'
                  ? 'text-[#0052ff] dark:text-[#3b82f6] font-bold'
                  : 'text-[#434656] dark:text-[#A0A7A3] hover:text-[#0052ff] dark:hover:text-[#3b82f6]'
              }`}
            >
              Audit History
            </Link>
          </div>
        )}
      </nav>

      {/* Forensic Ingestion Modal */}
      <ForensicIngestionModal
        isOpen={isIngestionModalOpen}
        onClose={() => setIsIngestionModalOpen(false)}
        onJobCreated={(jobId, fileName) => {
          if (onJobCreated) {
            onJobCreated(jobId, fileName);
          } else {
            router.push(
              `/forensic-analysis?jobId=${encodeURIComponent(jobId)}&fileName=${encodeURIComponent(
                fileName || 'Uploaded EML Sample'
              )}`
            );
          }
        }}
      />
    </>
  );
}

export const StitchLandingHeader = AppHeader;
export default AppHeader;
