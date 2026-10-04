/**
 * Animated character portraits, drawn procedurally on canvas (no images).
 *
 *  VELA      a little round-bottom flask robot with a candle flame on its cork
 *            ("vela" = candle). Hovers, breathes, blinks, sloshes; four moods;
 *            the mouth moves while text types; floating hands gesture.
 *  ALBOR     an amber photo on a cassette tape (a recording); reels spin while
 *            she talks. Live mode (epilogue): no tape, dawn light behind her.
 *  COMMITTEE a telex machine printing a paper strip, red light blinking.
 *  CHOIR     a microscope lens with a REAL live Orbium (LeniaLens); each dot it
 *            "says" sends a ring out of the creature.
 *  YOU       the journal: a page with a glowing pen writing lines.
 *
 * All drawers work in a 100×100 unit box. Reduce motion freezes idle motion
 * (no hover/slosh/spin) but keeps expressions and the talking mouth subtle.
 */
import type { Mood, Speaker } from '../../story/types';
import { LeniaLens } from './lens';

export interface PortraitState {
  speaker: Speaker;
  mood: Mood;
  /** Seconds since the mood changed (for a little squash pop). */
  moodAge: number;
  /** 0..1 mouth openness (smoothed by the caller). */
  talk: number;
  /** True while text is typing. */
  talking: boolean;
  /** 0..1, 1 = eyes closed. */
  blink: number;
  live: boolean;
  /** Ages (s) of the Choir's rings. */
  pulses: number[];
  reduceMotion: boolean;
  /** (VELA) accessories to draw; defaults to the global wardrobe (setVelaWear). */
  wear?: readonly string[];
}

/** VELA's wardrobe, unlocked by Encargos ('scarf' | 'medal' | 'flower'). Shared by every VELA portrait. */
let velaWear: readonly string[] = [];
export function setVelaWear(list: readonly string[]): void {
  velaWear = [...list];
}
export function getVelaWear(): readonly string[] {
  return velaWear;
}

const TAU = Math.PI * 2;
const CYAN = '#5BC0EB';

/** Cheap smooth noise in [-1, 1]. */
function wobble(t: number, seed = 0): number {
  return Math.sin(t * 1.7 + seed) * 0.6 + Math.sin(t * 3.1 + seed * 2.3) * 0.3 + Math.sin(t * 7.3 + seed * 5.1) * 0.1;
}

function glowDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = '#9EF0FF';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
  ctx.restore();
}


// ═══════════════════════════════ VELA's wardrobe ═══════════════════════════════

/** A knitted scarf around the flask's neck, two striped tails fluttering on the left. */
function drawScarf(ctx: CanvasRenderingContext2D, t: number, rm: boolean): void {
  const flap = rm ? 0 : Math.sin(t * 2.6) * 1.6;
  const knit = (path: () => void, base: string) => {
    ctx.save();
    path();
    ctx.fillStyle = base;
    ctx.fill();
    ctx.clip();
    // Stripes.
    ctx.fillStyle = 'rgba(255, 209, 102, 0.85)';
    for (let y = 20; y < 70; y += 5) ctx.fillRect(0, y, 100, 1.6);
    ctx.restore();
    ctx.save();
    path();
    ctx.strokeStyle = 'rgba(80, 20, 10, 0.55)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.restore();
  };
  // Tails first (behind the wrap).
  knit(() => {
    ctx.beginPath();
    ctx.moveTo(43.5, 38.5);
    ctx.quadraticCurveTo(36, 42 + flap * 0.3, 29.5, 49 + flap);
    ctx.lineTo(33.5, 51.5 + flap);
    ctx.quadraticCurveTo(38, 45, 45, 41.5);
    ctx.closePath();
  }, '#E4572E');
  knit(() => {
    ctx.beginPath();
    ctx.moveTo(44.5, 40);
    ctx.quadraticCurveTo(40, 46 - flap * 0.2, 37.5, 54 - flap * 0.6);
    ctx.lineTo(41.2, 55 - flap * 0.6);
    ctx.quadraticCurveTo(42.5, 47, 46.5, 41.5);
    ctx.closePath();
  }, '#D9482A');
  // Fringe.
  ctx.save();
  ctx.strokeStyle = '#FFD166';
  ctx.lineWidth = 0.8;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(30 + i * 1.4, 49.5 + flap + i * 0.9);
    ctx.lineTo(29 + i * 1.4, 52 + flap + i * 0.9);
    ctx.moveTo(38 + i * 1.3, 54.5 - flap * 0.6 + i * 0.3);
    ctx.lineTo(37.6 + i * 1.3, 57 - flap * 0.6 + i * 0.3);
    ctx.stroke();
  }
  ctx.restore();
  // The wrap around the neck.
  knit(() => {
    ctx.beginPath();
    ctx.roundRect(40.5, 35.5, 19, 7, 3.4);
  }, '#F06A3E');
}

/** The Committee's medal, pinned on the glass. */
function drawMedal(ctx: CanvasRenderingContext2D, t: number, rm: boolean): void {
  const sway = rm ? 0 : Math.sin(t * 1.9) * 0.08;
  ctx.save();
  ctx.translate(65.5, 70);
  ctx.rotate(sway);
  // Ribbon.
  ctx.fillStyle = '#5BC0EB';
  ctx.beginPath();
  ctx.moveTo(-3.6, -8);
  ctx.lineTo(-0.4, -8);
  ctx.lineTo(-1.2, -1.5);
  ctx.lineTo(-3.6, -2.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#E4572E';
  ctx.beginPath();
  ctx.moveTo(0.4, -8);
  ctx.lineTo(3.6, -8);
  ctx.lineTo(3.6, -2.2);
  ctx.lineTo(1.2, -1.5);
  ctx.closePath();
  ctx.fill();
  // Disc.
  ctx.shadowColor = '#FFD166';
  ctx.shadowBlur = 6;
  const g = ctx.createRadialGradient(-1.2, 0.8, 0.3, 0, 2, 4.6);
  g.addColorStop(0, '#FFF4C8');
  g.addColorStop(0.55, '#FFD166');
  g.addColorStop(1, '#C88A1E');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 2, 4.4, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  // Star.
  ctx.fillStyle = 'rgba(140, 90, 10, 0.75)';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 1.1 : 2.6;
    const x = Math.cos(a) * r;
    const y = 2 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  // Glint.
  const glint = rm ? 0.5 : Math.max(0, Math.sin(t * 1.3)) ** 8;
  if (glint > 0.05) sparkle(ctx, 2.2, -0.4, 1.8, glint);
  ctx.restore();
}

/** A glowing flower tucked into the cork. */
function drawFlower(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, rm: boolean): void {
  const nod = rm ? 0 : Math.sin(t * 1.4) * 0.12;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.5 + nod);
  ctx.strokeStyle = '#8AE234';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(0, 7);
  ctx.quadraticCurveTo(1.5, 3, 0, 0);
  ctx.stroke();
  ctx.fillStyle = '#8AE234';
  ctx.beginPath();
  ctx.ellipse(1.8, 4.2, 1.9, 0.9, -0.6, 0, TAU);
  ctx.fill();
  glowDisc(ctx, 0, 0, 7, 'rgba(255,143,171,0.9)', 0.45);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    ctx.fillStyle = i % 2 ? '#FFB3C7' : '#FF8FAB';
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * 2.3, Math.sin(a) * 2.3, 2.1, 1.3, a, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#FFE9A8';
  ctx.beginPath();
  ctx.arc(0, 0, 1.2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ═══════════════════════════════ VELA ═══════════════════════════════

const FLAME_SCALE: Record<Mood, number> = { neutral: 1, happy: 1.2, worried: 0.72, awed: 1.5 };

function drawFlame(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, w: number, t: number, rm: boolean): void {
  const flick = rm ? 0 : wobble(t * 3.2, 1.3);
  const hh = h * (1 + flick * 0.08);
  const sway = rm ? 0 : Math.sin(t * 2.3) * 0.7;
  glowDisc(ctx, x, y - hh * 0.35, h * 1.5, 'rgba(91,192,235,0.9)', 0.35);
  const tip = x + sway;
  const path = (k: number) => {
    ctx.beginPath();
    ctx.moveTo(tip, y - hh * k);
    ctx.bezierCurveTo(x + w * k, y - hh * 0.35 * k, x + w * 0.95 * k, y + w * 0.7 * k, x, y + w * 0.75 * k);
    ctx.bezierCurveTo(x - w * 0.95 * k, y + w * 0.7 * k, x - w * k, y - hh * 0.35 * k, tip, y - hh * k);
  };
  const g = ctx.createLinearGradient(x, y - hh, x, y + w);
  g.addColorStop(0, 'rgba(91,192,235,0.15)');
  g.addColorStop(0.45, 'rgba(120,220,255,0.95)');
  g.addColorStop(1, 'rgba(70,90,230,0.9)');
  ctx.save();
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 8;
  ctx.fillStyle = g;
  path(1);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  path(0.48);
  ctx.fill();
}

function drawEye(ctx: CanvasRenderingContext2D, x: number, y: number, mood: Mood, blink: number, side: -1 | 1, t: number): void {
  ctx.save();
  ctx.shadowColor = '#9EF0FF';
  ctx.shadowBlur = 5;
  ctx.fillStyle = '#F4FDFF';
  ctx.strokeStyle = '#F4FDFF';
  if (mood === 'happy' && blink < 0.5) {
    // ^ ^
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 3.8, y + 1.2);
    ctx.quadraticCurveTo(x, y - 4.6, x + 3.8, y + 1.2);
    ctx.stroke();
  } else {
    const big = mood === 'awed';
    const rx = big ? 4.3 : mood === 'worried' ? 2.9 : 3.3;
    const ry = (big ? 5.4 : mood === 'worried' ? 3.9 : 4.6) * Math.max(0.08, 1 - blink);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (ry > 1.5) {
      // Pupil + shine: a dark pupil gives the gaze; shines make it alive.
      ctx.fillStyle = '#1A1F55';
      const px = x + side * 0.4;
      ctx.beginPath();
      ctx.ellipse(px, y + 0.6, rx * 0.55, ry * 0.58, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(px - rx * 0.28, y - ry * 0.22, big ? 1.35 : 1.0, 0, TAU);
      ctx.fill();
      if (big) {
        ctx.beginPath();
        ctx.arc(px + rx * 0.25, y + ry * 0.3, 0.6, 0, TAU);
        ctx.fill();
      }
    }
  }
  if (mood === 'worried') {
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(220,240,255,0.9)';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    // Inner end higher: a little "oh no" brow.
    ctx.moveTo(x - side * 3.8, y - 6.4);
    ctx.lineTo(x + side * 2.6, y - 8.6 + Math.sin(t * 6) * 0.2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMouth(ctx: CanvasRenderingContext2D, x: number, y: number, mood: Mood, talk: number, talking: boolean, t: number): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#F4FDFF';
  ctx.lineWidth = 1.6;
  ctx.shadowColor = '#9EF0FF';
  ctx.shadowBlur = 3;
  if (talking && talk > 0.08) {
    const w = mood === 'happy' ? 3.8 : 3.0;
    const h = 0.9 + talk * (mood === 'awed' ? 3.6 : 2.8);
    ctx.fillStyle = '#16113F';
    ctx.beginPath();
    ctx.ellipse(x, y + 0.6, w + talk * 0.6, h, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // A tiny tongue when wide open: cute.
    if (h > 2.6) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#FF8FAB';
      ctx.beginPath();
      ctx.ellipse(x, y + 0.6 + h * 0.55, w * 0.5, h * 0.3, 0, 0, TAU);
      ctx.fill();
    }
  } else if (mood === 'happy') {
    ctx.fillStyle = '#16113F';
    ctx.beginPath();
    ctx.moveTo(x - 4.6, y - 0.6);
    ctx.quadraticCurveTo(x, y + 6.2, x + 4.6, y - 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (mood === 'worried') {
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const px = x - 4 + i;
      const py = y + 1 + Math.sin(i * 1.6 + t * 4) * 0.8;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  } else if (mood === 'awed') {
    ctx.fillStyle = '#16113F';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, 2.2, 2.8, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(x - 3.2, y);
    ctx.quadraticCurveTo(x, y + 2.8, x + 3.2, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHand(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  glowDisc(ctx, x, y, r * 2.6, 'rgba(91,192,235,0.9)', 0.35);
  ctx.save();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(0.55, '#BDEFFF');
  g.addColorStop(1, '#5BC0EB');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawVela(ctx: CanvasRenderingContext2D, s: PortraitState, t: number, opts: { mini?: boolean } = {}): void {
  const rm = s.reduceMotion;
  const hover = rm ? 0 : Math.sin(t * 1.7) * 1.8;
  const breathe = rm ? 0 : Math.sin(t * 1.7 + 0.6) * 0.012;
  // Mood change: a quick squash & stretch pop.
  const pop = rm ? 0 : Math.exp(-s.moodAge * 9) * Math.sin(s.moodAge * 28) * 0.06;
  const worriedShake = s.mood === 'worried' && !rm ? Math.sin(t * 23) * 0.25 : 0;

  // Backdrop glow.
  glowDisc(ctx, 50, 60, 48, 'rgba(64,72,210,0.9)', 0.22);
  glowDisc(ctx, 50, 56, 38, 'rgba(91,192,235,0.9)', 0.16);

  // Floor shadow (shrinks as she floats up).
  ctx.save();
  ctx.globalAlpha = 0.22 - hover * 0.02;
  ctx.fillStyle = CYAN;
  ctx.beginPath();
  ctx.ellipse(50, 95, 15 - hover * 0.6, 2.4, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(50 + worriedShake, 62 + hover);
  ctx.rotate(rm ? 0 : Math.sin(t * 0.9) * 0.035);
  ctx.scale(1 + breathe - pop, 1 + breathe + pop);
  ctx.translate(-50, -62);

  const cx = 50;
  const cy = 64;
  const R = 23.5;
  const neckL = 43;
  const neckR = 57;
  const neckTop = 31;
  const joinY = cy - Math.sqrt(R * R - 49);
  const aL = Math.atan2(joinY - cy, neckL - cx);
  const aR = Math.atan2(joinY - cy, neckR - cx);
  const flask = () => {
    ctx.beginPath();
    ctx.moveTo(neckL, neckTop);
    ctx.lineTo(neckL, joinY);
    ctx.arc(cx, cy, R, aL, aR, true);
    ctx.lineTo(neckR, neckTop);
    ctx.closePath();
  };

  // Glass body (dark, faintly cyan).
  ctx.save();
  const glass = ctx.createRadialGradient(cx - 8, cy - 10, 2, cx, cy, R + 4);
  glass.addColorStop(0, 'rgba(60,90,140,0.55)');
  glass.addColorStop(1, 'rgba(16,24,48,0.88)');
  ctx.fillStyle = glass;
  flask();
  ctx.fill();
  ctx.restore();

  // Liquid (bioluma), sloshing with the hover.
  ctx.save();
  flask();
  ctx.clip();
  const level = cy + 7.5 + (rm ? 0 : Math.sin(t * 1.7 - 0.9) * 0.9);
  const tilt = rm ? 0 : Math.sin(t * 0.9 - 0.5) * 0.07;
  const surf = (x: number) => level + (rm ? 0 : Math.sin(x * 0.22 + t * 2.6) * 0.8) + (x - cx) * tilt;
  const liq = ctx.createLinearGradient(0, level - 4, 0, cy + R);
  liq.addColorStop(0, 'rgba(110,231,255,0.95)');
  liq.addColorStop(0.35, 'rgba(58,123,239,0.92)');
  liq.addColorStop(1, 'rgba(59,42,154,0.95)');
  ctx.fillStyle = liq;
  ctx.beginPath();
  ctx.moveTo(cx - R - 2, surf(cx - R - 2));
  for (let x = cx - R; x <= cx + R + 2; x += 2) ctx.lineTo(x, surf(x));
  ctx.lineTo(cx + R + 2, cy + R + 4);
  ctx.lineTo(cx - R - 2, cy + R + 4);
  ctx.closePath();
  ctx.fill();
  // Surface highlight.
  ctx.strokeStyle = 'rgba(230,252,255,0.75)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (let x = cx - R; x <= cx + R; x += 2) {
    if (x === cx - R) ctx.moveTo(x, surf(x));
    else ctx.lineTo(x, surf(x));
  }
  ctx.stroke();
  // Bubbles.
  if (!opts.mini) {
    for (let i = 0; i < 5; i++) {
      const ph = rm ? 0.3 + i * 0.15 : (t * (0.22 + i * 0.05) + i * 0.37) % 1;
      const bx = cx - 12 + i * 6 + Math.sin(t * 2 + i) * (rm ? 0 : 1.2);
      const by = cy + R - 3 - ph * (cy + R - level - 2);
      ctx.globalAlpha = 0.55 * (1 - ph * 0.6);
      ctx.strokeStyle = '#E6FBFF';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(bx, by, 0.9 + (i % 3) * 0.45, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Glass outline + glow + reflections.
  ctx.save();
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 7;
  ctx.strokeStyle = 'rgba(175,235,255,0.9)';
  ctx.lineWidth = 1.7;
  flask();
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, R - 4, Math.PI * 1.08, Math.PI * 1.33);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.arc(cx - 14.5, cy - 4, 1.1, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Rim + cork + wick.
  ctx.save();
  ctx.fillStyle = '#272C63';
  ctx.strokeStyle = 'rgba(175,235,255,0.85)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(neckL - 2.5, neckTop - 6.5, neckR - neckL + 5, 7, 2.2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(200,215,255,0.8)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(50, neckTop - 6.5);
  ctx.lineTo(50, neckTop - 9.5);
  ctx.stroke();
  ctx.restore();

  const wear = s.wear ?? velaWear;
  if (wear.includes('scarf')) drawScarf(ctx, t, rm);
  if (wear.includes('medal')) drawMedal(ctx, t, rm);
  if (wear.includes('flower')) drawFlower(ctx, 40.5, 24.5, t, rm);

  // Face.
  const eyeY = 53;
  drawEye(ctx, 42, eyeY, s.mood, s.blink, -1, t);
  drawEye(ctx, 58, eyeY, s.mood, s.blink, 1, t);
  if (s.mood === 'happy' || s.mood === 'awed') {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#FF8FAB';
    ctx.beginPath();
    ctx.ellipse(36.5, 59.5, 3.1, 1.8, 0, 0, TAU);
    ctx.ellipse(63.5, 59.5, 3.1, 1.8, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  drawMouth(ctx, 50, 61, s.mood, s.talk, s.talking, t);
  if (s.mood === 'worried' && !opts.mini) {
    // A sweat drop.
    ctx.save();
    ctx.fillStyle = 'rgba(190,240,255,0.85)';
    const dy = rm ? 0 : ((t * 0.6) % 1) * 3;
    ctx.beginPath();
    ctx.moveTo(67, 44 + dy);
    ctx.quadraticCurveTo(69.6, 48.5 + dy, 67, 49.5 + dy);
    ctx.quadraticCurveTo(64.4, 48.5 + dy, 67, 44 + dy);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();

  // Flame (outside the body transform so it trails the hover a little).
  const flameH = 12 * FLAME_SCALE[s.mood] * (1 + s.talk * 0.12);
  drawFlame(ctx, 50 + worriedShake, 20.5 + hover * 0.85, flameH, 5.2, t, rm);

  // Hands.
  if (!opts.mini) {
    let lx = 22;
    let ly = 70;
    let rx = 78;
    let ry = 70;
    const bob = (k: number) => (rm ? 0 : Math.sin(t * 2.1 + k) * 1.6);
    if (s.mood === 'happy') {
      // Right hand waves.
      rx = 82 + (rm ? 0 : Math.sin(t * 9) * 3);
      ry = 50;
      ly = 72 + bob(0);
    } else if (s.mood === 'awed') {
      lx = 28;
      ly = 52 + bob(0) * 0.4;
      rx = 72;
      ry = 52 + bob(1) * 0.4;
    } else if (s.mood === 'worried') {
      lx = 41 + (rm ? 0 : Math.sin(t * 7) * 0.8);
      ly = 91;
      rx = 59 - (rm ? 0 : Math.sin(t * 7) * 0.8);
      ry = 91;
    } else {
      ly += bob(0) + hover;
      ry += bob(1.4) + hover;
    }
    drawHand(ctx, lx, ly + (s.mood === 'neutral' ? 0 : hover), 3.3);
    drawHand(ctx, rx, ry + (s.mood === 'neutral' ? 0 : hover), 3.3);
  }

  if (s.mood === 'awed' && !opts.mini) {
    for (let i = 0; i < 3; i++) {
      const ph = rm ? 0.6 : (t * 0.9 + i * 0.33) % 1;
      const a = Math.sin(ph * Math.PI);
      const ang = -2.3 + i * 0.9;
      sparkle(ctx, 50 + Math.cos(ang) * 36, 48 + Math.sin(ang) * 30, 2.4 + a * 1.4, a);
    }
  }
}

// ═══════════════════════════════ ALBOR ═══════════════════════════════

function drawAlborFace(ctx: CanvasRenderingContext2D, s: PortraitState, t: number, ink: string, fill: string): void {
  const cx = 50;
  const cy = 38;
  // Shoulders + lab coat.
  ctx.fillStyle = fill;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(26, 78);
  ctx.bezierCurveTo(28, 62, 38, 56, 44, 54);
  ctx.lineTo(56, 54);
  ctx.bezierCurveTo(62, 56, 72, 62, 74, 78);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(44.5, 54.5);
  ctx.lineTo(50, 66);
  ctx.lineTo(55.5, 54.5);
  ctx.moveTo(50, 66);
  ctx.lineTo(50, 78);
  ctx.stroke();
  // A pen in the coat pocket.
  ctx.beginPath();
  ctx.moveTo(61, 63);
  ctx.lineTo(62.2, 69);
  ctx.stroke();
  // Neck.
  ctx.beginPath();
  ctx.moveTo(46, 48);
  ctx.lineTo(46, 54.5);
  ctx.moveTo(54, 48);
  ctx.lineTo(54, 54.5);
  ctx.stroke();
  // Hair back (bob).
  ctx.fillStyle = '#24160C';
  ctx.beginPath();
  ctx.moveTo(cx - 13, cy + 8);
  ctx.bezierCurveTo(cx - 16, cy - 6, cx - 9, cy - 15, cx, cy - 14);
  ctx.bezierCurveTo(cx + 9, cy - 15, cx + 16, cy - 6, cx + 13, cy + 8);
  ctx.closePath();
  ctx.fill();
  // Face.
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 1, 9.6, 11.2, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // Fringe.
  ctx.fillStyle = '#24160C';
  ctx.beginPath();
  ctx.moveTo(cx - 10.5, cy - 1);
  ctx.bezierCurveTo(cx - 9, cy - 13, cx + 6, cy - 14, cx + 10.5, cy - 3);
  ctx.bezierCurveTo(cx + 4, cy - 7, cx - 3, cy - 7, cx - 10.5, cy - 1);
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.stroke();
  // Glasses.
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(cx - 4.4, cy + 1.5, 3.4, 0, TAU);
  ctx.moveTo(cx + 7.8, cy + 1.5);
  ctx.arc(cx + 4.4, cy + 1.5, 3.4, 0, TAU);
  ctx.moveTo(cx - 1, cy + 1.2);
  ctx.lineTo(cx + 1, cy + 1.2);
  ctx.stroke();
  // Eyes (soft, a little tired).
  const blink = Math.max(0.12, 1 - s.blink);
  ctx.fillStyle = ink;
  if (s.mood === 'happy' && s.blink < 0.5) {
    ctx.beginPath();
    ctx.arc(cx - 4.4, cy + 2.4, 1.6, Math.PI * 1.1, Math.PI * 1.9);
    ctx.moveTo(cx + 6, cy + 2.4);
    ctx.arc(cx + 4.4, cy + 2.4, 1.6, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(cx - 4.4, cy + 1.8, 1.1, 1.3 * blink, 0, 0, TAU);
    ctx.ellipse(cx + 4.4, cy + 1.8, 1.1, 1.3 * blink, 0, 0, TAU);
    ctx.fill();
  }
  // Mouth.
  const open = s.talking ? s.talk : 0;
  ctx.beginPath();
  if (open > 0.1) {
    ctx.ellipse(cx, cy + 7.2, 1.9, 0.5 + open * 1.4, 0, 0, TAU);
    ctx.fill();
  } else {
    ctx.moveTo(cx - 2.6, cy + 6.8);
    ctx.quadraticCurveTo(cx, cy + (s.mood === 'happy' ? 9.4 : 8.2), cx + 2.6, cy + 6.8);
    ctx.stroke();
  }
  void t;
}

export function drawAlbor(ctx: CanvasRenderingContext2D, s: PortraitState, t: number): void {
  const rm = s.reduceMotion;
  if (s.live) {
    // Live: warm dawn behind her, no tape.
    glowDisc(ctx, 50, 52, 50, 'rgba(255,190,110,0.95)', 0.4);
    glowDisc(ctx, 50, 40, 30, 'rgba(255,233,199,0.95)', 0.35);
    ctx.save();
    ctx.translate(0, rm ? 0 : Math.sin(t * 1.2) * 0.6);
    drawAlborFace(ctx, s, t, '#FFE7C4', '#6A4524');
    ctx.restore();
    return;
  }
  glowDisc(ctx, 50, 50, 50, 'rgba(242,165,65,0.9)', 0.2);
  const flicker = rm ? 1 : 0.9 + Math.random() * 0.1;
  // Photo (slightly tilted).
  ctx.save();
  ctx.translate(50, 40);
  ctx.rotate(-0.05);
  ctx.translate(-50, -40);
  ctx.fillStyle = '#EED9B8';
  ctx.shadowColor = 'rgba(242,165,65,0.6)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.roundRect(19, 6, 62, 66, 2.5);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.rect(22.5, 9.5, 55, 55);
  ctx.save();
  ctx.clip();
  const bg = ctx.createLinearGradient(0, 9, 0, 65);
  bg.addColorStop(0, '#3E2915');
  bg.addColorStop(1, '#170F08');
  ctx.fillStyle = bg;
  ctx.fillRect(22, 9, 56, 56);
  ctx.globalAlpha = flicker;
  drawAlborFace(ctx, s, t, '#FFCF8A', '#5A3A1E');
  ctx.globalAlpha = 1;
  // Scanlines.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 10; y < 65; y += 2) ctx.fillRect(22, y, 56, 0.6);
  ctx.restore();
  ctx.restore();

  // Cassette.
  ctx.save();
  ctx.translate(50, 85);
  ctx.fillStyle = '#2A1F16';
  ctx.strokeStyle = 'rgba(255,207,138,0.85)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.roundRect(-21, -9, 42, 18, 2.5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,207,138,0.18)';
  ctx.fillRect(-14, -6, 28, 9);
  const spin = rm ? 0 : t * (s.talking ? 5 : 1.2);
  for (const sx of [-8, 8]) {
    ctx.save();
    ctx.translate(sx, -1.5);
    ctx.rotate(spin * (sx < 0 ? 1 : 1.15));
    ctx.fillStyle = '#120C07';
    ctx.beginPath();
    ctx.arc(0, 0, 3.6, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 3, Math.sin(a) * 3);
    }
    ctx.stroke();
    ctx.restore();
  }
  // Play indicator.
  ctx.fillStyle = s.talking ? '#FFB45E' : 'rgba(255,207,138,0.5)';
  ctx.beginPath();
  ctx.moveTo(-17.5, 3.2);
  ctx.lineTo(-17.5, 7.2);
  ctx.lineTo(-14.2, 5.2);
  ctx.closePath();
  ctx.fill();
  // VU meter.
  for (let i = 0; i < 6; i++) {
    const lv = s.talking ? (rm ? 0.6 : 0.4 + 0.6 * Math.abs(Math.sin(t * 13 + i * 1.7))) * s.talk + 0.15 : 0.12;
    ctx.fillStyle = i < 4 ? 'rgba(255,207,138,0.9)' : 'rgba(255,120,80,0.9)';
    ctx.globalAlpha = i / 6 < lv ? 1 : 0.2;
    ctx.fillRect(4 + i * 2.6, 3.5, 1.8, 3.2);
  }
  ctx.restore();
}

// ═══════════════════════════════ COMMITTEE ═══════════════════════════════

export function drawCommittee(ctx: CanvasRenderingContext2D, s: PortraitState, t: number): void {
  const rm = s.reduceMotion;
  glowDisc(ctx, 50, 60, 46, 'rgba(228,87,46,0.9)', 0.12);
  // Paper strip scrolling up while it "speaks".
  const scroll = rm ? 0 : (t * (s.talking ? 9 : 0.6)) % 6;
  ctx.save();
  ctx.beginPath();
  ctx.rect(30, 4, 40, 46);
  ctx.clip();
  const pg = ctx.createLinearGradient(0, 4, 0, 50);
  pg.addColorStop(0, 'rgba(230,224,210,0)');
  pg.addColorStop(0.25, 'rgba(230,224,210,0.95)');
  pg.addColorStop(1, '#E6E0D2');
  ctx.fillStyle = pg;
  ctx.fillRect(33, 4, 34, 46);
  ctx.fillStyle = 'rgba(40,40,50,0.7)';
  for (let i = 0; i < 9; i++) {
    const y = 48 - i * 6 + scroll;
    const len = 8 + ((i * 37) % 17);
    ctx.fillRect(37, y, len, 1.3);
    ctx.fillRect(37 + len + 2, y, 18 - ((i * 13) % 9), 1.3);
  }
  // Stamp.
  ctx.strokeStyle = 'rgba(228,87,46,0.85)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(58, 20 + scroll, 5.2, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(55.6, 20.2 + scroll);
  ctx.lineTo(57.4, 22.2 + scroll);
  ctx.lineTo(60.6, 17.6 + scroll);
  ctx.stroke();
  ctx.restore();

  // Machine body.
  ctx.save();
  ctx.fillStyle = '#1C2229';
  ctx.strokeStyle = 'rgba(139,152,165,0.75)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(22, 50);
  ctx.lineTo(78, 50);
  ctx.lineTo(86, 88);
  ctx.lineTo(14, 88);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0E1216';
  ctx.fillRect(30, 49, 40, 3);
  // Keys.
  for (let row = 0; row < 3; row++)
    for (let k = 0; k < 9; k++) {
      const x = 22 + row * 1.8 + k * 6.4;
      const y = 64 + row * 6.5;
      const pressed = s.talking && !rm && Math.sin(t * 17 + k * 2.1 + row * 3.3) > 0.85;
      ctx.fillStyle = pressed ? '#8B98A5' : '#2C343E';
      ctx.fillRect(x, y + (pressed ? 0.8 : 0), 4.6, 3.6);
    }
  // Red light.
  const on = s.talking ? (rm ? true : Math.sin(t * 10) > 0) : (rm ? false : Math.sin(t * 2) > 0.6);
  glowDisc(ctx, 74, 56, 7, 'rgba(228,87,46,1)', on ? 0.8 : 0.15);
  ctx.fillStyle = on ? '#FF7A5C' : '#5A2A20';
  ctx.beginPath();
  ctx.arc(74, 56, 1.8, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ═══════════════════════════════ CHOIR ═══════════════════════════════

export function drawChoir(ctx: CanvasRenderingContext2D, s: PortraitState, t: number, lens: LeniaLens | null): void {
  const cx = 50;
  const cy = 50;
  const R = 40;
  glowDisc(ctx, cx, cy, 52, 'rgba(184,146,255,0.9)', 0.18);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.clip();
  const bg = ctx.createRadialGradient(cx, cy, 4, cx, cy, R);
  bg.addColorStop(0, '#111737');
  bg.addColorStop(1, '#04060B');
  ctx.fillStyle = bg;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  let ox = cx;
  let oy = cy;
  if (lens) {
    // Keep the creature roughly centred: draw the torus tiled around its centre.
    const sc = (R * 3) / lens.size;
    const shiftX = cx - lens.cx * sc;
    const shiftY = cy - lens.cy * sc;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.shadowColor = 'rgba(91,192,235,0.9)';
    ctx.shadowBlur = 6;
    const W = lens.size * sc;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) ctx.drawImage(lens.canvas, shiftX + dx * W, shiftY + dy * W, W, W);
    ctx.shadowBlur = 0;
    ox = cx;
    oy = cy;
  }
  // Rings: one per spoken dot, out of the creature.
  for (const age of s.pulses) {
    const k = age / 1.4;
    if (k >= 1) continue;
    ctx.strokeStyle = `rgba(200,180,255,${(1 - k) * 0.85})`;
    ctx.lineWidth = 1.6 * (1 - k) + 0.4;
    ctx.beginPath();
    ctx.arc(ox, oy, 6 + k * 34, 0, TAU);
    ctx.stroke();
  }
  // Reticle.
  ctx.strokeStyle = 'rgba(158,240,255,0.14)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(cx - R, cy);
  ctx.lineTo(cx + R, cy);
  ctx.moveTo(cx, cy - R);
  ctx.lineTo(cx, cy + R);
  ctx.stroke();
  // Vignette.
  const vg = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(2,3,8,0.85)');
  ctx.fillStyle = vg;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.restore();
  // Eyepiece ring with ticks.
  ctx.save();
  ctx.shadowColor = '#B892FF';
  ctx.shadowBlur = 6;
  ctx.strokeStyle = 'rgba(200,215,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 1, 0, TAU);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(200,215,255,0.45)';
  ctx.lineWidth = 0.8;
  const rot = s.reduceMotion ? 0 : t * 0.05;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU + rot;
    const len = i % 4 === 0 ? 3.2 : 1.6;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (R + 3), cy + Math.sin(a) * (R + 3));
    ctx.lineTo(cx + Math.cos(a) * (R + 3 + len), cy + Math.sin(a) * (R + 3 + len));
    ctx.stroke();
  }
  ctx.restore();
}

// ═══════════════════════════════ YOU (journal) ═══════════════════════════════

export function drawYou(ctx: CanvasRenderingContext2D, s: PortraitState, t: number): void {
  const rm = s.reduceMotion;
  glowDisc(ctx, 50, 56, 46, 'rgba(91,192,235,0.9)', 0.12);
  ctx.save();
  ctx.translate(50, 58);
  ctx.rotate(-0.08);
  // Two pages.
  for (const side of [-1, 1]) {
    ctx.fillStyle = side < 0 ? '#1E2731' : '#222C37';
    ctx.strokeStyle = 'rgba(139,152,165,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.quadraticCurveTo(side * 18, -26, side * 34, -22);
    ctx.lineTo(side * 34, 24);
    ctx.quadraticCurveTo(side * 18, 20, 0, 24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // Lines of handwriting.
  ctx.strokeStyle = 'rgba(230,237,243,0.55)';
  ctx.lineWidth = 0.9;
  ctx.lineCap = 'round';
  const written = rm ? 4 : (t * (s.talking ? 1.4 : 0.15)) % 5;
  for (let i = 0; i < 5; i++) {
    const y = -14 + i * 7;
    const full = i < Math.floor(written);
    const part = i === Math.floor(written) ? written % 1 : full ? 1 : 0;
    if (part <= 0) continue;
    ctx.beginPath();
    const x0 = 6;
    const x1 = x0 + 24 * part;
    for (let x = x0; x <= x1; x += 1.5) {
      const yy = y + Math.sin(x * 1.3 + i) * 0.9;
      if (x === x0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // Left page: a tiny sketch of an Orbium.
  ctx.strokeStyle = 'rgba(91,192,235,0.7)';
  ctx.beginPath();
  ctx.arc(-17, -2, 7, 0.4, Math.PI * 2 - 0.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-17, -2, 3, 0, TAU);
  ctx.stroke();
  // Pen.
  const line = Math.floor(written);
  const px = 6 + 24 * (written % 1);
  const py = -14 + line * 7;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(-0.7);
  ctx.fillStyle = '#C9D1D9';
  ctx.fillRect(-1.2, -22, 2.4, 20);
  ctx.restore();
  glowDisc(ctx, px, py, 5, 'rgba(91,192,235,1)', 0.8);
  ctx.restore();
}

// ═══════════════════════════════ dispatcher ═══════════════════════════════

export function drawPortrait(ctx: CanvasRenderingContext2D, s: PortraitState, t: number, lens: LeniaLens | null): void {
  switch (s.speaker) {
    case 'vela':
      return drawVela(ctx, s, t);
    case 'albor':
      return drawAlbor(ctx, s, t);
    case 'committee':
      return drawCommittee(ctx, s, t);
    case 'coro':
      return drawChoir(ctx, s, t, lens);
    case 'you':
      return drawYou(ctx, s, t);
  }
}

/**
 * A portrait canvas with its own blink timer and smoothing. Call `frame()`
 * every animation frame while visible.
 */
export class Portrait {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private sizePx = 0;
  private dpr = 1;
  state: PortraitState = {
    speaker: 'vela',
    mood: 'neutral',
    moodAge: 10,
    talk: 0,
    talking: false,
    blink: 0,
    live: false,
    pulses: [],
    reduceMotion: false,
  };
  private nextBlink = 2;
  private blinkT = -1;
  private lens: LeniaLens | null = null;

  constructor(className = 'sty-portrait') {
    this.canvas = document.createElement('canvas');
    this.canvas.className = className;
    this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d');
  }

  set(speaker: PortraitState['speaker'], mood: Mood, live = false): void {
    if (speaker !== this.state.speaker || mood !== this.state.mood) this.state.moodAge = 0;
    this.state.speaker = speaker;
    this.state.mood = mood;
    this.state.live = live;
    if (speaker === 'coro' && !this.lens) {
      try {
        this.lens = new LeniaLens();
      } catch {
        this.lens = null;
      }
    }
  }

  /** A ring out of the Choir (one per spoken dot). */
  pulse(): void {
    this.state.pulses.push(0);
    if (this.state.pulses.length > 8) this.state.pulses.shift();
  }

  private fit(): void {
    const css = this.canvas.clientWidth || 100;
    const dpr = Math.min(3, (globalThis.devicePixelRatio as number | undefined) ?? 1);
    if (css !== this.sizePx || dpr !== this.dpr) {
      this.sizePx = css;
      this.dpr = dpr;
      this.canvas.width = Math.round(css * dpr);
      this.canvas.height = Math.round(css * dpr);
    }
  }

  frame(t: number, dt: number, talkTarget: number, talking: boolean): void {
    const s = this.state;
    s.moodAge += dt;
    s.talking = talking;
    s.talk += (talkTarget - s.talk) * Math.min(1, dt * 18);
    s.pulses = s.pulses.map((p) => p + dt).filter((p) => p < 1.6);
    // Blinks every 2.5–5.5 s (VELA and Albor).
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      s.blink = this.blinkT < 0.07 ? this.blinkT / 0.07 : Math.max(0, 1 - (this.blinkT - 0.07) / 0.09);
      if (this.blinkT > 0.16) {
        this.blinkT = -1;
        s.blink = 0;
      }
    } else if (t > this.nextBlink && !s.reduceMotion) {
      this.blinkT = 0;
      this.nextBlink = t + 2.5 + Math.random() * 3;
    }
    if (s.speaker === 'coro' && this.lens && !s.reduceMotion) this.lens.update(dt);
    this.fit();
    const ctx = this.ctx;
    if (!ctx) return;
    const k = (this.sizePx * this.dpr) / 100;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawPortrait(ctx, s, t, this.lens);
  }
}
