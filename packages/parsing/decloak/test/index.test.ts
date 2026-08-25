import { describe, it, expect } from 'vitest';
import { decloakHtml } from '../src/index.js';

describe('HTML De-cloaking (@mailiac/parsing-decloak)', () => {
  describe('Happy Path (Clean HTML)', () => {
    it('returns clean HTML unchanged when no evasion techniques are present', () => {
      const cleanHtml = '<p>Hello world! Please find the attached document.</p><a href="https://example.com">Visit site</a>';
      const result = decloakHtml(cleanHtml);

      expect(result.cleanedHtml).toBe(cleanHtml);
      expect(result.zeroWidthCharCount).toBe(0);
      expect(result.glasswormFlag).toBe(false);
    });

    it('handles full HTML documents cleanly', () => {
      const fullDoc = '<html><head><title>Test</title></head><body><h1>Welcome</h1><p>Legitimate email content.</p></body></html>';
      const result = decloakHtml(fullDoc);

      expect(result.cleanedHtml).toContain('<h1>Welcome</h1>');
      expect(result.cleanedHtml).toContain('<p>Legitimate email content.</p>');
      expect(result.zeroWidthCharCount).toBe(0);
      expect(result.glasswormFlag).toBe(false);
    });
  });

  describe('Zero-Width Character Stripping & Glassworm Threshold', () => {
    it('strips zero-width characters and counts them accurately', () => {
      // Injected zero-width space (U+200B) and soft-hyphen (U+00AD)
      const input = 'P\u200Ba\u200By\u200Bp\u00ADa\u00ADl Security Notice';
      const result = decloakHtml(input);

      expect(result.cleanedHtml).toBe('Paypal Security Notice');
      expect(result.zeroWidthCharCount).toBe(5);
      expect(result.glasswormFlag).toBe(false); // <= 50 threshold
    });

    it('flags glasswormFlag = true when zero-width count exceeds threshold (>50)', () => {
      // Create 60 zero-width spaces interspersed in text
      const zeroWidthSpam = Array(60).fill('\u200B').join('a');
      const input = `<div>${zeroWidthSpam}</div>`;
      const result = decloakHtml(input);

      expect(result.zeroWidthCharCount).toBe(60);
      expect(result.glasswormFlag).toBe(true);
      expect(result.cleanedHtml).toBe(`<div>${'a'.repeat(59)}</div>`);
    });

    it('strips various Unicode invisible characters (FEFF, 200C, 200D, 200E, 200F)', () => {
      const input = '<span>U\uFEFFr\u200Cg\u200De\u200En\u200Ft</span>';
      const result = decloakHtml(input);

      expect(result.cleanedHtml).toBe('<span>Urgent</span>');
      expect(result.zeroWidthCharCount).toBe(5);
    });
  });

  describe('DOM Hidden Element Stripping (Glassworm Patterns)', () => {
    it('strips elements styled with display: none', () => {
      const input = '<div>Visible text<span style="display: none">Hidden text to confuse Bayesian filter</span></div>';
      const result = decloakHtml(input);

      expect(result.cleanedHtml).toBe('<div>Visible text</div>');
      expect(result.glasswormFlag).toBe(true);
    });

    it('strips elements styled with opacity: 0', () => {
      const input = '<p>Legit content<span style="opacity: 0;">Invisible cloaked text</span></p>';
      const result = decloakHtml(input);

      expect(result.cleanedHtml).toBe('<p>Legit content</p>');
      expect(result.glasswormFlag).toBe(true);
    });

    it('strips elements styled with font-size: 0 / 0px', () => {
      const input = '<p>Real message<span style="font-size: 0px">Hidden 0px payload</span></p>';
      const result = decloakHtml(input);

      expect(result.cleanedHtml).toBe('<p>Real message</p>');
      expect(result.glasswormFlag).toBe(true);
    });

    it('strips elements styled with visibility: hidden', () => {
      const input = '<p>Invoice details<span style="visibility: hidden">Hidden decoy</span></p>';
      const result = decloakHtml(input);

      expect(result.cleanedHtml).toBe('<p>Invoice details</p>');
      expect(result.glasswormFlag).toBe(true);
    });

    it('strips elements with hidden attribute', () => {
      const input = '<div>Main text<span hidden>Hidden span</span></div>';
      const result = decloakHtml(input);

      expect(result.cleanedHtml).toBe('<div>Main text</div>');
      expect(result.glasswormFlag).toBe(true);
    });

    it('strips elements with transparent color or offscreen positioning', () => {
      const input = '<div>Valid<span style="color: transparent">Cloaked</span><span style="position: absolute; left: -9999px">Offscreen</span></div>';
      const result = decloakHtml(input);

      expect(result.cleanedHtml).toBe('<div>Valid</div>');
      expect(result.glasswormFlag).toBe(true);
    });
  });

  describe('Security Sanitization', () => {
    it('strips script, iframe, and dangerous tags', () => {
      const input = '<div>Content<script>evilCode()</script><iframe src="https://attacker.com"></iframe></div>';
      const result = decloakHtml(input);

      expect(result.cleanedHtml).toBe('<div>Content</div>');
      expect(result.cleanedHtml).not.toContain('<script>');
      expect(result.cleanedHtml).not.toContain('<iframe>');
    });

    it('strips inline on* event handlers and javascript: URIs', () => {
      const input = '<a href="javascript:alert(1)" onclick="steal()">Click me</a><img src="x" onerror="boom()"/>';
      const result = decloakHtml(input);

      expect(result.cleanedHtml).not.toContain('onclick');
      expect(result.cleanedHtml).not.toContain('onerror');
      expect(result.cleanedHtml).not.toContain('javascript:');
      expect(result.cleanedHtml).toContain('<a>Click me</a>');
      expect(result.cleanedHtml).toContain('<img src="x">');
    });
  });

  describe('Edge Cases & Malformed Inputs', () => {
    it('handles empty string gracefully', () => {
      const result = decloakHtml('');
      expect(result).toEqual({
        cleanedHtml: '',
        zeroWidthCharCount: 0,
        glasswormFlag: false,
      });
    });

    it('handles non-string / null / undefined inputs gracefully', () => {
      // @ts-expect-error Testing runtime invalid inputs
      expect(decloakHtml(null)).toEqual({
        cleanedHtml: '',
        zeroWidthCharCount: 0,
        glasswormFlag: false,
      });
      // @ts-expect-error Testing runtime invalid inputs
      expect(decloakHtml(undefined)).toEqual({
        cleanedHtml: '',
        zeroWidthCharCount: 0,
        glasswormFlag: false,
      });
      // @ts-expect-error Testing runtime invalid inputs
      expect(decloakHtml(12345)).toEqual({
        cleanedHtml: '',
        zeroWidthCharCount: 0,
        glasswormFlag: false,
      });
    });

    it('handles malformed / unclosed HTML gracefully without crashing', () => {
      const malformed = '<p>Broken <b>tag unclosed <div>another broken';
      const result = decloakHtml(malformed);
      expect(result.cleanedHtml).toBeDefined();
      expect(result.zeroWidthCharCount).toBe(0);
      expect(result.glasswormFlag).toBe(false);
    });
  });
});
