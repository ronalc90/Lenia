/**
 * Contract between the dish effects (Package A, src/ui/fx/**) and the HUD (Package B, src/ui/ui.ts):
 * where a flying mote lands and how the HUD answers (docs/ARTE-PULIDO.md §4 A-5, B-6).
 */
import type { Quality } from '../../core/types';

export type FxAnchorId = 'essence' | 'datos' | 'clock' | 'bestiary';

export interface FxAnchors {
  /** Rectangle in CSS px of the viewport of the destination (the HUD icon), or null if not visible. */
  rect(id: FxAnchorId): DOMRect | null;
  /** A mote (or a group of `n`) arrived: the HUD reacts (B-6). */
  arrive(id: FxAnchorId, n: number): void;
}

/** Anchors that know nothing: motes fly to the fallback point and nothing reacts. */
export const NO_ANCHORS: FxAnchors = {
  rect: () => null,
  arrive: () => undefined,
};

/**
 * Effect budgets per profile (docs/ARTE-PULIDO.md §6.1). The grid quality picks the profile; a
 * device that cannot hold 45 fps for 2 s steps down one profile of effects (never of simulation).
 */
export interface FxProfile {
  /** Particle pool capacity (A-10). */
  particles: number;
  /** Esencia motes in flight at once (A-5). */
  fly: number;
  /** Ambient motes over the agar (A-8). */
  motes: number;
  /** Grain refresh rate, Hz (A-3). */
  grainHz: number;
  /** Specular glint on the glass (A-11). */
  glint: boolean;
}

export const FX_PROFILE: Record<Quality, FxProfile> = {
  low: { particles: 128, fly: 6, motes: 16, grainHz: 12, glint: false },
  medium: { particles: 256, fly: 12, motes: 28, grainHz: 24, glint: false },
  high: { particles: 384, fly: 12, motes: 28, grainHz: 24, glint: true },
};

/** The next profile down (effects only). */
export function lowerProfile(q: Quality): Quality {
  return q === 'high' ? 'medium' : 'low';
}
