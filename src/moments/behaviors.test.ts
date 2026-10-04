import { describe, expect, it } from 'vitest';
import { CATALOG_REFS } from '../detect/catalogRefs';
import { BEHAVIOR_MULT } from '../game/balance';
import { AFFINITY_TREE_BONUS } from '../game/cycleBalance';
import { TREE_NODES } from '../game/tree';
import { NODE_TEXT } from '../game/treeText';
import { WORLD_BY_ID } from '../game/worlds';
import { MOMENT_BY_ID } from './catalog';
import { MAX_LINE_WORDS } from './config';
import {
  AFFINITY_OF,
  BEHAVIOR_ORDER,
  affinityStepText,
  baselineText,
  behaviorExample,
  behaviorGuide,
  bonusText,
  exampleWorldText,
  multText,
} from './behaviors';

const words = (s: string) => s.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

describe('behaviour guide: what changes (numbers come from balance.ts)', () => {
  for (const b of BEHAVIOR_ORDER) {
    it(`${b}: bonus = BEHAVIOR_MULT.${b}, in both languages`, () => {
      const g = behaviorGuide(b);
      expect(g.mult).toBe(BEHAVIOR_MULT[b]);
      expect(bonusText(b, 'es')).toBe(`${g.name.es}: ${multText(BEHAVIOR_MULT[b], 'es')} Esencia`);
      expect(bonusText(b, 'en')).toBe(`${g.name.en}: ${multText(BEHAVIOR_MULT[b], 'en')} Essence`);
      // The behaviour moment shows the same chip first.
      expect(MOMENT_BY_ID.get(`behavior.${b}` as never)!.lines[0]).toEqual(g.what);
    });
  }

  it('reads naturally', () => {
    expect(bonusText('swimmer', 'es')).toBe(`Nadadora: ${multText(BEHAVIOR_MULT.swimmer, 'es')} Esencia`);
    expect(multText(1.6, 'es')).toBe('×1,6');
    expect(multText(2.5, 'en')).toBe('×2.5');
    expect(baselineText('es')).toBe(`comparada con una quieta ${multText(BEHAVIOR_MULT.still, 'es').replace(/,0$/, '')}`);
    expect(affinityStepText('en')).toBe(`+${Math.round(AFFINITY_TREE_BONUS * 100)}% per level`);
  });
});

describe('behaviour guide: how to get more', () => {
  it('examples are real catalog species that a World grows, and the "how" names that World', () => {
    for (const b of BEHAVIOR_ORDER) {
      const e = behaviorExample(b);
      if (!e) continue;
      const ref = CATALOG_REFS.find((r) => r.code === e.code)!;
      expect(ref.viable).toBe(true);
      expect(WORLD_BY_ID[e.world].species).toContain(e.code);
      // The line says the same world as the example (no numbers, no sliders).
      expect(behaviorGuide(b).how.es).toContain(exampleWorldText(e, 'es'));
      expect(behaviorGuide(b).how.en).toContain(exampleWorldText(e, 'en'));
    }
    expect(behaviorExample('swimmer')?.code).toBe('O2u');
    expect(exampleWorldText(behaviorExample('swimmer')!, 'es')).toBe('Mundo 1 · Clásico');
    expect(exampleWorldText(behaviorExample('spinner')!, 'en')).toBe('World 3 · Whirls');
    // Colony is three alike together: no single species to point at.
    expect(behaviorExample('colony')).toBeNull();
  });

  it('no simulation jargon: nothing about μ, σ, R or rules to tune', () => {
    for (const b of BEHAVIOR_ORDER) {
      const g = behaviorGuide(b);
      for (const tx of [g.what, g.how, g.hint, ...(g.note ? [g.note.text] : [])])
        for (const l of ['es', 'en'] as const) expect(tx[l], `${b} ${l}`).not.toMatch(/[μσ]|\bR\b|calibr|régimen|regime|imprim|print/i);
    }
  });
});

describe('behaviour guide: how to boost it', () => {
  it('each behaviour points at a real research-tree node whose text names it', () => {
    const named: Record<string, RegExp> = {
      swimmer: /nadan/,
      spinner: /nadan/,
      still: /quietas/,
      pulsing: /laten/,
      divider: /dividen/,
      colony: /colonias/,
    };
    for (const b of BEHAVIOR_ORDER) {
      const id = AFFINITY_OF[b];
      expect(TREE_NODES.some((n) => n.id === id), id).toBe(true);
      expect(NODE_TEXT[id].desc.es, `${id} → ${b}`).toMatch(named[b]);
    }
  });
});

describe('behaviour guide: words', () => {
  for (const b of BEHAVIOR_ORDER) {
    it(`${b} is short, bilingual and honest`, () => {
      const g = behaviorGuide(b);
      for (const tx of [g.what, g.how, g.hint, ...(g.note ? [g.note.text] : [])]) {
        for (const l of ['es', 'en'] as const) {
          expect(tx[l].trim(), `${b} ${l}`).not.toBe('');
          expect(words(tx[l]), `${b} ${l}: ${tx[l]}`).toBeLessThanOrEqual(MAX_LINE_WORDS);
        }
      }
      expect(words(g.see.es)).toBeLessThanOrEqual(4);
      expect(words(g.see.en)).toBeLessThanOrEqual(4);
    });
  }

  it('dividers warn about overflowing; colonies say what "together" means', () => {
    expect(behaviorGuide('divider').note).toMatchObject({ kind: 'risk' });
    expect(behaviorGuide('divider').note!.text.es).toMatch(/desborda/);
    expect(behaviorGuide('colony').note!.text.es).toBe('3 o más de la misma especie, a menos de dos cuerpos.');
  });
});
