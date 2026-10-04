/**
 * Bioluma game & economy core. Pure TypeScript (no DOM): the integrator feeds it detector
 * reports and real time, applies the SeedSpecs it returns/emits, and renders view().
 *
 * Wiring (integrator):
 *  - every frame: game.tick(realDt, reportOrNull); sim.advance(stepsPerFrame * game.speed) unless game.isPaused
 *  - bus 'calibrationChanged' → sim.setParams(game.simParams)
 *  - bus 'dishSeed' → specs.forEach(sim.seed);  'dishClear' → sim.clear() (+ detector.reset())
 *  - after every tick: for (const r of game.takePortraitRequests()) game.setSpeciesPortrait(r.speciesId,
 *    sim.capture(r.x, r.y, r.size), r.creatureId) — the game keeps the best capture of each species
 *  - game.setGridSize(sim.gridW, sim.gridH) after creating the dish
 */
import type { Bus, GameEvents } from '../core/bus';
import type {
  AchievementView,
  Behavior,
  BuyQty,
  CalibrationView,
  Creature,
  CreatureView,
  DetectorReport,
  GameActions,
  GameView,
  GenomeNodeView,
  JournalEntryView,
  LeniaParams,
  Pattern,
  Rarity,
  SeedPriceView,
  SeedSpec,
  Settings,
  SpeciesView,
  Text,
  UpgradeView,
  YieldView,
} from '../core/types';
import { CATALOG_REFS } from '../detect/catalogRefs';
import { matchSignature, SIG, signatureDistance, SPECIES_MATCH_THRESHOLD } from '../detect/signature';
import {
  catalogGroup,
  catalogPortrait,
  colorFamily,
  commonName,
  formatLatin,
  isolateCreature,
  latinName,
  normalizePortrait,
  portraitScore,
  sameCatalogSpecies,
  SHAPE_LABELS,
  shapeKind,
  speciesHue,
  tightSquare,
  type ShapeKind,
} from '../species';
import { CATALOG, catalogByCode } from '../sim/catalog';
import * as B from './balance';
import {
  ACHIEVEMENT_TEXT,
  achievementReward,
  effectText,
  GENOME_TEXT,
  JOURNAL,
  objectiveText,
  TEXT,
  UPGRADE_TEXT,
} from './content';
import {
  autoSeedInterval,
  costForQty,
  essenceTerm,
  EXTINCTION_ESSENCE_NEEDED,
  GENOME_BY_ID,
  GENOME_NODES,
  genomeGain,
  maxAffordable,
  UPGRADE_BY_ID,
  UPGRADES,
  type UnlockCtx,
  type UpgradeDef,
} from './defs';
import { computeProduction, wrapDist, type YieldDetail } from './economy';
import { clipGraphemes } from './format';
import { averageEps, offlineEssence } from './offline';
import {
  cropPattern,
  dequantizePattern,
  mutatePattern,
  nearestCatalog,
  paramDistance,
  pickSporeTemplate,
  quantizePattern,
  resamplePattern,
  ringsEqual,
  scaledTemplate,
} from './seeding';
import {
  baseCalibration,
  base64ToUtf8,
  defaultState,
  deserializeState,
  serializeState,
  utf8ToBase64,
  type GameState,
  type SeedShape,
  type SpeciesState,
} from './state';

/** Reference signature of a catalog species (default: the detector's CATALOG_REFS). */
export interface CatalogSignature {
  code: string;
  name: string;
  viable?: boolean;
  signature: number[];
  behavior?: string | null;
  complexity?: number;
  mu: number;
  sigma: number;
  R: number;
}

export interface GameDeps {
  bus: Bus<GameEvents>;
  /** Wall clock in ms (brush strokes, createdAt). */
  now?: () => number;
  /** Uniform [0,1) random source. */
  rng?: () => number;
  /** Override the catalog signatures (tests / balance bot). */
  catalogSignatures?: CatalogSignature[];
  /** Dish size in cells until setGridSize is called. */
  grid?: { w: number; h: number };
}

/** A capture the game wants: the integrator answers with setSpeciesPortrait(speciesId, sim.capture(x, y, size), creatureId). */
export interface PortraitRequest {
  speciesId: string;
  creatureId: number;
  /** Creature centroid in grid cells at the latest report. */
  x: number;
  y: number;
  /** Capture square side in cells. */
  size: number;
}

export interface Game {
  readonly actions: GameActions;
  view(): GameView;
  /** realDt seconds since last tick; report = latest detector report (or null if none new). */
  tick(realDt: number, report: DetectorReport | null): void;
  /** Current Lenia params the dish must use (calibration). Same object until it changes. */
  readonly simParams: LeniaParams;
  /** Steps-per-frame multiplier chosen by the player (Incubadora). */
  readonly speed: number;
  /**
   * A captured crop of a creature of the species (answer to a PortraitRequest; `creatureId` lets the
   * game judge how representative it is). The game keeps the best capture: clean (nothing else in
   * the square, not cut by the crop) and close to the species signature. Legacy calls without
   * `creatureId` right after 'speciesNew' are attributed to the founder.
   */
  setSpeciesPortrait(speciesId: string, p: Pattern, creatureId?: number): void;
  /** Captures the game wants right now (drained by the call). See PortraitRequest. */
  takePortraitRequests(): PortraitRequest[];
  /**
   * An outside production multiplier (e.g. a secret's reward), shown in the multiplier breakdown.
   * `mult` 1 (or ≤ 0) removes it. Not saved: the owner re-applies it after loading.
   */
  setBonus(id: string, name: Text, mult: number): void;
  serialize(): string;
  exportString(): string;
  importString(s: string): boolean;
  /** Apply offline progress for `seconds` away (called on load). Emits offlineReturn. */
  applyOffline(seconds: number): void;
  reset(): void;
  /** Pause stops production and game timers. */
  isPaused: boolean;
  /** Dish size in cells (auto-seeder spots, golden spark drift). */
  setGridSize(w: number, h: number): void;
  /** Read-only access to the raw state (tests, balance bot, debug overlay). */
  readonly state: Readonly<GameState>;
}

interface Golden {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export function createGame(deps: GameDeps, save?: string): Game {
  const bus = deps.bus;
  const now = deps.now ?? (() => Date.now());
  const rng = deps.rng ?? Math.random;
  const catalogSigs: CatalogSignature[] = (deps.catalogSignatures ?? CATALOG_REFS).filter(
    (e) => e && e.viable !== false && Array.isArray(e.signature) && e.signature.length > 0,
  );
  let grid = { ...(deps.grid ?? B.DEFAULT_GRID) };

  let s: GameState = (save && loadAny(save)) || defaultState(now());
  let paused = false;

  // ── Transient (not saved) ──
  let creatures: Creature[] = [];
  const creatureSpecies = new Map<number, string>();
  /** Stable creatures still waiting to be matched/registered as a species (rate-limited). */
  const unassigned = new Set<number>();
  /** Token bucket for NEW species registrations (see balance SPECIES_NEW_*). */
  let newSpeciesTokens: number = B.SPECIES_NEW_BURST;
  /** The dish is flooded (too much matter): nothing pays, nothing registers. */
  let overgrown = false;
  /** Active seconds the dish has been flooded (it cleans itself after OVERGROWN_AUTO_CLEAN). */
  let overgrownFor = 0;
  const knownIds = new Set<number>();
  const lastBehavior = new Map<number, Behavior | null>();
  let perCreature = new Map<number, number>();
  /** Why each paying creature pays what it pays (from the last economic tick). */
  let perDetail = new Map<number, YieldDetail>();
  /** Body kind of each species' portrait (cleared with the display portrait). */
  const shapeCache = new Map<string, ShapeKind>();
  const incomeAcc = new Map<number, { amount: number; t: number }>();
  let baseEps = 0; // production before timed buffs
  let eps = 0; // production including buffs
  let econAcc = 0;
  let golden: Golden | null = null;
  /** Seeds placed lately (t = seconds left in memory) and the radius of matter they stamped. */
  let recentSeeds: { x: number; y: number; t: number; r: number }[] = [];
  /** State of each creature in the previous report (a 'died' creature that was exploded dissolved). */
  let lastStates = new Map<number, Creature['state']>();
  let pendingMutations: { x: number; y: number; parent: string; t: number }[] = [];
  let brush: { x: number; y: number; lastMs: number } | null = null;
  let saturatedToastT = 0;
  let sinceNewSpecies = 0;
  const portraitCache = new Map<string, Pattern | null>();
  /** Display portraits (catalog pattern or the normalised best capture), same object until it changes. */
  const displayCache = new Map<string, Pattern | null>();
  /** Score of the stored portrait of each species (this session). */
  const portraitBest = new Map<string, number>();
  /** Portrait captures requested per species this session. */
  const portraitCaptures = new Map<string, number>();
  let portraitQueue: PortraitRequest[] = [];
  /** Creatures to re-capture later (report step at which to ask), while their species' portrait is not good. */
  const portraitWatch = new Map<number, { speciesId: string; at: number }>();
  /** Founder of the latest registration (attributes legacy setSpeciesPortrait calls). */
  let lastFounder: { speciesId: string; creatureId: number } | null = null;
  let reportStep = 0;
  /** Outside multipliers (secrets…), see Game.setBonus. */
  const bonuses = new Map<string, { name: Text; mult: number }>();
  /** Creatures that were stable in the latest report (a division only counts from a real creature). */
  let stableIds = new Set<number>();
  let params = makeParams();

  // ───────────────────────────── helpers ─────────────────────────────

  function loadAny(str: string): GameState | null {
    const t = str.trim();
    if (t.startsWith(B.EXPORT_PREFIX)) {
      try {
        return deserializeState(base64ToUtf8(t.slice(B.EXPORT_PREFIX.length)));
      } catch {
        return null;
      }
    }
    return deserializeState(t);
  }

  function sanitizeLoaded(): void {
    if (!speeds().includes(s.speed)) s.speed = 1;
    if (!shapes().includes(s.shape)) s.shape = 'blob';
    // Saves from before species identity: freeze a hue and a Latin name now (deterministic).
    for (const sp of s.species) {
      if (sp.hue === undefined) sp.hue = speciesHue(sp.signature, sp.catalogCode, takenHues(sp));
      if (!sp.catalogCode && !sp.latin) sp.latin = newLatin(sp.signature, sp.behavior, sp.rings.length, sp);
      if (!sp.shape) sp.shape = shapeKind(sp.catalogCode ? catalogPortrait(sp.catalogCode) : portraitOf(sp), sp.signature);
      if (!sp.common) sp.common = commonName(sp.shape as ShapeKind, sp.behavior, sp.hue, takenCommon(sp));
    }
  }

  function makeParams(): LeniaParams {
    const c = s.calib;
    return { R: c.R, rings: [...c.rings], mu: c.mu, sigma: c.sigma, dt: c.dt };
  }

  function lang(): 'es' | 'en' {
    return s.settings.lang;
  }

  const level = (id: string): number => s.upgrades[id] ?? 0;
  const has = (node: string): boolean => s.nodes.includes(node);
  const stableCount = (): number => creatures.reduce((n, c) => n + (c.state === 'stable' ? 1 : 0), 0);
  const aliveCount = (): number => creatures.reduce((n, c) => n + (c.state === 'stable' || c.state === 'born' ? 1 : 0), 0);
  const speciesById = (id: string | undefined): SpeciesState | undefined => (id ? s.species.find((sp) => sp.id === id) : undefined);

  function speeds(): number[] {
    return B.INCUBATOR_SPEEDS[Math.min(level('incubator'), B.INCUBATOR_SPEEDS.length - 1)];
  }

  function shapes(): SeedShape[] {
    const d = level('dropper');
    const out: SeedShape[] = ['blob'];
    if (d >= 4) out.push('ring');
    if (d >= 5) out.push('noise');
    return out;
  }

  function achievementBonus(): number {
    let sum = 0;
    for (const a of B.ACHIEVEMENTS) if (s.achievements.includes(a.id)) sum += a.bonus;
    return sum;
  }

  /** The factors of M_global, for the multiplier breakdown (QA3 #13). Their product is globalMult(). */
  function globalParts(): { id: string; name: Text; mult: number }[] {
    const parts = [
      { id: 'culture', name: UPGRADE_TEXT.culture.name, mult: Math.pow(1 + B.CULTURE_BONUS, level('culture')) },
      { id: 'dish', name: UPGRADE_TEXT.dish.name, mult: 1 + B.DISH_BONUS * level('dish') },
      { id: 'genome', name: TEXT.multGenome, mult: (1 + B.GENOME_SPENT_BONUS * s.genomeSpent) * (1 + B.GENOME_UNSPENT_BONUS * s.genome) },
      { id: 'collection', name: TEXT.multCollection, mult: 1 + B.SPECIES_MILESTONE_BONUS * Math.floor(s.species.length / B.SPECIES_MILESTONE_STEP) },
      { id: 'behaviors', name: TEXT.multBehaviors, mult: 1 + B.BEHAVIOR_MILESTONE_BONUS * s.behaviorsSeen.length },
      { id: 'achievements', name: TEXT.multAchievements, mult: 1 + achievementBonus() },
    ];
    for (const [id, b] of bonuses) parts.push({ id, name: b.name, mult: b.mult });
    return parts;
  }

  /** M_global: upgrades, Genome (spent and unspent), collection milestones, achievements, outside bonuses. */
  function globalMult(): number {
    return globalParts().reduce((m, p) => m * p.mult, 1);
  }

  function buffMult(): number {
    return s.buffs.reduce((m, b) => m * b.mult, 1);
  }

  function speciesMult(sp: SpeciesState): number {
    return B.RARITY_MULT[sp.rarity] * (1 + B.CATALOGUING_BONUS * level('cataloguing'));
  }

  function behaviorMult(b: Behavior | null): number {
    const base = b ? B.BEHAVIOR_MULT[b] : B.UNCLASSIFIED_MULT;
    let aff = 0;
    if (b === 'swimmer' || b === 'spinner') aff = level('swimAffinity');
    else if (b === 'divider' || b === 'colony') aff = level('colonyAffinity');
    else aff = level('sessileAffinity'); // still, pulsing, unclassified (pays as still)
    return base * (1 + B.AFFINITY_BONUS * aff);
  }

  /** Seeds placed in the last SEED_PENDING_WINDOW s that the detector has not picked up yet. */
  function pendingSeeds(): number {
    let n = 0;
    for (const r of recentSeeds) {
      if (B.RECENT_SEED_MEMORY - r.t > B.SEED_PENDING_WINDOW) continue;
      const seen = creatures.some((c) => c.state !== 'dead' && wrapDist(c.x, c.y, r.x, r.y, grid.w, grid.h) < s.calib.R);
      if (!seen) n++;
    }
    return n;
  }

  function freeSlots(): number {
    return B.DISH_FREE_SLOTS[Math.min(level('dish'), B.DISH_FREE_SLOTS.length - 1)];
  }

  /**
   * c0·(r/R)²·(1 + crowd·n_alive) · saturation^max(0, n_sat − free slots); r in units of R.
   * n_alive = stable + newborn (+ seeds the detector has not seen yet); n_sat ignores the first
   * SEED_NURSERY_FREE newborns, so a short burst is fine but spamming seeds cannot dodge the price.
   */
  /** The seed price split into its factors (shown to the player by the price explainer). */
  function seedPrice(): SeedPriceView {
    const stable = stableCount();
    const young = aliveCount() - stable + pendingSeeds();
    const alive = stable + young;
    const used = stable + Math.max(0, young - B.SEED_NURSERY_FREE);
    const slots = freeSlots();
    return {
      base: B.SEED_C0 * B.SEED_RADIUS * B.SEED_RADIUS,
      alive,
      crowdMult: 1 + B.SEED_CROWD * alive,
      freeSlots: slots,
      used,
      satMult: Math.pow(B.SEED_SATURATION_GROWTH, Math.min(B.SEED_SATURATION_MAX_STEPS, Math.max(0, used - slots))),
      bigMult: (B.SEED_BIG_RADIUS * B.SEED_BIG_RADIUS) / (B.SEED_RADIUS * B.SEED_RADIUS),
      freeSeeds: s.charges.free,
    };
  }

  function seedCost(radiusFactor = B.SEED_RADIUS): number {
    const p = seedPrice();
    return B.SEED_C0 * radiusFactor * radiusFactor * p.crowdMult * p.satMult;
  }

  function helpBias(): number {
    if (s.eraHadStable || s.eraTime < B.SEED_HELP_DELAY) return 0;
    const steps = 1 + Math.floor((s.eraTime - B.SEED_HELP_DELAY) / B.SEED_HELP_INTERVAL);
    return Math.min(B.SEED_HELP_MAX, steps * B.SEED_HELP_STEP);
  }

  /** Template bias of a random seed of `shape` right now. */
  function seedBias(shape: SeedShape): number {
    const d = Math.min(level('dropper'), B.SEED_BIAS_GOTERO.length - 1);
    const b = B.SEED_BIAS_BASE + B.SEED_BIAS_GOTERO[d] + B.SEED_BIAS_STABILIZER * level('stabilizer') + helpBias();
    return Math.min(B.SEED_BIAS_MAX, b) * B.SHAPE_FACTORS[shape].bias;
  }

  function seedNoise(shape: SeedShape): number {
    const d = Math.min(level('dropper'), B.SEED_NOISE_GOTERO.length - 1);
    const n = Math.max(B.SEED_NOISE_MIN, B.SEED_NOISE_GOTERO[d] - B.SEED_NOISE_STABILIZER * level('stabilizer'));
    return Math.min(1, n * B.SHAPE_FACTORS[shape].noise);
  }

  function pipetteTime(): number {
    return B.PIPETTE_TIME[Math.min(level('fastPipette'), B.PIPETTE_TIME.length - 1)];
  }
  const pipetteReady = (): boolean => s.pipetteTimer >= pipetteTime();
  function pipetteWanted(): boolean {
    return s.essence < seedCost() && aliveCount() === 0 && s.charges.free === 0 && recentSeeds.length === 0;
  }

  const archiveInterval = (): number => B.ARCHIVE_INTERVAL[Math.min(level('archive'), B.ARCHIVE_INTERVAL.length - 1)];
  const archiveReady = (): boolean => level('archive') > 0 && s.archiveTimer >= archiveInterval();

  function addEssence(x: number, countsForEra = true): void {
    if (!(x > 0)) return;
    s.essence += x;
    s.stats.totalEssence += x;
    if (countsForEra) s.eraEssence += x;
  }

  function toast(text: Text, kind: 'info' | 'good' | 'warn' | 'bad' = 'info'): void {
    bus.emit('toast', { text, kind });
  }

  function unlockJournal(id: string): void {
    if (s.journal.some((j) => j.id === id)) return;
    const entry = JOURNAL.find((j) => j.id === id);
    if (!entry) return;
    s.journal.push({ id, read: false });
    bus.emit('journalNew', { id, text: entry.text });
  }

  function speciesName(sp: SpeciesState, l = lang()): string {
    if (sp.customName) return sp.customName;
    // The Spanish/English common name first (owner: names in Spanish, clearly different); the
    // catalog or procedural Latin name is the scientific line (SpeciesView.scientificName).
    const base = sp.common?.[l] ?? sp.catalogName ?? sp.latin ?? TEXT.specimen(sp.n)[l];
    return sp.variantOf ? base + TEXT.variantSuffix[l] : base;
  }

  /** Hues already used by other species of the bestiary (new hues keep apart from them). */
  function takenHues(except?: SpeciesState): number[] {
    const out: number[] = [];
    for (const x of s.species) if (x !== except && typeof x.hue === 'number') out.push(x.hue);
    return out;
  }

  /** Common names (both languages) and custom names already used by other species. */
  function takenCommon(except?: SpeciesState): string[] {
    const out: string[] = [];
    for (const x of s.species) {
      if (x === except) continue;
      if (x.common) out.push(x.common.es, x.common.en);
      if (x.customName) out.push(x.customName);
    }
    return out;
  }

  /** A procedural Latin name not used by any other species of the bestiary. */
  function newLatin(sig: number[], behavior: Behavior | null, rings: number, except?: SpeciesState): string {
    const taken: string[] = [];
    for (const x of s.species) {
      if (x === except) continue;
      if (x.latin) taken.push(x.latin);
      if (x.customName) taken.push(x.customName);
    }
    return formatLatin(latinName(sig, behavior, { rings, taken }));
  }

  // ───────────────────────────── calibration ─────────────────────────

  function ranges() {
    return B.CALIBRATOR_RANGES[Math.min(level('calibrator'), B.CALIBRATOR_RANGES.length - 1)];
  }

  function ringOptions(): number[][] | null {
    const opts = B.RING_PRESETS.filter((p) => p.node === null || has(p.node)).map((p) => [...p.rings]);
    return opts.length > 1 ? opts : null;
  }

  function calibrationChanged(): void {
    params = makeParams();
    const c = s.calib;
    bus.emit('calibrationChanged', { mu: c.mu, sigma: c.sigma, R: c.R, dt: c.dt });
  }

  const clamp = (v: number, r: [number, number]) => Math.min(r[1], Math.max(r[0], v));

  // ───────────────────────────── seeding ─────────────────────────────

  /**
   * Spore template: one of the viable catalog species around the calibration (weighted by
   * closeness, see sporeCandidates) so seeds grow into varied real forms. Guaranteed seeds
   * (Mutágeno) use the nearest species, the surest one.
   */
  function sporePattern(guaranteed: boolean): Pattern {
    const known = new Set<string>();
    for (const x of s.species) if (x.catalogCode) known.add(catalogGroup(x.catalogCode));
    // Varied templates only once the first species is in the bestiary: a fresh dish starts with the
    // surest, smallest form (bigger ones like Synorbium add swimmers that collide into a maze).
    const varied = !guaranteed && s.species.length >= B.SPORE_VARIETY_AFTER_SPECIES;
    const e = varied ? pickSporeTemplate(s.calib, rng, known) : nearestCatalog(s.calib);
    return scaledTemplate(e, s.calib.R);
  }

  /** Spores still forming: newborn creatures plus seeds the detector has not reported yet. */
  function forming(): number {
    let n = pendingSeeds();
    for (const c of creatures) if (c.state === 'born') n++;
    return n;
  }

  /** The nursery is full: a new spore would wait (QA2 H-05 "⏳ Espera…"); too many at once fuse into a maze. */
  const nurseryFull = (): boolean => forming() >= B.SEED_NURSERY_MAX;

  function buildSeed(x: number, y: number, radiusFactor: number, shape: SeedShape, guaranteed: boolean): SeedSpec {
    const R = s.calib.R;
    const pattern = sporePattern(guaranteed);
    if (guaranteed) {
      return {
        x,
        y,
        radius: Math.max(pattern.w, pattern.h) / 2,
        density: 1,
        noise: 0,
        shape: 'pattern',
        pattern,
        bias: 1,
        rotation: rng() * Math.PI * 2,
        rngSeed: Math.floor(rng() * 2147483647),
      };
    }
    return {
      x,
      y,
      radius: R * radiusFactor,
      density: B.SEED_DENSITY_MIN + rng() * (B.SEED_DENSITY_MAX - B.SEED_DENSITY_MIN),
      noise: seedNoise(shape),
      shape,
      pattern,
      bias: seedBias(shape),
      rotation: rng() * Math.PI * 2,
      rngSeed: Math.floor(rng() * 2147483647),
    };
  }

  function recordSeed(x: number, y: number, cost: number, manual: boolean, countSeed = true, bodyR = s.calib.R, from?: { x: number; y: number }): void {
    if (countSeed) s.stats.seeds++;
    recentSeeds.push({ x, y, t: B.RECENT_SEED_MEMORY, r: bodyR });
    if (!s.flags.firstSeed) {
      s.flags.firstSeed = true;
      unlockJournal('firstSeed');
    }
    bus.emit('seed', from ? { x, y, cost, manual, from } : { x, y, cost, manual });
  }

  // ── seed spacing: spores stamped onto or next to other matter fuse into mazes (smoke flood) ──

  /** Radius of the matter a seed stamps: its disc, or its template if that is bigger (Synorbium). */
  function seedBodyRadius(spec: SeedSpec): number {
    const tpl = spec.pattern ? Math.max(spec.pattern.w, spec.pattern.h) / 2 : 0;
    return Math.max(spec.radius, spec.shape === 'pattern' ? tpl : Math.max(tpl, spec.radius));
  }

  /**
   * Bodies a new seed must keep clear of: every living, forming or exploded creature (extent ≈
   * BODY_FROM_RG × its radius of gyration, at least half a kernel) and every seed placed in the
   * last SEED_SPACING_MEMORY seconds that the detector has not reported yet.
   */
  function seedObstacles(extra: { x: number; y: number; r: number }[] = []): { x: number; y: number; r: number }[] {
    const R = s.calib.R;
    const out: { x: number; y: number; r: number }[] = [];
    for (const c of creatures) {
      if (c.state === 'dead') continue;
      out.push({ x: c.x, y: c.y, r: Math.max(B.SEED_BODY_MIN_R * R, B.SEED_BODY_FROM_RG * (Number.isFinite(c.radius) ? c.radius : 0)) });
    }
    for (const r of recentSeeds) {
      if (B.RECENT_SEED_MEMORY - r.t > B.SEED_SPACING_MEMORY) continue;
      if (creatures.some((c) => c.state !== 'dead' && wrapDist(c.x, c.y, r.x, r.y, grid.w, grid.h) < R)) continue; // already reported
      out.push({ x: r.x, y: r.y, r: r.r });
    }
    return out.concat(extra);
  }

  /** Room for a seed of body radius `bodyR` at (x, y): SEED_GAP·R of empty dish between it and every body. */
  function seedFits(x: number, y: number, bodyR: number, obstacles: { x: number; y: number; r: number }[]): boolean {
    const gap = B.SEED_GAP * s.calib.R;
    for (const o of obstacles) if (wrapDist(x, y, o.x, o.y, grid.w, grid.h) < bodyR + o.r + gap) return false;
    return true;
  }

  /**
   * Where a tapped seed may go: the tap itself if it has room, else the nearest spot with room within
   * SEED_RELOCATE·R (rings of R/4, 16 directions; deterministic), else null (refused, nothing charged).
   */
  function clearSpotNear(x: number, y: number, bodyR: number): { x: number; y: number } | null {
    const obstacles = seedObstacles();
    if (seedFits(x, y, bodyR, obstacles)) return { x, y };
    const R = s.calib.R;
    const wrap = (v: number, n: number) => ((v % n) + n) % n;
    for (let d = 0.25 * R; d <= B.SEED_RELOCATE * R + 1e-9; d += 0.25 * R) {
      let best: { x: number; y: number } | null = null;
      let bestClear = -Infinity;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const px = wrap(x + Math.cos(a) * d, grid.w);
        const py = wrap(y + Math.sin(a) * d, grid.h);
        if (!seedFits(px, py, bodyR, obstacles)) continue;
        // Among the directions of this ring, the one farthest from everything.
        let clear = Infinity;
        for (const o of obstacles) clear = Math.min(clear, wrapDist(px, py, o.x, o.y, grid.w, grid.h) - o.r);
        if (clear > bestClear) {
          bestClear = clear;
          best = { x: px, y: py };
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Farthest-from-everything random point with room for a seed; null if none is farther than spacing·R. */
  function findFreeSpot(spacingR: number, extra: { x: number; y: number; r?: number }[] = []): { x: number; y: number } | null {
    const R = s.calib.R;
    const obstacles = seedObstacles(extra.map((e) => ({ x: e.x, y: e.y, r: e.r ?? B.SEED_RADIUS * R })));
    const minD = spacingR * R;
    let best: { x: number; y: number } | null = null;
    let bestD = -1;
    for (let i = 0; i < B.AUTOSEED_TRIES; i++) {
      const x = rng() * grid.w;
      const y = rng() * grid.h;
      let d = Infinity;
      for (const o of obstacles) d = Math.min(d, wrapDist(x, y, o.x, o.y, grid.w, grid.h));
      if (d > bestD) {
        bestD = d;
        best = { x, y };
      }
      if (!obstacles.length) break;
    }
    // Auto-seeder and golden seeds respect the same room as a tap (a spore of radius R).
    return bestD > minD && best && seedFits(best.x, best.y, B.SEED_RADIUS * R * 1.3, obstacles) ? best : null;
  }

  function autoSeed(): void {
    if (nurseryFull()) return;
    const cost = seedCost();
    if (cost > s.essence * B.AUTOSEED_MAX_SPEND && !(aliveCount() === 0 && cost <= s.essence)) return;
    const spacing = B.DISH_SPACING[Math.min(level('dish'), B.DISH_SPACING.length - 1)];
    const spot = findFreeSpot(spacing);
    if (!spot) {
      if (saturatedToastT <= 0) {
        toast(TEXT.dishSaturated, 'warn');
        saturatedToastT = B.SATURATED_TOAST_COOLDOWN;
      }
      return;
    }
    s.essence -= cost;
    const spec = buildSeed(spot.x, spot.y, B.SEED_RADIUS, s.shape, false);
    recordSeed(spot.x, spot.y, cost, false, true, seedBodyRadius(spec));
    bus.emit('dishSeed', { specs: [spec] });
  }

  // ───────────────────────────── bestiary ────────────────────────────

  function signatureOf(c: Creature): number[] {
    if (c.signature && c.signature.length) return c.signature;
    const R = s.calib.R;
    return [c.mass / (R * R), c.radius / R, c.complexity, Math.hypot(c.vx, c.vy) / s.calib.dt];
  }

  /**
   * Running average of a species signature. Features the detector does not know yet are
   * negative (SIG_UNKNOWN = -1): they never pollute the average, and fill in once known.
   */
  function blendSignature(sp: SpeciesState, sig: number[]): void {
    if (!sig.length) return;
    if (sp.signature.length !== sig.length) {
      sp.signature = [...sig];
      sp.sigCount = 1;
      return;
    }
    const n = Math.min(sp.sigCount, B.SIGNATURE_AVG_CAP);
    sp.signature = sp.signature.map((v, i) => {
      const x = sig[i];
      if (!(x >= 0)) return v; // new value unknown: keep
      if (!(v >= 0)) return x; // old value unknown: adopt
      return (v * n + x) / (n + 1);
    });
    sp.sigCount = Math.min(sp.sigCount + 1, 1e9);
  }

  function expandRanges(sp: SpeciesState): void {
    const c = s.calib;
    sp.muRange = [Math.min(sp.muRange[0], c.mu), Math.max(sp.muRange[1], c.mu)];
    sp.sigmaRange = [Math.min(sp.sigmaRange[0], c.sigma), Math.max(sp.sigmaRange[1], c.sigma)];
  }

  /**
   * A form worth a NEW bestiary entry: its behaviour is known (complete signature), it has been
   * stable for two shape windows and its shape stopped changing (detector shapeDrift), and — unless
   * it is a catalog form — it is one compact body, not a speck. Fields the report lacks (fake
   * reports in tests and the balance bot) are not gated. See balance SPECIES_*.
   */
  function finishedForm(c: Creature, sig: number[], reveal: CatalogSignature | null): boolean {
    if (!sig.length || !sig.every((v) => v >= 0)) return false;
    if (c.stableSteps !== undefined && !(c.stableSteps >= B.SPECIES_MIN_STABLE_STEPS)) return false;
    if (c.shapeDrift !== undefined && !(c.shapeDrift >= 0 && c.shapeDrift <= B.SPECIES_MAX_SHAPE_DRIFT)) return false;
    if (reveal) return true;
    const parts = sig[SIG.PARTS];
    const mass = sig[SIG.MASS];
    if (parts !== undefined && sig.length > SIG.PARTS && !(parts <= B.SPECIES_MAX_PARTS)) return false;
    if (mass !== undefined && !(mass >= B.SPECIES_MIN_MASS_R2)) return false;
    return true;
  }

  function matchCatalog(sig: number[]): CatalogSignature | null {
    let best: CatalogSignature | null = null;
    let bestScore = Infinity;
    for (const e of catalogSigs) {
      const entry = catalogByCode(e.code);
      if (entry && !ringsEqual(entry.b, s.calib.rings)) continue;
      const dp = paramDistance(e.mu, e.sigma, s.calib.mu, s.calib.sigma);
      if (dp > B.CATALOG_REVEAL_MAX_PARAM_DIST) continue;
      const ds = signatureDistance(sig, e.signature);
      if (!(ds < SPECIES_MATCH_THRESHOLD * B.CATALOG_MATCH_FACTOR)) continue;
      const score = ds / SPECIES_MATCH_THRESHOLD + 0.2 * dp;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  function onStable(c: Creature): void {
    s.stats.stableEver++;
    s.eraHadStable = true;
    if (!s.flags.firstStable) {
      s.flags.firstStable = true;
      unlockJournal('firstStable');
    }
    if (s.goldenTimer < 0) s.goldenTimer = between(B.GOLDEN_FIRST_DELAY);
    bus.emit('creatureStable', { id: c.id, x: c.x, y: c.y });
    unassigned.add(c.id);
    assignSpecies(c);
  }

  /** True when the creature is packed among several others (a fragment of a maze, not a fauna). */
  function crowded(c: Creature): boolean {
    const r = B.SPECIES_NEW_ISOLATION_R * s.calib.R;
    let n = 0;
    for (const o of creatures) {
      if (o.id === c.id || o.state === 'dead') continue;
      if (wrapDist(o.x, o.y, c.x, c.y, grid.w, grid.h) < r && ++n >= B.SPECIES_NEW_CROWD_NEIGHBORS) return true;
    }
    return false;
  }

  /**
   * Match a stable creature to a known species, or register a new one. New species need an
   * isolated creature, a calm dish and a cooldown, so fragment storms can't flood the bestiary;
   * a creature that doesn't qualify yet stays unassigned (pays as unknown) and is retried.
   */
  function assignSpecies(c: Creature): void {
    if (overgrown) return;
    const sig = signatureOf(c);
    const idx = matchSignature(
      sig,
      s.species.map((sp) => sp.signature),
    );
    let sp: SpeciesState | undefined = idx >= 0 ? s.species[idx] : undefined;
    const reveal = sp ? null : matchCatalog(sig);
    // Same catalog species (or one the detector cannot tell apart from it), drifted signature.
    if (!sp && reveal) sp = s.species.find((x) => sameCatalogSpecies(x.catalogCode, reveal.code));
    if (sp) {
      sp.timesSeen++;
      blendSignature(sp, sig);
      expandRanges(sp);
      // A settled member may give a better portrait than the one stored (checked when due).
      if (!portraitWatch.has(c.id)) portraitWatch.set(c.id, { speciesId: sp.id, at: reportStep + B.PORTRAIT_RECAPTURE_DELAY });
    } else {
      // Only finished forms found a species; until then the creature pays as an unknown one.
      if (!finishedForm(c, sig, reveal) || newSpeciesTokens < 1 || crowded(c)) return;
      sp = registerSpecies(c, sig, reveal);
      newSpeciesTokens -= 1;
    }
    unassigned.delete(c.id);
    creatureSpecies.set(c.id, sp.id);
    if (c.behavior) onBehavior(c);
  }

  function requestPortrait(speciesId: string, c: Creature): void {
    const n = portraitCaptures.get(speciesId) ?? 0;
    if (n >= B.PORTRAIT_MAX_CAPTURES) return;
    portraitCaptures.set(speciesId, n + 1);
    const size = Math.min(B.PORTRAIT_CAPTURE_MAX, Math.ceil(s.calib.R * B.PORTRAIT_CAPTURE_R));
    portraitQueue.push({ speciesId, creatureId: c.id, x: c.x, y: c.y, size });
  }

  /** True while the stored portrait of a species could still be improved by another capture. */
  function portraitWanted(speciesId: string): boolean {
    if ((portraitCaptures.get(speciesId) ?? 0) >= B.PORTRAIT_MAX_CAPTURES) return false;
    const best = portraitBest.get(speciesId);
    return best === undefined || best < B.PORTRAIT_GOOD_SCORE;
  }

  /** No other creature close enough to share the capture square. */
  function clearAround(c: Creature): boolean {
    const r = B.PORTRAIT_CLEAR_R * s.calib.R;
    return !creatures.some((o) => o.id !== c.id && o.state !== 'dead' && wrapDist(o.x, o.y, c.x, c.y, grid.w, grid.h) < r);
  }

  /** Scheduled re-captures of settled creatures, only while their species' portrait is not good yet. */
  function processPortraitWatch(): void {
    if (!portraitWatch.size) return;
    for (const c of creatures) {
      const w = portraitWatch.get(c.id);
      if (!w) continue;
      if (creatureSpecies.get(c.id) !== w.speciesId || !portraitWanted(w.speciesId)) {
        portraitWatch.delete(c.id);
        continue;
      }
      if (reportStep < w.at || c.state !== 'stable' || !clearAround(c)) continue;
      portraitWatch.delete(c.id);
      requestPortrait(w.speciesId, c);
    }
  }

  function registerSpecies(c: Creature, sig: number[], reveal: CatalogSignature | null): SpeciesState {
    const n = ++s.specimenCounter;
    const R = s.calib.R;
    const mut = pendingMutations.find((m) => wrapDist(m.x, m.y, c.x, c.y, grid.w, grid.h) < B.MUTATION_LINK_DIST * R);
    const parent = mut ? speciesById(mut.parent) : undefined;
    const rarity: Rarity = reveal
      ? (B.RARITY_BY_CODE[reveal.code] ?? B.DEFAULT_RARITY)
      : parent
        ? parent.rarity
        : B.DEFAULT_RARITY;
    const latin = reveal ? null : newLatin(sig, c.behavior, s.calib.rings.length);
    const hue = speciesHue(sig, reveal ? reveal.code : null, takenHues());
    // Frozen at registration: the body seen in the catalog pattern (revealed) or read from the signature.
    const shape = shapeKind(reveal ? catalogPortrait(reveal.code) : null, sig);
    const common = commonName(shape, c.behavior, hue, takenCommon());
    const sp: SpeciesState = {
      id: `sp${n}`,
      n,
      customName: null,
      catalogCode: reveal ? reveal.code : null,
      catalogName: reveal ? reveal.name : null,
      rarity,
      behavior: null,
      behaviors: [],
      signature: [...sig],
      sigCount: 1,
      timesSeen: 1,
      era: s.era,
      muRange: [s.calib.mu, s.calib.mu],
      sigmaRange: [s.calib.sigma, s.calib.sigma],
      R,
      rings: [...s.calib.rings],
      portrait: null,
      isNew: true,
      variantOf: parent && !reveal ? parent.id : null,
      latin,
      hue,
      shape,
      common,
    };
    if (mut) pendingMutations = pendingMutations.filter((m) => m !== mut);
    s.species.push(sp);
    s.samples += B.SAMPLES_NEW_SPECIES[rarity];
    s.pendingSpecies++;
    if (sp.variantOf) s.stats.variants++;
    sinceNewSpecies = 0;
    lastFounder = { speciesId: sp.id, creatureId: c.id };
    requestPortrait(sp.id, c);
    portraitWatch.set(c.id, { speciesId: sp.id, at: reportStep + B.PORTRAIT_RECAPTURE_DELAY });
    bus.emit('speciesNew', { speciesId: sp.id, name: speciesName(sp), rarity, x: c.x, y: c.y });
    if (s.species.length >= 10) unlockJournal('species10');
    if (s.species.length >= 50) unlockJournal('species50');
    return sp;
  }

  function onBehavior(c: Creature): void {
    const b = c.behavior;
    if (!b || lastBehavior.get(c.id) === b) return;
    lastBehavior.set(c.id, b);
    const sp = speciesById(creatureSpecies.get(c.id));
    if (sp) {
      sp.behavior = b;
      blendSignature(sp, signatureOf(c));
      if (!sp.behaviors.includes(b)) {
        sp.behaviors.push(b);
        s.samples += B.SAMPLES_NEW_BEHAVIOR;
      }
    }
    if (!s.behaviorsSeen.includes(b)) {
      s.behaviorsSeen.push(b);
      s.pendingBehaviors++;
      bus.emit('behaviorNew', { behavior: b, x: c.x, y: c.y });
      toast(TEXT.newBehavior(b), 'good');
      if (b === 'swimmer') unlockJournal('firstSwimmer');
      if (b === 'spinner') unlockJournal('firstSpinner');
      if (b === 'divider') {
        s.flags.firstDivision = true;
        unlockJournal('firstDivision');
      }
    }
  }

  function updateOvergrown(fill: number): void {
    const was = overgrown;
    if (!overgrown && fill > B.DISH_OVERGROWN_FILL) overgrown = true;
    else if (overgrown && fill < B.DISH_OVERGROWN_CLEAR) overgrown = false;
    if (overgrown === was) return;
    bus.emit('dishOvergrown', { on: overgrown });
    if (overgrown) {
      toast(
        {
          es: '¡La placa se desbordó! Demasiada materia sin forma no produce. Límpiala y siembra con calma.',
          en: 'The dish overflowed! Shapeless matter produces nothing. Clean it and seed calmly.',
        },
        'warn',
      );
    }
  }

  function processReport(report: DetectorReport): void {
    creatures = Array.isArray(report.creatures) ? report.creatures.filter((c) => c && Number.isFinite(c.x) && Number.isFinite(c.y)) : [];
    if (Number.isFinite(report.step)) reportStep = report.step;
    updateOvergrown(Number.isFinite(report.fill) ? report.fill : 0);
    for (const c of creatures) {
      if (!knownIds.has(c.id)) {
        knownIds.add(c.id);
        if (c.state !== 'dead') {
          s.stats.creaturesBorn++;
          bus.emit('creatureBorn', { id: c.id, x: c.x, y: c.y });
        }
      }
    }
    for (const ev of report.events ?? []) {
      switch (ev.type) {
        case 'died':
          // Exploded matter that vanished (lysis, the clean-up, or it simply fell apart) dissolved:
          // not a creature the player lost, so no death, no "it died" moment.
          if (lastStates.get(ev.id) === 'exploded') {
            s.stats.dissolved++;
            bus.emit('creatureDissolved', { id: ev.id, x: ev.x, y: ev.y });
            break;
          }
          s.stats.deaths++;
          bus.emit('creatureDied', { id: ev.id, x: ev.x, y: ev.y });
          unlockJournal('firstDeath');
          break;
        case 'exploded':
          s.stats.explosions++;
          bus.emit('creatureExploded', { id: ev.id, x: ev.x, y: ev.y });
          unlockJournal('firstExplosion');
          break;
        case 'divided':
          bus.emit('creatureDivided', { parentId: ev.parentId, x: ev.x, y: ev.y });
          // QA3 F14: spore noise splitting in minute 1 is not a division of a creature.
          if (stableIds.has(ev.parentId) || creatureSpecies.has(ev.parentId)) {
            s.flags.firstDivision = true;
            unlockJournal('firstDivision');
          }
          break;
        default:
          break; // born / stable / behavior are derived from the creature list
      }
    }
    for (const c of creatures) {
      if (c.state !== 'stable') continue;
      if (!creatureSpecies.has(c.id) && !unassigned.has(c.id)) onStable(c);
      else if (unassigned.has(c.id)) assignSpecies(c);
      else if (c.behavior) onBehavior(c);
    }
    // Forget creatures that are gone.
    const alive = new Set(creatures.map((c) => c.id));
    for (const id of [...knownIds]) {
      if (!alive.has(id)) {
        knownIds.delete(id);
        creatureSpecies.delete(id);
        unassigned.delete(id);
        lastBehavior.delete(id);
        incomeAcc.delete(id);
        portraitWatch.delete(id);
      }
    }
    processPortraitWatch();
    stableIds = new Set(creatures.filter((c) => c.state === 'stable').map((c) => c.id));
    lastStates = new Map(creatures.map((c) => [c.id, c.state]));
    const st = stableCount();
    s.eraStablePeak = Math.max(s.eraStablePeak, st);
    s.stats.stablePeak = Math.max(s.stats.stablePeak, st);
  }

  // ───────────────────────────── economy tick ────────────────────────

  function production() {
    return computeProduction(creatures, {
      speciesOf: (id) => {
        const sp = speciesById(creatureSpecies.get(id));
        return sp ? { id: sp.id, mult: speciesMult(sp) } : null;
      },
      behaviorMult,
      complexityMult: 1 + B.NUTRIENT_BONUS * level('nutrient'),
      globalMult: globalMult(),
      symbiosis: has('symbiosis'),
      R: s.calib.R,
      gridW: grid.w,
      gridH: grid.h,
    });
  }

  function econTick(dt: number): void {
    const prod = overgrown ? { total: 0, per: new Map<number, number>(), symbiotic: 0, detail: new Map<number, YieldDetail>() } : production();
    const bm = buffMult();
    baseEps = prod.total;
    eps = prod.total * bm;
    perCreature = prod.per;
    perDetail = prod.detail;
    addEssence(eps * dt);
    if (prod.symbiotic > 0) s.stats.symbiosis = Math.max(s.stats.symbiosis, prod.symbiotic);
    s.stats.epsPeak = Math.max(s.stats.epsPeak, eps);
    if (eps >= B.CULTURE_UNLOCK_EPS) s.flags.eps10 = true;

    // Floating income numbers.
    for (const c of creatures) {
      const v = perCreature.get(c.id);
      if (!v) continue;
      let acc = incomeAcc.get(c.id);
      if (!acc) incomeAcc.set(c.id, (acc = { amount: 0, t: 0 }));
      acc.amount += v * bm * dt;
      acc.t += dt;
      if (acc.t >= B.INCOME_POP_INTERVAL) {
        bus.emit('income', { id: c.id, x: c.x, y: c.y, amount: acc.amount });
        acc.amount = 0;
        acc.t = 0;
      }
    }

    // Offline history (base production, buffs excluded so a Floración cannot inflate it).
    s.bucketSum += baseEps * dt;
    s.bucketTime += dt;
    if (s.bucketTime >= B.EPS_BUCKET) {
      s.epsHistory.push(s.bucketSum / s.bucketTime);
      const n = Math.ceil(B.OFFLINE_WINDOW / B.EPS_BUCKET);
      if (s.epsHistory.length > n) s.epsHistory.splice(0, s.epsHistory.length - n);
      s.bucketSum = 0;
      s.bucketTime = 0;
    }
    checkProgress();
  }

  function unlockCtx(): UnlockCtx {
    return {
      level,
      stablePeak: Math.max(s.eraStablePeak, stableCount()),
      eps,
      species: s.species.length,
      behaviors: s.behaviorsSeen,
      flags: s.flags,
    };
  }

  /** Sticky upgrade unlocks; `silent` skips the toasts (initial load). */
  function refreshUnlocks(silent = false): void {
    const ctx = unlockCtx();
    for (const def of UPGRADES) {
      if (s.unlocked.includes(def.id)) continue;
      if (def.unlock(ctx)) {
        s.unlocked.push(def.id);
        if (!silent && def.id !== 'dropper') toast(TEXT.upgradeUnlocked(UPGRADE_TEXT[def.id].name), 'good');
      }
    }
  }

  function checkProgress(): void {
    refreshUnlocks();
    // Tabs (sticky).
    const tabs = computeTabs();
    if (tabs.bestiary && !s.flags.tabBestiary) {
      s.flags.tabBestiary = true;
    }
    if (tabs.calibrate && !s.flags.tabCalibrate) s.flags.tabCalibrate = true;
    if (tabs.genome && !s.flags.tabGenome) {
      s.flags.tabGenome = true;
      toast(TEXT.tabUnlocked('Genoma', 'Genome'), 'info');
    }
    if (tabs.lab) s.flags.tabLab = true;
    // Extinction availability.
    if (extinctionAvailable() && !s.flags[`extReady${s.era}`]) {
      s.flags[`extReady${s.era}`] = true;
      toast(TEXT.extinctionReady, 'good');
      unlockJournal('extinctionNear');
    }
    // Objectives. A later objective already met by another route (bought early, a peak reached
    // while an earlier step waited) is remembered, so the chain never stalls on it (QA2 H-24).
    for (let i = s.objective; i < B.OBJECTIVES.length; i++) {
      const o = B.OBJECTIVES[i];
      if (!s.flags[`obj:${o.id}`] && metric(o.metric) >= o.target) s.flags[`obj:${o.id}`] = true;
    }
    while (s.objective < B.OBJECTIVES.length) {
      const o = B.OBJECTIVES[s.objective];
      if (!s.flags[`obj:${o.id}`] && metric(o.metric) < o.target) break;
      s.objective++;
      if (o.reward > 0) s.essence += o.reward;
      toast(TEXT.objectiveDone(o.reward), 'good');
    }
    // Achievements.
    for (const a of B.ACHIEVEMENTS) {
      if (s.achievements.includes(a.id)) continue;
      if (metric(a.metric) >= a.target) {
        s.achievements.push(a.id);
        bus.emit('achievement', { id: a.id, name: ACHIEVEMENT_TEXT[a.id]?.name ?? { es: a.id, en: a.id } });
      }
    }
  }

  function metric(name: string): number {
    if (name.startsWith('upgrade:')) return level(name.slice(8));
    if (name.startsWith('behavior:')) return s.behaviorsSeen.includes(name.slice(9) as Behavior) ? 1 : 0;
    const st = s.stats;
    switch (name) {
      case 'seeds':
        return st.seeds;
      case 'stable':
        return stableCount();
      case 'stableEver':
        return st.stableEver;
      case 'stablePeak':
        return st.stablePeak;
      case 'species':
        return s.species.length;
      case 'speciesSeen':
        // Opening the Bestiary with a creature in it counts as looking at it (QA3 F7).
        return Math.max(st.speciesSeen, s.flags.bestiaryLooked ? 1 : 0);
      case 'eps':
        return eps;
      case 'epsPeak':
        return st.epsPeak;
      case 'calibrations':
        return st.calibrations;
      case 'golden':
        return st.golden;
      case 'behaviors':
        return s.behaviorsSeen.length;
      case 'prints':
        return st.prints;
      case 'eraEssence':
        return s.eraEssence;
      case 'totalEssence':
        return st.totalEssence;
      case 'extinctions':
        return st.extinctions;
      case 'rare':
        return s.species.filter((x) => x.rarity === 'rare' || x.rarity === 'veryRare').length;
      case 'veryRare':
        return s.species.filter((x) => x.rarity === 'veryRare').length;
      case 'regimesSaved':
        return st.regimesSaved;
      case 'genomeNodes':
        return s.nodes.length;
      case 'variants':
        return st.variants;
      case 'symbiosis':
        return st.symbiosis;
      case 'returns':
        return st.returns;
      case 'playTime':
        return st.playTime;
      default:
        return 0;
    }
  }

  // ───────────────────────────── golden spark ────────────────────────

  function between(r: [number, number]): number {
    return r[0] + rng() * (r[1] - r[0]);
  }

  function spawnGolden(): void {
    const ang = rng() * Math.PI * 2;
    golden = {
      x: rng() * grid.w,
      y: rng() * grid.h,
      vx: Math.cos(ang) * B.GOLDEN_SPEED,
      vy: Math.sin(ang) * B.GOLDEN_SPEED,
      life: B.GOLDEN_LIFE,
    };
    bus.emit('goldenSpawn', { x: golden.x, y: golden.y });
  }

  function updateGolden(dt: number): void {
    if (golden) {
      golden.x = (((golden.x + golden.vx * dt) % grid.w) + grid.w) % grid.w;
      golden.y = (((golden.y + golden.vy * dt) % grid.h) + grid.h) % grid.h;
      golden.life -= dt;
      if (golden.life <= 0) {
        golden = null;
        s.stats.goldenMissed++;
        s.goldenTimer = between(B.GOLDEN_INTERVAL);
        bus.emit('goldenMissed', {});
      }
      return;
    }
    if (s.goldenTimer < 0) return; // armed by the first stable creature of the Era
    s.goldenTimer -= dt;
    if (s.goldenTimer <= 0) spawnGolden();
  }

  function sporeRain(): number {
    const specs: SeedSpec[] = [];
    for (let i = 0; i < B.SPORE_RAIN_SEEDS; i++) {
      if (nurseryFull()) break; // the rest wait as free seeds
      const spot = findFreeSpot(2);
      if (!spot) break;
      const spec = buildSeed(spot.x, spot.y, B.SEED_RADIUS, 'blob', false);
      specs.push(spec);
      recordSeed(spot.x, spot.y, 0, false, true, seedBodyRadius(spec)); // later drops keep clear of it
    }
    if (specs.length) bus.emit('dishSeed', { specs });
    const left = B.SPORE_RAIN_SEEDS - specs.length;
    s.charges.free += left;
    return specs.length;
  }

  function collectGolden(): void {
    // QA1 #9: no aiming at a frozen spark while paused (and no seeding a paused dish).
    if (!golden || paused) return;
    const g = golden;
    golden = null;
    const W = B.GOLDEN_WEIGHTS;
    let r = rng() * (W.bloom + W.lump + W.spores + W.mutagen);
    let kind: 'bloom' | 'lump' | 'spores' | 'mutagen' =
      (r -= W.bloom) < 0 ? 'bloom' : (r -= W.lump) < 0 ? 'lump' : (r -= W.spores) < 0 ? 'spores' : 'mutagen';
    if (kind === 'bloom' && baseEps <= 0) kind = 'spores'; // a bloom of nothing is no reward
    // QA3 F9: free seeds are worthless to a rich bank or a full dish — give Essence instead.
    if (kind === 'spores' && (s.essence > B.SPORES_REROLL_BANK * seedCost() || !findFreeSpot(2))) kind = 'lump';
    let reward: Text;
    switch (kind) {
      case 'bloom': {
        const existing = s.buffs.find((b) => b.id === 'bloom');
        if (existing) existing.remaining = Math.max(existing.remaining, B.BLOOM_TIME);
        else s.buffs.push({ id: 'bloom', remaining: B.BLOOM_TIME, mult: B.BLOOM_MULT });
        reward = TEXT.bloomReward(B.BLOOM_MULT, B.BLOOM_TIME);
        break;
      }
      case 'lump': {
        const amount = Math.max(B.LUMP_MIN, baseEps * B.LUMP_SECONDS);
        addEssence(amount);
        reward = TEXT.lumpReward(amount);
        break;
      }
      case 'spores':
        sporeRain();
        reward = TEXT.sporeReward(B.SPORE_RAIN_SEEDS);
        break;
      default:
        s.charges.guaranteed += B.MUTAGEN_SEEDS;
        reward = TEXT.mutagenReward(B.MUTAGEN_SEEDS);
    }
    s.stats.golden++;
    s.goldenTimer = between(B.GOLDEN_INTERVAL);
    unlockJournal('firstGolden');
    bus.emit('goldenCollected', { x: g.x, y: g.y, reward });
    checkProgress();
  }

  // ───────────────────────────── extinction ──────────────────────────

  function extinctionAvailable(): boolean {
    return essenceTerm(s.eraEssence) >= B.EXTINCTION_MIN_ESSENCE_TERM;
  }

  function currentGenomeGain(extraEssence = 0): number {
    return genomeGain(s.eraEssence + extraEssence, s.pendingSpecies, s.pendingBehaviors);
  }

  function clearTransient(): void {
    creatures = [];
    creatureSpecies.clear();
    unassigned.clear();
    overgrown = false;
    overgrownFor = 0;
    knownIds.clear();
    lastBehavior.clear();
    incomeAcc.clear();
    perCreature = new Map();
    perDetail = new Map();
    recentSeeds = [];
    pendingMutations = [];
    portraitWatch.clear();
    portraitQueue = [];
    lastFounder = null;
    lastStates = new Map();
    golden = null;
    brush = null;
    baseEps = 0;
    eps = 0;
    econAcc = 0;
  }

  function extinguish(): boolean {
    if (!extinctionAvailable()) return false;
    const gain = currentGenomeGain();
    bus.emit('extinctionStart', { genome: gain });
    s.genome += gain;
    s.pendingSpecies = 0;
    s.pendingBehaviors = 0;
    s.stats.extinctions++;
    s.era++;
    s.maxDropper = Math.max(s.maxDropper, level('dropper'));
    // Laboratorio resets (with Genome heritage).
    for (const def of UPGRADES) if (def.tab === 'lab') delete s.upgrades[def.id];
    if (has('dropperMemory') && s.maxDropper > 1) s.upgrades.dropper = s.maxDropper - 1;
    if (has('persistentSeeder')) s.upgrades.autoSeeder = B.PERSISTENT_SEEDER_LEVEL;
    s.essence = has('essenceStart') ? Math.max(B.START_ESSENCE, B.ESSENCE_START_PER_ERA * s.era) : B.START_ESSENCE;
    if (!has('regimesPersist')) s.regimes = [];
    s.calib = baseCalibration();
    s.eraEssence = 0;
    s.eraTime = 0;
    s.eraStablePeak = 0;
    s.eraHadStable = false;
    s.buffs = [];
    // Offline pays the recent production of *this* Era: the old Era's history must not
    // fund a fresh dish (extinguish, close the app, collect hours of old income).
    s.epsHistory = [];
    s.bucketSum = 0;
    s.bucketTime = 0;
    s.goldenTimer = -1;
    s.autoSeedTimer = 0;
    s.pipetteTimer = 0;
    s.speed = 1;
    s.shape = shapes().includes(s.shape) ? s.shape : 'blob';
    clearTransient();
    unlockJournal('firstExtinction');
    if (s.era === 2) unlockJournal('era2');
    bus.emit('dishClear', {});
    calibrationChanged();
    bus.emit('extinctionDone', { era: s.era, genome: gain });
    checkProgress();
    return true;
  }

  // ───────────────────────────── views ───────────────────────────────

  function computeTabs() {
    return {
      lab: !!s.flags.tabLab || s.stats.seeds > 0,
      bestiary: !!s.flags.tabBestiary || s.species.length > 0,
      calibrate: !!s.flags.tabCalibrate || level('calibrator') > 0,
      genome:
        !!s.flags.tabGenome ||
        s.era > 1 ||
        s.genome > 0 ||
        s.nodes.length > 0 ||
        s.eraEssence >= B.GENOME_TAB_REVEAL * EXTINCTION_ESSENCE_NEEDED,
    };
  }

  function upgradeView(def: UpgradeDef): UpgradeView {
    const lvl = level(def.id);
    const maxed = def.maxLevel !== null && lvl >= def.maxLevel;
    const remaining = def.maxLevel === null ? Infinity : def.maxLevel - lvl;
    const budget = def.currency === 'essence' ? s.essence : s.samples;
    let qty = 0;
    if (!maxed) {
      if (s.buyQty === 'max') qty = Math.max(1, maxAffordable(def, lvl, budget));
      else qty = Math.min(s.buyQty, remaining);
    }
    const cost = maxed ? 0 : costForQty(def, lvl, qty);
    const tx = UPGRADE_TEXT[def.id];
    return {
      id: def.id,
      tab: def.tab,
      name: tx.name,
      desc: tx.desc,
      effect: effectText(def.id, lvl, def.maxLevel, def.value),
      level: lvl,
      maxLevel: def.maxLevel,
      cost,
      qty,
      currency: def.currency,
      affordable: !maxed && s.unlocked.includes(def.id) && cost <= budget,
      unlocked: s.unlocked.includes(def.id),
      unlockHint: tx.hint,
      maxed,
      secondsToAfford: maxed ? null : cost <= budget ? 0 : def.currency === 'essence' && eps > 0 ? (cost - budget) / eps : null,
    };
  }

  function genomeView(): GenomeNodeView[] {
    return GENOME_NODES.map((n) => {
      const owned = has(n.id);
      const available = !n.comingSoon && n.requires.every(has);
      return {
        id: n.id,
        branch: n.branch,
        name: GENOME_TEXT[n.id].name,
        desc: GENOME_TEXT[n.id].desc,
        cost: n.cost,
        owned,
        available,
        affordable: available && !owned && s.genome >= n.cost,
        requires: [...n.requires],
        comingSoon: n.comingSoon,
      };
    });
  }

  /** The stored capture (what Impresión stamps): the isolated creature, unrotated, at sp.R. */
  function portraitOf(sp: SpeciesState): Pattern | null {
    if (!portraitCache.has(sp.id)) portraitCache.set(sp.id, sp.portrait ? dequantizePattern(sp.portrait) : null);
    return portraitCache.get(sp.id) ?? null;
  }

  /**
   * What the bestiary shows: a revealed catalog species is drawn from its catalog pattern (crisp
   * and iconic); any other species from its best capture, centred, aligned and tightly framed.
   */
  function displayPortrait(sp: SpeciesState): Pattern | null {
    if (!displayCache.has(sp.id)) {
      let p = sp.catalogCode ? catalogPortrait(sp.catalogCode) : null;
      if (!p) {
        const raw = portraitOf(sp);
        p = raw ? (normalizePortrait(raw) ?? raw) : null;
      }
      displayCache.set(sp.id, p);
    }
    return displayCache.get(sp.id) ?? null;
  }

  function yieldView(d: YieldDetail | undefined): YieldView | null {
    return d ? { complexity: d.complexity, behaviorMult: d.behaviorMult, speciesMult: d.speciesMult, diminishing: d.diminishing, symbiosis: d.symbiosis } : null;
  }

  function speciesShape(sp: SpeciesState): ShapeKind {
    if (sp.shape) return sp.shape as ShapeKind; // frozen with the name, so label and name agree
    let k = shapeCache.get(sp.id);
    if (!k) shapeCache.set(sp.id, (k = shapeKind(displayPortrait(sp), sp.signature)));
    return k;
  }

  /** Mean yield factors of the species' paying members (or what one would get when none is alive). */
  function speciesProduction(sp: SpeciesState): YieldView & { members: number; eps: number } {
    let n = 0;
    let eps = 0;
    const acc = { complexity: 0, behaviorMult: 0, speciesMult: 0, diminishing: 0, symbiosis: 0 };
    for (const c of creatures) {
      const d = perDetail.get(c.id);
      if (!d || creatureSpecies.get(c.id) !== sp.id) continue;
      n++;
      eps += perCreature.get(c.id) ?? 0;
      acc.complexity += d.complexity;
      acc.behaviorMult += d.behaviorMult;
      acc.speciesMult += d.speciesMult;
      acc.diminishing += d.diminishing;
      acc.symbiosis += d.symbiosis;
    }
    if (!n) {
      const ref = sp.catalogCode ? catalogSigs.find((e) => e.code === sp.catalogCode) : undefined;
      const comp = Math.min(ref?.complexity ?? 1, B.COMPLEXITY_CAP) * (1 + B.NUTRIENT_BONUS * level('nutrient'));
      return { members: 0, eps: 0, complexity: comp, behaviorMult: behaviorMult(sp.behavior), speciesMult: speciesMult(sp), diminishing: 1, symbiosis: 1 };
    }
    return {
      members: n,
      eps,
      complexity: acc.complexity / n,
      behaviorMult: acc.behaviorMult / n,
      speciesMult: acc.speciesMult / n,
      diminishing: acc.diminishing / n,
      symbiosis: acc.symbiosis / n,
    };
  }

  /** Upgrades that raise a species' yield: its behaviour's Afinidad, then Catalogación and Nutriente. */
  function boostersOf(b: Behavior | null): { id: string; name: Text }[] {
    const affinity = b === 'swimmer' || b === 'spinner' ? 'swimAffinity' : b === 'divider' || b === 'colony' ? 'colonyAffinity' : 'sessileAffinity';
    return [affinity, 'cataloguing', 'nutrient']
      .filter((id) => id === affinity || s.unlocked.includes(id))
      .map((id) => ({ id, name: UPGRADE_TEXT[id].name }));
  }

  function colorText(hue: number | undefined): Text | undefined {
    if (hue === undefined) return undefined;
    const f = colorFamily(hue);
    return { es: f.m, en: f.en };
  }

  function speciesView(): SpeciesView[] {
    return s.species.map((sp) => ({
      id: sp.id,
      name: speciesName(sp),
      catalogName: sp.catalogName,
      rarity: sp.rarity,
      behavior: sp.behavior,
      mult: speciesMult(sp),
      timesSeen: sp.timesSeen,
      era: sp.era,
      portrait: displayPortrait(sp),
      hue: sp.hue,
      subtitle: TEXT.specimen(sp.n)[lang()],
      scientificName: sp.catalogName ?? sp.latin ?? null,
      colorName: colorText(sp.hue),
      shapeLabel: SHAPE_LABELS[speciesShape(sp)],
      shapeKind: speciesShape(sp),
      production: speciesProduction(sp),
      boostedBy: boostersOf(sp.behavior),
      muRange: [...sp.muRange] as [number, number],
      sigmaRange: [...sp.sigmaRange] as [number, number],
      printCost: B.PRINT_COST[sp.rarity],
      isNew: sp.isNew,
    }));
  }

  function calibrationView(): CalibrationView {
    const r = ranges();
    const c = s.calib;
    let hints: { mu: number; sigma: number }[] = [];
    if (level('microscope') >= 3) {
      const known = new Set(s.species.map((x) => x.catalogCode && catalogGroup(x.catalogCode)).filter(Boolean));
      hints = CATALOG.filter((e) => ringsEqual(e.b, c.rings) && !known.has(catalogGroup(e.code)))
        .filter((e) => !r.mu || (e.m >= r.mu[0] && e.m <= r.mu[1]))
        .filter((e) => paramDistance(e.m, e.s, c.mu, c.sigma) <= B.HINT_RADIUS)
        .map((e) => ({ mu: e.m, sigma: e.s }));
    }
    return {
      mu: c.mu,
      sigma: c.sigma,
      R: c.R,
      dt: c.dt,
      muRange: r.mu ? [...r.mu] : null,
      sigmaRange: r.sigma ? [...r.sigma] : null,
      RRange: r.R ? [...r.R] : null,
      dtRange: r.dt ? [...r.dt] : null,
      regimes: s.regimes.map((g) => ({ name: g.name, mu: g.mu, sigma: g.sigma, R: g.R, dt: g.dt })),
      maxRegimes: level('calibrator') >= 2 ? B.MAX_REGIMES : 0,
      rings: [...c.rings],
      ringsOptions: ringOptions(),
      hints,
    };
  }

  function creatureViews(): CreatureView[] {
    const out: CreatureView[] = [];
    const bm = buffMult();
    for (const c of creatures) {
      if (c.state === 'dead') continue;
      const sp = speciesById(creatureSpecies.get(c.id));
      out.push({
        id: c.id,
        x: c.x,
        y: c.y,
        r: c.radius,
        state: c.state,
        behavior: c.behavior,
        speciesId: sp ? sp.id : null,
        speciesName: sp ? speciesName(sp) : null,
        hue: sp ? sp.hue : undefined,
        yield: yieldView(perDetail.get(c.id)),
        eps: (perCreature.get(c.id) ?? 0) * bm,
        age: c.age,
        vx: Number.isFinite(c.vx) ? c.vx : 0,
        vy: Number.isFinite(c.vy) ? c.vy : 0,
      });
    }
    return out;
  }

  function view(): GameView {
    const cost = seedCost();
    const free = s.charges.free > 0 || pipetteReady();
    const obj = s.objective < B.OBJECTIVES.length ? B.OBJECTIVES[s.objective] : null;
    const objCur = obj ? metric(obj.metric) : 0;
    const extAvailable = extinctionAvailable();
    const gainNow = currentGenomeGain();
    const upgrades = UPGRADES.map(upgradeView);
    upgrades.sort((a, b) => Number(b.unlocked) - Number(a.unlocked));
    const achievements: AchievementView[] = B.ACHIEVEMENTS.map((a) => ({
      id: a.id,
      name: ACHIEVEMENT_TEXT[a.id]?.name ?? { es: a.id, en: a.id },
      desc: ACHIEVEMENT_TEXT[a.id]?.desc ?? { es: '', en: '' },
      done: s.achievements.includes(a.id),
      reward: achievementReward(a.bonus),
    }));
    const journal: JournalEntryView[] = s.journal
      .map((j) => {
        const e = JOURNAL.find((x) => x.id === j.id);
        return e ? { id: j.id, text: e.text, read: j.read } : null;
      })
      .filter((x): x is JournalEntryView => x !== null);
    const sp = speeds();
    return {
      essence: s.essence,
      essencePerSec: eps,
      samples: s.samples,
      genome: s.genome,
      era: s.era,
      seedCost: cost,
      seedPrice: seedPrice(),
      overgrown,
      canSeed: free || s.essence >= cost,
      pipette: { active: pipetteReady() || (pipetteWanted() && s.pipetteTimer > 0), progress: Math.min(1, s.pipetteTimer / pipetteTime()) },
      tools: {
        longPress: level('dropper') >= 2,
        brush: level('dropper') >= 3 && !s.settings.oneTouch,
        eraser: true,
        speeds: [...sp],
        speed: s.speed,
        shapes: shapes(),
        shape: s.shape,
      },
      upgrades,
      genomeNodes: genomeView(),
      species: speciesView(),
      behaviorsSeen: [...s.behaviorsSeen],
      calibration: calibrationView(),
      journal,
      achievements,
      extinction: {
        progress: Math.min(1, s.eraEssence / EXTINCTION_ESSENCE_NEEDED),
        available: extAvailable,
        genomeGain: gainNow,
        gainIn10Min: currentGenomeGain(baseEps * 600),
        requirement: extAvailable ? TEXT.extinctionGain(gainNow) : TEXT.extinctionRequirement(EXTINCTION_ESSENCE_NEEDED, s.eraEssence),
      },
      golden: golden ? { x: golden.x, y: golden.y, life: Math.max(0, golden.life / B.GOLDEN_LIFE) } : null,
      buffs: s.buffs.map((b) => ({ id: b.id, name: TEXT.bloom, remaining: b.remaining, mult: b.mult })),
      creatures: creatureViews(),
      objective: obj ? objectiveText(obj.id, objCur, obj.target) : null,
      objectiveProgress: obj ? { current: Math.min(objCur, obj.target), target: obj.target, reward: obj.reward } : null,
      settings: { ...s.settings },
      tabs: computeTabs(),
      stats: {
        playTime: s.stats.playTime,
        totalEssence: s.stats.totalEssence,
        eraEssence: s.eraEssence,
        seeds: s.stats.seeds,
        creaturesBorn: s.stats.creaturesBorn,
      },
      charges: { ...s.charges },
      freePrint: { active: level('archive') > 0, ready: archiveReady(), progress: level('archive') > 0 ? Math.min(1, s.archiveTimer / archiveInterval()) : 0 },
      markers: level('marker') > 0,
      microscope: level('microscope'),
      multipliers: multiplierView(),
      seedsGrowing: nurseryFull(),
    };
  }

  function multiplierView(): NonNullable<GameView['multipliers']> {
    let n = 0;
    let sm = 0;
    let bm = 0;
    for (const d of perDetail.values()) {
      n++;
      sm += d.speciesMult;
      bm += d.behaviorMult;
    }
    return { global: globalMult(), buffs: buffMult(), parts: globalParts(), species: n ? sm / n : 1, behavior: n ? bm / n : 1 };
  }


  // ───────────────────────────── actions ─────────────────────────────

  const actions: GameActions = {
    seedAt(x, y, opts) {
      const big = !!opts?.big && level('dropper') >= 2;
      const rf = B.SEED_RADIUS * (big ? B.SEED_BIG_RADIUS : 1);
      const cost = seedCost(rf);
      const pay = s.charges.free > 0 ? 'free' : pipetteReady() ? 'pipette' : s.essence >= cost ? 'essence' : null;
      if (!pay) {
        bus.emit('seedDenied', { x, y, cost });
        return null;
      }
      if (nurseryFull()) {
        bus.emit('seedBlocked', { x, y, reason: 'growing' });
        return null; // nothing charged: "your seeds are still growing"
      }
      const guaranteed = s.charges.guaranteed > 0;
      const spec = buildSeed(x, y, rf, s.shape, guaranteed);
      // Spacing: never stamp a spore onto or right next to other matter (they fuse into a maze).
      const spot = clearSpotNear(x, y, seedBodyRadius(spec));
      if (!spot) {
        bus.emit('seedBlocked', { x, y, reason: 'tooClose' });
        return null; // nothing charged, no charge used
      }
      let paid = 0;
      if (pay === 'free') s.charges.free--;
      else if (pay === 'pipette') {
        s.pipetteTimer = 0;
        s.flags.pipetteUsed = true;
      } else {
        s.essence -= cost;
        paid = cost;
      }
      if (guaranteed) s.charges.guaranteed--;
      const moved = spot.x !== x || spot.y !== y;
      spec.x = spot.x;
      spec.y = spot.y;
      recordSeed(spot.x, spot.y, paid, true, true, seedBodyRadius(spec), moved ? { x, y } : undefined);
      checkProgress();
      return spec;
    },

    brushAt(x, y) {
      if (level('dropper') < 3 || s.settings.oneTouch) return [];
      const R = s.calib.R;
      const t = now();
      const spacing = B.BRUSH_SPACING * R;
      const points: { x: number; y: number }[] = [];
      if (!brush || t - brush.lastMs > B.BRUSH_STROKE_GAP_MS) {
        points.push({ x, y });
        brush = { x, y, lastMs: t };
        s.stats.seeds++; // one stroke = one seed for stats
      } else {
        brush.lastMs = t;
        const d = Math.hypot(x - brush.x, y - brush.y);
        const n = Math.floor(d / spacing);
        for (let i = 1; i <= n; i++) points.push({ x: brush.x + ((x - brush.x) * i * spacing) / d, y: brush.y + ((y - brush.y) * i * spacing) / d });
      }
      const specs: SeedSpec[] = [];
      for (const p of points) {
        const cost = seedCost(B.BRUSH_RADIUS);
        if (s.essence < cost) {
          bus.emit('seedDenied', { x: p.x, y: p.y, cost });
          break;
        }
        s.essence -= cost;
        brush!.x = p.x;
        brush!.y = p.y;
        specs.push({
          x: ((p.x % grid.w) + grid.w) % grid.w,
          y: ((p.y % grid.h) + grid.h) % grid.h,
          radius: R * B.BRUSH_RADIUS,
          density: B.BRUSH_DENSITY,
          noise: seedNoise('blob'),
          shape: 'blob',
          bias: 0,
          rotation: rng() * Math.PI * 2,
          rngSeed: Math.floor(rng() * 2147483647),
        });
        recordSeed(p.x, p.y, cost, true, false);
      }
      return specs;
    },

    printAt(speciesId, x, y) {
      const sp = speciesById(speciesId);
      if (!sp) return null;
      let pattern = portraitOf(sp);
      if (pattern && Math.abs(sp.R - s.calib.R) > 0.01) pattern = resamplePattern(pattern, s.calib.R / sp.R);
      if (!pattern && sp.catalogCode) {
        const e = catalogByCode(sp.catalogCode);
        if (e) pattern = scaledTemplate(e, s.calib.R);
      }
      if (!pattern) return null;
      const free = archiveReady();
      const cost = B.PRINT_COST[sp.rarity];
      if (!free && s.samples < cost) {
        bus.emit('seedDenied', { x, y, cost });
        return null;
      }
      const bodyR = Math.max(pattern.w, pattern.h) / 2;
      const spot = clearSpotNear(x, y, bodyR);
      if (!spot) {
        bus.emit('seedBlocked', { x, y, reason: 'tooClose' });
        return null;
      }
      const from = spot.x !== x || spot.y !== y ? { x, y } : undefined;
      x = spot.x;
      y = spot.y;
      if (free) s.archiveTimer = 0;
      else s.samples -= cost;
      const mutate = has('mutations') && rng() < B.MUTATION_CHANCE;
      if (mutate) {
        pattern = mutatePattern(pattern, rng);
        pendingMutations.push({ x, y, parent: sp.id, t: B.MUTATION_LINK_TIME });
      }
      s.stats.prints++;
      recordSeed(x, y, 0, true, false, bodyR, from);
      checkProgress();
      return {
        x,
        y,
        radius: Math.max(pattern.w, pattern.h) / 2,
        density: 1,
        noise: mutate ? B.MUTATION_NOISE : 0,
        shape: 'pattern',
        pattern,
        bias: 1,
        rotation: rng() * Math.PI * 2,
        rngSeed: Math.floor(rng() * 2147483647),
      };
    },

    buyUpgrade(id, qty) {
      const def = UPGRADE_BY_ID[id];
      if (!def || !s.unlocked.includes(id)) return false;
      const lvl = level(id);
      const remaining = def.maxLevel === null ? Infinity : def.maxLevel - lvl;
      if (remaining <= 0) return false;
      const budget = def.currency === 'essence' ? s.essence : s.samples;
      const n = qty === 'max' ? maxAffordable(def, lvl, budget) : Math.min(qty, remaining);
      if (n <= 0) return false;
      const cost = costForQty(def, lvl, n);
      // Non-finite cost (or budget) would turn the balance into NaN and poison the save.
      if (!Number.isFinite(cost) || !(cost <= budget)) return false;
      if (def.currency === 'essence') s.essence = Math.max(0, s.essence - cost);
      else s.samples = Math.max(0, s.samples - cost);
      s.upgrades[id] = lvl + n;
      if (id === 'dropper') s.maxDropper = Math.max(s.maxDropper, s.upgrades[id]);
      if (id === 'calibrator') {
        if (lvl === 0) unlockJournal('calibrator');
        s.flags.stabilizerSeen = true;
        calibrationChanged();
      }
      if (id === 'dish') s.flags.incubatorSeen = true;
      if (id === 'culture' && s.upgrades[id] >= B.NUTRIENT_UNLOCK_CULTURE) s.flags.nutrientSeen = true;
      bus.emit('upgradeBought', { id, level: s.upgrades[id] });
      checkProgress();
      return true;
    },

    buyGenomeNode(id) {
      const n = GENOME_BY_ID[id];
      if (!n || n.comingSoon || has(id) || !n.requires.every(has) || s.genome < n.cost) return false;
      s.genome -= n.cost;
      s.genomeSpent += n.cost;
      s.nodes.push(id);
      bus.emit('genomeBought', { id });
      if (id === 'doubleRings' || id === 'tripleRings') calibrationChanged();
      checkProgress();
      return true;
    },

    extinguish,

    setCalibration(p) {
      const r = ranges();
      const c = s.calib;
      let changed = false;
      const apply = (key: 'mu' | 'sigma' | 'R' | 'dt', v: number | undefined) => {
        const rr = r[key];
        if (v === undefined || !rr || !Number.isFinite(v)) return;
        const nv = clamp(key === 'R' ? Math.round(v) : v, rr);
        if (nv !== c[key]) {
          c[key] = nv;
          changed = true;
        }
      };
      apply('mu', p.mu);
      apply('sigma', p.sigma);
      apply('R', p.R);
      apply('dt', p.dt);
      if (changed) {
        s.stats.calibrations++;
        calibrationChanged();
        checkProgress();
      }
    },

    saveRegime(name) {
      if (level('calibrator') < 2 || s.regimes.length >= B.MAX_REGIMES) return false;
      const clean = sanitizeName(name) || `${lang() === 'es' ? 'Régimen' : 'Regime'} ${s.regimes.length + 1}`;
      const c = s.calib;
      s.regimes.push({ name: clipGraphemes(clean, B.NAME_MAX_CHARS), mu: c.mu, sigma: c.sigma, R: c.R, dt: c.dt, rings: [...c.rings] });
      s.stats.regimesSaved++;
      checkProgress();
      return true;
    },

    loadRegime(index) {
      const g = s.regimes[index];
      if (!g) return;
      const preset = B.RING_PRESETS.find((p) => ringsEqual(p.rings, g.rings));
      if (preset && (preset.node === null || has(preset.node)) && !ringsEqual(s.calib.rings, g.rings)) {
        s.calib.rings = [...g.rings];
        if (!ranges().R) s.calib.R = preset.R;
        calibrationChanged();
      }
      actions.setCalibration({ mu: g.mu, sigma: g.sigma, R: g.R, dt: g.dt });
    },

    deleteRegime(index) {
      if (index >= 0 && index < s.regimes.length) s.regimes.splice(index, 1);
    },

    renameSpecies(id, name) {
      const sp = speciesById(id);
      if (!sp) return;
      sp.customName = sanitizeName(name) || null;
    },

    markSpeciesSeen(id) {
      const sp = speciesById(id);
      if (!sp) return;
      if (sp.isNew) {
        sp.isNew = false;
        s.stats.speciesSeen++;
        checkProgress();
      }
    },

    collectGolden,

    markJournalRead(id) {
      for (const j of s.journal) if (id === undefined || j.id === id) j.read = true;
    },

    setSpeed(mult) {
      if (speeds().includes(mult)) s.speed = mult;
    },

    setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
      const cur = s.settings[key];
      if (typeof value !== typeof cur) return;
      if (typeof value === 'number' && !(value >= 0 && value <= 1)) return;
      if (key === 'lang' && value !== 'es' && value !== 'en') return;
      if (key === 'quality' && !['auto', 'low', 'medium', 'high'].includes(value as string)) return;
      s.settings[key] = value;
    },

    sterilizeDish() {
      // Free, any time: wipes the matter, keeps everything earned.
      clearTransient();
      bus.emit('dishClear', {});
      toast({ es: 'Placa limpia. ¡A sembrar de nuevo!', en: 'Dish cleaned. Time to seed again!' }, 'good');
    },

    setBuyQty(q: BuyQty) {
      if (q === 1 || q === 10 || q === 'max') s.buyQty = q;
    },

    setSeedShape(shape) {
      if (shapes().includes(shape)) s.shape = shape;
    },

    setRings(rings) {
      const preset = B.RING_PRESETS.find((p) => ringsEqual(p.rings, rings));
      if (!preset || (preset.node !== null && !has(preset.node))) return;
      if (ringsEqual(s.calib.rings, preset.rings)) return;
      s.calib.rings = [...preset.rings];
      if (!ranges().R) s.calib.R = preset.R; // R slider locked: jump to the preset's native radius
      s.stats.calibrations++;
      calibrationChanged();
    },

    noteTabOpened(tab) {
      if (tab === 'bestiary' && s.species.length > 0 && !s.flags.bestiaryLooked) {
        s.flags.bestiaryLooked = true;
        checkProgress();
      }
    },
  };

  function sanitizeName(name: string): string {
    // eslint-disable-next-line no-control-regex
    return clipGraphemes(String(name ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim(), B.NAME_MAX_CHARS);
  }

  // ───────────────────────────── tick ────────────────────────────────

  function tick(realDt: number, report: DetectorReport | null): void {
    const dt = Number.isFinite(realDt) ? Math.min(Math.max(realDt, 0), B.MAX_TICK_DT) : 0;
    s.stats.playTime += dt;
    if (report) processReport(report);
    if (paused) return;

    s.eraTime += dt;
    sinceNewSpecies += dt;
    newSpeciesTokens = Math.min(B.SPECIES_NEW_BURST, newSpeciesTokens + dt / B.SPECIES_NEW_MIN_INTERVAL);
    saturatedToastT -= dt;
    // Play-test soft-lock: a flooded dish pays 0 forever unless cleaned. After a while it cleans
    // itself for free (sterilizeDish stays for the manual button).
    if (overgrown) {
      overgrownFor += dt;
      if (overgrownFor >= B.OVERGROWN_AUTO_CLEAN) {
        clearTransient();
        bus.emit('dishClear', {});
        bus.emit('dishOvergrown', { on: false });
        toast(TEXT.dishAutoCleaned, 'info');
      }
    } else overgrownFor = 0;
    for (const r of recentSeeds) r.t -= dt;
    recentSeeds = recentSeeds.filter((r) => r.t > 0);
    for (const m of pendingMutations) m.t -= dt;
    pendingMutations = pendingMutations.filter((m) => m.t > 0);

    // Timed buffs.
    for (const b of s.buffs) b.remaining -= dt;
    s.buffs = s.buffs.filter((b) => b.remaining > 0);

    // Economy at a fixed cadence.
    econAcc += dt;
    while (econAcc >= B.ECON_TICK) {
      econAcc -= B.ECON_TICK;
      econTick(B.ECON_TICK);
    }

    updateGolden(dt);

    // Sembrador.
    const as = level('autoSeeder');
    if (as > 0) {
      s.autoSeedTimer += dt;
      const iv = autoSeedInterval(as);
      if (s.autoSeedTimer >= iv) {
        s.autoSeedTimer = Math.min(s.autoSeedTimer - iv, iv);
        autoSeed();
      }
    }

    // Emergency pipette.
    if (!pipetteReady()) {
      if (pipetteWanted()) {
        s.pipetteTimer += dt;
        if (pipetteReady()) toast(TEXT.pipetteReady, 'info');
      } else s.pipetteTimer = 0;
    }

    // Archivo free print.
    if (level('archive') > 0 && !archiveReady()) {
      s.archiveTimer += dt;
      if (archiveReady()) toast(TEXT.freePrintReady, 'info');
    }

    // Doc §11: 20 min without a new species → Microscopio I offered free once.
    if (sinceNewSpecies > B.FREE_MICROSCOPE_AFTER && s.species.length > 0 && level('microscope') === 0 && !s.flags.freeMicroscope) {
      s.flags.freeMicroscope = true;
      s.upgrades.microscope = 1;
      if (!s.unlocked.includes('microscope')) s.unlocked.push('microscope');
      bus.emit('upgradeBought', { id: 'microscope', level: 1 });
    }
  }

  // ───────────────────────────── save / offline ──────────────────────

  function applyOffline(seconds: number): void {
    const secs = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    const cap = B.RESERVE_HOURS[Math.min(level('reserve'), B.RESERVE_HOURS.length - 1)] * 3600;
    const gain = offlineEssence(averageEps(s.epsHistory, s.bucketSum, s.bucketTime), secs, cap);
    addEssence(gain);
    if (secs >= B.OFFLINE_MIN_RETURN) {
      s.flags.returned = true;
      s.stats.returns++;
    }
    bus.emit('offlineReturn', { seconds: secs, essence: gain });
    checkProgress();
  }

  function replaceState(next: GameState): void {
    s = next;
    clearTransient();
    portraitCache.clear();
    displayCache.clear();
    shapeCache.clear();
    portraitBest.clear();
    portraitCaptures.clear();
    sanitizeLoaded();
    refreshUnlocks(true);
    bus.emit('dishClear', {});
    calibrationChanged();
  }

  const game: Game = {
    actions,
    view,
    tick,
    get simParams() {
      return params;
    },
    get speed() {
      return s.speed;
    },
    setBonus(id, name, mult) {
      if (!(mult > 0) || mult === 1) bonuses.delete(id);
      else bonuses.set(id, { name, mult });
    },
    setSpeciesPortrait(speciesId, p, creatureId) {
      const sp = speciesById(speciesId);
      if (!sp || !p || !(p.w > 0) || !(p.h > 0) || p.data.length !== p.w * p.h) return;
      const iso = isolateCreature(p);
      if (!(iso.stats.mass > 0)) return;
      if (creatureId === undefined && lastFounder?.speciesId === speciesId) creatureId = lastFounder.creatureId;
      const c = creatureId !== undefined ? creatures.find((x) => x.id === creatureId) : undefined;
      const sigDist = c ? signatureDistance(signatureOf(c), sp.signature) : undefined;
      const score = portraitScore(p, sigDist);
      let best = portraitBest.get(sp.id);
      if (best === undefined && sp.portrait) {
        // A portrait from an earlier session: unknown provenance, so a clean capture beats it.
        const old = portraitOf(sp);
        best = old ? portraitScore(old) - B.PORTRAIT_OLD_PENALTY : -Infinity;
      }
      if (best !== undefined && !(score > best)) return;
      sp.portrait = quantizePattern(cropPattern(tightSquare(iso.pattern, 1), B.PORTRAIT_MAX_SIDE));
      sp.R = s.calib.R;
      portraitBest.set(sp.id, score);
      portraitCache.delete(sp.id);
      displayCache.delete(sp.id);
      shapeCache.delete(sp.id);
    },
    takePortraitRequests() {
      const out = portraitQueue;
      portraitQueue = [];
      return out;
    },
    serialize: () => serializeState(s),
    exportString: () => B.EXPORT_PREFIX + utf8ToBase64(serializeState(s)),
    importString(str) {
      if (typeof str !== 'string' || !str.trim().startsWith(B.EXPORT_PREFIX)) return false;
      const next = loadAny(str);
      if (!next) return false;
      replaceState(next);
      return true;
    },
    applyOffline,
    reset() {
      const settings = { ...s.settings };
      const fresh = defaultState(now());
      fresh.settings = settings;
      replaceState(fresh);
    },
    get isPaused() {
      return paused;
    },
    set isPaused(v: boolean) {
      paused = !!v;
    },
    setGridSize(w, h) {
      if (w > 0 && h > 0) grid = { w, h };
    },
    get state() {
      return s;
    },
  };
  sanitizeLoaded();
  params = makeParams();
  refreshUnlocks(true);
  return game;
}
