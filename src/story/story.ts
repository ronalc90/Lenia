/**
 * Story state machine. Listens to game events and polls the GameView, starts
 * scenes when their conditions hold, plays their lines, records choices and
 * playstyle, decides endings and persists itself ('bioluma.story').
 *
 * Flow of one scene (the UI drives the arrows):
 *   sceneStart → line … (advance) … → [choice → chosen → reply lines] → [sceneWait … task done] → sceneEnd
 * A final choice leads to `ending`; the UI plays the cinematic and calls
 * endingDone() ("Continue the experiment"), which queues the epilogue.
 *
 * Pure TS, no DOM. Every storage access is wrapped in try/catch.
 */
import { Bus, type GameEvents } from '../core/bus';
import type { GameView, JournalEntryView, Text } from '../core/types';
import { ENDINGS, computeLeanings, finalOptions, rankLeanings, secretUnlocked } from './endings';
import { ALBOR_LIVE, SCENES, SCENE_BY_ID, SPEAKER_NAMES, STORY_JOURNAL, UNKNOWN_CHOIR } from './script';
import {
  COUNTER_KEYS,
  ENDING_IDS,
  type ArchiveView,
  type ChoiceOptionView,
  type CounterKey,
  type EndingId,
  type HintKind,
  type HintView,
  type Leanings,
  type LineDef,
  type LineView,
  type SceneDef,
  type SceneView,
  type StorageLike,
  type StoryCtx,
  type StoryDeps,
  type StoryEvents,
  type StoryPhase,
  type StorySave,
  type TargetId,
  type WaitDef,
} from './types';

export const STORY_STORAGE_KEY = 'bioluma.story';

/** Timing of the scene scheduler (ms). */
const GAP_CHAIN = 600;
const GAP_TUTORIAL = 1500;
const GAP_ANY = 3000;
/** Story beats (non-tutorial) never come closer than this: the story breathes. */
const GAP_BEAT = 20_000;
/** After the story is created, beats wait this long (splash, offline card…). */
const BOOT_QUIET = 4000;
const SAVE_THROTTLE = 2000;
/** A deferred final question comes back after this long. */
const DEFER_MS = 10 * 60_000;
/** Ambient environmental hints never come closer than this. */
const AMBIENT_GAP = 90_000;
const RHYTHM_SEEDS = 8;
/** Epilogue bubble this long after "Continue the experiment". */
const EPILOGUE_DELAY = 6000;

const HINT_DURATION: Record<HintKind, number> = {
  orbit: 7,
  constellation: 9,
  echo: 6,
  gather: 5,
  lamp: 7,
  tint: 12,
  dawn: 14,
};

const JOURNAL_BY_ID = new Map(STORY_JOURNAL.map((j) => [j.id, j]));
const EPILOGUE_OF = new Map<string, EndingId>(ENDING_IDS.map((id) => [ENDINGS[id].epilogue, id]));

export interface StoryCurrent {
  scene: SceneView;
  phase: StoryPhase;
  line: LineView | null;
  options: ChoiceOptionView[] | null;
  deferrable: boolean;
  wait: { text: Text; target: TargetId[] | null } | null;
  ending: EndingId | null;
}

export interface Story {
  /** Typed emitter: sceneStart, line, choice, chosen, sceneWait, sceneEnd, ending, hint, journal, change. */
  readonly events: Bus<StoryEvents>;
  on<K extends keyof StoryEvents>(type: K, fn: (payload: StoryEvents[K]) => void): () => void;
  /** Evaluate conditions now (also runs every `pollMs` and after each game event). */
  tick(): void;
  /** What is on screen right now (for a UI mounted mid-scene). */
  current(): StoryCurrent | null;
  /** Next line (the UI calls it on tap once the line finished typing). */
  advance(): void;
  /** Pick an option of the current choice. */
  choose(optionId: string): void;
  /** "Not yet" on a deferrable choice: the scene returns later. */
  defer(): void;
  /** Skip the current scene (jumps to its choice if it has one). */
  skip(): void;
  /** Skip every tutorial scene. */
  skipTutorial(): void;
  /** Play the tutorial scenes again (Settings → "restart tutorial"). */
  restartTutorial(): void;
  /** The ending cinematic finished ("Continue the experiment"). */
  endingDone(): void;
  /** UI signal, e.g. 'tab:bestiary' when the player opens that tab. */
  signal(name: string): void;
  /** Re-watch a seen scene (archive): no waits, no choices, no state changes. */
  replay(sceneId: string): boolean;
  /** Start any scene for real, ignoring its conditions (dev tools). */
  play(sceneId: string): boolean;
  /**
   * Scenes told elsewhere (a Momentos card, docs/MOMENTOS.md §2): mark them done without playing
   * them. One thing per event: the tutorial chain continues as if they had played.
   */
  consume(sceneIds: string[]): void;
  /**
   * Say a few lines now as an ad-hoc scene (e.g. an Encargo's "Why?"): no waits,
   * no choices, no state changes. Refused (false) while a real scene is on screen.
   */
  speak(id: string, title: Text, lines: LineDef[]): boolean;
  /** Unlock a story journal entry by id (no-op if unknown or already unlocked). */
  unlockJournal(id: string): void;
  /** The player printed a species (until GameEvents carries a 'print' event). */
  notePrint(): void;
  /**
   * Set a persistent story flag from outside (e.g. 'introSeen' when the opening intro,
   * src/ui/intro, finished: t_intro then skips the hello the intro already said).
   */
  setFlag(name: string, on?: boolean): void;
  setEnabled(on: boolean): void;
  readonly enabled: boolean;
  archive(): ArchiveView;
  leanings(): Leanings;
  /** The two endings the final question would offer right now. */
  finalOptions(): [EndingId, EndingId];
  endings(): readonly EndingId[];
  /** Story journal entries in the GameView shape (ids prefixed "story."). */
  journalViews(): JournalEntryView[];
  markJournalRead(id?: string): void;
  serialize(): StorySave;
  load(data: unknown): boolean;
  /** Forget everything (new game). */
  reset(): void;
  getView(): GameView;
  dispose(): void;
}

interface Active {
  def: SceneDef;
  view: SceneView;
  lines: LineDef[];
  index: number;
  phase: StoryPhase;
  replay: boolean;
  chosen: string | null;
  wait: WaitDef | null;
  waitStart: number;
  base: Record<CounterKey, number>;
  journal: string[];
  options: ChoiceOptionView[] | null;
  ending: EndingId | null;
}

interface State {
  done: Set<string>;
  doneAt: Map<string, number>;
  choices: Record<string, string>;
  counters: Record<CounterKey, number>;
  flags: Set<string>;
  endings: EndingId[];
  lastEndingEra: number;
  journal: string[];
  journalRead: Set<string>;
  eraStartAt: number;
  lastEra: number;
  tutorialSkipped: boolean;
  enabled: boolean;
  deferUntil: Record<string, number>;
}

function zeroCounters(): Record<CounterKey, number> {
  const c = {} as Record<CounterKey, number>;
  for (const k of COUNTER_KEYS) c[k] = 0;
  return c;
}

function freshState(now: number): State {
  return {
    done: new Set(),
    doneAt: new Map(),
    choices: {},
    counters: zeroCounters(),
    flags: new Set(),
    endings: [],
    lastEndingEra: 0,
    journal: [],
    journalRead: new Set(),
    eraStartAt: now,
    lastEra: 0,
    tutorialSkipped: false,
    enabled: true,
    deferUntil: {},
  };
}

function defaultStorage(): StorageLike | null {
  try {
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

const isStrArr = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === 'string');
const isNumRecord = (x: unknown): x is Record<string, number> =>
  !!x && typeof x === 'object' && !Array.isArray(x) && Object.values(x).every((n) => typeof n === 'number' && Number.isFinite(n));
const isStrRecord = (x: unknown): x is Record<string, string> =>
  !!x && typeof x === 'object' && !Array.isArray(x) && Object.values(x).every((n) => typeof n === 'string');

export function createStory(deps: StoryDeps): Story {
  const events = new Bus<StoryEvents>();
  const now = deps.now ?? (() => Date.now());
  const random = deps.random ?? Math.random;
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  const createdAt = now();

  let st = freshState(createdAt);
  let active: Active | null = null;
  let suspended: Active | null = null;
  let lastEndAt = -Infinity;
  let lastBeatEndAt = -Infinity;
  let lastEndWasChainable = false;
  let signals = new Set<string>();
  let seedTimes: number[] = [];
  let lastSeed: { x: number; y: number } | null = null;
  let lastAmbient = -Infinity;
  let dirty = false;
  let lastSave = -Infinity;
  let evalQueued = false;
  let disposed = false;

  // ───────────── persistence ─────────────

  function serialize(): StorySave {
    return {
      v: 1,
      done: [...st.done],
      doneAt: Object.fromEntries(st.doneAt),
      choices: { ...st.choices },
      counters: { ...st.counters },
      flags: [...st.flags],
      endings: [...st.endings],
      lastEndingEra: st.lastEndingEra,
      journal: [...st.journal],
      journalRead: [...st.journalRead],
      eraStartAt: st.eraStartAt,
      lastEra: st.lastEra,
      tutorialSkipped: st.tutorialSkipped,
      enabled: st.enabled,
      deferUntil: { ...st.deferUntil },
    };
  }

  function load(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    const d = data as Partial<Record<keyof StorySave, unknown>>;
    if (d.v !== 1 || !isStrArr(d.done)) return false;
    const s = freshState(now());
    s.done = new Set(d.done.filter((id) => SCENE_BY_ID.has(id)));
    if (isNumRecord(d.doneAt)) for (const [k, v] of Object.entries(d.doneAt)) s.doneAt.set(k, v);
    if (isStrRecord(d.choices)) s.choices = { ...d.choices };
    if (isNumRecord(d.counters)) for (const k of COUNTER_KEYS) s.counters[k] = Math.max(0, d.counters[k] ?? 0);
    if (isStrArr(d.flags)) s.flags = new Set(d.flags);
    if (isStrArr(d.endings)) s.endings = d.endings.filter((e): e is EndingId => (ENDING_IDS as readonly string[]).includes(e));
    if (typeof d.lastEndingEra === 'number') s.lastEndingEra = d.lastEndingEra;
    if (isStrArr(d.journal)) s.journal = d.journal.filter((j) => JOURNAL_BY_ID.has(j));
    if (isStrArr(d.journalRead)) s.journalRead = new Set(d.journalRead);
    if (typeof d.eraStartAt === 'number') s.eraStartAt = d.eraStartAt;
    if (typeof d.lastEra === 'number') s.lastEra = d.lastEra;
    s.tutorialSkipped = d.tutorialSkipped === true;
    s.enabled = d.enabled !== false;
    if (isNumRecord(d.deferUntil)) s.deferUntil = { ...d.deferUntil };
    st = s;
    active = null;
    suspended = null;
    events.emit('change', {});
    return true;
  }

  function persist(): void {
    dirty = false;
    lastSave = now();
    if (!storage) return;
    try {
      storage.setItem(STORY_STORAGE_KEY, JSON.stringify(serialize()));
    } catch {
      /* quota / private mode: the integrator's main save still has serialize() */
    }
  }

  function markDirty(): void {
    dirty = true;
  }

  function readStored(): boolean {
    if (!storage) return false;
    try {
      const raw = storage.getItem(STORY_STORAGE_KEY);
      if (!raw) return false;
      return load(JSON.parse(raw) as unknown);
    } catch {
      return false;
    }
  }

  // ───────────── context & helpers ─────────────

  function view(): GameView {
    return deps.getView();
  }

  function stablesNow(v: GameView): number {
    let n = 0;
    for (const c of v.creatures) if (c.state === 'stable') n++;
    return n;
  }

  function ctx(v: GameView, a: Active | null = null): StoryCtx {
    const t = now();
    return {
      v,
      now: t,
      era: v.era,
      n: (k) => st.counters[k],
      done: (id) => st.done.has(id),
      since: (id) => {
        const at = st.doneAt.get(id);
        return at === undefined ? (st.done.has(id) ? Infinity : -Infinity) : (t - at) / 1000;
      },
      eraAge: () => (t - st.eraStartAt) / 1000,
      choice: (id) => st.choices[id],
      flag: (name) => st.flags.has(name),
      stablesNow: () => stablesNow(v),
      signal: (name) => (a ? signals.has(name) : false),
      ui: (name) => deps.ui?.(name) ?? false,
      endings: () => st.endings,
      lastEndingEra: () => st.lastEndingEra,
    };
  }

  function rhythm(): string {
    const ts = seedTimes.slice(-RHYTHM_SEEDS);
    if (ts.length < 3) return '·  ·    ·  ·';
    let s = '·';
    for (let i = 1; i < ts.length; i++) {
      const gap = ts[i] - ts[i - 1];
      s += gap < 700 ? ' ' : gap < 1600 ? '   ' : '      ';
      s += '·';
    }
    return s;
  }

  function speciesName(v: GameView, pick: 'first' | 'best'): string {
    if (!v.species.length) return 'Orbium';
    let sp = v.species[0];
    if (pick === 'best') for (const s of v.species) if (s.mult > sp.mult) sp = s;
    // The common name the Bestiary shows ("Nadadora celeste"); the Latin stays small on its card (CLARIDAD J-128).
    return sp.name;
  }

  function resolveText(text: Text, v: GameView): Text {
    if (!text.es.includes('{') && !text.en.includes('{')) return text;
    const rep = (s: string) =>
      s
        .replace(/\{first\}/g, speciesName(v, 'first'))
        .replace(/\{best\}/g, speciesName(v, 'best'))
        .replace(/\{rhythm\}/g, rhythm());
    return { es: rep(text.es), en: rep(text.en) };
  }

  function lineView(a: Active, v: GameView): LineView {
    const l = a.lines[a.index];
    let name: Text = SPEAKER_NAMES[l.who];
    if (l.who === 'coro' && !st.flags.has('choirNamed')) name = UNKNOWN_CHOIR;
    if (l.who === 'albor' && l.live) name = ALBOR_LIVE;
    return {
      who: l.who,
      name,
      mood: l.mood ?? 'neutral',
      text: resolveText(l.text, v),
      target: l.target ?? null,
      live: !!l.live,
      index: a.index,
    };
  }

  function leanings(v: GameView = view()): Leanings {
    return computeLeanings({ choices: st.choices, counters: st.counters, view: v });
  }

  function emitHint(kind: HintKind, extra: Partial<HintView> = {}): void {
    const h: HintView = { kind, duration: HINT_DURATION[kind], ...extra };
    if (kind === 'tint' && !h.color) h.color = ENDINGS[rankLeanings(leanings())[0]].color;
    if (kind === 'lamp' && !h.color) h.color = '#FFD9A0';
    if (kind === 'dawn' && !h.color) h.color = '#FFE9C7';
    if (kind === 'gather' && lastSeed && h.x === undefined) {
      h.x = lastSeed.x;
      h.y = lastSeed.y;
    }
    events.emit('hint', h);
  }

  function unlockJournal(id: string): void {
    const j = JOURNAL_BY_ID.get(id);
    if (!j || st.journal.includes(id)) return;
    st.journal.push(id);
    markDirty();
    events.emit('journal', { id: `story.${id}`, text: j.text });
  }

  // ───────────── scene lifecycle ─────────────

  function sceneView(def: SceneDef, replay: boolean): SceneView {
    return { id: def.id, act: def.act, title: def.title, tutorial: !!def.tutorial, replay };
  }

  function start(def: SceneDef, replay: boolean): void {
    const v = view();
    const lines = typeof def.lines === 'function' ? def.lines(ctx(v)) : [...def.lines];
    const a: Active = {
      def,
      view: sceneView(def, replay),
      lines,
      index: 0,
      phase: 'lines',
      replay,
      chosen: null,
      wait: null,
      waitStart: 0,
      base: { ...st.counters },
      journal: [],
      options: null,
      ending: null,
    };
    if (replay && def.choice && def.choice.options !== 'final') {
      // Re-watching: show what the player picked, skip the prompt.
      const picked = def.choice.options.find((o) => o.id === st.choices[def.choice!.id]);
      if (picked?.reply) a.lines.push(...picked.reply);
    }
    active = a;
    events.emit('sceneStart', { scene: a.view });
    if (a.lines.length) showLine(a, v);
    else afterLines(a);
  }

  function showLine(a: Active, v: GameView): void {
    const lv = lineView(a, v);
    const l = a.lines[a.index];
    if (!a.replay && l.hint) emitHint(l.hint);
    events.emit('line', { scene: a.view, line: lv });
  }

  function afterLines(a: Active): void {
    if (a.replay) return finish(a, false);
    const ch = a.def.choice;
    if (ch && a.chosen === null) {
      a.phase = 'choice';
      a.options = buildOptions(ch.options === 'final');
      events.emit('choice', { scene: a.view, choiceId: ch.id, options: a.options, deferrable: !!ch.deferrable });
      return;
    }
    const w = a.wait ?? (a.chosen === null || !a.def.choice ? (a.def.wait ?? null) : null);
    if (w && a.phase !== 'wait') return beginWait(a, w);
    finish(a, false);
  }

  function buildOptions(final: boolean): ChoiceOptionView[] {
    const def = active?.def.choice;
    if (!def) return [];
    if (final || def.options === 'final') {
      const v = view();
      const ids = finalOptions(leanings(v), secretUnlocked(st.choices, v));
      return ids.map((id) => ({ id, label: ENDINGS[id].option, color: ENDINGS[id].color }));
    }
    return def.options.map((o) => ({ id: o.id, label: o.label, color: null }));
  }

  function beginWait(a: Active, w: WaitDef): void {
    a.phase = 'wait';
    a.wait = w;
    a.waitStart = now();
    a.base = { ...st.counters };
    signals = new Set();
    events.emit('sceneWait', { scene: a.view, text: w.text, target: w.target ?? null });
    checkWait();
  }

  function waitSatisfied(a: Active, v: GameView): boolean {
    const w = a.wait;
    if (!w) return true;
    if (w.event && st.counters[w.event] - a.base[w.event] >= (w.count ?? 1)) return true;
    if (w.signal && signals.has(w.signal)) return true;
    if (w.until && w.until(ctx(v, a))) return true;
    if (w.timeoutSec !== undefined && (now() - a.waitStart) / 1000 >= w.timeoutSec) return true;
    return false;
  }

  function checkWait(): void {
    const a = active;
    if (!a || a.phase !== 'wait') return;
    if (waitSatisfied(a, view())) finish(a, false);
  }

  function finish(a: Active, skipped: boolean, opts: { deferred?: boolean } = {}): void {
    if (active !== a) return;
    const t = now();
    if (!a.replay && !opts.deferred) {
      st.done.add(a.def.id);
      st.doneAt.set(a.def.id, t);
      for (const f of a.def.sets ?? []) st.flags.add(f);
      const ep = EPILOGUE_OF.get(a.def.id);
      if (ep) st.flags.delete(`pendingEp:${ep}`);
      if (a.def.journal) unlockJournal(a.def.journal);
      for (const j of a.journal) unlockJournal(j);
      delete st.deferUntil[a.def.id];
    }
    active = null;
    lastEndAt = t;
    lastEndWasChainable = !a.replay;
    if (!a.def.tutorial && !a.replay) lastBeatEndAt = t;
    events.emit('sceneEnd', { sceneId: a.def.id, skipped, replay: a.replay });
    events.emit('change', {});
    if (!a.replay) persist();
    // Resume a task that an urgent scene interrupted.
    if (suspended) {
      const s = suspended;
      suspended = null;
      active = s;
      events.emit('sceneWait', { scene: s.view, text: s.wait!.text, target: s.wait!.target ?? null });
      checkWait();
    }
  }

  // ───────────── scheduler ─────────────

  function eligible(def: SceneDef, c: StoryCtx, t: number): boolean {
    if (!def.repeatable && st.done.has(def.id)) return false;
    if (def.tutorial && st.tutorialSkipped) return false;
    if ((st.deferUntil[def.id] ?? 0) > t) return false;
    if (def.after && !def.after.every((id) => st.done.has(id))) return false;
    return def.when(c);
  }

  function gapOk(def: SceneDef, t: number): boolean {
    if (def.chain && lastEndWasChainable) return t - lastEndAt >= GAP_CHAIN;
    if (def.tutorial) return t - lastEndAt >= GAP_TUTORIAL;
    return t - lastEndAt >= GAP_ANY && t - lastBeatEndAt >= GAP_BEAT && t - createdAt >= BOOT_QUIET;
  }

  function pickScene(v: GameView, t: number, onlyPreempting: boolean): SceneDef | null {
    const c = ctx(v);
    let best: SceneDef | null = null;
    for (const def of SCENES) {
      if (onlyPreempting && !def.urgent && !def.chain) continue;
      // Another surface (e.g. a "moment" explainer) is voicing this beat right now.
      if (deps.suppress?.(def.id)) continue;
      if (!gapOk(def, t)) continue;
      if (!eligible(def, c, t)) continue;
      if (!best || (def.priority ?? 0) > (best.priority ?? 0)) best = def;
    }
    return best;
  }

  function trackEra(v: GameView): void {
    if (v.era !== st.lastEra) {
      if (v.era > st.lastEra && st.lastEra !== 0) st.eraStartAt = now();
      st.lastEra = v.era;
      markDirty();
    }
  }

  function ambient(v: GameView, t: number): void {
    if (active || t - lastAmbient < AMBIENT_GAP * 2) return;
    if (st.done.has('a3_words') && stablesNow(v) >= 3 && random() < 0.25) {
      lastAmbient = t;
      emitHint(random() < 0.5 ? 'echo' : 'constellation');
    } else if (st.done.has('a3_dawn') && !st.endings.length && random() < 0.2) {
      lastAmbient = t;
      emitHint('dawn');
    }
  }

  function tick(): void {
    if (disposed) return;
    const v = view();
    trackEra(v);
    const t = now();
    if (active?.phase === 'wait') checkWait();
    if (st.enabled && !(deps.isBlocked?.() ?? false)) {
      if (!active) {
        const def = pickScene(v, t, false);
        if (def) start(def, false);
        else ambient(v, t);
      } else if (active.phase === 'wait' && !active.replay && !suspended) {
        const def = pickScene(v, t, true);
        if (def && def.id !== active.def.id) {
          suspended = active;
          active = null;
          start(def, false);
        }
      }
    }
    if (dirty && t - lastSave >= SAVE_THROTTLE) persist();
  }

  function scheduleEval(): void {
    markDirty();
    if (evalQueued || disposed) return;
    evalQueued = true;
    const run = () => {
      evalQueued = false;
      tick();
    };
    if (typeof queueMicrotask === 'function') queueMicrotask(run);
    else void Promise.resolve().then(run);
  }

  // ───────────── game events ─────────────

  const bump = (k: CounterKey, by = 1) => {
    st.counters[k] += by;
  };
  const offs: (() => void)[] = [];
  const on = <K extends keyof GameEvents>(type: K, fn: (p: GameEvents[K]) => void) =>
    offs.push(
      deps.bus.on(type, (p) => {
        fn(p);
        scheduleEval();
      }),
    );

  on('seed', ({ x, y, manual }) => {
    if (!manual) return bump('autoSeeds');
    bump('seeds');
    bump('taps');
    seedTimes.push(now());
    if (seedTimes.length > RHYTHM_SEEDS * 2) seedTimes = seedTimes.slice(-RHYTHM_SEEDS);
    lastSeed = { x, y };
    if (st.done.has('a2_memory') && now() - lastAmbient >= AMBIENT_GAP && random() < 0.06) {
      lastAmbient = now();
      emitHint('gather', { x, y });
    }
  });
  on('seedDenied', () => bump('taps'));
  on('creatureBorn', () => bump('born'));
  on('creatureStable', () => bump('stables'));
  on('creatureDied', () => bump('deaths'));
  on('creatureExploded', () => bump('explosions'));
  on('creatureDivided', () => bump('divisions'));
  on('speciesNew', () => bump('species'));
  on('behaviorNew', () => bump('behaviors'));
  on('goldenSpawn', () => {
    bump('goldenSpawn');
    if (st.done.has('a3_tint')) emitHint('tint');
    else if (st.done.has('a2_orbit') && random() < 0.25) emitHint('orbit');
  });
  on('goldenCollected', () => bump('goldenCaught'));
  on('goldenMissed', () => bump('goldenMissed'));
  on('calibrationChanged', () => bump('calib'));
  on('upgradeBought', () => bump('upgrades'));
  on('genomeBought', () => bump('genome'));
  on('extinctionStart', () => {
    bump('extStart');
    if (st.choices.lamp === 'lamp') emitHint('lamp');
  });
  on('extinctionDone', ({ era }) => {
    bump('extDone');
    st.eraStartAt = now();
    st.lastEra = era;
  });
  // Sessions cycle: a new night is the story's new era (docs/CICLO.md §5; nothing is wiped).
  on('nightStart', ({ night }) => {
    bump('extDone');
    st.eraStartAt = now();
    st.lastEra = night;
  });
  on('offlineReturn', () => bump('offline'));

  // ───────────── boot ─────────────

  const hadSave = readStored();
  if (!hadSave) {
    // A veteran save without story state: don't teach what they already know.
    try {
      const v = view();
      st.lastEra = v.era;
      if (v.stats.seeds > 0) {
        st.tutorialSkipped = true;
        for (const s of SCENES) if (s.tutorial) st.done.add(s.id);
      }
      if (v.era >= 2) {
        st.done.add('a1_extinction');
        st.done.add('a1_night');
        st.done.add('a1_committee');
      }
    } catch {
      /* view not ready: plain fresh start */
    }
  }

  const pollMs = deps.pollMs ?? 1000;
  const timer = pollMs > 0 && typeof setInterval === 'function' ? setInterval(tick, pollMs) : null;

  // ───────────── public API ─────────────

  const story: Story = {
    events,
    on: (type, fn) => events.on(type, fn),
    tick,
    current() {
      const a = active;
      if (!a) return null;
      const v = view();
      return {
        scene: a.view,
        phase: a.phase,
        line: a.phase === 'lines' && a.index < a.lines.length ? lineView(a, v) : null,
        options: a.phase === 'choice' ? a.options : null,
        deferrable: a.phase === 'choice' && !!a.def.choice?.deferrable,
        wait: a.phase === 'wait' && a.wait ? { text: a.wait.text, target: a.wait.target ?? null } : null,
        ending: a.phase === 'ending' ? a.ending : null,
      };
    },
    advance() {
      const a = active;
      if (!a || a.phase !== 'lines') return;
      a.index++;
      if (a.index < a.lines.length) showLine(a, view());
      else afterLines(a);
    },
    choose(optionId) {
      const a = active;
      const ch = a?.def.choice;
      if (!a || !ch || a.phase !== 'choice' || !a.options?.some((o) => o.id === optionId)) return;
      a.chosen = optionId;
      st.choices[ch.id] = optionId;
      markDirty();
      events.emit('chosen', { choiceId: ch.id, optionId });
      if (ch.options === 'final') {
        const id = optionId as EndingId;
        if (!st.endings.includes(id)) st.endings.push(id);
        st.lastEndingEra = view().era;
        // Persisted now, so the epilogue still plays if the app closes mid-cinematic.
        st.flags.add(`pendingEp:${id}`);
        unlockJournal(`s_end_${id}`);
        st.done.add(a.def.id);
        st.doneAt.set(a.def.id, now());
        delete st.deferUntil[a.def.id];
        a.phase = 'ending';
        a.ending = id;
        persist();
        events.emit('ending', { id });
        events.emit('change', {});
        return;
      }
      const opt = ch.options.find((o) => o.id === optionId)!;
      if (opt.journal) a.journal.push(opt.journal);
      a.wait = opt.wait ?? null;
      persist();
      const reply = opt.reply ?? [];
      if (reply.length) {
        a.phase = 'lines';
        a.lines.push(...reply);
        a.index = a.lines.length - reply.length;
        showLine(a, view());
      } else {
        a.phase = 'lines';
        a.index = a.lines.length;
        afterLines(a);
      }
    },
    defer() {
      const a = active;
      if (!a || a.phase !== 'choice' || !a.def.choice?.deferrable) return;
      st.deferUntil[a.def.id] = now() + DEFER_MS;
      events.emit('chosen', { choiceId: a.def.choice.id, optionId: null });
      finish(a, true, { deferred: true });
    },
    skip() {
      const a = active;
      if (!a) return;
      if (a.phase === 'lines') {
        if (!a.replay && a.def.choice && a.chosen === null) {
          a.index = a.lines.length;
          afterLines(a);
          return;
        }
        finish(a, true);
      } else if (a.phase === 'wait') finish(a, true);
      else if (a.phase === 'choice') story.defer();
    },
    skipTutorial() {
      st.tutorialSkipped = true;
      for (const s of SCENES) if (s.tutorial) st.done.add(s.id);
      if (suspended?.def.tutorial) suspended = null;
      if (active?.def.tutorial && !active.replay) finish(active, true);
      else persist();
    },
    restartTutorial() {
      st.tutorialSkipped = false;
      for (const s of SCENES)
        if (s.tutorial) {
          st.done.delete(s.id);
          st.doneAt.delete(s.id);
        }
      // Counters drive the tutorial's "first time" triggers: start them over too.
      for (const k of ['seeds', 'taps', 'deaths', 'explosions', 'stables', 'goldenCaught', 'goldenMissed', 'calib'] as const) st.counters[k] = 0;
      persist();
      events.emit('change', {});
    },
    endingDone() {
      const a = active;
      if (!a || a.phase !== 'ending' || !a.ending) return;
      finish(a, false);
      // Let the player settle back for a few seconds, then the epilogue.
      lastBeatEndAt = now() - GAP_BEAT + EPILOGUE_DELAY;
    },
    signal(name) {
      signals.add(name);
      checkWait();
    },
    replay(sceneId) {
      const def = SCENE_BY_ID.get(sceneId);
      if (!def || !st.doneAt.has(sceneId) || (active && !active.replay)) return false;
      if (active) finish(active, true);
      start(def, true);
      return true;
    },
    play(sceneId) {
      const def = SCENE_BY_ID.get(sceneId);
      if (!def) return false;
      if (active) {
        const a = active;
        active = null;
        events.emit('sceneEnd', { sceneId: a.def.id, skipped: true, replay: a.replay });
      }
      suspended = null;
      start(def, false);
      return true;
    },
    consume(ids) {
      let changed = false;
      for (const id of ids) {
        if (!SCENE_BY_ID.has(id) || st.done.has(id)) continue;
        if (active && active.def.id === id && !active.replay) {
          finish(active, true);
          continue;
        }
        if (suspended?.def.id === id) suspended = null;
        // No doneAt: it was never watched, so it stays out of the Historia archive.
        st.done.add(id);
        changed = true;
      }
      if (changed) {
        persist();
        events.emit('change', {});
      }
    },
    speak(id, title, lines) {
      if (!lines.length || (active && !active.replay)) return false;
      if (active) finish(active, true);
      start({ id, act: 1, title, when: () => false, lines: [...lines] }, true);
      return true;
    },
    unlockJournal(id) {
      unlockJournal(id);
      persist();
    },
    notePrint() {
      bump('prints');
      markDirty();
    },
    setFlag(name, on = true) {
      if (on === st.flags.has(name)) return;
      if (on) st.flags.add(name);
      else st.flags.delete(name);
      persist();
      events.emit('change', {});
    },
    setEnabled(on) {
      st.enabled = on;
      if (!on && active && !active.replay && active.phase !== 'ending') {
        const a = active;
        active = null;
        suspended = null;
        events.emit('sceneEnd', { sceneId: a.def.id, skipped: true, replay: false });
      }
      persist();
    },
    get enabled() {
      return st.enabled;
    },
    archive() {
      const v = view();
      const endings = ENDING_IDS.map((id) => ({
        id,
        title: ENDINGS[id].title,
        found: st.endings.includes(id),
        secret: !!ENDINGS[id].secret,
        color: ENDINGS[id].color,
      }));
      return {
        scenes: SCENES.map((s) => ({ id: s.id, act: s.act, title: s.title, seen: st.doneAt.has(s.id) })),
        endings,
        found: endings.filter((e) => e.found && !e.secret).length,
        total: endings.filter((e) => !e.secret).length,
        leanings: leanings(v),
      };
    },
    leanings: () => leanings(),
    finalOptions() {
      const v = view();
      return finalOptions(leanings(v), secretUnlocked(st.choices, v));
    },
    endings: () => st.endings,
    journalViews() {
      return st.journal.map((id) => ({ id: `story.${id}`, text: JOURNAL_BY_ID.get(id)!.text, read: st.journalRead.has(id) }));
    },
    markJournalRead(id) {
      if (id) st.journalRead.add(id.replace(/^story\./, ''));
      else for (const j of st.journal) st.journalRead.add(j);
      markDirty();
    },
    serialize,
    load(data) {
      const ok = load(data);
      if (ok) persist();
      return ok;
    },
    reset() {
      if (active) {
        const a = active;
        active = null;
        events.emit('sceneEnd', { sceneId: a.def.id, skipped: true, replay: a.replay });
      }
      suspended = null;
      st = freshState(now());
      seedTimes = [];
      lastSeed = null;
      lastEndAt = -Infinity;
      lastBeatEndAt = -Infinity;
      try {
        storage?.removeItem?.(STORY_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      persist();
      events.emit('change', {});
    },
    getView: view,
    dispose() {
      disposed = true;
      if (timer !== null) clearInterval(timer);
      for (const off of offs) off();
      if (dirty) persist();
    },
  };
  return story;
}
