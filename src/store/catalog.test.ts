import { describe, expect, it } from 'vitest';
import { matterLUT } from '../core/palette';
import { ACHIEVEMENT_TEXT } from '../game/content';
import {
  ALL_ITEMS,
  BUNDLES,
  COSMETICS,
  DEFAULT_ITEM,
  DISHES,
  NAME_COLORS,
  PALETTES,
  PRICE_USD,
  SLOTS,
  SPARKS,
  SUPPORTER_PALETTES,
  bundleValueUSD,
  formatUSD,
  isForSale,
  itemById,
  supporterPaletteFor,
  type MatterStop,
} from './catalog';
import { contrast, hexToRgb, luminance, over, paletteColor, paletteLUT, type RGB } from './apply';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const ALL_PALETTES = [...PALETTES, ...SUPPORTER_PALETTES];

/** Opaque colour of matter value v over a background (what the shader shows, minus relief/glow). */
function shown(stops: MatterStop[], v: number, bg: RGB): RGB {
  const [r, g, b, a] = paletteColor(stops, v);
  return over([r, g, b], a, bg);
}

describe('catalog structure', () => {
  it('has unique, store-safe ids', () => {
    const ids = ALL_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Valid as Google Play / App Store product ids: lowercase, digits, dots, dashes.
    for (const id of ids) expect(id, id).toMatch(/^[a-z0-9]+(\.[a-z0-9-]+)+$/);
  });

  it('has Spanish and English name and description for every item', () => {
    for (const it of ALL_ITEMS) {
      for (const f of [it.name, it.desc]) {
        expect(f.es.trim().length, `${it.id} es`).toBeGreaterThan(2);
        expect(f.en.trim().length, `${it.id} en`).toBeGreaterThan(2);
      }
    }
  });

  it('has exactly one free default per slot, and DEFAULT_ITEM points at it', () => {
    for (const slot of SLOTS) {
      const defs = COSMETICS.filter((c) => c.slot === slot && c.unlock.type === 'default');
      expect(defs.map((d) => d.id), slot).toEqual([DEFAULT_ITEM[slot]]);
      expect(defs[0].price).toBeNull();
    }
  });

  it('prices only what is sold, and never below the web fee floor (1.99 USD)', () => {
    for (const it of ALL_ITEMS) {
      if (it.unlock.type === 'purchase') {
        expect(it.price, it.id).not.toBeNull();
        expect(PRICE_USD[it.price!], it.id).toBeGreaterThanOrEqual(1.99);
      } else {
        expect(it.price, `${it.id} is not sold alone`).toBeNull();
      }
    }
    expect(formatUSD(2.99, 'es')).toBe('US$ 2,99');
    expect(formatUSD(2.99, 'en')).toBe('US$2.99');
  });

  it('gives non-payers cosmetics: achievement unlocks exist and reference real achievements', () => {
    const ach = COSMETICS.filter((c) => c.unlock.type === 'achievement');
    expect(ach.filter((c) => c.slot === 'palette').length).toBeGreaterThanOrEqual(1);
    expect(ach.length).toBeGreaterThanOrEqual(6);
    for (const c of ach) {
      if (c.unlock.type !== 'achievement') continue;
      expect(ACHIEVEMENT_TEXT[c.unlock.achievement], `${c.id} → ${c.unlock.achievement}`).toBeDefined();
    }
  });

  it('has ~10 palettes plus monthly supporter palettes', () => {
    expect(PALETTES.length).toBeGreaterThanOrEqual(10);
    expect(SUPPORTER_PALETTES.length).toBeGreaterThanOrEqual(6);
    for (const p of SUPPORTER_PALETTES) expect(p.unlock.type).toBe('rotation');
  });

  it('bundles contain real cosmetics, cost less than their parts, and own every bundle-only item', () => {
    for (const b of BUNDLES) {
      for (const id of b.contains) expect(itemById(id)?.kind, `${b.id} → ${id}`).toBe('cosmetic');
      expect(PRICE_USD[b.price!]).toBeLessThan(bundleValueUSD(b));
    }
    for (const c of COSMETICS.filter((c) => c.unlock.type === 'bundle')) {
      expect(BUNDLES.some((b) => b.contains.includes(c.id)), c.id).toBe(true);
    }
  });
});

describe('fair play', () => {
  // Gameplay-sounding keys may never appear in cosmetic data.
  const FORBIDDEN_KEYS = /essence|esencia|speed|velocidad|sample|muestra|genome|genoma|seed|semilla|slot|mult|bonus|boost|chance|odds|time|offline|reward/i;

  function walk(o: unknown, path: string, out: string[]): void {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (FORBIDDEN_KEYS.test(k)) out.push(`${path}.${k}`);
      walk(v, `${path}.${k}`, out);
    }
  }

  it('cosmetic data has no gameplay fields', () => {
    const bad: string[] = [];
    for (const c of COSMETICS) walk(c.data, c.id, bad);
    expect(bad).toEqual([]);
  });

  it('no description promises a numeric gameplay bonus', () => {
    for (const it of ALL_ITEMS) {
      for (const s of [it.desc.es, it.desc.en]) expect(s, it.id).not.toMatch(/\+\s*\d+\s*%|×\s*\d|x\d+\s*(prod|esencia|essence)/i);
    }
  });

  it('golden spark skins stay as bright as the default (none hides or over-highlights the spark)', () => {
    for (const s of SPARKS) {
      const L = luminance(hexToRgb(s.data.core));
      expect(L, s.id).toBeGreaterThanOrEqual(0.6);
      expect(L, s.id).toBeLessThanOrEqual(1);
      expect(s.data.glow).toMatch(HEX);
    }
  });
});

describe('palettes', () => {
  it('default palette LUT is byte-identical to core/palette matterLUT()', () => {
    expect(Array.from(paletteLUT(PALETTES[0].data.stops))).toEqual(Array.from(matterLUT()));
  });

  it.each(ALL_PALETTES.map((p) => [p.id, p] as const))('%s has valid, monotonic stops', (_id, p) => {
    const s = p.data.stops;
    expect(s.length).toBeGreaterThanOrEqual(4);
    expect(s[0][0]).toBe(0);
    expect(s[s.length - 1][0]).toBe(1);
    expect(s[0][4]).toBe(0); // agar shows through where there is no matter
    for (let i = 0; i < s.length; i++) {
      const [v, r, g, b, a] = s[i];
      for (const c of [r, g, b]) {
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(255);
      }
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      if (i > 0) {
        expect(v, `stop ${i}`).toBeGreaterThan(s[i - 1][0]);
        expect(a, `alpha ${i}`).toBeGreaterThanOrEqual(s[i - 1][4]);
      }
    }
    expect(s[s.length - 1][4]).toBe(1);
    for (const c of [p.data.contour, p.data.glowCore, p.data.glowWide, p.data.shadow]) expect(c).toMatch(HEX);
  });

  it.each(ALL_PALETTES.map((p) => [p.id, p] as const))('%s reads clearly on every dish theme', (_id, p) => {
    for (const d of DISHES) {
      for (const bgHex of [d.data.agarIn, d.data.agarOut]) {
        const bg = hexToRgb(bgHex);
        // More matter is never darker: bodies read as volumes on every dish.
        let prev = -1;
        for (let i = 0; i <= 255; i++) {
          const L = luminance(shown(p.data.stops, i / 255, bg));
          expect(L, `${d.id} v=${i}`).toBeGreaterThanOrEqual(prev - 1e-3);
          prev = L;
        }
        // Body edge, body and core contrast against the agar.
        expect(contrast(shown(p.data.stops, 0.3, bg), bg), `${d.id} edge`).toBeGreaterThanOrEqual(2.75);
        expect(contrast(shown(p.data.stops, 0.55, bg), bg), `${d.id} body`).toBeGreaterThanOrEqual(7);
        expect(contrast(shown(p.data.stops, 1, bg), bg), `${d.id} core`).toBeGreaterThanOrEqual(15);
      }
    }
  });
});

describe('dish themes and profile colours', () => {
  it('dish backgrounds stay dark so every palette is designed for them', () => {
    for (const d of DISHES) {
      for (const c of [d.data.bg, d.data.agarIn, d.data.agarOut, d.data.rim, d.data.motes]) expect(c, d.id).toMatch(HEX);
      expect(luminance(hexToRgb(d.data.bg)), d.id).toBeLessThanOrEqual(0.02);
      expect(luminance(hexToRgb(d.data.agarIn)), d.id).toBeLessThanOrEqual(0.03);
      expect(d.data.rimStrength).toBeGreaterThan(0);
      expect(d.data.rimStrength).toBeLessThanOrEqual(0.5);
    }
  });

  it('name colours keep >= 4.5:1 contrast on the ranking surface', () => {
    const surface = hexToRgb('#141A21');
    for (const n of NAME_COLORS) {
      const cols = [n.data.color, ...(n.data.gradient ?? [])];
      for (const c of cols) expect(contrast(hexToRgb(c), surface), `${n.id} ${c}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('supporter palette rotation', () => {
  it('maps each listed month to its palette', () => {
    for (const p of SUPPORTER_PALETTES) {
      if (p.unlock.type !== 'rotation') continue;
      const [y, m] = p.unlock.month.split('-').map(Number);
      expect(supporterPaletteFor(Date.UTC(y, m - 1, 15)).id).toBe(p.id);
    }
  });

  it('uses the first palette before the rotation starts and cycles after the last', () => {
    expect(supporterPaletteFor(Date.UTC(2026, 0, 1)).id).toBe(SUPPORTER_PALETTES[0].id);
    const n = SUPPORTER_PALETTES.length;
    // First month is 2026-11: the month n months later wraps to index 0.
    expect(supporterPaletteFor(Date.UTC(2026, 10 + n, 3)).id).toBe(SUPPORTER_PALETTES[0].id);
    for (let k = 0; k < 60; k++) {
      const p = supporterPaletteFor(Date.UTC(2026, 10 + k, 10));
      expect(p.unlock.type).toBe('rotation');
      expect(isForSale(p)).toBe(false);
    }
  });
});
