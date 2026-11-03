/**
 * Dr. Albor, the scientist who left (ADR-029, docs/ARTE-REALISTA.md §5.3–§5.6). She is never seen
 * face on: always against the light, where the realism is the rim of light on her silhouette and the
 * glint on her round glasses (§5.4, the "contraluz" technique):
 *
 *  - from behind, looking out of the window at the aurora (`drawAlborBack`, the content of her
 *    Polaroid, `drawAlborPolaroid`);
 *  - once live, in profile, facing left, against the dawn, her breath steaming in the cold when she
 *    speaks (`drawAlborProfile`).
 *
 * Silhouettes are hand-written SVG path data in the 100 × 100 box. Layer 2 is a near-black warm brown;
 * layer 6, the light behind her, is the whole drawing: an inner band on the edges that face it (thicker
 * on the nose, lips and cheekbone), 30 fine rim-lit strands in the hair, a cold rim on the silver streak.
 * No contour (§5.4 layer 8: in backlight the edge is already light).
 */
import type { Lang } from '../../../core/types';
import { grainPattern, kelvin } from '../vector';
import { BOUNCE, LINE } from '../tokens';
import { addShape, curve, edgeBand, hash, pageLang, parsePath, rgbOf, rrect, spot, sprite, trace, type Ctx2D, type Shape, TAU } from './kit';

/** What the live profile needs (a subset of the dialogue's PortraitState). */
export interface AlborPose {
  /** Story mood ('neutral', 'happy', 'worried', …): posture and the strength of the dawn. */
  mood: string;
  /** 0..1 how much she is talking (smoothed): the breath vapour. */
  talk: number;
  talking: boolean;
  reduceMotion: boolean;
  /** Seconds since the mood changed: the posture eases over 0.5 s. */
  moodAge?: number;
}

const BOUNCE_RGB = rgbOf(BOUNCE.dish);
/** Dawn rim, 2200 → 3200 K (§5.4 layer 6). */
const DAWN_HOT = kelvin(3200).join(',');
const DAWN_LOW = kelvin(2200).join(',');
/** The silver streak's cold rim (§5.4). */
const SILVER = '223,231,239';
/** Window light in the Polaroid: aurora and moon, cold. */
const AURORA_RIM = '196,240,226';

// ── Profile (facing left, the dawn in front of her and behind her from our view) ─────────────────────────

/** Head, face and neck down into the scarf (one silhouette; the face is left). */
const P_HEAD = parsePath(
  'M55 11C46 10.5 39.5 14.5 37.6 21C37 23 36.6 25.4 36.4 27.4C37 28 37.6 28.4 38.2 28.6' +
    'C37.8 30 37.1 31.4 37 32.6C37 33.6 37.8 34.6 37.9 35.4C37.2 38 35.2 41.4 33.6 43.6' +
    'C32.9 44.4 33 45.4 33.9 45.6C35 45.7 35.9 45.7 36.6 46.3C36.6 47.2 36 48 35.8 48.7' +
    'C35.6 49.4 36.4 49.9 37.2 50.1C36.4 50.4 36 51.2 36.3 52C36.6 52.8 37.6 53 38 53.4' +
    'C37.4 54.6 37 56.4 37.6 57.6C38.4 59 40.2 59.6 42 59.8C44.6 60 46.4 60.4 47.4 61.6' +
    'C47.8 63.6 47.8 66 48 68.4L60.5 68.6C60.4 66 60.6 63.4 61.4 61.6' +
    'C64.4 61.4 68.6 60.6 71.8 59C74.6 51 74.8 36 72.2 26C69.8 17 63.4 11.2 55 11Z',
);

/** The bob: crown, the side-swept fringe, the side falling in front of the ear to the jaw. */
const P_HAIR = parsePath(
  'M55 11C46 10.5 39.5 14.5 37.6 21C37 23 36.6 25.4 36.4 27.4C38.6 27.2 40.8 26.6 42.6 26.8' +
    'C45.2 27.4 46.6 29 47 31C48.2 36 49.4 44 51.2 53.2C53.6 57.2 57 59.6 60.4 60.4' +
    'C62.6 61.6 66 61.4 68.4 60.4C69.6 60.8 70.8 60.2 71.8 59C74.6 51 74.8 36 72.2 26C69.8 17 63.4 11.2 55 11Z',
);

/** Shoulders in the parka, the hood bunched at the back, the scarf round the neck and its tail. */
const P_BODY = parsePath(
  'M46.2 64.8C43 70 38 78 33 86C30.4 90.4 28.6 95 27.6 100L90 100C89.4 92 87.6 84 84.2 78' +
    'C81.4 72.6 76 68.4 69.6 67C66.4 66.4 63.4 66.4 61 66.6Z',
);
const P_SCARF = parsePath(
  'M46 62.6C50.6 64.6 57 65.2 62.4 63.4C63.8 66.4 64.2 70 63.4 73.2C57 75.2 49.2 74.8 44.2 72' +
    'C43.4 68.8 44.2 65.4 46 62.6Z',
);
const P_SCARF_TAIL = parsePath('M45.4 71.6C43.6 77 42.4 84 42 92C44.6 93.2 47.6 93.2 50 92.2C49.6 85 49.2 78.4 49.8 73.6Z');

/** Glasses: the lens seen edge-on in front of the eye, and the temple arm back to the ear. */
const P_LENS = { x: 36.1, y: 36.7, rx: 0.95, ry: 4.1, rot: 0.1 } as const;
const P_TEMPLE = parsePath('M36.9 33.6C41 33.8 46 34.2 50.6 34.8');

/** Strand origins along the hair's lit edge: [x, y, dx, dy] (a short flyaway hair each). */
const HAIR_STRANDS: number[] = [];
{
  const edge = [55, 11, 46, 10.6, 41, 13.2, 38.2, 18.6, 36.8, 24.2, 36.5, 27.2];
  for (let i = 0; i < 30; i++) {
    const f = i / 29;
    const seg = Math.min(4, Math.floor(f * 5));
    const k = f * 5 - seg;
    const x = edge[seg * 2] + (edge[seg * 2 + 2] - edge[seg * 2]) * k;
    const y = edge[seg * 2 + 1] + (edge[seg * 2 + 3] - edge[seg * 2 + 1]) * k;
    HAIR_STRANDS.push(x, y, -0.6 - hash(i, 71) * 1.8, (hash(i, 72) - 0.6) * 2.4);
  }
}

/** Posture (rad, + = chin up) and dawn strength by mood (§5.4 "Humor"). */
const POSTURE: Record<string, [number, number]> = {
  neutral: [0, 1],
  happy: [0.08, 1.15],
  proud: [0.12, 1.1],
  surprised: [0.06, 1.08],
  awed: [0.06, 1.08],
  thinking: [-0.05, 0.94],
  worried: [-0.1, 0.84],
  alarm: [-0.1, 0.84],
  sleepy: [-0.15, 0.68],
};

/** The neck pivot of the head's posture. */
const NECK = [52, 64] as const;

function paintDawnSky(c: Ctx2D): void {
  const g = c.createLinearGradient(0, 0, 0, 100);
  g.addColorStop(0, '#141a33');
  g.addColorStop(0.42, '#3b3658');
  g.addColorStop(0.66, '#8a5a63');
  g.addColorStop(0.8, '#d98a5c');
  g.addColorStop(0.86, `rgb(${DAWN_HOT})`);
  g.addColorStop(0.87, '#1d1a22');
  g.addColorStop(1, '#0e0d12');
  c.fillStyle = g;
  c.fillRect(0, 0, 100, 100);
  // The sun about to rise, ahead of her (left): a hot core on the horizon and its bloom.
  spot(c, 12, 86, 46, 30, 0, DAWN_LOW, 0.4, 'screen');
  spot(c, 12, 86.4, 16, 6, 0, '255,236,200', 0.7, 'screen');
  // The far ice shelf: a thin bright line where the low sun hits it.
  c.fillStyle = 'rgba(255,214,170,0.55)';
  c.fillRect(0, 86.8, 100, 0.5);
  // The last stars, upper right.
  for (let i = 0; i < 18; i++) {
    const a = 0.2 + 0.5 * hash(i, 81);
    c.fillStyle = `rgba(230,236,255,${a * (1 - hash(i, 82) * 0.5)})`;
    c.fillRect(40 + hash(i, 83) * 60, 2 + hash(i, 84) * 30, 0.35, 0.35);
  }
}

/** Layers of a backlit silhouette: base, a faint fill from the room, the rim from the light. */
function backlit(c: Ctx2D, s: Shape, fill: readonly [string, string], lx: number, ly: number, rim: string, rimA: number, css: number, rimW = 1.2): void {
  const g = c.createLinearGradient(0, 10, 0, 100);
  g.addColorStop(0, fill[0]);
  g.addColorStop(1, fill[1]);
  trace(c, s);
  c.fillStyle = g;
  c.fill();
  c.save();
  trace(c, s);
  c.clip();
  // A fine edge (0.75–1.25 px) and a wider glow inward (1.2 u), both from the light.
  edgeBand(c, s, lx, ly, rimW, `rgb(${rim})`, rimA * 0.5, 'screen');
  edgeBand(c, s, lx, ly, (LINE.contour * 2) / css, `rgb(${rim})`, rimA);
  c.restore();
}

function paintProfileHead(c: Ctx2D, css: number, dawn: number): void {
  const lx = -0.94;
  const ly = -0.34;
  const a = Math.min(1, 0.85 * dawn);
  // 1–2 · Head and hair in shadow: near-black, warm (§5.4); the hair a shade darker.
  const g = c.createLinearGradient(0, 10, 0, 70);
  g.addColorStop(0, '#1d1714');
  g.addColorStop(1, '#14100e');
  trace(c, P_HEAD);
  c.fillStyle = g;
  c.fill();
  const hg = c.createLinearGradient(0, 10, 0, 62);
  hg.addColorStop(0, '#171210');
  hg.addColorStop(1, '#0e0b09');
  trace(c, P_HAIR);
  c.fillStyle = hg;
  c.fill();
  c.save();
  trace(c, P_HEAD);
  c.clip();
  // Hair texture: long strands from the crown down the bob, a few catching a little light.
  c.lineCap = 'round';
  for (let i = 0; i < 22; i++) {
    const f = i / 21;
    const x0 = 46 + f * 24;
    c.strokeStyle = `rgba(${i % 4 === 0 ? DAWN_LOW : '70,52,44'},${0.03 + 0.05 * hash(i, 86)})`;
    c.lineWidth = LINE.fine / css;
    trace(c, curve([52 + f * 6, 12.4 + f * 1.5, x0 + 1.2, 30, x0 - 1 + f * 2.4, 46, x0 + f * 3.4 - 4, 59.4]));
    c.stroke();
  }
  // 4 · Cyan bounce under the jaw (the dish below her) — faint.
  spot(c, 44, 61, 8, 3, 0, BOUNCE_RGB, 0.12, 'screen');
  // 6 · The dawn on the whole outer silhouette (face, crown, the bob's back), never on the
  // hair/skin boundary inside it: a fine edge and a wider glow inward.
  edgeBand(c, P_HEAD, lx, ly, 1.6, `rgb(${DAWN_HOT})`, a * 0.5, 'screen');
  edgeBand(c, P_HEAD, lx, ly, (LINE.contour * 2) / css, `rgb(${DAWN_HOT})`, a);
  edgeBand(c, P_HEAD, 0.2, -1, 1.2, `rgb(${DAWN_LOW})`, a * 0.35, 'screen');
  c.restore();
  // Flyaway hairs on the lit edge.
  for (let i = 0; i < HAIR_STRANDS.length; i += 4) {
    const x = HAIR_STRANDS[i];
    const y = HAIR_STRANDS[i + 1];
    const dx = HAIR_STRANDS[i + 2];
    const dy = HAIR_STRANDS[i + 3];
    c.strokeStyle = `rgba(${DAWN_HOT},${(0.25 + 0.5 * hash(i, 73)) * a})`;
    c.lineWidth = LINE.fine / css;
    c.beginPath();
    c.moveTo(x + 1.2, y + 0.6);
    c.quadraticCurveTo(x + dx * 0.3, y + dy * 0.6 - 0.6, x + dx, y + dy);
    c.stroke();
  }
  // The silver streak: a sweep of lighter strands from the parting to the fringe, cold rim.
  for (let i = 0; i < 12; i++) {
    const f = i / 11;
    const s = curve([49 - f * 1.5, 12 + f * 0.4, 43 - f * 1.2, 15.4 + f * 1.2, 39.2 - f * 0.4, 21 + f * 1.6, 37.4 + f * 0.6, 26 + f * 0.4]);
    c.strokeStyle = `rgba(${SILVER},${(0.16 + 0.22 * hash(i, 74)) * Math.max(0.5, a)})`;
    c.lineWidth = (LINE.fine * (0.8 + hash(i, 75) * 0.6)) / css;
    trace(c, s);
    c.stroke();
  }
  // 5 · The glasses: the temple arm (rim-lit on top) and the lens edge-on with its bright arc.
  c.strokeStyle = '#08070a';
  c.lineWidth = 0.55;
  trace(c, P_TEMPLE);
  c.stroke();
  c.strokeStyle = `rgba(${DAWN_HOT},${0.8 * a})`;
  c.lineWidth = LINE.fine / css;
  trace(c, P_TEMPLE, 0, -0.25);
  c.stroke();
  const L = P_LENS;
  c.beginPath();
  c.ellipse(L.x, L.y, L.rx, L.ry, L.rot, 0, TAU);
  c.fillStyle = 'rgba(40,34,36,0.55)';
  c.fill();
  c.strokeStyle = '#060508';
  c.lineWidth = LINE.detail / css;
  c.stroke();
  // The arc: the reflection of the dawn on the lens's front face (the detail that sells it).
  c.strokeStyle = 'rgba(255,236,200,0.9)';
  c.lineWidth = (LINE.detail * 1.2) / css;
  c.beginPath();
  c.ellipse(L.x, L.y, L.rx, L.ry, L.rot, Math.PI * 0.62, Math.PI * 1.22);
  c.stroke();
  spot(c, L.x - 0.6, L.y - 1.4, 0.7, 1.6, L.rot, '255,244,224', 0.8 * a);
}

function paintProfileBody(c: Ctx2D, css: number, dawn: number): void {
  const lx = -0.94;
  const ly = -0.34;
  const a = Math.min(1, 0.85 * dawn);
  backlit(c, P_BODY, ['#151a1c', '#0b0e0f'], lx, ly, DAWN_HOT, a * 0.9, css, 1.4);
  // The parka's down: arcs of quilting caught by the rim.
  c.save();
  trace(c, P_BODY);
  c.clip();
  c.strokeStyle = `rgba(${DAWN_LOW},${0.22 * a})`;
  c.lineWidth = LINE.fine / css;
  for (let i = 0; i < 4; i++) {
    trace(c, curve([30 + i * 2, 84 + i * 5, 46 + i, 80 + i * 5.4, 62, 81 + i * 5.6]));
    c.stroke();
  }
  // A faint warm fill on the shoulder from VELA's lamp behind us (so the parka is not a hole).
  spot(c, 76, 86, 18, 14, 0, '60,90,96', 0.35, 'screen');
  c.restore();
  // The mustard scarf: the rim shows its colour, the knit shows in the light.
  backlit(c, P_SCARF, ['#3a2a10', '#22180a'], lx, ly, '224,168,62', 0.95 * a, css, 1.8);
  backlit(c, P_SCARF_TAIL, ['#33250e', '#1c1408'], lx, ly, '224,168,62', 0.85 * a, css, 1.6);
  c.save();
  c.beginPath();
  addShape(c, P_SCARF);
  addShape(c, P_SCARF_TAIL);
  c.clip();
  c.strokeStyle = `rgba(240,190,90,${0.28 * a})`;
  c.lineWidth = LINE.fine / css;
  for (let y = 65; y < 93; y += 1.3) {
    c.beginPath();
    for (let x = 41; x < 63; x += 1.2) {
      const yy = y + ((x / 1.2) % 2 < 1 ? 0.45 : 0);
      if (x === 41) c.moveTo(x, yy);
      else c.lineTo(x, yy);
    }
    c.stroke();
  }
  c.restore();
}

/** Breath vapour (§5.4 "Hablar"): 1–3 puffs from the mouth, rising and opening over 1.2 s. */
function vapour(ctx: Ctx2D, t: number, talk: number, rm: boolean): void {
  if (talk <= 0.02) return;
  const life = 1.2;
  const every = 0.4;
  if (rm) {
    // Reduce motion: one still puff while she speaks.
    spot(ctx, 30, 48.6, 4.2, 3.2, 0, '230,240,250', 0.16 * talk);
    return;
  }
  for (let i = 0; i < 3; i++) {
    const born = Math.floor(t / every) * every - i * every;
    const f = (t - born) / life;
    if (f < 0 || f >= 1) continue;
    const env = Math.sin(Math.PI * Math.min(1, f * 1.4)) * (1 - f * 0.4);
    const x = 34.6 - f * 14 - hash(Math.round(born / every), 91) * 2;
    const y = 50.4 - f * 8.6;
    const r = 1.6 + f * 6.8;
    spot(ctx, x, y, r * 1.25, r, -0.3, '230,240,250', (0.1 + 0.12 * talk) * env * Math.min(1, talk * 1.6));
  }
}

/** Optional settings for `drawAlborProfile`. */
export interface AlborProfileOpts {
  /** Paint the dawn sky behind her (default true). False draws only her, for a scene's own sky. */
  sky?: boolean;
  /** 0..1.4 strength of the dawn light on her (default: by mood, 0.7 sleepy … 1.15 happy). */
  dawn?: number;
  /** Mirror her to face right. */
  flip?: boolean;
}

/**
 * Albor live, in profile, facing left, against the dawn (§5.4, the secret ending and the live
 * dialogue portrait). She fills a `size` × `size` square whose top-left corner is (x, y), in the
 * current units (the portrait's 100-unit box: `drawAlborProfile(ctx, 0, 0, 100, pose, t)`).
 *
 *  - `pose.mood` sets her posture (chin up when happy or proud, down when worried or sleepy) and how
 *    strong the dawn is on her; `pose.moodAge` eases the change over 0.5 s.
 *  - `pose.talk` / `pose.talking`: her breath steams in the cold (1–3 puffs, synced with `talk`).
 *  - `pose.reduceMotion`: no breathing, no drifting vapour (one still puff while talking).
 *  - `opts.sky` (default true) paints the dawn behind her; false leaves the background to the scene.
 *
 * The sky, the body and the head are cached; per frame: two blits (the head rotated by posture) and
 * the vapour.
 */
export function drawAlborProfile(ctx: Ctx2D, x: number, y: number, size: number, pose: AlborPose, t: number, opts: AlborProfileOpts = {}): void {
  const rm = pose.reduceMotion;
  const [tilt, dawnByMood] = POSTURE[pose.mood] ?? POSTURE.neutral;
  const ease = rm ? 1 : Math.min(1, (pose.moodAge ?? 10) / 0.5);
  const e = 1 - (1 - ease) * (1 - ease);
  const dawn = opts.dawn ?? dawnByMood;
  const dq = Math.round(dawn * 20) / 20;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  if (opts.flip) {
    ctx.translate(100, 0);
    ctx.scale(-1, 1);
  }
  if (opts.sky !== false) sprite(ctx, 'albor|dawn', 0, 0, 100, 100, (c) => paintDawnSky(c));
  // Breathing: the shoulders rise a little (0.25 Hz), the head follows.
  const br = rm ? 0 : Math.sin(t * 1.6) * 0.35;
  ctx.save();
  ctx.translate(0, -br * 0.5);
  sprite(ctx, `albor|body|${dq}`, 20, 60, 80, 40, (c, css) => paintProfileBody(c, css, dq));
  ctx.restore();
  ctx.save();
  ctx.translate(NECK[0], NECK[1] - br);
  ctx.rotate(-tilt * e);
  ctx.translate(-NECK[0], -NECK[1]);
  sprite(ctx, `albor|head|${dq}`, 28, 6, 52, 64, (c, css) => paintProfileHead(c, css, dq));
  ctx.restore();
  vapour(ctx, t, pose.talking || pose.talk > 0.02 ? pose.talk : 0, rm);
  ctx.restore();
}

// ── From behind, at the window (the Polaroid, the aliases) ────────────────────────────────────────────

/** Back of the head: the bob seen from behind, turned a little to her right (lost profile). */
const B_HAIR = parsePath(
  'M49.6 16.4C41.4 16.4 36 22 35 30.4C34.4 36 34.2 42 33.4 47.6C33 50.6 32.4 53 31.8 55' +
    'C33.8 55.8 35.6 55.4 37.2 56.2C39.4 55.6 41.4 56.6 43.6 56C46 56.8 48.6 56.2 50.8 56.8' +
    'C53.2 56.2 55.6 56.6 57.6 55.6C59.6 55.8 61.2 54.4 62.4 52.8C62.8 48 62.4 42 62.6 37.8' +
    'C63.2 34 64 30 63.4 27C61.6 20.4 56.8 16.4 49.6 16.4Z',
);
/** Her right cheek and jaw just showing beyond the hair (no features: the lost profile). */
const B_CHEEK = parsePath('M62.4 34.6C65 35.4 67.6 37.4 68.4 40.6C69 43.8 68 47.4 65.8 49.8C64.8 50.8 63.8 51.2 63 51.2Z');
const B_NECK = parsePath('M43.6 50.6C43.2 54 43 57 42.8 59.4L56.4 59.4C56.2 57 56 54 55.6 50.6Z');
const B_EAR = parsePath('M62.6 38.2C64.4 38 65.4 39.6 65.2 41.6C65 43.6 63.8 44.8 62.6 44.6Z');
const B_TEMPLE = parsePath('M62.8 38.6C64.8 38.4 67 38.2 69.2 38');
const B_SCARF = parsePath(
  'M40.4 55C46 57.6 53.4 57.8 59.6 55C61.4 57.8 62 60.6 61.4 63.4C54.4 66.4 45.6 66.4 38.6 63.4C38 60.6 38.6 57.8 40.4 55Z',
);
const B_SCARF_TAIL = parsePath('M41.6 62.4C39.6 68 38.6 74 38.4 80.4C40.6 81.4 43.2 81.4 45.4 80.6C45 74.6 45.2 68.8 46.4 63.8Z');
const B_BODY = parsePath(
  'M39 58.6C30 60.6 20.4 63.6 14.2 68.4C9 72.4 6.6 80 5.8 88C5.4 92 5.2 96 5 100L95 100' +
    'C94.8 96 94.6 92 94.2 88C93.4 80 91 72.4 85.8 68.4C79.6 63.6 70 60.6 61 58.6Z',
);
/** The parka's hood bunched at the back of the neck. */
const B_HOOD = parsePath('M35.8 60.4C42 58.4 58 58.4 64.2 60.4C67.4 64 68 69.4 66 73.6C58 76.6 42 76.6 34 73.6C32 69.4 32.6 64 35.8 60.4Z');
/** Full figure below the bust (box units continue past 100): the parka to the thigh with the arms
 * hanging in it, trousers, boots. */
const B_LOWER = parsePath(
  'M5 99C5.2 114 5.8 128 7.2 142C7.8 152 8.6 163 9.6 175.4C10.4 177.6 12.6 178.4 14.4 177.6' +
    'C22 179.2 27 179.4 31 179.2L32.2 214C32.6 228 33.2 241 34.2 254L47.6 254C48 240 48.6 224 49.2 206' +
    'L50 182L50.8 206C51.4 224 52 240 52.4 254L65.8 254C66.8 241 67.4 228 67.8 214L69 179.2' +
    'C73 179.4 78 179.2 85.6 177.6C87.4 178.4 89.6 177.6 90.4 175.4C91.4 163 92.2 152 92.8 142' +
    'C94.2 128 94.8 114 95 99Z',
);
/** Where the sleeves meet the parka's body (interior lines caught by the light). */
const B_ARMS = [parsePath('M16.4 106C16.8 124 17.6 146 18.6 172'), parsePath('M83.6 106C83.2 124 82.4 146 81.4 172')];
const B_BOOTS = parsePath('M34 250L34.2 262C34.4 265.6 30.6 267 27 268.4L26.4 271.6L48 271.6L47.8 250ZM52.2 250L52 271.6L73.6 271.6L73 268.4C69.4 267 65.6 265.6 65.8 262L66 250Z');

/** Light from the window in front of her: toward it is "up and away", so every edge gets a rim. */
function rimAll(c: Ctx2D, s: Shape, rgb: string, a: number, css: number): void {
  edgeBand(c, s, -0.7, -0.7, (LINE.contour * 2) / css, `rgb(${rgb})`, a);
  edgeBand(c, s, 0.7, -0.7, (LINE.contour * 2) / css, `rgb(${rgb})`, a * 0.8);
  edgeBand(c, s, 0, -1, 1.4, `rgb(${rgb})`, a * 0.4, 'screen');
}

function paintBack(c: Ctx2D, css: number, full: boolean): void {
  const parts: [Shape, readonly [string, string], number][] = [];
  if (full) parts.push([B_LOWER, ['#152326', '#07090a'], 0.45], [B_BOOTS, ['#0d0f11', '#050607'], 0.3]);
  parts.push(
    [B_BODY, ['#17292c', '#0b1314'], 0.75],
    [B_HOOD, ['#1b3034', '#0f1a1c'], 0.7],
    [B_NECK, ['#2a1d18', '#1a120f'], 0.55],
    [B_CHEEK, ['#2e211b', '#1d1511'], 0.95],
    [B_EAR, ['#3a2820', '#22160f'], 0.5],
    [B_HAIR, ['#1f1612', '#120d0a'], 0.85],
    [B_SCARF, ['#5a4116', '#2f220b'], 0.8],
    [B_SCARF_TAIL, ['#4e3812', '#2a1e09'], 0.7],
  );
  for (const [s, fill, a] of parts) {
    const g = c.createLinearGradient(0, 15, 0, full ? 270 : 100);
    g.addColorStop(0, fill[0]);
    g.addColorStop(1, fill[1]);
    trace(c, s);
    c.fillStyle = g;
    c.fill();
    c.save();
    trace(c, s);
    c.clip();
    // VELA's lamp warms her back a little, from behind us and to the right.
    spot(c, 72, 66, 30, 26, 0, '255,167,87', 0.08, 'screen');
    if (s === B_LOWER || s === B_BOOTS) {
      // Below the window the light only grazes the outer sides, faintly.
      edgeBand(c, s, -1, -0.2, (LINE.detail * 2) / css, `rgb(${AURORA_RIM})`, a * 0.3);
      edgeBand(c, s, 1, -0.2, (LINE.detail * 2) / css, `rgb(${AURORA_RIM})`, a * 0.22);
    } else rimAll(c, s, s === B_SCARF || s === B_SCARF_TAIL ? '255,214,140' : AURORA_RIM, a, css);
    if (s === B_HAIR) {
      // The window grazes the crown: a soft band of sheen across the hair (anisotropic, like fibres).
      spot(c, 46, 23.6, 11, 3, -0.1, AURORA_RIM, 0.14, 'screen');
    }
    c.restore();
  }
  if (full) {
    c.lineCap = 'round';
    for (const arm of B_ARMS) {
      c.strokeStyle = `rgba(${AURORA_RIM},0.14)`;
      c.lineWidth = LINE.fine / css;
      trace(c, arm);
      c.stroke();
    }
  }
  // Hair: strands at the crown and the edges, and the silver streak at her right temple.
  c.lineCap = 'round';
  for (let i = 0; i < 34; i++) {
    const f = i / 33;
    const ang = Math.PI * (1.05 + 0.9 * f);
    const x = 49.6 + Math.cos(ang) * 15.2;
    const y = 34 + Math.sin(ang) * 17;
    c.strokeStyle = `rgba(${AURORA_RIM},${0.2 + 0.45 * hash(i, 76)})`;
    c.lineWidth = LINE.fine / css;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + Math.cos(ang) * 1.4, y + Math.sin(ang) * 1.4 + 0.6, x + Math.cos(ang) * (1.2 + 1.6 * hash(i, 77)), y + Math.sin(ang) * (1.6 + 1.4 * hash(i, 78)) + 1.4);
    c.stroke();
  }
  // Strands falling down the back of the bob (the lamp's warm fill picks a few up).
  c.save();
  trace(c, B_HAIR);
  c.clip();
  for (let i = 0; i < 26; i++) {
    const x0 = 36 + hash(i, 79) * 27;
    c.strokeStyle = `rgba(${i % 3 ? '120,92,74' : SILVER},${0.06 + 0.1 * hash(i, 80)})`;
    c.lineWidth = LINE.fine / css;
    trace(c, curve([49.6 + (x0 - 49.6) * 0.3, 19, x0 - 0.4, 34, x0 + (x0 - 49.6) * 0.08, 52]));
    c.stroke();
  }
  for (let i = 0; i < 10; i++) {
    const f = i / 9;
    c.strokeStyle = `rgba(${SILVER},${0.25 + 0.25 * hash(i, 85)})`;
    c.lineWidth = LINE.fine / css;
    trace(c, curve([55 + f * 2, 19 + f, 60.6 + f * 1.2, 26 + f, 63.2 + f * 0.4, 36 + f * 1.4, 63.6, 46 + f]));
    c.stroke();
  }
  c.restore();
  // The glasses' temple arm over her right ear, glinting, and the lens's edge beyond her cheek.
  c.strokeStyle = '#0a0809';
  c.lineWidth = 0.6;
  trace(c, B_TEMPLE);
  c.stroke();
  c.strokeStyle = 'rgba(230,250,244,0.9)';
  c.lineWidth = LINE.fine / css;
  trace(c, B_TEMPLE, 0, -0.3);
  c.stroke();
  c.beginPath();
  c.ellipse(69.4, 39.6, 0.8, 3, 0.15, 0, TAU);
  c.strokeStyle = 'rgba(8,8,10,0.9)';
  c.lineWidth = LINE.detail / css;
  c.stroke();
  c.strokeStyle = 'rgba(220,255,245,0.85)';
  c.beginPath();
  c.ellipse(69.4, 39.6, 0.8, 3, 0.15, -Math.PI * 0.5, Math.PI * 0.2);
  c.stroke();
}

/**
 * Albor seen from behind, against a window (§5.3, §5.6): the bob with its silver streak, the mustard
 * scarf, the parka, a glint on the arm of her glasses. `full` adds the parka to the thigh, trousers and
 * boots. (x, y) is the bottom centre: of the bust (100-box units, `hgt` = 100 draws the bust in the
 * portrait box) or the feet (`full`, `hgt` = the figure's height).
 */
export function drawAlborBack(ctx: Ctx2D, x: number, y: number, hgt: number, pose: AlborPose, t: number, opts: { full?: boolean } = {}): void {
  const full = opts.full === true;
  const k = full ? hgt / 256 : hgt / 100;
  const br = pose.reduceMotion ? 0 : Math.sin(t * 1.6) * 0.3;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.translate(-50, full ? -271.6 : -100);
  ctx.translate(0, br);
  sprite(ctx, `albor|back|${full ? 1 : 0}`, 0, 12, 100, full ? 262 : 88, (c, css) => paintBack(c, css, full));
  ctx.restore();
}

// ── The Polaroid (§5.6) ───────────────────────────────────────────────────────────────────────────────

/** What she wrote under it (Fraunces italic, blue ink). */
export const POLAROID_CAPTION = { es: 'Día 1 de la noche · A.', en: 'Day 1 of the night · A.' } as const;

type WindowImg = CanvasImageSource & { width: number | SVGAnimatedLength; height: number | SVGAnimatedLength };

function imgReady(img: WindowImg | null | undefined): img is WindowImg {
  if (!img) return false;
  const im = img as { complete?: boolean; naturalWidth?: number; width?: unknown };
  if (im.complete === false) return false;
  if (typeof im.naturalWidth === 'number') return im.naturalWidth > 0;
  return typeof im.width === 'number' && im.width > 0;
}

function imgSize(img: WindowImg): [number, number] {
  const im = img as { naturalWidth?: number; naturalHeight?: number; width?: unknown; height?: unknown };
  const w = typeof im.naturalWidth === 'number' && im.naturalWidth > 0 ? im.naturalWidth : typeof im.width === 'number' ? im.width : 1;
  const h = typeof im.naturalHeight === 'number' && im.naturalHeight > 0 ? im.naturalHeight : typeof im.height === 'number' ? im.height : 1;
  return [w, h];
}

/** The window behind her in the photo: night outside, an aurora (photo or drawn), the mullions. */
function paintWindowScene(c: Ctx2D, img: WindowImg | null): void {
  // The room: dark, warm near the bottom (VELA's lamp somewhere behind the camera).
  const room = c.createLinearGradient(0, 0, 0, 100);
  room.addColorStop(0, '#0c0d10');
  room.addColorStop(1, '#1c1510');
  c.fillStyle = room;
  c.fillRect(0, 0, 100, 100);
  // The window: a wide pane of night, top two thirds.
  c.save();
  c.beginPath();
  c.rect(8, 6, 84, 66);
  c.clip();
  if (img) {
    // The photo, darkened to 60 % and nudged 3 % (the glass bends it a little, R7).
    const [iw, ih] = imgSize(img);
    const s = Math.max(84 / iw, 66 / ih) * 1.03;
    c.drawImage(img, 50 - (iw * s) / 2 + 1, 39 - (ih * s) / 2, iw * s, ih * s);
    c.fillStyle = 'rgba(4,8,14,0.4)';
    c.fillRect(8, 6, 84, 66);
  } else {
    const sky = c.createLinearGradient(0, 6, 0, 72);
    sky.addColorStop(0, '#04070f');
    sky.addColorStop(0.7, '#0b1a24');
    sky.addColorStop(1, '#152a30');
    c.fillStyle = sky;
    c.fillRect(8, 6, 84, 66);
    // Aurora: two soft curtains, their rays continuous (sines, not noise), brightest at the lower hem.
    c.globalCompositeOperation = 'screen';
    for (let band = 0; band < 2; band++) {
      for (let i = 0; i < 84; i++) {
        const xx = 8 + i;
        const base = 30 + band * 7 + Math.sin(xx * 0.07 + band * 2) * 7 + Math.sin(xx * 0.19 + 1) * 2.4;
        const h = 12 + 8 * (0.5 + 0.5 * Math.sin(xx * 0.11 + band)) + 4 * Math.sin(xx * 0.53 + band * 3) ** 2;
        const a = (band ? 0.1 : 0.16) * (0.55 + 0.45 * Math.sin(xx * 0.09 + 0.6 + band * 1.7)) * (0.8 + 0.2 * Math.sin(xx * 0.9));
        const g = c.createLinearGradient(0, base - h, 0, base + 2);
        g.addColorStop(0, 'rgba(110,255,190,0)');
        g.addColorStop(0.75, `rgba(110,255,190,${a})`);
        g.addColorStop(1, `rgba(210,255,235,${a * 1.5})`);
        c.fillStyle = g;
        c.fillRect(xx - 0.6, base - h, 1.2, h + 2);
      }
    }
    c.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 40; i++) {
      c.fillStyle = `rgba(230,240,255,${0.3 + 0.5 * hash(i, 92)})`;
      c.fillRect(8 + hash(i, 93) * 84, 6 + hash(i, 94) * 30, 0.4, 0.4);
    }
    // Snow and the horizon.
    c.fillStyle = '#1c2a33';
    c.beginPath();
    c.moveTo(8, 62);
    c.quadraticCurveTo(40, 58, 92, 61);
    c.lineTo(92, 72);
    c.lineTo(8, 72);
    c.closePath();
    c.fill();
  }
  c.restore();
  // Window light spilling onto the sill and the room (cold).
  spot(c, 50, 74, 46, 10, 0, AURORA_RIM, 0.12, 'screen');
  // Mullions and the frame (painted wood, almost black against the night).
  c.fillStyle = '#0b0c0e';
  c.fillRect(6, 4, 88, 2.4);
  c.fillRect(6, 71.6, 88, 3.4);
  c.fillRect(6, 4, 2.4, 70);
  c.fillRect(91.6, 4, 2.4, 70);
  c.fillRect(49, 4, 2.2, 70);
  c.fillRect(6, 37, 88, 1.8);
  c.fillStyle = 'rgba(196,240,226,0.25)';
  c.fillRect(8.4, 6.4, 0.4, 65);
  c.fillRect(51.2, 6.4, 0.4, 65);
  // A reflection of the room's lamp on the glass, upper right.
  spot(c, 78, 14, 4, 2.4, 0, '255,200,150', 0.18, 'screen');
}

function paintPolaroid(c: Ctx2D, w: number, css: number, img: WindowImg | null, lang: Lang): void {
  const h = w * 1.214;
  const m = w * 0.06; // side and top border
  const iw = w - m * 2; // the image is square
  // The white frame (Polaroid 600: 88 × 107 mm, a 79-mm image).
  const fg = c.createLinearGradient(0, 0, w, h);
  fg.addColorStop(0, '#fbf9f3');
  fg.addColorStop(1, '#e8e2d4');
  c.beginPath();
  rrect(c, 0, 0, w, h, w * 0.012);
  c.fillStyle = fg;
  c.fill();
  // Paper grain and a little age.
  const p = grainPattern(c);
  if (p) {
    c.save();
    c.globalCompositeOperation = 'soft-light';
    c.globalAlpha = 0.12;
    c.fillStyle = p;
    c.fillRect(0, 0, w, h);
    c.restore();
  }
  spot(c, w * 0.85, h * 0.92, w * 0.3, h * 0.12, 0, '190,160,110', 0.12, 'multiply');
  // The image.
  c.save();
  c.beginPath();
  c.rect(m, m, iw, iw);
  c.clip();
  c.save();
  c.translate(m, m);
  c.scale(iw / 100, iw / 100);
  paintWindowScene(c, img);
  // Albor from behind, at the window, lower centre-left.
  c.save();
  c.translate(44, 104);
  c.scale(0.86, 0.86);
  c.translate(-50, -100);
  paintBack(c, (css * iw) / 100 * 0.86, false);
  c.restore();
  c.restore();
  // Instant film: warm cast, lifted blacks, a soft vignette, grain.
  c.globalCompositeOperation = 'screen';
  c.fillStyle = 'rgba(46,34,26,0.55)';
  c.fillRect(m, m, iw, iw);
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = 'rgba(255,236,206,1)';
  c.fillRect(m, m, iw, iw);
  const vg = c.createRadialGradient(m + iw / 2, m + iw / 2, iw * 0.3, m + iw / 2, m + iw / 2, iw * 0.74);
  vg.addColorStop(0, '#ffffff');
  vg.addColorStop(1, '#a8968a');
  c.fillStyle = vg;
  c.fillRect(m, m, iw, iw);
  c.globalCompositeOperation = 'source-over';
  if (p) {
    c.globalCompositeOperation = 'soft-light';
    c.globalAlpha = 0.16;
    c.fillStyle = p;
    c.fillRect(m, m, iw, iw);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }
  c.restore();
  // The image's edge: a thin dark lip where the emulsion meets the frame.
  c.strokeStyle = 'rgba(40,30,24,0.55)';
  c.lineWidth = LINE.fine / css;
  c.strokeRect(m, m, iw, iw);
  // Her handwriting on the bottom border.
  c.save();
  c.translate(w * 0.5, m + iw + (h - m - iw) * 0.52);
  c.rotate(-0.025);
  c.fillStyle = '#23406e';
  c.globalAlpha = 0.9;
  c.font = `italic 500 ${w * 0.082}px Fraunces, Georgia, serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(POLAROID_CAPTION[lang], 0, 0);
  c.restore();
  // The frame's edge.
  c.strokeStyle = 'rgba(60,52,40,0.55)';
  c.lineWidth = LINE.detail / css;
  c.beginPath();
  rrect(c, 0, 0, w, h, w * 0.012);
  c.stroke();
}

function paintPin(ctx: Ctx2D, x: number, y: number, r: number): void {
  // Its shadow on the photo, down-right (the window light is up-left), then the red plastic head.
  spot(ctx, x + r * 0.9, y + r * 1.1, r * 1.5, r * 1.1, 0.4, '20,10,6', 0.45);
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#ff8a78');
  g.addColorStop(0.35, '#d23a2a');
  g.addColorStop(1, '#6e1208');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,6,2,0.8)';
  ctx.lineWidth = r * 0.12;
  ctx.stroke();
  spot(ctx, x - r * 0.38, y - r * 0.42, r * 0.32, r * 0.22, -0.6, '255,255,255', 0.9);
}

/** Optional settings for `drawAlborPolaroid`. */
export interface PolaroidOpts {
  /** Language of her caption (default: the page's `<html lang>`). */
  lang?: Lang;
  /** Rotation in radians about the pin (default −0.05). */
  tilt?: number;
  /** Draw the red push pin (default true). */
  pin?: boolean;
}

/**
 * Albor's Polaroid (§5.6): her, from behind, at the window, with the aurora outside; her caption in
 * blue ink; pinned to the board with a red push pin. The frame is `w` wide (and 1.214 w tall), its
 * top-left corner at (x, y) before the tilt. `windowImg` (the `estacion-aurora-noaa` photo, once loaded)
 * goes in the window, darkened, slightly refracted; without it the aurora is drawn. Cached per size ×
 * DPR × tilt × language × photo; `t`/`rm` only move the lamp's gloss on the film.
 */
export function drawAlborPolaroid(ctx: Ctx2D, x: number, y: number, w: number, t: number, rm: boolean, windowImg?: CanvasImageSource | null, opts: PolaroidOpts = {}): void {
  const img = imgReady(windowImg as WindowImg | null | undefined) ? (windowImg as WindowImg) : null;
  const lang = opts.lang ?? pageLang();
  const tilt = opts.tilt ?? -0.05;
  const h = w * 1.214;
  // Shadow on the board (soft, down-right).
  ctx.save();
  ctx.translate(x + w / 2, y + w * 0.03);
  ctx.rotate(tilt);
  spot(ctx, w * 0.06, h * 0.55, w * 0.62, h * 0.6, 0, '0,0,0', 0.4);
  ctx.translate(-w / 2, -w * 0.03);
  sprite(ctx, `polaroid|${img ? 1 : 0}|${lang}|${Math.round(w)}`, -1, -1, w + 2, h + 2, (c, css) => paintPolaroid(c, w, css, img, lang));
  // The film's gloss: one broad band from the lamp, breathing with its flicker.
  const fl = rm ? 1 : 0.97 + 0.03 * Math.sin(t * 2.3);
  const m = w * 0.06;
  const sg = ctx.createLinearGradient(m, m, m + w * 0.9, m + w * 0.9);
  sg.addColorStop(0, 'rgba(255,240,220,0)');
  sg.addColorStop(0.55, 'rgba(255,240,220,0)');
  sg.addColorStop(0.64, `rgba(255,240,220,${0.12 * fl})`);
  sg.addColorStop(0.74, 'rgba(255,240,220,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(m, m, w - m * 2, w - m * 2);
  if (opts.pin !== false) paintPin(ctx, w / 2, w * 0.035, Math.max(1.2, w * 0.05));
  ctx.restore();
}
