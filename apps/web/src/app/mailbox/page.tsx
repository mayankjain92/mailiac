'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ForensicIngestionModal from '@/components/ForensicIngestionModal';
import type { GmailMessageAnalysisEnrichment } from '@mailiac/shared-types';
import {
  Shield,
  Search,
  RefreshCw,
  Inbox,
  Mail,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Clock,
  Loader2,
  ChevronRight,
  ArrowRight,
  LogOut,
  X,
  Menu,
  FileSearch,
  ExternalLink,
  Sun,
  Moon,
} from 'lucide-react';

import { useTheme } from '@/components/ThemeProvider';

export interface GmailMessageSummary extends Partial<GmailMessageAnalysisEnrichment> {
  id: string;
  threadId?: string;
  sender: string;
  subject: string;
  date: string;
  snippet: string;
  unread?: boolean;
}

type MailboxFilter = 'inbox' | 'all' | 'fraud' | 'spam' | 'good' | 'unanalyzed';

export default function MailboxPage(): React.JSX.Element {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const isDarkMode = theme === 'dark';

  // State
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [messages, setMessages] = useState<GmailMessageSummary[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<MailboxFilter>('inbox');
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [selectedCheckboxIds, setSelectedCheckboxIds] = useState<Set<string>>(new Set());

  // UI state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [analyzingMessageId, setAnalyzingMessageId] = useState<string | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState<boolean>(false);
  const [isIngestionModalOpen, setIsIngestionModalOpen] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Check connection status
  const checkStatus = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/gmail/status');
      if (res.ok) {
        const data = (await res.json()) as { connected: boolean; email?: string };
        setIsConnected(data.connected);
        setConnectedEmail(data.email ?? null);
        return data.connected;
      }
      setIsConnected(false);
      return false;
    } catch {
      setIsConnected(false);
      return false;
    }
  }, []);

  // Fetch messages from Gmail
  const fetchMessages = useCallback(
    async (query = '', pageToken?: string): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.append('q', query.trim());
        if (pageToken) params.append('pageToken', pageToken);
        params.append('maxResults', '30');

        const res = await fetch(`/api/gmail/messages?${params.toString()}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to fetch messages (${res.status})`);
        }

        const data = (await res.json()) as {
          messages: GmailMessageSummary[];
          nextPageToken?: string;
        };
        setMessages(data.messages || []);
        setNextPageToken(data.nextPageToken || null);

        // If no message is selected or selected message is gone, select the first message by default
        if (data.messages && data.messages.length > 0) {
          setSelectedEmailId((prev) => {
            if (prev && data.messages.some((m) => m.id === prev)) return prev;
            return data.messages[0].id;
          });
        } else {
          setSelectedEmailId(null);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error loading Gmail messages';
        setError(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    checkStatus().then((connected) => {
      if (connected) {
        fetchMessages();
      } else {
        setIsLoading(false);
      }
    });
  }, [checkStatus, fetchMessages]);

  // Disconnect account
  const handleDisconnect = async (): Promise<void> => {
    if (!confirm('Are you sure you want to disconnect your Gmail account from Mailiac?')) return;
    setIsDisconnecting(true);
    setError(null);
    try {
      const res = await fetch('/api/gmail/disconnect', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to disconnect Gmail account');
      setIsConnected(false);
      setConnectedEmail(null);
      setMessages([]);
      setSelectedEmailId(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Disconnection failed';
      setError(msg);
    } finally {
      setIsDisconnecting(false);
    }
  };

  // Search submission
  const handleSearchSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    fetchMessages(searchQuery);
  };

  // Trigger Forensic Analysis for a specific email
  const handleAnalyze = async (message: GmailMessageSummary): Promise<void> => {
    setAnalyzingMessageId(message.id);
    setError(null);
    try {
      const res = await fetch(`/api/gmail/messages/${message.id}/analyze`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Analysis request failed with status ${res.status}`);
      }

      const data = (await res.json()) as { jobId: string };
      if (!data.jobId) {
        throw new Error('No job ID returned from server.');
      }

      // Navigate to existing forensic analysis console
      router.push(
        `/forensic-analysis?jobId=${data.jobId}&fileName=${encodeURIComponent(
          message.subject || 'Gmail Sample'
        )}`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to trigger forensic analysis';
      setError(msg);
    } finally {
      setAnalyzingMessageId(null);
    }
  };

  // Counts for Mailiac Security Filters
  const counts = useMemo(() => {
    let fraud = 0;
    let spam = 0;
    let good = 0;
    let unanalyzed = 0;

    for (const msg of messages) {
      if (!msg.analyzed) {
        unanalyzed++;
      } else if (msg.verdict === 'QUARANTINE' || (typeof msg.finalScore === 'number' && msg.finalScore >= 70)) {
        fraud++;
      } else if (msg.verdict === 'FLAG' || (typeof msg.finalScore === 'number' && msg.finalScore >= 30)) {
        spam++;
      } else {
        good++;
      }
    }

    return {
      inbox: messages.length,
      all: messages.length,
      fraud,
      spam,
      good,
      unanalyzed,
    };
  }, [messages]);

  // Filtered message list
  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => {
      switch (activeFilter) {
        case 'inbox':
        case 'all':
          return true;
        case 'fraud':
          return msg.analyzed && (msg.verdict === 'QUARANTINE' || (typeof msg.finalScore === 'number' && msg.finalScore >= 70));
        case 'spam':
          return msg.analyzed && (msg.verdict === 'FLAG' || (typeof msg.finalScore === 'number' && msg.finalScore >= 30 && msg.finalScore < 70));
        case 'good':
          return msg.analyzed && (msg.verdict === 'SAFE' || (typeof msg.finalScore === 'number' && msg.finalScore < 30));
        case 'unanalyzed':
          return !msg.analyzed;
        default:
          return true;
      }
    });
  }, [messages, activeFilter]);

  // Selected email object
  const selectedEmail = useMemo(() => {
    return messages.find((m) => m.id === selectedEmailId) || null;
  }, [messages, selectedEmailId]);

  // Helper to parse sender display name and email address
  const parseSender = (senderStr: string): { name: string; email: string } => {
    if (!senderStr) return { name: 'Unknown', email: '' };
    const match = senderStr.match(/^(.*?)\s*<([^>]+)>$/);
    if (match) {
      return { name: match[1].replace(/["']/g, '').trim() || match[2], email: match[2] };
    }
    return { name: senderStr, email: senderStr };
  };

  // Helper to format date string
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

  // Full date formatter for reading pane
  const formatFullDate = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString([], {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      });
    } catch {
      return dateStr;
    }
  };

  // Checkbox selection toggle
  const toggleCheckbox = (id: string, e: React.MouseEvent): void => {
    e.stopPropagation();
    setSelectedCheckboxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (): void => {
    if (selectedCheckboxIds.size === filteredMessages.length) {
      setSelectedCheckboxIds(new Set());
    } else {
      setSelectedCheckboxIds(new Set(filteredMessages.map((m) => m.id)));
    }
  };

  return (
    <div className="min-h-screen h-screen flex flex-col bg-[#F2F2EE] dark:bg-[#0b0b0b] text-[#1a1c1c] dark:text-[#fdfcf8] grid-bg overflow-hidden font-sans selection:bg-[#0052ff] selection:text-white transition-colors duration-200">
      {/* Top Bar (Stitch Gmail Header) */}
      <header className="bg-[#F2F2EE] dark:bg-[#0b0b0b] flex items-center justify-between w-full px-4 py-2 shrink-0 z-50 border-b border-[#D5D5CE] dark:border-[#29342F] h-[64px] transition-colors">
        {/* Left: Brand + Hamburger */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 text-[#737688] dark:text-[#A0A7A3] hover:bg-[#EAEAE5] dark:hover:bg-[#202124] rounded-full transition-colors focus:outline-none"
            title="Toggle Sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          <Link href="/" className="flex items-center gap-2 group cursor-pointer mr-4">
            <div className="w-8 h-8 rounded bg-[#0052ff] dark:bg-[#3b82f6] flex items-center justify-center text-white font-bold text-base shadow-sm">
              <Shield className="w-5 h-5" />
            </div>
            <span className="text-xl font-extrabold text-[#1a1c1c] dark:text-[#fdfcf8] tracking-tight">
              Mailiac
            </span>
          </Link>
        </div>

        {/* Center: Search Bar & Analyze CTA */}
        <div className="flex-1 max-w-[720px] mx-4 flex items-center gap-3">
          <form
            onSubmit={handleSearchSubmit}
            className="relative flex-1 flex items-center bg-white dark:bg-[#202124] rounded-full overflow-hidden focus-within:ring-1 focus-within:ring-[#0052ff] transition-all border border-[#D5D5CE] dark:border-[#333] shadow-sm"
          >
            <button
              type="submit"
              className="p-2.5 text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#fdfcf8] pl-3.5 focus:outline-none"
            >
              <Search className="w-4 h-4" />
            </button>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search mail (e.g. from:paypal, invoice, subject:urgent)..."
              className="bg-transparent border-none w-full px-2 py-2 text-xs font-mono text-[#1a1c1c] dark:text-[#fdfcf8] placeholder-[#737688] dark:placeholder-[#7D8681] focus:outline-none focus:ring-0"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  fetchMessages('');
                }}
                className="p-2 text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#fdfcf8] pr-3"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          <button
            type="button"
            onClick={() => setIsIngestionModalOpen(true)}
            className="bg-[#0052ff] hover:bg-[#004ced] dark:bg-[#3b82f6] dark:hover:bg-[#2563eb] text-white text-xs font-semibold px-4 py-2.5 rounded-full flex items-center gap-1.5 transition-colors shrink-0 shadow-sm font-mono uppercase tracking-wider"
          >
            <FileSearch className="w-4 h-4" />
            <span className="hidden sm:inline">Analyze an email</span>
          </button>
        </div>

        {/* Right: Status, Help, Theme, Profile */}
        <div className="flex items-center gap-2">
          {isConnected ? (
            <div
              className="flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/30 rounded-full font-mono text-[11px] font-bold text-green-700 dark:text-green-400"
              title={connectedEmail ? `Connected: ${connectedEmail}` : 'Gmail Connected'}
            >
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              <span className="hidden md:inline">Gmail Connected</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-full font-mono text-[11px] font-bold text-amber-700 dark:text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>Disconnected</span>
            </div>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 text-[#737688] dark:text-[#A0A7A3] hover:bg-[#EAEAE5] dark:hover:bg-[#202124] rounded-full transition-colors"
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-[#fbbf24]" /> : <Moon className="w-4 h-4 text-[#434656]" />}
          </button>

          {isConnected && (
            <button
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="p-2 text-[#737688] dark:text-[#A0A7A3] hover:text-[#ef4444] hover:bg-[#EAEAE5] dark:hover:bg-[#202124] rounded-full transition-colors disabled:opacity-50"
              title="Disconnect Gmail Account"
            >
              {isDisconnecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
            </button>
          )}

          <div
            className="w-8 h-8 rounded-full bg-white dark:bg-[#202124] border border-[#D5D5CE] dark:border-[#333] flex items-center justify-center text-xs font-bold font-mono text-[#0052ff] dark:text-[#3b82f6] ml-1 shadow-sm"
            title={connectedEmail || 'Mailiac User'}
          >
            {connectedEmail ? connectedEmail[0].toUpperCase() : 'M'}
          </div>
        </div>
      </header>

      {/* Main Mailbox Content Area */}
      <div className="flex flex-1 overflow-hidden bg-[#F2F2EE] dark:bg-[#0b0b0b]">
        {/* Left Sidebar */}
        <aside
          className={`${
            isSidebarOpen ? 'w-60' : 'w-0 hidden'
          } flex flex-col h-full shrink-0 z-40 bg-[#F2F2EE] dark:bg-[#0b0b0b] pt-3 pr-2 transition-all duration-200 border-r border-[#D5D5CE] dark:border-[#29342F] select-none`}
        >
          <nav className="flex-1 overflow-y-auto space-y-1 text-xs font-mono">
            {/* Mailbox Section */}
            <div className="px-5 text-[10px] font-bold text-[#737688] dark:text-[#7D8681] uppercase tracking-widest mb-1.5">
              MAILBOX
            </div>

            <button
              onClick={() => setActiveFilter('inbox')}
              className={`w-full flex items-center justify-between px-5 py-2 rounded-r-full transition-colors ${
                activeFilter === 'inbox'
                  ? 'bg-[#0052ff]/10 dark:bg-[#0052ff]/20 text-[#0052ff] dark:text-[#3b82f6] font-bold border-l-2 border-[#0052ff]'
                  : 'text-[#434656] dark:text-[#A0A7A3] hover:bg-[#EAEAE5] dark:hover:bg-[#202124] hover:text-[#1a1c1c] dark:hover:text-[#fdfcf8]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Inbox className="w-4 h-4" />
                <span>Inbox</span>
              </div>
              <span className="text-[11px] opacity-80">{counts.inbox}</span>
            </button>

            <button
              onClick={() => setActiveFilter('all')}
              className={`w-full flex items-center justify-between px-5 py-2 rounded-r-full transition-colors ${
                activeFilter === 'all'
                  ? 'bg-[#0052ff]/10 dark:bg-[#0052ff]/20 text-[#0052ff] dark:text-[#3b82f6] font-bold border-l-2 border-[#0052ff]'
                  : 'text-[#434656] dark:text-[#A0A7A3] hover:bg-[#EAEAE5] dark:hover:bg-[#202124] hover:text-[#1a1c1c] dark:hover:text-[#fdfcf8]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4" />
                <span>All Mail</span>
              </div>
            </button>

            {/* Mailiac Security Filters */}
            <div className="pt-5 pb-1">
              <div className="px-5 text-[10px] font-bold text-[#737688] dark:text-[#7D8681] uppercase tracking-widest mb-1.5">
                MAILIAC SECURITY
              </div>

              <button
                onClick={() => setActiveFilter('fraud')}
                className={`w-full flex items-center justify-between px-5 py-2 rounded-r-full transition-colors ${
                  activeFilter === 'fraud'
                    ? 'bg-red-500/10 dark:bg-[#ef4444]/20 text-red-600 dark:text-[#ef4444] font-bold border-l-2 border-red-600 dark:border-[#ef4444]'
                    : 'text-red-600 dark:text-[#ef4444] hover:bg-red-500/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Fraud</span>
                </div>
                {counts.fraud > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/15 text-red-600 dark:text-[#ef4444] font-bold">
                    {counts.fraud}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveFilter('spam')}
                className={`w-full flex items-center justify-between px-5 py-2 rounded-r-full transition-colors ${
                  activeFilter === 'spam'
                    ? 'bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 font-bold border-l-2 border-amber-600 dark:border-amber-500'
                    : 'text-amber-700 dark:text-amber-400 hover:bg-amber-500/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Spam</span>
                </div>
                {counts.spam > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 font-bold">
                    {counts.spam}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveFilter('good')}
                className={`w-full flex items-center justify-between px-5 py-2 rounded-r-full transition-colors ${
                  activeFilter === 'good'
                    ? 'bg-emerald-500/10 dark:bg-green-500/20 text-emerald-700 dark:text-green-400 font-bold border-l-2 border-emerald-600 dark:border-green-500'
                    : 'text-emerald-700 dark:text-green-400 hover:bg-emerald-500/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Good</span>
                </div>
                {counts.good > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-green-400 font-bold">
                    {counts.good}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveFilter('unanalyzed')}
                className={`w-full flex items-center justify-between px-5 py-2 rounded-r-full transition-colors ${
                  activeFilter === 'unanalyzed'
                    ? 'bg-[#0052ff]/10 dark:bg-[#0052ff]/20 text-[#0052ff] dark:text-[#3b82f6] font-bold border-l-2 border-[#0052ff]'
                    : 'text-[#737688] dark:text-[#A0A7A3] hover:bg-[#EAEAE5] dark:hover:bg-[#202124] hover:text-[#1a1c1c] dark:hover:text-[#fdfcf8]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <HelpCircle className="w-4 h-4" />
                  <span>Unanalyzed</span>
                </div>
                {counts.unanalyzed > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#EAEAE5] dark:bg-[#333] text-[#434656] dark:text-[#A0A7A3] font-bold border border-[#D5D5CE] dark:border-transparent">
                    {counts.unanalyzed}
                  </span>
                )}
              </button>
            </div>
          </nav>

          {/* Sidebar Footer Link */}
          <div className="p-3 border-t border-[#D5D5CE] dark:border-[#29342F]">
            <Link
              href="/forensic-analysis"
              className="flex items-center justify-between px-3 py-2 rounded bg-[#EAEAE5] dark:bg-[#151A17] hover:bg-[#DDDCD7] dark:hover:bg-[#202124] text-[#434656] dark:text-[#A0A7A3] hover:text-[#0052ff] dark:hover:text-[#3b82f6] text-[11px] font-mono transition-colors border border-[#D5D5CE] dark:border-[#29342F]"
            >
              <span>Forensic Console</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </aside>

        {/* Center: Email List + Right: Reading Pane */}
        <main className="flex-1 flex overflow-hidden bg-white dark:bg-[#0b0b0b]">
          {/* Email List Column */}
          <div
            className={`${
              selectedEmail ? 'w-full lg:w-1/2' : 'w-full'
            } h-full flex flex-col border-r border-[#D5D5CE] dark:border-[#29342F] bg-white dark:bg-[#0b0b0b] shrink-0 transition-all`}
          >
            {/* List Toolbar */}
            <div className="px-4 py-2 flex justify-between items-center shrink-0 border-b border-[#D5D5CE] dark:border-[#29342F] bg-[#F8F9FA] dark:bg-[#0b0b0b] sticky top-0 z-10 min-h-[48px]">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={
                    filteredMessages.length > 0 &&
                    selectedCheckboxIds.size === filteredMessages.length
                  }
                  onChange={toggleSelectAll}
                  className="rounded bg-white dark:bg-[#202124] border-[#D5D5CE] dark:border-[#444] text-[#0052ff] focus:ring-0 cursor-pointer"
                  title="Select all"
                />

                <button
                  onClick={() => {
                    setIsRefreshing(true);
                    fetchMessages(searchQuery);
                  }}
                  disabled={isLoading || isRefreshing}
                  className="p-1.5 text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#fdfcf8] hover:bg-[#EAEAE5] dark:hover:bg-[#202124] rounded-full transition-colors"
                  title="Refresh Mailbox"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>

                <span className="text-[11px] font-mono font-bold uppercase text-[#737688] dark:text-[#7D8681] tracking-wider ml-1">
                  {activeFilter} ({filteredMessages.length})
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-[#737688] dark:text-[#A0A7A3] font-mono">
                <span>
                  {filteredMessages.length === 0
                    ? '0 emails'
                    : `1-${filteredMessages.length} of ${messages.length}`}
                </span>

                {nextPageToken && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => fetchMessages(searchQuery, nextPageToken)}
                      disabled={isLoading}
                      className="p-1 text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#fdfcf8] hover:bg-[#EAEAE5] dark:hover:bg-[#202124] rounded transition-colors text-[11px] font-mono flex items-center gap-1"
                    >
                      <span>More</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="m-3 p-3 bg-[#ffdad6] dark:bg-[#410e0b] border border-[#ba1a1a]/30 rounded text-[#93000a] dark:text-[#ffb4ab] text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="text-[11px] underline ml-2 hover:opacity-80"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* List Body */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#EAEAE5] dark:divide-[#202124]">
              {isLoading && messages.length === 0 ? (
                <div className="py-24 text-center text-xs font-mono text-[#737688] dark:text-[#A0A7A3] flex flex-col items-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-[#0052ff] dark:text-[#3b82f6]" />
                  <span>Loading Gmail mailbox intelligence...</span>
                </div>
              ) : !isConnected ? (
                <div className="py-24 px-6 text-center max-w-md mx-auto space-y-4">
                  <div className="w-12 h-12 rounded-full bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 flex items-center justify-center text-[#0052ff] dark:text-[#3b82f6] mx-auto">
                    <Mail className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-[#1a1c1c] dark:text-[#fdfcf8]">
                    No Gmail Account Connected
                  </h3>
                  <p className="text-xs text-[#434656] dark:text-[#A0A7A3] leading-relaxed">
                    Connect your Gmail or Google Workspace inbox to inspect email headers and run one-click forensic deconstruction.
                  </p>
                  <button
                    onClick={() => setIsIngestionModalOpen(true)}
                    className="bg-[#0052ff] hover:bg-[#004ced] dark:bg-[#3b82f6] dark:hover:bg-[#2563eb] text-white text-xs font-semibold px-5 py-2.5 rounded shadow-sm inline-flex items-center gap-2 transition-colors font-mono"
                  >
                    <span>Connect Gmail Ingestion</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : filteredMessages.length === 0 ? (
                <div className="py-24 text-center text-xs font-mono text-[#737688] dark:text-[#7D8681] space-y-2">
                  <p>No messages match the active filter ({activeFilter}).</p>
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        fetchMessages('');
                      }}
                      className="text-[#0052ff] dark:text-[#3b82f6] underline"
                    >
                      Clear search filter
                    </button>
                  )}
                </div>
              ) : (
                filteredMessages.map((msg) => {
                  const isSelected = msg.id === selectedEmailId;
                  const isAnalyzing = analyzingMessageId === msg.id;
                  const { name: senderName } = parseSender(msg.sender);

                  return (
                    <div
                      key={msg.id}
                      onClick={() => setSelectedEmailId(msg.id)}
                      className={`email-row flex items-center px-4 py-2.5 cursor-pointer text-xs font-sans transition-colors relative group select-none ${
                        isSelected
                          ? 'bg-[#E8F0FE] dark:bg-[#1e232b] text-[#1a1c1c] dark:text-white border-l-2 border-[#0052ff]'
                          : 'bg-white dark:bg-[#0b0b0b] hover:bg-[#F4F6F8] dark:hover:bg-[#15181b] text-[#434656] dark:text-[#A0A7A3]'
                      }`}
                    >
                      {/* Checkbox */}
                      <div className="flex items-center w-6 shrink-0">
                        <input
                          type="checkbox"
                          checked={selectedCheckboxIds.has(msg.id)}
                          onClick={(e) => toggleCheckbox(msg.id, e)}
                          className="rounded bg-white dark:bg-[#202124] border-[#D5D5CE] dark:border-[#444] text-[#0052ff] focus:ring-0 cursor-pointer"
                        />
                      </div>

                      {/* Sender */}
                      <div
                        className={`w-36 shrink-0 truncate font-mono text-xs pr-2 ${
                          isSelected || msg.unread ? 'font-bold text-[#1a1c1c] dark:text-[#fdfcf8]' : 'text-[#434656] dark:text-[#A0A7A3]'
                        }`}
                      >
                        {senderName}
                      </div>

                      {/* Subject + Snippet + Security Badge */}
                      <div className="flex items-center flex-1 min-w-0 mr-3 gap-2">
                        {/* Security Tag */}
                        {msg.analyzed ? (
                          msg.verdict === 'QUARANTINE' || (typeof msg.finalScore === 'number' && msg.finalScore >= 70) ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-red-50 dark:bg-[#ef4444]/15 text-red-700 dark:text-[#ef4444] border border-red-200 dark:border-[#ef4444]/30 shrink-0 uppercase tracking-wider">
                              [FRAUD · {msg.finalScore ?? 87}]
                            </span>
                          ) : msg.verdict === 'FLAG' || (typeof msg.finalScore === 'number' && msg.finalScore >= 30) ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30 shrink-0 uppercase tracking-wider">
                              [SPAM · {msg.finalScore ?? 45}]
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 dark:bg-green-500/15 text-emerald-700 dark:text-green-400 border border-emerald-200 dark:border-green-500/30 shrink-0 uppercase tracking-wider">
                              [GOOD · {msg.finalScore ?? 12}]
                            </span>
                          )
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#EAEAE5] dark:bg-[#202124] text-[#555] dark:text-[#737688] border border-[#D5D5CE] dark:border-[#333] shrink-0 uppercase tracking-wider">
                            [UNANALYZED]
                          </span>
                        )}

                        <span
                          className={`truncate text-xs ${
                            isSelected || msg.unread
                              ? 'font-bold text-[#1a1c1c] dark:text-[#fdfcf8]'
                              : 'font-normal text-[#333] dark:text-[#d0d0d0]'
                          }`}
                        >
                          {msg.subject || '(No Subject)'}
                        </span>

                        <span className="text-[#737688] dark:text-[#656464] truncate text-xs font-mono hidden md:inline">
                          — {msg.snippet}
                        </span>
                      </div>

                      {/* Timestamp */}
                      <div className="text-[11px] font-mono text-[#737688] dark:text-[#7D8681] shrink-0 w-16 text-right group-hover:hidden">
                        {formatTimestamp(msg.date)}
                      </div>

                      {/* Row Hover Quick Actions */}
                      <div className="row-actions absolute right-3 top-1/2 -translate-y-1/2 bg-[#E8F0FE] dark:bg-[#1e232b] pl-2 gap-2 hidden group-hover:flex items-center z-10">
                        {msg.analyzed && msg.jobId ? (
                          <Link
                            href={`/analysis-console/${msg.jobId}/evidence`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] font-mono font-bold text-[#0052ff] dark:text-[#3b82f6] border border-[#0052ff]/40 dark:border-[#3b82f6]/40 bg-[#0052ff]/10 px-2 py-1 rounded hover:bg-[#0052ff]/20 flex items-center gap-1 transition-colors uppercase tracking-wider"
                          >
                            <span>Report</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAnalyze(msg);
                            }}
                            disabled={isAnalyzing}
                            className="text-[10px] font-mono font-bold text-white border border-[#0052ff] bg-[#0052ff] px-2 py-1 rounded hover:bg-[#004ced] flex items-center gap-1 transition-colors uppercase tracking-wider disabled:opacity-50"
                          >
                            {isAnalyzing ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <>
                                <span>Analyze</span>
                                <ArrowRight className="w-3 h-3" />
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Reading View Pane */}
          {selectedEmail ? (
            <div className="hidden lg:flex flex-1 flex-col h-full bg-[#FAFAFA] dark:bg-[#0b0b0b] text-[#1a1c1c] dark:text-[#fdfcf8] overflow-hidden">
              {/* Reading Pane Toolbar */}
              <div className="px-4 py-2 flex items-center justify-between shrink-0 border-b border-[#D5D5CE] dark:border-[#29342F] bg-[#F8F9FA] dark:bg-[#0b0b0b] sticky top-0 z-10 min-h-[48px]">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedEmailId(null)}
                    className="p-1.5 text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#fdfcf8] hover:bg-[#EAEAE5] dark:hover:bg-[#202124] rounded-full transition-colors"
                    title="Close reading view"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-mono text-[#737688] dark:text-[#7D8681]">Email Inspection</span>
                </div>

                <div className="flex items-center gap-2 text-xs font-mono">
                  {selectedEmail.analyzed && selectedEmail.jobId ? (
                    <Link
                      href={`/analysis-console/${selectedEmail.jobId}/evidence`}
                      className="text-xs font-mono font-bold text-[#0052ff] dark:text-[#3b82f6] hover:underline inline-flex items-center gap-1"
                    >
                      <span>Full Evidence Explorer</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleAnalyze(selectedEmail)}
                      disabled={analyzingMessageId === selectedEmail.id}
                      className="bg-[#0052ff] hover:bg-[#004ced] dark:bg-[#3b82f6] dark:hover:bg-[#2563eb] text-white text-xs font-mono font-semibold px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {analyzingMessageId === selectedEmail.id ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Deconstructing...</span>
                        </>
                      ) : (
                        <>
                          <span>Analyze Forensics</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Reading Pane Body */}
              <div className="flex-1 overflow-y-auto">
                {/* Security Banner Header */}
                {selectedEmail.analyzed ? (
                  selectedEmail.verdict === 'QUARANTINE' ||
                  (typeof selectedEmail.finalScore === 'number' && selectedEmail.finalScore >= 70) ? (
                    <div className="bg-red-50 dark:bg-[#ef4444]/10 border-b border-red-200 dark:border-[#ef4444]/20 px-6 py-3 flex justify-between items-center text-red-700 dark:text-[#ef4444] animate-fadeIn">
                      <div className="flex items-center gap-3">
                        <ShieldAlert className="w-5 h-5 shrink-0" />
                        <span className="font-mono text-xs font-bold uppercase tracking-wider">
                          ⚠ FRAUDULENT EMAIL · RISK {selectedEmail.finalScore ?? 87}/100
                        </span>
                      </div>
                      <Link
                        href={`/analysis-console/${selectedEmail.jobId}/evidence`}
                        className="text-[11px] font-mono font-bold border border-red-600 dark:border-[#ef4444] px-3 py-1 rounded bg-red-600 dark:bg-transparent text-white dark:text-[#ef4444] hover:bg-red-700 dark:hover:bg-[#ef4444] dark:hover:text-white transition-colors uppercase tracking-wider flex items-center gap-1"
                      >
                        View Forensic Report <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  ) : selectedEmail.verdict === 'FLAG' ||
                    (typeof selectedEmail.finalScore === 'number' && selectedEmail.finalScore >= 30) ? (
                    <div className="bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/20 px-6 py-3 flex justify-between items-center text-amber-700 dark:text-amber-400 animate-fadeIn">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <span className="font-mono text-xs font-bold uppercase tracking-wider">
                          ⚠ SUSPICIOUS SPAM · RISK {selectedEmail.finalScore ?? 45}/100
                        </span>
                      </div>
                      <Link
                        href={`/analysis-console/${selectedEmail.jobId}/evidence`}
                        className="text-[11px] font-mono font-bold border border-amber-600 dark:border-amber-500 px-3 py-1 rounded bg-amber-600 dark:bg-transparent text-white dark:text-amber-400 hover:bg-amber-700 dark:hover:bg-amber-500 dark:hover:text-black transition-colors uppercase tracking-wider flex items-center gap-1"
                      >
                        View Report <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  ) : (
                    <div className="bg-emerald-50 dark:bg-green-500/10 border-b border-emerald-200 dark:border-green-500/20 px-6 py-3 flex justify-between items-center text-emerald-700 dark:text-green-400 animate-fadeIn">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 shrink-0" />
                        <span className="font-mono text-xs font-bold uppercase tracking-wider">
                          ✓ VERIFIED GOOD · RISK {selectedEmail.finalScore ?? 12}/100
                        </span>
                      </div>
                      <Link
                        href={`/analysis-console/${selectedEmail.jobId}/evidence`}
                        className="text-[11px] font-mono font-bold border border-emerald-600 dark:border-green-500 px-3 py-1 rounded bg-emerald-600 dark:bg-transparent text-white dark:text-green-400 hover:bg-emerald-700 dark:hover:bg-green-500 dark:hover:text-black transition-colors uppercase tracking-wider flex items-center gap-1"
                      >
                        View Report <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  )
                ) : (
                  <div className="bg-[#0052ff]/5 dark:bg-[#0052ff]/10 border-b border-[#0052ff]/20 px-6 py-3 flex justify-between items-center text-[#0052ff] dark:text-[#3b82f6]">
                    <div className="flex items-center gap-3">
                      <HelpCircle className="w-5 h-5 shrink-0" />
                      <span className="font-mono text-xs font-bold uppercase tracking-wider">
                        MAILIAC ANALYSIS: This email has not been analyzed yet.
                      </span>
                    </div>
                    <button
                      onClick={() => handleAnalyze(selectedEmail)}
                      disabled={analyzingMessageId === selectedEmail.id}
                      className="text-[11px] font-mono font-bold border border-[#0052ff] bg-[#0052ff] text-white px-3 py-1 rounded hover:bg-[#004ced] transition-colors uppercase tracking-wider flex items-center gap-1 disabled:opacity-50"
                    >
                      {analyzingMessageId === selectedEmail.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          Analyze email <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Email Metadata Details */}
                <div className="p-8 pb-4">
                  <h1 className="text-xl md:text-2xl font-bold text-[#1a1c1c] dark:text-[#fdfcf8] mb-6 leading-snug">
                    {selectedEmail.subject || '(No Subject)'}
                  </h1>

                  <div className="flex justify-between items-start mb-8 pb-6 border-b border-[#D5D5CE] dark:border-[#29342F]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#EAEAE5] dark:bg-[#202124] border border-[#D5D5CE] dark:border-[#333] text-[#1a1c1c] dark:text-[#fdfcf8] flex items-center justify-center font-bold text-sm font-mono shadow-sm">
                        {parseSender(selectedEmail.sender).name[0]?.toUpperCase() || 'U'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-[#1a1c1c] dark:text-[#fdfcf8]">
                            {parseSender(selectedEmail.sender).name}
                          </span>
                          {parseSender(selectedEmail.sender).email && (
                            <span className="text-xs text-[#737688] dark:text-[#7D8681] font-mono">
                              &lt;{parseSender(selectedEmail.sender).email}&gt;
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#737688] dark:text-[#7D8681] mt-0.5 flex items-center gap-1 font-mono">
                          <span>to</span>
                          <span className="text-[#434656] dark:text-[#A0A7A3]">me</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-[#737688] dark:text-[#7D8681] font-mono flex items-center gap-1.5 shrink-0">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatFullDate(selectedEmail.date)}</span>
                    </div>
                  </div>

                  {/* Email Body Container */}
                  <div className="bg-white dark:bg-[#121614] text-[#2a2c2c] dark:text-[#d0d0d0] p-6 rounded border border-[#D5D5CE] dark:border-[#29342F] font-sans leading-relaxed space-y-4 shadow-sm">
                    <div className="text-sm">
                      <p className="whitespace-pre-wrap">{selectedEmail.snippet}</p>
                    </div>

                    <div className="pt-6 border-t border-[#D5D5CE] dark:border-[#29342F] text-[11px] font-mono text-[#737688] dark:text-[#7D8681] flex items-center justify-between">
                      <span>RFC 822 MIME Identifier: {selectedEmail.id}</span>
                      <button
                        onClick={() => handleAnalyze(selectedEmail)}
                        className="text-[#0052ff] dark:text-[#3b82f6] hover:underline"
                      >
                        Deep forensic extraction →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="hidden lg:flex flex-1 items-center justify-center p-12 text-center text-xs font-mono text-[#737688] dark:text-[#7D8681]">
              <div className="max-w-sm space-y-3">
                <div className="w-12 h-12 rounded-full bg-[#EAEAE5] dark:bg-[#15181b] border border-[#D5D5CE] dark:border-[#333] flex items-center justify-center text-[#737688] dark:text-[#7D8681] mx-auto shadow-sm">
                  <Mail className="w-6 h-6" />
                </div>
                <p className="font-bold text-[#1a1c1c] dark:text-[#fdfcf8]">No email selected</p>
                <p>Select an email from the list to inspect metadata and initiate forensic analysis.</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Ingestion Modal Dialog */}
      <ForensicIngestionModal
        isOpen={isIngestionModalOpen}
        onClose={() => {
          setIsIngestionModalOpen(false);
          checkStatus().then((conn) => {
            if (conn) fetchMessages(searchQuery);
          });
        }}
        onJobCreated={(jobId, fileName) => {
          router.push(`/forensic-analysis?jobId=${jobId}&fileName=${encodeURIComponent(fileName)}`);
        }}
      />
    </div>
  );
}
