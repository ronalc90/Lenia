/**
 * The night lab of the intro in vector (docs/ARTE-REALISTA.md §6.6, §3): one cold main light from the
 * window at the top left (moon and aurora), VELA's 2700 K lamp warm from the right, the dish's cyan
 * bounce from the bench. Pieces: the sky (stars, an aurora curtain, fine snow), the window with its
 * reveal, aluminium frame, refraction and frost, the black epoxy bench, contact shadows and lamp
 * pools, the petri dish (top-down and in three-quarter view), the pipette tip, the probe cable, and
 * VELA standing on the bench through her kept `drawVelaArt` signature (P1 draws her).
 *
 * Everything is deterministic (hashes and sines), without ctx.filter or shadowBlur, and draws without
 * the archive photo: a window or a sky with `img = null` falls back to the vector night.
 */
import { drawVelaArt, type ArtMood } from '../art/vela';
import { cylinderRamp, hash01, kelvin, type Ctx2D } from '../art/vector';
import { MATERIAL, PLATE, SCREEN } from '../art/tokens';
import { sprite } from '../story/sprites';
import { coverCrop, drawGraded, WINDOW_GRADE } from './photofx';

const TAU = Math.PI * 2;

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (a: number, b: number, x: number): number => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
/** Deterministic hash → [0, 1) of an index and a seed. */
export const hash = (i: number, seed = 0): number => hash01(i * 7919 + seed * 104729 + 13);

const rgb = (c: readonly number[], a: number): string => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

// ───────────────────────────── the sky ─────────────────────────────

/** A night sky gradient from `top` to `bottom` (the horizon glows a little: snow and the aurora's light). */
export function nightSky(ctx: Ctx2D, x: number, y: number, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#03060c');
  g.addColorStop(0.55, '#07101d');
  g.addColorStop(1, '#122236');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/** Fine stars (most 1 px, a few brighter), with a slow scintillation; still under Reduce motion. */
export function stars(ctx: Ctx2D, x: number, y: number, w: number, h: number, t: number, rm: boolean, n = 120, seed = 1): void {
  ctx.save();
  ctx.fillStyle = '#e8eef8';
  for (let i = 0; i < n; i++) {
    const sx = x + hash(i, seed) * w;
    const sy = y + hash(i, seed + 1) ** 1.3 * h;
    const b = hash(i, seed + 2);
    const tw = rm ? 1 : 0.75 + 0.25 * Math.sin(t * (1.1 + b * 2.3) + i * 1.7);
    ctx.globalAlpha = (0.18 + 0.62 * b * b) * tw;
    const s = b > 0.93 ? 1.6 : b > 0.7 ? 1.1 : 0.8;
    ctx.fillRect(sx, sy, s, s);
  }
  ctx.restore();
}

/**
 * An aurora curtain (oxygen green 557.7 nm at the lower edge, a violet fringe higher up): vertical rays
 * whose lower edge folds slowly. One vertical gradient per frame, stretched per ray by the transform.
 */
export function auroraCurtain(ctx: Ctx2D, x: number, y: number, w: number, h: number, t: number, rm: boolean, alpha = 1): void {
  if (alpha <= 0) return;
  const tt = rm ? 3 : t;
  const g = ctx.createLinearGradient(0, 0, 0, 1);
  g.addColorStop(0, 'rgba(150,90,200,0)');
  g.addColorStop(0.35, 'rgba(140,100,210,0.10)');
  g.addColorStop(0.72, 'rgba(70,210,150,0.26)');
  g.addColorStop(0.94, 'rgba(150,250,200,0.5)');
  g.addColorStop(1, 'rgba(90,240,170,0)');
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = g;
  const step = Math.max(1.5, w / 220);
  for (let px = 0; px < w; px += step) {
    const u = px / w;
    // Slow folds of the lower edge; the striation (rays) is in the brightness, not in the edge.
    const edge = 0.64 + 0.13 * Math.sin(u * 4.1 + tt * 0.16) + 0.045 * Math.sin(u * 9.7 - tt * 0.27 + 0.8);
    const len = 0.34 + 0.12 * Math.sin(u * 3.1 - tt * 0.11 + 1.3) + 0.04 * Math.sin(u * 11 + tt * 0.4);
    const ray = (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(u * 8.3 - tt * 0.2))) * (0.62 + 0.38 * hash(Math.floor(px / step), 91));
    const fade = smooth(0, 0.12, u) * smooth(1, 0.82, u);
    const a = alpha * ray * fade * (0.55 + 0.45 * Math.sin(u * 2.1 + 0.6));
    if (a < 0.02) continue;
    ctx.globalAlpha = Math.min(1, a);
    const top = y + h * (edge - len);
    ctx.save();
    ctx.translate(x + px, top);
    ctx.scale(1, h * len + h * 0.03);
    ctx.fillRect(0, 0, step + 0.6, 1);
    ctx.restore();
  }
  ctx.restore();
}

/** Fine snow: 1-px flakes drifting down and with the wind (`wind` px/s), the near ones a little bigger. */
export function snowfall(ctx: Ctx2D, x: number, y: number, w: number, h: number, t: number, rm: boolean, n = 90, wind = -8, seed = 3, scale = 1): void {
  ctx.save();
  ctx.fillStyle = '#e9f1f8';
  for (let i = 0; i < n; i++) {
    const near = hash(i, seed + 4);
    const sp = (14 + near * 26) * scale;
    const ph = hash(i, seed) * (h + 8);
    const fy = rm ? ph : (ph + t * sp) % (h + 8);
    const sway = rm ? 0 : Math.sin(t * (0.6 + near) + i) * 3 * scale;
    let fx = (hash(i, seed + 1) * w + (rm ? 0 : t * wind * (0.6 + near)) + sway) % w;
    if (fx < 0) fx += w;
    const s = (near > 0.85 ? 1.6 : 1) * scale;
    ctx.globalAlpha = 0.25 + 0.55 * near;
    ctx.fillRect(x + fx, y + fy - 4, s, s);
  }
  ctx.restore();
}

// ───────────────────────────── the room ─────────────────────────────

/** The lab wall at night: almost black (#06090d), with faint panel seams. */
export function labWall(ctx: Ctx2D, w: number, h: number, seamEvery: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#05070b');
  g.addColorStop(1, '#0a0e13');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(160,185,210,0.035)';
  for (let x = seamEvery * 0.7; x < w; x += seamEvery) ctx.fillRect(Math.round(x), 0, 1, h);
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The glass panes of a window `r` (frame 4 u, mullions 2.6 u): pure, so a frame can find them again. */
export function windowPanes(r: Rect, u: number, panes: number): Rect[] {
  const f = Math.max(3, 4 * u);
  const mull = Math.max(2, 2.6 * u);
  const gw = r.w - 2 * f;
  const n = Math.max(1, Math.round(panes));
  const pw = (gw - mull * (n - 1)) / n;
  const out: Rect[] = [];
  for (let i = 0; i < n; i++) out.push({ x: r.x + f + i * (pw + mull), y: r.y + f, w: pw, h: r.h - 2 * f });
  return out;
}

/**
 * The lab window (main cold light, §6.6): a deep reveal in the insulated wall, an anodised frame with
 * `panes` panes, the night outside (the archive photo through `WINDOW_GRADE`, refracted 3 % per pane,
 * or the vector sky without it), frost in the lower corners and the room's faint reflection.
 */
export function labWindow(ctx: Ctx2D, r: Rect, u: number, img: CanvasImageSource | null, iw: number, ih: number, panes: number, t: number, rm: boolean): Rect[] {
  const d = 7 * u;
  const f = Math.max(3, 4 * u);
  // Light spilling from the window onto the wall around it.
  const sg = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) * 0.3, r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) * 1.1);
  sg.addColorStop(0, 'rgba(110,150,190,0.07)');
  sg.addColorStop(1, 'rgba(110,150,190,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(r.x - r.w, r.y - r.h, r.w * 3, r.h * 3);
  // The reveal: four bevelled sides of the opening, the sill catching the moonlight.
  const ox = r.x - d;
  const oy = r.y - d;
  const ow = r.w + 2 * d;
  const oh = r.h + 2 * d;
  const side = (pts: number[], fill: string) => {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  side([ox, oy, ox + ow, oy, r.x + r.w, r.y, r.x, r.y], '#0b1016');
  side([ox, oy, r.x, r.y, r.x, r.y + r.h, ox, oy + oh], '#0e141b');
  side([ox + ow, oy, ox + ow, oy + oh, r.x + r.w, r.y + r.h, r.x + r.w, r.y], '#070a0e');
  side([ox, oy + oh, r.x, r.y + r.h, r.x + r.w, r.y + r.h, ox + ow, oy + oh], '#1a2531');
  ctx.fillStyle = 'rgba(200,220,240,0.22)';
  ctx.fillRect(ox, oy + oh - 1, ow, 1);
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 1.25;
  ctx.strokeRect(ox + 0.5, oy + 0.5, ow - 1, oh - 1);
  // The glass and what is outside.
  const gx = r.x + f;
  const gy = r.y + f;
  const gw = r.w - 2 * f;
  const gh = r.h - 2 * f;
  const paneRects = windowPanes(r, u, panes);
  ctx.fillStyle = MATERIAL.anod[3];
  ctx.fillRect(r.x, r.y, r.w, r.h);
  paneRects.forEach((p, i) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x, p.y, p.w, p.h);
    ctx.clip();
    if (img) {
      // Each pane bends the view a little differently (R7: shifted and scaled 2–4 %).
      const k = 1.03 + 0.01 * i;
      const c = coverCrop(iw, ih, gw, gh, 0.42, 0.55, k);
      const ex = (i - (panes - 1) / 2) * 2 * u;
      drawGraded(ctx, img, c, gx - ex, gy - 1.5 * u * i, gw, gh, WINDOW_GRADE);
    } else {
      nightSky(ctx, gx, gy, gw, gh);
      stars(ctx, gx, gy, gw, gh * 0.8, t, rm, Math.round((gw * gh) / 900), 11);
      auroraCurtain(ctx, gx, gy, gw, gh * 0.85, t, rm, 0.7);
      // The snow plain and a far ridge.
      const hy = gy + gh * 0.8;
      const sn = ctx.createLinearGradient(0, hy, 0, gy + gh);
      sn.addColorStop(0, '#2a3a4c');
      sn.addColorStop(1, '#141d28');
      ctx.fillStyle = sn;
      ctx.fillRect(gx, hy, gw, gy + gh - hy);
      ctx.fillStyle = '#0d141d';
      ctx.beginPath();
      ctx.moveTo(gx, hy);
      for (let j = 0; j <= 10; j++) ctx.lineTo(gx + (gw * j) / 10, hy - (2 + hash(j, 21) * 7) * u);
      ctx.lineTo(gx + gw, hy);
      ctx.closePath();
      ctx.fill();
    }
    // Frost creeping up from the lower corners.
    for (const cx of [p.x, p.x + p.w]) {
      const fg = ctx.createRadialGradient(cx, p.y + p.h, 0, cx, p.y + p.h, Math.min(p.w, p.h) * 0.45);
      fg.addColorStop(0, 'rgba(210,228,242,0.28)');
      fg.addColorStop(0.6, 'rgba(210,228,242,0.08)');
      fg.addColorStop(1, 'rgba(210,228,242,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(p.x, p.y, p.w, p.h);
    }
    // The room in the glass: one soft diagonal band (the only specular of the pane, facing the room light).
    ctx.globalCompositeOperation = 'screen';
    const rg = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
    rg.addColorStop(0, 'rgba(255,255,255,0)');
    rg.addColorStop(0.32, 'rgba(255,255,255,0.05)');
    rg.addColorStop(0.36, 'rgba(255,255,255,0.015)');
    rg.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.restore();
  });
  // The frame: anodised aluminium, lit from the room side on top (layer 5), darker below.
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  for (const p of paneRects) ctx.rect(p.x + p.w, p.y, -p.w, p.h);
  const fg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  fg.addColorStop(0, MATERIAL.anod[0]);
  fg.addColorStop(0.08, MATERIAL.anod[1]);
  fg.addColorStop(0.55, MATERIAL.anod[2]);
  fg.addColorStop(1, MATERIAL.anod[3]);
  ctx.fillStyle = fg;
  ctx.fill('evenodd');
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(r.x + 1, r.y + 0.5, r.w - 2, 0.75);
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 0.75;
  for (const p of paneRects) ctx.strokeRect(p.x + 0.375, p.y + 0.375, p.w - 0.75, p.h - 0.75);
  ctx.lineWidth = 1.25;
  ctx.strokeRect(r.x + 0.625, r.y + 0.625, r.w - 1.25, r.h - 1.25);
  return paneRects;
}

/** Snow falling outside, drawn into the panes (the dynamic part of the window). */
export function windowSnow(ctx: Ctx2D, panes: readonly Rect[], t: number, rm: boolean, n = 40): void {
  if (!panes.length) return;
  const x0 = panes[0].x;
  const last = panes[panes.length - 1];
  const w = last.x + last.w - x0;
  ctx.save();
  ctx.beginPath();
  for (const p of panes) ctx.rect(p.x, p.y, p.w, p.h);
  ctx.clip();
  snowfall(ctx, x0, panes[0].y, w, panes[0].h, t, rm, n, -10, 17, 0.8);
  ctx.restore();
}

/**
 * The bench: black matte epoxy resin (`#15191c → #0d1012`), its back lip catching the window light,
 * a cold sheen under the window and a fine grain.
 */
export function bench(ctx: Ctx2D, w: number, h: number, y: number, win: Rect | null): void {
  const g = ctx.createLinearGradient(0, y, 0, h);
  g.addColorStop(0, '#15191c');
  g.addColorStop(1, '#0b0e10');
  ctx.fillStyle = g;
  ctx.fillRect(0, y, w, h - y);
  // Where the wall meets the bench: a dark joint and the lit edge of the lip.
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, y - 1, w, 1.5);
  ctx.fillStyle = 'rgba(190,210,228,0.10)';
  ctx.fillRect(0, y + 1, w, 1);
  if (win) {
    // The window's light lying on the bench (a soft trapezoid, layer 4 of the room).
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const lg = ctx.createLinearGradient(0, y, 0, h);
    lg.addColorStop(0, 'rgba(130,165,200,0.10)');
    lg.addColorStop(1, 'rgba(130,165,200,0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(win.x, y);
    ctx.lineTo(win.x + win.w, y);
    ctx.lineTo(win.x + win.w * 1.5, h);
    ctx.lineTo(win.x + win.w * 0.2, h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** A contact shadow: a radial ellipse rgba(0,0,0,0.55) → 0 under an object resting at (x, y). */
export function contactShadow(ctx: Ctx2D, x: number, y: number, rx: number, ry: number, a = 0.55): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, Math.max(0.05, ry / Math.max(1e-3, rx)));
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(0,0,0,${a})`);
  g.addColorStop(0.6, `rgba(0,0,0,${(a * 0.45).toFixed(3)})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** A pool of light on a surface or a wall (`screen`): an ellipse of `color` at alpha `a`. */
export function lightPool(ctx: Ctx2D, x: number, y: number, rx: number, ry: number, color: readonly number[], a: number): void {
  if (a <= 0.003 || rx <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.translate(x, y);
  ctx.scale(1, Math.max(0.05, ry / rx));
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, rgb(color, a));
  g.addColorStop(0.5, rgb(color, a * 0.4));
  g.addColorStop(1, rgb(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Darkness over the whole picture except around a light: the room before (and while) a lamp warms up. */
export function darkness(ctx: Ctx2D, w: number, h: number, x: number, y: number, r: number, a: number): void {
  if (a <= 0.003) return;
  const g = ctx.createRadialGradient(x, y, r * 0.12, x, y, Math.max(r, 1));
  g.addColorStop(0, `rgba(2,3,6,${(a * 0.15).toFixed(3)})`);
  g.addColorStop(1, `rgba(2,3,6,${a.toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// ───────────────────────────── VELA on the bench ─────────────────────────────

/** VELA's box (§4.2): the chassis is `rr(8, 14, 84, 74)`, the feet end at y 90.2, the lamp is at (77, 31). */
const VELA_CHASSIS_W = 84;
const VELA_FOOT_Y = 90.2;
const VELA_LAMP: readonly [number, number] = [77, 31];
/** Where the probe cable meets the bench in the box (its path `…C97.4 89 99 94 104 100`, §4.2). */
const VELA_CABLE_FOOT: readonly [number, number] = [97.6, 90];

/** The lamp's colour temperature and brightness per state (§4.5); sleepy breathes at 0.2 Hz (L9). */
const LAMP_STATE: Record<ArtMood, { K: number; b: number }> = {
  neutral: { K: 2700, b: 0.62 },
  happy: { K: 3200, b: 0.9 },
  worried: { K: 2200, b: 0.45 },
  awed: { K: 3600, b: 1 },
  sleepy: { K: 2400, b: 0.25 },
  proud: { K: 3200, b: 0.85 },
};

export function lampState(mood: ArtMood, t: number, rm: boolean): { K: number; b: number } {
  const s = LAMP_STATE[mood] ?? LAMP_STATE.neutral;
  if (mood === 'sleepy' && !rm) return { K: s.K, b: 0.08 + 0.37 * (0.5 + 0.5 * Math.sin(t * TAU * 0.2)) };
  return s;
}

export interface VelaSpot {
  /** Centre of the chassis and the line her feet stand on. */
  cx: number;
  foot: number;
  /** Pixels per box unit. */
  k: number;
}

/** Places VELA so her chassis is `width` px wide, centred at `cx`, standing on `foot`. */
export function velaSpot(cx: number, foot: number, width: number): VelaSpot {
  return { cx, foot, k: width / VELA_CHASSIS_W };
}

export function velaLampAt(v: VelaSpot): [number, number] {
  return [v.cx + (VELA_LAMP[0] - 50) * v.k, v.foot - (VELA_FOOT_Y - VELA_LAMP[1]) * v.k];
}

export function velaCableAt(v: VelaSpot): [number, number] {
  return [v.cx + (VELA_CABLE_FOOT[0] - 50) * v.k, v.foot + (VELA_CABLE_FOOT[1] - VELA_FOOT_Y) * v.k];
}

/**
 * VELA on the bench with what her lamp does to the room (§4.9): the contact shadow under her, the warm
 * pool her lamp throws on the bench (`screen`, 2700 K, 0.10–0.18 × brightness) and a glow on the wall.
 * Then she is drawn by P1's `drawVelaArt` (signature kept, §7.1).
 */
export function velaOnBench(
  ctx: CanvasRenderingContext2D,
  v: VelaSpot,
  mood: ArtMood,
  moodAge: number,
  t: number,
  rm: boolean,
  lit = 1,
  wear: readonly string[] = [],
): void {
  const { K, b } = lampState(mood, t, rm);
  const warm = kelvin(K);
  const [lx, ly] = velaLampAt(v);
  lightPool(ctx, lx, ly, 120 * v.k, 120 * v.k, warm, 0.09 * b * lit);
  contactShadow(ctx, v.cx, v.foot + 0.5 * v.k, 47 * v.k, 4.5 * v.k, 0.6);
  lightPool(ctx, v.cx + 22 * v.k, v.foot + 9 * v.k, 70 * v.k, 13 * v.k, warm, (0.1 + 0.08 * b) * b * lit);
  ctx.save();
  ctx.translate(v.cx - 50 * v.k, v.foot - VELA_FOOT_Y * v.k);
  ctx.scale(v.k, v.k);
  drawVelaArt(ctx, { mood, moodAge, talk: 0, talking: false, blink: 0, reduceMotion: rm, wear }, t);
  ctx.restore();
}

/** The probe cable (black silicone, one long highlight) lying on the bench from (x0, y0) to (x1, y1). */
export function probeCable(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number, sag: number, width: number): void {
  const mx = (x0 + x1) / 2;
  const my = Math.max(y0, y1) + sag;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(mx, my, x1, y1);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = width * 1.8;
  ctx.stroke();
  ctx.strokeStyle = MATERIAL.rubber[1];
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = Math.max(0.5, width * 0.18);
  ctx.beginPath();
  ctx.moveTo(x0, y0 - width * 0.25);
  ctx.quadraticCurveTo(mx, my - width * 0.3, x1, y1 - width * 0.25);
  ctx.stroke();
  ctx.restore();
}

// ───────────────────────────── the dish ─────────────────────────────

export interface Specimen {
  code: string;
  /** Position in the agar, in units of the agar radius (−1..1). */
  x: number;
  y: number;
  /** Drawn size in units of the agar radius. */
  size: number;
  rot: number;
  alpha: number;
}

/** A real catalog creature at (x, y), `px` wide (its glow is baked into the sprite). Nothing without a DOM. */
export function creature(ctx: Ctx2D, code: string, x: number, y: number, px: number, rot: number, alpha = 1): void {
  if (alpha <= 0.01 || px <= 1) return;
  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = sprite(code, 96).canvas;
  } catch {
    canvas = null;
  }
  if (!canvas) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.drawImage(canvas, -px / 2, -px / 2, px, px);
  ctx.restore();
}

/**
 * A 90-mm petri dish seen from above, resting on the bench (light from the top left): its contact
 * shadow, the cyan bounce it throws, the night agar with a meniscus, the glass wall as a ring
 * (inner and outer edge in `detail`), one specular arc facing the window and the lamp's warm rim on
 * the right. `inside` draws the culture in the agar (clipped).
 */
export function dishTop(ctx: Ctx2D, x: number, y: number, r: number, glowK: number, inside?: (c: Ctx2D) => void, warm = 0.6): void {
  const wall = Math.max(2, r * 0.045);
  contactShadow(ctx, x + r * 0.05, y + r * 0.08, r * 1.12, r * 1.08, 0.55);
  lightPool(ctx, x, y, r * 1.6, r * 1.6, [91, 192, 235], 0.12 * glowK);
  // Agar.
  const ag = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.05, x, y, r);
  ag.addColorStop(0, '#0e2134');
  ag.addColorStop(0.8, '#081524');
  ag.addColorStop(1, '#0c1d2f');
  ctx.fillStyle = ag;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  if (inside) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r - wall * 0.5, 0, TAU);
    ctx.clip();
    inside(ctx);
    ctx.restore();
  }
  // Meniscus: the agar climbs the wall and catches light.
  ctx.strokeStyle = 'rgba(160,205,235,0.14)';
  ctx.lineWidth = wall * 0.8;
  ctx.beginPath();
  ctx.arc(x, y, r - wall * 0.4, 0, TAU);
  ctx.stroke();
  // The glass wall: a translucent ring with both edges sharp (two materials meet there).
  ctx.beginPath();
  ctx.arc(x, y, r + wall, 0, TAU);
  ctx.arc(x, y, r, 0, TAU, true);
  ctx.fillStyle = 'rgba(205,225,240,0.16)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(225,238,248,0.7)';
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(8,14,20,0.85)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(x, y, r + wall, 0, TAU);
  ctx.stroke();
  // One specular arc facing the window (top left) and the lamp's warm rim light on the other side.
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(1, wall * 0.5);
  ctx.beginPath();
  ctx.arc(x, y, r + wall * 0.5, Math.PI * 1.08, Math.PI * 1.38);
  ctx.stroke();
  if (warm > 0) {
    const lamp = kelvin(2700);
    ctx.strokeStyle = rgb(lamp, 0.45 * warm);
    ctx.lineWidth = Math.max(0.75, wall * 0.35);
    ctx.beginPath();
    ctx.arc(x, y, r + wall * 0.5, -0.45, 0.35);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

/**
 * The dish in three-quarter view on the bench (`tilt` = minor / major axis, the view's elevation):
 * contact shadow, the cyan light it throws up, the glass base with its wall, the agar with the culture
 * (drawn by `inside` in flat agar coordinates: a circle of radius `rx` around 0, foreshortened for you),
 * the front lip with one specular and the warm rim light of the lamp on the right.
 */
export function dish3q(ctx: Ctx2D, cx: number, cy: number, rx: number, tilt: number, glowK: number, inside?: (c: Ctx2D, r: number) => void, warm = 0.7): void {
  const ry = rx * tilt;
  // A 90-mm base is ~13 mm tall: 0.13 of the radius, seen at the view's elevation.
  const wallH = dishWallH(rx, tilt);
  const agarY = cy + wallH * 0.4;
  contactShadow(ctx, cx + rx * 0.05, cy + wallH + ry * 0.08, rx * 1.08, ry * 1.12, 0.5);
  lightPool(ctx, cx, cy - ry * 0.5, rx * 1.5, rx * 1.1, [91, 192, 235], 0.12 * glowK);
  // Back wall of the glass (seen through the dish).
  ctx.strokeStyle = 'rgba(200,222,240,0.28)';
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, TAU);
  ctx.stroke();
  // The agar's side, seen through the clear front wall: the gel column, lit from inside by the culture.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, agarY, rx * 0.985, ry * 0.985, 0, 0, Math.PI);
  ctx.lineTo(cx - rx * 0.985, cy + wallH * 0.92);
  ctx.ellipse(cx, cy + wallH * 0.92, rx * 0.985, ry * 0.985, 0, Math.PI, 0, true);
  ctx.closePath();
  const gs = ctx.createLinearGradient(0, agarY + ry, 0, cy + wallH + ry);
  gs.addColorStop(0, `rgba(60,140,190,${(0.22 + 0.18 * glowK).toFixed(3)})`);
  gs.addColorStop(1, 'rgba(14,34,52,0.9)');
  ctx.fillStyle = gs;
  ctx.fill();
  ctx.restore();
  // The agar surface.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, agarY, rx * 0.985, ry * 0.985, 0, 0, TAU);
  const ag = ctx.createLinearGradient(0, agarY - ry, 0, agarY + ry);
  ag.addColorStop(0, '#0b1a2b');
  ag.addColorStop(1, '#10263c');
  ctx.fillStyle = ag;
  ctx.fill();
  ctx.clip();
  if (inside) {
    ctx.save();
    ctx.translate(cx, agarY);
    ctx.scale(1, tilt);
    inside(ctx, rx);
    ctx.restore();
  }
  ctx.restore();
  // Meniscus at the front edge of the agar: a thin bright line where the gel climbs the glass.
  ctx.strokeStyle = 'rgba(170,215,240,0.35)';
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.ellipse(cx, agarY, rx * 0.985, ry * 0.985, 0, 0.05, Math.PI - 0.05);
  ctx.stroke();
  // The glass side wall in front: clear, brighter at the silhouette (Fresnel, R2).
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
  ctx.lineTo(cx - rx, cy + wallH);
  ctx.ellipse(cx, cy + wallH, rx, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  const sg = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
  sg.addColorStop(0, 'rgba(200,222,240,0.30)');
  sg.addColorStop(0.06, 'rgba(200,222,240,0.06)');
  sg.addColorStop(0.92, 'rgba(200,222,240,0.04)');
  sg.addColorStop(1, 'rgba(200,222,240,0.24)');
  ctx.fillStyle = sg;
  ctx.fill();
  ctx.restore();
  // Edges: the rim (top ellipse) and the foot, sharp where glass meets air and bench.
  ctx.strokeStyle = 'rgba(225,238,248,0.62)';
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(8,14,20,0.85)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.ellipse(cx, cy + wallH, rx, ry, 0, 0.02, Math.PI - 0.02);
  ctx.moveTo(cx - rx, cy);
  ctx.lineTo(cx - rx, cy + wallH);
  ctx.moveTo(cx + rx, cy);
  ctx.lineTo(cx + rx, cy + wallH);
  ctx.stroke();
  // One specular (the window, top left) along the rim and the lamp's warm rim on the right.
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = Math.max(1, rx * 0.012);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.995, ry * 0.995, 0, Math.PI * 1.06, Math.PI * 1.3);
  ctx.stroke();
  if (warm > 0) {
    const lamp = kelvin(2700);
    ctx.strokeStyle = rgb(lamp, 0.5 * warm);
    ctx.lineWidth = Math.max(0.75, rx * 0.008);
    ctx.beginPath();
    ctx.ellipse(cx, cy + wallH * 0.5, rx, ry, 0, -0.5, 0.25);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + rx - 0.5, cy);
    ctx.lineTo(cx + rx - 0.5, cy + wallH);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

/** Height on screen of the dish's glass wall for a dish of major radius `rx` at `tilt`. */
export function dishWallH(rx: number, tilt: number): number {
  return rx * 0.13 * Math.sqrt(1 - tilt * tilt);
}

/** Specimens drawn into a dish's agar (flat coordinates, radius `r`). */
export function culture(c: Ctx2D, r: number, list: readonly Specimen[]): void {
  for (const s of list) creature(c, s.code, s.x * r, s.y * r, s.size * r, s.rot, s.alpha);
}

/**
 * A pipette tip (clear polypropylene, the cone of a P200 tip) pointing down at (x, y), `len` px long,
 * holding a little culture medium; the drop it lets go is drawn by the caller.
 */
export function pipetteTip(ctx: Ctx2D, x: number, y: number, len: number, fill = 0.4): void {
  const w0 = len * 0.03;
  const w1 = len * 0.13;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - w0, y);
  ctx.lineTo(x - w1, y - len * 0.86);
  ctx.lineTo(x - w1 * 1.18, y - len * 0.9);
  ctx.lineTo(x - w1 * 1.18, y - len);
  ctx.lineTo(x + w1 * 1.18, y - len);
  ctx.lineTo(x + w1 * 1.18, y - len * 0.9);
  ctx.lineTo(x + w1, y - len * 0.86);
  ctx.lineTo(x + w0, y);
  ctx.closePath();
  const g = ctx.createLinearGradient(x - w1, 0, x + w1, 0);
  g.addColorStop(0, 'rgba(210,228,240,0.30)');
  g.addColorStop(0.28, 'rgba(255,255,255,0.42)');
  g.addColorStop(0.5, 'rgba(200,220,235,0.12)');
  g.addColorStop(0.82, 'rgba(160,210,235,0.18)');
  g.addColorStop(1, 'rgba(210,228,240,0.30)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // The medium inside, near the tip (a meniscus line on top).
  const top = y - len * 0.86 * fill;
  ctx.fillStyle = 'rgba(110,200,235,0.45)';
  ctx.fillRect(x - w1, top, w1 * 2, y - top);
  ctx.fillStyle = 'rgba(220,245,255,0.6)';
  ctx.fillRect(x - w1, top, w1 * 2, 0.75);
  ctx.restore();
  ctx.strokeStyle = 'rgba(225,238,248,0.55)';
  ctx.lineWidth = 0.75;
  ctx.stroke();
  ctx.restore();
}

/** A drop of medium in flight: a clear sphere with its highlight (top left) and the dish's cyan below. */
export function mediumDrop(ctx: Ctx2D, x: number, y: number, r: number, a = 1): void {
  if (a <= 0.01 || r <= 0.2) return;
  ctx.save();
  ctx.globalAlpha = a;
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, 'rgba(240,250,255,0.95)');
  g.addColorStop(0.4, 'rgba(150,215,240,0.55)');
  g.addColorStop(1, 'rgba(91,192,235,0.35)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.92, r * 1.06, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(225,240,250,0.6)';
  ctx.lineWidth = 0.75;
  ctx.stroke();
  ctx.restore();
}

// ───────────────────────────── plates (láminas, §6.5) ─────────────────────────────

/** Plate ink on the night paper (scenes are always night, GDD §14). */
export const INK_ON_PLATE = PLATE.dark;
export const TEAL = SCREEN.teal.body;

/**
 * The night paper of a plate with registration marks (hair, 6 px) in the corners; the top ones sit at
 * `top`, under the intro's progress dots.
 */
export function plateSheet(ctx: Ctx2D, w: number, h: number, dpr: number, margin: number, top = margin): void {
  ctx.fillStyle = PLATE.dark.paper;
  ctx.fillRect(0, 0, w, h);
  const hair = 1 / Math.max(1, dpr);
  ctx.fillStyle = PLATE.dark.ink2;
  ctx.globalAlpha = 0.7;
  const m = margin;
  for (const [cx, cy, sx, sy] of [
    [m, top, 1, 1],
    [w - m, top, -1, 1],
    [m, h - m, 1, -1],
    [w - m, h - m, -1, -1],
  ] as const) {
    ctx.fillRect(cx - (sx < 0 ? 6 : 0), cy, 6, hair * sy);
    ctx.fillRect(cx, cy - (sy < 0 ? 6 : 0), hair * sx, 6);
  }
  ctx.globalAlpha = 1;
}

/** Plate text: Inter for labels and figures, JetBrains Mono (upper case, tracked by hand) for instruments. */
export function plateText(ctx: Ctx2D, text: string, x: number, y: number, size: number, opts: { mono?: boolean; weight?: number; color?: string; align?: CanvasTextAlign; italic?: boolean; track?: number } = {}): number {
  const fam = opts.mono ? "'JetBrains Mono', ui-monospace, Menlo, monospace" : opts.italic ? "Fraunces, Georgia, serif" : 'Inter, system-ui, sans-serif';
  ctx.font = `${opts.italic ? 'italic ' : ''}${opts.weight ?? 600} ${size}px ${fam}`;
  ctx.fillStyle = opts.color ?? PLATE.dark.ink;
  ctx.textBaseline = 'alphabetic';
  const track = (opts.track ?? 0) * size;
  if (!track) {
    ctx.textAlign = opts.align ?? 'left';
    ctx.fillText(text, x, y);
    return ctx.measureText(text).width;
  }
  // Tracked by hand, character by character (ctx.letterSpacing is not everywhere, §8).
  let total = 0;
  for (const ch of text) total += ctx.measureText(ch).width + track;
  total -= track;
  let px = opts.align === 'center' ? x - total / 2 : opts.align === 'right' ? x - total : x;
  ctx.textAlign = 'left';
  for (const ch of text) {
    ctx.fillText(ch, px, y);
    px += ctx.measureText(ch).width + track;
  }
  return total;
}

/** A leader line (1 px) from a label at (x0, y0) to a feature at (x1, y1), with its 2.5-px dot on the feature. */
export function leader(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number, color: string = PLATE.dark.ink2): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x1, y1, 2.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** A scale bar (§6.5 rule 4): a 3-px bar with end ticks and its length, bottom-left of a panel. */
export function scaleBar(ctx: Ctx2D, x: number, y: number, len: number, label: string): void {
  ctx.fillStyle = PLATE.dark.ink;
  ctx.fillRect(x, y - 3, len, 3);
  ctx.fillRect(x, y - 7, 1, 7);
  ctx.fillRect(x + len - 1, y - 7, 1, 7);
  plateText(ctx, label, x + len + 8, y, 13, { weight: 600 });
}

/** A panel label: a, b, c in Inter 700, lower case, upright (F1). */
export function panelLabel(ctx: Ctx2D, ch: string, x: number, y: number): void {
  plateText(ctx, ch, x, y, 14, { weight: 700 });
}

/** A thin technical arrow (1 px with an open 6-px head), for a direction in a plate (§6.5 rule 3). */
export function techArrow(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number, color: string = PLATE.dark.ink2): void {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.moveTo(x1 - 6 * Math.cos(a - 0.45), y1 - 6 * Math.sin(a - 0.45));
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1 - 6 * Math.cos(a + 0.45), y1 - 6 * Math.sin(a + 0.45));
  ctx.stroke();
  ctx.restore();
}

/** A verdict mark: a thin check (it lives) or a cross (it fades) in a 1.25-px circle; the shape carries it. */
export function verdict(ctx: Ctx2D, x: number, y: number, r: number, ok: boolean, a = 1): void {
  if (a <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = a;
  const c = ok ? TEAL : PLATE.dark.ink2;
  ctx.strokeStyle = c;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 1.75;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (ok) {
    ctx.moveTo(x - r * 0.45, y + r * 0.02);
    ctx.lineTo(x - r * 0.12, y + r * 0.36);
    ctx.lineTo(x + r * 0.48, y - r * 0.34);
  } else {
    ctx.moveTo(x - r * 0.34, y - r * 0.34);
    ctx.lineTo(x + r * 0.34, y + r * 0.34);
    ctx.moveTo(x + r * 0.34, y - r * 0.34);
    ctx.lineTo(x - r * 0.34, y + r * 0.34);
  }
  ctx.stroke();
  ctx.restore();
}

/** Chrome cylinder ramp, re-exported for the scene props (handles, hooks, keys). */
export { cylinderRamp };
