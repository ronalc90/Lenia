/**
 * The composer: turns (bar index, intensity level) into a list of note
 * events for that bar. Pure and deterministic for a given seed, so the
 * engine, the offline renderer and the unit tests all hear the same piece.
 */
import { DEFAULT_HARMONY, DEFAULT_SCORE_STYLE, type Harmony, type ScoreStyle } from './ambience';
import { BEATS_PER_BAR, type BarInfo } from './progression';
import { LAYER_MIX, SPARKLE_PROB, WIDTH, type Layer } from './intensity';
import { MOTIF_BANK, composeSectionMelody, hash32, mulberry32, varyMotif, type MelodyNote, type Motif } from './motifs';
import {
  ARP16,
  ARP8,
  HAT,
  KICK,
  KICK_FILL,
  RIM,
  SHAKER,
  SWING,
  arpPool,
  bassBar,
} from './patterns';
import { nearestPitchWithPc, pitchesInRange, voiceLead } from './theory';

export type Inst = 'bass' | 'pluck' | 'bell' | 'echo' | 'kick' | 'rim' | 'hat' | 'shaker' | 'glint' | 'sig';

export interface NoteEvent {
  layer: Layer;
  inst: Inst;
  /** Beat offset inside the bar (0..4), swing already applied. */
  beat: number;
  /** Duration in beats. */
  dur: number;
  /** MIDI pitch (ignored by unpitched percussion). */
  midi: number;
  /** 0..1 */
  vel: number;
  /** -1..1 */
  pan: number;
}

export interface BarPlan {
  bar: number;
  info: BarInfo;
  level: number;
  /** Pad voicing (4 MIDI notes), voice-led from the previous bar. */
  pad: number[];
  events: NoteEvent[];
}

/** A discovered species' ornament: a scale degree, an octave and a little figure. */
export interface Signature {
  degree: number;
  octave: number;
  figure: 0 | 1 | 2;
}

export function signatureFor(speciesId: string): Signature {
  const h = hash32('sig', speciesId);
  return { degree: h % 5, octave: 6 + ((h >>> 3) % 2), figure: ((h >>> 5) % 3) as 0 | 1 | 2 };
}

export interface PlanExtras {
  /** Signatures of species discovered so far (most recent last). */
  signatures?: readonly Signature[];
  /** A species discovered just now: its signature plays on beat 1. */
  fresh?: Signature | null;
}

export const PAD_LO = 52; // E3
export const PAD_HI = 74; // D5
export const PAD_CENTER = 63;

export class Composer {
  private seed: number;
  private prevPad: number[] | null = null;
  private prevBass: number | undefined;
  private melodyCache = new Map<number, MelodyNote[]>();
  private harmony: Harmony = DEFAULT_HARMONY;
  private style: ScoreStyle = DEFAULT_SCORE_STYLE;

  constructor(seed = 1) {
    this.seed = seed >>> 0;
  }

  /** Chords come from here (music ambiences); the default is progression.ts. */
  setHarmony(h: Harmony): void {
    if (h === this.harmony) return;
    this.harmony = h;
    this.melodyCache.clear();
  }

  getHarmony(): Harmony {
    return this.harmony;
  }

  /** Ornament density, swing and percussion style of the current ambience. */
  setStyle(s: ScoreStyle): void {
    this.style = { ...s };
  }

  /** Restart the score (new era): forget voice-leading history, optionally new seed. */
  reset(seed?: number): void {
    if (seed !== undefined) this.seed = seed >>> 0;
    this.prevPad = null;
    this.prevBass = undefined;
    this.melodyCache.clear();
  }

  getSeed(): number {
    return this.seed;
  }

  /** Theme (motif X) of a given pass through the form: kept 3 forms, lightly varied in between. */
  themeFor(formIndex: number): Motif {
    const group = Math.floor(formIndex / 3);
    let m: Motif = MOTIF_BANK[hash32(this.seed, 'theme', group) % MOTIF_BANK.length];
    const step = formIndex % 3;
    if (step > 0) {
      const rng = mulberry32(hash32(this.seed, 'themevar', formIndex));
      m = varyMotif(m, rng, step === 1 ? 'ornament' : rng() < 0.5 ? 'syncopate' : 'tail');
    }
    return m;
  }

  /** Melody of the 8-bar section `sectionIndex` (cached). */
  sectionMelody(bar: number): MelodyNote[] {
    const info = this.harmony.barInfo(bar);
    const key = info.sectionIndex;
    let mel = this.melodyCache.get(key);
    if (!mel) {
      mel = composeSectionMelody({
        section: info.section,
        chords: this.harmony.sectionChords(bar),
        theme: this.themeFor(info.formIndex),
        rng: mulberry32(hash32(this.seed, 'mel', key)),
        variant: info.sectionInForm + info.formIndex,
        ...(this.harmony === DEFAULT_HARMONY ? {} : { tonic: this.harmony.tonic, open: this.harmony.open }),
      });
      this.melodyCache.set(key, mel);
      if (this.melodyCache.size > 4) this.melodyCache.delete(this.melodyCache.keys().next().value as number);
    }
    return mel;
  }

  /** Plan one bar. Bars must be planned in increasing order for smooth voice leading. */
  plan(bar: number, level: number, extras: PlanExtras = {}): BarPlan {
    const info = this.harmony.barInfo(bar);
    const st = this.style;
    const c = info.chord;
    const events: NoteEvent[] = [];
    const rng = mulberry32(hash32(this.seed, 'bar', bar));
    const width = WIDTH[Math.max(0, Math.min(5, level))];
    const on = (layer: Layer) => LAYER_MIX[layer][Math.max(0, Math.min(5, level))] > 0;

    // Pad: voice-led rootless voicing.
    const pad = voiceLead(this.prevPad, c.pad, PAD_LO, PAD_HI, PAD_CENTER);
    this.prevPad = pad;

    // Bass.
    if (on('bass')) {
      const notes = bassBar(c, info.next, level, this.prevBass);
      this.prevBass = notes[0]?.midi;
      for (const b of notes) events.push({ layer: 'bass', inst: 'bass', beat: b.beat, dur: b.dur, midi: b.midi, vel: b.vel, pan: 0 });
    } else {
      this.prevBass = undefined;
    }

    // Arpeggio.
    if (on('arp')) {
      const sh = hash32(this.seed, 'arp', info.sectionIndex);
      const shape = ARP8[sh % ARP8.length];
      const pool = arpPool(c, [62, 60, 64][(sh >>> 4) % 3]);
      const cadenceBar = info.barInSection === 7 && level >= 3;
      if (level >= 5) {
        const seq = ARP16[(sh >>> 8) % ARP16.length];
        for (let i = 0; i < 16; i++) {
          if (seq[i] < 0 || (cadenceBar && i >= 10)) continue;
          const idx = Math.min(pool.length - 1, seq[i]);
          const accent = i % 4 === 0 ? 0.78 : i % 2 === 0 ? 0.6 : 0.46;
          events.push({
            layer: 'arp',
            inst: 'pluck',
            beat: (i + (i % 2 ? SWING * 0.5 : 0)) / 4,
            dur: 0.5,
            midi: pool[idx],
            vel: accent * (0.92 + rng() * 0.12),
            pan: (i % 2 ? 1 : -1) * width * 0.7,
          });
        }
      } else {
        const mask = level === 2 ? [1, 0, 1, 1, 1, 0, 1, 1] : [1, 1, 1, 1, 1, 1, 1, 1];
        for (let i = 0; i < 8; i++) {
          if (!mask[i] || (cadenceBar && i >= 5)) continue;
          const idx = Math.min(pool.length - 1, shape[i]);
          const accent = i % 2 === 0 ? 0.74 : 0.55;
          events.push({
            layer: 'arp',
            inst: 'pluck',
            beat: i / 2 + (i % 2 ? st.swing * 0.5 : 0),
            dur: 0.75,
            midi: pool[idx],
            vel: accent * (0.92 + rng() * 0.12),
            pan: (i % 2 ? 1 : -1) * width * 0.6,
          });
        }
      }
    }

    // Melody (bell lead + echo answers).
    if (on('mel')) {
      const mel = this.sectionMelody(bar);
      const b0 = info.barInSection * BEATS_PER_BAR;
      for (const m of mel) {
        if (m.beat < b0 || m.beat >= b0 + BEATS_PER_BAR) continue;
        events.push({
          layer: 'mel',
          inst: m.voice === 'echo' ? 'echo' : 'bell',
          beat: m.beat - b0,
          dur: m.dur,
          midi: m.midi,
          vel: m.vel,
          pan: m.voice === 'echo' ? -0.25 * width : 0.1 * width,
        });
      }
    }

    // Soft percussion (ambiences: brushes, vinyl clicks or none).
    if (on('perc') && st.percussion !== 'soft') {
      this.percussionVariant(events, info, level, width, rng);
    } else if (on('perc')) {
      const swing = (step: number) => (step + (step % 2 ? SWING : 0)) / 4;
      for (const h of SHAKER) {
        events.push({ layer: 'perc', inst: 'shaker', beat: swing(h.step), dur: 0.25, midi: 0, vel: h.vel * (level >= 5 ? 1 : 0.8) * (0.9 + rng() * 0.2), pan: 0.35 * width });
      }
      for (const h of HAT) {
        events.push({ layer: 'perc', inst: 'hat', beat: swing(h.step), dur: 0.25, midi: 0, vel: h.vel * (0.9 + rng() * 0.15), pan: -0.3 * width });
      }
      if (level >= 5) {
        const kicks = info.barInSection === 7 ? [...KICK, ...KICK_FILL] : KICK;
        for (const h of kicks) events.push({ layer: 'perc', inst: 'kick', beat: swing(h.step), dur: 1, midi: 0, vel: h.vel, pan: 0 });
        for (const h of RIM) events.push({ layer: 'perc', inst: 'rim', beat: swing(h.step), dur: 0.5, midi: 0, vel: h.vel, pan: 0.1 });
      }
    }

    // Ornaments: species signatures and sparkles (never on an empty dish).
    if (level >= 1 && on('orn')) {
      const sigs = extras.signatures ?? [];
      const sigPitch = (s: Signature) => {
        const pcs = c.stable;
        const target = 12 * (s.octave + 1) + pcs[s.degree % pcs.length];
        return nearestPitchWithPc(target, [pcs[s.degree % pcs.length]]);
      };
      const addSig = (s: Signature, beat: number, vel: number) => {
        const p = sigPitch(s);
        const pan = ((s.degree % 5) / 2 - 1) * 0.6 * width + 0.0;
        events.push({ layer: 'orn', inst: 'sig', beat, dur: 1, midi: p, vel, pan });
        if (s.figure === 1) {
          const up = pitchesInRange(c.stable, p + 1, p + 7)[0] ?? p + 12;
          events.push({ layer: 'orn', inst: 'sig', beat: beat + 0.25, dur: 1, midi: up, vel: vel * 0.8, pan });
        } else if (s.figure === 2) {
          const down = pitchesInRange(c.stable, p - 7, p - 1).pop() ?? p - 12;
          events.push({ layer: 'orn', inst: 'sig', beat: beat + 0.5, dur: 1, midi: down, vel: vel * 0.7, pan });
        }
      };
      if (extras.fresh) addSig(extras.fresh, 0, 0.75);
      if (sigs.length > 0 && bar % 2 === 1) addSig(sigs[(bar >> 1) % sigs.length], 2.5, 0.42);
      if (rng() < SPARKLE_PROB[Math.min(5, level)] * st.sparkle) {
        const step = [2, 6, 11, 13][Math.floor(rng() * 4)];
        const pool = pitchesInRange(c.stable, 86, 98);
        const start = Math.floor(rng() * Math.max(1, pool.length - 3));
        const count = 2 + Math.floor(rng() * 2);
        const pan = (rng() * 2 - 1) * 0.75 * width + (rng() < 0.5 ? -0.15 : 0.15);
        for (let k = 0; k < count && start + k < pool.length; k++) {
          events.push({ layer: 'orn', inst: 'glint', beat: (step + k) / 4, dur: 0.5, midi: pool[start + k], vel: 0.32 - k * 0.05, pan });
        }
      }
    }

    events.sort((a, b) => a.beat - b.beat);
    return { bar, info, level, pad, events };
  }

  /** Percussion of the non-default ambiences ('none' adds nothing). */
  private percussionVariant(events: NoteEvent[], info: BarInfo, level: number, width: number, rng: () => number): void {
    const st = this.style;
    // 16th grid with the score's swing plus the ambience's off-beat-eighth swing.
    const at = (step: number) => (step + (step % 2 ? SWING : 0)) / 4 + (step % 4 === 2 ? st.swing * 0.5 : 0);
    if (st.percussion === 'brushes') {
      for (const h of SHAKER) events.push({ layer: 'perc', inst: 'shaker', beat: at(h.step), dur: 0.25, midi: 0, vel: h.vel * 1.1 * (0.9 + rng() * 0.2), pan: 0.3 * width });
      for (const h of HAT) events.push({ layer: 'perc', inst: 'hat', beat: at(h.step), dur: 0.25, midi: 0, vel: h.vel * 0.75 * (0.9 + rng() * 0.15), pan: -0.3 * width });
      if (level >= 4) for (const step of [4, 12]) events.push({ layer: 'perc', inst: 'rim', beat: at(step), dur: 0.5, midi: 0, vel: 0.32, pan: 0.1 });
    } else if (st.percussion === 'clicks') {
      for (const h of HAT) events.push({ layer: 'perc', inst: 'hat', beat: at(h.step), dur: 0.25, midi: 0, vel: h.vel * 0.55 * (0.9 + rng() * 0.2), pan: -0.25 * width });
      // Vinyl-like clicks: two quiet rim ticks on random 16ths.
      for (let k = 0; k < 2; k++) {
        events.push({ layer: 'perc', inst: 'rim', beat: at(Math.floor(rng() * 16)), dur: 0.25, midi: 0, vel: 0.12 + rng() * 0.1, pan: (rng() * 2 - 1) * 0.5 });
      }
      if (level >= 4) {
        const kicks = info.barInSection === 7 ? [...KICK, ...KICK_FILL] : KICK;
        for (const h of kicks) events.push({ layer: 'perc', inst: 'kick', beat: at(h.step), dur: 1, midi: 0, vel: h.vel * 0.8, pan: 0 });
      }
    }
  }
}
