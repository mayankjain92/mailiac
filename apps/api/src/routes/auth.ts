import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { connectDb, UserModel, SessionModel, OAuthTransactionModel } from '@mailiac/db';
import {
  generateUserAuthUrl,
  exchangeCodeForUserIdentity,
  getUserAuthRedirectUri,
} from '../services/googleAuth.js';
import {
  signSessionToken,
  AUTH_COOKIE_NAME,
  getAuthCookieOptions,
  getClearAuthCookieOptions,
} from '../services/session.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter: IRouter = Router();

/**
 * GET /auth/google/url & /auth/url
 * Generates the Google OAuth 2.0 consent URL for Mailiac user login
 * requesting exclusively identity scopes (openid, email, profile).
 */
authRouter.get(['/google/url', '/url'], async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawState = req.query['state'];
    const state =
      typeof rawState === 'string' && rawState.trim()
        ? (rawState.trim().startsWith('login_') ? rawState.trim() : `login_${rawState.trim()}`)
        : `login_${randomUUID()}`;

    try {
      const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
      await connectDb(mongoUri);
      if (OAuthTransactionModel && typeof OAuthTransactionModel.create === 'function') {
        await OAuthTransactionModel.create({
          id: state,
          action: 'login',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          used: false,
        });
      }
    } catch {
      // Non-fatal if DB is offline during unit tests
    }

    const url = generateUserAuthUrl(state);
    res.json({ url, state });
  } catch (err) {
    next(err);
  }
});

/**
 * Core handler for Google OAuth login callback.
 * Shared between authRouter and gmailRouter so single-callback OAuth setups work seamlessly.
 */
export async function handleUserLoginCallback(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const code = req.query['code'];
    const state = req.query['state'];
    const frontendUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';

    if (!code || typeof code !== 'string' || code.trim() === '') {
      res.status(400).json({ error: 'Authorization code is required.' });
      return;
    }

    const redirectUri = getUserAuthRedirectUri();
    const identity = await exchangeCodeForUserIdentity(code.trim(), redirectUri);

    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    if (
      typeof state === 'string' &&
      state.trim() !== '' &&
      OAuthTransactionModel &&
      typeof OAuthTransactionModel.updateOne === 'function'
    ) {
      await OAuthTransactionModel.updateOne({ id: state.trim() }, { used: true }).catch(() => {});
    }

    // 1. Resolve or create Mailiac user using internal UUID (never Google ID as ownership key)
    let user = await UserModel.findOne({ googleId: identity.googleId });

    if (!user) {
      user = await UserModel.create({
        id: randomUUID(),
        googleId: identity.googleId,
        email: identity.email,
        name: identity.name,
        picture: identity.picture,
      });
    } else {
      let isDirty = false;
      if (identity.name && user.name !== identity.name) {
        user.name = identity.name;
        isDirty = true;
      }
      if (identity.picture && user.picture !== identity.picture) {
        user.picture = identity.picture;
        isDirty = true;
      }
      if (identity.email && user.email !== identity.email) {
        user.email = identity.email;
        isDirty = true;
      }
      if (isDirty) {
        await user.save();
      }
    }

    // 2. Establish authenticated session
    const { token, sessionId, expiresAt } = signSessionToken({
      userId: user.id,
      email: user.email,
    });

    // Persist session in MongoDB for server-side revocation tracking
    await SessionModel.create({
      id: sessionId,
      userId: user.id,
      expiresAt,
    });

    // 3. Set secure httpOnly cookie
    res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());

    // 4. Return JSON for API callers or redirect for browsers
    if (req.headers.accept?.includes('application/json')) {
      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          googleId: user.googleId,
          email: user.email,
          name: user.name,
          picture: user.picture,
        },
      });
      return;
    }

    res.redirect(`${frontendUrl}/?auth=success`);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /auth/google/callback & /auth/callback
 * Handles Google OAuth redirect, verifies Google user identity without Gmail scopes,
 * resolves or creates a stable Mailiac User record, establishes an authenticated session,
 * sets the secure httpOnly cookie, and redirects or returns JSON.
 */
authRouter.get(['/google/callback', '/callback'], handleUserLoginCallback);

/**
 * GET /auth/me
 * Returns the authenticated Mailiac user. Returns 401 if unauthenticated.
 */
authRouter.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    const user = await UserModel.findOne({ id: req.user!.id });
    if (!user) {
      res.status(401).json({ error: 'User not found.' });
      return;
    }

    const userObj = {
      id: user.id,
      googleId: user.googleId,
      email: user.email,
      name: user.name,
      picture: user.picture,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.json({
      ...userObj,
      user: userObj,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/logout
 * Terminates the active Mailiac session and clears the session cookie.
 */
authRouter.post('/logout', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.sessionId) {
      const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
      await connectDb(mongoUri);
      await SessionModel.deleteOne({ id: req.sessionId });
    }

    res.cookie(AUTH_COOKIE_NAME, '', getClearAuthCookieOptions());
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
});
