/**
 * Bioluma UI root: HUD, objective bar, dish (GL canvas + overlay + floating
 * controls), tab bar + bottom panel (side panel on wide screens), modals,
 * toasts and all the juice. Vanilla TS; the game drives it through
 * `update(view)` (~10×/s) and `frame(t, dt)` (every animation frame).
 */
import './ui.css';
import { bus } from '../core/bus';
import { mod, wrapDelta, type Camera } from '../core/camera';
import { BEHAVIOR_COLOR } from '../core/palette';
import type { BuyQty, GameActions, GameView, Lang } from '../core/types';
import { TABS, type Ctx, type Panel, type TabId, type ThemePref, type ToastKind } from './ctx';
import { h, ic, loadJSON, reconcile, saveJSON, setAttr, setHTML, setStyle, setText, show, toggle, vibrate } from './dom';
import { fmt, fmtClock, fmtRate, fmtShort } from './format';
import { behaviorName, getLang, setLang, stateName, t, tx, type StrKey } from './i18n';
import { icon, logo } from './icons';
import { DishInput } from './input';
import {
  ModalHost,
  openEraSummary,
  openJournal,
  openOffline,
  openSettings,
  openSpecies,
  type EraSummary,
} from './modals';
import { Overlay } from './overlay';
import { BestiaryPanel } from './panel-bestiary';
import { CalibratePanel } from './panel-calibrate';
import { GenomePanel } from './panel-genome';
import { LabPanel } from './panel-lab';
import { openLeaderboard } from './leaderboard';
import type { LeaderboardClient } from './leaderboard-types';
import { createSplash, type Splash } from './splash';
import { Toasts } from './toasts';
import { Tutorial } from './tutorial';

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
  /** After the 1.5 s hold confirm. */
  onExtinguish(): void;
  onPauseToggle(): void;
  exportSave(): string;
  importSave(s: string): boolean;
  resetSave(): void;
  /** First pointerdown/keydown anywhere (audio unlock). */
  onUserGesture(): void;
  onScreenshot?(): void;
  /** Optional: UI-only feedback sounds (game events already reach audio through the bus). */
  onUISound?(kind: UISound): void;
  /**
   * Optional: the extinction ritual reached full white (≈3 s after
   * `extinctionStart`). Best moment to clear the simulation so the player
   * never sees the dish pop empty.
   */
  onRitualWhite?(): void;
  /** Optional online leaderboard; the HUD trophy button is hidden without it. */
  leaderboard?: LeaderboardClient;
  /** Show the title screen on start (default true). Its tap also unlocks audio. */
  splash?: boolean;
  /** Run the first-run interactive tutorial (default true). */
  tutorial?: boolean;
  /** Optional: the title screen was dismissed (game can start music, timers...). */
  onSplashDone?(): void;
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
}

export function createUI(root: HTMLElement, deps: UIDeps): UI {
  return new BiolumaUI(root, deps);
}

// ─────────────────────────────────────────────────────────────────────────────

interface Prefs {
  intros: TabId[]; // dismissed intro lines
  tabsSeen: TabId[]; // tabs already auto-opened once
  hints: string[]; // gesture hints already shown
  collapsed: boolean;
  calKey: string; // calibration unlock state last seen in the Calibrar tab
}

const PREFS_KEY = 'bioluma.ui.v1';
const THEME_KEY = 'bioluma.theme';
const TAB_LABEL: Record<TabId, StrKey> = { lab: 'tabLab', bestiary: 'tabBestiary', calibrate: 'tabCalibrate', genome: 'tabGenome' };
const TAB_ICON: Record<TabId, string> = { lab: 'lab', bestiary: 'bestiary', calibrate: 'calibrate', genome: 'genome' };

class BiolumaUI implements UI {
  private el: HTMLDivElement;
  private camera: Camera;
  private actions: GameActions;
  // HUD
  private essVal!: HTMLElement;
  private essRate!: HTMLElement;
  private curSamples!: HTMLElement;
  private curSamplesVal!: HTMLElement;
  private curGenome!: HTMLElement;
  private curGenomeVal!: HTMLElement;
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
  // Sheet
  private sheet!: HTMLElement;
  private tabsEl!: HTMLElement;
  private panelsEl!: HTMLElement;
  private tabBtns = {} as Record<TabId, { btn: HTMLButtonElement; dot: HTMLElement; label: HTMLElement }>;
  private panels: Partial<Record<TabId, Panel>> = {};
  private modals: ModalHost;
  private modalLayer = h('div', { class: 'bl-modals' });
  private fx!: HTMLElement;

  // State
  private v: GameView | null = null;
  private lang: Lang = getLang();
  private active: TabId | null = null;
  private prefs: Prefs;
  private mode: 'seed' | 'erase' | 'print' = 'seed';
  private printId: string | null = null;
  private paused = false;
  private buyQty: BuyQty = 1;
  private dispEssence = -1;
  private lastFrameAt = 0;
  private firstTapDone = false;
  private lastBigTap = 0;
  private follow: number | null = null;
  private ctx: Ctx;
  private gestured = false;
  private lastOffline = { at: 0, seconds: -1 };
  private prevSamples = -1;
  private prevGenome = -1;
  private eraSeen: { era: number; at: number; exact: boolean } | null = null;
  private eraSummary: EraSummary | null = null;
  private wide = false;
  private splash: Splash | null = null;
  private tutorial: Tutorial | null = null;
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
    this.prefs = { intros: [], tabsSeen: [], hints: [], collapsed: false, calKey: '', ...loadJSON<Partial<Prefs>>(PREFS_KEY, {}) };
    this.el = h('div', { class: 'bl' });
    this.overlay = new Overlay(this.camera);
    this.modals = new ModalHost(this.modalLayer, (k) => this.sound(k));
    this.ctx = this.makeCtx();
    this.build();
    this.root.appendChild(this.el);
    this.bindBus();
    this.bindKeys();
    this.bindResize();
    this.bindGesture();
    this.bindTheme();
    toggle(this.el, 'sheet-collapsed', this.prefs.collapsed);
    if (deps.tutorial !== false) this.tutorial = new Tutorial(this.tutorialHost());
    if (deps.splash !== false) {
      this.splash = createSplash(this.el, {
        reduceMotion: () => !!this.v?.settings.reduceMotion,
        onDone: () => {
          this.deps.onSplashDone?.();
          const off = this.pendingOffline;
          this.pendingOffline = null;
          if (off) setTimeout(() => this.showOfflineCard(off.seconds, off.essence), 450);
        },
      });
    }
  }

  private tutorialHost() {
    const rel = (r: DOMRect) => {
      const b = this.el.getBoundingClientRect();
      return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height, r: 12 };
    };
    return {
      root: this.el,
      view: () => this.v,
      dishRect: () => {
        const cam = this.camera;
        const d = this.dish.getBoundingClientRect();
        const b = this.el.getBoundingClientRect();
        const s = cam.scale;
        const w = Math.min(cam.gridW * s, d.width);
        const hh = Math.min(cam.gridH * s, d.height);
        return { x: d.left - b.left + (d.width - w) / 2, y: d.top - b.top + (d.height - hh) / 2, w, h: hh, r: 18 };
      },
      dishOrigin: () => {
        const d = this.dish.getBoundingClientRect();
        const b = this.el.getBoundingClientRect();
        return { x: d.left - b.left, y: d.top - b.top };
      },
      rectOf: (sel: string) => {
        const el = this.el.querySelector(sel) as HTMLElement | null;
        if (!el || !el.offsetParent) return null;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 ? rel(r) : null;
      },
      creatureScreen: (id: number) => this.overlay.creatureScreen(id),
      goldenScreen: () => this.overlay.goldenScreen(),
      activeTab: () => this.active,
      switchTab: (tab: TabId) => this.switchTab(tab, true),
      blocked: () => !!this.splash?.visible || this.modals.open || this.overlay.ritualActive,
      sound: (k: 'tap' | 'confirm' | 'open') => this.sound(k),
      reduceMotion: () => !!this.v?.settings.reduceMotion,
    };
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
        if (this.v && this.active) this.panels[this.active]?.update(this.v);
      },
      openSpecies: (id) => {
        this.modals.find('species')?.close();
        openSpecies(this.modals, this.ctx, id);
      },
      enterPrintMode: (id) => this.enterPrint(id),
      fxBurst: (el, color, text) => this.fxBurst(el, color, text),
      toast: (text, kind, iconName, onClick) => this.toasts.push(text, kind, iconName, onClick),
      vibrate: (p) => this.vibrate(p),
      sound: (k) => this.sound(k),
      switchTab: (tab) => this.switchTab(tab, true),
      restartTutorial: () => this.restartTutorial(),
      themePref: () => this.themePref(),
      setTheme: (p) => this.setTheme(p),
      introVisible: (tab) => !this.prefs.intros.includes(tab),
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
    essBtn.addEventListener('click', () => this.openJournal('stats'));
    this.curSamplesVal = h('span', { class: 'mono' }, '0');
    this.curGenomeVal = h('span', { class: 'mono' }, '0');
    this.curSamples = h('div', { class: 'cur cur-samples', hidden: true }, ic('samples', 24), this.curSamplesVal);
    this.curGenome = h('div', { class: 'cur cur-genome', hidden: true }, ic('genome', 24), this.curGenomeVal);
    this.journalDot = h('span', { class: 'dot pulse', hidden: true });
    this.journalBtn = h('button', { type: 'button', class: 'hud-btn', html: icon('journal') }, this.journalDot);
    this.journalBtn.addEventListener('click', () => this.openJournal('journal'));
    this.muteBtn = h('button', { type: 'button', class: 'hud-btn', html: icon('sound') });
    this.muteBtn.addEventListener('click', () => {
      if (!this.v) return;
      this.sound('toggle');
      this.actions.setSetting('muted', !this.v.settings.muted);
    });
    this.lbBtn = h('button', { type: 'button', class: 'hud-btn', html: icon('trophy'), hidden: !this.deps.leaderboard });
    this.lbBtn.addEventListener('click', () => this.openLeaderboard());
    this.settingsBtn = h('button', { type: 'button', class: 'hud-btn', html: icon('settings') });
    this.settingsBtn.addEventListener('click', () => this.openSettings());
    const hud = h(
      'header',
      { class: 'bl-hud' },
      essBtn,
      h('div', { class: 'hud-cur' }, this.curSamples, this.curGenome),
      h('div', { class: 'hud-actions' }, this.lbBtn, this.journalBtn, this.muteBtn, this.settingsBtn),
    );

    // Objective
    this.objIcon = ic('target', 24);
    this.objLabel = h('span', { class: 'obj-label' });
    this.objText = h('span', { class: 'obj-text' });
    this.objFill = h('i');
    this.objBar = h('span', { class: 'obj-bar', hidden: true }, this.objFill);
    this.objEl = h('div', { class: 'bl-objective', hidden: true, role: 'status' }, this.objIcon, this.objLabel, this.objText, this.objBar);

    // Dish
    this.dish = h('main', { class: 'bl-dish' });
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
    this.modePill = h('div', { class: 'mode-pill' });
    this.buffsEl = h('div', { class: 'buffs' });
    this.dishUI = h('div', { class: 'bl-dish-ui' }, this.toasts.el, this.fabPause, this.fabSpeed, this.fabErase, this.buffsEl, this.modePill);
    this.dish.append(gl, this.overlay.canvas, this.dishUI);
    this.renderPause();

    // Sheet
    this.tabsEl = h('nav', { class: 'bl-tabs', role: 'tablist' });
    for (const id of TABS) {
      const label = h('span', { class: 'tab-l' });
      const dot = h('span', { class: 'dot', hidden: true });
      const btn = h('button', { type: 'button', class: 'tab', role: 'tab', hidden: true, 'data-tab': id }, ic(TAB_ICON[id], 24), label, dot);
      btn.addEventListener('click', () => this.onTabClick(id));
      this.tabBtns[id] = { btn, dot, label };
      this.tabsEl.appendChild(btn);
    }
    const handle = h('div', { class: 'bl-handle', role: 'button', tabindex: '0' }, h('span'));
    this.bindHandle(handle);
    this.panelsEl = h('div', { class: 'bl-panels' });
    this.sheet = h('section', { class: 'bl-sheet' }, handle, this.tabsEl, this.panelsEl);

    this.fx = h('div', { class: 'bl-fx' });
    this.el.append(hud, this.objEl, this.dish, this.sheet, this.modalLayer, this.fx);
    toggle(this.el, 'no-sheet', true);
    toggle(this.el, 'no-objective', true);

    // Dish input
    new DishInput(this.dish, this.camera, {
      tap: (x, y) => this.onTap(x, y),
      bigTap: (x, y) => this.onBigTap(x, y),
      brush: (x, y) => {
        if (!this.camera.isOnDish(x, y) || this.overlay.ritualActive) return;
        const g = this.camera.screenToGrid(x, y);
        this.hideFirstHint();
        this.deps.onBrush(g.x, g.y);
      },
      erase: (x, y) => {
        if (!this.camera.isOnDish(x, y) || this.overlay.ritualActive) return;
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
      pressStart: (x, y) => this.overlay.chargeStart(x, y),
      pressEnd: () => this.overlay.chargeEnd(),
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
    setAttr(this.curSamples, 'title', t('samples'));
    setAttr(this.curGenome, 'title', t('genome'));
    setText(this.objLabel, t('objective'));
    for (const id of TABS) {
      setText(this.tabBtns[id].label, t(TAB_LABEL[id]));
      setAttr(this.tabBtns[id].btn, 'aria-label', t(TAB_LABEL[id]));
    }
    this.renderPause();
    this.modeKey = '';
  }

  private ensurePanels(): void {
    if (this.panels.lab) return;
    this.panels = {
      lab: new LabPanel(this.ctx),
      bestiary: new BestiaryPanel(this.ctx),
      calibrate: new CalibratePanel(this.ctx),
      genome: new GenomePanel(this.ctx),
    };
    for (const id of TABS) {
      const p = this.panels[id]!;
      p.el.hidden = true;
      p.el.id = `bl-panel-${id}`;
      setAttr(this.tabBtns[id].btn, 'aria-controls', p.el.id);
      this.panelsEl.appendChild(p.el);
    }
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
    this.ensurePanels();

    this.updateHUD(view);
    this.updateObjective(view);
    this.updateTabs(view, first);
    this.updateDishUI(view);
    this.overlay.setView(view);
    this.updateCard(view);
    if (this.active) this.panels[this.active]!.update(view);
    for (const kind of ['settings', 'journal', 'species']) this.modals.find(kind)?.update?.(view);
    this.trackEra(view);
    this.tutorial?.update(view);
  }

  frame(timeSec: number, dtSec: number): void {
    this.lastFrameAt = performance.now();
    // Follow a creature with the camera.
    if (this.follow !== null) {
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
    this.tutorial?.frame(dtSec);
  }

  restartTutorial(): void {
    this.modals.closeAll();
    // An explicit replay works even if the integrator disabled the auto tutorial.
    if (!this.tutorial) this.tutorial = new Tutorial(this.tutorialHost());
    this.tutorial.restart();
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.overlay.paused = p;
    this.renderPause();
  }

  setSimRate(stepsPerSec: number): void {
    this.overlay.simRate = Number.isFinite(stepsPerSec) && stepsPerSec > 0 ? stepsPerSec : 0;
  }

  showOfflineCard(seconds: number, essence: number): void {
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
        reason ? h('code', null, reason) : null,
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
    setAttr(this.essVal.parentElement!.parentElement!, 'aria-label', `${t('essence')}: ${fmt(v.essence, lang)}, +${fmtRate(v.essencePerSec, lang)}/s`);

    show(this.curSamples, v.tabs.bestiary || v.samples > 0);
    show(this.curGenome, v.tabs.genome || v.genome > 0 || v.era > 1);
    setText(this.curSamplesVal, fmt(v.samples, lang));
    setText(this.curGenomeVal, fmt(v.genome, lang));
    if (this.prevSamples >= 0 && v.samples > this.prevSamples) this.bump(this.curSamples);
    if (this.prevGenome >= 0 && v.genome > this.prevGenome) this.bump(this.curGenome);
    this.prevSamples = v.samples;
    this.prevGenome = v.genome;

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

  // ───────────────────────────── tabs & sheet ─────────────────────────────

  private updateTabs(v: GameView, first: boolean): void {
    const visible = TABS.filter((id) => v.tabs[id]);
    toggle(this.el, 'no-sheet', visible.length === 0);
    const calKey = this.calKey(v);
    // Fresh profile: the current calibration unlocks count as already seen.
    if (first && !this.prefs.calKey) this.prefs.calKey = calKey;
    for (const id of TABS) {
      const vis = v.tabs[id];
      const b = this.tabBtns[id];
      show(b.btn, vis);
      let dot = false;
      if (id === 'lab') dot = v.upgrades.some((u) => u.tab === 'lab' && u.unlocked && !u.maxed && u.affordable);
      else if (id === 'bestiary')
        dot = v.species.some((s) => s.isNew) || v.upgrades.some((u) => u.tab === 'bestiary' && u.unlocked && !u.maxed && u.affordable);
      else if (id === 'calibrate') dot = this.active !== 'calibrate' && calKey !== this.prefs.calKey;
      else dot = v.genomeNodes.some((n) => n.available && !n.owned && n.affordable) || v.extinction.available;
      show(b.dot, vis && dot);
      // Glowing, pinging dot = "something to do here" (never on the open tab).
      toggle(b.dot, 'pulse', vis && dot && id !== this.active);
    }
    if (this.active === 'calibrate' && calKey !== this.prefs.calKey) {
      this.prefs.calKey = calKey;
      this.savePrefs();
    }

    // First time a tab appears it opens itself (doc §13).
    let autoOpen: TabId | null = null;
    for (const id of visible) {
      if (!this.prefs.tabsSeen.includes(id)) {
        this.prefs.tabsSeen.push(id);
        if (!first || visible.length === 1) autoOpen = id;
        if (!first) {
          this.tabBtns[id].btn.classList.add('enter');
        }
        this.savePrefs();
      }
    }
    if (autoOpen && !this.overlay.ritualActive) {
      this.switchTab(autoOpen, true);
      return;
    }
    if (!this.active || !v.tabs[this.active]) {
      if (visible.length) this.switchTab(visible[0], false);
      else this.active = null;
    }
  }

  private calKey(v: GameView): string {
    const c = v.calibration;
    return [c.muRange, c.sigmaRange, c.RRange, c.dtRange].map((r) => (r ? `${r[0]}-${r[1]}` : 'x')).join('|') + `|${c.maxRegimes}`;
  }

  private onTabClick(id: TabId): void {
    // Tapping a tab always shows its panel; collapsing is the handle's job.
    if (id !== this.active) this.sound('tab');
    this.switchTab(id, true);
  }

  private switchTab(id: TabId, expand: boolean): void {
    const v = this.v;
    if (!v || !v.tabs[id]) return;
    if (expand) this.setCollapsed(false);
    if (this.active === id) return;
    const from = this.active ? TABS.indexOf(this.active) : -1;
    this.active = id;
    for (const tid of TABS) {
      const on = tid === id;
      toggle(this.tabBtns[tid].btn, 'active', on);
      setAttr(this.tabBtns[tid].btn, 'aria-selected', on ? 'true' : 'false');
      const p = this.panels[tid];
      if (p) p.el.hidden = !on;
    }
    const p = this.panels[id]!;
    if (from >= 0) {
      p.el.classList.remove('slide-l', 'slide-r');
      void p.el.offsetWidth;
      p.el.classList.add(TABS.indexOf(id) > from ? 'slide-r' : 'slide-l');
    }
    p.update(v);
    p.onShow?.();
    if (id === 'calibrate') {
      this.prefs.calKey = this.calKey(v);
      this.savePrefs();
      show(this.tabBtns.calibrate.dot, false);
    }
  }

  private setCollapsed(c: boolean): void {
    if (this.prefs.collapsed === c && this.el.classList.contains('sheet-collapsed') === c) return;
    this.prefs.collapsed = c;
    toggle(this.el, 'sheet-collapsed', c);
    this.savePrefs();
  }

  private bindHandle(handle: HTMLElement): void {
    let y0 = 0;
    let down = false;
    handle.addEventListener('pointerdown', (e) => {
      down = true;
      y0 = e.clientY;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointerup', (e) => {
      if (!down) return;
      down = false;
      const dy = e.clientY - y0;
      const collapsed = this.el.classList.contains('sheet-collapsed');
      if (Math.abs(dy) < 8) this.setCollapsed(!collapsed);
      else this.setCollapsed(dy > 0);
    });
    handle.addEventListener('pointercancel', () => (down = false));
    handle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.setCollapsed(!this.el.classList.contains('sheet-collapsed'));
      }
    });
  }

  // ───────────────────────────── dish UI ─────────────────────────────

  private renderPause(): void {
    const p = this.paused;
    this.fabPause.textContent = '';
    this.fabPause.appendChild(ic(p ? 'play' : 'pause', 24));
    if (p) this.fabPause.appendChild(h('span', { class: 'fab-label' }, t('paused')));
    toggle(this.fabPause, 'round', !p);
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
    if (this.mode === 'print' && !v.species.some((s) => s.id === this.printId)) this.mode = 'seed';

    // Mode pill
    let key: string;
    const printSp = this.mode === 'print' ? v.species.find((s) => s.id === this.printId) : undefined;
    if (printSp) key = `print|${printSp.catalogName ?? printSp.name}|${lang}`;
    else if (this.mode === 'erase') key = `erase|${lang}`;
    else if (v.pipette.active) key = `pip|${Math.floor(v.pipette.progress * 100)}|${lang}`;
    else key = `seed|${v.canSeed}|${fmtShort(v.seedCost, lang)}|${lang}`;
    if (key !== this.modeKey) {
      this.modeKey = key;
      const pill = this.modePill;
      pill.textContent = '';
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
          h('span', { class: 'mp-text' }, pre, h(printSp.catalogName ? 'em' : 'span', null, printSp.catalogName ?? printSp.name), post ?? ''),
          xBtn(),
        );
      } else if (this.mode === 'erase') {
        pill.className = 'mode-pill erase interactive';
        pill.append(ic('eraser', 24), h('span', { class: 'mp-text' }, t('eraserMode')), xBtn());
      } else if (v.pipette.active) {
        pill.className = 'mode-pill pipette';
        const ring = h('span', { class: 'ring' });
        ring.style.setProperty('--p', v.pipette.progress.toFixed(3));
        pill.append(ring, h('span', { class: 'mp-text' }, t('pipette')), h('span', { class: 'mono mp-dim' }, `${Math.floor(v.pipette.progress * 100)}%`));
      } else {
        pill.className = 'mode-pill' + (v.canSeed ? '' : ' poor');
        pill.setAttribute('aria-label', `${t('seed')}: ${fmtShort(v.seedCost, lang)}`);
        pill.append(
          ic('seed', 24),
          h('span', { class: 'mp-cost mono', html: `${icon('essence', 15)}${fmtShort(v.seedCost, lang)}` }),
        );
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

    // First-run hint: "Toca la placa" until the first tap.
    const wantHint =
      !this.firstTapDone &&
      v.stats.seeds === 0 &&
      v.creatures.length === 0 &&
      !this.overlay.ritualActive &&
      !this.tutorial?.wantsDishTap;
    if (wantHint && !this.hintEl) {
      this.hintEl = h(
        'div',
        { class: 'dish-hint' },
        h('div', { class: 'tap-rings' }, h('i'), h('i'), h('b')),
        h('div', { class: 'h1' }, t('tapDish')),
        h('div', { class: 'h2' }, t('tapDishSub')),
      );
      this.dishUI.appendChild(this.hintEl);
    } else if (!wantHint && this.hintEl) this.hideFirstHint();

    // Gesture hints the first time a gesture becomes available.
    if (!this.hintEl && !this.gestureHint && !this.tutorial?.active && !this.splash?.visible) {
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
    if (this.overlay.ritualActive || !this.v) return;
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
    const hit = this.overlay.creatureAt(px, py);
    if (hit !== null) {
      this.openCard(hit);
      return;
    }
    if (this.card) {
      this.closeCard();
      return;
    }
    this.hideFirstHint();
    this.deps.onDishTap(g.x, g.y, { big: false });
  }

  private onBigTap(px: number, py: number): void {
    if (this.overlay.ritualActive || !this.v) return;
    if (this.hitGolden(px, py)) return;
    if (!this.camera.isOnDish(px, py)) return;
    const g = this.camera.screenToGrid(px, py);
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
    const lang = this.lang;
    const sp = cr.speciesId ? v.species.find((s) => s.id === cr.speciesId) : undefined;
    c.speciesId = cr.speciesId;
    const nm = sp ? (sp.catalogName ?? sp.name) : (cr.speciesName ?? t('unknownCreature'));
    setText(c.name, nm);
    toggle(c.name, 'latin', !!sp?.catalogName);
    c.name.style.cursor = sp ? 'pointer' : '';
    setText(c.state, stateName(cr.state));
    c.state.className = `ccard-state s-${cr.state}`;
    const col = cr.behavior ? BEHAVIOR_COLOR[cr.behavior] : '#8B98A5';
    setHTML(c.beh, `<span class="icw" style="color:${col}">${icon(cr.behavior ?? 'unknown', 16)}</span>${behaviorName(cr.behavior)}`);
    setText(c.eps, `+${fmtRate(cr.eps, lang)}/s`);
    setText(c.age, `${fmt(cr.age, lang)} ${t('steps')}`);
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
    top = Math.min(Math.max(8, top), H - c.h - 8);
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
    for (const id of TABS) this.panels[id]?.rebuild();
    for (const kind of ['settings', 'species', 'leaderboard']) this.modals.find(kind)?.relabel?.();
    this.tutorial?.relabel();
    const j = this.modals.find('journal');
    if (j) {
      j.close();
      this.openJournal('journal');
    }
    this.objShown = null;
  }

  // ───────────────────────────── extinction ─────────────────────────────

  private trackEra(v: GameView): void {
    if (!this.eraSeen || this.eraSeen.era !== v.era) {
      this.eraSeen = { era: v.era, at: performance.now(), exact: this.eraSeen !== null };
    }
  }

  private onExtinctionStart(genome: number): void {
    const v = this.v;
    this.modals.closeAll();
    this.closeCard();
    this.exitMode();
    if (v) {
      const best = v.creatures
        .filter((c) => c.state === 'stable' && c.eps > 0)
        .sort((a, b) => b.eps - a.eps)[0];
      const bestSp = best?.speciesId ? v.species.find((s) => s.id === best.speciesId) : undefined;
      const eraTime = (v.stats as { eraTime?: number }).eraTime;
      this.eraSummary = {
        era: v.era,
        genome,
        duration:
          typeof eraTime === 'number'
            ? eraTime
            : this.eraSeen?.exact
              ? (performance.now() - this.eraSeen.at) / 1000
              : null,
        essence: v.stats.eraEssence,
        newSpecies: v.species.filter((s) => s.era === v.era).length,
        best: best ? { name: bestSp?.catalogName ?? bestSp?.name ?? best.speciesName ?? t('unknownCreature'), eps: best.eps } : null,
      };
    }
    this.overlay.startRitual(() => this.deps.onRitualWhite?.());
    const delay = (v?.settings.reduceMotion ? 1 : 3) * 1000 + 650;
    setTimeout(() => {
      const sum = this.eraSummary;
      if (!sum) return;
      this.eraSummary = null;
      openEraSummary(this.modals, sum, () => this.switchTab('genome', true));
    }, delay);
  }

  // ───────────────────────────── bus ─────────────────────────────

  private bindBus(): void {
    const ov = this.overlay;
    bus.on('seed', (e) => {
      const big = e.manual && performance.now() - this.lastBigTap < 150;
      ov.ripple(e.x, e.y, e.manual ? (big ? 'big' : 'seed') : 'auto');
      if (e.manual) {
        this.hideFirstHint();
        this.tutorial?.onSeed();
      }
    });
    bus.on('seedDenied', (e) => {
      ov.denied(e.x, e.y, fmtShort(e.cost, this.lang));
      this.modePill.classList.remove('shake');
      void this.modePill.offsetWidth;
      this.modePill.classList.add('shake');
      this.vibrate([10, 30, 10]);
    });
    bus.on('creatureBorn', (e) => ov.bornRing(e.x, e.y));
    bus.on('creatureStable', (e) => ov.stableDing(e.x, e.y));
    bus.on('creatureDied', (e) => {
      ov.puff(e.x, e.y);
      if (this.card?.id === e.id) this.closeCard();
    });
    bus.on('creatureExploded', (e) => ov.explodedPulse(e.x, e.y));
    bus.on('creatureDivided', (e) => ov.dividedPulse(e.x, e.y));
    bus.on('income', (e) => {
      const gold = !!this.v?.buffs.some((b) => b.mult > 1);
      ov.income(e.id, e.x, e.y, e.amount, (n) => fmtRate(n, this.lang), gold);
    });
    bus.on('speciesNew', (e) => {
      ov.speciesBurst(e.x, e.y, t('newSpecies'), e.name);
      this.toasts.push(`${t('newSpecies')} ${e.name}`, 'good', 'sparkle', () => this.ctx.openSpecies(e.speciesId));
      this.vibrate([20, 40, 20]);
    });
    bus.on('behaviorNew', (e) => {
      ov.behaviorLabel(e.x, e.y, e.behavior, t('newBehavior'), behaviorName(e.behavior));
      this.toasts.push(`${t('newBehavior')}: ${behaviorName(e.behavior)}`, 'good', e.behavior);
    });
    bus.on('genomeBought', (e) => (this.panels.genome as GenomePanel | undefined)?.flash(e.id));
    bus.on('journalNew', (e) => this.toasts.push(tx(e.text), 'info', 'journal', () => this.openJournal('journal')));
    bus.on('achievement', (e) =>
      this.toasts.push(`${t('achievement')}: ${tx(e.name)}`, 'gold', 'trophy', () => this.openJournal('ach')),
    );
    bus.on('goldenSpawn', (e) => ov.goldenSpawned(e.x, e.y));
    bus.on('goldenCollected', (e) => {
      ov.goldenCollected(e.x, e.y, tx(e.reward));
      this.toasts.push(tx(e.reward), 'gold', 'sparkle');
    });
    bus.on('toast', (e) => this.toasts.push(tx(e.text), e.kind as ToastKind));
    bus.on('offlineReturn', (e) => this.showOfflineCard(e.seconds, e.essence));
    bus.on('extinctionStart', (e) => this.onExtinctionStart(e.genome));
    bus.on('extinctionDone', (e) => {
      if (this.eraSummary && e.genome > 0) this.eraSummary.genome = e.genome;
    });
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
        if (this.mode !== 'seed') return this.exitMode();
        if (this.card) return this.closeCard();
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (this.modals.open) return;
      const v = this.v;
      if (!v) return;
      if (e.key >= '1' && e.key <= '4') {
        const id = TABS[Number(e.key) - 1];
        if (v.tabs[id]) this.switchTab(id, true);
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
