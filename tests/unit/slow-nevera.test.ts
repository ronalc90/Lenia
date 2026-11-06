/**
 * QA-3 §3 (deaths #3, #4): on a device the incubation cap cuts (software GL at ~5 fps, INCUBATE_MAX_S lit the
 * Nevera's creature after ~50 of its 1250 steps), the start card's «Ya viva desde el principio» was still «Naciendo…»
 * when the clock started; the player's seeds became swimmers next to it, the young swimmers fused, and the dish went
 * dark with «No prendió» as the only word. Reproduced here on the real pipeline (CPU dish, browser readback lag, the
 * glass deflector, the runaway watch and lysis): the plant now holds the nursery until it lives, so the run's clock
 * (which starts with the first seed) always counts from a living Nevera creature, and nothing is sown into it while
 * it is young.
 */
import { describe, expect, it } from 'vitest';
import type { GameEvents } from '../../src/core/bus';
import { RealDish } from './realDish';

/** Session 8 of QA-3's child: World 1, the Nevera's creature planted, the incubation cut at `incubated` steps. */
function slowRun(incubated: number, seed = 1) {
  const d = new RealDish({ grid: 168, diameter: 128, seed, browserLag: true });
  const g = d.game;
  g.actions.startClock!();
  d.run(0.5, 30);
  g.actions.endSessionNow!();
  d.run(0.2, 30);
  const r = g.state.research as unknown as { levels: Record<string, number>; sessions: number; fridge: string[]; world: string };
  r.levels = { lab: 2, clock: 3, fridge: 1, dropper: 2, culture: 3, pipette: 2, notebook: 1, dish: 1, worldCold: 1, worldGyro: 1, pulse: 3 };
  r.sessions = 7;
  r.fridge = [];
  r.world = 'classic';
  const plants: number[] = [];
  d.bus.on('creatureBorn', ({ id }) => plants.length === 0 && plants.push(id));
  g.actions.startSession!();
  d.flush();
  d.preincubate(incubated);
  return { d, g, plant: () => plants[0] };
}

describe('the Nevera creature of a slow device lives before the clock starts (QA-3 §3)', () => {
  it('cut at 50 incubation steps: the first seed waits for it, and the clock starts with it alive', () => {
    const { d, g, plant } = slowRun(50);
    const blocked: GameEvents['seedBlocked']['reason'][] = [];
    d.bus.on('seedBlocked', ({ reason }) => blocked.push(reason));
    let stateAtClock: string | null = null;
    d.bus.on('sessionClock', ({ type }) => {
      if (type !== 'clockStart') return;
      stateAtClock = d.lastReport?.creatures.find((c) => c.id === plant())?.state ?? 'gone';
    });
    // The child taps Sembrar at once and then every 3 s (5 fps: the dish runs ~6 steps a frame).
    expect(g.actions.sow!()).toBeNull();
    expect(blocked).toContain('growing');
    for (let t = 0; t < 30 && g.session!.phase === 'ready'; t += 3) {
      d.run(3, 5);
      const spec = g.actions.sow!();
      if (spec) d.bus.emit('dishSeed', { specs: [spec] });
    }
    expect(g.session!.phase).toBe('running');
    expect(stateAtClock).toBe('stable');
  });
});
