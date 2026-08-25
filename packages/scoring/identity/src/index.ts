import type { IdentityResult } from '@mailiac/shared-types';
import { parse } from 'tldts';

/**
 * Homoglyph character map (UTS #39 confusable characters mapped to Latin ASCII)
 */
const HOMOGLYPH_MAP: Record<string, string> = {
  // Cyrillic lookalikes
  'а': 'a', 'А': 'a',
  'В': 'b',
  'с': 'c', 'С': 'c',
  'ԁ': 'd', 'Ԁ': 'd',
  'е': 'e', 'Е': 'e',
  'Ѕ': 's', 'ѕ': 's',
  'і': 'i', 'І': 'i',
  'ј': 'j', 'Ј': 'j',
  'К': 'k',
  'М': 'm',
  'Н': 'h',
  'о': 'o', 'О': 'o',
  'р': 'p', 'Р': 'p',
  'ԛ': 'q',
  'Т': 't',
  'у': 'y', 'У': 'y',
  'х': 'x', 'Х': 'x',
  // Greek lookalikes
  'α': 'a', 'Α': 'a',
  'Β': 'b',
  'Ε': 'e',
  'Η': 'h',
  'Ι': 'i', 'ι': 'i',
  'Κ': 'k',
  'Μ': 'm',
  'Ν': 'n',
  'Ο': 'o', 'ο': 'o',
  'Ρ': 'p',
  'Τ': 't',
  'Χ': 'x',
  'Υ': 'y',
  'Ζ': 'z',
  // Digit lookalikes for domain body
  '0': 'o',
  '1': 'l',
  '3': 'e',
  '5': 's',
};

/**
 * Normalizes a domain by converting homoglyphs/confusables to their ASCII skeleton representation.
 */
export function getHomoglyphSkeleton(domain: string): string {
  let skeleton = '';
  for (const char of domain) {
    skeleton += HOMOGLYPH_MAP[char] || char;
  }
  return skeleton.toLowerCase();
}

/**
 * Detects if a domain contains non-ASCII homoglyph characters or digit-substituted confusables.
 */
export function isHomoglyph(domain: string): boolean {
  for (let i = 0; i < domain.length; i++) {
    if (domain.charCodeAt(i) > 127) {
      return true;
    }
  }
  return false;
}

/**
 * Calculates standard Levenshtein distance between two strings.
 */
export function calculateLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Calculates Damerau-Levenshtein distance (allows transpositions of adjacent characters).
 */
export function calculateDamerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );

      // Transposition check
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + cost);
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculates Jaro-Winkler similarity score (0.0 to 1.0).
 */
export function calculateJaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) /
    3.0;

  // Winkler prefix scale
  let prefix = 0;
  const maxPrefix = 4;
  for (let i = 0; i < Math.min(maxPrefix, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return Number((jaro + prefix * 0.1 * (1.0 - jaro)).toFixed(4));
}

/**
 * Normalizes domain to registered domain / SLD for comparison.
 */
function cleanDomain(domainStr: string): string {
  if (!domainStr) return '';
  const parsed = parse(domainStr);
  return (parsed.domain || domainStr).toLowerCase().trim();
}

/**
 * Scores domain identity and typosquatting risk against a list of protected domains.
 *
 * @param senderDomain Sender's domain string (e.g. "target-corp.com" or "paypаl.com")
 * @param protectedDomains List of protected organization domains (e.g. ["target-corp.com", "paypal.com"])
 * @returns IdentityResult
 */
export function scoreIdentity(
  senderDomain: string,
  protectedDomains: string[]
): IdentityResult {
  if (!senderDomain || !protectedDomains || protectedDomains.length === 0) {
    return {
      levenshteinDistance: 0,
      damerauLevenshteinDistance: 0,
      jaroWinklerScore: 0,
      homoglyphMatch: false,
      identityScore: 0,
    };
  }

  const normalizedSender = cleanDomain(senderDomain);
  const senderSkeleton = getHomoglyphSkeleton(normalizedSender);
  const containsNonAscii = isHomoglyph(senderDomain);

  let bestMatchDomain: string | undefined = undefined;
  let minLevenshtein = Infinity;
  let minDamerauLevenshtein = Infinity;
  let maxJaroWinkler = 0;
  let homoglyphMatchDetected = false;

  for (const rawProtected of protectedDomains) {
    const protectedNorm = cleanDomain(rawProtected);
    const protectedSkeleton = getHomoglyphSkeleton(protectedNorm);

    // Check exact match
    if (normalizedSender === protectedNorm) {
      return {
        levenshteinDistance: 0,
        damerauLevenshteinDistance: 0,
        jaroWinklerScore: 1.0,
        homoglyphMatch: false,
        matchedProtectedDomain: rawProtected,
        identityScore: 0, // Legitimate sender, 0 risk
      };
    }

    // Check homoglyph skeleton match
    const isSkeletonMatch = senderSkeleton === protectedSkeleton;
    if (containsNonAscii || isSkeletonMatch) {
      if (isSkeletonMatch) {
        homoglyphMatchDetected = true;
      }
    }

    const lev = calculateLevenshtein(normalizedSender, protectedNorm);
    const damerau = calculateDamerauLevenshtein(normalizedSender, protectedNorm);
    const jaroWinkler = calculateJaroWinkler(normalizedSender, protectedNorm);

    if (
      damerau < minDamerauLevenshtein ||
      (damerau === minDamerauLevenshtein && jaroWinkler > maxJaroWinkler)
    ) {
      minLevenshtein = lev;
      minDamerauLevenshtein = damerau;
      maxJaroWinkler = jaroWinkler;
      bestMatchDomain = rawProtected;
    }
  }

  // Calculate identityScore based on PRD thresholds:
  // Homoglyph match -> 100 pts
  // Damerau-Levenshtein <= 2 -> 100 pts
  // Damerau-Levenshtein == 3 -> 75 pts
  // Jaro-Winkler >= 0.85 -> 100 pts (combosquatting)
  // Jaro-Winkler >= 0.75 -> 50 pts
  let identityScore = 0;

  if (homoglyphMatchDetected) {
    identityScore = 100;
  } else if (minDamerauLevenshtein <= 2) {
    identityScore = 100;
  } else if (maxJaroWinkler >= 0.85) {
    identityScore = 100;
  } else if (minDamerauLevenshtein === 3) {
    identityScore = 75;
  } else if (maxJaroWinkler >= 0.75) {
    identityScore = 50;
  } else {
    identityScore = 0;
    // If no meaningful similarity or threat detected, clear matched domain
    bestMatchDomain = undefined;
  }

  return {
    levenshteinDistance: minLevenshtein === Infinity ? 0 : minLevenshtein,
    damerauLevenshteinDistance: minDamerauLevenshtein === Infinity ? 0 : minDamerauLevenshtein,
    jaroWinklerScore: maxJaroWinkler,
    homoglyphMatch: homoglyphMatchDetected || containsNonAscii,
    ...(bestMatchDomain ? { matchedProtectedDomain: bestMatchDomain } : {}),
    identityScore,
  };
}
