/**
 * One placement solver for every message over the dish: the overlay's canvas labels (why a seed went dark,
 * a new behaviour, «¡Lista!») and the Momento brief (integrator review v0.023, shot 06). Two rules:
 *
 *  - two messages never overlap (a slot under another message or a control is never used);
 *  - a message never covers a living creature's body while some slot is free of bodies; when none is, it
 *    takes the slot that covers the least (docs/ARTE.md §10: one thing at a time, and the creature first).
 *
 * Slots, in order of preference: above the anchor, below it, a step further above, below… then left and
 * right. A label keeps last frame's slot while that slot stays clear, so it does not jump as things move.
 * Pure and allocation-free: obstacles are flat arrays the overlay already keeps per frame.
 *
 * The HUD's chips under the Luz counter (the streak, a gift) have one home and step down instead (`stackLabel`):
 * under the objective pill, a toast or VELA's top line, never under them (QA-3 N3).
 */

export interface LabelObstacles {
  /** Other messages and controls as l, t, r, b quadruples: never overlapped. */
  boxes: ArrayLike<number>;
  nBoxes: number;
  /** Living creatures' bodies as x, y, r triples: stepped off while there is room. */
  discs: ArrayLike<number>;
  nDiscs: number;
}

export interface LabelRequest {
  /** The event's point on screen. */
  x: number;
  y: number;
  /** The label's size. */
  w: number;
  h: number;
  /** Air between the anchor and the label's near edge in the nearest slots. */
  gap: number;
  /** Where the label may go. */
  bounds: { l: number; t: number; r: number; b: number };
  /** Last frame's slot (-1 or absent = none). */
  slot?: number;
}

export interface LabelPlacement {
  /** Centre of the label. */
  x: number;
  y: number;
  slot: number;
  /** No body under it (another message never is). */
  clear: boolean;
}

/** Above / below at three distances, then left and right. */
export const LABEL_SLOTS = 8;
/** Air kept between two messages (px). */
const MSG_AIR = 4;
/** Extra air between the rows of slots (px). */
const ROW_AIR = 8;

const cand = { x: 0, y: 0 };

/** Centre of slot k, or false when the slot does not fit the bounds on its free axis. */
function slotAt(r: LabelRequest, k: number): boolean {
  const { l, t, r: right, b } = r.bounds;
  const hw = r.w / 2;
  const hh = r.h / 2;
  if (k < 6) {
    const row = k >> 1;
    const d = r.gap + hh + row * (r.h + ROW_AIR);
    cand.y = k & 1 ? r.y + d : r.y - d;
    if (cand.y - hh < t || cand.y + hh > b) return false;
    cand.x = Math.min(right - hw, Math.max(l + hw, r.x));
    return true;
  }
  cand.x = k === 6 ? r.x - r.gap - hw : r.x + r.gap + hw;
  if (cand.x - hw < l || cand.x + hw > right) return false;
  cand.y = Math.min(b - hh, Math.max(t + hh, r.y));
  return true;
}

function hitsMessage(o: LabelObstacles, x0: number, y0: number, x1: number, y1: number): boolean {
  const q = o.boxes;
  for (let i = 0; i < o.nBoxes; i++) {
    const k = i * 4;
    if (x0 < q[k + 2] + MSG_AIR && x1 > q[k] - MSG_AIR && y0 < q[k + 3] + MSG_AIR && y1 > q[k + 1] - MSG_AIR) return true;
  }
  return false;
}

/** How deep the bodies reach into the box (0 = it covers none). */
function bodyCover(o: LabelObstacles, x0: number, y0: number, x1: number, y1: number): number {
  const q = o.discs;
  let sum = 0;
  for (let i = 0; i < o.nDiscs; i++) {
    const k = i * 3;
    const cx = q[k];
    const cy = q[k + 1];
    const dx = cx < x0 ? x0 - cx : cx > x1 ? cx - x1 : 0;
    const dy = cy < y0 ? y0 - cy : cy > y1 ? cy - y1 : 0;
    const d = q[k + 2] - Math.hypot(dx, dy);
    if (d > 0) sum += d;
  }
  return sum;
}

/**
 * Where the label goes. Returns false when every slot lies under another message or a control (the caller
 * hides the label this frame, or falls back to its own rule); `out` then holds the nearest slot.
 */
export function placeLabel(r: LabelRequest, o: LabelObstacles, out: LabelPlacement): boolean {
  const hw = r.w / 2;
  const hh = r.h / 2;
  let best = -1;
  let bestCover = Infinity;
  let bx = 0;
  let by = 0;
  let first = true;
  const kept = r.slot ?? -1;
  // The kept slot is tried first; then the others in order of preference.
  for (let n = -1; n < LABEL_SLOTS; n++) {
    const k = n < 0 ? kept : n;
    if (k < 0 || (n >= 0 && k === kept) || !slotAt(r, k)) continue;
    if (first) {
      out.x = cand.x;
      out.y = cand.y;
      out.slot = k;
      out.clear = false;
      first = false;
    }
    const x0 = cand.x - hw;
    const y0 = cand.y - hh;
    const x1 = cand.x + hw;
    const y1 = cand.y + hh;
    if (hitsMessage(o, x0, y0, x1, y1)) continue;
    const cover = bodyCover(o, x0, y0, x1, y1);
    if (cover < bestCover) {
      bestCover = cover;
      best = k;
      bx = cand.x;
      by = cand.y;
      if (cover === 0) break;
    }
  }
  if (first) {
    // No slot fits the bounds (a label wider than the room): the nearest one, clamped.
    out.x = Math.min(r.bounds.r - hw, Math.max(r.bounds.l + hw, r.x));
    out.y = Math.min(r.bounds.b - hh, Math.max(r.bounds.t + hh, r.y - r.gap - hh));
    out.slot = 0;
    out.clear = false;
    return !hitsMessage(o, out.x - hw, out.y - hh, out.x + hw, out.y + hh);
  }
  if (best < 0) return false;
  out.x = bx;
  out.y = by;
  out.slot = best;
  out.clear = bestCover === 0;
  return true;
}

/** A message with a home spot (its centre) that steps down past whatever covers it (`stackLabel`). */
export interface StackRequest {
  x: number;
  y: number;
  w: number;
  h: number;
  bounds: { l: number; t: number; r: number; b: number };
}

/**
 * Where a chip with a home goes (the streak chip under the Luz counter, QA-3 N3: the objective pill hid it): home
 * when nothing covers it, else just below the message it would overlap, and below the next one, while it stays
 * inside the bounds. Same rule as placeLabel: two messages never overlap. False when it runs out of room below
 * (`out` then holds its home); bodies are ignored (the chip lives on the dish's rim, over the glass).
 */
export function stackLabel(r: StackRequest, o: LabelObstacles, out: LabelPlacement): boolean {
  const hw = r.w / 2;
  const hh = r.h / 2;
  let y = r.y;
  const q = o.boxes;
  out.x = r.x;
  out.slot = -1;
  out.clear = true;
  // Each step clears one obstacle for good (it only moves down), so nBoxes + 1 steps are enough.
  for (let step = 0; step <= o.nBoxes; step++) {
    if (y + hh > r.bounds.b) break;
    let below = -Infinity;
    for (let i = 0; i < o.nBoxes; i++) {
      const k = i * 4;
      const hit = r.x - hw < q[k + 2] + MSG_AIR && r.x + hw > q[k] - MSG_AIR && y - hh < q[k + 3] + MSG_AIR && y + hh > q[k + 1] - MSG_AIR;
      if (hit && q[k + 3] > below) below = q[k + 3];
    }
    if (below === -Infinity) {
      out.y = y;
      return true;
    }
    y = below + MSG_AIR + hh;
  }
  out.y = r.y;
  return false;
}
