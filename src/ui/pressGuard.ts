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
