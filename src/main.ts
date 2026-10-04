/**
 * Bioluma — integration entry point.
 * Wires simulation (GPU) → detector (CPU) → game (economy) → UI + audio.
 */
import { bus } from './core/bus';
import { Camera } from './core/camera';
import type { DetectorReport, GameView, LeniaParams, Quality, Text } from './core/types';
import { matterLUT } from './core/palette';
import { createSimulation } from './sim/webgl';
import { QUALITY_DISH } from './sim/perf';
import { Deflector } from './sim/deflect';
import { mustWaitForDetection } from './sim/detectGate';
import { DishAnimator, dishDiameterFor, dishForGrid, type DishShape } from './core/dish';
import { ART_RENDER_STYLE } from './ui/art/matter';
import { DEFAULT_ITEM } from './store/catalog';
import { createDetector, DISH_OVERGROWN_FILL } from './detect/detector';
import { createGame } from './game/game';
import { clearSave, loadSave, offlineSeconds, writeSave } from './game/save';
// Art tokens (--bl-*) before every module stylesheet (docs/ARTE.md §12).
import './ui/art/art.css';
import { createUI, shortRunRunning } from './ui/ui';
import { createIntro, introSeen, mountIntroEntry, type Intro } from './ui/intro';
import { createAudio } from './audio/audio';
import { detectPlatform, endingAchievementId, initPlatform, secretAchievementId, type Platform } from './platform/platform';
import { TEXT as GAME_TEXT } from './game/content';
import { REACHABLE_BEHAVIORS } from './game/worlds';
import { hexToRgb } from './ui/art/color';
import { PALETTE } from './ui/art/tokens';
import { createIntegrity } from './net/integrity';
import { createLeaderboardClient } from './net/leaderboard';
import { createPlayerIdentity } from './net/identity';
import { setupCosmetics } from './app/cosmetics';
import { createExtraJournal } from './app/journal';
import { LYSIS_TOAST_MS, lysisTargets } from './app/lysis';
import { RunawayWatch } from './sim/runaway';
import { SUPPORTER_JOURNAL } from './store/catalog';
import { setPortraitPalette } from './ui/portrait';
import { createEncargos, createStory, ENCARGOS_STORAGE_KEY, gameGrantOf, type EncargoReward, type EncargoView } from './story';
import { createEncargoUI, createStoryUI, type StoryArchive, type StorySound } from './ui/story';
import type { UI, UISound } from './ui/ui';
import { createMoments, linkStory, type StoryBridge } from './moments';
import {
  createMomentsUI,
  createPriceSheet,
  createSpeciesCard,
  speciesInputFromView,
  type HelpSheet,
  type MomentsUI,
  type SpeciesCardInput,
} from './ui/moments';
import { COLORMAPS, colormapLUT, createSecretJournal, createSecrets, secretDef } from './secrets';
import { bigSeedChip, createSeedMeter, seedPriceSheetExplain, type SeedMeter } from './ui/seed-price';
import { attachSecretInputs, createSecretsUI, createStrokeRecorder, mountBasementEntry, type BasementEntry } from './ui/secrets';
import { createSessionFlow, createWelcomeCard, datosExplain, type SessionFlow, type SessionFlowSound } from './ui/session';
import { computeDatos } from './game/session';
import { PREINCUBATE_STEPS } from './game/cycleBalance';
import { nodeText } from './game/tree';

/**
 * Ranking API origin. Set VITE_LEADERBOARD_URL at build time ('' = same origin);
 * deployments on Vercel (which host api/) enable it automatically.
 */
const LEADERBOARD_URL: string | undefined =
  import.meta.env.VITE_LEADERBOARD_URL ?? (location.hostname.endsWith('.vercel.app') ? '' : undefined);

/**
 * Store API origin (Cloudflare Pages Functions, docs/MONETIZACION.md). Same origin by default; it is only
 * called where real or test payments are possible (src/store/flags.ts), never with the store off.
 */
const STORE_API_URL: string = import.meta.env.VITE_STORE_API_URL ?? '';

/**
 * Base simulation rate (steps per second) at speed ×1. Orbium swims ~0.24
 * cells/step, so 30 steps/s keeps motion graceful and readable while halving
 * the GPU load on phones; the Incubadora doubles/quadruples it.
 */
const STEPS_PER_SEC = 30;
/** Detector cadence in simulation steps. */
const DETECT_EVERY = 10;
/** Most incubation steps a frame under the start card (RITMO §7: ≤ 40, so a phone keeps its frame rate). */
const PREINCUBATE_PER_FRAME = 40;
const AUTOSAVE_MS = 30_000;
/** The dish itself is saved less often (a GPU readback); also on pagehide / tab hidden. */
const DISH_SAVE_MS = 5 * 60_000;
/** Kernel changes (R, rings: a new World) recompile the step shader; let a burst of changes settle. */
const KERNEL_DEBOUNCE_MS = 350;
const IDLE_AFTER_MS = 60_000;
/** Frame interval while idle (30 fps). */
const IDLE_FRAME_MS = 1000 / 30;
/** At most one "why was my tap refused" hint in this many ms (a player tapping fast gets one, not ten). */
const SEED_BLOCKED_HINT_MS = 2500;

/**
 * Why the dish is frozen. The simulation and the economy stop while any source is active; the UI's
 * pause button only reflects 'user' (Momentos, cinematics and the session cards pause silently).
 */
export type PauseSource = 'user' | 'moment' | 'cinematic' | 'cards';

/** The seed price sheet as main.ts drives it (open from the pill, refresh while open). */
interface SeedPriceSheet {
  readonly isOpen: boolean;
  open(v: GameView): void;
  update(v: GameView): void;
  close(): void;
}

/** Identity of a portrait object (a re-capture is a new object): the species card redraws on change. */
const portraitIds = new WeakMap<object, number>();
let portraitSeq = 0;
/** What a species card shows, rounded: the card only rebuilds when this changes. */
function speciesCardKey(s: SpeciesCardInput, lang: string): string {
  let pid = 0;
  if (s.portrait) {
    pid = portraitIds.get(s.portrait) ?? 0;
    if (!pid) portraitIds.set(s.portrait, (pid = ++portraitSeq));
  }
  const r = (x: number | null, d: number) => (x === null ? '-' : x.toFixed(d));
  const boosters = s.boosters.map((b) => `${b.id}:${b.level}:${b.unlocked ? 1 : 0}${b.maxed ? 1 : 0}`).join(',');
  return [lang, s.name, s.catalogName, s.subtitle, s.hue, s.rarity, s.behavior, r(s.speciesMult, 2), r(s.behaviorMult, 2), r(s.form, 2), r(s.global, 2), r(s.eps, 1), boosters, pid].join('|');
}

function pickQuality(setting: 'auto' | Quality): Quality {
  if (setting !== 'auto') return setting;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  if (cores <= 4 || mem <= 2) return 'low';
  return 'medium';
}

function boot(): void {
  const root = document.getElementById('app')!;
  document.getElementById('boot')?.remove();

  // Anti-cheat signals must look at the save before the game rewrites it.
  const integrity = createIntegrity();
  integrity.checkSave();
  const saved = loadSave();
  if (saved.savedAt) integrity.noteSavedAt(saved.savedAt);
  integrity.start();
  const game = createGame({ bus, cycle: 'sessions' }, saved.game ?? undefined);
  /** Watches every component for the runaway growth that becomes a maze (early lysis). Declared before any
   * bus handler that resets it ('dishClear' can fire while booting). */
  const runaway = new RunawayWatch();
  const settings = game.view().settings;
  if (!saved.game) {
    // First run: follow the browser language.
    game.actions.setSetting('lang', navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en');
  }

  const quality = pickQuality(settings.quality);
  // The round walled dish (ADR-025, docs/DISH.md): a square grid allocated once per quality, the rim
  // set by the Placa route of the research tree (DISH_DIAMETERS, capped by quality).
  const dishQ = QUALITY_DISH[quality];
  const gridW = dishQ.grid;
  const gridH = dishQ.grid;
  /** The dish the tree has bought (TreeEffects.dishLevel → Ø96…224, capped by quality). */
  const boughtDish = (): DishShape => dishForGrid(gridW, gridH, dishDiameterFor(game.effects?.dishLevel ?? 0, dishQ.maxDiameter));
  /** Rim, camera fit and growth glow, animated when a bigger dish is bought (each session starts at that size). */
  const dishAnim = new DishAnimator(boughtDish());
  /** The screen pass runs per device pixel; cap the ratio to keep phones cool. */
  const maxDpr = quality === 'low' ? 1.5 : 2;
  const camera = new Camera(gridW, gridH);
  camera.setDish(dishAnim.rim, dishAnim.fit);
  const glCanvas = document.createElement('canvas');
  glCanvas.className = 'gl-dish';

  let sim: ReturnType<typeof createSimulation> | null = null;
  const pauseSources = new Set<PauseSource>();
  /** Declared before anything can call save() (the boot-time offline grant does). */
  let saveWarned = false;
  /** Any pause source active: no simulation steps, no detection, no income. */
  const isPaused = () => pauseSources.size > 0;
  function setPause(source: PauseSource, on: boolean): void {
    if (on === pauseSources.has(source)) return;
    if (on) pauseSources.add(source);
    else pauseSources.delete(source);
    game.isPaused = isPaused();
    if (source === 'user') ui.setPaused(on);
  }
  let lastInteraction = performance.now();
  let idle = false;

  const audio = createAudio(bus);
  // Cosmetics need the leaderboard's equipped-profile getter and vice versa: late-bound closure.
  let profileCosmetics: () => { badge?: string; frame?: string; nameColor?: string } | null = () => null;
  const leaderboard =
    LEADERBOARD_URL === undefined
      ? undefined
      : createLeaderboardClient({ game, integrity, bus, baseUrl: LEADERBOARD_URL, profileCosmetics: () => profileCosmetics() });
  const platformInfo = detectPlatform();
  /** Extra Bitácora entries that live outside the game save (supporter thanks). */
  const extraJournal = createExtraJournal();
  const viewWithExtras = () => extraJournal.merge(game.view());
  const cosmetics = setupCosmetics({
    platform: platformInfo,
    openExternal: (url) => platformRef?.openExternal(url),
    // One identity per page: the ranking's when it exists, else the same storage keys standalone.
    identity: leaderboard?.identity ?? createPlayerIdentity(),
    lang: () => game.view().settings.lang,
    reduceMotion: () => game.view().settings.reduceMotion,
    playerName: () => leaderboard?.getName() ?? null,
    previewMusic: () =>
      audio.musicAudible && audio.previewAmbience ? (preset) => audio.previewAmbience?.(preset) : undefined,
    sound: (k) => audio.playUI?.(k),
    root: () => root,
    apiBase: STORE_API_URL,
  });
  profileCosmetics = () => cosmetics.profileCosmetics();
  let platformRef: Platform | null = null;

  // ── Momentos (docs/MOMENTOS.md): the first time something important happens, the game stops and explains. ──
  let uiRef: UI | null = null;
  /** Late-bound: the story needs the moments and the moments need the story (one thing per event, §2). */
  let bridge: StoryBridge | null = null;
  /** Late-bound surfaces that own the screen for a moment (sheets, an Encargo celebration, a secret card). */
  let sheetOpen = (): boolean => false;
  let encargoShowing = (): boolean => false;
  let secretShowing = (): boolean => false;
  /** A session card (start, summary, welcome) or the research tree is on screen. */
  let flowBusy = (): boolean => false;
  let flowRef: SessionFlow | null = null;
  let welcomeOpen = (): boolean => false;
  // The opening intro (docs/STORY.md §11): once after the title screen on a new game, replayable from Settings.
  let intro: Intro | null = null;
  const introOpen = (): boolean => !!intro?.isOpen;
  function openIntro(): void {
    if (introOpen()) return;
    intro = createIntro(root, {
      lang: () => game.view().settings.lang,
      reduceMotion: () => game.view().settings.reduceMotion,
      onDone: () => {
        intro = null;
        story.setFlag('introSeen');
      },
      onSound: (k) => audio.playUI?.(k === 'done' ? 'confirm' : k === 'back' ? 'close' : 'tap'),
    });
  }
  const moments = createMoments({
    bus,
    getView: () => game.view(),
    // Splash/modal (UI), a session card or the tree, VELA talking, a price/guide sheet, a celebration.
    // A run shorter than MOMENT_MIN_RUN_SECONDS: the cards wait for its summary (RITMO §2 rule 7).
    isBlocked: () =>
      (uiRef?.blocked() ?? true) || introOpen() || shortRunRunning(game.session) || flowBusy() || (bridge?.storyShowing() ?? false) || sheetOpen() || encargoShowing() || secretShowing(),
    downgrade: (id) => bridge?.covered(id) ?? false,
    // Session 1 has cards only for the basics (seed, life, Essence, shapeless, clock); a new species or
    // way of moving is a brief label there, its full card comes in session 2 (docs/CLARIDAD.md §3.3).
    defer: (id) => {
      if (id !== 'species' && id !== 'secondSpecies' && !id.startsWith('behavior.')) return false;
      const v = game.view();
      return v.cycle === 'sessions' && (v.session?.first ?? (v.session?.n ?? 1) <= 1);
    },
  });

  // ── Story layer (docs/STORY.md §7): dialogue scenes, the story-driven tutorial, endings. ──
  /** Story scenes another surface is explaining right now (e.g. a "moment"): never two popups per event. */
  const storySuppressed = new Set<string>();
  const story = createStory({
    bus,
    getView: () => game.view(),
    // Never over a Momento (queued or open), a price / behaviour sheet, a secret's reveal card or a
    // session card ("¡Tiempo!", the summary, the start card); over the Tree it may (t_tree points at it).
    isBlocked: () => (uiRef?.blocked() ?? true) || moments.isBusy() || sheetOpen() || secretShowing() || encargoShowing() || (flowRef?.cardOpen ?? false) || welcomeOpen() || introOpen(),
    suppress: (id) => storySuppressed.has(id) || (bridge?.suppresses(id) ?? false),
    ui: (name) => (name === 'tree' ? (flowRef?.treeOpen ?? false) : false),
  });
  bridge = linkStory(moments, story);
  story.on('journal', ({ id, text }) => bus.emit('journalNew', { id, text }));
  extraJournal.addSource(() => story.journalViews());
  let storyArchive: StoryArchive | null = null;
  let introEntry: { dispose(): void } | null = null;
  let momentsHelp: HelpSheet | null = null;
  let basementEntry: BasementEntry | null = null;
  /** A story scene or ending is on screen (late-bound: the story UI mounts after the game UI). */
  let storyBusy = (): boolean => false;
  /** Skipping VELA's tutorial also means "fewer pauses": the Momentos switch to brief labels (no pause). */
  const storyBoot = story.serialize();
  let tutorialSkipped = storyBoot.tutorialSkipped;
  /** VELA's first scene is over (or skipped): before that, nothing else talks (a secret found at boot waits). */
  let introDone = storyBoot.done.includes('t_intro') || !storyBoot.enabled;
  story.on('change', () => {
    const st = story.serialize();
    if (st.tutorialSkipped && !tutorialSkipped && moments.mode === 'full') moments.setMode('brief');
    tutorialSkipped = st.tutorialSkipped;
    introDone = introDone || st.done.includes('t_intro') || !story.enabled;
  });

  // ── Encargos (docs/STORY.md §10): VELA's requests: what to grow, for what and why. ──
  /** Act I mirrors the game's OBJECTIVES one to one (same ids, same Essence): the game pays (and counts) those itself. */
  function grantEncargo(r: EncargoReward, enc: EncargoView): void {
    const g = gameGrantOf(enc.id, r, game.cycle);
    if (g) game.grantEncargo(g);
  }
  const encargos = createEncargos({ bus, getView: () => game.view(), story, grant: grantEncargo });
  /** The Encargos replace the game's objective line and its "objective complete" toast (one thing per event). */
  const objectiveDonePrefix = GAME_TEXT.objectiveDone(0);

  // ── Secrets (docs/SECRETS.md, spoilers): easter eggs, +1 % Essence each (max +10 %). ──
  const secrets = createSecrets({ bus, getView: () => game.view(), center: { x: gridW / 2, y: gridH / 2 } });
  const secretJournal = createSecretJournal();
  extraJournal.addSource(() => secretJournal.views());
  // Older finds (before this wiring) get their Bitácora entry too.
  for (const sv of secrets.list()) if (sv.found) secretJournal.add(`secret.${sv.id}`, secretDef(sv.id).journal);
  secrets.on('grantJournal', ({ id, text }) => secretJournal.add(id, text));
  const SECRET_BONUS_NAME: Text = { es: 'Secretos', en: 'Secrets' };
  const applySecretBonus = () => game.setBonus('secrets', SECRET_BONUS_NAME, secrets.bonusMultiplier());
  applySecretBonus();
  secrets.on('progress', applySecretBonus);

  // Surfaces mounted after the game UI (they need its elements); the UI deps reach them late-bound.
  let momentsUIRef: MomentsUI | null = null;
  let priceSheetRef: SeedPriceSheet | null = null;
  let seedMeterRef: SeedMeter | null = null;
  let strokesRef: ReturnType<typeof createStrokeRecorder> | null = null;
  let secretsUIRef: ReturnType<typeof createSecretsUI> | null = null;

  /** The species card (portrait in its colour, shape, behaviour, yield equation, how to boost it) in the species sheet. */
  function mountSpeciesCard(box: HTMLElement, id: string): { update(v: GameView): void; dispose(): void } | null {
    const input = speciesInputFromView(game.view(), id);
    if (!input) return null;
    const card = createSpeciesCard(box, input, {
      lang: () => game.view().settings.lang,
      reduceMotion: () => game.view().settings.reduceMotion,
      onShowUpgrade: (up) => ui.reveal(`upgrade.${up}`),
      onBehavior: (b) => momentsUIRef?.openBehaviorGuide(b),
    });
    // The card rebuilds on update: only when something it shows changed, at most twice a second.
    let key = speciesCardKey(input, game.view().settings.lang);
    let lastAt = performance.now();
    return {
      update(v) {
        const now = performance.now();
        if (now - lastAt < 500) return;
        const next = speciesInputFromView(v, id);
        if (!next) return;
        const k = speciesCardKey(next, v.settings.lang);
        if (k === key) return;
        key = k;
        lastAt = now;
        card.update(next);
      },
      dispose: () => card.dispose(),
    };
  }

  const ui = createUI(root, {
    actions: {
      ...game.actions,
      markJournalRead(id?: string) {
        game.actions.markJournalRead(id);
        if (id === undefined) {
          extraJournal.markRead();
          story.markJournalRead();
          secretJournal.markRead();
        }
      },
      renameSpecies(id: string, name: string) {
        game.actions.renameSpecies(id, name);
        secrets.onSpeciesRenamed(name);
      },
    },
    camera,
    glCanvas,
    leaderboard,
    onRestartTutorial: () => {
      story.restartTutorial();
      // "Explain it all again": every Momento comes back, with its pause.
      moments.forget();
      moments.setMode('full');
    },
    onTabOpen: (tab) => {
      game.actions.noteTabOpened?.(tab);
      story.signal(`tab:${tab}`);
      encargos.signal(`tab:${tab}`);
    },
    onOpenTree: () => flowRef?.openTree(),
    // While the research tree covers the game, VELA's task hint sits under the tree's header.
    topInsetOverride: () => {
      if (!flowRef?.treeOpen) return null;
      const r = document.querySelector('.rt-top')?.getBoundingClientRect();
      return r && r.height > 0 ? r.bottom + 8 : null;
    },
    onEndSession: () => {
      setPause('user', false);
      secrets.setPaused(false);
      game.actions.endSessionNow?.();
    },
    // "¿Terminar ya? Te llevas N Datos.": what ending now pays (no minimum when ended early).
    endSessionDatos: () => {
      const se = game.session;
      const fx = game.effects;
      return se && fx ? computeDatos({ ...se, endedEarly: true }, fx, 0).total : 0;
    },
    // One message at a time: a story scene, a Momento, an Encargo bubble or a secret card.
    // Also a Momento about to open (the dish is easing to a stop) and the session cards: a toast or a
    // tip would land on them (one message per event, CLARIDAD §3).
    isNarrating: () => introOpen() || storyBusy() || (momentsUIRef?.busy ?? false) || moments.isBusy() || encargoShowing() || secretShowing() || flowBusy(),
    settingsSections: (el) => {
      storyArchive?.dispose();
      storyArchive = storyUI.mountArchive(el);
      introEntry?.dispose();
      introEntry = mountIntroEntry(el, { lang: () => game.view().settings.lang, onOpen: openIntro });
      // "¿Qué pasó?": re-watch any Momento, explain mode (full / brief / off) and creature labels.
      momentsHelp?.dispose();
      momentsHelp = momentsUIRef?.mountHelp(el) ?? null;
      basementEntry?.dispose();
      basementEntry = secretsUIRef
        ? mountBasementEntry(el, secrets, { lang: () => game.view().settings.lang, createBasement: () => secretsUIRef!.createBasement() })
        : null;
    },
    // A new player sees the intro once, right after the title screen (before VELA's t_intro).
    onSplashDone: () => {
      if (!introSeen() && game.view().stats.seeds === 0) openIntro();
    },
    cameraBusy: () => momentsUIRef?.busy ?? false,
    onBehaviorInfo: (b) => momentsUIRef?.openBehaviorGuide(b ?? null),
    onSeedPriceInfo: () => priceSheetRef?.open(game.view()),
    onChargeStart: () => {
      const v = game.view();
      const chip = bigSeedChip(v, v.settings.lang);
      if (chip) seedMeterRef?.flash(chip);
    },
    suppressOfflineCard: () => moments.mode === 'full' && (moments.wouldShow('offline') || moments.isActive('offline')),
    suppressToast: (text: Text) => text.es.startsWith(objectiveDonePrefix.es) || text.en.startsWith(objectiveDonePrefix.en),
    objectiveOverride: () => true,
    speciesExtras: (box, id) => mountSpeciesCard(box, id),
    // A card or a label tells a new species; the toast only when explanations are off (§3.3).
    speciesTold: () => moments.mode !== 'off',
    openWardrobe: () => cosmetics.openWardrobe(),
    openStore: cosmetics.openStore ? () => cosmetics.openStore?.() : undefined,
    onDishResize(cssW, cssH, dpr) {
      camera.setView(cssW, cssH);
      const r = Math.min(dpr, maxDpr);
      sim?.resizeCanvas(Math.round(cssW * r), Math.round(cssH * r));
    },
    onDishTap(x, y, opts) {
      const spec = game.actions.seedAt(x, y, opts);
      if (spec) sim?.seed(spec);
    },
    onErase(x, y) {
      sim?.erase(x, y, sim.params.R * 1.2);
      strokesRef?.point(x, y);
    },
    onBrush(x, y) {
      for (const spec of game.actions.brushAt(x, y)) sim?.seed(spec);
      strokesRef?.point(x, y);
    },
    onPrint(speciesId, x, y) {
      const spec = game.actions.printAt(speciesId, x, y);
      if (spec) {
        sim?.seed(spec);
        story.notePrint();
        encargos.notePrint();
      }
    },
    onUISound(kind) {
      audio.playUI?.(kind);
    },
    onPauseToggle() {
      setPause('user', !pauseSources.has('user'));
      secrets.setPaused(pauseSources.has('user'));
    },
    exportSave: () => game.exportString(),
    importSave(s) {
      integrity.noteImport(s);
      const ok = game.importString(s);
      if (ok) {
        applySecretBonus();
        save();
      }
      return ok;
    },
    resetSave() {
      clearSave();
      game.reset();
      story.reset();
      moments.reset();
      encargos.reset();
      secrets.reset();
      secretJournal.reset();
      applySecretBonus();
      save();
    },
    onUserGesture() {
      lastInteraction = performance.now();
      audio.unlock();
    },
  });

  uiRef = ui;
  const MOMENT_SOUND: Record<'open' | 'blip' | 'close' | 'brief', UISound | null> = { open: 'open', close: 'close', brief: 'tap', blip: null };
  const STORY_SOUND: Record<StorySound, UISound | null> = {
    open: 'open',
    blip: null,
    choice: 'open',
    chosen: 'confirm',
    task: 'tap',
    done: 'confirm',
    ending: 'open',
  };
  const storyUI = createStoryUI(root, story, {
    lang: () => game.view().settings.lang,
    reduceMotion: () => game.view().settings.reduceMotion,
    getTargetRect: (id) => ui.targetRect(id),
    gridToClient: (x, y) => ui.gridToClient(x, y),
    revealTarget: (id) => ui.reveal(id),
    // A tree node's sheet is open: its "Comprar" is the next step and the pill would sit on its head
    // (only the Tree's own tasks run while the Tree is up: «Compra una mejora.» has no target).
    hideTask: () => flowRef?.treeSheetOpen ?? false,
    onSound: (kind) => {
      // Mute the blips while the Momentos bridge consumes a scene it already told.
      if (bridge?.consuming) return;
      const k = STORY_SOUND[kind];
      if (k) audio.playUI?.(k);
    },
  });
  let storyLang = game.view().settings.lang;
  storyBusy = () => storyUI.busy;

  // Momentos UI (z 46: above the story layer 45, below the splash 60).
  const momentsUI = createMomentsUI(root, moments, {
    camera,
    getDishRect: () => glCanvas.getBoundingClientRect(),
    lang: () => game.view().settings.lang,
    reduceMotion: () => game.view().settings.reduceMotion,
    onPause: (on) => setPause('moment', on),
    getTargetRect: (id) => ui.targetRect(id),
    creaturePos: (id) => ui.creaturePos(id),
    speciesPortrait: (sid) => game.view().species.find((sp) => sp.id === sid)?.portrait ?? null,
    speciesInfo: (sid) => speciesInputFromView(game.view(), sid),
    onShowUpgrade: (id) => ui.reveal(`upgrade.${id}`),
    upgrades: () => game.view().upgrades,
    seenBehaviors: () => game.view().behaviorsSeen,
    // The behaviour guide's example species by the name the player knows it (once registered).
    knownName: (latin) => game.view().species.find((sp) => sp.catalogName === latin)?.name ?? null,
    // Sessions: no World grows pulsing, dividing or colony creatures (measured): the guide never lists them.
    reachableBehaviors: () => (game.view().cycle === 'sessions' ? REACHABLE_BEHAVIORS : null),
    onAction: (a) => {
      if (a === 'sterilize') game.actions.sterilizeDish?.();
    },
    onSound: (k) => {
      const u = MOMENT_SOUND[k];
      if (u) audio.playUI?.(u);
    },
  });
  momentsUIRef = momentsUI;
  let momentsLang = game.view().settings.lang;

  // Seed price: slot dots + "why it changed" chip next to the price, and the sheet behind ONE tap on the
  // pill. Both read the parts of view.seedPrice that exist (a ×1 or missing factor is not shown).
  const seedMeter = createSeedMeter(() => game.view().settings.lang);
  ui.seedMeterSlot.appendChild(seedMeter.el);
  seedMeterRef = seedMeter;
  const priceCore = createPriceSheet(root, { reduceMotion: () => game.view().settings.reduceMotion });
  const explainSeed = (v: GameView) =>
    seedPriceSheetExplain(v, v.settings.lang, {
      onSeeDish: () => {
        priceCore.close();
        ui.reveal('upgrade.dish');
      },
    });
  const priceSheet: SeedPriceSheet = {
    get isOpen() {
      return priceCore.isOpen;
    },
    open(v) {
      const x = explainSeed(v);
      if (x) priceCore.open(x);
    },
    update(v) {
      if (!priceCore.isOpen) return;
      const x = explainSeed(v);
      if (x) priceCore.update(x);
    },
    close: () => priceCore.close(),
  };
  priceSheetRef = priceSheet;
  sheetOpen = () => priceSheet.isOpen || !!document.querySelector('.mo-bh-layer:not([hidden])');

  // Encargos: the badge lives in the objective bar; offers and celebrations hang from it.
  const encUI = createEncargoUI(root, encargos, {
    lang: () => game.view().settings.lang,
    reduceMotion: () => game.view().settings.reduceMotion,
    // Offers tuck away while VELA talks (lines, choice, ending, or her task hint near the top of the dish),
    // a Momento is coming/open, a sheet / modal / the Bestiary covers the screen, a session card or a secret card is up.
    busy: () => storyBusy() || moments.isBusy() || momentsUI.busy || sheetOpen() || ui.blocked() || ui.drawerOpen || flowBusy() || secretShowing(),
    getTargetRect: (id) => ui.targetRect(id),
    onSound: (k) => audio.playUI?.(k === 'done' ? 'confirm' : 'open'),
  });
  encUI.mountBadge(ui.objectiveSlot);
  encargoShowing = () => encUI.busy;
  let encLang = game.view().settings.lang;

  // ── Lab sessions (docs/CICLO.md): the clock in the HUD, the Datos preview in the dock, the start card,
  // "¡Tiempo!", the summary and the research tree. The dish waits while any of their cards is open. ──
  const FLOW_SOUND: Record<SessionFlowSound, UISound | null> = {
    tick: 'tap',
    warn: 'hold',
    lastMinute: 'hold',
    timesUp: 'confirm',
    extend: 'buy',
    open: 'open',
    tally: 'tap',
    total: 'confirm',
    buy: 'buy',
    deny: 'deny',
    night: 'confirm',
    tap: 'tap',
    close: 'close',
    reveal: 'open',
  };
  // An old save turned into Datos: VELA's welcome card comes first, the start card after it (never two).
  const migrated = game.migration;
  let welcomeDone = !migrated;
  const flow: SessionFlow = createSessionFlow({
    root,
    dishDiameter: (lv) => dishDiameterFor(lv, dishQ.maxDiameter),
    holdStart: () => !welcomeDone,
    hudHost: ui.clockSlot,
    previewHost: ui.previewSlot,
    dish: ui.dishEl,
    game,
    bus,
    lang: () => game.view().settings.lang,
    reduceMotion: () => game.view().settings.reduceMotion,
    encargo: () => encargos.current()?.ask ?? null,
    onSound: (k) => {
      const u = FLOW_SOUND[k];
      if (u) audio.playUI?.(u);
    },
    // The Datos preview explains itself in the shared price sheet ("¿Cómo se cuentan tus Datos?").
    onPreview: () => {
      const se = game.session;
      const fx = game.effects;
      const v = game.view();
      if (!se || !fx) return;
      const p = v.sessionPreview;
      const goal = p?.goal ? { name: nodeText(p.goal.id).name, missing: p.goal.missing } : null;
      priceCore.open(datosExplain(computeDatos(se, fx, 0), v.settings.lang, v.research?.night ?? 1, goal));
    },
  });
  flowRef = flow;
  // An old save turned into Datos: VELA says so once (game.migration is set only on that load).
  const welcome = createWelcomeCard(root, { lang: () => game.view().settings.lang, reduceMotion: () => game.view().settings.reduceMotion });
  flowBusy = () => flow.busy || welcome.isOpen;
  welcomeOpen = () => welcome.isOpen;
  if (migrated)
    void welcome.show(game.research?.datos ?? migrated.refunded + migrated.gift).then(() => {
      welcomeDone = true;
    });
  let flowLang = game.view().settings.lang;

  // Secrets: inputs (keys, logo, long press, shake, strokes), effects over the dish, reveal cards.
  const secretInputs = attachSecretInputs(secrets, { essence: ui.essenceEl, dish: ui.dishEl });
  const secretsUI = createSecretsUI(ui.dishEl, secrets, {
    camera,
    lang: () => game.view().settings.lang,
    reduceMotion: () => game.view().settings.reduceMotion,
    // A reveal card waits while a Momento card is open, VELA is talking (not during a task hint), or a
    // sheet / modal covers the dish (it would time out unseen behind it).
    // A secret found at boot (a full moon, the dish's birthday) waits for VELA's first words.
    // Session 1 is calm (CLARIDAD §3): its Momento cards come one after another, so a reveal waits for
    // the next session (a date secret like the dish's birthday is found at boot).
    hold: () =>
      momentsUI.busy ||
      (bridge?.storyShowing() ?? false) ||
      sheetOpen() ||
      ui.blocked() ||
      ui.drawerOpen ||
      flowBusy() ||
      encargoShowing() ||
      !introDone ||
      (game.session?.n === 1 && game.session.phase === 'running'),
    onSound: (k) => audio.playUI?.(k === 'secret' ? 'confirm' : 'open'),
    // iOS asks for the motion sensor from a tap (the basement's button): "shake" works there too.
    requestMotion: secretInputs.requestMotionPermission,
  });
  secretsUIRef = secretsUI;
  secretShowing = () => secretsUI.busy;
  strokesRef = createStrokeRecorder(secrets, { endOn: ui.dishEl });
  // The Bioluma logo (Settings → credits) counts knocks on the glass; the wake animation finds it by attribute.
  root.addEventListener('pointerup', (e) => {
    const logoEl = (e.target as Element | null)?.closest?.('.set-card.credits > span');
    if (!logoEl) return;
    logoEl.setAttribute('data-secret-logo', '');
    secrets.onLogoTap();
  });

  try {
    // Desktop GPUs handle full floats easily and match the CPU reference exactly;
    // phones keep the faster half-float default.
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    sim = createSimulation(glCanvas, {
      gridW,
      gridH,
      params: game.simParams,
      ...(coarse ? {} : { format: 'float' as const }),
    });
  } catch (err) {
    console.error(err);
    ui.showUnsupported(err instanceof Error ? err.message : String(err));
    return;
  }
  // Re-apply size now that the simulation exists.
  {
    const rect = glCanvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    if (rect.width > 0) {
      camera.setView(rect.width, rect.height);
      sim.resizeCanvas(Math.round(rect.width * dpr), Math.round(rect.height * dpr));
    }
  }

  const detector = createDetector();
  const platform: Platform = initPlatform({ onPause: () => save('sync') });
  platformRef = platform;
  game.setGridSize(gridW, gridH);
  audio.setDishSize?.(gridW, gridH);
  /** Glass deflection: swimmers turn away from the rim and from each other (src/sim/deflect.ts). */
  const deflector = new Deflector();
  /** Push the rim to everything that uses it (sim mask, camera fit, detector fill, game spots, sound). */
  function applyDish(): void {
    const d = dishAnim.rim;
    sim!.setDish(d);
    camera.setDish(d, dishAnim.fit);
    detector.setDish(d);
    game.setDish(d);
  }
  applyDish();

  if (saved.dish && saved.dishW === gridW && saved.dishH === gridH) {
    sim.importState(saved.dish, gridW, gridH);
  }
  /** Grant offline progress for time spent away (closed app or long-hidden tab). */
  function grantOffline(away: number): void {
    if (away <= 60) return;
    const before = game.view().essence;
    game.applyOffline(away);
    const gained = game.view().essence - before;
    // Sessions run only while playing (no "while you were away" card; CLARIDAD B-13).
    if (gained > 0 && game.view().cycle !== 'sessions') ui.showOfflineCard(Math.min(away, 24 * 3600), gained);
    save();
  }
  if (saved.game && saved.savedAt) grantOffline(offlineSeconds(saved.savedAt));

  // Dish requests from the game (auto-seeder, rewards, extinction).
  bus.on('dishSeed', ({ specs }) => {
    specs.forEach((s) => sim!.seed(s));
    // A seed while the run waits (the Nevera's plants on the start card) incubates under the card.
    if (game.session?.phase === 'ready') preincubate = PREINCUBATE_STEPS;
  });
  bus.on('sessionStart', () => (preincubate = PREINCUBATE_STEPS));
  // A refused tap (spacing rule, full nursery) always says why; nothing is charged and nothing lands.
  // 'tooClose': the UI draws a red ring and the reason at the spot. 'growing': the seed pill is grey
  // ("Espera…") and its reason chip says why, right above the price (no toast, no layout shift).
  let blockedHintAt = -Infinity;
  bus.on('seedBlocked', ({ reason }) => {
    if (reason !== 'growing') return;
    const now = performance.now();
    if (now - blockedHintAt < SEED_BLOCKED_HINT_MS) return;
    blockedHintAt = now;
    seedMeter.flash({ text: GAME_TEXT.seedGrowing[game.view().settings.lang], dir: 0 });
  });
  function clearDish(): void {
    sim!.clear();
    detector.reset();
    deflector.reset();
    epoch++; // drop snapshots requested before the clear
    reports.length = 0;
  }
  bus.on('dishClear', () => {
    runaway.reset();
    clearDish();
  });
  // Store achievements (Steam today; harmless no-op on the web).
  story.on('ending', ({ id }) => platform.unlockAchievement(endingAchievementId(id)));
  bus.on('achievement', ({ id }) => {
    platform.unlockAchievement(id);
    cosmetics.syncAchievements(doneAchievements());
  });
  const doneAchievements = () => game.view().achievements.filter((a) => a.done).map((a) => a.id);
  platform.syncAchievements(doneAchievements());
  // Secret achievements (hidden on Steam): one per secret + all of them (platforms/steam/achievements.json).
  const secretAchievements = () => {
    const found = secrets.list().filter((x) => x.found);
    const ids = found.map((x) => secretAchievementId(x.id));
    if (found.length >= secrets.total) ids.push('secretsAll');
    return ids;
  };
  platform.syncAchievements(secretAchievements());
  secrets.on('found', ({ secret }) => platform.unlockAchievement(secretAchievementId(secret.id)));
  secrets.on('allFound', () => platform.unlockAchievement('secretsAll'));

  // Cosmetics: free ones unlocked by achievements, equipped ones pushed to renderer, overlay,
  // portraits and music. Purely visual/audible (ADR-021).
  cosmetics.syncAchievements(doneAchievements());
  // Dish palette: the equipped cosmetic, unless a secret palette is picked in the basement (purely visual).
  let equippedLUT: Uint8Array | null = null;
  let secretLUT: Uint8Array | null = null;
  const pushLUT = () => sim?.setMatterLUT(secretLUT ?? equippedLUT ?? matterLUT());
  const cm = secrets.colormap();
  if (cm) secretLUT = colormapLUT(COLORMAPS[cm].stops);
  /**
   * The dish is always night, but in the light theme it rests on the light steel table of the art
   * direction (docs/ARTE.md §10: no dark frame nested in a dark card); the dish skin keeps its own colours.
   */
  type DishStyle = Parameters<NonNullable<typeof sim>['setRenderStyle']>[0];
  let dishStyle: DishStyle | null = null;
  const lightTable = hexToRgb(PALETTE.light.night).map((c) => c / 255) as [number, number, number];
  /**
   * The art direction's look (docs/ARTE.md §8.3, ART_RENDER_STYLE: frost-white glass, deeper night)
   * whenever the equipped dish theme is the default one; with the default palette too, its contour and
   * glow colours as well. A cosmetic dish theme or palette keeps its own colours.
   */
  function artStyle(st: DishStyle): DishStyle {
    const eq = cosmetics.entitlements;
    if (eq.equippedId('dish') !== DEFAULT_ITEM.dish) return st;
    const art = ART_RENDER_STYLE as unknown as DishStyle;
    const paletteDefault = eq.equippedId('palette') === DEFAULT_ITEM.palette;
    return {
      ...st,
      bg: art.bg,
      agarIn: art.agarIn,
      agarOut: art.agarOut,
      rim: art.rim,
      rimAmt: art.rimAmt,
      rimStyle: art.rimStyle,
      grid: art.grid,
      ...(paletteDefault ? { contour: art.contour, glowCore: art.glowCore, glowWide: art.glowWide, shadow: art.shadow } : {}),
    };
  }
  function pushDishStyle(): void {
    if (!sim || !dishStyle) return;
    const st = artStyle(dishStyle);
    // Light theme: a pale steel bench; the dish itself stays night (GDD §14).
    sim.setRenderStyle(document.documentElement.dataset.theme === 'light' ? { ...st, bg: lightTable } : st);
  }
  new MutationObserver(pushDishStyle).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  secrets.on('colormap', ({ colormap }) => {
    secretLUT = colormap ? colormapLUT(colormap.stops) : null;
    pushLUT();
  });
  cosmetics.bind({
    sim: {
      setMatterLUT: (lut) => {
        equippedLUT = lut;
        pushLUT();
      },
      setRenderStyle: (st) => {
        dishStyle = st;
        pushDishStyle();
      },
    },
    overlay: ui,
    portraits: { setPalette: (id, stops) => setPortraitPalette(id, stops) },
    audio,
  });
  cosmetics.entitlements.on('supporterWelcome', () => {
    if (extraJournal.add(SUPPORTER_JOURNAL.id)) bus.emit('journalNew', { id: SUPPORTER_JOURNAL.id, text: SUPPORTER_JOURNAL.text });
  });
  let stablePeak = 0;
  let epsPeak = 0;
  function reportStats(): void {
    const v = game.view();
    platform.reportStats({
      STAT_SEEDS: v.stats.seeds,
      STAT_SPECIES: v.species.length,
      STAT_CATALOG_SPECIES: v.species.filter((sp) => sp.catalogName).length,
      STAT_BEHAVIORS: v.behaviorsSeen.length,
      STAT_ERA: v.era,
      STAT_GENOME_NODES: v.genomeNodes.filter((n) => n.owned).length,
      STAT_STABLE_PEAK: stablePeak,
      STAT_EPS_PEAK: Math.floor(epsPeak),
      STAT_ESSENCE_LOG10: v.stats.totalEssence > 0 ? Math.floor(Math.log10(v.stats.totalEssence)) : 0,
      STAT_PLAY_MINUTES: Math.floor(v.stats.playTime / 60),
    });
  }
  // Species portraits: asynchronous GPU captures, never a synchronous readback in a frame (QA3 F2).
  // Games that queue their own requests (founder + re-captures) are drained after each tick; older
  // ones get one capture on 'speciesNew'.
  const portraitRequests = (game as { takePortraitRequests?: () => { speciesId: string; creatureId: number; x: number; y: number; size: number }[] })
    .takePortraitRequests;
  const capturePortrait = (speciesId: string, x: number, y: number, size: number, creatureId?: number) => {
    sim!
      .captureAsync(x, y, size)
      // The third argument (which creature) is optional: newer games use it to keep the best capture.
      .then((p) => (game.setSpeciesPortrait as (id: string, pat: typeof p, creatureId?: number) => void)(speciesId, p, creatureId))
      .catch((err) => console.warn('portrait capture failed', err));
  };
  if (!portraitRequests) {
    bus.on('speciesNew', ({ speciesId, x, y }) => capturePortrait(speciesId, x, y, Math.min(64, Math.ceil(sim!.params.R * 4))));
  }

  /**
   * Save. `dish`: 'sync' reads the dish now (page hidden, import, reset: rare, a hitch is fine),
   * 'none' writes the game state only (the 30 s autosave), or a dish read asynchronously.
   */
  function save(dish: 'sync' | 'none' | Uint8Array = 'sync'): void {
    if (!sim) return;
    let ok = false;
    try {
      const bytes = dish === 'sync' ? sim.exportState() : dish === 'none' ? undefined : dish;
      ok = writeSave(game.serialize(), bytes, sim.gridW, sim.gridH);
    } catch (err) {
      console.warn('save failed', err);
    }
    // Encargos keep their own key; snapshot it with every save so event counters ("catch 2 Sparks")
    // survive a reload between offers (the engine itself writes on offers and completions).
    try {
      localStorage.setItem(ENCARGOS_STORAGE_KEY, JSON.stringify(encargos.serialize()));
    } catch {
      /* storage blocked: the Encargos still work for this session */
    }
    if (!ok && !saveWarned) {
      saveWarned = true;
      bus.emit('toast', {
        text: {
          es: 'No se pudo guardar la partida en este navegador. Exporta tu partida desde Ajustes.',
          en: 'Could not save your game in this browser. Export it from Settings.',
        },
        kind: 'warn',
      });
    }
    if (ok) saveWarned = false;
  }

  // ── Main loop ──
  /**
   * Development / e2e builds only (the debug handle): run time faster so a player test can play
   * whole sessions (tests/e2e/session-play.mjs). `lockstep`: the game's clock follows the steps the
   * dish really ran (a software-rendered test browser runs far below 30 steps/s; without it the clock
   * would end sessions before anything grows). Always { scale: 1, lockstep: false } in a release.
   */
  const debugTime = { scale: 1, lockstep: false };
  /**
   * Steps still to incubate under the start card (ADR-027, RITMO §4.3): the Nevera's plants are alive
   * when the run starts. Up to PREINCUBATE_PER_FRAME steps a frame, never ahead of the detector.
   */
  let preincubate = !saved.dish && game.session?.phase === 'ready' ? PREINCUBATE_STEPS : 0;
  let last = performance.now();
  let acc = 0;
  /** Detector reports produced since the last game tick (async readbacks). */
  const reports: DetectorReport[] = [];
  let epoch = 0;
  let snapInFlight = false;
  /** Step of the last snapshot taken for the detector (the deflector steers from it). */
  let detectedStep = -1;
  /** True while stepping must wait for the snapshot of this boundary (src/sim/detectGate.ts). */
  function detectionDue(): boolean {
    const s = sim!;
    if (!mustWaitForDetection(s.stepCount, detectedStep, DETECT_EVERY)) return false;
    requestDetection();
    return mustWaitForDetection(s.stepCount, detectedStep, DETECT_EVERY);
  }
  let lastView = 0;
  let lastAudio = 0;
  let lastSave = performance.now();
  let lastDishSave = performance.now();
  let lastDraw = 0;
  let lastUiFrame = performance.now();
  let lastRate = -1;
  const start = last;

  let momentCardShown = false;
  let kernelWantSince = 0;
  let kernelWantKey = '';
  /** Push calibration to the GPU: growth params at once, kernel changes debounced. */
  function syncParams(now: number): void {
    const want = game.simParams;
    const have = sim!.params;
    const patch: Partial<LeniaParams> = {};
    if (want.mu !== have.mu) patch.mu = want.mu;
    if (want.sigma !== have.sigma) patch.sigma = want.sigma;
    if (want.dt !== have.dt) patch.dt = want.dt;
    const kernelKey = `${want.R}|${want.rings.join(',')}`;
    if (kernelKey !== `${have.R}|${have.rings.join(',')}`) {
      if (kernelKey !== kernelWantKey) {
        kernelWantKey = kernelKey;
        kernelWantSince = now;
      } else if (now - kernelWantSince >= KERNEL_DEBOUNCE_MS) {
        patch.R = want.R;
        patch.rings = [...want.rings];
      }
    }
    if (Object.keys(patch).length) sim!.setParams(patch);
  }

  /** Non-blocking detector readback; at most one in flight. */
  function requestDetection(): void {
    const s = sim!;
    if (snapInFlight || s.contextLost) return;
    detectedStep = s.stepCount;
    // Debug lockstep (tests only): a synchronous readback, so the detector sees every 10th step even
    // when the test browser renders far slower than the dish steps.
    if (debugTime.lockstep) {
      detect(s.snapshot());
      return;
    }
    snapInFlight = true;
    const myEpoch = epoch;
    s.snapshotAsync()
      .then((snap) => {
        if (myEpoch !== epoch) return;
        detect(snap);
      })
      .catch((err) => console.warn('snapshot failed', err))
      .finally(() => (snapInFlight = false));
  }
  /** Glass deflection and lysis counters (debug handle, e2e). */
  const dishStats = { turns: 0 };
  /** Species tints: the latest report's creatures with their species hue (extrapolated each frame). */
  const tintSrc: { id: number; x: number; y: number; vx: number; vy: number; r: number }[] = [];
  let tintStep = 0;
  const tintOut: { x: number; y: number; r: number; hue: number }[] = [];
  /** Species hue of every registered creature (from the game's view, refreshed 10×/s). */
  const hueById = new Map<number, number>();
  function detect(snap: ReturnType<NonNullable<typeof sim>['snapshot']>): void {
    const s = sim!;
    const report = detector.update(snap, s.params);
    // Dissolve a maze nucleus while it is still small (src/sim/runaway.ts, docs/DISH.md §5b).
    const dish = dishAnim.rim;
    const caught = runaway.update(report, snap, s.params, dish);
    for (const e of caught.erase) s.erase(e.x, e.y, e.radius);
    if (caught.started.length) noteDissolved(caught.started[0]);
    if (import.meta.env.VITE_E2E === '1')
      for (const c of caught.started) console.info(`[dish] runaway dissolved #${c.id} (${c.reason}, mass ${c.mass.toFixed(0)}) at step ${s.stepCount}`);
    // Glass deflection (docs/DISH.md §4): turn swimmers away from the rim and from each other. Positions
    // move on by the steps run since the snapshot; every turn is told to the detector, so a bouncing
    // swimmer stays a swimmer (§7). Exploded matter and colonies are obstacles, never steered; the
    // spinner label is never used (real spinners are left alone by the deflector's curl filter).
    const lag = Math.max(0, s.stepCount - report.step);
    const bodies = [];
    for (const c of report.creatures) {
      if (c.state === 'dead') continue;
      bodies.push({
        id: c.id,
        x: c.x + c.vx * lag,
        y: c.y + c.vy * lag,
        vx: c.vx,
        vy: c.vy,
        radius: c.radius,
        steerable: c.state !== 'exploded' && c.behavior !== 'colony',
      });
    }
    const turns = deflector.update(bodies, dish, s.stepCount, DETECT_EVERY);
    if (turns.length) {
      s.applyTurns(turns);
      for (const t of turns) detector.noteTurn(t.id, t.angle);
      dishStats.turns += turns.length;
    }
    // Tints follow the matter: the report's positions (a turned creature heads its new way from here).
    // Every body is kept; its hue is looked up each frame, so a species registered while the dish is
    // paused (its Momento card names the colour) is tinted at once, not at the next report.
    tintSrc.length = 0;
    for (const b of bodies) {
      const turned = turns.find((t) => t.id === b.id);
      const ca = turned ? Math.cos(turned.angle) : 1;
      const sa = turned ? Math.sin(turned.angle) : 0;
      tintSrc.push({ id: b.id, x: b.x, y: b.y, vx: b.vx * ca - b.vy * sa, vy: b.vx * sa + b.vy * ca, r: Math.max(s.params.R, 2.2 * b.radius) });
    }
    tintStep = s.stepCount;
    reports.push(report);
  }
  /** Tints follow the creatures between reports (each frame, cheap: ≤ 32 entries). */
  function pushTints(): void {
    const s = sim!;
    const ahead = s.stepCount - tintStep;
    tintOut.length = 0;
    for (const t of tintSrc) {
      const hue = hueById.get(t.id);
      if (hue === undefined || tintOut.length >= 32) continue;
      tintOut.push({ x: t.x + t.vx * ahead, y: t.y + t.vy * ahead, r: t.r, hue });
    }
    s.setCreatureTints(tintOut);
  }
  /** Species hues of the creatures in the game's view (registered species only). */
  function refreshTints(v: GameView): void {
    hueById.clear();
    for (const c of v.creatures) if (c.hue !== undefined && c.state !== 'dead') hueById.set(c.id, c.hue);
  }

  let lysisToastAt = -Infinity;
  /** Backstop: dissolve matter the detector already calls exploded (src/app/lysis.ts). */
  function dissolveShapeless(report: DetectorReport): void {
    const targets = lysisTargets(report, sim!.params.R, DISH_OVERGROWN_FILL);
    if (!targets.length) return;
    for (const t of targets) sim!.erase(t.x, t.y, t.radius);
    noteDissolved(targets[0]);
  }
  /**
   * The one place where lysis is announced, one message per event: the first time it is the "Materia sin
   * forma" Momento at that spot (when explanations are on); after that, a short toast now and then.
   */
  function noteDissolved(at: { x: number; y: number }): void {
    const now = performance.now();
    if (now - lysisToastAt < LYSIS_TOAST_MS) return;
    // First time: the card (or its brief label) says it, queued now or already on its way. Never also a toast.
    if (moments.notify('explode', { id: -1, x: at.x, y: at.y }) || moments.wouldShow('explode') || moments.isActive('explode')) {
      lysisToastAt = now;
      return;
    }
    // The long "why" only when no Momento card already explained shapeless matter (a brief label does not).
    const told = moments.mode === 'full' && moments.seen('explode');
    const first = lysisToastAt === -Infinity && !told;
    lysisToastAt = now;
    bus.emit('toast', {
      kind: 'warn',
      text: first
        ? {
            es: 'Dos semillas se fundieron sin forma. La disolví para salvar la placa.',
            en: 'Two seeds melted into shapeless matter. I dissolved it to save the dish.',
          }
        : { es: 'Disolví materia sin forma.', en: 'Dissolved shapeless matter.' },
    });
  }

  function frame(now: number): void {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    const s = sim!;
    syncParams(now);
    // A bigger dish bought in the tree: once the tree and the session cards are out of the way (the
    // player sees it), the rim and the camera ease out with a glow (1.5 s), before the next session's
    // first tap.
    const want = boughtDish();
    if (want.radius !== dishAnim.target.radius && !flowBusy()) dishAnim.setTarget(want, !game.view().settings.reduceMotion);
    if (dishAnim.update(dt)) applyDish();
    s.setDishFx({ grow: dishAnim.glow });
    pushTints();
    // A Momento eases the dish to a stop (1 → 0 in ~0.45 s) and back; at 0 it holds setPause('moment').
    const ts = momentsUI.timeScale();

    // Incubation under the start card: the detector still sees every 10th step it can (one readback in
    // flight), and the game ticks with dt 0 (nothing is paid while the run waits).
    if (preincubate > 0) {
      if (game.session?.phase !== 'ready' || s.contextLost) preincubate = 0;
      else if (!document.hidden) {
        let budget = Math.min(preincubate, PREINCUBATE_PER_FRAME);
        while (budget > 0 && !detectionDue()) {
          const k = Math.min(budget, DETECT_EVERY - (s.stepCount % DETECT_EVERY));
          s.advance(k);
          budget -= k;
          preincubate -= k;
          if (s.stepCount % DETECT_EVERY === 0) requestDetection();
        }
      }
    }

    let stepped = 0;
    if (!isPaused() && !document.hidden) {
      acc += dt * STEPS_PER_SEC * game.speed * ts * debugTime.scale;
      // Never fall into a spiral of death: cap work per frame.
      const whole = Math.floor(acc);
      let n = Math.min(whole, 4 * game.speed * debugTime.scale);
      acc -= whole; // any backlog beyond the cap is dropped, the sim just runs slower
      while (n > 0 && !detectionDue()) {
        const k = Math.min(n, DETECT_EVERY - (s.stepCount % DETECT_EVERY));
        s.advance(k);
        n -= k;
        stepped += k;
        if (s.stepCount % DETECT_EVERY === 0) requestDetection();
      }
    }
    // Feed every report so no died/exploded/divided event is lost; time advances once.
    const n = reports.length;
    for (let i = 0; i < n; i++) dissolveShapeless(reports[i]);
    for (let i = 0; i < n - 1; i++) game.tick(0, reports[i]);
    const gameDt = debugTime.lockstep ? (game.speed > 0 ? stepped / (STEPS_PER_SEC * game.speed) : isPaused() ? 0 : dt) : dt * ts * debugTime.scale;
    game.tick(gameDt, n ? reports[n - 1] : null);
    reports.length = 0;
    if (portraitRequests) for (const r of portraitRequests.call(game)) capturePortrait(r.speciesId, r.x, r.y, r.size, r.creatureId);

    // Steps/s the overlay extrapolates labels with (the e2e time scale included; 1 in a release).
    const rate = isPaused() ? 0 : STEPS_PER_SEC * game.speed * ts * debugTime.scale;
    if (rate !== lastRate) {
      lastRate = rate;
      (ui as { setSimRate?: (r: number) => void }).setSimRate?.(rate);
    }
    // Idle (no input for a minute, GDD §12): draw at 30 fps; the simulation keeps its real step rate.
    if (!idle || now - lastDraw >= IDLE_FRAME_MS - 2) {
      lastDraw = now;
      s.render({ camera, time: (now - start) / 1000, quality });
      ui.frame((now - start) / 1000, Math.min(0.25, (now - lastUiFrame) / 1000));
      lastUiFrame = now;
    }

    let view: ReturnType<typeof game.view> | null = null;
    if (now - lastView > 100) {
      lastView = now;
      view = viewWithExtras();
      // Status pills: on every creature in Era 1 (setting), stepping aside while a Momento speaks (a card
      // or its brief label: one label at a time on the dish, docs/ARTE.md §10).
      ui.setCreatureLabels(moments.labelsOnAll(view.era), momentsUI.busy && moments.current() !== null);
      ui.update(view);
      refreshTints(view);
      flow.update(view);
      setPause('cards', flowBusy());
      // A paused Momento card is the one message on screen: the Encargo bar steps back under it (on a wide
      // screen the card beside the dish reached the bar's end).
      if (momentsUI.cardOpen !== momentCardShown) {
        momentCardShown = momentsUI.cardOpen;
        root.classList.toggle('mo-card-open', momentCardShown);
      }
      seedMeter.update(view);
      priceSheet.update(view);
      if (view.settings.lang !== flowLang) {
        flowLang = view.settings.lang;
        flow.relabel();
      }
      if (view.settings.lang !== storyLang) {
        storyLang = view.settings.lang;
        storyUI.relabel();
      }
      if (view.settings.lang !== momentsLang) {
        momentsLang = view.settings.lang;
        momentsUI.relabel();
      }
      if (view.settings.lang !== encLang) {
        encLang = view.settings.lang;
        encUI.relabel();
      }
    }
    if (now - lastAudio > 1000) {
      lastAudio = now;
      const v = view ?? game.view();
      stablePeak = Math.max(stablePeak, v.creatures.filter((c) => c.state === 'stable').length);
      epsPeak = Math.max(epsPeak, v.essencePerSec);
      const st = v.settings;
      audio.setVolumes(st.sfxVolume, st.musicVolume, st.muted);
      audio.setState({
        eps: v.essencePerSec,
        species: v.species.length,
        creatures: v.creatures.filter((c) => c.state === 'stable').length,
        era: v.era,
        behaviors: v.behaviorsSeen.length,
        paused: pauseSources.has('user'),
      });
      const isIdle = now - lastInteraction > IDLE_AFTER_MS;
      if (isIdle !== idle) {
        idle = isIdle;
        audio.setIdle(idle);
      }
    }
    if (now - lastSave > AUTOSAVE_MS) {
      lastSave = now;
      // Game state every 30 s; the dish (a GPU readback) every 5 min, asynchronously (QA3 F2).
      if (now - lastDishSave > DISH_SAVE_MS && !s.contextLost) {
        lastDishSave = now;
        s.exportStateAsync()
          .then((bytes) => save(bytes))
          .catch(() => save('none'));
      } else save('none');
      reportStats();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.addEventListener('pointerdown', () => (lastInteraction = performance.now()), { passive: true });
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      save();
      audio.suspend();
    } else {
      last = performance.now();
      if (hiddenAt) grantOffline(offlineSeconds(hiddenAt));
      hiddenAt = 0;
      audio.resume();
    }
  });
  window.addEventListener('pagehide', () => save('sync'));

  // Debug handle for development and e2e builds only.
  if (import.meta.env.DEV || import.meta.env.VITE_E2E === '1') {
    integrity.guardDebugHandle(window, 'bioluma', {
      game,
      sim,
      detector,
      camera,
      bus,
      story,
      cosmetics,
      ui,
      storyUI,
      moments,
      momentsUI,
      priceSheet,
      encargos,
      encUI,
      secrets,
      secretsUI,
      flow,
      debugTime,
      dishStats,
      dishAnim,
    });
  }
  leaderboard?.startAutoSubmit();

  if (platform.shouldRegisterServiceWorker()) registerServiceWorker();
}

function registerServiceWorker(): void {
  if (!import.meta.env.PROD || __SINGLE_FILE__) return;
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('sw failed', err));
}

declare const __SINGLE_FILE__: boolean;

boot();
