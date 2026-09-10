import { google, type Auth } from 'googleapis';

export type OAuth2Client = Auth.OAuth2Client;

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.readonly',
];

export const AUTH_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export interface GoogleUserIdentity {
  googleId: string;
  email: string;
  name?: string;
  picture?: string;
}

export class GoogleAuthError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

export interface GoogleAuthTokens {
  accessToken: string;
  refreshToken?: string;
  tokenExpiry: Date;
  email: string;
  googleAccountId?: string;
  scopes?: string[];
}

/**
 * Resolves the OAuth redirect URI for Gmail incremental consent.
 */
export function getGmailAuthRedirectUri(customRedirectUri?: string): string {
  if (customRedirectUri && customRedirectUri.trim() !== '') {
    return customRedirectUri.trim();
  }
  if (process.env['GOOGLE_REDIRECT_URI'] && process.env['GOOGLE_REDIRECT_URI'].trim() !== '') {
    return process.env['GOOGLE_REDIRECT_URI'].trim();
  }
  return 'http://localhost:4000/api/gmail/auth/callback';
}

/**
 * Resolves the OAuth redirect URI for user identity Sign-In.
 * Exclusively uses GOOGLE_AUTH_REDIRECT_URI or defaults to http://localhost:4000/api/auth/google/callback.
 */
export function getUserAuthRedirectUri(customRedirectUri?: string): string {
  if (customRedirectUri && customRedirectUri.trim() !== '') {
    return customRedirectUri.trim();
  }
  if (process.env['GOOGLE_AUTH_REDIRECT_URI'] && process.env['GOOGLE_AUTH_REDIRECT_URI'].trim() !== '') {
    return process.env['GOOGLE_AUTH_REDIRECT_URI'].trim();
  }
  return 'http://localhost:4000/api/auth/google/callback';
}

/**
 * Creates and returns an initialized OAuth2Client instance using environment configuration.
 */
export function getOAuthClient(customRedirectUri?: string): OAuth2Client {
  const clientId = process.env['GOOGLE_CLIENT_ID'];
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'];
  const redirectUri = getGmailAuthRedirectUri(customRedirectUri);

  if (!clientId || !clientSecret) {
    throw new GoogleAuthError(
      'Missing Google OAuth configuration. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set.'
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generates the Google OAuth 2.0 consent URL for Mailiac Gmail forensic analysis.
 */
export function generateAuthUrl(state?: string, customRedirectUri?: string): string {
  const redirectUri = getGmailAuthRedirectUri(customRedirectUri);
  const client = getOAuthClient(redirectUri);

  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: GMAIL_SCOPES,
    ...(state ? { state } : {}),
  });
}

/**
 * Exchanges the one-time authorization code for access and refresh tokens,
 * and extracts the associated authenticated Google account email.
 */
export async function exchangeCodeForTokens(
  code: string,
  customRedirectUri?: string
): Promise<GoogleAuthTokens> {
  const redirectUri = getGmailAuthRedirectUri(customRedirectUri);
  const client = getOAuthClient(redirectUri);

  try {
    const { tokens } = await client.getToken(code);

    if (!tokens.access_token) {
      throw new GoogleAuthError('OAuth token exchange failed: No access_token returned by Google.');
    }

    client.setCredentials(tokens);

    let email: string | undefined;
    let googleAccountId: string | undefined;

    // 1. Try extracting email and subject from id_token if available
    if (tokens.id_token) {
      try {
        const ticket = await client.verifyIdToken({
          idToken: tokens.id_token,
          audience: process.env['GOOGLE_CLIENT_ID'],
        });
        const payload = ticket.getPayload();
        if (payload?.email) {
          email = payload.email;
        }
        if (payload?.sub) {
          googleAccountId = payload.sub;
        }
      } catch {
        // Fallback to userinfo API if ID token verification fails
      }
    }

    // 2. Fallback to oauth2 userinfo API
    if (!email) {
      const oauth2 = google.oauth2({ version: 'v2', auth: client });
      const userinfo = await oauth2.userinfo.get();
      if (userinfo.data.email) {
        email = userinfo.data.email;
      }
      if (userinfo.data.id) {
        googleAccountId = userinfo.data.id;
      }
    }

    if (!email) {
      throw new GoogleAuthError('Failed to retrieve email address from authenticated Google account.');
    }

    const tokenExpiry = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000);

    const scopes = typeof tokens.scope === 'string'
      ? tokens.scope.split(' ').filter(Boolean)
      : undefined;

    return {
      accessToken: tokens.access_token,
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
      tokenExpiry,
      email,
      googleAccountId,
      scopes,
    };
  } catch (err: unknown) {
    if (err instanceof GoogleAuthError) {
      throw err;
    }
    throw new GoogleAuthError('Failed to exchange authorization code for Google tokens.', err);
  }
}

/**
 * Revokes an active token with Google OAuth servers.
 */
export async function revokeToken(token: string): Promise<void> {
  const client = getOAuthClient();
  try {
    await client.revokeToken(token);
  } catch (err: unknown) {
    throw new GoogleAuthError('Failed to revoke Google OAuth token.', err);
  }
}

/**
 * Generates the Google OAuth 2.0 consent URL for Mailiac user authentication
 * requesting strictly openid, email, and profile scopes.
 */
export function generateUserAuthUrl(state?: string, customRedirectUri?: string): string {
  const redirectUri = getUserAuthRedirectUri(customRedirectUri);
  const client = getOAuthClient(redirectUri);

  return client.generateAuthUrl({
    access_type: 'online',
    prompt: 'select_account',
    scope: AUTH_SCOPES,
    ...(state ? { state } : {}),
  });
}

/**
 * Exchanges the one-time authorization code for user identity details,
 * strictly verifying the OpenID Connect id_token or userinfo profile.
 * Does not store or require Gmail scopes or tokens.
 */
export async function exchangeCodeForUserIdentity(
  code: string,
  customRedirectUri?: string
): Promise<GoogleUserIdentity> {
  const redirectUri = getUserAuthRedirectUri(customRedirectUri);
  const client = getOAuthClient(redirectUri);

  try {
    const { tokens } = await client.getToken(code);

    client.setCredentials(tokens);

    let googleId: string | undefined;
    let email: string | undefined;
    let name: string | undefined;
    let picture: string | undefined;

    // 1. Prioritize extracting profile identity directly from the signed ID token
    if (tokens.id_token) {
      try {
        const ticket = await client.verifyIdToken({
          idToken: tokens.id_token,
          audience: process.env['GOOGLE_CLIENT_ID'],
        });
        const payload = ticket.getPayload();
        if (payload) {
          googleId = payload.sub;
          email = payload.email;
          name = payload.name;
          picture = payload.picture;
        }
      } catch {
        // Fall back to oauth2 userinfo if ID token verification encounters any issue
      }
    }

    // 2. Fall back to oauth2 userinfo API if ID token wasn't present or missing required fields
    if (!googleId || !email) {
      const oauth2 = google.oauth2({ version: 'v2', auth: client });
      const userinfo = await oauth2.userinfo.get();
      if (userinfo.data) {
        googleId = userinfo.data.id ?? googleId;
        email = userinfo.data.email ?? email;
        name = userinfo.data.name ?? name;
        picture = userinfo.data.picture ?? picture;
      }
    }

    if (!googleId) {
      throw new GoogleAuthError('Failed to retrieve unique Google identity (sub) from Google account.');
    }

    if (!email) {
      throw new GoogleAuthError('Failed to retrieve email address from Google account.');
    }

    return {
      googleId,
      email: email.toLowerCase().trim(),
      name,
      picture,
    };
  } catch (err: unknown) {
    if (err instanceof GoogleAuthError) {
      throw err;
    }
    throw new GoogleAuthError('Failed to exchange authorization code for user identity.', err);
  }
}
