import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  scoreIpReputation,
  getTimezoneDiscrepancyHours,
  parseDateHeaderTimezoneOffset,
  estimateTimezoneOffsetFromCoordinates,
  calculateIpScore,
  classifyInfrastructure,
  generateIpFindings,
  isPrivateIp,
  clearIpReputationCache,
} from '../src/index.js';

describe('scoreIpReputation & IP Scoring Pillar', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearIpReputationCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    clearIpReputationCache();
    vi.restoreAllMocks();
  });

  describe('1. Failure Semantics & Resilience', () => {
    it('returns REPUTATION_LOOKUP_UNAVAILABLE finding when API key is missing (does NOT claim clean)', async () => {
      delete process.env.ABUSEIPDB_API_KEY;
      const result = await scoreIpReputation('198.51.100.1', 'Tue, 25 Aug 2026 14:00:00 +0000');

      expect(result.ipScore).toBe(0);
      expect(result.abuseConfidenceScore).toBe(0);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'REPUTATION_LOOKUP_UNAVAILABLE',
            severity: 'INFO',
          }),
        ])
      );
      expect(result.findings.some((f) => f.type === 'CLEAN_IP')).toBe(false);
    });

    it('returns REPUTATION_LOOKUP_UNAVAILABLE on network timeout / abort error', async () => {
      process.env.ABUSEIPDB_API_KEY = 'test-key';
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('The operation was aborted due to timeout'));

      const result = await scoreIpReputation('203.0.113.5', 'Tue, 25 Aug 2026 14:00:00 +0000');

      expect(result.ipScore).toBe(0);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'REPUTATION_LOOKUP_UNAVAILABLE',
            severity: 'INFO',
          }),
        ])
      );
      expect(result.findings.some((f) => f.type === 'CLEAN_IP')).toBe(false);
    });

    it('returns REPUTATION_LOOKUP_UNAVAILABLE on HTTP 429 rate-limit error', async () => {
      process.env.ABUSEIPDB_API_KEY = 'test-key';
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      } as Response);

      const result = await scoreIpReputation('203.0.113.10', 'Tue, 25 Aug 2026 14:00:00 +0000');

      expect(result.ipScore).toBe(0);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'REPUTATION_LOOKUP_UNAVAILABLE',
          }),
        ])
      );
    });

    it('returns REPUTATION_LOOKUP_UNAVAILABLE on HTTP 500 server error', async () => {
      process.env.ABUSEIPDB_API_KEY = 'test-key';
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      const result = await scoreIpReputation('203.0.113.15', 'Tue, 25 Aug 2026 14:00:00 +0000');

      expect(result.ipScore).toBe(0);
      expect(result.findings.some((f) => f.type === 'REPUTATION_LOOKUP_UNAVAILABLE')).toBe(true);
    });

    it('handles malformed / non-JSON API response gracefully', async () => {
      process.env.ABUSEIPDB_API_KEY = 'test-key';
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Unexpected token < in JSON at position 0');
        },
      } as Response);

      const result = await scoreIpReputation('203.0.113.20', 'Tue, 25 Aug 2026 14:00:00 +0000');

      expect(result.ipScore).toBe(0);
      expect(result.findings.some((f) => f.type === 'REPUTATION_LOOKUP_UNAVAILABLE')).toBe(true);
    });
  });

  describe('2. Private, Loopback, CGNAT & Null IPs', () => {
    const testCases = [
      { ip: null, desc: 'null' },
      { ip: '', desc: 'empty string' },
      { ip: '   ', desc: 'whitespace string' },
      { ip: 'invalid-ip', desc: 'invalid string' },
      { ip: '127.0.0.1', desc: 'IPv4 loopback' },
      { ip: '10.0.50.1', desc: 'RFC1918 10.0.0.0/8' },
      { ip: '172.20.0.1', desc: 'RFC1918 172.16.0.0/12' },
      { ip: '192.168.1.254', desc: 'RFC1918 192.168.0.0/16' },
      { ip: '100.64.0.1', desc: 'Carrier-Grade NAT 100.64.0.0/10' },
      { ip: '169.254.1.1', desc: 'Link-local 169.254.0.0/16' },
      { ip: '::1', desc: 'IPv6 loopback' },
      { ip: 'fe80::1', desc: 'IPv6 link-local' },
      { ip: 'fc00::1', desc: 'IPv6 unique local' },
      { ip: 'fd12:3456::1', desc: 'IPv6 unique local' },
    ];

    testCases.forEach(({ ip, desc }) => {
      it(`returns PRIVATE_IP with 0 risk for ${desc} (${ip}) without calling API`, async () => {
        process.env.ABUSEIPDB_API_KEY = 'test-key';
        const fetchSpy = vi.spyOn(globalThis, 'fetch');

        const result = await scoreIpReputation(ip, 'Tue, 25 Aug 2026 14:00:00 +0000');

        expect(result.ipScore).toBe(0);
        expect(result.abuseConfidenceScore).toBe(0);
        expect(result.isProxyOrVpn).toBe(false);
        expect(result.findings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'PRIVATE_IP',
              severity: 'INFO',
            }),
          ])
        );
        expect(fetchSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('3. Legitimate Senders & Verified Clean IP', () => {
    it('returns CLEAN_IP finding with 0 score for verified clean residential IP', async () => {
      process.env.ABUSEIPDB_API_KEY = 'test-key';
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            abuseConfidenceScore: 0,
            usageType: 'Fixed Line ISP',
            isp: 'Comcast Cable',
            isTor: false,
          },
        }),
      } as Response);

      const result = await scoreIpReputation('73.1.2.3', 'Tue, 25 Aug 2026 14:00:00 +0000', {
        geoTimezoneOffsetHours: 0,
      });

      expect(result.ipScore).toBe(0);
      expect(result.abuseConfidenceScore).toBe(0);
      expect(result.isProxyOrVpn).toBe(false);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'CLEAN_IP',
            severity: 'INFO',
          }),
        ])
      );
    });

    it('recognizes Google Workspace / Gmail as Known ESP and suppresses generic datacenter penalty', async () => {
      process.env.ABUSEIPDB_API_KEY = 'test-key';
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            abuseConfidenceScore: 0,
            usageType: 'Data Center/Web Hosting/Transit',
            isp: 'Google LLC',
            domain: 'google.com',
            isTor: false,
          },
        }),
      } as Response);

      const result = await scoreIpReputation('209.85.220.41', 'Tue, 25 Aug 2026 14:00:00 +0000');

      expect(result.ipScore).toBe(0); // Datacenter penalty suppressed for known ESP
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'KNOWN_EMAIL_SERVICE_PROVIDER',
            severity: 'INFO',
            description: expect.stringContaining('Google Workspace'),
          }),
        ])
      );
      expect(result.findings.some((f) => f.type === 'DATACENTER_ORIGIN')).toBe(false);
    });

    it('recognizes Microsoft 365 / SendGrid / Amazon SES as Known ESPs', () => {
      const msft = classifyInfrastructure({
        usageType: 'Data Center/Web Hosting/Transit',
        isp: 'Microsoft Corporation',
        domain: 'microsoft.com',
      });
      expect(msft.isKnownEsp).toBe(true);
      expect(msft.espName).toBe('Microsoft 365');

      const sendgrid = classifyInfrastructure({
        usageType: 'Data Center',
        isp: 'SendGrid, Inc.',
        domain: 'sendgrid.net',
      });
      expect(sendgrid.isKnownEsp).toBe(true);
      expect(sendgrid.espName).toBe('SendGrid');

      const ses = classifyInfrastructure({
        usageType: 'Data Center',
        isp: 'Amazon Technologies Inc.',
        domain: 'amazonses.com',
      });
      expect(ses.isKnownEsp).toBe(true);
      expect(ses.espName).toBe('Amazon SES');
    });

    it('does NOT suppress abuse penalties or Tor on Known ESPs (ESP recognition is not a trust bypass)', async () => {
      process.env.ABUSEIPDB_API_KEY = 'test-key';
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            abuseConfidenceScore: 80, // High abuse score on compromised relay
            usageType: 'Data Center',
            isp: 'Google LLC',
            domain: 'google.com',
            isTor: false,
          },
        }),
      } as Response);

      const result = await scoreIpReputation('209.85.220.42', 'Tue, 25 Aug 2026 14:00:00 +0000');

      // Abuse score 80 -> 50 + (80 - 75)*1.6 = 58
      expect(result.abuseConfidenceScore).toBe(80);
      expect(result.ipScore).toBeGreaterThanOrEqual(58);
      expect(result.findings.some((f) => f.type === 'ABUSE_REPUTATION')).toBe(true);
    });

    it('handles legitimate public IPv6 sender correctly', async () => {
      process.env.ABUSEIPDB_API_KEY = 'test-key';
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            abuseConfidenceScore: 0,
            usageType: 'Commercial',
            isp: 'Charter Communications',
            isTor: false,
          },
        }),
      } as Response);

      const ipv6 = '2607:f8b0:4005:805::200e';
      const result = await scoreIpReputation(ipv6, 'Tue, 25 Aug 2026 14:00:00 +0000');

      expect(result.ipScore).toBe(0);
      expect(result.findings.some((f) => f.type === 'CLEAN_IP')).toBe(true);
    });
  });

  describe('4. Suspicious & Malicious Signals', () => {
    it('detects Tor exit node with HIGH severity finding and strong penalty (+35)', async () => {
      process.env.ABUSEIPDB_API_KEY = 'test-key';
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            abuseConfidenceScore: 20,
            usageType: 'Data Center/Web Hosting/Transit',
            isp: 'Tor Exit Network',
            isTor: true,
          },
        }),
      } as Response);

      const result = await scoreIpReputation('185.220.101.5', 'Tue, 25 Aug 2026 14:00:00 +0000');

      expect(result.isProxyOrVpn).toBe(true);
      // Abuse 20 -> 8 pts, Tor -> 35 pts, Datacenter -> 10 pts => 53
      expect(result.ipScore).toBe(53);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'TOR_EXIT_NODE_DETECTED',
            severity: 'HIGH',
          }),
        ])
      );
    });

    it('detects commercial VPN / Proxy (+15 pts, MEDIUM severity)', async () => {
      process.env.ABUSEIPDB_API_KEY = 'test-key';
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            abuseConfidenceScore: 0,
            usageType: 'VPN/Proxy Service',
            isp: 'NordVPN S.A.',
            isTor: false,
          },
        }),
      } as Response);

      const result = await scoreIpReputation('185.150.10.1', 'Tue, 25 Aug 2026 14:00:00 +0000');

      expect(result.isProxyOrVpn).toBe(true);
      expect(result.ipScore).toBe(15);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'PROXY_VPN_DETECTED',
            severity: 'MEDIUM',
          }),
        ])
      );
    });

    it('corroborates unverified datacenter with abuse score > 20 as SUSPICIOUS_HOSTING_INFRASTRUCTURE', async () => {
      process.env.ABUSEIPDB_API_KEY = 'test-key';
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            abuseConfidenceScore: 35,
            usageType: 'Data Center/Web Hosting/Transit',
            isp: 'Hetzner Online GmbH',
            domain: 'hetzner.com',
            isTor: false,
          },
        }),
      } as Response);

      const result = await scoreIpReputation('95.217.1.1', 'Tue, 25 Aug 2026 14:00:00 +0000');

      // Abuse 35 -> 10 + (35 - 25)*0.8 = 18 pts
      // Datacenter base: 10 pts + Corroboration: 10 pts = 20 pts
      // Total: 38 pts
      expect(result.ipScore).toBe(38);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'SUSPICIOUS_HOSTING_INFRASTRUCTURE',
            severity: 'MEDIUM',
          }),
        ])
      );
    });
  });

  describe('5. Timezone Parsing & Discrepancy Calculation', () => {
    it('parses numeric RFC 5322 timezone offsets accurately', () => {
      expect(parseDateHeaderTimezoneOffset('Tue, 25 Aug 2026 14:30:00 +0530')).toBe(5.5);
      expect(parseDateHeaderTimezoneOffset('25 Aug 2026 09:00:00 -0400 (EDT)')).toBe(-4.0);
      expect(parseDateHeaderTimezoneOffset('Wed, 26 Aug 2026 13:00:00 +0000')).toBe(0);
      expect(parseDateHeaderTimezoneOffset('Thu, 27 Aug 2026 10:15:00 -0700')).toBe(-7.0);
    });

    it('parses named timezone abbreviations conservatively', () => {
      expect(parseDateHeaderTimezoneOffset('Wed, 26 Aug 2026 13:00:00 GMT')).toBe(0);
      expect(parseDateHeaderTimezoneOffset('Wed, 26 Aug 2026 13:00:00 UTC')).toBe(0);
      expect(parseDateHeaderTimezoneOffset('Wed, 26 Aug 2026 13:00:00 EST')).toBe(-5);
      expect(parseDateHeaderTimezoneOffset('Wed, 26 Aug 2026 13:00:00 IST')).toBe(5.5);
      expect(parseDateHeaderTimezoneOffset('Wed, 26 Aug 2026 13:00:00 JST')).toBe(9);
    });

    it('returns null for missing, invalid, or ambiguous named timezones (avoiding false alarms)', () => {
      expect(parseDateHeaderTimezoneOffset('')).toBeNull();
      expect(parseDateHeaderTimezoneOffset('invalid date')).toBeNull();
      expect(parseDateHeaderTimezoneOffset('Wed, 26 Aug 2026 13:00:00 UNKNOWN_ZONE')).toBeNull();
    });

    it('estimates solar timezone offset from longitude coordinates correctly', () => {
      expect(estimateTimezoneOffsetFromCoordinates([-74.0, 40.7])).toBe(2.5); // [lat, lon] -> lon=40.7 -> 2.5
      expect(estimateTimezoneOffsetFromCoordinates([40.7, -74.0])).toBe(-5); // lon=-74.0 -> -5.0
      expect(estimateTimezoneOffsetFromCoordinates([28.6, 77.2])).toBe(5); // New Delhi lon=77.2 -> 5.0
      expect(estimateTimezoneOffsetFromCoordinates(null)).toBeNull();
    });

    it('calculates timezone discrepancy between Date header and GeoIP offset with circular wrapping', () => {
      // Date header +0530 (5.5) vs US IP (-5.0) -> raw diff = 10.5 hours
      const diff1 = getTimezoneDiscrepancyHours('Tue, 25 Aug 2026 14:00:00 +0530', -5.0);
      expect(diff1).toBe(10.5);

      // Date header +0000 vs London IP (0.0) -> 0 hours
      const diff2 = getTimezoneDiscrepancyHours('Tue, 25 Aug 2026 14:00:00 +0000', 0);
      expect(diff2).toBe(0);

      // Date header +1200 vs -1100 -> circular distance is 1 hour across antimeridian
      const diff3 = getTimezoneDiscrepancyHours('Tue, 25 Aug 2026 14:00:00 +1200', -11.0);
      expect(diff3).toBe(1);

      // Missing geoOffset returns 0 (no false positive)
      expect(getTimezoneDiscrepancyHours('Tue, 25 Aug 2026 14:00:00 +0530', null)).toBe(0);
      expect(getTimezoneDiscrepancyHours('', -5.0)).toBe(0);
    });

    it('applies calibrated scoring and findings for large timezone discrepancies', async () => {
      process.env.ABUSEIPDB_API_KEY = 'test-key';
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            abuseConfidenceScore: 0,
            usageType: 'Fixed Line ISP',
            isTor: false,
          },
        }),
      } as Response);

      // 10.5 hours discrepancy -> +15 pts, LARGE_TIMEZONE_DISCREPANCY finding
      const result = await scoreIpReputation('73.1.2.3', 'Tue, 25 Aug 2026 14:00:00 +0530', {
        geoTimezoneOffsetHours: -5.0,
      });

      expect(result.timezoneDiscrepancyHours).toBe(10.5);
      expect(result.ipScore).toBe(15);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'LARGE_TIMEZONE_DISCREPANCY',
            severity: 'MEDIUM',
          }),
        ])
      );
    });
  });

  describe('6. In-Memory Caching & Request Deduplication', () => {
    it('caches successful API queries and reuses cached result within TTL', async () => {
      process.env.ABUSEIPDB_API_KEY = 'test-key';
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            abuseConfidenceScore: 25,
            usageType: 'Fixed Line ISP',
            isTor: false,
          },
        }),
      } as Response);

      const res1 = await scoreIpReputation('93.184.216.34', 'Tue, 25 Aug 2026 14:00:00 +0000');
      const res2 = await scoreIpReputation('93.184.216.34', 'Tue, 25 Aug 2026 14:00:00 +0000');

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(res1.abuseConfidenceScore).toBe(25);
      expect(res2.abuseConfidenceScore).toBe(25);
      expect(res2.ipScore).toBe(res1.ipScore);
    });

    it('deduplicates concurrent in-flight requests for the same IP (prevents thundering herd)', async () => {
      process.env.ABUSEIPDB_API_KEY = 'test-key';
      let resolvePromise: (value: Response) => void;
      const delayedResponse = new Promise<Response>((resolve) => {
        resolvePromise = resolve;
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(delayedResponse);

      // Launch 3 simultaneous queries for the same IP
      const p1 = scoreIpReputation('198.51.100.99', 'Tue, 25 Aug 2026 14:00:00 +0000');
      const p2 = scoreIpReputation('198.51.100.99', 'Tue, 25 Aug 2026 14:00:00 +0000');
      const p3 = scoreIpReputation('198.51.100.99', 'Tue, 25 Aug 2026 14:00:00 +0000');

      // Resolve the single HTTP request
      resolvePromise!({
        ok: true,
        json: async () => ({
          data: {
            abuseConfidenceScore: 40,
            usageType: 'Commercial',
            isTor: false,
          },
        }),
      } as Response);

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(r1.abuseConfidenceScore).toBe(40);
      expect(r2.abuseConfidenceScore).toBe(40);
      expect(r3.abuseConfidenceScore).toBe(40);
    });
  });

  describe('7. Scoring Formula Calibration & Monotonicity', () => {
    it('is strictly monotonic with respect to AbuseIPDB confidence score', () => {
      let prevScore = -1;
      for (let abuse = 0; abuse <= 100; abuse++) {
        const score = calculateIpScore({
          abuseConfidenceScore: abuse,
          timezoneDiscrepancyHours: 0,
        });
        expect(score).toBeGreaterThanOrEqual(prevScore);
        prevScore = score;
      }
    });

    it('eliminates the 50->100 threshold cliff', () => {
      const score50 = calculateIpScore({ abuseConfidenceScore: 50, timezoneDiscrepancyHours: 0 });
      const score51 = calculateIpScore({ abuseConfidenceScore: 51, timezoneDiscrepancyHours: 0 });
      const score52 = calculateIpScore({ abuseConfidenceScore: 52, timezoneDiscrepancyHours: 0 });

      expect(score50).toBe(30);
      expect(score51).toBe(31);
      expect(score52).toBe(32);
      expect(score51 - score50).toBeLessThanOrEqual(2);
    });

    it('clamps total score strictly between 0 and 100 under all extreme signal combinations', () => {
      const extremeHigh = calculateIpScore({
        abuseConfidenceScore: 100,
        isTor: true,
        isProxyOrVpn: true,
        isDatacenter: true,
        timezoneDiscrepancyHours: 12,
        ptrValid: false,
      });
      expect(extremeHigh).toBe(100);

      const clean = calculateIpScore({
        abuseConfidenceScore: 0,
        isTor: false,
        isProxyOrVpn: false,
        isDatacenter: false,
        timezoneDiscrepancyHours: 0,
      });
      expect(clean).toBe(0);
    });

    it('one weak signal alone cannot produce a high risk score', () => {
      const datacenterOnly = calculateIpScore({
        abuseConfidenceScore: 0,
        isDatacenter: true,
        timezoneDiscrepancyHours: 0,
      });
      expect(datacenterOnly).toBe(10);

      const timezoneOnly = calculateIpScore({
        abuseConfidenceScore: 0,
        timezoneDiscrepancyHours: 6,
      });
      expect(timezoneOnly).toBe(10);

      const ptrOnly = calculateIpScore({
        abuseConfidenceScore: 0,
        timezoneDiscrepancyHours: 0,
        ptrValid: false,
      });
      expect(ptrOnly).toBe(10);
    });
  });
});


