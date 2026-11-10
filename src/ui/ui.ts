/**
 * Bioluma UI root: HUD (Essence, the session clock slot, Bitácora, Ajustes), the Encargo bar, the dish
 * (GL canvas + overlay + floating controls), the dock (Bestiario, Nutrientes or Árbol, the Datos preview
 * slot), the Bestiary drawer, modals, toasts and all the juice. Vanilla TS; the game drives it through
 * `update(view)` (~10×/s) and `frame(t, dt)` (every animation frame). The session screens (start card,
 * summary, tree) are mounted by src/ui/session/flow.ts over this root.
 */
import './ui.css';
import { bus } from '../core/bus';
import type { Camera } from '../core/camera';
import { BEHAVIOR_COLOR } from '../core/palette';
import type { Behavior, BuyQty, DropView, GameActions, GameView, Lang, Text } from '../core/types';
import { TABS, type Ctx, type Panel, type TabId, type TextSize, type ThemePref, type ToastKind } from './ctx';
import { h, ic, loadJSON, reconcile, saveJSON, setAttr, setHTML, setStyle, setText, show, toggle, vibrate } from './dom';
import * as B from '../game/balance';
import { fmt, fmtClock, fmtDuration, fmtRate, fmtShort } from './format';
import { behaviorName, getLang, setLang, stateName, t, tx } from './i18n';
import { icon, logo } from './icons';
import { DishInput } from './input';
import { cardHoldOk, dropAt, dropsOnSegment, motesOnSegment, pillTapRoute, routeTap, SweepHits, type TapReach } from './dishTap';
import { boostDenial, deniedShortKey } from './boostWhy';
import { copyPick } from './copyPick';
import { HandGather } from './handGather';
import { installScreenGuard, PressGuard, screenChanged } from './pressGuard';
import { stackLabel, type LabelObstacles, type LabelPlacement, type StackRequest } from './labelPlace';
import { FlyLayer, flyDuration } from './fx/fly';
import { Readout, wholeRate } from './fx/readout';
import { dishFx } from './fx/stage';
import { DROP_FX } from './fx/drops';
import type { FxAnchors } from './fx/types';
import { TEXT } from '../game/content';
import {
  ModalHost,
  openAchievementCard,
  openJournal,
  openOffline,
  openSettings,
  openSpecies,
} from './modals';
import { hueHex, Overlay, type OverlayCosmetics, type OverlayLayer, type OverlayLayerSlot } from './overlay';
import { BestiaryPanel } from './panel-bestiary';
import { openLeaderboard } from './leaderboard';
import type { LeaderboardClient } from './leaderboard-types';
import { createSplash, type Splash } from './splash';
import { Toasts } from './toasts';
import { SESSION_UI } from '../game/treeText';
import { MOMENT_MIN_RUN_SECONDS, MOTES_FROM_SESSION, SAVE_STREAK_HITS, SESSION_SIM_PACE, SESSION_TOAST_MAX_MS, SIM_STEPS_PER_SEC, SWEEP_REHIT_S } from '../game/cycleBalance';
import { safeSowSpot } from './sowHint';
import { SowButton, SOW_UI, type SowRequest } from './sowButton';
import { createStreakChip, type StreakChip } from './session/hud';
import { deathLabel, dissolvedLabel, learnedLabel, refundLabel, shapelessLabel } from './deathLabel';
import { earningNow } from './moments/status';
import { installPressFeedback, pop, restartClass, setReduceMotion, DURATION, EASING } from './art/motion';

/**
 * The Luz counter in whole units (QA4: "3.7", "1.7" next to "16" read as two kinds of number). Seeds
 * and the Nutrientes cost whole Luz, so the floor is what can be spent.
 */
function essenceText(n: number, lang: Lang): string {
  return fmt(n < 1000 ? Math.floor(n + 1e-9) : n, lang);
}

/**
 * Feel of collecting by hand (ADR-030 §2.2.1). The touch radii mirror cycleBalance LIGHT_TAP_RADIUS_PX
 * through src/ui/fx/drops.ts DROP_FX; these are the UI's own.
 */
const COLLECT_UI = {
  /** A guided swimmer's heading is sent at most this often while the finger moves (ms). */
  steerEveryMs: 90,
  /** …or at once when it turned more than this (radians). */
  steerTurn: 0.08,
  /** Motes per collection: 1, 2 from this share of the wallet, 3 from the next. */
  moteShare: [0.04, 0.12],
  /** The reason chip next to the counter ("+5 · primera semilla"), ms. */
  giftMs: 2400,
  /** The «También puedes arrastrarla» hint comes with this tap of the Sembrar button, from session 2 (§6.2). */
  dragHintTap: 3,
} as const;


export interface UIDeps {
  actions: GameActions;
  camera: Camera;
  /** The WebGL canvas (created by integrator) — mounted inside the dish area. */
  glCanvas: HTMLCanvasElement;
  /** Called when the dish area resizes (CSS px) so the integrator resizes GL + camera. */
  onDishResize(cssW: number, cssH: number, dpr: number): void;
  /**
   * Player tapped the dish at a grid point (already filtered: not a creature tap, not golden, not a UI control).
   * The classic loop only: in the sessions cycle a finger on the dish never sows (ADR-031); see `onSow`.
   */
  onDishTap(x: number, y: number, opts: { big: boolean }): void;
  /**
   * (ADR-031, docs/MECANICAS.md §3.1) The Sembrar button: sow at `req.spot` (the safest free spot, or the snapped
   * spot of a drag when `req.dragged`); `req.big` = a held press. The host asks the game (actions.sow) and hands
   * the spec to the simulation. Without it the UI falls back to `onDishTap` at that spot.
   */
  onSow?(req: SowRequest): void;
  onErase(x: number, y: number): void;
  onBrush(x: number, y: number): void;
  onPrint(speciesId: string, x: number, y: number): void;
  onPauseToggle(): void;
  /** Dock "Árbol" between sessions (the session flow opens the research tree). */
  onOpenTree?(): void;
  /** Pause card "Terminar ahora", after its confirmation: end the running session now. */
  onEndSession?(): void;
  /** Datos the running session is worth if it ended now (the "Terminar ahora" confirmation). */
  endSessionDatos?(): number;
  exportSave(): string;
  importSave(s: string): boolean;
  resetSave(): void;
  /** First pointerdown/keydown anywhere (audio unlock). */
  onUserGesture(): void;
  onScreenshot?(): void;
  /** Optional: UI-only feedback sounds (game events already reach audio through the bus). */
  onUISound?(kind: UISound): void;
  /** Optional online leaderboard; the HUD trophy button is hidden without it. */
  leaderboard?: LeaderboardClient;
  /** Optional: the "i" next to the seed cost (price explainer); the button shows only when given. */
  onSeedPriceInfo?(): void;
  /** Optional: open the wardrobe (Vestidor, cosmetics). Offered in Settings, works with the store off. */
  openWardrobe?(): void;
  /** Optional: open the cosmetic store. Pass it only where the store may show; it lives in Settings, never in the HUD. */
  openStore?(): void;
  /**
   * Optional: something else is talking to the player (a story scene, a "moment" explainer). While true
   * the tab intro cards stay hidden and non-critical toasts wait: one message at a time (QA2 H-09).
   */
  isNarrating?(): boolean;
  /** Optional: a tab was opened by the player (story signals such as 'tab:bestiary'). */
  onTabOpen?(tab: TabId): void;
  /**
   * Optional: where messages near the top may start instead of under the Encargo bar (page px), e.g.
   * under the research tree's header while the tree covers the game. Null = the default.
   */
  topInsetOverride?(): number | null;
  /** Optional: Settings "restart tutorial" replays VELA's tutorial (the story layer). */
  onRestartTutorial?(): void;
  /** Optional: extra Settings sections (e.g. the story archive), mounted at the end of Settings. */
  settingsSections?(container: HTMLElement): void;
  /** Optional: the random player id (ranking, store), shown in Settings → Privacy for data requests (RF-07). */
  playerId?(): string | null;
  /** Show the title screen on start (default true). Its tap also unlocks audio. */
  splash?: boolean;
  /** Optional: the title screen was dismissed (game can start music, timers...). */
  onSplashDone?(): void;
  /** Optional: something else owns the camera right now (a Momento zoom): "follow" waits. */
  cameraBusy?(): boolean;
  /**
   * Optional: explain behaviours (the Behaviour Guide), scrolled to one when given. Makes behaviour rows,
   * status pills and the species sheet's behaviour badge tappable, and adds a "Maneras de moverse" button
   * to the Bestiary.
   */
  onBehaviorInfo?(behavior?: Behavior | null): void;
  /** Optional: the player started holding for a big seed (the price meter says "Semilla grande ×2,25"). */
  onChargeStart?(): void;
  /** Optional: return true when another surface explains this offline return (the first-time Momento). */
  suppressOfflineCard?(seconds: number, essence: number): boolean;
  /** Optional: return true to drop a game toast that another surface already tells (one thing per event). */
  suppressToast?(text: Text, kind: string): boolean;
  /**
   * Optional: return true when a card or label already announces new species (the Momentos): then
   * the "¡Especie nueva!" toast is skipped and only the burst on the dish stays (CLARIDAD §3.3).
   */
  speciesTold?(): boolean;
  /**
   * Optional: while true, the objective bar shows `objectiveSlot` (e.g. the Encargos badge) instead of the
   * game's built-in objective line. The bar floats over the dish either way (no layout shift).
   */
  objectiveOverride?(): boolean;
  /**
   * Optional: extra content at the end of the species sheet (e.g. the species card with its yield
   * equation). Called when the sheet opens; `update` runs with every view, `dispose` on close.
   */
  speciesExtras?(container: HTMLElement, speciesId: string): { update(v: GameView): void; dispose(): void } | null;
  /**
   * Optional (ADR-030, docs/CLARIDAD2.md §2.5): the player guides swimmer `id` towards `heading` (radians in
   * grid space, atan2(dy, dx) with y down, the screen's own orientation); null lets go. Renewed while the
   * finger moves. The integrator hands it to src/sim/steer.ts `Steering.request`. Without it, a drag from a
   * swimmer is a sweep like any other.
   */
  onSteer?(id: number, heading: number | null): void;
  /**
   * Optional: return true while a Momento tells the contact warning in words ("¡Cuidado! Se van a tocar");
   * the dish then draws only the red link. Without it the dish labels each new pair itself, once.
   */
  contactTold?(): boolean;
  /**
   * Optional (ADR-030 §2.5): true once the first fusion's card was seen; later fusions get a 2 s label at the
   * spot («Se juntaron: sin forma no da luz»). Without it, fusions only flash.
   */
  mergeTold?(): boolean;
}

export type UISound = 'tap' | 'tab' | 'open' | 'close' | 'buy' | 'deny' | 'toggle' | 'hold' | 'confirm' | 'warn';

export interface UI {
  /** Push the latest game view (call ~10×/s). */
  update(view: GameView): void;
  /** Per animation frame, for the overlay canvas (halos, ripples, floating numbers, golden spark). */
  frame(timeSec: number, dtSec: number): void;
  setPaused(p: boolean): void;
  /** The whole dish again: zoom 1, centred, not following (QA4 F-09). */
  resetView(): void;
  /** Close what was opened from the dish (a creature's card): a session card is coming (QA4 F-05). */
  closeTransient(): void;
  /** A card just closed: the dock ignores taps for a moment (the rest of a double tap). */
  guardTaps(ms?: number): void;
  showOfflineCard(seconds: number, essence: number): void;
  /** No WebGL2 screen. */
  showUnsupported(reason: string): void;
  /** Start the interactive tutorial again from the first step. */
  restartTutorial(): void;
  /** Simulation steps per second (speed × base rate); enables smooth halo extrapolation. */
  setSimRate(stepsPerSec: number): void;
  /** Equipped cosmetics drawn by the dish overlay (halo, seed trail, golden spark, motes). */
  setCosmetics(c: OverlayCosmetics): void;
  /** Something owns the screen (splash, a modal, the extinction ritual). */
  blocked(): boolean;
  /**
   * Viewport rect of a UI target, or null when not visible: 'dish', 'creature', 'hud.essence',
   * 'tab.<id>', 'upgrade.<id>', 'golden', 'extinguish' (story tutorial spotlight).
   */
  targetRect(id: string): DOMRect | null;
  /** Grid cell → viewport (client) coordinates. */
  gridToClient(x: number, y: number): { x: number; y: number } | null;
  /** Make a target visible (switch tab / scroll) before pointing at it. */
  reveal(id: string): void;
  /**
   * Extra dish-overlay drawing layer (Momentos, Secrets, Encargos…): 'creatures' = right after the
   * creature halos, clipped to the dish; 'top' = above everything on the overlay. Returns a remover.
   */
  addOverlayLayer(fn: OverlayLayer, slot?: OverlayLayerSlot): () => void;
  /** Live (smoothed) grid position of a creature, or null (Momentos follow it while zooming). */
  creaturePos(id: number): { x: number; y: number } | null;
  /** Living creatures' bodies as drawn (x, y, r triples, dish canvas px): a Momento brief steps off them. */
  creatureBodies(): { readonly discs: Float32Array; readonly n: number };
  /** The Momento brief's box (dish canvas px) or null: the dish's labels keep out of it. */
  keepClear(box: { l: number; t: number; r: number; b: number } | null): void;
  /** Creature status pills: on the most informative creatures (`onAll`), or hidden while a Momento explains. */
  setCreatureLabels(onAll: boolean, hidden: boolean): void;
  /** Slot next to the seed cost for the price meter + reason chip (src/ui/moments SlotMeter). */
  readonly seedMeterSlot: HTMLElement;
  /** Content of the objective bar while `objectiveOverride()` (the Encargos badge mounts here). */
  readonly objectiveSlot: HTMLElement;
  /** The dish element (the box the Camera views): secrets effects layer, shake and stroke inputs. */
  readonly dishEl: HTMLElement;
  /** The HUD essence counter (long press = a secret). */
  readonly essenceEl: HTMLElement;
  /** Centre of the HUD: the session clock (src/ui/session hud). */
  readonly clockSlot: HTMLElement;
  /** Right cell of the dock: the "+12 Datos al terminar" preview (src/ui/session hud). */
  readonly previewSlot: HTMLElement;
  /** Open (or close) the Bestiary drawer. */
  openBestiary(open?: boolean): void;
  /** The Bestiary drawer is open (bubbles that hang from the top of the dish wait: they would cover its head). */
  readonly drawerOpen: boolean;
  /**
   * Where a HUD counter sits (viewport CSS px), for things that fly to it (Esencia motes, docs/ARTE-PULIDO.md
   * A-5): the Esencia drop, the Datos preview, the session clock's dial; null when it is not on screen.
   */
  hudAnchor?(id: 'essence' | 'datos' | 'clock'): DOMRect | null;
  /** Something landed on a HUD counter (B-6): it pulses (arrivals within 80 ms are one pulse) and ticks. */
  pulseHud?(id: 'essence' | 'datos', amount: number): void;
  /**
   * (ADR-031, docs/MECANICAS.md §4) VELA's lysis dissolved a blob that kept growing at grid (x, y) (main.ts, the one
   * place lysis is known): the dish says so where it was. It pays nothing: it never was a creature.
   */
  lysed?(x: number, y: number): void;
}

export function createUI(root: HTMLElement, deps: UIDeps): UI {
  return new BiolumaUI(root, deps);
}

// ─────────────────────────────────────────────────────────────────────────────

interface Prefs {
  intros: TabId[]; // dismissed intro lines
  hints: string[]; // gesture hints already shown
  textSize?: TextSize;
}

const PREFS_KEY = 'bioluma.ui.v1';

/** Stored UI prefs of any shape (corrupted, older, hand-edited) → valid prefs (QA1 #4: never crash boot). */
function sanitizePrefs(raw: unknown): Prefs {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const ids = (x: unknown): TabId[] => (Array.isArray(x) ? x.filter((v): v is TabId => typeof v === 'string' && (TABS as string[]).includes(v)) : []);
  const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string').slice(0, 64) : []);
  return {
    intros: ids(o.intros),
    hints: strs(o.hints),
    textSize: o.textSize === 'large' ? 'large' : 'normal',
  };
}
const THEME_KEY = 'bioluma.theme';
/** Quiet time with an empty dish before the "tap here again" finger returns (QA2 §5b, CLARIDAD J-164). */
const TAP_AGAIN_HINT_MS = 8000;
/** Share of the dish's radius «¡Toca aquí!»'s words keep inside (the glass rim and its frost are lighter). */
const HINT_INSIDE = 0.86;
/** Room «¡Toca aquí!»'s rings keep below the objective bar (their radius and a notice's height), px. */
const HINT_BAR_GAP_PX = 72;

/**
 * A short session run is on the clock (shorter than MOMENT_MIN_RUN_SECONDS): no card may eat it, toasts
 * are brief and the Momentos wait for the summary (docs/RITMO.md §2 rule 7, §4.4).
 */
export function shortRunRunning(se: { phase: string; limit: number; bonus: number } | null | undefined): boolean {
  return !!se && se.phase === 'running' && se.limit + se.bonus < MOMENT_MIN_RUN_SECONDS;
}
/** Simulation steps per second at ×1 (cycleBalance SIM_STEPS_PER_SEC, RF-11): creature age is shown in seconds. */
const AGE_STEPS_PER_SEC = SIM_STEPS_PER_SEC;

/**
 * Restart a one-shot CSS animation class now (a style read, never a forced layout: P3). Re-adding the
 * class on the next frame lost the restart when called from a tap: no style recalc came between the
 * remove and the add, so a second refused tap never shook (integrator review of v0.019).
 */
function retriggerClass(el: HTMLElement, cls: string): void {
  restartClass(el, cls);
}

/** One press gesture for the whole document (B-4): installed once, whoever creates a UI first. */
let pressInstalled = false;
export function ensurePressFeedback(): void {
  if (pressInstalled || typeof document === 'undefined') return;
  pressInstalled = true;
  installPressFeedback(document);
}

class BiolumaUI implements UI {
  private el: HTMLDivElement;
  private camera: Camera;
  private actions: GameActions;
  // HUD
  private essVal!: HTMLElement;
  private essGlow!: HTMLElement;
  private essRate!: HTMLElement;
  private essLabel!: HTMLElement;
  /** "+5 · primera semilla": why some Luz arrived without a drop (bus luzGift), beside the counter. */
  private giftEl!: HTMLElement;
  private gift: { key: string; amount: number; reason: Text; at: number; n: number } | null = null;
  private giftTimer = 0;
  /** The counter as an 8 Hz instrument readout that counts the light when it lands (ARTE-REALISTA §6.8). */
  private readonly readout = new Readout();
  /** Collected light flies to the counter (src/ui/fx/fly.ts, its own layer). */
  private fly!: FlyLayer;
  private flyQ = '';
  // Collecting by hand and guiding (ADR-030)
  private readonly sweepIds: number[] = [];
  /** A ripple's or a sweep's drops in one call of the game (one hit at most, code review v0.027 #4). */
  private readonly hand: HandGather;
  // ADR-031 (PB's dishTap): the session finger's scratch: the empty-agar reach, the sweep's glimmers and creatures.
  private readonly reach: TapReach = { drops: [], dropN: 0, motes: [], moteN: 0 };
  private readonly sweepMotes: number[] = [];
  private sweepMoteN = 0;
  private readonly sweepHits = new SweepHits();
  private readonly sweepCross: number[] = [];
  private sweepN = 0;
  private steerId: number | null = null;
  private steerAt = 0;
  private steerSent = NaN;
  /** Where the finger's own collection was drawn (overlay px), for the bus event that follows it. */
  private handAt: { x: number; y: number; hue: number } | null = null;
  private handTold = false;
  private ripeTold = 0;
  private outsideTold = false;
  /** Centre of the HUD: the session clock is mounted here (src/ui/session/flow.ts). */
  readonly clockSlot = h('div', { class: 'hud-clock' });
  /** Dock: the Datos preview pill is mounted here. */
  readonly previewSlot = h('div', { class: 'dock-preview' });
  private journalBtn!: HTMLButtonElement;
  private journalDot!: HTMLElement;
  private muteBtn!: HTMLButtonElement;
  private settingsBtn!: HTMLButtonElement;
  // Objective
  private objEl!: HTMLElement;
  private objLabel!: HTMLElement;
  private objText!: HTMLElement;
  private objIcon!: HTMLElement;
  private objShown: string | null = null;
  private objTimer = 0;
  private objPending: string | null = null;
  // Dish
  private dish!: HTMLElement;
  private dishUI!: HTMLElement;
  private overlay: Overlay;
  private fabPause!: HTMLButtonElement;
  private fabSpeed!: HTMLButtonElement;
  private fabErase!: HTMLButtonElement;
  private fabClean!: HTMLButtonElement;
  private cleanArmed = 0;
  private tapGuardUntil = 0;
  /** Phantom-tap guard of each dock button (QA-CLARIDAD #17): src/ui/pressGuard.ts. */
  private readonly pressGuards = new Map<HTMLElement, PressGuard>();
  private cleanHold = 0;
  private cleanHeld = false;
  private fabCentre!: HTMLButtonElement;
  private dropOvergrownToast = false;
  /** Last seed cost shown, to animate changes (green ↓ cheaper, amber ↑ pricier). */
  private lastSeedCost = -1;
  /** (ADR-031) The Sembrar button, its price explainer and the streak chip by the counter. */
  private sowBtn!: SowButton;
  private sowWrap!: HTMLElement;
  private sowInfo!: HTMLButtonElement;
  private streakChip!: StreakChip;
  /** Button presses this session (the drag hint), the run's «Aquí cabe mejor» already said. */
  private sowPresses = 0;
  private snapTold = false;
  /** Slot reserved next to the seed cost for the price meter (src/ui/moments wires it). */
  readonly seedMeterSlot = h('span', { class: 'mp-meter' });
  /** «Copiar» over the seed pill once the Copiadora is bought (QA-CLARIDAD #39), and its species strip. */
  private copyBtn!: HTMLButtonElement;
  private copyStrip!: HTMLElement;
  private copyKey = '';
  private copyOpen = false;
  /** Objective bar content while deps.objectiveOverride() (the Encargos badge). */
  readonly objectiveSlot = h('div', { class: 'obj-slot', hidden: true });
  private objOverride = false;
  private chargeTimer = 0;
  private essBtn!: HTMLButtonElement;
  /** When the essence counter was pressed (a long press must not open the stats sheet). */
  private essDownAt = 0;
  private overgrownEl!: HTMLElement;
  private modePill!: HTMLElement;
  private modeKey = '';
  private buffsEl!: HTMLElement;
  private buffRows = new Map<string, { el: HTMLElement; ring: HTMLElement; name: HTMLElement; x: HTMLElement; tm: HTMLElement }>();
  private buffMax = new Map<string, number>();
  private hintEl: HTMLElement | null = null;
  /** Where «¡Toca aquí!» points on a dish with creatures (grid cells; QA-CLARIDAD-2 C3), or null: the centre. */
  private hintSpot: { x: number; y: number } | null = null;
  /** The pointed hint's width (px), measured once per spot: its words stay inside the dish. */
  private hintW = 0;
  private gestureHint: HTMLElement | null = null;
  private toasts = new Toasts();
  private card: {
    id: number;
    el: HTMLElement;
    name: HTMLElement;
    state: HTMLElement;
    beh: HTMLElement;
    eps: HTMLElement;
    age: HTMLElement;
    follow: HTMLButtonElement;
    arrow: HTMLElement;
    w: number;
    h: number;
    speciesId: string | null;
  } | null = null;
  // Bestiary drawer (bottom sheet on a phone, side drawer on a wide screen; over the dish, never resizing it)
  private drawer!: HTMLElement;
  private drawerScrim!: HTMLElement;
  private drawerTitle!: HTMLElement;
  private bestiary: Panel | null = null;
  private bestiaryOpen = false;
  // Dock
  private dock!: HTMLElement;
  private bestiaryBtn!: HTMLButtonElement;
  private bestiaryDot!: HTMLElement;
  private bestiaryLabel!: HTMLElement;
  private treeBtn!: HTMLButtonElement;
  private treeLabel!: HTMLElement;
  private boostBtn!: HTMLButtonElement;
  private boostKey = '';
  private dockKey = '';
  // Pause card ("Seguir" / "Terminar ahora")
  private pauseCard!: HTMLElement;
  private pauseConfirm = false;
  private modals: ModalHost;
  private modalLayer = h('div', { class: 'bl-modals' });
  private fx!: HTMLElement;

  // State
  private v: GameView | null = null;
  private lang: Lang = getLang();
  private prefs: Prefs;
  private mode: 'seed' | 'erase' | 'print' = 'seed';
  private printId: string | null = null;
  private paused = false;
  private buyQty: BuyQty = 1;
  private dispEssence = -1;
  private lastFrameAt = 0;
  private firstTapDone = false;
  /** performance.now() of the last seed tap (0 = none yet): drives the "tap here again" hint. */
  private lastTapAt = 0;
  private lastBigTap = 0;
  private follow: number | null = null;
  private ctx: Ctx;
  private gestured = false;
  private lastOffline = { at: 0, seconds: -1 };
  private wide = false;
  private splash: Splash | null = null;
  private pendingOffline: { seconds: number; essence: number } | null = null;
  private lbBtn!: HTMLButtonElement;
  private objBar!: HTMLElement;
  private objFill!: HTMLElement;
  private essGlowAt = 0;
  private themeLocal: ThemePref | null = null;
  private themeApplied = '';
  private themeMq: MediaQueryList | null = null;
  private rmApplied: boolean | null = null;
  /** HUD pulse grouping (B-6): arrivals within 80 ms are one pulse. */
  private pulseAt = { essence: 0, datos: 0 };

  constructor(
    private root: HTMLElement,
    private deps: UIDeps,
  ) {
    this.camera = deps.camera;
    this.actions = deps.actions;
    this.hand = new HandGather(() => this.actions, this.camera);
    this.prefs = sanitizePrefs(loadJSON<unknown>(PREFS_KEY, {}));
    this.el = h('div', { class: 'bl' });
    this.overlay = new Overlay(this.camera);
    this.modals = new ModalHost(this.modalLayer, (k) => this.sound(k));
    this.ctx = this.makeCtx();
    this.applyTextSize();
    this.build();
    this.root.appendChild(this.el);
    const anchors: FxAnchors = {
      rect: (id) => (id === 'bestiary' ? null : this.hudAnchor(id)),
      arrive: (id, n) => {
        if (id === 'essence' || id === 'datos') this.pulseHud(id, n);
      },
    };
    this.fly = new FlyLayer(this.el, {
      anchors: () => anchors,
      light: () => document.documentElement.dataset.theme === 'light',
      reduceMotion: () => !!this.v?.settings.reduceMotion,
    });
    this.wireCollection();
    // QA-3 §2: a press that started before a screen changed, or just after, is not aimed at the new one.
    installScreenGuard(window);
    this.toasts.setHold(() => !!this.deps.isNarrating?.() || !!this.splash?.visible);
    this.toasts.setMaxMs(() => (shortRunRunning(this.v?.session) ? SESSION_TOAST_MAX_MS : Infinity));
    this.bindBus();
    this.bindKeys();
    this.bindResize();
    this.bindGesture();
    this.bindTheme();
    ensurePressFeedback();
    if (deps.splash !== false) {
      this.splash = createSplash(this.el, {
        reduceMotion: () => !!this.v?.settings.reduceMotion,
        lang: () => this.v?.settings.lang ?? this.lang,
        setLang: (l) => {
          this.actions.setSetting('lang', l);
          // Apply now (the next view push would do it ~100 ms later).
          this.lang = l;
          setLang(l);
          document.documentElement.lang = l;
          this.relabelAll();
        },
        muted: () => !!this.v?.settings.muted,
        toggleMute: () => {
          if (!this.v) return;
          this.actions.setSetting('muted', !this.v.settings.muted);
          this.v = { ...this.v, settings: { ...this.v.settings, muted: !this.v.settings.muted } };
        },
        onDone: () => {
          this.deps.onSplashDone?.();
          const off = this.pendingOffline;
          this.pendingOffline = null;
          if (off) setTimeout(() => this.showOfflineCard(off.seconds, off.essence), 450);
        },
      });
    }
  }

  // ───────────────────────────── construction ─────────────────────────────

  private makeCtx(): Ctx {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      actions: this.actions,
      deps: this.deps,
      get view() {
        return self.v!;
      },
      get buyQty() {
        return self.buyQty;
      },
      set buyQty(q: BuyQty) {
        self.buyQty = q;
      },
      setBuyQty: (q) => {
        this.buyQty = q;
        this.actions.setBuyQty(q);
      },
      openSpecies: (id) => {
        this.modals.find('species')?.close();
        const m = openSpecies(this.modals, this.ctx, id);
        this.attachSpeciesExtras(m, id);
      },
      enterPrintMode: (id) => this.enterPrint(id),
      fxBurst: (el, color, text) => this.fxBurst(el, color, text),
      toast: (text, kind, iconName, onClick) => this.toasts.push(text, kind, iconName, onClick),
      vibrate: (p) => this.vibrate(p),
      sound: (k) => this.sound(k),
      switchTab: () => this.openBestiary(true),
      restartTutorial: () => this.restartTutorial(),
      themePref: () => this.themePref(),
      setTheme: (p) => this.setTheme(p),
      textSize: () => this.prefs.textSize ?? 'normal',
      setTextSize: (sz) => {
        this.prefs.textSize = sz;
        this.savePrefs();
        this.applyTextSize();
      },
      introVisible: (tab) => !this.prefs.intros.includes(tab) && !this.deps.isNarrating?.(),
      dismissIntro: (tab) => {
        if (!this.prefs.intros.includes(tab)) this.prefs.intros.push(tab);
        this.savePrefs();
      },
    };
  }

  private build(): void {
    // HUD
    this.essVal = h('span', { class: 'ess-val mono' }, '0');
    // The +8 % brightness of a pulse is a light layer over the number (opacity only, never a filter).
    this.essGlow = h('span', { class: 'ess-glow', 'aria-hidden': 'true' });
    this.essRate = h('span', { class: 'ess-rate mono zero' }, '+0/s');
    // The instrument's engraved label (Mono, tracked), beside the figure: «LUZ 340 · +12 luz/s» (§6 #1).
    this.essLabel = h('span', { class: 'ess-label', 'aria-hidden': 'true' });
    const essBtn = h(
      'button',
      { type: 'button', class: 'hud-ess' },
      h('span', { class: 'ess-icwrap' }, ic('essence', 24, 'ess-ic'), h('span', { class: 'ess-icglow', 'aria-hidden': 'true' })),
      h('span', { class: 'ess-col' }, h('span', { class: 'ess-top' }, this.essLabel, h('span', { class: 'ess-numwrap' }, this.essVal, this.essGlow)), this.essRate),
    );
    this.giftEl = h('div', { class: 'luz-gift', 'aria-live': 'polite', hidden: true });
    this.essBtn = essBtn;
    // A long press is something else (a secret): only a short tap opens the stats.
    essBtn.addEventListener('pointerdown', () => (this.essDownAt = performance.now()));
    essBtn.addEventListener('click', () => {
      const held = this.essDownAt ? performance.now() - this.essDownAt : 0;
      this.essDownAt = 0;
      if (held > 700) return;
      this.openJournal('stats');
    });
    this.journalDot = h('span', { class: 'dot pulse', hidden: true });
    this.journalBtn = h('button', { type: 'button', class: 'hud-btn', html: icon('journal') }, this.journalDot);
    this.journalBtn.addEventListener('click', () => this.openJournal('journal'));
    this.muteBtn = h('button', { type: 'button', class: 'hud-btn hud-mute', html: icon('sound') });
    this.muteBtn.addEventListener('click', () => {
      if (!this.v) return;
      this.sound('toggle');
      this.actions.setSetting('muted', !this.v.settings.muted);
    });
    this.lbBtn = h('button', { type: 'button', class: 'hud-btn hud-lb', html: icon('trophy'), hidden: !this.deps.leaderboard });
    this.lbBtn.addEventListener('click', () => this.openLeaderboard());
    this.settingsBtn = h('button', { type: 'button', class: 'hud-btn', html: icon('settings') });
    this.settingsBtn.addEventListener('click', () => this.openSettings());
    // Essence on the left, the session clock in the middle (what the player watches), menus on the right.
    const hud = h(
      'header',
      { class: 'bl-hud' },
      essBtn,
      this.clockSlot,
      h('div', { class: 'hud-actions' }, this.lbBtn, this.journalBtn, this.muteBtn, this.settingsBtn),
      this.giftEl,
    );
    // ADR-031 (docs/MECANICAS.md §3.2): «Racha ×1,2» and its ten dots, floating under the counter (no layout shift).
    this.streakChip = createStreakChip(hud, { lang: () => this.lang, reduceMotion: () => !!this.v?.settings.reduceMotion });

    // Objective
    this.objIcon = ic('target', 24);
    this.objLabel = h('span', { class: 'obj-label' });
    this.objText = h('span', { class: 'obj-text' });
    this.objFill = h('i');
    this.objBar = h('span', { class: 'obj-bar', hidden: true }, this.objFill);
    this.objEl = h(
      'div',
      { class: 'bl-objective', hidden: true, role: 'status' },
      this.objIcon,
      this.objLabel,
      this.objText,
      this.objBar,
      this.objectiveSlot,
    );

    // Dish
    this.dish = h('main', { class: 'bl-dish art-force-dark' });
    const gl = this.deps.glCanvas;
    gl.classList.add('bl-gl');
    this.fabPause = h('button', { type: 'button', class: 'fab fab-pause round' });
    this.fabPause.addEventListener('click', () => {
      this.sound('toggle');
      this.deps.onPauseToggle();
    });
    this.fabSpeed = h('button', { type: 'button', class: 'fab fab-speed', hidden: true });
    this.fabSpeed.addEventListener('click', () => this.cycleSpeed());
    this.fabErase = h('button', { type: 'button', class: 'fab fab-erase round danger', hidden: true, html: icon('eraser') });
    this.fabErase.addEventListener('click', () => this.toggleErase());
    // "Clean dish": always there next to the eraser, two taps (arm, then confirm) so it never fires by accident.
    // Away from the seed bar, and only on a long press (QA4 F-10); a keyboard still arms and confirms.
    this.fabClean = h('button', { type: 'button', class: 'fab fab-clean round', html: icon('broom'), 'data-testid': 'clean-dish' });
    this.fabClean.style.setProperty('--hold-ms', `${B.CLEAN_HOLD_MS}ms`);
    this.fabClean.addEventListener('pointerdown', (e) => this.onCleanDown(e));
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const) this.fabClean.addEventListener(ev, () => this.onCleanUp());
    this.fabClean.addEventListener('click', (e) => {
      if ((e as MouseEvent).detail === 0) this.onCleanTap();
    });
    // "Centrar": back to the whole dish (QA4 F-09), shown only when zoomed in or following a creature.
    this.fabCentre = h('button', { type: 'button', class: 'fab fab-centre', hidden: true, 'data-testid': 'recenter' }, ic('centre', 22), h('span', { class: 'fab-label' }, t('recenter')));
    this.fabCentre.addEventListener('click', () => {
      this.sound('tap');
      this.resetView();
    });
    // Overflow banner (view.overgrown): prominent, but the dish stays usable underneath.
    const cleanBig = h('button', { type: 'button', class: 'btn primary og-btn', 'data-testid': 'overgrown-clean' }, ic('broom', 24), h('span', { class: 'og-btn-l' }));
    cleanBig.addEventListener('click', () => {
      this.sound('confirm');
      this.actions.sterilizeDish?.();
    });
    this.overgrownEl = h(
      'div',
      { class: 'overgrown-banner', role: 'alert', hidden: true },
      h('div', { class: 'og-head' }, ic('warning', 24), h('div', { class: 'og-text' }, h('strong', { class: 'og-title' }), h('span', { class: 'og-sub' }))),
      cleanBig,
    );
    this.modePill = h('div', { class: 'mode-pill' });
    // Seed mode: ONE tap anywhere on the price pill explains the price (docs/MOMENTOS.md §2d).
    const priceInfo = (e: Event) => {
      if (!this.modePill.classList.contains('price')) return;
      e.stopPropagation();
      this.sound('open');
      this.deps.onSeedPriceInfo?.();
    };
    this.modePill.addEventListener('click', priceInfo);
    this.modePill.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        priceInfo(e);
      }
    });
    this.copyBtn = h('button', { type: 'button', class: 'copy-btn', hidden: true, 'data-testid': 'copy' });
    this.copyStrip = h('div', { class: 'copy-strip', hidden: true, role: 'listbox' });
    this.copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.copyBtn.getAttribute('aria-disabled') === 'true') {
        retriggerClass(this.copyBtn, 'shake');
        this.sound('deny');
        return;
      }
      this.copyOpen = !this.copyOpen;
      this.sound(this.copyOpen ? 'open' : 'close');
      this.copyKey = '';
      if (this.v) this.updateDishUI(this.v);
    });
    this.copyStrip.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-copy]') as HTMLElement | null;
      if (!b) return;
      e.stopPropagation();
      this.copyOpen = false;
      this.sound('toggle');
      this.enterPrint(b.dataset.copy!);
    });
    this.buffsEl = h('div', { class: 'buffs' });
    // ADR-031: sowing is the Sembrar button in the sessions cycle (the mode pill keeps the eraser, the copy mode and
    // the classic loop). Its price explainer is the small «i» beside it; the price meter's chips sit above it.
    this.sowBtn = new SowButton({
      dish: this.dish,
      camera: this.camera,
      lang: () => this.lang,
      reduceMotion: () => !!this.v?.settings.reduceMotion,
      onSow: (req) => this.sowNow(req),
      onDenied: (m) => {
        retriggerClass(this.sowBtn.el, 'shake');
        // A full dish, or one with no safe spot left (code review v0.027 #8): why, and the way out, on the dish.
        const d = this.v?.dish;
        if (m.state === 'full' && m.hint && d) this.sayBlocked(d.cx, d.cy, tx(m.hint));
      },
      onSound: (k) => this.sound(k),
      vibrate: (p) => this.vibrate(p),
    });
    this.sowInfo = h('button', { type: 'button', class: 'sow-info', hidden: !this.deps.onSeedPriceInfo, html: icon('info', 18) });
    this.sowInfo.addEventListener('click', (e) => {
      e.stopPropagation();
      this.sound('open');
      this.deps.onSeedPriceInfo?.();
    });
    this.sowWrap = h('div', { class: 'sow-wrap', hidden: true }, this.sowBtn.el, this.sowInfo);
    this.dishUI = h(
      'div',
      { class: 'bl-dish-ui' },
      this.toasts.el,
      this.fabPause,
      this.fabSpeed,
      this.fabErase,
      this.fabClean,
      this.fabCentre,
      this.buffsEl,
      this.modePill,
      this.sowWrap,
      this.copyStrip,
      this.copyBtn,
      this.overgrownEl,
    );
    // The objective floats over the top of the dish: it never pushes the dish or the panel.
    this.dish.append(gl, this.overlay.canvas, this.dishUI, this.objEl);
    this.renderPause();

    // Dock: Bestiary always; Nutrientes while a session runs, the Tree between sessions; the Datos preview.
    this.bestiaryDot = h('span', { class: 'dot pulse', hidden: true });
    this.bestiaryLabel = h('span', { class: 'dock-l' });
    this.bestiaryBtn = h('button', { type: 'button', class: 'dock-btn dock-bestiary', 'data-tab': 'bestiary' }, ic('bestiary', 26), this.bestiaryLabel, this.bestiaryDot);
    this.bestiaryBtn.addEventListener('click', (e) => {
      if (this.tapGuarded() || !this.pressOk(this.bestiaryBtn, e)) return;
      this.sound(this.bestiaryOpen ? 'close' : 'open');
      this.openBestiary(!this.bestiaryOpen);
    });
    this.treeLabel = h('span', { class: 'dock-l' });
    this.treeBtn = h('button', { type: 'button', class: 'dock-btn dock-main dock-tree', hidden: true }, ic('tree', 26), this.treeLabel);
    this.treeBtn.addEventListener('click', (e) => {
      if (this.tapGuarded() || !this.pressOk(this.treeBtn, e)) return;
      this.sound('open');
      this.deps.onOpenTree?.();
    });
    this.boostBtn = h('button', { type: 'button', class: 'dock-btn dock-main dock-boost', hidden: true });
    this.boostBtn.addEventListener('click', (e) => {
      if (!this.tapGuarded() && this.pressOk(this.boostBtn, e)) this.onBoostTap();
    });
    for (const b of [this.bestiaryBtn, this.treeBtn, this.boostBtn]) this.pressGuards.set(b, new PressGuard(B.DOCK_UNCOVER_GUARD_MS));
    // Every press inside a dock button's box: on the button, or on whatever covered it (VELA's box).
    window.addEventListener('pointerdown', (e) => this.notePress(e), { capture: true, passive: true });
    this.dock = h(
      'nav',
      { class: 'bl-dock' },
      h('div', { class: 'dock-in' }, this.bestiaryBtn, h('div', { class: 'dock-mid' }, this.boostBtn, this.treeBtn), this.previewSlot),
    );

    // Bestiary drawer: over the dish (bottom sheet on a phone, side drawer on a wide screen).
    this.drawerScrim = h('div', { class: 'bl-drawer-scrim', hidden: true });
    this.drawerScrim.addEventListener('click', () => this.openBestiary(false));
    this.drawerTitle = h('h2', { class: 'drawer-title' });
    const drawerClose = h('button', { type: 'button', class: 'drawer-x', html: icon('close', 22) });
    drawerClose.addEventListener('click', () => {
      this.sound('close');
      this.openBestiary(false);
    });
    this.drawer = h(
      'section',
      { class: 'bl-drawer', role: 'dialog', 'aria-modal': 'false', hidden: true },
      h('header', { class: 'drawer-head' }, ic('bestiary', 26), this.drawerTitle, drawerClose),
    );

    // Pause card: what pausing means, and the way out of a session ("Terminar ahora").
    this.pauseCard = h('div', { class: 'pause-card', role: 'dialog', hidden: true });

    this.fx = h('div', { class: 'bl-fx' });
    this.el.append(hud, this.dish, this.dock, this.drawerScrim, this.drawer, this.modalLayer, this.fx);
    this.dishUI.appendChild(this.pauseCard);
    toggle(this.el, 'no-objective', true);

    // Dish input
    new DishInput(this.dish, this.camera, {
      tap: (x, y) => this.onTap(x, y),
      bigTap: (x, y) => this.onBigTap(x, y),
      brush: (x, y) => {
        if (!this.camera.isOnDish(x, y)) return;
        const g = this.camera.screenToGrid(x, y);
        this.hideFirstHint();
        this.deps.onBrush(g.x, g.y);
      },
      erase: (x, y) => {
        if (!this.camera.isOnDish(x, y)) return;
        const g = this.camera.screenToGrid(x, y);
          this.deps.onErase(g.x, g.y);
        this.overlay.ripple(g.x, g.y, 'erase');
        this.vibrate(6);
      },
      cameraMoved: () => {
        if (this.follow !== null) {
          this.follow = null;
          this.renderCardFollow();
        }
      },
      pressStart: (x, y) => {
        this.overlay.chargeStart(x, y);
        // Same 120 ms grace as the charge ring: a quick tap never flashes "big seed".
        clearTimeout(this.chargeTimer);
        if (this.mode === 'seed' && this.deps.onChargeStart) this.chargeTimer = window.setTimeout(() => this.deps.onChargeStart?.(), 150);
      },
      pressEnd: () => {
        clearTimeout(this.chargeTimer);
        this.overlay.chargeEnd();
      },
      mode: () => this.mode,
      longPressEnabled: () => !!this.v?.tools.longPress,
      brushEnabled: () => !!this.v?.tools.brush,
      oneTouch: () => !!this.v?.settings.oneTouch,
      // QA-4 N6: a press right after a tap is part of the tapping (no streak before the clock), never the card.
      holdTarget: (x, y) => cardHoldOk(performance.now(), this.lastTapAt) && routeTap('long', x, y, this.overlay.tapScene()).kind === 'card',
      dragStart: (x, y) => this.onDragStart(x, y),
      dragMove: (x0, y0, x1, y1) => this.onDragMove(x0, y0, x1, y1),
      dragEnd: () => this.onDragEnd(),
      // ADR-031 (PB): in a session every tap lands at once; «Pulso fácil» holds pulse a creature.
      quickTaps: () => this.overlay.pulseMode,
      holdPulse: (x, y) => this.overlay.pulseMode && !!this.v?.settings.easyPulse && routeTap('tap', x, y, this.overlay.tapScene()).kind === 'pulse',
    });
    this.relabelStatic();
  }

  /** Static labels that depend on the language. */
  private relabelStatic(): void {
    setText(this.essLabel, tx(SESSION_UI.luz).toUpperCase());
    setAttr(this.journalBtn, 'aria-label', t('journal'));
    setAttr(this.journalBtn, 'title', t('journal'));
    setAttr(this.lbBtn, 'aria-label', t('ranking'));
    setAttr(this.lbBtn, 'title', t('ranking'));
    setAttr(this.settingsBtn, 'aria-label', t('settings'));
    setAttr(this.settingsBtn, 'title', t('settings'));
    setAttr(this.fabSpeed, 'aria-label', t('speed'));
    setAttr(this.fabErase, 'aria-label', t('eraser'));
    setAttr(this.fabErase, 'title', t('eraser'));
    setAttr(this.sowInfo, 'aria-label', t('seedPriceWhy'));
    setAttr(this.sowInfo, 'title', t('seedPriceWhy'));
    setAttr(this.fabClean, 'aria-label', t('cleanDish'));
    setAttr(this.fabClean, 'title', t('cleanDish'));
    // QA-4 N6: written once at build time it stayed «Centrar» in English.
    setText(this.fabCentre.querySelector('.fab-label') as HTMLElement, t('recenter'));
    setText(this.overgrownEl.querySelector('.og-title') as HTMLElement, t('overgrownTitle'));
    setText(this.overgrownEl.querySelector('.og-sub') as HTMLElement, t('overgrownText'));
    setText(this.overgrownEl.querySelector('.og-btn-l') as HTMLElement, t('cleanDish'));
    setText(this.objLabel, t('objective'));
    setText(this.bestiaryLabel, t('tabBestiary'));
    setText(this.drawerTitle, t('tabBestiary'));
    setAttr(this.drawer.querySelector('.drawer-x') as HTMLElement, 'aria-label', t('close'));
    setText(this.treeLabel, tx(SESSION_UI.dockTree));
    this.renderPause();
    this.modeKey = '';
    this.boostKey = '';
    this.dockKey = '';
  }

  private ensureBestiary(): Panel {
    if (this.bestiary) return this.bestiary;
    const p = new BestiaryPanel(this.ctx);
    p.el.id = 'bl-panel-bestiary';
    p.el.classList.add('drawer-panel');
    setAttr(this.bestiaryBtn, 'aria-controls', p.el.id);
    this.drawer.appendChild(p.el);
    this.bestiary = p;
    return p;
  }

  // ───────────────────────────── public API ─────────────────────────────

  update(view: GameView): void {
    const first = this.v === null;
    this.v = view;
    if (view.settings.lang !== this.lang || first) {
      const changed = view.settings.lang !== this.lang;
      this.lang = view.settings.lang;
      setLang(this.lang);
      document.documentElement.lang = this.lang;
      if (changed) this.relabelAll();
      this.splash?.relabel();
    }
    toggle(this.el, 'rm', view.settings.reduceMotion);
    toggle(this.el, 'sessions-cycle', view.cycle === 'sessions');
    // The game's Reduce motion reaches every layer (tokens shorten under .bl-rm, motion.ts helpers fade).
    if (this.rmApplied !== view.settings.reduceMotion) {
      this.rmApplied = view.settings.reduceMotion;
      setReduceMotion(view.settings.reduceMotion ? true : null);
      document.documentElement.classList.toggle('bl-rm', view.settings.reduceMotion);
    }
    this.applyTheme();
    this.sampleCovers();
    const bestiary = this.ensureBestiary();

    this.updateHUD(view);
    this.updateObjective(view);
    this.publishTopInset();
    this.placeHudChips();
    this.updateDock(view);
    this.updateDishUI(view);
    // ADR-031 (PB): the dish answers taps with pulses in a lab session of a game that has them.
    this.overlay.pulseMode = !!this.actions.pulse && !!view.session;
    this.overlay.setView(view);
    this.updateCard(view);
    if (this.bestiaryOpen) bestiary.update(view);
    for (const kind of ['settings', 'journal', 'species']) this.modals.find(kind)?.update?.(view);
  }

  frame(timeSec: number, dtSec: number): void {
    this.lastFrameAt = performance.now();
    // A toast on screen steps aside when VELA starts talking (cheap: a no-op while nothing shows).
    this.toasts.yieldIfHeld();
    // Follow a creature with the camera (not while a Momento owns the camera).
    if (this.follow !== null && !this.deps.cameraBusy?.()) {
      const p = this.overlay.creaturePos(this.follow);
      if (p) {
        const k = 1 - Math.exp(-Math.min(dtSec, 0.1) * 4);
        const cam = this.camera;
        cam.cx = this.camera.wrapX(cam.cx + this.camera.deltaX(p.x - cam.cx) * k);
        cam.cy = this.camera.wrapY(cam.cy + this.camera.deltaY(p.y - cam.cy) * k);
        if (cam.dish) cam.clamp(); // the round dish keeps the view over the glass
      }
    }
    this.overlay.draw(timeSec, dtSec);
    this.tweenEssence(dtSec);
    if (this.flyQ !== dishFx.quality) {
      this.flyQ = dishFx.quality;
      this.fly.setMax(dishFx.profile.fly);
    }
    this.fly.frame(this.lastFrameAt);
    if (this.steerId !== null) this.steerTick(false);
    this.updateCentre();
    this.positionCard();
  }

  blocked(): boolean {
    return !!this.splash?.visible || this.modals.open;
  }

  targetRect(id: string): DOMRect | null {
    const q = (sel: string, root: ParentNode = this.el): DOMRect | null => {
      const el = root.querySelector(sel) as HTMLElement | null;
      if (!el || !el.offsetParent) return null;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? r : null;
    };
    const around = (p: { x: number; y: number } | null, size: number): DOMRect | null => {
      if (!p) return null;
      const d = this.dish.getBoundingClientRect();
      const x = d.left + p.x;
      const y = d.top + p.y;
      if (x < d.left || y < d.top || x > d.right || y > d.bottom) return null;
      return new DOMRect(x - size / 2, y - size / 2, size, size);
    };
    if (id === 'dish') return q('.bl-dish');
    if (id === 'hud.essence') return q('.hud-ess');
    // Session clock and research tree are mounted by their own modules, maybe outside this root.
    if (id === 'hud.clock') return q('.ss-hud', document);
    if (id === 'hud.datos') return q('.ss-prev', document);
    if (id === 'boost') return q('.dock-boost');
    if (id === 'tree.dock') return q('.dock-tree');
    if (id === 'start.world') return q('.ss-world.on', document) ?? q('.ss-world', document);
    if (id === 'tree.open') return q('.ss-btn[data-act="tree"]', document);
    if (id === 'tree.center') return q('.rt-node[data-id="lab"]', document);
    if (id === 'tree.next') return q('.rt-node.can', document);
    if (id === 'world.picker') return q('.ss-worlds', document) ?? q('.ss-world', document);
    if (id.startsWith('tree.node.')) return q(`.rt-node[data-id="${CSS.escape(id.slice(10))}"]`, document);
    // ADR-031: the Sembrar button in sessions; the classic loop's seed pill otherwise.
    if (id === 'seed') return q('.sow-btn:not([hidden])') ?? (this.v?.cycle === 'sessions' ? null : q('.mode-pill'));
    if (id === 'objective') return q('.bl-objective');
    // The Bestiary's dock button is under the open drawer (owner bug B-10.1): its visible equivalent is
    // the new species' card in the drawer (else the first species card).
    if (id === 'tab.bestiary' && this.bestiaryOpen) return q('.bl-drawer .sp.is-new') ?? q('.bl-drawer .sp:not(.unknown)');
    if (id.startsWith('tab.')) return q(`.bl-dock [data-tab="${id.slice(4)}"]`);
    if (id.startsWith('upgrade.')) return q(`[data-up="${id.slice(8)}"] .buy`);
    if (id === 'creature') {
      const c = this.v?.creatures.find((cr) => cr.state === 'stable');
      return (c && around(this.overlay.creatureScreen(c.id), 70)) || q('.bl-dish');
    }
    if (id === 'golden') return around(this.overlay.goldenScreen(), 60) || q('.bl-dish');
    // (ADR-030 §2.4 step 6) The ripest drop of light on the dish, as drawn (its 64 px touch target).
    if (id === 'drop') {
      let best: DropView | null = null;
      for (const d of this.v?.drops ?? []) if (d.amount > 0 && (!best || d.fill > best.fill)) best = d;
      return best ? around(this.overlay.drops.posOf(best.id), 2 * DROP_FX.tapPx) : null;
    }
    return null;
  }

  gridToClient(x: number, y: number): { x: number; y: number } | null {
    const d = this.dish.getBoundingClientRect();
    if (d.width <= 0) return null;
    const p = this.camera.gridToScreen(x, y);
    return { x: d.left + p.x, y: d.top + p.y };
  }

  reveal(id: string): void {
    // The Bestiary is the only drawer; upgrades live in the research tree (the session flow opens it).
    if (id !== 'tab.bestiary') return;
    // Asked to open it while it is already open: that IS done (owner bug B-10.1). Said again, a moment
    // later (never inside the story's own event), so a scene waiting for it can end.
    if (this.bestiaryOpen) queueMicrotask(() => this.deps.onTabOpen?.('bestiary'));
    else this.openBestiary(true);
  }

  hudAnchor(id: 'essence' | 'datos' | 'clock'): DOMRect | null {
    const el =
      id === 'essence'
        ? (this.essBtn.querySelector('.ess-ic') as HTMLElement | null)
        : id === 'datos'
          ? (document.querySelector('.ss-prev:not([hidden])') as HTMLElement | null)
          : (this.clockSlot.querySelector('.ss-dial') as HTMLElement | null);
    if (!el || !el.offsetParent) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r : null;
  }

  /**
   * A mote (or a group) landed on a counter (B-6, ARTE-REALISTA §6.8): the drop icon and the figure
   * glow for 120 ms through opacity layers (no filter, no scale: an instrument lamp, not a cartoon).
   * Arrivals within 80 ms are one pulse. Reduce motion: nothing moves (the number already counts).
   */
  pulseHud(id: 'essence' | 'datos', amount: number): void {
    if (!(amount > 0) || !!this.v?.settings.reduceMotion) return;
    const now = performance.now();
    if (now - this.pulseAt[id] < 80) return;
    this.pulseAt[id] = now;
    if (id === 'datos') {
      const prev = document.querySelector('.ss-prev:not([hidden])') as HTMLElement | null;
      if (prev) pop(prev, 1.08);
      return;
    }
    const glow = this.essBtn.querySelector('.ess-icglow') as HTMLElement | null;
    const lamp = [{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }];
    if (glow && typeof glow.animate === 'function') glow.animate(lamp, { duration: 120 + 200, easing: EASING.standard });
    if (typeof this.essGlow.animate === 'function') this.essGlow.animate(lamp, { duration: 120 + 200, easing: EASING.standard });
  }

  get drawerOpen(): boolean {
    return this.bestiaryOpen;
  }

  openBestiary(open = true): void {
    if (open === this.bestiaryOpen) return;
    const v = this.v;
    if (open && !v) return;
    this.bestiaryOpen = open;
    screenChanged();
    const p = this.ensureBestiary();
    toggle(this.bestiaryBtn, 'active', open);
    setAttr(this.bestiaryBtn, 'aria-expanded', open ? 'true' : 'false');
    toggle(this.el, 'drawer-open', open);
    // In 300 ms `enter` from its edge (bottom on a phone, right on a laptop), out in 200 ms `exit`;
    // the scrim fades 200 / 160 ms (B-5). Reduce motion: an 80-ms fade.
    const rm = !!v?.settings.reduceMotion || typeof this.drawer.animate !== 'function';
    const off = this.wide ? 'translateX(100%)' : 'translateY(100%)';
    this.drawerAnim?.cancel();
    // A scrim still fading out (fill: forwards) would hold opacity 0 under the new fade-in once it ends:
    // reopening within the exit left the Bestiary without its backdrop (integrator review of v0.019).
    if (typeof this.drawerScrim.getAnimations === 'function') for (const x of this.drawerScrim.getAnimations()) x.cancel();
    if (open) {
      show(this.drawer, true);
      show(this.drawerScrim, true);
      if (typeof this.drawer.animate === 'function') {
        this.drawerAnim = this.drawer.animate(rm ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: off }, { transform: 'none' }], {
          duration: rm ? 80 : DURATION.sheet,
          easing: EASING.enter,
        });
        this.drawerScrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: rm ? 80 : DURATION.base, easing: EASING.standard });
      }
      if (v) {
        p.update(v);
        p.onShow?.();
        this.deps.onTabOpen?.('bestiary');
      }
      return;
    }
    if (typeof this.drawer.animate !== 'function') {
      show(this.drawer, false);
      show(this.drawerScrim, false);
      return;
    }
    const a = this.drawer.animate(rm ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: 'none' }, { transform: off }], {
      duration: rm ? 80 : DURATION.sheetOut,
      easing: EASING.exit,
      fill: 'forwards',
    });
    this.drawerScrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: rm ? 80 : DURATION.exit, easing: EASING.exit, fill: 'forwards' });
    this.drawerAnim = a;
    // Hidden when the exit ends, or by the clock if a slow frame holds the animation's finish event.
    const hide = () => {
      if (this.bestiaryOpen || this.drawerAnim !== a) return;
      show(this.drawer, false);
      show(this.drawerScrim, false);
      a.cancel();
      for (const x of this.drawerScrim.getAnimations()) x.cancel();
    };
    a.onfinish = hide;
    window.setTimeout(hide, (rm ? 80 : DURATION.sheetOut) + 40);
  }
  private drawerAnim: Animation | null = null;

  restartTutorial(): void {
    this.modals.closeAll();
    this.deps.onRestartTutorial?.();
  }

  lysed(x: number, y: number): void {
    const label = dissolvedLabel(true, false);
    if (label && !this.deps.isNarrating?.()) this.overlay.wentDark(x, y, tx(label), false);
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.overlay.paused = p;
    this.renderPause();
    this.pauseConfirm = false;
    this.renderPauseCard();
  }

  setCosmetics(c: OverlayCosmetics): void {
    this.overlay.setCosmetics(c);
  }

  addOverlayLayer(fn: OverlayLayer, slot: OverlayLayerSlot = 'creatures'): () => void {
    return this.overlay.addLayer(fn, slot);
  }

  creaturePos(id: number): { x: number; y: number } | null {
    return this.overlay.creaturePos(id);
  }

  creatureBodies(): { readonly discs: Float32Array; readonly n: number } {
    return this.overlay.bodies();
  }

  keepClear(box: { l: number; t: number; r: number; b: number } | null): void {
    this.overlay.keepClear(box);
  }

  setCreatureLabels(onAll: boolean, hidden: boolean): void {
    this.overlay.statusOnAll = onAll;
    this.overlay.statusHidden = hidden;
  }

  get dishEl(): HTMLElement {
    return this.dish;
  }

  get essenceEl(): HTMLElement {
    return this.essBtn;
  }

  setSimRate(stepsPerSec: number): void {
    this.overlay.simRate = Number.isFinite(stepsPerSec) && stepsPerSec > 0 ? stepsPerSec : 0;
  }

  showOfflineCard(seconds: number, essence: number): void {
    // The first return is explained by a Momento: no second popup for the same event.
    if (this.deps.suppressOfflineCard?.(seconds, essence)) return;
    if (this.splash?.visible) {
      this.pendingOffline = { seconds, essence };
      return;
    }
    const now = performance.now();
    if (Math.abs(this.lastOffline.seconds - seconds) < 1 && now - this.lastOffline.at < 3000) return;
    this.lastOffline = { at: now, seconds };
    if (seconds < 1 && essence <= 0) return;
    this.modals.find('offline')?.close();
    openOffline(this.modals, seconds, essence, !!this.v?.settings.reduceMotion);
  }

  showUnsupported(reason: string): void {
    this.splash?.dismiss();
    this.el.querySelector('.unsupported')?.remove();
    const retry = h('button', { type: 'button', class: 'btn primary' }, ic('rebirth', 24), t('retry'));
    retry.addEventListener('click', () => location.reload());
    this.el.appendChild(
      h(
        'div',
        { class: 'unsupported', role: 'alert' },
        h('div', { html: logo(88) }),
        h('h1', null, t('unsupportedTitle')),
        h('p', null, t('unsupportedBody')),
        // The raw (English) error stays behind "technical details" (QA1 #12).
        reason ? h('details', { class: 'unsup-details' }, h('summary', null, t('techDetails')), h('code', null, reason)) : null,
        retry,
      ),
    );
  }

  // ───────────────────────────── HUD ─────────────────────────────

  private updateHUD(v: GameView): void {
    const lang = this.lang;
    // No frames (a hidden tab, a test): the readout is told the value directly.
    if (this.dispEssence < 0 || performance.now() - this.lastFrameAt > 500) {
      this.dispEssence = this.readout.tick(v.essence, performance.now(), true);
      setText(this.essVal, essenceText(this.dispEssence, lang));
    }
    const buffMult = v.buffs.reduce((m, b) => (b.mult > 1 ? m * b.mult : m), 1);
    // Honest HUD (QA4 F-20, B-7): before the first seed the clock and the Esencia wait. The HUD says the
    // rate it WILL charge ("+2,0/s al empezar", quiet), so it never contradicts a creature's label.
    const waiting = !!v.session && v.session.phase === 'ready';
    const eps = v.session && v.session.phase !== 'running' ? 0 : v.essencePerSec;
    // Before the clock runs: the rate it WILL pay, greyed, «al empezar» beside it where there is room
    // (a phone keeps the words for the screen reader: the line never runs under the clock, B-7).
    // «+12 luz/s» in whole numbers (ADR-030 §6 #1): the unit says what the number is.
    const rateHTML =
      waiting && v.essencePerSec > 0
        ? `${tx(SESSION_UI.luzPerSec(wholeRate(v.essencePerSec, lang)))}<span class="when"> ${t('atStart')}</span>`
        : tx(SESSION_UI.luzPerSec(wholeRate(eps, lang))) + (buffMult > 1 && eps > 0 ? `<span class="buffx">×${fmtShort(buffMult, lang)}</span>` : '');
    setHTML(this.essRate, rateHTML);
    toggle(this.essRate, 'zero', eps <= 0);
    setAttr(this.essBtn, 'aria-label', t('essAria', { n: fmt(v.essence, lang), r: fmtRate(v.essencePerSec, lang) }));
    // Multiplier breakdown (QA3 F13), when the game exposes it: tooltip on the essence counter.
    const mu = v.multipliers;
    setAttr(
      this.essBtn,
      'title',
      mu ? `${t('multGlobal')} ×${fmtShort(mu.global, lang)} · ${t('multBuffs')} ×${fmtShort(mu.buffs, lang)}` : null,
    );

    this.streakChip.update(v.streak);
    toggle(this.el, 'streaking', !this.streakChip.el.hidden);

    show(this.journalDot, v.journal.some((e) => !e.read));
    setHTML(this.muteBtn, icon(v.settings.muted ? 'mute' : 'sound'));
    toggle(this.muteBtn, 'on', !v.settings.muted);
    setAttr(this.muteBtn, 'aria-label', v.settings.muted ? t('unmute') : t('mute'));
    setAttr(this.muteBtn, 'title', v.settings.muted ? t('unmute') : t('mute'));
  }

  /** The Luz readout: 8 Hz whole steps, ≤ 600 ms to a new value, light counted when it lands (§6.4). */
  private tweenEssence(dt: number): void {
    void dt;
    const v = this.v;
    if (!v) return;
    const before = this.dispEssence;
    const shown = this.readout.tick(v.essence, this.lastFrameAt, !!v.settings.reduceMotion);
    if (shown === before) return;
    // A sudden windfall (golden harvest, offline return) lights the figure: a lamp, not a bounce.
    const now = this.lastFrameAt;
    if (before >= 0 && shown - before > Math.max(25, before * 0.06) && now - this.essGlowAt > 700) {
      this.essGlowAt = now;
      if (!v.settings.reduceMotion && typeof this.essGlow.animate === 'function')
        this.essGlow.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: DURATION.celebrate, easing: EASING.standard });
    }
    this.dispEssence = shown;
    setText(this.essVal, essenceText(shown, this.lang));
  }

  // ───────────────────────────── objective ─────────────────────────────

  private updateObjective(v: GameView): void {
    if (this.updateObjectiveOverride()) return;
    const text = v.objective ? tx(v.objective) : null;
    // Progress: explicit optional field, else parsed from "(7/8)" in the text.
    let prog = (v as { objectiveProgress?: number }).objectiveProgress;
    if (prog === undefined && text) {
      const m = /\((\d[\d.,]*)\s*\/\s*(\d[\d.,]*)\)/.exec(text);
      if (m) {
        const a = parseFloat(m[1].replace(/[.,](?=\d{3}\b)/g, ''));
        const b = parseFloat(m[2].replace(/[.,](?=\d{3}\b)/g, ''));
        if (b > 0) prog = a / b;
      }
    }
    if (!this.objTimer) {
      show(this.objBar, prog !== undefined && text !== null);
      if (prog !== undefined) setStyle(this.objFill, 'transform', `scaleX(${Math.min(1, Math.max(0, prog)).toFixed(3)})`);
    }
    if (text === this.objShown && !this.objTimer) return;
    if (this.objTimer) {
      this.objPending = text;
      return;
    }
    if (this.objShown !== null && text !== this.objShown && this.objShown !== '') {
      // Celebrate the completed objective before showing the next one.
      this.objEl.classList.add('done');
      setStyle(this.objFill, 'transform', 'scaleX(1)');
      setHTML(this.objIcon, icon('check'));
      setText(this.objText, t('objectiveDone'));
      this.objPending = text;
      this.objTimer = window.setTimeout(() => {
        this.objTimer = 0;
        this.objEl.classList.remove('done');
        setHTML(this.objIcon, icon('target'));
        this.applyObjective(this.objPending);
      }, 1400);
      return;
    }
    this.applyObjective(text);
  }

  /**
   * The objective bar shows `objectiveSlot` (the Encargos badge) instead of the built-in line while
   * deps.objectiveOverride(). The bar is visible while the slot has visible content. Returns true when
   * the override owns the bar.
   */
  private updateObjectiveOverride(): boolean {
    const on = !!this.deps.objectiveOverride?.();
    if (on !== this.objOverride) {
      this.objOverride = on;
      if (this.objTimer) {
        clearTimeout(this.objTimer);
        this.objTimer = 0;
        this.objEl.classList.remove('done');
        setHTML(this.objIcon, icon('target'));
      }
      this.objShown = null;
      this.objPending = null;
      toggle(this.objEl, 'obj-custom', on);
      show(this.objectiveSlot, on);
      if (!on) {
        show(this.objEl, false);
        toggle(this.el, 'no-objective', true);
      }
    }
    if (!on) return false;
    let visible = false;
    for (const c of this.objectiveSlot.children) if (!(c as HTMLElement).hidden) visible = true;
    if (visible !== !this.objEl.hidden) {
      show(this.objEl, visible);
      toggle(this.el, 'no-objective', !visible);
      if (visible) retriggerClass(this.objEl, 'enter');
    }
    return true;
  }

  private topInset = '';
  private dockH = 0;
  /** The HUD chips' step down from home (px): the streak chip, then the gift chip (QA-3 N3). */
  private chipDy = [0, 0];
  private readonly chipBoxes = new Float32Array(4 * 8);
  private readonly chipObs: LabelObstacles = { boxes: this.chipBoxes, nBoxes: 0, discs: [], nDiscs: 0 };
  private readonly chipReq: StackRequest = { x: 0, y: 0, w: 0, h: 0, bounds: { l: 0, t: 0, r: 0, b: 0 } };
  private readonly chipOut: LabelPlacement = { x: 0, y: 0, slot: -1, clear: true };

  /**
   * One placement solver for the messages over the top of the dish (QA-3 N3: the objective pill hid the streak
   * chip from session 2 on): the objective, a toast, an Encargo bubble and VELA's top line hold their places; the
   * streak chip and the gift chip under the Luz counter step down past them (./labelPlace stackLabel), and the
   * dish's own labels keep out of all of them (overlay.keepClearHud).
   */
  private placeHudChips(): void {
    const o = this.chipObs;
    const q = this.chipBoxes;
    o.nBoxes = 0;
    const add = (l: number, t: number, r: number, b: number) => {
      if (o.nBoxes * 4 >= q.length || !(r - l > 1 && b - t > 1)) return;
      const k = o.nBoxes++ * 4;
      q[k] = l;
      q[k + 1] = t;
      q[k + 2] = r;
      q[k + 3] = b;
    };
    if (!this.objEl.hidden) {
      const r = this.objEl.getBoundingClientRect();
      add(r.left, r.top, r.right, r.bottom);
    }
    for (const el of this.el.ownerDocument.querySelectorAll<HTMLElement>('.toasts > .toast:not(.out), .enc-bubble, .sty-box.at-top:not([hidden])')) {
      if (el.closest('[hidden]') || el.getClientRects().length === 0) continue;
      const r = el.getBoundingClientRect();
      add(r.left, r.top, r.right, r.bottom);
    }
    const nFixed = o.nBoxes;
    const dish = this.dish.getBoundingClientRect();
    const chips = [this.streakChip.el, this.giftEl];
    for (let i = 0; i < chips.length; i++) {
      const el = chips[i];
      if (el.hidden) {
        if (this.chipDy[i]) el.style.transform = '';
        this.chipDy[i] = 0;
        continue;
      }
      // Its home: where the CSS lays it out (offsets ignore the transform, so a slide under way never moves it).
      const p = el.offsetParent as HTMLElement | null;
      if (!p || el.offsetWidth < 1) continue;
      const pr = p.getBoundingClientRect();
      const left = pr.left + p.clientLeft + el.offsetLeft;
      const r = { left, right: left + el.offsetWidth, width: el.offsetWidth, height: el.offsetHeight };
      const top = pr.top + p.clientTop + el.offsetTop;
      const rq = this.chipReq;
      rq.x = r.left + r.width / 2;
      rq.y = top + r.height / 2;
      rq.w = r.width;
      rq.h = r.height;
      rq.bounds.l = 0;
      rq.bounds.t = 0;
      rq.bounds.r = window.innerWidth;
      rq.bounds.b = dish.bottom;
      const dy = stackLabel(rq, o, this.chipOut) ? Math.round(this.chipOut.y - rq.y) : 0;
      if (dy !== this.chipDy[i]) {
        this.chipDy[i] = dy;
        el.style.transform = dy ? `translateY(${dy}px)` : '';
      }
      // The next chip keeps clear of this one.
      add(r.left, top + dy, r.right, top + dy + r.height);
    }
    // The dish's labels keep out of the chips (dish canvas px).
    const cr = this.overlay.canvas.getBoundingClientRect();
    this.overlay.keepClearHud(q, nFixed, o.nBoxes - nFixed, cr.left, cr.top);
  }
  /**
   * Where overlays may start under the floating objective: VELA's dialogue at the top (page
   * coordinates, --sty-top) and the toasts inside the dish (--toast-top). Never covers the objective.
   */
  private publishTopInset(): void {
    let v = '64px';
    let toast = '52px';
    const over = this.deps.topInsetOverride?.() ?? null;
    if (over !== null) v = `${Math.round(over)}px`;
    else if (!this.objEl.hidden) {
      const r = this.objEl.getBoundingClientRect();
      if (r.height > 0) {
        v = `${Math.max(64, Math.round(r.bottom + 8))}px`;
        toast = `${Math.max(52, Math.round(this.objEl.offsetTop + this.objEl.offsetHeight + 6))}px`;
      }
    }
    if (v + toast !== this.topInset) {
      this.topInset = v + toast;
      document.documentElement.style.setProperty('--sty-top', v);
      this.dish.style.setProperty('--toast-top', toast);
    }
    // The dock's band: the start card keeps «¡Empezar!» above it, off the Árbol tab (QA-3 §2).
    const dockH = this.dock.offsetHeight;
    if (dockH > 0 && dockH !== this.dockH) {
      this.dockH = dockH;
      document.documentElement.style.setProperty('--bl-dock-h', `${dockH}px`);
    }
  }

  private applyObjective(text: string | null): void {
    this.objShown = text;
    show(this.objEl, text !== null);
    toggle(this.el, 'no-objective', text === null);
    if (text !== null) {
      setText(this.objText, text);
      retriggerClass(this.objEl, 'enter');
    }
  }

  // ───────────────────────────── dock ─────────────────────────────

  /**
   * The dock under the dish: Bestiario always (a dot for a species not looked at yet); Nutrientes while a
   * session runs, the Tree between sessions (from session 2: session 1 has no Datos yet). Every cell
   * keeps its size, so nothing moves when a button appears.
   */
  private updateDock(v: GameView): void {
    const lang = this.lang;
    const se = v.session ?? null;
    const newSp = v.species.some((sp) => sp.isNew);
    show(this.bestiaryDot, newSp && !this.bestiaryOpen);
    const between = !!se && se.phase === 'ready' && se.n > 1;
    const running = !!se && se.phase === 'running';
    const key = `${between}|${running}|${lang}`;
    if (key !== this.dockKey) {
      this.dockKey = key;
      show(this.treeBtn, between);
      setAttr(this.treeBtn, 'aria-label', tx(SESSION_UI.goTree));
    }
    const b = v.boost ?? null;
    const showBoost = running && !!b && !!this.actions.buyBoost;
    show(this.boostBtn, showBoost);
    if (!showBoost || !b) {
      this.boostKey = '';
      return;
    }
    const wait = Math.ceil(b.wait ?? 0);
    // The first time it is on sale and affordable, it says what it does and what it costs (CLARIDAD
    // J-163, F-14: before buying), once, when nothing else is talking.
    if (b.affordable && !this.prefs.hints.includes('boost') && !this.deps.isNarrating?.() && !this.splash?.visible) {
      this.prefs.hints.push('boost');
      this.savePrefs();
      this.showDockTip(this.boostBtn, this.boostTip());
    }
    const late = !!b.noTime;
    const bk = `${b.cost}|${b.count}|${b.affordable}|${wait}|${b.needsLife}|${late}|${lang}`;
    if (bk === this.boostKey) return;
    this.boostKey = bk;
    // What one more adds, in whole percent and in the gain colour (never "×1,25", §2.11, §2.13).
    const pct = Math.round(((b.nextMult - b.mult) / Math.max(1e-9, b.mult)) * 100);
    this.boostBtn.className = `dock-btn dock-main dock-boost${b.affordable ? ' can' : ''}${wait > 0 || b.needsLife || late ? ' wait' : ''}`;
    this.boostBtn.textContent = '';
    // «Nutrientes» over «listo en 7 s» while not on sale yet, «+25 % · 💧 16» on sale (gain · price ↑),
    // «Falta vida» with nothing alive, «Ya no da tiempo» in the last seconds (docs/CLARIDAD2.md §2.7).
    // Two short lines: it fits a phone dock next to the preview.
    const bx = h('span', { class: 'bx' }, t('boostGain', { pct }));
    this.boostBtn.append(
      ic('nutrient', 26),
      h(
        'span',
        { class: 'dock-tx' },
        h('b', null, tx(TEXT.boost)),
        late
          ? h('small', null, tx(SESSION_UI.boostNoTime))
          : b.needsLife && wait === 0
            ? h('small', null, tx(SESSION_UI.boostNeedsLife))
            : wait > 0
              ? h('small', null, t('boostReadyIn', { s: wait }))
              : h('small', { class: b.affordable ? '' : 'short' }, bx, ' · ', h('span', { class: 'mono cost', html: `${icon('essence', 13)}${fmtShort(b.cost, lang)}` })),
      ),
    );
    const said = late
      ? SESSION_UI.boostNoTime
      : b.needsLife && wait === 0
        ? SESSION_UI.boostNoLife
        : wait > 0
          ? SESSION_UI.boostReady(wait)
          : SESSION_UI.boostCost(fmt(b.cost, lang));
    setAttr(this.boostBtn, 'aria-label', `${tx(said)}. ${tx(SESSION_UI.boostDesc)}`);
    setAttr(this.boostBtn, 'title', `${tx(SESSION_UI.boostDesc)} ${tx(SESSION_UI.boostPrice)}`);
  }

  /** What Nutrientes do, what they change ("Ahora 2 luz/s → 3 luz/s") and the price rule (QA4 F-17, §2.7). */
  private boostTip(): string {
    const v = this.v;
    const b = v?.boost;
    const base = `${tx(SESSION_UI.boostDesc)} ${tx(SESSION_UI.boostPrice)}`;
    if (!v || !b || !(v.essencePerSec > 0) || !(b.mult > 0)) return base;
    const after = (v.essencePerSec * b.nextMult) / b.mult;
    const l = this.lang;
    // «Ahora 2 luz/s → con Nutrientes 3 luz/s. Hasta el final de la sesión. El siguiente cuesta el doble.»
    // Whole numbers that round alike («3 → 3») would hide the gain: then one decimal («2,6 → 3,3»).
    const a = wholeRate(v.essencePerSec, l);
    const b2 = wholeRate(after, l);
    return tx(a === b2 ? SESSION_UI.boostTip(fmtRate(v.essencePerSec, l), fmtRate(after, l)) : SESSION_UI.boostTip(a, b2));
  }

  /** A one-time line over a dock button (what it does), gone after a few seconds or a tap. */
  private showDockTip(over: HTMLElement, text: string): void {
    this.dock.querySelector('.dock-tip')?.remove();
    const tip = h('div', { class: 'dock-tip', role: 'status' }, text);
    this.dock.appendChild(tip);
    const place = () => {
      const d = this.dock.getBoundingClientRect();
      const r = over.getBoundingClientRect();
      // On a phone the dish's round tools (brush, eraser) sit just above the dock's right side: stay clear.
      let right = d.width - 8;
      for (const f of this.dish.querySelectorAll<HTMLElement>('.fab.round:not([hidden])')) {
        const fr = f.getBoundingClientRect();
        if (fr.width > 0 && fr.bottom > d.top - 160 && fr.left - d.left > d.width / 2) right = Math.min(right, fr.left - d.left - 8);
      }
      tip.style.maxWidth = `${Math.max(200, right - 8)}px`;
      const w = tip.offsetWidth;
      tip.style.left = `${Math.max(8, Math.min(right - w, r.left - d.left + r.width / 2 - w / 2))}px`;
    };
    place();
    const close = () => {
      tip.classList.add('out');
      setTimeout(() => tip.remove(), 300);
    };
    tip.addEventListener('click', close);
    setTimeout(close, 7000);
  }

  private onBoostTap(): void {
    const b = this.v?.boost;
    if (!b || !this.actions.buyBoost) return;
    if (b.affordable && this.actions.buyBoost()) {
      this.sound('buy');
      this.vibrate(15);
      this.fxBurst(this.boostBtn, 'var(--good)', t('boostGain', { pct: Math.round(((b.nextMult - b.mult) / Math.max(1e-9, b.mult)) * 100) }));
      this.boostKey = '';
      this.dock.querySelector('.dock-tip')?.remove();
      return;
    }
    // Not yet: say the true reason where the finger is (QA-3 N9: «Ya no da tiempo» with light to spare said
    // «Te faltan 1 de luz»).
    this.sound('deny');
    retriggerClass(this.boostBtn, 'shake');
    const why = boostDenial(b, this.v?.essence ?? 0);
    const text =
      why.kind === 'wait'
        ? tx(SESSION_UI.boostIn(fmtClock(why.s)))
        : why.kind === 'noTime'
          ? t('boostNoTimeWhy')
          : why.kind === 'needsLife'
            ? tx(SESSION_UI.boostNeedsLifeWhy)
            : why.kind === 'short'
              ? t(deniedShortKey(why.n), { n: fmt(why.n, this.lang) })
              : '';
    if (text) this.toasts.push(text, 'info', 'nutrient');
    if (why.kind !== 'wait' && why.kind !== 'noTime') this.showDockTip(this.boostBtn, this.boostTip());
  }

  // ───────────────────────────── pause card ─────────────────────────────

  /** Paused: a small card over the dish ("En pausa" · Seguir · Terminar ahora, with its confirmation). */
  private renderPauseCard(): void {
    const v = this.v;
    const running = !!v?.session && v.session.phase === 'running';
    const on = this.paused && !!v && v.cycle === 'sessions';
    show(this.pauseCard, on);
    if (!on) {
      this.pauseConfirm = false;
      return;
    }
    this.pauseCard.textContent = '';
    const resume = h('button', { type: 'button', class: 'btn primary' }, ic('play', 24), tx(SESSION_UI.keepPlaying));
    resume.addEventListener('click', () => {
      this.sound('toggle');
      this.deps.onPauseToggle();
    });
    if (this.pauseConfirm) {
      const datos = this.deps.endSessionDatos?.() ?? 0;
      const yes = h('button', { type: 'button', class: 'btn danger-soft' }, ic('stop', 24), tx(SESSION_UI.endNowYes));
      yes.addEventListener('click', () => {
        this.sound('confirm');
        this.pauseConfirm = false;
        this.deps.onEndSession?.();
      });
      this.pauseCard.append(h('p', { class: 'pc-title' }, tx(SESSION_UI.endNowConfirm(fmt(datos, this.lang)))), h('div', { class: 'pc-row' }, resume, yes));
      return;
    }
    const end = running && this.deps.onEndSession ? h('button', { type: 'button', class: 'btn' }, ic('stop', 24), tx(SESSION_UI.endNow)) : null;
    end?.addEventListener('click', () => {
      this.sound('tap');
      this.pauseConfirm = true;
      this.renderPauseCard();
    });
    this.pauseCard.append(
      h('p', { class: 'pc-title' }, ic('pause', 24), tx(SESSION_UI.pausedTitle)),
      h('p', { class: 'pc-body' }, tx(SESSION_UI.pausedBody)),
      h('div', { class: 'pc-row' }, resume, end),
    );
  }

  // ───────────────────────────── dish UI ─────────────────────────────

  private renderPause(): void {
    const p = this.paused;
    this.fabPause.textContent = '';
    this.fabPause.appendChild(ic(p ? 'play' : 'pause', 24));
    // In sessions the pause card over the dish says "En pausa"; a wide label here ran under the
    // objective bar (the Encargo badge). The classic loop has no card: it keeps the label.
    const label = p && this.v?.cycle !== 'sessions';
    if (label) this.fabPause.appendChild(h('span', { class: 'fab-label' }, t('paused')));
    toggle(this.fabPause, 'round', !label);
    toggle(this.fabPause, 'on', p);
    setAttr(this.fabPause, 'aria-label', p ? t('resume') : t('pause'));
    setAttr(this.fabPause, 'title', p ? t('resume') : t('pause'));
  }

  private cycleSpeed(): void {
    const v = this.v;
    if (!v || v.tools.speeds.length < 2) return;
    const s = v.tools.speeds;
    const i = s.indexOf(v.tools.speed);
    const next = s[(i + 1) % s.length];
    this.actions.setSpeed(next);
    this.sound('toggle');
    this.vibrate(6);
  }

  private toggleErase(): void {
    if (!this.v?.tools.eraser) return;
    this.mode = this.mode === 'erase' ? 'seed' : 'erase';
    this.printId = null;
    this.sound('toggle');
    this.vibrate(10);
    this.updateDishUI(this.v);
  }

  private enterPrint(id: string): void {
    this.printId = id;
    this.mode = 'print';
    this.closeCard();
    if (this.v) this.updateDishUI(this.v);
  }

  /** A long press on "Limpiar placa" cleans; a short tap only says how (QA4 F-10). */
  private onCleanDown(e: PointerEvent): void {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    window.clearTimeout(this.cleanHold);
    this.cleanHeld = true;
    this.fabClean.classList.add('holding');
    this.cleanHold = window.setTimeout(() => {
      if (!this.cleanHeld) return;
      this.cleanHeld = false;
      this.fabClean.classList.remove('holding');
      this.sound('confirm');
      this.vibrate(20);
      this.actions.sterilizeDish?.();
    }, B.CLEAN_HOLD_MS);
  }

  private onCleanUp(): void {
    if (!this.cleanHeld) return;
    this.cleanHeld = false;
    window.clearTimeout(this.cleanHold);
    this.fabClean.classList.remove('holding');
    this.sound('tap');
    this.toasts.push(t('cleanHold'), 'info', 'broom');
  }

  closeTransient(): void {
    if (this.card) this.closeCard();
  }

  /** A card just closed: the dock ignores taps for a moment (the rest of a double tap). */
  guardTaps(ms = B.CARD_TAP_GUARD_MS): void {
    this.tapGuardUntil = Math.max(this.tapGuardUntil, performance.now() + ms);
  }

  private tapGuarded(): boolean {
    return performance.now() < this.tapGuardUntil;
  }

  /** A press anywhere: the dock buttons under it learn whether they were the target or were covered. */
  private notePress(e: PointerEvent): void {
    const now = performance.now();
    for (const [b, g] of this.pressGuards) {
      if (b.hidden) continue;
      const r = b.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) continue;
      g.press(e.target instanceof Node && b.contains(e.target), now);
    }
  }

  /** Whether something covers each visible dock button right now (sampled with each view, ~10×/s). */
  private sampleCovers(): void {
    const now = performance.now();
    for (const [b, g] of this.pressGuards) {
      const r = b.hidden ? null : b.getBoundingClientRect();
      if (!r || r.width <= 0) {
        g.clear(now);
        continue;
      }
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (hit && !b.contains(hit)) g.covered(now);
      else g.clear(now);
    }
  }

  /** May this dock click act (QA-CLARIDAD #17)? A keyboard or programmatic click has no press (detail 0). */
  private pressOk(b: HTMLElement, e: MouseEvent): boolean {
    return this.pressGuards.get(b)?.click(performance.now(), e.detail === 0) ?? true;
  }

  /** The whole dish again: zoom 1, centred, not following anyone (QA4 F-09). Each session starts so. */
  resetView(): void {
    this.follow = null;
    const cam = this.camera;
    if (cam.zoom !== 1) cam.zoomAt(1 / cam.zoom, cam.viewW / 2, cam.viewH / 2);
    cam.cx = cam.homeX;
    cam.cy = cam.homeY;
    cam.clamp();
    if (this.card) this.renderCardFollow();
    this.updateCentre();
  }

  private updateCentre(): void {
    // Not while a Momento owns the camera (it zooms in to explain, then eases back by itself).
    show(this.fabCentre, !this.deps.cameraBusy?.() && (this.camera.zoom > B.RECENTER_MIN_ZOOM || this.follow !== null));
  }

  private onCleanTap(): void {
    const now = performance.now();
    if (this.cleanArmed && now < this.cleanArmed) {
      this.cleanArmed = 0;
      this.fabClean.classList.remove('armed');
      this.sound('confirm');
      this.vibrate(20);
      this.actions.sterilizeDish?.();
      return;
    }
    this.cleanArmed = now + 3000;
    this.sound('tap');
    this.fabClean.classList.add('armed');
    this.toasts.push(t('cleanConfirm'), 'warn', 'broom');
    window.setTimeout(() => {
      if (this.cleanArmed && performance.now() >= this.cleanArmed) {
        this.cleanArmed = 0;
        this.fabClean.classList.remove('armed');
      }
    }, 3100);
  }

  private exitMode(): void {
    this.mode = 'seed';
    this.printId = null;
    if (this.v) this.updateDishUI(this.v);
  }

  /** «Copiar» and its strip of this world's species (src/ui/copyPick.ts); hidden in the copy or eraser mode. */
  private updateCopy(v: GameView): void {
    const cp = copyPick(v);
    const on = cp.show && this.mode === 'seed';
    if (!on) this.copyOpen = false;
    const open = on && cp.enabled && this.copyOpen;
    const lang = this.lang;
    const key = on ? `${cp.enabled}|${open}|${cp.species.map((s) => `${s.id}:${s.cost}:${s.name}`).join(',')}|${lang}` : '';
    if (key === this.copyKey) return;
    this.copyKey = key;
    show(this.copyBtn, on);
    show(this.copyStrip, open);
    if (!on) return;
    this.copyBtn.textContent = '';
    this.copyBtn.append(ic('print', 20), h('span', null, cp.enabled ? t('copyBtn') : tx(cp.reason!)));
    this.copyBtn.classList.toggle('off', !cp.enabled);
    this.copyBtn.classList.toggle('on', open);
    setAttr(this.copyBtn, 'aria-disabled', cp.enabled ? 'false' : 'true');
    setAttr(this.copyBtn, 'aria-expanded', open ? 'true' : 'false');
    this.copyStrip.textContent = '';
    if (!open) return;
    this.copyStrip.append(h('span', { class: 'cs-title' }, t('copyPickTitle')));
    for (const s of cp.species) {
      const chip = h(
        'button',
        { type: 'button', class: 'cs-sp', role: 'option', 'data-copy': s.id },
        h('span', { class: 'cs-dot' }),
        h('b', null, s.name),
        h('span', { class: 'mono cs-cost', html: s.cost === 0 ? t('copyFree') : `${icon('essence', 13)}${fmtShort(s.cost, lang)}` }),
      );
      if (s.hue !== undefined) chip.style.setProperty('--sp', `hsl(${Math.round(s.hue)} 70% 60%)`);
      this.copyStrip.append(chip);
    }
  }

  private updateDishUI(v: GameView): void {
    const lang = this.lang;
    // Speed
    const speeds = v.tools.speeds;
    show(this.fabSpeed, speeds.length > 1);
    if (speeds.length > 1) setHTML(this.fabSpeed, `${icon('speed', 15)}<span>×${v.tools.speed}</span>`);
    toggle(this.fabSpeed, 'on', v.tools.speed > 1);
    // Eraser
    if (!v.tools.eraser && this.mode === 'erase') this.mode = 'seed';
    show(this.fabErase, v.tools.eraser && this.mode !== 'print');
    toggle(this.fabErase, 'on', this.mode === 'erase');
    toggle(this.dish, 'mode-erase', this.mode === 'erase');
    // Flooded dish: orange pulsing tint + banner with a big "Clean dish" button.
    const flooded = !!v.overgrown;
    toggle(this.dish, 'overgrown', flooded);
    show(this.overgrownEl, flooded && !!this.actions.sterilizeDish);
    show(this.fabClean, !!this.actions.sterilizeDish);
    if (this.mode === 'print' && !v.species.some((s) => s.id === this.printId)) this.mode = 'seed';
    this.updateCopy(v);

    // Mode pill
    let key: string;
    const printSp = this.mode === 'print' ? v.species.find((s) => s.id === this.printId) : undefined;
    if (printSp) key = `print|${printSp.name}|${lang}`;
    else if (this.mode === 'erase') key = `erase|${lang}`;
    else key = `seed|${v.canSeed}|${fmtShort(v.seedCost, lang)}|${v.seedsGrowing ? 1 : 0}|${v.charges?.free ?? 0}|${lang}`;
    if (key !== this.modeKey) {
      this.modeKey = key;
      const pill = this.modePill;
      pill.textContent = '';
      pill.removeAttribute('role');
      pill.removeAttribute('tabindex');
      const xBtn = () => {
        const b = h('button', { type: 'button', class: 'mp-x', 'aria-label': t('cancel'), html: icon('close', 16) });
        b.addEventListener('click', () => this.exitMode());
        return b;
      };
      if (printSp) {
        pill.className = 'mode-pill print interactive';
        const [pre, post] = t('printMode').split('{name}');
        pill.append(
          ic('print', 24),
          h('span', { class: 'mp-text' }, pre, h('b', null, printSp.name), post ?? ''),
          xBtn(),
        );
      } else if (this.mode === 'erase') {
        pill.className = 'mode-pill erase interactive';
        pill.append(ic('eraser', 24), h('span', { class: 'mp-text' }, t('eraserMode')), xBtn());
      } else {
        const why = !!this.deps.onSeedPriceInfo;
        // Seeds still forming (QA2 H-05): a calm grey "Wait…" (stopwatch icon) instead of an alarming red price.
        const growing = !!v.seedsGrowing;
        // With the explainer, the whole pill is ONE button (tap the price → why it costs that).
        pill.className = 'mode-pill' + (growing ? ' growing' : v.canSeed ? '' : ' poor') + (why ? ' interactive price bl-nodish' : '');
        pill.setAttribute(
          'aria-label',
          `${t('seed')}: ${fmtShort(v.seedCost, lang)}${growing ? `. ${t('seedWaitWhy')}` : ''}${why ? `. ${t('seedPriceWhy')}` : ''}`,
        );
        if (growing) setAttr(pill, 'title', t('seedWaitWhy'));
        else pill.removeAttribute('title');
        if (why) {
          pill.setAttribute('role', 'button');
          pill.setAttribute('tabindex', '0');
        }
        // Free seeds waiting: the pill says so instead of a price it will not charge (§5.2 task 6).
        const free = v.charges?.free ?? 0;
        const cost =
          free > 0
            ? h('span', { class: 'mp-cost mp-free mono' }, t('seedFreeN', { n: String(free) }))
            : h('span', { class: 'mp-cost mono', html: `${icon('essence', 15)}${fmtShort(v.seedCost, lang)}` });
        if (growing) pill.append(ic('seed', 24), h('span', { class: 'mp-wait' }, ic('time', 16), t('seedWait')), cost, this.seedMeterSlot);
        else pill.append(ic('seed', 24), cost, this.seedMeterSlot);
        // The "i" is the visible affordance; its click bubbles to the pill's handler.
        if (why) pill.append(h('span', { class: 'mp-info', 'aria-hidden': 'true', html: icon('info', 16) }));
        // The price moved: say which way instead of jumping silently.
        if (this.lastSeedCost >= 0 && v.seedCost !== this.lastSeedCost) {
          cost.classList.add(v.seedCost < this.lastSeedCost ? 'cheaper' : 'pricier');
        }
        this.lastSeedCost = v.seedCost;
      }
    }

    // ADR-031: in the sessions cycle the Sembrar button takes the seed pill's place (seed mode only).
    const sowing = v.cycle === 'sessions' && this.mode === 'seed';
    this.sowBtn.update(v);
    show(this.sowWrap, sowing && !this.sowBtn.el.hidden);
    show(this.modePill, !sowing);
    toggle(this.el, 'sow-on', sowing);
    if (sowing && this.seedMeterSlot.parentElement !== this.sowWrap) this.sowWrap.prepend(this.seedMeterSlot);

    // Buffs
    reconcile(
      this.buffsEl,
      v.buffs,
      (b) => b.id,
      this.buffRows,
      () => {
        const ring = h('span', { class: 'ring' });
        const name = h('span');
        const x = h('span', { class: 'bx' });
        const tm = h('span', { class: 'bt' });
        return { el: h('div', { class: 'buff' }, ring, name, x, tm), ring, name, x, tm };
      },
      (row, b) => {
        const max = Math.max(this.buffMax.get(b.id) ?? 0, b.remaining);
        this.buffMax.set(b.id, max);
        setStyle(row.ring, '--p', (max > 0 ? b.remaining / max : 0).toFixed(3));
        setText(row.name, tx(b.name));
        setText(row.x, b.mult > 1 ? `×${fmtShort(b.mult, lang)}` : '');
        setText(row.tm, fmtClock(b.remaining));
      },
    );
    for (const id of [...this.buffMax.keys()]) if (!v.buffs.some((b) => b.id === id)) this.buffMax.delete(id);

    // First-run hint: "¡Toca aquí!" until the first tap.
    // Also at the start of every later session: the clock waits for a tap on the dish.
    // Never under a creature's card (QA4 F-05: card text over "¡Toca aquí!"): one layer at a time.
    const waiting = !!v.session && v.session.phase === 'ready' && v.session.n > 1 && !this.deps.isNarrating?.() && !this.card;
    const wantHint = ((!this.firstTapDone && v.stats.seeds === 0 && v.creatures.length === 0) || waiting) && !this.card;
    // Everything faded and no tap for a while: the finger comes back, "¡Toca aquí otra vez!" (CLARIDAD J-164).
    let anyone = false;
    for (const c of v.creatures) if (c.state !== 'dead') anyone = true;
    const wantAgain =
      !wantHint &&
      this.lastTapAt > 0 &&
      performance.now() - this.lastTapAt > TAP_AGAIN_HINT_MS &&
      !anyone &&
      !v.seedsGrowing &&
      v.canSeed &&
      !this.card &&
      !this.deps.isNarrating?.();
    const want = wantHint || wantAgain;
    // ADR-031: in sessions «¡Toca aquí!» is a hand on the Sembrar button (a tap on the dish never sows).
    this.sowBtn.setHand(sowing && want);
    if (sowing) {
      if (this.hintEl) this.hideFirstHint();
    } else if (want && !this.hintEl) {
      this.hintEl = h(
        'div',
        { class: 'dish-hint' },
        h('div', { class: 'tap-rings' }, h('i'), h('i'), h('b')),
        h('div', { class: 'h1' }, t(wantHint ? 'tapDish' : 'tapAgain')),
        wantHint ? h('div', { class: 'h2' }, waiting && this.firstTapDone ? tx(SESSION_UI.startHint) : t('tapDishSub')) : null,
      );
      this.dishUI.appendChild(this.hintEl);
      this.hintSpot = null;
    } else if (!want && this.hintEl) this.hideFirstHint();
    if (this.hintEl && !sowing) this.placeHint(v);

    // Gesture hints the first time a gesture becomes available.
    if (!this.hintEl && !this.gestureHint && !this.card && !this.splash?.visible && !this.deps.isNarrating?.()) {
      if (v.tools.longPress && !this.prefs.hints.includes('long')) {
        this.prefs.hints.push('long');
        this.savePrefs();
        // ADR-031: in sessions the big seed is the Sembrar button's (held, or a double tap in one-touch mode).
        if (sowing) this.showGestureHint(v.settings.oneTouch ? t('hintDoubleTapSow') : t('hintHoldSow'), 'hand');
        else this.showGestureHint(v.settings.oneTouch ? t('hintDoubleTap') : t('hintLongPress'), 'hand');
      } else if (v.tools.brush && !v.settings.oneTouch && !v.drops && !this.prefs.hints.includes('brush')) {
        this.prefs.hints.push('brush');
        this.savePrefs();
        this.showGestureHint(t('hintBrush'), 'motion');
      } else if (this.deps.onSteer && !this.prefs.hints.includes('steer') && v.creatures.some((c) => c.state === 'stable' && c.behavior === 'swimmer')) {
        // The first swimmer: it can be guided (§2.5). Said once; a guided drag also marks it as known.
        this.prefs.hints.push('steer');
        this.savePrefs();
        this.showGestureHint(t('hintSteer'), 'motion');
      }
    }
  }

  /**
   * «¡Toca aquí!» over free agar (QA-CLARIDAD-2 C3): with creatures on the dish (the Nevera's, from session 2) the
   * centre sat on top of them; the spot is picked once and again only when a creature comes near it.
   */
  private placeHint(v: GameView): void {
    const el = this.hintEl!;
    if (!v.dish) return;
    const R = v.calibration.R;
    const bodies = v.creatures.filter((c) => c.state !== 'dead');
    const near = (p: { x: number; y: number }) => bodies.some((c) => Math.hypot(c.x - p.x, c.y - p.y) - c.r < 2 * R);
    if (!bodies.length) this.hintSpot = null;
    else if (!this.hintSpot || near(this.hintSpot)) {
      // Not under the objective bar and the notices over the top of the dish (QA-CLARIDAD-2 §2f): the rings'
      // radius below the bar's bottom edge, in dish coordinates.
      const d = this.dish.getBoundingClientRect();
      const bar = this.objEl.getBoundingClientRect();
      const topPx = bar.height > 0 ? bar.bottom - d.top + HINT_BAR_GAP_PX : 0;
      this.hintSpot = safeSowSpot(v.dish, bodies, R, SIM_STEPS_PER_SEC * SESSION_SIM_PACE, (x, y) => this.camera.gridToScreen(x, y).y < topPx);
      this.hintW = 0;
    }
    if (!this.hintSpot) {
      el.classList.remove('at');
      el.style.left = el.style.top = '';
      return;
    }
    el.classList.add('at');
    if (!this.hintW) this.hintW = el.offsetWidth;
    const p = this.camera.gridToScreen(this.hintSpot.x, this.hintSpot.y);
    // The rings on the spot; the words kept inside the glass (over the rim's frost they could not be read).
    const c = this.camera.gridToScreen(v.dish.cx, v.dish.cy);
    const inner = Math.abs(this.camera.gridToScreen(v.dish.cx + v.dish.radius, v.dish.cy).x - c.x) * HINT_INSIDE;
    const lo = Math.max(this.hintW / 2, c.x - inner + this.hintW / 2);
    const hi = Math.min(this.camera.viewW - this.hintW / 2, c.x + inner - this.hintW / 2);
    const x = lo <= hi ? Math.max(lo, Math.min(hi, p.x)) : c.x;
    setStyle(el, 'left', `${Math.round(x)}px`);
    setStyle(el, 'top', `${Math.round(p.y)}px`);
    // In the lower half the words go above the rings: below them they fell off the glass onto the light agar.
    el.classList.toggle('up', p.y > c.y);
    // …and the rings stay on the spot itself.
    setStyle(el, '--hint-dx', `${Math.round(p.x - x)}px`);
  }

  private hideFirstHint(): void {
    this.firstTapDone = true;
    const el = this.hintEl;
    if (!el) return;
    this.hintEl = null;
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }

  private showGestureHint(text: string, iconName: string): void {
    const el = h('div', { class: 'dish-hint small' }, h('div', { class: 'h1' }, ic(iconName, 24), text));
    this.gestureHint = el;
    this.dishUI.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => {
        el.remove();
        if (this.gestureHint === el) this.gestureHint = null;
      }, 300);
    }, 3800);
  }

  // ───────────────────────────── dish taps ─────────────────────────────

  private hitGolden(px: number, py: number): boolean {
    const gs = this.overlay.goldenScreen();
    if (gs && Math.hypot(gs.x - px, gs.y - py) <= 36) {
      this.actions.collectGolden();
      this.vibrate([12, 30, 12]);
      return true;
    }
    return false;
  }

  private onTap(px: number, py: number): void {
    if (!this.v) return;
    if (this.hitGolden(px, py)) return;
    const cam = this.camera;
    if (!cam.isOnDish(px, py)) {
      this.closeCard();
      // Outside the glass nothing happens: say so once (QA-CLARIDAD, docs/CLARIDAD2.md §5.2 task 3).
      if (!this.outsideTold && this.mode === 'seed' && !this.deps.isNarrating?.()) {
        this.outsideTold = true;
        this.showGestureHint(t('tapInside'), 'hand');
      }
      return;
    }
    const g = cam.screenToGrid(px, py);
    if (this.mode === 'print' && this.printId) {
      const id = this.printId;
      this.exitMode();
      this.sound('confirm');
      this.deps.onPrint(id, g.x, g.y);
      this.overlay.ripple(g.x, g.y, 'print');
      this.vibrate(15);
      return;
    }
    if (this.mode === 'erase') {
      this.deps.onErase(g.x, g.y);
      this.overlay.ripple(g.x, g.y, 'erase');
      this.vibrate(8);
      return;
    }
    // A status pill: its behaviour explains itself (Behaviour Guide); never seed under a pill. A drop
    // drawn next to the pill is collected first (the finger went for the light).
    const scene = this.overlay.tapScene();
    const pill = scene.collecting && dropAt(scene, px, py) >= 0 ? null : this.overlay.statusHit(px, py);
    if (pill) {
      const sessions = scene.pulsing || this.v.cycle === 'sessions';
      const r = pillTapRoute(pill, { pulsing: sessions, streaking: !!scene.streaking, easyPulse: !!this.v.settings.easyPulse });
      if (r === 'behavior' && this.deps.onBehaviorInfo) {
        this.sound('open');
        this.deps.onBehaviorInfo(pill.behavior!);
      } else if (r === 'card') this.openCard(pill.id);
      else if (r === 'pulse' && sessions) {
        // The pill is its creature's: the tap pulses it, where it is drawn (QA-3 §2: never its card). Once, away from
        // a streak, it says how the card opens (MECANICAS §3.4: «mantener» is told on the pill).
        if (!scene.streaking && !this.prefs.hints.includes('holdCard')) {
          this.prefs.hints.push('holdCard');
          this.savePrefs();
          this.showGestureHint(t('hintHoldCard'), 'hand');
        }
        for (let i = 0; i < scene.creatureCount; i++) {
          const c = scene.creatures[i];
          if (c.id === pill.id) return this.sessionTap(c.x, c.y, g);
        }
      }
      return;
    }
    // ADR-031 (docs/MECANICAS.md §3.1): in the sessions cycle a finger on the dish never sows.
    if (scene.pulsing || this.v.cycle === 'sessions') {
      this.sessionTap(px, py, g);
      return;
    }
    // ADR-030 §2.2.1: a drop, or a creature with light, is collected; a tap never sows on either.
    const route = routeTap('tap', px, py, scene);
    if (route.kind === 'collect') {
      this.closeCard();
      this.collectDrop(route.drop);
      return;
    }
    if (route.kind === 'card') {
      this.openCard(route.id);
      return;
    }
    if (route.kind === 'cardHint') {
      // One-touch mode has no long press: the tap is its way to the card.
      if (this.v.settings.oneTouch) this.openCard(route.id);
      else if (!this.prefs.hints.includes('holdCard')) {
        this.prefs.hints.push('holdCard');
        this.savePrefs();
        this.showGestureHint(t('hintHoldCard'), 'hand');
      }
      return;
    }
    if (this.card) {
      this.closeCard();
      return;
    }
    this.lastTapAt = performance.now();
    this.hideFirstHint();
    this.deps.onDishTap(g.x, g.y, { big: false });
  }

  /**
   * A tap on the dish in a session (ADR-031, docs/MECANICAS.md §3.1; routes: src/ui/dishTap.ts): a glimmer is caught,
   * a stable creature pulses (it glows at once; its drop comes with the pulse), a loose drop is collected, a forming
   * seed blinks grey, empty agar ripples and gathers the drops and glimmers in reach. It never sows and never costs.
   */
  private sessionTap(px: number, py: number, g: { x: number; y: number }): void {
    const a = this.actions;
    const ov = this.overlay;
    this.lastTapAt = performance.now();
    const scene = ov.tapScene();
    const route = routeTap('tap', px, py, scene, this.reach);
    if (route.kind !== 'pulse') this.closeCard();
    switch (route.kind) {
      case 'catch':
        this.catchMote(route.mote);
        return;
      case 'pulse': {
        ov.pulseTap(route.id);
        // Its drop is drawn in now; the game's pulse collects it (no collectAt: one tap, one payment).
        this.handAt = route.drop !== null ? ov.drops.take(route.drop, this.overlayNow()) : null;
        a.pulse?.(route.id);
        this.handAt = null;
        this.hideFirstHint();
        return;
      }
      case 'collect':
        return this.collectDrop(route.drop);
      case 'grey':
        return ov.greyTap(route.id);
      case 'card':
        return this.openCard(route.id);
      case 'ripple': {
        ov.agarTap(px, py);
        const r = this.reach;
        // The drops in reach come in one call: one tap, one hit (the game draws each one in through lightCollected).
        if (r.dropN > 0 && this.hand.ripple(px, py, scene.reachPx) > 0) this.hideFirstHint();
        for (let i = 0; i < r.moteN; i++) this.catchMote(r.motes[i]);
        return;
      }
      default:
        // A game without the pulse (no `scene.pulsing`): its old routes, but empty agar never sows in a session.
        if (route.kind === 'cardHint' && this.v?.settings.oneTouch) this.openCard(route.id);
        else if (route.kind === 'sow') ov.ripple(g.x, g.y, 'auto');
    }
  }

  /**
   * Catch glimmer `id`: it pops on screen only when the game took it (a paused dish keeps its glimmers, code review
   * v0.027 #1: a glimmer that vanished there would still be in the game, and land later as a drop).
   */
  private catchMote(id: number): void {
    if ((this.actions.catchMote?.(id) ?? 0) > 0) this.overlay.moteTaken(id);
  }

  /** The Sembrar button asked for a seed (ADR-031). The host sows; without its hook, the old dish tap at that spot. */
  private sowNow(req: SowRequest): void {
    const v = this.v;
    this.lastTapAt = performance.now();
    this.sowPresses++;
    this.closeCard();
    if (req.big) this.lastBigTap = performance.now();
    if (this.deps.onSow) this.deps.onSow(req);
    else this.deps.onDishTap(req.spot.x, req.spot.y, { big: req.big });
    // A drag let go on a bad spot moved to a safe one: said once a run, never a scolding (§3.4).
    if (req.snapped && !this.snapTold) {
      this.snapTold = true;
      this.overlay.wentDark(req.spot.x, req.spot.y, tx(TEXT.sowSnap), false);
    }
    // Session 2 on: on the third press, the hand shows the seed can be dragged (§6.2), once.
    if (v && (v.session?.n ?? 1) >= 2 && this.sowPresses === COLLECT_UI.dragHintTap && !req.dragged && !this.prefs.hints.includes('sowDrag')) {
      this.prefs.hints.push('sowDrag');
      this.savePrefs();
      this.showGestureHint(tx(TEXT.tutDrag), 'hand');
    }
  }

  private onBigTap(px: number, py: number): void {
    if (!this.v) return;
    if (this.hitGolden(px, py)) return;
    if (!this.camera.isOnDish(px, py)) return;
    // A long press on a creature opens its card (ADR-030: it was the short tap); elsewhere the big seed.
    const route = routeTap('long', px, py, this.overlay.tapScene());
    if (route.kind === 'card') {
      this.vibrate(10);
      this.openCard(route.id);
      return;
    }
    // ADR-031: in sessions the big seed is the Sembrar button's; a long press on the agar does nothing.
    if (this.v.cycle === 'sessions') return;
    if (!this.v.tools.longPress) return;
    const g = this.camera.screenToGrid(px, py);
    this.lastTapAt = performance.now();
    this.hideFirstHint();
    this.closeCard();
    this.lastBigTap = performance.now();
    this.vibrate(18);
    this.deps.onDishTap(g.x, g.y, { big: true });
  }

  // ───────────────────────────── collecting light and guiding (ADR-030) ─────────────────────────────

  /** Bus and overlay hooks of the collection: feedback, flights, gifts, warnings. */
  private wireCollection(): void {
    const ov = this.overlay;
    ov.dangerText = (steer) => {
      // ADR-031 (docs/MECANICAS.md §4): warn only when the player can act. A pair nobody can steer gets the red
      // link alone, no alarm; one with a swimmer: a soft tone, a short buzz and «¡Van a chocar! Arrastra una».
      if (!steer || !this.deps.onSteer) return null;
      this.sound('warn');
      this.vibrate([8, 40, 8]);
      if (this.deps.contactTold?.()) return null;
      return tx(TEXT.contactAct);
    };
    ov.drops.onRipe = (x, y) => {
      // «¡Lista!» beside the first ripe drops of the first sessions (§2.2.2), never on a busy screen.
      if (this.ripeTold >= 2 || (this.v?.session?.n ?? 1) > 3 || this.deps.isNarrating?.()) return;
      this.ripeTold++;
      ov.ripeLabel(x, y, t('dropReady'));
    };
    bus.on('lightCollected', (e) => {
      let at = e.by === 'hand' && this.handAt ? this.handAt : null;
      this.handTold = this.handTold || e.by === 'hand';
      if (!at) {
        // Where that drop is drawn (an owned one sits on its creature's outline), else its grid point. A drop the hand
        // gathered (a ripple, a sweep: HandGather) draws in now, the one the game named.
        const d = ov.drops.atGrid(e.x, e.y, 4);
        const took = d && e.by === 'hand' && this.hand.active ? ov.drops.take(d.id, this.overlayNow()) : null;
        const p = d ? null : ov.screenOf(e.x, e.y);
        at = took ?? (d ? { x: d.x, y: d.y, hue: ov.drops.hueOf(d.id) } : { x: p!.x, y: p!.y, hue: ov.drops.hueOf(-1) });
      }
      this.collectedAt(at.x, at.y, at.hue, e.amount, e.by);
    });
    bus.on('luzGift', (e) => this.showGift(e.amount, e.reason));
  }

  /**
   * Collect drop `id` by hand: the bead draws in now, the game moves its light to the wallet, and the
   * feedback (a "+N", motes to the counter, the pop) follows the game's lightCollected event, from where
   * the drop was drawn.
   */
  private collectDrop(id: number): void {
    const a = this.actions;
    if (!a.collect && !a.collectAt) return;
    const at = this.overlay.drops.take(id, this.overlayNow());
    this.handAt = at;
    this.handTold = false;
    let got = 0;
    if (a.collect) got = a.collect(id);
    else if (at && a.collectAt) {
      const g = this.camera.screenToGrid(at.x, at.y);
      got = a.collectAt(g.x, g.y, 1);
    }
    // A game that pays without telling the bus still shows where the light went (a drop hit's own pulse, ADR-031,
    // comes on the bus 'pulse': PB's overlay shows it).
    if (got > 0 && !this.handTold && at) this.collectedAt(at.x, at.y, at.hue, got, 'hand');
    this.handAt = null;
    if (got > 0) {
      // ADR-031 §3.1: in sessions only the ¡Chispazo! buzzes (at 8 taps a second a buzz each tap annoys).
      if (this.v?.cycle !== 'sessions') this.vibrate(6);
      this.hideFirstHint();
    }
  }

  /** A refused seed, said at grid (x, y): a red ring, the first sentence big and the rest small. */
  private sayBlocked(x: number, y: number, msg: string, near?: { x: number; y: number; r: number; id?: number }): void {
    const cut = msg.search(/[.!] /);
    this.overlay.seedBlocked(x, y, cut > 0 ? msg.slice(0, cut + 1) : msg, cut > 0 ? msg.slice(cut + 2) : '', near);
  }

  /** The overlay's effect clock (s) for effects started from the UI. */
  private overlayNow(): number {
    return this.overlay.clock;
  }

  /** Feedback of light that left the dish at overlay point (x, y). */
  private collectedAt(x: number, y: number, hue: number, amount: number, by: 'hand' | 'pipette' | 'sweep'): void {
    if (!(amount > 0)) return;
    const lang = this.lang;
    // Whole numbers on the dish (docs/CLARIDAD2.md §2.13: no decimals). A sliver below 1 shows no number at all (its
    // mote still flies to the counter): «+0,4 luz» read as a reward of nothing.
    if (amount >= 0.5) this.overlay.collected(x, y, amount, hue, (n) => fmt(Math.max(1, Math.round(n)), lang));
    const d = this.dish.getBoundingClientRect();
    const cx = d.left + x;
    const cy = d.top + y;
    const wallet = Math.max(1, this.v?.essence ?? 1);
    const n = 1 + (amount >= COLLECT_UI.moteShare[0] * wallet ? 1 : 0) + (amount >= COLLECT_UI.moteShare[1] * wallet ? 1 : 0);
    const now = performance.now();
    this.fly.launch(cx, cy, 'essence', hueHex(hue, 70), by === 'sweep' ? 1 : n, now);
    // The counter rises when the light lands, not before it leaves the dish.
    if (!this.v?.settings.reduceMotion) {
      const a = this.hudAnchor('essence');
      const dist = a ? Math.hypot(a.left + a.width / 2 - cx, a.top + a.height / 2 - cy) : 300;
      this.readout.hold(amount, now + flyDuration(dist) + (n - 1) * 60);
    }
  }

  /**
   * "+5 · primera semilla" beside the counter (bus luzGift): one chip, amounts of the same reason add up; the
   * session's requests and the Encargos are one reason, counted («+189 · 7 encargos cumplidos», QA-CLARIDAD-2 C9).
   */
  private showGift(amount: number, reason: Text): void {
    if (!(amount > 0)) return;
    const now = performance.now();
    const request = reason.es === TEXT.gift.goal.es || reason.es === TEXT.gift.encargo.es;
    const key = request ? 'request' : reason.es + '|' + reason.en;
    const g = this.gift && this.gift.key === key && now - this.gift.at < COLLECT_UI.giftMs ? this.gift : null;
    const n = (g?.n ?? 0) + 1;
    this.gift = { key, amount: (g?.amount ?? 0) + amount, reason, at: now, n };
    setText(this.giftEl, tx(TEXT.giftLine(this.gift.amount, request && n > 1 ? TEXT.giftMany(n) : reason)));
    show(this.giftEl, true);
    if (!this.v?.settings.reduceMotion && typeof this.giftEl.animate === 'function' && !g)
      this.giftEl.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: DURATION.base, easing: EASING.enter });
    clearTimeout(this.giftTimer);
    this.giftTimer = window.setTimeout(() => {
      show(this.giftEl, false);
      this.gift = null;
    }, COLLECT_UI.giftMs);
  }

  private onDragStart(x: number, y: number): 'steer' | 'sweep' | null {
    if (!this.v || !this.camera.isOnDish(x, y)) return null;
    const route = routeTap('drag', x, y, this.overlay.tapScene());
    if (route.kind === 'steer' && this.deps.onSteer) {
      this.steerId = route.id;
      this.steerSent = NaN;
      // ADR-031: the game hears it was the finger (a warned contact avoided now is «¡Salvada!»).
      this.actions.noteSteer?.(route.id);
      this.closeCard();
      this.overlay.steerGuide(route.id, x, y);
      if (!this.prefs.hints.includes('steer')) {
        this.prefs.hints.push('steer');
        this.savePrefs();
      }
      return 'steer';
    }
    if (route.kind === 'sweep' || route.kind === 'steer') {
      // Without a guide (not wired), a drag from a swimmer is a sweep like any other.
      const scene = this.overlay.tapScene();
      if (!scene.collecting && !scene.pulsing) return null;
      this.sweepN = 0;
      this.sweepMoteN = 0;
      this.sweepHits.reset();
      return 'sweep';
    }
    return null;
  }

  private onDragMove(x0: number, y0: number, x1: number, y1: number): void {
    if (this.steerId !== null) {
      this.overlay.steerGuide(this.steerId, x1, y1);
      this.steerTick(false);
      return;
    }
    // Sweep: every drop the finger passes over, once, as it passes (the feedback runs with the finger).
    const scene = this.overlay.tapScene();
    const before = this.sweepN;
    this.sweepN = dropsOnSegment(scene, x0, y0, x1, y1, this.sweepIds, this.sweepN);
    // The game collects the drops on this stretch of the path, no hit (code review v0.027 #4).
    if (this.sweepN > before && this.hand.sweep(x0, y0, x1, y1, scene.dropPx) > 0) this.hideFirstHint();
    if (!scene.pulsing) return;
    // ADR-031 (PB): the glimmers on the path are caught, and every creature it crosses glows (once per SWEEP_REHIT_S).
    const m0 = this.sweepMoteN;
    this.sweepMoteN = motesOnSegment(scene, x0, y0, x1, y1, this.sweepMotes, this.sweepMoteN);
    for (let i = m0; i < this.sweepMoteN; i++) this.catchMote(this.sweepMotes[i]);
    const n = this.sweepHits.cross(scene, x0, y0, x1, y1, performance.now() / 1000, SWEEP_REHIT_S, this.sweepCross);
    if (n === 0) return;
    for (let i = 0; i < n; i++) this.overlay.pulseTap(this.sweepCross[i]);
    this.actions.pulseMany?.(this.sweepCross.slice(0, n));
  }

  private onDragEnd(): void {
    if (this.steerId !== null) {
      this.steerTick(true);
      this.steerId = null;
      this.overlay.steerGuideEnd();
    }
    this.sweepN = 0;
  }

  /**
   * The guided swimmer heads for the finger: the heading from where it is drawn now to the finger, sent
   * while the finger moves (and as the swimmer moves under a still finger), at most every steerEveryMs.
   */
  private steerTick(final: boolean): void {
    const id = this.steerId;
    if (id === null) return;
    const c = this.overlay.creatureDrawn(id);
    const f = this.overlay.guidePoint();
    if (!c || !f) {
      this.deps.onSteer?.(id, null);
      this.steerId = null;
      this.overlay.steerGuideEnd();
      return;
    }
    const dx = f.x - c.x;
    const dy = f.y - c.y;
    if (Math.hypot(dx, dy) < 12) return;
    const h = Math.atan2(dy, dx);
    const now = performance.now();
    const turned = Number.isNaN(this.steerSent) ? Infinity : Math.abs(Math.atan2(Math.sin(h - this.steerSent), Math.cos(h - this.steerSent)));
    if (!final && now - this.steerAt < COLLECT_UI.steerEveryMs && turned < COLLECT_UI.steerTurn) return;
    this.steerAt = now;
    this.steerSent = h;
    this.deps.onSteer?.(id, h);
  }

  // ───────────────────────────── creature card ─────────────────────────────

  private openCard(id: number): void {
    if (this.card?.id === id) return;
    this.closeCard();
    // The next fast taps never land on its «Seguir» (QA-3 §2: it zoomed in and followed by accident).
    screenChanged();
    const name = h('div', { class: 'ccard-name' });
    const state = h('span', { class: 'ccard-state' });
    const close = h('button', { type: 'button', class: 'ccard-close', 'aria-label': t('close'), html: icon('close', 18) });
    const beh = h('dd');
    // The behaviour row explains what "swims" means (Behaviour Guide), when the integrator offers it.
    if (this.deps.onBehaviorInfo) {
      beh.classList.add('ccard-beh-link');
      beh.setAttribute('role', 'button');
      beh.setAttribute('tabindex', '0');
      const openGuide = () => {
        // Not classified yet: the guide opens at the top (every behaviour, as silhouettes until seen).
        const b = this.v?.creatures.find((c) => c.id === this.card?.id)?.behavior ?? null;
        this.deps.onBehaviorInfo?.(b);
      };
      beh.addEventListener('click', openGuide);
      beh.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openGuide();
        }
      });
    }
    const eps = h('dd', { class: 'eps mono' });
    const age = h('dd', { class: 'mono' });
    const follow = h('button', { type: 'button', class: 'btn block' });
    const arrow = h('span', { class: 'ccard-arrow' });
    const el = h(
      'div',
      { class: 'ccard bl-nodish', role: 'dialog' },
      h('div', { class: 'ccard-head' }, name, close),
      h('div', { class: 'ccard-meta' }, state),
      h(
        'dl',
        { class: 'ccard-rows', style: 'margin-top:0' },
        h('dt', null, t('behavior')),
        beh,
        h('dt', null, t('yields')),
        eps,
        h('dt', null, t('age')),
        age,
      ),
      follow,
      arrow,
    );
    close.addEventListener('click', () => this.closeCard());
    follow.addEventListener('click', () => {
      if (!this.card) return;
      if (this.follow === this.card.id) this.follow = null;
      else {
        this.follow = this.card.id;
        if (this.camera.zoom < 1.8) this.camera.zoomAt(1.8 / this.camera.zoom, this.camera.viewW / 2, this.camera.viewH / 2);
      }
      this.renderCardFollow();
    });
    name.addEventListener('click', () => {
      if (this.card?.speciesId) this.ctx.openSpecies(this.card.speciesId);
    });
    this.dishUI.appendChild(el);
    this.card = { id, el, name, state, beh, eps, age, follow, arrow, w: 240, h: 150, speciesId: null };
    this.overlay.selectedId = id;
    if (this.v) this.updateCard(this.v);
    this.card.w = el.offsetWidth;
    this.card.h = el.offsetHeight;
    this.renderCardFollow();
    this.positionCard();
    this.sound('tap');
    this.vibrate(6);
  }

  private closeCard(): void {
    if (!this.card) return;
    this.card.el.remove();
    if (this.follow === this.card.id) this.follow = null;
    this.card = null;
    this.overlay.selectedId = null;
  }

  private renderCardFollow(): void {
    const c = this.card;
    if (!c) return;
    const on = this.follow === c.id;
    c.follow.textContent = '';
    c.follow.append(ic('follow', 24), on ? t('unfollow') : t('follow'));
    toggle(c.follow, 'primary', on);
  }

  private updateCard(v: GameView): void {
    const c = this.card;
    if (!c) return;
    const cr = v.creatures.find((x) => x.id === c.id);
    if (!cr || cr.state === 'dead') {
      this.closeCard();
      return;
    }
    // Its text changes size: re-measure so the clamp keeps it fully on screen (QA2 H-11, QA3 F15).
    c.w = c.el.offsetWidth || c.w;
    c.h = c.el.offsetHeight || c.h;
    const lang = this.lang;
    const sp = cr.speciesId ? v.species.find((s) => s.id === cr.speciesId) : undefined;
    c.speciesId = cr.speciesId;
    // Always the common name (CLARIDAD J-149); the Latin is only its tooltip (and small in the Bestiary).
    const sci = sp?.scientificName ?? sp?.catalogName ?? null;
    const nm = sp ? sp.name : (cr.speciesName ?? t('unknownCreature'));
    setText(c.name, nm);
    setAttr(c.name, 'title', sci && sci !== nm ? sci : null);
    // The species' own colour on the card (border + name), so each species reads as itself.
    const spHex = cr.hue !== undefined ? hueHex(cr.hue) : '';
    if (c.el.dataset.hue !== spHex) {
      c.el.dataset.hue = spHex;
      if (spHex) c.el.style.setProperty('--sp', spHex);
      else c.el.style.removeProperty('--sp');
      toggle(c.el, 'has-sp', !!spHex);
    }
    c.name.style.cursor = sp ? 'pointer' : '';
    setText(c.state, stateName(cr.state));
    c.state.className = `ccard-state s-${cr.state}`;
    const col = cr.behavior ? BEHAVIOR_COLOR[cr.behavior] : '#8B98A5';
    setHTML(c.beh, `<span class="icw" style="color:${col}">${icon(cr.behavior ?? 'unknown', 16)}</span>${behaviorName(cr.behavior)}`);
    // The same rate as its pill and the HUD: 0 while the clock waits for the first seed (RF-10).
    // Before the clock runs it says what it will give, like the HUD (B-7).
    setText(c.eps, !earningNow(v) && v.session?.phase === 'ready' && cr.eps > 0 ? t('rateAtStart', { r: fmtRate(cr.eps, lang) }) : t('yieldsValue', { v: fmtRate(earningNow(v) ? cr.eps : 0, lang) }));
    // Age is counted in simulation steps; on screen it is seconds at ×1 (CLARIDAD J-28).
    setText(c.age, fmtDuration(cr.age / AGE_STEPS_PER_SEC, lang));
  }

  private positionCard(): void {
    const c = this.card;
    if (!c) return;
    const p = this.overlay.creatureScreen(c.id);
    if (!p) return;
    const W = this.camera.viewW;
    const H = this.camera.viewH;
    const gap = 12;
    let top = p.y - p.r - gap - c.h;
    let below = false;
    if (top < 8) {
      top = p.y + p.r + gap;
      below = true;
    }
    // Keep clear of the pause / speed buttons and the objective at the top of the dish (QA2 H-11).
    top = Math.min(Math.max(64, top), H - c.h - 8);
    const left = Math.min(Math.max(8, p.x - c.w / 2), W - c.w - 8);
    c.el.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
    const ax = Math.min(Math.max(14, p.x - left - 6), c.w - 26);
    c.arrow.style.left = `${ax.toFixed(1)}px`;
    if (below) {
      c.arrow.style.top = '-7px';
      c.arrow.style.bottom = '';
      c.arrow.style.transform = 'rotate(225deg)';
    } else {
      c.arrow.style.top = '';
      c.arrow.style.bottom = '-7px';
      c.arrow.style.transform = 'rotate(45deg)';
    }
  }

  // ───────────────────────────── modals ─────────────────────────────

  /**
   * Extra content at the end of the species sheet (deps.speciesExtras: the species card). The sheet
   * rebuilds its body on changes, so the extras' box is re-appended after each render.
   */
  private attachSpeciesExtras(m: ReturnType<typeof openSpecies>, id: string): void {
    if (!this.deps.speciesExtras) return;
    const box = h('div', { class: 'spc-extras' });
    let extras: { update(v: GameView): void; dispose(): void } | null = null;
    try {
      extras = this.deps.speciesExtras(box, id);
    } catch (err) {
      console.warn('[ui] species extras failed', err);
    }
    if (!extras) return;
    const ex = extras;
    const ensure = () => {
      if (box.parentElement !== m.body) m.body.appendChild(box);
    };
    ensure();
    const update = m.update?.bind(m);
    m.update = (v) => {
      update?.(v);
      ensure();
      ex.update(v);
    };
    const relabel = m.relabel?.bind(m);
    m.relabel = () => {
      relabel?.();
      ensure();
      if (this.v) ex.update(this.v);
    };
    const close = m.close.bind(m);
    let closed = false;
    (m as { close(): void }).close = () => {
      if (!closed) {
        closed = true;
        ex.dispose();
      }
      close();
    };
  }

  private openJournal(tab: 'journal' | 'ach' | 'stats'): void {
    if (!this.v) return;
    this.modals.find('journal')?.close();
    openJournal(this.modals, this.ctx, tab);
  }

  private openLeaderboard(): void {
    const lb = this.deps.leaderboard;
    if (!lb || !this.v) return;
    this.modals.find('leaderboard')?.close();
    openLeaderboard(this.modals, this.ctx, lb);
  }

  private openSettings(): void {
    if (!this.v || this.modals.find('settings')) return;
    openSettings(this.modals, this.ctx);
  }

  private relabelAll(): void {
    this.relabelStatic();
    this.bestiary?.rebuild();
    for (const kind of ['settings', 'species', 'leaderboard']) this.modals.find(kind)?.relabel?.();
    const j = this.modals.find('journal');
    if (j) {
      j.close();
      this.openJournal('journal');
    }
    this.objShown = null;
  }

  // ───────────────────────────── bus ─────────────────────────────

  private bindBus(): void {
    const ov = this.overlay;
    bus.on('seed', (e) => {
      const big = e.manual && performance.now() - this.lastBigTap < 150 + SOW_UI.doubleMs;
      const kind = e.manual ? (big ? 'big' : 'seed') : 'auto';
      // ADR-031: a seed from the Sembrar button flies there in an arc (300 ms) and rings where it lands.
      if (e.manual && this.v?.cycle === 'sessions' && !this.v.settings.reduceMotion) {
        this.sowBtn.flyTo(e.x, e.y);
        window.setTimeout(() => ov.ripple(e.x, e.y, kind), SOW_UI.flightMs);
      } else ov.ripple(e.x, e.y, kind);
      // Moved to the nearest spot with room (spacing rule): show where it went.
      if (e.from) ov.seedMoved(e.from.x, e.from.y, e.x, e.y);
      if (e.manual) this.hideFirstHint();
    });
    bus.on('seedDenied', (e) => {
      // Why, in Esencia the player can count (CLARIDAD J-161).
      const v = this.v;
      const short = v ? Math.max(1, Math.ceil(e.cost - v.essence)) : 0;
      const waiting = !!v?.creatures.some((c) => c.state === 'stable');
      ov.denied(e.x, e.y, fmtShort(e.cost, this.lang), short > 0 ? { text: t(deniedShortKey(short), { n: fmt(short, this.lang) }), sub: waiting ? t('deniedWait') : '' } : undefined);
      retriggerClass(this.modePill, 'shake');
      retriggerClass(this.sowBtn.el, 'shake');
      this.vibrate([10, 30, 10]);
    });
    // A refused tap always shows why, where it happened; nothing was charged (no toast, no layout shift).
    bus.on('seedBlocked', (e) => {
      // Refused for free, said on the spot: a red ring and why (first sentence big, the rest small).
      const room = this.v?.seedPrice?.capacity ?? this.v?.seedPrice?.freeSlots;
      // «¡Muy cerca! Si se tocan, se juntan y se apagan.» (docs/CLARIDAD2.md §6 #4): what would happen. Never in a
      // session (ADR-031): the Sembrar button always finds a safe spot, so there is nothing to scold.
      const sessions = this.v?.cycle === 'sessions';
      // (ADR-027 v0.027) The run's Nevera creature is still waking: the true reason, where the finger is.
      const waking = e.reason === 'growing' && !!this.v?.session?.wakeHold;
      const full = e.crowded ? tx(TEXT.dishNoRoom) : room ? tx(TEXT.dishFull(room)) : '';
      const msg = waking ? tx(TEXT.wakeSow) : e.reason === 'tooClose' ? (sessions ? '' : t('tooCloseSeed')) : e.reason === 'full' ? full : '';
      if (msg) this.sayBlocked(e.x, e.y, msg, e.near);
      // A full dish: every creature's place blinks, so "full" is something you can see (CLARIDAD J-160).
      if (e.reason === 'full' && this.v) {
        let n = 0;
        for (const c of this.v.creatures) if (c.state !== 'dead' && n++ < 16) ov.bornRing(c.x, c.y);
      }
      // 'growing': the pill already says "Espera…"; a shake points at it (the meter's chip says why).
      retriggerClass(this.modePill, 'shake');
      retriggerClass(this.sowBtn.el, 'shake');
      this.sound('deny');
      this.vibrate([10, 30, 10]);
    });
    bus.on('creatureBorn', (e) => ov.bornRing(e.x, e.y));
    bus.on('creatureStable', (e) => ov.stableDing(e.x, e.y));
    bus.on('creatureDied', (e) => {
      if (this.card?.id === e.id) this.closeCard();
      // Why it went dark (ADR-030 §2.5): a seed that never took fades grey with its cause in words, no
      // particles of any colour (QA 071); a living creature that hit the glass says its light is still there.
      // Every death, not only the first one's card (QA-CLARIDAD-2 C7: living creatures faded in open agar unsaid).
      const alive = ov.stateOf(e.id) === 'stable';
      // ADR-031: a seed that never took is told by the game's refund (bus 'seedRefund', «No prendió · +4 de vuelta»);
      // a game without refunds still says why it faded.
      const label = !alive && this.actions.sow ? null : deathLabel(e.cause, alive);
      if (alive) ov.puff(e.x, e.y);
      // One label at a time on the dish (ARTE §10): while a Momento or VELA speaks, the grey fade alone.
      ov.wentDark(e.x, e.y, this.deps.isNarrating?.() || !label ? '' : tx(label), !alive);
    });
    bus.on('creatureExploded', (e) => {
      // Before the pulse: the overlay still knows it as the creature it was.
      const alive = ov.stateOf(e.id) === 'stable';
      ov.explodedPulse(e.x, e.y);
      // A fusion seen again (ADR-030 §2.5): its 2 s label at the spot; the first one has its card. A living
      // creature that fell apart on its own says so too (QA-CLARIDAD-2 C7).
      const label = shapelessLabel(e.cause ?? null, alive, this.deps.mergeTold?.() ?? false);
      if (label && !this.deps.isNarrating?.()) ov.wentDark(e.x, e.y, tx(label), false);
    });
    // Shapeless matter dissolved (lysis, clean-up): it fades like a puff; it was never a creature that died.
    bus.on('creatureDissolved', (e) => {
      // Shapeless matter vanished (lysis, the clean-up, or it fell apart alone): a puff. VELA's lysis says so in its
      // own words through lysed() (main.ts knows when it was hers).
      ov.puff(e.x, e.y);
      if (this.card?.id === e.id) this.closeCard();
    });
    // ── ADR-031 (docs/MECANICAS.md §3, §4): the pulse, the glimmers, and losses that give something back ──
    bus.on('pulse', (e) => {
      // The game's answer (PB's overlay): «+N» / ¡Chispazo! on the dish, a mote to the counter, a buzz on a Chispazo.
      const p = ov.pulsed(e);
      if (p && e.amount > 0) {
        const d = this.dish.getBoundingClientRect();
        this.fly.launch(d.left + p.x, d.top + p.y, 'essence', hueHex(p.hue, 70), e.chispazo ? 3 : 1, performance.now());
      }
      if (!e.chispazo) return;
      this.vibrate([10, 30, 14]);
      // The first ¡Chispazo! ever says what it is, for 2 s beside it («Cada 10 toques seguidos, ¡un Chispazo!»).
      if (!this.prefs.hints.includes('chispazo')) {
        this.prefs.hints.push('chispazo');
        this.savePrefs();
        ov.wentDark(e.x, e.y, tx(TEXT.chispazoHint(this.v?.streak?.every ?? 10)), false);
      } else if ((this.v?.session?.n ?? 1) >= MOTES_FROM_SESSION && !this.prefs.hints.includes('motes')) {
        // The first glimmers (session 2 on): «¡Atrápalas!» beside them.
        this.prefs.hints.push('motes');
        this.savePrefs();
        const p = ov.screenOf(e.x, e.y);
        ov.ripeLabel(p.x, p.y, tx(TEXT.motesCatch));
      }
    });
    bus.on('moteCaught', (e) => ov.moteCaught(e));
    // A living creature died and its light joined its drop: the drop flares with its «+N» (its cause: deathLabel).
    bus.on('deathBurst', (e) => ov.deathBurst(e));
    bus.on('seedRefund', (e) => {
      // «No prendió · +4 de vuelta» where it was, and the coin goes back to the counter (a free seed, to the button).
      if (!this.deps.isNarrating?.()) ov.wentDark(e.x, e.y, tx(refundLabel(e)), false);
      if (e.amount > 0) {
        const p = ov.screenOf(e.x, e.y);
        const d = this.dish.getBoundingClientRect();
        this.fly.launch(d.left + p.x, d.top + p.y, 'essence', hueHex(ov.drops.hueOf(-1), 70), 1, performance.now());
      } else retriggerClass(this.sowBtn.el, 'refund');
    });
    bus.on('contactSaved', (e) => {
      const p = ov.creaturePos(e.a) ?? ov.creaturePos(e.b);
      if (p) ov.wentDark(p.x, p.y, tx(TEXT.saved(SAVE_STREAK_HITS)), false);
      this.sound('confirm');
    });
    bus.on('accidentLearned', (e) => {
      // The first death of its kind teaches, for Datos (a chip without a pause; the fusion has its own card).
      if (e.datos > 0) this.toasts.push(tx(learnedLabel(e.cause, e.datos)), 'good', 'book');
    });
    bus.on('sessionStart', () => {
      this.sowPresses = 0;
      this.snapTold = false;
    });
    bus.on('creatureDivided', (e) => ov.dividedPulse(e.x, e.y));
    bus.on('income', (e) => {
      // With collection, the drop shows what a creature makes and the "+N" comes when it is collected
      // (docs/CLARIDAD2.md §2.14): no periodic numbers on top.
      if (this.overlay.tapScene().collecting) return;
      const gold = !!this.v?.buffs.some((b) => b.mult > 1);
      ov.income(e.id, e.x, e.y, e.amount, (n) => fmtRate(n, this.lang), gold);
    });
    bus.on('speciesNew', (e) => {
      ov.speciesBurst(e.x, e.y, t('newSpecies'), e.name);
      this.vibrate([20, 40, 20]);
      if (this.deps.speciesTold?.()) return;
      // Several in a row merge into one counter toast instead of a stream (QA2 H-06/H-09).
      this.toasts.pushGroup(
        'species',
        (n) => (n === 1 ? `${t('newSpecies')} ${e.name}` : t('newSpeciesN', { n: String(n) })),
        'good',
        'sparkle',
        () => this.openBestiary(true),
      );
    });
    // One thing per event: the label on the creature (and the Momento card); no toast (CLARIDAD J-58, §3.3).
    bus.on('behaviorNew', (e) => ov.behaviorLabel(e.x, e.y, e.behavior, t('newBehavior'), behaviorName(e.behavior)));
    // A short, readable toast; the full note lives in the Journal (QA2 H-10).
    bus.on('journalNew', () => this.toasts.pushGroup('journal', (n) => (n === 1 ? t('journalNote') : t('journalNotes', { n: String(n) })), 'info', 'journal', () => this.openJournal('journal')));
    bus.on('achievement', (e) =>
      this.toasts.push(`${t('achievement')}: ${tx(e.name)}`, 'gold', 'trophy', () => {
        if (!this.modals.find('achievement')) openAchievementCard(this.modals, this.ctx, e.id, () => this.openJournal('ach'));
      }),
    );
    // The overflow banner explains it already: drop the game's long duplicate toast (QA2 H-06).
    bus.on('dishOvergrown', (e) => {
      if (e.on) this.dropOvergrownToast = true;
    });
    bus.on('goldenSpawn', (e) => ov.goldenSpawned(e.x, e.y));
    bus.on('goldenCollected', (e) => {
      ov.goldenCollected(e.x, e.y, tx(e.reward));
      this.toasts.push(tx(e.reward), 'gold', 'sparkle');
    });
    bus.on('toast', (e) => {
      if (this.dropOvergrownToast && (e.kind === 'warn' || e.kind === 'bad')) {
        this.dropOvergrownToast = false;
        return;
      }
      if (this.deps.suppressToast?.(e.text, e.kind)) return;
      this.toasts.push(tx(e.text), e.kind as ToastKind);
    });
    bus.on('offlineReturn', (e) => this.showOfflineCard(e.seconds, e.essence));
  }

  // ───────────────────────────── input plumbing ─────────────────────────────

  private bindKeys(): void {
    window.addEventListener('keydown', (e) => {
      if (this.splash?.visible) {
        this.splash.dismiss();
        e.preventDefault();
        return;
      }
      const tgt = e.target as HTMLElement | null;
      const typing = !!tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable);
      if (e.key === 'Escape') {
        if (typing) {
          tgt!.blur();
          return;
        }
        if (this.modals.closeTop()) return;
        if (this.bestiaryOpen) return this.openBestiary(false);
        if (this.mode !== 'seed') return this.exitMode();
        if (this.card) return this.closeCard();
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (this.modals.open) return;
      const v = this.v;
      if (!v) return;
      if (e.key === 'b' || e.key === 'B' || e.key === '1') {
        this.openBestiary(!this.bestiaryOpen);
        e.preventDefault();
      } else if (e.key === ' ' || e.code === 'Space') {
        // Keyboard-focused buttons keep their native Space activation; after a
        // mouse click (no focus ring) Space always means pause.
        const btn = tgt && (tgt.tagName === 'BUTTON' || tgt.getAttribute('role') === 'button');
        if (btn && tgt!.matches(':focus-visible')) return;
        if (btn) tgt!.blur();
        e.preventDefault();
        this.deps.onPauseToggle();
      } else if (e.key === 'e' || e.key === 'E') this.toggleErase();
      else if (e.key === 'j' || e.key === 'J') this.openJournal('journal');
      else if (e.key === 'm' || e.key === 'M') this.actions.setSetting('muted', !v.settings.muted);
      else if (e.key === '+' || e.key === '=') this.camera.zoomAt(1.25, this.camera.viewW / 2, this.camera.viewH / 2);
      else if (e.key === '-' || e.key === '_') this.camera.zoomAt(0.8, this.camera.viewW / 2, this.camera.viewH / 2);
      else if (e.key === '0') this.camera.zoomAt(1 / this.camera.zoom, this.camera.viewW / 2, this.camera.viewH / 2);
    });
  }

  private bindResize(): void {
    let dprMq: MediaQueryList | null = null;
    const applyDish = () => {
      const r = this.dish.getBoundingClientRect();
      const w = r.width;
      // QA-4 N14: on a wide screen the canvases end above the Sembrar band (CSS --bl-sow-band), so the round dish
      // fits above the button instead of running under it. Same top-left as the dish: its coordinates hold.
      const hgt = Math.min(r.height, this.deps.glCanvas.getBoundingClientRect().height || r.height);
      if (w < 1 || hgt < 1) return;
      const dpr = window.devicePixelRatio || 1;
      this.camera.setView(w, hgt);
      this.overlay.resize(w, hgt, dpr);
      this.deps.onDishResize(w, hgt, dpr);
      if (this.card) {
        this.card.w = this.card.el.offsetWidth;
        this.card.h = this.card.el.offsetHeight;
      }
    };
    const watchDpr = () => {
      dprMq?.removeEventListener('change', onDpr);
      dprMq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      dprMq.addEventListener('change', onDpr);
    };
    const onDpr = () => {
      applyDish();
      watchDpr();
    };
    watchDpr();
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => applyDish()).observe(this.dish);
      new ResizeObserver(() => applyDish()).observe(this.deps.glCanvas);
      new ResizeObserver((entries) => {
        const r = entries[0].contentRect;
        const wide = r.width >= 900 || (r.width >= 640 && r.width > r.height * 1.2);
        if (wide !== this.wide) {
          this.wide = wide;
          toggle(this.el, 'is-wide', wide);
        }
      }).observe(this.el);
    } else {
      window.addEventListener('resize', applyDish);
    }
    requestAnimationFrame(applyDish);
  }

  private bindGesture(): void {
    const once = () => {
      if (this.gestured) return;
      this.gestured = true;
      window.removeEventListener('pointerdown', once, true);
      window.removeEventListener('keydown', once, true);
      this.deps.onUserGesture();
    };
    window.addEventListener('pointerdown', once, true);
    window.addEventListener('keydown', once, true);
  }

  // ───────────────────────────── theme ─────────────────────────────

  private themePref(): ThemePref {
    const fromGame = this.v?.settings.theme;
    if (fromGame === 'auto' || fromGame === 'dark' || fromGame === 'light') return this.themeLocal ?? fromGame;
    if (this.themeLocal) return this.themeLocal;
    try {
      const s = localStorage.getItem(THEME_KEY);
      if (s === 'auto' || s === 'dark' || s === 'light') return s;
    } catch {
      /* storage blocked */
    }
    return 'auto';
  }

  private setTheme(p: ThemePref): void {
    this.themeLocal = p;
    this.actions.setSetting('theme', p);
    try {
      localStorage.setItem(THEME_KEY, p);
    } catch {
      /* storage blocked */
    }
    this.applyTheme();
  }

  private bindTheme(): void {
    try {
      this.themeMq = window.matchMedia('(prefers-color-scheme: light)');
      this.themeMq.addEventListener('change', () => this.applyTheme());
    } catch {
      this.themeMq = null;
    }
    this.applyTheme();
  }

  /** Resolve auto/dark/light and paint it on the root, <html> and theme-color. */
  private applyTheme(): void {
    const pref = this.themePref();
    // Once the game reflects the player's pick, stop overriding it.
    if (this.themeLocal && this.v?.settings.theme === this.themeLocal) this.themeLocal = null;
    const resolved = pref === 'auto' ? (this.themeMq?.matches ? 'light' : 'dark') : pref;
    if (resolved === this.themeApplied) return;
    this.themeApplied = resolved;
    this.el.dataset.theme = resolved;
    document.documentElement.dataset.theme = resolved;
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = resolved === 'light' ? '#FFFFFF' : '#0B0E12';
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private sound(kind: UISound): void {
    try {
      this.deps.onUISound?.(kind);
    } catch (err) {
      console.error('[ui] onUISound failed', err);
    }
  }

  private vibrate(p: number | number[]): void {
    vibrate(this.v?.settings.vibration ?? true, p);
  }

  /** Large text: the whole UI is in rem, so the root size scales it (+12.5 %). */
  private applyTextSize(): void {
    try {
      document.documentElement.style.fontSize = this.prefs.textSize === 'large' ? '112.5%' : '';
    } catch {
      /* non-DOM test env */
    }
  }

  private savePrefs(): void {
    saveJSON(PREFS_KEY, this.prefs);
  }

  /** Little particle burst from a DOM element (buy buttons, etc.). */
  private fxBurst(el: Element, color: string, text?: string): void {
    const base = this.el.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2 - base.left;
    const y = r.top + r.height / 2 - base.top;
    const rm = !!this.v?.settings.reduceMotion;
    if (!rm) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
        const d = 26 + Math.random() * 30;
        const p = h('span', { class: 'fx-p' });
        p.style.left = `${x}px`;
        p.style.top = `${y}px`;
        p.style.setProperty('--dx', `${Math.cos(a) * d}px`);
        p.style.setProperty('--dy', `${Math.sin(a) * d}px`);
        p.style.setProperty('--c', color);
        this.fx.appendChild(p);
        setTimeout(() => p.remove(), 650);
      }
    }
    if (text) {
      const tEl = h('span', { class: 'fx-t' }, text);
      tEl.style.left = `${x}px`;
      tEl.style.top = `${r.top - base.top}px`;
      tEl.style.setProperty('--c', color);
      this.fx.appendChild(tEl);
      setTimeout(() => tEl.remove(), 950);
    }
  }
}
