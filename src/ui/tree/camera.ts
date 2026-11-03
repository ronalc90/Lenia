/**
 * The Tree's camera rules as pure functions (docs/CLARIDAD2.md §2.10, QA-CLARIDAD #12 and #38), so they are
 * tested without a DOM:
 *
 *  - revealCam: selecting a node that is fully visible never moves the camera; one that the sheet or the bar
 *    covers moves the LEAST it can (16 px inside the free area) and never changes the zoom.
 *  - openingCam: on open, the camera frames every node the player can buy now (the whole visible tree when
 *    it fits at a readable zoom; else the buyable ones and the centre, however far they are).
 *  - tapAllowed: a tap within 350 ms of a camera move is ignored (a tap that lands where a node WAS bought it).
 *
 * World coordinates are layout units × D px; screen = world × z + (x, y).
 */
import { TREE_LAYOUT, type NodeState } from '../../game/tree';

/** Pixels per layout unit at zoom 1 (one step along a route; leaves room for the name under a tile). */
export const D = 128;
export const Z_MIN = 0.16;
export const Z_MAX = 1.9;
/** Below this zoom node names and branch labels fade out. */
export const FAR_Z = 0.55;
/** The opening frame stays at least this readable when everything fits (names and prices shown). */
export const READABLE_Z = FAR_Z + 0.04;
/** A node's extent in world px around its centre: the 64-px tile and its ring, then its 104-px name and price. */
export const NODE_EXTENT = { above: 40, below: 84, half: 52 } as const;
/** How far inside the free area a node that had to move ends up. */
export const REVEAL_MARGIN = 16;
/** Taps are ignored this long after the camera moved (docs/CLARIDAD2.md §2.10). */
export const TAP_QUIET_MS = 350;
/** Layout units of air around a framed set. */
const FIT_PAD = 0.4;

export interface Cam {
  x: number;
  y: number;
  z: number;
}
/** The free part of the viewport (screen px): below the bar, above the strip or the sheet. */
export interface Area {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** Screen box of a node centred at world point p. */
export function nodeRect(p: { x: number; y: number }, cam: Cam): Rect {
  const cx = cam.x + p.x * cam.z;
  const cy = cam.y + p.y * cam.z;
  return { l: cx - NODE_EXTENT.half * cam.z, r: cx + NODE_EXTENT.half * cam.z, t: cy - NODE_EXTENT.above * cam.z, b: cy + NODE_EXTENT.below * cam.z };
}

const within = (r: Rect, a: Area): boolean => r.l >= a.left && r.r <= a.right && r.t >= a.top && r.b <= a.bottom;

/** One axis: the shift that brings [lo, hi] inside [min, max] with `m` px to spare, 0 when it already fits. */
function shift1(lo: number, hi: number, min: number, max: number, m: number): number {
  if (lo >= min && hi <= max) return 0;
  // Bigger than the room: align its start (top / left: the tile and the name are what matter).
  if (hi - lo > max - min - 2 * m) return min + m - lo;
  if (lo < min) return min + m - lo;
  return max - m - hi;
}

/** null = the node is fully visible: the camera stays where it is (QA#12). Else the least move, same zoom. */
export function revealCam(cam: Cam, p: { x: number; y: number }, area: Area, margin = REVEAL_MARGIN): Cam | null {
  const r = nodeRect(p, cam);
  if (within(r, area)) return null;
  const dx = shift1(r.l, r.r, area.left, area.right, margin);
  const dy = shift1(r.t, r.b, area.top, area.bottom, margin);
  return { x: cam.x + dx, y: cam.y + dy, z: cam.z };
}

/** The nodes the player can buy right now (the centre's night included when it can move on). */
export function buyableIds(states: ReadonlyMap<string, NodeState>): string[] {
  const out: string[] = [];
  for (const [id, st] of states) if (st.affordable && st.status !== 'hidden') out.push(id);
  return out;
}

/** The camera that frames these nodes in the area (zoom ≤ zMax, ≥ zMin), centred on them. */
export function frameCam(ids: readonly string[], area: Area, zMin = Z_MIN, zMax = 1.1): Cam {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const id of ids.length ? ids : ['lab']) {
    const p = TREE_LAYOUT.get(id);
    if (!p) continue;
    minX = Math.min(minX, p.x * D - NODE_EXTENT.half);
    maxX = Math.max(maxX, p.x * D + NODE_EXTENT.half);
    minY = Math.min(minY, p.y * D - NODE_EXTENT.above);
    maxY = Math.max(maxY, p.y * D + NODE_EXTENT.below);
  }
  const pad = FIT_PAD * D;
  const w = Math.max(1, area.right - area.left);
  const h = Math.max(1, area.bottom - area.top);
  const z = Math.min(zMax, Math.max(zMin, Math.min(w / (maxX - minX + 2 * pad), h / (maxY - minY + 2 * pad))));
  const cx = (area.left + area.right) / 2;
  const cy = (area.top + area.bottom) / 2;
  return { x: cx - ((minX + maxX) / 2) * z, y: cy - ((minY + maxY) / 2) * z, z };
}

/**
 * The camera on opening the Tree (QA-CLARIDAD #38: «Mundo 4» left at x = −6): the whole visible tree at a
 * readable zoom when every buyable node is then on screen; otherwise the buyable nodes and the centre, at
 * whatever zoom they need (the player zooms in on one with a tap on the strip).
 */
export function openingCam(states: ReadonlyMap<string, NodeState>, area: Area): Cam {
  const buy = buyableIds(states);
  const shown: string[] = ['lab'];
  for (const [id, st] of states) if (st.status === 'owned' || st.status === 'available' || st.status === 'locked') shown.push(id);
  const all = frameCam(shown, area, READABLE_Z);
  if (buy.every((id) => within(nodeRect(worldOf(id), all), area))) return all;
  const some = frameCam([...buy, 'lab'], area, READABLE_Z);
  if (buy.every((id) => within(nodeRect(worldOf(id), some), area))) return some;
  return frameCam(buy.length ? buy : ['lab'], area, Z_MIN);
}

function worldOf(id: string): { x: number; y: number } {
  const p = TREE_LAYOUT.get(id) ?? { x: 0, y: 0 };
  return { x: p.x * D, y: p.y * D };
}

/** The free area never starts above this (px under the viewport's top): the bar's own height. */
export const MIN_TOP = 78;
/** VELA's bubble counts as part of the top bar only when it ends in the top half of the viewport. */
export const DOCK_MAX_SHARE = 0.5;

/**
 * Top of the Tree's free area (px from the viewport's top): under the bar and under VELA's docked bubble.
 * A bubble that is not up there yet (still at the bottom, sliding to the dock) is not a bar: measured as
 * one, the free area collapsed to a 60-px band and the opening frame parked tiny nodes under the strip
 * (integration play-through of the clarity pass; PC's "the Tree showed no nodes").
 */
export function freeTop(barBottom: number, dock: { top: number; bottom: number } | null, h: number): number {
  let top = Math.max(MIN_TOP, barBottom > 0 ? barBottom + 10 : 0);
  if (dock && dock.bottom > dock.top && dock.bottom <= h * DOCK_MAX_SHARE) top = Math.max(top, dock.bottom + 10);
  return top;
}

/** Air between a night label and the edge of the free area (px). */
export const LABEL_EDGE = 8;
/** Step of the search along a night circle (radians, 3°). */
const LABEL_STEP = Math.PI / 60;

/**
 * Where a night label sits on its dashed circle (radians), so that all of it is inside the free area: its
 * preferred angle when it fits there, else the nearest angle (either way round) that does, or null when no
 * point of the circle has room. A label is never shown cut by the screen's edge (integrator review v0.023,
 * shot 49: «Noche 2» read «ne 2»). `r` is the circle's radius in world px, `half` the label's on-screen
 * half-size.
 */
export function gateLabelAngle(cam: Cam, r: number, half: { w: number; h: number }, area: Area, prefer: number): number | null {
  const R = r * cam.z;
  const l = area.left + LABEL_EDGE + half.w;
  const rt = area.right - LABEL_EDGE - half.w;
  const t = area.top + LABEL_EDGE + half.h;
  const b = area.bottom - LABEL_EDGE - half.h;
  if (l > rt || t > b) return null;
  const fits = (a: number): boolean => {
    const x = cam.x + Math.cos(a) * R;
    const y = cam.y + Math.sin(a) * R;
    return x >= l && x <= rt && y >= t && y <= b;
  };
  const n = Math.ceil(Math.PI / LABEL_STEP);
  for (let i = 0; i <= n; i++) {
    if (fits(prefer + i * LABEL_STEP)) return prefer + i * LABEL_STEP;
    if (i && fits(prefer - i * LABEL_STEP)) return prefer - i * LABEL_STEP;
  }
  return null;
}

/** A tap counts only when the camera has been still for TAP_QUIET_MS. */
export function tapAllowed(now: number, lastMoveAt: number): boolean {
  return now - lastMoveAt >= TAP_QUIET_MS;
}
