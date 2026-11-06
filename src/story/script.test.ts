import { describe, expect, it } from 'vitest';
import scriptSource from './script.ts?raw';
import { Bus, type GameEvents } from '../core/bus';
import type { GameView, Text } from '../core/types';
import { ENDINGS } from './endings';
import {
  INTRO_SEEN_FLAG,
  MAX_WORDS,
  MAX_WORDS_TUTORIAL,
  SCENES,
  SCENE_BY_ID,
  STORY_JOURNAL,
  T_INTRO_AFTER_INTRO,
  T_INTRO_LINES,
  T_INTRO_SESSIONS,
  T_INTRO_SESSIONS_AFTER_INTRO,
  T_STABLE_LINES,
  T_STABLE_SESSIONS,
} from './script';
import { createStory } from './story';
import { creature, makeView, memoryStorage } from './testUtil';
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
  const variants: Record<string, LineDef[]> = {
    t_intro: [...T_INTRO_LINES, ...T_INTRO_AFTER_INTRO, ...T_INTRO_SESSIONS, ...T_INTRO_SESSIONS_AFTER_INTRO],
    t_stable: [...T_STABLE_LINES, ...T_STABLE_SESSIONS],
  };
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

describe('script wording', () => {
  it('never names punctuation in words (players read it as a glitch)', () => {
    const bad = /signo de (interrogaci|exclamaci)|question mark|exclamation mark|letra grande|big letters/i;
    expect(scriptSource).not.toMatch(bad);
  });
});

// ───────────── session 1 with the Sembrar button and the pulse (ADR-031, docs/MECANICAS.md §6.1) ─────────────

/** Session 1 waiting for its first seed, in a game with the pulse (`streak` in the view, as PA's game gives it). */
function s1(over: Partial<GameView> = {}): GameView {
  return makeView({
    cycle: 'sessions',
    research: { sessions: 0 } as GameView['research'],
    session: { n: 1, world: 'classic', phase: 'ready', limit: 15, bonus: 0, elapsed: 0, remaining: 15, progress: 0, essence: 0, seeds: 0, sprint: null, newSpecies: 0, endedEarly: false, first: true },
    streak: { hits: 0, max: 10, mult: 1, toChispazo: 10, every: 10, draining: false },
    ...over,
  });
}

/** Play session 1 like a child: read every line, do what VELA asks; log each tutorial scene with the clock's phase. */
function playSession1(pulse: boolean) {
  let now = 1_000_000;
  let v = s1(pulse ? {} : { streak: undefined });
  const bus = new Bus<GameEvents>();
  const story = createStory({ bus, getView: () => v, storage: memoryStorage(), now: () => now, random: () => 0.99, pollMs: 0 });
  story.setFlag(INTRO_SEEN_FLAG);
  const seen: { id: string; phase: string; line: string; target: string[] }[] = [];
  const set = (over: Partial<GameView>) => (v = { ...v, ...over });
  const step = (sec: number) => {
    for (let i = 0; i < sec * 4; i++) {
      now += 250;
      story.tick();
      const cur = story.current();
      if (cur?.phase === 'lines' && cur.line && seen[seen.length - 1]?.line !== cur.line.text.es)
        seen.push({ id: cur.scene.id, phase: v.session!.phase, line: cur.line.text.es, target: cur.line.target ?? [] });
      // The session flow starts the clock once the tutorial lets it (flow.ts clockHold).
      if (v.session!.phase === 'ready' && v.session!.tutorialHold && !story.holdsClock()) set({ session: { ...v.session!, phase: 'running' } });
    }
  };
  const read = () => {
    for (let i = 0; i < 12 && story.current()?.phase === 'lines'; i++) {
      step(0.5);
      story.advance();
    }
  };
  step(1);
  read();
  const task = story.current()?.phase === 'wait' ? story.current()!.wait : null;
  // The Sembrar button: the first seed is the sure creature; the clock still waits for VELA.
  bus.emit('seed', { x: 116, y: 116, cost: 0, manual: true });
  set({ session: { ...v.session!, tutorialHold: true, seeds: 1 }, creatures: [creature(1, 'born', 116, 116)] });
  step(1);
  read();
  set({ creatures: [creature(1, 'stable', 116, 116)] });
  bus.emit('creatureStable', { id: 1, x: 116, y: 116 });
  // Read on; when VELA asks «Tócala», three pulses (the game's streak counts them; the dish is still).
  for (let i = 0; i < 60 && v.session!.phase === 'ready'; i++) {
    step(0.5);
    const cur = story.current();
    if (cur?.phase === 'lines') story.advance();
    else if (pulse && cur?.scene.id === 't_pulse' && cur.phase === 'wait')
      for (let h = 1; h <= 3; h++) bus.emit('pulse', { id: 1, x: 116, y: 116, amount: 1, hits: h, chispazo: false });
  }
  step(1);
  return { seen, task, phase: v.session!.phase, holds: story.holdsClock() };
}

describe('session 1 teaches the Sembrar button and the pulse (ADR-031, docs/MECANICAS.md §6.1)', () => {
  it('session 1 teaches sow → pulse → streak before the clock starts', () => {
    const r = playSession1(true);
    const ids = r.seen.map((x) => x.id);
    const first = (id: string) => ids.indexOf(id);
    for (const id of ['t_intro', 't_born', 't_stable', 't_pulse', 't_streak', 't_clock']) expect(ids, id).toContain(id);
    expect(first('t_intro')).toBeLessThan(first('t_born'));
    expect(first('t_stable')).toBeLessThan(first('t_pulse'));
    expect(first('t_pulse')).toBeLessThan(first('t_streak'));
    expect(first('t_streak')).toBeLessThan(first('t_clock'));
    // Every one of them with the clock still waiting (the tutorial never eats the run's 15 s).
    for (const x of r.seen.filter((s) => ['t_intro', 't_born', 't_stable', 't_pulse', 't_streak', 't_clock'].includes(s.id))) expect(x.phase, x.line).toBe('ready');
    expect(r.phase).toBe('running');
    expect(r.holds).toBe(false);
    // The words of §6.1, in order: sow with the seed button, tap the creature, taps in a row.
    const lines = r.seen.map((x) => x.line);
    expect(lines).toContain('Toca la semilla para sembrar.');
    expect(lines).toContain('Tócala: brilla y te da luz.');
    expect(lines).toContain('¡Más! Toques seguidos dan más luz.');
    // VELA points at the button, never at the dish, to sow: a tap on the dish never sows.
    expect(r.seen.find((x) => x.line === 'Toca la semilla para sembrar.')!.target[0]).toBe('seed');
    expect(r.task!.target?.[0]).toBe('seed');
    expect(r.task!.text.es).not.toMatch(/placa/i);
    expect(lines.join(' ')).not.toMatch(/Toca la placa/);
    // The pulse is the creature's: VELA's «Tócala» points at it.
    expect(r.seen.find((x) => x.id === 't_pulse')!.target[0]).toBe('creature');
  });

  it('three taps while VELA still says «Tócala» end the step at once (the streak may drain meanwhile)', async () => {
    const v = s1({ creatures: [creature(1, 'stable', 116, 116)], session: { ...s1().session!, tutorialHold: true } });
    const bus = new Bus<GameEvents>();
    const story = createStory({ bus, getView: () => v, storage: memoryStorage(), now: () => 1_000_000, random: () => 0.99, pollMs: 0 });
    story.play('t_pulse');
    expect(story.current()?.phase).toBe('lines');
    // The child taps while she is still talking; the streak is gone again by the time her line ends.
    for (let h = 1; h <= 3; h++) bus.emit('pulse', { id: 1, x: 116, y: 116, amount: 1, hits: 1, chispazo: false });
    await Promise.resolve();
    story.tick();
    expect(story.serialize().done).toContain('t_pulse');
  });

  it('a game without the pulse is never taught it (the clock comes right after «¡Vive!»)', () => {
    const r = playSession1(false);
    const ids = r.seen.map((x) => x.id);
    expect(ids).not.toContain('t_pulse');
    expect(ids).not.toContain('t_streak');
    expect(ids).toContain('t_clock');
    expect(r.phase).toBe('running');
  });

  it('every line has twelve words or fewer', () => {
    const tut = [...T_INTRO_SESSIONS, ...T_INTRO_SESSIONS_AFTER_INTRO, ...['t_pulse', 't_streak', 't_born', 't_clock'].flatMap((id) => staticLines(SCENE_BY_ID.get(id)!))];
    expect(tut.length).toBeGreaterThan(4);
    for (const l of tut) {
      expect(words(l.text.es), l.text.es).toBeLessThanOrEqual(12);
      expect(words(l.text.en), l.text.en).toBeLessThanOrEqual(12);
    }
    for (const id of ['t_intro', 't_pulse']) {
      const w = SCENE_BY_ID.get(id)!.wait!;
      expect(words(w.text.es), id).toBeLessThanOrEqual(6);
      expect(words(w.text.en), id).toBeLessThanOrEqual(6);
    }
  });

  it('no session-1 line scolds or sends the finger to sow on the dish', () => {
    const all = [...T_INTRO_SESSIONS, ...T_INTRO_SESSIONS_AFTER_INTRO, ...T_STABLE_SESSIONS, ...['t_pulse', 't_streak', 't_born', 't_clock'].flatMap((id) => staticLines(SCENE_BY_ID.get(id)!))];
    for (const l of all) for (const x of [l.text.es, l.text.en]) expect(x).not.toMatch(/Muy cerca|se fundirían|¡Cuidado!|Toca la placa|Tap the dish|Siembra (más )?lejos|Sow (further|away)/);
  });
});
