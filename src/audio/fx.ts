/**
 * The fixed mixing graph, built once on any BaseAudioContext (realtime or
 * offline):
 *
 *   music layers ─┬─ dry ─┐                            ┌─ glue comp ─┐
 *   (pad, bass,   ├─ rev ─┼─ music strip (LP, HP, vol) ─┤             │
 *    arp, mel,    └─ del ─┘                            ├─ reverb ────┼─ master ─ limiter ─ trim ─ out
 *    perc, orn)                                        │             │
 *   sfx channels ── dry/rev/del ── sfx strip (vol) ────┴─ ping-pong ─┘
 *
 * Reverb is a ConvolverNode with a generated, dark, long impulse response;
 * the ping-pong delay is tempo-synced. All gain changes are ramped.
 */
import type { Layer } from './intensity';
import { LAYERS } from './intensity';
import { mulberry32 } from './motifs';

// ───────────────────────────── Pure DSP helpers ─────────────────────────────

export interface ReverbOptions {
  seconds: number;
  /** Time for the tail to fall 60 dB. */
  rt60: number;
  predelay: number;
  /** One-pole damping cutoff at the start and end of the tail (Hz). */
  brightHz: number;
  darkHz: number;
  seed?: number;
}

export const DEFAULT_REVERB: ReverbOptions = { seconds: 3.6, rt60: 3.2, predelay: 0.018, brightHz: 5200, darkHz: 900, seed: 7 };

/**
 * Stereo impulse response: decorrelated noise × exponential decay, with a
 * one-pole low-pass that gets darker along the tail, a few early reflections,
 * normalised to unit energy per channel.
 */
export function makeReverbIR(sampleRate: number, o: ReverbOptions = DEFAULT_REVERB): [Float32Array, Float32Array] {
  const len = Math.max(1, Math.floor(o.seconds * sampleRate));
  const pre = Math.floor(o.predelay * sampleRate);
  const out: [Float32Array, Float32Array] = [new Float32Array(len), new Float32Array(len)];
  for (let ch = 0; ch < 2; ch++) {
    const rng = mulberry32((o.seed ?? 7) * 7919 + ch * 104729);
    const data = out[ch];
    let y = 0;
    let a = 0;
    const fade = Math.floor(0.006 * sampleRate);
    // Exponential decay as a running product; damping updated every 32 samples (cheap on phones).
    const decay = Math.exp(-6.907755 / (o.rt60 * sampleRate));
    let env = 1;
    for (let i = pre; i < len; i++) {
      if ((i - pre) % 32 === 0) {
        const t = (i - pre) / sampleRate;
        const fc = o.brightHz * Math.pow(o.darkHz / o.brightHz, Math.min(1, t / o.rt60));
        a = Math.exp((-2 * Math.PI * fc) / sampleRate);
      }
      y = (1 - a) * (rng() * 2 - 1) + a * y;
      data[i] = y * env * Math.min(1, (i - pre) / fade);
      env *= decay;
    }
    // Early reflections: sparse taps, different per channel for width.
    const taps = ch === 0 ? [0.011, 0.019, 0.029, 0.041] : [0.013, 0.023, 0.033, 0.047];
    taps.forEach((tt, k) => {
      const idx = pre + Math.floor(tt * sampleRate);
      if (idx < len) data[idx] += (0.5 / (k + 1)) * (ch === 0 ? 1 : -1) * 0.25;
    });
    // Smooth tail end to avoid a truncation step.
    const tailFade = Math.floor(0.08 * sampleRate);
    for (let i = Math.max(0, len - tailFade); i < len; i++) data[i] *= (len - i) / tailFade;
  }
  for (const data of out) {
    let e = 0;
    for (let i = 0; i < data.length; i++) e += data[i] * data[i];
    const g = e > 0 ? 1 / Math.sqrt(e) : 0;
    for (let i = 0; i < data.length; i++) data[i] *= g;
  }
  return out;
}

/** Seeded noise buffers: white, pink (Paul Kellet's filter) and brown. */
export function makeNoise(kind: 'white' | 'pink' | 'brown', length: number, seed = 1): Float32Array {
  const rng = mulberry32(seed);
  const d = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const w = rng() * 2 - 1;
    let v: number;
    if (kind === 'white') v = w;
    else if (kind === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      v = last;
    }
    d[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  const g = peak > 0 ? 0.95 / peak : 0;
  for (let i = 0; i < length; i++) d[i] *= g;
  return d;
}

/** A soft, warm periodic wave for pads: harmonics fall off as 1/n^1.45. */
export function warmWaveCoefficients(harmonics = 24, tilt = 1.45): { real: Float32Array; imag: Float32Array } {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let k = 1; k <= harmonics; k++) imag[k] = 1 / Math.pow(k, tilt);
  return { real, imag };
}

// ───────────────────────────── Param helpers ─────────────────────────────

/** Click-free move to `value` starting at `time` (exponential approach, time constant `tau`). */
export function glide(p: AudioParam, value: number, time: number, tau: number): void {
  p.cancelScheduledValues(time);
  p.setTargetAtTime(value, time, Math.max(0.001, tau));
}

/** Several params moved together (the same automation on parallel strips). */
export class ParamGroup {
  constructor(private params: AudioParam[]) {}
  glide(value: number, time: number, tau: number): void {
    for (const p of this.params) glide(p, value, time, tau);
  }
}

// ───────────────────────────── Graph ─────────────────────────────

/** Reverb/delay send per music layer. */
export const LAYER_SENDS: Record<Layer, { rev: number; del: number }> = {
  pad: { rev: 0.5, del: 0 },
  bass: { rev: 0.05, del: 0 },
  arp: { rev: 0.3, del: 0.2 },
  mel: { rev: 0.42, del: 0.3 },
  perc: { rev: 0.16, del: 0 },
  orn: { rev: 0.65, del: 0.42 },
};

export type SfxChannel = 'dry' | 'room' | 'echo';
export const SFX_SENDS: Record<SfxChannel, { rev: number; del: number }> = {
  dry: { rev: 0.12, del: 0 },
  room: { rev: 0.4, del: 0 },
  echo: { rev: 0.38, del: 0.5 },
};

/** Static per-layer trims that balance the instruments against each other. */
export const LAYER_TRIM: Record<Layer, number> = {
  pad: 1,
  bass: 1,
  arp: 1,
  mel: 1,
  perc: 1,
  orn: 1,
};

interface Strip {
  dry: GainNode;
  rev: GainNode;
  del: GainNode;
  vol: ParamGroup;
}

export interface MixGraph {
  ctx: BaseAudioContext;
  /** Voices of a music layer connect here. */
  layerIn: Record<Layer, GainNode>;
  /** Intensity gain of each music layer (automated at bar boundaries). */
  layerGain: Record<Layer, GainNode>;
  /** Sfx voices connect to one of these channels. */
  sfxIn: Record<SfxChannel, GainNode>;
  musicVol: ParamGroup;
  musicLowpass: ParamGroup;
  musicHighpass: ParamGroup;
  sfxVol: ParamGroup;
  /** Final output gain (mute), ramped. */
  out: GainNode;
  delayTime: ParamGroup;
  limiter: DynamicsCompressorNode;
  /** Reverb and delay return gains (ducked for the extinction cut). */
  revReturn: GainNode;
  delReturn: GainNode;
  /** Disconnect everything. */
  dispose(): void;
}

export const REV_RETURN = 0.55;
export const DEL_RETURN = 0.5;

export interface GraphOptions {
  reverb?: ReverbOptions;
  /** Ping-pong delay time in seconds. */
  delayTime: number;
  /** Trim after the limiter (linear). */
  trim?: number;
}

export function buildGraph(ctx: BaseAudioContext, o: GraphOptions): MixGraph {
  const nodes: AudioNode[] = [];
  const keep = <T extends AudioNode>(n: T): T => {
    nodes.push(n);
    return n;
  };
  const gain = (v: number) => {
    const g = keep(ctx.createGain());
    g.gain.value = v;
    return g;
  };

  // Global sums.
  const dryBus = gain(1);
  const revBus = gain(1);
  const delBus = gain(1);
  const master = gain(1);

  // Glue compression on the dry mix (gentle; note the spec's automatic makeup gain).
  const glue = keep(ctx.createDynamicsCompressor());
  glue.threshold.value = -22;
  glue.knee.value = 10;
  glue.ratio.value = 2.5;
  glue.attack.value = 0.012;
  glue.release.value = 0.25;
  dryBus.connect(glue).connect(master);

  // Reverb.
  const conv = keep(ctx.createConvolver());
  conv.normalize = false;
  const [l, r] = makeReverbIR(ctx.sampleRate, o.reverb ?? DEFAULT_REVERB);
  const ir = ctx.createBuffer(2, l.length, ctx.sampleRate);
  ir.getChannelData(0).set(l);
  ir.getChannelData(1).set(r);
  conv.buffer = ir;
  const revHp = keep(ctx.createBiquadFilter());
  revHp.type = 'highpass';
  revHp.frequency.value = 160;
  revHp.Q.value = 0.5;
  const revReturn = gain(REV_RETURN);
  revBus.connect(revHp).connect(conv).connect(revReturn).connect(master);

  // Ping-pong delay: input → (filters) → L delay → R delay → back to L.
  const delHp = keep(ctx.createBiquadFilter());
  delHp.type = 'highpass';
  delHp.frequency.value = 320;
  const delLp = keep(ctx.createBiquadFilter());
  delLp.type = 'lowpass';
  delLp.frequency.value = 3200;
  delLp.Q.value = 0.5;
  const dL = keep(ctx.createDelay(2));
  const dR = keep(ctx.createDelay(2));
  dL.delayTime.value = o.delayTime;
  dR.delayTime.value = o.delayTime;
  const fbL = gain(0.42);
  const fbR = gain(0.42);
  const fbLp = keep(ctx.createBiquadFilter());
  fbLp.type = 'lowpass';
  fbLp.frequency.value = 2600;
  const merger = keep(ctx.createChannelMerger(2));
  const delReturn = gain(DEL_RETURN);
  delBus.connect(delHp).connect(delLp).connect(dL);
  dL.connect(merger, 0, 0);
  dL.connect(fbL).connect(dR);
  dR.connect(merger, 0, 1);
  dR.connect(fbLp).connect(fbR).connect(dL);
  merger.connect(delReturn).connect(master);
  const delToRev = gain(0.25);
  delReturn.connect(delToRev).connect(revBus);

  // Master limiter: fast attack, high ratio; its makeup gain is compensated by trim.
  const limiter = keep(ctx.createDynamicsCompressor());
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.12;
  const trim = gain(o.trim ?? 0.89);
  const out = gain(0);
  master.connect(limiter).connect(trim).connect(out).connect(ctx.destination);

  // Strips.
  const makeStrip = (filtered: boolean): Strip & { lp: AudioParam[]; hp: AudioParam[] } => {
    const lp: AudioParam[] = [];
    const hp: AudioParam[] = [];
    const vols: AudioParam[] = [];
    const mk = (target: AudioNode): GainNode => {
      const input = gain(1);
      let node: AudioNode = input;
      if (filtered) {
        const f1 = keep(ctx.createBiquadFilter());
        f1.type = 'lowpass';
        f1.frequency.value = 20000;
        f1.Q.value = 0.6;
        const f2 = keep(ctx.createBiquadFilter());
        f2.type = 'highpass';
        f2.frequency.value = 20;
        f2.Q.value = 0.6;
        node = node.connect(f1).connect(f2);
        lp.push(f1.frequency);
        hp.push(f2.frequency);
      }
      const v = gain(0);
      vols.push(v.gain);
      node.connect(v).connect(target);
      return input;
    };
    return { dry: mk(dryBus), rev: mk(revBus), del: mk(delBus), vol: new ParamGroup(vols), lp, hp };
  };
  const music = makeStrip(true);
  const sfx = makeStrip(false);

  const layerIn = {} as Record<Layer, GainNode>;
  const layerGain = {} as Record<Layer, GainNode>;
  for (const L of LAYERS) {
    const input = gain(LAYER_TRIM[L]);
    const lg = gain(0);
    input.connect(lg);
    lg.connect(music.dry);
    if (LAYER_SENDS[L].rev > 0) lg.connect(gain(LAYER_SENDS[L].rev)).connect(music.rev);
    if (LAYER_SENDS[L].del > 0) lg.connect(gain(LAYER_SENDS[L].del)).connect(music.del);
    layerIn[L] = input;
    layerGain[L] = lg;
  }
  const sfxIn = {} as Record<SfxChannel, GainNode>;
  for (const c of ['dry', 'room', 'echo'] as SfxChannel[]) {
    const input = gain(1);
    input.connect(sfx.dry);
    if (SFX_SENDS[c].rev > 0) input.connect(gain(SFX_SENDS[c].rev)).connect(sfx.rev);
    if (SFX_SENDS[c].del > 0) input.connect(gain(SFX_SENDS[c].del)).connect(sfx.del);
    sfxIn[c] = input;
  }

  return {
    ctx,
    layerIn,
    layerGain,
    sfxIn,
    musicVol: music.vol,
    musicLowpass: new ParamGroup(music.lp),
    musicHighpass: new ParamGroup(music.hp),
    sfxVol: sfx.vol,
    out,
    delayTime: new ParamGroup([dL.delayTime, dR.delayTime]),
    limiter,
    revReturn,
    delReturn,
    dispose() {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* already disconnected */
        }
      }
    },
  };
}
