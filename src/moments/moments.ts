/**
 * Momentos state machine. Watches the game bus and the view, decides when a
 * first-time explainer opens, queues them (one at a time, by priority, with a
 * cooldown), never interrupts the extinction ritual or whatever the integrator
 * says owns the screen (splash, modal, story dialogue/cinematic), persists what
 * was already explained ('bioluma.moments') and exposes isPausing() so the
 * integrator stops the simulation and the economy while a card is open.
 *
 * Pure TS, no DOM. Every storage access is wrapped in try/catch.
 */
import { Bus, type GameEvents } from '../core/bus';
import type { GameView } from '../core/types';
import { HELP_ORDER, MOMENT_BY_ID, MOMENTS } from './catalog';
import {
  BOOT_QUIET_MS,
  BRIEF_MS,
  COOLDOWN_BRIEF_MS,
  COOLDOWN_MS,
  MAX_QUEUE_MS,
  MOMENTS_STORAGE_KEY,
  POLL_MS,
  PRIORITY_GRACE_MS,
  RITUAL_BLOCK_MS,
} from './config';
import {
  EXPLAIN_MODES,
  STATUS_LABEL_MODES,
  type Built,
  type Chip,
  type ExplainMode,
  type MomentData,
  type MomentDef,
  type MomentId,
  type MomentView,
  type MomentsDeps,
  type MomentsEvents,
  type MomentsSave,
  type PollMemory,
  type StatusLabelMode,
  type StorageLike,
  type TriggerCtx,
} from './types';

export interface HelpEntry {
  id: MomentId;
  seen: boolean;
  def: MomentDef;
}

export interface Moments {
  /** Typed emitter: open, close, change. */
  readonly events: Bus<MomentsEvents>;
  on<K extends keyof MomentsEvents>(type: K, fn: (payload: MomentsEvents[K]) => void): () => void;
  /** Poll the view and run the scheduler (also runs every `pollMs` and after each game event). */
  tick(): void;
  /** What is open right now. */
  current(): MomentView | null;
  /** A paused card is open: the integrator stops the simulation + economy. */
  isPausing(): boolean;
  /** Something is open or queued (the story should not start a scene now). */
  isBusy(): boolean;
  /** "¡Entendido!" / brief label done. */
  dismiss(): void;
  /** "No volver a explicar": switch to brief labels and close. */
  neverAgain(): void;
  readonly mode: ExplainMode;
  setMode(m: ExplainMode): void;
  /** Creature status pills setting. */
  readonly labels: StatusLabelMode;
  setLabels(m: StatusLabelMode): void;
  /** Should status pills show on every creature (not only the tapped one) in this era? */
  labelsOnAll(era: number): boolean;
  seen(id: MomentId): boolean;
  /** Queued or on screen right now. */
  isActive(id: MomentId): boolean;
  /** Explained moments, in help-sheet order. */
  help(): HelpEntry[];
  /** Would this moment show if it happened now (not explained yet and explaining is on)? */
  wouldShow(id: MomentId): boolean;
  /** Re-watch a card (help sheet): no pause, no camera, nothing changes. */
  replay(id: MomentId): boolean;
  /**
   * Something happened that no bus event carries (e.g. the early runaway watch dissolved a maze nucleus):
   * queue this moment through the normal path, first time only (mode, cooldown, blocked, downgrade all
   * apply). `payload` is what its event would carry. Returns true when it was queued.
   */
  notify(id: MomentId, payload: unknown): boolean;
  /** Dev / tests: open a moment right now, as if it had just happened (ignores seen). */
  show(id: MomentId, opts?: { payload?: unknown; mode?: 'full' | 'brief' }): boolean;
  /** Dev: forget one (or every) explained moment. */
  forget(id?: MomentId): void;
  serialize(): MomentsSave;
  load(data: unknown): boolean;
  /** New game: forget everything (keeps the explain mode). */
  reset(): void;
  dispose(): void;
}

interface Queued {
  def: MomentDef;
  built: Built;
  /** Ready to open at (ms). */
  at: number;
  queuedAt: number;
}

interface Memo {
  chips: Chip[];
  data: MomentData;
}

/** Example payloads used to re-watch a card or to preview it (dev page). */
export const SAMPLE_PAYLOADS: Partial<{ [K in keyof GameEvents]: GameEvents[K] }> = {
  seed: { x: 96, y: 120, cost: 2, manual: true },
  creatureDied: { id: 1, x: 96, y: 120 },
  creatureExploded: { id: 1, x: 96, y: 120 },
  creatureStable: { id: 1, x: 96, y: 120 },
  creatureDivided: { parentId: 1, x: 96, y: 120 },
  income: { id: 1, x: 96, y: 120, amount: 1.5 },
  speciesNew: { speciesId: 'sp2', name: 'Scutium solidus', rarity: 'uncommon', x: 96, y: 120 },
  behaviorNew: { behavior: 'swimmer', x: 96, y: 120 },
  goldenSpawn: { x: 96, y: 120 },
  upgradeBought: { id: 'dropper', level: 1 },
  calibrationChanged: { mu: 0.15, sigma: 0.026, R: 13, dt: 0.1 },
  extinctionDone: { era: 2, genome: 9 },
  offlineReturn: { seconds: 11400, essence: 12400 },
  dishOvergrown: { on: true },
};

const WATCHED: (keyof GameEvents)[] = [
  'seed',
  'creatureBorn',
  'creatureStable',
  'creatureDied',
  'creatureExploded',
  'creatureDivided',
  'income',
  'speciesNew',
  'behaviorNew',
  'upgradeBought',
  'goldenSpawn',
  'goldenCollected',
  'calibrationChanged',
  'offlineReturn',
  'extinctionStart',
  'extinctionDone',
  'dishClear',
  'dishOvergrown',
];

function defaultStorage(): StorageLike | null {
  try {
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

const isMomentId = (x: unknown): x is MomentId => typeof x === 'string' && MOMENT_BY_ID.has(x as MomentId);

export function createMoments(deps: MomentsDeps): Moments {
  const events = new Bus<MomentsEvents>();
  const now = deps.now ?? (() => Date.now());
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  const createdAt = now();

  let seen = new Set<MomentId>();
  let memo = new Map<MomentId, Memo>();
  let mode: ExplainMode = 'full';
  let labels: StatusLabelMode = 'auto';
  let queue: Queued[] = [];
  let open: (MomentView & { until: number }) | null = null;
  let lastCloseAt = -Infinity;
  let lastCloseBrief = false;
  let ritualUntil = -Infinity;
  let seq = 0;
  let disposed = false;
  let evalQueued = false;
  /** Behaviour moments told as a brief label while deferred: their full card waits for a creature. */
  const deferred = new Set<MomentId>();
  const lastAt = new Map<keyof GameEvents, number>();
  const lastPayload = new Map<keyof GameEvents, unknown>();
  const prev: PollMemory = { seedCost: null, calib: null };

  // ───────────── persistence ─────────────

  function serialize(): MomentsSave {
    return { v: 1, seen: [...seen], mode, labels };
  }

  function load(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    const d = data as Partial<Record<keyof MomentsSave | 'memo', unknown>>;
    if (d.v !== 1 || !Array.isArray(d.seen)) return false;
    seen = new Set(d.seen.filter(isMomentId));
    if (typeof d.mode === 'string' && (EXPLAIN_MODES as readonly string[]).includes(d.mode)) mode = d.mode as ExplainMode;
    if (typeof d.labels === 'string' && (STATUS_LABEL_MODES as readonly string[]).includes(d.labels)) labels = d.labels as StatusLabelMode;
    memo = new Map();
    if (d.memo && typeof d.memo === 'object') {
      for (const [k, m] of Object.entries(d.memo as Record<string, unknown>)) {
        if (!isMomentId(k) || !m || typeof m !== 'object') continue;
        const mm = m as Partial<Memo>;
        if (Array.isArray(mm.chips) && mm.data && typeof mm.data === 'object') memo.set(k, { chips: mm.chips, data: mm.data });
      }
    }
    queue = queue.filter((q) => !seen.has(q.def.id));
    events.emit('change', {});
    return true;
  }

  function persist(): void {
    if (!storage) return;
    try {
      storage.setItem(MOMENTS_STORAGE_KEY, JSON.stringify({ ...serialize(), memo: Object.fromEntries(memo) }));
    } catch {
      /* quota / private mode: harmless, the player may just see a card again */
    }
  }

  function readStored(): void {
    if (!storage) return;
    try {
      const raw = storage.getItem(MOMENTS_STORAGE_KEY);
      if (raw) load(JSON.parse(raw) as unknown);
    } catch {
      /* corrupt: start fresh */
    }
  }

  // ───────────── context ─────────────

  const ctx: TriggerCtx = {
    view: () => deps.getView(),
    seen: (id) => seen.has(id),
    prev,
    since: (e) => {
      const at = lastAt.get(e);
      return at === undefined ? Infinity : now() - at;
    },
    last: (e) => lastPayload.get(e),
  };

  function canQueue(def: MomentDef): boolean {
    if (mode === 'off') return false;
    if (seen.has(def.id)) return false;
    if (open && open.id === def.id && !open.replay) return false;
    if (def.requires && !seen.has(def.requires)) return false;
    return true;
  }

  function enqueue(def: MomentDef, payload: unknown): void {
    const t = now();
    const q = queue.find((x) => x.def.id === def.id);
    if (q) {
      // First occurrence wins, except "settle" moments: re-arm and merge.
      if (def.settleMs !== undefined) {
        const latest = def.build(payload, ctx);
        q.built = def.merge ? def.merge(q.built, latest) : latest;
        q.at = t + def.settleMs;
      }
      return;
    }
    let built: Built;
    try {
      built = def.build(payload, ctx);
    } catch (err) {
      console.warn(`[moments] build failed for ${def.id}`, err);
      return;
    }
    queue.push({ def, built, at: t + (def.settleMs ?? def.delayMs ?? 0), queuedAt: t });
  }

  // ───────────── scheduler ─────────────

  function viewOf(def: MomentDef, built: Built, m: 'full' | 'brief', replay: boolean): MomentView {
    return {
      id: def.id,
      mode: m,
      title: def.title,
      lines: built.lines ?? def.lines,
      brief: def.brief,
      illustration: def.illustration,
      icon: def.icon,
      mood: def.mood,
      color: def.color,
      focus: built.focus,
      chips: built.chips,
      data: built.data,
      action: replay ? null : (def.action ?? null),
      replay,
      seq: ++seq,
    };
  }

  function openNow(def: MomentDef, built: Built, m: 'full' | 'brief', replay: boolean): void {
    const v = viewOf(def, built, m, replay);
    open = { ...v, until: m === 'brief' ? now() + BRIEF_MS : Infinity };
    events.emit('open', { moment: v });
  }

  function markSeen(def: MomentDef, built: Built): void {
    seen.add(def.id);
    memo.set(def.id, { chips: built.chips, data: built.data });
    for (const id of def.alsoMarks ?? []) {
      seen.add(id);
      queue = queue.filter((q) => q.def.id !== id);
    }
    persist();
    events.emit('change', {});
  }

  function close(): void {
    const o = open;
    if (!o) return;
    open = null;
    if (!o.replay) {
      lastCloseAt = now();
      lastCloseBrief = o.mode === 'brief';
    }
    events.emit('close', { id: o.id, replay: o.replay });
  }

  function blocked(t: number): boolean {
    if (t - createdAt < BOOT_QUIET_MS) return true;
    if (t < ritualUntil) return true;
    try {
      return deps.isBlocked?.() ?? false;
    } catch {
      return false;
    }
  }

  function schedule(): void {
    const t = now();
    if (open) {
      if (open.mode === 'brief' && t >= open.until) close();
      if (open) return;
    }
    // Stale dish moments are dropped (the creature moved on); they can come back next time.
    queue = queue.filter((q) => !(q.built.focus.grid && t - q.queuedAt > MAX_QUEUE_MS));
    if (!queue.length || mode === 'off') return;
    if (blocked(t)) return;
    if (t - lastCloseAt < (lastCloseBrief ? COOLDOWN_BRIEF_MS : COOLDOWN_MS)) return;
    const ready = queue
      .filter((q) => q.at <= t)
      .sort((a, b) => b.def.priority - a.def.priority || a.queuedAt - b.queuedAt);
    if (!ready.length) return;
    // Things that happen together open in priority order: wait briefly for a more important one.
    const top = ready[0].def.priority;
    if (queue.some((q) => q.at > t && q.at - t <= PRIORITY_GRACE_MS && q.def.priority > top)) return;
    for (const q of ready) {
      queue = queue.filter((x) => x !== q);
      if (seen.has(q.def.id)) continue;
      let ok = true;
      try {
        ok = q.def.valid ? q.def.valid(q.built.data, ctx) : true;
      } catch {
        ok = false;
      }
      if (!ok) continue;
      let downgrade = false;
      let later = false;
      try {
        downgrade = deps.downgrade?.(q.def.id) ?? false;
        later = !q.def.forceBrief && mode === 'full' && (deps.defer?.(q.def.id) ?? false);
      } catch {
        downgrade = false;
      }
      const m: 'full' | 'brief' = q.def.forceBrief || mode === 'brief' || downgrade || later ? 'brief' : 'full';
      if (later) {
        if (q.def.id.startsWith('behavior.')) deferred.add(q.def.id);
      } else markSeen(q.def, q.built);
      openNow(q.def, q.built, m, false);
      return;
    }
  }

  /** A deferred behaviour card comes back once it is allowed and a creature shows that behaviour. */
  function pollDeferred(): void {
    if (!deferred.size || mode !== 'full') return;
    let v: GameView;
    try {
      v = deps.getView();
    } catch {
      return;
    }
    for (const id of [...deferred]) {
      const def = MOMENT_BY_ID.get(id);
      if (!def || seen.has(id)) {
        deferred.delete(id);
        continue;
      }
      let still = true;
      try {
        still = deps.defer?.(id) ?? false;
      } catch {
        still = false;
      }
      if (still || !canQueue(def) || queue.some((q) => q.def.id === id)) continue;
      const b = id.slice('behavior.'.length);
      const c = v.creatures.find((x) => x.state === 'stable' && x.behavior === b);
      if (!c) continue;
      deferred.delete(id);
      enqueue(def, { behavior: b, x: c.x, y: c.y });
    }
  }

  function poll(): void {
    pollDeferred();
    if (mode !== 'off') {
      for (const def of MOMENTS) {
        if (def.trigger.kind !== 'poll' || !canQueue(def)) continue;
        if (queue.some((q) => q.def.id === def.id)) continue;
        let hit = false;
        try {
          hit = def.trigger.when(ctx);
        } catch {
          hit = false;
        }
        if (hit) enqueue(def, undefined);
      }
    }
    // Remember the view for the next "went up/down" checks.
    try {
      const v = deps.getView();
      prev.seedCost = v.seedCost;
      const c = v.calibration;
      prev.calib = { mu: c.mu, sigma: c.sigma, R: c.R, dt: c.dt };
    } catch {
      /* view not ready */
    }
  }

  function tick(): void {
    if (disposed) return;
    poll();
    schedule();
  }

  function scheduleEval(): void {
    if (evalQueued || disposed) return;
    evalQueued = true;
    const run = () => {
      evalQueued = false;
      if (!disposed) schedule();
    };
    if (typeof queueMicrotask === 'function') queueMicrotask(run);
    else void Promise.resolve().then(run);
  }

  // ───────────── bus ─────────────

  const byEvent = new Map<keyof GameEvents, MomentDef[]>();
  for (const def of MOMENTS) {
    if (def.trigger.kind !== 'event') continue;
    const list = byEvent.get(def.trigger.event) ?? [];
    list.push(def);
    byEvent.set(def.trigger.event, list);
  }
  const offs: (() => void)[] = [];
  for (const ev of new Set<keyof GameEvents>([...WATCHED, ...byEvent.keys()])) {
    offs.push(
      deps.bus.on(ev, (payload) => {
        if (disposed) return;
        lastAt.set(ev, now());
        lastPayload.set(ev, payload);
        if (ev === 'extinctionStart') ritualUntil = now() + RITUAL_BLOCK_MS;
        if (ev === 'dishClear') queue = queue.filter((q) => !q.built.focus.grid);
        for (const def of byEvent.get(ev) ?? []) {
          if (!canQueue(def) || def.trigger.kind !== 'event') continue;
          let hit = true;
          try {
            hit = def.trigger.when ? def.trigger.when(payload, ctx) : true;
          } catch {
            hit = false;
          }
          if (hit) enqueue(def, payload);
        }
        scheduleEval();
      }),
    );
  }

  // ───────────── boot ─────────────

  readStored();
  const pollMs = deps.pollMs ?? POLL_MS;
  const timer = pollMs > 0 && typeof setInterval === 'function' ? setInterval(tick, pollMs) : null;

  function sampleBuilt(def: MomentDef, payload?: unknown): Built {
    const p = payload ?? (def.trigger.kind === 'event' ? SAMPLE_PAYLOADS[def.trigger.event] : undefined);
    try {
      return def.build(p, ctx);
    } catch {
      return { focus: { grid: null, target: null, zoom: 1 }, chips: [], data: {} };
    }
  }

  const api: Moments = {
    events,
    on: (type, fn) => events.on(type, fn),
    tick,
    current: () => (open ? { ...open } : null),
    isPausing: () => !!open && open.mode === 'full' && !open.replay,
    isBusy() {
      // Queued (even if still in its delay) counts: the story must not start the same lesson meanwhile.
      return (!!open && !open.replay) || queue.length > 0;
    },
    dismiss() {
      close();
      scheduleEval();
    },
    neverAgain() {
      mode = 'brief';
      persist();
      events.emit('change', {});
      close();
    },
    get mode() {
      return mode;
    },
    setMode(m) {
      if (!(EXPLAIN_MODES as readonly string[]).includes(m)) return;
      mode = m;
      if (m === 'off') queue = [];
      persist();
      events.emit('change', {});
    },
    get labels() {
      return labels;
    },
    setLabels(m) {
      if (!(STATUS_LABEL_MODES as readonly string[]).includes(m)) return;
      labels = m;
      persist();
      events.emit('change', {});
    },
    labelsOnAll(era) {
      return labels === 'always' || (labels === 'auto' && era <= 1);
    },
    seen: (id) => seen.has(id),
    isActive: (id) => (!!open && open.id === id && !open.replay) || queue.some((q) => q.def.id === id),
    help() {
      return HELP_ORDER.map((id) => ({ id, seen: seen.has(id), def: MOMENT_BY_ID.get(id)! }));
    },
    wouldShow: (id) => mode !== 'off' && !seen.has(id),
    replay(id) {
      const def = MOMENT_BY_ID.get(id);
      if (!def || (open && !open.replay)) return false;
      if (open) close();
      const m = memo.get(id);
      const built = sampleBuilt(def);
      openNow(def, { focus: { grid: null, target: null, zoom: 1 }, chips: m?.chips ?? built.chips, data: m?.data ?? built.data }, 'full', true);
      return true;
    },
    notify(id, payload) {
      const def = MOMENT_BY_ID.get(id);
      if (!def || disposed || !canQueue(def) || queue.some((q) => q.def.id === id)) return false;
      enqueue(def, payload);
      scheduleEval();
      return queue.some((q) => q.def.id === id);
    },
    show(id, opts = {}) {
      const def = MOMENT_BY_ID.get(id);
      if (!def) return false;
      if (open) close();
      const built = sampleBuilt(def, opts.payload);
      openNow(def, built, opts.mode ?? (def.forceBrief ? 'brief' : 'full'), false);
      return true;
    },
    forget(id) {
      if (id) seen.delete(id);
      else seen.clear();
      persist();
      events.emit('change', {});
    },
    serialize,
    load(data) {
      const ok = load(data);
      if (ok) persist();
      return ok;
    },
    reset() {
      if (open) close();
      seen = new Set();
      memo = new Map();
      queue = [];
      lastCloseAt = -Infinity;
      persist();
      events.emit('change', {});
    },
    dispose() {
      disposed = true;
      if (timer !== null) clearInterval(timer);
      for (const off of offs) off();
    },
  };
  return api;
}
