/**
 * Which Encargo bubble shows next, as a pure rule (no DOM): src/ui/story/encargoUI.ts renders it.
 *
 * QA-4 N5 (c1-104): when a night opens, several requests arrive at once (the Committee's, Albor's, VELA's) and came
 * as three cards in a row over the dish. Offers waiting together now make one card, «3 encargos nuevos», that lists
 * them; the objective bar and its «?» keep the detail. A cheer («¡Encargo cumplido!») keeps its own turn.
 */
import type { Text } from '../../core/types';
import type { EncargoDone, EncargoView } from '../../story/encargos';

export type EncargoItem = { kind: 'offer'; view: EncargoView } | { kind: 'cheer'; done: EncargoDone };
export type EncargoBubble = EncargoItem | { kind: 'offers'; views: EncargoView[] };

/** On-screen time of one offer and of a cheer (s), as they were before batching. */
export const OFFER_SECONDS = 6.5;
export const CHEER_SECONDS = 4.2;
/** Each extra request in a batch adds this much reading time (s): one short line each. */
export const OFFER_EXTRA_SECONDS = 1.5;

/** The next bubble and what stays queued. Offers already done are dropped (their cheer tells it). */
export function nextBubble(queue: readonly EncargoItem[], done: ReadonlySet<string>): { bubble: EncargoBubble | null; rest: EncargoItem[] } {
  const live = queue.filter((it) => !(it.kind === 'offer' && done.has(it.view.id)));
  const head = live[0];
  if (!head) return { bubble: null, rest: [] };
  if (head.kind === 'cheer') return { bubble: head, rest: live.slice(1) };
  const views = live.filter((it): it is Extract<EncargoItem, { kind: 'offer' }> => it.kind === 'offer').map((it) => it.view);
  const rest = live.filter((it) => it.kind !== 'offer');
  return { bubble: views.length > 1 ? { kind: 'offers', views } : head, rest };
}

/** How long a bubble stays (s). */
export function bubbleSeconds(b: EncargoBubble): number {
  if (b.kind === 'cheer') return CHEER_SECONDS;
  if (b.kind === 'offer') return OFFER_SECONDS;
  return OFFER_SECONDS + OFFER_EXTRA_SECONDS * (b.views.length - 1);
}

/** The batch card's tag. */
export function offersTitle(n: number): Text {
  return { es: `${n} encargos nuevos`, en: `${n} new requests` };
}
