/**
 * CPU harness for detector tests and calibration (not used by the game at runtime):
 * runs a catalog species in CpuLenia and feeds snapshots to a detector, exactly the
 * way the game does (scale-2 snapshot every 10 steps).
 */
import type { Detector, DetectorReport, LeniaParams, Pattern } from '../core/types';
import { CpuLenia } from '../sim/cpu';
import { catalogByCode, catalogPattern, paramsOf } from '../sim/catalog';
import { snapshotFromCpu } from '../sim/snapshot';
import { createDetector } from './detector';

/** Write `p` rotated by `angle` (radians) centred at (cx, cy), bilinear, max-blended, wrapping. */
export function placeRotated(A: Float32Array, w: number, h: number, p: Pattern, cx: number, cy: number, angle: number): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rad = Math.ceil(Math.hypot(p.w, p.h) / 2) + 1;
  const sample = (lx: number, ly: number): number => {
    // pixel i is centred at i + 0.5
    const fx = lx - 0.5;
    const fy = ly - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= p.w || y >= p.h ? 0 : p.data[y * p.w + x]);
    return (
      at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty) + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty
    );
  };
  for (let j = -rad; j <= rad; j++) {
    for (let i = -rad; i <= rad; i++) {
      const gx = Math.floor(cx) + i;
      const gy = Math.floor(cy) + j;
      const dx = gx + 0.5 - cx;
      const dy = gy + 0.5 - cy;
      const lx = c * dx + s * dy + p.w / 2;
      const ly = -s * dx + c * dy + p.h / 2;
      const v = sample(lx, ly);
      if (v <= 0) continue;
      const k = (((gy % h) + h) % h) * w + (((gx % w) + w) % w);
      if (v > A[k]) A[k] = v;
    }
  }
}

export interface RunOptions {
  /** Square grid side (power of 2). Default 64. */
  size?: number;
  steps: number;
  /** Steps between detector updates. Default 10. */
  every?: number;
  /** Snapshot scale. Default 2. */
  scale?: number;
  /** Placement centre (default dish centre) and rotation in radians. */
  x?: number;
  y?: number;
  rotation?: number;
  /** Parameter overrides on top of the species' catalog params. */
  params?: Partial<LeniaParams>;
  /** Template override (default: the species' catalog pattern). */
  pattern?: Pattern;
  detector?: Detector;
  /** Called after every detector update. Return true to stop early. */
  onReport?: (r: DetectorReport, sim: CpuLenia) => boolean | void;
}

export interface RunResult {
  sim: CpuLenia;
  params: LeniaParams;
  detector: Detector;
  last: DetectorReport;
  /** Every event seen during the run, in order. */
  events: DetectorReport['events'];
}

export function runSpecies(code: string, o: RunOptions): RunResult {
  const e = catalogByCode(code);
  if (!e) throw new Error(`unknown species ${code}`);
  const params = { ...paramsOf(e), ...(o.params ?? {}) };
  const size = o.size ?? 64;
  const sim = new CpuLenia(size, size, params);
  const p = o.pattern ?? catalogPattern(code);
  const cx = o.x ?? size / 2;
  const cy = o.y ?? size / 2;
  if (!o.rotation) sim.placeCentered(p, cx, cy);
  else placeRotated(sim.A, size, size, p, cx, cy, o.rotation);
  return runSim(sim, params, o);
}

/** Feed an already prepared simulation to a detector. */
export function runSim(sim: CpuLenia, params: LeniaParams, o: Omit<RunOptions, 'size' | 'x' | 'y' | 'rotation' | 'pattern'>): RunResult {
  const detector = o.detector ?? createDetector();
  const every = o.every ?? 10;
  const scale = o.scale ?? 2;
  const events: DetectorReport['events'] = [];
  let last = detector.update(snapshotFromCpu(sim.A, sim.w, sim.h, scale, sim.stepCount), params);
  events.push(...last.events);
  if (!o.onReport?.(last, sim)) {
    while (sim.stepCount < o.steps) {
      sim.step(every);
      last = detector.update(snapshotFromCpu(sim.A, sim.w, sim.h, scale, sim.stepCount), params);
      events.push(...last.events);
      if (o.onReport?.(last, sim)) break;
    }
  }
  return { sim, params, detector, last, events };
}
