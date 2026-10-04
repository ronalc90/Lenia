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
  private timer = 0;

  push(text: string, kind: ToastKind = 'info', icon?: string, onClick?: () => void): void {
    if (!text) return;
    // Skip exact duplicates of what is showing or queued.
    if (this.current?.dataset.text === text || this.queue.some((q) => q.text === text)) return;
    this.queue.push({ text, kind, icon: icon ?? DEFAULT_ICON[kind], onClick });
    while (this.queue.length > 3) this.queue.shift();
    if (!this.current) this.next();
  }

  private next(): void {
    const item = this.queue.shift();
    if (!item) {
      this.current = null;
      return;
    }
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
    this.timer = window.setTimeout(() => this.dismiss(), this.queue.length ? 2400 : 3000);
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
