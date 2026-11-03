/**
 * Accidents, explained (ADR-030, docs/CLARIDAD2.md §2.5): warn before two creatures touch, and say why a
 * creature went dark. Pure geometry on what the detector already reports (centroid, radius, velocity in
 * cells per simulation step); it reads the dish, it never changes it. No simulation rule is involved.
 */
import type { Behavior, CreatureState } from '../core/types';
import { DEFLECT } from '../sim/deflect';
import * as C from './cycleBalance';

/** What the prediction needs of a creature (a CreatureView fits). */
export interface Body {
  id: number;
  x: number;
  y: number;
  r: number;
  vx?: number;
  vy?: number;
  state?: CreatureState;
  behavior?: Behavior | null;
}

export interface RoundDish {
  cx: number;
  cy: number;
  radius: number;
}

export interface Danger {
  /** The two creatures (a < b). */
  a: number;
  b: number;
  /** Seconds of dish time until their outlines touch (0 = touching now). */
  inS: number;
}

/** Earliest t ≥ 0 (steps) at which |d + w·t| ≤ R, or null. */
function firstTouch(dx: number, dy: number, wx: number, wy: number, R: number, maxT: number): number | null {
  const c = dx * dx + dy * dy - R * R;
  if (c <= 0) return 0;
  const a = wx * wx + wy * wy;
  if (!(a > 1e-12)) return null;
  const b = 2 * (dx * wx + dy * wy);
  if (b >= 0) return null; // moving apart
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= maxT ? t : null;
}

/** Steps until a body moving straight reaches the glass (its outline at the rim); Infinity if it never does. */
function stepsToGlass(b: Body, dish: RoundDish): number {
  const vx = b.vx ?? 0;
  const vy = b.vy ?? 0;
  const v2 = vx * vx + vy * vy;
  if (!(v2 > 1e-12)) return Infinity;
  const px = b.x - dish.cx;
  const py = b.y - dish.cy;
  const R = Math.max(0, dish.radius - b.r);
  // |p + v·t| = R, the positive root.
  const bb = 2 * (px * vx + py * vy);
  const cc = px * px + py * py - R * R;
  if (cc >= 0) return 0;
  return (-bb + Math.sqrt(bb * bb - 4 * v2 * cc)) / (2 * v2);
}

/**
 * The deflector steers this body (ADR-025: off the glass and off other bodies): a stable swimmer moving at
 * least its `minSpeed`. A forming seed, a still or pulsing creature or a blob is only an obstacle.
 */
function deflected(b: Body): boolean {
  return (b.state ?? 'stable') === 'stable' && b.behavior === 'swimmer' && Math.hypot(b.vx ?? 0, b.vy ?? 0) >= DEFLECT.minSpeed;
}

/**
 * Pairs of creatures whose outlines will touch within `horizonS` seconds of dish time if they keep their
 * course (each pair once, a < b). No danger when the deflector steers both, or when one of them is a
 * swimmer the glass will turn before the touch (its course changes first, docs/CLARIDAD2.md §2.5).
 * `stepsPerSec` = simulation steps per second of dish (SIM_STEPS_PER_SEC × the time-lapse).
 */
export function predictContacts(bodies: readonly Body[], stepsPerSec: number, dish: RoundDish | null = null, horizonS = C.CONTACT_WARN_S): Danger[] {
  const out: Danger[] = [];
  if (!(stepsPerSec > 0)) return out;
  const maxT = horizonS * stepsPerSec;
  const live = bodies.filter((b) => b && (b.state ?? 'stable') !== 'dead' && b.state !== 'exploded' && Number.isFinite(b.x) && Number.isFinite(b.y));
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const p = live[i];
      const q = live[j];
      const t = firstTouch(q.x - p.x, q.y - p.y, (q.vx ?? 0) - (p.vx ?? 0), (q.vy ?? 0) - (p.vy ?? 0), p.r + q.r, maxT);
      if (t === null) continue;
      if (t > 0 && deflected(p) && deflected(q)) continue;
      if (dish && t > 0 && [p, q].some((b) => deflected(b) && stepsToGlass(b, dish) < t)) continue;
      out.push({ a: Math.min(p.id, q.id), b: Math.max(p.id, q.id), inS: t / stepsPerSec });
    }
  }
  return out.sort((x, y) => x.inS - y.inS || x.a - y.a || x.b - y.b);
}

export type DeathCause = 'faded' | 'glass' | 'crowd';

/**
 * Why a creature went dark (docs/CLARIDAD2.md §2.5): its outline was within half a kernel radius of the
 * glass → 'glass'; another body within 2 R of it → 'crowd'; otherwise it simply did not take → 'faded'.
 */
export function deathCause(c: { x: number; y: number; r: number }, others: readonly { x: number; y: number }[], R: number, dish: RoundDish | null): DeathCause {
  if (dish) {
    const rim = dish.radius - Math.hypot(c.x - dish.cx, c.y - dish.cy);
    if (rim < c.r + 0.5 * R) return 'glass';
  }
  if (others.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < 2 * R)) return 'crowd';
  return 'faded';
}

/**
 * Why matter went shapeless: 'crowd' while the dish is flooded; 'touch' when another body was touching it
 * (outlines within `pad` cells); null when nothing says (a seed that fell apart on its own).
 */
export function explodeCause(c: { x: number; y: number; r: number }, others: readonly { x: number; y: number; r: number }[], overgrown: boolean, pad: number): 'touch' | 'crowd' | null {
  if (overgrown) return 'crowd';
  return others.some((o) => Math.hypot(o.x - c.x, o.y - c.y) <= c.r + o.r + pad) ? 'touch' : null;
}
