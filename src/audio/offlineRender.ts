/**
 * Offline rendering of the real engine (same graph, same scheduler) into an
 * OfflineAudioContext, for automated checks and preview WAVs.
 *
 * Used by tests/e2e/audio-test.html (loaded by tests/e2e/audio-render.mjs
 * through Vite in headless Chromium). Not imported by the game.
 */
import type { GameEvents } from '../core/bus';
import { analyze, encodeWav16, type Analysis, type Section } from './analysis';
import { AudioCore } from './engine';
import type { MusicState } from './intensity';
import { SECONDS_PER_BAR } from './progression';

export interface TimedState {
  t: number;
  state: MusicState;
}

export interface TimedEvent<K extends keyof GameEvents = keyof GameEvents> {
  t: number;
  type: K;
  payload: GameEvents[K];
}

export interface RenderScript {
  name: string;
  duration: number;
  sampleRate?: number;
  states: TimedState[];
  events: TimedEvent[];
  sections: Section[];
  idle?: { t: number; idle: boolean }[];
  /** Test hook: adjust the engine before scheduling (e.g. solo a layer). */
  setup?: (core: AudioCore) => void;
}

export interface RenderResult {
  name: string;
  sampleRate: number;
  channels: Float32Array[];
  analysis: Analysis;
  sfxStats: { played: number; dropped: number; stolen: number };
  /** Intensity level of each planned bar. */
  levels: number[];
  renderMs: number;
}

/** First bar starts here in every script. */
export const START = 0.05;
export const barStart = (k: number) => START + k * SECONDS_PER_BAR;

const S = (eps: number, species: number, creatures: number, behaviors = 0, era = 1, extra: Partial<MusicState> = {}): MusicState => ({
  eps,
  species,
  creatures,
  era,
  behaviors,
  paused: false,
  ...extra,
});

function ev<K extends keyof GameEvents>(t: number, type: K, payload: GameEvents[K]): TimedEvent {
  return { t, type, payload } as unknown as TimedEvent;
}

/**
 * Intensity sweep 0 → 5 (two bars per level, the top level four bars) with
 * a burst of every SFX (including floods that must be rate limited) near the end.
 */
export function previewScript(): RenderScript {
  const states: TimedState[] = [
    { t: 0, state: S(0, 0, 0) },
    { t: barStart(2) - 1, state: S(1, 1, 1) },
    { t: barStart(4) - 1, state: S(3.5, 2, 3, 1) },
    { t: barStart(6) - 1, state: S(12, 3, 4, 2) },
    { t: barStart(8) - 1, state: S(45, 5, 6, 3) },
    { t: barStart(10) - 1, state: S(300, 7, 8, 4) },
  ];
  const events: TimedEvent[] = [];
  const b0 = barStart(11) + 0.4; // burst starts inside level 5
  // Manual seeds and an auto-seeder flood.
  [0, 0.35, 0.7].forEach((d, i) => events.push(ev(b0 + d, 'seed', { x: 40 + i * 50, y: 100, cost: 5, manual: true })));
  for (let i = 0; i < 12; i++) events.push(ev(b0 + 0.1 + i * 0.08, 'seed', { x: (i * 37) % 192, y: 50, cost: 5, manual: false }));
  events.push(ev(b0 + 1.0, 'seedDenied', { x: 90, y: 90, cost: 9 }));
  events.push(ev(b0 + 1.3, 'creatureStable', { id: 1, x: 60, y: 60 }));
  events.push(ev(b0 + 1.6, 'creatureDied', { id: 2, x: 150, y: 60 }));
  events.push(ev(b0 + 1.9, 'creatureExploded', { id: 3, x: 30, y: 160 }));
  events.push(ev(b0 + 2.2, 'creatureDivided', { parentId: 1, x: 100, y: 100 }));
  events.push(ev(b0 + 2.5, 'speciesNew', { speciesId: 'orbium', name: 'Orbium', rarity: 'common', x: 96, y: 120 }));
  for (let i = 0; i < 4; i++) events.push(ev(b0 + 3.3 + i * 0.18, 'upgradeBought', { id: 'gotero', level: i + 1 }));
  events.push(ev(b0 + 4.2, 'speciesNew', { speciesId: 'scutium', name: 'Scutium', rarity: 'rare', x: 40, y: 120 }));
  events.push(ev(b0 + 5.2, 'goldenSpawn', { x: 170, y: 40 }));
  events.push(ev(b0 + 6.3, 'goldenCollected', { x: 160, y: 50, reward: { es: 'Floración', en: 'Bloom' } }));
  events.push(ev(b0 + 7.2, 'achievement', { id: 'first', name: { es: 'Primera', en: 'First' } }));
  events.push(ev(b0 + 8.2, 'journalNew', { id: 'j1', text: { es: '...', en: '...' } }));
  events.push(ev(b0 + 8.5, 'behaviorNew', { behavior: 'swimmer', x: 100, y: 100 }));
  events.push(ev(b0 + 8.9, 'genomeBought', { id: 'g1' }));
  // Income flood: 40 events in 4 s → at most one soft tick.
  for (let i = 0; i < 40; i++) events.push(ev(b0 + 0.05 + i * 0.1, 'income', { id: i % 6, x: (i * 23) % 192, y: 80, amount: 1.2 }));
  // Calibrator drag.
  for (let i = 0; i < 12; i++) events.push(ev(b0 + 9.4 + i * 0.05, 'calibrationChanged', { mu: 0.15 + i * 0.005, sigma: 0.015, R: 13, dt: 0.1 }));
  events.push(ev(b0 + 10.6, 'offlineReturn', { seconds: 3600, essence: 18000 }));
  events.push(ev(b0 + 11.4, 'goldenMissed', {}));
  events.sort((a, b) => a.t - b.t);
  const duration = Math.ceil((b0 + 13.5) * 10) / 10;
  const sections: Section[] = [
    { name: 'L0 pad', start: barStart(0) + 1.6, end: barStart(2), expectSound: true, rmsRange: [-42, -22] },
    { name: 'L1 +bass', start: barStart(2) + 0.3, end: barStart(4), expectSound: true, rmsRange: [-38, -18] },
    { name: 'L2 +arp', start: barStart(4) + 0.3, end: barStart(6), expectSound: true, rmsRange: [-36, -16] },
    { name: 'L3 +melody', start: barStart(6) + 0.3, end: barStart(8), expectSound: true, rmsRange: [-34, -14] },
    { name: 'L4 +perc', start: barStart(8) + 0.3, end: barStart(10), expectSound: true, rmsRange: [-32, -13] },
    { name: 'L5 full', start: barStart(10) + 0.3, end: b0, expectSound: true, rmsRange: [-30, -12] },
    { name: 'L5 + SFX burst', start: b0, end: b0 + 11.5, expectSound: true, rmsRange: [-30, -11] },
    { name: 'tail', start: b0 + 11.5, end: duration, expectSound: true, rmsRange: [-32, -12] },
  ];
  return { name: 'preview', duration, states, events, sections };
}

/**
 * Extinction exactly as the game emits it (start, calibration reset and
 * done in the same tick): the music keeps playing through a 3 s filter
 * sweep, cuts to silence, a single note rings, then the new era re-enters.
 */
export function extinctionScript(): RenderScript {
  const tx = barStart(5) + 1.0;
  const states: TimedState[] = [
    { t: 0, state: S(12, 3, 4, 2) },
    { t: tx + 0.5, state: S(0, 0, 0, 0, 2) },
    { t: tx + 14, state: S(1, 1, 1, 0, 2) },
  ];
  const events: TimedEvent[] = [
    ev(tx, 'extinctionStart', { genome: 3 }),
    ev(tx, 'calibrationChanged', { mu: 0.15, sigma: 0.015, R: 13, dt: 0.1 }),
    ev(tx, 'extinctionDone', { era: 2, genome: 3 }),
  ];
  const cut = tx + 3;
  const reentry = barStart(Math.ceil((cut + 5.1 - START) / SECONDS_PER_BAR));
  const sections: Section[] = [
    { name: 'before', start: barStart(3), end: tx, expectSound: true, rmsRange: [-36, -14] },
    { name: 'sweep', start: tx + 0.2, end: cut - 0.05, expectSound: true, rmsRange: [-34, -12] },
    { name: 'cut (silence)', start: cut + 0.25, end: cut + 0.55, expectSound: false, rmsRange: [-200, -50] },
    { name: 'single note', start: cut + 0.62, end: cut + 2.5, expectSound: true, rmsRange: [-48, -16] },
    { name: 'new era', start: reentry + 1.5, end: tx + 18, expectSound: true, rmsRange: [-45, -20] },
  ];
  return { name: 'extinction', duration: tx + 18, states, events, sections };
}

/** Pause duck + idle + mute checks on a short script. */
export function controlsScript(): RenderScript {
  const states: TimedState[] = [
    { t: 0, state: S(45, 5, 6, 3) },
    { t: barStart(4), state: S(45, 5, 6, 3, 1, { paused: true }) },
    { t: barStart(6), state: S(45, 5, 6, 3) },
  ];
  const sections: Section[] = [
    { name: 'playing', start: barStart(3), end: barStart(4), expectSound: true },
    { name: 'paused (ducked)', start: barStart(4) + 1, end: barStart(6), expectSound: true },
    { name: 'resumed', start: barStart(6) + 1.5, end: barStart(8), expectSound: true },
  ];
  return { name: 'controls', duration: barStart(8), states, events: [], sections };
}

/** One full A A B A form (32 bars ≈ 101 s) at a busy dish, for listening. */
export function formScript(): RenderScript {
  const duration = barStart(34);
  return {
    name: 'form',
    duration,
    states: [{ t: 0, state: S(60, 6, 7, 3) }, { t: barStart(12), state: S(400, 8, 9, 5) }],
    events: [
      ev(barStart(6) + 0.3, 'speciesNew', { speciesId: 'gyrorbium', name: 'Gyrorbium', rarity: 'uncommon', x: 60, y: 60 }),
      ev(barStart(20) + 0.7, 'speciesNew', { speciesId: 'hydrogeminium', name: 'Hydrogeminium', rarity: 'veryRare', x: 150, y: 90 }),
    ],
    sections: [{ name: 'form', start: barStart(4), end: duration, expectSound: true, rmsRange: [-30, -12] }],
  };
}

export async function renderScript(script: RenderScript): Promise<RenderResult> {
  const sr = script.sampleRate ?? 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(script.duration * sr), sr);
  const core = new AudioCore(ctx, { lookahead: 0.3 });
  core.setVolumes(1, 1, false, 0);
  script.setup?.(core);
  core.start(START);
  const levels: number[] = [];
  let si = 0;
  let ei = 0;
  let ii = 0;
  const idle = script.idle ?? [];
  // Emulate realtime operation: the render pauses every 50 ms (suspend), the
  // engine receives due events/state at the current time and schedules its
  // lookahead, then rendering resumes. Nodes are thus created just in time
  // and disconnected from onended during the render, as in the live game.
  const step = 0.05;
  let lastBar = -1;
  const advance = (now: number) => {
    while (si < script.states.length && script.states[si].t <= now + 1e-9) core.setState(script.states[si++].state, now);
    while (ii < idle.length && idle[ii].t <= now + 1e-9) core.setIdle(idle[ii++].idle, now);
    while (ei < script.events.length && script.events[ei].t <= now + 1e-9) {
      const e = script.events[ei++];
      core.handle(e.type, e.payload as never, now);
    }
    core.tick(now);
    const b = core.barAt(now + 0.3);
    if (b !== lastBar) {
      lastBar = b;
      levels.push(core.currentLevel);
    }
  };
  advance(0);
  const scheduleSuspend = (k: number) => {
    const ts = k * step;
    if (ts >= script.duration - step) return;
    ctx.suspend(ts).then(() => {
      advance(ctx.currentTime);
      scheduleSuspend(k + 1);
      ctx.resume();
    });
  };
  scheduleSuspend(1);
  const t0 = performance.now();
  const buf = await ctx.startRendering();
  const renderMs = Math.round(performance.now() - t0);
  const channels = [buf.getChannelData(0), buf.getChannelData(1)];
  const analysis = analyze(channels, sr, script.sections);
  core.disconnectAll();
  return { name: script.name, sampleRate: sr, channels, analysis, sfxStats: { ...core.sfx.stats }, levels, renderMs };
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

/** Entry point for the browser test page. */
export async function runForTest(name: 'preview' | 'extinction' | 'controls' | 'form', withWav: boolean) {
  const scripts = { preview: previewScript, extinction: extinctionScript, controls: controlsScript, form: formScript };
  const script = scripts[name]();
  const r = await renderScript(script);
  return {
    name: r.name,
    analysis: r.analysis,
    sfxStats: r.sfxStats,
    levels: r.levels,
    renderMs: r.renderMs,
    wav: withWav ? toBase64(encodeWav16(r.channels, r.sampleRate)) : null,
  };
}
