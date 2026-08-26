import { isIP, isIPv4, isIPv6 } from 'node:net';
import type { IPReputationResult } from '@mailiac/shared-types';

/**
 * Helper to check if an IP string is a private, loopback, link-local, or reserved address.
 */
function isPrivateIp(ip: string | null | undefined): boolean {
  if (!ip || !isIP(ip)) return true;

  if (isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return true;

    // 0.0.0.0/8 (Current network)
    if (parts[0] === 0) return true;
    // 10.0.0.0/8 (Private network)
    if (parts[0] === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (Link-local)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 172.16.0.0/12 (Private network: 172.16.0.0 - 172.31.255.255)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16 (Private network)
    if (parts[0] === 192 && parts[1] === 168) return true;

    return false;
  } else if (isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    // Loopback (::1)
    if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;
    // Link-local (fe80::/10 - covers fe80, fe90, fea0, feb0)
    if (
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    ) {
      return true;
    }
    // Unique local (fc00::/7 - covers fc00::/8 and fd00::/8)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
      return true;
    }

    return false;
  }

  return true;
}

/**
 * Calculates timezone discrepancy in hours.
 *
 * NOTE: Per the PRD specification (docs/Backend_PRD_Team_Execution_Plan.md),
 * timezone discrepancy represents the difference between the email's Date header
 * timezone and the resolved IP location's geographic timezone.
 *
 * Currently, ip-reputation receives only `dateHeader` and `originatingSenderIp`
 * (without GeoIP geographic timezone data). Comparing against email age (Date.now())
 * or inventing an unmapped reference timezone (such as UTC or system time) is incorrect.
 * Until IP geographic timezone context is supplied to this function, this helper returns
 * 0 to avoid false-positive risk penalties.
 */
export function getTimezoneDiscrepancyHours(dateHeaderStr: string): number {
  if (!dateHeaderStr) return 0;
  return 0;
}

/**
 * Calculates overall IP risk score (0-100) based on AbuseIPDB score, proxy/VPN status, and timezone discrepancy.
 */
export function calculateIpScore(params: {
  abuseConfidenceScore: number;
  isProxyOrVpn: boolean;
  timezoneDiscrepancyHours: number;
}): number {
  let score = 0;

  // Abuse confidence score penalty (> 50 -> 100 pts)
  if (params.abuseConfidenceScore > 50) {
    score += 100;
  } else {
    score += params.abuseConfidenceScore;
  }

  // Proxy / VPN penalty (+30 pts)
  if (params.isProxyOrVpn) {
    score += 30;
  }

  // Timezone discrepancy penalty (> 4 hours -> +40 pts)
  if (params.timezoneDiscrepancyHours > 4) {
    score += 40;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Scores IP reputation by querying AbuseIPDB (or fallback) and evaluating proxy/timezone discrepancies.
 *
 * @param originatingSenderIp IP address string of the originating sender (or null/missing)
 * @param dateHeader Date header string from the EML
 * @returns Promise<IPReputationResult>
 */
export async function scoreIpReputation(
  originatingSenderIp: string | null,
  dateHeader: string
): Promise<IPReputationResult> {
  const timezoneDiscrepancyHours = getTimezoneDiscrepancyHours(dateHeader);

  // Return default safe score for missing/invalid or private IPs
  if (!originatingSenderIp || isPrivateIp(originatingSenderIp)) {
    return {
      abuseConfidenceScore: 0,
      isProxyOrVpn: false,
      timezoneDiscrepancyHours,
      ipScore: calculateIpScore({
        abuseConfidenceScore: 0,
        isProxyOrVpn: false,
        timezoneDiscrepancyHours,
      }),
    };
  }

  const apiKey = process.env.ABUSEIPDB_API_KEY;

  // If no API key configured, fallback safely without throwing
  if (!apiKey) {
    return {
      abuseConfidenceScore: 0,
      isProxyOrVpn: false,
      timezoneDiscrepancyHours,
      ipScore: calculateIpScore({
        abuseConfidenceScore: 0,
        isProxyOrVpn: false,
        timezoneDiscrepancyHours,
      }),
    };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), 3000);

    const url = `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(originatingSenderIp)}&verbose=true`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Key: apiKey,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`AbuseIPDB API returned status ${response.status}`);
    }

    const json = (await response.json()) as {
      data?: {
        abuseConfidenceScore?: number;
        usageType?: string;
        isTor?: boolean;
      };
    };

    const data = json && typeof json === 'object' && json.data ? json.data : {};
    const abuseConfidenceScore =
      typeof data.abuseConfidenceScore === 'number'
        ? Math.max(0, Math.min(100, data.abuseConfidenceScore))
        : 0;
    const isTor = Boolean(data.isTor);
    const usageType = (typeof data.usageType === 'string' ? data.usageType : '').toLowerCase();
    const isProxyOrVpn = isTor || usageType.includes('proxy') || usageType.includes('vpn') || usageType.includes('tor');

    const ipScore = calculateIpScore({
      abuseConfidenceScore,
      isProxyOrVpn,
      timezoneDiscrepancyHours,
    });

    return {
      abuseConfidenceScore,
      isProxyOrVpn,
      timezoneDiscrepancyHours,
      ipScore,
    };
  } catch (_err) {
    // Return fallback on network error/timeout/API failure/malformed response
    return {
      abuseConfidenceScore: 0,
      isProxyOrVpn: false,
      timezoneDiscrepancyHours,
      ipScore: calculateIpScore({
        abuseConfidenceScore: 0,
        isProxyOrVpn: false,
        timezoneDiscrepancyHours,
      }),
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

