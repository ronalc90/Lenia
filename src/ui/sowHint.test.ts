import { describe, expect, it } from 'vitest';
import { safeSowSpot } from './sowHint';

const dish = { cx: 116, cy: 116, radius: 64 };
const R = 13;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('«¡Toca aquí!» points at a safe spot (QA-CLARIDAD-2 C3)', () => {
  it('keeps clear of the Nevera creature planted near the centre (it said «¡Cuidado! Se van a tocar»)', () => {
    const starter = { x: dish.cx + 6, y: dish.cy - 4, r: 9 };
    const p = safeSowSpot(dish, [starter], R);
    expect(dist(p, starter) - starter.r).toBeGreaterThanOrEqual(2.5 * R);
    // Inside the glass, never hugging it (a seed there goes dark: «muy pegada al cristal»).
    expect(dish.radius - dist(p, { x: dish.cx, y: dish.cy })).toBeGreaterThanOrEqual(1.5 * R);
  });

  it('stays off a swimmer’s path', () => {
    const swimmer = { x: dish.cx - 30, y: dish.cy, r: 8, vx: 0.6, vy: 0 };
    const p = safeSowSpot(dish, [swimmer], R, 60);
    // Not straight ahead of it (along y = cy, to its right).
    expect(Math.abs(p.y - dish.cy) > 2 * R || p.x < swimmer.x).toBe(true);
  });

  it('never under the bar and the notices at the top of the dish', () => {
    const low = { x: dish.cx, y: dish.cy + 40, r: 8 };
    const top = (_x: number, y: number) => y < dish.cy - 20;
    expect(safeSowSpot(dish, [low], R, 45, top).y).toBeGreaterThanOrEqual(dish.cy - 20);
  });

  it('an empty dish: the centre, as before', () => {
    expect(safeSowSpot(dish, [], R)).toEqual({ x: dish.cx, y: dish.cy });
  });
});
