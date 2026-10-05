/**
 * Worlds (docs/CICLO.md §4.3): the rule sets of the dish, replacing the free "Calibrar" knobs.
 * A world is a FIXED LeniaParams preset; the 🌍 Mundos route opens them in order and the start card
 * lets the player pick one (the only rules choice, no numbers on screen).
 *
 * Each world grows ONE species a child tells apart at a glance from every species of the worlds
 * before it (docs/ESPECIES.md: a ring with a hole, a spinning disc, a hollow shield, a twisted
 * dancer, a ladder, a giant caterpillar). Checked with the CPU reference (scripts/world-check.ts): its
 * exact catalog template, stamped at the world's preset, keeps its mass (0.4–2.5×) without dying or
 * flooding the dish, and keeps the form the game reveals it by (--features). Catalog forms that
 * also live there but look like a Bestiary species are its `variants`; ones that die are `dropped`.
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
  /**
   * Catalog forms that also live here but look like a listed species (species/looks VARIANTS):
   * not seeded; if one forms it counts as its species ("variante"), never as a new one.
   */
  variants?: string[];
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
  // ONE visibly new species per world, each clearly different from every species before it
  // (docs/ESPECIES.md): a hole, a twisted body, a ladder, a giant… never "another Orbium".
  // Measured with scripts/world-check.ts (CPU reference, 128² torus): each listed code keeps its
  // mass AND the form the game reveals it by (static signature within CATALOG_MATCH_FACTOR of its
  // catalog reference; --features). `variants` are catalog forms that also live there but that a
  // child cannot tell from a Bestiary species (species/looks VARIANTS): never seeded, never "new".
  // Order = what a full dish pays (world-check --yield): a newer world never pays less.
  { id: 'classic', n: 1, node: null, params: p(0.15, 0.015), species: ['O2u'], variants: ['O2b', 'O4i'], dropped: [], hue: 198 },
  // Frío: Circium's ring at its own catalog point (alive on 0.37–0.39 × 0.067–0.076). The Orbium
  // forms of the old Frío (ignis, Synorbium solidus, phantasma) look like the Nadadora: variants.
  { id: 'cold', n: 2, node: 'worldCold', params: p(0.38, 0.07), species: ['C0v'], variants: [], dropped: [], hue: 222 },
  // Centre (0.165, 0.0222) kills OG2g. O4d (two Orbiums side by side) lives here too: a Nadadora pair.
  { id: 'gyro', n: 3, node: 'worldGyro', params: p(0.16, 0.0222), species: ['OG2g'], variants: ['O4d'], dropped: [], hue: 172 },
  { id: 'shields', n: 4, node: 'worldShields', params: p(0.356, 0.063), species: ['S2s'], variants: ['PS3am'], dropped: [], hue: 45 },
  // Hélices: Helicium cavus pedes (twisted, spins). Synptera lives here too: the same body, straighter.
  { id: 'helix', n: 5, node: 'worldHelix', params: p(0.23, 0.0355), species: ['H3cp'], variants: ['P3sp'], dropped: [], hue: 325 },
  // Patas: Paraptera cavus pedes, the long Escalera. Scutium solidus lives here too: a small Escudo.
  { id: 'legs', n: 6, node: 'worldLegs', params: p(0.29, 0.0465), species: ['P4cp'], variants: ['S1s'], dropped: [], hue: 112 },
  // One kernel per world: K4d needs rings [1, 1/3], where 3GH2n floods; K4d dies in 3GH2n's.
  // R 18 instead of 13: each creature takes (18/13)² ≈ 2× the room, so half as many fit, each ×2.
  { id: 'giants', n: 7, node: 'worldGiants', params: p(0.25, 0.033, 18, [0.5, 1, 2 / 3]), species: ['3GH2n'], variants: [], dropped: ['K4d'], hue: 272, essenceMult: 2, roomMult: 0.5 },
];

export const WORLD_BY_ID: Readonly<Record<WorldId, WorldDef>> = Object.fromEntries(WORLDS.map((w) => [w.id, w])) as Record<WorldId, WorldDef>;

/** All Esencia while playing in a world: ×(1 + WORLD_ESSENCE_STEP·(n − 1)) × its own essenceMult (Gigantes ×2). */
export function worldEssenceMult(id: WorldId): number {
  const w = WORLD_BY_ID[id];
  return w ? (1 + WORLD_ESSENCE_STEP * (w.n - 1)) * (w.essenceMult ?? 1) : 1;
}

/**
 * The open world that pays most for a full dish (QA4 F-14: World 2 paid 108–171 Esencia a run, World 1
 * 13–20, and nothing said so). WORLDS is ordered by measured yield (world-check --yield: a newer world
 * never pays less), so it is the newest open one.
 */
export function bestWorld(open: readonly string[]): WorldId {
  let best: WorldDef = WORLDS[0];
  for (const id of open) {
    const w = WORLD_BY_ID[id as WorldId];
    if (w && w.n > best.n) best = w;
  }
  return best.id;
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
 * species): swimmers in Clásico, Escudos, Patas and Gigantes; spinners in Remolinos (Gyrorbium) and
 * Hélices (Helicium); in Frío the Anillo (Circium) stays still, and one placement in three PULSES.
 * No species of any world divides or forms a colony. Goals that ask for a way of moving use
 * REACHABLE_BEHAVIORS so that none is impossible (docs/CLARIDAD.md F-09). [measured]
 */
export const WORLD_BEHAVIORS: Readonly<Record<WorldId, readonly Behavior[]>> = {
  classic: ['swimmer'],
  cold: ['still', 'pulsing'],
  gyro: ['spinner'],
  shields: ['swimmer'],
  helix: ['spinner'],
  legs: ['swimmer'],
  giants: ['swimmer'],
};

/** Every way of moving some world grows (in WORLDS order of first appearance). */
export const REACHABLE_BEHAVIORS: readonly Behavior[] = [...new Set(WORLDS.flatMap((w) => WORLD_BEHAVIORS[w.id]))];

/** Worlds where a way of moving can be found (empty: none grows it). */
export function worldsWithBehavior(b: Behavior): WorldId[] {
  return WORLDS.filter((w) => WORLD_BEHAVIORS[w.id].includes(b)).map((w) => w.id);
}
