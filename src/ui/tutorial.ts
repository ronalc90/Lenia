/**
 * Interactive first-run tutorial: coach marks with a dimmed backdrop, a
 * spotlight cut-out (clip-path, so taps pass through the hole only), a pulsing
 * ring, an arrow and a short text bubble. Steps trigger from GameView state;
 * progress persists in localStorage ('bioluma.tutorial'). Skippable, replayable.
 */
import type { GameView } from '../core/types';
import type { TabId } from './ctx';
import { h, loadJSON, saveJSON } from './dom';
import { t, type StrKey } from './i18n';

export interface TutorialHost {
  /** The UI root (.bl); all rects are relative to it. */
  root: HTMLElement;
  view(): GameView | null;
  /** Visible dish rectangle (root-relative). */
  dishRect(): Rect | null;
  /** Root-relative offset of the dish element (creature/golden coords are local to it). */
  dishOrigin(): { x: number; y: number };
  /** Root-relative rect of a DOM element matching the selector (visible only). */
  rectOf(selector: string): Rect | null;
  creatureScreen(id: number): { x: number; y: number; r: number } | null;
  goldenScreen(): { x: number; y: number } | null;
  activeTab(): TabId | null;
  switchTab(tab: TabId): void;
  /** True while something else owns the screen (splash, modal, ritual). */
  blocked(): boolean;
  sound(kind: 'tap' | 'confirm' | 'open'): void;
  reduceMotion(): boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius of the spotlight. */
  r: number;
}

type StepId = 'seed' | 'wait' | 'stable' | 'essence' | 'lab' | 'bestiary' | 'golden' | 'calibrate' | 'genome';

interface StepCtx {
  v: GameView;
  host: TutorialHost;
  /** Manual seeds since the step started. */
  seeds: number;
  start: StepState;
}

interface StepState {
  creatureId: number | null;
  upgradeId: string | null;
  upgradeLevel: number;
  at: number;
}

interface Step {
  id: StepId;
  title: StrKey;
  text: StrKey;
  /** Next/Got-it button (otherwise the step waits for an action). */
  button: 'next' | 'gotit' | null;
  /** Dim the screen and block taps outside the spotlight. */
  dim: boolean;
  needs: StepId[];
  eligible(c: StepCtx): boolean;
  complete(c: StepCtx): boolean;
  target(c: StepCtx): Rect | null;
  begin?(c: StepCtx): void;
}

const KEY = 'bioluma.tutorial';
const TAB_SEL: Record<TabId, string> = {
  lab: '.bl-tabs .tab[data-tab="lab"]',
  bestiary: '.bl-tabs .tab[data-tab="bestiary"]',
  calibrate: '.bl-tabs .tab[data-tab="calibrate"]',
  genome: '.bl-tabs .tab[data-tab="genome"]',
};

const stable = (v: GameView) => v.creatures.find((c) => c.state === 'stable');

function labTarget(v: GameView): { id: string; level: number } | null {
  const ups = v.upgrades.filter((u) => u.tab === 'lab' && u.unlocked && !u.maxed);
  const u = ups.find((x) => x.id === 'dropper') ?? ups[0];
  return u ? { id: u.id, level: u.level } : null;
}

const STEPS: Step[] = [
  {
    id: 'seed',
    title: 'tutSeedTitle',
    text: 'tutSeed',
    button: null,
    dim: true,
    needs: [],
    eligible: () => true,
    complete: (c) => c.seeds > 0 || !!stable(c.v),
    target: (c) => c.host.dishRect(),
  },
  {
    id: 'wait',
    title: 'tutWaitTitle',
    text: 'tutWait',
    button: 'gotit',
    dim: false,
    needs: ['seed'],
    eligible: (c) => !stable(c.v),
    complete: (c) => !!stable(c.v),
    target: () => null,
  },
  {
    id: 'stable',
    title: 'tutStableTitle',
    text: 'tutStable',
    button: 'next',
    dim: true,
    needs: ['seed'],
    eligible: (c) => !!stable(c.v),
    complete: () => false,
    begin: (c) => (c.start.creatureId = stable(c.v)?.id ?? null),
    target: (c) => {
      let id = c.start.creatureId;
      if (id === null || !c.v.creatures.some((x) => x.id === id)) {
        id = stable(c.v)?.id ?? null;
        c.start.creatureId = id;
      }
      const p = id !== null ? c.host.creatureScreen(id) : null;
      if (!p) return null;
      const o = c.host.dishOrigin();
      const r = Math.max(34, p.r + 14);
      return { x: o.x + p.x - r, y: o.y + p.y - r, w: r * 2, h: r * 2, r };
    },
  },
  {
    id: 'essence',
    title: 'tutEssenceTitle',
    text: 'tutEssence',
    button: 'next',
    dim: true,
    needs: ['stable'],
    eligible: () => true,
    complete: () => false,
    target: (c) => pad(c.host.rectOf('.hud-ess'), 6, 14),
  },
  {
    id: 'lab',
    title: 'tutLabTitle',
    text: 'tutLab',
    button: null,
    dim: true,
    needs: ['essence'],
    eligible: (c) => {
      if (!c.v.tabs.lab) return false;
      const lt = labTarget(c.v);
      return !!lt && !!c.v.upgrades.find((u) => u.id === lt.id)?.affordable;
    },
    begin: (c) => {
      const lt = labTarget(c.v);
      c.start.upgradeId = lt?.id ?? null;
      c.start.upgradeLevel = lt?.level ?? 0;
      c.host.switchTab('lab');
      requestAnimationFrame(() =>
        c.host.root.querySelector(`[data-up="${c.start.upgradeId}"]`)?.scrollIntoView({ block: 'nearest' }),
      );
    },
    complete: (c) => {
      const u = c.v.upgrades.find((x) => x.id === c.start.upgradeId);
      return !u || u.level > c.start.upgradeLevel || u.maxed;
    },
    target: (c) => pad(c.host.rectOf(`[data-up="${c.start.upgradeId}"] .buy`), 6, 14),
  },
  {
    id: 'bestiary',
    title: 'tutBestiaryTitle',
    text: 'tutBestiary',
    button: 'next',
    dim: true,
    needs: ['stable'],
    eligible: (c) => c.v.tabs.bestiary && c.v.species.length > 0,
    complete: (c) => c.host.activeTab() === 'bestiary' && performance.now() - c.start.at > 400,
    target: (c) => pad(c.host.rectOf(TAB_SEL.bestiary), 2, 14),
  },
  {
    id: 'golden',
    title: 'tutGoldenTitle',
    text: 'tutGolden',
    button: null,
    dim: true,
    needs: ['stable'],
    eligible: (c) => !!c.v.golden && c.v.golden.life > 0.35,
    complete: (c) => !c.v.golden,
    target: (c) => {
      const g = c.host.goldenScreen();
      if (!g) return null;
      const o = c.host.dishOrigin();
      const r = 44;
      return { x: o.x + g.x - r, y: o.y + g.y - r, w: r * 2, h: r * 2, r };
    },
  },
  {
    id: 'calibrate',
    title: 'tutCalibrateTitle',
    text: 'tutCalibrate',
    button: 'next',
    dim: true,
    needs: ['stable'],
    eligible: (c) => c.v.tabs.calibrate,
    complete: (c) => c.host.activeTab() === 'calibrate' && performance.now() - c.start.at > 400,
    target: (c) => pad(c.host.rectOf(TAB_SEL.calibrate), 2, 14),
  },
  {
    id: 'genome',
    title: 'tutGenomeTitle',
    text: 'tutGenome',
    button: 'next',
    dim: true,
    needs: ['stable'],
    eligible: (c) => c.v.tabs.genome && c.v.extinction.available,
    complete: (c) => c.host.activeTab() === 'genome' && performance.now() - c.start.at > 400,
    target: (c) => pad(c.host.rectOf(TAB_SEL.genome), 2, 14),
  },
];

function pad(r: Rect | null, p: number, radius: number): Rect | null {
  if (!r) return null;
  return { x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2, r: radius };
}

interface Saved {
  done: StepId[];
  skipped: boolean;
}

export class Tutorial {
  private done: Set<StepId>;
  private skipped: boolean;
  private step: Step | null = null;
  private state: StepState = { creatureId: null, upgradeId: null, upgradeLevel: 0, at: 0 };
  private seeds = 0;
  private cooldownUntil = 0;
  private hole: Rect | null = null;
  private layer: HTMLElement;
  private dim: HTMLElement;
  private ring: HTMLElement;
  private bubble: HTMLElement;
  private arrow: HTMLElement;
  private titleEl: HTMLElement;
  private textEl: HTMLElement;
  private btn: HTMLButtonElement;
  private skipBtn: HTMLButtonElement;
  private bw = 280;
  private bh = 120;
  /** No saved progress yet (first time this device runs the tutorial). */
  private fresh: boolean;
  private checkedVeteran = false;

  constructor(private host: TutorialHost) {
    const saved = loadJSON<Partial<Saved>>(KEY, {});
    this.done = new Set(saved.done ?? []);
    this.skipped = !!saved.skipped;
    this.fresh = saved.done === undefined && saved.skipped === undefined;
    this.dim = h('div', { class: 'coach-dim' });
    this.ring = h('div', { class: 'coach-ring' });
    this.titleEl = h('div', { class: 'coach-title' });
    this.textEl = h('p', { class: 'coach-text' });
    this.btn = h('button', { type: 'button', class: 'btn primary coach-next', 'data-testid': 'tutorial-next' });
    this.skipBtn = h('button', { type: 'button', class: 'coach-skip', 'data-testid': 'tutorial-skip' });
    this.arrow = h('span', { class: 'coach-arrow' });
    this.bubble = h(
      'div',
      { class: 'coach-bubble', role: 'dialog', 'aria-live': 'polite' },
      this.arrow,
      this.titleEl,
      this.textEl,
      h('div', { class: 'coach-actions' }, this.skipBtn, this.btn),
    );
    this.layer = h('div', { class: 'coach', hidden: true }, this.dim, this.ring, this.bubble);
    this.btn.addEventListener('click', () => this.finish());
    this.skipBtn.addEventListener('click', () => this.skip());
    host.root.appendChild(this.layer);
  }

  /** A coach mark is on screen. */
  get active(): boolean {
    return this.step !== null;
  }

  /** The current step is the "tap the dish" one (first-run hint stays hidden). */
  get wantsDishTap(): boolean {
    return !this.skipped && !this.done.has('seed');
  }

  onSeed(): void {
    this.seeds++;
  }

  restart(): void {
    this.done.clear();
    this.skipped = false;
    this.checkedVeteran = true;
    this.hide();
    this.cooldownUntil = performance.now() + 300;
    this.save();
  }

  skip(): void {
    this.skipped = true;
    this.host.sound('tap');
    this.hide();
    this.save();
  }

  private save(): void {
    saveJSON(KEY, { done: [...this.done], skipped: this.skipped } satisfies Saved);
  }

  private ctx(v: GameView): StepCtx {
    return { v, host: this.host, seeds: this.seeds, start: this.state };
  }

  update(v: GameView): void {
    if (!this.checkedVeteran) {
      this.checkedVeteran = true;
      // A save that is clearly past the first hour never gets the tutorial forced on it.
      if (this.fresh && (v.era > 1 || v.stats.seeds > 25)) {
        this.skipped = true;
        this.save();
      }
    }
    if (this.skipped) {
      if (this.step) this.hide();
      return;
    }
    const now = performance.now();
    if (this.step) {
      if (this.step.complete(this.ctx(v))) this.finish();
      else if (this.host.blocked() && this.step.id !== 'golden') this.hide(false);
      return;
    }
    if (now < this.cooldownUntil || this.host.blocked()) return;
    for (const s of STEPS) {
      if (this.done.has(s.id) || !s.needs.every((n) => this.done.has(n))) continue;
      const c = this.ctx(v);
      if (!s.eligible(c)) {
        // 'wait' is obsolete once life appeared: never show it later.
        if (s.id === 'wait' && stable(v)) this.markDone('wait');
        continue;
      }
      this.show(s, v);
      return;
    }
  }

  private markDone(id: StepId): void {
    this.done.add(id);
    this.save();
  }

  private show(s: Step, v: GameView): void {
    this.step = s;
    this.seeds = 0;
    this.state = { creatureId: null, upgradeId: null, upgradeLevel: 0, at: performance.now() };
    s.begin?.(this.ctx(v));
    this.titleEl.textContent = t(s.title);
    this.textEl.textContent = t(s.text);
    this.btn.hidden = s.button === null;
    this.btn.textContent = s.button === 'gotit' ? t('tutGotIt') : t('tutNext');
    this.skipBtn.textContent = t('tutSkip');
    this.layer.hidden = false;
    this.layer.classList.toggle('no-dim', !s.dim);
    this.layer.classList.remove('out');
    this.bubble.classList.remove('pop');
    void this.bubble.offsetWidth;
    this.bubble.classList.add('pop');
    // Iris in from the whole screen.
    const R = this.host.root.getBoundingClientRect();
    this.hole = { x: -40, y: -40, w: R.width + 80, h: R.height + 80, r: 40 };
    this.bw = this.bubble.offsetWidth || 280;
    this.bh = this.bubble.offsetHeight || 120;
    this.host.sound('open');
  }

  /** Complete the current step. */
  private finish(): void {
    const s = this.step;
    if (!s) return;
    this.markDone(s.id);
    const v = this.host.view();
    if (s.id === 'seed' && v && stable(v)) this.markDone('wait');
    this.host.sound('confirm');
    this.hide();
    this.cooldownUntil = performance.now() + 700;
  }

  private hide(animate = true): void {
    this.step = null;
    if (this.layer.hidden) return;
    if (animate && !this.host.reduceMotion()) {
      this.layer.classList.add('out');
      setTimeout(() => {
        if (!this.step) this.layer.hidden = true;
      }, 220);
    } else this.layer.hidden = true;
  }

  /** Per-frame: move the spotlight with its (possibly moving) target. */
  frame(dt: number): void {
    const s = this.step;
    const v = this.host.view();
    if (!s || !v) return;
    const R = this.host.root.getBoundingClientRect();
    const W = R.width;
    const H = R.height;
    const target = s.target(this.ctx(v));
    if (target && this.hole) {
      const k = this.host.reduceMotion() ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 12);
      const hl = this.hole;
      hl.x += (target.x - hl.x) * k;
      hl.y += (target.y - hl.y) * k;
      hl.w += (target.w - hl.w) * k;
      hl.h += (target.h - hl.h) * k;
      hl.r += (target.r - hl.r) * k;
    }
    const hole = target ? this.hole : null;
    if (s.dim && hole) {
      const { x, y, w, h: hh } = hole;
      const r = Math.max(0, Math.min(hole.r, w / 2, hh / 2));
      const path =
        `M0 0H${W}V${H}H0Z ` +
        `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + hh - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + hh}` +
        `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + hh - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
      this.dim.style.clipPath = `path(evenodd, "${path}")`;
      this.dim.hidden = false;
      this.ring.hidden = false;
      this.ring.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      this.ring.style.width = `${w.toFixed(1)}px`;
      this.ring.style.height = `${hh.toFixed(1)}px`;
      this.ring.style.borderRadius = `${r.toFixed(1)}px`;
    } else {
      this.dim.hidden = !s.dim;
      this.dim.style.clipPath = '';
      this.ring.hidden = true;
    }
    this.placeBubble(hole, W, H);
  }

  private placeBubble(hole: Rect | null, W: number, H: number): void {
    const bw = Math.min(this.bw, W - 24);
    const bh = this.bh;
    const gap = 16;
    let x: number;
    let y: number;
    let arrow: 'up' | 'down' | 'none' = 'none';
    let ax = bw / 2;
    if (!hole) {
      const d = this.host.dishRect();
      x = (W - bw) / 2;
      // Low in the dish, so the spot the player just tapped stays visible.
      y = d ? Math.max(d.y + 12, d.y + d.h - bh - 76) : H * 0.55;
    } else {
      const cx = hole.x + hole.w / 2;
      x = Math.min(Math.max(12, cx - bw / 2), W - bw - 12);
      ax = Math.min(Math.max(22, cx - x), bw - 22);
      if (hole.h > H * 0.45) {
        // Big spotlight (the dish): bubble inside, near its top.
        y = Math.max(hole.y + 70, 12);
      } else if (hole.y + hole.h + gap + bh <= H - 8) {
        y = hole.y + hole.h + gap;
        arrow = 'up';
      } else {
        y = Math.max(8, hole.y - gap - bh);
        arrow = 'down';
      }
    }
    this.bubble.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    this.arrow.className = `coach-arrow ${arrow}`;
    this.arrow.style.left = `${(ax - 7).toFixed(1)}px`;
  }

  /** Rebuild texts after a language change. */
  relabel(): void {
    const s = this.step;
    if (!s) return;
    this.titleEl.textContent = t(s.title);
    this.textEl.textContent = t(s.text);
    this.btn.textContent = s.button === 'gotit' ? t('tutGotIt') : t('tutNext');
    this.skipBtn.textContent = t('tutSkip');
    this.bw = this.bubble.offsetWidth || this.bw;
    this.bh = this.bubble.offsetHeight || this.bh;
  }
}
