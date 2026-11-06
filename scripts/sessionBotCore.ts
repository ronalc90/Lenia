/**
 * Session bot (docs/RITMO.md §6, docs/CICLO.md §11): plays the INTEGRATED sessions cycle end to end
 * (createGame({ cycle: 'sessions' }): clock, wallet, seed price and room, Spark gift, Abono, research
 * tree, worlds, nights, Nevera — all the game's own code) and reports the pacing, session by session.
 * Only the dish is a model: the statistical dish of the retired classic-loop bot (scripts/balance-bot.ts, deleted in 2B; copied: that script ran
 * its report on import), where a random seed takes with the MEASURED probability of the
 * Gotero/Estabilizador levels (cycleBalance SEED_SUCCESS) and grows into the species of the template
 * the game chose for it (the world's species, new forms first).
 *
 * This file is the engine (importable: tests/unit/ranking-sessions.test.ts plays it through the ranking
 * validator); scripts/session-bot.ts is the command line and the pacing report:
 *
 *   npx vite-node scripts/session-bot.ts [maxSessions=40] [runs=3] [--verbose] [--policy=planner] [--trace=N] [--runs]
 *
 * Policies: planner (sensible priorities, fills the dish, then Abono), greedy (cheapest node first),
 * kid (taps a lot, buys at random, random world, catches fewer Sparks, rarely an Abono), idle (plays like
 * the planner but never touches a drop, a Spark or the Nutrientes: only its pipettes collect — the
 * "never punish" test of ADR-030), tapper (ADR-031: taps creatures TAPPER_HITS_PER_S times a second all
 * session long and buys the ✦ Pulso route early). Everybody sows with the Sembrar button (actions.sow: the
 * safest spot, never refused for spacing). A run stops two sessions after the story's final question would be
 * asked (night 7 ready) or at maxSessions.
 *
 * Collected light (ADR-030, docs/CLARIDAD2.md §3.2): the Luz waits in each creature's drop. planner and
 * greedy tap every ripe drop (≥ LIGHT_RIPE_SHARE) one step later, at most HAND_TAPS_PER_S taps a second
 * (seeds are taps of their own), plus PLANNER_PULSES_PER_S pulses on the creature with the most light.
 *
 * The pulse (ADR-031, docs/MECANICAS.md §5.4): every tap goes through the game's own actions (pulse,
 * catchMote, collect), so the streak, the Chispazo, the glimmers and the rate cap are the game's. The kid taps
 * in bursts (KID_BURST_S at KID_TAPS_PER_S, KID_HIT_P of them on a creature, then KID_REST_S of rest).
 * `twin` (G3): before a session the run is forked and the same session is played again on the same tree by
 * another policy (the idle player's tree played by the tapper), so "tapping pays ×N" is measured with the same
 * purchases. `withPulse`: the idle player also buys the ✦ Pulso route, as early as the tapper (G3c).
 */
import { Bus, type GameEvents } from '../src/core/bus';
import type { Behavior, Creature, DetectorEvent, LeniaParams, Pattern, SeedSpec } from '../src/core/types';
import * as GB from '../src/game/balance';
import * as C from '../src/game/cycleBalance';
import { createGame, type CatalogSignature, type Game } from '../src/game/game';
import { PULSE_NODES } from '../src/game/tree';
import { rotateQuarter, scaledTemplate } from '../src/game/seeding';
import { treeCtxOf } from '../src/game/session';
import { seededRng } from '../src/game/testUtil';
import { BRANCHES, TREE_NODES, nightInfo, seedSuccess, treeStates } from '../src/game/tree';
import { WORLDS, WORLD_BY_ID, type WorldId } from '../src/game/worlds';
import { catalogGroup } from '../src/species/identity';
import { CATALOG, catalogByCode } from '../src/sim/catalog';
import { SIG, SIG_SCALES } from '../src/detect/signature';
import catalogSigJson from '../src/detect/catalogSignatures.json';

// ──────────────── dish model (from the retired balance-bot.ts) ────────

const STEPS_PER_SEC = C.SIM_STEPS_PER_SEC;
/** Console diagnostics: `ext` logs every clock extension, `trace` = N prints session N every 15 s. */
export const botLog = { ext: false, trace: -1 };
const DT = 0.5;
const BORN_STEPS = C.STABLE_AGE_STEPS;
const CLASSIFY_STEPS = 1000;
/** First dynamic feature of a signature (signature.ts SIG.SPEED). */
const SIG_DYNAMIC_FROM = SIG.SPEED;
const BASE_HAZARD = 1 / 2400;
/**
 * Crowded movers die sooner. the retired balance-bot.ts used 1/600 (CPU audit); here 1/90 s, closer to QA3 F5's
 * measured early play (median Orbium life ≈ 27 s when 3–5 swimmers share the dish), so the first
 * sessions are not 2–3× too rich.
 */
const MOVER_HAZARD = 1 / 90;
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
export const SUMMARY_SECONDS = 6;
export const SECONDS_PER_BUY = 2.5;
export const OVERHEAD_MAX = 45;
/** A sensible player's taps on drops, per second (plus one per seed). [plan CLARIDAD2 §3.2] */
const HAND_TAPS_PER_S = 3;
/** (ADR-031) The planner also pulses the creature with the most light this many times a second. [MECANICAS §5.4] */
const PLANNER_PULSES_PER_S = 1;
/** (ADR-031) The tapper hits creatures this many times a second, catches glimmers and Sparks with these odds. [MECANICAS §5.3] */
const TAPPER_HITS_PER_S = 5;
const TAPPER_MOTE_Q = 0.6;
const TAPPER_SPARK_P = 0.5;
/** (ADR-031) The kid taps in bursts: KID_BURST_S at KID_TAPS_PER_S (KID_HIT_P on a creature), then KID_REST_S. [MECANICAS §5.4] */
const KID_BURST_S = 3;
const KID_REST_S = 2;
const KID_TAPS_PER_S = 8;
const KID_HIT_P = 0.7;
const KID_MOTE_Q = 0.35;
/** Chance per step (0.5 s) of catching a visible Spark, by policy. */
const SPARK_CATCH: Record<PolicyName, number> = { planner: 0.3, greedy: 0.3, kid: 0.12, idle: 0, tapper: TAPPER_SPARK_P };
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
  /** Contact kills (a seed stamped onto a body, two bodies colliding): the bot's fusions (G7). */
  fusions = 0;
  /** …of them, a seed stamped onto (or right next to) a body: the fusions sowing causes (G7). */
  seedHits = 0;
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
      if (this.rng() < 0.3) {
        this.fusions++;
        this.seedHits++;
        this.kill(hit, 'died');
      }
    } else {
      // A pure template (Nevera, sure seeds, copies) always takes; a random seed with the measured odds.
      const sure = spec.shape === 'pattern' && (spec.bias ?? 0) >= 1;
      if (pool.length && this.rng() < (sure ? 1 : this.hooks.success())) {
        fate = 'stable';
        if (tpl) species = tpl; // the world's species or one of its variants
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
        // Measured (cycleBalance DISH_CAPACITY): in Ø128 two swimmers already meet, more only collide more.
        const crowd = Number.isFinite(this.cap) ? Math.max(2, this.cap - 1) : 3;
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
        if (wrapDist(a.x, a.y, c.x, c.y) < COLLIDE_R * R && this.rng() < COLLIDE_KILL * ds * PER_STEP) {
          this.fusions++;
          this.kill(this.rng() < 0.5 ? a : c, 'died');
        }
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
      // Like the real detector (signature.ts): the dynamic features (speed, turn, pulse) stay unknown (-1)
      // until the track is classified (CLASSIFY_STEPS of history), so a young form cannot found a species
      // (game finishedForm). QA4 F-04: the bot used to register species the real game could not.
      signature: (b.species ? b.species.sig.map((v, i) => Math.max(0, v + (b.sigNoise[i] ?? 0))) : new Array(SIG_LEN).fill(0.05)).map((v, i) =>
        i >= SIG_DYNAMIC_FROM && !(b.steps >= CLASSIFY_STEPS) ? -1 : v,
      ),
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
  // Variants (look-alike forms the game seeds now and then, docs/ESPECIES.md) grow as themselves: the
  // game reveals them by their own signature and counts them as their species ("variante", Datos).
  for (const code of [...w.species, ...(w.variants ?? [])]) {
    const e = catalogByCode(code);
    const m = MODEL_BY_CODE.get(code);
    if (!e || !m) continue;
    // Pure templates and thin worlds' seeds turn by quarter turns (rotateQuarter caches them per template).
    const tpl = scaledTemplate(e, w.params.R);
    for (let k = 0; k < 4; k++) TEMPLATE_SPECIES.set(rotateQuarter(tpl, k), m);
  }
}

// ───────────────────────────── policies ────────────────────────────

export type PolicyName = 'planner' | 'greedy' | 'kid' | 'idle' | 'tapper';

/** The planner's order of interest (it buys the first affordable one, else saves for it if close). */
const PLAN = [
  // A sensible player: what fills the dish fastest first (VELA points at the Gotero: CLARIDAD F-03),
  // a new world as soon as it opens (the start card picks it), Esencia and time; Datos-only and
  // comfort nodes last.
  // Night 1 (rings 1–2)
  // RITMO §5: the clock first — a longer run is the most visible "antes → después". CLARIDAD2 §1.3: the
  // first Pipeta in session 1, its second level soon after (the helper the child sees working).
  // A player who taps every ripe drop gains no light from more pipettes than the first one (B1: the rest of
  // the route bought in the plan's order, or as the cheapest node, delayed the growth nodes and dipped the
  // late nights by 1–6 %): the planner leaves the rest of ↓ Recoger to the idle player (PLANNER_SKIPS).
  // ADR-031: Pulso I right after the first Pipeta (a sensible player taps a little).
  'clock', 'pipette', 'pulse', 'dropper', 'clock', 'pipette', 'dish', 'culture', 'clock', 'worldCold', 'dropper', 'clock', 'culture', 'pipette', 'dish', 'culture', 'dropper',
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

/**
 * ↓ Recoger nodes past the first Pipeta: a player who taps every ripe drop never buys them. Nor the ✦ Pulso route
 * past the Pulso I of its plan (ADR-031): the planner taps a little, it is not the tapper.
 */
const PLANNER_SKIPS = new Set(['pipetteFast', 'dropBig', 'pipetteMore', 'pipetteMagnet', 'pipetteMaster', ...PULSE_NODES]);
/**
 * The idle player never taps: the planner's order with the ↓ Recoger route woven in, each step as soon as
 * its night opens it (B1b: the whole route first starved the clock and dipped its runs more).
 */
const IDLE_PLAN = (() => {
  const out = PLAN.filter((id) => !PULSE_NODES.has(id)); // it never taps: no ✦ Pulso node
  const after = (id: string, ...add: string[]) => out.splice(out.indexOf(id) + 1, 0, ...add);
  after('worldGyro', 'pipetteFast');
  after('fridge', 'dropBig');
  after('notebook', 'pipetteFast', 'dropBig', 'pipetteFast', 'dropBig');
  after('culture2', 'pipetteMore');
  after('autoSeeder', 'pipetteMagnet', 'pipetteMore', 'pipetteMore', 'pipetteMagnet', 'pipetteMore', 'pipetteMore');
  after('abundance', 'pipetteMaster');
  return out;
})();

/**
 * (ADR-031) The tapper: the planner's order with the ✦ Pulso route right after the Pipeta and Más tiempo
 * (MECANICAS §5.4), Racha larga as soon as Destello frecuente opens it, Chispazo seguido when Night 2 opens it.
 */
function withPulseRoute(plan: readonly string[]): string[] {
  const out = plan.filter((id) => id !== 'pulse');
  const after = (id: string, ...add: string[]) => out.splice(out.indexOf(id) + 1, 0, ...add);
  after('pipette', 'pulse', 'pulse', 'pulse');
  after('dish', 'spark', 'streakLong', 'streakLong', 'sparkLife', 'sparkTime');
  after('lab', 'chispazoOften', 'chispazoOften');
  return out;
}
const TAPPER_PLAN = withPulseRoute(PLAN);

/** Levels a policy's plan wants of a node at most (a plan entry otherwise means "up to its last level"). */
const PLAN_CAP: Partial<Record<PolicyName, Record<string, number>>> = { planner: { pulse: 1 }, greedy: {} };

/** (G3c) The idle player's order with the ✦ Pulso route as early as the tapper's. */
const IDLE_PULSE_PLAN = withPulseRoute(IDLE_PLAN);

/** Which world the start card ends up on: the newest (picked for you, it pays the most); a kid taps around. */
function pickWorld(policy: PolicyName, game: Game, rng: () => number): WorldId {
  // idle picks like the planner
  const open = game.view().research!.worlds as WorldId[];
  const cur = game.research!.world;
  if (policy === 'kid') return rng() < 0.5 ? open[Math.floor(rng() * open.length)] : cur;
  return open[open.length - 1];
}

export interface SessionRow {
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
  /** (ADR-030) Luz made by the drops, by who collected it, and what waited in full drops (capped). */
  made: number;
  hand: number;
  pipette: number;
  sweep: number;
  capped: number;
  /** (ADR-031) Luz the finger added (pulses, Chispazos, glimmers, the streak's extra), best streak ×, Chispazos. */
  finger: number;
  bestStreak: number;
  chispazos: number;
  /** Seeds that never took and the Luz they gave back; living creatures that went dark, fusions among them; saves. */
  refunds: number;
  refunded: number;
  deaths: number;
  merged: number;
  saved: number;
  /** The model dish's contact kills this session, and those a seed caused (G7). */
  fusions: number;
  seedHits: number;
  /** (G3) Luz of the same session played on the same tree by the twin policy (null without `twin`). */
  twin: number | null;
}

export interface RunResult {
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
export const FINAL_NIGHT = 7;

/** Hooks for callers that watch a run (tests); the pacing report needs none. */
export interface RunHooks {
  /** Game clock origin, ms (the game's createdAt). Default 0. */
  startMs?: number;
  /**
   * After every session's tree visit. `wallSec` = seconds since the game was created, the time between
   * sessions (summary and tree, SUMMARY_SECONDS + SECONDS_PER_BUY per buy) included.
   */
  onSessionEnd?: (game: Game, info: { n: number; wallSec: number }) => void;
  /** (G3) Fork every session and play it again on the same tree with this policy (SessionRow.twin). */
  twin?: PolicyName;
  /** (G3c) The idle player buys the ✦ Pulso route too, as early as the tapper. */
  withPulse?: boolean;
}

/** One played game: the integrated game, its model dish, and the clock the game reads (seconds). */
interface World {
  game: Game;
  dish: Dish;
  rng: () => number;
  clock: { t: number };
  steps: number;
  newSpecies: string[];
}

function makeWorld(seed: number, t0: number, clock: { t: number }, save?: string): World {
  const rng = seededRng(seed);
  const bus = new Bus<GameEvents>();
  const game: Game = createGame({ bus, rng: seededRng(seed * 7 + 1), now: () => t0 + clock.t * 1000, catalogSignatures: BOT_CATALOG_SIGS, grid: GRID, cycle: 'sessions' }, save);
  const fx = () => game.effects!;
  const known = () => new Set(game.state.species.map((s) => catalogGroup(s.catalogCode ?? '')).filter(Boolean));
  const dish = new Dish(rng, () => game.simParams, {
    success: () => seedSuccess(fx()),
    pool: () => worldPool(game.session?.world ?? 'classic'),
    known,
    rare: () => fx().rareSpores,
    speciesOf: (p) => (p ? (TEMPLATE_SPECIES.get(p) ?? null) : null),
  });
  const w: World = { game, dish, rng, clock, steps: 0, newSpecies: [] };
  bus.on('dishSeed', ({ specs }) => {
    specs.forEach((s) => dish.addSeed(s));
    // Starter / Nevera plants of a session that waits for its first tap are pre-incubated (ADR-027),
    // also the ones a new game re-emits on its first tick.
    if (game.session?.phase === 'ready') dish.preincubate();
  });
  bus.on('dishClear', () => dish.clear());
  bus.on('speciesNew', ({ speciesId }) => void w.newSpecies.push(speciesId));
  if (botLog.ext) bus.on('sessionExtended', (e) => console.log(`  S${game.session?.n} t=${game.session?.elapsed.toFixed(1)} +${JSON.stringify(e)}`));
  return w;
}

/**
 * Dish speed with the time-lapse (ADR-027). Until the integrator patches game.ts, game.speed is the
 * Incubadora alone (0, 1, 7/6 or 4/3); patched, it already carries simPace (≥ 3). Both read the same.
 */
function simSpeed(game: Game): number {
  const sp = game.speed;
  if (!(sp > 0)) return 0;
  const paced = sp < game.effects!.simPace ? sp * game.effects!.simPace : sp;
  return Math.min(C.SIM_PACE_MAX, paced);
}

/** Farthest-from-everything random point of the model dish (copies; seeds use the game's own Sembrar spot). */
function freeSpot(w: World, spacingR: number): { x: number; y: number } | null {
  const R = w.game.simParams.R;
  let best: { x: number; y: number } | null = null;
  let bestD = -1;
  for (let i = 0; i < 30; i++) {
    const x = w.rng() * GRID.w;
    const y = w.rng() * GRID.h;
    let d = Infinity;
    for (const b of w.dish.blobs) d = Math.min(d, wrapDist(x, y, b.x, b.y));
    if (d > bestD) {
      bestD = d;
      best = { x, y };
    }
  }
  return bestD > spacingR * R ? best : null;
}

interface PlayStats {
  gifts: number;
  epsEarly: number;
  epsLate: number;
  fusions: number;
  seedHits: number;
  /** Clock seconds when the first creature was stable (null: none). */
  firstStable: number | null;
}

/** Stable creatures of the latest report, the ones holding the most light first. */
function byLight(game: Game, creatures: readonly Creature[]): number[] {
  const drop = new Map((game.view().drops ?? []).filter((d) => d.owner !== null).map((d) => [d.owner!, d.amount]));
  return creatures
    .filter((c) => c.state === 'stable')
    .map((c) => ({ id: c.id, a: drop.get(c.id) ?? 0 }))
    .sort((a, b) => b.a - a.a || a.id - b.id)
    .map((x) => x.id);
}

/**
 * Play the session on the dish (already set up: 'ready') to its end with `policy`. `noTaps`: the same player who
 * never taps the dish (no drop, no creature, no glimmer: only the pipettes and the final sweep collect), the twin
 * of G3; it still sows, buys Nutrientes and catches Sparks like the policy.
 */
function playSession(w: World, policy: PolicyName, n: number, opts: { noTaps?: boolean; noBoost?: boolean; noSpark?: boolean } = {}): PlayStats {
  const noTaps = !!opts.noTaps;
  const { game, dish, rng } = w;
  const fx = () => game.effects!;
  let lastSeed = -99;
  let st = 0;
  let gifts = 0;
  let epsEarly = 0;
  let epsLate = 0;
  let taps = 0;
  let pulses = 0;
  let kidT = 0;
  let firstStable: number | null = null;
  const fusions0 = dish.fusions;
  const seedHits0 = dish.seedHits;
  /** Glimmers the player already went for (caught or let go: decided once). */
  const tried = new Set<number>();
  /** Drops that were ripe at the previous step: a sensible player taps them now (a reaction, not a reflex). */
  let seenRipe = new Set<number>();
  let rep: { creatures: Creature[]; events: DetectorEvent[] } = { creatures: [], events: [] };
  while (game.session!.phase !== 'over' && st < 3600) {
    st += DT;
    w.clock.t += DT;
    const speed = simSpeed(game);
    rep = dish.step(DT, speed);
    w.steps += DT * STEPS_PER_SEC * speed;
    game.tick(DT, { step: Math.round(w.steps), creatures: rep.creatures, events: rep.events, totalMass: 0, fill: 0.05 });
    const phase: string = game.session!.phase; // the tick may have ended the run
    if (phase === 'over') break;
    // Collected light (ADR-030) and the pulse (ADR-031): the taps come first, then the wallet they fill is spent.
    const drops = game.view().drops ?? [];
    if (noTaps) {
      // the twin collects nothing by hand
    } else if (policy === 'planner' || policy === 'greedy') {
      taps = Math.min(HAND_TAPS_PER_S, taps + HAND_TAPS_PER_S * DT);
      for (const d of drops) {
        if (taps < 1) break;
        if (seenRipe.has(d.id) && game.actions.collect!(d.id) > 0) taps -= 1;
      }
      seenRipe = new Set((game.view().drops ?? []).filter((d) => d.fill >= C.LIGHT_RIPE_SHARE).map((d) => d.id));
      pulses += PLANNER_PULSES_PER_S * DT;
      while (pulses >= 1) {
        pulses -= 1;
        const top = byLight(game, rep.creatures)[0];
        if (top !== undefined) game.actions.pulse!(top);
      }
    } else if (policy === 'tapper') {
      // Tap after tap all over the dish: the creature with the most light first, then the next one.
      pulses += TAPPER_HITS_PER_S * DT;
      const order = byLight(game, rep.creatures);
      let k = 0;
      while (pulses >= 1) {
        pulses -= 1;
        if (order.length) game.actions.pulse!(order[k++ % order.length]);
        else {
          const loose = (game.view().drops ?? []).find((d) => d.amount > 0);
          if (loose) game.actions.collect!(loose.id);
        }
      }
    } else if (policy === 'kid') {
      // Bursts of wild tapping and short rests; most taps land on a creature, some on empty agar.
      kidT = (kidT + DT) % (KID_BURST_S + KID_REST_S);
      if (kidT < KID_BURST_S) {
        pulses += KID_TAPS_PER_S * DT;
        while (pulses >= 1) {
          pulses -= 1;
          if (rng() >= KID_HIT_P) continue; // a miss: a ripple on the agar, nothing else
          const live = rep.creatures.filter((c) => c.state === 'stable');
          if (live.length) game.actions.pulse!(live[Math.floor(rng() * live.length)].id);
          else {
            const full = (game.view().drops ?? []).filter((d) => d.amount > 0);
            if (full.length) game.actions.collect!(full[Math.floor(rng() * full.length)].id);
          }
        }
      }
    }
    // Glimmers of a Chispazo: caught with the policy's odds (the others settle as drops on their own).
    const q = noTaps ? 0 : policy === 'tapper' ? TAPPER_MOTE_Q : policy === 'kid' ? (kidT < KID_BURST_S ? KID_MOTE_Q : 0) : 0;
    if (q > 0)
      for (const m of game.view().motes ?? []) {
        if (tried.has(m.id)) continue;
        tried.add(m.id);
        if (rng() < q) game.actions.catchMote!(m.id);
      }
    const v = game.view();
    const ses = v.session!;
    const stableN = rep.creatures.filter((c) => c.state === 'stable').length;
    if (firstStable === null && stableN > 0 && ses.phase === 'running') firstStable = ses.elapsed;
    if (ses.phase === 'running') {
      // First and last quarter of the session (does production climb inside a run?).
      const qs = (ses.limit + ses.bonus) / 4;
      if (ses.elapsed <= qs) epsEarly = Math.max(epsEarly, v.essencePerSec);
      if (ses.remaining <= qs) epsLate = Math.max(epsLate, v.essencePerSec);
    }
    if (botLog.trace === n && Math.abs(st % 15) < DT / 2) {
      const m = v.multipliers;
      console.log(`  s${n} t=${st.toFixed(0)}s left=${ses.remaining.toFixed(0)} eps=${v.essencePerSec.toFixed(1)} E=${v.essence.toFixed(0)} earned=${ses.essence.toFixed(0)} stable=${stableN} alive=${rep.creatures.length} cap=${v.seedPrice?.capacity} seed=${v.seedCost} M=${m?.global.toFixed(2)} boosts=${v.boost?.count} streak=${v.streak?.hits ?? 0}`);
    }
    // Spark: its seconds of light (× the streak); the kid misses most, the idle player never tries.
    if (v.golden && !opts.noSpark && rng() < SPARK_CATCH[policy]) {
      const e0 = game.state.essence;
      game.actions.collectGolden();
      gifts += Math.max(0, game.state.essence - e0);
    }
    while (w.newSpecies.length) game.actions.markSpeciesSeen(w.newSpecies.shift()!);
    // Seeds (ADR-031): the Sembrar button, which picks the safest spot. Room is the only limit.
    const gap = policy === 'kid' ? 0.6 : 1.5;
    const price = v.seedPrice!;
    if (st - lastSeed >= gap && v.canSeed && (policy === 'kid' || (!price.full && !v.seedsGrowing))) {
      const spec = game.actions.sow!();
      if (spec) {
        dish.addSeed(spec);
        lastSeed = st;
      }
    }
    // Abono once the dish is full or busy (planner, greedy, tapper); the kid now and then.
    const b = v.boost;
    if (b?.affordable && ses.remaining > 25) {
      // A sensible player takes a ×1,25 whenever it leaves a seed in the wallet (spent Esencia never lowers the Datos).
      const want = policy === 'idle' || opts.noBoost ? false : policy === 'kid' ? rng() < 0.004 : price.full || v.seedsGrowing || v.essence - b.cost >= v.seedCost;
      if (want) game.actions.buyBoost!();
    }
    // Copies (Copiadora): when few creatures live, plant a known species of this world.
    if (fx().print && policy !== 'kid' && stableN < 2 && st - lastSeed >= gap && !price.full) {
      const pool = worldPool(ses.world as WorldId);
      const sp = game.state.species.find((s) => {
        const m = s.catalogCode ? MODEL_BY_CODE.get(s.catalogCode) : undefined;
        return m && pool.includes(m);
      });
      const spot = v.sowSpot ?? freeSpot(w, 2.5);
      if (sp && spot && v.essence >= v.seedCost * C.PRINT_SEEDS_PRICE) {
        const spec = game.actions.printAt(sp.id, spot.x, spot.y);
        if (spec) {
          dish.addSeed(spec);
          lastSeed = st;
        }
      }
    }
  }
  return { gifts, epsEarly, epsLate, fusions: dish.fusions - fusions0, seedHits: dish.seedHits - seedHits0, firstStable };
}

/** The session waiting on `game`'s dish, played again on the same tree by `policy` (its Luz). */
function twinLight(game: Game, policy: PolicyName, seed: number, t: number): number {
  const w = makeWorld(seed, 0, { t }, game.serialize());
  w.game.dishLost(); // the save holds no dish: the twin replants the start card's creatures
  w.dish.cap = w.game.effects!.capacity + 2;
  w.game.tick(0, null); // first tick: the fresh dish gets its plants
  w.dish.preincubate();
  // Taps on the dish only: no Nutrientes and no Spark (the idle player it is compared with takes neither).
  playSession(w, policy, w.game.session!.n, { noBoost: true, noSpark: true });
  return w.game.lastSummary?.essence ?? 0;
}

export function runPolicy(policy: PolicyName, maxSessions: number, seed: number, hooks: RunHooks = {}): RunResult {
  const clock = { t: 0 };
  const w = makeWorld(seed, hooks.startMs ?? 0, clock);
  const { game, dish, rng } = w;
  const fx = () => game.effects!;
  let overheadSec = 0;

  const rows: RunResult['rows'] = [];
  let endedAt: number | null = null;
  let endedSession: number | null = null;
  let minDatos = Infinity;
  let clockMinutes = 0;
  let firstStable: number | null = null;
  let firstBuy: number | null = null;

  for (let n = 1; n <= maxSessions; n++) {
    if (n > 1) game.actions.startSession!();
    game.actions.pickWorld!(pickWorld(policy, game, rng));
    // The starter / Nevera creatures were pre-incubated under the start card (ADR-027).
    dish.preincubate();
    // Physical room of the model dish: the game refuses taps beyond its capacity; dividers may add a couple.
    dish.cap = fx().capacity + 2;
    const twin = hooks.twin ? twinLight(game, hooks.twin, seed * 31 + n, clock.t) : null;
    const ps = playSession(w, policy, n);
    if (firstStable === null && n === 1) firstStable = ps.firstStable;
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
    const plan = policy === 'idle' ? (hooks.withPulse ? IDLE_PULSE_PLAN : IDLE_PLAN) : policy === 'tapper' ? TAPPER_PLAN : PLAN;
    for (let guard = 0; guard < 300; guard++) {
      const states = treeStates(treeCtxOf(game.research!, species));
      const can = [...states.values()].filter((s) => s.affordable);
      if (!can.length) break;
      let pick: string | null = null;
      if (can.some((s) => s.id === 'lab')) pick = 'lab'; // nights are free: everybody takes them
      else if (policy === 'greedy') pick = can.sort((a, b) => a.cost - b.cost)[0].id;
      else if (policy === 'kid') pick = can[Math.floor(rng() * can.length)].id;
      else {
        // The plan in order; else the cheapest. Save for the planned one when it is close. A node that waits
        // for a later session (the Destello's first Spark) is not waited for.
        const cap = PLAN_CAP[policy] ?? {};
        const want = plan.find((id) => {
          const s = states.get(id);
          return s && !s.maxed && !(s.level >= (cap[id] ?? Infinity)) && s.block !== 'locked' && s.block !== 'night' && s.block !== 'hidden' && s.block !== 'later';
        });
        const wNode = want ? states.get(want)! : null;
        // The planner leaves the pipette upgrades to the idle player; the idle player never buys taps (ADR-031).
        const pool = policy === 'planner' ? can.filter((x) => !PLANNER_SKIPS.has(x.id)) : policy === 'idle' && !hooks.withPulse ? can.filter((x) => !PULSE_NODES.has(x.id)) : can;
        if (wNode && wNode.affordable) pick = wNode.id;
        else if (wNode && wNode.missingDatos > 0 && wNode.missingDatos < (sum.datos.total || 1) * 1.2 && bought.length >= 2) pick = null;
        else pick = pool.length ? pool.sort((a, b) => a.cost - b.cost)[0].id : null;
      }
      if (!pick) break;
      if (!game.buyNode(pick).ok) break;
      bought.push(pick);
      if (firstBuy === null && pick !== 'lab') firstBuy = playedBefore + SECONDS_PER_BUY;
    }
    const overhead = Math.min(OVERHEAD_MAX, SUMMARY_SECONDS + SECONDS_PER_BUY * bought.length);
    clockMinutes += (session.elapsed + overhead) / 60;
    overheadSec += overhead;
    hooks.onSessionEnd?.(game, { n, wallSec: clock.t + overheadSec });
    const levels = game.research!.levels;
    const owned = TREE_NODES.filter((d) => d.id !== 'lab' && (levels[d.id] ?? 0) > 0);
    const fing = sum.finger;
    const loss = sum.losses;
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
      base: sum.essence - ps.gifts,
      boosts: session.boosts,
      epsEarly: ps.epsEarly,
      epsLate: ps.epsLate,
      bought,
      made: sum.light?.made ?? 0,
      hand: sum.light?.hand ?? 0,
      pipette: sum.light?.pipette ?? 0,
      sweep: sum.light?.sweep ?? 0,
      capped: sum.light?.capped ?? 0,
      finger: fing?.luz ?? 0,
      bestStreak: fing?.bestMult ?? 1,
      chispazos: fing?.chispazos ?? 0,
      refunds: loss?.refunds ?? 0,
      refunded: loss?.refunded ?? 0,
      deaths: loss?.deaths ?? 0,
      merged: loss?.merged ?? 0,
      saved: loss?.saved ?? 0,
      fusions: ps.fusions,
      seedHits: ps.seedHits,
      twin,
    });
    if (endedAt !== null && n >= (endedSession ?? 0) + 2) break;
  }
  return { policy, rows, endedAt, endedSession, minDatos, firstStable, firstBuy };
}
