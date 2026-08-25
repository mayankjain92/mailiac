import type { IdentityResult } from '@mailiac/shared-types';

export function scoreIdentity(senderDomain: string, protectedDomains: string[]): IdentityResult {
  void senderDomain;
  void protectedDomains;
  throw new Error('TODO: implement scoreIdentity');
}
