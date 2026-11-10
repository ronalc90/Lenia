/**
 * The pulse played through the integrated game (ADR-031, docs/MECANICAS.md §3, §5): the actions, the view, the bus
 * and the hard gates — only stable creatures pay, uniform soup yields 0, the light on screen is never taken away.
 */
import { describe, expect, it } from 'vitest';
import type { GameEvents } from '../core/bus';
import * as C from './cycleBalance';
import { createGame } from './game';
import { pulseBase, pulseFxOf } from './pulse';
import { creature, recordingBus, report, run, seededRng } from './testUtil';

/** A sessions game whose clock runs, and a clock for the tap window (ms). */
function tapGame(seed = 1) {
  const rec = recordingBus();
  let ms = 0;
  const g = createGame({ bus: rec.bus, rng: seededRng(seed), cycle: 'sessions', now: () => ms }, undefined);
  g.actions.startClock!();
  return { g, ...rec, advance: (s: number) => void (ms += s * 1000), at: () => ms };
}
const pulses = (log: Map<keyof GameEvents, unknown[]>) => (log.get('pulse') ?? []) as GameEvents['pulse'][];
const ONE = [creature({ id: 1, x: 40, y: 40 })];

/** n pulses on creature `id`, 200 ms apart (5 a second), the dish running between them. */
function tapN(t: ReturnType<typeof tapGame>, n: number, id = 1, rep = report(ONE)): number {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += t.g.actions.pulse!(id);
    t.advance(0.2);
    t.g.tick(0.2, rep);
  }
  return sum;
}

describe('the pulse in the game (ADR-031)', () => {
  it('with only uniform soup a thousand taps yield zero light', () => {
    const t = tapGame();
    const soup = { ...report([]), fill: 0.6, totalMass: 5000 };
    run(t.g, 2, soup, 0.5);
    const before = t.g.view().session!.essence;
    for (let i = 0; i < 1000; i++) {
      expect(t.g.actions.pulse!(i % 7)).toBe(0);
      t.advance(0.05);
    }
    expect(t.g.view().session!.essence).toBe(before);
    expect(t.g.view().streak?.hits ?? 0).toBe(0);
    expect(pulses(t.log)).toHaveLength(0);
  });

  it('a tap on a stable creature pays a pulse, collects its drop and says so on the bus', () => {
    const t = tapGame();
    run(t.g, 2, report(ONE), 0.5);
    const v = t.g.view();
    const drop = v.drops!.find((d) => d.owner === 1)!.amount;
    const P = v.essencePerSec;
    const wallet = v.essence;
    const got = t.g.actions.pulse!(1);
    const base = pulseBase(P, pulseFxOf({}, 1));
    expect(got).toBeCloseTo(drop + base, 9);
    expect(t.g.view().essence).toBeCloseTo(wallet + got, 9);
    expect(pulses(t.log)[0]).toMatchObject({ id: 1, x: 40, y: 40, hits: 1, chispazo: false });
    expect(pulses(t.log)[0].amount).toBeCloseTo(got, 9);
    expect(t.g.view().streak).toMatchObject({ hits: 1, max: C.STREAK_HITS_BY_LEVEL[0], every: C.CHISPAZO_EVERY_BY_LEVEL[0], toChispazo: C.CHISPAZO_EVERY_BY_LEVEL[0] - 1, draining: false });
  });

  it('a tap on a forming seed pays nothing and keeps the streak', () => {
    const t = tapGame();
    const rep = report([creature({ id: 1, x: 40, y: 40 }), creature({ id: 2, x: 120, y: 120, state: 'born', age: 100 })]);
    run(t.g, 1, rep, 0.5);
    tapN(t, 4, 1, rep);
    const hits = t.g.view().streak!.hits;
    expect(t.g.actions.pulse!(2)).toBe(0);
    expect(t.g.view().streak!.hits).toBe(hits);
  });

  it('the tenth hit of a streak is a Chispazo worth five pulses', () => {
    const t = tapGame();
    run(t.g, 1, report(ONE), 0.5);
    tapN(t, 9);
    const P = t.g.view().essencePerSec;
    const drop = t.g.view().drops!.find((d) => d.owner === 1)?.amount ?? 0;
    const m = t.g.view().streak!.mult;
    const got = t.g.actions.pulse!(1);
    expect(got).toBeCloseTo((drop + pulseBase(P, pulseFxOf({}, 1)) * C.CHISPAZO_MULT) * m, 6);
    expect(pulses(t.log).at(-1)).toMatchObject({ chispazo: true, hits: 10 });
  });

  it('a pause in tapping drains the streak, never resets it at once', () => {
    const t = tapGame();
    run(t.g, 1, report(ONE), 0.5);
    tapN(t, 10);
    t.g.tick(C.STREAK_GRACE_S + 0.25, report(ONE));
    const s = t.g.view().streak!;
    expect(s.hits).toBeGreaterThan(0);
    expect(s.hits).toBeLessThan(10);
    expect(s.draining).toBe(true);
  });

  it('the streak is frozen while the dish is paused', () => {
    const t = tapGame();
    run(t.g, 1, report(ONE), 0.5);
    tapN(t, 6);
    t.g.isPaused = true;
    run(t.g, 20, report(ONE), 0.5);
    expect(t.g.view().streak!.hits).toBe(6);
    t.g.isPaused = false;
  });

  // Code review v0.027 #1: with the pause card up (or a sheet, or VELA's line) 600 taps in 60 s paid +1 050 Luz
  // while the clock stood still and the streak stayed full.
  it('a paused dish pays no pulse: 600 taps in 60 s give no light and no streak, only the drop already there', () => {
    const t = tapGame();
    run(t.g, 2, report(ONE), 0.5);
    const v0 = t.g.view();
    const drop = v0.drops!.find((d) => d.owner === 1)!.amount;
    expect(drop).toBeGreaterThan(0);
    t.g.isPaused = true;
    let got = 0;
    for (let i = 0; i < 600; i++) {
      got += t.g.actions.pulse!(1);
      got += t.g.actions.pulseMany!([1]);
      t.advance(0.1);
      t.g.tick(0.1, report(ONE));
    }
    const v = t.g.view();
    expect(got).toBeCloseTo(drop, 9); // the drop the finger drew in, once
    expect(v.essence).toBeCloseTo(v0.essence + drop, 9);
    expect(v.session!.elapsed).toBe(v0.session!.elapsed);
    expect(v.streak?.hits ?? 0).toBe(0);
    expect(pulses(t.log)).toHaveLength(0);
    t.g.isPaused = false;
    expect(t.g.actions.pulse!(1)).toBeGreaterThan(0); // the finger works again
  });

  it('a paused dish keeps its glimmers and its streak: a tap there catches nothing', () => {
    const t = tapGame();
    t.g.actions.endSessionNow!();
    t.g.actions.startSession!(); // session 2 throws glimmers
    t.g.actions.startClock!();
    run(t.g, 1, report(ONE), 0.5);
    tapN(t, 10);
    const motes = t.g.view().motes!;
    expect(motes.length).toBeGreaterThan(0);
    const hits = t.g.view().streak!.hits;
    t.g.isPaused = true;
    expect(t.g.actions.catchMote!(motes[0].id)).toBe(0);
    expect(t.g.view().motes).toHaveLength(motes.length);
    expect(t.g.view().streak!.hits).toBe(hits);
    t.g.isPaused = false;
    expect(t.g.actions.catchMote!(motes[0].id)).toBeGreaterThan(0);
  });

  it('a pipette\'s drop is worth the streak while it lasts; the final sweep is never multiplied', () => {
    const t = tapGame();
    (t.g.state as unknown as { settings: { autoCollect: boolean } }).settings.autoCollect = true; // a free pipette
    const two = [creature({ id: 1, x: 40, y: 40 }), creature({ id: 2, x: 140, y: 140 })];
    run(t.g, 1, report(two), 0.5);
    tapN(t, 30, 1, report(two)); // 6 s of tapping creature 1 while the pipette serves creature 2
    const lc = (t.log.get('lightCollected') ?? []) as GameEvents['lightCollected'][];
    const fromPipette = lc.filter((e) => e.by === 'pipette');
    expect(fromPipette.length).toBeGreaterThan(0);
    const L = t.g.session!.light!;
    // What the pipettes brought is worth more than the drops held: the streak's extra.
    expect(fromPipette.reduce((a, e) => a + e.amount, 0)).toBeGreaterThan(L.pipette + 1e-9);
    // "¡Tiempo!": the sweep pays exactly what waited.
    const waiting = L.drops.reduce((a, d) => a + d.amount, 0);
    const wallet = t.g.view().essence;
    t.g.actions.endSessionNow!();
    const swept = lc.filter((e) => e.by === 'sweep').reduce((a, e) => a + e.amount, 0);
    expect(swept).toBeCloseTo(waiting, 9);
    expect(t.g.view().essence).toBeCloseTo(wallet + waiting, 6);
  });

  it('an uncaught glimmer settles as a loose drop: light on screen is never taken away', () => {
    const t = tapGame();
    t.g.actions.endSessionNow!();
    t.g.actions.startSession!(); // session 2 throws glimmers
    t.g.actions.startClock!();
    run(t.g, 1, report(ONE), 0.5);
    tapN(t, 10);
    const motes = t.g.view().motes!;
    expect(motes).toHaveLength(C.CHISPAZO_MOTES);
    const loose = () => t.g.view().drops!.filter((d) => d.owner === null);
    expect(loose()).toHaveLength(0);
    // Catch one: +1 hit and its light.
    const hits = t.g.view().streak!.hits;
    expect(t.g.actions.catchMote!(motes[0].id)).toBeGreaterThan(0);
    expect(t.g.view().streak!.hits).toBe(Math.min(C.STREAK_HITS_BY_LEVEL[0], hits + 1));
    expect(t.log.get('moteCaught')).toHaveLength(1);
    run(t.g, C.MOTE_LIFE_S + 0.5, report(ONE), 0.5);
    expect(t.g.view().motes).toHaveLength(0);
    expect(loose()).toHaveLength(C.CHISPAZO_MOTES - 1);
  });

  it('an idle player (no taps) gets no streak and exactly the light of the drops', () => {
    const t = tapGame();
    (t.g.state as unknown as { settings: { autoCollect: boolean } }).settings.autoCollect = true;
    run(t.g, 10, report(ONE), 0.5);
    const L = t.g.session!.light!;
    expect(t.g.view().streak?.hits ?? 0).toBe(0);
    const lc = (t.log.get('lightCollected') ?? []) as GameEvents['lightCollected'][];
    expect(lc.reduce((a, e) => a + e.amount, 0)).toBeCloseTo(L.pipette + L.hand, 9);
  });

  it('the swipe pulses each creature it crosses once per SWEEP_REHIT_S', () => {
    const t = tapGame();
    const two = [creature({ id: 1, x: 40, y: 40 }), creature({ id: 2, x: 140, y: 140 })];
    run(t.g, 1, report(two), 0.5);
    expect(t.g.actions.pulseMany!([1, 2])).toBeGreaterThan(0);
    expect(t.g.view().streak!.hits).toBe(2);
    t.advance(C.SWEEP_REHIT_S / 2);
    t.g.actions.pulseMany!([1, 2]);
    expect(t.g.view().streak!.hits).toBe(2);
    t.advance(C.SWEEP_REHIT_S);
    t.g.actions.pulseMany!([1, 2]);
    expect(t.g.view().streak!.hits).toBe(4);
  });

  it('Datos count every Luz the finger adds: made + gifts + finger', () => {
    const t = tapGame();
    t.g.actions.endSessionNow!();
    t.g.actions.startSession!();
    t.g.actions.startClock!();
    const two = [creature({ id: 1, x: 40, y: 40 }), creature({ id: 2, x: 140, y: 140 })];
    run(t.g, 1, report(two), 0.5);
    tapN(t, 25, 1, report(two));
    for (const m of t.g.view().motes!.slice(0, 2)) t.g.actions.catchMote!(m.id);
    t.g.actions.endSessionNow!();
    const sum = t.g.lastSummary!;
    expect(sum.light!.finger).toBeGreaterThan(0);
    expect(sum.datos.essence).toBeCloseTo(sum.light!.made + sum.light!.gifts + sum.light!.finger!, 6);
    expect(sum.finger).toMatchObject({ taps: 25 + 2, chispazos: 2, motesCaught: 2, motesThrown: 2 * C.CHISPAZO_MOTES });
    expect(sum.finger!.bestMult).toBeCloseTo(1 + C.STREAK_STEP * C.STREAK_HITS_BY_LEVEL[0], 9);
  });

  it('Settings can turn on «Pulso fácil» and it survives a save', () => {
    const t = tapGame();
    t.g.actions.setSetting('easyPulse', true);
    expect(t.g.state.settings.easyPulse).toBe(true);
    const again = createGame({ bus: t.bus, rng: seededRng(2), cycle: 'sessions' }, t.g.serialize());
    expect(again.state.settings.easyPulse).toBe(true);
    t.g.actions.setSetting('easyPulse', false);
    expect(t.g.state.settings.easyPulse).toBe(false);
  });
});
