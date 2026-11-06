/**
 * The toasts' queue as a pure state machine (no DOM, no timers): which toast is on screen, which wait, and when
 * one enters or leaves. `Toasts` (./toasts) renders what it says; the rules are tested here without a browser.
 *
 * Time is passed in (`now`, ms) and so is whether something else talks over the dish (`held`: VELA, a brief,
 * a card). One toast shows at a time, at most `max` wait (the oldest waiting one is dropped).
 *
 * A toast enters once and is always readable (QA-3 §1a: 40 toasts made 70 entries, the second copy left within
 * 0–15 ms). The choice: a toast never re-enters. A non-warning toast enters only on a calm screen, a moment
 * after it was pushed (the VELA line the same event starts goes first), and once in it stays until it has been
 * read (TOAST_READ_MS) even if VELA starts talking; then it gives way for good. Re-entering a toast that was
 * cut short (the v0.026 rule) is what flashed: the cut copy was never readable, so no copy is ever cut short.
 */
import type { ToastKind } from './ctx';

/**
 * After the screen was busy (VELA talking, a brief), a waiting toast enters only once it has been calm this
 * long: «talking» flickers between lines, and a toast that followed it bounced in and out ~100 times in a
 * run (owner: «los mensajes rebotan y no paran de rebotar»).
 */
export const TOAST_CALM_MS = 800;
/**
 * A toast that entered stays at least this long, even if VELA starts talking over it; after that it gives way
 * for good (QA-3 §1a: no copy reached 1 s; the e2e play fails a toast seen for less than 1 s).
 */
export const TOAST_READ_MS = 1200;
/**
 * A new non-warning toast waits this long before it enters: the VELA line that the same event starts (a first
 * seed, a new species) speaks first, and the toast follows on a calm screen instead of being cut by her.
 */
export const TOAST_SETTLE_MS = 300;

/** A warning (it is about what the finger just did) enters and stays whoever talks. */
export function toastCritical(kind: ToastKind): boolean {
  return kind === 'warn' || kind === 'bad';
}

/** Does a showing toast of this kind step aside while something else talks? Warnings never do. */
export function toastYields(kind: ToastKind, held: boolean): boolean {
  if (kind === 'warn' || kind === 'bad') return false;
  return held;
}

/**
 * A toast on screen while something talks: it stays (nothing talks, it is a warning, or it has not been read
 * yet), or it leaves for good once it has been on screen TOAST_READ_MS. Never «wait and come back».
 */
export function toastYieldAction(kind: ToastKind, held: boolean, shownMs: number): 'stay' | 'leave' {
  return toastYields(kind, held) && shownMs >= TOAST_READ_MS ? 'leave' : 'stay';
}

/**
 * May a waiting toast enter now? Warnings always may; the rest wait for a calm screen (TOAST_CALM_MS since
 * anything talked) and for TOAST_SETTLE_MS after they were pushed.
 */
export function toastMayEnter(critical: boolean, now: number, lastBusyAt: number, pushedAt = -Infinity): boolean {
  return critical || (now - lastBusyAt >= TOAST_CALM_MS && now - pushedAt >= TOAST_SETTLE_MS);
}

/** What one step of the queue asks the renderer to do. */
export type ToastStep<T> = { enter: T; ms: number } | { leave: T } | null;

interface Waiting<T> {
  item: T;
  /** When it was pushed (ms). */
  at: number;
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
    this.wait.push({ item, at: now });
    while (this.wait.length > this.max) this.wait.shift();
  }

  /** Advance to `now`: call it every frame and after every push (the renderer also polls it on a timer). */
  step(now: number, held: boolean, capMs: number): ToastStep<T> {
    if (held) this.lastBusyAt = now;
    const s = this.shown;
    if (s) {
      const age = now - s.since;
      if (age >= s.ms || toastYieldAction(s.item.kind, held, age) === 'leave') return this.leave();
      return null;
    }
    if (this.out || !this.wait.length) return null;
    // Oldest first among those that may enter: a warning passes a calm-waiting achievement, never the reverse.
    const i = this.wait.findIndex((w) => toastMayEnter(toastCritical(w.item.kind), now, held ? now : this.lastBusyAt, w.at));
    if (i < 0) return null;
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
