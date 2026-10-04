/**
 * What a creature LOOKS like, measured on a picture of it (a CPU crop, a dish capture or a catalog
 * pattern): size in kernel radii, holes, separate bodies, elongation, head/tail polarity and the
 * points of its outline. Pure and allocation-light (runs a few times per species, never per frame).
 *
 * These numbers back the Bestiary's visual chips ("agujero", "dos cuerpos", "larga", "pequeña") and
 * the comparison arrows (`anchors`): nothing is drawn on a creature that its matter does not show.
 * Calibrated on the world species (scripts/world-check.ts --features, docs/ESPECIES.md §1).
 */
import type { Pattern } from '../core/types';

/** Body threshold of the detector (a cell belongs to a creature). */
export const LOOK_BODY = 0.1;
/**
 * A hole is a dark pocket fully enclosed by matter brighter than this share of the creature's
 * brightest cell. At the detector's 0.1 the faint rim of an Orbium closes pockets nobody sees as
 * holes; at 0.2·max the ring of Circium, the hollows of the Escalera and the Helicium still count,
 * the Orbium's do not (measured on the world species, docs/ESPECIES.md §1).
 */
export const LOOK_HOLE_RIM = 0.2;
/** Background pockets smaller than this (in R²) are pixel gaps, not holes a child would see. */
export const LOOK_MIN_HOLE_R2 = 0.04;
/** Separate pieces smaller than this (in R²) are debris, not a second body. */
export const LOOK_MIN_BODY_R2 = 0.15;

export interface LookAnchors {
  /** Centre of the body (area centroid), normalised 0..1 in the picture. */
  centre: [number, number];
  /** Centre of each hole, normalised. */
  holes: [number, number][];
  /** Centre of each separate body, normalised. */
  bodies: [number, number][];
  /** Farthest point of the outline from the centre (the tip of a tail or of a long body), normalised. */
  tip: [number, number];
}

export interface Look {
  /** Matter ≥ LOOK_BODY, in R² (grid cells / R²). */
  areaR2: number;
  /** Farthest body cell from the area centroid, in R. */
  radiusR: number;
  /** Background pockets fully enclosed by the body (≥ LOOK_MIN_HOLE_R2). */
  holes: number;
  /** Their total area, in R². */
  holeAreaR2: number;
  /** Separate bodies (8-connected, ≥ LOOK_MIN_BODY_R2). */
  bodies: number;
  /** Length / width of the body (√ of the second-moment eigenvalue ratio; 1 = round). */
  elongation: number;
  /** Offset of the matter's weight from the body's centre, in body radii (0 symmetric … 1 one-sided). */
  polarity: number;
  /** Outline bumps: local maxima of the outline radius that stand out ≥ 15 % of its mean. */
  points: number;
  /** Mean matter in the inner 30 % of the radius over the 30–80 % band (> 2.5: a bright centre; < 0.35: hollow). */
  core: number;
  anchors: LookAnchors;
}

/** Measure a picture of one creature. `R` = kernel radius in the picture's cells. */
export function measureLook(p: Pattern, R: number): Look {
  const { w, h, data } = p;
  const N = w * h;
  const R2 = R * R;
  // Area centroid and matter centroid of the body.
  let n = 0;
  let ax = 0;
  let ay = 0;
  let m = 0;
  let mx = 0;
  let my = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = data[y * w + x];
      if (!(v >= LOOK_BODY)) continue;
      n++;
      ax += x + 0.5;
      ay += y + 0.5;
      m += v;
      mx += v * (x + 0.5);
      my += v * (y + 0.5);
    }
  }
  const empty: Look = {
    areaR2: 0,
    radiusR: 0,
    holes: 0,
    holeAreaR2: 0,
    bodies: 0,
    elongation: 1,
    polarity: 0,
    points: 0,
    core: 1,
    anchors: { centre: [0.5, 0.5], holes: [], bodies: [], tip: [0.5, 0.5] },
  };
  if (n === 0) return empty;
  let vmax = 0;
  for (let i = 0; i < N; i++) if (data[i] > vmax) vmax = data[i];
  const rim = Math.max(LOOK_BODY, LOOK_HOLE_RIM * vmax);
  const cx = ax / n;
  const cy = ay / n;
  // Extent, second moments and the outline profile.
  const BINS = 64;
  const prof = new Float64Array(BINS);
  let rmax = 0;
  let tip: [number, number] = [cx, cy];
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!(data[y * w + x] >= LOOK_BODY)) continue;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const r = Math.hypot(dx, dy);
      if (r > rmax) {
        rmax = r;
        tip = [x + 0.5, y + 0.5];
      }
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
      const b = Math.min(BINS - 1, Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * BINS));
      if (r > prof[b]) prof[b] = r;
    }
  }
  let inner = 0;
  let nIn = 0;
  let band = 0;
  let nBand = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / Math.max(1e-9, rmax);
      const v = data[y * w + x];
      if (r < 0.3) {
        inner += v;
        nIn++;
      } else if (r < 0.8) {
        band += v;
        nBand++;
      }
    }
  }
  const core = nIn && nBand && band > 0 ? inner / nIn / (band / nBand) : 1;
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc;
  const l2 = Math.max(1e-9, tr / 2 - disc);
  const elongation = Math.sqrt(l1 / l2);
  const polarity = rmax > 0 ? Math.hypot(mx / m - cx, my / m - cy) / rmax : 0;
  // Outline bumps (circular, smoothed over 5 bins).
  const sm = new Float64Array(BINS);
  let mean = 0;
  for (let i = 0; i < BINS; i++) {
    let s = 0;
    for (let k = -2; k <= 2; k++) s += prof[(i + k + BINS) % BINS];
    sm[i] = s / 5;
    mean += sm[i] / BINS;
  }
  let points = 0;
  for (let i = 0; i < BINS; i++) {
    const v = sm[i];
    if (!(v >= sm[(i + 1) % BINS] && v > sm[(i - 1 + BINS) % BINS])) continue;
    // Prominence: the deepest valley on each side before a higher bump.
    let left = v;
    for (let k = 1; k < BINS; k++) {
      const u = sm[(i - k + BINS) % BINS];
      if (u > v) break;
      left = Math.min(left, u);
    }
    let right = v;
    for (let k = 1; k < BINS; k++) {
      const u = sm[(i + k) % BINS];
      if (u > v) break;
      right = Math.min(right, u);
    }
    if (v - Math.max(left, right) >= 0.15 * mean) points++;
  }
  // Components: bodies (matter ≥ LOOK_BODY, 8-connected) and holes (pockets below the bright rim,
  // 4-connected so a diagonal gap in a rim does not open them, not touching the picture's edge).
  const bodies = components(p, LOOK_BODY, true).filter((c) => c.cells >= LOOK_MIN_BODY_R2 * R2);
  const pockets = components(p, rim, false).filter((c) => !c.edge && c.cells >= LOOK_MIN_HOLE_R2 * R2);
  const holeArea = pockets.reduce((a, c) => a + c.cells, 0);
  return {
    areaR2: n / R2,
    radiusR: rmax / R,
    holes: pockets.length,
    holeAreaR2: holeArea / R2,
    bodies: Math.max(1, bodies.length),
    elongation,
    polarity,
    points,
    core,
    anchors: {
      centre: [cx / w, cy / h],
      holes: pockets.map((c) => [c.x / w, c.y / h]),
      bodies: bodies.map((c) => [c.x / w, c.y / h]),
      tip: [tip[0] / w, tip[1] / h],
    },
  };
}

/** Connected components of cells at/above (`above`) or below `t`: size, centroid, touches the edge. */
function components(p: Pattern, t: number, above: boolean): { cells: number; x: number; y: number; edge: boolean }[] {
  const { w, h, data } = p;
  const N = w * h;
  const seen = new Uint8Array(N);
  const stack = new Int32Array(N);
  const out: { cells: number; x: number; y: number; edge: boolean }[] = [];
  const inSet = (i: number) => (data[i] >= t) === above;
  for (let i = 0; i < N; i++) {
    if (seen[i] || !inSet(i)) continue;
    let top = 0;
    stack[top++] = i;
    seen[i] = 1;
    let cells = 0;
    let sx = 0;
    let sy = 0;
    let edge = false;
    while (top > 0) {
      const k = stack[--top];
      const x = k % w;
      const y = (k - x) / w;
      cells++;
      sx += x + 0.5;
      sy += y + 0.5;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || (!above && dx && dy)) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (seen[q] || !inSet(q)) continue;
          seen[q] = 1;
          stack[top++] = q;
        }
      }
    }
    out.push({ cells, x: sx / cells, y: sy / cells, edge });
  }
  return out;
}

/** Average several looks of the same creature (time samples): numbers averaged, counts by majority. */
export function averageLooks(looks: readonly Look[]): Look {
  if (!looks.length) throw new Error('averageLooks: no looks');
  const avg = (f: (l: Look) => number) => looks.reduce((a, l) => a + f(l), 0) / looks.length;
  const mode = (f: (l: Look) => number) => {
    const c = new Map<number, number>();
    for (const l of looks) c.set(f(l), (c.get(f(l)) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  };
  const last = looks[looks.length - 1];
  return {
    areaR2: avg((l) => l.areaR2),
    radiusR: avg((l) => l.radiusR),
    holes: mode((l) => l.holes),
    holeAreaR2: avg((l) => l.holeAreaR2),
    bodies: mode((l) => l.bodies),
    elongation: avg((l) => l.elongation),
    polarity: avg((l) => l.polarity),
    points: mode((l) => l.points),
    core: avg((l) => l.core),
    anchors: last.anchors,
  };
}
