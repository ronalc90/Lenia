/**
 * Bioluma — integration entry point.
 * Wires simulation (GPU) → detector (CPU) → game (economy) → UI + audio.
 */
import { bus } from './core/bus';
import { Camera } from './core/camera';
import type { DetectorReport, LeniaParams, Quality } from './core/types';
import { createSimulation } from './sim/webgl';
import { QUALITY_GRID } from './sim/perf';
import { createDetector } from './detect/detector';
import { createGame } from './game/game';
import { clearSave, loadSave, offlineSeconds, writeSave } from './game/save';
import { createUI } from './ui/ui';
import { createAudio } from './audio/audio';
import { initPlatform, type Platform } from './platform/platform';
import { createIntegrity } from './net/integrity';
import { createLeaderboardClient } from './net/leaderboard';

/**
 * Ranking API origin. Set VITE_LEADERBOARD_URL at build time ('' = same origin);
 * deployments on Vercel (which host api/) enable it automatically.
 */
const LEADERBOARD_URL: string | undefined =
  import.meta.env.VITE_LEADERBOARD_URL ?? (location.hostname.endsWith('.vercel.app') ? '' : undefined);

/**
 * Base simulation rate (steps per second) at speed ×1. Orbium swims ~0.24
 * cells/step, so 30 steps/s keeps motion graceful and readable while halving
 * the GPU load on phones; the Incubadora doubles/quadruples it.
 */
const STEPS_PER_SEC = 30;
/** Detector cadence in simulation steps. */
const DETECT_EVERY = 10;
const AUTOSAVE_MS = 30_000;
/** Kernel changes (R, rings) recompile the step shader; wait for the slider to settle. */
const KERNEL_DEBOUNCE_MS = 350;
const IDLE_AFTER_MS = 60_000;

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
  let paused = false;
  /** Declared before anything can call save() (the boot-time offline grant does). */
  let saveWarned = false;
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
  const leaderboard =
    LEADERBOARD_URL === undefined ? undefined : createLeaderboardClient({ game, integrity, bus, baseUrl: LEADERBOARD_URL });

  const ui = createUI(root, {
    actions: game.actions,
    camera,
    glCanvas,
    leaderboard,
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
      if (spec) sim?.seed(spec);
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
      paused = !paused;
      game.isPaused = paused;
      ui.setPaused(paused);
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
      save();
    },
    onUserGesture() {
      lastInteraction = performance.now();
      audio.unlock();
    },
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
  const platform: Platform = initPlatform({ onPause: save });
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
  bus.on('achievement', ({ id }) => platform.unlockAchievement(id));
  platform.syncAchievements(game.view().achievements.filter((a) => a.done).map((a) => a.id));
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
  // Capture a portrait of every newly registered species.
  bus.on('speciesNew', ({ speciesId, x, y }) => {
    const size = Math.min(64, Math.ceil(sim!.params.R * 4));
    game.setSpeciesPortrait(speciesId, sim!.capture(x, y, size));
  });

  function save(): void {
    if (!sim) return;
    let ok = false;
    try {
      ok = writeSave(game.serialize(), sim.exportState(), sim.gridW, sim.gridH);
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

  function frame(now: number): void {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    const s = sim!;
    syncParams(now);

    if (!paused && !ritual && !document.hidden) {
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
    for (let i = 0; i < n - 1; i++) game.tick(0, reports[i]);
    game.tick(dt, n ? reports[n - 1] : null);
    reports.length = 0;

    const rate = paused || ritual ? 0 : STEPS_PER_SEC * game.speed;
    if (rate !== lastRate) {
      lastRate = rate;
      (ui as { setSimRate?: (r: number) => void }).setSimRate?.(rate);
    }
    s.render({ camera, time: (now - start) / 1000, quality });
    ui.frame((now - start) / 1000, dt);

    let view: ReturnType<typeof game.view> | null = null;
    if (now - lastView > 100) {
      lastView = now;
      view = game.view();
      ui.update(view);
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
        paused,
      });
      const isIdle = now - lastInteraction > IDLE_AFTER_MS;
      if (isIdle !== idle) {
        idle = isIdle;
        audio.setIdle(idle);
      }
    }
    if (now - lastSave > AUTOSAVE_MS) {
      lastSave = now;
      save();
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
  window.addEventListener('pagehide', save);

  // Debug handle for development and e2e builds only.
  if (import.meta.env.DEV || import.meta.env.VITE_E2E === '1') {
    integrity.guardDebugHandle(window, 'bioluma', { game, sim, detector, camera, bus });
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
