/**
 * Momentos: first-time-event explainers (pure data, no DOM).
 *
 * When something happens for the first time (first seed, first creature that
 * dissolves, first stable one, first Spark…) the game stops for a moment,
 * zooms on it and explains it with an animated diagram and one or two short
 * lines spoken by VELA. Each moment is explained ONCE (persisted); the
 * "¿Qué pasó?" sheet lets the player re-watch any card.
 *
 * See docs/MOMENTOS.md for the design and the wiring guide.
 */
import type { Bus, GameEvents } from '../core/bus';
import type { Behavior, GameView, Text } from '../core/types';

/** Every moment the catalog knows. */
export type MomentId =
  | 'seed'
  | 'dissolve'
  | 'explode'
  | 'stable'
  | 'income'
  | 'species'
  | 'secondSpecies'
  | 'behavior.still'
  | 'behavior.pulsing'
  | 'behavior.swimmer'
  | 'behavior.spinner'
  | 'behavior.divider'
  | 'behavior.colony'
  | 'division'
  | 'golden'
  | 'upgrade'
  | 'autoseed'
  | 'calibration'
  | 'seedPrice'
  | 'seedCheaper'
  | 'overgrown'
  | 'extinctionReady'
  | 'extinction'
  | 'offline';

/**
 * How much the game explains:
 *  - full   pause + zoom + card with an animated diagram (default)
 *  - brief  no pause: a big animated label pinned to the event for ~3 s
 *  - off    nothing
 */
export type ExplainMode = 'full' | 'brief' | 'off';
export const EXPLAIN_MODES: readonly ExplainMode[] = ['full', 'brief', 'off'];

/**
 * Creature status pills over the dish ("Naciendo 60 %", "Estable ✓ +1,2/s"…):
 *  - auto    on every creature (nearest/most recent 6) during Era 1, then only on tap
 *  - always  always on (6 most relevant)
 *  - tap     only on the tapped creature
 */
export type StatusLabelMode = 'auto' | 'always' | 'tap';
export const STATUS_LABEL_MODES: readonly StatusLabelMode[] = ['auto', 'always', 'tap'];

/** Animated diagrams the UI knows how to draw (src/ui/moments/illustrations.ts). */
export type IllustrationKind =
  | 'seed'
  | 'dissolve'
  | 'explode'
  | 'stable'
  | 'essence'
  | 'species'
  | 'compare'
  | 'still'
  | 'pulsing'
  | 'swimmer'
  | 'spinner'
  | 'divider'
  | 'colony'
  | 'division'
  | 'golden'
  | 'upgrade'
  | 'autoseed'
  | 'rules'
  | 'seedPrice'
  | 'seedCheaper'
  | 'overgrown'
  | 'extinctionReady'
  | 'keepReset'
  | 'offline';

/** Title icons (inline SVG in src/ui/moments/icons.ts). */
export type MomentIcon =
  | 'drop'
  | 'fade'
  | 'burst'
  | 'heart'
  | 'essence'
  | 'book'
  | 'behavior'
  | 'split'
  | 'spark'
  | 'upgrade'
  | 'robot'
  | 'sliders'
  | 'tag'
  | 'genome'
  | 'moon';

/**
 * UI elements a moment may point at. The integrator maps each id to a viewport
 * DOMRect (same idea as the story's TargetId; ids shared where they overlap).
 */
export type UiTarget =
  | 'dish'
  | 'hud.essence'
  | 'hud.samples'
  | 'hud.genome'
  | 'seed'
  | 'tab.lab'
  | 'tab.bestiary'
  | 'tab.calibrate'
  | 'tab.genome'
  | 'extinguish'
  | 'golden';

export type ChipTone = 'good' | 'bad' | 'warn' | 'info' | 'gold' | 'violet' | 'grey';
export type ChipIcon = 'essence' | 'sample' | 'genome' | 'clock' | 'up' | 'down' | 'x' | 'check' | 'gift' | 'slot' | null;

/** A consequence/reward pill under the card text ("+1 Esencia/s", "−2 Esencia"). */
export interface Chip {
  text: Text;
  tone: ChipTone;
  icon: ChipIcon;
}

export interface MomentFocus {
  /** Grid cell to zoom on (null = the moment is about a UI element only). */
  grid: { x: number; y: number; id: number | null } | null;
  /** More creatures to keep in view and ring (e.g. the two species being compared). */
  others?: { x: number; y: number; id: number | null }[];
  /** UI element the pointer arrow points at (first id with a rect wins). */
  target: UiTarget[] | null;
  /** Camera zoom to reach (1 = no zoom). Clamped by the UI to the camera range. */
  zoom: number;
}

export type VelaMood = 'neutral' | 'happy' | 'worried' | 'awed';

/** A game action a card may offer as its primary button (the integrator performs it). */
export type MomentAction = 'sterilize';

export interface MomentActionDef {
  id: MomentAction;
  /** Button label (≤ 3 words). */
  label: Text;
}

/** Extra facts a moment carries to its diagram and chips. */
export interface MomentData {
  behavior?: Behavior;
  speciesId?: string;
  speciesName?: string;
  /** The species it is compared with (secondSpecies). */
  otherSpeciesId?: string;
  upgradeId?: string;
  /** Calibration before/after (μ, σ, R, dt). */
  calibFrom?: { mu: number; sigma: number; R: number; dt: number };
  calibTo?: { mu: number; sigma: number; R: number; dt: number };
  /** Seed price breakdown at trigger time. */
  price?: {
    base: number;
    cost: number;
    crowdMult: number;
    satMult: number;
    freeSlots: number;
    used: number;
    alive: number;
  };
  /** Amounts (essence, genome, seconds) used by chips. */
  amount?: number;
  seconds?: number;
  era?: number;
}

/** One trigger: a bus event (with an optional filter) or a view predicate. */
export type TriggerDef =
  | {
      kind: 'event';
      event: keyof GameEvents;
      /** Payload is the event payload; return false to ignore this occurrence. */
      when?: (payload: unknown, ctx: TriggerCtx) => boolean;
    }
  | {
      kind: 'poll';
      when: (ctx: TriggerCtx) => boolean;
    };

/** What a trigger and a builder can look at. */
export interface TriggerCtx {
  view(): GameView;
  /** Moment already explained. */
  seen(id: MomentId): boolean;
  /** View values remembered from the previous poll (for "went up/down" checks). */
  prev: PollMemory;
  /** Milliseconds since this bus event last fired (Infinity if never). */
  since(event: keyof GameEvents): number;
  /** Last payload of this bus event (undefined if never). */
  last(event: keyof GameEvents): unknown;
}

export interface PollMemory {
  /** Price of a normal seed at the previous poll (null before the first). */
  seedCost: number | null;
  calib: { mu: number; sigma: number; R: number; dt: number } | null;
}

/** Everything a moment resolves to when it triggers. */
export interface Built {
  focus: MomentFocus;
  chips: Chip[];
  data: MomentData;
}

export interface MomentDef {
  id: MomentId;
  /** Higher first when several are queued. */
  priority: number;
  /** ≤ 4 words (tests). */
  title: Text;
  /** 1–2 sentences, ≤ 14 words each, kid-simple (tests). */
  lines: Text[];
  /** Big label used in "brief" mode (≤ 6 words). */
  brief: Text;
  illustration: IllustrationKind;
  icon: MomentIcon;
  mood: VelaMood;
  /** Accent colour of the card (hex). */
  color: string;
  trigger: TriggerDef;
  /** Resolve focus, chips and data from the trigger payload and the view. */
  build(payload: unknown, ctx: TriggerCtx): Built;
  /** Wait this long after the trigger before opening (let the player see it happen). */
  delayMs?: number;
  /** Re-arm the delay on every new occurrence; open only once things are quiet (sliders). */
  settleMs?: number;
  /** A settle moment fired again while queued: combine the first and the latest build. */
  merge?(first: Built, latest: Built): Built;
  /** Still worth showing at open time? (e.g. the Spark is still on the dish). Default true. */
  valid?(data: MomentData, ctx: TriggerCtx): boolean;
  /** Always a brief label, never a paused card (minor follow-ups). */
  forceBrief?: boolean;
  /** Story tutorial scenes this moment replaces (marked consumed when it opens). */
  story?: string[];
  /** Showing this moment also counts these as explained. */
  alsoMarks?: MomentId[];
  /** Only after this moment has been explained. */
  requires?: MomentId;
  /** Primary button that does something ("Limpiar placa"); "Entendido" becomes secondary. */
  action?: MomentActionDef;
}

// ───────────────────────────── runtime views ─────────────────────────────

/** A moment as the UI shows it. */
export interface MomentView {
  id: MomentId;
  /** 'full' card (game paused) or 'brief' label. */
  mode: 'full' | 'brief';
  title: Text;
  lines: Text[];
  brief: Text;
  illustration: IllustrationKind;
  icon: MomentIcon;
  mood: VelaMood;
  color: string;
  focus: MomentFocus;
  chips: Chip[];
  data: MomentData;
  /** Primary action button, if any (hidden on replays). */
  action: MomentActionDef | null;
  /** Re-watched from the help sheet: no pause, no camera, no state change. */
  replay: boolean;
  /** Increments per opening (UI keys animations on it). */
  seq: number;
}

export interface MomentsEvents {
  /** A moment opens (card or brief label). */
  open: { moment: MomentView };
  /** The current moment closed (button, timeout, replay closed). */
  close: { id: MomentId; replay: boolean };
  /** Seen list / settings changed (help sheet re-renders). */
  change: Record<string, never>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface MomentsDeps {
  bus: Bus<GameEvents>;
  getView: () => GameView;
  /** Defaults to window.localStorage when available. Pass null to disable persistence. */
  storage?: StorageLike | null;
  /** Wall clock in ms (default Date.now). */
  now?: () => number;
  /**
   * Something else owns the screen: splash, modal, extinction ritual, a story
   * dialogue or cinematic. Queued moments wait (they never interrupt).
   */
  isBlocked?: () => boolean;
  /**
   * The story already told this one (e.g. VELA's bubble played first): open it
   * as a brief label instead of a paused card, so the player sees one thing.
   */
  downgrade?: (id: MomentId) => boolean;
  /** Poll the view every N ms with setInterval (default 250). 0 = never; call tick() yourself. */
  pollMs?: number;
}

/** Persisted state ('bioluma.moments'). */
export interface MomentsSave {
  v: 1;
  seen: MomentId[];
  mode: ExplainMode;
  labels: StatusLabelMode;
}
