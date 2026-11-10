/**
 * «There is more below» on a session card (QA-4 N16: the report's «Tu dedo…» and the start card's «Nuevo desde la
 * última vez» ended cut under the sticky buttons with nothing saying the card went on). The card wears `more` while
 * content is hidden below; its CSS draws a fade and a chevron over the buttons' edge.
 */
export function moreBelow(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
  return scrollHeight - scrollTop - clientHeight > 8;
}

/** Keep `card`'s `more` class true to its scroll. Returns the updater (call it after the card's content changes). */
export function scrollCue(card: HTMLElement): () => void {
  const update = () => card.classList.toggle('more', moreBelow(card.scrollTop, card.clientHeight, card.scrollHeight));
  card.addEventListener('scroll', update, { passive: true });
  return update;
}
