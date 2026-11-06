import { describe, expect, it } from 'vitest';
import type { GameView } from '../core/types';
import { TEXT } from '../game/content';
import { NODE_TEXT } from '../game/treeText';
import { creature, makeView } from '../story/testUtil';
import { sowModel, sowRequest } from './sowButton';
import { SOW_KEEP_R, sowClearance } from './sowHint';

const dish = { cx: 116, cy: 116, radius: 64 };
const R = 13;

/** A running session-2 view on a round dish (ADR-031: the Sembrar button lives in the sessions cycle). */
function sessionView(over: Partial<GameView> = {}): GameView {
  return makeView({
    cycle: 'sessions',
    dish,
    essence: 40,
    seedCost: 4,
    canSeed: true,
    session: { n: 2, world: 'classic', phase: 'running', limit: 25, bonus: 0, elapsed: 3, remaining: 22, progress: 0.1, essence: 10, seeds: 1, sprint: null, newSpecies: 0, endedEarly: false },
    seedPrice: { base: 4, alive: 1, crowdMult: 1, freeSlots: 4, used: 1, satMult: 1, bigMult: 2.25, freeSeeds: 0, capacity: 4, full: false },
    ...over,
  });
}

describe('the Sembrar button (ADR-031, docs/MECANICAS.md §3.1)', () => {
  it('tapping the button sows at the safest spot', () => {
    // Nobody chose the spot: it keeps clear of every body and of the glass, and it is never a scolding.
    const c = { ...creature(1, 'stable', dish.cx + 6, dish.cy - 4), r: 9 };
    const swimmer = { ...creature(2, 'stable', dish.cx - 30, dish.cy + 20), r: 8, vx: 0.6, vy: 0 };
    const v = sessionView({ creatures: [c, swimmer] });
    const req = sowRequest('tap', v)!;
    expect(req).not.toBeNull();
    expect(req.big).toBe(false);
    expect(req.dragged).toBe(false);
    expect(sowClearance([c, swimmer], req.spot.x, req.spot.y, 45)).toBeGreaterThanOrEqual(SOW_KEEP_R * R);
    expect(dish.radius - Math.hypot(req.spot.x - dish.cx, req.spot.y - dish.cy)).toBeGreaterThanOrEqual(1.5 * R);
    // The game's own pick wins when it gives one (GameView.sowSpot); no room at all: nothing to sow.
    expect(sowRequest('tap', sessionView({ sowSpot: { x: 90, y: 100 } }))!.spot).toEqual({ x: 90, y: 100 });
    expect(sowRequest('tap', sessionView({ sowSpot: null }))).toBeNull();
    // An empty dish: the centre.
    expect(sowRequest('tap', sessionView({ creatures: [] }))!.spot).toEqual({ x: dish.cx, y: dish.cy });
  });

  it('a seed dragged onto a creature snaps to the nearest safe spot and says so once, never refused', () => {
    const c = { ...creature(1, 'stable', dish.cx, dish.cy), r: 9 };
    const v = sessionView({ creatures: [c] });
    const req = sowRequest('drag', v, { x: dish.cx + 2, y: dish.cy })!;
    expect(req.dragged).toBe(true);
    expect(req.snapped).toBe(true);
    expect(sowClearance([c], req.spot.x, req.spot.y, 45)).toBeGreaterThanOrEqual(SOW_KEEP_R * R - 1e-6);
    // Dropped on free agar: it lands exactly there.
    const free = sowRequest('drag', v, { x: dish.cx, y: dish.cy + 44 })!;
    expect(free.snapped).toBe(false);
    expect(free.spot).toEqual({ x: dish.cx, y: dish.cy + 44 });
  });

  it('a full dish greys the button and names the Placa upgrade', () => {
    const v = sessionView({ canSeed: false, seedPrice: { base: 4, alive: 4, crowdMult: 1, freeSlots: 4, used: 4, satMult: 1, bigMult: 2.25, freeSeeds: 0, capacity: 4, full: true } });
    const m = sowModel(v);
    expect(m.state).toBe('full');
    expect(m.disabled).toBe(true);
    expect(m.sub).toEqual({ es: 'Llena (4 de 4)', en: 'Full (4 of 4)' });
    expect(m.hint!.es).toContain(NODE_TEXT.dish.name.es);
    expect(m.hint!.en).toContain(NODE_TEXT.dish.name.en);
    // Not full: the price, or «Gratis» while free seeds wait (the first seed of session 1 is free too).
    expect(sowModel(sessionView()).sub).toEqual({ es: '4 de luz', en: '4 glow' });
    expect(sowModel(sessionView({ charges: { free: 2, guaranteed: 0 } })).sub.es).toBe('Gratis');
    const s1 = sessionView({ session: { ...sessionView().session!, n: 1, first: true, phase: 'ready', elapsed: 0 } });
    expect(sowModel(s1).sub.es).toBe('Gratis');
    expect(sowModel(s1).disabled).toBe(false);
  });

  it('three failures light the sure-seed ring after the second', () => {
    const ring = [0, 1, 2, 3].map((fails) => sowModel(sessionView({ seedLuck: { fails, need: 2 } })));
    expect(ring.map((m) => m.sure)).toEqual([false, false, true, true]);
    expect(ring.map((m) => m.luck?.on)).toEqual([0, 1, 2, 2]);
    expect(ring.every((m) => m.luck?.of === 2)).toBe(true);
    // Its words when it lights: «¡Esta prende seguro!»; without the game's seed luck, no dots at all.
    expect(ring[2].hint?.es).toBe('¡Esta prende seguro!');
    expect(sowModel(sessionView()).luck).toBeNull();
  });

  it('holding the button sows a big seed only when bought', () => {
    const tools = (longPress: boolean) => ({ ...makeView().tools, longPress });
    expect(sowRequest('hold', sessionView({ tools: tools(false) }))!.big).toBe(false);
    expect(sowRequest('hold', sessionView({ tools: tools(true) }))!.big).toBe(true);
    expect(sowRequest('tap', sessionView({ tools: tools(true) }))!.big).toBe(false);
    expect(sowModel(sessionView({ tools: tools(true) })).big).toBe(true);
  });

  it('lives only in the sessions cycle, while the run can take a seed', () => {
    expect(sowModel(makeView()).state).toBe('off');
    const over = sessionView({ session: { ...sessionView().session!, phase: 'over' } });
    expect(sowModel(over).state).toBe('off');
    // Session 1 after the first seed, while VELA talks: a calm «Espera…», never red.
    const held = sessionView({ session: { ...sessionView().session!, n: 1, first: true, phase: 'ready', tutorialHold: true } });
    expect(sowModel(held).state).toBe('wait');
    expect(sowModel(sessionView({ canSeed: false, essence: 1 })).state).toBe('poor');
  });
});

// QA-3 §3 / ADR-027 v0.027 (game package): the run's planted creature is still waking on a slow device and the clock
// waits for it. The button must say so instead of offering a seed the game refuses.
describe('the Sembrar button while the Nevera creature wakes (SessionClockView.wakeHold)', () => {
  it('it says «Espera…», why, and does not offer a seed', () => {
    const base = sessionView().session!;
    for (const phase of ['ready', 'running'] as const) {
      const m = sowModel(sessionView({ session: { ...base, phase, wakeHold: true }, charges: { free: 1, guaranteed: 0 } }));
      expect(m.state, phase).toBe('wait');
      expect(m.sub.es, phase).toBe('Espera…');
      expect(m.hint, phase).toEqual(TEXT.wakeSow);
      expect(m.disabled, phase).toBe(true);
    }
    expect(sowModel(sessionView({ session: { ...base, wakeHold: false } })).state).toBe('ready');
  });
});
