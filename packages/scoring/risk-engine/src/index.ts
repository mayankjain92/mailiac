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
 * Evaluates high-confidence evidence conditions to determine if the message must be quarantined.
 * 
 * Tier 1: Fatal Circuit Breakers
 * - Free Webmail Impersonation
 * - Critical Attack Vectors
 * - Coercive Identity Threat
 */
function evaluateTier1Quarantine(
  senderDomain: string,
  identityScore: number,
  nlpScore: number,
  intentLabels: string[]
): boolean {
  const isFreeWebmail = FREE_WEBMAIL_DOMAINS.includes(senderDomain.toLowerCase());
  const severeLabels = [
    'FINANCIAL_COERCION', 
    'CREDENTIAL_HARVESTING', 
    'AUTHORITY_TRAP', 
    'BRAND_IMPERSONATION', 
    'MALWARE_PAYLOAD', 
    'EXTORTION'
  ];
  
  const hasSevereIntent = intentLabels.some(label => severeLabels.includes(label));

  // Free Webmail Impersonation
  if (isFreeWebmail && hasSevereIntent) {
    return true;
  }

  // Critical Attack Vectors
  if (nlpScore >= 80 && hasSevereIntent) {
    return true;
  }

  // Coercive Identity Threat
  if (identityScore >= 80 && nlpScore >= 60) {
    return true;
  }

  return false;
}

/**
 * Aggregates individual scores from all 4 risk pillars (Auth, Identity, IP Reputation, NLP Intent)
 * into a consolidated RiskMatrix with the weighted and evidence-backed finalScore (0-100).
 *
 * Implements a 3-Tier Risk Evaluation Architecture:
 * - Tier 1: Fatal Circuit Breakers
 * - Tier 2: Asymmetric Cryptographic Trust Dampener
 * - Tier 3: Rebalanced Base Weight Aggregation
 *
 * @param senderDomain The extracted domain from the sender's email address
 * @param auth AuthResult from @mailiac/scoring-auth
 * @param identity IdentityResult from @mailiac/scoring-identity
 * @param ip IPReputationResult from @mailiac/scoring-ip-reputation
 * @param nlp NLPResult from @mailiac/parsing-ai-intent
 * @returns RiskMatrix
 */
export function aggregateRisk(
  senderDomain: string,
  auth: AuthResult,
  identity: IdentityResult,
  ip: IPReputationResult,
  nlp: NLPResult
): RiskMatrix {
  const authScore = sanitizeScore(auth?.authScore);
  let identityScore = sanitizeScore(identity?.identityScore);
  const ipScore = sanitizeScore(ip?.ipScore);
  let nlpScore = sanitizeScore(nlp?.nlpScore);
  const intentLabels = nlp?.intentLabels || [];

  // Tier 1: Fatal Circuit Breakers (Zero Tolerance -> Quarantine)
  const isQuarantined = evaluateTier1Quarantine(senderDomain, identityScore, nlpScore, intentLabels);

  if (!isQuarantined) {
    // Tier 2: Asymmetric Cryptographic Trust Dampener
    const isFreeWebmail = FREE_WEBMAIL_DOMAINS.includes(senderDomain.toLowerCase());
    if (authScore === 0 && ipScore === 0 && !isFreeWebmail) {
      if (intentLabels.includes('MARKETING')) {
        nlpScore = Math.min(nlpScore, 15);
        identityScore = Math.min(identityScore, 15);
      } else if (identityScore < 70) {
        identityScore = sanitizeScore(identityScore * 0.35); // discount by 65%
      }
    }
  }

  // Tier 3: Rebalanced Base Weight Aggregation
  const baseWeightedScore =
    authScore * PILLAR_WEIGHTS.AUTH +
    identityScore * PILLAR_WEIGHTS.IDENTITY +
    ipScore * PILLAR_WEIGHTS.IP +
    nlpScore * PILLAR_WEIGHTS.NLP;

  const baseScore = Math.round(baseWeightedScore * 100) / 100;
  const strongSignalCount = countStrongSignals([authScore, identityScore, ipScore, nlpScore], 70);
  const corroborationBonus = calculateCorroborationBonus(strongSignalCount);

  const totalCalculatedScore = Math.min(100, Math.max(0, baseWeightedScore + corroborationBonus));
  const finalScore = isQuarantined ? 100 : Math.round(totalCalculatedScore);

  const nlpFindings = [...(nlp?.findings || [])];
  if (isQuarantined) {
    nlpFindings.push({
      type: 'HIGH_RISK_QUARANTINE',
      severity: 'HIGH',
      description: 'High-risk quarantine override triggered: Fatal circuit breaker matched actionable threats',
    });
  }

  return {
    authScore,
    identityScore,
    ipScore,
    nlpScore,
    baseScore,
    corroborationBonus,
    quarantineOverride: isQuarantined,
    override: {
      triggered: isQuarantined,
      type: isQuarantined ? THREAT_LEVEL_QUARANTINE : 'NONE',
      reason: isQuarantined
        ? 'High-risk quarantine override triggered: Fatal circuit breaker matched actionable threats'
        : 'Standard weighted aggregation applied without override',
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
