/**
 * Archive photos composited into the night palette (ADR-029, docs/ARTE-REALISTA.md §6.6): a cover crop
 * around a focus point, a slow Ken Burns push-in, a colour grade towards the station's night (cooler,
 * less saturated, darker), sepia for a memory, a vignette and a film grain. Used by the intro scenes, the
 * title screen and the cinematics.
 *
 * A photo is decoration (photos.ts): every caller passes `null` when it has not loaded and draws its
 * vector fallback instead. The grade is done with composite operations only (no ctx.filter: Safari has
 * none) and the grain is the kit's deterministic noise tile, so the same frame looks the same everywhere.
 */
import { grainPattern, type Ctx2D } from '../art/vector';

/** Source rectangle of an image of `iw` × `ih` that covers a `w` × `h` box. */
export interface Crop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * The part of an `iw` × `ih` image that fills a `w` × `h` box without bars ("object-fit: cover"),
 * centred as close to the focus point (`fx`, `fy` in 0..1 of the image) as the image allows, and
 * `zoom` ≥ 1 times closer. Pure, for layout and tests.
 */
export function coverCrop(iw: number, ih: number, w: number, h: number, fx = 0.5, fy = 0.5, zoom = 1): Crop {
  const z = Math.max(1, zoom);
  const s = Math.max(w / Math.max(1, iw), h / Math.max(1, ih)) * z;
  const sw = Math.min(iw, w / s);
  const sh = Math.min(ih, h / s);
  const sx = Math.max(0, Math.min(iw - sw, fx * iw - sw / 2));
  const sy = Math.max(0, Math.min(ih - sh, fy * ih - sh / 2));
  return { sx, sy, sw, sh };
}

/** Where image point (`px`, `py`) lands on screen when `crop` is drawn into the box at (x, y, w, h). */
export function cropToScreen(c: Crop, x: number, y: number, w: number, h: number, px: number, py: number): [number, number] {
  return [x + ((px - c.sx) / c.sw) * w, y + ((py - c.sy) / c.sh) * h];
}

/**
 * Ken Burns zoom at time `t`: from 1 to `to` over `dur` seconds with an ease-out, then still (the
 * bible's 1.04 in 4 s for the station). Reduce motion holds the end framing.
 */
export function kenBurns(t: number, dur: number, to: number, rm: boolean): number {
  if (rm) return to;
  const k = Math.max(0, Math.min(1, t / Math.max(1e-3, dur)));
  return 1 + (to - 1) * (1 - (1 - k) * (1 - k));
}

/** How a photo is pulled into the night palette. */
export interface Grade {
  /** 0..1 of the colour taken out ('saturation' with grey). */
  desat: number;
  /** Multiply tint (the night's blue-teal) and how much of it. */
  tint: string;
  tintA: number;
  /** 0..1 darkening on top. */
  dark: number;
}

/** The station night: a fifth of the colour out, a cold blue multiply, a little darker. */
export const NIGHT_GRADE: Grade = { desat: 0.2, tint: '#8aa3bd', tintA: 0.55, dark: 0.12 };
/** Seen through the lab window (§5.6): the same night, 60 % darker. */
export const WINDOW_GRADE: Grade = { desat: 0.25, tint: '#7f98b3', tintA: 0.6, dark: 0.6 };

/** Draws `img` covering the box with `crop`, then grades it. Clipped to the box. */
export function drawGraded(ctx: Ctx2D, img: CanvasImageSource, c: Crop, x: number, y: number, w: number, h: number, g: Grade): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, x, y, w, h);
  grade(ctx, x, y, w, h, g);
  ctx.restore();
}

/** Grades whatever is under the box (the photo just drawn there). */
export function grade(ctx: Ctx2D, x: number, y: number, w: number, h: number, g: Grade): void {
  ctx.save();
  if (g.desat > 0) {
    ctx.globalCompositeOperation = 'saturation';
    ctx.globalAlpha = Math.min(1, g.desat);
    ctx.fillStyle = '#808080';
    ctx.fillRect(x, y, w, h);
  }
  if (g.tintA > 0) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = Math.min(1, g.tintA);
    ctx.fillStyle = g.tint;
    ctx.fillRect(x, y, w, h);
  }
  if (g.dark > 0) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Math.min(1, g.dark);
    ctx.fillStyle = '#03060a';
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

/**
 * Sepia toning of what is under the box (an old print, Albor's last photo): the colour out, then a warm
 * 'color' wash that keeps the luminance, then a faint fade of the blacks.
 */
export function sepia(ctx: Ctx2D, x: number, y: number, w: number, h: number, k = 1): void {
  ctx.save();
  ctx.globalCompositeOperation = 'saturation';
  ctx.globalAlpha = Math.min(1, k);
  ctx.fillStyle = '#808080';
  ctx.fillRect(x, y, w, h);
  ctx.globalCompositeOperation = 'color';
  ctx.globalAlpha = 0.55 * Math.min(1, k);
  ctx.fillStyle = '#a8743f';
  ctx.fillRect(x, y, w, h);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.1 * Math.min(1, k);
  ctx.fillStyle = '#5a4630';
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/** A lens vignette: the corners of the box `strength` (0..1) darker, centred at (cx, cy) in 0..1 of the box. */
export function vignette(ctx: Ctx2D, x: number, y: number, w: number, h: number, strength: number, cx = 0.5, cy = 0.5): void {
  if (strength <= 0) return;
  const ox = x + w * cx;
  const oy = y + h * cy;
  const r = Math.hypot(Math.max(cx, 1 - cx) * w, Math.max(cy, 1 - cy) * h);
  const g = ctx.createRadialGradient(ox, oy, r * 0.42, ox, oy, r);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.7, `rgba(0,0,0,${(strength * 0.45).toFixed(3)})`);
  g.addColorStop(1, `rgba(0,0,0,${strength.toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/**
 * Film grain over the box: the kit's 64-px noise tile at one tile pixel per device pixel, in 'overlay'
 * at `alpha` (3–8 %). It moves to another offset every 1/12 s (the grain of a film, not a screen
 * door); under Reduce motion it holds still. No allocation per frame (the context moves, not the pattern).
 */
export function filmGrain(ctx: Ctx2D, x: number, y: number, w: number, h: number, dpr: number, t: number, rm: boolean, alpha = 0.05): void {
  const p = grainPattern(ctx);
  if (!p || alpha <= 0) return;
  const d = dpr > 0 ? dpr : 1;
  const step = rm ? 0 : Math.floor(t * 12);
  const ox = (step * 37) % 64;
  const oy = (step * 23) % 64;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p;
  ctx.scale(1 / d, 1 / d);
  ctx.translate(-ox, -oy);
  ctx.fillRect(x * d, y * d, w * d + 64, h * d + 64);
  ctx.restore();
}
