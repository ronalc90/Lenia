/**
 * Research tree (docs/CICLO.md §4): the permanent upgrades bought with Datos between lab sessions.
 * Pure data + pure functions (no DOM, no state of its own): the game keeps the levels
 * (`Record<nodeId, level>`) and asks this module what they mean.
 *
 *  - TREE_NODES        54 nodes: the centre ("Nueva noche", level = night) and 7 STRAIGHT routes
 *                      (⏱ Reloj, 💧 Gotero, 🧫 Placa, 🌱 Vida, 🔬 Descubrir, 🌍 Mundos, ✨ Destello).
 *                      Node k of a route needs only node k − 1 (level ≥ 1); the first needs the centre.
 *                      No crossings, no trade-offs: every level makes one number better.
 *  - beforeAfter()     "antes → después" of the next level, from the real effects (owner rule).
 *  - treeStates(ctx)   owned / available / locked / mystery ("?") / hidden, for every node.
 *  - canBuy / buyNode  the purchase rules (prerequisite, night rings, night gates, price).
 *  - treeEffects(lv)   everything the tree changes, folded into one TreeEffects object.
 *  - nodeCost / priceRule / costRows / sessionsToAfford   the price, its one rule in plain words
 *                      and the next levels.
 *  - layout            rings are bands around the centre: every node of ring r sits between the
 *                      night circles of its ring, so "outside this circle opens on Night N" reads at
 *                      a glance; within a route the nodes march straight out along the route's axis.
 *
 * Reveal rule: a node is visible when its prerequisite is owned; the next one shows as "?"; the
 * rest of the route is hidden. Rings the current night has not opened show "?" with a moon.
 */
import type { Text } from '../core/types';
import { DISH_DIAMETERS } from '../core/dish';
import { GOLDEN_FIRST_DELAY, GOLDEN_INTERVAL, GOLDEN_LIFE, MUTAGEN_SEEDS, SEED_CROWD } from './balance';
import * as C from './cycleBalance';
import { formatDuration, formatNumber } from './format';
import { NODE_TEXT, VALUE_TEXT as V, type BranchId } from './treeText';
import { BASE_WORLD, WORLD_BY_ID, WORLDS, worldSpeciesCount, type WorldId } from './worlds';

export type { BranchId } from './treeText';

/** Route order around the centre, clockwise from the top (index × 360/7 degrees). */
export const BRANCHES: BranchId[] = ['time', 'dropper', 'dish', 'life', 'discovery', 'worlds', 'spark'];
/** Degrees between two neighbouring routes. */
export const BRANCH_STEP = 360 / BRANCHES.length;

/** Everything the research tree changes. The game reads these instead of upgrade levels. */
export interface TreeEffects {
  // ── ⏱ Session clock ──
  /** Length of a session, seconds. */
  sessionSeconds: number;
  /** Seconds added per species registered for the first time ever during a session (base rule). */
  timePerSpecies: number;
  /** Seconds added per Encargo completed during a session. */
  timePerEncargo: number;
  /** Seconds added per Spark caught. */
  timePerGolden: number;
  /** Production multiplier during the last SPRINT_SECONDS (1 = no sprint). */
  sprintMult: number;
  /** Best creatures (one per species) planted alive at the start of the next session. */
  fridge: number;
  // ── 💧 Seeding ──
  startEssence: number;
  freeSeeds: number;
  /** Gotero tree level 0–3 (seed bias/noise: cycleBalance DROPPER_TREE_BIAS/NOISE). */
  dropper: number;
  /** Estabilizador tree level 0–5. */
  stabilizer: number;
  /** Gotero maestro: every random seed is the pure template (it always takes). */
  masterDropper: boolean;
  /** Long press sows a big seed (radius ×1,5, price ×2,25). */
  bigSeed: boolean;
  /** Sembrador automático level (0 = none). */
  autoSeeder: number;
  /** Seconds between auto-seeds (Infinity without the Sembrador). */
  autoSeedInterval: number;
  /** Seed price multiplier (Gotas baratas). */
  seedCostMult: number;
  // ── 🧫 Dish ──
  /** Round dish size index (core/dish DISH_DIAMETERS: 0 = Ø96 … 4 = Ø224). */
  dishLevel: number;
  /** Cheap creature slots on top of balance DISH_FREE_SLOTS[dishLevel]. */
  extraSlots: number;
  /** Crowding factor of the seed price (replaces balance SEED_CROWD). */
  crowdFactor: number;
  /** The first N creatures alive never raise the seed price (Guardería). */
  nurseryBonus: number;
  /** Seeds become paying creatures this many times faster (Incubadora). */
  matureSpeed: number;
  /** +fraction of production per distinct species alive on the dish (Ecosistema). */
  ecosystem: number;
  // ── 🌱 Life ──
  /** Production multiplier of the plain Vida nodes (Cultivo × Superalimento × Vida abundante × Vida eterna). */
  prodMult: number;
  /** Measured complexity multiplier (Nutriente). */
  complexityMult: number;
  /** +fraction of production by behaviour family (Nadadoras / Tranquilas / Familias). */
  affinity: { swim: number; still: number; colony: number };
  /** Two different species touching both produce SYMBIOSIS_TREE_MULT. */
  symbiosis: boolean;
  // ── 🔬 Discovery ──
  datosPerSpecies: number;
  datosPerBehavior: number;
  /** Copiadora: plant a copy of a Bestiary species (pure template). */
  print: boolean;
  /** +fraction to every registered species' multiplier (Catalogación). */
  cataloguing: number;
  /** Seconds between free copies (Archivo); Infinity = none. */
  archiveInterval: number;
  /** 0–2: I ranges + behaviour marks, II every detail. */
  microscope: number;
  /** Spores prefer forms you do not have yet. */
  rareSpores: boolean;
  /** Copies sometimes change (variants). */
  mutations: boolean;
  /** Multiplier of all the Datos of a session (Gran enciclopedia). */
  datosMult: number;
  // ── 🌍 Worlds ──
  /** Worlds the start card offers, in order (always starts with BASE_WORLD). */
  worlds: WorldId[];
  // ── ✨ Spark ──
  goldenIntervalMult: number;
  goldenLifeBonus: number;
  /** First Spark of every session within this window (s); null = the usual delay. */
  goldenFirstDelay: [number, number] | null;
  goldenRewardMult: number;
  datosPerGolden: number;
  mutagenSeeds: number;
  // ── 🌙 Night (story era) ──
  night: number;
  /** Multiplier of the Esencia part of the conversion from nights (+10 % each after the first). */
  datosNightMult: number;
}

export interface TreeNodeDef {
  id: string;
  branch: BranchId | 'core';
  /** Position along its route (1 = next to the centre). */
  step: number;
  /** Price ring 1–5: the first price (TREE_RING_START) and the night that opens it (TREE_RING_NIGHT). */
  ring: number;
  /** Icon id (src/ui/tree/icons.ts). */
  icon: string;
  maxLevel: number;
  /** The node before it on its route (the centre for the first); drawn as the line. */
  requires: string[];
  /** Price factor per level. */
  growth: number;
  /** Shown bigger (the centre). */
  big?: boolean;
  /** The world this node opens (Mundos route). */
  world?: WorldId;
  /**
   * A later node on the route that does this node's job completely (Gotero maestro → every seed
   * takes; Placa gigante → the biggest dish). Once that one is owned this node counts as complete,
   * so no level can ever be bought for nothing.
   */
  supersededBy?: string;
  /** Fold this node's effect at `level` (1..maxLevel) into fx. */
  apply?(fx: TreeEffects, level: number): void;
  /** The number "antes → después" compares; every level makes it strictly better. */
  measure(fx: TreeEffects, level: number): number;
  /** True when a smaller number is better (prices, waiting times). */
  lower?: boolean;
  /** How that number reads ("Sesión 3:30", "Prenden 35 %"). */
  show(fx: TreeEffects, level: number): Text;
}

// ───────────────────────────── value formatting ─────────────────────

const same = (s: string): Text => ({ es: s, en: s });
/** Decimal comma in Spanish ("38,6"), point in English. */
const loc = (s: string): Text => ({ es: s.replace(/(\d)\.(\d)/g, '$1,$2'), en: s });
const pctNum = (x: number): string => String(Math.round(x * 100));
/** "×1,5" in Spanish, "×1.5" in English (two decimals at most, trailing zeros dropped). */
export function multText(x: number): Text {
  const s = (Math.round(x * 100) / 100).toString();
  return { es: `×${s.replace('.', ',')}`, en: `×${s}` };
}
const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const num1 = (x: number): string => formatNumber(Math.round(x * 10) / 10);

/** Measured share of random seeds that take with these effects (cycleBalance SEED_SUCCESS). */
export function seedSuccess(fx: Pick<TreeEffects, 'dropper' | 'stabilizer' | 'masterDropper'>): number {
  if (fx.masterDropper) return 1;
  const row = C.SEED_SUCCESS[Math.max(0, Math.min(C.SEED_SUCCESS.length - 1, fx.dropper))];
  return row[Math.max(0, Math.min(row.length - 1, fx.stabilizer))];
}

/** Template bias and noise of a random seed with these effects (the integrator feeds them to SeedSpec). */
export function seedConfig(fx: Pick<TreeEffects, 'dropper' | 'stabilizer' | 'masterDropper'>): { bias: number; noise: number } {
  if (fx.masterDropper) return { bias: 1, noise: C.DROPPER_MASTER_NOISE };
  const d = Math.max(0, Math.min(C.DROPPER_TREE_BIAS.length - 1, fx.dropper));
  return {
    bias: Math.min(0.99, C.DROPPER_TREE_BIAS[d] + C.STABILIZER_TREE_BIAS * fx.stabilizer),
    noise: Math.max(C.DROPPER_MASTER_NOISE, C.DROPPER_TREE_NOISE[d] - C.STABILIZER_TREE_NOISE * fx.stabilizer),
  };
}

/** Sembrador automático interval at a level ≥ 1. */
function autoInterval(level: number): number {
  return level > 0 ? C.AUTOSEED_TREE_INTERVAL * Math.pow(C.AUTOSEED_TREE_DECAY, level - 1) : Infinity;
}

/** Species the unlocked worlds can grow (Bestiary entries). */
export function possibleSpecies(fx: Pick<TreeEffects, 'worlds'>): number {
  return fx.worlds.reduce((a, w) => a + worldSpeciesCount(w), 0);
}

// ───────────────────────────── routes ──────────────────────────────

type NodeSpec = Omit<TreeNodeDef, 'branch' | 'step' | 'requires' | 'growth'> & { growth?: number };

/** A straight route: node k requires node k − 1; the first requires the centre. */
function route(branch: BranchId, specs: NodeSpec[]): TreeNodeDef[] {
  return specs.map((s, i) => ({
    ...s,
    branch,
    step: i + 1,
    requires: [i === 0 ? 'lab' : specs[i - 1].id],
    growth: s.growth ?? (s.maxLevel >= C.TREE_LONG_LEVELS ? C.TREE_GROWTH_LONG : C.TREE_GROWTH),
  }));
}

const session = (fx: TreeEffects): Text => V.session(clock(fx.sessionSeconds));
const success = (fx: TreeEffects): Text => V.success(pctNum(seedSuccess(fx)));
const dishSize = (fx: TreeEffects): Text => V.diameter(DISH_DIAMETERS[Math.min(DISH_DIAMETERS.length - 1, fx.dishLevel)]);
const plusPct = (x: number, what: (p: string) => Text): Text => what(pctNum(x));
const range = (a: number, b: number): string => `${Math.round(a)}–${Math.round(b)}`;

/** Every world node: opens one world (in order) and its species. */
function worldNode(world: WorldId, ring: number, icon: string): NodeSpec {
  return {
    id: WORLD_BY_ID[world].node!,
    ring,
    icon,
    maxLevel: 1,
    world,
    apply: (fx) => void fx.worlds.push(world),
    measure: (fx) => possibleSpecies(fx),
    show: (fx) => V.species(possibleSpecies(fx)),
  };
}

export const TREE_NODES: TreeNodeDef[] = [
  // ───── Centre: the night (story era). Level = night; it moves on for free when the gate is met. ─────
  {
    id: 'lab',
    branch: 'core',
    step: 0,
    ring: 0,
    icon: 'lab',
    maxLevel: C.NIGHT_MAX,
    requires: [],
    growth: C.NIGHT_GROWTH,
    big: true,
    apply: (fx, l) => {
      fx.night = l;
      fx.datosNightMult = 1 + C.DATOS_NIGHT_BONUS * (l - 1);
    },
    measure: (fx) => fx.night,
    show: (fx) => V.night(fx.night),
  },

  // ───── ⏱ Reloj ─────
  ...route('time', [
    { id: 'clock', ring: 1, icon: 'clock', maxLevel: 3, apply: (fx, l) => void (fx.sessionSeconds += l * C.TIME_CLOCK), measure: (fx) => fx.sessionSeconds, show: session },
    { id: 'clock2', ring: 2, icon: 'clock2', maxLevel: 2, apply: (fx, l) => void (fx.sessionSeconds += l * C.TIME_CLOCK2), measure: (fx) => fx.sessionSeconds, show: session },
    { id: 'fridge', ring: 2, icon: 'fridge', maxLevel: 3, apply: (fx, l) => void (fx.fridge += l * C.FRIDGE_PER_LEVEL), measure: (fx) => fx.fridge, show: (fx) => V.fridge(fx.fridge) },
    { id: 'sprint', ring: 3, icon: 'sprint', maxLevel: 3, apply: (fx, l) => void (fx.sprintMult = 1 + l * C.SPRINT_PER_LEVEL), measure: (fx) => fx.sprintMult, show: (fx) => V.sprint(multText(fx.sprintMult)) },
    { id: 'encTime', ring: 3, icon: 'encTime', maxLevel: 2, apply: (fx, l) => void (fx.timePerEncargo += l * C.TIME_ENCARGO_BONUS), measure: (fx) => fx.timePerEncargo, show: (fx) => V.perEncargo(fx.timePerEncargo) },
    { id: 'clock3', ring: 4, icon: 'clock3', maxLevel: 2, apply: (fx, l) => void (fx.sessionSeconds += l * C.TIME_CLOCK3), measure: (fx) => fx.sessionSeconds, show: session },
    { id: 'clock4', ring: 5, icon: 'clock4', maxLevel: 3, apply: (fx, l) => void (fx.sessionSeconds += l * C.TIME_CLOCK4), measure: (fx) => fx.sessionSeconds, show: session },
  ]),

  // ───── 💧 Gotero ─────
  ...route('dropper', [
    { id: 'dropper', ring: 1, icon: 'dropper', maxLevel: 3, supersededBy: 'dropperMax', apply: (fx, l) => void (fx.dropper = l), measure: seedSuccess, show: success },
    { id: 'startEssence', ring: 2, icon: 'startEssence', maxLevel: 4, apply: (fx, l) => void (fx.startEssence += C.START_ESSENCE_BY_LEVEL[l] ?? 0), measure: (fx) => fx.startEssence, show: (fx) => V.startEssence(fx.startEssence) },
    { id: 'freeSeeds', ring: 3, icon: 'freeSeeds', maxLevel: 3, apply: (fx, l) => void (fx.freeSeeds += l * C.FREE_SEEDS_PER_LEVEL), measure: (fx) => fx.freeSeeds, show: (fx) => V.freeSeeds(fx.freeSeeds) },
    { id: 'stabilizer', ring: 3, icon: 'stabilizer', maxLevel: 5, supersededBy: 'dropperMax', apply: (fx, l) => void (fx.stabilizer = l), measure: seedSuccess, show: success },
    { id: 'bigSeed', ring: 3, icon: 'bigSeed', maxLevel: 1, apply: (fx) => void (fx.bigSeed = true), measure: (fx) => (fx.bigSeed ? 1 : 0), show: (fx) => (fx.bigSeed ? V.bigSeed(loc(String(C.BIG_SEED_AREA))) : V.no) },
    { id: 'autoSeeder', ring: 3, icon: 'autoSeeder', maxLevel: 6, apply: (fx, l) => void ((fx.autoSeeder = l), (fx.autoSeedInterval = autoInterval(l))), measure: (fx) => (fx.autoSeeder ? 1 / fx.autoSeedInterval : 0), show: (fx) => (fx.autoSeeder ? V.every(loc(num1(fx.autoSeedInterval))) : V.never) },
    { id: 'cheapSeeds', ring: 4, icon: 'cheapSeeds', maxLevel: 3, lower: true, apply: (fx, l) => void (fx.seedCostMult *= Math.pow(C.CHEAP_SEEDS_FACTOR, l)), measure: (fx) => fx.seedCostMult, show: (fx) => (fx.seedCostMult < 1 ? V.seedPrice(pctNum(1 - fx.seedCostMult)) : V.normalPrice) },
    { id: 'dropperMax', ring: 5, icon: 'dropperMax', maxLevel: 1, apply: (fx) => void (fx.masterDropper = true), measure: seedSuccess, show: success },
  ]),

  // ───── 🧫 Placa ─────
  ...route('dish', [
    { id: 'dish', ring: 1, icon: 'dish', maxLevel: C.DISH_TREE_LEVELS, supersededBy: 'dishXL', growth: C.TREE_GROWTH_STEEP, apply: (fx, l) => void (fx.dishLevel = Math.max(fx.dishLevel, l)), measure: (fx) => fx.dishLevel, show: dishSize },
    { id: 'slots', ring: 2, icon: 'slots', maxLevel: 3, apply: (fx, l) => void (fx.extraSlots += l * C.SLOTS_PER_LEVEL), measure: (fx) => fx.extraSlots, show: (fx) => V.slots(fx.extraSlots) },
    { id: 'crowdCost', ring: 3, icon: 'crowdCost', maxLevel: 2, lower: true, apply: (fx, l) => void (fx.crowdFactor = C.CROWD_BY_LEVEL[l] ?? fx.crowdFactor), measure: (fx) => fx.crowdFactor, show: (fx) => (fx.crowdFactor < SEED_CROWD ? V.crowd(pctNum(1 - fx.crowdFactor / SEED_CROWD)) : V.crowdNormal) },
    { id: 'nursery', ring: 3, icon: 'nursery', maxLevel: 1, apply: (fx) => void (fx.nurseryBonus += C.NURSERY_BONUS), measure: (fx) => fx.nurseryBonus, show: (fx) => (fx.nurseryBonus ? V.nursery(fx.nurseryBonus) : V.no) },
    { id: 'incubator', ring: 3, icon: 'incubator', maxLevel: 2, growth: C.TREE_GROWTH_STEEP, apply: (fx, l) => void (fx.matureSpeed = C.MATURE_SPEED_BY_LEVEL[l] ?? fx.matureSpeed), measure: (fx) => fx.matureSpeed, show: (fx) => V.mature(multText(fx.matureSpeed)) },
    { id: 'dishXL', ring: 4, icon: 'dishXL', maxLevel: 1, apply: (fx) => void (fx.dishLevel = Math.max(fx.dishLevel, C.DISH_XL_LEVEL)), measure: (fx) => fx.dishLevel, show: dishSize },
    { id: 'ecosystem', ring: 4, icon: 'ecosystem', maxLevel: 2, apply: (fx, l) => void (fx.ecosystem += l * C.ECOSYSTEM_PER_SPECIES), measure: (fx) => fx.ecosystem, show: (fx) => plusPct(fx.ecosystem, V.perSpecies) },
  ]),

  // ───── 🌱 Vida ─────
  ...route('life', [
    { id: 'culture', ring: 1, icon: 'culture', maxLevel: 5, apply: (fx, l) => void (fx.prodMult *= Math.pow(C.CULTURE_TREE_MULT, l)), measure: (_fx, l) => Math.pow(C.CULTURE_TREE_MULT, l), show: (_fx, l) => V.essenceMult(multText(Math.pow(C.CULTURE_TREE_MULT, l))) },
    { id: 'nutrient', ring: 2, icon: 'nutrient', maxLevel: 3, apply: (fx, l) => void (fx.complexityMult *= 1 + l * C.NUTRIENT_TREE_BONUS), measure: (_fx, l) => l, show: (_fx, l) => plusPct(l * C.NUTRIENT_TREE_BONUS, V.essencePlus) },
    { id: 'culture2', ring: 3, icon: 'culture2', maxLevel: 3, apply: (fx, l) => void (fx.prodMult *= Math.pow(C.CULTURE2_MULT, l)), measure: (_fx, l) => Math.pow(C.CULTURE2_MULT, l), show: (_fx, l) => V.essenceMult(multText(Math.pow(C.CULTURE2_MULT, l))) },
    { id: 'swimAffinity', ring: 3, icon: 'swimAffinity', maxLevel: 3, apply: (fx, l) => void (fx.affinity.swim += l * C.AFFINITY_TREE_BONUS), measure: (fx) => fx.affinity.swim, show: (fx) => plusPct(fx.affinity.swim, V.swimmers) },
    { id: 'stillAffinity', ring: 3, icon: 'sessileAffinity', maxLevel: 3, apply: (fx, l) => void (fx.affinity.still += l * C.AFFINITY_TREE_BONUS), measure: (fx) => fx.affinity.still, show: (fx) => plusPct(fx.affinity.still, V.still) },
    { id: 'colonyAffinity', ring: 4, icon: 'colonyAffinity', maxLevel: 3, apply: (fx, l) => void (fx.affinity.colony += l * C.AFFINITY_TREE_BONUS), measure: (fx) => fx.affinity.colony, show: (fx) => plusPct(fx.affinity.colony, V.colonies) },
    { id: 'symbiosis', ring: 4, icon: 'symbiosis', maxLevel: 1, apply: (fx) => void (fx.symbiosis = true), measure: (fx) => (fx.symbiosis ? 1 : 0), show: (fx) => (fx.symbiosis ? V.pairs(multText(C.SYMBIOSIS_TREE_MULT)) : V.no) },
    { id: 'abundance', ring: 4, icon: 'abundance', maxLevel: 1, apply: (fx) => void (fx.prodMult *= C.ABUNDANCE_MULT), measure: (_fx, l) => (l ? C.ABUNDANCE_MULT : 1), show: (_fx, l) => V.allEssence(multText(l ? C.ABUNDANCE_MULT : 1)) },
    { id: 'eternalLife', ring: 5, icon: 'eternalLife', maxLevel: C.ETERNAL_LIFE_MAX, growth: C.ETERNAL_LIFE_GROWTH, apply: (fx, l) => void (fx.prodMult *= Math.pow(C.ETERNAL_LIFE_MULT, l)), measure: (_fx, l) => Math.pow(C.ETERNAL_LIFE_MULT, l), show: (_fx, l) => V.essenceMult(multText(Math.pow(C.ETERNAL_LIFE_MULT, l))) },
  ]),

  // ───── 🔬 Descubrir ─────
  ...route('discovery', [
    { id: 'notebook', ring: 1, icon: 'notebook', maxLevel: 3, apply: (fx, l) => void (fx.datosPerSpecies += l * C.NOTEBOOK_DATOS), measure: (fx) => fx.datosPerSpecies, show: (fx) => V.datosPerSpecies(fx.datosPerSpecies) },
    { id: 'print', ring: 2, icon: 'print', maxLevel: 1, apply: (fx) => void (fx.print = true), measure: (fx) => (fx.print ? 1 : 0), show: (fx) => (fx.print ? V.copies : V.no) },
    { id: 'cataloguing', ring: 3, icon: 'cataloguing', maxLevel: 5, apply: (fx, l) => void (fx.cataloguing += l * C.CATALOG_TREE_BONUS), measure: (fx) => fx.cataloguing, show: (fx) => plusPct(fx.cataloguing, V.bestiaryEssence) },
    { id: 'archive', ring: 3, icon: 'archive', maxLevel: 2, lower: true, apply: (fx, l) => void (fx.archiveInterval = C.ARCHIVE_TREE_INTERVAL[l] ?? fx.archiveInterval), measure: (fx) => (Number.isFinite(fx.archiveInterval) ? fx.archiveInterval : 1e9), show: (fx) => (Number.isFinite(fx.archiveInterval) ? V.freeCopy(fx.archiveInterval) : V.never) },
    { id: 'microscope', ring: 3, icon: 'microscope', maxLevel: 2, apply: (fx, l) => void (fx.microscope = l), measure: (fx) => fx.microscope, show: (fx) => V.microscope[fx.microscope] ?? V.no },
    { id: 'discoBonus', ring: 4, icon: 'discoBonus', maxLevel: 2, apply: (fx, l) => void (fx.datosPerBehavior += l * C.DISCO_BONUS_DATOS), measure: (fx) => fx.datosPerBehavior, show: (fx) => V.datosPerBehavior(fx.datosPerBehavior) },
    { id: 'rareSpores', ring: 4, icon: 'rareSpores', maxLevel: 1, apply: (fx) => void (fx.rareSpores = true), measure: (fx) => (fx.rareSpores ? 1 : 0), show: (fx) => (fx.rareSpores ? V.seekNew : V.no) },
    { id: 'mutations', ring: 4, icon: 'mutations', maxLevel: 1, apply: (fx) => void (fx.mutations = true), measure: (fx) => (fx.mutations ? 1 : 0), show: (fx) => (fx.mutations ? V.variants : V.no) },
    { id: 'encyclopedia', ring: 5, icon: 'encyclopedia', maxLevel: 3, apply: (fx, l) => void (fx.datosMult *= 1 + l * C.ENCYCLOPEDIA_BONUS), measure: (fx) => fx.datosMult, show: (fx) => plusPct(fx.datosMult - 1, V.allDatos) },
  ]),

  // ───── 🌍 Mundos (replaces Calibrar: no knobs, worlds open in order) ─────
  ...route('worlds', [
    worldNode('cold', 1, 'worldCold'),
    worldNode('gyro', 2, 'worldGyro'),
    worldNode('shields', 3, 'worldShields'),
    worldNode('helix', 3, 'worldHelix'),
    worldNode('legs', 4, 'worldLegs'),
    worldNode('giants', 5, 'worldGiants'),
  ]),

  // ───── ✨ Destello ─────
  ...route('spark', [
    { id: 'spark', ring: 1, icon: 'spark', maxLevel: 3, lower: true, apply: (fx, l) => void (fx.goldenIntervalMult *= Math.pow(C.GOLDEN_INTERVAL_FACTOR, l)), measure: (fx) => fx.goldenIntervalMult, show: (fx) => V.sparkEvery(range(GOLDEN_INTERVAL[0] * fx.goldenIntervalMult, GOLDEN_INTERVAL[1] * fx.goldenIntervalMult)) },
    { id: 'sparkLife', ring: 2, icon: 'sparkLife', maxLevel: 2, apply: (fx, l) => void (fx.goldenLifeBonus += l * C.GOLDEN_LIFE_BONUS), measure: (fx) => fx.goldenLifeBonus, show: (fx) => V.sparkStays(GOLDEN_LIFE + fx.goldenLifeBonus) },
    { id: 'sparkTime', ring: 2, icon: 'sparkTime', maxLevel: 2, apply: (fx, l) => void (fx.timePerGolden += l * C.TIME_PER_GOLDEN), measure: (fx) => fx.timePerGolden, show: (fx) => V.perSpark(fx.timePerGolden) },
    { id: 'sparkFirst', ring: 3, icon: 'sparkFirst', maxLevel: 1, apply: (fx) => void (fx.goldenFirstDelay = [...C.GOLDEN_FIRST_FAST]), measure: (fx) => (fx.goldenFirstDelay ? 1 : 0), show: (fx) => V.firstSpark(range(...(fx.goldenFirstDelay ?? GOLDEN_FIRST_DELAY))) },
    { id: 'sparkGift', ring: 3, icon: 'sparkGift', maxLevel: 3, apply: (fx, l) => void (fx.goldenRewardMult *= 1 + l * C.GOLDEN_GIFT_BONUS), measure: (fx) => fx.goldenRewardMult, show: (fx) => V.gifts(multText(fx.goldenRewardMult)) },
    { id: 'sparkDatos', ring: 3, icon: 'sparkDatos', maxLevel: 2, apply: (fx, l) => void (fx.datosPerGolden += l * C.GOLDEN_DATOS), measure: (fx) => fx.datosPerGolden, show: (fx) => V.datosPerSpark(fx.datosPerGolden) },
    { id: 'sparkMutagen', ring: 4, icon: 'sparkMutagen', maxLevel: 1, apply: (fx) => void (fx.mutagenSeeds = C.MUTAGEN_TREE_SEEDS), measure: (fx) => fx.mutagenSeeds, show: (fx) => V.sureSeeds(fx.mutagenSeeds) },
  ]),
];

export const TREE_BY_ID: Readonly<Record<string, TreeNodeDef>> = Object.fromEntries(TREE_NODES.map((n) => [n.id, n]));

/** The nodes of one route, centre outwards. */
export function routeNodes(b: BranchId): TreeNodeDef[] {
  return TREE_NODES.filter((n) => n.branch === b).sort((a, c) => a.step - c.step);
}

// ───────────────────────────── effects ─────────────────────────────

/** What a fresh save without a single node gets. */
export function baseEffects(): TreeEffects {
  return {
    sessionSeconds: C.SESSION_BASE_SECONDS,
    timePerSpecies: C.SESSION_TIME_PER_SPECIES,
    timePerEncargo: C.SESSION_TIME_PER_ENCARGO,
    timePerGolden: 0,
    sprintMult: 1,
    fridge: 0,
    startEssence: C.SESSION_START_ESSENCE,
    freeSeeds: C.SESSION_BASE_FREE_SEEDS,
    dropper: 0,
    stabilizer: 0,
    masterDropper: false,
    bigSeed: false,
    autoSeeder: 0,
    autoSeedInterval: Infinity,
    seedCostMult: 1,
    dishLevel: 0,
    extraSlots: 0,
    crowdFactor: SEED_CROWD,
    nurseryBonus: 0,
    matureSpeed: 1,
    ecosystem: 0,
    prodMult: 1,
    complexityMult: 1,
    affinity: { swim: 0, still: 0, colony: 0 },
    symbiosis: false,
    datosPerSpecies: C.DATOS_PER_NEW_SPECIES,
    datosPerBehavior: C.DATOS_PER_NEW_BEHAVIOR,
    print: false,
    cataloguing: 0,
    archiveInterval: Infinity,
    microscope: 0,
    rareSpores: false,
    mutations: false,
    datosMult: 1,
    worlds: [BASE_WORLD],
    goldenIntervalMult: 1,
    goldenLifeBonus: 0,
    goldenFirstDelay: null,
    goldenRewardMult: 1,
    datosPerGolden: 0,
    mutagenSeeds: MUTAGEN_SEEDS,
    night: 1,
    datosNightMult: 1,
  };
}

/** Level of a node (the centre is always at least night 1). */
export function nodeLevel(levels: Readonly<Record<string, number>>, id: string): number {
  const def = TREE_BY_ID[id];
  const raw = levels[id];
  const l = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 0;
  if (!def) return 0;
  return Math.max(id === 'lab' ? 1 : 0, Math.min(def.maxLevel, l));
}

/** A later node of the route already does this node's whole job (TreeNodeDef.supersededBy). */
export function isSuperseded(levels: Readonly<Record<string, number>>, id: string): boolean {
  const by = TREE_BY_ID[id]?.supersededBy;
  return !!by && nodeLevel(levels, by) > 0;
}

/** Everything the tree changes for these levels (unknown ids are ignored). */
export function treeEffects(levels: Readonly<Record<string, number>>): TreeEffects {
  const fx = baseEffects();
  for (const def of TREE_NODES) {
    const l = nodeLevel(levels, def.id);
    if (l > 0 && def.apply) def.apply(fx, l);
  }
  return fx;
}

/**
 * "Antes → después" of the next level of a node (owner rule: always numbers, always better).
 * `before` is what the player has now, `after` what one more level gives (null when maxed).
 */
export function beforeAfter(levels: Readonly<Record<string, number>>, id: string): { before: Text; after: Text | null; better: boolean } {
  const def = TREE_BY_ID[id];
  if (!def) return { before: same(''), after: null, better: false };
  const l = nodeLevel(levels, id);
  const fx0 = treeEffects(levels);
  const before = def.show(fx0, l);
  if (l >= def.maxLevel || isSuperseded(levels, id)) return { before, after: null, better: false };
  const fx1 = treeEffects({ ...levels, [id]: l + 1 });
  const a = def.measure(fx0, l);
  const b = def.measure(fx1, l + 1);
  return { before, after: def.show(fx1, l + 1), better: def.lower ? b < a : b > a };
}

// ───────────────────────────── prices ──────────────────────────────

/** friendly(): < 100 whole numbers; above, 2 significant digits (12, 25, 150, 510, 1 200). */
export function niceRound(x: number): number {
  if (!Number.isFinite(x)) return Infinity;
  if (x <= 0) return 0;
  if (x < 100) return Math.max(1, Math.round(x));
  const p = Math.pow(10, Math.floor(Math.log10(x)) - 1);
  return Math.round(x / p) * p;
}

/** The price rule of a node: first level `start` (its ring), then ×`growth` per level. */
export function priceRule(id: string): { start: number; growth: number; single: boolean } {
  const def = TREE_BY_ID[id];
  if (!def) return { start: Infinity, growth: 1, single: true };
  if (id === 'lab') return { start: C.NIGHT_START, growth: C.NIGHT_GROWTH, single: false };
  return { start: C.TREE_RING_START[def.ring] ?? Infinity, growth: def.growth, single: def.maxLevel === 1 };
}

/** Datos for the next level of a node at `level` (Infinity when maxed or unknown). */
export function nodeCost(id: string, level: number): number {
  const def = TREE_BY_ID[id];
  if (!def) return Infinity;
  if (level >= def.maxLevel) return Infinity;
  const r = priceRule(id);
  // The centre: level = night; the first move (night 1 → 2) costs `start`.
  const n = id === 'lab' ? Math.max(0, level - 1) : Math.max(0, level);
  return niceRound(r.start * Math.pow(r.growth, n));
}

/** The next `n` levels after `level`: price and what the node gives then (bar chart). */
export function costRows(id: string, level: number, n = 3, levels: Readonly<Record<string, number>> = {}): { level: number; cost: number; value: Text }[] {
  const def = TREE_BY_ID[id];
  if (!def) return [];
  const out: { level: number; cost: number; value: Text }[] = [];
  for (let l = level; l < def.maxLevel && out.length < n; l++) {
    const lv = { ...levels, [id]: l + 1 };
    out.push({ level: l + 1, cost: nodeCost(id, l), value: def.show(treeEffects(lv), l + 1) });
  }
  return out;
}

/** Levels at or above this mean "no end" (the sheet shows ∞; totals skip it). */
export const ENDLESS_LEVELS = 99;

/** Total Datos to max a node from level 0 (for the bot and the docs; 0 for endless nodes). */
export function nodeTotalCost(id: string): number {
  const def = TREE_BY_ID[id];
  if (!def || def.maxLevel >= ENDLESS_LEVELS) return 0;
  let sum = 0;
  for (let l = id === 'lab' ? 1 : 0; l < def.maxLevel; l++) sum += nodeCost(id, l);
  return sum;
}

/**
 * "unas N sesiones": sessions of the recent average needed for `missing` Datos (null when there is
 * no history yet or nothing comes in). Rounded up, at least 1.
 */
export function sessionsToAfford(missing: number, recentDatos: readonly number[]): number | null {
  if (!(missing > 0)) return 0;
  const xs = recentDatos.filter((x) => Number.isFinite(x) && x > 0).slice(-C.SESSION_AFFORD_WINDOW);
  if (!xs.length) return null;
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.max(1, Math.ceil(missing / avg));
}

// ───────────────────────────── states & purchase ───────────────────

export interface TreeCtx {
  levels: Readonly<Record<string, number>>;
  /** Unspent Datos. */
  datos: number;
  /** Sessions finished (night gates). */
  sessions: number;
  /** Species in the Bestiary (night gates). */
  species: number;
}

export type NodeStatus = 'owned' | 'available' | 'locked' | 'mystery' | 'hidden';
export type BuyBlock = 'maxed' | 'hidden' | 'locked' | 'night' | 'gate' | 'datos' | 'unknown';

export interface NodeState {
  id: string;
  status: NodeStatus;
  level: number;
  maxLevel: number;
  maxed: boolean;
  /** Price of the next level (Infinity when maxed). */
  cost: number;
  affordable: boolean;
  /** Why it cannot be bought right now (null = it can). */
  block: BuyBlock | null;
  /** Night that opens its ring when that is what keeps it closed. */
  nightNeeded: number | null;
  /** Prerequisites not owned yet. */
  missingRequires: string[];
  /** Datos still missing (0 when affordable). */
  missingDatos: number;
}

/** Night a ring opens. */
export function ringNight(ring: number): number {
  return C.TREE_RING_NIGHT[ring] ?? 1;
}

export function nightOf(levels: Readonly<Record<string, number>>): number {
  return nodeLevel(levels, 'lab');
}

/** The centre's next night: price, gate and how far the player is. */
export interface NightInfo {
  night: number;
  /** null at NIGHT_MAX. */
  next: number | null;
  cost: number;
  gate: { sessions: number; species: number } | null;
  gateMet: boolean;
  /** Gate met (story: "a new night is ready"). */
  ready: boolean;
  affordable: boolean;
}

export function nightInfo(ctx: TreeCtx): NightInfo {
  const night = nightOf(ctx.levels);
  const next = night < C.NIGHT_MAX ? night + 1 : null;
  const gate = next ? (C.NIGHT_GATES[night - 1] ?? C.NIGHT_GATES[C.NIGHT_GATES.length - 1]) : null;
  const gateMet =
    !!gate && ctx.sessions >= gate.sessions && (ctx.species >= gate.species || ctx.sessions >= gate.sessions + C.NIGHT_GATE_FALLBACK);
  const cost = next ? nodeCost('lab', night) : Infinity;
  return { night, next, cost, gate, gateMet, ready: gateMet, affordable: gateMet && ctx.datos >= cost };
}

/** Status of every node. Routes are walked centre outwards, so a node's prerequisite is decided first. */
export function treeStates(ctx: TreeCtx): Map<string, NodeState> {
  const night = nightOf(ctx.levels);
  const ni = nightInfo(ctx);
  const out = new Map<string, NodeState>();
  const ordered = [...TREE_NODES].sort((a, b) => a.step - b.step);
  for (const def of ordered) {
    const level = nodeLevel(ctx.levels, def.id);
    const maxed = level >= def.maxLevel || (level > 0 && isSuperseded(ctx.levels, def.id));
    const cost = maxed ? Infinity : def.id === 'lab' ? ni.cost : nodeCost(def.id, level);
    const missingRequires = def.requires.filter((r) => nodeLevel(ctx.levels, r) < 1);
    const prevShown = def.requires.some((r) => {
      const s = out.get(r)?.status;
      return s === 'owned' || s === 'available' || s === 'locked';
    });
    const ringOpen = night >= ringNight(def.ring);
    let status: NodeStatus;
    let nightNeeded: number | null = null;
    if (level >= 1) status = 'owned';
    else if (!missingRequires.length && !ringOpen) {
      status = 'mystery';
      nightNeeded = ringNight(def.ring);
    } else if (!missingRequires.length) status = 'available';
    else if (prevShown) {
      status = 'mystery';
      if (!ringOpen) nightNeeded = ringNight(def.ring);
    } else status = 'hidden';
    let block: BuyBlock | null = null;
    if (maxed) block = 'maxed';
    else if (status === 'hidden') block = 'hidden';
    else if (nightNeeded !== null) block = 'night';
    else if (status === 'mystery' || missingRequires.length) block = 'locked';
    else if (def.id === 'lab' && !ni.gateMet) block = 'gate';
    else if (!(ctx.datos >= cost)) block = 'datos';
    out.set(def.id, {
      id: def.id,
      status,
      level,
      maxLevel: def.maxLevel,
      maxed,
      cost,
      affordable: block === null,
      block,
      nightNeeded,
      missingRequires,
      missingDatos: Number.isFinite(cost) ? Math.max(0, cost - ctx.datos) : 0,
    });
  }
  return out;
}

export function nodeState(ctx: TreeCtx, id: string): NodeState | null {
  return treeStates(ctx).get(id) ?? null;
}

export function canBuy(ctx: TreeCtx, id: string): { ok: boolean; block: BuyBlock | null } {
  if (!TREE_BY_ID[id]) return { ok: false, block: 'unknown' };
  const st = nodeState(ctx, id)!;
  return { ok: st.block === null, block: st.block };
}

export interface BuyResult {
  ok: boolean;
  block: BuyBlock | null;
  /** New levels (a copy; the input is never mutated). */
  levels: Record<string, number>;
  datos: number;
  cost: number;
  /** Nodes that became visible (were hidden or "?") with this purchase, for the reveal animation. */
  revealed: string[];
}

/** Buy one level of `id`. Pure: returns the new levels and Datos (the caller stores them). */
export function buyNode(ctx: TreeCtx, id: string): BuyResult {
  const { ok, block } = canBuy(ctx, id);
  const levels = { ...ctx.levels };
  if (!ok) return { ok, block, levels, datos: ctx.datos, cost: 0, revealed: [] };
  const before = treeStates(ctx);
  const cost = before.get(id)!.cost;
  levels[id] = nodeLevel(ctx.levels, id) + 1;
  const datos = ctx.datos - cost;
  const after = treeStates({ ...ctx, levels, datos });
  const shown = (s: NodeStatus | undefined) => s === 'owned' || s === 'available' || s === 'locked';
  const revealed: string[] = [];
  for (const [nid, s] of after) {
    const b = before.get(nid)!;
    if (nid === id) continue;
    if ((shown(s.status) && !shown(b.status)) || (s.status === 'mystery' && b.status === 'hidden')) revealed.push(nid);
  }
  return { ok: true, block: null, levels, datos, cost, revealed };
}

/** Nodes the player could buy right now (the "N mejoras listas" badge). */
export function affordableNodes(ctx: TreeCtx): string[] {
  return [...treeStates(ctx).values()].filter((s) => s.affordable).map((s) => s.id);
}

/** The cheapest node still to buy that is visible and only waits for Datos (summary / HUD "next goal"). */
export function nextGoal(ctx: TreeCtx): NodeState | null {
  let best: NodeState | null = null;
  for (const s of treeStates(ctx).values()) {
    if (s.id === 'lab') continue;
    if (s.block !== null && s.block !== 'datos') continue;
    if (s.status !== 'available' && s.status !== 'owned') continue;
    if (!best || s.cost < best.cost) best = s;
  }
  return best;
}

// ───────────────────────────── texts ───────────────────────────────

/** Name and description of a node. */
export function nodeText(id: string): { name: Text; desc: Text } {
  return NODE_TEXT[id] ?? { name: same(id), desc: same('') };
}

/**
 * What one level changes at `level` for a player with no other upgrades ("+30 s → +60 s" style);
 * kept for the docs table and old callers. The sheet uses beforeAfter() with the real levels.
 */
export function effectParts(id: string, level: number, levels: Readonly<Record<string, number>> = {}): { now: Text | null; next: Text | null } {
  const def = TREE_BY_ID[id];
  if (!def) return { now: null, next: null };
  const lv = { ...levels, [id]: level };
  const ba = beforeAfter(lv, id);
  return { now: ba.before, next: ba.after };
}

/** The same as one line: "Sesión 3:00 → 3:30"; just the value when maxed. */
export function effectLine(id: string, level: number, levels: Readonly<Record<string, number>> = {}): Text {
  const { now, next } = effectParts(id, level, levels);
  if (now && next) return { es: `${now.es} → ${next.es}`, en: `${now.en} → ${next.en}` };
  return next ?? now ?? same('');
}

/** "3:00" style, for the session length shown on the Reloj nodes and the start card. */
export function clockText(seconds: number): string {
  return seconds >= 3600 ? formatDuration(seconds) : clock(seconds);
}

// ───────────────────────────── layout ──────────────────────────────

export interface TreePoint {
  x: number;
  y: number;
}

/** Distance (layout units) between two nodes of the same ring on a route. */
export const TREE_SLOT = 1;
/** Distance of ring 1 from the centre. */
const FIRST = 1.35;
/** Empty band between two rings (the night circle sits in it). */
const GAP = 1.25;

/** Most nodes any route has in each ring (the band must fit them). */
const RING_CAP: Record<number, number> = (() => {
  const cap: Record<number, number> = {};
  for (const b of BRANCHES) {
    const per: Record<number, number> = {};
    for (const n of routeNodes(b)) per[n.ring] = (per[n.ring] ?? 0) + 1;
    for (const [r, k] of Object.entries(per)) cap[+r] = Math.max(cap[+r] ?? 0, k);
  }
  return cap;
})();
const RINGS = Object.keys(RING_CAP)
  .map(Number)
  .sort((a, b) => a - b);

/** Radius where each ring's band starts and ends (layout units). */
export const TREE_BANDS: ReadonlyMap<number, { from: number; to: number }> = (() => {
  const m = new Map<number, { from: number; to: number }>();
  let at = FIRST;
  for (const r of RINGS) {
    const to = at + (RING_CAP[r] - 1) * TREE_SLOT;
    m.set(r, { from: at, to });
    at = to + GAP;
  }
  return m;
})();

/** Night circles: between the last ring of one night and the first ring of the next. */
export const TREE_GATES: readonly { night: number; r: number }[] = RINGS.slice(1).flatMap((r, i) => {
  const prev = RINGS[i];
  return ringNight(r) > ringNight(prev) ? [{ night: ringNight(r), r: (TREE_BANDS.get(prev)!.to + TREE_BANDS.get(r)!.from) / 2 }] : [];
});

/** Farthest node from the centre (layout units). */
export const TREE_RADIUS = Math.max(...[...TREE_BANDS.values()].map((b) => b.to));

/** Axis angle of a route, degrees (0 = right, −90 = up; y grows down like the screen). */
export function branchAngle(b: BranchId): number {
  return -90 + BRANCHES.indexOf(b) * BRANCH_STEP;
}

/** Distance of a node from the centre: inside its ring's band, spread evenly along the route. */
export function nodeDistance(def: TreeNodeDef): number {
  if (def.branch === 'core') return 0;
  const same = routeNodes(def.branch).filter((n) => n.ring === def.ring);
  const j = same.findIndex((n) => n.id === def.id);
  const band = TREE_BANDS.get(def.ring)!;
  const cap = RING_CAP[def.ring];
  // n nodes in a band made for `cap`: centred and evenly spaced ((j + ½)·cap/n − ½ slots in).
  const pos = cap === 1 ? 0 : ((j + 0.5) * cap) / same.length - 0.5;
  return band.from + pos * TREE_SLOT;
}

/** Position of a node in layout units. */
export function nodePosition(def: TreeNodeDef): TreePoint {
  if (def.branch === 'core') return { x: 0, y: 0 };
  const a = (branchAngle(def.branch) * Math.PI) / 180;
  const d = nodeDistance(def);
  return { x: d * Math.cos(a), y: d * Math.sin(a) };
}

/** Every node's position, computed once (deterministic). */
export const TREE_LAYOUT: ReadonlyMap<string, TreePoint> = new Map(TREE_NODES.map((n) => [n.id, nodePosition(n)]));

/** Lines of the graph: from each prerequisite to the node that needs it. */
export const TREE_EDGES: readonly { from: string; to: string }[] = TREE_NODES.flatMap((n) => n.requires.map((r) => ({ from: r, to: n.id })));

/** Bounding box of the layout. */
export function treeBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  for (const p of TREE_LAYOUT.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Worlds in route order (the start card lists the unlocked ones). */
export const WORLD_ORDER: readonly WorldId[] = WORLDS.map((w) => w.id);
