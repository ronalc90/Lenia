import { describe, expect, it } from 'vitest';
import catalogSigs from '../detect/catalogSignatures.json';
import { catalogGroup } from '../species/identity';
import { LOOKALIKE, SPECIES_LOOKS, isVariant, lookSpecies, visualDistance } from '../species/looks';
import { CATALOG } from '../sim/catalog';
import * as B from './balance';
import { CpuLenia } from '../sim/cpu';
import { applySeedCpu } from '../sim/seed';
import { catalogByCode } from '../sim/catalog';
import { rotateQuarter, scaledTemplate } from './seeding';
import { TREE_BY_ID, exactTurns, routeNodes, seedConfig } from './tree';
import { BASE_WORLD, TOTAL_WORLD_SPECIES, WORLDS, WORLD_BY_ID, worldOfSpecies, worldSpeciesCount } from './worlds';

type Sig = { code: string; viable: boolean; behavior: keyof typeof B.BEHAVIOR_MULT | null; complexity: number };
const SIGS = new Map((catalogSigs as Sig[]).map((s) => [s.code, s]));

/** What a full dish of `n` creatures pays in a world (same formula as scripts/world-check.ts --yield). */
function dishPayout(id: (typeof WORLDS)[number]['id'], n = 12): number {
  const w = WORLD_BY_ID[id];
  const groups = new Map<string, number>();
  for (const c of w.species) {
    const g = catalogGroup(c);
    if (groups.has(g)) continue;
    const s = SIGS.get(c)!;
    groups.set(g, Math.min(s.complexity, B.COMPLEXITY_CAP) * B.BEHAVIOR_MULT[s.behavior ?? 'still'] * B.RARITY_MULT[B.RARITY_BY_CODE[c] ?? B.DEFAULT_RARITY]);
  }
  const per = n / groups.size;
  let total = 0;
  for (const y of groups.values()) for (let k = 0; k < per; k++) total += y * Math.pow(B.SAME_SPECIES_DECAY, k);
  return total * (w.essenceMult ?? 1);
}

describe('worlds (the rules as cards, no knobs)', () => {
  it('every listed species is a viable catalog creature and lives in exactly one world', () => {
    const seen = new Set<string>();
    for (const w of WORLDS) {
      expect(w.species.length, w.id).toBeGreaterThan(0);
      for (const c of [...w.species, ...w.dropped]) expect(CATALOG.some((e) => e.code === c), c).toBe(true);
      for (const c of w.species) {
        expect(SIGS.get(c)?.viable, c).toBe(true);
        expect(seen.has(catalogGroup(c)), c).toBe(false);
        expect(worldOfSpecies(c)).toBe(w.id);
      }
      for (const c of w.species) seen.add(catalogGroup(c));
      for (const c of w.dropped) expect(w.species).not.toContain(c);
    }
    expect(TOTAL_WORLD_SPECIES).toBe(seen.size);
  });

  it('the first world is free; the others open in order along the Mundos route', () => {
    expect(WORLDS[0].id).toBe(BASE_WORLD);
    expect(WORLDS[0].node).toBeNull();
    const route = routeNodes('worlds');
    expect(route.map((n) => n.world)).toEqual(WORLDS.slice(1).map((w) => w.id));
    for (const w of WORLDS.slice(1)) expect(TREE_BY_ID[w.node!].world).toBe(w.id);
    WORLDS.forEach((w, i) => expect(w.n).toBe(i + 1));
    // One visibly new species per world (docs/ESPECIES.md); O2b and O4i are Nadadora variants.
    for (const w of WORLDS) expect(worldSpeciesCount(w.id), w.id).toBe(1);
  });

  it('a newer world never pays less than the one before (it is picked for you on the start card)', () => {
    let prev = 0;
    for (const w of WORLDS) {
      const p = dishPayout(w.id);
      expect(p, w.id).toBeGreaterThanOrEqual(prev * 0.98);
      prev = p;
    }
  });

  it('Frío: Circium\'s ring lives from any angle (no quarter-turn help needed any more)', () => {
    // The old Frío grew Orbium ignis, whose rim was too thin for the bilinear turn of a free angle
    // (cycleBalance WORLD_SEED_HELP.cold). Its new species, the Anillo, takes a free angle.
    const P = WORLD_BY_ID.cold.params;
    const tpl = scaledTemplate(catalogByCode('C0v')!, P.R);
    const after = (pattern: typeof tpl, rotation: number): number => {
      const sim = new CpuLenia(64, 64, P);
      applySeedCpu(sim.A, 64, 64, { x: 32, y: 32, radius: Math.max(pattern.w, pattern.h) / 2, density: 1, noise: 0, shape: 'pattern', pattern, bias: 1, rotation, rngSeed: 7 });
      const m0 = sim.mass();
      sim.step(400);
      return sim.mass() / m0;
    };
    expect(after(rotateQuarter(tpl, 1), 0)).toBeGreaterThan(0.6);
    expect(after(tpl, 0.6)).toBeGreaterThan(0.6);
    expect(exactTurns('classic')).toBe(false);
    const fx = { dropper: 0, stabilizer: 0, masterDropper: false };
    expect(seedConfig(fx, 'classic')).toEqual(seedConfig(fx));
  });

  it('each world brings ONE species a child tells apart from every species of the worlds before it', () => {
    const seen: string[] = [];
    for (const w of WORLDS) {
      for (const c of w.species) {
        expect(isVariant(c), c).toBe(false);
        expect(SPECIES_LOOKS.some((l) => l.code === c), c).toBe(true);
        for (const k of seen) expect(visualDistance(c, k), `${c} vs ${k}`).toBeGreaterThanOrEqual(LOOKALIKE);
        seen.push(c);
      }
    }
    expect(seen).toEqual(SPECIES_LOOKS.map((l) => l.code));
  });

  it('a world\'s variants are look-alikes of a species already known by then, never seeded', () => {
    const known = new Set<string>();
    for (const w of WORLDS) {
      for (const c of w.species) known.add(c);
      for (const v of w.variants ?? []) {
        expect(isVariant(v), v).toBe(true);
        expect(known.has(lookSpecies(v)), v).toBe(true);
        expect(w.species).not.toContain(v);
      }
    }
  });

  it('presets are plain LeniaParams the dish can take', () => {
    for (const w of WORLDS) {
      expect(w.params.mu).toBeGreaterThan(0.05);
      expect(w.params.sigma).toBeGreaterThan(0.001);
      expect([13, 18]).toContain(w.params.R);
      expect(w.params.rings.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('the start card recommends the world that pays most (QA4 F-14)', () => {
  it('the open world with the biggest Esencia multiplier; the only one when there is one', async () => {
    const { bestWorld } = await import('./worlds');
    expect(bestWorld(['classic'])).toBe('classic');
    expect(bestWorld(['classic', 'cold'])).toBe('cold');
    expect(bestWorld(['classic', 'cold', 'gyro', 'giants'])).toBe('giants');
  });
});
