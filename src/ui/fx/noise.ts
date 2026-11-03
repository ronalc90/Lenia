/**
 * Smooth deterministic 1D value noise (no Math.random, no allocation): camera shake (A-9) and the
 * drift of ambient motes (A-8) wander instead of jittering per frame.
 */

/** Integer hash → [0, 1). */
export function hash1(i: number, seed: number): number {
  let h = Math.imul(i | 0, 0x8da6b343) ^ Math.imul(seed | 0, 0xcb1ab31f);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 8) / 16777216;
}

/** Smooth value noise in [-1, 1] at position x (one lattice point per unit), per seed. */
export function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash1(i, seed);
  const b = hash1(i + 1, seed);
  return (a + (b - a) * u) * 2 - 1;
}
