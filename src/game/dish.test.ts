import { describe, expect, it } from 'vitest';
import { dishForGrid, insideDish, rimDistance } from '../core/dish';
import * as B from './balance';
import { createGame, type Game } from './game';
import { creature, recordingBus, report, run, seededRng } from './testUtil';

/** The round walled dish (ADR-025): the live game's square grid with a rim. */
const N = 232;
const R = 13;
type St = { essence: number; charges: { free: number; guaranteed: number } };
const st = (g: Game) => g.state as unknown as St;

/** A game on a round dish: the sessions cycle (what players play) unless a test asks for 'classic'. */
function dishGame(seed: number, diameter = 96, cycle: 'sessions' | 'classic' = 'sessions') {
  const { bus, count, log } = recordingBus();
  const g = createGame({ bus, rng: seededRng(seed), grid: { w: N, h: N }, cycle });
  const dish = dishForGrid(N, N, diameter);
  g.setDish(dish);
  return { g, dish, count, log };
}

describe('round dish (ADR-025)', () => {
  it('a tap on the glass or beyond it plants the spore inside, its body clear of the rim', () => {
    const { g, dish } = dishGame(1);
    st(g).charges = { free: 5, guaranteed: 0 };
    for (const [x, y] of [
      [dish.cx + dish.radius + 30, dish.cy],
      [dish.cx, dish.cy - dish.radius + 2],
      [3, 3],
    ]) {
      const spec = g.actions.seedAt(x, y)!;
      expect(spec).not.toBeNull();
      expect(rimDistance(dish, spec.x, spec.y)).toBeGreaterThanOrEqual(spec.radius + B.SEED_RIM_MARGIN * R - 1e-6);
      g.tick(B.SEED_SPACING_MEMORY + 0.1, report([]));
    }
    expect(g.view().dish).toEqual(dish);
  });

  it('distances do not wrap: creatures on opposite sides of the grid do not crowd a tap', () => {
    const { g, dish } = dishGame(2, 224);
    st(g).charges = { free: 1, guaranteed: 0 };
    // On a torus of 232 these two are 6 cells apart; in the dish they are far.
    const c = creature({ id: 1, x: dish.cx - 107, y: dish.cy, radius: 6 });
    g.tick(0.1, report([c]));
    const spec = g.actions.seedAt(dish.cx + 105, dish.cy)!;
    expect(spec).not.toBeNull();
    expect(insideDish(dish, spec.x, spec.y)).toBe(true);
  });

  it('the golden spark spawns inside the glass and bounces off it for its whole life', () => {
    // Classic timing (B.GOLDEN_*); the sessions Spark (from session SPARK_FROM_SESSION) is in sessions.test.ts.
    const { g, dish, count } = dishGame(3, 96, 'classic');
    const rep = report([creature({ id: 1, x: dish.cx, y: dish.cy })]);
    g.tick(0.1, rep);
    let seen = 0;
    for (let t = 0; t < B.GOLDEN_FIRST_DELAY[1] + B.GOLDEN_LIFE + 5; t += 0.1) {
      g.tick(0.1, rep);
      const s = g.view().golden;
      if (!s) continue;
      seen++;
      expect(insideDish(dish, s.x, s.y, B.GOLDEN_RIM_MARGIN * R - 1e-6)).toBe(true);
    }
    expect(count('goldenSpawn')).toBeGreaterThan(0);
    expect(seen).toBeGreaterThan(50);
  });

  it('back on the torus (setDish(null)) the old rules hold', () => {
    const { g } = dishGame(4);
    g.setDish(null);
    expect(g.view().dish).toBeNull();
    run(g, 1, report([]), 0.5);
  });
});

describe('"Muy cerca" only near matter you can see (owner, live v0.014)', () => {
  it('a creature that swam away from where it was planted does not leave an invisible obstacle', () => {
    const { g, dish, count } = dishGame(7, 128);
    st(g).charges = { free: 5, guaranteed: 0 };
    const at = { x: dish.cx, y: dish.cy };
    const spec = g.actions.seedAt(at.x, at.y)!;
    expect(spec).not.toBeNull();
    // The detector sees it born there, then it swims 40 cells away within the spacing memory.
    g.tick(0.1, report([creature({ id: 1, x: spec.x, y: spec.y, state: 'born' })], [], 10));
    g.tick(0.1, report([creature({ id: 1, x: spec.x - 40, y: spec.y - 40, state: 'born' })], [], 40));
    // A tap on the now empty spot is not refused.
    const again = g.actions.seedAt(spec.x, spec.y);
    expect(count('seedBlocked')).toBe(0);
    expect(again).not.toBeNull();
    expect(Math.hypot(again!.x - spec.x, again!.y - spec.y)).toBeLessThan(1e-6);
  });

  it('a spore that faded away frees its spot as soon as the detector has looked twice', () => {
    const { g, dish, count } = dishGame(8, 128);
    st(g).charges = { free: 5, guaranteed: 0 };
    const spec = g.actions.seedAt(dish.cx, dish.cy)!;
    g.tick(0.1, report([], [], 10));
    g.tick(0.1, report([], [], 30));
    expect(g.actions.seedAt(spec.x, spec.y)).not.toBeNull();
    expect(count('seedBlocked')).toBe(0);
  });

  it('a refusal points at the matter that is in the way', () => {
    const { g, dish, log } = dishGame(9, 128);
    st(g).charges = { free: 5, guaranteed: 0 };
    // The whole Placa route, so ten creatures fit: the tap is refused for lack of space, not room.
    (g.state as unknown as { research: { levels: Record<string, number> } }).research.levels = { lab: 1, dish: 2, dishXL: 1, slots: 3, crowdCost: 2 };
    g.setDeviceDish(Infinity); // re-reads the tree
    // A crowd around the tap so no spot within SEED_RELOCATE·R is free.
    const ring = Array.from({ length: 9 }, (_, i) => creature({ id: 10 + i, x: dish.cx + 20 * Math.cos(i * 0.7), y: dish.cy + 20 * Math.sin(i * 0.7), radius: 9 }));
    g.tick(0.1, report([creature({ id: 1, x: dish.cx + 6, y: dish.cy, radius: 9 }), ...ring], [], 10));
    expect(g.actions.seedAt(dish.cx, dish.cy)).toBeNull();
    const e = log.get('seedBlocked')!.at(-1) as { reason: string; near?: { x: number; y: number } };
    expect(e.reason).toBe('tooClose');
    expect(e.near).toEqual({ x: dish.cx + 6, y: dish.cy, r: expect.any(Number), id: expect.any(Number) });
  });
});
