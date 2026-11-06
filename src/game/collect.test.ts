import { describe, expect, it } from 'vitest';
import * as C from './cycleBalance';
import { collectAt, collectDrop, collectPath, fillDrops, freshCollect, releaseDrops, sweepAll, tickPipettes, validateCollect, type CollectFx } from './collect';
import { createGame } from './game';
import type { GameState } from './state';
import { creature, recordingBus, report, run, seededRng } from './testUtil';
import type { GameEvents } from '../core/bus';

/** A sessions game whose clock already runs (a seed was sown). */
function runningGame(seed = 1, save?: string) {
  const rec = recordingBus();
  const g = createGame({ bus: rec.bus, rng: seededRng(seed), cycle: 'sessions' }, save);
  if (g.session?.phase === 'ready') g.actions.seedAt(150, 200);
  return { g, ...rec };
}
const st = (g: { state: Readonly<GameState> }) => g.state as GameState;
const stable = (n: number, from = 1) => Array.from({ length: n }, (_, i) => creature({ id: from + i, x: 20 + 30 * i, y: 40 }));
const FX: CollectFx = { capSeconds: C.LIGHT_CAP_SECONDS, pipettes: 0, cycle: C.PIPETTE_CYCLE_S[0], instant: false, magnetCells: 0 };
const lightEvents = (log: Map<keyof GameEvents, unknown[]>) => (log.get('lightCollected') ?? []) as GameEvents['lightCollected'][];
/** Luz that came in without a drop (first steps, Encargos): it goes straight to the wallet, with its reason. */
const gifts = (log: Map<keyof GameEvents, unknown[]>) => ((log.get('luzGift') ?? []) as GameEvents['luzGift'][]).reduce((a, e) => a + e.amount, 0);

describe('collected light: the drops (ADR-030)', () => {
  it('uniform soup fills no drop of light', () => {
    const { g, log } = runningGame();
    const soup = { ...report([]), fill: 0.6, totalMass: 5000 };
    run(g, 10, soup, 0.5);
    expect(g.view().drops ?? []).toEqual([]);
    expect(g.session!.light!.made).toBe(0);
    expect(g.view().session!.essence).toBe(gifts(log)); // only the first seed's gift: no light was made
  });

  it('a forming seed fills no drop until it is stable', () => {
    const { g } = runningGame();
    run(g, 6, report([creature({ id: 1, state: 'born', age: 200 })]), 0.5);
    expect(g.view().drops ?? []).toEqual([]);
    run(g, 2, report([creature({ id: 1 })]), 0.5);
    expect(g.view().drops!.length).toBe(1);
    expect(g.view().drops![0]).toMatchObject({ owner: 1 });
    expect(g.view().drops![0].amount).toBeGreaterThan(0);
  });

  it('a full drop waits and nothing made is lost', () => {
    const { g, log } = runningGame();
    run(g, 8, report(stable(1)), 0.5); // the 15 s run is still on
    const v = g.view();
    const d = v.drops![0];
    expect(d.fill).toBe(1);
    const c = v.creatures.find((x) => x.id === 1)!;
    // Full at its cap: capSeconds of this creature's production, and the wallet did not move.
    expect(d.amount).toBeCloseTo(c.eps * C.LIGHT_CAP_SECONDS, 6);
    expect(v.essence).toBeCloseTo(C.SESSION_START_ESSENCE + gifts(log), 9); // only the gifts are in the wallet
    expect(c.light).toBe(1);
    expect(c.lightAmount).toBeCloseTo(d.amount, 9);
    // What counts for the Datos is what was made: exactly what waits in the drop (plus the gifts).
    expect(v.session!.essence).toBeCloseTo(d.amount + gifts(log), 6);
  });

  it('tapping a creature collects its drop into the wallet', () => {
    const { g, log } = runningGame();
    run(g, 3, report(stable(1)), 0.5);
    const before = g.view().essence;
    const waiting = g.view().drops![0].amount;
    const got = g.actions.collectAt!(20, 40, 2);
    expect(got).toBeCloseTo(waiting, 9);
    expect(g.view().essence).toBeCloseTo(before + waiting, 9);
    expect(lightEvents(log).at(-1)).toMatchObject({ by: 'hand', x: 20, y: 40 });
    expect(g.view().drops![0]?.amount ?? 0).toBe(0);
  });

  it('light of a creature that went dark stays on the dish and is swept at the end', () => {
    const { g, log } = runningGame();
    run(g, 3, report(stable(1)), 0.5);
    const eps = g.view().creatures[0].eps;
    // ADR-031: a living creature that dies adds DEATH_BURST_SECONDS of its light to the drop it leaves.
    const waiting = g.view().drops![0].amount + C.DEATH_BURST_SECONDS * eps;
    run(g, 1, report([], [{ type: 'died', id: 1, x: 20, y: 40 }]), 0.5);
    const loose = g.view().drops!;
    expect(loose).toHaveLength(1);
    expect(loose[0]).toMatchObject({ owner: null, x: 20, y: 40 });
    expect(loose[0].amount).toBeCloseTo(waiting, 9);
    const wallet = g.view().essence;
    g.actions.endSessionNow!();
    expect(lightEvents(log).filter((e) => e.by === 'sweep').reduce((a, e) => a + e.amount, 0)).toBeCloseTo(waiting, 9);
    expect(g.view().drops ?? []).toEqual([]);
    expect(g.lastSummary!.light!.sweep).toBeCloseTo(waiting, 9);
    expect(g.state.essence).toBeCloseTo(wallet + waiting, 9);
  });

  it('Datos count light made, collected or swept', () => {
    const a = runningGame(4);
    const b = runningGame(4);
    const rep = report(stable(2));
    for (let i = 0; i < 40; i++) {
      a.g.tick(0.5, rep);
      b.g.tick(0.5, rep);
      if (i % 2 === 0) a.g.actions.collectAt!(20, 40, 3); // one player taps one creature, the other never taps
    }
    expect(a.g.view().session!.essence).toBeGreaterThan(b.g.view().session!.essence); // b's drops waited full
    a.g.actions.endSessionNow!();
    b.g.actions.endSessionNow!();
    for (const x of [a, b]) {
      const sum = x.g.lastSummary!;
      // ADR-031: plus what the finger added (the streak's extra on the drops it tapped).
      expect(sum.datos.essence).toBeCloseTo(sum.light!.made + sum.light!.gifts + (sum.light!.finger ?? 0), 6);
      expect(sum.light!.made).toBeCloseTo(sum.light!.hand + sum.light!.pipette + sum.light!.sweep, 6);
    }
  });

  it('collection works while the dish is paused', () => {
    const { g } = runningGame();
    run(g, 3, report(stable(1)), 0.5);
    g.isPaused = true;
    const waiting = g.view().drops![0].amount;
    expect(g.actions.collect!(g.view().drops![0].id)).toBeCloseTo(waiting, 9);
    run(g, 3, report(stable(1)), 0.5); // paused: nothing fills
    expect(g.view().drops![0]?.amount ?? 0).toBe(0);
  });

  it('a session restored mid-run sweeps its drops', () => {
    const { g } = runningGame();
    run(g, 3, report(stable(2)), 0.5);
    const waiting = g.view().drops!.reduce((a, d) => a + d.amount, 0);
    const wallet = g.view().essence;
    expect(waiting).toBeGreaterThan(0);
    const back = runningGame(1, g.serialize());
    expect(back.g.view().session!.phase).toBe('running');
    expect(back.g.view().drops ?? []).toEqual([]);
    expect(back.g.view().essence).toBeCloseTo(wallet + waiting, 6);
  });

  it('a swipe collects every drop it passes', () => {
    const { g } = runningGame();
    run(g, 3, report(stable(3)), 0.5);
    expect(g.view().drops).toHaveLength(3);
    g.actions.collectPath!([{ x: 0, y: 40 }, { x: 100, y: 40 }], 3);
    expect((g.view().drops ?? []).filter((d) => d.amount > 0)).toHaveLength(0);
  });
});

describe('collected light: the pipettes (ADR-030)', () => {
  const ripe = () => {
    const s = freshCollect();
    fillDrops(s, [{ id: 1, x: 10, y: 10, rate: 2 }, { id: 2, x: 60, y: 10, rate: 2 }], 1, C.LIGHT_CAP_SECONDS); // 25 % full
    return s;
  };

  it('a pipette takes a ripe drop every cycle and never one below half', () => {
    const s = ripe();
    const fx = { ...FX, pipettes: 1 };
    expect(tickPipettes(s, fx, 5)).toEqual([]); // 25 %: it rests
    expect(s.pipettes[0]).toMatchObject({ target: null, t: 0 });
    fillDrops(s, [{ id: 1, x: 10, y: 10, rate: 2 }, { id: 2, x: 60, y: 10, rate: 2 }], 1.5, C.LIGHT_CAP_SECONDS); // 62,5 %
    const got: number[] = [];
    for (let t = 0; t < fx.cycle * 2 + 0.01; t += 0.05) got.push(...tickPipettes(s, fx, 0.05).map((p) => p.dropId));
    expect(got).toEqual([1, 2]); // one drop per trip, the older first on a tie
    expect(s.pipette).toBeCloseTo(2 * 2.5 * 2, 6);
  });

  it('tapping a drop a pipette is heading for sends the pipette elsewhere', () => {
    const s = ripe();
    fillDrops(s, [{ id: 1, x: 10, y: 10, rate: 2 }, { id: 2, x: 60, y: 10, rate: 2 }], 1.5, C.LIGHT_CAP_SECONDS);
    const fx = { ...FX, pipettes: 1 };
    tickPipettes(s, fx, 0.1);
    const going = s.pipettes[0].target!;
    expect(collectDrop(s, going)).not.toBeNull();
    const taken: number[] = [];
    for (let t = 0; t < fx.cycle; t += 0.05) taken.push(...tickPipettes(s, fx, 0.05).map((p) => p.dropId));
    expect(taken).toEqual([going === 1 ? 2 : 1]);
  });

  it('the magnet takes the drops next to the target; the master pipette takes them as they ripen', () => {
    const s = ripe();
    fillDrops(s, [{ id: 1, x: 10, y: 10, rate: 2 }, { id: 2, x: 60, y: 10, rate: 2 }], 1.5, C.LIGHT_CAP_SECONDS);
    s.drops.push({ id: 99, owner: null, x: 14, y: 10, amount: 0.1, cap: 8 });
    const got: number[] = [];
    for (let t = 0; t < 1.3; t += 0.05) got.push(...tickPipettes(s, { ...FX, pipettes: 1, magnetCells: 5 }, 0.05).map((p) => p.dropId));
    expect(got).toEqual([1, 99]);
    const m = ripe();
    expect(tickPipettes(m, { ...FX, pipettes: 1, instant: true }, 0.1)).toEqual([]);
    fillDrops(m, [{ id: 1, x: 10, y: 10, rate: 2 }], 1.5, C.LIGHT_CAP_SECONDS);
    expect(tickPipettes(m, { ...FX, pipettes: 1, instant: true }, 0.1).map((p) => p.dropId)).toEqual([1]);
  });

  it('a creature gone leaves a loose drop; too many loose drops are swept, never lost', () => {
    const s = ripe();
    releaseDrops(s, new Set([2]));
    expect(s.drops.find((d) => d.id === 1)).toMatchObject({ owner: null });
    for (let i = 0; i < C.LIGHT_DROPS_MAX + 3; i++) s.drops.push({ id: 100 + i, owner: null, x: i, y: 0, amount: 1, cap: 4 });
    const swept = releaseDrops(s, new Set([2]));
    expect(s.drops.length).toBe(C.LIGHT_DROPS_MAX);
    expect(swept.every((p) => p.by === 'sweep')).toBe(true);
    expect(s.sweep).toBeCloseTo(swept.reduce((a, p) => a + p.amount, 0), 9);
    const all = sweepAll(s);
    expect(s.drops).toEqual([]);
    expect(all.length).toBeGreaterThan(0);
  });

  it('a tap collects drops near the finger and the drop of the creature under it', () => {
    const s = ripe();
    expect(collectAt(s, 30, 10, 3).length).toBe(0);
    expect(collectAt(s, 14, 10, 3, new Map([[1, { x: 10, y: 10, r: 6 }]])).map((p) => p.dropId)).toEqual([1]);
    expect(collectPath(s, [{ x: 50, y: 0 }, { x: 70, y: 20 }], 2).map((p) => p.dropId)).toEqual([2]);
  });

  it('a stored state is read leniently', () => {
    expect(validateCollect(null).drops).toEqual([]);
    const v = validateCollect({ next: 3, drops: [{ id: 2, x: 5, y: 6, amount: 4, cap: 8, owner: 7 }, { amount: -1 }, 'x'] });
    expect(v.drops).toEqual([{ id: 2, owner: null, x: 5, y: 6, amount: 4, cap: 8 }]);
    expect(v.next).toBe(3);
  });
});

void st;
