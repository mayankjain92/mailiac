import fs from 'node:fs';
import { parseEml } from '@mailiac/parsing-mime';
import { extractIntent } from '@mailiac/parsing-decloak';
import { scoreIntent } from '@mailiac/parsing-ai-intent';
import { aggregateRisk } from '@mailiac/scoring-risk-engine';
import { verifyAuth } from '@mailiac/scoring-auth';
import { scoreIdentity } from '@mailiac/scoring-identity';

async function main() {
  const emlBuf = fs.readFileSync('../../packages/parsing/mime/test/fixtures/sample-1.eml');
  const mimeResult = await parseEml(emlBuf);
  const nlpResult = await scoreIntent(extractIntent(mimeResult));
  
  const authResult = await verifyAuth(emlBuf, mimeResult.from?.address || '', '::1');
  const identityResult = scoreIdentity(mimeResult.from?.name, mimeResult.from?.address || '');

  const riskMatrix = aggregateRisk(authResult, identityResult, null, nlpResult);
  console.log(JSON.stringify(riskMatrix, null, 2));
}

main().catch(console.error);
