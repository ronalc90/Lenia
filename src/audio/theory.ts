/**
 * Pure music-theory helpers for Bioluma's generative score.
 *
 * Everything here is deterministic and free of Web Audio so it can be unit
 * tested in Node. Pitches are MIDI note numbers (60 = C4, 62 = D4, 69 = A4 =
 * 440 Hz); pitch classes ("pc") are 0..11 with C = 0.
 *
 * Harmony: D minor modal. Most bars use the "white-key" collection (D dorian:
 * D E F G A B C); the Bbmaj7 / Gm9 bars borrow Bb (the F-major collection =
 * D aeolian), which gives the gentle melancholic colour shift. Every chord
 * carries its own chord-scale so the melody, arpeggio and SFX always land on
 * consonant notes.
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/** D dorian (the home mode). */
export const D_DORIAN: readonly number[] = [2, 4, 5, 7, 9, 11, 0];
/** C-major collection (= D dorian, F lydian, G mixolydian, A aeolian). */
const WHITE: readonly number[] = [0, 2, 4, 5, 7, 9, 11];
/** F-major collection (= D aeolian, Bb lydian, G dorian). */
const F_MAJOR: readonly number[] = [0, 2, 4, 5, 7, 9, 10];

/** Tonic pitch class (D). */
export const TONIC_PC = 2;

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

/** Pitch class of a MIDI note (always 0..11, also for negative input). */
export function pc(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

export function noteName(midi: number): string {
  return `${NOTE_NAMES[pc(midi)]}${Math.floor(Math.round(midi) / 12) - 1}`;
}

export interface Chord {
  /** Display name, e.g. "Dm9". */
  name: string;
  /** Root pitch class (what the bass plays). */
  root: number;
  /** Chord tones incl. colour tones (root first), used by arpeggio and SFX. */
  tones: readonly number[];
  /** Four rootless pad tones (3rd/5th/7th/9th style), voice-led bar to bar. */
  pad: readonly number[];
  /** Seven-note chord-scale for melodic passing tones. */
  scale: readonly number[];
  /** Notes that sound settled on strong beats / long notes. */
  stable: readonly number[];
  /** Scale notes that clash with this chord when held. */
  avoid: readonly number[];
  /** Pitch class of the fifth above the root (bass motion). */
  fifth: number;
}

function chord(
  name: string,
  root: number,
  tones: number[],
  pad: number[],
  scale: readonly number[],
  stable: number[],
  avoid: number[] = [],
): Chord {
  return { name, root, tones, pad, scale, stable, avoid, fifth: (root + 7) % 12 };
}

/** The chord vocabulary of the score. */
export const CHORDS = {
  Dm9: chord('Dm9', 2, [2, 5, 9, 0, 4], [5, 9, 0, 4], WHITE, [2, 5, 9, 0, 4, 7]),
  Bbmaj7: chord('Bbmaj7', 10, [10, 2, 5, 9, 0], [2, 5, 9, 0], F_MAJOR, [10, 2, 5, 9, 0, 7]),
  Fmaj7: chord('Fmaj7', 5, [5, 9, 0, 4, 7], [9, 0, 4, 7], WHITE, [5, 9, 0, 4, 7, 2]),
  C69: chord('C6/9', 0, [0, 4, 7, 9, 2], [4, 7, 9, 2], WHITE, [0, 4, 7, 9, 2], [5]),
  G69: chord('G6/9', 7, [7, 11, 2, 4, 9], [11, 2, 4, 9], WHITE, [7, 11, 2, 4, 9], [0]),
  A7sus4: chord('A7sus4', 9, [9, 2, 4, 7, 11], [2, 4, 7, 11], WHITE, [9, 2, 4, 7, 11], [0, 5]),
  Am9: chord('Am9', 9, [9, 0, 4, 7, 11], [0, 4, 7, 11], WHITE, [9, 0, 4, 7, 11, 2], [5]),
  Gm9: chord('Gm9', 7, [7, 10, 2, 5, 9], [10, 2, 5, 9], F_MAJOR, [7, 10, 2, 5, 9, 0]),
} as const satisfies Record<string, Chord>;

export type ChordName = keyof typeof CHORDS;

/** All pitches in [lo, hi] (inclusive) whose pitch class is in `pcs`, ascending. */
export function pitchesInRange(pcs: readonly number[], lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let m = Math.ceil(lo); m <= hi; m++) if (pcs.includes(pc(m))) out.push(m);
  return out;
}

/**
 * Nearest MIDI pitch to `target` with a pitch class in `pcs`.
 * Ties resolve towards `prefer` (+1 up, -1 down; default down).
 */
export function nearestPitchWithPc(target: number, pcs: readonly number[], prefer: 1 | -1 = -1): number {
  const t = Math.round(target);
  for (let d = 0; d <= 12; d++) {
    const a = t + d * prefer;
    const b = t - d * prefer;
    if (pcs.includes(pc(a))) return a;
    if (pcs.includes(pc(b))) return b;
  }
  return t;
}

/**
 * Move `steps` scale degrees from `from` inside `scale` (pitch classes).
 * `from` is first snapped onto the scale. Steps may be negative.
 */
export function scaleStep(from: number, steps: number, scale: readonly number[]): number {
  let m = nearestPitchWithPc(from, scale);
  const dir = steps >= 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(steps); i++) {
    m += dir;
    while (!scale.includes(pc(m))) m += dir;
  }
  return m;
}

/** Pitch classes of `scale` minus `avoid`. */
export function usable(c: Chord): number[] {
  return c.scale.filter((p) => !c.avoid.includes(p));
}

/**
 * Voice-lead a 4-note pad voicing from `prev` to the pitch classes `pcs`
 * within [lo, hi]. Minimises total semitone movement of the sorted voices,
 * with a soft pull towards `center` so the pad never drifts away, and rejects
 * muddy voicings (unisons, a 2nd between the two lowest voices, span > 19).
 */
export function voiceLead(
  prev: readonly number[] | null,
  pcs: readonly number[],
  lo: number,
  hi: number,
  center = (lo + hi) / 2,
): number[] {
  const options = pcs.map((p) => pitchesInRange([p], lo, hi));
  let best: number[] | null = null;
  let bestCost = Infinity;
  const pick: number[] = new Array(pcs.length);
  const recurse = (i: number): void => {
    if (i === pcs.length) {
      const v = [...pick].sort((a, b) => a - b);
      for (let k = 1; k < v.length; k++) if (v[k] === v[k - 1]) return;
      if (v.length >= 2 && v[1] - v[0] < 3) return;
      if (v[v.length - 1] - v[0] > 19) return;
      const mean = v.reduce((s, x) => s + x, 0) / v.length;
      let cost = Math.abs(mean - center) * 0.35;
      if (prev && prev.length === v.length) {
        for (let k = 0; k < v.length; k++) cost += Math.abs(v[k] - prev[k]);
      } else {
        // First chord: prefer an open, even spread.
        cost += Math.abs(v[v.length - 1] - v[0] - 14) * 0.2;
      }
      if (cost < bestCost - 1e-9) {
        bestCost = cost;
        best = v;
      }
      return;
    }
    for (const m of options[i]) {
      pick[i] = m;
      recurse(i + 1);
    }
  };
  recurse(0);
  if (!best) {
    // Range too narrow for the constraints: fall back to stacked pitches.
    return pcs.map((p) => nearestPitchWithPc(center, [p])).sort((a, b) => a - b);
  }
  return best;
}

/** Bass pitch for a chord root inside [lo, hi] (closest to `prev` if given). */
export function bassPitch(rootPc: number, lo: number, hi: number, prev?: number): number {
  const opts = pitchesInRange([rootPc], lo, hi);
  if (opts.length === 0) return nearestPitchWithPc((lo + hi) / 2, [rootPc]);
  if (prev === undefined) return opts[0];
  return opts.reduce((a, b) => (Math.abs(b - prev) < Math.abs(a - prev) ? b : a));
}
