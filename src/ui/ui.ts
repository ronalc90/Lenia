/**
 * Bioluma UI root: HUD (Essence, the session clock slot, Bitácora, Ajustes), the Encargo bar, the dish
 * (GL canvas + overlay + floating controls), the dock (Bestiario, Abono or Árbol, the Datos preview
 * slot), the Bestiary drawer, modals, toasts and all the juice. Vanilla TS; the game drives it through
 * `update(view)` (~10×/s) and `frame(t, dt)` (every animation frame). The session screens (start card,
 * summary, tree) are mounted by src/ui/session/flow.ts over this root.
 */
import './ui.css';
import { bus } from '../core/bus';
import { mod, wrapDelta, type Camera } from '../core/camera';
import { BEHAVIOR_COLOR } from '../core/palette';
import type { Behavior, BuyQty, GameActions, GameView, Lang, Text } from '../core/types';
import { TABS, type Ctx, type Panel, type TabId, type TextSize, type ThemePref, type ToastKind } from './ctx';
import { h, ic, loadJSON, reconcile, saveJSON, setAttr, setHTML, setStyle, setText, show, toggle, vibrate } from './dom';
import { fmt, fmtClock, fmtDuration, fmtRate, fmtShort } from './format';
import { behaviorName, getLang, setLang, stateName, t, tx } from './i18n';
import { icon, logo } from './icons';
import { DishInput } from './input';
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

export interface UIDeps {
  actions: GameActions;
  camera: Camera;
  /** The WebGL canvas (created by integrator) — mounted inside the dish area. */
  glCanvas: HTMLCanvasElement;
  /** Called when the dish area resizes (CSS px) so the integrator resizes GL + camera. */
  onDishResize(cssW: number, cssH: number, dpr: number): void;
  /** Player tapped the dish at a grid point (already filtered: not a creature tap, not golden, not a UI control). */
  onDishTap(x: number, y: number, opts: { big: boolean }): void;
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
}

export type UISound = 'tap' | 'tab' | 'open' | 'close' | 'buy' | 'deny' | 'toggle' | 'hold' | 'confirm';

export interface UI {
  /** Push the latest game view (call ~10×/s). */
  update(view: GameView): void;
  /** Per animation frame, for the overlay canvas (halos, ripples, floating numbers, golden spark). */
  frame(timeSec: number, dtSec: number): void;
  setPaused(p: boolean): void;
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
/** Simulation steps per second at ×1 (main.ts STEPS_PER_SEC): creature age is shown in seconds. */
const AGE_STEPS_PER_SEC = 30;

/**
 * Bring an element into view by scrolling ONLY its nearest vertically scrollable ancestor (a panel, a
 * sheet). `scrollIntoView` would also scroll overflow:hidden ancestors sideways and shift the whole
 * layout by a few pixels (measured on desktop: HUD, dish and tabs moved 6 px).
 */
export function scrollIntoViewY(el: HTMLElement, margin = 8): void {
  let sc: HTMLElement | null = el.parentElement;
  while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
  if (!sc) return;
  const r = el.getBoundingClientRect();
  const b = sc.getBoundingClientRect();
  if (r.top < b.top + margin) sc.scrollTop += r.top - b.top - margin;
  else if (r.bottom > b.bottom - margin) sc.scrollTop += Math.min(r.bottom - b.bottom + margin, r.top - b.top - margin);
}

/** A multiplier with two decimals at most, in the player's language: ×1,25 / ×1.56. */
function multText(x: number, lang: Lang): string {
  const v = Math.round(x * 100) / 100;
  return String(v).replace('.', lang === 'es' ? ',' : '.');
}

/** Restart a one-shot CSS animation class. */
function retriggerClass(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

class BiolumaUI implements UI {
  private el: HTMLDivElement;
  private camera: Camera;
  private actions: GameActions;
  // HUD
  private essVal!: HTMLElement;
  private essRate!: HTMLElement;
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
  private dropOvergrownToast = false;
  /** Last seed cost shown, to animate changes (green ↓ cheaper, amber ↑ pricier). */
  private lastSeedCost = -1;
  /** Slot reserved next to the seed cost for the price meter (src/ui/moments wires it). */
  readonly seedMeterSlot = h('span', { class: 'mp-meter' });
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

  constructor(
    private root: HTMLElement,
    private deps: UIDeps,
  ) {
    this.camera = deps.camera;
    this.actions = deps.actions;
    this.prefs = sanitizePrefs(loadJSON<unknown>(PREFS_KEY, {}));
    this.el = h('div', { class: 'bl' });
    this.overlay = new Overlay(this.camera);
    this.modals = new ModalHost(this.modalLayer, (k) => this.sound(k));
    this.ctx = this.makeCtx();
    this.applyTextSize();
    this.build();
    this.root.appendChild(this.el);
    this.toasts.setHold(() => !!this.deps.isNarrating?.() || !!this.splash?.visible);
    this.bindBus();
    this.bindKeys();
    this.bindResize();
    this.bindGesture();
    this.bindTheme();
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
    this.essRate = h('span', { class: 'ess-rate mono zero' }, '+0/s');
    const essBtn = h(
      'button',
      { type: 'button', class: 'hud-ess' },
      ic('essence', 24, 'ess-ic'),
      h('span', { class: 'ess-col' }, this.essVal, this.essRate),
    );
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
    );

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
    this.fabClean = h('button', { type: 'button', class: 'fab fab-clean round', html: icon('broom'), 'data-testid': 'clean-dish' });
    this.fabClean.addEventListener('click', () => this.onCleanTap());
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
    this.buffsEl = h('div', { class: 'buffs' });
    this.dishUI = h(
      'div',
      { class: 'bl-dish-ui' },
      this.toasts.el,
      this.fabPause,
      this.fabSpeed,
      this.fabErase,
      this.fabClean,
      this.buffsEl,
      this.modePill,
      this.overgrownEl,
    );
    // The objective floats over the top of the dish: it never pushes the dish or the panel.
    this.dish.append(gl, this.overlay.canvas, this.dishUI, this.objEl);
    this.renderPause();

    // Dock: Bestiary always; Abono while a session runs, the Tree between sessions; the Datos preview.
    this.bestiaryDot = h('span', { class: 'dot pulse', hidden: true });
    this.bestiaryLabel = h('span', { class: 'dock-l' });
    this.bestiaryBtn = h('button', { type: 'button', class: 'dock-btn dock-bestiary', 'data-tab': 'bestiary' }, ic('bestiary', 26), this.bestiaryLabel, this.bestiaryDot);
    this.bestiaryBtn.addEventListener('click', () => {
      this.sound(this.bestiaryOpen ? 'close' : 'open');
      this.openBestiary(!this.bestiaryOpen);
    });
    this.treeLabel = h('span', { class: 'dock-l' });
    this.treeBtn = h('button', { type: 'button', class: 'dock-btn dock-main dock-tree', hidden: true }, ic('tree', 26), this.treeLabel);
    this.treeBtn.addEventListener('click', () => {
      this.sound('open');
      this.deps.onOpenTree?.();
    });
    this.boostBtn = h('button', { type: 'button', class: 'dock-btn dock-main dock-boost', hidden: true });
    this.boostBtn.addEventListener('click', () => this.onBoostTap());
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
    });
    this.relabelStatic();
  }

  /** Static labels that depend on the language. */
  private relabelStatic(): void {
    setAttr(this.journalBtn, 'aria-label', t('journal'));
    setAttr(this.journalBtn, 'title', t('journal'));
    setAttr(this.lbBtn, 'aria-label', t('ranking'));
    setAttr(this.lbBtn, 'title', t('ranking'));
    setAttr(this.settingsBtn, 'aria-label', t('settings'));
    setAttr(this.settingsBtn, 'title', t('settings'));
    setAttr(this.fabSpeed, 'aria-label', t('speed'));
    setAttr(this.fabErase, 'aria-label', t('eraser'));
    setAttr(this.fabErase, 'title', t('eraser'));
    setAttr(this.fabClean, 'aria-label', t('cleanDish'));
    setAttr(this.fabClean, 'title', t('cleanDish'));
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
    this.applyTheme();
    const bestiary = this.ensureBestiary();

    this.updateHUD(view);
    this.updateObjective(view);
    this.publishTopInset();
    this.updateDock(view);
    this.updateDishUI(view);
    this.overlay.setView(view);
    this.updateCard(view);
    if (this.bestiaryOpen) bestiary.update(view);
    for (const kind of ['settings', 'journal', 'species']) this.modals.find(kind)?.update?.(view);
  }

  frame(timeSec: number, dtSec: number): void {
    this.lastFrameAt = performance.now();
    // Follow a creature with the camera (not while a Momento owns the camera).
    if (this.follow !== null && !this.deps.cameraBusy?.()) {
      const p = this.overlay.creaturePos(this.follow);
      if (p) {
        const k = 1 - Math.exp(-Math.min(dtSec, 0.1) * 4);
        const cam = this.camera;
        cam.cx = mod(cam.cx + wrapDelta(p.x - cam.cx, cam.gridW) * k, cam.gridW);
        cam.cy = mod(cam.cy + wrapDelta(p.y - cam.cy, cam.gridH) * k, cam.gridH);
      }
    }
    this.overlay.draw(timeSec, dtSec);
    this.tweenEssence(dtSec);
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
    if (id === 'seed') return q('.mode-pill');
    if (id === 'objective') return q('.bl-objective');
    if (id.startsWith('tab.')) return q(`.bl-dock [data-tab="${id.slice(4)}"]`);
    if (id.startsWith('upgrade.')) return q(`[data-up="${id.slice(8)}"] .buy`);
    if (id === 'creature') {
      const c = this.v?.creatures.find((cr) => cr.state === 'stable');
      return (c && around(this.overlay.creatureScreen(c.id), 70)) || q('.bl-dish');
    }
    if (id === 'golden') return around(this.overlay.goldenScreen(), 60) || q('.bl-dish');
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
    if (id === 'tab.bestiary') this.openBestiary(true);
  }

  get drawerOpen(): boolean {
    return this.bestiaryOpen;
  }

  openBestiary(open = true): void {
    if (open === this.bestiaryOpen) return;
    const v = this.v;
    if (open && !v) return;
    this.bestiaryOpen = open;
    const p = this.ensureBestiary();
    show(this.drawer, open);
    show(this.drawerScrim, open);
    toggle(this.bestiaryBtn, 'active', open);
    setAttr(this.bestiaryBtn, 'aria-expanded', open ? 'true' : 'false');
    toggle(this.el, 'drawer-open', open);
    if (open && v) {
      retriggerClass(this.drawer, 'enter');
      p.update(v);
      p.onShow?.();
      this.deps.onTabOpen?.('bestiary');
    }
  }

  restartTutorial(): void {
    this.modals.closeAll();
    this.deps.onRestartTutorial?.();
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
    if (this.dispEssence < 0 || performance.now() - this.lastFrameAt > 500) {
      this.dispEssence = v.essence;
      setText(this.essVal, fmt(v.essence, lang));
    }
    const buffMult = v.buffs.reduce((m, b) => (b.mult > 1 ? m * b.mult : m), 1);
    const rateHTML =
      `+${fmtRate(v.essencePerSec, lang)}${t('perSec')}` + (buffMult > 1 ? `<span class="buffx">×${fmtShort(buffMult, lang)}</span>` : '');
    setHTML(this.essRate, rateHTML);
    toggle(this.essRate, 'zero', v.essencePerSec <= 0);
    setAttr(this.essVal.parentElement!.parentElement!, 'aria-label', t('essAria', { n: fmt(v.essence, lang), r: fmtRate(v.essencePerSec, lang) }));
    // Multiplier breakdown (QA3 F13), when the game exposes it: tooltip on the essence counter.
    const mu = v.multipliers;
    setAttr(
      this.essVal.parentElement!.parentElement!,
      'title',
      mu ? `${t('multGlobal')} ×${fmtShort(mu.global, lang)} · ${t('multBuffs')} ×${fmtShort(mu.buffs, lang)}` : null,
    );

    show(this.journalDot, v.journal.some((e) => !e.read));
    setHTML(this.muteBtn, icon(v.settings.muted ? 'mute' : 'sound'));
    toggle(this.muteBtn, 'on', !v.settings.muted);
    setAttr(this.muteBtn, 'aria-label', v.settings.muted ? t('unmute') : t('mute'));
    setAttr(this.muteBtn, 'title', v.settings.muted ? t('unmute') : t('mute'));
  }

  private bump(el: HTMLElement): void {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  private tweenEssence(dt: number): void {
    const v = this.v;
    if (!v) return;
    const target = v.essence;
    if (this.dispEssence < 0 || target < this.dispEssence) this.dispEssence = target;
    else {
      // A sudden windfall (golden harvest, offline, big income) gets a glow pulse.
      const jump = target - this.dispEssence;
      const now = performance.now();
      if (jump > Math.max(25, this.dispEssence * 0.06) && now - this.essGlowAt > 700) {
        this.essGlowAt = now;
        this.bump(this.essVal);
        this.essVal.classList.remove('gain');
        void this.essVal.offsetWidth;
        this.essVal.classList.add('gain');
      }
      const k = 1 - Math.exp(-Math.min(dt, 0.1) * 9);
      this.dispEssence += (target - this.dispEssence) * k;
      if (target - this.dispEssence < Math.max(0.5, target * 0.0005)) this.dispEssence = target;
    }
    setText(this.essVal, fmt(this.dispEssence, this.lang));
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
      if (prog !== undefined) setStyle(this.objFill, 'width', `${(Math.min(1, Math.max(0, prog)) * 100).toFixed(1)}%`);
    }
    if (text === this.objShown && !this.objTimer) return;
    if (this.objTimer) {
      this.objPending = text;
      return;
    }
    if (this.objShown !== null && text !== this.objShown && this.objShown !== '') {
      // Celebrate the completed objective before showing the next one.
      this.objEl.classList.add('done');
      setStyle(this.objFill, 'width', '100%');
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
  }

  private applyObjective(text: string | null): void {
    this.objShown = text;
    show(this.objEl, text !== null);
    toggle(this.el, 'no-objective', text === null);
    if (text !== null) {
      setText(this.objText, text);
      this.objEl.classList.remove('enter');
      void this.objEl.offsetWidth;
      this.objEl.classList.add('enter');
    }
  }

  // ───────────────────────────── dock ─────────────────────────────

  /**
   * The dock under the dish: Bestiario always (a dot for a species not looked at yet); Abono while a
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
      this.showDockTip(this.boostBtn, `${tx(SESSION_UI.boostDesc)} ${tx(SESSION_UI.boostPrice)}`);
    }
    const bk = `${b.cost}|${b.count}|${b.affordable}|${wait}|${b.needsLife}|${lang}`;
    if (bk === this.boostKey) return;
    this.boostKey = bk;
    const mult = `×${multText(b.nextMult, lang)}`;
    this.boostBtn.className = `dock-btn dock-main dock-boost${b.affordable ? ' can' : ''}${wait > 0 || b.needsLife ? ' wait' : ''}`;
    this.boostBtn.textContent = '';
    // "Abono" over "×1,25 · 💧 15" (what it does · its price), "×1,25 · en 0:12" while it is not on sale
    // yet, or "Falta vida" with nothing alive. Two short lines: it fits a phone dock next to the preview.
    const bx = h('span', { class: 'bx' }, mult);
    this.boostBtn.append(
      ic('nutrient', 26),
      h(
        'span',
        { class: 'dock-tx' },
        h('b', null, tx(TEXT.boost)),
        b.needsLife && wait === 0
          ? h('small', null, tx(SESSION_UI.boostNeedsLife))
          : wait > 0
            ? h('small', null, bx, ` · ${tx(SESSION_UI.boostWait(fmtClock(wait)))}`)
            : h('small', { class: b.affordable ? '' : 'short' }, bx, ' · ', h('span', { class: 'mono', html: `${icon('essence', 13)}${fmtShort(b.cost, lang)}` })),
      ),
    );
    setAttr(this.boostBtn, 'aria-label', `${tx(TEXT.boost)} ${mult}: ${fmt(b.cost, lang)} ${t('essence')}. ${tx(SESSION_UI.boostDesc)}`);
    setAttr(this.boostBtn, 'title', `${tx(SESSION_UI.boostDesc)} ${tx(SESSION_UI.boostPrice)}`);
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
      this.fxBurst(this.boostBtn, 'var(--good)', `×${multText(b.nextMult, this.lang)}`);
      this.boostKey = '';
      this.dock.querySelector('.dock-tip')?.remove();
      return;
    }
    // Not yet: say why where the finger is (still waiting for the clock, or Essence short).
    this.sound('deny');
    retriggerClass(this.boostBtn, 'shake');
    const wait = Math.ceil(b.wait ?? 0);
    const short = Math.max(1, Math.ceil(b.cost - (this.v?.essence ?? 0)));
    this.toasts.push(
      wait > 0 ? tx(SESSION_UI.boostIn(fmtClock(wait))) : b.needsLife ? tx(SESSION_UI.boostNeedsLifeWhy) : t('deniedShort', { n: fmt(short, this.lang) }),
      'info',
      'nutrient',
    );
    if (wait === 0) this.showDockTip(this.boostBtn, `${tx(SESSION_UI.boostDesc)} ${tx(SESSION_UI.boostPrice)}`);
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

    // Mode pill
    let key: string;
    const printSp = this.mode === 'print' ? v.species.find((s) => s.id === this.printId) : undefined;
    if (printSp) key = `print|${printSp.name}|${lang}`;
    else if (this.mode === 'erase') key = `erase|${lang}`;
    else key = `seed|${v.canSeed}|${fmtShort(v.seedCost, lang)}|${v.seedsGrowing ? 1 : 0}|${lang}`;
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
        const cost = h('span', { class: 'mp-cost mono', html: `${icon('essence', 15)}${fmtShort(v.seedCost, lang)}` });
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
    const waiting = !!v.session && v.session.phase === 'ready' && v.session.n > 1 && !this.deps.isNarrating?.();
    const wantHint = (!this.firstTapDone && v.stats.seeds === 0 && v.creatures.length === 0) || waiting;
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
    if (want && !this.hintEl) {
      this.hintEl = h(
        'div',
        { class: 'dish-hint' },
        h('div', { class: 'tap-rings' }, h('i'), h('i'), h('b')),
        h('div', { class: 'h1' }, t(wantHint ? 'tapDish' : 'tapAgain')),
        wantHint ? h('div', { class: 'h2' }, waiting && this.firstTapDone ? tx(SESSION_UI.startHint) : t('tapDishSub')) : null,
      );
      this.dishUI.appendChild(this.hintEl);
    } else if (!want && this.hintEl) this.hideFirstHint();

    // Gesture hints the first time a gesture becomes available.
    if (!this.hintEl && !this.gestureHint && !this.card && !this.splash?.visible && !this.deps.isNarrating?.()) {
      if (v.tools.longPress && !this.prefs.hints.includes('long')) {
        this.prefs.hints.push('long');
        this.savePrefs();
        this.showGestureHint(v.settings.oneTouch ? t('hintDoubleTap') : t('hintLongPress'), 'hand');
      } else if (v.tools.brush && !v.settings.oneTouch && !this.prefs.hints.includes('brush')) {
        this.prefs.hints.push('brush');
        this.savePrefs();
        this.showGestureHint(t('hintBrush'), 'motion');
      }
    }
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
    // A status pill: its behaviour explains itself (Behaviour Guide); never seed under a pill.
    const pill = this.overlay.statusHit(px, py);
    if (pill) {
      if (pill.behavior && this.deps.onBehaviorInfo) {
        this.sound('open');
        this.deps.onBehaviorInfo(pill.behavior);
      } else if (pill.state === 'stable') this.openCard(pill.id);
      return;
    }
    const hit = this.overlay.creatureAt(px, py);
    if (hit !== null) {
      this.openCard(hit);
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

  private onBigTap(px: number, py: number): void {
    if (!this.v) return;
    if (this.hitGolden(px, py)) return;
    if (!this.camera.isOnDish(px, py)) return;
    const g = this.camera.screenToGrid(px, py);
    this.lastTapAt = performance.now();
    this.hideFirstHint();
    this.closeCard();
    this.lastBigTap = performance.now();
    this.vibrate(18);
    this.deps.onDishTap(g.x, g.y, { big: true });
  }

  // ───────────────────────────── creature card ─────────────────────────────

  private openCard(id: number): void {
    if (this.card?.id === id) return;
    this.closeCard();
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
    const follow = h('button', { type: 'button', class: 'btn block', style: 'min-height:40px' });
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
    setText(c.eps, t('yieldsValue', { v: fmtRate(cr.eps, lang) }));
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
      const big = e.manual && performance.now() - this.lastBigTap < 150;
      ov.ripple(e.x, e.y, e.manual ? (big ? 'big' : 'seed') : 'auto');
      // Moved to the nearest spot with room (spacing rule): show where it went.
      if (e.from) ov.seedMoved(e.from.x, e.from.y, e.x, e.y);
      if (e.manual) this.hideFirstHint();
    });
    bus.on('seedDenied', (e) => {
      // Why, in Esencia the player can count (CLARIDAD J-161).
      const v = this.v;
      const short = v ? Math.max(1, Math.ceil(e.cost - v.essence)) : 0;
      const waiting = !!v?.creatures.some((c) => c.state === 'stable');
      ov.denied(e.x, e.y, fmtShort(e.cost, this.lang), short > 0 ? { text: t('deniedShort', { n: fmt(short, this.lang) }), sub: waiting ? t('deniedWait') : '' } : undefined);
      this.modePill.classList.remove('shake');
      void this.modePill.offsetWidth;
      this.modePill.classList.add('shake');
      this.vibrate([10, 30, 10]);
    });
    // A refused tap always shows why, where it happened; nothing was charged (no toast, no layout shift).
    bus.on('seedBlocked', (e) => {
      // Refused for free, said on the spot: a red ring and why (first sentence big, the rest small).
      const room = this.v?.seedPrice?.capacity ?? this.v?.seedPrice?.freeSlots;
      const msg = e.reason === 'tooClose' ? tx(TEXT.seedTooClose) : e.reason === 'full' && room ? tx(TEXT.dishFull(room)) : '';
      if (msg) {
        const cut = msg.search(/[.!] /);
        ov.seedBlocked(e.x, e.y, cut > 0 ? msg.slice(0, cut + 1) : msg, cut > 0 ? msg.slice(cut + 2) : '');
      }
      // A full dish: every creature's place blinks, so "full" is something you can see (CLARIDAD J-160).
      if (e.reason === 'full' && this.v) {
        let n = 0;
        for (const c of this.v.creatures) if (c.state !== 'dead' && n++ < 16) ov.bornRing(c.x, c.y);
      }
      // 'growing': the pill already says "Espera…"; a shake points at it (the meter's chip says why).
      this.modePill.classList.remove('shake');
      void this.modePill.offsetWidth;
      this.modePill.classList.add('shake');
      this.sound('deny');
      this.vibrate([10, 30, 10]);
    });
    bus.on('creatureBorn', (e) => ov.bornRing(e.x, e.y));
    bus.on('creatureStable', (e) => ov.stableDing(e.x, e.y));
    bus.on('creatureDied', (e) => {
      ov.puff(e.x, e.y);
      if (this.card?.id === e.id) this.closeCard();
    });
    bus.on('creatureExploded', (e) => ov.explodedPulse(e.x, e.y));
    // Shapeless matter dissolved (lysis, clean-up): it fades like a puff; it was never a creature that died.
    bus.on('creatureDissolved', (e) => {
      ov.puff(e.x, e.y);
      if (this.card?.id === e.id) this.closeCard();
    });
    bus.on('creatureDivided', (e) => ov.dividedPulse(e.x, e.y));
    bus.on('income', (e) => {
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
      const hgt = r.height;
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
