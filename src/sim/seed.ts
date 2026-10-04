import { cellInDish, type DishShape } from '../core/dish';
import type { Pattern, SeedSpec } from '../core/types';

/**
 * Seed geometry shared by the GPU seed pass (shaders.ts mirrors this file line
 * by line) and the CPU (`applySeedCpu`, used by tests and the balance bot so CPU
 * experiments seed exactly like the game).
 *
 * For a cell centre c and the toroidal offset d = c − (x, y), q = |d| / radius:
 *
 *   shape  blob    s = 1 − smoothstep(0.35, 1, q)
 *          ring    s = exp(−((q − 0.6) / 0.2)²) · (1 − smoothstep(0.85, 1, q))
 *          noise   s = (1 − smoothstep(0.5, 1, q)) · smoothstep(0.25, 0.75, vnoise(d / (0.3 r)))
 *   base   = density · s                                   (random shapes)
 *          = mix(base, T(d), bias)                         (random shapes with a bias template)
 *          = T(d)                                          (shape 'pattern'; density is ignored)
 *   value  = clamp(base · mix(1, 2 n(d), noise), 0, 1)     n = smoothed asymmetric value noise
 *   A      = max(A, value)
 *
 * T(d) samples the template bilinearly after rotating by −rotation and dividing
 * by the pattern scale. The scale is `patternScale` if given; otherwise 1, except
 * that a shape-'pattern' seed whose template half-size max(w, h)/2 exceeds
 * `radius` is shrunk to fit. Bias templates inside random shapes are never
 * rescaled automatically (spores must keep their 1 cell = 1 cell size). With no
 * rotation and scale 1 the template is snapped to whole cells, exactly like
 * CpuLenia.placeCentered (so printed creatures are pixel exact).
 *
 * Round dish (ADR-022): with a dish the offset d is the plain difference (no wrap) and cells
 * outside the glass stay 0 (`SeedOptions.dish`); without one, offsets wrap on the torus.
 */

/** Topology of a CPU seed/erase: a round dish (no wrap, masked) or the torus (default). */
export interface SeedOptions {
  dish?: DishShape | null;
}

/** Optional extension of SeedSpec understood by the simulation. */
export interface SeedSpecExt extends SeedSpec {
  /** Explicit template scale (grid cells per template pixel); overrides fit-to-radius. */
  patternScale?: number;
}

export const SHAPE_ID = { blob: 0, ring: 1, noise: 2, pattern: 3 } as const;

/** Noise lattice spacings relative to the seed radius (octave 1, octave 2). */
export const NOISE_SPACING = [0.4, 0.2] as const;
export const NOISE_WEIGHTS = [0.7, 0.3] as const;

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** 32-bit integer hash → [0, 1). Mirrored in GLSL with uint arithmetic. */
export function hash2(x: number, y: number, s: number): number {
  let h = Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841) ^ Math.imul(s, 0xcb1ab31f);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 8) / 16777216;
}

/** Smooth value noise in [0, 1). */
export function vnoise(px: number, py: number, s: number): number {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s);
  const b = hash2(ix + 1, iy, s);
  const c = hash2(ix, iy + 1, s);
  const d = hash2(ix + 1, iy + 1, s);
  const top = a + (b - a) * ux;
  const bot = c + (d - c) * ux;
  return top + (bot - top) * uy;
}

/** Radius (from the pattern centre) that contains all matter above 0.02. */
export function patternContentRadius(p: Pattern): number {
  let r2 = 0;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (p.data[y * p.w + x] <= 0.02) continue;
      const dx = x + 0.5 - p.w / 2;
      const dy = y + 0.5 - p.h / 2;
      r2 = Math.max(r2, dx * dx + dy * dy);
    }
  }
  return Math.sqrt(r2);
}

/** Everything the seed pass needs, resolved once per seed on the CPU. */
export interface ResolvedSeed {
  cx: number;
  cy: number;
  radius: number;
  density: number;
  noise: number;
  shape: number;
  bias: number;
  rngSeed: number;
  pattern: Pattern | null;
  /** Template centre (snapped when unrotated and unscaled). */
  tx: number;
  ty: number;
  cos: number;
  sin: number;
  scale: number;
  spacing1: number;
  spacing2: number;
  /** Distance from (cx, cy) beyond which the seed is certainly 0 (GPU early out). */
  bound: number;
}

export function resolveSeed(spec: SeedSpecExt, fallbackSeed: number): ResolvedSeed {
  const radius = Math.max(0.5, spec.radius);
  const pattern = spec.pattern && spec.pattern.w > 0 && spec.pattern.h > 0 ? spec.pattern : null;
  const rot = spec.rotation ?? 0;
  let scale = 1;
  if (pattern) {
    if (spec.patternScale && spec.patternScale > 0) scale = spec.patternScale;
    else if (spec.shape === 'pattern') {
      const half = Math.max(pattern.w, pattern.h) / 2;
      if (half > radius) scale = radius / half;
    }
  }
  let tx = spec.x;
  let ty = spec.y;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  if (pattern && scale === 1 && Math.abs(sin) < 1e-6 && cos > 0) {
    tx = Math.round(spec.x - pattern.w / 2) + pattern.w / 2;
    ty = Math.round(spec.y - pattern.h / 2) + pattern.h / 2;
  }
  return {
    cx: spec.x,
    cy: spec.y,
    radius,
    density: spec.density,
    noise: Math.min(1, Math.max(0, spec.noise)),
    shape: SHAPE_ID[spec.shape] ?? 0,
    bias: pattern ? Math.min(1, Math.max(0, spec.bias ?? 0)) : 0,
    rngSeed: (spec.rngSeed ?? fallbackSeed) >>> 0,
    pattern,
    tx,
    ty,
    cos,
    sin,
    scale,
    spacing1: Math.max(1.5, radius * NOISE_SPACING[0]),
    spacing2: Math.max(1, radius * NOISE_SPACING[1]),
    bound: pattern
      ? Math.max(radius, (Math.hypot(pattern.w, pattern.h) / 2) * scale + Math.hypot(tx - spec.x, ty - spec.y) + 2)
      : radius + 1,
  };
}

function wrapDelta(d: number, n: number): number {
  return d - n * Math.floor(d / n + 0.5);
}

function templateAt(p: Pattern, ix: number, iy: number): number {
  if (ix < 0 || iy < 0 || ix >= p.w || iy >= p.h) return 0;
  return p.data[iy * p.w + ix];
}

/** Bilinear template sample; (lx, ly) in template pixels, pixel i centred at i + 0.5. */
export function sampleTemplate(p: Pattern, lx: number, ly: number): number {
  const sx = lx - 0.5;
  const sy = ly - 0.5;
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  const fx = sx - ix;
  const fy = sy - iy;
  const a = templateAt(p, ix, iy);
  const b = templateAt(p, ix + 1, iy);
  const c = templateAt(p, ix, iy + 1);
  const d = templateAt(p, ix + 1, iy + 1);
  const top = a + (b - a) * fx;
  const bot = c + (d - c) * fx;
  return top + (bot - top) * fy;
}

/** Seed value at a cell centre (px, py) for a grid of gridW×gridH (`wrap` = toroidal offsets). */
export function seedValueAt(s: ResolvedSeed, px: number, py: number, gridW: number, gridH: number, wrap = true): number {
  const dx = wrap ? wrapDelta(px - s.cx, gridW) : px - s.cx;
  const dy = wrap ? wrapDelta(py - s.cy, gridH) : py - s.cy;
  const q = Math.hypot(dx, dy) / s.radius;
  let tmpl = 0;
  if (s.pattern) {
    const tdx = wrap ? wrapDelta(px - s.tx, gridW) : px - s.tx;
    const tdy = wrap ? wrapDelta(py - s.ty, gridH) : py - s.ty;
    const lx = (s.cos * tdx + s.sin * tdy) / s.scale + s.pattern.w / 2;
    const ly = (-s.sin * tdx + s.cos * tdy) / s.scale + s.pattern.h / 2;
    tmpl = sampleTemplate(s.pattern, lx, ly);
  }
  let base: number;
  if (s.shape === SHAPE_ID.pattern) {
    base = tmpl;
  } else {
    let sh = 0;
    if (q < 1) {
      if (s.shape === SHAPE_ID.ring) {
        const k = (q - 0.6) / 0.2;
        sh = Math.exp(-k * k) * (1 - smoothstep(0.85, 1, q));
      } else if (s.shape === SHAPE_ID.noise) {
        const sp = s.radius * 0.3;
        const n = vnoise(dx / sp + 17.31, dy / sp - 5.79, (s.rngSeed ^ 0x9e3779b9) >>> 0);
        sh = (1 - smoothstep(0.5, 1, q)) * smoothstep(0.25, 0.75, n);
      } else {
        sh = 1 - smoothstep(0.35, 1, q);
      }
    }
    base = s.density * sh;
    if (s.pattern) base = base + (tmpl - base) * s.bias;
  }
  if (s.noise > 0 && base > 0) {
    const n =
      NOISE_WEIGHTS[0] * vnoise(dx / s.spacing1, dy / s.spacing1, s.rngSeed) +
      NOISE_WEIGHTS[1] * vnoise(dx / s.spacing2 + 31.7, dy / s.spacing2 + 11.3, (s.rngSeed + 1) >>> 0);
    base *= 1 + (2 * n - 1) * s.noise;
  }
  return Math.min(1, Math.max(0, base));
}

/** Apply a seed to a CPU field (max-combine), same result as the GPU `seed()`. */
export function applySeedCpu(
  A: Float32Array,
  w: number,
  h: number,
  spec: SeedSpecExt,
  fallbackSeed = 1,
  opts: SeedOptions = {},
): void {
  const s = resolveSeed(spec, fallbackSeed);
  const dish = opts.dish ?? null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (dish && !cellInDish(dish, x, y)) {
        A[k] = 0;
        continue;
      }
      const v = seedValueAt(s, x + 0.5, y + 0.5, w, h, !dish);
      if (v > A[k]) A[k] = v;
    }
  }
}

/** Soft eraser: factor smoothstep(0.6, 1, q) on the disc. */
export function eraseFactor(q: number): number {
  return smoothstep(0.6, 1, q);
}

export function applyEraseCpu(
  A: Float32Array,
  w: number,
  h: number,
  x: number,
  y: number,
  radius: number,
  opts: SeedOptions = {},
): void {
  const r = Math.max(0.5, radius);
  const wrap = !opts.dish;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const dx = wrap ? wrapDelta(i + 0.5 - x, w) : i + 0.5 - x;
      const dy = wrap ? wrapDelta(j + 0.5 - y, h) : j + 0.5 - y;
      A[j * w + i] *= eraseFactor(Math.hypot(dx, dy) / r);
    }
  }
}
