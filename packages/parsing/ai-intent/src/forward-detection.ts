/**
 * Deterministic forward and relay message detection for email bodies and subjects.
 * Identifies standard MUA forward delimiters (Gmail, Outlook, Apple Mail, Thunderbird)
 * and extracts the original sender identity and domain to prevent false-positive impersonation verdicts.
 */

export interface ForwardMetadata {
  isForwarded: boolean;
  forwardMarker?: string;
  originalSender?: string;
  originalSenderAddress?: string;
  originalSenderDomain?: string;
  originalSubject?: string;
  originalDate?: string;
  preamble?: string;
  forwardedBody?: string;
}

const FORWARD_SUBJECT_REGEX = /^(?:fwd?|fw|enc|wg|tr|vs|i-d):\s*/i;

const FORWARD_DELIMITERS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'GMAIL_DELIMITER',
    pattern: /-{3,}\s*Forwarded message\s*-{3,}/i,
  },
  {
    name: 'OUTLOOK_DELIMITER',
    pattern: /-{3,}\s*Original Message\s*-{3,}/i,
  },
  {
    name: 'APPLE_MAIL_DELIMITER',
    pattern: /Begin forwarded message:/i,
  },
  {
    name: 'THUNDERBIRD_DELIMITER',
    pattern: /-{3,}\s*Forwarded Message\s*-{3,}/i,
  },
];

const EMAIL_ADDR_REGEX = /<([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>|\b([A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,}))\b/;

/**
 * Extracts domain from an email address or host string.
 */
function extractDomainFromAddress(addr: string): string | undefined {
  if (!addr) return undefined;
  const match = addr.match(/@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  if (match && match[1]) {
    return match[1].toLowerCase().trim();
  }
  return undefined;
}

/**
 * Parses email text and subject to detect whether an email is a forwarded message or relay,
 * extracting the original sender, domain, and forwarded body boundaries.
 */
export function detectForwardedMessage(
  text: string,
  subject?: string,
  options?: { arcPass?: boolean }
): ForwardMetadata {
  const safeText = text || '';
  const safeSubject = subject || '';

  const subjectIsForwarded = FORWARD_SUBJECT_REGEX.test(safeSubject.trim());
  let matchedDelimiterName: string | undefined = undefined;
  let splitIndex = -1;
  let delimiterLength = 0;

  for (const delim of FORWARD_DELIMITERS) {
    const match = delim.pattern.exec(safeText);
    if (match && match.index !== undefined) {
      matchedDelimiterName = delim.name;
      splitIndex = match.index;
      delimiterLength = match[0].length;
      break;
    }
  }

  // Fallback: Check for generic inline header block (e.g. "From: ... \nDate: ... \nSubject: ...")
  if (splitIndex === -1 && subjectIsForwarded) {
    const headerBlockMatch = /(?:^|\n)(?:From|De|Von):\s*[^\n]+\n(?:Date|Fecha|Datum|Sent):\s*[^\n]+/i.exec(safeText);
    if (headerBlockMatch && headerBlockMatch.index !== undefined) {
      matchedDelimiterName = 'INLINE_HEADER_BLOCK';
      splitIndex = headerBlockMatch.index;
      delimiterLength = 0; // Header block is part of the forwarded content
    }
  }

  const isForwarded = Boolean(
    matchedDelimiterName ||
    (subjectIsForwarded && (safeText.includes('From:') || safeText.includes('from:'))) ||
    options?.arcPass
  );

  if (!isForwarded) {
    return {
      isForwarded: false,
    };
  }

  let preamble = '';
  let forwardedSection = safeText;

  if (splitIndex >= 0) {
    preamble = safeText.slice(0, splitIndex).trim();
    forwardedSection = safeText.slice(splitIndex + delimiterLength).trim();
  }

  // Extract embedded headers from forwarded section (inspecting the first 2000 chars of forwarded section)
  const headerSearchWindow = forwardedSection.slice(0, 2000);

  let originalSender: string | undefined = undefined;
  let originalSenderAddress: string | undefined = undefined;
  let originalSenderDomain: string | undefined = undefined;
  let originalSubject: string | undefined = undefined;
  let originalDate: string | undefined = undefined;

  const fromMatch = /(?:^|\n)(?:From|De|Von):\s*([^\n\r]+)/i.exec(headerSearchWindow);
  if (fromMatch && fromMatch[1]) {
    originalSender = fromMatch[1].trim();
    const addrMatch = EMAIL_ADDR_REGEX.exec(originalSender);
    if (addrMatch) {
      originalSenderAddress = (addrMatch[1] || addrMatch[2] || '').toLowerCase().trim();
      originalSenderDomain = extractDomainFromAddress(originalSenderAddress);
    }
  }

  const subjMatch = /(?:^|\n)(?:Subject|Asunto|Betreff):\s*([^\n\r]+)/i.exec(headerSearchWindow);
  if (subjMatch && subjMatch[1]) {
    originalSubject = subjMatch[1].trim();
  }

  const dateMatch = /(?:^|\n)(?:Date|Fecha|Datum|Sent):\s*([^\n\r]+)/i.exec(headerSearchWindow);
  if (dateMatch && dateMatch[1]) {
    originalDate = dateMatch[1].trim();
  }

  return {
    isForwarded: true,
    forwardMarker: matchedDelimiterName || (options?.arcPass ? 'ARC_SEAL' : 'SUBJECT_PREFIX'),
    originalSender,
    originalSenderAddress,
    originalSenderDomain,
    originalSubject,
    originalDate,
    preamble,
    forwardedBody: forwardedSection,
  };
}
