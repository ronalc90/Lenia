import { describe, expect, it } from 'vitest';
import { GESTURE_NAMES, type GestureName, pointInPolygon, recognize, spiralScore, swipeDirection, templatePoints } from './gestures';
import { curves, GLIDER_PATH, handDrawn, scribble, seededRng, type StrokeOpts } from './testUtil';
import type { TimedPt } from './types';

const rng = seededRng(1234);

type Gen = (o: StrokeOpts) => TimedPt[];
const SHAPES: Record<GestureName, { gen: Gen; maxRot: number }> = {
  circle: { gen: (o) => handDrawn(curves.circle, rng, { overshoot: 0.04, ...o }, true), maxRot: Math.PI },
  spiral: { gen: (o) => handDrawn(curves.spiral(2.5), rng, o), maxRot: Math.PI },
  heart: { gen: (o) => handDrawn(curves.heart, rng, { overshoot: 0.03, ...o }, true), maxRot: 0.3 },
  infinity: { gen: (o) => handDrawn(curves.infinity, rng, o, true), maxRot: Math.PI },
  glider: { gen: (o) => handDrawn(curves.poly(GLIDER_PATH), rng, o), maxRot: 0.15 },
};

function hitRate(name: GestureName, n: number, o: () => StrokeOpts): number {
  let ok = 0;
  for (let i = 0; i < n; i++) if (recognize(SHAPES[name].gen(o()))?.name === name) ok++;
  return ok / n;
}

describe('gesture recognizer', () => {
  it('recognises clean strokes of every shape', () => {
    for (const g of GESTURE_NAMES) {
      const m = recognize(SHAPES[g].gen({ noise: 0.005, wobble: 0.005 }));
      expect(m?.name, g).toBe(g);
      expect(m!.score).toBeGreaterThan(0.75);
    }
  });

  it('is invariant to size, position, start point and drawing direction', () => {
    for (const g of GESTURE_NAMES) {
      const rate = hitRate(g, 40, () => ({
        size: 10 + rng() * 60,
        cx: rng() * 400,
        cy: rng() * 400,
        start: rng(),
        reverse: rng() < 0.5,
        noise: 0.02,
        wobble: 0.03,
      }));
      expect(rate, g).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('tolerates rotation (free for circle/spiral/∞, quarter turns for the glider, ±17° for an upright heart)', () => {
    for (const g of GESTURE_NAMES) {
      const rate = hitRate(g, 40, () => {
        const quarter = g === 'glider' ? Math.floor(rng() * 4) * (Math.PI / 2) : 0;
        return { rot: quarter + (rng() * 2 - 1) * SHAPES[g].maxRot, mirror: g === 'glider' && rng() < 0.5, noise: 0.02, wobble: 0.03 };
      });
      expect(rate, g).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('survives hand-drawn noise (jitter + wobble)', () => {
    for (const g of GESTURE_NAMES) {
      const rate = hitRate(g, 60, () => ({ rot: g === 'heart' || g === 'glider' ? 0 : rng() * 6.28, start: rng(), noise: 0.03, wobble: 0.07 }));
      expect(rate, g).toBeGreaterThanOrEqual(0.85);
    }
  });

  it('an upside-down heart is not a heart', () => {
    let hearts = 0;
    for (let i = 0; i < 30; i++) if (recognize(SHAPES.heart.gen({ rot: Math.PI, noise: 0.02 }))?.name === 'heart') hearts++;
    expect(hearts).toBe(0);
  });

  it('rejects lines, L and U shapes, open arcs, double loops and coils', () => {
    const negatives: (() => TimedPt[])[] = [
      () => handDrawn(curves.poly([{ x: -1, y: 0 }, { x: 1, y: 0.1 }]), rng, { noise: 0.03, wobble: 0.05 }),
      () => handDrawn(curves.poly([{ x: -1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }]), rng, { noise: 0.03, wobble: 0.05 }),
      () => handDrawn(curves.poly([{ x: -1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: -1 }]), rng, { noise: 0.03, wobble: 0.05 }),
      () => handDrawn((u) => curves.circle(u * 0.5), rng, { noise: 0.03, wobble: 0.05 }),
      () => handDrawn((u) => curves.circle(u * 0.75), rng, { noise: 0.03, wobble: 0.05 }),
      () => handDrawn((u) => curves.circle(u * 2), rng, { noise: 0.03, wobble: 0.05 }),
      () => handDrawn((u) => ({ x: Math.cos(u * 25) * 0.4 + u * 2 - 1, y: Math.sin(u * 25) * 0.4 }), rng, { noise: 0.03, wobble: 0.05 }),
    ];
    let fp = 0;
    for (const gen of negatives) for (let i = 0; i < 40; i++) if (recognize(gen())) fp++;
    expect(fp / (negatives.length * 40)).toBeLessThan(0.03);
  });

  it('random scribbles almost never match (≤ 1 %)', () => {
    let fp = 0;
    for (let i = 0; i < 500; i++) if (recognize(scribble(rng, 30 + Math.floor(rng() * 80), 1.5 + rng() * 3))) fp++;
    expect(fp / 500).toBeLessThanOrEqual(0.01);
  });

  it('ignores strokes smaller than the minimum size or with too few points', () => {
    expect(recognize(SHAPES.circle.gen({ size: 4 }))).toBeNull();
    expect(recognize(SHAPES.circle.gen({ size: 30 }).slice(0, 5))).toBeNull();
    expect(recognize(SHAPES.circle.gen({ size: 4 }), { minSize: 2 })?.name).toBe('circle');
  });

  it('spiral score separates spirals from circles drawn twice', () => {
    expect(spiralScore(handDrawn(curves.spiral(3), rng, { noise: 0.01 }))).toBeGreaterThan(0.85);
    expect(spiralScore(handDrawn((u) => curves.circle(u * 2), rng, { noise: 0.01 }))).toBe(0);
  });

  it('templates are normalised (centroid 0, RMS radius 1)', () => {
    for (const g of ['circle', 'heart', 'glider', 'infinity'] as const) {
      const p = templatePoints(g);
      const cx = p.reduce((s, q) => s + q.x, 0) / p.length;
      const r = Math.sqrt(p.reduce((s, q) => s + q.x * q.x + q.y * q.y, 0) / p.length);
      expect(Math.abs(cx)).toBeLessThan(1e-9);
      expect(r).toBeCloseTo(1, 6);
    }
  });
});

describe('stroke helpers', () => {
  it('straight strokes give a direction (y grows down); curvy or short ones do not', () => {
    const line = (dx: number, dy: number) => Array.from({ length: 10 }, (_, i) => ({ x: 50 + (dx * i) / 9, y: 50 + (dy * i) / 9 }));
    expect(swipeDirection(line(0, -30))).toBe('up');
    expect(swipeDirection(line(0, 30))).toBe('down');
    expect(swipeDirection(line(-30, 4))).toBe('left');
    expect(swipeDirection(line(30, -4))).toBe('right');
    expect(swipeDirection(line(25, 25))).toBeNull(); // diagonal
    expect(swipeDirection(line(5, 0))).toBeNull(); // too short
    expect(swipeDirection(handDrawn((u) => curves.circle(u * 0.5), rng, { size: 20, noise: 0 }))).toBeNull();
  });


  it('point in polygon', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon(5, 5, sq)).toBe(true);
    expect(pointInPolygon(15, 5, sq)).toBe(false);
  });
});
