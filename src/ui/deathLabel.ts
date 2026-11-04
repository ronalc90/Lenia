/**
 * The 2 s label where a creature went dark (ADR-030 §2.5), for every death, not only the first one's card
 * (QA-CLARIDAD-2 C7: after the first explanation, living creatures that faded in open agar went silent).
 * Pure: the cause from the bus, whether it was a living (stable) creature, and whether the fusion card was seen.
 */
import type { GameEvents } from '../core/bus';
import type { Text } from '../core/types';
import { TEXT } from '../game/content';

export function deathLabel(cause: GameEvents['creatureDied']['cause'], alive: boolean): Text | null {
  if (cause === 'glass') return alive ? TEXT.deathGlassAlive : TEXT.deathGlass;
  if (cause === 'crowd') return TEXT.deathCrowd;
  return alive ? TEXT.deathLost : TEXT.deathFaded;
}

/** Matter that went shapeless: a fusion (once its card taught it), or a living creature that fell apart alone. */
export function shapelessLabel(cause: GameEvents['creatureExploded']['cause'] | null, alive: boolean, mergeTold: boolean): Text | null {
  if (cause === 'touch') return mergeTold ? TEXT.merged : null;
  // A flooded dish has its own warning (overgrowth); a spore that never was a creature needs none.
  if (cause === 'crowd' || !alive) return null;
  return TEXT.shapeLost;
}
