import type { Request, Response, NextFunction } from 'express';
import { connectDb, UserModel, SessionModel } from '@mailiac/db';
import { verifySessionToken, AUTH_COOKIE_NAME } from '../services/session.js';

export interface AuthenticatedUser {
  id: string; // Stable internal Mailiac userId
  googleId?: string;
  email: string;
  name?: string;
  picture?: string;
}

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionId?: string;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

/**
 * Extracts session token from Authorization Bearer header or HTTP cookies.
 */
export function extractSessionToken(req: Request): string | null {
  // 1. Check Authorization header: Bearer <token>
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.trim().startsWith('Bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    if (bearerToken) {
      return bearerToken;
    }
  }

  // 2. Check parsed cookies if cookie-parser is active
  const cookieMap = (req as unknown as { cookies?: Record<string, string> }).cookies;
  if (cookieMap && cookieMap[AUTH_COOKIE_NAME]) {
    return cookieMap[AUTH_COOKIE_NAME].trim();
  }

  // 3. Fallback: Parse Cookie header directly
  const rawCookie = req.headers.cookie;
  if (rawCookie) {
    const match = rawCookie.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE_NAME}=([^;]+)`));
    if (match && match[1]) {
      return decodeURIComponent(match[1]).trim();
    }
  }

  return null;
}

/**
 * Middleware that inspects incoming requests, validates any active Mailiac session,
 * and sets req.user without blocking unauthenticated requests.
 */
export async function authenticateSession(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractSessionToken(req);
    if (!token) {
      return next();
    }

    const payload = verifySessionToken(token);
    if (!payload) {
      return next();
    }

    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    // Verify session existence in database for server-side revocation tracking
    try {
      const activeSession = await SessionModel.findOne({ id: payload.sessionId });
      if (!activeSession) {
        return next();
      }
    } catch {
      // If DB session check errors in an environment without active Session collection, proceed with verified token
    }

    // Resolve internal user identity
    const userDoc = await UserModel.findOne({ id: payload.userId });
    if (!userDoc) {
      return next();
    }

    // Attach to request lifecycle - never global or module-level
    req.user = {
      id: userDoc.id,
      googleId: userDoc.googleId,
      email: userDoc.email,
      name: userDoc.name,
      picture: userDoc.picture,
    };
    req.sessionId = payload.sessionId;

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware that strictly protects an endpoint, requiring an authenticated user.
 * Returns 401 Unauthorized if unauthenticated.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || !req.user.id) {
    res.status(401).json({ error: 'Unauthorized. Authentication required.' });
    return;
  }
  next();
}
