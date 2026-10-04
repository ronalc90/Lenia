/**
 * VELA, redrawn (docs/ARTE.md §6.1). A round-bottom flask of clear glass holding glowing "bioluma"
 * liquid, a cork, and on the cork a little wax candle whose WARM flame is her mood: the one warm
 * light of Estación Vigilia against the cold blue life of the dish.
 *
 * Canvas 2D in a 100×100 unit box (same contract as src/ui/story/portraits.ts drawVela). No images,
 * no shadowBlur in the hot path (glows are radial gradients), deterministic for a given time `t`.
 * Moods: neutral · happy · worried · awed · sleepy · proud. Reduce motion freezes idle motion
 * (bob, slosh, bubbles, flicker) but keeps expressions and a subtle talking mouth.
 */

export type ArtMood = 'neutral' | 'happy' | 'worried' | 'awed' | 'sleepy' | 'proud';
export const ART_MOODS: readonly ArtMood[] = ['neutral', 'happy', 'worried', 'awed', 'sleepy', 'proud'];

/** What VELA needs to know to draw one frame (a subset of PortraitState). */
export interface VelaPose {
  mood: ArtMood;
  /** Seconds since the mood changed (squash & stretch pop). */
  moodAge: number;
  /** 0..1 mouth openness while talking. */
  talk: number;
  talking: boolean;
  /** 0..1, 1 = eyes closed. */
  blink: number;
  reduceMotion: boolean;
  /** Accessories: 'scarf' | 'medal' | 'flower'. */
  wear?: readonly string[];
}

const TAU = Math.PI * 2;

/** Smooth pseudo-noise in [-1, 1] (sum of incommensurate sines; deterministic). */
export function wobble(t: number, seed = 0): number {
  return Math.sin(t * 1.7 + seed) * 0.55 + Math.sin(t * 3.13 + seed * 2.3) * 0.3 + Math.sin(t * 7.31 + seed * 5.1) * 0.15;
}

/** Soft radial glow (gradient, no shadowBlur). */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a: number): void {
  if (a <= 0 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(0.45, `rgba(${rgb},${a * 0.38})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** A four-point twinkle (the Spark's shape) — used for glints and awe sparkles. */
export function twinkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  if (alpha <= 0.01) return;
  const c = r * 0.22;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + c, y - c, x + r, y);
  ctx.quadraticCurveTo(x + c, y + c, x, y + r);
  ctx.quadraticCurveTo(x - c, y + c, x - r, y);
  ctx.quadraticCurveTo(x - c, y - c, x, y - r);
  ctx.fill();
  ctx.restore();
}

/**
 * Fade the outer `w` units of the 100-box to transparent so glows never end in a hard canvas edge
 * (the portrait sits on any panel colour).
 */
export function featherEdges(ctx: CanvasRenderingContext2D, w = 5): void {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  const side = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, rw, rh);
  };
  side(0, 0, 0, w, 0, 0, 100, w);
  side(0, 100, 0, 100 - w, 0, 100 - w, 100, w);
  side(0, 0, w, 0, 0, 0, w, 100);
  side(100, 0, 100 - w, 0, 100 - w, 0, w, 100);
  ctx.restore();
}

// ───────────────────────────── geometry (100-unit box) ─────────────────────────────

const CX = 50;
const CY = 68; // centre of the round bottom
const R = 26; // radius of the round bottom (big head = friendlier)
const NECK_L = 43;
const NECK_R = 57;
const NECK_TOP = 36.5;
const LIP_Y = 32.75; // top of the rolled lip
const CORK_TOP = 26;
const CANDLE_TOP = 19.5;
const WICK_TOP = 17;
/** Liquid surface at rest: the face sits ON the glowing liquid so its ink reads at any size. */
const LEVEL = CY - 16;

const JOIN_Y = CY - Math.sqrt(R * R - (CX - NECK_L) * (CX - NECK_L));
const A_L = Math.atan2(JOIN_Y - CY, NECK_L - CX);
const A_R = Math.atan2(JOIN_Y - CY, NECK_R - CX);

function flaskPath(ctx: CanvasRenderingContext2D, inset = 0): void {
  ctx.beginPath();
  ctx.moveTo(NECK_L + inset, NECK_TOP);
  ctx.lineTo(NECK_L + inset, JOIN_Y + inset * 0.4);
  ctx.arc(CX, CY, R - inset, A_L, A_R, true);
  ctx.lineTo(NECK_R - inset, NECK_TOP);
  ctx.closePath();
}

/** Flame size and character per mood. */
const FLAME: Record<ArtMood, { h: number; w: number; bright: number; speed: number; lean: number }> = {
  neutral: { h: 11, w: 4.1, bright: 1, speed: 1, lean: 0 },
  happy: { h: 13, w: 4.5, bright: 1.15, speed: 1.15, lean: 0 },
  worried: { h: 7.5, w: 3.5, bright: 0.8, speed: 2.1, lean: 0.9 },
  awed: { h: 14.5, w: 4.6, bright: 1.25, speed: 0.9, lean: 0 },
  sleepy: { h: 6.5, w: 3.6, bright: 0.62, speed: 0.45, lean: -0.4 },
  proud: { h: 13.5, w: 4.3, bright: 1.15, speed: 0.6, lean: 0 },
};

/** Candle flame: warm outer body, yellow heart, white core and the blue base of a real candle. */
export function drawCandleFlame(ctx: CanvasRenderingContext2D, x: number, y: number, mood: ArtMood, t: number, rm: boolean, talk = 0): void {
  const f = FLAME[mood];
  const sp = f.speed;
  const flick = rm ? 0 : wobble(t * 3.4 * sp, 1.3);
  const h = f.h * (1 + flick * 0.09 + talk * 0.08);
  const w = f.w * (1 + (rm ? 0 : wobble(t * 2.7 * sp, 4.1)) * 0.05);
  const sway = (rm ? 0 : Math.sin(t * 2.2 * sp) * 0.9 + wobble(t * 1.3, 7) * 0.5) + f.lean * 1.6;
  const b = f.bright;
  // Halo: the candle lights the room (warm), wide and soft.
  glow(ctx, x + sway * 0.4, y - h * 0.3, h * 2.6, '255,176,92', 0.22 * b);
  glow(ctx, x + sway * 0.5, y - h * 0.5, h * 1.5, '255,214,140', 0.32 * b);
  const shape = (k: number, dy = 0) => {
    const tipX = x + sway * k;
    const tipY = y - h * k + dy;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.bezierCurveTo(x + w * k * 0.9 + sway * 0.25 * k, y - h * 0.42 * k, x + w * k, y + w * 0.55 * k, x, y + w * 0.82 * k);
    ctx.bezierCurveTo(x - w * k, y + w * 0.55 * k, x - w * k * 0.9 + sway * 0.25 * k, y - h * 0.42 * k, tipX, tipY);
    ctx.closePath();
  };
  // Outer flame: orange → transparent tip.
  let g = ctx.createLinearGradient(x, y - h, x, y + w);
  g.addColorStop(0, 'rgba(255,120,40,0)');
  g.addColorStop(0.25, `rgba(255,146,58,${0.75 * Math.min(1, b)})`);
  g.addColorStop(0.75, 'rgba(255,170,70,0.95)');
  g.addColorStop(1, 'rgba(255,120,60,0.5)');
  ctx.fillStyle = g;
  shape(1);
  ctx.fill();
  // Heart: warm yellow.
  g = ctx.createLinearGradient(x, y - h * 0.8, x, y + w * 0.5);
  g.addColorStop(0, 'rgba(255,224,138,0)');
  g.addColorStop(0.35, 'rgba(255,224,138,0.95)');
  g.addColorStop(1, 'rgba(255,236,170,1)');
  ctx.fillStyle = g;
  shape(0.72, h * 0.05);
  ctx.fill();
  // Core: almost white.
  ctx.fillStyle = 'rgba(255,250,236,0.95)';
  shape(0.4, h * 0.12);
  ctx.fill();
  // Blue base where the flame meets the wick.
  const bg = ctx.createRadialGradient(x, y + w * 0.45, 0, x, y + w * 0.45, w * 0.9);
  bg.addColorStop(0, 'rgba(90,150,255,0.85)');
  bg.addColorStop(1, 'rgba(90,150,255,0)');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.ellipse(x, y + w * 0.45, w * 0.75, w * 0.45, 0, 0, TAU);
  ctx.fill();
}

// ───────────────────────────── face ─────────────────────────────

const INK = '#13204a';
const EYE_WHITE = '#f6fbff';

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, mood: ArtMood, blink: number, side: -1 | 1, t: number, look: { x: number; y: number }): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (mood === 'happy') {
    // Closed, smiling eyes: ^ ^
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x - 4.1, y + 1.5);
    ctx.quadraticCurveTo(x, y - 4.4, x + 4.1, y + 1.5);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (mood === 'sleepy') {
    // Dozing: soft closed lids (︶ ︶) with two tiny lashes each.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 4, y);
    ctx.quadraticCurveTo(x, y + 3.4, x + 4, y);
    ctx.stroke();
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x - 2.2, y + 1.9);
    ctx.lineTo(x - 2.8, y + 3.3);
    ctx.moveTo(x + 2.2, y + 1.9);
    ctx.lineTo(x + 2.8, y + 3.3);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const big = mood === 'awed';
  const rx = big ? 5.1 : mood === 'worried' ? 3.8 : 4.4;
  const ryFull = big ? 6.1 : mood === 'worried' ? 4.6 : 5.3;
  // A lid cut from below gives proud its smug squint.
  const botCut = mood === 'proud' ? 0.42 : 0;
  const open = Math.max(0.06, 1 - blink);
  const ry = ryFull * open;
  if (ry <= 1.2) {
    // Closed (blink): a gentle curve.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(x - rx * 0.9, y);
    ctx.quadraticCurveTo(x, y + 1.7, x + rx * 0.9, y);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const yTop = y - ry;
  const yBot = y + ry - 2 * ry * botCut;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - rx - 2, yTop, rx * 2 + 4, yBot - yTop);
  ctx.clip();
  // White of the eye.
  ctx.fillStyle = EYE_WHITE;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.clip();
  // Iris: a bioluminescent ring around a deep navy pupil.
  const px = x + look.x * rx * 0.28;
  const py = y + look.y * ry * 0.22 + (big ? 0 : 0.5);
  const ir = rx * (big ? 0.78 : 0.72);
  const irY = ryFull * (big ? 0.76 : 0.7);
  const ig = ctx.createRadialGradient(px, py - irY * 0.2, ir * 0.2, px, py, ir * 1.05);
  ig.addColorStop(0, '#1a2b6a');
  ig.addColorStop(0.62, '#2457c8');
  ig.addColorStop(1, '#3fb2e6');
  ctx.fillStyle = ig;
  ctx.beginPath();
  ctx.ellipse(px, py, ir, irY, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(px, py + 0.2, ir * 0.55, irY * 0.58, 0, 0, TAU);
  ctx.fill();
  // Highlights: the big one is the candle (warm white), the small one the dish (cool).
  ctx.fillStyle = '#fffaf0';
  ctx.beginPath();
  ctx.ellipse(px - ir * 0.36, py - irY * 0.4, big ? 1.7 : 1.3, big ? 1.95 : 1.5, -0.4, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(200,240,255,0.95)';
  ctx.beginPath();
  ctx.arc(px + ir * 0.38, py + irY * 0.38, big ? 0.85 : 0.6, 0, TAU);
  ctx.fill();
  if (big) twinkle(ctx, px + ir * 0.1, py - irY * 0.05, 1.1, '#ffffff', 0.9);
  ctx.restore();
  // Outline (inside the lid cut): an ink line makes the eye read at 28 px.
  ctx.strokeStyle = 'rgba(19,32,74,0.7)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
  // Lid lines.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.7;
  const halfAt = (yy: number) => Math.sqrt(Math.max(0, 1 - ((yy - y) / ry) ** 2)) * rx;
  if (botCut > 0) {
    const h = halfAt(yBot);
    ctx.beginPath();
    ctx.moveTo(x - h - 0.5, yBot + 0.5);
    ctx.quadraticCurveTo(x, yBot - 1.2, x + h + 0.5, yBot + 0.5);
    ctx.stroke();
  }
  // Brows: worried tilts up at the inner end; awed lifts both; proud arches the outer one.
  if (mood === 'worried' || mood === 'awed') {
    ctx.strokeStyle = 'rgba(19,32,74,0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (mood === 'worried') {
      const wob = Math.sin(t * 6) * 0.25;
      ctx.moveTo(x + side * 4.4, y - ryFull - 1.2);
      ctx.lineTo(x - side * 2.8, y - ryFull - 3.6 + wob);
    } else if (mood === 'awed') {
      ctx.moveTo(x - 3.4, y - ryFull - 2.4);
      ctx.quadraticCurveTo(x, y - ryFull - 4.4, x + 3.4, y - ryFull - 2.4);
    } else {
      ctx.moveTo(x - side * 3.4, y - ryFull - 1.4);
      ctx.quadraticCurveTo(x + side * 0.6, y - ryFull - 3.6, x + side * 4.2, y - ryFull - 1.2);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function mouth(ctx: CanvasRenderingContext2D, x: number, y: number, mood: ArtMood, talk: number, talking: boolean, t: number): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.7;
  const open = talking ? talk : 0;
  if (open > 0.08) {
    const w = mood === 'happy' || mood === 'proud' ? 4.2 : 3.3;
    const h = 1 + open * (mood === 'awed' ? 3.8 : 3);
    ctx.fillStyle = '#2a1640';
    ctx.beginPath();
    ctx.ellipse(x, y + 0.6, w + open * 0.6, h, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    if (h > 2.4) {
      ctx.fillStyle = '#ff8a8a';
      ctx.beginPath();
      ctx.ellipse(x, y + 0.6 + h * 0.5, w * 0.55, h * 0.36, 0, 0, TAU);
      ctx.fill();
    }
  } else if (mood === 'happy') {
    ctx.fillStyle = '#2a1640';
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 0.8);
    ctx.quadraticCurveTo(x, y + 6.6, x + 5, y - 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff8a8a';
    ctx.beginPath();
    ctx.ellipse(x, y + 2.6, 2.3, 1.1, 0, 0, TAU);
    ctx.fill();
  } else if (mood === 'worried') {
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const px = x - 3.6 + i * 0.9;
      const py = y + 1.2 + Math.sin(i * 1.7 + t * 5) * 0.7;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  } else if (mood === 'awed') {
    ctx.fillStyle = '#2a1640';
    ctx.beginPath();
    ctx.ellipse(x, y + 1.2, 2.3, 3, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  } else if (mood === 'sleepy') {
    // A small relaxed "o" (half a yawn).
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y + 1.2, 1.5, 1.2, 0, 0, TAU);
    ctx.stroke();
  } else if (mood === 'proud') {
    // Lopsided, satisfied smile.
    ctx.beginPath();
    ctx.moveTo(x - 4, y + 0.4);
    ctx.quadraticCurveTo(x + 0.5, y + 3.8, x + 4.6, y - 1.2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(x - 3.4, y);
    ctx.quadraticCurveTo(x, y + 3, x + 3.4, y);
    ctx.stroke();
  }
  ctx.restore();
}

// ───────────────────────────── body parts ─────────────────────────────

function hand(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  glow(ctx, x, y, r * 3, '120,210,255', 0.22);
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, '#cdeffd');
  g.addColorStop(1, '#6cc6ee');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(19,32,74,0.35)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

function cork(ctx: CanvasRenderingContext2D): void {
  const x0 = 44;
  const x1 = 56;
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, '#8a5a32');
  g.addColorStop(0.35, '#d49a62');
  g.addColorStop(0.7, '#c1864f');
  g.addColorStop(1, '#7d5130');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x0 + 0.6, CORK_TOP + 1.2);
  ctx.lineTo(x0 + 1.1, LIP_Y + 1.5);
  ctx.lineTo(x1 - 1.1, LIP_Y + 1.5);
  ctx.lineTo(x1 - 0.6, CORK_TOP + 1.2);
  ctx.closePath();
  ctx.fill();
  // Top face of the cork.
  ctx.fillStyle = '#e2b07a';
  ctx.beginPath();
  ctx.ellipse(50, CORK_TOP + 1.2, 5.4, 1.4, 0, 0, TAU);
  ctx.fill();
  // Pores.
  ctx.fillStyle = 'rgba(90,52,24,0.55)';
  const pores = [
    [46.4, CORK_TOP + 3.6, 0.45],
    [48.9, CORK_TOP + 5.8, 0.35],
    [52.6, CORK_TOP + 3, 0.4],
    [54.1, CORK_TOP + 5.4, 0.3],
    [50.7, CORK_TOP + 4.5, 0.3],
  ];
  for (const [px, py, pr] of pores) {
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, TAU);
    ctx.fill();
  }
}

function candle(ctx: CanvasRenderingContext2D, flameBright: number): void {
  const x0 = 47.4;
  const x1 = 52.6;
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, '#e6cfa3');
  g.addColorStop(0.4, '#fff6e2');
  g.addColorStop(1, '#d9bd8c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x0, CORK_TOP + 1);
  ctx.lineTo(x0, CANDLE_TOP + 0.8);
  ctx.quadraticCurveTo(50, CANDLE_TOP - 0.6, x1, CANDLE_TOP + 0.8);
  ctx.lineTo(x1, CORK_TOP + 1);
  ctx.closePath();
  ctx.fill();
  // A wax drip.
  ctx.fillStyle = '#fff3d9';
  ctx.beginPath();
  ctx.moveTo(x1 - 0.2, CANDLE_TOP + 1);
  ctx.quadraticCurveTo(x1 + 0.9, CANDLE_TOP + 3.2, x1 + 0.2, CANDLE_TOP + 4.6);
  ctx.quadraticCurveTo(x1 - 0.6, CANDLE_TOP + 4.9, x1 - 0.7, CANDLE_TOP + 3.6);
  ctx.closePath();
  ctx.fill();
  // Molten pool lit by the flame.
  glow(ctx, 50, CANDLE_TOP + 0.6, 3.4, '255,214,140', 0.7 * flameBright);
  // Wick.
  ctx.strokeStyle = '#3a2a22';
  ctx.lineWidth = 0.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(50, CANDLE_TOP + 0.4);
  ctx.quadraticCurveTo(50.4, WICK_TOP + 1.2, 50.2, WICK_TOP);
  ctx.stroke();
}

function scarf(ctx: CanvasRenderingContext2D, t: number, rm: boolean): void {
  const flap = rm ? 0 : Math.sin(t * 2.4) * 1.5;
  const knit = (path: () => void, base: string) => {
    ctx.save();
    path();
    ctx.fillStyle = base;
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,214,140,0.9)';
    for (let y = 20; y < 70; y += 4.5) ctx.fillRect(0, y, 100, 1.4);
    ctx.restore();
  };
  knit(() => {
    ctx.beginPath();
    ctx.moveTo(43.5, NECK_TOP + 4);
    ctx.quadraticCurveTo(36, NECK_TOP + 8 + flap * 0.3, 29, NECK_TOP + 15 + flap);
    ctx.lineTo(33.2, NECK_TOP + 17.4 + flap);
    ctx.quadraticCurveTo(38.6, NECK_TOP + 11, 45.2, NECK_TOP + 7);
    ctx.closePath();
  }, '#d9482a');
  knit(() => {
    ctx.beginPath();
    ctx.roundRect(40.6, NECK_TOP + 1, 18.8, 7, 3.4);
  }, '#ef6a3e');
  ctx.strokeStyle = '#ffd68c';
  ctx.lineWidth = 0.8;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(29.6 + i * 1.4, NECK_TOP + 15.6 + flap + i * 0.8);
    ctx.lineTo(28.7 + i * 1.4, NECK_TOP + 18 + flap + i * 0.8);
    ctx.stroke();
  }
}

function medal(ctx: CanvasRenderingContext2D, t: number, rm: boolean): void {
  ctx.save();
  ctx.translate(67, 80);
  ctx.rotate(rm ? 0 : Math.sin(t * 1.9) * 0.07);
  ctx.fillStyle = '#5bc0eb';
  ctx.beginPath();
  ctx.moveTo(-3.6, -8);
  ctx.lineTo(-0.4, -8);
  ctx.lineTo(-1.2, -1.6);
  ctx.lineTo(-3.6, -2.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e4572e';
  ctx.beginPath();
  ctx.moveTo(0.4, -8);
  ctx.lineTo(3.6, -8);
  ctx.lineTo(3.6, -2.2);
  ctx.lineTo(1.2, -1.6);
  ctx.closePath();
  ctx.fill();
  glow(ctx, 0, 2, 7, '255,209,102', 0.35);
  const g = ctx.createRadialGradient(-1.2, 0.8, 0.3, 0, 2, 4.6);
  g.addColorStop(0, '#fff4c8');
  g.addColorStop(0.55, '#ffd166');
  g.addColorStop(1, '#c88a1e');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 2, 4.4, 0, TAU);
  ctx.fill();
  twinkle(ctx, 0, 2, 2.6, 'rgba(140,90,10,0.8)', 1);
  const glint = rm ? 0.5 : Math.max(0, Math.sin(t * 1.3)) ** 8;
  twinkle(ctx, 2.2, -0.4, 1.8, '#ffffff', glint);
  ctx.restore();
}

function flower(ctx: CanvasRenderingContext2D, t: number, rm: boolean): void {
  const x = 42.4;
  const y = CORK_TOP + 1.5;
  const s = rm ? 0 : Math.sin(t * 1.6) * 0.08;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.35 + s);
  ctx.strokeStyle = '#4fb06a';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(1.5, 3, 3.5, 5);
  ctx.stroke();
  glow(ctx, 0, 0, 6, '184,146,255', 0.4);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    ctx.fillStyle = '#d8c2ff';
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * 1.9, Math.sin(a) * 1.9, 1.7, 1.05, a, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Little "z" letters drifting up (sleepy). */
function zzz(ctx: CanvasRenderingContext2D, t: number, rm: boolean): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(201,209,255,0.9)';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < 3; i++) {
    const ph = rm ? 0.25 + i * 0.3 : (t * 0.28 + i / 3) % 1;
    const s = 1.6 + ph * 1.8;
    const x = 70 + ph * 10 + Math.sin(ph * 6 + i) * 1.2;
    const y = 48 - ph * 26;
    ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.95;
    ctx.lineWidth = 0.9 + ph * 0.4;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s);
    ctx.lineTo(x + s, y - s);
    ctx.lineTo(x - s, y + s);
    ctx.lineTo(x + s, y + s);
    ctx.stroke();
  }
  ctx.restore();
}

// ───────────────────────────── VELA ─────────────────────────────

/**
 * Draw VELA into the 100×100 box. `opts.mini` drops hands, bubbles and mood props and thickens
 * the outline (for 24–40 px avatars).
 */
export function drawVelaArt(ctx: CanvasRenderingContext2D, s: VelaPose, t: number, opts: { mini?: boolean } = {}): void {
  const rm = s.reduceMotion;
  const mini = !!opts.mini;
  const mood = s.mood;
  const speed = mood === 'sleepy' ? 0.55 : mood === 'worried' ? 1.4 : 1;
  const hover = rm ? 0 : Math.sin(t * 1.55 * speed) * (mood === 'sleepy' ? 1 : 1.8);
  const breathe = rm ? 0 : Math.sin(t * 1.55 * speed + 0.6) * 0.012;
  const pop = rm ? 0 : Math.exp(-s.moodAge * 8) * Math.sin(s.moodAge * 26) * 0.07;
  const shake = mood === 'worried' && !rm ? Math.sin(t * 21) * 0.28 : 0;
  const baseTilt = mood === 'proud' ? -0.07 : mood === 'sleepy' ? 0.06 : 0;
  const tilt = baseTilt + (rm ? 0 : Math.sin(t * 0.8 * speed) * 0.03);
  const flame = FLAME[mood];

  ctx.save();
  if (mini) {
    // Avatar: 12 % closer so the face carries at 24–56 px (the flame tip still fits the box).
    ctx.translate(50, 60);
    ctx.scale(1.12, 1.12);
    ctx.translate(-50, -60);
  }
  // Room light: warm from the candle above, cool from the liquid below.
  glow(ctx, 50, 32, 44, '255,170,90', 0.14 * flame.bright);
  glow(ctx, 50, 72, 38, '70,150,255', 0.12);

  // Floor shadow and the caustic the liquid throws on the table.
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(50, 96.5, 17 - hover * 0.6, 2.4, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(91,192,235,${0.32 - hover * 0.03})`;
  ctx.beginPath();
  ctx.ellipse(50, 96.4, 9.5 - hover * 0.4, 1.3, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(50 + shake, 69 + hover);
  ctx.rotate(tilt);
  ctx.scale(1 + breathe - pop, 1 + breathe + pop);
  ctx.translate(-50, -69);

  // 1. Glass: faint tint, brighter towards the rim (fresnel).
  const glass = ctx.createRadialGradient(CX - 6, CY - 8, 4, CX, CY, R + 2);
  glass.addColorStop(0, 'rgba(160,215,255,0.07)');
  glass.addColorStop(0.75, 'rgba(160,215,255,0.11)');
  glass.addColorStop(1, 'rgba(190,232,255,0.3)');
  ctx.fillStyle = glass;
  flaskPath(ctx);
  ctx.fill();

  // 2. Liquid (bioluma), sloshing with the hover.
  ctx.save();
  flaskPath(ctx, 1.4);
  ctx.clip();
  const level = LEVEL + (rm ? 0 : Math.sin(t * 1.55 * speed - 0.9) * 0.9);
  const slosh = rm ? 0 : Math.sin(t * 0.8 * speed - 0.5) * 0.06 - tilt * 0.8;
  const surf = (x: number) => level + (rm ? 0 : Math.sin(x * 0.21 + t * 2.4) * 0.7) + (x - CX) * slosh;
  const liq = ctx.createLinearGradient(0, level - 2, 0, CY + R);
  liq.addColorStop(0, '#b4f6ff');
  liq.addColorStop(0.2, '#6ad8f6');
  liq.addColorStop(0.58, '#3a8aec');
  liq.addColorStop(1, '#3b28a2');
  ctx.fillStyle = liq;
  ctx.beginPath();
  ctx.moveTo(CX - R - 2, surf(CX - R - 2));
  for (let x = CX - R; x <= CX + R + 2; x += 2) ctx.lineTo(x, surf(x));
  ctx.lineTo(CX + R + 2, CY + R + 1);
  ctx.lineTo(CX - R - 2, CY + R + 1);
  ctx.closePath();
  ctx.fill();
  // Inner light of the liquid (brightest behind the face).
  glow(ctx, CX - 2, level + 10, 20, '200,248,255', 0.4);
  // Meniscus.
  ctx.strokeStyle = 'rgba(235,252,255,0.85)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = CX - R; x <= CX + R; x += 2) {
    if (x === CX - R) ctx.moveTo(x, surf(x));
    else ctx.lineTo(x, surf(x));
  }
  ctx.stroke();
  if (!mini) {
    // Bubbles and two tiny glowing "creatures" (rings) drifting in the liquid.
    ctx.strokeStyle = 'rgba(230,250,255,0.75)';
    ctx.lineWidth = 0.55;
    // Bubbles rise along the sides, never across the face.
    const lanes = [-17, -12.5, 12.5, 17, -20.5];
    for (let i = 0; i < lanes.length; i++) {
      const ph = rm ? 0.25 + i * 0.14 : (t * (0.2 + i * 0.045) + i * 0.37) % 1;
      const bx = CX + lanes[i] + (rm ? 0 : Math.sin(t * 2 + i) * 1.1);
      const by = CY + R - 4 - ph * (CY + R - level - 4);
      ctx.globalAlpha = 0.7 * (1 - ph * 0.6);
      ctx.beginPath();
      ctx.arc(bx, by, 0.8 + (i % 3) * 0.4, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 2; i++) {
      const mx = CX - 9 + i * 17 + (rm ? 0 : Math.sin(t * 0.7 + i * 2) * 3);
      const my = CY + 15 + i * 2 + (rm ? 0 : Math.cos(t * 0.9 + i) * 1.5);
      glow(ctx, mx, my, 4.5, '210,252,255', 0.6);
      ctx.fillStyle = 'rgba(245,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(mx, my, 0.8, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();

  // 3. Glass outline: frost-bright where the candle lights it, dimmer below.
  const rim = ctx.createLinearGradient(0, NECK_TOP, 0, CY + R);
  rim.addColorStop(0, 'rgba(255,236,206,0.95)');
  rim.addColorStop(0.35, 'rgba(205,240,255,0.92)');
  rim.addColorStop(1, 'rgba(120,200,240,0.75)');
  ctx.strokeStyle = rim;
  ctx.lineWidth = mini ? 2.6 : 1.7;
  flaskPath(ctx);
  ctx.stroke();
  // Inner glass wall (thickness).
  ctx.strokeStyle = 'rgba(200,240,255,0.22)';
  ctx.lineWidth = 0.7;
  flaskPath(ctx, 1.6);
  ctx.stroke();
  // Specular streak (left), small glint, and the candle reflected (warm) on the right shoulder.
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(CX, CY, R - 4.2, Math.PI * 1.06, Math.PI * 1.3);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(CX, CY, R - 4.2, Math.PI * 0.84, Math.PI * 1.0);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(CX - 15.6, CY - 3.4, 1.1, 0, TAU);
  ctx.fill();
  glow(ctx, CX + R * 0.5, CY - R * 0.66, 3.6, '255,214,150', 0.8 * flame.bright);
  // Neck highlight.
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(NECK_L + 2.1, NECK_TOP + 1.5);
  ctx.lineTo(NECK_L + 2.1, JOIN_Y + 1);
  ctx.stroke();
  ctx.restore();

  // 4. Lip, cork, candle.
  cork(ctx);
  const lip = ctx.createLinearGradient(0, LIP_Y, 0, NECK_TOP);
  lip.addColorStop(0, 'rgba(255,240,215,0.95)');
  lip.addColorStop(1, 'rgba(160,215,245,0.85)');
  ctx.fillStyle = 'rgba(170,220,250,0.22)';
  ctx.strokeStyle = lip;
  ctx.lineWidth = mini ? 2.2 : 1.4;
  ctx.beginPath();
  ctx.roundRect(NECK_L - 2.2, LIP_Y, NECK_R - NECK_L + 4.4, NECK_TOP - LIP_Y + 0.4, 2);
  ctx.fill();
  ctx.stroke();
  candle(ctx, flame.bright);

  // 5. Accessories.
  const wear = s.wear ?? [];
  if (wear.includes('scarf')) scarf(ctx, t, rm);
  if (wear.includes('medal') && !mini) medal(ctx, t, rm);
  if (wear.includes('flower')) flower(ctx, t, rm);

  // 6. Face (eyes look slightly towards whatever she is pointing at).
  const look =
    mood === 'worried' ? { x: -0.4, y: 0.6 } : mood === 'awed' ? { x: 0, y: -0.5 } : mood === 'sleepy' ? { x: 0, y: 0.8 } : { x: rm ? 0 : Math.sin(t * 0.37) * 0.35, y: 0 };
  const eyeY = 63;
  const k = mini ? 1.18 : 1;
  ctx.save();
  if (mini) {
    // Bolder face for 24–56 px avatars.
    ctx.translate(50, 66);
    ctx.scale(k, k);
    ctx.translate(-50, -66);
  }
  eye(ctx, 40.5, eyeY, mood, s.blink, -1, t, look);
  eye(ctx, 59.5, eyeY, mood, s.blink, 1, t, look);
  if (mood !== 'worried' && mood !== 'sleepy') {
    const a = mood === 'happy' || mood === 'awed' || mood === 'proud' ? 0.55 : 0.32;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#ff8fb8';
    ctx.beginPath();
    ctx.ellipse(32.6, 70, 3.4, 2, 0, 0, TAU);
    ctx.ellipse(67.4, 70, 3.4, 2, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  mouth(ctx, 50, 71, mood, s.talk, s.talking, t);
  ctx.restore();
  if (mood === 'worried' && !mini) {
    const dy = rm ? 0 : ((t * 0.6) % 1) * 3;
    ctx.fillStyle = 'rgba(200,242,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(70.5, 52 + dy);
    ctx.quadraticCurveTo(73.2, 56.6 + dy, 70.5, 57.6 + dy);
    ctx.quadraticCurveTo(67.8, 56.6 + dy, 70.5, 52 + dy);
    ctx.fill();
  }
  ctx.restore();

  // 7. Flame (outside the body transform so it trails the hover a little).
  drawCandleFlame(ctx, 50.2 + shake, WICK_TOP + 0.2 + hover * 0.9, mood, t, rm, s.talk);

  ctx.restore();
  if (mini) return;

  // 8. Hands, by mood.
  const bob = (k: number) => (rm ? 0 : Math.sin(t * 2 * speed + k) * 1.5);
  let l: [number, number] = [18.5, 76 + bob(0) + hover];
  let r: [number, number] = [81.5, 76 + bob(1.4) + hover];
  if (mood === 'happy') {
    l = [19, 78 + bob(0) + hover];
    r = [85 + (rm ? 0 : Math.sin(t * 9) * 3), 52 + hover];
  } else if (mood === 'awed') {
    l = [24, 58 + bob(0) * 0.4 + hover];
    r = [76, 58 + bob(1) * 0.4 + hover];
  } else if (mood === 'worried') {
    l = [42 + (rm ? 0 : Math.sin(t * 7) * 0.7), 95];
    r = [58 - (rm ? 0 : Math.sin(t * 7) * 0.7), 95];
  } else if (mood === 'sleepy') {
    l = [20, 83 + hover];
    r = [70, 58.5 + hover + (rm ? 0 : Math.sin(t * 1.2) * 0.8)]; // rubbing an eye
  } else if (mood === 'proud') {
    l = [22.5, 73 + hover]; // hands on hips
    r = [77.5, 73 + hover];
  }
  hand(ctx, l[0], l[1], 3.4);
  hand(ctx, r[0], r[1], 3.4);

  // 9. Mood props.
  if (mood === 'awed') {
    for (let i = 0; i < 4; i++) {
      const ph = rm ? 0.55 : (t * 0.8 + i * 0.25) % 1;
      const a = Math.sin(ph * Math.PI);
      const ang = -2.5 + i * 0.75;
      twinkle(ctx, 50 + Math.cos(ang) * 38, 52 + Math.sin(ang) * 34, 2 + a * 1.6, '#fff4d6', a);
    }
  } else if (mood === 'sleepy') {
    zzz(ctx, t, rm);
  } else if (mood === 'proud') {
    const g = rm ? 0.8 : 0.5 + 0.5 * Math.max(0, Math.sin(t * 2.2));
    twinkle(ctx, 76, 38, 3, '#ffd166', g);
    twinkle(ctx, 24, 44, 2, '#fff4d6', 1 - g * 0.6);
  } else if (mood === 'happy') {
    const g = rm ? 0.6 : Math.max(0, Math.sin(t * 3.1)) ** 3;
    twinkle(ctx, 27, 40, 2.2, '#fff4d6', g);
  }
}
