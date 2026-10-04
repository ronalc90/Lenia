/**
 * Maps game progress to a musical intensity level 0..5 and the per-layer mix
 * for each level. Pure.
 *
 *   0  empty dish             soft pad only
 *   1  first creature lives   + sub bass, species signature notes
 *   2  several species        + plucked arpeggio (eighths), sparkles
 *   3  ~10 essence/s          + bell melody
 *   4  ~40 essence/s          + brushed hat and shaker, busier bass
 *   5  ~250 essence/s         + felt kick, 16th arpeggio, wider stereo
 *
 * Thresholds follow the design doc's Era-1 curve (1 E/s at 3 min, 3-5 at
 * 8 min, 10-15 at 15 min, 40-60 at 30 min).
 */

export interface MusicState {
  eps: number;
  species: number;
  creatures: number;
  era: number;
  behaviors: number;
  paused: boolean;
  extinction?: boolean;
}

export const MAX_LEVEL = 5;

/** Continuous progress score; integer part ≈ level before gating. */
export function progressScore(s: MusicState): number {
  if (!(s.creatures > 0)) return 0;
  const eps = Math.max(0, Number.isFinite(s.eps) ? s.eps : 0);
  // eps: 1 → 1.0, 3 → 2.0, 10 → 3.0, 40 → 4.0, 250 → 5.0 (piecewise log).
  const epsScore = eps <= 0 ? 0 : interpLog(eps, [1, 3, 10, 40, 250], [1, 2, 3, 4, 5]);
  // Species and behaviours can also carry the music up (exploring is rewarded).
  // 2 species → 2 (arpeggio), 4 → 3.2 (melody), 6 → 4.4 (percussion), 7+ → 5.
  const speciesScore = s.species >= 2 ? Math.min(5, 2 + (s.species - 2) * 0.6) : s.species > 0 ? 1 : 0;
  const behaviorScore = Math.min(4.5, (s.behaviors ?? 0) * 0.9);
  // Later eras start a little warmer, but an empty dish stays quiet.
  const eraBonus = Math.min(0.6, Math.max(0, (s.era ?? 1) - 1) * 0.2);
  return Math.min(MAX_LEVEL + 0.999, Math.max(1, epsScore, speciesScore, behaviorScore) + eraBonus);
}

function interpLog(x: number, xs: number[], ys: number[]): number {
  if (x <= xs[0]) return ys[0] * Math.max(0, x / xs[0]);
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) {
      const f = (Math.log(x) - Math.log(xs[i - 1])) / (Math.log(xs[i]) - Math.log(xs[i - 1]));
      return ys[i - 1] + f * (ys[i] - ys[i - 1]);
    }
  }
  return ys[ys.length - 1] + Math.log10(x / xs[xs.length - 1]);
}

/**
 * Target level with hysteresis: rising needs the score to reach the next
 * integer, falling needs it to drop `margin` below the current level.
 */
export function targetLevel(s: MusicState, current: number, margin = 0.4): number {
  if (!(s.creatures > 0)) return 0;
  const score = progressScore(s);
  // A dish with a single kind of creature never reaches the percussion layers.
  const cap = s.species < 2 && s.behaviors < 2 ? 3 : MAX_LEVEL;
  let level = Math.max(1, Math.min(cap, Math.floor(score)));
  // Inside the hysteresis band: keep the current level.
  if (level < current && current <= cap && score > current - margin) level = current;
  return level;
}

export type Layer = 'pad' | 'bass' | 'arp' | 'mel' | 'perc' | 'orn';
export const LAYERS: readonly Layer[] = ['pad', 'bass', 'arp', 'mel', 'perc', 'orn'];

/** Relative layer gain per level (0 = layer off and not scheduled). */
export const LAYER_MIX: Record<Layer, readonly number[]> = {
  pad: [0.7, 0.72, 0.74, 0.74, 0.72, 0.7],
  bass: [0, 0.62, 0.7, 0.75, 0.8, 0.8],
  arp: [0, 0, 0.8, 0.8, 0.8, 0.78],
  mel: [0, 0, 0, 1, 1.05, 1.1],
  perc: [0, 0, 0, 0, 0.75, 1],
  orn: [0.5, 0.7, 0.8, 0.85, 0.9, 1],
};

/** Stereo width 0..1 per level (pad spread, arpeggio ping-pong). */
export const WIDTH: readonly number[] = [0.35, 0.4, 0.45, 0.5, 0.6, 0.85];

/** Pad low-pass cutoff (Hz) per level: the pad opens up as the dish fills. */
export const PAD_CUTOFF: readonly number[] = [650, 800, 950, 1100, 1300, 1550];

/** Probability per bar of a sparkle ornament. */
export const SPARKLE_PROB: readonly number[] = [0, 0, 0.3, 0.45, 0.55, 0.75];

export function layerGain(layer: Layer, level: number): number {
  const l = Math.max(0, Math.min(MAX_LEVEL, Math.round(level)));
  return LAYER_MIX[layer][l];
}

/** Step `current` one level towards `target` (levels move one bar at a time). */
export function stepLevel(current: number, target: number): number {
  if (target > current) return current + 1;
  if (target < current) return current - 1;
  return current;
}
