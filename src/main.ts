/**
 * Bioluma — integration entry point.
 * Wires simulation (GPU) → detector (CPU) → game (economy) → UI + audio.
 */
import { bus } from './core/bus';
import { Camera } from './core/camera';
import type { DetectorReport, Quality, Simulation } from './core/types';
import { createSimulation } from './sim/webgl';
import { createDetector } from './detect/detector';
import { createGame } from './game/game';
import { loadSave, writeSave } from './game/save';
import { createUI } from './ui/ui';
import { createAudio } from './audio/audio';

/** Fixed-aspect grids per quality profile (w × h). */
const GRIDS: Record<Quality, [number, number]> = {
  low: [128, 160],
  medium: [192, 240],
  high: [224, 280],
};
/** Base simulation rate (steps per second) at speed ×1. */
const STEPS_PER_SEC = 60;
/** Detector cadence in simulation steps. */
const DETECT_EVERY = 10;
const AUTOSAVE_MS = 30_000;
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

  const saved = loadSave();
  const game = createGame({ bus }, saved.game ?? undefined);
  const settings = game.view().settings;
  if (!saved.game) {
    // First run: follow the browser language.
    game.actions.setSetting('lang', navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en');
  }

  const quality = pickQuality(settings.quality);
  const [gridW, gridH] = GRIDS[quality];
  const camera = new Camera(gridW, gridH);
  const glCanvas = document.createElement('canvas');
  glCanvas.className = 'gl-dish';

  let sim: Simulation | null = null;
  let paused = false;
  let lastInteraction = performance.now();
  let idle = false;

  const audio = createAudio(bus);

  const ui = createUI(root, {
    actions: game.actions,
    camera,
    glCanvas,
    onDishResize(cssW, cssH, dpr) {
      camera.setView(cssW, cssH);
      sim?.resizeCanvas(Math.round(cssW * dpr), Math.round(cssH * dpr));
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
      if (game.actions.extinguish()) {
        sim?.clear();
        detector.reset();
        save();
      }
    },
    onPauseToggle() {
      paused = !paused;
      game.isPaused = paused;
      ui.setPaused(paused);
    },
    exportSave: () => game.exportString(),
    importSave(s) {
      const ok = game.importString(s);
      if (ok) {
        sim?.clear();
        detector.reset();
        save();
      }
      return ok;
    },
    resetSave() {
      game.reset();
      sim?.clear();
      detector.reset();
      save();
    },
    onUserGesture() {
      lastInteraction = performance.now();
      audio.unlock();
    },
  });

  try {
    sim = createSimulation(glCanvas, { gridW, gridH, params: game.simParams });
  } catch (err) {
    console.error(err);
    ui.showUnsupported(err instanceof Error ? err.message : String(err));
    return;
  }
  // Re-apply size now that the simulation exists.
  {
    const rect = glCanvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (rect.width > 0) {
      camera.setView(rect.width, rect.height);
      sim.resizeCanvas(Math.round(rect.width * dpr), Math.round(rect.height * dpr));
    }
  }

  const detector = createDetector();

  if (saved.dish && saved.dishW === gridW && saved.dishH === gridH) {
    sim.importState(saved.dish, gridW, gridH);
  }
  if (saved.game && saved.savedAt) {
    const away = (Date.now() - saved.savedAt) / 1000;
    if (away > 60) {
      const before = game.view().essence;
      game.applyOffline(away);
      const gained = game.view().essence - before;
      if (gained > 0) ui.showOfflineCard(Math.min(away, 24 * 3600), gained);
    }
  }

  // Dish requests from the game (auto-seeder, rewards, extinction).
  bus.on('dishSeed', ({ specs }) => specs.forEach((s) => sim!.seed(s)));
  bus.on('dishClear', () => {
    sim!.clear();
    detector.reset();
  });
  // Capture a portrait of every newly registered species.
  bus.on('speciesNew', ({ speciesId, x, y }) => {
    const size = Math.min(64, Math.ceil(sim!.params.R * 4));
    game.setSpeciesPortrait(speciesId, sim!.capture(x, y, size));
  });

  function save(): void {
    if (!sim) return;
    try {
      writeSave(game.serialize(), sim.exportState(), sim.gridW, sim.gridH);
    } catch (err) {
      console.warn('save failed', err);
    }
  }

  // ── Main loop ──
  let last = performance.now();
  let acc = 0;
  let pending: DetectorReport | null = null;
  let lastView = 0;
  let lastAudio = 0;
  let lastSave = performance.now();
  const start = last;

  function syncParams(): void {
    const want = game.simParams;
    const have = sim!.params;
    if (
      want.mu !== have.mu ||
      want.sigma !== have.sigma ||
      want.dt !== have.dt ||
      want.R !== have.R ||
      want.rings.length !== have.rings.length ||
      want.rings.some((r, i) => r !== have.rings[i])
    ) {
      sim!.setParams(want);
    }
  }

  function frame(now: number): void {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    const s = sim!;
    syncParams();

    if (!paused && !document.hidden) {
      acc += dt * STEPS_PER_SEC * game.speed;
      // Never fall into a spiral of death: cap work per frame.
      const whole = Math.floor(acc);
      let n = Math.min(whole, 4 * game.speed);
      acc -= whole; // any backlog beyond the cap is dropped, the sim just runs slower
      while (n > 0) {
        const k = Math.min(n, DETECT_EVERY - (s.stepCount % DETECT_EVERY));
        s.advance(k);
        n -= k;
        if (s.stepCount % DETECT_EVERY === 0) pending = detector.update(s.snapshot(), s.params);
      }
    }
    game.tick(dt, pending);
    pending = null;

    s.render({ camera, time: (now - start) / 1000, quality });
    ui.frame((now - start) / 1000, dt);

    if (now - lastView > 100) {
      lastView = now;
      ui.update(game.view());
    }
    if (now - lastAudio > 1000) {
      lastAudio = now;
      const v = game.view();
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
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.addEventListener('pointerdown', () => (lastInteraction = performance.now()), { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      save();
      audio.suspend();
    } else {
      last = performance.now();
      audio.resume();
    }
  });
  window.addEventListener('pagehide', save);

  // Debug handle for e2e tests and the curious.
  (window as unknown as { bioluma: unknown }).bioluma = { game, sim, detector, camera, bus };

  registerServiceWorker();
}

function registerServiceWorker(): void {
  if (!import.meta.env.PROD || __SINGLE_FILE__) return;
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('sw failed', err));
}

declare const __SINGLE_FILE__: boolean;

boot();
