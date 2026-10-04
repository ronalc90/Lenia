import { describe, expect, it } from 'vitest';
import type { DetectorEvent, DetectorReport, FieldSnapshot, LeniaParams } from '../core/types';
import { CpuLenia } from '../sim/cpu';
import { catalogByCode, catalogPattern, paramsOf } from '../sim/catalog';
import { snapshotFromCpu } from '../sim/snapshot';
import { createDetector } from './detector';
import { placeRotated, runSim, runSpecies } from './harness';
import { matchSignature, signatureDistance } from './signature';

const ORBIUM = paramsOf(catalogByCode('O2u')!);

function firstStep(events: { step: number; ev: DetectorEvent }[], pred: (e: DetectorEvent) => boolean): number {
  return events.find((x) => pred(x.ev))?.step ?? Infinity;
}

function runLogged(code: string, opts: Parameters<typeof runSpecies>[1]) {
  const log: { step: number; ev: DetectorEvent }[] = [];
  const reports: DetectorReport[] = [];
  const res = runSpecies(code, {
    ...opts,
    onReport: (r, sim) => {
      for (const ev of r.events) log.push({ step: r.step, ev });
      reports.push(r);
      return opts.onReport?.(r, sim);
    },
  });
  return { ...res, log, reports };
}

describe('detector: catalog creatures', () => {
  it('Orbium becomes stable within 500 steps and is a swimmer by 1500', () => {
    const { log, last } = runLogged('O2u', { size: 64, steps: 1500 });
    const born = log.filter((x) => x.ev.type === 'born');
    expect(born.length).toBe(1);
    expect(firstStep(log, (e) => e.type === 'stable')).toBeLessThanOrEqual(500);
    expect(firstStep(log, (e) => e.type === 'behavior' && e.behavior === 'swimmer')).toBeLessThanOrEqual(1500);
    expect(last.creatures.length).toBe(1);
    const c = last.creatures[0];
    expect(c.state).toBe('stable');
    expect(c.behavior).toBe('swimmer');
    // complexity is normalized to the reference Orbium
    expect(c.complexity).toBeGreaterThan(0.8);
    expect(c.complexity).toBeLessThan(1.2);
    // Orbium glides at ~0.6 cells/step
    expect(Math.hypot(c.vx, c.vy)).toBeGreaterThan(0.3);
    expect(log.some((x) => x.ev.type === 'died' || x.ev.type === 'exploded' || x.ev.type === 'divided')).toBe(false);
  });

  it('keeps the same id while Orbium swims across the wrap boundary', () => {
    const ids = new Set<number>();
    let wraps = 0;
    let prevX: number | null = null;
    let prevY: number | null = null;
    runSpecies('O2u', {
      size: 64,
      steps: 800,
      onReport: (r) => {
        for (const c of r.creatures) ids.add(c.id);
        const c = r.creatures[0];
        if (c && prevX !== null && prevY !== null) {
          if (Math.abs(c.x - prevX) > 32 || Math.abs(c.y - prevY) > 32) wraps++;
        }
        prevX = c?.x ?? prevX;
        prevY = c?.y ?? prevY;
      },
    });
    expect(wraps).toBeGreaterThanOrEqual(2); // it really crossed the edge
    expect([...ids]).toEqual([1]);
  });

  it('Circium ventilans is still; Scutium solidus glides (swimmer) in this implementation', () => {
    // Note: the design doc expected Scutium solidus to be "still", but with Chan's
    // polynomial kernel it glides at ~0.35 cells/step. Circium is the still one.
    const circ = runLogged('C0v', { size: 64, steps: 1200 });
    expect(circ.last.creatures.length).toBe(1);
    expect(circ.last.creatures[0].state).toBe('stable');
    expect(circ.last.creatures[0].behavior).toBe('still');
    const scut = runLogged('S1s', { size: 64, steps: 1200 });
    expect(scut.last.creatures.length).toBe(1);
    expect(scut.last.creatures[0].state).toBe('stable');
    expect(scut.last.creatures[0].behavior).toBe('swimmer');
  });

  it('Orbium printed twice (moved, rotated 90°) is recognized as the same species', () => {
    const a = runSpecies('O2u', { size: 64, steps: 1500 }).last.creatures[0];
    const b = runSpecies('O2u', { size: 64, steps: 1500, x: 12, y: 47, rotation: Math.PI / 2 }).last.creatures[0];
    const c = runSpecies('O2u', { size: 64, steps: 1500, x: 50, y: 20, rotation: 2.2 }).last.creatures[0];
    expect(a.behavior).toBe('swimmer');
    expect(b.behavior).toBe('swimmer');
    expect(matchSignature(b.signature, [a.signature])).toBe(0);
    expect(matchSignature(c.signature, [a.signature])).toBe(0);
    // ...and not as a Scutium
    const s = runSpecies('S1s', { size: 64, steps: 1500 }).last.creatures[0];
    expect(signatureDistance(a.signature, s.signature)).toBeGreaterThan(signatureDistance(a.signature, b.signature) * 3);
    expect(matchSignature(s.signature, [a.signature])).toBe(-1);
  });
});

describe('detector: behaviours', () => {
  it('Circium perturbed by a rotation pulses; Helicium cavus pedes spins in place', () => {
    const circ = runSpecies('C0v', { size: 64, steps: 1200, rotation: 0.7 }).last.creatures;
    expect(circ.length).toBe(1);
    expect(circ[0].behavior).toBe('pulsing');
    const hel = runSpecies('H3cp', { size: 64, steps: 1200 }).last.creatures;
    expect(hel.length).toBe(1);
    expect(hel[0].behavior).toBe('spinner');
    expect(Math.hypot(hel[0].vx, hel[0].vy)).toBeLessThan(0.05); // rotates on the spot
    const gyr = runSpecies('OG2g', { size: 64, steps: 1200 }).last.creatures;
    expect(gyr[0].behavior).toBe('spinner'); // swims in circles
  });

  it('three Circium side by side form a colony', () => {
    const params = paramsOf(catalogByCode('C0v')!);
    const sim = new CpuLenia(64, 64, params);
    for (const [x, y] of [
      [18, 18],
      [44, 18],
      [31, 40],
    ])
      sim.placeCentered(catalogPattern('C0v'), x, y);
    const { last } = runSim(sim, params, { steps: 1100 });
    expect(last.creatures.length).toBe(3);
    for (const c of last.creatures) {
      expect(c.state).toBe('stable');
      expect(c.behavior).toBe('colony');
    }
  });
});

describe('detector: division', () => {
  it('Orbium in its budding regime (σ = 0.0212) produces divided events with parent ids', () => {
    // Parorbium dividuus does not divide under our implementation: its catalog form is
    // a bound pair of half-orbia that never separates (it is reported as one creature).
    // What does divide is Orbium pushed to σ ≈ 0.021: it swells and buds off orbia.
    const { log, last } = runLogged('O2u', { size: 64, steps: 700, params: { sigma: 0.0212 } });
    const divided = log.filter((x) => x.ev.type === 'divided').map((x) => x.ev as Extract<DetectorEvent, { type: 'divided' }>);
    expect(divided.length).toBeGreaterThanOrEqual(2);
    const childIds = divided.flatMap((d) => d.childIds);
    for (const d of divided) expect(d.childIds.length).toBeGreaterThan(0);
    // every child is announced as born and carries its parent id
    for (const id of childIds) expect(log.some((x) => x.ev.type === 'born' && x.ev.id === id)).toBe(true);
    const kids = last.creatures.filter((c) => childIds.includes(c.id));
    expect(kids.length).toBeGreaterThan(0);
    for (const k of kids) expect(k.parentId).toBe(divided.find((d) => d.childIds.includes(k.id))!.parentId);
    // budded orbia stabilize
    expect(kids.some((k) => k.state === 'stable')).toBe(true);
  });
});

describe('detector: degenerate dishes', () => {
  function constantSnap(v: number, w: number, h: number, step: number): FieldSnapshot {
    return {
      w,
      h,
      scale: 2,
      gridW: w * 2,
      gridH: h * 2,
      value: new Float32Array(w * h).fill(v),
      grad: new Float32Array(w * h),
      step,
    };
  }

  it('a uniform soup has ~0 complexity and is exploded, never stable', () => {
    const det = createDetector();
    let r = det.update(constantSnap(0.5, 48, 60, 0), ORBIUM);
    for (let s = 10; s <= 600; s += 10) {
      r = det.update(constantSnap(0.5, 48, 60, s), ORBIUM);
      for (const c of r.creatures) {
        expect(c.state).not.toBe('stable');
        expect(c.complexity).toBeLessThan(0.01);
      }
      expect(r.events.some((e) => e.type === 'stable')).toBe(false);
    }
    expect(r.fill).toBeCloseTo(1, 5);
    expect(r.creatures.every((c) => c.state === 'exploded')).toBe(true);
  });

  it('white noise ends dead or exploded within 200 steps and is never stable', () => {
    for (const code of ['O2u', 'S1s']) {
      const params = paramsOf(catalogByCode(code)!);
      const sim = new CpuLenia(64, 64, params);
      let seed = 42;
      for (let i = 0; i < sim.A.length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        sim.A[i] = seed / 4294967296;
      }
      let stableEver = false;
      let at200: DetectorReport | null = null;
      runSim(sim, params, {
        steps: 400,
        onReport: (r) => {
          if (r.events.some((e) => e.type === 'stable') || r.creatures.some((c) => c.state === 'stable')) stableEver = true;
          if (r.step === 200) at200 = r;
        },
      });
      expect(stableEver).toBe(false);
      const r200 = at200 as DetectorReport | null;
      expect(r200).not.toBeNull();
      for (const c of r200!.creatures) expect(c.state).toBe('exploded');
    }
  });
});

describe('detector: performance', () => {
  it('updates a 96×120 snapshot with ~10 creatures in < 2 ms', () => {
    // Game-sized dish (192×240 grid, scale-2 snapshot) with 10 creatures drifting.
    const gw = 192;
    const gh = 240;
    const codes = ['O2u', 'S1s', 'O2u', 'OG2g', 'C0v', 'O2u', 'S1v', 'PG1c', 'O2b', 'S1s'];
    const pats = codes.map((c) => catalogPattern(c));
    const pos = codes.map((_, i) => ({ x: 32 + (i % 3) * 64, y: 30 + Math.floor(i / 3) * 60, a: i * 0.7 }));
    const det = createDetector();
    const A = new Float32Array(gw * gh);
    const times: number[] = [];
    let creatures = 0;
    for (let u = 0; u < 260; u++) {
      A.fill(0);
      // everything drifts together (no collisions), crossing the wrap now and then
      pats.forEach((p, i) => placeRotated(A, gw, gh, p, pos[i].x + u * 0.6, pos[i].y + u * 0.4, pos[i].a));
      const snap = snapshotFromCpu(A, gw, gh, 2, u * 10);
      const t0 = performance.now();
      const r = det.update(snap, ORBIUM as LeniaParams);
      const dt = performance.now() - t0;
      if (u >= 20) times.push(dt);
      creatures = r.creatures.length;
    }
    times.sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const p95 = times[Math.floor(times.length * 0.95)];
    console.log(`detector update (96x120, ${creatures} creatures): mean ${mean.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms, max ${times[times.length - 1].toFixed(3)} ms`);
    expect(creatures).toBe(10);
    // The median is robust to scheduler spikes on loaded CI machines; the budget is 2 ms/update.
    const median = times[Math.floor(times.length / 2)];
    expect(median).toBeLessThan(2);
  });
});

describe('detector: robustness', () => {
  it('many faint specks before a creature (raster order) do not hide the creature', () => {
    // 32×32 snapshot (64×64 dish). With R = 20 the speck threshold is 0.04·R² = 16 grid cells
    // of mass: 5×5 specks at 0.11 (mass 11) are ignored, a 6×6 blob at 0.8 (mass 115) is not.
    const w = 32;
    const h = 32;
    const value = new Float32Array(w * h);
    const fill = (x0: number, y0: number, n: number, v: number) => {
      for (let y = y0; y < y0 + n; y++) for (let x = x0; x < x0 + n; x++) value[y * w + x] = v;
    };
    fill(2, 2, 5, 0.11);
    fill(10, 2, 5, 0.11);
    fill(13, 20, 6, 0.8);
    const snap: FieldSnapshot = { w, h, scale: 2, gridW: 64, gridH: 64, value, grad: new Float32Array(w * h), step: 0 };
    const r = createDetector().update(snap, { ...ORBIUM, R: 20 });
    expect(r.creatures.length).toBe(1);
    expect(r.creatures[0].x).toBeCloseTo(32, 5); // blocks 13..18 → cells 26..37 → centre 32
    expect(r.creatures[0].y).toBeCloseTo(46, 5);
  });

  it('re-feeding the same step (stalled or lost GPU) changes nothing and emits nothing', () => {
    const params = paramsOf(catalogByCode('C0v')!);
    const sim = new CpuLenia(64, 64, params);
    placeRotated(sim.A, 64, 64, catalogPattern('C0v'), 32, 32, 0.7);
    const det = createDetector();
    const { last } = runSim(sim, params, { steps: 1200, detector: det });
    expect(last.creatures[0].behavior).toBe('pulsing');
    const frozen = snapshotFromCpu(sim.A, 64, 64, 2, sim.stepCount);
    for (let i = 0; i < 300; i++) {
      const r = det.update(frozen, params);
      expect(r.events).toEqual([]);
      expect(r.creatures.map((c) => [c.id, c.state, c.behavior])).toEqual(last.creatures.map((c) => [c.id, c.state, c.behavior]));
    }
    // Time moves again: the history was not flooded with copies, the pulse is still seen.
    const after = runSim(sim, params, { steps: sim.stepCount + 200, detector: det });
    expect(after.events.filter((e) => e.type === 'behavior')).toEqual([]);
    expect(after.last.creatures[0].behavior).toBe('pulsing');
  });
});
