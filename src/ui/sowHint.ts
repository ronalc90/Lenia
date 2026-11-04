/**
 * Where «¡Toca aquí!» points (QA-CLARIDAD-2 C3): from session 2 the hint sat at the dish's centre, on top of the
 * Nevera's creature (planted near the centre), so following it gave «¡Cuidado! Se van a tocar» and its text
 * covered the «Naciendo…» label. The hint goes to the free agar farthest from every body (now and a little
 * ahead on its way) and from the glass. Pure: grid cells in, grid cells out; no allocation beyond the result.
 */

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
  const clearance = (x: number, y: number): number => {
    let c = Infinity;
    for (const b of bodies) {
      c = Math.min(c, Math.hypot(x - b.x, y - b.y) - b.r);
      const ax = b.x + (b.vx ?? 0) * aheadSteps;
      const ay = b.y + (b.vy ?? 0) * aheadSteps;
      if (ax !== b.x || ay !== b.y) c = Math.min(c, Math.hypot(x - ax, y - ay) - b.r, Math.hypot(x - (b.x + ax) / 2, y - (b.y + ay) / 2) - b.r);
    }
    return c;
  };
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
