/**
 * Balance numbers of the session + research-tree loop (docs/CICLO.md). Same rules as balance.ts:
 * one commented constant per value, origin tags [ciclo §N] = docs/CICLO.md section, [owner] = the
 * owner's request, [plan] = the published route plan ("Rutas de mejora de Bioluma"), [bot] = tuned
 * with scripts/session-bot.ts, [measured] = CPU reference runs (scripts/world-check.ts), [design].
 *
 * Phase 1 keeps these in their own file so the new loop can be built and tuned without touching
 * balance.ts while other engineers edit it; Phase 2 re-exports them from balance.ts.
 *
 * Price rule (owner: "prices must be extremely clear", one rule, nothing hidden):
 *   price(level) = friendly( TREE_RING_START[ring] · factor^level )
 * factor ×2, ×1,5 for nodes with ≥ TREE_LONG_LEVELS levels, ×3 for "Placa más grande" and
 * "Incubadora". friendly(): whole numbers below 100, two significant digits above.
 */

// ───────────────────────────── Session clock ───────────────────────

/** Length of a lab session without upgrades, seconds. [owner, 2nd play-test: "short, exciting": S1 = 2:00] */
export const SESSION_BASE_SECONDS = 120;
/** The amber warning starts this many seconds before the end. [owner: "amber in the last 30 s"] */
export const SESSION_WARN_SECONDS = 30;
/** "¡Último minuto!" banner, seconds before the end. [owner] */
export const SESSION_LAST_MINUTE = 60;
/** Every second of the last N seconds ticks (sound hook, bouncing digits). [design] */
export const SESSION_COUNTDOWN = 10;
/** Seconds of "¡Tiempo!" stamp on the frozen dish before the summary slides up. [design] */
export const SESSION_TIMESUP_HOLD = 1.6;
/** Seconds added to the clock by every Encargo completed during a session (before "Encargos con prisa"). [plan] */
export const SESSION_TIME_PER_ENCARGO = 5;
/** Seconds added to the clock by every species registered for the first time ever during a session. [plan: base rule] */
export const SESSION_TIME_PER_SPECIES = 5;
/**
 * Session 1 pity: if no creature is stable after this many seconds of clock, the next seed is
 * guaranteed (a pure template). The very first seed of a new game is guaranteed anyway. [owner: "the
 * first session guarantees a creature"]
 */
export const SESSION_PITY_AFTER = 45;
/** Free seeds at the start of every session (on top of "Esporas de regalo"). [plan: "20 💧 y 1 siembra gratis"] */
export const SESSION_BASE_FREE_SEEDS = 1;
/**
 * Sure seeds at the start of every session: the first drop always takes, so no session opens with a
 * dead minute (owner: "emocionante"; bot: without it session 2 often earned less than session 1,
 * which had the tutorial's sure seed). [owner; bot]
 */
export const SESSION_SURE_SEEDS = 1;
/**
 * Session 1: the first seeds always live (CLARIDAD F-03: at 24 % three taps in four fail, too many in
 * a row for a child; bot: session 1 earned a third of session 2, a ×3 jump that made the first nights
 * grow faster than ×2 a session). [owner; bot]
 */
export const FIRST_SESSION_SURE_SEEDS = 3;
/** Esencia at the start of every session (the dish is new, the wallet too). [plan] */
export const SESSION_START_ESSENCE = 20;
/** "Sprint final" window: the last N seconds of a session. [plan] */
export const SPRINT_SECONDS = 30;
/** Summary history kept in the save (last N sessions, for "unas N sesiones" estimates and a graph). [design] */
export const SESSION_HISTORY = 30;
/** Sessions averaged for "te faltan X Datos — unas N sesiones". [owner] */
export const SESSION_AFFORD_WINDOW = 3;

// ───────────────────────────── Seeds and room (sessions) ───────────

/**
 * Owner, 2nd play-test: "no castigar por crecer". In a session a seed has ONE price: this base,
 * × Gotas baratas, × a gentle step per seed already bought this session. Living creatures never
 * raise it (no crowding, no saturation): more creatures only mean more Esencia. [owner]
 */
export const SESSION_SEED_PRICE = 4;
/** Each seed bought this session makes the next one ×this (free seeds do not count). [owner: "e.g. ×1.05"] */
export const SEED_PRICE_STEP = 1.05;
/** …never more than ×this over the base. [design] */
export const SEED_PRICE_STEP_MAX = 3;
/**
 * The physical limit is room: creatures (alive, forming, or seeds not yet seen) the dish holds, by
 * dish size index (core/dish DISH_DIAMETERS Ø96 … Ø224). A full dish refuses a tap for free
 * ("Placa llena"). Measured on the CPU dish: Ø96 holds ~5 spaced Orbium, Ø224 ~15 that still swim. [owner; measured]
 */
export const DISH_CAPACITY = [5, 7, 9, 12, 15];
/** Guardería: extra seeds that may be forming at once, on top of balance SEED_NURSERY_MAX. [owner: pure gain] */
export const NURSERY_TREE_BONUS = 2;
/** Sin apretujones: extra room per level ("caben más juntas"). [owner: pure gain] */
export const ROOM_PER_LEVEL = 1;

// ───────────────────────────── Abono (in-session boost) ────────────

/**
 * Abono: an in-session boost bought with Esencia (owner, 2nd play-test: "más dinero y más rápido";
 * coordinator: "a cheap in-session boost"). Each one multiplies production ×BOOST_MULT for the rest
 * of the session and costs BOOST_SECONDS of your current Esencia/s, ×BOOST_GROWTH per Abono already
 * bought this session. Spent Esencia never lowers the Datos (they count Esencia EARNED), so it is a
 * pure gain; scale-free, so it is worth the same in session 1 and session 20. [design; bot]
 */
export const BOOST_MULT = 1.25;
export const BOOST_SECONDS = 20;
export const BOOST_GROWTH = 2;
/** Cheapest an Abono can be (nothing produces yet). [design] */
export const BOOST_MIN_COST = 15;
/**
 * Abono is on sale once the clock has run this long: bought in the first seconds, while nothing
 * produces yet, it would cost only the floor. [bot: without it the planner stacked six Abonos at the
 * floor price and one session paid ×8; priced from the record Esencia/s instead, a great session made
 * the next one's Abonos dearer and the next session poorer]
 */
export const BOOST_FROM_SECONDS = 30;

// ───────────────────────────── Spark (sessions) ────────────────────

/**
 * Seconds between two Sparks in a session (× Destello frecuente). [owner: "exciting"; bot: at 50–110 s
 * a 6-minute session with Destello frecuente III caught ~10 Sparks, more than half its Esencia, and
 * one Spark more or less made a session poorer than the one before. A narrow window keeps the
 * count of a session steady: the Spark is a rhythm, not a lottery]
 */
export const SESSION_GOLDEN_INTERVAL: [number, number] = [80, 100];
/** First Spark of a session, seconds after the clock starts (Primer destello: GOLDEN_FIRST_FAST). [design] */
export const SESSION_GOLDEN_FIRST_DELAY: [number, number] = [25, 50];
/**
 * A Spark caught gives N seconds of your current Esencia/s ("El Destello te regala 30 s de tu
 * Esencia"), × Regalos mejores. Proportional, never a random ×7: a session with one Spark less is
 * not a worse session. [coordinator: HARD rule]
 */
export const SPARK_GIFT_SECONDS = 30;
/** …at least this much Esencia (nothing produces yet). [design] */
export const SPARK_GIFT_MIN = 20;
/** Guaranteed seeds every Spark leaves (Mutágeno potente: MUTAGEN_TREE_SEEDS). [design] */
export const SPARK_SURE_SEEDS = 1;
/**
 * The first session with Sparks. Session 1 teaches seeds, creatures and Esencia; a Spark on top of
 * them was one card too many (CLARIDAD §3.3, F-08). [owner: "intuitive for all ages"]
 */
export const SPARK_FROM_SESSION = 2;

// ───────────────────────────── Objectives (sessions) ───────────────

/**
 * The balance.ts OBJECTIVES chain keeps teaching in the sessions cycle, with these steps re-aimed
 * at the tree (Calibrador → Mundo 2, Sembrador → Más tiempo) and one session's Esencia instead of
 * 100 000 Esencia of one Era. Each finished step is an Encargo for the session (+5 s, +2 Datos). [owner;
 * ciclo §3]
 */
export const SESSION_OBJECTIVES: Readonly<Record<string, { metric?: string; target?: number }>> = {
  calib: { metric: 'upgrade:worldCold' },
  seeder: { metric: 'upgrade:clock' },
  // Esencia of one session, like the Encargo the player sees (CLARIDAD J-40, CICLO §6).
  era100k: { metric: 'sessionEssence', target: 2000 },
};
/**
 * In a session an objective pays this many seconds of current Esencia/s (at least the minimum),
 * not the classic fixed amounts (a fixed 3 000 would be ten sessions of Esencia at the start and
 * nothing later). Proportional, like the Spark gift. [design; coordinator: "30 s de tu Esencia";
 * bot: at 20 s the objectives finished in the Tree poured a quarter of a session into the next
 * wallet, and the session after it looked poorer]
 */
export const SESSION_OBJECTIVE_SECONDS = 10;
/**
 * Achievements whose classic goal is gone (Calibrador, regímenes, Genoma) aim at worlds and the
 * tree in the sessions cycle (CLARIDAD J-22, J-23, J-48). `worldsVisited` = worlds a session was
 * played in; `fullWorld` = worlds whose every species is in the Bestiary. [ciclo §15]
 */
export const SESSION_ACHIEVEMENTS: Readonly<Record<string, { metric: string; target: number }>> = {
  tinkerer: { metric: 'worldsVisited', target: 3 },
  regime: { metric: 'fullWorld', target: 1 },
  heritage: { metric: 'genomeNodes', target: 10 },
};
export const SESSION_OBJECTIVE_MIN = 10;

// ───────────────────────────── Worlds ──────────────────────────────

/**
 * Every world after the first: all Esencia ×(1 + this·(n − 1)) while playing there (Mundo 2 ×1,1 …
 * Mundo 7 ×1,6, × the Gigantes' own ×2). Opening a world must be a pure gain (owner: "never punish
 * growth"); measured yields of the later worlds are within 10 % of each other, and the first session
 * there also waits for its new species to be registered. [owner; bot]
 */
export const WORLD_ESSENCE_STEP = 0.1;

// ───────────────────────────── Datos (permanent currency) ──────────

/**
 * Esencia → Datos: one Dato per this much Esencia earned in the session (spent or not). Linear on
 * purpose, so the summary shows it as one division a child can follow ("1.250 ÷ 250 = 5").
 * [plan: ÷100; bot: today's in-session economy earns ~3× the plan's Esencia per session, and with
 * ÷100 the tree is bought by session 13 and the sessions stall; ÷250 lands on the plan's pacing]
 */
export const DATOS_ESSENCE_DIV = 250;
/** Datos for every species registered for the FIRST TIME EVER during the session. [plan] */
export const DATOS_PER_NEW_SPECIES = 5;
/** Datos for every behaviour seen for the first time ever. [plan] */
export const DATOS_PER_NEW_BEHAVIOR = 3;
/** Datos for every Encargo completed during the session. [ciclo §3] */
export const DATOS_PER_ENCARGO = 2;
/** A session never pays less than this ("¡Aprendiste algo igual!"). [plan: "Mínimo 3 Datos por sesión"] */
export const DATOS_MIN = 3;
/** Each night after the first adds this to the Esencia part of the conversion. Shown in the summary equation. [plan: "+10 % de Datos por noche"] */
export const DATOS_NIGHT_BONUS = 0.1;
/** Records beaten in a session pay this many Datos each (most Esencia, most creatures…). [design] */
export const DATOS_PER_RECORD = 1;

// ───────────────────────────── Research tree prices ────────────────

/**
 * Price of the first level of a node by its ring. [plan: 3 · 10 · 100 · 2 000 · 20 000; owner, 2nd
 * play-test: "≥ 2 buys after every session, 3–5 early" — bot: ring 1 at 2 so the 12–25 Datos of
 * sessions 1–4 buy three to five levels (at 3, sessions 2–4 stalled at two buys and the same
 * Esencia); ring 5 at 6 000 so the last nights (20–40 K Datos per
 * session) still buy two or more levels, Vida eterna included]
 */
export const TREE_RING_START: Record<number, number> = { 1: 2, 2: 15, 3: 100, 4: 2000, 5: 6000 };
/** Level-to-level price factor. [plan] */
export const TREE_GROWTH = 2;
/** Price factor of nodes with many levels (≥ TREE_LONG_LEVELS). [plan] */
export const TREE_GROWTH_LONG = 1.5;
/** Nodes with at least this many levels use TREE_GROWTH_LONG. [plan] */
export const TREE_LONG_LEVELS = 5;
/** Price factor of "Placa más grande" and "Incubadora". [plan] */
export const TREE_GROWTH_STEEP = 3;
/** The night a ring opens (rings beyond the current night show as "?" with a moon). [plan] */
export const TREE_RING_NIGHT: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4 };

// ───────────────────────────── Nights (story eras) ─────────────────

/**
 * Price of the next night: NIGHT_START · NIGHT_GROWTH^(night − 1). FREE (0): the night is paced by
 * sessions and species only, so a child who spends every Dato at once still moves the story on. [plan]
 */
export const NIGHT_START = 0;
export const NIGHT_GROWTH = 1;
/** Highest night the centre node can reach (story Act III ends on night 7). [plan] */
export const NIGHT_MAX = 9;
/**
 * Never stuck: a player who finds few species still gets the next night after this many more
 * sessions ("8 sesiones y 4 especies — o 12 sesiones"). [owner: anti-frustration; bot: kid policy]
 */
export const NIGHT_GATE_FALLBACK = 4;
/**
 * Gates of the next night, by current night (index = night − 1): sessions finished and species in
 * the Bestiary. Datos alone cannot rush the story. [plan: night 2 at S5, 3 at S9, 4 at S14; owner,
 * 2nd play-test: "relatively short" — with 2:00–5:00 sessions the story's last question (night 7
 * ready) lands at session 24 ≈ 2 h; bot]
 */
export const NIGHT_GATES: { sessions: number; species: number }[] = [
  { sessions: 3, species: 2 },
  { sessions: 6, species: 4 },
  { sessions: 10, species: 7 },
  { sessions: 14, species: 10 },
  { sessions: 19, species: 12 },
  { sessions: 24, species: 14 },
  { sessions: 28, species: 16 },
  { sessions: 32, species: 17 },
];

// ───────────────────────────── ⏱ Reloj ─────────────────────────────

/** Más tiempo: seconds per level (3 levels: 2:00 → 2:45). [owner, 2nd play-test: the whole route ≈ 5:00] */
export const TIME_CLOCK = 15;
/** Reloj grande: seconds per level (2 levels: → 3:15). [owner] */
export const TIME_CLOCK2 = 15;
/** Reloj de arena: seconds per level (2 levels: → 4:15). [owner] */
export const TIME_CLOCK3 = 30;
/** Reloj eterno: seconds per level (3 levels: → 5:00). [owner] */
export const TIME_CLOCK4 = 15;
/** Nevera: best creatures (one per species) planted alive at the start of the next session, per level. [plan] */
export const FRIDGE_PER_LEVEL = 1;
/** Sprint final: production ×(1 + this·level) in the last SPRINT_SECONDS. [plan: ×1,5 → ×2 → ×2,5] */
export const SPRINT_PER_LEVEL = 0.5;
/** Encargos con prisa: extra seconds per Encargo, per level (+5 → +10 → +15 s). [plan] */
export const TIME_ENCARGO_BONUS = 5;

// ───────────────────────────── 💧 Gotero ───────────────────────────

/**
 * Gotero (3 levels) → template bias / noise of a random seed by tree level (index = level). Retuned
 * so the MEASURED survival lands on the plan's ≈25/35/45/60 % (scripts/world-check.ts --seeds, Clásico
 * world; the real numbers are SEED_SUCCESS below). [plan; measured]
 */
export const DROPPER_TREE_BIAS = [0.815, 0.83, 0.85, 0.87];
export const DROPPER_TREE_NOISE = [0.35, 0.33, 0.3, 0.25];
/** Estabilizador (5 levels): bias added and noise removed per level. [plan: "+6 % per level"; measured] */
export const STABILIZER_TREE_BIAS = 0.01;
export const STABILIZER_TREE_NOISE = 0.012;
/** Gotero maestro: every seed is the pure template with this little noise (correction 1: never zero). [plan: 100 %] */
export const DROPPER_MASTER_NOISE = 0.08;
/**
 * Measured share of random seeds that become a creature, by Gotero level (rows) and Estabilizador
 * level (columns), Clásico world. The UI prints these, nothing else. 24 cells × 100 seeds plus 13
 * bias/noise sweeps (~3 000 CPU seeds, scripts/world-check.ts --seeds), smoothed with one logistic
 * fit on bias and noise so that every level reads higher than the one before (single cells are
 * ±5 %). [measured]
 */
export const SEED_SUCCESS: number[][] = [
  [0.24, 0.29, 0.35, 0.41, 0.48, 0.54],
  [0.32, 0.38, 0.44, 0.51, 0.57, 0.63],
  [0.45, 0.51, 0.58, 0.64, 0.7, 0.75],
  [0.59, 0.65, 0.71, 0.76, 0.8, 0.84],
];
/** Esencia de bolsillo: Esencia added at the start by level (index = level). [plan: +30 → +90 → +270 → +800] */
export const START_ESSENCE_BY_LEVEL = [0, 30, 90, 270, 800];
/** Esporas de regalo: free seeds per level. [plan: +2 → +4 → +6] */
export const FREE_SEEDS_PER_LEVEL = 2;
/** Gota grande: radius ×1,5 = area and price ×2,25 (balance SEED_BIG_RADIUS). [plan] */
export const BIG_SEED_AREA = 2.25;
/** Sembrador automático: interval at level 1 (s) and ×this per extra level (6 levels: 20 s → 6,6 s). [plan] */
export const AUTOSEED_TREE_INTERVAL = 20;
export const AUTOSEED_TREE_DECAY = 0.8;
/** Gotas baratas: seed price ×this per level (−15 % → −28 % → −39 %). [plan] */
export const CHEAP_SEEDS_FACTOR = 0.85;

// ───────────────────────────── 🧫 Placa ────────────────────────────

/** Placa más grande: levels (Ø96 base → Ø128 → Ø160 → Ø192 = DISH_DIAMETERS[0..3]). [plan] */
export const DISH_TREE_LEVELS = 3;
/** Placa gigante: dish index it sets (DISH_DIAMETERS[4] = Ø224). [plan] */
export const DISH_XL_LEVEL = 4;
/** Más sitio: cheap creature slots per level (on top of balance DISH_FREE_SLOTS). [plan] */
export const SLOTS_PER_LEVEL = 1;
/** Incubadora: seeds mature (become paying creatures) this many times faster, by level. [plan: ×2 → ×3] */
export const MATURE_SPEED_BY_LEVEL = [1, 2, 3];
/** Ecosistema: +this production per distinct species alive on the dish, per level. [plan: +3 % → +6 %] */
export const ECOSYSTEM_PER_SPECIES = 0.03;

// ───────────────────────────── 🌱 Vida ─────────────────────────────

/** Cultivo: production ×this per level (5 levels: ×1,15 → ×2,01). [plan] */
export const CULTURE_TREE_MULT = 1.15;
/** Nutriente: production +this per level (measured complexity). [plan: +8 % → +24 %] */
export const NUTRIENT_TREE_BONUS = 0.08;
/** Superalimento: production ×this per level (×1,25 → ×1,6 → ×1,95). [plan] */
export const CULTURE2_MULT = 1.25;
/** Nadadoras / Tranquilas / Familias: +this production per level for their behaviour family. [plan: +15 % → +45 %] */
export const AFFINITY_TREE_BONUS = 0.15;
/** Simbiosis: two different species touching both produce ×this. [plan] */
export const SYMBIOSIS_TREE_MULT = 1.5;
/** Vida abundante: all production ×this. [plan] */
export const ABUNDANCE_MULT = 1.5;
/** Vida eterna: production ×this per level, no end (the Datos sink of the last nights). [plan] */
export const ETERNAL_LIFE_MULT = 1.1;
/** Vida eterna: levels offered (practically endless; the UI prints ∞). [plan] */
export const ETERNAL_LIFE_MAX = 99;
/**
 * Vida eterna: price factor per level = its effect (each level costs 10 % more and gives 10 % more),
 * so the last nights keep growing a steady ~15–20 % per session instead of stalling. [plan: ×1,5; bot:
 * with ×1,5 the sessions after the tree plateau and the HARD "never less than before" rule fails]
 */
export const ETERNAL_LIFE_GROWTH = 1.1;
/**
 * Vida eterna's first price (its own, not ring 5's): with price and effect both ×1,1 per level, the
 * Datos of a session over this price fixes how many levels a session buys, i.e. the growth of the
 * last nights. At 10 000 the first levels come in night 5 and the last nights buy 3–5 a session
 * (×1,3–1,6); at 25 000 nights 5–6 stalled for want of anything to buy; at ring 5's 6 000 a session
 * bought 12 (×3 per session, numbers running away). [bot]
 */
export const ETERNAL_LIFE_START = 10000;

// ───────────────────────────── 🔬 Descubrir ───────────────────────

/** Cuaderno de campo: extra Datos per first-ever species, per level (5 → 7 → 9 → 11). [plan] */
export const NOTEBOOK_DATOS = 2;
/**
 * Catalogación (Coleccionista): +this production per level, for the whole dish (the Bestiary pays).
 * [plan: +10 % → +50 %; bot: as a per-species bonus the creatures of a world's new species, not
 * registered yet, paid without it, and the first session in a new world earned less]
 */
export const CATALOG_TREE_BONUS = 0.1;
/** Archivo: seconds between free copies, by level (index = level). [plan: 45 s → 20 s] */
export const ARCHIVE_TREE_INTERVAL = [Infinity, 45, 20];
/** Copiadora: a copy costs this many normal seeds of Esencia (the template is pure: it always takes). [design] */
export const PRINT_SEEDS_PRICE = 4;
/** Premio al descubridor: extra Datos per first-ever behaviour, per level (3 → 5 → 7). [plan] */
export const DISCO_BONUS_DATOS = 2;
/** Gran enciclopedia: all Datos of a session ×(1 + this·level) (+25 % → +75 %). [plan] */
export const ENCYCLOPEDIA_BONUS = 0.25;

// ───────────────────────────── ✨ Destello ─────────────────────────

/** Destello frecuente: spawn interval ×this per level (80–100 s → 49–61 s). [plan: ×0,8; bot] */
export const GOLDEN_INTERVAL_FACTOR = 0.85;
/** Destello lento: extra life (s) per level (+4 → +8 s). [plan] */
export const GOLDEN_LIFE_BONUS = 4;
/** Destello del tiempo: seconds added to the clock per Spark caught, per level (+5 → +10 s). [plan] */
export const TIME_PER_GOLDEN = 5;
/** Primer destello: the first Spark of every session arrives in this window (s). [plan: 10–20 s] */
export const GOLDEN_FIRST_FAST: [number, number] = [8, 15];
/** Regalos mejores: gift ×(1 + this·level) (30 s → 36 → 42 → 48 s of Esencia). [plan: +40 %; bot: see SESSION_GOLDEN_INTERVAL] */
export const GOLDEN_GIFT_BONUS = 0.2;
/** Destello sabio: Datos per Spark caught, per level (+1 → +2). [plan] */
export const GOLDEN_DATOS = 1;
/** Mutágeno potente: guaranteed seeds every Spark leaves (SPARK_SURE_SEEDS before). [plan, sessions] */
export const MUTAGEN_TREE_SEEDS = 3;

/** Offline: "experimentos nocturnos" are not in this version (sessions only run while playing). [ciclo §7] */
export const OFFLINE_DATOS = 0;
