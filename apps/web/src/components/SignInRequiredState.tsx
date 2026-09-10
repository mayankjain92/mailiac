'use client';

import React from 'react';
import { Shield } from 'lucide-react';
import { useAuth } from '@/lib/auth';

interface SignInRequiredStateProps {
  title?: string;
  description?: string;
  actionText?: string;
  secondaryAction?: React.ReactNode;
}

export default function SignInRequiredState({
  title = 'Sign in required',
  description = 'You need to sign in to access this feature.',
  actionText = 'Sign in with Google',
  secondaryAction,
}: SignInRequiredStateProps): React.JSX.Element {
  const { login } = useAuth();

  return (
    <div className="py-20 px-6 text-center max-w-lg mx-auto space-y-5 animate-in fade-in duration-300">
      <div className="w-14 h-14 rounded-full bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 flex items-center justify-center text-[#0052ff] dark:text-[#3b82f6] mx-auto shadow-sm">
        <Shield className="w-7 h-7" />
      </div>

      <div className="space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#0052ff] dark:text-[#3b82f6]">
          Authentication Required
        </div>
        <h3 className="text-xl font-bold text-[#1a1c1c] dark:text-[#fdfcf8] tracking-tight">
          {title}
        </h3>
        <p className="text-xs text-[#434656] dark:text-[#A0A7A3] leading-relaxed max-w-md mx-auto">
          {description}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => login()}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded shadow-sm text-xs font-semibold text-white bg-[#0052ff] hover:bg-[#004ced] dark:bg-[#3b82f6] dark:hover:bg-[#2563eb] transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
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
          <span>{actionText}</span>
        </button>

        {secondaryAction}
      </div>
    </div>
  );
}
