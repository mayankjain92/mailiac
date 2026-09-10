'use client';

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppHeader from '@/components/StitchLandingHeader';
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
  ExternalLink,
  Sparkles,
  User,
} from 'lucide-react';

import { decodeHtmlEntities } from '@/lib/utils';
import VerdictBadge from '@/components/VerdictBadge';
import { sessionFetch, getOrCreateSessionId, clearSession } from '@/lib/session';
import { useAuth } from '@/lib/auth';
import SignInRequiredState from '@/components/SignInRequiredState';

export interface GmailMessageSummary extends Partial<GmailMessageAnalysisEnrichment> {
  id: string;
  threadId?: string;
  sender: string;
  subject: string;
  date: string;
  snippet: string;
  unread?: boolean;
  messageIdHeader?: string;
  rawEml?: string;
}

export interface RecentReportItem {
  jobId: string;
  subject?: string;
  sender?: string;
  finalScore: number;
  verdict: 'QUARANTINE' | 'FLAG' | 'SAFE';
  timestamp?: string;
  createdAt?: string;
}

type MailboxFilter = 'inbox' | 'all' | 'quarantine' | 'suspicious' | 'safe' | 'unanalyzed';

const DEMO_SANDBOX_MESSAGES: GmailMessageSummary[] = [
  {
    id: 'demo-bec-wire-01',
    sender: 'CEO Executive <ceo@target-corp.com>',
    subject: 'URGENT: Immediate Wire Transfer Settlement Required',
    date: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    snippet: 'Team, I need an immediate wire transfer processed for vendor invoice settlement before 2 PM today. Open the attached confidential invoice and execute payment details.',
    unread: true,
    messageIdHeader: '<evil-phish-666@evil-domain.ru>',
    analyzed: true,
    verdict: 'QUARANTINE',
    finalScore: 94,
    rawEml: `Received: from relay.evil-spoofer.net (relay.evil-spoofer.net [203.0.113.200]) by mx.target.com; Tue, 25 Aug 2026 11:30:02 +0000
From: "CEO Executive" <ceo@target-corp.com>
To: "Finance Department" <accounting@target-corp.com>
Reply-To: "Executive Secretarial" <attacker-mailbox@evil-domain.ru>
Subject: URGENT: Immediate Wire Transfer Settlement Required
Date: Tue, 25 Aug 2026 11:30:00 +0000
Message-ID: <evil-phish-666@evil-domain.ru>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="MALICIOUS-BOUNDARY-999"

--MALICIOUS-BOUNDARY-999
Content-Type: text/html; charset="utf-8"

<html>
<body>
<p>Team,</p>
<p>I need an immediate wire transfer processed for vendor invoice settlement before 2 PM today.</p>
<p>Open the attached confidential invoice and execute payment details immediately.</p>
</body>
</html>
--MALICIOUS-BOUNDARY-999
Content-Type: application/x-msdownload; name="Invoice_Confidential.pdf.exe"
Content-Disposition: attachment; filename="Invoice_Confidential.pdf.exe"
Content-Transfer-Encoding: base64

TVqQAAMAAAAEAAAA//8AALgAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAA4fug4AtAnNIbgBTM0hVGhpcyBwcm9ncmFtIGNhbm5vdCBiZSBydW4gaW4gRE9TIG1vZGUuDQ0KJAAAAAAAAAA=
--MALICIOUS-BOUNDARY-999--
`,
  },
  {
    id: 'demo-dhl-trojan-02',
    sender: 'DHL Express Dispatch <tracking@dhl-express-dispatch.net>',
    subject: 'Delivery Exception: Parcel #US-98214 On Hold (Action Required)',
    date: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    snippet: 'We could not deliver your consignment due to an incomplete delivery address. Download the revised shipping manifest to confirm clearance.',
    unread: true,
    messageIdHeader: '<dhl-parcel-98214@dhl-express-dispatch.net>',
    analyzed: true,
    verdict: 'QUARANTINE',
    finalScore: 88,
    rawEml: `Received: from mail.dhl-express-dispatch.net (unknown [194.26.29.110]) by mx.target.com; Tue, 25 Aug 2026 09:15:00 +0000
From: "DHL Express Dispatch" <tracking@dhl-express-dispatch.net>
To: <target-user@target-corp.com>
Subject: Delivery Exception: Parcel #US-98214 On Hold (Action Required)
Date: Tue, 25 Aug 2026 09:15:00 +0000
Message-ID: <dhl-parcel-98214@dhl-express-dispatch.net>
MIME-Version: 1.0
Content-Type: text/html; charset="utf-8"

<html>
<body>
<p>Dear Customer,</p>
<p>Your package #US-98214 could not be delivered due to invalid recipient postal metadata.</p>
<p><a href="http://194.26.29.110/dhl-portal/clearance.html">Click here to update your delivery address</a> within 24 hours.</p>
</body>
</html>
`,
  },
  {
    id: 'demo-msft-phish-03',
    sender: 'Microsoft 365 Security <no-reply@security-msoffice365.com>',
    subject: 'Action Required: Organizational Password Expiration in 2 Hours',
    date: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    snippet: 'Your corporate password expires today. Retain your existing credentials by completing single sign-on re-verification immediately.',
    unread: false,
    messageIdHeader: '<msft-security-notice@security-msoffice365.com>',
    analyzed: true,
    verdict: 'FLAG',
    finalScore: 68,
    rawEml: `Received: from server2.security-msoffice365.com ([45.142.214.88]) by mx.target.com; Mon, 24 Aug 2026 16:40:00 +0000
From: "Microsoft 365 Security" <no-reply@security-msoffice365.com>
To: <target-user@target-corp.com>
Subject: Action Required: Organizational Password Expiration in 2 Hours
Date: Mon, 24 Aug 2026 16:40:00 +0000
Message-ID: <msft-security-notice@security-msoffice365.com>
MIME-Version: 1.0
Content-Type: text/html; charset="utf-8"

<html>
<body>
<p>Your Active Directory password will expire in 2 hours.</p>
<p>To continue using your current credentials without disruption, <a href="https://auth-msoffice365-verify.com/login">keep current password</a>.</p>
</body>
</html>
`,
  },
  {
    id: 'demo-chase-ach-04',
    sender: 'Chase Commercial Banking <alerts@secure-chase-notify.org>',
    subject: 'Suspicious ACH Ingress Hold - Reference #ACH-77189',
    date: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    snippet: 'An inbound ACH payment of $48,250.00 is currently placed on automated compliance hold. Identity clearance required.',
    unread: false,
    messageIdHeader: '<chase-alert-77189@secure-chase-notify.org>',
    analyzed: false,
    rawEml: `Received: from unknown ([193.106.191.24]) by mx.target.com; Sat, 22 Aug 2026 08:30:00 +0000
From: "Chase Commercial Banking" <alerts@secure-chase-notify.org>
To: <accounting@target-corp.com>
Subject: Suspicious ACH Ingress Hold - Reference #ACH-77189
Date: Sat, 22 Aug 2026 08:30:00 +0000
Message-ID: <chase-alert-77189@secure-chase-notify.org>
MIME-Version: 1.0
Content-Type: text/html; charset="utf-8"

<html>
<body>
<p>Attention Merchant Services,</p>
<p>An inbound ACH payment of $48,250.00 is held pending verification.</p>
<p>Please log into your treasury portal to acknowledge or return the funds.</p>
</body>
</html>
`,
  },
  {
    id: 'demo-github-safe-05',
    sender: 'GitHub <notifications@github.com>',
    subject: '[GitHub] Personal access token expiration reminder',
    date: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    snippet: 'A personal access token (classic) associated with mailiac-bot will expire in 7 days. Review your token settings on GitHub.',
    unread: false,
    messageIdHeader: '<github-pat-notice@github.com>',
    analyzed: true,
    verdict: 'SAFE',
    finalScore: 12,
    rawEml: `Received: from out-21.smtp.github.com (out-21.smtp.github.com [192.30.252.204]) by mx.target.com; Sun, 23 Aug 2026 14:10:00 +0000
Authentication-Results: mx.target.com; dkim=pass header.i=@github.com; spf=pass (mx.target.com: domain of support@github.com designates 192.30.252.204 as permitted sender)
From: "GitHub" <notifications@github.com>
To: <developer@target-corp.com>
Subject: [GitHub] Personal access token expiration reminder
Date: Sun, 23 Aug 2026 14:10:00 +0000
Message-ID: <github-pat-notice@github.com>
MIME-Version: 1.0
Content-Type: text/plain; charset="utf-8"

Hi developer,

Your personal access token (classic) mailiac-bot will expire in 7 days.
You can regenerate or delete this token at https://github.com/settings/tokens.
`,
  },
  {
    id: 'demo-soc-safe-06',
    sender: 'Enterprise Security Operations <soc@enterprise-defense.internal>',
    subject: 'Weekly Incident Response & Threat Metrics Briefing',
    date: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString(),
    snippet: 'Here is the summary of security events monitored across perimeter gateways, quarantined attachments, and internal posture reports for Week 34.',
    unread: false,
    messageIdHeader: '<soc-weekly-brief-34@enterprise-defense.internal>',
    analyzed: true,
    verdict: 'SAFE',
    finalScore: 8,
    rawEml: `Received: from internal-smtp.enterprise-defense.internal ([10.0.4.12]) by mx.target.com; Fri, 21 Aug 2026 17:00:00 +0000
From: "Enterprise Security Operations" <soc@enterprise-defense.internal>
To: <security-team@target-corp.com>
Subject: Weekly Incident Response & Threat Metrics Briefing
Date: Fri, 21 Aug 2026 17:00:00 +0000
Message-ID: <soc-weekly-brief-34@enterprise-defense.internal>
MIME-Version: 1.0
Content-Type: text/plain; charset="utf-8"

Team,

This is the scheduled weekly SOC briefing.
All gateway security appliances reported normal baseline metrics with zero confirmed lateral intrusions.
`,
  },
];

function MailboxContent(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: isAuthLoading, login: loginWithGoogle, openSignInModal } = useAuth();

  // State
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [messages, setMessages] = useState<GmailMessageSummary[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<MailboxFilter>('inbox');
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [selectedCheckboxIds, setSelectedCheckboxIds] = useState<Set<string>>(new Set());
  const [recentReports, setRecentReports] = useState<RecentReportItem[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [analyzingMessageId, setAnalyzingMessageId] = useState<string | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // User switching & logout isolation: clear all user-specific state when user ID changes
  useEffect(() => {
    if (!isDemoMode) {
      setMessages([]);
      setSelectedEmailId(null);
      setSelectedCheckboxIds(new Set());
      setRecentReports([]);
      setSearchQuery('');
      setError(null);
      setIsConnected(null);
      setConnectedEmail(null);
    }
  }, [user?.id, isDemoMode]);

  // Check connection status
  const checkStatus = useCallback(async (): Promise<boolean> => {
    try {
      const res = await sessionFetch('/api/gmail/status');
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

  // Fetch messages from Gmail or Sandbox
  const fetchMessages = useCallback(
    async (query = '', pageToken?: string): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        if (isDemoMode) {
          const q = query.trim().toLowerCase();
          if (!q) {
            setMessages(DEMO_SANDBOX_MESSAGES);
          } else {
            setMessages(
              DEMO_SANDBOX_MESSAGES.filter(
                (m) =>
                  m.subject.toLowerCase().includes(q) ||
                  m.sender.toLowerCase().includes(q) ||
                  m.snippet.toLowerCase().includes(q)
              )
            );
          }
          return;
        }

        const params = new URLSearchParams();
        if (query.trim()) params.append('q', query.trim());
        if (pageToken) params.append('pageToken', pageToken);
        params.append('maxResults', '30');

        const res = await sessionFetch(`/api/gmail/messages?${params.toString()}`);
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
    [isDemoMode]
  );

  // Initial load
  useEffect(() => {
    getOrCreateSessionId();
    const isDemoRequested = searchParams.get('demo') === 'true';
    if (isDemoRequested) {
      setIsDemoMode(true);
      setIsConnected(true);
      setConnectedEmail('sandbox-audit@mailiac.security');
      setMessages(DEMO_SANDBOX_MESSAGES);
      setSelectedEmailId(DEMO_SANDBOX_MESSAGES[0].id);
      setIsLoading(false);
      return;
    }

    if (isAuthLoading) return;

    if (!user) {
      setIsConnected(false);
      setConnectedEmail(null);
      setMessages([]);
      setIsLoading(false);
      return;
    }

    checkStatus().then((connected) => {
      if (connected) {
        fetchMessages();
      } else {
        setIsLoading(false);
      }
    });
  }, [checkStatus, fetchMessages, searchParams, user, isAuthLoading]);

  // Connect Gmail account
  const handleConnectGmail = async (): Promise<void> => {
    if (!user) {
      openSignInModal('You need to sign in to connect your Gmail account.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const res = await sessionFetch('/api/gmail/auth/url');
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to obtain Google authentication URL');
      }
      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication initiation failed';
      setError(msg);
      setIsLoading(false);
    }
  };

  // Disconnect account or exit sandbox
  const handleDisconnect = async (): Promise<void> => {
    if (isDemoMode) {
      setIsDemoMode(false);
      setIsConnected(false);
      setConnectedEmail(null);
      setMessages([]);
      setSelectedEmailId(null);
      return;
    }

    if (!confirm('Are you sure you want to disconnect your Gmail account from Mailiac?')) return;
    setIsDisconnecting(true);
    setError(null);
    try {
      const res = await sessionFetch('/api/gmail/disconnect', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to disconnect Gmail account');
      clearSession();
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
      if (isDemoMode || message.rawEml || message.id.startsWith('demo-')) {
        const rawContent =
          message.rawEml ||
          DEMO_SANDBOX_MESSAGES.find((m) => m.id === message.id)?.rawEml ||
          '';

        const blob = new Blob([rawContent], { type: 'message/rfc822' });
        const cleanName = `${message.subject.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 36)}.eml`;
        const sampleFile = new File([blob], cleanName, { type: 'message/rfc822' });

        const formData = new FormData();
        formData.append('eml', sampleFile);

        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!uploadRes.ok) {
          throw new Error('Sandbox email ingestion failed');
        }

        const data = (await uploadRes.json()) as { jobId: string };
        router.push(
          `/forensic-analysis?jobId=${encodeURIComponent(data.jobId)}&fileName=${encodeURIComponent(
            sampleFile.name
          )}`
        );
        return;
      }

      const res = await sessionFetch(`/api/gmail/messages/${message.id}/analyze`, {
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

      // Navigate to real-time sequential pipeline execution console
      router.push(
        `/forensic-analysis?jobId=${encodeURIComponent(data.jobId)}&fileName=${encodeURIComponent(
          message.subject || 'Gmail Forensics Sample'
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
    let quarantine = 0;
    let suspicious = 0;
    let safe = 0;
    let unanalyzed = 0;

    for (const msg of messages) {
      if (!msg.analyzed) {
        unanalyzed++;
      } else if (msg.verdict === 'QUARANTINE' || (typeof msg.finalScore === 'number' && msg.finalScore >= 70)) {
        quarantine++;
      } else if (msg.verdict === 'FLAG' || (typeof msg.finalScore === 'number' && msg.finalScore >= 30)) {
        suspicious++;
      } else {
        safe++;
      }
    }

    return {
      inbox: messages.length,
      all: messages.length,
      quarantine,
      suspicious,
      safe,
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
        case 'quarantine':
          return msg.analyzed && (msg.verdict === 'QUARANTINE' || (typeof msg.finalScore === 'number' && msg.finalScore >= 70));
        case 'suspicious':
          return msg.analyzed && (msg.verdict === 'FLAG' || (typeof msg.finalScore === 'number' && msg.finalScore >= 30 && msg.finalScore < 70));
        case 'safe':
          return msg.analyzed && (msg.verdict === 'SAFE' || (typeof msg.finalScore === 'number' && msg.finalScore < 30));
        case 'unanalyzed':
          return !msg.analyzed;
        default:
          return true;
      }
    });
  }, [messages, activeFilter]);

  // Fetch recent forensic reports from backend API (capped at 5)
  const fetchRecentReports = useCallback(async (): Promise<void> => {
    if (!user && !isDemoMode) {
      setRecentReports([]);
      return;
    }
    try {
      const res = await sessionFetch('/api/reports/history?limit=5');
      if (res.ok) {
        const data = await res.json();
        const records: RecentReportItem[] = Array.isArray(data?.records)
          ? data.records
          : Array.isArray(data)
          ? data
          : [];
        setRecentReports(records.slice(0, 5));
      } else {
        setRecentReports([]);
      }
    } catch {
      // Graceful fallback on network glitch
      setRecentReports([]);
    }
  }, [user, isDemoMode]);

  useEffect(() => {
    if (user || isDemoMode) {
      fetchRecentReports();
    } else {
      setRecentReports([]);
    }
  }, [fetchRecentReports, user, isDemoMode]);

  // Selected email object
  const selectedEmail = useMemo(() => {
    return messages.find((m) => m.id === selectedEmailId) || null;
  }, [messages, selectedEmailId]);

  // Helper to parse sender display name and email address
  const parseSender = (senderStr: string): { name: string; email: string } => {
    if (!senderStr) return { name: 'Unknown', email: '' };
    const decoded = decodeHtmlEntities(senderStr);
    const match = decoded.match(/^(.*?)\s*<([^>]+)>$/);
    if (match) {
      return { name: match[1].replace(/["']/g, '').trim() || match[2], email: match[2] };
    }
    return { name: decoded, email: decoded };
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
      {/* Unified App Header */}
      <AppHeader
        onJobCreated={(jobId, fileName) => {
          router.push(
            `/forensic-analysis?jobId=${encodeURIComponent(jobId)}&fileName=${encodeURIComponent(
              fileName || 'Uploaded EML Sample'
            )}`
          );
        }}
      />

      {/* Mailbox Sub-Toolbar */}
      <div className="bg-[#F2F2EE] dark:bg-[#0b0b0b] flex items-center justify-between w-full px-4 py-2 shrink-0 z-30 border-b border-[#D5D5CE] dark:border-[#29342F] h-[52px] transition-colors">
        {/* Left: Sidebar toggle + Mailbox label */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1.5 text-[#737688] dark:text-[#A0A7A3] hover:bg-[#EAEAE5] dark:hover:bg-[#202124] rounded-md transition-colors focus:outline-none"
            title="Toggle Sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold uppercase tracking-wider text-[#434656] dark:text-[#A0A7A3]">
            Inbox Viewer
          </span>
        </div>

        {/* Center: Search Bar */}
        <div className="flex-1 max-w-[600px] mx-4">
          <form
            onSubmit={handleSearchSubmit}
            className="relative flex items-center bg-white dark:bg-[#151A17] rounded-full overflow-hidden focus-within:ring-1 focus-within:ring-[#0052ff] dark:focus-within:ring-[#3b82f6] transition-all border border-[#D5D5CE] dark:border-[#29342F] shadow-sm h-8"
          >
            <button
              type="submit"
              className="p-1.5 text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#fdfcf8] pl-3 focus:outline-none"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search mail (e.g. from:paypal, invoice, subject:urgent)..."
              className="bg-transparent border-none w-full px-2 py-1 text-xs text-[#1a1c1c] dark:text-[#fdfcf8] placeholder-[#737688] dark:placeholder-[#7D8681] focus:outline-none focus:ring-0"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  fetchMessages('');
                }}
                className="p-1 text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#fdfcf8] pr-2.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </form>
        </div>

        {/* Right: Mailbox-specific Connection Status / Actions */}
        <div className="flex items-center gap-2">
          {isDemoMode ? (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 border border-[#0052ff]/30 dark:border-[#3b82f6]/40 rounded-full text-[10px] font-bold text-[#0052ff] dark:text-[#3b82f6]"
              title="Interactive Sandbox Mailbox Environment"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#0052ff] dark:bg-[#3b82f6] animate-pulse"></span>
              <span>SANDBOX</span>
            </div>
          ) : isConnected ? (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/10 border border-green-500/30 rounded-full text-[10px] font-bold text-green-700 dark:text-green-400"
              title={connectedEmail ? `Connected: ${connectedEmail}` : 'Gmail Connected'}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              <span className="hidden sm:inline">Connected</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleConnectGmail}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-full text-[10px] font-bold text-amber-700 dark:text-amber-400 transition-colors"
              title="Connect your Gmail account"
            >
              <Mail className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              <span>Connect Gmail</span>
            </button>
          )}

          {(isConnected || isDemoMode) && (
            <button
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-[#737688] dark:text-[#A0A7A3] hover:text-[#ef4444] hover:bg-[#ef4444]/10 rounded border border-transparent hover:border-[#ef4444]/30 transition-colors disabled:opacity-50 font-medium"
              title={isDemoMode ? 'Exit Sandbox Mailbox' : 'Disconnect Gmail Account'}
            >
              {isDisconnecting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <LogOut className="w-3 h-3" />
              )}
              <span className="hidden sm:inline">Disconnect</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Mailbox Content Area */}
      <div className="flex flex-1 overflow-hidden bg-[#F2F2EE] dark:bg-[#0b0b0b]">
        {/* Left Sidebar */}
        <aside
          className={`${
            isSidebarOpen ? 'w-60' : 'w-0 hidden'
          } flex flex-col h-full shrink-0 z-40 bg-[#F2F2EE] dark:bg-[#0b0b0b] pt-3 pr-2 transition-all duration-200 border-r border-[#D5D5CE] dark:border-[#29342F] select-none`}
        >
          <nav className="flex-1 overflow-y-auto space-y-1 text-xs">
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
              <span className="text-[11px] opacity-80">{counts.all}</span>
            </button>

            {/* Mailiac Security Filters */}
            <div className="pt-5 pb-1">
              <div className="px-5 text-[10px] font-bold text-[#737688] dark:text-[#7D8681] uppercase tracking-widest mb-1.5">
                MAILIAC SECURITY
              </div>

              <button
                onClick={() => setActiveFilter('quarantine')}
                className={`w-full flex items-center justify-between px-5 py-2 rounded-r-full transition-colors ${
                  activeFilter === 'quarantine'
                    ? 'bg-red-500/10 dark:bg-[#ef4444]/20 text-red-600 dark:text-[#ef4444] font-bold border-l-2 border-red-600 dark:border-[#ef4444]'
                    : 'text-red-600 dark:text-[#ef4444] hover:bg-red-500/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Quarantine</span>
                </div>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/15 text-red-600 dark:text-[#ef4444] font-bold">
                  {counts.quarantine}
                </span>
              </button>

              <button
                onClick={() => setActiveFilter('suspicious')}
                className={`w-full flex items-center justify-between px-5 py-2 rounded-r-full transition-colors ${
                  activeFilter === 'suspicious'
                    ? 'bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 font-bold border-l-2 border-amber-600 dark:border-amber-500'
                    : 'text-amber-700 dark:text-amber-400 hover:bg-amber-500/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Suspicious</span>
                </div>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 font-bold">
                  {counts.suspicious}
                </span>
              </button>

              <button
                onClick={() => setActiveFilter('safe')}
                className={`w-full flex items-center justify-between px-5 py-2 rounded-r-full transition-colors ${
                  activeFilter === 'safe'
                    ? 'bg-emerald-500/10 dark:bg-green-500/20 text-emerald-700 dark:text-green-400 font-bold border-l-2 border-emerald-600 dark:border-green-500'
                    : 'text-emerald-700 dark:text-green-400 hover:bg-emerald-500/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Safe</span>
                </div>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-green-400 font-bold">
                  {counts.safe}
                </span>
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
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#EAEAE5] dark:bg-[#333] text-[#434656] dark:text-[#A0A7A3] font-bold border border-[#D5D5CE] dark:border-transparent">
                  {counts.unanalyzed}
                </span>
              </button>
            </div>

            {/* Recent Investigations Section (Capped at 5) */}
            <div className="pt-6 pb-2">
              <div className="px-5 text-[10px] font-bold text-[#737688] dark:text-[#7D8681] uppercase tracking-widest mb-2 flex items-center justify-between">
                <span>RECENT INVESTIGATIONS</span>
                <span className="text-[9px] opacity-60">LAST 5</span>
              </div>

              {recentReports.length === 0 ? (
                <div className="px-5 py-1.5 text-[11px] text-[#737688] dark:text-[#656464]">
                  No recent investigations
                </div>
              ) : (
                <div className="space-y-1">
                  {recentReports.map((report) => (
                    <Link
                      key={report.jobId}
                      href={`/analysis-console/${encodeURIComponent(report.jobId)}/evidence`}
                      className="w-full flex flex-col px-4 py-2 rounded hover:bg-[#EAEAE5] dark:hover:bg-[#1B211E] transition-colors group text-left border border-transparent hover:border-[#D5D5CE] dark:hover:border-[#29342F]"
                      title={report.subject || '(No Subject)'}
                    >
                      <div className="flex items-center justify-between gap-1.5 mb-1">
                        <VerdictBadge
                          verdict={report.verdict}
                          score={report.finalScore}
                          size="sm"
                        />
                        <span className="text-[10px] text-[#737688] dark:text-[#7D8681] shrink-0">
                          {formatTimestamp(report.timestamp || report.createdAt || '')}
                        </span>
                      </div>
                      <span className="truncate text-xs text-[#333] dark:text-[#d0d0d0] group-hover:text-[#0052ff] dark:group-hover:text-[#3b82f6] transition-colors">
                        {decodeHtmlEntities(report.subject || '') || '(No Subject)'}
                      </span>
                    </Link>
                  ))}

                  <div className="pt-2 px-3 mt-1 border-t border-[#D5D5CE]/50 dark:border-[#29342F]/50">
                    <Link
                      href="/history"
                      className="text-[10px] text-[#0052ff] dark:text-[#3b82f6] hover:underline flex items-center justify-between font-bold uppercase tracking-wider"
                    >
                      <span>View full audit log</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </nav>

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
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[#434656] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#fdfcf8] hover:bg-[#EAEAE5] dark:hover:bg-[#202124] rounded transition-colors text-[11px] border border-[#D5D5CE] dark:border-[#29342F]"
                  title="Sync Inbox"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>Sync Inbox</span>
                </button>

                <span className="text-[11px] font-bold uppercase text-[#737688] dark:text-[#7D8681] tracking-wider ml-1">
                  {activeFilter} ({filteredMessages.length})
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-[#737688] dark:text-[#A0A7A3]">
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
                      className="p-1 text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#fdfcf8] hover:bg-[#EAEAE5] dark:hover:bg-[#202124] rounded transition-colors text-[11px] flex items-center gap-1"
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
                <div className="py-24 text-center text-xs text-[#737688] dark:text-[#A0A7A3] flex flex-col items-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-[#0052ff] dark:text-[#3b82f6]" />
                  <span>Loading Gmail mailbox intelligence...</span>
                </div>
              ) : !user && !isDemoMode ? (
                <div className="py-20 px-6 text-center max-w-lg mx-auto space-y-5">
                  <div className="w-14 h-14 rounded-full bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 flex items-center justify-center text-[#0052ff] dark:text-[#3b82f6] mx-auto">
                    <Shield className="w-7 h-7" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-[#1a1c1c] dark:text-[#fdfcf8]">
                      Sign in with Google to access Gmail Forensics
                    </h3>
                    <p className="text-xs text-[#434656] dark:text-[#A0A7A3] leading-relaxed max-w-md mx-auto">
                      Mailiac requires user identity authentication before synchronizing mailboxes or executing security scans. Sign in to your account to continue.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => loginWithGoogle()}
                      className="w-full sm:w-auto bg-[#0052ff] hover:bg-[#004ced] dark:bg-[#3b82f6] dark:hover:bg-[#2563eb] text-white text-xs font-semibold px-5 py-3 rounded shadow-sm inline-flex items-center justify-center gap-2 transition-colors"
                    >
                      <User className="w-4 h-4" />
                      <span>Sign in with Google</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsDemoMode(true);
                        setIsConnected(true);
                        setConnectedEmail('sandbox-audit@mailiac.security');
                        setMessages(DEMO_SANDBOX_MESSAGES);
                        setSelectedEmailId(DEMO_SANDBOX_MESSAGES[0].id);
                      }}
                      className="w-full sm:w-auto border border-[#D5D5CE] dark:border-[#29342F] bg-white dark:bg-[#151A17] text-[#1a1c1c] dark:text-[#F2F2EE] text-xs font-semibold px-5 py-3 rounded hover:bg-[#EAEAE5] dark:hover:bg-[#202124] inline-flex items-center justify-center gap-2 transition-colors"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>⚡ Launch Sandbox Mailbox</span>
                    </button>
                  </div>
                </div>
              ) : !isConnected ? (
                !user && !isDemoMode ? (
                  <SignInRequiredState
                    title="Sign in required to access Gmail Forensics"
                    description="Connect your Google Workspace or Gmail account to inspect email headers, scan message attachments, and run automated forensic threat analysis."
                    actionText="Sign in with Google"
                    secondaryAction={
                      <button
                        type="button"
                        onClick={() => {
                          setIsDemoMode(true);
                          setIsConnected(true);
                          setConnectedEmail('sandbox-audit@mailiac.security');
                          setMessages(DEMO_SANDBOX_MESSAGES);
                          setSelectedEmailId(DEMO_SANDBOX_MESSAGES[0].id);
                        }}
                        className="w-full sm:w-auto border border-[#D5D5CE] dark:border-[#29342F] bg-white dark:bg-[#151A17] text-[#1a1c1c] dark:text-[#F2F2EE] text-xs font-semibold px-5 py-3 rounded hover:bg-[#EAEAE5] dark:hover:bg-[#202124] inline-flex items-center justify-center gap-2 transition-colors"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>⚡ Launch Sandbox Mailbox</span>
                      </button>
                    }
                  />
                ) : (
                  <div className="py-20 px-6 text-center max-w-lg mx-auto space-y-5">
                    <div className="w-14 h-14 rounded-full bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 flex items-center justify-center text-[#0052ff] dark:text-[#3b82f6] mx-auto">
                      <Mail className="w-7 h-7" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-bold text-[#1a1c1c] dark:text-[#fdfcf8]">
                        Connect Gmail
                      </h3>
                      <p className="text-xs text-[#434656] dark:text-[#A0A7A3] leading-relaxed max-w-md mx-auto">
                        Connect your Google Workspace or Gmail account with read-only permissions to inspect email headers, scan message attachments, and run automated forensic threat analysis.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleConnectGmail}
                        className="w-full sm:w-auto bg-[#0052ff] hover:bg-[#004ced] dark:bg-[#3b82f6] dark:hover:bg-[#2563eb] text-white text-xs font-semibold px-5 py-3 rounded shadow-sm inline-flex items-center justify-center gap-2 transition-colors"
                      >
                        <Mail className="w-4 h-4" />
                        <span>Connect Gmail</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsDemoMode(true);
                          setIsConnected(true);
                          setConnectedEmail('sandbox-audit@mailiac.security');
                          setMessages(DEMO_SANDBOX_MESSAGES);
                          setSelectedEmailId(DEMO_SANDBOX_MESSAGES[0].id);
                        }}
                        className="w-full sm:w-auto border border-[#D5D5CE] dark:border-[#29342F] bg-white dark:bg-[#151A17] text-[#1a1c1c] dark:text-[#F2F2EE] text-xs font-semibold px-5 py-3 rounded hover:bg-[#EAEAE5] dark:hover:bg-[#202124] inline-flex items-center justify-center gap-2 transition-colors"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>⚡ Launch Sandbox Mailbox</span>
                      </button>
                    </div>
                  </div>
                )
              ) : filteredMessages.length === 0 ? (
                <div className="py-24 text-center text-xs text-[#737688] dark:text-[#7D8681] space-y-2">
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
                      className={`email-row flex items-center px-4 py-2.5 cursor-pointer text-xs transition-colors relative group select-none ${
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
                        className={`w-36 shrink-0 truncate text-xs pr-2 ${
                          isSelected || msg.unread ? 'font-bold text-[#1a1c1c] dark:text-[#fdfcf8]' : 'text-[#434656] dark:text-[#A0A7A3]'
                        }`}
                      >
                        {senderName}
                      </div>

                      {/* Subject + Snippet + Security Badge */}
                      <div className="flex items-center flex-1 min-w-0 mr-3 gap-2">
                        {/* Security Tag */}
                        {msg.analyzed ? (
                          <VerdictBadge
                            verdict={msg.verdict}
                            score={msg.finalScore}
                            size="sm"
                          />
                        ) : (
                          <span
                            title="Unanalyzed email · Click to run forensic pipeline"
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#EAEAE5] dark:bg-[#202124] text-[#555] dark:text-[#737688] border border-[#D5D5CE] dark:border-[#333] shrink-0 uppercase tracking-wider cursor-help"
                          >
                            [UNANALYZED]
                          </span>
                        )}

                        <span
                          className={`truncate text-xs shrink-0 max-w-[65%] ${
                            isSelected || msg.unread
                              ? 'font-bold text-[#1a1c1c] dark:text-[#fdfcf8]'
                              : 'font-medium text-[#1a1c1c] dark:text-[#E0E2EC]'
                          }`}
                        >
                          {decodeHtmlEntities(msg.subject) || '(No Subject)'}
                        </span>

                        <span className="text-[#737688] dark:text-[#656464] truncate text-xs hidden md:inline flex-1 min-w-0">
                          — {decodeHtmlEntities(msg.snippet)}
                        </span>
                      </div>

                      {/* Timestamp */}
                      <div className="text-[11px] text-[#737688] dark:text-[#7D8681] shrink-0 w-16 text-right group-hover:hidden">
                        {formatTimestamp(msg.date)}
                      </div>

                      {/* Row Hover Quick Actions */}
                      <div className="row-actions absolute right-3 top-1/2 -translate-y-1/2 bg-[#E8F0FE] dark:bg-[#1e232b] pl-2 gap-2 hidden group-hover:flex items-center z-10">
                        {msg.analyzed && msg.jobId ? (
                          <Link
                            href={`/analysis-console/${msg.jobId}/evidence`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] font-bold text-[#0052ff] dark:text-[#3b82f6] border border-[#0052ff]/40 dark:border-[#3b82f6]/40 bg-[#0052ff]/10 px-2 py-1 rounded hover:bg-[#0052ff]/20 flex items-center gap-1 transition-colors uppercase tracking-wider"
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
                            className="text-[10px] font-bold text-white border border-[#0052ff] bg-[#0052ff] px-2 py-1 rounded hover:bg-[#004ced] flex items-center gap-1 transition-colors uppercase tracking-wider disabled:opacity-50"
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
                  <span className="text-xs text-[#737688] dark:text-[#7D8681]">Email Inspection</span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  {selectedEmail.analyzed && selectedEmail.jobId && (
                    <Link
                      href={`/analysis-console/${selectedEmail.jobId}/evidence`}
                      className="text-xs font-bold text-[#0052ff] dark:text-[#3b82f6] hover:underline inline-flex items-center gap-1"
                    >
                      <span>Full Evidence Explorer</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
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
                        <span className="text-xs font-bold uppercase tracking-wider">
                          ⚠ QUARANTINE · RISK {selectedEmail.finalScore ?? 87}/100
                        </span>
                      </div>
                      <Link
                        href={`/analysis-console/${selectedEmail.jobId}/evidence`}
                        className="text-[11px] font-bold border border-red-600 dark:border-[#ef4444] px-3 py-1 rounded bg-red-600 dark:bg-transparent text-white dark:text-[#ef4444] hover:bg-red-700 dark:hover:bg-[#ef4444] dark:hover:text-white transition-colors uppercase tracking-wider flex items-center gap-1"
                      >
                        View Forensic Report <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  ) : selectedEmail.verdict === 'FLAG' ||
                    (typeof selectedEmail.finalScore === 'number' && selectedEmail.finalScore >= 30) ? (
                    <div className="bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/20 px-6 py-3 flex justify-between items-center text-amber-700 dark:text-amber-400 animate-fadeIn">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <span className="text-xs font-bold uppercase tracking-wider">
                          ⚠ SUSPICIOUS · RISK {selectedEmail.finalScore ?? 45}/100
                        </span>
                      </div>
                      <Link
                        href={`/analysis-console/${selectedEmail.jobId}/evidence`}
                        className="text-[11px] font-bold border border-amber-600 dark:border-amber-500 px-3 py-1 rounded bg-amber-600 dark:bg-transparent text-white dark:text-amber-400 hover:bg-amber-700 dark:hover:bg-amber-500 dark:hover:text-black transition-colors uppercase tracking-wider flex items-center gap-1"
                      >
                        View Report <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  ) : (
                    <div className="bg-emerald-50 dark:bg-green-500/10 border-b border-emerald-200 dark:border-green-500/20 px-6 py-3 flex justify-between items-center text-emerald-700 dark:text-green-400 animate-fadeIn">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-wider">
                          ✓ SAFE · RISK {selectedEmail.finalScore ?? 12}/100
                        </span>
                      </div>
                      <Link
                        href={`/analysis-console/${selectedEmail.jobId}/evidence`}
                        className="text-[11px] font-bold border border-emerald-600 dark:border-green-500 px-3 py-1 rounded bg-emerald-600 dark:bg-transparent text-white dark:text-green-400 hover:bg-emerald-700 dark:hover:bg-green-500 dark:hover:text-black transition-colors uppercase tracking-wider flex items-center gap-1"
                      >
                        View Report <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  )
                ) : (
                  <div className="bg-[#0052ff]/5 dark:bg-[#0052ff]/10 border-b border-[#0052ff]/20 px-6 py-3 flex justify-between items-center text-[#0052ff] dark:text-[#3b82f6]">
                    <div className="flex items-center gap-3">
                      <HelpCircle className="w-5 h-5 shrink-0" />
                      <span className="text-xs font-bold uppercase tracking-wider">
                        MAILIAC ANALYSIS: This email has not been analyzed yet.
                      </span>
                    </div>
                    <button
                      onClick={() => handleAnalyze(selectedEmail)}
                      disabled={analyzingMessageId === selectedEmail.id}
                      className="text-[11px] font-bold border border-[#0052ff] bg-[#0052ff] hover:bg-[#004ced] dark:bg-[#3b82f6] dark:hover:bg-[#2563eb] text-white px-3 py-1.5 rounded transition-colors uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                    >
                      {analyzingMessageId === selectedEmail.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Deconstructing...</span>
                        </>
                      ) : (
                        <>
                          <span>Analyze Email</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Email Metadata Details */}
                <div className="p-8 pb-4">
                  <h1 className="text-xl md:text-2xl font-bold text-[#1a1c1c] dark:text-[#fdfcf8] mb-6 leading-snug">
                    {decodeHtmlEntities(selectedEmail.subject) || '(No Subject)'}
                  </h1>

                  <div className="flex justify-between items-start mb-8 pb-6 border-b border-[#D5D5CE] dark:border-[#29342F]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#EAEAE5] dark:bg-[#202124] border border-[#D5D5CE] dark:border-[#333] text-[#1a1c1c] dark:text-[#fdfcf8] flex items-center justify-center font-bold text-sm shadow-sm">
                        {parseSender(selectedEmail.sender).name[0]?.toUpperCase() || 'U'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-[#1a1c1c] dark:text-[#fdfcf8]">
                            {parseSender(selectedEmail.sender).name}
                          </span>
                          {parseSender(selectedEmail.sender).email && (
                            <span className="text-xs text-[#737688] dark:text-[#7D8681]">
                              &lt;{parseSender(selectedEmail.sender).email}&gt;
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#737688] dark:text-[#7D8681] mt-0.5 flex items-center gap-1">
                          <span>to</span>
                          <span className="text-[#434656] dark:text-[#A0A7A3]">me</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-[#737688] dark:text-[#7D8681] flex items-center gap-1.5 shrink-0">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatFullDate(selectedEmail.date)}</span>
                    </div>
                  </div>

                  {/* Email Body Container */}
                  <div className="bg-white dark:bg-[#121614] text-[#2a2c2c] dark:text-[#d0d0d0] p-6 rounded border border-[#D5D5CE] dark:border-[#29342F] font-sans leading-relaxed space-y-4 shadow-sm">
                    <div className="text-sm">
                      <p className="whitespace-pre-wrap">{decodeHtmlEntities(selectedEmail.snippet)}</p>
                    </div>

                    <div className="pt-6 border-t border-[#D5D5CE] dark:border-[#29342F] text-[11px] text-[#737688] dark:text-[#7D8681] flex items-center justify-between">
                      <span className="font-mono">Message-ID: {selectedEmail.messageIdHeader || selectedEmail.id}</span>
                      <button
                        onClick={() => handleAnalyze(selectedEmail)}
                        className="text-[#0052ff] dark:text-[#3b82f6] hover:underline font-medium"
                      >
                        Deep forensic extraction →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="hidden lg:flex flex-1 items-center justify-center p-12 text-center text-xs text-[#737688] dark:text-[#7D8681]">
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

    </div>
  );
}

export default function MailboxPage(): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen h-screen flex flex-col items-center justify-center bg-[#F2F2EE] dark:bg-[#0b0b0b] text-[#737688] dark:text-[#A0A7A3] text-xs gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#0052ff] dark:text-[#3b82f6]" />
          <span>Loading Mailiac Mailbox Console...</span>
        </div>
      }
    >
      <MailboxContent />
    </Suspense>
  );
}
