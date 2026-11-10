import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Camera } from '../core/camera';
import { DishInput, EASY_PULSE_HZ, LONG_PRESS_MIN_FRAMES, QUICK_SLIDE_PX, QUICK_TAP_MS, type DishInputHooks } from './input';

/** A stand-in for the dish element: it keeps the listeners DishInput adds and replays pointer events. */
class FakeDish {
  private on = new Map<string, (e: unknown) => void>();
  addEventListener(type: string, fn: (e: unknown) => void): void {
    this.on.set(type, fn);
  }
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 400, height: 400 };
  }
  setPointerCapture(): void {}
  fire(type: string, x: number, y: number, id = 1, pointerType = 'touch'): void {
    this.on.get(type)?.({ pointerId: id, clientX: x, clientY: y, pointerType, button: 0, target: { closest: () => null }, preventDefault() {} });
  }
}

interface Log {
  taps: [number, number][];
  big: number;
  drags: string[];
}

function rig(opts: Partial<DishInputHooks> = {}): { dish: FakeDish; log: Log } {
  const dish = new FakeDish();
  const log: Log = { taps: [], big: 0, drags: [] };
  const hooks: DishInputHooks = {
    tap: (x, y) => log.taps.push([x, y]),
    bigTap: () => log.big++,
    brush: () => undefined,
    erase: () => undefined,
    cameraMoved: () => undefined,
    mode: () => 'seed',
    longPressEnabled: () => true,
    brushEnabled: () => false,
    oneTouch: () => false,
    dragStart: () => {
      log.drags.push('start');
      return 'sweep';
    },
    dragMove: () => log.drags.push('move'),
    dragEnd: () => log.drags.push('end'),
    ...opts,
  };
  new DishInput(dish as unknown as HTMLElement, new Camera(128, 128, 400, 400), hooks);
  return { dish, log };
}

describe('the finger on the dish (input.ts, ADR-031, MECANICAS §3.4, §7.3)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
    vi.stubGlobal('window', globalThis);
    // Node has no frames: one every 16 ms on the fake clock.
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => setTimeout(() => cb(performance.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('a 150 ms touch that slides 20 px is still a tap', () => {
    const { dish, log } = rig({ quickTaps: () => true });
    dish.fire('pointerdown', 100, 100);
    vi.advanceTimersByTime(75);
    dish.fire('pointermove', 110, 100);
    vi.advanceTimersByTime(75);
    dish.fire('pointermove', 120, 100);
    dish.fire('pointerup', 120, 100);
    // A tap where the finger landed, and no sweep started.
    expect(log.taps).toEqual([[100, 100]]);
    expect(log.drags).toEqual([]);
    expect(QUICK_TAP_MS).toBeGreaterThan(150);
    expect(QUICK_SLIDE_PX).toBeGreaterThan(20);
  });

  it('a slide past 24 px, or a slow one, is still a sweep', () => {
    const fast = rig({ quickTaps: () => true });
    fast.dish.fire('pointerdown', 100, 100);
    vi.advanceTimersByTime(40);
    fast.dish.fire('pointermove', 130, 100);
    fast.dish.fire('pointerup', 130, 100);
    expect(fast.log.taps).toEqual([]);
    expect(fast.log.drags).toEqual(['start', 'move', 'end']);
    const slow = rig({ quickTaps: () => true });
    slow.dish.fire('pointerdown', 100, 100);
    vi.advanceTimersByTime(QUICK_TAP_MS + 20);
    slow.dish.fire('pointermove', 114, 100);
    slow.dish.fire('pointerup', 114, 100);
    expect(slow.log.taps).toEqual([]);
    expect(slow.log.drags[0]).toBe('start');
  });

  it('outside sessions a 10 px slide is a drag, as before', () => {
    const { dish, log } = rig();
    dish.fire('pointerdown', 100, 100);
    vi.advanceTimersByTime(50);
    dish.fire('pointermove', 112, 100);
    dish.fire('pointerup', 112, 100);
    expect(log.taps).toEqual([]);
    expect(log.drags[0]).toBe('start');
  });

  it('in sessions a tap is never delayed by the double-tap wait', () => {
    // One-touch mode with the big seed bought: outside sessions a tap waits 280 ms for a second one…
    const old = rig({ oneTouch: () => true });
    old.dish.fire('pointerdown', 100, 100);
    old.dish.fire('pointerup', 100, 100);
    expect(old.log.taps).toEqual([]);
    vi.advanceTimersByTime(300);
    expect(old.log.taps).toEqual([[100, 100]]);
    // …in a session every tap lands at once, and two quick taps are two taps (never the big seed).
    const now = rig({ oneTouch: () => true, quickTaps: () => true });
    now.dish.fire('pointerdown', 100, 100);
    now.dish.fire('pointerup', 100, 100);
    expect(now.log.taps).toEqual([[100, 100]]);
    vi.advanceTimersByTime(60);
    now.dish.fire('pointerdown', 102, 101);
    now.dish.fire('pointerup', 102, 101);
    expect(now.log.taps.length).toBe(2);
    expect(now.log.big).toBe(0);
  });

  it('ten taps a second for two seconds are twenty taps', () => {
    const { dish, log } = rig({ oneTouch: () => true, quickTaps: () => true, holdTarget: () => true });
    for (let i = 0; i < 20; i++) {
      dish.fire('pointerdown', 200 + (i % 3) * 4, 200);
      vi.advanceTimersByTime(40);
      dish.fire('pointerup', 200 + (i % 3) * 4, 200);
      vi.advanceTimersByTime(60);
    }
    expect(log.taps.length).toBe(20);
    expect(log.big).toBe(0);
  });

  it('in sessions a long press on the agar never charges the big seed; a creature still opens its card', () => {
    const presses: string[] = [];
    const { dish, log } = rig({ quickTaps: () => true, pressStart: () => presses.push('charge'), holdTarget: (x) => x < 150 });
    dish.fire('pointerdown', 300, 300);
    vi.advanceTimersByTime(600);
    dish.fire('pointerup', 300, 300);
    expect(presses).toEqual([]);
    expect(log.big).toBe(0);
    // On a creature: its card (bigTap at the creature).
    dish.fire('pointerdown', 100, 100);
    vi.advanceTimersByTime(450);
    expect(log.big).toBe(1);
    dish.fire('pointerup', 100, 100);
    expect(log.taps).toEqual([[300, 300]]);
  });

  // QA-4 N6 (c1-118, c1-130, c2-026): at 0.4–4 fps a quick tap became the card: the 400 ms timer and the frame
  // that opened the card ran before the finger's «up» was handled. A press opens the card only after the finger
  // was seen held over several frames.
  it('QA-4 N6: on a frozen phone a quick tap never opens the card (the hold must span several frames)', () => {
    const { dish, log } = rig({ quickTaps: () => true, holdTarget: () => true });
    // One frame every 2.5 s (0.4 fps): the up of a quick tap is handled after the next frame.
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => setTimeout(() => cb(performance.now()), 2500));
    dish.fire('pointerdown', 100, 100);
    vi.advanceTimersByTime(2550);
    dish.fire('pointerup', 100, 100);
    expect(log.big).toBe(0);
    expect(log.taps).toEqual([[100, 100]]);
    expect(LONG_PRESS_MIN_FRAMES).toBeGreaterThanOrEqual(4);
  });

  it('with Pulso fácil a finger held on a creature taps four times a second, and lifting adds no extra tap', () => {
    const { dish, log } = rig({ quickTaps: () => true, holdTarget: () => true, holdPulse: () => true });
    dish.fire('pointerdown', 100, 100);
    vi.advanceTimersByTime(1000);
    dish.fire('pointerup', 100, 100);
    expect(EASY_PULSE_HZ).toBe(4);
    expect(log.taps.length).toBe(EASY_PULSE_HZ);
    // Held, it never turns into the card.
    expect(log.big).toBe(0);
    // A quick tap in the same mode is one tap.
    dish.fire('pointerdown', 100, 100);
    vi.advanceTimersByTime(80);
    dish.fire('pointerup', 100, 100);
    expect(log.taps.length).toBe(EASY_PULSE_HZ + 1);
  });
});
