/**
 * Browser-side harness for tests/e2e/sim-check.mjs. Exposes `window.simTest`
 * with functions that build WebGL simulations, compare them against the CPU
 * reference (cpu.ts, seed.ts, snapshot.ts) and return plain JSON results.
 */
import type { LeniaParams, Quality, SeedSpec } from '../../src/core/types';
import { catalogByCode, catalogPattern, paramsOf } from '../../src/sim/catalog';
import { CpuLenia } from '../../src/sim/cpu';
import { measureStepsPerSecond, recommendQuality } from '../../src/sim/perf';
import { applyEraseCpu, applySeedCpu } from '../../src/sim/seed';
import { snapshotFromCpu } from '../../src/sim/snapshot';
import { createSimulation, type StateFormat, type WebGLSimulation } from '../../src/sim/webgl';

function makeCanvas(cssW = 64, cssH = 64, show = false, label = ''): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.style.width = `${cssW}px`;
  c.style.height = `${cssH}px`;
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.round(cssW * dpr);
  c.height = Math.round(cssH * dpr);
  if (show) {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.appendChild(c);
    const cap = document.createElement('div');
    cap.textContent = label;
    panel.appendChild(cap);
    document.getElementById('panels')!.appendChild(panel);
  }
  return c;
}

function sum(a: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s;
}

function maxDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

const species = (code: string): LeniaParams => paramsOf(catalogByCode(code)!);

interface SimCfg {
  format?: StateFormat;
  maxLanes?: 1 | 2 | 4;
}

/** GPU vs CPU Orbium on 128×128, then a 2000-step stability run. */
function accuracy(cfg: SimCfg = {}, code = 'O2u') {
  const P = species(code);
  const N = 128;
  const sim = createSimulation(makeCanvas(), { gridW: N, gridH: N, params: P, ...cfg });
  const cpu = new CpuLenia(N, N, P);
  const pat = catalogPattern(code);
  cpu.placeCentered(pat, 64, 64);
  sim.seed({ x: 64, y: 64, radius: 20, density: 1, noise: 0, shape: 'pattern', pattern: pat });
  const init = maxDiff(sim.readState(), cpu.A);
  sim.advance(100);
  cpu.step(100);
  const g100 = sim.readState();
  const diff100 = maxDiff(g100, cpu.A);
  const massG100 = sum(g100);
  const massC100 = cpu.mass();
  sim.advance(1900);
  const g2000 = sim.readState();
  const mass2000 = sum(g2000);
  // snapshot() vs the CPU reference applied to the same (GPU) state.
  const snap = sim.snapshot();
  const ref = snapshotFromCpu(g2000, N, N, 2, sim.stepCount);
  return sim.snapshotAsync().then((asyncSnap) => {
  // centroid / bounding info to show it is still a compact creature
  let fill = 0;
  for (const v of g2000) if (v > 0.1) fill++;
  const res = {
    info: sim.info,
    initDiff: init,
    diff100,
    massGpu100: massG100,
    massCpu100: massC100,
    massRatio100: massG100 / massC100,
    mass2000,
    massRatio2000: mass2000 / massG100,
    fill2000: fill,
    snapW: snap.w,
    snapH: snap.h,
    snapValueDiff: maxDiff(snap.value, ref.value),
    snapGradDiff: maxDiff(snap.grad, ref.grad),
    snapGradMax: Math.max(...snap.grad),
    snapStep: snap.step,
    asyncSnapDiff: Math.max(maxDiff(asyncSnap.value, snap.value), maxDiff(asyncSnap.grad, snap.grad)),
    asyncSnapStep: asyncSnap.step,
  };
  sim.dispose();
  return res;
  });
}

/** Same initial state on several lane/format configurations must agree. */
function laneConsistency() {
  const P = species('OG2g');
  const N = 128;
  const pat = catalogPattern('OG2g');
  const results: Record<string, number> = {};
  let ref: Float32Array | null = null;
  for (const [name, cfg] of [
    ['f16x4', { format: 'half', maxLanes: 4 }],
    ['f16x2', { format: 'half', maxLanes: 2 }],
    ['f16x1', { format: 'half', maxLanes: 1 }],
    ['f32x4', { format: 'float', maxLanes: 4 }],
    ['u8x2', { format: 'u8', maxLanes: 2 }],
    ['u8x1', { format: 'u8', maxLanes: 1 }],
  ] as [string, SimCfg][]) {
    const sim = createSimulation(makeCanvas(), { gridW: N, gridH: N, params: P, ...cfg });
    sim.seed({ x: 40, y: 70, radius: 20, density: 1, noise: 0, shape: 'pattern', pattern: pat });
    sim.advance(30);
    const s = sim.readState();
    if (!ref) ref = s;
    results[name] = maxDiff(s, ref);
    results[`${name}_storage`] = sim.info.storage === 'f16' ? 16 : sim.info.storage === 'f32' ? 32 : 8;
    results[`${name}_lanes`] = sim.info.lanes;
    sim.dispose();
  }
  return results;
}

/** GPU seed/erase/capture/import/export vs the CPU mirrors. */
function seedChecks() {
  const N = 128;
  const W = 128;
  const H = 96;
  const P = species('O2u');
  const sim = createSimulation(makeCanvas(), { gridW: W, gridH: H, params: P });
  const cpu = new Float32Array(W * H);
  const pat = catalogPattern('O2u');
  const specs: SeedSpec[] = [
    { x: 20.3, y: 30.7, radius: 13, density: 0.7, noise: 0.5, shape: 'blob', rngSeed: 11 },
    { x: 60, y: 20, radius: 12, density: 0.8, noise: 0.3, shape: 'ring', rngSeed: 12 },
    { x: 100, y: 60, radius: 15, density: 0.9, noise: 0.6, shape: 'noise', rngSeed: 13 },
    { x: 30, y: 80, radius: 14, density: 0.7, noise: 0.4, shape: 'blob', pattern: pat, bias: 0.6, rotation: 1.1, rngSeed: 14 },
    { x: 126, y: 2, radius: 13, density: 1, noise: 0.2, shape: 'pattern', pattern: pat, rotation: 2.5, rngSeed: 15 },
    { x: 80, y: 70, radius: 6, density: 1, noise: 0, shape: 'pattern', pattern: pat },
  ];
  for (const s of specs) {
    sim.seed(s);
    applySeedCpu(cpu, W, H, s);
  }
  const seedDiff = maxDiff(sim.readState(), cpu);
  sim.erase(60, 20, 8);
  applyEraseCpu(cpu, W, H, 60, 20, 8);
  const eraseDiff = maxDiff(sim.readState(), cpu);
  // capture across the wrap corner
  const cap = sim.capture(126, 2, 24);
  const full = sim.readState();
  let capDiff = 0;
  for (let j = 0; j < 24; j++) {
    for (let i = 0; i < 24; i++) {
      const x = (((126 - 12 + i) % W) + W) % W;
      const y = (((2 - 12 + j) % H) + H) % H;
      capDiff = Math.max(capDiff, Math.abs(cap.data[j * 24 + i] - full[y * W + x]));
    }
  }
  // export/import round trip (8-bit)
  const exp = sim.exportState();
  sim.clear();
  const cleared = sum(sim.readState());
  sim.importState(exp, W, H);
  const back = sim.readState();
  const ioDiff = maxDiff(back, full);
  // different-size import is centred
  sim.importState(new Uint8Array(N * N).fill(255), N, N);
  const bigMass = sum(sim.readState());
  const res = {
    seedDiff,
    seedMass: sum(cpu),
    eraseDiff,
    capDiff,
    clearedMass: cleared,
    ioDiff,
    bigImportMass: bigMass,
    expectedBigMass: W * H,
  };
  sim.dispose();
  return res;
}

/** Larger kernels (R = 18 multi-ring, R = 27) also match the CPU. */
function bigKernels() {
  const out: Record<string, number> = {};
  for (const [name, P, code] of [
    ['R18_3GH2n', species('3GH2n'), '3GH2n'],
    ['R27_scaledOrbium', { ...species('O2u'), R: 27 }, ''],
  ] as [string, LeniaParams, string][]) {
    const N = 128;
    const sim = createSimulation(makeCanvas(), { gridW: N, gridH: N, params: P });
    const cpu = new CpuLenia(N, N, P);
    if (code) {
      const pat = catalogPattern(code);
      cpu.placeCentered(pat, 64, 64);
      sim.seed({ x: 64, y: 64, radius: 40, density: 1, noise: 0, shape: 'pattern', pattern: pat });
    } else {
      // Orbium upscaled to R = 27 (Lenia is roughly scale invariant): a live creature.
      const spec = {
        x: 64,
        y: 64,
        radius: 40,
        density: 1,
        noise: 0,
        shape: 'pattern',
        pattern: catalogPattern('O2u'),
        patternScale: 27 / 13,
      } as SeedSpec;
      applySeedCpu(cpu.A, N, N, spec);
      sim.seed(spec);
    }
    sim.advance(50);
    cpu.step(50);
    out[`${name}_cpuMass50`] = cpu.mass();
    const g = sim.readState();
    out[`${name}_diff50`] = maxDiff(g, cpu.A);
    out[`${name}_massRatio`] = sum(g) / Math.max(1e-9, cpu.mass());
    out[`${name}_fetchesPerCell`] = sim.info.fetchesPerCell;
    sim.dispose();
  }
  return out;
}

function perf(gridW = 192, gridH = 240, R = 13, ms = 2500, cfg: SimCfg = {}) {
  const P = { ...species('O2u'), R };
  const sim = createSimulation(makeCanvas(), { gridW, gridH, params: P, ...cfg });
  sim.seed({ x: gridW / 2, y: gridH / 2, radius: R, density: 0.8, noise: 0.5, shape: 'blob', rngSeed: 3 });
  const sps = measureStepsPerSecond(sim, ms);
  const info = sim.info;
  sim.dispose();
  return { gridW, gridH, R, stepsPerSec: sps, recommended: recommendQuality(sps, gridW * gridH, P), info };
}

/** Time to switch kernels (shader regeneration + compile + first step). */
function compileTimes() {
  const sim = createSimulation(makeCanvas(), { gridW: 192, gridH: 240, params: species('O2u') });
  const out: Record<string, number> = {};
  for (const R of [10, 18, 27, 13, 27]) {
    const t0 = performance.now();
    sim.setParams({ R });
    sim.advance(1);
    sim.finish();
    out[`R${R}${out[`R${R}`] !== undefined ? '_cached' : ''}`] = performance.now() - t0;
  }
  sim.dispose();
  return out;
}

/** Render cost at a phone-like backing store. */
function renderPerf(quality: Quality, frames = 20) {
  const P = species('O2u');
  const c = makeCanvas(390, 844);
  const sim = createSimulation(c, { gridW: 192, gridH: 240, params: P });
  sim.seed({ x: 96, y: 120, radius: 13, density: 1, noise: 0, shape: 'pattern', pattern: catalogPattern('O2u') });
  const view = { camera: { zoom: 1, cx: 96, cy: 120 }, time: 0, quality };
  sim.render(view);
  sim.finish();
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) {
    sim.advance(1);
    sim.render({ ...view, time: i / 60 });
  }
  sim.finish();
  const ms = (performance.now() - t0) / frames;
  sim.dispose();
  return { quality, msPerFrame: ms, backing: [c.width, c.height] };
}

/** Context loss: nothing throws while lost; state comes back after restore. */
async function contextLoss() {
  const P = species('O2u');
  const c = makeCanvas(200, 200);
  let lostCalls = 0;
  let restoredCalls = 0;
  const sim = createSimulation(c, {
    gridW: 128,
    gridH: 128,
    params: P,
    onContextLost: () => lostCalls++,
    onContextRestored: () => restoredCalls++,
  });
  sim.seed({ x: 64, y: 64, radius: 13, density: 1, noise: 0, shape: 'pattern', pattern: catalogPattern('O2u') });
  sim.advance(10);
  const before = sum(sim.readState()); // refreshes the backup
  const gl = (c.getContext('webgl2') as WebGL2RenderingContext)!;
  const ext = gl.getExtension('WEBGL_lose_context');
  if (!ext) return { skipped: true };
  ext.loseContext();
  await new Promise((r) => setTimeout(r, 50));
  // All calls must be safe while lost.
  sim.advance(5);
  sim.seed({ x: 10, y: 10, radius: 5, density: 1, noise: 0, shape: 'blob' });
  sim.render({ camera: { zoom: 1, cx: 64, cy: 64 }, time: 0, quality: 'medium' });
  const snapLost = sim.snapshot();
  const exportedLost = sim.exportState().length;
  const restored = new Promise<void>((r) => c.addEventListener('webglcontextrestored', () => setTimeout(r, 10), { once: true }));
  ext.restoreContext();
  await restored;
  const after = sum(sim.readState());
  sim.advance(10);
  const after2 = sum(sim.readState());
  sim.dispose();

  // A dish lost before any readback (no backup, no snapshot) must come back empty, not with
  // the storage round-trip probe pattern left in it.
  const c2 = makeCanvas(64, 64);
  const sim2 = createSimulation(c2, { gridW: 64, gridH: 64, params: P });
  const ext2 = (c2.getContext('webgl2') as WebGL2RenderingContext).getExtension('WEBGL_lose_context')!;
  ext2.loseContext();
  await new Promise((r) => setTimeout(r, 50));
  const restored2 = new Promise<void>((r) => c2.addEventListener('webglcontextrestored', () => setTimeout(r, 10), { once: true }));
  ext2.restoreContext();
  await restored2;
  const massNoBackup = sum(sim2.readState());
  sim2.dispose();
  return {
    lostCalls,
    restoredCalls,
    massBefore: before,
    massAfterRestore: after,
    massAfter10More: after2,
    massNoBackup,
    snapLostW: snapLost.w,
    exportedLost,
  };
}

interface PanelSpec {
  code: string;
  label: string;
  seeds: { x: number; y: number; rot: number }[];
  /** Random "spore" seeds (blob + bias template + noise) with these rng seeds. */
  spores?: number[];
  zoom?: number;
  /** Centre the camera on the biggest creature (toroidal centroid). */
  follow?: boolean;
  steps?: number;
}

/** Toroidal centroid of all matter (circular mean per axis). */
function centroid(A: Float32Array, w: number, h: number): [number, number] {
  let sx = 0, cx = 0, sy = 0, cy = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = A[y * w + x];
      if (v <= 0) continue;
      const ax = ((x + 0.5) / w) * 2 * Math.PI;
      const ay = ((y + 0.5) / h) * 2 * Math.PI;
      sx += v * Math.sin(ax);
      cx += v * Math.cos(ax);
      sy += v * Math.sin(ay);
      cy += v * Math.cos(ay);
    }
  }
  const mx = ((Math.atan2(sx, cx) / (2 * Math.PI)) * w + w) % w;
  const my = ((Math.atan2(sy, cy) / (2 * Math.PI)) * h + h) % h;
  return [mx, my];
}

type LiveSim = { sim: WebGLSimulation; view: Parameters<WebGLSimulation['render']>[0] };
const live: LiveSim[] = [];

/** Several dishes, one species each (each dish has its own params). */
function visual(quality: Quality = 'medium', cssW = 300, cssH = 375, only?: string) {
  const panels: PanelSpec[] = [
    {
      code: 'O2u',
      label: 'Orbium unicaudatus, 192×240',
      seeds: [
        { x: 50, y: 60, rot: 0.3 },
        { x: 140, y: 70, rot: 2.2 },
        { x: 90, y: 150, rot: 4.0 },
        { x: 150, y: 200, rot: 5.1 },
      ],
    },
    {
      code: 'OG2g',
      label: 'Gyrorbium gyrans + spores',
      seeds: [
        { x: 60, y: 60, rot: 0 },
        { x: 140, y: 110, rot: 2 },
      ],
      spores: [101, 103],
    },
    {
      code: 'S1s',
      label: 'Scutium solidus',
      seeds: [
        { x: 55, y: 60, rot: 0 },
        { x: 140, y: 80, rot: 1 },
        { x: 95, y: 170, rot: 2 },
      ],
    },
    {
      code: '3GH2n',
      label: 'Hydrogeminium natans (R=18)',
      seeds: [
        { x: 96, y: 80, rot: 0 },
        { x: 96, y: 185, rot: 3 },
      ],
    },
    { code: 'O2u', label: 'Orbium, zoom ×3', seeds: [{ x: 96, y: 120, rot: 0.8 }], zoom: 3, follow: true },
    { code: 'S1s', label: 'Scutium, zoom ×3', seeds: [{ x: 96, y: 120, rot: 0.8 }], zoom: 3, follow: true },
    { code: 'O2u', label: 'Orbium on the wrap seam, zoom ×2', seeds: [{ x: 2, y: 3, rot: 2.4 }], zoom: 2, follow: true, steps: 60 },
    { code: '3GH2n', label: 'Hydrogeminium, zoom ×2', seeds: [{ x: 96, y: 120, rot: 0 }], zoom: 2, follow: true },
  ];
  const out: { label: string; mass: number }[] = [];
  for (const p of panels) {
    if (only && !p.label.includes(only)) continue;
    const P = species(p.code);
    const c = makeCanvas(cssW, cssH, true, p.label);
    const sim = createSimulation(c, { gridW: 192, gridH: 240, params: P });
    const pat = catalogPattern(p.code);
    for (const s of p.seeds) {
      sim.seed({ x: s.x, y: s.y, radius: P.R * 2, density: 1, noise: 0, shape: 'pattern', pattern: pat, rotation: s.rot });
    }
    (p.spores ?? []).forEach((rng, i) => {
      sim.seed({
        x: 50 + i * 90,
        y: 185,
        radius: P.R * 1.1,
        density: 0.8,
        noise: 0.6,
        shape: 'blob',
        pattern: pat,
        bias: 0.5,
        rotation: (rng - 100) * 1.7,
        rngSeed: rng,
      });
    });
    sim.advance(p.steps ?? 300);
    const A = sim.readState();
    const f = p.follow ? centroid(A, 192, 240) : [96, 120];
    const view = { camera: { zoom: p.zoom ?? 1, cx: f[0], cy: f[1] }, time: 1.0, quality };
    sim.render(view);
    out.push({ label: p.label, mass: sum(A) });
    live.push({ sim, view });
  }
  return out;
}

function rerender(quality?: Quality) {
  for (const l of live) l.sim.render(quality ? { ...l.view, quality } : l.view);
  return live.length;
}

(window as unknown as { simTest: unknown }).simTest = {
  accuracy,
  laneConsistency,
  seedChecks,
  bigKernels,
  perf,
  renderPerf,
  compileTimes,
  contextLoss,
  visual,
  rerender,
};
(window as unknown as { simTestReady: boolean }).simTestReady = true;
