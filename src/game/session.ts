/**
 * Lab sessions (docs/CICLO.md §2–3): "a student with lab time". Each session is a short timed run on
 * a fresh dish; creatures earn Esencia (spent on seeds during the session); when the clock runs out
 * the Esencia earned becomes Datos, the permanent currency of the research tree.
 *
 * Pure functions over two plain, serialisable objects (no DOM, no bus, no timers):
 *  - ResearchState  what persists between sessions: Datos, tree levels, sessions done, records, the
 *                   Nevera (species to re-plant), a short history (for "unas N sesiones").
 *  - SessionState   the session being played: clock, Esencia earned, species seen, peaks…
 *
 * The game owns both (state.ts in Phase 2), feeds the note*() hooks from its own events, calls
 * tickSession() every frame while the dish runs and summarize() + applySummary() when the clock
 * says 'timesUp'. Every function returns events the UI/audio can react to.
 */
import type { Behavior, Text } from '../core/types';
import * as C from './cycleBalance';
import { TREE_BY_ID, buyNode, nextGoal, nightInfo, nodeLevel, treeEffects, type BuyResult, type TreeCtx, type TreeEffects } from './tree';
import { VELA_LINES } from './treeText';
import { BASE_WORLD, isWorldId, type WorldId } from './worlds';

// ───────────────────────────── types ───────────────────────────────

export type RecordKind = 'essence' | 'eps' | 'creatures' | 'species';

export interface ResearchRecords {
  /** Most Esencia earned in one session. */
  essence: number;
  /** Highest Esencia/s reached. */
  eps: number;
  /** Most stable creatures at once. */
  creatures: number;
  /** Most distinct species seen in one session. */
  species: number;
}

/** One finished session, kept for estimates ("unas N sesiones") and a progress graph. */
export interface SessionLog {
  n: number;
  seconds: number;
  essence: number;
  datos: number;
  species: number;
}

export interface ResearchState {
  v: 1;
  /** Unspent Datos. */
  datos: number;
  /** Datos ever earned. */
  datosEarned: number;
  /** Tree levels by node id (tree.ts); the centre 'lab' is the night. */
  levels: Record<string, number>;
  /** Sessions finished. */
  sessions: number;
  /** Esencia earned this night, over all its sessions (story/Encargos "esta noche"). */
  nightEssence: number;
  records: ResearchRecords;
  /** Species re-planted at the start of the next session (Nevera). */
  fridge: string[];
  /** Nodes bought since the last session started ("Nuevo desde la última vez"). */
  fresh: string[];
  history: SessionLog[];
  /** World picked for the next session (start card); a newly opened world is picked for you. */
  world: WorldId;
}

export type SessionPhase = 'ready' | 'running' | 'over';

export interface SessionState {
  v: 1;
  /** 1-based session number. */
  n: number;
  /** The world (rules preset) of this session's dish. */
  world: WorldId;
  phase: SessionPhase;
  /** Seconds the session was given when it started (TreeEffects.sessionSeconds). */
  limit: number;
  /** Seconds added during the session (species, Encargos, Sparks). */
  bonus: number;
  /** Seconds of clock already run. */
  elapsed: number;
  /** Esencia earned (spent or not): what becomes Datos. */
  essence: number;
  /** Esencia spent (seeds, copies, Abono). */
  spent: number;
  seeds: number;
  /** Seeds paid with Esencia this session (each makes the next ×SEED_PRICE_STEP). */
  bought: number;
  /** Abonos bought this session (production ×BOOST_MULT each). */
  boosts: number;
  /** Ended with "Terminar ahora" before the clock ran out (no minimum top-up). */
  endedEarly: boolean;
  peakEps: number;
  peakCreatures: number;
  /** Distinct species seen (stable members) this session. */
  species: string[];
  /** Species registered for the first time ever this session. */
  newSpecies: string[];
  /** Look-alike forms (variants, species/looks) seen for the first time ever this session. */
  newVariants?: string[];
  /** Behaviours seen for the first time ever this session. */
  newBehaviors: Behavior[];
  encargos: number;
  goldens: number;
  /** The best-paying creature of the session. */
  best: { speciesId: string | null; eps: number } | null;
  /** Any creature stable this session (pity seed). */
  hadStable: boolean;
  /** Species to keep in the Nevera (set by the game when the clock runs out, best first). */
  keep: string[];
  /** One-shot warnings already announced. */
  warned: { minute: boolean; last: boolean; sprint: boolean };
  /** Last countdown second announced (countdownSeconds … 1), 0 = none yet. */
  countdown: number;
}

export type SessionEvent =
  | { type: 'clockStart' }
  | { type: 'lastMinute' }
  /** The clock turns amber (warnSeconds(total) left). */
  | { type: 'warn' }
  | { type: 'countdown'; seconds: number }
  | { type: 'sprint' }
  | { type: 'extended'; seconds: number; reason: 'species' | 'encargo' | 'golden' }
  | { type: 'timesUp' };

// ───────────────────────────── research state ──────────────────────

export function freshResearch(): ResearchState {
  return {
    v: 1,
    datos: 0,
    datosEarned: 0,
    levels: { lab: 1 },
    sessions: 0,
    nightEssence: 0,
    records: { essence: 0, eps: 0, creatures: 0, species: 0 },
    fridge: [],
    fresh: [],
    history: [],
    world: BASE_WORLD,
  };
}

/** The tree context of a research state (species = Bestiary size, from the game). */
export function treeCtxOf(r: ResearchState, species: number): TreeCtx {
  return { levels: r.levels, datos: r.datos, sessions: r.sessions, species };
}

/**
 * Buy one level of a tree node. Pure: returns a new research state (unchanged when the purchase is
 * refused). Buying the centre starts a new night: the night's Esencia counter restarts. Opening a
 * world picks it for the next session (the start card can still switch back).
 */
export function researchBuy(r: ResearchState, id: string, species: number): { state: ResearchState; result: BuyResult } {
  const result = buyNode(treeCtxOf(r, species), id);
  if (!result.ok) return { state: r, result };
  const opened = TREE_BY_ID[id]?.world;
  const state: ResearchState = {
    ...r,
    levels: result.levels,
    datos: result.datos,
    fresh: r.fresh.includes(id) ? r.fresh : [...r.fresh, id],
    nightEssence: id === 'lab' ? 0 : r.nightEssence,
    world: opened ?? r.world,
  };
  return { state, result };
}

/** Worlds the start card offers (unlocked, in order). */
export function unlockedWorlds(r: ResearchState): WorldId[] {
  return treeEffects(r.levels).worlds;
}

/** The start card's world picker. Ignores worlds that are not open yet. */
export function researchPickWorld(r: ResearchState, world: WorldId): ResearchState {
  return unlockedWorlds(r).includes(world) ? { ...r, world } : r;
}

/** Story/Encargos: the night the player is in (story `era`). */
export function researchNight(r: ResearchState): number {
  return nodeLevel(r.levels, 'lab');
}

/** Story: a new night is ready (gate met) — replaces the old "Extinction available". */
export function nightReady(r: ResearchState, species: number): boolean {
  return nightInfo(treeCtxOf(r, species)).ready;
}

// ───────────────────────────── session lifecycle ───────────────────

/** What the start card shows. */
export interface SessionStart {
  n: number;
  /** World of this session and every world the player can pick. */
  world: WorldId;
  worlds: WorldId[];
  seconds: number;
  startEssence: number;
  freeSeeds: number;
  /** Species re-planted from the Nevera (at most TreeEffects.fridge; only those that live in `world`). */
  fridge: string[];
  /**
   * Creatures the Nevera plants alive at the start (TreeEffects.fridge): first the kept species of
   * `fridge` that live in this world, then pure seeds of this world's species for the rest — so a
   * brand-new world never starts poorer than the last one (owner: always more).
   */
  fridgeSlots: number;
  /** Nodes bought since the last session. */
  fresh: string[];
}

/**
 * Begin the next session: a fresh SessionState (clock waiting for the first seed), the start-card
 * info, and the research state with its "fresh" list consumed.
 */
export function beginSession(r: ResearchState, fx: TreeEffects): { research: ResearchState; session: SessionState; start: SessionStart } {
  const n = r.sessions + 1;
  const world = fx.worlds.includes(r.world) ? r.world : BASE_WORLD;
  const session: SessionState = {
    v: 1,
    n,
    world,
    phase: 'ready',
    limit: Math.max(1, fx.sessionSeconds),
    bonus: 0,
    elapsed: 0,
    essence: 0,
    spent: 0,
    seeds: 0,
    bought: 0,
    boosts: 0,
    endedEarly: false,
    peakEps: 0,
    peakCreatures: 0,
    species: [],
    newSpecies: [],
    newVariants: [],
    newBehaviors: [],
    encargos: 0,
    goldens: 0,
    best: null,
    hadStable: false,
    keep: [],
    warned: { minute: false, last: false, sprint: false },
    countdown: 0,
  };
  const start: SessionStart = {
    n,
    world,
    worlds: [...fx.worlds],
    seconds: session.limit,
    startEssence: fx.startEssence,
    freeSeeds: fx.freeSeeds,
    fridge: r.fridge.slice(0, fx.fridge),
    fridgeSlots: fx.fridge,
    fresh: [...r.fresh],
  };
  return { research: { ...r, fresh: [] }, session, start };
}

/** Seconds left on the clock (never negative). */
export function sessionRemaining(s: SessionState): number {
  return Math.max(0, s.limit + s.bonus - s.elapsed);
}

/** Seconds the session has in all (limit + bonus). */
export function sessionTotal(s: Pick<SessionState, 'limit' | 'bonus'>): number {
  return Math.max(0, s.limit + s.bonus);
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/**
 * Amber warning: the last quarter of a session, 4–30 s (docs/RITMO.md §3.4). The HUD uses the same
 * numbers (`remaining <= warnSeconds(total)`), never a fixed 30 s that would paint a 15 s run amber.
 */
export function warnSeconds(total: number): number {
  return clamp(total * C.SESSION_WARN_SHARE, C.SESSION_WARN_MIN, C.SESSION_WARN_SECONDS);
}

/** Ticking countdown: the last third of a session, 3–10 s, whole seconds. */
export function countdownSeconds(total: number): number {
  return Math.round(clamp(total * C.SESSION_COUNTDOWN_SHARE, C.SESSION_COUNTDOWN_MIN, C.SESSION_COUNTDOWN));
}

/** Recta final window: the last quarter of a session, at most SPRINT_SECONDS. */
export function sprintSeconds(total: number): number {
  return Math.min(C.SPRINT_SECONDS, total * C.SPRINT_SHARE);
}

/** 0..1 of the clock used (for the ring around the timer). */
export function sessionProgress(s: SessionState): number {
  const total = s.limit + s.bonus;
  return total > 0 ? Math.min(1, s.elapsed / total) : 1;
}

/** The clock starts with the first seed ("El reloj empieza con tu primera gota"). */
export function startClock(s: SessionState): SessionEvent[] {
  if (s.phase !== 'ready') return [];
  s.phase = 'running';
  return [{ type: 'clockStart' }];
}

/**
 * Advance the clock by `dt` real seconds. It only runs while the session is running and the dish is
 * not paused (player pause, an explainer card, a story dialogue, the tree…: the caller decides).
 */
export function tickSession(s: SessionState, dt: number, fx: TreeEffects, opts: { paused?: boolean } = {}): SessionEvent[] {
  if (s.phase !== 'running' || opts.paused || !(dt > 0)) return [];
  const ev: SessionEvent[] = [];
  s.elapsed += Math.min(dt, 5);
  const left = sessionRemaining(s);
  const total = sessionTotal(s);
  if (!s.warned.minute && left <= C.SESSION_LAST_MINUTE && total > C.SESSION_LAST_MINUTE + 5) {
    s.warned.minute = true;
    ev.push({ type: 'lastMinute' });
  }
  if (!s.warned.last && left <= warnSeconds(total)) {
    s.warned.last = true;
    ev.push({ type: 'warn' });
  }
  if (!s.warned.sprint && fx.sprintMult > 1 && left <= sprintSeconds(total)) {
    s.warned.sprint = true;
    ev.push({ type: 'sprint' });
  }
  const count = countdownSeconds(total);
  if (left > 0 && left <= count) {
    const sec = Math.ceil(left);
    if (s.countdown === 0 || sec < s.countdown) {
      s.countdown = sec;
      ev.push({ type: 'countdown', seconds: sec });
    }
  } else if (left > count) s.countdown = 0; // extended back out of the countdown
  if (left <= 0) {
    s.phase = 'over';
    ev.push({ type: 'timesUp' });
  }
  return ev;
}

/** End the session now (time is up, or the player chose "Terminar ahora"). */
export function endSession(s: SessionState): SessionEvent[] {
  if (s.phase === 'over') return [];
  if (sessionRemaining(s) > 0) s.endedEarly = true;
  s.phase = 'over';
  return [{ type: 'timesUp' }];
}

/** Price factor of the next seed: ×SEED_PRICE_STEP per seed bought this session, at most ×SEED_PRICE_STEP_MAX. */
export function seedStep(s: SessionState | null): number {
  return Math.min(C.SEED_PRICE_STEP_MAX, Math.pow(C.SEED_PRICE_STEP, s ? s.bought : 0));
}

/** Abono: the production multiplier it gives right now (1 = none bought). */
export function boostMult(s: SessionState | null): number {
  return s ? Math.pow(C.BOOST_MULT, s.boosts) : 1;
}

/**
 * Abono, one rule the player can read (QA4 F-17): it costs what the dish earns in BOOST_SECONDS at
 * its best this run (the run's peak Esencia/s, so a dip never makes it cheaper and the price only moves
 * up), at least BOOST_MIN_COST, ×BOOST_GROWTH per Abono already bought this session (the floor too).
 */
export function boostCost(s: SessionState | null, eps: number): number {
  const k = s ? s.boosts : 0;
  const now = Number.isFinite(eps) && eps > 0 ? eps : 0;
  const e = Math.max(now, s && Number.isFinite(s.peakEps) ? s.peakEps : 0);
  return Math.round(Math.max(C.BOOST_MIN_COST, C.BOOST_SECONDS * e) * Math.pow(C.BOOST_GROWTH, k));
}

/** Seconds until Abono is on sale this session (0 = now; BOOST_FROM_SECONDS of clock first). */
export function boostWait(s: SessionState | null): number {
  if (!s || s.phase !== 'running') return C.BOOST_FROM_SECONDS;
  return Math.max(0, C.BOOST_FROM_SECONDS - s.elapsed);
}

function extend(s: SessionState, seconds: number, reason: 'species' | 'encargo' | 'golden'): SessionEvent[] {
  if (!(seconds > 0) || s.phase === 'over') return [];
  s.bonus += seconds;
  return [{ type: 'extended', seconds, reason }];
}

/** Production multiplier from the session itself (Sprint final in the last seconds). */
export function sessionProdMult(s: SessionState, fx: TreeEffects): number {
  return s.phase === 'running' && fx.sprintMult > 1 && sessionRemaining(s) <= sprintSeconds(sessionTotal(s)) ? fx.sprintMult : 1;
}

/** The pity seed is due: no creature stable after SESSION_PITY_AFTER seconds of clock. */
export function pityDue(s: SessionState): boolean {
  return s.phase === 'running' && !s.hadStable && s.elapsed >= C.SESSION_PITY_AFTER;
}

// ───────────────────────────── notes from the game ─────────────────

export function noteEssence(s: SessionState, amount: number): void {
  if (s.phase === 'over' || !(amount > 0) || !Number.isFinite(amount)) return;
  s.essence += amount;
}

export function noteSpend(s: SessionState, amount: number): void {
  if (amount > 0 && Number.isFinite(amount)) s.spent += amount;
}

/** A seed was placed (manual or automatic). Starts the clock on the first one. */
export function noteSeed(s: SessionState): SessionEvent[] {
  s.seeds++;
  return startClock(s);
}

/** Per economic tick: current production and stable creatures (peaks). */
export function noteProduction(s: SessionState, eps: number, stableCreatures: number): void {
  if (Number.isFinite(eps)) s.peakEps = Math.max(s.peakEps, eps);
  if (stableCreatures > 0) s.hadStable = true;
  s.peakCreatures = Math.max(s.peakCreatures, stableCreatures);
}

/**
 * A stable creature of a species was seen; `firstEver` = it was just registered in the Bestiary.
 * Base rule: every species new to the Bestiary adds SESSION_TIME_PER_SPECIES seconds ("¡Especie
 * nueva! +5 s").
 */
export function noteSpecies(s: SessionState, fx: TreeEffects, speciesId: string, firstEver: boolean): SessionEvent[] {
  s.hadStable = true;
  if (!s.species.includes(speciesId)) s.species.push(speciesId);
  if (!firstEver || s.newSpecies.includes(speciesId)) return [];
  s.newSpecies.push(speciesId);
  return extend(s, fx.timePerSpecies, 'species');
}

/** A variant (look-alike form, never a new species) seen for the first time ever: a few Datos. */
export function noteVariant(s: SessionState, code: string): void {
  if (s.phase === 'over') return;
  const v = (s.newVariants ??= []);
  if (!v.includes(code)) v.push(code);
}

export function noteBehavior(s: SessionState, behavior: Behavior, firstEver: boolean): void {
  if (firstEver && !s.newBehaviors.includes(behavior)) s.newBehaviors.push(behavior);
}

/**
 * An Encargo (or a game objective) was completed. From ENCARGO_TIME_FROM_SESSION on it adds
 * fx.timePerEncargo seconds; in session 1 the Encargos are silent (CLARIDAD §3.3), so they do not
 * stretch the 15 s run to 35 s with "+5 s" chips nobody asked for (docs/RITMO.md §3.3).
 */
export function noteEncargo(s: SessionState, fx: TreeEffects): SessionEvent[] {
  if (s.phase === 'over') return [];
  s.encargos++;
  // Only an Encargo met while the clock runs adds time: one already met when the run is set up (a new
  // night's list ticking off what you already have) is not something the player did in this run, and
  // its +3 s made the night's first run an outlier the next one could not beat (bot: S5 −10 %).
  return s.n >= C.ENCARGO_TIME_FROM_SESSION && s.phase === 'running' ? extend(s, fx.timePerEncargo, 'encargo') : [];
}

export function noteGolden(s: SessionState, fx: TreeEffects): SessionEvent[] {
  if (s.phase === 'over') return [];
  s.goldens++;
  return extend(s, fx.timePerGolden, 'golden');
}

/** A creature paying `eps` (keeps the best one for the summary). */
export function noteBest(s: SessionState, speciesId: string | null, eps: number): void {
  if (!(eps > 0) || !Number.isFinite(eps)) return;
  if (!s.best || eps > s.best.eps) s.best = { speciesId, eps };
}

/** The species to keep in the Nevera (best first), set when the clock runs out. */
export function noteKeep(s: SessionState, speciesIds: readonly string[]): void {
  const out: string[] = [];
  for (const id of speciesIds) if (id && !out.includes(id)) out.push(id);
  s.keep = out;
}

// ───────────────────────────── summary ─────────────────────────────

/**
 * How the Datos were computed, as the visual equation of the end card (owner: "Esencia ganada 1.240
 * → ÷100 = 12 Datos + 3 especies nuevas ×5 = 27 Datos"). Every number shown adds up exactly.
 */
export interface DatosBreakdown {
  essence: number;
  div: number;
  /** floor(essence / div). */
  base: number;
  /** Night bonus (+10 % per night after the first), as a factor (1 = none). */
  nightMult: number;
  /** floor(base × nightMult). */
  fromEssence: number;
  /** Additive terms: count × each = value. */
  terms: { kind: 'species' | 'variants' | 'behaviors' | 'encargos' | 'goldens' | 'records'; count: number; each: number; value: number }[];
  /** fromEssence + Σ terms. */
  sub: number;
  /** Gran enciclopedia: every Dato ×bookMult (1 = none); `book` = what it adds, floor(sub × bookMult) − sub. */
  bookMult: number;
  book: number;
  /** Top-up to DATOS_MIN ("¡siempre se aprende algo!"). */
  minimum: number;
  total: number;
}

export interface RecordHit {
  kind: RecordKind;
  value: number;
  previous: number;
}

export type VelaKey = keyof typeof VELA_LINES;

export interface SessionSummary {
  n: number;
  seconds: number;
  essence: number;
  datos: DatosBreakdown;
  /** Distinct species of the session, new ones first. */
  species: { id: string; isNew: boolean }[];
  best: { speciesId: string | null; eps: number } | null;
  records: RecordHit[];
  vela: VelaKey;
  /** Species kept in the Nevera for the next session. */
  keep: string[];
  /** After applying it, a new night is ready (VELA says so, the tree centre glows). */
  nightReady: boolean;
}

/** Records beaten this session (from the second session on: the first one sets them silently). */
export function sessionRecords(s: SessionState, r: ResearchState): RecordHit[] {
  if (r.sessions < 1) return [];
  const now: Record<RecordKind, number> = { essence: s.essence, eps: s.peakEps, creatures: s.peakCreatures, species: s.species.length };
  const out: RecordHit[] = [];
  for (const kind of ['essence', 'eps', 'creatures', 'species'] as RecordKind[]) {
    const prev = r.records[kind];
    if (prev > 0 && now[kind] > prev) out.push({ kind, value: now[kind], previous: prev });
  }
  return out;
}

export function computeDatos(s: SessionState, fx: TreeEffects, records: number): DatosBreakdown {
  const essence = Math.max(0, Number.isFinite(s.essence) ? s.essence : 0);
  const div = C.DATOS_ESSENCE_DIV;
  const base = Math.floor(essence / div + 1e-9);
  const nightMult = fx.datosNightMult;
  const bookMult = fx.datosMult;
  const fromEssence = Math.floor(base * nightMult + 1e-9);
  const terms: DatosBreakdown['terms'] = [];
  const add = (kind: DatosBreakdown['terms'][number]['kind'], count: number, each: number) => {
    if (count > 0 && each > 0) terms.push({ kind, count, each, value: count * each });
  };
  add('species', s.newSpecies.length, fx.datosPerSpecies);
  add('variants', s.newVariants?.length ?? 0, C.DATOS_PER_VARIANT);
  add('behaviors', s.newBehaviors.length, fx.datosPerBehavior);
  add('encargos', s.encargos, C.DATOS_PER_ENCARGO);
  add('goldens', s.goldens, fx.datosPerGolden);
  add('records', records, C.DATOS_PER_RECORD);
  const sub = fromEssence + terms.reduce((a, t) => a + t.value, 0);
  const book = Math.floor(sub * bookMult + 1e-9) - sub;
  // "Nunca menos de 3" pays a session that ran its clock; one cut short with "Terminar ahora" pays what it earned.
  const minimum = s.endedEarly ? 0 : Math.max(0, C.DATOS_MIN - sub - book);
  return { essence, div, base, nightMult, fromEssence, terms, sub, bookMult, book, minimum, total: sub + book + minimum };
}

/** What the HUD shows before the clock runs out: Datos so far and the next node they reach. */
export interface SessionPreview {
  /** Datos the session would pay if it ended now (records not counted yet). */
  datos: number;
  /** Cheapest node that only waits for Datos; `missing` counts the Datos of this session too. */
  goal: { id: string; cost: number; missing: number } | null;
}

export function sessionPreview(r: ResearchState, s: SessionState, fx: TreeEffects, species: number): SessionPreview {
  const datos = computeDatos(s, fx, 0).total;
  const g = nextGoal(treeCtxOf(r, species));
  return { datos, goal: g ? { id: g.id, cost: g.cost, missing: Math.max(0, g.cost - r.datos - datos) } : null };
}

/** Which VELA line closes the end card. */
export function velaKey(s: SessionState, d: DatosBreakdown, records: RecordHit[], nightIsReady: boolean, fx: TreeEffects): VelaKey {
  if (s.n === 1) return 'first';
  if (nightIsReady) return 'night';
  if (s.newSpecies.length) return 'newSpecies';
  if (records.length) return 'record';
  if (d.minimum > 0) return 'poor';
  if (fx.sprintMult > 1 && s.warned.sprint) return 'sprint';
  return 'plain';
}

export function velaLine(key: VelaKey): Text {
  return VELA_LINES[key];
}

/**
 * Everything the end card shows. Pure: call it once when the clock says 'timesUp', then
 * applySummary() to bank the Datos. `species` = Bestiary size after the session (night gate).
 */
export function summarize(s: SessionState, r: ResearchState, fx: TreeEffects, species: number): SessionSummary {
  const records = sessionRecords(s, r);
  const datos = computeDatos(s, fx, records.length);
  const after = applySummaryCore(r, s, datos, records, fx);
  const ready = nightInfo(treeCtxOf(after, species)).ready && !nightInfo(treeCtxOf(r, species)).ready;
  const ordered = [...s.species].sort((a, b) => Number(s.newSpecies.includes(b)) - Number(s.newSpecies.includes(a)));
  return {
    n: s.n,
    seconds: s.elapsed,
    essence: s.essence,
    datos,
    species: ordered.map((id) => ({ id, isNew: s.newSpecies.includes(id) })),
    best: s.best ? { ...s.best } : null,
    records,
    vela: velaKey(s, datos, records, ready, fx),
    keep: s.keep.slice(0, fx.fridge),
    nightReady: ready,
  };
}

function applySummaryCore(r: ResearchState, s: SessionState, d: DatosBreakdown, records: RecordHit[], fx: TreeEffects): ResearchState {
  const rec = { ...r.records };
  rec.essence = Math.max(rec.essence, s.essence);
  rec.eps = Math.max(rec.eps, s.peakEps);
  rec.creatures = Math.max(rec.creatures, s.peakCreatures);
  rec.species = Math.max(rec.species, s.species.length);
  void records;
  const history = [...r.history, { n: s.n, seconds: Math.round(s.elapsed), essence: Math.round(s.essence), datos: d.total, species: s.species.length }];
  return {
    ...r,
    datos: r.datos + d.total,
    datosEarned: r.datosEarned + d.total,
    sessions: Math.max(r.sessions, s.n),
    nightEssence: r.nightEssence + s.essence,
    records: rec,
    fridge: s.keep.slice(0, fx.fridge),
    history: history.slice(-C.SESSION_HISTORY),
  };
}

/** Bank a finished session: Datos, records, history, Nevera. Pure (returns a new state). */
export function applySummary(r: ResearchState, s: SessionState, sum: SessionSummary, fx: TreeEffects): ResearchState {
  return applySummaryCore(r, s, sum.datos, sum.records, fx);
}

/** Datos of the last sessions (for tree.sessionsToAfford). */
export function recentDatos(r: ResearchState): number[] {
  return r.history.map((h) => h.datos);
}

// ───────────────────────────── persistence ─────────────────────────

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown, d = 0, min = 0, max = Number.MAX_VALUE): number =>
  typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max ? x : d;
const strs = (x: unknown, max = 64, len = 32): string[] =>
  Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= len).slice(0, max) : [];
const BEHAVIORS: Behavior[] = ['still', 'pulsing', 'swimmer', 'spinner', 'divider', 'colony'];

/**
 * Lenient validation of a stored research state (v1): anything damaged falls back to defaults;
 * unknown node ids are kept out. Returns null only for something that is not a research state.
 */
export function validateResearch(x: unknown, knownNodes?: (id: string) => boolean): ResearchState | null {
  if (!isObj(x) || x.v !== 1) return null;
  const d = freshResearch();
  const levels: Record<string, number> = { lab: 1 };
  if (isObj(x.levels)) {
    for (const [id, lv] of Object.entries(x.levels)) {
      if (knownNodes && !knownNodes(id)) continue;
      const l = Math.floor(num(lv, 0, 0, 1000));
      if (l > 0) levels[id.slice(0, 32)] = l;
    }
  }
  const recIn = isObj(x.records) ? x.records : {};
  const history = Array.isArray(x.history)
    ? x.history
        .filter(isObj)
        .slice(-C.SESSION_HISTORY)
        .map((h) => ({ n: Math.floor(num(h.n, 0)), seconds: num(h.seconds), essence: num(h.essence), datos: num(h.datos), species: Math.floor(num(h.species)) }))
    : [];
  return {
    v: 1,
    datos: num(x.datos, d.datos),
    datosEarned: num(x.datosEarned, d.datosEarned),
    levels,
    sessions: Math.floor(num(x.sessions, 0, 0, 1e7)),
    nightEssence: num(x.nightEssence),
    records: { essence: num(recIn.essence), eps: num(recIn.eps), creatures: Math.floor(num(recIn.creatures)), species: Math.floor(num(recIn.species)) },
    fridge: strs(x.fridge, 8),
    fresh: strs(x.fresh, 64),
    history,
    world: isWorldId(x.world) ? x.world : BASE_WORLD,
  };
}

/** Lenient validation of a stored running session (null = start a new one). */
export function validateSession(x: unknown): SessionState | null {
  if (!isObj(x) || x.v !== 1) return null;
  const phase: SessionPhase = x.phase === 'running' || x.phase === 'over' ? x.phase : 'ready';
  const n = Math.floor(num(x.n, 0, 1, 1e7));
  if (n < 1) return null;
  const warned = isObj(x.warned) ? x.warned : {};
  const best = isObj(x.best) && num(x.best.eps) > 0 ? { speciesId: typeof x.best.speciesId === 'string' ? x.best.speciesId : null, eps: num(x.best.eps) } : null;
  return {
    v: 1,
    n,
    world: isWorldId(x.world) ? x.world : BASE_WORLD,
    phase,
    limit: num(x.limit, C.SESSION_BASE_SECONDS, 1, 1e5),
    bonus: num(x.bonus, 0, 0, 1e5),
    elapsed: num(x.elapsed, 0, 0, 1e6),
    essence: num(x.essence),
    spent: num(x.spent),
    seeds: Math.floor(num(x.seeds)),
    bought: Math.floor(num(x.bought)),
    boosts: Math.floor(num(x.boosts, 0, 0, 1000)),
    endedEarly: x.endedEarly === true,
    peakEps: num(x.peakEps),
    peakCreatures: Math.floor(num(x.peakCreatures)),
    species: strs(x.species, 256),
    newSpecies: strs(x.newSpecies, 256),
    newVariants: strs(x.newVariants, 64),
    newBehaviors: Array.isArray(x.newBehaviors) ? x.newBehaviors.filter((b): b is Behavior => BEHAVIORS.includes(b as Behavior)) : [],
    encargos: Math.floor(num(x.encargos)),
    goldens: Math.floor(num(x.goldens)),
    best,
    hadStable: x.hadStable === true,
    keep: strs(x.keep, 8),
    warned: { minute: warned.minute === true, last: warned.last === true, sprint: warned.sprint === true },
    countdown: Math.floor(num(x.countdown, 0, 0, 1000)),
  };
}
