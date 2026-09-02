import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getOAuthClient,
  generateAuthUrl,
  exchangeCodeForTokens,
  revokeToken,
  GoogleAuthError,
  GMAIL_SCOPES,
  type OAuth2Client,
} from '../src/services/googleAuth.js';
import { google } from 'googleapis';

describe('GoogleAuthService (apps/api/src/services/googleAuth.ts)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      GOOGLE_CLIENT_ID: 'mock-client-id.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'mock-client-secret-123',
      GOOGLE_REDIRECT_URI: 'http://localhost:4000/api/gmail/auth/callback',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getOAuthClient', () => {
    it('returns an initialized OAuth2Client when environment variables are set', () => {
      const client = getOAuthClient();
      expect(client).toBeInstanceOf(google.auth.OAuth2);
      expect(client._clientId).toBe('mock-client-id.apps.googleusercontent.com');
      expect(client._clientSecret).toBe('mock-client-secret-123');
      expect(client.redirectUri).toBe('http://localhost:4000/api/gmail/auth/callback');
    });

    it('uses custom redirect URI when provided', () => {
      const client = getOAuthClient('http://custom-host:4000/callback');
      expect(client.redirectUri).toBe('http://custom-host:4000/callback');
    });

    it('throws GoogleAuthError when GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing', () => {
      delete process.env['GOOGLE_CLIENT_ID'];
      expect(() => getOAuthClient()).toThrow(GoogleAuthError);
    });
  });

  describe('generateAuthUrl', () => {
    it('generates a valid Google OAuth consent URL containing required parameters', () => {
      const url = generateAuthUrl('random_csrf_state_123');
      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=mock-client-id.apps.googleusercontent.com');
      expect(url).toContain('access_type=offline');
      expect(url).toContain('prompt=consent');
      expect(url).toContain('state=random_csrf_state_123');

      for (const scope of GMAIL_SCOPES) {
        expect(url).toContain(encodeURIComponent(scope));
      }
    });

    it('generates auth URL without state if not provided', () => {
      const url = generateAuthUrl();
      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).not.toContain('state=');
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('successfully exchanges code and extracts email from ID token', async () => {
      const mockTokens = {
        access_token: 'mock-access-token-xyz',
        refresh_token: 'mock-refresh-token-abc',
        expiry_date: Date.now() + 3600000,
        id_token: 'mock-id-token',
      };

      const getTokenSpy = vi.spyOn(google.auth.OAuth2.prototype, 'getToken').mockResolvedValue({
        tokens: mockTokens,
        res: null,
      });

      const verifyIdTokenSpy = vi.spyOn(google.auth.OAuth2.prototype, 'verifyIdToken').mockResolvedValue({
        getPayload: () => ({ email: 'analyst@target-corp.com' }),
      } as unknown as Awaited<ReturnType<OAuth2Client['verifyIdToken']>>);

      const result = await exchangeCodeForTokens('sample-auth-code-123');

      expect(getTokenSpy).toHaveBeenCalledWith('sample-auth-code-123');
      expect(result.accessToken).toBe('mock-access-token-xyz');
      expect(result.refreshToken).toBe('mock-refresh-token-abc');
      expect(result.email).toBe('analyst@target-corp.com');
      expect(result.tokenExpiry).toBeInstanceOf(Date);

      getTokenSpy.mockRestore();
      verifyIdTokenSpy.mockRestore();
    });

    it('falls back to oauth2 userinfo API when id_token is absent or verification fails', async () => {
      const mockTokens = {
        access_token: 'mock-access-token-xyz',
        expiry_date: Date.now() + 3600000,
      };

      const getTokenSpy = vi.spyOn(google.auth.OAuth2.prototype, 'getToken').mockResolvedValue({
        tokens: mockTokens,
        res: null,
      });

      const userinfoSpy = vi.spyOn(google, 'oauth2').mockReturnValue({
        userinfo: {
          get: vi.fn().mockResolvedValue({
            data: { email: 'fallback-analyst@target-corp.com' },
          }),
        },
      } as unknown as ReturnType<typeof google.oauth2>);

      const result = await exchangeCodeForTokens('sample-auth-code-456');

      expect(result.email).toBe('fallback-analyst@target-corp.com');
      expect(result.accessToken).toBe('mock-access-token-xyz');
      expect(result.refreshToken).toBeUndefined();

      getTokenSpy.mockRestore();
      userinfoSpy.mockRestore();
    });

    it('throws GoogleAuthError if Google does not return access_token', async () => {
      const getTokenSpy = vi.spyOn(google.auth.OAuth2.prototype, 'getToken').mockResolvedValue({
        tokens: {},
        res: null,
      });

      await expect(exchangeCodeForTokens('bad-code')).rejects.toThrow(GoogleAuthError);

      getTokenSpy.mockRestore();
    });

    it('throws GoogleAuthError when token exchange network call fails', async () => {
      const getTokenSpy = vi
        .spyOn(google.auth.OAuth2.prototype, 'getToken')
        .mockRejectedValue(new Error('Network error connecting to Google'));

      await expect(exchangeCodeForTokens('failing-code')).rejects.toThrow(GoogleAuthError);

      getTokenSpy.mockRestore();
    });
  });

  describe('revokeToken', () => {
    it('successfully revokes token via OAuth2Client', async () => {
      const revokeSpy = vi.spyOn(google.auth.OAuth2.prototype, 'revokeToken').mockResolvedValue({
        status: 200,
      } as unknown as Awaited<ReturnType<OAuth2Client['revokeToken']>>);

      await expect(revokeToken('token-to-revoke')).resolves.toBeUndefined();
      expect(revokeSpy).toHaveBeenCalledWith('token-to-revoke');

      revokeSpy.mockRestore();
    });

    it('throws GoogleAuthError when revocation fails', async () => {
      const revokeSpy = vi
        .spyOn(google.auth.OAuth2.prototype, 'revokeToken')
        .mockRejectedValue(new Error('Invalid token'));

      await expect(revokeToken('invalid-token')).rejects.toThrow(GoogleAuthError);

      revokeSpy.mockRestore();
    });
  });
});
