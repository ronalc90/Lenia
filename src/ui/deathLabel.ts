/**
 * The 2 s label where a creature went dark (ADR-030 §2.5), for every death, not only the first one's card
 * (QA-CLARIDAD-2 C7: after the first explanation, living creatures that faded in open agar went silent).
 *
 * ADR-031 (docs/MECANICAS.md §4): every loss is named where it happens AND says what it left. A living creature's
 * light stays on the dish («su luz quedó aquí»); a seed that never took gives its price back («No prendió · +4 de
 * vuelta»); a blob VELA dissolves never was a creature and pays nothing. Never a scolding («Muy cerca», «¡Cuidado!»).
 * Pure: the cause from the bus, whether it was a living (stable) creature, and whether the fusion card was seen.
 */
import type { GameEvents } from '../core/bus';
import type { Text } from '../core/types';
import { TEXT } from '../game/content';
import { STRINGS } from './i18n';

/** What a seed that never took gave back (bus 'seedRefund'). */
export interface Refund {
  amount: number;
  free: boolean;
}

export function refundLabel(r: Refund): Text {
  return r.free ? TEXT.refundFree : TEXT.refund(Math.round(r.amount));
}

/**
 * A creature went dark. A living one says its cause and that its light stayed; a seed that never took says
 * what came back (`refund`, when the game gives seeds back: ADR-031) or, from an older game, why it faded.
 */
export function deathLabel(cause: GameEvents['creatureDied']['cause'], alive: boolean, refund?: Refund | null): Text | null {
  if (alive) {
    if (cause === 'glass') return TEXT.glassLeft;
    if (cause === 'crowd') return STRINGS.crowdLeft;
    return TEXT.lostLeft;
  }
  if (refund) return refundLabel(refund);
  if (cause === 'glass') return TEXT.deathGlass;
  if (cause === 'crowd') return TEXT.deathCrowd;
  return TEXT.deathFaded;
}

/** Matter that went shapeless: a fusion (once its card taught it), or a living creature that fell apart alone. */
export function shapelessLabel(cause: GameEvents['creatureExploded']['cause'] | null, alive: boolean, mergeTold: boolean): Text | null {
  if (cause === 'touch') return mergeTold ? TEXT.mergedLeft : null;
  // A flooded dish has its own warning (overgrowth); a spore that never was a creature needs none.
  if (cause === 'crowd' || !alive) return null;
  return TEXT.lostLeft;
}

/**
 * Shapeless matter dissolved (bus 'creatureDissolved'): VELA's lysis of a blob that kept growing says so; the
 * player's own tools (the Goma, cleaning the dish) and matter that never was a blob need no words.
 */
export function dissolvedLabel(wasBlob: boolean, byPlayer: boolean): Text | null {
  return wasBlob && !byPlayer ? TEXT.blobDissolved : null;
}

/** The first death of a cause ever (bus 'accidentLearned'): «aprendiste por qué», for its Datos. */
export function learnedLabel(cause: GameEvents['accidentLearned']['cause'], datos: number): Text {
  return cause === 'faded' ? TEXT.learnedSeed(datos) : TEXT.learned(datos);
}
