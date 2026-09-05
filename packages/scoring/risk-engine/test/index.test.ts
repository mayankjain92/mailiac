import { describe, it, expect } from 'vitest';
import { aggregateRisk, PILLAR_WEIGHTS } from '../src/index.js';
import type {
  AuthResult,
  IdentityResult,
  IPReputationResult,
  NLPResult,
} from '@mailiac/shared-types';

describe('aggregateRisk - @mailiac/scoring-risk-engine', () => {
  it('verifies pillar weights sum to exactly 1.00', () => {
    const sum =
      PILLAR_WEIGHTS.AUTH +
      PILLAR_WEIGHTS.IDENTITY +
      PILLAR_WEIGHTS.IP +
      PILLAR_WEIGHTS.NLP;
    expect(sum).toBeCloseTo(1.0);
    expect(PILLAR_WEIGHTS.AUTH).toBe(0.30);
    expect(PILLAR_WEIGHTS.IDENTITY).toBe(0.25);
    expect(PILLAR_WEIGHTS.IP).toBe(0.20);
    expect(PILLAR_WEIGHTS.NLP).toBe(0.25);
  });

  describe('Real-World Adversarial Scenarios', () => {
    const defaultDomain = 'example.com';

    it('1. Completely benign email (all 0) -> 0', () => {
      const matrix = aggregateRisk(
        defaultDomain,
        { authScore: 0 } as AuthResult,
        { identityScore: 0 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 0, intentLabels: [] } as NLPResult
      );
      expect(matrix.finalScore).toBe(0);
    });

    it('2. Normal corporate email (nlp=10) -> low score', () => {
      const matrix = aggregateRisk(
        defaultDomain,
        { authScore: 0 } as AuthResult,
        { identityScore: 0 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 10, intentLabels: [] } as NLPResult
      );
      expect(matrix.finalScore).toBe(3); // 10 * 0.25 = 2.5 -> 3
    });

    it('3. Legitimate urgent email (nlp=80) -> elevated but NO quarantine', () => {
      const matrix = aggregateRisk(
        defaultDomain,
        { authScore: 0 } as AuthResult,
        { identityScore: 0 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 80, intentLabels: [] } as NLPResult
      );
      expect(matrix.finalScore).toBe(20); // 80 * 0.25 = 20
    });

    it('4. Legitimate payment notification (nlp=70, auth=10) -> elevated but NO quarantine', () => {
      const matrix = aggregateRisk(
        defaultDomain,
        { authScore: 10 } as AuthResult,
        { identityScore: 0 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 70, intentLabels: [] } as NLPResult
      );
      expect(matrix.finalScore).toBe(21); // 10*0.3 + 70*0.25 = 20.5 -> 21
    });

    it('5. Legitimate account-security notification (nlp=75) -> NO quarantine', () => {
      const matrix = aggregateRisk(
        defaultDomain,
        { authScore: 0 } as AuthResult,
        { identityScore: 0 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 75, intentLabels: [] } as NLPResult
      );
      expect(matrix.finalScore).toBe(19); // 75*0.25 = 18.75 -> 19
    });

    it('6. Legitimate internationalized domain (identity=40 for some unicode similarity, others 0) -> NO quarantine', () => {
      const matrix = aggregateRisk(
        defaultDomain,
        { authScore: 0 } as AuthResult,
        { identityScore: 40 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 0, intentLabels: [] } as NLPResult
      );
      // auth=0, ip=0, non-free webmail -> discount 65%
      // 40 * 0.35 = 14
      // 14 * 0.25 = 3.5 -> 4
      expect(matrix.finalScore).toBe(4);
    });

    it('7. Authentication anomaly only (auth=100) -> NO quarantine', () => {
      const matrix = aggregateRisk(
        defaultDomain,
        { authScore: 100 } as AuthResult,
        { identityScore: 0 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 0, intentLabels: [] } as NLPResult
      );
      expect(matrix.finalScore).toBe(30); // 100 * 0.3 = 30
    });

    it('8. IP reputation anomaly only (ip=100) -> NO quarantine', () => {
      const matrix = aggregateRisk(
        defaultDomain,
        { authScore: 0 } as AuthResult,
        { identityScore: 0 } as IdentityResult,
        { ipScore: 100 } as IPReputationResult,
        { nlpScore: 0, intentLabels: [] } as NLPResult
      );
      expect(matrix.finalScore).toBe(20); // 100 * 0.2 = 20
    });

    it('9. VPN/proxy only (ip=80) -> NO quarantine', () => {
      const matrix = aggregateRisk(
        defaultDomain,
        { authScore: 0 } as AuthResult,
        { identityScore: 0 } as IdentityResult,
        { ipScore: 80 } as IPReputationResult,
        { nlpScore: 0, intentLabels: [] } as NLPResult
      );
      expect(matrix.finalScore).toBe(16); // 80 * 0.2 = 16
    });

    it('10. Typosquatting only (identity=100) -> NO quarantine', () => {
      const matrix = aggregateRisk(
        defaultDomain,
        { authScore: 0 } as AuthResult,
        { identityScore: 100 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 0, intentLabels: [] } as NLPResult
      );
      // not discounted (since id >= 70)
      // 100 * 0.25 = 25
      expect(matrix.finalScore).toBe(25); 
    });

    it('12. AI intent alone with clean deterministic pillars (C4) -> Cap at 40, NO quarantine', () => {
      const matrix = aggregateRisk(
        defaultDomain,
        { authScore: 10 } as AuthResult,
        { identityScore: 10 } as IdentityResult,
        { ipScore: 10 } as IPReputationResult,
        { nlpScore: 80, intentLabels: ['CREDENTIAL_HARVESTING'] } as NLPResult
      );
      expect(matrix.finalScore).toBeLessThanOrEqual(40);
      expect(matrix.quarantineOverride).toBe(false);
      expect(matrix.circuitBreakers?.c4).toBe(true);
      expect(matrix.pillars.nlp.findings).toContainEqual(
        expect.objectContaining({ type: 'AI_HALLUCINATION_IMMUNITY' })
      );
    });

    it('13. Coercive Identity Threat (C2: id=85, nlp=70) -> Quarantine', () => {
      const matrix = aggregateRisk(
        defaultDomain,
        { authScore: 10 } as AuthResult,
        { identityScore: 85 } as IdentityResult,
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 70, intentLabels: [] } as NLPResult
      );
      expect(matrix.finalScore).toBe(100);
      expect(matrix.quarantineOverride).toBe(true);
      expect(matrix.circuitBreakers?.c2).toBe(true);
    });

    describe('Canonical C1 - C4 Circuit Breaker Specification Tests', () => {
      it('TEST 1 — NSE/BSE AI FALSE POSITIVE (auth=0, id=0, ip=0, nlp=97) -> finalScore <= 40, no quarantine, C4=true', () => {
        const matrix = aggregateRisk(
          'nse.co.in',
          { authScore: 0 } as AuthResult,
          { identityScore: 0 } as IdentityResult,
          { ipScore: 0 } as IPReputationResult,
          { nlpScore: 97, intentLabels: ['FINANCIAL_COERCION'] } as NLPResult
        );
        expect(matrix.finalScore).toBeLessThanOrEqual(40);
        expect(matrix.quarantineOverride).toBe(false);
        expect(matrix.circuitBreakers?.c4).toBe(true);
        expect(matrix.pillars.nlp.findings).toContainEqual(
          expect.objectContaining({
            type: 'AI_HALLUCINATION_IMMUNITY',
            severity: 'INFO',
            description: expect.stringContaining('Score capped at 40'),
          })
        );
      });

      it('TEST 2 — C1 (Definite Phishing: identity=85, auth=70) -> quarantine=true, finalScore=100, C1=true', () => {
        const matrix = aggregateRisk(
          defaultDomain,
          { authScore: 70 } as AuthResult,
          { identityScore: 85 } as IdentityResult,
          { ipScore: 0 } as IPReputationResult,
          { nlpScore: 10, intentLabels: [] } as NLPResult
        );
        expect(matrix.quarantineOverride).toBe(true);
        expect(matrix.finalScore).toBe(100);
        expect(matrix.circuitBreakers?.c1).toBe(true);
        expect(matrix.circuitBreakers?.c4).toBe(false);
      });

      it('TEST 3 — C2 (Malicious Impersonation: identity=85, nlp=70) -> quarantine=true, finalScore=100, C2=true', () => {
        const matrix = aggregateRisk(
          defaultDomain,
          { authScore: 10 } as AuthResult,
          { identityScore: 85 } as IdentityResult,
          { ipScore: 10 } as IPReputationResult,
          { nlpScore: 70, intentLabels: [] } as NLPResult
        );
        expect(matrix.quarantineOverride).toBe(true);
        expect(matrix.finalScore).toBe(100);
        expect(matrix.circuitBreakers?.c2).toBe(true);
        expect(matrix.circuitBreakers?.c4).toBe(false);
      });

      it('TEST 4 — C3 (Multi-Pillar Consensus: auth=75, identity=75, ip=75, nlp=10) -> quarantine=true, finalScore=100, C3=true', () => {
        const matrix = aggregateRisk(
          defaultDomain,
          { authScore: 75 } as AuthResult,
          { identityScore: 75 } as IdentityResult,
          { ipScore: 75 } as IPReputationResult,
          { nlpScore: 10, intentLabels: [] } as NLPResult
        );
        expect(matrix.quarantineOverride).toBe(true);
        expect(matrix.finalScore).toBe(100);
        expect(matrix.circuitBreakers?.c3).toBe(true);
        expect(matrix.circuitBreakers?.c4).toBe(false);
      });

      it('TEST 5 — C4 HARD OVERRIDE (auth=0, identity=0, ip=0, nlp=100) -> finalScore <= 40, quarantine=false', () => {
        const matrix = aggregateRisk(
          'bseindia.com',
          { authScore: 0 } as AuthResult,
          { identityScore: 0 } as IdentityResult,
          { ipScore: 0 } as IPReputationResult,
          { nlpScore: 100, intentLabels: ['FINANCIAL_COERCION', 'AUTHORITY_TRAP'] } as NLPResult
        );
        expect(matrix.quarantineOverride).toBe(false);
        expect(matrix.finalScore).toBeLessThanOrEqual(40);
        expect(matrix.circuitBreakers?.c4).toBe(true);
      });

      it('TEST 6 — C4 DOES NOT APPLY TO BAD IDENTITY (auth=10, identity=90, ip=10, nlp=90) -> C4=false, C2=true, quarantine=true', () => {
        const matrix = aggregateRisk(
          defaultDomain,
          { authScore: 10 } as AuthResult,
          { identityScore: 90 } as IdentityResult,
          { ipScore: 10 } as IPReputationResult,
          { nlpScore: 90, intentLabels: ['CREDENTIAL_HARVESTING'] } as NLPResult
        );
        expect(matrix.circuitBreakers?.c4).toBe(false);
        expect(matrix.circuitBreakers?.c2).toBe(true);
        expect(matrix.quarantineOverride).toBe(true);
        expect(matrix.finalScore).toBe(100);
      });

      it('TEST 7 — CLEAN EMAIL (auth=0, identity=0, ip=0, nlp=0) -> quarantine=false, very low finalScore', () => {
        const matrix = aggregateRisk(
          defaultDomain,
          { authScore: 0 } as AuthResult,
          { identityScore: 0 } as IdentityResult,
          { ipScore: 0 } as IPReputationResult,
          { nlpScore: 0, intentLabels: ['BENIGN'] } as NLPResult
        );
        expect(matrix.quarantineOverride).toBe(false);
        expect(matrix.finalScore).toBe(0);
        expect(matrix.circuitBreakers?.c4).toBe(true);
      });

      it('TEST 8 — LEGITIMATE TRANSACTIONAL EMAIL -> classified as benign/transactional, NO quarantine', () => {
        const matrix = aggregateRisk(
          'zerodha.com',
          { authScore: 0, findings: [] } as unknown as AuthResult,
          { identityScore: 0, findings: [] } as unknown as IdentityResult,
          { ipScore: 0, findings: [] } as unknown as IPReputationResult,
          { nlpScore: 25, intentLabels: ['TRANSACTIONAL'], findings: [] } as unknown as NLPResult
        );
        expect(matrix.quarantineOverride).toBe(false);
        expect(matrix.finalScore).toBeLessThan(15);
      });

      it('TEST 9 — REAL FINANCIAL PHISHING -> corroborated attack triggers quarantine', () => {
        const matrix = aggregateRisk(
          'attacker-domain.xyz',
          { authScore: 75, findings: [] } as unknown as AuthResult,
          { identityScore: 90, findings: [] } as unknown as IdentityResult,
          { ipScore: 80, findings: [] } as unknown as IPReputationResult,
          { nlpScore: 95, intentLabels: ['FINANCIAL_COERCION', 'CREDENTIAL_HARVESTING'] } as NLPResult
        );
        expect(matrix.quarantineOverride).toBe(true);
        expect(matrix.finalScore).toBe(100);
        expect(matrix.circuitBreakers?.c1).toBe(true);
        expect(matrix.circuitBreakers?.c2).toBe(true);
        expect(matrix.circuitBreakers?.c3).toBe(true);
        expect(matrix.circuitBreakers?.c4).toBe(false);
      });

      it('TEST 10 — EXTERNAL LEGITIMATE DOMAIN -> clean pillars with moderate link score do NOT quarantine', () => {
        const matrix = aggregateRisk(
          'company.com',
          { authScore: 0 } as AuthResult,
          { identityScore: 10 } as IdentityResult,
          { ipScore: 5 } as IPReputationResult,
          { nlpScore: 15, intentLabels: ['BENIGN'] } as NLPResult
        );
        expect(matrix.quarantineOverride).toBe(false);
        expect(matrix.finalScore).toBeLessThan(10);
      });
    });

    it('Sample A: HoYoverse Marketing (Strict SPF/DKIM pass, display name alias mismatch, promotional urgency) -> CLEAN / LOW RISK', () => {
      const matrixA = aggregateRisk(
        'e-mail.hoyoverse.com',
        { authScore: 0 } as AuthResult, // Strict SPF/DKIM pass
        { identityScore: 70 } as IdentityResult, // Alias mismatch
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 85, intentLabels: ['MARKETING'] } as NLPResult
      );
      // If Tier 1 exempts marketing? No, Tier 1 doesn't.
      // Wait, id=70, nlp=85. Tier 1 Coercive Identity (id>=80, nlp>=60) -> false.
      // Tier 2: auth=0, ip=0, non-free webmail. Marketing -> cap id and nlp to 15.
      // id = 15, nlp = 15.
      // score = 15*0.25 + 15*0.25 = 3.75 + 3.75 = 7.5 -> 8.
      expect(matrixA.finalScore).toBeLessThanOrEqual(15);
    });

    it('Sample B: Bank Phishing via Gmail (Valid DKIM/SPF, Bank impersonation, financial lure) -> HIGH RISK QUARANTINE', () => {
      const matrix = aggregateRisk(
        'gmail.com',
        { authScore: 0 } as AuthResult,
        { identityScore: 0 } as IdentityResult, // Let's say identity didn't catch the mismatch due to webmail
        { ipScore: 0 } as IPReputationResult,
        { nlpScore: 70, intentLabels: ['FINANCIAL_COERCION'] } as NLPResult
      );
      // Tier 1: Free webmail + FINANCIAL_COERCION -> QUARANTINE
      expect(matrix.finalScore).toBe(100);
      expect(matrix.override?.triggered).toBe(true);
      expect(matrix.override?.type).toBe('HIGH_RISK_QUARANTINE');
    });

    it('24. Invalid numerical values handle safely', () => {
      const matrix = aggregateRisk(
        defaultDomain,
        { authScore: NaN } as AuthResult,
        { identityScore: Infinity } as IdentityResult,
        { ipScore: 150 } as IPReputationResult, // Clamped to 100
        { nlpScore: -50, intentLabels: [] } as NLPResult // Clamped to 0
      );
      expect(matrix.authScore).toBe(0);
      expect(matrix.identityScore).toBe(0); // Infinity is clamped to 0 by sanitizeScore
      expect(matrix.ipScore).toBe(100);
      expect(matrix.nlpScore).toBe(0);
      // id=0, nlp=0 -> no Tier 1.
      // score: 100*0.20 = 20.
      expect(matrix.finalScore).toBe(20);
    });

  });
});
