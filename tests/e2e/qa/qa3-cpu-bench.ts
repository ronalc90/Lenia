/**
 * QA #3 — CPU micro-benchmarks of the per-frame/per-snapshot JS hot paths (no GPU):
 *   npx vite-node tests/e2e/qa/qa3-cpu-bench.ts
 *  - detector.update on a 192×240 dish (scale-2 snapshot, like the game) with 1 / 8 / 20 Orbium and a
 *    "worm labyrinth" (40 % fill), creatures drifting between updates;
 *  - game.view() and game.tick() with 20 creatures and 40 registered species (the UI calls view() 10×/s).
 * Node/V8 on this box is ~3–6× faster than a mid-range phone's JS; multiply accordingly.
 */
import { Bus, type GameEvents } from '../../../src/core/bus';
import type { Creature } from '../../../src/core/types';
import { createDetector } from '../../../src/detect/detector';
import { placeRotated } from '../../../src/detect/harness';
import { createGame } from '../../../src/game/game';
import { seededRng } from '../../../src/game/testUtil';
import { catalogByCode } from '../../../src/sim/catalog';
import { snapshotFromCpu } from '../../../src/sim/snapshot';
import { scaledTemplate } from '../../../src/game/seeding';

const W = 192;
const H = 240;
const R = 13;
const params = { R, mu: 0.15, sigma: 0.015, dt: 0.1, rings: [1] };
const orb = scaledTemplate(catalogByCode('O2u')!, R);

function field(n: number, t: number, labyrinth = false): Float32Array {
  const A = new Float32Array(W * H);
  if (labyrinth) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const v = Math.sin((x + 0.6 * y) / 5 + Math.sin(y / 17) * 2 + t * 0.01) + 0.4 * Math.sin(y / 9);
        A[y * W + x] = v > 0.35 ? Math.min(1, (v - 0.35) * 2) : 0;
      }
    return A;
  }
  const cols = n <= 1 ? 1 : n <= 8 ? 2 : 4;
  const rows = Math.ceil(n / cols);
  let k = 0;
  for (let r = 0; r < rows && k < n; r++)
    for (let c = 0; c < cols && k < n; c++, k++) {
      const x = ((c + 0.5) * W) / cols + t * 0.24 * Math.cos(k);
      const y = ((r + 0.5) * H) / rows + t * 0.24 * Math.sin(k);
      placeRotated(A, W, H, orb, x, y, k);
    }
  return A;
}

function benchDetector(label: string, n: number, labyrinth = false): void {
  const det = createDetector();
  const updates = 400;
  // Pre-build fields so only the detector is timed.
  const fields = Array.from({ length: 40 }, (_, i) => snapshotFromCpu(field(n, i * 10, labyrinth), W, H, 2, 0));
  let creatures = 0;
  let stable = 0;
  const times: number[] = [];
  for (let i = 0; i < updates; i++) {
    const f = fields[i % fields.length];
    (f as { step: number }).step = i * 10;
    const t0 = performance.now();
    const rep = det.update(f, params);
    times.push(performance.now() - t0);
    creatures = rep.creatures.length;
    stable = rep.creatures.filter((c) => c.state === 'stable').length;
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(
    `| detector ${label} | ${mean.toFixed(2)} ms | ${times[Math.floor(times.length * 0.95)].toFixed(2)} ms | ${creatures} tracked / ${stable} stable | ${(mean * 3).toFixed(1)} ms/s at ×1 · ${(mean * 12).toFixed(1)} ms/s at ×4 |`,
  );
}

console.log('| path | mean | p95 | result | main-thread cost (node) |');
console.log('|---|---|---|---|---|');
benchDetector('1 Orbium', 1);
benchDetector('8 Orbium', 8);
benchDetector('20 Orbium', 20);
benchDetector('worm labyrinth (≈40 % fill)', 0, true);

// game.view()/tick with a late-Era state.
const bus = new Bus<GameEvents>();
let t = 0;
const game = createGame({ bus, rng: seededRng(7), now: () => t * 1000, grid: { w: W, h: H } });
const st = game.state as unknown as {
  species: unknown[];
  achievements: string[];
  essence: number;
};
// 40 species via fake stable creatures with distinct signatures.
const sigRng = seededRng(3);
let id = 1;
for (let k = 0; k < 40; k++) {
  const sig = Array.from({ length: 22 }, () => sigRng() * 3);
  const c: Creature = { id: id++, x: 10 + k * 4, y: 50, radius: 8, mass: 100, complexity: 1, state: 'stable', behavior: 'swimmer', age: 2000, vx: 0, vy: 0, signature: sig, parentId: null };
  game.tick(0.5, { step: k * 10, creatures: [c], events: [], totalMass: 0, fill: 0.05 });
}
const crs: Creature[] = Array.from({ length: 20 }, (_, k) => ({
  id: 1000 + k,
  x: (k % 4) * 48 + 24,
  y: Math.floor(k / 4) * 48 + 24,
  radius: 8,
  mass: 100,
  complexity: 1.2,
  state: 'stable',
  behavior: 'swimmer',
  age: 2000,
  vx: 0.1,
  vy: 0,
  signature: Array.from({ length: 22 }, () => sigRng() * 3),
  parentId: null,
}));
console.log(`(game state: ${st.species.length} species, ${st.achievements.length} achievements)`);
for (const [label, fn] of [
  ['game.tick(1/60) 20 creatures, 40 species', () => game.tick(1 / 60, { step: 0, creatures: crs, events: [], totalMass: 0, fill: 0.1 })],
  ['game.view() 20 creatures, 40 species', () => game.view()],
  ['game.serialize() (autosave, every 30 s)', () => game.serialize()],
] as [string, () => unknown][]) {
  const times: number[] = [];
  for (let i = 0; i < 2000; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
    t += 1 / 60;
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const perS = label.includes('view') ? 11 : label.includes('tick') ? 60 : 1 / 30;
  console.log(`| ${label} | ${mean.toFixed(3)} ms | ${times[Math.floor(times.length * 0.95)].toFixed(3)} ms | — | ${(mean * perS).toFixed(2)} ms/s |`);
}
const v = game.view();
console.log(`view(): ${JSON.stringify(v).length} chars of JSON-equivalent per call (allocation per 100 ms)`);
