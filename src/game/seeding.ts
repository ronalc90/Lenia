/**
 * Seed templates ("spores"), pattern resampling/mutation and portrait (de)quantization.
 * Patterns handed to the simulation are already scaled to the current kernel radius R,
 * so the dish can stamp them 1 cell = 1 cell.
 */
import type { LeniaParams, Pattern } from '../core/types';
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
 * Catalog species whose (μ, σ) is nearest to the calibration, among those with the same ring
 * profile (falls back to the same ring count, then to everything).
 */
export function nearestCatalog(p: Pick<LeniaParams, 'mu' | 'sigma' | 'rings'>, entries: readonly CatalogEntry[] = CATALOG): CatalogEntry {
  let pool = entries.filter((e) => ringsEqual(e.b, p.rings));
  if (!pool.length) pool = entries.filter((e) => e.b.length === p.rings.length);
  if (!pool.length) pool = [...entries];
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
