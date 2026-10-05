/**
 * Classic Era loop (Laboratorio, Calibrar, Genoma, Extinción): no player reaches it any more (createGame's
 * default is the sessions cycle, ADR-026, which migrates old classic saves); the code is still there and is tested
 * here explicitly with `cycle: 'classic'` until it is deleted (ADR-028). The sessions cycle has its own tests (sessions.test.ts,
 * spacing.test.ts, dish.test.ts, tests/unit/ranking-sessions.test.ts…).
 */
import { describe, expect, it } from 'vitest';
import * as B from './balance';
import { computeProduction, type ProductionCtx } from './economy';
import { createGame } from './game';
import { creature, GYRO_SIG, ORBIUM_SIG, recordingBus, report, run, SCUTIUM_SIG, seededRng } from './testUtil';

const baseCtx: ProductionCtx = {
  speciesOf: () => null,
  behaviorMult: (b) => (b ? B.BEHAVIOR_MULT[b] : 1),
  complexityMult: 1,
  globalMult: 1,
  symbiosis: false,
  R: 13,
  gridW: 192,
  gridH: 240,
};

describe('production formula', () => {
  it('no creatures → 0', () => {
    expect(computeProduction([], baseCtx).total).toBe(0);
  });

  it('born / exploded / dead creatures pay nothing', () => {
    const cs = [
      creature({ id: 1, state: 'born' }),
      creature({ id: 2, state: 'exploded', complexity: 50 }),
      creature({ id: 3, state: 'dead' }),
    ];
    expect(computeProduction(cs, baseCtx).total).toBe(0);
  });

  it('one unregistered stable Orbium (complexity 1) → exactly 1 essence/s', () => {
    expect(computeProduction([creature({ id: 1 })], baseCtx).total).toBeCloseTo(1, 10);
  });

  it('caps complexity at 3', () => {
    expect(computeProduction([creature({ id: 1, complexity: 40 })], baseCtx).total).toBeCloseTo(B.COMPLEXITY_CAP, 10);
  });

  it('applies behaviour multiplier', () => {
    expect(computeProduction([creature({ id: 1, behavior: 'swimmer' })], baseCtx).total).toBeCloseTo(1.6, 10);
  });

  it('diminishing returns: k-th creature of the same species yields 0.85^k', () => {
    const ctx = { ...baseCtx, speciesOf: () => ({ id: 'a', mult: 1 }) };
    const cs = [1, 2, 3].map((id) => creature({ id, x: id * 50 }));
    const r = computeProduction(cs, ctx);
    expect(r.total).toBeCloseTo(1 + 0.85 + 0.85 * 0.85, 10);
    // Different species do not decay each other.
    const ctx2 = { ...baseCtx, speciesOf: (id: number) => ({ id: `s${id}`, mult: 1 }) };
    expect(computeProduction(cs, ctx2).total).toBeCloseTo(3, 10);
  });

  it('symbiosis ×1.5 for two different species within 2R (wrap-aware)', () => {
    const ctx = { ...baseCtx, symbiosis: true, speciesOf: (id: number) => ({ id: `s${id}`, mult: 1 }) };
    const near = [creature({ id: 1, x: 2, y: 10 }), creature({ id: 2, x: 190, y: 10 })]; // 4 cells apart across the edge
    expect(computeProduction(near, ctx).total).toBeCloseTo(3, 10);
    const far = [creature({ id: 1, x: 10, y: 10 }), creature({ id: 2, x: 100, y: 120 })];
    expect(computeProduction(far, ctx).total).toBeCloseTo(2, 10);
  });
});

describe('game economy', () => {
  it('uniform dish / no creatures → no essence', () => {
    const { bus } = recordingBus();
    const g = createGame({ cycle: 'classic', bus, rng: seededRng(1) });
    const e0 = g.view().essence;
    run(g, 30, report([], [], 0));
    expect(g.view().essence).toBe(e0);
    expect(g.view().essencePerSec).toBe(0);
    // A dish-filling "exploded" soup pays 0 too.
    run(g, 30, report([creature({ id: 9, state: 'exploded', complexity: 0.01, mass: 40000 })]));
    expect(g.view().essence).toBe(e0);
  });

  it('one stable Orbium-like creature (complexity 1) → ~1 essence/s', () => {
    const { bus, count } = recordingBus();
    const g = createGame({ cycle: 'classic', bus, rng: seededRng(2) });
    const rep = report([creature({ id: 1 })]);
    g.tick(0.1, rep);
    const e0 = g.view().essence;
    run(g, 10, rep);
    const v = g.view();
    const expected = 1 * v.species[0].mult * v.multipliers!.global;
    expect(v.essencePerSec).toBeCloseTo(expected, 6);
    expect(v.essencePerSec).toBeGreaterThanOrEqual(1);
    expect(v.essencePerSec).toBeLessThan(1.5);
    expect(v.essence - e0).toBeCloseTo(10 * expected, 0);
    expect(count('income')).toBeGreaterThan(3);
    expect(count('income')).toBeLessThan(10); // at most one pop per 1.5 s
  });

  it('pause stops production', () => {
    const { bus } = recordingBus();
    const g = createGame({ cycle: 'classic', bus, rng: seededRng(3) });
    const rep = report([creature({ id: 1 })]);
    run(g, 2, rep);
    g.isPaused = true;
    const e0 = g.view().essence;
    run(g, 10, rep);
    expect(g.view().essence).toBe(e0);
  });

  it('registers distinct species, repeated species decay, catalog reveal sets rarity', () => {
    const { bus, count } = recordingBus();
    const g = createGame({
      cycle: 'classic',
      bus,
      rng: seededRng(4),
      catalogSignatures: [{ code: 'O2u', name: 'Orbium unicaudatus', signature: ORBIUM_SIG, mu: 0.15, sigma: 0.015, R: 13 }],
    });
    const cs = [
      creature({ id: 1, x: 20, y: 20 }),
      creature({ id: 2, x: 100, y: 20, signature: ORBIUM_SIG.map((v) => v * 1.02) }),
      creature({ id: 3, x: 20, y: 150, signature: SCUTIUM_SIG }),
      creature({ id: 4, x: 120, y: 150, signature: GYRO_SIG }),
    ];
    g.tick(0.5, report(cs));
    const v = g.view();
    expect(v.species.length).toBe(3);
    expect(count('speciesNew')).toBe(3);
    const orb = v.species.find((s) => s.catalogName === 'Orbium unicaudatus')!;
    expect(orb.rarity).toBe('common');
    expect(orb.timesSeen).toBe(2);
    expect(v.species.filter((s) => s.catalogName === null).every((s) => s.rarity === B.DEFAULT_RARITY)).toBe(true);
    // Samples: +1 per common/uncommon species.
    expect(v.samples).toBe(3);
    // Orbium pair: 1 + 0.85.
    const orbEps = v.creatures.filter((c) => c.speciesId === orb.id).map((c) => c.eps);
    orbEps.sort((a, b) => b - a);
    expect(orbEps[1] / orbEps[0]).toBeCloseTo(0.85, 6);
  });

  it('behaviour-first-seen bonuses and milestones', () => {
    const { bus, count } = recordingBus();
    const g = createGame({ cycle: 'classic', bus, rng: seededRng(5) });
    g.tick(0.5, report([creature({ id: 1 })]));
    const before = g.view();
    g.tick(0.5, report([creature({ id: 1, behavior: 'swimmer' })]));
    const after = g.view();
    expect(count('behaviorNew')).toBe(1);
    expect(after.behaviorsSeen).toEqual(['swimmer']);
    expect(after.samples).toBe(before.samples + B.SAMPLES_NEW_BEHAVIOR);
    expect(after.multipliers!.global).toBeGreaterThan(before.multipliers!.global * 1.09);
  });
});
