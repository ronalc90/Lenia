import { describe, expect, it } from 'vitest';
import type { Creature, CreatureState, DetectorReport, FieldSnapshot } from '../core/types';
import { localMass, RUNAWAY, RunawayWatch } from './runaway';

const R = 13;
const REF = RUNAWAY.REF_MASS_R2 * R * R; // ≈ 74, an Orbium

function creature(id: number, mass: number, state: CreatureState = 'born', age = 200, x = 50, y = 50): Creature {
  return { id, x, y, radius: 5.6, mass, complexity: 1, state, behavior: null, age, vx: 0, vy: 0, signature: [], parentId: null };
}

function report(step: number, creatures: Creature[], fill = 0.02): DetectorReport {
  return { step, creatures, events: [], totalMass: 0, fill };
}

/** Empty 2-scale snapshot of a w×h grid, optionally with a filled disc of matter. */
function snap(w = 128, h = 128, blob?: { x: number; y: number; r: number; v: number }, wrap = true): FieldSnapshot {
  const sw = w / 2;
  const sh = h / 2;
  const value = new Float32Array(sw * sh);
  if (blob) {
    for (let j = 0; j < sh; j++)
      for (let i = 0; i < sw; i++) {
        let dx = Math.abs((i + 0.5) * 2 - blob.x);
        let dy = Math.abs((j + 0.5) * 2 - blob.y);
        if (wrap) {
          dx = Math.min(dx, w - dx);
          dy = Math.min(dy, h - dy);
        }
        if (dx * dx + dy * dy <= blob.r * blob.r) value[j * sw + i] = blob.v;
      }
  }
  return { w: sw, h: sh, scale: 2, gridW: w, gridH: h, value, grad: new Float32Array(sw * sh), step: 0 };
}

describe('runaway watch', () => {
  it('never flags a healthy creature, however long it lives', () => {
    const w = new RunawayWatch();
    for (let t = 0; t < 3000; t += 10) {
      const r = w.update(report(t, [creature(1, REF * (1 + 0.1 * Math.sin(t / 50)), t < 400 ? 'born' : 'stable', t)]), snap(), R);
      expect(r.erase).toEqual([]);
    }
  });

  it('dissolves a heavy blob once (oversize), with a disc covering it', () => {
    const w = new RunawayWatch();
    let flagged = 0;
    let erasedAt = Infinity;
    for (let t = 0; t < 400; t += 10) {
      const m = t > erasedAt ? 0.3 * REF : REF * 3.5; // the erase leaves a faint remnant with the same id
      const r = w.update(report(t, [creature(1, m, 'born', t)]), snap(), R);
      if (r.started.length) {
        flagged++;
        erasedAt = t;
        expect(t).toBeGreaterThanOrEqual(RUNAWAY.MIN_AGE); // fresh matter gets a chance first
        expect(r.started[0].reason).toBe('oversize');
        expect(r.erase[0].radius).toBeCloseTo(RUNAWAY.ERASE_K * 5.6 + RUNAWAY.ERASE_PAD_R * R, 9);
      }
    }
    expect(flagged).toBe(1);
  });

  it('flags a remnant the disc missed again once it regrows (same detector id)', () => {
    const w = new RunawayWatch();
    const flags: number[] = [];
    let m = REF;
    for (let t = 0; t <= 600; t += 10) {
      if (t >= 100) m *= 1.2; // a nucleus
      const r = w.update(report(t, [creature(1, m, 'born', 300 + t)]), snap(), R);
      if (r.started.length) {
        flags.push(t);
        m = 0.5 * REF; // partly missed: the remnant keeps the id and grows again
      }
    }
    expect(flags.length).toBeGreaterThanOrEqual(2);
    expect(flags[1] - flags[0]).toBeGreaterThanOrEqual(RUNAWAY.REFLAG_STEPS);
  });

  it('catches a merged pair that keeps swelling (growth), but not a divider that only doubles', () => {
    const swell = new RunawayWatch();
    let reason = '';
    for (let t = 0; t <= 200; t += 10) {
      const m = REF * (t < 100 ? 1.2 : Math.min(2.9, 1.2 + (t - 100) * 0.02)); // 1.2× → 2.9× (never "oversize")
      const r = swell.update(report(t, [creature(1, m, 'born', 300 + t)]), snap(), R);
      if (r.started.length) reason = r.started[0].reason;
    }
    expect(reason).toBe('growth');

    const divider = new RunawayWatch();
    for (let t = 0; t <= 1000; t += 10) {
      const phase = t % 300;
      const m = REF * (1 + Math.min(1, phase / 250)); // grows to 2×, then splits back to 1×
      const r = divider.update(report(t, [creature(1, m, 'stable', 1000 + t)]), snap(), R);
      expect(r.erase).toEqual([]);
    }
  });

  it('spares collision transients measured at 192×240, and catches the measured nuclei', () => {
    // Mass every 10 steps (scripts/runaway-bot.ts traces, μ .15 σ .015): two Orbium collide, swell
    // and resolve (normal run 2 #4, run 7 #2, run 2 #1) …
    const transients = [
      [73, 73, 149, 200, 248, 277, 303, 227, 154, 146, 140, 97, 73, 74],
      [72, 75, 73, 73, 151, 146, 142, 151, 191, 210, 219, 233, 161, 76, 25],
      [73, 74, 217, 230, 208, 295, 311, 325, 273, 225, 212, 187, 147, 73],
    ];
    // … while a nucleus keeps growing (normal runs 8, 0 and 13).
    const nuclei = [
      { m: [74, 74, 74, 169, 215, 287, 339, 427, 547, 707, 895, 1062], at: 547 },
      { m: [73, 74, 236, 296, 369, 383, 422, 487, 541, 644, 772], at: 487 },
      { m: [148, 147, 297, 339, 393, 473, 556, 692, 773, 907], at: 692 },
    ];
    const run = (series: number[]) => {
      const w = new RunawayWatch();
      for (let k = 0; k < series.length; k++) {
        const t = 1000 + 10 * k;
        const other = creature(9, 73, 'stable', t, 150, 150); // sets the reference to an Orbium
        const r = w.update(report(t, [creature(1, series[k], 'stable', t), other]), snap(256, 256), R);
        if (r.started.length) return { mass: r.started[0].mass, reason: r.started[0].reason };
      }
      return null;
    };
    for (const m of transients) expect(run(m)).toBeNull();
    for (const n of nuclei) expect(run(n.m)).toEqual({ mass: n.at, reason: 'growth' });
  });

  it('catches the only stable creature when it swells (it must not set its own reference)', () => {
    const w = new RunawayWatch();
    let reason = '';
    for (let t = 0; t <= 400; t += 10) {
      const m = t < 200 ? REF : REF * Math.min(12, 1 + (t - 200) * 0.06); // a merge that keeps growing
      const r = w.update(report(t, [creature(1, m, 'stable', 800 + t)]), snap(), R);
      if (r.started.length) reason = r.started[0].reason;
    }
    expect(reason).toBe('growth');
  });

  it('flags a growing swarm of small fragments from the matter around them', () => {
    const w = new RunawayWatch();
    let reason = '';
    for (let t = 0; t <= 200; t += 10) {
      const v = t < 100 ? 0.12 : 0.12 + (t - 100) * 0.004; // local matter density climbing
      const r = w.update(report(t, [creature(1, REF, 'born', 300 + t, 64, 64)]), snap(128, 128, { x: 64, y: 64, r: 3 * R, v }), R);
      if (r.started.length) reason = r.started[0].reason;
    }
    expect(reason).toBe('swarm');
  });

  it('leaves an overgrown dish to the sterilise button', () => {
    const w = new RunawayWatch();
    for (let t = 0; t < 300; t += 10) expect(w.update(report(t, [creature(1, REF * 5, 'born', t)], 0.3), snap(), R).erase).toEqual([]);
  });

  it('measures local matter across the torus seam, and not across the glass of a dish', () => {
    const s = snap(128, 128, { x: 1, y: 64, r: 10, v: 0.5 }, false);
    const across = localMass(s, 126, 64, 12, null);
    const inside = localMass(s, 1, 64, 12, null);
    expect(across).toBeGreaterThan(0.5 * inside);
    expect(localMass(s, 126, 64, 12, { cx: 64, cy: 64, radius: 60 })).toBeLessThan(0.2 * inside);
  });
});

describe('runaway watch on the CPU reference with the real detector', () => {
  it('stops four converging Orbium from flooding the torus (the control floods)', async () => {
    const { createDetector } = await import('../detect/detector');
    const { placeRotated } = await import('../detect/harness');
    const { CATALOG, catalogPattern, paramsOf } = await import('./catalog');
    const { CpuLenia } = await import('./cpu');
    const { applyEraseCpu } = await import('./seed');
    const { snapshotFromCpu } = await import('./snapshot');
    const P = paramsOf(CATALOG.find((c) => c.code === 'O2u')!);
    const N = 128;
    const run = (watch: boolean) => {
      const sim = new CpuLenia(N, N, P);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.2;
        const x = 64 + 36 * Math.cos(a);
        const y = 64 + 36 * Math.sin(a);
        placeRotated(sim.A, N, N, catalogPattern('O2u'), x, y, Math.atan2(64 - y, 64 - x) - (68 * Math.PI) / 180);
      }
      const det = createDetector();
      const w = new RunawayWatch();
      let maxFill = 0;
      let dissolved = 0;
      for (let t = 0; t <= 700; t += 10) {
        if (t) sim.step(10);
        const snap = snapshotFromCpu(sim.A, N, N, 2, sim.stepCount);
        const rep = det.update(snap, P);
        maxFill = Math.max(maxFill, rep.fill);
        if (!watch) continue;
        const r = w.update(rep, snap, P);
        dissolved += r.started.length;
        for (const e of r.erase) applyEraseCpu(sim.A, N, N, e.x, e.y, e.radius);
      }
      return { maxFill, dissolved };
    };
    const control = run(false);
    const watched = run(true);
    expect(control.maxFill).toBeGreaterThan(0.15);
    expect(watched.dissolved).toBeGreaterThan(0);
    expect(watched.maxFill).toBeLessThan(0.1);
  });
});
