import { describe, expect, it } from 'vitest';
import { dockAngle, pipettePose, PIPETTE_FX, tripReach } from './pipettes';

describe('pipettes on the rim (fx/pipettes.ts, ADR-030)', () => {
  it('a trip goes out to the drop half-way and comes back, eased in and out with no overshoot', () => {
    expect(tripReach(0)).toBe(0);
    expect(tripReach(0.5)).toBe(1);
    expect(tripReach(1)).toBe(0);
    for (let u = 0; u <= 1.0001; u += 0.05) {
      const v = tripReach(u);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // Instrument motion: slow to start and to stop (ease in-out), symmetric out and back.
    expect(tripReach(0.05)).toBeLessThan(0.1);
    expect(tripReach(0.25)).toBeCloseTo(0.5, 9);
    expect(tripReach(0.3)).toBeCloseTo(tripReach(0.7), 9);
  });

  it('a resting pipette sits on its dock just inside the glass, pointing at the centre', () => {
    const o = { x: 0, y: 0, angle: 0, lift: 0 };
    pipettePose(0, 0, null, null, 200, 200, 150, o);
    // Dock 0 is the top of the rim.
    expect(o.x).toBeCloseTo(200, 6);
    expect(o.y).toBeCloseTo(200 - 150 + PIPETTE_FX.restInset, 6);
    expect(Math.sin(o.angle)).toBeCloseTo(1, 6); // pointing down, at the centre
    expect(o.lift).toBe(0);
    expect(dockAngle(0.25)).toBeCloseTo(0, 9); // clockwise: a quarter is the right-hand side
  });

  it('half-way through the trip its tip is on the drop, pointing along its way; lifted only in between', () => {
    const o = { x: 0, y: 0, angle: 0, lift: 0 };
    pipettePose(0.25, 0.5, 120, 210, 200, 200, 150, o);
    expect(o.x).toBeCloseTo(120, 6);
    expect(o.y).toBeCloseTo(210, 6);
    expect(o.lift).toBeLessThan(0.05); // the tip touches the drop
    expect(Math.cos(o.angle)).toBeLessThan(-0.9); // from the right-hand dock towards the left
    pipettePose(0.25, 0.25, 120, 210, 200, 200, 150, o);
    expect(o.lift).toBeGreaterThan(0.9); // on its way it is carried above the bench
  });
});
