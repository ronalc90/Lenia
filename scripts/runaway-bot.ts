/**
 * Runaway-lysis bot: the CPU reference Lenia + the real detector + real game spores on the live
 * toroidal grids, each scenario run twice from the same seed — with the RunawayWatch erasing what
 * it flags (as main.ts does with sim.erase) and without (control). Prints one JSON line per run.
 *
 *   npx vite-node scripts/runaway-bot.ts <scenario> <W>x<H> <runFrom> <runTo> [calib]
 *
 *   scenario  cluster6 (6 spores within ±0.03 of the dish) | cluster6w (±0.1) | converge | budding | normal
 *   calib     c0 (μ .15 σ .015, the start) | c1 (μ .155 σ .017) | c2 (μ .145 σ .0145)
 *
 * Maze = fill > MAZE_FILL for more than MAZE_STEPS consecutive steps. Every erase is judged by a
 * counterfactual: the watched run is forked just before the erase and continued without it (and
 * without any watch) for CF_STEPS; the flag is justified when that fork floods (fill > MAZE_FILL).
 * False positive = an unjustified flag (whatever the component's state). Collateral = stable
 * creatures other than the flagged one whose centre lies inside an erase disc.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import type { DetectorReport, LeniaParams, SeedSpec } from '../src/core/types';
import { createDetector } from '../src/detect/detector';
import { placeRotated } from '../src/detect/harness';
import { pickSporeTemplate, scaledTemplate } from '../src/game/seeding';
import { catalogByCode, catalogPattern, paramsOf } from '../src/sim/catalog';
import { CpuLenia } from '../src/sim/cpu';
import { localMass, RunawayWatch } from '../src/sim/runaway';
import { applyEraseCpu, applySeedCpu } from '../src/sim/seed';
import { snapshotFromCpu } from '../src/sim/snapshot';

const MAZE_FILL = 0.1;
/** RUNAWAY_DEBUG=<steps>: print the watched run's biggest components up to that step (stderr). */
const DEBUG = Number(process.env.RUNAWAY_DEBUG ?? 0);
/** RUNAWAY_DEBUG_CTRL=<from>,<to>: print the control run's biggest components in that step range. */
const DEBUG_CTRL = process.env.RUNAWAY_DEBUG_CTRL ? process.env.RUNAWAY_DEBUG_CTRL.split(',').map(Number) : null;
const MAZE_STEPS = 200;
/** RUNAWAY_TRACE=<file>: run the control only and append every update's components to <file> (JSON lines, for tuning). */
const TRACE = process.env.RUNAWAY_TRACE ?? '';
/**
 * RUNAWAY_CONTROL_DIR=<dir>: take the control run from a trace written earlier by RUNAWAY_TRACE
 * (<dir>/<scenario>-<W>x<H>-<calib>-<run>.jsonl; the CPU reference is deterministic) instead of
 * running it again.
 */
const CONTROL_DIR = process.env.RUNAWAY_CONTROL_DIR ?? '';
/** RUNAWAY_FRAMES=<file>:<t1,t2,…>: append the field (scale-2 snapshot, u8) of both runs at those steps. */
const [FRAMES_OUT, FRAMES_AT] = (process.env.RUNAWAY_FRAMES ?? ':').split(':');
const FRAME_STEPS = new Set((FRAMES_AT ?? '').split(',').filter(Boolean).map(Number));
const EVERY = 10;
/** Counterfactual horizon (steps) for judging an erase. */
const CF_STEPS = 500;

const CALIBS: Record<string, Pick<LeniaParams, 'mu' | 'sigma'>> = {
  c0: { mu: 0.15, sigma: 0.015 },
  c1: { mu: 0.155, sigma: 0.017 },
  c2: { mu: 0.145, sigma: 0.0145 },
  bud: { mu: 0.15, sigma: 0.021 },
};

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Plan {
  steps: number;
  /** Seeds by step. */
  seeds: { at: number; spec: SeedSpec }[];
  /** Catalog creatures placed at t = 0 (converge). */
  placed: { x: number; y: number; rot: number }[];
}

function spore(P: LeniaParams, rng: () => number, x: number, y: number): SeedSpec {
  const e = pickSporeTemplate({ mu: P.mu, sigma: P.sigma, rings: P.rings }, rng);
  return {
    x,
    y,
    radius: P.R,
    density: 0.6 + rng() * 0.2,
    noise: 0.35,
    shape: 'blob',
    pattern: scaledTemplate(e, P.R),
    bias: 0.88,
    rotation: rng() * Math.PI * 2,
    rngSeed: Math.floor(rng() * 2147483647),
  };
}

function torusDist(ax: number, ay: number, bx: number, by: number, w: number, h: number): number {
  let dx = Math.abs(ax - bx) % w;
  let dy = Math.abs(ay - by) % h;
  if (dx > w / 2) dx = w - dx;
  if (dy > h / 2) dy = h - dy;
  return Math.hypot(dx, dy);
}

function makePlan(scenario: string, P: LeniaParams, W: number, H: number, rng: () => number): Plan {
  const R = P.R;
  if (scenario === 'cluster6' || scenario === 'cluster6w') {
    const spread = scenario === 'cluster6' ? 0.03 : 0.1;
    const cx = W * (0.25 + 0.5 * rng());
    const cy = H * (0.25 + 0.5 * rng());
    const seeds = Array.from({ length: 6 }, () => ({
      at: 0,
      spec: spore(P, rng, cx + (rng() * 2 - 1) * spread * W, cy + (rng() * 2 - 1) * spread * H),
    }));
    return { steps: 2000, seeds, placed: [] };
  }
  if (scenario === 'converge') {
    const n = 4 + Math.floor(rng() * 3);
    const cx = W / 2 + (rng() - 0.5) * 20;
    const cy = H / 2 + (rng() - 0.5) * 20;
    const ring = Math.min(W, H) * 0.3;
    const placed = Array.from({ length: n }, (_, k) => {
      const a = (k / n) * Math.PI * 2 + (rng() - 0.5) * 0.4;
      const x = cx + ring * Math.cos(a);
      const y = cy + ring * Math.sin(a);
      const head = Math.atan2(cy - y, cx - x) + (rng() - 0.5) * 0.5;
      // The catalog Orbium swims at ~68° in its own frame.
      return { x, y, rot: head - (68 * Math.PI) / 180 };
    });
    return { steps: 2000, seeds: [], placed };
  }
  if (scenario === 'budding') {
    const n = 1 + Math.floor(rng() * 2);
    return { steps: 3000, seeds: Array.from({ length: n }, (_, k) => ({ at: k * 200, spec: spore(P, rng, W * rng(), H * rng()) })), placed: [] };
  }
  // normal: 5–10 spores seeded apart, one every 150 steps, long play.
  const n = 5 + Math.floor(rng() * 6);
  const pts: { x: number; y: number }[] = [];
  const seeds: Plan['seeds'] = [];
  for (let k = 0; k < n; k++) {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 200; tries++) {
      x = W * rng();
      y = H * rng();
      if (pts.every((p) => torusDist(p.x, p.y, x, y, W, H) > 3 * R)) break;
    }
    pts.push({ x, y });
    seeds.push({ at: k * 150, spec: spore(P, rng, x, y) });
  }
  return { steps: 6000, seeds, placed: [] };
}

interface Flag {
  step: number;
  id: number;
  reason: string;
  state: string;
  mass: number;
  age: number;
  /** The fork without this update's erases flooded within CF_STEPS (at that many steps). */
  justified: boolean;
  floodIn: number;
  /** Stable creatures (other than this one) whose centre lies inside the disc. */
  collateral: number;
  /** Erase disc. */
  x: number;
  y: number;
  r: number;
}

/** Continue a copy of the field without erasing anything; steps until fill > MAZE_FILL, or -1. */
function counterfactual(A: Float32Array, t0: number, seeds: Plan['seeds'], P: LeniaParams, W: number, H: number): number {
  const fork = new CpuLenia(W, H, P);
  fork.A.set(A);
  let k = 0;
  while (k < seeds.length && seeds[k].at <= t0) k++;
  for (let t = t0 + EVERY; t <= t0 + CF_STEPS; t += EVERY) {
    fork.step(EVERY);
    while (k < seeds.length && seeds[k].at <= t) applySeedCpu(fork.A, W, H, seeds[k++].spec);
    const snap = snapshotFromCpu(fork.A, W, H, 2, t);
    let filled = 0;
    for (let i = 0; i < snap.value.length; i++) if (snap.value[i] > 0.1) filled++;
    if (filled / snap.value.length > MAZE_FILL) return t - t0;
  }
  return -1;
}

interface RunOut {
  maxFill: number;
  maze: boolean;
  longestHigh: number;
  stableEnd: number;
  creaturesEnd: number;
  flags: Flag[];
  msPerUpdate: number;
}

function run(plan: Plan, P: LeniaParams, W: number, H: number, withWatch: boolean): RunOut {
  const sim = new CpuLenia(W, H, P);
  for (const p of plan.placed) placeRotated(sim.A, W, H, catalogPattern('O2u'), p.x, p.y, p.rot);
  const det = createDetector();
  const watch = new RunawayWatch();
  const flags: Flag[] = [];
  let maxFill = 0;
  let high = 0;
  let longestHigh = 0;
  let last: DetectorReport | null = null;
  let watchMs = 0;
  let updates = 0;
  let seedIdx = 0;
  const seeds = [...plan.seeds].sort((a, b) => a.at - b.at);
  for (let t = 0; t <= plan.steps; t += EVERY) {
    while (seedIdx < seeds.length && seeds[seedIdx].at <= t) applySeedCpu(sim.A, W, H, seeds[seedIdx++].spec);
    if (t > 0) sim.step(EVERY);
    const snap = snapshotFromCpu(sim.A, W, H, 2, sim.stepCount);
    const rep = det.update(snap, P);
    last = rep;
    maxFill = Math.max(maxFill, rep.fill);
    high = rep.fill > MAZE_FILL ? high + EVERY : 0;
    longestHigh = Math.max(longestHigh, high);
    if (DEBUG_CTRL && !withWatch && sim.stepCount >= DEBUG_CTRL[0] && sim.stepCount <= DEBUG_CTRL[1] && sim.stepCount % 10 === 0) {
      const top = [...rep.creatures].sort((a, b) => b.mass - a.mass).slice(0, 4);
      console.error(`ctrl t${sim.stepCount} fill ${rep.fill.toFixed(3)} | ` + top.map((c) => `#${c.id} ${c.state[0]} m${c.mass.toFixed(0)} a${c.age}`).join('  '));
    }
    if (FRAMES_OUT && FRAME_STEPS.has(sim.stepCount)) {
      appendFileSync(
        FRAMES_OUT,
        JSON.stringify({
          run: withWatch ? 'watch' : 'control',
          t: sim.stepCount,
          w: snap.w,
          h: snap.h,
          fill: rep.fill,
          stable: rep.creatures.filter((c) => c.state === 'stable').length,
          flags: flags.map((f) => [f.step, f.x, f.y, f.r]),
          data: Array.from(snap.value, (v) => Math.round(Math.min(1, v) * 255)),
        }) + '\n',
      );
    }
    if (TRACE && !withWatch) {
      const cs = rep.creatures
        .filter((c) => c.state !== 'dead')
        .map((c) => [c.id, c.state[0], +c.mass.toFixed(1), c.age, +c.x.toFixed(1), +c.y.toFixed(1), +c.radius.toFixed(2), +localMass(snap, c.x, c.y, 3 * P.R, null).toFixed(1)]);
      appendFileSync(TRACE, JSON.stringify({ t: sim.stepCount, fill: +rep.fill.toFixed(4), cs }) + '\n');
    }
    if (withWatch) {
      const t0 = performance.now();
      const r = watch.update(rep, snap, P);
      if (DEBUG && sim.stepCount <= DEBUG) {
        const top = [...rep.creatures].sort((a, b) => b.mass - a.mass).slice(0, 4);
        console.error(
          `t${sim.stepCount} fill ${rep.fill.toFixed(3)} ref ${r.refMass.toFixed(0)} n ${rep.creatures.length} | ` +
            top.map((c) => `#${c.id} ${c.state[0]} m${c.mass.toFixed(0)} a${c.age}`).join('  '),
        );
      }
      watchMs += performance.now() - t0;
      updates++;
      const floodIn = r.started.length ? counterfactual(sim.A, sim.stepCount, seeds, P, W, H) : -1;
      for (let k = 0; k < r.started.length; k++) {
        const s = r.started[k];
        const e = r.erase[k];
        const c = rep.creatures.find((x) => x.id === s.id)!;
        const collateral = rep.creatures.filter(
          (o) => o.id !== s.id && o.state === 'stable' && torusDist(o.x, o.y, e.x, e.y, W, H) < e.radius,
        ).length;
        flags.push({
          step: sim.stepCount,
          id: s.id,
          reason: s.reason,
          state: c.state,
          mass: Math.round(c.mass),
          age: c.age,
          justified: floodIn >= 0,
          floodIn,
          collateral,
          x: Math.round(e.x),
          y: Math.round(e.y),
          r: Math.round(e.radius),
        });
      }
      for (const e of r.erase) applyEraseCpu(sim.A, W, H, e.x, e.y, e.radius);
    }
  }
  return {
    maxFill,
    maze: longestHigh > MAZE_STEPS,
    longestHigh,
    stableEnd: last ? last.creatures.filter((c) => c.state === 'stable').length : 0,
    creaturesEnd: last ? last.creatures.filter((c) => c.state !== 'dead').length : 0,
    flags,
    msPerUpdate: updates ? watchMs / updates : 0,
  };
}

/** Control results from a finished trace, or null. */
function controlFromTrace(file: string): RunOut | null {
  if (!existsSync(file)) return null;
  const lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  if (!lines.some((l) => l.end !== undefined)) return null;
  const ups = lines.filter((l) => l.t !== undefined) as { t: number; fill: number; cs: [number, string][] }[];
  let maxFill = 0;
  let high = 0;
  let longestHigh = 0;
  for (const u of ups) {
    maxFill = Math.max(maxFill, u.fill);
    high = u.fill > MAZE_FILL ? high + EVERY : 0;
    longestHigh = Math.max(longestHigh, high);
  }
  const lastCs = ups[ups.length - 1].cs;
  return {
    maxFill,
    maze: longestHigh > MAZE_STEPS,
    longestHigh,
    stableEnd: lastCs.filter((c) => c[1] === 's').length,
    creaturesEnd: lastCs.length,
    flags: [],
    msPerUpdate: 0,
  };
}

const [scenario = 'cluster6', size = '192x240', fromS = '0', toS = '1', calibName] = process.argv.slice(2);
const [W, H] = size.split('x').map(Number);
const calib = calibName ?? (scenario === 'budding' ? 'bud' : 'c0');
const base = paramsOf(catalogByCode('O2u')!);
const P: LeniaParams = { ...base, ...CALIBS[calib] };
for (let i = Number(fromS); i < Number(toS); i++) {
  const seed = 1000 * i + scenario.length * 7 + W;
  const plan = makePlan(scenario, P, W, H, mulberry(seed));
  if (TRACE) appendFileSync(TRACE, JSON.stringify({ run: i, scenario, size, calib }) + '\n');
  const traced = CONTROL_DIR ? controlFromTrace(`${CONTROL_DIR}/${scenario}-${size}-${calib}-${i}.jsonl`) : null;
  const control = traced ?? run(plan, P, W, H, false);
  if (TRACE) {
    appendFileSync(TRACE, JSON.stringify({ end: i, maze: control.maze, maxFill: control.maxFill }) + '\n');
    continue;
  }
  const watched = run(plan, P, W, H, true);
  const unjustified = watched.flags.filter((f) => !f.justified);
  const fp = {
    unjustified: unjustified.length,
    unjustifiedStable: unjustified.filter((f) => f.state === 'stable').length,
    collateralStable: watched.flags.reduce((a, f) => a + f.collateral, 0),
  };
  console.log(
    JSON.stringify({
      scenario,
      size,
      calib,
      run: i,
      control: { maze: control.maze, maxFill: +control.maxFill.toFixed(3), longestHigh: control.longestHigh, stableEnd: control.stableEnd },
      watch: {
        maze: watched.maze,
        maxFill: +watched.maxFill.toFixed(3),
        longestHigh: watched.longestHigh,
        stableEnd: watched.stableEnd,
        flags: watched.flags,
        msPerUpdate: +watched.msPerUpdate.toFixed(3),
      },
      fp,
    }),
  );
}
