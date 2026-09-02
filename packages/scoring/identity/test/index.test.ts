import { describe, it, expect } from 'vitest';
import {
  scoreIdentity,
  calculateLevenshtein,
  calculateDamerauLevenshtein,
  calculateJaroWinkler,
  getHomoglyphSkeleton,
  isHomoglyph,
  detectDisplayNameMismatch,
  detectCombosquatting,
  detectTldSwapping,
  cleanDomain,
  normalizeDomainList,
} from '../src/index.js';

const protectedDomains = ['target-corp.com', 'paypal.com', 'google.com', 'microsoft.com', 'sap.com'];

describe('scoreIdentity - Legitimate Senders', () => {
  it('1. exact legitimate protected domain returns score 0 and no high findings', () => {
    const result = scoreIdentity('paypal.com', protectedDomains);

    expect(result.identityScore).toBe(0);
    expect(result.matchedProtectedDomain).toBe('paypal.com');
    expect(result.homoglyphMatch).toBe(false);
    expect(result.findings).toHaveLength(0);
  });

  it('2. legitimate subdomains return score 0', () => {
    const result1 = scoreIdentity('login.paypal.com', protectedDomains);
    expect(result1.identityScore).toBe(0);
    expect(result1.matchedProtectedDomain).toBe('paypal.com');

    const result2 = scoreIdentity('mail.google.com', protectedDomains);
    expect(result2.identityScore).toBe(0);
    expect(result2.matchedProtectedDomain).toBe('google.com');

    const result3 = scoreIdentity('auth.corp.microsoft.com', protectedDomains);
    expect(result3.identityScore).toBe(0);
    expect(result3.matchedProtectedDomain).toBe('microsoft.com');
  });

  it('3. legitimate sender with matching display name returns score 0', () => {
    const result = scoreIdentity('paypal.com', protectedDomains, 'PayPal Support');
    expect(result.identityScore).toBe(0);
    expect(result.matchedProtectedDomain).toBe('paypal.com');
    expect(result.findings).toHaveLength(0);
  });

  it('4. personal email on free webmail suppresses generic display-name mismatch', () => {
    const result = scoreIdentity('gmail.com', protectedDomains, 'John Doe');
    expect(result.identityScore).toBe(0);
    expect(result.findings.some(f => f.type === 'DISPLAY_NAME_MISMATCH')).toBe(false);
  });

  it('5. short distinct domain (gap.com vs protected sap.com) does not trigger false positive typosquatting', () => {
    const result = scoreIdentity('gap.com', protectedDomains);
    expect(result.identityScore).toBeLessThan(50);
    expect(result.findings.some(f => f.type === 'TYPOSQUATTING')).toBe(false);
  });
});

describe('scoreIdentity - Malicious Impersonation & Typosquatting', () => {
  it('6. Unicode homoglyph: paypaⅼ.com (U+217C small roman numeral l)', () => {
    const result = scoreIdentity('paypa\u217C.com', protectedDomains);

    expect(result.homoglyphMatch).toBe(true);
    expect(result.identityScore).toBe(100);
    expect(result.matchedProtectedDomain).toBe('paypal.com');
    expect(result.findings).toContainEqual(
      expect.objectContaining({ type: 'HOMOGLYPH_DETECTED', severity: 'HIGH' })
    );
  });

  it('7. Cyrillic homoglyph: pаypal.com (U+0430 Cyrillic a)', () => {
    const result = scoreIdentity('p\u0430ypal.com', protectedDomains);

    expect(result.homoglyphMatch).toBe(true);
    expect(result.identityScore).toBe(100);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ type: 'HOMOGLYPH_DETECTED', severity: 'HIGH' })
    );
  });

  it('8. digit substitution: paypa1.com vs paypal.com', () => {
    const result = scoreIdentity('paypa1.com', protectedDomains);

    expect(result.identityScore).toBeGreaterThanOrEqual(90);
    expect(result.matchedProtectedDomain).toBe('paypal.com');
    expect(result.findings.some(f => f.severity === 'HIGH')).toBe(true);
  });

  it('9. one-character typo: paypa.com vs paypal.com', () => {
    const result = scoreIdentity('paypa.com', protectedDomains);

    expect(result.damerauLevenshteinDistance).toBe(1);
    expect(result.identityScore).toBeGreaterThanOrEqual(90);
    expect(result.matchedProtectedDomain).toBe('paypal.com');
  });

  it('10. transposition typo: target-crorp.com vs target-corp.com', () => {
    const result = scoreIdentity('target-crorp.com', protectedDomains);

    expect(result.damerauLevenshteinDistance).toBe(1);
    expect(result.identityScore).toBeGreaterThanOrEqual(90);
    expect(result.matchedProtectedDomain).toBe('target-corp.com');
  });

  it('11. combosquatting prefix: login-paypal.com', () => {
    const result = scoreIdentity('login-paypal.com', protectedDomains);

    expect(result.identityScore).toBeGreaterThanOrEqual(90);
    expect(result.matchedProtectedDomain).toBe('paypal.com');
    expect(result.findings).toContainEqual(
      expect.objectContaining({ type: 'COMBOSQUATTING', severity: 'HIGH' })
    );
  });

  it('12. combosquatting suffix: paypal-security.com', () => {
    const result = scoreIdentity('paypal-security.com', protectedDomains);

    expect(result.identityScore).toBeGreaterThanOrEqual(90);
    expect(result.matchedProtectedDomain).toBe('paypal.com');
    expect(result.findings).toContainEqual(
      expect.objectContaining({ type: 'COMBOSQUATTING', severity: 'HIGH' })
    );
  });

  it('13. combosquatting unhyphenated: paypallogin.com', () => {
    const result = scoreIdentity('paypallogin.com', protectedDomains);

    expect(result.identityScore).toBeGreaterThanOrEqual(90);
    expect(result.findings.some(f => f.type === 'COMBOSQUATTING' || f.type === 'TYPOSQUATTING')).toBe(true);
  });

  it('14. high-risk TLD swapping: paypal.xyz', () => {
    const result = scoreIdentity('paypal.xyz', protectedDomains);

    expect(result.identityScore).toBeGreaterThanOrEqual(85);
    expect(result.matchedProtectedDomain).toBe('paypal.com');
    expect(result.findings).toContainEqual(
      expect.objectContaining({ type: 'TLD_SWAPPING', severity: 'HIGH' })
    );
  });

  it('15. standard cousin domain: target-corp.net', () => {
    const result = scoreIdentity('target-corp.net', protectedDomains);

    expect(result.identityScore).toBeGreaterThanOrEqual(50);
    expect(result.identityScore).toBeLessThanOrEqual(75);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ type: 'COUSIN_DOMAIN', severity: 'MEDIUM' })
    );
  });

  it('16. brand alias impersonation: Office 365 Support from random domain', () => {
    const mismatch = detectDisplayNameMismatch('Office 365 Support', 'attacker-domain.com', protectedDomains);
    expect(mismatch.isMismatch).toBe(true);
    expect(mismatch.claimedBrand).toBe('microsoft.com');

    const result = scoreIdentity('attacker-domain.com', protectedDomains, 'Office 365 Support');
    expect(result.identityScore).toBeGreaterThanOrEqual(90);
    expect(result.matchedProtectedDomain).toBe('microsoft.com');
    expect(result.findings).toContainEqual(
      expect.objectContaining({ type: 'BRAND_IMPERSONATION', severity: 'HIGH' })
    );
  });

  it('17. brand impersonation on free webmail: PayPal Security <attacker@gmail.com> is NOT suppressed', () => {
    const result = scoreIdentity('gmail.com', protectedDomains, 'PayPal Security');

    expect(result.identityScore).toBeGreaterThanOrEqual(90);
    expect(result.matchedProtectedDomain).toBe('paypal.com');
    expect(result.findings).toContainEqual(
      expect.objectContaining({ type: 'BRAND_IMPERSONATION', severity: 'HIGH' })
    );
  });

  it('18. corroborated multi-signal attack: PayPal Security <user@paypa1.com> triggers bonus cap 100', () => {
    const result = scoreIdentity('paypa1.com', protectedDomains, 'PayPal Security');

    expect(result.identityScore).toBe(100);
    expect(result.findings.length).toBeGreaterThanOrEqual(2);
    expect(result.findings.some(f => f.type === 'BRAND_IMPERSONATION')).toBe(true);
  });

  it('19. subdomain deception: paypal.com.evil.com does not match as legitimate PayPal', () => {
    const result = scoreIdentity('paypal.com.evil.com', protectedDomains);

    expect(result.matchedProtectedDomain).toBeUndefined();
  });
});

describe('scoreIdentity - Edge Cases & Robustness', () => {
  it('20. handles case insensitivity and trailing dots/whitespace gracefully', () => {
    const result1 = scoreIdentity('  PAYPAL.COM. ', protectedDomains);
    expect(result1.identityScore).toBe(0);

    const result2 = scoreIdentity('PAYPAL-LOGIN.COM', protectedDomains);
    expect(result2.identityScore).toBeGreaterThanOrEqual(90);
  });

  it('21. handles empty/null strings and empty protected list safely', () => {
    const result1 = scoreIdentity('', protectedDomains);
    expect(result1.identityScore).toBe(0);

    const result2 = scoreIdentity('paypal.com', []);
    // Default protected list ensures baseline protection
    expect(result2.identityScore).toBe(0);
    expect(result2.matchedProtectedDomain).toBe('paypal.com');
  });

  it('22. handles generic display-name mismatch for non-webmail enterprise senders', () => {
    const result = scoreIdentity('atendimento.com.br', protectedDomains, 'BANCO DO BRADESCO LIVELO');
    expect(result.identityScore).toBe(50);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        type: 'DISPLAY_NAME_MISMATCH',
        severity: 'MEDIUM',
      })
    );
  });
});

describe('Domain and String Distance Helpers', () => {
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

  it('cleans domains and normalizes domain lists', () => {
    expect(cleanDomain('https://mail.google.com/test')).toBe('google.com');
    expect(cleanDomain('PAYPAL.COM.')).toBe('paypal.com');
    expect(normalizeDomainList(['paypal.com', 'PAYPAL.COM', ' google.com '])).toEqual([
      'paypal.com',
      'google.com',
    ]);
  });

  it('detects combosquatting accurately', () => {
    const res1 = detectCombosquatting('paypal-login.com', ['paypal.com']);
    expect(res1.isCombosquatting).toBe(true);
    expect(res1.severity).toBe('HIGH');
    expect(res1.matchedKeyword).toBe('login');

    const res2 = detectCombosquatting('google-fans.com', ['google.com']);
    expect(res2.isCombosquatting).toBe(true);
    expect(res2.severity).toBe('MEDIUM');
  });

  it('detects TLD swapping accurately', () => {
    const res1 = detectTldSwapping('paypal.xyz', ['paypal.com']);
    expect(res1.isTldSwapping).toBe(true);
    expect(res1.isHighRiskTld).toBe(true);
    expect(res1.severity).toBe('HIGH');

    const res2 = detectTldSwapping('target-corp.net', ['target-corp.com']);
    expect(res2.isTldSwapping).toBe(true);
    expect(res2.isHighRiskTld).toBe(false);
    expect(res2.severity).toBe('MEDIUM');
  });
});
