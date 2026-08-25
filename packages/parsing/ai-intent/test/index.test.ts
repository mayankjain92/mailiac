import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scoreIntent } from '../src/index.js';
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
      expect(result.intentLabels).toContain('CREDENTIAL_HARVESTING');
      expect(result.credentialHarvestingScore).toBeGreaterThan(0);
      expect(result.nlpScore).toBeGreaterThan(0);
    });

    it('falls back gracefully when GEMINI_API_KEY is not set', async () => {
      delete process.env['GEMINI_API_KEY'];

      const bodyText = 'Please execute the wire transfer of $10,000 to our bank account.';
      const result = await scoreIntent(bodyText);

      expect(result.intentLabels).toContain('FINANCIAL_COERCION');
      expect(result.financialRequestScore).toBe(80);
      expect(result.nlpScore).toBe(80);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty or whitespace text gracefully', async () => {
      const result = await scoreIntent('');
      expect(result).toEqual({
        intentLabels: ['BENIGN'],
        financialRequestScore: 0,
        credentialHarvestingScore: 0,
        glasswormFlag: false,
        zeroWidthCharCount: 0,
        nlpScore: 0,
      });

      const whitespaceResult = await scoreIntent('   \n\t  ');
      expect(whitespaceResult.intentLabels).toEqual(['BENIGN']);
      expect(whitespaceResult.nlpScore).toBe(0);
    });

    it('handles non-string / null / undefined input gracefully', async () => {
      // @ts-expect-error Testing runtime invalid input
      const nullResult = await scoreIntent(null);
      expect(nullResult.intentLabels).toEqual(['BENIGN']);
      expect(nullResult.nlpScore).toBe(0);
    });
  });
});
