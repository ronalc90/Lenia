import { describe, expect, it } from 'vitest';
import { CATALOG, catalogPattern, paramsOf } from './catalog';
import { CpuLenia, fft2 } from './cpu';
import { fft2Any, fftAny } from './fft';

function naiveDft(re: number[], im: number[], inverse: boolean): [number[], number[]] {
  const n = re.length;
  const or: number[] = [];
  const oi: number[] = [];
  for (let k = 0; k < n; k++) {
    let sr = 0;
    let si = 0;
    for (let j = 0; j < n; j++) {
      const a = ((inverse ? 2 : -2) * Math.PI * j * k) / n;
      sr += re[j] * Math.cos(a) - im[j] * Math.sin(a);
      si += re[j] * Math.sin(a) + im[j] * Math.cos(a);
    }
    or.push(inverse ? sr / n : sr);
    oi.push(inverse ? si / n : si);
  }
  return [or, oi];
}

describe('mixed-radix FFT', () => {
  it('matches a naive DFT for the live grid sides', () => {
    for (const n of [12, 160, 240, 15]) {
      const re = Array.from({ length: n }, (_, i) => Math.sin(i * 1.3) + (i % 7) * 0.1);
      const im = Array.from({ length: n }, (_, i) => Math.cos(i * 0.7) * 0.5);
      for (const inv of [false, true]) {
        const [er, ei] = naiveDft(re, im, inv);
        const r = Float64Array.from(re);
        const m = Float64Array.from(im);
        fftAny(r, m, n, 0, 1, inv);
        for (let k = 0; k < n; k++) {
          expect(r[k]).toBeCloseTo(er[k], 9);
          expect(m[k]).toBeCloseTo(ei[k], 9);
        }
      }
    }
  });

  it('agrees with the radix-2 path on a power-of-two grid and round-trips', () => {
    const w = 16;
    const h = 32;
    const re = new Float64Array(w * h).map((_, i) => Math.sin(i * 0.37));
    const im = new Float64Array(w * h);
    const r2 = re.slice();
    const i2 = im.slice();
    fft2(r2, i2, w, h, false);
    const r3 = re.slice();
    const i3 = im.slice();
    fft2Any(r3, i3, w, h, false);
    for (let i = 0; i < w * h; i++) {
      expect(r3[i]).toBeCloseTo(r2[i], 9);
      expect(i3[i]).toBeCloseTo(i2[i], 9);
    }
    fft2Any(r3, i3, w, h, true);
    for (let i = 0; i < w * h; i++) expect(r3[i]).toBeCloseTo(re[i], 9);
  });

  it('CpuLenia runs the live 192×240 grid exactly like a power-of-two torus', () => {
    const P = paramsOf(CATALOG.find((c) => c.code === 'O2u')!);
    const a = new CpuLenia(192, 240, P);
    const b = new CpuLenia(256, 256, P);
    a.placeCentered(catalogPattern('O2u'), 96, 120);
    b.placeCentered(catalogPattern('O2u'), 128, 128);
    a.step(60);
    b.step(60);
    let diff = 0;
    for (let y = -40; y < 40; y++)
      for (let x = -40; x < 40; x++) diff = Math.max(diff, Math.abs(a.A[(120 + y) * 192 + 96 + x] - b.A[(128 + y) * 256 + 128 + x]));
    expect(diff).toBeLessThan(1e-5);
    expect(a.mass()).toBeGreaterThan(60);
  });
});
