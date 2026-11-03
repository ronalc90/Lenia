import { describe, expect, it } from 'vitest';
import { PLATE_MM_PER_CELL } from '../art/tokens';
import { ILLUSTRATION_KINDS, ILLUS_H, ILLUS_W } from './illustrations';
import { KEY_TEXT, PLATES, figPrefix, plateLabel, plateOf, scaleBar, scaleText } from './plates';

describe('Momentos as scientific plates (docs/ARTE-REALISTA.md §6.5)', () => {
  it('every IllustrationKind has a plate number, panels and a scale bar', () => {
    const numbers = new Set<number>();
    for (const kind of ILLUSTRATION_KINDS) {
      const p = plateOf(kind);
      expect(p, kind).not.toBeNull();
      expect(p!.no, kind).toBeGreaterThanOrEqual(1);
      expect(p!.no, kind).toBeLessThanOrEqual(24);
      numbers.add(p!.no);
      // a / b / c in time order (two for the side-by-side plates).
      expect(p!.panels.length, kind).toBeGreaterThanOrEqual(2);
      expect(p!.panels.length, kind).toBeLessThanOrEqual(3);
      for (let i = 1; i < p!.panels.length; i++) expect(p!.panels[i], kind).toBeGreaterThan(p!.panels[i - 1]);
      for (const f of p!.panels) expect(f >= 0 && f <= 1, kind).toBe(true);
      // The stills show a part of the 260 × 140 diagram.
      const [x, y, w, h] = p!.crop;
      expect(x >= 0 && y >= 0 && x + w <= ILLUS_W && y + h <= ILLUS_H, kind).toBe(true);
      // A round length that reads at a glance, as a visible bar.
      const bar = scaleBar(p!);
      expect([1, 2, 5, 10], kind).toContain(bar.mm);
      expect(bar.box, kind).toBeGreaterThan(8);
      expect(bar.box, kind).toBeLessThanOrEqual(44);
      expect(bar.box).toBeCloseTo((bar.mm / PLATE_MM_PER_CELL) * p!.pxPerCell, 6);
      // A legend: a colour key with shapes, and a title in both languages.
      expect(p!.key.length, kind).toBeGreaterThan(0);
      expect(p!.title.es.length && p!.title.en.length, kind).toBeTruthy();
    }
    // One number per kind, 01–24 (the player collects them).
    expect(numbers.size).toBe(ILLUSTRATION_KINDS.length);
    expect(ILLUSTRATION_KINDS.length).toBe(24);
  });

  it('keeps 25 and 26 for collecting and steering, and the §6.5 numbers that are fixed', () => {
    expect(PLATES.collect.no).toBe(25);
    expect(PLATES.steer.no).toBe(26);
    expect(PLATES.seed.no).toBe(1);
    expect(PLATES.species.no).toBe(6);
    expect(PLATES.compare.no).toBe(7);
    expect(PLATES.golden.no).toBe(14);
    expect(PLATES.clock.no).toBe(18);
    expect(PLATES.seedPrice.no).toBe(19);
    expect(plateOf('nope')).toBeNull();
  });

  it('labels read like an instrument and a figure', () => {
    expect(plateLabel(7, 'es')).toBe('LÁMINA 07');
    expect(plateLabel(7, 'en')).toBe('PLATE 07');
    expect(figPrefix(7)).toBe('Fig. 7 · ');
    expect(scaleText(5)).toBe('5 mm');
  });

  it('every colour of the key has a shape too (meaning never hangs on colour alone)', () => {
    const shapes = new Set(Object.values(KEY_TEXT).map((k) => k.shape));
    expect(shapes.size).toBe(Object.keys(KEY_TEXT).length);
    for (const k of Object.values(KEY_TEXT)) expect(k.label.es && k.label.en).toBeTruthy();
  });
});
