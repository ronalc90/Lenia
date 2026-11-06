/**
 * Where «¡Toca aquí!» points (QA-CLARIDAD-2 C3): from session 2 the hint sat at the dish's centre, on top of the
 * Nevera's creature (planted near the centre), so following it gave «¡Cuidado! Se van a tocar» and its text
 * covered the «Naciendo…» label. The hint goes to the free agar farthest from every body (now and a little
 * ahead on its way) and from the glass. Pure: grid cells in, grid cells out; no allocation beyond the result.
 *
 * ADR-031 (docs/MECANICAS.md §3.1): the same rule places the Sembrar button's seed, and `snapSowSpot` moves a
 * seed dragged onto a bad spot to the nearest safe one (the preview; the game's `sow` has the last word).
 */
import { SEED_GAP, SEED_RADIUS, SEED_RIM_MARGIN } from '../game/balance';

/** Room a seed keeps from a body's outline, in R: its own body and the game's gap (balance SEED_RADIUS + SEED_GAP). */
export const SOW_KEEP_R = SEED_RADIUS + SEED_GAP;
/** …and from the glass, in R: its body and the rim margin (balance SEED_RADIUS + SEED_RIM_MARGIN). */
export const SOW_RIM_R = SEED_RADIUS + SEED_RIM_MARGIN;
/** Snap search: rings this many R apart, this many directions each (as the game's clearSpotNear). */
const SNAP_STEP_R = 0.25;
const SNAP_DIRS = 16;

export interface SowBody {
  x: number;
  y: number;
  /** Outline radius, cells. */
  r: number;
  /** Cells per simulation step (CreatureView.vx/vy). */
  vx?: number;
  vy?: number;
}

/** Rings of candidate spots (fractions of the usable radius) and spots per ring. */
const RINGS = [0.33, 0.66, 1] as const;
const PER_RING = 12;
/** Kernel radii a suggested spot keeps from the glass: a seed's body (~1 R) and the half R the game keeps. */
const GLASS_KEEP_R = 1.6;

/**
 * The safest spot to sow: among the candidates (the centre, then three rings) that keep a seed well inside the
 * glass, the one farthest from the nearest body's outline, now and `aheadSteps` steps on its way (ties: farther
 * from the glass). An empty dish: the centre.
 */
export function safeSowSpot(
  dish: { cx: number; cy: number; radius: number },
  bodies: readonly SowBody[],
  R: number,
  aheadSteps = 45,
  /** Spots the hint must not use (under the objective bar and the notices at the top of the dish). */
  keepOut?: (x: number, y: number) => boolean,
): { x: number; y: number } {
  const best = { x: dish.cx, y: dish.cy };
  if (!bodies.length) return best;
  // A seed's body, the half kernel the game keeps from the glass («muy pegada al cristal») and a margin.
  const usable = Math.max(0, dish.radius - GLASS_KEEP_R * R);
  const clearance = (x: number, y: number): number => sowClearance(bodies, x, y, aheadSteps);
  let bestC = clearance(best.x, best.y);
  let bestRim = dish.radius;
  for (const f of RINGS) {
    for (let k = 0; k < PER_RING; k++) {
      // The middle ring turned half a step, so the spots do not line up.
      const a = ((k + (f === RINGS[1] ? 0.5 : 0)) / PER_RING) * Math.PI * 2 - Math.PI / 2;
      const x = dish.cx + Math.cos(a) * usable * f;
      const y = dish.cy + Math.sin(a) * usable * f;
      if (keepOut?.(x, y)) continue;
      const c = clearance(x, y);
      const rim = dish.radius - usable * f;
      if (c > bestC + 1e-6 || (Math.abs(c - bestC) <= 1e-6 && rim > bestRim)) {
        bestC = c;
        bestRim = rim;
        best.x = x;
        best.y = y;
      }
    }
  }
  return best;
}

/**
 * Free agar between (x, y) and the nearest body's outline, now and `aheadSteps` steps on its way (its path's
 * end and middle), in cells. Infinity on an empty dish.
 */
export function sowClearance(bodies: readonly SowBody[], x: number, y: number, aheadSteps: number): number {
  let c = Infinity;
  for (const b of bodies) {
    c = Math.min(c, Math.hypot(x - b.x, y - b.y) - b.r);
    const ax = b.x + (b.vx ?? 0) * aheadSteps;
    const ay = b.y + (b.vy ?? 0) * aheadSteps;
    if (ax !== b.x || ay !== b.y) c = Math.min(c, Math.hypot(x - ax, y - ay) - b.r, Math.hypot(x - (b.x + ax) / 2, y - (b.y + ay) / 2) - b.r);
  }
  return c;
}

/**
 * A seed dragged from the Sembrar button and let go at `at` (ADR-031, MECANICAS §3.1 «Arrastrar»): there, if it
 * keeps SOW_KEEP_R·R from every body (and its path) and SOW_RIM_R·R from the glass; else the nearest spot that
 * does (rings of SNAP_STEP_R·R, SNAP_DIRS directions, the clearest of the first ring that has one); else the
 * safest spot of the dish. Never refused: a seed always lands somewhere. `snapped` = it did not land at `at`.
 */
export function snapSowSpot(
  dish: { cx: number; cy: number; radius: number },
  bodies: readonly SowBody[],
  R: number,
  at: { x: number; y: number },
  aheadSteps = 45,
): { x: number; y: number; snapped: boolean } {
  const usable = Math.max(0, dish.radius - SOW_RIM_R * R);
  const need = SOW_KEEP_R * R;
  const inside = (x: number, y: number) => Math.hypot(x - dish.cx, y - dish.cy) <= usable + 1e-9;
  // A drop on the glass (or past it) comes inside first: that alone is not a snap the player must be told.
  let x = at.x;
  let y = at.y;
  const d0 = Math.hypot(x - dish.cx, y - dish.cy);
  if (d0 > usable && d0 > 0) {
    x = dish.cx + ((x - dish.cx) / d0) * usable;
    y = dish.cy + ((y - dish.cy) / d0) * usable;
  }
  if (sowClearance(bodies, x, y, aheadSteps) >= need) return { x, y, snapped: false };
  const step = SNAP_STEP_R * R;
  for (let d = step; d <= 2 * dish.radius + 1e-9; d += step) {
    let bx = 0;
    let by = 0;
    let bc = -Infinity;
    for (let k = 0; k < SNAP_DIRS; k++) {
      const a = (k / SNAP_DIRS) * Math.PI * 2;
      const px = x + Math.cos(a) * d;
      const py = y + Math.sin(a) * d;
      if (!inside(px, py)) continue;
      const c = sowClearance(bodies, px, py, aheadSteps);
      if (c >= need && c > bc) {
        bc = c;
        bx = px;
        by = py;
      }
    }
    if (bc > -Infinity) return { x: bx, y: by, snapped: true };
  }
  const safe = safeSowSpot(dish, bodies, R, aheadSteps);
  return { x: safe.x, y: safe.y, snapped: true };
}
