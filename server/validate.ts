/**
 * Server-side plausibility checks for ranking submissions. Pure functions, no I/O.
 *
 * Be honest about what this is: Bioluma is a client-side idle game, so a determined player can make
 * the browser report anything. We cannot make it unhackable. What we can do is:
 *  - reject numbers that are IMPOSSIBLE under the game rules (hard limits → "reject"), using upper
 *    bounds derived from src/game/balance.ts with generous margins, and wall-clock time measured by
 *    the SERVER between two accepted submissions (speed hacks inflate play time faster than real time);
 *  - flag numbers that are merely IMPLAUSIBLE (soft limits → "flag": the entry is kept but greyed and
 *    left out of the top board), plus anything the client integrity heuristics reported.
 * Every bound is a ceiling a legitimate player should never touch; false positives are worse than
 * missed cheats here, because flags are sticky.
 *
 * Two loops (RunStats.cycle). The sessions cycle (docs/CICLO.md, ADR-026: every current client) is
 * judged by the session economy: nights against the sessions their gates need, sessions against play
 * time, Datos against what the Esencia pays, Esencia/s against the best tree the Datos can buy (src/game
 * tree.ts, cycleBalance.ts). Saves without `cycle` (old clients of the classic Era loop) keep the
 * classic prestige rules. tests/unit/ranking-sessions.test.ts plays the session bot through it (RF-01).
 */
import * as B from '../src/game/balance.js';
import * as C from '../src/game/cycleBalance.js';
import { nodeCost, TREE_NODES, treeEffects, type TreeEffects } from '../src/game/tree.js';
import { WORLDS, worldEssenceMult } from '../src/game/worlds.js';
import { BONUS_CAP as SECRETS_BONUS_CAP } from '../src/secrets/data.js';
import { MAX_CLOCK_SKEW_MS, type IntegrityReport } from './protocol.js';

/** The game numbers a submission reports (see SubmissionPayload). */
export interface RunStats {
  lifetimeEssence: number;
  eraEssence: number;
  genome: number;
  speciesCount: number;
  behaviorsCount: number;
  era: number;
  playTimeSec: number;
  seeds: number;
  createdAt: number;
  /** stats.epsPeak: highest production ever seen, buffs included (never decreases). */
  epsPeak: number;
  /**
   * Which loop the save plays (protocol field, optional). 'sessions' (docs/CICLO.md, ADR-026): `era` is
   * the Night, `genome` is always 0, and `sessions` / `datos` must be present. Absent = the classic Era
   * loop of old clients.
   */
  cycle?: 'sessions';
  /** (sessions) Sessions finished (ResearchState.sessions). */
  sessions?: number;
  /** (sessions) Datos ever earned (ResearchState.datosEarned). */
  datos?: number;
}

/** Last accepted submission of a player: the reference for the next one. */
export interface Baseline extends RunStats {
  /** Server time (ms) when it was accepted. */
  at: number;
  clientTime: number;
}

export type Verdict = 'accept' | 'flag' | 'reject';

export interface ValidationResult {
  verdict: Verdict;
  /** Hard violations (any → reject). */
  hard: string[];
  /** Soft violations (any → flag). */
  soft: string[];
}

/** Every threshold in one place. Tuned to be loose; see each comment. */
export const LIMITS = {
  /** No save can be older than the game itself. */
  GAME_EPOCH_MS: Date.UTC(2026, 8, 1),
  /** Play time may exceed server wall time by this much (latency, clock jitter, rounding). */
  PLAYTIME_TOL_SEC: 120,
  PLAYTIME_TOL_FRAC: 0.02,
  /** Physical ceiling on paying creatures: a 224×280 dish packs ~150 creatures of R = 10. */
  CREATURES_HARD: 160,
  /** "Implausible" creature count: grows slowly with essence (seed cost saturates ×3 per creature). */
  CREATURES_SOFT_BASE: 8,
  CREATURES_SOFT_PER_DECADE: 4,
  /** Multiplier on the hard essence ceiling (rounding, untracked sources such as objective rewards). */
  ESSENCE_HARD_MARGIN: 1.5,
  /** Absolute slack in essence for tiny values (LUMP_MIN rewards and the like). */
  ESSENCE_SLACK: 500,
  /** Margin on the "essence ≤ peak production × time" consistency check (exact accounting, so small). */
  PEAK_MARGIN: 1.25,
  /** Registered species: the catalog has 26, player discoveries add more; this is far beyond plausible. */
  SPECIES_HARD_MAX: 300,
  SPECIES_HARD_BURST: 10,
  SPECIES_HARD_PER_HOUR: 60,
  SPECIES_SOFT_BURST: 5,
  SPECIES_SOFT_PER_HOUR: 20,
  /**
   * Hard floor on play seconds per Era. The brief suggested 10 min, but late-game prestige loops (Genome,
   * achievements and milestones all persist) can legitimately be faster; the 250 000 E_era rule plus the
   * essence ceiling already bound Era speed, so this only catches the absurd.
   */
  ERA_MIN_SEC: 120,
  /** Seed taps + Sembrador (min 2 s) + brush strokes: 20 per second is beyond any thumb. */
  SEEDS_BURST: 100,
  SEEDS_PER_SEC: 20,
  // ── Sessions cycle (docs/CICLO.md, ADR-026) ──
  /**
   * Shortest possible session, seconds of play: the clock starts at SESSION_BASE_SECONDS, but "Terminar
   * ahora" can end one at once, so only the start card and the end card are certain. 2 s is beyond any
   * thumb; the Datos minimum (DATOS_MIN, only for a full clock) keeps quick ends from paying anyway.
   */
  SESSION_MIN_SEC: 2,
  SESSIONS_BURST: 3,
  /**
   * Creatures paying at once. Soft: the room the biggest dish sells (TreeEffects.capacity) plus what
   * dividers and the seeds already forming add. Hard: what physically fits on the largest dish (Ø224,
   * creatures of R ≈ 13 need ~2.5 R between centres: ~40).
   */
  SESSION_CREATURES_SOFT_EXTRA: 6,
  SESSION_CREATURES_HARD: 40,
  /**
   * Abonos in one session. Each costs BOOST_SECONDS of the run's peak Esencia/s ×BOOST_GROWTH per one
   * already bought (session.ts boostCost): a 3-minute run pays for ~5 at its peak; the start wallet
   * (≤ START_ESSENCE_BY_LEVEL max) buys ~6 more at the BOOST_MIN_COST floor before anything grows.
   */
  SESSION_BOOSTS_SOFT: 7,
  SESSION_BOOSTS_HARD: 13,
  /**
   * Esencia an Encargo or objective can pay, as seconds of the current Esencia/s, per session: an
   * Encargo pays at most SIDE_REWARD.sessionMaxSec (20 s), an objective SESSION_OBJECTIVE_SECONDS; a
   * session finishes two or three (main chain, a side one, an objective).
   */
  SESSION_REWARD_SEC: 60,
  /** …and their fixed minimums (essenceMin of the main chain: 100 … 2 000 once; 25 per side Encargo). */
  SESSION_REWARD_FIXED: 10_000,
  SESSION_REWARD_MIN_PER_SESSION: 200,
  /** Encargos and objectives finished in one session (each pays DATOS_PER_ENCARGO Datos). */
  SESSION_ENCARGOS_MAX: 10,
  /** Seconds a session can be stretched (+s per new species, Encargo and Spark). */
  SESSION_BONUS_SEC_MAX: 180,
} as const;

const BEHAVIOR_KINDS = Object.keys(B.BEHAVIOR_MULT).length; // 6
const ACHIEVEMENT_BONUS_MAX = B.ACHIEVEMENTS.reduce((s, a) => s + a.bonus, 0);
const OBJECTIVE_REWARDS = B.OBJECTIVES.reduce((s, o) => s + o.reward, 0);
const EXTINCTION_ESSENCE = B.EXTINCTION_MIN_ESSENCE_TERM ** 2 * B.GENOME_ESSENCE_DIV;
const SYMBIOSIS_GENOME = B.GENOME_COSTS.mutations + B.GENOME_COSTS.symbiosis;
const SAMPLES_PER_SPECIES = Math.max(...Object.values(B.SAMPLES_NEW_SPECIES)) + BEHAVIOR_KINDS * B.SAMPLES_NEW_BEHAVIOR;

/** Levels of a geometric upgrade (cost b·g^n) affordable with `budget` in total. */
function geometricLevels(base: number, growth: number, budget: number, max = Infinity): number {
  if (!(budget > 0)) return 0;
  const l = Math.floor(Math.log(1 + (budget * (growth - 1)) / base) / Math.log(growth) + 1e-9);
  return Math.max(0, Math.min(max, l));
}

/** Levels of a fixed-cost-list upgrade affordable with `budget`. */
function fixedLevels(costs: readonly number[], budget: number): number {
  let sum = 0;
  let l = 0;
  for (const c of costs) {
    sum += c;
    if (sum > budget) break;
    l++;
  }
  return l;
}

/** Upper bound on all essence a run could have spent: earned + start money + objective rewards. */
function essenceBudget(s: RunStats): number {
  const era = Math.max(1, s.era);
  return s.lifetimeEssence + B.START_ESSENCE * era + B.ESSENCE_START_PER_ERA * era * era + OBJECTIVE_REWARDS;
}

/**
 * Laboratorio upgrades reset at every extinction, so inside one Era they are paid from that Era's
 * essence only: E_era + the Era's starting essence + objective rewards (paid once per game).
 */
function eraLabBudget(eraEssence: number, era: number): number {
  return eraEssence + Math.max(B.START_ESSENCE, B.ESSENCE_START_PER_ERA * era) + OBJECTIVE_REWARDS;
}

/**
 * Upper bound on base production (essence/s, before timed buffs) for a run with these totals.
 * Every factor of src/game/economy.ts is maxed, and upgrade levels are bounded by what the run could
 * have afforded. Monotonic in every field, so the bound at the END of an interval holds for all of it.
 */
export function maxBaseEps(s: RunStats, mode: 'hard' | 'soft', labBudget?: number): number {
  const budget = Math.min(essenceBudget(s), labBudget ?? Infinity);
  // Per creature: complexity × behaviour × species × symbiosis.
  const nutrient = geometricLevels(B.NUTRIENT_BASE, B.NUTRIENT_GROWTH, budget, B.NUTRIENT_MAX);
  const comp = B.COMPLEXITY_CAP * (1 + B.NUTRIENT_BONUS * nutrient);
  const affinity = geometricLevels(Math.min(B.AFFINITY_BASE, B.COLONY_AFFINITY_BASE), B.AFFINITY_GROWTH, budget, B.AFFINITY_MAX);
  const behavior =
    (s.behaviorsCount > 0 ? Math.max(...Object.values(B.BEHAVIOR_MULT)) : B.UNCLASSIFIED_MULT) * (1 + B.AFFINITY_BONUS * affinity);
  const cataloguing = fixedLevels(B.CATALOGUING_COSTS, s.speciesCount * SAMPLES_PER_SPECIES);
  const species = s.speciesCount > 0 ? Math.max(...Object.values(B.RARITY_MULT)) * (1 + B.CATALOGUING_BONUS * cataloguing) : 1;
  const symbiosis = s.genome >= SYMBIOSIS_GENOME ? B.SYMBIOSIS_MULT : 1;
  const perCreature = comp * behavior * species * symbiosis;
  // M_global.
  const culture = geometricLevels(B.CULTURE_BASE, B.CULTURE_GROWTH, budget);
  const dish = fixedLevels(B.DISH_COSTS, budget);
  const global =
    Math.pow(1 + B.CULTURE_BONUS, culture) *
    (1 + B.DISH_BONUS * dish) *
    (1 + B.GENOME_SPENT_BONUS * s.genome) *
    (1 + B.SPECIES_MILESTONE_BONUS * Math.floor(s.speciesCount / B.SPECIES_MILESTONE_STEP)) *
    (1 + B.BEHAVIOR_MILESTONE_BONUS * Math.min(BEHAVIOR_KINDS, s.behaviorsCount)) *
    (1 + ACHIEVEMENT_BONUS_MAX);
  const creatures =
    mode === 'hard'
      ? LIMITS.CREATURES_HARD
      : Math.min(LIMITS.CREATURES_HARD, LIMITS.CREATURES_SOFT_BASE + LIMITS.CREATURES_SOFT_PER_DECADE * Math.log10(1 + s.lifetimeEssence));
  return global * perCreature * creatures;
}

/**
 * Ceiling on essence earned at a constant base `eps` over an interval with `playSec` seconds of play
 * inside `wallSec` seconds of real time. Active play: base eps, plus Floración (×BLOOM_MULT for
 * BLOOM_TIME) and a lump (LUMP_SECONDS of production) for every golden spark, which cannot spawn more
 * often than every GOLDEN_INTERVAL[0] s. Away time: OFFLINE_RATE of the base eps. The per-return 24 h
 * offline cap cannot be enforced without session data, so ALL non-playing wall time is counted.
 * With eps = 1 this is the "weighted time" τ used by essenceReachable().
 */
export function maxEssenceGain(eps: number, playSec: number, wallSec: number): number {
  const play = Math.max(0, playSec);
  const away = Math.max(0, wallSec - play);
  const goldens = 1 + play / B.GOLDEN_INTERVAL[0];
  const bloomSec = Math.min(play, B.BLOOM_TIME * goldens);
  const active = eps * (play + (B.BLOOM_MULT - 1) * bloomSec) + goldens * Math.max(B.LUMP_MIN, eps * B.LUMP_SECONDS);
  return active + B.OFFLINE_RATE * eps * away;
}


// ───────────────────────────── sessions cycle ─────────────────────────────

const BEHAVIOR_MULT_MAX = Math.max(...Object.values(B.BEHAVIOR_MULT), B.UNCLASSIFIED_MULT);
const RARITY_MULT_MAX = Math.max(...Object.values(B.RARITY_MULT));
const WORLD_MULT_MAX = Math.max(...WORLDS.map((w) => worldEssenceMult(w.id)));
const ETERNAL = 'eternalLife';

/** Levels of `id` affordable from level 0 with `budget` Datos (the tree's own price rule). */
function treeLevels(id: string, budget: number, max: number): number {
  let sum = 0;
  let l = 0;
  while (l < max) {
    const c = nodeCost(id, l);
    if (!Number.isFinite(c) || sum + c > budget) break;
    sum += c;
    l++;
  }
  return l;
}

/**
 * The best tree a player with `datos` Datos ever earned could own: every finite node maxed (the night at
 * NIGHT_MAX), and Vida eterna — the only endless node, ×1.1 production per level — at the levels those
 * Datos buy on their own. Every effect that raises production only grows with levels, so this is a
 * ceiling for any real tree.
 */
const FINITE_LEVELS: Record<string, number> = Object.fromEntries(TREE_NODES.filter((d) => d.id !== ETERNAL).map((d) => [d.id, d.maxLevel]));
const fxCache = new Map<number, TreeEffects>();
export function maxTreeEffects(datos: number): TreeEffects {
  const def = TREE_NODES.find((d) => d.id === ETERNAL);
  const eternal = def ? treeLevels(ETERNAL, Math.max(0, datos), def.maxLevel) : 0;
  let fx = fxCache.get(eternal);
  if (!fx) {
    fx = treeEffects({ ...FINITE_LEVELS, [ETERNAL]: eternal });
    if (fxCache.size > 256) fxCache.clear();
    fxCache.set(eternal, fx);
  }
  return fx;
}

/** Largest Datos a save with these totals can have earned (session.ts computeDatos, summed and maxed). */
export function maxSessionDatos(s: RunStats, essence = s.lifetimeEssence): number {
  const fx = maxTreeEffects(Infinity);
  const sessions = Math.max(1, s.sessions ?? 0);
  const goldens = maxSessionGoldens(s);
  const sub =
    (essence / C.DATOS_ESSENCE_DIV) * fx.datosNightMult +
    s.speciesCount * fx.datosPerSpecies +
    // Variants: look-alike forms of every world, each counted once ever.
    WORLDS.reduce((a, w) => a + (w.variants?.length ?? 0), 0) * C.DATOS_PER_VARIANT +
    Math.min(Object.keys(B.BEHAVIOR_MULT).length, s.behaviorsCount) * fx.datosPerBehavior +
    sessions * LIMITS.SESSION_ENCARGOS_MAX * C.DATOS_PER_ENCARGO +
    goldens * fx.datosPerGolden +
    sessions * 4 * C.DATOS_PER_RECORD;
  return sub * fx.datosMult + sessions * C.DATOS_MIN;
}

/** Sparks a save could have caught: the first of every session, then one per shortest interval. */
function maxSessionGoldens(s: RunStats, playSec = s.playTimeSec): number {
  const fx = maxTreeEffects(Infinity);
  return Math.max(1, s.sessions ?? 0) + Math.max(0, playSec) / (C.SESSION_GOLDEN_INTERVAL[0] * fx.goldenIntervalMult);
}

/**
 * Upper bound on Esencia/s in the sessions cycle for a save with these totals and `datos` Datos earned:
 * economy.ts computeProduction with every factor at the maxed tree (maxTreeEffects), the best world,
 * behaviour and rarity, Amistad on every creature, Sprint final, the Abonos one session can pay
 * (LIMITS), collection milestones, every achievement and the secrets' +10 %.
 */
export function maxSessionEps(s: RunStats, mode: 'hard' | 'soft', datos = s.datos ?? 0): number {
  const fx = maxTreeEffects(datos);
  const affinity = Math.max(fx.affinity.swim, fx.affinity.still, fx.affinity.colony);
  const perCreature =
    B.COMPLEXITY_CAP * fx.complexityMult * BEHAVIOR_MULT_MAX * (1 + affinity) * RARITY_MULT_MAX * (fx.symbiosis ? C.SYMBIOSIS_TREE_MULT : 1);
  const boosts = mode === 'hard' ? LIMITS.SESSION_BOOSTS_HARD : LIMITS.SESSION_BOOSTS_SOFT;
  const global =
    fx.prodMult *
    WORLD_MULT_MAX *
    (1 + fx.cataloguing) *
    (1 + fx.ecosystem * s.speciesCount) *
    fx.sprintMult *
    Math.pow(C.BOOST_MULT, boosts) *
    (1 + B.SPECIES_MILESTONE_BONUS * Math.floor(s.speciesCount / B.SPECIES_MILESTONE_STEP)) *
    (1 + B.BEHAVIOR_MILESTONE_BONUS * Math.min(Object.keys(B.BEHAVIOR_MULT).length, s.behaviorsCount)) *
    (1 + ACHIEVEMENT_BONUS_MAX) *
    (1 + SECRETS_BONUS_CAP);
  const creatures = mode === 'hard' ? LIMITS.SESSION_CREATURES_HARD : fx.capacity + LIMITS.SESSION_CREATURES_SOFT_EXTRA;
  return perCreature * global * creatures;
}

/**
 * Esencia a sessions save can have earned in `playSec` seconds of play. Production only runs while a
 * session's clock runs, which is inside play time, and nothing is earned away. The rate is the ceiling
 * at the save's Datos (they only grow, so the final ones bound every moment), and those Datos can be at
 * most what the claimed Esencia pays (maxSessionDatos): inflating them does not raise the ceiling.
 * Sparks (≤ SPARK_GIFT_SECONDS × Regalos mejores of Esencia/s each) and Encargo rewards count as extra
 * seconds of the same rate, plus their fixed minimums.
 */
export function sessionEssenceCeiling(s: RunStats, playSec: number, mode: 'hard' | 'soft'): number {
  const fx = maxTreeEffects(Infinity);
  const sessions = Math.max(1, s.sessions ?? 0);
  const goldens = maxSessionGoldens(s, playSec);
  const tau = Math.max(0, playSec) + goldens * C.SPARK_GIFT_SECONDS * fx.goldenRewardMult + sessions * LIMITS.SESSION_REWARD_SEC;
  const fixed = goldens * C.SPARK_GIFT_MIN + sessions * LIMITS.SESSION_REWARD_MIN_PER_SESSION + LIMITS.SESSION_REWARD_FIXED;
  const datos = Math.min(s.datos ?? 0, maxSessionDatos(s));
  return maxSessionEps(s, mode, datos) * tau + fixed;
}

/** Nights the sessions count allows: night N + 1 needs NIGHT_GATES[N − 1].sessions sessions (tree.ts nightInfo). */
function nightsAllowed(sessions: number): number {
  let night = 1;
  while (night < C.NIGHT_MAX) {
    const gate = C.NIGHT_GATES[night - 1] ?? C.NIGHT_GATES[C.NIGHT_GATES.length - 1];
    if (sessions < gate.sessions) break;
    night++;
  }
  return night;
}

/** Absolute rules of a sessions-cycle snapshot (replace the classic prestige arithmetic). */
function checkSessionsAbsolute(s: RunStats, hard: string[], soft: string[]): void {
  const sessions = s.sessions;
  const datos = s.datos;
  if (sessions === undefined || datos === undefined) {
    hard.push('sessions_fields');
    return;
  }
  if (s.era > C.NIGHT_MAX) hard.push('night_max');
  // A night past the session gates is only possible for a classic save migrated with its Era (legacy.ts:
  // the Era becomes the night), and every classic Era past the first needed EXTINCTION_ESSENCE (RF-01b).
  else if (s.era > nightsAllowed(sessions) && s.lifetimeEssence < (s.era - 1) * EXTINCTION_ESSENCE * (1 - 1e-9)) hard.push('night_gate');
  if (s.genome > 0) hard.push('genome_max'); // nothing pays Genome in this cycle
  if (sessions > LIMITS.SESSIONS_BURST + s.playTimeSec / LIMITS.SESSION_MIN_SEC) hard.push('sessions_rate');
  if (datos > maxSessionDatos(s) * LIMITS.ESSENCE_HARD_MARGIN + LIMITS.ESSENCE_SLACK) hard.push('datos_max');
  if (s.epsPeak > maxSessionEps(s, 'hard') * LIMITS.ESSENCE_HARD_MARGIN) hard.push('eps_peak');
  else if (s.epsPeak > maxSessionEps(s, 'soft')) soft.push('eps_peak');
}

/** Esencia over an interval of a sessions save (see checkEssence; no away income in this cycle). */
function checkSessionsEssence(s: RunStats, e0: number, playSec: number, sessionsIn: number, hard: string[], soft: string[]): void {
  const gain = s.lifetimeEssence - e0 - LIMITS.ESSENCE_SLACK;
  if (gain <= 0) return;
  const span = { ...s, sessions: Math.max(1, sessionsIn) };
  if (gain / LIMITS.ESSENCE_HARD_MARGIN > sessionEssenceCeiling(span, playSec, 'hard')) hard.push('essence_rate');
  else if (gain > sessionEssenceCeiling(span, playSec, 'soft')) soft.push('essence_rate');
  // Consistency with the save's own peak: production, Spark gifts and rewards are all seconds of
  // Esencia/s ≤ the peak. Editing the Esencia alone breaks it.
  const fx = maxTreeEffects(Infinity);
  const goldens = maxSessionGoldens(span, playSec);
  const byPeak =
    s.epsPeak * (Math.max(0, playSec) + goldens * C.SPARK_GIFT_SECONDS * fx.goldenRewardMult + span.sessions! * LIMITS.SESSION_REWARD_SEC) +
    goldens * C.SPARK_GIFT_MIN +
    span.sessions! * LIMITS.SESSION_REWARD_MIN_PER_SESSION +
    LIMITS.SESSION_REWARD_FIXED;
  if (gain > byPeak * LIMITS.PEAK_MARGIN && !hard.includes('essence_rate')) soft.push('essence_peak');
}

function playTol(wallSec: number): number {
  return LIMITS.PLAYTIME_TOL_SEC + LIMITS.PLAYTIME_TOL_FRAC * Math.max(0, wallSec);
}

/** Rules that need no history: each holds for any single snapshot of a legitimate save. */
function checkAbsolute(s: RunStats, now: number, hard: string[], soft: string[]): void {
  if (s.createdAt > now + MAX_CLOCK_SKEW_MS) hard.push('created_future');
  if (s.createdAt < LIMITS.GAME_EPOCH_MS) hard.push('created_epoch');
  const lifeSec = Math.max(0, (now - s.createdAt) / 1000);
  if (s.playTimeSec > lifeSec + playTol(lifeSec)) hard.push('playtime_wall');
  if (s.eraEssence > s.lifetimeEssence * (1 + 1e-9) + 1) hard.push('era_essence');
  if (s.era < 1) hard.push('era_min');
  if (s.behaviorsCount > BEHAVIOR_KINDS) hard.push('behaviors_max');
  if (s.speciesCount > LIMITS.SPECIES_HARD_MAX) hard.push('species_max');
  const playH = s.playTimeSec / 3600;
  if (s.seeds > LIMITS.SEEDS_BURST + LIMITS.SEEDS_PER_SEC * s.playTimeSec) hard.push('seeds_rate');
  if (s.speciesCount > LIMITS.SPECIES_HARD_BURST + LIMITS.SPECIES_HARD_PER_HOUR * playH) hard.push('species_rate');
  else if (s.speciesCount > LIMITS.SPECIES_SOFT_BURST + LIMITS.SPECIES_SOFT_PER_HOUR * playH) soft.push('species_rate');
  if (s.cycle === 'sessions') {
    checkSessionsAbsolute(s, hard, soft);
    return;
  }
  // Classic Era loop. Prestige arithmetic (doc §5/§10): every finished Era needed E_era ≥ 250 000 and paid ≥ 5 Genome;
  // total Genome ≤ Σ floor(sqrt(E_i/1e4)) + 2·species + behaviours ≤ sqrt(n·ΣE_i/1e4) + … (Cauchy–Schwarz).
  const done = s.era - 1;
  if (s.lifetimeEssence < done * EXTINCTION_ESSENCE * (1 - 1e-9)) hard.push('era_requirement');
  if (s.genome < done * B.EXTINCTION_MIN_ESSENCE_TERM) hard.push('genome_min');
  const genomeMax =
    Math.sqrt((done * s.lifetimeEssence) / B.GENOME_ESSENCE_DIV) +
    B.GENOME_PER_SPECIES * s.speciesCount +
    B.GENOME_PER_BEHAVIOR * Math.min(BEHAVIOR_KINDS, s.behaviorsCount) +
    1;
  if (s.genome > genomeMax) hard.push('genome_max');
  if (done > 1 + s.playTimeSec / LIMITS.ERA_MIN_SEC) hard.push('era_rate');
  // Peak production (Floración included) cannot beat the production ceiling × BLOOM_MULT.
  if (s.epsPeak > maxBaseEps(s, 'hard') * B.BLOOM_MULT * LIMITS.ESSENCE_HARD_MARGIN) hard.push('eps_peak');
  else if (s.epsPeak > maxBaseEps(s, 'soft') * B.BLOOM_MULT) soft.push('eps_peak');
}

/**
 * Largest lifetime essence reachable from `e0` after `tau` weighted seconds, integrating
 * dE/dτ = maxBaseEps(E): production grows with essence (upgrades get affordable), so a constant-rate
 * bound taken at the END state would let a claimed number raise its own ceiling. The ODE is
 * autonomous, so the order of play / away phases does not matter, only τ = Σ weights (see
 * maxEssenceGain). Each step uses the rate a little beyond the step end (the rate only grows), so the
 * result is an upper bound. Stops early once `stopAt` is reached.
 */
export function essenceReachable(
  s: RunStats,
  e0: number,
  tau: number,
  mode: 'hard' | 'soft',
  stopAt = Infinity,
  labBudgetAt?: (e: number) => number,
): number {
  const f = (e: number) => maxBaseEps({ ...s, lifetimeEssence: e }, mode, labBudgetAt?.(e));
  let e = Math.max(0, e0);
  let left = Math.max(0, tau);
  for (let i = 0; i < 100_000 && left > 0; i++) {
    const r0 = f(e);
    // Steps that grow E by ~2 %: a handful of thousands even for astronomically large totals.
    const h = Math.min(left, Math.max(1e-6, (0.02 * (e + 1)) / r0));
    e += f(e + r0 * h * 1.05 + 1) * h;
    left -= h;
    if (e >= stopAt) return e;
  }
  return left > 0 ? Infinity : e; // ran out of steps: do not judge
}

/**
 * Essence check over an interval starting at `e0` (0 for a whole run). `eraStart` (E_era at the start of
 * an interval that stays inside one Era) enables the tighter per-Era upgrade budget.
 */
function checkEssence(
  s: RunStats,
  e0: number,
  playSec: number,
  wallSec: number,
  hard: string[],
  soft: string[],
  eraStart?: number,
): void {
  const gain = s.lifetimeEssence - e0 - LIMITS.ESSENCE_SLACK;
  if (gain <= 0) return;
  // 1. Physics: what the rules allow at all.
  const tau = maxEssenceGain(1, playSec, wallSec);
  const lab = eraStart === undefined ? undefined : (e: number) => eraLabBudget(eraStart + (e - e0), s.era);
  const needHard = e0 + gain / LIMITS.ESSENCE_HARD_MARGIN;
  if (essenceReachable(s, e0, tau, 'hard', needHard, lab) < needHard) hard.push('essence_rate');
  else if (essenceReachable(s, e0, tau, 'soft', e0 + gain, lab) < e0 + gain) soft.push('essence_rate');
  // 2. Consistency with the run's own peak production (buffs included). Every source is bounded by it:
  //    production ≤ peak, a golden lump = base eps × LUMP_SECONDS ≤ peak × LUMP_SECONDS (or LUMP_MIN),
  //    offline = OFFLINE_RATE × average base eps × away ≤ OFFLINE_RATE × peak × away (server-measured).
  //    Editing essence alone, or the "clock forward" offline trick, breaks it.
  const play = Math.max(0, playSec);
  const goldens = 1 + play / B.GOLDEN_INTERVAL[0];
  const away = Math.max(0, wallSec - play);
  const byPeak =
    s.epsPeak * (play + goldens * B.LUMP_SECONDS + B.OFFLINE_RATE * away) + goldens * B.LUMP_MIN;
  if (gain > byPeak * LIMITS.PEAK_MARGIN && !hard.includes('essence_rate')) soft.push('essence_peak');
}

function integrityReasons(r: IntegrityReport | undefined, soft: string[]): void {
  if (!r) return;
  if (r.speedHack) soft.push('integrity_speed');
  if (r.clockRollback) soft.push('integrity_clock');
  if (r.tampered) soft.push('integrity_tamper');
  if (r.debug) soft.push('integrity_debug');
}

/**
 * Judge a submission against the player's previous accepted one (null = first submission).
 * `now` is the server clock in ms.
 */
export function validateSubmission(
  prev: Baseline | null,
  s: RunStats & { clientTime?: number },
  now: number,
  integrity?: IntegrityReport,
): ValidationResult {
  const hard: string[] = [];
  const soft: string[] = [];
  const sessionsCycle = s.cycle === 'sessions';
  checkAbsolute(s, now, hard, soft);
  integrityReasons(integrity, soft);

  const sameRun = prev !== null && prev.createdAt === s.createdAt;
  if (!sameRun) {
    // First submission, a reset (newer save) or an imported save: judge the whole run from its
    // creation. Importing an OLDER save over a newer one is the usual path for edited saves → flag.
    if (prev && s.createdAt < prev.createdAt) soft.push('run_older');
    const wallSec = Math.max(0, (now - s.createdAt) / 1000);
    if (sessionsCycle) checkSessionsEssence(s, 0, s.playTimeSec, s.sessions ?? 0, hard, soft);
    else checkEssence(s, 0, s.playTimeSec, wallSec, hard, soft);
  } else {
    const p = prev!;
    type Counter = 'lifetimeEssence' | 'genome' | 'speciesCount' | 'behaviorsCount' | 'era' | 'playTimeSec' | 'seeds' | 'epsPeak';
    const regress = (k: Counter) => {
      if (s[k] < p[k] * (1 - 1e-12)) hard.push(`regress_${k}`);
    };
    for (const k of ['lifetimeEssence', 'genome', 'speciesCount', 'behaviorsCount', 'era', 'playTimeSec', 'seeds', 'epsPeak'] as const) regress(k);
    // A sessions save never goes back to the classic loop, and its counters only grow.
    if (p.cycle === 'sessions' && !sessionsCycle) hard.push('cycle_back');
    if (sessionsCycle && p.cycle === 'sessions') {
      for (const k of ['sessions', 'datos'] as const) if ((s[k] ?? 0) < (p[k] ?? 0) * (1 - 1e-12)) hard.push(`regress_${k}`);
    }
    const wallSec = Math.max(0, (now - p.at) / 1000);
    const playSec = Math.max(0, s.playTimeSec - p.playTimeSec);
    // Speed hacks make the game clock (play time) run faster than real time between two submissions.
    if (playSec > wallSec + playTol(wallSec)) hard.push('playtime_speed');
    const eff = Math.min(playSec, wallSec + playTol(wallSec));
    if (!sessionsCycle && s.era - p.era > 1 + eff / LIMITS.ERA_MIN_SEC) hard.push('era_rate');
    // Sessions finished since the last accepted submission (+1: one may have been under way then).
    const dSessions = sessionsCycle ? Math.max(0, (s.sessions ?? 0) - (p.cycle === 'sessions' ? (p.sessions ?? 0) : 0)) : 0;
    if (sessionsCycle && dSessions > LIMITS.SESSIONS_BURST + eff / LIMITS.SESSION_MIN_SEC) hard.push('sessions_rate');
    const dSpecies = s.speciesCount - p.speciesCount;
    const dH = eff / 3600;
    if (dSpecies > LIMITS.SPECIES_HARD_BURST + LIMITS.SPECIES_HARD_PER_HOUR * dH) hard.push('species_rate');
    else if (dSpecies > LIMITS.SPECIES_SOFT_BURST + LIMITS.SPECIES_SOFT_PER_HOUR * dH) soft.push('species_rate');
    if (s.seeds - p.seeds > LIMITS.SEEDS_BURST + LIMITS.SEEDS_PER_SEC * eff) hard.push('seeds_rate');
    if (sessionsCycle) checkSessionsEssence(s, p.cycle === 'sessions' ? p.lifetimeEssence : 0, eff, dSessions + 1, hard, soft);
    else checkEssence(s, p.lifetimeEssence, eff, wallSec, hard, soft, s.era === p.era ? p.eraEssence : undefined);
  }
  const uniq = (a: string[]) => [...new Set(a)];
  const h = uniq(hard);
  const so = uniq(soft).filter((x) => !h.includes(x));
  return { verdict: h.length ? 'reject' : so.length ? 'flag' : 'accept', hard: h, soft: so };
}

/** Client side (save import): judge a lone snapshot as if it were a first submission. */
export function plausibleSnapshot(s: RunStats, now: number): ValidationResult {
  return validateSubmission(null, s, now);
}
