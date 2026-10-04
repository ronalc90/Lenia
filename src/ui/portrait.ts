/**
 * Species portraits: a Pattern rendered with the matter colormap onto a
 * transparent square (so CSS drop-shadow glows around the creature's shape).
 * Results are cached per Pattern object and palette id as data URLs.
 *
 * The colormap follows the equipped matter palette (cosmetic, src/store):
 * `setPortraitPalette` is called by bindCosmetics; the default palette uses
 * core/palette matterColor exactly as before.
 */
import { matterColor } from '../core/palette';
import type { Pattern } from '../core/types';
import { paletteColor } from '../store/apply';
import { DEFAULT_ITEM, type MatterStop } from '../store/catalog';

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

/** Render a pattern to a canvas of `size` px, body filling `fill` of the side. */
export function renderPattern(p: Pattern, size = 128, fill = 0.72): HTMLCanvasElement {
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
      const [r, g, bb, a] = colorAt(v);
      const i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = bb;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function portraitURL(p: Pattern): string {
  const key = portraitPaletteId();
  let byPalette = cache.get(p);
  if (!byPalette) {
    byPalette = new Map();
    cache.set(p, byPalette);
  }
  let url = byPalette.get(key);
  if (!url) {
    url = renderPattern(p).toDataURL('image/png');
    // A player rarely switches more than a few palettes: keep the last three per portrait.
    if (byPalette.size >= 3) byPalette.delete(byPalette.keys().next().value as string);
    byPalette.set(key, url);
  }
  return url;
}
