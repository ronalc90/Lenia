/**
 * The rest of the cast as objects (ADR-029, docs/ARTE-REALISTA.md §5.7), drawn with the same material
 * kit as VELA: the 8 layers of §3.2, one window light upper left, the dish's cyan bounce below, VELA's
 * warm lamp as a rim on the right. Same 100 × 100 unit box as every portrait.
 *
 *  RECORDER   Albor's portable cassette recorder (§5.7): cream plastic a shade yellower than VELA's
 *             powder coat, a perforated speaker, a VU meter with a damped needle, a smoked window on
 *             the cassette (masking-tape label «Cinta 3 · A.», reels that turn faster while she talks),
 *             chrome piano keys (PLAY goes down), an amber incandescent PLAY lamp.
 *  COMMITTEE  a teletype: grey-green enamel, chrome trim, the platen, paper printing CAPITAL lines with
 *             a red rubber stamp in real ink (ragged edges), keys that hammer, a red lamp.
 *  CHOIR      a knurled brass microscope eyepiece; inside, a REAL live Orbium (LeniaLens) with violet
 *             rings for each "dot" it says.
 *
 * The bodies are static and cached (`sprite`); per frame only reels, needle, keys, lamps, paper and
 * the lens view are drawn. Deterministic, no ctx.filter, no shadowBlur.
 */
import type { LeniaLens } from '../story/lens';
import { cylinderRamp, grainPattern, kelvin } from './vector';
import { BOUNCE, LINE } from './tokens';
import { edgeBand, hash, metal, metrics, pageLang, parsePath, rgbOf, rrect, spot, sprite, trace, trackedText, type Ctx2D, type Shape, TAU } from './characters/kit';

export interface CastPose {
  talk: number;
  talking: boolean;
  blink: number;
  live: boolean;
  pulses: number[];
  reduceMotion: boolean;
  mood: string;
}

const BOUNCE_RGB = rgbOf(BOUNCE.dish);
const RIM_RGB = kelvin(3000).join(',');
const PLAY_RGB = kelvin(2200).join(',');
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
const INK = 'rgba(12,14,18,0.85)';
const KEY_X = -0.55;
const KEY_Y = -0.835;
const CHROME = ['#3a3d40', '#f7f7f5', '#a4a8ab', '#c9dbe4', '#2e3134'] as const;
const CHROME_AT = [0, 0.28, 0.5, 0.82, 1] as const;

/** The 8 layers on a rounded-box body: local ramp, form shadow, bounce, one specular band, rim, grain, contour. */
function body(c: Ctx2D, s: Shape, x: number, y: number, w: number, h: number, local: readonly string[], shade: string, css: number, grain = 0.06): void {
  // 8 · Contour first at 2× (the fill covers its inner half).
  c.strokeStyle = INK;
  c.lineWidth = (LINE.contour * 2) / css;
  c.lineJoin = 'round';
  trace(c, s);
  c.stroke();
  // 1–2 · Base and local colour, lit from above.
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, local[0]);
  g.addColorStop(0.12, local[1]);
  g.addColorStop(0.6, local[2]);
  g.addColorStop(1, local[3]);
  c.fillStyle = g;
  trace(c, s);
  c.fill();
  c.save();
  trace(c, s);
  c.clip();
  // 3 · Form shadow: falls off to the right (multiply).
  c.globalCompositeOperation = 'multiply';
  const f = c.createLinearGradient(x, 0, x + w, 0);
  f.addColorStop(0, '#ffffff');
  f.addColorStop(0.7, '#ffffff');
  f.addColorStop(1, shade);
  c.fillStyle = f;
  c.fillRect(x, y, w, h);
  // 4 · Reflected light: the dish's cyan from below (screen).
  c.globalCompositeOperation = 'screen';
  const b = c.createLinearGradient(0, y + h, 0, y + h - 14);
  b.addColorStop(0, `rgba(${BOUNCE_RGB},0.2)`);
  b.addColorStop(1, `rgba(${BOUNCE_RGB},0)`);
  c.fillStyle = b;
  c.fillRect(x, y + h - 14, w, 14);
  c.globalCompositeOperation = 'source-over';
  // 6 · Rim: VELA's lamp on the right edge.
  edgeBand(c, s, 1, 0, (0.55 * 2) / css, `rgb(${RIM_RGB})`, 0.45);
  // 7 · Texture.
  const p = grainPattern(c);
  if (p) {
    c.globalCompositeOperation = 'soft-light';
    c.globalAlpha = grain;
    c.save();
    c.scale(0.25, 0.25);
    c.fillStyle = p;
    c.fillRect(x * 4, y * 4, w * 4, h * 4);
    c.restore();
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }
  c.restore();
  // 5 · Specular: one long highlight on the top front edge (the window, a band).
  const sp = c.createLinearGradient(x, 0, x + w, 0);
  sp.addColorStop(0, 'rgba(255,255,255,0)');
  sp.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  sp.addColorStop(0.65, 'rgba(255,255,255,0.3)');
  sp.addColorStop(1, 'rgba(255,255,255,0)');
  c.strokeStyle = sp;
  c.lineWidth = (0.6 * 2) / css;
  c.beginPath();
  c.moveTo(x + 4, y + 0.9);
  c.lineTo(x + w - 4, y + 0.9);
  c.stroke();
}

/** A recessed rounded window or panel: its dark fill and a lit lower lip (the chamfer catching light). */
function recess(c: Ctx2D, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient, css: number): void {
  c.beginPath();
  rrect(c, x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
  c.save();
  c.beginPath();
  rrect(c, x, y, w, h, r);
  c.clip();
  const sh = c.createLinearGradient(0, y, 0, y + 3);
  sh.addColorStop(0, 'rgba(0,0,0,0.55)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sh;
  c.fillRect(x, y, w, 3);
  c.restore();
  c.strokeStyle = 'rgba(0,0,0,0.75)';
  c.lineWidth = LINE.detail / css;
  c.beginPath();
  rrect(c, x, y, w, h, r);
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.55)';
  c.lineWidth = LINE.fine / css;
  c.beginPath();
  c.moveTo(x + r, y + h + 0.45);
  c.lineTo(x + w - r, y + h + 0.45);
  c.stroke();
}

// ═══════════════════════════════ RECORDER (Albor on tape) ═══════════════════════════════

/** Cream plastic, a little yellower than VELA's powder coat (§5.7, #e9dfc8). */
const CREAM = ['#f4ecd8', '#e9dfc8', '#d9ccae', '#c2b38f'] as const;
const R_BODY = { x: 8, y: 40, w: 84, h: 52 } as const;
const R_SHAPE = parsePath(
  `M12.6 40H87.4C90 40 92 42 92 44.6V87.4C92 90 90 92 87.4 92H12.6C10 92 8 90 8 87.4V44.6C8 42 10 40 12.6 40Z`,
);
const R_WIN = { x: 14, y: 63.4, w: 50, h: 19.6 } as const;
const R_REELS = [
  [27.4, 73.6],
  [50.6, 73.6],
] as const;
const R_VU = { x: 56, y: 46.4, w: 30, h: 13.4, px: 71, py: 62.6, r: 12.4 } as const;
const R_KEYS = { x: 14, y: 85.6, w: 7.6, gap: 1.0, n: 6, h: 4.2 } as const;

/** What the label on the tape says (Albor's hand, masking tape). */
export const TAPE_LABEL = { es: 'Cinta 3 · A.', en: 'Tape 3 · A.' } as const;

function paintRecorderBase(c: Ctx2D, css: number, lang: 'es' | 'en'): void {
  // Contact shadow on the bench (it sits on a surface).
  spot(c, 50, 92.4, 46, 3.2, 0, '0,0,0', 0.55);
  // Rubber feet.
  c.fillStyle = '#141516';
  c.fillRect(14, 91.4, 9, 1.6);
  c.fillRect(77, 91.4, 9, 1.6);
  // Chrome handle: two pivots and the bar.
  for (const hx of [22, 78]) {
    c.beginPath();
    c.arc(hx, 41.6, 2.4, 0, TAU);
    c.fillStyle = metal(c, hx, 41.6, -2.2, '#f4f4f1', '#6c6f72', 4, 2.4);
    c.fill();
    c.strokeStyle = INK;
    c.lineWidth = LINE.detail / css;
    c.stroke();
  }
  c.strokeStyle = cylinderRamp(c, 0, 32.2, 0, 35.6, CHROME, CHROME_AT);
  c.lineWidth = 3.2;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(22, 41);
  c.lineTo(24.6, 34);
  c.lineTo(75.4, 34);
  c.lineTo(78, 41);
  c.stroke();
  c.strokeStyle = 'rgba(0,0,0,0.6)';
  c.lineWidth = LINE.fine / css;
  c.beginPath();
  c.moveTo(25, 35.7);
  c.lineTo(75, 35.7);
  c.stroke();
  body(c, R_SHAPE, R_BODY.x, R_BODY.y, R_BODY.w, R_BODY.h, CREAM, '#c9bea6', css);
  // The top face seen a little from above: a lighter band with its edge.
  c.fillStyle = 'rgba(255,250,238,0.55)';
  c.fillRect(10, 40.6, 80, 3.2);
  c.fillStyle = 'rgba(120,104,78,0.5)';
  c.fillRect(9, 43.8, 82, (0.6 * 1) / css);
  // Speaker: perforated black anodised grille, every hole's lower lip catching light.
  recess(c, 13, 46.4, 38, 13.4, 1.6, '#1d2226', css);
  for (let r = 0; r < 5; r++)
    for (let k = 0; k < 15; k++) {
      const hx = 15.4 + k * 2.4 + (r % 2) * 1.2;
      const hy = 48.6 + r * 2.3;
      if (hx > 49.4) continue;
      c.fillStyle = '#060708';
      c.beginPath();
      c.arc(hx, hy, 0.62, 0, TAU);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.fillRect(hx - 0.5, hy + 0.48, 1, 0.22);
    }
  // VU meter: a cream dial behind glass, black scale, red zone, the needle's pivot below.
  const vu = c.createLinearGradient(0, R_VU.y, 0, R_VU.y + R_VU.h);
  vu.addColorStop(0, '#fbf3dc');
  vu.addColorStop(1, '#e8d9b2');
  recess(c, R_VU.x, R_VU.y, R_VU.w, R_VU.h, 1.4, vu, css);
  c.save();
  c.beginPath();
  rrect(c, R_VU.x, R_VU.y, R_VU.w, R_VU.h, 1.4);
  c.clip();
  spot(c, R_VU.px, R_VU.y + 6, 16, 8, 0, '255,200,120', 0.25, 'screen');
  c.strokeStyle = '#1b1712';
  c.lineWidth = LINE.detail / css;
  c.beginPath();
  c.arc(R_VU.px, R_VU.py, R_VU.r - 3.2, Math.PI * 1.25, Math.PI * 1.62);
  c.stroke();
  c.strokeStyle = '#c4361e';
  c.lineWidth = (LINE.detail * 2.2) / css;
  c.beginPath();
  c.arc(R_VU.px, R_VU.py, R_VU.r - 3.0, Math.PI * 1.62, Math.PI * 1.75);
  c.stroke();
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (1.25 + 0.5 * (i / 10));
    const r0 = R_VU.r - 3.2;
    const r1 = r0 + (i % 5 === 0 ? 1.9 : 1.1);
    c.strokeStyle = i > 7 ? '#c4361e' : '#1b1712';
    c.lineWidth = LINE.fine / css;
    c.beginPath();
    c.moveTo(R_VU.px + Math.cos(a) * r0, R_VU.py + Math.sin(a) * r0);
    c.lineTo(R_VU.px + Math.cos(a) * r1, R_VU.py + Math.sin(a) * r1);
    c.stroke();
  }
  c.fillStyle = '#1b1712';
  c.font = '700 2.2px "JetBrains Mono", ui-monospace, monospace';
  c.textBaseline = 'alphabetic';
  trackedText(c, 'VU', R_VU.px - 1.7, R_VU.y + R_VU.h - 1.4, 2.2, 0.1);
  c.restore();
  // Cassette window: smoked glass over the cassette.
  recess(c, R_WIN.x, R_WIN.y, R_WIN.w, R_WIN.h, 1.6, '#17120e', css);
  c.save();
  c.beginPath();
  rrect(c, R_WIN.x, R_WIN.y, R_WIN.w, R_WIN.h, 1.6);
  c.clip();
  // The cassette shell (smoked translucent grey) with its own window and screws.
  c.fillStyle = '#2e2a27';
  c.beginPath();
  rrect(c, 16, 64.6, 46, 22, 1.2);
  c.fill();
  c.fillStyle = '#0d0b0a';
  c.beginPath();
  rrect(c, 22.4, 69, 33.4, 9.2, 4.2);
  c.fill();
  for (const [sx, sy] of [
    [18, 66.6],
    [60, 66.6],
    [39, 81.6],
  ]) {
    c.beginPath();
    c.arc(sx, sy, 0.7, 0, TAU);
    c.fillStyle = metal(c, sx, sy, -2, '#d9d9d4', '#4c4f52', 2, 0.7);
    c.fill();
  }
  // Masking-tape label with her handwriting.
  c.save();
  c.translate(39, 66.2);
  c.rotate(-0.025);
  c.fillStyle = '#e9dcb4';
  c.beginPath();
  c.moveTo(-14, -1.6);
  for (let i = 0; i <= 14; i++) c.lineTo(-14 + i * 2, -1.6 + (hash(i, 97) - 0.5) * 0.25);
  c.lineTo(14, 1.6);
  for (let i = 14; i >= 0; i--) c.lineTo(-14 + i * 2, 1.6 + (hash(i, 98) - 0.5) * 0.25);
  c.closePath();
  c.fill();
  c.fillStyle = '#23406e';
  c.font = `italic 500 2.5px Fraunces, Georgia, serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(TAPE_LABEL[lang], 0, 0.15);
  c.textAlign = 'start';
  c.restore();
  c.restore();
  // Counter (three mechanical digits) and the PLAY lamp's chrome bezel.
  recess(c, 68, 66.4, 13, 5.4, 0.8, '#121416', css);
  c.beginPath();
  c.arc(84.4, 77.6, 2.2, 0, TAU);
  c.fillStyle = metal(c, 84.4, 77.6, -2.2, '#f4f4f1', '#6c6f72', 4, 2.2);
  c.fill();
  c.fillStyle = '#5a4a3a';
  c.font = '600 1.9px "JetBrains Mono", ui-monospace, monospace';
  trackedText(c, 'PLAY', 68.6, 78.4, 1.9, 0.08);
  // The key well.
  recess(c, 13, 84.8, 61, 5.8, 1, '#211c17', css);
}

/** Damped VU level: a VU's ballistics are slow (99 % in 300 ms), so smooth sines of the talk envelope read right (L8). */
function vuLevel(t: number, talk: number, talking: boolean, rm: boolean): number {
  if (!talking && talk < 0.05) return 0.04;
  if (rm) return 0.55 * Math.max(0.4, talk);
  const v = 0.42 + 0.22 * Math.sin(t * 5.1) + 0.12 * Math.sin(t * 8.3 + 1.3) + 0.06 * Math.sin(t * 13.7 + 2);
  return Math.max(0, Math.min(1.05, v * (0.5 + 0.6 * talk)));
}

function paintGlass(c: Ctx2D): void {
  // Reflections on the smoked cassette window and the VU glass: one diagonal band each (the window).
  for (const [x, y, w, h] of [
    [R_WIN.x, R_WIN.y, R_WIN.w, R_WIN.h],
    [R_VU.x, R_VU.y, R_VU.w, R_VU.h],
  ] as const) {
    c.save();
    c.beginPath();
    rrect(c, x, y, w, h, 1.4);
    c.clip();
    const g = c.createLinearGradient(x, y, x + w * 0.5, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0.16)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.31, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
    c.restore();
  }
}

/**
 * Albor's recorder in the 100-unit box (the tape portrait, §5.7). `s.talking` turns the reels faster,
 * moves the needle and presses PLAY; Reduce motion stops the reels and parks the needle.
 */
export function drawRecorder(ctx: Ctx2D, s: CastPose, t: number): void {
  const rm = s.reduceMotion;
  const lang = pageLang();
  const { css } = metrics(ctx);
  sprite(ctx, `recorder|${lang}`, 0, 30, 100, 64, (c, cs) => paintRecorderBase(c, cs, lang));
  // Reels: white hubs with six teeth, brown tape wound (more on the left: side A just started).
  const spin = rm ? 0 : t * (s.talking ? 4.6 : 0.5);
  ctx.save();
  ctx.beginPath();
  rrect(ctx, 22.4, 69, 33.4, 9.2, 4.2);
  ctx.clip();
  for (let i = 0; i < 2; i++) {
    const [rx, ry] = R_REELS[i];
    const wound = i === 0 ? 6.2 : 4.4;
    ctx.fillStyle = '#4a2f1c';
    ctx.beginPath();
    ctx.arc(rx, ry, wound, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,150,0.18)';
    ctx.lineWidth = LINE.fine / css;
    ctx.beginPath();
    ctx.arc(rx, ry, wound - 0.5, Math.PI * 1.1, Math.PI * 1.5);
    ctx.stroke();
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(spin * (i === 0 ? 1 : 1.3));
    ctx.fillStyle = '#ece7da';
    ctx.beginPath();
    ctx.arc(0, 0, 2.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#17120e';
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 1.45, Math.sin(a) * 1.45, 0.42, 0, TAU);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 0.7, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // VU needle (black, a little shadow on the dial), damped.
  const lv = vuLevel(t, s.talk, s.talking, rm);
  const na = Math.PI * (1.25 + 0.5 * Math.min(1.04, lv));
  ctx.save();
  ctx.beginPath();
  rrect(ctx, R_VU.x, R_VU.y, R_VU.w, R_VU.h, 1.4);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(60,40,20,0.25)';
  ctx.lineWidth = LINE.detail / css;
  ctx.beginPath();
  ctx.moveTo(R_VU.px + 0.5, R_VU.py + 0.4);
  ctx.lineTo(R_VU.px + Math.cos(na) * (R_VU.r - 1) + 0.5, R_VU.py + Math.sin(na) * (R_VU.r - 1) + 0.4);
  ctx.stroke();
  ctx.strokeStyle = '#141210';
  ctx.beginPath();
  ctx.moveTo(R_VU.px, R_VU.py);
  ctx.lineTo(R_VU.px + Math.cos(na) * (R_VU.r - 1), R_VU.py + Math.sin(na) * (R_VU.r - 1));
  ctx.stroke();
  ctx.restore();
  sprite(ctx, 'recorder|glass', 10, 44, 80, 42, paintGlass);
  // Counter digits (they advance while the tape plays).
  const count = Math.floor((rm ? 42 : 42 + t * (s.talking ? 1.4 : 0.15)) % 1000);
  ctx.fillStyle = '#e8e2d2';
  ctx.font = '600 3.4px "JetBrains Mono", ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 3; i++) {
    const d = Math.floor(count / 10 ** (2 - i)) % 10;
    ctx.fillText(DIGITS[d], 69.6 + i * 3.4, 69.2);
  }
  // Piano keys: chrome caps on black stems; PLAY (the third) goes down while she talks.
  for (let i = 0; i < R_KEYS.n; i++) {
    const down = i === 2 && (s.talking || rm) ? 1 : 0;
    const kx = R_KEYS.x + i * (R_KEYS.w + R_KEYS.gap);
    const ky = R_KEYS.y + down * 1.1;
    ctx.fillStyle = '#0d0e10';
    ctx.fillRect(kx, R_KEYS.y + R_KEYS.h - 0.8, R_KEYS.w, 1.2);
    ctx.beginPath();
    rrect(ctx, kx, ky, R_KEYS.w, R_KEYS.h - down * 1.1, 0.7);
    ctx.fillStyle = i === 0 ? '#7a1f14' : '#2a2c2f';
    ctx.fill();
    ctx.fillStyle = down ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.32)';
    ctx.fillRect(kx + 0.5, ky + 0.35, R_KEYS.w - 1, 0.5);
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = LINE.fine / css;
    ctx.beginPath();
    rrect(ctx, kx, ky, R_KEYS.w, R_KEYS.h - down * 1.1, 0.7);
    ctx.stroke();
    // Engraved symbol.
    ctx.fillStyle = 'rgba(230,230,224,0.75)';
    const cx = kx + R_KEYS.w / 2;
    const cy = ky + (R_KEYS.h - down * 1.1) / 2 + 0.3;
    ctx.beginPath();
    if (i === 0) ctx.arc(cx, cy, 0.7, 0, TAU);
    else if (i === 1) {
      ctx.moveTo(cx - 1.4, cy);
      ctx.lineTo(cx, cy - 0.8);
      ctx.lineTo(cx, cy + 0.8);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + 1.4, cy - 0.8);
      ctx.lineTo(cx + 1.4, cy + 0.8);
    } else if (i === 2) {
      ctx.moveTo(cx - 0.7, cy - 0.9);
      ctx.lineTo(cx + 0.9, cy);
      ctx.lineTo(cx - 0.7, cy + 0.9);
    } else if (i === 3) {
      ctx.moveTo(cx + 1.4, cy);
      ctx.lineTo(cx, cy - 0.8);
      ctx.lineTo(cx, cy + 0.8);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx - 1.4, cy - 0.8);
      ctx.lineTo(cx - 1.4, cy + 0.8);
    } else if (i === 4) ctx.rect(cx - 0.75, cy - 0.75, 1.5, 1.5);
    else {
      ctx.moveTo(cx - 0.9, cy + 0.2);
      ctx.lineTo(cx, cy - 0.9);
      ctx.lineTo(cx + 0.9, cy + 0.2);
    }
    ctx.closePath();
    ctx.fill();
  }
  // PLAY lamp: a small incandescent bulb, on while the tape plays (inertia: no flicker).
  const on = s.talking ? 1 : 0.12;
  if (on > 0.2) spot(ctx, 84.4, 77.6, 7, 7, 0, PLAY_RGB, 0.4 * on, 'screen');
  ctx.beginPath();
  ctx.arc(84.4, 77.6, 1.35, 0, TAU);
  const lg = ctx.createRadialGradient(84, 77.2, 0.1, 84.4, 77.6, 1.35);
  lg.addColorStop(0, on > 0.5 ? '#fff3d6' : '#5a3a18');
  lg.addColorStop(1, on > 0.5 ? '#ff9227' : '#2a1709');
  ctx.fillStyle = lg;
  ctx.fill();
}

// ═══════════════════════════════ COMMITTEE (telex) ═══════════════════════════════

const ENAMEL = ['#8a988f', '#76857c', '#5d6a63', '#46514b'] as const;
const T_BODY = parsePath('M17.4 57H82.6C84.4 57 85.6 58 86 59.6L92 90.4C92.4 92 91.4 93 89.8 93H10.2C8.6 93 7.6 92 8 90.4L14 59.6C14.4 58 15.6 57 17.4 57Z');

function paintTelexBody(c: Ctx2D, css: number): void {
  spot(c, 50, 93.4, 46, 3, 0, '0,0,0', 0.55);
  body(c, T_BODY, 8, 57, 84, 36, ENAMEL, '#b9c3bd', css, 0.07);
  // Chrome trim line.
  c.strokeStyle = cylinderRamp(c, 0, 59.8, 0, 61.4, CHROME, CHROME_AT);
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(14.6, 60.6);
  c.lineTo(85.4, 60.6);
  c.stroke();
  // Key bed: a recessed well.
  recess(c, 17, 63.8, 66, 24.4, 2, '#2c3430', css);
  // Platen: black rubber cylinder with chrome knobs.
  c.fillStyle = cylinderRamp(c, 0, 50.4, 0, 57.6, ['#050607', '#5b6062', '#1c1f20', '#30373a', '#040505'], CHROME_AT);
  c.beginPath();
  rrect(c, 22, 50.4, 56, 7.2, 3.6);
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = LINE.detail / css;
  c.stroke();
  for (const kx of [19.8, 80.2]) {
    c.beginPath();
    c.arc(kx, 54, 3, 0, TAU);
    c.fillStyle = metal(c, kx, 54, -2.2, '#f4f4f1', '#6c6f72', 6, 3);
    c.fill();
    c.strokeStyle = INK;
    c.stroke();
  }
  // Committee badge: an embossed brass shield.
  c.beginPath();
  c.moveTo(50, 88.4);
  c.lineTo(54.6, 89.6);
  c.lineTo(54.6, 91.2);
  c.quadraticCurveTo(54.6, 92.4, 50, 92.8);
  c.quadraticCurveTo(45.4, 92.4, 45.4, 91.2);
  c.lineTo(45.4, 89.6);
  c.closePath();
  c.fillStyle = metal(c, 50, 90.6, -2, '#fff0b8', '#7a5a1c', 3, 3);
  c.fill();
  c.strokeStyle = 'rgba(40,28,8,0.7)';
  c.lineWidth = LINE.fine / css;
  c.stroke();
  // Lamp bezel.
  c.beginPath();
  c.arc(80, 62.6, 2.4, 0, TAU);
  c.fillStyle = metal(c, 80, 62.6, -2.2, '#f4f4f1', '#6c6f72', 4, 2.4);
  c.fill();
}

/** A red rubber stamp in real ink: a ring and a tick with ragged, uneven edges (deterministic). */
function stamp(c: Ctx2D, x: number, y: number, css: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(-0.18);
  c.lineCap = 'round';
  for (let i = 0; i < 48; i++) {
    const a0 = (i / 48) * TAU;
    const a1 = ((i + 1) / 48) * TAU;
    const ink = 0.45 + 0.45 * hash(i, 41);
    if (ink < 0.5) continue;
    c.strokeStyle = `rgba(196,40,26,${ink})`;
    c.lineWidth = 0.9 + 0.5 * hash(i, 42);
    c.beginPath();
    c.arc(0, 0, 5 + (hash(i, 43) - 0.5) * 0.25, a0, a1);
    c.stroke();
  }
  c.strokeStyle = 'rgba(196,40,26,0.75)';
  c.lineWidth = LINE.fine / css + 0.3;
  c.beginPath();
  c.arc(0, 0, 3.6, 0, TAU);
  c.stroke();
  c.strokeStyle = 'rgba(196,40,26,0.85)';
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(-2.2, 0.2);
  c.lineTo(-0.6, 1.8);
  c.lineTo(2.4, -1.8);
  c.stroke();
  // Ink spatters at the edge.
  for (let i = 0; i < 6; i++) {
    const a = hash(i, 44) * TAU;
    c.fillStyle = `rgba(196,40,26,${0.4 + 0.4 * hash(i, 45)})`;
    c.beginPath();
    c.arc(Math.cos(a) * (6 + hash(i, 46)), Math.sin(a) * (6 + hash(i, 46)), 0.18 + 0.2 * hash(i, 47), 0, TAU);
    c.fill();
  }
  c.restore();
}

export function drawCommitteeArt(ctx: Ctx2D, s: CastPose, t: number): void {
  const rm = s.reduceMotion;
  const { css } = metrics(ctx);
  // Paper strip: rises from the platen and curls back at the top; never leaves the box.
  const scroll = rm ? 0 : (t * (s.talking ? 8 : 0.5)) % 6;
  const px0 = 33;
  const px1 = 67;
  ctx.save();
  ctx.beginPath();
  ctx.rect(px0 - 1, 9, px1 - px0 + 2, 45);
  ctx.clip();
  const pg = ctx.createLinearGradient(px0, 0, px1, 0);
  pg.addColorStop(0, '#e9e1cc');
  pg.addColorStop(0.3, '#f6f0e1');
  pg.addColorStop(1, '#d8cfb9');
  ctx.fillStyle = pg;
  ctx.fillRect(px0, 9, px1 - px0, 45);
  // The platen's pressure leaves a faint ribbed trace on the paper.
  for (let y = 10 + (scroll % 1.2); y < 54; y += 1.2) {
    ctx.fillStyle = 'rgba(120,110,90,0.06)';
    ctx.fillRect(px0, y, px1 - px0, 0.25);
  }
  // Printed CAPITAL lines (a ribbon's ink: dark, slightly uneven).
  for (let i = 0; i < 9; i++) {
    const y = 50 - i * 5 + scroll;
    let x = px0 + 3;
    for (let w = 0; w < 4; w++) {
      const len = 3 + ((i * 7 + w * 13) % 7);
      if (x + len > px1 - 3) break;
      for (let k = 0; k < len; k += 1.05) {
        ctx.fillStyle = `rgba(32,34,40,${0.62 + 0.25 * hash(i * 31 + w * 7 + Math.round(k * 2), 48)})`;
        ctx.fillRect(x + k, y, 0.8, 1.3);
      }
      x += len + 1.8;
    }
  }
  stamp(ctx, 58, 22 + scroll, css);
  // The paper's edges and the lamp's rim on its right side.
  ctx.fillStyle = `rgba(${RIM_RGB},0.25)`;
  ctx.fillRect(px1 - 0.6, 9, 0.6, 45);
  ctx.restore();
  // Paper curl at the top.
  ctx.fillStyle = '#cfc6b2';
  ctx.beginPath();
  ctx.ellipse(50, 9.2, (px1 - px0) / 2, 2.2, 0, Math.PI, TAU);
  ctx.fill();
  ctx.fillStyle = '#f6f0e1';
  ctx.beginPath();
  ctx.ellipse(50, 9.6, (px1 - px0) / 2, 1.5, 0, 0, Math.PI);
  ctx.fill();
  sprite(ctx, 'telex|body', 4, 46, 92, 50, paintTelexBody);
  // Keys: three rows of round keycaps, chrome rims; they hammer while it speaks.
  for (let row = 0; row < 3; row++)
    for (let k = 0; k < 9; k++) {
      const x = 22.3 + row * 1.6 + k * 6.6 - row * 0.4;
      const y = 68.2 + row * 7;
      const hit = s.talking && !rm && Math.sin(t * 17 + k * 2.1 + row * 3.3) > 0.82;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(x + 0.3, y + 1.8, 2.6, 2.2, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#7a8085';
      ctx.beginPath();
      ctx.ellipse(x, y + (hit ? 0.9 : 0), 2.5, 2.25, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = hit ? '#cfd3cd' : '#eef0e8';
      ctx.beginPath();
      ctx.ellipse(x - 0.15, y - 0.2 + (hit ? 0.9 : 0), 1.95, 1.75, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(30,34,38,0.55)';
      ctx.fillRect(x - 0.5, y - 0.4 + (hit ? 0.9 : 0), 1, 0.5);
    }
  // Red "receiving" lamp.
  const on = s.talking ? (rm ? 1 : Math.sin(t * 10) > 0 ? 1 : 0.2) : rm ? 0.2 : Math.sin(t * 2) > 0.6 ? 0.8 : 0.15;
  if (on > 0.3) spot(ctx, 80, 62.6, 7, 7, 0, '255,59,46', 0.45 * on, 'screen');
  ctx.beginPath();
  ctx.arc(80, 62.6, 1.6, 0, TAU);
  const lg = ctx.createRadialGradient(79.6, 62.2, 0.1, 80, 62.6, 1.6);
  lg.addColorStop(0, on > 0.5 ? '#ffd9d2' : '#5a2320');
  lg.addColorStop(1, on > 0.5 ? '#ff3b2e' : '#2a0d0b');
  ctx.fillStyle = lg;
  ctx.fill();
}

// ═══════════════════════════════ CHOIR (eyepiece) ═══════════════════════════════

const E = { cx: 50, cy: 50, r: 38 } as const;

function paintEyepiece(c: Ctx2D, css: number): void {
  const { cx, cy, r } = E;
  // Knurled brass ring: turned metal (conic) with 96 fine knurls whose tops catch the window light.
  c.beginPath();
  c.arc(cx, cy, r + 7, 0, TAU);
  c.arc(cx, cy, r + 2.6, 0, TAU, true);
  c.fillStyle = metal(c, cx, cy, -2.3, '#f6dc96', '#6e4f1c', 6, r + 7);
  c.fill();
  c.save();
  c.beginPath();
  c.arc(cx, cy, r + 7, 0, TAU);
  c.arc(cx, cy, r + 2.6, 0, TAU, true);
  c.clip();
  c.globalCompositeOperation = 'multiply';
  const sh = c.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  sh.addColorStop(0, '#ffffff');
  sh.addColorStop(1, '#8c7a62');
  c.fillStyle = sh;
  c.fillRect(cx - r - 8, cy - r - 8, r * 2 + 16, r * 2 + 16);
  c.globalCompositeOperation = 'source-over';
  c.lineWidth = LINE.fine / css;
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * TAU;
    const lit = Math.max(0, -(Math.cos(a) * KEY_X + Math.sin(a) * KEY_Y));
    c.strokeStyle = i % 2 ? `rgba(40,26,8,0.5)` : `rgba(255,240,200,${0.15 + 0.45 * lit})`;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * (r + 3.4), cy + Math.sin(a) * (r + 3.4));
    c.lineTo(cx + Math.cos(a) * (r + 6.4), cy + Math.sin(a) * (r + 6.4));
    c.stroke();
  }
  c.restore();
  c.strokeStyle = INK;
  c.lineWidth = LINE.contour / css;
  c.beginPath();
  c.arc(cx, cy, r + 7, 0, TAU);
  c.stroke();
  // Smooth inner bevel (polished), the anodised black barrel inside.
  c.beginPath();
  c.arc(cx, cy, r + 2.6, 0, TAU);
  c.arc(cx, cy, r + 0.6, 0, TAU, true);
  c.fillStyle = metal(c, cx, cy, -2.3, '#fff3c8', '#5a3e12', 3, r + 2.6);
  c.fill();
  c.beginPath();
  c.arc(cx, cy, r + 0.6, 0, TAU);
  c.fillStyle = '#0c0b0a';
  c.fill();
  // The lamp's rim on the right of the ring.
  c.strokeStyle = `rgba(${RIM_RGB},0.5)`;
  c.lineWidth = (0.55 * 2) / css;
  c.beginPath();
  c.arc(cx, cy, r + 6.6, -0.6, 0.6);
  c.stroke();
}

function paintEyepieceGlass(c: Ctx2D, css: number): void {
  const { cx, cy, r } = E;
  c.save();
  c.beginPath();
  c.arc(cx, cy, r, 0, TAU);
  c.clip();
  const vg = c.createRadialGradient(cx, cy, r * 0.6, cx, cy, r);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(2,3,8,0.85)');
  c.fillStyle = vg;
  c.fillRect(cx - r, cy - r, r * 2, r * 2);
  // Fresnel: the glass brightens toward its rim; one window reflection, upper left.
  c.strokeStyle = 'rgba(200,225,255,0.18)';
  c.lineWidth = 1.6;
  c.beginPath();
  c.arc(cx, cy, r - 0.8, 0, TAU);
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.28)';
  c.lineWidth = 2.2;
  c.lineCap = 'round';
  c.beginPath();
  c.arc(cx, cy, r - 5, Math.PI * 1.08, Math.PI * 1.36);
  c.stroke();
  c.restore();
  // Reticle with a scale bar (hairlines).
  c.strokeStyle = 'rgba(200,230,255,0.18)';
  c.lineWidth = Math.max(LINE.fine * 0.6, 1 / (css * 2)) / css;
  c.beginPath();
  c.moveTo(cx - r, cy);
  c.lineTo(cx + r, cy);
  c.moveTo(cx, cy - r);
  c.lineTo(cx, cy + r);
  for (let i = -6; i <= 6; i++) {
    c.moveTo(cx + i * 5, cy - (i % 2 ? 1 : 2));
    c.lineTo(cx + i * 5, cy + (i % 2 ? 1 : 2));
  }
  c.stroke();
}

export function drawChoirArt(ctx: Ctx2D, s: CastPose, _t: number, lens: LeniaLens | null): void {
  const { cx, cy, r } = E;
  spot(ctx, cx, cy, 52, 52, 0, '184,146,255', 0.16);
  sprite(ctx, 'eyepiece|ring', 3, 3, 94, 94, paintEyepiece);
  // The view.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.clip();
  const bg = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
  bg.addColorStop(0, '#141c3c');
  bg.addColorStop(1, '#04060c');
  ctx.fillStyle = bg;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  if (lens) {
    const sc = (r * 3) / lens.size;
    const shiftX = cx - lens.cx * sc;
    const shiftY = cy - lens.cy * sc;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const W = lens.size * sc;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) ctx.drawImage(lens.canvas, shiftX + dx * W, shiftY + dy * W, W, W);
  } else {
    spot(ctx, cx, cy, 14, 14, 0, '120,220,255', 0.8);
  }
  for (const age of s.pulses) {
    const k = age / 1.4;
    if (k >= 1) continue;
    ctx.strokeStyle = `rgba(206,186,255,${(1 - k) * 0.9})`;
    ctx.lineWidth = 1.8 * (1 - k) + 0.4;
    ctx.beginPath();
    ctx.arc(cx, cy, 6 + k * 32, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
  sprite(ctx, 'eyepiece|glass', 3, 3, 94, 94, paintEyepieceGlass);
}
