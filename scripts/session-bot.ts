/**
 * Session bot (docs/CICLO.md §11): plays the session + research-tree loop end to end and reports the
 * pacing, session by session. The dish is the statistical model of scripts/balance-bot.ts (copied:
 * that script runs its report on import) with two changes for the tree: a random seed takes with the
 * MEASURED probability of the Gotero/Estabilizador levels (cycleBalance SEED_SUCCESS), and its
 * species is drawn from the world being played (src/game/worlds.ts), new forms first. The economy
 * inside a session is the REAL game (createGame), with the tree's effects mapped onto today's game
 * knobs until Phase 2 wires the tree into game.ts (see `applyTree` — every approximation is listed).
 *
 *   npx vite-node scripts/session-bot.ts [maxSessions=40] [runs=3] [--verbose] [--policy=planner]
 *
 * Policies: planner (sensible priorities, picks the world with species left to find), greedy
 * (cheapest node first, newest world), kid (taps a lot, buys at random, random world, catches fewer
 * Sparks). A run stops when the story's final question would be asked (night 7 ready) or at
 * maxSessions.
 */
import { Bus, type GameEvents } from '../src/core/bus';
import type { Behavior, Creature, DetectorEvent, LeniaParams, SeedSpec } from '../src/core/types';
import * as GB from '../src/game/balance';
import * as C from '../src/game/cycleBalance';
import { createGame, type CatalogSignature, type Game } from '../src/game/game';
import {
  applySummary,
  beginSession,
  freshResearch,
  noteBehavior,
  noteBest,
  noteEncargo,
  noteEssence,
  noteGolden,
  noteKeep,
  noteProduction,
  noteSeed,
  noteSpecies,
  pityDue,
  researchBuy,
  researchPickWorld,
  sessionProdMult,
  summarize,
  tickSession,
  treeCtxOf,
  unlockedWorlds,
  type ResearchState,
  type SessionState,
} from '../src/game/session';
import type { GameState } from '../src/game/state';
import { seededRng } from '../src/game/testUtil';
import { BRANCHES, TREE_BY_ID, TREE_NODES, nightInfo, seedSuccess, treeEffects, treeStates, type TreeEffects } from '../src/game/tree';
import { WORLD_BY_ID, worldSpeciesGroups, type WorldDef, type WorldId } from '../src/game/worlds';
import { catalogGroup } from '../src/species/identity';
import { CATALOG } from '../src/sim/catalog';
import { SIG_SCALES } from '../src/detect/signature';
import catalogSigJson from '../src/detect/catalogSignatures.json';

// ───────────────────────────── dish model (from balance-bot.ts) ─────

const STEPS_PER_SEC = 30;
/** --trace=N prints session N every 15 s. */
let TRACE = -1;
const DT = 0.5;
const BORN_STEPS = 400;
const CLASSIFY_STEPS = 1000;
const BASE_HAZARD = 1 / 2400;
/**
 * Crowded movers die sooner. balance-bot.ts uses 1/600 (CPU audit); here 1/90 s, closer to QA3 F5's
 * measured early play (median Orbium life ≈ 27 s when 3–5 swimmers share the dish), so the first
 * sessions are not 2–3× too rich.
 */
const MOVER_HAZARD = 1 / 90;
const MOVER_CROWD = 3;
const SWIM_SPEED = 0.8;
const COLLIDE_R = 1.5;
const COLLIDE_KILL = 0.6;
const DIVIDE_EVERY = 1500;
const GRID = { w: 192, h: 240 };
/** Seconds the player spends on the summary + the tree between two sessions (pacing clock). */
const OVERHEAD_SECONDS = 45;
/**
 * Room on the round dish (src/core/dish.ts grows it with the Placa): living creatures that fit at
 * dish level L = POP_BASE + POP_PER_LEVEL·L (+ Más sitio). The statistical dish has no geometry,
 * so without this cap it packs 30+ creatures, far more than the real dish (QA3: 6–8 at minute 20).
 */
const POP_BASE = 7;
const POP_PER_LEVEL = 2;

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
function sigFor(key: string): number[] {
  const real = REAL_SIGS.find((e) => e.code === key);
  if (real) return real.signature.map((v) => (v >= 0 ? v : 0));
  const r = hashRng('sig:' + key);
  const base = REAL_SIGS.length ? REAL_SIGS[Math.floor(r() * REAL_SIGS.length)].signature : new Array(SIG_LEN).fill(0.5);
  return base.map((v, i) => Math.max(0, (v >= 0 ? v : 0) + (r() * 2 - 1) * 6 * scale(i)));
}
/** Behaviour and complexity as the detector measured them on the catalog (catalogSignatures.json). */
const CATALOG_MODELS: SpeciesModel[] = CATALOG.map((e) => {
  const [behavior0, complexity0, robust] = TRAITS[e.code] ?? ['still', 1, 0];
  const real = REAL_SIGS.find((x) => x.code === e.code) as (CatalogSignature & { behavior?: Behavior; complexity?: number }) | undefined;
  const behavior = real?.behavior ?? behavior0;
  const complexity = real?.complexity && real.complexity > 0 ? real.complexity : complexity0;
  return { code: e.code, mu: e.m, sigma: e.s, rings: e.b, behavior, complexity, robust, sig: sigFor(e.code) };
});
const BOT_CATALOG_SIGS: CatalogSignature[] = REAL_SIGS.length
  ? REAL_SIGS
  : CATALOG.map((e) => ({ code: e.code, name: e.name, signature: sigFor(e.code), mu: e.m, sigma: e.s, R: e.R }));
function wrapDist(ax: number, ay: number, bx: number, by: number): number {
  let dx = Math.abs(ax - bx) % GRID.w;
  let dy = Math.abs(ay - by) % GRID.h;
  if (dx > GRID.w / 2) dx = GRID.w - dx;
  if (dy > GRID.h / 2) dy = GRID.h - dy;
  return Math.hypot(dx, dy);
}

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

/** What the dish asks the session about: measured seed success, the world's species, maturity. */
interface DishHooks {
  /** Share of random seeds that take (tree.ts seedSuccess). */
  success(): number;
  /** Species the current world grows. */
  pool(): SpeciesModel[];
  /** Catalog groups already in the Bestiary (new forms are SPORE_NOVELTY× likelier). */
  known(): Set<string>;
  /** Esporas curiosas: new forms even likelier. */
  rare(): boolean;
  /** Incubadora: seeds become creatures this many times faster. */
  mature(): number;
}

class Dish {
  blobs: Blob[] = [];
  /** Creatures (forming or stable) that physically fit on the dish; a seed beyond it fails. */
  cap = Infinity;
  private nextId = 1;
  events: DetectorEvent[] = [];
  constructor(
    private rng: () => number,
    private params: () => LeniaParams,
    private hooks: DishHooks,
  ) {}
  addSeed(spec: SeedSpec, printed?: SpeciesModel | null): void {
    const p = this.params();
    const R = p.R;
    let fate: Blob['fate'] = 'die';
    let species: SpeciesModel | null = null;
    const hit = this.blobs.find((b) => b.state !== 'dead' && wrapDist(b.x, b.y, spec.x, spec.y) < 1.2 * R);
    const crowd = this.blobs.filter((b) => b.state === 'born' || b.state === 'stable').length >= this.cap;
    const pool = this.hooks.pool();
    if (crowd) {
      fate = 'die';
    } else if (hit) {
      if (this.rng() < 0.3) this.kill(hit, 'died');
    } else if (printed !== undefined) {
      species = printed;
      fate = printed && pool.includes(printed) ? (this.rng() < 0.95 ? 'stable' : 'die') : 'die';
    } else {
      const sure = spec.shape === 'pattern' && (spec.bias ?? 0) >= 1;
      if (pool.length && this.rng() < (sure ? 1 : this.hooks.success())) {
        fate = 'stable';
        const known = this.hooks.known();
        const w = pool.map((m) => (known.has(catalogGroup(m.code)) ? 1 : GB.SPORE_NOVELTY * (this.hooks.rare() ? 2 : 1)));
        let r = this.rng() * w.reduce((a, x) => a + x, 0);
        species = pool[pool.length - 1];
        for (let i = 0; i < pool.length; i++) if ((r -= w[i]) < 0) {
          species = pool[i];
          break;
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
      sigNoise: Array.from({ length: SIG_LEN }, () => (this.rng() * 2 - 1) * 0.2 * scale(0)),
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
      if (b.state === 'born' && b.steps >= BORN_STEPS / this.hooks.mature()) {
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
          const room = this.blobs.filter((o) => o.state === 'born' || o.state === 'stable').length < this.cap;
          if (room && !this.blobs.some((o) => o !== b && o.state !== 'dead' && wrapDist(o.x, o.y, cx, cy) < 1.6 * R)) {
            const child: Blob = { ...b, id: this.nextId++, x: cx, y: cy, steps: 0, state: 'born', behavior: null, fate: 'stable', divideAt: DIVIDE_EVERY, sigNoise: b.sigNoise.map(() => (this.rng() * 2 - 1) * 0.2 * scale(0)) };
            this.blobs.push(child);
            this.events.push({ type: 'divided', parentId: b.id, childIds: [child.id], x: b.x, y: b.y });
          }
        }
      }
    }
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
      signature: b.species ? b.species.sig.map((v, i) => Math.max(0, v + (b.sigNoise[i] ?? 0))) : new Array(SIG_LEN).fill(0.05),
      parentId: null,
    }));
    const events = this.events;
    this.events = [];
    return { creatures, events };
  }
}

// ───────────────────────────── tree → today's game knobs ───────────

const MODEL_BY_CODE = new Map(CATALOG_MODELS.map((m) => [m.code, m]));
const worldPool = (w: WorldId): SpeciesModel[] => WORLD_BY_ID[w].species.map((c) => MODEL_BY_CODE.get(c)!).filter(Boolean);

/**
 * Until Phase 2 wires the tree into game.ts, the bot maps TreeEffects onto the current game state
 * at the start of each session. Exact: start Esencia, free seeds, seed success (the measured table,
 * in the dish model), the world's rules (fixed preset through setRings/setCalibration with every
 * range open), Incubadora (seeds mature faster in the dish model), dish room (cap), production
 * multiplier (setBonus), sprint and Ecosistema (setBonus while they apply), Spark interval (rescaled
 * timer), first Spark, symbiosis. Approximated: Sembrador interval (nearest old level), affinities /
 * Nutriente / Catalogación (nearest old level). Not modelled (conservative: the real game will do a
 * bit better): Guardería, Sin apretujones, Gotas baratas, Spark life and gift size, Mutágeno.
 */
function applyTree(game: Game, fx: TreeEffects, world: WorldDef, first: boolean): void {
  const st = game.state as GameState;
  const nearest = (x: number) => Math.max(0, Math.round(x));
  st.upgrades = {
    calibrator: 4, // every range open: the bot sets the world's preset, the player never sees a knob
    dish: Math.min(4, fx.dishLevel),
    autoSeeder: fx.autoSeeder ? 1 + nearest(Math.log(fx.autoSeedInterval / GB.AUTOSEED_INTERVAL) / Math.log(GB.AUTOSEED_DECAY)) : 0,
    swimAffinity: nearest(fx.affinity.swim / GB.AFFINITY_BONUS),
    sessileAffinity: nearest(fx.affinity.still / GB.AFFINITY_BONUS),
    colonyAffinity: nearest(fx.affinity.colony / GB.AFFINITY_BONUS),
    nutrient: nearest((fx.complexityMult - 1) / GB.NUTRIENT_BONUS),
    cataloguing: nearest(fx.cataloguing / GB.CATALOGUING_BONUS),
  };
  for (const id of Object.keys(st.upgrades)) if (!st.unlocked.includes(id)) st.unlocked.push(id);
  st.nodes = ['doubleRings', 'tripleRings', ...(fx.symbiosis ? ['symbiosis'] : [])];
  st.essence = fx.startEssence;
  st.charges = { free: fx.freeSeeds + (first ? GB.START_FREE_SEEDS - C.SESSION_BASE_FREE_SEEDS : 0), guaranteed: first ? GB.START_GUARANTEED_SEEDS : 0 };
  st.buffs = [];
  st.eraTime = 0;
  st.eraHadStable = false;
  st.eraStablePeak = 0;
  st.goldenTimer = fx.goldenFirstDelay ? (fx.goldenFirstDelay[0] + fx.goldenFirstDelay[1]) / 2 : -1;
  st.autoSeedTimer = 0;
  st.samples = 99; // copies: the bot pays them in Esencia itself (PRINT_SEEDS_PRICE)
  game.actions.setRings!(world.params.rings);
  game.actions.setCalibration({ mu: world.params.mu, sigma: world.params.sigma, R: world.params.R, dt: world.params.dt });
  game.setBonus('tree', { es: 'Árbol', en: 'Tree' }, fx.prodMult);
  game.setBonus('world', { es: 'Mundo', en: 'World' }, world.essenceMult ?? 1);
}

// ───────────────────────────── policies ────────────────────────────

type PolicyName = 'planner' | 'greedy' | 'kid';

/** The planner's order of interest (it buys the first affordable one, else saves for it if close). */
const PLAN = [
  // Night 1 (rings 1–2): time first (everything scales with it), then the cheap multipliers.
  'clock', 'clock', 'culture', 'clock', 'dropper', 'worldCold', 'dish', 'culture', 'clock2', 'notebook', 'spark', 'dropper',
  'clock2', 'culture', 'fridge', 'startEssence', 'worldGyro', 'dish', 'nutrient', 'culture', 'dropper', 'slots', 'fridge',
  'nutrient', 'startEssence', 'print', 'sparkLife', 'sparkTime', 'dish', 'slots', 'nutrient', 'notebook', 'startEssence', 'fridge',
  // Night 2 (ring 3)
  'lab', 'culture2', 'sprint', 'autoSeeder', 'incubator', 'freeSeeds', 'stabilizer', 'worldShields', 'swimAffinity', 'culture2',
  'cataloguing', 'worldHelix', 'stillAffinity', 'sprint', 'autoSeeder', 'stabilizer', 'culture2', 'encTime', 'cataloguing',
  'crowdCost', 'nursery', 'bigSeed', 'incubator', 'sparkGift', 'sparkDatos', 'sparkFirst', 'archive', 'microscope', 'swimAffinity',
  'stillAffinity', 'freeSeeds', 'startEssence', 'sprint', 'autoSeeder', 'stabilizer', 'cataloguing', 'encTime', 'notebook',
  // Night 3 (ring 4)
  'clock3', 'abundance', 'clock3', 'worldLegs', 'ecosystem', 'colonyAffinity', 'symbiosis', 'dishXL', 'cheapSeeds', 'discoBonus', 'rareSpores',
  'clock3', 'mutations', 'sparkMutagen', 'ecosystem', 'colonyAffinity', 'cheapSeeds', 'discoBonus',
  // Night 4 (ring 5)
  'clock4', 'clock4', 'eternalLife', 'worldGiants', 'dropperMax', 'encyclopedia', 'clock4', 'encyclopedia', 'clock4', 'encyclopedia',
];

/** Which world the start card ends up on. */
function pickWorld(policy: PolicyName, r: ResearchState, known: Set<string>, rng: () => number): WorldId {
  const open = unlockedWorlds(r);
  if (policy === 'kid') return rng() < 0.5 ? open[Math.floor(rng() * open.length)] : r.world;
  // Planner and greedy keep the start card's pick: the newest world (its creatures pay the most,
  // worlds.ts order). The planner goes back to an older world only for a last session when the
  // newest has nothing left to find and an older one does (it pays less, so never twice in a row).
  const newest = open[open.length - 1];
  if (policy === 'greedy') return newest;
  void known;
  void worldSpeciesGroups;
  return newest;
}

interface SessionRow {
  n: number;
  seconds: number;
  essence: number;
  datos: number;
  bank: number;
  nodes: number;
  levels: number;
  branches: number;
  species: number;
  night: number;
  minutes: number;
  world: WorldId;
  /** Nodes affordable when the session ended (before buying). */
  canBuy: number;
  /** Sparks caught this session (the biggest source of luck). */
  goldens: number;
  /** Esencia without the Spark buffs (the luck taken out): the structural curve. */
  base: number;
  bought: string[];
}

interface RunResult {
  policy: PolicyName;
  rows: SessionRow[];
  endedAt: number | null; // minutes when the final question would be asked
  endedSession: number | null;
  minDatos: number;
  firstStable: number | null;
}

/** The final question of the story: Act III ends when this night is ready. */
const FINAL_NIGHT = 7;

function runPolicy(policy: PolicyName, maxSessions: number, seed: number): RunResult {
  const rng = seededRng(seed);
  const bus = new Bus<GameEvents>();
  let t = 0;
  const game: Game = createGame({ bus, rng: seededRng(seed * 7 + 1), now: () => t * 1000, catalogSignatures: BOT_CATALOG_SIGS, grid: GRID });
  let research: ResearchState = freshResearch();
  let fx: TreeEffects = treeEffects(research.levels);
  const known = () => new Set(game.state.species.map((s) => catalogGroup(s.catalogCode ?? '')).filter(Boolean));
  const dish = new Dish(rng, () => game.simParams, {
    success: () => seedSuccess(fx),
    pool: () => worldPool(session?.world ?? 'classic'),
    known,
    rare: () => fx.rareSpores,
    mature: () => fx.matureSpeed,
  });
  bus.on('dishSeed', ({ specs }) => specs.forEach((s) => dish.addSeed(s)));
  bus.on('dishClear', () => dish.clear());

  let session: SessionState | null = null;
  const newSpecies: string[] = [];
  let firstStable: number | null = null;
  bus.on('speciesNew', ({ speciesId }) => {
    newSpecies.push(speciesId);
    if (session) noteSpecies(session, fx, speciesId, true);
  });
  bus.on('behaviorNew', ({ behavior }) => session && noteBehavior(session, behavior, true));
  bus.on('goldenCollected', () => {
    if (session) noteGolden(session, fx);
    (game.state as GameState).goldenTimer *= fx.goldenIntervalMult;
  });
  bus.on('goldenMissed', () => void ((game.state as GameState).goldenTimer *= fx.goldenIntervalMult));

  const rows: RunResult['rows'] = [];
  let endedAt: number | null = null;
  let endedSession: number | null = null;
  let minDatos = Infinity;
  let clockMinutes = 0;

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

  for (let n = 1; n <= maxSessions; n++) {
    research = researchPickWorld(research, pickWorld(policy, research, known(), rng));
    fx = treeEffects(research.levels);
    const b = beginSession(research, fx);
    research = b.research;
    session = b.session;
    game.actions.sterilizeDish!();
    applyTree(game, fx, WORLD_BY_ID[session.world], n === 1);
    dish.cap = POP_BASE + POP_PER_LEVEL * fx.dishLevel + fx.extraSlots;
    // Nevera: the kept species that live in this world come back alive; the other slots get pure
    // seeds of this world's species (session.ts SessionStart.fridgeSlots).
    const pool = worldPool(session.world);
    const planted: SpeciesModel[] = [];
    for (const id of b.start.fridge) {
      const sp = game.state.species.find((x) => x.id === id);
      const m = sp?.catalogCode ? MODEL_BY_CODE.get(sp.catalogCode) : undefined;
      if (m && pool.includes(m) && planted.length < b.start.fridgeSlots) planted.push(m);
    }
    for (let i = 0; planted.length < b.start.fridgeSlots && pool.length; i++) planted.push(pool[i % pool.length]);
    for (const m of planted) {
      const spot = freeSpot(2.5);
      if (!spot) break;
      dish.addSeed({ x: spot.x, y: spot.y, radius: 10, density: 1, noise: 0, shape: 'pattern', bias: 1 }, m);
      noteSeed(session);
    }
    let lastSeed = -99;
    let lastEssenceTotal = game.state.stats.totalEssence;
    let base = 0;
    let lastObjective = game.state.objective;
    let pityGiven = false;
    let st = 0; // seconds into the session (wall)
    const seenSpecies = new Set<string>();
    while (session.phase !== 'over' && st < 3600) {
      st += DT;
      t += DT;
      const rep = dish.step(DT, game.speed);
      // Session-made multipliers (Sprint final, Ecosistema) as outside bonuses.
      game.setBonus('sprint', { es: 'Sprint', en: 'Sprint' }, sessionProdMult(session, fx));
      game.tick(DT, { step: Math.round(t * 30), creatures: rep.creatures, events: rep.events, totalMass: 0, fill: 0.05 });
      const v = game.view();
      const alive = new Set(v.creatures.filter((c) => c.state === 'stable' && c.speciesId).map((c) => c.speciesId!));
      game.setBonus('eco', { es: 'Ecosistema', en: 'Ecosystem' }, 1 + fx.ecosystem * alive.size);
      for (const id of alive) {
        if (!seenSpecies.has(id)) {
          seenSpecies.add(id);
          noteSpecies(session, fx, id, false);
        }
      }
      const stableN = rep.creatures.filter((c) => c.state === 'stable').length;
      if (firstStable === null && stableN > 0) firstStable = t;
      noteProduction(session, v.essencePerSec, stableN);
      for (const c of v.creatures) noteBest(session, c.speciesId, c.eps);
      const earned = game.state.stats.totalEssence - lastEssenceTotal;
      lastEssenceTotal = game.state.stats.totalEssence;
      noteEssence(session, earned);
      base += earned / Math.max(1, v.multipliers?.buffs ?? 1);
      while (lastObjective < game.state.objective) {
        lastObjective++;
        noteEncargo(session, fx);
      }
      if (!pityGiven && pityDue(session)) {
        pityGiven = true;
        (game.state as GameState).charges.guaranteed += 1;
      }
      tickSession(session, DT, fx);
      if (TRACE === n && Math.abs(st % 15) < DT / 2) {
        const m = v.multipliers;
        console.log(`  s${n} t=${st.toFixed(0)}s eps=${v.essencePerSec.toFixed(1)} E=${v.essence.toFixed(0)} earned=${session.essence.toFixed(0)} stable=${stableN} alive=${rep.creatures.length} seed=${v.seedCost.toFixed(1)} M=${m?.global.toFixed(2)} sp=${m?.species?.toFixed(2)} beh=${m?.behavior?.toFixed(2)} buffs=${m?.buffs}`);
      }
      // Spark.
      if (v.golden && rng() < (policy === 'kid' ? 0.12 : 0.3)) game.actions.collectGolden();
      while (newSpecies.length) game.actions.markSpeciesSeen(newSpecies.shift()!);
      // Seeding: Esencia only buys seeds during a session.
      const gap = policy === 'kid' ? 0.6 : 1.5;
      if (st - lastSeed >= gap && v.canSeed) {
        const spot = freeSpot(policy === 'kid' ? 1.2 : 2.5);
        const reserve = policy === 'kid' ? 0 : v.seedCost * 0.5;
        const free = (v.charges?.free ?? 0) > 0 || v.pipette.progress >= 1;
        if (spot && (free || v.essence - v.seedCost >= reserve)) {
          const spec = game.actions.seedAt(spot.x, spot.y);
          if (spec) {
            dish.addSeed(spec);
            lastSeed = st;
            noteSeed(session);
          }
        }
      }
      // Copies (Copiadora): when few creatures live, plant a known species of this world.
      if (fx.print && policy !== 'kid' && stableN < 2 && st - lastSeed >= gap) {
        const price = v.seedCost * C.PRINT_SEEDS_PRICE;
        const pool = worldPool(session.world);
        const sp = game.state.species.find((s) => {
          const m = s.catalogCode ? MODEL_BY_CODE.get(s.catalogCode) : undefined;
          return m && pool.includes(m);
        });
        const spot = freeSpot(2.5);
        if (sp && spot && v.essence >= price) {
          const spec = game.actions.printAt(sp.id, spot.x, spot.y);
          if (spec) {
            (game.state as GameState).essence -= price;
            dish.addSeed(spec, MODEL_BY_CODE.get(sp.catalogCode!));
            lastSeed = st;
            noteSeed(session);
          }
        }
      }
    }
    // Clock over: keep the best species for the Nevera, bank the Datos.
    const best = [...game.view().creatures].filter((c) => c.speciesId && c.eps > 0).sort((a, b) => b.eps - a.eps).map((c) => c.speciesId!);
    noteKeep(session, best);
    const sum = summarize(session, research, fx, game.state.species.length);
    research = applySummary(research, session, sum, fx);
    minDatos = Math.min(minDatos, sum.datos.total);
    clockMinutes += (session.elapsed + OVERHEAD_SECONDS) / 60;
    // Final question: the last night of Act III is ready.
    const species = game.state.species.length;
    const ni = nightInfo(treeCtxOf(research, species));
    if (endedAt === null && (ni.night >= FINAL_NIGHT || (ni.night === FINAL_NIGHT - 1 && ni.ready))) {
      endedAt = clockMinutes;
      endedSession = n;
    }
    // Tree visit.
    const bought: string[] = [];
    const canBuy = [...treeStates(treeCtxOf(research, species)).values()].filter((s) => s.affordable && s.id !== 'lab').length;
    for (let guard = 0; guard < 300; guard++) {
      const states = treeStates(treeCtxOf(research, species));
      const can = [...states.values()].filter((s) => s.affordable);
      if (!can.length) break;
      let pick: string | null = null;
      if (can.some((s) => s.id === 'lab')) pick = 'lab'; // nights are free: everybody takes them
      else if (policy === 'greedy') pick = can.sort((a, b) => a.cost - b.cost)[0].id;
      else if (policy === 'kid') pick = can[Math.floor(rng() * can.length)].id;
      else {
        // The plan in order; else the cheapest. Save for the planned one when it is close.
        const want = PLAN.find((id) => {
          const s = states.get(id);
          return s && !s.maxed && s.block !== 'locked' && s.block !== 'night' && s.block !== 'hidden';
        });
        const w = want ? states.get(want)! : null;
        if (w && w.affordable) pick = w.id;
        else if (w && w.missingDatos > 0 && w.missingDatos < (sum.datos.total || 1) * 1.2) pick = null;
        else pick = can.sort((a, b) => a.cost - b.cost)[0].id;
      }
      if (!pick) break;
      const r = researchBuy(research, pick, species);
      if (!r.result.ok) break;
      research = r.state;
      bought.push(pick);
    }
    const owned = TREE_NODES.filter((d) => d.id !== 'lab' && (research.levels[d.id] ?? 0) > 0);
    rows.push({
      n,
      seconds: session.elapsed,
      essence: session.essence,
      datos: sum.datos.total,
      bank: research.datos,
      nodes: owned.length,
      levels: owned.reduce((a, d) => a + (research.levels[d.id] ?? 0), 0),
      branches: BRANCHES.filter((br) => owned.some((d) => d.branch === br)).length,
      species,
      night: research.levels.lab ?? 1,
      minutes: clockMinutes,
      world: session.world,
      canBuy,
      goldens: session.goldens,
      base,
      bought,
    });
    if (endedAt !== null && n >= (endedSession ?? 0) + 2) break;
  }
  return { policy, rows, endedAt, endedSession, minDatos, firstStable };
}

// ───────────────────────────── report ──────────────────────────────

declare const process: { argv: string[]; exitCode?: number };

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const verbose = process.argv.includes('--verbose');
const only = process.argv.find((a) => a.startsWith('--policy='))?.slice(9) as PolicyName | undefined;
const maxSessions = Number(args[0] ?? 40);
const runs = Number(args[1] ?? 3);
const TRACE_ARG = process.argv.find((a) => a.startsWith('--trace='));
if (TRACE_ARG) TRACE = Number(TRACE_ARG.slice(8));
const policies: PolicyName[] = only ? [only] : ['planner', 'greedy', 'kid'];

const fmtN = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(0));
const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const med = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : NaN;
};

const checks: string[] = [];
const treeTotal = TREE_NODES.filter((n) => n.id !== 'lab').length;
console.log(`\nBioluma session bot — up to ${maxSessions} sessions, ${runs} run(s) per policy, overhead ${OVERHEAD_SECONDS} s/session`);
console.log(`Tree: ${treeTotal} buyable nodes on 7 straight routes (+ the centre); 1 Dato per ${C.DATOS_ESSENCE_DIV} Esencia.\n`);
for (const policy of policies) {
  const res: RunResult[] = [];
  for (let k = 0; k < runs; k++) res.push(runPolicy(policy, maxSessions, 1000 + k * 17));
  const r0 = res[0];
  // Median per session over the runs (the table the plan page shows).
  const N = Math.min(...res.map((r) => r.rows.length));
  console.log(`── ${policy}: median of ${runs} run(s) per session ──`);
  console.log('| #  | night | clock | Esencia | Datos | bank | nodes | routes | species | world   | can buy | total min | bought (run 1)');
  console.log('|----|-------|-------|---------|-------|------|-------|--------|---------|---------|---------|-----------|---------------');
  for (let i = 0; i < N; i++) {
    const at = (f: (r: SessionRow) => number) => med(res.map((r) => f(r.rows[i])));
    const row = r0.rows[i];
    console.log(
      `| ${String(i + 1).padStart(2)} | ${String(at((r) => r.night)).padStart(5)} | ${fmtClock(at((r) => r.seconds)).padStart(5)} | ${fmtN(at((r) => r.essence)).padStart(7)} | ${String(at((r) => r.datos)).padStart(5)} | ${String(at((r) => r.bank)).padStart(4)} | ${String(at((r) => r.nodes)).padStart(5)} | ${String(at((r) => r.branches)).padStart(6)} | ${String(at((r) => r.species)).padStart(7)} | ${row.world.padEnd(7)} | ${String(at((r) => r.canBuy)).padStart(7)} | ${at((r) => r.minutes).toFixed(0).padStart(9)} | ${verbose ? row.bought.join(' ') : row.bought.slice(0, 8).join(' ') + (row.bought.length > 8 ? ` +${row.bought.length - 8}` : '')}`,
    );
  }
  if (process.argv.includes('--runs')) {
    for (const r of res) console.log(`  run: ${r.rows.map((x) => `${fmtN(x.essence)}${x.goldens ? `(${x.goldens}✦)` : ''}`).join(' ')}`);
    for (const r of res) console.log(`  base: ${r.rows.map((x) => fmtN(x.base)).join(' ')}`);
  }
  const endM = med(res.map((r) => r.endedAt ?? Infinity));
  const endS = med(res.map((r) => r.endedSession ?? Infinity));
  const s1 = med(res.map((r) => r.rows[0]?.datos ?? 0));
  const s1e = med(res.map((r) => r.rows[0]?.essence ?? 0));
  const s1buys = med(res.map((r) => r.rows[0]?.bought.length ?? 0));
  const br12 = med(res.map((r) => r.rows[Math.min(11, r.rows.length - 1)]?.branches ?? 0));
  const minD = Math.min(...res.map((r) => r.minDatos));
  const fs = med(res.map((r) => r.firstStable ?? Infinity));
  const end = (r: RunResult) => (r.endedSession ?? r.rows.length);
  const buyable = res.flatMap((r) => r.rows.slice(0, end(r)));
  const pctBuy = (100 * buyable.filter((x) => x.canBuy > 0).length) / Math.max(1, buyable.length);
  // Dips: a session earning less Esencia than the previous one (median curve and every run).
  const medE = Array.from({ length: N }, (_, i) => med(res.map((r) => r.rows[i].essence)));
  const dipsMed = medE.slice(1).filter((e, i) => e < medE[i]).length;
  const dipsRun = res.map((r) => r.rows.slice(1, end(r)).filter((x, i) => x.essence < r.rows[i].essence).length);
  // The same without Spark luck (buff multipliers taken out): what the tree and the worlds do.
  const medB = Array.from({ length: N }, (_, i) => med(res.map((r) => r.rows[i].base)));
  const dipsBase = medB.slice(1).map((e, i) => (e < medB[i] ? `S${i + 2} ${((e / medB[i] - 1) * 100).toFixed(0)} %` : '')).filter(Boolean);
  const dipsList = medE.slice(1).map((e, i) => (e < medE[i] ? `S${i + 2} ${((e / medE[i] - 1) * 100).toFixed(0)} %` : '')).filter(Boolean);
  console.log(
    `\nmedian: first stable ${Number.isFinite(fs) ? fs.toFixed(0) + ' s' : '—'} · session 1: ${fmtN(s1e)} Esencia, ${s1} Datos, ${s1buys} buys · routes with a node by session 12: ${br12}/7 · min Datos/session ${minD} · can buy ≥ 1 node after ${pctBuy.toFixed(0)} % of sessions · Esencia dips: median curve ${dipsMed} [${dipsList.join(', ')}], per run ${dipsRun.join('/')}; without Spark luck ${dipsBase.length} [${dipsBase.join(', ')}] · story ending at session ${Number.isFinite(endS) ? endS : '—'} ≈ ${Number.isFinite(endM) ? (endM / 60).toFixed(2) + ' h' : '—'}\n`,
  );
  const tag = `[${policy}]`;
  const s1len = r0.rows[0].seconds;
  checks.push(`${tag} session 1 lasts 3:00: ${s1len >= C.SESSION_BASE_SECONDS - 1 && s1len <= C.SESSION_BASE_SECONDS + 30 ? 'OK' : 'FAIL'} (${fmtClock(s1len)})`);
  checks.push(`${tag} first tree visit buys ≥ 2 nodes: ${s1buys >= 2 ? 'OK' : 'FAIL'} (${s1buys})`);
  checks.push(`${tag} never a session below ${C.DATOS_MIN} Datos: ${minD >= C.DATOS_MIN ? 'OK' : 'FAIL'} (${minD})`);
  if (policy === 'planner') {
    checks.push(`${tag} session 1 ≈ 950 Esencia (700–1 300): ${s1e >= 700 && s1e <= 1300 ? 'OK' : 'FAIL'} (${fmtN(s1e)})`);
    checks.push(`${tag} ≥ 6 of 7 routes by session 12: ${br12 >= 6 ? 'OK' : 'FAIL'} (${br12})`);
    checks.push(`${tag} HARD: no session earns less Esencia than the previous one: ${dipsMed === 0 && dipsRun.every((d) => d === 0) ? 'OK' : 'FAIL'} (median ${dipsMed}, runs ${dipsRun.join('/')})`);
    const nightAt = (s: number) => med(res.map((r) => r.rows[Math.min(s - 1, r.rows.length - 1)].night));
    checks.push(`${tag} nights at S5/S9/S14 = 2/3/4: ${nightAt(5) === 2 && nightAt(9) === 3 && nightAt(14) === 4 ? 'OK' : 'FAIL'} (${nightAt(5)}/${nightAt(9)}/${nightAt(14)})`);
  }
  if (policy === 'kid') checks.push(`${tag} a kid still reaches night 3 by session 15: ${(r0.rows[Math.min(14, r0.rows.length - 1)]?.night ?? 1) >= 3 ? 'OK' : 'FAIL'} (night ${r0.rows[Math.min(14, r0.rows.length - 1)]?.night})`);
  if (policy !== 'kid') checks.push(`${tag} story ending in 3.5–5 h: ${endM >= 210 && endM <= 300 ? 'OK' : 'FAIL'} (${Number.isFinite(endM) ? (endM / 60).toFixed(2) + ' h' : 'not reached'})`);
}
console.log('Pacing targets (docs/CICLO.md §11):');
for (const c of checks) console.log('  ' + c);
void TREE_BY_ID;
