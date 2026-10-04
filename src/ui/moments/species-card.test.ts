import { describe, expect, it } from 'vitest';
import type { Pattern, SpeciesView, UpgradeView } from '../../core/types';
import { creature, makeView } from '../../moments/testUtil';
import { behaviorMultFor, boostersFor, compareSpecies, lookMarks, shapeLabel, speciesBreakdown, speciesInputFromView, type SpeciesCardInput } from './species-card';

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
    expect(es.reason).toBe('Nadadora celeste nada (×1,6) y Escudo jade se queda quieta (×1).');
    const en = compareSpecies(a, b, 'en');
    expect(en.reason).toBe('Nadadora celeste swims (×1.6) and Escudo jade stays still (×1).');
  });

  it('rarity or shape when they move alike; a tie when they are alike', () => {
    const a = input({ name: 'A', speciesMult: 1.6, eps: 3 });
    const b = input({ id: 'b', name: 'B', speciesMult: 1.1, eps: 2 });
    expect(compareSpecies(a, b, 'es').reason).toBe('A es más rara (×1,6) que B (×1,1).');
    const c = input({ name: 'C', form: 1.5, speciesMult: 1.1, eps: 3 });
    expect(compareSpecies(b, c, 'en')).toEqual({ winner: 'b', reason: 'C has more shape: more edge, more Essence (×1.5 vs ×1.2).' });
    expect(compareSpecies(a, { ...a, id: 'z' }, 'es').winner).toBe('tie');
  });
});
