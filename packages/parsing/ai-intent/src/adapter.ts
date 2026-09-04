import { GoogleGenAI } from '@google/genai';
import type { ErrorClassification, RawGeminiNLPResponse } from './types.js';

export const VALID_INTENTS = new Set([
  'FINANCIAL_COERCION',
  'CREDENTIAL_HARVESTING',
  'URGENCY',
  'AUTHORITY_TRAP',
  'BRAND_IMPERSONATION',
  'EXTORTION',
  'MALWARE_LURE',
  'MALWARE_PAYLOAD',
  'BENIGN',
  'MARKETING',
  'UNKNOWN',
  'UNCLASSIFIED',
]);

export function normalizeScore(value: unknown): number {
  const num = Number(value);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(num)));
}

export function parseGeminiJson(rawText: string): RawGeminiNLPResponse | null {
  try {
    let clean = rawText.trim();
    const jsonMatch = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (jsonMatch && jsonMatch[1]) {
      clean = jsonMatch[1];
    } else {
      const start = clean.indexOf('{');
      const end = clean.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        clean = clean.slice(start, end + 1);
      }
    }
    return JSON.parse(clean.trim()) as RawGeminiNLPResponse;
  } catch {
    return null;
  }
}

export function classifyError(err: unknown): ErrorClassification {
  if (!err) return 'GENERIC_ERROR';

  const errObj = err as {
    status?: number;
    statusCode?: number;
    code?: string | number;
    message?: string;
  };

  const status = errObj.status ?? errObj.statusCode ?? (typeof errObj.code === 'number' ? errObj.code : undefined);
  const message = String(errObj.message || err).toLowerCase();

  // 1. Rate Limit / Quota
  if (
    status === 429 ||
    message.includes('429') ||
    message.includes('resource_exhausted') ||
    message.includes('quota exceeded') ||
    message.includes('rate limit')
  ) {
    return 'RATE_LIMIT';
  }

  // 2. Model Unavailable / High Demand
  if (
    status === 503 ||
    status === 504 ||
    message.includes('503') ||
    message.includes('unavailable') ||
    message.includes('high demand') ||
    message.includes('overloaded') ||
    message.includes('backend error')
  ) {
    return 'MODEL_UNAVAILABLE';
  }

  // 3. Invalid or Revoked API Key
  if (
    status === 401 ||
    status === 403 ||
    message.includes('api_key_invalid') ||
    message.includes('api key not valid') ||
    message.includes('permission_denied') ||
    message.includes('unauthenticated')
  ) {
    return 'INVALID_KEY';
  }

  // 4. Model Not Found / Unsupported
  if (
    status === 404 ||
    message.includes('404') ||
    message.includes('is not found') ||
    message.includes('not supported for this api version') ||
    message.includes('model not supported')
  ) {
    return 'MODEL_NOT_FOUND';
  }

  // 5. Timeout
  if (message.includes('timed out') || message.includes('etimedout') || message.includes('timeout')) {
    return 'TIMEOUT';
  }

  // 6. Transient Network
  if (
    message.includes('econnreset') ||
    message.includes('enotfound') ||
    message.includes('fetch failed') ||
    message.includes('network error')
  ) {
    return 'TRANSIENT_NETWORK';
  }

  return 'GENERIC_ERROR';
}

export function parseRetryAfterMs(err: unknown): number | null {
  if (!err) return null;
  const message = String((err as { message?: string }).message || err);

  // Look for "retry after X seconds" or "retry in X s"
  const matchSec = message.match(/retry(?:-after|\s+after|\s+in)?\s+(\d+(?:\.\d+)?)\s*(?:s|sec|seconds)/i);
  if (matchSec && matchSec[1]) {
    const sec = parseFloat(matchSec[1]);
    if (!Number.isNaN(sec) && sec > 0) {
      return Math.round(sec * 1000);
    }
  }

  return null;
}

export async function callGeminiModel(
  modelName: string,
  apiKey: string,
  prompt: string,
  timeoutMs: number = 8000
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });

  const apiPromise = ai.models.generateContent({
    model: modelName,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
    },
  });

  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => reject(new Error(`Gemini API call timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    const response = await Promise.race([apiPromise, timeoutPromise]);
    return response.text || '';
  } finally {
    if (timerId) clearTimeout(timerId);
  }
}
