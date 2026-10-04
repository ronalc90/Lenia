import { describe, expect, it } from 'vitest';
import { createDetector } from '../detect/detector';
import { CpuLenia } from '../sim/cpu';
import { applySeedCpu } from '../sim/seed';
import { snapshotFromCpu } from '../sim/snapshot';
import { createGame } from './game';
import { recordingBus, report, seededRng } from './testUtil';
import * as B from './balance';

describe('spores at the start calibration (CPU simulation, real seed specs)', () => {
  it('the first seeds a new player can afford still give a living creature quickly', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(2026) });
    (g.state as { charges: { free: number; guaranteed: number } }).charges = { free: 0, guaranteed: 0 }; // plain spores only
    (g.state as { essence: number }).essence = 1e6;
    let stable = 0;
    let firstStable = Infinity;
    for (let i = 0; i < 10; i++) {
      const spec = g.actions.seedAt(32, 32)!;
      g.tick(B.SEED_SPACING_MEMORY + 0.1, report([]));
      const sim = new CpuLenia(64, 64, g.simParams);
      applySeedCpu(sim.A, 64, 64, spec, i + 1);
      const det = createDetector();
      det.update(snapshotFromCpu(sim.A, 64, 64, 2, 0), g.simParams);
      while (sim.stepCount < 600) {
        sim.step(10);
        const r = det.update(snapshotFromCpu(sim.A, 64, 64, 2, sim.stepCount), g.simParams);
        if (r.creatures.some((c) => c.state === 'stable')) {
          stable++;
          firstStable = Math.min(firstStable, i);
          break;
        }
      }
    }
    // Measured mix at μ .15 σ .015: ~50 % of plain spores live (O2u alone: ~40 %).
    expect(stable).toBeGreaterThanOrEqual(3);
    expect(firstStable).toBeLessThanOrEqual(3);
  }, 180_000);
});

describe('a tight cluster of taps never floods the dish (seed spacing; e2e mobile smoke)', () => {
  it('6 spores tapped within a few cells of each other: moved apart or refused, no maze in 600 steps', () => {
    const N = 128;
    for (const seed of [1, 2, 3]) {
      const { bus, count } = recordingBus();
      const g = createGame({ bus, rng: seededRng(4242 + seed), grid: { w: N, h: N } });
      g.setGridSize(N, N);
      (g.state as { essence: number }).essence = 1e6;
      const sim = new CpuLenia(N, N, g.simParams);
      const det = createDetector();
      const jitter = seededRng(seed);
      let maxFill = 0;
      let worst = 0;
      const feed = () => {
        const r = det.update(snapshotFromCpu(sim.A, N, N, 2, sim.stepCount), g.simParams);
        g.tick(10 / 30, r);
        maxFill = Math.max(maxFill, r.fill);
        worst = Math.max(worst, r.creatures.filter((c) => c.state === 'exploded').length);
      };
      feed();
      for (let i = 0; i < 6; i++) {
        const spec = g.actions.seedAt(64 + (jitter() - 0.5) * 12, 64 + (jitter() - 0.5) * 12);
        if (spec) applySeedCpu(sim.A, N, N, spec, i + 1);
        sim.step(10); // ~a quarter second between taps
        feed();
      }
      expect(count('seedBlocked') + count('seed')).toBe(6);
      expect(count('seedBlocked')).toBeGreaterThan(0); // the cluster could not all land
      while (sim.stepCount < 600) {
        sim.step(10);
        feed();
      }
      expect(maxFill).toBeLessThan(B.DISH_OVERGROWN_FILL);
      expect(worst).toBeLessThan(3);
    }
  }, 240_000);
});
