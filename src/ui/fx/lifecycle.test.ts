import { describe, expect, it } from 'vitest';
import {
  anticipation,
  beatPeriod,
  birthHalo,
  dissolveAmount,
  heartbeat,
  IncubationArc,
  rippleAt,
  seedDrop,
  LIFE,
} from './lifecycle';

/**
 * Owner bug (docs/ARTE-PULIDO.md §3.17): "las criaturas tardan mucho en nacer" — 8,9 s with nothing
 * to watch. A-4 makes the wait readable (J6: a continuous indicator makes people wait longer and
 * happier): a progress arc that follows the real progress, and a heartbeat that quickens towards
 * birth, with anticipation just before it.
 */
describe('incubation: the wait is visible', () => {
  it('the heartbeat quickens from 1,2 s to 0,45 s as the creature forms', () => {
    expect(beatPeriod(0)).toBeCloseTo(1.2, 6);
    expect(beatPeriod(0.9)).toBeCloseTo(0.45, 6);
    expect(beatPeriod(1)).toBeCloseTo(0.45, 6);
    let prev = Infinity;
    for (let p = 0; p <= 1; p += 0.05) {
      const b = beatPeriod(p);
      expect(b).toBeLessThanOrEqual(prev + 1e-9);
      prev = b;
    }
  });

  it('every beat is seen: opacity swings 0,15 at the start and 0,35 near birth', () => {
    const swing = (p: number) => {
      let lo = Infinity;
      let hi = -Infinity;
      // Integrate the phase like the overlay does (the period changes as the progress moves).
      for (let t = 0; t < 3; t += 1 / 240) {
        const v = heartbeat(t, p, false);
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      return hi - lo;
    };
    expect(swing(0)).toBeCloseTo(0.15, 2);
    expect(swing(0.9)).toBeCloseTo(0.35, 2);
  });

  it('reduce motion: no beat (the arc stays: it is information)', () => {
    expect(heartbeat(0.3, 0.5, true)).toBe(heartbeat(1.7, 0.5, true));
  });

  it('the arc never jumps: it follows the real progress with critical damping', () => {
    const arc = new IncubationArc();
    arc.target(0.1);
    arc.update(1 / 60);
    arc.target(0.6); // a 10 Hz report jumps the progress
    let prev = arc.value;
    for (let f = 0; f < 60; f++) {
      arc.update(1 / 60);
      expect(arc.value - prev).toBeLessThan(0.05);
      expect(arc.value).toBeLessThanOrEqual(0.6 + 1e-9); // no overshoot
      prev = arc.value;
    }
    expect(arc.value).toBeGreaterThan(0.55);
  });

  it('anticipation: from 92 % the halo draws in to 0,9 in 150 ms', () => {
    expect(anticipation(0.5, 1)).toBe(1);
    expect(anticipation(0.95, 0)).toBe(1);
    expect(anticipation(0.95, 0.15)).toBeCloseTo(0.9, 3);
    expect(anticipation(0.95, 0.5)).toBeCloseTo(0.9, 3);
  });
});

describe('sowing, birth, death (A-4 table)', () => {
  it('the drop falls from 1,6× and squashes on the agar keeping its volume', () => {
    expect(seedDrop(0).scale).toBeCloseTo(1.6, 6);
    const land = seedDrop(LIFE.dropMs / 1000);
    expect(land.sx * land.sy).toBeCloseTo(1, 1);
    const squash = seedDrop(LIFE.dropMs / 1000 + 0.04);
    expect(squash.sx).toBeGreaterThan(1.05);
    expect(squash.sy).toBeLessThan(0.95);
    expect(squash.sx * squash.sy).toBeCloseTo(1, 1);
    const after = seedDrop(0.5);
    expect(after.sx).toBeCloseTo(1, 2);
    expect(after.sy).toBeCloseTo(1, 2);
  });

  it('the ripple opens 6 → 34 px, thins 2 → 0,6 px and fades out', () => {
    const a = rippleAt(0.06, false)!;
    expect(a.r).toBeCloseTo(6, 1);
    expect(a.width).toBeCloseTo(2, 1);
    expect(a.alpha).toBeCloseTo(0.85, 2);
    const b = rippleAt(0.41 - 1e-6, false)!;
    expect(b.r).toBeCloseTo(34, 0);
    expect(b.width).toBeCloseTo(0.6, 1);
    expect(b.alpha).toBeLessThan(0.02);
    expect(rippleAt(0.03, false)).toBeNull();
    expect(rippleAt(0.5, false)).toBeNull();
  });

  it('reduce motion: the ripple is a fade of at most 80 ms that does not grow', () => {
    const a = rippleAt(0, true)!;
    const b = rippleAt(0.07, true)!;
    expect(a.r).toBe(b.r);
    expect(rippleAt(0.081, true)).toBeNull();
  });

  it('birth: the halo pops 1 → 1,18 → 1 within 450 ms', () => {
    let peak = 0;
    for (let t = 0; t <= 0.45; t += 0.005) peak = Math.max(peak, birthHalo(t));
    expect(peak).toBeGreaterThan(1.15);
    expect(peak).toBeLessThan(1.21);
    expect(birthHalo(0.45)).toBeCloseTo(1, 1);
    expect(birthHalo(0)).toBeCloseTo(1, 6);
  });

  it('death: the dissolve runs 0 → 1 over 600 ms and stays done', () => {
    expect(dissolveAmount(0)).toBe(0);
    expect(dissolveAmount(0.6)).toBe(1);
    expect(dissolveAmount(2)).toBe(1);
  });
});
