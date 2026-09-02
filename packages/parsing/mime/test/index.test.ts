import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseEmlToMdm, ParseError } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadFixture(filename: string): Buffer {
  return readFileSync(join(__dirname, 'fixtures', filename));
}

describe('MIME Parser (@mailiac/parsing-mime)', () => {
  describe('Happy Path', () => {
    it('correctly deconstructs a standard multipart EML into MDM', async () => {
      const emlBuffer = loadFixture('happy-path.eml');
      const mdm = await parseEmlToMdm(emlBuffer);

      // Core metadata
      expect(mdm.messageId).toBe('<msg-001@example.com>');
      expect(mdm.subject).toBe('Monthly Financial Report');
      expect(mdm.date).toBe('2026-08-25T10:00:00.000Z');

      // Sender and Reply-To
      expect(mdm.from).toEqual({
        name: 'Jane Doe',
        address: 'jane.doe@example.com',
      });
      expect(mdm.replyTo).toBe('replies@example.com');

      // Body text & html
      expect(mdm.bodyText).toContain('Please find attached the monthly financial report for August 2026.');
      expect(mdm.bodyHtmlRaw).toContain('<p>Please find attached the monthly financial report for August 2026.</p>');

      // Raw Headers
      expect(mdm.rawHeaders).toBeDefined();
      expect(mdm.rawHeaders['subject']).toBeDefined();
      expect(mdm.rawHeaders['from']).toBeDefined();
      expect(mdm.rawHeaders['received']).toBeDefined();
      expect(mdm.rawHeaders['received']?.length).toBe(3);

      // Received Headers order preservation (top to bottom)
      expect(mdm.receivedHeadersRaw).toHaveLength(3);
      expect(mdm.receivedHeadersRaw[0]).toContain('mail.receiver.com');
      expect(mdm.receivedHeadersRaw[1]).toContain('mail.example.com');
      expect(mdm.receivedHeadersRaw[2]).toContain('internal.example.com');

      // Attachment handling and SHA-256 calculation
      expect(mdm.attachments).toHaveLength(1);
      const att = mdm.attachments[0];
      expect(att.filename).toBe('report.csv');
      expect(att.contentType).toBe('text/csv');
      expect(att.sizeBytes).toBeGreaterThan(0);

      // Verify SHA-256 matches expected content
      const expectedContent = Buffer.from(
        'aWQsbmFtZSxhbW91bnQKMTEsQWxpY2UsMTAwLjAwCjEyLEJvYiwxNTUuNTA=',
        'base64'
      );
      const expectedHash = createHash('sha256').update(expectedContent).digest('hex');
      expect(att.sha256).toBe(expectedHash);
      expect(att.sizeBytes).toBe(expectedContent.length);
    });
  });

  describe('Phishing & Malicious Email Fixture', () => {
    it('parses suspicious headers, mismatched reply-to, and executable attachment', async () => {
      const emlBuffer = loadFixture('malicious-phish.eml');
      const mdm = await parseEmlToMdm(emlBuffer);

      expect(mdm.messageId).toBe('<evil-phish-666@evil-domain.ru>');
      expect(mdm.subject).toBe('URGENT: Immediate Wire Transfer Required');
      expect(mdm.from.address).toBe('ceo@target-corp.com');
      expect(mdm.from.name).toBe('CEO Executive');
      expect(mdm.replyTo).toBe('attacker-mailbox@evil-domain.ru');

      // Check hop order
      expect(mdm.receivedHeadersRaw).toHaveLength(3);
      expect(mdm.receivedHeadersRaw[0]).toContain('mx.target.com');
      expect(mdm.receivedHeadersRaw[1]).toContain('relay.evil-spoofer.net');
      expect(mdm.receivedHeadersRaw[2]).toContain('botnet-node-42.ru');

      // Executable attachment inspection
      expect(mdm.attachments).toHaveLength(1);
      const att = mdm.attachments[0];
      expect(att.filename).toBe('Invoice_Confidential.pdf.exe');
      expect(att.contentType).toBe('application/x-msdownload');
      expect(att.sha256).toBeDefined();
      expect(att.sha256).toHaveLength(64); // 256-bit hex
    });
  });

  describe('Zero-Byte Attachment Edge Case', () => {
    it('computes accurate SHA-256 for 0-byte attachment without error', async () => {
      const emlBuffer = loadFixture('zero-byte-attachment.eml');
      const mdm = await parseEmlToMdm(emlBuffer);

      expect(mdm.attachments).toHaveLength(1);
      const att = mdm.attachments[0];
      expect(att.filename).toBe('empty.txt');
      expect(att.sizeBytes).toBe(0);
      // SHA-256 of empty buffer: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
      expect(att.sha256).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });

  describe('Email without attachments', () => {
    it('returns an empty attachments array when email has no attachments', async () => {
      const simpleEml = Buffer.from(
        'From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Simple Note\r\n\r\nHello World'
      );
      const mdm = await parseEmlToMdm(simpleEml);

      expect(mdm.subject).toBe('Simple Note');
      expect(mdm.from.address).toBe('sender@example.com');
      expect(mdm.bodyText.trim()).toBe('Hello World');
      expect(mdm.attachments).toEqual([]);
      expect(mdm.replyTo).toBeUndefined();
    });
  });

  describe('Malformed & Invalid Inputs', () => {
    it('throws ParseError on empty buffer', async () => {
      const emptyBuffer = Buffer.alloc(0);
      await expect(parseEmlToMdm(emptyBuffer)).rejects.toThrow(ParseError);
      await expect(parseEmlToMdm(emptyBuffer)).rejects.toThrow('buffer is empty');
    });

    it('throws ParseError on null / non-buffer input', async () => {
      // @ts-expect-error Testing runtime invalid input
      await expect(parseEmlToMdm(null)).rejects.toThrow(ParseError);
      // @ts-expect-error Testing runtime invalid input
      await expect(parseEmlToMdm('not a buffer')).rejects.toThrow(ParseError);
      // @ts-expect-error Testing runtime invalid input
      await expect(parseEmlToMdm(undefined)).rejects.toThrow(ParseError);
    });

    it('handles truncated or minimal EML gracefully without unhandled crashes', async () => {
      const truncatedEml = Buffer.from('From: broken@example.com\r\nSubject: Truncated');
      const mdm = await parseEmlToMdm(truncatedEml);
      expect(mdm.from.address).toBe('broken@example.com');
      expect(mdm.subject).toBe('Truncated');
      expect(mdm.attachments).toEqual([]);
    });
  });

  describe('P3 Regression Tests — MIME & Body Extraction', () => {
    it('1. HTML-only email — successfully converts HTML to normalized text when text/plain is missing', async () => {
      const emlBuffer = loadFixture('sample-1.eml');
      const mdm = await parseEmlToMdm(emlBuffer);

      expect(mdm.bodyHtmlRaw).toContain('<html');
      expect(mdm.bodyText).not.toBe('');
      expect(mdm.bodyText).toContain('Banco do Bradesco (Livelo)');
      expect(mdm.bodyText).toContain('Resgatar Agora');
    });

    it('2. text/plain email — extracts plain text body directly', async () => {
      const eml = Buffer.from(
        'From: user@example.com\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nThis is a pure plain text email.'
      );
      const mdm = await parseEmlToMdm(eml);
      expect(mdm.bodyText.trim()).toBe('This is a pure plain text email.');
    });

    it('3. multipart/alternative email — prefers text/plain when present', async () => {
      const eml = Buffer.from(
        'From: sender@example.com\r\n' +
          'Content-Type: multipart/alternative; boundary="boundary123"\r\n\r\n' +
          '--boundary123\r\n' +
          'Content-Type: text/plain; charset=utf-8\r\n\r\n' +
          'Plain text content\r\n' +
          '--boundary123\r\n' +
          'Content-Type: text/html; charset=utf-8\r\n\r\n' +
          '<b>HTML content</b>\r\n' +
          '--boundary123--\r\n'
      );
      const mdm = await parseEmlToMdm(eml);
      expect(mdm.bodyText.trim()).toBe('Plain text content');
      expect(mdm.bodyHtmlRaw.trim()).toBe('<b>HTML content</b>');
    });

    it('4. quoted-printable body — decodes quoted-printable encoding correctly', async () => {
      const eml = Buffer.from(
        'From: sender@example.com\r\n' +
          'Content-Type: text/plain; charset=utf-8\r\n' +
          'Content-Transfer-Encoding: quoted-printable\r\n\r\n' +
          'Hello=20World=3D100'
      );
      const mdm = await parseEmlToMdm(eml);
      expect(mdm.bodyText.trim()).toBe('Hello World=100');
    });

    it('5. base64 body — decodes base64 body correctly', async () => {
      const base64Content = Buffer.from('Base64 decoded body text').toString('base64');
      const eml = Buffer.from(
        'From: sender@example.com\r\n' +
          'Content-Type: text/plain; charset=utf-8\r\n' +
          'Content-Transfer-Encoding: base64\r\n\r\n' +
          base64Content
      );
      const mdm = await parseEmlToMdm(eml);
      expect(mdm.bodyText.trim()).toBe('Base64 decoded body text');
    });

    it('6. empty body — handles empty email body without throwing', async () => {
      const eml = Buffer.from('From: sender@example.com\r\nSubject: No body\r\n\r\n');
      const mdm = await parseEmlToMdm(eml);
      expect(mdm.bodyText).toBe('');
      expect(mdm.bodyHtmlRaw).toBe('');
    });
  });
});
