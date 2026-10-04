import { describe, expect, it } from 'vitest';
import type { Creature, CreatureState, DetectorReport } from '../core/types';
import { LYSIS_MIN_MASS_R2, lysisTargets } from './lysis';

const R = 13;
function creature(id: number, state: CreatureState, massR2: number, radius = 6): Creature {
  return {
    id, x: 10 * id, y: 20, radius, mass: massR2 * R * R, complexity: 1, state, behavior: null,
    age: 900, vx: 0, vy: 0, signature: [], parentId: null,
  };
}
function report(creatures: Creature[], fill = 0.05): DetectorReport {
  return { step: 1000, creatures, events: [], totalMass: 0, fill };
}

describe('lysis', () => {
  it('dissolves an exploded blob bigger than any creature, covering its whole body', () => {
    const t = lysisTargets(report([creature(1, 'exploded', 3, 10)]), R, 0.25);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ id: 1, x: 10, y: 20 });
    expect(t[0].radius).toBeGreaterThan(Math.SQRT2 * 10 + R * 0.4);
  });

  it('never touches living or newborn creatures, however big', () => {
    expect(lysisTargets(report([creature(1, 'stable', 5), creature(2, 'born', 5)]), R, 0.25)).toEqual([]);
  });

  it('spares a creature-sized component even when it is flagged exploded', () => {
    expect(lysisTargets(report([creature(1, 'exploded', LYSIS_MIN_MASS_R2 * 0.9)]), R, 0.25)).toEqual([]);
  });

  it('leaves a flooded dish to the overgrown banner and its free clean-up', () => {
    expect(lysisTargets(report([creature(1, 'exploded', 4)], 0.3), R, 0.25)).toEqual([]);
  });
});
