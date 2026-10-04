import { describe, expect, it } from 'vitest';
import type { Creature, DetectorReport } from '../core/types';
import * as B from './balance';
import { createGame } from './game';
import { nearestCatalog } from './seeding';
import { creature, recordingBus, run, seededRng } from './testUtil';

/** A maze of fragments like the play-test screenshot: many small "stable" pieces, dish half full. */
function mazeReport(n: number, fill: number): DetectorReport {
  const cs: Creature[] = [];
  for (let i = 0; i < n; i++) {
    // Distinct shapes, packed close together.
    const sig = [0.4 + i * 0.07, 0.3 + (i % 5) * 0.1, 0.5, 0.2 + (i % 3) * 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 1, -1, -1, -1, -1];
    cs.push(creature({ id: 100 + i, x: 10 + (i % 10) * 18, y: 10 + Math.floor(i / 10) * 22, signature: sig, complexity: 2 }));
  }
  return { step: 0, creatures: cs, events: [], totalMass: n * 100, fill };
}

describe('dish overgrowth (play-test: flood unlocked everything in seconds)', () => {
  it('a flooded dish pays nothing, registers no species and keeps the seed price sane', () => {
    const { bus, count } = recordingBus();
    const game = createGame({ bus, rng: seededRng(11) });
    const before = game.view();
    run(game, 10, mazeReport(80, 0.5));
    const v = game.view();
    expect(v.overgrown).toBe(true);
    expect(v.essencePerSec).toBe(0);
    expect(v.essence).toBeLessThanOrEqual(before.essence + 1e-9);
    expect(v.species.length).toBe(0);
    expect(count('dishOvergrown')).toBe(1);
    // Price is capped even with a crowd of fragments.
    const cap = v.seedPrice!.base * v.seedPrice!.crowdMult * B.SEED_SATURATION_GROWTH ** B.SEED_SATURATION_MAX_STEPS;
    expect(v.seedCost).toBeLessThanOrEqual(cap + 1e-9);
  });

  it('crowded fragments on a calm dish cannot spam the bestiary', () => {
    const { bus } = recordingBus();
    const game = createGame({ bus, rng: seededRng(12) });
    run(game, 30, mazeReport(40, 0.1));
    // Packed pieces are never isolated → no new species from a crowd.
    expect(game.view().species.length).toBe(0);
  });

  it('new species come in small bursts, then at a steady rate', () => {
    const { bus } = recordingBus();
    const game = createGame({ bus, rng: seededRng(13) });
    const n = B.SPECIES_NEW_BURST + 2;
    const far = Array.from({ length: n }, (_, i) =>
      creature({ id: 10 + i, x: 10 + i * 36, y: 20 + i * 44, signature: [0.5 + i, 0.4, 0.5, 0.3, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 1, -1, -1, -1, -1] }),
    );
    const rep: DetectorReport = { step: 0, creatures: far, events: [], totalMass: 100 * n, fill: 0.03 };
    run(game, 1, rep);
    expect(game.view().species.length).toBe(B.SPECIES_NEW_BURST);
    run(game, B.SPECIES_NEW_MIN_INTERVAL + 1, rep);
    expect(game.view().species.length).toBe(B.SPECIES_NEW_BURST + 1);
  });

  it('sterilizeDish clears the flood for free', () => {
    const { bus, count } = recordingBus();
    const game = createGame({ bus, rng: seededRng(14) });
    run(game, 2, mazeReport(60, 0.5));
    const essence = game.view().essence;
    game.actions.sterilizeDish!();
    expect(count('dishClear')).toBeGreaterThan(0);
    expect(game.view().overgrown).toBe(false);
    expect(game.view().essence).toBe(essence);
  });

  it('spores never use catalog species that flood or explode', () => {
    for (const mu of [0.12, 0.13, 0.133, 0.14, 0.2, 0.29, 0.3]) {
      for (const sigma of [0.012, 0.0177, 0.02, 0.0432]) {
        const e = nearestCatalog({ mu, sigma, rings: [1] });
        expect(['OG2r', 'SN+']).not.toContain(e.code);
      }
    }
  });
});
