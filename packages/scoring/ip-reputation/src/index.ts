import { isIP, isIPv4, isIPv6 } from 'node:net';
import type { IPReputationResult, Finding } from '@mailiac/shared-types';

/**
 * Options for scoring IP reputation, allowing optional enriched context.
 */
export interface ScoreIpOptions {
  geoTimezoneOffsetHours?: number | null;
  geoTimezone?: string | null;
  geoCoordinates?: [number, number] | null;
  geoCountry?: string | null;
  geoAsn?: string | null;
  ptrValid?: boolean | null;
  claimedHostname?: string | null;
  timeoutMs?: number;
}

/**
 * Internal infrastructure classification result.
 */
export interface InfrastructureInfo {
  category: 'residential' | 'datacenter' | 'vpn_proxy' | 'tor' | 'known_esp' | 'unknown';
  isTor: boolean;
  isProxyOrVpn: boolean;
  isDatacenter: boolean;
  isKnownEsp: boolean;
  espName?: string;
  isp?: string;
  usageType?: string;
}

/**
 * Cache entry for in-memory IP reputation cache.
 */
interface CacheEntry {
  result: IPReputationResult;
  expiresAt: number;
}

const SUCCESS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour for valid responses
const FAILURE_CACHE_TTL_MS = 30 * 1000; // 30 seconds for transient failures/fallbacks

const reputationCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<IPReputationResult>>();

/**
 * Clears the internal reputation cache and active in-flight requests (for test isolation).
 */
export function clearIpReputationCache(): void {
  reputationCache.clear();
  inFlightRequests.clear();
}

/**
 * Checks if an IP string is a private, loopback, link-local, carrier-grade NAT, or reserved address.
 */
export function isPrivateIp(ip: string | null | undefined): boolean {
  if (!ip || typeof ip !== 'string') return true;
  const trimmed = ip.trim();
  if (!isIP(trimmed)) return true;

  if (isIPv4(trimmed)) {
    const parts = trimmed.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true;

    // 0.0.0.0/8 (Current network)
    if (parts[0] === 0) return true;
    // 10.0.0.0/8 (Private network)
    if (parts[0] === 10) return true;
    // 100.64.0.0/10 (Carrier-grade NAT: 100.64.0.0 - 100.127.255.255)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (Link-local)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 172.16.0.0/12 (Private network: 172.16.0.0 - 172.31.255.255)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) return true;
    // 192.168.0.0/16 (Private network)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 198.18.0.0/15 (Benchmarking)
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
    // 224.0.0.0/4 (Multicast)
    if (parts[0] >= 224 && parts[0] <= 239) return true;
    // 240.0.0.0/4 (Reserved)
    if (parts[0] >= 240) return true;

    return false;
  } else if (isIPv6(trimmed)) {
    const normalized = trimmed.toLowerCase();
    // Loopback (::1 or 0:0:0:0:0:0:0:1)
    if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1' || /^0*(:0*)*:1$/.test(normalized)) return true;
    // Unspecified (::)
    if (normalized === '::' || /^0*(:0*)*:0*$/.test(normalized)) return true;
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
    // IPv4-mapped IPv6 (::ffff:192.0.2.128)
    if (normalized.startsWith('::ffff:')) {
      const v4Part = normalized.slice(7);
      return isIPv4(v4Part) ? isPrivateIp(v4Part) : true;
    }

    return false;
  }

  return true;
}

/**
 * Standard conservative timezone abbreviation offset map in hours.
 */
const TIMEZONE_ABBREV_OFFSETS: Record<string, number> = {
  UTC: 0,
  GMT: 0,
  Z: 0,
  EST: -5,
  EDT: -4,
  CST: -6,
  CDT: -5,
  MST: -7,
  MDT: -6,
  PST: -8,
  PDT: -7,
  AKST: -9,
  AKDT: -8,
  HST: -10,
  WET: 0,
  WEST: 1,
  CET: 1,
  CEST: 2,
  EET: 2,
  EEST: 3,
  MSK: 3,
  IST: 5.5,
  JST: 9,
  KST: 9,
  AEST: 10,
  AEDT: 11,
  ACST: 9.5,
  ACDT: 10.5,
  AWST: 8,
  NZST: 12,
  NZDT: 13,
};

/**
 * Parses RFC 5322/2822 email Date header to extract the timezone offset in decimal hours.
 * Returns null if the timezone is missing, unparseable, or ambiguous.
 */
export function parseDateHeaderTimezoneOffset(dateStr: string): number | null {
  if (!dateStr || typeof dateStr !== 'string') return null;

  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // 1. Check for numeric timezone offset: [+-]HHMM (e.g. +0530, -0400, +0000)
  // Accommodates optional trailing comments like (EDT) or (UTC)
  const numericMatch = trimmed.match(/(?:^|\s)([+-])(\d{2})(\d{2})(?:\s*\([^)]*\))?\s*$/);
  if (numericMatch) {
    const sign = numericMatch[1] === '-' ? -1 : 1;
    const hours = parseInt(numericMatch[2], 10);
    const minutes = parseInt(numericMatch[3], 10);

    if (hours >= 0 && hours <= 14 && minutes >= 0 && minutes <= 59) {
      return sign * (hours + minutes / 60);
    }
  }

  // 2. Check for named timezone abbreviations at the end of the date string
  const namedMatch = trimmed.match(/(?:^|\s)([A-Za-z]{1,5})(?:\s*\([^)]*\))?\s*$/);
  if (namedMatch) {
    const abbrev = namedMatch[1].toUpperCase();
    if (Object.prototype.hasOwnProperty.call(TIMEZONE_ABBREV_OFFSETS, abbrev)) {
      return TIMEZONE_ABBREV_OFFSETS[abbrev];
    }
  }

  return null;
}

/**
 * Computes geographic timezone offset in hours from coordinates or longitude.
 */
export function estimateTimezoneOffsetFromCoordinates(coordinates?: [number, number] | null): number | null {
  if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lon = coordinates[1];
  if (typeof lon !== 'number' || isNaN(lon) || lon < -180 || lon > 180) return null;

  // Approx: 15 degrees longitude = 1 hour solar offset, rounded to nearest 0.5 hour
  return Math.round((lon / 15) * 2) / 2;
}

/**
 * Calculates timezone discrepancy in hours between the email Date header timezone and resolved GeoIP timezone.
 *
 * Requirements:
 * - Numeric offsets are authoritative.
 * - Missing/unknown timezone context returns 0 (no false discrepancies).
 * - Discrepancy accounts for circular global timezone distance.
 */
export function getTimezoneDiscrepancyHours(
  dateHeaderStr: string,
  geoOffsetHours?: number | null
): number {
  if (!dateHeaderStr || geoOffsetHours === undefined || geoOffsetHours === null || isNaN(geoOffsetHours)) {
    return 0;
  }

  const emailOffset = parseDateHeaderTimezoneOffset(dateHeaderStr);
  if (emailOffset === null) {
    return 0;
  }

  const rawDiff = Math.abs(emailOffset - geoOffsetHours);
  // Offsets span [-12, +14], circular distance across antimeridian:
  const circularDiff = Math.min(rawDiff, Math.abs(24 - rawDiff));

  return Math.round(circularDiff * 10) / 10;
}

/**
 * List of known Email Service Providers (ESPs) and legitimate cloud relays.
 */
const KNOWN_ESPS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'Google Workspace', pattern: /google(\.com|mail|cloud|usercontent)|gmail\.com|google llc/i },
  { name: 'Microsoft 365', pattern: /microsoft(\.com|corp|online)|outlook\.com|hotmail\.com|office365/i },
  { name: 'Amazon SES', pattern: /amazonses\.com|amazon(aws|\.com)|amazon technologies/i },
  { name: 'SendGrid', pattern: /sendgrid\.(com|net)|twilio/i },
  { name: 'Mailgun', pattern: /mailgun\.(org|net|com)|sinch/i },
  { name: 'Postmark', pattern: /postmarkapp\.com|wildbit|activecampaign/i },
  { name: 'Fastmail', pattern: /fastmail\.(com|fm)|messagingengine\.com/i },
  { name: 'Proton Mail', pattern: /proton(mail|\.me|\.ch)|proton ag/i },
  { name: 'Apple iCloud', pattern: /apple\.com|icloud\.com|apple inc/i },
  { name: 'Yahoo / AOL', pattern: /yahoo\.(com|net)|aol\.com|oath/i },
];

/**
 * Classifies network infrastructure based on AbuseIPDB / GeoIP signals.
 */
export function classifyInfrastructure(data: {
  usageType?: string | null;
  isp?: string | null;
  domain?: string | null;
  isTor?: boolean | null;
}): InfrastructureInfo {
  const usageType = (data.usageType || '').toLowerCase();
  const isp = (data.isp || '').toLowerCase();
  const domain = (data.domain || '').toLowerCase();
  const combinedInfo = `${usageType} ${isp} ${domain}`;

  const isTor = Boolean(data.isTor) || combinedInfo.includes('tor exit') || combinedInfo.includes('tor relay');

  // Check known ESPs first
  let isKnownEsp = false;
  let espName: string | undefined;
  for (const esp of KNOWN_ESPS) {
    if (esp.pattern.test(combinedInfo)) {
      isKnownEsp = true;
      espName = esp.name;
      break;
    }
  }

  const isProxyOrVpn = isTor || usageType.includes('proxy') || usageType.includes('vpn') || usageType.includes('tor');
  const isDatacenter =
    usageType.includes('data center') ||
    usageType.includes('datacenter') ||
    usageType.includes('web hosting') ||
    usageType.includes('transit') ||
    usageType.includes('hosting');

  let category: InfrastructureInfo['category'] = 'unknown';
  if (isTor) {
    category = 'tor';
  } else if (isKnownEsp) {
    category = 'known_esp';
  } else if (isProxyOrVpn) {
    category = 'vpn_proxy';
  } else if (isDatacenter) {
    category = 'datacenter';
  } else if (usageType.includes('commercial') || usageType.includes('fixed line') || usageType.includes('isp')) {
    category = 'residential';
  }

  return {
    category,
    isTor,
    isProxyOrVpn,
    isDatacenter,
    isKnownEsp,
    espName,
    isp: data.isp || undefined,
    usageType: data.usageType || undefined,
  };
}

/**
 * Calculates a calibrated, monotonic IP risk score (0-100).
 *
 * Scoring Model:
 * 1. Base Abuse Reputation (Piecewise Continuous Monotonic Curve):
 *    - 0% -> 0 pts
 *    - 1-25% -> abuseScore * 0.4 (max 10 pts)
 *    - 26-75% -> 10 + (abuseScore - 25) * 0.8 (max 50 pts)
 *    - 76-100% -> 50 + (abuseScore - 75) * 1.6 (max 90 pts at 100%)
 * 2. Infrastructure Evidence:
 *    - Confirmed Tor Exit Node -> +35 pts (strong attack infrastructure)
 *    - Non-Tor VPN/Proxy -> +15 pts
 *    - Generic Datacenter (unverified, non-ESP) -> +10 pts
 *    - Suspicious Datacenter (Datacenter + AbuseScore > 20) -> +10 pts corroboration
 * 3. Network Anomaly & Timezone Evidence:
 *    - Timezone mismatch (4 - 8h) -> +10 pts
 *    - Large timezone discrepancy (> 8h) -> +15 pts
 * 4. Reverse DNS (PTR) Corroboration:
 *    - PTR invalid / unverified -> +10 pts
 * 5. Bounded Clamping: strictly [0, 100]
 */
export function calculateIpScore(params: {
  abuseConfidenceScore: number;
  isTor?: boolean;
  isProxyOrVpn?: boolean;
  isDatacenter?: boolean;
  isKnownEsp?: boolean;
  timezoneDiscrepancyHours: number;
  ptrValid?: boolean | null;
}): number {
  let score = 0;
  const abuse = Math.max(0, Math.min(100, params.abuseConfidenceScore || 0));

  // 1. Base Abuse Reputation (Piecewise Smooth Curve)
  if (abuse > 75) {
    score += 50 + (abuse - 75) * 1.6;
  } else if (abuse > 25) {
    score += 10 + (abuse - 25) * 0.8;
  } else if (abuse > 0) {
    score += abuse * 0.4;
  }

  // 2. Infrastructure Evidence
  if (params.isTor) {
    score += 35;
  } else if (params.isProxyOrVpn) {
    score += 15;
  }

  // Datacenter handling: known ESP suppresses ONLY the generic datacenter penalty
  if (params.isDatacenter && !params.isKnownEsp) {
    score += 10;
    if (abuse > 20) {
      score += 10; // Corroborated suspicious hosting
    }
  }

  // 3. Timezone Discrepancy Evidence (Conservative)
  if (params.timezoneDiscrepancyHours > 8) {
    score += 15;
  } else if (params.timezoneDiscrepancyHours >= 4) {
    score += 10;
  }

  // 4. Reverse DNS (PTR) Corroboration
  if (params.ptrValid === false) {
    score += 10;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

/**
 * Generates structured, explainable findings based on IP and infrastructure evidence.
 */
export function generateIpFindings(params: {
  abuseConfidenceScore: number;
  infra: InfrastructureInfo;
  timezoneDiscrepancyHours: number;
  isPrivate: boolean;
  lookupUnavailable?: boolean;
  ptrValid?: boolean | null;
}): Finding[] {
  const findings: Finding[] = [];

  if (params.isPrivate) {
    findings.push({
      type: 'PRIVATE_IP',
      severity: 'INFO',
      description: 'Originating IP is a private, loopback, or reserved address',
    });
    return findings;
  }

  if (params.lookupUnavailable) {
    findings.push({
      type: 'REPUTATION_LOOKUP_UNAVAILABLE',
      severity: 'INFO',
      description: 'AbuseIPDB reputation lookup unavailable (fallback applied)',
    });
  } else if (params.abuseConfidenceScore > 0) {
    const severity: Finding['severity'] =
      params.abuseConfidenceScore > 75 ? 'HIGH' : params.abuseConfidenceScore > 25 ? 'MEDIUM' : 'LOW';
    findings.push({
      type: 'ABUSE_REPUTATION',
      severity,
      description: `IP has an AbuseIPDB confidence score of ${params.abuseConfidenceScore}%`,
    });
  }

  // Tor detection
  if (params.infra.isTor) {
    findings.push({
      type: 'TOR_EXIT_NODE_DETECTED',
      severity: 'HIGH',
      description: 'Originating IP is an identified Tor exit node',
    });
  } else if (params.infra.isProxyOrVpn) {
    findings.push({
      type: 'PROXY_VPN_DETECTED',
      severity: 'MEDIUM',
      description: 'IP is identified as a VPN or commercial proxy service',
    });
  }

  // Infrastructure findings
  if (params.infra.isKnownEsp && params.infra.espName) {
    findings.push({
      type: 'KNOWN_EMAIL_SERVICE_PROVIDER',
      severity: 'INFO',
      description: `IP belongs to recognized email infrastructure (${params.infra.espName})`,
    });
  } else if (params.infra.isDatacenter) {
    if (params.abuseConfidenceScore > 20) {
      findings.push({
        type: 'SUSPICIOUS_HOSTING_INFRASTRUCTURE',
        severity: 'MEDIUM',
        description: 'Originating IP is hosted on cloud/datacenter infrastructure with abuse reports',
      });
    } else {
      findings.push({
        type: 'DATACENTER_ORIGIN',
        severity: 'LOW',
        description: 'Originating IP is hosted in a cloud datacenter / VPS network',
      });
    }
  }

  // Timezone findings
  if (params.timezoneDiscrepancyHours > 8) {
    findings.push({
      type: 'LARGE_TIMEZONE_DISCREPANCY',
      severity: 'MEDIUM',
      description: `Large timezone discrepancy detected (${params.timezoneDiscrepancyHours} hours between IP location and Date header)`,
    });
  } else if (params.timezoneDiscrepancyHours >= 4) {
    findings.push({
      type: 'TIMEZONE_MISMATCH',
      severity: 'LOW',
      description: `IP geolocation timezone differs from email Date header by ${params.timezoneDiscrepancyHours} hours`,
    });
  }

  // PTR findings
  if (params.ptrValid === false) {
    findings.push({
      type: 'PTR_RECORD_ANOMALY',
      severity: 'LOW',
      description: 'Reverse DNS (PTR) validation failed or did not match claimed sender hostname',
    });
  }

  // Verified Clean IP finding (only if lookup was performed and clean)
  if (!params.lookupUnavailable && findings.length === 0) {
    findings.push({
      type: 'CLEAN_IP',
      severity: 'INFO',
      description: 'No significant IP reputation risks detected',
    });
  }

  return findings;
}

/**
 * Scores IP reputation by querying AbuseIPDB (with in-memory TTL caching and request deduplication),
 * classifying infrastructure, and evaluating timezone and PTR anomalies.
 *
 * @param originatingSenderIp IP address string of the originating sender (or null/missing)
 * @param dateHeader Date header string from the EML
 * @param options Optional context (GeoIP offsets, ASN, PTR validation status)
 * @returns Promise<IPReputationResult>
 */
export async function scoreIpReputation(
  originatingSenderIp: string | null,
  dateHeader: string,
  options?: ScoreIpOptions
): Promise<IPReputationResult> {
  const geoOffset =
    options?.geoTimezoneOffsetHours ??
    estimateTimezoneOffsetFromCoordinates(options?.geoCoordinates);

  const timezoneDiscrepancyHours = getTimezoneDiscrepancyHours(dateHeader, geoOffset);

  // Return default safe score for missing/invalid or private IPs
  if (!originatingSenderIp || isPrivateIp(originatingSenderIp)) {
    const emptyInfra = classifyInfrastructure({});
    return {
      abuseConfidenceScore: 0,
      isProxyOrVpn: false,
      timezoneDiscrepancyHours,
      ipScore: calculateIpScore({
        abuseConfidenceScore: 0,
        timezoneDiscrepancyHours,
      }),
      findings: generateIpFindings({
        abuseConfidenceScore: 0,
        infra: emptyInfra,
        timezoneDiscrepancyHours,
        isPrivate: true,
      }),
    };
  }

  const normalizedIp = originatingSenderIp.trim();

  // Check in-memory cache
  const cached = reputationCache.get(normalizedIp);
  if (cached && cached.expiresAt > Date.now()) {
    // Return cached result with current call's timezone & PTR evaluation
    const ipScore = calculateIpScore({
      abuseConfidenceScore: cached.result.abuseConfidenceScore,
      isProxyOrVpn: cached.result.isProxyOrVpn,
      timezoneDiscrepancyHours,
      ptrValid: options?.ptrValid,
    });
    return {
      ...cached.result,
      timezoneDiscrepancyHours,
      ipScore,
    };
  }

  // Deduplicate concurrent in-flight requests for the same IP
  if (inFlightRequests.has(normalizedIp)) {
    const sharedResult = await inFlightRequests.get(normalizedIp)!;
    return {
      ...sharedResult,
      timezoneDiscrepancyHours,
      ipScore: calculateIpScore({
        abuseConfidenceScore: sharedResult.abuseConfidenceScore,
        isProxyOrVpn: sharedResult.isProxyOrVpn,
        timezoneDiscrepancyHours,
        ptrValid: options?.ptrValid,
      }),
    };
  }

  const lookupPromise = (async (): Promise<IPReputationResult> => {
    const apiKey = process.env.ABUSEIPDB_API_KEY;

    // If no API key configured, return explicit unavailable state (do NOT mark clean)
    if (!apiKey) {
      const fallbackInfra = classifyInfrastructure({
        usageType: options?.geoAsn,
        isp: options?.geoAsn,
      });
      const ipScore = calculateIpScore({
        abuseConfidenceScore: 0,
        isProxyOrVpn: fallbackInfra.isProxyOrVpn,
        isDatacenter: fallbackInfra.isDatacenter,
        isKnownEsp: fallbackInfra.isKnownEsp,
        timezoneDiscrepancyHours,
        ptrValid: options?.ptrValid,
      });
      const result: IPReputationResult = {
        abuseConfidenceScore: 0,
        isProxyOrVpn: fallbackInfra.isProxyOrVpn,
        timezoneDiscrepancyHours,
        ipScore,
        findings: generateIpFindings({
          abuseConfidenceScore: 0,
          infra: fallbackInfra,
          timezoneDiscrepancyHours,
          isPrivate: false,
          lookupUnavailable: true,
          ptrValid: options?.ptrValid,
        }),
      };
      reputationCache.set(normalizedIp, {
        result,
        expiresAt: Date.now() + FAILURE_CACHE_TTL_MS,
      });
      return result;
    }

    const timeoutMs = options?.timeoutMs ?? 3000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), timeoutMs);

      const url = `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(normalizedIp)}&verbose=true`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Key: apiKey,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`AbuseIPDB API error HTTP ${response.status}`);
      }

      const json = (await response.json()) as {
        data?: {
          abuseConfidenceScore?: number;
          usageType?: string;
          isp?: string;
          domain?: string;
          isTor?: boolean;
        };
      };

      const data = json && typeof json === 'object' && json.data ? json.data : {};
      const abuseConfidenceScore =
        typeof data.abuseConfidenceScore === 'number'
          ? Math.max(0, Math.min(100, data.abuseConfidenceScore))
          : 0;

      const infra = classifyInfrastructure({
        usageType: data.usageType || options?.geoAsn,
        isp: data.isp || options?.geoAsn,
        domain: data.domain,
        isTor: data.isTor,
      });

      const ipScore = calculateIpScore({
        abuseConfidenceScore,
        isTor: infra.isTor,
        isProxyOrVpn: infra.isProxyOrVpn,
        isDatacenter: infra.isDatacenter,
        isKnownEsp: infra.isKnownEsp,
        timezoneDiscrepancyHours,
        ptrValid: options?.ptrValid,
      });

      const result: IPReputationResult = {
        abuseConfidenceScore,
        isProxyOrVpn: infra.isProxyOrVpn,
        timezoneDiscrepancyHours,
        ipScore,
        findings: generateIpFindings({
          abuseConfidenceScore,
          infra,
          timezoneDiscrepancyHours,
          isPrivate: false,
          lookupUnavailable: false,
          ptrValid: options?.ptrValid,
        }),
      };

      reputationCache.set(normalizedIp, {
        result,
        expiresAt: Date.now() + SUCCESS_CACHE_TTL_MS,
      });
      return result;
    } catch (_err) {
      // Graceful fallback on network error/timeout/API failure
      const fallbackInfra = classifyInfrastructure({
        usageType: options?.geoAsn,
        isp: options?.geoAsn,
      });
      const ipScore = calculateIpScore({
        abuseConfidenceScore: 0,
        isProxyOrVpn: fallbackInfra.isProxyOrVpn,
        isDatacenter: fallbackInfra.isDatacenter,
        isKnownEsp: fallbackInfra.isKnownEsp,
        timezoneDiscrepancyHours,
        ptrValid: options?.ptrValid,
      });
      const fallbackResult: IPReputationResult = {
        abuseConfidenceScore: 0,
        isProxyOrVpn: fallbackInfra.isProxyOrVpn,
        timezoneDiscrepancyHours,
        ipScore,
        findings: generateIpFindings({
          abuseConfidenceScore: 0,
          infra: fallbackInfra,
          timezoneDiscrepancyHours,
          isPrivate: false,
          lookupUnavailable: true,
          ptrValid: options?.ptrValid,
        }),
      };
      reputationCache.set(normalizedIp, {
        result: fallbackResult,
        expiresAt: Date.now() + FAILURE_CACHE_TTL_MS,
      });
      return fallbackResult;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
      inFlightRequests.delete(normalizedIp);
    }
  })();

  inFlightRequests.set(normalizedIp, lookupPromise);
  return lookupPromise;
}


