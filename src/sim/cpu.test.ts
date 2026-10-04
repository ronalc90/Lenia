import { describe, expect, it } from 'vitest';
import { CpuLenia } from './cpu';
import { CATALOG, catalogPattern, decodeRLE, paramsOf } from './catalog';

describe('catalog', () => {
  it('decodes every curated species into a non-empty pattern', () => {
    for (const e of CATALOG) {
      const p = decodeRLE(e.cells);
      expect(p.w).toBeGreaterThan(5);
      expect(p.h).toBeGreaterThan(5);
      expect(Math.max(...p.data)).toBeGreaterThan(0.5);
    }
  });
});

describe('CpuLenia', () => {
  it('keeps Orbium alive for 2000 steps with stable mass', () => {
    const e = CATALOG.find((c) => c.code === 'O2u')!;
    const sim = new CpuLenia(64, 64, paramsOf(e));
    sim.placeCentered(catalogPattern('O2u'), 32, 32);
    sim.step(50);
    const m0 = sim.mass();
    sim.step(1950);
    const m1 = sim.mass();
    expect(m0).toBeGreaterThan(10);
    expect(m1 / m0).toBeGreaterThan(0.8);
    expect(m1 / m0).toBeLessThan(1.25);
  });

  it('a uniform soup does not produce structure (stays uniform)', () => {
    const e = CATALOG.find((c) => c.code === 'O2u')!;
    const sim = new CpuLenia(32, 32, paramsOf(e));
    sim.A.fill(0.5);
    sim.step(20);
    const first = sim.A[0];
    for (let i = 0; i < sim.A.length; i++) expect(Math.abs(sim.A[i] - first)).toBeLessThan(1e-4);
  });
});
