/**
 * Upgrade and Genome-node definitions: costs, caps, unlock conditions and effect values.
 * Pure data + pure functions over a small context, so tests can poke them directly.
 */
import type { Behavior } from '../core/types';
import * as B from './balance';
import { formatDuration, formatNumber, formatPct } from './format';

export type UpgradeTab = 'lab' | 'bestiary';

/** What unlock conditions may look at. */
export interface UnlockCtx {
  level(id: string): number;
  stablePeak: number;
  eps: number;
  species: number;
  behaviors: Behavior[];
  flags: Record<string, boolean>;
}

export interface UpgradeDef {
  id: string;
  tab: UpgradeTab;
  currency: 'essence' | 'samples';
  /** null = infinite. */
  maxLevel: number | null;
  /** Fixed cost list (cost of buying level i+1 is costs[i])… */
  costs?: number[];
  /** …or geometric b·g^n. */
  base?: number;
  growth?: number;
  /** Effect value at a level, for "current → next" texts. */
  value(level: number): string;
  unlock(c: UnlockCtx): boolean;
}

const plus = (x: number) => `+${formatPct(x)}`;

export const UPGRADES: UpgradeDef[] = [
  // ── Laboratorio (Esencia) ──
  {
    id: 'dropper',
    tab: 'lab',
    currency: 'essence',
    maxLevel: B.DROPPER_COSTS.length,
    costs: B.DROPPER_COSTS,
    value: (l) => `${l}`,
    unlock: () => true,
  },
  {
    id: 'autoSeeder',
    tab: 'lab',
    currency: 'essence',
    maxLevel: null,
    base: B.AUTOSEEDER_BASE,
    growth: B.AUTOSEEDER_GROWTH,
    value: (l) => (l === 0 ? '—' : `${formatNumber(Math.round(autoSeedInterval(l) * 10) / 10)} s`),
    unlock: (c) => c.stablePeak >= 2,
  },
  {
    id: 'culture',
    tab: 'lab',
    currency: 'essence',
    maxLevel: null,
    base: B.CULTURE_BASE,
    growth: B.CULTURE_GROWTH,
    value: (l) => `×${formatNumber(Math.round(Math.pow(1 + B.CULTURE_BONUS, l) * 100) / 100)}`,
    unlock: (c) => c.flags.eps10 === true || c.eps >= B.CULTURE_UNLOCK_EPS,
  },
  {
    id: 'calibrator',
    tab: 'lab',
    currency: 'essence',
    maxLevel: B.CALIBRATOR_COSTS.length,
    costs: B.CALIBRATOR_COSTS,
    value: (l) => `${l}`,
    unlock: (c) => c.species >= 1,
  },
  {
    id: 'stabilizer',
    tab: 'lab',
    currency: 'essence',
    maxLevel: B.STABILIZER_MAX,
    base: B.STABILIZER_BASE,
    growth: B.STABILIZER_GROWTH,
    value: (l) => plus(l * B.STABILIZER_SHOWN_BONUS),
    unlock: (c) => c.level('calibrator') >= 1 || c.flags.stabilizerSeen === true,
  },
  {
    id: 'dish',
    tab: 'lab',
    currency: 'essence',
    maxLevel: B.DISH_COSTS.length,
    costs: B.DISH_COSTS,
    value: (l) => `${B.DISH_FREE_SLOTS[l]}`,
    unlock: (c) => c.stablePeak >= B.DISH_UNLOCK_CREATURES,
  },
  {
    id: 'incubator',
    tab: 'lab',
    currency: 'essence',
    maxLevel: B.INCUBATOR_COSTS.length,
    costs: B.INCUBATOR_COSTS,
    value: (l) => `×${B.INCUBATOR_SPEEDS[l][B.INCUBATOR_SPEEDS[l].length - 1]}`,
    unlock: (c) => c.level('dish') >= 1 || c.flags.incubatorSeen === true,
  },
  {
    id: 'swimAffinity',
    tab: 'lab',
    currency: 'essence',
    maxLevel: B.AFFINITY_MAX,
    base: B.AFFINITY_BASE,
    growth: B.AFFINITY_GROWTH,
    value: (l) => plus(l * B.AFFINITY_BONUS),
    unlock: (c) => c.behaviors.includes('swimmer') || c.behaviors.includes('spinner'),
  },
  {
    id: 'sessileAffinity',
    tab: 'lab',
    currency: 'essence',
    maxLevel: B.AFFINITY_MAX,
    base: B.AFFINITY_BASE,
    growth: B.AFFINITY_GROWTH,
    value: (l) => plus(l * B.AFFINITY_BONUS),
    unlock: (c) => c.behaviors.includes('still') || c.behaviors.includes('pulsing'),
  },
  {
    id: 'colonyAffinity',
    tab: 'lab',
    currency: 'essence',
    maxLevel: B.AFFINITY_MAX,
    base: B.COLONY_AFFINITY_BASE,
    growth: B.AFFINITY_GROWTH,
    value: (l) => plus(l * B.AFFINITY_BONUS),
    unlock: (c) => c.flags.firstDivision === true || c.behaviors.includes('divider') || c.behaviors.includes('colony'),
  },
  {
    id: 'reserve',
    tab: 'lab',
    currency: 'essence',
    maxLevel: B.RESERVE_COSTS.length,
    costs: B.RESERVE_COSTS,
    value: (l) => `${B.RESERVE_HOURS[l]} h`,
    unlock: (c) => c.flags.returned === true,
  },
  {
    id: 'fastPipette',
    tab: 'lab',
    currency: 'essence',
    maxLevel: B.FAST_PIPETTE_COSTS.length,
    costs: B.FAST_PIPETTE_COSTS,
    value: (l) => `${B.PIPETTE_TIME[l]} s`,
    unlock: (c) => c.flags.pipetteUsed === true,
  },
  {
    id: 'nutrient',
    tab: 'lab',
    currency: 'essence',
    maxLevel: B.NUTRIENT_MAX,
    base: B.NUTRIENT_BASE,
    growth: B.NUTRIENT_GROWTH,
    value: (l) => plus(l * B.NUTRIENT_BONUS),
    unlock: (c) => c.level('culture') >= B.NUTRIENT_UNLOCK_CULTURE || c.flags.nutrientSeen === true,
  },
  // ── Bestiario (Muestras) ──
  {
    id: 'microscope',
    tab: 'bestiary',
    currency: 'samples',
    maxLevel: B.MICROSCOPE_COSTS.length,
    costs: B.MICROSCOPE_COSTS,
    value: (l) => `${l}`,
    unlock: (c) => c.species >= 1,
  },
  {
    id: 'cataloguing',
    tab: 'bestiary',
    currency: 'samples',
    maxLevel: B.CATALOGUING_COSTS.length,
    costs: B.CATALOGUING_COSTS,
    value: (l) => plus(l * B.CATALOGUING_BONUS),
    unlock: (c) => c.species >= 3,
  },
  {
    id: 'archive',
    tab: 'bestiary',
    currency: 'samples',
    maxLevel: B.ARCHIVE_COSTS.length,
    costs: B.ARCHIVE_COSTS,
    value: (l) => (l === 0 ? '—' : formatDuration(B.ARCHIVE_INTERVAL[l])),
    unlock: (c) => c.species >= 5,
  },
  {
    id: 'marker',
    tab: 'bestiary',
    currency: 'samples',
    maxLevel: B.MARKER_COSTS.length,
    costs: B.MARKER_COSTS,
    value: (l) => `${l}`,
    unlock: (c) => c.behaviors.length >= 2,
  },
];

export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

/** Sembrador interval in seconds at a level ≥ 1. */
export function autoSeedInterval(level: number): number {
  if (level <= 0) return Infinity;
  return Math.max(B.AUTOSEED_MIN_INTERVAL, B.AUTOSEED_INTERVAL * Math.pow(B.AUTOSEED_DECAY, level - 1));
}

/** Cost of buying level `level + 1`. Infinity when maxed. */
export function levelCost(def: UpgradeDef, level: number): number {
  if (def.maxLevel !== null && level >= def.maxLevel) return Infinity;
  if (def.costs) return def.costs[level] ?? Infinity;
  return Math.ceil(def.base! * Math.pow(def.growth!, level));
}

/** Total cost of `qty` levels starting at `level`. Infinity if it goes past the cap. */
export function costForQty(def: UpgradeDef, level: number, qty: number): number {
  if (qty <= 0) return 0;
  if (def.maxLevel !== null && level + qty > def.maxLevel) return Infinity;
  let sum = 0;
  for (let i = 0; i < qty; i++) sum += levelCost(def, level + i);
  return sum;
}

/** Largest k ≥ 0 such that costForQty(def, level, k) ≤ budget. Never returns a negative-leaving count. */
export function maxAffordable(def: UpgradeDef, level: number, budget: number): number {
  if (!(budget > 0)) return 0;
  const cap = def.maxLevel === null ? 100000 : def.maxLevel - level;
  let k = 0;
  let sum = 0;
  // Geometric upgrades: jump close to the answer with the closed form, then walk exactly.
  if (!def.costs && def.growth! > 1) {
    const b = def.base! * Math.pow(def.growth!, level);
    const est = Math.floor(Math.log(1 + (budget * (def.growth! - 1)) / b) / Math.log(def.growth!));
    k = Math.max(0, Math.min(cap, est - 2));
    sum = costForQty(def, level, k);
    if (sum > budget) {
      k = 0;
      sum = 0;
    }
  }
  while (k < cap) {
    const c = levelCost(def, level + k);
    if (sum + c > budget) break;
    sum += c;
    k++;
  }
  return k;
}

// ───────────────────────────── Genome tree ─────────────────────────

export interface GenomeDef {
  id: string;
  branch: 'rules' | 'heritage' | 'fauna';
  cost: number;
  requires: string[];
  /** Shown but not purchasable in this version. */
  comingSoon: boolean;
}

export const GENOME_NODES: GenomeDef[] = [
  { id: 'doubleRings', branch: 'rules', cost: B.GENOME_COSTS.doubleRings, requires: [], comingSoon: false },
  { id: 'tripleRings', branch: 'rules', cost: B.GENOME_COSTS.tripleRings, requires: ['doubleRings'], comingSoon: false },
  { id: 'secondChannel', branch: 'rules', cost: B.GENOME_COSTS.secondChannel, requires: ['tripleRings'], comingSoon: true },
  { id: 'flow', branch: 'rules', cost: B.GENOME_COSTS.flow, requires: ['secondChannel'], comingSoon: true },
  { id: 'dropperMemory', branch: 'heritage', cost: B.GENOME_COSTS.dropperMemory, requires: [], comingSoon: false },
  { id: 'regimesPersist', branch: 'heritage', cost: B.GENOME_COSTS.regimesPersist, requires: ['dropperMemory'], comingSoon: false },
  { id: 'essenceStart', branch: 'heritage', cost: B.GENOME_COSTS.essenceStart, requires: ['regimesPersist'], comingSoon: false },
  { id: 'persistentSeeder', branch: 'heritage', cost: B.GENOME_COSTS.persistentSeeder, requires: ['essenceStart'], comingSoon: false },
  { id: 'mutations', branch: 'fauna', cost: B.GENOME_COSTS.mutations, requires: [], comingSoon: false },
  { id: 'symbiosis', branch: 'fauna', cost: B.GENOME_COSTS.symbiosis, requires: ['mutations'], comingSoon: false },
  { id: 'predation', branch: 'fauna', cost: B.GENOME_COSTS.predation, requires: ['symbiosis', 'secondChannel'], comingSoon: true },
];

export const GENOME_BY_ID: Record<string, GenomeDef> = Object.fromEntries(GENOME_NODES.map((n) => [n.id, n]));

/** G = floor(sqrt(E_era / 1e4)) + 2·S_new + B_new (doc §5, brief correction 3). */
export function genomeGain(eraEssence: number, newSpecies: number, newBehaviors: number): number {
  return essenceTerm(eraEssence) + B.GENOME_PER_SPECIES * newSpecies + B.GENOME_PER_BEHAVIOR * newBehaviors;
}

/** floor(sqrt(E_era / 1e4)). */
export function essenceTerm(eraEssence: number): number {
  return Math.floor(Math.sqrt(Math.max(0, eraEssence) / B.GENOME_ESSENCE_DIV) + 1e-9);
}

/** E_era needed for the essence term to reach EXTINCTION_MIN_ESSENCE_TERM. */
export const EXTINCTION_ESSENCE_NEEDED = B.EXTINCTION_MIN_ESSENCE_TERM ** 2 * B.GENOME_ESSENCE_DIV;
