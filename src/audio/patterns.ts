/**
 * Rhythmic material: arpeggio shapes, bass figures and soft percussion
 * grids. Patterns are indices into a chord "pool" so one shape keeps its
 * identity while the harmony moves underneath it. Pure.
 */
import type { Chord } from './theory';
import { bassPitch, pitchesInRange, scaleStep } from './theory';

/** Arpeggio register (A3..A5). */
export const ARP_LO = 57;
export const ARP_HI = 81;

/** Chord tones available to the arpeggio, ascending, starting near `start`. */
export function arpPool(c: Chord, start = 62, size = 8): number[] {
  const all = pitchesInRange(c.tones, ARP_LO, ARP_HI + 7);
  // First pool note: the chord tone closest to `start` (at or above ARP_LO).
  let i0 = 0;
  for (let i = 0; i < all.length; i++) if (Math.abs(all[i] - start) < Math.abs(all[i0] - start)) i0 = i;
  i0 = Math.max(0, Math.min(i0, all.length - size));
  return all.slice(i0, i0 + size);
}

/**
 * 8-step (eighth-note) shapes; values index the pool, -1 = rest.
 * Each one is a recognisable figure: up-down, broken thirds, pedal, wave.
 */
export const ARP8: readonly (readonly number[])[] = [
  [0, 2, 4, 5, 3, 4, 2, 1],
  [0, 3, 1, 4, 2, 5, 3, 4],
  [0, 4, 2, 4, 1, 4, 2, 4],
  [1, 3, 5, 3, 0, 2, 4, 2],
  [0, 2, 3, 5, 6, 5, 3, 2],
  [2, 0, 3, 1, 4, 2, 5, 3],
];

/**
 * Explicit 16-step shapes for the top intensity (-1 = rest). Designed as
 * clear figures — pedal tones, broken cells, falling pairs — so the busy
 * layer still reads as a pattern rather than random notes.
 */
export const ARP16: readonly (readonly number[])[] = [
  [0, -1, 4, 2, 5, -1, 4, 2, 0, -1, 4, 2, 6, -1, 5, 4],
  [0, 4, 2, 4, 5, 4, 2, 4, 1, 4, 3, 4, 6, 4, 3, 4],
  [4, -1, 2, 0, 5, -1, 2, 0, 6, -1, 3, 1, 5, -1, 2, 0],
  [0, 2, 4, 7, 4, 2, -1, 2, 1, 3, 5, 7, 5, 3, -1, 3],
];

export interface PercHit {
  /** 16th step 0..15 */
  step: number;
  vel: number;
}

/** Felt kick: beat 1 and the "and" of 3 (laid-back half-time). */
export const KICK: readonly PercHit[] = [
  { step: 0, vel: 0.9 },
  { step: 10, vel: 0.6 },
];
/** Extra kick pickup on the last bar of a section. */
export const KICK_FILL: readonly PercHit[] = [{ step: 14, vel: 0.45 }];
/** Soft rim / brush tap on beat 3. */
export const RIM: readonly PercHit[] = [{ step: 8, vel: 0.55 }];
/** Brushed hat on the off-beats with a ghost before beat 3 and 1. */
export const HAT: readonly PercHit[] = [
  { step: 2, vel: 0.55 },
  { step: 6, vel: 0.5 },
  { step: 7, vel: 0.2 },
  { step: 10, vel: 0.55 },
  { step: 14, vel: 0.5 },
  { step: 15, vel: 0.18 },
];
/** Shaker: every 16th with an accent shape. */
export const SHAKER: readonly PercHit[] = Array.from({ length: 16 }, (_, i) => ({
  step: i,
  vel: [0.6, 0.22, 0.38, 0.22][i % 4] * (i % 8 === 4 ? 1.1 : 1),
}));

/** 16th swing amount: off-16ths are delayed by this fraction of a 16th. */
export const SWING = 0.12;

export interface BassNote {
  beat: number;
  dur: number;
  midi: number;
  vel: number;
}

export const BASS_LO = 33; // A1
export const BASS_HI = 45; // A2

/**
 * Bass figure for one bar.
 *  level 1-2: one long root.
 *  level 3:   root + fifth pickup on beat 4.
 *  level 4-5: root, re-strike on 2&, fifth on 3, approach note into the next root.
 */
export function bassBar(c: Chord, next: Chord, level: number, prev?: number): BassNote[] {
  const root = bassPitch(c.root, BASS_LO, BASS_HI, prev);
  const fifthUp = root + 7;
  const fifthDown = root - 5;
  const fifth = fifthUp <= BASS_HI + 4 ? fifthUp : fifthDown;
  if (level <= 2) return [{ beat: 0, dur: 4, midi: root, vel: 0.8 }];
  if (level === 3) {
    return [
      { beat: 0, dur: 3, midi: root, vel: 0.82 },
      { beat: 3, dur: 1, midi: fifth, vel: 0.55 },
    ];
  }
  const nextRoot = bassPitch(next.root, BASS_LO, BASS_HI, root);
  // Approach the next root by one step of the current chord-scale (from below when rising).
  const approach = nextRoot === root ? fifth : scaleStep(nextRoot, nextRoot > root ? -1 : 1, c.scale);
  return [
    { beat: 0, dur: 1.5, midi: root, vel: 0.85 },
    { beat: 1.5, dur: 0.5, midi: root, vel: 0.5 },
    { beat: 2, dur: 1.5, midi: fifth, vel: 0.62 },
    { beat: 3.5, dur: 0.5, midi: approach, vel: 0.5 },
  ];
}
