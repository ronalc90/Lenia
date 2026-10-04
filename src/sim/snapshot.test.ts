import { describe, expect, it } from 'vitest';
import { CpuLenia } from './cpu';
import { catalogByCode, catalogPattern, paramsOf } from './catalog';
import { decodeSnapshotPixels, pack16, snapshotFromCpu, snapshotSize, unpack16 } from './snapshot';

describe('snapshotFromCpu', () => {
  it('block-averages values and has the documented size', () => {
    const w = 6;
    const h = 4;
    const A = new Float32Array(w * h);
    for (let i = 0; i < A.length; i++) A[i] = i / A.length;
    const s = snapshotFromCpu(A, w, h, 2, 7);
    expect(s.w).toBe(3);
    expect(s.h).toBe(2);
    expect(s.step).toBe(7);
    expect(s.gridW).toBe(6);
    // block (1, 1) = cells (2..3, 2..3)
    const idx = (x: number, y: number) => y * w + x;
    const mean = (A[idx(2, 2)] + A[idx(3, 2)] + A[idx(2, 3)] + A[idx(3, 3)]) / 4;
    expect(s.value[1 * 3 + 1]).toBeCloseTo(mean, 6);
  });

  it('a uniform field has zero gradient and constant value', () => {
    const A = new Float32Array(16 * 8).fill(0.37);
    const s = snapshotFromCpu(A, 16, 8, 2);
    for (let i = 0; i < s.value.length; i++) {
      expect(s.value[i]).toBeCloseTo(0.37, 6);
      expect(s.grad[i]).toBe(0);
    }
  });

  it('computes central differences with toroidal wrap', () => {
    // A linear ramp in x: interior gradient is 0.5 * (2 * slope) / 2 = slope.
    const w = 8;
    const h = 4;
    const A = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) A[y * w + x] = x / 10;
    const s = snapshotFromCpu(A, w, h, 1);
    expect(s.grad[1 * w + 3]).toBeCloseTo(0.1, 6);
    // x = 0 wraps to x = 7: (A[1] - A[7]) / 2 = (0.1 - 0.7) / 2 = -0.3
    expect(s.grad[1 * w + 0]).toBeCloseTo(0.3, 6);
    expect(s.grad[1 * w + 7]).toBeCloseTo(0.3, 6);
  });

  it('handles grids that are not a multiple of the scale', () => {
    const A = new Float32Array(5 * 3).fill(1);
    const s = snapshotFromCpu(A, 5, 3, 2);
    expect(snapshotSize(5, 3, 2)).toEqual({ w: 3, h: 2 });
    expect(s.w).toBe(3);
    expect(s.h).toBe(2);
    for (const v of s.value) expect(v).toBeCloseTo(1, 6);
  });

  it('total mass is preserved by the block mean (Orbium)', () => {
    const e = catalogByCode('O2u')!;
    const sim = new CpuLenia(64, 64, paramsOf(e));
    sim.placeCentered(catalogPattern('O2u'), 32, 32);
    sim.step(20);
    const s = snapshotFromCpu(sim.A, 64, 64, 2);
    const snapMass = s.value.reduce((a, b) => a + b, 0) * 4;
    expect(snapMass).toBeCloseTo(sim.mass(), 2);
    // Orbium has real edges: mean gradient is clearly non-zero but well below the max.
    const maxG = Math.max(...s.grad);
    expect(maxG).toBeGreaterThan(0.03);
    expect(maxG).toBeLessThan(0.71);
  });
});

describe('16-bit packing', () => {
  it('round-trips with 1/65535 precision', () => {
    for (const v of [0, 1, 0.5, 0.123456, 0.999, 1e-5]) {
      const [hi, lo] = pack16(v);
      expect(hi).toBeLessThan(256);
      expect(lo).toBeLessThan(256);
      expect(Math.abs(unpack16(hi, lo) - v)).toBeLessThanOrEqual(0.5 / 65535 + 1e-12);
    }
  });

  it('decodes snapshot pixels', () => {
    const px = new Uint8Array(8);
    px.set([...pack16(0.25), ...pack16(0.1)], 0);
    px.set([...pack16(1), ...pack16(0)], 4);
    const s = decodeSnapshotPixels(px, 2, 1, 2, 4, 2, 3);
    expect(s.value[0]).toBeCloseTo(0.25, 4);
    expect(s.grad[0]).toBeCloseTo(0.1, 4);
    expect(s.value[1]).toBe(1);
    expect(s.grad[1]).toBe(0);
  });
});
