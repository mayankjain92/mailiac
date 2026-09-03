import type {
  AIHealthTracker,
  CredentialEntry,
  ModelEntry,
  RawGeminiNLPResponse,
  RouteAttemptTelemetry,
  RouterConfig,
} from './types.js';
import { callGeminiModel, classifyError, parseGeminiJson, parseRetryAfterMs } from './adapter.js';

export interface RouterSuccessResult {
  success: true;
  model: string;
  credentialId: string;
  rawResponse: RawGeminiNLPResponse;
  latencyMs: number;
  trail: RouteAttemptTelemetry[];
}

export interface RouterFailureResult {
  success: false;
  fallbackReason: string;
  latencyMs: number;
  trail: RouteAttemptTelemetry[];
}

export type RouterResult = RouterSuccessResult | RouterFailureResult;

interface CandidatePair {
  model: ModelEntry;
  credential: CredentialEntry;
}

/**
 * Builds candidate pairs (model + credential) prioritizing:
 * 1. Primary model with all healthy credentials.
 * 2. Secondary fallback models with healthy credentials.
 */
export function buildCandidatePairs(
  models: ModelEntry[],
  credentials: CredentialEntry[],
  healthTracker: AIHealthTracker
): CandidatePair[] {
  const pairs: CandidatePair[] = [];

  for (const model of models) {
    if (!healthTracker.isModelAvailable(model.name)) {
      continue;
    }
    for (const cred of credentials) {
      if (!healthTracker.isCredentialAvailable(cred.id)) {
        continue;
      }
      pairs.push({ model, credential: cred });
    }
  }

  return pairs;
}

export function formatTrailSummary(trail: RouteAttemptTelemetry[]): string {
  if (trail.length === 0) {
    return 'No available healthy AI model or credential candidates in pool';
  }
  const parts = trail.map((t) => {
    const detail = t.errorMessage || t.error || 'FAILED';
    return `[${t.model} / ${t.credentialId}: ${detail} (${t.latencyMs}ms)]`;
  });
  return `Gemini failover exhausted (${trail.length} attempt${trail.length > 1 ? 's' : ''}): ${parts.join(' -> ')}`;
}

export async function routeGeminiRequest(
  prompt: string,
  config: RouterConfig,
  healthTracker: AIHealthTracker
): Promise<RouterResult> {
  const startOverall = Date.now();
  const trail: RouteAttemptTelemetry[] = [];

  const candidatePairs = buildCandidatePairs(config.models, config.credentials, healthTracker);

  if (candidatePairs.length === 0) {
    return {
      success: false,
      fallbackReason: 'No healthy Gemini models or credentials available in pool (cooldown active or none configured)',
      latencyMs: Date.now() - startOverall,
      trail,
    };
  }

  const maxAttempts = Math.min(config.maxAttempts, candidatePairs.length);
  let attemptIdx = 0;

  while (attemptIdx < candidatePairs.length && trail.length < maxAttempts) {
    const pair = candidatePairs[attemptIdx]!;
    attemptIdx++;

    // Re-verify health in case previous loop iteration marked credential or model
    if (!healthTracker.isModelAvailable(pair.model.name) || !healthTracker.isCredentialAvailable(pair.credential.id)) {
      continue;
    }

    const startAttempt = Date.now();
    try {
      const rawText = await callGeminiModel(
        pair.model.name,
        pair.credential.apiKey,
        prompt,
        config.timeoutPerAttemptMs
      );

      const parsed = parseGeminiJson(rawText);
      const latencyMs = Date.now() - startAttempt;

      if (!parsed) {
        trail.push({
          model: pair.model.name,
          credentialId: pair.credential.maskedId,
          attemptNumber: trail.length + 1,
          latencyMs,
          error: 'PARSE_ERROR',
          errorMessage: 'Malformed JSON response from model',
        });
        continue;
      }

      // Success!
      healthTracker.recordSuccess(pair.credential.id, pair.model.name);
      trail.push({
        model: pair.model.name,
        credentialId: pair.credential.maskedId,
        attemptNumber: trail.length + 1,
        latencyMs,
      });

      return {
        success: true,
        model: pair.model.name,
        credentialId: pair.credential.maskedId,
        rawResponse: parsed,
        latencyMs: Date.now() - startOverall,
        trail,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startAttempt;
      const classification = classifyError(err);
      const errMsg = err instanceof Error ? err.message : String(err);

      trail.push({
        model: pair.model.name,
        credentialId: pair.credential.maskedId,
        attemptNumber: trail.length + 1,
        latencyMs,
        error: classification,
        errorMessage: errMsg,
      });

      // Update Health State according to failure mode
      if (classification === 'RATE_LIMIT') {
        const retryAfter = parseRetryAfterMs(err) ?? config.cooldown429Ms;
        healthTracker.markRateLimited(pair.credential.id, retryAfter);
      } else if (classification === 'MODEL_UNAVAILABLE') {
        healthTracker.markModelUnavailable(pair.model.name, config.cooldown503Ms);
      } else if (classification === 'INVALID_KEY') {
        healthTracker.markCredentialRevoked(pair.credential.id);
      } else if (classification === 'MODEL_NOT_FOUND') {
        healthTracker.markModelNotFound(pair.model.name);
      }

      // Apply subtle jittered backoff on transient network or timeout issues
      if (classification === 'TIMEOUT' || classification === 'TRANSIENT_NETWORK') {
        const backoffMs = 150 + Math.floor(Math.random() * 150);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
  }

  return {
    success: false,
    fallbackReason: formatTrailSummary(trail),
    latencyMs: Date.now() - startOverall,
    trail,
  };
}
