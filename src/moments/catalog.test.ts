import { describe, expect, it } from 'vitest';
import { SCENE_BY_ID } from '../story/script';
import { HELP_ORDER, MOMENTS, MOMENT_BY_ID, MOMENT_IDS, STORY_SCENES_COVERED } from './catalog';
import { MAX_BRIEF_WORDS, MAX_LINE_WORDS, MAX_LINES, MAX_TITLE_WORDS } from './config';
import type { Text } from '../core/types';

/** Words = whitespace-separated tokens with a letter or a digit ("→", "…" do not count). */
function words(s: string): number {
  return s
    .trim()
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

function bothLangs(text: Text, what: string): void {
  expect(text.es.trim(), `${what} es`).not.toBe('');
  expect(text.en.trim(), `${what} en`).not.toBe('');
}

describe('moments catalog: words', () => {
  for (const m of MOMENTS) {
    it(`"${m.id}" is short and bilingual`, () => {
      bothLangs(m.title, `${m.id} title`);
      bothLangs(m.brief, `${m.id} brief`);
      expect(words(m.title.es), `${m.id} title es "${m.title.es}"`).toBeLessThanOrEqual(MAX_TITLE_WORDS);
      expect(words(m.title.en), `${m.id} title en "${m.title.en}"`).toBeLessThanOrEqual(MAX_TITLE_WORDS);
      expect(words(m.brief.es), `${m.id} brief es`).toBeLessThanOrEqual(MAX_BRIEF_WORDS);
      expect(words(m.brief.en), `${m.id} brief en`).toBeLessThanOrEqual(MAX_BRIEF_WORDS);
      expect(m.lines.length).toBeGreaterThanOrEqual(1);
      expect(m.lines.length).toBeLessThanOrEqual(MAX_LINES);
      for (const l of m.lines) {
        bothLangs(l, `${m.id} line`);
        expect(words(l.es), `${m.id} es "${l.es}"`).toBeLessThanOrEqual(MAX_LINE_WORDS);
        expect(words(l.en), `${m.id} en "${l.en}"`).toBeLessThanOrEqual(MAX_LINE_WORDS);
        // One sentence or two, never a paragraph.
        expect(l.es.split(/[.!?…]+\s/).length, `${m.id} es sentences`).toBeLessThanOrEqual(2);
        expect(l.en.split(/[.!?…]+\s/).length, `${m.id} en sentences`).toBeLessThanOrEqual(2);
      }
      if (m.action) {
        bothLangs(m.action.label, `${m.id} action`);
        expect(words(m.action.label.es)).toBeLessThanOrEqual(3);
        expect(words(m.action.label.en)).toBeLessThanOrEqual(3);
      }
      expect(m.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  }

  it('Spanish and English are not copies of each other (except names)', () => {
    for (const m of MOMENTS) for (const l of m.lines) expect(l.es, m.id).not.toBe(l.en);
  });
});

describe('moments catalog: structure', () => {
  it('ids are unique and every one is in the help sheet', () => {
    expect(new Set(MOMENT_IDS).size).toBe(MOMENT_IDS.length);
    expect([...HELP_ORDER].sort()).toEqual([...MOMENT_IDS].sort());
  });

  it('covers the owner\'s list: every behaviour, deaths, explosions, life, spark, prestige, offline, prices', () => {
    for (const id of [
      'seed',
      'dissolve',
      'explode',
      'stable',
      'income',
      'species',
      'secondSpecies',
      'behavior.still',
      'behavior.pulsing',
      'behavior.swimmer',
      'behavior.spinner',
      'behavior.divider',
      'behavior.colony',
      'division',
      'golden',
      'upgrade',
      'autoseed',
      'clock',
      'extinctionReady',
      'extinction',
      'offline',
      'seedPrice',
      'overgrown',
    ] as const)
      expect(MOMENT_BY_ID.has(id), id).toBe(true);
  });

  it('every story scene a moment consumes exists in the script', () => {
    expect(STORY_SCENES_COVERED.length).toBeGreaterThan(0);
    for (const id of STORY_SCENES_COVERED) expect(SCENE_BY_ID.has(id), id).toBe(true);
  });

  it('only tutorial explainer scenes are consumed (never choices or story beats)', () => {
    for (const id of STORY_SCENES_COVERED) {
      const s = SCENE_BY_ID.get(id)!;
      expect(s.tutorial, id).toBe(true);
      expect(s.choice, id).toBeUndefined();
    }
  });

  it('no simulation jargon and no scary words in any card (docs/CLARIDAD.md)', () => {
    for (const m of MOMENTS)
      for (const tx of [m.title, m.brief, ...m.lines])
        for (const l of ['es', 'en'] as const) {
          expect(tx[l], `${m.id} ${l}`).not.toMatch(/[μσ]|calibr|régimen|regime|kernel|alfa|alpha/i);
          expect(tx[l], `${m.id} ${l}`).not.toMatch(/explot|exploded|muert|murió|\bdead\b|died/i);
        }
  });

  it('the calibration card and the "a creature died → cheaper" label are gone', () => {
    expect(MOMENT_BY_ID.has('calibration' as never)).toBe(false);
    expect(MOMENT_BY_ID.has('seedCheaper' as never)).toBe(false);
  });
});

describe('the LIFE card and the creature label say the same rate (RF-10)', () => {
  const life = MOMENT_BY_ID.get('stable')!;
  const ctxFor = (phase: string, eps: number) =>
    ({ view: () => ({ session: { phase }, creatures: [{ id: 7, eps, state: 'stable' }] }) }) as unknown as Parameters<NonNullable<typeof life.build>>[1];
  it('before the first seed: no rate chip (the label shows none and the HUD +0/s)', () => {
    const b = life.build!({ id: 7, x: 10, y: 10 }, ctxFor('ready', 2));
    expect(b.chips ?? []).toEqual([]);
  });
  it('while the clock runs: the chip is the creature\'s own rate, never a made-up 1', () => {
    const b = life.build!({ id: 7, x: 10, y: 10 }, ctxFor('running', 2));
    expect(JSON.stringify(b.chips)).toContain('+2,0 Esencia/s');
    expect(life.build!({ id: 7, x: 10, y: 10 }, ctxFor('running', 0)).chips ?? []).toEqual([]);
  });
});
