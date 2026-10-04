import { describe, expect, it } from 'vitest';
import {
  cellInDish,
  clampToDish,
  DISH_GRID_MARGIN,
  dishArea,
  dishDiameterFor,
  DishAnimator,
  dishCellCount,
  dishDist,
  dishForGrid,
  dishMask,
  easeOutCubic,
  insideDish,
  lerpDish,
  moveInDish,
  randomPointInDish,
  rimDistance,
  sameDish,
} from './dish';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('dish geometry', () => {
  const d = dishForGrid(224, 224, 128);

  it('centres the dish on the grid and caps it to the grid margin', () => {
    expect(d).toEqual({ cx: 112, cy: 112, radius: 64 });
    const big = dishForGrid(224, 224, 1000);
    expect(big.radius).toBe((224 - 2 * DISH_GRID_MARGIN) / 2);
  });

  it('measures plain Euclidean distances (no wrap across the grid edge)', () => {
    expect(dishDist(2, 2, 222, 2)).toBe(220);
    expect(dishDist(0, 0, 3, 4)).toBe(5);
  });

  it('knows inside, outside and the clearance to the rim', () => {
    expect(rimDistance(d, 112, 112)).toBe(64);
    expect(rimDistance(d, 112 + 64, 112)).toBe(0);
    expect(insideDish(d, 112 + 60, 112)).toBe(true);
    expect(insideDish(d, 112 + 60, 112, 5)).toBe(false);
    expect(insideDish(d, 112 + 65, 112)).toBe(false);
    expect(insideDish(d, 0, 0)).toBe(false);
  });

  it('clamps points into the dish along the radius, keeping inside points as they are', () => {
    expect(clampToDish(d, 120, 100)).toEqual({ x: 120, y: 100 });
    const p = clampToDish(d, 112 + 200, 112, 10);
    expect(p.x).toBeCloseTo(112 + 54, 9);
    expect(p.y).toBeCloseTo(112, 9);
    const q = clampToDish(d, 300, 300, 4);
    expect(rimDistance(d, q.x, q.y)).toBeCloseTo(4, 9);
  });

  it('samples random points uniformly by area and never outside the margin', () => {
    const rng = lcg(7);
    let inner = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const p = randomPointInDish(d, rng, 8);
      expect(rimDistance(d, p.x, p.y)).toBeGreaterThanOrEqual(8 - 1e-9);
      if (Math.hypot(p.x - d.cx, p.y - d.cy) < (d.radius - 8) / Math.SQRT2) inner++;
    }
    // Half of the area lies within r / √2.
    expect(inner / N).toBeGreaterThan(0.46);
    expect(inner / N).toBeLessThan(0.54);
  });

  it('counts dish cells close to the disc area and matches the per-cell test', () => {
    const n = dishCellCount(d, 224, 224);
    expect(Math.abs(n - dishArea(d)) / dishArea(d)).toBeLessThan(0.01);
    let m = 0;
    for (let j = 0; j < 224; j++) for (let i = 0; i < 224; i++) if (cellInDish(d, i, j)) m++;
    expect(n).toBe(m);
  });

  it('builds a coarse mask for snapshots', () => {
    const mask = dishMask(d, 112, 112, 2);
    let n = 0;
    for (const v of mask) n += v;
    expect(Math.abs(n * 4 - dishArea(d)) / dishArea(d)).toBeLessThan(0.02);
    expect(mask[56 * 112 + 56]).toBe(1);
    expect(mask[0]).toBe(0);
  });

  it('bounces moving points off the rim like a billiard ball', () => {
    let p = { x: 112 + 60, y: 112, vx: 10, vy: 3 };
    p = moveInDish(d, p, 1, 2);
    expect(rimDistance(d, p.x, p.y)).toBeCloseTo(2, 6);
    expect(p.vx).toBeLessThan(0); // reflected inwards
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(Math.hypot(10, 3), 9); // speed kept
    const inside = moveInDish(d, { x: 112, y: 112, vx: 1, vy: 1 }, 1);
    expect(inside).toEqual({ x: 113, y: 113, vx: 1, vy: 1 });
  });

  it('interpolates the rim for the growth animation', () => {
    const a = dishForGrid(224, 224, 96);
    const b = dishForGrid(224, 224, 128);
    expect(lerpDish(a, b, 0)).toEqual(a);
    expect(lerpDish(a, b, 1)).toEqual(b);
    expect(lerpDish(a, b, 0.5).radius).toBe(56);
    expect(lerpDish(a, b, 2)).toEqual(b);
    expect(sameDish(lerpDish(a, b, 1), b)).toBe(true);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

describe('dish growth', () => {
  it('maps size indices to ladder diameters capped by the device', () => {
    expect(dishDiameterFor(0)).toBe(96);
    expect(dishDiameterFor(4)).toBe(224);
    expect(dishDiameterFor(9)).toBe(224);
    expect(dishDiameterFor(4, 160)).toBe(160);
    expect(dishDiameterFor(1, 100)).toBe(96);
  });

  it('grows the rim first and lets the camera catch up, keeping every intermediate rim inside the target', () => {
    const a = dishForGrid(232, 232, 96);
    const b = dishForGrid(232, 232, 128);
    const anim = new DishAnimator(a);
    anim.setTarget(b);
    let sawLag = false;
    let maxGlow = 0;
    let prev = a.radius;
    for (let i = 0; i < 200 && anim.update(1 / 60); i++) {
      expect(anim.rim.radius).toBeGreaterThanOrEqual(prev - 1e-9); // monotonic growth
      expect(anim.rim.radius).toBeLessThanOrEqual(b.radius + 1e-9);
      prev = anim.rim.radius;
      if (anim.fit < anim.rim.radius - 1) sawLag = true;
      maxGlow = Math.max(maxGlow, anim.glow);
    }
    expect(anim.done).toBe(true);
    expect(anim.rim).toEqual(b);
    expect(anim.fit).toBe(b.radius);
    expect(anim.glow).toBe(0);
    expect(sawLag).toBe(true);
    expect(maxGlow).toBeGreaterThan(0.9);
  });

  it('jumps without animation when asked (loading a save)', () => {
    const anim = new DishAnimator(dishForGrid(232, 232, 224));
    anim.setTarget(dishForGrid(232, 232, 96), false);
    expect(anim.rim.radius).toBe(48);
    expect(anim.fit).toBe(48);
    expect(anim.update(0.1)).toBe(false);
  });
});
