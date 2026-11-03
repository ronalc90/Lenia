/**
 * Is a spotlight target really on screen (owner bug, docs/ARTE-PULIDO.md B-10.1)? A rect alone says
 * nothing about what covers it: the Bestiary's dock button keeps its rect under the open drawer.
 * The test samples the centre and the four corners (inset 4 px) with `document.elementsFromPoint`.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The five sample points of a box: centre + corners inset by `inset` px. */
export function samplePoints(r: Box, inset = 4): [number, number][] {
  const i = Math.min(inset, r.w / 2, r.h / 2);
  return [
    [r.x + r.w / 2, r.y + r.h / 2],
    [r.x + i, r.y + i],
    [r.x + r.w - i, r.y + i],
    [r.x + i, r.y + r.h - i],
    [r.x + r.w - i, r.y + r.h - i],
  ];
}

/**
 * Share (0..1) of the sample points where the top-most element under the point is the target or inside
 * it. `topAt(x, y)` returns the top-most hit (ignoring pass-through layers); `isTarget(el)` says whether
 * an element is the target or one of its descendants.
 */
export function visibleShare<E>(r: Box, topAt: (x: number, y: number) => E | null, isTarget: (el: E) => boolean): number {
  const pts = samplePoints(r);
  let seen = 0;
  for (const [x, y] of pts) {
    const top = topAt(x, y);
    if (top !== null && isTarget(top)) seen++;
  }
  return seen / pts.length;
}

/** Visible enough to point at: at least 3 of the 5 points show the target. */
export const VISIBLE_SHARE = 0.6;
