import { describe, expect, it } from 'vitest';
import { CATALOG_REFS, matchCatalog, signatureComplete } from './catalogRefs';
import { runSpecies } from './harness';
import { SIG, SIG_LENGTH, SIG_UNKNOWN, SPECIES_MATCH_THRESHOLD, matchSignature, signatureDistance } from './signature';

const REFS = CATALOG_REFS;
const SEEDS = ['O2u', 'OG2g', 'O4d', 'S1s', 'H3s', '3GH2n', 'K4d'];

describe('signatureDistance', () => {
  const a = [0.41, 0.43, 0.51, 8.6, 0.09, 0.17, 0.05, 0.07, 0.17, 0.14, 1, 0.48, 0, 0.002, 0.3];

  it('is 0 for identical signatures, symmetric and grows with differences', () => {
    const b = [...a];
    b[SIG.MASS] += 0.05;
    expect(signatureDistance(a, a)).toBe(0);
    expect(signatureDistance(a, b)).toBeCloseTo(signatureDistance(b, a), 12);
    const c = [...b];
    c[SIG.SPEED] += 0.1;
    expect(signatureDistance(a, c)).toBeGreaterThan(signatureDistance(a, b));
  });

  it('skips unknown (dynamic) features so young creatures compare on shape', () => {
    const young = a.map((v, i) => (i >= SIG.SPEED ? SIG_UNKNOWN : v));
    expect(young.length).toBe(SIG_LENGTH);
    expect(signatureDistance(a, young)).toBe(0);
    expect(matchSignature(young, [a])).toBe(0);
  });

  it('ignores the pulsation frequency of creatures that do not pulse', () => {
    const b = [...a];
    b[SIG.FREQ] = 2.5; // noise: neither pulses
    expect(signatureDistance(a, b)).toBe(0);
    const p1 = [...a];
    const p2 = [...a];
    p1[SIG.PULSE] = p2[SIG.PULSE] = 0.1;
    p2[SIG.FREQ] = 1.5;
    expect(signatureDistance(p1, p2)).toBeGreaterThan(SPECIES_MATCH_THRESHOLD);
  });

  it('matchSignature returns the closest reference within the threshold', () => {
    const near = [...a];
    near[SIG.MASS] += 0.01;
    const far = [...a];
    far[SIG.MASS] += 1;
    expect(matchSignature(a, [far, near])).toBe(1);
    expect(matchSignature(a, [far])).toBe(-1);
    expect(matchSignature(a, [])).toBe(-1);
  });
});

describe('catalogSignatures.json', () => {
  it('has every catalog species with full signatures for the viable ones', () => {
    expect(REFS.length).toBe(26);
    for (const r of REFS) {
      expect(r.signature.length).toBe(SIG_LENGTH);
      if (r.viable) {
        expect(signatureComplete(r.signature)).toBe(true);
        expect(r.behavior).not.toBeNull();
        expect(r.complexity).toBeGreaterThan(0);
      }
    }
    expect(REFS.find((r) => r.code === 'O2u')!.complexity).toBeCloseTo(1, 0);
  });

  it('the seven seed species are viable and mutually distinct', () => {
    const seeds = SEEDS.map((c) => REFS.find((r) => r.code === c)!);
    for (const s of seeds) expect(s.viable).toBe(true);
    for (let i = 0; i < seeds.length; i++) {
      for (let j = i + 1; j < seeds.length; j++) {
        expect(signatureDistance(seeds[i].signature, seeds[j].signature)).toBeGreaterThan(2 * SPECIES_MATCH_THRESHOLD);
      }
    }
  });

  it('a freshly grown, rotated Orbium is recognized as Orbium unicaudatus', () => {
    const young = runSpecies('O2u', { size: 64, steps: 500, x: 20, y: 41, rotation: 1.1 }).last.creatures[0];
    expect(young.state).toBe('stable');
    expect(signatureComplete(young.signature)).toBe(false);
    expect(matchCatalog(young.signature)?.code).toBe('O2u'); // on shape alone
    const c = runSpecies('O2u', { size: 64, steps: 1300, x: 20, y: 41, rotation: 1.1 }).last.creatures[0];
    expect(signatureComplete(c.signature)).toBe(true);
    expect(matchCatalog(c.signature)?.name).toBe('Orbium unicaudatus');
  });
});
