import { describe, expect, it } from 'vitest';
import { CpuLenia } from '../sim/cpu';
import { CATALOG, catalogByCode, catalogPattern, paramsOf } from '../sim/catalog';
import {
  cryptidAwake,
  isSecretSpeciesCode,
  matchSecretRegime,
  pickSecretSpore,
  SECRET_REGIMES,
  secretSporePool,
  type RegimeParams,
} from './regimes';
import { seededRng } from './testUtil';

const DAY = new Date('2026-06-20T15:00:00'); // afternoon, moon not full (first quarter ~21 Jun)
const NIGHT = new Date('2026-06-20T02:30:00');
const FULL_MOON_DAY = new Date('2025-03-14T12:00:00Z');

const p = (mu: number, sigma: number, dt = 0.1, R = 13, rings = [1]): RegimeParams => ({ mu, sigma, dt, R, rings });

/** Same ranking as game/seeding nearestCatalog (μ/0.03, σ/0.006), restricted to one-ring species. */
function nearest(params: RegimeParams, pool: typeof CATALOG) {
  return [...pool]
    .filter((e) => e.b.length === 1)
    .sort((a, b) => Math.hypot((params.mu - a.m) / 0.03, (params.sigma - a.s) / 0.006) - Math.hypot((params.mu - b.m) / 0.03, (params.sigma - b.s) / 0.006))[0];
}

describe('secret regimes', () => {
  it('every hidden species exists in the catalog and its catalog params sit inside its window', () => {
    for (const r of SECRET_REGIMES) {
      const e = catalogByCode(r.code)!;
      expect(e.name).toBe(r.name);
      const at = { ...paramsOf(e), dt: Math.min(Math.max(paramsOf(e).dt, 0.05), r.dt[1]) };
      expect(matchSecretRegime(at, NIGHT)?.code, r.code).toBe(r.code);
    }
  });

  it('Orbium ignis lives at μ≈0.11/σ≈0.012 and nowhere else', () => {
    expect(matchSecretRegime(p(0.11, 0.012), DAY)?.secretId).toBe('ignis');
    expect(matchSecretRegime(p(0.15, 0.015), DAY)).toBeNull();
    expect(matchSecretRegime(p(0.11, 0.015), DAY)).toBeNull();
    expect(matchSecretRegime(p(0.11, 0.012, 0.1, 13, [1, 0.5]), DAY)).toBeNull();
  });

  it('Orbium phantasma only at the slowest time step', () => {
    expect(matchSecretRegime(p(0.13, 0.009, 0.05), DAY)?.secretId).toBe('phantasma');
    expect(matchSecretRegime(p(0.13, 0.009, 0.1), DAY)).toBeNull();
  });

  it('the cryptid needs night hours or a full moon', () => {
    expect(cryptidAwake(DAY)).toBe(false);
    expect(cryptidAwake(NIGHT)).toBe(true);
    expect(cryptidAwake(FULL_MOON_DAY)).toBe(true);
    expect(matchSecretRegime(p(0.349, 0.0605), DAY)).toBeNull();
    expect(matchSecretRegime(p(0.349, 0.0605), NIGHT)?.secretId).toBe('cryptid');
    expect(matchSecretRegime(p(0.349, 0.0605), FULL_MOON_DAY)?.secretId).toBe('cryptid');
  });

  it('spore pool hides secret species outside their windows, and offers them inside', () => {
    for (const [mu, s] of [
      [0.1, 0.012],
      [0.12, 0.0105],
      [0.13, 0.009],
      [0.349, 0.0605],
      [0.36, 0.06],
    ]) {
      const pool = secretSporePool(CATALOG, p(mu, s), DAY);
      expect(pool.some((e) => isSecretSpeciesCode(e.code)), `${mu},${s}`).toBe(false);
    }
    expect(nearest(p(0.11, 0.012), secretSporePool(CATALOG, p(0.11, 0.012), DAY)).code).toBe('O2ui');
    expect(nearest(p(0.13, 0.009, 0.05), secretSporePool(CATALOG, p(0.13, 0.009, 0.05), DAY)).code).toBe('O2p');
    // At the Helicium corner by day: Helicium, never the cryptid.
    expect(nearest(p(0.349, 0.0605), secretSporePool(CATALOG, p(0.349, 0.0605), DAY)).code).not.toBe('PS3am');
  });

  it('pickSecretSpore honours the chance (the cryptid shares its corner with Helicium)', () => {
    let n = 0;
    const rng = seededRng(77);
    for (let k = 0; k < 200; k++) if (pickSecretSpore(p(0.349, 0.0605), NIGHT, rng) === 'PS3am') n++;
    expect(n).toBeGreaterThan(60);
    expect(n).toBeLessThan(140);
    expect(pickSecretSpore(p(0.349, 0.0605), DAY, () => 0)).toBeNull();
    expect(pickSecretSpore(p(0.11, 0.012), DAY, () => 0.99)).toBe('O2ui');
  });
});

/** Mass ratio of a catalog creature after `steps` (CPU reference, 64×64). */
function survival(code: string, over: Partial<{ mu: number; sigma: number; dt: number }>, steps: number): number {
  const e = catalogByCode(code)!;
  const sim = new CpuLenia(64, 64, { ...paramsOf(e), ...over });
  sim.placeCentered(catalogPattern(code), 32, 32);
  sim.step(50);
  const m0 = sim.mass();
  sim.step(steps);
  return sim.mass() / m0;
}

describe('hidden species are real (CPU reference)', () => {
  it('Orbium phantasma survives at dt 0.05 and dissolves at dt 0.1', () => {
    const slow = survival('O2p', { dt: 0.05 }, 600);
    const fast = survival('O2p', { dt: 0.1 }, 600);
    expect(slow).toBeGreaterThan(0.8);
    expect(slow).toBeLessThan(1.25);
    expect(fast).toBeLessThan(0.2);
  });

  it('Pyroscutium ambiguus lives at the Helicium corner, where Helicium spores blow up', () => {
    const cryptid = survival('PS3am', {}, 400);
    expect(cryptid).toBeGreaterThan(0.8);
    expect(cryptid).toBeLessThan(1.25);
    expect(survival('H3s', { mu: 0.349, sigma: 0.0605 }, 400)).toBeGreaterThan(1.5);
  });
});
