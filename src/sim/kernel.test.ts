import { describe, expect, it } from 'vitest';
import { buildKernelImage } from './cpu';
import { buildPackedKernel, kernelTaps, lanesFor, packedConvolve } from './kernel';

function directConvolve(A: Float32Array, w: number, h: number, R: number, rings: number[]): Float64Array {
  const k = buildKernelImage(w, h, R, rings);
  const out = new Float64Array(w * h);
  const r = Math.ceil(R);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const kv = k[((dy + h) % h) * w + ((dx + w) % w)];
          if (kv === 0) continue;
          s += kv * A[((y + dy + h) % h) * w + ((x + dx + w) % w)];
        }
      }
      out[y * w + x] = s;
    }
  }
  return out;
}

describe('kernel tables', () => {
  it('taps are normalized and radially symmetric', () => {
    for (const [R, rings] of [
      [13, [1]],
      [18, [0.5, 1, 2 / 3]],
      [27, [1, 1 / 3]],
    ] as [number, number[]][]) {
      const taps = kernelTaps(R, rings);
      const sum = taps.reduce((a, t) => a + t.w, 0);
      expect(sum).toBeCloseTo(1, 10);
      const map = new Map(taps.map((t) => [`${t.dx},${t.dy}`, t.w]));
      for (const t of taps) {
        expect(map.get(`${-t.dx},${t.dy}`)).toBeCloseTo(t.w, 12);
        expect(map.get(`${t.dy},${t.dx}`)).toBeCloseTo(t.w, 12);
      }
      expect(map.has('0,0')).toBe(false);
    }
  });

  it('packed convolution equals direct convolution for 1, 2 and 4 lanes', () => {
    const w = 40;
    const h = 36;
    const A = new Float32Array(w * h);
    let s = 7;
    for (let i = 0; i < A.length; i++) A[i] = (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
    for (const [R, rings] of [
      [13, [1]],
      [9, [0.5, 1, 2 / 3]],
    ] as [number, number[]][]) {
      const ref = directConvolve(A, w, h, R, rings);
      for (const L of [1, 2, 4]) {
        const pk = buildPackedKernel(R, rings, L);
        const u = packedConvolve(A, w, h, pk);
        let maxErr = 0;
        for (let i = 0; i < u.length; i++) maxErr = Math.max(maxErr, Math.abs(u[i] - ref[i]));
        expect(maxErr).toBeLessThan(1e-9);
      }
    }
  });

  it('lane packing cuts fetches several-fold at R = 13', () => {
    const k1 = buildPackedKernel(13, [1], 1);
    const k4 = buildPackedKernel(13, [1], 4);
    // per-cell fetches
    expect(k4.fetches / 4).toBeLessThan(k1.fetches / 6);
    expect(lanesFor(192, 4)).toBe(4);
    expect(lanesFor(130, 4)).toBe(2);
    expect(lanesFor(131, 4)).toBe(1);
    expect(lanesFor(192, 2)).toBe(2);
  });
});
