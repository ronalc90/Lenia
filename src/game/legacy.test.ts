import { describe, expect, it } from 'vitest';
import * as C from './cycleBalance';
import { LEGACY_WELCOME, migrateLegacy, type LegacyState } from './legacy';
import { validateResearch } from './session';
import { TREE_BY_ID, nodeLevel, ringNight, treeStates } from './tree';

const base = (p: Partial<LegacyState> = {}): LegacyState => ({
  era: 1,
  genome: 0,
  genomeSpent: 0,
  samples: 0,
  eraEssence: 0,
  upgrades: {},
  nodes: [],
  species: [],
  stats: { totalEssence: 0 },
  ...p,
});

/** Every owned node has its prerequisites and sits in a ring the night has opened. */
function consistent(levels: Record<string, number>): void {
  const night = nodeLevel(levels, 'lab');
  for (const [id, l] of Object.entries(levels)) {
    if (id === 'lab' || l < 1) continue;
    const def = TREE_BY_ID[id];
    expect(def, id).toBeDefined();
    expect(night, `${id} ring`).toBeGreaterThanOrEqual(ringNight(def.ring));
    for (const r of def.requires) expect(nodeLevel(levels, r), `${id} needs ${r}`).toBeGreaterThanOrEqual(1);
    expect(l).toBeLessThanOrEqual(def.maxLevel);
  }
}

describe('old saves become the session loop', () => {
  it('a new old save gets night 1, no nodes and the welcome gift', () => {
    const { research, report } = migrateLegacy(base());
    expect(research.levels).toEqual({ lab: 1 });
    expect(research.datos).toBe(LEGACY_WELCOME);
    expect(report.refunded).toBe(0);
  });

  it('turns Lab upgrades into owned nodes with their prerequisites, refunding what the night has not opened', () => {
    const { research, report } = migrateLegacy(
      base({
        upgrades: { dropper: 3, calibrator: 2, dish: 1, culture: 4, stabilizer: 3, autoSeeder: 5, generator: 2 },
        species: new Array(6).fill({}),
        stats: { totalEssence: 250000, epsPeak: 80, stablePeak: 7 },
      }),
    );
    expect(research.levels.dropper).toBe(3);
    expect(research.levels.worldCold).toBe(1); // Calibrador I–II → the worlds its knobs reached
    expect(research.levels.worldGyro).toBe(1);
    expect(research.levels.worldShields).toBeUndefined(); // ring 3: night 2 → refunded
    expect(research.levels.worldLegs).toBeUndefined();
    expect(research.world).toBe('gyro');
    expect(research.levels.culture).toBe(4);
    expect(research.levels.dish).toBe(1);
    expect(research.levels.stabilizer).toBeUndefined(); // ring 3: night 2
    expect(research.levels.autoSeeder).toBeUndefined();
    expect(report.refunded).toBeGreaterThan(0);
    expect(research.datos).toBe(report.gift + report.refunded);
    expect(research.records.eps).toBe(80);
    expect(research.records.creatures).toBe(7);
    consistent(research.levels);
    expect(validateResearch(JSON.parse(JSON.stringify(research)), (id) => !!TREE_BY_ID[id])).toEqual(research);
  });

  it('keeps the era as the night and the Genome as rules and Datos', () => {
    const { research, report } = migrateLegacy(
      base({ era: 4, genome: 6, genomeSpent: 23, nodes: ['doubleRings', 'tripleRings', 'essenceStart', 'persistentSeeder', 'symbiosis'], upgrades: { calibrator: 4, microscope: 3 } }),
    );
    expect(nodeLevel(research.levels, 'lab')).toBe(4);
    expect(research.levels.worldGiants).toBe(1); // Anillos dobles/triples → Gigantes (ring 5 opens on night 4)
    expect(research.world).toBe('giants');
    expect(research.levels.worldHelix).toBe(1); // Calibrador III–IV
    expect(research.levels.worldShields).toBe(1); // …and the worlds before it, free
    expect(research.levels.worldGyro).toBe(1);
    expect(research.levels.symbiosis).toBe(1);
    expect(research.levels.colonyAffinity).toBe(1); // the steps before Simbiosis, free
    expect(research.levels.microscope).toBe(2);
    expect(research.levels.autoSeeder).toBe(3);
    expect(research.levels.freeSeeds).toBe(1);
    expect(research.sessions).toBe(C.NIGHT_GATES[2].sessions);
    expect(report.gift).toBeGreaterThanOrEqual(LEGACY_WELCOME + 6 * 10 + 23 * 5);
    consistent(research.levels);
    // The tree reads it without surprises: nothing owned is shown as a mystery.
    const st = treeStates({ levels: research.levels, datos: research.datos, sessions: research.sessions, species: 0 });
    for (const [id, l] of Object.entries(research.levels)) if (l > 0) expect(st.get(id)!.status, id).toBe('owned');
  });

  it('survives damaged input', () => {
    const { research } = migrateLegacy({ era: NaN, genome: -3, genomeSpent: Infinity, upgrades: { dropper: -1, nope: 4 }, nodes: [], species: [], stats: { totalEssence: -1 } } as unknown as LegacyState);
    expect(research.levels).toEqual({ lab: 1 });
    expect(Number.isFinite(research.datos)).toBe(true);
  });
});
