import { google } from 'googleapis';
import type { OAuth2Client } from './googleAuth.js';

export interface GmailMessageSummary {
  id: string;
  threadId?: string;
  sender: string;
  subject: string;
  date: string;
  snippet: string;
}

export interface ListMessagesOptions {
  q?: string;
  maxResults?: number;
  pageToken?: string;
}

export interface ListMessagesResult {
  messages: GmailMessageSummary[];
  nextPageToken?: string;
}

export class GmailClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'GmailClientError';
  }
}

/**
 * Exponential backoff retry wrapper for Google API calls encountering 429 (Too Many Requests).
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelayMs = 200
): Promise<T> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (err: unknown) {
      attempt++;

      const isRateLimit =
        err !== null &&
        typeof err === 'object' &&
        (('status' in err && (err as { status: number }).status === 429) ||
          ('code' in err && (err as { code: number }).code === 429));

      if (isRateLimit && attempt <= maxRetries) {
        const delay = initialDelayMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (err instanceof GmailClientError) {
        throw err;
      }

      const status =
        err !== null && typeof err === 'object' && 'status' in err
          ? Number((err as { status: unknown }).status)
          : undefined;

      const message =
        err instanceof Error ? err.message : 'Google API request failed';

      throw new GmailClientError(message, status, err);
    }
  }

  throw new GmailClientError(`Gmail API operation failed after ${maxRetries} retries`);
}

/**
 * Lists messages from Gmail with lightweight metadata headers (From, Subject, Date, Snippet).
 */
export async function listMessages(
  auth: OAuth2Client,
  options?: ListMessagesOptions
): Promise<ListMessagesResult> {
  const gmail = google.gmail({ version: 'v1', auth });

  const listRes = await executeWithRetry(() =>
    gmail.users.messages.list({
      userId: 'me',
      q: options?.q,
      maxResults: options?.maxResults ?? 20,
      pageToken: options?.pageToken,
    })
  );

  const rawMessages = listRes.data.messages ?? [];
  if (rawMessages.length === 0) {
    return {
      messages: [],
      nextPageToken: listRes.data.nextPageToken ?? undefined,
    };
  }

  const messageDetails = await Promise.all(
    rawMessages.map(async (msg) => {
      if (!msg.id) return null;
      try {
        const detailRes = await executeWithRetry(() =>
          gmail.users.messages.get({
            userId: 'me',
            id: msg.id!,
            format: 'metadata',
            metadataHeaders: ['From', 'Subject', 'Date'],
          })
        );
        return detailRes.data;
      } catch {
        return null;
      }
    })
  );

  const summaries: GmailMessageSummary[] = [];

  for (const detail of messageDetails) {
    if (!detail || !detail.id) continue;

    const headers = detail.payload?.headers ?? [];
    const fromHeader =
      headers.find((h) => h.name?.toLowerCase() === 'from')?.value ??
      '(Unknown Sender)';
    const subjectHeader =
      headers.find((h) => h.name?.toLowerCase() === 'subject')?.value ??
      '(No Subject)';
    const dateHeader =
      headers.find((h) => h.name?.toLowerCase() === 'date')?.value ??
      (detail.internalDate
        ? new Date(Number(detail.internalDate)).toISOString()
        : new Date().toISOString());

    summaries.push({
      id: detail.id,
      threadId: detail.threadId ?? undefined,
      sender: fromHeader,
      subject: subjectHeader,
      date: dateHeader,
      snippet: detail.snippet ?? '',
    });
  }

  return {
    messages: summaries,
    nextPageToken: listRes.data.nextPageToken ?? undefined,
  };
}

/**
 * Fetches the full raw RFC 822 MIME payload for a message and decodes base64url into a Buffer.
 */
export async function fetchRawMessage(
  auth: OAuth2Client,
  messageId: string
): Promise<Buffer> {
  if (!messageId || typeof messageId !== 'string' || messageId.trim() === '') {
    throw new GmailClientError('Invalid or missing message ID.', 400);
  }

  const gmail = google.gmail({ version: 'v1', auth });

  const res = await executeWithRetry(() =>
    gmail.users.messages.get({
      userId: 'me',
      id: messageId.trim(),
      format: 'raw',
    })
  );

  if (!res.data.raw) {
    throw new GmailClientError(
      `No raw RFC 822 payload returned for message ID: ${messageId}`,
      404
    );
  }

  // Decode base64url string directly into Buffer
  return Buffer.from(res.data.raw, 'base64url');
}

/**
 * Helper to ensure the OAuth2 client has active credentials and refreshes if needed.
 */
export async function ensureFreshToken(
  auth: OAuth2Client,
  refreshToken?: string
): Promise<string | null> {
  if (refreshToken) {
    auth.setCredentials({ refresh_token: refreshToken });
  }

  try {
    const tokenRes = await auth.getAccessToken();
    return tokenRes.token ?? null;
  } catch (err: unknown) {
    throw new GmailClientError('Failed to refresh Google OAuth access token.', 401, err);
  }
}
