import { describe, expect, it } from 'vitest';
import type { Pattern } from '../core/types';
import { placeRotated } from '../detect/harness';
import { catalogPattern } from '../sim/catalog';
import { canonicalAngle, catalogPortrait, isolateCreature, normalizePortrait, portraitScore } from './portrait';

/** A capture of `code` rotated by `angle`, centred at (cx, cy) in a size×size square. */
function capture(code: string, angle: number, size = 52, cx = size / 2, cy = size / 2): Pattern {
  const data = new Float32Array(size * size);
  placeRotated(data, size, size, catalogPattern(code), cx, cy, angle);
  // Crop, no wrap: zero anything that wrapped around (the real capture is a window of the dish).
  return { w: size, h: size, data };
}

const mass = (p: Pattern): number => p.data.reduce((m, v) => m + v, 0);

function centroid(p: Pattern): [number, number] {
  let m = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const v = p.data[y * p.w + x];
    m += v;
    sx += v * x;
    sy += v * y;
  }
  return [sx / m, sy / m];
}

/** Normalised cross-correlation with centroids aligned; `flip` compares b rotated by 180°. */
function correlation(a: Pattern, b: Pattern, flip = false): number {
  const [ax, ay] = centroid(a);
  const [bx, by] = centroid(b);
  const at = (p: Pattern, x: number, y: number) => (x < 0 || y < 0 || x >= p.w || y >= p.h ? 0 : p.data[y * p.w + x]);
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      const dx = Math.round(x - ax);
      const dy = Math.round(y - ay);
      const va = a.data[y * a.w + x];
      const vb = flip ? at(b, Math.round(bx - dx), Math.round(by - dy)) : at(b, Math.round(bx + dx), Math.round(by + dy));
      ab += va * vb;
      aa += va * va;
    }
  }
  for (const v of b.data) bb += v * v;
  return ab / Math.sqrt(aa * bb);
}

/** Same shape up to the head/tail polarity (ambiguous for symmetric bound pairs like Synorbium). */
const similarity = (a: Pattern, b: Pattern): number => Math.max(correlation(a, b), correlation(a, b, true));

describe('portrait capture handling', () => {
  it('isolates the creature under the centre and drops neighbours and debris', () => {
    const p = capture('O2u', 0.3, 80);
    const alone = mass(p);
    placeRotated(p.data, 80, 80, catalogPattern('O2u'), 64, 16, 1.1); // a neighbour in the corner
    const { pattern, stats } = isolateCreature(p);
    expect(stats.pieces).toBe(2);
    expect(stats.share).toBeLessThan(0.6);
    expect(mass(pattern) / alone).toBeGreaterThan(0.99); // only the faintest fringe (< 0.02) is dropped
    expect(stats.clipped).toBe(false);
  });

  it('scores clean, uncut, representative captures above crowded or cut ones', () => {
    const clean = capture('O2u', 0.5);
    const crowded = capture('O2u', 0.5, 52);
    placeRotated(crowded.data, 52, 52, catalogPattern('O2u'), 46, 8, 2);
    const cut = capture('O2u', 0.5, 52, 6, 26); // off-centre: the crop cuts the body
    expect(portraitScore(clean, 0.2)).toBeGreaterThan(portraitScore(crowded, 0.2));
    expect(portraitScore(clean, 0.2)).toBeGreaterThan(portraitScore(cut, 0.2));
    // The same clean capture of a creature far from its species signature is less representative.
    expect(portraitScore(clean, 0.2)).toBeGreaterThan(portraitScore(clean, 2.5));
    expect(portraitScore({ w: 8, h: 8, data: new Float32Array(64) })).toBe(-Infinity);
  });

  it('normalised portraits of one creature look alike whatever its heading', () => {
    for (const code of ['O2u', 'OG2g', 'S1s', 'O4i', 'PG1c', 'H3s']) {
      const ref = normalizePortrait(capture(code, 0, 72))!;
      for (const a of [0.7, 1.9, 3.3, 4.6]) {
        const p = normalizePortrait(capture(code, a, 72))!;
        expect(Math.abs(p.w - ref.w)).toBeLessThanOrEqual(3);
        // Two bilinear rotations blur fine filaments (Gyrorbium) a little: 0.8 is still the same picture.
        expect(similarity(p, ref)).toBeGreaterThan(0.8);
      }
    }
  });

  it('frames the creature tightly and centred on its centroid', () => {
    const p = normalizePortrait(capture('O2u', 0.9, 64, 20, 40))!;
    expect(p.w).toBe(p.h);
    expect(p.w).toBeLessThan(40);
    let m = 0;
    let sx = 0;
    let sy = 0;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const v = p.data[y * p.w + x];
      m += v;
      sx += v * (x + 0.5);
      sy += v * (y + 0.5);
    }
    expect(Math.abs(sx / m - p.w / 2)).toBeLessThan(2);
    expect(Math.abs(sy / m - p.h / 2)).toBeLessThan(2);
    expect(normalizePortrait({ w: 4, h: 4, data: new Float32Array(16) })).toBeNull();
  });

  it('canonical angle: long axis horizontal for an elongated body', () => {
    const w = 40;
    const data = new Float32Array(w * w);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - 20;
      const dy = y + 0.5 - 20;
      // An ellipse rotated by 60°.
      const u = dx * Math.cos(Math.PI / 3) + dy * Math.sin(Math.PI / 3);
      const v = -dx * Math.sin(Math.PI / 3) + dy * Math.cos(Math.PI / 3);
      if ((u / 12) ** 2 + (v / 4) ** 2 < 1) data[y * w + x] = 0.6 + (u > 0 ? 0.3 : 0);
    }
    const a = canonicalAngle({ w, h: w, data }, 20, 20);
    const diff = Math.abs(Math.atan2(Math.sin(a - Math.PI / 3), Math.cos(a - Math.PI / 3)));
    expect(diff).toBeLessThan(0.1); // and pointing to the heavier end
  });

  it('catalog portraits are the catalog pattern without its faint halo, framed and cached', () => {
    const p = catalogPortrait('O2u')!;
    expect(p).toBe(catalogPortrait('O2u'));
    expect(p.w).toBe(p.h);
    const cat = catalogPattern('O2u');
    let body = 0;
    for (const v of cat.data) if (v >= 0.13) body += v;
    expect(mass(p)).toBeGreaterThan(body * 0.99); // the body is untouched
    expect(mass(p)).toBeLessThanOrEqual(mass(cat));
    // No faint glow left: only cells that were at least 0.05 still hold matter.
    expect(p.data.filter((v) => v > 0).length).toBeLessThanOrEqual(cat.data.filter((v) => v > 0.05).length);
    expect(catalogPortrait('nope')).toBeNull();
  });
});
