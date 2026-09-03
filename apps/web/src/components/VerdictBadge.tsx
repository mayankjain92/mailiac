import React from 'react';

export type BackendVerdict = 'QUARANTINE' | 'FLAG' | 'SAFE';

export interface VerdictConfig {
  verdict: BackendVerdict;
  label: 'QUARANTINE' | 'SUSPICIOUS' | 'SAFE';
  colorText: string;
  colorBg: string;
  colorBorder: string;
  badgeHex: string;
}

/**
 * Single source of truth for verdict mapping across all surfaces:
 * - QUARANTINE -> "QUARANTINE", red
 * - FLAG -> "SUSPICIOUS", amber
 * - SAFE -> "SAFE", emerald
 */
export function getVerdictConfig(
  verdict?: string | null,
  score?: number | null
): VerdictConfig {
  const normalized = (verdict || '').toUpperCase();

  if (normalized === 'QUARANTINE' || (typeof score === 'number' && score >= 70)) {
    return {
      verdict: 'QUARANTINE',
      label: 'QUARANTINE',
      colorText: 'text-red-700 dark:text-[#ef4444]',
      colorBg: 'bg-red-50 dark:bg-[#ef4444]/15',
      colorBorder: 'border-red-200 dark:border-[#ef4444]/30',
      badgeHex: '#ef4444',
    };
  }

  if (
    normalized === 'FLAG' ||
    normalized === 'SUSPICIOUS' ||
    (typeof score === 'number' && score >= 30)
  ) {
    return {
      verdict: 'FLAG',
      label: 'SUSPICIOUS',
      colorText: 'text-amber-700 dark:text-amber-400',
      colorBg: 'bg-amber-50 dark:bg-amber-500/15',
      colorBorder: 'border-amber-200 dark:border-amber-500/30',
      badgeHex: '#f59e0b',
    };
  }

  return {
    verdict: 'SAFE',
    label: 'SAFE',
    colorText: 'text-emerald-700 dark:text-green-400',
    colorBg: 'bg-emerald-50 dark:bg-green-500/15',
    colorBorder: 'border-emerald-200 dark:border-green-500/30',
    badgeHex: '#10b981',
  };
}

export interface VerdictBadgeProps {
  verdict?: BackendVerdict | string | null;
  score?: number | null;
  showScore?: boolean;
  prefix?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function VerdictBadge({
  verdict,
  score,
  showScore = true,
  prefix,
  size = 'md',
  className = '',
}: VerdictBadgeProps): React.JSX.Element {
  const config = getVerdictConfig(verdict, score);

  const sizeClasses =
    size === 'sm'
      ? 'px-1.5 py-0.5 text-[9px]'
      : size === 'lg'
      ? 'px-3 py-1 text-xs'
      : 'px-2 py-0.5 text-[10px]';

  return (
    <span
      className={`inline-flex items-center font-mono font-bold uppercase tracking-wider rounded border shrink-0 ${config.colorBg} ${config.colorText} ${config.colorBorder} ${sizeClasses} ${className}`}
      title={`Forensic Verdict: ${config.label}${
        typeof score === 'number' ? ` (Risk Score: ${score}/100)` : ''
      }`}
    >
      [{prefix ? `${prefix} ` : ''}{config.label}
      {showScore && typeof score === 'number' ? ` · ${score}` : ''}]
    </span>
  );
}
