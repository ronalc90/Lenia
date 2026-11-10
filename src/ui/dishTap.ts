/**
 * What a finger on the dish means, as one pure rule so it is tested without a DOM.
 *
 * In a lab session (ADR-031, docs/MECANICAS.md §3.1: `scene.pulsing`) a finger on the dish always adds and
 * never sows (sowing is the Sembrar button):
 *
 *   tap on a glimmer (a ¡Chispazo! mote)          → catch it (before whatever is behind it)
 *   tap on a stable creature, or on its drop      → pulse: it glows, the game pays a pulse × the streak and
 *                                                    collects its drop
 *   tap on a loose drop                           → collect it
 *   tap on a forming seed or a shapeless blob     → grey: «aún no brilla»; nothing paid, the streak kept
 *   tap on empty agar                             → a water ripple that gathers the drops and glimmers
 *                                                    within TAP_REACH_PX; never a seed, never a cost
 *   long press on a creature                      → its card (never during a streak: QA-3 §2, nor right after a
 *                                                    tap: cardHoldOk, QA-4 N6)
 *   tap on a creature's pill                      → its pulse (the card is a long press only; a behaviour
 *                                                    pill explains itself while no streak runs: pillTapRoute)
 *   drag that starts on a swimmer                 → guide it (§2.5)
 *   drag that starts anywhere else                → sweep: drops and glimmers on the path are collected and
 *                                                    every creature it crosses is pulsed (SweepHits)
 *
 * Outside sessions (the classic loop, ADR-030 §2.2.1) the old rule stands: a drop or a creature with light is
 * collected, a creature without light points at its card, and empty agar sows.
 *
 * Every point is in CSS px of the dish (overlay coordinates). No allocation: callers pass their scratch.
 */
import type { Behavior, CreatureState } from '../core/types';
import { SWEEP_REHIT_S } from '../game/cycleBalance';

/**
 * A tap on empty agar in a session gathers drops and glimmers this close (CSS px, MECANICAS §3.1: «un radio
 * generoso (48 px)»), past their own touch radius.
 */
export const TAP_REACH_PX = 48;
/**
 * A sweep pulses the same creature again only after this long (s): the game's SWEEP_REHIT_S (MECANICAS §5.2;
 * the game enforces it in pulseMany too). Here it keeps the glow and the sound from firing on every pointer move.
 */
export { SWEEP_REHIT_S };

/**
 * A press that starts this soon after a tap on the dish is part of the tapping, not a request for the card (QA-4 N6:
 * before the clock there is no streak, and fast taps on the Nevera's creatures opened its card, and the next tap
 * landed on «Seguir»). The card stays a long press on a still finger.
 */
export const CARD_TAP_QUIET_MS = 1000;

/** May a press that starts at `pressMs` open a creature's card, the last tap on the dish having been at `lastTapMs`? */
export function cardHoldOk(pressMs: number, lastTapMs: number): boolean {
  return pressMs - lastTapMs >= CARD_TAP_QUIET_MS;
}

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

/** A ¡Chispazo! glimmer as drawn this frame (overlay coordinates; GameView.motes). */
export interface TapMote {
  id: number;
  x: number;
  y: number;
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
  /** (ADR-031) The game pulses creatures (a running session with GameActions.pulse): a finger never sows. */
  pulsing: boolean;
  /** Glimmers as drawn this frame. */
  motes: readonly TapMote[];
  moteCount: number;
  /** Touch radius of a glimmer (CSS px): a target well over 48 px across. */
  motePx: number;
  /** Empty agar gathers what lies this close (CSS px, TAP_REACH_PX). */
  reachPx: number;
  /**
   * A tap streak runs (GameView.streak with hits): the finger is tapping fast, and a slow tap on a slow phone must
   * not open a card over the dish (QA-3 §2). Absent = no streak.
   */
  streaking?: boolean;
}

/** What a tap on empty agar gathered (ids; caller's scratch, reused). */
export interface TapReach {
  drops: number[];
  dropN: number;
  motes: number[];
  moteN: number;
}

export type Gesture = 'tap' | 'long' | 'drag';

export type TapRoute =
  | { kind: 'collect'; drop: number; creature: number | null }
  | { kind: 'card'; id: number }
  | { kind: 'cardHint'; id: number }
  | { kind: 'sow'; big: boolean }
  | { kind: 'steer'; id: number }
  | { kind: 'sweep' }
  | { kind: 'none' }
  // ── sessions (ADR-031) ──
  /** Pulse creature `id`; `drop` = its own drop, which the pulse collects (null: it has none yet). */
  | { kind: 'pulse'; id: number; drop: number | null }
  /** A forming seed or shapeless matter: a grey blink, nothing else. */
  | { kind: 'grey'; id: number }
  /** Catch glimmer `mote`. */
  | { kind: 'catch'; mote: number }
  /** Empty agar: a water ripple; what it gathered is in the caller's TapReach. */
  | { kind: 'ripple' };

const NONE: TapRoute = { kind: 'none' };
const SWEEP: TapRoute = { kind: 'sweep' };
const RIPPLE: TapRoute = { kind: 'ripple' };

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

/** Glimmer under (x, y) within its touch radius (the nearest), or -1 (index into scene.motes). */
export function moteAt(s: TapScene, x: number, y: number): number {
  let best = -1;
  let bd = s.motePx;
  for (let i = 0; i < s.moteCount; i++) {
    const m = s.motes[i];
    const q = Math.hypot(m.x - x, m.y - y);
    if (q <= bd) {
      bd = q;
      best = i;
    }
  }
  return best;
}

/**
 * Creature under (x, y) (outline + pad; the nearest), or -1 (index into scene.creatures). Living ones only;
 * `blobs` also counts shapeless matter (a session's grey tap).
 */
export function creatureAt(s: TapScene, x: number, y: number, blobs = false): number {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < s.creatureCount; i++) {
    const c = s.creatures[i];
    if (c.state === 'dead' || (c.state === 'exploded' && !blobs)) continue;
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

/** Stable creature with this id drawn this frame, or -1. */
function stableIndex(s: TapScene, id: number): number {
  for (let i = 0; i < s.creatureCount; i++) if (s.creatures[i].id === id && s.creatures[i].state === 'stable') return i;
  return -1;
}

/** What a gesture at (x, y) does. `drag` is asked once, where the drag started. */
export function routeTap(g: Gesture, x: number, y: number, s: TapScene, reach?: TapReach): TapRoute {
  if (s.pulsing) return routeSession(g, x, y, s, reach);
  const ci = creatureAt(s, x, y);
  // Only a stable creature has a card, a drop and a heading; a forming seed is "too close" ground
  // (the game refuses a seed there and says why), exactly as before.
  const c = ci >= 0 && s.creatures[ci].state === 'stable' ? s.creatures[ci] : null;
  if (g === 'long') return c ? { kind: 'card', id: c.id } : { kind: 'sow', big: true };
  if (g === 'drag') {
    if (c && c.behavior === 'swimmer') return { kind: 'steer', id: c.id };
    return s.collecting ? SWEEP : NONE;
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

/** The session rule (ADR-031): nothing a finger does on the dish sows, costs or breaks the streak. */
function routeSession(g: Gesture, x: number, y: number, s: TapScene, reach?: TapReach): TapRoute {
  const ci = creatureAt(s, x, y, true);
  const c = ci >= 0 ? s.creatures[ci] : null;
  const stable = c && c.state === 'stable' ? c : null;
  if (g === 'long') return stable && !s.streaking ? { kind: 'card', id: stable.id } : NONE;
  if (g === 'drag') return stable && stable.behavior === 'swimmer' ? { kind: 'steer', id: stable.id } : SWEEP;
  // A glimmer flies over the creature that threw it: the finger that lands on it wants the glimmer.
  const mi = moteAt(s, x, y);
  if (mi >= 0) return { kind: 'catch', mote: s.motes[mi].id };
  const di = dropAt(s, x, y);
  if (di >= 0) {
    const d = s.drops[di];
    // A creature's own drop sits on its outline: a tap there is that creature's pulse (which collects it).
    if (d.owner !== null && stableIndex(s, d.owner) >= 0) return { kind: 'pulse', id: d.owner, drop: d.id };
    return { kind: 'collect', drop: d.id, creature: d.owner };
  }
  if (stable) {
    const own = dropOf(s, stable.id);
    return { kind: 'pulse', id: stable.id, drop: own >= 0 ? s.drops[own].id : null };
  }
  if (c) return { kind: 'grey', id: c.id };
  if (reach) gather(s, x, y, reach);
  return RIPPLE;
}

/**
 * A tap on a creature's status pill (its name, «Gira»…). Outside sessions: a behaviour pill explains itself, a stable
 * creature's opens its card. In a session (ADR-031) the card is a long press only (QA-3 §2: fast taps on a swimmer
 * landed on its pill and the card swallowed the next ones): the pill pulses its creature; a behaviour pill explains
 * itself only while no streak runs; «Pulso fácil» keeps the card on the pill (MECANICAS §3.5), not during a streak.
 */
export function pillTapRoute(
  pill: { state: CreatureState; behavior: Behavior | null },
  s: { pulsing: boolean; streaking: boolean; easyPulse: boolean },
): 'pulse' | 'card' | 'behavior' | 'none' {
  const stable = pill.state === 'stable';
  if (!s.pulsing) return pill.behavior ? 'behavior' : stable ? 'card' : 'none';
  if (s.streaking) return stable ? 'pulse' : 'none';
  if (pill.behavior) return 'behavior';
  if (!stable) return 'none';
  return s.easyPulse ? 'card' : 'pulse';
}

/** Drops and glimmers within the scene's reach of (x, y), into `out` (ids). */
function gather(s: TapScene, x: number, y: number, out: TapReach): void {
  out.dropN = 0;
  out.moteN = 0;
  const R = s.reachPx;
  for (let i = 0; i < s.dropCount; i++) {
    const d = s.drops[i];
    if (d.amount > 0 && Math.hypot(d.x - x, d.y - y) <= R) out.drops[out.dropN++] = d.id;
  }
  for (let i = 0; i < s.moteCount; i++) {
    const m = s.motes[i];
    if (Math.hypot(m.x - x, m.y - y) <= R) out.motes[out.moteN++] = m.id;
  }
}

/** Distance from point p to the segment a–b. */
export function segmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const L = dx * dx + dy * dy;
  const t = L > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** `id` is in out[0..n). */
function has(out: readonly number[], n: number, id: number): boolean {
  for (let k = 0; k < n; k++) if (out[k] === id) return true;
  return false;
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
    if (has(out, n, d.id)) continue;
    out[n++] = d.id;
  }
  return n;
}

/** Glimmers a swipe from a to b passes over, as ids into `out` (those in `out[0..skip)` not repeated). */
export function motesOnSegment(s: TapScene, ax: number, ay: number, bx: number, by: number, out: number[], skip = 0): number {
  let n = skip;
  for (let i = 0; i < s.moteCount; i++) {
    const m = s.motes[i];
    if (segmentDist(m.x, m.y, ax, ay, bx, by) > s.motePx) continue;
    if (has(out, n, m.id)) continue;
    out[n++] = m.id;
  }
  return n;
}

/** Creatures one sweep remembers at once (more are still pulsed; the oldest memory is reused). */
const SWEEP_MEMORY = 32;

/**
 * The creatures one sweep has pulsed and when, so a finger that crosses a creature pulses it once, and again
 * only after `rehitS` (MECANICAS §3.1: «1 toque por criatura cada 0,3 s»). Fixed arrays: no allocation.
 */
export class SweepHits {
  private readonly ids = new Float64Array(SWEEP_MEMORY);
  private readonly at = new Float64Array(SWEEP_MEMORY);
  private n = 0;
  private head = 0;

  /** A new sweep (finger down). */
  reset(): void {
    this.n = 0;
    this.head = 0;
  }

  /**
   * Stable creatures the segment a→b crosses (outline + pad) that this sweep did not pulse in the last `rehitS`
   * seconds (`now` in s): their ids go into `out`, and the count is returned. They count as pulsed at `now`.
   */
  cross(s: TapScene, ax: number, ay: number, bx: number, by: number, now: number, rehitS: number, out: number[]): number {
    let k = 0;
    for (let i = 0; i < s.creatureCount; i++) {
      const c = s.creatures[i];
      if (c.state !== 'stable') continue;
      if (segmentDist(c.x, c.y, ax, ay, bx, by) > c.r + s.creaturePadPx) continue;
      const m = this.find(c.id);
      if (m >= 0) {
        if (now - this.at[m] < rehitS) continue;
        this.at[m] = now;
      } else this.remember(c.id, now);
      out[k++] = c.id;
    }
    return k;
  }

  private find(id: number): number {
    for (let i = 0; i < this.n; i++) if (this.ids[i] === id) return i;
    return -1;
  }

  private remember(id: number, now: number): void {
    let i: number;
    if (this.n < SWEEP_MEMORY) i = this.n++;
    else {
      i = this.head;
      this.head = (this.head + 1) % SWEEP_MEMORY;
    }
    this.ids[i] = id;
    this.at[i] = now;
  }
}
