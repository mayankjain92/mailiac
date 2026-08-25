import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ForensicHop } from '@mailiac/shared-types';
import {
  enrichHopsWithGeo,
  isPrivateOrLocalIp,
  clearGeoCache,
} from '../src/index.js';

describe('GeoIP Hop Enrichment (@mailiac/parsing-geoip)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    clearGeoCache();
    process.env = { ...originalEnv };
    delete process.env['GEOIP_API_KEY'];
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('isPrivateOrLocalIp', () => {
    it('identifies private and loopback IPv4 addresses', () => {
      expect(isPrivateOrLocalIp('10.0.0.1')).toBe(true);
      expect(isPrivateOrLocalIp('172.16.0.1')).toBe(true);
      expect(isPrivateOrLocalIp('172.31.255.255')).toBe(true);
      expect(isPrivateOrLocalIp('192.168.1.1')).toBe(true);
      expect(isPrivateOrLocalIp('127.0.0.1')).toBe(true);
      expect(isPrivateOrLocalIp('169.254.1.1')).toBe(true);
      expect(isPrivateOrLocalIp('0.0.0.0')).toBe(true);
    });

    it('identifies public IPv4 addresses', () => {
      expect(isPrivateOrLocalIp('8.8.8.8')).toBe(false);
      expect(isPrivateOrLocalIp('209.85.220.41')).toBe(false);
      expect(isPrivateOrLocalIp('1.1.1.1')).toBe(false);
    });

    it('identifies private and local IPv6 addresses', () => {
      expect(isPrivateOrLocalIp('::1')).toBe(true);
      expect(isPrivateOrLocalIp('fe80::1')).toBe(true);
      expect(isPrivateOrLocalIp('fc00::1')).toBe(true);
      expect(isPrivateOrLocalIp('fd12:3456::1')).toBe(true);
    });

    it('identifies public IPv6 addresses', () => {
      expect(isPrivateOrLocalIp('2001:4860:4860::8888')).toBe(false);
    });
  });

  describe('Happy Path: enrichHopsWithGeo', () => {
    it('enriches public hops with city, country, coordinates, and ASN', async () => {
      const mockHops: ForensicHop[] = [
        {
          ip: '209.85.220.41',
          hostnameClaimed: 'mail.google.com',
          ptrValid: true,
          isPrivate: false,
          trusted: true,
        },
      ];

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'success',
          country: 'United States',
          city: 'Mountain View',
          lat: 37.4223,
          lon: -122.0847,
          as: 'AS15169 Google LLC',
        }),
      } as Response);

      const result = await enrichHopsWithGeo(mockHops);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        ip: '209.85.220.41',
        hostnameClaimed: 'mail.google.com',
        ptrValid: true,
        isPrivate: false,
        trusted: true,
        city: 'Mountain View',
        country: 'United States',
        coordinates: [37.4223, -122.0847],
        asn: 'AS15169 Google LLC',
      });
    });

    it('uses pro API endpoint when GEOIP_API_KEY is provided in environment', async () => {
      process.env['GEOIP_API_KEY'] = 'test-secret-key-123';

      const mockHops: ForensicHop[] = [
        {
          ip: '198.51.100.5',
          ptrValid: false,
          isPrivate: false,
          trusted: false,
        },
      ];

      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'success',
          country: 'Canada',
          city: 'Toronto',
          lat: 43.6532,
          lon: -79.3832,
          as: 'AS12345 Test ISP',
        }),
      } as Response);

      const result = await enrichHopsWithGeo(mockHops);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('http://pro.ip-api.com/json/198.51.100.5?key=test-secret-key-123'),
        expect.any(Object)
      );
      expect(result[0].country).toBe('Canada');
    });
  });

  describe('Private Hop Handling', () => {
    it('skips GeoIP lookups for private/local hops and does not call fetch', async () => {
      const mockHops: ForensicHop[] = [
        {
          ip: '10.0.0.5',
          ptrValid: false,
          isPrivate: true,
          trusted: false,
        },
        {
          ip: '192.168.1.100',
          ptrValid: false,
          isPrivate: false, // will be corrected to isPrivate: true
          trusted: false,
        },
      ];

      const fetchSpy = vi.spyOn(global, 'fetch');

      const result = await enrichHopsWithGeo(mockHops);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result[0].isPrivate).toBe(true);
      expect(result[0].city).toBeUndefined();
      expect(result[1].isPrivate).toBe(true);
      expect(result[1].city).toBeUndefined();
    });
  });

  describe('Fault Tolerance & Fallbacks (Rule: Flaky calls must not crash)', () => {
    it('gracefully handles HTTP errors (e.g. 429 Rate Limit) without throwing', async () => {
      const mockHops: ForensicHop[] = [
        {
          ip: '203.0.113.50',
          ptrValid: true,
          isPrivate: false,
          trusted: true,
        },
      ];

      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      } as Response);

      const result = await enrichHopsWithGeo(mockHops);

      expect(result).toHaveLength(1);
      expect(result[0].ip).toBe('203.0.113.50');
      expect(result[0].city).toBeUndefined();
      expect(result[0].country).toBeUndefined();
    });

    it('gracefully handles network exceptions and timeouts without throwing', async () => {
      const mockHops: ForensicHop[] = [
        {
          ip: '203.0.113.60',
          ptrValid: true,
          isPrivate: false,
          trusted: true,
        },
      ];

      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Connection timed out'));

      const result = await enrichHopsWithGeo(mockHops, 50);

      expect(result).toHaveLength(1);
      expect(result[0].ip).toBe('203.0.113.60');
      expect(result[0].city).toBeUndefined();
    });
  });

  describe('In-Memory Caching', () => {
    it('deduplicates lookups for identical IPs across multiple hops', async () => {
      const mockHops: ForensicHop[] = [
        {
          ip: '209.85.220.41',
          ptrValid: true,
          isPrivate: false,
          trusted: true,
        },
        {
          ip: '209.85.220.41',
          ptrValid: true,
          isPrivate: false,
          trusted: true,
        },
      ];

      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'success',
          country: 'United States',
          city: 'Mountain View',
          lat: 37.4223,
          lon: -122.0847,
          as: 'AS15169 Google LLC',
        }),
      } as Response);

      const result = await enrichHopsWithGeo(mockHops);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result[0].city).toBe('Mountain View');
      expect(result[1].city).toBe('Mountain View');
    });
  });

  describe('Edge Cases', () => {
    it('returns empty array when given an empty hops list', async () => {
      const result = await enrichHopsWithGeo([]);
      expect(result).toEqual([]);
    });

    it('handles null / undefined / non-array input gracefully', async () => {
      // @ts-expect-error Testing invalid runtime input
      expect(await enrichHopsWithGeo(null)).toEqual([]);
      // @ts-expect-error Testing invalid runtime input
      expect(await enrichHopsWithGeo(undefined)).toEqual([]);
    });
  });
});
