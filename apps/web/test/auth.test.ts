import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchCurrentUser,
  requestGoogleAuthUrl,
  logoutUser,
} from '../src/lib/auth';

// Mock sessionFetch
vi.mock('../src/lib/session', () => ({
  sessionFetch: vi.fn(),
}));

import { sessionFetch } from '../src/lib/session';

describe('Client Auth Utilities (apps/web/src/lib/auth.tsx)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchCurrentUser', () => {
    it('returns null when /api/auth/me returns 401 unauthenticated', async () => {
      vi.mocked(sessionFetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ error: 'Unauthorized' }),
      } as unknown as Response);

      const user = await fetchCurrentUser();
      expect(user).toBeNull();
      expect(sessionFetch).toHaveBeenCalledWith(
        '/api/auth/me',
        expect.objectContaining({ headers: { 'x-skip-auth-modal': 'true' } })
      );
    });

    it('returns user profile when /api/auth/me returns 200 authenticated', async () => {
      vi.mocked(sessionFetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          id: 'usr-analyst-uuid-99',
          googleId: 'google-sub-99',
          email: 'analyst@mailiac.com',
          name: 'Analyst Jane',
          picture: 'https://avatar.com/jane',
        }),
      } as unknown as Response);

      const user = await fetchCurrentUser();
      expect(user).toEqual({
        id: 'usr-analyst-uuid-99',
        googleId: 'google-sub-99',
        email: 'analyst@mailiac.com',
        name: 'Analyst Jane',
        picture: 'https://avatar.com/jane',
      });
      expect(sessionFetch).toHaveBeenCalledWith(
        '/api/auth/me',
        expect.objectContaining({ headers: { 'x-skip-auth-modal': 'true' } })
      );
    });

    it('handles nested { user: ... } format gracefully', async () => {
      vi.mocked(sessionFetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          user: {
            id: 'usr-analyst-uuid-77',
            email: 'jane@mailiac.com',
          },
        }),
      } as unknown as Response);

      const user = await fetchCurrentUser();
      expect(user?.id).toBe('usr-analyst-uuid-77');
      expect(user?.email).toBe('jane@mailiac.com');
    });

    it('returns null on network error', async () => {
      vi.mocked(sessionFetch).mockRejectedValueOnce(new Error('Network offline'));
      const user = await fetchCurrentUser();
      expect(user).toBeNull();
    });
  });

  describe('requestGoogleAuthUrl', () => {
    it('returns auth URL when /api/auth/google/url returns 200', async () => {
      vi.mocked(sessionFetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          url: 'https://accounts.google.com/o/oauth2/v2/auth?scope=openid+email+profile',
        }),
      } as unknown as Response);

      const url = await requestGoogleAuthUrl();
      expect(url).toBe('https://accounts.google.com/o/oauth2/v2/auth?scope=openid+email+profile');
      expect(sessionFetch).toHaveBeenCalledWith('/api/auth/google/url');
    });

    it('returns null when request fails', async () => {
      vi.mocked(sessionFetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as unknown as Response);

      const url = await requestGoogleAuthUrl();
      expect(url).toBeNull();
    });
  });

  describe('logoutUser', () => {
    it('dispatches POST to /api/auth/logout and returns true on success', async () => {
      vi.mocked(sessionFetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true }),
      } as unknown as Response);

      const success = await logoutUser();
      expect(success).toBe(true);
      expect(sessionFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    });

    it('returns false on logout failure', async () => {
      vi.mocked(sessionFetch).mockRejectedValueOnce(new Error('Network error'));
      const success = await logoutUser();
      expect(success).toBe(false);
    });
  });
});
