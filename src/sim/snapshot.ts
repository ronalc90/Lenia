import type { FieldSnapshot } from '../core/types';

/**
 * Field snapshots: the downsampled view of the dish the detector works on.
 *
 * `snapshotFromCpu` is the reference definition. The GPU snapshot pass in
 * webgl.ts computes exactly the same quantities (then quantizes them to 16 bits):
 *
 *   value[b] = mean over the cells of block b of A
 *   grad[b]  = mean over the cells of block b of
 *              sqrt(((A[x+1] - A[x-1]) / 2)^2 + ((A[y+1] - A[y-1]) / 2)^2)
 *
 * with toroidal wrap for the neighbours. Block b = (bx, by) covers cells
 * x in [bx*scale, bx*scale + scale), y likewise. If the grid is not a multiple
 * of `scale` the last block only averages the cells that exist.
 */

/**
 * Gradients travel through the GPU readback as 16-bit fixed point of
 * `grad / GRAD_ENCODE_MAX`. The steepest possible central-difference gradient
 * of a 0..1 field is √2/2 ≈ 0.707, so a range of 1.0 never clips, and 16 bits
 * still give 1.5e-5 resolution (typical creature edges are 0.03–0.25).
 */
export const GRAD_ENCODE_MAX = 1;

/** Snapshot dimensions for a grid and scale. */
export function snapshotSize(gridW: number, gridH: number, scale: number): { w: number; h: number } {
  return { w: Math.ceil(gridW / scale), h: Math.ceil(gridH / scale) };
}

/** Pure CPU snapshot with the exact semantics of the GPU `snapshot()`. */
export function snapshotFromCpu(A: Float32Array, w: number, h: number, scale = 2, step = 0): FieldSnapshot {
  if (A.length < w * h) throw new Error('snapshotFromCpu: array smaller than w*h');
  const s = Math.max(1, Math.floor(scale));
  const { w: sw, h: sh } = snapshotSize(w, h, s);
  const value = new Float32Array(sw * sh);
  const grad = new Float32Array(sw * sh);
  for (let by = 0; by < sh; by++) {
    const y0 = by * s;
    const y1 = Math.min(h, y0 + s);
    for (let bx = 0; bx < sw; bx++) {
      const x0 = bx * s;
      const x1 = Math.min(w, x0 + s);
      let sv = 0;
      let sg = 0;
      for (let y = y0; y < y1; y++) {
        const row = y * w;
        const up = ((y + h - 1) % h) * w;
        const down = ((y + 1) % h) * w;
        for (let x = x0; x < x1; x++) {
          const left = (x + w - 1) % w;
          const right = (x + 1) % w;
          sv += A[row + x];
          const gx = (A[row + right] - A[row + left]) * 0.5;
          const gy = (A[down + x] - A[up + x]) * 0.5;
          sg += Math.sqrt(gx * gx + gy * gy);
        }
      }
      const n = (x1 - x0) * (y1 - y0);
      value[by * sw + bx] = sv / n;
      grad[by * sw + bx] = sg / n;
    }
  }
  return { w: sw, h: sh, scale: s, gridW: w, gridH: h, value, grad, step };
}

// ── 16-bit fixed point packing in two 8-bit channels (shared with the shaders) ──

/** Encode v in [0, 1] as 16-bit fixed point split into (hi, lo) bytes. */
export function pack16(v: number): [number, number] {
  const q = Math.round(Math.min(1, Math.max(0, v)) * 65535);
  const hi = Math.floor(q / 256);
  return [hi, q - hi * 256];
}

/** Inverse of pack16. */
export function unpack16(hi: number, lo: number): number {
  return (hi * 256 + lo) / 65535;
}

/**
 * Decode the RGBA8 pixels of the GPU snapshot pass: R,G = value (16-bit),
 * B,A = gradient (16-bit, scaled by GRAD_ENCODE_MAX). Rows are in grid order.
 */
export function decodeSnapshotPixels(
  px: Uint8Array,
  w: number,
  h: number,
  scale: number,
  gridW: number,
  gridH: number,
  step: number,
): FieldSnapshot {
  const n = w * h;
  const value = new Float32Array(n);
  const grad = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    value[i] = (px[o] * 256 + px[o + 1]) / 65535;
    grad[i] = ((px[o + 2] * 256 + px[o + 3]) / 65535) * GRAD_ENCODE_MAX;
  }
  return { w, h, scale, gridW, gridH, value, grad, step };
}

/** Decode RGBA8 pixels whose R,G channels hold one 16-bit cell value each. */
export function decodeValuePixels(px: Uint8Array, n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (px[i * 4] * 256 + px[i * 4 + 1]) / 65535;
  return out;
}
