/**
 * Encargos engine: one main request at a time from the chain, plus one rotating
 * side request. Each Encargo is offered (event `offer`), tracks progress from
 * the GameView and its own event counters, and on completion resolves its
 * reward, hands it to `deps.grant` (the game pays it) and emits `done`.
 *
 * Pure TS, no DOM. Persists to localStorage 'bioluma.encargos' (try/catch
 * everywhere) and offers serialize()/load() for the main save.
 */
import { Bus, type GameEvents } from '../core/bus';
import type { GameView, Text } from '../core/types';
import { OBJECTIVES } from '../game/balance';
import { CHAIN, ENCARGO_BY_ID, SIDE, SIDE_REWARD, resolveEncargo, type Cosmetic, type EncargoDef, type GoalDef, COSMETICS } from './encargoScript';
import { SPEAKER_NAMES, alborSpeciesFound } from './script';
import type { Story } from './story';
import type { LineDef, Mood, Speaker, StorageLike } from './types';

export const ENCARGOS_STORAGE_KEY = 'bioluma.encargos';

/** Pacing (ms). */
const NEXT_OFFER_DELAY = 2200;
const SIDE_GAP = 90_000;
const SIDE_FIRST_GAP = 20_000;
const SIDE_EXPIRE = 12 * 60_000;
const SIDE_DISMISS_GAP = 60_000;
/** Chain index from which side requests may appear (after "move μ"). */
const SIDE_UNLOCK_AT = CHAIN.findIndex((e) => e.id === 'move') + 1;
const FIRST_ACT2 = CHAIN.findIndex((e) => (e.minEra ?? 1) >= 2);

type CounterKey = 'seeds' | 'golden' | 'calib' | 'species' | 'prints' | 'extDone';
type Counters = Record<CounterKey, number>;
const zero = (): Counters => ({ seeds: 0, golden: 0, calib: 0, species: 0, prints: 0, extDone: 0 });

export type ProgressUnit = 'count' | 'eps' | 'seconds' | 'flag';

export interface EncargoReward {
  essence: number;
  samples: number;
  cosmetic: Cosmetic | null;
  journal: string | null;
}

export interface EncargoView {
  id: string;
  kind: 'main' | 'side';
  who: Speaker;
  mood: Mood;
  /** Speaker display name. */
  name: Text;
  /** The request ({n} resolved). */
  ask: Text;
  why: Text;
  /** Ask + progress, for the objective bar: "Ten 3 criaturas estables a la vez (1/3)". */
  label: Text;
  /** Just the progress: "1/3", "2,4/3", "1:20/2:00" ('' for yes/no goals). */
  count: Text;
  progress: { current: number; target: number; unit: ProgressUnit; frac: number };
  /** Reward preview (Essence computed at the current production). */
  reward: EncargoReward;
}

export interface EncargoDone {
  encargo: EncargoView;
  reward: EncargoReward;
  thanks: { who: Speaker; name: Text; text: Text };
}

export interface EncargoEvents {
  offer: { encargo: EncargoView };
  /** Progress changed (current value). */
  progress: { encargo: EncargoView };
  done: EncargoDone;
  /** Anything changed (offers, completions, cosmetics). */
  change: Record<string, never>;
}

export interface EncargosDeps {
  bus: Bus<GameEvents>;
  getView: () => GameView;
  /** Pays the reward (the game owns Essence/Samples). */
  grant?: (reward: EncargoReward, encargo: EncargoView) => void;
  /** For "Why?" dialogues and journal entries. */
  story?: Story;
  storage?: StorageLike | null;
  now?: () => number;
  random?: () => number;
  /** setInterval period for polling (default 1000 ms; 0 = call tick() yourself). */
  pollMs?: number;
}

export interface EncargosSave {
  v: 1;
  chain: number;
  chainOfferedAt: number | null;
  chainBase: Counters | null;
  side: { id: string; target: number; offeredAt: number; base: Counters } | null;
  sideNextAt: number;
  sideDone: Record<string, number>;
  lastSide: string | null;
  cosmetics: Cosmetic[];
  counters: Counters;
  seenBestiary: boolean;
  completed: string[];
}

export interface Encargos {
  readonly events: Bus<EncargoEvents>;
  on<K extends keyof EncargoEvents>(type: K, fn: (p: EncargoEvents[K]) => void): () => void;
  tick(): void;
  /** What the objective bar shows: the main request, else the side one. */
  current(): EncargoView | null;
  main(): EncargoView | null;
  side(): EncargoView | null;
  /** Play the full "Why?" dialogue (story.speak). */
  why(id?: string): boolean;
  /** Put the side request away for a minute; another one comes later. */
  dismissSide(): void;
  cosmetics(): readonly Cosmetic[];
  /** UI signal, e.g. 'tab:bestiary'. */
  signal(name: string): void;
  notePrint(): void;
  /** Main-chain progress: steps done / total. */
  chainProgress(): { done: number; total: number };
  serialize(): EncargosSave;
  load(data: unknown): boolean;
  reset(): void;
  dispose(): void;
  /** Dev tools / tests. */
  readonly debug: { offer(id: string): void; complete(): void };
}

const fmt = (x: number, lang: 'es' | 'en', dec = 0): string => {
  const fixed = x.toFixed(dec);
  const [int, frac] = fixed.split('.');
  const sep = lang === 'es' ? ' ' : ',';
  const grouped = int.length > 4 || (lang === 'en' && int.length > 3) ? int.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : int;
  return frac ? `${grouped}${lang === 'es' ? ',' : '.'}${frac}` : grouped;
};
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function freshSave(): EncargosSave {
  return {
    v: 1,
    chain: 0,
    chainOfferedAt: null,
    chainBase: null,
    side: null,
    sideNextAt: 0,
    sideDone: {},
    lastSide: null,
    cosmetics: [],
    counters: zero(),
    seenBestiary: false,
    completed: [],
  };
}

function defaultStorage(): StorageLike | null {
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
  } catch {
    return null;
  }
}

export function createEncargos(deps: EncargosDeps): Encargos {
  const events = new Bus<EncargoEvents>();
  const now = deps.now ?? (() => Date.now());
  const random = deps.random ?? Math.random;
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  let st = freshSave();
  let nextOfferAt = 0;
  let disposed = false;
  let evalQueued = false;
  /** keepAlive tracking: creature id → when it was first seen with the behaviour. */
  let alive = new Map<number, number>();
  const lastProgress = new Map<string, number>();

  // ───────────── persistence ─────────────

  function persist(): void {
    if (!storage) return;
    try {
      storage.setItem(ENCARGOS_STORAGE_KEY, JSON.stringify(st));
    } catch {
      /* quota / private mode */
    }
  }

  const isCounters = (x: unknown): x is Counters =>
    !!x && typeof x === 'object' && (['seeds', 'golden', 'calib', 'species', 'prints', 'extDone'] as const).every((k) => typeof (x as Counters)[k] === 'number');

  function load(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    const d = data as Partial<EncargosSave>;
    if (d.v !== 1 || typeof d.chain !== 'number') return false;
    const s = freshSave();
    s.chain = Math.max(0, Math.min(CHAIN.length, Math.floor(d.chain)));
    s.chainOfferedAt = typeof d.chainOfferedAt === 'number' ? d.chainOfferedAt : null;
    s.chainBase = isCounters(d.chainBase) ? { ...d.chainBase } : null;
    if (d.side && typeof d.side === 'object' && ENCARGO_BY_ID.has(d.side.id) && isCounters(d.side.base))
      s.side = { id: d.side.id, target: Number(d.side.target) || 1, offeredAt: Number(d.side.offeredAt) || now(), base: { ...d.side.base } };
    s.sideNextAt = typeof d.sideNextAt === 'number' ? d.sideNextAt : 0;
    if (d.sideDone && typeof d.sideDone === 'object') for (const [k, v] of Object.entries(d.sideDone)) if (typeof v === 'number') s.sideDone[k] = v;
    s.lastSide = typeof d.lastSide === 'string' ? d.lastSide : null;
    if (Array.isArray(d.cosmetics)) s.cosmetics = d.cosmetics.filter((c): c is Cosmetic => (COSMETICS as readonly string[]).includes(c));
    if (isCounters(d.counters)) s.counters = { ...d.counters };
    s.seenBestiary = d.seenBestiary === true;
    if (Array.isArray(d.completed)) s.completed = d.completed.filter((x): x is string => typeof x === 'string');
    st = s;
    alive = new Map();
    events.emit('change', {});
    return true;
  }

  function readStored(): boolean {
    if (!storage) return false;
    try {
      const raw = storage.getItem(ENCARGOS_STORAGE_KEY);
      return raw ? load(JSON.parse(raw) as unknown) : false;
    } catch {
      return false;
    }
  }

  // ───────────── metrics ─────────────

  const stableCount = (v: GameView) => v.creatures.reduce((n, c) => n + (c.state === 'stable' ? 1 : 0), 0);
  const viewPrints = (v: GameView): number => {
    const p = (v.stats as unknown as { prints?: unknown }).prints;
    return typeof p === 'number' ? p : 0;
  };

  function keepAliveSeconds(v: GameView, behavior: string): number {
    const t = now();
    const present = new Set<number>();
    for (const c of v.creatures) {
      if (c.state !== 'stable' || c.behavior !== behavior) continue;
      present.add(c.id);
      if (!alive.has(c.id)) alive.set(c.id, t);
    }
    for (const id of [...alive.keys()]) if (!present.has(id)) alive.delete(id);
    let best = 0;
    for (const at of alive.values()) best = Math.max(best, (t - at) / 1000);
    return best;
  }

  function value(g: GoalDef, v: GameView, base: Counters | null): number {
    const d = (k: CounterKey) => st.counters[k] - (base?.[k] ?? 0);
    switch (g.metric) {
      case 'seeds':
        return g.delta ? d('seeds') : Math.max(v.stats.seeds, st.counters.seeds);
      case 'stableNow':
        return stableCount(v);
      case 'speciesSeen':
        return st.seenBestiary || v.species.some((s) => !s.isNew) ? 1 : 0;
      case 'upgrade':
        return v.upgrades.find((u) => u.id === g.arg)?.level ?? 0;
      case 'eps':
        return v.essencePerSec;
      case 'species':
        return g.delta ? d('species') : v.species.length;
      case 'behaviors':
        return v.behaviorsSeen.length;
      case 'behavior':
        return v.behaviorsSeen.includes(g.arg as never) ? 1 : 0;
      case 'golden':
        return g.delta ? d('golden') : st.counters.golden;
      case 'calib':
        return g.delta ? d('calib') : st.counters.calib;
      case 'prints':
        return g.delta ? d('prints') : Math.max(viewPrints(v), st.counters.prints);
      case 'eraEssence':
        return v.stats.eraEssence;
      case 'extinctions':
        return Math.max(st.counters.extDone, v.era - 1);
      case 'genomeNodes':
        return v.genomeNodes.filter((n) => n.owned).length;
      case 'treeNodes':
        return v.research ? Object.entries(v.research.levels).filter(([id, l]) => id !== 'lab' && l > 0).length : 0;
      case 'world':
        return v.session?.world === g.arg && v.session?.phase === 'running' ? 1 : 0;
      case 'sessionEssence':
        return v.session && v.session.phase !== 'over' ? v.session.essence : 0;
      case 'sameSpecies': {
        const n = new Map<string, number>();
        for (const c of v.creatures) if (c.state === 'stable' && c.speciesId) n.set(c.speciesId, (n.get(c.speciesId) ?? 0) + 1);
        return Math.max(0, ...n.values());
      }
      case 'node':
        return v.genomeNodes.some((n) => n.id === g.arg && n.owned) ? 1 : 0;
      case 'keepAlive':
        return keepAliveSeconds(v, g.arg ?? 'swimmer');
      case 'seedSpecies':
        return alborSpeciesFound(v.species.map((s) => s.catalogName));
    }
  }

  const targetOf = (g: GoalDef, v: GameView) => (typeof g.target === 'function' ? g.target(v) : g.target);

  function unitOf(g: GoalDef, target: number): ProgressUnit {
    if (g.metric === 'eps') return 'eps';
    if (g.metric === 'keepAlive') return 'seconds';
    return target <= 1 ? 'flag' : 'count';
  }

  // ───────────── views ─────────────

  function resolveReward(def: EncargoDef, v: GameView): EncargoReward {
    const r = def.reward;
    let essence = 0;
    if (r.objective) essence += OBJECTIVES.find((o) => o.id === r.objective)?.reward ?? 0;
    if (r.essenceSec) {
      const sec = v.cycle === 'sessions' ? Math.min(r.essenceSec, SIDE_REWARD.sessionMaxSec) : r.essenceSec;
      essence += Math.max(r.essenceMin ?? 0, Math.round(v.essencePerSec * sec));
    }
    return { essence, samples: r.samples ?? 0, cosmetic: r.cosmetic ?? null, journal: r.journal ?? null };
  }

  function makeView(def: EncargoDef, kind: 'main' | 'side', v: GameView, target: number, base: Counters | null): EncargoView {
    const current = Math.min(value(def.goal, v, base), target);
    const unit = unitOf(def.goal, target);
    const lang = (l: 'es' | 'en') => {
      const n = fmt(target, l, unit === 'eps' && target < 10 && target % 1 ? 1 : 0);
      return def.ask[l].replace(/\{n\}/g, n);
    };
    const ask: Text = { es: lang('es'), en: lang('en') };
    const count = (l: 'es' | 'en'): string => {
      switch (unit) {
        case 'flag':
          return '';
        // CLARIDAD J-136: every number says what it is ("2,4 de 3 Esencia/s", "1:20 de 2:00").
        case 'eps':
          return `${fmt(current, l, current < 100 ? 1 : 0)} ${l === 'es' ? 'de' : 'of'} ${fmt(target, l)} ${l === 'es' ? 'Esencia/s' : 'Essence/s'}`;
        case 'seconds':
          return `${clock(current)} ${l === 'es' ? 'de' : 'of'} ${clock(target)}`;
        case 'count':
          return `${fmt(Math.floor(current), l)} ${l === 'es' ? 'de' : 'of'} ${fmt(target, l)}`;
      }
    };
    const suffix = (l: 'es' | 'en') => (unit === 'flag' ? '' : ` (${count(l)})`);
    return {
      id: def.id,
      kind,
      who: def.who,
      mood: def.mood,
      name: SPEAKER_NAMES[def.who],
      ask,
      why: def.why,
      label: { es: ask.es + suffix('es'), en: ask.en + suffix('en') },
      count: { es: count('es'), en: count('en') },
      progress: { current, target, unit, frac: target > 0 ? Math.max(0, Math.min(1, current / target)) : 1 },
      reward: resolveReward(def, v),
    };
  }

  function chainDef(v: GameView): EncargoDef | null {
    const def = CHAIN[st.chain];
    if (!def || (def.minEra ?? 1) > v.era) return null;
    return resolveEncargo(def, v);
  }

  /** An Encargo by id, worded and aimed for the running loop. */
  const byId = (id: string, v: GameView): EncargoDef | undefined => {
    const def = ENCARGO_BY_ID.get(id);
    return def ? resolveEncargo(def, v) : undefined;
  };

  function mainView(v: GameView): EncargoView | null {
    const def = chainDef(v);
    if (!def || st.chainOfferedAt === null) return null;
    return makeView(def, 'main', v, targetOf(def.goal, v), st.chainBase);
  }

  function sideView(v: GameView): EncargoView | null {
    if (!st.side) return null;
    const def = byId(st.side.id, v);
    return def ? makeView(def, 'side', v, st.side.target, st.side.base) : null;
  }

  // ───────────── lifecycle ─────────────

  function met(def: EncargoDef, v: GameView, target: number, base: Counters | null): boolean {
    if (value(def.goal, v, base) < target) return false;
    if (def.also && value(def.also, v, base) < targetOf(def.also, v)) return false;
    return true;
  }

  function complete(def: EncargoDef, view: EncargoView, v: GameView): void {
    const reward = resolveReward(def, v);
    if (reward.cosmetic && !st.cosmetics.includes(reward.cosmetic)) st.cosmetics.push(reward.cosmetic);
    if (!st.completed.includes(def.id)) st.completed.push(def.id);
    try {
      deps.grant?.(reward, view);
    } catch (err) {
      console.error('[encargos] grant failed', err);
    }
    if (reward.journal) deps.story?.unlockJournal(reward.journal);
    const who = def.thanksWho ?? def.who;
    events.emit('done', { encargo: { ...view, progress: { ...view.progress, current: view.progress.target, frac: 1 } }, reward, thanks: { who, name: SPEAKER_NAMES[who], text: def.thanks } });
    lastProgress.delete(def.id);
  }

  function offerMain(v: GameView): void {
    st.chainOfferedAt = now();
    st.chainBase = { ...st.counters };
    alive = new Map();
    const view = mainView(v);
    persist();
    if (view) events.emit('offer', { encargo: view });
    events.emit('change', {});
  }

  function pickSide(v: GameView): EncargoDef | null {
    const pool = SIDE.map((d) => resolveEncargo(d, v)).filter((d) => {
      if (d.once && st.sideDone[d.id]) return false;
      if (d.id === st.lastSide && SIDE.length > 1) return false;
      if (d.available && !d.available(v)) return false;
      // Already satisfied level goals make boring requests: skip them.
      if (!d.goal.delta && d.goal.metric !== 'keepAlive' && value(d.goal, v, null) >= targetOf(d.goal, v)) return false;
      return true;
    });
    if (!pool.length) return null;
    // "Once" story requests first (they are the interesting ones), then random.
    const onceFirst = pool.filter((d) => d.once);
    const from = onceFirst.length ? onceFirst : pool;
    return from[Math.floor(random() * from.length) % from.length];
  }

  function offerSide(def: EncargoDef, v: GameView): void {
    st.side = { id: def.id, target: targetOf(def.goal, v), offeredAt: now(), base: { ...st.counters } };
    st.lastSide = def.id;
    const view = sideView(v);
    persist();
    if (view) events.emit('offer', { encargo: view });
    events.emit('change', {});
  }

  function emitProgress(view: EncargoView): void {
    const prev = lastProgress.get(view.id);
    const cur = view.progress.unit === 'eps' ? Math.round(view.progress.current * 10) : Math.floor(view.progress.current);
    if (prev === cur) return;
    lastProgress.set(view.id, cur);
    if (prev !== undefined) events.emit('progress', { encargo: view });
  }

  function tick(): void {
    if (disposed) return;
    let v: GameView;
    try {
      v = deps.getView();
    } catch {
      return;
    }
    const t = now();
    // Sessions cycle, session 1 (CLARIDAD §3.3): no Encargo on screen. The steps it finishes pass
    // in silence (the game pays the objective ones itself); the first one shown comes in session 2.
    if (v.cycle === 'sessions' && v.session?.first) {
      let moved = false;
      for (let d = chainDef(v); d && !d.goal.delta && met(d, v, targetOf(d.goal, v), null); d = chainDef(v)) {
        if (!st.completed.includes(d.id)) st.completed.push(d.id);
        st.chain++;
        st.chainOfferedAt = null;
        st.chainBase = null;
        moved = true;
      }
      if (moved) {
        persist();
        events.emit('change', {});
      }
      return;
    }
    // Main chain.
    const def = chainDef(v);
    if (def) {
      if (st.chainOfferedAt === null) {
        if (t >= nextOfferAt) offerMain(v);
      } else {
        const target = targetOf(def.goal, v);
        const view = makeView(def, 'main', v, target, st.chainBase);
        if (met(def, v, target, st.chainBase)) {
          complete(def, view, v);
          st.chain++;
          st.chainOfferedAt = null;
          st.chainBase = null;
          nextOfferAt = t + NEXT_OFFER_DELAY;
          persist();
          events.emit('change', {});
        } else emitProgress(view);
      }
    }
    // Side requests.
    if (st.side) {
      const sdef = byId(st.side.id, v);
      if (!sdef) st.side = null;
      else if (met(sdef, v, st.side.target, st.side.base)) {
        const view = sideView(v)!;
        complete(sdef, view, v);
        st.sideDone[sdef.id] = (st.sideDone[sdef.id] ?? 0) + 1;
        st.side = null;
        st.sideNextAt = t + SIDE_GAP;
        persist();
        events.emit('change', {});
      } else if (t - st.side.offeredAt > SIDE_EXPIRE) {
        st.side = null;
        st.sideNextAt = t + SIDE_DISMISS_GAP;
        persist();
        events.emit('change', {});
      } else {
        const view = sideView(v);
        if (view) emitProgress(view);
      }
    } else if ((st.chain >= SIDE_UNLOCK_AT || v.era >= 2) && t >= nextOfferAt) {
      if (!st.sideNextAt) st.sideNextAt = t + SIDE_FIRST_GAP;
      else if (t >= st.sideNextAt) {
        const pick = pickSide(v);
        if (pick) offerSide(pick, v);
        else st.sideNextAt = t + SIDE_DISMISS_GAP;
      }
    }
  }

  function scheduleEval(): void {
    if (evalQueued || disposed) return;
    evalQueued = true;
    const run = () => {
      evalQueued = false;
      tick();
    };
    if (typeof queueMicrotask === 'function') queueMicrotask(run);
    else void Promise.resolve().then(run);
  }

  // ───────────── events ─────────────

  const offs: (() => void)[] = [];
  const on = <K extends keyof GameEvents>(type: K, fn: (p: GameEvents[K]) => void) =>
    offs.push(
      deps.bus.on(type, (p) => {
        fn(p);
        scheduleEval();
      }),
    );
  on('seed', ({ manual }) => {
    if (manual) st.counters.seeds++;
  });
  on('goldenCollected', () => st.counters.golden++);
  on('calibrationChanged', () => st.counters.calib++);
  on('speciesNew', () => st.counters.species++);
  on('extinctionDone', () => st.counters.extDone++);
  // No counters for these, but they often complete a goal: evaluate right away.
  on('creatureStable', () => undefined);
  on('behaviorNew', () => undefined);
  on('upgradeBought', () => undefined);
  on('genomeBought', () => undefined);

  // ───────────── boot ─────────────

  if (!readStored()) {
    // No Encargos save yet. A veteran (or a returning player) should not be
    // asked to sow their first seed: silently skip what is already done.
    try {
      const v = deps.getView();
      if (v.era >= 2) st.chain = FIRST_ACT2;
      else
        while (st.chain < FIRST_ACT2) {
          const d = CHAIN[st.chain];
          if (d.goal.delta || !met(d, v, targetOf(d.goal, v), null)) break;
          st.chain++;
        }
    } catch {
      /* view not ready */
    }
  }

  const pollMs = deps.pollMs ?? 1000;
  const timer = pollMs > 0 && typeof setInterval === 'function' ? setInterval(tick, pollMs) : null;

  const viewNow = () => deps.getView();

  const api: Encargos = {
    events,
    on: (type, fn) => events.on(type, fn),
    tick,
    current() {
      const v = viewNow();
      return mainView(v) ?? sideView(v);
    },
    main: () => mainView(viewNow()),
    side: () => sideView(viewNow()),
    why(id) {
      const v = viewNow();
      const view = id ? [mainView(v), sideView(v)].find((x) => x?.id === id) ?? null : (mainView(v) ?? sideView(v));
      const def = view ? byId(view.id, v) : id ? byId(id, v) : undefined;
      if (!def || !deps.story) return false;
      const ask = view?.ask ?? def.ask;
      const lines: LineDef[] = [
        { who: def.who, mood: def.mood, text: ask },
        { who: def.who, mood: def.who === 'vela' ? 'happy' : def.mood, text: def.why },
      ];
      return deps.story.speak(`enc:${def.id}`, ask, lines);
    },
    dismissSide() {
      if (!st.side) return;
      st.side = null;
      st.sideNextAt = now() + SIDE_DISMISS_GAP;
      persist();
      events.emit('change', {});
    },
    cosmetics: () => st.cosmetics,
    signal(name) {
      if (name === 'tab:bestiary' && !st.seenBestiary) {
        st.seenBestiary = true;
        persist();
      }
      scheduleEval();
    },
    notePrint() {
      st.counters.prints++;
      scheduleEval();
    },
    chainProgress: () => ({ done: Math.min(st.chain, CHAIN.length), total: CHAIN.length }),
    serialize: () => JSON.parse(JSON.stringify(st)) as EncargosSave,
    load(data) {
      const ok = load(data);
      if (ok) persist();
      return ok;
    },
    reset() {
      st = freshSave();
      alive = new Map();
      lastProgress.clear();
      nextOfferAt = 0;
      try {
        storage?.removeItem?.(ENCARGOS_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      persist();
      events.emit('change', {});
    },
    dispose() {
      disposed = true;
      if (timer !== null) clearInterval(timer);
      for (const off of offs) off();
      persist();
    },
    debug: {
      offer(id) {
        const v = viewNow();
        const ci = CHAIN.findIndex((e) => e.id === id);
        if (ci >= 0) {
          st.chain = ci;
          nextOfferAt = 0;
          offerMain(v);
          return;
        }
        const sd = byId(id, v);
        if (sd) offerSide(sd, v);
      },
      complete() {
        const v = viewNow();
        const def = chainDef(v);
        if (def && st.chainOfferedAt !== null) {
          const view = mainView(v)!;
          complete(def, view, v);
          st.chain++;
          st.chainOfferedAt = null;
          st.chainBase = null;
          nextOfferAt = now() + NEXT_OFFER_DELAY;
        } else if (st.side) {
          const sd = byId(st.side.id, v)!;
          complete(sd, sideView(v)!, v);
          st.side = null;
          st.sideNextAt = now() + SIDE_GAP;
        }
        persist();
        events.emit('change', {});
      },
    },
  };
  return api;
}
