import { describe, expect, it } from 'vitest';
import { dishSeconds } from './dishClock';
import { SESSION_SIM_PACE, SIM_STEPS_PER_SEC } from './cycleBalance';

/**
 * QA4 F-02: the session clock ran on wall time while the dish ran per frame, so a phone at 7 fps
 * gave the creatures ~8× fewer steps per clock second. The clock now counts DISH time: the steps
 * the dish really ran ÷ the steps a second is worth at the current pace.
 */
describe('the session clock follows the dish, not the wall', () => {
  const pace = SESSION_SIM_PACE;
  const perSec = SIM_STEPS_PER_SEC * pace;

  it('a frame that ran 45 steps at ×1.5 is one second of clock, however long the frame took', () => {
    expect(dishSeconds({ stepped: perSec, speed: pace, wallDt: 0.016, paused: false })).toBeCloseTo(1, 9);
    expect(dishSeconds({ stepped: perSec, speed: pace, wallDt: 3, paused: false })).toBeCloseTo(1, 9);
  });

  it('a slow phone (7 fps, steps capped per frame) gets a slower clock, never fewer steps per clock second', () => {
    const wall = 1 / 7;
    const stepped = Math.min(Math.floor(wall * perSec), 4 * pace);
    const clock = dishSeconds({ stepped, speed: pace, wallDt: wall, paused: false });
    expect(clock).toBeLessThan(wall);
    expect(stepped / clock).toBeCloseTo(perSec, 9);
  });

  it('a frame that waited for its snapshot (no steps) does not move the clock', () => {
    expect(dishSeconds({ stepped: 0, speed: pace, wallDt: 0.1, paused: false })).toBe(0);
  });

  it('a frozen dish (end card, speed 0) keeps wall time for the stamp; a paused one stops', () => {
    expect(dishSeconds({ stepped: 0, speed: 0, wallDt: 0.05, paused: false })).toBeCloseTo(0.05, 9);
    expect(dishSeconds({ stepped: 0, speed: 0, wallDt: 0.05, paused: true })).toBe(0);
  });
});
