/**
 * The Sembrar button (ADR-031, docs/MECANICAS.md §3.1, §4): the game picks the safest spot (or the nearest safe
 * spot to a drag) and never refuses a seed for spacing while a spot has room (none: refused for free, never sown
 * unsafe); a seed that never takes gives back what it cost, and after
 * SEED_FAIL_PITY failures in a row the next one is sure.
 */
import { describe, expect, it } from 'vitest';
import type { GameEvents } from '../core/bus';
import type { Creature } from '../core/types';
import * as B from './balance';
import * as C from './cycleBalance';
import { createGame, type Game } from './game';
import type { GameState } from './state';
import { creature, recordingBus, report, seededRng } from './testUtil';

const R = 13;
const DISH = { cx: 96, cy: 96, radius: 90 };
const st = (g: Game) => g.state as unknown as GameState;

/** A sessions game on a round dish whose clock runs, every free and sure seed used up. */
function sowingGame(seed = 1) {
  const rec = recordingBus();
  const g = createGame({ bus: rec.bus, rng: seededRng(seed), cycle: 'sessions', grid: { w: 192, h: 192 } });
  g.setDish(DISH);
  g.actions.startClock!(); // the clock runs without a seed of its own
  g.tick(0.1, report([]));
  // Lots of room on the dish and in the nursery, no free or sure seeds left.
  (g.state as unknown as { research: { levels: Record<string, number> } }).research.levels = { lab: 1, dish: 2, slots: 3, nursery: 1 };
  g.setDeviceDish(Infinity);
  st(g).charges = { free: 0, guaranteed: 0 };
  st(g).essence = 1000;
  return { g, ...rec };
}

/** The matter a seed must keep clear of (game.ts seedObstacles): every body, as the spacing rule sizes it. */
const bodyR = (c: Creature) => Math.max(B.SEED_BODY_MIN_R * R, B.SEED_BODY_FROM_RG * c.radius);
/** Luz that came in as gifts (the first seed's «+5 · primera semilla»): not part of a seed's price. */
const gifts = (log: Map<keyof GameEvents, unknown[]>) => ((log.get('luzGift') ?? []) as GameEvents['luzGift'][]).reduce((a, e) => a + e.amount, 0);

describe('the Sembrar button (ADR-031)', () => {
  it('sow places a seed clear of every body, its path and the glass', () => {
    const { g } = sowingGame();
    const still = creature({ id: 1, x: 96, y: 96, radius: 6 });
    // A swimmer heading right, along y = 60 (its path is in the way too).
    const swimmer = creature({ id: 2, x: 40, y: 60, radius: 6, behavior: 'swimmer', vx: 0.5, vy: 0 });
    const others = [still, swimmer, creature({ id: 3, x: 140, y: 140, radius: 6 })];
    g.tick(0.1, report(others, [], 100));
    const spot = g.view().sowSpot!;
    const spec = g.actions.sow!()!;
    expect(spec).not.toBeNull();
    expect([spec.x, spec.y]).toEqual([spot.x, spot.y]);
    const seedR = Math.max(spec.radius, spec.pattern ? Math.max(spec.pattern.w, spec.pattern.h) / 2 : 0);
    for (const c of others) expect(Math.hypot(spec.x - c.x, spec.y - c.y)).toBeGreaterThanOrEqual(seedR + bodyR(c) + B.SEED_GAP * R - 1e-6);
    // Clear of the swimmer's path: every point of its next SEED_PATH_LOOKAHEAD_STEPS steps.
    for (let t = 0; t <= B.SEED_PATH_LOOKAHEAD_STEPS; t += 5)
      expect(Math.hypot(spec.x - (swimmer.x + swimmer.vx * t), spec.y - (swimmer.y + swimmer.vy * t)), `path at ${t}`).toBeGreaterThan(seedR + B.SEED_GAP * R);
    // Inside the glass, with room for its body.
    expect(Math.hypot(spec.x - DISH.cx, spec.y - DISH.cy)).toBeLessThanOrEqual(DISH.radius - seedR - B.SEED_RIM_MARGIN * R + 1e-6);
  });

  it('on an empty dish the seed goes to the middle', () => {
    const { g } = sowingGame();
    g.tick(0.1, report([], [], 100));
    const spec = g.actions.sow!()!;
    expect(Math.hypot(spec.x - DISH.cx, spec.y - DISH.cy)).toBeLessThanOrEqual(R / 2);
  });

  it('a seed dragged onto a creature lands on the nearest safe spot and is never refused', () => {
    const { g, count } = sowingGame();
    const crowd = [0, 1, 2, 3].map((i) => creature({ id: i + 1, x: 96 + Math.cos((i * Math.PI) / 2) * 18, y: 96 + Math.sin((i * Math.PI) / 2) * 18, radius: 6 }));
    g.tick(0.1, report(crowd, [], 100));
    // seedAt refuses a tap in the middle of the crowd; the button's drag never does.
    expect(g.actions.seedAt(96, 96)).toBeNull();
    const spec = g.actions.sow!({ at: { x: 96, y: 96 } })!;
    expect(spec).not.toBeNull();
    for (const c of crowd) expect(Math.hypot(spec.x - c.x, spec.y - c.y)).toBeGreaterThanOrEqual(R + bodyR(c) + B.SEED_GAP * R - 1e-6);
    // …the nearest one: no farther than the far side of the crowd.
    expect(Math.hypot(spec.x - 96, spec.y - 96)).toBeLessThan(18 + 2 * (R + bodyR(crowd[0]) + B.SEED_GAP * R));
    expect(count('seedBlocked')).toBe(1); // only seedAt's
  });

  it('a full dish refuses for free, and says so in the view', () => {
    const { g, log } = sowingGame();
    (g.state as unknown as { research: { levels: Record<string, number> } }).research.levels = { lab: 1 };
    g.setDeviceDish(Infinity);
    const full = Array.from({ length: C.DISH_CAPACITY[0] }, (_, i) => creature({ id: i + 1, x: 30 + 40 * i, y: 96 }));
    g.tick(0.1, report(full, [], 100));
    expect(g.view().sowSpot).toBeNull();
    const before = g.state.essence;
    expect(g.actions.sow!()).toBeNull();
    expect(g.state.essence).toBe(before);
    expect((log.get('seedBlocked') as GameEvents['seedBlocked'][]).at(-1)).toMatchObject({ reason: 'full' });
  });

  // Code review v0.027 #8: on a Ø128 dish (room for 3) with two swimmers the button sowed 40.1 cells from a swimmer's
  // centre where the spacing rule needs 43: «never refused» stamped a seed inside the margin when no spot had room.
  it('with no safe spot left the button sows nothing, for free, and says the dish has no room', () => {
    const rec = recordingBus();
    const g = createGame({ bus: rec.bus, rng: seededRng(1), cycle: 'sessions', grid: { w: 168, h: 168 } });
    g.setDish({ cx: 84, cy: 84, radius: 64 });
    g.actions.startClock!();
    g.tick(0.1, report([]));
    (g.state as unknown as { research: { levels: Record<string, number> } }).research.levels = { lab: 1 };
    g.setDeviceDish(Infinity);
    st(g).charges = { free: 0, guaranteed: 0 };
    st(g).essence = 1000;
    const n = C.DISH_CAPACITY[0] - 1; // under capacity: the dish is not counted full
    const swimmers = Array.from({ length: n }, (_, i) => {
      const a = (2 * Math.PI * i) / n;
      return creature({ id: i + 1, x: 84 + 30 * Math.cos(a), y: 84 + 30 * Math.sin(a), radius: 7, behavior: 'swimmer', vx: -0.5 * Math.sin(a), vy: 0.5 * Math.cos(a) });
    });
    g.tick(0.1, report(swimmers, [], 100));
    expect(g.view().seedPrice!.full).toBe(false);
    const fits = (spec: { x: number; y: number; radius: number; pattern?: { w: number; h: number } | null }) => {
      const seedR = Math.max(spec.radius, spec.pattern ? Math.max(spec.pattern.w, spec.pattern.h) / 2 : 0);
      return swimmers.every((c) => Math.hypot(spec.x - c.x, spec.y - c.y) >= seedR + bodyR(c) + B.SEED_GAP * R - 1e-6);
    };
    // A tap and a drag onto the middle: each one either fits or is refused, never stamped inside the margin.
    const tap = g.actions.sow!();
    const drag = g.actions.sow!({ at: { x: 84, y: 84 } });
    for (const spec of [tap, drag]) if (spec) expect(fits(spec)).toBe(true);
    // Here nothing fits: the button shows no spot (it greys and says why) and every refusal is free.
    expect(g.view().sowSpot).toBeNull();
    expect(tap).toBeNull();
    expect(drag).toBeNull();
    expect(g.state.essence).toBe(1000);
    const blocked = (rec.log.get('seedBlocked') ?? []) as GameEvents['seedBlocked'][];
    expect(blocked.map((e) => e.reason)).toEqual(['full', 'full']);
    expect(blocked.every((e) => e.crowded === true)).toBe(true);
  });

  it('a seed that never takes gives back what it cost', () => {
    const { g, log } = sowingGame();
    g.tick(0.1, report([], [], 100));
    const before = g.state.essence;
    const cost = g.view().seedCost;
    const spec = g.actions.sow!()!;
    expect(g.state.essence).toBeCloseTo(before - cost + gifts(log), 9);
    g.tick(0.1, report([creature({ id: 7, x: spec.x, y: spec.y, state: 'born', age: 20 })], [], 110));
    g.tick(0.1, report([], [{ type: 'died', id: 7, x: spec.x, y: spec.y }], 120));
    expect(g.state.essence).toBeCloseTo(before + gifts(log), 9);
    expect((log.get('seedRefund') as GameEvents['seedRefund'][])[0]).toMatchObject({ amount: cost, free: false, x: spec.x, y: spec.y });
    expect(g.session!.losses).toMatchObject({ refunds: 1, refunded: cost, fails: 1 });
  });

  it('a free seed that never takes gives the free seed back', () => {
    const { g, log } = sowingGame();
    st(g).charges = { free: 1, guaranteed: 0 };
    g.tick(0.1, report([], [], 100));
    const wallet = g.state.essence;
    const spec = g.actions.sow!()!;
    expect(st(g).charges.free).toBe(0);
    g.tick(0.1, report([creature({ id: 7, x: spec.x, y: spec.y, state: 'born', age: 20 })], [], 110));
    g.tick(0.1, report([creature({ id: 7, x: spec.x, y: spec.y, state: 'exploded', age: 80 })], [{ type: 'exploded', id: 7, x: spec.x, y: spec.y }], 120));
    expect(st(g).charges.free).toBe(1);
    expect(g.state.essence).toBe(wallet + gifts(log));
    expect((log.get('seedRefund') as GameEvents['seedRefund'][])[0]).toMatchObject({ amount: 0, free: true });
  });

  it('a seed that takes gives nothing back and clears the bad luck', () => {
    const { g, count } = sowingGame();
    g.tick(0.1, report([], [], 100));
    const a = g.actions.sow!()!;
    g.tick(0.1, report([creature({ id: 7, x: a.x, y: a.y, state: 'born', age: 20 })], [], 110));
    g.tick(0.1, report([], [{ type: 'died', id: 7, x: a.x, y: a.y }], 120));
    expect(g.view().seedLuck).toEqual({ fails: 1, need: C.SEED_FAIL_PITY });
    const b = g.actions.sow!()!;
    g.tick(0.1, report([creature({ id: 8, x: b.x, y: b.y, state: 'born', age: 20 })], [], 130));
    g.tick(0.1, report([creature({ id: 8, x: b.x, y: b.y, state: 'stable', age: 420 })], [], 140));
    expect(count('seedRefund')).toBe(1);
    expect(g.view().seedLuck).toEqual({ fails: 0, need: C.SEED_FAIL_PITY });
  });

  it('after two failures in a row the next seed is sure', () => {
    const { g } = sowingGame();
    let step = 100;
    g.tick(0.1, report([], [], step));
    for (let i = 0; i < C.SEED_FAIL_PITY; i++) {
      const s = g.actions.sow!()!;
      expect(s.bias === 1 && s.shape === 'pattern' && s.noise === 0).toBe(false);
      g.tick(0.1, report([creature({ id: 10 + i, x: s.x, y: s.y, state: 'born', age: 20 })], [], (step += 10)));
      g.tick(0.1, report([], [{ type: 'died', id: 10 + i, x: s.x, y: s.y }], (step += 10)));
    }
    expect(g.view().seedLuck).toEqual({ fails: C.SEED_FAIL_PITY, need: C.SEED_FAIL_PITY });
    const sure = g.actions.sow!()!;
    expect(sure).toMatchObject({ shape: 'pattern', bias: 1, noise: 0 });
    expect(g.view().seedLuck!.fails).toBe(0);
  });

  it('a seed the detector never sees gives back what it cost', () => {
    const { g, log } = sowingGame();
    g.tick(0.1, report([], [], 100));
    const before = g.state.essence;
    g.actions.sow!();
    g.tick(0.1, report([], [], 100 + C.STABLE_AGE_STEPS + 10));
    expect(g.state.essence).toBeCloseTo(before + gifts(log), 9);
    expect(log.get('seedRefund')).toHaveLength(1);
  });

  it('the button never sows onto a Nevera plant the detector has not reported yet', () => {
    const rec = recordingBus();
    const g = createGame({ bus: rec.bus, rng: seededRng(7001), grid: { w: 192, h: 240 }, cycle: 'sessions' });
    const plants: { x: number; y: number }[] = [];
    rec.bus.on('dishSeed', ({ specs }) => plants.push(...specs.map((p) => ({ x: p.x, y: p.y }))));
    // The first report comes late (a coarse detector cadence): the plant is on the dish, not in any report yet.
    g.tick(0.5, report([], [], 22));
    expect(plants.length).toBeGreaterThan(0);
    const spec = g.actions.sow!()!;
    for (const p of plants) {
      const dx = Math.min(Math.abs(spec.x - p.x), 192 - Math.abs(spec.x - p.x));
      const dy = Math.min(Math.abs(spec.y - p.y), 240 - Math.abs(spec.y - p.y));
      expect(Math.hypot(dx, dy)).toBeGreaterThan(2 * R + B.SEED_GAP * R);
    }
  });
});
