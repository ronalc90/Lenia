/**
 * QA-3 §3 (deaths #3 and #4): on a slow device the whole dish went dark in ~3 s — the Nevera's creature (the start
 * card said «Ya viva desde el principio») and two seeds — and the only words were «No prendió · semilla gratis de
 * vuelta». Reproduced on the real pipeline (CPU dish, browser lag, the incubation cut at ~50 of its 1250 steps by
 * INCUBATE_MAX_S): the plant is still forming when the clock starts, the player's seeds become swimmers too, and the
 * young swimmers fuse; a seed that formed and then crashed was refunded as a seed that «did not take», and the plant,
 * which cost nothing, went dark with no word and nothing back.
 *
 * Every death has a named cause and leaves something (docs/MECANICAS.md §4): a seed is refunded with its real cause;
 * a planted creature lost before it lived gives back a free sure seed; and while a planted creature is still waking,
 * the nursery is its own (no seed lands next to it) and the clock waits for it (ADR-027, amendment v0.027).
 */
import { describe, expect, it } from 'vitest';
import type { GameEvents } from '../core/bus';
import type { SeedSpec } from '../core/types';
import * as C from './cycleBalance';
import { createGame } from './game';
import type { GameState } from './state';
import { creature, recordingBus, report, run, seededRng } from './testUtil';

const DISH = { cx: 100, cy: 100, radius: 90 };

/** A sessions game whose run waits with the starter planted (session 1, no tutorial), and where it landed. */
function plantedGame(seed = 3) {
  const rec = recordingBus();
  const plants: SeedSpec[] = [];
  rec.bus.on('dishSeed', ({ specs }) => plants.push(...specs));
  rec.bus.on('dishClear', () => (plants.length = 0));
  const g = createGame({ bus: rec.bus, rng: seededRng(seed), cycle: 'sessions', grid: { w: 200, h: 200 } });
  g.setDish({ ...DISH });
  g.tick(0, null); // the boot sets the run up on the dish: its starter is planted
  expect(plants.length).toBe(C.STARTER_CREATURES);
  const st = g.state as unknown as GameState;
  st.charges = { free: 0, guaranteed: 0 };
  st.essence = 1000;
  return { g, st, plant: plants[0], ...rec };
}

const refunds = (log: Map<keyof GameEvents, unknown[]>) => (log.get('seedRefund') ?? []) as GameEvents['seedRefund'][];

describe('a planted creature still waking (QA-3 §3)', () => {
  it('holds the nursery: no seed is sown next to it until it lives, and the clock waits', () => {
    const { g, plant, log } = plantedGame();
    const young = creature({ id: 1, x: plant.x, y: plant.y, state: 'born', age: 60, behavior: null });
    g.tick(0.1, report([young], [], 60));
    expect(g.actions.sow!()).toBeNull();
    expect(((log.get('seedBlocked') ?? []) as GameEvents['seedBlocked'][]).map((e) => e.reason)).toContain('growing');
    expect(g.session!.phase).toBe('ready');
    expect(g.view().session!.wakeHold).toBe(true); // the button can say why it waits
    // It lives: the button sows and the first seed starts the clock with the Nevera's creature already paying.
    g.tick(0.1, report([creature({ id: 1, x: plant.x + 6, y: plant.y, state: 'stable', age: 420, behavior: 'swimmer' })], [], 420));
    expect(g.actions.sow!()).not.toBeNull();
    expect(g.session!.phase).toBe('running');
    expect(g.view().session!.wakeHold).toBe(false);
  });

  it('a clock started while it wakes waits for it, never longer than WAKE_HOLD_MAX_S', () => {
    const { g, plant } = plantedGame();
    const young = (step: number) => report([creature({ id: 1, x: plant.x, y: plant.y, state: 'born', age: step, behavior: null })], [], step);
    g.tick(0.1, young(60));
    g.actions.startClock!();
    expect(g.session!.phase).toBe('running');
    run(g, 2, young(100), 0.25);
    expect(g.session!.elapsed).toBe(0);
    expect(g.view().session!.wakeHold).toBe(true);
    // Alive: the clock runs.
    g.tick(0.25, report([creature({ id: 1, x: plant.x, y: plant.y, state: 'stable', age: 420, behavior: 'swimmer' })], [], 420));
    run(g, 1, null, 0.25);
    expect(g.session!.elapsed).toBeGreaterThan(0.9);
    expect(g.view().session!.wakeHold).toBe(false);
    // A creature that never lives does not hold the clock for ever.
    const slow = plantedGame(5);
    const y2 = (step: number) => report([creature({ id: 1, x: slow.plant.x, y: slow.plant.y, state: 'born', age: step, behavior: null })], [], step);
    slow.g.tick(0.1, y2(60));
    slow.g.actions.startClock!();
    run(slow.g, C.WAKE_HOLD_MAX_S + 2, y2(100), 0.25);
    expect(slow.g.session!.elapsed).toBeGreaterThan(1.5);
  });

  // Code review v0.027 #2: a plant the detector kept calling 'born' held Sembrar on «Espera…» for good: 60 s of dish,
  // 60 refused seeds, and the run (whose first seed starts the clock) never began.
  it('a plant that never lives stops holding the nursery: the run can always start', () => {
    const { g, plant, log } = plantedGame();
    const stepsPerTick = (C.SIM_STEPS_PER_SEC * C.SESSION_SIM_PACE) / 10;
    let step = 60;
    const young = () => report([creature({ id: 1, x: plant.x, y: plant.y, state: 'born', age: step, behavior: null })], [], step);
    g.tick(0.1, young());
    let sown: SeedSpec | null = null;
    let sownAt = -1;
    for (let i = 0; i < 600 && !sown; i++) {
      step += stepsPerTick;
      g.tick(0.1, young());
      sown = g.actions.sow!();
      if (sown) sownAt = step;
    }
    expect(sown).not.toBeNull();
    // Young, it held the nursery; past its age cap it no longer does, and the first seed starts the clock.
    expect(sownAt).toBeGreaterThanOrEqual(C.PLANT_WAKE_MAX_STEPS);
    expect(sownAt).toBeLessThan(C.PLANT_WAKE_MAX_STEPS + 2 * stepsPerTick);
    expect(((log.get('seedBlocked') ?? []) as GameEvents['seedBlocked'][]).every((e) => e.reason === 'growing')).toBe(true);
    expect(g.session!.phase).toBe('running');
    expect(g.view().session!.wakeHold).toBe(false);
    // The clock does not wait for it either: it runs.
    run(g, 2, young(), 0.25);
    expect(g.session!.elapsed).toBeGreaterThan(1.5);
  });

  it('lost before it lived: the player hears why and gets a free sure seed back', () => {
    const { g, st, plant, log } = plantedGame();
    g.tick(0.1, report([creature({ id: 1, x: plant.x, y: plant.y, state: 'born', age: 60, behavior: null })], [], 60));
    // A seed of the player's (another body) right beside it, then both are gone: they fused.
    const other = creature({ id: 2, x: plant.x + 14, y: plant.y, state: 'born', age: 30, behavior: null });
    g.tick(0.1, report([creature({ id: 1, x: plant.x + 4, y: plant.y, state: 'born', age: 70 }), other], [], 70));
    g.tick(0.1, report([], [{ type: 'died', id: 1, x: plant.x + 6, y: plant.y }], 80));
    const r = refunds(log);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ plant: true, free: true, amount: 0, cause: 'crowd' });
    expect(st.charges).toMatchObject({ free: 1, guaranteed: 1 });
    // And it no longer holds the nursery.
    expect(g.actions.sow!()).not.toBeNull();
  });
});

describe('a seed that formed and crashed is not a seed that «did not take» (QA-3 §3)', () => {
  /** A running session with the starter already alive and stable, far from where the seeds go. */
  function runningGame() {
    const p = plantedGame();
    const starter = creature({ id: 1, x: p.plant.x, y: p.plant.y, state: 'stable', age: 600, behavior: 'swimmer' });
    p.g.tick(0.1, report([starter], [], 600));
    return { ...p, starter };
  }

  it('a seed that became a body and then fused with another is refunded with cause «crowd»', () => {
    const { g, log, starter } = runningGame();
    const spec = g.actions.sow!()!;
    expect(spec).not.toBeNull();
    const seedBody = creature({ id: 7, x: spec.x, y: spec.y, state: 'born', age: 10, behavior: null });
    g.tick(0.1, report([starter, seedBody], [], 610));
    // It swam into a neighbour and the two fused (the detector kept the other id).
    const neighbour = creature({ id: 8, x: spec.x + 16, y: spec.y, state: 'born', age: 50, behavior: null });
    g.tick(0.1, report([starter, { ...seedBody, x: spec.x + 6 }, neighbour], [], 700));
    g.tick(0.1, report([starter, { ...neighbour, x: spec.x + 10, mass: 240, state: 'exploded' }], [], 710));
    const r = refunds(log);
    expect(r).toHaveLength(1);
    expect(r[0].cause).toBe('crowd');
    expect(r[0].plant).toBeFalsy();
    // The refund is said where it went dark, not where it was sown.
    expect(Math.hypot(r[0].x - (spec.x + 6), r[0].y - spec.y)).toBeLessThan(1e-6);
  });

  it('a fast fusion between two reports is still a crash (the browser repro: 31 cells apart, then one body)', () => {
    const { g, log, starter } = runningGame();
    const spec = g.actions.sow!()!;
    const seedBody = creature({ id: 7, x: spec.x, y: spec.y, state: 'born', age: 10, behavior: null });
    const other = creature({ id: 8, x: spec.x + 31, y: spec.y, state: 'born', age: 50, behavior: null, mass: 73 });
    g.tick(0.1, report([starter, seedBody, other], [], 610));
    // Ten steps later one body, its centroid between the two and twice the mass.
    g.tick(0.1, report([starter, { ...other, x: spec.x + 16, mass: 146, radius: 12 }], [], 620));
    expect(refunds(log)[0].cause).toBe('crowd');
  });

  it('a seed the detector never saw form is still «did not take» (cause faded)', () => {
    const { g, log, starter } = runningGame();
    g.actions.sow!();
    g.tick(0.1, report([starter], [], 610));
    g.tick(0.1, report([starter], [], 610 + C.STABLE_AGE_STEPS + 10));
    const r = refunds(log);
    expect(r).toHaveLength(1);
    expect(r[0].cause).toBe('faded');
  });

  it('a seed that formed and touched the glass is refunded with cause «glass»', () => {
    const { g, log, starter } = runningGame();
    const spec = g.actions.sow!()!;
    const body = creature({ id: 9, x: spec.x, y: spec.y, state: 'born', age: 10, behavior: null, radius: 6 });
    g.tick(0.1, report([starter, body], [], 610));
    // It swam to the rim (DISH radius 90 around 100,100) and went dark there.
    g.tick(0.1, report([starter, { ...body, x: 100, y: 186 }], [], 700));
    g.tick(0.1, report([starter], [{ type: 'died', id: 9, x: 100, y: 186 }], 710));
    expect(refunds(log)[0].cause).toBe('glass');
  });
});

// Code review v0.027 #6: a seed wiped with the Goma came back as «No prendió» with its price and a bad-luck dot, so
// sow → erase → sow → erase left the Luz where it was and made the next seed sure; a waking Nevera plant erased gave
// a free sure seed. The Goma is the player's own act and gives nothing (docs/MECANICAS.md §4: «la Goma no da nada»).
describe('what the Goma erases is neither a failure nor bad luck', () => {
  function runningGame() {
    const p = plantedGame();
    const starter = creature({ id: 1, x: p.plant.x, y: p.plant.y, state: 'stable', age: 600, behavior: 'swimmer' });
    p.g.tick(0.1, report([starter], [], 600));
    p.g.actions.startClock!(); // every seed below is bought (the run's first one would be on the house)
    return { ...p, starter };
  }
  const learned = (log: Map<keyof GameEvents, unknown[]>) => log.get('accidentLearned') ?? [];

  it('a forming seed erased: no refund, no bad-luck dot, no lesson, and sowing it again costs again', () => {
    const { g, st, log, starter } = runningGame();
    let step = 610;
    for (let k = 0; k < 3; k++) {
      const spec = g.actions.sow!()!;
      expect(spec).not.toBeNull();
      const paid = st.essence;
      const body = creature({ id: 20 + k, x: spec.x, y: spec.y, state: 'born', age: 10, behavior: null });
      g.tick(0.1, report([starter, body], [], (step += 10)));
      g.noteErased(spec.x, spec.y, 16);
      g.tick(0.1, report([starter], [{ type: 'died', id: 20 + k, x: spec.x, y: spec.y }], (step += 10)));
      g.tick(0.1, report([starter], [], (step += C.STABLE_AGE_STEPS)));
      expect(st.essence).toBe(paid);
    }
    expect(refunds(log)).toHaveLength(0);
    expect(learned(log)).toHaveLength(0);
    expect(g.view().seedLuck!.fails).toBe(0); // the next seed is not a sure one
    expect(g.session!.bought).toBe(3); // and every one of them was paid for
  });

  it('a seed erased before the detector ever saw it is not «did not take» either', () => {
    const { g, st, log, starter } = runningGame();
    const spec = g.actions.sow!()!;
    const paid = st.essence;
    g.noteErased(spec.x, spec.y, 16);
    g.tick(0.1, report([starter], [], 620));
    g.tick(0.1, report([starter], [], 620 + C.STABLE_AGE_STEPS + 10));
    expect(refunds(log)).toHaveLength(0);
    expect(st.essence).toBe(paid);
    expect(g.view().seedLuck!.fails).toBe(0);
  });

  it('a waking Nevera plant erased gives no free sure seed', () => {
    const { g, st, plant, log } = plantedGame();
    g.tick(0.1, report([creature({ id: 1, x: plant.x, y: plant.y, state: 'born', age: 60, behavior: null })], [], 60));
    g.noteErased(plant.x, plant.y, 16);
    g.tick(0.1, report([], [{ type: 'died', id: 1, x: plant.x, y: plant.y }], 70));
    expect(refunds(log)).toHaveLength(0);
    expect(learned(log)).toHaveLength(0);
    expect(st.charges).toMatchObject({ free: 0, guaranteed: 0 });
    expect(g.view().session!.wakeHold).toBe(false); // and it holds nothing any more
  });
});
