/**
 * Worlds (docs/CICLO.md §4.3): the rule sets of the dish, replacing the free "Calibrar" knobs.
 * A world is a FIXED LeniaParams preset; the 🌍 Mundos route opens them in order and the start card
 * lets the player pick one (the only rules choice, no numbers on screen).
 *
 * Every species listed in a world was checked with the CPU reference (scripts/world-check.ts): its
 * exact catalog template, stamped at the world's preset, keeps its mass (0.4–2.5×) for 700 steps
 * without dying or flooding the dish. Species the plan listed that do not live at any single preset
 * shared with the others are in `dropped` (see the report in docs/CICLO.md §4.3); they stay in the
 * catalog for later worlds.
 */
import type { Behavior, LeniaParams } from '../core/types';
import { catalogGroup } from '../species/identity';
import { WORLD_ESSENCE_STEP } from './cycleBalance';

export type WorldId = 'classic' | 'gyro' | 'cold' | 'legs' | 'shields' | 'helix' | 'giants';

export interface WorldDef {
  id: WorldId;
  /** "Mundo N" on the card. */
  n: number;
  /** Tree node that opens it (null: the first world is free). */
  node: string | null;
  /** The dish rules while playing in this world. */
  params: LeniaParams;
  /** Catalog codes that live at `params` (spore pool of the world). */
  species: string[];
  /** Listed by the plan, but they die or flood at this preset (CPU reference). */
  dropped: string[];
  /** Card tint (degrees). */
  hue: number;
  /**
   * Esencia of every creature while playing here (default 1). Only the Gigantes: their creatures are
   * so big that half as many fit, so each one is worth ×2 — said on the card and the node.
   */
  essenceMult?: number;
  /** Share of the dish's room (TreeEffects.capacity) its creatures fit in (default 1; Gigantes ½). */
  roomMult?: number;
}

const p = (mu: number, sigma: number, R = 13, rings: number[] = [1]): LeniaParams => ({ mu, sigma, R, rings, dt: 0.1 });

/** The first world (free, always offered). */
export const BASE_WORLD: WorldId = 'classic';

export const WORLDS: readonly WorldDef[] = [
  // Measured with scripts/world-check.ts (CPU reference, 128² torus, 700 steps): every listed code
  // keeps its mass at the preset; `dropped` ones die or flood the dish there.
  { id: 'classic', n: 1, node: null, params: p(0.15, 0.015), species: ['O2u', 'O2b', 'O4i'], dropped: [], hue: 198 },
  // Order = what a full dish of the world pays (detector complexity × behaviour × rarity, with the
  // ×0,85 per extra creature of the same species; scripts/world-check.ts --yield): 24 · 30 · 43 ·
  // 52 · 54 · 58 · 58. The newest world is picked for you, so it never pays less than the one before.
  { id: 'cold', n: 2, node: 'worldCold', params: p(0.1207, 0.0105), species: ['O2ui', 'O4s', 'O2p'], dropped: [], hue: 222 },
  // Centre (0.165, 0.0222) kills OG2g; both live in a small window around (0.16, 0.0222).
  { id: 'gyro', n: 3, node: 'worldGyro', params: p(0.16, 0.0222), species: ['OG2g', 'O4d'], dropped: [], hue: 172 },
  { id: 'shields', n: 4, node: 'worldShields', params: p(0.2865, 0.0465), species: ['S1v', 'S1s', 'PG1a', 'P4cp'], dropped: [], hue: 45 },
  // H3s and H5s flood where the discs live (and the discs die where H3s lives): the world keeps the
  // three that share a preset, so the plan's "Hélices" is shown as "Discos".
  { id: 'helix', n: 5, node: 'worldHelix', params: p(0.356, 0.063), species: ['S2s', 'PS3am', 'C0v', 'S3s'], dropped: ['H3s', 'H5s'], hue: 325 },
  // O4a floods everywhere near the others; PG1c only shares knife-edge points with them (not robust).
  { id: 'legs', n: 6, node: 'worldLegs', params: p(0.23, 0.0355), species: ['H3cp', 'P3sp'], dropped: ['O4a', 'PG1c'], hue: 112 },
  // One kernel per world: K4d needs rings [1, 1/3], where 3GH2n floods; K4d dies in 3GH2n's.
  // R 18 instead of 13: each creature takes (18/13)² ≈ 2× the room, so half as many fit, each ×2.
  { id: 'giants', n: 7, node: 'worldGiants', params: p(0.25, 0.033, 18, [0.5, 1, 2 / 3]), species: ['3GH2n'], dropped: ['K4d'], hue: 272, essenceMult: 2, roomMult: 0.5 },
];

export const WORLD_BY_ID: Readonly<Record<WorldId, WorldDef>> = Object.fromEntries(WORLDS.map((w) => [w.id, w])) as Record<WorldId, WorldDef>;

/** All Esencia while playing in a world: ×(1 + WORLD_ESSENCE_STEP·(n − 1)) × its own essenceMult (Gigantes ×2). */
export function worldEssenceMult(id: WorldId): number {
  const w = WORLD_BY_ID[id];
  return w ? (1 + WORLD_ESSENCE_STEP * (w.n - 1)) * (w.essenceMult ?? 1) : 1;
}

/** Creatures the dish holds in a world: the tree's room × the world's share (never fewer than 3). */
export function worldRoom(id: WorldId, capacity: number): number {
  const m = WORLD_BY_ID[id]?.roomMult ?? 1;
  return m === 1 ? capacity : Math.max(3, Math.round(capacity * m));
}

export function isWorldId(x: unknown): x is WorldId {
  return typeof x === 'string' && x in WORLD_BY_ID;
}

/** Bestiary species of a world (catalog codes the detector cannot tell apart count once). */
export function worldSpeciesGroups(id: WorldId): string[] {
  return [...new Set((WORLD_BY_ID[id]?.species ?? []).map(catalogGroup))];
}

export function worldSpeciesCount(id: WorldId): number {
  return worldSpeciesGroups(id).length;
}

/** Every Bestiary species some world can grow. */
export const TOTAL_WORLD_SPECIES = WORLDS.reduce((a, w) => a + worldSpeciesCount(w.id), 0);

/** The world a catalog code lives in (null when no world grows it). */
export function worldOfSpecies(code: string): WorldId | null {
  const g = catalogGroup(code);
  for (const w of WORLDS) if (w.species.some((c) => catalogGroup(c) === g)) return w.id;
  return null;
}

/**
 * Ways of moving the game's detector sees in each world, measured with the CPU reference at the
 * world's preset (`npx vite-node scripts/world-check.ts --behaviors`, 3 placements × 1500 steps per
 * species): swimmers everywhere; spinners in Remolinos (Gyrorbium) and Patas (Helicium); a still one
 * in Discos (Circium). No species of any world is classified as pulsing, divider or colony (O4s
 * splits once in a while in Frío, but is still read as a swimmer). Goals that ask for a way of
 * moving use REACHABLE_BEHAVIORS so that none is impossible (docs/CLARIDAD.md F-09). [measured]
 */
export const WORLD_BEHAVIORS: Readonly<Record<WorldId, readonly Behavior[]>> = {
  classic: ['swimmer'],
  cold: ['swimmer'],
  gyro: ['spinner', 'swimmer'],
  shields: ['swimmer'],
  helix: ['swimmer', 'still'],
  legs: ['spinner', 'swimmer'],
  giants: ['swimmer'],
};

/** Every way of moving some world grows (in WORLDS order of first appearance). */
export const REACHABLE_BEHAVIORS: readonly Behavior[] = [...new Set(WORLDS.flatMap((w) => WORLD_BEHAVIORS[w.id]))];

/** Worlds where a way of moving can be found (empty: none grows it). */
export function worldsWithBehavior(b: Behavior): WorldId[] {
  return WORLDS.filter((w) => WORLD_BEHAVIORS[w.id].includes(b)).map((w) => w.id);
}
