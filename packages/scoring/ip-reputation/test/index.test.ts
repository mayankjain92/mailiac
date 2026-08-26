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

  it('happy path: clean public IP with no API key fallback returns 0 ipScore', async () => {
    delete process.env.ABUSEIPDB_API_KEY;
    const nowStr = new Date().toUTCString();

    const result = await scoreIpReputation('8.8.8.8', nowStr);

    expect(result.abuseConfidenceScore).toBe(0);
    expect(result.isProxyOrVpn).toBe(false);
    expect(result.timezoneDiscrepancyHours).toBe(0);
    expect(result.ipScore).toBe(0);
  });

  it('legitimate public IPv6 address queries API when API key is set', async () => {
    process.env.ABUSEIPDB_API_KEY = 'mock-api-key';
    const mockResponse = {
      data: {
        abuseConfidenceScore: 10,
        usageType: 'Fixed Line ISP',
        isTor: false,
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const publicIpv6 = '2607:f8b0:4005:805::200e';
    const result = await scoreIpReputation(publicIpv6, new Date().toUTCString());

    expect(result.abuseConfidenceScore).toBe(10);
    expect(result.isProxyOrVpn).toBe(false);
    expect(result.ipScore).toBe(10);
  });

  it('null or missing originatingSenderIp returns zeroed fallback without calling API', async () => {
    process.env.ABUSEIPDB_API_KEY = 'mock-api-key';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const resultNull = await scoreIpReputation(null, new Date().toUTCString());
    expect(resultNull.abuseConfidenceScore).toBe(0);
    expect(resultNull.isProxyOrVpn).toBe(false);
    expect(resultNull.ipScore).toBe(0);

    const resultEmpty = await scoreIpReputation('', new Date().toUTCString());
    expect(resultEmpty.abuseConfidenceScore).toBe(0);
    expect(resultEmpty.isProxyOrVpn).toBe(false);
    expect(resultEmpty.ipScore).toBe(0);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe('Private & Reserved IP handling', () => {
    const privateIps = [
      '10.0.0.1', // 10.0.0.0/8
      '172.16.0.1', // 172.16.0.0/12 start
      '172.31.255.255', // 172.16.0.0/12 end
      '192.168.1.1', // 192.168.0.0/16
      '127.0.0.1', // 127.0.0.0/8 loopback
      '127.0.1.1', // 127.0.0.0/8 loopback alternate
      '169.254.10.20', // 169.254.0.0/16 link-local
      '0.0.0.1', // 0.0.0.0/8 current network
      '::1', // IPv6 loopback
      'fe80::1', // IPv6 link-local (fe80::/10)
      'feb0::1', // IPv6 link-local (fe80::/10 upper)
      'fc00::1', // IPv6 unique local (fc00::/7)
      'fd12:3456::1', // IPv6 unique local (fc00::/7)
    ];

    privateIps.forEach((ip) => {
      it(`recognizes private/reserved IP: ${ip} and returns zeroed fallback`, async () => {
        process.env.ABUSEIPDB_API_KEY = 'mock-api-key';
        const fetchSpy = vi.spyOn(globalThis, 'fetch');

        const result = await scoreIpReputation(ip, new Date().toUTCString());

        expect(result.abuseConfidenceScore).toBe(0);
        expect(result.isProxyOrVpn).toBe(false);
        expect(result.ipScore).toBe(0);
        expect(fetchSpy).not.toHaveBeenCalled();
      });
    });
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

  it('detects Tor flag as proxy/VPN', async () => {
    process.env.ABUSEIPDB_API_KEY = 'mock-api-key';

    const mockResponse = {
      data: {
        abuseConfidenceScore: 20,
        usageType: 'Fixed Line ISP',
        isTor: true,
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const result = await scoreIpReputation('198.51.100.20', new Date().toUTCString());

    expect(result.isProxyOrVpn).toBe(true);
    // 20 + 30 = 50
    expect(result.ipScore).toBe(50);
  });

  it('network failure / timeout: handles API error gracefully without throwing', async () => {
    process.env.ABUSEIPDB_API_KEY = 'mock-api-key';

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network timeout'));

    const result = await scoreIpReputation('203.0.113.5', new Date().toUTCString());

    expect(result.abuseConfidenceScore).toBe(0);
    expect(result.isProxyOrVpn).toBe(false);
    expect(result.ipScore).toBe(0);
  });

  it('HTTP 500 failure: returns safe fallback without throwing', async () => {
    process.env.ABUSEIPDB_API_KEY = 'mock-api-key';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const result = await scoreIpReputation('203.0.113.10', new Date().toUTCString());

    expect(result.abuseConfidenceScore).toBe(0);
    expect(result.isProxyOrVpn).toBe(false);
    expect(result.ipScore).toBe(0);
  });

  it('malformed API response: returns safe fallback without throwing', async () => {
    process.env.ABUSEIPDB_API_KEY = 'mock-api-key';

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ unexpectedKey: 'invalid' }),
    } as Response);

    const result = await scoreIpReputation('203.0.113.15', new Date().toUTCString());

    expect(result.abuseConfidenceScore).toBe(0);
    expect(result.isProxyOrVpn).toBe(false);
    expect(result.ipScore).toBe(0);
  });
});

describe('Helper functions', () => {
  it('getTimezoneDiscrepancyHours returns 0 without measuring email age', () => {
    // Verified: getTimezoneDiscrepancyHours returns 0 since no GeoIP geographic timezone context is supplied.
    const now = new Date().toUTCString();
    expect(getTimezoneDiscrepancyHours(now)).toBe(0);

    const pastDate = new Date(Date.now() - 10 * 3600 * 1000).toUTCString();
    expect(getTimezoneDiscrepancyHours(pastDate)).toBe(0);

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

    const score3 = calculateIpScore({
      abuseConfidenceScore: 40,
      isProxyOrVpn: true,
      timezoneDiscrepancyHours: 0,
    });
    // 40 + 30 = 70
    expect(score3).toBe(70);
  });
});

