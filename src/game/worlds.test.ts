import { describe, expect, it } from 'vitest';
import catalogSigs from '../detect/catalogSignatures.json';
import { catalogGroup } from '../species/identity';
import { CATALOG } from '../sim/catalog';
import * as B from './balance';
import { TREE_BY_ID, routeNodes } from './tree';
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
    expect(worldSpeciesCount('classic')).toBe(2); // O2u and O2b are one species for the detector
  });

  it('a newer world never pays less than the one before (it is picked for you on the start card)', () => {
    let prev = 0;
    for (const w of WORLDS) {
      const p = dishPayout(w.id);
      expect(p, w.id).toBeGreaterThanOrEqual(prev * 0.98);
      prev = p;
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
