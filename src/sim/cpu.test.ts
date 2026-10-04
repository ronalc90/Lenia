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

describe('CpuLenia in the round dish', () => {
  const orbium = () => paramsOf(CATALOG.find((c) => c.code === 'O2u')!);

  it('keeps every cell outside the glass empty, even when a pattern is placed across the rim', () => {
    const sim = new CpuLenia(128, 128, orbium());
    sim.setDish({ cx: 64, cy: 64, radius: 40 });
    sim.placeCentered(catalogPattern('O2u'), 64 + 40, 64);
    sim.step(30);
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        if (Math.hypot(x + 0.5 - 64, y + 0.5 - 64) >= 40) expect(sim.A[y * 128 + x]).toBe(0);
      }
  });

  it('growing the rim keeps the matter exactly; shrinking it clears what is left outside', () => {
    const sim = new CpuLenia(128, 128, orbium());
    sim.setDish({ cx: 64, cy: 64, radius: 30 });
    sim.placeCentered(catalogPattern('O2u'), 64, 64);
    sim.step(20);
    const before = Float32Array.from(sim.A);
    sim.setDish({ cx: 64, cy: 64, radius: 48 });
    expect(Array.from(sim.A)).toEqual(Array.from(before));
    sim.setDish({ cx: 64, cy: 64, radius: 4 });
    expect(sim.mass()).toBeLessThan(before.reduce((a, v) => a + v, 0));
  });

  it('refuses a dish so large that the FFT would wrap matter across the grid edge', () => {
    const sim = new CpuLenia(128, 128, orbium());
    expect(() => sim.setDish({ cx: 64, cy: 64, radius: 60 })).toThrow();
    expect(() => sim.setDish({ cx: 64, cy: 64, radius: 50 })).not.toThrow();
  });

  it('the bare glass is lethal: Orbium swimming into an absorbing rim dies without deflection', () => {
    const sim = new CpuLenia(128, 128, orbium());
    sim.setDish({ cx: 64, cy: 64, radius: 48 });
    sim.placeCentered(catalogPattern('O2u'), 64, 64);
    sim.step(600); // ~370 cells of travel: several rim encounters
    expect(sim.mass()).toBeLessThan(10);
  });
});
