/**
 * Real creatures, drawn the way the GPU draws them (docs/ARTE.md §8): the field is sampled
 * with a cubic B-spline per output pixel and THEN mapped through the colormap, so edges stay crisp at any
 * zoom (upscaling an already-coloured sprite would blur the palette bands). Used by the art
 * previews and suitable for Bestiary portraits / cinematics sprites (no hand-drawn fakes, GDD
 * pillar 1). Canvas 2D only; no allocation per frame (render once, cache the canvas).
 */
import { sampleStops, type Stop } from './matter';

export interface FieldPattern {
  w: number;
  h: number;
  data: ArrayLike<number>;
}

export interface SpecimenOptions {
  /** Empty margin around the creature, as a share of the size (default 0.16). */
  pad?: number;
  /** Bloom strength 0..1 (night palette only; default 0.55). */
  bloom?: number;
  /** Rotation in degrees. */
  rotate?: number;
}

/** Cubic B-spline weights (smooth, no ringing: contours stay round instead of stair-stepped). */
function bspline(t: number, w: Float64Array): void {
  const t2 = t * t;
  const t3 = t2 * t;
  w[0] = (1 - 3 * t + 3 * t2 - t3) / 6;
  w[1] = (4 - 6 * t2 + 3 * t3) / 6;
  w[2] = (1 + 3 * t + 3 * t2 - 3 * t3) / 6;
  w[3] = t3 / 6;
}

const WX = new Float64Array(4);
const WY = new Float64Array(4);

function sampleCubic(p: FieldPattern, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  bspline(x - x0, WX);
  bspline(y - y0, WY);
  let v = 0;
  for (let j = 0; j < 4; j++) {
    const yy = y0 - 1 + j;
    if (yy < 0 || yy >= p.h) continue;
    let row = 0;
    for (let i = 0; i < 4; i++) {
      const xx = x0 - 1 + i;
      if (xx < 0 || xx >= p.w) continue;
      row += p.data[yy * p.w + xx] * WX[i];
    }
    v += row * WY[j];
  }
  return v;
}

/** Render a pattern into a new square canvas of `px` device pixels. */
export function renderSpecimen(p: FieldPattern, px: number, stops: readonly Stop[], opts: SpecimenOptions = {}): HTMLCanvasElement {
  const pad = opts.pad ?? 0.16;
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const scale = (px * (1 - 2 * pad)) / Math.max(p.w, p.h);
  const rot = ((opts.rotate ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const img = ctx.createImageData(px, px);
  const half = px / 2;
  for (let y = 0; y < px; y++)
    for (let x = 0; x < px; x++) {
      // Output pixel → field cell (rotate around the centre).
      const dx = (x + 0.5 - half) / scale;
      const dy = (y + 0.5 - half) / scale;
      const u = dx * cos + dy * sin + p.w / 2 - 0.5;
      const v = -dx * sin + dy * cos + p.h / 2 - 0.5;
      const val = sampleCubic(p, u, v);
      if (val <= 0.002) continue;
      const [r, g, b, a] = sampleStops(stops, val);
      const k = (y * px + x) * 4;
      img.data[k] = r;
      img.data[k + 1] = g;
      img.data[k + 2] = b;
      img.data[k + 3] = Math.round(a * 255);
    }
  ctx.putImageData(img, 0, 0);
  const bloom = opts.bloom ?? 0.45;
  if (bloom > 0 && 'filter' in ctx) {
    // Soft bloom: a blurred, brightened copy added on top (like the shader's glow pass).
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
