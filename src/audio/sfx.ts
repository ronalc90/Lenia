/**
 * Sound effects (design doc §15), synthesised and tuned to the chord that
 * is sounding in the score at that moment, so they blend with the music.
 *
 * A small voice manager enforces the doc's mixing rules: at most 6
 * simultaneous effect voices (higher priority steals lower), a minimum
 * interval per effect (floods collapse into one sound), and per-call gain
 * (auto-seeder at −12 dB).
 */
import type { Chord } from './theory';
import { midiToFreq, nearestPitchWithPc, pitchesInRange, voiceLead } from './theory';
import { glide, type MixGraph, type SfxChannel } from './fx';
import { autoDisconnect, vca, type Instruments } from './synth';

const EPS = 0.0001;

export interface SfxEnv {
  ctx: BaseAudioContext;
  inst: Instruments;
  /** Chord sounding at the effect's start time. */
  chord: Chord;
  /** Voice output (connect everything here). */
  out: AudioNode;
  /** Extra integer parameter (e.g. consecutive purchase count). */
  n: number;
}

/** An effect: schedules nodes from time t, returns its end time. */
type SfxFn = (e: SfxEnv, t: number) => number;

export type SfxName =
  | 'seed'
  | 'seedDenied'
  | 'stable'
  | 'died'
  | 'exploded'
  | 'divided'
  | 'speciesNew'
  | 'speciesRare'
  | 'purchase'
  | 'genome'
  | 'goldenSpawn'
  | 'goldenCollected'
  | 'goldenMissed'
  | 'achievement'
  | 'journal'
  | 'extinction'
  | 'offline'
  | 'behavior'
  | 'income';

// ───────────────────────────── helpers ─────────────────────────────

function osc(ctx: BaseAudioContext, type: OscillatorType, f: number, t: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.frequency.setValueAtTime(f, t);
  return o;
}

/** Simple enveloped tone: attack, exponential decay; returns end time. */
function tone(e: SfxEnv, t: number, f: number, peak: number, decay: number, type: OscillatorType = 'sine', attack = 0.004, dest: AudioNode = e.out): number {
  const o = osc(e.ctx, type, f, t);
  const g = vca(e.ctx);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(EPS, t + attack + decay);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + attack + decay + 0.02);
  autoDisconnect(o, [o, g]);
  return t + attack + decay + 0.02;
}

function noise(e: SfxEnv, kind: 'white' | 'pink' | 'brown', t: number, dur: number): AudioBufferSourceNode {
  const s = e.ctx.createBufferSource();
  s.buffer = e.inst.noise[kind];
  s.start(t, 0.1 + ((t * 7.31) % 1) * Math.max(0, s.buffer.duration - dur - 0.2), dur + 0.02);
  return s;
}

/** Warm sustained note (pad-like) used by chord effects. */
function warmNote(e: SfxEnv, t: number, midi: number, peak: number, attack: number, hold: number, tau: number, dest: AudioNode): number {
  const o = e.ctx.createOscillator();
  o.setPeriodicWave(e.inst.warmWave);
  o.frequency.value = midiToFreq(midi);
  o.frequency.setValueAtTime(midiToFreq(midi), t);
  const g = vca(e.ctx);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(0, t + attack + hold, tau);
  o.connect(g).connect(dest);
  o.start(t);
  const end = t + attack + hold + tau * 7;
  o.stop(end);
  autoDisconnect(o, [o, g]);
  return end;
}

/** FM bell with the doc's 1:3.5 ratio (inharmonic, bell-like). */
function fmBell(e: SfxEnv, t: number, midi: number, peak: number, decay: number, dest: AudioNode = e.out): number {
  const f = midiToFreq(midi);
  const car = osc(e.ctx, 'sine', f, t);
  const mod = osc(e.ctx, 'sine', f * 3.5, t);
  const mg = e.ctx.createGain();
  mg.gain.value = 0;
  mg.gain.setValueAtTime(f * 3.2, t);
  mg.gain.setTargetAtTime(f * 0.25, t, decay * 0.25);
  const g = vca(e.ctx);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.002);
  g.gain.exponentialRampToValueAtTime(EPS, t + decay);
  mod.connect(mg).connect(car.frequency);
  car.connect(g).connect(dest);
  car.start(t);
  mod.start(t);
  car.stop(t + decay + 0.02);
  mod.stop(t + decay + 0.02);
  autoDisconnect(car, [car, mod, mg, g]);
  return t + decay + 0.02;
}

function lowpass(e: SfxEnv, f: number, q = 0.7, dest: AudioNode = e.out): BiquadFilterNode {
  const b = e.ctx.createBiquadFilter();
  b.type = 'lowpass';
  b.frequency.value = f;
  b.Q.value = q;
  b.connect(dest);
  return b;
}

/** Stable chord tones ascending from near `from`. */
function chordRun(c: Chord, from: number, count: number, pcs: readonly number[] = c.stable): number[] {
  const start = nearestPitchWithPc(from, pcs);
  return pitchesInRange(pcs, start, start + 36).slice(0, count);
}

// ───────────────────────────── effects ─────────────────────────────

const seed: SfxFn = (e, t) => {
  // Soft filtered noise puff + descending sine D5 → A3.
  const n = noise(e, 'white', t, 0.12);
  const bp = e.ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.3;
  bp.frequency.setValueAtTime(2600, t);
  bp.frequency.exponentialRampToValueAtTime(700, t + 0.11);
  const ng = vca(e.ctx);
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime(0.16, t + 0.004);
  ng.gain.exponentialRampToValueAtTime(EPS, t + 0.12);
  n.connect(bp).connect(ng).connect(e.out);
  autoDisconnect(n, [n, bp, ng]);
  const o = osc(e.ctx, 'sine', midiToFreq(74), t);
  o.frequency.exponentialRampToValueAtTime(midiToFreq(57), t + 0.12);
  const g = vca(e.ctx);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.16, t + 0.004);
  g.gain.exponentialRampToValueAtTime(EPS, t + 0.15);
  o.connect(g).connect(e.out);
  o.start(t);
  o.stop(t + 0.17);
  autoDisconnect(o, [o, g]);
  return t + 0.17;
};

const seedDenied: SfxFn = (e, t) => {
  // Two close sines beat at ~10 Hz: a soft "nope".
  for (const f of [293.66, 303.66]) {
    const o = osc(e.ctx, 'sine', f, t);
    const g = vca(e.ctx);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.075, t + 0.008);
    g.gain.setValueAtTime(0.075, t + 0.11);
    g.gain.exponentialRampToValueAtTime(EPS, t + 0.16);
    o.connect(g).connect(e.out);
    o.start(t);
    o.stop(t + 0.17);
    autoDisconnect(o, [o, g]);
  }
  return t + 0.17;
};

const stable: SfxFn = (e, t) => {
  // 3-note arpeggio of the current chord, triangle.
  const notes = chordRun(e.chord, 74, 3, e.chord.tones.slice(0, 3));
  let end = t;
  notes.forEach((m, i) => (end = Math.max(end, tone(e, t + i * 0.075, midiToFreq(m), 0.09, 0.34, 'triangle', 0.004))));
  return end;
};

const died: SfxFn = (e, t) => {
  // Sine falling an octave from the chord's fifth + fading pink noise.
  const f0 = midiToFreq(nearestPitchWithPc(69, [e.chord.fifth]));
  const o = osc(e.ctx, 'sine', f0, t);
  o.frequency.exponentialRampToValueAtTime(f0 / 2, t + 0.3);
  const g = vca(e.ctx);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.1, t + 0.006);
  g.gain.exponentialRampToValueAtTime(EPS, t + 0.32);
  o.connect(g).connect(e.out);
  o.start(t);
  o.stop(t + 0.34);
  autoDisconnect(o, [o, g]);
  const n = noise(e, 'pink', t, 0.3);
  const lp = e.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1600;
  const ng = vca(e.ctx);
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime(0.05, t + 0.01);
  ng.gain.exponentialRampToValueAtTime(EPS, t + 0.3);
  n.connect(lp).connect(ng).connect(e.out);
  autoDisconnect(n, [n, lp, ng]);
  return t + 0.34;
};

const exploded: SfxFn = (e, t) => {
  // Brown noise, low-pass opening then closing; no tone.
  const n = noise(e, 'brown', t, 0.5);
  const lp = e.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.8;
  lp.frequency.setValueAtTime(150, t);
  lp.frequency.exponentialRampToValueAtTime(2400, t + 0.22);
  lp.frequency.exponentialRampToValueAtTime(300, t + 0.5);
  const g = vca(e.ctx);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.42, t + 0.015);
  g.gain.exponentialRampToValueAtTime(EPS, t + 0.5);
  n.connect(lp).connect(g).connect(e.out);
  autoDisconnect(n, [n, lp, g]);
  return t + 0.52;
};

const divided: SfxFn = (e, t) => {
  const r = nearestPitchWithPc(76, [e.chord.root]);
  const f5 = nearestPitchWithPc(r + 7, [e.chord.fifth]);
  e.inst.pluck(e.out, t, r, 0.55);
  return e.inst.pluck(e.out, t + 0.07, f5, 0.5);
};

function speciesChord(e: SfxEnv, t: number, octave: number, long: boolean): number {
  const voicing = voiceLead(null, e.chord.tones.slice(0, 4), 60 + octave, 79 + octave, 69 + octave);
  const lp = lowpass(e, 2600);
  let end = t;
  for (const m of voicing) end = Math.max(end, warmNote(e, t, m, 0.04, 0.25, long ? 0.75 : 0.45, long ? 0.3 : 0.2, lp));
  const top = nearestPitchWithPc(86 + octave, [e.chord.root]);
  end = Math.max(end, fmBell(e, t + 0.05, top, 0.085, long ? 1.8 : 1.2));
  if (long) end = Math.max(end, fmBell(e, t + 0.2, nearestPitchWithPc(top + 7, [e.chord.fifth]), 0.06, 1.5));
  return end;
}

const speciesNew: SfxFn = (e, t) => speciesChord(e, t, 0, false);
const speciesRare: SfxFn = (e, t) => speciesChord(e, t, 12, true);

/** A5 = 880 Hz, rising one D-dorian step per consecutive purchase. */
export const PURCHASE_STEPS = [81, 83, 84, 86, 88, 89, 91, 93];

const purchase: SfxFn = (e, t) => {
  // 2 ms square click + short sine.
  const c = osc(e.ctx, 'square', 1250, t);
  const cg = vca(e.ctx);
  cg.gain.setValueAtTime(0, t);
  cg.gain.linearRampToValueAtTime(0.05, t + 0.0005);
  cg.gain.linearRampToValueAtTime(0, t + 0.0025);
  c.connect(cg).connect(e.out);
  c.start(t);
  c.stop(t + 0.004);
  autoDisconnect(c, [c, cg]);
  const m = PURCHASE_STEPS[Math.min(PURCHASE_STEPS.length - 1, e.n)];
  tone(e, t, midiToFreq(m), 0.1, 0.085, 'sine', 0.003);
  return tone(e, t, midiToFreq(m) * 2, 0.018, 0.05, 'sine', 0.003);
};

const genome: SfxFn = (e, t) => {
  tone(e, t, midiToFreq(74), 0.08, 0.32, 'sine', 0.005);
  return tone(e, t + 0.06, midiToFreq(81), 0.07, 0.36, 'sine', 0.005);
};

const goldenSpawn: SfxFn = (e, t) => {
  // Shimmer: staggered high chord tones under a gentle tremolo.
  const sum = e.ctx.createGain();
  sum.gain.value = 0.6;
  const lfo = osc(e.ctx, 'sine', 8.5, t);
  const lg = e.ctx.createGain();
  lg.gain.value = 0.35;
  lfo.connect(lg).connect(sum.gain);
  sum.connect(e.out);
  const notes = chordRun(e.chord, 86, 5);
  let end = t;
  notes.forEach((m, i) => {
    const ts = t + i * 0.07;
    const o = osc(e.ctx, 'sine', midiToFreq(m), ts);
    const g = vca(e.ctx);
    g.gain.setValueAtTime(0, ts);
    g.gain.linearRampToValueAtTime(0.035, ts + 0.25);
    g.gain.exponentialRampToValueAtTime(EPS, ts + 1.3);
    o.connect(g).connect(sum);
    o.start(ts);
    o.stop(ts + 1.32);
    autoDisconnect(o, [o, g]);
    end = Math.max(end, ts + 1.32);
  });
  lfo.start(t);
  lfo.stop(end);
  autoDisconnect(lfo, [lfo, lg, sum]);
  return end;
};

const goldenCollected: SfxFn = (e, t) => {
  // Bright ascending cascade of chord tones.
  const notes = chordRun(e.chord, 77, 8);
  let end = t;
  notes.forEach((m, i) => (end = Math.max(end, e.inst.bell(e.out, t + i * 0.055, m, 0.55 + i * 0.05))));
  end = Math.max(end, e.inst.glint(e.out, t + notes.length * 0.055 + 0.05, (notes[notes.length - 1] ?? 93) + 12, 0.9));
  return end;
};

const goldenMissed: SfxFn = (e, t) => {
  const [a, b] = chordRun(e.chord, 74, 2);
  tone(e, t, midiToFreq(b ?? 77), 0.04, 0.35);
  return tone(e, t + 0.16, midiToFreq(a ?? 74), 0.035, 0.45);
};

const achievement: SfxFn = (e, t) => {
  // Short fanfare motif: three pickups into the octave, over a soft chord.
  const run = chordRun(e.chord, 69, 3);
  const motif = [...run, run[0] + 12];
  const times = [0, 0.11, 0.22, 0.36];
  let end = t;
  motif.forEach((m, i) => {
    e.inst.pluck(e.out, t + times[i], m, i === 3 ? 0.8 : 0.6);
    end = Math.max(end, e.inst.bell(e.out, t + times[i], m + 12, i === 3 ? 0.75 : 0.45));
  });
  const lp = lowpass(e, 2200);
  for (const m of voiceLead(null, e.chord.tones.slice(0, 3), 57, 72, 64)) end = Math.max(end, warmNote(e, t + 0.3, m, 0.03, 0.12, 0.4, 0.25, lp));
  return end;
};

const journal: SfxFn = (e, t) => {
  const n = noise(e, 'white', t, 0.07);
  const bp = e.ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(1200, t);
  bp.frequency.exponentialRampToValueAtTime(3500, t + 0.06);
  const g = vca(e.ctx);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.09, t + 0.006);
  g.gain.exponentialRampToValueAtTime(EPS, t + 0.07);
  n.connect(bp).connect(g).connect(e.out);
  autoDisconnect(n, [n, bp, g]);
  return t + 0.08;
};

/** Extinction: rising noise swell for 3 s, cut to silence, then a single low bell. */
export const EXTINCTION_SWEEP = 3;
export const EXTINCTION_NOTE_AT = 3.6;

const extinction: SfxFn = (e, t) => {
  const n = noise(e, 'white', t, EXTINCTION_SWEEP + 0.1);
  const bp = e.ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 2.2;
  bp.frequency.setValueAtTime(250, t);
  bp.frequency.exponentialRampToValueAtTime(5200, t + EXTINCTION_SWEEP);
  const g = vca(e.ctx);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.07, t + EXTINCTION_SWEEP - 0.05);
  g.gain.setTargetAtTime(0, t + EXTINCTION_SWEEP, 0.015);
  n.connect(bp).connect(g).connect(e.out);
  autoDisconnect(n, [n, bp, g]);
  const tn = t + EXTINCTION_NOTE_AT;
  tone(e, tn, midiToFreq(50), 0.07, 2.4, 'sine', 0.01);
  return e.inst.bell(e.out, tn, 62, 1);
};

const offline: SfxFn = (e, t) => {
  // Warm Dm9 swell: welcome back.
  const lp = lowpass(e, 1800);
  let end = t;
  for (const m of [50, 57, 64, 65, 72]) end = Math.max(end, warmNote(e, t, m, 0.03, 0.6, 0.8, 0.35, lp));
  end = Math.max(end, e.inst.bell(e.out, t + 0.45, 81, 0.5));
  return end;
};

const behavior: SfxFn = (e, t) => {
  // A curious rising interval.
  const a = nearestPitchWithPc(76, e.chord.stable);
  const b = pitchesInRange(e.chord.stable, a + 5, a + 8)[0] ?? a + 7;
  e.inst.bell(e.out, t, a, 0.5);
  return e.inst.bell(e.out, t + 0.19, b, 0.6);
};

const income: SfxFn = (e, t) => {
  const m = nearestPitchWithPc(88, e.chord.stable);
  return e.inst.glint(e.out, t, m, 0.35);
};

export interface SfxDef {
  fn: SfxFn;
  channel: SfxChannel;
  /** Higher steals lower when all 6 voices are busy. */
  priority: number;
  /** Minimum seconds between two triggers. */
  minInterval: number;
  gain: number;
}

export const SFX: Record<SfxName, SfxDef> = {
  seed: { fn: seed, channel: 'dry', priority: 4, minInterval: 0.07, gain: 1.2 },
  seedDenied: { fn: seedDenied, channel: 'dry', priority: 4, minInterval: 0.15, gain: 0.8 },
  stable: { fn: stable, channel: 'room', priority: 4, minInterval: 0.25, gain: 1.4 },
  died: { fn: died, channel: 'room', priority: 3, minInterval: 0.25, gain: 1 },
  exploded: { fn: exploded, channel: 'room', priority: 3, minInterval: 0.4, gain: 1 },
  divided: { fn: divided, channel: 'room', priority: 3, minInterval: 0.3, gain: 1 },
  speciesNew: { fn: speciesNew, channel: 'room', priority: 8, minInterval: 0.5, gain: 1 },
  speciesRare: { fn: speciesRare, channel: 'echo', priority: 9, minInterval: 0.5, gain: 1 },
  purchase: { fn: purchase, channel: 'dry', priority: 5, minInterval: 0.06, gain: 2.0 },
  genome: { fn: genome, channel: 'room', priority: 5, minInterval: 0.1, gain: 1.5 },
  goldenSpawn: { fn: goldenSpawn, channel: 'echo', priority: 6, minInterval: 0.5, gain: 1.2 },
  goldenCollected: { fn: goldenCollected, channel: 'echo', priority: 7, minInterval: 0.5, gain: 0.45 },
  goldenMissed: { fn: goldenMissed, channel: 'room', priority: 2, minInterval: 1, gain: 1 },
  achievement: { fn: achievement, channel: 'room', priority: 7, minInterval: 0.8, gain: 0.75 },
  journal: { fn: journal, channel: 'dry', priority: 2, minInterval: 0.3, gain: 3.0 },
  extinction: { fn: extinction, channel: 'room', priority: 10, minInterval: 5, gain: 1 },
  offline: { fn: offline, channel: 'room', priority: 6, minInterval: 2, gain: 1 },
  behavior: { fn: behavior, channel: 'echo', priority: 5, minInterval: 0.6, gain: 1 },
  income: { fn: income, channel: 'echo', priority: 0, minInterval: 4, gain: 0.5 },
};

export const MAX_SFX_VOICES = 6;

interface Voice {
  end: number;
  priority: number;
  gain: GainNode;
}

/** Plays effects through the sfx strip with voice limiting and rate limiting. */
export class SfxPlayer {
  private voices: Voice[] = [];
  private last = new Map<string, number>();
  private silent: AudioBuffer;
  private purchaseRun = 0;
  private lastPurchase = -Infinity;
  /** Counters for tests / debugging. */
  readonly stats = { played: 0, dropped: 0, stolen: 0 };

  constructor(
    private g: MixGraph,
    private inst: Instruments,
    private chordAt: (t: number) => Chord,
  ) {
    this.silent = g.ctx.createBuffer(1, 128, g.ctx.sampleRate);
  }

  activeVoices(t: number): number {
    return this.voices.filter((v) => v.end > t).length;
  }

  /**
   * Trigger an effect at time t. `key` groups rate limiting (defaults to
   * the effect name). Returns false when dropped.
   */
  play(name: SfxName, t: number, opts: { gain?: number; pan?: number; key?: string; minInterval?: number } = {}): boolean {
    const def = SFX[name];
    const key = opts.key ?? name;
    const lastT = this.last.get(key) ?? -Infinity;
    if (t - lastT < (opts.minInterval ?? def.minInterval)) {
      this.stats.dropped++;
      return false;
    }
    this.voices = this.voices.filter((v) => v.end > t);
    if (this.voices.length >= MAX_SFX_VOICES) {
      let victim: Voice | null = null;
      for (const v of this.voices) if (!victim || v.priority < victim.priority || (v.priority === victim.priority && v.end < victim.end)) victim = v;
      if (!victim || victim.priority >= def.priority) {
        this.stats.dropped++;
        return false;
      }
      glide(victim.gain.gain, 0, t, 0.012);
      victim.end = t;
      this.voices = this.voices.filter((v) => v !== victim);
      this.stats.stolen++;
    }
    this.last.set(key, t);
    let n = 0;
    if (name === 'purchase') {
      this.purchaseRun = t - this.lastPurchase < 1.2 ? this.purchaseRun + 1 : 0;
      this.lastPurchase = t;
      n = this.purchaseRun;
    }
    const ctx = this.g.ctx;
    const vg = ctx.createGain();
    vg.gain.value = def.gain * (opts.gain ?? 1);
    vg.connect(this.inst.pan(this.g.sfxIn[def.channel], opts.pan ?? 0));
    const end = def.fn({ ctx, inst: this.inst, chord: this.chordAt(t), out: vg, n }, t);
    // A silent looping source acts as a timer that disconnects the voice gain when done.
    const timer = ctx.createBufferSource();
    timer.buffer = this.silent;
    timer.loop = true;
    timer.connect(vg);
    timer.start(t);
    timer.stop(end + 0.1);
    autoDisconnect(timer, [timer, vg]);
    this.voices.push({ end, priority: def.priority, gain: vg });
    this.stats.played++;
    return true;
  }
}

// ───────────────────────────── Calibrator slider ─────────────────────────────

/** Map μ (≈0.08..0.40) to 200..800 Hz on a log scale. */
export function sliderFreq(mu: number): number {
  const x = Math.max(0, Math.min(1, (mu - 0.08) / 0.32));
  return 200 * Math.pow(4, x);
}

/** Continuous sine following μ while the slider moves; fades 0.25 s after the last change. */
export class SliderTone {
  private o: OscillatorNode | null = null;
  private g: GainNode | null = null;
  private stopAt = 0;

  constructor(private dest: AudioNode, private ctx: BaseAudioContext) {}

  update(mu: number, t: number): void {
    const f = sliderFreq(mu);
    if (!this.o || !this.g) {
      // Intrinsic values (not events): the glides below cancel events at t.
      this.o = this.ctx.createOscillator();
      this.o.type = 'sine';
      this.o.frequency.value = f;
      this.g = vca(this.ctx);
      this.o.connect(this.g).connect(this.dest);
      this.o.start(t);
    }
    glide(this.o.frequency, f, t, 0.04);
    glide(this.g.gain, 0.045, t, 0.02);
    this.g.gain.setTargetAtTime(0, t + 0.25, 0.05);
    this.stopAt = t + 0.25 + 0.6;
  }

  /** Called periodically: stop the oscillator once faded. */
  tick(now: number): void {
    if (this.o && this.g && now >= this.stopAt) {
      const o = this.o;
      o.stop(this.stopAt + 0.02);
      autoDisconnect(o, [o, this.g]);
      this.o = null;
      this.g = null;
    }
  }
}
