import { google } from 'googleapis';
import type { OAuth2Client } from './googleAuth.js';

export interface GmailMessageSummary {
  id: string;
  threadId?: string;
  sender: string;
  subject: string;
  date: string;
  snippet: string;
  messageIdHeader?: string;
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
 * Decodes standard HTML entities (named, decimal, hex) from text strings.
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    // Hex numeric entities: &#x1f600;
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        const codePoint = parseInt(hex, 16);
        return String.fromCodePoint(codePoint);
      } catch {
        return _;
      }
    })
    // Decimal numeric entities: &#39;
    .replace(/&#([0-9]+);/g, (_, dec) => {
      try {
        const codePoint = parseInt(dec, 10);
        return String.fromCodePoint(codePoint);
      } catch {
        return _;
      }
    })
    // Named entities
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&copy;/g, '©')
    .replace(/&reg;/g, '®')
    .replace(/&trade;/g, '™')
    .replace(/&hellip;/g, '…')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&bull;/g, '•')
    .replace(/&pound;/g, '£')
    .replace(/&euro;/g, '€');
}

/**
 * Decodes RFC 2047 MIME encoded words in email headers (e.g. =?UTF-8?B?...?= or =?UTF-8?Q?...?=).
 */
export function decodeRfc2047(text: string): string {
  if (!text || !text.includes('=?')) return text;

  // RFC 2047 linear-white-space between adjacent encoded-words is ignored
  const collapsed = text.replace(/(\?=\s+=\?)/g, '?==?');

  return collapsed.replace(
    /=\?([^?]+)\?([bBqQ])\?([^?]+)\?=/g,
    (_, _charset, encoding, encodedText) => {
      try {
        const enc = encoding.toUpperCase();
        if (enc === 'B') {
          return Buffer.from(encodedText, 'base64').toString('utf-8');
        }
        if (enc === 'Q') {
          const binary = encodedText
            .replace(/_/g, ' ')
            .replace(/=([0-9A-Fa-f]{2})/g, (_m: string, hex: string) =>
              String.fromCharCode(parseInt(hex, 16))
            );
          return Buffer.from(binary, 'binary').toString('utf-8');
        }
        return _;
      } catch {
        return _;
      }
    }
  );
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
 * Lists messages from Gmail with lightweight metadata headers (From, Subject, Date, Message-ID, Snippet).
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
            metadataHeaders: ['From', 'Subject', 'Date', 'Message-ID'],
          })
        );
        return detailRes.data;
      } catch {
        return null;
      }
    })
  );

  const summaries: GmailMessageSummary[] = [];
  const seenIds = new Set<string>();

  for (const detail of messageDetails) {
    if (!detail || !detail.id || seenIds.has(detail.id)) continue;
    seenIds.add(detail.id);

    const headers = detail.payload?.headers ?? [];
    const rawFromHeader =
      headers.find((h) => h.name?.toLowerCase() === 'from')?.value ??
      '(Unknown Sender)';
    const rawSubjectHeader =
      headers.find((h) => h.name?.toLowerCase() === 'subject')?.value ??
      '(No Subject)';
    const messageIdHeader = headers.find(
      (h) => h.name?.toLowerCase() === 'message-id'
    )?.value;
    const dateHeader =
      headers.find((h) => h.name?.toLowerCase() === 'date')?.value ??
      (detail.internalDate
        ? new Date(Number(detail.internalDate)).toISOString()
        : new Date().toISOString());

    const decodedSender = decodeHtmlEntities(decodeRfc2047(rawFromHeader));
    const decodedSubject = decodeHtmlEntities(decodeRfc2047(rawSubjectHeader));
    const decodedSnippet = decodeHtmlEntities(detail.snippet ?? '');

    summaries.push({
      id: detail.id,
      threadId: detail.threadId ?? undefined,
      sender: decodedSender,
      subject: decodedSubject,
      date: dateHeader,
      snippet: decodedSnippet,
      messageIdHeader: messageIdHeader ?? undefined,
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
