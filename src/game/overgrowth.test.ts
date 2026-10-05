/**
 * Classic Era loop (Laboratorio, Calibrar, Genoma, Extinción): no player reaches it any more (createGame's
 * default is the sessions cycle, ADR-026, which migrates old classic saves); the code is still there and is tested
 * here explicitly with `cycle: 'classic'` until it is deleted (ADR-028). The sessions cycle has its own tests (sessions.test.ts,
 * spacing.test.ts, dish.test.ts, tests/unit/ranking-sessions.test.ts…).
 */
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
    const game = createGame({ cycle: 'classic', bus, rng: seededRng(11) });
    const before = game.view();
    // Shorter than the free auto-clean, which would end the flood.
    run(game, B.OVERGROWN_AUTO_CLEAN - 2, mazeReport(80, 0.5));
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
    const game = createGame({ cycle: 'classic', bus, rng: seededRng(12) });
    run(game, 30, mazeReport(40, 0.1));
    // Packed pieces are never isolated → no new species from a crowd.
    expect(game.view().species.length).toBe(0);
  });

  it('new species come in small bursts, then at a steady rate', () => {
    const { bus } = recordingBus();
    const game = createGame({ cycle: 'classic', bus, rng: seededRng(13) });
    const n = B.SPECIES_NEW_BURST + 2;
    const far = Array.from({ length: n }, (_, i) =>
      creature({ id: 10 + i, x: 10 + i * 36, y: 20 + i * 44, signature: [0.5 + i, 0.4, 0.5, 0.3, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 1, 0.3, 0, 0.01, 0.2] }),
    );
    const rep: DetectorReport = { step: 0, creatures: far, events: [], totalMass: 100 * n, fill: 0.03 };
    run(game, 1, rep);
    expect(game.view().species.length).toBe(B.SPECIES_NEW_BURST);
    run(game, B.SPECIES_NEW_MIN_INTERVAL + 1, rep);
    expect(game.view().species.length).toBe(B.SPECIES_NEW_BURST + 1);
  });

  it('a dish that stays flooded cleans itself after 20 s, for free, keeping everything earned', () => {
    const { bus, count, log } = recordingBus();
    const game = createGame({ cycle: 'classic', bus, rng: seededRng(15) });
    const flood = mazeReport(60, 0.5);
    run(game, B.OVERGROWN_AUTO_CLEAN - 1, flood);
    expect(game.view().overgrown).toBe(true);
    expect(count('dishClear')).toBe(0);
    const essence = game.view().essence;
    for (let i = 0; i < 20 && count('dishClear') === 0; i++) game.tick(0.1, flood);
    expect(count('dishClear')).toBe(1);
    expect(game.view().overgrown).toBe(false);
    expect(game.view().essence).toBe(essence);
    game.tick(0.5, null); // the integrator clears the dish: no flood in the next reports
    expect(game.view().overgrown).toBe(false);
    const toasts = (log.get('toast') ?? []) as { text: { es: string; en: string } }[];
    expect(toasts.some((x) => x.text.es.startsWith('La placa se desbordó y la limpié'))).toBe(true);
    // A dish that recovers on its own before the delay is never wiped.
    const g2 = createGame({ cycle: 'classic', bus: recordingBus().bus, rng: seededRng(16) });
    run(g2, B.OVERGROWN_AUTO_CLEAN - 5, flood);
    run(g2, 10, mazeReport(5, 0.05));
    run(g2, B.OVERGROWN_AUTO_CLEAN - 5, flood);
    expect(g2.view().overgrown).toBe(true);
  });

  it('sterilizeDish clears the flood for free', () => {
    const { bus, count } = recordingBus();
    const game = createGame({ cycle: 'classic', bus, rng: seededRng(14) });
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
