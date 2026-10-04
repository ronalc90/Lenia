/**
 * Tiny fallback synth to audition an AmbiencePreset in the store when the real engine is not wired
 * (dev page). ~10 s: pad chords, an arpeggio, sparse bell notes, optional percussion, reverb and
 * delay, all following the preset's bpm / mode / tonic / timbres. The game itself should pass
 * `previewMusic` that drives src/audio with the preset instead.
 */
import type { AmbiencePreset, MusicMode, Timbre } from '../../store/catalog';

const SCALES: Record<MusicMode, number[]> = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonicMinor: [0, 3, 5, 7, 10],
  pentatonicMajor: [0, 2, 4, 7, 9],
};

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export interface MusicDemo {
  play(id: string, p: AmbiencePreset, onEnd?: () => void): void;
  stop(): void;
  readonly playing: string | null;
}

export function createMusicDemo(): MusicDemo {
  let ctx: AudioContext | null = null;
  let bus: GainNode | null = null;
  let playing: string | null = null;
  let endTimer = 0;
  let endCb: (() => void) | undefined;

  const stop = () => {
    clearTimeout(endTimer);
    if (bus && ctx) {
      const b = bus;
      b.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      setTimeout(() => b.disconnect(), 900);
    }
    bus = null;
    playing = null;
    const cb = endCb;
    endCb = undefined;
    cb?.();
  };

  function voice(c: AudioContext, out: AudioNode, t: Timbre, f: number, t0: number, dur: number, vel: number, detune: number): void {
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = t === 'choir' ? 900 : t === 'reed' ? 1500 : t === 'warm' ? 1300 : 6000;
    g.connect(lp).connect(out);
    const osc = (type: OscillatorType, mult: number, gain: number, cents = 0) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      o.detune.value = cents;
      const og = c.createGain();
      og.gain.value = gain;
      o.connect(og).connect(g);
      o.start(t0);
      o.stop(t0 + dur + 2.5);
    };
    switch (t) {
      case 'warm':
        osc('triangle', 1, 0.7, -detune);
        osc('triangle', 1, 0.7, detune);
        break;
      case 'glass':
        osc('sine', 1, 0.8);
        osc('sine', 3, 0.12);
        break;
      case 'choir':
        osc('sawtooth', 1, 0.35, -detune);
        osc('sawtooth', 1, 0.35, detune);
        break;
      case 'reed':
        osc('square', 1, 0.3);
        break;
      case 'bell':
        osc('sine', 1, 0.7);
        osc('sine', 2.76, 0.22);
        osc('sine', 5.4, 0.06);
        break;
      case 'pluck':
        osc('triangle', 1, 0.8);
        osc('sine', 2, 0.15);
        break;
      default:
        osc('sine', 1, 0.9);
    }
    const slow = t === 'choir' || t === 'warm';
    const atk = slow && dur > 1 ? 0.6 : 0.006;
    const decay = t === 'pluck' ? 0.35 : t === 'bell' || t === 'glass' ? 1.4 : dur;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vel, t0 + atk);
    if (decay < dur) g.gain.setTargetAtTime(0, t0 + atk, decay / 3);
    else g.gain.setTargetAtTime(0, t0 + dur, 0.5);
  }

  function reverbIR(c: AudioContext, seconds: number): AudioBuffer {
    const len = Math.floor(c.sampleRate * Math.min(4, seconds));
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  return {
    get playing() {
      return playing;
    },
    stop,
    play(id, p, onEnd) {
      stop();
      try {
        ctx ??= new AudioContext();
        void ctx.resume();
      } catch {
        return;
      }
      const c = ctx;
      playing = id;
      endCb = onEnd;
      const out = c.createGain();
      out.gain.value = 0.22;
      out.connect(c.destination);
      bus = out;
      const dry = c.createGain();
      dry.connect(out);
      const conv = c.createConvolver();
      conv.buffer = reverbIR(c, p.reverb.rt60);
      const wet = c.createGain();
      wet.gain.value = p.reverbMix * 0.9;
      conv.connect(wet).connect(out);
      const dl = c.createDelay(2);
      dl.delayTime.value = (60 / p.bpm) * 0.75;
      const fb = c.createGain();
      fb.gain.value = 0.32;
      const dw = c.createGain();
      dw.gain.value = p.delayMix * 0.5;
      dl.connect(fb).connect(dl);
      dl.connect(dw).connect(out);
      const send = c.createGain();
      send.connect(dry);
      send.connect(conv);
      send.connect(dl);

      const scale = SCALES[p.mode];
      const seven = scale.length === 7;
      const minorish = scale[2] === 3;
      const degrees = seven ? (minorish ? [0, 5, 2, 6] : [0, 3, 5, 4]) : [0, 3, 1, 4];
      const note = (deg: number, oct: number) => {
        const n = scale.length;
        const o = Math.floor(deg / n);
        return 12 * (oct + o) + p.tonic + scale[((deg % n) + n) % n];
      };
      const beat = 60 / p.bpm;
      const bar = beat * 4;
      const t0 = c.currentTime + 0.08;
      const bars = 4;
      for (let b = 0; b < bars; b++) {
        const d = degrees[b % degrees.length];
        const tb = t0 + b * bar;
        for (const k of [0, 2, 4]) voice(c, send, p.pad, midiHz(note(d + (seven ? k : k / 2), 4)), tb, bar, 0.09, p.detune);
        voice(c, send, p.bass, midiHz(note(d, 2)), tb, bar * 0.9, 0.16, 0);
        const arp = [0, 2, 4, 7, 4, 2, 4, 9].map((k) => note(d + (seven ? k : Math.round(k * 0.7)), 5));
        for (let i = 0; i < 8; i++) {
          const swing = i % 2 ? p.swing * beat * 0.5 : 0;
          voice(c, send, p.arp, midiHz(arp[i]), tb + i * beat * 0.5 + swing, beat * 0.45, 0.07, 0);
        }
        if (Math.random() < 0.55 * p.sparkle) voice(c, send, p.lead, midiHz(note(d + 4, 6)), tb + beat * (Math.random() < 0.5 ? 1.5 : 2.5), beat * 1.5, 0.05, 0);
        if (p.percussion !== 'none') {
          for (let i = 0; i < 8; i++) {
            if (p.percussion === 'soft' && i % 2 === 0) continue;
            if (p.percussion === 'clicks' && Math.random() < 0.5) continue;
            const len = p.percussion === 'brushes' ? 0.12 : 0.03;
            const nb = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate);
            const nd = nb.getChannelData(0);
            for (let s = 0; s < nd.length; s++) nd[s] = (Math.random() * 2 - 1) * Math.pow(1 - s / nd.length, 2);
            const src = c.createBufferSource();
            src.buffer = nb;
            const hp = c.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.value = p.percussion === 'clicks' ? 2500 : 6000;
            const g = c.createGain();
            g.gain.value = p.percussion === 'clicks' ? 0.05 : 0.035;
            src.connect(hp).connect(g).connect(dry);
            src.start(tb + i * beat * 0.5 + (i % 2 ? p.swing * beat * 0.5 : 0));
          }
        }
      }
      endTimer = window.setTimeout(stop, (bars * bar + 1.5) * 1000);
    },
  };
}
