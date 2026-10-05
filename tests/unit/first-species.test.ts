import { describe, expect, it } from 'vitest';
import { RealDish } from './realDish';

/**
 * QA4 F-04 (P0): in 20 sessions the World 1 swimmer never entered the Bestiary. A new species needs its
 * behaviour read (~1000 steps of history) and 800 stable steps (balance SPECIES_MIN_STABLE_STEPS); the
 * starter was incubated only 420 steps, so it registered at ~17.8 s of clock — after a 15 s run ended.
 * Measured on the real pipeline: CPU dish, detector every 10 steps, deflector, game clock by dish time.
 */
describe('the first species registers in the first run', () => {
  it('session 1: the starter Orbium enters the Bestiary while the 15 s clock runs, and only once stable', () => {
    const d = new RealDish({ seed: 3, grid: 168 });
    d.preincubate();
    const starter = d.lastReport!.creatures.find((c) => c.state === 'stable');
    expect(starter).toBeDefined();
    // The player's first seed, on the far side of the dish.
    const sx = starter!.x < d.dish.cx ? d.dish.cx + 40 : d.dish.cx - 40;
    expect(d.tap(sx, d.dish.cy)).toBe(true);
    d.run(16, 30);
    expect(d.log.speciesNew.length).toBe(1);
    const reg = d.log.speciesNew[0];
    expect(reg.clock).toBeGreaterThanOrEqual(0);
    expect(reg.clock).toBeLessThan(15);
    // Never non-stable matter: every registered creature was stable first.
    const sp = d.game.state.species[0];
    expect(sp.catalogCode).toBeTruthy();
    expect(d.log.stable.length).toBeGreaterThan(0);
    expect(d.log.stable[0].step).toBeLessThan(reg.step);
  }, 240_000);
});
