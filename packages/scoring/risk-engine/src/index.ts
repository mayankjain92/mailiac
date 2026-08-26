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
  AUTH: 0.20,
  IDENTITY: 0.35,
  IP: 0.10,
  NLP: 0.35,
} as const;

export const THREAT_LEVEL_QUARANTINE = 'HIGH_RISK_QUARANTINE';

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
 * A single weak or noisy signal should increase suspicion, but NOT trigger quarantine alone.
 * 
 * Conditions:
 * - C1 (Definite Phishing): Identity >= 85 AND Auth >= 70
 * - C2 (Malicious Deception): Identity >= 85 AND NLP >= 70
 * - C3 (Technical Evasion + Malicious Intent): NLP >= 90 AND (Auth >= 70 OR IP >= 90)
 * - C4 (Multi-Pillar Consensus): At least 3 independent pillars >= 70
 */
function shouldQuarantine(
  authScore: number,
  identityScore: number,
  ipScore: number,
  nlpScore: number
): boolean {
  // C1: Definite Phishing (Impersonation + Auth Failure)
  if (identityScore >= 85 && authScore >= 70) {
    return true;
  }

  // C2: Malicious Deception (Impersonation + Malicious Intent)
  if (identityScore >= 85 && nlpScore >= 70) {
    return true;
  }

  // C3: Technical Evasion + Malicious Intent
  if (nlpScore >= 90 && (authScore >= 70 || ipScore >= 90)) {
    return true;
  }

  // C4: Strong Multi-Pillar Consensus
  const strongSignals = countStrongSignals([authScore, identityScore, ipScore, nlpScore], 70);
  if (strongSignals >= 3) {
    return true;
  }

  return false;
}

/**
 * Aggregates individual scores from all 4 risk pillars (Auth, Identity, IP Reputation, NLP Intent)
 * into a consolidated RiskMatrix with the weighted and evidence-backed finalScore (0-100).
 *
 * Weighting: AUTH (0.20) + IDENTITY (0.35) + IP (0.10) + NLP (0.35)
 * Corroboration Bonus: Adds +10 (2 pillars >=70), +20 (3 pillars >=70), or +30 (4 pillars >=70).
 * Circuit Breakers: Quarantines (finalScore = 100) only when high-confidence evidence conditions C1-C4 are met.
 *
 * @param auth AuthResult from @mailiac/scoring-auth
 * @param identity IdentityResult from @mailiac/scoring-identity
 * @param ip IPReputationResult from @mailiac/scoring-ip-reputation
 * @param nlp NLPResult from @mailiac/parsing-ai-intent
 * @returns RiskMatrix
 */
export function aggregateRisk(
  auth: AuthResult,
  identity: IdentityResult,
  ip: IPReputationResult,
  nlp: NLPResult
): RiskMatrix {
  const authScore = sanitizeScore(auth?.authScore);
  const identityScore = sanitizeScore(identity?.identityScore);
  const ipScore = sanitizeScore(ip?.ipScore);
  const nlpScore = sanitizeScore(nlp?.nlpScore);

  const baseWeightedScore =
    authScore * PILLAR_WEIGHTS.AUTH +
    identityScore * PILLAR_WEIGHTS.IDENTITY +
    ipScore * PILLAR_WEIGHTS.IP +
    nlpScore * PILLAR_WEIGHTS.NLP;

  const strongSignalCount = countStrongSignals([authScore, identityScore, ipScore, nlpScore], 70);
  const corroborationBonus = calculateCorroborationBonus(strongSignalCount);

  const totalCalculatedScore = Math.min(100, Math.max(0, baseWeightedScore + corroborationBonus));

  const isQuarantined = shouldQuarantine(authScore, identityScore, ipScore, nlpScore);
  const finalScore = isQuarantined ? 100 : Math.round(totalCalculatedScore);

  return {
    authScore,
    identityScore,
    ipScore,
    nlpScore,
    finalScore,
  };
}
