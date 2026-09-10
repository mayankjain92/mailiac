import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Application } from 'express';
import type { AddressInfo } from 'net';
import { authRouter } from '../src/routes/auth.js';
import { authenticateSession, requireAuth } from '../src/middleware/auth.js';
import {
  signSessionToken,
  AUTH_COOKIE_NAME,
} from '../src/services/session.js';
import { AUTH_SCOPES, type GoogleUserIdentity } from '../src/services/googleAuth.js';

// In-memory mock database state
interface MockUserDoc {
  id: string;
  googleId: string;
  email: string;
  name?: string;
  picture?: string;
  createdAt: Date;
  updatedAt: Date;
  save: () => Promise<void>;
}

interface MockSessionDoc {
  id: string;
  userId: string;
  expiresAt: Date;
}

const mockUsers: MockUserDoc[] = [];
const mockSessions: MockSessionDoc[] = [];
const mockGmailAccounts: Record<string, unknown>[] = [];

vi.mock('@mailiac/db', () => ({
  connectDb: vi.fn().mockResolvedValue(undefined),
  UserModel: {
    findOne: vi.fn().mockImplementation((filter: { id?: string; googleId?: string }) => {
      const found = mockUsers.find((u) => {
        if (filter.id && u.id === filter.id) return true;
        if (filter.googleId && u.googleId === filter.googleId) return true;
        return false;
      });
      return Promise.resolve(found ?? null);
    }),
    create: vi.fn().mockImplementation((data: {
      id: string;
      googleId: string;
      email: string;
      name?: string;
      picture?: string;
    }) => {
      const now = new Date();
      const newDoc: MockUserDoc = {
        ...data,
        createdAt: now,
        updatedAt: now,
        save: vi.fn().mockResolvedValue(undefined),
      };
      mockUsers.push(newDoc);
      return Promise.resolve(newDoc);
    }),
  },
  SessionModel: {
    findOne: vi.fn().mockImplementation((filter: { id?: string }) => {
      const found = mockSessions.find((s) => s.id === filter.id);
      return Promise.resolve(found ?? null);
    }),
    create: vi.fn().mockImplementation((data: MockSessionDoc) => {
      mockSessions.push(data);
      return Promise.resolve(data);
    }),
    deleteOne: vi.fn().mockImplementation((filter: { id?: string }) => {
      const idx = mockSessions.findIndex((s) => s.id === filter.id);
      if (idx !== -1) mockSessions.splice(idx, 1);
      return Promise.resolve({ deletedCount: idx !== -1 ? 1 : 0 });
    }),
  },
  GmailAccountModel: {
    findOne: vi.fn().mockImplementation(() => {
      throw new Error('GmailAccountModel should NOT be accessed during Mailiac authentication!');
    }),
    create: vi.fn().mockImplementation((data: Record<string, unknown>) => {
      mockGmailAccounts.push(data);
      return Promise.resolve(data);
    }),
  },
}));

vi.mock('../src/services/googleAuth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/googleAuth.js')>();
  return {
    ...actual,
    generateUserAuthUrl: vi.fn().mockImplementation((state?: string) => {
      return `https://accounts.google.com/o/oauth2/v2/auth?scope=openid+email+profile&state=${state ?? 'state-1'}`;
    }),
    exchangeCodeForUserIdentity: vi.fn(),
  };
});

import { exchangeCodeForUserIdentity } from '../src/services/googleAuth.js';
import { UserModel, SessionModel, GmailAccountModel } from '@mailiac/db';

describe('Mailiac Authentication Foundation (apps/api)', () => {
  let server: ReturnType<Application['listen']>;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUsers.length = 0;
    mockSessions.length = 0;
    mockGmailAccounts.length = 0;
    process.env['FRONTEND_URL'] = 'http://localhost:3000';
    process.env['AUTH_SECRET'] = 'test-secret-key-for-auth-unit-testing-32chars';

    const app = express();
    app.use(express.json());
    app.use(authenticateSession);
    app.use('/auth', authRouter);
    app.use('/api/auth', authRouter);

    // Protected dummy endpoint to test arbitrary downstream handlers
    app.get('/api/protected-resource', requireAuth, (req, res) => {
      res.json({ message: 'Secret data', userId: req.user?.id, email: req.user?.email });
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(() => {
    server?.close();
  });

  describe('1. first Google login creates user', () => {
    it('creates a new User record with an internal Mailiac userId and sets httpOnly session cookie', async () => {
      const mockIdentity: GoogleUserIdentity = {
        googleId: 'google-sub-alpha',
        email: 'alice@target-corp.com',
        name: 'Alice Investigator',
        picture: 'https://avatar.google.com/alice',
      };

      vi.mocked(exchangeCodeForUserIdentity).mockResolvedValueOnce(mockIdentity);

      const res = await fetch(`${baseUrl}/api/auth/google/callback?code=auth-code-1`, {
        headers: { Accept: 'application/json' },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean; token: string; user: { id: string; email: string } };

      expect(data.success).toBe(true);
      expect(data.user.email).toBe('alice@target-corp.com');
      // Assert internal userId is generated and distinct from googleId
      expect(data.user.id).toBeDefined();
      expect(data.user.id).not.toBe('google-sub-alpha');

      // Verify User record was stored in DB
      expect(mockUsers.length).toBe(1);
      expect(mockUsers[0].googleId).toBe('google-sub-alpha');
      expect(mockUsers[0].id).toBe(data.user.id);

      // Verify session was recorded in DB
      expect(mockSessions.length).toBe(1);
      expect(mockSessions[0].userId).toBe(data.user.id);

      // Verify httpOnly cookie was set in response
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain(`${AUTH_COOKIE_NAME}=`);
      expect(setCookie?.toLowerCase()).toContain('httponly');
      expect(setCookie?.toLowerCase()).toContain('samesite=lax');
    });
  });

  describe('2. repeated Google login resolves same user', () => {
    it('resolves the existing User record without creating duplicates or altering internal userId', async () => {
      const mockIdentity: GoogleUserIdentity = {
        googleId: 'google-sub-alpha',
        email: 'alice@target-corp.com',
        name: 'Alice Investigator',
        picture: 'https://avatar.google.com/alice',
      };

      vi.mocked(exchangeCodeForUserIdentity).mockResolvedValue(mockIdentity);

      // First login
      const res1 = await fetch(`${baseUrl}/api/auth/google/callback?code=code-1`, {
        headers: { Accept: 'application/json' },
      });
      const data1 = (await res1.json()) as { user: { id: string } };
      const firstUserId = data1.user.id;
      expect(mockUsers.length).toBe(1);

      // Second login with identical Google identity
      const res2 = await fetch(`${baseUrl}/api/auth/google/callback?code=code-2`, {
        headers: { Accept: 'application/json' },
      });
      const data2 = (await res2.json()) as { user: { id: string } };

      // User count must still be 1 (no duplicate)
      expect(mockUsers.length).toBe(1);
      // Resolved Mailiac userId must be strictly identical
      expect(data2.user.id).toBe(firstUserId);
    });
  });

  describe('3. two Google identities produce two users', () => {
    it('creates two completely distinct User records with distinct internal Mailiac userIds', async () => {
      vi.mocked(exchangeCodeForUserIdentity)
        .mockResolvedValueOnce({
          googleId: 'google-sub-1',
          email: 'analyst1@company.com',
          name: 'Analyst 1',
        })
        .mockResolvedValueOnce({
          googleId: 'google-sub-2',
          email: 'analyst2@company.com',
          name: 'Analyst 2',
        });

      // User 1 login
      const res1 = await fetch(`${baseUrl}/api/auth/google/callback?code=code-user-1`, {
        headers: { Accept: 'application/json' },
      });
      const data1 = (await res1.json()) as { user: { id: string; email: string } };

      // User 2 login
      const res2 = await fetch(`${baseUrl}/api/auth/google/callback?code=code-user-2`, {
        headers: { Accept: 'application/json' },
      });
      const data2 = (await res2.json()) as { user: { id: string; email: string } };

      expect(mockUsers.length).toBe(2);
      expect(data1.user.id).not.toBe(data2.user.id);
      expect(data1.user.email).toBe('analyst1@company.com');
      expect(data2.user.email).toBe('analyst2@company.com');
      expect(data1.user.id).not.toBe('google-sub-1');
      expect(data2.user.id).not.toBe('google-sub-2');
    });
  });

  describe('4. authenticated /auth/me', () => {
    it('returns 200 and the authenticated user identity via cookie', async () => {
      const now = new Date();
      const testUser: MockUserDoc = {
        id: 'usr-uuid-bob-123',
        googleId: 'google-sub-bob',
        email: 'bob@security.io',
        name: 'Bob Forensic',
        picture: 'https://avatar.google.com/bob',
        createdAt: now,
        updatedAt: now,
        save: vi.fn().mockResolvedValue(undefined),
      };
      mockUsers.push(testUser);

      const { token, sessionId, expiresAt } = signSessionToken({
        userId: testUser.id,
        email: testUser.email,
      });
      mockSessions.push({ id: sessionId, userId: testUser.id, expiresAt });

      // Test GET /auth/me
      const res = await fetch(`${baseUrl}/auth/me`, {
        headers: {
          Cookie: `${AUTH_COOKIE_NAME}=${token}`,
        },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string; email: string; name: string; user: { id: string } };
      expect(body.id).toBe('usr-uuid-bob-123');
      expect(body.email).toBe('bob@security.io');
      expect(body.name).toBe('Bob Forensic');
      expect(body.user.id).toBe('usr-uuid-bob-123');

      // Test GET /api/auth/me alias
      const resApi = await fetch(`${baseUrl}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      expect(resApi.status).toBe(200);
      const apiBody = (await resApi.json()) as { id: string };
      expect(apiBody.id).toBe('usr-uuid-bob-123');
    });

    it('exposes req.user down to protected handlers', async () => {
      const now = new Date();
      mockUsers.push({
        id: 'usr-uuid-claire',
        googleId: 'google-sub-claire',
        email: 'claire@corp.com',
        createdAt: now,
        updatedAt: now,
        save: vi.fn().mockResolvedValue(undefined),
      });

      const { token, sessionId, expiresAt } = signSessionToken({
        userId: 'usr-uuid-claire',
        email: 'claire@corp.com',
      });
      mockSessions.push({ id: sessionId, userId: 'usr-uuid-claire', expiresAt });

      const res = await fetch(`${baseUrl}/api/protected-resource`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { userId: string; email: string };
      expect(data.userId).toBe('usr-uuid-claire');
      expect(data.email).toBe('claire@corp.com');
    });
  });

  describe('5. unauthenticated /auth/me', () => {
    it('returns 401 when no session credentials are provided', async () => {
      const res = await fetch(`${baseUrl}/auth/me`);
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain('Unauthorized');
    });

    it('returns 401 when an invalid token is provided', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=invalid.tampered.token` },
      });
      expect(res.status).toBe(401);
    });

    it('returns 401 on protected downstream routes when unauthenticated', async () => {
      const res = await fetch(`${baseUrl}/api/protected-resource`);
      expect(res.status).toBe(401);
    });
  });

  describe('6. logout', () => {
    it('invalidates server-side session, clears auth cookie, and subsequent /auth/me returns 401', async () => {
      const now = new Date();
      mockUsers.push({
        id: 'usr-david',
        googleId: 'google-sub-david',
        email: 'david@target.com',
        createdAt: now,
        updatedAt: now,
        save: vi.fn().mockResolvedValue(undefined),
      });

      const { token, sessionId, expiresAt } = signSessionToken({
        userId: 'usr-david',
        email: 'david@target.com',
      });
      mockSessions.push({ id: sessionId, userId: 'usr-david', expiresAt });

      expect(mockSessions.length).toBe(1);

      // Perform logout
      const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Cookie: `${AUTH_COOKIE_NAME}=${token}`,
        },
      });

      expect(logoutRes.status).toBe(200);
      const logoutBody = (await logoutRes.json()) as { success: boolean };
      expect(logoutBody.success).toBe(true);

      // Verify session was removed from database
      expect(mockSessions.length).toBe(0);

      // Verify Set-Cookie header wiped the cookie
      const setCookie = logoutRes.headers.get('set-cookie');
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain(`${AUTH_COOKIE_NAME}=`);
      expect(setCookie).toMatch(/(?:Max-Age=0|Expires=Thu, 01 Jan 1970)/i);

      // Subsequent /auth/me request using the old token must receive 401
      const meRes = await fetch(`${baseUrl}/auth/me`, {
        headers: {
          Cookie: `${AUTH_COOKIE_NAME}=${token}`,
        },
      });
      expect(meRes.status).toBe(401);
    });
  });

  describe('7. session isolation', () => {
    it('isolates concurrent requests between User A and User B with zero state leakage', async () => {
      const now = new Date();
      mockUsers.push(
        {
          id: 'usr-alpha',
          googleId: 'sub-alpha',
          email: 'alpha@enterprise.org',
          name: 'Agent Alpha',
          createdAt: now,
          updatedAt: now,
          save: vi.fn().mockResolvedValue(undefined),
        },
        {
          id: 'usr-beta',
          googleId: 'sub-beta',
          email: 'beta@enterprise.org',
          name: 'Agent Beta',
          createdAt: now,
          updatedAt: now,
          save: vi.fn().mockResolvedValue(undefined),
        }
      );

      const sessionA = signSessionToken({ userId: 'usr-alpha', email: 'alpha@enterprise.org' });
      const sessionB = signSessionToken({ userId: 'usr-beta', email: 'beta@enterprise.org' });

      mockSessions.push(
        { id: sessionA.sessionId, userId: 'usr-alpha', expiresAt: sessionA.expiresAt },
        { id: sessionB.sessionId, userId: 'usr-beta', expiresAt: sessionB.expiresAt }
      );

      // Fire concurrent requests interleaved
      const [resA1, resB1, resA2, resB2] = await Promise.all([
        fetch(`${baseUrl}/auth/me`, { headers: { Cookie: `${AUTH_COOKIE_NAME}=${sessionA.token}` } }),
        fetch(`${baseUrl}/auth/me`, { headers: { Cookie: `${AUTH_COOKIE_NAME}=${sessionB.token}` } }),
        fetch(`${baseUrl}/auth/me`, { headers: { Cookie: `${AUTH_COOKIE_NAME}=${sessionA.token}` } }),
        fetch(`${baseUrl}/auth/me`, { headers: { Cookie: `${AUTH_COOKIE_NAME}=${sessionB.token}` } }),
      ]);

      const [bodyA1, bodyB1, bodyA2, bodyB2] = await Promise.all([
        resA1.json() as Promise<{ id: string; email: string }>,
        resB1.json() as Promise<{ id: string; email: string }>,
        resA2.json() as Promise<{ id: string; email: string }>,
        resB2.json() as Promise<{ id: string; email: string }>,
      ]);

      expect(bodyA1.id).toBe('usr-alpha');
      expect(bodyA1.email).toBe('alpha@enterprise.org');

      expect(bodyB1.id).toBe('usr-beta');
      expect(bodyB1.email).toBe('beta@enterprise.org');

      expect(bodyA2.id).toBe('usr-alpha');
      expect(bodyB2.id).toBe('usr-beta');
    });
  });

  describe('8. no Gmail token required for normal login', () => {
    it('uses exclusively openid, email, and profile scopes and never touches Gmail tokens or models', async () => {
      // Check auth url scopes
      const urlRes = await fetch(`${baseUrl}/api/auth/google/url`);
      expect(urlRes.status).toBe(200);
      const urlData = (await urlRes.json()) as { url: string };
      expect(urlData.url).toContain('scope=openid+email+profile');

      // Assert AUTH_SCOPES contains ONLY identity scopes and zero Gmail scopes
      for (const scope of AUTH_SCOPES) {
        expect(scope).not.toContain('gmail');
      }

      // Simulate login with minimal identity only
      vi.mocked(exchangeCodeForUserIdentity).mockResolvedValueOnce({
        googleId: 'google-identity-only-999',
        email: 'pure-auth@company.com',
        name: 'Pure Auth User',
      });

      const callbackRes = await fetch(`${baseUrl}/api/auth/google/callback?code=pure-code`, {
        headers: { Accept: 'application/json' },
      });

      expect(callbackRes.status).toBe(200);

      // Verify zero GmailAccount records were created
      expect(mockGmailAccounts.length).toBe(0);
      expect(GmailAccountModel.create).not.toHaveBeenCalled();

      // Verify user was successfully created and authenticated
      expect(mockUsers.some((u) => u.email === 'pure-auth@company.com')).toBe(true);
    });

    it('uses GOOGLE_AUTH_REDIRECT_URI when exchanging code for identity', async () => {
      process.env['GOOGLE_AUTH_REDIRECT_URI'] = 'http://localhost:4000/api/auth/google/callback';
      process.env['GOOGLE_REDIRECT_URI'] = 'http://localhost:4000/api/integrations/gmail/callback';

      vi.mocked(exchangeCodeForUserIdentity).mockResolvedValueOnce({
        googleId: 'google-redirect-test-123',
        email: 'redirect@company.com',
      });

      const res = await fetch(`${baseUrl}/api/auth/google/callback?code=test-code-99`, {
        headers: { Accept: 'application/json' },
      });

      expect(res.status).toBe(200);
      expect(exchangeCodeForUserIdentity).toHaveBeenCalledWith(
        'test-code-99',
        'http://localhost:4000/api/auth/google/callback'
      );
    });
  });
});
