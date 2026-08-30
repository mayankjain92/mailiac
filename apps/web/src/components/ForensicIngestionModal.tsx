'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  AlertCircle,
  Loader2,
  Mail,
  ArrowRight,
  Shield,
  X,
  HelpCircle,
} from 'lucide-react';

interface ForensicIngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJobCreated?: (jobId: string, fileName: string) => void;
}

export default function ForensicIngestionModal({
  isOpen,
  onClose,
  onJobCreated,
}: ForensicIngestionModalProps): React.JSX.Element | null {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isGmailConnected, setIsGmailConnected] = useState<boolean | null>(null);
  const [connectedGmailEmail, setConnectedGmailEmail] = useState<string | null>(null);
  const [showHelpOverlay, setShowHelpOverlay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check Gmail connection status
  const checkGmailStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/gmail/status');
      if (res.ok) {
        const data = (await res.json()) as { connected: boolean; email?: string };
        setIsGmailConnected(data.connected);
        setConnectedGmailEmail(data.email ?? null);
      } else {
        setIsGmailConnected(false);
      }
    } catch {
      setIsGmailConnected(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      checkGmailStatus();
      setError(null);
      setSelectedFile(null);
      setShowHelpOverlay(false);
    }
  }, [isOpen, checkGmailStatus]);

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent): void => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File): void => {
    setError(null);
    if (!file.name.toLowerCase().endsWith('.eml') && file.type !== 'message/rfc822') {
      setError('Please select a valid .eml email file.');
      return;
    }
    setSelectedFile(file);
  };

  // Upload .EML
  const handleUploadEml = async (): Promise<void> => {
    if (!selectedFile) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('eml', selectedFile);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Upload failed with status ${response.status}`);
      }

      const data = (await response.json()) as { jobId: string };
      if (!data.jobId) {
        throw new Error('No jobId returned from API server');
      }

      if (onJobCreated) {
        onJobCreated(data.jobId, selectedFile.name);
      } else {
        router.push(`/forensic-analysis?jobId=${data.jobId}&fileName=${encodeURIComponent(selectedFile.name)}`);
      }
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to upload .eml file.';
      setError(message);
    } finally {
      setIsUploading(false);
    }
  };

  // Connect Gmail or Navigate to /mailbox
  const handleGmailAction = async (): Promise<void> => {
    if (isGmailConnected) {
      onClose();
      router.push('/mailbox');
      return;
    }

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      {/* Main Modal Container */}
      <div
        className="relative z-20 w-full max-w-[820px] bg-[#F2F2EE] dark:bg-[#121614] border border-[#D5D5CE] dark:border-[#29342F] rounded-lg shadow-2xl flex flex-col overflow-hidden text-[#1a1c1c] dark:text-[#F2F2EE] forensic-card bracket-tl bracket-br transition-colors duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-6 right-6 text-[#737688] dark:text-[#A0A7A3] hover:text-[#0052ff] dark:hover:text-[#3b82f6] p-1.5 rounded-full hover:bg-[#EAEAE5] dark:hover:bg-[#1B211E] transition-colors focus:outline-none z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <header className="p-8 md:p-10 border-b border-[#D5D5CE] dark:border-[#29342F] bg-[#EAEAE5] dark:bg-[#151A17]">
          <p className="font-mono text-xs font-bold text-[#0052ff] dark:text-[#3b82f6] mb-2 tracking-widest uppercase">
            MAILIAC · FORENSIC INGESTION
          </p>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1a1c1c] dark:text-[#F2F2EE] tracking-tight mb-2">
            Analyze an email.
          </h1>
          <p className="text-sm text-[#434656] dark:text-[#A0A7A3] max-w-xl leading-relaxed">
            Choose how you want to submit an email for multi-stage forensic analysis.
          </p>
        </header>

        {/* Content Area */}
        <div className="p-6 md:p-8 flex-grow space-y-6">
          {error && (
            <div className="p-3.5 bg-[#ffdad6] dark:bg-[#410e0b] border border-[#ba1a1a]/30 rounded text-[#93000a] dark:text-[#ffb4ab] text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
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

          {/* Options Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Card 1: EML Upload */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`group relative flex flex-col border rounded p-6 transition-all duration-200 ${
                isDragging
                  ? 'border-[#0052ff] dark:border-[#3b82f6] bg-[#0052ff]/10 dark:bg-[#3b82f6]/20'
                  : 'border-[#D5D5CE] dark:border-[#29342F] bg-[#F2F2EE] dark:bg-[#1B211E] hover:border-[#0052ff] dark:hover:border-[#3b82f6]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".eml,message/rfc822"
                onChange={handleFileSelect}
                className="hidden"
              />

              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 flex items-center justify-center text-[#0052ff] dark:text-[#3b82f6]">
                  <FileText className="w-5 h-5" />
                </div>
                <span className="font-mono text-[10px] font-bold text-[#737688] dark:text-[#A0A7A3] uppercase tracking-wider">
                  LOCAL INGESTION
                </span>
              </div>

              <h2 className="text-base font-bold text-[#1a1c1c] dark:text-[#F2F2EE] mb-1">
                Upload .EML
              </h2>
              <p className="text-xs text-[#434656] dark:text-[#A0A7A3] mb-6 flex-grow leading-relaxed">
                Analyze a saved email file directly from your workstation. Drop file or select below.
              </p>

              {selectedFile ? (
                <div className="space-y-3">
                  <div className="p-3 bg-[#EAEAE5] dark:bg-[#151A17] rounded border border-[#D5D5CE] dark:border-[#29342F] flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-mono font-bold text-[#1a1c1c] dark:text-[#F2F2EE] truncate">
                        {selectedFile.name}
                      </p>
                      <p className="text-[11px] font-mono text-[#737688] dark:text-[#A0A7A3]">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedFile(null)}
                      className="text-xs text-[#737688] hover:text-[#ba1a1a]"
                    >
                      Change
                    </button>
                  </div>

                  <button
                    onClick={handleUploadEml}
                    disabled={isUploading}
                    className="w-full py-3 px-4 bg-[#0052ff] dark:bg-[#3b82f6] text-white text-xs font-semibold rounded hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Ingesting Payload...</span>
                      </>
                    ) : (
                      <>
                        <span>Start Forensic Analysis</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 px-4 bg-[#EAEAE5] dark:bg-[#151A17] border border-[#D5D5CE] dark:border-[#29342F] text-[#1a1c1c] dark:text-[#F2F2EE] text-xs font-semibold rounded hover:border-[#0052ff] dark:hover:border-[#3b82f6] hover:bg-[#0052ff] hover:text-white dark:hover:bg-[#3b82f6] dark:hover:text-white transition-all flex items-center justify-between group"
                >
                  <span>Choose .EML file</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </button>
              )}
            </div>

            {/* Card 2: Connect Gmail */}
            <div className="group relative flex flex-col border border-[#0052ff]/30 dark:border-[#3b82f6]/30 bg-[#0052ff]/5 dark:bg-[#3b82f6]/10 rounded p-6 transition-all duration-200">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 flex items-center justify-center text-[#0052ff] dark:text-[#3b82f6]">
                  <Mail className="w-5 h-5" />
                </div>
                <span className="font-mono text-[10px] font-bold text-[#0052ff] dark:text-[#3b82f6] uppercase tracking-wider flex items-center gap-1.5">
                  {isGmailConnected ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse"></span>
                      CONNECTED
                    </>
                  ) : (
                    'GMAIL CONNECTION'
                  )}
                </span>
              </div>

              <h2 className="text-base font-bold text-[#1a1c1c] dark:text-[#F2F2EE] mb-1">
                {isGmailConnected ? 'Browse Gmail Mailbox' : 'Connect Gmail'}
              </h2>
              <p className="text-xs text-[#434656] dark:text-[#A0A7A3] mb-6 flex-grow leading-relaxed">
                {isGmailConnected
                  ? `Active account: ${connectedGmailEmail || 'Google Mail'}. Inspect and deconstruct emails directly from your inbox.`
                  : 'Analyze emails directly from your mailbox without downloading individual .eml files.'}
              </p>

              <button
                onClick={handleGmailAction}
                disabled={isConnecting}
                className="w-full py-3 px-4 bg-[#0052ff] dark:bg-[#3b82f6] text-white text-xs font-semibold rounded hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors flex items-center justify-between shadow-sm disabled:opacity-50"
              >
                {isConnecting ? (
                  <span className="flex items-center gap-2 mx-auto">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connecting with Google...
                  </span>
                ) : isGmailConnected ? (
                  <>
                    <span>Open Mailbox</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    <span>Connect Gmail</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Help Section */}
          <div className="border-t border-[#D5D5CE] dark:border-[#29342F] pt-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-xs font-bold text-[#1a1c1c] dark:text-[#F2F2EE]">
                Need an .EML file?
              </h3>
              <p className="text-xs text-[#737688] dark:text-[#A0A7A3]">
                You can export the original message from Gmail in a few simple steps.
              </p>
            </div>

            <button
              onClick={() => setShowHelpOverlay(!showHelpOverlay)}
              className="font-mono text-xs font-bold text-[#0052ff] dark:text-[#3b82f6] hover:underline flex items-center gap-1.5 border-b border-[#0052ff] dark:border-[#3b82f6] pb-0.5"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>How to get an .EML from Gmail</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Help Drawer / Instructions Overlay */}
          {showHelpOverlay && (
            <div className="p-5 bg-[#EAEAE5] dark:bg-[#151A17] border border-[#D5D5CE] dark:border-[#29342F] rounded-lg animate-fadeIn text-xs font-mono space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-[#D5D5CE] dark:border-[#29342F]">
                <span className="font-bold text-[#0052ff] dark:text-[#3b82f6] uppercase tracking-wider">
                  EXPORTING .EML FROM GMAIL
                </span>
                <button
                  onClick={() => setShowHelpOverlay(false)}
                  className="text-[#737688] hover:text-[#1a1c1c] dark:hover:text-[#F2F2EE]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <ol className="space-y-2.5 text-[#434656] dark:text-[#A0A7A3]">
                <li className="flex items-start gap-2.5">
                  <span className="text-[#0052ff] dark:text-[#3b82f6] font-bold">01.</span>
                  <span>Open the target email in Gmail.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-[#0052ff] dark:text-[#3b82f6] font-bold">02.</span>
                  <span>Click the three-dot menu (More options) on the top right of the message.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-[#0052ff] dark:text-[#3b82f6] font-bold">03.</span>
                  <span>Select &apos;Show original&apos; from the dropdown menu.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-[#0052ff] dark:text-[#3b82f6] font-bold">04.</span>
                  <span>Click &apos;Download Original&apos; in the newly opened tab to save the .eml file.</span>
                </li>
              </ol>
            </div>
          )}
        </div>

        {/* Footer / Privacy Policy note */}
        <footer className="p-4 md:px-8 bg-[#EAEAE5] dark:bg-[#151A17] border-t border-[#D5D5CE] dark:border-[#29342F] flex items-center gap-3 text-xs text-[#737688] dark:text-[#A0A7A3]">
          <Shield className="w-4 h-4 text-[#0052ff] dark:text-[#3b82f6] shrink-0" />
          <p className="leading-snug">
            Your mailbox remains under your control. Mailiac only requests read-only permissions required for forensic analysis.
          </p>
        </footer>
      </div>
    </div>
  );
}
