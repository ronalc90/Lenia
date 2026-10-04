/**
 * The harmonic form of the score: 8-bar sections arranged A A B A (32 bars,
 * ≈ 101 s at 76 BPM), looping forever. Pure and deterministic.
 *
 *   A: Dm9 | Bbmaj7 | Fmaj7 | C6/9 | Dm9 | Bbmaj7 | G6/9 | A7sus4
 *   B: Bbmaj7 | C6/9 | Am9 | Dm9 | Gm9 | Bbmaj7 | Fmaj7 | A7sus4
 *
 * A is the theme: the Bb → B natural lift in bar 7 (Bbmaj7 → G6/9) is the
 * "curious" brightening, and A7sus4 floats back to Dm9 without a hard
 * leading tone. B opens with a deceptive move (A7sus4 → Bbmaj7) for contrast.
 */
import { CHORDS, type Chord, type ChordName } from './theory';

export const BPM = 76;
export const BEATS_PER_BAR = 4;
export const SECONDS_PER_BEAT = 60 / BPM;
export const SECONDS_PER_BAR = SECONDS_PER_BEAT * BEATS_PER_BAR;

export type SectionName = 'A' | 'B';

export const SECTIONS: Record<SectionName, readonly ChordName[]> = {
  A: ['Dm9', 'Bbmaj7', 'Fmaj7', 'C69', 'Dm9', 'Bbmaj7', 'G69', 'A7sus4'],
  B: ['Bbmaj7', 'C69', 'Am9', 'Dm9', 'Gm9', 'Bbmaj7', 'Fmaj7', 'A7sus4'],
};

export const FORM: readonly SectionName[] = ['A', 'A', 'B', 'A'];
export const BARS_PER_SECTION = 8;
export const BARS_PER_FORM = FORM.length * BARS_PER_SECTION;

export interface BarInfo {
  /** Absolute bar index since the score (re)started. */
  bar: number;
  chord: Chord;
  /** Chord of the following bar (for bass approach notes). */
  next: Chord;
  section: SectionName;
  /** 0..7 inside the 8-bar section. */
  barInSection: number;
  /** Absolute 8-bar section counter. */
  sectionIndex: number;
  /** Which pass through the whole A A B A form. */
  formIndex: number;
  /** 0..3 position of the section inside the form. */
  sectionInForm: number;
}

function chordFor(bar: number): { chord: Chord; section: SectionName; barInSection: number; sectionIndex: number } {
  const b = Math.max(0, Math.floor(bar));
  const sectionIndex = Math.floor(b / BARS_PER_SECTION);
  const section = FORM[sectionIndex % FORM.length];
  const barInSection = b % BARS_PER_SECTION;
  return { chord: CHORDS[SECTIONS[section][barInSection]], section, barInSection, sectionIndex };
}

export function barInfo(bar: number): BarInfo {
  const cur = chordFor(bar);
  const nxt = chordFor(bar + 1);
  return {
    bar: Math.max(0, Math.floor(bar)),
    chord: cur.chord,
    next: nxt.chord,
    section: cur.section,
    barInSection: cur.barInSection,
    sectionIndex: cur.sectionIndex,
    formIndex: Math.floor(cur.sectionIndex / FORM.length),
    sectionInForm: cur.sectionIndex % FORM.length,
  };
}

/** The 8 chords of the section that contains `bar`. */
export function sectionChords(bar: number): Chord[] {
  const { section } = chordFor(bar);
  return SECTIONS[section].map((n) => CHORDS[n]);
}
