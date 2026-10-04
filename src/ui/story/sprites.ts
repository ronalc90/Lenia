/**
 * Creature sprites for the ending cinematics, rendered from the real catalog
 * patterns through the game's matter colormap (no hand-drawn fakes).
 */
import { matterColor } from '../../core/palette';
import { catalogByCode, catalogPattern } from '../../sim/catalog';

export interface Sprite {
  code: string;
  name: string;
  /** Square canvas, content centred. */
  canvas: HTMLCanvasElement;
  size: number;
}

/** Seed species of GDD §4, in discovery order. */
export const SPRITE_CODES = ['O2u', 'OG2g', 'O4d', 'S1s', 'H3s', '3GH2n', 'K4d'] as const;

const cache = new Map<string, Sprite>();
const tintCache = new Map<string, HTMLCanvasElement>();

/** Sprite of a catalog species, `px` pixels wide, with a soft glow baked in. */
export function sprite(code: string, px = 72): Sprite {
  const key = `${code}@${px}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const entry = catalogByCode(code) ?? catalogByCode('O2u')!;
  const p = catalogPattern(entry.code);
  // Raw pattern at 1 cell = 1 px.
  const raw = document.createElement('canvas');
  raw.width = p.w;
  raw.height = p.h;
  const rctx = raw.getContext('2d');
  if (rctx) {
    const img = rctx.createImageData(p.w, p.h);
    for (let i = 0; i < p.w * p.h; i++) {
      const [r, g, b, a] = matterColor(p.data[i]);
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = Math.round(a * 255);
    }
    rctx.putImageData(img, 0, 0);
  }
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const ctx = c.getContext('2d');
  if (ctx) {
    const scale = (px * 0.62) / Math.max(p.w, p.h);
    const w = p.w * scale;
    const h = p.h * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.shadowColor = 'rgba(91, 192, 235, 0.85)';
    ctx.shadowBlur = px * 0.12;
    ctx.drawImage(raw, (px - w) / 2, (px - h) / 2, w, h);
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35;
    ctx.drawImage(raw, (px - w) / 2, (px - h) / 2, w, h);
  }
  const s: Sprite = { code: entry.code, name: entry.name, canvas: c, size: px };
  cache.set(key, s);
  return s;
}

/** A copy of the sprite recoloured towards `color` by `amount` (0..1). */
export function tinted(s: Sprite, color: string, amount = 0.7): HTMLCanvasElement {
  const key = `${s.code}@${s.size}|${color}|${amount}`;
  const hit = tintCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = s.size;
  c.height = s.size;
  const ctx = c.getContext('2d');
  if (ctx) {
    // Keep the sprite's luminance (its structure), take the hue of `color`,
    // then restore the sprite's own alpha.
    ctx.drawImage(s.canvas, 0, 0);
    ctx.globalCompositeOperation = 'color';
    ctx.globalAlpha = amount;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, s.size, s.size);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(s.canvas, 0, 0);
  }
  tintCache.set(key, c);
  return c;
}
