import { describe, expect, it } from 'vitest';
import { contrast, hexToRgb, luminance, oklch, rgbToHex, rgbToOklch } from './color';
import {
  BEHAVIOR_TONE,
  CHART_WONG,
  DURATION,
  ELEVATION,
  INK,
  LAMP,
  LAYER,
  LINE,
  MATERIAL,
  MATERIAL_AT,
  PALETTE,
  PLATE,
  RADIUS,
  ROUTE_COLOR,
  SCREEN,
  SPRING,
  STAGGER,
  tokensCss,
  type ThemeName,
} from './tokens';
import { ease } from './motion';

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

describe('scientific realism tokens (ADR-029, docs/ARTE-REALISTA.md §6.1)', () => {
  it('screen inks and their cores read on the instrument glass', () => {
    for (const [k, v] of Object.entries(SCREEN)) {
      expect(contrast(v.body, MATERIAL.glass), `screen ${k}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(v.core, MATERIAL.glass), `screen ${k} core`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the screen inks used as text off the screen are AA on panels and on the plate paper, in both themes', () => {
    for (const th of THEMES) {
      const p = PALETTE[th];
      for (const bg of [p.bg, p.surface, p.surface2, PLATE[th].paper])
        for (const [k, v] of Object.entries(INK[th])) expect(contrast(v, bg), `${th} ink ${k} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('plate ink and secondary ink are AA on the plate paper, in both themes', () => {
    for (const th of THEMES) {
      expect(contrast(PLATE[th].ink, PLATE[th].paper), `${th} plate ink`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(PLATE[th].ink2, PLATE[th].paper), `${th} plate ink2`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the label-maker tape carries text, cost amber and bonus green (AA)', () => {
    for (const fg of [PALETTE.dark.text, INK.dark.amber, PALETTE.dark.good])
      expect(contrast(fg, MATERIAL.aluDark), fg).toBeGreaterThanOrEqual(4.5);
  });

  it('candle is the 3200 K lamp in the dark theme and stays AA ink in the light one', () => {
    expect(PALETTE.dark.candle).toBe(LAMP[3200]);
    expect(contrast(LAMP[3200], PALETTE.light.surface)).toBeLessThan(3); // a lamp is never ink on white
    expect(PALETTE.light.candle).not.toBe(LAMP[3200]);
  });

  it('lamps warm up monotonically: higher temperature, more blue', () => {
    const ks = Object.keys(LAMP).map(Number);
    expect(ks).toEqual([1900, 2200, 2700, 3000, 3200, 3600]);
    const blue = ks.map((k) => hexToRgb(LAMP[k as keyof typeof LAMP])[2]);
    for (let i = 1; i < blue.length; i++) expect(blue[i]).toBeGreaterThan(blue[i - 1]);
  });

  it('every multi-stop material has one offset per colour, rising from 0 to 1', () => {
    for (const [k, at] of Object.entries(MATERIAL_AT)) {
      const colors = MATERIAL[k as keyof typeof MATERIAL];
      expect(Array.isArray(colors), k).toBe(true);
      expect(at.length, k).toBe((colors as readonly string[]).length);
      expect(at[0]).toBe(0);
      expect(at[at.length - 1]).toBe(1);
      for (let i = 1; i < at.length; i++) expect(at[i]).toBeGreaterThan(at[i - 1]);
    }
  });

  it('keeps the line scale of §3.8 (contour / detail ≈ 1.7) and the seven Wong colours', () => {
    expect(LINE.contour / LINE.detail).toBeCloseTo(1.67, 2);
    expect(LINE.icon).toBe(1.75);
    expect(CHART_WONG).toHaveLength(7);
    const css = tokensCss();
    expect(css).toContain('--bl-mat-chrome-5: #2e3134;');
    expect(css).toContain('--bl-lamp-2700: #ffa757;');
    expect(css).toContain('--bl-line-contour: 1.25px;');
  });
});

describe('the closed system (docs/ARTE-PULIDO.md B-2)', () => {
  it('has the five radii, the fx layer between the HUD and the sheets, and four elevations per theme', () => {
    expect(Object.values(RADIUS)).toEqual([8, 12, 16, 24, 999]);
    expect(LAYER.hud).toBeLessThan(LAYER.fx);
    expect(LAYER.fx).toBeLessThan(LAYER.sheet);
    expect(LAYER.fx).toBe(25);
    for (const th of THEMES) expect(Object.keys(ELEVATION[th])).toEqual(['elev0', 'elev1', 'elev2', 'elev3']);
  });

  it('exits are shorter than entrances, lists stagger 40 ms for at most 6 items', () => {
    expect(DURATION.exit).toBeLessThan(DURATION.base);
    expect(DURATION.sheetOut).toBeLessThan(DURATION.sheet);
    expect(STAGGER).toEqual({ step: 40, max: 6 });
  });

  it('the springs are the simulated M3 curves: fast overshoots ~9 %, default ~1.4 %, all settle at 1', () => {
    expect(SPRING.fast.css).toBe(
      'linear(0, 0.103, 0.309, 0.546, 0.758, 0.914, 1.02, 1.074, 1.093, 1.087, 1.07, 1.048, 1.027, 1.011, 1, 0.994, 0.992, 0.992, 0.993, 0.995, 0.997, 0.999, 1, 1, 1)',
    );
    expect(Math.max(...SPRING.fast.points)).toBeCloseTo(1.093, 3);
    expect(Math.max(...SPRING.default.points)).toBeCloseTo(1.014, 3);
    expect([SPRING.fast.ms, SPRING.default.ms, SPRING.slow.ms]).toEqual([400, 480, 650]);
    for (const k of ['springFast', 'springDefault', 'springSlow'] as const) {
      expect(ease[k](0)).toBe(0);
      expect(ease[k](1)).toBe(1);
    }
    expect(ease.springFast(0.35)).toBeGreaterThan(1); // the overshoot
  });

  it('Reduce motion turns every entrance and exit into an 80-ms fade and stops staggering', () => {
    const css = tokensCss();
    const block = css.slice(css.indexOf(':root.bl-rm'));
    expect(block).toContain('--bl-t-sheet: 80ms;');
    expect(block).toContain('--bl-spring-fast: linear;');
    expect(block).toContain('--bl-stagger: 0ms;');
  });
});
