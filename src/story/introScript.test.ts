import { describe, expect, it } from 'vitest';
import { Bus, type GameEvents } from '../core/bus';
import { INTRO_MAX_WORDS, INTRO_PANELS, INTRO_SECONDS, INTRO_UI } from './introScript';
import { INTRO_SEEN_FLAG, MAX_WORDS_TUTORIAL, T_INTRO_AFTER_INTRO, T_INTRO_LINES } from './script';
import { createStory } from './story';
import { makeView, memoryStorage } from './testUtil';

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

describe('opening intro script', () => {
  it('keeps every line at 12 words or fewer, in both languages', () => {
    for (const p of INTRO_PANELS)
      for (const l of p.lines) {
        expect(words(l.text.es), l.text.es).toBeLessThanOrEqual(INTRO_MAX_WORDS);
        expect(words(l.text.en), l.text.en).toBeLessThanOrEqual(INTRO_MAX_WORDS);
        expect(l.text.es.length).toBeGreaterThan(0);
        expect(l.text.en.length).toBeGreaterThan(0);
      }
  });

  it('tells the story then how to play in 30 to 45 seconds, two lines per panel at most', () => {
    expect(INTRO_SECONDS).toBeGreaterThanOrEqual(30);
    expect(INTRO_SECONDS).toBeLessThanOrEqual(45);
    for (const p of INTRO_PANELS) expect(p.lines.length).toBeLessThanOrEqual(2);
    const ids = INTRO_PANELS.map((p) => p.id);
    expect(ids.slice(0, 5)).toEqual(['station', 'tape', 'arrive', 'candle', 'dish']);
    expect(ids).toEqual(expect.arrayContaining(['sow', 'essence', 'clock', 'tree']));
    expect(INTRO_PANELS.filter((p) => p.picker)).toHaveLength(1);
  });

  it('names the game concepts a player needs: Esencia, reloj, Datos, Árbol, Mundos', () => {
    const all = INTRO_PANELS.flatMap((p) => p.lines.map((l) => l.text.es)).join(' ');
    for (const w of ['placa', 'Esencia', 'reloj', 'Datos', 'Árbol', 'Mundos', 'Albor', 'VELA']) expect(all).toContain(w);
  });

  it('has both languages on every button label', () => {
    for (const k of ['next', 'back', 'start', 'skipAll', 'replay'] as const) {
      expect(INTRO_UI[k].es).not.toBe('');
      expect(INTRO_UI[k].en).not.toBe('');
    }
  });
});

describe('t_intro after the intro', () => {
  it('does not repeat the hello: after the intro VELA goes straight to the tap', () => {
    for (const l of [...T_INTRO_LINES, ...T_INTRO_AFTER_INTRO]) {
      expect(words(l.text.es)).toBeLessThanOrEqual(MAX_WORDS_TUTORIAL);
      expect(words(l.text.en)).toBeLessThanOrEqual(MAX_WORDS_TUTORIAL);
    }
    const play = (flag: boolean) => {
      const story = createStory({ bus: new Bus<GameEvents>(), getView: () => makeView(), storage: memoryStorage(), now: () => 1e6, random: () => 0.99, pollMs: 0 });
      if (flag) story.setFlag(INTRO_SEEN_FLAG);
      story.tick();
      const said: string[] = [];
      for (let i = 0; i < 10 && story.current()?.phase === 'lines'; i++) {
        said.push(story.current()!.line!.text.es);
        story.advance();
      }
      return { said, phase: story.current()?.phase, id: story.current()?.scene.id };
    };
    const plain = play(false);
    const after = play(true);
    expect(plain.id).toBe('t_intro');
    expect(after.id).toBe('t_intro');
    expect(plain.said).toHaveLength(T_INTRO_LINES.length);
    expect(after.said).toHaveLength(T_INTRO_AFTER_INTRO.length);
    expect(after.said.join(' ')).not.toContain('Soy VELA');
    // Both still end on the "tap the dish" task.
    expect(plain.phase).toBe('wait');
    expect(after.phase).toBe('wait');
  });

  it('remembers the flag in the save', () => {
    const storage = memoryStorage();
    const s = createStory({ bus: new Bus<GameEvents>(), getView: () => makeView(), storage, now: () => 1e6, pollMs: 0 });
    s.setFlag(INTRO_SEEN_FLAG);
    expect(s.serialize().flags).toContain(INTRO_SEEN_FLAG);
  });
});
