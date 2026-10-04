/**
 * Test helpers for the secrets module: a seeded RNG and synthetic hand-drawn strokes.
 * (Imported by tests only; kept out of the public surface.)
 */
import { Bus, type GameEvents } from '../core/bus';
import type { CreatureView, GameView, SpeciesView } from '../core/types';
import { createSecrets, type Secrets } from './secrets';
import type { SecretEvents, StorageLike, TimedPt } from './types';

/** mulberry32: small deterministic PRNG. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface StrokeOpts {
  cx?: number;
  cy?: number;
  /** Overall size (radius-ish), input units. */
  size?: number;
  /** Rotation, radians. */
  rot?: number;
  /** Jitter amplitude as a fraction of size. */
  noise?: number;
  /** Low-frequency wobble amplitude as a fraction of size. */
  wobble?: number;
  /** Raw samples along the curve. */
  samples?: number;
  /** Draw backwards. */
  reverse?: boolean;
  /** Mirror horizontally. */
  mirror?: boolean;
  /** Fraction of the curve to start at (closed shapes). */
  start?: number;
  /** Extra fraction drawn past the end (closed shapes, "overshoot"). */
  overshoot?: number;
}

/**
 * Sample a unit curve f(u), u∈[0,1], into a noisy "hand-drawn" stroke.
 * f returns points roughly within [-1, 1].
 */
export function handDrawn(f: (u: number) => { x: number; y: number }, rng: () => number, o: StrokeOpts = {}, closed = false): TimedPt[] {
  const size = o.size ?? 30;
  const cx = o.cx ?? 96;
  const cy = o.cy ?? 120;
  const rot = o.rot ?? 0;
  const n = o.samples ?? 90;
  const noise = o.noise ?? 0.03;
  const wob = o.wobble ?? 0.04;
  const start = o.start ?? 0;
  const over = o.overshoot ?? 0;
  const ph1 = rng() * 6.28;
  const ph2 = rng() * 6.28;
  const out: TimedPt[] = [];
  const span = 1 + (closed ? over : 0);
  for (let i = 0; i <= n; i++) {
    let u = (i / n) * span;
    if (o.reverse) u = span - u;
    u = closed ? (start + u) % 1 : u;
    let p = f(u);
    if (o.mirror) p = { x: -p.x, y: p.y };
    const wx = Math.sin(i * 0.11 + ph1) * wob;
    const wy = Math.cos(i * 0.09 + ph2) * wob;
    const jx = (rng() * 2 - 1) * noise;
    const jy = (rng() * 2 - 1) * noise;
    const x = p.x + wx + jx;
    const y = p.y + wy + jy;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    out.push({ x: cx + (x * c - y * s) * size, y: cy + (x * s + y * c) * size, t: i * 12 });
  }
  return out;
}

const TAU = Math.PI * 2;

export const curves = {
  circle: (u: number) => ({ x: Math.cos(u * TAU), y: Math.sin(u * TAU) }),
  ellipse: (u: number) => ({ x: Math.cos(u * TAU), y: 0.72 * Math.sin(u * TAU) }),
  spiral: (turns: number) => (u: number) => ({ x: u * Math.cos(u * turns * TAU), y: u * Math.sin(u * turns * TAU) }),
  heart: (u: number) => {
    const t = u * TAU;
    return {
      x: (16 * Math.sin(t) ** 3) / 17,
      y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17,
    };
  },
  infinity: (u: number) => {
    const t = u * TAU;
    const d = 1 + Math.sin(t) ** 2;
    return { x: Math.cos(t) / d, y: (Math.sin(t) * Math.cos(t)) / d };
  },
  /** Polyline through points, parametrised by arc length. */
  poly: (pts: { x: number; y: number }[]) => {
    const seg: number[] = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      seg.push(d);
      total += d;
    }
    return (u: number) => {
      let target = Math.min(1, Math.max(0, u)) * total;
      for (let i = 0; i < seg.length; i++) {
        if (target <= seg[i] || i === seg.length - 1) {
          const t = seg[i] ? Math.min(1, target / seg[i]) : 0;
          return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t };
        }
        target -= seg[i];
      }
      return pts[pts.length - 1];
    };
  },
};

/** Glider cell path (.O. / ..O / OOO) centred on the origin, unit ≈ 0.7. */
export const GLIDER_PATH = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
].map((p) => ({ x: p.x * 0.7, y: (p.y - 0.33) * 0.7 }));

/** A random-walk scribble (what a player sowing with the brush might draw). */
export function scribble(rng: () => number, n = 60, step = 2.5, cx = 96, cy = 120): TimedPt[] {
  let x = cx;
  let y = cy;
  let a = rng() * TAU;
  const out: TimedPt[] = [];
  for (let i = 0; i < n; i++) {
    a += (rng() * 2 - 1) * 0.9;
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    out.push({ x, y, t: i * 16 });
  }
  return out;
}

// ───────────────────────────── fake game world ─────────────────────────────


export function memoryStorage(init: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

export function fakeView(over: Partial<GameView> = {}): GameView {
  return {
    essence: 0,
    essencePerSec: 0,
    samples: 0,
    genome: 0,
    era: 1,
    seedCost: 5,
    canSeed: true,
    pipette: { active: false, progress: 0 },
    tools: { longPress: false, brush: false, eraser: false, speeds: [1], speed: 1 },
    upgrades: [],
    genomeNodes: [],
    species: [],
    behaviorsSeen: [],
    calibration: {
      mu: 0.15,
      sigma: 0.015,
      R: 13,
      dt: 0.1,
      muRange: null,
      sigmaRange: null,
      RRange: null,
      dtRange: null,
      regimes: [],
      maxRegimes: 0,
    },
    journal: [],
    achievements: [],
    extinction: { available: false, genomeGain: 0, gainIn10Min: 0, requirement: { es: '', en: '' } },
    golden: null,
    buffs: [],
    creatures: [],
    objective: null,
    settings: {
      lang: 'es',
      sfxVolume: 1,
      musicVolume: 1,
      muted: false,
      vibration: true,
      reduceMotion: false,
      oneTouch: false,
      quality: 'auto',
      analytics: false,
    },
    tabs: { lab: true, bestiary: true, calibrate: false, genome: false },
    stats: { playTime: 0, totalEssence: 0, eraEssence: 0, seeds: 0, creaturesBorn: 0 },
    ...over,
  };
}

export function creature(id: number, x: number, y: number, over: Partial<CreatureView> = {}): CreatureView {
  return { id, x, y, r: 6, state: 'stable', behavior: 'swimmer', speciesId: 'sp1', speciesName: 'Espécimen 1', eps: 1, age: 500, ...over };
}

export function species(id: string, catalogName: string | null): SpeciesView {
  return {
    id,
    name: catalogName ?? id,
    catalogName,
    rarity: 'common',
    behavior: 'swimmer',
    mult: 1.1,
    timesSeen: 1,
    era: 1,
    portrait: null,
    muRange: [0.15, 0.15],
    sigmaRange: [0.015, 0.015],
    printCost: 1,
    isNew: false,
  };
}

/** A fake world: bus, mutable view, controllable clock, recorded secret events. */
export function fakeWorld(opts: { start?: string; rng?: () => number; storage?: StorageLike | null } = {}) {
  const bus = new Bus<GameEvents>();
  let t = new Date(opts.start ?? '2026-06-15T15:00:00').getTime();
  let view = fakeView();
  const storage = opts.storage === undefined ? memoryStorage() : opts.storage;
  const secrets: Secrets = createSecrets({
    bus,
    getView: () => view,
    storage,
    now: () => new Date(t),
    rng: opts.rng ?? (() => 0.5),
    autoPoll: false,
    grid: { w: 192, h: 240 },
  });
  const log: { [K in keyof SecretEvents]: SecretEvents[K][] } = {
    found: [],
    effect: [],
    unlockCosmetic: [],
    grantJournal: [],
    allFound: [],
    progress: [],
    colormap: [],
  };
  (Object.keys(log) as (keyof SecretEvents)[]).forEach((k) => secrets.on(k, (p) => (log[k] as unknown[]).push(p)));
  return {
    bus,
    secrets,
    log,
    storage,
    get view() {
      return view;
    },
    set view(v: GameView) {
      view = v;
    },
    setView(over: Partial<GameView>) {
      view = { ...view, ...over };
    },
    /** Advance the clock by `seconds`, polling every `step` seconds. */
    advance(seconds: number, step = 1, each?: (elapsed: number) => void) {
      for (let s = 0; s < seconds; s += step) {
        t += step * 1000;
        each?.(s + step);
        secrets.tick();
      }
    },
    /** Move the clock without polling. */
    jump(seconds: number) {
      t += seconds * 1000;
    },
    now: () => t,
    foundIds: () => log.found.map((f) => f.secret.id),
  };
}
