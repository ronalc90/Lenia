/**
 * Unistroke gesture recognizer for shapes drawn on the dish with the brush or the eraser.
 *
 * In the spirit of Wobbrock et al.'s $1 recognizer, with three changes that make it
 * robust for finger drawing on a phone:
 *  - uniform scaling by RMS radius (keeps aspect ratio, so a line never looks like a circle);
 *  - closed-form optimal rotation (2D Procrustes, as in Protractor), clamped to a
 *    per-template range (a heart must stay roughly upright; a circle may rotate freely);
 *  - closed shapes are matched against every start point (cyclic shifts) and both drawing
 *    directions, open shapes against both directions; mirrored drawings are allowed where
 *    the shape is chiral-agnostic (glider, spiral, lemniscate).
 * Cheap shape checks (closure, signed turning) reject near misses such as arcs and scribbles.
 * Pure, allocation-light, no DOM.
 */
import type { TimedPt } from './types';

export type GestureName = 'circle' | 'spiral' | 'heart' | 'glider' | 'infinity';

export const GESTURE_NAMES: readonly GestureName[] = ['circle', 'spiral', 'heart', 'glider', 'infinity'];

/** Shapes matched against templates (the spiral is recognised structurally). */
export type TemplateName = Exclude<GestureName, 'spiral'>;
const TEMPLATE_NAMES: readonly TemplateName[] = ['circle', 'heart', 'glider', 'infinity'];

export interface GestureMatch {
  name: GestureName;
  /** 0..1, 1 = perfect. */
  score: number;
  /** Mean distance to the template in RMS-radius units (lower is better). */
  distance: number;
  /** Centroid of the drawn path (input units). */
  cx: number;
  cy: number;
  /** RMS radius of the drawn path (input units). */
  radius: number;
}

export interface RecognizeOptions {
  /** Minimum bounding-box diagonal, input units (default 14: grid cells). */
  minSize?: number;
  /** Scale every acceptance distance (default 1; < 1 is stricter). */
  strictness?: number;
}

/** Points per resampled path. */
export const N_POINTS = 64;
/**
 * Accept a template match when the mean distance (RMS-radius units) is below this.
 * Tuned on synthetic hand-drawn strokes vs random scribbles (gestures.test.ts): heavy-noise
 * positives stay below these, random scribbles stay above.
 */
export const ACCEPT_DISTANCE: Record<TemplateName, number> = { circle: 0.21, heart: 0.23, infinity: 0.17, glider: 0.16 };
/** Spiral: minimum correlation between path progress and distance from the centre. */
export const SPIRAL_MIN_CORR = 0.75;
/** The best shape must beat the runner-up by this margin, in units of their acceptance thresholds. */
export const MARGIN = 0.12;

interface P {
  x: number;
  y: number;
}

interface Template {
  name: TemplateName;
  pts: P[];
  closed: boolean;
  /** Max |rotation| (radians) applied to the drawing to fit the template. */
  maxRot: number;
  mirror: boolean;
}

// ───────────────────────────── geometry helpers ─────────────────────────────

export function pathLength(p: readonly P[]): number {
  let d = 0;
  for (let i = 1; i < p.length; i++) d += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return d;
}

/** Resample a polyline into `n` points evenly spaced along its length. */
export function resample(points: readonly P[], n = N_POINTS): P[] {
  const out: P[] = [];
  if (points.length === 0) return out;
  const total = pathLength(points);
  if (total <= 0) {
    for (let i = 0; i < n; i++) out.push({ x: points[0].x, y: points[0].y });
    return out;
  }
  const step = total / (n - 1);
  out.push({ x: points[0].x, y: points[0].y });
  let acc = 0;
  let prev = { x: points[0].x, y: points[0].y };
  let i = 1;
  while (i < points.length && out.length < n) {
    const cur = points[i];
    const d = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    if (d > 0 && acc + d >= step) {
      const t = (step - acc) / d;
      const q = { x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) };
      out.push(q);
      prev = q;
      acc = 0;
    } else {
      acc += d;
      prev = { x: cur.x, y: cur.y };
      i++;
    }
  }
  const last = points[points.length - 1];
  while (out.length < n) out.push({ x: last.x, y: last.y });
  return out;
}

function centroid(p: readonly P[]): P {
  let x = 0;
  let y = 0;
  for (const q of p) {
    x += q.x;
    y += q.y;
  }
  return { x: x / p.length, y: y / p.length };
}

function rmsRadius(p: readonly P[], c: P): number {
  let s = 0;
  for (const q of p) s += (q.x - c.x) ** 2 + (q.y - c.y) ** 2;
  return Math.sqrt(s / p.length);
}

/** Centroid to the origin, RMS radius 1. */
function normalize(p: readonly P[]): P[] {
  const c = centroid(p);
  const r = rmsRadius(p, c) || 1;
  return p.map((q) => ({ x: (q.x - c.x) / r, y: (q.y - c.y) / r }));
}

/** Sum of signed turning angles along the path (radians; +2π for one clockwise loop in y-down coords). */
export function signedTurning(p: readonly P[]): number {
  let sum = 0;
  for (let i = 2; i < p.length; i++) {
    const ax = p[i - 1].x - p[i - 2].x;
    const ay = p[i - 1].y - p[i - 2].y;
    const bx = p[i].x - p[i - 1].x;
    const by = p[i].y - p[i - 1].y;
    if ((ax === 0 && ay === 0) || (bx === 0 && by === 0)) continue;
    sum += Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
  }
  return sum;
}

function bboxDiag(p: readonly P[]): number {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const q of p) {
    if (q.x < x0) x0 = q.x;
    if (q.y < y0) y0 = q.y;
    if (q.x > x1) x1 = q.x;
    if (q.y > y1) y1 = q.y;
  }
  return Math.hypot(x1 - x0, y1 - y0);
}

/**
 * Mean distance between `c` (rotated by the optimal angle within ±maxRot) and `t`,
 * reading `c` starting at `shift` and optionally backwards.
 */
function alignedDistance(c: readonly P[], t: readonly P[], maxRot: number, shift: number, reverse: boolean): number {
  const n = t.length;
  let sxx = 0;
  let sxy = 0;
  const at = (i: number): P => {
    const k = reverse ? n - 1 - i : i;
    return c[(k + shift) % n];
  };
  for (let i = 0; i < n; i++) {
    const a = at(i);
    const b = t[i];
    sxx += a.x * b.x + a.y * b.y;
    sxy += a.x * b.y - a.y * b.x;
  }
  let th = Math.atan2(sxy, sxx);
  if (th > maxRot) th = maxRot;
  if (th < -maxRot) th = -maxRot;
  const cs = Math.cos(th);
  const sn = Math.sin(th);
  let d = 0;
  for (let i = 0; i < n; i++) {
    const a = at(i);
    const b = t[i];
    d += Math.hypot(a.x * cs - a.y * sn - b.x, a.x * sn + a.y * cs - b.y);
  }
  return d / n;
}

// ───────────────────────────── templates ─────────────────────────────

function sampleCurve(f: (u: number) => P, steps = 480): P[] {
  const out: P[] = [];
  for (let i = 0; i <= steps; i++) out.push(f(i / steps));
  return out;
}

function makeTemplate(name: TemplateName, raw: P[], closed: boolean, maxRot: number, mirror: boolean): Template {
  return { name, pts: normalize(resample(raw, N_POINTS)), closed, maxRot, mirror };
}

const TAU = Math.PI * 2;

function buildTemplates(): Template[] {
  const T: Template[] = [];
  T.push(makeTemplate('circle', sampleCurve((u) => ({ x: Math.cos(u * TAU), y: Math.sin(u * TAU) })), true, Math.PI, false));
  // Classic heart curve, y down (point at the bottom). Upright within ±35°.
  T.push(
    makeTemplate(
      'heart',
      sampleCurve((u) => {
        const t = u * TAU;
        return {
          x: 16 * Math.sin(t) ** 3,
          y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
        };
      }),
      true,
      0.62,
      true,
    ),
  );
  // Lemniscate of Bernoulli (∞); any orientation (an upright "8" counts too).
  T.push(
    makeTemplate(
      'infinity',
      sampleCurve((u) => {
        const t = u * TAU;
        const d = 1 + Math.sin(t) ** 2;
        return { x: Math.cos(t) / d, y: (Math.sin(t) * Math.cos(t)) / d };
      }),
      true,
      Math.PI,
      true,
    ),
  );
  // Conway's glider traced through its five live cells: .O. / ..O / OOO.
  // Any rotation + mirror covers the four travel directions.
  T.push(
    makeTemplate(
      'glider',
      [
        { x: 1, y: 0 },
        { x: 2, y: 1 },
        { x: 2, y: 2 },
        { x: 1, y: 2 },
        { x: 0, y: 2 },
      ],
      false,
      Math.PI,
      true,
    ),
  );
  return T;
}

const TEMPLATES: Template[] = buildTemplates();

/** Normalised template points (for drawing glyphs and debugging). */
export function templatePoints(name: TemplateName): { x: number; y: number }[] {
  const t = TEMPLATES.find((x) => x.name === name);
  return t ? t.pts.map((p) => ({ x: p.x, y: p.y })) : [];
}

// ───────────────────────────── matching ─────────────────────────────

const SHIFT_STRIDE = 4;

function templateDistance(cand: readonly P[], mirrored: readonly P[], t: Template): number {
  const n = cand.length;
  let best = Infinity;
  const variants = t.mirror ? [cand, mirrored] : [cand];
  for (const c of variants) {
    for (const rev of [false, true]) {
      if (!t.closed) {
        best = Math.min(best, alignedDistance(c, t.pts, t.maxRot, 0, rev));
        continue;
      }
      // Coarse search over start points, then refine around the best one.
      let bestShift = 0;
      let bestD = Infinity;
      for (let s = 0; s < n; s += SHIFT_STRIDE) {
        const d = alignedDistance(c, t.pts, t.maxRot, s, rev);
        if (d < bestD) {
          bestD = d;
          bestShift = s;
        }
      }
      for (let k = -SHIFT_STRIDE + 1; k < SHIFT_STRIDE; k++) {
        if (k === 0) continue;
        const s = (bestShift + k + n) % n;
        bestD = Math.min(bestD, alignedDistance(c, t.pts, t.maxRot, s, rev));
      }
      best = Math.min(best, bestD);
    }
  }
  return best;
}

/**
 * Feature path for turning-based checks: 40 evenly spaced points, lightly smoothed, so that
 * finger jitter does not add spurious turning (templates use the full 64-point resample).
 */
function featurePath(points: readonly P[]): P[] {
  let p = resample(points, 40);
  for (let pass = 0; pass < 2; pass++) {
    const q = p.map((v) => ({ x: v.x, y: v.y }));
    for (let i = 1; i < p.length - 1; i++) {
      q[i].x = (p[i - 1].x + 2 * p[i].x + p[i + 1].x) / 4;
      q[i].y = (p[i - 1].y + 2 * p[i].y + p[i + 1].y) / 4;
    }
    p = q;
  }
  return p;
}

/** Sum of |turning angles| along the path (radians). */
function absoluteTurning(p: readonly P[]): number {
  let sum = 0;
  for (let i = 2; i < p.length; i++) {
    const ax = p[i - 1].x - p[i - 2].x;
    const ay = p[i - 1].y - p[i - 2].y;
    const bx = p[i].x - p[i - 1].x;
    const by = p[i].y - p[i - 1].y;
    if ((ax === 0 && ay === 0) || (bx === 0 && by === 0)) continue;
    sum += Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
  }
  return sum;
}

/**
 * Corners of the path: peaks of turning summed over a window of `w` segments, at least
 * `minTurn` radians, separated by `w` points. Returns the signed turn of each corner in order.
 */
function corners(p: readonly P[], minTurn = 0.45, w = 4): number[] {
  const turns: number[] = [];
  for (let i = 2; i < p.length; i++) {
    const ax = p[i - 1].x - p[i - 2].x;
    const ay = p[i - 1].y - p[i - 2].y;
    const bx = p[i].x - p[i - 1].x;
    const by = p[i].y - p[i - 1].y;
    turns.push((ax === 0 && ay === 0) || (bx === 0 && by === 0) ? 0 : Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
  }
  const win: number[] = [];
  for (let i = 0; i + w <= turns.length; i++) {
    let s = 0;
    for (let k = 0; k < w; k++) s += turns[i + k];
    win.push(s);
  }
  const used = new Array<boolean>(win.length).fill(false);
  const found: { i: number; v: number }[] = [];
  for (;;) {
    let bi = -1;
    for (let i = 0; i < win.length; i++) if (!used[i] && (bi < 0 || Math.abs(win[i]) > Math.abs(win[bi]))) bi = i;
    if (bi < 0 || Math.abs(win[bi]) < minTurn) break;
    found.push({ i: bi, v: win[bi] });
    for (let k = Math.max(0, bi - w); k <= Math.min(win.length - 1, bi + w); k++) used[k] = true;
  }
  return found.sort((a, b) => a.i - b.i).map((c) => c.v);
}

/** Per-shape plausibility checks on the smoothed feature path. */
function shapeOk(name: TemplateName, r: readonly P[], diag: number): boolean {
  const gap = Math.hypot(r[0].x - r[r.length - 1].x, r[0].y - r[r.length - 1].y);
  const turn = Math.abs(signedTurning(r));
  switch (name) {
    case 'circle':
      return gap <= 0.3 * diag && turn >= 1.5 * Math.PI && turn <= 2.9 * Math.PI;
    case 'heart':
      return gap <= 0.3 * diag;
    case 'infinity':
      return gap <= 0.35 * diag && turn <= 1.2 * Math.PI;
    case 'glider': {
      // The glider path turns ~45° then ~90° the same way (135° in all): two corners of
      // clearly different sharpness. (An "L" has one corner; a "U" has two equal ones.)
      if (turn < 0.45 * Math.PI || turn > 1.05 * Math.PI) return false;
      const sign = Math.sign(signedTurning(r));
      const cs = corners(r, 0.35)
        .filter((c) => Math.sign(c) === sign)
        .map(Math.abs)
        .sort((a, b) => b - a);
      return cs.length >= 2 && cs[0] >= 1.0 && cs[1] <= 0.8 * cs[0];
    }
  }
}

/**
 * Spiral, recognised structurally: winds ≥ 1.1 turns in one consistent sense, is open, and its
 * distance from the centre grows steadily along the path. Returns the progress/radius
 * correlation (0..1) or 0 when it is not a spiral.
 */
export function spiralScore(points: readonly TimedPt[]): number {
  if (points.length < 8) return 0;
  const r = featurePath(points);
  const diag = bboxDiag(r);
  if (diag <= 0) return 0;
  const turn = Math.abs(signedTurning(r));
  if (turn < 2.2 * Math.PI) return 0;
  if (turn / Math.max(1e-9, absoluteTurning(r)) < 0.75) return 0;
  const gap = Math.hypot(r[0].x - r[r.length - 1].x, r[0].y - r[r.length - 1].y);
  if (gap < 0.2 * diag) return 0;
  const c = centroid(r);
  const inward = Math.hypot(r[0].x - c.x, r[0].y - c.y) > Math.hypot(r[r.length - 1].x - c.x, r[r.length - 1].y - c.y);
  const n = r.length;
  // Pearson correlation of path index (from the inner end) with distance from the centroid.
  let si = 0;
  let sd = 0;
  let sii = 0;
  let sdd = 0;
  let sid = 0;
  for (let k = 0; k < n; k++) {
    const q = r[inward ? n - 1 - k : k];
    const d = Math.hypot(q.x - c.x, q.y - c.y);
    si += k;
    sd += d;
    sii += k * k;
    sdd += d * d;
    sid += k * d;
  }
  const cov = sid / n - (si / n) * (sd / n);
  const vi = sii / n - (si / n) ** 2;
  const vd = sdd / n - (sd / n) ** 2;
  if (vd <= 0) return 0;
  return Math.max(0, cov / Math.sqrt(vi * vd));
}

/** Distance of the stroke to each template shape (diagnostics / tests). */
export function gestureDistances(points: readonly TimedPt[]): Record<TemplateName, number> {
  const r = resample(points, N_POINTS);
  const c = normalize(r);
  const m = c.map((q) => ({ x: -q.x, y: q.y }));
  const out = {} as Record<TemplateName, number>;
  for (const g of TEMPLATE_NAMES) out[g] = Infinity;
  for (const t of TEMPLATES) out[t.name] = Math.min(out[t.name], templateDistance(c, m, t));
  return out;
}

/**
 * Recognize a single stroke. Returns the best shape, or null when the stroke is too small,
 * too far from every template, ambiguous, or fails the shape checks.
 */
export function recognize(points: readonly TimedPt[], opts: RecognizeOptions = {}): GestureMatch | null {
  if (points.length < 8) return null;
  const minSize = opts.minSize ?? 14;
  const k = opts.strictness ?? 1;
  const diag = bboxDiag(points);
  if (diag < minSize) return null;
  const r = resample(points, N_POINTS);
  const c = centroid(r);
  const radius = rmsRadius(r, c);
  const sp = spiralScore(points);
  if (sp >= SPIRAL_MIN_CORR + (1 - SPIRAL_MIN_CORR) * (1 - k)) {
    return { name: 'spiral', score: sp, distance: 1 - sp, cx: c.x, cy: c.y, radius };
  }
  const dists = gestureDistances(points);
  // Rank by distance relative to each shape's own acceptance threshold.
  const ranked = TEMPLATE_NAMES.map((g) => ({ g, d: dists[g], q: dists[g] / (ACCEPT_DISTANCE[g] * k) })).sort((a, b) => a.q - b.q);
  const best = ranked[0];
  if (best.q > 1) return null;
  if (ranked[1].q - best.q < MARGIN) return null;
  if (!shapeOk(best.g, featurePath(points), diag)) return null;
  return { name: best.g, score: Math.max(0, 1 - best.d), distance: best.d, cx: c.x, cy: c.y, radius };
}

// ───────────────────────────── straight strokes (swipe "keys") ─────────────────────────────

export type SwipeDir = 'up' | 'down' | 'left' | 'right';

/**
 * Direction of a straight stroke (y grows down), or null when the stroke is short or curvy.
 * Used for the touch version of the Konami code (↑↑↓↓←→←→ as eight swipes).
 */
export function swipeDirection(points: readonly TimedPt[], minLen = 10): SwipeDir | null {
  if (points.length < 2) return null;
  const a = points[0];
  const b = points[points.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const chord = Math.hypot(dx, dy);
  if (chord < minLen) return null;
  if (chord / Math.max(chord, pathLength(points)) < 0.85) return null;
  // Within ±30° of an axis.
  if (Math.abs(dx) > Math.abs(dy)) {
    if (Math.abs(dy) > Math.abs(dx) * 0.58) return null;
    return dx > 0 ? 'right' : 'left';
  }
  if (Math.abs(dx) > Math.abs(dy) * 0.58) return null;
  return dy > 0 ? 'down' : 'up';
}

/**
 * Undo toroidal jumps in a grid path (a stroke that leaves one edge re-enters the other):
 * consecutive points further apart than half the dish are shifted by one dish size.
 */
export function unwrapPath(points: readonly TimedPt[], gridW: number, gridH: number): TimedPt[] {
  if (!points.length) return [];
  const out: TimedPt[] = [{ ...points[0] }];
  let ox = 0;
  let oy = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const q = points[i - 1];
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    if (dx > gridW / 2) ox -= gridW;
    else if (dx < -gridW / 2) ox += gridW;
    if (dy > gridH / 2) oy -= gridH;
    else if (dy < -gridH / 2) oy += gridH;
    out.push({ x: p.x + ox, y: p.y + oy, t: p.t });
  }
  return out;
}

/** Point-in-polygon (even-odd), used to test whether a drawn loop encloses a creature. */
export function pointInPolygon(x: number, y: number, poly: readonly { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}
