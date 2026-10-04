/**
 * Story system types (pure data, no DOM). See docs/STORY.md for the plot.
 *
 * A *scene* is a short beat: 1–6 lines spoken by a cast member, optionally
 * followed by a two-button *choice* and/or a *wait* (a tutorial task that
 * completes on a game event, a UI signal or a view predicate). Scenes trigger
 * from conditions over the game view and the story's own counters.
 */
import type { Bus, GameEvents } from '../core/bus';
import type { GameView, Text } from '../core/types';

/** Cast. `you` is the player-scientist (journal voice). */
export type Speaker = 'vela' | 'albor' | 'committee' | 'coro' | 'you';
/** VELA's face. 'sleepy' (back after a while, long sessions) and 'proud' (a purchase, a request done, a new night) come with the art direction (docs/ARTE.md §6). */
export type Mood = 'neutral' | 'happy' | 'worried' | 'awed' | 'sleepy' | 'proud';
export type Act = 1 | 2 | 3 | 4;

/**
 * UI targets a line or a task may spotlight. The integrator maps each id to a
 * DOMRect through `getTargetRect`. A list is tried in order (fallbacks).
 */
export type TargetId =
  | 'dish'
  | 'creature'
  | 'hud.essence'
  | 'tab.lab'
  | 'upgrade.dropper'
  | 'tab.bestiary'
  | 'golden'
  | 'tab.calibrate'
  | 'tab.genome'
  | 'extinguish'
  /** The objective bar (Encargos). */
  | 'objective'
  // ── Sessions cycle (docs/CICLO.md; scenes t_tree, t_world, a1_night) ──
  /** The session clock in the HUD. */
  | 'hud.clock'
  /** The summary's "Ir al Árbol" button. */
  | 'tree.open'
  /** The centre of the research tree (the night node). */
  | 'tree.center'
  /** The first tree node the player can buy now (it glows green). */
  | 'tree.next'
  /** The world picker on the session start card. */
  | 'world.picker';

export const TARGET_IDS: readonly TargetId[] = [
  'dish',
  'creature',
  'hud.essence',
  'tab.lab',
  'upgrade.dropper',
  'tab.bestiary',
  'golden',
  'tab.calibrate',
  'tab.genome',
  'extinguish',
  'objective',
  'hud.clock',
  'tree.open',
  'tree.center',
  'tree.next',
  'world.picker',
];

/** Environmental hints: overlay effects drawn over the dish, never changes to the simulation (pillar 1). */
export type HintKind =
  /** The golden spark circles the nearest stable creature. */
  | 'orbit'
  /** Faint lines join the stable creatures into a figure. */
  | 'constellation'
  /** Rings ripple out of every stable creature, one after another (an answer). */
  | 'echo'
  /** Threads of light from creatures towards the player's last tap. */
  | 'gather'
  /** Warm lamp glow over the dish during the Extinction ritual (choice "lamp"). */
  | 'lamp'
  /** The golden spark's halo takes the colour of the player's leaning. */
  | 'tint'
  /** A grey-gold horizon line at the bottom of the dish: the polar night is ending. */
  | 'dawn';

export const HINT_KINDS: readonly HintKind[] = ['orbit', 'constellation', 'echo', 'gather', 'lamp', 'tint', 'dawn'];

/** Playstyle leanings; each maps to one main ending. */
export type Leaning = 'harvest' | 'law' | 'memory' | 'tide';
export const LEANINGS: readonly Leaning[] = ['harvest', 'law', 'memory', 'tide'];
/** Main endings = leanings, plus the secret one. */
export type EndingId = Leaning | 'albor';
export const ENDING_IDS: readonly EndingId[] = ['harvest', 'law', 'memory', 'tide', 'albor'];
export type Leanings = Record<Leaning, number>;

/** Counters the story keeps from bus events (lifetime, persisted). */
export type CounterKey =
  | 'seeds' // manual seeds (includes prints)
  | 'autoSeeds'
  | 'taps' // manual seeds + denied seeds (any tap on the dish that tried to sow)
  | 'deaths'
  | 'explosions'
  | 'born'
  | 'stables'
  | 'divisions'
  | 'species'
  | 'behaviors'
  | 'goldenSpawn'
  | 'goldenCaught'
  | 'goldenMissed'
  | 'calib'
  | 'upgrades'
  | 'genome'
  | 'extStart'
  | 'extDone'
  | 'prints'
  | 'offline';

export const COUNTER_KEYS: readonly CounterKey[] = [
  'seeds',
  'autoSeeds',
  'taps',
  'deaths',
  'explosions',
  'born',
  'stables',
  'divisions',
  'species',
  'behaviors',
  'goldenSpawn',
  'goldenCaught',
  'goldenMissed',
  'calib',
  'upgrades',
  'genome',
  'extStart',
  'extDone',
  'prints',
  'offline',
];

/** Read-only context handed to scene conditions. */
export interface StoryCtx {
  v: GameView;
  /** Wall clock, ms. */
  now: number;
  era: number;
  /** Lifetime counter value. */
  n(key: CounterKey): number;
  /** Scene finished (or skipped). */
  done(sceneId: string): boolean;
  /** Seconds since a scene finished (Infinity if never). */
  since(sceneId: string): number;
  /** Seconds since the current era started (as seen by the story). */
  eraAge(): number;
  choice(choiceId: string): string | undefined;
  flag(name: string): boolean;
  /** Stable creatures on the dish right now. */
  stablesNow(): number;
  /** UI signal received since the scene started (only meaningful inside waits). */
  signal(name: string): boolean;
  endings(): readonly EndingId[];
  /** Era in which the last ending was reached (0 = none). */
  lastEndingEra(): number;
}

export interface LineDef {
  who: Speaker;
  mood?: Mood;
  text: Text;
  /** Spotlight while this line shows (first id with a rect wins). */
  target?: TargetId[];
  /** Hint emitted when this line appears. */
  hint?: HintKind;
  /** (albor) Live voice instead of a tape recording. */
  live?: boolean;
}

export interface WaitDef {
  /** Complete when this counter grows by `count` (default 1) since the wait began. */
  event?: CounterKey;
  count?: number;
  /** Complete when the UI sends this signal (story.signal(name)). */
  signal?: string;
  /** Complete when this predicate holds. */
  until?: (c: StoryCtx) => boolean;
  /** Give up after this many seconds (the scene still completes). */
  timeoutSec?: number;
  /** Short instruction shown while waiting. */
  text: Text;
  target?: TargetId[];
}

export interface OptionDef {
  id: string;
  label: Text;
  /** Lines played after picking this option. */
  reply?: LineDef[];
  /** Journal entry unlocked by this option. */
  journal?: string;
  /** A task to do after picking (e.g. "tap three times"). */
  wait?: WaitDef;
}

export interface ChoiceDef {
  id: string;
  /** Two fixed options, or 'final' (options computed from leanings). */
  options: [OptionDef, OptionDef] | 'final';
  /** Shows a small "not yet" link; the scene comes back later. */
  deferrable?: boolean;
}

export interface SceneDef {
  id: string;
  act: Act;
  /** Short title for the Historia archive. */
  title: Text;
  /** Part of the tutorial (skippable as a block). */
  tutorial?: boolean;
  /** Higher first when several scenes are eligible. Default 0. */
  priority?: number;
  /** May start while another scene waits on a task (the waiting one resumes afterwards). */
  urgent?: boolean;
  /** Start right after the previous scene (short gap) when eligible. */
  chain?: boolean;
  /** Scenes that must be done first. */
  after?: string[];
  when(c: StoryCtx): boolean;
  /** Lines; a function lets a scene vary with state (evaluated when it starts). */
  lines: LineDef[] | ((c: StoryCtx) => LineDef[]);
  choice?: ChoiceDef;
  wait?: WaitDef;
  /** Journal entry unlocked when the scene ends. */
  journal?: string;
  /** Flags set when the scene ends. */
  sets?: string[];
  /** Can play again (e.g. the re-armed final question). Default false. */
  repeatable?: boolean;
}

export interface JournalDef {
  id: string;
  text: Text;
}

/** One poetic card of an ending cinematic. */
export interface EndingDef {
  id: EndingId;
  /** "Final: Marea". */
  title: Text;
  /** Label on the final-choice button that leads here. */
  option: Text;
  /** Text cards shown during the animation. */
  cards: Text[];
  /** Closing line (large, at dawn). */
  closing: Text;
  /** Accent colour of the leaning / ending (hex). */
  color: string;
  /** Short epilogue scene id played after "Continue the experiment". */
  epilogue: string;
  secret?: boolean;
}

// ───────────────────────────── Runtime views (for the UI) ─────────────────────────────

export interface SceneView {
  id: string;
  act: Act;
  title: Text;
  tutorial: boolean;
  /** Re-watched from the archive: no waits, no choices, no state changes. */
  replay: boolean;
}

export interface LineView {
  who: Speaker;
  /** Display name (resolved: the Choir is "· · ·" until named). */
  name: Text;
  mood: Mood;
  /** Tokens already resolved. */
  text: Text;
  target: TargetId[] | null;
  live: boolean;
  index: number;
}

export interface ChoiceOptionView {
  id: string;
  label: Text;
  /** Accent colour (final choice). */
  color: string | null;
}

export interface HintView {
  kind: HintKind;
  /** Seconds. */
  duration: number;
  color?: string;
  /** Grid position for 'gather' (last tap). */
  x?: number;
  y?: number;
}

export type StoryPhase = 'idle' | 'lines' | 'choice' | 'wait' | 'ending';

export interface StoryEvents {
  sceneStart: { scene: SceneView };
  line: { scene: SceneView; line: LineView };
  choice: { scene: SceneView; choiceId: string; options: ChoiceOptionView[]; deferrable: boolean };
  /** A choice was made (or deferred: optionId = null). */
  chosen: { choiceId: string; optionId: string | null };
  /** Waiting on a task: show a compact instruction near the target. */
  sceneWait: { scene: SceneView; text: Text; target: TargetId[] | null };
  sceneEnd: { sceneId: string; skipped: boolean; replay: boolean };
  ending: { id: EndingId };
  hint: HintView;
  journal: { id: string; text: Text };
  /** Something in the archive (seen scenes, endings, leanings) changed. */
  change: Record<string, never>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface StoryDeps {
  bus: Bus<GameEvents>;
  getView: () => GameView;
  /** Defaults to window.localStorage when available. Pass null to disable persistence. */
  storage?: StorageLike | null;
  /** Wall clock in ms (default Date.now). */
  now?: () => number;
  /** 0..1 random source for ambient hints (default Math.random). */
  random?: () => number;
  /** Poll the view every N ms with setInterval (default 1000). 0 = never; call tick() yourself. */
  pollMs?: number;
  /** Something else owns the screen (splash, modal, extinction ritual): don't start scenes. */
  isBlocked?: () => boolean;
  /** Integrator hook: skip starting this scene for now (another surface explains the same event). */
  suppress?: (sceneId: string) => boolean;
}

/** What the integrator folds into the main save. */
export interface StorySave {
  v: 1;
  done: string[];
  /** sceneId → wall-clock ms when it finished. */
  doneAt: Record<string, number>;
  choices: Record<string, string>;
  counters: Partial<Record<CounterKey, number>>;
  flags: string[];
  endings: EndingId[];
  lastEndingEra: number;
  journal: string[];
  journalRead: string[];
  eraStartAt: number;
  lastEra: number;
  tutorialSkipped: boolean;
  enabled: boolean;
  /** sceneId → wall-clock ms before which a deferred choice scene stays quiet. */
  deferUntil: Record<string, number>;
}

export interface ArchiveSceneView {
  id: string;
  act: Act;
  title: Text;
  seen: boolean;
}

export interface ArchiveView {
  scenes: ArchiveSceneView[];
  endings: { id: EndingId; title: Text; found: boolean; secret: boolean; color: string }[];
  /** Found main endings (secret not counted). */
  found: number;
  total: number;
  leanings: Leanings;
}
