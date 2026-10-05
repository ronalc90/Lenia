import { describe, expect, it } from 'vitest';
import { RealDish } from './realDish';

/**
 * QA4 F-07: "Se apagó" before the player sowed anything, in 3/3 new profiles. Reproduced in the
 * browser (e2e build, debug handle): the starter was turned by the glass deflector at a pivot ~6 cells
 * off its centroid and torn apart (died as 'born' at step ~130 in open water). The report arrives one
 * snapshot late (async readback): the body was extrapolated with a velocity that did not know about
 * the turn the dish had just applied. The CPU reference with the same one-snapshot lag shows it.
 */
describe('the starter survives the glass with the browser one-snapshot lag', () => {
  it('a pure-template starter lives through its incubation and first bounces (several dishes)', () => {
    const dead: number[] = [];
    for (const seed of [1, 2, 3, 4]) {
      const d = new RealDish({ seed, grid: 168, browserLag: true });
      d.preincubate(600);
      if (d.log.died.length || d.alive() !== 1) dead.push(seed);
      expect(d.turns).toBeGreaterThan(0);
    }
    expect(dead).toEqual([]);
  }, 240_000);
});
