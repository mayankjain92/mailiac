import * as cheerio from 'cheerio';

/**
 * Regex matching zero-width, invisible, and cloaking Unicode characters.
 * Includes:
 * - U+200B: Zero-Width Space
 * - U+200C: Zero-Width Non-Joiner
 * - U+200D: Zero-Width Joiner
 * - U+FEFF: Zero-Width No-Break Space (Byte Order Mark)
 * - U+00AD: Soft Hyphen
 * - U+200E, U+200F: Left-To-Right / Right-To-Left Marks
 * - U+202A - U+202E: BiDi embedding / override controls
 * - U+2060 - U+2064: Invisible separators / word joiners
 * - U+180E: Mongolian Vowel Separator
 */
const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF\u00AD\u200E\u200F\u202A-\u202E\u2060-\u2064\u180E]/g;

/**
 * Threshold for zero-width character count before flagging as Glassworm cloaking.
 */
const GLASSWORM_ZERO_WIDTH_THRESHOLD = 50;

export interface ExtractedUrl {
  href: string;
  text: string;
  domain?: string;
}

export interface DecloakResult {
  cleanedHtml: string;
  extractedText: string;
  extractedUrls: ExtractedUrl[];
  zeroWidthCharCount: number;
  glasswormFlag: boolean;
}

/**
 * De-cloaks and sanitizes raw email HTML:
 * 1. Counts and strips zero-width and invisible Unicode characters (U+200B, U+00AD, etc.).
 * 2. Uses Cheerio to detect and strip cloaked/hidden DOM elements (display:none, opacity:0, font-size:0px, etc.).
 * 3. Sanitizes unsafe script tags and event handlers.
 * 4. Flags Glassworm evasion patterns when zero-width count exceeds threshold (>50) or hidden cloaking is detected.
 */
export function decloakHtml(rawHtml: string): DecloakResult {
  if (!rawHtml || typeof rawHtml !== 'string') {
    return {
      cleanedHtml: '',
      extractedText: '',
      extractedUrls: [],
      zeroWidthCharCount: 0,
      glasswormFlag: false,
    };
  }

  // 1. Count zero-width characters
  const zeroWidthMatches = rawHtml.match(ZERO_WIDTH_REGEX);
  const zeroWidthCharCount = zeroWidthMatches ? zeroWidthMatches.length : 0;

  // 2. Strip zero-width characters from raw string
  const strippedHtml = rawHtml.replace(ZERO_WIDTH_REGEX, '');

  // 3. Load HTML into Cheerio (isDocument is true only if full document tags are present)
  const isFullDocument = /^\s*(?:<!doctype|<html|<body|<head)/i.test(strippedHtml);
  const $ = cheerio.load(strippedHtml, null, isFullDocument);

  let hasHiddenCloakedElements = false;

  // 4. Detect and remove hidden/cloaked elements
  $('*').each((_, el) => {
    const $el = $(el);
    const style = ($el.attr('style') || '').toLowerCase();
    const isHiddenAttr = $el.is('[hidden]') || $el.attr('hidden') !== undefined;

    const isDisplayNone = /display\s*:\s*none/i.test(style);
    const isOpacityZero = /opacity\s*:\s*0(?:\.0+)?(?![0-9.])/i.test(style);
    const isFontSizeZero = /font-size\s*:\s*0(?:px|pt|em|rem|%)?/i.test(style);
    const isVisibilityHidden = /visibility\s*:\s*hidden/i.test(style);
    const isMaxHeightZero = /max-height\s*:\s*0(?:px|pt|em)?/i.test(style);
    const isOffscreen = /(?:left|top|text-indent)\s*:\s*-\d{3,}px/i.test(style);
    const isColorTransparent =
      /color\s*:\s*(?:transparent|rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(?:\.0+)?\s*\))/i.test(style);

    if (
      isHiddenAttr ||
      isDisplayNone ||
      isOpacityZero ||
      isFontSizeZero ||
      isVisibilityHidden ||
      isMaxHeightZero ||
      isOffscreen ||
      isColorTransparent
    ) {
      hasHiddenCloakedElements = true;
      $el.remove();
    }
  });

  // Extract anchor href URLs and visible text before tag stripping
  const extractedUrls: ExtractedUrl[] = [];
  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = ($el.attr('href') || '').trim();
    const text = $el.text().trim();
    if (href && !href.toLowerCase().startsWith('javascript:')) {
      try {
        const parsedUrl = new URL(href);
        extractedUrls.push({
          href,
          text: text || href,
          domain: parsedUrl.hostname.toLowerCase(),
        });
      } catch {
        extractedUrls.push({
          href,
          text: text || href,
        });
      }
    }
  });

  // Extract clean visible text
  const rawText = $('body').length > 0 ? $('body').text() : $.text();
  const extractedText = rawText
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

  // 5. Strip dangerous executable / embedding tags
  $('script, noscript, iframe, object, embed, applet, meta[http-equiv="refresh"]').remove();

  // 6. Strip inline event handlers and javascript: URLs
  $('*').each((_, el) => {
    if ('attribs' in el && el.attribs) {
      for (const attr of Object.keys(el.attribs)) {
        if (attr.toLowerCase().startsWith('on')) {
          $(el).removeAttr(attr);
        }
      }
    }
  });

  $('a[href], link[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (href.trim().toLowerCase().startsWith('javascript:')) {
      $(el).removeAttr('href');
    }
  });

  $('img[src]').each((_, el) => {
    const src = $(el).attr('src') || '';
    if (src.trim().toLowerCase().startsWith('javascript:')) {
      $(el).removeAttr('src');
    }
  });

  const cleanedHtml = $.html().trim();

  // Flag Glassworm if zero-width count > 50 or hidden cloaking elements were present
  const glasswormFlag = zeroWidthCharCount > GLASSWORM_ZERO_WIDTH_THRESHOLD || hasHiddenCloakedElements;

  return {
    cleanedHtml,
    extractedText,
    extractedUrls,
    zeroWidthCharCount,
    glasswormFlag,
  };
}
