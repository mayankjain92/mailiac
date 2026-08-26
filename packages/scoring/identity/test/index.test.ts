import { describe, it, expect } from 'vitest';
import {
  scoreIdentity,
  calculateLevenshtein,
  calculateDamerauLevenshtein,
  calculateJaroWinkler,
  getHomoglyphSkeleton,
  isHomoglyph,
  detectDisplayNameMismatch,
} from '../src/index.js';

const protectedDomains = ['target-corp.com', 'paypal.com', 'google.com', 'microsoft.com'];

describe('scoreIdentity', () => {
  it('1. exact legitimate domain: returns identityScore 0 and homoglyphMatch false', () => {
    const result = scoreIdentity('paypal.com', protectedDomains);

    expect(result.identityScore).toBe(0);
    expect(result.matchedProtectedDomain).toBe('paypal.com');
    expect(result.damerauLevenshteinDistance).toBe(0);
    expect(result.homoglyphMatch).toBe(false);
  });

  it('2. Unicode homoglyph: paypaⅼ.com (U+217C small roman numeral l) returns homoglyphMatch true and identityScore 100', () => {
    const result = scoreIdentity('paypa\u217C.com', protectedDomains);

    expect(result.homoglyphMatch).toBe(true);
    expect(result.identityScore).toBe(100);
    expect(result.matchedProtectedDomain).toBe('paypal.com');
  });

  it('3. Cyrillic homoglyph: pаypal.com (U+0430 Cyrillic a) skeleton matching works', () => {
    const result = scoreIdentity('p\u0430ypal.com', protectedDomains);

    expect(result.homoglyphMatch).toBe(true);
    expect(result.identityScore).toBe(100);
    expect(result.matchedProtectedDomain).toBe('paypal.com');
  });

  it('4. digit substitution: paypa1.com vs paypal.com skeleton/similarity detected', () => {
    const result = scoreIdentity('paypa1.com', protectedDomains);

    expect(result.identityScore).toBeGreaterThanOrEqual(75);
    expect(result.matchedProtectedDomain).toBe('paypal.com');
  });

  it('5. one-character typo: paypa.com vs paypal.com returns low edit distance and suspicious score', () => {
    const result = scoreIdentity('paypa.com', protectedDomains);

    expect(result.damerauLevenshteinDistance).toBe(1);
    expect(result.identityScore).toBe(100);
    expect(result.matchedProtectedDomain).toBe('paypal.com');
  });

  it('6. transposition: target-crorp.com vs target-corp.com detected via Damerau-Levenshtein', () => {
    const result = scoreIdentity('target-crorp.com', protectedDomains);

    expect(result.identityScore).toBe(100);
    expect(result.matchedProtectedDomain).toBe('target-corp.com');
    expect(result.damerauLevenshteinDistance).toBe(1);
  });

  it('7. legitimate subdomain: login.paypal.com returns identityScore 0', () => {
    const result = scoreIdentity('login.paypal.com', protectedDomains);

    expect(result.identityScore).toBe(0);
    expect(result.matchedProtectedDomain).toBe('paypal.com');
    expect(result.homoglyphMatch).toBe(false);
  });

  it('8. lookalike external domain: paypal-security.com returns suspicious similarity', () => {
    const result = scoreIdentity('paypal-security.com', protectedDomains);

    expect(result.identityScore).toBeGreaterThanOrEqual(50);
    expect(result.matchedProtectedDomain).toBe('paypal.com');
  });

  it('9. subdomain deception: paypal.com.evil.com resolves to evil.com and NOT treated as legitimate PayPal', () => {
    const result = scoreIdentity('paypal.com.evil.com', protectedDomains);

    expect(result.identityScore).toBe(0);
    expect(result.matchedProtectedDomain).toBeUndefined();
  });

  it('10. Unicode but unrelated domain: ü-news.com returns homoglyphMatch false', () => {
    const result = scoreIdentity('\u00FC-news.com', protectedDomains);

    expect(result.homoglyphMatch).toBe(false);
    expect(result.identityScore).toBe(0);
    expect(result.matchedProtectedDomain).toBeUndefined();
  });

  it('11. display-name impersonation: PayPal Support with scam-domain.com triggers mismatch', () => {
    const mismatch = detectDisplayNameMismatch('PayPal Support', 'scam-domain.com', protectedDomains);
    expect(mismatch.isMismatch).toBe(true);
    expect(mismatch.claimedBrand).toBe('paypal.com');

    const result = scoreIdentity('scam-domain.com', protectedDomains, 'PayPal Support');
    expect(result.identityScore).toBe(100);
    expect(result.matchedProtectedDomain).toBe('paypal.com');
  });

  it('12. legitimate protected sender: PayPal Support from paypal.com returns isMismatch false and score 0', () => {
    const mismatch = detectDisplayNameMismatch('PayPal Support', 'paypal.com', protectedDomains);
    expect(mismatch.isMismatch).toBe(false);

    const result = scoreIdentity('paypal.com', protectedDomains, 'PayPal Support');
    expect(result.identityScore).toBe(0);
    expect(result.matchedProtectedDomain).toBe('paypal.com');
    expect(result.homoglyphMatch).toBe(false);
  });

  it('13. empty inputs: empty domain or protected list handled gracefully', () => {
    const result1 = scoreIdentity('', protectedDomains);
    expect(result1.identityScore).toBe(0);

    const result2 = scoreIdentity('paypal.com', []);
    expect(result2.identityScore).toBe(0);
  });

  it('14. short Jaro-Winkler inputs: handles empty and short strings without crash', () => {
    expect(() => calculateJaroWinkler('', '')).not.toThrow();
    expect(calculateJaroWinkler('', '')).toBe(0);

    expect(() => calculateJaroWinkler('a', 'b')).not.toThrow();
    expect(calculateJaroWinkler('a', 'b')).toBe(0);

    expect(() => calculateJaroWinkler('ab', 'a')).not.toThrow();
    expect(calculateJaroWinkler('ab', 'a')).toBeGreaterThan(0);
  });
});

describe('String distance algorithms', () => {
  it('calculates Levenshtein and Damerau-Levenshtein correctly', () => {
    expect(calculateLevenshtein('ca', 'abc')).toBe(3);
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
