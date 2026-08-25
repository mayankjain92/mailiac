import { isIP, isIPv4, isIPv6 } from 'net';
import type { ReverseHopResult, ForensicHop } from '@mailiac/shared-types';
import { resolvePtrWithTimeout } from './dns-ptr.js';

/**
 * Checks if a given IP address belongs to RFC 1918 (private IPv4) or local IPv6 ranges.
 */
export function isPrivateIP(ip: string): boolean {
  if (isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return false;

    // 10.0.0.0/8
    if (parts[0] === 10) return true;

    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;

    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;

    // 169.254.0.0/16 (Link-local)
    if (parts[0] === 169 && parts[1] === 254) return true;

    // 0.0.0.0/8 (Current network)
    if (parts[0] === 0) return true;

    return false;
  } else if (isIPv6(ip)) {
    const normalized = ip.toLowerCase();

    // Loopback: ::1 or 0:0:0:0:0:0:0:1
    if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;

    // Link-local: fe80::/10
    if (
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    ) {
      return true;
    }

    // Unique local: fc00::/7
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
      return true;
    }

    return false;
  }
  return false;
}

/**
 * Parses a standard Received: header to extract the IP address and claimed sender hostname.
 */
export function parseReceivedHeader(header: string): { ip: string | null; claimedHostname: string | null } {
  // Normalize whitespace (newlines, tabs, multiple spaces to a single space)
  const normalized = header.replace(/\s+/g, ' ');

  // Extract "from" clause (everything after "from" up to "by", "with", "id", or end of string)
  const fromMatch = normalized.match(/from\s+(.*?)(?=\s+by\s+|\s+with\s+|\s+id\s+|$)/i);
  if (!fromMatch) {
    return { ip: null, claimedHostname: null };
  }

  const fromPart = fromMatch[1].trim();
  if (!fromPart) {
    return { ip: null, claimedHostname: null };
  }

  // Claimed hostname is usually the first word.
  const firstWord = fromPart.split(' ')[0] || '';
  let claimedHostname: string | null = firstWord;

  // Clean brackets/IPv6 prefix from claimed hostname if it's bracketed
  if (claimedHostname.startsWith('[') && claimedHostname.endsWith(']')) {
    claimedHostname = claimedHostname.slice(1, -1);
  }
  if (claimedHostname.toLowerCase().startsWith('ipv6:')) {
    claimedHostname = claimedHostname.slice(5);
  }

  // Extract IP address from fromPart.
  // Prioritize square brackets first, then parentheses, then any word that is a valid IP.
  let ip: string | null = null;

  // 1. Check square brackets []
  const bracketMatches = [...fromPart.matchAll(/\[([^\]]+)\]/g)];
  for (const match of bracketMatches) {
    let candidate = match[1].trim();
    if (candidate.toLowerCase().startsWith('ipv6:')) {
      candidate = candidate.slice(5).trim();
    }
    if (isIP(candidate)) {
      ip = candidate;
      break;
    }
  }

  // 2. Check parentheses ()
  if (!ip) {
    const parenMatches = [...fromPart.matchAll(/\(([^)]+)\)/g)];
    for (const match of parenMatches) {
      const tokens = match[1].split(/\s+/);
      for (const token of tokens) {
        let candidate = token.trim();
        // Remove trailing punctuation
        candidate = candidate.replace(/[;,]$/, '');
        if (candidate.toLowerCase().startsWith('ipv6:')) {
          candidate = candidate.slice(5).trim();
        }
        if (isIP(candidate)) {
          ip = candidate;
          break;
        }
      }
      if (ip) break;
    }
  }

  // 3. Fallback: Check any whitespace-separated word in fromPart
  if (!ip) {
    const tokens = fromPart.split(/\s+/);
    for (const token of tokens) {
      let candidate = token.trim().replace(/[[\]()]/g, '').replace(/[;,]$/, '');
      if (candidate.toLowerCase().startsWith('ipv6:')) {
        candidate = candidate.slice(5).trim();
      }
      if (isIP(candidate)) {
        ip = candidate;
        break;
      }
    }
  }

  if (claimedHostname === '') {
    claimedHostname = null;
  }

  return { ip, claimedHostname };
}

/**
 * Traces reverse hops from received headers, performing DNS PTR validation.
 * Stops trusting hops on the first private IP or PTR mismatch (Evidence Boundary).
 */
export async function traceReverseHops(receivedHeadersRaw: string[]): Promise<ReverseHopResult> {
  const path: ForensicHop[] = [];
  
  // Extract all hops that contain valid IP addresses
  const parsedHops: { ip: string; claimedHostname: string | null }[] = [];
  for (const header of receivedHeadersRaw) {
    const parsed = parseReceivedHeader(header);
    if (parsed.ip) {
      parsedHops.push({
        ip: parsed.ip,
        claimedHostname: parsed.claimedHostname,
      });
    }
  }

  if (parsedHops.length === 0) {
    return {
      evidenceBoundaryIndex: 0,
      path: [],
      originatingSenderIp: null,
      injectionDetected: false,
    };
  }

  let trustBroken = false;
  let boundaryIndex = -1;

  for (let i = 0; i < parsedHops.length; i++) {
    const { ip, claimedHostname } = parsedHops[i];
    const isPrivate = isPrivateIP(ip);
    const ptrs = await resolvePtrWithTimeout(ip);

    let ptrValid = false;
    if (claimedHostname && ptrs.length > 0) {
      const normalizedClaimed = claimedHostname.toLowerCase().replace(/\.$/, '');
      ptrValid = ptrs.some(
        (ptr) => ptr.toLowerCase().replace(/\.$/, '') === normalizedClaimed
      );
    }

    let trusted = false;
    if (!trustBroken) {
      if (isPrivate || !ptrValid) {
        trustBroken = true;
        boundaryIndex = i;
        trusted = false;
      } else {
        trusted = true;
      }
    } else {
      trusted = false;
    }

    path.push({
      ip,
      hostnameClaimed: claimedHostname || undefined,
      ptrValid,
      isPrivate,
      trusted,
    });
  }

  const evidenceBoundaryIndex = boundaryIndex !== -1 ? boundaryIndex : path.length;
  const injectionDetected = boundaryIndex !== -1;

  let originatingSenderIp: string | null = null;
  if (injectionDetected) {
    // Find the first public IP at or below the boundary
    for (let i = evidenceBoundaryIndex; i < path.length; i++) {
      if (!path[i].isPrivate) {
        originatingSenderIp = path[i].ip;
        break;
      }
    }
  } else if (path.length > 0) {
    // All hops trusted, originating sender is the last hop
    originatingSenderIp = path[path.length - 1].ip;
  }

  return {
    evidenceBoundaryIndex,
    path,
    originatingSenderIp,
    injectionDetected,
  };
}
