/**
 * What a finger on the dish means (ADR-030, docs/CLARIDAD2.md §2.2.1), as one pure rule so it is tested
 * without a DOM:
 *
 *   tap on a drop, or on a creature that has light → collect it (never sows; collecting early is never worse)
 *   tap on a creature with no light yet            → nothing, but its card is a long press away (a hint)
 *   tap on empty agar                              → sow, as always
 *   long press on a creature                       → its card (it was the short tap before)
 *   long press on empty agar                       → big seed (when bought)
 *   drag that starts on a swimmer                  → guide it (§2.5); it collects nothing
 *   drag that starts anywhere else                 → sweep: every drop the finger passes is collected
 *
 * Without collection (an older game, the classic loop: no `drops` in the view) a tap on a creature still
 * opens its card and a drag is left to the brush / eraser, exactly as before.
 *
 * Every point is in CSS px of the dish (overlay coordinates). No allocation: callers pass their scratch.
 */
import type { Behavior, CreatureState } from '../core/types';

/** A drop as drawn this frame (overlay coordinates). */
export interface TapDrop {
  id: number;
  x: number;
  y: number;
  amount: number;
  owner: number | null;
}

/** A creature as drawn this frame (overlay coordinates; `r` = its outline on screen). */
export interface TapCreature {
  id: number;
  x: number;
  y: number;
  r: number;
  state: CreatureState;
  behavior: Behavior | null;
}

export interface TapScene {
  drops: readonly TapDrop[];
  dropCount: number;
  creatures: readonly TapCreature[];
  creatureCount: number;
  /** The game collects light by hand (GameView.drops and GameActions.collect exist). */
  collecting: boolean;
  /** Touch radius of a drop, CSS px at any zoom (cycleBalance LIGHT_TAP_RADIUS_PX: a 64 px target). */
  dropPx: number;
  /** A creature's touch area is its outline plus this (CSS px, §2.2.1). */
  creaturePadPx: number;
}

export type Gesture = 'tap' | 'long' | 'drag';

export type TapRoute =
  | { kind: 'collect'; drop: number; creature: number | null }
  | { kind: 'card'; id: number }
  | { kind: 'cardHint'; id: number }
  | { kind: 'sow'; big: boolean }
  | { kind: 'steer'; id: number }
  | { kind: 'sweep' }
  | { kind: 'none' };

/** Drop under (x, y) within the touch radius (the nearest), or -1 (index into scene.drops). */
export function dropAt(s: TapScene, x: number, y: number): number {
  let best = -1;
  let bd = s.dropPx;
  for (let i = 0; i < s.dropCount; i++) {
    const d = s.drops[i];
    if (!(d.amount > 0)) continue;
    const q = Math.hypot(d.x - x, d.y - y);
    if (q <= bd) {
      bd = q;
      best = i;
    }
  }
  return best;
}

/** Living creature under (x, y) (outline + pad; the nearest), or -1 (index into scene.creatures). */
export function creatureAt(s: TapScene, x: number, y: number): number {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < s.creatureCount; i++) {
    const c = s.creatures[i];
    if (c.state === 'dead' || c.state === 'exploded') continue;
    const q = Math.hypot(c.x - x, c.y - y);
    if (q <= c.r + s.creaturePadPx && q < bd) {
      bd = q;
      best = i;
    }
  }
  return best;
}

/** The drop a creature fills (its own), or -1. */
function dropOf(s: TapScene, id: number): number {
  for (let i = 0; i < s.dropCount; i++) if (s.drops[i].owner === id && s.drops[i].amount > 0) return i;
  return -1;
}

/** What a gesture at (x, y) does. `drag` is asked once, where the drag started. */
export function routeTap(g: Gesture, x: number, y: number, s: TapScene): TapRoute {
  const ci = creatureAt(s, x, y);
  // Only a stable creature has a card, a drop and a heading; a forming seed is "too close" ground
  // (the game refuses a seed there and says why), exactly as before.
  const c = ci >= 0 && s.creatures[ci].state === 'stable' ? s.creatures[ci] : null;
  if (g === 'long') return c ? { kind: 'card', id: c.id } : { kind: 'sow', big: true };
  if (g === 'drag') {
    if (c && c.behavior === 'swimmer') return { kind: 'steer', id: c.id };
    return s.collecting ? { kind: 'sweep' } : { kind: 'none' };
  }
  if (!s.collecting) return c ? { kind: 'card', id: c.id } : { kind: 'sow', big: false };
  const di = dropAt(s, x, y);
  if (di >= 0) return { kind: 'collect', drop: s.drops[di].id, creature: s.drops[di].owner };
  if (c) {
    const own = dropOf(s, c.id);
    if (own >= 0) return { kind: 'collect', drop: s.drops[own].id, creature: c.id };
    return { kind: 'cardHint', id: c.id };
  }
  return { kind: 'sow', big: false };
}

/** Distance from point p to the segment a–b. */
export function segmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const L = dx * dx + dy * dy;
  const t = L > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/**
 * Drops a swipe from a to b passes over (within the touch radius), written as drop ids into `out`;
 * returns how many. Drops already in `out[0..skip)` are not repeated.
 */
export function dropsOnSegment(s: TapScene, ax: number, ay: number, bx: number, by: number, out: number[], skip = 0): number {
  let n = skip;
  for (let i = 0; i < s.dropCount; i++) {
    const d = s.drops[i];
    if (!(d.amount > 0)) continue;
    if (segmentDist(d.x, d.y, ax, ay, bx, by) > s.dropPx) continue;
    let dup = false;
    for (let k = 0; k < n; k++) if (out[k] === d.id) dup = true;
    if (dup) continue;
    out[n++] = d.id;
  }
  return n;
}
