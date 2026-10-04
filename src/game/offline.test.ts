import { describe, expect, it } from 'vitest';
import * as B from './balance';
import { createGame } from './game';
import { averageEps, offlineEssence } from './offline';
import { offlineSeconds } from './save';
import { creature, recordingBus, report, run, seededRng } from './testUtil';

describe('offline progress', () => {
  it('1 h away at 10 essence/s average → 18 000 ±1 %', () => {
    const avg = averageEps(new Array(30).fill(10));
    expect(avg).toBe(10);
    const e = offlineEssence(avg, 3600, 2 * 3600);
    expect(Math.abs(e - 18_000) / 18_000).toBeLessThan(0.01);
  });

  it('respects the Reserva cap and the 24 h hard cap', () => {
    expect(offlineEssence(10, 10 * 3600, 2 * 3600)).toBeCloseTo(10 * 0.5 * 7200, 6);
    expect(offlineEssence(10, 100 * 3600, 1e9)).toBeCloseTo(10 * 0.5 * 24 * 3600, 6);
  });

  it('clock going backwards → 0', () => {
    expect(offlineEssence(10, -3600, 7200)).toBe(0);
    expect(offlineSeconds(Date.now() + 60_000, Date.now())).toBe(0);
    expect(offlineSeconds(0, Date.now())).toBe(0);
    expect(offlineSeconds(1000, 1000 + 3600_000)).toBeCloseTo(3600, 6);
    expect(offlineSeconds(1000, 1000 + 100 * 3600_000)).toBe(B.OFFLINE_HARD_CAP);
  });

  it('game: uses the last active minutes, emits offlineReturn, ignores negative time', () => {
    const { bus, log } = recordingBus();
    const g = createGame({ bus, rng: seededRng(1) });
    // Enough identical creatures of different species to make production steady.
    const cs = Array.from({ length: 6 }, (_, i) => creature({ id: i + 1, x: 20 + i * 30, signature: [1 + i, 0.5, 0.3, 0, 1, 0.1, 1, 0.8] }));
    run(g, 320, report(cs), 0.5);
    const avg = g.view().essencePerSec;
    expect(avg).toBeGreaterThan(5);
    const before = g.view().essence;
    g.applyOffline(3600);
    const gained = g.view().essence - before;
    expect(Math.abs(gained - avg * 0.5 * 3600) / (avg * 1800)).toBeLessThan(0.01);
    const ev = (log.get('offlineReturn') ?? []) as { seconds: number; essence: number }[];
    expect(ev[0].seconds).toBe(3600);
    expect(ev[0].essence).toBeCloseTo(gained, 6);
    const e1 = g.view().essence;
    g.applyOffline(-500);
    expect(g.view().essence).toBe(e1);
    // Reserva unlock after a real return.
    expect(g.state.flags.returned).toBe(true);
  });

  it('paused time is not part of the active average', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(2) });
    const rep = report([creature({ id: 1 })]);
    run(g, 300, rep, 0.5);
    const hist = [...g.state.epsHistory];
    g.isPaused = true;
    run(g, 300, report([]), 0.5);
    expect(g.state.epsHistory).toEqual(hist);
  });
});
