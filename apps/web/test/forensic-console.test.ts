import { describe, it, expect } from 'vitest';
import type { AnalysisReport } from '@mailiac/shared-types';
import {
  getExecutiveVerdictDetails,
  getPillarScoreVisuals,
} from '../src/lib/findings';

const mockAiSummary: AnalysisReport['aiSummary'] = {
  provider: 'heuristic',
  providerStatus: 'success',
  urgency: 0,
  intent: ['BENIGN'],
  integrityHash: 'mock-hash',
  confidence: 1.0,
  findings: [],
};

describe('Forensic Analysis Console & Risk Engine Utilities', () => {
  describe('getExecutiveVerdictDetails', () => {
    it('accurately derives clean verdict and guidance for 0-20 score', () => {
      const cleanReport: AnalysisReport = {
        messageId: 'clean-1',
        senderDomain: 'github.com',
        timestamp: new Date().toISOString(),
        forensicPath: [{ ip: '192.30.252.210', ptrValid: true, isPrivate: false, trusted: true }],
        authResults: { spf: 'pass', dkim: 'pass', dmarcAlignment: 'relaxed', arcPass: true, authScore: 0, findings: [] },
        riskMatrix: {
          authScore: 0,
          identityScore: 0,
          ipScore: 10,
          nlpScore: 0,
          finalScore: 2,
          pillars: {
            authentication: { score: 0, weight: 0.3, findings: [] },
            identity: { score: 0, weight: 0.25, findings: [] },
            infrastructure: { score: 10, weight: 0.2, findings: [] },
            nlp: { score: 0, weight: 0.25, findings: [] },
          },
        },
        aiSummary: mockAiSummary,
      };

      const verdict = getExecutiveVerdictDetails(cleanReport);
      expect(verdict.score).toBe(2);
      expect(verdict.severityLabel).toBe('CLEAN · BENIGN');
      expect(verdict.severityTone).toBe('clean');
      expect(verdict.isOverridden).toBe(false);
      expect(verdict.colorText).toContain('10b981');
      expect(verdict.recommendedAction).toContain('Safe for normal handling');
    });

    it('accurately derives low risk verdict for 21-40 score', () => {
      const lowReport: AnalysisReport = {
        messageId: 'low-1',
        senderDomain: 'newsletter.example.org',
        timestamp: new Date().toISOString(),
        forensicPath: [],
        authResults: { spf: 'pass', dkim: 'pass', dmarcAlignment: 'strict', arcPass: true, authScore: 10, findings: [] },
        riskMatrix: {
          authScore: 20,
          identityScore: 15,
          ipScore: 40,
          nlpScore: 35,
          finalScore: 28,
          pillars: {
            authentication: { score: 20, weight: 0.3, findings: [] },
            identity: { score: 15, weight: 0.25, findings: [] },
            infrastructure: { score: 40, weight: 0.2, findings: [] },
            nlp: { score: 35, weight: 0.25, findings: [] },
          },
        },
        aiSummary: mockAiSummary,
      };

      const verdict = getExecutiveVerdictDetails(lowReport);
      expect(verdict.score).toBe(28);
      expect(verdict.severityLabel).toBe('LOW RISK · MONITORED');
      expect(verdict.severityTone).toBe('low');
      expect(verdict.colorText).toContain('0052ff');
      expect(verdict.recommendedAction).toContain('Deliver to recipient');
    });

    it('accurately derives moderate risk verdict for 41-60 score', () => {
      const modReport: AnalysisReport = {
        messageId: 'mod-1',
        senderDomain: 'suspicious-promo.xyz',
        timestamp: new Date().toISOString(),
        forensicPath: [],
        authResults: { spf: 'neutral', dkim: 'none', dmarcAlignment: 'fail', arcPass: false, authScore: 50, findings: [] },
        riskMatrix: {
          authScore: 60,
          identityScore: 45,
          ipScore: 60,
          nlpScore: 55,
          finalScore: 55,
          pillars: {
            authentication: { score: 60, weight: 0.3, findings: [] },
            identity: { score: 45, weight: 0.25, findings: [] },
            infrastructure: { score: 60, weight: 0.2, findings: [] },
            nlp: { score: 55, weight: 0.25, findings: [] },
          },
        },
        aiSummary: mockAiSummary,
      };

      const verdict = getExecutiveVerdictDetails(modReport);
      expect(verdict.score).toBe(55);
      expect(verdict.severityLabel).toBe('MODERATE RISK · SUSPICIOUS');
      expect(verdict.severityTone).toBe('moderate');
      expect(verdict.colorText).toContain('d97706');
      expect(verdict.recommendedAction).toContain('caution warning');
    });

    it('accurately derives high risk verdict for 61-80 score', () => {
      const highReport: AnalysisReport = {
        messageId: 'high-1',
        senderDomain: 'bank-security-alert.net',
        timestamp: new Date().toISOString(),
        forensicPath: [],
        authResults: { spf: 'fail', dkim: 'fail', dmarcAlignment: 'fail', arcPass: false, authScore: 80, findings: [] },
        riskMatrix: {
          authScore: 85,
          identityScore: 70,
          ipScore: 75,
          nlpScore: 80,
          finalScore: 78,
          pillars: {
            authentication: { score: 85, weight: 0.3, findings: [] },
            identity: { score: 70, weight: 0.25, findings: [] },
            infrastructure: { score: 75, weight: 0.2, findings: [] },
            nlp: { score: 80, weight: 0.25, findings: [] },
          },
        },
        aiSummary: mockAiSummary,
      };

      const verdict = getExecutiveVerdictDetails(highReport);
      expect(verdict.score).toBe(78);
      expect(verdict.severityLabel).toBe('HIGH RISK · PROBABLE ATTACK');
      expect(verdict.severityTone).toBe('high');
      expect(verdict.colorText).toContain('ba1a1a');
      expect(verdict.recommendedAction).toContain('Quarantine message');
    });

    it('accurately captures circuit breaker override escalation to 100', () => {
      const overrideReport: AnalysisReport = {
        messageId: 'override-1',
        senderDomain: 'evil-spoof.com',
        timestamp: new Date().toISOString(),
        forensicPath: [],
        authResults: { spf: 'pass', dkim: 'pass', dmarcAlignment: 'strict', arcPass: true, authScore: 0, findings: [] },
        riskMatrix: {
          authScore: 0,
          identityScore: 0,
          ipScore: 0,
          nlpScore: 90,
          finalScore: 100,
          baseScore: 22.5,
          quarantineOverride: true,
          override: {
            triggered: true,
            type: 'HIGH_RISK_QUARANTINE',
            reason: 'Zero-tolerance credential harvesting detected',
          },
          pillars: {
            authentication: { score: 0, weight: 0.3, findings: [] },
            identity: { score: 0, weight: 0.25, findings: [] },
            infrastructure: { score: 0, weight: 0.2, findings: [] },
            nlp: { score: 90, weight: 0.25, findings: [] },
          },
        },
        aiSummary: mockAiSummary,
      };

      const verdict = getExecutiveVerdictDetails(overrideReport);
      expect(verdict.score).toBe(100);
      expect(verdict.baseScore).toBe(22.5);
      expect(verdict.isOverridden).toBe(true);
      expect(verdict.overrideType).toBe('HIGH_RISK_QUARANTINE');
      expect(verdict.severityLabel).toBe('CRITICAL RISK · MALICIOUS');
      expect(verdict.recommendedAction).toContain('Immediate quarantine');
    });

    it('safely handles undefined or null report without throwing', () => {
      const verdictNull = getExecutiveVerdictDetails(null);
      expect(verdictNull.score).toBe(0);
      expect(verdictNull.severityLabel).toBe('CLEAN · BENIGN');

      const verdictUndefined = getExecutiveVerdictDetails(undefined);
      expect(verdictUndefined.score).toBe(0);
      expect(verdictUndefined.severityLabel).toBe('CLEAN · BENIGN');
    });
  });

  describe('getPillarScoreVisuals', () => {
    it('assigns clean green styling to 0 score', () => {
      const visuals = getPillarScoreVisuals(0);
      expect(visuals.level).toBe('clean');
      expect(visuals.badgeLabel).toBe('CLEAN');
      expect(visuals.colorText).toContain('10b981');
    });

    it('assigns clean green styling to scores below 20 (e.g. 10)', () => {
      const visuals = getPillarScoreVisuals(10);
      expect(visuals.level).toBe('clean');
      expect(visuals.badgeLabel).toBe('CLEAN');
      expect(visuals.colorText).toContain('10b981');
    });

    it('assigns monitored blue styling to scores 20 to 49', () => {
      const visuals = getPillarScoreVisuals(35);
      expect(visuals.level).toBe('low');
      expect(visuals.badgeLabel).toBe('MONITORED');
      expect(visuals.colorText).toContain('0052ff');
    });

    it('assigns elevated amber styling to scores 50 to 79', () => {
      const visuals = getPillarScoreVisuals(65);
      expect(visuals.level).toBe('moderate');
      expect(visuals.badgeLabel).toBe('ELEVATED');
      expect(visuals.colorText).toContain('d97706');
    });

    it('assigns critical red styling to scores 80 and above', () => {
      const visuals = getPillarScoreVisuals(95);
      expect(visuals.level).toBe('critical');
      expect(visuals.badgeLabel).toBe('CRITICAL');
      expect(visuals.colorText).toContain('ba1a1a');
    });

    it('safely handles non-finite, NaN, and negative values', () => {
      const visualsNan = getPillarScoreVisuals(NaN);
      expect(visualsNan.level).toBe('clean');
      expect(visualsNan.badgeLabel).toBe('CLEAN');

      const visualsNeg = getPillarScoreVisuals(-10);
      expect(visualsNeg.level).toBe('clean');
    });
  });

  describe('Session Investigations Filtering Logic', () => {
    interface MockJob {
      id: string;
      fileName: string;
      status: string;
    }

    it('filters out the active job when computing other session investigations', () => {
      const jobs: MockJob[] = [
        { id: 'job-1', fileName: 'sample1.eml', status: 'completed' },
        { id: 'job-2', fileName: 'sample2.eml', status: 'completed' },
        { id: 'job-3', fileName: 'sample3.eml', status: 'processing' },
      ];

      const activeJobId = 'job-1';
      const otherJobs = jobs.filter((j) => j.id !== activeJobId);

      expect(otherJobs.length).toBe(2);
      expect(otherJobs.some((j) => j.id === 'job-1')).toBe(false);
      expect(otherJobs.map((j) => j.id)).toEqual(['job-2', 'job-3']);
    });

    it('returns an empty array when only the active job exists in session', () => {
      const jobs: MockJob[] = [
        { id: 'job-only', fileName: 'single.eml', status: 'completed' },
      ];

      const activeJobId = 'job-only';
      const otherJobs = jobs.filter((j) => j.id !== activeJobId);

      expect(otherJobs.length).toBe(0);
    });
  });
});
