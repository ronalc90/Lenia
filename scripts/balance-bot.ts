/**
 * Balance bot (doc §20). A statistical model of the dish drives the REAL game logic
 * (createGame) with fake detector reports at high speed, under three player policies.
 *
 *   npx vite-node scripts/balance-bot.ts [minutes=120] [runs=3] [--verbose]
 *
 * The dish model (all numbers here are model assumptions, NOT game balance):
 *  - a seed is "born" for 400 sim steps, then becomes stable with probability p(bias, noise, regime fit)
 *    (bias 0.7 ≈ 5 %, 0.88 ≈ 25 %, 0.92 ≈ 40 %, 1.0 = 100 % — measured anchors from the brief);
 *    failures die (80 %) or explode then die (20 %);
 *  - a catalog species lives only near its (μ, σ) (normalised distance ≤ VIABLE_D); some species
 *    are "robust" (random blobs survive: Gyrorbium, Scutium…);
 *  - which species a success becomes: mostly the spore template, sometimes another viable species,
 *    sometimes a novel (non-catalog) species of that parameter cell;
 *  - behaviour is classified after 1000 steps (table per species); swimmers drift and collide;
 *    dividers split when there is room; 3+ of a species close together form a colony;
 *  - creatures die from a small base hazard, collisions and calibration changes that leave their range;
 *    swimmers sharing a crowded dish die sooner (QA3 F5 measured a median ~27 s life for Orbium when
 *    3–5 share the dish in early play: MOVER_HAZARD below is a compromise with the CPU species audit,
 *    where founders in 4-creature dishes mostly lived ≥ 1 000 steps);
 *  - 30 sim steps per real second × Incubadora speed (src/main.ts STEPS_PER_SEC).
 */
import { Bus, type GameEvents } from '../src/core/bus';
import type { Behavior, Creature, DetectorEvent, LeniaParams, SeedSpec } from '../src/core/types';
import { createGame, type CatalogSignature, type Game } from '../src/game/game';
import { nearestCatalog, paramDistance } from '../src/game/seeding';
import { CATALOG } from '../src/sim/catalog';
import { seededRng } from '../src/game/testUtil';
import { SIG_SCALES } from '../src/detect/signature';
import catalogSigJson from '../src/detect/catalogSignatures.json';

// ───────────────────────────── model constants ─────────────────────

/** Must match STEPS_PER_SEC in src/main.ts (sim steps per real second at speed ×1). */
const STEPS_PER_SEC = 30;
const DT = 0.5; // real seconds per bot tick
const BORN_STEPS = 400;
/** A spore that will not make it dissolves this fast (QA2: first seeds died at 51–64 steps). */
const DIE_STEPS = 60;
const CLASSIFY_STEPS = 1000;
const VIABLE_D = 0.6;
const BASE_HAZARD = 1 / 2400; // per real second for a stable creature
/** Extra hazard per real second for a swimmer/spinner while ≥ MOVER_CROWD movers share the dish. [QA3 F5] */
const MOVER_HAZARD = 1 / 600;
const MOVER_CROWD = 3;
const SWIM_SPEED = 0.8; // cells per real second at ×1
const COLLIDE_R = 1.5; // in R
const COLLIDE_KILL = 0.6;
const DIVIDE_EVERY = 1500; // steps
const GRID = { w: 192, h: 240 };

const BIAS_TABLE: [number, number][] = [
  [0, 0],
  [0.5, 0.01],
  [0.7, 0.05],
  [0.8, 0.12],
  [0.85, 0.19],
  [0.88, 0.25],
  [0.92, 0.4],
  [0.95, 0.55],
  [0.98, 0.8],
  [1, 1],
];
function pFromBias(b: number): number {
  for (let i = 1; i < BIAS_TABLE.length; i++) {
    const [x1, y1] = BIAS_TABLE[i];
    const [x0, y0] = BIAS_TABLE[i - 1];
    if (b <= x1) return y0 + ((b - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 1;
}

interface SpeciesModel {
  code: string;
  mu: number;
  sigma: number;
  rings: number[];
  behavior: Behavior;
  complexity: number;
  robust: number;
  sig: number[];
  fertile?: boolean;
}

// Behaviour / complexity / robustness guesses per catalog species.
const TRAITS: Record<string, [Behavior, number, number]> = {
  O2u: ['swimmer', 1.0, 0],
  O2b: ['swimmer', 1.05, 0],
  O2ui: ['swimmer', 0.9, 0.1],
  O4s: ['still', 1.2, 0.1],
  O2p: ['swimmer', 0.8, 0],
  OG2r: ['spinner', 1.1, 0.3],
  O4i: ['swimmer', 1.2, 0.1],
  OG2g: ['spinner', 1.1, 0.6],
  O4d: ['divider', 1.3, 0.3],
  O4a: ['pulsing', 1.5, 0.3],
  H3cp: ['swimmer', 1.6, 0.2],
  P3sp: ['pulsing', 1.6, 0.2],
  PG1c: ['spinner', 1.4, 0.3],
  PG1a: ['spinner', 1.5, 0.2],
  S1v: ['pulsing', 1.4, 0.4],
  S1s: ['still', 1.3, 0.5],
  'SN+': ['swimmer', 1.5, 0.3],
  H3s: ['spinner', 2.0, 0.3],
  S2s: ['still', 1.8, 0.5],
  H5s: ['spinner', 2.4, 0.2],
  C0v: ['pulsing', 1.4, 0.3],
  PS3am: ['pulsing', 2.0, 0.2],
  S3s: ['still', 2.2, 0.4],
  P4cp: ['swimmer', 1.8, 0.2],
  '3GH2n': ['swimmer', 2.8, 0.1],
  K4d: ['divider', 2.3, 0.2],
};

function hashRng(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  return seededRng(h);
}
const REAL_SIGS = (catalogSigJson as unknown as CatalogSignature[]).filter((e) => e.signature?.length);
const SIG_LEN = REAL_SIGS[0]?.signature.length ?? 8;
const scale = (i: number) => SIG_SCALES[i] ?? 0.05;
/** Catalog species use the detector's measured signature; others are a far perturbation of one. */
function sigFor(key: string): number[] {
  const real = REAL_SIGS.find((e) => e.code === key);
  if (real) return real.signature.map((v) => (v >= 0 ? v : 0));
  const r = hashRng('sig:' + key);
  const base = REAL_SIGS.length ? REAL_SIGS[Math.floor(r() * REAL_SIGS.length)].signature : new Array(SIG_LEN).fill(0.5);
  return base.map((v, i) => Math.max(0, (v >= 0 ? v : 0) + (r() * 2 - 1) * 6 * scale(i)));
}

const CATALOG_MODELS: SpeciesModel[] = CATALOG.map((e) => {
  const [behavior, complexity, robust] = TRAITS[e.code] ?? ['still', 1, 0];
  return { code: e.code, mu: e.m, sigma: e.s, rings: e.b, behavior, complexity, robust, sig: sigFor(e.code) };
});
/** What the game reveals against: the detector's reference file when present, else synthetic. */
const BOT_CATALOG_SIGS: CatalogSignature[] = REAL_SIGS.length
  ? REAL_SIGS
  : CATALOG.map((e) => ({ code: e.code, name: e.name, signature: sigFor(e.code), mu: e.m, sigma: e.s, R: e.R }));

const novelCache = new Map<string, SpeciesModel>();
function novelSpecies(mu: number, sigma: number, k: number, rings: number[]): SpeciesModel {
  const key = `N:${Math.round(mu / 0.012)}:${Math.round(sigma / 0.0025)}:${k}:${rings.length}`;
  let m = novelCache.get(key);
  if (!m) {
    const r = hashRng(key);
    const bs: Behavior[] = ['still', 'pulsing', 'swimmer', 'spinner', 'swimmer', 'pulsing'];
    m = { code: key, mu, sigma, rings, behavior: bs[Math.floor(r() * bs.length)], complexity: 0.8 + r() * 1.0, robust: 0, sig: sigFor(key), fertile: r() < 0.25 };
    novelCache.set(key, m);
  }
  return m;
}

const ringsEq = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-3);

// ───────────────────────────── dish model ──────────────────────────

interface Blob {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  steps: number;
  species: SpeciesModel | null;
  fate: 'stable' | 'die' | 'explode';
  state: Creature['state'];
  behavior: Behavior | null;
  lingerSteps: number;
  divideAt: number;
  sigNoise: number[];
}

class Dish {
  blobs: Blob[] = [];
  private nextId = 1;
  events: DetectorEvent[] = [];
  constructor(
    private rng: () => number,
    private params: () => LeniaParams,
  ) {}

  private viable(sp: SpeciesModel, p: LeniaParams): boolean {
    return ringsEq(sp.rings, p.rings) && paramDistance(sp.mu, sp.sigma, p.mu, p.sigma) <= VIABLE_D;
  }

  /** Decide what a seed becomes. `printed` = species model of a print. */
  addSeed(spec: SeedSpec, printed?: SpeciesModel | null): void {
    const p = this.params();
    const R = p.R;
    let fate: Blob['fate'] = 'die';
    let species: SpeciesModel | null = null;
    // Landing on a creature: merge, maybe kill it.
    const hit = this.blobs.find((b) => b.state !== 'dead' && wrapDist(b.x, b.y, spec.x, spec.y) < 1.2 * R);
    if (hit) {
      if (this.rng() < 0.3) this.kill(hit, 'died');
    } else if (printed !== undefined) {
      species = printed;
      fate = printed && this.viable(printed, p) ? (this.rng() < 0.95 ? 'stable' : 'die') : this.rng() < 0.1 ? 'stable' : 'die';
    } else {
      const tpl = CATALOG_MODELS.find((m) => m.code === nearestCatalog(p).code)!;
      const viable = CATALOG_MODELS.filter((m) => this.viable(m, p));
      const bias = spec.bias ?? 0;
      let prob = spec.shape === 'pattern' && bias >= 1 ? 1 : bias <= 0 ? 0.02 : pFromBias(bias) * (1 - 0.5 * Math.max(0, spec.noise - 0.2));
      const tplViable = viable.includes(tpl);
      if (!tplViable) prob *= novelSpecies(p.mu, p.sigma, 0, p.rings).fertile ? 0.25 : 0.03;
      const robust = viable.reduce((m, v) => Math.max(m, v.robust), 0);
      prob = prob + (1 - prob) * robust * Math.min(1, (1 - Math.min(1, bias)) / 0.3);
      if (this.rng() < prob) {
        fate = 'stable';
        // Which species?
        const opts: [SpeciesModel, number][] = [];
        if (tplViable) opts.push([tpl, bias >= 1 ? 100 : 1]);
        for (const v of viable) if (v !== tpl) opts.push([v, 0.12 + v.robust * (1 - bias) * 3]);
        // Novel (non-catalog) species only live in "fertile" parameter cells (~25 %).
        const novel = novelSpecies(p.mu, p.sigma, 0, p.rings);
        if (novel.fertile) opts.push([novel, tplViable ? 0.03 : 0.25]);
        if (!opts.length) fate = 'die';
        else {
          let r = this.rng() * opts.reduce((a, o) => a + o[1], 0);
          species = opts[opts.length - 1][0];
          for (const [m, w] of opts) if ((r -= w) < 0) {
            species = m;
            break;
          }
        }
      } else fate = this.rng() < 0.2 ? 'explode' : 'die';
    }
    const ang = this.rng() * Math.PI * 2;
    this.blobs.push({
      id: this.nextId++,
      x: spec.x,
      y: spec.y,
      vx: Math.cos(ang),
      vy: Math.sin(ang),
      steps: 0,
      species,
      fate,
      state: 'born',
      behavior: null,
      lingerSteps: 0,
      divideAt: DIVIDE_EVERY,
      sigNoise: Array.from({ length: SIG_LEN }, (_, i) => (this.rng() * 2 - 1) * 0.2 * scale(i)),
    });
  }

  kill(b: Blob, how: 'died' | 'exploded'): void {
    if (b.state === 'dead') return;
    b.state = 'dead';
    this.events.push({ type: how, id: b.id, x: b.x, y: b.y } as DetectorEvent);
  }

  clear(): void {
    this.blobs = [];
  }

  calibrationChanged(): void {
    const p = this.params();
    for (const b of this.blobs) {
      if (b.state === 'dead' || !b.species) continue;
      const d = ringsEq(b.species.rings, p.rings) ? paramDistance(b.species.mu, b.species.sigma, p.mu, p.sigma) : 99;
      if (d > VIABLE_D * 1.3) b.lingerSteps = -1; // will die soon
    }
  }

  step(dt: number, speed: number): { creatures: Creature[]; events: DetectorEvent[] } {
    const p = this.params();
    const R = p.R;
    const ds = dt * STEPS_PER_SEC * speed;
    const movers = this.blobs.filter((b) => b.state === 'stable' && (b.behavior === 'swimmer' || b.behavior === 'spinner')).length;
    for (const b of this.blobs) {
      if (b.state === 'dead') continue;
      b.steps += ds;
      if (b.lingerSteps < 0 && this.rng() < dt / 3) {
        this.kill(b, 'died');
        continue;
      }
      if (b.state === 'born' && b.fate === 'die' && b.steps >= DIE_STEPS) this.kill(b, 'died');
      else if (b.state === 'born' && b.steps >= BORN_STEPS) {
        if (b.fate === 'stable') b.state = 'stable';
        else if (b.fate === 'explode') {
          b.state = 'exploded';
          this.events.push({ type: 'exploded', id: b.id, x: b.x, y: b.y });
          b.lingerSteps = 180;
        } else this.kill(b, 'died');
      } else if (b.state === 'exploded') {
        b.lingerSteps -= ds;
        if (b.lingerSteps <= 0) {
          b.state = 'dead';
          this.events.push({ type: 'died', id: b.id, x: b.x, y: b.y });
        }
      } else if (b.state === 'stable') {
        const mover = b.behavior === 'swimmer' || b.behavior === 'spinner';
        if (this.rng() < (BASE_HAZARD + (mover && movers >= MOVER_CROWD ? MOVER_HAZARD : 0)) * dt) {
          this.kill(b, 'died');
          continue;
        }
        if (b.steps >= CLASSIFY_STEPS && b.species && b.behavior === null) b.behavior = b.species.behavior;
        if (b.behavior === 'swimmer' || b.behavior === 'spinner') {
          const v = SWIM_SPEED * speed * dt * (b.behavior === 'spinner' ? 0.4 : 1);
          if (b.behavior === 'spinner') {
            const a = Math.atan2(b.vy, b.vx) + 0.3 * dt * speed;
            b.vx = Math.cos(a);
            b.vy = Math.sin(a);
          }
          b.x = (b.x + b.vx * v + GRID.w) % GRID.w;
          b.y = (b.y + b.vy * v + GRID.h) % GRID.h;
        }
        if ((b.behavior === 'divider' || b.behavior === 'colony') && b.species?.behavior === 'divider' && b.steps >= b.divideAt) {
          b.divideAt += DIVIDE_EVERY;
          const a = this.rng() * Math.PI * 2;
          const cx = (b.x + Math.cos(a) * 2.2 * R + GRID.w) % GRID.w;
          const cy = (b.y + Math.sin(a) * 2.2 * R + GRID.h) % GRID.h;
          if (!this.blobs.some((o) => o !== b && o.state !== 'dead' && wrapDist(o.x, o.y, cx, cy) < 1.6 * R)) {
            const child: Blob = { ...b, id: this.nextId++, x: cx, y: cy, steps: 0, state: 'born', behavior: null, fate: 'stable', divideAt: DIVIDE_EVERY, sigNoise: b.sigNoise.map((_, i) => (this.rng() * 2 - 1) * 0.2 * scale(i)) };
            this.blobs.push(child);
            this.events.push({ type: 'divided', parentId: b.id, childIds: [child.id], x: b.x, y: b.y });
          }
        }
      }
    }
    // Collisions between moving stable creatures.
    const live = this.blobs.filter((b) => b.state === 'stable' || b.state === 'born');
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const c = live[j];
        if (a.state === 'dead' || c.state === 'dead') continue;
        const moving = a.behavior === 'swimmer' || a.behavior === 'spinner' || c.behavior === 'swimmer' || c.behavior === 'spinner';
        if (!moving) continue;
        if (wrapDist(a.x, a.y, c.x, c.y) < COLLIDE_R * R && this.rng() < COLLIDE_KILL * dt) this.kill(this.rng() < 0.5 ? a : c, 'died');
      }
    }
    // Colonies.
    const stable = this.blobs.filter((b) => b.state === 'stable' && b.species);
    for (const b of stable) {
      if (b.species!.behavior !== 'divider' || b.behavior === null) continue;
      const near = stable.filter((o) => o.species === b.species && wrapDist(o.x, o.y, b.x, b.y) < 3 * R).length;
      b.behavior = near >= 3 ? 'colony' : 'divider';
    }
    this.blobs = this.blobs.filter((b) => b.state !== 'dead');
    const creatures: Creature[] = this.blobs.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      radius: 0.6 * R,
      mass: 100,
      complexity: b.state === 'stable' && b.species ? b.species.complexity : 0.5,
      state: b.state,
      behavior: b.state === 'stable' ? b.behavior : null,
      age: b.steps,
      vx: 0,
      vy: 0,
      signature: b.species ? b.species.sig.map((v, i) => Math.max(0, v + b.sigNoise[i])) : new Array(SIG_LEN).fill(0.05),
      parentId: null,
    }));
    const events = this.events;
    this.events = [];
    return { creatures, events };
  }
}

function wrapDist(ax: number, ay: number, bx: number, by: number): number {
  let dx = Math.abs(ax - bx) % GRID.w;
  let dy = Math.abs(ay - by) % GRID.h;
  if (dx > GRID.w / 2) dx = GRID.w - dx;
  if (dy > GRID.h / 2) dy = GRID.h - dy;
  return Math.hypot(dx, dy);
}

// ───────────────────────────── policies ────────────────────────────

const level0 = (g: Game, id: string) => (g.state.upgrades[id] ?? 0) === 0;

type PolicyName = 'greedy' | 'explorer' | 'idle';

interface RunResult {
  policy: PolicyName;
  firstStable: number | null;
  sembrador: number | null;
  calibrador: number | null;
  extAvailable: number | null;
  firstExtinction: number | null;
  firstGenome: number;
  species: Record<number, number>;
  eps: Record<number, number>;
  eraEssence120: number;
  totalEssence: number;
  maxWall: number;
  wallFraction: number;
  purchases: number;
  goldens: number;
  firstPurchase: number | null;
  /** Times of every extinction. */
  eras: number[];
  log: string[];
}

const CHECKPOINTS = [3, 8, 15, 30, 45, 60, 90, 120];

function runPolicy(policy: PolicyName, minutes: number, seed: number, verbose: boolean): RunResult {
  const rng = seededRng(seed);
  const bus = new Bus<GameEvents>();
  let t = 0;
  const game: Game = createGame({ bus, rng: seededRng(seed * 7 + 1), now: () => t * 1000, catalogSignatures: BOT_CATALOG_SIGS, grid: GRID });
  const dish = new Dish(rng, () => game.simParams);
  bus.on('dishSeed', ({ specs }) => specs.forEach((s) => dish.addSeed(s)));
  bus.on('dishClear', () => dish.clear());
  bus.on('calibrationChanged', () => dish.calibrationChanged());
  const newSpecies: string[] = [];
  bus.on('speciesNew', ({ speciesId }) => newSpecies.push(speciesId));

  const r: RunResult = {
    policy,
    firstStable: null,
    sembrador: null,
    calibrador: null,
    extAvailable: null,
    firstExtinction: null,
    firstGenome: 0,
    species: {},
    eps: {},
    eraEssence120: 0,
    totalEssence: 0,
    maxWall: 0,
    wallFraction: 0,
    purchases: 0,
    goldens: 0,
    firstPurchase: null,
    eras: [],
    log: [],
  };
  const log = (msg: string) => verbose && r.log.push(`${(t / 60).toFixed(1).padStart(6)}m ${msg}`);
  bus.on('upgradeBought', ({ id, level }) => {
    r.purchases++;
    if (r.firstPurchase === null) r.firstPurchase = t;
    if (id === 'autoSeeder' && r.sembrador === null) r.sembrador = t;
    if (id === 'calibrator' && r.calibrador === null) r.calibrador = t;
    log(`buy ${id} → ${level}`);
  });
  bus.on('speciesNew', ({ name, rarity }) => log(`species ${name} (${rarity})`));
  bus.on('extinctionDone', ({ era, genome }) => {
    r.eras.push(t);
    log(`EXTINCTION → era ${era}, +${genome} genome`);
  });

  let lastManualSeed = -99;
  let lastCalib = 0;
  let nextCheckIn = 0;
  let sessionEnd = 0;
  let wallStart: number | null = null;
  let wallTime = 0;
  let prodTime = 0;
  let extAvailAt: number | null = null;
  let epsEma = 0;
  let goodCalib: { mu: number; sigma: number } | null = null;
  let goodEps = 0;
  const steps = Math.round((minutes * 60) / DT);
  let cp = 0;

  const freeSpot = (spacingR: number): { x: number; y: number } | null => {
    const R = game.simParams.R;
    let best: { x: number; y: number } | null = null;
    let bestD = -1;
    for (let i = 0; i < 30; i++) {
      const x = rng() * GRID.w;
      const y = rng() * GRID.h;
      let d = Infinity;
      for (const b of dish.blobs) d = Math.min(d, wrapDist(x, y, b.x, b.y));
      if (d > bestD) {
        bestD = d;
        best = { x, y };
      }
    }
    return bestD > spacingR * R ? best : null;
  };

  const buyCheapest = (prefer?: string[], seedsCompete = false) => {
    for (let guard = 0; guard < 50; guard++) {
      const v = game.view();
      const opts = v.upgrades.filter((u) => u.unlocked && !u.maxed);
      if (prefer) {
        const pref = opts.find((u) => prefer.includes(u.id));
        if (pref) {
          const c1 = pref.currency === 'essence' ? v.essence : v.samples;
          const cost = game.view().upgrades.find((u) => u.id === pref.id)!.cost;
          if (cost <= c1) {
            game.actions.buyUpgrade(pref.id, 1);
            continue;
          }
          // Explorer saves for its priority if it is close (< 60 s of production).
          if (pref.currency === 'essence' && cost - c1 < v.essencePerSec * 60) {
            // still allow sample purchases
            const s = opts.filter((u) => u.currency === 'samples' && u.cost <= v.samples).sort((a, b) => a.cost - b.cost)[0];
            if (s && game.actions.buyUpgrade(s.id, 1)) continue;
            return;
          }
        }
      }
      // Samples upgrades: buy whenever affordable.
      const samp = opts.filter((u) => u.currency === 'samples' && u.cost <= v.samples).sort((a, b) => a.cost - b.cost)[0];
      if (samp && game.actions.buyUpgrade(samp.id, 1)) continue;
      // Essence: the globally cheapest option (seeds included), bought when affordable.
      const ess = opts.filter((u) => u.currency === 'essence').sort((a, b) => a.cost - b.cost);
      if (!ess.length) return;
      if (seedsCompete && !v.seedsGrowing && v.seedCost * 2.5 < ess[0].cost && freeSpot(2.5)) return; // a seed is cheaper (and can be sown now): keep the money
      if (ess[0].cost > v.essence) return;
      if (!game.actions.buyUpgrade(ess[0].id, 1)) return;
    }
  };

  for (let i = 0; i < steps; i++) {
    t += DT;
    const rep = dish.step(DT, game.speed);
    game.tick(DT, { step: i, creatures: rep.creatures, events: rep.events, totalMass: 0, fill: 0.05 });
    const v = game.view();

    if (r.firstStable === null && rep.creatures.some((c) => c.state === 'stable')) r.firstStable = t;
    if (v.extinction.available && r.extAvailable === null) r.extAvailable = t;

    // Purchase-within-2-min rule (only once something produces), on a 1-min smoothed production.
    epsEma += (v.essencePerSec / (v.multipliers?.buffs ?? 1) - epsEma) * (DT / 60);
    if (v.essencePerSec > 0) {
      prodTime += DT;
      const cheapest = v.upgrades
        .filter((u) => u.unlocked && !u.maxed && u.currency === 'essence')
        .reduce((m, u) => Math.min(m, u.cost), Infinity);
      const ok = cheapest <= v.essence + 120 * Math.max(epsEma, v.essencePerSec);
      if (!ok) {
        wallTime += DT;
        if (wallStart === null) wallStart = t;
        r.maxWall = Math.max(r.maxWall, t - wallStart);
      } else wallStart = null;
    }

    // Idle plays a 30 s session every 5 minutes, otherwise only (sometimes) taps the golden spark.
    const inSession = policy !== 'idle' || t < sessionEnd;
    if (policy === 'idle' && t >= nextCheckIn) {
      sessionEnd = t + 30;
      nextCheckIn = t + 300;
    }
    const active = inSession;
    // Golden spark.
    if (v.golden && rng() < (policy === 'idle' ? 0.04 : 0.3)) {
      game.actions.collectGolden();
      r.goldens++;
    }
    // Look at new species.
    if (active) while (newSpecies.length) game.actions.markSpeciesSeen(newSpecies.shift()!);

    // Seeding.
    const alive = rep.creatures.filter((c) => c.state === 'stable' || c.state === 'born').length;
    if (policy === 'idle' && !inSession) {
      if (alive === 0 && t - lastManualSeed > 30 && v.canSeed) {
        const spot = freeSpot(2.5);
        const spec = spot ? game.actions.seedAt(spot.x, spot.y) : null;
        if (spec) {
          dish.addSeed(spec);
          lastManualSeed = t;
        }
      }
    } else if (t - lastManualSeed >= 1.5 && v.canSeed) {
      // A seed is one more purchase: take it when it is the cheapest essence option.
      const cheapestUpgrade = v.upgrades
        .filter((u) => u.unlocked && !u.maxed && u.currency === 'essence')
        .reduce((m, u) => Math.min(m, u.cost), Infinity);
      const free = (v.charges?.free ?? 0) > 0 || v.pipette.progress >= 1;
      // Expected cost per creature ≈ 2.5 seeds: only seed when that beats the cheapest upgrade.
      const spot = free || v.seedCost * 2.5 <= cheapestUpgrade || alive === 0 ? freeSpot(2.5) : null;
      if (spot) {
        const spec = game.actions.seedAt(spot.x, spot.y);
        if (spec) {
          dish.addSeed(spec);
          lastManualSeed = t;
        }
      }
    }

    // Purchases.
    if (policy === 'greedy') buyCheapest(undefined, true);
    else if (policy === 'explorer') buyCheapest(['calibrator'], true);
    else if (inSession) buyCheapest(level0(game, 'autoSeeder') ? ['autoSeeder'] : undefined, true);

    // Explorer: move calibration every 2 min towards undiscovered species; print to repopulate.
    // Explorer: if a move left the dish barren for 60 s, go back to the last good regime.
    if (policy === 'explorer' && goodCalib && t - lastCalib > 60 && t - lastCalib < 61 && v.essencePerSec < goodEps * 0.3) {
      game.actions.setCalibration(goodCalib);
    }
    if (policy === 'explorer' && v.calibration.muRange && t - lastCalib >= 120) {
      lastCalib = t;
      const cal = v.calibration;
      if (!goodCalib || v.essencePerSec >= goodEps * 0.6) {
        goodCalib = { mu: cal.mu, sigma: cal.sigma };
        goodEps = v.essencePerSec / (v.multipliers?.buffs ?? 1);
      }
      const known = new Set(game.state.species.map((s) => s.catalogCode));
      const inRange = (m: SpeciesModel) =>
        ringsEq(m.rings, cal.rings ?? [1]) &&
        m.mu >= cal.muRange![0] &&
        m.mu <= cal.muRange![1] &&
        (!cal.sigmaRange || (m.sigma >= cal.sigmaRange[0] && m.sigma <= cal.sigmaRange[1]));
      const targets = CATALOG_MODELS.filter((m) => inRange(m) && !known.has(m.code));
      // Half of the moves aim at a species the player has heard of, half wander the unlocked range.
      const pick = targets.length && rng() < 0.5 ? targets[Math.floor(rng() * targets.length)] : null;
      const gauss = () => (rng() + rng() + rng() - 1.5) / 1.5;
      if (pick) game.actions.setCalibration({ mu: pick.mu + gauss() * 0.006, sigma: cal.sigmaRange ? pick.sigma + gauss() * 0.0015 : undefined });
      else {
        const [m0, m1] = cal.muRange!;
        const sr = cal.sigmaRange;
        game.actions.setCalibration({ mu: m0 + rng() * (m1 - m0), sigma: sr ? sr[0] + rng() * (sr[1] - sr[0]) : undefined });
      }
    }
    if (policy === 'explorer' && alive < 2 && v.samples >= 4) {
      const p = game.simParams;
      const sp = game.state.species.find((s) => {
        const m = CATALOG_MODELS.find((x) => x.code === s.catalogCode);
        return m && paramDistance(m.mu, m.sigma, p.mu, p.sigma) <= VIABLE_D && ringsEq(m.rings, p.rings);
      });
      const spot = freeSpot(2.5);
      if (sp && spot) {
        const spec = game.actions.printAt(sp.id, spot.x, spot.y);
        if (spec) dish.addSeed(spec, CATALOG_MODELS.find((x) => x.code === sp.catalogCode));
      }
    }

    // Extinction.
    if (v.extinction.available) {
      if (extAvailAt === null) extAvailAt = t;
      const ready =
        policy === 'idle' ? inSession : v.extinction.gainIn10Min - v.extinction.genomeGain <= 1 || t - extAvailAt > 600;
      if (ready && game.actions.extinguish()) {
        if (r.firstExtinction === null) {
          r.firstExtinction = t;
          r.firstGenome = game.view().genome;
        }
        extAvailAt = null;
        // Spend Genome: cheapest available node first.
        for (;;) {
          const node = game
            .view()
            .genomeNodes.filter((n) => n.affordable)
            .sort((a, b) => a.cost - b.cost)[0];
          if (!node || !game.actions.buyGenomeNode(node.id)) break;
        }
      }
    }


    if (verbose && Math.abs(t % 30) < DT / 2) {
      const st = rep.creatures.filter((c) => c.state === 'stable');
      log(
        `· eps ${v.essencePerSec.toFixed(1)} E ${v.essence.toFixed(0)} stable ${st.length} species ${v.species.length} ` +
          `M ${v.multipliers!.global.toFixed(2)} buff ${v.multipliers!.buffs} seed ${v.seedCost.toFixed(1)} ` +
          `beh ${v.behaviorsSeen.join(',')} perC ${st.map((c) => (v.creatures.find((x) => x.id === c.id)?.eps ?? 0).toFixed(1)).join(' ')}`,
      );
    }
    while (cp < CHECKPOINTS.length && t >= CHECKPOINTS[cp] * 60) {
      r.species[CHECKPOINTS[cp]] = game.state.species.length;
      r.eps[CHECKPOINTS[cp]] = v.essencePerSec / (v.multipliers?.buffs ?? 1);
      cp++;
    }
  }
  r.eraEssence120 = game.state.eraEssence;
  r.totalEssence = game.state.stats.totalEssence;
  r.wallFraction = prodTime > 0 ? wallTime / prodTime : 0;
  return r;
}

// ───────────────────────────── report ──────────────────────────────

declare const process: { argv: string[] }; // no @types/node in this repo

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const verbose = process.argv.includes('--verbose');
const minutes = Number(args[0] ?? 120);
const runs = Number(args[1] ?? 3);

const fmtT = (s: number | null) => (s === null ? '—' : s < 600 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${(s / 60).toFixed(0)}m`);
const med = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (v.length < xs.length / 2) return null;
  return v.length ? v[Math.floor(v.length / 2)] : null;
};
const fmtN = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(0)}K` : n.toFixed(n < 10 ? 1 : 0));

const rows: string[][] = [];
const header = [
  'policy',
  'first stable',
  'Sembrador',
  'Calibrador',
  'Ext. avail.',
  '1st Ext.',
  'Genome',
  'sp@30/60/120',
  'eps@3/8/15/30/60/90',
  'E total',
  'max wall',
  'wall %',
  'era lengths',
];
for (const policy of ['greedy', 'explorer', 'idle'] as PolicyName[]) {
  const res: RunResult[] = [];
  for (let k = 0; k < runs; k++) res.push(runPolicy(policy, minutes, 1000 + k * 17, verbose && k === 0));
  if (verbose) console.log(`\n── ${policy} (run 1) ──\n` + res[0].log.join('\n'));
  const m = (f: (r: RunResult) => number | null) => med(res.map(f));
  rows.push([
    policy,
    fmtT(m((r) => r.firstStable)),
    fmtT(m((r) => r.sembrador)),
    fmtT(m((r) => r.calibrador)),
    fmtT(m((r) => r.extAvailable)),
    fmtT(m((r) => r.firstExtinction)),
    String(m((r) => (r.firstExtinction ? r.firstGenome : null)) ?? '—'),
    [30, 60, 120].map((c) => m((r) => r.species[c] ?? null) ?? '—').join('/'),
    [3, 8, 15, 30, 60, 90].map((c) => { const x = m((r) => r.eps[c] ?? null); return x === null ? '—' : fmtN(x); }).join('/'),
    fmtN(m((r) => r.totalEssence) ?? 0),
    `${(m((r) => r.maxWall) ?? 0).toFixed(0)}s`,
    `${((m((r) => r.wallFraction) ?? 0) * 100).toFixed(1)}%`,
    res[0].eras.map((e, i) => `${((e - (res[0].eras[i - 1] ?? 0)) / 60).toFixed(0)}m`).join(' '),
  ]);
}
const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const line = (cells: string[]) => '| ' + cells.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |';
console.log(`\nBioluma balance bot — ${minutes} simulated min, median of ${runs} runs\n`);
console.log(line(header));
console.log('|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|');
for (const r of rows) console.log(line(r));
console.log('\nTargets: first stable < 3 min · Sembrador ~5–8 min · Extinction available 45–90 min (greedy) · purchase within 2 min of production (wall ≈ 0).');
