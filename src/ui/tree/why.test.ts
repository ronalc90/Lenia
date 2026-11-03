import { describe, expect, it } from 'vitest';
import { TREE_NODES } from '../../game/tree';
import { nodeWhy, sheetSentences, whySentences } from './why';

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
