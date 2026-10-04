import { describe, expect, it } from 'vitest';
import { COLOR_FAMILIES } from '../../species/identity';
import { normalizeRenderStyle, type SimRenderStyle } from '../../sim/style';
import { luminance, rgbToOklch } from './color';
import { ART_RENDER_STYLE, FAMILY_HUES, MATTER_ART, familyAccent, familyIndex, lutFromStops, matterLUT2D, sampleStops, tintedStops } from './matter';

const lumAt = (lut: Uint8Array, i: number) => luminance([lut[i * 4], lut[i * 4 + 1], lut[i * 4 + 2]]);

describe('recommended matter palette', () => {
  it('builds a 256-entry LUT that is transparent at zero matter', () => {
    const lut = lutFromStops(MATTER_ART.night);
    expect(lut.length).toBe(1024);
    expect(lut[3]).toBe(0);
    expect(lut[255 * 4 + 3]).toBe(255);
  });

  it('gets brighter with more matter, evenly (no jumps, no white plateau before 0.9)', () => {
    const lut = lutFromStops(MATTER_ART.night);
    let maxStep = 0;
    for (let i = 1; i < 256; i++) {
      const d = lumAt(lut, i) - lumAt(lut, i - 1);
      expect(d, `step ${i}`).toBeGreaterThanOrEqual(-0.004);
      maxStep = Math.max(maxStep, d);
    }
    expect(maxStep).toBeLessThan(0.02);
    // Structure stays visible: at 0.8 the colour is still clearly below white.
    const [r, g, b] = sampleStops(MATTER_ART.night, 0.8);
    expect(luminance([r, g, b])).toBeLessThan(0.9);
  });

  it('paper palette darkens with matter (ink on paper)', () => {
    const lut = lutFromStops(MATTER_ART.paper);
    for (let i = 26; i < 256; i += 10) expect(lumAt(lut, i)).toBeLessThanOrEqual(lumAt(lut, i - 10) + 0.004);
  });

  it('tints every family at the same lightness as the untinted palette', () => {
    for (const f of FAMILY_HUES) {
      const t = tintedStops(f.hue);
      t.forEach((s, i) => {
        const base = MATTER_ART.night[i];
        const Lb = rgbToOklch([base[1], base[2], base[3]])[0];
        const Lt = rgbToOklch([s[1], s[2], s[3]])[0];
        expect(Math.abs(Lt - Lb), `${f.id} @${s[0]}`).toBeLessThan(0.05);
        expect(s[4]).toBe(base[4]);
      });
    }
  });

  it('mirrors the species colour families (same ids, hues and order)', () => {
    expect(FAMILY_HUES.map((f) => [f.id, f.hue])).toEqual(COLOR_FAMILIES.map((f) => [f.id, f.hue]));
    expect(familyIndex(200)).toBe(FAMILY_HUES.findIndex((f) => f.id === 'celeste'));
    expect(familyIndex(359)).toBe(0);
    expect(matterLUT2D().length).toBe(256 * 13 * 4);
  });

  it('family accents are equally light (one brightness, many hues)', () => {
    const Ls = FAMILY_HUES.map((f) => rgbToOklch(familyAccent(f.hue, 'dark'))[0]);
    expect(Math.max(...Ls) - Math.min(...Ls)).toBeLessThan(0.02);
  });

  it('the recommended render style is valid for the shader (nothing clamped)', () => {
    const s = ART_RENDER_STYLE as unknown as SimRenderStyle;
    const n = normalizeRenderStyle(s);
    expect(n.rim).toEqual(s.rim);
    expect(n.agarIn).toEqual(s.agarIn);
    expect(n.rimAmt).toBeCloseTo(s.rimAmt, 9);
  });
});
