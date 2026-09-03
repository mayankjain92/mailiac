import type { IdentityResult, Finding } from '@mailiac/shared-types';
import { parse } from 'tldts';
import {
  DEFAULT_PROTECTED_DOMAINS,
  DEFAULT_BRAND_ALIASES,
  HIGH_RISK_KEYWORDS,
  HIGH_RISK_TLDS,
  FREE_WEBMAIL_DOMAINS,
} from './defaults.js';

export {
  DEFAULT_PROTECTED_DOMAINS,
  DEFAULT_BRAND_ALIASES,
  HIGH_RISK_KEYWORDS,
  HIGH_RISK_TLDS,
  FREE_WEBMAIL_DOMAINS,
};

/**
 * Homoglyph character map (UTS #39 confusable characters mapped to Latin ASCII)
 */
const HOMOGLYPH_MAP: Record<string, string> = {
  // Roman numeral & Latin lookalikes
  'ⅼ': 'l', 'І': 'i', 'і': 'i', 'I': 'i', 'l': 'l', '1': 'l', '|': 'l',
  'vv': 'w', 'rn': 'm',
  // Cyrillic lookalikes
  'а': 'a', 'А': 'a',
  'В': 'b',
  'с': 'c', 'С': 'c',
  'ԁ': 'd', 'Ԁ': 'd',
  'е': 'e', 'Е': 'e',
  'Ѕ': 's', 'ѕ': 's',
  'ј': 'j', 'Ј': 'j',
  'К': 'k', 'к': 'k',
  'М': 'm', 'м': 'm',
  'Н': 'h', 'н': 'h',
  'о': 'o', 'О': 'o',
  'р': 'p', 'Р': 'p',
  'ԛ': 'q',
  'Т': 't', 'т': 't',
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
  '3': 'e',
  '4': 'a',
  '5': 's',
  '8': 'b',
};

/**
 * Safely escapes characters for dynamic RegExp creation.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normalizes and decodes punycode/IDN domains if present.
 */
function decodePunycode(domainStr: string): string {
  if (!domainStr) return '';
  const trimmed = domainStr.trim().toLowerCase();
  if (trimmed.includes('xn--')) {
    try {
      const url = new URL(`http://${trimmed}`);
      return url.hostname;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

/**
 * Normalizes domain to registered domain / SLD for comparison using tldts.
 */
export function cleanDomain(domainStr: string): string {
  if (!domainStr) return '';
  const decoded = decodePunycode(domainStr);
  const sanitized = decoded.replace(/\.+$/, '').trim();
  const parsed = parse(sanitized);
  return (parsed.domain || sanitized).toLowerCase().trim();
}

/**
 * Normalizes and deduplicates a list of domain strings.
 */
export function normalizeDomainList(domains: string[]): string[] {
  const set = new Set<string>();
  for (const d of domains) {
    const cleaned = cleanDomain(d);
    if (cleaned && cleaned.length > 0) {
      set.add(cleaned);
    }
  }
  return Array.from(set);
}

/**
 * Normalizes a domain by converting homoglyphs/confusables to their ASCII skeleton representation.
 */
export function getHomoglyphSkeleton(domain: string): string {
  const cleaned = cleanDomain(domain);
  let skeleton = '';
  for (const char of cleaned) {
    skeleton += HOMOGLYPH_MAP[char] || char;
  }
  return skeleton.toLowerCase();
}

/**
 * Detects if a domain contains non-ASCII homoglyph characters or digit-substituted confusables.
 */
export function isHomoglyph(domain: string): boolean {
  const cleaned = cleanDomain(domain);
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned.charCodeAt(i) > 127) {
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
  if (s1.length === 0 || s2.length === 0) return 0.0;
  if (s1 === s2) return 1.0;

  const matchWindow = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1);
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
 * Calculates the length of the common prefix between two strings from index 0.
 */
export function getCommonPrefixLength(a: string, b: string): number {
  let i = 0;
  const maxLen = Math.min(a.length, b.length);
  while (i < maxLen && a[i] === b[i]) {
    i++;
  }
  return i;
}

/**
 * Calculates the length of the longest common contiguous substring between two strings.
 */
export function getLongestCommonSubstringLength(a: string, b: string): number {
  if (!a || !b) return 0;
  let maxLen = 0;
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        if (dp[i][j] > maxLen) {
          maxLen = dp[i][j];
        }
      }
    }
  }
  return maxLen;
}

/** Named thresholds and parameters for evidence-gated typosquatting detection */
export const SHORT_DOMAIN_MAX_LENGTH = 4;
export const MAX_DISTANCE_FOR_SHORT_DOMAIN = 1;
export const MIN_JARO_WINKLER_FOR_TYPOSQUAT = 0.88;
export const MIN_JARO_WINKLER_HIGH = 0.90;
export const MAX_EDIT_RATIO_HIGH = 0.25;
export const MAX_EDIT_RATIO_MODERATE = 0.30;
export const MIN_STEM_RATIO_FOR_TYPOSQUAT = 0.50;
export const MIN_STEM_LENGTH_MODERATE = 4;
export const MIN_LENGTH_FOR_DISTANCE_3 = 7;

export interface TyposquatEvidence {
  isMatch: boolean;
  severity?: 'HIGH' | 'MEDIUM';
  confidenceScore: number;
  damerauDistance: number;
  levenshteinDistance: number;
  jaroWinkler: number;
  editRatio: number;
  sharedStemLength: number;
  stemRatio: number;
  commonPrefixLength: number;
  reason?: string;
}

/**
 * Evaluates candidate domain SLD against protected brand SLD using multi-metric evidence gating.
 * Edit distance is treated as evidence rather than proof.
 */
export function evaluateTyposquatSimilarity(
  candidateSLD: string,
  protectedSLD: string,
  options?: { isBrandImpersonation?: boolean }
): TyposquatEvidence {
  const cand = candidateSLD.toLowerCase().trim();
  const prot = protectedSLD.toLowerCase().trim();

  if (!cand || !prot || cand === prot) {
    return {
      isMatch: false,
      confidenceScore: 0,
      damerauDistance: 0,
      levenshteinDistance: 0,
      jaroWinkler: cand === prot ? 1.0 : 0.0,
      editRatio: 0,
      sharedStemLength: 0,
      stemRatio: 0,
      commonPrefixLength: 0,
    };
  }

  const maxLen = Math.max(cand.length, prot.length);
  const minLen = Math.min(cand.length, prot.length);

  // Rapid length pruning on SLD
  if (Math.abs(cand.length - prot.length) > 3) {
    return {
      isMatch: false,
      confidenceScore: 0,
      damerauDistance: Infinity,
      levenshteinDistance: Infinity,
      jaroWinkler: 0,
      editRatio: 1,
      sharedStemLength: 0,
      stemRatio: 0,
      commonPrefixLength: 0,
    };
  }

  const damerau = calculateDamerauLevenshtein(cand, prot);
  const lev = calculateLevenshtein(cand, prot);
  const jw = calculateJaroWinkler(cand, prot);
  const editRatio = damerau / maxLen;
  const cp = getCommonPrefixLength(cand, prot);
  const lcs = getLongestCommonSubstringLength(cand, prot);
  const sharedStem = Math.max(cp, lcs);
  const stemRatio = sharedStem / prot.length;

  const baseEvidence: Omit<TyposquatEvidence, 'isMatch' | 'confidenceScore'> = {
    damerauDistance: damerau,
    levenshteinDistance: lev,
    jaroWinkler: jw,
    editRatio,
    sharedStemLength: sharedStem,
    stemRatio,
    commonPrefixLength: cp,
  };

  // Anything with distance > 3 is not a typosquat
  if (damerau > 3) {
    return { ...baseEvidence, isMatch: false, confidenceScore: 0 };
  }

  const isShortBrand = prot.length <= SHORT_DOMAIN_MAX_LENGTH;

  // Short protected brands (e.g. sap, visa, meta, uber)
  if (isShortBrand) {
    if (damerau > MAX_DISTANCE_FOR_SHORT_DOMAIN) {
      return { ...baseEvidence, isMatch: false, confidenceScore: 0 };
    }
    if (options?.isBrandImpersonation) {
      return {
        ...baseEvidence,
        isMatch: true,
        severity: 'HIGH',
        confidenceScore: 100,
        reason: 'Display name corroborates brand claim on short domain',
      };
    }
    if (
      damerau === 1 &&
      editRatio <= MAX_EDIT_RATIO_HIGH &&
      jw >= MIN_JARO_WINKLER_FOR_TYPOSQUAT &&
      sharedStem >= 3 &&
      stemRatio >= 0.75
    ) {
      return {
        ...baseEvidence,
        isMatch: true,
        severity: 'HIGH',
        confidenceScore: 100,
        reason: 'High structural similarity to short protected brand',
      };
    }
    return { ...baseEvidence, isMatch: false, confidenceScore: 0 };
  }

  // Standard protected brand (prot.length >= 5)
  // 1. Single edit mutation (distance 1)
  if (damerau === 1) {
    if (
      editRatio <= MAX_EDIT_RATIO_HIGH &&
      jw >= MIN_JARO_WINKLER_FOR_TYPOSQUAT &&
      sharedStem >= 3 &&
      stemRatio >= MIN_STEM_RATIO_FOR_TYPOSQUAT &&
      (cp >= 2 || (jw >= MIN_JARO_WINKLER_HIGH && sharedStem >= 4))
    ) {
      return {
        ...baseEvidence,
        isMatch: true,
        severity: 'HIGH',
        confidenceScore: 100,
        reason: 'High-confidence single-edit mutation retaining brand stem',
      };
    }
    return { ...baseEvidence, isMatch: false, confidenceScore: 0 };
  }

  // 2. Double edit mutation (distance 2)
  if (damerau === 2) {
    // High severity (e.g. docusn vs docusign, micros0ftt vs microsoft)
    if (
      editRatio <= MAX_EDIT_RATIO_HIGH &&
      jw >= MIN_JARO_WINKLER_HIGH &&
      sharedStem >= 4 &&
      stemRatio >= 0.60 &&
      cp >= 2
    ) {
      return {
        ...baseEvidence,
        isMatch: true,
        severity: 'HIGH',
        confidenceScore: 100,
        reason: 'High-confidence multi-edit brand mutation with strong structural alignment',
      };
    }
    // Moderate severity
    if (
      editRatio <= MAX_EDIT_RATIO_MODERATE &&
      jw >= MIN_JARO_WINKLER_FOR_TYPOSQUAT &&
      sharedStem >= MIN_STEM_LENGTH_MODERATE &&
      stemRatio >= MIN_STEM_RATIO_FOR_TYPOSQUAT &&
      cp >= 2
    ) {
      return {
        ...baseEvidence,
        isMatch: true,
        severity: 'MEDIUM',
        confidenceScore: 70,
        reason: 'Moderate multi-edit brand mutation with preserved prefix and stem',
      };
    }
    return { ...baseEvidence, isMatch: false, confidenceScore: 0 };
  }

  // 3. Triple edit mutation (distance 3) - strictly gated to long domains
  if (damerau === 3) {
    if (
      minLen >= MIN_LENGTH_FOR_DISTANCE_3 &&
      editRatio <= MAX_EDIT_RATIO_MODERATE &&
      jw >= MIN_JARO_WINKLER_FOR_TYPOSQUAT &&
      sharedStem >= MIN_STEM_LENGTH_MODERATE &&
      stemRatio >= MIN_STEM_RATIO_FOR_TYPOSQUAT &&
      cp >= 2
    ) {
      return {
        ...baseEvidence,
        isMatch: true,
        severity: 'MEDIUM',
        confidenceScore: 70,
        reason: 'Moderate triple-edit mutation on long brand retaining substantial stem',
      };
    }
    return { ...baseEvidence, isMatch: false, confidenceScore: 0 };
  }

  return { ...baseEvidence, isMatch: false, confidenceScore: 0 };
}

export interface DisplayNameMismatchResult {
  isMismatch: boolean;
  claimedBrand?: string;
  matchedAlias?: string;
  jaroWinklerScore: number;
  levenshteinDistance: number;
}

/**
 * Evaluates whether a sender's display name claims an organization or brand
 * that does not match the actual sender domain using exact alias boundaries and string distance.
 */
export function detectDisplayNameMismatch(
  displayName: string,
  senderDomain: string,
  protectedDomains: string[],
  brandAliases?: Record<string, string[]>
): DisplayNameMismatchResult {
  if (!displayName || !senderDomain || !protectedDomains || protectedDomains.length === 0) {
    return { isMismatch: false, jaroWinklerScore: 0, levenshteinDistance: 0 };
  }

  const cleanDisplayName = displayName.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizedSender = cleanDomain(senderDomain);
  const mergedAliases = { ...DEFAULT_BRAND_ALIASES, ...brandAliases };

  for (const rawProtected of protectedDomains) {
    const protectedNorm = cleanDomain(rawProtected);
    if (normalizedSender === protectedNorm) {
      continue;
    }

    const brandName = protectedNorm.split('.')[0] || '';
    if (brandName.length < 3) continue;

    const aliases = mergedAliases[protectedNorm] || [brandName];
    let matchedAlias: string | undefined;

    for (const alias of aliases) {
      const cleanAlias = alias.toLowerCase().trim();
      if (!cleanAlias || cleanAlias.length < 3) continue;

      const brandRegex = new RegExp(`\\b${escapeRegExp(cleanAlias)}\\b`, 'i');
      if (brandRegex.test(cleanDisplayName)) {
        matchedAlias = cleanAlias;
        break;
      }
    }

    const jaroWinkler = calculateJaroWinkler(cleanDisplayName, brandName);
    const lev = calculateLevenshtein(cleanDisplayName, brandName);

    if ((matchedAlias || (brandName.length >= 5 && jaroWinkler >= 0.90)) && normalizedSender !== protectedNorm) {
      return {
        isMismatch: true,
        claimedBrand: rawProtected,
        matchedAlias: matchedAlias || brandName,
        jaroWinklerScore: jaroWinkler,
        levenshteinDistance: lev,
      };
    }
  }

  return { isMismatch: false, jaroWinklerScore: 0, levenshteinDistance: 0 };
}

export interface CombosquattingResult {
  isCombosquatting: boolean;
  matchedBrand?: string;
  matchedKeyword?: string;
  severity: 'HIGH' | 'MEDIUM';
}

/**
 * Detects combosquatting patterns where a protected brand name is combined with action/phishing keywords.
 */
export function detectCombosquatting(
  candidateDomain: string,
  protectedDomains: string[]
): CombosquattingResult {
  const parsed = parse(candidateDomain);
  const candSLD = (parsed.domainWithoutSuffix || '').toLowerCase();
  if (!candSLD || candSLD.length < 4) {
    return { isCombosquatting: false, severity: 'MEDIUM' };
  }

  const candTokens = candSLD.split(/[-._0-9]+/).filter((t) => t.length >= 2);

  for (const rawProtected of protectedDomains) {
    const protClean = cleanDomain(rawProtected);
    const protParsed = parse(protClean);
    const protSLD = (protParsed.domainWithoutSuffix || '').toLowerCase();

    if (!protSLD || protSLD.length < 3 || candSLD === protSLD) {
      continue;
    }

    // 1. Hyphenated / Tokenized structure (e.g. paypal-login, login-microsoft)
    const containsProtSLDToken = candTokens.includes(protSLD);
    if (containsProtSLDToken) {
      const matchingKeyword = candTokens.find((t) => HIGH_RISK_KEYWORDS.includes(t));
      if (matchingKeyword) {
        return {
          isCombosquatting: true,
          matchedBrand: rawProtected,
          matchedKeyword: matchingKeyword,
          severity: 'HIGH',
        };
      } else if (candTokens.length >= 2) {
        return {
          isCombosquatting: true,
          matchedBrand: rawProtected,
          severity: 'MEDIUM',
        };
      }
    }

    // 2. Direct concatenation without hyphens (e.g. paypallogin, microsoftverify)
    if (protSLD.length >= 4) {
      if (candSLD.startsWith(protSLD)) {
        const remainder = candSLD.slice(protSLD.length);
        if (HIGH_RISK_KEYWORDS.includes(remainder)) {
          return {
            isCombosquatting: true,
            matchedBrand: rawProtected,
            matchedKeyword: remainder,
            severity: 'HIGH',
          };
        }
      } else if (candSLD.endsWith(protSLD)) {
        const prefix = candSLD.slice(0, candSLD.length - protSLD.length);
        if (HIGH_RISK_KEYWORDS.includes(prefix)) {
          return {
            isCombosquatting: true,
            matchedBrand: rawProtected,
            matchedKeyword: prefix,
            severity: 'HIGH',
          };
        }
      }
    }
  }

  return { isCombosquatting: false, severity: 'MEDIUM' };
}

export interface TldSwappingResult {
  isTldSwapping: boolean;
  matchedBrand?: string;
  isHighRiskTld: boolean;
  severity: 'HIGH' | 'MEDIUM';
}

/**
 * Detects cousin domain / TLD swapping attacks where the SLD exactly matches a protected brand
 * under a different or high-risk TLD.
 */
export function detectTldSwapping(
  candidateDomain: string,
  protectedDomains: string[],
  displayName?: string
): TldSwappingResult {
  const candClean = cleanDomain(candidateDomain);
  const candParsed = parse(candClean);
  const candSLD = (candParsed.domainWithoutSuffix || '').toLowerCase();
  const candTLD = (candParsed.publicSuffix || '').toLowerCase();

  if (!candSLD || !candTLD) {
    return { isTldSwapping: false, isHighRiskTld: false, severity: 'MEDIUM' };
  }

  for (const rawProtected of protectedDomains) {
    const protClean = cleanDomain(rawProtected);
    const protParsed = parse(protClean);
    const protSLD = (protParsed.domainWithoutSuffix || '').toLowerCase();
    const protTLD = (protParsed.publicSuffix || '').toLowerCase();

    if (!protSLD || !protTLD || protClean === candClean) {
      continue;
    }

    if (candSLD === protSLD && candTLD !== protTLD) {
      const isHighRiskTld = HIGH_RISK_TLDS.has(candTLD);
      const claimsBrandInDisplay =
        Boolean(displayName) &&
        displayName!.toLowerCase().includes(protSLD);

      const severity: 'HIGH' | 'MEDIUM' = (isHighRiskTld || claimsBrandInDisplay) ? 'HIGH' : 'MEDIUM';

      return {
        isTldSwapping: true,
        matchedBrand: rawProtected,
        isHighRiskTld,
        severity,
      };
    }
  }

  return { isTldSwapping: false, isHighRiskTld: false, severity: 'MEDIUM' };
}

/**
 * Scores domain identity and typosquatting risk against a list of protected domains.
 *
 * @param senderDomain Sender's domain string (e.g. "target-corp.com" or "paypаl.com")
 * @param protectedDomains List of protected organization domains (merged with defaults)
 * @param displayName Optional From display name (e.g. "PayPal Support")
 * @param brandAliases Optional mapping of domains to their known aliases
 * @returns IdentityResult
 */
export function scoreIdentity(
  senderDomain: string,
  protectedDomains?: string[],
  displayName?: string,
  brandAliases?: Record<string, string[]>
): IdentityResult {
  // Merge user provided domains with default baseline protected domains
  const combinedProtected = normalizeDomainList([
    ...(protectedDomains || []),
    ...DEFAULT_PROTECTED_DOMAINS,
  ]);

  if (!senderDomain || combinedProtected.length === 0) {
    return {
      levenshteinDistance: 0,
      damerauLevenshteinDistance: 0,
      jaroWinklerScore: 0,
      homoglyphMatch: false,
      identityScore: 0,
      findings: [],
    };
  }

  const normalizedSender = cleanDomain(senderDomain);
  const isWebmail = FREE_WEBMAIL_DOMAINS.has(normalizedSender);

  // 1. Exact protected domain match check (Legitimate sender or legitimate subdomain gets score 0)
  for (const rawProtected of combinedProtected) {
    const protectedNorm = cleanDomain(rawProtected);
    if (normalizedSender === protectedNorm) {
      return {
        levenshteinDistance: 0,
        damerauLevenshteinDistance: 0,
        jaroWinklerScore: 1.0,
        homoglyphMatch: false,
        matchedProtectedDomain: rawProtected,
        identityScore: 0,
        findings: [],
      };
    }
  }

  const findings: Finding[] = [];
  const candidateScores: number[] = [];
  let matchedBrand: string | undefined = undefined;

  // 2. Brand Impersonation / Alias Mismatch in Display Name
  let isBrandImpersonation = false;
  if (displayName) {
    const mismatch = detectDisplayNameMismatch(displayName, senderDomain, combinedProtected, brandAliases);
    if (mismatch.isMismatch && mismatch.claimedBrand) {
      isBrandImpersonation = true;
      matchedBrand = mismatch.claimedBrand;
      candidateScores.push(90);
      findings.push({
        type: 'BRAND_IMPERSONATION',
        severity: 'HIGH',
        description: `Display name claims brand identity '${mismatch.matchedAlias || mismatch.claimedBrand}', but sender domain is '${senderDomain}'`,
      });
    }
  }

  // Free webmail domains (e.g. gmail.com, yahoo.com):
  // If display name claimed a brand, we evaluated and recorded it above.
  // Otherwise, free webmail domains are legitimate public relays and should not be scored as typosquats of other services.
  if (isWebmail && !isHomoglyph(normalizedSender)) {
    const finalScore = candidateScores.length > 0 ? Math.max(...candidateScores) : 0;
    return {
      levenshteinDistance: 0,
      damerauLevenshteinDistance: 0,
      jaroWinklerScore: 0,
      homoglyphMatch: false,
      ...(matchedBrand ? { matchedProtectedDomain: matchedBrand } : {}),
      identityScore: finalScore,
      findings,
    };
  }

  // 3. TLD Swapping / Cousin Domain Analysis (evaluated before string distance to prevent TLD leakage)
  const tldSwapping = detectTldSwapping(normalizedSender, combinedProtected, displayName);
  const isExactSldCousin = tldSwapping.isTldSwapping;
  if (isExactSldCousin && tldSwapping.matchedBrand) {
    matchedBrand = matchedBrand || tldSwapping.matchedBrand;
    if (tldSwapping.severity === 'HIGH') {
      candidateScores.push(90);
      findings.push({
        type: 'TLD_SWAPPING',
        severity: 'HIGH',
        description: `Domain uses exact brand name '${tldSwapping.matchedBrand}' under an alternate/high-risk TLD`,
      });
    } else {
      candidateScores.push(50);
      findings.push({
        type: 'COUSIN_DOMAIN',
        severity: 'MEDIUM',
        description: `Domain shares second-level domain with protected brand '${tldSwapping.matchedBrand}' under a different TLD`,
      });
    }
  }

  // 4. Combosquatting Analysis
  let isCombosquattingMatched = false;
  if (!isExactSldCousin) {
    const combosquatting = detectCombosquatting(normalizedSender, combinedProtected);
    if (combosquatting.isCombosquatting && combosquatting.matchedBrand) {
      isCombosquattingMatched = true;
      matchedBrand = matchedBrand || combosquatting.matchedBrand;
      if (combosquatting.severity === 'HIGH') {
        candidateScores.push(95);
        findings.push({
          type: 'COMBOSQUATTING',
          severity: 'HIGH',
          description: `Domain contains protected brand '${combosquatting.matchedBrand}' combined with security keyword '${combosquatting.matchedKeyword}'`,
        });
      } else {
        candidateScores.push(50);
        findings.push({
          type: 'COMBOSQUATTING_MODERATE',
          severity: 'MEDIUM',
          description: `Domain incorporates protected brand '${combosquatting.matchedBrand}' in a compound structure`,
        });
      }
    }
  }

  // 5. String Distance & Homoglyph Analysis (computed on SLDs to avoid TLD leakage)
  const senderParsed = parse(normalizedSender);
  const senderSLD = (senderParsed.domainWithoutSuffix || normalizedSender.split('.')[0] || '').toLowerCase();
  const senderSkeleton = getHomoglyphSkeleton(senderSLD);

  let minLevenshtein = Infinity;
  let minDamerauLevenshtein = Infinity;
  let maxJaroWinkler = 0;
  let homoglyphMatchDetected = false;
  let homoglyphMatchedBrand: string | undefined = undefined;
  let bestTyposquatMatch: { brand: string; evidence: TyposquatEvidence } | undefined = undefined;

  if (!isExactSldCousin) {
    for (const rawProtected of combinedProtected) {
      const protectedNorm = cleanDomain(rawProtected);
      const protParsed = parse(protectedNorm);
      const protSLD = (protParsed.domainWithoutSuffix || protectedNorm.split('.')[0] || '').toLowerCase();
      const protectedSkeleton = getHomoglyphSkeleton(protSLD);

      // Skeleton check
      const isSkeletonMatch = senderSkeleton === protectedSkeleton;
      if (isSkeletonMatch && senderSLD !== protSLD) {
        homoglyphMatchDetected = true;
        homoglyphMatchedBrand = rawProtected;
      }

      // Length pruning on SLD
      if (
        Math.abs(senderSLD.length - protSLD.length) > 3 &&
        !senderSLD.includes(protSLD) &&
        !protSLD.includes(senderSLD)
      ) {
        continue;
      }

      const lev = calculateLevenshtein(senderSLD, protSLD);
      const damerau = calculateDamerauLevenshtein(senderSLD, protSLD);
      const jaroWinkler = calculateJaroWinkler(senderSLD, protSLD);

      if (
        damerau < minDamerauLevenshtein ||
        (damerau === minDamerauLevenshtein && jaroWinkler > maxJaroWinkler)
      ) {
        minLevenshtein = lev;
        minDamerauLevenshtein = damerau;
        maxJaroWinkler = jaroWinkler;
      }

      // Evidence-gated similarity evaluation
      const evidence = evaluateTyposquatSimilarity(senderSLD, protSLD, { isBrandImpersonation });
      if (evidence.isMatch) {
        if (
          !bestTyposquatMatch ||
          evidence.confidenceScore > bestTyposquatMatch.evidence.confidenceScore ||
          (evidence.confidenceScore === bestTyposquatMatch.evidence.confidenceScore &&
            evidence.damerauDistance < bestTyposquatMatch.evidence.damerauDistance) ||
          (evidence.confidenceScore === bestTyposquatMatch.evidence.confidenceScore &&
            evidence.damerauDistance === bestTyposquatMatch.evidence.damerauDistance &&
            evidence.jaroWinkler > bestTyposquatMatch.evidence.jaroWinkler)
        ) {
          bestTyposquatMatch = { brand: rawProtected, evidence };
        }
      }
    }
  }

  if (homoglyphMatchDetected) {
    candidateScores.push(100);
    matchedBrand = homoglyphMatchedBrand || matchedBrand;
    findings.push({
      type: 'HOMOGLYPH_DETECTED',
      severity: 'HIGH',
      description: 'Domain contains confusable non-ASCII characters visually identical to a protected brand',
    });
  } else if (bestTyposquatMatch) {
    const { brand, evidence } = bestTyposquatMatch;
    matchedBrand = brand || matchedBrand;
    candidateScores.push(evidence.confidenceScore);
    minLevenshtein = evidence.levenshteinDistance;
    minDamerauLevenshtein = evidence.damerauDistance;
    maxJaroWinkler = evidence.jaroWinkler;

    if (evidence.severity === 'HIGH') {
      findings.push({
        type: 'TYPOSQUATTING',
        severity: 'HIGH',
        description: `Domain is highly similar to protected brand: ${brand} (Distance: ${evidence.damerauDistance}, Similarity: ${(evidence.jaroWinkler * 100).toFixed(1)}%)`,
      });
    } else {
      findings.push({
        type: 'TYPOSQUATTING_MODERATE',
        severity: 'MEDIUM',
        description: `Domain is moderately similar to protected brand: ${brand} (Distance: ${evidence.damerauDistance}, Similarity: ${(evidence.jaroWinkler * 100).toFixed(1)}%)`,
      });
    }
  }

  // 6. Generic Display Name Mismatch (when no protected brand is claimed)
  if (candidateScores.length === 0 && displayName && !isWebmail) {
    const cleanDisplay = displayName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanSender = normalizedSender.replace(/[^a-z0-9]/g, '');

    if (cleanDisplay.length > 5 && cleanSender.length > 0) {
      const displayWords = displayName.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 3);
      let wordMatchesDomain = false;

      for (const word of displayWords) {
        if (
          cleanSender.includes(word) ||
          calculateJaroWinkler(word, senderSLD) > 0.8
        ) {
          wordMatchesDomain = true;
          break;
        }
      }

      if (!wordMatchesDomain && !cleanDisplay.includes(cleanSender)) {
        candidateScores.push(50);
        findings.push({
          type: 'DISPLAY_NAME_MISMATCH',
          severity: 'MEDIUM',
          description: `Display name '${displayName}' has no obvious relationship with sender domain '${senderDomain}'`,
        });
      }
    }
  }

  // 7. Calculate Final Calibrated Identity Score
  let baseScore = candidateScores.length > 0 ? Math.max(...candidateScores) : 0;

  // Apply corroboration bonus if multiple distinct signals trigger together (e.g. typosquatting + brand impersonation)
  if (findings.length >= 2 && baseScore >= 80) {
    baseScore = Math.min(100, baseScore + 10);
  }

  return {
    levenshteinDistance: minLevenshtein === Infinity ? 0 : minLevenshtein,
    damerauLevenshteinDistance: minDamerauLevenshtein === Infinity ? 0 : minDamerauLevenshtein,
    jaroWinklerScore: maxJaroWinkler,
    homoglyphMatch: homoglyphMatchDetected,
    ...(matchedBrand ? { matchedProtectedDomain: matchedBrand } : {}),
    identityScore: baseScore,
    findings,
  };
}
