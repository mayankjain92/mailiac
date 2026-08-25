import { describe, it, expect } from 'vitest';
import { aggregateRisk, PILLAR_WEIGHTS } from '../src/index.js';
import type {
  AuthResult,
  IdentityResult,
  IPReputationResult,
  NLPResult,
} from '@mailiac/shared-types';

describe('aggregateRisk', () => {
  it('happy path: safe email with all 0 scores returns finalScore 0', () => {
    const auth: AuthResult = {
      spf: 'pass',
      dkim: 'pass',
      dmarcAlignment: 'strict',
      arcPass: false,
      authScore: 0,
    };
    const identity: IdentityResult = {
      levenshteinDistance: 0,
      damerauLevenshteinDistance: 0,
      jaroWinklerScore: 1.0,
      homoglyphMatch: false,
      identityScore: 0,
    };
    const ip: IPReputationResult = {
      abuseConfidenceScore: 0,
      isProxyOrVpn: false,
      timezoneDiscrepancyHours: 0,
      ipScore: 0,
    };
    const nlp: NLPResult = {
      intentLabels: ['informational'],
      financialRequestScore: 0,
      credentialHarvestingScore: 0,
      glasswormFlag: false,
      zeroWidthCharCount: 0,
      nlpScore: 0,
    };

    const matrix = aggregateRisk(auth, identity, ip, nlp);

    expect(matrix.authScore).toBe(0);
    expect(matrix.identityScore).toBe(0);
    expect(matrix.ipScore).toBe(0);
    expect(matrix.nlpScore).toBe(0);
    expect(matrix.finalScore).toBe(0);
  });

  it('malicious email: maximum score 100 across all pillars returns finalScore 100', () => {
    const auth: AuthResult = {
      spf: 'fail',
      dkim: 'fail',
      dmarcAlignment: 'fail',
      arcPass: false,
      authScore: 100,
    };
    const identity: IdentityResult = {
      levenshteinDistance: 1,
      damerauLevenshteinDistance: 1,
      jaroWinklerScore: 0.95,
      homoglyphMatch: true,
      identityScore: 100,
    };
    const ip: IPReputationResult = {
      abuseConfidenceScore: 100,
      isProxyOrVpn: true,
      timezoneDiscrepancyHours: 8,
      ipScore: 100,
    };
    const nlp: NLPResult = {
      intentLabels: ['phishing', 'urgent_action'],
      financialRequestScore: 90,
      credentialHarvestingScore: 95,
      glasswormFlag: true,
      zeroWidthCharCount: 60,
      nlpScore: 100,
    };

    const matrix = aggregateRisk(auth, identity, ip, nlp);

    expect(matrix.finalScore).toBe(100);
  });

  it('mixed scores: computes exact weighted score based on 30/20/20/30 weights', () => {
    const auth = { authScore: 40 } as AuthResult;
    const identity = { identityScore: 100 } as IdentityResult;
    const ip = { ipScore: 50 } as IPReputationResult;
    const nlp = { nlpScore: 80 } as NLPResult;

    // Expected: 40*0.30 + 100*0.20 + 50*0.20 + 80*0.30 = 12 + 20 + 10 + 24 = 66
    const matrix = aggregateRisk(auth, identity, ip, nlp);

    expect(matrix.authScore).toBe(40);
    expect(matrix.identityScore).toBe(100);
    expect(matrix.ipScore).toBe(50);
    expect(matrix.nlpScore).toBe(80);
    expect(matrix.finalScore).toBe(66);
  });

  it('edge case: null/undefined/NaN pillar scores default to 0 safely', () => {
    const auth = { authScore: NaN } as AuthResult;
    const identity = undefined as unknown as IdentityResult;
    const ip = { ipScore: 150 } as IPReputationResult; // Should clamp to 100
    const nlp = { nlpScore: -10 } as NLPResult; // Should clamp to 0

    const matrix = aggregateRisk(auth, identity, ip, nlp);

    expect(matrix.authScore).toBe(0);
    expect(matrix.identityScore).toBe(0);
    expect(matrix.ipScore).toBe(100);
    expect(matrix.nlpScore).toBe(0);
    // 100 * 0.20 = 20
    expect(matrix.finalScore).toBe(20);
  });

  it('verifies weight sum equals 1.0', () => {
    const sum =
      PILLAR_WEIGHTS.AUTH +
      PILLAR_WEIGHTS.IDENTITY +
      PILLAR_WEIGHTS.IP +
      PILLAR_WEIGHTS.NLP;
    expect(sum).toBeCloseTo(1.0);
  });
});
