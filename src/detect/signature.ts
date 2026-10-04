/**
 * Species signatures: a fixed-length, position/rotation/mirror invariant vector that
 * describes a creature's morphology and behaviour (never μ/σ — the parameters a
 * species lives at are stored separately as a range).
 *
 * Layout (indices in `SIG`). Static features are always present; dynamic ones
 * need a classified track (≈1000 steps of history) and hold `SIG_UNKNOWN` (-1)
 * until then. `signatureDistance` skips any feature that is unknown on either side,
 * so a young creature can already be matched on its shape alone.
 */
export const SIG = {
  /** mass / R² (grid cells). */
  MASS: 0,
  /** radius of gyration / R. */
  RG: 1,
  /** mass / area: mean matter inside the creature's mask. */
  DENSITY: 2,
  /** gradient sum · R / mass: how "edgy" the body is. */
  EDGE: 3,
  /** Angular harmonics |Σ v r² e^{inφ}| / Σ v r², n = 1..6 (1 = head/tail polarity, 2 = elongation). */
  H1: 4,
  H2: 5,
  H3: 6,
  H4: 7,
  H5: 8,
  H6: 9,
  /** Mean number of connected components making up the creature. */
  PARTS: 10,
  /** Path speed · T / R (body radii per unit of time). Dynamic. */
  SPEED: 11,
  /** |angular velocity| · T (radians per unit of time) of heading or body. Dynamic. */
  TURN: 12,
  /** Relative amplitude of the dominant mass oscillation. Dynamic. */
  PULSE: 13,
  /** Frequency of that oscillation · T (cycles per unit of time). Dynamic. */
  FREQ: 14,
} as const;

export const SIG_LENGTH = 15;
/** Marker for a dynamic feature that is not known yet. All real features are ≥ 0. */
export const SIG_UNKNOWN = -1;

/**
 * Per-feature tolerance. Calibrated with scripts/calibrate-detector.ts on the catalog
 * species (random positions/rotations, steps 1100–2000): each scale is ≥ 4× the
 * worst within-species noise of that feature (pixel aliasing of the scale-2
 * snapshot, motion direction, time), while nearby parameters of the same species
 * (e.g. Orbium at μ 0.145–0.155, σ 0.014–0.017, R 12–14) stay within distance ~0.6.
 */
export const SIG_SCALES: readonly number[] = [
  0.03, // MASS
  0.02, // RG
  0.015, // DENSITY
  0.5, // EDGE
  0.012, // H1
  0.05, // H2
  0.05, // H3
  0.025, // H4
  0.025, // H5
  0.025, // H6
  0.4, // PARTS
  0.03, // SPEED
  0.15, // TURN
  0.04, // PULSE
  0.15, // FREQ
];

/** Relative weight of each feature in the distance. */
export const SIG_WEIGHTS: readonly number[] = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 1, 1, 1, 1];

/**
 * The pulsation frequency only counts when both creatures clearly pulse: its weight
 * ramps from 0 at PULSE = 0.03 to 1 at PULSE = 0.06.
 */
const PULSE_GATE_LO = 0.03;
const PULSE_GATE_HI = 0.06;

/** Distance below which two signatures are the same species. */
export const SPECIES_MATCH_THRESHOLD = 1.0;

/**
 * Normalized distance between two signatures: the weighted RMS of the per-feature
 * differences divided by the feature scales (0 = identical, 1 = every feature off by
 * its tolerance, or one feature off by ~4 tolerances). Features unknown on either
 * side are skipped, so static-only signatures compare on the same scale.
 */
export function signatureDistance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length, SIG_LENGTH);
  if (n === 0) return Infinity;
  let s = 0;
  let wsum = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    if (!(x >= 0) || !(y >= 0)) continue; // unknown (or NaN)
    let w = SIG_WEIGHTS[i];
    if (i === SIG.FREQ) {
      // A frequency is meaningless for creatures that barely pulse.
      const pa = a[SIG.PULSE] ?? 0;
      const pb = b[SIG.PULSE] ?? 0;
      w *= Math.max(0, Math.min(1, (Math.min(pa, pb) - PULSE_GATE_LO) / (PULSE_GATE_HI - PULSE_GATE_LO)));
      if (w <= 0) continue;
    }
    const d = (x - y) / SIG_SCALES[i];
    s += w * d * d;
    wsum += w;
  }
  if (wsum === 0) return Infinity;
  return Math.sqrt(s / wsum);
}

/** Index of the closest reference within the threshold, or -1. */
export function matchSignature(sig: number[], refs: number[][], threshold = SPECIES_MATCH_THRESHOLD): number {
  let best = -1;
  let bestD = threshold;
  refs.forEach((r, i) => {
    const d = signatureDistance(sig, r);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
