import { GoogleGenAI } from '@google/genai';
import type { NLPResult } from '@mailiac/shared-types';

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MODEL = 'gemini-2.5-flash';

const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF\u00AD\u200E\u200F\u202A-\u202E\u2060-\u2064\u180E]/g;

interface RawGeminiNLPResponse {
  intentLabels?: string[];
  urgency_score?: number;
  financial_score?: number;
  authority_score?: number;
  harvesting_score?: number;
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
  let urgencyScore = 0;
  let authorityScore = 0;

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

  const urgencyKeywords = [
    'urgent',
    'immediate action',
    'asap',
    'short duration',
    'deadline',
    'window closes',
    'action required',
    'must verify immediately',
  ];

  const authorityKeywords = [
    'iit',
    'academic cell',
    'placement cell',
    'cfo',
    'dean',
    'director',
    'univox',
    'official notice',
  ];

  if (finKeywords.some((kw) => lower.includes(kw))) {
    intents.push('FINANCIAL_COERCION');
    finScore = 80;
  }

  if (credKeywords.some((kw) => lower.includes(kw))) {
    intents.push('CREDENTIAL_HARVESTING');
    credScore = 85;
  }

  if (urgencyKeywords.some((kw) => lower.includes(kw))) {
    intents.push('URGENCY');
    urgencyScore = 60;
  }

  if (authorityKeywords.some((kw) => lower.includes(kw))) {
    intents.push('AUTHORITY_TRAP');
    authorityScore = 50;
  }

  if (intents.length === 0) {
    intents.push('BENIGN');
  }

  const baseNlp = Math.max(finScore, credScore, urgencyScore, authorityScore);
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
 * - Performs deep semantic audit across 4 parameters: Urgency & Scarcity, Financial Coercion, Authority Trap, Harvesting Risk.
 * - Extracts scores and composite nlpScore (0-100).
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

    const prompt = `You are a Lead Cybersecurity Forensic Linguist and threat intelligence analyst. Your job is to perform a deep-level semantic audit on an incoming email payload to identify signs of Business Email Compromise (BEC), spear phishing, financial coercion, authority traps, or credential harvesting.

You must ignore the visual quality of the email and focus strictly on cognitive manipulation tactics and unverified payload redirects.

Analyze the provided email content against these FOUR psychological and structural parameters (score each from 0 to 100):

1. URGENCY & SCARCITY (urgency_score):
   - Detect artificial deadlines demanding action within 24–48 hours (e.g., "window closes tomorrow", "must verify immediately", "short duration", "immediate action required").
   - Identify high-pressure language exploiting fear of negative consequences (loss of placement, account suspension, credit loss, missed opportunities).

2. FINANCIAL COERCION (financial_score):
   - Identify wire transfer demands, banking detail changes, invoice updates, or unexpected billing issues.
   - Detect offers of high monetary value, "giveaways," or instant corporate rewards to bypass suspicion.

3. AUTHORITY TRAP (authority_score):
   - Look for references to prestigious organizations, brands, or administrative entities to establish trust (e.g., "IIT Kharagpur", "JECRC Academic Cell", "Univox Academy", "CFO").
   - Detect external senders claiming to be internal leadership or administrative coordinators.

4. HARVESTING RISK (harvesting_score):
   - Detect instructions directing users to input credentials, PII, or security codes on unverified external forms.
   - Heavily penalize the use of free third-party collection platforms (such as Google Forms, Typeform, bit.ly links) or unverified external portals.

Respond with a single JSON object strictly matching this schema:
{
  "intentLabels": string[], // Choose applicable from: "FINANCIAL_COERCION", "CREDENTIAL_HARVESTING", "URGENCY", "AUTHORITY_TRAP", "EXTORTION", "MALWARE_LURE", "BENIGN", "MARKETING"
  "urgency_score": number, // 0 to 100
  "financial_score": number, // 0 to 100
  "authority_score": number, // 0 to 100
  "harvesting_score": number, // 0 to 100
  "nlpScore": number // 0 to 100 composite risk score (highest risk level identified)
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

    const urgencyScore = Math.min(100, Math.max(0, Number(parsed.urgency_score) || 0));
    const financialScore = Math.min(
      100,
      Math.max(0, Number(parsed.financial_score) || Number(parsed.financialRequestScore) || 0)
    );
    const authorityScore = Math.min(100, Math.max(0, Number(parsed.authority_score) || 0));
    const harvestingScore = Math.min(
      100,
      Math.max(0, Number(parsed.harvesting_score) || Number(parsed.credentialHarvestingScore) || 0)
    );

    let calculatedNlpScore = typeof parsed.nlpScore === 'number'
      ? parsed.nlpScore
      : Math.max(urgencyScore, financialScore, authorityScore, harvestingScore);

    calculatedNlpScore = Math.max(calculatedNlpScore, urgencyScore, financialScore, authorityScore, harvestingScore);

    if (glasswormFlag) {
      calculatedNlpScore = Math.min(100, calculatedNlpScore + 20);
    }

    const nlpScore = Math.min(100, Math.max(0, Math.round(calculatedNlpScore)));

    return {
      intentLabels,
      financialRequestScore: financialScore,
      credentialHarvestingScore: harvestingScore,
      glasswormFlag,
      zeroWidthCharCount,
      nlpScore,
    };
  } catch {
    // On timeout, network error, or rate limits, fallback gracefully without throwing
    return heuristicFallback(text, zeroWidthCharCount, glasswormFlag);
  }
}
