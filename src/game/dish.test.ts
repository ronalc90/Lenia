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

function dishGame(seed: number, diameter = 96) {
  const { bus, count } = recordingBus();
  const g = createGame({ bus, rng: seededRng(seed), grid: { w: N, h: N } });
  const dish = dishForGrid(N, N, diameter);
  g.setDish(dish);
  return { g, dish, count };
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
    const { g, dish, count } = dishGame(3);
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
