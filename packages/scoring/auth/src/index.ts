import type { AuthResult } from '@mailiac/shared-types';

export async function verifyAuth(rawEml: Buffer): Promise<AuthResult> {
  void rawEml;
  throw new Error('TODO: implement verifyAuth');
}
