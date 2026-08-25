import type {
  AuthResult,
  IdentityResult,
  IPReputationResult,
  NLPResult,
  RiskMatrix,
} from '@mailiac/shared-types';

/**
 * Pillar weights for the master email forensics risk score formula:
 * finalScore = auth * 0.30 + identity * 0.20 + ip * 0.20 + nlp * 0.30
 */
export const PILLAR_WEIGHTS = {
  AUTH: 0.30,
  IDENTITY: 0.20,
  IP: 0.20,
  NLP: 0.30,
} as const;

function sanitizeScore(score: unknown): number {
  if (typeof score !== 'number' || isNaN(score)) {
    return 0;
  }
  return Math.min(100, Math.max(0, score));
}

/**
 * Aggregates individual scores from all 4 risk pillars (Auth, Identity, IP Reputation, NLP Intent)
 * into a consolidated RiskMatrix with the weighted finalScore (0-100).
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

  const weightedSum =
    authScore * PILLAR_WEIGHTS.AUTH +
    identityScore * PILLAR_WEIGHTS.IDENTITY +
    ipScore * PILLAR_WEIGHTS.IP +
    nlpScore * PILLAR_WEIGHTS.NLP;

  const finalScore = Math.min(100, Math.max(0, Math.round(weightedSum)));

  return {
    authScore,
    identityScore,
    ipScore,
    nlpScore,
    finalScore,
  };
}
