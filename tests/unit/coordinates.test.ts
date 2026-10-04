/**
 * Cross-module coordinate convention: grid cell i spans [i, i+1) (centre i + 0.5) in the seed
 * pass, the snapshot blocks, the detector centroids and the camera. A creature seeded at
 * (x, y) must be reported at (x, y) — also when it straddles the wrap seam — so the overlay,
 * the golden spark hit test and the auto-seeder all point at the same place as the GPU image.
 */
import { describe, expect, it } from 'vitest';
import { Camera, wrapDelta } from '../../src/core/camera';
import { createDetector } from '../../src/detect/detector';
import { catalogByCode, paramsOf } from '../../src/sim/catalog';
import { applySeedCpu } from '../../src/sim/seed';
import { snapshotFromCpu } from '../../src/sim/snapshot';

const P = paramsOf(catalogByCode('O2u')!);
const N = 64;

function detectSeedAt(x: number, y: number) {
  const A = new Float32Array(N * N);
  applySeedCpu(A, N, N, { x, y, radius: 13, density: 0.8, noise: 0, shape: 'blob', rngSeed: 1 });
  const r = createDetector().update(snapshotFromCpu(A, N, N, 2, 0), P);
  expect(r.creatures.length).toBe(1);
  return r.creatures[0];
}

describe('coordinate convention shared by seed, snapshot, detector and camera', () => {
  it('a symmetric seed is detected where it was placed (sub-cell)', () => {
    for (const [x, y] of [
      [20, 30],
      [33.5, 17.25],
    ]) {
      // Off-grid centres carry a tiny truncation bias (the faint rim is cut at 0.02); a
      // convention error would be a whole half cell.
      const c = detectSeedAt(x, y);
      expect(Math.abs(c.x - x)).toBeLessThan(0.05);
      expect(Math.abs(c.y - y)).toBeLessThan(0.05);
    }
  });

  it('a seed straddling the wrap seam keeps its true position', () => {
    for (const [x, y] of [
      [1, 30],
      [62.5, 0.5],
    ]) {
      const c = detectSeedAt(x, y);
      expect(Math.abs(wrapDelta(c.x - x, N))).toBeLessThan(0.05);
      expect(Math.abs(wrapDelta(c.y - y, N))).toBeLessThan(0.05);
    }
  });

  it('the camera puts that position over the matching cell of the dish', () => {
    const c = detectSeedAt(20, 30);
    const cam = new Camera(N, N, 640, 640); // 10 CSS px per cell, dish at (0, 0)
    const p = cam.gridToScreen(c.x, c.y);
    expect(p.x).toBeCloseTo(200, 2); // boundary between cells 19 and 20 → x = 200 px
    expect(p.y).toBeCloseTo(300, 2);
  });
});
