/**
 * Every loss gives something back (ADR-031, docs/MECANICAS.md §4): a living creature that dies leaves
 * DEATH_BURST_SECONDS of its light in its drop; one the player erased leaves only its drop; the first death of each
 * cause ever teaches (FIRST_ACCIDENT_DATOS Datos, once).
 */
import { describe, expect, it } from 'vitest';
import type { GameEvents } from '../core/bus';
import * as C from './cycleBalance';
import { createGame } from './game';
import { creature, recordingBus, report, run, seededRng } from './testUtil';

const DISH = { cx: 100, cy: 100, radius: 90 };

function livingGame(seed = 1) {
  const rec = recordingBus();
  const g = createGame({ bus: rec.bus, rng: seededRng(seed), cycle: 'sessions' }, undefined);
  g.setDish({ ...DISH });
  g.actions.startClock!();
  return { g, ...rec };
}
const ONE = [creature({ id: 1, x: 100, y: 100, radius: 6 })];
const loose = (g: ReturnType<typeof livingGame>['g']) => g.view().drops!.filter((d) => d.owner === null);

describe('deaths that give back (ADR-031)', () => {
  it('a living creature that dies leaves three seconds of its light in its drop', () => {
    const { g, log } = livingGame();
    run(g, 0.5, report(ONE, [], 100), 0.25);
    const eps = g.view().creatures.find((c) => c.id === 1)!.eps;
    const waiting = g.view().drops!.find((d) => d.owner === 1)!.amount;
    const made = g.session!.light!.made;
    g.tick(0.25, report([], [{ type: 'died', id: 1, x: 100, y: 100 }], 110));
    const d = loose(g);
    expect(d).toHaveLength(1);
    expect(d[0].amount).toBeCloseTo(waiting + C.DEATH_BURST_SECONDS * eps, 6);
    const ev = (log.get('deathBurst') as GameEvents['deathBurst'][])[0];
    expect(ev).toMatchObject({ id: 1, cause: 'lost' });
    expect(ev.amount).toBeCloseTo(C.DEATH_BURST_SECONDS * eps, 6);
    // It is light made: it counts for the Datos.
    expect(g.session!.light!.made).toBeCloseTo(made + ev.amount, 6);
    expect(g.session!.losses).toMatchObject({ deaths: 1, merged: 0 });
  });

  it('a fusion and the glass name their cause', () => {
    const { g, log } = livingGame();
    const pair = [creature({ id: 1, x: 100, y: 100, radius: 6 }), creature({ id: 2, x: 112, y: 100, radius: 6 })];
    run(g, 0.5, report(pair, [], 100), 0.25);
    g.tick(0.25, report([creature({ id: 1, x: 106, y: 100, radius: 10, state: 'exploded' })], [{ type: 'exploded', id: 1, x: 106, y: 100 }], 110));
    expect((log.get('deathBurst') as GameEvents['deathBurst'][]).map((e) => e.cause)).toContain('touch');
    expect(g.session!.losses!.merged).toBe(1);
    const rim = livingGame();
    run(rim.g, 0.5, report([creature({ id: 5, x: 185, y: 100, radius: 6 })], [], 100), 0.25);
    rim.g.tick(0.25, report([], [{ type: 'died', id: 5, x: 185, y: 100 }], 110));
    expect((rim.log.get('deathBurst') as GameEvents['deathBurst'][])[0].cause).toBe('glass');
  });

  it('an erased creature leaves only its drop', () => {
    const { g, count } = livingGame();
    run(g, 0.5, report(ONE, [], 100), 0.25);
    const waiting = g.view().drops!.find((d) => d.owner === 1)!.amount;
    g.noteErased(100, 100, 13);
    g.tick(0.25, report([], [{ type: 'died', id: 1, x: 100, y: 100 }], 110));
    expect(loose(g)[0].amount).toBeCloseTo(waiting, 9);
    expect(count('deathBurst')).toBe(0);
  });

  it('a forming seed that goes dark is not a living death', () => {
    const { g, count } = livingGame();
    run(g, 0.5, report([creature({ id: 3, x: 100, y: 100, state: 'born', age: 100 })], [], 100), 0.25);
    g.tick(0.25, report([], [{ type: 'died', id: 3, x: 100, y: 100 }], 110));
    expect(count('deathBurst')).toBe(0);
  });

  it('the first fusion ever pays two Datos once', () => {
    const { g, log } = livingGame();
    const datos0 = g.research!.datos;
    const pair = (a: number, b: number) => [creature({ id: a, x: 100, y: 100, radius: 6 }), creature({ id: b, x: 112, y: 100, radius: 6 })];
    run(g, 0.5, report(pair(1, 2), [], 100), 0.25);
    g.tick(0.25, report([], [{ type: 'exploded', id: 1, x: 106, y: 100 }], 110));
    expect(log.get('accidentLearned')).toEqual([{ cause: 'touch', datos: C.FIRST_ACCIDENT_DATOS }]);
    expect(g.research!.datos).toBe(datos0 + C.FIRST_ACCIDENT_DATOS);
    // Again, even in another session: nothing more.
    g.actions.endSessionNow!();
    g.actions.startSession!();
    g.actions.startClock!();
    const datos1 = g.research!.datos;
    run(g, 0.5, report(pair(3, 4), [], 100), 0.25);
    g.tick(0.25, report([], [{ type: 'exploded', id: 3, x: 106, y: 100 }], 110));
    expect(log.get('accidentLearned')).toHaveLength(1);
    expect(g.research!.datos).toBe(datos1);
  });

  it('the first seed that never takes teaches once too', () => {
    const { g, log } = livingGame();
    (g.state as unknown as { charges: { free: number; guaranteed: number } }).charges = { free: 0, guaranteed: 0 };
    run(g, 0.25, report([], [], 100), 0.25);
    const s = g.actions.sow!()!;
    g.tick(0.25, report([creature({ id: 9, x: s.x, y: s.y, state: 'born', age: 20 })], [], 110));
    g.tick(0.25, report([], [{ type: 'died', id: 9, x: s.x, y: s.y }], 120));
    expect(log.get('accidentLearned')).toEqual([{ cause: 'faded', datos: C.FIRST_ACCIDENT_DATOS }]);
    expect(g.session!.losses!.learned).toBe(C.FIRST_ACCIDENT_DATOS);
  });

  it('VELA dissolving a runaway blob teaches once and pays no light', () => {
    const { g, log } = livingGame();
    g.noteLysis(100, 100);
    g.noteLysis(100, 100);
    expect(log.get('accidentLearned')).toEqual([{ cause: 'runaway', datos: C.FIRST_ACCIDENT_DATOS }]);
  });
});
