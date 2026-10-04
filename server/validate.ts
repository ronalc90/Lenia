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
 */
import * as B from '../src/game/balance.js';
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
  // Prestige arithmetic (doc §5/§10): every finished Era needed E_era ≥ 250 000 and paid ≥ 5 Genome;
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
  const playH = s.playTimeSec / 3600;
  if (done > 1 + s.playTimeSec / LIMITS.ERA_MIN_SEC) hard.push('era_rate');
  if (s.seeds > LIMITS.SEEDS_BURST + LIMITS.SEEDS_PER_SEC * s.playTimeSec) hard.push('seeds_rate');
  if (s.speciesCount > LIMITS.SPECIES_HARD_BURST + LIMITS.SPECIES_HARD_PER_HOUR * playH) hard.push('species_rate');
  else if (s.speciesCount > LIMITS.SPECIES_SOFT_BURST + LIMITS.SPECIES_SOFT_PER_HOUR * playH) soft.push('species_rate');
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
  checkAbsolute(s, now, hard, soft);
  integrityReasons(integrity, soft);

  const sameRun = prev !== null && prev.createdAt === s.createdAt;
  if (!sameRun) {
    // First submission, a reset (newer save) or an imported save: judge the whole run from its
    // creation. Importing an OLDER save over a newer one is the usual path for edited saves → flag.
    if (prev && s.createdAt < prev.createdAt) soft.push('run_older');
    const wallSec = Math.max(0, (now - s.createdAt) / 1000);
    checkEssence(s, 0, s.playTimeSec, wallSec, hard, soft);
  } else {
    const p = prev!;
    const regress = (k: keyof RunStats) => {
      if (s[k] < p[k] * (1 - 1e-12)) hard.push(`regress_${k}`);
    };
    for (const k of ['lifetimeEssence', 'genome', 'speciesCount', 'behaviorsCount', 'era', 'playTimeSec', 'seeds', 'epsPeak'] as const) regress(k);
    const wallSec = Math.max(0, (now - p.at) / 1000);
    const playSec = Math.max(0, s.playTimeSec - p.playTimeSec);
    // Speed hacks make the game clock (play time) run faster than real time between two submissions.
    if (playSec > wallSec + playTol(wallSec)) hard.push('playtime_speed');
    const eff = Math.min(playSec, wallSec + playTol(wallSec));
    if (s.era - p.era > 1 + eff / LIMITS.ERA_MIN_SEC) hard.push('era_rate');
    const dSpecies = s.speciesCount - p.speciesCount;
    const dH = eff / 3600;
    if (dSpecies > LIMITS.SPECIES_HARD_BURST + LIMITS.SPECIES_HARD_PER_HOUR * dH) hard.push('species_rate');
    else if (dSpecies > LIMITS.SPECIES_SOFT_BURST + LIMITS.SPECIES_SOFT_PER_HOUR * dH) soft.push('species_rate');
    if (s.seeds - p.seeds > LIMITS.SEEDS_BURST + LIMITS.SEEDS_PER_SEC * eff) hard.push('seeds_rate');
    checkEssence(s, p.lifetimeEssence, eff, wallSec, hard, soft, s.era === p.era ? p.eraEssence : undefined);
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
