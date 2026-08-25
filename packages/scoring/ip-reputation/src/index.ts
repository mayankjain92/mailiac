import type { IPReputationResult } from '@mailiac/shared-types';

/**
 * Helper to check if an IP string is a private/reserved address.
 */
function isPrivateIp(ip: string): boolean {
  if (!ip) return true;

  if (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('10.') ||
    ip.startsWith('172.16.') ||
    ip.startsWith('172.17.') ||
    ip.startsWith('172.18.') ||
    ip.startsWith('172.19.') ||
    ip.startsWith('172.20.') ||
    ip.startsWith('172.21.') ||
    ip.startsWith('172.22.') ||
    ip.startsWith('172.23.') ||
    ip.startsWith('172.24.') ||
    ip.startsWith('172.25.') ||
    ip.startsWith('172.26.') ||
    ip.startsWith('172.27.') ||
    ip.startsWith('172.28.') ||
    ip.startsWith('172.29.') ||
    ip.startsWith('172.30.') ||
    ip.startsWith('172.31.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('fc00:') ||
    ip.startsWith('fd00:') ||
    ip.startsWith('fe80:')
  ) {
    return true;
  }

  return false;
}

/**
 * Calculates absolute timezone discrepancy in hours between the EML Date header and current time.
 */
export function getTimezoneDiscrepancyHours(dateHeaderStr: string): number {
  if (!dateHeaderStr) return 0;

  const headerTime = Date.parse(dateHeaderStr);
  if (isNaN(headerTime)) return 0;

  const now = Date.now();
  const diffHours = Math.abs(now - headerTime) / (1000 * 60 * 60);
  return Number(diffHours.toFixed(2));
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
 * @param originatingSenderIp IP address string of the originating sender
 * @param dateHeader Date header string from the EML
 * @returns Promise<IPReputationResult>
 */
export async function scoreIpReputation(
  originatingSenderIp: string,
  dateHeader: string
): Promise<IPReputationResult> {
  const timezoneDiscrepancyHours = getTimezoneDiscrepancyHours(dateHeader);

  // Return default safe score for missing/invalid or private IPs
  if (!originatingSenderIp || isPrivateIp(originatingSenderIp)) {
    const fallback: IPReputationResult = {
      abuseConfidenceScore: 0,
      isProxyOrVpn: false,
      timezoneDiscrepancyHours,
      ipScore: calculateIpScore({
        abuseConfidenceScore: 0,
        isProxyOrVpn: false,
        timezoneDiscrepancyHours,
      }),
    };
    return fallback;
  }

  const apiKey = process.env.ABUSEIPDB_API_KEY;

  // If no API key configured, fallback safely without throwing
  if (!apiKey) {
    const fallback: IPReputationResult = {
      abuseConfidenceScore: 0,
      isProxyOrVpn: false,
      timezoneDiscrepancyHours,
      ipScore: calculateIpScore({
        abuseConfidenceScore: 0,
        isProxyOrVpn: false,
        timezoneDiscrepancyHours,
      }),
    };
    return fallback;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);

    const url = `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(originatingSenderIp)}&verbose=true`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Key: apiKey,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timer);

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

    const data = json.data || {};
    const abuseConfidenceScore = typeof data.abuseConfidenceScore === 'number' ? data.abuseConfidenceScore : 0;
    const isTor = Boolean(data.isTor);
    const usageType = (data.usageType || '').toLowerCase();
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
    // Return fallback on network error/timeout/API failure
    const fallback: IPReputationResult = {
      abuseConfidenceScore: 0,
      isProxyOrVpn: false,
      timezoneDiscrepancyHours,
      ipScore: calculateIpScore({
        abuseConfidenceScore: 0,
        isProxyOrVpn: false,
        timezoneDiscrepancyHours,
      }),
    };
    return fallback;
  }
}
