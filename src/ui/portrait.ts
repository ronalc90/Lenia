/**
 * Species portraits: a Pattern rendered with the matter colormap onto a transparent square.
 *
 * Sharp everywhere (docs/ARTE-PULIDO.md B-1): `mountPortrait` draws the creature the way the GPU does
 * (cubic B-spline on the field, THEN the colormap, so edges stay smooth at any size) at the element's CSS
 * size × min(devicePixelRatio, 3), with a soft bloom on the night palette and the ink-on-paper palette
 * (MATTER_ART.paper, no bloom) on light surfaces. Renders are cached by (pattern, palette, hue, px, theme),
 * at most two new ones per frame in idle time; meanwhile the slot shows a soft glow of the species colour.
 * `renderPattern` / `portraitURL` (bilinear, 128 px) stay for the dev pages and old callers.
 *
 * The colormap follows the equipped matter palette (cosmetic, src/store):
 * `setPortraitPalette` is called by bindCosmetics; the default palette uses
 * core/palette matterColor exactly as before.
 */
import { matterColor } from '../core/palette';
import type { Pattern } from '../core/types';
import { paletteColor } from '../store/apply';
import { DEFAULT_ITEM, type MatterStop } from '../store/catalog';
import { accentHueToOklch, tintRow } from '../sim/tintlut';
import { lutFromStops, MATTER_ART } from './art/matter';

const cache = new WeakMap<Pattern, Map<string, string>>();
let palette: { id: string; stops: readonly MatterStop[] } | null = null;

/** Equipped palette for portraits (null or the default id = the built-in colormap). */
export function setPortraitPalette(id: string | null, stops?: readonly MatterStop[]): void {
  palette = id && id !== DEFAULT_ITEM.palette && stops?.length ? { id, stops } : null;
}

/** Id of the palette portraits are drawn with (part of the cache key). */
export function portraitPaletteId(): string {
  return palette?.id ?? DEFAULT_ITEM.palette;
}

function colorAt(v: number): [number, number, number, number] {
  return palette ? paletteColor(palette.stops, v) : matterColor(v);
}

/** Tinted colormaps (256 × RGBA8) per palette and species hue: the same rows the dish uses. */
const tintLuts = new Map<string, Uint8Array>();

/**
 * The colormap a species is drawn with: its hue's tinted copy of the current palette (sim/tintlut.ts),
 * so a portrait has the colour of the creature on the dish, its card and its label.
 */
function tintLut(hue: number): Uint8Array {
  const key = `${portraitPaletteId()}|${Math.round(hue * 2) / 2}`;
  let lut = tintLuts.get(key);
  if (!lut) {
    const base = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      const [r, g, b, a] = colorAt(i / 255);
      base.set([r, g, b, Math.round(a * 255)], i * 4);
    }
    lut = new Uint8Array(256 * 4);
    tintRow(base, accentHueToOklch(hue), lut);
    if (tintLuts.size > 64) tintLuts.clear();
    tintLuts.set(key, lut);
  }
  return lut;
}

/** Bilinear sample of a pattern at fractional coords (outside = 0). */
function sample(p: Pattern, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (xx: number, yy: number) =>
    xx < 0 || yy < 0 || xx >= p.w || yy >= p.h ? 0 : p.data[yy * p.w + xx];
  const a = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
  const b = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
  return a * (1 - fy) + b * fy;
}

/** Bounding box of matter above a threshold, so portraits are centered on the body. */
function bounds(p: Pattern): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = p.w;
  let y0 = p.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++)
      if (p.data[y * p.w + x] > 0.04) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return { x0: 0, y0: 0, x1: p.w - 1, y1: p.h - 1 };
  return { x0, y0, x1, y1 };
}

/**
 * Render a pattern to a canvas of `size` px, body filling `fill` of the side; with `hue` (SpeciesView.hue)
 * in the species' colour.
 */
export function renderPattern(p: Pattern, size = 128, fill = 0.72, hue?: number): HTMLCanvasElement {
  const lut = hue !== undefined && Number.isFinite(hue) ? tintLut(hue) : null;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const img = ctx.createImageData(size, size);
  const b = bounds(p);
  const bw = b.x1 - b.x0 + 1;
  const bh = b.y1 - b.y0 + 1;
  const scale = Math.max(bw, bh) / (size * fill); // pattern cells per pixel
  const cxp = (b.x0 + b.x1 + 1) / 2;
  const cyp = (b.y0 + b.y1 + 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = cxp + (x + 0.5 - size / 2) * scale - 0.5;
      const py = cyp + (y + 0.5 - size / 2) * scale - 0.5;
      const v = sample(p, px, py);
      const i = (y * size + x) * 4;
      if (lut) {
        const k = Math.min(255, Math.max(0, Math.round(v * 255))) * 4;
        img.data[i] = lut[k];
        img.data[i + 1] = lut[k + 1];
        img.data[i + 2] = lut[k + 2];
        img.data[i + 3] = lut[k + 3];
        continue;
      }
      const [r, g, bb, a] = colorAt(v);
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = bb;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function portraitURL(p: Pattern, hue?: number): string {
  const key = `${portraitPaletteId()}|${hue === undefined ? '' : Math.round(hue * 2) / 2}`;
  let byPalette = cache.get(p);
  if (!byPalette) {
    byPalette = new Map();
    cache.set(p, byPalette);
  }
  let url = byPalette.get(key);
  if (!url) {
    url = renderPattern(p, 128, 0.72, hue).toDataURL('image/png');
    // A player rarely switches more than a few palettes: keep the last three per portrait.
    if (byPalette.size >= 3) byPalette.delete(byPalette.keys().next().value as string);
    byPalette.set(key, url);
  }
  return url;
}


// ───────────── sharp portraits (B-1) ─────────────

export type PortraitTheme = 'dark' | 'light';

export interface PortraitOptions {
  /** SpeciesView.hue: the species' colour (tinted colormap and placeholder glow). */
  hue?: number;
  /** Share of the side the body fills (default 0.78). */
  fill?: number;
  /** Night palette with bloom, or ink on paper; default: from the element (its theme, `.art-force-dark`). */
  theme?: PortraitTheme;
  /** Cap on the device pixels (default PORTRAIT_MAX_PX; the title creature uses PORTRAIT_HERO_MAX_PX). */
  maxPx?: number;
}

/** Largest portrait drawn (B-1): 384 px (the species sheet's 130 CSS px on DPR 3); the title creature 768. */
export const PORTRAIT_MAX_PX = 384;
export const PORTRAIT_HERO_MAX_PX = 768;
/** Bloom of the night palette (ARTE-PULIDO B-1: 0.55). */
const PORTRAIT_BLOOM = 0.55;
/** New renders allowed per frame (they run in idle time; cached ones are instant). */
const PORTRAITS_PER_FRAME = 2;

/**
 * Device pixels for a portrait of `cssPx`: × the DPR between 2 and 3, rounded up to a multiple of 8, capped.
 * Never under 2× (docs/CLARIDAD2.md §2.13: the thumbnails read blurry, QA-CLARIDAD 027/167): a specimen photo
 * stays sharp on a DPR-1 screen, in a zoomed screenshot and when the card scales it up a little.
 */
export const PORTRAIT_MIN_DPR = 2;
export function portraitPx(cssPx: number, dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, max = PORTRAIT_MAX_PX): number {
  const k = Math.min(3, Math.max(PORTRAIT_MIN_DPR, dpr || 1));
  return Math.min(max, Math.max(8, Math.ceil((cssPx * k) / 8) * 8));
}

/** Cubic B-spline weights (smooth, no ringing). */
function bspline(t: number, w: Float32Array, o: number): void {
  const t2 = t * t;
  const t3 = t2 * t;
  w[o] = (1 - 3 * t + 3 * t2 - t3) / 6;
  w[o + 1] = (4 - 6 * t2 + 3 * t3) / 6;
  w[o + 2] = (1 + 3 * t + 3 * t2 - 3 * t3) / 6;
  w[o + 3] = t3 / 6;
}

let paperLut: Uint8Array | null = null;
const paperTints = new Map<string, Uint8Array>();

/** The colormap of a portrait: the equipped palette tinted by the species (night), or tinted ink (paper). */
function portraitLut(theme: PortraitTheme, hue: number | undefined): Uint8Array {
  const tinted = hue !== undefined && Number.isFinite(hue);
  if (theme === 'dark') {
    if (tinted) return tintLut(hue);
    return tintLuts.get(`${portraitPaletteId()}|base`) ?? baseLut();
  }
  paperLut ??= lutFromStops(MATTER_ART.paper);
  if (!tinted) return paperLut;
  const key = String(Math.round(hue * 2) / 2);
  let lut = paperTints.get(key);
  if (!lut) {
    lut = new Uint8Array(256 * 4);
    tintRow(paperLut, accentHueToOklch(hue), lut);
    for (let i = 0; i < 256; i++) lut[i * 4 + 3] = paperLut[i * 4 + 3];
    if (paperTints.size > 32) paperTints.clear();
    paperTints.set(key, lut);
  }
  return lut;
}

function baseLut(): Uint8Array {
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b, a] = colorAt(i / 255);
    lut.set([r, g, b, Math.round(a * 255)], i * 4);
  }
  tintLuts.set(`${portraitPaletteId()}|base`, lut);
  return lut;
}

/**
 * The creature at `px` device pixels, sampled with a separable cubic B-spline (rows first, then columns:
 * ~4·px² multiply-adds, a few ms for 384 px) and coloured through `lut`; `bloom` > 0 adds a soft glow.
 */
export function renderSharp(p: Pattern, px: number, fill: number, lut: Uint8Array, bloom: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const b = bounds(p);
  const scale = Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1) / (px * fill); // cells per output pixel
  const cx = (b.x0 + b.x1 + 1) / 2;
  const cy = (b.y0 + b.y1 + 1) / 2;
  // Per output column / row: the 4 source indices and weights (the same for every row / column).
  const wx = new Float32Array(px * 4);
  const ix = new Int32Array(px);
  const wy = new Float32Array(px * 4);
  const iy = new Int32Array(px);
  for (let i = 0; i < px; i++) {
    const sx = cx + (i + 0.5 - px / 2) * scale - 0.5;
    const x0 = Math.floor(sx);
    ix[i] = x0 - 1;
    bspline(sx - x0, wx, i * 4);
    const sy = cy + (i + 0.5 - px / 2) * scale - 0.5;
    const y0 = Math.floor(sy);
    iy[i] = y0 - 1;
    bspline(sy - y0, wy, i * 4);
  }
  // Horizontal pass: every source row × every output column.
  const H = new Float32Array(p.h * px);
  for (let yy = 0; yy < p.h; yy++) {
    const row = yy * p.w;
    for (let x = 0; x < px; x++) {
      let v = 0;
      const x0 = ix[x];
      for (let k = 0; k < 4; k++) {
        const xx = x0 + k;
        if (xx >= 0 && xx < p.w) v += p.data[row + xx] * wx[x * 4 + k];
      }
      H[yy * px + x] = v;
    }
  }
  const img = ctx.createImageData(px, px);
  const d = img.data;
  for (let y = 0; y < px; y++) {
    const y0 = iy[y];
    for (let x = 0; x < px; x++) {
      let v = 0;
      for (let k = 0; k < 4; k++) {
        const yy = y0 + k;
        if (yy >= 0 && yy < p.h) v += H[yy * px + x] * wy[y * 4 + k];
      }
      if (v <= 0.002) continue;
      const li = Math.min(255, Math.round(v * 255)) * 4;
      const o = (y * px + x) * 4;
      d[o] = lut[li];
      d[o + 1] = lut[li + 1];
      d[o + 2] = lut[li + 2];
      d[o + 3] = lut[li + 3];
    }
  }
  ctx.putImageData(img, 0, 0);
  if (bloom > 0 && 'filter' in ctx) {
    // Soft bloom: a blurred copy added on top (like the dish's glow pass), once, at render time.
    const tmp = document.createElement('canvas');
    tmp.width = px;
    tmp.height = px;
    const t = tmp.getContext('2d');
    if (t) {
      t.filter = `blur(${Math.max(1, px * 0.035)}px)`;
      t.drawImage(c, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = bloom * 0.7;
      ctx.drawImage(tmp, 0, 0);
      ctx.restore();
    }
  }
  return c;
}

const sharpCache = new WeakMap<Pattern, Map<string, HTMLCanvasElement>>();

function sharpKey(px: number, o: PortraitOptions, theme: PortraitTheme): string {
  return `${portraitPaletteId()}|${o.hue === undefined ? '' : Math.round(o.hue * 2) / 2}|${px}|${theme}|${o.fill ?? 0.78}`;
}

/** The cached render for this key (the same canvas every time for the same key: tested). */
export function portraitCanvas(p: Pattern, px: number, o: PortraitOptions & { theme: PortraitTheme }): HTMLCanvasElement {
  let byKey = sharpCache.get(p);
  if (!byKey) {
    byKey = new Map();
    sharpCache.set(p, byKey);
  }
  const key = sharpKey(px, o, o.theme);
  let c = byKey.get(key);
  if (!c) {
    c = renderSharp(p, px, o.fill ?? 0.78, portraitLut(o.theme, o.hue), o.theme === 'dark' ? PORTRAIT_BLOOM : 0);
    if (byKey.size >= 8) byKey.delete(byKey.keys().next().value as string);
    byKey.set(key, c);
  }
  return c;
}

/** The theme a portrait needs where it will sit: night inside `.art-force-dark`, else the page theme. */
export function portraitTheme(host: Element | null): PortraitTheme {
  if (host?.closest('.art-force-dark')) return 'dark';
  const th = host?.closest('[data-theme]')?.getAttribute('data-theme') ?? (typeof document !== 'undefined' ? document.documentElement.dataset.theme : 'dark');
  return th === 'light' ? 'light' : 'dark';
}

interface PortraitJob {
  host: HTMLElement;
  p: Pattern;
  css: number;
  o: PortraitOptions;
  key: string;
}
const queue: PortraitJob[] = [];
let scheduled = false;

function runQueue(): void {
  scheduled = false;
  let n = 0;
  while (queue.length && n < PORTRAITS_PER_FRAME) {
    const job = queue.shift()!;
    if (job.host.dataset.pkey !== job.key || !job.host.isConnected) continue;
    blit(job);
    n++;
  }
  if (queue.length) schedule();
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  const w = globalThis as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(runQueue, { timeout: 120 });
  else setTimeout(runQueue, 0);
}

function blit(job: PortraitJob): void {
  const theme = job.o.theme ?? portraitTheme(job.host);
  const px = portraitPx(job.css, undefined, job.o.maxPx);
  const src = portraitCanvas(job.p, px, { ...job.o, theme });
  let cv = job.host.querySelector<HTMLCanvasElement>(':scope > canvas.pt-cv');
  if (!cv) {
    cv = document.createElement('canvas');
    cv.className = 'pt-cv';
    cv.setAttribute('aria-hidden', 'true');
    job.host.appendChild(cv);
  }
  if (cv.width !== px) {
    cv.width = px;
    cv.height = px;
  }
  cv.style.width = `${job.css}px`;
  cv.style.height = `${job.css}px`;
  const ctx = cv.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, px, px);
    ctx.drawImage(src, 0, 0);
  }
  job.host.classList.remove('pt-wait');
  job.host.classList.add('pt-ready');
}

/**
 * Put a sharp portrait of `p` in `host`, drawn for `cssPx` CSS pixels. Cached renders appear at once;
 * new ones in idle time (≤ 2 per frame), with a glow of the species colour meanwhile (never a grey blob).
 * Calling it again with the same pattern and size is free.
 */
export function mountPortrait(host: HTMLElement, p: Pattern | null, cssPx: number, o: PortraitOptions = {}): void {
  const theme = o.theme ?? portraitTheme(host);
  const px = portraitPx(cssPx, undefined, o.maxPx);
  const key = p ? `${sharpKey(px, o, theme)}|${cssPx}` : 'none';
  if (host.dataset.pkey === key && (key === 'none' || host.querySelector(':scope > canvas.pt-cv'))) return;
  host.dataset.pkey = key;
  host.classList.add('pt');
  host.style.setProperty('--pt-c', o.hue !== undefined && Number.isFinite(o.hue) ? `hsl(${Math.round(o.hue)} 70% 60%)` : 'var(--bl-accent, #5bc0eb)');
  if (!p) {
    host.querySelector(':scope > canvas.pt-cv')?.remove();
    host.classList.remove('pt-ready', 'pt-wait');
    return;
  }
  const job: PortraitJob = { host, p, css: cssPx, o: { ...o, theme }, key };
  const byKey = sharpCache.get(p);
  if (byKey?.has(sharpKey(px, o, theme))) {
    blit(job);
    return;
  }
  host.classList.add('pt-wait');
  host.classList.remove('pt-ready');
  queue.push(job);
  schedule();
}
