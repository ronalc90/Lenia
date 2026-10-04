import { describe, expect, it } from 'vitest';
import type { SeedPriceView } from '../../core/types';
import { makeView } from '../../moments/testUtil';
import { bigSeedReason, priceTerms, seedPriceExplain, seedPriceReason, seedPriceToday, type PriceSnap } from './seedprice';

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


const snap = (over: Partial<PriceSnap> = {}): PriceSnap => {
  const p = price({ alive: 0, crowdMult: 1, used: 0, satMult: 1, freeSlots: 1, freeSeeds: 0, ...over });
  return { ...p, cost: over.cost ?? p.base * p.crowdMult * p.satMult };
};

describe('no price changes without a visible reason', () => {
  it('one more living creature', () => {
    const r = seedPriceReason(snap(), snap({ alive: 1, used: 1, crowdMult: 1.25 }), 'es')!;
    expect(r).toEqual({ text: '+1 criatura viva → ×1,25', dir: 1 });
    expect(seedPriceReason(snap(), snap({ alive: 2, used: 1, crowdMult: 1.5 }), 'en')!.text).toBe('+2 living creatures → ×1.5');
  });

  it('the dish fills past its cheap slots', () => {
    const r = seedPriceReason(snap({ alive: 3, used: 3, freeSlots: 3, crowdMult: 1.75 }), snap({ alive: 4, used: 4, freeSlots: 3, crowdMult: 2, satMult: 3 }), 'es')!;
    expect(r).toEqual({ text: 'Placa llena: 4 de 3 espacios → ×3', dir: 1 });
  });

  it('fewer creatures / room again / dish upgraded / free seeds (a death is never cheered)', () => {
    expect(seedPriceReason(snap({ alive: 2, crowdMult: 1.5 }), snap({ alive: 1, crowdMult: 1.25 }), 'es')).toEqual({
      text: 'Hay sitio otra vez → más barato',
      dir: -1,
    });
    expect(seedPriceReason(snap({ alive: 2, used: 2, satMult: 3 }), snap({ alive: 1, used: 1, satMult: 1 }), 'en')!.text).toBe('Room again → cheaper');
    expect(seedPriceReason(snap({ used: 2, satMult: 3 }), snap({ used: 2, freeSlots: 2, satMult: 1 }), 'es')!.text).toBe('Placa mejorada: 2 espacios baratos');
    expect(seedPriceReason(snap(), snap({ freeSeeds: 5 }), 'es')).toEqual({ text: '¡Gratis! (lluvia de semillas)', dir: -1 });
    expect(bigSeedReason(price(), 'es').text).toBe('Semilla grande ×2,25');
  });

  it('nothing visible changed → no chip', () => {
    expect(seedPriceReason(snap({ alive: 1, crowdMult: 1.25 }), snap({ alive: 1, crowdMult: 1.25 }), 'es')).toBeNull();
  });
});

describe('the price sheet says it in plain words', () => {
  it("today's reason", () => {
    expect(seedPriceToday(price(), 9, 'es')).toBe('Tienes 3 semillas gratis: la próxima no cuesta nada.');
    expect(seedPriceToday(price({ freeSeeds: 0 }), 9, 'es')).toBe('Hoy cuesta 9 porque hay 2 criaturas vivas y la placa está llena (2 de 1 espacios).');
    expect(seedPriceToday(price({ freeSeeds: 0, alive: 1, used: 1, satMult: 1 }), 2.5, 'en')).toBe('It costs 2.5 now because 1 creature is alive.');
    expect(seedPriceToday(price({ freeSeeds: 0, alive: 0, used: 0, satMult: 1, crowdMult: 1 }), 2, 'es')).toBe('Hoy cuesta 2: el mínimo, la placa está vacía.');
  });

  it("the sheet is the generic one (one rule, one place): equation with today's numbers + the rule + the Dish advice", () => {
    const x = seedPriceExplain(makeView({ seedCost: 9, seedPrice: price() }), 'es', { onSeeDish: () => undefined })!;
    expect(x.terms.map((t) => t.value)).toEqual(['2', '×1,5', '×3']);
    expect(x.total).toBe('9');
    expect(x.rule).toMatch(/^Cada semilla cuesta 2 de Esencia\. Cuantas más criaturas viven, más cuesta\./);
    expect(x.rows?.[0].text).toBe('1 de más');
    expect(x.action?.label).toBe('Más sitio: ver la Placa');
    expect(seedPriceExplain(makeView(), 'es')).toBeNull();
  });
});
