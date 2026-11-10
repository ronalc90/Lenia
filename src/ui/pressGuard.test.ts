import { afterEach, describe, expect, it, vi } from 'vitest';
import { installScreenGuard, PressGuard, SCREEN_TAP_GUARD_MS, ScreenGuard } from './pressGuard';
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

  it('a layer that went away by itself also guards the button for a moment after it went', () => {
    const g = new PressGuard(DOCK_UNCOVER_GUARD_MS);
    g.covered(2000); // seen covered (VELA's line closed on its own)…
    g.clear(2600); // …and seen gone 600 ms later (her box fades out)
    g.press(true, 2700);
    expect(g.click(2710)).toBe(false);
    g.press(true, 2600 + DOCK_UNCOVER_GUARD_MS + 10);
    expect(g.click(2600 + DOCK_UNCOVER_GUARD_MS + 20)).toBe(true);
  });

  it('a press that reaches the button before anyone saw the cover go is the rest of a double tap', () => {
    // A slow phone samples the screen rarely: the last look saw VELA's box, the next press already hits the
    // button. However long ago that look was, the cover went just now.
    const g = new PressGuard(DOCK_UNCOVER_GUARD_MS);
    g.press(false, 1000); // the tap on VELA's box
    g.press(true, 1700);
    expect(g.click(1710)).toBe(false);
    g.press(true, 1700 + DOCK_UNCOVER_GUARD_MS + 10);
    expect(g.click(1700 + DOCK_UNCOVER_GUARD_MS + 20)).toBe(true);
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

// QA-3 §2 (v0.026): four fast taps on «Ir al Árbol», always on the same spot. Tap 1 opened the Tree, tap 2 landed on
// «Placa más grande» in «Puedes comprar», tap 3 on its «Comprar», which bought it. The phone ran at 4–5 fps: each tap
// was handled 0.4–2 s after the finger came down.
describe('a screen that just opened ignores the taps that were not aimed at it (QA-3 §2)', () => {
  it('QA-3: the rest of a burst of taps on «Ir al Árbol» never reaches the Tree under it', () => {
    const g = new ScreenGuard(SCREEN_TAP_GUARD_MS);
    // Tap 1 came down at 0; the slow phone handled it at 400 ms and opened the Tree.
    expect(g.allows(0)).toBe(true);
    g.changed(400);
    // Taps 2–4 came down 150 ms apart, before or just after the Tree opened: none of them may act.
    for (const at of [150, 300, 450, 600]) expect(g.allows(at), `tap at ${at} ms`).toBe(false);
    // A deliberate tap a moment later works.
    expect(g.allows(400 + SCREEN_TAP_GUARD_MS - 1)).toBe(false);
    expect(g.allows(400 + SCREEN_TAP_GUARD_MS)).toBe(true);
  });

  it('QA-3: «¡Empezar!» tapped twice: the second tap never opens the Árbol tab the card uncovered', () => {
    const g = new ScreenGuard(SCREEN_TAP_GUARD_MS);
    g.changed(1000); // the start card closes
    expect(g.allows(1080)).toBe(false);
    expect(g.allows(1000 + SCREEN_TAP_GUARD_MS + 50)).toBe(true);
  });

  it('the guard is about 350 ms, inside the 300–400 ms the QA asked for', () => {
    expect(SCREEN_TAP_GUARD_MS).toBeGreaterThanOrEqual(300);
    expect(SCREEN_TAP_GUARD_MS).toBeLessThanOrEqual(400);
  });

  it('an older change never shortens a newer one', () => {
    const g = new ScreenGuard(SCREEN_TAP_GUARD_MS);
    g.changed(2000);
    g.changed(1500);
    expect(g.allows(2100)).toBe(false);
  });
});

/** A window that only routes listeners, and the events the screen guard reads (what reached the page is kept). */
function fakeWindow() {
  const listeners = new Map<string, ((e: Event) => void)[]>();
  const win = {
    addEventListener: (type: string, fn: (e: Event) => void) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    removeEventListener: (type: string, fn: (e: Event) => void) => listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)),
  } as unknown as Window;
  /** Fire `type` at `at` ms (its timeStamp and the clock); true when it reached the page (the guard let it through). */
  const fire = (type: string, at: number, pointerId = 1): boolean => {
    vi.spyOn(performance, 'now').mockReturnValue(at);
    let stopped = false;
    const e = { type, pointerId, timeStamp: at, detail: type === 'click' ? 1 : 0, cancelable: true, stopImmediatePropagation: () => (stopped = true), preventDefault: () => undefined };
    for (const fn of listeners.get(type) ?? []) fn(e as unknown as Event);
    return !stopped;
  };
  return { win, fire };
}

describe('the screen guard swallows only the press it refused', () => {
  afterEach(() => vi.restoreAllMocks());

  // Code review v0.027 #3: a swipe swallowed right after the Tree opened made no click, so the swallow window stayed
  // armed and ate the click of the player's next, deliberate tap on «Comprar» 600 ms later.
  it('a swallowed swipe (no click) never eats the click of the next tap the guard allows', () => {
    const g = new ScreenGuard(SCREEN_TAP_GUARD_MS);
    const { win, fire } = fakeWindow();
    const off = installScreenGuard(win, g);
    g.changed(1000); // the Tree opens
    expect(fire('pointerdown', 1100)).toBe(false); // too soon: the whole press is swallowed…
    expect(fire('pointermove', 1150)).toBe(false);
    expect(fire('pointerup', 1200)).toBe(false); // …and, a swipe, it makes no click
    const at = 1800;
    expect(fire('pointerdown', at)).toBe(true);
    expect(fire('pointerup', at + 60)).toBe(true);
    expect(fire('click', at + 62)).toBe(true);
    off();
  });

  it('the click of a swallowed tap is still swallowed', () => {
    const g = new ScreenGuard(SCREEN_TAP_GUARD_MS);
    const { win, fire } = fakeWindow();
    const off = installScreenGuard(win, g);
    g.changed(1000);
    expect(fire('pointerdown', 1100)).toBe(false);
    expect(fire('pointerup', 1500)).toBe(false);
    expect(fire('click', 1502)).toBe(false); // its down came too soon, though the click itself is late
    off();
  });
});
