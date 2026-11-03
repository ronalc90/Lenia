import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pattern } from '../core/types';
import { portraitCanvas, portraitPx, PORTRAIT_HERO_MAX_PX } from './portrait';

describe('sharp portraits (B-1)', () => {
  it('draw at CSS size × min(DPR, 3), on the 8-px grid, capped at 384 (768 for the title)', () => {
    expect(portraitPx(72, 3)).toBe(216); // Bestiary
    expect(portraitPx(130, 3)).toBe(384); // species sheet (cap)
    expect(portraitPx(60, 3)).toBe(184); // summary
    expect(portraitPx(52, 3)).toBe(160); // start card
    expect(portraitPx(44, 3)).toBe(136); // Tree
    expect(portraitPx(300, 3, PORTRAIT_HERO_MAX_PX)).toBe(768); // title
    expect(portraitPx(72, 4)).toBe(216); // DPR above 3 adds nothing
    expect(portraitPx(72, 1)).toBe(72);
  });

  describe('cache', () => {
    const g = globalThis as unknown as { document?: unknown };
    let had: unknown;
    beforeAll(() => {
      had = g.document;
      // A canvas-less document is enough: the cache is about identity, not pixels.
      g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => null }) };
    });
    afterAll(() => {
      g.document = had;
    });

    it('returns the same canvas for the same key and a new one for another size or theme', () => {
      const p: Pattern = { w: 4, h: 4, data: new Float32Array(16).fill(0.5) } as unknown as Pattern;
      const a = portraitCanvas(p, 216, { theme: 'dark', hue: 195 });
      expect(portraitCanvas(p, 216, { theme: 'dark', hue: 195 })).toBe(a);
      expect(portraitCanvas(p, 136, { theme: 'dark', hue: 195 })).not.toBe(a);
      expect(portraitCanvas(p, 216, { theme: 'light', hue: 195 })).not.toBe(a);
    });
  });
});
