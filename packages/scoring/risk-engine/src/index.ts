import type { AuthResult, IdentityResult, IPReputationResult, NLPResult, RiskMatrix } from '@mailiac/shared-types';

export function aggregateRisk(
  auth: AuthResult,
  identity: IdentityResult,
  ip: IPReputationResult,
  nlp: NLPResult
): RiskMatrix {
  void auth;
  void identity;
  void ip;
  void nlp;
  throw new Error('TODO: implement aggregateRisk');
}
