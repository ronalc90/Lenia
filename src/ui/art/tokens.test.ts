import { describe, expect, it } from 'vitest';
import { contrast, hexToRgb, luminance, oklch, rgbToHex, rgbToOklch } from './color';
import { BEHAVIOR_TONE, DURATION, PALETTE, ROUTE_COLOR, tokensCss, type ThemeName } from './tokens';

const THEMES: ThemeName[] = ['dark', 'light'];

describe('colour math', () => {
  it('matches the WCAG reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 6);
    expect(rgbToHex(hexToRgb('#5bc0eb'))).toBe('#5bc0eb');
  });

  it('round-trips OKLCH and keeps lightness when it clips chroma', () => {
    const [L, , h] = rgbToOklch(hexToRgb('#5bc0eb'));
    const back = rgbToOklch(oklch(L, 0.5, h)); // far out of gamut → chroma reduced
    expect(back[0]).toBeCloseTo(L, 2);
  });
});

describe('design tokens', () => {
  it('every text role is AA on the backgrounds it is used on, in both themes', () => {
    for (const th of THEMES) {
      const p = PALETTE[th];
      for (const bg of [p.bg, p.surface, p.surface2]) {
        for (const role of ['text', 'text2', 'accent', 'candle', 'gold', 'aurora', 'moon', 'good', 'warn', 'danger'] as const)
          expect(contrast(p[role], bg), `${th} ${role} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.text3, bg), `${th} text3`).toBeGreaterThanOrEqual(3);
      }
      expect(contrast(p.accentInk, p.accentFill), `${th} primary button label`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('route and behaviour colours read as text on panels (AA)', () => {
    for (const th of THEMES) {
      for (const [k, v] of Object.entries(ROUTE_COLOR[th])) expect(contrast(v, PALETTE[th].surface), `${th} route ${k}`).toBeGreaterThanOrEqual(4.5);
      for (const [k, v] of Object.entries(BEHAVIOR_TONE[th])) expect(contrast(v, PALETTE[th].surface), `${th} ${k}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('art.css is generated from tokens.ts (run src/ui/art/write-css.mjs after editing)', async () => {
    // Read the file from disk (Vitest serves .css imports empty). A computed specifier keeps the
    // project free of Node typings.
    const fs = (await import('node:' + 'fs')) as unknown as { readFileSync(p: URL, enc: 'utf8'): string };
    expect(fs.readFileSync(new URL('./art.css', import.meta.url), 'utf8')).toBe(tokensCss());
  });

  it('keeps motion short: nothing in the UI vocabulary lasts longer than 0.7 s', () => {
    for (const v of Object.values(DURATION)) expect(v).toBeLessThanOrEqual(700);
  });
});
