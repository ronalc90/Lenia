/**
 * Toasts: one line at the top of the dish, 3 s each, one visible at a time,
 * at most 3 waiting (the oldest waiting one is dropped).
 */
import type { ToastKind } from './ctx';
import { h, ic } from './dom';

interface ToastItem {
  text: string;
  kind: ToastKind;
  icon: string;
  onClick?: () => void;
  /** Toasts of one group merge into a single counter ("+3 new species"). */
  group?: { key: string; n: number; text: (n: number) => string };
}

const DEFAULT_ICON: Record<ToastKind, string> = {
  info: 'info',
  good: 'check',
  warn: 'warning',
  bad: 'warning',
  gold: 'sparkle',
};

export class Toasts {
  readonly el = h('div', { class: 'toasts bl-nodish', role: 'status', 'aria-live': 'polite' });
  private queue: ToastItem[] = [];
  private current: HTMLElement | null = null;
  private currentItem: ToastItem | null = null;
  private timer = 0;
  private holdTimer = 0;
  /** While true (a story scene or an explainer is talking), only warnings show; the rest waits. */
  private hold: () => boolean = () => false;

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

  private enqueue(item: ToastItem): void {
    this.queue.push(item);
    while (this.queue.length > 3) this.queue.shift();
    if (!this.current) this.next();
  }

  private critical(item: ToastItem): boolean {
    return item.kind === 'warn' || item.kind === 'bad';
  }

  private next(): void {
    let i = 0;
    if (this.hold()) {
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
    const el = h('div', { class: `toast k-${item.kind}` }, ic(item.icon, 24), h('span', { class: 'tt' }, item.text));
    el.dataset.text = item.text;
    if (item.onClick) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        item.onClick?.();
        this.dismiss();
      });
    }
    this.el.textContent = '';
    this.el.appendChild(el);
    this.current = el;
    this.timer = window.setTimeout(() => this.dismiss(), Math.min(this.cap(), this.queue.length ? 2400 : 3000));
  }

  private dismiss(): void {
    const el = this.current;
    if (!el) return;
    clearTimeout(this.timer);
    el.classList.add('out');
    window.setTimeout(() => {
      el.remove();
      if (this.current === el) this.next();
    }, 190);
  }
}
