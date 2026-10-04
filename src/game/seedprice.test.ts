import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import { creature, recordingBus, report, seededRng } from './testUtil';

describe('seed price breakdown', () => {
  it('explains the seed cost as base × crowd × saturation', () => {
    const { bus } = recordingBus();
    const game = createGame({ bus, rng: seededRng(7) });
    const empty = game.view();
    expect(empty.seedPrice).toBeDefined();
    const p0 = empty.seedPrice!;
    expect(empty.seedCost).toBeCloseTo(p0.base * p0.crowdMult * p0.satMult, 9);

    // Two stable creatures: anything beyond the free slots multiplies the price.
    game.tick(0.5, report([creature({ id: 1, x: 40, y: 40 }), creature({ id: 2, x: 120, y: 160 })]));
    const v = game.view();
    const p = v.seedPrice!;
    expect(p.alive).toBe(2);
    expect(p.crowdMult).toBeCloseTo(1.5, 9);
    expect(p.used).toBe(2);
    expect(p.satMult).toBeCloseTo(3 ** Math.max(0, p.used - p.freeSlots), 9);
    expect(v.seedCost).toBeCloseTo(p.base * p.crowdMult * p.satMult, 9);
    expect(p.bigMult).toBeCloseTo(2.25, 9);
  });
});
