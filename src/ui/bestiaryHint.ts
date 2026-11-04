/**
 * When a creature counts for the collection (QA-CLARIDAD-2 C4): creatures labelled «Viva» are not in the
 * Bestiary until the detector has watched a finished form (balance.SPECIES_MIN_STABLE_STEPS stable steps), and
 * the Bestiary said «Aún no hay nadie» with one alive on the dish. Said once, where the player looks.
 */
import type { GameView, Text } from '../core/types';
import { SPECIES_MIN_STABLE_STEPS } from '../game/balance';
import { SESSION_SIM_PACE, SIM_STEPS_PER_SEC } from '../game/cycleBalance';

/** Seconds a creature stays «Viva» before a new species is written down, at the session pace, to the nearest 5 s. */
export const COLLECT_AFTER_S = Math.max(5, Math.round(SPECIES_MIN_STABLE_STEPS / (SIM_STEPS_PER_SEC * SESSION_SIM_PACE) / 5) * 5);

/** The empty Bestiary's line while a creature is alive but has no species yet; null otherwise (the usual line). */
export function bestiaryEmptyHint(v: Pick<GameView, 'species' | 'creatures'>): Text | null {
  if (v.species.length > 0 || !v.creatures.some((c) => c.state === 'stable' || c.state === 'born')) return null;
  const n = COLLECT_AFTER_S;
  return {
    es: `Tu criatura aún no tiene nombre. Cuando lleve unos ${n} s «Viva» sin chocar, VELA la apunta aquí.`,
    en: `Your creature has no name yet. Once it has been “Alive” for about ${n} s without bumping into anything, VELA writes it down here.`,
  };
}
