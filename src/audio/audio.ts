/**
 * Public audio API for Bioluma: a realtime wrapper around AudioCore.
 *
 *   const audio = createAudio(bus);
 *   window.addEventListener('pointerdown', () => audio.unlock());
 *   audio.setVolumes(settings.sfxVolume, settings.musicVolume, settings.muted);
 *   setInterval(() => audio.setState({ eps, species, creatures, era, behaviors, paused }), 1000);
 *   document.addEventListener('visibilitychange', () => (document.hidden ? audio.suspend() : audio.resume()));
 *
 * Everything is synthesised at runtime with the Web Audio API (no files).
 * The AudioContext is created lazily on the first unlock() (autoplay policy).
 */
import type { Bus, GameEvents } from '../core/bus';
import { AudioCore, type UISound } from './engine';
import type { MusicState } from './intensity';

export type { MusicState } from './intensity';
export type { UISound } from './engine';

export interface AudioEngine {
  /** Call on first user gesture (autoplay policy). Safe to call many times. */
  unlock(): void;
  setVolumes(sfx: number, music: number, muted: boolean): void;
  /** Push game state ~1×/s; drives music intensity/layers. */
  setState(s: MusicState): void;
  /** Idle mode (no touch 60 s): mute auto-seeder sfx, keep music softer. */
  setIdle(idle: boolean): void;
  /** Pause everything when the tab is hidden. */
  suspend(): void;
  resume(): void;
  dispose(): void;
  /** Optional: dish width in grid cells (pans effects by x). Default 192. */
  setDishSize?(w: number, h: number): void;
  /** Optional: true once the AudioContext exists and is running. */
  readonly running?: boolean;
  /** Optional: interface sound for a UI interaction. */
  playUI?(kind: UISound): void;
}

/** Game events the audio reacts to. */
const EVENTS: (keyof GameEvents)[] = [
  'seed',
  'seedDenied',
  'creatureStable',
  'creatureDied',
  'creatureExploded',
  'creatureDivided',
  'income',
  'speciesNew',
  'behaviorNew',
  'upgradeBought',
  'genomeBought',
  'journalNew',
  'achievement',
  'extinctionStart',
  'extinctionDone',
  'goldenSpawn',
  'goldenCollected',
  'goldenMissed',
  'calibrationChanged',
  'offlineReturn',
];

type Ctor = typeof AudioContext;

export function createAudio(bus: Bus<GameEvents>): AudioEngine {
  let ctx: AudioContext | null = null;
  let core: AudioCore | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let muteTimer: ReturnType<typeof setTimeout> | null = null;
  let hidden = false;
  let disposed = false;
  let dishW = 192;
  let vol = { sfx: 0.8, music: 0.6, muted: false };
  let idle = false;
  let state: MusicState | null = null;

  const now = () => (ctx ? ctx.currentTime : 0);
  const shouldRun = () => !!ctx && !hidden && !vol.muted && !disposed;

  const startTimer = () => {
    if (timer || !core) return;
    timer = setInterval(() => {
      if (ctx && core && ctx.state === 'running') core.tick(ctx.currentTime);
    }, 50);
  };
  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  const resumeCtx = () => {
    if (!ctx || !shouldRun()) return;
    if (ctx.state !== 'running') {
      ctx.resume().then(
        () => {
          if (core && ctx) core.tick(ctx.currentTime);
        },
        () => undefined,
      );
    }
    startTimer();
  };

  const unsubs = EVENTS.map((type) =>
    bus.on(type, (payload) => {
      if (!core || !ctx || ctx.state !== 'running') return;
      core.handle(type, payload as never, ctx.currentTime);
    }),
  );

  const engine: AudioEngine = {
    get running() {
      return !!ctx && ctx.state === 'running';
    },

    unlock() {
      if (disposed) return;
      if (!ctx) {
        const w = globalThis as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
        const C = w.AudioContext ?? w.webkitAudioContext;
        if (!C) return;
        try {
          ctx = new C({ latencyHint: 'interactive' });
        } catch {
          return;
        }
        // 0.4 s lookahead: survives main-thread hiccups (WebGL frames, GC) without gaps.
        core = new AudioCore(ctx, { dishWidth: dishW, lookahead: 0.4 });
        core.setVolumes(vol.sfx, vol.music, vol.muted, ctx.currentTime);
        core.setIdle(idle, ctx.currentTime);
        if (state) core.setState(state, ctx.currentTime);
        core.start(ctx.currentTime + 0.12);
        if (vol.muted) {
          vol = { ...vol, muted: false };
          engine.setVolumes(vol.sfx, vol.music, true);
        }
        // iOS: play a silent buffer inside the gesture to fully unlock output.
        try {
          const b = ctx.createBuffer(1, 1, ctx.sampleRate);
          const s = ctx.createBufferSource();
          s.buffer = b;
          s.connect(ctx.destination);
          s.start(0);
        } catch {
          /* ignore */
        }
      }
      resumeCtx();
    },

    setVolumes(sfx, music, muted) {
      // The game pushes volumes every second: only react to changes.
      if (ctx && core && sfx === vol.sfx && music === vol.music && muted === vol.muted) return;
      vol = { sfx, music, muted };
      if (!ctx || !core) return;
      core.setVolumes(sfx, music, muted, now());
      if (muteTimer) clearTimeout(muteTimer);
      muteTimer = null;
      if (muted) {
        // Real silence and no CPU: suspend once the fade-out is done.
        muteTimer = setTimeout(() => {
          if (ctx && vol.muted && ctx.state === 'running') ctx.suspend().catch(() => undefined);
          stopTimer();
        }, 250);
      } else {
        resumeCtx();
      }
    },

    setState(s) {
      state = { ...s };
      if (core && ctx) core.setState(state, now());
    },

    setIdle(v) {
      idle = v;
      if (core && ctx) core.setIdle(v, now());
    },

    suspend() {
      hidden = true;
      stopTimer();
      if (ctx && ctx.state === 'running') ctx.suspend().catch(() => undefined);
    },

    resume() {
      hidden = false;
      resumeCtx();
    },

    playUI(kind) {
      if (core && ctx && ctx.state === 'running') core.playUI(kind, ctx.currentTime);
    },

    setDishSize(w) {
      dishW = w;
      core?.setDishWidth(w);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      unsubs.forEach((u) => u());
      stopTimer();
      if (muteTimer) clearTimeout(muteTimer);
      if (core && ctx) core.dispose(ctx.currentTime);
      const c = ctx;
      const k = core;
      ctx = null;
      core = null;
      if (c) {
        setTimeout(() => {
          c.close()
            .catch(() => undefined)
            .finally(() => k?.disconnectAll());
        }, 60);
      }
    },
  };
  return engine;
}
