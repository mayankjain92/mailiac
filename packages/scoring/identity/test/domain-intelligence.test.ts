import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  extractRegistrableDomain,
  isInvalidRdapTarget,
  resolveRdapEndpoint,
  parseRdapEvents,
  parseRegistrarEntity,
  calculateDomainAge,
  generateDomainFindings,
  fetchRdapDomain,
  getDomainIntelligence,
  clearDomainIntelligenceCache,
  scoreIdentity,
  scoreIdentityAsync,
} from '../src/index.js';

describe('Domain Intelligence & RDAP Forensics', () => {
  beforeEach(() => {
    clearDomainIntelligenceCache();
    vi.restoreAllMocks();
  });

  // 1. Domain Extraction
  describe('Domain Extraction', () => {
    it('extracts registrable domain from email addresses', () => {
      expect(extractRegistrableDomain('security@paypa1-login.example')).toBe('paypa1-login.example');
      expect(extractRegistrableDomain('admin@sub.corp.example.com')).toBe('example.com');
      expect(extractRegistrableDomain('user@mail.google.co.uk')).toBe('google.co.uk');
    });

    it('resolves deep subdomains to registrable domain', () => {
      expect(extractRegistrableDomain('login.security.paypal.com')).toBe('paypal.com');
      expect(extractRegistrableDomain('auth.internal.corp.microsoft.com')).toBe('microsoft.com');
      expect(extractRegistrableDomain('deep.sub.level.service.co.uk')).toBe('service.co.uk');
    });

    it('handles empty, null, or invalid domain strings gracefully', () => {
      expect(extractRegistrableDomain('')).toBeNull();
      expect(extractRegistrableDomain(null)).toBeNull();
      expect(extractRegistrableDomain(undefined)).toBeNull();
      expect(extractRegistrableDomain('   ')).toBeNull();
    });
  });

  // 2. Domain Normalization
  describe('Domain Normalization', () => {
    it('normalizes uppercase and trailing dots/whitespace', () => {
      expect(extractRegistrableDomain('  PAYPAL.COM. ')).toBe('paypal.com');
      expect(extractRegistrableDomain('HTTP://LOGIN.SECURITY.PAYPAL.COM:8080/path')).toBe('paypal.com');
    });

    it('handles multi-level country code TLDs properly', () => {
      expect(extractRegistrableDomain('portal.banco.com.br')).toBe('banco.com.br');
      expect(extractRegistrableDomain('secure.login.gov.uk')).toBe('login.gov.uk');
      expect(extractRegistrableDomain('test.domain.co.in')).toBe('domain.co.in');
    });

    it('identifies invalid or reserved pseudo-domains for RDAP', () => {
      expect(isInvalidRdapTarget('test.local')).toBe(true);
      expect(isInvalidRdapTarget('host.internal')).toBe(true);
      expect(isInvalidRdapTarget('corp.lan')).toBe(true);
      expect(isInvalidRdapTarget('localhost')).toBe(true);
      expect(isInvalidRdapTarget('paypal.com')).toBe(false);
      expect(isInvalidRdapTarget('suspicious-phish.xyz')).toBe(false);
    });
  });

  // 3. RDAP Endpoint Resolution
  describe('RDAP Endpoint Resolution', () => {
    it('resolves authoritative TLD endpoint for .com and .net', () => {
      const endpoint = resolveRdapEndpoint('paypal.com');
      expect(endpoint.url).toContain('rdap.verisign.com');
      expect(endpoint.url).toContain('paypal.com');
    });

    it('resolves authoritative TLD endpoint for .org', () => {
      const endpoint = resolveRdapEndpoint('wikipedia.org');
      expect(endpoint.url).toContain('rdap.publicinterestregistry.org');
    });

    it('falls back to rdap.org router for other/generic TLDs', () => {
      const endpoint = resolveRdapEndpoint('suspicious.xyz');
      expect(endpoint.url).toBe('https://rdap.org/domain/suspicious.xyz');
      expect(endpoint.source).toBe('https://rdap.org/domain/');
    });
  });

  // 4. RDAP Event Parsing
  describe('RDAP Event Parsing', () => {
    it('extracts registration, expiration, and update events regardless of array order', () => {
      const events = [
        { eventAction: 'last changed', eventDate: '2026-01-15T12:00:00Z' },
        { eventAction: 'expiration', eventDate: '2027-08-20T00:00:00Z' },
        { eventAction: 'registration', eventDate: '2026-08-01T10:30:00Z' },
      ];

      const result = parseRdapEvents(events);
      expect(result.createdAt).toBe('2026-08-01T10:30:00.000Z');
      expect(result.expiresAt).toBe('2027-08-20T00:00:00.000Z');
      expect(result.lastChangedAt).toBe('2026-01-15T12:00:00.000Z');
    });

    it('handles missing events or malformed dates gracefully', () => {
      const malformedEvents = [
        { eventAction: 'registration', eventDate: 'not-a-date' },
        { eventAction: 'unknown_action', eventDate: '2026-08-01T10:30:00Z' },
        null,
        {},
      ];

      const result = parseRdapEvents(malformedEvents);
      expect(result.createdAt).toBeUndefined();
      expect(result.expiresAt).toBeUndefined();
    });

    it('handles empty or non-array events safely', () => {
      expect(parseRdapEvents(null)).toEqual({});
      expect(parseRdapEvents(undefined)).toEqual({});
      expect(parseRdapEvents([])).toEqual({});
    });
  });

  // 5. Registrar Entity Extraction
  describe('Registrar Entity Extraction', () => {
    it('extracts registrar name from jCard vcardArray', () => {
      const entities = [
        {
          roles: ['registrar'],
          handle: '1234',
          vcardArray: [
            'vcard',
            [
              ['version', {}, 'text', '4.0'],
              ['fn', {}, 'text', 'GoDaddy.com, LLC'],
            ],
          ],
          publicIds: [{ type: 'iana registrar id', identifier: '146' }],
        },
      ];

      const registrar = parseRegistrarEntity(entities);
      expect(registrar).toBeDefined();
      expect(registrar?.name).toBe('GoDaddy.com, LLC');
      expect(registrar?.handle).toBe('1234');
      expect(registrar?.ianaId).toBe('146');
      expect(registrar?.isPrivacyProtected).toBe(false);
    });

    it('identifies privacy/redacted registrar data without failing', () => {
      const entities = [
        {
          roles: ['registrar'],
          handle: 'REDACTED FOR PRIVACY',
          vcardArray: [
            'vcard',
            [
              ['fn', {}, 'text', 'Withheld for Privacy Purpose'],
            ],
          ],
        },
      ];

      const registrar = parseRegistrarEntity(entities);
      expect(registrar?.name).toBe('Withheld for Privacy Purpose');
      expect(registrar?.isPrivacyProtected).toBe(true);
    });

    it('returns undefined when no registrar role exists in entities', () => {
      const entities = [
        { roles: ['registrant'], handle: 'JOHN-DOE' },
        { roles: ['administrative'], handle: 'TECH-1' },
      ];

      expect(parseRegistrarEntity(entities)).toBeUndefined();
    });
  });

  // 6. Domain Age Calculation & Classification
  describe('Domain Age Calculation & Classification', () => {
    const NOW = Date.parse('2026-09-06T00:00:00.000Z');

    it('classifies < 7 days as VERY_NEW', () => {
      // 3 days old
      const created = new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString();
      const age = calculateDomainAge(created, NOW);
      expect(age?.ageDays).toBe(3);
      expect(age?.classification).toBe('VERY_NEW');
    });

    it('classifies exactly 6 days as VERY_NEW (boundary test)', () => {
      const created = new Date(NOW - 6 * 24 * 60 * 60 * 1000).toISOString();
      const age = calculateDomainAge(created, NOW);
      expect(age?.ageDays).toBe(6);
      expect(age?.classification).toBe('VERY_NEW');
    });

    it('classifies 7 to 30 days as NEWLY_REGISTERED (boundary tests)', () => {
      // 7 days
      const created7 = new Date(NOW - 7 * 24 * 60 * 60 * 1000).toISOString();
      const age7 = calculateDomainAge(created7, NOW);
      expect(age7?.ageDays).toBe(7);
      expect(age7?.classification).toBe('NEWLY_REGISTERED');

      // 17 days
      const created17 = new Date(NOW - 17 * 24 * 60 * 60 * 1000).toISOString();
      const age17 = calculateDomainAge(created17, NOW);
      expect(age17?.ageDays).toBe(17);
      expect(age17?.classification).toBe('NEWLY_REGISTERED');

      // 30 days
      const created30 = new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString();
      const age30 = calculateDomainAge(created30, NOW);
      expect(age30?.ageDays).toBe(30);
      expect(age30?.classification).toBe('NEWLY_REGISTERED');
    });

    it('classifies 31 to 90 days as RECENT (boundary tests)', () => {
      const created31 = new Date(NOW - 31 * 24 * 60 * 60 * 1000).toISOString();
      const age31 = calculateDomainAge(created31, NOW);
      expect(age31?.ageDays).toBe(31);
      expect(age31?.classification).toBe('RECENT');

      const created90 = new Date(NOW - 90 * 24 * 60 * 60 * 1000).toISOString();
      const age90 = calculateDomainAge(created90, NOW);
      expect(age90?.ageDays).toBe(90);
      expect(age90?.classification).toBe('RECENT');
    });

    it('classifies > 90 days as ESTABLISHED', () => {
      const created = new Date(NOW - 365 * 24 * 60 * 60 * 1000).toISOString();
      const age = calculateDomainAge(created, NOW);
      expect(age?.ageDays).toBe(365);
      expect(age?.classification).toBe('ESTABLISHED');
    });

    it('handles future or invalid dates safely', () => {
      const future = new Date(NOW + 5 * 24 * 60 * 60 * 1000).toISOString();
      const age = calculateDomainAge(future, NOW);
      expect(age?.ageDays).toBe(0);
      expect(age?.classification).toBe('UNKNOWN');

      expect(calculateDomainAge('invalid-date')).toBeUndefined();
      expect(calculateDomainAge(undefined)).toBeUndefined();
    });
  });

  // 7. Findings Generation
  describe('Findings Generation', () => {
    it('generates VERY_NEW_DOMAIN finding with HIGH severity', () => {
      const intel = {
        domain: 'burner-attack.com',
        registrableDomain: 'burner-attack.com',
        registration: { createdAt: '2026-09-04T00:00:00Z' },
        registrar: { name: 'NameCheap, Inc.' },
        rdap: { available: true, fetchedAt: new Date().toISOString() },
        age: { ageDays: 2, classification: 'VERY_NEW' as const },
        findings: [],
      };

      const findings = generateDomainFindings(intel);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.type).toBe('VERY_NEW_DOMAIN');
      expect(findings[0]?.severity).toBe('HIGH');
      expect(findings[0]?.description).toContain('burner-attack.com');
      expect(findings[0]?.description).toContain('2 day(s) ago');
      expect(findings[0]?.description).toContain('NameCheap, Inc.');
    });

    it('generates NEWLY_REGISTERED_DOMAIN finding', () => {
      const intel = {
        domain: 'recent-phish.net',
        registrableDomain: 'recent-phish.net',
        registration: { createdAt: '2026-08-20T00:00:00Z' },
        rdap: { available: true, fetchedAt: new Date().toISOString() },
        age: { ageDays: 17, classification: 'NEWLY_REGISTERED' as const },
        findings: [],
      };

      const findings = generateDomainFindings(intel);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.type).toBe('NEWLY_REGISTERED_DOMAIN');
      expect(findings[0]?.severity).toBe('HIGH');
      expect(findings[0]?.description).toContain('17 days ago');
    });

    it('generates DOMAIN_EXPIRED finding when expiration is in past', () => {
      const intel = {
        domain: 'expired-corp.com',
        registrableDomain: 'expired-corp.com',
        registration: {
          createdAt: '2020-01-01T00:00:00Z',
          expiresAt: '2025-01-01T00:00:00Z',
        },
        rdap: { available: true, fetchedAt: new Date().toISOString() },
        age: { ageDays: 2000, classification: 'ESTABLISHED' as const },
        findings: [],
      };

      const findings = generateDomainFindings(intel);
      expect(findings.some((f) => f.type === 'DOMAIN_EXPIRED')).toBe(true);
    });

    it('generates DOMAIN_REGISTRATION_UNKNOWN when RDAP is unavailable', () => {
      const intel = {
        domain: 'unindexed.xyz',
        registrableDomain: 'unindexed.xyz',
        rdap: { available: false, fetchedAt: new Date().toISOString(), error: 'RDAP_NOT_FOUND' },
        findings: [],
      };

      const findings = generateDomainFindings(intel);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.type).toBe('DOMAIN_REGISTRATION_UNKNOWN');
      expect(findings[0]?.severity).toBe('INFO');
    });
  });

  // 8. RDAP HTTP Fetch & Resiliency
  describe('RDAP HTTP Fetch & Resiliency', () => {
    it('parses valid RDAP JSON response successfully', async () => {
      const mockRdapResponse = {
        events: [
          { eventAction: 'registration', eventDate: '2026-08-20T10:00:00Z' },
          { eventAction: 'expiration', eventDate: '2027-08-20T10:00:00Z' },
        ],
        entities: [
          {
            roles: ['registrar'],
            vcardArray: ['vcard', [['fn', {}, 'text', 'Cloudflare, Inc.']]],
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockRdapResponse,
      });

      const intel = await fetchRdapDomain('test-domain.com', {
        fetchFn: mockFetch as unknown as typeof fetch,
        nowMs: Date.parse('2026-09-06T10:00:00Z'),
      });

      expect(intel.rdap.available).toBe(true);
      expect(intel.registration?.createdAt).toBe('2026-08-20T10:00:00.000Z');
      expect(intel.registrar?.name).toBe('Cloudflare, Inc.');
      expect(intel.age?.classification).toBe('NEWLY_REGISTERED');
      expect(intel.findings.some((f) => f.type === 'NEWLY_REGISTERED_DOMAIN')).toBe(true);
    });

    it('handles RDAP 404 cleanly as non-fatal fallback', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const intel = await fetchRdapDomain('nonexistent-domain-404.com', {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(intel.rdap.available).toBe(false);
      expect(intel.rdap.error).toBe('RDAP_NOT_FOUND');
      expect(intel.findings[0]?.type).toBe('DOMAIN_REGISTRATION_UNKNOWN');
    });

    it('handles RDAP timeout cleanly as non-fatal fallback', async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      });

      const intel = await fetchRdapDomain('timeout-domain.com', {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(intel.rdap.available).toBe(false);
      expect(intel.rdap.error).toBe('RDAP_TIMEOUT');
    });

    it('handles malformed RDAP JSON cleanly', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Unexpected token in JSON');
        },
      });

      const intel = await fetchRdapDomain('corrupt-json.com', {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(intel.rdap.available).toBe(false);
      expect(intel.rdap.error).toContain('Unexpected token');
    });
  });

  // 9. Caching & Request Deduplication
  describe('Caching & Request Deduplication', () => {
    it('caches successful lookups and avoids duplicate network requests', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          events: [{ eventAction: 'registration', eventDate: '2026-08-01T00:00:00Z' }],
        }),
      });

      const first = await getDomainIntelligence('repeat-domain.com', {
        fetchFn: mockFetch as unknown as typeof fetch,
      });
      const second = await getDomainIntelligence('repeat-domain.com', {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(first.rdap.available).toBe(true);
      expect(second.rdap.available).toBe(true);
      // Fetch function should have only been called once!
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('deduplicates concurrent in-flight requests for the same domain', async () => {
      let resolvePromise: (val: unknown) => void;
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      const mockFetch = vi.fn().mockImplementation(() => delayedPromise);

      const req1 = getDomainIntelligence('concurrent.com', {
        fetchFn: mockFetch as unknown as typeof fetch,
      });
      const req2 = getDomainIntelligence('concurrent.com', {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      resolvePromise!({
        ok: true,
        status: 200,
        json: async () => ({ events: [] }),
      });

      const [res1, res2] = await Promise.all([req1, req2]);
      expect(res1.registrableDomain).toBe('concurrent.com');
      expect(res2.registrableDomain).toBe('concurrent.com');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // 10. Scoring Engine Integration with Identity
  describe('Scoring Engine Integration', () => {
    const protectedDomains = ['paypal.com', 'microsoft.com'];

    it('contributes risk to identityScore when domain is VERY_NEW', () => {
      const domainIntel = {
        domain: 'new-startup.com',
        registrableDomain: 'new-startup.com',
        registration: { createdAt: '2026-09-04T00:00:00Z' },
        rdap: { available: true, fetchedAt: new Date().toISOString() },
        age: { ageDays: 2, classification: 'VERY_NEW' as const },
        findings: [
          {
            type: 'VERY_NEW_DOMAIN',
            severity: 'HIGH' as const,
            description: 'Domain new-startup.com registered 2 days ago',
          },
        ],
      };

      const result = scoreIdentity('new-startup.com', protectedDomains, undefined, undefined, domainIntel);
      expect(result.identityScore).toBe(35);
      expect(result.findings.some((f) => f.type === 'VERY_NEW_DOMAIN')).toBe(true);
    });

    it('corroborates typosquatting when domain is also newly registered', () => {
      const domainIntel = {
        domain: 'paypa1.com',
        registrableDomain: 'paypa1.com',
        registration: { createdAt: '2026-09-04T00:00:00Z' },
        rdap: { available: true, fetchedAt: new Date().toISOString() },
        age: { ageDays: 2, classification: 'VERY_NEW' as const },
        findings: [
          {
            type: 'VERY_NEW_DOMAIN',
            severity: 'HIGH' as const,
            description: 'Domain paypa1.com registered 2 days ago',
          },
        ],
      };

      const result = scoreIdentity('paypa1.com', protectedDomains, undefined, undefined, domainIntel);
      // Homoglyph lookalike (100) + VERY_NEW (corroborated) -> capped at 100 with multiple high severity findings
      expect(result.identityScore).toBe(100);
      expect(result.findings.some((f) => f.type === 'HOMOGLYPH_DETECTED' || f.type === 'TYPOSQUATTING')).toBe(true);
      expect(result.findings.some((f) => f.type === 'VERY_NEW_DOMAIN')).toBe(true);
    });

    it('does not penalize established legitimate domains', () => {
      const domainIntel = {
        domain: 'established-company.com',
        registrableDomain: 'established-company.com',
        registration: { createdAt: '2010-01-01T00:00:00Z' },
        rdap: { available: true, fetchedAt: new Date().toISOString() },
        age: { ageDays: 6000, classification: 'ESTABLISHED' as const },
        findings: [],
      };

      const result = scoreIdentity('established-company.com', protectedDomains, undefined, undefined, domainIntel);
      expect(result.identityScore).toBe(0);
      expect(result.findings).toHaveLength(0);
    });

    it('evaluates scoreIdentityAsync with mocked RDAP fetch', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          events: [{ eventAction: 'registration', eventDate: '2026-09-01T00:00:00Z' }],
        }),
      });

      const result = await scoreIdentityAsync(
        'brand-phish.xyz',
        protectedDomains,
        undefined,
        undefined,
        {
          fetchFn: mockFetch as unknown as typeof fetch,
          nowMs: Date.parse('2026-09-06T00:00:00Z'),
        }
      );

      expect(result.identityScore).toBeGreaterThanOrEqual(35);
      expect(result.findings.some((f) => f.type === 'VERY_NEW_DOMAIN')).toBe(true);
    });
  });
});
