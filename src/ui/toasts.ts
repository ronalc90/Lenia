/**
 * Toasts: one line at the top of the dish, 2.5–6 s each by length (toastMs), one visible at a time, at most 3 waiting (the
 * oldest waiting one is dropped). Every toast closes when tapped or swiped up (owner bug, B-10.4); one
 * with an action (an achievement → its card) carries a 48-px «Ver» button for it. A thin line shows the
 * time left, so it is clear the toast will go by itself. In: 220 ms `enter`; out: 160 ms `exit`.
 */
import type { ToastKind } from './ctx';
import { h, ic } from './dom';
import { DURATION, EASING, reduceMotion } from './art/motion';
import { RecentToasts, ToastQueue } from './toastQueue';

export { TOAST_CALM_MS, TOAST_READ_MS, TOAST_SETTLE_MS, toastMayEnter, toastYieldAction, toastYields } from './toastQueue';

interface ToastItem {
  text: string;
  kind: ToastKind;
  icon: string;
  onClick?: () => void;
  /** Toasts of one group merge into a single counter ("+3 new species"). */
  group?: { key: string; n: number; text: (n: number) => string };
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
  private readonly q = new ToastQueue<ToastItem>();
  /** QA-4 N12: the same text twice within half a minute is one toast. */
  private readonly recent = new RecentToasts();
  /** The element on screen (also while it plays its exit). */
  private current: HTMLElement | null = null;
  private timer = 0;
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
    const q = this.q;
    if (q.showing?.text === text || q.leaving?.text === text || q.waiting.some((w) => w.text === text)) return;
    if (this.recent.repeat(text, kind, performance.now())) return;
    this.enqueue({ text, kind, icon: icon ?? DEFAULT_ICON[kind], onClick });
  }

  /** A toast that merges with others of the same group while they wait or show (count goes up). */
  pushGroup(key: string, text: (n: number) => string, kind: ToastKind, icon?: string, onClick?: () => void): void {
    const shown = this.q.showing;
    const cur = shown?.group?.key === key ? shown : null;
    const waiting = this.q.waiting.find((q) => q.group?.key === key);
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
    this.q.push(item, performance.now());
    this.pump();
  }

  /**
   * Call every frame: the queue decides whether the toast on screen leaves (its time is up, or VELA talks and
   * it has been read) and whether a waiting one may enter (./toastQueue: a toast never enters twice).
   */
  yieldIfHeld(): void {
    this.pump();
  }

  private pump(): void {
    const now = performance.now();
    const s = this.q.step(now, this.hold(), this.cap());
    if (s && 'enter' in s) this.render(s.enter, s.ms);
    else if (s && 'leave' in s) this.exit();
    clearTimeout(this.timer);
    const at = this.q.nextAt(now);
    if (at < Infinity) this.timer = window.setTimeout(() => this.pump(), Math.max(16, at - now));
  }

  private render(item: ToastItem, ms: number): void {
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
      this.dismiss(el);
    });
    el.addEventListener('pointercancel', () => (down = null));
    // Keyboard: the «Ver» button is a real button; Escape-free toasts still go by themselves.
    see?.addEventListener('click', (e) => {
      if ((e as MouseEvent).detail !== 0) return; // pointer clicks are handled on pointerup
      item.onClick?.();
      this.dismiss(el);
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
  }

  /** A tap or a swipe on the toast on screen. */
  private dismiss(el: HTMLElement): void {
    if (this.current !== el || el.classList.contains('out')) return;
    if (this.q.dismiss()) this.exit();
  }

  /** The toast on screen plays its exit; the slot frees when it ends. */
  private exit(): void {
    const el = this.current;
    if (!el || el.classList.contains('out')) {
      this.q.gone();
      return;
    }
    el.classList.add('out');
    const rm = reduceMotion();
    const done = () => {
      el.remove();
      if (this.current !== el) return;
      this.current = null;
      this.q.gone();
      this.pump();
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
