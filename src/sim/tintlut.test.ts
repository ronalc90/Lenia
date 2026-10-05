import { describe, expect, it } from 'vitest';
import { matterLUT } from '../core/palette';
import { FAMILY_HUES } from '../ui/art/matter';
import { COLOR_FAMILIES } from '../species/identity';
import { MAX_TINT_ROWS, TINT_LUT_ROWS, TintRows, accentHueToOklch, tintRow, tintWeight } from './tintlut';

/** HSL hue (degrees) of an sRGB colour: the wheel the species cards use. */
function hslHue(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  if (d === 0) return NaN;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const hueGap = (a: number, b: number): number => Math.min(Math.abs(a - b) % 360, 360 - (Math.abs(a - b) % 360));

describe('species tint colormaps', () => {
  it('give every colour family a clearly different body at the same lightness', () => {
    const base = matterLUT();
    const row = new Uint8Array(256 * 4);
    const bodies = FAMILY_HUES.map((f) => {
      tintRow(base, f.hue, row);
      const i = Math.round(0.45 * 255) * 4;
      return [row[i], row[i + 1], row[i + 2]];
    });
    // Neighbouring families (30° apart) differ visibly; opposite ones a lot.
    for (let j = 0; j < bodies.length; j++) {
      const a = bodies[j];
      const b = bodies[(j + 1) % bodies.length];
      expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeGreaterThan(25);
    }
    // Not the base cyan any more: the coral body is red-dominant.
    tintRow(base, FAMILY_HUES[0].hue, row);
    const i = Math.round(0.45 * 255) * 4;
    expect(row[i]).toBeGreaterThan(row[i + 2]);
  });

  it('leave the haze untinted and keep alpha', () => {
    const base = matterLUT();
    const row = new Uint8Array(256 * 4);
    tintRow(base, 130, row);
    for (let i = 0; i <= 10; i++) expect(Array.from(row.subarray(i * 4, i * 4 + 4))).toEqual(Array.from(base.subarray(i * 4, i * 4 + 4)));
    for (let i = 0; i < 256; i++) expect(row[i * 4 + 3]).toBe(base[i * 4 + 3]);
    expect(tintWeight(0.5)).toBe(1);
  });

  it('give each hue a row once, follow a new palette, and share rows when full', () => {
    const rows = new TintRows(matterLUT());
    expect(rows.rowFor(330)).toBe(1);
    expect(rows.rowFor(130)).toBe(2);
    expect(rows.rowFor(330.2)).toBe(1);
    expect(rows.rowFor(-30)).toBe(1);
    const before = rows.data.slice(256 * 4, 512 * 4);
    const grey = new Uint8Array(256 * 4).map((_, i) => (i % 4 === 3 ? 255 : (i >> 2) & 255));
    rows.setBase(grey);
    expect(Array.from(rows.data.subarray(0, 1024))).toEqual(Array.from(grey));
    expect(Array.from(rows.data.subarray(1024, 2048))).not.toEqual(Array.from(before));
    for (let h = 0; h < MAX_TINT_ROWS + 5; h++) expect(rows.rowFor(h * 7 + 1)).toBeLessThan(TINT_LUT_ROWS);
  });

  it('paint every species body in the colour family of its card (hsl accent hue within 30°)', () => {
    const rows = new TintRows(matterLUT());
    for (const f of COLOR_FAMILIES) {
      const o = rows.rowFor(f.hue) * 256 * 4;
      for (const v of [0.3, 0.45, 0.6]) {
        const i = o + Math.round(v * 255) * 4;
        const h = hslHue(rows.data[i], rows.data[i + 1], rows.data[i + 2]);
        expect(hueGap(h, f.hue), `${f.id} at ${v}: hue ${h.toFixed(0)}`).toBeLessThan(30);
      }
    }
  });
});

describe('a species colour reads in its bright core (QA4: the Anillo verde looked white with a green rim)', () => {
  it('the green species core (v 0.8–1) is clearly green, not white; still bright', () => {
    const base = matterLUT();
    const row = new Uint8Array(256 * 4);
    tintRow(base, accentHueToOklch(140), row);
    for (const v of [0.8, 0.9, 1]) {
      const i = Math.round(v * 255) * 4;
      const [r, g, b] = [row[i], row[i + 1], row[i + 2]];
      expect(g - Math.max(r, b), `v ${v}: ${r},${g},${b}`).toBeGreaterThanOrEqual(70);
      expect(g, `v ${v} stays bright`).toBeGreaterThanOrEqual(200);
    }
  });
});
