import { kernelShell } from './cpu';

/**
 * Kernel tables for the GPU convolution.
 *
 * The GPU stores the field "lane packed": each texel holds L horizontally
 * adjacent cells (L = 4 in RGBA16F, 2 in RGBA8 with 16-bit cells, 1 otherwise),
 * so one fragment updates L cells and one fetch brings L inputs. For a fragment
 * at texel column X (cells X*L .. X*L+L-1) and row y:
 *
 *   u[X*L + o] = Σ_entries Σ_i  m[o*L + i] · (T(X + j, y + dy)[i] + T(X + j, y - dy)[i])
 *
 * (the second term only when dy > 0). Because the kernel is radial, rows +dy and
 * −dy share weights, so the two texels are summed before the multiply-adds:
 * half the arithmetic. Zero weights are dropped at code-generation time.
 */

/** Weights below this (after normalization) are skipped: their total effect is < 1e-7. */
const MIN_WEIGHT = 1e-10;

export interface KernelTap {
  dx: number;
  dy: number;
  w: number;
}

/** Non-zero normalized kernel taps; identical weights to cpu.ts buildKernelImage. */
export function kernelTaps(R: number, rings: number[]): KernelTap[] {
  const r = Math.ceil(R);
  const taps: KernelTap[] = [];
  let sum = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const v = kernelShell(Math.hypot(dx, dy) / R, rings);
      if (v <= 0) continue;
      taps.push({ dx, dy, w: v });
      sum += v;
    }
  }
  for (const t of taps) t.w /= sum;
  return taps;
}

export interface PackedEntry {
  /** Texel column offset. */
  j: number;
  /** Row offset (>= 0; rows ±dy are summed when dy > 0). */
  dy: number;
  /** L×L weights, m[o * L + i]: output lane o, input lane i. */
  m: number[];
}

export interface PackedKernel {
  lanes: number;
  entries: PackedEntry[];
  /** Texture fetches per fragment (= per `lanes` cells). */
  fetches: number;
  /** Non-zero multiply-adds per fragment. */
  mads: number;
}

export function buildPackedKernel(R: number, rings: number[], lanes: number): PackedKernel {
  const L = lanes;
  const r = Math.ceil(R);
  const weight = new Map<number, number>();
  const key = (dx: number, dy: number) => (dy + 64) * 256 + (dx + 128);
  for (const t of kernelTaps(R, rings)) weight.set(key(t.dx, t.dy), t.w);
  const entries: PackedEntry[] = [];
  let fetches = 0;
  let mads = 0;
  const jmax = Math.ceil((r + L) / L);
  for (let dy = 0; dy <= r; dy++) {
    for (let j = -jmax; j <= jmax; j++) {
      const m = new Array<number>(L * L).fill(0);
      let any = false;
      for (let o = 0; o < L; o++) {
        for (let i = 0; i < L; i++) {
          const w = weight.get(key(j * L + i - o, dy)) ?? 0;
          if (w > MIN_WEIGHT) {
            m[o * L + i] = w;
            any = true;
            mads++;
          }
        }
      }
      if (any) {
        entries.push({ j, dy, m });
        fetches += dy > 0 ? 2 : 1;
      }
    }
  }
  // The centre texel is always fetched (for the update itself) even if it has no weights.
  if (!entries.some((e) => e.j === 0 && e.dy === 0)) fetches++;
  return { lanes: L, entries, fetches, mads };
}

/**
 * CPU emulation of the packed convolution (for unit tests): returns u = K * A
 * computed exactly the way the generated shader does.
 */
export function packedConvolve(A: Float32Array, w: number, h: number, pk: PackedKernel): Float64Array {
  const L = pk.lanes;
  const Wt = w / L;
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let X = 0; X < Wt; X++) {
      for (const e of pk.entries) {
        const tx = (((X + e.j) % Wt) + Wt) % Wt;
        const yp = (y + e.dy) % h;
        const ym = (((y - e.dy) % h) + h) % h;
        for (let i = 0; i < L; i++) {
          let t = A[yp * w + tx * L + i];
          if (e.dy > 0) t += A[ym * w + tx * L + i];
          for (let o = 0; o < L; o++) out[y * w + X * L + o] += e.m[o * L + i] * t;
        }
      }
    }
  }
  return out;
}

/** Largest lane count (4, 2 or 1) dividing the grid width, capped by `max`. */
export function lanesFor(gridW: number, max: number): number {
  for (const L of [4, 2, 1]) if (L <= max && gridW % L === 0) return L;
  return 1;
}
