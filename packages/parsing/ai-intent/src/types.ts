import type { Finding, NLPResult } from '@mailiac/shared-types';

export interface ExtractedUrlInfo {
  href: string;
  text?: string;
  domain?: string;
}

export interface ScoreIntentOptions {
  text: string;
  subject?: string;
  sender?: string;
  senderDomain?: string;
  urls?: ExtractedUrlInfo[];
  timeoutMs?: number;
  healthTracker?: AIHealthTracker;
}

export interface CredentialEntry {
  id: string;
  apiKey: string;
  maskedId: string;
}

export interface ModelEntry {
  name: string;
  priority: number;
}

export type ErrorClassification =
  | 'RATE_LIMIT'        // 429 RESOURCE_EXHAUSTED
  | 'MODEL_UNAVAILABLE' // 503 UNAVAILABLE / High demand
  | 'INVALID_KEY'       // 400 / 401 / 403 API key invalid or revoked
  | 'MODEL_NOT_FOUND'   // 404 Model not found or deprecated
  | 'TIMEOUT'           // Request timed out
  | 'TRANSIENT_NETWORK' // Network reset / socket error
  | 'PARSE_ERROR'       // Response not valid JSON
  | 'GENERIC_ERROR';

export interface RouteAttemptTelemetry {
  model: string;
  credentialId: string;
  attemptNumber: number;
  latencyMs: number;
  error?: ErrorClassification;
  errorMessage?: string;
}

export interface AIHealthTracker {
  isCredentialAvailable(id: string): boolean;
  isModelAvailable(modelName: string): boolean;
  markRateLimited(id: string, cooldownMs?: number): void;
  markModelUnavailable(modelName: string, cooldownMs?: number): void;
  markCredentialRevoked(id: string): void;
  markModelNotFound(modelName: string): void;
  recordSuccess(credentialId: string, modelName: string): void;
  reset(): void;
}

export interface RawGeminiNLPResponse {
  intentLabels?: string[];
  urgency_score?: number;
  financial_score?: number;
  authority_score?: number;
  harvesting_score?: number;
  financialRequestScore?: number;
  credentialHarvestingScore?: number;
  nlpScore?: number;
  confidence?: number;
  findings?: Finding[];
}

export interface RouterConfig {
  credentials: CredentialEntry[];
  models: ModelEntry[];
  maxAttempts: number;
  timeoutPerAttemptMs: number;
  cooldown429Ms: number;
  cooldown503Ms: number;
}
