import type { IPReputationResult } from '@mailiac/shared-types';

export async function scoreIpReputation(
  originatingSenderIp: string,
  dateHeader: string
): Promise<IPReputationResult> {
  void originatingSenderIp;
  void dateHeader;
  throw new Error('TODO: implement scoreIpReputation');
}
