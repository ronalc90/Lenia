import { describe, expect, it } from 'vitest';
import type { GameView } from '../core/types';
import { makeView } from '../story/testUtil';
import { seedPriceChange, seedPriceRule, seedPriceSheetExplain, seedPriceSnap, seedPriceTerms, seedPriceToday, type SeedPriceParts } from './seed-price';

const crowded: SeedPriceParts = { base: 2, alive: 2, crowdMult: 1.5, freeSlots: 1, used: 2, satMult: 3, bigMult: 2.25, freeSeeds: 0 };

function view(p: SeedPriceParts | undefined, cost: number, over: Partial<GameView> = {}): GameView {
  return { ...makeView({ seedCost: cost, ...over }), seedPrice: p as GameView['seedPrice'] };
}

describe('seed price explained from whatever the game sends', () => {
  it('shows every factor that changes the price, with today\'s reason', () => {
    expect(seedPriceTerms(crowded, 'es').map((t) => t.value)).toEqual(['2', '×1,5', '×3']);
    expect(seedPriceToday(crowded, 9, 'es')).toBe('Ahora cuesta 9 porque hay 2 criaturas vivas y la placa está llena.');
    expect(seedPriceToday(crowded, 9, 'en')).toBe('It costs 9 now because 2 creatures are alive and the dish is full.');
  });

  it('hides factors that are ×1 or absent (a fixed price per session with a slot limit)', () => {
    const fixed: SeedPriceParts = { base: 3, freeSlots: 4, used: 1 };
    expect(seedPriceTerms(fixed, 'es').map((t) => t.value)).toEqual(['3']);
    expect(seedPriceTerms({ ...crowded, crowdMult: 1, satMult: 1 }, 'en')).toHaveLength(1);
    expect(seedPriceToday(fixed, 3, 'es')).toBe('Ahora cuesta 3.');
    expect(seedPriceRule(fixed, 'es')).toBe('Sembrar cuesta siempre lo mismo: 3 de Esencia. En la placa caben 4.');
    const x = seedPriceSheetExplain(view(fixed, 3), 'en')!;
    expect(x.terms).toHaveLength(1);
    expect(x.rows?.[0].text).toBe('3 left');
    expect(x.action).toBeUndefined();
    // No breakdown at all: no sheet (the pill just shows the price).
    expect(seedPriceSheetExplain(view(undefined, 3), 'es')).toBeNull();
  });

  it('says why the price moved, only with causes the game still has', () => {
    const v0 = seedPriceSnap(view(crowded, 9))!;
    const fewer = seedPriceSnap(view({ ...crowded, alive: 1, crowdMult: 1.25, satMult: 1, used: 1 }, 2.5))!;
    expect(seedPriceChange(v0, fewer, 'es')).toEqual({ text: 'Hay sitio otra vez → más barato', dir: -1 });
    const s0 = seedPriceSnap(view({ base: 3, freeSlots: 2, used: 0 }, 3))!;
    const s1 = seedPriceSnap(view({ base: 4, freeSlots: 2, used: 0 }, 4))!;
    expect(seedPriceChange(s0, s1, 'en')).toEqual({ text: 'New price: 4', dir: 1 });
    expect(seedPriceChange(s0, s0, 'en')).toBeNull();
    const bigger = seedPriceSnap(view({ base: 3, freeSlots: 3, used: 0 }, 3))!;
    expect(seedPriceChange(s0, bigger, 'es')?.text).toBe('Placa más grande: caben 3');
  });

  it('sessions loop: one price per session plus a small step per seed bought; room comes from the Tree', () => {
    const ses: SeedPriceParts = { base: 3, alive: 4, crowdMult: 1, freeSlots: 4, used: 4, satMult: 1, bigMult: 2.25, freeSeeds: 0, cheapMult: 1, stepMult: 1.05 ** 6, bought: 6, capacity: 4, full: true };
    expect(seedPriceTerms(ses, 'es').map((t) => t.value)).toEqual(['3', '×1,34']);
    expect(seedPriceTerms(ses, 'es')[1].label).toBe('6 compradas hoy');
    expect(seedPriceRule(ses, 'es')).toBe(
      'Cada semilla cuesta 3 de Esencia. Cada semilla que compras hoy cuesta un poquito más. En la próxima sesión vuelve a costar lo de siempre. En la placa caben 4.',
    );
    expect(seedPriceToday(ses, 4, 'es')).toBe('Ahora cuesta 4 porque ya compraste 6 hoy.');
    const x = seedPriceSheetExplain(view(ses, 4), 'es', { onSeeTree: () => undefined })!;
    expect(x.rows?.map((r) => r.text)).toContain('¿Placa llena? Compra «Más sitio» en el Árbol.');
    expect(x.action?.label).toBe('Ver en el Árbol');
    // ×1,05 on 3 still reads 3: no step shown, nothing "went up".
    expect(seedPriceTerms({ ...ses, stepMult: 1.05, bought: 1 }, 'en')).toHaveLength(1);
    expect(seedPriceToday({ ...ses, stepMult: 1.05, bought: 1 }, 3, 'en')).toBe('It costs 3 now.');
    // A discount from the Tree is a factor of its own.
    expect(seedPriceTerms({ ...ses, stepMult: 1, cheapMult: 0.8 }, 'es').map((t) => `${t.value} ${t.label}`)).toEqual(['3 una semilla', '×0,8 Semillas baratas']);
    // Why it moved: one more today, or a new session.
    const three = seedPriceSnap(view({ ...ses, stepMult: 1.05 ** 3, bought: 3 }, 3))!;
    const four = seedPriceSnap(view({ ...ses, stepMult: 1.05 ** 4, bought: 4 }, 4))!;
    const fresh = seedPriceSnap(view({ ...ses, stepMult: 1, bought: 0, used: 0, full: false }, 3))!;
    expect(seedPriceChange(three, four, 'es')).toEqual({ text: 'Una más hoy → un poquito más', dir: 1 });
    expect(seedPriceChange(four, fresh, 'en')).toEqual({ text: 'New session → usual price', dir: -1 });
  });

  it('every line has both languages and no jargon', () => {
    for (const lang of ['es', 'en'] as const) {
      const x = seedPriceSheetExplain(view(crowded, 9, { seedsGrowing: true }), lang, { onSeeDish: () => undefined })!;
      const words = [x.title, x.rule, x.advice ?? '', x.action?.label ?? '', ...x.terms.map((t) => t.label), ...(x.rows ?? []).map((r) => r.text)].join(' ');
      expect(words).not.toMatch(/[μσα]|kernel|calibr/i);
      expect(words.length).toBeGreaterThan(40);
    }
  });
});
