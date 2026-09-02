import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { gmailRouter } from '../src/routes/gmail.js';
import { errorHandler } from '../src/middleware/error.js';
import type { AddressInfo } from 'net';

vi.mock('@mailiac/db', () => ({
  connectDb: vi.fn().mockResolvedValue(undefined),
  GmailAccountModel: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn(),
  },
  EmailAnalysisRecordModel: {
    find: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    }),
  },
}));

vi.mock('../src/services/googleAuth.js', () => {
  const mockOAuthClient = {
    setCredentials: vi.fn(),
  };
  return {
    generateAuthUrl: vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?mock=true'),
    exchangeCodeForTokens: vi.fn(),
    revokeToken: vi.fn().mockResolvedValue(undefined),
    getOAuthClient: vi.fn().mockReturnValue(mockOAuthClient),
    GoogleAuthError: class GoogleAuthError extends Error {},
  };
});

vi.mock('../src/services/gmailClient.js', () => ({
  listMessages: vi.fn(),
  fetchRawMessage: vi.fn(),
  GmailClientError: class GmailClientError extends Error {
    constructor(message: string, public readonly status?: number) {
      super(message);
      this.name = 'GmailClientError';
    }
  },
}));

vi.mock('../src/queue.js', () => ({
  emailQueue: {
    add: vi.fn().mockResolvedValue({ id: 'mock-bullmq-job-id' }),
  },
}));

import { connectDb, GmailAccountModel, EmailAnalysisRecordModel } from '@mailiac/db';
import {
  generateAuthUrl,
  exchangeCodeForTokens,
  revokeToken,
  getOAuthClient,
} from '../src/services/googleAuth.js';
import { listMessages, fetchRawMessage } from '../src/services/gmailClient.js';
import { emailQueue } from '../src/queue.js';

describe('Express Gmail Routes (/api/gmail)', () => {
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env['FRONTEND_URL'] = 'http://localhost:3000';

    const app = express();
    app.use(express.json());
    app.use('/api/gmail', gmailRouter);
    app.use('/api/integrations/gmail', gmailRouter);
    app.use(errorHandler);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    return () => {
      server.close();
    };
  });

  describe('GET /api/gmail/auth/url', () => {
    it('returns 200 with generated auth URL', async () => {
      const res = await fetch(`${baseUrl}/api/gmail/auth/url`);
      expect(res.status).toBe(200);

      const data = (await res.json()) as { url: string };
      expect(data.url).toBe('https://accounts.google.com/o/oauth2/v2/auth?mock=true');
      expect(generateAuthUrl).toHaveBeenCalled();
    });

    it('passes sessionId from x-session-id header to generateAuthUrl', async () => {
      const res = await fetch(`${baseUrl}/api/gmail/auth/url`, {
        headers: { 'x-session-id': 'custom-sess-777' },
      });
      expect(res.status).toBe(200);
      expect(generateAuthUrl).toHaveBeenCalledWith('custom-sess-777');
    });
  });

  describe('GET /api/gmail/auth/callback and alias endpoints', () => {
    it('happy path: exchanges code, saves to MongoDB, sets cookie, and redirects to frontend', async () => {
      vi.mocked(exchangeCodeForTokens).mockResolvedValue({
        accessToken: 'mock-access-token-123',
        refreshToken: 'mock-refresh-token-456',
        tokenExpiry: new Date(Date.now() + 3600000),
        email: 'analyst@target-corp.com',
      });

      const res = await fetch(
        `${baseUrl}/api/gmail/auth/callback?code=valid-code-123&state=test-session-id`,
        { redirect: 'manual' }
      );

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('http://localhost:3000/?gmail=connected');

      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('mailiac_session_id=test-session-id');

      expect(connectDb).toHaveBeenCalled();
      expect(GmailAccountModel.findOneAndUpdate).toHaveBeenCalledWith(
        { sessionId: 'test-session-id' },
        expect.objectContaining({
          sessionId: 'test-session-id',
          email: 'analyst@target-corp.com',
          accessToken: 'mock-access-token-123',
          refreshToken: 'mock-refresh-token-456',
        }),
        { upsert: true, new: true }
      );
    });

    it('supports /api/integrations/gmail/callback as an alias', async () => {
      vi.mocked(exchangeCodeForTokens).mockResolvedValue({
        accessToken: 'mock-access-token-999',
        tokenExpiry: new Date(Date.now() + 3600000),
        email: 'analyst@target-corp.com',
      });

      const res = await fetch(
        `${baseUrl}/api/integrations/gmail/callback?code=integration-code&state=integration-sess`,
        { redirect: 'manual' }
      );

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('http://localhost:3000/?gmail=connected');
    });

    it('returns 400 Bad Request when code query parameter is missing', async () => {
      const res = await fetch(`${baseUrl}/api/gmail/auth/callback`, { redirect: 'manual' });
      expect(res.status).toBe(400);

      const data = (await res.json()) as { error: string };
      expect(data.error).toBe('Authorization code is required.');
    });

    it('handles token exchange failure gracefully via error handler', async () => {
      vi.mocked(exchangeCodeForTokens).mockRejectedValue(new Error('Invalid grant'));

      const res = await fetch(`${baseUrl}/api/gmail/auth/callback?code=bad-code`, {
        redirect: 'manual',
      });
      expect(res.status).toBe(500);

      const data = (await res.json()) as { error: string };
      expect(data.error).toBe('Invalid grant');
    });
  });

  describe('GET /api/gmail/status', () => {
    it('returns connected true and email when account is present for session', async () => {
      vi.mocked(GmailAccountModel.findOne).mockResolvedValue({
        sessionId: 'sess-active',
        email: 'analyst@target-corp.com',
      });

      const res = await fetch(`${baseUrl}/api/gmail/status`, {
        headers: { 'x-session-id': 'sess-active' },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { connected: boolean; email: string };
      expect(data.connected).toBe(true);
      expect(data.email).toBe('analyst@target-corp.com');
      expect(GmailAccountModel.findOne).toHaveBeenCalledWith({ sessionId: 'sess-active' });
    });

    it('returns connected false when no account exists', async () => {
      vi.mocked(GmailAccountModel.findOne).mockReturnValue({
        sort: vi.fn().mockResolvedValue(null),
      } as unknown as ReturnType<typeof GmailAccountModel.findOne>);

      const res = await fetch(`${baseUrl}/api/gmail/status`);
      expect(res.status).toBe(200);

      const data = (await res.json()) as { connected: boolean; email?: string };
      expect(data.connected).toBe(false);
      expect(data.email).toBeUndefined();
    });
  });

  describe('DELETE /api/gmail/disconnect', () => {
    it('happy path: revokes token, deletes from Mongo, and clears cookie', async () => {
      vi.mocked(GmailAccountModel.findOne).mockResolvedValue({
        _id: 'mongo-id-123',
        sessionId: 'sess-active',
        email: 'analyst@target-corp.com',
        accessToken: 'access-token-to-revoke',
      });
      vi.mocked(GmailAccountModel.deleteOne).mockResolvedValue({ acknowledged: true, deletedCount: 1 });

      const res = await fetch(`${baseUrl}/api/gmail/disconnect`, {
        method: 'DELETE',
        headers: { 'x-session-id': 'sess-active' },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean; message: string };
      expect(data.success).toBe(true);
      expect(data.message).toBe('Gmail account disconnected.');

      expect(revokeToken).toHaveBeenCalledWith('access-token-to-revoke');
      expect(GmailAccountModel.deleteOne).toHaveBeenCalledWith({ _id: 'mongo-id-123' });

      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('mailiac_session_id=;');
    });

    it('returns 404 Not Found when no account is found to disconnect', async () => {
      vi.mocked(GmailAccountModel.findOne).mockResolvedValue(null);

      const res = await fetch(`${baseUrl}/api/gmail/disconnect`, {
        method: 'DELETE',
        headers: { 'x-session-id': 'unknown-session' },
      });

      expect(res.status).toBe(404);
      const data = (await res.json()) as { error: string };
      expect(data.error).toBe('No connected Gmail account found.');
      expect(revokeToken).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/gmail/messages', () => {
    it('returns 200 with list of messages for connected account', async () => {
      vi.mocked(GmailAccountModel.findOne).mockResolvedValue({
        sessionId: 'sess-active',
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
      });

      const mockMessages = [
        {
          id: 'msg-101',
          sender: 'Bank <alert@bank.com>',
          subject: 'Suspicious login detected',
          date: '2026-08-29T12:00:00.000Z',
          snippet: 'Please verify your credentials...',
        },
      ];

      vi.mocked(listMessages).mockResolvedValue({
        messages: mockMessages,
        nextPageToken: 'token-next',
      });

      const res = await fetch(
        `${baseUrl}/api/gmail/messages?q=is:unread&pageToken=page1&maxResults=10`,
        {
          headers: { 'x-session-id': 'sess-active' },
        }
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        messages: Array<typeof mockMessages[0] & { analyzed: boolean }>;
        nextPageToken: string;
      };
      expect(data.messages[0]?.id).toBe('msg-101');
      expect(data.messages[0]?.analyzed).toBe(false);
      expect(data.nextPageToken).toBe('token-next');
      expect(getOAuthClient).toHaveBeenCalled();
      expect(listMessages).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          q: 'is:unread',
          pageToken: 'page1',
          maxResults: 10,
        })
      );
    });

    it('attaches analyzed true, jobId, finalScore, and verdict when email was previously analyzed', async () => {
      vi.mocked(GmailAccountModel.findOne).mockResolvedValue({
        sessionId: 'sess-active',
        accessToken: 'valid-access-token',
      });

      const mockMessages = [
        {
          id: 'msg-analyzed-999',
          sender: 'Phish <alert@fakebank.com>',
          subject: 'Action Required',
          date: '2026-08-29T12:00:00.000Z',
          snippet: 'Account suspended...',
        },
      ];

      vi.mocked(listMessages).mockResolvedValue({
        messages: mockMessages,
      });

      vi.mocked(EmailAnalysisRecordModel.find).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            gmailMessageId: 'msg-analyzed-999',
            jobId: 'job-found-uuid-888',
            finalScore: 92,
            verdict: 'QUARANTINE',
          },
        ]),
      } as unknown as ReturnType<typeof EmailAnalysisRecordModel.find>);

      const res = await fetch(`${baseUrl}/api/gmail/messages`, {
        headers: { 'x-session-id': 'sess-active' },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        messages: Array<{
          id: string;
          analyzed: boolean;
          jobId?: string;
          finalScore?: number;
          verdict?: string;
        }>;
      };

      expect(data.messages[0]?.analyzed).toBe(true);
      expect(data.messages[0]?.jobId).toBe('job-found-uuid-888');
      expect(data.messages[0]?.finalScore).toBe(92);
      expect(data.messages[0]?.verdict).toBe('QUARANTINE');
    });

    it('returns 401 Unauthorized when no account is connected', async () => {
      vi.mocked(GmailAccountModel.findOne).mockResolvedValue(null);

      const res = await fetch(`${baseUrl}/api/gmail/messages`, {
        headers: { 'x-session-id': 'unauthenticated-session' },
      });

      expect(res.status).toBe(401);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain('No connected Gmail account found');
      expect(listMessages).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/gmail/messages/:messageId/analyze', () => {
    it('fetches raw message buffer, enqueues to BullMQ, and returns 202 Accepted', async () => {
      vi.mocked(GmailAccountModel.findOne).mockResolvedValue({
        sessionId: 'sess-active',
        accessToken: 'valid-access-token',
      });

      const sampleEmlBuffer = Buffer.from('From: sender@bank.com\r\n\r\nPhish', 'utf8');
      vi.mocked(fetchRawMessage).mockResolvedValue(sampleEmlBuffer);

      const res = await fetch(`${baseUrl}/api/gmail/messages/msg-phish-999/analyze`, {
        method: 'POST',
        headers: { 'x-session-id': 'sess-active' },
      });

      expect(res.status).toBe(202);
      const data = (await res.json()) as { jobId: string; status: string };
      expect(data.status).toBe('queued');
      expect(data.jobId).toBeDefined();

      expect(fetchRawMessage).toHaveBeenCalledWith(expect.anything(), 'msg-phish-999');
      expect(emailQueue.add).toHaveBeenCalledWith(
        'process-email',
        expect.objectContaining({
          messageId: data.jobId,
          buffer: sampleEmlBuffer,
        }),
        { jobId: data.jobId }
      );
    });

    it('returns 401 Unauthorized when no account is connected', async () => {
      vi.mocked(GmailAccountModel.findOne).mockResolvedValue(null);

      const res = await fetch(`${baseUrl}/api/gmail/messages/msg-123/analyze`, {
        method: 'POST',
      });

      expect(res.status).toBe(401);
      expect(fetchRawMessage).not.toHaveBeenCalled();
      expect(emailQueue.add).not.toHaveBeenCalled();
    });
  });
});
