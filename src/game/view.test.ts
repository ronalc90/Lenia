/**
 * Classic Era loop (Laboratorio, Calibrar, Genoma, Extinción): no player reaches it any more (createGame's
 * default is the sessions cycle, ADR-026, which migrates old classic saves); the code is still there and is tested
 * here explicitly with `cycle: 'classic'` until it is deleted (ADR-028). The sessions cycle has its own tests (sessions.test.ts,
 * spacing.test.ts, dish.test.ts, tests/unit/ranking-sessions.test.ts…).
 */
import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import { creature, GYRO_SIG, ORBIUM_SIG, recordingBus, report, seededRng } from './testUtil';

describe('creature views', () => {
  it('carry the detector velocity (cells per step) and never a non-finite one', () => {
    const { bus } = recordingBus();
    const g = createGame({ cycle: 'classic', bus, rng: seededRng(4) });
    g.tick(
      0.1,
      report([
        creature({ id: 1, x: 20, vx: 0.25, vy: -0.1 }),
        creature({ id: 2, x: 120, vx: Number.NaN, vy: Number.POSITIVE_INFINITY }),
      ]),
    );
    const views = g.view().creatures;
    const a = views.find((c) => c.id === 1)!;
    const b = views.find((c) => c.id === 2)!;
    expect([a.vx, a.vy]).toEqual([0.25, -0.1]);
    expect([b.vx, b.vy]).toEqual([0, 0]);
  });
});

describe('purchases', () => {
  it('an absurd (infinite) bank never turns essence into NaN when buying ×max', () => {
    const { bus } = recordingBus();
    const g = createGame({ cycle: 'classic', bus, rng: seededRng(9) });
    const st = g.state as unknown as { essence: number; unlocked: string[] };
    st.unlocked.push('autoSeeder');
    st.essence = Number.POSITIVE_INFINITY;
    g.actions.buyUpgrade('autoSeeder', 'max');
    expect(Number.isNaN(g.state.essence)).toBe(false);
  });
});

describe('explaining production (owner: "explain why they are different"; QA3 #13)', () => {
  it('each paying creature and species carries its yield factors; the multiplier parts multiply to global', () => {
    const { bus } = recordingBus();
    const g = createGame({ cycle: 'classic', bus, rng: seededRng(31) });
    const rep = report([
      creature({ id: 1, x: 20, signature: ORBIUM_SIG, behavior: 'swimmer', complexity: 1 }),
      creature({ id: 2, x: 120, signature: ORBIUM_SIG, behavior: 'swimmer', complexity: 1 }),
      creature({ id: 3, x: 60, y: 160, signature: GYRO_SIG, behavior: 'spinner', complexity: 1.4 }),
    ]);
    for (let i = 0; i < 4; i++) g.tick(0.5, rep);
    const v = g.view();
    const orb = v.species.find((s) => s.catalogName === 'Orbium unicaudatus')!;
    expect(orb.production!.members).toBe(2);
    expect(orb.production!.diminishing).toBeCloseTo((1 + 0.85) / 2, 6);
    expect(orb.production!.behaviorMult).toBeCloseTo(1.6, 6);
    expect(orb.shapeLabel!.es).toBe('disco con cola');
    expect(orb.boostedBy!.map((b) => b.id)).toContain('swimAffinity');
    const gyro = v.species.find((s) => s.catalogName === 'Gyrorbium gyrans')!;
    expect(gyro.shapeLabel!.en).toBe('crescent');
    const c3 = v.creatures.find((c) => c.id === 3)!;
    expect(c3.yield!.complexity).toBeCloseTo(1.4, 6);
    expect(c3.yield!.speciesMult).toBeGreaterThan(1);
    // eps = complexity × behaviour × species × diminishing × symbiosis × global × buffs.
    const y = c3.yield!;
    expect(c3.eps).toBeCloseTo(y.complexity * y.behaviorMult * y.speciesMult * y.diminishing * y.symbiosis * v.multipliers!.global * v.multipliers!.buffs, 6);
    const parts = v.multipliers!.parts!;
    expect(parts.reduce((m, p) => m * p.mult, 1)).toBeCloseTo(v.multipliers!.global, 10);
    // An outside bonus (a secret) shows up as its own part.
    g.setBonus('secret:moon', { es: 'Luna llena', en: 'Full moon' }, 1.1);
    expect(g.view().multipliers!.parts!.find((p) => p.id === 'secret:moon')!.mult).toBe(1.1);
    expect(g.view().multipliers!.global).toBeCloseTo(v.multipliers!.global * 1.1, 10);
  });

  it('upgrade cards say how long until affordable; seeds still growing are flagged (QA2 H-05)', () => {
    const { bus } = recordingBus();
    const g = createGame({ cycle: 'classic', bus, rng: seededRng(32) });
    const st = g.state as unknown as { essence: number; charges: { free: number; guaranteed: number } };
    st.charges = { free: 0, guaranteed: 0 };
    const rep = report([creature({ id: 1 })]);
    for (let i = 0; i < 4; i++) g.tick(0.5, rep);
    st.essence = 0;
    const v = g.view();
    const dropper = v.upgrades.find((u) => u.id === 'dropper')!;
    expect(dropper.secondsToAfford).toBeCloseTo(dropper.cost / v.essencePerSec, 6);
    st.essence = 1e6;
    expect(g.view().upgrades.find((u) => u.id === 'dropper')!.secondsToAfford).toBe(0);
    expect(g.view().seedsGrowing).toBe(false);
    for (let i = 0; i < 4; i++) g.actions.seedAt(30 + 40 * i, 200);
    expect(g.view().seedsGrowing).toBe(true);
  });
});
