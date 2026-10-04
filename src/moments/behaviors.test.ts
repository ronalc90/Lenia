import { describe, expect, it } from 'vitest';
import type { Behavior } from '../core/types';
import { CATALOG_REFS } from '../detect/catalogRefs';
import { AFFINITY_BONUS, BEHAVIOR_MULT } from '../game/balance';
import { UPGRADE_TEXT } from '../game/content';
import { UPGRADE_BY_ID } from '../game/defs';
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
  exampleParamsText,
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
    expect(affinityStepText('en')).toBe(`+${Math.round(AFFINITY_BONUS * 100)}% per level`);
  });
});

describe('behaviour guide: how to get more', () => {
  it('examples are real catalog species the detector classes with that behaviour', () => {
    for (const b of BEHAVIOR_ORDER) {
      const e = behaviorExample(b);
      if (!e) continue;
      const ref = CATALOG_REFS.find((r) => r.code === e.code)!;
      expect(ref.viable).toBe(true);
      expect(ref.behavior).toBe(b);
    }
    // Swimmers with the starting rules, spinners a little further up σ.
    expect(behaviorExample('swimmer')?.code).toBe('O2u');
    expect(behaviorExample('spinner')!.sigma).toBeGreaterThan(behaviorExample('swimmer')!.sigma);
    expect(exampleParamsText(behaviorExample('swimmer')!, 'es')).toBe('μ 0,15 · σ 0,015');
    expect(exampleParamsText(behaviorExample('spinner')!, 'en')).toBe('μ 0.156 · σ 0.0224');
  });

  it('no invented examples: behaviours the catalog never shows get a hint only', () => {
    for (const b of ['pulsing', 'divider', 'colony'] as Behavior[]) {
      const e = behaviorExample(b);
      if (e) expect(CATALOG_REFS.find((r) => r.code === e.code)?.behavior).toBe(b);
    }
  });
});

describe('behaviour guide: how to boost it', () => {
  it('each behaviour points at a real Afinidad whose text names it', () => {
    const named: Record<string, RegExp> = {
      swimmer: /nadadoras/,
      spinner: /giratorias/,
      still: /quietas/,
      pulsing: /pulsantes/,
      divider: /divisoras/,
      colony: /colonias/,
    };
    for (const b of BEHAVIOR_ORDER) {
      const id = AFFINITY_OF[b];
      expect(UPGRADE_BY_ID[id], id).toBeDefined();
      expect(UPGRADE_TEXT[id].desc.es, `${id} → ${b}`).toMatch(named[b]);
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
    expect(behaviorGuide('colony').note!.text.es).toMatch(/3 o más de la misma especie, a menos de 3 R/);
  });
});
