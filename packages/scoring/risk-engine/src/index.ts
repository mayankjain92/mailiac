import type {
  AuthResult,
  IdentityResult,
  IPReputationResult,
  NLPResult,
  RiskMatrix,
} from '@mailiac/shared-types';

/**
 * Baseline pillar weights for the master email forensics risk score formula.
 * Total equals exactly 1.00.
 */
export const PILLAR_WEIGHTS = {
  AUTH: 0.30,
  IDENTITY: 0.25,
  IP: 0.20,
  NLP: 0.25,
} as const;

export const THREAT_LEVEL_QUARANTINE = 'HIGH_RISK_QUARANTINE';

const FREE_WEBMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com', 'mail.com'
];

export interface CircuitBreakerStatus {
  c1: boolean;
  c2: boolean;
  c3: boolean;
  c4: boolean;
}

export type RiskMatrixWithBreakers = RiskMatrix & {
  circuitBreakers?: CircuitBreakerStatus;
};

/**
 * Safely sanitizes and clamps input scores to finite numbers between 0 and 100.
 */
function sanitizeScore(score: unknown): number {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return 0;
  }
  return Math.min(100, Math.max(0, score));
}

/**
 * Counts how many independent pillars meet or exceed a specific threshold.
 */
function countStrongSignals(scores: number[], threshold: number): number {
  return scores.filter((s) => s >= threshold).length;
}

/**
 * Calculates a corroboration bonus when multiple independent pillars agree.
 * - 2 strong pillars -> +10
 * - 3 strong pillars -> +20
 * - 4 strong pillars -> +30
 */
function calculateCorroborationBonus(strongSignalCount: number): number {
  if (strongSignalCount >= 4) return 30;
  if (strongSignalCount === 3) return 20;
  if (strongSignalCount === 2) return 10;
  return 0;
}

/**
 * Aggregates individual scores from all 4 risk pillars (Auth, Identity, IP Reputation, NLP Intent)
 * into a consolidated RiskMatrix with the weighted and evidence-backed finalScore (0-100).
 *
 * Implements Canonical Circuit Breakers (C1 - C4):
 * - C1: Definite Phishing (identityScore >= 85 AND authScore >= 70) -> Force Quarantine (100)
 * - C2: Malicious Impersonation (identityScore >= 85 AND nlpScore >= 70) -> Force Quarantine (100)
 * - C3: Multi-Pillar Consensus (>= 3 pillars with Score >= 70) -> Force Quarantine (100)
 * - C4: AI Hallucination Immunity (authScore <= 20 AND identityScore <= 20 AND ipScore <= 20)
 *       -> Hard cap at 40 max, quarantine strictly prohibited.
 *
 * @param senderDomain The extracted domain from the sender's email address
 * @param auth AuthResult from @mailiac/scoring-auth
 * @param identity IdentityResult from @mailiac/scoring-identity
 * @param ip IPReputationResult from @mailiac/scoring-ip-reputation
 * @param nlp NLPResult from @mailiac/parsing-ai-intent
 * @returns RiskMatrixWithBreakers
 */
export function aggregateRisk(
  senderDomain: string,
  auth: AuthResult,
  identity: IdentityResult,
  ip: IPReputationResult,
  nlp: NLPResult
): RiskMatrixWithBreakers {
  const authScore = sanitizeScore(auth?.authScore);
  let identityScore = sanitizeScore(identity?.identityScore);
  const ipScore = sanitizeScore(ip?.ipScore);
  let nlpScore = sanitizeScore(nlp?.nlpScore);
  const intentLabels = nlp?.intentLabels || [];
  // Step 1: Detect free webmail and severe intent
  const isFreeWebmail = FREE_WEBMAIL_DOMAINS.includes(senderDomain.toLowerCase());
  const severeLabels = [
    'FINANCIAL_COERCION',
    'CREDENTIAL_HARVESTING',
    'AUTHORITY_TRAP',
    'BRAND_IMPERSONATION',
    'MALWARE_PAYLOAD',
    'EXTORTION',
  ];
  const hasSevereIntent = intentLabels.some((label) => severeLabels.includes(label));
  const isWebmailQuarantine = isFreeWebmail && hasSevereIntent;

  // Step 2: Evaluate C1, C2, C3 Canonical Circuit Breakers
  // C1: Definite Identity + Auth Compromise
  const isC1 = identityScore >= 85 && authScore >= 70;

  // C2: Malicious Impersonation (Spoofed identity corroborated by malicious NLP intent)
  const isC2 = identityScore >= 85 && nlpScore >= 70;

  // Count strong signals across all 4 pillars for C3 evaluation
  const rawStrongCount = countStrongSignals([authScore, identityScore, ipScore, nlpScore], 70);
  // C3: Multi-Pillar Consensus (At least 3 of the 4 independent pillars detect high threat)
  const isC3 = rawStrongCount >= 3;

  // Step 3: Evaluate C4 (AI Hallucination Immunity)
  // Hard safety constraint: If cryptographic auth, identity, and network infrastructure are clean (<= 20),
  // isolated AI overclassification cannot trigger quarantine and the score is capped at 40.
  // Applies to all corporate, financial, and standard domains (free webmail with severe intent is evaluated as webmail impersonation).
  const isC4 = authScore <= 20 && identityScore <= 20 && ipScore <= 20 && !isWebmailQuarantine;

  // Step 4: Apply Quarantine Decision
  // C4 is an authoritative hard constraint: if C4 applies, quarantine is strictly false.
  const isQuarantined = !isC4 && (isC1 || isC2 || isC3 || isWebmailQuarantine);

  if (!isQuarantined) {
    // Tier 2: Asymmetric Cryptographic Trust Dampener
    if (authScore === 0 && ipScore === 0 && !isFreeWebmail) {
      if (intentLabels.includes('MARKETING') || intentLabels.includes('TRANSACTIONAL')) {
        nlpScore = Math.min(nlpScore, 15);
        identityScore = Math.min(identityScore, 15);
      } else if (identityScore < 70) {
        identityScore = sanitizeScore(identityScore * 0.35); // discount by 65%
      }
    }
  }

  // Step 5: Base Weight Aggregation & Corroboration Bonus
  const strongSignalCount = countStrongSignals([authScore, identityScore, ipScore, nlpScore], 70);
  const corroborationBonus = calculateCorroborationBonus(strongSignalCount);

  const baseWeightedScore =
    authScore * PILLAR_WEIGHTS.AUTH +
    identityScore * PILLAR_WEIGHTS.IDENTITY +
    ipScore * PILLAR_WEIGHTS.IP +
    nlpScore * PILLAR_WEIGHTS.NLP;

  const baseScore = Math.round(baseWeightedScore * 100) / 100;
  const totalCalculatedScore = Math.min(100, Math.max(0, baseWeightedScore + corroborationBonus));
  let finalScore = isQuarantined ? 100 : Math.round(totalCalculatedScore);

  // Step 6: Apply C4 Hard Cap
  if (isC4) {
    finalScore = Math.min(finalScore, 40);
  }

  // Step 7: Telemetry & Findings
  const nlpFindings = [...(nlp?.findings || [])];

  if (isC4 && ((nlp?.nlpScore ?? 0) > 20 || nlpScore > 20 || hasSevereIntent)) {
    nlpFindings.push({
      type: 'AI_HALLUCINATION_IMMUNITY',
      severity: 'INFO',
      description:
        'Score capped at 40: Cryptographic, Identity, and Infrastructure pillars verified clean despite elevated AI intent.',
    });
  }

  let overrideType = 'NONE';
  let overrideReason = 'Standard weighted aggregation applied without override';

  if (isQuarantined) {
    overrideType = THREAT_LEVEL_QUARANTINE;
    if (isC1) {
      overrideReason = 'High-risk quarantine override triggered: Definite Identity + Authentication compromise (C1)';
    } else if (isC2) {
      overrideReason = 'High-risk quarantine override triggered: Malicious Impersonation with elevated AI intent (C2)';
    } else if (isC3) {
      overrideReason = 'High-risk quarantine override triggered: Multi-pillar consensus across 3+ vectors (C3)';
    } else {
      overrideReason = 'High-risk quarantine override triggered: Free webmail impersonation with severe attack intent';
    }

    nlpFindings.push({
      type: 'HIGH_RISK_QUARANTINE',
      severity: 'HIGH',
      description: overrideReason,
    });
  } else if (isC4 && ((nlp?.nlpScore ?? 0) > 40 || nlpScore > 40 || totalCalculatedScore > 40)) {
    overrideType = 'AI_HALLUCINATION_IMMUNITY';
    overrideReason =
      'Score capped at 40: Cryptographic, Identity, and Infrastructure pillars verified clean despite elevated AI intent.';
  }

  const isOverridden = isQuarantined || (isC4 && ((nlp?.nlpScore ?? 0) > 40 || totalCalculatedScore > 40));

  return {
    authScore,
    identityScore,
    ipScore,
    nlpScore,
    baseScore,
    corroborationBonus,
    quarantineOverride: isQuarantined,
    override: {
      triggered: isOverridden,
      type: overrideType,
      reason: overrideReason,
    },
    circuitBreakers: {
      c1: isC1,
      c2: isC2,
      c3: isC3,
      c4: isC4,
    },
    finalScore,
    pillars: {
      authentication: {
        score: authScore,
        weight: PILLAR_WEIGHTS.AUTH,
        findings: auth?.findings || [],
      },
      identity: {
        score: identityScore,
        weight: PILLAR_WEIGHTS.IDENTITY,
        findings: identity?.findings || [],
      },
      infrastructure: {
        score: ipScore,
        weight: PILLAR_WEIGHTS.IP,
        findings: ip?.findings || [],
      },
      nlp: {
        score: nlpScore,
        weight: PILLAR_WEIGHTS.NLP,
        findings: nlpFindings,
      },
    },
  };
}
