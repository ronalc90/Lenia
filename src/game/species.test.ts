import { describe, expect, it } from 'vitest';
import type { Pattern } from '../core/types';
import catalogSignatures from '../detect/catalogSignatures.json';
import { SIG } from '../detect/signature';
import { placeRotated } from '../detect/harness';
import { catalogPattern } from '../sim/catalog';
import { colorFamily, COLOR_FAMILIES, hueDistance } from '../species';
import * as B from './balance';
import { createGame, type CatalogSignature } from './game';
import { pickSporeTemplate, sporeCandidates } from './seeding';
import { creature, ORBIUM_SIG, recordingBus, report, seededRng } from './testUtil';

const REFS = catalogSignatures as unknown as CatalogSignature[];
const sigOf = (code: string): number[] => [...REFS.find((r) => r.code === code)!.signature];
/** A finished, compact shape unlike any catalog species (a discovery). */
const NOVEL = ORBIUM_SIG.map((v, i) => (i === SIG.MASS ? 1.1 : i === SIG.H2 ? 0.5 : i === SIG.H3 ? 0.3 : v));
const settled = { stableSteps: 1200, shapeDrift: 0.1 };

function capture(code: string, angle: number, size = 64, extra?: [number, number]): Pattern {
  const data = new Float32Array(size * size);
  placeRotated(data, size, size, catalogPattern(code), size / 2, size / 2, angle);
  if (extra) placeRotated(data, size, size, catalogPattern(code), extra[0], extra[1], 0);
  return { w: size, h: size, data };
}

describe('only finished forms found a species', () => {
  it('unfinished, morphing, fragmentary or speck-sized creatures pay as unknown and register nothing', () => {
    const { bus, count } = recordingBus();
    const g = createGame({ bus, rng: seededRng(1) });
    const young = NOVEL.map((v, i) => (i >= SIG.SPEED ? -1 : v));
    const cases = [
      creature({ id: 1, x: 20, y: 20, signature: young, ...settled }), // behaviour unknown yet
      creature({ id: 2, x: 100, y: 20, signature: NOVEL, stableSteps: 300, shapeDrift: 0.1 }), // just became stable
      creature({ id: 3, x: 20, y: 140, signature: NOVEL, stableSteps: 1200, shapeDrift: 2.4 }), // still morphing
      creature({ id: 4, x: 100, y: 140, signature: NOVEL, stableSteps: 1200, shapeDrift: -1 }), // drift not measured yet
      creature({ id: 5, x: 60, y: 210, signature: NOVEL.map((v, i) => (i === SIG.PARTS ? 1.6 : v)), ...settled }), // loose pieces
      creature({ id: 6, x: 160, y: 80, signature: NOVEL.map((v, i) => (i === SIG.MASS ? 0.08 : v)), ...settled }), // a speck
    ];
    for (let i = 0; i < 20; i++) g.tick(0.5, report(cases));
    expect(count('speciesNew')).toBe(0);
    expect(g.view().species.length).toBe(0);
    // They are stable, so they still pay (as unclassified, no species multiplier).
    expect(g.view().essencePerSec).toBeGreaterThan(0);
    // The same creature, once settled, becomes a discovery.
    g.tick(0.5, report([creature({ id: 2, x: 100, y: 20, signature: NOVEL, ...settled, behavior: 'swimmer' })]));
    expect(count('speciesNew')).toBe(1);
    expect(g.view().species[0].catalogName).toBeNull();
  });

  it('catalog forms register even as bound pairs; species the detector cannot tell apart register once', () => {
    const { bus, count } = recordingBus();
    const g = createGame({ bus, rng: seededRng(2) });
    // Parorbium dividuus is a bound pair (PARTS ≈ 1.2): a real catalog form, so it may register.
    g.tick(0.5, report([creature({ id: 1, x: 30, y: 30, signature: sigOf('O4d'), ...settled })]));
    // Orbium unicaudatus, then a bicaudatus-like signature: same bestiary entry (catalog group).
    g.tick(0.5, report([creature({ id: 2, x: 120, y: 30, signature: sigOf('O2u'), ...settled })]));
    g.tick(0.5, report([creature({ id: 3, x: 120, y: 180, signature: sigOf('O2b'), ...settled })]));
    const v = g.view();
    expect(count('speciesNew')).toBe(2);
    expect(v.species.map((s) => s.catalogName).sort()).toEqual(['Orbium unicaudatus', 'Parorbium dividuus']);
    expect(v.species.find((s) => s.catalogName === 'Orbium unicaudatus')!.timesSeen).toBe(2);
  });

  it('matching an already registered species stays immediate', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(3) });
    g.tick(0.5, report([creature({ id: 1, signature: sigOf('O2u'), ...settled })]));
    const young = sigOf('O2u').map((v, i) => (i >= SIG.SPEED ? -1 : v));
    g.tick(0.5, report([creature({ id: 1, signature: sigOf('O2u'), ...settled }), creature({ id: 2, x: 140, signature: young, stableSteps: 0 })]));
    expect(g.view().creatures.find((c) => c.id === 2)!.speciesId).toBe(g.view().species[0].id);
  });
});

describe('species identity', () => {
  it('Spanish common names with their own colour; the Latin/catalog name is the scientific line', () => {
    const { bus, log } = recordingBus();
    const g = createGame({ bus, rng: seededRng(4) });
    g.tick(0.5, report([creature({ id: 1, x: 20, y: 20, signature: sigOf('O2u'), behavior: 'swimmer', ...settled })]));
    g.tick(0.5, report([creature({ id: 2, x: 140, y: 140, signature: sigOf('O4i'), behavior: 'swimmer', ...settled })]));
    g.tick(0.5, report([creature({ id: 3, x: 140, y: 20, signature: sigOf('OG2g'), behavior: 'spinner', ...settled })]));
    // A 4th new species waits for the registration token bucket (3 at once, then one per 15 s).
    for (let i = 0; i < 40; i++) g.tick(0.5, report([creature({ id: 4, x: 20, y: 200, signature: NOVEL, behavior: 'pulsing', ...settled })]));
    const [orb, syn, gyro, novel] = g.view().species;
    expect(orb.name).toBe('Nadadora celeste');
    expect(orb.scientificName).toBe('Orbium unicaudatus');
    expect(orb.catalogName).toBe('Orbium unicaudatus');
    expect(orb.colorName).toEqual({ es: 'celeste', en: 'sky' });
    expect(syn.name).toBe('Pareja dorada');
    expect(gyro.name).toBe('Media luna malva'); // violeta (its own colour) is too close to the two taken ones
    expect(novel.scientificName).toMatch(/^[A-Z][a-z]+ [a-z]+$/); // procedural Latin
    expect(novel.catalogName).toBeNull();
    expect(orb.subtitle).toBe('Criatura 1');
    // Four species, four colour families, well apart.
    const hues = [orb, syn, gyro, novel].map((x) => x.hue!);
    expect(new Set(hues.map((h) => colorFamily(h).id)).size).toBe(4);
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(hueDistance(hues[i], hues[j])).toBeGreaterThanOrEqual(25);
    expect(COLOR_FAMILIES.map((f) => f.hue)).toContain(novel.hue);
    // The toast/event carries the same name, and creatures carry their species' hue.
    expect((log.get('speciesNew')![0] as { name: string }).name).toBe('Nadadora celeste');
    g.tick(0.5, report([creature({ id: 3, x: 140, y: 20, signature: sigOf('OG2g'), behavior: 'spinner', ...settled })]));
    expect(g.view().creatures.find((c) => c.id === 3)!.hue).toBe(gyro.hue);
    // Frozen: the running signature average may drift, the name and colour do not.
    for (let i = 0; i < 30; i++) {
      g.tick(0.5, report([creature({ id: 10 + i, x: 20, y: 200, signature: NOVEL.map((v, k) => (k === SIG.MASS ? v * 1.04 : v)), ...settled })]));
    }
    expect(g.view().species[3].name).toBe(novel.name);
    expect(g.view().species[3].hue).toBe(novel.hue);
    // English.
    g.actions.setSetting('lang', 'en');
    expect(g.view().species[0].name).toBe('Sky swimmer');
    expect(g.view().species[1].name).toBe('Golden pair');
    expect(g.view().species[0].subtitle).toBe('Creature 1');
    // A name the player chose wins.
    g.actions.renameSpecies(orb.id, 'Pepita');
    expect(g.view().species[0].name).toBe('Pepita');
  });

  it('saves from before species identity get a colour and names on load; they survive a roundtrip', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(5) });
    g.tick(0.5, report([creature({ id: 1, signature: NOVEL, behavior: 'swimmer', ...settled })]));
    const { name, hue } = g.view().species[0];
    const g2 = createGame({ bus: recordingBus().bus }, g.serialize());
    expect(g2.view().species[0].name).toBe(name);
    expect(g2.view().species[0].hue).toBe(hue);
    // An old save has none of the identity fields: the loader computes them deterministically.
    const st = g2.state as unknown as { species: { latin?: string | null; hue?: number; shape?: string; common?: unknown }[] };
    st.species[0].latin = null;
    delete st.species[0].hue;
    delete st.species[0].shape;
    delete st.species[0].common;
    const g3 = createGame({ bus: recordingBus().bus }, g2.serialize());
    const g4 = createGame({ bus: recordingBus().bus }, g2.serialize());
    expect(g3.view().species[0].name).toMatch(/^[A-ZÁÉÍÓÚ][a-záéíóúñ]+( [a-záéíóúñ]+)+$/u);
    expect(g3.view().species[0].scientificName).toMatch(/^[A-Z][a-z]+ [a-z]+$/);
    expect(g4.view().species[0].name).toBe(g3.view().species[0].name);
    expect(g4.view().species[0].hue).toBe(g3.view().species[0].hue);
  });
});

describe('species portraits', () => {
  it('registration asks for a capture of the founder; a good capture ends the requests', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(6), grid: { w: 192, h: 240 } });
    const c = creature({ id: 7, x: 60, y: 80, signature: NOVEL, ...settled });
    g.tick(0.5, { ...report([c]), step: 1000 });
    const reqs = g.takePortraitRequests();
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({ speciesId: g.view().species[0].id, creatureId: 7, x: 60, y: 80 });
    expect(reqs[0].size).toBe(Math.min(B.PORTRAIT_CAPTURE_MAX, Math.ceil(13 * B.PORTRAIT_CAPTURE_R)));
    expect(g.takePortraitRequests()).toHaveLength(0); // drained
    // A clean capture: no re-capture later.
    g.setSpeciesPortrait(reqs[0].speciesId, capture('O2u', 0.4), 7);
    g.tick(0.5, { ...report([c]), step: 1000 + B.PORTRAIT_RECAPTURE_DELAY + 10 });
    expect(g.takePortraitRequests()).toHaveLength(0);
  });

  it('a crowded first capture is replaced by a clean one later; worse captures never replace a better one', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(7), grid: { w: 192, h: 240 } });
    const c = creature({ id: 3, x: 60, y: 80, signature: NOVEL, ...settled });
    g.tick(0.5, { ...report([c]), step: 1000 });
    const id = g.takePortraitRequests()[0].speciesId;
    g.setSpeciesPortrait(id, capture('O2u', 0.4, 64, [56, 10]), 3); // a neighbour in the square
    const crowded = g.state.species[0].portrait;
    g.tick(0.5, { ...report([c]), step: 1000 + B.PORTRAIT_RECAPTURE_DELAY + 10 });
    const again = g.takePortraitRequests();
    expect(again).toHaveLength(1);
    g.setSpeciesPortrait(id, capture('O2u', 1.3), 3);
    const clean = g.state.species[0].portrait;
    expect(clean).not.toEqual(crowded);
    g.setSpeciesPortrait(id, capture('O2u', 2.1, 64, [8, 56]), 3);
    expect(g.state.species[0].portrait).toEqual(clean);
    // The stored capture holds the creature alone (what Impresión stamps).
    expect(g.state.species[0].portrait!.w).toBeLessThan(40);
  });

  it('the bestiary shows the catalog pattern for revealed species and the aligned capture for discoveries', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(8), grid: { w: 192, h: 240 } });
    g.tick(0.5, report([creature({ id: 1, x: 30, y: 30, signature: sigOf('O2u'), ...settled })]));
    g.tick(0.5, report([creature({ id: 2, x: 150, y: 200, signature: NOVEL, ...settled })]));
    const [orb, novel] = g.view().species;
    expect(orb.portrait).not.toBeNull(); // no capture needed: the catalog pattern
    const cat = catalogPattern('O2u');
    const sum = (p: Pattern) => p.data.reduce((m, v) => m + v, 0);
    const body = cat.data.reduce((m, v) => m + (v >= 0.13 ? v : 0), 0);
    expect(sum(orb.portrait!)).toBeGreaterThan(body * 0.99); // the body itself, crisp (faint halo faded)
    expect(sum(orb.portrait!)).toBeLessThanOrEqual(sum(cat));
    expect(orb.portrait).toBe(g.view().species[0].portrait); // stable object for the UI cache
    expect(novel.portrait).toBeNull();
    g.setSpeciesPortrait(novel.id, capture('S1s', 0.9, 64, [58, 6]), 2);
    const p = g.view().species[1].portrait!;
    expect(p.w).toBe(p.h);
    expect(p.w).toBeLessThan(40);
  });
});

describe('diverse spores', () => {
  it('spore templates follow the softmax weights of the viable species around the calibration', () => {
    const calib = { mu: 0.15, sigma: 0.015, rings: [1] };
    const cands = sporeCandidates(calib);
    expect(cands.length).toBeGreaterThanOrEqual(3);
    expect(cands[0].entry.code).toBe('O2u');
    expect(cands.reduce((m, c) => m + c.weight, 0)).toBeCloseTo(1, 10);
    const rng = seededRng(42);
    const n = 6000;
    const hits = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const e = pickSporeTemplate(calib, rng);
      hits.set(e.code, (hits.get(e.code) ?? 0) + 1);
    }
    for (const c of cands) expect((hits.get(c.entry.code) ?? 0) / n).toBeCloseTo(c.weight, 1);
    expect([...hits.keys()].sort()).toEqual(cands.map((c) => c.entry.code).sort());
    // Never a species that does not live in this simulation.
    for (const mu of [0.12, 0.133, 0.2, 0.29]) {
      for (const sigma of [0.012, 0.0177, 0.0432]) {
        for (const c of sporeCandidates({ mu, sigma, rings: [1] })) expect(['OG2r', 'SN+']).not.toContain(c.entry.code);
      }
    }
  });

  it('forms not discovered yet are favoured: after Orbium, most start-regime spores are Synorbium ignis', () => {
    const calib = { mu: 0.15, sigma: 0.015, rings: [1] };
    const rng = seededRng(43);
    const draw = (known: Set<string>) => {
      let syn = 0;
      for (let i = 0; i < 4000; i++) if (pickSporeTemplate(calib, rng, known).code === 'O4i') syn++;
      return syn / 4000;
    };
    const fresh = draw(new Set());
    const afterOrbium = draw(new Set(['O2u']));
    expect(afterOrbium).toBeGreaterThan(fresh + 0.2);
    expect(afterOrbium).toBeGreaterThan(0.5);
  });

  it('a fresh dish starts with the surest template; after the first species the templates vary; Mutágeno keeps the surest', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(9) });
    (g.state as { essence: number }).essence = 1e9;
    (g.state as { charges: { free: number; guaranteed: number } }).charges = { free: 0, guaranteed: 0 };
    const fresh = new Set<number>();
    for (let i = 0; i < 12; i++) {
      fresh.add(g.actions.seedAt((i * 37) % 190, (i * 53) % 230)!.pattern!.w);
      g.tick(B.SEED_SPACING_MEMORY + 0.1, report([]));
    }
    expect([...fresh]).toEqual([catalogPattern('O2u').w]);
    g.tick(0.5, report([creature({ id: 1, signature: sigOf('O2u'), ...settled })])); // Orbium registered
    g.tick(B.SEED_SPACING_MEMORY + 0.1, report([]));
    const widths = new Set<number>();
    for (let i = 0; i < 40; i++) {
      widths.add(g.actions.seedAt((i * 37) % 190, (i * 53) % 230)!.pattern!.w);
      g.tick(B.SEED_SPACING_MEMORY + 0.1, report([]));
    }
    expect(widths.size).toBeGreaterThanOrEqual(2);
    (g.state as { charges: { guaranteed: number } }).charges.guaranteed = 3;
    for (let i = 0; i < 3; i++) {
      expect(g.actions.seedAt(5, 5)!.pattern!.w).toBe(catalogPattern('O2u').w);
      g.tick(B.SEED_SPACING_MEMORY + 0.1, report([]));
    }
  });
});
