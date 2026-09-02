// FROZEN CONTRACT — do not modify without explicit team consensus.
// Every other package imports from here. Adding, renaming, or removing a field
// is a breaking change across the entire pipeline.

export interface ParsedAttachment {
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}

export interface MDM {
  messageId: string;
  rawHeaders: Record<string, string[]>;
  from: { name?: string; address: string };
  replyTo?: string;
  subject: string;
  date: string;
  bodyText: string;
  bodyHtmlRaw: string;
  bodyHtmlCleaned?: string;
  attachments: ParsedAttachment[];
  receivedHeadersRaw: string[];
}

export interface ForensicHop {
  ip: string;
  hostnameClaimed?: string;
  ptrValid: boolean;
  isPrivate: boolean;
  city?: string;
  country?: string;
  coordinates?: [number, number];
  asn?: string;
  trusted: boolean;
}

export interface ReverseHopResult {
  evidenceBoundaryIndex: number;
  path: ForensicHop[];
  originatingSenderIp: string | null;
  injectionDetected: boolean;
}

export interface Finding {
  type: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  source?: 'heuristic' | 'gemini' | 'hybrid';
}

export interface AuthResult {
  spf: 'pass' | 'fail' | 'neutral' | 'none';
  dkim: 'pass' | 'fail' | 'none';
  dmarcAlignment: 'strict' | 'relaxed' | 'fail';
  arcPass: boolean;
  authScore: number;
  findings: Finding[];
}

export interface IdentityResult {
  levenshteinDistance: number;
  damerauLevenshteinDistance: number;
  jaroWinklerScore: number;
  homoglyphMatch: boolean;
  matchedProtectedDomain?: string;
  identityScore: number;
  findings: Finding[];
}

export interface IPReputationResult {
  abuseConfidenceScore: number;
  isProxyOrVpn: boolean;
  timezoneDiscrepancyHours: number;
  ipScore: number;
  findings: Finding[];
}

export interface AIDiagnostics {
  provider: 'gemini' | 'heuristic' | 'hybrid';
  model: string;
  requestAttempted: boolean;
  requestSucceeded: boolean;
  responseParsed: boolean;
  latencyMs: number;
  fallbackUsed: boolean;
}

export interface NLPResult {
  provider: 'gemini' | 'heuristic' | 'hybrid';
  providerStatus: 'success' | 'fallback';
  fallbackReason?: string;
  model?: string;
  intentLabels: string[];
  financialRequestScore: number;
  credentialHarvestingScore: number;
  glasswormFlag: boolean;
  zeroWidthCharCount: number;
  nlpScore: number;
  confidence?: number;
  findings: Finding[];
  aiDiagnostics?: AIDiagnostics;
}

export interface RiskMatrix {
  authScore: number;
  identityScore: number;
  ipScore: number;
  nlpScore: number;
  baseScore?: number;
  corroborationBonus?: number;
  quarantineOverride?: boolean;
  override?: {
    triggered: boolean;
    type?: string;
    reason?: string;
  };
  finalScore: number;
  pillars: {
    authentication: {
      score: number;
      weight: number;
      findings: Finding[];
    };
    identity: {
      score: number;
      weight: number;
      findings: Finding[];
    };
    infrastructure: {
      score: number;
      weight: number;
      findings: Finding[];
    };
    nlp: {
      score: number;
      weight: number;
      findings: Finding[];
    };
  };
}

export interface AnalysisReport {
  messageId: string;
  senderDomain: string;
  timestamp: string;
  executionTimeMs?: number;
  forensicPath: ForensicHop[];
  authResults: AuthResult;
  riskMatrix: RiskMatrix;
  aiSummary: {
    provider: 'gemini' | 'heuristic' | 'hybrid';
    providerStatus: 'success' | 'fallback';
    fallbackReason?: string;
    model?: string;
    urgency: number;
    intent: string[];
    integrityHash: string;
    confidence: number;
    findings: Finding[];
    aiDiagnostics?: AIDiagnostics;
  };
}

export interface GmailMessageAnalysisEnrichment {
  analyzed: boolean;
  jobId?: string;
  finalScore?: number;
  verdict?: 'QUARANTINE' | 'FLAG' | 'SAFE';
}

