import { describe, expect, it } from 'vitest';
import type { SeedPriceView } from '../../core/types';
import { priceTerms } from './seedprice';

const price = (over: Partial<SeedPriceView> = {}): SeedPriceView => ({
  base: 2,
  alive: 2,
  crowdMult: 1.5,
  freeSlots: 1,
  used: 2,
  satMult: 3,
  bigMult: 2.25,
  freeSeeds: 3,
  ...over,
});

describe('seed price explained as an equation', () => {
  it('"2 · ×1,5 (2 vivas) · ×3 (placa llena) = 9"', () => {
    const b = priceTerms(price(), 9, 'es');
    expect(b.terms.map((t) => t.value)).toEqual(['2', '×1,5', '×3']);
    expect(b.terms[1].label).toBe('2 vivas');
    expect(b.terms[2].label).toBe('placa llena: 1 de más');
    expect(b.terms.every((t) => t.active)).toBe(true);
    expect(b.total).toBe('9');
    expect(b.slots).toEqual({ free: 1, used: 2, over: 1 });
    expect(b.adviseDish).toBe(true);
    expect(b.bigMult).toBe('2,25');
  });

  it('English uses its own words and decimal point', () => {
    const b = priceTerms(price(), 9, 'en');
    expect(b.terms.map((t) => t.value)).toEqual(['2', '×1.5', '×3']);
    expect(b.terms[1].label).toBe('2 alive');
    expect(b.terms[2].label).toBe('dish full: 1 too many');
    expect(b.bigMult).toBe('2.25');
  });

  it('an empty dish costs the base price and says so', () => {
    const b = priceTerms(price({ alive: 0, crowdMult: 1, used: 0, satMult: 1, freeSlots: 2 }), 2, 'es');
    expect(b.terms[1].active).toBe(false);
    expect(b.terms[2].active).toBe(false);
    expect(b.terms[1].label).toBe('ninguna viva');
    expect(b.terms[2].label).toBe('2 espacios libres');
    expect(b.adviseDish).toBe(false);
  });

  it('one creature, one free slot left', () => {
    const b = priceTerms(price({ alive: 1, crowdMult: 1.25, used: 1, satMult: 1, freeSlots: 2 }), 2.5, 'en');
    expect(b.terms[1].label).toBe('1 alive');
    expect(b.terms[2].label).toBe('1 free slot');
    expect(b.total).toBe('2.5');
  });
});
