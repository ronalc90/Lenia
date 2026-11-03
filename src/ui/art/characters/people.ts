/**
 * Who is who at Estación Vigilia (docs/STORY.md §2) under scientific realism (ADR-029,
 * docs/ARTE-REALISTA.md §5), and the dialogue portraits that show them:
 *
 *  ALBOR   the former lead scientist, never face on. On tape: her portable recorder playing, with her
 *          Polaroid (from behind, at the window) taped above it. Live (the secret ending): in profile,
 *          against the dawn, her breath steaming when she speaks.
 *  YOU     the night-shift scientist, in first person: your gloved hand writing in the field notebook
 *          with a fountain pen, the cuff of the coat you picked in the intro. The ink appears as you
 *          "speak"; the lamp and the pen's posture follow the mood.
 *
 * The coat ids are the old look ids (`curls`, `beanie`, `bun`) and `LOOK_STORAGE_KEY` is unchanged, so a
 * saved choice survives (§5.5).
 */
import { drawRecorder } from '../cast';
import { cylinderRamp, grainPattern, kelvin } from '../vector';
import { LINE } from '../tokens';
import { drawAlborPolaroid, drawAlborProfile } from './albor';
import { COAT_IDS, type CoatId } from './coats';
import { COAT_GLOVE, drawGlovedHand, handTip, type DoctorMood, type DoctorSpec, type Gesture } from './doctor';
import { hash, metrics, pageLang, rrect, spot, sprite, type Ctx2D, TAU } from './kit';

/** Albor is never drawn as a coat: she is seen from behind or in profile (no `coat`). */
export const ALBOR: DoctorSpec = { id: 'albor', coat: null, glove: 'blue' };

export type PlayerLookId = CoatId;
export const PLAYER_LOOK_IDS: readonly PlayerLookId[] = COAT_IDS;

/** The three coats on the rack (§5.5). */
export const PLAYER_LOOKS: Record<PlayerLookId, DoctorSpec> = {
  curls: { id: 'curls', coat: 'curls', glove: COAT_GLOVE.curls },
  beanie: { id: 'beanie', coat: 'beanie', glove: COAT_GLOVE.beanie },
  bun: { id: 'bun', coat: 'bun', glove: COAT_GLOVE.bun },
};

/** Their names (§7.6). */
export const PLAYER_LOOK_NAMES: Record<PlayerLookId, { es: string; en: string }> = {
  curls: { es: 'Bata clásica', en: 'Classic lab coat' },
  beanie: { es: 'Parka polar', en: 'Polar parka' },
  bun: { es: 'Cuello mao', en: 'Mandarin-collar coat' },
};

export const LOOK_STORAGE_KEY = 'bioluma.look';
let look: PlayerLookId | null = null;

/** The player's coat (picked in the intro; persisted in localStorage, never throws). */
export function getPlayerLook(): PlayerLookId {
  if (look) return look;
  try {
    const v = globalThis.localStorage?.getItem(LOOK_STORAGE_KEY);
    if (v && (PLAYER_LOOK_IDS as readonly string[]).includes(v)) look = v as PlayerLookId;
  } catch {
    /* storage blocked */
  }
  return look ?? 'curls';
}

export function setPlayerLook(id: PlayerLookId): void {
  look = id;
  try {
    globalThis.localStorage?.setItem(LOOK_STORAGE_KEY, id);
  } catch {
    /* storage blocked */
  }
}

export function playerSpec(id: PlayerLookId = getPlayerLook()): DoctorSpec {
  return PLAYER_LOOKS[id];
}

/** Story moods (VELA's vocabulary, plus 'alarm') → a doctor's mood. */
export function doctorMood(m: string): DoctorMood {
  switch (m) {
    case 'awed':
      return 'surprised';
    case 'alarm':
      return 'worried';
    case 'happy':
    case 'surprised':
    case 'worried':
    case 'thinking':
    case 'proud':
    case 'sleepy':
      return m;
    default:
      return 'neutral';
  }
}

/** What a dialogue portrait needs (a subset of PortraitState). */
export interface PeoplePose {
  mood: string;
  moodAge: number;
  talk: number;
  talking: boolean;
  blink: number;
  live: boolean;
  reduceMotion: boolean;
  gesture?: Gesture;
}

// ── The cassette (a compact cassette, 100.4 × 63.8 mm) ───────────────────────────────────────────────

/** Her label on the cassette, in masking tape. */
export const CASSETTE_LABEL = { es: 'Cinta 3 · A.', en: 'Tape 3 · A.' } as const;

function paintCassette(c: Ctx2D, css: number, lang: 'es' | 'en'): void {
  // Shell: smoked translucent plastic; the label area; five screws; the head opening at the bottom.
  c.beginPath();
  rrect(c, 0, 0, 100, 64, 4);
  const sh = c.createLinearGradient(0, 0, 0, 64);
  sh.addColorStop(0, '#3a3634');
  sh.addColorStop(0.5, '#2a2725');
  sh.addColorStop(1, '#1c1a19');
  c.fillStyle = sh;
  c.fill();
  c.strokeStyle = 'rgba(8,8,8,0.9)';
  c.lineWidth = LINE.contour / css;
  c.stroke();
  c.save();
  c.beginPath();
  rrect(c, 0, 0, 100, 64, 4);
  c.clip();
  c.globalCompositeOperation = 'screen';
  const sp = c.createLinearGradient(0, 0, 60, 64);
  sp.addColorStop(0, 'rgba(255,255,255,0.16)');
  sp.addColorStop(0.35, 'rgba(255,255,255,0.02)');
  sp.addColorStop(0.36, 'rgba(255,255,255,0)');
  c.fillStyle = sp;
  c.fillRect(0, 0, 100, 64);
  c.globalCompositeOperation = 'source-over';
  c.restore();
  // Label (masking tape, slightly ragged) with her handwriting.
  c.save();
  c.translate(50, 9.6);
  c.rotate(-0.02);
  c.fillStyle = '#e8dbb2';
  c.beginPath();
  c.moveTo(-40, -5);
  for (let i = 0; i <= 20; i++) c.lineTo(-40 + i * 4, -5 + (hash(i, 99) - 0.5) * 0.7);
  c.lineTo(40, 5);
  for (let i = 20; i >= 0; i--) c.lineTo(-40 + i * 4, 5 + (hash(i, 100) - 0.5) * 0.7);
  c.closePath();
  c.fill();
  const p = grainPattern(c);
  if (p) {
    c.globalCompositeOperation = 'soft-light';
    c.globalAlpha = 0.2;
    c.fillStyle = p;
    c.fill();
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }
  c.fillStyle = '#23406e';
  c.font = 'italic 500 7px Fraunces, Georgia, serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(CASSETTE_LABEL[lang], 0, 0.4);
  c.restore();
  // The window: a clear rounded slot with the reels behind it (painted per frame).
  c.beginPath();
  rrect(c, 22, 21, 56, 22, 10);
  c.fillStyle = '#0d0b0a';
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.85)';
  c.lineWidth = LINE.detail / css;
  c.stroke();
  // Head opening (trapezoid) at the bottom.
  c.beginPath();
  c.moveTo(18, 64);
  c.lineTo(24, 52);
  c.lineTo(76, 52);
  c.lineTo(82, 64);
  c.closePath();
  c.fillStyle = '#151312';
  c.fill();
  c.stroke();
  c.fillStyle = '#5a3a24';
  c.fillRect(22, 61.4, 56, 1.2);
  for (const [x, y] of [
    [5, 5],
    [95, 5],
    [5, 59],
    [95, 59],
    [50, 56],
  ]) {
    c.beginPath();
    c.arc(x, y, 1.7, 0, TAU);
    c.fillStyle = cylinderRamp(c, x - 1.7, y - 1.7, x + 1.7, y + 1.7, ['#3a3d40', '#f7f7f5', '#a4a8ab', '#c9dbe4', '#2e3134'], [0, 0.28, 0.5, 0.82, 1]);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = LINE.fine / css;
    c.beginPath();
    c.moveTo(x - 1, y);
    c.lineTo(x + 1, y);
    c.stroke();
  }
}

/** A compact cassette centred at (x, y), `w` wide (0.635 w tall): the reels turn faster while she talks. */
export function drawCassette(ctx: Ctx2D, x: number, y: number, w: number, t: number, talking: boolean, rm: boolean): void {
  const lang = pageLang();
  ctx.save();
  ctx.translate(x - w / 2, y - w * 0.32);
  ctx.scale(w / 100, w / 100);
  sprite(ctx, `cassette|${lang}`, -1, -1, 102, 66, (c, css) => paintCassette(c, css, lang));
  const spin = rm ? 0 : t * (talking ? 4.6 : 0.6);
  ctx.save();
  ctx.beginPath();
  rrect(ctx, 22, 21, 56, 22, 10);
  ctx.clip();
  for (let i = 0; i < 2; i++) {
    const rx = i === 0 ? 34 : 66;
    const wound = i === 0 ? 12 : 8.4;
    ctx.fillStyle = '#4a2f1c';
    ctx.beginPath();
    ctx.arc(rx, 32, wound, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.translate(rx, 32);
    ctx.rotate(spin * (i === 0 ? 1 : 1.35));
    ctx.fillStyle = '#ece7da';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#17120e';
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      ctx.fillRect(Math.cos(a) * 3.1 - 0.7, Math.sin(a) * 3.1 - 0.7, 1.4, 1.4);
    }
    ctx.beginPath();
    ctx.arc(0, 0, 1.6, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  ctx.restore();
}

// ── Albor ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Albor in the dialogue. On tape: her recorder playing, her Polaroid taped above it (§5.7). Live: in
 * profile against the dawn, her breath steaming when she talks (§5.4).
 */
export function drawAlborPortrait(ctx: Ctx2D, s: PeoplePose, t: number): void {
  if (s.live) {
    drawAlborProfile(ctx, 0, 0, 100, s, t);
    return;
  }
  spot(ctx, 50, 66, 52, 34, 0, '255,170,90', 0.12);
  drawRecorder(ctx, { talk: s.talk, talking: s.talking, blink: 0, live: false, pulses: [], reduceMotion: s.reduceMotion, mood: s.mood }, t);
  // The Polaroid, taped to the wall above the recorder (masking tape across its top).
  drawAlborPolaroid(ctx, 5, 3.4, 27, t, s.reduceMotion, null, { tilt: -0.07, pin: false });
  ctx.save();
  ctx.translate(18.4, 3.6);
  ctx.rotate(0.1);
  ctx.fillStyle = 'rgba(233,220,180,0.88)';
  ctx.fillRect(-5.5, -1.6, 11, 3.2);
  ctx.restore();
}

// ── You (the journal) ─────────────────────────────────────────────────────────────────────────────────

/** Lamp temperature and strength by mood (the light changes with the mood; nothing has a face). */
const YOU_LIGHT: Record<DoctorMood, [number, number]> = {
  neutral: [2700, 0.9],
  happy: [3200, 1],
  proud: [3200, 1.05],
  surprised: [3600, 1.1],
  thinking: [2700, 0.85],
  worried: [2200, 0.72],
  sleepy: [2200, 0.5],
};

/** How the pen sits by mood: [lift x, lift y, extra angle]: writing, raised to think, startled, resting. */
const YOU_POSTURE: Record<DoctorMood, [number, number, number]> = {
  neutral: [0, 0, 0],
  happy: [0, 0, -0.02],
  proud: [0.4, 0.6, -0.04],
  surprised: [-1.6, -6, 0.1],
  thinking: [0.6, -3.6, 0.07],
  worried: [0, 0.3, -0.05],
  sleepy: [3, 4, 0.12],
};

/** Notebook geometry in the box: the right page's lines (y of each baseline), x span. */
const NB = { x0: 53, x1: 76, y0: 27, dy: 6.6, lines: 3 } as const;

function paintNotebook(c: Ctx2D, css: number): void {
  c.save();
  c.translate(50, 54);
  c.rotate(-0.06);
  c.translate(-50, -54);
  // Contact shadow on the desk, the leather cover peeking out.
  spot(c, 52, 60, 48, 36, 0, '0,0,0', 0.5);
  c.beginPath();
  rrect(c, 8, 20, 84, 68, 2.6);
  const cov = c.createLinearGradient(8, 20, 92, 88);
  cov.addColorStop(0, '#4a3326');
  cov.addColorStop(1, '#241710');
  c.fillStyle = cov;
  c.fill();
  c.strokeStyle = 'rgba(10,6,4,0.9)';
  c.lineWidth = LINE.contour / css;
  c.stroke();
  // Pages: cream paper, curving into the spine.
  for (const side of [-1, 1]) {
    const g = c.createLinearGradient(50 + side * 40, 0, 50, 0);
    g.addColorStop(0, '#f3e9d2');
    g.addColorStop(0.82, '#ecdfc1');
    g.addColorStop(1, '#cdb98f');
    c.beginPath();
    c.moveTo(50, 22.6);
    c.quadraticCurveTo(50 + side * 20, 20, 50 + side * 40, 22.4);
    c.lineTo(50 + side * 40, 85.4);
    c.quadraticCurveTo(50 + side * 20, 83.4, 50, 86);
    c.closePath();
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = 'rgba(90,70,40,0.5)';
    c.lineWidth = LINE.fine / css;
    c.stroke();
  }
  const p = grainPattern(c);
  if (p) {
    c.save();
    c.globalCompositeOperation = 'soft-light';
    c.globalAlpha = 0.1;
    c.fillStyle = p;
    c.fillRect(10, 20, 80, 68);
    c.restore();
  }
  // Rules (pale blue) and the margin (red), at `fine`.
  c.lineWidth = LINE.fine / css;
  for (let i = 0; i < 8; i++) {
    const y = 27 + i * 6.6;
    c.strokeStyle = 'rgba(70,110,160,0.28)';
    c.beginPath();
    c.moveTo(13, y);
    c.lineTo(47, y + 0.3);
    c.moveTo(53, y + 0.3);
    c.lineTo(87.6, y);
    c.stroke();
  }
  c.strokeStyle = 'rgba(190,60,50,0.35)';
  c.beginPath();
  c.moveTo(16.4, 23);
  c.lineTo(16.4, 85);
  c.stroke();
  // Left page: a pencil sketch of an Orbium with its leader line and a written note (graphite).
  c.strokeStyle = 'rgba(60,64,72,0.7)';
  c.lineWidth = LINE.detail / css;
  for (let k = 0; k < 3; k++) {
    c.beginPath();
    c.arc(31 + k * 0.15, 46 + k * 0.1, 9.4 - k * 0.3, 0.55, TAU - 0.45);
    c.stroke();
  }
  c.beginPath();
  c.ellipse(31, 47.4, 3, 4.6, 0, 0, TAU);
  c.stroke();
  c.strokeStyle = 'rgba(60,64,72,0.45)';
  c.beginPath();
  c.arc(31, 46, 12.4, Math.PI * 1.1, Math.PI * 1.9);
  c.stroke();
  c.beginPath();
  c.moveTo(40, 40);
  c.lineTo(45.4, 31.6);
  c.stroke();
  c.fillStyle = 'rgba(60,64,72,0.7)';
  c.beginPath();
  c.arc(40, 40, 0.5, 0, TAU);
  c.fill();
  handwriting(c, 18, 72.2, 26, 1, 1, 'rgba(60,64,72,0.6)', LINE.fine / css);
  handwriting(c, 18, 78.8, 18, 1, 2, 'rgba(60,64,72,0.6)', LINE.fine / css);
  // Spine shadow.
  const sg = c.createLinearGradient(45, 0, 55, 0);
  sg.addColorStop(0, 'rgba(60,40,20,0)');
  sg.addColorStop(0.5, 'rgba(60,40,20,0.35)');
  sg.addColorStop(1, 'rgba(60,40,20,0)');
  c.fillStyle = sg;
  c.fillRect(45, 21, 10, 66);
  c.restore();
}

/**
 * A line of cursive-like handwriting along a baseline: arches of x-height with an occasional
 * ascender, pen lifts between words. `part` 0..1 is how much of it is written (the ink appears stroke
 * by stroke). Allocation-free.
 */
function handwriting(c: Ctx2D, x0: number, y: number, len: number, part: number, seed: number, ink: string, lw: number): number {
  const end = x0 + len * Math.max(0, Math.min(1, part));
  c.strokeStyle = ink;
  c.lineWidth = lw;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  let x = x0;
  let word = 0;
  let pen = false;
  let yy = y;
  while (x < end) {
    const wl = 3.2 + hash(word, seed * 13) * 5.4;
    const wEnd = Math.min(end, x + wl);
    let first = true;
    for (let px = x; px <= wEnd; px += 0.3) {
      const ph = (px - x) * 3.1 + word;
      const asc = hash(Math.floor((px - x) / 1.05) + word * 9, seed) > 0.82 ? 2.2 : 1;
      yy = y - Math.abs(Math.sin(ph)) * 1.25 * asc;
      if (first) {
        c.moveTo(px, yy);
        first = false;
      } else c.lineTo(px, yy);
      pen = true;
    }
    x = wEnd + 1.5;
    word++;
  }
  if (pen) c.stroke();
  return yy;
}

/**
 * You, in the dialogue: your gloved hand writing in the field notebook with a fountain pen, the cuff of
 * your coat (§5.7). The ink appears stroke by stroke while you "speak"; the lamp's colour and strength
 * and the pen's posture change with the mood. Reduce motion shows the entry written and holds still.
 */
export function drawYouPortrait(ctx: Ctx2D, s: PeoplePose, t: number, lookId: PlayerLookId = getPlayerLook()): void {
  const rm = s.reduceMotion;
  const m = doctorMood(s.mood);
  const [K, power] = YOU_LIGHT[m];
  const [lx, ly, la] = YOU_POSTURE[m];
  const { css } = metrics(ctx);
  sprite(ctx, 'you|notebook', 0, 10, 100, 90, paintNotebook);
  // Today's entry on the right page, in the notebook's frame.
  const rate = s.talking ? 1.3 : 0.12;
  const written = rm ? 2.6 : m === 'sleepy' ? 1.6 : (t * rate) % 3.4;
  ctx.save();
  ctx.translate(50, 54);
  ctx.rotate(-0.06);
  ctx.translate(-50, -54);
  let nibX: number = NB.x0;
  let nibY: number = NB.y0;
  const full = Math.floor(written);
  for (let i = 0; i <= Math.min(NB.lines - 1, full); i++) {
    const part = i < full ? 1 : written - full;
    if (part <= 0) continue;
    const len = (NB.x1 - NB.x0) * (i === NB.lines - 1 ? 0.6 : 0.9 + 0.1 * hash(i, 3));
    nibY = handwriting(ctx, NB.x0, NB.y0 + i * NB.dy, len, part, 5 + i, 'rgba(24,36,72,0.9)', (LINE.fine * 1.1) / css);
    nibX = NB.x0 + len * part;
  }
  if (m === 'proud' && full >= 1) {
    // Underlined twice: a result worth keeping.
    const y = NB.y0 + Math.min(full - 1, NB.lines - 1) * NB.dy + 1.4;
    ctx.strokeStyle = 'rgba(24,36,72,0.85)';
    ctx.lineWidth = (LINE.fine * 1.2) / css;
    ctx.beginPath();
    ctx.moveTo(NB.x0, y);
    ctx.lineTo(NB.x0 + 22, y - 0.3);
    ctx.moveTo(NB.x0 + 1, y + 1);
    ctx.lineTo(NB.x0 + 20, y + 0.8);
    ctx.stroke();
  }
  if (m === 'worried') {
    // The nib pressed too long: a small ink blot.
    spot(ctx, nibX + 0.2, nibY + 0.3, 0.9, 0.7, 0, '24,36,72', 0.85);
  }
  // The hand: its nib on the writing point (or lifted, by mood). Its soft shadow falls left of it.
  const hk = 0.68;
  // Upright, so the hand and its cuff stay in the portrait box; the forearm is lost in the dark.
  const a = -0.1 + la;
  const [tx, ty] = handTip('pen');
  const rx = tx * Math.cos(a) - ty * Math.sin(a);
  const ry = tx * Math.sin(a) + ty * Math.cos(a);
  const jitter = rm || !s.talking ? 0 : Math.sin(t * 23) * 0.18;
  const wx = nibX + lx - rx * hk;
  const wy = nibY + ly + jitter - ry * hk;
  spot(ctx, wx - 16, wy - 4, 22, 11, -0.5, '20,12,6', 0.3 * Math.min(1, power));
  drawGlovedHand(ctx, 'pen', wx, wy, hk, lookId, { angle: a, sleeve: 0 });
  ctx.restore();
  // The lamp (VELA's, to the right): its pool of light on the desk and the darkness around it.
  const warm = kelvin(K);
  ctx.save();
  // Darkness only over what is drawn (source-atop): the box stays transparent around the desk.
  ctx.globalCompositeOperation = 'source-atop';
  const dark = ctx.createRadialGradient(70, 44, 8, 60, 52, 74);
  dark.addColorStop(0, 'rgba(6,5,8,0)');
  dark.addColorStop(1, `rgba(6,5,8,${Math.max(0.2, 0.8 - 0.45 * power)})`);
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, 100, 100);
  ctx.globalCompositeOperation = 'screen';
  const pool = ctx.createRadialGradient(76, 40, 2, 70, 46, 60);
  pool.addColorStop(0, `rgba(${warm[0]},${warm[1]},${warm[2]},${0.3 * power})`);
  pool.addColorStop(1, `rgba(${warm[0]},${warm[1]},${warm[2]},0)`);
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, 100, 100);
  ctx.restore();
}
