import { parse } from 'tldts';
import type { Finding } from '@mailiac/shared-types';

export type DomainAgeClassification =
  | 'VERY_NEW'
  | 'NEWLY_REGISTERED'
  | 'RECENT'
  | 'ESTABLISHED'
  | 'UNKNOWN';

export interface DomainRegistrationInfo {
  createdAt?: string;
  expiresAt?: string;
  lastChangedAt?: string;
}

export interface DomainRegistrarInfo {
  name?: string;
  handle?: string;
  ianaId?: string;
  isPrivacyProtected?: boolean;
}

export interface DomainRdapInfo {
  available: boolean;
  source?: string;
  fetchedAt: string;
  error?: string;
  httpStatus?: number;
}

export interface DomainAgeInfo {
  ageDays: number;
  classification: DomainAgeClassification;
}

export interface DomainIntelligence {
  domain: string;
  registrableDomain: string;
  registration?: DomainRegistrationInfo;
  registrar?: DomainRegistrarInfo;
  rdap: DomainRdapInfo;
  age?: DomainAgeInfo;
  findings: Finding[];
}

export interface QueryRdapOptions {
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  nowMs?: number;
  enabled?: boolean;
}

/**
 * Standard authoritative RDAP endpoints for popular top-level domains.
 * Avoids extra redirects for common domains while rdap.org acts as universal router.
 */
const TLD_RDAP_SERVERS: Record<string, string> = {
  com: 'https://rdap.verisign.com/com/v1/domain/',
  net: 'https://rdap.verisign.com/net/v1/domain/',
  org: 'https://rdap.publicinterestregistry.org/rdap/domain/',
  info: 'https://rdap.identitydigital.services/rdap/domain/',
  biz: 'https://rdap.identitydigital.services/rdap/domain/',
  mobi: 'https://rdap.identitydigital.services/rdap/domain/',
  pro: 'https://rdap.identitydigital.services/rdap/domain/',
  io: 'https://rdap.nic.io/domain/',
  co: 'https://rdap.nic.co/domain/',
  me: 'https://rdap.identitydigital.services/rdap/domain/',
  us: 'https://rdap.nic.us/domain/',
  ca: 'https://rdap.ca.fury.ca/rdap/domain/',
  uk: 'https://rdap.nominet.uk/domain/',
  dev: 'https://rdap.nic.google/domain/',
  app: 'https://rdap.nic.google/domain/',
  page: 'https://rdap.nic.google/domain/',
  in: 'https://registry.in/rdap/domain/',
  br: 'https://rdap.registro.br/domain/',
  nl: 'https://rdap.sidn.nl/domain/',
  se: 'https://rdap.iis.se/domain/',
  nu: 'https://rdap.iis.nu/domain/',
  fr: 'https://rdap.afnic.fr/domain/',
  de: 'https://rdap.denic.de/domain/',
  eu: 'https://rdap.eurid.eu/domain/',
  ch: 'https://rdap.nic.ch/domain/',
};

// In-memory cache & request deduplication
interface CacheEntry {
  intelligence: DomainIntelligence;
  expiresAt: number;
}

const SUCCESS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours for successful lookups
const TRANSIENT_FAILURE_CACHE_TTL_MS = 60 * 1000; // 60 seconds for temporary errors/not-founds

const domainCache = new Map<string, CacheEntry>();
const inFlightLookups = new Map<string, Promise<DomainIntelligence>>();

/**
 * Resets the in-memory cache and in-flight map (for test isolation).
 */
export function clearDomainIntelligenceCache(): void {
  domainCache.clear();
  inFlightLookups.clear();
}

/**
 * Normalizes an input string (email address, hostname, or domain) to its registrable domain.
 * Example:
 * - "security@paypa1-login.example" -> "paypa1-login.example"
 * - "login.security.paypal.com" -> "paypal.com"
 * - "  PAYPAL.COM. " -> "paypal.com"
 * - "xn--e1afmkfd.xn--p1ai" -> punycode preserved / decoded
 */
export function extractRegistrableDomain(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;

  let cleaned = input.trim().toLowerCase();
  if (!cleaned) return null;

  // If email address, take the domain portion after '@'
  if (cleaned.includes('@')) {
    const atParts = cleaned.split('@');
    cleaned = atParts[atParts.length - 1]?.trim() || '';
  }

  // Strip trailing dot(s) and whitespace
  cleaned = cleaned.replace(/\.+$/, '').trim();

  // Strip protocol prefix if accidentally passed
  cleaned = cleaned.replace(/^https?:\/\//, '').split('/')[0] || '';

  // Strip port if present
  cleaned = cleaned.split(':')[0] || '';

  if (!cleaned) return null;

  const parsed = parse(cleaned);

  // If tldts identifies a registrable domain, use it
  if (parsed.domain) {
    return parsed.domain.toLowerCase().trim();
  }

  // Fallback for valid hostname without public suffix recognized
  if (parsed.hostname && parsed.hostname.includes('.') && !parsed.isIp) {
    return parsed.hostname.toLowerCase().trim();
  }

  return null;
}

/**
 * Identifies whether a string is a private/local/invalid domain target for RDAP.
 */
export function isInvalidRdapTarget(domain: string | null | undefined): boolean {
  if (!domain || typeof domain !== 'string') return true;
  const d = domain.trim().toLowerCase();
  if (!d || d.length < 3 || !d.includes('.')) return true;

  // Local/reserved pseudo-TLDs
  const reservedTlds = ['.local', '.internal', '.corp', '.lan', '.test', '.example', '.invalid', '.localhost'];
  if (reservedTlds.some((tld) => d.endsWith(tld))) return true;

  return false;
}

/**
 * Resolves the candidate RDAP endpoint for a registrable domain.
 */
export function resolveRdapEndpoint(registrableDomain: string): { url: string; source: string } {
  const parsed = parse(registrableDomain);
  const tld = (parsed.publicSuffix || '').toLowerCase();

  // 1. Check exact TLD match or multi-level TLD match
  if (tld && TLD_RDAP_SERVERS[tld]) {
    return {
      url: `${TLD_RDAP_SERVERS[tld]}${encodeURIComponent(registrableDomain)}`,
      source: TLD_RDAP_SERVERS[tld],
    };
  }

  // 2. Check root TLD for multi-level suffixes (e.g. "co.uk" -> check "uk")
  const rootTld = tld.split('.').pop();
  if (rootTld && TLD_RDAP_SERVERS[rootTld]) {
    return {
      url: `${TLD_RDAP_SERVERS[rootTld]}${encodeURIComponent(registrableDomain)}`,
      source: TLD_RDAP_SERVERS[rootTld],
    };
  }

  // 3. Fallback to rdap.org universal router (RFC 7484)
  return {
    url: `https://rdap.org/domain/${encodeURIComponent(registrableDomain)}`,
    source: 'https://rdap.org/domain/',
  };
}

/**
 * Parses RDAP events array to extract registration, expiration, and update dates.
 * Event array order is NOT guaranteed by RFC 9083.
 */
export function parseRdapEvents(
  events: unknown
): DomainRegistrationInfo {
  const info: DomainRegistrationInfo = {};
  if (!Array.isArray(events)) return info;

  for (const item of events) {
    if (!item || typeof item !== 'object') continue;
    const ev = item as { eventAction?: string; eventDate?: string };
    const action = typeof ev.eventAction === 'string' ? ev.eventAction.toLowerCase().trim() : '';
    const dateStr = typeof ev.eventDate === 'string' ? ev.eventDate.trim() : '';

    if (!action || !dateStr) continue;

    // Validate that the date parses
    const timestamp = Date.parse(dateStr);
    if (isNaN(timestamp)) continue;

    const isoDate = new Date(timestamp).toISOString();

    if (action === 'registration' || action === 'registered') {
      if (!info.createdAt) {
        info.createdAt = isoDate;
      }
    } else if (action === 'expiration' || action === 'soft expiration') {
      if (!info.expiresAt) {
        info.expiresAt = isoDate;
      }
    } else if (action === 'last changed' || action === 'last update' || action === 'last-modified') {
      if (!info.lastChangedAt) {
        info.lastChangedAt = isoDate;
      }
    }
  }

  return info;
}

/**
 * Extracts registrar information from RDAP entities array.
 * Looks for entity having "registrar" role and extracts jCard name or handle.
 */
export function parseRegistrarEntity(entities: unknown): DomainRegistrarInfo | undefined {
  if (!Array.isArray(entities)) return undefined;

  for (const entity of entities) {
    if (!entity || typeof entity !== 'object') continue;
    const ent = entity as {
      roles?: unknown[];
      vcardArray?: unknown[];
      handle?: string;
      publicIds?: Array<{ type?: string; identifier?: string }>;
    };

    const roles = Array.isArray(ent.roles) ? ent.roles.map((r) => String(r).toLowerCase().trim()) : [];
    if (!roles.includes('registrar')) continue;

    let name: string | undefined;
    let isPrivacyProtected = false;

    // Check jCard vcardArray: ['vcard', [['fn', {}, 'text', 'Example Registrar LLC'], ...]]
    if (Array.isArray(ent.vcardArray) && ent.vcardArray.length >= 2 && Array.isArray(ent.vcardArray[1])) {
      const properties = ent.vcardArray[1] as unknown[];
      for (const prop of properties) {
        if (Array.isArray(prop) && prop[0] === 'fn' && typeof prop[3] === 'string') {
          const rawName = prop[3].trim();
          if (rawName) {
            name = rawName;
            break;
          }
        }
      }
    }

    // Fallback: check entity handle
    const handle = typeof ent.handle === 'string' ? ent.handle.trim() : undefined;

    // Extract IANA ID if available
    let ianaId: string | undefined;
    if (Array.isArray(ent.publicIds)) {
      for (const pid of ent.publicIds) {
        if (pid && typeof pid === 'object') {
          const type = String(pid.type || '').toLowerCase();
          if (type.includes('iana') && pid.identifier) {
            ianaId = String(pid.identifier).trim();
            break;
          }
        }
      }
    }

    const checkStr = `${name || ''} ${handle || ''}`.toLowerCase();
    if (
      checkStr.includes('redacted') ||
      checkStr.includes('privacy') ||
      checkStr.includes('withheld') ||
      checkStr.includes('proxy')
    ) {
      isPrivacyProtected = true;
    }

    return {
      name: name || handle,
      handle,
      ianaId,
      isPrivacyProtected,
    };
  }

  return undefined;
}

/**
 * Calculates domain age in days and its classification using UTC-safe calculations.
 */
export function calculateDomainAge(
  createdAtStr?: string,
  referenceTimeMs: number = Date.now()
): DomainAgeInfo | undefined {
  if (!createdAtStr) return undefined;

  const createdTime = Date.parse(createdAtStr);
  if (isNaN(createdTime)) return undefined;

  // UTC-safe delta in days
  const diffMs = referenceTimeMs - createdTime;
  if (diffMs < 0) {
    // Registered in the future or clock skew
    return {
      ageDays: 0,
      classification: 'UNKNOWN',
    };
  }

  const ageDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  let classification: DomainAgeClassification = 'ESTABLISHED';
  if (ageDays < 7) {
    classification = 'VERY_NEW';
  } else if (ageDays <= 30) {
    classification = 'NEWLY_REGISTERED';
  } else if (ageDays <= 90) {
    classification = 'RECENT';
  } else {
    classification = 'ESTABLISHED';
  }

  return {
    ageDays,
    classification,
  };
}

/**
 * Generates forensic findings for domain intelligence following the project's Finding interface.
 */
export function generateDomainFindings(intelligence: DomainIntelligence): Finding[] {
  const findings: Finding[] = [];
  const domain = intelligence.registrableDomain || intelligence.domain;

  if (!intelligence.rdap.available) {
    findings.push({
      type: 'DOMAIN_REGISTRATION_UNKNOWN',
      severity: 'INFO',
      description: `Domain registration details could not be verified via RDAP (${intelligence.rdap.error || 'service unavailable'})`,
      source: 'heuristic',
    });
    return findings;
  }

  const age = intelligence.age;
  const registration = intelligence.registration;
  const registrarName = intelligence.registrar?.name;
  const registrarSuffix = registrarName ? ` (Registrar: ${registrarName})` : '';

  if (age) {
    if (age.classification === 'VERY_NEW') {
      findings.push({
        type: 'VERY_NEW_DOMAIN',
        severity: 'HIGH',
        description: `Domain '${domain}' was registered ${age.ageDays} day(s) ago (< 7 days); high risk of disposable/burner infrastructure${registrarSuffix}`,
        source: 'heuristic',
      });
    } else if (age.classification === 'NEWLY_REGISTERED') {
      findings.push({
        type: 'NEWLY_REGISTERED_DOMAIN',
        severity: 'HIGH',
        description: `Domain '${domain}' was registered ${age.ageDays} days ago (< 30 days); newly registered domain often associated with phishing campaigns${registrarSuffix}`,
        source: 'heuristic',
      });
    } else if (age.classification === 'RECENT') {
      findings.push({
        type: 'RECENTLY_REGISTERED_DOMAIN',
        severity: 'LOW',
        description: `Domain '${domain}' was registered ${age.ageDays} days ago (< 90 days)${registrarSuffix}`,
        source: 'heuristic',
      });
    }
  }

  // Check expiration if available
  if (registration?.expiresAt) {
    const expiresMs = Date.parse(registration.expiresAt);
    if (!isNaN(expiresMs)) {
      const nowMs = Date.now();
      const daysUntilExpiry = Math.floor((expiresMs - nowMs) / (24 * 60 * 60 * 1000));

      if (daysUntilExpiry < 0) {
        findings.push({
          type: 'DOMAIN_EXPIRED',
          severity: 'HIGH',
          description: `Domain '${domain}' registration expired on ${registration.expiresAt.split('T')[0]}`,
          source: 'heuristic',
        });
      } else if (daysUntilExpiry <= 30) {
        findings.push({
          type: 'DOMAIN_EXPIRING_SOON',
          severity: 'LOW',
          description: `Domain '${domain}' registration expires in ${daysUntilExpiry} days (${registration.expiresAt.split('T')[0]})`,
          source: 'heuristic',
        });
      }
    }
  }

  return findings;
}

/**
 * Performs an RDAP network query against the resolved authoritative endpoint or router.
 * Catches all HTTP errors, timeouts, and JSON parse exceptions gracefully.
 */
export async function fetchRdapDomain(
  registrableDomain: string,
  options?: QueryRdapOptions
): Promise<DomainIntelligence> {
  const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
  const envEnabled = proc?.env?.['RDAP_ENABLED'];
  const isEnabled = options?.enabled ?? (envEnabled !== 'false');
  const envTimeout = proc?.env?.['RDAP_TIMEOUT_MS'];
  const timeoutMs = options?.timeoutMs ?? (Number(envTimeout) || 3000);
  const fetchFn = options?.fetchFn || globalThis.fetch;
  const nowMs = options?.nowMs ?? Date.now();
  const fetchedAt = new Date(nowMs).toISOString();

  if (!isEnabled) {
    const disabledIntel: DomainIntelligence = {
      domain: registrableDomain,
      registrableDomain,
      rdap: {
        available: false,
        fetchedAt,
        error: 'RDAP_DISABLED',
      },
      findings: [],
    };
    disabledIntel.findings = generateDomainFindings(disabledIntel);
    return disabledIntel;
  }

  if (isInvalidRdapTarget(registrableDomain)) {
    const emptyIntel: DomainIntelligence = {
      domain: registrableDomain,
      registrableDomain,
      rdap: {
        available: false,
        fetchedAt,
        error: 'INVALID_DOMAIN_TARGET',
      },
      findings: [],
    };
    emptyIntel.findings = generateDomainFindings(emptyIntel);
    return emptyIntel;
  }

  const { url, source } = resolveRdapEndpoint(registrableDomain);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/rdap+json, application/json',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    if (timer) clearTimeout(timer);

    if (!response.ok) {
      const errorMsg =
        response.status === 404
          ? 'RDAP_NOT_FOUND'
          : response.status === 429
          ? 'RDAP_RATE_LIMITED'
          : `RDAP_HTTP_${response.status}`;

      const fallbackIntel: DomainIntelligence = {
        domain: registrableDomain,
        registrableDomain,
        rdap: {
          available: false,
          source,
          fetchedAt,
          httpStatus: response.status,
          error: errorMsg,
        },
        findings: [],
      };
      fallbackIntel.findings = generateDomainFindings(fallbackIntel);
      return fallbackIntel;
    }

    const json = (await response.json()) as Record<string, unknown>;
    const registration = parseRdapEvents(json['events']);
    const registrar = parseRegistrarEntity(json['entities']);
    const age = calculateDomainAge(registration.createdAt, nowMs);

    const intel: DomainIntelligence = {
      domain: registrableDomain,
      registrableDomain,
      registration,
      registrar,
      rdap: {
        available: true,
        source,
        fetchedAt,
        httpStatus: 200,
      },
      age,
      findings: [],
    };

    intel.findings = generateDomainFindings(intel);
    return intel;
  } catch (err) {
    if (timer) clearTimeout(timer);
    const isAbort = (err as { name?: string })?.name === 'AbortError';
    const errorDesc = isAbort ? 'RDAP_TIMEOUT' : ((err as Error)?.message || 'RDAP_FETCH_ERROR');

    const fallbackIntel: DomainIntelligence = {
      domain: registrableDomain,
      registrableDomain,
      rdap: {
        available: false,
        source,
        fetchedAt,
        error: errorDesc,
      },
      findings: [],
    };
    fallbackIntel.findings = generateDomainFindings(fallbackIntel);
    return fallbackIntel;
  }
}

/**
 * High-level cached RDAP lookup for a domain or email.
 * Includes in-memory TTL caching (24h for success, 60s for transient failures)
 * and in-flight request deduplication to prevent duplicate concurrent network queries.
 */
export async function getDomainIntelligence(
  domainOrEmail: string,
  options?: QueryRdapOptions
): Promise<DomainIntelligence> {
  const registrable = extractRegistrableDomain(domainOrEmail);
  const nowMs = options?.nowMs ?? Date.now();
  const fetchedAt = new Date(nowMs).toISOString();

  if (!registrable) {
    const invalidIntel: DomainIntelligence = {
      domain: domainOrEmail || 'unknown',
      registrableDomain: 'unknown',
      rdap: {
        available: false,
        fetchedAt,
        error: 'INVALID_DOMAIN_FORMAT',
      },
      findings: [],
    };
    invalidIntel.findings = generateDomainFindings(invalidIntel);
    return invalidIntel;
  }

  // 1. Check in-memory cache
  const cached = domainCache.get(registrable);
  if (cached && cached.expiresAt > nowMs) {
    return cached.intelligence;
  }

  // 2. In-flight request deduplication
  if (inFlightLookups.has(registrable)) {
    return inFlightLookups.get(registrable)!;
  }

  // 3. Perform network lookup
  const lookupPromise = (async (): Promise<DomainIntelligence> => {
    try {
      const result = await fetchRdapDomain(registrable, options);
      const ttlMs = result.rdap.available ? SUCCESS_CACHE_TTL_MS : TRANSIENT_FAILURE_CACHE_TTL_MS;

      domainCache.set(registrable, {
        intelligence: result,
        expiresAt: nowMs + ttlMs,
      });

      return result;
    } finally {
      inFlightLookups.delete(registrable);
    }
  })();

  inFlightLookups.set(registrable, lookupPromise);
  return lookupPromise;
}
