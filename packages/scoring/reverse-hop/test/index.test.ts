import { vi, describe, it, expect, beforeEach } from 'vitest';
import dns from 'dns/promises';
import { traceReverseHops, parseReceivedHeader, isPrivateIP } from '../src/index';

vi.mock('dns/promises', () => {
  return {
    default: {
      reverse: vi.fn(),
    },
  };
});

describe('Reverse-Hop Trace Algorithm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isPrivateIP', () => {
    it('correctly identifies private IPv4 addresses', () => {
      expect(isPrivateIP('10.0.0.1')).toBe(true);
      expect(isPrivateIP('172.16.254.1')).toBe(true);
      expect(isPrivateIP('172.31.0.1')).toBe(true);
      expect(isPrivateIP('192.168.1.100')).toBe(true);
      expect(isPrivateIP('127.0.0.1')).toBe(true);
      expect(isPrivateIP('169.254.1.1')).toBe(true);
      expect(isPrivateIP('0.0.0.0')).toBe(true);
    });

    it('correctly identifies public IPv4 addresses', () => {
      expect(isPrivateIP('8.8.8.8')).toBe(false);
      expect(isPrivateIP('209.85.220.41')).toBe(false);
      expect(isPrivateIP('172.15.255.255')).toBe(false);
      expect(isPrivateIP('172.32.0.0')).toBe(false);
    });

    it('correctly identifies private/local IPv6 addresses', () => {
      expect(isPrivateIP('::1')).toBe(true);
      expect(isPrivateIP('fe80::1')).toBe(true);
      expect(isPrivateIP('fc00::1')).toBe(true);
      expect(isPrivateIP('fdff::ffff')).toBe(true);
    });

    it('correctly identifies public IPv6 addresses', () => {
      expect(isPrivateIP('2001:db8::1')).toBe(false);
      expect(isPrivateIP('2607:f8b0:4001:c09::26')).toBe(false);
    });
  });

  describe('parseReceivedHeader', () => {
    it('parses standard Received header with claimed host and IP', () => {
      const header = 'Received: from mail.google.com (mail.google.com [209.85.220.41]) by mx.target.com';
      const parsed = parseReceivedHeader(header);
      expect(parsed.ip).toBe('209.85.220.41');
      expect(parsed.claimedHostname).toBe('mail.google.com');
    });

    it('parses Received header with bracketed IPv6 address', () => {
      const header = 'Received: from mail.google.com ([IPv6:2001:db8::1]) by mx.target.com';
      const parsed = parseReceivedHeader(header);
      expect(parsed.ip).toBe('2001:db8::1');
      expect(parsed.claimedHostname).toBe('mail.google.com');
    });

    it('parses Received header with only bracketed IP', () => {
      const header = 'Received: from [198.51.100.5] by mx.target.com';
      const parsed = parseReceivedHeader(header);
      expect(parsed.ip).toBe('198.51.100.5');
      expect(parsed.claimedHostname).toBe('198.51.100.5');
    });

    it('parses Received header with IP in parentheses', () => {
      const header = 'Received: from mail.google.com (209.85.220.41) by mx.target.com';
      const parsed = parseReceivedHeader(header);
      expect(parsed.ip).toBe('209.85.220.41');
      expect(parsed.claimedHostname).toBe('mail.google.com');
    });

    it('returns nulls for Received header without from clause', () => {
      const header = 'Received: by mx.target.com with SMTP id 12345';
      const parsed = parseReceivedHeader(header);
      expect(parsed.ip).toBeNull();
      expect(parsed.claimedHostname).toBeNull();
    });
  });

  describe('traceReverseHops', () => {
    it('happy path: all hops are public and have valid PTR records', async () => {
      const headers = [
        'Received: from mail.google.com (mail.google.com [209.85.220.41]) by mx.target.com',
        'Received: from relay.sender.com (relay.sender.com [198.51.100.5]) by mail.google.com',
      ];

      vi.mocked(dns.reverse).mockImplementation(async (ip) => {
        if (ip === '209.85.220.41') return ['mail.google.com'];
        if (ip === '198.51.100.5') return ['relay.sender.com'];
        return [];
      });

      const result = await traceReverseHops(headers);

      expect(result.injectionDetected).toBe(false);
      expect(result.evidenceBoundaryIndex).toBe(2);
      expect(result.originatingSenderIp).toBe('198.51.100.5');
      expect(result.path).toHaveLength(2);
      expect(result.path[0].trusted).toBe(true);
      expect(result.path[1].trusted).toBe(true);
    });

    it('private IP boundary: identifies boundary at private IP and isolates public IP below it', async () => {
      const headers = [
        'Received: from mail.google.com (mail.google.com [209.85.220.41]) by mx.target.com',
        'Received: from internal.local (local [10.0.0.5]) by mail.google.com',
        'Received: from workstation.local (workstation [192.168.1.10]) by internal.local',
        'Received: from public.home.com (public.home.com [198.51.100.20]) by workstation.local',
      ];

      vi.mocked(dns.reverse).mockImplementation(async (ip) => {
        if (ip === '209.85.220.41') return ['mail.google.com'];
        if (ip === '198.51.100.20') return ['public.home.com'];
        return [];
      });

      const result = await traceReverseHops(headers);

      expect(result.injectionDetected).toBe(true);
      expect(result.evidenceBoundaryIndex).toBe(1); // Index of internal.local
      expect(result.originatingSenderIp).toBe('198.51.100.20');
      expect(result.path[0].trusted).toBe(true);
      expect(result.path[1].trusted).toBe(false); // Boundary (private)
      expect(result.path[2].trusted).toBe(false); // Below boundary
      expect(result.path[3].trusted).toBe(false); // Below boundary
    });

    it('PTR mismatch boundary: identifies boundary at PTR mismatch and marks as untrusted', async () => {
      const headers = [
        'Received: from mail.google.com (mail.google.com [209.85.220.41]) by mx.target.com',
        'Received: from spoofed.com (spoofed.com [198.51.100.5]) by mail.google.com',
        'Received: from other.com (other.com [198.51.100.10]) by spoofed.com',
      ];

      vi.mocked(dns.reverse).mockImplementation(async (ip) => {
        if (ip === '209.85.220.41') return ['mail.google.com'];
        if (ip === '198.51.100.5') return ['legit-domain.com']; // PTR mismatch (expected spoofed.com)
        if (ip === '198.51.100.10') return ['other.com'];
        return [];
      });

      const result = await traceReverseHops(headers);

      expect(result.injectionDetected).toBe(true);
      expect(result.evidenceBoundaryIndex).toBe(1); // Index of spoofed.com
      expect(result.originatingSenderIp).toBe('198.51.100.5'); // Originating sender is the first public IP below boundary (which is spoofed.com itself)
      expect(result.path[0].trusted).toBe(true);
      expect(result.path[1].trusted).toBe(false);
      expect(result.path[2].trusted).toBe(false);
    });

    it('DNS failure: fallback gracefully to ptrValid=false and stop trust', async () => {
      const headers = [
        'Received: from mail.google.com (mail.google.com [209.85.220.41]) by mx.target.com',
        'Received: from flakey.com (flakey.com [198.51.100.5]) by mail.google.com',
      ];

      vi.mocked(dns.reverse).mockImplementation(async (ip) => {
        if (ip === '209.85.220.41') return ['mail.google.com'];
        throw new Error('DNS Query Timed Out');
      });

      const result = await traceReverseHops(headers);

      expect(result.injectionDetected).toBe(true);
      expect(result.evidenceBoundaryIndex).toBe(1);
      expect(result.originatingSenderIp).toBe('198.51.100.5');
      expect(result.path[0].trusted).toBe(true);
      expect(result.path[1].trusted).toBe(false);
      expect(result.path[1].ptrValid).toBe(false);
    });

    it('no public IP below boundary: returns null originatingSenderIp', async () => {
      const headers = [
        'Received: from mail.google.com (mail.google.com [209.85.220.41]) by mx.target.com',
        'Received: from internal.local (local [10.0.0.5]) by mail.google.com',
        'Received: from workstation.local (workstation [192.168.1.10]) by internal.local',
      ];

      vi.mocked(dns.reverse).mockImplementation(async (ip) => {
        if (ip === '209.85.220.41') return ['mail.google.com'];
        return [];
      });

      const result = await traceReverseHops(headers);

      expect(result.injectionDetected).toBe(true);
      expect(result.evidenceBoundaryIndex).toBe(1);
      expect(result.originatingSenderIp).toBeNull();
    });

    it('empty input: handles gracefully', async () => {
      const result = await traceReverseHops([]);
      expect(result.evidenceBoundaryIndex).toBe(0);
      expect(result.path).toEqual([]);
      expect(result.originatingSenderIp).toBeNull();
      expect(result.injectionDetected).toBe(false);
    });
  });
});
