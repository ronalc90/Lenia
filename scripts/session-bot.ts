/**
 * Session bot (docs/RITMO.md §6, docs/CICLO.md §11): plays the INTEGRATED sessions cycle end to end
 * (createGame({ cycle: 'sessions' }): clock, wallet, seed price and room, Spark gift, Abono, research
 * tree, worlds, nights, Nevera — all the game's own code) and reports the pacing, session by session.
 * Only the dish is a model: the statistical dish of the retired classic-loop bot (scripts/balance-bot.ts, deleted in 2B; copied: that script ran
 * its report on import), where a random seed takes with the MEASURED probability of the
 * Gotero/Estabilizador levels (cycleBalance SEED_SUCCESS) and grows into the species of the template
 * the game chose for it (the world's species, new forms first).
 *
 *   npx vite-node scripts/session-bot.ts [maxSessions=40] [runs=3] [--verbose] [--policy=planner] [--trace=N] [--runs]
 *
 * Policies: planner (sensible priorities, fills the dish, then Abono), greedy (cheapest node first),
 * kid (taps a lot, buys at random, random world, catches fewer Sparks, rarely an Abono). A run stops
 * two sessions after the story's final question would be asked (night 7 ready) or at maxSessions.
 */
import { Bus, type GameEvents } from '../src/core/bus';
import type { Behavior, Creature, DetectorEvent, LeniaParams, Pattern, SeedSpec } from '../src/core/types';
import * as GB from '../src/game/balance';
import * as C from '../src/game/cycleBalance';
import { createGame, type CatalogSignature, type Game } from '../src/game/game';
import { rotateQuarter, scaledTemplate } from '../src/game/seeding';
import { treeCtxOf } from '../src/game/session';
import { seededRng } from '../src/game/testUtil';
import { BRANCHES, TREE_BY_ID, TREE_NODES, nightInfo, seedSuccess, treeStates } from '../src/game/tree';
import { WORLDS, WORLD_BY_ID, type WorldId } from '../src/game/worlds';
import { catalogGroup } from '../src/species/identity';
import { CATALOG, catalogByCode } from '../src/sim/catalog';
import { SIG_SCALES } from '../src/detect/signature';
import catalogSigJson from '../src/detect/catalogSignatures.json';

// ──────────────── dish model (from the retired balance-bot.ts) ────────

const STEPS_PER_SEC = C.SIM_STEPS_PER_SEC;
const EXT_LOG = process.argv.includes("--ext");
/** --trace=N prints session N every 15 s. */
let TRACE = -1;
const DT = 0.5;
const BORN_STEPS = C.STABLE_AGE_STEPS;
const CLASSIFY_STEPS = 1000;
const BASE_HAZARD = 1 / 2400;
/**
 * Crowded movers die sooner. the retired balance-bot.ts used 1/600 (CPU audit); here 1/90 s, closer to QA3 F5's
 * measured early play (median Orbium life ≈ 27 s when 3–5 swimmers share the dish), so the first
 * sessions are not 2–3× too rich.
 */
const MOVER_HAZARD = 1 / 90;
/**
 * Movers start bumping into each other above this share of the dish's room (3 of the base dish's 5).
 * A fixed 3 made "Placa más grande" a loss in the model: a dish of 9 died as fast as a dish of 5. [model]
 */
const MOVER_CROWD_SHARE = 0.6;
const SWIM_SPEED = 0.8;
const COLLIDE_R = 1.5;
const COLLIDE_KILL = 0.6;
const DIVIDE_EVERY = 1500;
const GRID = { w: 192, h: 240 };
/**
 * Seconds the player spends between two sessions (pacing clock): the "¡Tiempo!" stamp and the summary,
 * then a few seconds per node bought in the tree (docs/RITMO.md §6). A 15 s run is not followed by a
 * 45 s menu.
 */
const SUMMARY_SECONDS = 6;
const SECONDS_PER_BUY = 2.5;
const OVERHEAD_MAX = 45;
/** Hazards of the model are per simulation step (measured at 30 steps/s): the time-lapse scales them. */
const PER_STEP = 1 / STEPS_PER_SEC;

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
/**
 * How the detector reads each world species AT ITS WORLD'S PRESET (scripts/world-check.ts
 * --behaviors; at its own catalog point Parorbium, for one, splits, but in Remolinos it swims).
 */
const BEHAVIOR_IN_WORLD: Record<string, Behavior> = {
  O2u: 'swimmer', O2b: 'swimmer', O4i: 'swimmer', O2ui: 'swimmer', O4s: 'swimmer', O2p: 'swimmer', OG2g: 'spinner', O4d: 'swimmer',
  S1v: 'swimmer', S1s: 'swimmer', PG1a: 'swimmer', P4cp: 'swimmer', S2s: 'swimmer', PS3am: 'swimmer', C0v: 'still', S3s: 'swimmer',
  H3cp: 'spinner', P3sp: 'swimmer', '3GH2n': 'swimmer',
};
/** Behaviour (as measured in its world) and complexity (as the detector measured it on the catalog). */
const CATALOG_MODELS: SpeciesModel[] = CATALOG.map((e) => {
  const [behavior0, complexity0, robust] = TRAITS[e.code] ?? ['still', 1, 0];
  const real = REAL_SIGS.find((x) => x.code === e.code) as (CatalogSignature & { behavior?: Behavior; complexity?: number }) | undefined;
  const behavior = BEHAVIOR_IN_WORLD[e.code] ?? real?.behavior ?? behavior0;
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

/** What the dish asks the game about: measured seed success, the world's species, the templates. */
interface DishHooks {
  /** Share of random seeds that take (tree.ts seedSuccess). */
  success(): number;
  /** Species the current world grows. */
  pool(): SpeciesModel[];
  /** Catalog groups already in the Bestiary (new forms are SPORE_NOVELTY× likelier). */
  known(): Set<string>;
  /** Esporas curiosas: new forms even likelier. */
  rare(): boolean;
  /** The species whose template the game stamped (scaledTemplate patterns are cached objects). */
  speciesOf(p: Pattern | undefined): SpeciesModel | null;
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
  addSeed(spec: SeedSpec): void {
    const p = this.params();
    const R = p.R;
    let fate: Blob['fate'] = 'die';
    let species: SpeciesModel | null = null;
    const hit = this.blobs.find((b) => b.state !== 'dead' && wrapDist(b.x, b.y, spec.x, spec.y) < 1.2 * R);
    const crowd = this.blobs.filter((b) => b.state === 'born' || b.state === 'stable').length >= this.cap;
    const pool = this.hooks.pool();
    const tpl = this.hooks.speciesOf(spec.pattern);
    if (crowd) {
      fate = 'die';
    } else if (hit) {
      if (this.rng() < 0.3) this.kill(hit, 'died');
    } else {
      // A pure template (Nevera, sure seeds, copies) always takes; a random seed with the measured odds.
      const sure = spec.shape === 'pattern' && (spec.bias ?? 0) >= 1;
      if (pool.length && this.rng() < (sure ? 1 : this.hooks.success())) {
        fate = 'stable';
        if (tpl && pool.includes(tpl)) species = tpl;
        else {
          const known = this.hooks.known();
          const w = pool.map((m) => (known.has(catalogGroup(m.code)) ? 1 : GB.SPORE_NOVELTY * (this.hooks.rare() ? 2 : 1)));
          let r = this.rng() * w.reduce((a, x) => a + x, 0);
          species = pool[pool.length - 1];
          for (let i = 0; i < pool.length; i++) if ((r -= w[i]) < 0) {
            species = pool[i];
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
  /** Pre-incubation (ADR-027): the integrator runs the dish PREINCUBATE_STEPS under the start card. */
  preincubate(): void {
    for (const b of this.blobs) if (b.state === 'born' && b.fate === 'stable') {
      b.steps = Math.max(b.steps, C.PREINCUBATE_STEPS);
      b.state = 'stable';
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
      if (b.state === 'born' && b.steps >= BORN_STEPS) {
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
        const crowd = Math.max(3, Math.round(MOVER_CROWD_SHARE * (Number.isFinite(this.cap) ? this.cap - 2 : 5)));
        if (this.rng() < (BASE_HAZARD + (mover && movers >= crowd ? MOVER_HAZARD : 0)) * ds * PER_STEP) {
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
        if (wrapDist(a.x, a.y, c.x, c.y) < COLLIDE_R * R && this.rng() < COLLIDE_KILL * ds * PER_STEP) this.kill(this.rng() < 0.5 ? a : c, 'died');
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
      // The game registers a NEW species only after SPECIES_MIN_STABLE_STEPS stable steps (balance.ts).
      stableSteps: b.state === 'stable' ? Math.max(0, b.steps - BORN_STEPS) : 0,
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

// ───────────────────────────── the integrated game ─────────────────

const MODEL_BY_CODE = new Map(CATALOG_MODELS.map((m) => [m.code, m]));
const worldPool = (w: WorldId): SpeciesModel[] => WORLD_BY_ID[w].species.map((c) => MODEL_BY_CODE.get(c)!).filter(Boolean);
/** Template pattern → species: seeding.ts caches scaledTemplate per code and R, so the game's spec carries the same object. */
const TEMPLATE_SPECIES = new Map<Pattern, SpeciesModel>();
for (const w of WORLDS) {
  for (const code of w.species) {
    const e = catalogByCode(code);
    const m = MODEL_BY_CODE.get(code);
    if (!e || !m) continue;
    // Pure templates and thin worlds' seeds turn by quarter turns (rotateQuarter caches them per template).
    const tpl = scaledTemplate(e, w.params.R);
    for (let k = 0; k < 4; k++) TEMPLATE_SPECIES.set(rotateQuarter(tpl, k), m);
  }
}

// ───────────────────────────── policies ────────────────────────────

type PolicyName = 'planner' | 'greedy' | 'kid';

/** The planner's order of interest (it buys the first affordable one, else saves for it if close). */
const PLAN = [
  // A sensible player: what fills the dish fastest first (VELA points at the Gotero: CLARIDAD F-03),
  // a new world as soon as it opens (the start card picks it), Esencia and time; Datos-only and
  // comfort nodes last.
  // Night 1 (rings 1–2)
  // RITMO §5: the clock first — a longer run is the most visible "antes → después".
  'clock', 'dropper', 'clock', 'dish', 'culture', 'clock', 'worldCold', 'dropper', 'clock', 'culture', 'dish', 'culture', 'dropper',
  'clock2', 'worldGyro', 'culture', 'dish', 'clock2', 'culture', 'nutrient', 'slots', 'clock2', 'fridge', 'nutrient', 'slots', 'spark', 'startEssence',
  'nutrient', 'slots', 'fridge', 'notebook', 'fridge', 'print', 'sparkLife', 'sparkTime', 'startEssence', 'notebook',
  // Night 2 (ring 3)
  'lab', 'clock3', 'worldShields', 'clock3', 'worldHelix', 'culture2', 'clock3', 'sprint', 'incubator', 'stabilizer', 'swimAffinity', 'culture2', 'autoSeeder',
  'cataloguing', 'stillAffinity', 'sprint', 'stabilizer', 'culture2', 'crowdCost', 'nursery', 'freeSeeds', 'incubator', 'swimAffinity',
  'autoSeeder', 'cataloguing', 'stillAffinity', 'sprint', 'stabilizer', 'bigSeed', 'encTime', 'sparkGift', 'sparkFirst', 'sparkDatos',
  'archive', 'microscope', 'freeSeeds', 'startEssence', 'autoSeeder', 'stabilizer', 'cataloguing', 'encTime', 'notebook',
  // Night 3 (ring 4)
  'worldLegs', 'clock4', 'abundance', 'clock4', 'dishXL', 'clock4', 'clock4', 'ecosystem', 'colonyAffinity', 'symbiosis', 'cheapSeeds', 'discoBonus',
  'rareSpores', 'mutations', 'sparkMutagen', 'ecosystem', 'colonyAffinity', 'cheapSeeds', 'discoBonus',
  // Night 4 (ring 5)
  'worldGiants', 'eternalLife', 'eternalLife', 'dropperMax', 'encyclopedia', 'encyclopedia', 'encyclopedia',
];

/** Which world the start card ends up on: the newest (picked for you, it pays the most); a kid taps around. */
function pickWorld(policy: PolicyName, game: Game, rng: () => number): WorldId {
  const open = game.view().research!.worlds as WorldId[];
  const cur = game.research!.world;
  if (policy === 'kid') return rng() < 0.5 ? open[Math.floor(rng() * open.length)] : cur;
  return open[open.length - 1];
}

interface SessionRow {
  n: number;
  /** Seconds the session was given (Reloj). */
  limit: number;
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
  goldens: number;
  /** Esencia without the Spark gifts (the luck taken out): the structural curve. */
  base: number;
  /** Abonos bought. */
  boosts: number;
  /** Esencia/s in the first quarter of the clock and the best of the last quarter (does production climb?). */
  epsEarly: number;
  epsLate: number;
  bought: string[];
}

interface RunResult {
  policy: PolicyName;
  rows: SessionRow[];
  endedAt: number | null; // minutes when the final question would be asked
  endedSession: number | null;
  minDatos: number;
  /** Clock seconds of session 1 when the first creature was stable. */
  firstStable: number | null;
  /** Real seconds from the first tap to the first node bought (summary and tree included). */
  firstBuy: number | null;
}

/** The final question of the story: Act III ends when this night is ready. */
const FINAL_NIGHT = 7;

function runPolicy(policy: PolicyName, maxSessions: number, seed: number): RunResult {
  const rng = seededRng(seed);
  const bus = new Bus<GameEvents>();
  let t = 0;
  const game: Game = createGame({ bus, rng: seededRng(seed * 7 + 1), now: () => t * 1000, catalogSignatures: BOT_CATALOG_SIGS, grid: GRID, cycle: 'sessions' });
  const fx = () => game.effects!;
  const known = () => new Set(game.state.species.map((s) => catalogGroup(s.catalogCode ?? '')).filter(Boolean));
  const dish = new Dish(rng, () => game.simParams, {
    success: () => seedSuccess(fx()),
    pool: () => worldPool(game.session?.world ?? 'classic'),
    known,
    rare: () => fx().rareSpores,
    speciesOf: (p) => (p ? (TEMPLATE_SPECIES.get(p) ?? null) : null),
  });
  bus.on('dishSeed', ({ specs }) => {
    specs.forEach((s) => dish.addSeed(s));
    // Starter / Nevera plants of a session that waits for its first tap are pre-incubated (ADR-027),
    // also the ones a new game re-emits on its first tick.
    if (game.session?.phase === 'ready') dish.preincubate();
  });
  /**
   * Dish speed with the time-lapse (ADR-027). Until the integrator patches game.ts, game.speed is the
   * Incubadora alone (0, 1, 7/6 or 4/3); patched, it already carries simPace (≥ 3). Both read the same.
   */
  const simSpeed = (): number => {
    const sp = game.speed;
    if (!(sp > 0)) return 0;
    const paced = sp < fx().simPace ? sp * fx().simPace : sp;
    return Math.min(C.SIM_PACE_MAX, paced);
  };
  let steps = 0;
  bus.on('dishClear', () => dish.clear());
  const newSpecies: string[] = [];
  bus.on('speciesNew', ({ speciesId }) => void newSpecies.push(speciesId));
  if (EXT_LOG) bus.on('sessionExtended', (e) => console.log(`  S${game.session?.n} t=${game.session?.elapsed.toFixed(1)} +${JSON.stringify(e)}`));

  const rows: RunResult['rows'] = [];
  let endedAt: number | null = null;
  let endedSession: number | null = null;
  let minDatos = Infinity;
  let clockMinutes = 0;
  let firstStable: number | null = null;
  let firstBuy: number | null = null;

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
    if (n > 1) game.actions.startSession!();
    game.actions.pickWorld!(pickWorld(policy, game, rng));
    // The starter / Nevera creatures were pre-incubated under the start card (ADR-027).
    dish.preincubate();
    // Physical room of the model dish: the game refuses taps beyond its capacity; dividers may add a couple.
    dish.cap = fx().capacity + 2;
    let lastSeed = -99;
    let st = 0;
    let gifts = 0;
    let epsEarly = 0;
    let epsLate = 0;
    while (game.session!.phase !== 'over' && st < 3600) {
      st += DT;
      t += DT;
      const speed = simSpeed();
      const rep = dish.step(DT, speed);
      steps += DT * STEPS_PER_SEC * speed;
      game.tick(DT, { step: Math.round(steps), creatures: rep.creatures, events: rep.events, totalMass: 0, fill: 0.05 });
      const v = game.view();
      const ses = v.session!;
      if (ses.phase === 'over') break;
      const stableN = rep.creatures.filter((c) => c.state === 'stable').length;
      if (firstStable === null && stableN > 0 && ses.phase === 'running') firstStable = ses.elapsed;
      if (ses.phase === 'running') {
        // First and last quarter of the session (does production climb inside a run?).
        const q = (ses.limit + ses.bonus) / 4;
        if (ses.elapsed <= q) epsEarly = Math.max(epsEarly, v.essencePerSec);
        if (ses.remaining <= q) epsLate = Math.max(epsLate, v.essencePerSec);
      }
      if (TRACE === n && Math.abs(st % 15) < DT / 2) {
        const m = v.multipliers;
        console.log(`  s${n} t=${st.toFixed(0)}s left=${ses.remaining.toFixed(0)} eps=${v.essencePerSec.toFixed(1)} E=${v.essence.toFixed(0)} earned=${ses.essence.toFixed(0)} stable=${stableN} alive=${rep.creatures.length} cap=${v.seedPrice?.capacity} seed=${v.seedCost} M=${m?.global.toFixed(2)} boosts=${v.boost?.count}`);
      }
      // Spark: 30 s of Esencia (the kid misses most).
      if (v.golden && rng() < (policy === 'kid' ? 0.12 : 0.3)) {
        const e0 = game.state.essence;
        game.actions.collectGolden();
        gifts += Math.max(0, game.state.essence - e0);
      }
      while (newSpecies.length) game.actions.markSpeciesSeen(newSpecies.shift()!);
      // Seeds: fill the dish (room is the only limit; the price never rises with the living).
      const gap = policy === 'kid' ? 0.6 : 1.5;
      const price = v.seedPrice!;
      if (st - lastSeed >= gap && v.canSeed && (policy === 'kid' || (!price.full && !v.seedsGrowing))) {
        const spot = policy === 'kid' ? { x: rng() * GRID.w, y: rng() * GRID.h } : freeSpot(2.5);
        if (spot) {
          const spec = game.actions.seedAt(spot.x, spot.y);
          if (spec) {
            dish.addSeed(spec);
            lastSeed = st;
          }
        }
      }
      // Abono once the dish is full or busy (planner, greedy); the kid now and then.
      const b = v.boost;
      if (b?.affordable && ses.remaining > 25) {
        // A sensible player takes a ×1,25 whenever it leaves a seed in the wallet (spent Esencia never lowers the Datos).
        const want = policy === 'kid' ? rng() < 0.004 : price.full || v.seedsGrowing || v.essence - b.cost >= v.seedCost;
        if (want) game.actions.buyBoost!();
      }
      // Copies (Copiadora): when few creatures live, plant a known species of this world.
      if (fx().print && policy !== 'kid' && stableN < 2 && st - lastSeed >= gap && !price.full) {
        const pool = worldPool(ses.world as WorldId);
        const sp = game.state.species.find((s) => {
          const m = s.catalogCode ? MODEL_BY_CODE.get(s.catalogCode) : undefined;
          return m && pool.includes(m);
        });
        const spot = freeSpot(2.5);
        if (sp && spot && v.essence >= v.seedCost * C.PRINT_SEEDS_PRICE) {
          const spec = game.actions.printAt(sp.id, spot.x, spot.y);
          if (spec) {
            dish.addSeed(spec);
            lastSeed = st;
          }
        }
      }
    }
    const sum = game.lastSummary!;
    const session = game.session!;
    minDatos = Math.min(minDatos, sum.datos.total);
    const playedBefore = clockMinutes * 60 + session.elapsed + SUMMARY_SECONDS;
    // Final question: the last night of Act III is ready.
    const species = game.state.species.length;
    const ni = nightInfo(treeCtxOf(game.research!, species));
    if (endedAt === null && (ni.night >= FINAL_NIGHT || (ni.night === FINAL_NIGHT - 1 && ni.ready))) {
      endedAt = playedBefore / 60;
      endedSession = n;
    }
    // Tree visit.
    const bought: string[] = [];
    const canBuy = [...treeStates(treeCtxOf(game.research!, species)).values()].filter((s) => s.affordable && s.id !== 'lab').length;
    for (let guard = 0; guard < 300; guard++) {
      const states = treeStates(treeCtxOf(game.research!, species));
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
        else if (w && w.missingDatos > 0 && w.missingDatos < (sum.datos.total || 1) * 1.2 && bought.length >= 2) pick = null;
        else pick = can.sort((a, b) => a.cost - b.cost)[0].id;
      }
      if (!pick) break;
      if (!game.buyNode(pick).ok) break;
      bought.push(pick);
      if (firstBuy === null && pick !== 'lab') firstBuy = playedBefore + SECONDS_PER_BUY;
    }
    clockMinutes += (session.elapsed + Math.min(OVERHEAD_MAX, SUMMARY_SECONDS + SECONDS_PER_BUY * bought.length)) / 60;
    const levels = game.research!.levels;
    const owned = TREE_NODES.filter((d) => d.id !== 'lab' && (levels[d.id] ?? 0) > 0);
    rows.push({
      n,
      limit: session.limit,
      seconds: session.elapsed,
      essence: sum.essence,
      datos: sum.datos.total,
      bank: game.research!.datos,
      nodes: owned.length,
      levels: owned.reduce((a, d) => a + (levels[d.id] ?? 0), 0),
      branches: BRANCHES.filter((br) => owned.some((d) => d.branch === br)).length,
      species,
      night: levels.lab ?? 1,
      minutes: clockMinutes,
      world: session.world,
      canBuy,
      goldens: session.goldens,
      base: sum.essence - gifts,
      boosts: session.boosts,
      epsEarly,
      epsLate,
      bought,
    });
    if (endedAt !== null && n >= (endedSession ?? 0) + 2) break;
  }
  return { policy, rows, endedAt, endedSession, minDatos, firstStable, firstBuy };
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
console.log(`\nBioluma session bot (integrated game, cycle 'sessions') — up to ${maxSessions} sessions, ${runs} run(s) per policy, between runs ${SUMMARY_SECONDS} s + ${SECONDS_PER_BUY} s per buy (≤ ${OVERHEAD_MAX} s); time-lapse ×${C.SESSION_SIM_PACE} (${C.SIM_STEPS_PER_SEC * C.SESSION_SIM_PACE} steps/s)`);
console.log(`Tree: ${treeTotal} buyable nodes on 7 straight routes (+ the centre); 1 Dato per ${C.DATOS_ESSENCE_DIV} Esencia; seed ${C.SESSION_SEED_PRICE} Esencia (×${C.SEED_PRICE_STEP} per seed bought).\n`);
for (const policy of policies) {
  const res: RunResult[] = [];
  for (let k = 0; k < runs; k++) res.push(runPolicy(policy, maxSessions, 1000 + k * 17));
  const r0 = res[0];
  // Median per session over the runs (the table the plan page shows).
  const N = Math.min(...res.map((r) => r.rows.length));
  console.log(`── ${policy}: median of ${runs} run(s) per session ──`);
  console.log('| #  | night | given | played | Esencia | ×prev | Datos | bank | buys | nodes | routes | species | world   | Abono | eps ¼→¼ | total min | bought (run 1)');
  console.log('|----|-------|-------|--------|---------|-------|-------|------|------|-------|--------|---------|---------|-------|-------------|-----------|---------------');
  const medE = Array.from({ length: N }, (_, i) => med(res.map((r) => r.rows[i].essence)));
  for (let i = 0; i < N; i++) {
    const at = (f: (r: SessionRow) => number) => med(res.map((r) => f(r.rows[i])));
    const row = r0.rows[i];
    const grow = i > 0 && medE[i - 1] > 0 ? `×${(medE[i] / medE[i - 1]).toFixed(2)}` : '';
    console.log(
      `| ${String(i + 1).padStart(2)} | ${String(at((r) => r.night)).padStart(5)} | ${fmtClock(at((r) => r.limit)).padStart(5)} | ${fmtClock(at((r) => r.seconds)).padStart(6)} | ${fmtN(medE[i]).padStart(7)} | ${grow.padStart(5)} | ${String(at((r) => r.datos)).padStart(5)} | ${String(at((r) => r.bank)).padStart(4)} | ${String(at((r) => r.bought.length)).padStart(4)} | ${String(at((r) => r.nodes)).padStart(5)} | ${String(at((r) => r.branches)).padStart(6)} | ${String(at((r) => r.species)).padStart(7)} | ${row.world.padEnd(7)} | ${String(at((r) => r.boosts)).padStart(5)} | ${`${at((r) => r.epsEarly).toFixed(1)}→${at((r) => r.epsLate).toFixed(1)}`.padStart(11)} | ${at((r) => r.minutes).toFixed(0).padStart(9)} | ${verbose ? row.bought.join(' ') : row.bought.slice(0, 8).join(' ') + (row.bought.length > 8 ? ` +${row.bought.length - 8}` : '')}`,
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
  const fb = med(res.map((r) => r.firstBuy ?? Infinity));
  const end = (r: RunResult) => (r.endedSession ?? r.rows.length);
  // Buys after every session until the story ends (median over the runs, session by session).
  const nEnd = Math.min(N, Math.max(1, Math.round(endS)) || N);
  const buysMed = Array.from({ length: nEnd }, (_, i) => med(res.map((r) => r.rows[i].bought.length)));
  const minBuys = Math.min(...buysMed);
  const early = buysMed.slice(0, 3);
  // Dips: a session earning less Esencia than the previous one (median curve and every run).
  const dipsMed = medE.slice(1).filter((e, i) => e < medE[i]).length;
  const dipsRun = res.map((r) => r.rows.slice(1, end(r)).filter((x, i) => x.essence < r.rows[i].essence).length);
  const medB = Array.from({ length: N }, (_, i) => med(res.map((r) => r.rows[i].base)));
  const dipsBase = medB.slice(1).map((e, i) => (e < medB[i] ? `S${i + 2} ${((e / medB[i] - 1) * 100).toFixed(0)} %` : '')).filter(Boolean);
  const dipsList = medE.slice(1).map((e, i) => (e < medE[i] ? `S${i + 2} ${((e / medE[i] - 1) * 100).toFixed(0)} %` : '')).filter(Boolean);
  // Growth per session in nights 1–2 (geometric mean of the median curve).
  const n12 = Array.from({ length: N }, (_, i) => med(res.map((r) => r.rows[i].night))).filter((x) => x <= 2).length;
  const growth12 = n12 >= 2 ? Math.pow(medE[n12 - 1] / medE[0], 1 / (n12 - 1)) : NaN;
  // Production inside a session: best Esencia/s of the last quarter over the first quarter.
  const climb = med(res.flatMap((r) => r.rows.slice(0, end(r)).map((x) => (x.epsEarly > 0 ? x.epsLate / x.epsEarly : 1))));
  console.log(
    `\nmedian: first stable at ${Number.isFinite(fs) ? fs.toFixed(1) + ' s of clock' : '—'} · first purchase ${Number.isFinite(fb) ? fb.toFixed(0) + ' s after the first tap' : '—'} · session 1: ${fmtN(s1e)} Esencia, ${s1} Datos, ${s1buys} buys · buys per visit (median, to the end) min ${minBuys}, first three ${early.join('/')} · Esencia growth per session in nights 1–2 ×${growth12.toFixed(2)} · in-session climb ×${climb.toFixed(1)} · routes with a node by session 12: ${br12}/7 · min Datos/session ${minD} · Esencia dips: median curve ${dipsMed} [${dipsList.join(', ')}], per run ${dipsRun.join('/')}; without Spark gifts ${dipsBase.length} [${dipsBase.join(', ')}] · story ending at session ${Number.isFinite(endS) ? endS : '—'} ≈ ${Number.isFinite(endM) ? (endM / 60).toFixed(2) + ' h' : '—'}\n`,
  );
  const tag = `[${policy}]`;
  const s1limit = r0.rows[0].limit;
  const s1len = r0.rows[0].seconds;
  checks.push(`${tag} session 1 is ${C.SESSION_BASE_SECONDS} s (+ its "+5 s"): ${s1limit === C.SESSION_BASE_SECONDS && s1len <= C.SESSION_BASE_SECONDS + 15 ? 'OK' : 'FAIL'} (${fmtClock(s1limit)} → ${fmtClock(s1len)})`);
  checks.push(`${tag} first purchase within 45 s of the first tap (~30 s wanted): ${fb <= 45 ? 'OK' : 'FAIL'} (${Number.isFinite(fb) ? fb.toFixed(0) + ' s' : 'never'})`);
  checks.push(`${tag} a creature is stable within 5 s of clock in session 1: ${fs <= 5 ? 'OK' : 'FAIL'} (${Number.isFinite(fs) ? fs.toFixed(1) + ' s' : '—'})`);
  {
    const lim = Array.from({ length: N }, (_, i) => med(res.map((r) => r.rows[i].limit)));
    const longest = Math.max(...lim);
    checks.push(`${tag} runs grow 0:15 → 2–3 min and never shrink: ${lim.every((x, i) => i === 0 || x >= lim[i - 1]) && longest >= 120 && longest <= 185 ? 'OK' : 'FAIL'} (${lim.map(fmtClock).filter((x, i, a) => i === 0 || x !== a[i - 1]).join(' → ')})`);
  }
  checks.push(`${tag} never a session below ${C.DATOS_MIN} Datos: ${minD >= C.DATOS_MIN ? 'OK' : 'FAIL'} (${minD})`);
  if (policy !== 'kid') {
    checks.push(`${tag} ≥ 2 buys after every session: ${minBuys >= 2 ? 'OK' : 'FAIL'} (min ${minBuys})`);
    checks.push(`${tag} (info) buys after the first 3 sessions: ${early.join('/')}`);
    const first10 = buysMed.slice(0, 10);
    checks.push(`${tag} ≥ 2 buys after each of the first 10 runs: ${first10.every((b) => b >= 2) ? 'OK' : 'FAIL'} (${first10.join('/')})`);
    checks.push(`${tag} story ending 1:30–2:15 (RITMO §6): ${endM >= 90 && endM <= 135 ? 'OK' : 'FAIL'} (${Number.isFinite(endM) ? (endM / 60).toFixed(2) + ' h' : 'not reached'})`);
  }
  if (policy === 'planner') {
    checks.push(`${tag} HARD: the median player never earns less Esencia than in the session before: ${dipsMed === 0 ? 'OK' : 'FAIL'} (${dipsMed} dips)`);
    const allDips = dipsRun.reduce((a, b) => a + b, 0);
    const pairs = res.reduce((a, r) => a + Math.max(0, end(r) - 1), 0);
    checks.push(`${tag} (info) single runs: a session below the one before in ${allDips} of ${pairs} pairs (${((100 * allDips) / Math.max(1, pairs)).toFixed(0)} %: Sparks, seeds and deaths are luck)`);
    checks.push(`${tag} Esencia ×1,5–3 per session in nights 1–2 (RITMO: "numbers that explode"): ${growth12 >= 1.5 && growth12 <= 3.0 ? 'OK' : 'FAIL'} (×${growth12.toFixed(2)})`);
    checks.push(`${tag} production climbs inside a session (×1,5+ from the first quarter to the last): ${climb >= 1.5 ? 'OK' : 'FAIL'} (×${climb.toFixed(1)})`);
    checks.push(`${tag} ≥ 6 of 7 routes by session 12: ${br12 >= 6 ? 'OK' : 'FAIL'} (${br12})`);
    const nightAt = (s: number) => med(res.map((r) => r.rows[Math.min(s - 1, r.rows.length - 1)].night));
    const want = C.NIGHT_GATES.slice(0, 4).map((g) => g.sessions);
    checks.push(`${tag} nights at S${want.join('/S')} = 2/3/4/5: ${want.every((s, i) => nightAt(s) === i + 2) ? 'OK' : 'FAIL'} (${want.map(nightAt).join('/')})`);
  }
  if (policy === 'kid') {
    const s = C.NIGHT_GATES[1].sessions + C.NIGHT_GATE_FALLBACK;
    checks.push(`${tag} a kid still reaches night 3 by session ${s}: ${(r0.rows[Math.min(s - 1, r0.rows.length - 1)]?.night ?? 1) >= 3 ? 'OK' : 'FAIL'} (night ${r0.rows[Math.min(s - 1, r0.rows.length - 1)]?.night})`);
    checks.push(`${tag} story ending (no target, for the record): ${Number.isFinite(endM) ? (endM / 60).toFixed(2) + ' h at session ' + endS : 'not reached'}`);
  }
}
console.log('Pacing targets (docs/RITMO.md §6):');
for (const c of checks) console.log('  ' + c);
void TREE_BY_ID;
