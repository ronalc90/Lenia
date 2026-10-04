/**
 * Species portraits as data (no DOM): pick the best capture of a creature and normalise it so every
 * bestiary card shows the creature's own shape, centred, upright and filling the frame.
 *
 *  - `isolateCreature`: keep only the creature under the crop centre (neighbours and debris that
 *    happened to be inside the capture square are removed) and report how clean the capture was.
 *  - `portraitScore`: how good a capture is (clean, not cut by the crop, representative).
 *  - `normalizePortrait`: centre on the centroid, rotate the principal axis horizontal (polarity
 *    fixed by the head/tail harmonic), crop tightly. Used for display only — prints keep the
 *    unrotated isolated capture (`isolateCreature(p).pattern`) so they stay pixel exact.
 *  - `catalogPortrait`: the catalog pattern itself (crisp and iconic) for revealed species.
 */
import type { Pattern } from '../core/types';
import { catalogPattern } from '../sim/catalog';

/** Body threshold of the detector (a cell belongs to a creature). */
const BODY = 0.1;
/** Faint halo that still binds body parts into one creature (detector linkThreshold). */
const LINK = 0.02;
/**
 * Display portraits fade out matter below this ramp: the faint halo / wake around a creature
 * (0.02–0.1) is drawn as a wide purple glow and the bestiary frames everything above 0.04, so
 * every species looked like the same round blob (species audit, "after" sheet). Bodies are ≥ 0.1.
 */
const CRISP_LO = 0.05;
const CRISP_HI = 0.13;

export interface CaptureStats {
  /** Matter of the kept creature (pattern cells). */
  mass: number;
  /** Kept matter / all matter in the capture (1 = nothing else around). */
  share: number;
  /** The kept creature reaches the edge of the capture: the crop cut it. */
  clipped: boolean;
  /** Separate pieces (≥ LINK-connected components with a body cell) in the capture. */
  pieces: number;
  /** Centroid of the kept creature in pattern pixels (pixel i centred at i + 0.5). */
  cx: number;
  cy: number;
}

/**
 * Keep the creature nearest the crop centre (8-connected through matter ≥ LINK, needs a body cell
 * ≥ BODY); everything else is zeroed. Allocation per call is fine: it runs a few times per species.
 */
export function isolateCreature(p: Pattern): { pattern: Pattern; stats: CaptureStats } {
  const { w, h, data } = p;
  const N = w * h;
  const lab = new Int32Array(N).fill(-1);
  const queue = new Int32Array(N);
  const comps: { mass: number; sx: number; sy: number; body: boolean; edge: boolean; cells: number[] }[] = [];
  let total = 0;
  for (let i = 0; i < N; i++) {
    const v = data[i];
    if (v >= LINK) total += v;
    if (lab[i] !== -1 || !(v >= LINK)) continue;
    const c = comps.length;
    const comp = { mass: 0, sx: 0, sy: 0, body: false, edge: false, cells: [] as number[] };
    comps.push(comp);
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    lab[i] = c;
    while (head < tail) {
      const k = queue[head++];
      const x = k % w;
      const y = (k - x) / w;
      const m = data[k];
      comp.cells.push(k);
      comp.mass += m;
      comp.sx += m * (x + 0.5);
      comp.sy += m * (y + 0.5);
      if (m >= BODY) comp.body = true;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) comp.edge = true;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (lab[q] !== -1 || !(data[q] >= LINK)) continue;
          lab[q] = c;
          queue[tail++] = q;
        }
      }
    }
  }
  const real = comps.filter((c) => c.body && c.mass > 0);
  const out = new Float32Array(N);
  if (!real.length) {
    return { pattern: { w, h, data: out }, stats: { mass: 0, share: 0, clipped: false, pieces: 0, cx: w / 2, cy: h / 2 } };
  }
  // The capture is centred on the creature: prefer heavy pieces near the centre.
  const sigma = 0.3 * Math.max(w, h);
  let best = real[0];
  let bestScore = -Infinity;
  for (const c of real) {
    const dx = c.sx / c.mass - w / 2;
    const dy = c.sy / c.mass - h / 2;
    const score = Math.log(c.mass) - (dx * dx + dy * dy) / (2 * sigma * sigma);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  for (const k of best.cells) out[k] = data[k];
  return {
    pattern: { w, h, data: out },
    stats: {
      mass: best.mass,
      share: total > 0 ? best.mass / total : 0,
      clipped: best.edge,
      pieces: real.length,
      cx: best.sx / best.mass,
      cy: best.sy / best.mass,
    },
  };
}

/**
 * Quality of a capture, higher is better. A clean capture (nothing else in the square, creature
 * not cut by the crop) of a creature whose signature is close to its species' signature
 * (`sigDistance`, signature units; unknown = 1) is the most representative portrait.
 */
export function portraitScore(p: Pattern, sigDistance?: number): number {
  const { stats } = isolateCreature(p);
  if (!(stats.mass > 0)) return -Infinity;
  const d = sigDistance !== undefined && Number.isFinite(sigDistance) ? Math.min(3, Math.max(0, sigDistance)) : 1;
  return 2 * stats.share - (stats.clipped ? 3 : 0) - 0.15 * Math.max(0, stats.pieces - 1) - 0.8 * d;
}

/** Bilinear sample, pixel i centred at i + 0.5, outside = 0. */
function sample(p: Pattern, x: number, y: number): number {
  const sx = x - 0.5;
  const sy = y - 0.5;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;
  const at = (i: number, j: number): number => (i < 0 || j < 0 || i >= p.w || j >= p.h ? 0 : p.data[j * p.w + i]);
  const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
  const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
  return a + (b - a) * fy;
}

/**
 * Orientation that makes portraits of one species look alike whatever way the creature was heading:
 * the principal (long) axis horizontal and the heavier/head side to the right. Falls back to the
 * head/tail harmonic for near-isotropic bodies, and to no rotation for round ones. Radians.
 */
export function canonicalAngle(p: Pattern, cx: number, cy: number): number {
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let m = 0;
  let h1r = 0;
  let h1i = 0;
  let s2 = 0;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const v = p.data[y * p.w + x];
      if (!(v > 0)) continue;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      sxx += v * dx * dx;
      syy += v * dy * dy;
      sxy += v * dx * dy;
      m += v;
      // r² · e^{iφ} = (dx + i dy) · r: the first angular harmonic (head/tail polarity).
      const r = Math.hypot(dx, dy);
      h1r += v * dx * r;
      h1i += v * dy * r;
      s2 += v * r * r;
    }
  }
  if (!(m > 0)) return 0;
  const a = sxx / m;
  const b = syy / m;
  const c = sxy / m;
  const diff = Math.hypot(a - b, 2 * c);
  const aniso = diff / Math.max(1e-9, a + b); // 0 round … 1 a line
  const h1 = s2 > 0 ? Math.hypot(h1r, h1i) / s2 : 0;
  if (aniso >= 0.08) {
    let theta = 0.5 * Math.atan2(2 * c, a - b); // long axis
    // Polarity: point the axis towards the head/tail harmonic so mirror captures agree.
    if (h1r * Math.cos(theta) + h1i * Math.sin(theta) < 0) theta += Math.PI;
    return theta;
  }
  if (h1 >= 0.04) return Math.atan2(h1i, h1r);
  return 0;
}

/**
 * Display portrait of a capture: the isolated creature, centred on its centroid, rotated to its
 * canonical angle and cropped tightly (1-pixel margin) into a square. Returns null when the capture
 * holds no creature.
 */
export function normalizePortrait(p: Pattern, opts: { align?: boolean } = {}): Pattern | null {
  const { pattern: iso, stats } = isolateCreature(p);
  if (!(stats.mass > 0)) return null;
  const angle = opts.align === false ? 0 : canonicalAngle(iso, stats.cx, stats.cy);
  let r = 0;
  for (let y = 0; y < iso.h; y++) {
    for (let x = 0; x < iso.w; x++) {
      if (!(iso.data[y * iso.w + x] > LINK)) continue;
      r = Math.max(r, Math.hypot(x + 0.5 - stats.cx, y + 0.5 - stats.cy));
    }
  }
  const half = Math.ceil(r) + 1;
  const side = 2 * half;
  const data = new Float32Array(side * side);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      // Output pixel offset from the centre, rotated back into the capture.
      const ox = i + 0.5 - half;
      const oy = j + 0.5 - half;
      const x = stats.cx + cos * ox - sin * oy;
      const y = stats.cy + sin * ox + cos * oy;
      data[j * side + i] = sample(iso, x, y);
    }
  }
  return tightSquare(crispen({ w: side, h: side, data }), 1);
}

/** Fade out the faint halo so the body's own outline frames the portrait (display only). */
export function crispen(p: Pattern): Pattern {
  const data = new Float32Array(p.data.length);
  for (let i = 0; i < data.length; i++) {
    const v = p.data[i];
    const t = Math.min(1, Math.max(0, (v - CRISP_LO) / (CRISP_HI - CRISP_LO)));
    data[i] = v * t * t * (3 - 2 * t);
  }
  return { w: p.w, h: p.h, data };
}

/** Crop to the bounding box of matter > LINK plus `margin`, padded to a centred square. */
export function tightSquare(p: Pattern, margin = 1): Pattern {
  let x0 = p.w;
  let y0 = p.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (!(p.data[y * p.w + x] > LINK)) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return p;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const side = Math.max(bw, bh) + 2 * margin;
  const ox = x0 - Math.floor((side - bw) / 2);
  const oy = y0 - Math.floor((side - bh) / 2);
  const data = new Float32Array(side * side);
  for (let j = 0; j < side; j++) {
    const y = oy + j;
    if (y < 0 || y >= p.h) continue;
    for (let i = 0; i < side; i++) {
      const x = ox + i;
      if (x < 0 || x >= p.w) continue;
      data[j * side + i] = p.data[y * p.w + x];
    }
  }
  return { w: side, h: side, data };
}

const catalogCache = new Map<string, Pattern>();

/** The catalog pattern of `code`, tightly framed in a square (cached; same object every call). */
export function catalogPortrait(code: string): Pattern | null {
  let p = catalogCache.get(code);
  if (!p) {
    try {
      p = tightSquare(crispen(catalogPattern(code)), 1);
    } catch {
      return null;
    }
    catalogCache.set(code, p);
  }
  return p;
}
