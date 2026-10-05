import { describe, expect, it } from 'vitest';
import { dishForGrid } from '../core/dish';
import { CATALOG, catalogPattern, paramsOf } from './catalog';
import { CpuLenia } from './cpu';
import { angleDelta, awayFrom, type Body, Deflector, LYSIS, LysisPlanner, lysisPenalty, reflect, rotateDiscCpu, turnWeight } from './deflect';

const dish = { cx: 64, cy: 64, radius: 48 };

/** Mass-weighted centroid and mass of a field (no wrap: the dish never touches the grid edge). */
function centroid(A: Float32Array, n: number): { x: number; y: number; m: number } {
  let m = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const v = A[y * n + x];
      m += v;
      sx += v * (x + 0.5);
      sy += v * (y + 0.5);
    }
  return { x: sx / m, y: sy / m, m };
}

describe('glass deflection', () => {
  it('reflects velocities specularly and measures signed angles', () => {
    expect(reflect(1, 0, 1, 0)).toEqual({ vx: -1, vy: 0 });
    const r = reflect(1, 1, 1, 0);
    expect(r.vx).toBeCloseTo(-1, 12);
    expect(r.vy).toBeCloseTo(1, 12);
    expect(reflect(-1, 0, 1, 0)).toEqual({ vx: -1, vy: 0 }); // moving away: untouched
    expect(angleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 12);
  });

  it('makes encounters a clear swerve: at least minAway below the tangent, speed kept', () => {
    const v = awayFrom({ vx: 1, vy: -0.05 }, 0, 1, 0.45); // drifting almost parallel, slightly away
    expect(v.vy).toBeCloseTo(-Math.sin(0.45) * Math.hypot(1, 0.05), 9);
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(Math.hypot(1, -0.05), 9);
    expect(v.vx).toBeGreaterThan(0); // keeps its general direction (shorter rotation)
    const far = { vx: 0, vy: -1 };
    expect(awayFrom(far, 0, 1, 0.45)).toBe(far); // already heading away
  });

  it('turns a swimmer heading for the rim to the mirror direction, a bounded step per update', () => {
    const d = new Deflector();
    // 30° incidence, close to the rim on the right.
    const a = Math.PI / 6;
    const h0 = a;
    const body: Body = { id: 1, x: 64 + 30, y: 64, vx: 0.6 * Math.cos(a), vy: 0.6 * Math.sin(a), radius: 5.5 };
    let total = 0;
    let step = 0;
    for (let k = 0; k < 6; k++) {
      const turns = d.update([body], dish, step, 10);
      for (const t of turns) {
        expect(Math.abs(t.angle)).toBeLessThanOrEqual(d.opts.maxTurn + 1e-12);
        total += t.angle;
      }
      // The creature's heading follows its rotated body.
      body.vx = 0.6 * Math.cos(h0 + total);
      body.vy = 0.6 * Math.sin(h0 + total);
      step += 10;
    }
    // Specular reflection of a 30° incidence turns the heading by 180° − 2·30° = 120°, once.
    expect(Math.abs(total)).toBeCloseTo((2 * Math.PI) / 3, 6);
    // Heading after the turn points back into the dish.
    expect(Math.cos(h0 + total)).toBeLessThan(0);
  });

  it('the glass comes first: a swimmer about to hit the rim turns even mid-swerve or in its cooldown (QA4)', () => {
    // A swerve off another body just finished (cooldown), then the swimmer heads straight for the rim.
    const d = new Deflector();
    const h = (b: Body, ang: number) => ((b.vx = 0.6 * Math.cos(ang)), (b.vy = 0.6 * Math.sin(ang)));
    // A shallow approach to the rim: one small turn, then the cooldown starts.
    const a: Body = { id: 1, x: dish.cx + 33, y: dish.cy, vx: 0, vy: 0, radius: 5.8 };
    h(a, Math.PI / 2 - 0.2);
    d.update([a], dish, 990, 10); // heading known
    const first = d.update([a], dish, 1000, 10).filter((t) => t.id === 1);
    expect(first.length).toBe(1);
    // Ten steps later (inside the cooldown) its heading (the turned one) points straight at the glass
    // further along: the bottom of the dish, a few cells away.
    const turned = Math.PI / 2 - 0.2 + first[0].angle;
    a.x = dish.cx;
    a.y = dish.cy + dish.radius - a.radius * d.opts.extentK - d.opts.margin - 2;
    h(a, turned);
    const next = d.update([a], dish, 1010, 10).filter((t) => t.id === 1);
    expect(next.length).toBe(1);
    expect(Math.abs(next[0].angle)).toBeGreaterThan(0.5);
    // Mid-swerve: a long avoidance turn is pending, then the rim is right ahead: the turn becomes the rim's.
    const e = new Deflector();
    const b: Body = { id: 2, x: dish.cx, y: dish.cy, vx: 0.6, vy: 0, radius: 5.8 };
    const c: Body = { id: 3, x: dish.cx + 30, y: dish.cy, vx: -0.6, vy: 0, radius: 5.8 };
    e.update([b, c], dish, 2000, 10);
    e.update([b, c], dish, 2010, 10); // heading known: the head-on encounter starts a long swerve
    b.x = dish.cx + dish.radius - b.radius * e.opts.extentK - e.opts.margin - 3;
    b.y = dish.cy + 2;
    const t2 = e.update([b], dish, 2020, 10).filter((t) => t.id === 2);
    expect(t2.length).toBe(1);
    // Turning away from the glass: the new heading points back into the dish.
    const nh = Math.atan2(b.vy, b.vx) + t2[0].angle;
    expect(Math.cos(nh) * 0.6).toBeLessThan(0.6 * Math.cos(Math.atan2(b.vy, b.vx)));
  });

  it('leaves slow, sessile or far-away bodies alone', () => {
    const bodies: Body[] = [
      { id: 1, x: 64 + 40, y: 64, vx: 0.01, vy: 0, radius: 5 },
      { id: 2, x: 64, y: 64, vx: 0.6, vy: 0, radius: 5 },
      { id: 3, x: 64 + 40, y: 30, vx: 0.6, vy: 0, radius: 5, steerable: false },
      { id: 4, x: 64 + 40, y: 90, vx: -0.6, vy: 0, radius: 5 },
    ];
    expect(new Deflector({ bodies: false }).update(bodies, dish, 0, 10)).toEqual([]);
    const k = new Deflector({ bodies: false });
    k.update(bodies, dish, 0, 10);
    expect(k.update(bodies, dish, 10, 10)).toEqual([]);
  });

  it('bounces two swimmers on a collision course off each other', () => {
    const d = new Deflector();
    const bodies: Body[] = [
      { id: 1, x: 40, y: 64, vx: 0.6, vy: 0.05, radius: 5.5 },
      { id: 2, x: 80, y: 64, vx: -0.6, vy: 0.05, radius: 5.5 },
    ];
    const open = { cx: 64, cy: 64, radius: 1000 };
    expect(d.update(bodies, open, 0, 10)).toEqual([]); // first sight: heading not known yet
    const turns = d.update(bodies, open, 10, 10);
    expect(turns.map((t) => t.id).sort()).toEqual([1, 2]);
    const off = new Deflector({ bodies: false });
    off.update(bodies, open, 0, 10);
    expect(off.update(bodies, open, 10, 10)).toEqual([]);
  });

  it('never steers a body that curls or spins (Gyrorbium circles in place)', () => {
    const d = new Deflector();
    const b: Body = { id: 1, x: 64 + 34, y: 64, vx: 0.3, vy: 0, radius: 5.5 };
    for (let k = 0; k < 6; k++) {
      const h = k * 0.6; // 34° per update
      b.vx = 0.3 * Math.cos(h);
      b.vy = 0.3 * Math.sin(h);
      expect(d.update([b], dish, k * 10, 10)).toEqual([]);
    }
  });

  it('rotates matter rigidly: mass and centroid are kept, outside the dish stays empty', () => {
    const n = 128;
    const A = new Float32Array(n * n);
    const sim = new CpuLenia(n, n, paramsOf(CATALOG.find((c) => c.code === 'O2u')!));
    sim.A.set(A);
    sim.placeCentered(catalogPattern('O2u'), 64, 64);
    const before = centroid(sim.A, n);
    const tmp = new Float32Array(n * n);
    rotateDiscCpu(sim.A, n, n, { id: 1, x: before.x, y: before.y, radius: 14, angle: Math.PI / 3 }, dish, tmp);
    const after = centroid(sim.A, n);
    expect(after.m / before.m).toBeGreaterThan(0.97);
    expect(after.m / before.m).toBeLessThan(1.03);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(0.5);
    expect(turnWeight(0, 10)).toBe(1);
    expect(turnWeight(14, 10)).toBe(0);
    expect(turnWeight(11.5, 10)).toBeGreaterThan(0);
  });

  it('Orbium survives a run of rim impacts in the smallest dish when deflected (CPU reference)', () => {
    const e = CATALOG.find((c) => c.code === 'O2u')!;
    const n = 128;
    const sim = new CpuLenia(n, n, paramsOf(e));
    const d0 = dishForGrid(n, n, 96);
    sim.setDish(d0);
    sim.placeCentered(catalogPattern('O2u'), 64, 64);
    sim.step(10); // first velocity estimate after one detector interval
    const deflector = new Deflector();
    const m0 = centroid(sim.A, n).m;
    let prev = centroid(sim.A, n);
    let turns = 0;
    let closest = Infinity;
    for (let k = 0; k < 120; k++) {
      sim.step(10);
      const c = centroid(sim.A, n);
      if (c.m < 0.3 * m0) break;
      closest = Math.min(closest, d0.radius - Math.hypot(c.x - d0.cx, c.y - d0.cy));
      const t = deflector.update([{ id: 1, x: c.x, y: c.y, vx: (c.x - prev.x) / 10, vy: (c.y - prev.y) / 10, radius: 5.6 }], d0, sim.stepCount, 10);
      turns += t.length;
      sim.applyTurns(t);
      prev = centroid(sim.A, n);
    }
    const end = centroid(sim.A, n);
    expect(end.m / m0).toBeGreaterThan(0.8);
    expect(end.m / m0).toBeLessThan(1.25);
    expect(turns).toBeGreaterThan(5); // it really met the glass several times
    expect(closest).toBeLessThan(20); // its outline (≈ 10.6 cells) came within a few cells of the glass
  });
});

describe('lysis', () => {
  it('penalises growth most at the centre of a disc and not at all outside', () => {
    const discs = [{ x: 10, y: 10, radius: 5, strength: 1 }];
    expect(lysisPenalty(10, 10, discs)).toBe(1);
    expect(lysisPenalty(12.5, 10, discs)).toBeCloseTo(0.75, 12);
    expect(lysisPenalty(16, 10, discs)).toBe(0);
    expect(lysisPenalty(10, 10, [])).toBe(0);
  });

  it('starts a disc once per blob, keeps it while reported, and lets it expire', () => {
    const lp = new LysisPlanner();
    const blob = { id: 7, x: 50, y: 40, radius: 6, mass: 400, reason: 'runaway' };
    let r = lp.update([blob], 100, 13);
    expect(r.started.map((e) => e.id)).toEqual([7]);
    expect(r.discs).toHaveLength(1);
    expect(r.discs[0].radius).toBeCloseTo(LYSIS.radiusK * 6 + LYSIS.padR * 13, 9);
    r = lp.update([{ ...blob, x: 52 }], 110, 13);
    expect(r.started).toEqual([]); // already dissolving: no second announcement
    expect(r.discs[0].x).toBe(52);
    r = lp.update([], 110 + LYSIS.holdSteps, 13);
    expect(r.discs).toEqual([]);
    // Never more than maxDiscs at once.
    const many = Array.from({ length: LYSIS.maxDiscs + 3 }, (_, i) => ({ ...blob, id: 100 + i }));
    expect(lp.update(many, 500, 13).discs).toHaveLength(LYSIS.maxDiscs);
  });

  it('dissolves a blob on the CPU reference while a creature far away is untouched', () => {
    const n = 128;
    const sim = new CpuLenia(n, n, paramsOf(CATALOG.find((c) => c.code === 'O2u')!));
    sim.setDish({ cx: 64, cy: 64, radius: 48 });
    sim.placeCentered(catalogPattern('O2u'), 50, 64);
    sim.placeCentered(catalogPattern('O2u'), 84, 64);
    const half = (x0: number, x1: number) => {
      let m = 0;
      for (let y = 0; y < n; y++) for (let x = x0; x < x1; x++) m += sim.A[y * n + x];
      return m;
    };
    const right0 = half(67, n);
    sim.setLysis([{ x: 50, y: 64, radius: 16, strength: LYSIS.strength }]);
    sim.step(30);
    expect(half(0, 67)).toBeLessThan(1);
    expect(half(67, n) / right0).toBeGreaterThan(0.8);
    sim.setLysis([]);
  });
});
