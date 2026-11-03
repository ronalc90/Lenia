import { describe, expect, it } from 'vitest';
import { PressGuard } from './pressGuard';
import { DOCK_UNCOVER_GUARD_MS } from '../game/balance';

// QA-CLARIDAD #17 (docs/CLARIDAD2.md §2.7): Nutrientes «se compró solo». It was a tap meant for VELA's
// box, which covers the dock: the box closed and the click landed on the Nutrientes button under it.
describe('the dock ignores a tap meant for what covered it', () => {
  it('QA#17: a tap that closes VELA\'s line over the dock never buys Nutrientes', () => {
    const g = new PressGuard(DOCK_UNCOVER_GUARD_MS);
    // The finger goes down on VELA's box, inside the button's box (it is covered)…
    g.press(false, 1000);
    // …the box closes and the click arrives at the button underneath.
    expect(g.click(1040)).toBe(false);
  });

  it('a second tap right after the box uncovered the dock is ignored too (the rest of a double tap)', () => {
    const g = new PressGuard(DOCK_UNCOVER_GUARD_MS);
    g.press(false, 1000);
    expect(g.click(1040)).toBe(false);
    g.press(true, 1000 + DOCK_UNCOVER_GUARD_MS - 50);
    expect(g.click(1000 + DOCK_UNCOVER_GUARD_MS)).toBe(false);
  });

  it('a layer that went away by itself also guards the button for a moment', () => {
    const g = new PressGuard(DOCK_UNCOVER_GUARD_MS);
    g.covered(2000); // seen covered (VELA's line closed on its own)
    g.press(true, 2100);
    expect(g.click(2150)).toBe(false);
    g.press(true, 2000 + DOCK_UNCOVER_GUARD_MS + 10);
    expect(g.click(2000 + DOCK_UNCOVER_GUARD_MS + 60)).toBe(true);
  });

  it('a plain tap on the uncovered button works, and a keyboard press (no pointer) too', () => {
    const g = new PressGuard(DOCK_UNCOVER_GUARD_MS);
    g.press(true, 5000);
    expect(g.click(5060)).toBe(true);
    // Each press is good for one click.
    expect(g.click(5070)).toBe(false);
    expect(g.click(6000, true)).toBe(true);
  });
});
