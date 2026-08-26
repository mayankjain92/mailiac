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
    it('correctly identifies private IPv4 addresses (Test 7)', () => {
      expect(isPrivateIP('10.0.0.1')).toBe(true);
      expect(isPrivateIP('172.16.254.1')).toBe(true);
      expect(isPrivateIP('172.31.0.1')).toBe(true);
      expect(isPrivateIP('192.168.1.100')).toBe(true);
      expect(isPrivateIP('127.0.0.1')).toBe(true);
      expect(isPrivateIP('169.254.1.1')).toBe(true);
      expect(isPrivateIP('0.0.0.0')).toBe(true);
    });

    it('correctly identifies non-private/public IPv4 addresses (Test 7)', () => {
      expect(isPrivateIP('8.8.8.8')).toBe(false);
      expect(isPrivateIP('209.85.220.41')).toBe(false);
      expect(isPrivateIP('172.15.255.255')).toBe(false);
      expect(isPrivateIP('172.32.0.0')).toBe(false);
    });

    it('correctly identifies private/local IPv6 addresses (Test 8)', () => {
      expect(isPrivateIP('::1')).toBe(true);
      expect(isPrivateIP('fe80::1')).toBe(true);
      expect(isPrivateIP('fc00::1')).toBe(true);
      expect(isPrivateIP('fd00::1')).toBe(true);
      expect(isPrivateIP('fdff::ffff')).toBe(true);
    });

    it('correctly identifies public IPv6 addresses (Test 8)', () => {
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

    it('parses folded/multiline Received header correctly (Test 6)', () => {
      const header = `Received: from mail.google.com\n\t(mail.google.com [209.85.220.41])\n\tby mx.target.com with SMTP id xyz`;
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
    it('Test 1 — trusted chain: hop 0 and hop 1 are public + matching PTR', async () => {
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

      expect(result.path[0].trusted).toBe(true);
      expect(result.path[1].trusted).toBe(true);
      expect(result.injectionDetected).toBe(false);
      expect(result.evidenceBoundaryIndex).toBe(2);
      expect(result.originatingSenderIp).toBe('198.51.100.5');
    });

    it('Test 2 — private boundary: hop 0 & 1 trusted public, hop 2 private IP, hop 3 public IP', async () => {
      const headers = [
        'Received: from mail.google.com (mail.google.com [209.85.220.41]) by mx.target.com',
        'Received: from relay.sender.com (relay.sender.com [198.51.100.5]) by mail.google.com',
        'Received: from internal.local (local [10.0.0.5]) by relay.sender.com',
        'Received: from public.home.com (public.home.com [198.51.100.20]) by internal.local',
      ];

      vi.mocked(dns.reverse).mockImplementation(async (ip) => {
        if (ip === '209.85.220.41') return ['mail.google.com'];
        if (ip === '198.51.100.5') return ['relay.sender.com'];
        if (ip === '198.51.100.20') return ['public.home.com'];
        return [];
      });

      const result = await traceReverseHops(headers);

      expect(result.path[0].trusted).toBe(true);
      expect(result.path[1].trusted).toBe(true);
      expect(result.path[2].trusted).toBe(false); // boundary (private)
      expect(result.path[3].trusted).toBe(false); // below boundary
      expect(result.evidenceBoundaryIndex).toBe(2);
      expect(result.injectionDetected).toBe(false);
      expect(result.originatingSenderIp).toBe('198.51.100.5');
      expect(result.originatingSenderIp).not.toBe('198.51.100.20');
    });

    it('Test 3 — PTR mismatch: hop 0 valid public + matching PTR, hop 1 mismatching PTR, hop 2 another public IP', async () => {
      const headers = [
        'Received: from mail.google.com (mail.google.com [209.85.220.41]) by mx.target.com',
        'Received: from spoofed.com (spoofed.com [198.51.100.5]) by mail.google.com',
        'Received: from other.com (other.com [198.51.100.10]) by spoofed.com',
      ];

      vi.mocked(dns.reverse).mockImplementation(async (ip) => {
        if (ip === '209.85.220.41') return ['mail.google.com'];
        if (ip === '198.51.100.5') return ['legit-domain.com']; // PTR mismatch
        if (ip === '198.51.100.10') return ['other.com'];
        return [];
      });

      const result = await traceReverseHops(headers);

      expect(result.path[0].trusted).toBe(true);
      expect(result.path[1].trusted).toBe(false);
      expect(result.path[2].trusted).toBe(false);
      expect(result.evidenceBoundaryIndex).toBe(1);
      expect(result.injectionDetected).toBe(true);
      expect(result.originatingSenderIp).toBe('209.85.220.41');
    });

    it('Test 4 — private first hop: hop 0 is a private IP', async () => {
      const headers = [
        'Received: from internal.local (local [10.0.0.5]) by mx.target.com',
      ];

      const result = await traceReverseHops(headers);

      expect(result.evidenceBoundaryIndex).toBe(0);
      expect(result.injectionDetected).toBe(false);
      expect(result.originatingSenderIp).toBeNull();
    });

    it('Test 5 — all hops trusted: evidenceBoundaryIndex = path.length, originatingSenderIp = last trusted public IP', async () => {
      const headers = [
        'Received: from mx.google.com (mx.google.com [209.85.220.41]) by mx.target.com',
        'Received: from mail.sender.org (mail.sender.org [198.51.100.77]) by mx.google.com',
      ];

      vi.mocked(dns.reverse).mockImplementation(async (ip) => {
        if (ip === '209.85.220.41') return ['mx.google.com'];
        if (ip === '198.51.100.77') return ['mail.sender.org'];
        return [];
      });

      const result = await traceReverseHops(headers);

      expect(result.evidenceBoundaryIndex).toBe(result.path.length);
      expect(result.injectionDetected).toBe(false);
      expect(result.originatingSenderIp).toBe('198.51.100.77');
    });

    it('DNS failure: fallback gracefully to ptrValid=false and stop trust with injectionDetected=true', async () => {
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
      expect(result.originatingSenderIp).toBe('209.85.220.41');
      expect(result.path[0].trusted).toBe(true);
      expect(result.path[1].trusted).toBe(false);
      expect(result.path[1].ptrValid).toBe(false);
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
