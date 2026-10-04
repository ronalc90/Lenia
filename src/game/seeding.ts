/**
 * Seed templates ("spores"), pattern resampling/mutation and portrait (de)quantization.
 * Patterns handed to the simulation are already scaled to the current kernel radius R,
 * so the dish can stamp them 1 cell = 1 cell.
 */
import type { LeniaParams, Pattern } from '../core/types';
import { CATALOG_REFS } from '../detect/catalogRefs';
import { catalogGroup } from '../species/identity';
import { CATALOG, catalogPattern, type CatalogEntry } from '../sim/catalog';
import * as B from './balance';
import { base64ToBytes, bytesToBase64, type PortraitData } from './state';

export function ringsEqual(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-3);
}

/** Normalised distance in (μ, σ) space used to rank catalog candidates. */
export function paramDistance(mu1: number, s1: number, mu2: number, s2: number): number {
  return Math.hypot((mu1 - mu2) / B.PARAM_MU_SCALE, (s1 - s2) / B.PARAM_SIGMA_SCALE);
}

/**
 * Species that do not survive in our simulation (the detector's calibration marks them: OG2r
 * explodes, SN+ grows until it wraps the dish). Using them as spores floods the dish.
 */
const NON_VIABLE = new Set(CATALOG_REFS.filter((r) => !r.viable).map((r) => r.code));

/** Catalog entries that are safe to use as spore templates. */
export const SPORE_CATALOG: readonly CatalogEntry[] = CATALOG.filter((e) => !NON_VIABLE.has(e.code));

/** Entries with the calibration's ring profile (falls back to the same ring count, then to everything). */
function ringPool(rings: readonly number[], entries: readonly CatalogEntry[]): readonly CatalogEntry[] {
  let pool: readonly CatalogEntry[] = entries.filter((e) => ringsEqual(e.b, rings));
  if (!pool.length) pool = entries.filter((e) => e.b.length === rings.length);
  if (!pool.length) pool = entries;
  return pool;
}

/**
 * Catalog species whose (μ, σ) is nearest to the calibration, among those with the same ring
 * profile (falls back to the same ring count, then to everything).
 */
export function nearestCatalog(p: Pick<LeniaParams, 'mu' | 'sigma' | 'rings'>, entries: readonly CatalogEntry[] = SPORE_CATALOG): CatalogEntry {
  const pool = ringPool(p.rings, entries);
  let best = pool[0];
  let bestD = Infinity;
  for (const e of pool) {
    const d = paramDistance(p.mu, p.sigma, e.m, e.s);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

export interface SporeCandidate {
  entry: CatalogEntry;
  /** Normalised (μ, σ) distance to the calibration. */
  dist: number;
  /** Probability of being picked (the candidates' weights sum to 1). */
  weight: number;
}

/**
 * Spore templates for the current calibration: the nearest viable catalog species with the same
 * ring profile always, plus up to SPORE_K − 1 more that are themselves within SPORE_MAX_PARAM_DIST of
 * the calibration (so they can live here), each weighted by a softmax of its (μ, σ) distance
 * (SPORE_TEMPERATURE). Seeds then grow into the
 * different real forms that live around the calibration (Orbium, Synorbium, Gyrorbium…) instead of
 * noisy copies of one template. The bias/noise mechanics (Gotero, Estabilizador) are unchanged.
 */
export function sporeCandidates(
  p: Pick<LeniaParams, 'mu' | 'sigma' | 'rings'>,
  entries: readonly CatalogEntry[] = SPORE_CATALOG,
): SporeCandidate[] {
  const ranked = ringPool(p.rings, entries)
    .map((entry) => ({ entry, dist: paramDistance(p.mu, p.sigma, entry.m, entry.s), weight: 0 }))
    .sort((a, b) => a.dist - b.dist || a.entry.code.localeCompare(b.entry.code));
  if (!ranked.length) return [];
  const d0 = ranked[0].dist;
  const out = ranked.filter((c, i) => i === 0 || c.dist <= B.SPORE_MAX_PARAM_DIST).slice(0, B.SPORE_K);
  let sum = 0;
  for (const c of out) sum += c.weight = Math.exp(-(c.dist - d0) / B.SPORE_TEMPERATURE);
  for (const c of out) c.weight /= sum;
  return out;
}

/**
 * Draw a spore template among `sporeCandidates` with the given uniform [0,1) source. Forms the
 * player has not discovered yet (`known` = catalog group codes in the bestiary) weigh
 * SPORE_NOVELTY times more, so the second species is a different body (at the start regime:
 * Synorbium ignis after Orbium) instead of another Orbium.
 */
export function pickSporeTemplate(
  p: Pick<LeniaParams, 'mu' | 'sigma' | 'rings'>,
  rng: () => number,
  known: ReadonlySet<string> = new Set(),
): CatalogEntry {
  const cands = sporeCandidates(p);
  if (!cands.length) return nearestCatalog(p);
  const w = cands.map((c) => c.weight * (known.has(catalogGroup(c.entry.code)) ? 1 : B.SPORE_NOVELTY));
  let u = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cands.length; i++) {
    u -= w[i];
    if (u < 0) return cands[i].entry;
  }
  return cands[cands.length - 1].entry;
}

/** Bilinear resample by independent x/y scales. */
export function resamplePattern(p: Pattern, sx: number, sy = sx): Pattern {
  if (Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return p;
  const w = Math.max(1, Math.round(p.w * sx));
  const h = Math.max(1, Math.round(p.h * sy));
  const data = new Float32Array(w * h);
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= p.w || y >= p.h ? 0 : p.data[y * p.w + x];
  for (let j = 0; j < h; j++) {
    const fy = (j + 0.5) / sy - 0.5;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    for (let i = 0; i < w; i++) {
      const fx = (i + 0.5) / sx - 0.5;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const v =
        at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty) + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty;
      data[j * w + i] = v;
    }
  }
  return { w, h, data };
}

const turnCache = new WeakMap<Pattern, Pattern[]>();

/**
 * The template turned by `k` quarter turns (clockwise on screen), cell for cell: an exact copy, where a
 * free angle resamples (blurs) it. Cached per template.
 */
export function rotateQuarter(p: Pattern, k: number): Pattern {
  const q = ((Math.round(k) % 4) + 4) % 4;
  if (q === 0) return p;
  let turns = turnCache.get(p);
  if (!turns) turnCache.set(p, (turns = []));
  const hit = turns[q];
  if (hit) return hit;
  const w = q === 2 ? p.w : p.h;
  const h = q === 2 ? p.h : p.w;
  const data = new Float32Array(w * h);
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const v = p.data[y * p.w + x];
      // (x, y) → q=1: (h−1−y, x) · q=2: (w−1−x, h−1−y) · q=3: (y, w−1−x)
      const nx = q === 1 ? p.h - 1 - y : q === 2 ? p.w - 1 - x : y;
      const ny = q === 1 ? x : q === 2 ? p.h - 1 - y : p.w - 1 - x;
      data[ny * w + nx] = v;
    }
  const out: Pattern = { w, h, data };
  turns[q] = out;
  return out;
}

const templateCache = new Map<string, Pattern>();

/** Catalog pattern of `code` scaled from its native R to `R`. Cached. */
export function scaledTemplate(e: CatalogEntry, R: number): Pattern {
  const key = `${e.code}@${R.toFixed(2)}`;
  let p = templateCache.get(key);
  if (!p) {
    p = resamplePattern(catalogPattern(e.code), R / e.R);
    templateCache.set(key, p);
  }
  return p;
}

/** Small random anisotropic rescale for the Mutaciones node. */
export function mutatePattern(p: Pattern, rng: () => number): Pattern {
  const sx = 1 + (rng() * 2 - 1) * B.MUTATION_SCALE;
  const sy = 1 + (rng() * 2 - 1) * B.MUTATION_SCALE;
  const out = resamplePattern(p, sx, sy);
  return out === p ? { w: p.w, h: p.h, data: new Float32Array(p.data) } : out;
}

/** Centre-crop to at most `max`×`max`. */
export function cropPattern(p: Pattern, max: number): Pattern {
  if (p.w <= max && p.h <= max) return p;
  const w = Math.min(p.w, max);
  const h = Math.min(p.h, max);
  const ox = Math.floor((p.w - w) / 2);
  const oy = Math.floor((p.h - h) / 2);
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = p.data[(y + oy) * p.w + x + ox];
  return { w, h, data };
}

export function quantizePattern(p: Pattern): PortraitData {
  const bytes = new Uint8Array(p.w * p.h);
  for (let i = 0; i < bytes.length; i++) {
    const v = p.data[i];
    bytes[i] = Number.isFinite(v) ? Math.round(Math.min(1, Math.max(0, v)) * 255) : 0;
  }
  return { w: p.w, h: p.h, d: bytesToBase64(bytes) };
}

export function dequantizePattern(q: PortraitData): Pattern | null {
  try {
    const bytes = base64ToBytes(q.d);
    if (bytes.length !== q.w * q.h) return null;
    const data = new Float32Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) data[i] = bytes[i] / 255;
    return { w: q.w, h: q.h, data };
  } catch {
    return null;
  }
}
