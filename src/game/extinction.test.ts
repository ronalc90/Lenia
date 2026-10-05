/**
 * Classic Era loop (Laboratorio, Calibrar, Genoma, Extinción): no player reaches it any more (createGame's
 * default is the sessions cycle, ADR-026, which migrates old classic saves); the code is still there and is tested
 * here explicitly with `cycle: 'classic'` until it is deleted (ADR-028). The sessions cycle has its own tests (sessions.test.ts,
 * spacing.test.ts, dish.test.ts, tests/unit/ranking-sessions.test.ts…).
 */
import { describe, expect, it } from 'vitest';
import * as B from './balance';
import { essenceTerm, EXTINCTION_ESSENCE_NEEDED, genomeGain } from './defs';
import { createGame } from './game';
import { creature, GYRO_SIG, recordingBus, report, seededRng } from './testUtil';

describe('genome formula', () => {
  const cases: [number, number, number, number][] = [
    // E_era, new species, new behaviours, expected (GENOME_PER_SPECIES = 1 since QA3 F6)
    [0, 0, 0, 0],
    [9_999, 0, 0, 0],
    [10_000, 0, 0, 1],
    [39_999, 0, 0, 1],
    [40_000, 0, 0, 2],
    [250_000, 0, 0, 5],
    [250_000, 3, 2, 10],
    [1_000_000, 1, 0, 11],
    [1e8, 0, 6, 106],
    [123_456, 4, 1, 3 + 4 + 1],
    [2_250_000, 10, 5, 15 + 10 + 5],
    [99, 7, 0, 7],
  ];
  it.each(cases)('E=%d S=%d B=%d → %d', (e, sNew, bNew, expected) => {
    expect(genomeGain(e, sNew, bNew)).toBe(expected);
  });
  it('availability depends only on the essence term', () => {
    expect(EXTINCTION_ESSENCE_NEEDED).toBe(250_000);
    expect(essenceTerm(249_999)).toBe(4);
    expect(essenceTerm(250_000)).toBe(5);
  });
});

describe('extinction', () => {
  function setupRichGame() {
    const rec = recordingBus();
    const g = createGame({ cycle: 'classic', bus: rec.bus, rng: seededRng(11) });
    // Discover two species and two behaviours.
    g.tick(0.5, report([creature({ id: 1, x: 20 }), creature({ id: 2, x: 120, signature: GYRO_SIG })]));
    g.tick(0.5, report([creature({ id: 1, x: 20, behavior: 'swimmer' }), creature({ id: 2, x: 120, signature: GYRO_SIG, behavior: 'spinner' })]));
    const st = g.state as unknown as Record<string, unknown> & {
      essence: number;
      eraEssence: number;
      samples: number;
      genome: number;
      upgrades: Record<string, number>;
      regimes: unknown[];
      calib: { mu: number; sigma: number; R: number; dt: number; rings: number[] };
    };
    st.essence = 5e5;
    st.eraEssence = 300_000;
    st.upgrades = { dropper: 4, autoSeeder: 7, culture: 12, calibrator: 2, stabilizer: 3, microscope: 2, cataloguing: 3, archive: 1, marker: 1 };
    st.regimes = [{ name: 'x', mu: 0.2, sigma: 0.03, R: 13, dt: 0.1, rings: [1] }];
    st.calib = { mu: 0.22, sigma: 0.03, R: 13, dt: 0.1, rings: [1] };
    st.samples = 9;
    st.genome = 4;
    return { g, st, ...rec };
  }

  it('is unavailable below the essence requirement', () => {
    const { bus } = recordingBus();
    const g = createGame({ cycle: 'classic', bus, rng: seededRng(1) });
    (g.state as { eraEssence: number }).eraEssence = 249_000;
    expect(g.view().extinction.available).toBe(false);
    expect(g.actions.extinguish()).toBe(false);
  });

  it('resets exactly the doc table and preserves bestiary, samples, genome, journal, stats', () => {
    const { g, count } = setupRichGame();
    const speciesBefore = JSON.stringify(g.state.species);
    const journalBefore = g.state.journal.length;
    const statsSeeds = g.state.stats.seeds;
    const v0 = g.view();
    expect(v0.extinction.available).toBe(true);
    const expectedGain = essenceTerm(300_000) + B.GENOME_PER_SPECIES * 2 + 2; // 5 + 2 species + 2 behaviours
    expect(v0.extinction.genomeGain).toBe(expectedGain);
    expect(g.actions.extinguish()).toBe(true);
    const s = g.state;
    // Reset
    expect(s.essence).toBe(B.START_ESSENCE);
    expect(s.eraEssence).toBe(0);
    for (const id of ['dropper', 'autoSeeder', 'culture', 'calibrator', 'stabilizer']) expect(s.upgrades[id] ?? 0).toBe(0);
    expect(s.regimes).toEqual([]);
    expect(s.calib).toEqual({ mu: 0.15, sigma: 0.015, R: 13, dt: 0.1, rings: [1] });
    expect(s.era).toBe(2);
    // Preserved
    expect(JSON.stringify(s.species)).toBe(speciesBefore);
    expect(s.samples).toBe(9);
    expect(s.upgrades.microscope).toBe(2);
    expect(s.upgrades.cataloguing).toBe(3);
    expect(s.upgrades.archive).toBe(1);
    expect(s.upgrades.marker).toBe(1);
    expect(s.genome).toBe(4 + expectedGain);
    expect(s.behaviorsSeen).toEqual(['swimmer', 'spinner']);
    expect(s.journal.length).toBeGreaterThanOrEqual(journalBefore);
    expect(s.stats.seeds).toBe(statsSeeds);
    expect(s.stats.extinctions).toBe(1);
    expect(count('dishClear')).toBe(1);
    expect(count('extinctionDone')).toBe(1);
    // Lifetime bonus counted once: a second era pays no species/behaviour bonus for the same ones.
    expect(s.pendingSpecies).toBe(0);
    expect(s.pendingBehaviors).toBe(0);
  });

  it('clears the offline production history: the new Era cannot be paid with the old one', () => {
    const { g } = setupRichGame();
    for (let i = 0; i < 40; i++) g.tick(0.5, null); // build some active-play history
    expect(g.state.epsHistory.length + g.state.bucketTime).toBeGreaterThan(0);
    expect(g.actions.extinguish()).toBe(true);
    expect(g.state.epsHistory).toEqual([]);
    expect(g.state.bucketSum).toBe(0);
    expect(g.state.bucketTime).toBe(0);
    const before = g.state.essence;
    g.applyOffline(8 * 3600);
    expect(g.state.essence).toBe(before);
  });

  it('heritage nodes change the reset', () => {
    const { g, st } = setupRichGame();
    st.genome = 100;
    // Herencia starts at Arranque con Esencia (QA3 F8); buying out of order fails.
    expect(g.actions.buyGenomeNode('dropperMemory')).toBe(false);
    for (const id of ['essenceStart', 'dropperMemory', 'regimesPersist', 'persistentSeeder']) expect(g.actions.buyGenomeNode(id)).toBe(true);
    const spent = 3 + 3 + 4 + 10;
    expect(g.state.genomeSpent).toBe(spent);
    expect(g.view().multipliers!.global).toBeGreaterThan((1 + B.GENOME_SPENT_BONUS * spent) * (1 + B.GENOME_UNSPENT_BONUS * g.state.genome) - 1e-9);
    expect(g.actions.extinguish()).toBe(true);
    const s = g.state;
    expect(s.upgrades.dropper).toBe(3);
    expect(s.upgrades.autoSeeder).toBe(B.PERSISTENT_SEEDER_LEVEL);
    expect(s.regimes.length).toBe(1);
    expect(s.essence).toBe(B.ESSENCE_START_PER_ERA * 2);
  });

  it('genome tree: prerequisites, coming-soon nodes', () => {
    const { bus } = recordingBus();
    const g = createGame({ cycle: 'classic', bus, rng: seededRng(3) });
    (g.state as { genome: number }).genome = 1000;
    expect(g.actions.buyGenomeNode('tripleRings')).toBe(false);
    expect(g.actions.buyGenomeNode('doubleRings')).toBe(true);
    expect(g.actions.buyGenomeNode('doubleRings')).toBe(false);
    expect(g.actions.buyGenomeNode('tripleRings')).toBe(true);
    expect(g.actions.buyGenomeNode('secondChannel')).toBe(false);
    expect(g.actions.buyGenomeNode('flow')).toBe(false);
    expect(g.actions.buyGenomeNode('mutations')).toBe(true);
    expect(g.actions.buyGenomeNode('symbiosis')).toBe(true);
    expect(g.actions.buyGenomeNode('predation')).toBe(false);
    const nodes = g.view().genomeNodes;
    expect(nodes.length).toBe(11);
    expect(nodes.filter((n) => n.comingSoon).map((n) => n.id).sort()).toEqual(['flow', 'predation', 'secondChannel']);
  });
});
