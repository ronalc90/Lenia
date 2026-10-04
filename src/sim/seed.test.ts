import { describe, expect, it } from 'vitest';
import { catalogPattern } from './catalog';
import { CpuLenia } from './cpu';
import { applyEraseCpu, applySeedCpu, hash2, patternContentRadius, resolveSeed, vnoise } from './seed';

const W = 64;
const H = 48;

describe('seed CPU mirror', () => {
  it('an unrotated pattern seed with no noise equals CpuLenia.placeCentered', () => {
    const pat = catalogPattern('O2u');
    const a = new Float32Array(W * H);
    applySeedCpu(a, W, H, { x: 30, y: 20, radius: 20, density: 1, noise: 0, shape: 'pattern', pattern: pat });
    const ref = new CpuLenia(64, 64, { R: 13, rings: [1], mu: 0.15, sigma: 0.015, dt: 0.1 });
    ref.placeCentered(pat, 30, 20);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) expect(a[y * W + x]).toBeCloseTo(ref.A[y * 64 + x], 6);
  });

  it('is deterministic per rngSeed and different across seeds', () => {
    const spec = { x: 32, y: 24, radius: 12, density: 0.8, noise: 0.6, shape: 'blob' as const, rngSeed: 42 };
    const a = new Float32Array(W * H);
    const b = new Float32Array(W * H);
    const c = new Float32Array(W * H);
    applySeedCpu(a, W, H, spec);
    applySeedCpu(b, W, H, spec);
    applySeedCpu(c, W, H, { ...spec, rngSeed: 43 });
    expect(a).toEqual(b);
    let d = 0;
    for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - c[i]));
    expect(d).toBeGreaterThan(0.05);
  });

  it('noise makes seeds asymmetric (a symmetric seed could never swim)', () => {
    const a = new Float32Array(W * H);
    applySeedCpu(a, W, H, { x: 32, y: 24, radius: 12, density: 0.7, noise: 0.5, shape: 'blob', rngSeed: 7 });
    let asym = 0;
    for (let dy = -10; dy <= 10; dy++) {
      for (let dx = -10; dx <= 10; dx++) {
        const p = a[(24 + dy) * W + 32 + dx];
        const q = a[(23 - dy) * W + 31 - dx]; // point reflection through (32, 24)
        asym = Math.max(asym, Math.abs(p - q));
      }
    }
    expect(asym).toBeGreaterThan(0.1);
    // without noise the blob is point-symmetric
    const s = new Float32Array(W * H);
    applySeedCpu(s, W, H, { x: 32, y: 24, radius: 12, density: 0.7, noise: 0, shape: 'blob' });
    expect(Math.abs(s[(24 + 3) * W + 32 + 5] - s[(23 - 3) * W + 31 - 5])).toBeLessThan(1e-6);
  });

  it('all shapes stay inside the radius, wrap around the torus and max-combine', () => {
    for (const shape of ['blob', 'ring', 'noise'] as const) {
      const a = new Float32Array(W * H).fill(0);
      a[10 * W + 10] = 0.95; // existing matter far away survives (max-combine)
      applySeedCpu(a, W, H, { x: 1, y: 1, radius: 8, density: 0.8, noise: 0.4, shape, rngSeed: 3 });
      expect(a[10 * W + 10]).toBeCloseTo(0.95, 6);
      let mass = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const v = a[y * W + x];
          if (y === 10 && x === 10) continue;
          mass += v;
          const dx = Math.min(Math.abs(x + 0.5 - 1), W - Math.abs(x + 0.5 - 1));
          const dy = Math.min(Math.abs(y + 0.5 - 1), H - Math.abs(y + 0.5 - 1));
          if (Math.hypot(dx, dy) >= 8) expect(v).toBe(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
      expect(mass).toBeGreaterThan(5);
      // wrapped: matter on the far side of the grid
      expect(a[(H - 2) * W + (W - 2)]).toBeGreaterThan(0);
    }
  });

  it('bias blends the template into a random seed', () => {
    const pat = catalogPattern('O2u');
    const base = { x: 32, y: 24, radius: 13, density: 0.6, noise: 0, shape: 'blob' as const, pattern: pat };
    const b0 = new Float32Array(W * H);
    const b1 = new Float32Array(W * H);
    const tp = new Float32Array(W * H);
    applySeedCpu(b0, W, H, { ...base, bias: 0 });
    applySeedCpu(b1, W, H, { ...base, bias: 1 });
    applySeedCpu(tp, W, H, { ...base, shape: 'pattern' });
    let d0 = 0;
    let d1 = 0;
    for (let i = 0; i < tp.length; i++) {
      d0 = Math.max(d0, Math.abs(b0[i] - tp[i]));
      d1 = Math.max(d1, Math.abs(b1[i] - tp[i]));
    }
    expect(d0).toBeGreaterThan(0.2);
    expect(d1).toBeLessThan(1e-6);
  });

  it('pattern seeds shrink only when they do not fit the radius (or patternScale is given)', () => {
    const pat = catalogPattern('O2u');
    const half = Math.max(pat.w, pat.h) / 2;
    expect(patternContentRadius(pat)).toBeGreaterThan(5);
    // the game prints with radius = max(w, h) / 2 → exact size
    expect(resolveSeed({ x: 0, y: 0, radius: half, density: 1, noise: 0, shape: 'pattern', pattern: pat }, 1).scale).toBe(1);
    expect(resolveSeed({ x: 0, y: 0, radius: half / 2, density: 1, noise: 0, shape: 'pattern', pattern: pat }, 1).scale).toBeCloseTo(0.5, 6);
    // bias templates in random shapes keep their size
    const spore = { x: 0, y: 0, radius: 4, density: 0.7, noise: 0.5, shape: 'blob' as const, pattern: pat, bias: 0.5 };
    expect(resolveSeed(spore, 1).scale).toBe(1);
    const ext = { x: 0, y: 0, radius: 5, density: 1, noise: 0, shape: 'pattern' as const, pattern: pat, patternScale: 2 };
    expect(resolveSeed(ext, 1).scale).toBe(2);
  });

  it('erase clears the centre softly', () => {
    const a = new Float32Array(W * H).fill(1);
    applyEraseCpu(a, W, H, 32, 24, 10);
    expect(a[24 * W + 32]).toBe(0);
    expect(a[24 * W + 32 + 8]).toBeGreaterThan(0);
    expect(a[24 * W + 32 + 8]).toBeLessThan(1);
    expect(a[0]).toBe(1);
  });

  it('noise primitives are in [0, 1) and smooth', () => {
    for (let i = 0; i < 200; i++) {
      const h = hash2(i - 100, i * 7 - 3, i * 13);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
    expect(Math.abs(vnoise(3.5, 2.25, 9) - vnoise(3.501, 2.25, 9))).toBeLessThan(0.01);
    expect(vnoise(4, 5, 1)).toBeCloseTo(hash2(4, 5, 1), 12);
  });
});
