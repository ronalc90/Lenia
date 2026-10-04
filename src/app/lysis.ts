/**
 * Lysis: the lab dissolves shapeless matter as soon as the detector flags it, before it grows into
 * the maze that floods the dish (docs/DISH.md: two or more creatures that merge, or seeds sown on top
 * of each other, nucleate a saturated Turing pattern that no growth penalty can stop; erasing the
 * runaway component prevented 7 of 7 mazes in the CPU study).
 *
 * Only components the detector itself calls "exploded" (mass runaway or oversized) are dissolved,
 * and only while the dish is not already flooded: a flooded dish goes through the overgrown banner
 * and its free "Limpiar placa" instead. Exploded matter never pays (CLAUDE.md hard gate), so
 * dissolving it costs the player nothing.
 */
import type { DetectorReport } from '../core/types';

/**
 * Smallest exploded mass worth dissolving, in R² units. Living catalog forms weigh 0.4–0.8 R²
 * (Orbium 0.44, Gyrorbium 0.59, Scutium 0.83 at R 13, CPU reference): a component flagged as a
 * runaway is only dissolved once it is clearly bigger than any creature, so a mis-flagged birth
 * is never erased.
 */
export const LYSIS_MIN_MASS_R2 = 2;
/** Erase radius = this × radius of gyration (a disc's edge is at √2 rg, a bar's tip at √3 rg)… */
export const LYSIS_RADIUS_RG = 2.2;
/** …plus this many R, so the soft edge of the erase also takes the blob's faint rim. */
export const LYSIS_RADIUS_PAD_R = 0.5;

export interface LysisTarget {
  id: number;
  x: number;
  y: number;
  radius: number;
}

/** Components of `report` to dissolve now (empty when the dish is flooded or nothing ran away). */
export function lysisTargets(report: DetectorReport, R: number, overgrownFill: number): LysisTarget[] {
  if (report.fill >= overgrownFill) return [];
  const minMass = LYSIS_MIN_MASS_R2 * R * R;
  const out: LysisTarget[] = [];
  for (const c of report.creatures) {
    if (c.state !== 'exploded' || c.mass < minMass) continue;
    out.push({ id: c.id, x: c.x, y: c.y, radius: LYSIS_RADIUS_RG * c.radius + LYSIS_RADIUS_PAD_R * R });
  }
  return out;
}

/** At most one "dissolved" toast in this many ms (the first of a session explains why). */
export const LYSIS_TOAST_MS = 45_000;
