import { describe, it, expect } from 'vitest';
import { aggregateRisk, PILLAR_WEIGHTS } from '../src/index.js';
import type {
  AuthResult,
  IdentityResult,
  IPReputationResult,
  NLPResult,
} from '@mailiac/shared-types';

describe('aggregateRisk - @mailiac/scoring-risk-engine', () => {
  it('verifies pillar weights sum to exactly 1.00 (20/35/10/35)', () => {
    const sum =
      PILLAR_WEIGHTS.AUTH +
      PILLAR_WEIGHTS.IDENTITY +
      PILLAR_WEIGHTS.IP +
      PILLAR_WEIGHTS.NLP;
    expect(sum).toBeCloseTo(1.0);
    expect(PILLAR_WEIGHTS.AUTH).toBe(0.20);
    expect(PILLAR_WEIGHTS.IDENTITY).toBe(0.35);
    expect(PILLAR_WEIGHTS.IP).toBe(0.10);
    expect(PILLAR_WEIGHTS.NLP).toBe(0.35);
  });

  describe('Real-World Adversarial Scenarios', () => {
    it('1. Completely benign email (all 0) -> 0', () => {
      const matrix = aggregateRisk(
        { authScore: 0 } as AuthResult,
        { identityScore: 0 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 0 } as NLPResult
      );
      expect(matrix.finalScore).toBe(0);
    });

    it('2. Normal corporate email (nlp=10) -> low score', () => {
      const matrix = aggregateRisk(
        { authScore: 0 } as AuthResult,
        { identityScore: 0 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 10 } as NLPResult
      );
      expect(matrix.finalScore).toBe(4); // 10 * 0.35 = 3.5 -> 4
    });

    it('3. Legitimate urgent email (nlp=80) -> elevated but NO quarantine', () => {
      const matrix = aggregateRisk(
        { authScore: 0 } as AuthResult,
        { identityScore: 0 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 80 } as NLPResult
      );
      expect(matrix.finalScore).toBe(28); // 80 * 0.35 = 28
    });

    it('4. Legitimate payment notification (nlp=70, auth=10) -> elevated but NO quarantine', () => {
      const matrix = aggregateRisk(
        { authScore: 10 } as AuthResult,
        { identityScore: 0 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 70 } as NLPResult
      );
      expect(matrix.finalScore).toBe(27); // 10*0.2 + 70*0.35 = 2 + 24.5 = 26.5 -> 27
    });

    it('5. Legitimate account-security notification (nlp=75) -> NO quarantine', () => {
      const matrix = aggregateRisk(
        { authScore: 0 } as AuthResult,
        { identityScore: 0 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 75 } as NLPResult
      );
      expect(matrix.finalScore).toBe(26); // 75*0.35 = 26.25 -> 26
    });

    it('6. Legitimate internationalized domain (identity=40 for some unicode similarity, others 0) -> NO quarantine', () => {
      const matrix = aggregateRisk(
        { authScore: 0 } as AuthResult,
        { identityScore: 40 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 0 } as NLPResult
      );
      expect(matrix.finalScore).toBe(14); // 40*0.35 = 14
    });

    it('7. Authentication anomaly only (auth=100) -> NO quarantine', () => {
      const matrix = aggregateRisk(
        { authScore: 100 } as AuthResult,
        { identityScore: 0 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 0 } as NLPResult
      );
      expect(matrix.finalScore).toBe(20); // 100 * 0.2 = 20
    });

    it('8. IP reputation anomaly only (ip=100) -> NO quarantine', () => {
      const matrix = aggregateRisk(
        { authScore: 0 } as AuthResult,
        { identityScore: 0 } as IdentityResult,
        { ipScore: 100 } as IPReputationResult,
        { nlpScore: 0 } as NLPResult
      );
      expect(matrix.finalScore).toBe(10); // 100 * 0.1 = 10
    });

    it('9. VPN/proxy only (ip=80) -> NO quarantine', () => {
      const matrix = aggregateRisk(
        { authScore: 0 } as AuthResult,
        { identityScore: 0 } as IdentityResult,
        { ipScore: 80 } as IPReputationResult,
        { nlpScore: 0 } as NLPResult
      );
      expect(matrix.finalScore).toBe(8); // 80 * 0.1 = 8
    });

    it('10. Typosquatting only (identity=100) -> NO quarantine', () => {
      const matrix = aggregateRisk(
        { authScore: 0 } as AuthResult,
        { identityScore: 100 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 0 } as NLPResult
      );
      expect(matrix.finalScore).toBe(35); // 100 * 0.35 = 35
    });

    it('11. Display-name impersonation (identity=90) -> NO quarantine', () => {
      const matrix = aggregateRisk(
        { authScore: 0 } as AuthResult,
        { identityScore: 90 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 0 } as NLPResult
      );
      expect(matrix.finalScore).toBe(31); // 90 * 0.35 = 31.4999... -> 31
    });

    it('12. Credential phishing (auth=70, id=90, ip=20, nlp=90) -> Quarantine (C1, C2, C3)', () => {
      const matrix = aggregateRisk(
        { authScore: 70 } as AuthResult,
        { identityScore: 90 } as IdentityResult,
        { ipScore: 20 } as IPReputationResult,
        { nlpScore: 90 } as NLPResult
      );
      expect(matrix.finalScore).toBe(100);
    });

    it('13. BEC / financial fraud (auth=0, id=90, ip=0, nlp=95) -> Quarantine (C2)', () => {
      const matrix = aggregateRisk(
        { authScore: 0 } as AuthResult,
        { identityScore: 90 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 95 } as NLPResult
      );
      expect(matrix.finalScore).toBe(100);
    });

    it('14. Authority impersonation (id=90, nlp=85) -> Quarantine (C2)', () => {
      const matrix = aggregateRisk(
        { authScore: 0 } as AuthResult,
        { identityScore: 90 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 85 } as NLPResult
      );
      expect(matrix.finalScore).toBe(100);
    });

    it('15. Malware lure (auth=80, nlp=95) -> Quarantine (C3)', () => {
      const matrix = aggregateRisk(
        { authScore: 80 } as AuthResult,
        { identityScore: 0 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 95 } as NLPResult
      );
      expect(matrix.finalScore).toBe(100);
    });

    it('16. Glassworm/hidden-text attack (nlp=100, ip=95) -> Quarantine (C3)', () => {
      const matrix = aggregateRisk(
        { authScore: 0 } as AuthResult,
        { identityScore: 0 } as IdentityResult,
        { ipScore: 95 } as IPReputationResult,
        { nlpScore: 100 } as NLPResult
      );
      expect(matrix.finalScore).toBe(100);
    });

    it('17. Identity + NLP attack (id=85, nlp=70) -> Quarantine (C2)', () => {
      const matrix = aggregateRisk(
        { authScore: 0 } as AuthResult,
        { identityScore: 85 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 70 } as NLPResult
      );
      expect(matrix.finalScore).toBe(100);
    });

    it('18. Auth + identity attack (auth=70, id=85) -> Quarantine (C1)', () => {
      const matrix = aggregateRisk(
        { authScore: 70 } as AuthResult,
        { identityScore: 85 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 0 } as NLPResult
      );
      expect(matrix.finalScore).toBe(100);
    });

    it('19. NLP + IP attack (nlp=90, ip=90) -> Quarantine (C3)', () => {
      const matrix = aggregateRisk(
        { authScore: 0 } as AuthResult,
        { identityScore: 0 } as IdentityResult,
        { ipScore: 90 } as IPReputationResult,
        { nlpScore: 90 } as NLPResult
      );
      expect(matrix.finalScore).toBe(100);
    });

    it('20. Auth + NLP attack (auth=70, nlp=90) -> Quarantine (C3)', () => {
      const matrix = aggregateRisk(
        { authScore: 70 } as AuthResult,
        { identityScore: 0 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 90 } as NLPResult
      );
      expect(matrix.finalScore).toBe(100);
    });

    it('21. Three-pillar attack (auth=75, ip=75, nlp=75) -> Quarantine (C4)', () => {
      const matrix = aggregateRisk(
        { authScore: 75 } as AuthResult,
        { identityScore: 0 } as IdentityResult,
        { ipScore: 75 } as IPReputationResult,
        { nlpScore: 75 } as NLPResult
      );
      expect(matrix.finalScore).toBe(100);
    });

    it('22. Four-pillar attack (auth=80, id=80, ip=80, nlp=80) -> Quarantine (C4)', () => {
      const matrix = aggregateRisk(
        { authScore: 80 } as AuthResult,
        { identityScore: 80 } as IdentityResult,
        { ipScore: 80 } as IPReputationResult,
        { nlpScore: 80 } as NLPResult
      );
      expect(matrix.finalScore).toBe(100);
    });

    it('23. Borderline threshold cases', () => {
      // C1 boundary: id=84, auth=70 -> NO quarantine
      expect(aggregateRisk({authScore:70} as AuthResult, {identityScore:84} as IdentityResult, {ipScore:0} as IPReputationResult, {nlpScore:0} as NLPResult).finalScore).not.toBe(100);
      
      // C1 boundary: id=85, auth=69 -> NO quarantine
      expect(aggregateRisk({authScore:69} as AuthResult, {identityScore:85} as IdentityResult, {ipScore:0} as IPReputationResult, {nlpScore:0} as NLPResult).finalScore).not.toBe(100);

      // C2 boundary: id=84, nlp=70 -> NO quarantine
      expect(aggregateRisk({authScore:0} as AuthResult, {identityScore:84} as IdentityResult, {ipScore:0} as IPReputationResult, {nlpScore:70} as NLPResult).finalScore).not.toBe(100);

      // C2 boundary: id=85, nlp=69 -> NO quarantine
      expect(aggregateRisk({authScore:0} as AuthResult, {identityScore:85} as IdentityResult, {ipScore:0} as IPReputationResult, {nlpScore:69} as NLPResult).finalScore).not.toBe(100);

      // C3 boundary: nlp=89, ip=90 -> NO quarantine
      expect(aggregateRisk({authScore:0} as AuthResult, {identityScore:0} as IdentityResult, {ipScore:90} as IPReputationResult, {nlpScore:89} as NLPResult).finalScore).not.toBe(100);

      // C4 boundary: 2 pillars at 70 -> NO quarantine (+10 bonus though)
      // 70*0.2 + 70*0.35 + 10 = 14 + 24.5 + 10 = 48.5 -> 49
      expect(aggregateRisk({authScore:70} as AuthResult, {identityScore:70} as IdentityResult, {ipScore:0} as IPReputationResult, {nlpScore:0} as NLPResult).finalScore).toBe(49);
    });

    it('24. Invalid numerical values handle safely', () => {
      const matrix = aggregateRisk(
        { authScore: NaN } as AuthResult,
        { identityScore: Infinity } as IdentityResult,
        { ipScore: 150 } as IPReputationResult, // Clamped to 100
        { nlpScore: -50 } as NLPResult // Clamped to 0
      );
      expect(matrix.authScore).toBe(0);
      expect(matrix.identityScore).toBe(0);
      expect(matrix.ipScore).toBe(100);
      expect(matrix.nlpScore).toBe(0);
      expect(matrix.finalScore).toBe(10); // 100*0.1 = 10
    });

    it('25. Missing pillar values handle safely', () => {
      const matrix = aggregateRisk(
        null as unknown as AuthResult,
        undefined as unknown as IdentityResult,
        { ipScore: 50 } as IPReputationResult,
        null as unknown as NLPResult
      );
      expect(matrix.authScore).toBe(0);
      expect(matrix.identityScore).toBe(0);
      expect(matrix.ipScore).toBe(50);
      expect(matrix.nlpScore).toBe(0);
      expect(matrix.finalScore).toBe(5); // 50*0.1 = 5
    });
  });
});
