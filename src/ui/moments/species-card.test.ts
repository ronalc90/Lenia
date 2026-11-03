import { describe, expect, it } from 'vitest';
import type { Pattern, SpeciesView, UpgradeView } from '../../core/types';
import { creature, makeView } from '../../moments/testUtil';
import { behaviorMultFor, boosterHeading, boostersFor, compareSpecies, lookMarks, scientificLine, shapeLabel, speciesBreakdown, speciesGlance, speciesInputFromView, type SpeciesCardInput } from './species-card';

function sp(id: string, over: Partial<SpeciesView> = {}): SpeciesView {
  return {
    id,
    name: `Espécimen ${id}`,
    catalogName: null,
    rarity: 'common',
    behavior: null,
    mult: 1.1,
    timesSeen: 1,
    era: 1,
    portrait: null,
    muRange: [0.15, 0.15],
    sigmaRange: [0.015, 0.015],
    printCost: 1,
    isNew: false,
    ...over,
  };
}

function up(id: string, level = 0, over: Partial<UpgradeView> = {}): UpgradeView {
  return {
    id,
    tab: 'lab',
    name: { es: id, en: id },
    desc: { es: '', en: '' },
    effect: { es: '', en: '' },
    level,
    maxLevel: 10,
    cost: 1,
    qty: 1,
    currency: 'essence',
    affordable: true,
    unlocked: true,
    unlockHint: { es: '', en: '' },
    maxed: false,
    ...over,
  };
}

const input = (over: Partial<SpeciesCardInput> = {}): SpeciesCardInput => ({
  id: 'a',
  name: 'Espécimen 1',
  catalogName: 'Orbium unicaudatus',
  rarity: 'uncommon',
  behavior: 'swimmer',
  portrait: null,
  speciesMult: 1.3,
  behaviorMult: 1.6,
  form: 1.2,
  global: 1,
  eps: 2.5,
  boosters: [],
  ...over,
});

describe('species card: why it earns what it earns', () => {
  it('reads as a visual equation: forma × nadadora × rareza = +N/s', () => {
    const b = speciesBreakdown(input(), 'es');
    expect(b.terms.map((t) => `${t.label} ${t.value}`)).toEqual(['forma ×1,2', 'nadadora ×1,6', 'poco común ×1,3']);
    expect(b.total).toBe('+2,5/s');
    const en = speciesBreakdown(input(), 'en');
    expect(en.terms.map((t) => t.label)).toEqual(['shape', 'swimmer', 'uncommon']);
    expect(en.total).toBe('+2.5/s');
  });

  it('without a living creature it shows the multiplier it would have', () => {
    const b = speciesBreakdown(input({ eps: null, form: null }), 'es');
    expect(b.terms.map((t) => t.kind)).toEqual(['behavior', 'rarity']);
    expect(b.total).toBe('×2,08');
    expect(b.perSec).toBe(false);
  });

  it('global upgrades appear only when they change something', () => {
    expect(speciesBreakdown(input({ global: 1.5 }), 'en').terms.map((t) => t.kind)).toContain('global');
  });

  it('builds the card from the game view (best living creature, affinity included)', () => {
    const v = makeView({
      species: [sp('a', { behavior: 'swimmer', mult: 1.3, hue: 210 })],
      creatures: [
        { ...creature(1), speciesId: 'a', behavior: 'swimmer', eps: 1.0 },
        { ...creature(2), speciesId: 'a', behavior: 'swimmer', eps: 2.6 },
      ],
      upgrades: [up('swimAffinity', 2), up('cataloguing'), up('nutrient', 0, { unlocked: false })],
    });
    const s = speciesInputFromView(v, 'a')!;
    expect(s.eps).toBe(2.6);
    expect(s.hue).toBe(210);
    expect(s.behaviorMult).toBeCloseTo(1.6 * 1.16);
    expect(s.form).toBeCloseTo(2.6 / (1.6 * 1.16 * 1.3));
    expect(s.boosters.map((b) => b.id)).toEqual(['swimAffinity', 'cataloguing', 'nutrient']);
    expect(s.boosters[0].why.es).toContain('nadadoras');
    expect(speciesInputFromView(v, 'nope')).toBeNull();
  });

  it('the right affinity boosts each behaviour', () => {
    const ups = [up('swimAffinity', 1), up('sessileAffinity', 3), up('colonyAffinity', 5)];
    expect(behaviorMultFor('spinner', ups)).toBeCloseTo(1.8 * 1.08);
    expect(behaviorMultFor('pulsing', ups)).toBeCloseTo(1.3 * 1.24);
    expect(behaviorMultFor('colony', ups)).toBeCloseTo(2.5 * 1.4);
    expect(behaviorMultFor(null, ups)).toBeCloseTo(1.0 * 1.24);
    expect(boostersFor('divider', ups)[0].id).toBe('colonyAffinity');
  });
});

describe('species card: telling species apart', () => {
  it('two species that earn the same are compared by what you SEE, never "they are very alike" (owner, v0.012)', () => {
    const a = input({ name: 'Anillo verde', lookCode: 'C0v', behavior: 'still', behaviorMult: 1, eps: 2 });
    const b = input({ id: 'b', name: 'Nadadora celeste', lookCode: 'O2u', behavior: 'swimmer', behaviorMult: 1, eps: 2 });
    const es = compareSpecies(a, b, 'es');
    expect(es.reason).toBe('Anillo verde, frente a Nadadora celeste: con un agujero y sin centro brillante.');
    expect(es.reason).not.toMatch(/se parecen/);
    expect(es.diffs![0]).toMatchObject({ kind: 'holes', side: 'a' });
    expect(compareSpecies(a, b, 'en').reason).toBe('Anillo verde, next to Nadadora celeste: with a hole and without a bright centre.');
  });

  it('marks the differing feature where the portrait really has it (the hole of a ring)', () => {
    const N = 41;
    const ring: Pattern = { w: N, h: N, data: new Float32Array(N * N) };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - 20, y - 20);
      ring.data[y * N + x] = d > 6 && d < 14 ? 0.9 : 0;
    }
    const diffs = compareSpecies(input({ lookCode: 'C0v' }), input({ id: 'b', lookCode: 'O2u' }), 'es').diffs!;
    const m = lookMarks(ring, diffs, 'a');
    expect(m.length).toBe(1); // the hole is on a; "sin centro brillante" marks b's centre
    expect(lookMarks(ring, diffs, 'b').length).toBe(1);
    expect(m[0].x).toBeCloseTo(0.5, 1);
    expect(m[0].y).toBeCloseTo(0.5, 1);
    expect(lookMarks(null, diffs, 'a')).toEqual([]);
  });

  it('names the shape from the catalog genus', () => {
    expect(shapeLabel({ catalogName: 'Orbium unicaudatus', portrait: null }, 'es')).toBe('disco con cola');
    expect(shapeLabel({ catalogName: 'Gyrorbium gyrans', portrait: null }, 'en')).toBe('turning disc');
    expect(shapeLabel({ catalogName: 'Circium ventilans', portrait: null }, 'es')).toBe('anillo');
    expect(shapeLabel({ catalogName: 'Scutium solidus', portrait: null }, 'en')).toBe('shield');
  });

  it('measures the shape of a new species on its portrait', () => {
    const N = 21;
    const ring: Pattern = { w: N, h: N, data: new Float32Array(N * N) };
    const bar: Pattern = { w: N, h: N, data: new Float32Array(N * N) };
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const d = Math.hypot(x - 10, y - 10);
        ring.data[y * N + x] = d > 5 && d < 8 ? 1 : 0;
        bar.data[y * N + x] = Math.abs(y - 10) < 2 && Math.abs(x - 10) < 9 ? 1 : 0;
      }
    expect(shapeLabel({ catalogName: null, portrait: ring }, 'es')).toBe('anillo');
    expect(shapeLabel({ catalogName: null, portrait: bar }, 'en')).toBe('long');
    expect(shapeLabel({ catalogName: null, portrait: null }, 'es')).toBe('forma nueva');
  });

  it('"¿Por qué esta rinde más?": the biggest difference, in one sentence', () => {
    // One name per species: the common one, never the Latin (docs/CLARIDAD.md J-148).
    const a = input({ name: 'Nadadora celeste', catalogName: 'Orbium unicaudatus', behavior: 'swimmer', behaviorMult: 1.6, eps: 2.5 });
    const b = input({ id: 'b', name: 'Escudo jade', catalogName: 'Scutium solidus', behavior: 'still', behaviorMult: 1.0, eps: 1.5 });
    const es = compareSpecies(a, b, 'es');
    expect(es.winner).toBe('a');
    // Friendly factors, never two decimals (docs/CLARIDAD2.md §2.13).
    expect(es.reason).toBe('Nadadora celeste nada (+60 %) y Escudo jade se queda quieta (normal).');
    const en = compareSpecies(a, b, 'en');
    expect(en.reason).toBe('Nadadora celeste swims (+60%) and Escudo jade stays still (normal).');
  });

  it('rarity or shape when they move alike; a tie when they are alike', () => {
    const a = input({ name: 'A', speciesMult: 1.6, eps: 3 });
    const b = input({ id: 'b', name: 'B', speciesMult: 1.1, eps: 2 });
    expect(compareSpecies(a, b, 'es').reason).toBe('A es más rara (+60 %) que B (+10 %).');
    const c = input({ name: 'C', form: 1.5, speciesMult: 1.1, eps: 3 });
    expect(compareSpecies(b, c, 'en')).toEqual({ winner: 'b', reason: 'C has more shape: more edge, more glow (+50% vs +20%).' });
    expect(compareSpecies(a, { ...a, id: 'z' }, 'es').winner).toBe('tie');
  });
});

describe('species card before the first seed (RF-10)', () => {
  it('shows no rate while the session waits, and says when it will earn', () => {
    const v = makeView({
      species: [sp('a', { hue: 210 })],
      creatures: [{ ...creature(1), speciesId: 'a', behavior: 'swimmer', eps: 2.6 }],
      session: { phase: 'ready' } as never,
    });
    const s = speciesInputFromView(v, 'a')!;
    expect(s.eps).toBeNull();
    expect(s.waiting).toBe(true);
    const running = speciesInputFromView({ ...v, session: { phase: 'running' } as never }, 'a')!;
    expect(running.eps).toBe(2.6);
    expect(running.waiting).toBe(false);
  });
});

describe('species card in the main flow: beads, a friendly multiplier, labelled Latin (docs/CLARIDAD2.md §2.13)', () => {
  it('QA#18: beads and a labelled scientific name; no "Afinidad"', () => {
    // ×1,2 · ×1,6 · ×1,3 · ×1,17 = ×2,91 read "casi ×3", and the bead count comes from the game (lightBeads).
    const g = speciesGlance(input({ global: 1.17, lightBeads: 3 }), 'es');
    expect(g.beads).toBe(3);
    expect(g.beadsText).toBe('●●●○○');
    expect(g.label).toBe('Da luz: 3 de 5');
    expect(g.words).toBe('Viva, casi ×3 con tus mejoras');
    expect(speciesGlance(input({ global: 1.17, lightBeads: 3 }), 'en').words).toBe('Alive, almost ×3 with your upgrades');
    expect(speciesGlance(input({ eps: null, form: null }), 'es').words).toMatch(/^Si vive: /);
    expect(`${g.words} ${g.label}`).not.toMatch(/\d[.,]\d/);
    // The Latin is labelled, in italics, under the common name.
    expect(scientificLine(input({ scientificName: 'Orbium unicaudatus' }), 'es')).toEqual({ latin: 'Orbium unicaudatus', label: 'nombre científico' });
    expect(scientificLine(input({ scientificName: 'Orbium unicaudatus' }), 'en')?.label).toBe('scientific name');
    expect(scientificLine(input({ scientificName: null, catalogName: null }), 'es')).toBeNull();
    // Its helpers are the Tree's nodes, by their real names: never «Afinidad».
    const ups = [up('swimAffinity', 1, { name: { es: 'Afinidad nadadora', en: 'Swimmer affinity' } })];
    const b = boostersFor('swimmer', ups);
    expect(b[0].name.es).toBe('Nadadoras');
    expect(boosterHeading(b, 'es')).toBe('Le ayuda en el Árbol');
    expect(boosterHeading(b, 'en')).toBe('Helped in the Tree by');
    expect(JSON.stringify(b)).not.toMatch(/Afinidad|affinity/);
  });

  it('without the game\'s beads, the rarity places it (1–5)', () => {
    expect(speciesGlance(input({ rarity: 'common' }), 'es').beads).toBe(2);
    expect(speciesGlance(input({ rarity: 'veryRare' }), 'es').beads).toBe(5);
  });
});
