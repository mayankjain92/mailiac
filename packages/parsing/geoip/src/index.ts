import { isIP, isIPv4, isIPv6 } from 'node:net';
import type { ForensicHop } from '@mailiac/shared-types';

const DEFAULT_TIMEOUT_MS = 3000;

interface GeoIpResponse {
  status?: string;
  message?: string;
  country?: string;
  city?: string;
  lat?: number;
  lon?: number;
  as?: string;
}

/**
 * Checks if an IP address is private / loopback / link-local.
 */
export function isPrivateOrLocalIp(ip: string): boolean {
  if (!ip || !isIP(ip)) return true;

  if (isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return true;

    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (Link-local)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0/8
    if (parts[0] === 0) return true;

    return false;
  } else if (isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    // Loopback
    if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
    // Link-local (fe80::/10)
    if (
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    ) {
      return true;
    }
    // Unique local (fc00::/7)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;

    return false;
  }

  return true;
}

/**
 * In-memory cache for IP Geo lookup promises to deduplicate in-flight and completed lookups.
 */
const geoLookupCache = new Map<string, Promise<Partial<ForensicHop>>>();

/**
 * Clears the internal GeoIP lookup cache (primarily for tests).
 */
export function clearGeoCache(): void {
  geoLookupCache.clear();
}

/**
 * Fetches GeoIP information for a single public IP with timeout and fallback.
 */
async function fetchGeoForIpInternal(
  ip: string,
  timeoutMs: number
): Promise<Partial<ForensicHop>> {
  const apiKey = process.env['GEOIP_API_KEY'];
  const url = apiKey
    ? `http://pro.ip-api.com/json/${encodeURIComponent(ip)}?key=${encodeURIComponent(apiKey)}&fields=status,message,country,city,lat,lon,as`
    : `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,city,lat,lon,as`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    clearTimeout(timer);

    if (!response.ok) {
      // Non-200 response (e.g. 429 Rate Limit, 500 Server Error) -> graceful fallback
      return {};
    }

    const data = (await response.json()) as GeoIpResponse;

    if (data.status === 'success') {
      return {
        city: data.city || undefined,
        country: data.country || undefined,
        coordinates:
          typeof data.lat === 'number' && typeof data.lon === 'number'
            ? [data.lat, data.lon]
            : undefined,
        asn: data.as || undefined,
      };
    }

    return {};
  } catch {
    // Network error, DNS resolution error, or request timeout -> graceful fallback
    return {};
  }
}

function fetchGeoForIp(
  ip: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Partial<ForensicHop>> {
  if (geoLookupCache.has(ip)) {
    return geoLookupCache.get(ip)!;
  }

  const lookupPromise = fetchGeoForIpInternal(ip, timeoutMs);
  geoLookupCache.set(ip, lookupPromise);
  return lookupPromise;
}

/**
 * Enriches an array of ForensicHop items with GeoIP data (city, country, coordinates, ASN).
 * - Skips private/local/loopback IPs.
 * - Caches lookups across duplicate IPs (including concurrent lookups).
 * - Enforces timeout with graceful fallback on any network/API failure.
 */
export async function enrichHopsWithGeo(
  hops: ForensicHop[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<ForensicHop[]> {
  if (!Array.isArray(hops) || hops.length === 0) {
    return [];
  }

  const enrichedHops = await Promise.all(
    hops.map(async (hop): Promise<ForensicHop> => {
      // If hop is private or invalid, do not perform GeoIP lookup
      if (hop.isPrivate || isPrivateOrLocalIp(hop.ip)) {
        return {
          ...hop,
          isPrivate: true,
        };
      }

      const geoData = await fetchGeoForIp(hop.ip, timeoutMs);

      return {
        ...hop,
        ...(geoData.city ? { city: geoData.city } : {}),
        ...(geoData.country ? { country: geoData.country } : {}),
        ...(geoData.coordinates ? { coordinates: geoData.coordinates } : {}),
        ...(geoData.asn ? { asn: geoData.asn } : {}),
      };
    })
  );

  return enrichedHops;
}
