/**
 * Toasts: one line at the top of the dish, 3 s each, one visible at a time, at most 3 waiting (the
 * oldest waiting one is dropped). Every toast closes when tapped or swiped up (owner bug, B-10.4); one
 * with an action (an achievement → its card) carries a 48-px «Ver» button for it. A thin line shows the
 * time left, so it is clear the toast will go by itself. In: 220 ms `enter`; out: 160 ms `exit`.
 */
import type { ToastKind } from './ctx';
import { h, ic } from './dom';
import { DURATION, EASING, reduceMotion } from './art/motion';

interface ToastItem {
  text: string;
  kind: ToastKind;
  icon: string;
  onClick?: () => void;
  /** Toasts of one group merge into a single counter ("+3 new species"). */
  group?: { key: string; n: number; text: (n: number) => string };
  /** It already stepped aside once for VELA: it never does a second round trip. */
  yielded?: boolean;
  /** One number per toast (its element carries it as `data-toast-id`: tests count its entries). */
  id?: number;
}

/** What a finger did to a toast (pointerdown → pointerup): `dx`, `dy` in px, `onAction` = on its "Ver" button. */
export interface ToastGesture {
  dx: number;
  dy: number;
  onAction: boolean;
}

/** A finger that moves farther than this is not a tap. */
const TAP_SLOP_PX = 10;
/** An upward swipe this long dismisses. */
const SWIPE_UP_PX = 24;

/**
 * What a tap or a swipe does to a toast (owner bug, docs/ARTE-PULIDO.md B-10.4): every toast closes
 * when tapped; one with an action runs it only from its own button.
 */
/**
 * After the screen was busy (VELA talking, a brief), a waiting toast enters only once it has been calm this
 * long: «talking» flickers between lines, and a toast that followed it bounced in and out ~100 times in a
 * run (owner: «los mensajes rebotan y no paran de rebotar»).
 */
export const TOAST_CALM_MS = 800;

/** May a waiting toast enter now? Warnings always may; the rest wait for a calm screen. */
export function toastMayEnter(critical: boolean, now: number, lastBusyAt: number): boolean {
  return critical || now - lastBusyAt >= TOAST_CALM_MS;
}

/**
 * A toast on screen while something starts talking: it stays (nothing talks, or it is a warning), steps
 * aside to wait once, or, asked a second time, is dropped. It never ping-pongs.
 */
export function toastYieldAction(kind: ToastKind, held: boolean, yielded: boolean): 'stay' | 'wait' | 'drop' {
  if (!toastYields(kind, held)) return 'stay';
  return yielded ? 'drop' : 'wait';
}

/** Does a showing toast of this kind step aside while something else talks? Warnings never do. */
export function toastYields(kind: ToastKind, held: boolean): boolean {
  if (kind === 'warn' || kind === 'bad') return false;
  return held;
}

export function toastGestureResult(g: ToastGesture, hasAction: boolean): 'action' | 'dismiss' | 'none' {
  if (g.dy <= -SWIPE_UP_PX && Math.abs(g.dy) > Math.abs(g.dx)) return 'dismiss';
  if (Math.hypot(g.dx, g.dy) > TAP_SLOP_PX) return 'none';
  return g.onAction && hasAction ? 'action' : 'dismiss';
}

const DEFAULT_ICON: Record<ToastKind, string> = {
  info: 'info',
  good: 'check',
  warn: 'warning',
  bad: 'warning',
  gold: 'sparkle',
};

/** The «Ver» label of a toast's action button (both languages, CLAUDE.md rule 3). */
const SEE = { es: 'Ver', en: 'View' } as const;

export class Toasts {
  readonly el = h('div', { class: 'toasts bl-nodish', role: 'status', 'aria-live': 'polite' });
  private queue: ToastItem[] = [];
  private current: HTMLElement | null = null;
  private currentItem: ToastItem | null = null;
  private timer = 0;
  private holdTimer = 0;
  /** While true (a story scene or an explainer is talking), only warnings show; the rest waits. */
  private hold: () => boolean = () => false;
  private lang: () => 'es' | 'en' = () => (typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'es');

  /** One message at a time: hold non-critical toasts while something else speaks (QA2 H-09). */
  setHold(fn: () => boolean): void {
    this.hold = fn;
  }

  /** Longest a toast may stay (ms): a short session run caps it (RITMO §4.4, SESSION_TOAST_MAX_MS). */
  private cap: () => number = () => Infinity;
  setMaxMs(fn: () => number): void {
    this.cap = fn;
  }

  push(text: string, kind: ToastKind = 'info', icon?: string, onClick?: () => void): void {
    if (!text) return;
    // Skip exact duplicates of what is showing or queued.
    if (this.current?.dataset.text === text || this.queue.some((q) => q.text === text)) return;
    this.enqueue({ text, kind, icon: icon ?? DEFAULT_ICON[kind], onClick });
  }

  /** A toast that merges with others of the same group while they wait or show (count goes up). */
  pushGroup(key: string, text: (n: number) => string, kind: ToastKind, icon?: string, onClick?: () => void): void {
    const cur = this.currentItem?.group?.key === key ? this.currentItem : null;
    const waiting = this.queue.find((q) => q.group?.key === key);
    const item = cur ?? waiting;
    if (item?.group) {
      item.group.n++;
      item.text = item.group.text(item.group.n);
      if (item === cur && this.current) {
        const tt = this.current.querySelector('.tt');
        if (tt) tt.textContent = item.text;
        this.current.dataset.text = item.text;
      }
      return;
    }
    this.enqueue({ text: text(1), kind, icon: icon ?? DEFAULT_ICON[kind], onClick, group: { key, n: 1, text } });
  }

  private nextId = 1;
  private enqueue(item: ToastItem): void {
    item.id = this.nextId++;
    this.queue.push(item);
    while (this.queue.length > 3) this.queue.shift();
    if (!this.current) this.next();
  }

  private critical(item: ToastItem): boolean {
    return toastYields(item.kind, false) === false;
  }

  /**
   * Call every frame: a non-critical toast already on screen when VELA (or an explainer) starts talking
   * steps aside and waits at the head of the queue, so it never sits on her line (session-play,
   * «.sty-box × .toast»); warnings stay.
   */
  yieldIfHeld(): void {
    const held = this.hold();
    if (held) this.lastBusyAt = performance.now();
    const item = this.currentItem;
    const el = this.current;
    if (!item || !el || el.classList.contains('out')) return;
    const act = toastYieldAction(item.kind, held, !!item.yielded);
    if (act === 'stay') return;
    if (act === 'wait') {
      item.yielded = true;
      this.queue.unshift(item);
      while (this.queue.length > 3) this.queue.pop();
    }
    this.dismiss();
  }
  /** When something last talked over the dish (performance.now() ms): see TOAST_CALM_MS. */
  private lastBusyAt = -Infinity;

  private next(): void {
    let i = 0;
    const now = performance.now();
    const held = this.hold();
    if (held) this.lastBusyAt = now;
    // Talking just stopped: a non-critical toast waits for a calm screen (TOAST_CALM_MS), so a «talking»
    // that flickers between lines cannot bounce it in and out.
    if (!held && this.queue.length && !toastMayEnter(this.critical(this.queue[0]), now, this.lastBusyAt) && !this.queue.some((q) => this.critical(q))) {
      this.current = null;
      this.currentItem = null;
      clearTimeout(this.holdTimer);
      this.holdTimer = window.setTimeout(() => !this.current && this.next(), Math.max(50, TOAST_CALM_MS - (now - this.lastBusyAt)));
      return;
    }
    if (held) {
      i = this.queue.findIndex((q) => this.critical(q));
      if (i < 0) {
        // Everything waiting is non-critical: try again shortly.
        this.current = null;
        this.currentItem = null;
        clearTimeout(this.holdTimer);
        if (this.queue.length) this.holdTimer = window.setTimeout(() => !this.current && this.next(), 500);
        return;
      }
    }
    const item = this.queue.splice(i, 1)[0];
    if (!item) {
      this.current = null;
      this.currentItem = null;
      return;
    }
    this.currentItem = item;
    const ms = Math.min(this.cap(), this.queue.length ? 2400 : 3000);
    const life = h('i', { class: 'toast-life', 'aria-hidden': 'true' });
    const see = item.onClick ? h('button', { type: 'button', class: 'toast-see' }, SEE[this.lang()]) : null;
    const el = h('div', { class: `toast k-${item.kind}${see ? ' has-action' : ''}` }, ic(item.icon, 24), h('span', { class: 'tt' }, item.text), see, life);
    el.dataset.text = item.text;
    el.dataset.toastId = String(item.id ?? 0);
    // Tap anywhere closes it; a swipe up closes it; its «Ver» runs the action (B-10.4).
    let down: { x: number; y: number; id: number; onAction: boolean } | null = null;
    el.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, id: e.pointerId, onAction: !!see && see.contains(e.target as Node) };
    });
    el.addEventListener('pointerup', (e) => {
      if (!down || e.pointerId !== down.id) return;
      const r = toastGestureResult({ dx: e.clientX - down.x, dy: e.clientY - down.y, onAction: down.onAction }, !!item.onClick);
      down = null;
      if (r === 'none') return;
      e.stopPropagation();
      if (r === 'action') item.onClick?.();
      this.dismiss();
    });
    el.addEventListener('pointercancel', () => (down = null));
    // Keyboard: the «Ver» button is a real button; Escape-free toasts still go by themselves.
    see?.addEventListener('click', (e) => {
      if ((e as MouseEvent).detail !== 0) return; // pointer clicks are handled on pointerup
      item.onClick?.();
      this.dismiss();
    });
    this.el.textContent = '';
    this.el.appendChild(el);
    this.current = el;
    const rm = reduceMotion();
    if (typeof el.animate === 'function') {
      el.animate(rm ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(-12px)' }, { opacity: 1, transform: 'translateY(0)' }], {
        duration: rm ? 80 : 220,
        easing: EASING.enter,
      });
      // The time left, as a line that empties (linear: it is a clock, not a movement).
      life.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: ms, easing: 'linear', fill: 'forwards' });
    }
    this.timer = window.setTimeout(() => this.dismiss(), ms);
  }

  private dismiss(): void {
    const el = this.current;
    if (!el || el.classList.contains('out')) return;
    clearTimeout(this.timer);
    el.classList.add('out');
    const rm = reduceMotion();
    const done = () => {
      el.remove();
      if (this.current === el) this.next();
    };
    if (typeof el.animate === 'function') {
      const a = el.animate(rm ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-8px)' }], {
        duration: rm ? 80 : DURATION.exit,
        easing: EASING.exit,
        fill: 'forwards',
      });
      a.onfinish = done;
    } else window.setTimeout(done, DURATION.exit);
  }
}
