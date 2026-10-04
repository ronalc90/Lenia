import type { LeniaParams, Quality, Simulation } from '../core/types';
import { buildPackedKernel } from './kernel';

/**
 * Performance helpers: measure raw simulation throughput and pick a quality
 * profile (design doc §17 + approved correction 8 for the grid sizes).
 */

/** Fixed-aspect grids per quality profile (w × h). */
export const QUALITY_GRID: Record<Quality, { w: number; h: number }> = {
  low: { w: 128, h: 160 },
  medium: { w: 192, h: 240 },
  high: { w: 224, h: 280 },
};

/**
 * Round dish (ADR-022, docs/DISH.md): square grid allocated once per profile and the largest rim
 * it allows. 4 empty cells around the largest dish make clamp-to-edge reads exact zero padding
 * (core/dish.ts DISH_GRID_MARGIN). Cost at the largest rim ≤ the old 4:5 grids (low 20 106 cells
 * vs 20 480, medium/high 39 408 vs 46 080 / 62 720).
 */
export const QUALITY_DISH: Record<Quality, { grid: number; maxDiameter: number }> = {
  low: { grid: 168, maxDiameter: 160 },
  medium: { grid: 232, maxDiameter: 224 },
  high: { grid: 232, maxDiameter: 224 },
};

/** Simulation substeps per rendered frame per profile. */
export const QUALITY_SUBSTEPS: Record<Quality, number> = { low: 1, medium: 1, high: 2 };

/** GPU milliseconds per frame the simulation may use at 60 fps (doc §17 budget). */
export const SIM_BUDGET_MS = 6;

/**
 * Steps per second the GPU sustains for `sim` (blocking; runs for about `ms`).
 * NOTE: it really advances the simulation. Use a throwaway simulation (see
 * `benchmarkSimulation`) if the dish must not move.
 */
export function measureStepsPerSecond(sim: Simulation, ms = 500): number {
  const sync = () => {
    const s = sim as Simulation & { finish?: () => void };
    if (s.finish) s.finish();
    else sim.capture(0, 0, 1); // any readback waits for the queue
  };
  sim.advance(2); // warm-up: first draw compiles / uploads
  sync();
  let steps = 0;
  let batch = 2;
  const t0 = performance.now();
  let t = t0;
  while (t - t0 < ms) {
    sim.advance(batch);
    sync();
    steps += batch;
    t = performance.now();
    // Grow batches so the readback overhead stays small, but keep ~10 samples.
    if ((t - t0) * 10 < ms) batch = Math.min(batch * 2, 512);
  }
  return steps / Math.max(1e-6, (t - t0) / 1000);
}

/** Relative step cost of a kernel versus the reference R = 13, single ring. */
export function kernelCostFactor(R: number, rings: number[] = [1], lanes = 4): number {
  const ref = buildPackedKernel(13, [1], lanes);
  const k = buildPackedKernel(R, rings, lanes);
  // Fetches dominate on mobile GPUs; MADs matter too. Weighted blend.
  return (k.fetches + k.mads / 8) / (ref.fetches + ref.mads / 8);
}

/**
 * Recommended quality from a throughput measurement.
 *
 * @param stepsPerSec  measured steps/s
 * @param measuredCells grid cells of the measured simulation (default the medium grid)
 * @param R / rings    current kernel (bigger kernels cost more)
 *
 * Rule (doc §17): 'high' when its frame cost (2 substeps on 224×280) fits the
 * 6 ms budget; 'medium' when one 192×240 step fits twice the budget (≥ 30 fps
 * with headroom); otherwise 'low'.
 */
export function recommendQuality(
  stepsPerSec: number,
  measuredCells = QUALITY_GRID.medium.w * QUALITY_GRID.medium.h,
  params?: Pick<LeniaParams, 'R' | 'rings'>,
): Quality {
  if (!(stepsPerSec > 0)) return 'low';
  const factor = params ? kernelCostFactor(params.R, params.rings) : 1;
  const msPerCellStep = (1000 / stepsPerSec / measuredCells) * factor;
  const frameMs = (q: Quality) => msPerCellStep * QUALITY_GRID[q].w * QUALITY_GRID[q].h * QUALITY_SUBSTEPS[q];
  if (frameMs('high') <= SIM_BUDGET_MS) return 'high';
  if (frameMs('medium') <= SIM_BUDGET_MS * 2) return 'medium';
  return 'low';
}

/**
 * Benchmark on a throwaway offscreen simulation (does not touch the live dish).
 * `create` is usually `(c, o) => createSimulation(c, o)` from webgl.ts; passed in
 * to keep this module free of WebGL imports.
 */
export function benchmarkSimulation(
  create: (canvas: HTMLCanvasElement, opts: { gridW: number; gridH: number; params: LeniaParams }) => Simulation,
  params: LeniaParams,
  grid = QUALITY_GRID.medium,
  ms = 400,
): { stepsPerSec: number; quality: Quality } {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const sim = create(canvas, { gridW: grid.w, gridH: grid.h, params });
  try {
    const sps = measureStepsPerSecond(sim, ms);
    return { stepsPerSec: sps, quality: recommendQuality(sps, grid.w * grid.h, params) };
  } finally {
    sim.dispose();
  }
}
