import { describe, expect, it } from 'vitest';
import type { Pattern } from '../core/types';
import { measureLook } from './look';

const R = 10;
function pic(f: (x: number, y: number) => number, n = 80): Pattern {
  const data = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) data[y * n + x] = Math.max(0, Math.min(1, f(x + 0.5 - n / 2, y + 0.5 - n / 2)));
  return { w: n, h: n, data };
}
const disc = (r: number, v = 0.9) => (x: number, y: number) => (Math.hypot(x, y) < r ? v : 0);

describe('measuring what a creature looks like', () => {
  it('a solid disc is round, one body, no holes, its radius in R', () => {
    const l = measureLook(pic(disc(12)), R);
    expect(l.holes).toBe(0);
    expect(l.bodies).toBe(1);
    expect(l.elongation).toBeLessThan(1.1);
    expect(l.radiusR).toBeGreaterThan(1.1);
    expect(l.radiusR).toBeLessThan(1.3);
  });

  it('a ring has one hole, with its anchor in the middle', () => {
    const l = measureLook(pic((x, y) => (Math.hypot(x, y) < 12 && Math.hypot(x, y) > 5 ? 0.9 : 0.02)), R);
    expect(l.holes).toBe(1);
    expect(l.anchors.holes[0][0]).toBeCloseTo(0.5, 1);
    expect(l.anchors.holes[0][1]).toBeCloseTo(0.5, 1);
    expect(l.core).toBeLessThan(0.35);
  });

  it('two separate blobs are two bodies; a long ellipse is long', () => {
    expect(measureLook(pic((x, y) => disc(6)(x - 12, y) + disc(6)(x + 12, y)), R).bodies).toBe(2);
    const e = measureLook(pic((x, y) => ((x / 24) ** 2 + (y / 8) ** 2 < 1 ? 0.8 : 0)), R);
    expect(e.elongation).toBeGreaterThan(2.5);
    expect(e.anchors.tip[1]).toBeCloseTo(0.5, 1);
  });

  it('a faint rim round a bright centre is not a hole (the Orbium is a disc, not a ring)', () => {
    const l = measureLook(pic((x, y) => {
      const r = Math.hypot(x, y);
      return r < 4 ? 1 : r > 10 && r < 12 ? 0.12 : r < 10 ? 0.05 : 0;
    }), R);
    expect(l.holes).toBe(0);
    expect(l.core).toBeGreaterThan(2.5);
  });

  it('an empty picture measures nothing', () => {
    const l = measureLook(pic(() => 0), R);
    expect(l.areaR2).toBe(0);
    expect(l.holes).toBe(0);
  });
});
