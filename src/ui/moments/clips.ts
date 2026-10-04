/**
 * Real Lenia for the explainer diagrams: tiny CPU worlds (src/sim/cpu.ts, the
 * verified reference) simulated a few steps per animation frame and recorded
 * as frames, then replayed in loops. Nothing here is a hand-drawn fake: a
 * "dissolves" diagram is a real spore dissolving, an Orbium really swims.
 *
 * Clips are cached by key, so re-opening a card or the help sheet reuses them.
 */
import { matterLUT } from '../../core/palette';
import type { LeniaParams } from '../../core/types';
import { CpuLenia } from '../../sim/cpu';
import { catalogByCode, catalogPattern, paramsOf } from '../../sim/catalog';
import { applySeedCpu } from '../../sim/seed';

const LUT = matterLUT();

export interface ClipSpec {
  key: string;
  /** Grid side (power of two). */
  N: number;
  params: LeniaParams;
  /** Put the initial matter in. */
  init(sim: CpuLenia): void;
  /** Frames to record (frame 0 = the initial state). */
  frames: number;
  /** Simulation steps between recorded frames. */
  every: number;
  /** Steps simulated before frame 0 (settle a catalog creature). */
  warmup?: number;
}

export interface ClipFrame {
  /** Matter quantized to 0..255, N×N. */
  a: Uint8Array;
  /** Mass-weighted centre on the torus (cells) and total mass. */
  cx: number;
  cy: number;
  mass: number;
  /** Fraction of cells with matter > 0.1. */
  fill: number;
}

export class LeniaClip {
  readonly N: number;
  readonly frames: ClipFrame[] = [];
  readonly total: number;
  private sim: CpuLenia | null;
  private spec: ClipSpec;
  private stepsToNext = 0;
  readonly canvas: HTMLCanvasElement | null;
  private ctx: CanvasRenderingContext2D | null = null;
  private img: ImageData | null = null;
  private painted = -1;
  private paintedTint = '';

  constructor(spec: ClipSpec) {
    this.spec = spec;
    this.N = spec.N;
    this.total = spec.frames;
    this.sim = new CpuLenia(spec.N, spec.N, spec.params);
    spec.init(this.sim);
    if (spec.warmup) this.sim.step(spec.warmup);
    this.record();
    this.stepsToNext = spec.every;
    this.canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (this.canvas) {
      this.canvas.width = spec.N;
      this.canvas.height = spec.N;
      this.ctx = this.canvas.getContext('2d');
    }
  }

  get done(): boolean {
    return this.frames.length >= this.total;
  }

  /** Simulate up to `maxSteps` more steps; returns true once every frame is recorded. */
  pump(maxSteps: number): boolean {
    const sim = this.sim;
    if (!sim || this.done) {
      this.sim = null;
      return true;
    }
    let budget = maxSteps;
    while (budget > 0 && !this.done) {
      const n = Math.min(budget, this.stepsToNext);
      sim.step(n);
      budget -= n;
      this.stepsToNext -= n;
      if (this.stepsToNext <= 0) {
        this.record();
        this.stepsToNext = this.spec.every;
      }
    }
    if (this.done) this.sim = null; // free the FFT buffers
    return this.done;
  }

  private record(): void {
    const sim = this.sim!;
    const N = this.N;
    const a = new Uint8Array(N * N);
    const k = (Math.PI * 2) / N;
    let sx = 0;
    let cx2 = 0;
    let sy = 0;
    let cy2 = 0;
    let mass = 0;
    let filled = 0;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const v = sim.A[i];
        a[i] = Math.round(Math.min(1, Math.max(0, v)) * 255);
        mass += v;
        if (v > 0.1) filled++;
        if (v > 0.05) {
          sx += v * Math.sin(x * k);
          cx2 += v * Math.cos(x * k);
          sy += v * Math.sin(y * k);
          cy2 += v * Math.cos(y * k);
        }
      }
    const cx = mass > 0 ? (((Math.atan2(sx, cx2) / k) % N) + N) % N : N / 2;
    const cy = mass > 0 ? (((Math.atan2(sy, cy2) / k) % N) + N) % N : N / 2;
    this.frames.push({ a, cx, cy, mass, fill: filled / (N * N) });
  }

  /** Frame i (clamped to what is recorded so far). */
  frame(i: number): ClipFrame {
    return this.frames[Math.max(0, Math.min(this.frames.length - 1, Math.floor(i)))];
  }

  /**
   * Paint frame i into the clip canvas through the matter colormap. `tint`
   * ('grey', 'warn') desaturates/recolours it (e.g. a dish that pays nothing).
   */
  paint(i: number, tint: '' | 'grey' | 'warn' = ''): HTMLCanvasElement | null {
    const idx = Math.max(0, Math.min(this.frames.length - 1, Math.floor(i)));
    if (!this.ctx || !this.canvas) return null;
    if (idx === this.painted && tint === this.paintedTint) return this.canvas;
    const N = this.N;
    if (!this.img) this.img = this.ctx.createImageData(N, N);
    const d = this.img.data;
    const a = this.frames[idx].a;
    for (let p = 0; p < N * N; p++) {
      const li = a[p] * 4;
      let r = LUT[li];
      let g = LUT[li + 1];
      let b = LUT[li + 2];
      if (tint === 'grey') {
        const l = r * 0.3 + g * 0.59 + b * 0.11;
        r = g = b = l * 0.8;
      } else if (tint === 'warn') {
        const l = (r * 0.3 + g * 0.59 + b * 0.11) / 255;
        r = 242 * l + 30 * (1 - l);
        g = 140 * l + 20 * (1 - l);
        b = 60 * l + 20 * (1 - l);
      }
      d[p * 4] = r;
      d[p * 4 + 1] = g;
      d[p * 4 + 2] = b;
      d[p * 4 + 3] = LUT[li + 3];
    }
    this.ctx.putImageData(this.img, 0, 0);
    this.painted = idx;
    this.paintedTint = tint;
    return this.canvas;
  }
}

// ───────────────────────────── the clips the diagrams use ─────────────────────────────

const ORBIUM = catalogByCode('O2u')!;

/** A game-like spore (src/game/game.ts buildSeed): catalog template + smoothed asymmetric noise. */
function spore(sim: CpuLenia, opts: { bias: number; density: number; noise: number; seed: number; code?: string }): void {
  const N = sim.w;
  applySeedCpu(sim.A, N, N, {
    x: N / 2,
    y: N / 2,
    radius: 13,
    density: opts.density,
    noise: opts.noise,
    shape: 'blob',
    pattern: catalogPattern(opts.code ?? 'O2u'),
    bias: opts.bias,
    rotation: opts.seed * 1.1,
    rngSeed: opts.seed * 7919,
  });
}

function creature(code: string) {
  return (sim: CpuLenia) => sim.placeCentered(catalogPattern(code), sim.w / 2, sim.h / 2);
}

/**
 * Specs measured with the CPU reference (scripts in docs/MOMENTOS.md §Clips):
 *  - fade      a spore with no template at Orbium rules: gone in ~10 steps (dt 0.1);
 *              simulated at dt 0.02 so the fade is visible (same dynamics, finer time).
 *  - flood     μ 0.35, σ 0.2: any blob fills the whole box (fill 0.1 → 0.94 in ~40 steps).
 *  - live      spore with bias 0.88 (seed 1) settles into a real Orbium (mass ≈ 73).
 *  - swim      Orbium unicaudatus, ~0.6 cells/step.
 *  - spin      Gyrorbium gyrans circles in place (radius ≈ 4 cells).
 *  - pulse     Circium ventilans: still, mass oscillates ±6.6 %.
 *  - still     Helicium solidus: does not move (5 cells in 600 steps).
 *  - overgrow  Orbium at σ 0.025: buds into ~25 blobs and floods the box.
 */
export const CLIP_SPECS = {
  fade: {
    key: 'fade',
    N: 64,
    params: { ...paramsOf(ORBIUM), dt: 0.02 },
    init: (s: CpuLenia) => spore(s, { bias: 0, density: 0.5, noise: 0.5, seed: 1 }),
    frames: 36,
    every: 2,
  },
  flood: {
    key: 'flood',
    N: 64,
    params: { R: 13, rings: [1], mu: 0.35, sigma: 0.2, dt: 0.1 },
    init: (s: CpuLenia) => spore(s, { bias: 0, density: 0.7, noise: 0.5, seed: 2 }),
    frames: 36,
    every: 2,
  },
  live: {
    key: 'live',
    N: 64,
    params: paramsOf(ORBIUM),
    init: (s: CpuLenia) => spore(s, { bias: 0.88, density: 0.7, noise: 0.35, seed: 1 }),
    frames: 40,
    every: 3,
  },
  swim: {
    key: 'swim',
    N: 64,
    params: paramsOf(ORBIUM),
    init: creature('O2u'),
    warmup: 20,
    frames: 60,
    every: 3,
  },
  spin: {
    key: 'spin',
    N: 64,
    params: paramsOf(catalogByCode('OG2g')!),
    init: creature('OG2g'),
    warmup: 40,
    frames: 60,
    every: 3,
  },
  pulse: {
    key: 'pulse',
    N: 64,
    params: paramsOf(catalogByCode('C0v')!),
    init: creature('C0v'),
    warmup: 60,
    frames: 60,
    every: 2,
  },
  still: {
    key: 'still',
    N: 64,
    params: paramsOf(catalogByCode('H3s')!),
    init: creature('H3s'),
    warmup: 20,
    frames: 30,
    every: 4,
  },
  overgrow: {
    key: 'overgrow',
    N: 64,
    params: { ...paramsOf(ORBIUM), sigma: 0.025 },
    init: creature('O2u'),
    frames: 50,
    every: 3,
  },
} satisfies Record<string, ClipSpec>;

export type ClipName = keyof typeof CLIP_SPECS;

const cache = new Map<string, LeniaClip>();

/** Shared clip by name (or a custom spec, cached by its key). */
export function clip(spec: ClipName | ClipSpec): LeniaClip {
  const s = typeof spec === 'string' ? CLIP_SPECS[spec] : spec;
  let c = cache.get(s.key);
  if (!c) {
    c = new LeniaClip(s);
    cache.set(s.key, c);
  }
  return c;
}

/** "Same spore, other rules": the live spore under the player's (μ, σ, R, dt). */
export function rulesClip(p: { mu: number; sigma: number; R: number; dt: number }): LeniaClip {
  const R = Math.max(6, Math.min(20, Math.round(p.R)));
  const key = `rules:${p.mu.toFixed(4)}:${p.sigma.toFixed(5)}:${R}:${p.dt.toFixed(3)}`;
  return clip({
    key,
    N: 64,
    params: { R, rings: [1], mu: p.mu, sigma: p.sigma, dt: Math.max(0.02, Math.min(0.5, p.dt)) },
    init: (s) => spore(s, { bias: 0.88, density: 0.7, noise: 0.35, seed: 1 }),
    frames: 40,
    every: 3,
  });
}

/** Pump the unfinished clips a little, round-robin (call once per animation frame). Budget in simulation steps. */
export function pumpAll(clips: LeniaClip[], budget = 12): void {
  const todo = clips.filter((c) => !c.done);
  if (!todo.length) return;
  const per = Math.max(1, Math.ceil(budget / todo.length));
  for (const c of todo) c.pump(per);
}

/** Connected blobs (matter > 0.1, 8-neighbour, toroidal) of a frame: "how many creatures". */
export function countBlobs(f: ClipFrame, N: number, minCells = 6): number {
  const lab = new Int32Array(N * N);
  const stack: number[] = [];
  let n = 0;
  for (let i = 0; i < N * N; i++) {
    if (f.a[i] <= 26 || lab[i]) continue;
    let size = 0;
    lab[i] = 1;
    stack.push(i);
    while (stack.length) {
      const k = stack.pop()!;
      size++;
      const x = k % N;
      const y = (k / N) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const j = ((y + dy + N) % N) * N + ((x + dx + N) % N);
          if (f.a[j] > 26 && !lab[j]) {
            lab[j] = 1;
            stack.push(j);
          }
        }
    }
    if (size >= minCells) n++;
  }
  return n;
}
