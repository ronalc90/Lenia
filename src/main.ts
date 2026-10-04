/**
 * Bioluma — integration entry point.
 * Wires simulation (GPU) → detector (CPU) → game (economy) → UI + audio.
 */
import { bus } from './core/bus';
import { Camera } from './core/camera';
import type { DetectorReport, LeniaParams, Quality } from './core/types';
import { createSimulation } from './sim/webgl';
import { QUALITY_GRID } from './sim/perf';
import { createDetector, DISH_OVERGROWN_FILL } from './detect/detector';
import { createGame } from './game/game';
import { TEXT } from './game/content';
import { clearSave, loadSave, offlineSeconds, writeSave } from './game/save';
// Art tokens (--bl-*) before every module stylesheet (docs/ARTE.md §12).
import './ui/art/art.css';
import { createUI } from './ui/ui';
import { createAudio } from './audio/audio';
import { detectPlatform, endingAchievementId, initPlatform, type Platform } from './platform/platform';
import { createIntegrity } from './net/integrity';
import { createLeaderboardClient } from './net/leaderboard';
import { createPlayerIdentity } from './net/identity';
import { setupCosmetics } from './app/cosmetics';
import { createExtraJournal } from './app/journal';
import { LYSIS_TOAST_MS, lysisTargets } from './app/lysis';
import { SUPPORTER_JOURNAL } from './store/catalog';
import { setPortraitPalette } from './ui/portrait';
import { createStory } from './story';
import { createStoryUI, type StoryArchive, type StorySound } from './ui/story';
import type { UI, UISound } from './ui/ui';

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
const AUTOSAVE_MS = 30_000;
/** The dish itself is saved less often (a GPU readback); also on pagehide / tab hidden. */
const DISH_SAVE_MS = 5 * 60_000;
/** Kernel changes (R, rings) recompile the step shader; wait for the slider to settle. */
const KERNEL_DEBOUNCE_MS = 350;
const IDLE_AFTER_MS = 60_000;
/** Frame interval while idle (30 fps). */
const IDLE_FRAME_MS = 1000 / 30;
/** At most one "refused tap" toast in this many ms (a player tapping fast gets one, not ten). */
const SEED_BLOCKED_TOAST_MS = 2500;

/**
 * Why the dish is frozen. The simulation and the economy stop while any source is active; the UI's
 * pause button only reflects 'user' (moments, cinematics and the extinction ritual pause silently).
 */
export type PauseSource = 'user' | 'moment' | 'ritual' | 'cinematic';

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
  const game = createGame({ bus }, saved.game ?? undefined);
  const settings = game.view().settings;
  if (!saved.game) {
    // First run: follow the browser language.
    game.actions.setSetting('lang', navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en');
  }

  const quality = pickQuality(settings.quality);
  const { w: gridW, h: gridH } = QUALITY_GRID[quality];
  /** The screen pass runs per device pixel; cap the ratio to keep phones cool. */
  const maxDpr = quality === 'low' ? 1.5 : 2;
  const camera = new Camera(gridW, gridH);
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
  /**
   * Extinction ritual: the game resets at once, but the dish is wiped only when the
   * UI's white-out covers it. Until then the old dish is frozen (no steps, no
   * detection) so old creatures can't pay into the new era.
   */
  let ritual = false;
  let ritualClearTimer: ReturnType<typeof setTimeout> | null = null;
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

  // ── Story layer (docs/STORY.md §7): dialogue scenes, the story-driven tutorial, endings. ──
  let uiRef: UI | null = null;
  /** Story scenes another surface is explaining right now (e.g. a "moment"): never two popups per event. */
  const storySuppressed = new Set<string>();
  const story = createStory({
    bus,
    getView: () => game.view(),
    isBlocked: () => uiRef?.blocked() ?? true,
    suppress: (id) => storySuppressed.has(id),
  });
  story.on('journal', ({ id, text }) => bus.emit('journalNew', { id, text }));
  extraJournal.addSource(() => story.journalViews());
  let storyArchive: StoryArchive | null = null;
  /** A story scene or ending is on screen (late-bound: the story UI mounts after the game UI). */
  let storyBusy = (): boolean => false;

  const ui = createUI(root, {
    actions: {
      ...game.actions,
      markJournalRead(id?: string) {
        game.actions.markJournalRead(id);
        if (id === undefined) {
          extraJournal.markRead();
          story.markJournalRead();
        }
      },
    },
    camera,
    glCanvas,
    leaderboard,
    // The story tutorial replaces the built-in coach marks (docs/STORY.md §7.4).
    tutorial: false,
    onRestartTutorial: () => story.restartTutorial(),
    onTabOpen: (tab) => {
      story.signal(`tab:${tab}`);
      if (tab === 'calibrate') prewarmNearbyKernels();
    },
    isNarrating: () => storyBusy(),
    settingsSections: (el) => {
      storyArchive?.dispose();
      storyArchive = storyUI.mountArchive(el);
    },
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
    },
    onBrush(x, y) {
      for (const spec of game.actions.brushAt(x, y)) sim?.seed(spec);
    },
    onPrint(speciesId, x, y) {
      const spec = game.actions.printAt(speciesId, x, y);
      if (spec) {
        sim?.seed(spec);
        story.notePrint();
      }
    },
    onExtinguish() {
      ritual = true;
      if (game.actions.extinguish()) save();
      else ritual = false;
    },
    onRitualWhite() {
      finishRitual();
    },
    onUISound(kind) {
      audio.playUI?.(kind);
    },
    onPauseToggle() {
      setPause('user', !pauseSources.has('user'));
    },
    exportSave: () => game.exportString(),
    importSave(s) {
      integrity.noteImport(s);
      const ok = game.importString(s);
      if (ok) save();
      return ok;
    },
    resetSave() {
      clearSave();
      game.reset();
      story.reset();
      save();
    },
    onUserGesture() {
      lastInteraction = performance.now();
      audio.unlock();
    },
  });

  uiRef = ui;
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
    onSound: (kind) => {
      const k = STORY_SOUND[kind];
      if (k) audio.playUI?.(k);
    },
  });
  let storyLang = game.view().settings.lang;
  storyBusy = () => storyUI.busy;

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

  if (saved.dish && saved.dishW === gridW && saved.dishH === gridH) {
    sim.importState(saved.dish, gridW, gridH);
  }
  /** Grant offline progress for time spent away (closed app or long-hidden tab). */
  function grantOffline(away: number): void {
    if (away <= 60) return;
    const before = game.view().essence;
    game.applyOffline(away);
    const gained = game.view().essence - before;
    if (gained > 0) ui.showOfflineCard(Math.min(away, 24 * 3600), gained);
    save();
  }
  if (saved.game && saved.savedAt) grantOffline(offlineSeconds(saved.savedAt));

  // Dish requests from the game (auto-seeder, rewards, extinction).
  bus.on('dishSeed', ({ specs }) => specs.forEach((s) => sim!.seed(s)));
  // A refused tap (spacing rule, full nursery) always says why: nothing is charged and nothing lands.
  let blockedToastAt = -Infinity;
  bus.on('seedBlocked', ({ reason }) => {
    const now = performance.now();
    if (now - blockedToastAt < SEED_BLOCKED_TOAST_MS) return;
    blockedToastAt = now;
    bus.emit('toast', { kind: 'info', text: reason === 'tooClose' ? TEXT.seedTooClose : TEXT.seedGrowing });
  });
  function clearDish(): void {
    sim!.clear();
    detector.reset();
    epoch++; // drop snapshots requested before the clear
    reports.length = 0;
  }
  function finishRitual(): void {
    if (ritualClearTimer) clearTimeout(ritualClearTimer);
    ritualClearTimer = null;
    if (ritual) {
      ritual = false;
      clearDish();
    }
  }
  bus.on('dishClear', () => {
    if (ritual) {
      // Wipe when the white-out lands; fall back in case the UI never reports it.
      epoch++;
      reports.length = 0;
      ritualClearTimer ??= setTimeout(finishRitual, 5000);
    } else {
      clearDish();
    }
  });
  // Store achievements (Steam today; harmless no-op on the web).
  story.on('ending', ({ id }) => platform.unlockAchievement(endingAchievementId(id)));
  bus.on('achievement', ({ id }) => {
    platform.unlockAchievement(id);
    cosmetics.syncAchievements(doneAchievements());
  });
  const doneAchievements = () => game.view().achievements.filter((a) => a.done).map((a) => a.id);
  platform.syncAchievements(doneAchievements());

  // Cosmetics: free ones unlocked by achievements, equipped ones pushed to renderer, overlay,
  // portraits and music. Purely visual/audible (ADR-021).
  cosmetics.syncAchievements(doneAchievements());
  cosmetics.bind({
    sim: sim!,
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
   * Compile the step shaders for R ± 1–2 ahead of the R slider (QA3 F11: 0.4–2 s per first use).
   * One kernel per 400 ms so opening the tab never hitches.
   */
  let prewarmTimer: ReturnType<typeof setTimeout> | null = null;
  function prewarmNearbyKernels(): void {
    if (prewarmTimer || !sim) return;
    const v = game.view();
    const R = sim.params.R;
    const range = v.calibration.RRange;
    const want = [R + 1, R - 1, R + 2, R - 2].filter((r) => r >= 2 && (!range || (r >= range[0] && r <= range[1])));
    const next = () => {
      const r = want.shift();
      if (r === undefined || !sim) {
        prewarmTimer = null;
        return;
      }
      sim.prewarmKernel(r);
      prewarmTimer = setTimeout(next, 400);
    };
    prewarmTimer = setTimeout(next, 400);
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
  let last = performance.now();
  let acc = 0;
  /** Detector reports produced since the last game tick (async readbacks). */
  const reports: DetectorReport[] = [];
  let epoch = 0;
  let snapInFlight = false;
  let lastView = 0;
  let lastAudio = 0;
  let lastSave = performance.now();
  let lastDishSave = performance.now();
  let lastDraw = 0;
  let lastUiFrame = performance.now();
  let lastRate = -1;
  const start = last;

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
    snapInFlight = true;
    const myEpoch = epoch;
    s.snapshotAsync()
      .then((snap) => {
        if (myEpoch === epoch) reports.push(detector.update(snap, s.params));
      })
      .catch((err) => console.warn('snapshot failed', err))
      .finally(() => (snapInFlight = false));
  }

  let lysisToastAt = -Infinity;
  /** Dissolve runaway shapeless matter before it grows into a maze (src/app/lysis.ts). */
  function dissolveShapeless(report: DetectorReport): void {
    const targets = lysisTargets(report, sim!.params.R, DISH_OVERGROWN_FILL);
    if (!targets.length) return;
    for (const t of targets) sim!.erase(t.x, t.y, t.radius);
    const now = performance.now();
    if (now - lysisToastAt < LYSIS_TOAST_MS) return;
    const first = lysisToastAt === -Infinity;
    lysisToastAt = now;
    bus.emit('toast', {
      kind: 'warn',
      text: first
        ? {
            es: 'Materia sin forma: dos manchas se juntaron y crecían sin control. La disolví para salvar la placa.',
            en: 'Shapeless matter: two blobs merged and grew out of control. I dissolved it to save the dish.',
          }
        : { es: 'Disolví materia sin forma.', en: 'Dissolved shapeless matter.' },
    });
  }

  function frame(now: number): void {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    const s = sim!;
    syncParams(now);

    if (!isPaused() && !ritual && !document.hidden) {
      acc += dt * STEPS_PER_SEC * game.speed;
      // Never fall into a spiral of death: cap work per frame.
      const whole = Math.floor(acc);
      let n = Math.min(whole, 4 * game.speed);
      acc -= whole; // any backlog beyond the cap is dropped, the sim just runs slower
      while (n > 0) {
        const k = Math.min(n, DETECT_EVERY - (s.stepCount % DETECT_EVERY));
        s.advance(k);
        n -= k;
        if (s.stepCount % DETECT_EVERY === 0) requestDetection();
      }
    }
    // Feed every report so no died/exploded/divided event is lost; time advances once.
    const n = reports.length;
    for (let i = 0; i < n; i++) dissolveShapeless(reports[i]);
    for (let i = 0; i < n - 1; i++) game.tick(0, reports[i]);
    game.tick(dt, n ? reports[n - 1] : null);
    reports.length = 0;
    if (portraitRequests) for (const r of portraitRequests.call(game)) capturePortrait(r.speciesId, r.x, r.y, r.size, r.creatureId);

    const rate = isPaused() || ritual ? 0 : STEPS_PER_SEC * game.speed;
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
      ui.update(view);
      if (view.settings.lang !== storyLang) {
        storyLang = view.settings.lang;
        storyUI.relabel();
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
    integrity.guardDebugHandle(window, 'bioluma', { game, sim, detector, camera, bus, story, cosmetics });
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
