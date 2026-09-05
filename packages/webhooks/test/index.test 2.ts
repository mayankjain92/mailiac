import { describe, it, expect } from 'vitest';
import { signPayload, verifySignature, WebhookError } from '../src/index.js';

describe('webhooks', () => {
  const secret = 'super-secret-webhook-key-12345';
  const samplePayload = JSON.stringify({ jobId: 'job-999', riskScore: 85 });
  const timestamp = Math.floor(Date.now() / 1000);

  describe('signPayload', () => {
    it('happy path: produces expected t= and v1= formatted signature string', () => {
      const sigHeader = signPayload(samplePayload, secret, timestamp);

      expect(sigHeader).toContain(`t=${timestamp}`);
      expect(sigHeader).toContain(',v1=');

      const parts = sigHeader.split(',v1=');
      expect(parts.length).toBe(2);
      expect(parts[1]).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex string
    });

    it('throws WebhookError when secret is missing or empty', () => {
      expect(() => signPayload(samplePayload, '', timestamp)).toThrow(WebhookError);
      expect(() => signPayload(samplePayload, '', timestamp)).toThrow(
        'Signing secret must be a non-empty string'
      );
    });

    it('throws WebhookError when timestamp is invalid', () => {
      expect(() => signPayload(samplePayload, secret, -100)).toThrow(WebhookError);
      expect(() => signPayload(samplePayload, secret, NaN)).toThrow(
        'Timestamp must be a valid positive number'
      );
    });
  });

  describe('verifySignature', () => {
    it('happy path: verifies valid signature correctly', () => {
      const sigHeader = signPayload(samplePayload, secret, timestamp);
      const isValid = verifySignature(samplePayload, sigHeader, secret);

      expect(isValid).toBe(true);
    });

    it('tampered payload: rejects signature if body is altered', () => {
      const sigHeader = signPayload(samplePayload, secret, timestamp);
      const tamperedPayload = JSON.stringify({ jobId: 'job-999', riskScore: 0 });

      const isValid = verifySignature(tamperedPayload, sigHeader, secret);

      expect(isValid).toBe(false);
    });

    it('wrong secret: rejects signature if secret differs', () => {
      const sigHeader = signPayload(samplePayload, secret, timestamp);
      const isValid = verifySignature(samplePayload, sigHeader, 'wrong-secret-key');

      expect(isValid).toBe(false);
    });

    it('stale timestamp: rejects signature if tolerance exceeded', () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 mins ago
      const sigHeader = signPayload(samplePayload, secret, oldTimestamp);

      // 300 second (5 min) tolerance
      const isValid = verifySignature(samplePayload, sigHeader, secret, 300);

      expect(isValid).toBe(false);
    });
  });
});
