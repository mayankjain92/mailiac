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

/**
 * Parses raw EML headers manually for Authentication-Results, Received-SPF, DKIM-Signature, ARC-Seal
 * as a secondary fallback if DNS/live resolution is missing or returns 'none'.
 */
function parseHeaderFallback(rawEmlStr: string): Partial<AuthResult> {
  const match = rawEmlStr.match(/^[\s\S]*?(?=\r?\n\r?\n|$)/);
  const headerText = match ? match[0] : rawEmlStr;

  let spf: AuthResult['spf'] = 'none';
  let dkim: AuthResult['dkim'] = 'none';
  let dmarcAlignment: AuthResult['dmarcAlignment'] = 'fail';
  let arcPass = false;

  // Check Received-SPF
  if (/Received-SPF:\s*pass/i.test(headerText)) {
    spf = 'pass';
  } else if (/Received-SPF:\s*(fail|softfail)/i.test(headerText)) {
    spf = 'fail';
  } else if (/Received-SPF:\s*neutral/i.test(headerText)) {
    spf = 'neutral';
  }

  // Check Authentication-Results for spf / dkim / dmarc / arc
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

  if (/ARC-Seal:[\s\S]*?cv=pass/i.test(headerText) || /Authentication-Results:[\s\S]*?\barc=pass/i.test(headerText)) {
    arcPass = true;
  }

  return { spf, dkim, dmarcAlignment, arcPass };
}

/**
 * Calculates authScore (0-100) based on SPF, DKIM, DMARC alignment, and ARC pass.
 * 0 = Fully authenticated / safe
 * 100 = Total authentication failure / high risk
 * An ARC seal pass (`arcPass === true`) overrides penalties to 0 for legitimate mailing lists.
 */
export function calculateAuthScore(result: Omit<AuthResult, 'authScore'>): number {
  if (result.arcPass) {
    return 0;
  }

  let score = 0;

  // SPF penalty
  switch (result.spf) {
    case 'pass':
      score += 0;
      break;
    case 'neutral':
    case 'none':
      score += 20;
      break;
    case 'fail':
      score += 40;
      break;
  }

  // DKIM penalty
  switch (result.dkim) {
    case 'pass':
      score += 0;
      break;
    case 'none':
      score += 20;
      break;
    case 'fail':
      score += 40;
      break;
  }

  // DMARC alignment penalty
  switch (result.dmarcAlignment) {
    case 'strict':
      score += 0;
      break;
    case 'relaxed':
      score += 10;
      break;
    case 'fail':
      score += 20;
      break;
  }

  return Math.min(100, Math.max(0, score));
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
    };
    return {
      ...fallback,
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

    // Map ARC pass
    let arcPass = headerFallback.arcPass || false;
    if (res.arc && res.arc.status) {
      if (res.arc.status.result === 'pass' || res.arc.status.comment?.includes('cv=pass')) {
        arcPass = true;
      }
    }

    const partial = { spf, dkim, dmarcAlignment, arcPass };
    return {
      ...partial,
      authScore: calculateAuthScore(partial),
    };
  } catch (_error) {
    // If mailauth fails or times out, fallback to header analysis
    const partial = {
      spf: headerFallback.spf || 'none',
      dkim: headerFallback.dkim || 'none',
      dmarcAlignment: headerFallback.dmarcAlignment || 'fail',
      arcPass: headerFallback.arcPass || false,
    };

    return {
      ...partial,
      authScore: calculateAuthScore(partial),
    };
  }
}
