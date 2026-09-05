import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectForwardedMessage, scoreIntent, heuristicFallback, defaultHealthTracker } from '../src/index.js';
import { GoogleGenAI } from '@google/genai';

vi.mock('@google/genai', () => {
  const generateContentMock = vi.fn();
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        generateContent: generateContentMock,
      },
    })),
  };
});

describe('Forwarded Message & Benign Relay Detection (@mailiac/parsing-ai-intent)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env['GEMINI_API_KEY'] = 'test-key';
    defaultHealthTracker.reset();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('detectForwardedMessage() Unit Tests', () => {
    it('detects Gmail forwarded email structure and extracts original sender and domain', () => {
      const emailText = `Hey Bob, forwarding the Microsoft invoice for your records.

---------- Forwarded message ---------
From: Microsoft Billing <billing@microsoft.com>
Date: Fri, Sep 5, 2026 at 10:00 AM
Subject: Microsoft 365 Family Subscription
To: Alice User <alice@gmail.com>

Thank you for your business. Your receipt is attached.`;

      const result = detectForwardedMessage(emailText, 'Fwd: Microsoft 365 Family Subscription');
      expect(result.isForwarded).toBe(true);
      expect(result.forwardMarker).toBe('GMAIL_DELIMITER');
      expect(result.originalSender).toBe('Microsoft Billing <billing@microsoft.com>');
      expect(result.originalSenderAddress).toBe('billing@microsoft.com');
      expect(result.originalSenderDomain).toBe('microsoft.com');
      expect(result.originalSubject).toBe('Microsoft 365 Family Subscription');
      expect(result.preamble).toBe('Hey Bob, forwarding the Microsoft invoice for your records.');
    });

    it('detects Outlook / Exchange forwarded email structure', () => {
      const emailText = `Please see the message below from our dean.

-----Original Message-----
From: Dean of Academics <dean@university.edu>
Sent: Thursday, September 4, 2026 3:30 PM
To: Faculty List <faculty@university.edu>
Subject: Official notice regarding semester schedule

All faculty please take note.`;

      const result = detectForwardedMessage(emailText, 'FW: Official notice regarding semester schedule');
      expect(result.isForwarded).toBe(true);
      expect(result.forwardMarker).toBe('OUTLOOK_DELIMITER');
      expect(result.originalSenderDomain).toBe('university.edu');
      expect(result.originalSubject).toBe('Official notice regarding semester schedule');
    });

    it('detects Apple Mail forwarded email structure', () => {
      const emailText = `FYI

Begin forwarded message:

From: Google Security <no-reply@accounts.google.com>
Date: September 1, 2026 at 8:00:00 AM EDT
To: me@example.com
Subject: Security alert for your linked account

A new sign-in was detected.`;

      const result = detectForwardedMessage(emailText, 'Fwd: Security alert for your linked account');
      expect(result.isForwarded).toBe(true);
      expect(result.forwardMarker).toBe('APPLE_MAIL_DELIMITER');
      expect(result.originalSenderDomain).toBe('accounts.google.com');
    });

    it('detects multi-lingual subject prefixes (Enc:, WG:, TR:)', () => {
      const result1 = detectForwardedMessage('From: support@service.com\nDate: today\nContent', 'Enc: Aviso de fatura');
      expect(result1.isForwarded).toBe(true);

      const result2 = detectForwardedMessage('From: support@service.de\nDate: today\nContent', 'WG: Wichtige Mitteilung');
      expect(result2.isForwarded).toBe(true);

      const result3 = detectForwardedMessage('From: support@service.fr\nDate: today\nContent', 'TR: Facture mensuelle');
      expect(result3.isForwarded).toBe(true);
    });

    it('recognizes cryptographic ARC seal as forwarded relay even without MUA delimiter', () => {
      const result = detectForwardedMessage('Mailing list discussion body', 'Mailing List Topic', { arcPass: true });
      expect(result.isForwarded).toBe(true);
      expect(result.forwardMarker).toBe('ARC_SEAL');
    });

    it('returns isForwarded false for direct normal emails', () => {
      const emailText = 'Hi team, let us meet tomorrow at 10 AM to discuss the sprint goals.';
      const result = detectForwardedMessage(emailText, 'Sprint planning meeting');
      expect(result.isForwarded).toBe(false);
      expect(result.originalSender).toBeUndefined();
    });
  });

  describe('Heuristic Fallback: Benign Relay vs False Positive Suppression', () => {
    it('suppresses AUTHORITY_TRAP and SUSPICIOUS_EXTERNAL_LINK on benign forwarded emails', () => {
      const forwardedText = `Hi Alice, forwarding this notice from the dean's office for your information.

---------- Forwarded message ---------
From: Academic Cell <dean@university.edu>
Date: Thu, Sep 4, 2026 at 9:00 AM
Subject: Official notice regarding credit certification
To: student@gmail.com

Dear Students,
Please review your credits on the student portal.
Visit https://university.edu/portal for details.`;

      const result = heuristicFallback(
        {
          text: forwardedText,
          subject: 'Fwd: Official notice regarding credit certification',
          sender: 'friend@gmail.com',
          senderDomain: 'gmail.com',
          urls: [{ href: 'https://university.edu/portal', domain: 'university.edu', text: 'Portal' }],
        },
        0,
        false
      );

      // Should not flag AUTHORITY_TRAP or SUSPICIOUS_EXTERNAL_LINK
      expect(result.intentLabels).not.toContain('AUTHORITY_TRAP');
      expect(result.intentLabels).not.toContain('SUSPICIOUS_LINK');
      expect(result.intentLabels).toContain('BENIGN');
      expect(result.nlpScore).toBeLessThanOrEqual(25);

      // Should attach FORWARDED_MESSAGE_RELAY finding
      const relayFinding = result.findings.find((f) => f.type === 'FORWARDED_MESSAGE_RELAY');
      expect(relayFinding).toBeDefined();
      expect(relayFinding?.severity).toBe('INFO');
    });

    it('suppresses FINANCIAL_COERCION when forwarding standard invoices without urgency or credential prompt', () => {
      const forwardedText = `Forwarding my monthly invoice payment receipt for accounting.

---------- Forwarded message ---------
From: AWS Billing <no-reply-aws@amazon.com>
Date: Wed, Sep 3, 2026 at 11:00 AM
Subject: Your AWS Invoice Payment Summary
To: user@gmail.com

Here is your bank account invoice payment summary for August.`;

      const result = heuristicFallback(
        {
          text: forwardedText,
          subject: 'Fwd: Your AWS Invoice Payment Summary',
          sender: 'user@gmail.com',
          senderDomain: 'gmail.com',
          urls: [],
        },
        0,
        false
      );

      // Should not trigger high-severity fatal FINANCIAL_COERCION
      expect(result.intentLabels).not.toContain('FINANCIAL_COERCION');
      expect(result.nlpScore).toBeLessThanOrEqual(25);
    });

    it('preserves true positive: direct sender claiming authority without forward structure is flagged', () => {
      const phishText = 'This is the official notice from academic cell. Immediate action required. Password verification needed.';

      const result = heuristicFallback(
        {
          text: phishText,
          subject: 'Urgent: Academic Notice',
          sender: 'attacker@gmail.com',
          senderDomain: 'gmail.com',
          urls: [],
        },
        0,
        false
      );

      expect(result.intentLabels).toContain('AUTHORITY_TRAP');
      expect(result.intentLabels).toContain('CREDENTIAL_HARVESTING');
      expect(result.nlpScore).toBeGreaterThanOrEqual(75);
    });
  });

  describe('Gemini AI Intent Scoring: Relay Disambiguation', () => {
    it('suppresses false-positive BRAND_IMPERSONATION on benign forwarded email', async () => {
      // Mock Gemini mistakenly predicting BRAND_IMPERSONATION because domain is gmail.com but body mentions Microsoft
      const mockGenerate = vi.fn().mockResolvedValueOnce({
        text: JSON.stringify({
          intentLabels: ['BRAND_IMPERSONATION', 'AUTHORITY_TRAP'],
          authority_score: 80,
          urgency_score: 10,
          financial_score: 0,
          harvesting_score: 10,
          findings: [
            {
              type: 'BRAND_IMPERSONATION',
              severity: 'HIGH',
              description: 'Sender claims to be Microsoft from gmail.com',
            },
          ],
        }),
      });

      vi.mocked(GoogleGenAI).mockImplementationOnce(() => ({
        models: {
          generateContent: mockGenerate,
        },
      } as unknown as GoogleGenAI));

      const emailText = `FYI, forwarding the Microsoft receipt.

---------- Forwarded message ---------
From: Microsoft Billing <billing@microsoft.com>
Date: Fri, Sep 5, 2026 at 10:00 AM
Subject: Subscription Confirmation
To: Alice <alice@gmail.com>

Thank you for your order.`;

      const result = await scoreIntent({
        text: emailText,
        subject: 'Fwd: Subscription Confirmation',
        sender: 'Alice <alice@gmail.com>',
        senderDomain: 'gmail.com',
      });

      // Post-processor suppresses false-positive BRAND_IMPERSONATION and AUTHORITY_TRAP
      expect(result.intentLabels).not.toContain('BRAND_IMPERSONATION');
      expect(result.intentLabels).not.toContain('AUTHORITY_TRAP');
      expect(result.intentLabels).toContain('BENIGN');
      expect(result.nlpScore).toBeLessThanOrEqual(25);

      // FORWARDED_MESSAGE_RELAY finding attached
      const relayFinding = result.findings.find((f) => f.type === 'FORWARDED_MESSAGE_RELAY');
      expect(relayFinding).toBeDefined();
    });

    it('preserves true positive: active credential harvesting inside forwarded phishing email is not suppressed', async () => {
      const mockGenerate = vi.fn().mockResolvedValueOnce({
        text: JSON.stringify({
          intentLabels: ['CREDENTIAL_HARVESTING', 'URGENCY'],
          authority_score: 50,
          urgency_score: 85,
          financial_score: 0,
          harvesting_score: 90,
          findings: [
            {
              type: 'CREDENTIAL_HARVESTING',
              severity: 'HIGH',
              description: 'Phishing login portal detected',
            },
          ],
        }),
      });

      vi.mocked(GoogleGenAI).mockImplementationOnce(() => ({
        models: {
          generateContent: mockGenerate,
        },
      } as unknown as GoogleGenAI));

      const phishForwardText = `Look at this phish:

---------- Forwarded message ---------
From: Fake Bank <security@bank-verify-login.com>
Subject: Account Suspended! Click here to enter password immediately.`;

      const result = await scoreIntent({
        text: phishForwardText,
        subject: 'Fwd: Account Suspended!',
        sender: 'Alice <alice@gmail.com>',
        senderDomain: 'gmail.com',
      });

      // Active credential harvesting is preserved!
      expect(result.intentLabels).toContain('CREDENTIAL_HARVESTING');
      expect(result.credentialHarvestingScore).toBe(90);
      expect(result.nlpScore).toBeGreaterThanOrEqual(85);
    });
  });
});
