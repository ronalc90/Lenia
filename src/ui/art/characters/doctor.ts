/**
 * The player in first person (ADR-029, docs/ARTE-REALISTA.md §3.7, §5.3): a right hand in a nitrile
 * glove and the cuff of the coat you picked. No faces: the realism is light and material.
 *
 * The hand is a rig of tapered tubes (fingers, thumb) over a hand-written palm path, in "hand units":
 * the wrist centre at (0, 0), the fingers pointing up (−y), about 62 units from the wrist to the
 * tip of the middle finger (1 unit ≈ 3 mm). Each pose has its own rig and default angle; the forearm
 * and the sleeve leave along +y, so a hand placed near the bottom edge of a frame enters it from
 * below. Painted in the 8 layers of §3.2 (base, local colour wrist → tips, a cylinder ramp per finger
 * in multiply, the cyan bounce of the dish on the lower edges, one satin specular per phalanx, the warm
 * rim of VELA's lamp on the right edges, nitrile wrinkles, a 1.25-px contour on the silhouette only)
 * and cached per pose × look × angle × size × DPR: a frame is one `drawImage`.
 *
 * Also here: the compatibility aliases `drawDoctorAt` / `drawDoctorBust` (they draw the hand or the
 * coat until the intro scenes stop calling them) and Albor's lantern.
 */
import { cylinderRamp, kelvin, makeCanvas, type LayerCanvas } from '../vector';
import { BOUNCE, LINE } from '../tokens';
import { drawAlborBack } from './albor';
import { COAT_IDS, drawCoat, type CoatId } from './coats';
import { addShape, bounds, curve, edgeBand, hash, metrics, parsePath, rgbOf, spot, sprite, trace, tube, type Ctx2D, type Shape, TAU } from './kit';

// ── Types kept from the chibi era (the intro scenes and the dev pages still pass them) ───────────────

export type DoctorMood = 'neutral' | 'happy' | 'surprised' | 'worried' | 'thinking' | 'proud' | 'sleepy';
export const DOCTOR_MOODS: readonly DoctorMood[] = ['neutral', 'happy', 'surprised', 'worried', 'thinking', 'proud', 'sleepy'];

export type Gesture = 'rest' | 'wave' | 'chin' | 'cheeks' | 'hips' | 'clasp' | 'hold' | 'point' | 'write' | 'walk';
export type HeldItem = 'none' | 'lantern' | 'clipboard' | 'notebook' | 'mug' | 'suitcase';
/** @deprecated The cast has no drawn hair any more (ADR-029); kept so old imports type-check. */
export type HairStyle = 'bob' | 'curly' | 'short' | 'bun';

/** Nitrile glove tones (§3.7, the variants table). Purely aesthetic. */
export type GloveTone = 'blue' | 'violet' | 'pink';

/** Who a drawing is: Albor (seen from behind, backlit) or one of the player's coats. */
export interface DoctorSpec {
  id: string;
  /** The coat (the player) or null (Albor: she is drawn from behind, not as a coat). */
  coat: CoatId | null;
  glove: GloveTone;
}

export interface DoctorPose {
  mood: DoctorMood;
  /** Seconds since the mood changed. */
  moodAge: number;
  /** 0..1 how much the speaker is talking (smoothed). */
  talk: number;
  talking: boolean;
  /** Kept for the old callers; nothing blinks any more. */
  blink: number;
  reduceMotion: boolean;
  gesture?: Gesture;
  item?: HeldItem;
  lookX?: number;
  lookY?: number;
  flip?: boolean;
  /** 0..1 strength of the warm lamp light. */
  warm?: number;
}

/** Which gesture each mood shows when the pose does not say (old callers). */
export const MOOD_GESTURE: Record<DoctorMood, Gesture> = {
  neutral: 'rest',
  happy: 'wave',
  surprised: 'cheeks',
  worried: 'clasp',
  thinking: 'chin',
  proud: 'hips',
  sleepy: 'rest',
};

/** '#rrggbb' blend (kept for old imports). */
export function mix(a: string, b: string, k: number): string {
  const pa = rgbOf(a).split(',').map(Number);
  const pb = rgbOf(b).split(',').map(Number);
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * Math.min(1, Math.max(0, k))).toString(16).padStart(2, '0')).join('');
}

// ── Light of the room (§3.1, §6.6) ───────────────────────────────────────────────────────────────────

/** Toward the key light, in screen space: the window, upper left (I3). */
const KEY = [-0.55, -0.835] as const;
/** The dish's cyan bounce, rgb (layer 4). */
const BOUNCE_RGB = rgbOf(BOUNCE.dish);
/** VELA's lamp rim (layer 6): 3000 K, from the right. */
const RIM_RGB = kelvin(3000).join(',');
/** The lantern's small flame (blackbody, 2200–2400 K). */
const FLAME_HALO = kelvin(2400).join(',');
const FLAME_BODY = kelvin(2200).join(',');

// ── Gloves (§3.7) ─────────────────────────────────────────────────────────────────────────────────────

interface Glove {
  /** Local colour along the hand, wrist → fingertips. */
  local: readonly [string, string, string];
  /** Silhouette contour (layer 8). */
  line: string;
  /** Wrinkles and contact shadows, rgb. */
  shade: string;
}

const GLOVES: Record<GloveTone, Glove> = {
  blue: { local: ['#3c86cf', '#5aa7ea', '#7cbcf2'], line: 'rgba(10,25,45,0.85)', shade: '20,50,90' },
  violet: { local: ['#5b47b8', '#7d66d8', '#a08cf0'], line: 'rgba(22,14,48,0.85)', shade: '40,24,90' },
  pink: { local: ['#c8415e', '#e0657e', '#f08aa0'], line: 'rgba(52,12,24,0.85)', shade: '96,20,40' },
};

/** Cylinder ramp of a finger, in multiply (§3.7 layer 3): lit edge → specular 0.28 → … → far edge. */
const FINGER_RAMP = ['#8aa2bb', '#ffffff', '#dbe5ee', '#bccddd', '#6a839e'] as const;
const FINGER_AT = [0, 0.28, 0.6, 0.85, 1] as const;

// ── The rig ───────────────────────────────────────────────────────────────────────────────────────────

/** A finger or thumb: centreline from a hidden base to the last joint, radii per point. */
interface Digit {
  pts: readonly number[];
  r: readonly number[];
  shape: Shape;
  /** Indices of the joints that wrinkle (PIP, DIP). */
  joints: readonly number[];
}

/**
 * Builds a digit from its visible base (x, y), a direction in degrees from "up" (negative leans
 * left), and segments [length, bend°] (bend relative to the previous segment). The centreline starts
 * `hide` units back inside the palm so its flat base never shows.
 */
function digit(x: number, y: number, deg: number, segs: readonly (readonly [number, number])[], r: readonly number[], hide = 2.4, cap = 1): Digit {
  let a = (deg * Math.PI) / 180;
  const pts = [x - Math.sin(a) * hide, y + Math.cos(a) * hide, x, y];
  let px = x;
  let py = y;
  for (const [len, bend] of segs) {
    a += (bend * Math.PI) / 180;
    px += Math.sin(a) * len;
    py -= Math.cos(a) * len;
    pts.push(px, py);
  }
  const radii = [r[0], ...r];
  const joints: number[] = [];
  for (let i = 2; i < pts.length / 2 - 1; i++) joints.push(i);
  return { pts, r: radii, shape: tube(pts, radii, cap), joints };
}

type PropId = 'pipette' | 'pen';

/**
 * One continuous surface (a palm and the digits that grow from it) or a prop between surfaces. A
 * surface drawn over another one it is attached to (`attach`: the index over the palm, in front of the
 * pen) keeps its outline off that surface: the glove is one skin, the line only shows against the rest.
 */
type Layer = { palm?: Shape; digits: readonly Digit[]; detail?: boolean; attach?: Shape; creases?: readonly Shape[] } | { prop: PropId };

interface Rig {
  layers: readonly Layer[];
  /** Default rotation (rad, about the wrist) for the pose's usual framing. */
  angle: number;
  /** Bend of the wrist: the forearm and the cuff leave at this angle from the hand's +y (rad). */
  sleeve: number;
  /** The working point in hand units: the pen nib, the pipette tip, the index tip, the palm. */
  tip: readonly [number, number];
  /** Knuckle heads (MCP) on the back of the hand: x y pairs (a touch of light each). */
  knuckles: readonly number[];
}

/** Hand poses: open reaching hand, pointing index, pipette grip, writing grip. */
export type HandPose = 'reach' | 'point' | 'pipette' | 'pen';
export const HAND_POSES: readonly HandPose[] = ['reach', 'point', 'pipette', 'pen'];

/** Back of the right hand, wrist to knuckles, with the webs between the fingers (fingers cover the rest). */
const PALM_OPEN = parsePath(
  'M-11.2 7C-11.6 0-12.4-5-13.4-10.6C-14.4-15.6-14-20-12.8-24.4C-11.8-28-11.8-31-11-33.4' +
    'C-10.2-36.2-8-37.4-6-36.8C-5.4-38.2-3.8-39.4-2.2-39.2C-0.4-39.2 0.8-38.2 1.2-37.4' +
    'C2.2-38.2 4.6-38.4 6-37C7-36.2 8.8-35.4 10.2-34.6C11.8-33.6 12.8-31.8 13-29.6' +
    'C13.8-24 13.9-17.6 13-11.6C12.3-6 11.4-1.6 11.2 7Z',
);
const OPEN_KNUCKLES = [-8.2, -32.4, -2.4, -34.6, 3.6, -33.6, 9, -30.6];

// Open hand reaching, seen from the back: index next to the thumb (left), fingers relaxed and curving in.
const REACH_INDEX = digit(-8.4, -34.6, -9, [[9.2, 0], [6.8, 5], [5.0, 6]], [3.2, 3.05, 2.8, 2.45], 4);
const REACH_MIDDLE = digit(-2.4, -36.8, -2, [[10.4, 0], [7.6, 3], [5.4, 4]], [3.3, 3.15, 2.9, 2.5], 4);
const REACH_RING = digit(3.6, -35.8, 5, [[9.6, 0], [7.2, 0], [5.2, -2]], [3.1, 3.0, 2.75, 2.4], 4);
const REACH_LITTLE = digit(9.2, -32.6, 13, [[7.2, 0], [5.4, -3], [4.4, -4]], [2.65, 2.55, 2.35, 2.1], 4);
const REACH_THUMB = digit(-11.6, -9.6, -48, [[9.0, 0], [8.0, 15], [6.2, 12]], [5.0, 4.2, 3.7, 3.1], 7);

// Pointing: the index stays long, the other three fold under (their first phalanges and PIP knuckles show).
const POINT_INDEX = digit(-8.2, -34.6, -4, [[9.4, 0], [7.2, 1], [5.4, 2]], [3.2, 3.05, 2.8, 2.45], 4);
const POINT_MIDDLE = digit(-2.4, -36.6, 3, [[6.2, 0], [2.6, 70]], [3.35, 3.3, 3.15], 4, 0.95);
const POINT_RING = digit(3.6, -35.6, 9, [[5.6, 0], [2.4, 72]], [3.15, 3.1, 2.95], 4, 0.95);
const POINT_LITTLE = digit(9, -32.4, 17, [[4.4, 0], [2.0, 74]], [2.7, 2.65, 2.5], 4, 0.95);
const POINT_THUMB = digit(-11.6, -10, -30, [[9.0, 0], [7.2, 22], [5.4, 20]], [5.0, 4.2, 3.7, 3.1], 7);

// Pipette grip, seen from the thumb side (cf. public/art/photos/pipeta-guante-csiro.webp): a tight fist
// reads as one mass (the four curled fingers pressed together, their middle knuckles bulging at the
// front, a crease between each), the thumb in front of it riding the plunger; the wrist bends so the
// forearm leaves down and to the right.
const FIST = parsePath(
  'M-8.6 8.6C-9.2 2-9.6-4-10-10C-11.5-11-13.5-11.2-15-12.6C-16.4-14-16.4-16.6-15.4-18' +
    'C-17-19.2-17.4-22.4-16.2-24.2C-17.8-25.6-18-29-16.8-30.8C-18.4-32.6-18.4-36.6-16-38.6' +
    'C-13.6-40.6-7.4-41.2-2-40.6C2.6-40.2 6.4-38.4 8.8-35C11.2-31.4 12.2-23 11.9-15C11.7-10.6 11.6-8.2 11.6-6Z',
);
const FIST_CREASES = [
  parsePath('M-16.8-30.8C-13-31.4-9-31.2-6-30.6'),
  parsePath('M-16.2-24.2C-12.6-24.6-9-24.4-6.6-23.6'),
  parsePath('M-15.4-18C-12.4-18.2-9.4-17.8-7.4-16.8'),
];
const GRIP_THUMB = digit(5, -9, -12, [[13, 0], [10.6, -8], [7.4, -10]], [5.0, 4.3, 3.8, 3.2], 6);

// Writing grip, from above (your own view): the pen comes out between thumb and index, the index on
// top of it, the thumb's pad on its left; middle, ring and little fingers curl under the palm.
const PALM_PEN = parsePath(
  'M-11.6 7C-12.8 0-15-6-16-11.6C-16.4-16.4-15.4-21-13.6-25.6C-12.4-29-11.4-32-10-34.2' +
    'C-8.2-36.8-5.4-37.6-2.6-37.4C0.6-37.2 4.4-36 7.4-34C10.4-32 12.6-29 13.4-25' +
    'C14.2-19 13.6-11 12.6-5C12 -1 11.4 3 11.2 7Z',
);
const PEN_MIDDLE = digit(-3, -35.8, -14, [[6.4, 0], [2.6, -64]], [3.3, 3.25, 3.1], 4, 0.95);
const PEN_RING = digit(2.8, -34.4, 4, [[5.4, 0], [2.4, 74]], [3.15, 3.1, 2.95], 4, 0.95);
const PEN_LITTLE = digit(8.2, -31.4, 18, [[4.0, 0], [2.0, 78]], [2.7, 2.65, 2.5], 4, 0.95);
const PEN_THUMB = digit(-12.2, -15.4, -6, [[12, 0], [10.2, -3], [7.4, -4]], [4.8, 4.2, 3.75, 3.15], 6);
const PEN_INDEX = digit(-8.2, -34.6, -21, [[8.8, 0], [4.8, -4], [3.4, -6]], [3.3, 3.15, 2.95, 2.6], 4);

const RIGS: Record<HandPose, Rig> = {
  reach: {
    layers: [{ palm: PALM_OPEN, digits: [REACH_THUMB, REACH_LITTLE, REACH_RING, REACH_MIDDLE, REACH_INDEX] }],
    angle: -0.42,
    sleeve: 0,
    tip: [-2.6, -61.6],
    knuckles: OPEN_KNUCKLES,
  },
  point: {
    layers: [{ palm: PALM_OPEN, digits: [POINT_THUMB, POINT_LITTLE, POINT_RING, POINT_MIDDLE, POINT_INDEX] }],
    angle: -0.5,
    sleeve: 0,
    tip: [POINT_INDEX.pts[POINT_INDEX.pts.length - 2] - 0.4, POINT_INDEX.pts[POINT_INDEX.pts.length - 1] - 2.4],
    knuckles: OPEN_KNUCKLES,
  },
  pipette: {
    layers: [{ prop: 'pipette' }, { palm: FIST, digits: [], creases: FIST_CREASES }, { digits: [GRIP_THUMB], detail: true, attach: FIST }],
    angle: 0.1,
    sleeve: -0.6,
    tip: [-29.6, 65.3],
    knuckles: [-16.2, -15.4, -16.6, -21.4, -17, -27.6, -17, -34.4],
  },
  pen: {
    layers: [
      { palm: PALM_PEN, digits: [PEN_THUMB, PEN_LITTLE, PEN_RING, PEN_MIDDLE] },
      { prop: 'pen' },
      { digits: [PEN_INDEX], detail: true, attach: PALM_PEN },
    ],
    angle: -0.5,
    sleeve: 0.1,
    tip: [-16.4, -59.8],
    knuckles: [-8.2, -32.4, -2.8, -34, 2.8, -32.8, 8.2, -29.8],
  },
};

/** The working point of a pose (pen nib, pipette tip, index tip) in hand units, before rotation. */
export function handTip(pose: HandPose): readonly [number, number] {
  return RIGS[pose].tip;
}

/** The default angle of a pose (radians about the wrist). */
export function handAngle(pose: HandPose): number {
  return RIGS[pose].angle;
}

// ── Props ─────────────────────────────────────────────────────────────────────────────────────────────

/** Pipette in hand units: top of the plunger → tip of the disposable cone (§3.7 reference photos). */
const PIPETTE = { top: [-7.6, -45.6] as const, bottom: [-29.6, 65.3] as const };
/** Fountain pen: the nib point → the end of the posted cap. */
const PEN = { nib: [-16.4, -59.8] as const, end: [-7, -13.7] as const };

/** Draws a cylinder segment along an axis with a ramp across it. Cache-pass helper. */
function rod(c: Ctx2D, ax: number, ay: number, bx: number, by: number, r0: number, r1: number, colors: readonly string[], at: readonly number[], lx: number, ly: number): void {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if (nx * lx + ny * ly < 0) {
    nx = -nx;
    ny = -ny;
  }
  c.beginPath();
  c.moveTo(ax + nx * r0, ay + ny * r0);
  c.lineTo(bx + nx * r1, by + ny * r1);
  c.lineTo(bx - nx * r1, by - ny * r1);
  c.lineTo(ax - nx * r0, ay - ny * r0);
  c.closePath();
  const r = Math.max(r0, r1);
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  c.fillStyle = cylinderRamp(c, mx + nx * r, my + ny * r, mx - nx * r, my - ny * r, colors, at);
  c.fill();
}

/** Point at fraction f along a→b. */
function along(a: readonly [number, number], b: readonly [number, number], f: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

const PLASTIC = ['#7d868e', '#fbfcfc', '#dfe3e6', '#cfdbe2', '#6f7880'] as const;
const PLASTIC_AT = [0, 0.26, 0.5, 0.82, 1] as const;
const RESIN = ['#05070b', '#5a6476', '#1b2230', '#2b3a4c', '#04060a'] as const;

function drawPipette(c: Ctx2D, lx: number, ly: number, css: number): void {
  const T = PIPETTE.top;
  const B = PIPETTE.bottom;
  const line = LINE.detail / css;
  // Disposable tip: clear polypropylene, a thin cone (Fresnel edges, light inside).
  const t0 = along(T, B, 0.8);
  c.save();
  c.globalAlpha = 0.85;
  rod(c, t0[0], t0[1], B[0], B[1], 1.15, 0.28, ['rgba(160,190,205,0.55)', 'rgba(255,255,255,0.75)', 'rgba(210,225,232,0.25)', 'rgba(150,210,235,0.45)', 'rgba(120,150,165,0.6)'], PLASTIC_AT, lx, ly);
  c.restore();
  // Shaft (ejector sleeve) and the body.
  const s0 = along(T, B, 0.6);
  rod(c, s0[0], s0[1], t0[0], t0[1], 1.7, 1.15, PLASTIC, PLASTIC_AT, lx, ly);
  const b0 = along(T, B, 0.12);
  rod(c, b0[0], b0[1], s0[0], s0[1], 4.4, 2.6, PLASTIC, PLASTIC_AT, lx, ly);
  // The volume window (dark, three digits) and the finger hook.
  const w0 = along(T, B, 0.42);
  const w1 = along(T, B, 0.52);
  rod(c, w0[0], w0[1], w1[0], w1[1], 2.0, 1.85, ['#0d1014', '#3a434c', '#161b20', '#20262c', '#0a0c0f'], PLASTIC_AT, lx, ly);
  // Plunger: white rod with the blue push button.
  const p0 = along(T, B, 0.03);
  rod(c, T[0], T[1], p0[0], p0[1], 2.3, 2.3, ['#123a7a', '#7fb0ff', '#2f6fd6', '#3d7fe0', '#0e2f66'], PLASTIC_AT, lx, ly);
  rod(c, p0[0], p0[1], b0[0], b0[1], 1.25, 1.25, PLASTIC, PLASTIC_AT, lx, ly);
  // Detail lines where parts meet.
  c.strokeStyle = 'rgba(20,28,36,0.55)';
  c.lineWidth = line;
  for (const f of [0.03, 0.12, 0.6, 0.8]) {
    const [x, y] = along(T, B, f);
    const dx = B[0] - T[0];
    const dy = B[1] - T[1];
    const l = Math.hypot(dx, dy);
    const r = f < 0.1 ? 2.3 : f < 0.5 ? 4.4 - (f - 0.12) * 3 : f < 0.7 ? 1.7 : 1.15;
    c.beginPath();
    c.moveTo(x - (dy / l) * r, y + (dx / l) * r);
    c.lineTo(x + (dy / l) * r, y - (dx / l) * r);
    c.stroke();
  }
}

function drawPen(c: Ctx2D, lx: number, ly: number, css: number): void {
  const N = PEN.nib;
  const E = PEN.end;
  // Steel nib (a tapered blade with its slit), the black section, the barrel, the posted cap, the clip.
  const n1 = along(N, E, 0.14);
  const dx = E[0] - N[0];
  const dy = E[1] - N[1];
  const l = Math.hypot(dx, dy);
  const ux = dx / l;
  const uy = dy / l;
  const nx = -uy;
  const ny = ux;
  c.beginPath();
  c.moveTo(N[0], N[1]);
  c.quadraticCurveTo(n1[0] + nx * 1.6 - ux * 2.2, n1[1] + ny * 1.6 - uy * 2.2, n1[0] + nx * 1.7, n1[1] + ny * 1.7);
  c.lineTo(n1[0] - nx * 1.7, n1[1] - ny * 1.7);
  c.quadraticCurveTo(n1[0] - nx * 1.6 - ux * 2.2, n1[1] - ny * 1.6 - uy * 2.2, N[0], N[1]);
  c.closePath();
  c.fillStyle = cylinderRamp(c, n1[0] + nx * 1.7, n1[1] + ny * 1.7, n1[0] - nx * 1.7, n1[1] - ny * 1.7, ['#6c7176', '#f6f6f2', '#b9bdc0', '#cfdbe2', '#4a4e52'], PLASTIC_AT);
  c.fill();
  c.strokeStyle = 'rgba(30,32,34,0.7)';
  c.lineWidth = LINE.fine / css;
  c.beginPath();
  c.moveTo(N[0] + ux * 0.4, N[1] + uy * 0.4);
  c.lineTo(N[0] + ux * 3.4, N[1] + uy * 3.4);
  c.stroke();
  c.fillStyle = '#2a2d30';
  c.beginPath();
  c.arc(N[0] + ux * 3.7, N[1] + uy * 3.7, 0.35, 0, TAU);
  c.fill();
  const s1 = along(N, E, 0.3);
  rod(c, n1[0], n1[1], s1[0], s1[1], 1.7, 2.0, ['#020304', '#4a4f57', '#0b0d10', '#1e2a33', '#010203'], PLASTIC_AT, lx, ly);
  const b1 = along(N, E, 0.72);
  rod(c, s1[0], s1[1], b1[0], b1[1], 2.2, 2.3, RESIN, PLASTIC_AT, lx, ly);
  // Gold band between barrel and posted cap.
  const g1 = along(N, E, 0.75);
  rod(c, b1[0], b1[1], g1[0], g1[1], 2.45, 2.45, ['#5c4214', '#fff0b8', '#c9a24a', '#e0c477', '#4a3410'], PLASTIC_AT, lx, ly);
  rod(c, g1[0], g1[1], E[0], E[1], 2.5, 2.2, RESIN, PLASTIC_AT, lx, ly);
  // Clip along the cap.
  const c0 = along(N, E, 0.8);
  const c1 = along(N, E, 0.98);
  c.strokeStyle = cylinderRamp(c, c0[0] + nx, c0[1] + ny, c0[0] - nx, c0[1] - ny, ['#5c4214', '#fff0b8', '#c9a24a', '#e0c477', '#4a3410'], PLASTIC_AT);
  c.lineWidth = 0.9;
  c.lineCap = 'round';
  c.beginPath();
  const sgn = nx * lx + ny * ly > 0 ? 1 : -1;
  c.moveTo(c0[0] + nx * 2.4 * sgn, c0[1] + ny * 2.4 * sgn);
  c.lineTo(c1[0] + nx * 2.3 * sgn, c1[1] + ny * 2.3 * sgn);
  c.stroke();
  // Silhouette of the pen (detail weight: it is a thin object).
  c.strokeStyle = 'rgba(0,0,0,0.6)';
  c.lineWidth = LINE.detail / css;
  c.beginPath();
  c.moveTo(n1[0] + nx * 2.0, n1[1] + ny * 2.0);
  c.lineTo(E[0] + nx * 2.3, E[1] + ny * 2.3);
  c.moveTo(n1[0] - nx * 2.0, n1[1] - ny * 2.0);
  c.lineTo(E[0] - nx * 2.3, E[1] - ny * 2.3);
  c.stroke();
}

// ── Painting the hand ─────────────────────────────────────────────────────────────────────────────────

interface Light {
  /** Toward the key light (window), in hand units. */
  kx: number;
  ky: number;
  /** Toward VELA's lamp (rim), hand units. */
  rx: number;
  ry: number;
  /** Toward the dish (bounce), hand units. */
  bx: number;
  by: number;
}

function lightFor(angle: number): Light {
  // Screen vectors rotated into the hand's frame (inverse rotation).
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  const rot = (x: number, y: number): [number, number] => [x * c - y * s, x * s + y * c];
  const [kx, ky] = rot(KEY[0], KEY[1]);
  const [rx, ry] = rot(1, -0.12);
  const [bx, by] = rot(0.1, 1);
  return { kx, ky, rx, ry, bx, by };
}

/** The glove's local colour, wrist → fingertips (§3.7 layer 2). */
function gloveFill(c: Ctx2D, g: Glove): CanvasGradient {
  const lg = c.createLinearGradient(0, 4, 0, -64);
  lg.addColorStop(0, g.local[0]);
  lg.addColorStop(0.6, g.local[1]);
  lg.addColorStop(1, g.local[2]);
  return lg;
}

function shadeDigit(c: Ctx2D, d: Digit, g: Glove, L: Light, css: number): void {
  c.save();
  trace(c, d.shape);
  c.clip();
  const n = d.pts.length / 2;
  // 3 · Form shadow: a cylinder ramp per segment, perpendicular to it (multiply).
  c.globalCompositeOperation = 'multiply';
  for (let i = 1; i < n - 1 || i === 1; i++) {
    const ax = d.pts[i * 2];
    const ay = d.pts[i * 2 + 1];
    const j = Math.min(n - 1, i + 1);
    const bx = d.pts[j * 2];
    const by = d.pts[j * 2 + 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let nx = -(by - ay) / len;
    let ny = (bx - ax) / len;
    if (nx * L.kx + ny * L.ky < 0) {
      nx = -nx;
      ny = -ny;
    }
    const r = d.r[i] * 1.05;
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    if (i > 1) {
      // A segment folded away from us (a curled finger seen from the back) shows only its knuckle:
      // shade it as the round end it is, not as a tube turned sideways.
      const px = d.pts[(i - 1) * 2];
      const py = d.pts[(i - 1) * 2 + 1];
      const pl = Math.hypot(ax - px, ay - py) || 1;
      const cos = ((ax - px) * (bx - ax) + (ay - py) * (by - ay)) / (pl * len);
      if (cos < 0.6) {
        const kg = c.createRadialGradient(ax + L.kx * r * 0.5, ay + L.ky * r * 0.5, r * 0.1, ax, ay, r * 1.9);
        kg.addColorStop(0, '#ffffff');
        kg.addColorStop(0.55, '#dbe5ee');
        kg.addColorStop(1, '#8ba1b8');
        c.fillStyle = kg;
        c.beginPath();
        c.arc(ax, ay, r * 2.2, 0, TAU);
        c.fill();
        if (j === n - 1) break;
        continue;
      }
    }
    c.fillStyle = cylinderRamp(c, mx + nx * r, my + ny * r, mx - nx * r, my - ny * r, FINGER_RAMP, FINGER_AT);
    // The slab of this segment (extended past both joints; the next segment paints over its own).
    const ex = ((bx - ax) / len) * (i === 1 ? 4 : 0.6);
    const ey = ((by - ay) / len) * (i === 1 ? 4 : 0.6);
    const fx = ((bx - ax) / len) * (j === n - 1 ? r * 1.6 : 0.6);
    const fy = ((by - ay) / len) * (j === n - 1 ? r * 1.6 : 0.6);
    c.beginPath();
    c.moveTo(ax - ex + nx * r * 1.6, ay - ey + ny * r * 1.6);
    c.lineTo(bx + fx + nx * r * 1.6, by + fy + ny * r * 1.6);
    c.lineTo(bx + fx - nx * r * 1.6, by + fy - ny * r * 1.6);
    c.lineTo(ax - ex - nx * r * 1.6, ay - ey - ny * r * 1.6);
    c.closePath();
    c.fill();
    if (j === n - 1) break;
  }
  c.globalCompositeOperation = 'source-over';
  // Translucent fingertip: the nitrile thins and lightens at the pad.
  const tx = d.pts[(n - 1) * 2];
  const ty = d.pts[(n - 1) * 2 + 1];
  spot(c, tx, ty, d.r[n - 1] * 1.5, d.r[n - 1] * 1.5, 0, '200,228,255', 0.16, 'screen');
  // 4 · Reflected light: the dish's cyan from below.
  edgeBand(c, d.shape, L.bx, L.by, 2.2, `rgb(${BOUNCE_RGB})`, 0.22, 'screen');
  // 5 · Specular: one soft satin band per phalanx, on the ridge toward the window.
  for (let i = 1; i < n - 1; i++) {
    const ax = d.pts[i * 2];
    const ay = d.pts[i * 2 + 1];
    const bx = d.pts[(i + 1) * 2];
    const by = d.pts[(i + 1) * 2 + 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let nx = -(by - ay) / len;
    let ny = (bx - ax) / len;
    if (nx * L.kx + ny * L.ky < 0) {
      nx = -nx;
      ny = -ny;
    }
    const r = d.r[i];
    const rot = Math.atan2(by - ay, bx - ax);
    spot(c, (ax + bx) / 2 + nx * r * 0.38, (ay + by) / 2 + ny * r * 0.38, len * 0.42, r * 0.3, rot, '255,255,255', 0.36);
  }
  // Knuckle touch at the joints (0.5 at the centre).
  for (const j of d.joints) spot(c, d.pts[j * 2] + L.kx * 0.6, d.pts[j * 2 + 1] + L.ky * 0.6, d.r[j] * 0.55, d.r[j] * 0.4, 0, '255,255,255', 0.24);
  // 6 · Rim: VELA's lamp grazing the right edges.
  edgeBand(c, d.shape, L.rx, L.ry, (0.55 * 2) / css, `rgb(${RIM_RGB})`, 0.45);
  // 7 · Texture: nitrile creases across the joints (two at the middle knuckle, one at the last):
  // a soft dark fold with its lit lip on the window side.
  c.lineCap = 'round';
  for (let ji = 0; ji < d.joints.length; ji++) {
    const j = d.joints[ji];
    const ax = d.pts[(j - 1) * 2];
    const ay = d.pts[(j - 1) * 2 + 1];
    const bx = d.pts[(j + 1) * 2];
    const by = d.pts[(j + 1) * 2 + 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    const r = d.r[j];
    const n = ji === 0 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * 1.1 + (hash(j * 7 + k, d.pts.length) - 0.5) * 0.5;
      const cx = d.pts[j * 2] + ux * off;
      const cy = d.pts[j * 2 + 1] + uy * off;
      const w0 = r * (0.5 + 0.3 * hash(k, j));
      const w1 = r * (0.35 + 0.3 * hash(k + 5, j));
      const bow = 0.35 + 0.35 * hash(j, k + 3);
      const wr = curve([cx - uy * w0, cy + ux * w0, cx + ux * bow, cy + uy * bow, cx + uy * w1, cy - ux * w1]);
      c.strokeStyle = `rgba(${g.shade},0.16)`;
      c.lineWidth = (LINE.fine * 1.4) / css;
      trace(c, wr);
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.11)';
      c.lineWidth = LINE.fine / css;
      trace(c, wr, L.kx * 0.35, L.ky * 0.35);
      c.stroke();
    }
  }
  c.restore();
}

/** One scratch canvas for the cache passes (never touched per frame). */
let scratch: LayerCanvas | null = null;

/** A clear scratch context with `c`'s size and transform, or null (tests, no canvas). */
function scratchFor(c: Ctx2D): Ctx2D | null {
  const cv = (c as { canvas?: { width?: unknown; height?: unknown } }).canvas;
  if (!cv || typeof cv.width !== 'number' || typeof cv.height !== 'number') return null;
  let m: DOMMatrix | null = null;
  try {
    m = c.getTransform();
  } catch {
    return null;
  }
  if (!m || typeof m.a !== 'number') return null;
  if (!scratch || scratch.width !== cv.width || scratch.height !== cv.height) scratch = makeCanvas(cv.width, cv.height);
  const sc = scratch ? (scratch.getContext('2d') as Ctx2D | null) : null;
  if (!sc) return null;
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.globalCompositeOperation = 'source-over';
  sc.globalAlpha = 1;
  sc.clearRect(0, 0, cv.width, cv.height);
  sc.setTransform(m);
  return sc;
}

/**
 * A digit's shading, faded in from its hidden base to where it leaves the palm (cache pass): drawn on
 * the scratch canvas over its own base fill, masked with a gradient along the digit, laid on `c`. So a
 * finger grows out of the back of the hand with no seam, and its edges light up only where it is free.
 */
function shadeDigitBlended(c: Ctx2D, d: Digit, g: Glove, L: Light, css: number): void {
  const sc = scratchFor(c);
  if (!sc || !scratch) {
    shadeDigit(c, d, g, L, css);
    return;
  }
  trace(sc, d.shape);
  sc.fillStyle = gloveFill(sc, g);
  sc.fill();
  shadeDigit(sc, d, g, L, css);
  const x0 = d.pts[0];
  const y0 = d.pts[1];
  const x1 = d.pts[2];
  const y1 = d.pts[3];
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const mg = sc.createLinearGradient(x0, y0, x1 + ((x1 - x0) / len) * 1.6, y1 + ((y1 - y0) / len) * 1.6);
  mg.addColorStop(0, 'rgba(0,0,0,0)');
  mg.addColorStop(1, 'rgba(0,0,0,1)');
  sc.globalCompositeOperation = 'destination-in';
  sc.fillStyle = mg;
  sc.fillRect(-200, -200, 400, 400);
  sc.globalCompositeOperation = 'source-over';
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(scratch, 0, 0);
  c.restore();
}

function shadePalm(c: Ctx2D, palm: Shape, rig: Rig, g: Glove, L: Light, css: number): void {
  c.save();
  trace(c, palm);
  c.clip();
  // 3 · The back of the hand is a low dome lit from the window: light upper left, falling off.
  c.globalCompositeOperation = 'multiply';
  const dome = c.createRadialGradient(L.kx * 12, -24 + L.ky * 12, 2, 0, -18, 30);
  dome.addColorStop(0, '#ffffff');
  dome.addColorStop(0.55, '#e3eaf1');
  dome.addColorStop(1, '#8fa5bb');
  c.fillStyle = dome;
  c.fillRect(-30, -50, 60, 64);
  c.globalCompositeOperation = 'source-over';
  // Metacarpal ridges: four long, faint tendons fanning from the wrist to the knuckles.
  for (let i = 0; i < rig.knuckles.length; i += 2) {
    const kx = rig.knuckles[i];
    const ky = rig.knuckles[i + 1];
    spot(c, kx * 0.62, ky * 0.55, 1.5, 10, -kx * 0.014, '255,255,255', 0.08);
  }
  // Knuckle heads (MCP): a touch of light toward the window and a soft shadow on the far side.
  for (let i = 0; i < rig.knuckles.length; i += 2) {
    const kx = rig.knuckles[i];
    const ky = rig.knuckles[i + 1];
    spot(c, kx - L.kx * 1.5, ky - L.ky * 1.5, 3.2, 2.4, 0, g.shade, 0.16);
    spot(c, kx + L.kx * 0.5, ky + L.ky * 0.5, 2.5, 1.8, 0, '255,255,255', 0.3);
  }
  // A loose glove: two or three soft diagonal folds over the back of the hand (dark valley, lit ridge).
  for (let i = 0; i < 3; i++) {
    const x = -5 + i * 6 + hash(i, 5) * 3;
    const y = -12 - i * 5 - hash(i, 6) * 4;
    const a = 0.75 + hash(i, 7) * 0.35;
    const l = 6 + hash(i, 8) * 4;
    spot(c, x, y, l, 0.9, a, g.shade, 0.16);
    spot(c, x + L.kx * 0.9, y + L.ky * 0.9, l * 0.9, 0.7, a, '255,255,255', 0.12);
  }
  // 4 · Bounce and 6 · rim on the palm's own edges.
  edgeBand(c, palm, L.bx, L.by, 2.6, `rgb(${BOUNCE_RGB})`, 0.2, 'screen');
  edgeBand(c, palm, L.rx, L.ry, (0.55 * 2) / css, `rgb(${RIM_RGB})`, 0.42);
  c.restore();
}

/** Gauntlet of the glove (wrist to its rolled bead) in hand units: a short flaring tube. */
const GAUNTLET = parsePath('M-11.4 2C-11.8 6-12.2 10-12.4 14.4L12.6 14.4C12.4 10 12 6 11.6 2Z');

function drawGauntlet(c: Ctx2D, g: Glove, L: Light, css: number): void {
  trace(c, GAUNTLET);
  c.fillStyle = g.local[0];
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = cylinderRamp(c, -12.4, 8, 12.6, 8, FINGER_RAMP, FINGER_AT);
  c.globalCompositeOperation = 'multiply';
  c.fillRect(-14, 0, 28, 16);
  c.globalCompositeOperation = 'source-over';
  // Loose material bunching at the wrist: longitudinal folds.
  for (let i = 0; i < 5; i++) {
    const x = -9 + i * 4.4 + hash(i, 11) * 1.6;
    c.strokeStyle = `rgba(${g.shade},0.22)`;
    c.lineWidth = LINE.fine / css;
    trace(c, curve([x, 2.5, x + 0.6, 8, x - 0.2, 13.5]));
    c.stroke();
  }
  edgeBand(c, GAUNTLET, L.rx, L.ry, (0.55 * 2) / css, `rgb(${RIM_RGB})`, 0.4);
  c.restore();
  // The rolled bead: a thin tube across the opening.
  const bead = c.createLinearGradient(0, 13.2, 0, 16.2);
  bead.addColorStop(0, '#ffffff');
  bead.addColorStop(0.3, g.local[2]);
  bead.addColorStop(1, g.local[0]);
  c.beginPath();
  c.moveTo(-12.6, 13.4);
  c.quadraticCurveTo(0, 14.6, 12.8, 13.4);
  c.lineTo(12.8, 16);
  c.quadraticCurveTo(0, 17.2, -12.6, 16);
  c.closePath();
  c.fillStyle = bead;
  c.fill();
  c.strokeStyle = g.line;
  c.lineWidth = LINE.contour / css;
  c.stroke();
}

// ── Cuffs of the three coats (§5.5 "lo que verás de ella en el juego") ─────────────────────────────────

const COTTON = ['#a9b2b8', '#ffffff', '#eef0ee', '#dbe6ea', '#9aa3aa'] as const;
const COTTON_AT = [0, 0.3, 0.55, 0.82, 1] as const;
const PARKA_RED = ['#5e0c12', '#e8585a', '#b8202a', '#c2343c', '#4a080d'] as const;
const KNIT = ['#3d4247', '#b9bfc4', '#80878d', '#8f9ba3', '#33373b'] as const;

/** The sleeve: a wide tube along +y from the cuff off the frame, with two soft folds. */
function drawSleeve(c: Ctx2D, y0: number, w0: number, w1: number, colors: readonly string[], L: Light, css: number, line: string, len: number): void {
  if (len <= 0) return;
  const q = len / 3;
  const s = parsePath(`M${-w0 / 2} ${y0}C${-w0 / 2 - 1} ${y0 + q} ${-w1 / 2} ${y0 + q * 2} ${-w1 / 2} ${y0 + len}L${w1 / 2} ${y0 + len}C${w1 / 2} ${y0 + q * 2} ${w0 / 2 + 1} ${y0 + q} ${w0 / 2} ${y0}Z`);
  trace(c, s);
  c.strokeStyle = line;
  c.lineWidth = (LINE.contour * 2) / css;
  c.stroke();
  c.fillStyle = cylinderRamp(c, -w0 / 2 - 2, y0 + 20, w0 / 2 + 2, y0 + 20, colors, COTTON_AT);
  c.fill();
  c.save();
  c.clip();
  spot(c, -w0 * 0.12, y0 + 26, 2.4, 16, 0.08, '40,50,60', 0.16, 'multiply');
  spot(c, w0 * 0.18, y0 + 40, 2, 18, -0.05, '40,50,60', 0.14, 'multiply');
  edgeBand(c, s, L.rx, L.ry, (0.55 * 2) / css, `rgb(${RIM_RGB})`, 0.4);
  c.restore();
}

function drawCuff(c: Ctx2D, coat: CoatId, g: Glove, L: Light, css: number, len: number): void {
  const line = 'rgba(14,18,24,0.85)';
  if (coat === 'beanie') {
    // Polar parka: the red padded cuff comes OVER the glove, with its velcro tab.
    drawSleeve(c, 12, 32, 36, PARKA_RED, L, css, line, len);
    const cuff = parsePath('M-15.6 5.2C-8 3.4 8 3.4 15.8 5.2C16.8 9 16.8 13 16 16.4C8 18 -8 18-15.8 16.4C-16.6 13-16.6 9-15.6 5.2Z');
    trace(c, cuff);
    c.strokeStyle = line;
    c.lineWidth = (LINE.contour * 2) / css;
    c.stroke();
    c.fillStyle = cylinderRamp(c, -16.6, 10, 16.8, 10, PARKA_RED, COTTON_AT);
    c.fill();
    c.save();
    c.clip();
    // Puffy padding: lit top, a stitched quilting line.
    spot(c, -4, 7, 10, 2.6, 0, '255,255,255', 0.22, 'screen');
    c.strokeStyle = 'rgba(40,4,8,0.45)';
    c.lineWidth = LINE.detail / css;
    trace(c, curve([-16, 11, 0, 12.2, 16, 11]));
    c.stroke();
    // Velcro tab: a darker strap with hook texture.
    c.fillStyle = '#7a1219';
    c.beginPath();
    c.moveTo(4, 9.4);
    c.lineTo(15, 8.6);
    c.lineTo(15.4, 14.2);
    c.lineTo(4.4, 15);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 14; i++) c.fillRect(5 + (i % 7) * 1.5, 10.4 + Math.floor(i / 7) * 2, 0.6, 0.6);
    edgeBand(c, cuff, L.rx, L.ry, (0.55 * 2) / css, `rgb(${RIM_RGB})`, 0.45);
    c.restore();
    // The opening: the glove disappears into a dark gap.
    c.fillStyle = 'rgba(10,4,6,0.85)';
    c.beginPath();
    c.ellipse(0, 5.4, 13.4, 1.6, 0, Math.PI, TAU);
    c.fill();
    return;
  }
  if (coat === 'bun') {
    // Mandarin-collar coat: white sleeve, a grey knit cuff, and the violet glove pulled over it.
    drawSleeve(c, 22, 27, 33, COTTON, L, css, line, len);
    const knit = parsePath('M-12.6 10C-6 9 6 9 12.8 10L13.6 24C6 25.4-6 25.4-13.4 24Z');
    trace(c, knit);
    c.strokeStyle = line;
    c.lineWidth = (LINE.contour * 2) / css;
    c.stroke();
    c.fillStyle = cylinderRamp(c, -13.6, 17, 13.8, 17, KNIT, COTTON_AT);
    c.fill();
    c.save();
    c.clip();
    // Rib knit: vertical ribs, each a dark groove and a lit wale.
    for (let x = -13; x <= 13; x += 1.25) {
      c.fillStyle = 'rgba(20,22,26,0.28)';
      c.fillRect(x, 9, 0.32, 17);
      c.fillStyle = 'rgba(255,255,255,0.10)';
      c.fillRect(x + 0.45, 9, 0.35, 17);
    }
    edgeBand(c, knit, L.rx, L.ry, (0.55 * 2) / css, `rgb(${RIM_RGB})`, 0.4);
    c.restore();
    c.save();
    c.translate(0, -2);
    drawGauntlet(c, g, L, css);
    c.restore();
    return;
  }
  // Classic coat: the glove over a white buttoned cuff.
  drawSleeve(c, 20, 27, 33, COTTON, L, css, line, len);
  const band = parsePath('M-13 6.8C-6 6 6 6 13.2 6.8L13.8 21.6C6 22.6-6 22.6-13.6 21.6Z');
  trace(c, band);
  c.strokeStyle = line;
  c.lineWidth = (LINE.contour * 2) / css;
  c.stroke();
  c.fillStyle = cylinderRamp(c, -13.6, 14, 13.8, 14, COTTON, COTTON_AT);
  c.fill();
  c.save();
  c.clip();
  c.strokeStyle = 'rgba(90,100,110,0.45)';
  c.lineWidth = LINE.fine / css;
  c.setLineDash([0.8, 0.6]);
  trace(c, curve([-13.4, 19.6, 0, 20.4, 13.6, 19.6]));
  c.stroke();
  c.setLineDash([]);
  // Cuff button (the classic one: four holes) and its placket edge.
  c.strokeStyle = 'rgba(80,90,100,0.5)';
  c.lineWidth = LINE.detail / css;
  trace(c, curve([7.2, 6.6, 7.6, 14, 7.8, 21.8]));
  c.stroke();
  const bg = c.createRadialGradient(9.4, 16.2, 0.2, 10, 17, 1.8);
  bg.addColorStop(0, '#ffffff');
  bg.addColorStop(1, '#b7bec4');
  c.fillStyle = bg;
  c.beginPath();
  c.arc(10, 17, 1.5, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(60,66,72,0.55)';
  for (const [hx, hy] of [
    [9.55, 16.55],
    [10.45, 16.55],
    [9.55, 17.45],
    [10.45, 17.45],
  ])
    c.fillRect(hx - 0.18, hy - 0.18, 0.36, 0.36);
  edgeBand(c, band, L.rx, L.ry, (0.55 * 2) / css, `rgb(${RIM_RGB})`, 0.4);
  edgeBand(c, band, L.bx, L.by, 2.4, `rgb(${BOUNCE_RGB})`, 0.18, 'screen');
  c.restore();
  c.save();
  c.translate(0, -3.6);
  drawGauntlet(c, g, L, css);
  c.restore();
}

/** Outline (2× contour, the fill covers the inner half), then fill, then shade, for one surface. */
function paintLayer(c: Ctx2D, layer: Exclude<Layer, { prop: PropId }>, rig: Rig, g: Glove, L: Light, css: number): void {
  const fill = gloveFill(c, g);
  c.lineJoin = 'round';
  c.save();
  if (layer.attach) {
    // Outline only off the surface it grows from (evenodd: everything but that surface).
    c.beginPath();
    c.rect(-200, -200, 400, 400);
    addShape(c, layer.attach);
    c.clip('evenodd');
  }
  c.strokeStyle = g.line;
  c.lineWidth = ((layer.detail ? LINE.detail : LINE.contour) * 2) / css;
  c.beginPath();
  if (layer.palm) addShape(c, layer.palm);
  for (const d of layer.digits) addShape(c, d.shape);
  c.stroke();
  c.restore();
  c.fillStyle = fill;
  if (layer.palm) {
    trace(c, layer.palm);
    c.fill();
  }
  for (const d of layer.digits) {
    trace(c, d.shape);
    c.fill();
  }
  if (layer.palm) shadePalm(c, layer.palm, rig, g, L, css);
  if (layer.palm && layer.creases) {
    // Creases between pressed fingers: dark at the knuckles, fading toward the palm; a lit lip above.
    c.save();
    trace(c, layer.palm);
    c.clip();
    c.lineCap = 'round';
    for (const cr of layer.creases) {
      const [x0, y0, x1, y1] = bounds(cr);
      const fade = c.createLinearGradient(x0, y0, x1, y1);
      fade.addColorStop(0, `rgba(${g.shade},0.7)`);
      fade.addColorStop(1, `rgba(${g.shade},0)`);
      c.strokeStyle = fade;
      c.lineWidth = (LINE.detail * 1.3) / css;
      trace(c, cr);
      c.stroke();
      spot(c, (x0 + x1) / 2, (y0 + y1) / 2 + 1.4, (x1 - x0) / 2, 1.3, 0, g.shade, 0.18);
      const lip = c.createLinearGradient(x0, y0, x1, y1);
      lip.addColorStop(0, 'rgba(255,255,255,0.3)');
      lip.addColorStop(1, 'rgba(255,255,255,0)');
      c.strokeStyle = lip;
      c.lineWidth = LINE.fine / css;
      trace(c, cr, 0, -0.55);
      c.stroke();
    }
    c.restore();
  }
  // Contact shadows in the webs where the fingers leave the palm.
  const base = layer.palm ?? layer.attach;
  if (base) {
    c.save();
    trace(c, base);
    c.clip();
    for (const d of layer.digits) spot(c, d.pts[2] - L.kx * 1.2, d.pts[3] - L.ky * 1.2, d.r[0] * 1.15, d.r[0] * 0.7, 0, g.shade, 0.22);
    c.restore();
  }
  for (const d of layer.digits) shadeDigitBlended(c, d, g, L, css);
}

function paintHand(c: Ctx2D, rig: Rig, coat: CoatId, g: Glove, angle: number, css: number, len: number): void {
  const L = lightFor(angle);
  // The cuff and the forearm follow the wrist's bend; their light is turned with them.
  const Lc = lightFor(angle + rig.sleeve);
  const cuff = (first: boolean) => {
    c.save();
    c.rotate(rig.sleeve);
    if (first) drawCuff(c, coat, g, Lc, css, len);
    else {
      c.translate(0, -4);
      drawGauntlet(c, g, Lc, css);
    }
    c.restore();
  };
  const cuffFirst = coat === 'bun' || coat === 'curls';
  cuff(cuffFirst);
  for (const layer of rig.layers) {
    if ('prop' in layer) {
      if (layer.prop === 'pipette') drawPipette(c, L.kx, L.ky, css);
      else drawPen(c, L.kx, L.ky, css);
    } else paintLayer(c, layer, rig, g, L, css);
  }
  if (!cuffFirst) {
    c.save();
    c.rotate(rig.sleeve);
    drawCuff(c, coat, g, Lc, css, len);
    c.restore();
  }
}

/** Extra controls for `drawGlovedHand`. */
export interface HandOpts {
  /** Rotation about the wrist in radians (default: the pose's own framing, `handAngle(pose)`). */
  angle?: number;
  /** Glove tone (default: the coat's, violet for `bun`, blue otherwise). */
  glove?: GloveTone;
  /**
   * Length of the sleeve past the cuff, in hand units (default 90: it leaves any frame). 0 draws the
   * cuff alone, for a hand that must stay inside a box (a dialogue portrait).
   */
  sleeve?: number;
}

/** Glove tone each coat comes with (§5.5: the mandarin-collar coat wears violet nitrile). */
export const COAT_GLOVE: Record<CoatId, GloveTone> = { curls: 'blue', beanie: 'blue', bun: 'violet' };

const HAND_BOX = [-40, -72, 80, 165] as const;

/**
 * Your right hand in a nitrile glove, with the cuff of your coat (§3.7, §5.5).
 *
 *  - `pose`: 'reach' (open hand reaching into the frame) · 'point' (index extended) · 'pipette'
 *    (holding a pipette, tip down) · 'pen' (holding a fountain pen, writing).
 *  - (x, y): the wrist centre in the current units. The forearm and sleeve leave along the pose's +y
 *    (down, then rotated by the angle), so put the wrist near an edge of the frame.
 *  - `k`: current units per hand unit (the hand is ≈ 62 units from wrist to fingertips; 1 unit ≈ 3 mm).
 *  - `look`: the coat id (`curls` · `beanie` · `bun`), which sets the cuff and the glove.
 *
 * Static: the whole hand is cached per pose × look × angle × size × DPR. Move it with (x, y); keep
 * `k` steady while animating (a new `k` repaints the cache). `handTip(pose)` gives the working point.
 */
export function drawGlovedHand(ctx: Ctx2D, pose: HandPose, x: number, y: number, k: number, look: CoatId, opts: HandOpts = {}): void {
  const rig = RIGS[pose] ?? RIGS.reach;
  const angle = opts.angle ?? rig.angle;
  const tone = opts.glove ?? COAT_GLOVE[look] ?? 'blue';
  const g = GLOVES[tone];
  // The cached box is the rotated hand box, axis-aligned, so the blit stays on the pixel grid.
  const [bx, by, bw, bh] = HAND_BOX;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [px, py] of [
    [bx, by],
    [bx + bw, by],
    [bx, by + bh],
    [bx + bw, by + bh],
  ]) {
    const rx = px * ca - py * sa;
    const ry = px * sa + py * ca;
    x0 = Math.min(x0, rx);
    y0 = Math.min(y0, ry);
    x1 = Math.max(x1, rx);
    y1 = Math.max(y1, ry);
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  const len = Math.max(0, opts.sleeve ?? 90);
  sprite(ctx, `hand|${pose}|${look}|${tone}|${angle.toFixed(3)}|${len}`, x0, y0, x1 - x0, y1 - y0, (c, css) => {
    c.save();
    c.rotate(angle);
    paintHand(c, rig, look, g, angle, css, len);
    c.restore();
  });
  ctx.restore();
}

/**
 * The forearm in its sleeve, from under the cuff of a hand drawn with `sleeve: 0` at the wrist (wx,
 * wy) and scale `k`, straight down to `endY` (current units): for a hand that must reach the bottom edge
 * of a box without leaving it. Not cached (one gradient): the end moves with the hand.
 */
export function drawForearm(ctx: Ctx2D, look: CoatId, wx: number, wy: number, k: number, endY: number): void {
  const y1 = (endY - wy) / Math.max(1e-3, k);
  const y0 = look === 'beanie' ? 12 : 18;
  if (y1 <= y0) return;
  const [w0, w1] = look === 'beanie' ? [32, 36] : [27, 33];
  const we = w0 + (w1 - w0) * Math.min(1, (y1 - y0) / 90);
  const colors = look === 'beanie' ? PARKA_RED : COTTON;
  ctx.save();
  ctx.translate(wx, wy);
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.moveTo(-w0 / 2, y0);
  ctx.quadraticCurveTo(-w0 / 2 - 0.8, (y0 + y1) / 2, -we / 2, y1);
  ctx.lineTo(we / 2, y1);
  ctx.quadraticCurveTo(w0 / 2 + 0.8, (y0 + y1) / 2, w0 / 2, y0);
  ctx.closePath();
  ctx.fillStyle = cylinderRamp(ctx, -we / 2 - 1, 0, we / 2 + 1, 0, colors, COTTON_AT);
  ctx.fill();
  ctx.strokeStyle = 'rgba(14,18,24,0.85)';
  ctx.lineWidth = LINE.contour / Math.max(0.2, metrics(ctx).css);
  ctx.stroke();
  ctx.restore();
}

// ── Compatibility aliases (the intro scenes call these until P3 switches) ──────────────────────────────

function gesturePose(g: Gesture | undefined, item: HeldItem | undefined): HandPose {
  if (g === 'write' || item === 'notebook') return 'pen';
  if (g === 'point') return 'point';
  if (g === 'hold' || item === 'clipboard') return 'pipette';
  return 'reach';
}

function isCoat(id: string | null): id is CoatId {
  return id !== null && (COAT_IDS as readonly string[]).includes(id);
}

/**
 * @deprecated Use `drawGlovedHand` (the player) or `drawAlborBack` (Albor). Kept so the intro scenes
 * work until they switch (§7.2): with the feet at (x, y) and `k` px per old character unit (a whole
 * chibi was ≈ 92 units tall), the player becomes a gloved hand entering from the bottom of the frame
 * and Albor a backlit figure seen from behind.
 */
export function drawDoctorAt(ctx: Ctx2D, spec: DoctorSpec, pose: DoctorPose, t: number, x: number, y: number, k: number): void {
  if (!isCoat(spec.coat)) {
    drawAlborBack(ctx, x, y, k * 92, { mood: pose.mood, talk: pose.talk, talking: pose.talking, reduceMotion: pose.reduceMotion }, t, { full: true });
    return;
  }
  const hp = gesturePose(pose.gesture ?? MOOD_GESTURE[pose.mood], pose.item);
  const rm = pose.reduceMotion;
  // A small breath of motion: the hand is held up, never perfectly still (frozen under Reduce motion).
  const bob = rm ? 0 : Math.sin(t * 1.3) * 0.6;
  const sc = k * 1.15;
  const tip = RIGS[hp].tip;
  const a = RIGS[hp].angle;
  // Put the hand so its working point sits about 70 units above the feet, the wrist low in the frame.
  const tx = tip[0] * Math.cos(a) - tip[1] * Math.sin(a);
  const ty = tip[0] * Math.sin(a) + tip[1] * Math.cos(a);
  drawGlovedHand(ctx, hp, x - tx * sc * 0.25, y - 70 * k - ty * sc + bob * k, sc, spec.coat);
}

/**
 * @deprecated Use `drawBataCard` (a coat on the rack) or `drawAlborPolaroid`. Kept for the intro until
 * it switches: in the 100 × 100 portrait box, a player's spec draws its coat on the hanger (the upper
 * two thirds, as a bust) and Albor's draws her from behind, backlit by the window.
 */
export function drawDoctorBust(ctx: Ctx2D, spec: DoctorSpec, pose: DoctorPose, t: number): void {
  if (!isCoat(spec.coat)) {
    drawAlborBack(ctx, 50, 100, 100, { mood: pose.mood, talk: pose.talk, talking: pose.talking, reduceMotion: pose.reduceMotion }, t, { full: false });
    return;
  }
  ctx.save();
  ctx.translate(50 - 50 * 0.84, 1);
  ctx.scale(0.84, 0.84);
  drawCoat(ctx, spec.coat, 'dark');
  ctx.restore();
}

// ── Albor's lantern (an object of hers; P3 replaces it with VELA's lamp) ─────────────────────────────────

/**
 * A hurricane lantern centred at (x, y), `k` px per unit (≈ 22 units tall): brass cap and base, a
 * glass globe with Fresnel edges and a small blackbody flame. `on` 0..1 dims it.
 */
export function drawLantern(ctx: Ctx2D, x: number, y: number, k: number, t: number, rm: boolean, on = 1): void {
  const fl = rm ? 1 : 0.94 + 0.06 * Math.sin(t * 9.1) * Math.sin(t * 3.7 + 1);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  sprite(ctx, 'lantern', -8, -14, 16, 26, (c, css) => {
    const brass = ['#3e2b0c', '#ffe7a8', '#b8893a', '#d9b866', '#2e1f08'];
    // Bail (wire handle).
    c.strokeStyle = '#8d7440';
    c.lineWidth = 0.55;
    c.beginPath();
    c.moveTo(-4.4, -8.6);
    c.quadraticCurveTo(0, -15, 4.4, -8.6);
    c.stroke();
    // Cap and base.
    c.beginPath();
    c.moveTo(-3.4, -9);
    c.lineTo(3.4, -9);
    c.lineTo(4.6, -6.6);
    c.lineTo(-4.6, -6.6);
    c.closePath();
    c.fillStyle = cylinderRamp(c, -4.6, -8, 4.6, -8, brass, PLASTIC_AT);
    c.fill();
    c.beginPath();
    c.moveTo(-5, 7);
    c.lineTo(5, 7);
    c.lineTo(5.6, 10.4);
    c.lineTo(-5.6, 10.4);
    c.closePath();
    c.fillStyle = cylinderRamp(c, -5.6, 8, 5.6, 8, brass, PLASTIC_AT);
    c.fill();
    // Globe: clear glass, Fresnel bright at the rims.
    c.beginPath();
    c.ellipse(0, 0.4, 4.8, 6.8, 0, 0, TAU);
    const gl = c.createLinearGradient(-4.8, 0, 4.8, 0);
    gl.addColorStop(0, 'rgba(255,255,255,0.34)');
    gl.addColorStop(0.2, 'rgba(255,255,255,0.06)');
    gl.addColorStop(0.8, 'rgba(255,255,255,0.04)');
    gl.addColorStop(1, 'rgba(255,200,150,0.3)');
    c.fillStyle = gl;
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = LINE.detail / css;
    c.stroke();
    // Guard wires.
    c.strokeStyle = 'rgba(120,96,50,0.8)';
    c.lineWidth = 0.4;
    for (const gx of [-3.4, 0, 3.4]) {
      c.beginPath();
      c.moveTo(gx, -6.6);
      c.quadraticCurveTo(gx * 1.5, 0.4, gx, 7);
      c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.beginPath();
    c.ellipse(-2.6, -2.4, 0.5, 2, -0.2, 0, TAU);
    c.fill();
  });
  // The flame (dynamic): a small blackbody tongue and its glow.
  const a = Math.max(0, Math.min(1, on)) * fl;
  if (a > 0.02) {
    spot(ctx, 0, 1.2, 9, 9, 0, FLAME_HALO, 0.22 * a, 'screen');
    spot(ctx, 0, 1.6, 1.2, 2.6, 0, FLAME_BODY, 0.95 * a);
    spot(ctx, 0, 2.2, 0.6, 1.3, 0, '255,243,214', a);
  }
  ctx.restore();
}

/** The glove tones, for galleries. */
export const GLOVE_TONES: readonly GloveTone[] = ['blue', 'violet', 'pink'];
