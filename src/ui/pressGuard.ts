/**
 * The phantom-tap guard of the dock (QA-CLARIDAD #17, docs/CLARIDAD2.md §2.7): a button only acts on a
 * click whose press started on the button itself, and not within `ms` of something stopping covering it
 * (VELA's box, a Momento card, a sheet). A tap meant for the box above never lands on Nutrientes underneath
 * when the box closes, nor does the rest of a double tap. A keyboard press (no pointer) always acts once
 * the button has been clear for `ms`.
 *
 * Frame-rate independent: ui.ts reports what it sees (`covered` / `clear`) as often as it can, and a press
 * that reaches the button while the last look still saw a cover means the cover went just now.
 */
import { DOCK_UNCOVER_GUARD_MS } from '../game/balance';

/**
 * How long taps are ignored after a screen or a sheet opens or closes (QA-3 §2: «ignorar los toques durante
 * 300–400 ms»): the plan's 350-ms phantom-tap guard of the dock (DOCK_UNCOVER_GUARD_MS, docs/CLARIDAD2.md §2.7).
 */
export const SCREEN_TAP_GUARD_MS = DOCK_UNCOVER_GUARD_MS;

export class PressGuard {
  /** The last look at the button saw something on top of it. */
  private isCovered = false;
  /** When the button was last seen uncovered after a cover (−∞: never covered). */
  private clearSince = -Infinity;
  /** The current press is on the button and the button was clear for long enough. */
  private armed = false;

  constructor(private readonly ms: number) {}

  /** Something else is on top of the button at `now` (a press on it, or a look at the screen). */
  covered(now: number): void {
    void now;
    this.isCovered = true;
  }

  /** The button is seen uncovered at `now`. */
  clear(now: number): void {
    if (!this.isCovered) return;
    this.isCovered = false;
    this.clearSince = now;
  }

  /** A press went down inside the button's box: `onButton` = the button itself was under the finger. */
  press(onButton: boolean, now: number): void {
    if (!onButton) {
      this.covered(now);
      this.armed = false;
      return;
    }
    // The finger found the button while the last look still saw a cover: the cover went just now.
    this.clear(now);
    this.armed = now - this.clearSince >= this.ms;
  }

  /** The click that ends the press: may the button act? `keyboard` = no pointer was involved. */
  click(now: number, keyboard = false): boolean {
    if (keyboard) return !this.isCovered && now - this.clearSince >= this.ms;
    const ok = this.armed;
    this.armed = false;
    return ok;
  }
}

/**
 * Taps right after a screen or a sheet opens or closes are not aimed at what is now under the finger (QA-3 §2:
 * four fast taps on «Ir al Árbol» opened the Tree, then «Placa más grande» from «Puedes comprar», then pressed
 * its «Comprar»; «¡Empezar!» did the same to the Árbol tab under it). A press that went down before the change,
 * or less than `ms` after it, is swallowed whole: its down, moves, up and click.
 *
 * Times are the events' own timestamps: a slow phone handles a tap late, but the finger came down when it did,
 * often before the new screen was even drawn. The change is stamped when the screen's DOM changes (not again at
 * the next frame: at 1 fps that held every tap for a second more, and a player's deliberate tap was lost).
 */
export class ScreenGuard {
  private changedAt = -Infinity;

  constructor(private readonly ms: number) {}

  /** A screen or a sheet opened, closed or turned to another page at `now`. */
  changed(now: number): void {
    if (now > this.changedAt) this.changedAt = now;
  }

  /** May a press that went down at `downAt` act? */
  allows(downAt: number): boolean {
    return downAt - this.changedAt >= this.ms;
  }
}

/** The one guard of every screen of the game (QA-3 §2): the Tree, its sheets, the report, the start card, drawers. */
export const screenGuard = new ScreenGuard(SCREEN_TAP_GUARD_MS);

/** A screen changed now: presses that came down before, or for SCREEN_TAP_GUARD_MS after, are ignored. */
export function screenChanged(): void {
  screenGuard.changed(performance.now());
}

/**
 * Swallow, at the window's capture phase, every press the screen guard refuses (pointerdown → its moves, its
 * up and its click). A keyboard click (no pointer) is never swallowed. Returns the uninstaller.
 */
export function installScreenGuard(win: Window, guard: ScreenGuard = screenGuard): () => void {
  const swallowed = new Set<number>();
  /** The click of a swallowed press comes after its pointerup: swallow it too (until this time). */
  let clickUntil = -Infinity;
  const stop = (e: Event) => {
    e.stopImmediatePropagation();
    if (e.cancelable) e.preventDefault();
  };
  const down = (e: PointerEvent) => {
    if (guard.allows(e.timeStamp)) {
      swallowed.delete(e.pointerId);
      // Code review v0.027 #3: a swallowed press that made no click (a swipe, a target replaced) left the window
      // open, and it ate the click of this press, the player's next deliberate tap. A new press closes it.
      clickUntil = -Infinity;
      return;
    }
    swallowed.add(e.pointerId);
    stop(e);
  };
  const move = (e: PointerEvent) => {
    if (swallowed.has(e.pointerId)) e.stopImmediatePropagation();
  };
  const up = (e: PointerEvent) => {
    if (!swallowed.delete(e.pointerId)) return;
    if (e.type === 'pointerup') clickUntil = performance.now() + 1000;
    e.stopImmediatePropagation();
  };
  const click = (e: MouseEvent) => {
    if (e.detail === 0) return;
    if (performance.now() <= clickUntil || !guard.allows(e.timeStamp)) {
      clickUntil = -Infinity;
      stop(e);
    }
  };
  const opts = { capture: true };
  win.addEventListener('pointerdown', down, opts);
  win.addEventListener('pointermove', move, opts);
  win.addEventListener('pointerup', up, opts);
  win.addEventListener('pointercancel', up, opts);
  win.addEventListener('click', click, opts);
  return () => {
    win.removeEventListener('pointerdown', down, opts);
    win.removeEventListener('pointermove', move, opts);
    win.removeEventListener('pointerup', up, opts);
    win.removeEventListener('pointercancel', up, opts);
    win.removeEventListener('click', click, opts);
  };
}
