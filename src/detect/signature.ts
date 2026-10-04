/**
 * Species signatures. PLACEHOLDER written by the integrator so other modules can
 * import it; the detector owner replaces the internals (keep the exported names).
 */

/** Distance below which two signatures are the same species. */
export const SPECIES_MATCH_THRESHOLD = 0.15;

/** Normalized distance between two signatures (0 = identical). */
export function signatureDistance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Infinity;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = (a[i] - b[i]) / (Math.abs(a[i]) + Math.abs(b[i]) + 1e-6);
    s += d * d;
  }
  return Math.sqrt(s / n);
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
