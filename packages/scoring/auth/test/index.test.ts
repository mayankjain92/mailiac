import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { verifyAuth, calculateAuthScore } from '../src/index.js';

const fixturesDir = path.join(__dirname, 'fixtures');

function loadFixture(filename: string): Buffer {
  return fs.readFileSync(path.join(fixturesDir, filename));
}

describe('verifyAuth', () => {
  it('happy path: fully authenticated email returns authScore 0', async () => {
    const rawEml = loadFixture('happy-path.eml');
    const result = await verifyAuth(rawEml);

    expect(result.spf).toBe('pass');
    expect(result.dkim).toBe('pass');
    expect(['strict', 'relaxed']).toContain(result.dmarcAlignment);
    expect(result.arcPass).toBe(false);
    expect(result.authScore).toBe(0);
  });

  it('malicious phish: unauthenticated email returns high authScore 100', async () => {
    const rawEml = loadFixture('malicious-phish.eml');
    const result = await verifyAuth(rawEml);

    expect(result.spf).toBe('fail');
    expect(result.dkim).toBe('fail');
    expect(result.dmarcAlignment).toBe('fail');
    expect(result.arcPass).toBe(false);
    expect(result.authScore).toBe(100);
  });

  it('arc forwarded: email with valid ARC seal overrides penalties to authScore 0', async () => {
    const rawEml = loadFixture('arc-forwarded.eml');
    const result = await verifyAuth(rawEml);

    expect(result.spf).toBe('fail');
    expect(result.dkim).toBe('fail');
    expect(result.arcPass).toBe(true);
    expect(result.authScore).toBe(0);
  });

  it('malformed input: empty or null buffer handles gracefully without crashing', async () => {
    const emptyBuffer = Buffer.from('');
    const result = await verifyAuth(emptyBuffer);

    expect(result.spf).toBe('none');
    expect(result.dkim).toBe('none');
    expect(result.dmarcAlignment).toBe('fail');
    expect(result.arcPass).toBe(false);
    expect(result.authScore).toBe(60);
  });
});

describe('calculateAuthScore', () => {
  it('returns 0 if arcPass is true regardless of SPF/DKIM failures', () => {
    const score = calculateAuthScore({
      spf: 'fail',
      dkim: 'fail',
      dmarcAlignment: 'fail',
      arcPass: true,
    });
    expect(score).toBe(0);
  });

  it('calculates score correctly for mixed results', () => {
    const score = calculateAuthScore({
      spf: 'neutral', // +20
      dkim: 'pass',   // +0
      dmarcAlignment: 'relaxed', // +10
      arcPass: false,
    });
    expect(score).toBe(30);
  });

  it('caps max authScore at 100', () => {
    const score = calculateAuthScore({
      spf: 'fail', // +40
      dkim: 'fail', // +40
      dmarcAlignment: 'fail', // +20
      arcPass: false,
    });
    expect(score).toBe(100);
  });
});
