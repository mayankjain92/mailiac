import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
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

