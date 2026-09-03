'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  Search,
  RefreshCw,
  LogOut,
  AlertCircle,
  Loader2,
  X,
  ExternalLink,
  ShieldAlert,
  Clock,
  User,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

import type { GmailMessageAnalysisEnrichment } from '@mailiac/shared-types';
import { decodeHtmlEntities } from '@/lib/utils';
import VerdictBadge from '@/components/VerdictBadge';

export interface GmailMessageSummary extends Partial<GmailMessageAnalysisEnrichment> {
  id: string;
  threadId?: string;
  sender: string;
  subject: string;
  date: string;
  snippet: string;
}

interface GmailInboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJobCreated: (jobId: string, fileName: string) => void;
}

export default function GmailInboxModal({
  isOpen,
  onClose,
  onJobCreated,
}: GmailInboxModalProps): React.JSX.Element | null {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [messages, setMessages] = useState<GmailMessageSummary[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isDisconnecting, setIsDisconnecting] = useState<boolean>(false);
  const [analyzingMessageId, setAnalyzingMessageId] = useState<string | null>(null);
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
        params.append('maxResults', '20');

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
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error loading Gmail messages';
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // On modal open, verify status and load messages
  useEffect(() => {
    if (isOpen) {
      checkStatus().then((connected) => {
        if (connected) {
          fetchMessages(searchQuery);
        }
      });
    }
  }, [isOpen, checkStatus, fetchMessages, searchQuery]);

  // Initiate Google OAuth login
  const handleConnect = async (): Promise<void> => {
    setIsConnecting(true);
    setError(null);
    try {
      const res = await fetch('/api/gmail/auth/url');
      if (!res.ok) throw new Error('Failed to obtain Google authentication URL');
      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication initiation failed';
      setError(msg);
      setIsConnecting(false);
    }
  };

  // Disconnect account
  const handleDisconnect = async (): Promise<void> => {
    if (!confirm('Are you sure you want to disconnect your Gmail account?')) return;
    setIsDisconnecting(true);
    setError(null);
    try {
      const res = await fetch('/api/gmail/disconnect', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to disconnect Gmail account');
      setIsConnected(false);
      setConnectedEmail(null);
      setMessages([]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Disconnection failed';
      setError(msg);
    } finally {
      setIsDisconnecting(false);
    }
  };

  // Handle Search submit
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

      onJobCreated(data.jobId, message.subject || 'Gmail Forensics Sample');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to trigger forensic analysis';
      setError(msg);
    } finally {
      setAnalyzingMessageId(null);
    }
  };

  const formatDate = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#F2F2EE] dark:bg-[#1B211E] border border-[#D5D5CE] dark:border-[#29342F] rounded-lg shadow-2xl overflow-hidden bracket-tl bracket-br"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D5D5CE] dark:border-[#29342F] bg-[#EAEAE5] dark:bg-[#151A17]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 flex items-center justify-center text-[#0052ff] dark:text-[#3b82f6]">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#0052ff] dark:text-[#3b82f6]">
                  Gmail Ingestion Gateway
                </span>
                {isConnected && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#e8f5e9] dark:bg-[#1b3320] text-[#2e7d32] dark:text-[#81c784] border border-[#a5d6a7] dark:border-[#2e7d32]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#2e7d32] dark:bg-[#81c784] animate-pulse"></span>
                    CONNECTED
                  </span>
                )}
              </div>
              <p className="text-xs font-mono text-[#737688] dark:text-[#A0A7A3]">
                {connectedEmail ? `Active Session: ${connectedEmail}` : 'Connect your inbox for 1-click forensic analysis'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isConnected && (
              <button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="text-xs font-mono text-[#ba1a1a] dark:text-[#ffb4ab] hover:bg-[#ffdad6]/40 dark:hover:bg-[#410e0b]/40 px-3 py-1.5 rounded border border-[#ba1a1a]/30 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                title="Disconnect Google Account"
              >
                {isDisconnecting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <LogOut className="w-3 h-3" />
                )}
                Disconnect
              </button>
            )}
            <button
              onClick={onClose}
              className="text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#F2F2EE] p-1.5 rounded hover:bg-[#D5D5CE]/50 dark:hover:bg-[#29342F]/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 bg-[#ffdad6] dark:bg-[#410e0b] border border-[#ba1a1a]/30 rounded text-[#93000a] dark:text-[#ffb4ab] text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-[11px] underline ml-2"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* If NOT connected -> Connect CTA */}
          {isConnected === false && (
            <div className="py-12 px-6 text-center border-2 border-dashed border-[#D5D5CE] dark:border-[#29342F] rounded-lg bg-[#EAEAE5] dark:bg-[#151A17]">
              <div className="w-16 h-16 rounded-full bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 flex items-center justify-center text-[#0052ff] dark:text-[#3b82f6] mx-auto mb-4">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-[#1a1c1c] dark:text-[#F2F2EE] mb-2">
                Connect your Google Workspace / Gmail
              </h3>
              <p className="text-xs text-[#737688] dark:text-[#A0A7A3] max-w-md mx-auto mb-6">
                Mailiac requests strictly read-only permissions (<code className="font-mono text-[#0052ff] dark:text-[#3b82f6]">gmail.readonly</code>) to securely inspect suspicious email headers and raw MIME bytes.
              </p>
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="bg-[#0052ff] dark:bg-[#3b82f6] text-white text-xs font-semibold px-6 py-3 rounded hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors inline-flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connecting with Google...
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4" />
                    Connect Gmail Account
                  </>
                )}
              </button>
            </div>
          )}

          {/* If Connected -> Search & Message Table */}
          {isConnected && (
            <>
              {/* Search Bar & Quick Filters */}
              <div className="space-y-2">
                <form onSubmit={handleSearchSubmit} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#737688] dark:text-[#A0A7A3]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder='Filter emails (e.g. from:paypal, is:unread, subject:invoice)...'
                      className="w-full pl-9 pr-4 py-2 text-xs font-mono bg-[#EAEAE5] dark:bg-[#151A17] border border-[#D5D5CE] dark:border-[#29342F] rounded text-[#1a1c1c] dark:text-[#F2F2EE] placeholder-[#737688] focus:outline-none focus:border-[#0052ff] dark:focus:border-[#3b82f6]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="bg-[#0052ff] dark:bg-[#3b82f6] text-white text-xs font-mono font-semibold px-4 py-2 rounded hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    Search
                  </button>
                  <button
                    type="button"
                    onClick={() => fetchMessages(searchQuery)}
                    disabled={isLoading}
                    className="border border-[#D5D5CE] dark:border-[#29342F] text-[#434656] dark:text-[#A0A7A3] hover:bg-[#EAEAE5] dark:hover:bg-[#151A17] text-xs font-mono px-3 py-2 rounded transition-colors"
                    title="Refresh List"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  </button>
                </form>

                {/* Filter Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-mono">
                  <span className="text-[#737688] dark:text-[#A0A7A3] text-[10px] mr-1">Presets:</span>
                  {[
                    { label: 'All', q: '' },
                    { label: 'Unread', q: 'is:unread' },
                    { label: 'Has Attachments', q: 'has:attachment' },
                    { label: 'Security / Verification', q: 'verify OR security OR password' },
                    { label: 'Urgent', q: 'urgent OR suspended OR invoice' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => {
                        setSearchQuery(preset.q);
                        fetchMessages(preset.q);
                      }}
                      className={`px-2.5 py-1 rounded border transition-colors whitespace-nowrap ${
                        searchQuery === preset.q
                          ? 'bg-[#0052ff] dark:bg-[#3b82f6] text-white border-transparent'
                          : 'bg-[#EAEAE5] dark:bg-[#151A17] border-[#D5D5CE] dark:border-[#29342F] text-[#434656] dark:text-[#A0A7A3] hover:border-[#0052ff]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message Table / List */}
              <div className="border border-[#D5D5CE] dark:border-[#29342F] rounded bg-[#EAEAE5] dark:bg-[#151A17] overflow-hidden">
                {isLoading && messages.length === 0 ? (
                  <div className="py-16 text-center text-xs font-mono text-[#737688] dark:text-[#A0A7A3] flex flex-col items-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-[#0052ff] dark:text-[#3b82f6]" />
                    <span>Querying Gmail mailbox metadata...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-16 text-center text-xs font-mono text-[#737688] dark:text-[#A0A7A3]">
                    No matching emails found for this query.
                  </div>
                ) : (
                  <div className="divide-y divide-[#D5D5CE] dark:divide-[#29342F]">
                    {messages.map((msg) => {
                      const isAnalyzing = analyzingMessageId === msg.id;
                      return (
                        <div
                          key={msg.id}
                          className="p-3.5 hover:bg-[#F2F2EE] dark:hover:bg-[#1B211E] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-[#1a1c1c] dark:text-[#F2F2EE] truncate flex items-center gap-1.5 font-mono">
                                <User className="w-3 h-3 text-[#737688] dark:text-[#A0A7A3] shrink-0" />
                                {decodeHtmlEntities(msg.sender)}
                              </span>
                              {msg.analyzed && (
                                <VerdictBadge
                                  verdict={msg.verdict}
                                  score={msg.finalScore}
                                  size="sm"
                                />
                              )}
                              <span className="text-[10px] font-mono text-[#737688] dark:text-[#A0A7A3] flex items-center gap-1 shrink-0 ml-auto sm:ml-0">
                                <Clock className="w-3 h-3" />
                                {formatDate(msg.date)}
                              </span>
                            </div>

                            <p className="text-xs font-semibold text-[#1a1c1c] dark:text-[#F2F2EE] truncate">
                              {decodeHtmlEntities(msg.subject) || '(No Subject)'}
                            </p>

                            <p className="text-[11px] text-[#737688] dark:text-[#A0A7A3] line-clamp-1 font-mono">
                              {decodeHtmlEntities(msg.snippet)}
                            </p>
                          </div>

                          <div className="shrink-0 flex items-center gap-2">
                            {msg.analyzed && msg.jobId ? (
                              <>
                                <button
                                  onClick={() => {
                                    if (msg.jobId) {
                                      onJobCreated(msg.jobId, msg.subject || 'Gmail Forensics Sample');
                                      onClose();
                                    }
                                  }}
                                  className="w-full sm:w-auto bg-[#0052ff] dark:bg-[#3b82f6] text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors flex items-center justify-center gap-1 shadow-sm font-mono"
                                >
                                  <span>View Report</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleAnalyze(msg)}
                                  disabled={isAnalyzing || analyzingMessageId !== null}
                                  className="border border-[#D5D5CE] dark:border-[#29342F] text-[#434656] dark:text-[#A0A7A3] hover:bg-[#EAEAE5] dark:hover:bg-[#151A17] text-xs font-mono px-2.5 py-1.5 rounded transition-colors disabled:opacity-50"
                                  title="Re-run forensic analysis pipeline"
                                >
                                  {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Re-scan'}
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleAnalyze(msg)}
                                disabled={isAnalyzing || analyzingMessageId !== null}
                                className="w-full sm:w-auto bg-[#0052ff] dark:bg-[#3b82f6] text-white text-xs font-semibold px-3.5 py-1.5 rounded hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-sm"
                              >
                                {isAnalyzing ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>Deconstructing...</span>
                                  </>
                                ) : (
                                  <>
                                    <span>Analyze Forensics</span>
                                    <ArrowRight className="w-3 h-3" />
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pagination */}
              {nextPageToken && (
                <div className="text-center pt-2">
                  <button
                    onClick={() => fetchMessages(searchQuery, nextPageToken)}
                    disabled={isLoading}
                    className="text-xs font-mono text-[#0052ff] dark:text-[#3b82f6] hover:underline inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Load more emails →
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#D5D5CE] dark:border-[#29342F] bg-[#EAEAE5] dark:bg-[#151A17] flex items-center justify-between text-[11px] font-mono text-[#737688] dark:text-[#A0A7A3]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#2e7d32] dark:text-[#81c784]" />
            <span>Zero persistent storage of unanalyzed email bodies</span>
          </div>
          <button
            onClick={onClose}
            className="hover:text-[#1a1c1c] dark:hover:text-[#F2F2EE] underline"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
