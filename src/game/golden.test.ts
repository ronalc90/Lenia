import { describe, expect, it } from 'vitest';
import * as B from './balance';
import { createGame } from './game';
import { creature, recordingBus, report, run, seededRng } from './testUtil';

/** RNG that replays a scripted list, then falls back to a seeded stream. */
function scripted(values: number[], seed = 1): () => number {
  const rest = seededRng(seed);
  let i = 0;
  return () => (i < values.length ? values[i++] : rest());
}

describe('golden spark (Destello)', () => {
  it('does not spawn before the first stable creature', () => {
    const { bus, count } = recordingBus();
    const g = createGame({ bus, rng: seededRng(1) });
    run(g, 600, report([]), 0.5);
    expect(count('goldenSpawn')).toBe(0);
  });

  it('spawns after the first stable creature, drifts, and is missed after 12 s', () => {
    const { bus, count } = recordingBus();
    const g = createGame({ bus, rng: scripted([1]) }); // first delay = max of the range
    const rep = report([creature({ id: 1 })]);
    g.tick(0.1, rep);
    run(g, B.GOLDEN_FIRST_DELAY[1] - 1, rep, 0.1);
    expect(count('goldenSpawn')).toBe(0);
    run(g, 1.5, rep, 0.1);
    expect(count('goldenSpawn')).toBe(1);
    const a = g.view().golden!;
    expect(a.life).toBeGreaterThan(0);
    run(g, 2, rep, 0.1);
    const b = g.view().golden!;
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(1);
    expect(b.life).toBeLessThan(a.life);
    run(g, B.GOLDEN_LIFE, rep, 0.1);
    expect(g.view().golden).toBeNull();
    expect(count('goldenMissed')).toBe(1);
    // Next one comes 90–240 s later.
    run(g, B.GOLDEN_INTERVAL[0] - 1, rep, 0.5);
    expect(count('goldenSpawn')).toBe(1);
    run(g, B.GOLDEN_INTERVAL[1] - B.GOLDEN_INTERVAL[0] + 2, rep, 0.5);
    expect(count('goldenSpawn')).toBe(2);
  });

  it('collect: Floración gives ×7 production for 30 s', () => {
    const rec = recordingBus();
    const g = createGame({ bus: rec.bus, rng: scripted([0, 0.5, 0.5, 0.25, 0.0]) });
    const rep = report([creature({ id: 1 })]);
    g.tick(0.5, rep);
    run(g, B.GOLDEN_FIRST_DELAY[0] + 0.5, rep, 0.5);
    expect(g.view().golden).not.toBeNull();
    g.actions.collectGolden();
    expect(rec.count('goldenCollected')).toBe(1);
    expect(g.view().golden).toBeNull();
    const buff = g.view().buffs[0];
    expect(buff.mult).toBe(B.BLOOM_MULT);
    expect(buff.remaining).toBe(B.BLOOM_TIME);
    g.tick(0.5, rep);
    const during = g.view().essencePerSec;
    run(g, B.BLOOM_TIME + 1, rep, 0.5);
    expect(g.view().buffs.length).toBe(0);
    expect(during / g.view().essencePerSec).toBeCloseTo(B.BLOOM_MULT, 6);
  });

  it('collect: lump, spore rain and mutagen rewards', () => {
    const W = B.GOLDEN_WEIGHTS;
    const total = W.bloom + W.lump + W.spores + W.mutagen;
    const rolls = {
      lump: (W.bloom + W.lump / 2) / total,
      spores: (W.bloom + W.lump + W.spores / 2) / total,
      mutagen: 0.999,
    };
    for (const [kind, roll] of Object.entries(rolls)) {
      const rec = recordingBus();
      const g = createGame({ bus: rec.bus, rng: scripted([0, 0.5, 0.5, 0.25, roll]) });
      const rep = report([creature({ id: 1 })]);
      g.tick(0.5, rep);
      run(g, B.GOLDEN_FIRST_DELAY[0] + 0.5, rep, 0.5);
      const e0 = g.view().essence;
      g.actions.collectGolden();
      if (kind === 'lump') expect(g.view().essence - e0).toBeGreaterThanOrEqual(B.LUMP_MIN);
      if (kind === 'spores') expect(rec.count('dishSeed') + (g.view().charges!.free > 0 ? 1 : 0)).toBeGreaterThan(0);
      if (kind === 'mutagen') {
        expect(g.view().charges!.guaranteed).toBe(B.MUTAGEN_SEEDS);
        expect(g.actions.seedAt(10, 10)!.bias).toBe(1);
      }
      expect(rec.count('goldenCollected')).toBe(1);
      expect(g.state.stats.golden).toBe(1);
    }
  });

  it('collect with no spark is a no-op', () => {
    const { bus, count } = recordingBus();
    const g = createGame({ bus, rng: seededRng(3) });
    g.actions.collectGolden();
    expect(count('goldenCollected')).toBe(0);
  });
});
