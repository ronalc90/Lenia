/**
 * Collected light (ADR-030, docs/CLARIDAD2.md §2.2): the Luz a creature makes does not drop into the
 * wallet by itself any more. Every STABLE creature fills its own drop with its production; the drop holds
 * at most `capSeconds` of it and then waits (the creature stops filling it, nothing made is taken away).
 * A tap or a swipe collects, the pipettes of the ↓ Recoger route collect on their own, and whatever is left
 * is swept at "¡Tiempo!" and when a session is restored. Light made is never lost.
 *
 * Pure functions over one plain, serialisable object (it lives in SessionState.light, so a save made
 * mid-run keeps its drops and sweeps them on load). No DOM, no bus, no randomness: the game turns the
 * returned pickups into bus events and wallet money.
 *
 * Only stable creatures fill a drop: the caller passes the paying creatures (economy.computeProduction
 * pays nothing else), so uniform soup, forming seeds, blobs and mazes have no drop.
 */
import * as C from './cycleBalance';

export interface LightDrop {
  id: number;
  /** The creature filling it; null once it went dark, merged or was wiped (the drop stays, loose). */
  owner: number | null;
  /** Grid cells (the owner's centroid at the last report; where it was, once loose). */
  x: number;
  y: number;
  /** Luz in it. */
  amount: number;
  /** Luz it holds when full: capSeconds × its owner's production (frozen once loose). */
  cap: number;
}

export interface PipetteState {
  id: number;
  /** Resting place, 0..1 around the rim, clockwise from the top. */
  dock: number;
  /** Drop it is going for (null = resting at its dock, or on its way back without one). */
  target: number | null;
  /** Seconds into the current trip (0 = at the dock; the drop is taken at half the trip). */
  t: number;
  /** The drop was taken on this trip (it is on its way back). */
  took: boolean;
}

export interface CollectState {
  v: 1;
  next: number;
  drops: LightDrop[];
  pipettes: PipetteState[];
  /** Luz collected this session, by who collected it (summary, bot). */
  hand: number;
  pipette: number;
  sweep: number;
  /** Luz a full drop could not take (production that waited: the bot's "capped" share). */
  capped: number;
  /** Luz the drops took this session (= hand + pipette + sweep + what still waits). */
  made: number;
  /** Luz that came in without a drop (Spark, Encargos, first steps): straight to the wallet. */
  gifts: number;
}

/** What the tree (↓ Recoger) and the settings give the collectors. */
export interface CollectFx {
  /** Seconds of production a drop holds (Gotas grandes). */
  capSeconds: number;
  /** Pipettes on the rim (Pipeta, Más pipetas; at least 1 with "Recoger la luz sola"). */
  pipettes: number;
  /** Seconds of one trip (Pipetas rápidas). */
  cycle: number;
  /** Pipeta maestra: a drop is taken the moment it reaches PIPETTE_MIN_SHARE, no trip. */
  instant: boolean;
  /** Pipetas con imán: a trip also takes every drop within this many cells of its target. */
  magnetCells: number;
}

/** A collection, for the bus ('lightCollected') and the flying "+N". */
export interface Pickup {
  dropId: number;
  x: number;
  y: number;
  amount: number;
  by: 'hand' | 'pipette' | 'sweep';
}

export function freshCollect(): CollectState {
  return { v: 1, next: 1, drops: [], pipettes: [], hand: 0, pipette: 0, sweep: 0, capped: 0, made: 0, gifts: 0 };
}

/** 0..1 of a drop's cap. A drop with no cap yet (its owner pays nothing) reads full when it holds anything. */
export function dropFill(d: LightDrop): number {
  if (!(d.cap > 0)) return d.amount > 0 ? 1 : 0;
  return Math.min(1, d.amount / d.cap);
}

/**
 * One economic tick: every paying creature pours `rate × dt` into its own drop (one is made on its first
 * tick), up to the cap; what does not fit waits as `capped` (it was never made, so it never counted).
 * Returns the Luz made this tick (what counts for the Datos).
 */
export function fillDrops(st: CollectState, paying: readonly { id: number; x: number; y: number; rate: number }[], dt: number, capSeconds: number): number {
  if (!(dt > 0)) return 0;
  let made = 0;
  for (const c of paying) {
    if (!(c.rate > 0) || !Number.isFinite(c.rate)) continue;
    let d = st.drops.find((x) => x.owner === c.id);
    if (!d) {
      d = { id: st.next++, owner: c.id, x: c.x, y: c.y, amount: 0, cap: 0 };
      st.drops.push(d);
    }
    d.x = c.x;
    d.y = c.y;
    d.cap = c.rate * capSeconds;
    const want = c.rate * dt;
    // A cap that shrank (the Sprint ended) never takes back what is already in the drop.
    const add = Math.max(0, Math.min(want, d.cap - d.amount));
    d.amount += add;
    made += add;
    st.made += add;
    st.capped += want - add;
  }
  return made;
}

/**
 * The creatures of the latest report: a drop whose owner is no longer a stable creature goes loose where
 * it was (its light stays on the dish); empty loose drops vanish. If the dish holds more than
 * LIGHT_DROPS_MAX drops, the oldest loose ones are swept (into the wallet: still never lost).
 */
export function releaseDrops(st: CollectState, stableIds: ReadonlySet<number>): Pickup[] {
  for (const d of st.drops) if (d.owner !== null && !stableIds.has(d.owner)) d.owner = null;
  st.drops = st.drops.filter((d) => d.owner !== null || d.amount > 0);
  const out: Pickup[] = [];
  while (st.drops.length > C.LIGHT_DROPS_MAX) {
    const i = st.drops.findIndex((d) => d.owner === null);
    if (i < 0) break;
    out.push(take(st, st.drops[i], 'sweep'));
  }
  return out;
}

function take(st: CollectState, d: LightDrop, by: Pickup['by']): Pickup {
  st.drops = st.drops.filter((x) => x !== d);
  const amount = d.amount;
  st[by] += amount;
  // A pipette heading for it turns back and chooses again on its next tick.
  for (const p of st.pipettes) if (p.target === d.id) p.target = null;
  return { dropId: d.id, x: d.x, y: d.y, amount, by };
}

/** Collect one drop (a tap on it, full or not: tapping early is never worse). */
export function collectDrop(st: CollectState, dropId: number, by: Pickup['by'] = 'hand'): Pickup | null {
  const d = st.drops.find((x) => x.id === dropId);
  return d && d.amount > 0 ? take(st, d, by) : null;
}

type Dist = (ax: number, ay: number, bx: number, by: number) => number;
const euclid: Dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/**
 * A tap at a grid point: every drop within `r` cells, and the drop of every creature whose body (radius
 * from `bodies`) the point is on. `bodies` maps a creature id to its centroid and radius.
 */
export function collectAt(
  st: CollectState,
  x: number,
  y: number,
  r: number,
  bodies: ReadonlyMap<number, { x: number; y: number; r: number }> = new Map(),
  dist: Dist = euclid,
): Pickup[] {
  return collectWhere(st, (d) => {
    if (dist(d.x, d.y, x, y) <= r) return true;
    const b = d.owner !== null ? bodies.get(d.owner) : undefined;
    return !!b && dist(b.x, b.y, x, y) <= b.r + r / 2;
  });
}

/** Distance from point p to segment ab (straight; a swipe never wraps). */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0;
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/** A swipe: every drop the finger passes within `r` cells of (or over its creature's body). */
export function collectPath(
  st: CollectState,
  pts: readonly { x: number; y: number }[],
  r: number,
  bodies: ReadonlyMap<number, { x: number; y: number; r: number }> = new Map(),
): Pickup[] {
  const ok = pts.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!ok.length) return [];
  const near = (x: number, y: number, rr: number): boolean => {
    if (ok.length === 1) return Math.hypot(x - ok[0].x, y - ok[0].y) <= rr;
    for (let i = 1; i < ok.length; i++) if (segDist(x, y, ok[i - 1].x, ok[i - 1].y, ok[i].x, ok[i].y) <= rr) return true;
    return false;
  };
  return collectWhere(st, (d) => {
    if (near(d.x, d.y, r)) return true;
    const b = d.owner !== null ? bodies.get(d.owner) : undefined;
    return !!b && near(b.x, b.y, b.r + r / 2);
  });
}

function collectWhere(st: CollectState, hit: (d: LightDrop) => boolean): Pickup[] {
  const out: Pickup[] = [];
  for (const d of [...st.drops]) if (d.amount > 0 && hit(d)) out.push(take(st, d, 'hand'));
  return out;
}

/**
 * (ADR-031) Light made away from a creature's own filling — a glimmer nobody caught, a death's last light: a loose
 * drop where it is (`owner` null), or added to the drop of `owner` when it has one (it goes loose with it). It
 * counts as made. Returns the drop.
 */
export function addLight(st: CollectState, x: number, y: number, amount: number, owner: number | null = null): LightDrop | null {
  if (!(amount > 0) || !Number.isFinite(amount)) return null;
  let d = owner !== null ? st.drops.find((q) => q.owner === owner) : undefined;
  if (!d) {
    d = { id: st.next++, owner: null, x, y, amount: 0, cap: 0 };
    st.drops.push(d);
  }
  d.amount += amount;
  d.cap = Math.max(d.cap, d.amount);
  st.made += amount;
  return d;
}

/** "¡Tiempo!", or a session restored from a save: every drop left flies to the wallet. */
export function sweepAll(st: CollectState): Pickup[] {
  const out: Pickup[] = [];
  for (const d of [...st.drops]) if (d.amount > 0) out.push(take(st, d, 'sweep'));
  st.drops = [];
  return out;
}

/** Keep the pipettes on the rim at the count the tree gives (docks spread evenly; trips kept). */
export function setPipettes(st: CollectState, n: number): void {
  const want = Math.max(0, Math.floor(n));
  while (st.pipettes.length > want) st.pipettes.pop();
  while (st.pipettes.length < want) st.pipettes.push({ id: st.pipettes.length + 1, dock: 0, target: null, t: 0, took: false });
  st.pipettes.forEach((p, i) => (p.dock = (i + 0.5) / want));
}

/** The ripest drop at least PIPETTE_MIN_SHARE full that no other pipette is going for (ties: the older drop). */
function pickTarget(st: CollectState): LightDrop | null {
  const taken = new Set(st.pipettes.map((p) => p.target).filter((x): x is number => x !== null));
  let best: LightDrop | null = null;
  for (const d of st.drops) {
    if (taken.has(d.id) || d.amount <= 0 || dropFill(d) < C.PIPETTE_MIN_SHARE) continue;
    if (!best || dropFill(d) > dropFill(best)) best = d;
  }
  return best;
}

/**
 * Advance the pipettes by `dt` seconds of running dish. Each one leaves its dock for the ripest free drop
 * (≥ PIPETTE_MIN_SHARE), takes it at half its trip (with the magnet, every drop near it too) and comes
 * back; a drop collected by hand meanwhile sends it to another one. Pipeta maestra takes every drop the
 * moment it reaches the share. Deterministic: the order of drops and pipettes decides every tie.
 */
export function tickPipettes(state: CollectState, fx: CollectFx, dt: number, dist: Dist = euclid): Pickup[] {
  setPipettes(state, fx.pipettes);
  const out: Pickup[] = [];
  if (!(dt > 0) || !state.pipettes.length) return out;
  if (fx.instant) {
    for (const d of [...state.drops]) if (d.amount > 0 && dropFill(d) >= C.PIPETTE_MIN_SHARE) out.push(take(state, d, 'pipette'));
    for (const p of state.pipettes) {
      p.target = null;
      p.t = 0;
      p.took = false;
    }
    return out;
  }
  const cycle = Math.max(0.1, fx.cycle);
  const half = cycle / 2;
  for (const p of state.pipettes) {
    if (p.target === null && !p.took) {
      if (p.t > 0) {
        // On its way out, its drop gone: choose again, or head back.
        const d = pickTarget(state);
        if (d) p.target = d.id;
        else {
          p.t = Math.max(0, p.t - dt);
          continue;
        }
      } else {
        const d = pickTarget(state);
        if (!d) continue; // rests at its dock
        p.target = d.id;
      }
    }
    p.t += dt;
    if (!p.took && p.t >= half && p.target !== null) {
      const d = state.drops.find((x) => x.id === p.target);
      p.took = true;
      p.target = null;
      if (d) {
        const at = { x: d.x, y: d.y };
        out.push(take(state, d, 'pipette'));
        if (fx.magnetCells > 0)
          for (const o of [...state.drops]) if (o.amount > 0 && dist(o.x, o.y, at.x, at.y) <= fx.magnetCells) out.push(take(state, o, 'pipette'));
      }
    }
    if (p.t >= cycle) {
      p.t = 0;
      p.took = false;
      p.target = null;
    }
  }
  return out;
}

/** Lenient validation of a stored CollectState (anything damaged: an empty one). */
export function validateCollect(x: unknown): CollectState {
  const d = freshCollect();
  if (!x || typeof x !== 'object') return d;
  const o = x as Record<string, unknown>;
  const num = (v: unknown, min = 0): number => (typeof v === 'number' && Number.isFinite(v) && v >= min ? v : 0);
  const drops: LightDrop[] = Array.isArray(o.drops)
    ? o.drops
        .filter((q): q is Record<string, unknown> => !!q && typeof q === 'object')
        .slice(0, C.LIGHT_DROPS_MAX)
        .map((q, i) => ({ id: Math.floor(num(q.id, 1)) || i + 1, owner: null, x: num(q.x, -1e6), y: num(q.y, -1e6), amount: num(q.amount), cap: num(q.cap) }))
        .filter((q) => q.amount > 0)
    : [];
  const next = Math.max(Math.floor(num(o.next, 1)), ...drops.map((q) => q.id + 1), 1);
  return { v: 1, next, drops, pipettes: [], hand: num(o.hand), pipette: num(o.pipette), sweep: num(o.sweep), capped: num(o.capped), made: num(o.made), gifts: num(o.gifts) };
}
