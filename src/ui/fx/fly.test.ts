import { describe, expect, it } from 'vitest';
import { bezierPoint, FLY, flyControl, flyDuration, flyProgress } from './fly';

/** A-5: the mote's path and timing (the canvas is drawn in the browser). */
describe('Esencia motes fly to the counter', () => {
  it('flight time grows with the distance, clamped to 520–760 ms', () => {
    expect(flyDuration(0)).toBe(FLY.durBase);
    expect(flyDuration(-1000)).toBe(FLY.durMin);
    expect(flyDuration(5000)).toBe(FLY.durMax);
    expect(flyDuration(1000)).toBeLessThanOrEqual(760);
    expect(flyDuration(1)).toBeGreaterThanOrEqual(520);
  });

  it('leaves the creature and lands on the counter, bending sideways on the way', () => {
    const c = { x: 0, y: 0 };
    flyControl(200, 600, 30, 30, 0.3, 1, c);
    const dist = Math.hypot(170, 570);
    const mid = { x: 115, y: 315 };
    expect(Math.hypot(c.x - mid.x, c.y - mid.y)).toBeCloseTo(0.3 * dist, 6);
    const p = { x: 0, y: 0 };
    bezierPoint(0, 200, 600, c.x, c.y, 30, 30, p);
    expect(p).toEqual({ x: 200, y: 600 });
    bezierPoint(1, 200, 600, c.x, c.y, 30, 30, p);
    expect(p.x).toBeCloseTo(30, 9);
    expect(p.y).toBeCloseTo(30, 9);
  });

  it('accelerates into the counter (slow start, fast arrival)', () => {
    expect(flyProgress(0.5)).toBeLessThan(0.5);
    expect(flyProgress(0.9) - flyProgress(0.8)).toBeGreaterThan(flyProgress(0.2) - flyProgress(0.1));
    expect(flyProgress(1)).toBe(1);
  });
});
