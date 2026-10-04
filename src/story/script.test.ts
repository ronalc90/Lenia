import { describe, expect, it } from 'vitest';
import type { Text } from '../core/types';
import { ENDINGS } from './endings';
import { MAX_WORDS, MAX_WORDS_TUTORIAL, SCENES, SCENE_BY_ID, STORY_JOURNAL, T_INTRO_AFTER_INTRO, T_INTRO_LINES } from './script';
import { ENDING_IDS, HINT_KINDS, TARGET_IDS, type LineDef, type SceneDef } from './types';

/** Words that carry letters or digits (the Choir's dots don't count). */
function words(s: string): number {
  return s
    .replace(/\{[a-z]+\}/g, 'X')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

function staticLines(s: SceneDef): LineDef[] {
  // Scenes whose lines vary with state list every variant here (t_intro: with / without the opening intro).
  const variants: Record<string, LineDef[]> = { t_intro: [...T_INTRO_LINES, ...T_INTRO_AFTER_INTRO] };
  const lines = typeof s.lines === 'function' ? [...(variants[s.id] ?? [])] : [...s.lines];
  if (s.choice && s.choice.options !== 'final') for (const o of s.choice.options) lines.push(...(o.reply ?? []));
  return lines;
}

function texts(s: SceneDef): Text[] {
  const out: Text[] = [s.title, ...staticLines(s).map((l) => l.text)];
  if (s.wait) out.push(s.wait.text);
  if (s.choice && s.choice.options !== 'final')
    for (const o of s.choice.options) {
      out.push(o.label);
      if (o.wait) out.push(o.wait.text);
    }
  return out;
}

describe('story script', () => {
  it('every scene has Spanish and English text everywhere', () => {
    for (const s of SCENES) {
      expect(staticLines(s).length, s.id).toBeGreaterThan(0);
      for (const tx of texts(s)) {
        expect(tx.es.trim(), `${s.id} es`).not.toBe('');
        expect(tx.en.trim(), `${s.id} en`).not.toBe('');
      }
    }
  });

  it('tutorial bubbles stay at 12 words or fewer, every line at 20 or fewer', () => {
    for (const s of SCENES)
      for (const l of staticLines(s)) {
        const max = s.tutorial ? MAX_WORDS_TUTORIAL : MAX_WORDS;
        expect(words(l.text.es), `${s.id} es: ${l.text.es}`).toBeLessThanOrEqual(max);
        expect(words(l.text.en), `${s.id} en: ${l.text.en}`).toBeLessThanOrEqual(max);
      }
  });

  it('task instructions and choice buttons are a handful of words', () => {
    for (const s of SCENES) {
      if (s.wait) expect(words(s.wait.text.es), s.id).toBeLessThanOrEqual(6);
      if (s.choice && s.choice.options !== 'final')
        for (const o of s.choice.options) {
          expect(words(o.label.es), s.id).toBeLessThanOrEqual(5);
          expect(words(o.label.en), s.id).toBeLessThanOrEqual(5);
        }
    }
  });

  it('Spanish questions and exclamations open and close', () => {
    for (const s of SCENES)
      for (const l of staticLines(s)) {
        const es = l.text.es;
        if (es.includes('¿')) expect(es.includes('?'), es).toBe(true);
        if (es.includes('¡')) expect(es.includes('!'), es).toBe(true);
      }
  });

  it('scene ids are unique and references resolve', () => {
    expect(SCENE_BY_ID.size).toBe(SCENES.length);
    const journal = new Set(STORY_JOURNAL.map((j) => j.id));
    for (const s of SCENES) {
      for (const a of s.after ?? []) expect(SCENE_BY_ID.has(a), `${s.id} after ${a}`).toBe(true);
      if (s.journal) expect(journal.has(s.journal), s.journal).toBe(true);
      for (const l of staticLines(s)) {
        for (const tg of l.target ?? []) expect(TARGET_IDS).toContain(tg);
        if (l.hint) expect(HINT_KINDS).toContain(l.hint);
      }
      for (const tg of s.wait?.target ?? []) expect(TARGET_IDS).toContain(tg);
      if (s.choice && s.choice.options !== 'final')
        for (const o of s.choice.options) if (o.journal) expect(journal.has(o.journal), o.journal).toBe(true);
    }
  });

  it('every journal entry is bilingual', () => {
    for (const j of STORY_JOURNAL) {
      expect(j.text.es.trim()).not.toBe('');
      expect(j.text.en.trim()).not.toBe('');
    }
  });

  it('every ending has bilingual cards, a closing line, an epilogue and a journal entry', () => {
    const journal = new Set(STORY_JOURNAL.map((j) => j.id));
    for (const id of ENDING_IDS) {
      const e = ENDINGS[id];
      for (const tx of [e.title, e.option, e.closing, ...e.cards]) {
        expect(tx.es.trim(), id).not.toBe('');
        expect(tx.en.trim(), id).not.toBe('');
      }
      expect(e.cards.length).toBeGreaterThanOrEqual(3);
      expect(SCENE_BY_ID.get(e.epilogue)?.act, id).toBe(4);
      expect(journal.has(`s_end_${id}`), id).toBe(true);
    }
  });

  it('there are four main endings and one secret', () => {
    expect(ENDING_IDS.filter((id) => !ENDINGS[id].secret)).toHaveLength(4);
    expect(ENDING_IDS.filter((id) => ENDINGS[id].secret)).toEqual(['albor']);
  });

  it('there are three mid-game choices plus the final question', () => {
    const ids = new Set(SCENES.filter((s) => s.choice).map((s) => s.choice!.id));
    expect([...ids].sort()).toEqual(['final', 'lamp', 'rhythm', 'sample']);
  });
});
