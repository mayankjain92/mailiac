import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Application } from 'express';
import type { AddressInfo } from 'net';
import { uploadRouter } from '../src/routes/upload.js';
import { jobsRouter } from '../src/routes/jobs.js';
import { reportsRouter } from '../src/routes/reports.js';
import { gmailRouter } from '../src/routes/gmail.js';
import { authRouter } from '../src/routes/auth.js';
import { authenticateSession } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/error.js';
import { signSessionToken, AUTH_COOKIE_NAME } from '../src/services/session.js';

// In-memory mock database state
interface MockUser {
  id: string;
  email: string;
  name: string;
}

interface MockSession {
  id: string;
  userId: string;
  expiresAt: Date;
}

interface MockReport {
  _id: string;
  messageId: string;
  userId?: string;
  senderDomain: string;
  timestamp: string;
  forensicPath: unknown[];
  authResults: {
    spf: string;
    dkim: string;
    dmarcAlignment: string;
    arcPass: boolean;
    authScore: number;
    findings: unknown[];
  };
  riskMatrix: {
    authScore: number;
    identityScore: number;
    ipScore: number;
    nlpScore: number;
    finalScore: number;
  };
  aiSummary: {
    urgency: number;
    intent: string[];
    integrityHash: string;
    findings: unknown[];
  };
}

interface MockEmailRecord {
  jobId: string;
  userId?: string;
  source: 'eml' | 'gmail';
  senderDomain: string;
  finalScore: number;
  verdict: 'QUARANTINE' | 'FLAG' | 'SAFE';
  authScore: number;
  identityScore: number;
  ipScore: number;
  nlpScore: number;
  timestamp: string;
  createdAt: Date;
}

interface MockGmailAccount {
  _id: string;
  userId?: string;
  sessionId?: string;
  email: string;
  accessToken: string;
  tokenExpiry: Date;
}

interface MockFeedback {
  jobId: string;
  userId?: string;
  analystVerdict: string;
}

const db = {
  users: [] as MockUser[],
  sessions: [] as MockSession[],
  reports: [] as MockReport[],
  emailRecords: [] as MockEmailRecord[],
  gmailAccounts: [] as MockGmailAccount[],
  feedbacks: [] as MockFeedback[],
};

vi.mock('../src/queue.js', () => ({
  emailQueue: {
    add: vi.fn().mockResolvedValue({ id: 'mock-bullmq-job-id' }),
    getJob: vi.fn(),
  },
}));

vi.mock('../src/services/googleAuth.js', () => ({
  generateUserAuthUrl: vi.fn().mockReturnValue('https://accounts.google.com/auth'),
  generateAuthUrl: vi.fn().mockReturnValue('https://accounts.google.com/gmail'),
  exchangeCodeForUserIdentity: vi.fn(),
  exchangeCodeForTokens: vi.fn(),
  revokeToken: vi.fn().mockResolvedValue(undefined),
  getOAuthClient: vi.fn().mockReturnValue({ setCredentials: vi.fn() }),
  getUserAuthRedirectUri: vi.fn().mockReturnValue('http://localhost:4000/api/auth/google/callback'),
  getGmailAuthRedirectUri: vi.fn().mockReturnValue('http://localhost:4000/api/integrations/gmail/callback'),
}));

vi.mock('../src/services/gmailClient.js', () => ({
  fetchRawMessage: vi.fn().mockResolvedValue(Buffer.from('From: test@example.com\r\nSubject: Test\r\n\r\nHello')),
  listMessages: vi.fn().mockResolvedValue({ messages: [] }),
}));

vi.mock('@mailiac/db', () => ({
  connectDb: vi.fn().mockResolvedValue(undefined),
  UserModel: {
    findOne: vi.fn().mockImplementation((query: { id?: string }) => {
      const u = db.users.find((x) => x.id === query.id);
      return Promise.resolve(u ?? null);
    }),
  },
  SessionModel: {
    findOne: vi.fn().mockImplementation((query: { id?: string }) => {
      const s = db.sessions.find((x) => x.id === query.id);
      return Promise.resolve(s ?? null);
    }),
    deleteOne: vi.fn().mockImplementation((query: { id?: string }) => {
      const idx = db.sessions.findIndex((x) => x.id === query.id);
      if (idx !== -1) db.sessions.splice(idx, 1);
      return Promise.resolve({ deletedCount: idx !== -1 ? 1 : 0 });
    }),
  },
  AnalysisReportModel: {
    findOne: vi.fn().mockImplementation((query: { $or?: Array<{ messageId?: string; _id?: string }> }) => {
      if (query.$or) {
        const found = db.reports.find((r) =>
          query.$or!.some((cond) => (cond.messageId && r.messageId === cond.messageId) || (cond._id && r._id === cond._id))
        );
        return {
          lean: () => Promise.resolve(found ? { ...found } : null),
        };
      }
      return { lean: () => Promise.resolve(null) };
    }),
    deleteOne: vi.fn().mockImplementation((query: { _id?: string; userId?: string }) => {
      const idx = db.reports.findIndex((r) => r._id === query._id && (!query.userId || r.userId === query.userId));
      if (idx !== -1) {
        db.reports.splice(idx, 1);
        return Promise.resolve({ deletedCount: 1 });
      }
      return Promise.resolve({ deletedCount: 0 });
    }),
  },
  EmailAnalysisRecordModel: {
    find: vi.fn().mockImplementation((filter: { userId?: string; source?: string; verdict?: string }) => {
      const results = db.emailRecords.filter((rec) => {
        if (filter.userId && rec.userId !== filter.userId) return false;
        if (filter.source && rec.source !== filter.source) return false;
        if (filter.verdict && rec.verdict !== filter.verdict) return false;
        return true;
      });
      return {
        sort: () => ({
          limit: () => ({
            lean: () => Promise.resolve(results.map((r) => ({ ...r }))),
          }),
        }),
      };
    }),
    deleteMany: vi.fn().mockImplementation((query: { jobId?: string; userId?: string }) => {
      const count = db.emailRecords.filter((r) => r.jobId === query.jobId && (!query.userId || r.userId === query.userId)).length;
      db.emailRecords = db.emailRecords.filter((r) => !(r.jobId === query.jobId && (!query.userId || r.userId === query.userId)));
      return Promise.resolve({ deletedCount: count });
    }),
  },
  GmailAccountModel: {
    findOne: vi.fn().mockImplementation((query: { userId?: string; sessionId?: string }) => {
      const found = db.gmailAccounts.find((a) => {
        if (query.userId && a.userId === query.userId) return true;
        if (query.sessionId && a.sessionId === query.sessionId) return true;
        return false;
      });
      return Promise.resolve(found ?? null);
    }),
    deleteOne: vi.fn().mockImplementation((query: { _id?: string; userId?: string }) => {
      const idx = db.gmailAccounts.findIndex((a) => a._id === query._id && (!query.userId || a.userId === query.userId));
      if (idx !== -1) {
        db.gmailAccounts.splice(idx, 1);
        return Promise.resolve({ deletedCount: 1 });
      }
      return Promise.resolve({ deletedCount: 0 });
    }),
  },
  AnalystFeedbackModel: {
    findOne: vi.fn().mockImplementation((query: { jobId?: string }) => ({
      lean: () => Promise.resolve(db.feedbacks.find((f) => f.jobId === query.jobId) ?? null),
    })),
    findOneAndUpdate: vi.fn().mockImplementation((filter: { jobId?: string }, update: { userId?: string; analystVerdict?: string }) => {
      const doc = {
        jobId: filter.jobId!,
        userId: update.userId,
        analystVerdict: update.analystVerdict ?? '',
      };
      db.feedbacks = db.feedbacks.filter((f) => f.jobId !== filter.jobId);
      db.feedbacks.push(doc);
      return {
        lean: () => Promise.resolve({ ...doc }),
      };
    }),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
  },
  RawEmailModel: {
    findOne: vi.fn().mockResolvedValue(null),
    findOneAndUpdate: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
  },
  OAuthTransactionModel: {
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
  },
  DomainIntelligenceModel: {
    findOne: vi.fn().mockReturnValue({ lean: () => Promise.resolve(null) }),
  },
}));

import { emailQueue } from '../src/queue.js';

describe('Mailiac Authorization & Multi-Tenancy Architecture (9 Essential Tests)', () => {
  let app: Application;
  let server: ReturnType<Application['listen']>;
  let baseUrl: string;

  // Test identities
  const userA: MockUser = { id: 'user-alice-uuid', email: 'alice@target-corp.com', name: 'Alice Analyst' };
  const userB: MockUser = { id: 'user-bob-uuid', email: 'bob@competitor.com', name: 'Bob Intruder' };

  let tokenA: string;
  let tokenB: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset database state
    db.users = [userA, userB];
    db.sessions = [];
    db.reports = [];
    db.emailRecords = [];
    db.gmailAccounts = [];
    db.feedbacks = [];

    // Issue tokens for User A & User B
    const sessA = signSessionToken({ userId: userA.id, email: userA.email });
    tokenA = sessA.token;
    db.sessions.push({ id: sessA.sessionId, userId: userA.id, expiresAt: sessA.expiresAt });

    const sessB = signSessionToken({ userId: userB.id, email: userB.email });
    tokenB = sessB.token;
    db.sessions.push({ id: sessB.sessionId, userId: userB.id, expiresAt: sessB.expiresAt });

    // Seed User A's Report
    db.reports.push({
      _id: 'report-a-mongo-id',
      messageId: 'msg-alice-001',
      userId: userA.id,
      senderDomain: 'bank-security.com',
      timestamp: new Date().toISOString(),
      forensicPath: [],
      authResults: { spf: 'fail', dkim: 'none', dmarcAlignment: 'none', arcPass: false, authScore: 20, findings: [] },
      riskMatrix: { authScore: 20, identityScore: 10, ipScore: 30, nlpScore: 90, finalScore: 85 },
      aiSummary: { urgency: 5, intent: ['phishing'], integrityHash: 'hash-alice-1', findings: [] },
    });

    // Seed User A & User B analysis history records
    db.emailRecords.push(
      {
        jobId: 'msg-alice-001',
        userId: userA.id,
        source: 'eml',
        senderDomain: 'bank-security.com',
        finalScore: 85,
        verdict: 'QUARANTINE',
        authScore: 20,
        identityScore: 10,
        ipScore: 30,
        nlpScore: 90,
        timestamp: new Date().toISOString(),
        createdAt: new Date(),
      },
      {
        jobId: 'msg-bob-001',
        userId: userB.id,
        source: 'eml',
        senderDomain: 'confidential-partner.com',
        finalScore: 10,
        verdict: 'SAFE',
        authScore: 100,
        identityScore: 100,
        ipScore: 100,
        nlpScore: 10,
        timestamp: new Date().toISOString(),
        createdAt: new Date(),
      }
    );

    // Seed User A's Gmail connection
    db.gmailAccounts.push({
      _id: 'gmail-account-alice-id',
      userId: userA.id,
      sessionId: 'session-alice-gmail',
      email: 'alice.forensics@gmail.com',
      accessToken: 'ya29.alice-access-token',
      tokenExpiry: new Date(Date.now() + 3600 * 1000),
    });

    app = express();
    app.use(express.json());
    app.use(authenticateSession);

    app.use('/auth', authRouter);
    app.use('/api', uploadRouter);
    app.use('/api', jobsRouter);
    app.use('/api', reportsRouter);
    app.use('/api/gmail', gmailRouter);
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
    server.close();
  });

  // -------------------------------------------------------------------------
  // Test 1: Logged-out .eml analysis → 401
  // -------------------------------------------------------------------------
  it('1. Logged-out .eml analysis → 401', async () => {
    const formData = new FormData();
    const emlContent = 'From: test@phish.com\r\nTo: user@target.com\r\nSubject: Alert\r\n\r\nClick here!';
    formData.append('eml', new Blob([emlContent], { type: 'message/rfc822' }), 'suspicious.eml');

    const res = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('Unauthorized');
    expect(emailQueue.add).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 2: Logged-in .eml analysis → works
  // -------------------------------------------------------------------------
  it('2. Logged-in .eml analysis → works', async () => {
    const formData = new FormData();
    const emlContent = 'From: test@phish.com\r\nTo: user@target.com\r\nSubject: Alert\r\n\r\nClick here!';
    formData.append('eml', new Blob([emlContent], { type: 'message/rfc822' }), 'suspicious.eml');

    const res = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: {
        Cookie: `${AUTH_COOKIE_NAME}=${tokenA}`,
      },
      body: formData,
    });

    expect(res.status).toBe(202);
    const data = (await res.json()) as { jobId: string };
    expect(data.jobId).toBeDefined();

    expect(emailQueue.add).toHaveBeenCalledWith(
      'process-email',
      expect.objectContaining({
        messageId: data.jobId,
        userId: userA.id,
      }),
      { jobId: data.jobId }
    );
  });

  // -------------------------------------------------------------------------
  // Test 3: Logged-out history → 401
  // -------------------------------------------------------------------------
  it('3. Logged-out history → 401', async () => {
    const res = await fetch(`${baseUrl}/api/reports/history`);
    expect(res.status).toBe(401);

    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('Unauthorized');
  });

  // -------------------------------------------------------------------------
  // Test 4: Logged-in User A → sees only User A\'s history
  // -------------------------------------------------------------------------
  it("4. Logged-in User A → sees only User A's history", async () => {
    const res = await fetch(`${baseUrl}/api/reports/history`, {
      headers: {
        Cookie: `${AUTH_COOKIE_NAME}=${tokenA}`,
      },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { records: Array<{ jobId: string; userId: string }> };

    expect(data.records).toHaveLength(1);
    expect(data.records[0]?.jobId).toBe('msg-alice-001');
    expect(data.records[0]?.userId).toBe(userA.id);

    // Verify Bob's confidential record is NOT leaked
    const hasBobRecord = data.records.some((r) => r.jobId === 'msg-bob-001' || r.userId === userB.id);
    expect(hasBobRecord).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 5: User B cannot access User A\'s report
  // -------------------------------------------------------------------------
  it("5. User B cannot access User A's report", async () => {
    const res = await fetch(`${baseUrl}/api/reports/msg-alice-001`, {
      headers: {
        Cookie: `${AUTH_COOKIE_NAME}=${tokenB}`,
      },
    });

    expect(res.status).toBe(403);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('Access denied');
  });

  // -------------------------------------------------------------------------
  // Test 6: User B cannot delete User A\'s report
  // -------------------------------------------------------------------------
  it("6. User B cannot delete User A's report", async () => {
    const res = await fetch(`${baseUrl}/api/reports/msg-alice-001`, {
      method: 'DELETE',
      headers: {
        Cookie: `${AUTH_COOKIE_NAME}=${tokenB}`,
      },
    });

    expect(res.status).toBe(403);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('Access denied');

    // Verify User A's report remains in database
    const stillExists = db.reports.some((r) => r.messageId === 'msg-alice-001');
    expect(stillExists).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 7: User B cannot access User A\'s Gmail connection
  // -------------------------------------------------------------------------
  it("7. User B cannot access User A's Gmail connection", async () => {
    const res = await fetch(`${baseUrl}/api/gmail/status`, {
      headers: {
        Cookie: `${AUTH_COOKIE_NAME}=${tokenB}`,
      },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { connected: boolean; email?: string };

    // User B has no connected Gmail account; must NOT see Alice's Gmail
    expect(data.connected).toBe(false);
    expect(data.email).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Test 8: Client-supplied userId cannot override req.user.id
  // -------------------------------------------------------------------------
  it('8. Client-supplied userId cannot override req.user.id', async () => {
    // 8a. Upload endpoint ignores client-supplied userId
    const formData = new FormData();
    formData.append('eml', new Blob(['From: attacker@evil.com\r\n\r\nTest'], { type: 'message/rfc822' }), 'test.eml');
    formData.append('userId', userB.id); // Attempt to spoof User B's ID

    const uploadRes = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: {
        Cookie: `${AUTH_COOKIE_NAME}=${tokenA}`,
      },
      body: formData,
    });

    expect(uploadRes.status).toBe(202);
    expect(emailQueue.add).toHaveBeenCalledWith(
      'process-email',
      expect.objectContaining({
        userId: userA.id, // Strictly User A, never spoofed User B
      }),
      expect.any(Object)
    );

    // 8b. Feedback endpoint ignores client-supplied userId
    const feedbackRes = await fetch(`${baseUrl}/api/reports/msg-alice-001/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${AUTH_COOKIE_NAME}=${tokenA}`,
      },
      body: JSON.stringify({
        analystVerdict: 'CONFIRMED_TRUE_POSITIVE',
        userId: userB.id, // Attempt to spoof User B's ID
      }),
    });

    expect(feedbackRes.status).toBe(200);
    const savedFeedback = db.feedbacks.find((f) => f.jobId === 'msg-alice-001');
    expect(savedFeedback).toBeDefined();
    expect(savedFeedback?.userId).toBe(userA.id); // Strictly User A
  });

  // -------------------------------------------------------------------------
  // Test 9: Gmail analysis is tied to the logged-in user
  // -------------------------------------------------------------------------
  it('9. Gmail analysis is tied to the logged-in user', async () => {
    const res = await fetch(`${baseUrl}/api/gmail/messages/gmail-msg-101/analyze`, {
      method: 'POST',
      headers: {
        Cookie: `${AUTH_COOKIE_NAME}=${tokenA}`,
      },
    });

    expect(res.status).toBe(202);
    const data = (await res.json()) as { jobId: string; status: string };
    expect(data.jobId).toBeDefined();
    expect(data.status).toBe('queued');

    expect(emailQueue.add).toHaveBeenCalledWith(
      'process-email',
      expect.objectContaining({
        messageId: data.jobId,
        source: 'gmail',
        gmailMessageId: 'gmail-msg-101',
        userId: userA.id, // Strictly tied to authenticated user
      }),
      { jobId: data.jobId }
    );
  });
});
