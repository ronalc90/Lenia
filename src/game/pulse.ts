/**
 * The pulse (ADR-031, docs/MECANICAS.md §3, §5): a tap on a STABLE creature makes it flash and adds a share of
 * the dish's light; taps in a row build a **streak** that multiplies all the light that comes in while it
 * lasts; every CHISPAZO_EVERY-th hit is a ¡Chispazo! (×CHISPAZO_MULT) that throws glimmers to catch.
 *
 * Pure functions over one plain, serialisable object (it lives in SessionState.pulse). No DOM, no bus, no
 * randomness: the Chispazo is fixed (seen coming), the glimmers land on a fixed pattern. The pulse is drawing
 * plus economy: nothing here writes to the Lenia field. Only stable creatures pay (`P` = the dish's Luz/s
 * from stable creatures only: uniform soup has P = 0 and a pulse of 0 pays nothing, not even a hit).
 */
import * as C from './cycleBalance';

export interface Mote {
  id: number;
  /** Grid cells. */
  x: number;
  y: number;
  /** Seconds of dish since it was thrown, and how long it waits to be caught. */
  age: number;
  life: number;
  /** The creature that threw it (its colour), if any. */
  owner: number | null;
  /** One pulse when it was thrown: what it pays caught (× the streak) or settled (× MOTE_SETTLE_SHARE). */
  base: number;
}

export interface PulseState {
  v: 1;
  /** Hits in the streak now (0 … PulseFx.maxHits). */
  hits: number;
  /** Hits since this streak began (the Chispazo counter; back to 0 only when `hits` drains to 0). */
  k: number;
  /** Seconds of running dish since the last hit (frozen while paused). */
  idle: number;
  /** Fraction of a hit already drained. */
  drain: number;
  /** Real-time stamps (ms) of the hits counted in the last second (TAP_HITS_MAX_PER_S). */
  window: number[];
  /** Swipes: creature id → ms of the last time a swipe pulsed it (SWEEP_REHIT_S). */
  rehit: [number, number][];
  motes: Mote[];
  nextMote: number;
  /** Glimmers pushed out by MOTES_MAX, settled on the next settleMotes. */
  overflow: Mote[];
  // ── this session's finger, for the summary («Tu dedo: 74 toques · mejor racha ×1,25 · 4 Chispazos · +96 de luz») ──
  taps: number;
  best: number;
  chispazos: number;
  motesThrown: number;
  motesCaught: number;
  /** Luz the finger added: pulses, Chispazos, glimmers and what the streak added to drops and the Spark. */
  finger: number;
}

/** What the tree (✦ Pulso) and the session give the pulse. */
export interface PulseFx {
  /** Pulso: the pulse ×this. */
  mult: number;
  /** Racha larga: hits the streak can hold. */
  maxHits: number;
  /** Chispazo seguido: every N-th hit is a Chispazo. */
  every: number;
  /** A Chispazo throws glimmers (from MOTES_FROM_SESSION). */
  motes: boolean;
}

export type HitKind = 'pulse' | 'drop';

export interface HitResult {
  /** It counted (under the rate cap): the streak grew. */
  counted: boolean;
  /** Luz of the pulse (or of a drop hit's Chispazo), streak included. The drop itself is the caller's. */
  amount: number;
  chispazo: boolean;
  /** The streak multiplier this hit was paid with. */
  mult: number;
}

export interface SettledMote {
  id: number;
  x: number;
  y: number;
  owner: number | null;
  amount: number;
}

export function freshPulse(): PulseState {
  return { v: 1, hits: 0, k: 0, idle: 0, drain: 0, window: [], rehit: [], motes: [], nextMote: 1, overflow: [], taps: 0, best: 0, chispazos: 0, motesThrown: 0, motesCaught: 0, finger: 0 };
}

const at = <T>(xs: readonly T[], i: number): T => xs[Math.max(0, Math.min(xs.length - 1, Math.floor(i) || 0))];

/** The pulse effects from the tree's values (TreeEffects.pulseMult / streakHits / chispazoEvery) and the session number. */
export function pulseFx(t: { pulseMult: number; streakHits: number; chispazoEvery: number }, session: number): PulseFx {
  return { mult: t.pulseMult, maxHits: t.streakHits, every: Math.max(1, Math.round(t.chispazoEvery)), motes: session >= C.MOTES_FROM_SESSION };
}

/** The same from node levels (tests, the bot's model). */
export function pulseFxOf(levels: Partial<Record<'pulse' | 'streakLong' | 'chispazoOften', number>>, session: number): PulseFx {
  return pulseFx(
    {
      pulseMult: at(C.PULSE_MULT_BY_LEVEL, levels.pulse ?? 0),
      streakHits: at(C.STREAK_HITS_BY_LEVEL, levels.streakLong ?? 0),
      chispazoEvery: at(C.CHISPAZO_EVERY_BY_LEVEL, levels.chispazoOften ?? 0),
    },
    session,
  );
}

/** ×(1 + STREAK_STEP · hits): what all the Luz that comes in is worth right now. */
export function streakMult(st: PulseState): number {
  return 1 + C.STREAK_STEP * st.hits;
}

/** One pulse at dish light `P` (Luz/s of stable creatures): PULSE_MULT · max(PULSE_MIN, PULSE_SECONDS · P); 0 when P ≤ 0. */
export function pulseBase(P: number, fx: PulseFx): number {
  if (!(P > 0) || !Number.isFinite(P)) return 0;
  return fx.mult * Math.max(C.PULSE_MIN, C.PULSE_SECONDS * P);
}

/** The streak as GameView.streak shows it. */
export function streakView(st: PulseState, fx: PulseFx): { hits: number; max: number; mult: number; toChispazo: number; every: number; draining: boolean } {
  return { hits: st.hits, max: fx.maxHits, mult: streakMult(st), toChispazo: fx.every - (st.k % fx.every), every: fx.every, draining: st.hits > 0 && st.idle > C.STREAK_GRACE_S };
}

/** Room in the 1 s window for one more counted hit (stamps older than a second are dropped). */
function roomNow(st: PulseState, nowMs: number): boolean {
  while (st.window.length && !(nowMs - st.window[0] < 1000)) st.window.shift();
  // A clock that went back (a save from another device): start the window again.
  if (st.window.length && st.window[st.window.length - 1] > nowMs + 1000) st.window.length = 0;
  return st.window.length < C.TAP_HITS_MAX_PER_S;
}

function grow(st: PulseState, n: number, fx: PulseFx): void {
  st.hits = Math.min(fx.maxHits, st.hits + n);
  st.idle = 0;
  st.drain = 0;
  st.best = Math.max(st.best, st.hits);
}

/** Glimmers of a Chispazo at `p` (fixed pattern turned by the streak's count; `place` keeps them inside the glass). */
function throwMotes(st: PulseState, p: { x: number; y: number; owner: number | null }, base: number, R: number, place?: (x: number, y: number) => { x: number; y: number }): void {
  const n = C.CHISPAZO_MOTES;
  const [r0, r1] = C.MOTE_SPREAD_R;
  const turn = (st.k * 0.61803398875) % 1;
  for (let i = 0; i < n; i++) {
    const a = 2 * Math.PI * (i / n + turn);
    const r = R * (r0 + (r1 - r0) * ((i * 0.381966 + turn) % 1));
    let x = p.x + Math.cos(a) * r;
    let y = p.y + Math.sin(a) * r;
    if (place) ({ x, y } = place(x, y));
    st.motes.push({ id: st.nextMote++, x, y, age: 0, life: C.MOTE_LIFE_S, owner: p.owner, base });
    st.motesThrown++;
  }
  while (st.motes.length > C.MOTES_MAX) st.overflow.push(st.motes.shift()!);
}

/**
 * One hit of the finger. 'pulse': a tap on a stable creature (nothing at all when P ≤ 0: only the stable pay);
 * it pays one pulse × the streak (CHISPAZO_MULT of them on a Chispazo). 'drop': a tap that collected a drop (its
 * light is the caller's, × `mult`); it pays only a Chispazo's pulses. Over TAP_HITS_MAX_PER_S hits a second the hit
 * does not count and pays nothing (`counted` false). Returns null for a pulse on an empty dish.
 */
export function registerHit(
  st: PulseState,
  o: { kind: HitKind; P: number; fx: PulseFx; nowMs: number; at: { x: number; y: number; owner: number | null }; R: number; place?: (x: number, y: number) => { x: number; y: number } },
): HitResult | null {
  const base = pulseBase(o.P, o.fx);
  if (o.kind === 'pulse' && !(base > 0)) return null;
  const mult = streakMult(st);
  if (!roomNow(st, o.nowMs)) return { counted: false, amount: 0, chispazo: false, mult };
  st.window.push(o.nowMs);
  st.k++;
  const chispazo = st.k % o.fx.every === 0;
  const pulses = chispazo ? C.CHISPAZO_MULT : o.kind === 'pulse' ? 1 : 0;
  const amount = base * mult * pulses;
  st.taps++;
  if (chispazo) {
    st.chispazos++;
    if (o.fx.motes && base > 0) throwMotes(st, o.at, base, o.R, o.place);
  }
  grow(st, 1, o.fx);
  st.finger += amount;
  return { counted: true, amount, chispazo, mult };
}

/** A swipe crossed creature `id` at `nowMs`: false while SWEEP_REHIT_S has not passed since it last pulsed it. */
export function swipeMayHit(st: PulseState, id: number, nowMs: number): boolean {
  st.rehit = st.rehit.filter(([, t]) => nowMs - t < C.SWEEP_REHIT_S * 1000 && t <= nowMs + 1000);
  if (st.rehit.some(([i]) => i === id)) return false;
  st.rehit.push([id, nowMs]);
  return true;
}

/** Spark caught, swimmer saved: +n hits to the streak (not to the Chispazo count). */
export function addBonusHits(st: PulseState, n: number, fx: PulseFx): void {
  if (n > 0) grow(st, n, fx);
}

/**
 * Catch glimmer `id`: one pulse (its base) × the streak, and one more hit when the rate cap allows (it may be a
 * Chispazo of its own). Null when it is gone. The light is paid even over the cap: what shines is never taken away.
 */
export function catchMote(
  st: PulseState,
  id: number,
  nowMs: number,
  fx: PulseFx,
  R = 0,
  place?: (x: number, y: number) => { x: number; y: number },
): { amount: number; chispazo: boolean; x: number; y: number; owner: number | null } | null {
  const i = st.motes.findIndex((m) => m.id === id);
  if (i < 0) return null;
  const m = st.motes[i];
  st.motes.splice(i, 1);
  const mult = streakMult(st);
  let amount = m.base * mult;
  let chispazo = false;
  if (roomNow(st, nowMs)) {
    st.window.push(nowMs);
    st.k++;
    st.taps++;
    chispazo = st.k % fx.every === 0;
    if (chispazo) {
      st.chispazos++;
      amount += m.base * mult * C.CHISPAZO_MULT;
      if (fx.motes) throwMotes(st, m, m.base, R, place);
    }
    grow(st, 1, fx);
  }
  st.motesCaught++;
  st.finger += amount;
  return { amount, chispazo, x: m.x, y: m.y, owner: m.owner };
}

/** Age the glimmers by `dt` s of running dish; the ones whose time is up settle (and any pushed out by MOTES_MAX). */
export function settleMotes(st: PulseState, dt: number): SettledMote[] {
  const out: SettledMote[] = st.overflow.map((m) => ({ id: m.id, x: m.x, y: m.y, owner: m.owner, amount: m.base * C.MOTE_SETTLE_SHARE }));
  st.overflow = [];
  if (dt > 0) for (const m of st.motes) m.age += dt;
  const keep: Mote[] = [];
  for (const m of st.motes) {
    if (m.age >= m.life) out.push({ id: m.id, x: m.x, y: m.y, owner: m.owner, amount: m.base * C.MOTE_SETTLE_SHARE });
    else keep.push(m);
  }
  st.motes = keep;
  return out;
}

/**
 * The streak between hits: nothing while paused; after STREAK_GRACE_S without a hit it loses
 * STREAK_DRAIN_PER_S hits a second, one at a time (never a reset at once). Empty, its Chispazo count restarts.
 */
export function tickStreak(st: PulseState, dt: number, paused = false): void {
  if (paused || !(dt > 0)) return;
  const before = st.idle;
  st.idle += dt;
  if (st.hits <= 0 || st.idle <= C.STREAK_GRACE_S) return;
  const over = st.idle - Math.max(before, C.STREAK_GRACE_S);
  st.drain += over * C.STREAK_DRAIN_PER_S;
  while (st.drain >= 1 && st.hits > 0) {
    st.hits--;
    st.drain -= 1;
  }
  if (st.hits <= 0) {
    st.hits = 0;
    st.k = 0;
    st.drain = 0;
  }
}

/** The streak's extra on light that comes in (a drop by hand or pipette, the Spark): amount × (mult − 1). */
export function streakExtra(st: PulseState | null | undefined, amount: number): number {
  if (!st || !(amount > 0) || st.hits <= 0) return 0;
  return amount * (streakMult(st) - 1);
}

/** Lenient validation of a stored PulseState (anything damaged: a fresh one). Glimmers and the window are kept only when sane. */
export function validatePulse(x: unknown): PulseState {
  const d = freshPulse();
  if (!x || typeof x !== 'object') return d;
  const o = x as Record<string, unknown>;
  const num = (v: unknown, min = 0, max = Number.MAX_VALUE): number => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : 0);
  const int = (v: unknown, max = 1e9): number => Math.floor(num(v, 0, max));
  const motes: Mote[] = Array.isArray(o.motes)
    ? o.motes
        .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
        .slice(0, C.MOTES_MAX)
        .map((m, i) => ({ id: int(m.id) || i + 1, x: num(m.x, -1e6, 1e6), y: num(m.y, -1e6, 1e6), age: num(m.age, 0, 1e3), life: num(m.life, 0, 1e3) || C.MOTE_LIFE_S, owner: typeof m.owner === 'number' && Number.isFinite(m.owner) ? m.owner : null, base: num(m.base) }))
        .filter((m) => m.base > 0)
    : [];
  return {
    ...d,
    hits: int(o.hits, 1000),
    k: int(o.k),
    idle: num(o.idle, 0, 1e6),
    drain: num(o.drain, 0, 1),
    motes,
    nextMote: Math.max(int(o.nextMote) || 1, ...motes.map((m) => m.id + 1), 1),
    taps: int(o.taps),
    best: int(o.best, 1000),
    chispazos: int(o.chispazos),
    motesThrown: int(o.motesThrown),
    motesCaught: int(o.motesCaught),
    finger: num(o.finger),
  };
}
