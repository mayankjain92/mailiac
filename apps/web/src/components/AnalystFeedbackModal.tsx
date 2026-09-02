'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  Send,
  Sliders,
  MessageSquare,
  UserCheck,
  User,
  Shield,
  HelpCircle,
} from 'lucide-react';

export interface AnalystFeedbackData {
  feedbackMode: 'user' | 'expert';
  analystVerdict:
    | 'CONFIRMED_TRUE_POSITIVE'
    | 'CONFIRMED_TRUE_NEGATIVE'
    | 'FALSE_POSITIVE'
    | 'FALSE_NEGATIVE'
    | 'MISCLASSIFIED_SEVERITY'
    | 'USER_ACCURATE'
    | 'USER_FALSE_ALARM'
    | 'USER_MISSED_THREAT'
    | 'USER_UNSURE';
  actualThreatCategory?: string;
  pillarAccuracy?: {
    identityCorrect?: boolean;
    aiIntentCorrect?: boolean;
    cryptoAuthCorrect?: boolean;
    ipReputationCorrect?: boolean;
  };
  suggestedScore?: number;
  userSuspicionLevel?: number;
  userSelectedTriggers?: string[];
  notes?: string;
}

interface AnalystFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  onFeedbackSaved?: () => void;
}

const COMMON_USER_TRIGGERS = [
  'Unexpected sender address or strange email format',
  'Asked for passwords, banking details, or urgent action',
  'Suspicious website link or unexpected file attachment',
  'Pushy, threatening, or overly urgent tone',
];

export default function AnalystFeedbackModal({
  isOpen,
  onClose,
  caseId,
  onFeedbackSaved,
}: AnalystFeedbackModalProps) {
  // Mode selection: 'user' (Everyday language) vs 'expert' (SOC Forensic)
  const [feedbackMode, setFeedbackMode] = useState<'user' | 'expert'>('user');

  // User Mode State
  const [userVerdict, setUserVerdict] = useState<'USER_ACCURATE' | 'USER_FALSE_ALARM' | 'USER_MISSED_THREAT' | 'USER_UNSURE'>('USER_ACCURATE');
  const [userSuspicionLevel, setUserSuspicionLevel] = useState<number>(3);
  const [userSelectedTriggers, setUserSelectedTriggers] = useState<string[]>([]);

  // Expert Mode State
  const [analystVerdict, setAnalystVerdict] = useState<
    AnalystFeedbackData['analystVerdict']
  >('CONFIRMED_TRUE_POSITIVE');
  const [actualThreatCategory, setActualThreatCategory] = useState<string>('Credential Harvesting');
  const [identityCorrect, setIdentityCorrect] = useState<boolean>(true);
  const [aiIntentCorrect, setAiIntentCorrect] = useState<boolean>(true);
  const [cryptoAuthCorrect, setCryptoAuthCorrect] = useState<boolean>(true);
  const [ipReputationCorrect, setIpReputationCorrect] = useState<boolean>(true);
  const [suggestedScore, setSuggestedScore] = useState<number>(85);

  // Common State
  const [notes, setNotes] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch existing feedback if already submitted
  useEffect(() => {
    if (isOpen && caseId) {
      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);

      fetch(`/api/reports/${encodeURIComponent(caseId)}/feedback`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.feedback) {
            const fb = data.feedback;
            if (fb.feedbackMode) setFeedbackMode(fb.feedbackMode);
            if (fb.analystVerdict) {
              if (fb.analystVerdict.startsWith('USER_')) {
                setUserVerdict(fb.analystVerdict);
                setFeedbackMode('user');
              } else {
                setAnalystVerdict(fb.analystVerdict);
                setFeedbackMode('expert');
              }
            }
            if (fb.actualThreatCategory) setActualThreatCategory(fb.actualThreatCategory);
            if (fb.pillarAccuracy) {
              setIdentityCorrect(fb.pillarAccuracy.identityCorrect ?? true);
              setAiIntentCorrect(fb.pillarAccuracy.aiIntentCorrect ?? true);
              setCryptoAuthCorrect(fb.pillarAccuracy.cryptoAuthCorrect ?? true);
              setIpReputationCorrect(fb.pillarAccuracy.ipReputationCorrect ?? true);
            }
            if (typeof fb.suggestedScore === 'number') setSuggestedScore(fb.suggestedScore);
            if (typeof fb.userSuspicionLevel === 'number') setUserSuspicionLevel(fb.userSuspicionLevel);
            if (Array.isArray(fb.userSelectedTriggers)) setUserSelectedTriggers(fb.userSelectedTriggers);
            if (fb.notes) setNotes(fb.notes);
          }
        })
        .catch(() => {})
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, caseId]);

  const toggleTrigger = (trigger: string) => {
    setUserSelectedTriggers((prev) =>
      prev.includes(trigger) ? prev.filter((t) => t !== trigger) : [...prev, trigger]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const payload: AnalystFeedbackData =
        feedbackMode === 'user'
          ? {
              feedbackMode: 'user',
              analystVerdict: userVerdict,
              userSuspicionLevel,
              userSelectedTriggers,
              notes,
            }
          : {
              feedbackMode: 'expert',
              analystVerdict,
              actualThreatCategory:
                analystVerdict === 'FALSE_POSITIVE' || analystVerdict === 'CONFIRMED_TRUE_NEGATIVE'
                  ? 'Legitimate Business Mail'
                  : actualThreatCategory,
              pillarAccuracy: {
                identityCorrect,
                aiIntentCorrect,
                cryptoAuthCorrect,
                ipReputationCorrect,
              },
              suggestedScore,
              notes,
            };

      const res = await fetch(`/api/reports/${encodeURIComponent(caseId)}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Feedback submission failed with status ${res.status}`);
      }

      setSuccessMessage('Thank you! Your feedback has been recorded successfully.');
      if (onFeedbackSaved) onFeedbackSaved();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit feedback.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-[#F2F2EE] dark:bg-[#1B211E] border border-[#D5D5CE] dark:border-[#29342F] rounded-lg shadow-2xl overflow-hidden bracket-tl bracket-br"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D5D5CE] dark:border-[#29342F] bg-[#EAEAE5] dark:bg-[#151A17]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 flex items-center justify-center text-[#0052ff] dark:text-[#3b82f6]">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#0052ff] dark:text-[#3b82f6]">
                  Submit Analysis Feedback
                </span>
              </div>
              <p className="text-xs font-mono text-[#737688] dark:text-[#A0A7A3]">
                Case ID: <code className="font-bold text-[#1a1c1c] dark:text-[#F2F2EE]">{caseId}</code>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#F2F2EE] p-1.5 rounded hover:bg-[#D5D5CE]/50 dark:hover:bg-[#29342F]/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Toggle */}
        <div className="px-6 pt-4 pb-2 bg-[#EAEAE5]/60 dark:bg-[#151A17]/60 border-b border-[#D5D5CE] dark:border-[#29342F]">
          <div className="grid grid-cols-2 p-1 bg-[#D5D5CE]/40 dark:bg-[#29342F]/50 rounded-md text-xs font-mono">
            <button
              type="button"
              onClick={() => setFeedbackMode('user')}
              className={`py-2 px-3 rounded font-bold transition-all flex items-center justify-center gap-2 ${
                feedbackMode === 'user'
                  ? 'bg-white dark:bg-[#1B211E] text-[#0052ff] dark:text-[#3b82f6] shadow-sm'
                  : 'text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#F2F2EE]'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              General User Form (Simple)
            </button>

            <button
              type="button"
              onClick={() => setFeedbackMode('expert')}
              className={`py-2 px-3 rounded font-bold transition-all flex items-center justify-center gap-2 ${
                feedbackMode === 'expert'
                  ? 'bg-white dark:bg-[#1B211E] text-[#0052ff] dark:text-[#3b82f6] shadow-sm'
                  : 'text-[#737688] dark:text-[#A0A7A3] hover:text-[#1a1c1c] dark:hover:text-[#F2F2EE]'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              SOC Security Expert Form
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs font-mono">
          {isLoading ? (
            <div className="py-12 text-center text-[#737688] dark:text-[#A0A7A3] flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#0052ff] dark:text-[#3b82f6]" />
              <span>Loading existing feedback data...</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3 bg-[#ffdad6] dark:bg-[#410e0b] border border-[#ba1a1a]/30 rounded text-[#93000a] dark:text-[#ffb4ab] flex items-center gap-2">
                  <XCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {successMessage && (
                <div className="p-3 bg-[#e8f5e9] dark:bg-[#1b3320] border border-[#a5d6a7] dark:border-[#2e7d32] rounded text-[#2e7d32] dark:text-[#81c784] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              {/* ---------------- GENERAL USER FORM ---------------- */}
              {feedbackMode === 'user' ? (
                <>
                  {/* 1. Result Accuracy Question */}
                  <div>
                    <label className="block font-bold uppercase tracking-wider text-[#434656] dark:text-[#A0A7A3] mb-2">
                      1. Was Mailiac's result accurate for this email?
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        {
                          id: 'USER_ACCURATE',
                          label: '👍 Accurate',
                          desc: 'Mailiac correctly flagged/passed this email.',
                          color: 'border-[#2e7d32] text-[#2e7d32] dark:text-[#81c784]',
                        },
                        {
                          id: 'USER_FALSE_ALARM',
                          label: '⚠️ False Alarm',
                          desc: 'Mailiac marked a safe email as dangerous.',
                          color: 'border-[#e65100] text-[#e65100] dark:text-[#ffb74d]',
                        },
                        {
                          id: 'USER_MISSED_THREAT',
                          label: '🚨 Missed Threat',
                          desc: 'Mailiac marked a scam email as safe.',
                          color: 'border-[#ba1a1a] text-[#ba1a1a] dark:text-[#ffb4ab]',
                        },
                        {
                          id: 'USER_UNSURE',
                          label: '❓ Not Sure',
                          desc: 'I am not sure about this email.',
                          color: 'border-[#737688] text-[#737688] dark:text-[#A0A7A3]',
                        },
                      ].map((item) => {
                        const isSelected = userVerdict === item.id;
                        return (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => setUserVerdict(item.id as typeof userVerdict)}
                            className={`p-3 rounded border text-left transition-all ${
                              isSelected
                                ? `bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 border-[#0052ff] dark:border-[#3b82f6] shadow-sm`
                                : 'bg-[#EAEAE5] dark:bg-[#151A17] border-[#D5D5CE] dark:border-[#29342F] text-[#434656] dark:text-[#A0A7A3] hover:border-[#0052ff]'
                            }`}
                          >
                            <div className="font-bold text-xs text-[#1a1c1c] dark:text-[#F2F2EE] mb-0.5">
                              {item.label}
                            </div>
                            <div className="text-[11px] text-[#737688] dark:text-[#A0A7A3]">
                              {item.desc}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Suspicion Level Rating */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="font-bold uppercase tracking-wider text-[#434656] dark:text-[#A0A7A3]">
                        2. How suspicious did this email feel to you?
                      </label>
                      <span className="font-bold text-[#0052ff] dark:text-[#3b82f6]">
                        {userSuspicionLevel === 1 && '1 - Completely Safe'}
                        {userSuspicionLevel === 2 && '2 - Mostly Safe'}
                        {userSuspicionLevel === 3 && '3 - Slightly Suspicious'}
                        {userSuspicionLevel === 4 && '4 - Highly Suspicious'}
                        {userSuspicionLevel === 5 && '5 - Obvious Scam / Dangerous'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <button
                          type="button"
                          key={level}
                          onClick={() => setUserSuspicionLevel(level)}
                          className={`flex-1 py-2 rounded font-bold border transition-all text-center ${
                            userSuspicionLevel === level
                              ? 'bg-[#0052ff] dark:bg-[#3b82f6] text-white border-[#0052ff] dark:border-[#3b82f6]'
                              : 'bg-[#EAEAE5] dark:bg-[#151A17] border-[#D5D5CE] dark:border-[#29342F] text-[#1a1c1c] dark:text-[#F2F2EE] hover:border-[#0052ff]'
                          }`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. Triggers Checkboxes */}
                  <div>
                    <label className="block font-bold uppercase tracking-wider text-[#434656] dark:text-[#A0A7A3] mb-2">
                      3. What caught your attention about this email? (Select all that apply)
                    </label>
                    <div className="space-y-2 bg-[#EAEAE5] dark:bg-[#151A17] p-3 rounded border border-[#D5D5CE] dark:border-[#29342F]">
                      {COMMON_USER_TRIGGERS.map((trigger) => {
                        const isChecked = userSelectedTriggers.includes(trigger);
                        return (
                          <label
                            key={trigger}
                            className="flex items-center gap-2 cursor-pointer text-xs text-[#1a1c1c] dark:text-[#F2F2EE]"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleTrigger(trigger)}
                              className="rounded border-[#D5D5CE] dark:border-[#29342F] text-[#0052ff] focus:ring-0"
                            />
                            <span>{trigger}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* 4. Simple User Comments */}
                  <div>
                    <label className="block font-bold uppercase tracking-wider text-[#434656] dark:text-[#A0A7A3] mb-1.5 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-[#0052ff] dark:text-[#3b82f6]" />
                      4. Tell us in your own words (Optional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="e.g., 'This email pretended to be from my bank asking me to reset my password immediately'..."
                      className="w-full p-2.5 bg-[#EAEAE5] dark:bg-[#151A17] border border-[#D5D5CE] dark:border-[#29342F] rounded text-[#1a1c1c] dark:text-[#F2F2EE] placeholder-[#737688] focus:outline-none focus:border-[#0052ff]"
                    />
                  </div>
                </>
              ) : (
                /* ---------------- SOC EXPERT FORM ---------------- */
                <>
                  {/* 1. Ground Truth Verdict Selection */}
                  <div>
                    <label className="block font-bold uppercase tracking-wider text-[#434656] dark:text-[#A0A7A3] mb-2">
                      1. Analyst Ground-Truth Verdict (Required)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        {
                          id: 'CONFIRMED_TRUE_POSITIVE',
                          label: 'Confirmed Malicious (True Positive)',
                          icon: ShieldAlert,
                          color: 'border-[#ba1a1a] text-[#ba1a1a] dark:text-[#ffb4ab]',
                        },
                        {
                          id: 'CONFIRMED_TRUE_NEGATIVE',
                          label: 'Confirmed Safe (True Negative)',
                          icon: CheckCircle2,
                          color: 'border-[#2e7d32] text-[#2e7d32] dark:text-[#81c784]',
                        },
                        {
                          id: 'FALSE_POSITIVE',
                          label: 'False Positive (Legitimate Flagged)',
                          icon: AlertTriangle,
                          color: 'border-[#e65100] text-[#e65100] dark:text-[#ffb74d]',
                        },
                        {
                          id: 'FALSE_NEGATIVE',
                          label: 'False Negative (Threat Missed)',
                          icon: XCircle,
                          color: 'border-[#ba1a1a] text-[#ba1a1a] dark:text-[#ffb4ab]',
                        },
                      ].map((item) => {
                        const Icon = item.icon;
                        const isSelected = analystVerdict === item.id;
                        return (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => setAnalystVerdict(item.id as AnalystFeedbackData['analystVerdict'])}
                            className={`p-3 rounded border text-left flex items-center gap-2.5 transition-all ${
                              isSelected
                                ? `bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 border-[#0052ff] dark:border-[#3b82f6] shadow-sm`
                                : 'bg-[#EAEAE5] dark:bg-[#151A17] border-[#D5D5CE] dark:border-[#29342F] text-[#434656] dark:text-[#A0A7A3] hover:border-[#0052ff]'
                            }`}
                          >
                            <Icon className={`w-4 h-4 shrink-0 ${item.color}`} />
                            <span className="font-semibold text-[11px] text-[#1a1c1c] dark:text-[#F2F2EE]">
                              {item.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Threat Category (If Malicious) */}
                  {(analystVerdict === 'CONFIRMED_TRUE_POSITIVE' || analystVerdict === 'FALSE_NEGATIVE') && (
                    <div>
                      <label className="block font-bold uppercase tracking-wider text-[#434656] dark:text-[#A0A7A3] mb-1.5">
                        2. Confirmed Threat Category
                      </label>
                      <select
                        value={actualThreatCategory}
                        onChange={(e) => setActualThreatCategory(e.target.value)}
                        className="w-full p-2.5 bg-[#EAEAE5] dark:bg-[#151A17] border border-[#D5D5CE] dark:border-[#29342F] rounded text-[#1a1c1c] dark:text-[#F2F2EE] focus:outline-none focus:border-[#0052ff]"
                      >
                        <option value="Credential Harvesting">Credential Harvesting</option>
                        <option value="BEC / Executive Impersonation">BEC / Executive Impersonation</option>
                        <option value="Spear Phishing / Quishing">Spear Phishing / QR Quishing</option>
                        <option value="Malware / Ransomware Payload">Malware / Ransomware Payload</option>
                        <option value="Spam / Marketing / Bulk Mail">Spam / Marketing / Bulk Mail</option>
                      </select>
                    </div>
                  )}

                  {/* 3. Granular 4-Pillar Accuracy Evaluation */}
                  <div>
                    <label className="block font-bold uppercase tracking-wider text-[#434656] dark:text-[#A0A7A3] mb-2 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-[#0052ff] dark:text-[#3b82f6]" />
                      3. Granular Pillar Evaluation (Mark engines that were ACCURATE)
                    </label>
                    <div className="grid grid-cols-2 gap-2 bg-[#EAEAE5] dark:bg-[#151A17] p-3 rounded border border-[#D5D5CE] dark:border-[#29342F]">
                      {[
                        { label: 'Sender Identity Spoof Engine', state: identityCorrect, setState: setIdentityCorrect },
                        { label: 'AI Intent & Semantic Lure', state: aiIntentCorrect, setState: setAiIntentCorrect },
                        { label: 'Cryptographic Auth (SPF/DKIM)', state: cryptoAuthCorrect, setState: setCryptoAuthCorrect },
                        { label: 'IP Reputation & Reverse Hop', state: ipReputationCorrect, setState: setIpReputationCorrect },
                      ].map((pillar) => (
                        <label
                          key={pillar.label}
                          className="flex items-center gap-2 cursor-pointer text-[11px] text-[#1a1c1c] dark:text-[#F2F2EE]"
                        >
                          <input
                            type="checkbox"
                            checked={pillar.state}
                            onChange={(e) => pillar.setState(e.target.checked)}
                            className="rounded border-[#D5D5CE] dark:border-[#29342F] text-[#0052ff] focus:ring-0"
                          />
                          <span>{pillar.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 4. Suggested Risk Score Override */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="font-bold uppercase tracking-wider text-[#434656] dark:text-[#A0A7A3]">
                        4. Calibrated Score Override (0–100)
                      </label>
                      <span className="font-bold text-[#0052ff] dark:text-[#3b82f6]">{suggestedScore} / 100</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={suggestedScore}
                      onChange={(e) => setSuggestedScore(Number(e.target.value))}
                      className="w-full accent-[#0052ff] dark:accent-[#3b82f6] cursor-pointer"
                    />
                  </div>

                  {/* 5. Qualitative Analyst Notes */}
                  <div>
                    <label className="block font-bold uppercase tracking-wider text-[#434656] dark:text-[#A0A7A3] mb-1.5 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-[#0052ff] dark:text-[#3b82f6]" />
                      5. SOC Forensic Findings & Notes
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="Enter technical findings, e.g., 'Legitimate SPF alignment; DKIM signature intact; false positive caused by vendor domain migration'..."
                      className="w-full p-2.5 bg-[#EAEAE5] dark:bg-[#151A17] border border-[#D5D5CE] dark:border-[#29342F] rounded text-[#1a1c1c] dark:text-[#F2F2EE] placeholder-[#737688] focus:outline-none focus:border-[#0052ff]"
                    />
                  </div>
                </>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-[#D5D5CE] dark:border-[#29342F]">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded border border-[#D5D5CE] dark:border-[#29342F] text-[#434656] dark:text-[#A0A7A3] hover:bg-[#EAEAE5] dark:hover:bg-[#151A17] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-[#0052ff] dark:bg-[#3b82f6] text-white font-semibold px-5 py-2 rounded hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors flex items-center gap-2 disabled:opacity-50 shadow-sm"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving Feedback...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Submit Feedback
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
