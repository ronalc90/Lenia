import type { DishShape } from '../core/dish';

/**
 * Glass deflection (ADR-025): the round dish's rim and other creatures deflect swimmers like
 * billiard balls instead of killing them.
 *
 * Why: a plain Lenia boundary is lethal. Measured on the CPU (docs/DISH.md): with matter outside
 * the dish forced to zero, Orbium dies on 100 % of rim impacts; every potential- or growth-based
 * wall we tried (mirror, repulsive band, "glass presence", renormalised kernel, advection) either
 * kills Orbium on near head-on hits, kills Scutium, or grows a film along the rim. Two Orbium
 * that collide merge and die, and three or more seed the worm maze. Lenia creatures are
 * rotation-invariant, though, so turning a creature's matter rigidly around its centroid is
 * harmless. The rule:
 *
 *  - every detector update, for each moving body whose predicted path reaches the rim (or another
 *    body) before it could finish turning, schedule a turn to the specular reflection of its
 *    heading (angle of incidence = angle of reflection);
 *  - apply the turn as rigid rotations of the matter in a disc around the body's centroid, at most
 *    `maxTurn` per update (a quick visible swerve, not a snap);
 *  - the rim itself stays absorbing (matter outside the dish is zero): whatever is not steered
 *    (fragments, mazes, sessile blobs) is simply blocked by the glass.
 *
 * Pure and deterministic: the GPU applies the returned turns with its rotate pass, the CPU reference
 * with `rotateDiscCpu` (same sampling), so tests and bots see the same physics as the game.
 */

/** A creature as the deflector sees it (detector centroid / velocity / radius of gyration). */
export interface Body {
  id: number;
  x: number;
  y: number;
  /** Velocity in cells per simulation step. */
  vx: number;
  vy: number;
  /** Radius of gyration in cells. */
  radius: number;
  /**
   * false = obstacle only (others bounce off it, it is never turned): exploded blobs, mazes,
   * anything that is not a healthy creature. Default true. Do not gate it on the detector's
   * `spinner` label: real spinners are already left alone by `maxCurl`, and a swimmer misread as a
   * spinner would then hit the glass unsteered and die (pass every turn to the detector's
   * `noteTurn` so it is not misread in the first place).
   */
  steerable?: boolean;
}

/** A rigid rotation of the matter around (x, y): apply it to the simulation now. */
export interface Turn {
  id: number;
  x: number;
  y: number;
  /** Disc radius in cells (rotation fades out over `DEFLECT.feather` cells beyond it). */
  radius: number;
  /** Radians, positive = clockwise on screen (y grows down), same sense as atan2(y, x). */
  angle: number;
}

export interface DeflectOptions {
  /** Body extent = radius of gyration × this (≈ the outline of a catalog swimmer). */
  extentK: number;
  /** Largest rotation applied per update, radians. */
  maxTurn: number;
  /** Extra clearance (cells) kept between a body's outline and the rim. */
  margin: number;
  /** Extra clearance (cells) kept between two bodies' outlines (turn while still well apart). */
  bodyMargin: number;
  /**
   * After an encounter a body must head away from the other at least this much (radians below the
   * tangent): two swimmers drifting side by side get a clear swerve instead of a nudge (Lenia
   * matter attracts at close range, so a nudge still ends in a merge).
   */
  minAway: number;
  /** Bodies slower than this (cells/step) are not steered (still, pulsing, spinning in place). */
  minSpeed: number;
  /** Only react to the rim when moving towards it with at least this share of the speed. */
  minApproach: number;
  /** Only react to another body when closing in faster than this (cells/step). */
  minClosing: number;
  /**
   * Bodies whose heading turned more than this (radians per update, ignoring our own turns) are
   * curling or spinning (Gyrorbium circles in place and never reaches the glass): never steer them,
   * turning a spinner against its spin can break it.
   */
  maxCurl: number;
  /** Steps between a finished turn and the next one for the same body. */
  cooldown: number;
  /** Rotation disc = extent + this many cells. */
  pad: number;
  /** Steer creature–creature encounters too (elastic collisions). */
  bodies: boolean;
}

export const DEFLECT: DeflectOptions & { feather: number } = {
  extentK: 1.9,
  maxTurn: Math.PI / 3,
  margin: 3,
  bodyMargin: 8,
  minAway: 0.45,
  minSpeed: 0.04,
  minApproach: 0.15,
  minClosing: 0.02,
  maxCurl: 0.3,
  cooldown: 20,
  pad: 1.5,
  bodies: true,
  feather: 2,
};

interface Pending {
  left: number;
  until: number;
  /** A turn off the glass (it is never replaced by another rim turn). */
  rim?: boolean;
}

interface Track {
  /** Heading at the last update, plus any turn we applied since. */
  heading: number;
}

/** Signed smallest angle from a to b, in (−π, π]. */
export function angleDelta(a: number, b: number): number {
  const d = b - a;
  return Math.atan2(Math.sin(d), Math.cos(d));
}

/**
 * Turn velocity v (keeping its speed) so it heads away from unit direction n by at least `minAway`
 * radians below the tangent (v·n ≤ −sin(minAway)·|v|), rotating the shorter way.
 */
export function awayFrom(v: { vx: number; vy: number }, nx: number, ny: number, minAway: number): { vx: number; vy: number } {
  const sp = Math.hypot(v.vx, v.vy);
  if (sp === 0 || v.vx * nx + v.vy * ny <= -Math.sin(minAway) * sp) return v;
  // Heading angle relative to −n; clamp it into ±(π/2 − minAway).
  const back = Math.atan2(-ny, -nx);
  const rel = angleDelta(back, Math.atan2(v.vy, v.vx));
  const lim = Math.PI / 2 - minAway;
  const a = back + Math.max(-lim, Math.min(lim, rel === 0 ? 0 : rel));
  return { vx: sp * Math.cos(a), vy: sp * Math.sin(a) };
}

/** Velocity reflected off a surface with unit normal (nx, ny) (only if moving into it). */
export function reflect(vx: number, vy: number, nx: number, ny: number): { vx: number; vy: number } {
  const vn = vx * nx + vy * ny;
  if (vn <= 0) return { vx, vy };
  return { vx: vx - 2 * vn * nx, vy: vy - 2 * vn * ny };
}

/**
 * Stateful planner: call `update` once per detector update with the bodies seen and the current
 * step; it returns the rotations to apply now. Bodies keep their pending turn across updates.
 */
export class Deflector {
  private pending = new Map<number, Pending>();
  private tracks = new Map<number, Track>();
  readonly opts: DeflectOptions;

  constructor(opts: Partial<DeflectOptions> = {}) {
    this.opts = { ...DEFLECT, ...opts };
  }

  reset(): void {
    this.pending.clear();
    this.tracks.clear();
  }

  /**
   * @param bodies   creatures (moving ones are steered)
   * @param dish     the dish rim
   * @param step     simulation step count now
   * @param interval steps until the next update (detector cadence)
   */
  update(bodies: readonly Body[], dish: DishShape, step: number, interval: number): Turn[] {
    const o = this.opts;
    const turns: Turn[] = [];
    const seen = new Set<number>();
    for (const b of bodies) seen.add(b.id);
    for (const id of [...this.pending.keys()]) if (!seen.has(id)) this.pending.delete(id);
    for (const id of [...this.tracks.keys()]) if (!seen.has(id)) this.tracks.delete(id);
    // Heading persistence: how much each body turned by itself since the last update.
    const curl = new Map<number, number>();
    for (const b of bodies) {
      if (Math.hypot(b.vx, b.vy) < o.minSpeed) {
        this.tracks.delete(b.id);
        continue;
      }
      const h = Math.atan2(b.vy, b.vx);
      const tr = this.tracks.get(b.id);
      curl.set(b.id, tr ? Math.abs(angleDelta(tr.heading, h)) : Infinity);
      this.tracks.set(b.id, { heading: h });
    }
    const updatesFor = (ang: number) => Math.max(1, Math.ceil(Math.abs(ang) / o.maxTurn - 1e-9));

    /** The glass ahead of a body: the specular turn it needs now, or null (no impact in reach). */
    const rimThreat = (b: Body): { vx: number; vy: number; t: number } | null => {
      const sp = Math.hypot(b.vx, b.vy);
      const dx = b.x - dish.cx;
      const dy = b.y - dish.cy;
      const rc = Math.hypot(dx, dy);
      if (!(sp >= o.minSpeed) || rc <= 1e-6) return null;
      const nx = dx / rc;
      const ny = dy / rc;
      const vn = b.vx * nx + b.vy * ny;
      if (!(vn > o.minApproach * sp)) return null;
      const gap = dish.radius - rc - b.radius * o.extentK - o.margin;
      const t = gap / vn; // steps until the outline reaches the clearance line
      const r = reflect(b.vx, b.vy, nx, ny);
      const need = updatesFor(angleDelta(Math.atan2(b.vy, b.vx), Math.atan2(r.vy, r.vx))) * interval + interval;
      return t <= need ? { ...r, t } : null;
    };

    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const p = this.pending.get(b.id);
      // The glass comes first (QA4: a swimmer in the middle of a swerve off another body, or in the
      // cooldown after one, was carried into the absorbing rim and died). A steerable body whose heading
      // is known and that is about to reach the glass turns off it now, whatever it was doing.
      const urgent =
        p && ((p.left !== 0 && !p.rim) || (p.left === 0 && step < p.until)) && b.steerable !== false && (curl.get(b.id) ?? Infinity) <= o.maxCurl ? rimThreat(b) : null;
      if (urgent) {
        const ang = angleDelta(Math.atan2(b.vy, b.vx), Math.atan2(urgent.vy, urgent.vx));
        if (Math.abs(ang) >= 1e-3) {
          const np: Pending = { left: ang, until: 0, rim: true };
          this.pending.set(b.id, np);
          turns.push(this.emit(b, np));
          continue;
        }
      }
      if (p && p.left !== 0) {
        turns.push(this.emit(b, p));
        continue;
      }
      if (p && step < p.until) continue;
      if (b.steerable === false) continue;
      if (!((curl.get(b.id) ?? Infinity) <= o.maxCurl)) continue; // unknown heading or spinning
      const sp = Math.hypot(b.vx, b.vy);
      if (!(sp >= o.minSpeed)) continue;
      const ext = b.radius * o.extentK;
      let best: { vx: number; vy: number; t: number; rim?: boolean } | null = null;

      // Rim: outward normal at the body.
      const rim = rimThreat(b);
      if (rim) best = { ...rim, rim: true };
      // Other bodies: elastic encounter (each reflects off the line between centres).
      if (o.bodies) {
        for (let j = 0; j < bodies.length; j++) {
          if (j === i) continue;
          const c = bodies[j];
          const ex = c.x - b.x;
          const ey = c.y - b.y;
          const d = Math.hypot(ex, ey);
          if (d < 1e-6) continue;
          const nx = ex / d;
          const ny = ey / d;
          const closing = (b.vx - c.vx) * nx + (b.vy - c.vy) * ny;
          const vn = b.vx * nx + b.vy * ny;
          if (closing <= o.minClosing || vn <= 0) continue;
          const gap = d - ext - c.radius * o.extentK - o.bodyMargin;
          if (gap < -ext) continue; // already merged: too late, let Lenia decide
          const t = Math.max(0, gap) / closing;
          const r = awayFrom(reflect(b.vx, b.vy, nx, ny), nx, ny, o.minAway);
          const need = updatesFor(angleDelta(Math.atan2(b.vy, b.vx), Math.atan2(r.vy, r.vx))) * interval + interval;
          if (t <= need && (!best || t < best.t)) best = { ...r, t, rim: false };
        }
      }
      if (!best) continue;
      const ang = angleDelta(Math.atan2(b.vy, b.vx), Math.atan2(best.vy, best.vx));
      if (Math.abs(ang) < 1e-3) continue;
      const np: Pending = { left: ang, until: 0, rim: !!best.rim };
      this.pending.set(b.id, np);
      turns.push(this.emit(b, np));
    }
    // Finished turns start their cooldown.
    for (const [, p] of this.pending) if (p.left === 0 && p.until === 0) p.until = step + this.opts.cooldown;
    return turns;
  }

  private emit(b: Body, p: Pending): Turn {
    const o = this.opts;
    const a = Math.max(-o.maxTurn, Math.min(o.maxTurn, p.left));
    p.left = Math.abs(p.left - a) < 1e-9 ? 0 : p.left - a;
    const tr = this.tracks.get(b.id);
    if (tr) tr.heading += a; // our own turn is not the body's curl
    return { id: b.id, x: b.x, y: b.y, radius: b.radius * o.extentK + o.pad, angle: a };
  }
}

/**
 * Rotation weight at distance q (cells) from the turn centre: 1 inside `radius`, fading to 0
 * over `feather` cells (smoothstep), so a neighbour grazing the disc is bent, not torn.
 */
export function turnWeight(q: number, radius: number, feather = DEFLECT.feather): number {
  if (q <= radius) return 1;
  if (q >= radius + feather) return 0;
  const t = 1 - (q - radius) / feather;
  return t * t * (3 - 2 * t);
}

/**
 * CPU mirror of the GPU rotate pass: every cell centre c within radius + feather of (x, y) takes
 * the bilinear sample of the old field at the centre rotated by −angle·w(|c − p|). Cells outside
 * the dish stay 0. `tmp` (same length as A) is scratch space.
 */
export function rotateDiscCpu(
  A: Float32Array,
  w: number,
  h: number,
  t: Turn,
  dish: DishShape | null,
  tmp: Float32Array,
): void {
  tmp.set(A);
  const R = t.radius + DEFLECT.feather;
  const x0 = Math.max(0, Math.floor(t.x - R));
  const x1 = Math.min(w - 1, Math.ceil(t.x + R));
  const y0 = Math.max(0, Math.floor(t.y - R));
  const y1 = Math.min(h - 1, Math.ceil(t.y + R));
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : tmp[y * w + x]);
  for (let j = y0; j <= y1; j++) {
    for (let i = x0; i <= x1; i++) {
      const dx = i + 0.5 - t.x;
      const dy = j + 0.5 - t.y;
      const q = Math.hypot(dx, dy);
      const wgt = turnWeight(q, t.radius);
      if (wgt <= 0) continue;
      const a = -t.angle * wgt;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const sx = t.x + c * dx - s * dy - 0.5;
      const sy = t.y + s * dx + c * dy - 0.5;
      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      const fx = sx - ix;
      const fy = sy - iy;
      let v =
        (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
      if (dish) {
        const ex = i + 0.5 - dish.cx;
        const ey = j + 0.5 - dish.cy;
        if (ex * ex + ey * ey >= dish.radius * dish.radius) v = 0;
      }
      A[j * w + i] = v;
    }
  }
}

// ───────────────────────────── Lysis (maze safety net) ─────────────────────────────

/**
 * Lysis: the lab dissolves a blob that grows out of control before it seeds the worm maze.
 * docs/DISH.md §5: no carrying capacity stops the maze without killing the fauna (an established
 * maze survives a growth penalty of 0.3), but a local −1 growth for 60 steps on the runaway blob
 * stopped 7/7 nucleations. It is gated by the caller (the game passes only components the detector
 * flags as runaway/exploded while the dish is not already overgrown: overgrown keeps its free
 * sterilise), so healthy creatures are never touched.
 *
 * Growth inside a disc: G ← G − strength·max(0, 1 − (d / radius)²) (strongest at the centre).
 */
export const LYSIS = {
  /** Growth removed at the disc centre (G ∈ [−1, 1]; 1 dissolves anything in ~10–20 steps). */
  strength: 1,
  /** Steps a disc stays after its blob was last reported. */
  holdSteps: 60,
  /** Disc radius = radiusK × radius of gyration + padR × R. */
  radiusK: 2,
  padR: 1,
  /** At most this many discs at once (GPU uniform array). */
  maxDiscs: 8,
} as const;

export interface LysisDisc {
  x: number;
  y: number;
  radius: number;
  strength: number;
}

/** A blob the caller wants dissolved (detector centroid / radius / mass). */
export interface LysisTarget {
  id: number;
  x: number;
  y: number;
  /** Radius of gyration in cells. */
  radius: number;
  mass: number;
  /** Why (shown to the player), e.g. 'runaway' or 'oversize'. */
  reason: string;
}

/** Emitted once when a blob starts being dissolved (for the game's explanation). */
export interface LysisEvent extends LysisTarget {
  step: number;
}

/** Growth penalty at (x, y) from a set of discs (CPU mirror of the step shader). */
export function lysisPenalty(x: number, y: number, discs: readonly LysisDisc[]): number {
  let p = 0;
  for (const d of discs) {
    const q = Math.hypot(x - d.x, y - d.y) / d.radius;
    if (q < 1) p = Math.max(p, d.strength * (1 - q * q));
  }
  return p;
}

/**
 * Keeps the active lysis discs: `update` with the blobs to dissolve now (others expire after
 * `holdSteps`). Returns the discs to upload and the blobs that just started dissolving.
 */
export class LysisPlanner {
  private active = new Map<number, { disc: LysisDisc; until: number }>();

  reset(): void {
    this.active.clear();
  }

  get discs(): LysisDisc[] {
    return [...this.active.values()].map((a) => a.disc);
  }

  update(targets: readonly LysisTarget[], step: number, R: number): { discs: LysisDisc[]; started: LysisEvent[] } {
    const started: LysisEvent[] = [];
    for (const t of targets) {
      const disc: LysisDisc = { x: t.x, y: t.y, radius: LYSIS.radiusK * t.radius + LYSIS.padR * R, strength: LYSIS.strength };
      const had = this.active.has(t.id);
      if (!had && this.active.size >= LYSIS.maxDiscs) continue;
      this.active.set(t.id, { disc, until: step + LYSIS.holdSteps });
      if (!had) started.push({ ...t, step });
    }
    for (const [id, a] of this.active) if (a.until <= step) this.active.delete(id);
    return { discs: this.discs, started };
  }
}
