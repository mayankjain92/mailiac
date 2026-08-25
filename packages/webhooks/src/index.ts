import { createHmac, timingSafeEqual } from 'node:crypto';

export class WebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookError';
  }
}

/**
 * Signs a webhook payload string using HMAC-SHA256 with timestamp and secret.
 *
 * @param payload Raw string payload body
 * @param signingSecret Secret key (e.g. process.env.WEBHOOK_SIGNING_SECRET)
 * @param timestamp Unix timestamp in seconds or milliseconds
 * @returns Formatted signature string: `t=${timestamp},v1=${hashHex}`
 */
export function signPayload(
  payload: string,
  signingSecret: string,
  timestamp: number
): string {
  if (!signingSecret || typeof signingSecret !== 'string') {
    throw new WebhookError('Signing secret must be a non-empty string');
  }

  if (typeof timestamp !== 'number' || isNaN(timestamp) || timestamp <= 0) {
    throw new WebhookError('Timestamp must be a valid positive number');
  }

  const rawPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signatureBase = `${timestamp}.${rawPayload}`;

  const hmac = createHmac('sha256', signingSecret);
  hmac.update(signatureBase, 'utf8');
  const digest = hmac.digest('hex');

  return `t=${timestamp},v1=${digest}`;
}

/**
 * Verifies a signature header against a payload and secret.
 *
 * @param payload Raw string payload body
 * @param headerValue Signature header string (e.g., `t=1700000000,v1=abcdef...`)
 * @param signingSecret Secret key
 * @param toleranceSeconds Optional timestamp freshness tolerance in seconds
 * @returns boolean
 */
export function verifySignature(
  payload: string,
  headerValue: string,
  signingSecret: string,
  toleranceSeconds?: number
): boolean {
  if (!headerValue || !signingSecret) return false;

  const parts = headerValue.split(',');
  let timestampStr: string | null = null;
  let signatureHex: string | null = null;

  for (const part of parts) {
    const [key, value] = part.trim().split('=');
    if (key === 't') {
      timestampStr = value;
    } else if (key === 'v1') {
      signatureHex = value;
    }
  }

  if (!timestampStr || !signatureHex) return false;

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  if (toleranceSeconds && toleranceSeconds > 0) {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const diff = Math.abs(nowInSeconds - timestamp);
    if (diff > toleranceSeconds) {
      return false;
    }
  }

  try {
    const expectedHeader = signPayload(payload, signingSecret, timestamp);
    const expectedParts = expectedHeader.split(',');
    const expectedHex = expectedParts.find((p) => p.startsWith('v1='))?.slice(3);

    if (!expectedHex) return false;

    const sigBuffer = Buffer.from(signatureHex, 'hex');
    const expectedBuffer = Buffer.from(expectedHex, 'hex');

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch (_err) {
    return false;
  }
}
