'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import StitchLandingHeader from '@/components/StitchLandingHeader';
import VerdictBadge from '@/components/VerdictBadge';
import { decodeHtmlEntities } from '@/lib/utils';
import {
  Mail,
  FileText,
  Search,
  RefreshCw,
  Loader2,
  ArrowUpRight,
  Shield,
  Filter,
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
  const [records, setRecords] = useState<EmailAnalysisRecordItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [sourceFilter, setSourceFilter] = useState<'all' | 'gmail' | 'eml'>('all');
  const [verdictFilter, setVerdictFilter] = useState<'all' | 'QUARANTINE' | 'FLAG' | 'SAFE'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Helper matching the inbox list timestamp format (not relative time)
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
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (sourceFilter !== 'all') {
        params.set('source', sourceFilter);
      }
      if (verdictFilter !== 'all') {
        params.set('verdict', verdictFilter);
      }
      params.set('limit', '100');

      const res = await fetch(`/api/reports/history?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load history: ${res.statusText}`);
      }
      const data = await res.json();
      setRecords(data.records || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load analysis history');
    } finally {
      setIsLoading(false);
    }
  }, [sourceFilter, verdictFilter]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Client-side search on subject, sender, and domain
  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return records;
    const q = searchQuery.toLowerCase();
    return records.filter((rec) => {
      const subject = (rec.subject || '').toLowerCase();
      const sender = (rec.sender || '').toLowerCase();
      const domain = (rec.senderDomain || '').toLowerCase();
      return subject.includes(q) || sender.includes(q) || domain.includes(q);
    });
  }, [records, searchQuery]);

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
            <p className="text-xs font-mono text-[#737688] dark:text-[#A0A7A3]">
              Unified ledger of analyzed emails across direct Gmail mailbox triage and raw .EML ingestion
            </p>
          </div>

          <button
            type="button"
            onClick={fetchHistory}
            disabled={isLoading}
            className="self-start sm:self-auto flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono bg-white dark:bg-[#151A17] hover:bg-[#EAEAE5] dark:hover:bg-[#202124] text-[#434656] dark:text-[#A0A7A3] hover:text-[#0052ff] dark:hover:text-[#3b82f6] border border-[#D5D5CE] dark:border-[#29342F] transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Filter Controls Toolbar */}
        <div className="bg-white dark:bg-[#121614] border border-[#D5D5CE] dark:border-[#29342F] rounded p-4 mb-6 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Left: Source & Verdict Filters */}
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
            {/* Source Segmented Control */}
            <div className="flex items-center gap-1.5 bg-[#F2F2EE] dark:bg-[#1b211e] p-1 rounded border border-[#D5D5CE] dark:border-[#29342F]">
              <span className="text-[10px] uppercase font-bold text-[#737688] dark:text-[#7D8681] px-2">
                Source
              </span>
              <button
                type="button"
                onClick={() => setSourceFilter('all')}
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
                onClick={() => setSourceFilter('gmail')}
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
                onClick={() => setSourceFilter('eml')}
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
                onClick={() => setVerdictFilter('all')}
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
                onClick={() => setVerdictFilter('QUARANTINE')}
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
                onClick={() => setVerdictFilter('FLAG')}
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
                onClick={() => setVerdictFilter('SAFE')}
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
          <div className="relative w-full md:w-64">
            <Search className="w-3.5 h-3.5 text-[#737688] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search subject or sender..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded text-xs bg-[#F2F2EE] dark:bg-[#1b211e] border border-[#D5D5CE] dark:border-[#29342F] text-[#1a1c1c] dark:text-[#F2F2EE] placeholder-[#737688] dark:placeholder-[#656464] focus:outline-none focus:border-[#0052ff] dark:focus:border-[#3b82f6] font-mono"
            />
          </div>
        </div>

        {/* Table / List Container */}
        <div className="bg-white dark:bg-[#121614] border border-[#D5D5CE] dark:border-[#29342F] rounded shadow-sm overflow-hidden flex-1 flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-16 text-center text-xs font-mono text-[#737688] dark:text-[#A0A7A3]">
              <Loader2 className="w-6 h-6 animate-spin text-[#0052ff] dark:text-[#3b82f6] mb-3" />
              <span>Loading forensic audit history...</span>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center p-16 text-center text-xs font-mono text-red-600 dark:text-[#ef4444]">
              <span>{error}</span>
              <button
                type="button"
                onClick={fetchHistory}
                className="mt-3 px-3 py-1 rounded border border-red-300 dark:border-[#ef4444]/30 hover:bg-red-50 dark:hover:bg-[#ef4444]/10 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-16 text-center text-xs font-mono text-[#737688] dark:text-[#7D8681]">
              <Filter className="w-8 h-8 opacity-40 mb-3" />
              <span className="font-semibold">No forensic analysis records match the selected filters.</span>
              <span className="opacity-70 mt-1">Try resetting the source or verdict filters above.</span>
            </div>
          ) : (
            <div className="divide-y divide-[#D5D5CE] dark:divide-[#29342F] overflow-y-auto">
              {filteredRecords.map((record) => (
                <Link
                  key={record.jobId}
                  href={`/analysis-console/${encodeURIComponent(record.jobId)}/evidence`}
                  className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-[#F2F2EE] dark:hover:bg-[#1b211e] transition-colors group cursor-pointer"
                >
                  {/* Left: Source Badge + Verdict Badge + Subject */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Source Badge */}
                    {record.source === 'gmail' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#0052ff]/10 dark:bg-[#3b82f6]/15 text-[#0052ff] dark:text-[#3b82f6] border border-[#0052ff]/30 dark:border-[#3b82f6]/30 shrink-0 uppercase tracking-wider">
                        <Mail className="w-3 h-3" />
                        <span>Gmail</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-purple-500/10 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30 dark:border-purple-500/40 shrink-0 uppercase tracking-wider">
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
                  </div>

                  {/* Right: Sender / Domain + Timestamp + Action Arrow */}
                  <div className="flex items-center gap-6 shrink-0 text-xs font-mono">
                    <span className="text-[#737688] dark:text-[#A0A7A3] truncate max-w-[180px] hidden sm:inline text-right">
                      {record.senderDomain || record.sender || 'Unknown'}
                    </span>

                    <span className="text-[#737688] dark:text-[#7D8681] text-right w-16 shrink-0">
                      {formatTimestamp(record.timestamp || record.createdAt || '')}
                    </span>

                    <ArrowUpRight className="w-4 h-4 text-[#737688] dark:text-[#7D8681] group-hover:text-[#0052ff] dark:group-hover:text-[#3b82f6] group-hover:translate-x-0.5 transition-all shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
