import { describe, expect, it } from 'vitest';
import type { FieldSnapshot, LeniaParams, Pattern, RenderView, SeedSpec, Simulation } from '../core/types';
import { kernelCostFactor, measureStepsPerSecond, recommendQuality } from './perf';

describe('recommendQuality', () => {
  it('maps throughput to profiles', () => {
    expect(recommendQuality(0)).toBe('low');
    expect(recommendQuality(40)).toBe('low');
    expect(recommendQuality(120)).toBe('medium');
    expect(recommendQuality(2000)).toBe('high');
  });

  it('bigger kernels need more throughput', () => {
    expect(kernelCostFactor(13)).toBeCloseTo(1, 6);
    expect(kernelCostFactor(27)).toBeGreaterThan(3);
    expect(recommendQuality(120, 192 * 240, { R: 27, rings: [1] })).toBe('low');
  });
});

describe('measureStepsPerSecond', () => {
  it('counts steps over wall time', () => {
    let steps = 0;
    const fake = {
      gridW: 8,
      gridH: 8,
      params: { R: 13, rings: [1], mu: 0.15, sigma: 0.015, dt: 0.1 } as LeniaParams,
      stepCount: 0,
      setParams: () => {},
      advance: (n: number) => {
        steps += n;
        const t = performance.now() + n * 0.05; // 0.05 ms per step → ~20000 steps/s
        while (performance.now() < t) {
          /* busy wait */
        }
      },
      render: (_v: RenderView) => {},
      seed: (_s: SeedSpec) => {},
      erase: () => {},
      clear: () => {},
      snapshot: () => ({}) as FieldSnapshot,
      capture: (): Pattern => ({ w: 1, h: 1, data: new Float32Array(1) }),
      exportState: () => new Uint8Array(0),
      importState: () => {},
      resizeCanvas: () => {},
      dispose: () => {},
    } satisfies Simulation;
    const sps = measureStepsPerSecond(fake, 100);
    expect(steps).toBeGreaterThan(100);
    expect(sps).toBeGreaterThan(5000);
    expect(sps).toBeLessThan(25000);
  });
});
