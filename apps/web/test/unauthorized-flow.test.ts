import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import {
  api,
  onUnauthorized,
  notifyUnauthorized,
  isAuthError,
  isForbiddenError,
  getErrorMessage,
  uploadEml,
  getJobStatus,
  getReport,
  reanalyzeReport,
  submitFeedback,
  getGmailAuthUrl,
} from '../src/lib/api';
import { sessionFetch, clearSession, SESSION_STORAGE_KEY } from '../src/lib/session';

describe('Centralized Unauthorized & Forbidden Handler (apps/web/src/lib/api.ts)', () => {
  let mockStorage: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = {};

    Object.defineProperty(globalThis, 'sessionStorage', {
      value: {
        getItem: vi.fn((key: string) => mockStorage[key] ?? null),
        setItem: vi.fn((key: string, val: string) => {
          mockStorage[key] = val;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStorage[key];
        }),
        clear: vi.fn(() => {
          mockStorage = {};
        }),
      },
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, 'window', {
      value: {
        location: new URL('http://localhost:3000/history?filter=quarantine'),
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Axios Client Configuration', () => {
    it('is configured with withCredentials: true', () => {
      expect(api.defaults.withCredentials).toBe(true);
    });

    it('attaches x-session-id request header', async () => {
      const mockAdapter = vi.fn().mockResolvedValue({
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      });

      const originalAdapter = api.defaults.adapter;
      api.defaults.adapter = mockAdapter;

      try {
        await api.get('/api/test-session');
        expect(mockAdapter).toHaveBeenCalledTimes(1);
        const config = mockAdapter.mock.calls[0][0];
        expect(config.headers['x-session-id']).toBeDefined();
        expect(typeof config.headers['x-session-id']).toBe('string');
      } finally {
        api.defaults.adapter = originalAdapter;
      }
    });
  });

  describe('Global 401 Unauthorized Interception', () => {
    it('triggers registered onUnauthorized listeners on 401 response', async () => {
      const unauthorizedListener = vi.fn();
      const unsubscribe = onUnauthorized(unauthorizedListener);

      const mockAdapter = vi.fn().mockRejectedValue({
        response: {
          status: 401,
          data: { error: 'Unauthorized: session expired' },
        },
        config: { url: '/api/reports/history' },
      });

      const originalAdapter = api.defaults.adapter;
      api.defaults.adapter = mockAdapter;

      try {
        await expect(api.get('/api/reports/history')).rejects.toThrow('Sign in required');
        expect(unauthorizedListener).toHaveBeenCalledTimes(1);
        expect(unauthorizedListener).toHaveBeenCalledWith('Unauthorized: session expired');
      } finally {
        unsubscribe();
        api.defaults.adapter = originalAdapter;
      }
    });

    it('flags the rejected error as isAuthError with handled = true', async () => {
      const mockAdapter = vi.fn().mockRejectedValue({
        response: {
          status: 401,
          data: { error: 'Unauthorized' },
        },
        config: { url: '/api/upload' },
      });

      const originalAdapter = api.defaults.adapter;
      api.defaults.adapter = mockAdapter;

      try {
        let caughtError: unknown;
        try {
          await api.post('/api/upload', {});
        } catch (err) {
          caughtError = err;
        }

        expect(isAuthError(caughtError)).toBe(true);
        expect((caughtError as any).handled).toBe(true);
        expect((caughtError as any).status).toBe(401);
      } finally {
        api.defaults.adapter = originalAdapter;
      }
    });

    it('saves the attempted URL path to sessionStorage for post-login redirection', async () => {
      const mockAdapter = vi.fn().mockRejectedValue({
        response: {
          status: 401,
          data: { error: 'Authentication required' },
        },
        config: { url: '/api/reports/case-123' },
      });

      const originalAdapter = api.defaults.adapter;
      api.defaults.adapter = mockAdapter;

      try {
        await expect(api.get('/api/reports/case-123')).rejects.toThrow();
        expect(sessionStorage.setItem).toHaveBeenCalledWith(
          'mailiac_redirect_after_login',
          '/history?filter=quarantine'
        );
      } finally {
        api.defaults.adapter = originalAdapter;
      }
    });

    it('does not trigger onUnauthorized for internal /api/auth/me checks', async () => {
      const unauthorizedListener = vi.fn();
      const unsubscribe = onUnauthorized(unauthorizedListener);

      const mockAdapter = vi.fn().mockRejectedValue({
        response: {
          status: 401,
          data: { error: 'Not logged in' },
        },
        config: { url: '/api/auth/me' },
      });

      const originalAdapter = api.defaults.adapter;
      api.defaults.adapter = mockAdapter;

      try {
        await expect(api.get('/api/auth/me')).rejects.toThrow();
        expect(unauthorizedListener).not.toHaveBeenCalled();
      } finally {
        unsubscribe();
        api.defaults.adapter = originalAdapter;
      }
    });
  });

  describe('403 Forbidden Separation (Must NOT Trigger Login)', () => {
    it('marks error with isForbidden = true and does NOT trigger onUnauthorized', async () => {
      const unauthorizedListener = vi.fn();
      const unsubscribe = onUnauthorized(unauthorizedListener);

      const mockAdapter = vi.fn().mockRejectedValue({
        response: {
          status: 403,
          data: { error: 'Forbidden: you do not have permission to view this report' },
        },
        config: { url: '/api/reports/another-user-report' },
      });

      const originalAdapter = api.defaults.adapter;
      api.defaults.adapter = mockAdapter;

      try {
        let caughtError: unknown;
        try {
          await api.get('/api/reports/another-user-report');
        } catch (err) {
          caughtError = err;
        }

        expect(isForbiddenError(caughtError)).toBe(true);
        expect(isAuthError(caughtError)).toBe(false);
        expect((caughtError as any).status).toBe(403);
        expect((caughtError as Error).message).toBe('You are not authorized to access this resource.');

        // Crucial requirement: 403 must NEVER trigger login modal
        expect(unauthorizedListener).not.toHaveBeenCalled();
      } finally {
        unsubscribe();
        api.defaults.adapter = originalAdapter;
      }
    });
  });

  describe('Standard API Errors (500, 404, 400)', () => {
    it('passes standard 500 errors through without triggering unauthorized modal', async () => {
      const unauthorizedListener = vi.fn();
      const unsubscribe = onUnauthorized(unauthorizedListener);

      const mockAdapter = vi.fn().mockRejectedValue({
        response: {
          status: 500,
          data: { error: 'Internal pipeline error' },
        },
        config: { url: '/api/jobs/job-xyz' },
      });

      const originalAdapter = api.defaults.adapter;
      api.defaults.adapter = mockAdapter;

      try {
        let caughtError: unknown;
        try {
          await api.get('/api/jobs/job-xyz');
        } catch (err) {
          caughtError = err;
        }

        expect(isAuthError(caughtError)).toBe(false);
        expect(isForbiddenError(caughtError)).toBe(false);
        expect(unauthorizedListener).not.toHaveBeenCalled();
      } finally {
        unsubscribe();
        api.defaults.adapter = originalAdapter;
      }
    });

    it('passes standard 404 errors through without triggering unauthorized modal', async () => {
      const unauthorizedListener = vi.fn();
      const unsubscribe = onUnauthorized(unauthorizedListener);

      const mockAdapter = vi.fn().mockRejectedValue({
        response: {
          status: 404,
          data: { error: 'Report not found' },
        },
        config: { url: '/api/reports/nonexistent' },
      });

      const originalAdapter = api.defaults.adapter;
      api.defaults.adapter = mockAdapter;

      try {
        let caughtError: unknown;
        try {
          await api.get('/api/reports/nonexistent');
        } catch (err) {
          caughtError = err;
        }

        expect(isAuthError(caughtError)).toBe(false);
        expect(isForbiddenError(caughtError)).toBe(false);
        expect(unauthorizedListener).not.toHaveBeenCalled();
      } finally {
        unsubscribe();
        api.defaults.adapter = originalAdapter;
      }
    });
  });

  describe('Error Message Sanitization (getErrorMessage)', () => {
    it('returns user-friendly message for auth errors', () => {
      const authErr = { isAuthError: true, message: 'Raw technical 401' };
      expect(getErrorMessage(authErr)).toBe('Sign in required to perform this action.');
    });

    it('returns user-friendly message for forbidden errors', () => {
      const forbiddenErr = { isForbidden: true, message: 'IDOR violation 403' };
      expect(getErrorMessage(forbiddenErr)).toBe('You are not authorized to access this resource.');
    });

    it('extracts server message for standard Axios errors', () => {
      const axiosErr = {
        isAxiosError: true,
        response: {
          data: { error: 'Malformed EML headers' },
        },
      };
      vi.spyOn(axios, 'isAxiosError').mockReturnValueOnce(true);
      expect(getErrorMessage(axiosErr)).toBe('Malformed EML headers');
    });

    it('provides friendly fallback for 500 server errors', () => {
      const axiosErr = {
        isAxiosError: true,
        response: {
          status: 500,
          data: {},
        },
      };
      vi.spyOn(axios, 'isAxiosError').mockReturnValueOnce(true);
      expect(getErrorMessage(axiosErr)).toBe(
        'The forensic processing service encountered an internal error. Please try again.'
      );
    });
  });

  describe('Typed Helper Methods', () => {
    it('uploadEml posts multipart form data', async () => {
      const mockAdapter = vi.fn().mockResolvedValue({
        data: { jobId: 'job-eml-456' },
        status: 200,
        headers: {},
        config: {},
      });

      const originalAdapter = api.defaults.adapter;
      api.defaults.adapter = mockAdapter;

      try {
        const file = new File(['mock eml'], 'test.eml', { type: 'message/rfc822' });
        const result = await uploadEml(file);
        expect(result.jobId).toBe('job-eml-456');
        expect(mockAdapter).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'post',
            url: '/api/upload',
          })
        );
      } finally {
        api.defaults.adapter = originalAdapter;
      }
    });

    it('reanalyzeReport posts to reanalyze endpoint', async () => {
      const mockAdapter = vi.fn().mockResolvedValue({
        data: { jobId: 'job-reanalyze-789' },
        status: 200,
        headers: {},
        config: {},
      });

      const originalAdapter = api.defaults.adapter;
      api.defaults.adapter = mockAdapter;

      try {
        const result = await reanalyzeReport('case-999');
        expect(result.jobId).toBe('job-reanalyze-789');
        expect(mockAdapter).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'post',
            url: '/api/reports/case-999/reanalyze',
          })
        );
      } finally {
        api.defaults.adapter = originalAdapter;
      }
    });

    it('reanalyzeReport handles 409 Conflict gracefully and returns active job details', async () => {
      const mockAdapter = vi.fn().mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 409,
          data: {
            error: 'Re-analysis is already in progress for this case.',
            jobId: 'case-already-running-456',
            status: 'processing',
          },
        },
      });

      const originalAdapter = api.defaults.adapter;
      api.defaults.adapter = mockAdapter;

      try {
        const result = await reanalyzeReport('case-already-running-456');
        expect(result.jobId).toBe('case-already-running-456');
        expect(result.status).toBe('processing');
        expect(result.success).toBe(true);
      } finally {
        api.defaults.adapter = originalAdapter;
      }
    });

    it('submitFeedback posts payload to feedback endpoint', async () => {
      const mockAdapter = vi.fn().mockResolvedValue({
        data: { success: true },
        status: 200,
        headers: {},
        config: {},
      });

      const originalAdapter = api.defaults.adapter;
      api.defaults.adapter = mockAdapter;

      try {
        const result = (await submitFeedback('case-999', { verdict: 'USER_ACCURATE' })) as { success?: boolean };
        expect(result.success).toBe(true);
        expect(mockAdapter).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'post',
            url: '/api/reports/case-999/feedback',
          })
        );
      } finally {
        api.defaults.adapter = originalAdapter;
      }
    });
  });
});
