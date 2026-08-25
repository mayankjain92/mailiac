import { createHash } from 'node:crypto';
import PostalMime from 'postal-mime';
import type { MDM, ParsedAttachment } from '@mailiac/shared-types';

export class ParseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ParseError';
    Object.setPrototypeOf(this, ParseError.prototype);
  }
}

/**
 * Parses a raw EML Buffer into the frozen MDM (Mail Decomposition Model) object.
 *
 * - Extracts from, replyTo, subject, date, bodyText, bodyHtmlRaw.
 * - Collects rawHeaders preserving header values.
 * - Extracts receivedHeadersRaw preserving top-to-bottom order.
 * - Computes SHA-256 hashes and sizeBytes for all attachments (including zero-byte attachments).
 * - Throws ParseError for malformed or unprocessable inputs.
 */
export async function parseEmlToMdm(rawEml: Buffer): Promise<MDM> {
  if (!rawEml || !Buffer.isBuffer(rawEml)) {
    throw new ParseError('Invalid EML input: rawEml must be a non-null Buffer');
  }

  if (rawEml.length === 0) {
    throw new ParseError('Invalid EML input: buffer is empty');
  }

  let parsedEmail;
  try {
    const parser = new PostalMime();
    parsedEmail = await parser.parse(rawEml);
  } catch (err) {
    throw new ParseError(
      `Failed to parse EML buffer: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err }
    );
  }

  if (!parsedEmail) {
    throw new ParseError('Failed to parse EML: parser returned no output');
  }

  // 1. Message-ID
  const messageId = parsedEmail.messageId?.trim() || '';

  // 2. Raw Headers and Received Headers (preserving top-to-bottom order)
  const rawHeaders: Record<string, string[]> = {};
  const receivedHeadersRaw: string[] = [];

  if (Array.isArray(parsedEmail.headers)) {
    for (const header of parsedEmail.headers) {
      const key = header.key.toLowerCase();
      if (!rawHeaders[key]) {
        rawHeaders[key] = [];
      }
      rawHeaders[key].push(header.value);

      if (key === 'received') {
        receivedHeadersRaw.push(header.value);
      }
    }
  }

  // 3. Sender / From
  let fromName: string | undefined = undefined;
  let fromAddress = '';

  if (parsedEmail.from) {
    if ('address' in parsedEmail.from && typeof parsedEmail.from.address === 'string') {
      fromAddress = parsedEmail.from.address.trim();
      if (parsedEmail.from.name && parsedEmail.from.name.trim()) {
        fromName = parsedEmail.from.name.trim();
      }
    } else if (
      'group' in parsedEmail.from &&
      Array.isArray(parsedEmail.from.group) &&
      parsedEmail.from.group.length > 0
    ) {
      const firstGroupMember = parsedEmail.from.group[0];
      if (firstGroupMember?.address) {
        fromAddress = firstGroupMember.address.trim();
      }
      if (firstGroupMember?.name && firstGroupMember.name.trim()) {
        fromName = firstGroupMember.name.trim();
      } else if (parsedEmail.from.name && parsedEmail.from.name.trim()) {
        fromName = parsedEmail.from.name.trim();
      }
    }
  }

  // 4. Reply-To
  let replyTo: string | undefined = undefined;
  if (Array.isArray(parsedEmail.replyTo) && parsedEmail.replyTo.length > 0) {
    const firstReply = parsedEmail.replyTo[0];
    if (firstReply) {
      if ('address' in firstReply && typeof firstReply.address === 'string' && firstReply.address.trim()) {
        replyTo = firstReply.address.trim();
      } else if ('group' in firstReply && Array.isArray(firstReply.group) && firstReply.group[0]?.address) {
        replyTo = firstReply.group[0].address.trim();
      }
    }
  }

  // 5. Subject & Date
  const subject = parsedEmail.subject ?? '';
  const date = parsedEmail.date ?? '';

  // 6. Body Text and HTML Raw
  const bodyText = parsedEmail.text ?? '';
  const bodyHtmlRaw = parsedEmail.html ?? '';

  // 7. Attachments with SHA-256 hashing
  const attachments: ParsedAttachment[] = [];
  if (Array.isArray(parsedEmail.attachments)) {
    for (const att of parsedEmail.attachments) {
      let contentBuffer: Buffer;
      if (Buffer.isBuffer(att.content)) {
        contentBuffer = att.content;
      } else if (att.content instanceof Uint8Array) {
        contentBuffer = Buffer.from(att.content.buffer, att.content.byteOffset, att.content.byteLength);
      } else if (att.content instanceof ArrayBuffer) {
        contentBuffer = Buffer.from(att.content);
      } else if (typeof att.content === 'string') {
        contentBuffer = Buffer.from(att.content, att.encoding === 'base64' ? 'base64' : 'utf8');
      } else {
        contentBuffer = Buffer.alloc(0);
      }

      const sha256 = createHash('sha256').update(contentBuffer).digest('hex');
      const filename = att.filename ?? '';
      const contentType = att.mimeType || 'application/octet-stream';
      const sizeBytes = contentBuffer.length;

      attachments.push({
        filename,
        contentType,
        sizeBytes,
        sha256,
      });
    }
  }

  const mdm: MDM = {
    messageId,
    rawHeaders,
    from: {
      ...(fromName ? { name: fromName } : {}),
      address: fromAddress,
    },
    ...(replyTo ? { replyTo } : {}),
    subject,
    date,
    bodyText,
    bodyHtmlRaw,
    attachments,
    receivedHeadersRaw,
  };

  return mdm;
}
