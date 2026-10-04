/**
 * Browser-side harness for tests/e2e/sim-check.mjs. Exposes `window.simTest`
 * with functions that build WebGL simulations, compare them against the CPU
 * reference (cpu.ts, seed.ts, snapshot.ts) and return plain JSON results.
 */
import { Camera } from '../../src/core/camera';
import { DishAnimator, dishForGrid, type DishShape } from '../../src/core/dish';
import type { LeniaParams, Quality, SeedSpec } from '../../src/core/types';
import { catalogByCode, catalogPattern, paramsOf } from '../../src/sim/catalog';
import { CpuLenia } from '../../src/sim/cpu';
import { Deflector, rotateDiscCpu, type Turn } from '../../src/sim/deflect';
import { measureStepsPerSecond, QUALITY_DISH, recommendQuality } from '../../src/sim/perf';
import { applyEraseCpu, applySeedCpu } from '../../src/sim/seed';
import { snapshotFromCpu } from '../../src/sim/snapshot';
import { createSimulation, type StateFormat, type WebGLSimulation } from '../../src/sim/webgl';
import { paletteLUT, renderStyleFor } from '../../src/store/apply';
import { cosmeticById, defaultItem, type DishTheme, type PaletteData } from '../../src/store/catalog';

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

/** Apply a cosmetic palette + dish theme (catalog ids) to every live dish and re-render. */
function restyle(paletteId: string, dishId: string) {
  const pal = (cosmeticById(paletteId)?.data ?? defaultItem('palette').data) as PaletteData;
  const dish = (cosmeticById(dishId)?.data ?? defaultItem('dish').data) as DishTheme;
  for (const l of live) {
    l.sim.setMatterLUT(paletteLUT(pal.stops));
    l.sim.setRenderStyle(renderStyleFor(pal, dish));
    l.sim.render(l.view);
  }
  return live.length;
}

function rerender(quality?: Quality) {
  for (const l of live) l.sim.render(quality ? { ...l.view, quality } : l.view);
  return live.length;
}


// ───────────────────────────── Round dish (ADR-025) ─────────────────────────────

/** Max |value| of cells outside the dish (must be exactly 0). */
function outsideMax(A: Float32Array, w: number, h: number, d: DishShape): number {
  let m = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - d.cx;
      const dy = y + 0.5 - d.cy;
      if (dx * dx + dy * dy >= d.radius * d.radius) m = Math.max(m, A[y * w + x]);
    }
  return m;
}

/** Mass-weighted centroid (no wrap: the dish never touches the grid edge). */
function centroidPlain(A: ArrayLike<number>, w: number, h: number, scale = 1): { x: number; y: number; m: number } {
  let m = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = A[y * w + x];
      m += v;
      sx += v * (x + 0.5) * scale;
      sy += v * (y + 0.5) * scale;
    }
  return { x: sx / Math.max(1e-9, m), y: sy / Math.max(1e-9, m), m };
}

/**
 * GPU vs CPU in the round walled dish: Orbium launched into the glass (absorbing rim, zero
 * padding, mask), seeds/erase without wrap, a deflection turn and lysis, all against the CPU mirrors.
 */
function dishChecks(cfg: SimCfg = {}) {
  const P = species('O2u');
  const N = 128;
  const dish = { cx: 64, cy: 64, radius: 48 };
  const out: Record<string, number> = {};

  // 1. Orbium swimming into the glass: GPU vs CPU, outside stays 0.
  {
    const sim = createSimulation(makeCanvas(), { gridW: N, gridH: N, params: P, ...cfg });
    sim.setDish(dish);
    const cpu = new CpuLenia(N, N, P);
    cpu.setDish(dish);
    const pat = catalogPattern('O2u');
    // O2u heads ~68° (down-right): start below-right of the centre so it meets the rim at ~40 steps.
    const spec: SeedSpec = { x: 72, y: 76, radius: 20, density: 1, noise: 0, shape: 'pattern', pattern: pat };
    sim.seed(spec);
    applySeedCpu(cpu.A, N, N, spec, 1, { dish });
    out.initDiff = maxDiff(sim.readState(), cpu.A);
    sim.advance(60);
    cpu.step(60);
    const g = sim.readState();
    out.wallDiff60 = maxDiff(g, cpu.A);
    out.wallMassRatio60 = sum(g) / Math.max(1e-9, cpu.mass());
    out.wallCpuMass60 = cpu.mass();
    out.wallOutside60 = outsideMax(g, N, N, dish);
    let rimMin = Infinity;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) if (g[y * N + x] > 0.1) rimMin = Math.min(rimMin, dish.radius - Math.hypot(x + 0.5 - 64, y + 0.5 - 64));
    out.wallContact60 = rimMin; // < 2: the creature is pressed against the glass
    sim.dispose();
  }

  // 2. Seeds across the rim / near the grid edge and erase: no wrap, masked.
  {
    const sim = createSimulation(makeCanvas(), { gridW: N, gridH: N, params: P, ...cfg });
    sim.setDish(dish);
    const A = new Float32Array(N * N);
    const pat = catalogPattern('O2u');
    const specs: SeedSpec[] = [
      { x: 64 + 46, y: 64, radius: 13, density: 0.8, noise: 0.5, shape: 'blob', rngSeed: 21 },
      { x: 64, y: 64 - 44, radius: 12, density: 0.8, noise: 0.3, shape: 'ring', rngSeed: 22 },
      { x: 40, y: 80, radius: 14, density: 0.7, noise: 0.4, shape: 'blob', pattern: pat, bias: 0.6, rotation: 1.1, rngSeed: 23 },
      { x: 20, y: 30, radius: 13, density: 1, noise: 0.2, shape: 'pattern', pattern: pat, rotation: 2.5, rngSeed: 24 },
    ];
    for (const sp of specs) {
      sim.seed(sp);
      applySeedCpu(A, N, N, sp, 1, { dish });
    }
    out.seedDiff = maxDiff(sim.readState(), A);
    sim.erase(64 + 44, 64, 9);
    applyEraseCpu(A, N, N, 64 + 44, 64, 9, { dish });
    const g = sim.readState();
    out.eraseDiff = maxDiff(g, A);
    out.seedOutside = outsideMax(g, N, N, dish);
    // A seed placed on the far side of the grid must not wrap into the dish.
    sim.clear();
    sim.seed({ x: 2, y: 64, radius: 13, density: 1, noise: 0, shape: 'blob', rngSeed: 3 });
    out.wrapLeak = sum(sim.readState());
    sim.dispose();
  }

  // 3. Deflection turn (rotate pass) vs rotateDiscCpu, and lysis vs CpuLenia.setLysis.
  {
    const sim = createSimulation(makeCanvas(), { gridW: N, gridH: N, params: P, ...cfg });
    sim.setDish(dish);
    sim.seed({ x: 70, y: 60, radius: 20, density: 1, noise: 0, shape: 'pattern', pattern: catalogPattern('O2u') });
    sim.advance(20);
    const before = sim.readState();
    const c = centroidPlain(before, N, N);
    const turn: Turn = { id: 1, x: c.x, y: c.y, radius: 12, angle: 1.05 };
    sim.applyTurns([turn]);
    const cpuA = before.slice();
    rotateDiscCpu(cpuA, N, N, turn, dish, new Float32Array(N * N));
    const g = sim.readState();
    out.turnDiff = maxDiff(g, cpuA);
    out.turnMassRatio = sum(g) / sum(before);

    const cpu = new CpuLenia(N, N, P);
    cpu.setDish(dish);
    cpu.A.set(g);
    const discs = [{ x: c.x, y: c.y, radius: 12, strength: 0.5 }];
    sim.setLysis(discs);
    cpu.setLysis(discs);
    sim.advance(4);
    cpu.step(4);
    out.lysisDiff = maxDiff(sim.readState(), cpu.A);
    out.lysisMassDrop = cpu.mass() / sum(g);
    sim.setLysis([]);
    sim.dispose();
  }

  // 4. Growing the rim keeps the matter; shrinking clears outside; back to the torus works.
  {
    const sim = createSimulation(makeCanvas(), { gridW: N, gridH: N, params: P, ...cfg });
    sim.setDish({ cx: 64, cy: 64, radius: 30 });
    sim.seed({ x: 64, y: 64, radius: 20, density: 1, noise: 0, shape: 'pattern', pattern: catalogPattern('O2u') });
    sim.advance(10);
    const a = sim.readState();
    sim.setDish({ cx: 64, cy: 64, radius: 50 });
    out.growDiff = maxDiff(sim.readState(), a);
    sim.setDish({ cx: 64, cy: 64, radius: 6 });
    out.shrinkOutside = outsideMax(sim.readState(), N, N, { cx: 64, cy: 64, radius: 6 });
    sim.setDish(null);
    sim.seed({ x: 2, y: 64, radius: 13, density: 1, noise: 0, shape: 'blob', rngSeed: 3 });
    const t = sim.readState();
    out.torusWrapsAgain = t[64 * N + (N - 2)] > 0 ? 1 : 0; // the blob wraps to the far edge again
    sim.dispose();
  }
  return out;
}

/**
 * The real GPU dish with glass deflection driven from GPU snapshots (as the game will): Orbium in
 * the smallest dish must bounce off the glass many times and survive.
 */
function bounce(cfg: SimCfg = {}, steps = 2000, deflect = true) {
  const P = species('O2u');
  const N = QUALITY_DISH.low.grid;
  const dish = dishForGrid(N, N, 96);
  const sim = createSimulation(makeCanvas(), { gridW: N, gridH: N, params: P, ...cfg });
  sim.setDish(dish);
  sim.seed({ x: dish.cx, y: dish.cy, radius: 20, density: 1, noise: 0, shape: 'pattern', pattern: catalogPattern('O2u') });
  const m0 = sum(sim.readState());
  const def = new Deflector();
  let prev: { x: number; y: number } | null = null;
  let turns = 0;
  let nearRim = 0;
  let minMass = Infinity;
  const path: [number, number][] = [];
  for (let s = 0; s < steps; s += 10) {
    sim.advance(10);
    const snap = sim.snapshot();
    const c = centroidPlain(snap.value, snap.w, snap.h, snap.scale);
    const mass = c.m * snap.scale * snap.scale;
    minMass = Math.min(minMass, mass);
    if (mass < 0.2 * m0) break;
    path.push([c.x, c.y]);
    if (dish.radius - Math.hypot(c.x - dish.cx, c.y - dish.cy) < 18) nearRim++;
    if (deflect && prev) {
      const t = def.update([{ id: 1, x: c.x, y: c.y, vx: (c.x - prev.x) / 10, vy: (c.y - prev.y) / 10, radius: 5.6 }], dish, sim.stepCount, 10);
      turns += t.length;
      sim.applyTurns(t);
      if (t.length) {
        const s2 = sim.snapshot();
        const c2 = centroidPlain(s2.value, s2.w, s2.h, s2.scale);
        prev = { x: c2.x, y: c2.y };
        continue;
      }
    }
    prev = { x: c.x, y: c.y };
  }
  const end = sum(sim.readState());
  sim.dispose();
  return { steps, turns, nearRim, massRatio: end / m0, minMassRatio: minMass / m0, pathLen: path.length, deflect };
}

/**
 * Bodies from a GPU snapshot: 8-connected components (value ≥ 0.1, scale-2 blocks), centroid,
 * radius of gyration and mass in grid cells. Tracking by nearest previous centroid (enough for the
 * harness; the game uses the detector).
 */
function snapshotBodies(sim: WebGLSimulation, R: number): { x: number; y: number; radius: number; mass: number }[] {
  const snap = sim.snapshot();
  const { w, h, scale, value } = snap;
  const lbl = new Int32Array(w * h);
  const out: { x: number; y: number; radius: number; mass: number }[] = [];
  const q: number[] = [];
  let id = 0;
  for (let i = 0; i < w * h; i++) {
    if (value[i] < 0.1 || lbl[i]) continue;
    id++;
    q.length = 0;
    q.push(i);
    lbl[i] = id;
    let m = 0, sx = 0, sy = 0, sxx = 0;
    for (let k = 0; k < q.length; k++) {
      const j = q[k];
      const x = j % w;
      const y = (j - x) / w;
      const v = value[j] * scale * scale;
      const gx = (x + 0.5) * scale;
      const gy = (y + 0.5) * scale;
      m += v;
      sx += v * gx;
      sy += v * gy;
      sxx += v * (gx * gx + gy * gy);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const jj = yy * w + xx;
          if (value[jj] >= 0.1 && !lbl[jj]) {
            lbl[jj] = id;
            q.push(jj);
          }
        }
    }
    if (m < 0.04 * R * R) continue;
    const cx = sx / m;
    const cy = sy / m;
    out.push({ x: cx, y: cy, mass: m, radius: Math.sqrt(Math.max(1, sxx / m - cx * cx - cy * cy)) });
  }
  return out;
}

/** Advance with glass deflection driven from snapshots every 10 steps (rim + creature encounters). */
function deflectRun(sim: WebGLSimulation, dish: DishShape, steps: number) {
  const def = new Deflector();
  let prev: { id: number; x: number; y: number }[] = [];
  let next = 1;
  const R = sim.params.R;
  let bodies: { id: number; x: number; y: number; vx: number; vy: number; radius: number }[] = [];
  for (let s = 0; s < steps; s += 10) {
    sim.advance(10);
    const used = new Set<number>();
    bodies = snapshotBodies(sim, R).map((b) => {
      let best: { id: number; x: number; y: number } | null = null;
      let bd = Infinity;
      for (const p of prev) {
        const d = Math.hypot(p.x - b.x, p.y - b.y);
        if (!used.has(p.id) && d < bd && d < b.radius * 2 + 10) {
          bd = d;
          best = p;
        }
      }
      if (best) used.add(best.id);
      return best
        ? { id: best.id, x: b.x, y: b.y, vx: (b.x - best.x) / 10, vy: (b.y - best.y) / 10, radius: b.radius }
        : { id: next++, x: b.x, y: b.y, vx: 0, vy: 0, radius: b.radius };
    });
    const turns = def.update(bodies, dish, sim.stepCount, 10);
    sim.applyTurns(turns);
    // After a rigid turn the centroid stays put; the next velocity estimate starts here.
    prev = bodies.map((b) => ({ id: b.id, x: b.x, y: b.y }));
  }
  return bodies;
}

/** Steps/s of the round dish at its largest rim on the medium grid vs the old 4:5 torus. */
function dishPerf(ms = 1500, diameter = 224) {
  const P = species('O2u');
  const N = QUALITY_DISH.medium.grid;
  const sim = createSimulation(makeCanvas(), { gridW: N, gridH: N, params: P });
  sim.setDish(dishForGrid(N, N, diameter));
  sim.seed({ x: N / 2, y: N / 2, radius: 13, density: 0.8, noise: 0.5, shape: 'blob', rngSeed: 3 });
  const sps = measureStepsPerSecond(sim, ms);
  sim.dispose();
  return { grid: N, diameter, stepsPerSec: sps };
}

/** Round dishes rendered by the GPU path (screenshots): sizes, species, tints, growth glow, zoom. */
function dishVisual(quality: Quality = 'medium', cssW = 300, cssH = 375) {
  const panels: {
    label: string;
    code: string;
    grid: number;
    diameter: number;
    seeds: { x: number; y: number; rot: number; hue?: number }[];
    steps?: number;
    zoom?: number;
    growTo?: number;
    growAt?: number;
    style?: [string, string];
  }[] = [
    { label: 'Ø96 dish, 2 Orbium (start size)', code: 'O2u', grid: 168, diameter: 96, seeds: [{ x: 64, y: 70, rot: 0.3 }, { x: 104, y: 100, rot: 3.4 }] },
    {
      label: 'Ø224, mixed species, species tints',
      code: 'O2u',
      grid: 232,
      diameter: 224,
      seeds: [
        { x: 80, y: 80, rot: 0.3, hue: 330 },
        { x: 150, y: 90, rot: 2.2, hue: 130 },
        { x: 100, y: 160, rot: 4.0, hue: 215 },
        { x: 160, y: 150, rot: 5.1, hue: 280 },
        { x: 116, y: 116, rot: 1.0, hue: 170 },
      ],
    },
    { label: 'Scutium in Ø160', code: 'S1s', grid: 168, diameter: 160, seeds: [{ x: 60, y: 70, rot: 0 }, { x: 110, y: 100, rot: 2 }] },
    { label: 'growing Ø128 → Ø160 (mid tween, glow)', code: 'O2u', grid: 232, diameter: 128, growTo: 160, growAt: 0.45, seeds: [{ x: 116, y: 100, rot: 1.2 }] },
    { label: 'Ø96, zoom ×2.5: Orbium turning off the glass', code: 'O2u', grid: 168, diameter: 96, zoom: 2.5, seeds: [{ x: 84, y: 100, rot: 1.4 }], steps: 60 },
    { label: 'Hydrogeminium in Ø224', code: '3GH2n', grid: 232, diameter: 224, seeds: [{ x: 116, y: 100, rot: 0 }] },
  ];
  const out: { label: string; mass: number; outside: number }[] = [];
  for (const p of panels) {
    const P = species(p.code);
    const c = makeCanvas(cssW, cssH, true, p.label);
    const sim = createSimulation(c, { gridW: p.grid, gridH: p.grid, params: P });
    const d0 = dishForGrid(p.grid, p.grid, p.diameter);
    const anim = new DishAnimator(d0);
    sim.setDish(d0);
    const pat = catalogPattern(p.code);
    for (const s of p.seeds) sim.seed({ x: s.x, y: s.y, radius: P.R * 2, density: 1, noise: 0, shape: 'pattern', pattern: pat, rotation: s.rot });
    const bodies = deflectRun(sim, d0, p.steps ?? 300);
    if (p.growTo) {
      anim.setTarget(dishForGrid(p.grid, p.grid, p.growTo));
      anim.update((p.growAt ?? 0.5) * 1.5);
      sim.setDish(anim.rim);
      sim.setDishFx({ grow: anim.glow });
    }
    const A = sim.readState();
    const cam = new Camera(p.grid, p.grid, cssW, cssH);
    cam.setDish(anim.rim, anim.fit);
    if (p.zoom) {
      const cc = centroidPlain(A, p.grid, p.grid);
      cam.zoom = p.zoom;
      cam.cx = cc.x;
      cam.cy = cc.y;
      cam.clamp();
    }
    if (p.seeds.some((s) => s.hue !== undefined)) {
      // One tint per creature (the game will use each creature's species hue).
      const hues = p.seeds.map((s) => s.hue ?? 0);
      sim.setCreatureTints(bodies.map((b, i) => ({ x: b.x, y: b.y, r: Math.max(P.R, b.radius * 2), hue: hues[i % hues.length] })));
    }
    const view = { camera: cam, time: 1.0, quality };
    sim.render(view);
    out.push({ label: p.label, mass: sum(A), outside: outsideMax(A, p.grid, p.grid, anim.rim) });
    live.push({ sim, view });
  }
  return out;
}

(window as unknown as { simTest: unknown }).simTest = {
  dishChecks,
  bounce,
  dishPerf,
  dishVisual,
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
  restyle,
};
(window as unknown as { simTestReady: boolean }).simTestReady = true;
