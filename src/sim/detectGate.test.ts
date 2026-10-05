import { describe, expect, it } from 'vitest';
import { mustWaitForDetection, stepDish } from './detectGate';

/** A dish that steps unless its GL context is lost (webgl.ts advance() is a no-op then). */
function fakeDish(lost = false) {
  return {
    stepCount: 0,
    contextLost: lost,
    advance(k: number) {
      if (!this.contextLost) this.stepCount += k;
    },
  };
}

describe('stepping the dish', () => {
  it('stops at a snapshot boundary until its snapshot is taken', () => {
    expect(mustWaitForDetection(20, 10, 10)).toBe(true);
    expect(mustWaitForDetection(20, 20, 10)).toBe(false);
    expect(mustWaitForDetection(25, 10, 10)).toBe(false);
  });

  it('counts the steps the dish really ran, snapshot by snapshot', () => {
    const d = fakeDish();
    let detected = 0; // the snapshot of step 0 is taken
    const boundaries: number[] = [];
    const ran = stepDish(d, 25, 10, () => mustWaitForDetection(d.stepCount, detected, 10), () => {
      boundaries.push(d.stepCount);
      detected = d.stepCount; // a synchronous snapshot
    });
    expect(ran).toBe(25);
    expect(d.stepCount).toBe(25);
    expect(boundaries).toEqual([10, 20]);
  });

  it('a lost WebGL context runs no steps, so the session clock (dish time) does not move (RF-08)', () => {
    const d = fakeDish(true);
    const ran = stepDish(d, 40, 10, () => false, () => {});
    expect(ran).toBe(0);
    expect(d.stepCount).toBe(0);
  });

  it('a pending snapshot holds the steps (the dish never steps blind)', () => {
    const d = fakeDish();
    d.stepCount = 10;
    expect(stepDish(d, 30, 10, () => mustWaitForDetection(d.stepCount, 0, 10), () => {})).toBe(0);
  });
});
