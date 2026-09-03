import type {
  AnalysisReport,
  Finding,
  ForensicHop,
  AuthResult,
  RiskMatrix,
} from '@mailiac/shared-types';

export type NormalizedSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface ImportantFindingCard {
  id: string;
  title: string;
  description: string;
  severity: NormalizedSeverity;
  type: 'critical' | 'alert' | 'warn' | 'info' | 'pass';
  isMinorAnomaly: boolean;
  isEngineEvent: boolean;
  source?: string;
}

export interface PartitionedFindings {
  primaryFindings: ImportantFindingCard[];
  minorAnomalies: ImportantFindingCard[];
  engineEvents: ImportantFindingCard[];
  allFindings: ImportantFindingCard[];
  totalCount: number;
  forensicCount: number;
}

export interface HopClassification {
  tier: 'RECOGNIZED PROVIDER' | 'TRUSTED INFRA' | 'UNVERIFIED' | 'LIKELY FORGED';
  tierBadgeBg: string;
  tierBadgeText: string;
  tierBadgeBorder: string;
  isSuspiciousHostname: boolean;
  evidence: string;
  suspiciousReason?: string;
}

export interface OverrideDetails {
  isOverridden: boolean;
  type?: string;
  reason?: string;
  baseScore: number;
  finalScore: number;
  scoreDifference: number;
  corroborationBonus?: number;
  pillarScores: {
    auth: number;
    identity: number;
    infra: number;
    nlp: number;
  };
  pillarWeights: {
    auth: number;
    identity: number;
    infra: number;
    nlp: number;
  };
}

export interface AuthPostureSummary {
  id: string;
  status: 'pass' | 'warn' | 'fail';
  text: string;
  details?: {
    spfStatus: string;
    dkimStatus: string;
    dmarcAlignment: string;
    arcStatus: string;
    isAligned: boolean;
  };
}

export function getSeverityRank(sev: string | undefined | null): number {
  const s = (sev || '').toUpperCase().trim();
  if (s === 'CRITICAL') return 5;
  if (s === 'HIGH') return 4;
  if (s === 'MEDIUM') return 3;
  if (s === 'LOW') return 2;
  if (s === 'INFO') return 1;
  return 0;
}

export function normalizeSeverity(sev: string | undefined | null): NormalizedSeverity {
  const s = (sev || '').toUpperCase().trim();
  if (s === 'CRITICAL') return 'CRITICAL';
  if (s === 'HIGH') return 'HIGH';
  if (s === 'MEDIUM') return 'MEDIUM';
  if (s === 'LOW') return 'LOW';
  return 'INFO';
}

const ACTIONABLE_THREAT_TYPES = new Set([
  'HIGH_RISK_QUARANTINE',
  'AUTHORITY_TRAP',
  'FINANCIAL_COERCION',
  'CREDENTIAL_HARVESTING',
  'HOMOGLYPH_DOMAIN',
  'HOMOGLYPH_DOMAIN_SPOOFING',
  'IMPERSONATION',
  'SENDER_IMPERSONATION',
  'MALICIOUS_PAYLOAD',
  'ZERO_WIDTH_ATTACK',
  'GLASSWORM_CLOAKING',
]);

const SUSPICIOUS_TLDS = new Set([
  'domain',
  'local',
  'internal',
  'lan',
  'corp',
  'home',
  'invalid',
  'test',
  'example',
  'dummy',
  'fake',
]);

/**
 * Extracts and deduplicates findings from all pillars, auth results, and aiSummary.
 * Deduplication is keyed by normalized type and description.
 * Sorted by severity (CRITICAL > HIGH > MEDIUM > LOW > INFO), then actionable threat priority, then type.
 */
export function getDedupedFindings(report: AnalysisReport | null | undefined): Finding[] {
  if (!report) return [];

  const rawFindings: (Partial<Finding> | undefined | null)[] = [
    ...(report.riskMatrix?.pillars?.authentication?.findings || []),
    ...(report.riskMatrix?.pillars?.identity?.findings || []),
    ...(report.riskMatrix?.pillars?.infrastructure?.findings || []),
    ...(report.riskMatrix?.pillars?.nlp?.findings || []),
    ...(report.aiSummary?.findings || []),
    ...(report.authResults?.findings || []),
  ];

  const dedupedMap = new Map<string, Finding>();

  for (const f of rawFindings) {
    if (!f) continue;
    const rawType = (f.type || 'TECHNICAL_ANOMALY').trim().toUpperCase();
    const rawDesc = (f.description || '').trim();
    const descNorm = rawDesc.toLowerCase();
    const key = `${rawType}::${descNorm}`;

    const normalizedSev = normalizeSeverity(f.severity);
    const validFinding: Finding = {
      type: rawType,
      severity: (normalizedSev === 'CRITICAL' ? 'HIGH' : normalizedSev) as Finding['severity'],
      description: rawDesc || 'No additional technical description provided.',
      source: f.source || 'heuristic',
    };

    const existing = dedupedMap.get(key);
    if (!existing) {
      dedupedMap.set(key, validFinding);
    } else {
      // Retain the higher severity if duplicates differ in severity
      const existingRank = getSeverityRank(existing.severity);
      const currentRank = getSeverityRank(f.severity);
      if (currentRank > existingRank) {
        dedupedMap.set(key, { ...existing, severity: validFinding.severity, source: f.source || existing.source });
      }
    }
  }

  return Array.from(dedupedMap.values()).sort((a, b) => {
    const rA = getSeverityRank(a.severity);
    const rB = getSeverityRank(b.severity);
    if (rB !== rA) {
      return rB - rA; // Highest severity first: CRITICAL > HIGH > MEDIUM > LOW > INFO
    }

    // Actionable threat priority boost within same severity level
    const isActionA = ACTIONABLE_THREAT_TYPES.has(a.type.toUpperCase());
    const isActionB = ACTIONABLE_THREAT_TYPES.has(b.type.toUpperCase());
    if (isActionA !== isActionB) {
      return isActionA ? -1 : 1;
    }

    return a.type.localeCompare(b.type);
  });
}

/**
 * Extracts unique payload & attachment findings without duplicating items.
 */
export function getPayloadFindings(report: AnalysisReport | null | undefined): Finding[] {
  const allDeduped = getDedupedFindings(report);

  return allDeduped.filter((f) => {
    const t = (f.type || '').toLowerCase();
    const d = (f.description || '').toLowerCase();
    return (
      t.includes('attachment') ||
      t.includes('url') ||
      t.includes('link') ||
      t.includes('cloak') ||
      t.includes('glassworm') ||
      t.includes('zero_width') ||
      t.includes('payload') ||
      d.includes('attachment') ||
      d.includes('link') ||
      d.includes('url') ||
      d.includes('payload') ||
      d.includes('cloaking') ||
      d.includes('hidden')
    );
  });
}

/**
 * Generic classifier to distinguish engine/scoring mechanics from email forensic evidence.
 * Engine events: HIGH_RISK_QUARANTINE, CIRCUIT_BREAKER_OVERRIDE, SCORING_OVERRIDE, PIPELINE_ERROR, etc.
 * Forensic evidence: credential harvesting, malicious URLs, spoofed/lookalike domains, header anomalies,
 * authentication failures, suspicious attachments, obfuscation, impersonation evidence, etc.
 */
export function isEngineEventFinding(
  findingOrType: Finding | Partial<Finding> | string | undefined | null
): boolean {
  if (!findingOrType) return false;
  const rawType = (
    typeof findingOrType === 'string' ? findingOrType : findingOrType.type || ''
  ).trim().toUpperCase();

  const ENGINE_EVENT_TYPES = new Set([
    'HIGH_RISK_QUARANTINE',
    'CIRCUIT_BREAKER',
    'CIRCUIT_BREAKER_OVERRIDE',
    'SCORING_OVERRIDE',
    'SCORE_OVERRIDE',
    'QUARANTINE_OVERRIDE',
    'PIPELINE_ERROR',
    'ENGINE_OVERRIDE',
    'THREAT_LEVEL_QUARANTINE',
  ]);

  if (ENGINE_EVENT_TYPES.has(rawType)) {
    return true;
  }

  // Generic pattern matching for engine overrides / circuit breakers
  if (
    rawType.includes('CIRCUIT_BREAKER') ||
    rawType.includes('SCORING_OVERRIDE') ||
    rawType.includes('SCORE_OVERRIDE') ||
    rawType.includes('QUARANTINE_OVERRIDE')
  ) {
    return true;
  }

  // Description pattern check for engine circuit breaker statements
  const desc = (
    typeof findingOrType === 'object' ? findingOrType.description || '' : ''
  ).toLowerCase();
  if (
    desc.includes('circuit breaker triggered') ||
    desc.includes('quarantine override triggered') ||
    desc.includes('fatal circuit breaker matched') ||
    desc.includes('scoring override triggered')
  ) {
    return true;
  }

  return false;
}

/**
 * Transforms a single raw Finding into a structured ImportantFindingCard.
 */
export function toImportantFindingCard(f: Finding, index: number): ImportantFindingCard {
  const normSev = normalizeSeverity(f.severity);
  const isMinor = normSev === 'LOW' || normSev === 'INFO';
  const isEngine = isEngineEventFinding(f);
  const typeLabel = (f.type || 'TECHNICAL_ANOMALY').replace(/_/g, ' ').toUpperCase();

  const cardType: 'critical' | 'alert' | 'warn' | 'info' | 'pass' =
    normSev === 'CRITICAL'
      ? 'critical'
      : normSev === 'HIGH'
      ? 'alert'
      : normSev === 'MEDIUM'
      ? 'warn'
      : 'info';

  return {
    id: `finding-${index}-${f.type.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    title: typeLabel,
    description: f.description || 'No additional technical description provided.',
    severity: normSev,
    type: cardType,
    isMinorAnomaly: isMinor,
    isEngineEvent: isEngine,
    source: f.source,
  };
}

/**
 * Partitions deduplicated findings into:
 * - primaryFindings: Actionable threats (CRITICAL, HIGH, MEDIUM forensic evidence)
 * - minorAnomalies: Lower-severity signals (LOW, INFO, TECHNICAL_ANOMALY forensic evidence)
 * - engineEvents: Engine/system scoring events (HIGH_RISK_QUARANTINE, CIRCUIT_BREAKER, etc.)
 *
 * If no CRITICAL/HIGH/MEDIUM forensic findings exist, minor anomalies are promoted to primary
 * so the analyst never sees an empty screen when findings exist.
 */
export function getPartitionedFindings(report: AnalysisReport | null | undefined): PartitionedFindings {
  const deduped = getDedupedFindings(report);
  const allCards = deduped.map(toImportantFindingCard);

  // Segregate engine events from genuine forensic evidence
  const engineEvents = allCards.filter((c) => c.isEngineEvent);
  const forensicCards = allCards.filter((c) => !c.isEngineEvent);

  const primary = forensicCards.filter((c) => !c.isMinorAnomaly);
  const minor = forensicCards.filter((c) => c.isMinorAnomaly);

  // If there are zero primary threats but some minor anomalies, display them as primary
  if (primary.length === 0 && minor.length > 0) {
    return {
      primaryFindings: minor,
      minorAnomalies: [],
      engineEvents,
      allFindings: allCards,
      totalCount: allCards.length,
      forensicCount: forensicCards.length,
    };
  }

  return {
    primaryFindings: primary,
    minorAnomalies: minor,
    engineEvents,
    allFindings: allCards,
    totalCount: allCards.length,
    forensicCount: forensicCards.length,
  };
}

/**
 * Derives all Important Findings cards dynamically from real deduped findings.
 * Sorts strictly by severity (CRITICAL > HIGH > MEDIUM > LOW > INFO).
 * Never injects hardcoded or fake category cards over real data.
 */
export function getImportantFindings(report: AnalysisReport | null | undefined): ImportantFindingCard[] {
  const findings = getDedupedFindings(report);
  return findings.map(toImportantFindingCard);
}

/**
 * Evaluates RFC822 / SPF / DKIM / DMARC / ARC authentication fields directly,
 * generating accurate, data-driven forensic summary copy that strictly reflects
 * the underlying cryptographic verification evidence.
 */
export function getAuthPostureSummary(auth: AuthResult | undefined | null): AuthPostureSummary {
  if (!auth) {
    return {
      id: 'auth-incomplete',
      status: 'warn',
      text: 'Authentication evidence is incomplete: no cryptographic records found in payload.',
    };
  }

  const spf = typeof auth.spf === 'string' ? auth.spf.toLowerCase().trim() : '';
  const dkim = typeof auth.dkim === 'string' ? auth.dkim.toLowerCase().trim() : '';
  const rawDmarc = typeof auth.dmarcAlignment === 'string'
    ? auth.dmarcAlignment.toLowerCase().trim()
    : typeof (auth as unknown as { dmarc?: string }).dmarc === 'string'
    ? (auth as unknown as { dmarc?: string }).dmarc!.toLowerCase().trim()
    : '';

  const arcPass = Boolean(auth.arcPass);

  // If all fields are missing or empty
  if (!spf && !dkim && !rawDmarc) {
    return {
      id: 'auth-incomplete',
      status: 'warn',
      text: 'Authentication evidence is incomplete: no cryptographic records found in payload.',
    };
  }

  // 1. Legitimate Forwarded ARC Chain
  if (arcPass) {
    return {
      id: 'auth-pass-arc',
      status: 'pass',
      text: 'Forwarded message authenticated via valid Authenticated Received Chain (ARC).',
      details: {
        spfStatus: spf || 'none',
        dkimStatus: dkim || 'none',
        dmarcAlignment: rawDmarc || 'none',
        arcStatus: 'pass',
        isAligned: true,
      },
    };
  }

  // 2. Critical DKIM Signature Verification Failure (Tampering Threat)
  if (dkim === 'fail') {
    if (spf === 'pass') {
      return {
        id: 'auth-fail-dkim-spf-pass',
        status: 'fail',
        text: 'Sender IP authorized by SPF, but DKIM signature verification failed (possible header or body tampering).',
        details: {
          spfStatus: spf,
          dkimStatus: 'fail',
          dmarcAlignment: rawDmarc,
          arcStatus: 'none',
          isAligned: false,
        },
      };
    }
    if (spf === 'fail') {
      return {
        id: 'auth-fail-all',
        status: 'fail',
        text: 'Authentication failed on all mechanisms: SPF hard fail, invalid DKIM signature, and DMARC alignment failure.',
        details: {
          spfStatus: 'fail',
          dkimStatus: 'fail',
          dmarcAlignment: rawDmarc,
          arcStatus: 'none',
          isAligned: false,
        },
      };
    }
    return {
      id: 'auth-fail-dkim',
      status: 'fail',
      text: 'DKIM signature verification failed — cryptographic body hash or header signature does not match domain public key.',
      details: {
        spfStatus: spf || 'none',
        dkimStatus: 'fail',
        dmarcAlignment: rawDmarc || 'none',
        arcStatus: 'none',
        isAligned: false,
      },
    };
  }

  // 3. Cryptographic Alignment with DMARC (Strict or Relaxed or Pass)
  const isDmarcAligned = rawDmarc === 'strict' || rawDmarc === 'relaxed' || rawDmarc === 'pass';
  const alignmentLabel = rawDmarc === 'relaxed' ? 'relaxed alignment' : 'strict alignment';

  // 3a. Both DKIM and SPF passed with DMARC alignment
  if (isDmarcAligned && dkim === 'pass' && spf === 'pass') {
    return {
      id: 'auth-pass-all',
      status: 'pass',
      text: `Sender authentication passed with aligned SPF and DKIM records (${alignmentLabel}).`,
      details: {
        spfStatus: 'pass',
        dkimStatus: 'pass',
        dmarcAlignment: rawDmarc,
        arcStatus: 'none',
        isAligned: true,
      },
    };
  }

  // 3b. DKIM passed with DMARC alignment (e.g. DKIM pass + DMARC strict, SPF neutral or none)
  if (isDmarcAligned && dkim === 'pass') {
    const spfClause =
      spf === 'neutral'
        ? 'SPF is neutral'
        : spf === 'none'
        ? 'SPF is not configured'
        : spf === 'fail'
        ? 'SPF check failed'
        : '';

    const arcClause = !arcPass ? 'no ARC chain is present' : '';
    const limitations = [spfClause, arcClause].filter(Boolean).join(' and ');
    const limitationSuffix = limitations ? `; ${limitations}.` : '.';

    return {
      id: 'auth-pass-dkim-dmarc',
      status: 'pass',
      text: `DKIM and DMARC authentication passed with ${alignmentLabel}${limitationSuffix}`,
      details: {
        spfStatus: spf || 'none',
        dkimStatus: 'pass',
        dmarcAlignment: rawDmarc,
        arcStatus: 'none',
        isAligned: true,
      },
    };
  }

  // 3c. SPF passed with DMARC alignment (DKIM none or neutral)
  if (isDmarcAligned && spf === 'pass') {
    const dkimClause =
      dkim === 'none'
        ? 'no DKIM signature is present'
        : dkim
        ? `DKIM status is ${dkim}`
        : '';
    const suffix = dkimClause ? ` (${dkimClause}).` : '.';

    return {
      id: 'auth-pass-spf-dmarc',
      status: 'pass',
      text: `Sender IP authorized by SPF with ${alignmentLabel}${suffix}`,
      details: {
        spfStatus: 'pass',
        dkimStatus: dkim || 'none',
        dmarcAlignment: rawDmarc,
        arcStatus: 'none',
        isAligned: true,
      },
    };
  }

  // 4. Standalone Valid DKIM but DMARC alignment failed / unaligned
  if (dkim === 'pass' && rawDmarc === 'fail') {
    return {
      id: 'auth-warn-dkim-unaligned',
      status: 'warn',
      text: 'DKIM signature cryptographically verified for signing domain, but domain does not align with sender address (DMARC alignment failed).',
      details: {
        spfStatus: spf || 'none',
        dkimStatus: 'pass',
        dmarcAlignment: 'fail',
        arcStatus: 'none',
        isAligned: false,
      },
    };
  }

  // 5. Standalone Valid SPF but DMARC alignment failed / unaligned
  if (spf === 'pass' && rawDmarc === 'fail') {
    return {
      id: 'auth-warn-spf-unaligned',
      status: 'warn',
      text: 'Sender IP authorized by SPF, but sender domain failed DMARC alignment and lacks aligned DKIM signatures.',
      details: {
        spfStatus: 'pass',
        dkimStatus: dkim || 'none',
        dmarcAlignment: 'fail',
        arcStatus: 'none',
        isAligned: false,
      },
    };
  }

  // 6. Explicit SPF Failure without valid DKIM
  if (spf === 'fail') {
    if (rawDmarc === 'fail') {
      return {
        id: 'auth-fail-spf-dmarc',
        status: 'fail',
        text: 'Sender authentication failed: originating IP unauthorized by SPF and message failed DMARC alignment.',
        details: {
          spfStatus: 'fail',
          dkimStatus: dkim || 'none',
          dmarcAlignment: 'fail',
          arcStatus: 'none',
          isAligned: false,
        },
      };
    }
    return {
      id: 'auth-fail-spf',
      status: 'fail',
      text: 'Sender IP unauthorized by domain SPF policy.',
      details: {
        spfStatus: 'fail',
        dkimStatus: dkim || 'none',
        dmarcAlignment: rawDmarc || 'none',
        arcStatus: 'none',
        isAligned: false,
      },
    };
  }

  // 7. Partial / Inconclusive / Neutral Records (Neither pass nor explicit fail)
  if (spf === 'neutral') {
    return {
      id: 'auth-warn-spf-neutral',
      status: 'warn',
      text: 'SPF record evaluated to neutral (no authorization policy established) and no DKIM signatures are present.',
      details: {
        spfStatus: 'neutral',
        dkimStatus: dkim || 'none',
        dmarcAlignment: rawDmarc || 'none',
        arcStatus: 'none',
        isAligned: false,
      },
    };
  }

  if (spf === 'none' && (dkim === 'none' || !dkim)) {
    return {
      id: 'auth-warn-no-records',
      status: 'warn',
      text: 'No sender authentication policies configured: domain lacks SPF records and DKIM signatures.',
      details: {
        spfStatus: 'none',
        dkimStatus: 'none',
        dmarcAlignment: rawDmarc || 'none',
        arcStatus: 'none',
        isAligned: false,
      },
    };
  }

  // 8. General Partial Fallback (Used only when records are genuinely partial/unverified)
  return {
    id: 'auth-warn-partial',
    status: 'warn',
    text: 'Sender authentication records are partial or unverified.',
    details: {
      spfStatus: spf || 'none',
      dkimStatus: dkim || 'none',
      dmarcAlignment: rawDmarc || 'none',
      arcStatus: 'none',
      isAligned: false,
    },
  };
}

/**
 * Validates whether a hostname resembles a genuine Fully Qualified Domain Name (FQDN).
 * Rejects single-label hosts (e.g. "localhost"), malformed characters, and suspicious/test TLDs (e.g. "a3.domain").
 */
export function isValidFqdn(hostname: string | undefined): boolean {
  if (!hostname || typeof hostname !== 'string') return false;

  let cleaned = hostname.trim().toLowerCase();
  if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
    cleaned = cleaned.slice(1, -1);
  }
  if (cleaned.startsWith('ipv6:')) {
    cleaned = cleaned.slice(5);
  }

  // Remove trailing dot if present in standard DNS format
  if (cleaned.endsWith('.')) {
    cleaned = cleaned.slice(0, -1);
  }

  if (!cleaned || cleaned.includes(' ') || cleaned.includes('/')) return false;

  const parts = cleaned.split('.');
  // Standard FQDN must have at least 2 labels (hostname + TLD)
  if (parts.length < 2) return false;

  for (const part of parts) {
    if (!part || part.length > 63) return false;
    if (part.startsWith('-') || part.endsWith('-')) return false;
    if (!/^[a-z0-9-]+$/.test(part)) return false;
  }

  const tld = parts[parts.length - 1];
  // TLD must be alphabetic and at least 2 characters
  if (!/^[a-z]{2,24}$/.test(tld)) return false;

  // Flag recognized pseudo-domains / invalid internal TLDs (e.g. "a3.domain", ".local")
  if (SUSPICIOUS_TLDS.has(tld)) return false;

  return true;
}

/**
 * Helper to parse ASN string into provider name and autonomous system number.
 */
export function parseAsnTelemetry(asnRaw: string | undefined): { asnNumber?: string; org?: string } {
  if (!asnRaw || asnRaw === 'N/A' || asnRaw.toLowerCase().includes('unknown')) {
    return {};
  }
  const clean = asnRaw.trim();
  // Match "AS15169 Google LLC" or "AS15169 - Google LLC"
  const prefixMatch = clean.match(/^(AS\d+)\s*[-–—]?\s*(.*)$/i);
  if (prefixMatch) {
    const asnNumber = prefixMatch[1].toUpperCase();
    const org = prefixMatch[2].trim().replace(/^[-,–—]\s*/, '');
    return { asnNumber, org: org || undefined };
  }
  // Match "Google LLC (AS15169)"
  const suffixMatch = clean.match(/^(.*?)\s*\((AS\d+)\)$/i);
  if (suffixMatch) {
    return { org: suffixMatch[1].trim(), asnNumber: suffixMatch[2].toUpperCase() };
  }
  // Standalone AS number
  if (/^AS\d+$/i.test(clean)) {
    return { asnNumber: clean.toUpperCase() };
  }
  return { org: clean };
}

/**
 * Classifies a reverse-hop node with evidence-based trust tiers, FQDN validation,
 * and concise forensic rationale.
 */
export function classifyForensicHop(hop: ForensicHop): HopClassification {
  const hasClaimed = Boolean(hop.hostnameClaimed && hop.hostnameClaimed.trim().length > 0);
  const fqdnValid = hasClaimed ? isValidFqdn(hop.hostnameClaimed) : true;
  const isSuspiciousHostname = hasClaimed && !fqdnValid;
  const parsedAsn = parseAsnTelemetry(hop.asn);

  // 1. Confirmed trusted local infrastructure (boundary relay or local delivery)
  if (hop.trusted) {
    let evidence = 'Trusted delivery relay • Valid PTR';
    if (hop.isPrivate) {
      evidence = 'Trusted internal delivery network (RFC 1918)';
    } else if (parsedAsn.org && parsedAsn.asnNumber) {
      evidence = `Trusted boundary relay • ${parsedAsn.org} • ${parsedAsn.asnNumber}`;
    } else if (parsedAsn.org || parsedAsn.asnNumber) {
      evidence = `Trusted boundary relay • ${parsedAsn.org || parsedAsn.asnNumber}`;
    }

    return {
      tier: 'TRUSTED INFRA',
      tierBadgeBg: 'bg-[#10B981]/10',
      tierBadgeText: 'text-[#10B981]',
      tierBadgeBorder: 'border-[#10B981]/30',
      isSuspiciousHostname: false,
      evidence,
    };
  }

  // 2. Hostname is syntactically invalid or uses a pseudo-domain (e.g. "a3.domain", ".local")
  if (isSuspiciousHostname) {
    return {
      tier: 'LIKELY FORGED',
      tierBadgeBg: 'bg-[#EF4444]/10',
      tierBadgeText: 'text-[#EF4444]',
      tierBadgeBorder: 'border-[#EF4444]/30',
      isSuspiciousHostname: true,
      evidence: `Claimed hostname could not be validated (malformed pseudo-domain "${hop.hostnameClaimed}")`,
      suspiciousReason: `Suspicious non-FQDN hostname: "${hop.hostnameClaimed}"`,
    };
  }

  // 3. Recognized Provider: Valid PTR matching claimed host and recognized ASN
  const hasAsn = Boolean(parsedAsn.org || parsedAsn.asnNumber);
  if (hop.ptrValid && hasAsn && fqdnValid) {
    const providerParts = ['Valid PTR'];
    if (parsedAsn.org) providerParts.push(parsedAsn.org);
    if (parsedAsn.asnNumber) providerParts.push(parsedAsn.asnNumber);

    return {
      tier: 'RECOGNIZED PROVIDER',
      tierBadgeBg: 'bg-[#0052FF]/10 dark:bg-[#3b82f6]/10',
      tierBadgeText: 'text-[#0052FF] dark:text-[#3b82f6]',
      tierBadgeBorder: 'border-[#0052FF]/30 dark:border-[#3b82f6]/30',
      isSuspiciousHostname: false,
      evidence: providerParts.join(' • '),
    };
  }

  // 4. Private network address (RFC 1918) that is not confirmed trusted
  if (hop.isPrivate) {
    return {
      tier: 'UNVERIFIED',
      tierBadgeBg: 'bg-[#F59E0B]/10',
      tierBadgeText: 'text-[#F59E0B]',
      tierBadgeBorder: 'border-[#F59E0B]/30',
      isSuspiciousHostname: false,
      evidence: 'Internal network address (RFC 1918) — routing not publicly routable',
    };
  }

  // 5. Valid PTR but unindexed provider infrastructure
  if (hop.ptrValid) {
    return {
      tier: 'UNVERIFIED',
      tierBadgeBg: 'bg-[#F59E0B]/10',
      tierBadgeText: 'text-[#F59E0B]',
      tierBadgeBorder: 'border-[#F59E0B]/30',
      isSuspiciousHostname: false,
      evidence: 'Valid PTR record established, but provider infrastructure is unindexed',
    };
  }

  // 6. Public IP with missing or unverified PTR (Ordinary uncertain hop)
  const missingPtrEvidence = hasClaimed
    ? `No sufficient reverse-DNS evidence (claimed "${hop.hostnameClaimed}" unverified by PTR)`
    : 'No sufficient reverse-DNS evidence (PTR record absent or timed out)';

  return {
    tier: 'UNVERIFIED',
    tierBadgeBg: 'bg-[#F59E0B]/10',
    tierBadgeText: 'text-[#F59E0B]',
    tierBadgeBorder: 'border-[#F59E0B]/30',
    isSuspiciousHostname: false,
    evidence: missingPtrEvidence,
  };
}


/**
 * Extracts and reconciles risk matrix override details (circuit-breakers, quarantine overrides, base weighted scores).
 * Calculates the exact normal weighted pillar score if not directly provided, and explains why finalScore differs.
 */
export function getOverrideDetails(riskMatrix: RiskMatrix | undefined): OverrideDetails {
  const finalScore = Math.max(0, Math.min(100, Math.round(riskMatrix?.finalScore ?? 0)));

  // Extract pillar weights with strict fallbacks to canonical forensic weights (0.30, 0.25, 0.20, 0.25)
  const wAuth = typeof riskMatrix?.pillars?.authentication?.weight === 'number'
    ? riskMatrix.pillars.authentication.weight
    : 0.30;
  const wIdentity = typeof riskMatrix?.pillars?.identity?.weight === 'number'
    ? riskMatrix.pillars.identity.weight
    : 0.25;
  const wInfra = typeof riskMatrix?.pillars?.infrastructure?.weight === 'number'
    ? riskMatrix.pillars.infrastructure.weight
    : 0.20;
  const wNlp = typeof riskMatrix?.pillars?.nlp?.weight === 'number'
    ? riskMatrix.pillars.nlp.weight
    : 0.25;

  // Extract pillar scores with sanitization
  const rawAuth = riskMatrix?.pillars?.authentication?.score ?? riskMatrix?.authScore ?? 0;
  const rawIdentity = riskMatrix?.pillars?.identity?.score ?? riskMatrix?.identityScore ?? 0;
  const rawInfra = riskMatrix?.pillars?.infrastructure?.score ?? riskMatrix?.ipScore ?? 0;
  const rawNlp = riskMatrix?.pillars?.nlp?.score ?? riskMatrix?.nlpScore ?? 0;

  const sAuth = Number.isFinite(rawAuth) ? Math.max(0, Math.min(100, rawAuth)) : 0;
  const sIdentity = Number.isFinite(rawIdentity) ? Math.max(0, Math.min(100, rawIdentity)) : 0;
  const sInfra = Number.isFinite(rawInfra) ? Math.max(0, Math.min(100, rawInfra)) : 0;
  const sNlp = Number.isFinite(rawNlp) ? Math.max(0, Math.min(100, rawNlp)) : 0;

  // Calculate standard weighted base score
  const calculatedWeightedBase =
    Math.round((sAuth * wAuth + sIdentity * wIdentity + sInfra * wInfra + sNlp * wNlp) * 10) / 10;

  const baseScore =
    typeof riskMatrix?.baseScore === 'number' && Number.isFinite(riskMatrix.baseScore)
      ? Math.round(riskMatrix.baseScore * 10) / 10
      : calculatedWeightedBase;

  // Check explicit backend override fields
  const hasExplicitOverride = Boolean(riskMatrix?.override?.triggered);
  const hasQuarantineFlag = Boolean(riskMatrix?.quarantineOverride);

  // Check findings for circuit-breaker indicators
  const allPillarFindings = [
    ...(riskMatrix?.pillars?.authentication?.findings || []),
    ...(riskMatrix?.pillars?.identity?.findings || []),
    ...(riskMatrix?.pillars?.infrastructure?.findings || []),
    ...(riskMatrix?.pillars?.nlp?.findings || []),
  ];

  const circuitBreakerFinding = allPillarFindings.find((f) => {
    const t = (f?.type || '').toUpperCase();
    return t.includes('QUARANTINE') || t.includes('CIRCUIT_BREAKER') || t.includes('OVERRIDE');
  });

  const isEscalated = finalScore > baseScore;
  const isOverridden =
    hasExplicitOverride ||
    hasQuarantineFlag ||
    (Boolean(circuitBreakerFinding) && isEscalated);

  let type = riskMatrix?.override?.type;
  if (!type || type === 'NONE') {
    if (circuitBreakerFinding?.type) {
      type = circuitBreakerFinding.type;
    } else if (hasQuarantineFlag) {
      type = 'HIGH_RISK_QUARANTINE';
    } else if (isOverridden) {
      type = 'CIRCUIT_BREAKER_OVERRIDE';
    }
  }

  let reason = riskMatrix?.override?.reason;
  if (!reason || reason.includes('Standard weighted aggregation')) {
    if (circuitBreakerFinding?.description) {
      reason = circuitBreakerFinding.description;
    } else if (hasQuarantineFlag) {
      reason = 'High-risk quarantine override triggered: Fatal circuit breaker matched actionable threats';
    } else if (isOverridden) {
      reason = `Final risk score escalated from weighted calculation (${baseScore}) due to high-risk forensic triggers.`;
    }
  }

  const scoreDifference = Math.round((finalScore - baseScore) * 10) / 10;

  return {
    isOverridden,
    type,
    reason,
    baseScore,
    finalScore,
    scoreDifference,
    corroborationBonus: riskMatrix?.corroborationBonus,
    pillarScores: {
      auth: sAuth,
      identity: sIdentity,
      infra: sInfra,
      nlp: sNlp,
    },
    pillarWeights: {
      auth: wAuth,
      identity: wIdentity,
      infra: wInfra,
      nlp: wNlp,
    },
  };
}

export interface GeolocatedHopSummary {
  originalIndex: number;
  hopNumber: number;
  hop: ForensicHop;
  ip: string;
  hostnameClaimed?: string;
  city?: string;
  country?: string;
  asn?: string;
  lat: number;
  lon: number;
  x: number;
  y: number;
  classification: HopClassification;
}

/**
 * Validates and filters reverse-hop nodes with authentic geographic coordinates.
 * Projects coordinates into a standard 960x480 SVG coordinate space.
 */
export function extractGeolocatedHops(hops: ForensicHop[] | undefined | null): GeolocatedHopSummary[] {
  if (!hops || !Array.isArray(hops)) return [];
  const result: GeolocatedHopSummary[] = [];
  const coordCounts = new Map<string, number>();

  hops.forEach((hop, index) => {
    if (!hop.coordinates || !Array.isArray(hop.coordinates) || hop.coordinates.length < 2) {
      return;
    }
    const [rawLat, rawLon] = hop.coordinates;
    const lat = typeof rawLat === 'number' ? rawLat : parseFloat(String(rawLat));
    const lon = typeof rawLon === 'number' ? rawLon : parseFloat(String(rawLon));

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      return;
    }

    // Equirectangular projection on 960x480 canvas
    let x = ((lon + 180) / 360) * 960;
    let y = ((90 - lat) / 180) * 480;

    // Geographic cluster orbit for duplicate coordinates
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const duplicates = coordCounts.get(key) || 0;
    coordCounts.set(key, duplicates + 1);

    if (duplicates > 0) {
      const angle = (duplicates * (2 * Math.PI)) / 5;
      const radius = duplicates * 14;
      x += Math.cos(angle) * radius;
      y += Math.sin(angle) * radius;
    }

    result.push({
      originalIndex: index,
      hopNumber: index + 1,
      hop,
      ip: hop.ip,
      hostnameClaimed: hop.hostnameClaimed,
      city: hop.city,
      country: hop.country,
      asn: hop.asn,
      lat,
      lon,
      x: Math.max(16, Math.min(944, x)),
      y: Math.max(16, Math.min(464, y)),
      classification: classifyForensicHop(hop),
    });
  });

  return result;
}

export interface ReportMetadataSummary {
  modelLabel: string;
  executionTimeFormatted: string | null;
  displayHash: string;
  evaluatedPillarsCount: number;
  confidencePercent: number | null;
  urgencyLabel: string;
  isOverridden: boolean;
  statusLabel: string;
}

/**
 * Safely extracts authentic, traceable metadata from the AnalysisReport.
 * Never fabricates model names, execution times, SHA hashes, or pillar counts.
 */
export function getReportMetadataSummary(report: AnalysisReport | null | undefined): ReportMetadataSummary {
  // 1. Model / Provider
  let modelLabel = 'AI INTENT ANALYSIS';
  if (report?.aiSummary?.model && report.aiSummary.model.trim().length > 0) {
    modelLabel = report.aiSummary.model.trim();
  } else if (report?.aiSummary?.provider === 'heuristic') {
    modelLabel = 'HEURISTIC INTENT ENGINE';
  } else if (report?.aiSummary?.provider === 'gemini') {
    modelLabel = 'GEMINI AI';
  } else if (report?.aiSummary?.provider === 'hybrid') {
    modelLabel = 'HYBRID INTENT ENGINE';
  }

  // 2. Execution Time
  const executionTimeFormatted = typeof report?.executionTimeMs === 'number' && Number.isFinite(report.executionTimeMs)
    ? `${(report.executionTimeMs / 1000).toFixed(3)}s`
    : null;

  // 3. Integrity Hash (truncate if valid, otherwise 'Unavailable')
  const rawHash = report?.aiSummary?.integrityHash;
  const displayHash = rawHash && typeof rawHash === 'string' && rawHash.trim().length > 0
    ? (rawHash.length > 16 ? `${rawHash.slice(0, 8)}...${rawHash.slice(-6)}` : rawHash)
    : 'Unavailable';

  // 4. Evaluated Pillars Count
  const p = report?.riskMatrix?.pillars;
  let evaluatedPillarsCount = 0;
  if (p) {
    if (p.authentication && Number.isFinite(p.authentication.score)) evaluatedPillarsCount++;
    if (p.identity && Number.isFinite(p.identity.score)) evaluatedPillarsCount++;
    if (p.infrastructure && Number.isFinite(p.infrastructure.score)) evaluatedPillarsCount++;
    if (p.nlp && Number.isFinite(p.nlp.score)) evaluatedPillarsCount++;
  }

  // 5. Confidence
  const rawConfidence = typeof report?.aiSummary?.confidence === 'number' && Number.isFinite(report.aiSummary.confidence)
    ? report.aiSummary.confidence
    : null;
  const confidencePercent = rawConfidence !== null
    ? Math.round(rawConfidence <= 1 ? rawConfidence * 100 : rawConfidence)
    : null;

  // 6. Urgency
  const rawUrgency = typeof report?.aiSummary?.urgency === 'number' && Number.isFinite(report.aiSummary.urgency)
    ? report.aiSummary.urgency
    : typeof p?.nlp?.score === 'number' && Number.isFinite(p.nlp.score)
    ? p.nlp.score
    : null;
  const urgencyLabel = rawUrgency !== null
    ? (rawUrgency >= 70 ? 'HIGH' : rawUrgency >= 35 ? 'MODERATE' : 'LOW')
    : 'N/A';

  // 7. Status & Override
  const isOverridden = Boolean(report?.riskMatrix?.quarantineOverride || report?.riskMatrix?.override?.triggered);
  const statusLabel = isOverridden
    ? `OVERRIDE: ${report?.riskMatrix?.override?.type || 'CIRCUIT BREAKER'}`
    : `PILLARS ANALYZED: ${evaluatedPillarsCount} / 4`;

  return {
    modelLabel,
    executionTimeFormatted,
    displayHash,
    evaluatedPillarsCount,
    confidencePercent,
    urgencyLabel,
    isOverridden,
    statusLabel,
  };
}

export interface FormattedIntent {
  raw: string;
  label: string;
  tone: 'threat' | 'warning' | 'neutral' | 'benign';
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
}

/**
 * Normalizes, deduplicates, and formats AI intent classifications.
 * Handles arrays, single strings, null/undefined, and unknown future enum values.
 * Preserves the original encounter order from the backend.
 */
export function normalizeIntents(rawInput: unknown): FormattedIntent[] {
  if (!rawInput) return [];

  let rawList: string[] = [];
  if (Array.isArray(rawInput)) {
    rawList = rawInput.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  } else if (typeof rawInput === 'string' && rawInput.trim().length > 0) {
    rawList = [rawInput.trim()];
  }

  // Deduplicate while strictly preserving backend encounter order
  const seen = new Set<string>();
  const uniqueList: string[] = [];
  for (const item of rawList) {
    const norm = item.trim().toUpperCase();
    if (!seen.has(norm)) {
      seen.add(norm);
      uniqueList.push(item.trim());
    }
  }

  return uniqueList.map((item) => {
    const upper = item.toUpperCase().replace(/_/g, ' ');
    // Human-friendly title case (e.g. "Financial Coercion", "Authority Trap")
    const label = item
      .trim()
      .replace(/_/g, ' ')
      .toLowerCase()
      .split(' ')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    let tone: 'threat' | 'warning' | 'neutral' | 'benign' = 'neutral';
    let badgeBg = 'bg-[#0052FF]/10 dark:bg-[#3b82f6]/10';
    let badgeText = 'text-[#0052FF] dark:text-[#3b82f6]';
    let badgeBorder = 'border-[#0052FF]/30 dark:border-[#3b82f6]/30';

    if (
      upper.includes('CREDENTIAL') ||
      upper.includes('HARVESTING') ||
      upper.includes('FINANCIAL') ||
      upper.includes('COERCION') ||
      upper.includes('MALWARE') ||
      upper.includes('EXPLOIT') ||
      upper.includes('PHISHING') ||
      upper.includes('EXTORTION')
    ) {
      tone = 'threat';
      badgeBg = 'bg-[#EF4444]/10';
      badgeText = 'text-[#EF4444] dark:text-[#f87171]';
      badgeBorder = 'border-[#EF4444]/30';
    } else if (
      upper.includes('AUTHORITY') ||
      upper.includes('TRAP') ||
      upper.includes('URGENCY') ||
      upper.includes('PRESSURE') ||
      upper.includes('SUSPICIOUS') ||
      upper.includes('DECEPTIVE') ||
      upper.includes('MANIPULATION')
    ) {
      tone = 'warning';
      badgeBg = 'bg-[#F59E0B]/10';
      badgeText = 'text-[#F59E0B] dark:text-[#fbbf24]';
      badgeBorder = 'border-[#F59E0B]/30';
    } else if (upper === 'BENIGN' || upper === 'SAFE' || upper === 'LEGITIMATE') {
      tone = 'benign';
      badgeBg = 'bg-[#10B981]/10';
      badgeText = 'text-[#10B981] dark:text-[#34d399]';
      badgeBorder = 'border-[#10B981]/30';
    }

    return {
      raw: item,
      label,
      tone,
      badgeBg,
      badgeText,
      badgeBorder,
    };
  });
}

export interface AIDiagnosticsSummary {
  modelLabel: string;
  provider: 'gemini' | 'heuristic' | 'hybrid';
  providerStatus: 'success' | 'fallback';
  fallbackReason?: string;
  confidencePercent: number | null;
  urgencyLabel: 'HIGH' | 'MODERATE' | 'LOW' | 'N/A';
  urgencyScore: number | null;
  latencyFormatted: string | null;
  hasObfuscation: boolean;
  obfuscationDetails?: string;
}

/**
 * Extracts authentic, grounded AI diagnostics strictly from the AnalysisReport payload.
 * Provides model, provider status, confidence, urgency, latency, and obfuscation detection.
 */
export function getAiDiagnosticsSummary(report: AnalysisReport | null | undefined): AIDiagnosticsSummary {
  const ai = report?.aiSummary;
  const nlpPillar = report?.riskMatrix?.pillars?.nlp;

  // 1. Model & Provider
  let modelLabel = 'AI INTENT ANALYSIS';
  if (ai?.model && ai.model.trim().length > 0) {
    modelLabel = ai.model.trim();
  } else if (ai?.provider === 'heuristic') {
    modelLabel = 'HEURISTIC INTENT ENGINE';
  } else if (ai?.provider === 'gemini') {
    modelLabel = 'GEMINI AI';
  } else if (ai?.provider === 'hybrid') {
    modelLabel = 'HYBRID INTENT ENGINE';
  } else if (typeof (ai as { provider?: unknown })?.provider === 'string') {
    const rawProv = ((ai as { provider?: unknown })?.provider as string).trim();
    if (rawProv.length > 0) {
      modelLabel = rawProv;
    }
  }

  const provider = ai?.provider || 'heuristic';
  const providerStatus = ai?.providerStatus || 'success';
  const fallbackReason = ai?.fallbackReason;

  // 2. Confidence
  const rawConfidence =
    typeof ai?.confidence === 'number' && Number.isFinite(ai.confidence) ? ai.confidence : null;
  const confidencePercent =
    rawConfidence !== null ? Math.round(rawConfidence <= 1 ? rawConfidence * 100 : rawConfidence) : null;

  // 3. Urgency
  const rawUrgency =
    typeof ai?.urgency === 'number' && Number.isFinite(ai.urgency)
      ? ai.urgency
      : typeof nlpPillar?.score === 'number' && Number.isFinite(nlpPillar.score)
      ? nlpPillar.score
      : null;

  const urgencyLabel: 'HIGH' | 'MODERATE' | 'LOW' | 'N/A' =
    rawUrgency !== null ? (rawUrgency >= 70 ? 'HIGH' : rawUrgency >= 35 ? 'MODERATE' : 'LOW') : 'N/A';

  // 4. Latency
  const latencyMs = ai?.aiDiagnostics?.latencyMs;
  const latencyFormatted =
    typeof latencyMs === 'number' && Number.isFinite(latencyMs)
      ? latencyMs >= 1000
        ? `${(latencyMs / 1000).toFixed(2)}s`
        : `${Math.round(latencyMs)}ms`
      : null;

  // 5. Obfuscation detection across NLP/AI findings
  const allFindings = [...(nlpPillar?.findings || []), ...(ai?.findings || [])];
  const zeroWidthFinding = allFindings.find((f) => (f?.type || '').toUpperCase().includes('ZERO_WIDTH'));
  const glasswormFinding = allFindings.find((f) => (f?.type || '').toUpperCase().includes('GLASSWORM'));

  const hasObfuscation = Boolean(zeroWidthFinding || glasswormFinding);
  let obfuscationDetails: string | undefined;
  if (zeroWidthFinding && glasswormFinding) {
    obfuscationDetails = 'Zero-width characters & HTML cloaking detected';
  } else if (zeroWidthFinding) {
    obfuscationDetails = 'Hidden zero-width characters detected';
  } else if (glasswormFinding) {
    obfuscationDetails = 'Glassworm HTML cloaking detected';
  }

  return {
    modelLabel,
    provider,
    providerStatus,
    fallbackReason,
    confidencePercent,
    urgencyLabel,
    urgencyScore: rawUrgency,
    latencyFormatted,
    hasObfuscation,
    obfuscationDetails,
  };
}

export interface ExecutiveVerdictDetails {
  score: number;
  baseScore: number;
  isOverridden: boolean;
  overrideType?: string;
  overrideReason?: string;
  severityLabel: string;
  severityTone: 'clean' | 'low' | 'moderate' | 'high' | 'critical';
  colorText: string;
  colorBg: string;
  colorBorder: string;
  summaryStatement: string;
  recommendedAction: string;
}

/**
 * Derives a consistent, grounded executive decision summary strictly from the report data.
 * Reconciles circuit breaker overrides and provides appropriate SOC analyst guidance.
 */
export function getExecutiveVerdictDetails(
  report: AnalysisReport | null | undefined
): ExecutiveVerdictDetails {
  const score = report?.riskMatrix?.finalScore ?? 0;
  const override = getOverrideDetails(report?.riskMatrix);
  const baseScore = override.baseScore;
  const isOverridden = override.isOverridden;

  let severityLabel = 'CLEAN · BENIGN';
  let severityTone: 'clean' | 'low' | 'moderate' | 'high' | 'critical' = 'clean';
  let colorText = 'text-[#10b981] dark:text-[#34d399]';
  let colorBg = 'bg-[#10b981]/10 dark:bg-[#34d399]/20';
  let colorBorder = 'border-[#10b981]/30 dark:border-[#34d399]/40';
  let summaryStatement =
    'No evidence of malicious intent, tampering, or impersonation detected across forensic vectors.';
  let recommendedAction =
    'No malicious vectors detected. Safe for normal handling and user inbox delivery.';

  if (isOverridden || score >= 81) {
    severityLabel = 'CRITICAL RISK · MALICIOUS';
    severityTone = 'critical';
    colorText = 'text-[#ba1a1a] dark:text-[#ef4444]';
    colorBg = 'bg-[#ba1a1a]/10 dark:bg-[#ef4444]/20';
    colorBorder = 'border-[#ba1a1a]/40 dark:border-[#ef4444]/50';
    summaryStatement =
      'Confirmed high-confidence threat. Active adversarial payload or circuit breaker override identified.';
    recommendedAction =
      'Immediate quarantine and isolation recommended. Block sender domain immediately.';
  } else if (score >= 61) {
    severityLabel = 'HIGH RISK · PROBABLE ATTACK';
    severityTone = 'high';
    colorText = 'text-[#ba1a1a] dark:text-[#ef4444]';
    colorBg = 'bg-[#ba1a1a]/10 dark:bg-[#ef4444]/20';
    colorBorder = 'border-[#ba1a1a]/40 dark:border-[#ef4444]/50';
    summaryStatement =
      'High risk email exhibiting multiple compromised or forged forensic signals.';
    recommendedAction =
      'Quarantine message and initiate sender domain inspection before allowing user interaction.';
  } else if (score >= 41) {
    severityLabel = 'MODERATE RISK · SUSPICIOUS';
    severityTone = 'moderate';
    colorText = 'text-[#d97706] dark:text-[#f59e0b]';
    colorBg = 'bg-[#d97706]/10 dark:bg-[#f59e0b]/20';
    colorBorder = 'border-[#d97706]/40 dark:border-[#f59e0b]/50';
    summaryStatement =
      'Elevated threat signals present. Email exhibits suspicious characteristics requiring analyst inspection.';
    recommendedAction =
      'Apply caution warning banner and review link destinations before allowing user access.';
  } else if (score >= 21) {
    severityLabel = 'LOW RISK · MONITORED';
    severityTone = 'low';
    colorText = 'text-[#0052ff] dark:text-[#3b82f6]';
    colorBg = 'bg-[#0052ff]/10 dark:bg-[#3b82f6]/20';
    colorBorder = 'border-[#0052ff]/30 dark:border-[#3b82f6]/40';
    summaryStatement =
      'Minor anomalies observed, but overall infrastructure and authentication appear consistent.';
    recommendedAction =
      'Deliver to recipient with standard security telemetry enabled.';
  }

  return {
    score,
    baseScore,
    isOverridden,
    overrideType: override.type,
    overrideReason: override.reason,
    severityLabel,
    severityTone,
    colorText,
    colorBg,
    colorBorder,
    summaryStatement,
    recommendedAction,
  };
}

/**
 * Returns semantic severity visual styling and labels for pillar scores.
 * Communicates risk magnitude rather than using uniform color tokens.
 */
export function getPillarScoreVisuals(score: number): {
  colorText: string;
  colorBg: string;
  colorBorder: string;
  badgeLabel: string;
  level: 'clean' | 'low' | 'moderate' | 'high' | 'critical';
} {
  const s = Math.round(Number.isFinite(score) ? score : 0);
  if (s >= 80) {
    return {
      colorText: 'text-[#ba1a1a] dark:text-[#ef4444]',
      colorBg: 'bg-[#ba1a1a]/10 dark:bg-[#ef4444]/20',
      colorBorder: 'border-[#ba1a1a]/40 dark:border-[#ef4444]/50',
      badgeLabel: 'CRITICAL',
      level: 'critical',
    };
  }
  if (s >= 50) {
    return {
      colorText: 'text-[#d97706] dark:text-[#f59e0b]',
      colorBg: 'bg-[#d97706]/10 dark:bg-[#f59e0b]/20',
      colorBorder: 'border-[#d97706]/40 dark:border-[#f59e0b]/50',
      badgeLabel: 'ELEVATED',
      level: 'moderate',
    };
  }
  if (s >= 20) {
    return {
      colorText: 'text-[#0052ff] dark:text-[#3b82f6]',
      colorBg: 'bg-[#0052ff]/10 dark:bg-[#3b82f6]/20',
      colorBorder: 'border-[#0052ff]/30 dark:border-[#3b82f6]/40',
      badgeLabel: 'MONITORED',
      level: 'low',
    };
  }
  return {
    colorText: 'text-[#10b981] dark:text-[#34d399]',
    colorBg: 'bg-[#10b981]/10 dark:bg-[#34d399]/20',
    colorBorder: 'border-[#10b981]/30 dark:border-[#34d399]/40',
    badgeLabel: 'CLEAN',
    level: 'clean',
  };
}

