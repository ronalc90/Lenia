/**
 * The phantom-tap guard of the dock (QA-CLARIDAD #17, docs/CLARIDAD2.md §2.7): a button only acts on a
 * click whose press started on the button itself, and not within `ms` of something covering it (VELA's
 * box, a Momento card, a sheet). A tap meant for the box above never lands on Nutrientes underneath when
 * the box closes, nor does the rest of a double tap. A keyboard press (no pointer) always acts.
 * Pure timing; ui.ts reports the presses and the covers.
 */
export class PressGuard {
  private coveredAt = -Infinity;
  /** The current press is on the button and the button was uncovered for long enough. */
  private armed = false;

  constructor(private readonly ms: number) {}

  /** Something else was on top of the button at `now` (a press on it, or a sample of the screen). */
  covered(now: number): void {
    this.coveredAt = Math.max(this.coveredAt, now);
  }

  /** A press went down inside the button's box: `onButton` = the button itself was under the finger. */
  press(onButton: boolean, now: number): void {
    if (!onButton) {
      this.covered(now);
      this.armed = false;
      return;
    }
    this.armed = now - this.coveredAt >= this.ms;
  }

  /** The click that ends the press: may the button act? `keyboard` = no pointer was involved. */
  click(now: number, keyboard = false): boolean {
    if (keyboard) return now - this.coveredAt >= this.ms;
    const ok = this.armed;
    this.armed = false;
    return ok;
  }
}
