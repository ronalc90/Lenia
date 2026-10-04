/**
 * Hidden species: calibration windows where a secret catalog species may appear.
 *
 * Every hidden species is a real Chan catalog species that genuinely lives in its window
 * (pillar 1: nothing is scripted). The windows were measured with the CPU reference
 * (src/sim/cpu.ts, 64×64, catalog pattern, 1200 steps, mass ratio 0.8–1.25 = alive):
 *  - Orbium unicaudatus ignis (O2ui): alive at μ 0.112–0.12 / σ 0.0112–0.0128; dies at
 *    μ 0.104, explodes at μ ≤ 0.106 with σ 0.0128.
 *  - Orbium phantasma (O2p, T = 40): alive at dt 0.025 and 0.05; DIES at dt ≥ 0.06 (so on our
 *    dt slider, 0.05–0.5, it only lives at the very bottom). μ 0.128–0.135, σ 0.0088–0.0098.
 *  - Pyroscutium ambiguus (PS3am): alive at μ 0.344–0.354 / σ 0.058–0.063, the same corner as
 *    Helicium solidus (H3s), whose own spores EXPLODE there (mass ×4.2). It is the cryptid:
 *    the integrator only offers its spores at night or under a full moon.
 *
 * How the integrator uses this (seeding, see docs/SECRETS.md §Integración):
 *   const forced = pickSecretSpore(calib, new Date(), rng);
 *   const entry = forced ? catalogByCode(forced)! : nearestCatalog(calib, secretSporePool(CATALOG, calib, new Date()));
 * and Microscopio III hints skip `isSecretSpeciesCode(code)` species.
 */
import type { LeniaParams } from '../core/types';
import { NIGHT_HOURS } from './data';
import { isFullMoon } from './moon';
import type { SecretId } from './types';

export interface SecretRegime {
  secretId: Extract<SecretId, 'ignis' | 'phantasma' | 'cryptid'>;
  /** Chan catalog code. */
  code: string;
  /** Latin name as in catalog.json. */
  name: string;
  mu: readonly [number, number];
  sigma: readonly [number, number];
  R: readonly [number, number];
  /** Kernel ring peaks required (compared with 1e-3 tolerance). */
  rings: readonly number[];
  dt: readonly [number, number];
  /** Extra condition on the clock / sky. */
  when: 'always' | 'nightOrFullMoon';
  /** Probability that a spore inside the window is this species (the rest: normal spores). */
  chance: number;
  /** Suggested SeedSpec.bias for these spores (a touch more template than usual: they are fragile). */
  bias: number;
}

export const SECRET_REGIMES: readonly SecretRegime[] = [
  {
    secretId: 'ignis',
    code: 'O2ui',
    name: 'Orbium unicaudatus ignis',
    mu: [0.107, 0.118],
    sigma: [0.0112, 0.0128],
    R: [12, 14],
    rings: [1],
    dt: [0.05, 0.15],
    when: 'always',
    chance: 1,
    bias: 0.85,
  },
  {
    secretId: 'phantasma',
    code: 'O2p',
    name: 'Orbium phantasma',
    mu: [0.127, 0.136],
    sigma: [0.0087, 0.01],
    R: [12, 14],
    rings: [1],
    dt: [0.01, 0.055],
    when: 'always',
    chance: 1,
    bias: 0.9,
  },
  {
    secretId: 'cryptid',
    code: 'PS3am',
    name: 'Pyroscutium ambiguus',
    mu: [0.344, 0.355],
    sigma: [0.058, 0.063],
    R: [12, 14],
    rings: [1],
    dt: [0.05, 0.15],
    when: 'nightOrFullMoon',
    chance: 0.5,
    bias: 0.85,
  },
];

/** Alias with the name used in the brief. */
export const secretRegimes = SECRET_REGIMES;

const SECRET_CODES = new Set(SECRET_REGIMES.map((r) => r.code));

export function isSecretSpeciesCode(code: string): boolean {
  return SECRET_CODES.has(code);
}

/** Local time between NIGHT_HOURS[0] and NIGHT_HOURS[1] (00:00–03:59). */
export function isNightHour(date: Date): boolean {
  const h = date.getHours();
  return h >= NIGHT_HOURS[0] && h < NIGHT_HOURS[1];
}

/** The cryptid is about: night hours or a full moon. */
export function cryptidAwake(date: Date): boolean {
  return isNightHour(date) || isFullMoon(date);
}

const inRange = (v: number, r: readonly [number, number]) => v >= r[0] - 1e-9 && v <= r[1] + 1e-9;

function ringsMatch(a: readonly number[] | undefined, b: readonly number[]): boolean {
  if (!a) return b.length === 1 && Math.abs(b[0] - 1) < 1e-3;
  return a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-3);
}

export type RegimeParams = Pick<LeniaParams, 'mu' | 'sigma' | 'R' | 'dt'> & { rings?: readonly number[] };

/** Window test ignoring the clock (pure geometry of the calibration). */
export function inSecretWindow(p: RegimeParams, r: SecretRegime): boolean {
  return inRange(p.mu, r.mu) && inRange(p.sigma, r.sigma) && inRange(p.R, r.R) && inRange(p.dt, r.dt) && ringsMatch(p.rings, r.rings);
}

/**
 * The secret regime the calibration is inside of, honouring its clock condition, or null.
 * `now` defaults to the current date (only the cryptid looks at it).
 */
export function matchSecretRegime(p: RegimeParams, now: Date = new Date()): SecretRegime | null {
  for (const r of SECRET_REGIMES) {
    if (!inSecretWindow(p, r)) continue;
    if (r.when === 'nightOrFullMoon' && !cryptidAwake(now)) continue;
    return r;
  }
  return null;
}

/**
 * Catalog entries a normal spore may be built from: every entry except the hidden species,
 * unless the calibration is inside that species' (awake) window.
 */
export function secretSporePool<T extends { code: string }>(entries: readonly T[], p: RegimeParams, now: Date = new Date()): T[] {
  const open = matchSecretRegime(p, now);
  return entries.filter((e) => !SECRET_CODES.has(e.code) || (open !== null && open.code === e.code));
}

/** Code of a hidden species to force for this spore, or null (roll with the regime's chance). */
export function pickSecretSpore(p: RegimeParams, now: Date, rng: () => number): string | null {
  const r = matchSecretRegime(p, now);
  if (!r) return null;
  return rng() < r.chance ? r.code : null;
}
