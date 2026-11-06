import { describe, expect, it } from 'vitest';
import type { GameView } from '../core/types';
import { makeView } from '../story/testUtil';
import { priceSheetHtml } from './moments/price';
import { bigSeedChip, pillRoomText, seedPriceChange, seedPriceRule, seedPriceSheetExplain, seedPriceSnap, seedPriceTerms, type SeedPriceParts } from './seed-price';

/** The sessions loop as the game sends it (docs/CICLO.md, ADR-030): no crowding, room from the Tree. */
const ses: SeedPriceParts = { base: 4, alive: 3, crowdMult: 1, freeSlots: 4, used: 3, satMult: 1, bigMult: 2.25, freeSeeds: 0, cheapMult: 1, stepMult: 1, bought: 2, capacity: 4 };
/** The classic loop (PHASE-2B-REMOVE): living creatures did raise the price there. */
const classic: SeedPriceParts = { base: 2, alive: 2, crowdMult: 1.5, freeSlots: 1, used: 2, satMult: 3, bigMult: 2.25, freeSeeds: 0 };

function view(p: SeedPriceParts | undefined, cost: number, over: Partial<GameView> = {}): GameView {
  return { ...makeView({ seedCost: cost, cycle: 'sessions', ...over }), seedPrice: p as GameView['seedPrice'] };
}

/** Everything the sheet says, in one string. */
function words(v: GameView, lang: 'es' | 'en'): string {
  const x = seedPriceSheetExplain(v, lang, { onSeeTree: () => undefined, onSeeDish: () => undefined })!;
  return [x.title, x.rule, x.advice ?? '', x.action?.label ?? '', ...x.terms.flatMap((t) => [t.value, t.label]), ...(x.rows ?? []).map((r) => `${r.label ?? ''} ${r.text}`)].join(' | ');
}

describe('the seed price card (docs/CLARIDAD2.md §2.11)', () => {
  it('no price explanation in the sessions cycle names living creatures as a cost', () => {
    const LIVING = /vivas?\b|viven|alive|living|criaturas? viva/i;
    const cases: SeedPriceParts[] = [ses, { ...ses, alive: 4, used: 4, full: true }, { ...ses, cheapMult: 0.85 }, { ...ses, freeSeeds: 2 }];
    for (const p of cases)
      for (const lang of ['es', 'en'] as const) {
        expect(words(view(p, 4), lang)).not.toMatch(LIVING);
        expect(seedPriceTerms(p, lang).some((t) => LIVING.test(t.label))).toBe(false);
      }
    // A new creature on the dish never makes a "why the price moved" chip (it never moves the price).
    const before = seedPriceSnap(view({ ...ses, alive: 1, used: 1 }, 4))!;
    const after = seedPriceSnap(view({ ...ses, alive: 2, used: 2 }, 4))!;
    expect(seedPriceChange(before, after, 'es')).toBeNull();
    // Even the classic surcharge is folded into the price, never told as "+1 criatura viva → ×1,25".
    const c0 = seedPriceSnap(view({ ...classic, alive: 1, used: 1, crowdMult: 1.25, satMult: 1 }, 2.5))!;
    const c1 = seedPriceSnap(view({ ...classic, alive: 2, used: 1, crowdMult: 1.5, satMult: 1 }, 3))!;
    expect(seedPriceChange(c0, c1, 'es')?.text ?? '').not.toMatch(LIVING);
    expect(seedPriceTerms(classic, 'es').map((t) => t.label).join(' ')).not.toMatch(LIVING);
  });

  it('costs carry the cost class with ↑ and bonuses the gain class with ×', () => {
    const cheap = seedPriceTerms({ ...ses, cheapMult: 0.85 }, 'es');
    expect(cheap.map((t) => [t.value, t.tone, t.sign ?? ''])).toEqual([
      ['4 luz', 'cost', ''],
      ['−15 %', 'gain', '↓'],
    ]);
    expect(cheap[1].label).toBe('Semillas baratas');
    const full = seedPriceTerms(classic, 'en');
    expect(full.find((t) => t.tone === 'cost' && t.sign === '↑')?.value).toBe('×3');
    const html = priceSheetHtml(seedPriceSheetExplain(view({ ...ses, cheapMult: 0.85 }, 3), 'es')!);
    expect(html).toMatch(/class="mo-sp-tile on t-gain"[\s\S]*?−15 %[\s\S]*?↓/);
    expect(html).toMatch(/class="mo-sp-tile on t-cost"[\s\S]*?4 luz/);
    expect(html).toMatch(/k-total[^"]*t-cost/);
    // A gain reads ×, + or − (a discount is a gain); a cost never reads as a bonus.
    for (const p of [{ ...ses, cheapMult: 0.85 }, classic, { ...ses, stepMult: 1.6, bought: 10 }])
      for (const t of seedPriceTerms(p, 'es')) {
        if (t.tone === 'gain') expect(t.value).toMatch(/^[×+−]/);
        if (t.tone === 'cost' && t.sign) expect(t.sign).toBe('↑');
      }
  });

  it('one price, said once: "Una semilla cuesta 4 de luz. Siempre."', () => {
    expect(seedPriceRule(ses, 'es')).toBe('Una semilla cuesta 4 de luz. Siempre.');
    expect(seedPriceRule(ses, 'en')).toBe('A seed costs 4 glow. Always.');
    expect(seedPriceRule({ ...ses, cheapMult: 0.85 }, 'es')).toBe('Una semilla cuesta lo mismo toda la sesión.');
    expect(words(view(ses, 4), 'es')).not.toMatch(/un poquito más|Esencia/);
    expect(seedPriceTerms(ses, 'es').map((t) => t.value)).toEqual(['4 luz']);
  });

  it('room is a row of wells with words: "Caben 1 más", "Placa llena (4 de 4)"', () => {
    const x = seedPriceSheetExplain(view(ses, 4), 'es')!;
    expect(x.rows?.[0]).toMatchObject({ label: 'Huecos', text: 'Cabe 1 más', dots: { free: 4, used: 3, over: 0 } });
    expect(priceSheetHtml(x)).toMatch(/mo-well on/);
    const full = seedPriceSheetExplain(view({ ...ses, used: 4, full: true }, 4), 'es', { onSeeTree: () => undefined })!;
    // QA-CLARIDAD-2 C6: «Llena · caben 4» read as «is it full, or do 4 more fit?».
    expect(full.rows?.[0].text).toBe('Placa llena (4 de 4)');
    expect(pillRoomText({ free: 4, used: 4, over: 0 }, 'es')).toBe('Llena (4 de 4)');
    expect(pillRoomText({ free: 4, used: 4, over: 0 }, 'en')).toBe('Full (4 of 4)');
    expect(pillRoomText({ free: 4, used: 1, over: 0 }, 'es')).toBe('Caben 3 más');
    expect(full.rows?.map((r) => r.text)).toContain('¿Placa llena? Compra «Más sitio» en el Árbol.');
    expect(full.action?.label).toBe('Ver en el Árbol');
    expect(seedPriceSheetExplain(view({ ...ses, freeSeeds: 1 }, 0), 'es')!.rows?.map((r) => r.text)).toContain('1 semilla gratis · las demás, 4 de luz');
  });

  it('the change chip only speaks when something really changed: «¡Gratis!», «−15 %»', () => {
    const a = seedPriceSnap(view(ses, 4))!;
    expect(seedPriceChange(a, a, 'es')).toBeNull();
    expect(seedPriceChange(a, seedPriceSnap(view({ ...ses, freeSeeds: 3 }, 0))!, 'es')).toEqual({ text: '¡Gratis!', dir: -1 });
    expect(seedPriceChange(a, seedPriceSnap(view({ ...ses, cheapMult: 0.85 }, 3))!, 'es')).toEqual({ text: '−15 % · Semillas baratas', dir: -1 });
    expect(seedPriceChange(a, seedPriceSnap(view({ ...ses, freeSlots: 5, capacity: 5 }, 4))!, 'en')?.text).toBe('Bigger dish: room for 5');
    expect(bigSeedChip(view(ses, 4, { tools: { ...makeView().tools, longPress: true } }), 'es')?.text).toBe('Semilla grande ×2');
  });

  it('no breakdown → no sheet; every line has both languages and no jargon', () => {
    expect(seedPriceSheetExplain(view(undefined, 3), 'es')).toBeNull();
    for (const lang of ['es', 'en'] as const)
      for (const p of [ses, classic]) {
        const w = words(view(p, 9, { seedsGrowing: true }), lang);
        expect(w).not.toMatch(/[μσα]|kernel|calibr|\d[.,]\d\d/i);
        expect(w.length).toBeGreaterThan(40);
      }
  });
});

describe('the seed sheet while the Nevera creature wakes (SessionClockView.wakeHold)', () => {
  it('it gives that reason, never «Hay semillas naciendo»', () => {
    const session = { n: 3, world: 'classic', phase: 'ready', limit: 20, bonus: 0, elapsed: 0, remaining: 20, progress: 0, essence: 0, seeds: 0, sprint: null, newSpecies: 0, endedEarly: false, wakeHold: true } as GameView['session'];
    const es = words(view(ses, 4, { session, seedsGrowing: true }), 'es');
    expect(es).toContain('la de la nevera se está despertando');
    expect(es).not.toContain('Hay semillas naciendo');
  });
});
