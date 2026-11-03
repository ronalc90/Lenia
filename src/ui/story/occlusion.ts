/**
 * Is a spotlight target really on screen (owner bug, docs/ARTE-PULIDO.md B-10.1)? A rect alone says
 * nothing about what covers it: the Bestiary's dock button keeps its rect under the open drawer.
 * The test samples the centre and four points near the corners with `document.elementsFromPoint`.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Corner samples sit this share of the box's short side inside it: deep enough to land inside a rounded
 * corner, even a pill's (radius = half the short side needs ≥ 0.15), so a visible button is never
 * "covered" by its own parent (integrator review of v0.019).
 */
export const CORNER_INSET_SHARE = 0.3;

/** The five sample points of a box: centre + four points near the corners (see CORNER_INSET_SHARE). */
export function samplePoints(r: Box, minInset = 4): [number, number][] {
  const i = Math.min(Math.max(minInset, CORNER_INSET_SHARE * Math.min(r.w, r.h)), r.w / 2, r.h / 2);
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
