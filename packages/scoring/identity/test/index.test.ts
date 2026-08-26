import { describe, it, expect } from 'vitest';
import {
  scoreIdentity,
  calculateLevenshtein,
  calculateDamerauLevenshtein,
  calculateJaroWinkler,
  getHomoglyphSkeleton,
  isHomoglyph,
} from '../src/index.js';

const protectedDomains = ['target-corp.com', 'paypal.com', 'google.com', 'microsoft.com'];

describe('scoreIdentity', () => {
  it('happy path: exact match to protected domain returns identityScore 0', () => {
    const result = scoreIdentity('target-corp.com', protectedDomains);

    expect(result.identityScore).toBe(0);
    expect(result.matchedProtectedDomain).toBe('target-corp.com');
    expect(result.damerauLevenshteinDistance).toBe(0);
    expect(result.homoglyphMatch).toBe(false);
  });

  it('typosquatting: transposition edit distance <= 2 returns identityScore 100', () => {
    // "target-crorp.com" vs "target-corp.com" (transposition of 'o' and 'r')
    const result = scoreIdentity('target-crorp.com', protectedDomains);

    expect(result.identityScore).toBe(100);
    expect(result.matchedProtectedDomain).toBe('target-corp.com');
    expect(result.damerauLevenshteinDistance).toBe(1);
    expect(result.levenshteinDistance).toBeLessThanOrEqual(2);
  });

  it('homoglyph attack: Cyrillic character substitution triggers homoglyphMatch and identityScore 100', () => {
    // "pаypal.com" where 'а' is Cyrillic U+0430
    const result = scoreIdentity('p\u0430ypal.com', protectedDomains);

    expect(result.homoglyphMatch).toBe(true);
    expect(result.identityScore).toBe(100);
    expect(result.matchedProtectedDomain).toBe('paypal.com');
  });

  it('combosquatting: prefix/suffix addition with high Jaro-Winkler score returns identityScore 100', () => {
    // "paypal-security-login.com" vs "paypal.com"
    const result = scoreIdentity('paypal-security.com', protectedDomains);

    expect(result.identityScore).toBeGreaterThanOrEqual(50);
    expect(result.matchedProtectedDomain).toBe('paypal.com');
    expect(result.jaroWinklerScore).toBeGreaterThan(0.75);
  });

  it('benign domain: completely unrelated domain returns identityScore 0 and undefined matched domain', () => {
    const result = scoreIdentity('random-news-portal.org', protectedDomains);

    expect(result.identityScore).toBe(0);
    expect(result.matchedProtectedDomain).toBeUndefined();
    expect(result.homoglyphMatch).toBe(false);
  });

  it('display name spoofing: display name claiming protected brand with unmatching domain returns identityScore 100', () => {
    const result = scoreIdentity('scam-phish.com', protectedDomains, 'PayPal Security Team');

    expect(result.identityScore).toBe(100);
    expect(result.matchedProtectedDomain).toBe('paypal.com');
  });

  it('malformed input: empty sender domain or empty protected list handles gracefully', () => {
    const result1 = scoreIdentity('', protectedDomains);
    expect(result1.identityScore).toBe(0);

    const result2 = scoreIdentity('target-corp.com', []);
    expect(result2.identityScore).toBe(0);
  });
});

describe('String distance algorithms', () => {
  it('calculates Levenshtein and Damerau-Levenshtein correctly', () => {
    expect(calculateLevenshtein('ca', 'abc')).toBe(3);
    // Damerau-Levenshtein counts transposition of 'a' and 'b' as 1 edit
    expect(calculateDamerauLevenshtein('ab', 'ba')).toBe(1);
  });

  it('calculates Jaro-Winkler similarity correctly', () => {
    expect(calculateJaroWinkler('martha', 'marhta')).toBeGreaterThan(0.9);
    expect(calculateJaroWinkler('Dwayne', 'Duane')).toBeGreaterThan(0.8);
    expect(calculateJaroWinkler('abc', 'xyz')).toBe(0);
  });

  it('detects homoglyphs and maps skeleton strings', () => {
    expect(isHomoglyph('p\u0430ypal.com')).toBe(true);
    expect(isHomoglyph('paypal.com')).toBe(false);
    expect(getHomoglyphSkeleton('p\u0430ypal.com')).toBe('paypal.com');
  });
});
