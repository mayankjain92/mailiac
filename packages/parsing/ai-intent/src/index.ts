import { GoogleGenAI } from '@google/genai';
import type { NLPResult } from '@mailiac/shared-types';

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MODEL = 'gemini-2.5-flash';

const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF\u00AD\u200E\u200F\u202A-\u202E\u2060-\u2064\u180E]/g;

interface RawGeminiNLPResponse {
  intentLabels?: string[];
  financialRequestScore?: number;
  credentialHarvestingScore?: number;
  nlpScore?: number;
}

/**
 * Fallback heuristic analysis if Gemini API is unavailable or unconfigured.
 */
function heuristicFallback(
  text: string,
  zeroWidthCount: number,
  glassworm: boolean
): NLPResult {
  const lower = text.toLowerCase();
  const intents: string[] = [];
  let finScore = 0;
  let credScore = 0;

  const finKeywords = [
    'wire transfer',
    'bank account',
    'invoice payment',
    'remittance',
    'bitcoin',
    'gift card',
    'payroll direct deposit',
    'swift code',
    'routing number',
  ];

  const credKeywords = [
    'password reset',
    'verify your account',
    'account suspended',
    'login immediately',
    'confirm your identity',
    'security alert',
    'sign in to review',
    'update your credentials',
  ];

  const hasFinancial = finKeywords.some((kw) => lower.includes(kw));
  if (hasFinancial) {
    intents.push('FINANCIAL_COERCION');
    finScore = 80;
  }

  const hasCred = credKeywords.some((kw) => lower.includes(kw));
  if (hasCred) {
    intents.push('CREDENTIAL_HARVESTING');
    credScore = 85;
  }

  if (lower.includes('urgent') || lower.includes('immediate action') || lower.includes('asap')) {
    intents.push('URGENCY');
  }

  if (intents.length === 0) {
    intents.push('BENIGN');
  }

  const baseNlp = Math.max(finScore, credScore);
  const nlpScore = Math.min(100, Math.max(0, baseNlp + (glassworm ? 20 : 0)));

  return {
    intentLabels: intents,
    financialRequestScore: finScore,
    credentialHarvestingScore: credScore,
    glasswormFlag: glassworm,
    zeroWidthCharCount: zeroWidthCount,
    nlpScore,
  };
}

/**
 * Extracts and parses JSON from Gemini's response text.
 */
function parseGeminiJson(rawText: string): RawGeminiNLPResponse | null {
  try {
    let clean = rawText.trim();
    // Strip markdown code block wrappers if present
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }
    return JSON.parse(clean) as RawGeminiNLPResponse;
  } catch {
    return null;
  }
}

/**
 * Evaluates the intent and risk score of email body text using Google Gemini AI.
 *
 * - Detects financial coercion, credential harvesting, urgency, and benign intents.
 * - Extracts financialRequestScore, credentialHarvestingScore, and composite nlpScore (0-100).
 * - Detects zero-width character count and glassworm flag.
 * - Enforces explicit timeout and graceful fallback on API/network failure.
 */
export async function scoreIntent(
  cleanedBodyText: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<NLPResult> {
  const text = typeof cleanedBodyText === 'string' ? cleanedBodyText : '';
  const zeroWidthMatches = text.match(ZERO_WIDTH_REGEX);
  const zeroWidthCharCount = zeroWidthMatches ? zeroWidthMatches.length : 0;
  const glasswormFlag = zeroWidthCharCount > 50;

  if (!text.trim()) {
    return {
      intentLabels: ['BENIGN'],
      financialRequestScore: 0,
      credentialHarvestingScore: 0,
      glasswormFlag,
      zeroWidthCharCount,
      nlpScore: 0,
    };
  }

  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    // Graceful fallback to heuristic classification if API key is not configured
    return heuristicFallback(text, zeroWidthCharCount, glasswormFlag);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Analyze this email body for cyber threat and social engineering intent.
Respond with a single JSON object strictly matching this schema:
{
  "intentLabels": string[], // Choose relevant from: "FINANCIAL_COERCION", "CREDENTIAL_HARVESTING", "URGENCY", "EXTORTION", "MALWARE_LURE", "BENIGN", "MARKETING"
  "financialRequestScore": number, // 0 to 100
  "credentialHarvestingScore": number, // 0 to 100
  "nlpScore": number // 0 to 100 composite risk score
}

Email Body:
"""
${text.slice(0, 8000)}
"""`;

    const apiPromise = ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API call timed out')), timeoutMs)
    );

    const response = await Promise.race([apiPromise, timeoutPromise]);
    const responseText = response.text || '';
    const parsed = parseGeminiJson(responseText);

    if (!parsed) {
      return heuristicFallback(text, zeroWidthCharCount, glasswormFlag);
    }

    const intentLabels = Array.isArray(parsed.intentLabels) && parsed.intentLabels.length > 0
      ? parsed.intentLabels.map(String)
      : ['UNKNOWN'];

    const financialRequestScore = Math.min(
      100,
      Math.max(0, Number(parsed.financialRequestScore) || 0)
    );
    const credentialHarvestingScore = Math.min(
      100,
      Math.max(0, Number(parsed.credentialHarvestingScore) || 0)
    );

    let calculatedNlpScore = typeof parsed.nlpScore === 'number'
      ? parsed.nlpScore
      : Math.max(financialRequestScore, credentialHarvestingScore);

    if (glasswormFlag) {
      calculatedNlpScore = Math.min(100, calculatedNlpScore + 20);
    }

    const nlpScore = Math.min(100, Math.max(0, Math.round(calculatedNlpScore)));

    return {
      intentLabels,
      financialRequestScore,
      credentialHarvestingScore,
      glasswormFlag,
      zeroWidthCharCount,
      nlpScore,
    };
  } catch {
    // On timeout, network error, or rate limits, fallback gracefully without throwing
    return heuristicFallback(text, zeroWidthCharCount, glasswormFlag);
  }
}
