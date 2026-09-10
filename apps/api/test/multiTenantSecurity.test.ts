import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Application } from 'express';
import type { AddressInfo } from 'net';
import { reportsRouter } from '../src/routes/reports.js';
import { jobsRouter } from '../src/routes/jobs.js';
import { gmailRouter } from '../src/routes/gmail.js';
import { authRouter } from '../src/routes/auth.js';
import { authenticateSession } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/error.js';
import { signSessionToken, AUTH_COOKIE_NAME } from '../src/services/session.js';
import { AUTH_SCOPES, GMAIL_SCOPES } from '../src/services/googleAuth.js';
import type { AnalysisReport } from '@mailiac/shared-types';

// In-memory test state
interface TestUser {
  id: string;
  googleId: string;
  email: string;
  name?: string;
  picture?: string;
}

interface TestSession {
  id: string;
  userId: string;
  expiresAt: Date;
}

interface TestGmailAccount {
  _id?: string;
  userId?: string;
  sessionId?: string;
  googleAccountId?: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  scopes?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

interface TestOAuthTransaction {
  id: string;
  userId: string;
  sessionId?: string;
  expiresAt: Date;
  used: boolean;
  createdAt?: Date;
  save?: () => Promise<void>;
}

interface TestReport {
  id: string;
  userId?: string;
  messageId: string;
  senderDomain: string;
  timestamp: string;
  forensicPath: unknown[];
  authResults: {
    spf: string;
    dkim: string;
    dmarc: string;
  };
  threatIndicators: unknown[];
  finalVerdict: 'QUARANTINE' | 'FLAG' | 'SAFE';
  finalScore: number;
}

interface TestFeedback {
  reportId: string;
  userId?: string;
  classification: 'true_positive' | 'false_positive' | 'false_negative' | 'true_negative';
  analystNotes?: string;
}

const dbState = {
  users: [] as TestUser[],
  sessions: [] as TestSession[],
  gmailAccounts: [] as TestGmailAccount[],
  oauthTransactions: [] as TestOAuthTransaction[],
  reports: [] as TestReport[],
  feedbacks: [] as TestFeedback[],
};

vi.mock('@mailiac/db', () => ({
  connectDb: vi.fn().mockResolvedValue(undefined),
  UserModel: {
    findOne: vi.fn().mockImplementation((filter: { id?: string; googleId?: string }) => {
      const found = dbState.users.find((u) => {
        if (filter.id && u.id === filter.id) return true;
        if (filter.googleId && u.googleId === filter.googleId) return true;
        return false;
      });
      return Promise.resolve(found ?? null);
    }),
    create: vi.fn().mockImplementation((data: TestUser) => {
      dbState.users.push(data);
      return Promise.resolve(data);
    }),
  },
  SessionModel: {
    findOne: vi.fn().mockImplementation((filter: { id?: string }) => {
      const found = dbState.sessions.find((s) => s.id === filter.id);
      return Promise.resolve(found ?? null);
    }),
    create: vi.fn().mockImplementation((data: TestSession) => {
      dbState.sessions.push(data);
      return Promise.resolve(data);
    }),
    deleteOne: vi.fn().mockImplementation((filter: { id?: string }) => {
      const idx = dbState.sessions.findIndex((s) => s.id === filter.id);
      if (idx !== -1) dbState.sessions.splice(idx, 1);
      return Promise.resolve({ deletedCount: idx !== -1 ? 1 : 0 });
    }),
  },
  GmailAccountModel: {
    findOne: vi.fn().mockImplementation((filter: { userId?: string; sessionId?: string; _id?: string }) => {
      const found = dbState.gmailAccounts.find((a) => {
        if (filter._id && a._id === filter._id) return true;
        if (filter.userId && a.userId === filter.userId) return true;
        if (filter.sessionId && a.sessionId === filter.sessionId) return true;
        return false;
      });
      return Promise.resolve(found ?? null);
    }),
    findOneAndUpdate: vi.fn().mockImplementation(
      (filter: { userId?: string; sessionId?: string }, update: any, options?: { upsert?: boolean }) => {
        const fields = update.$set || update;
        const idx = dbState.gmailAccounts.findIndex((a) => {
          if (filter.userId && a.userId === filter.userId) return true;
          if (filter.sessionId && a.sessionId === filter.sessionId) return true;
          return false;
        });
        if (idx !== -1) {
          dbState.gmailAccounts[idx] = { ...dbState.gmailAccounts[idx], ...fields };
          return Promise.resolve(dbState.gmailAccounts[idx]);
        }
        if (options?.upsert) {
          const newDoc: TestGmailAccount = {
            _id: `gmail-conn-${Date.now()}`,
            ...filter,
            ...fields,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          dbState.gmailAccounts.push(newDoc);
          return Promise.resolve(newDoc);
        }
        return Promise.resolve(null);
      }
    ),
    deleteOne: vi.fn().mockImplementation((filter: { userId?: string; sessionId?: string; _id?: string }) => {
      const idx = dbState.gmailAccounts.findIndex((a) => {
        if (filter._id && a._id === filter._id) return true;
        if (filter.userId && a.userId === filter.userId) return true;
        if (filter.sessionId && a.sessionId === filter.sessionId) return true;
        return false;
      });
      if (idx !== -1) dbState.gmailAccounts.splice(idx, 1);
      return Promise.resolve({ deletedCount: idx !== -1 ? 1 : 0 });
    }),
  },
  OAuthTransactionModel: {
    findOne: vi.fn().mockImplementation((filter: { id?: string; used?: boolean }) => {
      const found = dbState.oauthTransactions.find((tx) => {
        if (filter.id && tx.id !== filter.id) return false;
        if (typeof filter.used === 'boolean' && tx.used !== filter.used) return false;
        return true;
      });
      if (!found) return Promise.resolve(null);
      return Promise.resolve({
        ...found,
        save: vi.fn().mockImplementation(function (this: any) {
          found.used = this.used;
          return Promise.resolve(this);
        }),
      });
    }),
    create: vi.fn().mockImplementation((data: TestOAuthTransaction) => {
      const doc: TestOAuthTransaction = {
        ...data,
        save: vi.fn().mockResolvedValue(undefined),
      };
      dbState.oauthTransactions.push(doc);
      return Promise.resolve(doc);
    }),
    findOneAndUpdate: vi.fn().mockImplementation((filter: { id?: string; used?: boolean }, update: any) => {
      const fields = update.$set || update;
      const idx = dbState.oauthTransactions.findIndex((tx) => {
        if (filter.id && tx.id !== filter.id) return false;
        if (typeof filter.used === 'boolean' && tx.used !== filter.used) return false;
        return true;
      });
      if (idx !== -1) {
        dbState.oauthTransactions[idx] = { ...dbState.oauthTransactions[idx], ...fields };
        return Promise.resolve(dbState.oauthTransactions[idx]);
      }
      return Promise.resolve(null);
    }),
  },
  AnalysisReportModel: {
    findOne: vi.fn().mockImplementation((filter: any) => {
      const found = dbState.reports.find((r) => {
        if (filter.$or && Array.isArray(filter.$or)) {
          const matchOr = filter.$or.some((clause: any) => {
            if (clause.messageId && (clause.messageId === r.messageId || clause.messageId === r.id)) return true;
            if (clause._id && (clause._id === r.id || clause._id === r.messageId)) return true;
            return false;
          });
          if (!matchOr) return false;
        }
        if (filter.messageId && filter.messageId !== r.messageId && filter.messageId !== r.id) return false;
        if (filter._id && filter._id !== r.id && filter._id !== r.messageId) return false;
        if (filter.userId && r.userId !== filter.userId) return false;
        return true;
      }) ?? null;
      return {
        lean: vi.fn().mockResolvedValue(found),
        then: (onfulfilled: any, onrejected: any) => Promise.resolve(found).then(onfulfilled, onrejected),
      };
    }),
    find: vi.fn().mockImplementation((filter: { userId?: string } = {}) => {
      const matching = dbState.reports.filter((r) => {
        if (filter.userId && r.userId !== filter.userId) return false;
        return true;
      });
      return {
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(matching),
      };
    }),
  },
  EmailAnalysisRecordModel: {
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    }),
    findOne: vi.fn().mockResolvedValue(null),
  },
  AnalystFeedbackModel: {
    findOneAndUpdate: vi.fn().mockImplementation((filter: { jobId?: string; reportId?: string }, update: any, options?: { upsert?: boolean }) => {
      const fields = update.$set || update;
      const key = filter.jobId || filter.reportId;
      const idx = dbState.feedbacks.findIndex((f) => f.reportId === key);
      if (idx !== -1) {
        dbState.feedbacks[idx] = { ...dbState.feedbacks[idx], ...fields };
        return {
          lean: vi.fn().mockResolvedValue(dbState.feedbacks[idx]),
          then: (onfulfilled: any, onrejected: any) => Promise.resolve(dbState.feedbacks[idx]).then(onfulfilled, onrejected),
        };
      }
      if (options?.upsert) {
        const newDoc: TestFeedback = {
          reportId: key ?? 'rep-unknown',
          ...fields,
        };
        dbState.feedbacks.push(newDoc);
        return {
          lean: vi.fn().mockResolvedValue(newDoc),
          then: (onfulfilled: any, onrejected: any) => Promise.resolve(newDoc).then(onfulfilled, onrejected),
        };
      }
      return {
        lean: vi.fn().mockResolvedValue(null),
        then: (onfulfilled: any, onrejected: any) => Promise.resolve(null).then(onfulfilled, onrejected),
      };
    }),
    findOne: vi.fn().mockImplementation((filter: { jobId?: string; reportId?: string; userId?: string }) => {
      const key = filter.jobId || filter.reportId;
      const found = dbState.feedbacks.find((f) => {
        if (key && f.reportId !== key) return false;
        if (filter.userId && f.userId !== filter.userId) return false;
        return true;
      }) ?? null;
      return {
        lean: vi.fn().mockResolvedValue(found),
        then: (onfulfilled: any, onrejected: any) => Promise.resolve(found).then(onfulfilled, onrejected),
      };
    }),
  },
  RawEmailModel: {
    findOne: vi.fn().mockResolvedValue(null),
    findOneAndUpdate: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../src/queue.js', () => ({
  emailQueue: {
    getJob: vi.fn(),
    add: vi.fn().mockResolvedValue({ id: 'mock-reanalyze-job-id' }),
  },
}));

vi.mock('../src/services/googleAuth.js', () => ({
  AUTH_SCOPES: ['openid', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
  GMAIL_SCOPES: ['https://www.googleapis.com/auth/gmail.readonly'],
  generateAuthUrl: vi.fn().mockImplementation((state?: string) => `https://accounts.google.com/o/oauth2/v2/auth?scope=gmail.readonly&state=${state ?? 'state-xyz'}`),
  generateUserAuthUrl: vi.fn().mockImplementation((state?: string) => `https://accounts.google.com/o/oauth2/v2/auth?scope=openid+email+profile&state=${state ?? 'state-abc'}`),
  exchangeCodeForTokens: vi.fn(),
  exchangeCodeForUserIdentity: vi.fn(),
  revokeToken: vi.fn().mockResolvedValue(undefined),
  getOAuthClient: vi.fn().mockReturnValue({ setCredentials: vi.fn() }),
  GoogleAuthError: class GoogleAuthError extends Error {},
}));

vi.mock('../src/services/gmailClient.js', () => ({
  listMessages: vi.fn().mockResolvedValue({ messages: [{ id: 'msg-001', threadId: 'thread-001' }] }),
  fetchRawMessage: vi.fn().mockResolvedValue('Received: from test; Subject: Test Phish'),
  GmailClientError: class GmailClientError extends Error {},
}));

import { emailQueue } from '../src/queue.js';
import { exchangeCodeForTokens } from '../src/services/googleAuth.js';

describe('Multi-Tenant Security & Isolation Verification', () => {
  let app: Application;
  let server: ReturnType<Application['listen']>;
  let baseUrl: string;

  // Test identities
  const userA: TestUser = {
    id: 'user-alice-111',
    googleId: 'google-sub-alice',
    email: 'alice@target-corp.com',
    name: 'Alice Analyst',
  };

  const userB: TestUser = {
    id: 'user-bob-222',
    googleId: 'google-sub-bob',
    email: 'bob@attacker-test.com',
    name: 'Bob Operator',
  };

  let tokenA: string;
  let tokenB: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset database state
    dbState.users = [userA, userB];
    dbState.sessions = [];
    dbState.gmailAccounts = [];
    dbState.oauthTransactions = [];
    dbState.reports = [];
    dbState.feedbacks = [];

    // Create valid sessions for User A and User B
    const sessionInfoA = signSessionToken({ userId: userA.id, email: userA.email });
    tokenA = sessionInfoA.token;
    dbState.sessions.push({
      id: sessionInfoA.sessionId,
      userId: userA.id,
      expiresAt: sessionInfoA.expiresAt,
    });

    const sessionInfoB = signSessionToken({ userId: userB.id, email: userB.email });
    tokenB = sessionInfoB.token;
    dbState.sessions.push({
      id: sessionInfoB.sessionId,
      userId: userB.id,
      expiresAt: sessionInfoB.expiresAt,
    });

    // Populate user-owned reports
    const reportA: TestReport = {
      id: 'rep-alice-999',
      userId: userA.id,
      messageId: '<msg-alice-01@target-corp.com>',
      senderDomain: 'target-corp.com',
      timestamp: '2026-09-01T12:00:00Z',
      forensicPath: [],
      authResults: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
      threatIndicators: [],
      finalVerdict: 'SAFE',
      finalScore: 10,
    };

    const reportB: TestReport = {
      id: 'rep-bob-888',
      userId: userB.id,
      messageId: '<msg-bob-01@evil-corp.com>',
      senderDomain: 'evil-corp.com',
      timestamp: '2026-09-01T13:00:00Z',
      forensicPath: [],
      authResults: { spf: 'fail', dkim: 'fail', dmarc: 'fail' },
      threatIndicators: [],
      finalVerdict: 'QUARANTINE',
      finalScore: 95,
    };

    dbState.reports.push(reportA, reportB);

    // Populate Gmail connections
    dbState.gmailAccounts.push({
      _id: 'alice-gmail-conn-01',
      userId: userA.id,
      googleAccountId: 'google-alice-account',
      email: 'alice@gmail.com',
      accessToken: 'access-token-alice',
      refreshToken: 'secret-refresh-token-alice-12345',
      scopes: GMAIL_SCOPES,
    });

    dbState.gmailAccounts.push({
      _id: 'bob-gmail-conn-02',
      userId: userB.id,
      googleAccountId: 'google-bob-account',
      email: 'bob@gmail.com',
      accessToken: 'access-token-bob',
      refreshToken: 'secret-refresh-token-bob-67890',
      scopes: GMAIL_SCOPES,
    });

    // Setup Express App matching server.ts routing
    app = express();
    app.use(express.json());
    app.use(authenticateSession);

    app.use('/api/auth', authRouter);
    app.use('/api/gmail', gmailRouter);
    app.use('/api', reportsRouter);
    app.use('/api', jobsRouter);
    app.use(errorHandler);

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

  // =========================================================================
  // 1. REPORT MULTI-TENANCY & IDOR PREVENTION
  // =========================================================================
  describe('Report Multi-Tenancy & IDOR', () => {
    it('User A CAN access User A report', async () => {
      const res = await fetch(`${baseUrl}/api/reports/rep-alice-999`, {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${tokenA}` },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as AnalysisReport;
      expect(data.messageId).toBe('<msg-alice-01@target-corp.com>');
    });

    it('User A CANNOT access User B report (IDOR blocked with 403)', async () => {
      const res = await fetch(`${baseUrl}/api/reports/rep-bob-888`, {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${tokenA}` },
      });
      expect(res.status).toBe(403);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain('Access denied');
    });

    it('User A CAN generate PDF for User A report', async () => {
      const res = await fetch(`${baseUrl}/api/reports/rep-alice-999/pdf`, {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${tokenA}` },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
    });

    it('User A CANNOT generate PDF for User B report (IDOR blocked with 403)', async () => {
      const res = await fetch(`${baseUrl}/api/reports/rep-bob-888/pdf`, {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${tokenA}` },
      });
      expect(res.status).toBe(403);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain('Access denied');
    });

    it('User A CAN submit analyst feedback for User A report', async () => {
      const res = await fetch(`${baseUrl}/api/reports/rep-alice-999/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${AUTH_COOKIE_NAME}=${tokenA}`,
        },
        body: JSON.stringify({
          analystVerdict: 'CONFIRMED_TRUE_POSITIVE',
          notes: 'Verified benign newsletter',
        }),
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { feedback: TestFeedback };
      expect(data.feedback.userId).toBe(userA.id);
    });

    it('User A CANNOT submit analyst feedback for User B report (IDOR blocked with 403)', async () => {
      const res = await fetch(`${baseUrl}/api/reports/rep-bob-888/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${AUTH_COOKIE_NAME}=${tokenA}`,
        },
        body: JSON.stringify({
          analystVerdict: 'FALSE_POSITIVE',
          notes: 'Malicious tampering attempt',
        }),
      });
      expect(res.status).toBe(403);
    });

    it('User A CANNOT view feedback for User B report (IDOR blocked with 403)', async () => {
      // Seed feedback on Report B owned by Bob
      dbState.feedbacks.push({
        reportId: 'rep-bob-888',
        userId: userB.id,
        classification: 'false_positive',
      });

      const res = await fetch(`${baseUrl}/api/reports/rep-bob-888/feedback`, {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${tokenA}` },
      });
      expect(res.status).toBe(403);
    });

    it('User A CANNOT trigger re-analysis on User B report (IDOR blocked with 403)', async () => {
      const res = await fetch(`${baseUrl}/api/reports/rep-bob-888/reanalyze`, {
        method: 'POST',
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${tokenA}` },
      });
      expect(res.status).toBe(403);
    });

    it('GET /api/reports/history returns ONLY reports belonging to authenticated user', async () => {
      const res = await fetch(`${baseUrl}/api/reports/history`, {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${tokenA}` },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { records: TestReport[] };
      // Should contain Alice's report, and NOT Bob's
      expect(data.records.every((r) => r.userId === userA.id)).toBe(true);
      expect(data.records.some((r) => r.id === 'rep-bob-888')).toBe(false);
    });

    it('Ignores client-supplied userId parameter in query string or body', async () => {
      // Alice tries to spoof userId=user-bob-222
      const res = await fetch(`${baseUrl}/api/reports/history?userId=${userB.id}`, {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${tokenA}` },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { records: TestReport[] };
      // Server must ignore query userId and use req.user.id
      expect(data.records.every((r) => r.userId === userA.id)).toBe(true);
    });
  });

  // =========================================================================
  // 2. JOB STATUS MULTI-TENANCY & AUTHORIZATION
  // =========================================================================
  describe('Job Status Multi-Tenancy', () => {
    it('User A CAN inspect status of job owned by User A', async () => {
      (emailQueue.getJob as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'job-alice-100',
        data: { userId: userA.id },
        getState: vi.fn().mockResolvedValue('completed'),
        returnvalue: { reportId: 'rep-alice-999' },
      });

      const res = await fetch(`${baseUrl}/api/jobs/job-alice-100`, {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${tokenA}` },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { jobId: string; status: string };
      expect(data.jobId).toBe('job-alice-100');
      expect(data.status).toBe('completed');
    });

    it('User A CANNOT inspect status of job owned by User B (403 Forbidden)', async () => {
      (emailQueue.getJob as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'job-bob-200',
        data: { userId: userB.id },
        getState: vi.fn().mockResolvedValue('active'),
      });

      const res = await fetch(`${baseUrl}/api/jobs/job-bob-200`, {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${tokenA}` },
      });
      expect(res.status).toBe(403);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain('Access denied');
    });

    it('Unauthenticated request cannot inspect user-owned job (401 Unauthorized)', async () => {
      (emailQueue.getJob as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'job-alice-100',
        data: { userId: userA.id },
        getState: vi.fn().mockResolvedValue('active'),
      });

      const res = await fetch(`${baseUrl}/api/jobs/job-alice-100`);
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 3. GMAIL CONNECTION ISOLATION & DISCONNECT
  // =========================================================================
  describe('Gmail Connection Isolation', () => {
    it('User A GET /api/gmail/status returns User A connection, not User B', async () => {
      const res = await fetch(`${baseUrl}/api/gmail/status`, {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${tokenA}` },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { connected: boolean; email: string };
      expect(data.connected).toBe(true);
      expect(data.email).toBe('alice@gmail.com');
    });

    it('User A fetches Gmail messages without leaking User B mailbox', async () => {
      const res = await fetch(`${baseUrl}/api/gmail/messages`, {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${tokenA}` },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { messages: unknown[] };
      expect(Array.isArray(data.messages)).toBe(true);
    });

    it('User A disconnecting Gmail removes ONLY User A connection; User B remains intact', async () => {
      const res = await fetch(`${baseUrl}/api/gmail/disconnect`, {
        method: 'DELETE',
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${tokenA}` },
      });
      expect(res.status).toBe(200);

      // Verify User A is disconnected
      const aliceConn = dbState.gmailAccounts.find((a) => a.userId === userA.id);
      expect(aliceConn).toBeUndefined();

      // Verify User B's connection was completely untouched
      const bobConn = dbState.gmailAccounts.find((a) => a.userId === userB.id);
      expect(bobConn).toBeDefined();
      expect(bobConn?.email).toBe('bob@gmail.com');
    });
  });

  // =========================================================================
  // 4. OAUTH INCREMENTAL CONSENT & TRANSACTION STATE SECURITY
  // =========================================================================
  describe('OAuth Incremental Consent & State Validation', () => {
    it('Login flow requests strictly openid, email, profile and NO gmail scopes', () => {
      expect(AUTH_SCOPES).toContain('openid');
      expect(AUTH_SCOPES).not.toContain('https://www.googleapis.com/auth/gmail.readonly');
    });

    it('Gmail connection flow requests gmail.readonly', () => {
      expect(GMAIL_SCOPES).toContain('https://www.googleapis.com/auth/gmail.readonly');
    });

    it('Unauthenticated caller to protected endpoint /api/auth/me is rejected (401 Unauthorized)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`);
      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain('Unauthorized');
    });

    it('User A starting Gmail OAuth generates OAuthTransaction bound strictly to User A', async () => {
      const res = await fetch(`${baseUrl}/api/gmail/auth/url`, {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${tokenA}` },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { url: string; sessionId: string };
      expect(data.url).toContain('https://accounts.google.com');

      // Verify transaction was persisted and owned by Alice
      const tx = dbState.oauthTransactions.find((t) => t.userId === userA.id);
      expect(tx).toBeDefined();
      expect(tx?.userId).toBe(userA.id);
      expect(tx?.used).toBe(false);
    });

    it('Account confusion attack: User B cannot complete callback using User A OAuth transaction (403 Forbidden)', async () => {
      // Alice initiates OAuth
      const stateId = 'alice-oauth-tx-123';
      dbState.oauthTransactions.push({
        id: stateId,
        userId: userA.id,
        expiresAt: new Date(Date.now() + 600000),
        used: false,
        save: vi.fn().mockResolvedValue(undefined),
      });

      (exchangeCodeForTokens as ReturnType<typeof vi.fn>).mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        email: 'alice-personal@gmail.com',
        googleAccountId: 'g-alice-pers',
        scopes: GMAIL_SCOPES,
      });

      // Bob tries to consume Alice's OAuth state
      const res = await fetch(`${baseUrl}/api/gmail/auth/callback?code=mock-code&state=${stateId}`, {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${tokenB}` },
        redirect: 'manual',
      });
      expect(res.status).toBe(403);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain('OAuth transaction does not match authenticated user');
    });

    it('Reused OAuth transaction is rejected (400 Bad Request)', async () => {
      const stateId = 'used-oauth-tx-456';
      dbState.oauthTransactions.push({
        id: stateId,
        userId: userA.id,
        expiresAt: new Date(Date.now() + 600000),
        used: true, // Already used
        save: vi.fn().mockResolvedValue(undefined),
      });

      const res = await fetch(`${baseUrl}/api/gmail/auth/callback?code=mock-code&state=${stateId}`, {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${tokenA}` },
        redirect: 'manual',
      });
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain('OAuth transaction has already been used');
    });

    it('Expired OAuth transaction is rejected (400 Bad Request)', async () => {
      const stateId = 'expired-oauth-tx-789';
      dbState.oauthTransactions.push({
        id: stateId,
        userId: userA.id,
        expiresAt: new Date(Date.now() - 5000), // Expired
        used: false,
        save: vi.fn().mockResolvedValue(undefined),
      });

      const res = await fetch(`${baseUrl}/api/gmail/auth/callback?code=mock-code&state=${stateId}`, {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${tokenA}` },
        redirect: 'manual',
      });
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain('OAuth transaction has expired');
    });

    it('User A connecting Google account binds GmailConnection.userId to User A (not Google sub)', async () => {
      const stateId = 'alice-valid-oauth-tx';
      dbState.oauthTransactions.push({
        id: stateId,
        userId: userA.id,
        expiresAt: new Date(Date.now() + 600000),
        used: false,
        save: vi.fn().mockResolvedValue(undefined),
      });

      (exchangeCodeForTokens as ReturnType<typeof vi.fn>).mockResolvedValue({
        accessToken: 'new-token',
        refreshToken: 'new-refresh-token',
        email: 'alice-personal@gmail.com',
        googleAccountId: 'arbitrary-google-account-id',
        scopes: GMAIL_SCOPES,
      });

      const res = await fetch(`${baseUrl}/api/gmail/auth/callback?code=valid-code&state=${stateId}`, {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${tokenA}` },
        redirect: 'manual',
      });
      // Redirects to /mailbox?connected=true
      expect(res.status).toBe(302);

      // Verify transaction marked used
      const tx = dbState.oauthTransactions.find((t) => t.id === stateId);
      expect(tx?.used).toBe(true);

      // Verify connection is owned by userA.id
      const savedConn = dbState.gmailAccounts.find((a) => a.email === 'alice-personal@gmail.com');
      expect(savedConn?.userId).toBe(userA.id);
      expect(savedConn?.googleAccountId).toBe('arbitrary-google-account-id');
    });
  });

  // =========================================================================
  // 5. CREDENTIAL STORAGE & TOKEN PROTECTION
  // =========================================================================
  describe('Credential Storage & Token Protection', () => {
    it('GET /api/gmail/status NEVER exposes refresh token or access token', async () => {
      const res = await fetch(`${baseUrl}/api/gmail/status`, {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${tokenA}` },
      });
      const data = (await res.json()) as Record<string, unknown>;
      expect(data).not.toHaveProperty('refreshToken');
      expect(data).not.toHaveProperty('accessToken');
      expect(JSON.stringify(data)).not.toContain('secret-refresh-token');
    });

    it('GET /api/auth/me NEVER exposes credentials or refresh tokens', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Cookie: `${AUTH_COOKIE_NAME}=${tokenA}` },
      });
      const data = (await res.json()) as Record<string, unknown>;
      expect(data).not.toHaveProperty('refreshToken');
      expect(data).not.toHaveProperty('accessToken');
      expect(JSON.stringify(data)).not.toContain('secret-refresh-token');
    });
  });
});
