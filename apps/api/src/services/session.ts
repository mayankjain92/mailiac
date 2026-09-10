import crypto, { randomUUID } from 'node:crypto';
import type { CookieOptions } from 'express';

export const AUTH_COOKIE_NAME = 'mailiac_token';

export interface SessionTokenPayload {
  userId: string;
  email: string;
  sessionId: string;
  iat: number;
  exp: number;
}

function getAuthSecret(): string {
  const secret = process.env['AUTH_SECRET'] ?? process.env['JWT_SECRET'];
  if (secret && secret.trim().length > 0) {
    return secret.trim();
  }
  return 'mailiac-development-secret-key-32-chars-minimum-safe';
}

/**
 * Creates a tamper-proof HMAC-SHA256 signed JWT session token.
 */
export function signSessionToken(
  params: {
    userId: string;
    email: string;
    sessionId?: string;
  },
  expiresInSeconds = 7 * 24 * 60 * 60 // 7 days
): { token: string; sessionId: string; expiresAt: Date } {
  const secret = getAuthSecret();
  const sessionId = params.sessionId ?? randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + expiresInSeconds;
  const expiresAt = new Date(exp * 1000);

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: SessionTokenPayload = {
    userId: params.userId,
    email: params.email,
    sessionId,
    iat: now,
    exp,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto.createHmac('sha256', secret).update(dataToSign).digest('base64url');
  const token = `${dataToSign}.${signature}`;

  return { token, sessionId, expiresAt };
}

/**
 * Cryptographically verifies an HMAC-SHA256 session token using timingSafeEqual.
 * Returns decoded payload if valid and unexpired; otherwise null.
 */
export function verifySessionToken(token?: string | null): SessionTokenPayload | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, receivedSig] = parts;
  if (!encodedHeader || !encodedPayload || !receivedSig) {
    return null;
  }

  const secret = getAuthSecret();
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  const receivedSigBuf = Buffer.from(receivedSig);
  const expectedSigBuf = Buffer.from(expectedSig);

  if (receivedSigBuf.length !== expectedSigBuf.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(receivedSigBuf, expectedSigBuf)) {
    return null;
  }

  try {
    const payloadStr = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadStr) as SessionTokenPayload;

    if (!payload.userId || !payload.email || !payload.exp) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Standard cookie configuration for the authenticated Mailiac session.
 */
export function getAuthCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}

/**
 * Cookie options used to immediately invalidate and wipe the auth cookie.
 */
export function getClearAuthCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  };
}
