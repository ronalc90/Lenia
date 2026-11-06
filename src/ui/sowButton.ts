/**
 * The Sembrar button (ADR-031, docs/MECANICAS.md §3.1, §6.1): sowing is a button, never a tap on the dish.
 *
 *   tap              → the seed flies to the safest free spot (GameView.sowSpot, else sowHint.safeSowSpot)
 *   drag to the dish → the player picks the spot: safe ground glows soft green, bodies are hatched, and on
 *                      release the seed lands on the nearest safe spot (sowHint.snapSowSpot); never refused
 *   hold             → a big seed, only once it is bought (tools.longPress); one-touch mode: a double tap
 *
 * Under the label: «Gratis» / «4 de luz» / «Llena (4 de 4)»; two luck dots fill with failed seeds in a row and
 * the gold ring «¡Esta prende seguro!» lights when the next one is sure (GameView.seedLuck). A greyed button
 * still answers: the game says why on the dish (no Luz, full dish), nothing is charged.
 *
 * `sowModel` and `sowRequest` are pure (tested); `SowButton` is the DOM control. The game decides where the
 * seed really lands (actions.sow); the preview here only shows where it will go.
 */
import type { Camera } from '../core/camera';
import type { GameView, Lang, Text } from '../core/types';
import { TEXT } from '../game/content';
import { h, ic } from './dom';
import { STRINGS } from './i18n';
import { safeSowSpot, snapSowSpot, SOW_KEEP_R, SOW_RIM_R, type SowBody } from './sowHint';

/** UI timing and sizes of the button (not balance: how a finger reads it). */
export const SOW_UI = {
  /** A press this long is a hold (the dish's own long press, input.ts LONG_PRESS_MS). */
  holdMs: 400,
  /** One-touch mode: a second tap this soon is the big seed (input.ts DOUBLE_TAP_MS). */
  doubleMs: 280,
  /** A finger that moves this far (CSS px) from the button is dragging the seed. */
  dragPx: 12,
  /** The seed's arc from the button to its spot, ms (MECANICAS §6.1 step 3). */
  flightMs: 300,
  /** Steps a swimmer's path is looked ahead for the preview (≈ 1 s of dish at the session pace). */
  aheadSteps: 45,
} as const;

export type SowState = 'off' | 'ready' | 'free' | 'poor' | 'wait' | 'growing' | 'full';

export interface SowModel {
  state: SowState;
  /** «Sembrar». */
  label: Text;
  /** Under the label: the price, «Gratis», «Llena (4 de 4)» or «Espera…». */
  sub: Text;
  /** What a full dish needs (names the Placa upgrade) or the sure seed's words; null otherwise. */
  hint: Text | null;
  /** Greyed (full dish, no Luz, waiting): a tap still asks the game, which says why. */
  disabled: boolean;
  /** Luck dots: failed seeds in a row (`on`) out of the ones that make the next sure (`of`); null without them. */
  luck: { on: number; of: number } | null;
  /** The next seed surely takes: the gold ring. */
  sure: boolean;
  /** A hold sows a big seed (bought). */
  big: boolean;
}

const OFF: SowModel = { state: 'off', label: TEXT.sow, sub: TEXT.sowFree, hint: null, disabled: true, luck: null, sure: false, big: false };

/** What the button shows for this view. Only the sessions cycle has it; a finished run has none. */
export function sowModel(v: GameView): SowModel {
  const se = v.session;
  if (v.cycle !== 'sessions' || !se || se.phase === 'over') return OFF;
  const luckIn = v.seedLuck;
  const luck = luckIn && luckIn.need > 0 ? { on: Math.min(luckIn.need, Math.max(0, luckIn.fails)), of: luckIn.need } : null;
  const sure = !!luck && luckIn!.fails >= luckIn!.need;
  const big = !!v.tools.longPress;
  const base = { label: TEXT.sow, luck, sure, big };
  // Session 1, the first seed planted: VELA talks before the clock starts (a calm wait, never red).
  if (se.phase === 'ready' && se.tutorialHold) return { ...base, state: 'wait', sub: STRINGS.seedWait, hint: null, disabled: true };
  // (ADR-027 v0.027) The run's Nevera creature is still waking (a slow device): the game holds the seeds and the clock.
  if (se.wakeHold) return { ...base, state: 'wait', sub: STRINGS.seedWait, hint: TEXT.wakeSow, disabled: true };
  const room = v.seedPrice?.capacity ?? v.seedPrice?.freeSlots ?? 0;
  if (v.seedPrice?.full) return { ...base, state: 'full', sub: TEXT.sowFull(room), hint: TEXT.dishFull(room), disabled: true };
  if (v.seedsGrowing) return { ...base, state: 'growing', sub: STRINGS.seedWait, hint: null, disabled: true };
  const hint = sure ? TEXT.sowSure : null;
  // The first seed of the game is the sure creature, on the house (game.ts plantFirst).
  const firstFree = !!se.first && se.phase === 'ready';
  if (firstFree || (v.charges?.free ?? 0) > 0) return { ...base, state: 'free', sub: TEXT.sowFree, hint, disabled: false };
  if (!v.canSeed) return { ...base, state: 'poor', sub: TEXT.sowCost(Math.ceil(v.seedCost)), hint, disabled: true };
  return { ...base, state: 'ready', sub: TEXT.sowCost(Math.ceil(v.seedCost)), hint, disabled: false };
}

export interface SowRequest {
  /** Grid cell the seed goes to (the game may still nudge it). */
  spot: { x: number; y: number };
  big: boolean;
  /** The player chose the spot (a drag): the game sows at the nearest safe spot to it. */
  dragged: boolean;
  /** A drag let go on a bad spot moved to a safe one («Aquí cabe mejor», once). */
  snapped: boolean;
}

/** The bodies a seed keeps clear of, as the view draws them (everything but the dead). */
export function sowBodies(v: GameView): SowBody[] {
  const out: SowBody[] = [];
  for (const c of v.creatures) if (c.state !== 'dead') out.push({ x: c.x, y: c.y, r: c.r, vx: c.vx, vy: c.vy });
  return out;
}

/**
 * What a gesture on the button asks the game for: a tap or a hold the safest spot (the game's `sowSpot` when
 * it gives one; null = no room), a drag the snapped spot under the finger (`at`, grid cells). A hold is a big
 * seed only once it is bought.
 */
export function sowRequest(g: 'tap' | 'hold' | 'drag', v: GameView, at?: { x: number; y: number }): SowRequest | null {
  if (v.cycle !== 'sessions' || !v.dish) return null;
  const R = v.calibration.R;
  const big = g === 'hold' && !!v.tools.longPress;
  if (g === 'drag' && at) {
    const p = snapSowSpot(v.dish, sowBodies(v), R, at, SOW_UI.aheadSteps);
    return { spot: { x: p.x, y: p.y }, big: false, dragged: true, snapped: p.snapped };
  }
  if (v.sowSpot === null) return null;
  const spot = v.sowSpot ?? safeSowSpot(v.dish, sowBodies(v), R, SOW_UI.aheadSteps);
  return { spot: { x: spot.x, y: spot.y }, big, dragged: false, snapped: false };
}

// ───────────────────────────── DOM ─────────────────────────────

export interface SowButtonDeps {
  /** The dish element (the Camera's box): drags are read against it and the preview is drawn over it. */
  dish: HTMLElement;
  camera: Camera;
  lang(): Lang;
  reduceMotion(): boolean;
  /** The player asked for a seed (the host hands it to the game, which may still say no and why). */
  onSow(req: SowRequest): void;
  /** A gesture that has nothing to ask (no room at all, no session): shake and say why. */
  onDenied?(m: SowModel): void;
  onSound?(kind: 'tap' | 'hold' | 'deny'): void;
  vibrate?(pattern: number | number[]): void;
}

const LUCK_DOTS = 2;

export class SowButton {
  readonly el: HTMLButtonElement;
  private readonly sub: HTMLElement;
  private readonly name: HTMLElement;
  private readonly dots: HTMLElement[] = [];
  private readonly hand: HTMLElement;
  private readonly layer: HTMLElement;
  private readonly zones: HTMLCanvasElement;
  private readonly ghost: HTMLElement;
  private readonly target: HTMLElement;
  private v: GameView | null = null;
  private m: SowModel = OFF;
  private key = '';
  private down: { id: number; x: number; y: number; t: number } | null = null;
  private dragging = false;
  private held = false;
  private holdTimer = 0;
  private tapTimer = 0;
  private lastGrid: { x: number; y: number } | null = null;
  private raf = 0;

  constructor(private readonly deps: SowButtonDeps) {
    this.name = h('b', { class: 'sow-l' });
    this.sub = h('small', { class: 'sow-sub mono' });
    const luck = h('span', { class: 'sow-luck', 'aria-hidden': 'true' });
    for (let i = 0; i < LUCK_DOTS; i++) {
      const d = h('i');
      this.dots.push(d);
      luck.append(d);
    }
    this.hand = h('span', { class: 'sow-hand', 'aria-hidden': 'true', hidden: true }, ic('hand', 28));
    this.el = h(
      'button',
      { type: 'button', class: 'sow-btn', 'data-testid': 'sow', 'data-state': 'off', hidden: true },
      h('span', { class: 'sow-seed', 'aria-hidden': 'true' }, ic('seed', 30)),
      h('span', { class: 'sow-tx' }, this.name, this.sub),
      luck,
      this.hand,
    ) as HTMLButtonElement;
    // The drag preview: soft green where a seed fits, hatched bodies, the ghost seed and where it will land.
    this.zones = h('canvas', { class: 'sow-zones' }) as HTMLCanvasElement;
    this.ghost = h('span', { class: 'sow-ghost' }, ic('seed', 26));
    this.target = h('span', { class: 'sow-target' });
    this.layer = h('div', { class: 'sow-layer', hidden: true, 'aria-hidden': 'true' }, this.zones, this.target, this.ghost);
    deps.dish.appendChild(this.layer);
    this.bind();
  }

  update(v: GameView): void {
    this.v = v;
    const m = sowModel(v);
    this.m = m;
    const l = this.deps.lang();
    const key = `${m.state}|${m.sub[l]}|${m.luck?.on ?? -1}|${m.luck?.of ?? -1}|${m.sure ? 1 : 0}|${m.big ? 1 : 0}|${l}`;
    if (key === this.key) return;
    this.key = key;
    this.el.hidden = m.state === 'off';
    this.el.dataset.state = m.state;
    this.el.classList.toggle('dim', m.disabled);
    this.el.classList.toggle('sure', m.sure);
    this.el.classList.toggle('big', m.big);
    this.name.textContent = m.label[l];
    this.sub.textContent = m.sub[l];
    const luck = this.el.querySelector('.sow-luck') as HTMLElement;
    // The dots appear with the first seed that did not take (empty dots on a fresh button would read as decoration).
    luck.hidden = !m.luck || (m.luck.on === 0 && !m.sure);
    this.dots.forEach((d, i) => {
      d.hidden = !m.luck || i >= m.luck.of;
      d.classList.toggle('on', !!m.luck && i < m.luck.on);
    });
    this.el.setAttribute('aria-label', `${m.label[l]}: ${m.sub[l]}${m.hint ? `. ${m.hint[l]}` : ''}`);
    if (m.hint) this.el.title = m.hint[l];
    else this.el.removeAttribute('title');
  }

  /** The tutorial's hand on the button (MECANICAS §6.1 step 2; «¡Toca aquí!» of later runs). */
  setHand(on: boolean): void {
    if (this.hand.hidden === !on) return;
    this.hand.hidden = !on;
    this.el.classList.toggle('call', on);
  }

  /** The seed flies from the button to grid cell (x, y) in an arc (no flight with Reduce motion). */
  flyTo(x: number, y: number): void {
    if (this.deps.reduceMotion() || this.el.hidden) return;
    const d = this.deps.dish.getBoundingClientRect();
    const b = this.el.getBoundingClientRect();
    if (!(b.width > 0)) return;
    const p = this.deps.camera.gridToScreen(x, y);
    const sx = b.left + b.width / 2 - d.left;
    const sy = b.top + b.height / 2 - d.top;
    const seed = h('span', { class: 'sow-fly' }, ic('seed', 22));
    this.deps.dish.appendChild(seed);
    if (typeof seed.animate !== 'function') return void seed.remove();
    const lift = Math.min(90, Math.abs(sy - p.y) * 0.5 + 30);
    const at = (t: number) => {
      const xx = sx + (p.x - sx) * t;
      const yy = sy + (p.y - sy) * t - lift * 4 * t * (1 - t);
      return `translate(${xx.toFixed(1)}px, ${yy.toFixed(1)}px) translate(-50%, -50%) scale(${(1 - 0.35 * t).toFixed(3)})`;
    };
    const frames = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ transform: at(t), opacity: t < 1 ? 1 : 0.2 }));
    seed.animate(frames, { duration: SOW_UI.flightMs, easing: 'cubic-bezier(.3,.1,.3,1)', fill: 'forwards' }).onfinish = () => seed.remove();
  }

  dispose(): void {
    clearTimeout(this.holdTimer);
    clearTimeout(this.tapTimer);
    cancelAnimationFrame(this.raf);
    this.layer.remove();
    this.el.remove();
  }

  // ───────────── gestures ─────────────

  private bind(): void {
    const el = this.el;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.m.state === 'off') return;
      this.down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
      this.dragging = false;
      this.held = false;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic pointer */
      }
      clearTimeout(this.holdTimer);
      if (this.m.big)
        this.holdTimer = window.setTimeout(() => {
          if (!this.down || this.dragging) return;
          this.held = true;
          el.classList.add('holding');
          this.deps.onSound?.('hold');
          this.deps.vibrate?.(12);
        }, SOW_UI.holdMs);
    });
    el.addEventListener('pointermove', (e) => {
      const d = this.down;
      if (!d || d.id !== e.pointerId) return;
      if (!this.dragging && Math.hypot(e.clientX - d.x, e.clientY - d.y) > SOW_UI.dragPx && !this.held) this.startDrag();
      if (this.dragging) this.moveDrag(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent, cancel: boolean) => {
      const d = this.down;
      if (!d || d.id !== e.pointerId) return;
      this.down = null;
      clearTimeout(this.holdTimer);
      el.classList.remove('holding');
      if (this.dragging) {
        this.endDrag(cancel ? null : this.lastGrid);
        return;
      }
      if (cancel) return;
      this.press(this.held ? 'hold' : 'tap');
    };
    el.addEventListener('pointerup', (e) => end(e, false));
    el.addEventListener('pointercancel', (e) => end(e, true));
    // A keyboard (Enter / Space) presses it like a tap; pointer clicks were handled on pointerup.
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if ((e as MouseEvent).detail === 0) this.press('tap');
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private press(g: 'tap' | 'hold'): void {
    const v = this.v;
    if (!v) return;
    // One-touch mode has no hold: a double tap is the big seed (MECANICAS §3.4), so a single tap waits a moment.
    if (g === 'tap' && this.m.big && v.settings.oneTouch) {
      if (this.tapTimer) {
        clearTimeout(this.tapTimer);
        this.tapTimer = 0;
        return this.send('hold');
      }
      this.tapTimer = window.setTimeout(() => {
        this.tapTimer = 0;
        this.send('tap');
      }, SOW_UI.doubleMs);
      return;
    }
    this.send(g);
  }

  private send(g: 'tap' | 'hold', at?: { x: number; y: number }): void {
    const v = this.v;
    if (!v) return;
    const req = sowRequest(at ? 'drag' : g, v, at);
    if (!req) {
      this.deps.onSound?.('deny');
      this.deps.onDenied?.(this.m);
      return;
    }
    this.deps.onSound?.('tap');
    this.deps.onSow(req);
  }

  private startDrag(): void {
    const v = this.v;
    if (!v?.dish) return;
    this.dragging = true;
    this.layer.hidden = false;
    this.el.classList.add('dragging');
    this.drawZones(v);
  }

  /** The finger at client (cx, cy): the ghost follows it; the ring shows where the seed will land. */
  private moveDrag(cx: number, cy: number): void {
    const d = this.deps.dish.getBoundingClientRect();
    const x = cx - d.left;
    const y = cy - d.top;
    this.ghost.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    const over = this.deps.camera.isOnDish(x, y);
    this.lastGrid = over ? this.deps.camera.screenToGrid(x, y) : null;
    this.layer.classList.toggle('away', !over);
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      const v = this.v;
      const g = this.lastGrid;
      if (!v?.dish || !g) {
        this.target.hidden = true;
        return;
      }
      const p = snapSowSpot(v.dish, sowBodies(v), v.calibration.R, g, SOW_UI.aheadSteps);
      const s = this.deps.camera.gridToScreen(p.x, p.y);
      const r = Math.max(14, v.calibration.R * this.deps.camera.scale);
      this.target.hidden = false;
      this.target.classList.toggle('snap', p.snapped);
      this.target.style.width = this.target.style.height = `${(2 * r).toFixed(0)}px`;
      this.target.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -50%)`;
    });
  }

  private endDrag(at: { x: number; y: number } | null): void {
    this.dragging = false;
    this.el.classList.remove('dragging');
    this.layer.hidden = true;
    this.target.hidden = true;
    this.lastGrid = null;
    // Let go off the dish: nothing sown, nothing said (the seed goes back to its button).
    if (at) this.send('tap', at);
  }

  /** Safe ground in soft green, every body (and the glass) hatched: drawn once when a drag starts. */
  private drawZones(v: GameView): void {
    const dish = v.dish!;
    const cam = this.deps.camera;
    const box = this.deps.dish.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = this.zones;
    c.width = Math.max(1, Math.round(box.width * dpr));
    c.height = Math.max(1, Math.round(box.height * dpr));
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, box.width, box.height);
    const R = v.calibration.R;
    const s = cam.scale;
    const o = cam.gridToScreen(dish.cx, dish.cy);
    g.fillStyle = 'rgba(126, 231, 135, 0.13)';
    g.beginPath();
    g.arc(o.x, o.y, Math.max(0, dish.radius - SOW_RIM_R * R) * s, 0, Math.PI * 2);
    g.fill();
    // Hatched discs where a seed would touch a body: the room the game keeps (SOW_KEEP_R).
    const hatch = document.createElement('canvas');
    hatch.width = hatch.height = 10;
    const hg = hatch.getContext('2d');
    if (hg) {
      hg.strokeStyle = 'rgba(255, 197, 107, 0.55)';
      hg.lineWidth = 2;
      hg.beginPath();
      hg.moveTo(0, 10);
      hg.lineTo(10, 0);
      hg.stroke();
    }
    const pat = hg ? g.createPattern(hatch, 'repeat') : null;
    g.save();
    g.beginPath();
    g.arc(o.x, o.y, dish.radius * s, 0, Math.PI * 2);
    g.clip();
    for (const b of sowBodies(v)) {
      const p = cam.gridToScreen(b.x, b.y);
      g.beginPath();
      g.arc(p.x, p.y, (b.r + SOW_KEEP_R * R) * s, 0, Math.PI * 2);
      g.fillStyle = 'rgba(11, 14, 18, 0.55)';
      g.fill();
      if (pat) {
        g.fillStyle = pat;
        g.fill();
      }
    }
    g.restore();
  }
}
