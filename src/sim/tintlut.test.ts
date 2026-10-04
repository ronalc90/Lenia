import { describe, expect, it } from 'vitest';
import { matterLUT } from '../core/palette';
import { FAMILY_HUES, matterLUT2D } from '../ui/art/matter';
import { MAX_TINT_ROWS, TINT_LUT_ROWS, TintRows, tintRow, tintWeight } from './tintlut';

describe('species tint colormaps', () => {
  it('match the art direction rows (matterLUT2D) for the default palette', () => {
    const base = matterLUT();
    const art = matterLUT2D();
    const row = new Uint8Array(256 * 4);
    let worst = 0;
    FAMILY_HUES.forEach((f, j) => {
      tintRow(base, f.hue, row);
      const ref = art.subarray((j + 1) * 1024, (j + 2) * 1024);
      for (let i = 0; i < 1024; i++) worst = Math.max(worst, Math.abs(row[i] - ref[i]));
    });
    expect(worst).toBeLessThanOrEqual(2); // byte rounding of the colormap samples
  });

  it('leave the haze untinted and keep alpha', () => {
    const base = matterLUT();
    const row = new Uint8Array(256 * 4);
    tintRow(base, 130, row);
    for (let i = 0; i <= 10; i++) expect(Array.from(row.subarray(i * 4, i * 4 + 4))).toEqual(Array.from(base.subarray(i * 4, i * 4 + 4)));
    for (let i = 0; i < 256; i++) expect(row[i * 4 + 3]).toBe(base[i * 4 + 3]);
    expect(tintWeight(0.5)).toBe(0.85);
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
});
