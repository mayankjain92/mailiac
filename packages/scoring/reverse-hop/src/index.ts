import type { ReverseHopResult } from '@mailiac/shared-types';

export async function traceReverseHops(receivedHeadersRaw: string[]): Promise<ReverseHopResult> {
  void receivedHeadersRaw;
  throw new Error('TODO: implement traceReverseHops');
}
