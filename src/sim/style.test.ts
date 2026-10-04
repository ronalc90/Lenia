import { describe, expect, it } from 'vitest';
import { defaultRenderStyle, renderStyleFor } from '../store/apply';
import { DISHES, PALETTES } from '../store/catalog';
import { DEFAULT_RENDER_STYLE, normalizeRenderStyle } from './style';

describe('render style', () => {
  it('the default cosmetics reproduce the shader constants exactly', () => {
    const s = normalizeRenderStyle(defaultRenderStyle());
    expect(s).toEqual(DEFAULT_RENDER_STYLE);
    // Same object identity for the snapped colours: no rounding noise reaches the GPU.
    expect(s.contour).toBe(DEFAULT_RENDER_STYLE.contour);
    expect(s.shadow).toBe(DEFAULT_RENDER_STYLE.shadow);
  });

  it('other palettes and dishes keep their own colours', () => {
    const ember = PALETTES.find((p) => p.id === 'palette.ember')!;
    const amber = DISHES.find((d) => d.id === 'dish.amber')!;
    const s = normalizeRenderStyle(renderStyleFor(ember.data, amber.data));
    expect(s.contour).not.toEqual(DEFAULT_RENDER_STYLE.contour);
    expect(s.rim[0]).toBeCloseTo(0xe8 / 255, 6);
    expect(s.rimAmt).toBeCloseTo(0.24, 9);
  });

  it('clamps out-of-range values and unknown rim styles', () => {
    const s = normalizeRenderStyle({
      ...DEFAULT_RENDER_STYLE,
      bg: [2, -1, Number.NaN],
      rimAmt: 9,
      rimStyle: 'zigzag' as never,
      grid: [0.5, 0.5, 0.5, 3],
    });
    expect(s.bg).toEqual([1, 0, 0]);
    expect(s.rimAmt).toBe(0.5);
    expect(s.rimStyle).toBe('line');
    expect(s.grid[3]).toBe(1);
  });
});
