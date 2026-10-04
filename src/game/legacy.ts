/**
 * Old continuous saves → the session loop (docs/CICLO.md §8). Generous on purpose: nobody loses
 * progress when the game changes shape.
 *
 *  - The Era becomes the night (story pacing keeps working).
 *  - Laboratorio, Bestiario (Muestras) upgrades and Genome nodes become the tree nodes that do the
 *    same thing, with the steps before them on their route granted for free. Calibrador levels
 *    become the worlds its knobs could reach.
 *  - Anything that has no place in the tree any more (Turno de laboratorio, Reserva, Pipeta rápida),
 *    or that sits in a ring the night has not opened yet, is refunded as Datos at tree prices.
 *  - A welcome gift of Datos from Genome, Muestras, lifetime Esencia and species.
 *
 * Pure: reads a structural subset of the old GameState, returns a fresh ResearchState.
 */
import * as C from './cycleBalance';
import { freshResearch, type ResearchState } from './session';
import { TREE_BY_ID, nodeCost, ringNight } from './tree';

/** The fields of an old GameState (state.ts v1) the migration looks at. */
export interface LegacyState {
  era: number;
  genome: number;
  genomeSpent: number;
  samples?: number;
  eraEssence?: number;
  upgrades: Record<string, number>;
  nodes: string[];
  species: unknown[];
  stats: { totalEssence: number; epsPeak?: number; stablePeak?: number; extinctions?: number };
}

export interface MigrationReport {
  /** Tree levels granted (node id → level). */
  granted: Record<string, number>;
  /** Datos returned for upgrades that have no place in the tree (or not yet). */
  refunded: number;
  /** Welcome gift. */
  gift: number;
}

/** Datos per old Genome point (unspent / spent). [ciclo §8] */
export const LEGACY_DATOS_PER_GENOME = 10;
export const LEGACY_DATOS_PER_SPENT_GENOME = 5;
/** Datos per old Muestra left. */
export const LEGACY_DATOS_PER_SAMPLE = 2;
/** Datos per species already in the Bestiary. */
export const LEGACY_DATOS_PER_SPECIES = 5;
/** Welcome gift for any old save. */
export const LEGACY_WELCOME = 20;
/** Datos per level of a retired upgrade (Generador, Termo, Paneles, Reserva, Pipeta rápida). */
export const LEGACY_RETIRED_LEVEL = 10;
/** Datos per retired Genome node with no place in the tree (Recetas guardadas). */
export const LEGACY_RETIRED_NODE = 20;

const RETIRED = ['generator', 'coffee', 'panels', 'reserve', 'fastPipette'];
const RETIRED_NODES = ['regimesPersist'];

const lv = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);

/** Old upgrade levels → tree node levels (before prerequisites). */
function wanted(old: LegacyState): Record<string, number> {
  const u = (id: string) => lv(old.upgrades?.[id]);
  const has = (id: string) => Array.isArray(old.nodes) && old.nodes.includes(id);
  const w: Record<string, number> = {};
  const put = (id: string, l: number) => {
    if (l > 0) w[id] = Math.max(w[id] ?? 0, Math.min(l, TREE_BY_ID[id].maxLevel));
  };
  // Laboratorio.
  put('dropper', Math.min(3, u('dropper')));
  if (u('dropper') >= 2) put('bigSeed', 1);
  if (u('dropper') >= 5) put('dropperMax', 1);
  put('stabilizer', Math.ceil(u('stabilizer') / 2));
  put('dish', u('dish'));
  if (u('dish') >= 4) put('dishXL', 1);
  put('incubator', u('incubator'));
  put('autoSeeder', Math.ceil(u('autoSeeder') / 2));
  put('culture', u('culture'));
  put('swimAffinity', Math.ceil(u('swimAffinity') / 3.4));
  put('stillAffinity', Math.ceil(u('sessileAffinity') / 3.4));
  put('colonyAffinity', Math.ceil(u('colonyAffinity') / 3.4));
  put('nutrient', u('nutrient'));
  // Calibrador → the worlds its knobs could reach (no knobs any more: ADR draft in docs/CICLO.md).
  if (u('calibrator') >= 1) (put('worldCold', 1), put('worldGyro', 1));
  if (u('calibrator') >= 2) (put('worldShields', 1), put('worldLegs', 1));
  if (u('calibrator') >= 3) put('worldHelix', 1);
  // Bestiario (Muestras).
  put('microscope', Math.min(2, u('microscope')) || (u('marker') > 0 ? 1 : 0));
  put('cataloguing', u('cataloguing'));
  put('archive', u('archive'));
  if (u('archive') > 0) put('print', 1);
  // Genome.
  if (has('doubleRings') || has('tripleRings')) put('worldGiants', 1);
  if (has('essenceStart')) put('startEssence', 2);
  if (has('dropperMemory')) put('dropper', 3);
  if (has('shiftDouble')) put('clock2', 2);
  if (has('persistentSeeder')) put('autoSeeder', 3);
  if (has('mutations')) put('mutations', 1);
  if (has('symbiosis')) put('symbiosis', 1);
  return w;
}

export function migrateLegacy(old: LegacyState): { research: ResearchState; report: MigrationReport } {
  const r = freshResearch();
  const night = Math.max(1, Math.min(C.NIGHT_MAX, lv(old.era) || 1));
  r.levels.lab = night;
  // Sessions: as many as the gate of the night they are in asked for, so the next night is not instant.
  r.sessions = night > 1 ? (C.NIGHT_GATES[night - 2]?.sessions ?? 0) : 0;
  const granted: Record<string, number> = {};
  let refunded = 0;
  const refund = (id: string, from: number, to: number) => {
    for (let l = from; l < to; l++) refunded += nodeCost(id, l);
  };
  const grant = (id: string, level: number): void => {
    const def = TREE_BY_ID[id];
    if (!def) return;
    const cur = granted[id] ?? 0;
    if (level <= cur) return;
    if (night < ringNight(def.ring)) {
      refund(id, cur, level);
      return;
    }
    for (const req of def.requires) if (req !== 'lab') grant(req, 1);
    granted[id] = level;
  };
  for (const [id, l] of Object.entries(wanted(old))) grant(id, l);
  for (const id of RETIRED) refunded += lv(old.upgrades?.[id]) * LEGACY_RETIRED_LEVEL;
  for (const id of RETIRED_NODES) if (Array.isArray(old.nodes) && old.nodes.includes(id)) refunded += LEGACY_RETIRED_NODE;
  for (const [id, l] of Object.entries(granted)) r.levels[id] = l;
  // The newest world they own is where the next session starts.
  for (const id of Object.keys(granted)) if (TREE_BY_ID[id].world) r.world = TREE_BY_ID[id].world!;
  const speciesN = Array.isArray(old.species) ? old.species.length : 0;
  const gift =
    LEGACY_WELCOME +
    lv(old.genome) * LEGACY_DATOS_PER_GENOME +
    lv(old.genomeSpent) * LEGACY_DATOS_PER_SPENT_GENOME +
    lv(old.samples) * LEGACY_DATOS_PER_SAMPLE +
    speciesN * LEGACY_DATOS_PER_SPECIES +
    Math.floor(Math.sqrt(Math.max(0, old.stats?.totalEssence ?? 0)) / 2);
  r.datos = gift + refunded;
  r.datosEarned = r.datos;
  r.nightEssence = Math.max(0, old.eraEssence ?? 0);
  r.records.eps = Math.max(0, old.stats?.epsPeak ?? 0);
  r.records.creatures = Math.max(0, Math.floor(old.stats?.stablePeak ?? 0));
  return { research: r, report: { granted, refunded, gift } };
}
