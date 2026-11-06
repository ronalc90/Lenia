/**
 * The toasts' queue as a pure state machine (no DOM, no timers): which toast is on screen, which wait, and when
 * one enters or leaves. `Toasts` (./toasts) renders what it says; the rules are tested here without a browser.
 *
 * Time is passed in (`now`, ms) and so is whether something else talks over the dish (`held`: VELA, a brief,
 * a card). One toast shows at a time, at most `max` wait (the oldest waiting one is dropped).
 */
import type { ToastKind } from './ctx';

/**
 * After the screen was busy (VELA talking, a brief), a waiting toast enters only once it has been calm this
 * long: «talking» flickers between lines, and a toast that followed it bounced in and out ~100 times in a
 * run (owner: «los mensajes rebotan y no paran de rebotar»).
 */
export const TOAST_CALM_MS = 800;

/** Does a showing toast of this kind step aside while something else talks? Warnings never do. */
export function toastYields(kind: ToastKind, held: boolean): boolean {
  if (kind === 'warn' || kind === 'bad') return false;
  return held;
}

/**
 * A toast on screen while something starts talking: it stays (nothing talks, or it is a warning), steps
 * aside to wait once, or, asked a second time, is dropped. It never ping-pongs.
 */
export function toastYieldAction(kind: ToastKind, held: boolean, yielded: boolean): 'stay' | 'wait' | 'drop' {
  if (!toastYields(kind, held)) return 'stay';
  return yielded ? 'drop' : 'wait';
}

/** May a waiting toast enter now? Warnings always may; the rest wait for a calm screen. */
export function toastMayEnter(critical: boolean, now: number, lastBusyAt: number): boolean {
  return critical || now - lastBusyAt >= TOAST_CALM_MS;
}

/** What one step of the queue asks the renderer to do. */
export type ToastStep<T> = { enter: T; ms: number } | { leave: T } | null;

interface Waiting<T> {
  item: T;
  /** When it was pushed (ms). */
  at: number;
  /** It already stepped aside once for VELA. */
  yielded: boolean;
}

export class ToastQueue<T extends { kind: ToastKind }> {
  private readonly wait: Waiting<T>[] = [];
  private shown: (Waiting<T> & { since: number; ms: number }) | null = null;
  private out: T | null = null;
  /** When something last talked over the dish (ms): see TOAST_CALM_MS. */
  private lastBusyAt = -Infinity;

  constructor(private readonly max = 3) {}

  /** The toast on screen (not leaving), or null. */
  get showing(): T | null {
    return this.shown?.item ?? null;
  }

  /** The toast playing its exit, or null: the slot stays busy until `gone()`. */
  get leaving(): T | null {
    return this.out;
  }

  /** The toasts waiting their turn, oldest first. */
  get waiting(): readonly T[] {
    return this.wait.map((w) => w.item);
  }

  push(item: T, now: number): void {
    this.wait.push({ item, at: now, yielded: false });
    while (this.wait.length > this.max) this.wait.shift();
  }

  private critical(item: T): boolean {
    return toastYields(item.kind, false) === false;
  }

  /** Advance to `now`: call it every frame and after every push (the renderer also polls it on a timer). */
  step(now: number, held: boolean, capMs: number): ToastStep<T> {
    if (held) this.lastBusyAt = now;
    const s = this.shown;
    if (s) {
      if (now - s.since >= s.ms) return this.leave();
      const act = toastYieldAction(s.item.kind, held, s.yielded);
      if (act === 'stay') return null;
      if (act === 'wait') {
        this.wait.unshift({ item: s.item, at: s.at, yielded: true });
        while (this.wait.length > this.max) this.wait.pop();
      }
      return this.leave();
    }
    if (this.out || !this.wait.length) return null;
    let i = 0;
    if (!held && !toastMayEnter(this.critical(this.wait[0].item), now, this.lastBusyAt) && !this.wait.some((w) => this.critical(w.item))) return null;
    if (held) {
      i = this.wait.findIndex((w) => this.critical(w.item));
      if (i < 0) return null;
    }
    const w = this.wait.splice(i, 1)[0];
    const ms = Math.min(capMs, this.wait.length ? 2400 : 3000);
    this.shown = { ...w, since: now, ms };
    return { enter: w.item, ms };
  }

  private leave(): ToastStep<T> {
    const s = this.shown;
    if (!s) return null;
    this.shown = null;
    this.out = s.item;
    return { leave: s.item };
  }

  /** The toast on screen was tapped or swiped away. */
  dismiss(): T | null {
    const s = this.leave();
    return s && 'leave' in s ? s.leave : null;
  }

  /** The leaving toast finished its exit: the slot is free. */
  gone(): void {
    this.out = null;
  }

  /** When `step` may have something new to say at the latest (ms): the end of the toast on screen, or a short poll. */
  nextAt(now: number): number {
    if (this.shown) return this.shown.since + this.shown.ms;
    if (this.out) return Infinity;
    return this.wait.length ? now + 100 : Infinity;
  }
}
