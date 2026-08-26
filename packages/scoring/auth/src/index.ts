import type { AuthResult } from '@mailiac/shared-types';
import { authenticate } from 'mailauth';

/**
 * Timeout helper for mailauth execution.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`mailauth timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export interface CalculateAuthInput {
  spf: AuthResult['spf'];
  dkim: AuthResult['dkim'];
  dmarcAlignment: AuthResult['dmarcAlignment'];
  arcPass?: boolean;
  instanceCount?: number;
  finalSealCv?: string;
}

export interface ArcProperties {
  instanceCount: number;
  finalSealCv: string;
}

/**
 * Extracts highest ARC instanceCount (i=) and finalSealCv (cv=) from EML headers or mailauth result.
 */
export function extractArcProperties(rawEmlStr: string, resArc?: unknown): ArcProperties {
  let instanceCount = 0;
  let finalSealCv = 'none';

  const headerMatch = rawEmlStr.match(/^[\s\S]*?(?=\r?\n\r?\n|$)/);
  const headerText = headerMatch ? headerMatch[0] : rawEmlStr;

  const arcSealBlocks = headerText.split(/ARC-Seal:/i).slice(1);
  for (const block of arcSealBlocks) {
    const iMatch = block.match(/i=(\d+)/i);
    const cvMatch = block.match(/cv=([a-z]+)/i);

    if (iMatch) {
      const iVal = parseInt(iMatch[1], 10);
      const cvVal = cvMatch ? cvMatch[1].toLowerCase() : 'none';

      if (iVal >= instanceCount) {
        instanceCount = iVal;
        finalSealCv = cvVal;
      }
    }
  }

  if (resArc && typeof resArc === 'object' && instanceCount === 0) {
    const resArcObj = resArc as Record<string, unknown>;
    if (typeof resArcObj.chainLength === 'number') {
      instanceCount = resArcObj.chainLength;
    }
    const statusObj = resArcObj.status as { result?: string } | undefined;
    if (statusObj && typeof statusObj.result === 'string') {
      finalSealCv = statusObj.result.toLowerCase();
    }
  }

  return { instanceCount, finalSealCv };
}

/**
 * Parses raw EML headers manually for Authentication-Results, Received-SPF, DKIM-Signature, ARC-Seal
 * as a secondary fallback if DNS/live resolution is missing or returns 'none'.
 */
function parseHeaderFallback(rawEmlStr: string): Partial<AuthResult> & ArcProperties {
  const match = rawEmlStr.match(/^[\s\S]*?(?=\r?\n\r?\n|$)/);
  const headerText = match ? match[0] : rawEmlStr;

  let spf: AuthResult['spf'] = 'none';
  let dkim: AuthResult['dkim'] = 'none';
  let dmarcAlignment: AuthResult['dmarcAlignment'] = 'fail';

  // Check Received-SPF
  if (/Received-SPF:\s*pass/i.test(headerText)) {
    spf = 'pass';
  } else if (/Received-SPF:\s*(fail|softfail)/i.test(headerText)) {
    spf = 'fail';
  } else if (/Received-SPF:\s*neutral/i.test(headerText)) {
    spf = 'neutral';
  }

  // Check Authentication-Results for spf / dkim / dmarc
  if (/Authentication-Results:[\s\S]*?spf=pass/i.test(headerText)) {
    spf = 'pass';
  } else if (/Authentication-Results:[\s\S]*?spf=fail/i.test(headerText)) {
    spf = 'fail';
  }

  if (/Authentication-Results:[\s\S]*?dkim=pass/i.test(headerText)) {
    dkim = 'pass';
  } else if (/Authentication-Results:[\s\S]*?dkim=fail/i.test(headerText) || /DKIM-Signature:/i.test(headerText)) {
    dkim = /Authentication-Results:[\s\S]*?dkim=pass/i.test(headerText) ? 'pass' : 'fail';
  }

  if (/Authentication-Results:[\s\S]*?dmarc=pass/i.test(headerText)) {
    if (/header\.from|alignment=strict/i.test(headerText)) {
      dmarcAlignment = 'strict';
    } else {
      dmarcAlignment = 'relaxed';
    }
  }

  const arcProps = extractArcProperties(rawEmlStr);
  const isLegitimateForwardedPass = arcProps.instanceCount > 1 && arcProps.finalSealCv === 'pass';

  return { spf, dkim, dmarcAlignment, arcPass: isLegitimateForwardedPass, ...arcProps };
}

/**
 * Calculates authScore (0-100) based on SPF, DKIM, DMARC alignment, and strict Multi-Hop ARC pass.
 *
 * Rules:
 * 1. Base Authentication Penalty:
   *    - spf === 'none' | 'fail' -> +50 points
   *    - dmarcAlignment === 'fail' -> +50 points
   *    - dkim === 'fail' -> immediately cap base score at 100 (tampering threat)
 * 2. Multi-Hop ARC Verification:
 *    - isLegitimateForwardedPass = instanceCount > 1 AND finalSealCv === 'pass'
 * 3. Circuit-Breaker Override:
 *    - If isLegitimateForwardedPass === true: authScore = 0
 *    - Else: authScore = baseAuthScore (capped at 100)
 */
export function calculateAuthScore(result: CalculateAuthInput): number {
  // 1. Calculate Base Authentication Penalty
  let baseAuthScore = 0;

  if (result.spf === 'none' || result.spf === 'fail') {
    baseAuthScore += 50;
  }

  if (result.dmarcAlignment === 'fail') {
    baseAuthScore += 50;
  }

  if (result.dkim === 'fail') {
    baseAuthScore = 100;
  }

  baseAuthScore = Math.min(100, Math.max(0, baseAuthScore));

  // 2. Evaluate ARC Chain Validity (Strict Rules)
  const instanceCount = typeof result.instanceCount === 'number'
    ? result.instanceCount
    : (result.arcPass ? 2 : 0);

  const finalSealCv = (
    result.finalSealCv !== undefined ? result.finalSealCv : (result.arcPass ? 'pass' : 'none')
  ).toLowerCase();

  const isLegitimateForwardedPass = instanceCount > 1 && finalSealCv === 'pass';

  // 3. Apply Circuit-Breaker Override
  if (isLegitimateForwardedPass) {
    return 0;
  }

  return baseAuthScore;
}

/**
 * Verifies SPF, DKIM, DMARC, and ARC authentication status for a raw EML buffer.
 *
 * @param rawEml Raw EML message Buffer
 * @returns Promise<AuthResult>
 */
export async function verifyAuth(rawEml: Buffer): Promise<AuthResult> {
  if (!rawEml || rawEml.length === 0) {
    const fallback = {
      spf: 'none' as const,
      dkim: 'none' as const,
      dmarcAlignment: 'fail' as const,
      arcPass: false,
      instanceCount: 0,
      finalSealCv: 'none',
    };
    return {
      spf: fallback.spf,
      dkim: fallback.dkim,
      dmarcAlignment: fallback.dmarcAlignment,
      arcPass: false,
      authScore: calculateAuthScore(fallback),
    };
  }

  const rawEmlStr = rawEml.toString('utf-8');
  const headerFallback = parseHeaderFallback(rawEmlStr);

  try {
    const res = await withTimeout(
      authenticate(rawEml, { trustReceived: true }),
      3000
    );

    // Map SPF status
    let spf: AuthResult['spf'] = headerFallback.spf || 'none';
    if (res.spf && res.spf.status && res.spf.status.result && res.spf.status.result !== 'none') {
      const statusRes = res.spf.status.result;
      if (statusRes === 'pass') {
        spf = 'pass';
      } else if (['fail', 'softfail', 'permerror', 'temperror', 'temperr'].includes(statusRes)) {
        spf = 'fail';
      } else if (statusRes === 'neutral') {
        spf = 'neutral';
      }
    }

    // Map DKIM status
    let dkim: AuthResult['dkim'] = headerFallback.dkim || 'none';
    if (res.dkim && Array.isArray(res.dkim.results) && res.dkim.results.length > 0) {
      if (res.dkim.results.some((item) => item.status && item.status.result === 'pass')) {
        dkim = 'pass';
      } else if (res.dkim.results.some((item) => item.status && item.status.result === 'fail')) {
        dkim = 'fail';
      }
    }

    // Map DMARC alignment status
    let dmarcAlignment: AuthResult['dmarcAlignment'] = headerFallback.dmarcAlignment || 'fail';
    if (res.dmarc && res.dmarc.status && res.dmarc.status.result === 'pass') {
      const spfStrict = res.dmarc.alignment?.spf?.strict;
      const dkimStrict = res.dmarc.alignment?.dkim?.strict;
      if (spfStrict || dkimStrict) {
        dmarcAlignment = 'strict';
      } else {
        dmarcAlignment = 'relaxed';
      }
    } else if (headerFallback.dmarcAlignment && headerFallback.dmarcAlignment !== 'fail') {
      dmarcAlignment = headerFallback.dmarcAlignment;
    } else if (spf === 'pass' && dkim === 'pass') {
      dmarcAlignment = 'relaxed';
    }

    // Extract ARC chain properties (instanceCount and finalSealCv)
    const arcProps = extractArcProperties(rawEmlStr, res.arc);
    const isLegitimateForwardedPass = arcProps.instanceCount > 1 && arcProps.finalSealCv === 'pass';

    const input: CalculateAuthInput = {
      spf,
      dkim,
      dmarcAlignment,
      arcPass: isLegitimateForwardedPass,
      ...arcProps,
    };

    const finalAuthScore = calculateAuthScore(input);

    return {
      spf,
      dkim,
      dmarcAlignment,
      arcPass: isLegitimateForwardedPass,
      authScore: finalAuthScore,
    };
  } catch (_error) {
    // If mailauth fails or times out, fallback to header analysis
    const arcProps = extractArcProperties(rawEmlStr);
    const isLegitimateForwardedPass = arcProps.instanceCount > 1 && arcProps.finalSealCv === 'pass';

    const input: CalculateAuthInput = {
      spf: headerFallback.spf || 'none',
      dkim: headerFallback.dkim || 'none',
      dmarcAlignment: headerFallback.dmarcAlignment || 'fail',
      arcPass: isLegitimateForwardedPass,
      ...arcProps,
    };

    return {
      spf: input.spf,
      dkim: input.dkim,
      dmarcAlignment: input.dmarcAlignment,
      arcPass: isLegitimateForwardedPass,
      authScore: calculateAuthScore(input),
    };
  }
}
