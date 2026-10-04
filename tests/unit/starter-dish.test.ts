import { describe, expect, it } from 'vitest';
import { Bus, type GameEvents } from '../../src/core/bus';
import { dishForGrid } from '../../src/core/dish';
import type { SeedSpec } from '../../src/core/types';
import { createDetector } from '../../src/detect/detector';
import { createGame } from '../../src/game/game';
import { seededRng } from '../../src/game/testUtil';
import { CpuLenia } from '../../src/sim/cpu';
import { Deflector } from '../../src/sim/deflect';
import { mustWaitForDetection } from '../../src/sim/detectGate';
import { applySeedCpu } from '../../src/sim/seed';
import { snapshotFromCpu } from '../../src/sim/snapshot';

/**
 * QA (v0.014 play shot "s1-running"): session 1 showed an EMPTY Ø96 dish at +0/s. The starter Orbium
 * was planted, but the dish stepped on while a snapshot was still in flight: unsteered, it reached the
 * absorbing glass in ~60 steps and died. The dish now waits at each snapshot boundary (detectGate).
 */
function starterRun(snapshotEvery: number, steps = 500): { alive: number; turns: number } {
  const N = 168;
  const bus = new Bus<GameEvents>();
  const specs: SeedSpec[] = [];
  bus.on('dishSeed', ({ specs: s }) => specs.push(...s));
  const g = createGame({ bus, rng: seededRng(1), cycle: 'sessions', grid: { w: N, h: N } });
  g.setGridSize(N, N);
  const dish = dishForGrid(N, N, 96);
  g.setDish(dish);
  g.tick(0, null);
  const sim = new CpuLenia(N, N, g.simParams);
  sim.setDish(dish);
  for (const s of specs) applySeedCpu(sim.A, N, N, s);
  const det = createDetector();
  const defl = new Deflector();
  let turns = 0;
  let alive = 0;
  for (let k = 0; k <= steps; k += 10) {
    if (k) sim.step(10);
    if (k % snapshotEvery !== 0) continue;
    const rep = det.update(snapshotFromCpu(sim.A, N, N, 2, sim.stepCount), g.simParams);
    const bodies = rep.creatures.filter((c) => c.state !== 'dead').map((c) => ({ id: c.id, x: c.x, y: c.y, vx: c.vx, vy: c.vy, radius: c.radius, steerable: true }));
    const t = defl.update(bodies, dish, sim.stepCount, 10);
    if (t.length) sim.applyTurns(t);
    turns += t.length;
    alive = bodies.length;
  }
  return { alive, turns };
}

describe('the session starter is alive on the round dish from the first second', () => {
  it('a starter steered every snapshot lives; stepping blind for 60 steps loses it on the glass', () => {
    const steered = starterRun(10);
    expect(steered.alive).toBe(1);
    expect(steered.turns).toBeGreaterThan(0);
    expect(starterRun(60).alive).toBe(0);
  });

  it('stepping waits at a snapshot boundary until its snapshot is taken', () => {
    expect(mustWaitForDetection(30, 20, 10)).toBe(true);
    expect(mustWaitForDetection(30, 30, 10)).toBe(false);
    expect(mustWaitForDetection(35, 30, 10)).toBe(false);
  });
});
