import { describe, expect, it } from 'vitest';
import type { Behavior } from '../core/types';
import { CATALOG_REFS } from '../detect/catalogRefs';
import { signatureDistance } from '../detect/signature';
import { CATALOG } from '../sim/catalog';
import {
  CATALOG_COLORS,
  CATALOG_GROUPS,
  COLOR_FAMILIES,
  catalogGroup,
  colorFamily,
  commonName,
  formatLatin,
  hueDistance,
  latinName,
  sameCatalogSpecies,
  speciesHue,
} from './identity';
import { SHAPE_LABELS, type ShapeKind } from './shape';

const sig = (code: string): number[] => [...CATALOG_REFS.find((r) => r.code === code)!.signature];
const VIABLE = CATALOG_REFS.filter((r) => r.viable);
const FAMILY_HUES = new Set(COLOR_FAMILIES.map((f) => f.hue));

describe('species colour', () => {
  it('the first species keeps its natural colour (Orbium is sky blue); every catalog species has one', () => {
    for (const e of CATALOG) expect(COLOR_FAMILIES.some((f) => f.id === CATALOG_COLORS[e.code])).toBe(true);
    expect(colorFamily(speciesHue(sig('O2u'), 'O2u')).id).toBe('celeste');
    expect(speciesHue(sig('O2b'), 'O2b')).toBe(speciesHue(sig('O2u'), 'O2u'));
    expect(speciesHue(sig('O2u'), 'O2u', [])).toBe(speciesHue(sig('O2u'), 'O2u', []));
  });

  it('no two species share a colour family until all 12 are used, and the first ones are far apart', () => {
    // Worst case for colour: twelve species that all prefer the same colour.
    const taken: number[] = [];
    for (let i = 0; i < COLOR_FAMILIES.length; i++) {
      const h = speciesHue(sig('O2u'), 'O2u', taken);
      expect(FAMILY_HUES.has(h)).toBe(true);
      expect(taken.map((x) => colorFamily(x).id)).not.toContain(colorFamily(h).id);
      if (taken.length >= 1 && taken.length < 4) expect(Math.min(...taken.map((x) => hueDistance(x, h)))).toBeGreaterThanOrEqual(45);
      taken.push(h);
    }
    // A 13th still lands as far as possible from the rest.
    const h13 = speciesHue(sig('S1s'), 'S1s', taken);
    expect(Math.min(...taken.map((x) => hueDistance(x, h13)))).toBeGreaterThanOrEqual(10);
  });

  it('a discovery picks a colour from its signature, deterministically', () => {
    const s1 = sig('OG2g').map((v, i) => v * (1 + 0.21 * (i % 4)));
    expect(speciesHue(s1)).toBe(speciesHue(s1));
    expect(FAMILY_HUES.has(speciesHue(s1, null, [198, 45]))).toBe(true);
  });
});

describe('common names (owner: names in Spanish, clearly different)', () => {
  const KINDS = Object.keys(SHAPE_LABELS) as ShapeKind[];
  const BEHAVIORS: (Behavior | null)[] = ['still', 'pulsing', 'swimmer', 'spinner', 'divider', 'colony', null];

  it('say the body (or what a plain body does) and the colour, in Spanish and English', () => {
    expect(commonName('tailed', 'swimmer', 198)).toEqual({ es: 'Nadadora celeste', en: 'Sky swimmer' });
    expect(commonName('pair', 'swimmer', 45)).toEqual({ es: 'Pareja dorada', en: 'Golden pair' });
    expect(commonName('crescent', 'spinner', 272)).toEqual({ es: 'Media luna violeta', en: 'Violet crescent' });
    expect(commonName('shield', 'still', 325)).toEqual({ es: 'Escudo rosado', en: 'Pink shield' });
    expect(commonName('ring', 'pulsing', 222).es).toBe('Anillo azul');
    expect(commonName('disc', 'pulsing', 8).es).toBe('Medusa coral');
    for (const k of KINDS) {
      for (const b of BEHAVIORS) {
        const n = commonName(k, b, 172);
        expect(commonName(k, b, 172)).toEqual(n); // deterministic
        expect(n.es).toMatch(/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+( [a-záéíóúñ]+)+$/u);
        expect(n.en).toMatch(/^[A-Z][a-z]+( [a-z]+)+$/);
        expect(n.es).not.toBe(n.en);
      }
    }
  });

  it('a body already named is named by what it does the next time ("Remolino" after "Media luna")', () => {
    const first = commonName('crescent', 'spinner', 272);
    expect(first.es).toBe('Media luna violeta');
    const second = commonName('crescent', 'spinner', 45, [first.es, first.en]);
    expect(second).toEqual({ es: 'Remolino dorado', en: 'Golden whirl' });
  });

  it('are unique in the bestiary: collisions add the behaviour, then a numeral', () => {
    const taken: string[] = [];
    const add = (n: { es: string; en: string }) => taken.push(n.es, n.en);
    // Same body, behaviour and colour (only possible past 12 species): behaviour noun, then adjective, then numeral.
    const names = [];
    for (let i = 0; i < 4; i++) {
      const n = commonName('trefoil', 'still', 325, taken);
      add(n);
      names.push(n.es);
    }
    // Twins get plain numbers, never Roman numerals (CLARIDAD J-153).
    expect(names).toEqual(['Trébol rosado', 'Trébol quieto rosado', 'Trébol quieto rosado 2', 'Trébol quieto rosado 3']);
    const spin = commonName('trefoil', 'spinner', 325, taken);
    expect(spin.es).toBe('Remolino rosado');
  });

  it('uses words a child knows: a leaf, not a spindle; "que late", not "latiente" (CLARIDAD J-151, J-152)', () => {
    expect(commonName('spindle', 'still', 200).es.startsWith('Hoja')).toBe(true);
    expect(commonName('spindle', 'still', 200).en.endsWith('leaf')).toBe(true);
    // The plain name and the behaviour's noun are both taken: the tie-break says what it does.
    const taken = ['Trébol rosado', 'Medusa rosada'];
    const twin = commonName('trefoil', 'pulsing', 325, taken);
    expect(twin.es).toBe('Trébol rosado que late');
    expect(twin.es).not.toMatch(/latiente/);
  });
});

describe('procedural Latin names', () => {
  const BEHAVIORS: Behavior[] = ['still', 'pulsing', 'swimmer', 'spinner', 'divider', 'colony'];

  it('are deterministic, two plain Latin words, identical in Spanish and English', () => {
    for (const r of VIABLE) {
      for (const b of BEHAVIORS) {
        const n = formatLatin(latinName(r.signature, b));
        expect(formatLatin(latinName(r.signature, b))).toBe(n);
        // Neutral Latin: ASCII letters only (no ñ, accents or language-specific words).
        expect(n).toMatch(/^[A-Z][a-z]{3,24} [a-z]{4,14}$/);
      }
    }
  });

  it('the epithet says what the creature does', () => {
    const s = sig('O2u');
    expect(['natans', 'vagans', 'velox', 'migrans']).toContain(latinName(s, 'swimmer').epithet);
    expect(['gyrans', 'rotans', 'volvens', 'vertens']).toContain(latinName(s, 'spinner').epithet);
    expect(['pulsans', 'palpitans', 'respirans', 'tremens']).toContain(latinName(s, 'pulsing').epithet);
    expect(['dividuus', 'fissilis', 'geminans', 'partiens']).toContain(latinName(s, 'divider').epithet);
  });

  it('the genus reflects the body: symmetric, elongated and round bodies get different stems', () => {
    const tri = latinName(sig('S3s'), 'still').genus; // three-fold Triscutium-like body
    const penta = latinName(sig('H5s'), 'spinner').genus; // big, many-fold
    expect(tri.toLowerCase()).toMatch(/^(magn|parv)?i?tri/);
    expect(penta.toLowerCase()).toMatch(/tetr|magn/);
    const names = new Set(VIABLE.map((r) => latinName(r.signature, r.behavior).genus));
    expect(names.size).toBeGreaterThanOrEqual(10);
  });

  it('never reuses a catalog name or a name already in the bestiary', () => {
    const catalogNames = new Set(CATALOG.map((e) => e.name.toLowerCase()));
    const taken: string[] = [];
    // Twelve near-identical discoveries still get twelve different names.
    for (let i = 0; i < 12; i++) {
      const n = formatLatin(latinName(sig('O2u'), 'swimmer', { taken }));
      expect(catalogNames.has(n.toLowerCase())).toBe(false);
      expect(taken).not.toContain(n);
      taken.push(n);
    }
  });
});

describe('catalog groups', () => {
  it('groups exactly the catalog species the detector cannot tell apart', () => {
    for (const [a, b] of CATALOG_GROUPS) {
      expect(signatureDistance(sig(a), sig(b))).toBeLessThan(1);
      expect(sameCatalogSpecies(a, b)).toBe(true);
      expect(catalogGroup(b)).toBe(a);
    }
    expect(sameCatalogSpecies('O2u', 'O2ui')).toBe(false);
    expect(sameCatalogSpecies(null, 'O2u')).toBe(false);
    // Every other pair of viable references is told apart by the detector.
    for (let i = 0; i < VIABLE.length; i++) {
      for (let j = i + 1; j < VIABLE.length; j++) {
        if (sameCatalogSpecies(VIABLE[i].code, VIABLE[j].code)) continue;
        expect(signatureDistance(VIABLE[i].signature, VIABLE[j].signature)).toBeGreaterThan(1);
      }
    }
  });
});
