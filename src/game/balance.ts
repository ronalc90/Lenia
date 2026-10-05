/**
 * Every tunable number of the game lives here, one commented constant per value.
 * Origin tags: [doc §N] = design doc section, [brief] = approved corrections / fun layer,
 * [bot] = tuned with the classic-loop balance bot (scripts/balance-bot.ts, retired in 2B; the sessions cycle uses scripts/session-bot.ts), [design] = chosen here, open to tuning.
 *
 * Nothing in this file has side effects; tests and the balance bot import it freely.
 */
import type { Behavior, Rarity } from '../core/types';

// The session + research-tree loop (docs/CICLO.md) keeps its numbers in cycleBalance.ts; one import surface.
export * from './cycleBalance';

// ───────────────────────────── Economy ─────────────────────────────

/** Seconds of real time between economic ticks. [doc §5] */
export const ECON_TICK = 0.5;
/** Creature complexity is capped before multipliers so one huge blob cannot carry the run. [brief] */
export const COMPLEXITY_CAP = 3;
/** m_comp by behaviour. [doc §5, §9] */
export const BEHAVIOR_MULT: Record<Behavior, number> = {
  still: 1.0,
  pulsing: 1.3,
  swimmer: 1.6,
  spinner: 1.8,
  divider: 2.2,
  colony: 2.5,
};
/** m_comp of a stable creature not yet classified (pays as 'still'). [brief correction 6] */
export const UNCLASSIFIED_MULT = 1.0;
/**
 * A creature still forming ('born') pays this share of a still creature once it has held together
 * for BORN_PAY_MIN_AGE steps, so the counter never sits at 0 while life is forming (QA3 F5 proposes
 * 0.25). OFF (0): CLAUDE.md's hard gate says the game never pays a creature that is not stable;
 * set 0.25 only together with an ADR that amends that gate. [QA3 §2.13, CLAUDE.md hard gates]
 */
export const BORN_PAY = 0;
/** Steps a 'born' creature must exist before it pays BORN_PAY. [QA3 §2.2: "after 200 calm steps"] */
export const BORN_PAY_MIN_AGE = 200;
/** k-th creature (k = 0,1,2…) of the same species yields ×DECAY^k. [brief correction 5] */
export const SAME_SPECIES_DECAY = 0.85;
/** Minimum seconds between two floating income numbers of the same creature. [brief] */
export const INCOME_POP_INTERVAL = 1.5;
/** Longest realDt a single tick() call integrates (a hidden tab must use applyOffline). [design] */
export const MAX_TICK_DT = 5;

// ───────────────────────────── Species / rarity ─────────────────────

/** m_esp by rarity once registered. [doc §9] */
export const RARITY_MULT: Record<Rarity, number> = { common: 1.1, uncommon: 1.3, rare: 1.6, veryRare: 2.0 };
/** Rarity of species that are not in Chan's catalog (player discoveries). [brief] */
export const DEFAULT_RARITY: Rarity = 'uncommon';
/**
 * Hand-assigned rarity of the curated catalog species (by code). [brief] Roughly: how hard the
 * species is to reach (Calibrador level, narrow σ, multi-ring) and to keep alive.
 */
export const RARITY_BY_CODE: Record<string, Rarity> = {
  O2u: 'common', // Orbium unicaudatus — tutorial creature
  O2b: 'common', // Orbium bicaudatus — same regime as O2u
  O4i: 'common', // Synorbium ignis — next to Orbium
  S1s: 'common', // Scutium solidus — robust producer
  S2s: 'common', // Discutium solidus
  OG2g: 'uncommon', // Gyrorbium gyrans — first spinner
  OG2r: 'uncommon', // Gyrorbium revolvens
  O2ui: 'uncommon', // Orbium unicaudatus ignis
  O4s: 'uncommon', // Synorbium solidus
  S1v: 'uncommon', // Scutium valvatus
  'SN+': 'uncommon', // Catenoscutium bidirectus
  P3sp: 'uncommon', // Synptera sinus pedes
  H3cp: 'uncommon', // Helicium cavus pedes
  PG1c: 'uncommon', // Gyropteron cavus
  O4a: 'uncommon', // Parorbium adhaerens
  O4d: 'rare', // Parorbium dividuus — first divider
  H3s: 'rare', // Helicium solidus — early rare
  PG1a: 'rare', // Gyropteron arcus
  P4cp: 'rare', // Paraptera cavus pedes
  O2p: 'rare', // Orbium phantasma (T=40, very narrow σ)
  C0v: 'rare', // Circium ventilans
  PS3am: 'rare', // Pyroscutium ambiguus
  H5s: 'veryRare', // Pentahelicium solidus
  S3s: 'veryRare', // Triscutium solidus
  '3GH2n': 'veryRare', // Hydrogeminium natans — multi-ring (Genome)
  K4d: 'veryRare', // Kronium dividuus — multi-ring (Genome)
};
/** Muestras for registering a new species, by rarity. [doc §5: +1, +3 if rare] */
export const SAMPLES_NEW_SPECIES: Record<Rarity, number> = { common: 1, uncommon: 1, rare: 3, veryRare: 5 };
/** Muestras the first time a species shows a behaviour it never showed before. [doc §5] */
export const SAMPLES_NEW_BEHAVIOR = 1;
/** Muestras per Impresión by rarity. [doc §5: 1 common, 2 rare] */
export const PRINT_COST: Record<Rarity, number> = { common: 1, uncommon: 1, rare: 2, veryRare: 3 };
/** Running-average weight cap for a species signature (keeps it able to drift slowly). [design] */
export const SIGNATURE_AVG_CAP = 20;
/** Catalog reveal accepts a signature match up to threshold × this factor. [design] */
export const CATALOG_MATCH_FACTOR = 1.2;
/** Normalisation of μ distance when ranking catalog candidates (reveal / spore template). [design] */
export const PARAM_MU_SCALE = 0.03;
/** Normalisation of σ distance when ranking catalog candidates. [design] */
export const PARAM_SIGMA_SCALE = 0.006;
/** Catalog reveal ignores candidates whose normalised (μ,σ) distance exceeds this. [design] */
export const CATALOG_REVEAL_MAX_PARAM_DIST = 3;
/** Longest species / regime name in user-perceived characters (UI field maxlength must match). [QA1 #5] */
export const NAME_MAX_CHARS = 24;
/** Biggest portrait side kept in the save (larger crops are centre-cropped). [doc §9: 64×64] */
export const PORTRAIT_MAX_SIDE = 96;
/**
 * A NEW species is only registered from a finished form (play-test: "after the first one they all
 * look the same and amorphous"; scripts/species-audit.ts). Until then the creature pays as an
 * unknown stable creature. Matching an already registered species stays immediate.
 * Stable for at least this many steps (two of the detector's 400-step shape windows). [audit]
 */
export const SPECIES_MIN_STABLE_STEPS = 800;
/**
 * …its shape no longer changing: detector shapeDrift (static-signature distance between the last
 * two 400-step windows) at most this. Catalog species settle below ~0.5 at their params (O2u 0.05,
 * P3sp 0.5); morphing blobs and creatures that just fused or split are far above. [audit]
 */
export const SPECIES_MAX_SHAPE_DRIFT = 0.6;
/** …a single body: mean connected parts (signature PARTS) at most this, unless it is a catalog form. [audit] */
export const SPECIES_MAX_PARTS = 1.1;
/** …not a speck: mass ≥ this · R² (the lightest viable catalog form, O2p, is 0.33 R²), unless catalog. [audit] */
export const SPECIES_MIN_MASS_R2 = 0.2;
/** Portrait capture square side in units of R (big Helicium-like bodies must not be cut). [audit] */
export const PORTRAIT_CAPTURE_R = 5;
/** Largest capture side in cells (also bounded by PORTRAIT_MAX_SIDE for the save). [design] */
export const PORTRAIT_CAPTURE_MAX = 96;
/** A portrait loaded from a save (unknown provenance) scores this much lower than a fresh capture. [design] */
export const PORTRAIT_OLD_PENALTY = 0.5;
/**
 * Portrait captures the game asks for per species and session (best one kept). Each capture is a
 * synchronous GPU read today (QA3 F2), so: one at registration (already a finished form), and more
 * only while the stored portrait is not good yet. [QA3, design]
 */
export const PORTRAIT_MAX_CAPTURES = 3;
/** A stored portrait scoring at least this (clean, uncut, representative) is never re-captured. [design] */
export const PORTRAIT_GOOD_SCORE = 1.4;
/** Steps to wait before re-capturing a creature (founder after registration, members after matching). [design] */
export const PORTRAIT_RECAPTURE_DELAY = 600;
/** A re-capture waits until no other creature is within this many R (a clean square). [design] */
export const PORTRAIT_CLEAR_R = 2.5;

// ───────────────────────────── Collection milestones ─────────────────

/** +X to M_global for every SPECIES_MILESTONE_STEP registered species. [doc §8] */
export const SPECIES_MILESTONE_BONUS = 0.05;
/** Species per collection milestone. [doc §8] */
export const SPECIES_MILESTONE_STEP = 5;
/** +X to M_global per distinct behaviour ever seen. [doc §8] */
export const BEHAVIOR_MILESTONE_BONUS = 0.1;
/** +X to M_global per Genome point spent. [doc §10] */
export const GENOME_SPENT_BONUS = 0.02;
/**
 * +X to M_global per UNSPENT Genome point: the infinite sink once the tree is bought (QA3 F6, à la
 * Cookie Clicker's heavenly chips). Lower than the spent bonus so buying nodes stays better. [QA3]
 */
export const GENOME_UNSPENT_BONUS = 0.01;

// ───────────────────────────── Seeding ─────────────────────────────

/** Essence at the start of every Era (without Arranque con Esencia). [doc §5] */
export const START_ESSENCE = 20;
/** Free seeds of a brand-new game (QA2 H-04: "¡Vida!" at once, not after 4–9 failed taps). [QA2] */
export const START_FREE_SEEDS = 3;
/** Guaranteed (pure template) seeds of a brand-new game: the very first tap takes. [QA2 H-04] */
export const START_GUARANTEED_SEEDS = 1;
/** c0 of the seed cost formula c0·(r/R)²·(1 + crowd·n_alive). [doc §5] */
export const SEED_C0 = 2;
/** Crowding factor per stable creature in the seed cost. [doc §5] */
export const SEED_CROWD = 0.25;
/**
 * Saturation: every stable creature beyond the free slots (DISH_FREE_SLOTS) multiplies the seed cost
 * by this. Without it a creature repays its seeds in ~10 s and the dish fills in a minute (bot).
 * QA3 package "Hh": 3 → 1.6 so population is the main growth axis ("creatures are the
 * buildings"): the 8th creature costs ~60 instead of 13 K. [QA3 §2.12, bot]
 */
export const SEED_SATURATION_GROWTH = 1.6;
/**
 * Cap on the saturation exponent: the price never exceeds growth^max for crowding. Without it a
 * flooded dish priced a seed at 1e38. [play-test]
 */
export const SEED_SATURATION_MAX_STEPS = 4;
/**
 * Dish "overgrown" (desbordada): fraction of cells with matter above which the dish counts as
 * flooded — every creature pays 0, no species are registered and the player is offered a free
 * clean-up. Must match the detector's DISH_OVERGROWN_FILL. [play-test: budding/maze flood]
 */
export const DISH_OVERGROWN_FILL = 0.25;
/** The overgrown state ends when the fill drops below this (hysteresis). [design] */
export const DISH_OVERGROWN_CLEAR = 0.15;
/**
 * A dish that stays overgrown this many active seconds cleans itself for free (owner play-test:
 * the flooded dish soft-locked the game before the "Limpiar placa" button shipped; 20 s still felt
 * stuck in the tutorial, v0.008). [play-test]
 */
export const OVERGROWN_AUTO_CLEAN = 8;
/**
 * New species registrations are a token bucket: up to SPECIES_NEW_BURST at once, refilling one
 * token every SPECIES_NEW_MIN_INTERVAL seconds, so fragment storms can't spam the bestiary. [play-test]
 */
export const SPECIES_NEW_BURST = 3;
/** Seconds to refill one new-species token. [play-test] */
export const SPECIES_NEW_MIN_INTERVAL = 15;
/** Neighbours are counted within this many R of a creature. [play-test] */
export const SPECIES_NEW_ISOLATION_R = 2.5;
/** A creature with this many neighbours is part of a crowd (maze fragment) and can't found a species. [play-test] */
export const SPECIES_NEW_CROWD_NEIGHBORS = 3;
/** Newborn (not yet stable) creatures that do not count towards saturation: a short burst of taps is fine. [design] */
export const SEED_NURSERY_FREE = 2;
/**
 * Seed spacing (play-test flood, e2e mobile smoke): a seed must leave SEED_GAP·R of empty dish between
 * the matter it stamps and every creature body or not-yet-detected seed; otherwise it moves to the
 * nearest spot with room within SEED_RELOCATE·R of the tap, or is refused (nothing charged).
 * Measured with a CPU repro of the smoke (5 taps on a 128×160 torus at μ .15 σ .015): see the
 * report of species-audit / flood repro. [play-test, measured]
 */
export const SEED_GAP = 1.5;
/**
 * At most this many spores forming at once (newborns + seeds not yet reported); more taps are
 * refused for free with "⏳ Espera…" (QA2 H-05). Kids' tap bursts flooded the dish (QA2 H-06). [measured]
 */
export const SEED_NURSERY_MAX = 3;
/** Spore templates vary (sporeCandidates) only once this many species are registered. [measured] */
export const SPORE_VARIETY_AFTER_SPECIES = 1;
/** How far (in R) a tapped seed may be moved to find room. [design: "within ~2 R"] */
export const SEED_RELOCATE = 2;
/** Body extent of a detected creature = this × its radius of gyration (a disc: r ≈ 1.4–1.6 rg). [measured] */
export const SEED_BODY_FROM_RG = 1.5;
/** …and at least this many R (a forming blob's rg is still small). [design] */
export const SEED_BODY_MIN_R = 0.6;
/** Seeds younger than this (s) that the detector has not reported yet still block their spot. [design] */
export const SEED_SPACING_MEMORY = 3;
/**
 * …but only until the detector has looked at it: two snapshots (one every 10 steps) after it was
 * placed it is a reported creature or nothing (owner, v0.014: "dice que hay entidades al lado estando
 * la placa vacía"). [detect: snapshot every 10 steps]
 */
export const SEED_SEEN_STEPS = 20;
/** Long press seed radius multiplier (cost ×2.25 follows from the formula). [doc §7] */
export const SEED_BIG_RADIUS = 1.5;
/** Seed radius in units of R. [doc §4: radio ≈ R] */
export const SEED_RADIUS = 1.0;
/** Seed peak density range (uniform). [doc §4: 0.5–0.8; brief 0.6–0.8] */
export const SEED_DENSITY_MIN = 0.6;
/** Upper bound of the seed density. [brief] */
export const SEED_DENSITY_MAX = 0.8;
/**
 * Template bias of a plain spore seed with no upgrades. Measured at Orbium params: bias 0.7 ≈ 5 %
 * survival, bias 1 = 100 %; this value targets ≈25 % (integrator re-tunes with real data). [brief]
 */
export const SEED_BIAS_BASE = 0.88;
/** Extra template bias by Gotero level (index = level, cumulative). Gotero I targets ≈40 %. [brief] */
export const SEED_BIAS_GOTERO = [0, 0.04, 0.045, 0.05, 0.055, 0.06];
/** Extra template bias per Estabilizador level ("+3 % success" per level). [doc §8] */
export const SEED_BIAS_STABILIZER = 0.004;
/** Hard ceiling of the bias of a random seed (pure template is reserved to Mutágeno/prints). [design] */
export const SEED_BIAS_MAX = 0.985;
/** Noise amplitude of a spore seed with no upgrades. [brief] */
export const SEED_NOISE_BASE = 0.35;
/** Noise amplitude by Gotero level (index = level). Lower noise = more consistent seeds. [brief] */
export const SEED_NOISE_GOTERO = [0.35, 0.25, 0.23, 0.21, 0.19, 0.17];
/** Noise removed per Estabilizador level. [design] */
export const SEED_NOISE_STABILIZER = 0.006;
/** Minimum noise of a random seed (correction 1: always some asymmetric noise). [brief] */
export const SEED_NOISE_MIN = 0.08;
/** Bias multiplier and noise multiplier by Gotero shape (ring/noise trade success for surprise). [design] */
export const SHAPE_FACTORS: Record<'blob' | 'ring' | 'noise', { bias: number; noise: number }> = {
  blob: { bias: 1, noise: 1 },
  ring: { bias: 0.85, noise: 1.2 },
  noise: { bias: 0.6, noise: 2.2 },
};
/** Invisible help starts after this many active seconds without any stable creature in the Era. [doc §6] */
export const SEED_HELP_DELAY = 180;
/** Invisible help: bias added every SEED_HELP_INTERVAL seconds past the delay. [doc §6] */
export const SEED_HELP_STEP = 0.02;
/** Invisible help interval in seconds. [design] */
export const SEED_HELP_INTERVAL = 30;
/** Invisible help maximum extra bias. [design] */
export const SEED_HELP_MAX = 0.08;
/**
 * Spore diversity: a spore's template is drawn among the SPORE_K catalog species nearest to the
 * calibration (same rings) that lie within SPORE_MAX_PARAM_DIST of it (the nearest one always
 * counts), with softmax weights exp(−Δd / SPORE_TEMPERATURE) on the normalised (μ, σ) distance.
 * Measured (game spores, bias 0.88, CPU sim, 10–12 seeds per template, survivors at 1 600 steps):
 * μ .15 σ .015: O2u 42 %, O4i 75 % (some stay Synorbium), O2b 42 % → mix 52 % vs 42 % before;
 * μ .22 σ .034: H3cp 40 % (60 % explode), P3sp 90 % → mix 50 %; μ .29 σ .045: S1s 40 %, S1v 10 %,
 * P4cp 100 % → mix 41 %. Templates farther than ~0.6 rarely live (OG2g at .165/.019: 0/10). [audit]
 */
export const SPORE_K = 4;
/** Extra candidates must be within this normalised (μ, σ) distance of the calibration. [audit] */
export const SPORE_MAX_PARAM_DIST = 0.6;
/** Softmax temperature of the spore template choice (lower = nearest template dominates). [audit] */
export const SPORE_TEMPERATURE = 0.35;
/**
 * Templates of forms the player has not discovered yet weigh this many times more (owner: "the
 * first species must look different"). At μ .15 σ .015 only Orbium and Synorbium ignis live (CPU
 * test of every catalog pattern there), so after Orbium ~56 % of spores are Synorbium ignis. [owner]
 */
export const SPORE_NOVELTY = 3;
/** Mutágeno: number of guaranteed (pure template) seeds. [brief] */
export const MUTAGEN_SEEDS = 3;
/** Brush dab radius in units of R. [design] */
export const BRUSH_RADIUS = 0.45;
/** Distance between two brush dabs in units of R. [design] */
export const BRUSH_SPACING = 0.5;
/** A pause longer than this (ms) between brushAt calls starts a new stroke. [design] */
export const BRUSH_STROKE_GAP_MS = 250;
/** Brush dab density. [design] */
export const BRUSH_DENSITY = 0.75;
/** Seconds a fresh seed blocks its spot for the auto-seeder (before the detector sees it). [design] */
export const RECENT_SEED_MEMORY = 12;
/** A seed younger than this (s) with no detected creature nearby still counts as alive for the seed cost. [design] */
export const SEED_PENDING_WINDOW = 1;

/** Emergency pipette fill time in seconds, by Pipeta rápida level. [doc §5, §8] */
export const PIPETTE_TIME = [10, 6, 3, 1.5];

// ───────────────────────────── Auto-seeder (Sembrador) ─────────────

/** Sembrador interval at level 1, seconds. [doc §8] */
export const AUTOSEED_INTERVAL = 20;
/** Each extra level multiplies the interval by this (−8 %). [doc §8] */
export const AUTOSEED_DECAY = 0.92;
/** Minimum Sembrador interval, seconds. [doc §8] */
export const AUTOSEED_MIN_INTERVAL = 2;
/** Free spot = farther than this many R from every creature (wrap-aware). [brief] */
export const AUTOSEED_SPACING = 3;
/** Random candidate points tried per auto-seed. [design] */
export const AUTOSEED_TRIES = 40;
/** The Sembrador only seeds when the seed costs at most this fraction of the bank. [design] */
export const AUTOSEED_MAX_SPEND = 0.5;

// ───────────────────────────── Upgrades: Laboratorio ───────────────

/** Gotero fixed costs. [doc §8: 15, 60, 250, 1 200, 6 000; bot: ×~10 after I; QA3 F10: II back to the doc's 60 for the minute 1–4 gap] */
export const DROPPER_COSTS = [15, 60, 1500, 12000, 80000];
/** Sembrador base cost b. [doc §8: 40; bot: lands at ~6–7 min for greedy] */
export const AUTOSEEDER_BASE = 750;
/** Sembrador growth g. [doc §8] */
export const AUTOSEEDER_GROWTH = 1.25;
/** Cultivo base cost b. [doc §8: 50; bot] */
export const CULTURE_BASE = 500;
/** Cultivo growth g. [doc §8] */
export const CULTURE_GROWTH = 1.35;
/** Cultivo: +X to M_global per level, compounding (×1.1^level) so the Era keeps rising. [doc §8; bot] */
export const CULTURE_BONUS = 0.1;
/** Cultivo unlocks at this essence/second. [doc §8] */
export const CULTURE_UNLOCK_EPS = 10;
/** Calibrador fixed costs. [doc §8: 25, 300, 3 000, 30 000; QA3 "Hh": σ, dt and R sliders reachable in Era 1; F10: I at 150] */
export const CALIBRATOR_COSTS = [150, 2500, 25000, 200000];
/** Estabilizador base cost. [doc §8: 80; bot] */
export const STABILIZER_BASE = 400;
/** Estabilizador growth. [doc §8: 1.30; bot] */
export const STABILIZER_GROWTH = 1.35;
/** Estabilizador max level. [doc §8] */
export const STABILIZER_MAX = 10;
/** Estabilizador: success gain per level shown to the player (real effect: SEED_BIAS_STABILIZER). [doc §8] */
export const STABILIZER_SHOWN_BONUS = 0.03;
/** Placa fixed costs. [doc §8: 100, 1 000, 10 000, 100 000; bot] */
export const DISH_COSTS = [3000, 30000, 300000, 3000000];
/**
 * Placa: stable creatures that fit before saturation raises the seed cost, by level. The grid is
 * fixed per quality profile (brief correction 8), so "more room" is economic room. QA3 "Hh": the
 * first 3 creatures never feel punished and each Placa level is +2–3 creatures. [QA3 §2.12, bot]
 */
export const DISH_FREE_SLOTS = [3, 5, 7, 9, 12];
/** Placa: auto-seeder spacing in R by level (creatures can live closer). [design] */
export const DISH_SPACING = [3, 2.75, 2.5, 2.3, 2.1];
/** Placa: +X production per level (healthier medium). [design] */
export const DISH_BONUS = 0.1;
/** Placa unlocks with this many stable creatures at once. [doc §8] */
export const DISH_UNLOCK_CREATURES = 4;
/** Incubadora fixed costs. [doc §8: 200, 2 000; QA3 "Hh": ×2/×4 is a toy, reachable in Era 1] */
export const INCUBATOR_COSTS = [2000, 20000];
/** Speeds available by Incubadora level. [doc §7] */
export const INCUBATOR_SPEEDS = [[1], [1, 2], [1, 2, 4]];
/** Afinidad nadadora / sésil base cost. [doc §8: 120; bot] */
export const AFFINITY_BASE = 800;
/** Afinidad colonial base cost. [doc §8: 300; bot] */
export const COLONY_AFFINITY_BASE = 2000;
/** Afinidades growth. [doc §8: 1.35; bot] */
export const AFFINITY_GROWTH = 1.4;
/** Afinidades max level. [doc §8] */
export const AFFINITY_MAX = 10;
/** Afinidades: +X production per level for their behaviours. [doc §8] */
export const AFFINITY_BONUS = 0.08;
/** Reserva fixed costs. [doc §8: 500, 5 000, 50 000; bot] */
export const RESERVE_COSTS = [5000, 50000, 500000];
/** Offline cap in hours by Reserva level. [doc §8, §12] */
export const RESERVE_HOURS = [2, 8, 12, 24];
/** Pipeta rápida fixed costs. [doc §8] */
export const FAST_PIPETTE_COSTS = [100, 1000, 10000];
/** Nutriente base cost. [doc §8: 1 000; bot] */
export const NUTRIENT_BASE = 50000;
/** Nutriente growth. [doc §8: 1.5; bot] */
export const NUTRIENT_GROWTH = 1.6;
/** Nutriente max level. [doc §8] */
export const NUTRIENT_MAX = 5;
/** Nutriente: +X measured complexity per level (applied after the cap). [doc §8] */
export const NUTRIENT_BONUS = 0.04;
/** Nutriente unlocks at this Cultivo level. [doc §8] */
export const NUTRIENT_UNLOCK_CULTURE = 10;

// ───────────────────────────── Upgrades: Bestiario (Muestras) ───────

/** Microscopio costs in Muestras. [doc §8] */
export const MICROSCOPE_COSTS = [3, 8, 20];
/** Catalogación costs in Muestras. [doc §8] */
export const CATALOGUING_COSTS = [5, 8, 12, 18, 27];
/** Catalogación: +X to m_esp of every registered species per level. [doc §8] */
export const CATALOGUING_BONUS = 0.1;
/** Archivo costs in Muestras. [doc §8] */
export const ARCHIVE_COSTS = [6, 15, 40];
/** Archivo: seconds between free prints by level (index = level). [doc §8] */
export const ARCHIVE_INTERVAL = [Infinity, 600, 300, 120];
/** Marcador cost in Muestras. [doc §8] */
export const MARKER_COSTS = [10];

// ───────────────────────────── Calibration ─────────────────────────

/** Calibration at the start of every Era. [doc §4, §10] */
export const BASE_CALIBRATION = { mu: 0.15, sigma: 0.015, R: 13, dt: 0.1, rings: [1] as number[] };
/** Absolute calibration limits accepted from saves/imports. [doc §4] */
export const CALIBRATION_LIMITS = { mu: [0.05, 0.6], sigma: [0.001, 0.2], R: [5, 40], dt: [0.01, 1] } as const;
/** Doc §11: after this many active seconds without a new species, Microscopio I is given free once. */
export const FREE_MICROSCOPE_AFTER = 1200;
/** Seconds between two "dish saturated" toasts from the Sembrador. [design] */
export const SATURATED_TOAST_COOLDOWN = 120;

// ───────────────────────────── Prestige ────────────────────────────

/** Essence divisor in G = floor(sqrt(E_era / DIV)) + … [doc §5] */
export const GENOME_ESSENCE_DIV = 1e4;
/** Genome per species registered for the first time ever. [doc §5: 2; QA3 F6: 1 (explorer Era 1: 47 → ~28)] */
export const GENOME_PER_SPECIES = 1;
/** Genome per behaviour seen for the first time ever. [doc §5] */
export const GENOME_PER_BEHAVIOR = 1;
/** Extinction is available when the essence term alone reaches this. [doc §10, brief correction 3] */
export const EXTINCTION_MIN_ESSENCE_TERM = 5;
/** Genome tab appears when E_era reaches this fraction of the extinction requirement. [design] */
export const GENOME_TAB_REVEAL = 0.35;
/** Arranque con Esencia: Era starts with this × Era number. [doc §10] */
export const ESSENCE_START_PER_ERA = 500;
/** Sembrador persistente: Era starts with this Sembrador level. [doc §10] */
export const PERSISTENT_SEEDER_LEVEL = 3;
/** Mutaciones: chance that a print mutates. [doc §10] */
export const MUTATION_CHANCE = 0.1;
/** Mutaciones: maximum relative scale change of a mutated print. [design] */
export const MUTATION_SCALE = 0.12;
/** Mutaciones: noise amplitude of a mutated print. [design] */
export const MUTATION_NOISE = 0.15;
/** A new species stabilising within this many R of a mutated print, this many s later, is a "var.". [design] */
export const MUTATION_LINK_DIST = 2.5;
/** Seconds a mutated print stays linkable. [design] */
export const MUTATION_LINK_TIME = 90;
/** Simbiosis: distance in R between two different species. [doc §10] */
export const SYMBIOSIS_DIST = 2;
/** Simbiosis multiplier for both members. [doc §10] */
export const SYMBIOSIS_MULT = 1.5;
/** Genome node costs. [doc §10] */
export const GENOME_COSTS: Record<string, number> = {
  doubleRings: 5,
  tripleRings: 12,
  secondChannel: 20,
  flow: 40,
  // Herencia: Arranque con Esencia is the cheap root so Era 2 opens fast (QA3 F8).
  essenceStart: 3,
  dropperMemory: 3,
  regimesPersist: 4,
  persistentSeeder: 10,
  mutations: 8,
  symbiosis: 15,
  predation: 25,
};

// ───────────────────────────── Offline ─────────────────────────────

/** Fraction of the recent average production paid while away. [doc §12] */
export const OFFLINE_RATE = 0.5;
/** Seconds of active play averaged for offline. [doc §12: last 5 min] */
export const OFFLINE_WINDOW = 300;
/** Bucket size (s) of the stored production history. [design] */
export const EPS_BUCKET = 10;
/** Absolute offline cap in seconds regardless of Reserva (clock-skew rule). [doc §12] */
export const OFFLINE_HARD_CAP = 24 * 3600;
/** Away time below this is not "a return" (no card, no Reserva unlock). [design] */
export const OFFLINE_MIN_RETURN = 60;

// ───────────────────────────── Golden spark (Destello) ─────────────

/** Spawn interval range in seconds. [brief] */
export const GOLDEN_INTERVAL: [number, number] = [90, 240];
/** First spark after the first stable creature, range in seconds. [doc §23.1: 40–80 s; QA3 F9] */
export const GOLDEN_FIRST_DELAY: [number, number] = [40, 80];
/** Lifetime in seconds. [brief] */
export const GOLDEN_LIFE = 12;
/** Drift speed in grid cells per second. [design] */
export const GOLDEN_SPEED = 5;
/** Floración: production multiplier. [brief] */
export const BLOOM_MULT = 7;
/** Floración: duration in seconds. [brief] */
export const BLOOM_TIME = 30;
/** Lump reward = this many seconds of current production… [brief] */
export const LUMP_SECONDS = 90;
/** …but at least this much essence. [design] */
export const LUMP_MIN = 25;
/** Lluvia de esporas: number of free seeds. [brief] */
export const SPORE_RAIN_SEEDS = 5;
/** "Lluvia de esporas" becomes an Essence lump when the bank holds this many seeds already (or the dish is full). [QA3 F9] */
export const SPORES_REROLL_BANK = 10;
/** Reward weights (bloom is rerolled when nothing produces). [design] */
export const GOLDEN_WEIGHTS = { bloom: 0.38, lump: 0.32, spores: 0.18, mutagen: 0.12 };

// ───────────────────────────── Default dish size ───────────────────

/** Grid used until the integrator calls setGridSize (medium profile). [brief correction 8] */
export const DEFAULT_GRID = { w: 192, h: 240 };
/**
 * Round dish (ADR-025, docs/DISH.md §1): a seed's body stays this many R inside the glass (a spore
 * touching the absorbing rim loses its edge before it organises).
 */
export const SEED_RIM_MARGIN = 0.5;
/** Auto-seeder / spore rain spots: at least this many R inside the glass (docs/DISH.md, Phase 2 decision). */
export const AUTOSEED_RIM_MARGIN = 2;
/**
 * The Nevera's first plant of a run (the creature already alive when the clock starts) lands within
 * this many R of the dish centre. A swimmer needs two detector updates before the glass can steer it:
 * spawned within 22 cells of the centre of the Ø96 start dish 2 of 10 died at the glass at once, within
 * 0.6·R (8 cells) 10 of 10 lived 2000 steps (CPU lab, docs/DISH.md §8d).
 */
export const STARTER_SPAWN_R = 0.6;
/** The golden spark drifts at least this many R inside the glass, bouncing off it. */
export const GOLDEN_RIM_MARGIN = 1;

// ───────────────────────────── Save ────────────────────────────────

/**
 * Save schema version. [doc §16] v2 adds the optional `research` + `session` of the sessions cycle
 * (docs/CICLO.md); v1 saves still load (they have neither) and are migrated with migrateLegacy when
 * opened in the sessions cycle.
 */
export const SAVE_VERSION = 2;
/** Save versions this build reads (v1 = before the sessions cycle). */
export const SAVE_VERSIONS_READ: readonly number[] = [1, 2];
/** Prefix of exported save strings. [doc §16, renamed] */
export const EXPORT_PREFIX = 'BIOLUMA1.';

// ───────────────────────────── Objectives (first hour) ─────────────

/**
 * Metric names understood by the game (see game.ts `metric()`):
 * seeds, stable (stable creatures right now), species, speciesSeen (looked at in bestiary),
 * upgrade:<id> (level), eps, calibrations, golden, behaviors, prints, eraEssence, extinctions.
 */
export interface MetricGoal {
  id: string;
  metric: string;
  target: number;
}
/** Objective chain shown under the HUD; reward = essence paid on completion. [brief, bot] */
export const OBJECTIVES: (MetricGoal & { reward: number })[] = [
  { id: 'seed', metric: 'seeds', target: 1, reward: 4 },
  { id: 'stable', metric: 'stable', target: 1, reward: 8 },
  { id: 'look', metric: 'speciesSeen', target: 1, reward: 10 },
  { id: 'dropper', metric: 'upgrade:dropper', target: 1, reward: 15 },
  { id: 'two', metric: 'stable', target: 2, reward: 30 },
  { id: 'eps3', metric: 'eps', target: 3, reward: 50 },
  { id: 'calib', metric: 'upgrade:calibrator', target: 1, reward: 80 },
  { id: 'move', metric: 'calibrations', target: 1, reward: 80 },
  { id: 'seeder', metric: 'upgrade:autoSeeder', target: 1, reward: 150 },
  { id: 'species3', metric: 'species', target: 3, reward: 200 },
  { id: 'golden', metric: 'golden', target: 1, reward: 150 },
  { id: 'behaviors2', metric: 'behaviors', target: 2, reward: 250 },
  { id: 'eps10', metric: 'eps', target: 10, reward: 300 },
  { id: 'culture', metric: 'upgrade:culture', target: 1, reward: 300 },
  { id: 'print', metric: 'prints', target: 1, reward: 400 },
  { id: 'species6', metric: 'species', target: 6, reward: 1000 },
  { id: 'eps50', metric: 'eps', target: 50, reward: 2000 },
  { id: 'dish', metric: 'upgrade:dish', target: 1, reward: 3000 },
  { id: 'era100k', metric: 'eraEssence', target: 100000, reward: 10000 },
  { id: 'extinct', metric: 'extinctions', target: 1, reward: 0 },
];

// ───────────────────────────── Achievements ────────────────────────

/** Achievements: permanent +bonus to M_global when reached (lifetime metrics). [brief] */
export const ACHIEVEMENTS: (MetricGoal & { bonus: number })[] = [
  { id: 'firstSeed', metric: 'seeds', target: 1, bonus: 0.01 },
  { id: 'firstLife', metric: 'stableEver', target: 1, bonus: 0.02 },
  { id: 'seeds100', metric: 'seeds', target: 100, bonus: 0.02 },
  { id: 'seeds1000', metric: 'seeds', target: 1000, bonus: 0.03 },
  { id: 'species3', metric: 'species', target: 3, bonus: 0.02 },
  { id: 'species10', metric: 'species', target: 10, bonus: 0.03 },
  { id: 'species20', metric: 'species', target: 20, bonus: 0.05 },
  { id: 'swimmer', metric: 'behavior:swimmer', target: 1, bonus: 0.02 },
  { id: 'spinner', metric: 'behavior:spinner', target: 1, bonus: 0.02 },
  { id: 'pulsing', metric: 'behavior:pulsing', target: 1, bonus: 0.02 },
  { id: 'divider', metric: 'behavior:divider', target: 1, bonus: 0.03 },
  { id: 'colony', metric: 'behavior:colony', target: 1, bonus: 0.03 },
  { id: 'allBehaviors', metric: 'behaviors', target: 6, bonus: 0.05 },
  { id: 'eps10', metric: 'epsPeak', target: 10, bonus: 0.02 },
  { id: 'eps100', metric: 'epsPeak', target: 100, bonus: 0.03 },
  { id: 'eps1000', metric: 'epsPeak', target: 1000, bonus: 0.05 },
  { id: 'essence1e4', metric: 'totalEssence', target: 1e4, bonus: 0.02 },
  { id: 'essence1e6', metric: 'totalEssence', target: 1e6, bonus: 0.03 },
  { id: 'golden1', metric: 'golden', target: 1, bonus: 0.01 },
  { id: 'golden10', metric: 'golden', target: 10, bonus: 0.03 },
  { id: 'golden50', metric: 'golden', target: 50, bonus: 0.05 },
  { id: 'rare', metric: 'rare', target: 1, bonus: 0.03 },
  { id: 'veryRare', metric: 'veryRare', target: 1, bonus: 0.05 },
  { id: 'crowd5', metric: 'stablePeak', target: 5, bonus: 0.02 },
  { id: 'crowd10', metric: 'stablePeak', target: 10, bonus: 0.03 },
  { id: 'printer', metric: 'prints', target: 1, bonus: 0.01 },
  { id: 'tinkerer', metric: 'calibrations', target: 1, bonus: 0.01 },
  { id: 'regime', metric: 'regimesSaved', target: 1, bonus: 0.01 },
  { id: 'extinction', metric: 'extinctions', target: 1, bonus: 0.05 },
  { id: 'heritage', metric: 'genomeNodes', target: 1, bonus: 0.02 },
  { id: 'variant', metric: 'variants', target: 1, bonus: 0.03 },
  { id: 'symbiosis', metric: 'symbiosis', target: 1, bonus: 0.03 },
  { id: 'returned', metric: 'returns', target: 1, bonus: 0.01 },
  { id: 'hour', metric: 'playTime', target: 3600, bonus: 0.02 },
];

/**
 * "Limpiar placa" wipes every creature: it fires only after the button is held this long (QA4 F-10: a
 * child mashing near the seed bar wiped the dish with two quick taps). [QA4; design]
 */
export const CLEAN_HOLD_MS = 1200;
/** The dish's "Centrar" button shows above this zoom (QA4 F-09: a child's taps left the dish zoomed in). [QA4] */
export const RECENTER_MIN_ZOOM = 1.05;
/**
 * A seed keeps clear of where a swimmer will be, not only where it is: its path over this many
 * simulation steps counts as matter in the way (QA4: a child's seeds stamped in front of the starter
 * swimmer fused with it; at 0.6 cells/step and 45 steps/s that is ~1.3 s, ~36 cells ahead). [QA4;
 * measured on the CPU dish, tests/unit/realDish.ts]
 */
export const SEED_PATH_LOOKAHEAD_STEPS = 60;
/**
 * After a card closes, the dock ignores taps this long: the second tap of an impatient double tap on
 * "¡Entendido!" landed on the Tree button under it and opened the Tree (QA4 replay, F-05). [QA4]
 */
export const CARD_TAP_GUARD_MS = 500;
