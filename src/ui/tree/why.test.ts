import { describe, expect, it } from 'vitest';
import { TREE_NODES } from '../../game/tree';
import { nodeWhy, sheetCounters, sheetSentences, whySentences } from './why';

const ctx = { levels: { lab: 1, clock: 1 }, datos: 4, sessions: 1, species: 1, recentDatos: [12] };

describe('«¿Por qué?» explains, it does not repeat (owner bug B-10.5)', () => {
  it('no sentence of the explanation is already in the node sheet', () => {
    for (const id of ['clock', 'dropper', 'culture', 'worldCold', 'dish']) {
      const w = nodeWhy(id, ctx.levels[id as 'clock'] ?? 0, 'es', ctx);
      expect(w, id).not.toBeNull();
      const sheet = sheetSentences(id, 'es', ctx).map((s) => s.trim().toLowerCase());
      for (const s of whySentences(w!)) expect(sheet, `${id}: «${s}»`).not.toContain(s.trim().toLowerCase());
    }
  });

  it('says what it is for, why it matters and what it opens, in both languages', () => {
    for (const lang of ['es', 'en'] as const)
      for (const def of TREE_NODES) {
        if (def.id === 'lab') continue;
        const w = nodeWhy(def.id, 0, lang, ctx)!;
        expect(w.forWhat.length, def.id).toBeGreaterThan(8);
        expect(w.matters.length, def.id).toBeGreaterThan(8);
        expect(w.unlocks.length, def.id).toBeGreaterThan(8);
        expect(new Set([w.forWhat, w.matters, w.unlocks]).size, def.id).toBe(3);
      }
  });

  it('shows the price as an equation and the next levels', () => {
    const w = nodeWhy('clock', 1, 'es', ctx)!;
    expect(w.equation.start).toMatch(/\d/);
    expect(w.equation.total).toMatch(/\d/);
    expect(w.next.length).toBeGreaterThan(0);
  });
});

// QA-4 pulido 2 (c2-015, c1-159): «Clock route · step 1 of 7» with 6 dots, «Más sitio · paso 2 de 7» with 3 dots: two
// counters of different things side by side. The sheet shows one: the node's level.
describe('the node sheet counts one thing (QA-4 pulido 2)', () => {
  it('QA-4: the route chip names the route; the only count is the level', () => {
    const c = sheetCounters({ es: 'Placa', en: 'Dish' }, 1, 3, 'es');
    expect(c.route).toBe('Ruta Placa');
    expect(c.level).toBe('Nivel 1 de 3');
    expect(`${c.route} ${c.level}`.match(/\d+ de \d+/g)).toHaveLength(1);
    expect(sheetCounters({ es: 'Reloj', en: 'Clock' }, 0, 6, 'en')).toEqual({ route: 'Clock route', level: 'Level 0 of 6' });
    expect(sheetCounters({ es: 'Reloj', en: 'Clock' }, 2, 1, 'es').level).toBeNull();
    expect(sheetCounters({ es: 'Vida', en: 'Life' }, 7, 999, 'es').level).toBe('Nivel 7 de ∞');
  });
});
