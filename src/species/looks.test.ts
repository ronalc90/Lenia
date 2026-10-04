import { describe, expect, it } from 'vitest';
import { SPECIES_MATCH_THRESHOLD } from '../detect/signature';
import { CATALOG_MATCH_FACTOR } from '../game/balance';
import { WORLDS } from '../game/worlds';
import { CATALOG } from '../sim/catalog';
import { COLOR_FAMILIES, FIXED_COLORS, LOOKALIKE_OF, hueDistance } from './identity';
import {
  BRIGHT_CORE,
  LONG_ELONGATION,
  LOOKALIKE,
  SPECIES_LOOKS,
  VARIANTS,
  compareLine,
  compareLooks,
  featureChips,
  isVariant,
  lookName,
  lookSpecies,
  measuredLook,
  newSpeciesComparison,
  speciesFamily,
  speciesFeatures,
  speciesSize,
  variantNote,
  visualDistance,
} from './looks';

const CODES = SPECIES_LOOKS.map((s) => s.code);

describe('the Bestiary species look clearly different (docs/ESPECIES.md)', () => {
  it('every species and variant of a world is measured at its preset; species keep the form the game reveals', () => {
    for (const w of WORLDS) {
      for (const c of [...w.species, ...(w.variants ?? [])]) {
        const m = measuredLook(c);
        expect(m, c).toBeDefined();
        expect(m!.world).toBe(w.id);
        expect(m!.R).toBe(w.params.R);
      }
      for (const c of w.species) expect(measuredLook(c)!.formDist, c).toBeLessThan(SPECIES_MATCH_THRESHOLD * CATALOG_MATCH_FACTOR);
    }
  });

  it('distinctiveness matrix: every pair of species differs by at least LOOKALIKE visible points', () => {
    for (const a of CODES) for (const b of CODES) if (a !== b) expect(visualDistance(a, b), `${a} vs ${b}`).toBeGreaterThanOrEqual(LOOKALIKE);
  });

  it('each species has its own colour; Bestiary neighbours are at least 60° apart', () => {
    const fams = CODES.map((c) => speciesFamily(c)!.id);
    expect(new Set(fams).size).toBe(CODES.length);
    for (let i = 1; i < CODES.length; i++) {
      const h = (c: string) => speciesFamily(c)!.hue;
      expect(hueDistance(h(CODES[i]), h(CODES[i - 1])), CODES[i]).toBeGreaterThanOrEqual(60);
    }
    expect(Object.keys(FIXED_COLORS).sort()).toEqual([...CODES].sort());
    for (const f of fams) expect(COLOR_FAMILIES.some((x) => x.id === f)).toBe(true);
  });

  it('species names never repeat a noun', () => {
    expect(new Set(SPECIES_LOOKS.map((s) => s.noun.es)).size).toBe(CODES.length);
    expect(lookName('C0v')).toEqual({ es: 'Anillo verde', en: 'Green ring' });
    expect(lookName('O4i')).toEqual({ es: 'Nadadora celeste', en: 'Sky swimmer' });
  });

  it('features come from the measurement: holes, a bright centre, the outline and the way of moving', () => {
    for (const c of CODES) {
      const m = measuredLook(c)!;
      const f = speciesFeatures(c);
      expect(f.includes('hole') || f.includes('holes')).toBe(m.holes > 0);
      expect(f.includes('brightCore')).toBe(m.core >= BRIGHT_CORE);
      expect(f.includes('long')).toBe(m.elongation >= LONG_ELONGATION);
      expect(f.includes('spins')).toBe(m.behavior === 'spinner');
    }
    expect(speciesSize('C0v')).toBe('S');
    expect(speciesSize('O2u')).toBe('M');
    expect(speciesSize('P4cp')).toBe('L');
    expect(speciesSize('3GH2n')).toBe('XL');
  });

  it('2–3 chips per species, the size first', () => {
    for (const c of CODES) {
      const chips = featureChips(c);
      expect(chips.length).toBeGreaterThanOrEqual(2);
      expect(chips.length).toBeLessThanOrEqual(3);
      expect(chips[0].id).toBe('size');
      for (const x of chips) expect(x.label.es && x.label.en).toBeTruthy();
    }
    expect(featureChips('C0v').map((x) => x.label.es)).toContain('agujero');
    expect(featureChips('O2u').map((x) => x.label.es)).toContain('centro brillante');
  });
});

describe('variants: look-alikes are never a new species', () => {
  it('every look-alike has a note and points at a Bestiary species', () => {
    expect(Object.keys(VARIANTS).sort()).toEqual(Object.keys(LOOKALIKE_OF).sort());
    for (const [code, v] of Object.entries(VARIANTS)) {
      expect(CATALOG.some((e) => e.code === code), code).toBe(true);
      expect(v.of).toBe(LOOKALIKE_OF[code]);
      expect(CODES).toContain(v.of);
      expect(isVariant(code)).toBe(true);
      expect(variantNote(code)!.es.startsWith('variante: ')).toBe(true);
    }
    for (const c of CODES) expect(isVariant(c)).toBe(false);
    // Owner's case (live v0.012): "Pareja verde" vs "Nadadora coral" were the same Orbium.
    expect(lookSpecies('O4i')).toBe('O2u');
    expect(lookSpecies('PS3am')).toBe('S2s'); // the detector's own group too
  });
});

describe('the comparison line points at the visible difference', () => {
  it('the first species says what it is', () => {
    expect(compareLine('O2u', [])).toEqual({ es: 'Tu primera especie: un disco de centro brillante.', en: 'Your first species: a disc with a bright centre.' });
  });

  it('names the two most visible differences against the closest known species', () => {
    expect(compareLine('C0v', ['O2u']).es).toBe('Como la Nadadora, pero con un agujero y sin centro brillante.');
    expect(compareLine('OG2g', ['O2u', 'C0v']).es).toBe('Como la Nadadora, pero sin centro brillante y que gira en el sitio.');
    expect(compareLine('3GH2n', CODES.slice(0, 6)).es).toMatch(/mucho más grande/);
    expect(compareLine('3GH2n', CODES.slice(0, 6)).en).toMatch(/^Like the \w+, but /);
    // Spanish agreement follows the new species: "pequeño" for the Anillo.
    expect(compareLooks('C0v', 'O2u').find((d) => d.kind === 'size')!.text.es).toBe('más pequeño');
  });

  it('a variant compares as its species, and nearest-known skips the species itself', () => {
    expect(compareLine('O4i', ['O2u']).es).toBe('Tu primera especie: un disco de centro brillante.');
  });

  it('gives the card the differences to draw arrows on', () => {
    const c = newSpeciesComparison('C0v', ['O2u']);
    expect(c.versus).toBe('O2u');
    expect(c.diffs[0]).toMatchObject({ kind: 'holes', side: 'a', anchor: 'holes' });
    expect(c.diffs.length).toBeLessThanOrEqual(2);
    expect(newSpeciesComparison('O2u', []).diffs).toEqual([]);
  });
});
