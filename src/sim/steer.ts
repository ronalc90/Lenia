import type { DishShape } from '../core/dish';
import { angleDelta, DEFLECT, type Body, type Turn } from './deflect';

/**
 * The finger guide (ADR-030, docs/CLARIDAD2.md §2.5): the player drags from a swimmer and it turns
 * towards the finger. It is the glass deflector's own move with another source of turns: rigid
 * rotations of the matter in a disc around the body's centroid (`Turn`, applied by the GPU rotate
 * pass and by `rotateDiscCpu` on the CPU), so there is no new simulation rule, no new shader pass and
 * no change to the detector (ADR-002, ADR-025). Lenia is rotation-invariant: a rigid turn is harmless.
 *
 * Rules:
 *  - only bodies the deflector itself would steer: steerable, moving (`minSpeed`), not curling
 *    (`maxCurl`). Spinners, still ones, pulsing ones and blobs are never guided;
 *  - the deflector comes first: a body it turned in this update is not guided in the same update;
 *  - never into the glass: a requested heading that would carry the outline to the rim before the
 *    deflector could turn it back is cut to the tangent;
 *  - at most `STEER.maxTurn` per update, BELOW the deflector's `maxCurl`. The deflector measures a
 *    body's curl against the heading it saw at the previous update plus its own turns, and knows
 *    nothing of ours: a guide turn larger than `maxCurl` would make it read the swimmer as a spinner
 *    and leave it unguarded from the glass for the next update. (The plan's 30° per update would do
 *    exactly that; 12.6° keeps the deflector in charge and still turns 90° in about 1.6 s of a session.)
 *
 * Pure and deterministic (no clock, no randomness): `request` is called by the UI, `update` once per
 * detector update by the integrator (src/main.ts `detect()`, after `deflector.update`), and its turns
 * are applied, told to the extrapolator and to the detector (`noteTurn`) together with the deflector's.
 */

export interface SteerOptions {
  /** Largest turn per detector update, radians (see above: below DEFLECT.maxCurl). */
  maxTurn: number;
  /** A heading closer than this to the request is "there": the request is done. */
  done: number;
  /**
   * A request not renewed for this many updates is dropped (a finger lifted long ago, a body it cannot
   * turn): enough for a half turn after the finger lifts, so a released guide still finishes its turn.
   */
  holdUpdates: number;
  /** Updates the deflector needs to turn a body round at the rim, plus one: the glass guard's look-ahead. */
  guardUpdates: number;
}

const MAX_TURN = DEFLECT.maxCurl - 0.08;

export const STEER: SteerOptions = {
  maxTurn: MAX_TURN,
  done: 0.03,
  holdUpdates: Math.ceil(Math.PI / MAX_TURN) + 3,
  guardUpdates: Math.ceil(Math.PI / DEFLECT.maxTurn) + 2,
};

interface Request {
  heading: number;
  /** Updates left before it is dropped. */
  left: number;
}

interface Track {
  /** Heading at the last update plus every turn applied since (ours and the deflector's). */
  heading: number;
}

/**
 * Heading `want` cut so it never carries body `b` into the glass within `lookSteps` steps: when it
 * heads out of the dish and the outline would reach the clearance line in time, it becomes the
 * tangent of the rim nearest to it (sliding along the glass, the deflector's own way out).
 */
export function guardHeading(b: Body, want: number, dish: DishShape, lookSteps: number, o = DEFLECT): number {
  const dx = b.x - dish.cx;
  const dy = b.y - dish.cy;
  const rc = Math.hypot(dx, dy);
  if (rc <= 1e-6) return want;
  const nx = dx / rc;
  const ny = dy / rc;
  const sp = Math.max(Math.hypot(b.vx, b.vy), o.minSpeed);
  const vn = sp * (Math.cos(want) * nx + Math.sin(want) * ny);
  if (vn <= 0) return want;
  const gap = dish.radius - rc - b.radius * o.extentK - o.margin;
  if (gap > vn * lookSteps) return want;
  const out = Math.atan2(ny, nx);
  const t1 = out + Math.PI / 2;
  const t2 = out - Math.PI / 2;
  return Math.abs(angleDelta(want, t1)) <= Math.abs(angleDelta(want, t2)) ? t1 : t2;
}

/** The finger guide's planner: one per dish, like the Deflector. */
export class Steering {
  private reqs = new Map<number, Request>();
  private tracks = new Map<number, Track>();
  readonly opts: SteerOptions;

  constructor(opts: Partial<SteerOptions> = {}) {
    this.opts = { ...STEER, ...opts };
  }

  /** Clear between dishes. */
  reset(): void {
    this.reqs.clear();
    this.tracks.clear();
  }

  /**
   * The player wants creature `id` to head `heading` (radians in grid space, atan2(dy, dx), y down; the
   * screen has the same orientation). Renew it while the finger moves; null cancels it.
   */
  request(id: number, heading: number | null): void {
    if (heading === null || !Number.isFinite(heading)) {
      this.reqs.delete(id);
      return;
    }
    this.reqs.set(id, { heading: Math.atan2(Math.sin(heading), Math.cos(heading)), left: this.opts.holdUpdates });
  }

  /** Requests waiting (tests, the UI's guide line). */
  get pending(): number {
    return this.reqs.size;
  }

  /** Whether creature `id` has a request still being followed. */
  has(id: number): boolean {
    return this.reqs.has(id);
  }

  /**
   * @param bodies    the same bodies the deflector saw this update
   * @param dish      the dish rim
   * @param step      simulation step now (kept for symmetry with the deflector; the planner keeps no clock)
   * @param deflected the turns the deflector returned this update (it comes first)
   * @param interval  steps until the next update (detector cadence)
   */
  update(bodies: readonly Body[], dish: DishShape, step: number, deflected: readonly Turn[] = [], interval = 10): Turn[] {
    void step;
    const o = this.opts;
    const d = DEFLECT;
    const turns: Turn[] = [];
    // The deflector's turns of this update are part of each body's heading from now on.
    const defl = new Map<number, number>();
    for (const t of deflected) defl.set(t.id, (defl.get(t.id) ?? 0) + t.angle);
    const seen = new Set<number>();
    for (const b of bodies) seen.add(b.id);
    for (const id of [...this.tracks.keys()]) if (!seen.has(id)) this.tracks.delete(id);
    for (const id of [...this.reqs.keys()]) if (!seen.has(id)) this.reqs.delete(id);

    for (const b of bodies) {
      const sp = Math.hypot(b.vx, b.vy);
      const tr = this.tracks.get(b.id);
      if (!(sp >= d.minSpeed)) {
        this.tracks.delete(b.id);
        continue;
      }
      const h = Math.atan2(b.vy, b.vx);
      const curl = tr ? Math.abs(angleDelta(tr.heading, h)) : Infinity;
      const next: Track = { heading: h + (defl.get(b.id) ?? 0) };
      this.tracks.set(b.id, next);
      const req = this.reqs.get(b.id);
      if (!req) continue;
      req.left--;
      if (req.left <= 0) this.reqs.delete(b.id);
      // The same bodies the deflector would steer, and never in the update the deflector turned them.
      if (b.steerable === false || !(curl <= d.maxCurl) || defl.has(b.id)) continue;
      const want = guardHeading(b, req.heading, dish, o.guardUpdates * interval, d);
      const delta = angleDelta(h, want);
      if (Math.abs(delta) < o.done) {
        // There (or cut to a tangent it already follows): the request is done.
        if (want === req.heading) this.reqs.delete(b.id);
        continue;
      }
      const a = Math.max(-o.maxTurn, Math.min(o.maxTurn, delta));
      next.heading += a;
      turns.push({ id: b.id, x: b.x, y: b.y, radius: b.radius * d.extentK + d.pad, angle: a });
    }
    return turns;
  }
}
