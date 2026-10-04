/**
 * Instruments of the score, written against BaseAudioContext so the same
 * code runs in realtime and in an OfflineAudioContext.
 *
 * Every envelope starts from 0 and ends on a tiny value before the source
 * stops (no clicks). Finished voices disconnect themselves from `onended`.
 * CPU: harmonic timbres use one PeriodicWave oscillator instead of several
 * sines, percussion shares persistent filters, and panning uses a small
 * cache of StereoPanners per destination instead of one per note.
 */
import { midiToFreq } from './theory';
import { glide, warmWaveCoefficients, type MixGraph } from './fx';
import type { Layer } from './intensity';

export interface NoiseBank {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
}

const EPS = 0.0001;

/** Peak gain per instrument at velocity 1 (the mix balance lives here). */
export const LEVELS = {
  pad: 0.019,
  pluck: 0.2,
  bell: 0.15,
  echo: 0.09,
  bass: 0.056,
  kick: 0.17,
  rim: 0.14,
  hat: 0.17,
  shaker: 0.13,
  glint: 0.13,
  sig: 0.14,
};

/**
 * A GainNode for envelopes whose intrinsic value is 0. (A fresh GainNode
 * has gain 1 until its first automation event; if a source starts on the
 * same frame, that first sample would pass at full gain — a click.)
 */
export function vca(ctx: BaseAudioContext): GainNode {
  const g = ctx.createGain();
  g.gain.value = 0;
  return g;
}

/** Disconnect `nodes` once `src` has stopped. */
export function autoDisconnect(src: AudioScheduledSourceNode, nodes: AudioNode[], done?: () => void): void {
  src.onended = () => {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    done?.();
  };
}

/** Max simultaneous notes per music layer (CPU cap). */
export const VOICE_CAP: Record<Layer, number> = { pad: 12, bass: 3, arp: 8, mel: 6, perc: 10, orn: 8 };

/** Explicit-amplitude periodic wave from sine harmonic amplitudes (index 1 = fundamental). */
function wave(ctx: BaseAudioContext, amps: number[]): PeriodicWave {
  const imag = new Float32Array(amps.length + 1);
  amps.forEach((a, i) => (imag[i + 1] = a));
  return ctx.createPeriodicWave(new Float32Array(amps.length + 1), imag, { disableNormalization: true });
}

export class Instruments {
  readonly ctx: BaseAudioContext;
  private panCache = new WeakMap<AudioNode, Map<number, AudioNode>>();
  private warm: PeriodicWave;
  private bassWave: PeriodicWave;
  private glintWave: PeriodicWave;
  private sigWave: PeriodicWave;
  private bellUpper: PeriodicWave;
  /** Persistent filters for the noise percussion. */
  private hatOut: BiquadFilterNode;
  private shakerOut: BiquadFilterNode;

  constructor(g: MixGraph, readonly noise: NoiseBank) {
    const ctx = g.ctx;
    this.ctx = ctx;
    const { real, imag } = warmWaveCoefficients();
    this.warm = ctx.createPeriodicWave(real, imag);
    this.bassWave = wave(ctx, [1, 0.3, 0.09]);
    this.glintWave = wave(ctx, [1, 0.18]);
    this.sigWave = wave(ctx, [1, 0, 0.1]);
    // Bell partials 2 and 3 (relative to the fundamental) in one oscillator.
    this.bellUpper = wave(ctx, [0, 0.36, 0.13]);
    this.hatOut = ctx.createBiquadFilter();
    this.hatOut.type = 'highpass';
    this.hatOut.frequency.value = 5200;
    this.hatOut.Q.value = 0.6;
    this.shakerOut = ctx.createBiquadFilter();
    this.shakerOut.type = 'bandpass';
    this.shakerOut.frequency.value = 7800;
    this.shakerOut.Q.value = 0.9;
    this.hatOut.connect(this.pan(g.layerIn.perc, -0.25));
    this.shakerOut.connect(this.pan(g.layerIn.perc, 0.3));
  }

  get warmWave(): PeriodicWave {
    return this.warm;
  }

  /** A cached StereoPanner (pan quantised to 0.1) feeding `dest`. */
  pan(dest: AudioNode, pan: number): AudioNode {
    const q = Math.max(-10, Math.min(10, Math.round(pan * 10)));
    if (q === 0) return dest;
    let m = this.panCache.get(dest);
    if (!m) {
      m = new Map();
      this.panCache.set(dest, m);
    }
    let node = m.get(q);
    if (!node) {
      if (typeof this.ctx.createStereoPanner === 'function') {
        const p = this.ctx.createStereoPanner();
        p.pan.value = q / 10;
        p.connect(dest);
        node = p;
      } else {
        node = dest; // very old browsers: no panning
      }
      m.set(q, node);
    }
    return node;
  }

  private osc(type: OscillatorType | PeriodicWave, freq: number, t: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type as OscillatorType;
    else o.setPeriodicWave(type);
    o.frequency.value = freq;
    o.frequency.setValueAtTime(freq, t);
    return o;
  }

  /**
   * Plucked arpeggio voice: 1:1 FM with a fast-decaying index (bright,
   * crisp attack mellowing into a soft tone), two-stage amplitude decay.
   */
  pluck(dest: AudioNode, t: number, midi: number, vel: number, short = false): number {
    const ctx = this.ctx;
    const f = midiToFreq(midi);
    const car = this.osc('sine', f, t);
    const mod = this.osc('sine', f, t);
    const modGain = ctx.createGain();
    modGain.gain.value = 0;
    const amp = vca(ctx);
    const bright = 0.7 + vel * 0.6;
    // Index: a bright 'pick' (≈5) collapsing to a soft body (≈1 → 0.15).
    modGain.gain.setValueAtTime(f * 4.6 * bright, t);
    modGain.gain.setTargetAtTime(f * 1.0 * bright, t, 0.018);
    modGain.gain.setTargetAtTime(f * 0.15, t + 0.07, 0.2);
    // The index is negligible after ~0.4 s: fade it out and stop the modulator early (CPU).
    const modEnd = t + 0.42;
    modGain.gain.setTargetAtTime(0, modEnd - 0.1, 0.02);
    const peak = LEVELS.pluck * vel;
    const len = Math.max(0.6, Math.min(1.4, 1.5 - (midi - 57) * 0.025)) * (short ? 0.62 : 1);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.003);
    amp.gain.exponentialRampToValueAtTime(peak * 0.42, t + 0.09);
    amp.gain.exponentialRampToValueAtTime(EPS, t + len);
    mod.connect(modGain).connect(car.frequency);
    car.connect(amp).connect(dest);
    car.start(t);
    mod.start(t);
    car.stop(t + len + 0.02);
    mod.stop(Math.min(modEnd, t + len + 0.02));
    autoDisconnect(car, [car, mod, modGain, amp]);
    return t + len;
  }

  /**
   * Glass bell: a long fundamental, partials 2+3 decaying faster (one
   * PeriodicWave oscillator), and a short inharmonic "tink" at 5.43×.
   * `soft` = the echo voice: rounder attack, no tink.
   */
  bell(dest: AudioNode, t: number, midi: number, vel: number, soft = false): number {
    const ctx = this.ctx;
    const f = midiToFreq(midi);
    const peak = (soft ? LEVELS.echo : LEVELS.bell) * vel;
    const attack = soft ? 0.012 : 0.003;
    const parts: { src: OscillatorType | PeriodicWave; r: number; a: number; d: number }[] = [
      { src: 'sine', r: 1, a: 1, d: soft ? 1.5 : 2.1 },
      { src: this.bellUpper, r: 1, a: soft ? 0.6 : 1, d: soft ? 0.7 : 1.0 },
    ];
    if (!soft && f * 5.43 < 15000) parts.push({ src: 'sine', r: 5.43, a: 0.12, d: 0.18 });
    const sum = ctx.createGain();
    sum.gain.value = peak;
    sum.connect(dest);
    const nodes: AudioNode[] = [sum];
    let last: OscillatorNode | null = null;
    let end = t;
    for (const p of parts) {
      const o = this.osc(p.src, f * p.r, t);
      const gn = vca(ctx);
      gn.gain.setValueAtTime(0, t);
      gn.gain.linearRampToValueAtTime(p.a, t + attack);
      // −60 dB at d, then stop.
      gn.gain.exponentialRampToValueAtTime(0.001 * p.a, t + attack + p.d);
      gn.gain.linearRampToValueAtTime(0, t + attack + p.d + 0.015);
      o.connect(gn).connect(sum);
      o.start(t);
      const stop = t + attack + p.d + 0.02;
      o.stop(stop);
      nodes.push(o, gn);
      if (stop >= end) {
        end = stop;
        last = o;
      }
    }
    if (last) autoDisconnect(last, nodes);
    return end;
  }

  /** Warm sub bass: one oscillator with soft 2nd/3rd harmonics (audible on phones). */
  bass(dest: AudioNode, t: number, midi: number, vel: number, dur: number): number {
    const ctx = this.ctx;
    const o = this.osc(this.bassWave, midiToFreq(midi), t);
    const amp = vca(ctx);
    const peak = LEVELS.bass * vel;
    const tEnd = t + Math.max(0.15, dur);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.018);
    amp.gain.setTargetAtTime(peak * 0.72, t + 0.02, 0.35);
    amp.gain.setTargetAtTime(0, tEnd, 0.07);
    o.connect(amp).connect(dest);
    const stop = tEnd + 0.5;
    o.start(t);
    o.stop(stop);
    autoDisconnect(o, [o, amp]);
    return stop;
  }

  private noiseSrc(buf: AudioBuffer, t: number, dur: number): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    const maxOff = Math.max(0, buf.duration - dur - 0.05);
    // Pseudo-random offset derived from the start time (reproducible renders).
    const off = maxOff > 0 ? (Math.abs(Math.sin(t * 12.9898) * 43758.5453) % 1) * maxOff : 0;
    s.start(t, off, dur + 0.02);
    return s;
  }

  /** Felt kick: soft-attack sine drop plus a muffled thump. */
  kick(dest: AudioNode, t: number, vel: number): number {
    const ctx = this.ctx;
    const o = this.osc('sine', 96, t);
    o.frequency.exponentialRampToValueAtTime(47, t + 0.1);
    const amp = vca(ctx);
    const peak = LEVELS.kick * vel;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.004);
    amp.gain.exponentialRampToValueAtTime(peak * 0.4, t + 0.12);
    amp.gain.exponentialRampToValueAtTime(EPS, t + 0.42);
    o.connect(amp).connect(dest);
    o.start(t);
    o.stop(t + 0.44);
    const n = this.noiseSrc(this.noise.pink, t, 0.05);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const ng = vca(ctx);
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.25 * peak, t + 0.003);
    ng.gain.exponentialRampToValueAtTime(EPS, t + 0.05);
    n.connect(lp).connect(ng).connect(dest);
    autoDisconnect(o, [o, amp, n, lp, ng]);
    return t + 0.44;
  }

  /** Soft rim/brush tap. */
  rim(dest: AudioNode, t: number, vel: number): number {
    const ctx = this.ctx;
    const n = this.noiseSrc(this.noise.white, t, 0.16);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2100;
    bp.Q.value = 1.1;
    const g = vca(ctx);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(LEVELS.rim * vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(EPS, t + 0.15);
    n.connect(bp).connect(g).connect(dest);
    autoDisconnect(n, [n, bp, g]);
    return t + 0.16;
  }

  /** Brushed hat (shared high-pass filter). */
  hat(t: number, vel: number): number {
    return this.noiseHit(this.hatOut, t, LEVELS.hat * vel, 0.007, 0.13);
  }

  /** Shaker (shared band-pass filter). */
  shaker(t: number, vel: number): number {
    return this.noiseHit(this.shakerOut, t, LEVELS.shaker * vel, 0.004, 0.06);
  }

  private noiseHit(dest: AudioNode, t: number, peak: number, attack: number, decay: number): number {
    const n = this.noiseSrc(this.noise.white, t, attack + decay);
    const g = vca(this.ctx);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(EPS, t + attack + decay);
    n.connect(g).connect(dest);
    autoDisconnect(n, [n, g]);
    return t + attack + decay;
  }

  /** High sparkle: fundamental + soft octave, quick decay. */
  glint(dest: AudioNode, t: number, midi: number, vel: number): number {
    return this.ping(dest, t, midi, LEVELS.glint * vel, this.glintWave, 0.002, 0.65);
  }

  /** Species signature: hollow glass (odd partial), longer ring. */
  sig(dest: AudioNode, t: number, midi: number, vel: number): number {
    return this.ping(dest, t, midi, LEVELS.sig * vel, this.sigWave, 0.004, 1.6);
  }

  private ping(dest: AudioNode, t: number, midi: number, peak: number, w: PeriodicWave, attack: number, decay: number): number {
    const o = this.osc(w, midiToFreq(midi), t);
    const amp = vca(this.ctx);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + attack);
    amp.gain.exponentialRampToValueAtTime(EPS, t + attack + decay);
    o.connect(amp).connect(dest);
    o.start(t);
    o.stop(t + attack + decay + 0.02);
    autoDisconnect(o, [o, amp]);
    return t + attack + decay + 0.02;
  }
}

// ───────────────────────────── Pad ─────────────────────────────

interface PadVoice {
  midi: number;
  oscs: OscillatorNode[];
  amp: GainNode;
  extra: GainNode;
}

/** Spread of the four pad voices across the stereo field (scaled by width). */
const PAD_SPREAD = [-0.8, -0.27, 0.27, 0.8];

/**
 * Persistent pad: four voices that hold common tones across chord changes
 * (true voice leading) and cross-fade only the voices that move. Shared
 * low-pass with a very slow LFO (0.05 Hz, as in the design doc).
 */
export class Pad {
  private voices: (PadVoice | null)[] = [null, null, null, null];
  private filter: BiquadFilterNode;
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private panners: StereoPannerNode[] = [];
  private outs: AudioNode[] = [];

  constructor(private inst: Instruments, dest: AudioNode, startTime: number) {
    const ctx = inst.ctx;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 650;
    this.filter.Q.value = 0.7;
    this.filter.connect(dest);
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 0.05;
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 110;
    this.lfo.connect(this.lfoGain).connect(this.filter.frequency);
    this.lfo.start(startTime);
    for (let i = 0; i < 4; i++) {
      if (typeof ctx.createStereoPanner === 'function') {
        const p = ctx.createStereoPanner();
        p.pan.value = PAD_SPREAD[i] * 0.35;
        p.connect(this.filter);
        this.panners.push(p);
        this.outs.push(p);
      } else {
        this.outs.push(this.filter);
      }
    }
  }

  get cutoff(): AudioParam {
    return this.filter.frequency;
  }
  get resonance(): AudioParam {
    return this.filter.Q;
  }

  setWidth(width: number, t: number): void {
    this.panners.forEach((p, i) => glide(p.pan, PAD_SPREAD[i] * width, t, 0.8));
  }

  /** Move to a new voicing at time t; unchanged notes keep sounding. */
  set(voicing: readonly number[], t: number, attack = 1.1): void {
    for (let i = 0; i < 4; i++) {
      const midi = voicing[i];
      const v = this.voices[i];
      if (v && v.midi === midi) continue;
      if (v) this.releaseVoice(v, t, 0.55);
      this.voices[i] = midi === undefined ? null : this.startVoice(i, midi, t, attack);
    }
  }

  /** Fade all voices out (extinction, dispose). */
  releaseAll(t: number, tau = 0.4): void {
    for (let i = 0; i < 4; i++) {
      const v = this.voices[i];
      if (v) this.releaseVoice(v, t, tau);
      this.voices[i] = null;
    }
  }

  private startVoice(i: number, midi: number, t: number, attack: number): PadVoice {
    const ctx = this.inst.ctx;
    const f = midiToFreq(midi);
    const amp = vca(ctx);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(LEVELS.pad, t + attack);
    amp.connect(this.outs[i]);
    // Two slightly detuned oscillators at unequal levels: a slow, gentle
    // chorus (≈1 Hz beating at A3) instead of a deep tremolo.
    const second = vca(ctx);
    second.gain.value = 0.55;
    second.connect(amp);
    const oscs = [-3, 4].map((cents, k) => {
      const o = ctx.createOscillator();
      o.setPeriodicWave(this.inst.warmWave);
      o.frequency.value = f;
      o.detune.value = cents;
      o.connect(k === 0 ? amp : second);
      o.start(t);
      return o;
    });
    return { midi, oscs, amp, extra: second };
  }

  private releaseVoice(v: PadVoice, t: number, tau: number): void {
    glide(v.amp.gain, 0, t, tau);
    const stop = t + tau * 9;
    v.oscs.forEach((o) => o.stop(stop));
    autoDisconnect(v.oscs[0], [...v.oscs, v.extra, v.amp]);
  }

  dispose(t: number): void {
    this.releaseAll(t, 0.05);
    try {
      this.lfo.stop(t + 0.5);
    } catch {
      /* ignore */
    }
  }
}
