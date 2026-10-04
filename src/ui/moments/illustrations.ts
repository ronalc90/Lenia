/**
 * The looping mini-animations of the Momentos cards (260×140 logical box).
 *
 * Every creature on these diagrams is real Lenia (clips.ts): a dissolving
 * spore really dissolves, an Orbium really swims, the flood really floods.
 * Arrows, gauges, rings, price tags and counters are drawn on top to say what
 * the eye should notice. Reduce motion shows the same diagram as a slow
 * cross-fade between its key frames (no movement).
 */
import { BEHAVIOR_COLOR, UI, matterColor } from '../../core/palette';
import type { Behavior, Lang, Pattern } from '../../core/types';
import { BEHAVIOR_MULT } from '../../game/balance';
import type { IllustrationKind, MomentData } from '../../moments/types';
import { catalogPattern } from '../../sim/catalog';
import { clip, countBlobs, pumpAll, rulesClip, type LeniaClip } from './clips';
import { drawBehaviorGlyph } from './status';

export const ILLUS_W = 260;
export const ILLUS_H = 140;

const TAU = Math.PI * 2;
const SANS = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
const GREY = '#9AA6B2';

export interface IllusEnv {
  lang: Lang;
  data: MomentData;
  /** Absolute seconds (for ambient motion). */
  time: number;
  rm: boolean;
  /** Portrait of the species (bestiary capture), if known. */
  portrait?: Pattern | null;
  /** Small inline diagram (species card): no text, no badges. */
  mini?: boolean;
  /** Two species for the 'compare' diagram (canvas fallback of the species comparison). */
  compare?: CompareSide[];
}

export interface CompareSide {
  name: string;
  portrait: Pattern | null;
  hue?: number;
  behavior: Behavior | null;
  /** "+1,9/s" or "×2,1". */
  value: string;
  win: boolean;
}

/** Set while drawing a mini diagram: labels and badges are skipped (unreadable at that size). */
let MINI = false;

interface IllusDef {
  /** Loop length in seconds. */
  loop: number;
  /** Key moments (fractions of the loop) shown as stills with reduce motion. */
  keys: number[];
  clips(env: IllusEnv): LeniaClip[];
  /** u = seconds into the loop. */
  draw(ctx: CanvasRenderingContext2D, u: number, env: IllusEnv): void;
}

// ───────────────────────────── easing & small helpers ─────────────────────────────

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
/** 0→1 between a and b. */
const seg = (u: number, a: number, b: number) => clamp01((u - a) / (b - a));
/** Overshooting pop 0→1 (for badges). */
const pop = (t: number) => {
  const x = clamp01(t);
  return x >= 1 ? 1 : 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
};

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}

const L = (env: IllusEnv, es: string, en: string) => (env.lang === 'es' ? es : en);
const num = (n: number, lang: Lang, digits = 0) => {
  const s = digits ? n.toFixed(digits) : String(Math.round(n));
  return lang === 'es' ? s.replace('.', ',') : s;
};

/** Frame index of `c` for loop time u mapped from [a, b]. */
function fi(c: LeniaClip, u: number, a: number, b: number): number {
  return seg(u, a, b) * (c.total - 1);
}

/** Dark microscope panel (rounded). */
function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 12, border = 'rgba(91,192,235,0.22)'): void {
  ctx.save();
  const g = ctx.createRadialGradient(x + w / 2, y + h * 0.45, 4, x + w / 2, y + h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, '#111823');
  g.addColorStop(1, '#06080b');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function clipRound(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 12): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();
}

/**
 * Draw a clip frame filling the box (x, y, w, h), `cells` cells across, centred
 * on the frame's centroid ('centroid'), on a fixed cell ('fixed', default the
 * grid centre) — toroidal tiling, so wrapping creatures stay whole.
 */
function drawClip(
  ctx: CanvasRenderingContext2D,
  c: LeniaClip,
  idx: number,
  x: number,
  y: number,
  w: number,
  h: number,
  o: { cells?: number; center?: 'centroid' | { x: number; y: number }; tint?: '' | 'grey' | 'warn'; alpha?: number; glow?: boolean } = {},
): void {
  const img = c.paint(idx, o.tint ?? '');
  if (!img) return;
  const N = c.N;
  const f = c.frame(idx);
  const cells = o.cells ?? N;
  const s = Math.max(w, h) / cells;
  const cc = o.center === 'centroid' ? { x: f.cx, y: f.cy } : (o.center ?? { x: N / 2, y: N / 2 });
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (o.glow !== false) {
    ctx.shadowColor = 'rgba(91,192,235,0.7)';
    ctx.shadowBlur = 6;
  }
  const ox = x + w / 2 - cc.x * s;
  const oy = y + h / 2 - cc.y * s;
  const W = N * s;
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      const px = ox + dx * W;
      const py = oy + dy * W;
      if (px > x + w || py > y + h || px + W < x || py + W < y) continue;
      ctx.drawImage(img, px, py, W, W);
    }
  ctx.restore();
}

/** A clip frame drawn as a free sprite centred at (x, y) and rotated. */
function drawClipSprite(
  ctx: CanvasRenderingContext2D,
  c: LeniaClip,
  idx: number,
  x: number,
  y: number,
  size: number,
  cells: number,
  rot = 0,
  alpha = 1,
  mirror = false,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (mirror) ctx.scale(-1, 1);
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, TAU);
  ctx.clip();
  drawClip(ctx, c, idx, -size / 2, -size / 2, size, size, { cells, center: 'centroid' });
  ctx.restore();
}

function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  o: { size?: number; weight?: number; color?: string; align?: CanvasTextAlign; mono?: boolean; alpha?: number; shadow?: boolean } = {},
): number {
  if (MINI) return 0;
  ctx.save();
  ctx.font = `${o.weight ?? 700} ${o.size ?? 11}px ${o.mono ? MONO : SANS}`;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha *= o.alpha ?? 1;
  if (o.shadow !== false) {
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 3;
  }
  ctx.fillStyle = o.color ?? UI.text;
  ctx.fillText(s, x, y);
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

/** Pill badge centred at (x, y). */
function badge(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, scale = 1, alpha = 1, size = 12): void {
  if (MINI || scale <= 0.01 || alpha <= 0.01) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha *= alpha;
  ctx.font = `800 ${size}px ${SANS}`;
  const w = ctx.measureText(s).width + 16;
  const h = size + 10;
  ctx.fillStyle = 'rgba(8,11,15,0.92)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.shadowColor = rgba(color, 0.6);
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, 0, 0.5);
  ctx.restore();
}

/** Round mark: ✓ (good) or ✗ (bad) in a disc. */
function mark(ctx: CanvasRenderingContext2D, ok: boolean, x: number, y: number, r: number, color: string, scale = 1): void {
  if (scale <= 0.01) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.shadowColor = rgba(color, 0.7);
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#0B0E12';
  ctx.lineWidth = r * 0.28;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (ok) {
    ctx.moveTo(-r * 0.45, 0);
    ctx.lineTo(-r * 0.1, r * 0.38);
    ctx.lineTo(r * 0.5, -r * 0.35);
  } else {
    ctx.moveTo(-r * 0.38, -r * 0.38);
    ctx.lineTo(r * 0.38, r * 0.38);
    ctx.moveTo(r * 0.38, -r * 0.38);
    ctx.lineTo(-r * 0.38, r * 0.38);
  }
  ctx.stroke();
  ctx.restore();
}

function arrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, width = 2.5, alpha = 1): void {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - Math.cos(a) * width * 2, y1 - Math.sin(a) * width * 2);
  ctx.stroke();
  const hl = width * 3.4;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - Math.cos(a - 0.5) * hl, y1 - Math.sin(a - 0.5) * hl);
  ctx.lineTo(x1 - Math.cos(a + 0.5) * hl, y1 - Math.sin(a + 0.5) * hl);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1, width = 2, dash: number[] = []): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.shadowColor = rgba(color, 0.6);
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** Falling drop + splash (seeding). */
function drop(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, fall = 40): void {
  if (t <= 0 || t >= 1.6) return;
  ctx.save();
  if (t < 1) {
    const yy = y - fall * (1 - easeInOut(t));
    ctx.fillStyle = '#9EF0FF';
    ctx.shadowColor = UI.accent;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(x, yy - 7);
    ctx.quadraticCurveTo(x + 5, yy, x, yy + 4);
    ctx.quadraticCurveTo(x - 5, yy, x, yy - 7);
    ctx.fill();
  } else {
    const k = (t - 1) / 0.6;
    ring(ctx, x, y, 4 + k * 18, UI.accent, 1 - k, 1.6);
  }
  ctx.restore();
}

/** "How much matter?" gauge: poca / justo / demasiada, with a marker at v (0..1). */
function gauge(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, v: number, env: IllusEnv, highlight: 'low' | 'ok' | 'high' | null): void {
  const w = 16;
  const zones: [number, number, string, string, 'low' | 'ok' | 'high'][] = [
    [0, 0.32, GREY, L(env, 'poca', 'too little'), 'low'],
    [0.32, 0.66, UI.good, L(env, 'justo', 'just right'), 'ok'],
    [0.66, 1, UI.warn, L(env, 'demasiada', 'too much'), 'high'],
  ];
  text(ctx, L(env, 'Materia', 'Matter'), x + w / 2, y - 8, { size: 10, color: UI.textDim, weight: 700 });
  for (const [a, b, col, label, id] of zones) {
    const y0 = y + h * (1 - b);
    const y1 = y + h * (1 - a);
    const hl = highlight === id;
    ctx.fillStyle = rgba(col, hl ? 0.55 : 0.22);
    ctx.beginPath();
    ctx.roundRect(x, y0 + 1, w, y1 - y0 - 2, 4);
    ctx.fill();
    if (hl) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    text(ctx, label, x + w + 6, (y0 + y1) / 2, { size: 10, color: hl ? col : UI.textDim, align: 'left', weight: hl ? 800 : 600 });
  }
  // Marker.
  const my = y + h * (1 - clamp01(v));
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(255,255,255,0.8)';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(x - 2, my);
  ctx.lineTo(x - 10, my - 5);
  ctx.lineTo(x - 10, my + 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x - 1, my - 1, w + 2, 2);
  ctx.restore();
}

/** Sprite of a catalog/bestiary pattern (matter colormap), cached. */
const patCache = new WeakMap<Pattern, HTMLCanvasElement>();
function patternCanvas(p: Pattern): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  let c = patCache.get(p);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = p.w;
  c.height = p.h;
  const ctx = c.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(p.w, p.h);
    for (let i = 0; i < p.w * p.h; i++) {
      const [r, g, b, a] = matterColor(p.data[i]);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = Math.round(a * 255);
    }
    ctx.putImageData(img, 0, 0);
  }
  patCache.set(p, c);
  return c;
}

function drawPattern(ctx: CanvasRenderingContext2D, p: Pattern, x: number, y: number, size: number, alpha = 1): void {
  const c = patternCanvas(p);
  if (!c) return;
  const s = size / Math.max(p.w, p.h);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.shadowColor = 'rgba(91,192,235,0.8)';
  ctx.shadowBlur = 6;
  ctx.drawImage(c, x - (p.w * s) / 2, y - (p.h * s) / 2, p.w * s, p.h * s);
  ctx.restore();
}

/** The last frame of the "live" clip: a settled Orbium, used as a small creature token. */
function creatureToken(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha = 1): void {
  const c = clip('live');
  drawClipSprite(ctx, c, c.frames.length - 1, x, y, size, 30, 0, alpha);
}

function essenceDrop(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string = UI.accent, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = r;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.4);
  ctx.bezierCurveTo(x + r * 1.1, y - r * 0.2, x + r, y + r, x, y + r);
  ctx.bezierCurveTo(x - r, y + r, x - r * 1.1, y - r * 0.2, x, y - r * 1.4);
  ctx.fill();
  ctx.restore();
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color = '#FFFFFF', alpha = 1): void {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
  ctx.restore();
}

/** Fade the whole box in/out at the loop seam. */
function seam(ctx: CanvasRenderingContext2D, u: number, loop: number): void {
  const a = Math.max(seg(u, loop - 0.45, loop), 1 - seg(u, 0, 0.25));
  if (a <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#06080b';
  ctx.fillRect(0, 0, ILLUS_W, ILLUS_H);
  ctx.restore();
}

// ───────────────────────────── outcome diagrams (seed / dissolve / explode / stable / overgrown) ─────────────────────────────

/** Gauge value for a clip frame: "how much matter vs. just right". */
function matterLevel(kind: 'fade' | 'flood' | 'live' | 'overgrow', c: LeniaClip, idx: number): number {
  const f = c.frame(idx);
  const f0 = c.frame(0);
  if (kind === 'fade') return 0.28 * (f.mass / Math.max(1, f0.mass));
  if (kind === 'flood' || kind === 'overgrow') return lerp(0.5, 1, clamp01((f.fill - 0.04) / 0.45));
  return lerp(0.36, 0.5, clamp01(f.mass / 80));
}

function outcome(kind: 'fade' | 'flood' | 'live' | 'overgrow'): IllusDef {
  const loop = kind === 'overgrow' ? 6.5 : 5.2;
  const t0 = 0.5;
  const t1 = kind === 'overgrow' ? 4.4 : 3.6;
  return {
    loop,
    keys: [0.08, 0.45, 0.8],
    clips: () => [clip(kind)],
    draw(ctx, u, env) {
      const c = clip(kind);
      const idx = fi(c, u, t0, t1);
      const px = 12;
      const py = 10;
      const S = 120;
      panel(ctx, px, py, S, S);
      const end = seg(u, t1, t1 + 0.35);
      const tint: '' | 'grey' | 'warn' =
        kind === 'overgrow' ? (u > t1 + 0.6 ? 'grey' : u > t1 ? 'warn' : '') : kind === 'flood' && end > 0 ? 'warn' : '';
      ctx.save();
      clipRound(ctx, px, py, S, S);
      drawClip(ctx, c, idx, px, py, S, S, {
        cells: kind === 'flood' || kind === 'overgrow' ? 64 : 44,
        center: kind === 'live' ? 'centroid' : undefined,
        tint,
      });
      ctx.restore();
      if (u < t0 + 0.1) drop(ctx, px + S / 2, py + S / 2, (u / (t0 + 0.1)) * 1.6, 44);
      const level = matterLevel(kind, c, idx);
      const hl = kind === 'fade' ? 'low' : kind === 'live' ? 'ok' : 'high';
      gauge(ctx, 168, 22, 104, level, env, end > 0 ? hl : null);
      // Result.
      const cx = px + S / 2;
      const cy = py + S / 2;
      if (kind === 'live') {
        if (end > 0) ring(ctx, cx, cy, 30 + 4 * Math.sin(u * 5), UI.good, end, 2.2);
        mark(ctx, true, px + S - 16, py + 16, 10, UI.good, pop(seg(u, t1, t1 + 0.4)));
        badge(ctx, '+1/s', cx, py + S - 14, UI.good, pop(seg(u, t1 + 0.25, t1 + 0.65)));
      } else if (kind === 'fade') {
        ring(ctx, cx, cy, 26, GREY, 0.6 * seg(u, t0 + 1.2, t1), 1.5, [3, 4]);
        mark(ctx, false, px + S - 16, py + 16, 10, GREY, pop(seg(u, t1, t1 + 0.4)));
        badge(ctx, '0/s', cx, cy, GREY, pop(seg(u, t1 + 0.2, t1 + 0.6)));
      } else {
        mark(ctx, false, px + S - 16, py + 16, 10, UI.warn, pop(seg(u, t1, t1 + 0.4)));
        badge(ctx, '0/s', cx, cy, UI.warn, pop(seg(u, t1 + 0.2, t1 + 0.6)));
      }
      if (kind === 'overgrow') {
        // "1 → 5 → 24": one creature buds into far too many.
        const n = countBlobs(c.frame(idx), c.N);
        const show = Math.max(1, n);
        text(ctx, `×${show}`, px + 18, py + 16, { size: 13, color: show > 3 ? UI.warn : UI.text, mono: true, weight: 800 });
      }
      seam(ctx, u, loop);
    },
  };
}

const seedTriptych: IllusDef = {
  loop: 6.2,
  keys: [0.1, 0.45, 0.82],
  clips: () => [clip('fade'), clip('flood'), clip('live')],
  draw(ctx, u, env) {
    const kinds = ['fade', 'flood', 'live'] as const;
    const labels = [
      [L(env, 'Se apaga', 'Fades'), GREY, false],
      [L(env, 'Lo inunda', 'Floods'), UI.warn, false],
      [L(env, '¡Vive!', 'Lives!'), UI.good, true],
    ] as const;
    const S = 74;
    const t0 = 0.7;
    const t1 = 4.2;
    kinds.forEach((k, i) => {
      const x = 9 + i * (S + 10);
      const y = 8;
      const c = clip(k);
      panel(ctx, x, y, S, S, 10);
      ctx.save();
      clipRound(ctx, x, y, S, S, 10);
      drawClip(ctx, c, fi(c, u, t0, t1), x, y, S, S, {
        cells: k === 'flood' ? 64 : 40,
        center: k === 'live' ? 'centroid' : undefined,
        tint: k === 'flood' && u > t1 ? 'warn' : '',
      });
      ctx.restore();
      drop(ctx, x + S / 2, y + S / 2, (u / t0) * 1.0 + (u > t0 ? seg(u, t0, t0 + 0.6) * 0.6 : 0), 30);
      const [label, col, ok] = labels[i];
      const k2 = pop(seg(u, t1 + i * 0.18, t1 + 0.45 + i * 0.18));
      mark(ctx, ok, x + S - 11, y + 11, 8, col, k2);
      text(ctx, label, x + S / 2, y + S + 16, { size: 13, color: u > t1 ? col : UI.textDim, weight: 800 });
      // How much matter: too little / too much / just right (same colours as the big gauge).
      const gy = y + S + 32;
      const zw = (S - 8) / 3;
      const zone = k === 'fade' ? 0 : k === 'flood' ? 2 : 1;
      [GREY, UI.good, UI.warn].forEach((zc, zi) => {
        ctx.fillStyle = rgba(zc, zi === zone && u > t1 ? 0.95 : 0.25);
        ctx.beginPath();
        ctx.roundRect(x + 4 + zi * zw + 1, gy - 3, zw - 2, 6, 3);
        ctx.fill();
      });
      if (u > t1) {
        const mx = x + 4 + zone * zw + zw / 2;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.moveTo(mx, gy - 4);
        ctx.lineTo(mx - 4, gy - 9);
        ctx.lineTo(mx + 4, gy - 9);
        ctx.closePath();
        ctx.fill();
      }
      if (ok && u > t1) ring(ctx, x + S / 2, y + S / 2, 20, UI.good, seg(u, t1, t1 + 0.4), 2);
    });
    // "?" over the three until the outcomes are known: the seed may become any of them.
    const q = 1 - seg(u, t1 - 0.4, t1);
    if (u > t0 && q > 0) text(ctx, '?', ILLUS_W / 2, 96, { size: 16, color: UI.textDim, alpha: q * (0.6 + 0.4 * Math.sin(u * 6)) });
    seam(ctx, u, 6.2);
  },
};

// ───────────────────────────── essence ─────────────────────────────

const essence: IllusDef = {
  loop: 5,
  keys: [0.2, 0.6, 0.95],
  clips: () => [clip('swim')],
  draw(ctx, u, env) {
    const c = clip('swim');
    const px = 10;
    const py = 14;
    const S = 112;
    panel(ctx, px, py, S, S);
    ctx.save();
    clipRound(ctx, px, py, S, S);
    drawClip(ctx, c, (u * 12) % c.total, px, py, S, S, { cells: 40, center: 'centroid' });
    ctx.restore();
    const cx = px + S / 2;
    const cy = py + S / 2;
    ring(ctx, cx, cy, 30 + Math.sin(u * 3) * 1.5, UI.accent, 0.8, 2);
    // Counter.
    const bx = 172;
    const by = 46;
    const every = env.rm ? 99 : 0.42;
    const flight = 0.9;
    let arrived = 0;
    const pts: { x: number; y: number; a: number }[] = [];
    for (let k = 0; k * every < u; k++) {
      const age = u - k * every;
      if (age >= flight) {
        arrived++;
        continue;
      }
      const tt = easeInOut(age / flight);
      const x0 = cx + 18;
      const y0 = cy - 10;
      const x1 = bx + 12;
      const y1 = by + 18;
      const mx = (x0 + x1) / 2;
      const my = Math.min(y0, y1) - 40;
      const x = (1 - tt) * (1 - tt) * x0 + 2 * (1 - tt) * tt * mx + tt * tt * x1;
      const y = (1 - tt) * (1 - tt) * y0 + 2 * (1 - tt) * tt * my + tt * tt * y1;
      pts.push({ x, y, a: 1 - Math.max(0, tt - 0.85) / 0.15 });
    }
    // Faint path.
    ctx.save();
    ctx.setLineDash([2, 5]);
    ctx.strokeStyle = rgba(UI.accent, 0.35);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + 18, cy - 10);
    ctx.quadraticCurveTo((cx + 18 + bx + 12) / 2, Math.min(cy - 10, by + 18) - 40, bx + 12, by + 18);
    ctx.stroke();
    ctx.restore();
    for (const p of pts) essenceDrop(ctx, p.x, p.y, 4, UI.accent, p.a);
    // HUD-like box.
    const bump = arrived > 0 ? Math.max(0, 1 - ((u - (arrived - 1) * every - flight) / 0.25)) : 0;
    ctx.save();
    ctx.translate(bx + 38, by + 18);
    ctx.scale(1 + bump * 0.12, 1 + bump * 0.12);
    ctx.fillStyle = 'rgba(13,17,23,0.95)';
    ctx.strokeStyle = rgba(UI.accent, 0.7 + bump * 0.3);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-38, -18, 76, 36, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    essenceDrop(ctx, bx + 14, by + 19, 5);
    text(ctx, String(20 + arrived), bx + 46, by + 19, { size: 16, mono: true, color: UI.accent, weight: 800 });
    text(ctx, L(env, 'Esencia', 'Essence'), bx + 38, by - 8, { size: 10, color: UI.textDim });
    badge(ctx, '+1', bx + 38, by + 52, UI.good, bump > 0 ? 1 + bump * 0.2 : 0.9, arrived ? 1 : 0.5);
    seam(ctx, u, 5);
  },
};

// ───────────────────────────── species ─────────────────────────────

function drawBook(ctx: CanvasRenderingContext2D, x: number, y: number, open: number, glow: number): void {
  ctx.save();
  ctx.translate(x, y);
  if (glow > 0) {
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 44);
    g.addColorStop(0, rgba(UI.good, 0.35 * glow));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-46, -46, 92, 92);
  }
  const a = 0.25 + open * 0.35;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.fillStyle = '#1F2A35';
    ctx.strokeStyle = rgba(UI.good, 0.85);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.quadraticCurveTo(14, -22 - a * 4, 30, -18 + a * 6);
    ctx.lineTo(30, 20);
    ctx.quadraticCurveTo(14, 16, 0, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(230,237,243,0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(8, -6 + i * 8);
      ctx.lineTo(24, -5 + i * 8);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

const species: IllusDef = {
  loop: 5.4,
  keys: [0.15, 0.4, 0.85],
  clips: () => [clip('swim')],
  draw(ctx, u, env) {
    const c = clip('swim');
    const px = 10;
    const py = 14;
    const S = 112;
    panel(ctx, px, py, S, S);
    const cx = px + S / 2;
    const cy = py + S / 2;
    const portrait = env.portrait ?? null;
    ctx.save();
    clipRound(ctx, px, py, S, S);
    if (portrait) drawPattern(ctx, portrait, cx, cy, 64);
    else drawClip(ctx, c, (u * 10) % c.total, px, py, S, S, { cells: 40, center: 'centroid' });
    ctx.restore();
    // Viewfinder corners (a photo is being taken).
    const k = 1 - seg(u, 0.2, 0.9) * 0.25;
    ctx.save();
    ctx.strokeStyle = rgba(UI.good, 0.9);
    ctx.lineWidth = 2;
    const h = 30 * k;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(cx + sx * h, cy + sy * (h - 9));
      ctx.lineTo(cx + sx * h, cy + sy * h);
      ctx.lineTo(cx + sx * (h - 9), cy + sy * h);
      ctx.stroke();
    }
    ctx.restore();
    // Flash.
    const fl = seg(u, 1.0, 1.1) * (1 - seg(u, 1.1, 1.5));
    if (fl > 0) {
      ctx.fillStyle = `rgba(255,255,255,${(0.7 * fl).toFixed(3)})`;
      ctx.beginPath();
      ctx.roundRect(px, py, S, S, 12);
      ctx.fill();
    }
    // Card flying into the book.
    const bx = 206;
    const by = 64;
    const fly = easeInOut(seg(u, 1.3, 2.5));
    const inBook = u >= 2.5;
    drawBook(ctx, bx, by, inBook ? 1 : 0, seg(u, 2.4, 2.8) * (1 - seg(u, 4.4, 5)));
    if (u > 1.2 && !inBook) {
      const x = lerp(cx, bx, fly);
      const y = lerp(cy, by, fly) - Math.sin(fly * Math.PI) * 36;
      const sc = lerp(1, 0.45, fly);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(fly * 0.5);
      ctx.scale(sc, sc);
      ctx.fillStyle = '#E8F7EE';
      ctx.shadowColor = 'rgba(138,226,52,0.6)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.roundRect(-24, -30, 48, 60, 6);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0B0E12';
      ctx.beginPath();
      ctx.roundRect(-19, -25, 38, 38, 4);
      ctx.fill();
      if (portrait) drawPattern(ctx, portrait, 0, -6, 32);
      else drawClipSprite(ctx, c, 10, 0, -6, 36, 32);
      ctx.fillStyle = '#2A3440';
      ctx.fillRect(-14, 18, 28, 3);
      ctx.restore();
    }
    if (inBook) {
      badge(ctx, L(env, '+1 Muestra', '+1 Sample'), bx, by - 40, UI.good, pop(seg(u, 2.6, 3.0)));
      text(ctx, L(env, 'Bestiario', 'Bestiary'), bx, by + 36, { size: 11, color: UI.good });
      for (let i = 0; i < 4; i++) sparkle(ctx, bx + Math.cos(i * 1.7 + u * 2) * 34, by + Math.sin(i * 1.7 + u * 2) * 26, 3, '#D9FFB8', seg(u, 2.5, 2.8) * (1 - seg(u, 3.6, 4.2)));
    }
    seam(ctx, u, 5.4);
  },
};

// ───────────────────────────── behaviours ─────────────────────────────

/** Unwrapped centroid path of a clip (torus), first frame at (0, 0). */
function unwrappedPath(c: LeniaClip): { x: number; y: number }[] {
  const N = c.N;
  const out: { x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < c.frames.length; i++) {
    if (i > 0) {
      let dx = c.frames[i].cx - c.frames[i - 1].cx;
      let dy = c.frames[i].cy - c.frames[i - 1].cy;
      dx -= Math.round(dx / N) * N;
      dy -= Math.round(dy / N) * N;
      x += dx;
      y += dy;
    }
    out.push({ x, y });
  }
  return out;
}

function swimDirection(c: LeniaClip): number {
  const p = unwrappedPath(c);
  const last = p[p.length - 1];
  return Math.atan2(last.y, last.x);
}

const swimmer: IllusDef = {
  loop: 5.5,
  keys: [0.1, 0.5, 0.9],
  clips: () => [clip('swim')],
  draw(ctx, u, env) {
    const c = clip('swim');
    panel(ctx, 6, 16, 248, 104);
    const path = unwrappedPath(c);
    const n = path.length;
    if (n < 2) return;
    const ang = swimDirection(c);
    const ca = Math.cos(-ang);
    const sa = Math.sin(-ang);
    // Project the real path on its own direction: travel → x across the strip.
    const proj = path.map((p) => ({ along: p.x * ca - p.y * sa, side: p.x * sa + p.y * ca }));
    const maxAlong = Math.max(1, proj[n - 1].along);
    const x0 = 34;
    const x1 = 222;
    const t = seg(u, 0.3, 4.6);
    const idx = t * (n - 1);
    const at = (i: number) => {
      const q = proj[Math.max(0, Math.min(n - 1, Math.round(i)))];
      return { x: x0 + (q.along / maxAlong) * (x1 - x0), y: 68 + q.side * 2 };
    };
    const head = at(idx);
    // Trail: dots + chevrons.
    ctx.save();
    for (let i = 0; i < idx; i += 2) {
      const p = at(i);
      ctx.fillStyle = rgba(BEHAVIOR_COLOR.swimmer, 0.15 + 0.5 * (i / Math.max(1, idx)));
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    for (let k = 1; k <= 3; k++) {
      const cx = head.x - 30 - k * 16;
      if (cx < x0 - 6) continue;
      const a = 0.25 + 0.2 * k;
      ctx.save();
      ctx.strokeStyle = rgba(BEHAVIOR_COLOR.swimmer, (1 - k / 4) * a * 2);
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 4, head.y - 8);
      ctx.lineTo(cx + 4, head.y);
      ctx.lineTo(cx - 4, head.y + 8);
      ctx.stroke();
      ctx.restore();
    }
    drawClipSprite(ctx, c, idx, head.x, head.y, 74, 34, -ang);
    arrow(ctx, head.x + 30, head.y, head.x + 52, head.y, BEHAVIOR_COLOR.swimmer, 3, 0.9);
    text(ctx, L(env, 'nada sin parar', 'swims nonstop'), 130, 132, { size: 11, color: BEHAVIOR_COLOR.swimmer });
    badge(ctx, `×${num(BEHAVIOR_MULT.swimmer, env.lang, 1)}`, 226, 32, BEHAVIOR_COLOR.swimmer, 1);
    seam(ctx, u, 5.5);
  },
};

const spinner: IllusDef = {
  loop: 6,
  keys: [0.1, 0.5, 0.9],
  clips: () => [clip('spin')],
  draw(ctx, u, env) {
    const c = clip('spin');
    const px = 70;
    const py = 10;
    const S = 120;
    panel(ctx, px, py, S, S, 60);
    // Centre on the mean centroid: the creature itself circles.
    let mx = 0;
    let my = 0;
    const path = unwrappedPath(c);
    for (const p of path) {
      mx += p.x;
      my += p.y;
    }
    mx /= Math.max(1, path.length);
    my /= Math.max(1, path.length);
    const f0 = c.frame(0);
    const center = { x: f0.cx + mx, y: f0.cy + my };
    const idx = (u * 10) % c.total;
    ctx.save();
    ctx.beginPath();
    ctx.arc(px + S / 2, py + S / 2, S / 2, 0, TAU);
    ctx.clip();
    drawClip(ctx, c, idx, px, py, S, S, { cells: 46, center });
    ctx.restore();
    const cx = px + S / 2;
    const cy = py + S / 2;
    // Circular arrows turning around it.
    const rot = env.rm ? 0.6 : u * 1.4;
    ctx.save();
    ctx.strokeStyle = BEHAVIOR_COLOR.spinner;
    ctx.fillStyle = BEHAVIOR_COLOR.spinner;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      const a0 = rot + k * Math.PI;
      const a1 = a0 + 2.1;
      const R = 66;
      ctx.beginPath();
      ctx.arc(cx, cy, R, a0, a1);
      ctx.stroke();
      const hx = cx + Math.cos(a1) * R;
      const hy = cy + Math.sin(a1) * R;
      const ta = a1 + Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(hx + Math.cos(ta) * 8, hy + Math.sin(ta) * 8);
      ctx.lineTo(hx + Math.cos(ta + 2.4) * 7, hy + Math.sin(ta + 2.4) * 7);
      ctx.lineTo(hx + Math.cos(ta - 2.4) * 7, hy + Math.sin(ta - 2.4) * 7);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // The real path of its centre, enlarged ×3 so the circle is easy to see.
    ctx.save();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = rgba(BEHAVIOR_COLOR.spinner, 0.7);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    const s = (S / 46) * 3;
    path.forEach((p, i) => {
      const x = cx + (p.x - mx) * s;
      const y = cy + (p.y - my) * s;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
    const cur = path[Math.min(path.length - 1, Math.floor(idx))];
    if (cur) ring(ctx, cx + (cur.x - mx) * s, cy + (cur.y - my) * s, 3, BEHAVIOR_COLOR.spinner, 1, 2);
    badge(ctx, `×${num(BEHAVIOR_MULT.spinner, env.lang, 1)}`, 226, 24, BEHAVIOR_COLOR.spinner, 1);
    text(ctx, L(env, 'da vueltas', 'goes round'), 34, 124, { size: 11, color: BEHAVIOR_COLOR.spinner });
  },
};

const pulsing: IllusDef = {
  loop: 6,
  keys: [0.2, 0.5, 0.8],
  clips: () => [clip('pulse')],
  draw(ctx, u, env) {
    const c = clip('pulse');
    const px = 10;
    const py = 12;
    const S = 116;
    panel(ctx, px, py, S, S);
    const n = c.frames.length;
    const idx = (u * 9) % Math.max(1, n);
    ctx.save();
    clipRound(ctx, px, py, S, S);
    drawClip(ctx, c, idx, px, py, S, S, { cells: 26 });
    ctx.restore();
    let lo = Infinity;
    let hi = -Infinity;
    for (const f of c.frames) {
      lo = Math.min(lo, f.mass);
      hi = Math.max(hi, f.mass);
    }
    const norm = (m: number) => (hi > lo ? (m - lo) / (hi - lo) : 0.5);
    const m = norm(c.frame(idx).mass);
    const cx = px + S / 2;
    const cy = py + S / 2;
    ring(ctx, cx, cy, 38 + m * 8, BEHAVIOR_COLOR.pulsing, 0.5 + m * 0.5, 2 + m);
    ring(ctx, cx, cy, 50 + m * 10, BEHAVIOR_COLOR.pulsing, 0.25 * m, 1.5);
    // Heartbeat graph of its real size over time.
    const gx = 146;
    const gy = 44;
    const gw = 104;
    const gh = 54;
    ctx.save();
    ctx.fillStyle = 'rgba(13,17,23,0.9)';
    ctx.strokeStyle = rgba(BEHAVIOR_COLOR.pulsing, 0.4);
    ctx.beginPath();
    ctx.roundRect(gx, gy, gw, gh, 8);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(gx + 2, gy + 2, gw - 4, gh - 4);
    ctx.clip();
    ctx.strokeStyle = BEHAVIOR_COLOR.pulsing;
    ctx.lineWidth = 2;
    ctx.shadowColor = BEHAVIOR_COLOR.pulsing;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    const span = 40;
    for (let k = 0; k <= span; k++) {
      const j = (((idx - span + k) % n) + n) % n;
      const x = gx + 4 + (k / span) * (gw - 8);
      const y = gy + gh - 8 - norm(c.frame(j).mass) * (gh - 16);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    text(ctx, L(env, 'tamaño', 'size'), gx + 4, gy - 9, { size: 10, color: UI.textDim, align: 'left' });
    text(ctx, L(env, 'late como un corazón', 'beats like a heart'), gx + gw / 2, gy + gh + 14, { size: 10, color: BEHAVIOR_COLOR.pulsing });
    badge(ctx, `×${num(BEHAVIOR_MULT.pulsing, env.lang, 1)}`, 228, 20, BEHAVIOR_COLOR.pulsing, 1);
  },
};

const still: IllusDef = {
  loop: 6,
  keys: [0.2, 0.5, 0.8],
  clips: () => [clip('still')],
  draw(ctx, u, env) {
    const c = clip('still');
    const px = 70;
    const py = 10;
    const S = 120;
    panel(ctx, px, py, S, S, 14);
    const idx = (u * 2.5) % c.total;
    ctx.save();
    clipRound(ctx, px, py, S, S, 14);
    drawClip(ctx, c, idx, px, py, S, S, { cells: 64 });
    ctx.restore();
    const cx = px + S / 2;
    const cy = py + S / 2;
    ctx.save();
    ctx.strokeStyle = rgba(BEHAVIOR_COLOR.still, 0.45);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(px + 6, cy);
    ctx.lineTo(px + S - 6, cy);
    ctx.moveTo(cx, py + 6);
    ctx.lineTo(cx, py + S - 6);
    ctx.stroke();
    ctx.restore();
    ring(ctx, cx, cy, 38, BEHAVIOR_COLOR.still, 0.9, 2, [5, 5]);
    // Pin.
    ctx.save();
    ctx.translate(cx + 30, cy - 36);
    ctx.fillStyle = BEHAVIOR_COLOR.still;
    ctx.shadowColor = BEHAVIOR_COLOR.still;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(0, -6, 6, Math.PI, 0);
    ctx.lineTo(0, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0B0E12';
    ctx.beginPath();
    ctx.arc(0, -6, 2.4, 0, TAU);
    ctx.fill();
    ctx.restore();
    // A clock: time passes, it stays.
    const kx = 34;
    const ky = 56;
    ring(ctx, kx, ky, 16, UI.textDim, 0.8, 1.5);
    const ha = env.rm ? -1 : u * 2.2 - Math.PI / 2;
    arrow(ctx, kx, ky, kx + Math.cos(ha) * 11, ky + Math.sin(ha) * 11, UI.textDim, 1.6);
    text(ctx, L(env, 'se queda', 'stays put'), 34, 90, { size: 11, color: BEHAVIOR_COLOR.still });
    badge(ctx, `×${num(BEHAVIOR_MULT.still, env.lang, 1)}`, 226, 24, BEHAVIOR_COLOR.still, 1);
  },
};

/** One creature that splits (real swimming Orbium frames, mirrored for the second child). */
function splitter(generations: 1 | 2, color: string): IllusDef {
  const loop = generations === 2 ? 6.4 : 5.2;
  return {
    loop,
    keys: [0.08, 0.4, 0.85],
    clips: () => [clip('swim')],
    draw(ctx, u, env) {
      const c = clip('swim');
      panel(ctx, 6, 14, 248, 112);
      const ang = swimDirection(c);
      const cx = 130;
      const cy = 70;
      const idx = (u * 10) % c.total;
      const split1 = 1.0;
      const sep1 = easeOut(seg(u, split1, split1 + 1.4));
      const counts: number[] = [1];
      if (u < split1) {
        const wob = env.rm ? 0 : Math.sin(u * 16) * 0.04 * seg(u, 0.3, split1);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1 + wob, 1 - wob);
        ctx.translate(-cx, -cy);
        drawClipSprite(ctx, c, idx, cx, cy, 78, 34, -ang);
        ctx.restore();
      } else {
        // Snip!
        const snip = 1 - seg(u, split1, split1 + 0.35);
        if (snip > 0) {
          ctx.save();
          ctx.strokeStyle = rgba('#FFFFFF', snip);
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(cx, cy - 34);
          ctx.lineTo(cx, cy + 34);
          ctx.stroke();
          ctx.restore();
        }
        const d1 = sep1 * (generations === 2 ? 52 : 64);
        const kids: { x: number; y: number; m: boolean }[] = [
          { x: cx - d1, y: cy, m: true },
          { x: cx + d1, y: cy, m: false },
        ];
        counts.push(2);
        let final = kids;
        if (generations === 2) {
          const split2 = split1 + 2.0;
          if (u >= split2) {
            const sep2 = easeOut(seg(u, split2, split2 + 1.2));
            final = kids.flatMap((k) => [
              { x: k.x, y: k.y - sep2 * 26, m: k.m },
              { x: k.x, y: k.y + sep2 * 26, m: k.m },
            ]);
            counts.push(4);
          }
        }
        const size = final.length > 2 ? 54 : 70;
        for (const k of final) {
          drawClipSprite(ctx, c, idx + (k.y > cy ? 7 : 0), k.x, k.y, size, 34, k.m ? -ang + Math.PI : -ang, 1);
          ring(ctx, k.x, k.y, size * 0.36, color, 0.75 * sep1, 1.8);
        }
      }
      // 1 → 2 (→ 4)
      const label = counts.join(' → ');
      text(ctx, label, cx, 24, { size: 14, mono: true, color, weight: 800 });
      if (generations === 2) badge(ctx, `×${num(BEHAVIOR_MULT.divider, env.lang, 1)}`, 226, 32, color, 1);
      text(ctx, generations === 2 ? L(env, 'una y otra vez', 'again and again') : L(env, 'una se hizo dos', 'one became two'), cx, 118, {
        size: 11,
        color,
      });
      seam(ctx, u, loop);
    },
  };
}

const colony: IllusDef = {
  loop: 6,
  keys: [0.3, 0.6],
  clips: () => [clip('live')],
  draw(ctx, u, env) {
    panel(ctx, 6, 8, 248, 124);
    const col = BEHAVIOR_COLOR.colony;
    const cx = 120;
    const cy = 72;
    const pts = [
      { x: cx, y: cy - 30 },
      { x: cx - 34, y: cy + 22 },
      { x: cx + 34, y: cy + 22 },
    ];
    const show = [seg(u, 0.2, 0.6), seg(u, 0.7, 1.1), seg(u, 1.2, 1.6)];
    // Links.
    const hull = seg(u, 1.8, 2.4);
    ctx.save();
    ctx.strokeStyle = rgba(col, 0.5 * hull);
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 3];
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.restore();
    pts.forEach((p, i) => {
      if (show[i] <= 0) return;
      const k = easeOut(show[i]);
      // Same species three times (a real settled Orbium), each a little turned.
      ctx.save();
      ctx.translate(p.x, p.y + Math.sin(u * 2 + i * 2) * 1.5);
      ctx.rotate(i * 2.1 + 0.4);
      creatureToken(ctx, 0, 0, 44 * k);
      ctx.restore();
      ring(ctx, p.x, p.y, 17 * k, col, 0.6 * k, 1.5);
    });
    ring(ctx, cx, cy, 62, col, hull, 2.4, [7, 5]);
    badge(ctx, `×${num(BEHAVIOR_MULT.colony, env.lang, 1)}`, cx + 74, cy - 46, col, pop(seg(u, 2.3, 2.7)));
    text(ctx, L(env, '3 iguales, juntitas', '3 alike, together'), 16, 122, { size: 11, color: col, alpha: hull, align: 'left' });
    seam(ctx, u, 6);
  },
};

// ───────────────────────────── golden spark ─────────────────────────────

function drawSparkDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, u: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
  g.addColorStop(0, 'rgba(255,240,190,0.95)');
  g.addColorStop(0.35, rgba(UI.gold, 0.6));
  g.addColorStop(1, 'rgba(255,209,102,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 3, 0, TAU);
  ctx.fill();
  sparkle(ctx, x, y, r * (1.3 + 0.2 * Math.sin(u * 10)), '#FFF6D8');
}

function drawHand(ctx: CanvasRenderingContext2D, x: number, y: number, press: number): void {
  ctx.save();
  ctx.translate(x, y + press * 3);
  ctx.rotate(-0.35);
  ctx.fillStyle = '#F4E3D3';
  ctx.strokeStyle = '#0B0E12';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-4, -2, 8, 22, 4); // finger
  ctx.roundRect(-9, 12, 20, 22, 7); // palm
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawGift(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  if (s <= 0.01) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = UI.gold;
  ctx.shadowColor = UI.gold;
  ctx.shadowBlur = 10;
  ctx.fillRect(-12, -6, 24, 18);
  ctx.fillRect(-14, -11, 28, 7);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#E4572E';
  ctx.fillRect(-2.5, -11, 5, 23);
  ctx.beginPath();
  ctx.ellipse(-5, -14, 5, 3, -0.5, 0, TAU);
  ctx.ellipse(5, -14, 5, 3, 0.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

const golden: IllusDef = {
  loop: 5,
  keys: [0.2, 0.55, 0.75],
  clips: () => [clip('swim')],
  draw(ctx, u, env) {
    const c = clip('swim');
    panel(ctx, 6, 8, 248, 124);
    drawClipSprite(ctx, c, 5, 48, 96, 44, 34, 0.4, 0.55);
    drawClipSprite(ctx, c, 20, 214, 44, 40, 34, 2.2, 0.55);
    const tap = 2.6;
    const tt = Math.min(u, tap) / tap;
    const sx = lerp(30, 150, tt);
    const sy = 62 + Math.sin(tt * 5) * 16;
    if (u < tap + 0.05) {
      // Trail.
      for (let k = 1; k < 10; k++) {
        const t2 = Math.max(0, tt - k * 0.025);
        sparkle(ctx, lerp(30, 150, t2), 62 + Math.sin(t2 * 5) * 16, 2.4 - k * 0.2, UI.gold, 0.5 - k * 0.05);
      }
      drawSparkDot(ctx, sx, sy, 5, u);
      // Hand comes in.
      const hk = easeInOut(seg(u, 1.4, tap));
      if (hk > 0) drawHand(ctx, lerp(236, sx + 4, hk), lerp(132, sy + 4, hk), seg(u, tap - 0.15, tap));
      if (u > 1.2) text(ctx, L(env, '¡Tócala!', 'Tap it!'), sx, sy - 22, { size: 12, color: UI.gold, alpha: seg(u, 1.2, 1.5) });
    } else {
      const k = seg(u, tap, tap + 0.8);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        sparkle(ctx, sx + Math.cos(a) * k * 40, sy + Math.sin(a) * k * 30, 3 * (1 - k) + 0.5, UI.gold, 1 - k);
      }
      ring(ctx, sx, sy, 8 + k * 30, UI.gold, 1 - k, 2);
      drawGift(ctx, sx, sy, pop(seg(u, tap + 0.2, tap + 0.6)));
      badge(ctx, L(env, '¡Premio!', 'A gift!'), sx, sy - 34, UI.gold, pop(seg(u, tap + 0.4, tap + 0.8)));
    }
    seam(ctx, u, 5);
  },
};

// ───────────────────────────── upgrade ─────────────────────────────

/** Dropper: more seeds take. Two rows of four seeds, before / now (real spore, real Orbium). */
function drawDropperUpgrade(ctx: CanvasRenderingContext2D, u: number, env: IllusEnv): void {
  const rows = [
    { y: 46, label: L(env, 'Antes', 'Before'), ok: [false, true, false, false] },
    { y: 104, label: L(env, 'Ahora', 'Now'), ok: [true, true, false, true] },
  ];
  rows.forEach((r, ri) => {
    const show = seg(u, 0.3 + ri * 1.4, 1.5 + ri * 1.4);
    text(ctx, r.label, 40, r.y, { size: 12, color: ri ? UI.good : UI.textDim, weight: 800 });
    r.ok.forEach((ok, i) => {
      const x = 84 + i * 36;
      const k = seg(show, i * 0.18, i * 0.18 + 0.4);
      if (k <= 0) return;
      if (ok) creatureToken(ctx, x, r.y, 34 * easeOut(k));
      else ring(ctx, x, r.y, 11, GREY, 0.7 * k, 1.5, [3, 3]);
      mark(ctx, ok, x + 12, r.y - 12, 6, ok ? UI.good : GREY, pop(seg(k, 0.6, 1)));
    });
    const n = r.ok.filter(Boolean).length;
    badge(ctx, `${n}/4`, 228, r.y, ri ? UI.good : GREY, pop(seg(show, 0.8, 1)));
  });
}

/** Dish: one more cheap slot. */
function drawDishUpgrade(ctx: CanvasRenderingContext2D, u: number, env: IllusEnv): void {
  const cx = 130;
  const cy = 70;
  panel(ctx, cx - 56, cy - 56, 112, 112, 56);
  const k = easeOut(seg(u, 1.0, 1.8));
  const free = 2;
  for (let i = 0; i < free; i++) {
    const p = socketPos(i, free, cx, cy);
    const isNew = i === 1;
    ring(ctx, p.x, p.y, 15, UI.good, isNew ? k : 0.9, 2.2, isNew ? [3, 3] : []);
    if (!isNew) creatureToken(ctx, p.x, p.y, 30);
  }
  if (k > 0) badge(ctx, '+1', socketPos(1, free, cx, cy).x + 22, socketPos(1, free, cx, cy).y - 18, UI.good, pop(k));
  text(ctx, L(env, 'espacios baratos', 'cheap slots'), cx, 134, { size: 10, color: UI.textDim });
  text(ctx, k > 0.5 ? '2' : '1', 220, 70, { size: 28, mono: true, color: UI.good, weight: 800 });
}

const upgrade: IllusDef = {
  loop: 4.5,
  keys: [0.2, 0.7],
  clips: (env) => (env.data.upgradeId === 'dropper' || env.data.upgradeId === 'dish' ? [clip('live')] : []),
  draw(ctx, u, env) {
    if (env.data.upgradeId === 'dropper') {
      panel(ctx, 6, 8, 248, 124);
      drawDropperUpgrade(ctx, u, env);
      seam(ctx, u, 4.5);
      return;
    }
    if (env.data.upgradeId === 'dish') {
      drawDishUpgrade(ctx, u, env);
      seam(ctx, u, 4.5);
      return;
    }
    panel(ctx, 30, 14, 200, 112, 16);
    const fill = easeOut(seg(u, 0.8, 1.6));
    // Flask with an up arrow.
    const fx = 74;
    const fy = 70;
    ctx.save();
    ctx.strokeStyle = UI.accent;
    ctx.lineWidth = 2.4;
    ctx.fillStyle = rgba(UI.accent, 0.18 + 0.3 * fill);
    ctx.beginPath();
    ctx.moveTo(fx - 8, fy - 30);
    ctx.lineTo(fx - 8, fy - 8);
    ctx.lineTo(fx - 24, fy + 22);
    ctx.quadraticCurveTo(fx, fy + 32, fx + 24, fy + 22);
    ctx.lineTo(fx + 8, fy - 8);
    ctx.lineTo(fx + 8, fy - 30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    arrow(ctx, fx, fy + 14, fx, fy - 12 - fill * 6, UI.good, 3.4);
    // Level pips: one lights up.
    text(ctx, L(env, 'Nivel', 'Level'), 168, 40, { size: 11, color: UI.textDim });
    for (let i = 0; i < 5; i++) {
      const x = 130 + i * 19;
      const y = 64;
      const on = i === 0 ? fill : 0;
      ctx.save();
      ctx.fillStyle = on > 0 ? rgba(UI.good, 0.3 + 0.7 * on) : 'rgba(230,237,243,0.08)';
      ctx.strokeStyle = on > 0 ? UI.good : 'rgba(230,237,243,0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x - 7, y - 10, 14, 20, 4);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    const pk = pop(seg(u, 1.4, 1.8));
    badge(ctx, '0 → 1', 168, 98, UI.good, pk);
    for (let i = 0; i < 5; i++) sparkle(ctx, 130 + Math.cos(i * 2.1 + u * 3) * 20, 64 + Math.sin(i * 2.1 + u * 3) * 18, 3, '#D9FFB8', seg(u, 1.4, 1.7) * (1 - seg(u, 2.6, 3.2)));
    seam(ctx, u, 4.5);
  },
};

// ───────────────────────────── auto-seeder ─────────────────────────────

const autoseed: IllusDef = {
  loop: 6.6,
  keys: [0.2, 0.5, 0.85],
  clips: () => [clip('live')],
  draw(ctx, u, env) {
    const c = clip('live');
    panel(ctx, 6, 8, 248, 124);
    const spots = [
      { x: 60, y: 92 },
      { x: 130, y: 84 },
      { x: 200, y: 96 },
    ];
    const per = 1.8;
    // Rail.
    ctx.save();
    ctx.strokeStyle = 'rgba(230,237,243,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 26);
    ctx.lineTo(240, 26);
    ctx.stroke();
    ctx.restore();
    let rx = spots[0].x;
    spots.forEach((s, i) => {
      const t0 = 0.3 + i * per;
      const local = u - t0;
      if (local > -per && local < 0) rx = lerp(i ? spots[i - 1].x : 20, s.x, easeInOut((local + per) / (per * 0.5)));
      if (local >= 0) rx = s.x;
      if (local > 0.3) {
        // The spore grows into a creature (real clip).
        const k = seg(local, 0.3, 4);
        drawClipSprite(ctx, c, k * (c.total - 1), s.x, s.y, 50, 34, i * 1.3);
        if (local < 1.4) {
          const fk = seg(local, 0.35, 1.4);
          text(ctx, '−2', s.x + 14, s.y - 20 - fk * 16, { size: 12, color: UI.warn, alpha: 1 - fk, mono: true });
        }
      }
      drop(ctx, s.x, s.y, seg(local, 0, 0.45) * 1.6, 56);
    });
    // The robot dropper.
    ctx.save();
    ctx.translate(rx, 26);
    ctx.fillStyle = '#2A3440';
    ctx.strokeStyle = '#7FA8C0';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(-14, -9, 28, 16, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#9EF0FF';
    ctx.beginPath();
    ctx.arc(-5, -1, 2.2, 0, TAU);
    ctx.arc(5, -1, 2.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#7FA8C0';
    ctx.beginPath();
    ctx.moveTo(0, 7);
    ctx.lineTo(0, 13);
    ctx.stroke();
    ctx.restore();
    text(ctx, L(env, 'siembra solito', 'sows by itself'), 130, 122, { size: 10, color: '#7FA8C0' });
    seam(ctx, u, 6.6);
  },
};

// ───────────────────────────── rules (calibration) ─────────────────────────────

/** How a "same spore, these rules" clip ended: one creature, nothing, or far too much. */
function verdict(c: LeniaClip): 'live' | 'dead' | 'flood' {
  const f = c.frame(c.frames.length - 1);
  if (f.mass < 5) return 'dead';
  if (f.fill > 0.4 || countBlobs(f, c.N) > 3) return 'flood';
  return 'live';
}

const rules: IllusDef = {
  loop: 6,
  keys: [0.1, 0.5, 0.9],
  clips: (env) => {
    const from = env.data.calibFrom ?? { mu: 0.15, sigma: 0.015, R: 13, dt: 0.1 };
    const to = env.data.calibTo ?? { mu: 0.15, sigma: 0.027, R: 13, dt: 0.1 };
    return [rulesClip(from), rulesClip(to)];
  },
  draw(ctx, u, env) {
    const [a, b] = rules.clips(env);
    const from = env.data.calibFrom ?? { mu: 0.15, sigma: 0.015, R: 13, dt: 0.1 };
    const to = env.data.calibTo ?? { mu: 0.15, sigma: 0.027, R: 13, dt: 0.1 };
    const S = 96;
    const items = [
      { c: a, x: 14, p: from, label: L(env, 'Antes', 'Before') },
      { c: b, x: 150, p: to, label: L(env, 'Ahora', 'Now') },
    ];
    const keyOf = (p: typeof from) => {
      const dm = Math.abs(to.mu - from.mu) / Math.max(1e-9, from.mu);
      const ds = Math.abs(to.sigma - from.sigma) / Math.max(1e-9, from.sigma);
      return ds > dm ? `σ ${num(p.sigma, env.lang, 4)}` : `μ ${num(p.mu, env.lang, 3)}`;
    };
    for (const it of items) {
      const y = 22;
      panel(ctx, it.x, y, S, S, 12);
      const v = verdict(it.c);
      const end = u > 4;
      ctx.save();
      clipRound(ctx, it.x, y, S, S, 12);
      drawClip(ctx, it.c, fi(it.c, u, 0.4, 4), it.x, y, S, S, {
        cells: v === 'flood' ? 64 : 44,
        center: v === 'live' ? 'centroid' : undefined,
        tint: end && v === 'flood' ? 'warn' : '',
      });
      ctx.restore();
      text(ctx, it.label, it.x + S / 2, 10, { size: 12, color: UI.text, weight: 800 });
      text(ctx, keyOf(it.p), it.x + S / 2, y + S + 12, { size: 11, color: UI.accent, mono: true });
      const col = v === 'live' ? UI.good : v === 'flood' ? UI.warn : GREY;
      mark(ctx, v === 'live', it.x + S - 12, y + 12, 9, col, pop(seg(u, 4, 4.4)));
    }
    arrow(ctx, 116, 70, 144, 70, UI.accent, 3);
    seam(ctx, u, 6);
  },
};

// ───────────────────────────── seed price ─────────────────────────────

interface PriceDemo {
  base: number;
  free: number;
  used: number;
}

function priceDemo(env: IllusEnv): PriceDemo {
  const p = env.data.price;
  const free = Math.max(1, Math.min(6, p?.freeSlots ?? 1));
  const used = Math.max(free + 1, Math.min(free + 2, p?.used ?? free + 2));
  return { base: p?.base ?? 2, free, used };
}

const CROWD = 0.25;
const SAT = 3;
const priceAt = (d: PriceDemo, k: number) => d.base * (1 + CROWD * k) * Math.pow(SAT, Math.max(0, k - d.free));

function socketPos(i: number, free: number, cx: number, cy: number): { x: number; y: number } {
  if (free === 1) return { x: cx, y: cy };
  const a = -Math.PI / 2 + (i / free) * TAU;
  const r = free <= 3 ? 22 : 30;
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
}

function extraPos(j: number, cx: number, cy: number): { x: number; y: number } {
  const a = 0.5 + j * 1.25;
  return { x: cx + Math.cos(a) * 46, y: cy + Math.sin(a) * 44 };
}

function priceTag(ctx: CanvasRenderingContext2D, x: number, y: number, value: number, prev: number, bounce: number, over: boolean, env: IllusEnv): void {
  const col = over ? UI.warn : UI.good;
  ctx.save();
  ctx.translate(x, y);
  const s = 1 + 0.22 * bounce;
  ctx.scale(s, s);
  ctx.rotate(-0.06 + bounce * 0.05);
  ctx.fillStyle = 'rgba(13,17,23,0.96)';
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.shadowColor = rgba(col, 0.6);
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(-34, -20);
  ctx.lineTo(26, -20);
  ctx.lineTo(40, 0);
  ctx.lineTo(26, 20);
  ctx.lineTo(-34, 20);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(28, 0, 3, 0, TAU);
  ctx.fill();
  ctx.restore();
  essenceDrop(ctx, x - 20, y + 1, 5);
  text(ctx, num(value, env.lang, value < 10 && value % 1 ? 1 : 0), x + 4, y + 1, { size: 17, mono: true, color: col, weight: 800 });
  void prev;
}

const seedPrice: IllusDef = {
  loop: 7.5,
  keys: [0.15, 0.45, 0.85],
  clips: () => [clip('live')],
  draw(ctx, u, env) {
    const d = priceDemo(env);
    const cx = 66;
    const cy = 70;
    // Dish.
    panel(ctx, cx - 58, cy - 58, 116, 116, 58);
    text(ctx, L(env, 'espacios baratos', 'cheap slots'), cx, 136, { size: 10, color: UI.textDim });
    const step = 1.15;
    const t0 = 0.6;
    const arrivedAt = (k: number) => t0 + k * step; // k-th creature (0-based)
    let n = 0;
    for (let k = 0; k < d.used; k++) if (u >= arrivedAt(k)) n = k + 1;
    for (let i = 0; i < d.free; i++) {
      const p = socketPos(i, d.free, cx, cy);
      const filled = i < n;
      ring(ctx, p.x, p.y, 15, UI.good, filled ? 0.9 : 0.55 + 0.25 * Math.sin(u * 4 + i), 2.2, filled ? [] : [3, 3]);
    }
    for (let k = 0; k < n; k++) {
      const extra = k >= d.free;
      const p = extra ? extraPos(k - d.free, cx, cy) : socketPos(k, d.free, cx, cy);
      const appear = easeOut(seg(u, arrivedAt(k), arrivedAt(k) + 0.35));
      const yy = p.y - (1 - appear) * 20;
      creatureToken(ctx, p.x, yy, 30, appear);
      if (extra) ring(ctx, p.x, yy, 15, UI.danger, appear, 2.2);
    }
    // Price tag.
    const price = priceAt(d, n);
    const prev = n > 0 ? priceAt(d, n - 1) : price;
    const since = n > 0 ? u - arrivedAt(n - 1) : 9;
    const bounce = Math.max(0, Math.sin(Math.min(1, since / 0.45) * Math.PI)) * (n > d.free ? 1.6 : 0.8);
    const over = n > d.free;
    text(ctx, L(env, 'Precio de siembra', 'Seed price'), 140, 20, { size: 10, color: UI.textDim, align: 'left' });
    priceTag(ctx, 186, 52, price, prev, bounce, over, env);
    // "×3!" when the dish goes over its free slots.
    if (over) {
      const k = seg(u, arrivedAt(n - 1), arrivedAt(n - 1) + 0.5);
      badge(ctx, '×3', 238, 84, UI.warn, pop(k) * (1 + 0.1 * Math.sin(u * 8)), 1, 14);
    }
    // Formula line.
    const f = `${num(d.base, env.lang)} × ${num(1 + CROWD * n, env.lang, 2)}${over ? ` × ${Math.pow(SAT, n - d.free)}` : ''}`;
    text(ctx, f, 140, 98, { size: 11, color: UI.textDim, mono: true, align: 'left' });
    text(ctx, `${Math.min(n, d.free)}/${d.free} ${L(env, 'espacios', 'slots')}${over ? ` +${n - d.free}` : ''}`, 140, 118, {
      size: 12,
      color: over ? UI.warn : UI.good,
      weight: 800,
      align: 'left',
    });
    seam(ctx, u, 7.5);
  },
};

const seedCheaper: IllusDef = {
  loop: 5,
  keys: [0.2, 0.8],
  clips: () => [clip('live')],
  draw(ctx, u, env) {
    const d = priceDemo(env);
    const cx = 66;
    const cy = 70;
    panel(ctx, cx - 58, cy - 58, 116, 116, 58);
    const die = seg(u, 1.0, 2.0);
    for (let i = 0; i < d.free; i++) {
      const p = socketPos(i, d.free, cx, cy);
      ring(ctx, p.x, p.y, 13, UI.good, 0.9, 2);
      creatureToken(ctx, p.x, p.y, 26);
    }
    const e = extraPos(0, cx, cy);
    if (die < 1) {
      creatureToken(ctx, e.x, e.y - die * 6, 26, 1 - die);
      ring(ctx, e.x, e.y, 13, UI.danger, 1 - die, 2);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      sparkle(ctx, e.x + Math.cos(a) * die * 16, e.y + Math.sin(a) * die * 16 - die * 8, 2, GREY, die * (1 - die) * 3);
    }
    const n = die >= 1 ? d.free : d.free + 1;
    const price = priceAt(d, n);
    const k = seg(u, 2.0, 2.5);
    priceTag(ctx, 196, 62, price, price, Math.sin(k * Math.PI) * 0.6, n > d.free, env);
    if (u > 2) arrow(ctx, 244, 44, 244, 80, UI.good, 3.4, k);
    text(ctx, L(env, 'más barato', 'cheaper'), 196, 104, { size: 12, color: UI.good, alpha: k });
    seam(ctx, u, 5);
  },
};

// ───────────────────────────── prestige ─────────────────────────────

const DISH_CODES = ['O2u', 'OG2g', 'S1s', 'C0v', 'O4d', 'H3s', 'P3sp'];

function genomeHelix(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, u: number): void {
  if (s <= 0.01) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  const col = '#B892FF';
  for (let k = 0; k < 2; k++) {
    ctx.strokeStyle = k ? col : '#E2D4FF';
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const yy = -20 + (i / 24) * 40;
      const xx = Math.sin(i / 3.8 + u * 2 + k * Math.PI) * 9;
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function patternFor(code: string): Pattern | null {
  try {
    return catalogPattern(code);
  } catch {
    return null;
  }
}

const extinctionReady: IllusDef = {
  loop: 6,
  keys: [0.15, 0.45, 0.8],
  clips: () => [],
  draw(ctx, u, env) {
    const cx = 80;
    const cy = 64;
    const R = 56;
    panel(ctx, cx - R, cy - R, R * 2, R * 2, R);
    const wipe = seg(u, 1.8, 3.0);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R - 1, 0, TAU);
    ctx.clip();
    DISH_CODES.forEach((code, i) => {
      const p = patternFor(code);
      if (!p) return;
      const a = (i / DISH_CODES.length) * TAU + 0.4;
      const rr = i === 0 ? 0 : 34;
      const x = cx + (i === 0 ? 0 : Math.cos(a) * rr);
      const y = cy + (i === 0 ? 0 : Math.sin(a) * rr) + Math.sin(u * 2 + i) * 1.5;
      drawPattern(ctx, p, x, y, 30, 1 - wipe);
    });
    if (wipe > 0) {
      // White-out from the rim to the centre, like the ritual.
      const g = ctx.createRadialGradient(cx, cy, Math.max(0, R * (1 - wipe * 1.2)), cx, cy, R);
      g.addColorStop(0, 'rgba(243,250,255,0)');
      g.addColorStop(0.3, `rgba(243,250,255,${(0.9 * (1 - seg(u, 3.0, 3.8))).toFixed(3)})`);
      g.addColorStop(1, `rgba(243,250,255,${(0.95 * (1 - seg(u, 3.0, 3.8))).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    }
    ctx.restore();
    text(ctx, wipe < 0.5 ? L(env, 'placa llena', 'full dish') : L(env, 'placa limpia', 'clean dish'), cx, 134, { size: 10, color: UI.textDim });
    // Genome reward.
    const gk = pop(seg(u, 3.2, 3.7));
    genomeHelix(ctx, 196, 60, gk * 1.2, u);
    badge(ctx, `+${Math.max(1, Math.round(env.data.amount ?? 5))} ${L(env, 'Genoma', 'Genome')}`, 196, 106, '#B892FF', pop(seg(u, 3.5, 3.9)));
    arrow(ctx, 142, 70, 168, 64, '#B892FF', 2.6, seg(u, 3.0, 3.3));
    seam(ctx, u, 6);
  },
};

function iconBook(ctx: CanvasRenderingContext2D, x: number, y: number, col: string): void {
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(x, y - 7);
  ctx.quadraticCurveTo(x - 5, y - 9, x - 10, y - 7);
  ctx.lineTo(x - 10, y + 7);
  ctx.quadraticCurveTo(x - 5, y + 5, x, y + 7);
  ctx.quadraticCurveTo(x + 5, y + 5, x + 10, y + 7);
  ctx.lineTo(x + 10, y - 7);
  ctx.quadraticCurveTo(x + 5, y - 9, x, y - 7);
  ctx.lineTo(x, y + 7);
  ctx.stroke();
  ctx.restore();
}

function iconFlask(ctx: CanvasRenderingContext2D, x: number, y: number, col: string): void {
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(x - 3, y - 8);
  ctx.lineTo(x - 3, y - 2);
  ctx.lineTo(x - 8, y + 7);
  ctx.lineTo(x + 8, y + 7);
  ctx.lineTo(x + 3, y - 2);
  ctx.lineTo(x + 3, y - 8);
  ctx.stroke();
  ctx.restore();
}

const keepReset: IllusDef = {
  loop: 6,
  keys: [0.2, 0.6],
  clips: () => [],
  draw(ctx, u, env) {
    const cols = [
      { x: 8, title: L(env, 'Se queda', 'Stays'), col: UI.good, ok: true },
      { x: 134, title: L(env, 'Se reinicia', 'Resets'), col: UI.warn, ok: false },
    ];
    for (const c of cols) panel(ctx, c.x, 6, 118, 128, 12, rgba(c.col, 0.35));
    const keep = [
      { label: L(env, 'Bestiario', 'Bestiary'), icon: 'book' as const },
      { label: L(env, 'Genoma', 'Genome'), icon: 'genome' as const },
      { label: L(env, 'Muestras', 'Samples'), icon: 'sample' as const },
    ];
    const reset = [
      { label: L(env, 'Esencia', 'Essence'), icon: 'essence' as const },
      { label: L(env, 'Mejoras', 'Upgrades'), icon: 'flask' as const },
      { label: L(env, 'Placa', 'Dish'), icon: 'dish' as const },
    ];
    cols.forEach((c, ci) => {
      mark(ctx, c.ok, c.x + 16, 22, 8, c.col, 1);
      text(ctx, c.title, c.x + 28, 22, { size: 12, color: c.col, align: 'left', weight: 800 });
      const list = ci === 0 ? keep : reset;
      list.forEach((it, i) => {
        const y = 50 + i * 28;
        const x = c.x + 22;
        // Reset items shrink away and come back empty.
        const k = ci === 1 ? seg(u, 1.2 + i * 0.35, 1.8 + i * 0.35) * (1 - seg(u, 4.6, 5.2)) : 0;
        const glow = ci === 0 ? 0.6 + 0.4 * Math.sin(u * 3 + i) : 1 - k * 0.6;
        ctx.save();
        ctx.globalAlpha = glow;
        const col = ci === 0 ? UI.good : k > 0.5 ? GREY : UI.warn;
        if (it.icon === 'book') iconBook(ctx, x, y, col);
        else if (it.icon === 'genome') genomeHelix(ctx, x, y, 0.42, u);
        else if (it.icon === 'sample') ring(ctx, x, y, 7, col, 1, 2);
        else if (it.icon === 'essence') essenceDrop(ctx, x, y + 1, 5.5, col);
        else if (it.icon === 'flask') iconFlask(ctx, x, y, col);
        else ring(ctx, x, y, 8, col, 1, 2, k > 0.5 ? [2, 2] : []);
        ctx.restore();
        text(ctx, it.label, x + 16, y, { size: 11, color: ci === 0 ? UI.text : k > 0.5 ? UI.textDim : UI.text, align: 'left', weight: 700 });
        if (ci === 1 && k > 0.5) {
          const v = it.icon === 'essence' ? '20' : it.icon === 'flask' ? '0' : '∅';
          text(ctx, v, c.x + 106, y, { size: 11, color: GREY, mono: true, align: 'right' });
        }
      });
    });
  },
};

// ───────────────────────────── offline ─────────────────────────────

const offline: IllusDef = {
  loop: 6,
  keys: [0.3, 0.8],
  clips: () => [clip('swim')],
  draw(ctx, u, env) {
    const c = clip('swim');
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, ILLUS_H);
    g.addColorStop(0, '#0A1022');
    g.addColorStop(1, '#05070B');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(6, 6, 248, 128, 14);
    ctx.fill();
    ctx.restore();
    // Stars + moon.
    for (let i = 0; i < 14; i++) {
      const x = 14 + ((i * 53) % 230);
      const y = 12 + ((i * 29) % 50);
      sparkle(ctx, x, y, 1.6, '#CFE8FF', 0.3 + 0.4 * Math.abs(Math.sin(u * 1.3 + i)));
    }
    ctx.save();
    ctx.fillStyle = '#FFE9C7';
    ctx.shadowColor = '#FFE9C7';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(222, 30, 13, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(228, 25, 11, 0, TAU);
    ctx.fill();
    ctx.restore();
    // Creatures working.
    const idx = (u * 8) % c.total;
    drawClipSprite(ctx, c, idx, 52, 92, 52, 34, 0.3);
    drawClipSprite(ctx, c, idx + 20, 104, 76, 44, 34, 2.4);
    for (let i = 0; i < 3; i++) {
      const k = (u * 0.5 + i / 3) % 1;
      text(ctx, 'z', 78 + k * 16, 60 - k * 28, { size: 9 + k * 6, color: '#CFE8FF', alpha: 1 - k });
    }
    // Drops flowing into the jar.
    for (let i = 0; i < 4; i++) {
      const k = (u * 0.7 + i / 4) % 1;
      essenceDrop(ctx, lerp(84, 196, k), 86 - Math.sin(k * Math.PI) * 26, 3.4, UI.accent, 1 - Math.max(0, k - 0.85) / 0.15);
    }
    ctx.save();
    ctx.strokeStyle = rgba(UI.accent, 0.8);
    ctx.lineWidth = 2;
    ctx.fillStyle = rgba(UI.accent, 0.2);
    ctx.beginPath();
    ctx.roundRect(182, 78, 34, 42, 8);
    ctx.fill();
    ctx.stroke();
    const lv = 0.25 + 0.6 * ((u / 6) % 1);
    ctx.fillStyle = rgba(UI.accent, 0.65);
    ctx.fillRect(184, 118 - lv * 38, 30, lv * 38);
    ctx.restore();
    const total = env.data.amount ?? 12400;
    const shown = Math.floor(total * easeOut(seg(u, 0.2, 4.5)));
    text(ctx, `+${shown.toLocaleString(env.lang === 'es' ? 'es-ES' : 'en-US')}`, 200, 66, { size: 12, mono: true, color: UI.accent, weight: 800 });
    seam(ctx, u, 6);
  },
};

// ───────────────────────────── compare (two species) ─────────────────────────────

const compare: IllusDef = {
  loop: 5,
  keys: [0.5],
  clips: (env) => (env.compare?.some((c) => !c.portrait) ? [clip('swim')] : []),
  draw(ctx, u, env) {
    const sides = env.compare ?? [];
    sides.slice(0, 2).forEach((sd, i) => {
      const cx = i === 0 ? 66 : 194;
      const cy = 56;
      const col = sd.hue === undefined ? UI.accent : `hsl(${Math.round(sd.hue)} 72% 62%)`;
      ctx.save();
      ctx.fillStyle = '#06080b';
      ctx.beginPath();
      ctx.arc(cx, cy, 40, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 39, 0, TAU);
      ctx.clip();
      if (sd.portrait) drawPattern(ctx, sd.portrait, cx, cy + Math.sin(u * 2 + i) * 1.5, 62);
      else {
        const c = clip('swim');
        drawClipSprite(ctx, c, (u * 10 + i * 20) % c.total, cx, cy, 78, 34, i * 2);
      }
      ctx.restore();
      ring(ctx, cx, cy, 41, col, 1, 2.5);
      if (sd.behavior) {
        ctx.save();
        ctx.fillStyle = 'rgba(8,11,15,0.9)';
        ctx.beginPath();
        ctx.arc(cx + 30, cy - 30, 11, 0, TAU);
        ctx.fill();
        ctx.restore();
        drawBehaviorGlyph(ctx, sd.behavior, cx + 30, cy - 30, u, env.rm, 1.5);
      }
      text(ctx, sd.name.length > 22 ? sd.name.slice(0, 21) + '…' : sd.name, cx, 110, { size: 11, color: UI.text });
      badge(ctx, sd.value, cx, 128, sd.win ? UI.good : UI.textDim, sd.win ? 1 + 0.05 * Math.sin(u * 4) : 1);
    });
    text(ctx, 'vs', 130, 58, { size: 14, mono: true, color: UI.textDim, weight: 800 });
  },
};

// ───────────────────────────── registry ─────────────────────────────

const DEFS: Record<IllustrationKind, IllusDef> = {
  seed: seedTriptych,
  dissolve: outcome('fade'),
  explode: outcome('flood'),
  stable: outcome('live'),
  overgrown: outcome('overgrow'),
  essence,
  species,
  compare,
  still,
  pulsing,
  swimmer,
  spinner,
  divider: splitter(2, BEHAVIOR_COLOR.divider ?? UI.accent),
  division: splitter(1, BEHAVIOR_COLOR.divider ?? UI.accent),
  colony,
  golden,
  upgrade,
  autoseed,
  rules,
  seedPrice,
  seedCheaper,
  extinctionReady,
  keepReset,
  offline,
};

export const ILLUSTRATION_KINDS = Object.keys(DEFS) as IllustrationKind[];

/**
 * A running illustration bound to a canvas. Call frame(t) every animation
 * frame while visible; it pumps its real-Lenia clips a few steps at a time.
 */
export class Illustration {
  private def: IllusDef;
  private ctx: CanvasRenderingContext2D | null;
  private dpr = 1;
  private cssW = 0;
  private t0: number | null = null;
  readonly env: IllusEnv;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly kind: IllustrationKind,
    env: IllusEnv,
  ) {
    this.def = DEFS[kind];
    this.ctx = canvas.getContext('2d');
    this.env = env;
  }

  /** Warm the clips (simulate everything now). Used by screenshots / dev. */
  prepare(): void {
    for (const c of this.def.clips(this.env)) while (!c.pump(400));
  }

  private fit(): void {
    const css = this.canvas.clientWidth || ILLUS_W;
    const dpr = Math.min(3, (globalThis.devicePixelRatio as number | undefined) ?? 1);
    if (css !== this.cssW || dpr !== this.dpr) {
      this.cssW = css;
      this.dpr = dpr;
      this.canvas.width = Math.round(css * dpr);
      this.canvas.height = Math.round((css * dpr * ILLUS_H) / ILLUS_W);
    }
  }

  /** Draw at absolute time t (s). `freeze` = loop time to hold (screenshots). */
  frame(t: number, freeze: number | null = null): void {
    pumpAll(this.def.clips(this.env), 12);
    if (this.t0 === null) this.t0 = t;
    this.fit();
    const ctx = this.ctx;
    if (!ctx) return;
    const k = this.canvas.width / ILLUS_W;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    this.env.time = t;
    MINI = !!this.env.mini;
    try {
      this.drawAt(ctx, t, freeze);
    } finally {
      MINI = false;
    }
  }

  private drawAt(ctx: CanvasRenderingContext2D, t: number, freeze: number | null): void {
    const loop = this.def.loop;
    const local = t - (this.t0 ?? t);
    if (freeze !== null) {
      this.def.draw(ctx, Math.min(loop - 0.5, freeze), this.env);
      return;
    }
    if (this.env.rm) {
      // Stills at the key moments, cross-faded (no motion).
      const hold = 2.6;
      const keys = this.def.keys;
      const i = Math.floor(local / hold) % keys.length;
      const f = (local % hold) / hold;
      this.def.draw(ctx, keys[i] * loop, this.env);
      const fade = seg(f, 0.85, 1);
      if (fade > 0) {
        ctx.save();
        ctx.globalAlpha = fade;
        this.def.draw(ctx, keys[(i + 1) % keys.length] * loop, this.env);
        ctx.restore();
      }
      return;
    }
    this.def.draw(ctx, local % loop, this.env);
  }

  restart(): void {
    this.t0 = null;
  }
}
