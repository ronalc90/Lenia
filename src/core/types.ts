/**
 * Shared contracts between modules (sim, detect, game, ui, audio).
 * Every module codes against these types. Changing them is the integrator's job:
 * if you need a change, add an optional field rather than renaming one.
 *
 * Coordinates: "grid" units are simulation cells. x grows right, y grows down.
 * The dish is toroidal (wraps on both axes).
 */

// ───────────────────────────── Text / i18n ─────────────────────────────

export type Lang = 'es' | 'en';
/** Player-facing text in both languages. */
export interface Text {
  es: string;
  en: string;
}

// ───────────────────────────── Simulation ──────────────────────────────

export interface LeniaParams {
  /** Kernel radius in cells. */
  R: number;
  /** Peaks of the kernel rings ("b" in Chan's catalog), e.g. [1] or [0.5, 1, 2/3]. */
  rings: number[];
  mu: number;
  sigma: number;
  /** Time step, 1/T. */
  dt: number;
}

/** A small matter image, row-major, values 0..1. */
export interface Pattern {
  w: number;
  h: number;
  data: Float32Array;
}

export interface SeedSpec {
  /** Center in grid cells (floats allowed). */
  x: number;
  y: number;
  /** Radius in grid cells. */
  radius: number;
  /** Peak matter value 0..1. */
  density: number;
  /**
   * 0..1 amplitude of smoothed, asymmetric noise mixed into the seed.
   * Random seeds always need some: a radially symmetric seed can never swim.
   */
  noise: number;
  shape: 'blob' | 'ring' | 'noise' | 'pattern';
  /** Template for shape 'pattern', or bias template for other shapes. */
  pattern?: Pattern;
  /** 0..1, how much of `pattern` is blended into a random seed (seeding help). */
  bias?: number;
  /** Radians, rotation applied to `pattern`. */
  rotation?: number;
  /** Deterministic seed for the noise. */
  rngSeed?: number;
}

/** Downsampled field read back from the GPU for the detector. */
export interface FieldSnapshot {
  /** Snapshot dimensions (grid / scale). */
  w: number;
  h: number;
  /** Grid cells per snapshot cell (e.g. 2). */
  scale: number;
  gridW: number;
  gridH: number;
  /** Mean matter per snapshot cell, 0..1, length w*h. */
  value: Float32Array;
  /** Mean |∇A| per snapshot cell (central differences in grid units), length w*h. */
  grad: Float32Array;
  /** Simulation step count when captured. */
  step: number;
}

export type Quality = 'low' | 'medium' | 'high';

export interface RenderView {
  camera: CameraState;
  /** Seconds since start, for animated effects. */
  time: number;
  quality: Quality;
}

export interface CameraState {
  /** 1 = whole dish fits the canvas; up to 3. */
  zoom: number;
  /** Grid cell at the center of the view. */
  cx: number;
  cy: number;
}

export interface Simulation {
  readonly gridW: number;
  readonly gridH: number;
  readonly params: LeniaParams;
  /** Total simulation steps run so far. */
  readonly stepCount: number;
  setParams(p: Partial<LeniaParams>): void;
  /** Run N simulation steps on the GPU. */
  advance(steps: number): void;
  /** Draw the dish to the canvas it was created with. */
  render(view: RenderView): void;
  seed(spec: SeedSpec): void;
  /** Set matter to 0 inside a disc (soft edge). */
  erase(x: number, y: number, radius: number): void;
  clear(): void;
  /** Read back the downsampled field. Call about every 10 steps, never every frame. */
  snapshot(): FieldSnapshot;
  /** Crop of full-resolution matter centered at (x, y), size×size, wrapping. */
  capture(x: number, y: number, size: number): Pattern;
  /** Whole grid quantized to 8 bits (for saves). */
  exportState(): Uint8Array;
  importState(data: Uint8Array, w: number, h: number): void;
  /** Resize the canvas backing store (CSS size × devicePixelRatio). */
  resizeCanvas(width: number, height: number): void;
  dispose(): void;
}

// ───────────────────────────── Detector ────────────────────────────────

export type CreatureState = 'born' | 'stable' | 'exploded' | 'dead';
export type Behavior = 'still' | 'pulsing' | 'swimmer' | 'spinner' | 'divider' | 'colony';

export interface Creature {
  /** Stable id across updates (tracking). */
  id: number;
  /** Centroid in grid cells. */
  x: number;
  y: number;
  /** Radius of gyration in grid cells. */
  radius: number;
  /** Sum of matter in grid-cell units. */
  mass: number;
  /** Gradient sum normalized so that a reference Orbium ≈ 1.0. */
  complexity: number;
  state: CreatureState;
  /** null until enough history to classify. */
  behavior: Behavior | null;
  /** Steps since first detected. */
  age: number;
  /** Velocity in cells per step. */
  vx: number;
  vy: number;
  /** Morphology/behaviour vector, position/rotation invariant, NOT including mu/sigma. */
  signature: number[];
  parentId: number | null;
  /**
   * (detect) Steps since the creature last became stable (0 while not stable). Absent in fake
   * reports (tests, balance bot): the game then does not gate on it.
   */
  stableSteps?: number;
  /**
   * (detect) Is the body still changing? Static-signature distance between the last two 400-step
   * windows (≈0 for a finished form, even a pulsing one); −1 until two windows of history exist.
   */
  shapeDrift?: number;
}

export type DetectorEvent =
  | { type: 'born'; id: number; x: number; y: number }
  | { type: 'stable'; id: number; x: number; y: number }
  | { type: 'died'; id: number; x: number; y: number }
  | { type: 'exploded'; id: number; x: number; y: number }
  | { type: 'divided'; parentId: number; childIds: number[]; x: number; y: number }
  | { type: 'behavior'; id: number; behavior: Behavior; x: number; y: number };

export interface DetectorReport {
  step: number;
  creatures: Creature[];
  /** Transitions since the previous update. */
  events: DetectorEvent[];
  /** Sum of matter over the whole dish. */
  totalMass: number;
  /** Fraction of dish cells with A > 0.1. */
  fill: number;
}

export interface Detector {
  update(snap: FieldSnapshot, params: LeniaParams): DetectorReport;
  reset(): void;
}

// ───────────────────────────── Game views (for UI) ─────────────────────

export type Currency = 'essence' | 'samples' | 'genome';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'veryRare';
export type BuyQty = 1 | 10 | 'max';

export interface UpgradeView {
  id: string;
  /** Which tab lists it. */
  tab: 'lab' | 'bestiary';
  name: Text;
  desc: Text;
  /** e.g. "+10% → +20%". */
  effect: Text;
  level: number;
  /** null = infinite. */
  maxLevel: number | null;
  /** Cost of the next qty levels for the currently selected qty (UI passes qty to view()). */
  cost: number;
  /** Levels that `cost` buys (1, 10, or computed max). */
  qty: number;
  currency: Currency;
  affordable: boolean;
  unlocked: boolean;
  /** Shown greyed when locked. */
  unlockHint: Text;
  maxed: boolean;
  /**
   * (game) Seconds until `cost` is affordable at the current production (0 = affordable now,
   * null = not reachable by waiting: nothing produces, or paid in Muestras). QA3 #13 "en 45 s".
   */
  secondsToAfford?: number | null;
}

export interface GenomeNodeView {
  id: string;
  branch: 'rules' | 'heritage' | 'fauna';
  name: Text;
  desc: Text;
  cost: number;
  owned: boolean;
  /** Prerequisites met. */
  available: boolean;
  affordable: boolean;
  requires: string[];
  /** (game) Shown but not purchasable in this version. */
  comingSoon?: boolean;
}

export interface SpeciesView {
  id: string;
  /**
   * Common name in the player's language, unique in the bestiary: "Nadadora celeste" / "Sky swimmer"
   * (body + colour family), or the player's own name. The Latin name is `scientificName`.
   */
  name: string;
  /** Real catalog name revealed (italic latin). */
  catalogName: string | null;
  rarity: Rarity;
  behavior: Behavior | null;
  /** Production multiplier m_esp. */
  mult: number;
  timesSeen: number;
  era: number;
  portrait: Pattern | null;
  muRange: [number, number];
  sigmaRange: [number, number];
  printCost: number;
  /** Discovered but not yet looked at in the bestiary. */
  isNew: boolean;
  /**
   * (species) Accent hue in degrees: one of 12 colour families (`colorName`), frozen at registration
   * and different from every other species' family until 12 species (then the most separated hue).
   * For halos, card accents, badges and the matter tint: e.g. `hsl(${hue} 70% 62%)`.
   */
  hue?: number;
  /** (species) Secondary line under the name: "Criatura 3" / "Creature 3" (the registration number). */
  subtitle?: string;
  /** (species) Scientific line, small italic: the catalog name or a procedural Latin name ("Caudion natans"). */
  scientificName?: string | null;
  /** (species) Its colour family in words ("celeste" / "sky"), the colour of `hue`. */
  colorName?: Text;
  /** (species) What its body looks like, in plain words: "disco con cola", "anillo", "media luna"… */
  shapeLabel?: Text;
  /** (species) Stable id of that body kind (pair, ring, trefoil, lobes, spindle, tailed, shield, crescent, cloud, disc). */
  shapeKind?: string;
  /**
   * (game) Why it pays what it pays: averages over its members paying right now (members 0 = none
   * alive: the factors are what a member would get). eps = their summed Essence/s (before buffs).
   */
  production?: YieldView & { members: number; eps: number };
  /** (game) Upgrades that raise this species' yield (its behaviour's Afinidad, Catalogación, Nutriente). */
  boostedBy?: { id: string; name: Text }[];
  /** (species, sessions) The World it lives in (game/worlds WorldId); null when no World grows it. */
  world?: string | null;
  /**
   * (game, sessions) Essence a Copiadora copy of it costs right now: 0 when the Archivo's free copy is
   * ready; null when no copy can be made now (`copyBlocked` says why).
   */
  copyCost?: number | null;
  /** (game, sessions) Why no copy now: no Copiadora yet, no session running, or it lives in another World. */
  copyBlocked?: 'noCopier' | 'noSession' | 'otherWorld' | null;
}

/** (game) The factors of one creature's production (product × global × buffs = Essence/s). */
export interface YieldView {
  /** Measured complexity (capped) × Nutriente. */
  complexity: number;
  /** Behaviour multiplier × its Afinidad (unclassified pays as still). */
  behaviorMult: number;
  /** Species multiplier: rarity × Catalogación (1 while unregistered). */
  speciesMult: number;
  /** 0.85^k: the k-th creature of the same species pays less. */
  diminishing: number;
  /** ×1.5 in a symbiotic pair. */
  symbiosis: number;
}

/**
 * The rules the dish runs right now (the session's World, docs/CICLO.md §4), read-only: Calibrar,
 * its sliders and saved regimes were retired with the classic loop (ADR-026).
 */
export interface CalibrationView {
  mu: number;
  sigma: number;
  R: number;
  dt: number;
  /** (game) Current kernel ring peaks. */
  rings?: number[];
}

export interface JournalEntryView {
  id: string;
  text: Text;
  read: boolean;
}

export interface AchievementView {
  id: string;
  name: Text;
  desc: Text;
  done: boolean;
  /** e.g. "+2% Esencia". */
  reward: Text;
}

export interface CreatureView {
  id: number;
  x: number;
  y: number;
  r: number;
  state: CreatureState;
  behavior: Behavior | null;
  speciesId: string | null;
  speciesName: string | null;
  /** Essence per second this creature currently yields. */
  eps: number;
  age: number;
  /** Optional velocity in cells per simulation step (overlay extrapolation). */
  vx?: number;
  vy?: number;
  /** (species) Accent hue of its species in degrees (see SpeciesView.hue); undefined while unregistered. */
  hue?: number;
  /** (game) Why it pays what it pays (null while it pays nothing). */
  yield?: YieldView | null;
}

export interface GoldenView {
  /** Grid position of the golden spark (moves slowly). */
  x: number;
  y: number;
  /** 0..1 remaining life. */
  life: number;
}

export interface BuffView {
  id: string;
  name: Text;
  /** Seconds remaining. */
  remaining: number;
  /** e.g. 7 for ×7 production. */
  mult: number;
}

export interface Settings {
  lang: Lang;
  sfxVolume: number; // 0..1
  musicVolume: number; // 0..1
  muted: boolean;
  vibration: boolean;
  reduceMotion: boolean;
  oneTouch: boolean;
  quality: 'auto' | Quality;
  analytics: boolean;
  /** UI theme (optional; the UI mirrors it in localStorage 'bioluma.theme'). */
  theme?: 'auto' | 'dark' | 'light';
}

export interface GameView {
  essence: number;
  essencePerSec: number;
  samples: number;
  genome: number;
  era: number;
  /** Cost of a normal seed right now. */
  seedCost: number;
  /** (game) Why the seed costs what it costs, for the price explainer. */
  seedPrice?: SeedPriceView;
  /** (game) The dish is flooded: nothing pays until it is cleaned (actions.sterilizeDish). */
  overgrown?: boolean;
  /**
   * (game) The round walled dish (ADR-025) in grid cells, as Game.setDish last set it; null/absent =
   * the toroidal dish. Overlays clamp to it and never draw wrapped copies.
   */
  dish?: { cx: number; cy: number; radius: number } | null;
  canSeed: boolean;
  /** Emergency pipette: free seed refill when broke and nothing lives. */
  pipette: { active: boolean; progress: number };
  tools: {
    longPress: boolean;
    brush: boolean;
    eraser: boolean;
    /** Simulation speed multipliers available (Incubadora). */
    speeds: number[];
    speed: number;
    /** (game) Seed shapes unlocked by the Gotero (always includes 'blob'). */
    shapes?: SeedShapeChoice[];
    /** (game) Currently selected seed shape. */
    shape?: SeedShapeChoice;
  };
  upgrades: UpgradeView[];
  genomeNodes: GenomeNodeView[];
  species: SpeciesView[];
  /** Behaviours ever seen. */
  behaviorsSeen: Behavior[];
  calibration: CalibrationView;
  journal: JournalEntryView[];
  achievements: AchievementView[];
  extinction: {
    /** (game) 0..1 progress towards availability (essence term). */
    progress?: number;
    available: boolean;
    genomeGain: number;
    /** Estimated gain if the player waits 10 more minutes. */
    gainIn10Min: number;
    requirement: Text;
  };
  golden: GoldenView | null;
  buffs: BuffView[];
  creatures: CreatureView[];
  /** Current objective shown under the HUD ("Siembra tu primera criatura"). */
  objective: Text | null;
  settings: Settings;
  /** Which tabs are visible yet (progressive disclosure). */
  tabs: { lab: boolean; bestiary: boolean; calibrate: boolean; genome: boolean };
  stats: {
    playTime: number;
    totalEssence: number;
    eraEssence: number;
    seeds: number;
    creaturesBorn: number;
  };
  /** (game) Free seeds (Lluvia de esporas) and guaranteed seeds (Mutágeno) waiting to be used. */
  charges?: { free: number; guaranteed: number };
  /** (game) Archivo: free print timer; ready = next print costs 0 Muestras. */
  freePrint?: { active: boolean; ready: boolean; progress: number };
  /** (game) Marcador owned: draw a behaviour dot on creatures. */
  markers?: boolean;
  /** (game) Microscopio level 0..3 (I: μ/σ ranges, II: speed/period/signature, III: slider hints). */
  microscope?: number;
  /** (game) Numeric progress of the current objective. */
  objectiveProgress?: { current: number; target: number; reward: number } | null;
  /** (game) Production multiplier breakdown for the HUD tooltip / Stats (QA3 #13). */
  multipliers?: {
    global: number;
    buffs: number;
    /** The factors of `global` (each a multiplier, their product = global). */
    parts?: { id: string; name: Text; mult: number }[];
    /** Mean species multiplier (m_esp) of the paying creatures (1 if none). */
    species?: number;
    /** Mean behaviour multiplier (m_comp × affinity) of the paying creatures (1 if none). */
    behavior?: number;
  };
  /**
   * (game) QA2 H-05: the nursery is full (SEED_NURSERY_MAX spores still forming): the next tap is
   * refused for free (bus 'seedBlocked' reason 'growing'). Show "⏳ Espera… / Wait…" in grey, not a price.
   */
  seedsGrowing?: boolean;
  /** (game) Turno de laboratorio: the generator that lights the dish during this Era. */
  shift?: ShiftView;
  /**
   * (game) Which loop runs (createGame option `cycle`): the classic continuous Era loop, or lab
   * sessions + research tree + worlds (docs/CICLO.md). Absent = 'classic'. In 'sessions' `era` is
   * the night, `upgrades` lists the research-tree nodes (level = tree level, currency 'genome' =
   * Datos), `genomeNodes` is empty, `extinction.available` is false and the tabs lab / calibrate /
   * genome are hidden.
   */
  cycle?: 'classic' | 'sessions';
  /** (game, sessions) The lab session on the dish (null between sessions is never the case: a 'ready' one waits). */
  session?: SessionClockView | null;
  /** (game, sessions) Datos, tree, night and worlds: what lasts between sessions. */
  research?: ResearchView;
  /** (game, sessions) Datos this session would pay if it ended now, and the cheapest node they reach. */
  sessionPreview?: { datos: number; goal: { id: string; cost: number; missing: number } | null } | null;
  /** (game, sessions) Abono: an in-session production boost bought with Esencia (null when no session runs). */
  boost?: BoostView | null;
}

/** (game, sessions) The lab session clock (docs/CICLO.md §2). */
export interface SessionClockView {
  /** 1-based session number. */
  n: number;
  /** World of this session (game/worlds WorldId). */
  world: string;
  /** 'ready' = waiting for the first seed (the clock starts with it); 'over' = time is up. */
  phase: 'ready' | 'running' | 'over';
  /** Seconds the session was given (Reloj route). */
  limit: number;
  /** Seconds added during the session (new species, Encargos, Sparks). */
  bonus: number;
  elapsed: number;
  /** Seconds left (never negative). */
  remaining: number;
  /** 0..1 of the clock used. */
  progress: number;
  /** Esencia earned this session (spent or not): what becomes Datos. */
  essence: number;
  seeds: number;
  /** Production multiplier of the Sprint final while it runs (null = no sprint now). */
  sprint: number | null;
  /** Species registered for the first time ever this session. */
  newSpecies: number;
  /** The player ended it with "Terminar ahora" (no minimum Datos). */
  endedEarly: boolean;
  /**
   * Session 1 (CLARIDAD §3.3): it teaches seeds, creatures and Esencia only — no Encargos on screen,
   * no Datos pill (sessionPreview is null), no Spark.
   */
  first?: boolean;
}

/** (game, sessions) What persists between sessions. */
export interface ResearchView {
  /** Unspent Datos. */
  datos: number;
  datosEarned: number;
  /** Story night (the tree centre's level). */
  night: number;
  /** The next night's gate is met: the centre can be bought (replaces "Extinction available"). */
  nightReady: boolean;
  /** 0..1 towards the next night's gate (sessions and species; replaces extinction progress). */
  nightProgress: number;
  /** Gate of the next night (null at the last night). */
  gate: { sessions: number; species: number } | null;
  /** Sessions finished. */
  sessions: number;
  /** Tree levels by node id. */
  levels: Readonly<Record<string, number>>;
  /** World picked for the next session and every world open (game/worlds WorldId, in order). */
  world: string;
  worlds: string[];
  /** Tree nodes the player could buy right now (the "N mejoras listas" badge). */
  affordable: number;
  /** Creatures the dish holds (Placa route). */
  capacity: number;
  /** Datos of the last sessions (for "unas N sesiones"). */
  recentDatos: number[];
  /** What every Encargo done in a session adds: Datos to the summary and seconds to the clock. */
  encargoReward?: { datos: number; seconds: number };
  /** Round dish size index (Placa route: TreeEffects.dishLevel → core/dish DISH_DIAMETERS, capped by quality in main). */
  dishLevel?: number;
}

/** (game, sessions) Abono: production ×mult for the rest of the session. */
export interface BoostView {
  /** Esencia the next Abono costs (20 s of current Esencia/s, ×2 per Abono bought this session). */
  cost: number;
  /** Abonos bought this session. */
  count: number;
  /** Production multiplier they give now (1 = none). */
  mult: number;
  /** Multiplier after one more. */
  nextMult: number;
  /** A session runs, Abono is on sale and the wallet covers the cost. */
  affordable: boolean;
  /** Seconds of clock until Abono is on sale this session (0 = now). */
  wait?: number;
  /** No creature makes Essence yet: Abono would multiply nothing, so it is not on sale. */
  needsLife?: boolean;
}

/** (game) Turno de laboratorio view. When `active` is false the lamp is off: dish and production stop. */
export interface ShiftView {
  /** Seconds of shift left (real seconds of running dish). */
  remaining: number;
  /** Full shift length in seconds (Generador, Turno doble). */
  max: number;
  active: boolean;
  /** Essence a recharge costs now (0 when the emergency crank is ready). */
  rechargeCost: number;
  /** A recharge can be done right now (affordable or free). */
  canRecharge: boolean;
  /** The free emergency crank is ready (dark and broke, after a short wait). */
  emergency: boolean;
  /** 0..1 progress of the emergency wait while dark and broke. */
  emergencyProgress: number;
  /** Paid recharges this Era. */
  recharges: number;
  /** The player is idle and the Termo de café is saving fuel. */
  saving: boolean;
  /** Seconds of shift per real second the panels add (0 without panels). */
  panelRate: number;
}

/** Breakdown of the seed price: base × crowd × saturation (× size for big seeds). */
export interface SeedPriceView {
  /** Base cost of a normal seed (c0). */
  base: number;
  /** Creatures alive or being born (incl. seeds not yet detected). */
  alive: number;
  /** Crowding multiplier 1 + 0.25·alive. */
  crowdMult: number;
  /** Cheap slots on the dish (Placa upgrade adds more). */
  freeSlots: number;
  /** Creatures counted against the free slots. */
  used: number;
  /** Saturation multiplier (×3 per creature beyond the free slots). */
  satMult: number;
  /** Multiplier of a big (long-press) seed. */
  bigMult: number;
  /** Free seeds waiting (Lluvia de esporas). */
  freeSeeds: number;
  /**
   * (game, sessions) Gotas baratas factor (1 = none). In sessions there is no crowding and no
   * saturation (crowdMult = satMult = 1, owner: "never punish growth"): the price is
   * base × cheapMult × stepMult, and the limit is room (capacity).
   */
  cheapMult?: number;
  /** ×SEED_PRICE_STEP per seed bought this session (capped). */
  stepMult?: number;
  /** Seeds paid with Esencia this session. */
  bought?: number;
  /** Creatures the dish holds; `used` counts the living, forming and just-sown ones. */
  capacity?: number;
  /** The dish is full: a tap is refused for free (bus 'seedBlocked' reason 'full'). */
  full?: boolean;
}

/** (game) Seed shapes selectable with the Gotero. */
export type SeedShapeChoice = 'blob' | 'ring' | 'noise';

/** Everything the UI may ask the game to do. */
export interface GameActions {
  /** Try to seed at a grid point. Returns the spec to hand to the simulation, or null if unaffordable. */
  seedAt(x: number, y: number, opts?: { big?: boolean }): SeedSpec | null;
  /** Brush stroke segment; returns specs to apply (may be empty). */
  brushAt(x: number, y: number): SeedSpec[];
  /** Imprint a registered species. */
  printAt(speciesId: string, x: number, y: number): SeedSpec | null;
  buyUpgrade(id: string, qty: BuyQty): boolean;
  buyGenomeNode(id: string): boolean;
  /** Prestige. Returns true if it happened (caller clears the dish). */
  extinguish(): boolean;
  renameSpecies(id: string, name: string): void;
  markSpeciesSeen(id: string): void;
  /** Tap on the golden spark. */
  collectGolden(): void;
  markJournalRead(id?: string): void;
  setSpeed(mult: number): void;
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void;
  /** Buy quantity selector shared by upgrade lists. */
  setBuyQty(q: BuyQty): void;
  /** (game) Wipe the dish for free (used when it overflows). Keeps everything earned. */
  sterilizeDish?(): void;
  /** (game) Pick the Gotero seed shape (only unlocked shapes are accepted). */
  setSeedShape?(shape: SeedShapeChoice): void;
  /** (game) Turno de laboratorio: recharge the generator (Essence, or free when the emergency crank is ready). */
  rechargeShift?(): boolean;
  /** (game) Any player input (tap, drag, button): resets the idle clock of the Termo de café. */
  noteActivity?(): void;
  /** (game) A panel tab was opened (QA3 F7: opening the Bestiary counts for "look at your creature"). */
  noteTabOpened?(tab: 'lab' | 'bestiary' | 'calibrate' | 'genome'): void;
  /** (game, sessions) Set up the next session on a fresh dish (after the summary). False while one runs. */
  startSession?(): boolean;
  /** (game, sessions) "Terminar ahora": end the running session (no minimum Datos). */
  endSessionNow?(): boolean;
  /** (game, sessions) Buy one level of a research-tree node with Datos. */
  buyNode?(id: string): boolean;
  /** (game, sessions) Pick the world of the next session (only open worlds; re-plants a waiting dish). */
  pickWorld?(world: string): boolean;
  /** (game, sessions) Buy an Abono (production ×BOOST_MULT for the rest of the session). */
  buyBoost?(): boolean;
}
