import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listMessages,
  fetchRawMessage,
  ensureFreshToken,
  executeWithRetry,
  GmailClientError,
} from '../src/services/gmailClient.js';
import { google } from 'googleapis';
import type { OAuth2Client } from '../src/services/googleAuth.js';

describe('GmailClientService (apps/api/src/services/gmailClient.ts)', () => {
  const mockAuth = {} as OAuth2Client;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeWithRetry', () => {
    it('succeeds without retry on initial success', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await executeWithRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on 429 rate limiting and succeeds on next attempt', async () => {
      const rateLimitErr = { status: 429, message: 'Too Many Requests' };
      const fn = vi
        .fn()
        .mockRejectedValueOnce(rateLimitErr)
        .mockResolvedValueOnce('recovered-data');

      const result = await executeWithRetry(fn, 2, 10);
      expect(result).toBe('recovered-data');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('throws GmailClientError if max retries exceeded', async () => {
      const rateLimitErr = { status: 429, message: 'Too Many Requests' };
      const fn = vi.fn().mockRejectedValue(rateLimitErr);

      await expect(executeWithRetry(fn, 2, 10)).rejects.toThrow(GmailClientError);
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('listMessages', () => {
    it('fetches message list and extracts headers properly', async () => {
      const mockListResponse = {
        data: {
          messages: [{ id: 'msg-1' }, { id: 'msg-2' }],
          nextPageToken: 'token-page-2',
        },
      };

      const mockMsg1 = {
        data: {
          id: 'msg-1',
          threadId: 'thread-1',
          snippet: 'Your invoice is attached...',
          payload: {
            headers: [
              { name: 'From', value: 'Billing <billing@corp.com>' },
              { name: 'Subject', value: 'Invoice #4021' },
              { name: 'Date', value: '2026-08-29T10:00:00.000Z' },
            ],
          },
        },
      };

      const mockMsg2 = {
        data: {
          id: 'msg-2',
          threadId: 'thread-2',
          snippet: 'Security code is 912832',
          payload: {
            headers: [
              { name: 'From', value: 'Security Team <security@bank.com>' },
              { name: 'Subject', value: 'Verification Code' },
              { name: 'Date', value: '2026-08-29T11:00:00.000Z' },
            ],
          },
        },
      };

      const listSpy = vi.fn().mockResolvedValue(mockListResponse);
      const getSpy = vi
        .fn()
        .mockResolvedValueOnce(mockMsg1)
        .mockResolvedValueOnce(mockMsg2);

      vi.spyOn(google, 'gmail').mockReturnValue({
        users: {
          messages: {
            list: listSpy,
            get: getSpy,
          },
        },
      } as unknown as ReturnType<typeof google.gmail>);

      const result = await listMessages(mockAuth, { q: 'is:unread', maxResults: 10 });

      expect(listSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'me',
          q: 'is:unread',
          maxResults: 10,
        })
      );
      expect(result.nextPageToken).toBe('token-page-2');
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toEqual({
        id: 'msg-1',
        threadId: 'thread-1',
        sender: 'Billing <billing@corp.com>',
        subject: 'Invoice #4021',
        date: '2026-08-29T10:00:00.000Z',
        snippet: 'Your invoice is attached...',
      });
    });

    it('handles empty message list cleanly', async () => {
      vi.spyOn(google, 'gmail').mockReturnValue({
        users: {
          messages: {
            list: vi.fn().mockResolvedValue({ data: { messages: [] } }),
          },
        },
      } as unknown as ReturnType<typeof google.gmail>);

      const result = await listMessages(mockAuth);
      expect(result.messages).toEqual([]);
      expect(result.nextPageToken).toBeUndefined();
    });

    it('falls back gracefully when headers are missing', async () => {
      const mockMsg = {
        data: {
          id: 'msg-no-headers',
          snippet: 'Some preview text',
          payload: { headers: [] },
        },
      };

      vi.spyOn(google, 'gmail').mockReturnValue({
        users: {
          messages: {
            list: vi.fn().mockResolvedValue({ data: { messages: [{ id: 'msg-no-headers' }] } }),
            get: vi.fn().mockResolvedValue(mockMsg),
          },
        },
      } as unknown as ReturnType<typeof google.gmail>);

      const result = await listMessages(mockAuth);
      expect(result.messages[0]?.sender).toBe('(Unknown Sender)');
      expect(result.messages[0]?.subject).toBe('(No Subject)');
    });
  });

  describe('fetchRawMessage', () => {
    it('fetches raw message and correctly decodes base64url to RFC 822 Buffer', async () => {
      const sampleEml = 'From: sender@bank.com\r\nTo: user@target.com\r\nSubject: Test\r\n\r\nHello RFC822';
      const base64urlRaw = Buffer.from(sampleEml, 'utf8').toString('base64url');

      const getSpy = vi.fn().mockResolvedValue({
        data: {
          id: 'msg-raw-123',
          raw: base64urlRaw,
        },
      });

      vi.spyOn(google, 'gmail').mockReturnValue({
        users: {
          messages: {
            get: getSpy,
          },
        },
      } as unknown as ReturnType<typeof google.gmail>);

      const buffer = await fetchRawMessage(mockAuth, 'msg-raw-123');

      expect(getSpy).toHaveBeenCalledWith({
        userId: 'me',
        id: 'msg-raw-123',
        format: 'raw',
      });
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString('utf8')).toBe(sampleEml);
    });

    it('throws GmailClientError for invalid or empty messageId', async () => {
      await expect(fetchRawMessage(mockAuth, '')).rejects.toThrow(GmailClientError);
      await expect(fetchRawMessage(mockAuth, '   ')).rejects.toThrow(GmailClientError);
    });

    it('throws GmailClientError if raw property is missing in response', async () => {
      vi.spyOn(google, 'gmail').mockReturnValue({
        users: {
          messages: {
            get: vi.fn().mockResolvedValue({ data: { id: 'msg-empty-raw' } }),
          },
        },
      } as unknown as ReturnType<typeof google.gmail>);

      await expect(fetchRawMessage(mockAuth, 'msg-empty-raw')).rejects.toThrow(GmailClientError);
    });
  });

  describe('ensureFreshToken', () => {
    it('returns access token on successful refresh', async () => {
      const auth = {
        setCredentials: vi.fn(),
        getAccessToken: vi.fn().mockResolvedValue({ token: 'new-fresh-token-123' }),
      } as unknown as OAuth2Client;

      const token = await ensureFreshToken(auth, 'refresh-token-abc');
      expect(auth.setCredentials).toHaveBeenCalledWith({ refresh_token: 'refresh-token-abc' });
      expect(token).toBe('new-fresh-token-123');
    });

    it('throws GmailClientError if token refresh fails', async () => {
      const auth = {
        setCredentials: vi.fn(),
        getAccessToken: vi.fn().mockRejectedValue(new Error('Invalid refresh token')),
      } as unknown as OAuth2Client;

      await expect(ensureFreshToken(auth, 'bad-refresh-token')).rejects.toThrow(GmailClientError);
    });
  });
});
