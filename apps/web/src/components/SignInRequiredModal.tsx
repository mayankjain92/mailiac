'use client';

import React, { useEffect, useState } from 'react';
import { Shield, X, Loader2 } from 'lucide-react';

interface SignInRequiredModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignIn: () => Promise<void> | void;
  message?: string | null;
}

export default function SignInRequiredModal({
  isOpen,
  onClose,
  onSignIn,
  message,
}: SignInRequiredModalProps): React.JSX.Element | null {
  const [isRedirecting, setIsRedirecting] = useState<boolean>(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return (): void => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset redirecting state when modal closes/opens
  useEffect(() => {
    if (!isOpen) {
      setIsRedirecting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSignIn = async (): Promise<void> => {
    try {
      setIsRedirecting(true);
      await onSignIn();
    } catch {
      setIsRedirecting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="signin-modal-title"
    >
      <div
        className="relative w-full max-w-md flex flex-col bg-[#F2F2EE] dark:bg-[#1B211E] border border-[#D5D5CE] dark:border-[#29342F] rounded-lg shadow-2xl overflow-hidden bracket-tl bracket-br"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Accent Bar */}
        <div className="h-1 bg-[#0052ff] dark:bg-[#3b82f6] w-full" />

        {/* Header & Close Button */}
        <div className="flex items-start justify-between px-6 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 flex items-center justify-center text-[#0052ff] dark:text-[#3b82f6] shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-[#0052ff] dark:text-[#3b82f6]">
                Authentication Required
              </div>
              <h2
                id="signin-modal-title"
                className="text-lg font-bold text-[#1a1c1c] dark:text-[#fdfcf8] tracking-tight"
              >
                Sign in required
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#fdfcf8] p-1 rounded transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-[#434656] dark:text-[#C5CDC8] leading-relaxed">
            {message || 'You need to sign in to use this feature.'}
          </p>
          <p className="text-xs text-[#737688] dark:text-[#7D8681] leading-normal">
            Sign in with Google to access deep email forensics, connect your Gmail mailbox, and review forensic threat reports.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 px-6 py-4 border-t border-[#D5D5CE] dark:border-[#29342F] bg-[#EAEAE5]/60 dark:bg-[#151A17]/60">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-[#434656] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#fdfcf8] border border-[#D5D5CE] dark:border-[#29342F] rounded bg-white dark:bg-[#1B211E] hover:bg-[#EAEAE5] dark:hover:bg-[#222B27] transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSignIn}
            disabled={isRedirecting}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0052ff] hover:bg-[#004ced] dark:bg-[#3b82f6] dark:hover:bg-[#2563eb] rounded shadow-sm transition-colors disabled:opacity-75"
          >
            {isRedirecting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Redirecting...</span>
              </>
            ) : (
              <>
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
                <span>Sign in with Google</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
