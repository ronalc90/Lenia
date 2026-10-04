/**
 * The intro's illustrations (docs/STORY.md §11, docs/ARTE.md §6.6): one Canvas 2D painter per
 * panel, animated, deterministic (hashes and sines, never Math.random). Every painter fills any
 * rectangle: layout is computed from the canvas size (u = one design unit, 300 u ≈ the short side),
 * so the same scene works on a phone (portrait) and a laptop (landscape).
 *
 * Under Reduce motion the painters receive a fixed "hero" time: each panel shows its finished
 * state (candle lit, creature born, Datos counted) and nothing loops.
 *
 * The scenes are always night (GDD §14: the dish and cinematics stay night in both themes).
 * Creatures are real catalog patterns (ui/story/sprites), never drawn fakes (pillar 1).
 */
import { ALBOR, drawCassette, drawDoctorAt, drawDoctorBust, drawLantern, playerSpec, type DoctorPose, type PlayerLookId } from '../art/characters';
import { ROUTE_COLOR } from '../art/tokens';
import { drawVelaArt, glow, twinkle, type ArtMood } from '../art/vela';
import { WORLD_HUE, WORLD_ART_IDS } from '../art/worlds';
import { sprite } from '../story/sprites';
import type { IntroSceneId } from '../../story/introScript';

const TAU = Math.PI * 2;

export interface SceneEnv {
  w: number;
  h: number;
  /** Seconds since the panel appeared (a fixed hero time under Reduce motion). */
  t: number;
  rm: boolean;
  look: PlayerLookId;
}

type Painter = (ctx: CanvasRenderingContext2D, e: SceneEnv) => void;

/** Seconds at which each panel's animation reaches its finished, still-worthy state. */
export const HERO_TIME: Record<IntroSceneId, number> = {
  station: 3.2,
  tape: 2.4,
  arrive: 3.4,
  candle: 3.6,
  dish: 2.6,
  sow: 2.5,
  essence: 2.2,
  clock: 3.9,
  tree: 4.2,
  go: 2.6,
};

// ───────────────────────────── helpers ─────────────────────────────

/** Deterministic hash → [0, 1). */
function hash(i: number, seed = 0): number {
  let x = (i * 374761393 + seed * 668265263) | 0;
  x = (x ^ (x >>> 13)) * 1274126177;
  x = x ^ (x >>> 16);
  return (x >>> 0) / 4294967296;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const easeOutBack = (x: number) => {
  const c = 1.70158;
  const k = clamp01(x) - 1;
  return 1 + (c + 1) * k * k * k + c * k * k;
};

function unit(e: SceneEnv): number {
  return Math.min(e.w, e.h * 1.15) / 300;
}

function pose(mood: DoctorPose['mood'], e: SceneEnv, extra: Partial<DoctorPose> = {}): DoctorPose {
  // Blink every ~3.7 s for 0.14 s (deterministic).
  const ph = (e.t + 1.3) % 3.7;
  const blink = e.rm ? 0 : ph < 0.07 ? ph / 0.07 : ph < 0.14 ? 1 - (ph - 0.07) / 0.07 : 0;
  return { mood, moodAge: 10, talk: 0, talking: false, blink, reduceMotion: e.rm, ...extra };
}

/** VELA standing with the bottom of her flask at (x, y), `hgt` pixels tall. */
function vela(ctx: CanvasRenderingContext2D, x: number, y: number, hgt: number, mood: ArtMood, e: SceneEnv, moodAge = 10, wear: string[] = []): void {
  const k = hgt / 84;
  ctx.save();
  ctx.translate(x - 50 * k, y - 97 * k);
  ctx.scale(k, k);
  const ph = (e.t + 0.4) % 4.3;
  const blink = e.rm ? 0 : ph < 0.08 ? ph / 0.08 : ph < 0.16 ? 1 - (ph - 0.08) / 0.08 : 0;
  drawVelaArt(ctx, { mood, moodAge, talk: 0, talking: false, blink, reduceMotion: e.rm, wear }, e.t);
  ctx.restore();
}

function stars(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, rm: boolean, n = 90): void {
  for (let i = 0; i < n; i++) {
    const x = hash(i, 1) * w;
    const y = hash(i, 2) * h;
    const r = 0.5 + hash(i, 3) * 1.3;
    const tw = rm ? 0.8 : 0.55 + 0.45 * Math.sin(t * (0.8 + hash(i, 4) * 2) + i);
    ctx.fillStyle = `rgba(230,240,255,${0.35 + 0.5 * tw * hash(i, 5)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    if (r > 1.6 && i % 3 === 0) twinkle(ctx, x, y, r * 3.2, '#e6f0ff', 0.4 * tw);
  }
}

function aurora(ctx: CanvasRenderingContext2D, w: number, top: number, hgt: number, t: number, rm: boolean, alpha = 1): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const tt = rm ? 2 : t;
  const bands: [string, number, number][] = [
    ['94,230,200', 0, 1],
    ['91,192,235', 1.7, 0.7],
    ['184,146,255', 3.1, 0.45],
  ];
  for (const [rgb, ph, a] of bands) {
    for (let x = -4; x < w + 4; x += 3) {
      const y = top + hgt * (0.35 + 0.22 * Math.sin(x / (w * 0.22) + tt * 0.25 + ph) + 0.1 * Math.sin(x / (w * 0.07) - tt * 0.4 + ph * 2));
      const len = hgt * (0.45 + 0.25 * Math.sin(x / (w * 0.13) + tt * 0.3 + ph));
      const g = ctx.createLinearGradient(0, y - len, 0, y);
      g.addColorStop(0, `rgba(${rgb},0)`);
      g.addColorStop(0.8, `rgba(${rgb},${0.09 * a * alpha})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x, y - len, 3.2, len);
    }
  }
  ctx.restore();
}

function snow(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, rm: boolean, n = 60, u = 1): void {
  ctx.fillStyle = 'rgba(235,245,255,0.8)';
  for (let i = 0; i < n; i++) {
    const sp = 12 + hash(i, 7) * 18;
    const y = rm ? hash(i, 8) * h : (hash(i, 8) * h + t * sp * u) % (h + 10);
    const x = (hash(i, 9) * w + Math.sin(t * 0.7 + i) * 6 * u) % w;
    const r = (0.6 + hash(i, 10) * 1.6) * u;
    ctx.globalAlpha = 0.35 + hash(i, 11) * 0.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function nightSky(ctx: CanvasRenderingContext2D, e: SceneEnv, horizon: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, '#040811');
  g.addColorStop(0.6, '#0a1630');
  g.addColorStop(1, '#14284a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, e.w, e.h);
  stars(ctx, e.w, horizon, e.t, e.rm);
}

/** The inside of the lab at night: wall, a window with the aurora, a shelf of flasks, the bench. */
function labRoom(ctx: CanvasRenderingContext2D, e: SceneEnv, benchY: number, u: number, win = true): void {
  const { w, h } = e;
  const g = ctx.createLinearGradient(0, 0, 0, benchY);
  g.addColorStop(0, '#0b1222');
  g.addColorStop(1, '#16223a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Wall panels.
  ctx.strokeStyle = 'rgba(160,190,230,0.06)';
  ctx.lineWidth = 1;
  for (let x = (w / 2) % (60 * u); x < w; x += 60 * u) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, benchY);
    ctx.stroke();
  }
  if (win) {
    // Round porthole window with the aurora outside.
    const wx = w * 0.78;
    const wy = benchY * 0.36;
    const wr = Math.min(52 * u, w * 0.16);
    ctx.save();
    ctx.beginPath();
    ctx.arc(wx, wy, wr, 0, TAU);
    ctx.clip();
    const sg = ctx.createLinearGradient(0, wy - wr, 0, wy + wr);
    sg.addColorStop(0, '#050a16');
    sg.addColorStop(1, '#13284a');
    ctx.fillStyle = sg;
    ctx.fillRect(wx - wr, wy - wr, wr * 2, wr * 2);
    ctx.translate(wx - wr, wy - wr);
    stars(ctx, wr * 2, wr * 2, e.t, e.rm, 14);
    aurora(ctx, wr * 2, 0, wr * 1.6, e.t, e.rm, 1.3);
    // Frost creeping up from the bottom-left of the glass.
    const fg = ctx.createRadialGradient(wr * 0.35, wr * 1.75, 0, wr * 0.35, wr * 1.75, wr * 0.9);
    fg.addColorStop(0, 'rgba(207,232,245,0.32)');
    fg.addColorStop(1, 'rgba(207,232,245,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, wr * 2, wr * 2);
    ctx.restore();
    ctx.strokeStyle = '#3a4a64';
    ctx.lineWidth = 5 * u;
    ctx.beginPath();
    ctx.arc(wx, wy, wr, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(207,232,245,0.35)';
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.arc(wx, wy, wr - 3 * u, Math.PI * 1.1, Math.PI * 1.5);
    ctx.stroke();
  }
  // A shelf of flasks (silhouettes, catching a little warm light).
  const sy = benchY * 0.3;
  const sx0 = w * 0.06;
  const sx1 = Math.min(w * 0.42, sx0 + 150 * u);
  ctx.fillStyle = '#26334d';
  ctx.fillRect(sx0, sy, sx1 - sx0, 4 * u);
  for (let i = 0; i < 5; i++) {
    const fx = sx0 + 14 * u + i * ((sx1 - sx0 - 24 * u) / 4);
    const fh = (16 + hash(i, 31) * 12) * u;
    const fw = (8 + hash(i, 32) * 6) * u;
    ctx.fillStyle = 'rgba(120,160,210,0.16)';
    ctx.strokeStyle = 'rgba(207,232,245,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (i % 2) ctx.roundRect(fx - fw / 2, sy - fh, fw, fh, 2 * u);
    else {
      ctx.moveTo(fx - fw * 0.2, sy - fh);
      ctx.lineTo(fx + fw * 0.2, sy - fh);
      ctx.lineTo(fx + fw * 0.2, sy - fh * 0.55);
      ctx.lineTo(fx + fw * 0.6, sy);
      ctx.lineTo(fx - fw * 0.6, sy);
      ctx.lineTo(fx - fw * 0.2, sy - fh * 0.55);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
    const hue = ['91,192,235', '94,230,200', '184,146,255', '255,184,107', '91,192,235'][i];
    ctx.fillStyle = `rgba(${hue},0.4)`;
    ctx.fillRect(fx - fw * 0.45, sy - fh * 0.35, fw * 0.9, fh * 0.33);
  }
  // Bench: brushed steel with a lit front edge.
  const bg = ctx.createLinearGradient(0, benchY, 0, h);
  bg.addColorStop(0, '#2b3850');
  bg.addColorStop(0.08, '#1c263a');
  bg.addColorStop(1, '#0e1422');
  ctx.fillStyle = bg;
  ctx.fillRect(0, benchY, w, h - benchY);
  ctx.fillStyle = 'rgba(207,232,245,0.22)';
  ctx.fillRect(0, benchY, w, 1.5 * u);
}

/** A petri dish seen from above: night agar, frost-white glass rim. */
function dishTop(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, u: number): void {
  glow(ctx, x, y, r * 1.5, '91,192,235', 0.18);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x + 3 * u, y + 5 * u, r * 1.02, r * 1.02, 0, 0, TAU);
  ctx.fill();
  const ag = ctx.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.1, x, y, r);
  ag.addColorStop(0, '#0f2440');
  ag.addColorStop(0.75, '#081427');
  ag.addColorStop(1, '#0d1e36');
  ctx.fillStyle = ag;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(225,242,252,0.85)';
  ctx.lineWidth = 3 * u;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(207,232,245,0.25)';
  ctx.lineWidth = 7 * u;
  ctx.beginPath();
  ctx.arc(x, y, r + 4.5 * u, 0, TAU);
  ctx.stroke();
  // Specular arc and a warm reflection (VELA is near).
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2 * u;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, r - 5 * u, Math.PI * 1.08, Math.PI * 1.36);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,184,107,0.45)';
  ctx.beginPath();
  ctx.arc(x, y, r - 5 * u, Math.PI * 1.75, Math.PI * 1.86);
  ctx.stroke();
}

/** A real catalog creature, glowing, at (x, y) `px` wide. */
function creature(ctx: CanvasRenderingContext2D, code: string, x: number, y: number, px: number, rot: number, alpha = 1): void {
  if (alpha <= 0.01) return;
  let sp: ReturnType<typeof sprite> | null = null;
  try {
    sp = sprite(code, 96);
  } catch {
    sp = null;
  }
  if (!sp) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.drawImage(sp.canvas, -px / 2, -px / 2, px, px);
  ctx.restore();
}

/** The Essence drop (emblem 'essence' as a canvas glyph). */
function drop(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.5);
  ctx.bezierCurveTo(x + r * 0.5, y - r * 0.7, x + r, y - r * 0.2, x + r, y + r * 0.25);
  ctx.arc(x, y + r * 0.25, r, 0, Math.PI);
  ctx.bezierCurveTo(x - r, y - r * 0.2, x - r * 0.5, y - r * 0.7, x, y - r * 1.5);
  const g = ctx.createLinearGradient(0, y - r * 1.5, 0, y + r * 1.25);
  g.addColorStop(0, '#bff0ff');
  g.addColorStop(1, '#2f9fd8');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#0b3a57';
  ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y + r * 0.1, r * 0.22, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** A rounded label pill with an icon painter and text (numbers only: no language in the art). */
function pill(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, u: number, color: string, icon: (cx: number, cy: number) => void): void {
  ctx.font = `700 ${Math.round(15 * u)}px Inter, system-ui, sans-serif`;
  const tw = ctx.measureText(text).width;
  const pw = tw + 36 * u;
  const ph = 26 * u;
  ctx.fillStyle = 'rgba(12,18,30,0.86)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 * u;
  ctx.beginPath();
  ctx.roundRect(x - pw / 2, y - ph / 2, pw, ph, ph / 2);
  ctx.fill();
  ctx.stroke();
  icon(x - pw / 2 + 14 * u, y);
  ctx.fillStyle = '#e6edf3';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, x - pw / 2 + 26 * u, y + 0.5 * u);
}

function badge(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ok: boolean, a = 1): void {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = ok ? '#8ae234' : '#7d8995';
  ctx.strokeStyle = ok ? '#1d4a08' : '#2a3038';
  ctx.lineWidth = r * 0.14;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = ok ? '#123a02' : '#e6edf3';
  ctx.lineWidth = r * 0.28;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (ok) {
    ctx.moveTo(x - r * 0.45, y + r * 0.02);
    ctx.lineTo(x - r * 0.1, y + r * 0.38);
    ctx.lineTo(x + r * 0.5, y - r * 0.35);
  } else {
    ctx.moveTo(x - r * 0.35, y - r * 0.35);
    ctx.lineTo(x + r * 0.35, y + r * 0.35);
    ctx.moveTo(x + r * 0.35, y - r * 0.35);
    ctx.lineTo(x - r * 0.35, y + r * 0.35);
  }
  ctx.stroke();
  ctx.restore();
}

/** A tapping fingertip (a soft glowing touch with rings). */
function tap(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, u: number): void {
  // k: 0..1 progress of the tap (press at 0.3, rings after)
  const press = smooth(0, 0.3, k) * (1 - smooth(0.35, 0.6, k));
  for (let i = 0; i < 2; i++) {
    const rk = clamp01((k - 0.3 - i * 0.12) / 0.6);
    if (rk <= 0 || rk >= 1) continue;
    ctx.strokeStyle = `rgba(207,240,255,${(1 - rk) * 0.8})`;
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.arc(x, y, (6 + rk * 26) * u, 0, TAU);
    ctx.stroke();
  }
  // A cartoon hand: index finger pointing down at (x, y).
  const hy = y - (14 - press * 8) * u;
  const a = 1 - smooth(0.7, 1, k);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(x, hy);
  ctx.scale(u, u);
  ctx.fillStyle = '#f2c7a2';
  ctx.strokeStyle = '#2a2130';
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.roundRect(-3.6, 0, 7.2, 20, 3.6);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(-9, 14, 20, 18, 7);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(42,33,48,0.45)';
  ctx.beginPath();
  ctx.moveTo(-3, 20);
  ctx.lineTo(-3, 26);
  ctx.moveTo(2, 20);
  ctx.lineTo(2, 26);
  ctx.stroke();
  ctx.fillStyle = '#f3f7fb';
  ctx.strokeStyle = '#2a2130';
  ctx.beginPath();
  ctx.roundRect(-10, 30, 22, 8, 3);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ───────────────────────────── 1 · the station ─────────────────────────────

const station: Painter = (ctx, e) => {
  const u = unit(e);
  const { w, h, t, rm } = e;
  const horizon = h * 0.62;
  nightSky(ctx, e, horizon);
  aurora(ctx, w, h * 0.04, h * 0.42, t, rm);
  // Moon.
  const mx = w * 0.82;
  const my = h * 0.14;
  glow(ctx, mx, my, 40 * u, '201,209,255', 0.3);
  // A crescent: the disc minus an offset disc (clip + even-odd, so the sky shows through).
  ctx.save();
  ctx.beginPath();
  ctx.arc(mx, my, 12 * u, 0, TAU);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(mx - 13 * u, my - 13 * u, 26 * u, 26 * u);
  ctx.arc(mx + 5.5 * u, my - 3.5 * u, 11 * u, 0, TAU);
  ctx.fillStyle = '#e9ecff';
  ctx.fill('evenodd');
  ctx.restore();
  // Far mountains.
  ctx.fillStyle = '#1a2c4c';
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  for (let i = 0; i <= 12; i++) {
    const x = (i / 12) * w;
    const y = horizon - (18 + hash(i, 41) * 46) * u * (i % 2 ? 0.6 : 1);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, horizon);
  ctx.closePath();
  ctx.fill();
  // Snow caps catch the aurora.
  ctx.strokeStyle = 'rgba(160,240,220,0.25)';
  ctx.lineWidth = 1.5 * u;
  ctx.stroke();
  // Sea with ice floes.
  const sea = ctx.createLinearGradient(0, horizon, 0, h);
  sea.addColorStop(0, '#0d1f3a');
  sea.addColorStop(1, '#060d1a');
  ctx.fillStyle = sea;
  ctx.fillRect(0, horizon, w, h - horizon);
  for (let i = 0; i < 7; i++) {
    const depth = hash(i, 52);
    const fx = hash(i, 51) * w;
    const fy = horizon + 30 * u + depth * (h - horizon - 40 * u);
    const fw = (6 + hash(i, 53) * 12) * u * (0.6 + depth);
    const x = fx + (rm ? 0 : Math.sin(t * 0.3 + i) * 3 * u);
    // A small flat ice floe: lit top, blue shadow side, a ripple.
    ctx.fillStyle = 'rgba(40,80,130,0.55)';
    ctx.beginPath();
    ctx.ellipse(x, fy + fw * 0.12, fw, fw * 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#dbe9f4';
    ctx.beginPath();
    ctx.ellipse(x, fy, fw * 0.92, fw * 0.16, 0, 0, TAU);
    ctx.fill();
  }
  // Aurora reflected on the water.
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.translate(0, horizon * 2 + 10 * u);
  ctx.scale(1, -0.35);
  aurora(ctx, w, h * 0.04, h * 0.42, t, rm, 0.6);
  ctx.restore();
  // The island.
  const ix = w * 0.5;
  const iy = horizon + 26 * u;
  const iw = Math.min(150 * u, w * 0.46);
  ctx.fillStyle = '#dde9f3';
  ctx.beginPath();
  ctx.moveTo(ix - iw, iy + 18 * u);
  ctx.bezierCurveTo(ix - iw * 0.8, iy - 40 * u, ix - iw * 0.27, iy - 52 * u, ix + 10 * u, iy - 48 * u);
  ctx.bezierCurveTo(ix + iw * 0.47, iy - 44 * u, ix + iw * 0.87, iy - 30 * u, ix + iw * 1.07, iy + 18 * u);
  ctx.closePath();
  const ig = ctx.createLinearGradient(0, iy - 50 * u, 0, iy + 18 * u);
  ig.addColorStop(0, '#cfe0ee');
  ig.addColorStop(1, '#6f8bab');
  ctx.fillStyle = ig;
  ctx.fill();
  // The station: a long hut, a dome and an antenna.
  const sx = ix - 6 * u;
  const sy = iy - 42 * u;
  const su = u * 1.3;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(su, su);
  ctx.lineJoin = 'round';
  // Antenna.
  ctx.strokeStyle = '#8a9bb3';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(48, -6);
  ctx.lineTo(48, -46);
  ctx.moveTo(42, -36);
  ctx.lineTo(54, -36);
  ctx.moveTo(44, -26);
  ctx.lineTo(52, -26);
  ctx.stroke();
  const blink = rm ? 1 : Math.sin(t * 3) > 0.2 ? 1 : 0.2;
  glow(ctx, 48, -47, 9, '255,90,80', 0.7 * blink);
  ctx.fillStyle = blink > 0.5 ? '#ff7a5c' : '#7a2f25';
  ctx.beginPath();
  ctx.arc(48, -47, 1.8, 0, TAU);
  ctx.fill();
  // Hut.
  ctx.fillStyle = '#2b3a58';
  ctx.strokeStyle = '#0d1424';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(-44, -18, 84, 24, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f3f8fc';
  ctx.beginPath();
  ctx.roundRect(-47, -22, 90, 7, 3.5);
  ctx.fill();
  // Dome.
  ctx.fillStyle = '#36486b';
  ctx.beginPath();
  ctx.arc(-24, -18, 17, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f3f8fc';
  ctx.beginPath();
  ctx.arc(-24, -18, 17, Math.PI * 1.1, Math.PI * 1.55);
  ctx.arc(-24, -18, 13, Math.PI * 1.55, Math.PI * 1.1, true);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#0d1424';
  ctx.fillRect(-26, -35, 4, 17);
  // Windows: one warm (VELA's candle), one cold (the dish).
  const flick = rm ? 1 : 0.9 + 0.1 * Math.sin(t * 7) * Math.sin(t * 3.1);
  glow(ctx, 2, -6, 26, '255,184,107', 0.45 * flick);
  glow(ctx, 26, -6, 22, '91,192,235', 0.5);
  ctx.fillStyle = '#ffcf8a';
  ctx.beginPath();
  ctx.roundRect(-4, -11, 12, 10, 2);
  ctx.fill();
  ctx.fillStyle = '#9fe3ff';
  ctx.beginPath();
  ctx.roundRect(20, -11, 12, 10, 2);
  ctx.fill();
  ctx.strokeStyle = '#0d1424';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(2, -11);
  ctx.lineTo(2, -1);
  ctx.moveTo(26, -11);
  ctx.lineTo(26, -1);
  ctx.stroke();
  // Door.
  ctx.fillStyle = '#1a2438';
  ctx.beginPath();
  ctx.roundRect(-40, -10, 9, 16, 2);
  ctx.fill();
  ctx.restore();
  // Signpost.
  ctx.save();
  ctx.translate(ix + Math.min(84 * u, iw * 0.6), iy - 24 * u);
  ctx.scale(u, u);
  ctx.fillStyle = '#6b4a33';
  ctx.fillRect(-1.5, -16, 3, 22);
  ctx.save();
  ctx.rotate(-0.06);
  ctx.beginPath();
  ctx.roundRect(-22, -22, 44, 12, 2);
  ctx.fillStyle = '#8a5f3e';
  ctx.fill();
  ctx.strokeStyle = '#2a1a10';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#fbe9cf';
  ctx.font = '700 7.5px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VIGILIA 78°N', 0, -15.6);
  ctx.restore();
  ctx.fillStyle = '#f3f8fc';
  ctx.beginPath();
  ctx.ellipse(0, -22.5, 20, 2.2, -0.06, Math.PI, 0);
  ctx.fill();
  ctx.restore();
  snow(ctx, w, h, t, rm, 70, u);
  // A slow push-in feel: soft vignette.
  const vg = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.3, w / 2, h * 0.55, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
};

// ───────────────────────────── 2 · Albor's farewell tape ─────────────────────────────

const tape: Painter = (ctx, e) => {
  const u = unit(e);
  const { w, h, t, rm } = e;
  const benchY = h * 0.74;
  labRoom(ctx, e, benchY, u);
  // The memory bubble: Albor waving goodbye at the station door, lantern in hand.
  const bx = w * 0.5;
  const by = h * 0.4;
  const br = Math.min(w * 0.36, h * 0.32);
  const open = rm ? 1 : easeOutBack(clamp01(t / 0.7));
  ctx.save();
  ctx.translate(bx, by);
  ctx.scale(open, open);
  // A memory: a warm round window with a soft glowing rim.
  glow(ctx, 0, 0, br * 1.35, '255,184,107', 0.35);
  ctx.beginPath();
  ctx.arc(0, 0, br, 0, TAU);
  const mg = ctx.createRadialGradient(0, -br * 0.2, br * 0.1, 0, 0, br * 1.1);
  mg.addColorStop(0, '#6b4630');
  mg.addColorStop(1, '#2a1b12');
  ctx.fillStyle = mg;
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, br, 0, TAU);
  ctx.clip();
  // Snowy ground and the doorway behind her.
  ctx.fillStyle = '#3b2a1f';
  ctx.fillRect(-br, br * 0.45, br * 2, br);
  ctx.fillStyle = '#8a6a4c';
  ctx.beginPath();
  ctx.roundRect(br * 0.25, -br * 0.55, br * 0.42, br * 1.0, 4 * u);
  ctx.fill();
  glow(ctx, br * 0.46, -br * 0.05, br * 0.6, '255,200,140', 0.35);
  // Albor (full body), happy, waving goodbye, the lamp in her other hand.
  const k = (br * 1.25) / 95;
  drawDoctorAt(ctx, ALBOR, pose('happy', e, { gesture: 'wave', item: 'lantern' }), t, -br * 0.15, br * 0.62, k);
  // Sepia tape look and scanlines.
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(255,170,90,0.16)';
  ctx.fillRect(-br, -br, br * 2, br * 2);
  ctx.fillStyle = 'rgba(30,15,5,0.1)';
  const off = rm ? 0 : (t * 10) % 4;
  for (let y = -br + off; y < br; y += 4) ctx.fillRect(-br, y, br * 2, 1.2);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,226,180,0.85)';
  ctx.lineWidth = 3 * u;
  ctx.setLineDash([2 * u, 7 * u]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, br + 5 * u, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,214,160,0.7)';
  ctx.lineWidth = 2 * u;
  ctx.beginPath();
  ctx.arc(0, 0, br, 0, TAU);
  ctx.stroke();
  ctx.restore();
  // Bubble trail down to the recorder.
  const rx = w * 0.5;
  const ry = benchY;
  for (let i = 0; i < 3; i++) {
    const kk = (i + 1) / 4;
    ctx.fillStyle = `rgba(255,214,160,${0.75 * open})`;
    ctx.beginPath();
    ctx.arc(bx + (rx - bx) * kk + (i - 1) * 6 * u, by + br + (ry - by - br) * kk * 0.85, (7 - i * 2) * u * open, 0, TAU);
    ctx.fill();
  }
  // The recorder on the bench (cream plastic around a cassette), PLAY down.
  const cw = 92 * u;
  ctx.save();
  ctx.translate(rx, ry - 4 * u);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 4 * u, cw * 0.6, 6 * u, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(-cw / 2, -cw * 0.42, cw, cw * 0.46, 8 * u);
  const rg = ctx.createLinearGradient(0, -cw * 0.42, 0, 0);
  rg.addColorStop(0, '#efe3c8');
  rg.addColorStop(1, '#bfa883');
  ctx.fillStyle = rg;
  ctx.fill();
  ctx.strokeStyle = '#2a2130';
  ctx.lineWidth = 1.6 * u;
  ctx.stroke();
  ctx.strokeStyle = '#5b4a3a';
  ctx.lineWidth = 3 * u;
  ctx.beginPath();
  ctx.moveTo(-cw * 0.3, -cw * 0.42);
  ctx.quadraticCurveTo(0, -cw * 0.58, cw * 0.3, -cw * 0.42);
  ctx.stroke();
  ctx.restore();
  drawCassette(ctx, rx - cw * 0.12, ry - cw * 0.2 - 4 * u, cw * 0.5, t, true, rm);
  // Speaker grille + amber PLAY light.
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 4; c++) {
      ctx.fillStyle = '#4d4032';
      ctx.beginPath();
      ctx.arc(rx + cw * 0.22 + c * 5 * u, ry - cw * 0.3 + r * 5 * u, 1.3 * u, 0, TAU);
      ctx.fill();
    }
  glow(ctx, rx + cw * 0.38, ry - cw * 0.07, 9 * u, '255,170,60', 0.8);
  ctx.fillStyle = '#ffc067';
  ctx.beginPath();
  ctx.arc(rx + cw * 0.38, ry - cw * 0.07, 2.2 * u, 0, TAU);
  ctx.fill();
  // Sound waves.
  if (!rm)
    for (let i = 0; i < 3; i++) {
      const k = ((t * 0.8 + i / 3) % 1);
      ctx.strokeStyle = `rgba(255,184,107,${(1 - k) * 0.7})`;
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.arc(rx + cw * 0.5, ry - cw * 0.22, (8 + k * 26) * u, -0.6, 0.6);
      ctx.stroke();
    }
};

// ───────────────────────────── 3 · you arrive ─────────────────────────────

const arrive: Painter = (ctx, e) => {
  const u = unit(e);
  const { w, h, t, rm } = e;
  const ground = h * 0.8;
  nightSky(ctx, e, ground);
  aurora(ctx, w, 0, h * 0.35, t, rm, 0.8);
  // The station wall with the open door, warm light spilling on the snow.
  const dx = w * 0.72;
  ctx.fillStyle = '#26344f';
  ctx.fillRect(dx - 70 * u, ground - 130 * u, w, 130 * u);
  ctx.fillStyle = '#f3f8fc';
  ctx.beginPath();
  ctx.roundRect(dx - 76 * u, ground - 138 * u, w, 12 * u, 6 * u);
  ctx.fill();
  // Icicles.
  ctx.fillStyle = 'rgba(220,240,255,0.85)';
  for (let i = 0; i < 12; i++) {
    const ix = dx - 70 * u + i * 13 * u;
    const il = (5 + hash(i, 61) * 10) * u;
    ctx.beginPath();
    ctx.moveTo(ix, ground - 126 * u);
    ctx.lineTo(ix + 3 * u, ground - 126 * u);
    ctx.lineTo(ix + 1.5 * u, ground - 126 * u + il);
    ctx.closePath();
    ctx.fill();
  }
  // Light from the door onto the snow.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const lg = ctx.createLinearGradient(dx, ground, dx - 140 * u, ground + 30 * u);
  lg.addColorStop(0, 'rgba(255,184,107,0.4)');
  lg.addColorStop(1, 'rgba(255,184,107,0)');
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.moveTo(dx - 20 * u, ground);
  ctx.lineTo(dx + 20 * u, ground);
  ctx.lineTo(dx - 60 * u, h);
  ctx.lineTo(dx - 200 * u, h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#ffcf8a';
  ctx.beginPath();
  ctx.roundRect(dx - 20 * u, ground - 74 * u, 40 * u, 74 * u, [8 * u, 8 * u, 0, 0]);
  ctx.fill();
  glow(ctx, dx, ground - 36 * u, 80 * u, '255,184,107', 0.35);
  // VELA waiting inside the door, small and happy.
  vela(ctx, dx + 2 * u, ground - 2 * u, 46 * u, t > 2.4 || rm ? 'happy' : 'awed', e);
  // Ground.
  const sg = ctx.createLinearGradient(0, ground, 0, h);
  sg.addColorStop(0, '#c7d8e8');
  sg.addColorStop(1, '#6f8bab');
  ctx.fillStyle = sg;
  ctx.fillRect(0, ground, w, h - ground);
  // The player walks in from the left and stops near the door.
  const arriveT = rm ? 1 : smooth(0, 2.3, t);
  const px = w * 0.08 + (dx - 90 * u - w * 0.08) * arriveT;
  // Footprints behind.
  ctx.fillStyle = 'rgba(80,110,150,0.35)';
  for (let x = w * 0.04, i = 0; x < px - 14 * u; x += 16 * u, i++) {
    ctx.beginPath();
    ctx.ellipse(x, ground + (i % 2 ? 10 : 16) * u, 4 * u, 1.8 * u, 0, 0, TAU);
    ctx.fill();
  }
  const walking = arriveT < 0.999;
  const k = Math.min(1.45 * u, (h * 0.55) / 92);
  drawDoctorAt(
    ctx,
    playerSpec(e.look),
    pose(walking ? 'neutral' : 'happy', e, walking ? { gesture: 'walk', item: 'suitcase', lookX: 0.8 } : { gesture: 'wave' }),
    t,
    px,
    ground + 14 * u,
    k,
  );
  if (!walking) {
    // The suitcase, set down.
    ctx.save();
    ctx.translate(px - 30 * k, ground + 14 * u);
    ctx.scale(k, k);
    ctx.beginPath();
    ctx.roundRect(-10, -16, 20, 15, 2.6);
    ctx.fillStyle = '#c0563a';
    ctx.fill();
    ctx.strokeStyle = '#2a2130';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#e8b04a';
    ctx.fillRect(-6.5, -16, 2.2, 15);
    ctx.fillRect(4.3, -16, 2.2, 15);
    ctx.restore();
  }
  snow(ctx, w, h, t, rm, 60, u);
};

// ───────────────────────────── 4 · VELA lights her candle ─────────────────────────────

const candle: Painter = (ctx, e) => {
  const u = unit(e);
  const { w, h, t, rm } = e;
  const benchY = h * 0.7;
  labRoom(ctx, e, benchY, u);
  const lit = rm ? 1 : smooth(0.7, 1.8, t);
  const vx = w * 0.6;
  const vh = Math.min(150 * u, h * 0.55);
  const mood: ArtMood = rm ? 'happy' : t < 0.75 ? 'sleepy' : t < 2 ? 'awed' : 'happy';
  vela(ctx, vx, benchY + 8 * u, vh, mood, e, rm ? 10 : t < 0.75 ? t : t < 2 ? t - 0.75 : t - 2);
  // The player beside the bench, surprised then happy.
  const k = Math.min(1.35 * u, (h * 0.6) / 92);
  drawDoctorAt(ctx, playerSpec(e.look), pose(rm || t > 2.1 ? 'happy' : 'surprised', e, rm || t > 2.1 ? { gesture: 'wave' } : {}), t, w * 0.25, h * 0.98, k);
  // Darkness before the candle: a dark veil with a hole that grows from the flame.
  const fx = vx;
  const fy = benchY + 8 * u - vh * 0.98;
  const R = Math.max(w, h) * (0.12 + lit * 1.1);
  const dark = ctx.createRadialGradient(fx, fy, R * 0.15, fx, fy, R);
  dark.addColorStop(0, `rgba(2,4,10,${0.25 * (1 - lit)})`);
  dark.addColorStop(1, `rgba(2,4,10,${0.88 - lit * 0.62})`);
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, w, h);
  // The spark that lights the wick.
  if (!rm && t > 0.5 && t < 1.3) {
    const k2 = (t - 0.5) / 0.8;
    twinkle(ctx, fx, fy + 6 * u, (6 + k2 * 18) * u, '#ffd166', Math.sin(k2 * Math.PI));
  }
  glow(ctx, fx, fy, 120 * u * lit, '255,184,107', 0.22 * lit);
};

// ───────────────────────────── 5 · the dish glows ─────────────────────────────

const dish: Painter = (ctx, e) => {
  const u = unit(e);
  const { w, h, t, rm } = e;
  const benchY = h * 0.56;
  labRoom(ctx, e, benchY, u, false);
  // A big dish in 3/4 view, glowing.
  const cx = w * 0.5;
  const cy = h * 0.72;
  const rx = Math.min(w * 0.3, 120 * u);
  const ry = rx * 0.42;
  const on = rm ? 1 : smooth(0, 1.2, t);
  // Light rays upward.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.16 + (rm ? 0 : Math.sin(t * 0.5 + i) * 0.03);
    const len = (140 + hash(i, 71) * 80) * u;
    const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    g.addColorStop(0, `rgba(91,192,235,${0.16 * on})`);
    g.addColorStop(1, 'rgba(91,192,235,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - rx * 0.5 + i * rx * 0.15, cy);
    ctx.lineTo(cx + Math.cos(a - 0.05) * len, cy + Math.sin(a - 0.05) * len);
    ctx.lineTo(cx + Math.cos(a + 0.05) * len, cy + Math.sin(a + 0.05) * len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // Faces lit from below: the two scientists peek over the rim.
  const k = Math.min(1.3 * u, (h * 0.55) / 92, (w * 0.3) / 50);
  drawDoctorAt(ctx, playerSpec(e.look), pose('surprised', e, { lookX: 0.8, lookY: 0.8, gesture: 'cheeks' }), t, Math.max(26 * k, cx - rx - 14 * k), h * 0.99, k);
  vela(ctx, Math.min(w - 34 * u, cx + rx + 30 * u), cy + ry * 0.6, Math.min(110 * u, h * 0.4), 'awed', e);
  // The dish.
  glow(ctx, cx, cy, rx * 1.4, '91,192,235', 0.3 * on);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const ag = ctx.createRadialGradient(0, 0, rx * 0.1, 0, 0, rx);
  ag.addColorStop(0, '#19467a');
  ag.addColorStop(1, '#081427');
  ctx.fillStyle = ag;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, rx * 0.97, 0, TAU);
  ctx.clip();
  const codes = ['O2u', 'OG2g', 'S1s', 'O2u'];
  for (let i = 0; i < codes.length; i++) {
    const ph = t * 0.25 + i * 1.7;
    const x = (rm ? Math.cos(i * 1.7) : Math.cos(ph)) * rx * (0.25 + 0.4 * hash(i, 81));
    const y = (rm ? Math.sin(i * 2.3) : Math.sin(ph * 1.3)) * rx * 0.55;
    creature(ctx, codes[i], x, y, rx * (0.55 + 0.15 * hash(i, 82)), rm ? i : ph * 0.8, on);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(225,242,252,0.85)';
  ctx.lineWidth = 3 * u * (rx / ry) * 0.5;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.stroke();
  ctx.restore();
  // Glass wall (front lip).
  ctx.strokeStyle = 'rgba(207,232,245,0.5)';
  ctx.lineWidth = 2 * u;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 9 * u, rx, ry, 0, 0.05, Math.PI - 0.05);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - rx, cy);
  ctx.lineTo(cx - rx, cy + 9 * u);
  ctx.moveTo(cx + rx, cy);
  ctx.lineTo(cx + rx, cy + 9 * u);
  ctx.stroke();
  // Sparkles.
  for (let i = 0; i < 6; i++) {
    const a = rm ? 0.8 : Math.max(0, Math.sin(t * 1.5 + i * 1.3));
    twinkle(ctx, cx + (hash(i, 91) - 0.5) * rx * 1.6, cy - (20 + hash(i, 92) * 90) * u, (3 + hash(i, 93) * 3) * u, '#bff0ff', a * on);
  }
};

// ───────────────────────────── 6 · how to: sow ─────────────────────────────

/** The top-down dish used by the how-to panels; returns its centre and radius. */
function howDish(ctx: CanvasRenderingContext2D, e: SceneEnv, cxk = 0.5): { x: number; y: number; r: number; u: number } {
  const u = unit(e);
  const g = ctx.createLinearGradient(0, 0, 0, e.h);
  g.addColorStop(0, '#0b1222');
  g.addColorStop(1, '#141d30');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, e.w, e.h);
  // Brushed steel: faint horizontal strokes.
  ctx.fillStyle = 'rgba(207,232,245,0.025)';
  for (let i = 0; i < 24; i++) ctx.fillRect(0, hash(i, 141) * e.h, e.w, 1 + hash(i, 142) * 2);
  const r = Math.min(e.w * 0.36, e.h * 0.36);
  const x = e.w * cxk;
  const y = e.h * 0.54;
  dishTop(ctx, x, y, r, u);
  return { x, y, r, u };
}

const sow: Painter = (ctx, e) => {
  const { t, rm } = e;
  const d = howDish(ctx, e);
  const loop = rm ? HERO_TIME.sow : t % 4.8;
  // Seed 1 (a creature) at the left; seed 2 (fades) at the right after it.
  const seeds = [
    { x: d.x - d.r * 0.35, y: d.y - d.r * 0.12, at: 0.1, lives: true, code: 'O2u' },
    { x: d.x + d.r * 0.38, y: d.y + d.r * 0.25, at: 2.4, lives: false, code: 'O2u' },
  ];
  for (const s of seeds) {
    const k = loop - s.at;
    if (k < 0) continue;
    const grow = smooth(0.35, 1.6, k);
    if (s.lives) {
      // A soft blob that settles into a creature.
      glow(ctx, s.x, s.y, d.r * 0.3 * grow, '91,192,235', 0.5 * (1 - smooth(1.2, 2.2, k) * 0.5));
      creature(ctx, s.code, s.x, s.y, d.r * 0.62 * (0.4 + 0.6 * grow), 0.4 + (rm ? 0 : k * 0.15), smooth(0.6, 1.8, k));
      if (k > 1.9) badge(ctx, s.x + d.r * 0.2, s.y - d.r * 0.24, 9 * d.u, true, smooth(1.9, 2.2, k));
    } else {
      // A blob that fades away with a grey puff.
      const fade = 1 - smooth(1.2, 2.1, k);
      glow(ctx, s.x, s.y, d.r * 0.2 * grow, '120,170,210', 0.55 * fade);
      if (k > 1.3)
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU;
          const kk = smooth(1.3, 2.3, k);
          ctx.fillStyle = `rgba(150,165,185,${(1 - kk) * 0.5})`;
          ctx.beginPath();
          ctx.arc(s.x + Math.cos(a) * kk * 16 * d.u, s.y + Math.sin(a) * kk * 16 * d.u - kk * 8 * d.u, 3 * d.u, 0, TAU);
          ctx.fill();
        }
    }
    if (k < 1.2) tap(ctx, s.x, s.y, k / 1.2, d.u);
  }
  // VELA cheering from the corner.
  vela(ctx, e.w - 40 * d.u, e.h - 6 * d.u, 70 * d.u, loop > 2 && loop < 2.4 + 1.2 ? 'happy' : loop > 3.6 ? 'worried' : 'happy', e);
};

// ───────────────────────────── 7 · how to: shape → Esencia ─────────────────────────────

const essence: Painter = (ctx, e) => {
  const { t, rm, w } = e;
  const d = howDish(ctx, e);
  const u = d.u;
  // A creature with a shape (left) and a shapeless blob (right).
  const cx = d.x - d.r * 0.38;
  const cy = d.y + d.r * 0.1;
  const pulse = rm ? 1 : 1 + Math.sin(t * 3) * 0.04;
  glow(ctx, cx, cy, d.r * 0.42 * pulse, '91,192,235', 0.35);
  creature(ctx, 'O2u', cx, cy, d.r * 0.7 * pulse, 0.6, 1);
  badge(ctx, cx, cy + d.r * 0.42, 11 * u, true);
  const bx = d.x + d.r * 0.4;
  const by = d.y + d.r * 0.12;
  // Shapeless matter: a smeared, dull blob.
  ctx.save();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + (rm ? 0 : t * 0.2);
    const rr = d.r * (0.1 + 0.08 * hash(i, 101));
    const g = ctx.createRadialGradient(bx + Math.cos(a) * rr, by + Math.sin(a) * rr * 0.7, 0, bx + Math.cos(a) * rr, by + Math.sin(a) * rr * 0.7, d.r * 0.16);
    g.addColorStop(0, 'rgba(120,150,180,0.5)');
    g.addColorStop(1, 'rgba(120,150,180,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx + Math.cos(a) * rr, by + Math.sin(a) * rr * 0.7, d.r * 0.16, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  badge(ctx, bx, by + d.r * 0.42, 11 * u, false);
  // Drops rise from the creature into the Essence counter.
  const py = Math.max(22 * u, d.y - d.r - 26 * u);
  const px = w / 2;
  const n = rm ? 0 : 4;
  for (let i = 0; i < n; i++) {
    const k = (t * 0.7 + i / n) % 1;
    const x = cx + (px - 30 * u - cx) * smooth(0, 1, k);
    const y = cy - d.r * 0.3 + (py - cy + d.r * 0.3) * k - Math.sin(k * Math.PI) * 30 * u;
    drop(ctx, x, y, 6 * u, 1 - smooth(0.85, 1, k));
  }
  const count = rm ? 12 : Math.floor(t * 2.8);
  pill(ctx, px, py, `+${count}`, u, '#5bc0eb', (x, y) => drop(ctx, x, y + 1 * u, 5.5 * u));
  // "0" floats over the blob.
  ctx.fillStyle = 'rgba(167,179,191,0.9)';
  ctx.font = `700 ${Math.round(16 * u)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('0', bx, by - d.r * 0.28 - (rm ? 0 : Math.sin(t * 2) * 3 * u));
};

// ───────────────────────────── 8 · how to: the clock → Datos ─────────────────────────────

const clock: Painter = (ctx, e) => {
  const { t, rm, w, h } = e;
  const u = unit(e);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0b1222');
  g.addColorStop(1, '#141d30');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const loop = rm ? HERO_TIME.clock : t % 5;
  const wide = w > h * 1.3;
  const cx = wide ? w * 0.33 : w * 0.5;
  const cy = wide ? h * 0.5 : h * 0.36;
  const R = Math.min(wide ? w * 0.18 : w * 0.26, h * (wide ? 0.3 : 0.19));
  const run = clamp01(loop / 2.4);
  const left = 1 - run;
  // Clock body (the 'time' emblem as a lab stopwatch).
  glow(ctx, cx, cy, R * 1.6, '91,192,235', 0.18);
  ctx.fillStyle = '#5bc0eb';
  ctx.strokeStyle = '#0b2a40';
  ctx.lineWidth = 2 * u;
  ctx.beginPath();
  ctx.roundRect(cx - R * 0.2, cy - R * 1.28, R * 0.4, R * 0.2, 4 * u);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f3fbff';
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#164a66';
  ctx.lineWidth = 3 * u;
  ctx.stroke();
  // The ring drains.
  ctx.strokeStyle = 'rgba(22,74,102,0.15)';
  ctx.lineWidth = R * 0.16;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.8, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = left < 0.25 ? '#ffb86b' : '#2f9fd8';
  ctx.lineCap = 'round';
  if (left > 0.002) {
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.8, -Math.PI / 2, -Math.PI / 2 + left * TAU);
    ctx.stroke();
  }
  const secs = Math.ceil(left * 120);
  const label = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  ctx.fillStyle = '#0f1720';
  ctx.font = `800 ${Math.round(R * 0.42)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy + R * 0.03);
  if (left <= 0.002 && !rm) {
    const k = clamp01((loop - 2.4) / 0.4);
    ctx.strokeStyle = `rgba(255,209,102,${1 - k})`;
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.arc(cx, cy, R * (1 + k * 0.4), 0, TAU);
    ctx.stroke();
  }
  // Esencia drops fly into the Datos card when time is up.
  const dx = wide ? w * 0.72 : w * 0.5;
  const dy = wide ? h * 0.5 : h * 0.74;
  const conv = rm ? 1 : clamp01((loop - 2.4) / 1.4);
  for (let i = 0; i < 6; i++) {
    const k = clamp01(conv * 1.6 - i * 0.12);
    if (k <= 0 || k >= 1) continue;
    // From the rim, on the side facing the Datos card (never across the digits).
    const ang = (wide ? 0 : Math.PI / 2) + (i - 2.5) * 0.28;
    const sx = cx + Math.cos(ang) * R * 1.02;
    const sy = cy + Math.sin(ang) * R * 1.02;
    const x = sx + (dx - sx) * k;
    const y = sy + (dy - sy) * k - Math.sin(k * Math.PI) * 30 * u;
    drop(ctx, x, y, 6 * u, 1);
  }
  // The Datos card (aurora bars).
  const cw = Math.min(70 * u, h * 0.16) * (1 + 0.12 * Math.sin(conv * Math.PI));
  ctx.save();
  ctx.translate(dx, dy);
  glow(ctx, 0, 0, cw * 1.2, '94,230,200', 0.25 + conv * 0.25);
  ctx.beginPath();
  ctx.roundRect(-cw / 2, -cw / 2, cw, cw, cw * 0.22);
  const dg = ctx.createLinearGradient(0, -cw / 2, 0, cw / 2);
  dg.addColorStop(0, '#b8fbe9');
  dg.addColorStop(1, '#22b593');
  ctx.fillStyle = dg;
  ctx.fill();
  ctx.strokeStyle = '#0a4a3c';
  ctx.lineWidth = 2.2 * u;
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = cw * 0.11;
  ctx.lineCap = 'round';
  const bars = [0.3, 0.55, 0.8];
  bars.forEach((b, i) => {
    const hh = cw * b * 0.6 * (0.35 + 0.65 * conv);
    ctx.beginPath();
    ctx.moveTo(-cw * 0.22 + i * cw * 0.22, cw * 0.28);
    ctx.lineTo(-cw * 0.22 + i * cw * 0.22, cw * 0.28 - hh);
    ctx.stroke();
  });
  ctx.restore();
  if (conv > 0.5) {
    ctx.fillStyle = `rgba(94,230,200,${smooth(0.5, 0.8, conv)})`;
    ctx.font = `800 ${Math.round(22 * u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(`+${Math.round(conv * 12)}`, dx + cw * 0.5 + 8 * u, dy - cw * 0.3);
  }
  // Arrow between them.
  ctx.strokeStyle = 'rgba(230,237,243,0.35)';
  ctx.lineWidth = 2.5 * u;
  ctx.setLineDash([4 * u, 6 * u]);
  ctx.beginPath();
  if (wide) {
    ctx.moveTo(cx + R * 1.25, cy);
    ctx.lineTo(dx - cw * 0.75, dy);
  } else {
    ctx.moveTo(cx, cy + R * 1.2);
    ctx.lineTo(dx, dy - cw * 0.75);
  }
  ctx.stroke();
  ctx.setLineDash([]);
};

// ───────────────────────────── 9 · how to: the Árbol and the Mundos ─────────────────────────────

const ROUTES = ['time', 'dropper', 'dish', 'life', 'discovery', 'worlds', 'spark'] as const;

const tree: Painter = (ctx, e) => {
  const { t, rm, w, h } = e;
  const u = unit(e);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0b1222');
  g.addColorStop(1, '#141d30');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  stars(ctx, w, h * 0.6, t, rm, 40);
  const wide = w > h * 1.15;
  const rx = wide ? w * 0.36 : w * 0.5;
  const root = { x: rx, y: h * (wide ? 0.88 : 0.66) };
  const len = Math.min(wide ? h * 0.7 : h * 0.5, (wide ? w * 0.34 : w * 0.46));
  const lt = rm ? 99 : t;
  // Trunk node (the night).
  glow(ctx, root.x, root.y, 46 * u, '201,209,255', 0.3);
  ROUTES.forEach((rid, i) => {
    const a = -Math.PI / 2 + (i - 3) * 0.3;
    const col = ROUTE_COLOR.dark[rid];
    const ex = root.x + Math.cos(a) * len;
    const ey = root.y + Math.sin(a) * len;
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.moveTo(root.x, root.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (let n = 1; n <= 3; n++) {
      const k = [0, 0.42, 0.72, 1][n];
      const x = root.x + Math.cos(a) * len * k;
      const y = root.y + Math.sin(a) * len * k;
      const at = 0.3 + (n - 1) * 0.9 + i * 0.1;
      const on = lt > at;
      const ring = clamp01((lt - at) / 0.6);
      if (on && ring < 1) {
        ctx.strokeStyle = col;
        ctx.globalAlpha = 1 - ring;
        ctx.lineWidth = 2 * u;
        ctx.beginPath();
        ctx.arc(x, y, (8 + ring * 14) * u, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (on) glow(ctx, x, y, 16 * u, '255,255,255', 0.12);
      ctx.fillStyle = on ? col : '#1b232c';
      ctx.strokeStyle = col;
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.arc(x, y, (n === 3 ? 7.5 : 6) * u, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  });
  ctx.fillStyle = '#c9d1ff';
  ctx.strokeStyle = '#2c3170';
  ctx.lineWidth = 2 * u;
  ctx.beginPath();
  ctx.arc(root.x, root.y, 12 * u, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2c3170';
  ctx.beginPath();
  ctx.arc(root.x + 3 * u, root.y - 2 * u, 8 * u, 0, TAU);
  ctx.fill();
  // The worlds: seven little dishes in their hues, each with a real creature.
  const codes = ['O2u', 'OG2g', 'S1s', 'O4d', 'H3s', '3GH2n', 'K4d'];
  const wr = Math.min(17 * u, (wide ? h : w) * 0.06);
  WORLD_ART_IDS.forEach((id, i) => {
    let x: number;
    let y: number;
    if (wide) {
      x = w * 0.8 + (i % 2 ? wr * 1.4 : -wr * 1.2);
      y = h * 0.14 + i * (h * 0.72) / 6;
    } else {
      x = w * 0.5 + (i - 3) * (w * 0.13);
      y = h * 0.87 + (i % 2 ? -wr * 0.6 : wr * 0.6);
    }
    const appear = rm ? 1 : smooth(1.6 + i * 0.18, 2.2 + i * 0.18, t);
    if (appear <= 0) return;
    const hue = WORLD_HUE[id];
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(appear, appear);
    glow(ctx, 0, 0, wr * 2, `${hslRgb(hue, 0.7, 0.6)}`, 0.35);
    ctx.fillStyle = `hsl(${hue} 55% 14%)`;
    ctx.beginPath();
    ctx.arc(0, 0, wr, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `hsl(${hue} 80% 75%)`;
    ctx.lineWidth = 2 * u;
    ctx.stroke();
    ctx.restore();
    creature(ctx, codes[i], x, y + (rm ? 0 : Math.sin(t * 1.5 + i) * 1.5 * u), wr * 1.7 * appear, i, appear);
  });
};

function hslRgb(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `${f(0)},${f(8)},${f(4)}`;
}

// ───────────────────────────── 10 · let's go ─────────────────────────────

const go: Painter = (ctx, e) => {
  const u = unit(e);
  const { w, h, t, rm } = e;
  const benchY = h * 0.66;
  labRoom(ctx, e, benchY, u);
  // Albor's Polaroid pinned on the wall, the lantern hung beside it.
  const phx = w * 0.2;
  const phy = h * 0.28;
  const pw = Math.min(64 * u, w * 0.2);
  ctx.save();
  ctx.translate(phx, phy);
  ctx.rotate(-0.08);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-pw / 2 + 3 * u, -pw * 0.55 + 4 * u, pw, pw * 1.2);
  ctx.fillStyle = '#f7f1e3';
  ctx.fillRect(-pw / 2, -pw * 0.55, pw, pw * 1.2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-pw * 0.42, -pw * 0.47, pw * 0.84, pw * 0.84);
  ctx.clip();
  const pg = ctx.createLinearGradient(0, -pw * 0.47, 0, pw * 0.37);
  pg.addColorStop(0, '#7a5236');
  pg.addColorStop(1, '#2c1d14');
  ctx.fillStyle = pg;
  ctx.fillRect(-pw / 2, -pw / 2, pw, pw);
  ctx.translate(-pw * 0.42, -pw * 0.47);
  ctx.scale((pw * 0.84) / 100, (pw * 0.84) / 100);
  drawDoctorBust(ctx, ALBOR, pose('happy', e, { gesture: 'rest' }), t);
  ctx.restore();
  ctx.fillStyle = '#c0563a';
  ctx.beginPath();
  ctx.arc(0, -pw * 0.5, 3.2 * u, 0, TAU);
  ctx.fill();
  ctx.restore();
  drawLantern(ctx, phx + pw * 0.95, phy - pw * 0.1, 2.2 * u, t, rm);
  // The bench with the glowing dish.
  const dx = w * 0.46;
  const dy = benchY + 10 * u;
  const drx = Math.min(64 * u, w * 0.18);
  glow(ctx, dx, dy, drx * 2.2, '91,192,235', 0.35);
  ctx.save();
  ctx.translate(dx, dy);
  ctx.scale(1, 0.38);
  ctx.fillStyle = '#0d2342';
  ctx.beginPath();
  ctx.arc(0, 0, drx, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.clip();
  creature(ctx, 'O2u', -drx * 0.3, 0, drx * 0.8, rm ? 0 : t * 0.3, 1);
  creature(ctx, 'S1s', drx * 0.35, drx * 0.1, drx * 0.6, 1, 1);
  ctx.restore();
  ctx.strokeStyle = 'rgba(225,242,252,0.8)';
  ctx.lineWidth = 6 * u;
  ctx.stroke();
  ctx.restore();
  // VELA on the bench (wearing nothing yet), the player beside her: both happy.
  const k = Math.min(1.5 * u, (h * 0.66) / 92);
  vela(ctx, w * 0.8, benchY + 4 * u, Math.min(120 * u, h * 0.42), rm ? 'proud' : t < 1.2 ? 'happy' : 'proud', e);
  drawDoctorAt(ctx, playerSpec(e.look), pose('happy', e, { gesture: 'wave' }), t, w * 0.24, h * 1.02, k);
  // Floating sparkles (the Spark is watching).
  for (let i = 0; i < 5; i++) {
    const a = rm ? 0.7 : Math.max(0, Math.sin(t * 1.2 + i * 1.7));
    twinkle(ctx, w * (0.15 + 0.7 * hash(i, 121)), h * (0.1 + 0.4 * hash(i, 122)), (3 + 3 * hash(i, 123)) * u, '#ffd166', a);
  }
};

export const SCENE_PAINTERS: Record<IntroSceneId, Painter> = { station, tape, arrive, candle, dish, sow, essence, clock, tree, go };

/** Paint one scene into a canvas context (CSS-pixel transform already applied). */
export function paintScene(ctx: CanvasRenderingContext2D, id: IntroSceneId, e: SceneEnv): void {
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
  SCENE_PAINTERS[id](ctx, e.rm ? { ...e, t: HERO_TIME[id] } : e);
  ctx.restore();
}
