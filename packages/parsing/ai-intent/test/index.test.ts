import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scoreIntent, defaultHealthTracker } from '../src/index.js';
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

describe('AI Intent Scoring (@mailiac/parsing-ai-intent)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env['GEMINI_API_KEY'] = 'test-gemini-key';
    defaultHealthTracker.reset();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Happy Path: Live/Mocked Gemini API', () => {
    it('correctly scores financial coercion intent', async () => {
      const mockGenerate = vi.fn().mockResolvedValueOnce({
        text: JSON.stringify({
          intentLabels: ['FINANCIAL_COERCION', 'URGENCY'],
          financialRequestScore: 95,
          credentialHarvestingScore: 5,
          nlpScore: 95,
        }),
      });

      vi.mocked(GoogleGenAI).mockImplementationOnce(() => ({
        models: {
          generateContent: mockGenerate,
        },
      } as unknown as GoogleGenAI));

      const bodyText = 'Please immediately wire $50,000 to the following overseas account for invoice settlement.';
      const result = await scoreIntent(bodyText);

      expect(result.intentLabels).toEqual(['FINANCIAL_COERCION', 'URGENCY']);
      expect(result.financialRequestScore).toBe(95);
      expect(result.credentialHarvestingScore).toBe(5);
      expect(result.nlpScore).toBe(95);
      expect(result.glasswormFlag).toBe(false);
      expect(result.zeroWidthCharCount).toBe(0);
    });

    it('correctly scores credential harvesting intent', async () => {
      const mockGenerate = vi.fn().mockResolvedValueOnce({
        text: JSON.stringify({
          intentLabels: ['CREDENTIAL_HARVESTING'],
          financialRequestScore: 0,
          credentialHarvestingScore: 98,
          nlpScore: 98,
        }),
      });

      vi.mocked(GoogleGenAI).mockImplementationOnce(() => ({
        models: {
          generateContent: mockGenerate,
        },
      } as unknown as GoogleGenAI));

      const bodyText = 'Your corporate account has been suspended. Click here to verify your password immediately.';
      const result = await scoreIntent(bodyText);

      expect(result.intentLabels).toEqual(['CREDENTIAL_HARVESTING']);
      expect(result.credentialHarvestingScore).toBe(98);
      expect(result.financialRequestScore).toBe(0);
      expect(result.nlpScore).toBe(98);
    });

    it('handles markdown formatted json response from Gemini', async () => {
      const mockGenerate = vi.fn().mockResolvedValueOnce({
        text: '```json\n{\n  "intentLabels": ["BENIGN"],\n  "financialRequestScore": 0,\n  "credentialHarvestingScore": 0,\n  "nlpScore": 0\n}\n```',
      });

      vi.mocked(GoogleGenAI).mockImplementationOnce(() => ({
        models: {
          generateContent: mockGenerate,
        },
      } as unknown as GoogleGenAI));

      const bodyText = 'Hey team, here are the meeting notes from today.';
      const result = await scoreIntent(bodyText);

      expect(result.intentLabels).toEqual(['BENIGN']);
      expect(result.nlpScore).toBe(0);
    });
  });

  describe('Zero-Width Character & Glassworm Detection', () => {
    it('detects zero-width characters and elevates score if > 50 characters present', async () => {
      const mockGenerate = vi.fn().mockResolvedValueOnce({
        text: JSON.stringify({
          intentLabels: ['FINANCIAL_COERCION'],
          financialRequestScore: 60,
          credentialHarvestingScore: 0,
          nlpScore: 60,
        }),
      });

      vi.mocked(GoogleGenAI).mockImplementationOnce(() => ({
        models: {
          generateContent: mockGenerate,
        },
      } as unknown as GoogleGenAI));

      // 60 zero-width spaces in text
      const bodyWithZeroWidth = Array(60).fill('\u200B').join('W') + 'ire transfer needed';
      const result = await scoreIntent(bodyWithZeroWidth);

      expect(result.zeroWidthCharCount).toBe(60);
      expect(result.glasswormFlag).toBe(true);
      // nlpScore elevated with glassworm (+20 points)
      expect(result.nlpScore).toBe(80);
    });
  });

  describe('Fault Tolerance & Fallback (Rule: Flaky calls must not crash)', () => {
    it('falls back to heuristic analysis on Gemini API error or timeout without throwing', async () => {
      const mockGenerate = vi.fn().mockRejectedValueOnce(new Error('Rate limit exceeded 429'));

      vi.mocked(GoogleGenAI).mockImplementationOnce(() => ({
        models: {
          generateContent: mockGenerate,
        },
      } as unknown as GoogleGenAI));

      const bodyText = 'Urgent: please verify your account and password reset immediately.';
      const result = await scoreIntent(bodyText);

      expect(result).toBeDefined();
      expect(result.provider).toBe('heuristic');
      expect(result.providerStatus).toBe('fallback');
      expect(result.fallbackReason).toContain('Rate limit exceeded 429');
      expect(result.aiDiagnostics).toEqual(
        expect.objectContaining({
          provider: 'heuristic',
          requestAttempted: true,
          requestSucceeded: false,
          fallbackUsed: true,
        })
      );
      expect(result.intentLabels).toContain('CREDENTIAL_HARVESTING');
      expect(result.credentialHarvestingScore).toBeGreaterThan(0);
      expect(result.nlpScore).toBeGreaterThan(0);
    });

    it('falls back gracefully when GEMINI_API_KEY is not set', async () => {
      delete process.env['GEMINI_API_KEY'];

      const bodyText = 'Please execute the wire transfer of $10,000 to our bank account.';
      const result = await scoreIntent(bodyText);

      expect(result.provider).toBe('heuristic');
      expect(result.providerStatus).toBe('fallback');
      expect(result.fallbackReason).toBe('GEMINI_API_KEY missing from process.env');
      expect(result.aiDiagnostics?.requestAttempted).toBe(false);
      expect(result.intentLabels).toContain('FINANCIAL_COERCION');
      expect(result.financialRequestScore).toBe(85);
      expect(result.nlpScore).toBe(85);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty or whitespace text gracefully', async () => {
      const result = await scoreIntent('');
      expect(result.intentLabels).toEqual(['UNKNOWN']);
      expect(result.providerStatus).toBe('fallback');
      expect(result.fallbackReason).toBe('Empty payload provided');
      expect(result.nlpScore).toBe(0);

      const whitespaceResult = await scoreIntent('   \n\t  ');
      expect(whitespaceResult.intentLabels).toEqual(['UNKNOWN']);
      expect(whitespaceResult.nlpScore).toBe(0);
    });

    it('handles non-string / null / undefined input gracefully', async () => {
      // @ts-expect-error Testing runtime invalid input
      const nullResult = await scoreIntent(null);
      expect(nullResult.intentLabels).toEqual(['UNKNOWN']);
      expect(nullResult.nlpScore).toBe(0);
    });
  });

  describe('Validation & Hardening', () => {
    it('normalizes out-of-bounds, NaN, and Infinity scores', async () => {
      const mockGenerate = vi.fn().mockResolvedValueOnce({
        text: JSON.stringify({
          intentLabels: ['BENIGN'],
          urgency_score: -50,
          financial_score: Infinity,
          authority_score: NaN,
          harvesting_score: 150,
          nlpScore: null,
        }),
      });

      vi.mocked(GoogleGenAI).mockImplementationOnce(() => ({
        models: {
          generateContent: mockGenerate,
        },
      } as unknown as GoogleGenAI));

      const result = await scoreIntent('Test email');
      expect(result.financialRequestScore).toBe(0); // Infinity -> 0
      expect(result.credentialHarvestingScore).toBe(100); // 150 -> clamped to 100
      expect(result.nlpScore).toBe(100); // Max of components (0, 0, 0, 100)
    });

    it('filters invalid intent labels and defaults to UNKNOWN', async () => {
      const mockGenerate = vi.fn().mockResolvedValueOnce({
        text: JSON.stringify({
          intentLabels: ['RANDOM_LABEL', 'FINANCIAL_COERCION'],
        }),
      });

      vi.mocked(GoogleGenAI).mockImplementationOnce(() => ({
        models: {
          generateContent: mockGenerate,
        },
      } as unknown as GoogleGenAI));

      const result = await scoreIntent('Test email');
      expect(result.intentLabels).toEqual(['FINANCIAL_COERCION']); // RANDOM_LABEL gets filtered out when mixed with valid ones
    });

    it('extracts JSON surrounded by conversational text', async () => {
      const mockGenerate = vi.fn().mockResolvedValueOnce({
        text: 'Here is the analysis:\n\n```\n{\n  "intentLabels": ["BENIGN"],\n  "nlpScore": 10\n}\n```\n\nHope this helps!',
      });

      vi.mocked(GoogleGenAI).mockImplementationOnce(() => ({
        models: {
          generateContent: mockGenerate,
        },
      } as unknown as GoogleGenAI));

      const result = await scoreIntent('Test email');
      expect(result.nlpScore).toBe(10);
      expect(result.intentLabels).toEqual(['BENIGN']);
    });
  });

  describe('P3 Regression Test Suite — English & Format Coverage', () => {
    it('1. English Phishing sample with external URL mismatch', async () => {
      delete process.env['GEMINI_API_KEY'];

      const result = await scoreIntent({
        subject: 'URGENT: Corporate Account Expiration Notice',
        sender: 'Security Team <security@unrelated-domain.com>',
        senderDomain: 'unrelated-domain.com',
        text: 'Your corporate access expires today. Please click here immediately to redeem your security credentials and confirm identity.',
        urls: [
          {
            href: 'https://phishing-portal-login.xyz/verify',
            text: 'Redeem Now',
            domain: 'phishing-portal-login.xyz',
          },
        ],
      });

      expect(result.nlpScore).toBeGreaterThan(0);
      expect(result.intentLabels).not.toContain('UNKNOWN');
      expect(result.intentLabels).toContain('CREDENTIAL_HARVESTING');
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          type: 'SUSPICIOUS_EXTERNAL_LINK',
          severity: 'HIGH',
        })
      );
    });

    it('2. Benign HTML email — returns low/benign score', async () => {
      delete process.env['GEMINI_API_KEY'];

      const result = await scoreIntent({
        subject: 'Weekly Team Sync Notes',
        text: 'Hi everyone, here are the action items from our weekly sync meeting. Thanks!',
      });

      expect(result.nlpScore).toBe(0);
      expect(result.intentLabels).toEqual(['UNKNOWN']);
    });

    it('3. English phishing email — detects credential harvesting', async () => {
      delete process.env['GEMINI_API_KEY'];

      const result = await scoreIntent({
        subject: 'Urgent: Password Reset Required',
        text: 'Your corporate account has been suspended. Please verify your account and login immediately.',
      });

      expect(result.nlpScore).toBeGreaterThanOrEqual(80);
      expect(result.intentLabels).toContain('CREDENTIAL_HARVESTING');
    });

    it('4. English urgency email — detects English urgency keywords', async () => {
      delete process.env['GEMINI_API_KEY'];

      const result = await scoreIntent({
        subject: 'Account Expiration Notice - Action Required Immediately',
        text: 'Attention: your account expires today. Immediate action required!',
      });

      expect(result.nlpScore).toBeGreaterThan(0);
      expect(result.intentLabels).toContain('URGENCY');
    });

    it('5. Plain-text phishing email — scores correctly from plain text', async () => {
      delete process.env['GEMINI_API_KEY'];

      const result = await scoreIntent('URGENT: Please execute wire transfer of $25,000 to invoice account.');

      expect(result.nlpScore).toBeGreaterThan(0);
      expect(result.intentLabels).toContain('FINANCIAL_COERCION');
    });

    it('6. Multipart email — correctly handles input from options object', async () => {
      delete process.env['GEMINI_API_KEY'];

      const result = await scoreIntent({
        subject: 'Invoice Payment Due',
        text: 'Attached is the invoice payment request for swift code transfer.',
      });

      expect(result.nlpScore).toBeGreaterThan(0);
      expect(result.intentLabels).toContain('FINANCIAL_COERCION');
    });

    it('7. HTML-only email — handles extracted text and URLs correctly', async () => {
      delete process.env['GEMINI_API_KEY'];

      const result = await scoreIntent({
        text: 'Visual HTML email with click here link',
        urls: [{ href: 'https://phishing-domain.xyz/login', text: 'click here', domain: 'phishing-domain.xyz' }],
      });

      expect(result.nlpScore).toBeGreaterThan(0);
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          type: 'SUSPICIOUS_EXTERNAL_LINK',
        })
      );
    });

    it('8. Malformed / empty body — returns empty payload finding gracefully', async () => {
      delete process.env['GEMINI_API_KEY'];

      const result = await scoreIntent({
        text: '',
        subject: '',
      });

      expect(result.nlpScore).toBe(0);
      expect(result.intentLabels).toEqual(['UNKNOWN']);
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          type: 'EMPTY_PAYLOAD',
        })
      );
    });

    it('9. False-positive suppression: URL parameters like otpToken do not trigger CREDENTIAL_HARVESTING', async () => {
      delete process.env['GEMINI_API_KEY'];

      const text = 'You have 1 new invitation. View invitations: https://www.linkedin.com/comm/mynetwork/?eid=jcpal9&otpToken=3DNDgxN2Nh';
      const result = await scoreIntent({
        text,
        subject: 'You have 1 new invitation',
        senderDomain: 'linkedin.com',
        urls: [{ href: 'https://www.linkedin.com/comm/mynetwork/?eid=jcpal9&otpToken=3DNDgxN2Nh', domain: 'linkedin.com' }],
      });

      expect(result.intentLabels).not.toContain('CREDENTIAL_HARVESTING');
      expect(result.findings.some((f) => f.type === 'HEURISTIC_CREDENTIAL')).toBe(false);
      expect(result.nlpScore).toBeLessThan(50);
    });

    it('10. True-positive preservation: explicit OTP in body prose correctly flags CREDENTIAL_HARVESTING', async () => {
      delete process.env['GEMINI_API_KEY'];

      const text = 'Your one-time passcode is ready. Please enter your otp immediately to verify your account.';
      const result = await scoreIntent({
        text,
        subject: 'Account Verification',
      });

      expect(result.intentLabels).toContain('CREDENTIAL_HARVESTING');
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          type: 'HEURISTIC_CREDENTIAL',
          severity: 'HIGH',
        })
      );
      expect(result.credentialHarvestingScore).toBe(85);
    });
  });
});
