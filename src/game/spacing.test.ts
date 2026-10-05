import { describe, expect, it } from 'vitest';
import type { GameEvents } from '../core/bus';
import * as B from './balance';
import { createGame, type Game } from './game';
import { wrapDist } from './economy';
import { creature, recordingBus, report, run, seededRng } from './testUtil';

const R = 13;
type St = { essence: number; charges: { free: number; guaranteed: number }; objective: number; upgrades: Record<string, number> };
const st = (g: Game) => g.state as unknown as St;
/** Room rule: the gap between the stamped matter (≈ R for a spore) and a body (1.5 × rg). */
const roomy = (x: number, y: number, c: { x: number; y: number; radius: number }) =>
  wrapDist(x, y, c.x, c.y, 192, 240) >= R + Math.max(B.SEED_BODY_MIN_R * R, B.SEED_BODY_FROM_RG * c.radius) + B.SEED_GAP * R - 1e-6;

describe('seed spacing (spores stamped next to other matter fuse into a maze)', () => {
  it('a tap next to a creature is moved to the nearest spot with room, within 2 R', () => {
    const { bus, log } = recordingBus();
    const g = createGame({ bus, rng: seededRng(1), grid: { w: 192, h: 240 } });
    st(g).charges = { free: 0, guaranteed: 0 };
    const c = creature({ id: 1, x: 100, y: 120, radius: 6 });
    g.tick(0.1, report([c]));
    const spec = g.actions.seedAt(130, 120)!; // 30 cells away: too close
    expect(spec).not.toBeNull();
    expect(roomy(spec.x, spec.y, c)).toBe(true);
    expect(wrapDist(spec.x, spec.y, 130, 120, 192, 240)).toBeLessThanOrEqual(B.SEED_RELOCATE * R + 1e-6);
    const seed = (log.get('seed') as GameEvents['seed'][])[0];
    expect(seed.from).toEqual({ x: 130, y: 120 });
    expect([seed.x, seed.y]).toEqual([spec.x, spec.y]);
    // A tap with room stays where it was.
    g.tick(B.SEED_SPACING_MEMORY + 0.1, report([c]));
    const far = g.actions.seedAt(20, 20)!;
    expect([far.x, far.y]).toEqual([20, 20]);
  });

  it('a tap on a crowd is refused: nothing charged, no charge used, seedBlocked emitted', () => {
    const { bus, count, log } = recordingBus();
    const g = createGame({ bus, rng: seededRng(2), grid: { w: 192, h: 240 } });
    const crowd = [0, 1, 2, 3, 4, 5].map((i) => creature({ id: i + 1, x: 96 + Math.cos(i) * 18, y: 120 + Math.sin(i) * 18, radius: 6 }));
    g.tick(0.1, report(crowd));
    const before = { essence: g.state.essence, charges: { ...st(g).charges } };
    expect(g.actions.seedAt(96, 120)).toBeNull();
    expect(count('seedBlocked')).toBe(1);
    expect((log.get('seedBlocked') as GameEvents['seedBlocked'][])[0]).toMatchObject({ x: 96, y: 120, reason: 'tooClose', near: { x: expect.any(Number), y: expect.any(Number) } });
    // QA4 F-13: it names the creature in the way, so the warning follows it as it swims on.
    const near = (log.get('seedBlocked') as GameEvents['seedBlocked'][])[0].near!;
    expect(crowd.map((c) => c.id)).toContain(near.id);
    expect(count('seed')).toBe(0);
    expect(g.state.essence).toBe(before.essence);
    expect(st(g).charges).toEqual(before.charges);
    expect(g.state.stats.seeds).toBe(0);
  });

  it('the guaranteed first seed of a new game lands where the player tapped', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(3) });
    const spec = g.actions.seedAt(70, 90)!;
    expect(spec.bias).toBe(1);
    expect([spec.x, spec.y]).toEqual([70, 90]);
  });

  it('seeds the detector has not reported yet keep their spot for a few seconds', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(4) });
    st(g).charges = { free: 0, guaranteed: 0 };
    st(g).essence = 1e6;
    const a = g.actions.seedAt(96, 120)!;
    const b = g.actions.seedAt(96, 120); // same spot at once
    if (b) expect(wrapDist(a.x, a.y, b.x, b.y, 192, 240)).toBeGreaterThanOrEqual(2 * R + B.SEED_GAP * R - 1e-6);
    g.tick(B.SEED_SPACING_MEMORY + 0.1, report([])); // they dissolved unseen
    const c = g.actions.seedAt(96, 120)!;
    expect([c.x, c.y]).toEqual([96, 120]);
  });

  it('the auto-seeder (and golden spore rain, same free-spot search) and prints respect the same room', () => {
    const { bus, log } = recordingBus();
    const g = createGame({ bus, rng: seededRng(5), grid: { w: 192, h: 240 } });
    st(g).charges = { free: 0, guaranteed: 0 };
    st(g).essence = 1e9;
    st(g).upgrades.autoSeeder = 30;
    const cs = [creature({ id: 1, x: 40, y: 40, radius: 6 }), creature({ id: 2, x: 140, y: 60, radius: 6 }), creature({ id: 3, x: 90, y: 180, radius: 6 })];
    run(g, 20, report(cs), 0.5);
    const auto = ((log.get('dishSeed') ?? []) as GameEvents['dishSeed'][]).flatMap((e) => e.specs);
    expect(auto.length).toBeGreaterThan(0);
    for (const s of auto) for (const c of cs) expect(roomy(s.x, s.y, c)).toBe(true);
    // Prints: a tap on top of a creature is moved off it.
    st(g).upgrades.autoSeeder = 0;
    const g2 = createGame({ bus: recordingBus().bus, rng: seededRng(6), catalogSignatures: [{ code: 'O2u', name: 'Orbium unicaudatus', signature: [1, 1, 1, 1], mu: 0.15, sigma: 0.015, R: 13 }] });
    g2.tick(0.5, report([creature({ id: 1, x: 100, y: 100, signature: [1, 1, 1, 1] })]));
    (g2.state as unknown as { samples: number }).samples = 10;
    const p = g2.actions.printAt(g2.view().species[0].id, 125, 100)!;
    expect(p).not.toBeNull();
    expect(wrapDist(p.x, p.y, 125, 100, 192, 240)).toBeGreaterThan(0); // moved off the creature
    expect(wrapDist(p.x, p.y, 100, 100, 192, 240)).toBeGreaterThanOrEqual(Math.max(p.pattern!.w, p.pattern!.h) / 2 + B.SEED_GAP * R);
    // Right on top of it there is no room within 2 R: refused, Muestras kept.
    const samples = (g2.state as unknown as { samples: number }).samples;
    expect(g2.actions.printAt(g2.view().species[0].id, 100, 100)).toBeNull();
    expect((g2.state as unknown as { samples: number }).samples).toBe(samples);
  });
});

describe('the nursery (QA2 H-05: "⏳ Espera…")', () => {
  it('the auto-seeder waits while enough spores are forming; the spore rain banks what does not fit', () => {
    const { bus, log } = recordingBus();
    const g = createGame({ bus, rng: seededRng(8), grid: { w: 192, h: 240 } });
    st(g).charges = { free: 0, guaranteed: 0 };
    st(g).essence = 1e9;
    st(g).upgrades.autoSeeder = 30;
    const forming = Array.from({ length: B.SEED_NURSERY_MAX }, (_, i) => creature({ id: i + 1, x: 30 + 60 * i, y: 40, state: 'born', age: 100, radius: 5 }));
    run(g, 10, report(forming), 0.5);
    expect(log.get('dishSeed') ?? []).toHaveLength(0);
    expect(g.view().seedsGrowing).toBe(true);
    // A tap is refused for free too.
    const e0 = g.state.essence;
    expect(g.actions.seedAt(100, 200)).toBeNull();
    expect((log.get('seedBlocked') as GameEvents['seedBlocked'][]).at(-1)!.reason).toBe('growing');
    expect(g.state.essence).toBe(e0);
    // Once they are stable, seeding goes on.
    run(g, 10, report(forming.map((c) => ({ ...c, state: 'stable' as const }))), 0.5);
    expect((log.get('dishSeed') ?? []).length).toBeGreaterThan(0);
  });
});

describe('dissolved matter is not a dead creature', () => {
  it('an exploded component that vanishes (lysis, clean-up) dissolves: no death, no "it died" moment', () => {
    const { bus, count } = recordingBus();
    const g = createGame({ bus, rng: seededRng(7) });
    g.tick(0.1, report([creature({ id: 9, state: 'exploded' })]));
    g.tick(0.1, report([], [{ type: 'died', id: 9, x: 50, y: 50 }]));
    expect(count('creatureDied')).toBe(0);
    expect(count('creatureDissolved')).toBe(1);
    expect(g.state.stats.deaths).toBe(0);
    expect(g.state.stats.dissolved).toBe(1);
    expect(g.state.journal.some((j) => j.id === 'firstDeath')).toBe(false);
    // A real creature that dies still counts.
    g.tick(0.1, report([creature({ id: 10 })]));
    g.tick(0.1, report([], [{ type: 'died', id: 10, x: 50, y: 50 }]));
    expect(count('creatureDied')).toBe(1);
    expect(g.state.stats.deaths).toBe(1);
  });
});

describe('a seed never lands in front of a swimmer (QA4: the starter died fused with a child\'s seeds)', () => {
  it('a tap on the path a swimmer will take in the next second is moved off it or refused', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(7), grid: { w: 192, h: 240 } });
    st(g).charges = { free: 0, guaranteed: 0 };
    st(g).essence = 1000;
    const c = creature({ id: 1, x: 60, y: 120, radius: 6, vx: 0.6, vy: 0 });
    g.tick(0.1, report([c]));
    // 50 cells ahead: outside the plain spacing ring, but the swimmer gets there in ~80 steps.
    const spec = g.actions.seedAt(110, 120);
    if (spec) {
      // Wherever it landed, it is clear of the swimmer's next second (its path, not only where it is now).
      for (let k = 0; k <= B.SEED_PATH_LOOKAHEAD_STEPS; k += 10) expect(Math.abs(spec.y - 120) + Math.abs(spec.x - (60 + 0.6 * k)) > 2 * R).toBe(true);
      expect(Math.hypot(spec.x - 110, spec.y - 120)).toBeGreaterThan(1);
    }
  });
});
