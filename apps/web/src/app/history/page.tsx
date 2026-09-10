'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import StitchLandingHeader from '@/components/StitchLandingHeader';
import VerdictBadge from '@/components/VerdictBadge';
import { decodeHtmlEntities } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { api, isAuthError, isForbiddenError, getErrorMessage } from '@/lib/api';
import SignInRequiredState from '@/components/SignInRequiredState';
import {
  Mail,
  FileText,
  Search,
  RefreshCw,
  Loader2,
  ArrowUpRight,
  Shield,
  Filter,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  X,
} from 'lucide-react';

export interface EmailAnalysisRecordItem {
  jobId: string;
  source: 'eml' | 'gmail';
  gmailMessageId?: string;
  sender?: string;
  subject?: string;
  senderDomain: string;
  finalScore: number;
  verdict: 'QUARANTINE' | 'FLAG' | 'SAFE';
  authScore?: number;
  identityScore?: number;
  ipScore?: number;
  nlpScore?: number;
  timestamp: string;
  createdAt?: string;
}

export default function ForensicHistoryPage(): React.JSX.Element {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [records, setRecords] = useState<EmailAnalysisRecordItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination & Search States
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(25);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(0);

  // Filters
  const [sourceFilter, setSourceFilter] = useState<'all' | 'gmail' | 'eml'>('all');
  const [verdictFilter, setVerdictFilter] = useState<'all' | 'QUARANTINE' | 'FLAG' | 'SAFE'>('all');
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<EmailAnalysisRecordItem | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Debounce search input by 300ms
  useEffect((): (() => void) => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
      setPage(1); // reset to page 1 on new search
    }, 300);
    return (): void => clearTimeout(handler);
  }, [searchInput]);

  // Helper matching the inbox list timestamp format
  const formatTimestamp = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const now = new Date();
      const isToday =
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear();

      if (isToday) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const fetchHistory = useCallback(async (): Promise<void> => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {
        page,
        limit,
      };
      if (sourceFilter !== 'all') {
        params.source = sourceFilter;
      }
      if (verdictFilter !== 'all') {
        params.verdict = verdictFilter;
      }
      if (debouncedQuery) {
        params.q = debouncedQuery;
      }

      const res = await api.get('/api/reports/history', { params });
      setRecords(res.data?.records || []);
      setTotal(res.data?.total ?? (res.data?.records?.length || 0));
      setTotalPages(res.data?.totalPages ?? 1);
    } catch (err: unknown) {
      if (isAuthError(err)) {
        return;
      }
      if (isForbiddenError(err)) {
        setError('You are not authorized to access this history.');
        return;
      }
      setError(getErrorMessage(err, 'Failed to load analysis history'));
    } finally {
      setIsLoading(false);
    }
  }, [user, page, limit, sourceFilter, verdictFilter, debouncedQuery]);

  useEffect(() => {
    if (!isAuthLoading) {
      fetchHistory();
    }
  }, [fetchHistory, isAuthLoading]);

  // Handle Delete Confirmation
  const handleDeleteConfirm = async (): Promise<void> => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/api/reports/${encodeURIComponent(deleteTarget.jobId)}`);
      // Successfully deleted: update local state
      setRecords((prev) => prev.filter((r) => r.jobId !== deleteTarget.jobId));
      setTotal((prev) => Math.max(0, prev - 1));
      setDeleteTarget(null);
    } catch (err: unknown) {
      if (isForbiddenError(err)) {
        setDeleteError('Access denied. You do not have permission to delete this report.');
      } else {
        setDeleteError(getErrorMessage(err, 'Failed to delete report. Please try again.'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // KPI calculations based on current dataset
  const kpis = useMemo(() => {
    const threats = records.filter((r) => r.verdict === 'QUARANTINE' || r.verdict === 'FLAG').length;
    const clean = records.filter((r) => r.verdict === 'SAFE').length;
    const rate = records.length > 0 ? Math.round((threats / records.length) * 100) : 0;
    return {
      threatRate: rate,
      cleanCount: clean,
    };
  }, [records]);

  if (!isAuthLoading && !user) {
    return (
      <div className="min-h-screen bg-[#F2F2EE] dark:bg-[#0b0b0b] text-[#1a1c1c] dark:text-[#F2F2EE] transition-colors duration-200 flex flex-col font-sans">
        <StitchLandingHeader />
        <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 md:px-12 py-16 flex flex-col items-center justify-center">
          <SignInRequiredState
            title="Sign in required to view Audit History"
            description="You need to sign in with your Google account to view your forensic investigation records and audit logs."
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F2F2EE] dark:bg-[#0b0b0b] text-[#1a1c1c] dark:text-[#F2F2EE] transition-colors duration-200 flex flex-col font-sans">
      <StitchLandingHeader />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 md:px-12 py-8 flex flex-col">
        {/* Page Title & Refresh */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[#D5D5CE] dark:border-[#29342F]">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-5 h-5 text-[#0052ff] dark:text-[#3b82f6]" />
              <h1 className="text-2xl font-bold tracking-tight text-[#1a1c1c] dark:text-[#fdfcf8]">
                Forensic History & Audit Log
              </h1>
            </div>
            <p className="text-xs text-[#737688] dark:text-[#A0A7A3]">
              Unified tenant ledger of analyzed emails across direct Gmail mailbox triage and raw .EML ingestion
            </p>
          </div>

          <button
            type="button"
            onClick={fetchHistory}
            disabled={isLoading}
            className="self-start sm:self-auto flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold bg-white dark:bg-[#151A17] hover:bg-[#EAEAE5] dark:hover:bg-[#202124] text-[#434656] dark:text-[#A0A7A3] hover:text-[#0052ff] dark:hover:text-[#3b82f6] border border-[#D5D5CE] dark:border-[#29342F] transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-[#121614] border border-[#D5D5CE] dark:border-[#29342F] rounded p-4 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider">
                Total Scans
              </span>
              <div className="text-2xl font-black text-[#1a1c1c] dark:text-[#F2F2EE] mt-0.5">
                {total}
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 flex items-center justify-center text-[#0052ff] dark:text-[#3b82f6]">
              <Shield className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white dark:bg-[#121614] border border-[#D5D5CE] dark:border-[#29342F] rounded p-4 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider">
                Threat Rate
              </span>
              <div className="text-2xl font-black text-red-600 dark:text-[#ef4444] mt-0.5">
                {kpis.threatRate}%
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-red-500/10 dark:bg-[#ef4444]/20 flex items-center justify-center text-red-600 dark:text-[#ef4444]">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white dark:bg-[#121614] border border-[#D5D5CE] dark:border-[#29342F] rounded p-4 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider">
                Clean Scans
              </span>
              <div className="text-2xl font-black text-emerald-600 dark:text-green-400 mt-0.5">
                {kpis.cleanCount}
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-emerald-500/10 dark:bg-green-500/20 flex items-center justify-center text-emerald-600 dark:text-green-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Filter Controls Toolbar */}
        <div className="bg-white dark:bg-[#121614] border border-[#D5D5CE] dark:border-[#29342F] rounded p-4 mb-6 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Left: Source & Verdict Filters */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            {/* Source Segmented Control */}
            <div className="flex items-center gap-1.5 bg-[#F2F2EE] dark:bg-[#1b211e] p-1 rounded border border-[#D5D5CE] dark:border-[#29342F]">
              <span className="text-[10px] uppercase font-bold text-[#737688] dark:text-[#7D8681] px-2">
                Source
              </span>
              <button
                type="button"
                onClick={() => {
                  setSourceFilter('all');
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded transition-colors font-medium ${
                  sourceFilter === 'all'
                    ? 'bg-white dark:bg-[#2d3731] text-[#0052ff] dark:text-[#3b82f6] shadow-sm font-bold'
                    : 'text-[#434656] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#fdfcf8]'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceFilter('gmail');
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded transition-colors font-medium flex items-center gap-1 ${
                  sourceFilter === 'gmail'
                    ? 'bg-white dark:bg-[#2d3731] text-[#0052ff] dark:text-[#3b82f6] shadow-sm font-bold'
                    : 'text-[#434656] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#fdfcf8]'
                }`}
              >
                <Mail className="w-3 h-3" />
                <span>Gmail</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceFilter('eml');
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded transition-colors font-medium flex items-center gap-1 ${
                  sourceFilter === 'eml'
                    ? 'bg-white dark:bg-[#2d3731] text-[#0052ff] dark:text-[#3b82f6] shadow-sm font-bold'
                    : 'text-[#434656] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#fdfcf8]'
                }`}
              >
                <FileText className="w-3 h-3" />
                <span>.EML</span>
              </button>
            </div>

            {/* Verdict Segmented Control */}
            <div className="flex items-center gap-1.5 bg-[#F2F2EE] dark:bg-[#1b211e] p-1 rounded border border-[#D5D5CE] dark:border-[#29342F]">
              <span className="text-[10px] uppercase font-bold text-[#737688] dark:text-[#7D8681] px-2">
                Verdict
              </span>
              <button
                type="button"
                onClick={() => {
                  setVerdictFilter('all');
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded transition-colors font-medium ${
                  verdictFilter === 'all'
                    ? 'bg-white dark:bg-[#2d3731] text-[#0052ff] dark:text-[#3b82f6] shadow-sm font-bold'
                    : 'text-[#434656] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#fdfcf8]'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => {
                  setVerdictFilter('QUARANTINE');
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded transition-colors font-medium ${
                  verdictFilter === 'QUARANTINE'
                    ? 'bg-white dark:bg-[#2d3731] text-red-600 dark:text-[#ef4444] shadow-sm font-bold'
                    : 'text-red-600 dark:text-[#ef4444] opacity-80 hover:opacity-100'
                }`}
              >
                Quarantine
              </button>
              <button
                type="button"
                onClick={() => {
                  setVerdictFilter('FLAG');
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded transition-colors font-medium ${
                  verdictFilter === 'FLAG'
                    ? 'bg-white dark:bg-[#2d3731] text-amber-700 dark:text-amber-400 shadow-sm font-bold'
                    : 'text-amber-700 dark:text-amber-400 opacity-80 hover:opacity-100'
                }`}
              >
                Suspicious
              </button>
              <button
                type="button"
                onClick={() => {
                  setVerdictFilter('SAFE');
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded transition-colors font-medium ${
                  verdictFilter === 'SAFE'
                    ? 'bg-white dark:bg-[#2d3731] text-emerald-700 dark:text-green-400 shadow-sm font-bold'
                    : 'text-emerald-700 dark:text-green-400 opacity-80 hover:opacity-100'
                }`}
              >
                Safe
              </button>
            </div>
          </div>

          {/* Right: Search Input */}
          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 text-[#737688] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search subject, sender, domain..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-8 pr-8 py-1.5 rounded text-xs bg-[#F2F2EE] dark:bg-[#1b211e] border border-[#D5D5CE] dark:border-[#29342F] text-[#1a1c1c] dark:text-[#F2F2EE] placeholder-[#737688] dark:placeholder-[#656464] focus:outline-none focus:border-[#0052ff] dark:focus:border-[#3b82f6]"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#737688] hover:text-[#1a1c1c] dark:hover:text-[#F2F2EE]"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Table / List Container */}
        <div className="bg-white dark:bg-[#121614] border border-[#D5D5CE] dark:border-[#29342F] rounded shadow-sm overflow-hidden flex-1 flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-16 text-center text-xs text-[#737688] dark:text-[#A0A7A3]">
              <Loader2 className="w-6 h-6 animate-spin text-[#0052ff] dark:text-[#3b82f6] mb-3" />
              <span>Loading forensic audit history...</span>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center p-16 text-center text-xs text-red-600 dark:text-[#ef4444]">
              <span>{error}</span>
              <button
                type="button"
                onClick={fetchHistory}
                className="mt-3 px-3 py-1 rounded border border-red-300 dark:border-[#ef4444]/30 hover:bg-red-50 dark:hover:bg-[#ef4444]/10 transition-colors font-medium"
              >
                Try Again
              </button>
            </div>
          ) : records.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-16 text-center text-xs text-[#737688] dark:text-[#7D8681]">
              <Filter className="w-8 h-8 opacity-40 mb-3" />
              <span className="font-semibold">No forensic analysis records match the selected filters.</span>
              <span className="opacity-70 mt-1">Try resetting the search query or filters above.</span>
            </div>
          ) : (
            <div className="divide-y divide-[#D5D5CE] dark:divide-[#29342F] overflow-y-auto">
              {records.map((record) => (
                <div
                  key={record.jobId}
                  className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-[#F2F2EE] dark:hover:bg-[#1b211e] transition-colors group"
                >
                  {/* Clickable Area for Inspection */}
                  <Link
                    href={`/analysis-console/${encodeURIComponent(record.jobId)}/evidence`}
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    {/* Source Badge */}
                    {record.source === 'gmail' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[#0052ff]/10 dark:bg-[#3b82f6]/15 text-[#0052ff] dark:text-[#3b82f6] border border-[#0052ff]/30 dark:border-[#3b82f6]/30 shrink-0 uppercase tracking-wider">
                        <Mail className="w-3 h-3" />
                        <span>Gmail</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30 dark:border-purple-500/40 shrink-0 uppercase tracking-wider">
                        <FileText className="w-3 h-3" />
                        <span>.EML</span>
                      </span>
                    )}

                    {/* Shared Verdict Badge */}
                    <VerdictBadge
                      verdict={record.verdict}
                      score={record.finalScore}
                      size="sm"
                    />

                    {/* Subject */}
                    <span className="truncate text-xs font-semibold text-[#1a1c1c] dark:text-[#fdfcf8] group-hover:text-[#0052ff] dark:group-hover:text-[#3b82f6] transition-colors">
                      {decodeHtmlEntities(record.subject || '') || '(No Subject)'}
                    </span>
                  </Link>

                  {/* Right Actions: Domain + Timestamp + Delete Button + Arrow */}
                  <div className="flex items-center gap-4 shrink-0 text-xs">
                    <span className="text-[#737688] dark:text-[#A0A7A3] truncate max-w-[180px] hidden sm:inline text-right">
                      {record.senderDomain || record.sender || 'Unknown'}
                    </span>

                    <span className="text-[#737688] dark:text-[#7D8681] text-right w-16 shrink-0">
                      {formatTimestamp(record.timestamp || record.createdAt || '')}
                    </span>

                    {/* Safe Delete Action Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setDeleteError(null);
                        setDeleteTarget(record);
                      }}
                      className="p-1 text-[#737688] dark:text-[#7D8681] hover:text-red-600 dark:hover:text-[#ef4444] hover:bg-red-50 dark:hover:bg-[#ef4444]/10 rounded transition-colors"
                      title="Delete Forensic Report"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <Link
                      href={`/analysis-console/${encodeURIComponent(record.jobId)}/evidence`}
                      className="text-[#737688] dark:text-[#7D8681] group-hover:text-[#0052ff] dark:group-hover:text-[#3b82f6]"
                      title="Open Investigation Console"
                    >
                      <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 transition-all" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination Controls Footer */}
          {!isLoading && records.length > 0 && (
            <div className="px-6 py-3 border-t border-[#D5D5CE] dark:border-[#29342F] bg-[#F8F9FA] dark:bg-[#151A17] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#737688] dark:text-[#A0A7A3]">
              <div>
                Showing{' '}
                <span className="font-bold text-[#1a1c1c] dark:text-[#F2F2EE]">
                  {(page - 1) * limit + 1}
                </span>{' '}
                to{' '}
                <span className="font-bold text-[#1a1c1c] dark:text-[#F2F2EE]">
                  {Math.min(page * limit, total)}
                </span>{' '}
                of <span className="font-bold text-[#1a1c1c] dark:text-[#F2F2EE]">{total}</span>{' '}
                records
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white dark:bg-[#1F2623] border border-[#D5D5CE] dark:border-[#29342F] hover:bg-[#EAEAE5] dark:hover:bg-[#2B3530] text-[#1a1c1c] dark:text-[#F2F2EE] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>

                <span className="px-2 py-1 text-xs">
                  Page <span className="font-bold">{page}</span> of{' '}
                  <span className="font-bold">{totalPages}</span>
                </span>

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white dark:bg-[#1F2623] border border-[#D5D5CE] dark:border-[#29342F] hover:bg-[#EAEAE5] dark:hover:bg-[#2B3530] text-[#1a1c1c] dark:text-[#F2F2EE] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-[#151A17] border border-[#D5D5CE] dark:border-[#29342F] rounded-lg max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center gap-3 text-red-600 dark:text-[#ef4444] mb-3">
              <div className="p-2 rounded-full bg-red-100 dark:bg-[#ef4444]/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#1a1c1c] dark:text-[#F2F2EE]">
                Delete Forensic Case?
              </h3>
            </div>

            <p className="text-xs text-[#737688] dark:text-[#A0A7A3] mb-3 leading-relaxed">
              Are you sure you want to delete the forensic report for{' '}
              <span className="font-semibold text-[#1a1c1c] dark:text-[#F2F2EE]">
                &quot;{decodeHtmlEntities(deleteTarget.subject || '(No Subject)')}&quot;
              </span>
              ?
            </p>

            <p className="text-[11px] text-[#737688] dark:text-[#7D8681] bg-[#F2F2EE] dark:bg-[#1b211e] p-2.5 rounded border border-[#D5D5CE] dark:border-[#29342F] mb-4">
              This tenant-scoped deletion will remove the analysis report, raw email payload, and feedback records permanently. This action cannot be undone.
            </p>

            {deleteError && (
              <div className="text-xs text-red-600 dark:text-[#ef4444] bg-red-50 dark:bg-[#ef4444]/10 p-2.5 rounded mb-4 border border-red-200 dark:border-[#ef4444]/20">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="px-3.5 py-1.5 rounded text-xs font-semibold text-[#434656] dark:text-[#A0A7A3] hover:bg-[#EAEAE5] dark:hover:bg-[#202124] border border-[#D5D5CE] dark:border-[#29342F] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors shadow-sm disabled:opacity-50"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isDeleting ? 'Deleting...' : 'Delete Case'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
