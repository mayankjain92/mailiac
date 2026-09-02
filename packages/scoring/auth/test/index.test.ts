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
    expect(result.authScore).toBe(100);
  });
});

describe('calculateAuthScore', () => {
  it('returns 0 for multi-hop ARC pass (instanceCount > 1 && finalSealCv === pass)', () => {
    const score = calculateAuthScore({
      spf: 'fail',
      dkim: 'fail',
      dmarcAlignment: 'fail',
      instanceCount: 2,
      finalSealCv: 'pass',
    });
    expect(score).toBe(0);
  });

  it('rejects single-hop ARC (instanceCount <= 1) and calculates base AuthScore penalty', () => {
    const score = calculateAuthScore({
      spf: 'none',
      dkim: 'pass',
      dmarcAlignment: 'fail',
      instanceCount: 1,
      finalSealCv: 'none',
    });
    expect(score).toBe(100);
  });

  it('immediately caps authScore at 100 if dkim is fail (tampering threat)', () => {
    const score = calculateAuthScore({
      spf: 'pass',
      dkim: 'fail',
      dmarcAlignment: 'relaxed',
      instanceCount: 1,
      finalSealCv: 'none',
    });
    expect(score).toBe(100);
  });

  it('adds 50 points for spf none/fail and 50 points for dmarcAlignment fail', () => {
    const score1 = calculateAuthScore({
      spf: 'none',
      dkim: 'pass',
      dmarcAlignment: 'relaxed',
      arcPass: false,
    });
    expect(score1).toBe(50);

    const score2 = calculateAuthScore({
      spf: 'pass',
      dkim: 'pass',
      dmarcAlignment: 'fail',
      arcPass: false,
    });
    expect(score2).toBe(50);
  });

  it('caps max authScore at 100 when both spf and dmarcAlignment fail', () => {
    const score = calculateAuthScore({
      spf: 'fail',
      dkim: 'fail',
      dmarcAlignment: 'fail',
      arcPass: false,
    });
    expect(score).toBe(100);
  });
});
