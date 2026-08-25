import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  scoreIpReputation,
  getTimezoneDiscrepancyHours,
  calculateIpScore,
} from '../src/index.js';

describe('scoreIpReputation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('happy path: clean IP with no API key fallback returns 0 ipScore', async () => {
    delete process.env.ABUSEIPDB_API_KEY;
    const nowStr = new Date().toUTCString();

    const result = await scoreIpReputation('8.8.8.8', nowStr);

    expect(result.abuseConfidenceScore).toBe(0);
    expect(result.isProxyOrVpn).toBe(false);
    expect(result.timezoneDiscrepancyHours).toBeLessThan(1);
    expect(result.ipScore).toBe(0);
  });

  it('high risk IP: AbuseIPDB score > 50 and proxy flag results in high ipScore (100)', async () => {
    process.env.ABUSEIPDB_API_KEY = 'mock-api-key';

    const mockResponse = {
      data: {
        abuseConfidenceScore: 85,
        usageType: 'Data Center/Proxy/VPN',
        isTor: false,
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const nowStr = new Date().toUTCString();
    const result = await scoreIpReputation('198.51.100.10', nowStr);

    expect(result.abuseConfidenceScore).toBe(85);
    expect(result.isProxyOrVpn).toBe(true);
    expect(result.ipScore).toBe(100);
  });

  it('timezone discrepancy: Date header > 4 hours in past adds penalty', async () => {
    delete process.env.ABUSEIPDB_API_KEY;

    // Date header set to 10 hours ago
    const pastDate = new Date(Date.now() - 10 * 3600 * 1000).toUTCString();

    const result = await scoreIpReputation('8.8.8.8', pastDate);

    expect(result.timezoneDiscrepancyHours).toBeGreaterThan(4);
    expect(result.ipScore).toBe(40);
  });

  it('private IP input: private/loopback IP returns zeroed fallback', async () => {
    const result = await scoreIpReputation('192.168.1.1', new Date().toUTCString());

    expect(result.abuseConfidenceScore).toBe(0);
    expect(result.isProxyOrVpn).toBe(false);
    expect(result.ipScore).toBe(0);
  });

  it('network failure / timeout: handles API error gracefully without throwing', async () => {
    process.env.ABUSEIPDB_API_KEY = 'mock-api-key';

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network timeout'));

    const result = await scoreIpReputation('203.0.113.5', new Date().toUTCString());

    expect(result.abuseConfidenceScore).toBe(0);
    expect(result.isProxyOrVpn).toBe(false);
    expect(result.ipScore).toBe(0);
  });
});

describe('Helper functions', () => {
  it('getTimezoneDiscrepancyHours calculates difference correctly', () => {
    const now = new Date().toUTCString();
    expect(getTimezoneDiscrepancyHours(now)).toBeLessThan(1);

    const invalid = getTimezoneDiscrepancyHours('invalid-date-string');
    expect(invalid).toBe(0);
  });

  it('calculateIpScore caps score between 0 and 100', () => {
    const score1 = calculateIpScore({
      abuseConfidenceScore: 80, // -> 100
      isProxyOrVpn: true,       // -> +30
      timezoneDiscrepancyHours: 10, // -> +40
    });
    expect(score1).toBe(100);

    const score2 = calculateIpScore({
      abuseConfidenceScore: 20,
      isProxyOrVpn: false,
      timezoneDiscrepancyHours: 0,
    });
    expect(score2).toBe(20);
  });
});
