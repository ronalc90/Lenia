/**
 * Round petri dish geometry (ADR-025). The simulation grid stays a fixed square in memory; the
 * living area is the disc of radius `radius` around (cx, cy). Cell i covers [i, i+1), so a cell
 * belongs to the dish when its centre (i + 0.5, j + 0.5) is inside the disc. There is no wrap:
 * every distance is plain Euclidean. The Placa upgrade grows `radius` (the matter is kept: growth
 * only moves the rim, nothing is resampled).
 *
 * Pure functions, no DOM, no GL: shared by the simulation, the detector, the game, the camera and
 * the overlay.
 */

export interface DishShape {
  /** Centre in grid cells. */
  cx: number;
  cy: number;
  /** Radius in grid cells (the glass rim). */
  radius: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Cells kept between the largest dish and the grid edge. The GPU step reads the state texture
 * with clamp-to-edge, so the outermost texels (up to 4 cells packed per texel) must always be
 * outside the dish (always zero): then reads past the grid edge are exactly zero padding.
 */
export const DISH_GRID_MARGIN = 4;

/** A dish of `diameter` cells centred on a gridW×gridH grid, capped to fit inside the margin. */
export function dishForGrid(gridW: number, gridH: number, diameter: number): DishShape {
  const maxD = Math.min(gridW, gridH) - 2 * DISH_GRID_MARGIN;
  return { cx: gridW / 2, cy: gridH / 2, radius: Math.max(1, Math.min(diameter, maxD) / 2) };
}

/** Euclidean distance between two grid points (the dish does not wrap). */
export function dishDist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Distance from (x, y) to the rim: > 0 inside, 0 on the glass, < 0 outside. */
export function rimDistance(d: DishShape, x: number, y: number): number {
  return d.radius - Math.hypot(x - d.cx, y - d.cy);
}

/** True when (x, y) is inside the dish and at least `margin` cells away from the rim. */
export function insideDish(d: DishShape, x: number, y: number, margin = 0): boolean {
  return rimDistance(d, x, y) >= margin;
}

/** True when grid cell (i, j) (centre i + 0.5, j + 0.5) is part of the dish. */
export function cellInDish(d: DishShape, i: number, j: number): boolean {
  const dx = i + 0.5 - d.cx;
  const dy = j + 0.5 - d.cy;
  return dx * dx + dy * dy < d.radius * d.radius;
}

/**
 * Nearest point to (x, y) that is inside the dish with `margin` cells of clearance from the rim.
 * Points already inside are returned unchanged. A margin larger than the radius collapses to the
 * centre.
 */
export function clampToDish(d: DishShape, x: number, y: number, margin = 0): Point {
  const lim = Math.max(0, d.radius - margin);
  const dx = x - d.cx;
  const dy = y - d.cy;
  const r = Math.hypot(dx, dy);
  if (r <= lim) return { x, y };
  if (r === 0) return { x: d.cx, y: d.cy };
  const k = lim / r;
  return { x: d.cx + dx * k, y: d.cy + dy * k };
}

/**
 * Uniformly distributed random point (by area) inside the dish, at least `margin` cells from the
 * rim. `rng` returns numbers in [0, 1) (pass a seeded RNG for determinism).
 */
export function randomPointInDish(d: DishShape, rng: () => number, margin = 0): Point {
  const lim = Math.max(0, d.radius - margin);
  const r = lim * Math.sqrt(rng());
  const a = rng() * Math.PI * 2;
  return { x: d.cx + r * Math.cos(a), y: d.cy + r * Math.sin(a) };
}

/** Area of the dish in cells² (continuous disc). */
export function dishArea(d: DishShape): number {
  return Math.PI * d.radius * d.radius;
}

/** Exact number of grid cells whose centre lies inside the dish (the denominator of "fill"). */
export function dishCellCount(d: DishShape, gridW: number, gridH: number): number {
  let n = 0;
  const y0 = Math.max(0, Math.floor(d.cy - d.radius - 1));
  const y1 = Math.min(gridH - 1, Math.ceil(d.cy + d.radius + 1));
  const x0 = Math.max(0, Math.floor(d.cx - d.radius - 1));
  const x1 = Math.min(gridW - 1, Math.ceil(d.cx + d.radius + 1));
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) if (cellInDish(d, i, j)) n++;
  return n;
}

/**
 * Mask of a coarse grid (e.g. a scale-2 detector snapshot): 1 where the block's centre is inside
 * the dish. Block (bx, by) covers cells [bx·scale, bx·scale + scale).
 */
export function dishMask(d: DishShape, w: number, h: number, scale = 1): Uint8Array {
  const m = new Uint8Array(w * h);
  const r2 = d.radius * d.radius;
  for (let by = 0; by < h; by++) {
    const dy = (by + 0.5) * scale - d.cy;
    for (let bx = 0; bx < w; bx++) {
      const dx = (bx + 0.5) * scale - d.cx;
      if (dx * dx + dy * dy < r2) m[by * w + bx] = 1;
    }
  }
  return m;
}

/**
 * Move a point by (vx, vy)·dt inside the dish, bouncing specularly off the rim (kept `margin`
 * cells inside). Used by things that drift over the dish (golden spark, particles).
 */
export function moveInDish(
  d: DishShape,
  p: { x: number; y: number; vx: number; vy: number },
  dt: number,
  margin = 0,
): { x: number; y: number; vx: number; vy: number } {
  let x = p.x + p.vx * dt;
  let y = p.y + p.vy * dt;
  let vx = p.vx;
  let vy = p.vy;
  const lim = Math.max(0, d.radius - margin);
  const dx = x - d.cx;
  const dy = y - d.cy;
  const r = Math.hypot(dx, dy);
  if (r > lim && r > 0) {
    const nx = dx / r;
    const ny = dy / r;
    const vn = vx * nx + vy * ny;
    if (vn > 0) {
      vx -= 2 * vn * nx;
      vy -= 2 * vn * ny;
    }
    x = d.cx + nx * lim;
    y = d.cy + ny * lim;
  }
  return { x, y, vx, vy };
}

/** Linear interpolation between two dish shapes (rim growth animation), t in [0, 1]. */
export function lerpDish(a: DishShape, b: DishShape, t: number): DishShape {
  const k = Math.min(1, Math.max(0, t));
  return {
    cx: a.cx + (b.cx - a.cx) * k,
    cy: a.cy + (b.cy - a.cy) * k,
    radius: a.radius + (b.radius - a.radius) * k,
  };
}

/** Smooth ease-out (cubic) used by the rim growth and the camera that follows it. */
export function easeOutCubic(t: number): number {
  const k = 1 - Math.min(1, Math.max(0, t));
  return 1 - k * k * k;
}

/** Same shape (within 1e-6 cells)? */
export function sameDish(a: DishShape, b: DishShape): boolean {
  return Math.abs(a.cx - b.cx) < 1e-6 && Math.abs(a.cy - b.cy) < 1e-6 && Math.abs(a.radius - b.radius) < 1e-6;
}

// ───────────────────────────── Sizes and growth ─────────────────────────────

/**
 * Rim diameters (cells) of the growing dish, smallest first (docs/DISH.md §6). Which index the
 * player has reached is game logic; the largest one a device can run is `maxDiameter`
 * (sim/perf.ts QUALITY_DISH). Starts at Ø128, not Ø96: fitted to a phone, a Ø96 Orbium filled a big share
 * of the screen (owner, v0.014: "es muy grande"); ADR-025 amendment.
 */
export const DISH_DIAMETERS: readonly number[] = [128, 160, 192, 224];

/** Seconds the rim takes to grow to a new size (the camera follows a little slower). */
export const DISH_GROW_SECONDS = 1.5;
/** The camera's ease-out lasts this much longer than the rim's, so the glass visibly expands first. */
export const DISH_CAMERA_LAG = 1.25;

/** Diameter for a size index, clamped to the ladder and to the device cap. */
export function dishDiameterFor(index: number, maxDiameter = Infinity): number {
  const i = Math.max(0, Math.min(DISH_DIAMETERS.length - 1, Math.floor(index)));
  let d = DISH_DIAMETERS[i];
  if (d > maxDiameter) {
    // Largest ladder size that fits the device (at least the smallest one).
    d = DISH_DIAMETERS[0];
    for (const x of DISH_DIAMETERS) if (x <= maxDiameter) d = x;
  }
  return d;
}

function easeInOutCubic(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

/**
 * Rim growth animation shared by the simulation (mask radius), the camera (fit radius) and the
 * renderer (growth glow). Call `update(dt)` once per frame and read `rim`, `fit`, `glow`.
 */
export class DishAnimator {
  /** Rim the simulation uses right now (matter is never outside it). */
  rim: DishShape;
  /** Radius the camera fits at zoom 1 right now (lags the rim while growing). */
  fit: number;
  /** 0..1 growth glow for the renderer (0 when idle). */
  glow = 0;
  private from: DishShape;
  private to: DishShape;
  private fitFrom: number;
  private t = 1;
  private duration = DISH_GROW_SECONDS;

  constructor(initial: DishShape) {
    this.rim = { ...initial };
    this.from = { ...initial };
    this.to = { ...initial };
    this.fit = initial.radius;
    this.fitFrom = initial.radius;
  }

  /** Target shape; `animate` = false jumps there at once (loading a save, a new era). */
  setTarget(target: DishShape, animate = true, seconds = DISH_GROW_SECONDS): void {
    if (sameDish(target, this.to) && (animate || this.done)) return;
    this.from = { ...this.rim };
    this.fitFrom = this.fit;
    this.to = { ...target };
    this.duration = Math.max(1e-3, seconds);
    this.t = animate ? 0 : DISH_CAMERA_LAG;
    if (!animate) this.apply(DISH_CAMERA_LAG);
  }

  get target(): DishShape {
    return this.to;
  }

  /** True when no growth is in progress. */
  get done(): boolean {
    return this.t >= DISH_CAMERA_LAG;
  }

  /** Advance the animation; returns true while the rim or the camera fit changed. */
  update(dt: number): boolean {
    if (this.done) {
      this.glow = 0;
      return false;
    }
    this.t = Math.min(DISH_CAMERA_LAG, this.t + dt / this.duration);
    this.apply(this.t);
    return true;
  }

  private apply(t: number): void {
    this.rim = lerpDish(this.from, this.to, easeOutCubic(t));
    const ft = easeInOutCubic(t / DISH_CAMERA_LAG);
    this.fit = this.fitFrom + (this.to.radius - this.fitFrom) * ft;
    const growing = this.to.radius > this.from.radius;
    this.glow = growing && t < 1 ? Math.sin(Math.PI * Math.min(1, t)) : 0;
    if (t >= DISH_CAMERA_LAG) {
      this.rim = { ...this.to };
      this.fit = this.to.radius;
      this.glow = 0;
    }
  }
}
