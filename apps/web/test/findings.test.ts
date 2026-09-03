import { describe, it, expect } from 'vitest';
import type { AnalysisReport, ForensicHop, AuthResult, RiskMatrix } from '@mailiac/shared-types';
import {
  getDedupedFindings,
  getPayloadFindings,
  getImportantFindings,
  getPartitionedFindings,
  getAuthPostureSummary,
  isValidFqdn,
  classifyForensicHop,
  getOverrideDetails,
  extractGeolocatedHops,
  getReportMetadataSummary,
  normalizeIntents,
  isEngineEventFinding,
  getAiDiagnosticsSummary,
} from '../src/lib/findings';

describe('findings forensic data-shaping utilities', () => {
  describe('Bug 1: getDedupedFindings & getPayloadFindings', () => {
    it('deduplicates overlapping findings between pillars and aiSummary', () => {
      const mockReport: AnalysisReport = {
        messageId: 'test-123',
        senderDomain: 'paypal-security-update.com',
        timestamp: new Date().toISOString(),
        forensicPath: [],
        authResults: {
          spf: 'fail',
          dkim: 'none',
          dmarcAlignment: 'fail',
          arcPass: false,
          authScore: 100,
          findings: [{ type: 'SPF_FAIL', severity: 'HIGH', description: 'SPF hard fail' }],
        },
        riskMatrix: {
          authScore: 100,
          identityScore: 90,
          ipScore: 80,
          nlpScore: 95,
          finalScore: 100,
          pillars: {
            authentication: {
              score: 100,
              weight: 0.3,
              findings: [{ type: 'SPF_FAIL', severity: 'HIGH', description: 'SPF hard fail' }],
            },
            identity: {
              score: 90,
              weight: 0.25,
              findings: [
                { type: 'HOMOGLYPH_DOMAIN', severity: 'HIGH', description: 'Domain lookalike identified' },
              ],
            },
            infrastructure: {
              score: 80,
              weight: 0.2,
              findings: [{ type: 'TOR_EXIT_NODE', severity: 'MEDIUM', description: 'Originating IP is Tor relay' }],
            },
            nlp: {
              score: 95,
              weight: 0.25,
              findings: [
                { type: 'CREDENTIAL_HARVESTING', severity: 'HIGH', description: 'Detected deceptive password reset request' },
                { type: 'URGENCY_PRESSURE', severity: 'MEDIUM', description: 'Coercive urgency language' },
              ],
            },
          },
        },
        aiSummary: {
          provider: 'gemini',
          providerStatus: 'success',
          urgency: 95,
          intent: ['CREDENTIAL_HARVESTING', 'URGENCY_PRESSURE'],
          integrityHash: 'abc123hash',
          confidence: 0.98,
          // DUPLICATE findings from NLP engine:
          findings: [
            { type: 'CREDENTIAL_HARVESTING', severity: 'HIGH', description: 'Detected deceptive password reset request' },
            { type: 'URGENCY_PRESSURE', severity: 'MEDIUM', description: 'Coercive urgency language' },
          ],
        },
      };

      const deduped = getDedupedFindings(mockReport);
      // Expected unique findings: SPF_FAIL, HOMOGLYPH_DOMAIN, TOR_EXIT_NODE, CREDENTIAL_HARVESTING, URGENCY_PRESSURE
      expect(deduped.length).toBe(5);

      // Verify no duplicate CREDENTIAL_HARVESTING
      const credFindings = deduped.filter((f) => f.type === 'CREDENTIAL_HARVESTING');
      expect(credFindings.length).toBe(1);

      // Verify payload findings extraction without duplication
      const payloadFindings = getPayloadFindings(mockReport);
      expect(payloadFindings.length).toBe(0); // none of the above are payload specific

      // Now add a payload link finding to both nlp and aiSummary
      mockReport.riskMatrix.pillars.nlp.findings.push({
        type: 'SUSPICIOUS_URL_REDIRECT',
        severity: 'HIGH',
        description: 'Phishing URL link pointing to credential harvest portal',
      });
      mockReport.aiSummary.findings.push({
        type: 'SUSPICIOUS_URL_REDIRECT',
        severity: 'HIGH',
        description: 'Phishing URL link pointing to credential harvest portal',
      });

      const updatedPayload = getPayloadFindings(mockReport);
      expect(updatedPayload.length).toBe(1);
      expect(updatedPayload[0].type).toBe('SUSPICIOUS_URL_REDIRECT');
    });
  });

  describe('Bug 2: getImportantFindings & getPartitionedFindings (prioritizing severity worst-first)', () => {
    it('populates important findings with real threat findings and preserves all signals including minor anomalies', () => {
      const mockReport: AnalysisReport = {
        messageId: 'case-priority-1',
        senderDomain: 'bank-auth.com',
        timestamp: new Date().toISOString(),
        forensicPath: [],
        authResults: { spf: 'pass', dkim: 'pass', dmarcAlignment: 'strict', arcPass: false, authScore: 0, findings: [] },
        riskMatrix: {
          authScore: 0,
          identityScore: 20,
          ipScore: 10,
          nlpScore: 85,
          finalScore: 100,
          pillars: {
            authentication: { score: 0, weight: 0.3, findings: [] },
            identity: {
              score: 20,
              weight: 0.25,
              findings: [{ type: 'AUTHORITY_TRAP', severity: 'HIGH', description: 'Executive authority coercion detected' }],
            },
            infrastructure: { score: 10, weight: 0.2, findings: [] },
            nlp: {
              score: 85,
              weight: 0.25,
              findings: [
                { type: 'FINANCIAL_COERCION', severity: 'HIGH', description: 'Direct wire transfer demand with tight deadline' },
                { type: 'HIGH_RISK_QUARANTINE', severity: 'HIGH', description: 'Circuit breaker triggered fatal override' },
                { type: 'SUSPICIOUS_GREETING', severity: 'LOW', description: 'Generic salutation' },
                { type: 'TECHNICAL_ANOMALY', severity: 'INFO', description: 'Unusual X-Mailer header formatting' },
              ],
            },
          },
        },
        aiSummary: {
          provider: 'gemini',
          providerStatus: 'success',
          urgency: 85,
          intent: ['FINANCIAL_COERCION'],
          integrityHash: 'xyz',
          confidence: 0.95,
          findings: [],
        },
      };

      const cards = getImportantFindings(mockReport);
      // All 5 real findings must be present without truncation
      expect(cards.length).toBe(5);

      // Verify the top 3 cards are the real HIGH severity findings
      const highCards = cards.filter((c) => c.severity === 'HIGH');
      expect(highCards.length).toBe(3);

      const titles = cards.map((c) => c.title);
      expect(titles).toContain('AUTHORITY TRAP');
      expect(titles).toContain('FINANCIAL COERCION');
      expect(titles).toContain('HIGH RISK QUARANTINE');
      expect(titles).toContain('SUSPICIOUS GREETING');
      expect(titles).toContain('TECHNICAL ANOMALY');

      // Verify partitioned findings
      const partitioned = getPartitionedFindings(mockReport);
      // Engine event HIGH_RISK_QUARANTINE is routed to engineEvents, leaving 2 primary actionable threats
      expect(partitioned.primaryFindings.length).toBe(2);
      expect(partitioned.engineEvents.length).toBe(1);
      expect(partitioned.engineEvents[0].title).toBe('HIGH RISK QUARANTINE');
      expect(partitioned.minorAnomalies.length).toBe(2);
      expect(partitioned.totalCount).toBe(5);
      expect(partitioned.forensicCount).toBe(4);

      // Minor anomaly like TECHNICAL_ANOMALY must be preserved in the minor anomalies tray
      const minorTitles = partitioned.minorAnomalies.map((c) => c.title);
      expect(minorTitles).toContain('TECHNICAL ANOMALY');
      expect(minorTitles).toContain('SUSPICIOUS GREETING');
    });

    it('returns empty list for clean emails without injecting fake or hardcoded category cards', () => {
      const cleanReport: AnalysisReport = {
        messageId: 'clean-1',
        senderDomain: 'github.com',
        timestamp: new Date().toISOString(),
        forensicPath: [],
        authResults: { spf: 'pass', dkim: 'pass', dmarcAlignment: 'strict', arcPass: false, authScore: 0, findings: [] },
        riskMatrix: {
          authScore: 0,
          identityScore: 0,
          ipScore: 0,
          nlpScore: 0,
          finalScore: 0,
          pillars: {
            authentication: { score: 0, weight: 0.3, findings: [] },
            identity: { score: 0, weight: 0.25, findings: [] },
            infrastructure: { score: 0, weight: 0.2, findings: [] },
            nlp: { score: 0, weight: 0.25, findings: [] },
          },
        },
        aiSummary: {
          provider: 'gemini',
          providerStatus: 'success',
          urgency: 0,
          intent: ['BENIGN'],
          integrityHash: 'hash',
          confidence: 0.99,
          findings: [],
        },
      };

      const cards = getImportantFindings(cleanReport);
      expect(cards.length).toBe(0);

      const partitioned = getPartitionedFindings(cleanReport);
      expect(partitioned.primaryFindings.length).toBe(0);
      expect(partitioned.minorAnomalies.length).toBe(0);
      expect(partitioned.totalCount).toBe(0);
    });
  });

  describe('Bug 3: getAuthPostureSummary (data-driven authentic RFC/DKIM/DMARC copy)', () => {
    it('generates accurate pass copy for prompt scenario (DKIM pass + DMARC strict + SPF neutral + ARC absent) without saying unaligned', () => {
      const auth: AuthResult = {
        spf: 'neutral',
        dkim: 'pass',
        dmarcAlignment: 'strict',
        arcPass: false,
        authScore: 25,
        findings: [],
      };

      const summary = getAuthPostureSummary(auth);
      expect(summary.status).toBe('pass');
      expect(summary.text).toContain('DKIM and DMARC authentication passed with strict alignment');
      expect(summary.text).toContain('SPF is neutral');
      expect(summary.text).toContain('no ARC chain is present');
      expect(summary.text).not.toContain('unaligned');
    });

    it('generates strong pass copy for aligned SPF and DKIM with strict DMARC', () => {
      const auth: AuthResult = {
        spf: 'pass',
        dkim: 'pass',
        dmarcAlignment: 'strict',
        arcPass: false,
        authScore: 0,
        findings: [],
      };

      const summary = getAuthPostureSummary(auth);
      expect(summary.status).toBe('pass');
      expect(summary.text).toContain('aligned SPF and DKIM records (strict alignment)');
    });

    it('generates pass copy for valid forwarded ARC chain', () => {
      const auth: AuthResult = {
        spf: 'fail',
        dkim: 'fail',
        dmarcAlignment: 'fail',
        arcPass: true,
        authScore: 0,
        findings: [],
      };

      const summary = getAuthPostureSummary(auth);
      expect(summary.status).toBe('pass');
      expect(summary.text).toContain('Authenticated Received Chain (ARC)');
    });

    it('generates critical failure copy when DKIM signature verification fails (tampering threat)', () => {
      const auth: AuthResult = {
        spf: 'pass',
        dkim: 'fail',
        dmarcAlignment: 'relaxed',
        arcPass: false,
        authScore: 100,
        findings: [],
      };

      const summary = getAuthPostureSummary(auth);
      expect(summary.status).toBe('fail');
      expect(summary.text).toContain('DKIM signature verification failed');
      expect(summary.text).toContain('tampering');
      expect(summary.text).toContain('Sender IP authorized by SPF');
    });

    it('generates failure copy when SPF, DKIM, and DMARC all fail', () => {
      const auth: AuthResult = {
        spf: 'fail',
        dkim: 'fail',
        dmarcAlignment: 'fail',
        arcPass: false,
        authScore: 100,
        findings: [],
      };

      const summary = getAuthPostureSummary(auth);
      expect(summary.status).toBe('fail');
      expect(summary.text).toContain('Authentication failed on all mechanisms');
    });

    it('accurately identifies DMARC misalignment when DKIM passed but domain alignment failed', () => {
      const auth: AuthResult = {
        spf: 'none',
        dkim: 'pass',
        dmarcAlignment: 'fail',
        arcPass: false,
        authScore: 50,
        findings: [],
      };

      const summary = getAuthPostureSummary(auth);
      expect(summary.status).toBe('warn');
      expect(summary.text).toContain('DMARC alignment failed');
      expect(summary.text).toContain('DKIM signature cryptographically verified');
    });

    it('describes neutral SPF without falsely claiming SPF failed or calling it broken', () => {
      const auth: AuthResult = {
        spf: 'neutral',
        dkim: 'none',
        dmarcAlignment: 'fail',
        arcPass: false,
        authScore: 50,
        findings: [],
      };

      const summary = getAuthPostureSummary(auth);
      expect(summary.status).toBe('warn');
      expect(summary.text).toContain('SPF record evaluated to neutral');
      expect(summary.text).not.toContain('SPF failed');
      expect(summary.text).not.toContain('ARC authentication failed');
    });

    it('returns neutral warning when authentication evidence is missing or incomplete', () => {
      expect(getAuthPostureSummary(undefined).text).toContain('Authentication evidence is incomplete');
      expect(getAuthPostureSummary(null).text).toContain('Authentication evidence is incomplete');
      expect(getAuthPostureSummary({} as AuthResult).text).toContain('Authentication evidence is incomplete');
    });
  });

  describe('Bug 5: isValidFqdn & classifyForensicHop (tiering & pseudo-FQDN flags)', () => {
    it('validates genuine public FQDNs', () => {
      expect(isValidFqdn('mail-wm1-f44.google.com')).toBe(true);
      expect(isValidFqdn('relay.smtp.sendgrid.net')).toBe(true);
      expect(isValidFqdn('a3.domain.co.uk')).toBe(true);
    });

    it('identifies invalid, single-label, or suspicious pseudo-FQDNs like "a3.domain"', () => {
      expect(isValidFqdn('a3.domain')).toBe(false); // pseudo-TLD .domain
      expect(isValidFqdn('mailhost.local')).toBe(false); // pseudo-TLD .local
      expect(isValidFqdn('exchange01.internal')).toBe(false); // pseudo-TLD .internal
      expect(isValidFqdn('localhost')).toBe(false); // single label
      expect(isValidFqdn('relay_node.org')).toBe(false); // underscore invalid in hostname
      expect(isValidFqdn('')).toBe(false);
      expect(isValidFqdn(undefined)).toBe(false);
    });

    it('classifies hops into TRUSTED INFRA, RECOGNIZED PROVIDER, UNVERIFIED, and LIKELY FORGED with forensic evidence', () => {
      const trustedHop: ForensicHop = {
        ip: '127.0.0.1',
        hostnameClaimed: 'localhost',
        ptrValid: true,
        isPrivate: true,
        trusted: true,
      };
      const trustedResult = classifyForensicHop(trustedHop);
      expect(trustedResult.tier).toBe('TRUSTED INFRA');
      expect(trustedResult.evidence).toContain('Trusted internal delivery network');

      const recognizedHop: ForensicHop = {
        ip: '209.85.128.196',
        hostnameClaimed: 'mail-wm1-f44.google.com',
        ptrValid: true,
        isPrivate: false,
        trusted: false,
        asn: 'AS15169 Google LLC',
      };
      const recognizedResult = classifyForensicHop(recognizedHop);
      expect(recognizedResult.tier).toBe('RECOGNIZED PROVIDER');
      expect(recognizedResult.isSuspiciousHostname).toBe(false);
      expect(recognizedResult.evidence).toBe('Valid PTR • Google LLC • AS15169');

      const forgedHostnameHop: ForensicHop = {
        ip: '198.51.100.22',
        hostnameClaimed: 'a3.domain',
        ptrValid: false,
        isPrivate: false,
        trusted: false,
        asn: 'AS13335 Cloudflare',
      };
      const forgedResult = classifyForensicHop(forgedHostnameHop);
      expect(forgedResult.tier).toBe('LIKELY FORGED');
      expect(forgedResult.isSuspiciousHostname).toBe(true);
      expect(forgedResult.suspiciousReason).toContain('a3.domain');
      expect(forgedResult.evidence).toContain('malformed pseudo-domain "a3.domain"');

      // Private hop without trust flag is UNVERIFIED, not forged
      const unverifiedPrivateHop: ForensicHop = {
        ip: '10.0.1.5',
        ptrValid: false,
        isPrivate: true,
        trusted: false,
      };
      const unverifiedResult = classifyForensicHop(unverifiedPrivateHop);
      expect(unverifiedResult.tier).toBe('UNVERIFIED');
      expect(unverifiedResult.evidence).toContain('Internal network address (RFC 1918)');

      // Public hop with missing PTR and standard domain is UNVERIFIED, not forged
      const unverifiedPublicHop: ForensicHop = {
        ip: '198.51.100.50',
        hostnameClaimed: 'mail.standardisp.net',
        ptrValid: false,
        isPrivate: false,
        trusted: false,
      };
      const unverifiedPublicResult = classifyForensicHop(unverifiedPublicHop);
      expect(unverifiedPublicResult.tier).toBe('UNVERIFIED');
      expect(unverifiedPublicResult.evidence).toContain('No sufficient reverse-DNS evidence');
    });
  });

  describe('Bug 6: getOverrideDetails (surfacing circuit breaker overrides & reconciling score calculations)', () => {
    it('detects quarantine override and returns the reason, baseScore, finalScore, and score difference', () => {
      const matrix: RiskMatrix = {
        authScore: 0,
        identityScore: 30,
        ipScore: 10,
        nlpScore: 80,
        baseScore: 28.5,
        quarantineOverride: true,
        override: {
          triggered: true,
          type: 'HIGH_RISK_QUARANTINE',
          reason: 'High-risk quarantine override triggered: Fatal circuit breaker matched actionable threats',
        },
        finalScore: 100,
        pillars: {
          authentication: { score: 0, weight: 0.3, findings: [] },
          identity: { score: 30, weight: 0.25, findings: [] },
          infrastructure: { score: 10, weight: 0.2, findings: [] },
          nlp: { score: 80, weight: 0.25, findings: [] },
        },
      };

      const details = getOverrideDetails(matrix);
      expect(details.isOverridden).toBe(true);
      expect(details.type).toBe('HIGH_RISK_QUARANTINE');
      expect(details.reason).toContain('Fatal circuit breaker matched actionable threats');
      expect(details.baseScore).toBe(28.5);
      expect(details.finalScore).toBe(100);
      expect(details.scoreDifference).toBe(71.5);
    });

    it('dynamically computes weighted base score 22.5 when baseScore is omitted and reconciles to 100', () => {
      // Exact problem scenario from prompt: 0 auth, 0 identity, 0 ip, 90 nlp (weights: 0.30, 0.25, 0.20, 0.25)
      const matrixWithoutBaseScore: RiskMatrix = {
        authScore: 0,
        identityScore: 0,
        ipScore: 0,
        nlpScore: 90,
        quarantineOverride: true,
        finalScore: 100,
        pillars: {
          authentication: { score: 0, weight: 0.30, findings: [] },
          identity: { score: 0, weight: 0.25, findings: [] },
          infrastructure: { score: 0, weight: 0.20, findings: [] },
          nlp: {
            score: 90,
            weight: 0.25,
            findings: [
              {
                type: 'HIGH_RISK_QUARANTINE',
                severity: 'HIGH',
                description: 'Fatal circuit breaker matched actionable threats',
              },
            ],
          },
        },
      };

      const details = getOverrideDetails(matrixWithoutBaseScore);
      expect(details.isOverridden).toBe(true);
      // 0*0.30 + 0*0.25 + 0*0.20 + 90*0.25 = 22.5
      expect(details.baseScore).toBe(22.5);
      expect(details.finalScore).toBe(100);
      expect(details.scoreDifference).toBe(77.5);
      expect(details.type).toBe('HIGH_RISK_QUARANTINE');
      expect(details.reason).toContain('Fatal circuit breaker matched actionable threats');
    });

    it('handles future or custom circuit-breaker types dynamically without hardcoding', () => {
      const customMatrix: RiskMatrix = {
        authScore: 20,
        identityScore: 20,
        ipScore: 20,
        nlpScore: 20,
        override: {
          triggered: true,
          type: 'EXPLOIT_ZERO_DAY_ISOLATION',
          reason: 'Custom heuristic detected zero-day CVE execution pattern',
        },
        finalScore: 95,
        pillars: {
          authentication: { score: 20, weight: 0.3, findings: [] },
          identity: { score: 20, weight: 0.25, findings: [] },
          infrastructure: { score: 20, weight: 0.2, findings: [] },
          nlp: { score: 20, weight: 0.25, findings: [] },
        },
      };

      const details = getOverrideDetails(customMatrix);
      expect(details.isOverridden).toBe(true);
      expect(details.type).toBe('EXPLOIT_ZERO_DAY_ISOLATION');
      expect(details.reason).toBe('Custom heuristic detected zero-day CVE execution pattern');
      expect(details.baseScore).toBe(20);
      expect(details.finalScore).toBe(95);
      expect(details.scoreDifference).toBe(75);
    });

    it('safely handles missing or undefined pillar scores without producing NaN', () => {
      const emptyMatrix = {} as RiskMatrix;
      const details = getOverrideDetails(emptyMatrix);

      expect(Number.isNaN(details.baseScore)).toBe(false);
      expect(Number.isNaN(details.finalScore)).toBe(false);
      expect(Number.isNaN(details.scoreDifference)).toBe(false);
      expect(details.baseScore).toBe(0);
      expect(details.finalScore).toBe(0);
      expect(details.isOverridden).toBe(false);
    });

    it('returns not overridden when normal weighted score applies', () => {
      const matrix: RiskMatrix = {
        authScore: 10,
        identityScore: 10,
        ipScore: 10,
        nlpScore: 10,
        baseScore: 10,
        quarantineOverride: false,
        override: { triggered: false, type: 'NONE', reason: 'Standard weighted aggregation applied without override' },
        finalScore: 10,
        pillars: {
          authentication: { score: 10, weight: 0.3, findings: [] },
          identity: { score: 10, weight: 0.25, findings: [] },
          infrastructure: { score: 10, weight: 0.2, findings: [] },
          nlp: { score: 10, weight: 0.25, findings: [] },
        },
      };

      const details = getOverrideDetails(matrix);
      expect(details.isOverridden).toBe(false);
      expect(details.scoreDifference).toBe(0);
    });
  });

  describe('Point 7: extractGeolocatedHops (visual trace map & coordinate projection)', () => {
    it('filters hops with valid coordinates and calculates equirectangular SVG projections preserving hop order', () => {
      const mockHops: ForensicHop[] = [
        {
          ip: '209.85.128.196',
          hostnameClaimed: 'mail-wm1-f44.google.com',
          ptrValid: true,
          isPrivate: false,
          trusted: false,
          city: 'Mountain View',
          country: 'United States',
          coordinates: [37.4223, -122.0847], // Mountain View: lat=37.42, lon=-122.08
          asn: 'AS15169 Google LLC',
        },
        {
          ip: '10.0.1.5',
          ptrValid: false,
          isPrivate: true,
          trusted: true,
          // No coordinates on private IP
        },
        {
          ip: '194.109.6.92',
          hostnameClaimed: 'smtp.xs4all.nl',
          ptrValid: true,
          isPrivate: false,
          trusted: false,
          city: 'Amsterdam',
          country: 'Netherlands',
          coordinates: [52.3676, 4.9041], // Amsterdam: lat=52.37, lon=4.90
          asn: 'AS3265 XS4ALL',
        },
      ];

      const mapped = extractGeolocatedHops(mockHops);
      // Only 2 of 3 hops should be mapped (private hop excluded)
      expect(mapped.length).toBe(2);

      // Preserves original indices and hop numbers
      expect(mapped[0].originalIndex).toBe(0);
      expect(mapped[0].hopNumber).toBe(1);
      expect(mapped[0].city).toBe('Mountain View');
      expect(mapped[0].lat).toBeCloseTo(37.4223, 3);
      expect(mapped[0].lon).toBeCloseTo(-122.0847, 3);
      // Verify SVG projection bounds (within 0-960 and 0-480)
      expect(mapped[0].x).toBeGreaterThan(0);
      expect(mapped[0].x).toBeLessThan(960);
      expect(mapped[0].y).toBeGreaterThan(0);
      expect(mapped[0].y).toBeLessThan(480);
      expect(mapped[0].classification.tier).toBe('RECOGNIZED PROVIDER');

      expect(mapped[1].originalIndex).toBe(2);
      expect(mapped[1].hopNumber).toBe(3);
      expect(mapped[1].city).toBe('Amsterdam');
      expect(mapped[1].classification.tier).toBe('RECOGNIZED PROVIDER');
    });

    it('safely handles empty, null, or undefined hop lists', () => {
      expect(extractGeolocatedHops(null)).toEqual([]);
      expect(extractGeolocatedHops(undefined)).toEqual([]);
      expect(extractGeolocatedHops([])).toEqual([]);
    });

    it('discards invalid, out-of-range, or NaN coordinates safely', () => {
      const invalidHops: ForensicHop[] = [
        {
          ip: '1.2.3.4',
          ptrValid: true,
          isPrivate: false,
          trusted: false,
          coordinates: [120, -45], // Invalid latitude > 90
        },
        {
          ip: '2.3.4.5',
          ptrValid: true,
          isPrivate: false,
          trusted: false,
          coordinates: [45, 250], // Invalid longitude > 180
        },
        {
          ip: '3.4.5.6',
          ptrValid: true,
          isPrivate: false,
          trusted: false,
          coordinates: [NaN as unknown as number, 10], // NaN
        },
      ];

      const mapped = extractGeolocatedHops(invalidHops);
      expect(mapped.length).toBe(0);
    });

    it('applies geographic cluster offset to duplicate coordinates to prevent overlapping markers', () => {
      const duplicateHops: ForensicHop[] = [
        {
          ip: '198.51.100.1',
          ptrValid: true,
          isPrivate: false,
          trusted: false,
          coordinates: [50.1109, 8.6821], // Frankfurt
        },
        {
          ip: '198.51.100.2',
          ptrValid: true,
          isPrivate: false,
          trusted: false,
          coordinates: [50.1109, 8.6821], // Same Frankfurt coordinates
        },
      ];

      const mapped = extractGeolocatedHops(duplicateHops);
      expect(mapped.length).toBe(2);
      // Both hops preserved, but coordinates slightly offset so markers remain distinct
      expect(mapped[0].x !== mapped[1].x || mapped[0].y !== mapped[1].y).toBe(true);
    });
  });

  describe('Point 8: getReportMetadataSummary (data-driven forensic metadata, removing hardcoded placeholders)', () => {
    it('uses actual model returned by backend payload and formats real execution time and hash', () => {
      const realReport: AnalysisReport = {
        messageId: 'msg-real-1',
        senderDomain: 'acme.org',
        timestamp: '2026-09-02T18:00:00.000Z',
        executionTimeMs: 1250,
        forensicPath: [],
        authResults: {
          spf: 'pass',
          dkim: 'pass',
          dmarcAlignment: 'relaxed',
          arcPass: false,
          authScore: 0,
          findings: [],
        },
        riskMatrix: {
          authScore: 0,
          identityScore: 10,
          ipScore: 0,
          nlpScore: 5,
          finalScore: 4,
          pillars: {
            authentication: { score: 0, weight: 0.3, findings: [] },
            identity: { score: 10, weight: 0.25, findings: [] },
            infrastructure: { score: 0, weight: 0.2, findings: [] },
            nlp: { score: 5, weight: 0.25, findings: [] },
          },
        },
        aiSummary: {
          provider: 'gemini',
          providerStatus: 'success',
          model: 'gemini-3.1-flash-lite',
          urgency: 15,
          intent: ['BENIGN'],
          integrityHash: 'a1b2c3d4e5f6789012345678abcdef0123456789abcdef0123456789abcdef01',
          confidence: 0.98,
          findings: [],
        },
      };

      const meta = getReportMetadataSummary(realReport);
      // Sourced from payload, not 'gemini-1.5-flash'
      expect(meta.modelLabel).toBe('gemini-3.1-flash-lite');
      expect(meta.executionTimeFormatted).toBe('1.250s');
      expect(meta.displayHash).toBe('a1b2c3d4...cdef01');
      expect(meta.evaluatedPillarsCount).toBe(4);
      expect(meta.confidencePercent).toBe(98);
      expect(meta.urgencyLabel).toBe('LOW');
      expect(meta.statusLabel).toBe('PILLARS ANALYZED: 4 / 4');
    });

    it('derives provider when model is undefined without inventing gemini-1.5-flash', () => {
      const heuristicReport: AnalysisReport = {
        messageId: 'msg-heuristic',
        senderDomain: 'example.com',
        timestamp: '2026-09-02T18:00:00.000Z',
        forensicPath: [],
        authResults: {
          spf: 'none',
          dkim: 'none',
          dmarcAlignment: 'fail',
          arcPass: false,
          authScore: 50,
          findings: [],
        },
        riskMatrix: {
          authScore: 50,
          identityScore: 0,
          ipScore: 0,
          nlpScore: 0,
          finalScore: 15,
          pillars: {
            authentication: { score: 50, weight: 0.3, findings: [] },
            identity: { score: 0, weight: 0.25, findings: [] },
            infrastructure: { score: 0, weight: 0.2, findings: [] },
            nlp: { score: 0, weight: 0.25, findings: [] },
          },
        },
        aiSummary: {
          provider: 'heuristic',
          providerStatus: 'fallback',
          urgency: 0,
          intent: ['UNKNOWN'],
          integrityHash: '',
          confidence: 0,
          findings: [],
        },
      };

      const meta = getReportMetadataSummary(heuristicReport);
      expect(meta.modelLabel).toBe('HEURISTIC INTENT ENGINE');
      expect(meta.modelLabel).not.toContain('gemini');
    });

    it('safely handles missing execution time and integrity hash without fabricating fake defaults', () => {
      const emptyMeta = getReportMetadataSummary({} as AnalysisReport);
      expect(emptyMeta.executionTimeFormatted).toBeNull();
      expect(emptyMeta.displayHash).toBe('Unavailable');
      expect(emptyMeta.confidencePercent).toBeNull();
      expect(emptyMeta.evaluatedPillarsCount).toBe(0);
      expect(emptyMeta.statusLabel).toBe('PILLARS ANALYZED: 0 / 4');
    });

    it('accurately counts partially evaluated pillars', () => {
      const partialReport = {
        riskMatrix: {
          pillars: {
            authentication: { score: 0, weight: 0.3, findings: [] },
            identity: { score: 10, weight: 0.25, findings: [] },
            // infrastructure missing
            nlp: { score: 20, weight: 0.25, findings: [] },
          },
        },
      } as unknown as AnalysisReport;

      const meta = getReportMetadataSummary(partialReport);
      expect(meta.evaluatedPillarsCount).toBe(3);
      expect(meta.statusLabel).toBe('PILLARS ANALYZED: 3 / 4');
    });
  });

  describe('Point 5: normalizeIntents (render all detected intent classifications)', () => {
    it('normalizes multiple intents without discarding any classification and preserves backend order', () => {
      const rawIntents = ['FINANCIAL_COERCION', 'AUTHORITY_TRAP', 'CREDENTIAL_HARVESTING'];
      const normalized = normalizeIntents(rawIntents);

      expect(normalized.length).toBe(3);
      // Preserves original order
      expect(normalized[0].raw).toBe('FINANCIAL_COERCION');
      expect(normalized[0].label).toBe('Financial Coercion');
      expect(normalized[0].tone).toBe('threat');

      expect(normalized[1].raw).toBe('AUTHORITY_TRAP');
      expect(normalized[1].label).toBe('Authority Trap');
      expect(normalized[1].tone).toBe('warning');

      expect(normalized[2].raw).toBe('CREDENTIAL_HARVESTING');
      expect(normalized[2].label).toBe('Credential Harvesting');
      expect(normalized[2].tone).toBe('threat');
    });

    it('deduplicates identical intents while strictly preserving order', () => {
      const duplicateIntents = ['AUTHORITY_TRAP', 'AUTHORITY_TRAP', 'CREDENTIAL_HARVESTING'];
      const normalized = normalizeIntents(duplicateIntents);

      expect(normalized.length).toBe(2);
      expect(normalized[0].label).toBe('Authority Trap');
      expect(normalized[1].label).toBe('Credential Harvesting');
    });

    it('handles backward compatibility for a single string', () => {
      const singleString = 'FINANCIAL_COERCION';
      const normalized = normalizeIntents(singleString);

      expect(normalized.length).toBe(1);
      expect(normalized[0].raw).toBe('FINANCIAL_COERCION');
      expect(normalized[0].label).toBe('Financial Coercion');
      expect(normalized[0].tone).toBe('threat');
    });

    it('safely handles empty arrays, null, undefined, and non-string values without crashing', () => {
      expect(normalizeIntents([])).toEqual([]);
      expect(normalizeIntents(null)).toEqual([]);
      expect(normalizeIntents(undefined)).toEqual([]);
      expect(normalizeIntents(['   ', ''])).toEqual([]);
    });

    it('gracefully formats unknown future intents', () => {
      const futureIntents = ['SUPPLY_CHAIN_MANIPULATION', 'POLYMORPHIC_URL_ROTATION'];
      const normalized = normalizeIntents(futureIntents);

      expect(normalized.length).toBe(2);
      expect(normalized[0].label).toBe('Supply Chain Manipulation');
      expect(normalized[1].label).toBe('Polymorphic Url Rotation');
    });

    it('correctly maps benign and informational intent labels', () => {
      const benign = normalizeIntents(['BENIGN']);
      expect(benign.length).toBe(1);
      expect(benign[0].label).toBe('Benign');
      expect(benign[0].tone).toBe('benign');
    });
  });

  describe('Refactor: Engine Events & AI Diagnostics', () => {
    it('isEngineEventFinding correctly classifies circuit-breaker types and allows real threats', () => {
      expect(isEngineEventFinding('HIGH_RISK_QUARANTINE')).toBe(true);
      expect(isEngineEventFinding('CIRCUIT_BREAKER_OVERRIDE')).toBe(true);
      expect(isEngineEventFinding('SCORE_OVERRIDE')).toBe(true);
      expect(isEngineEventFinding('AUTHORITY_TRAP')).toBe(false);
      expect(isEngineEventFinding('FINANCIAL_COERCION')).toBe(false);
      expect(isEngineEventFinding('CREDENTIAL_HARVESTING')).toBe(false);
      expect(isEngineEventFinding('SUSPICIOUS_GREETING')).toBe(false);
    });

    it('getAiDiagnosticsSummary extracts telemetry from aiSummary payload', () => {
      const report: AnalysisReport = {
        messageId: 'ai-diag-test',
        senderDomain: 'example.com',
        timestamp: new Date().toISOString(),
        forensicPath: [],
        authResults: { spf: 'pass', dkim: 'pass', dmarcAlignment: 'strict', arcPass: true, authScore: 0, findings: [] },
        riskMatrix: {
          authScore: 0,
          identityScore: 0,
          ipScore: 0,
          nlpScore: 10,
          finalScore: 10,
          pillars: {
            authentication: { score: 0, weight: 0.3, findings: [] },
            identity: { score: 0, weight: 0.25, findings: [] },
            infrastructure: { score: 0, weight: 0.2, findings: [] },
            nlp: { score: 10, weight: 0.25, findings: [] },
          },
        },
        aiSummary: {
          provider: 'gemini',
          model: 'gemini-1.5-pro',
          providerStatus: 'success',
          urgency: 92,
          intent: ['FINANCIAL_COERCION'],
          integrityHash: 'abc123hash',
          confidence: 0.98,
          findings: [
            { type: 'HTML_OBFUSCATION', severity: 'HIGH', description: 'Zero-font hidden text detected' },
          ],
        },
      };

      const diag = getAiDiagnosticsSummary(report);
      expect(diag.confidencePercent).toBe(98);
      expect(diag.urgencyLabel).toBe('HIGH');
      expect(diag.urgencyScore).toBe(92);
      expect(diag.modelLabel).toBe('gemini-1.5-pro');
      expect(diag.hasObfuscation).toBe(false); // only zero-width or glassworm triggers hasObfuscation
      expect(diag.obfuscationDetails).toBeUndefined();
    });

    it('getAiDiagnosticsSummary handles missing or minimal aiSummary gracefully', () => {
      const report = {
        messageId: 'ai-diag-empty',
        senderDomain: 'example.com',
        timestamp: new Date().toISOString(),
        forensicPath: [],
        authResults: { spf: 'pass', dkim: 'pass', dmarcAlignment: 'strict', arcPass: true, authScore: 0, findings: [] },
        riskMatrix: {
          authScore: 0,
          identityScore: 0,
          ipScore: 0,
          nlpScore: 0,
          finalScore: 0,
          pillars: {
            authentication: { score: 0, weight: 0.3, findings: [] },
            identity: { score: 0, weight: 0.25, findings: [] },
            infrastructure: { score: 0, weight: 0.2, findings: [] },
            nlp: { score: 0, weight: 0.25, findings: [] },
          },
        },
      } as unknown as AnalysisReport;

      const diag = getAiDiagnosticsSummary(report);
      expect(diag.confidencePercent).toBeNull();
      expect(diag.urgencyLabel).toBe('LOW');
      expect(diag.urgencyScore).toBe(0);
      expect(diag.hasObfuscation).toBe(false);
      expect(diag.obfuscationDetails).toBeUndefined();
    });
  });
});
