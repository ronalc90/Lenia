import { describe, expect, it } from 'vitest';
import * as B from './balance';
import { createGame } from './game';
import { creature, GYRO_SIG, ORBIUM_SIG, recordingBus, report, run, seededRng } from './testUtil';

describe('progression layer', () => {
  it('journal entries unlock with milestones and can be marked read', () => {
    const { bus, log } = recordingBus();
    const g = createGame({ bus, rng: seededRng(1) });
    g.actions.seedAt(10, 10);
    g.tick(0.5, report([], [{ type: 'died', id: 99, x: 1, y: 1 }]));
    g.tick(0.5, report([], [{ type: 'exploded', id: 98, x: 1, y: 1 }]));
    g.tick(0.5, report([creature({ id: 1, behavior: 'swimmer' })]));
    const ids = g.view().journal.map((j) => j.id);
    expect(ids).toEqual(['firstSeed', 'firstDeath', 'firstExplosion', 'firstStable', 'firstSwimmer']);
    expect((log.get('journalNew') ?? []).length).toBe(5);
    expect(g.view().journal.every((j) => !j.read)).toBe(true);
    g.actions.markJournalRead('firstSeed');
    expect(g.view().journal[0].read).toBe(true);
    g.actions.markJournalRead();
    expect(g.view().journal.every((j) => j.read)).toBe(true);
  });

  it('objective chain advances and pays its reward', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(2) });
    expect(g.view().objective!.es).toContain('Toca la placa');
    const e0 = g.view().essence;
    const spec = g.actions.seedAt(10, 10)!;
    expect(spec).not.toBeNull();
    expect(g.view().essence).toBeCloseTo(e0 - 2 + B.OBJECTIVES[0].reward, 10);
    expect(g.view().objectiveProgress!.target).toBe(1);
    g.tick(0.5, report([creature({ id: 1 })]));
    expect(g.state.objective).toBe(2);
    g.actions.markSpeciesSeen(g.view().species[0].id);
    expect(g.state.objective).toBe(3);
    expect(g.view().species[0].isNew).toBe(false);
  });

  it('tabs appear progressively', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(3) });
    expect(g.view().tabs).toEqual({ lab: false, bestiary: false, calibrate: false, genome: false });
    g.actions.seedAt(10, 10);
    expect(g.view().tabs.lab).toBe(true);
    g.tick(0.5, report([creature({ id: 1 })]));
    expect(g.view().tabs.bestiary).toBe(true);
    (g.state as { essence: number }).essence = 1e4;
    expect(g.actions.buyUpgrade('calibrator', 1)).toBe(true);
    expect(g.view().tabs.calibrate).toBe(true);
    expect(g.view().tabs.genome).toBe(false);
    (g.state as { eraEssence: number }).eraEssence = 2e5;
    expect(g.view().tabs.genome).toBe(true);
  });

  it('achievements fire once and add a permanent bonus', () => {
    const { bus, count } = recordingBus();
    const g = createGame({ bus, rng: seededRng(4) });
    const m0 = g.view().multipliers!.global;
    g.actions.seedAt(10, 10);
    expect(count('achievement')).toBe(1);
    expect(g.view().achievements.find((a) => a.id === 'firstSeed')!.done).toBe(true);
    expect(g.view().multipliers!.global).toBeCloseTo(m0 * (1 + 0.01), 10);
    g.actions.seedAt(40, 40);
    expect(count('achievement')).toBe(1);
    expect(g.view().achievements.length).toBeGreaterThanOrEqual(25);
  });

  it('brush (Gotero III) lays dabs along a stroke and charges per dab', () => {
    const { bus } = recordingBus();
    let ms = 0;
    const g = createGame({ bus, rng: seededRng(5), now: () => ms });
    expect(g.actions.brushAt(10, 10)).toEqual([]);
    const st = g.state as { upgrades: Record<string, number>; essence: number };
    st.upgrades.dropper = 3;
    st.essence = 1000;
    expect(g.actions.brushAt(10, 10).length).toBe(1);
    ms += 16;
    expect(g.actions.brushAt(11, 10).length).toBe(0); // closer than the spacing
    ms += 16;
    const dabs = g.actions.brushAt(10 + 13 * 2, 10); // 2R away → 4 dabs at R/2 spacing
    expect(dabs.length).toBe(4);
    expect(dabs[0].radius).toBeCloseTo(13 * B.BRUSH_RADIUS, 6);
    expect(g.view().essence).toBeLessThan(1000);
    g.actions.setSetting('oneTouch', true);
    expect(g.view().tools.brush).toBe(false);
  });

  it('seed shapes unlock with the Gotero and change bias/noise', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(6) });
    const st = g.state as { upgrades: Record<string, number>; essence: number; objective: number };
    st.essence = 1e5;
    st.objective = B.OBJECTIVES.length;
    g.actions.setSeedShape!('ring');
    expect(g.view().tools.shape).toBe('blob');
    st.upgrades.dropper = 5;
    expect(g.view().tools.shapes).toEqual(['blob', 'ring', 'noise']);
    const blob = g.actions.seedAt(10, 10)!;
    g.tick(2, report([]));
    g.actions.setSeedShape!('noise');
    const noise = g.actions.seedAt(80, 80)!;
    expect(noise.shape).toBe('noise');
    expect(noise.bias!).toBeLessThan(blob.bias!);
    expect(noise.noise).toBeGreaterThan(blob.noise);
  });

  it('Mutaciones: a mutated print that stabilises nearby registers a "var." species', () => {
    const { bus } = recordingBus();
    // rng: first calls are consumed by spawn timers etc.; force mutation with a low stream.
    const g = createGame({ bus, rng: () => 0.01, catalogSignatures: [] });
    g.tick(0.5, report([creature({ id: 1, x: 30, y: 30 })]));
    const parent = g.view().species[0];
    g.setSpeciesPortrait(parent.id, { w: 20, h: 20, data: new Float32Array(400).fill(0.6) });
    const st = g.state as { genome: number; samples: number };
    st.genome = 100;
    st.samples = 10;
    expect(g.actions.buyGenomeNode('mutations')).toBe(true);
    const spec = g.actions.printAt(parent.id, 120, 150)!;
    expect(spec.noise).toBeGreaterThan(0);
    expect(spec.pattern!.w).not.toBe(20); // rescaled
    g.tick(0.5, report([creature({ id: 1, x: 30, y: 30 }), creature({ id: 2, x: 121, y: 151, signature: GYRO_SIG })]));
    const v = g.view();
    expect(v.species.length).toBe(2);
    expect(v.species[1].name.endsWith(' var.')).toBe(true);
    expect(g.state.stats.variants).toBe(1);
  });

  it('Simbiosis: two different species within 2R boost each other in the game', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(8) });
    const near = report([creature({ id: 1, x: 50, y: 50 }), creature({ id: 2, x: 60, y: 50, signature: GYRO_SIG })]);
    g.tick(0.5, near);
    g.tick(0.5, near); // achievements unlocked by the first tick are priced in from the second
    const before = g.view();
    (g.state as { genome: number }).genome = 100;
    g.actions.buyGenomeNode('mutations');
    g.actions.buyGenomeNode('symbiosis');
    g.tick(0.5, near);
    g.tick(0.5, near);
    const after = g.view();
    const globalRatio = after.multipliers!.global / before.multipliers!.global;
    expect(after.essencePerSec / before.essencePerSec).toBeCloseTo(B.SYMBIOSIS_MULT * globalRatio, 8);
    // Far apart: no symbiosis.
    const far = report([creature({ id: 1, x: 10, y: 10 }), creature({ id: 2, x: 100, y: 130, signature: GYRO_SIG })]);
    g.tick(0.5, far);
    expect(g.view().essencePerSec).toBeCloseTo(after.essencePerSec / B.SYMBIOSIS_MULT, 6);
  });

  it('settings are validated; speed only from unlocked Incubadora levels', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(9), catalogSignatures: [] });
    expect(g.view().settings.lang).toBe('es');
    g.actions.setSetting('lang', 'en');
    g.actions.setSetting('lang', 'fr' as 'en');
    g.actions.setSetting('sfxVolume', 7);
    g.actions.setSetting('musicVolume', 0.2);
    const st = g.view().settings;
    expect(st.lang).toBe('en');
    expect(st.sfxVolume).toBe(0.7);
    expect(st.musicVolume).toBe(0.2);
    g.actions.setSpeed(2);
    expect(g.speed).toBe(1);
    (g.state as { upgrades: Record<string, number> }).upgrades.incubator = 2;
    g.actions.setSpeed(4);
    expect(g.speed).toBe(4);
    expect(g.view().tools.speeds).toEqual([1, 2, 4]);
    // Species names follow the language.
    g.tick(0.5, report([creature({ id: 1, signature: ORBIUM_SIG })]));
    expect(g.view().species[0].name).toBe('Specimen 1');
  });

  it('species signature: unknown dynamic features (-1) never pollute the running average', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(12) });
    const k = ORBIUM_SIG.length - 3;
    const young = ORBIUM_SIG.map((v, i) => (i >= k ? -1 : v));
    g.tick(0.5, report([creature({ id: 1, signature: young })]));
    expect(g.state.species[0].signature.slice(k)).toEqual([-1, -1, -1]);
    g.tick(0.5, report([creature({ id: 1, signature: ORBIUM_SIG, behavior: 'swimmer' })]));
    expect(g.state.species[0].signature.slice(k)).toEqual(ORBIUM_SIG.slice(k));
    g.tick(0.5, report([creature({ id: 1, signature: ORBIUM_SIG, behavior: 'swimmer' }), creature({ id: 2, x: 140, signature: young })]));
    expect(g.state.species.length).toBe(1);
    expect(g.state.species[0].timesSeen).toBe(2);
    expect(g.state.species[0].signature.every((v) => v >= 0)).toBe(true);
  });

  it('reset keeps settings, clears progress and asks to clear the dish', () => {
    const { bus, count } = recordingBus();
    const g = createGame({ bus, rng: seededRng(10) });
    g.actions.setSetting('lang', 'en');
    run(g, 5, report([creature({ id: 1 })]));
    g.reset();
    expect(g.view().species.length).toBe(0);
    expect(g.view().essence).toBe(B.START_ESSENCE);
    expect(g.view().settings.lang).toBe('en');
    expect(count('dishClear')).toBe(1);
  });
});
