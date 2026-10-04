/**
 * Persistent game state, defaults, versioned serialization with checksum, and strict
 * validation of untrusted input (imports, corrupted saves).
 */
import type { Behavior, BuyQty, Lang, Quality, Rarity, Settings, Text } from '../core/types';
import * as B from './balance';
import { GENOME_BY_ID, UPGRADE_BY_ID } from './defs';
import { validateResearch, validateSession, type ResearchState, type SessionState } from './session';
import { TREE_BY_ID } from './tree';

export type SeedShape = 'blob' | 'ring' | 'noise';

export interface PortraitData {
  w: number;
  h: number;
  /** base64 of 8-bit quantized matter. */
  d: string;
}

export interface SpeciesState {
  id: string;
  /** Specimen number (provisional name). */
  n: number;
  customName: string | null;
  catalogCode: string | null;
  catalogName: string | null;
  rarity: Rarity;
  behavior: Behavior | null;
  behaviors: Behavior[];
  signature: number[];
  sigCount: number;
  timesSeen: number;
  era: number;
  muRange: [number, number];
  sigmaRange: [number, number];
  R: number;
  rings: number[];
  portrait: PortraitData | null;
  isNew: boolean;
  /** Parent species id when born from a mutated print. */
  variantOf: string | null;
  /** Procedural Latin name of a non-catalog species, frozen at registration (src/species). */
  latin?: string | null;
  /** Accent hue in degrees, frozen at registration (src/species speciesHue). */
  hue?: number;
  /** Body kind (src/species ShapeKind), frozen at registration with the common name. */
  shape?: string;
  /** Common name, Spanish and English ("Nadadora celeste" / "Sky swimmer"), frozen at registration. */
  common?: Text | null;
  /** (sessions) The World the species was found in (game/worlds WorldId), frozen at registration. */
  world?: string | null;
  /** Catalog codes of look-alike forms (species/looks VARIANTS) seen as this species ("variante"). */
  variantsSeen?: string[];
}

export interface Regime {
  name: string;
  mu: number;
  sigma: number;
  R: number;
  dt: number;
  rings: number[];
}

export interface Calibration {
  mu: number;
  sigma: number;
  R: number;
  dt: number;
  rings: number[];
}

export interface Stats {
  /** Lifetime seconds with the game open. */
  playTime: number;
  totalEssence: number;
  seeds: number;
  creaturesBorn: number;
  stableEver: number;
  deaths: number;
  /** Exploded matter that vanished (lysis / clean-up): not counted as deaths. */
  dissolved: number;
  explosions: number;
  golden: number;
  goldenMissed: number;
  prints: number;
  calibrations: number;
  regimesSaved: number;
  extinctions: number;
  variants: number;
  symbiosis: number;
  returns: number;
  epsPeak: number;
  stablePeak: number;
  speciesSeen: number;
}

export interface Buff {
  id: string;
  remaining: number;
  mult: number;
}

export interface GameState {
  createdAt: number;
  essence: number;
  samples: number;
  /** Unspent Genome. */
  genome: number;
  genomeSpent: number;
  era: number;
  /** E_era: essence earned this Era. */
  eraEssence: number;
  /** Active (unpaused) seconds in this Era. */
  eraTime: number;
  /** Max simultaneous stable creatures this Era. */
  eraStablePeak: number;
  /** Any stable creature this Era (invisible help switch). */
  eraHadStable: boolean;
  upgrades: Record<string, number>;
  /** Sticky unlocks (upgrade ids). */
  unlocked: string[];
  maxDropper: number;
  nodes: string[];
  calib: Calibration;
  regimes: Regime[];
  species: SpeciesState[];
  specimenCounter: number;
  behaviorsSeen: Behavior[];
  /** First-ever species / behaviours not yet paid as Genome. */
  pendingSpecies: number;
  pendingBehaviors: number;
  journal: { id: string; read: boolean }[];
  achievements: string[];
  objective: number;
  stats: Stats;
  flags: Record<string, boolean>;
  /** Average production per EPS_BUCKET seconds of active play (newest last). */
  epsHistory: number[];
  bucketSum: number;
  bucketTime: number;
  charges: { free: number; guaranteed: number };
  buffs: Buff[];
  goldenTimer: number;
  autoSeedTimer: number;
  pipetteTimer: number;
  archiveTimer: number;
  settings: Settings;
  speed: number;
  buyQty: BuyQty;
  shape: SeedShape;
  /** (sessions cycle, save v2) Datos, research tree, night, worlds. Absent in classic saves. */
  research?: ResearchState;
  /** (sessions cycle, save v2) The session on the dish; null/absent = set up a new one. */
  session?: SessionState | null;
  /**
   * (sessions cycle) Encargos and objectives finished while no session runs (in the tree, on the start
   * card): their Esencia goes into the next session's wallet (and counts as earned there), each one
   * counts as an Encargo of that session (+time, +Datos). Cleared when its clock starts.
   */
  carry?: { essence: number; encargos: number };
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'es',
  sfxVolume: 0.7,
  musicVolume: 0.5,
  muted: false,
  vibration: true,
  reduceMotion: false,
  oneTouch: false,
  quality: 'auto',
  analytics: false,
};

export function emptyStats(): Stats {
  return {
    playTime: 0,
    totalEssence: 0,
    seeds: 0,
    creaturesBorn: 0,
    stableEver: 0,
    deaths: 0,
    dissolved: 0,
    explosions: 0,
    golden: 0,
    goldenMissed: 0,
    prints: 0,
    calibrations: 0,
    regimesSaved: 0,
    extinctions: 0,
    variants: 0,
    symbiosis: 0,
    returns: 0,
    epsPeak: 0,
    stablePeak: 0,
    speciesSeen: 0,
  };
}

export function baseCalibration(): Calibration {
  const c = B.BASE_CALIBRATION;
  return { mu: c.mu, sigma: c.sigma, R: c.R, dt: c.dt, rings: [...c.rings] };
}

export function defaultState(now: number): GameState {
  return {
    createdAt: now,
    essence: B.START_ESSENCE,
    samples: 0,
    genome: 0,
    genomeSpent: 0,
    era: 1,
    eraEssence: 0,
    eraTime: 0,
    eraStablePeak: 0,
    eraHadStable: false,
    upgrades: {},
    unlocked: [],
    maxDropper: 0,
    nodes: [],
    calib: baseCalibration(),
    regimes: [],
    species: [],
    specimenCounter: 0,
    behaviorsSeen: [],
    pendingSpecies: 0,
    pendingBehaviors: 0,
    journal: [],
    achievements: [],
    objective: 0,
    stats: emptyStats(),
    flags: {},
    epsHistory: [],
    bucketSum: 0,
    bucketTime: 0,
    // QA2 H-04: the very first seed always takes (guaranteed) and the next ones are free, so a new
    // player sees life at once instead of a string of dissolving blobs.
    charges: { free: B.START_FREE_SEEDS, guaranteed: B.START_GUARANTEED_SEEDS },
    buffs: [],
    goldenTimer: -1,
    autoSeedTimer: 0,
    pipetteTimer: 0,
    archiveTimer: 0,
    settings: { ...DEFAULT_SETTINGS },
    speed: 1,
    buyQty: 1,
    shape: 'blob',
  };
}

// ───────────────────────────── Serialization ───────────────────────

/** FNV-1a 32-bit, hex. */
export function checksum(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * JSON has no NaN/Infinity: JSON.stringify writes them as `null`, which strict validation
 * rejects, so one bad number would make the whole save unreadable. Write the nearest finite
 * value instead (NaN → 0, ±Infinity → ±MAX_VALUE); the checksum is taken over this output.
 */
function finiteReplacer(_key: string, v: unknown): unknown {
  if (typeof v !== 'number' || Number.isFinite(v)) return v;
  return Number.isNaN(v) ? 0 : v > 0 ? Number.MAX_VALUE : -Number.MAX_VALUE;
}

/** `{"v":2,"sum":"…","data":{…}}`; the checksum covers the serialized data. */
export function serializeState(s: GameState): string {
  const data = JSON.stringify(s, finiteReplacer);
  return `{"v":${B.SAVE_VERSION},"sum":"${checksum(data)}","data":${data}}`;
}

/** Parse + verify checksum/version + validate ranges. Returns null on any problem. */
export function deserializeState(str: string): GameState | null {
  let outer: unknown;
  try {
    outer = JSON.parse(str);
  } catch {
    return null;
  }
  if (!isObj(outer)) return null;
  if (typeof outer.v !== 'number' || !B.SAVE_VERSIONS_READ.includes(outer.v)) return null;
  if (typeof outer.sum !== 'string' || !isObj(outer.data)) return null;
  if (checksum(JSON.stringify(outer.data)) !== outer.sum) return null;
  return validateState(outer.data);
}

// ───────────────────────────── Validation ──────────────────────────

const BEHAVIORS: Behavior[] = ['still', 'pulsing', 'swimmer', 'spinner', 'divider', 'colony'];
/** Sanity bound on imported bestiaries (far above what fits in localStorage anyway). */
const MAX_SPECIES = 20000;
const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'veryRare'];

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

class Invalid extends Error {}

function num(x: unknown, min = 0, max = Number.MAX_VALUE, fallback?: number): number {
  if (x === undefined && fallback !== undefined) return fallback;
  if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max) throw new Invalid(String(x));
  return x;
}
/** Lenient number for non-critical fields (stats, timers): anything invalid becomes `fallback`. */
function numOr(x: unknown, fallback: number, min = 0, max = Number.MAX_VALUE): number {
  return typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max ? x : fallback;
}
function int(x: unknown, min = 0, max = Number.MAX_SAFE_INTEGER, fallback?: number): number {
  const v = num(x, min, max, fallback);
  if (!Number.isInteger(v)) throw new Invalid('int');
  return v;
}
function bool(x: unknown, fallback = false): boolean {
  return typeof x === 'boolean' ? x : fallback;
}
function str(x: unknown, maxLen = 64, fallback = ''): string {
  if (x === undefined || x === null) return fallback;
  if (typeof x !== 'string') throw new Invalid('str');
  return x.slice(0, maxLen);
}
function arr(x: unknown, maxLen = 10000): unknown[] {
  if (x === undefined) return [];
  if (!Array.isArray(x) || x.length > maxLen) throw new Invalid('arr');
  return x;
}
function range(x: unknown, lim: readonly [number, number]): [number, number] {
  const a = arr(x, 2);
  if (a.length !== 2) throw new Invalid('range');
  const lo = num(a[0], -1, 10);
  const hi = num(a[1], -1, 10);
  return [Math.min(lo, hi), Math.max(lo, hi)].map((v) => Math.min(lim[1], Math.max(lim[0], v))) as [number, number];
}
function rings(x: unknown): number[] {
  const a = arr(x, 4).map((v) => num(v, 0, 1));
  return a.length ? a : [1];
}
function calibration(x: unknown): Calibration {
  if (!isObj(x)) throw new Invalid('calib');
  const L = B.CALIBRATION_LIMITS;
  return {
    mu: num(x.mu, L.mu[0], L.mu[1]),
    sigma: num(x.sigma, L.sigma[0], L.sigma[1]),
    R: num(x.R, L.R[0], L.R[1]),
    dt: num(x.dt, L.dt[0], L.dt[1]),
    rings: rings(x.rings),
  };
}

function species(x: unknown): SpeciesState {
  if (!isObj(x)) throw new Invalid('species');
  const behaviors = arr(x.behaviors, 6).filter((b): b is Behavior => BEHAVIORS.includes(b as Behavior));
  const rarity = RARITIES.includes(x.rarity as Rarity) ? (x.rarity as Rarity) : B.DEFAULT_RARITY;
  let portrait: PortraitData | null = null;
  if (isObj(x.portrait)) {
    const w = int(x.portrait.w, 1, B.PORTRAIT_MAX_SIDE);
    const h = int(x.portrait.h, 1, B.PORTRAIT_MAX_SIDE);
    const d = str(x.portrait.d, 4 * Math.ceil((w * h) / 3) + 8);
    portrait = { w, h, d };
  }
  const L = B.CALIBRATION_LIMITS;
  return {
    id: str(x.id, 32) || (() => { throw new Invalid('id'); })(),
    n: int(x.n, 0, 1e6),
    customName: x.customName === null || x.customName === undefined ? null : str(x.customName, 40),
    catalogCode: x.catalogCode === null || x.catalogCode === undefined ? null : str(x.catalogCode, 16),
    catalogName: x.catalogName === null || x.catalogName === undefined ? null : str(x.catalogName, 64),
    rarity,
    behavior: BEHAVIORS.includes(x.behavior as Behavior) ? (x.behavior as Behavior) : null,
    behaviors,
    signature: arr(x.signature, 64).map((v) => num(v, -1e9, 1e9)),
    sigCount: int(x.sigCount, 0, 1e9, 1),
    timesSeen: int(x.timesSeen, 0, 1e12, 1),
    era: int(x.era, 1, 1e6, 1),
    muRange: range(x.muRange, L.mu),
    sigmaRange: range(x.sigmaRange, L.sigma),
    R: num(x.R, L.R[0], L.R[1], B.BASE_CALIBRATION.R),
    rings: rings(x.rings),
    portrait,
    isNew: bool(x.isNew),
    variantOf: x.variantOf === null || x.variantOf === undefined ? null : str(x.variantOf, 32),
    latin: typeof x.latin === 'string' ? str(x.latin, 64) || null : null,
    ...(typeof x.hue === 'number' && x.hue >= 0 && x.hue <= 360 ? { hue: x.hue } : {}),
    ...(typeof x.shape === 'string' && x.shape ? { shape: str(x.shape, 16) } : {}),
    ...(isObj(x.common) && typeof x.common.es === 'string' && typeof x.common.en === 'string'
      ? { common: { es: str(x.common.es, 48), en: str(x.common.en, 48) } }
      : {}),
    ...(typeof x.world === 'string' && x.world ? { world: str(x.world, 16) } : {}),
    ...(Array.isArray(x.variantsSeen)
      ? { variantsSeen: x.variantsSeen.filter((v): v is string => typeof v === 'string').slice(0, 16).map((v) => str(v, 8)) }
      : {}),
  };
}

const LANGS: Lang[] = ['es', 'en'];
const QUALITIES: ('auto' | Quality)[] = ['auto', 'low', 'medium', 'high'];

function settings(x: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!isObj(x)) return { ...d };
  const vol = (v: unknown, f: number) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : f);
  return {
    lang: LANGS.includes(x.lang as Lang) ? (x.lang as Lang) : d.lang,
    sfxVolume: vol(x.sfxVolume, d.sfxVolume),
    musicVolume: vol(x.musicVolume, d.musicVolume),
    muted: bool(x.muted, d.muted),
    vibration: bool(x.vibration, d.vibration),
    reduceMotion: bool(x.reduceMotion, d.reduceMotion),
    oneTouch: bool(x.oneTouch, d.oneTouch),
    quality: QUALITIES.includes(x.quality as Quality) ? (x.quality as Settings['quality']) : d.quality,
    analytics: bool(x.analytics, d.analytics),
  };
}

/**
 * Strict validation of an untrusted state object. Unknown keys are dropped, missing optional
 * keys get defaults, out-of-range values (negative resources, levels above max, NaN…) reject.
 */
export function validateState(x: unknown): GameState | null {
  try {
    if (!isObj(x)) return null;
    const d = defaultState(0);
    const upgrades: Record<string, number> = {};
    if (!isObj(x.upgrades)) throw new Invalid('upgrades');
    for (const [id, lvl] of Object.entries(x.upgrades)) {
      const def = UPGRADE_BY_ID[id];
      if (!def) continue; // unknown upgrade from a future version: drop
      upgrades[id] = int(lvl, 0, def.maxLevel ?? 1e6);
    }
    const nodes = arr(x.nodes, 64).map((n) => str(n, 32));
    for (const n of nodes) {
      const g = GENOME_BY_ID[n];
      if (!g || g.comingSoon) throw new Invalid('node');
    }
    const statsIn = isObj(x.stats) ? x.stats : {};
    const stats = emptyStats();
    for (const k of Object.keys(stats) as (keyof Stats)[]) stats[k] = numOr(statsIn[k], 0);
    const flags: Record<string, boolean> = {};
    if (isObj(x.flags)) for (const [k, v] of Object.entries(x.flags)) if (v === true) flags[k.slice(0, 32)] = true;
    // The game never caps the bestiary, so this limit is only a sanity bound for imports.
    const speciesList = arr(x.species, MAX_SPECIES).map(species);
    const ids = new Set(speciesList.map((s) => s.id));
    if (ids.size !== speciesList.length) throw new Invalid('dup species');
    const charges = isObj(x.charges) ? x.charges : {};
    const buyQty = x.buyQty === 10 || x.buyQty === 'max' ? x.buyQty : 1;
    const shape: SeedShape = x.shape === 'ring' || x.shape === 'noise' ? x.shape : 'blob';
    const state: GameState = {
      createdAt: num(x.createdAt, 0, Number.MAX_VALUE, 0),
      essence: num(x.essence),
      samples: num(x.samples),
      genome: num(x.genome),
      genomeSpent: num(x.genomeSpent, 0, Number.MAX_VALUE, 0),
      era: int(x.era, 1, 1e6),
      eraEssence: num(x.eraEssence),
      eraTime: numOr(x.eraTime, 0),
      eraStablePeak: int(x.eraStablePeak, 0, 1e6, 0),
      eraHadStable: bool(x.eraHadStable),
      upgrades,
      unlocked: arr(x.unlocked, 64).map((u) => str(u, 32)).filter((u) => UPGRADE_BY_ID[u]),
      maxDropper: int(x.maxDropper, 0, UPGRADE_BY_ID.dropper.maxLevel ?? 5, 0),
      nodes,
      calib: calibration(x.calib),
      // Saved regimes belonged to Calibrar (retired, ADR-026): an old save's are dropped.
      regimes: [],
      species: speciesList,
      specimenCounter: int(x.specimenCounter, 0, 1e6, speciesList.length),
      behaviorsSeen: arr(x.behaviorsSeen, 6).filter((b): b is Behavior => BEHAVIORS.includes(b as Behavior)),
      pendingSpecies: int(x.pendingSpecies, 0, 1e6, 0),
      pendingBehaviors: int(x.pendingBehaviors, 0, 1e6, 0),
      journal: arr(x.journal, 200).map((j) => {
        if (!isObj(j)) throw new Invalid('journal');
        return { id: str(j.id, 32), read: bool(j.read) };
      }),
      achievements: arr(x.achievements, 200).map((a) => str(a, 32)),
      objective: int(x.objective, 0, 1000, 0),
      stats,
      flags,
      epsHistory: arr(x.epsHistory, 1000).map((v) => numOr(v, 0)),
      bucketSum: numOr(x.bucketSum, 0),
      bucketTime: numOr(x.bucketTime, 0, 0, 1e6),
      charges: { free: int(charges.free, 0, 1e6, 0), guaranteed: int(charges.guaranteed, 0, 1e6, 0) },
      buffs: arr(x.buffs, 16).map((b) => {
        if (!isObj(b)) throw new Invalid('buff');
        return { id: str(b.id, 16), remaining: num(b.remaining, 0, 1e6), mult: num(b.mult, 0, 1e6) };
      }),
      goldenTimer: numOr(x.goldenTimer, d.goldenTimer, -1, 1e7),
      autoSeedTimer: numOr(x.autoSeedTimer, 0, 0, 1e7),
      pipetteTimer: numOr(x.pipetteTimer, 0, 0, 1e7),
      archiveTimer: numOr(x.archiveTimer, 0, 0, 1e7),
      settings: settings(x.settings),
      speed: num(x.speed, 1, 16, 1),
      buyQty,
      shape,
    };
    // Sessions cycle (v2): lenient — a damaged research state falls back to null (the game migrates
    // the classic progress again), a damaged session is simply set up anew.
    if (x.research !== undefined) {
      const r = validateResearch(x.research, (id) => !!TREE_BY_ID[id]);
      if (r) state.research = r;
    }
    if (x.session !== undefined && x.session !== null) {
      const ses = validateSession(x.session);
      if (ses) state.session = ses;
    }
    if (isObj(x.carry)) {
      const carry = { essence: numOr(x.carry.essence, 0), encargos: Math.floor(numOr(x.carry.encargos, 0, 0, 1000)) };
      if (carry.essence > 0 || carry.encargos > 0) state.carry = carry;
    }
    return state;
  } catch (e) {
    if (e instanceof Invalid) return null;
    throw e;
  }
}

// ───────────────────────────── Byte helpers (portraits, exports) ───

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function utf8ToBase64(s: string): string {
  return bytesToBase64(new TextEncoder().encode(s));
}

export function base64ToUtf8(b64: string): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(base64ToBytes(b64));
}
