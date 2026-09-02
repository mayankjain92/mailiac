import { google, type Auth } from 'googleapis';

export type OAuth2Client = Auth.OAuth2Client;

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.readonly',
];

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
}

/**
 * Creates and returns an initialized OAuth2Client instance using environment configuration.
 */
export function getOAuthClient(customRedirectUri?: string): OAuth2Client {
  const clientId = process.env['GOOGLE_CLIENT_ID'];
  const clientSecret = process.env['GOOGLE_CLIENT_SECRET'];
  const redirectUri =
    customRedirectUri ??
    process.env['GOOGLE_REDIRECT_URI'] ??
    'http://localhost:4000/api/gmail/auth/callback';

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
  const client = getOAuthClient(customRedirectUri);

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
  const client = getOAuthClient(customRedirectUri);

  try {
    const { tokens } = await client.getToken(code);

    if (!tokens.access_token) {
      throw new GoogleAuthError('OAuth token exchange failed: No access_token returned by Google.');
    }

    client.setCredentials(tokens);

    let email: string | undefined;

    // 1. Try extracting email from id_token if available
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
    }

    if (!email) {
      throw new GoogleAuthError('Failed to retrieve email address from authenticated Google account.');
    }

    const tokenExpiry = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000);

    return {
      accessToken: tokens.access_token,
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
      tokenExpiry,
      email,
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
