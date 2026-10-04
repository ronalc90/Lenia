/**
 * Melody generation: a bank of short, singable 2-bar motifs, variation
 * operators, and phrase composition with a clear period structure.
 *
 *   A section (8 bars):  X  (call)  |  Y  (varied, ends open)  |  X  (repeat)  |  Z  (cadence → D)
 *   B section (8 bars):  W  (call)  |  W' echo response, lower & softer  |  W'' |  Z' (cadence → D)
 *
 * Repetition (X ... X) is what makes the line memorable; the open ending of Y
 * and the tonic landing of Z give the question/answer feel. Pure and seeded.
 */
import type { Chord } from './theory';
import { TONIC_PC, nearestPitchWithPc, pc, scaleStep } from './theory';

/** Small, fast, seedable PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 32-bit hash of a few integers / a string (FNV-1a based). */
export function hash32(...parts: (number | string)[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    const s = typeof p === 'number' ? String(Math.floor(p)) : p;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 0x9e;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** One motif note. t/d in beats inside a 2-bar (8-beat) block, s = scale steps from the anchor. */
export interface MotifNote {
  t: number;
  d: number;
  s: number;
}
export type Motif = readonly MotifNote[];

const n = (t: number, d: number, s: number): MotifNote => ({ t, d, s });

/** Hand-written 2-bar motifs: few notes, clear rhythm, mostly stepwise. */
export const MOTIF_BANK: readonly Motif[] = [
  [n(0, 1.5, 0), n(1.5, 0.5, 1), n(2, 2, 2), n(4, 1, 1), n(5, 3, -1)], // rise and settle
  [n(0, 1, 4), n(1, 1, 2), n(2, 1.5, 0), n(3.5, 0.5, 1), n(4, 4, 0)], // falling answer
  [n(0.5, 1, 0), n(1.5, 1, 2), n(2.5, 1.5, 3), n(4, 0.5, 2), n(4.5, 3.5, 1)], // syncopated lift
  [n(0, 2, 2), n(2, 0.5, 3), n(2.5, 1.5, 2), n(4, 4, 0)], // sigh
  [n(0, 1, 0), n(1, 2, 4), n(3, 0.5, 3), n(3.5, 0.5, 2), n(4, 4, 1)], // curious leap
  [n(0, 0.5, 0), n(0.5, 0.5, 0), n(1, 1, 1), n(2, 2, -1), n(4, 3, 0)], // repeated note + turn
  [n(0, 0.75, 0), n(0.75, 0.75, 2), n(1.5, 2.5, 4), n(5, 0.5, 3), n(5.5, 2.5, 2)], // call of three
  [n(0, 1, 2), n(1, 1, 1), n(2, 1, 0), n(3, 1, 1), n(4, 2, 2), n(6, 2, 0)], // lullaby
];

/** Cadential second halves (t >= 4) that settle; the last note is forced to the tonic. */
export const CADENCE_TAILS: readonly Motif[] = [
  [n(4, 1, 1), n(5, 3, 0)],
  [n(4, 0.5, 2), n(4.5, 0.5, 1), n(5, 3, 0)],
  [n(4, 4, 0)],
  [n(4, 1.5, -1), n(5.5, 0.5, 1), n(6, 2, 0)],
];

export type Variation = 'invert' | 'shift' | 'ornament' | 'syncopate' | 'simplify' | 'tail';

function sortMotif(m: MotifNote[]): MotifNote[] {
  return m.sort((a, b) => a.t - b.t);
}

/** Apply one variation operator. Keeps notes inside the 8-beat block. */
export function varyMotif(m: Motif, rng: () => number, kind?: Variation): Motif {
  const kinds: Variation[] = ['invert', 'shift', 'ornament', 'syncopate', 'simplify', 'tail'];
  const k = kind ?? kinds[Math.floor(rng() * kinds.length)];
  const out = m.map((x) => ({ ...x }));
  switch (k) {
    case 'invert': {
      const first = out[0].s;
      for (const x of out) x.s = first - (x.s - first);
      break;
    }
    case 'shift': {
      const by = [-2, -1, 1, 2][Math.floor(rng() * 4)];
      for (const x of out) x.s += by;
      break;
    }
    case 'ornament': {
      // Split the longest note: a short neighbour tone fills its last half beat.
      let li = 0;
      for (let i = 1; i < out.length; i++) if (out[i].d > out[li].d) li = i;
      const L = out[li];
      if (L.d >= 1.5) {
        const nb = rng() < 0.5 ? 1 : -1;
        L.d -= 0.5;
        out.push({ t: L.t + L.d, d: 0.5, s: L.s + nb });
      }
      break;
    }
    case 'syncopate': {
      // Push the first note half a beat later (shortening it).
      if (out[0].d > 0.5 && out[0].t + 0.5 < 8) {
        out[0].t += 0.5;
        out[0].d -= 0.5;
      }
      break;
    }
    case 'simplify': {
      // Merge the first pair of short notes.
      for (let i = 0; i < out.length - 1; i++) {
        if (out[i].d <= 0.5 && out[i + 1].d <= 1) {
          out[i].d += out[i + 1].d;
          out.splice(i + 1, 1);
          break;
        }
      }
      break;
    }
    case 'tail': {
      // Swap the contour of the last two notes.
      if (out.length >= 2) {
        const a = out[out.length - 2];
        const b = out[out.length - 1];
        [a.s, b.s] = [b.s, a.s];
      }
      break;
    }
  }
  return sortMotif(out.filter((x) => x.t >= 0 && x.t < 8 && x.d > 0));
}

/** Transpose a motif by `by` scale steps. */
export function shiftMotif(m: Motif, by: number): Motif {
  return m.map((x) => ({ ...x, s: x.s + by }));
}

export interface MelodyNote {
  /** Beat offset from the start of the 8-bar section (0..32). */
  beat: number;
  /** Duration in beats. */
  dur: number;
  midi: number;
  /** 0..1 */
  vel: number;
  /** Lands on beat 1/3 or lasts >= 1 beat (snapped to a stable chord tone). */
  strong: boolean;
  /** 'lead' = bell, 'echo' = softer answering voice an octave lower. */
  voice: 'lead' | 'echo';
}

export interface MelodyRange {
  lo: number;
  hi: number;
  center: number;
}

export const MELODY_RANGE: MelodyRange = { lo: 69, hi: 88, center: 78 };

/**
 * Turn a motif into pitches over two bars of chords starting at `offset`
 * beats. Strong / long notes snap to stable chord tones, avoid notes are
 * never used, and the whole block is octave-shifted to fit the range.
 */
export function realizeMotif(
  m: Motif,
  offset: number,
  chords: readonly Chord[],
  anchor: number,
  range: MelodyRange = MELODY_RANGE,
  prefer: number = anchor,
): MelodyNote[] {
  const build = (a: number): MelodyNote[] => {
    const out: MelodyNote[] = [];
    let prevS = m[0]?.s ?? 0;
    let prevMidi = a;
    for (const x of m) {
      const beat = offset + x.t;
      const c = chords[Math.min(chords.length - 1, Math.floor(beat / 4))];
      const strong = beat % 2 === 0 || x.d >= 1;
      let midi = scaleStep(a, x.s, c.scale);
      const dir: 1 | -1 = x.s > prevS ? 1 : x.s < prevS ? -1 : midi >= prevMidi ? 1 : -1;
      if (c.avoid.includes(pc(midi)) || (strong && !c.stable.includes(pc(midi)))) {
        midi = nearestPitchWithPc(midi, c.stable, dir);
      }
      out.push({ beat, dur: x.d, midi, vel: 0.7, strong, voice: 'lead' });
      prevS = x.s;
      prevMidi = midi;
    }
    return out;
  };
  // Pick the octave that keeps the block in range and closest to `prefer`.
  let best: MelodyNote[] = [];
  let bestCost = Infinity;
  for (const a of [anchor - 12, anchor, anchor + 12]) {
    const notes = build(a);
    let cost = 0;
    let mean = 0;
    for (const x of notes) {
      cost += 10 * (Math.max(0, x.midi - range.hi) + Math.max(0, range.lo - x.midi));
      mean += x.midi / notes.length;
    }
    cost += Math.abs(mean - prefer) * 0.5 + (a === anchor ? 0 : 0.01);
    if (cost < bestCost) {
      bestCost = cost;
      best = notes;
    }
  }
  return best;
}

/** Pick an anchor: a stable tone of `c` nearest `target`. */
function anchorNear(target: number, c: Chord): number {
  return nearestPitchWithPc(target, c.stable);
}

/** Force the last note of a block onto one of `pcs` (nearest), keeping it in range. */
function forceEnding(notes: MelodyNote[], pcs: readonly number[], range: MelodyRange): void {
  const last = notes[notes.length - 1];
  if (!last) return;
  let m = nearestPitchWithPc(last.midi, pcs);
  if (m > range.hi) m -= 12;
  if (m < range.lo) m += 12;
  last.midi = m;
  last.strong = true;
}

/**
 * Cadence block (bars 7-8 of a section): the theme's first bar, then a
 * tail that walks onto the tonic. Tail steps are relative to the final D
 * (nearest to where the head ended), so the line lands by step, not leap.
 */
function cadence(headM: Motif, tail: Motif, ch: readonly Chord[], anchor: number, range: MelodyRange, tonic = TONIC_PC): MelodyNote[] {
  const offset = 24;
  const headNotes = realizeMotif(headM, offset, ch, anchor, range);
  const from = headNotes[headNotes.length - 1]?.midi ?? anchor;
  let final = nearestPitchWithPc(from, [tonic]);
  if (final > range.hi) final -= 12;
  if (final < range.lo) final += 12;
  const tailNotes = tail.map((x, i): MelodyNote => {
    const beat = offset + x.t;
    const c = ch[Math.min(ch.length - 1, Math.floor(beat / 4))];
    const strong = beat % 2 === 0 || x.d >= 1;
    let midi = i === tail.length - 1 ? final : scaleStep(final, x.s, c.scale);
    if (c.avoid.includes(pc(midi)) || (strong && !c.stable.includes(pc(midi)))) {
      midi = nearestPitchWithPc(midi, c.stable, x.s >= 0 ? 1 : -1);
    }
    return { beat, dur: x.d, midi, vel: 0.7, strong: strong || i === tail.length - 1, voice: 'lead' };
  });
  return [...headNotes, ...tailNotes];
}

/** Shape dynamics: accent block starts, soften phrase endings. */
function shape(notes: MelodyNote[], base: number): void {
  notes.forEach((x, i) => {
    let v = base;
    if (i === 0) v += 0.08;
    if (x.strong) v += 0.05;
    if (i === notes.length - 1) v -= 0.08;
    x.vel = Math.max(0.15, Math.min(1, v));
  });
}

export interface SectionMelodyOptions {
  section: 'A' | 'B';
  /** The section's 8 chords. */
  chords: readonly Chord[];
  /** The current theme (motif X). */
  theme: Motif;
  rng: () => number;
  /** Small variation index (which A of the form) for tail choice. */
  variant?: number;
  range?: MelodyRange;
  /** Tonic pitch class the cadences land on (default D; music ambiences may move it). */
  tonic?: number;
  /** Pitch classes for open (non-final) phrase endings (default A, E, G, C). */
  open?: readonly number[];
}

/** Compose the melody of one 8-bar section. */
export function composeSectionMelody(o: SectionMelodyOptions): MelodyNote[] {
  const range = o.range ?? MELODY_RANGE;
  const ch = o.chords;
  const rng = o.rng;
  const out: MelodyNote[] = [];
  const tonic = o.tonic ?? TONIC_PC;
  const open = (o.open ?? [9, 4, 7, 0]).filter((p) => p !== tonic); // default A, E, G, C
  const tail = CADENCE_TAILS[(o.variant ?? 0) % CADENCE_TAILS.length];
  const head = (m: Motif) => m.filter((x) => x.t < 4);

  if (o.section === 'A') {
    const X = o.theme;
    const ax = anchorNear(range.center, ch[0]);
    const x1 = realizeMotif(X, 0, ch, ax, range);
    // Y: the theme sequenced up/down a third (or inverted), with a new rhythm detail.
    const r = rng();
    const base = r < 0.3 ? varyMotif(X, rng, 'invert') : shiftMotif(X, r < 0.65 ? 2 : -2);
    const Y = varyMotif(base, rng, (['ornament', 'syncopate', 'tail'] as const)[Math.floor(rng() * 3)]);
    const lastX = x1[x1.length - 1]?.midi ?? ax;
    const y = realizeMotif(Y, 8, ch, anchorNear(lastX, ch[2]), range, (lastX + range.center) / 2);
    forceEnding(y, ch[3].stable.filter((p) => open.includes(p)), range);
    const x2 = realizeMotif(X, 16, ch, ax, range);
    const z = cadence(head(X), tail, ch, ax, range, tonic);
    shape(x1, 0.7);
    shape(y, 0.72);
    shape(x2, 0.74);
    shape(z, 0.66);
    out.push(...x1, ...y, ...x2, ...z);
  } else {
    // B: new colour from the theme, with an echoing answer.
    const W = varyMotif(o.theme, rng, rng() < 0.6 ? 'invert' : 'shift');
    const aw = anchorNear(range.center + 2, ch[0]);
    const w1 = realizeMotif(W, 0, ch, aw, range);
    const echoRange: MelodyRange = { lo: range.lo - 12, hi: range.hi - 12, center: range.center - 12 };
    const e = realizeMotif(varyMotif(W, rng, 'shift'), 8, ch, anchorNear(aw - 12, ch[2]), echoRange);
    e.forEach((x) => (x.voice = 'echo'));
    forceEnding(e, ch[3].stable.filter((p) => open.includes(p)), echoRange);
    const W2 = varyMotif(W, rng, rng() < 0.5 ? 'ornament' : 'syncopate');
    const lastW = w1[w1.length - 1]?.midi ?? aw;
    const w2 = realizeMotif(W2, 16, ch, anchorNear(lastW, ch[4]), range, (lastW + range.center) / 2);
    const lastW2 = w2[w2.length - 1]?.midi ?? lastW;
    const z = cadence(head(W2), tail, ch, anchorNear(lastW2, ch[6]), range, tonic);
    shape(w1, 0.7);
    shape(e, 0.5);
    shape(w2, 0.72);
    shape(z, 0.64);
    out.push(...w1, ...e, ...w2, ...z);
  }
  return out;
}
