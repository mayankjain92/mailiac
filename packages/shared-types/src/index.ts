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

export interface AuthResult {
  spf: 'pass' | 'fail' | 'neutral' | 'none';
  dkim: 'pass' | 'fail' | 'none';
  dmarcAlignment: 'strict' | 'relaxed' | 'fail';
  arcPass: boolean;
  authScore: number;
}

export interface IdentityResult {
  levenshteinDistance: number;
  damerauLevenshteinDistance: number;
  jaroWinklerScore: number;
  homoglyphMatch: boolean;
  matchedProtectedDomain?: string;
  identityScore: number;
}

export interface IPReputationResult {
  abuseConfidenceScore: number;
  isProxyOrVpn: boolean;
  timezoneDiscrepancyHours: number;
  ipScore: number;
}

export interface NLPResult {
  intentLabels: string[];
  financialRequestScore: number;
  credentialHarvestingScore: number;
  glasswormFlag: boolean;
  zeroWidthCharCount: number;
  nlpScore: number;
}

export interface RiskMatrix {
  authScore: number;
  identityScore: number;
  ipScore: number;
  nlpScore: number;
  finalScore: number;
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
    urgency: number;
    intent: string[];
    integrityHash: string;
  };
}
