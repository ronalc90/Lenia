/**
 * Pointer input over the dish (doc §7, ADR-030 §2.2.1):
 *  - one finger tap → tap (UI decides: golden / drop / creature / seed / erase / print)
 *  - long press 400 ms → bigTap: a creature's card, or the big seed (or double tap in one-touch mode)
 *  - one-finger drag → what `dragStart` says: guide a swimmer ('steer') or collect the drops under the
 *    finger ('sweep'); otherwise the brush (when unlocked) or erase drag (eraser mode); never pans
 *  - two fingers → pinch zoom + pan through the Camera
 *  - desktop: wheel zoom, right-click (and right-drag) erases
 *
 * In lab sessions (`quickTaps`, ADR-031, docs/MECANICAS.md §3.4, §7.3) taps are the game: every tap lands at
 * once (no double-tap wait), a short touch that slides a little is still a tap (at 8 taps a second a finger
 * slides, and must not start guiding a swimmer), and a long press on the agar charges nothing (the big seed
 * moved to the Sembrar button). With «Pulso fácil» (`holdPulse`, §3.5) a finger held on a creature taps it
 * EASY_PULSE_HZ times a second.
 */
import type { Camera } from '../core/camera';

export interface DishInputHooks {
  tap(px: number, py: number): void;
  bigTap(px: number, py: number): void;
  brush(px: number, py: number): void;
  erase(px: number, py: number): void;
  /** The camera was moved by the player (stop following, etc.). */
  cameraMoved(): void;
  /** Long-press charge feedback (ring under the finger). */
  pressStart?(px: number, py: number): void;
  pressEnd?(): void;
  mode(): 'seed' | 'erase' | 'print';
  longPressEnabled(): boolean;
  brushEnabled(): boolean;
  oneTouch(): boolean;
  /** A long press here opens something even without the big seed (a creature's card): start the timer. */
  holdTarget?(px: number, py: number): boolean;
  /**
   * A one-finger drag started at (sx, sy) in seed mode: 'steer' (from a swimmer) or 'sweep' (collect
   * light) take the drag; null leaves it to the brush / the accidental-swipe rule.
   */
  dragStart?(sx: number, sy: number): 'steer' | 'sweep' | null;
  /** The finger moved during a steer / sweep drag, from (x0, y0) to (x1, y1). */
  dragMove?(x0: number, y0: number, x1: number, y1: number): void;
  /** The steer / sweep drag ended (finger up, a second finger, or cancelled). */
  dragEnd?(): void;
  /** (ADR-031) Taps answer at once: a session's dish (see the header). */
  quickTaps?(): boolean;
  /**
   * (ADR-031 §3.5, Settings.easyPulse) A finger held still at (px, py) pulses what is there (a creature, with
   * «Pulso fácil» on): it taps EASY_PULSE_HZ times a second instead of opening a card.
   */
  holdPulse?(px: number, py: number): boolean;
}

const LONG_PRESS_MS = 400;
const DOUBLE_TAP_MS = 280;
/**
 * In sessions a touch shorter than this is a tap even if the finger slid up to QUICK_SLIDE_PX
 * (docs/MECANICAS.md §7.1, §7.3: fast tapping slides; a guide or a sweep needs a longer or a wider move).
 */
export const QUICK_TAP_MS = 180;
export const QUICK_SLIDE_PX = 24;
/**
 * «Pulso fácil»: taps per second of a finger held on a creature (MECANICAS §3.5, Egg, Inc.'s "Hold to
 * Hatch"). Feel only: the game counts at most TAP_HITS_MAX_PER_S hits a second whatever the input sends.
 */
export const EASY_PULSE_HZ = 4;

interface Ptr {
  id: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  t0: number;
  type: string;
}

export class DishInput {
  private ptrs = new Map<number, Ptr>();
  private rect: DOMRect | null = null;
  private longTimer = 0;
  /** The long press waits one more frame before it fires (see onDown). */
  private longRaf = 0;
  private longFired = false;
  private dragging: 'none' | 'brush' | 'erase' | 'swipe' | 'steer' | 'sweep' = 'none';
  private pinched = false;
  private pinch: { d: number; mx: number; my: number } | null = null;
  private lastStroke: { x: number; y: number } | null = null;
  private pendingTap: { x: number; y: number; timer: number; t: number } | null = null;
  private rightDown = false;
  /** «Pulso fácil»: the held finger's repeat timer, and whether it tapped already (then lifting adds none). */
  private easyTimer = 0;
  private easyFired = false;

  constructor(
    private el: HTMLElement,
    private camera: Camera,
    private hooks: DishInputHooks,
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('lostpointercapture', this.onLost);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const r = this.rect ?? this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private slop(type: string): number {
    return type === 'mouse' ? 5 : 10;
  }

  private quick(): boolean {
    return !!this.hooks.quickTaps?.();
  }

  /** How far a finger must move to start a drag: in sessions a short touch may slide QUICK_SLIDE_PX and still tap. */
  private dragSlop(ptr: Ptr): number {
    const s = this.slop(ptr.type);
    if (!this.quick() || performance.now() - ptr.t0 >= QUICK_TAP_MS) return s;
    return Math.max(s, QUICK_SLIDE_PX);
  }

  private clearEasy(): void {
    if (this.easyTimer) {
      clearInterval(this.easyTimer);
      this.easyTimer = 0;
    }
  }

  private clearLong(): void {
    this.clearEasy();
    if (this.longRaf) {
      cancelAnimationFrame(this.longRaf);
      this.longRaf = 0;
      this.hooks.pressEnd?.();
    }
    if (this.longTimer) {
      clearTimeout(this.longTimer);
      this.longTimer = 0;
      this.hooks.pressEnd?.();
    }
  }

  private onDown = (e: PointerEvent): void => {
    // Floating controls (buttons, cards, toasts) live inside the dish: ignore them.
    if ((e.target as Element).closest?.('button, input, a, .bl-nodish')) return;
    this.rect = this.el.getBoundingClientRect();
    const p = this.local(e);
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    e.preventDefault();

    if (e.pointerType === 'mouse' && e.button === 2) {
      this.rightDown = true;
      this.hooks.erase(p.x, p.y);
      this.lastStroke = p;
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    this.ptrs.set(e.pointerId, { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, t0: performance.now(), type: e.pointerType });

    if (this.ptrs.size === 2) {
      // Second finger: switch to pinch, cancel everything single-finger.
      this.clearLong();
      this.endDrag();
      this.dragging = 'none';
      this.pinched = true;
      this.pinch = this.pinchState();
      return;
    }
    if (this.ptrs.size > 2) return;

    this.pinched = false;
    this.longFired = false;
    this.easyFired = false;
    this.dragging = 'none';
    this.lastStroke = null;
    const quick = this.quick();
    // «Pulso fácil»: a finger held on a creature taps it a few times a second (its card opens from its pill).
    if (quick && this.hooks.mode() === 'seed' && this.hooks.holdPulse?.(p.x, p.y)) {
      const id = e.pointerId;
      this.easyTimer = window.setInterval(() => {
        const ptr = this.ptrs.get(id);
        if (!ptr || this.pinched || this.dragging !== 'none') return this.clearEasy();
        this.easyFired = true;
        this.hooks.tap(ptr.x, ptr.y);
      }, 1000 / EASY_PULSE_HZ);
      return;
    }
    // A long press opens a creature's card (ADR-030) or charges the big seed; only the seed charges (never in a
    // session: the big seed is the Sembrar button's).
    const card = this.hooks.mode() === 'seed' && !this.hooks.oneTouch() && !!this.hooks.holdTarget?.(p.x, p.y);
    if (this.hooks.mode() === 'seed' && !this.hooks.oneTouch() && (card || (!quick && this.hooks.longPressEnabled()))) {
      if (!card) this.hooks.pressStart?.(p.x, p.y);
      this.longTimer = window.setTimeout(() => {
        this.longTimer = 0;
        // Pointer moves are delivered with the frame: on a slow frame the timer can run before the moves
        // that already happened, and a drag from a creature (a guide, a sweep) would open its card. One
        // more frame lets those moves land first.
        this.longRaf = requestAnimationFrame(() => {
          this.longRaf = 0;
          this.hooks.pressEnd?.();
          const ptr = this.ptrs.get(e.pointerId);
          if (!ptr || this.pinched || this.dragging !== 'none') return;
          if (Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) > this.slop(ptr.type)) return;
          this.longFired = true;
          this.hooks.bigTap(ptr.sx, ptr.sy);
        });
      }, LONG_PRESS_MS);
    }
  };

  private pinchState(): { d: number; mx: number; my: number } {
    const [a, b] = [...this.ptrs.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  private onMove = (e: PointerEvent): void => {
    const p = this.local(e);
    if (this.rightDown) {
      this.strokeTo(p, (x, y) => this.hooks.erase(x, y));
      return;
    }
    const ptr = this.ptrs.get(e.pointerId);
    if (!ptr) return;
    ptr.x = p.x;
    ptr.y = p.y;

    if (this.ptrs.size >= 2 && this.pinch) {
      const now = this.pinchState();
      const f = now.d / this.pinch.d;
      if (Math.abs(f - 1) > 0.001) this.camera.zoomAt(f, now.mx, now.my);
      this.camera.panBy(now.mx - this.pinch.mx, now.my - this.pinch.my);
      this.pinch = now;
      this.hooks.cameraMoved();
      return;
    }
    if (this.pinched || this.longFired) return;

    const moved = Math.hypot(p.x - ptr.sx, p.y - ptr.sy);
    if (this.dragging === 'none' && moved > this.dragSlop(ptr)) {
      this.clearLong();
      const mode = this.hooks.mode();
      const took = mode === 'seed' ? (this.hooks.dragStart?.(ptr.sx, ptr.sy) ?? null) : null;
      if (took) {
        this.dragging = took;
        this.lastStroke = { x: ptr.sx, y: ptr.sy };
      } else if (mode === 'erase') {
        this.dragging = 'erase';
        this.lastStroke = { x: ptr.sx, y: ptr.sy };
        this.hooks.erase(ptr.sx, ptr.sy);
      } else if (mode === 'seed' && this.hooks.brushEnabled() && !this.hooks.oneTouch()) {
        this.dragging = 'brush';
        this.lastStroke = { x: ptr.sx, y: ptr.sy };
        this.hooks.brush(ptr.sx, ptr.sy);
      } else if (moved > 24) {
        this.dragging = 'swipe'; // accidental swipe: never pans, never seeds
      }
    }
    if (this.dragging === 'brush') this.strokeTo(p, (x, y) => this.hooks.brush(x, y));
    else if (this.dragging === 'erase') this.strokeTo(p, (x, y) => this.hooks.erase(x, y));
    else if (this.dragging === 'steer' || this.dragging === 'sweep') {
      const last = this.lastStroke ?? p;
      this.hooks.dragMove?.(last.x, last.y, p.x, p.y);
      this.lastStroke = { x: p.x, y: p.y };
    }
  };

  /** A steer / sweep drag ends: tell the UI once. */
  private endDrag(): void {
    if (this.dragging === 'steer' || this.dragging === 'sweep') this.hooks.dragEnd?.();
  }

  /** Emit evenly spaced stroke points (≈3 grid cells apart) from the last one to p. */
  private strokeTo(p: { x: number; y: number }, fn: (x: number, y: number) => void): void {
    const last = this.lastStroke;
    if (!last) {
      this.lastStroke = p;
      fn(p.x, p.y);
      return;
    }
    const step = Math.max(6, 3 * this.camera.scale);
    const d = Math.hypot(p.x - last.x, p.y - last.y);
    if (d < step) return;
    const n = Math.floor(d / step);
    for (let i = 1; i <= n; i++) {
      const x = last.x + ((p.x - last.x) * i * step) / d;
      const y = last.y + ((p.y - last.y) * i * step) / d;
      fn(x, y);
    }
    this.lastStroke = {
      x: last.x + ((p.x - last.x) * n * step) / d,
      y: last.y + ((p.y - last.y) * n * step) / d,
    };
  }

  private onUp = (e: PointerEvent): void => {
    if (this.rightDown && e.pointerType === 'mouse') {
      this.rightDown = false;
      this.lastStroke = null;
      return;
    }
    const ptr = this.ptrs.get(e.pointerId);
    if (!ptr) return;
    this.ptrs.delete(e.pointerId);
    this.clearLong();
    if (this.ptrs.size > 0) {
      // One finger of a pinch lifted: keep pinching state off until all are up.
      this.pinch = null;
      return;
    }
    const wasPinch = this.pinched;
    this.pinched = false;
    this.pinch = null;
    if (wasPinch || this.longFired || this.easyFired || this.dragging !== 'none') {
      this.endDrag();
      this.dragging = 'none';
      this.lastStroke = null;
      return;
    }
    this.handleTap(ptr.sx, ptr.sy);
  };

  private handleTap(x: number, y: number): void {
    // ADR-031 §3.4: in a session the double-tap wait would delay every tap; the big seed is the button's.
    const doubleTapBig = !this.quick() && this.hooks.oneTouch() && this.hooks.longPressEnabled() && this.hooks.mode() === 'seed';
    if (!doubleTapBig) {
      this.hooks.tap(x, y);
      return;
    }
    const pend = this.pendingTap;
    if (pend && performance.now() - pend.t < DOUBLE_TAP_MS && Math.hypot(pend.x - x, pend.y - y) < 32) {
      clearTimeout(pend.timer);
      this.pendingTap = null;
      this.hooks.bigTap(x, y);
      return;
    }
    if (pend) {
      clearTimeout(pend.timer);
      this.hooks.tap(pend.x, pend.y);
    }
    const timer = window.setTimeout(() => {
      this.pendingTap = null;
      this.hooks.tap(x, y);
    }, DOUBLE_TAP_MS);
    this.pendingTap = { x, y, timer, t: performance.now() };
  }

  private onCancel = (e: PointerEvent): void => {
    this.ptrs.delete(e.pointerId);
    this.clearLong();
    if (this.ptrs.size === 0) {
      this.pinched = false;
      this.pinch = null;
      this.endDrag();
      this.dragging = 'none';
      this.lastStroke = null;
    }
    this.rightDown = false;
  };

  private onLost = (e: PointerEvent): void => {
    if (this.ptrs.has(e.pointerId)) this.onCancel(e);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.rect = this.el.getBoundingClientRect();
    const p = this.local(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const f = Math.exp(-e.deltaY * unit * 0.0016);
    this.camera.zoomAt(f, p.x, p.y);
    this.hooks.cameraMoved();
  };
}
