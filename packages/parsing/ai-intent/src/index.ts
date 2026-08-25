import type { NLPResult } from '@mailiac/shared-types';

export async function scoreIntent(cleanedBodyText: string): Promise<NLPResult> {
  void cleanedBodyText;
  throw new Error('TODO: implement scoreIntent');
}
