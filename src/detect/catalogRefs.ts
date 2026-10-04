/**
 * Reference signatures of Chan's catalog species, measured by
 * scripts/calibrate-detector.ts (regenerate catalogSignatures.json after changing
 * the detector or the signature layout). The game uses them to reveal the real
 * name of a registered species ("Orbium unicaudatus") and as references.
 */
import type { Behavior } from '../core/types';
import raw from './catalogSignatures.json';
import { SIG_LENGTH, SIG_UNKNOWN, SPECIES_MATCH_THRESHOLD, signatureDistance } from './signature';

export interface CatalogRef {
  code: string;
  /** Latin catalog name. */
  name: string;
  /** False when the species does not survive (or explodes) under our implementation. */
  viable: boolean;
  signature: number[];
  /** Behaviour the detector assigns at catalog params (null if not viable). */
  behavior: Behavior | null;
  /** Complexity at catalog params (Orbium ≈ 1). */
  complexity: number;
  mu: number;
  sigma: number;
  R: number;
}

export const CATALOG_REFS: readonly CatalogRef[] = raw as CatalogRef[];

/** True once the dynamic (behaviour) part of a signature is known. */
export function signatureComplete(sig: number[]): boolean {
  return sig.length >= SIG_LENGTH && sig.every((v) => v !== SIG_UNKNOWN);
}

/**
 * Closest viable catalog species within the species threshold, or null.
 * Works with static-only signatures too (young creatures), but is more reliable
 * once `signatureComplete(sig)`.
 */
export function matchCatalog(sig: number[], threshold = SPECIES_MATCH_THRESHOLD): CatalogRef | null {
  let best: CatalogRef | null = null;
  let bestD = threshold;
  for (const r of CATALOG_REFS) {
    if (!r.viable) continue;
    const d = signatureDistance(sig, r.signature);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}
