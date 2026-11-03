import { describe, expect, it } from 'vitest';
import type { GameEvents } from '../core/bus';
import * as C from './cycleBalance';
import { deathCause, explodeCause, predictContacts } from './contact';
import { createGame } from './game';
import { creature, recordingBus, report, seededRng } from './testUtil';

const SPS = C.SIM_STEPS_PER_SEC * C.SESSION_SIM_PACE;
const DISH = { cx: 100, cy: 100, radius: 64 };

describe('collisions seen coming (ADR-030)', () => {
  it('two bodies on a collision course within 2 s are reported once', () => {
    // 30 cells apart, closing at 0.2 cells/step → outlines (r 6 + 6) meet after 90 steps = 2 s at 45 steps/s.
    const a = { id: 7, x: 85, y: 100, r: 6, vx: 0.1, vy: 0, state: 'stable' as const, behavior: 'still' as const };
    const b = { id: 3, x: 115, y: 100, r: 6, vx: -0.1, vy: 0, state: 'stable' as const, behavior: 'still' as const };
    const d = predictContacts([a, b], SPS, DISH);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ a: 3, b: 7 });
    expect(d[0].inS).toBeCloseTo(90 / SPS, 6);
    // Too far ahead, or moving apart: nothing.
    expect(predictContacts([a, b], SPS, DISH, 1)).toEqual([]);
    expect(predictContacts([{ ...a, vx: -0.1 }, { ...b, vx: 0.1 }], SPS, DISH)).toEqual([]);
    // Already touching: now.
    expect(predictContacts([{ ...a, x: 95 }, { ...b, x: 106 }], SPS, DISH)[0].inS).toBe(0);
  });

  it('a swimmer that the glass will turn is not a danger', () => {
    // A swimmer racing for the rim: the glass turns it (12 steps) before it would graze a seed forming
    // across its path near the rim (≈ 40 steps).
    const swim = { id: 1, x: 145, y: 100, r: 6, vx: 0.6, vy: 0, state: 'stable' as const, behavior: 'swimmer' as const };
    const seed = { id: 2, x: 152, y: 128, r: 6, vx: 0.15, vy: -0.6, state: 'born' as const, behavior: null };
    expect(predictContacts([swim, seed], SPS, DISH)).toEqual([]);
    expect(predictContacts([swim, seed], SPS, null)).toHaveLength(1); // the torus has no glass to turn it
    // Two swimmers on a collision course: the deflector steers them apart (it is its job).
    const twin = { ...swim, id: 3, x: 115, vx: -0.6 };
    expect(predictContacts([{ ...swim, x: 85, vx: 0.6 }, twin], SPS, DISH)).toEqual([]);
    // A swimmer and a forming seed it will meet in the open: warn.
    expect(predictContacts([{ ...swim, x: 85, vx: 0.6 }, { ...seed, x: 110, y: 100, vx: 0, vy: 0 }], SPS, DISH)).toHaveLength(1);
  });

  it('death cause: near the rim → glass, near another → crowd, else → faded', () => {
    const R = 13;
    expect(deathCause({ x: 160, y: 100, r: 6 }, [], R, DISH)).toBe('glass');
    expect(deathCause({ x: 100, y: 100, r: 6 }, [{ x: 120, y: 100 }], R, DISH)).toBe('crowd');
    expect(deathCause({ x: 100, y: 100, r: 6 }, [{ x: 140, y: 100 }], R, DISH)).toBe('faded');
    expect(deathCause({ x: 160, y: 100, r: 6 }, [], R, null)).toBe('faded'); // the torus has no glass
    expect(explodeCause({ x: 100, y: 100, r: 6 }, [{ x: 112, y: 100, r: 6 }], false, 1)).toBe('touch');
    expect(explodeCause({ x: 100, y: 100, r: 6 }, [], true, 1)).toBe('crowd');
    expect(explodeCause({ x: 100, y: 100, r: 6 }, [], false, 1)).toBeNull();
  });

  it('the game tells the cause of a death and of a fusion, and lists the dangers on the dish', () => {
    const rec = recordingBus();
    const g = createGame({ bus: rec.bus, rng: seededRng(1), cycle: 'sessions' }, undefined);
    g.setDish({ ...DISH });
    g.actions.seedAt(100, 100);
    const near = [creature({ id: 1, x: 100, y: 100, radius: 6 }), creature({ id: 2, x: 118, y: 100, radius: 6 })];
    g.tick(0.5, report(near));
    g.tick(0.5, report([near[1]], [{ type: 'died', id: 1, x: 100, y: 100 }]));
    expect((rec.log.get('creatureDied')!.at(-1) as GameEvents['creatureDied']).cause).toBe('crowd');
    const pair = [creature({ id: 4, x: 90, y: 100, radius: 6, vx: 0.1 }), creature({ id: 5, x: 112, y: 100, radius: 6, vx: -0.1 })];
    g.tick(0.5, report(pair));
    expect(g.view().dangers).toEqual([{ a: 4, b: 5, inS: expect.any(Number) }]);
    g.tick(0.5, report([{ ...pair[0], state: 'exploded' }, pair[1]], [{ type: 'exploded', id: 4, x: 95, y: 100 }]));
    expect((rec.log.get('creatureExploded')!.at(-1) as GameEvents['creatureExploded']).cause).toBe('touch');
  });
});
