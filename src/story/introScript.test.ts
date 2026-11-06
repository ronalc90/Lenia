import { describe, expect, it } from 'vitest';
import { Bus, type GameEvents } from '../core/bus';
import { INTRO_MAX_WORDS, INTRO_PANELS, INTRO_SECONDS, INTRO_UI } from './introScript';
import { INTRO_SEEN_FLAG, MAX_WORDS_TUTORIAL, T_INTRO_AFTER_INTRO, T_INTRO_LINES } from './script';
import { createStory } from './story';
import { makeView, memoryStorage } from './testUtil';
import { CHAIN, SIDE } from './encargoScript';

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

  it('names the game concepts a player needs: luz, reloj, Datos, Árbol, Mundos', () => {
    const all = INTRO_PANELS.flatMap((p) => p.lines.map((l) => l.text.es)).join(' ');
    for (const w of ['placa', 'luz', 'reloj', 'Datos', 'Árbol', 'Mundos', 'Albor', 'VELA']) expect(all).toContain(w);
    expect(all).not.toMatch(/Esencia|vela da calor/);
  });

  it('ends on the game in one sentence (CLARIDAD2 §1.1) and Albor leaves her light and her creatures', () => {
    const go = INTRO_PANELS[INTRO_PANELS.length - 1];
    expect(go.lines.map((l) => l.text.es).join(' ')).toBe('Siembra criaturas de luz y recoge la luz que hacen. Úsala para descubrir las 7 especies de la doctora Albor.');
    expect(INTRO_PANELS.find((p) => p.id === 'tape')!.lines.some((l) => l.text.es.startsWith('Te dejo mi luz y mis criaturas.'))).toBe(true);
    for (const id of ['sow', 'essence', 'clock', 'tree']) expect(INTRO_PANELS.find((p) => p.id === id)!.lines, id).toHaveLength(1);
  });

  it('has both languages on every button label', () => {
    for (const k of ['next', 'back', 'start', 'skipAll', 'replay'] as const) {
      expect(INTRO_UI[k].es).not.toBe('');
      expect(INTRO_UI[k].en).not.toBe('');
    }
  });
});

describe('t_intro after the intro', () => {
  it('does not repeat the station: after the intro VELA says who she is and asks for the tap (§2.4)', () => {
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
    expect(after.said.join(' ')).not.toContain('Estación Vigilia');
    expect(after.said[0]).toBe('Hola. Soy VELA, el monitor de esta placa.');
    expect(after.said[after.said.length - 1]).toBe('Toca la placa para poner una semilla de luz.');
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

// QA-3 N5 (v0.026, shots 153, 013): Fig. 1 of the intro said «Toca la placa para poner una semilla de luz», which no
// longer does anything: sowing is the Sembrar button (ADR-031).
describe('the intro and the Encargos send the finger to the Sembrar button to sow (QA-3 N5)', () => {
  const sowsOnDish = /Toca la placa|Tap the dish|cada toque pone|lejos del cristal|away from the glass/;

  it('QA-3: the intro\'s «how to sow» panel names the Sembrar button, never a tap on the dish', () => {
    const sow = INTRO_PANELS.find((p) => p.id === 'sow')!;
    for (const l of sow.lines) {
      expect(l.text.es).toMatch(/Sembrar/);
      expect(l.text.en).toMatch(/Sow/);
      expect(l.text.es + l.text.en).not.toMatch(/Toca la placa|Tap the dish/);
    }
  });

  it('no Encargo of the sessions cycle tells the player to tap the dish to sow', () => {
    for (const e of [...CHAIN, ...SIDE]) for (const x of [e.how?.es ?? '', e.how?.en ?? '']) expect(x, e.id).not.toMatch(/Toca la placa|Tap the dish|lejos del cristal|away from the glass/);
    expect(sowsOnDish.test('Toca el botón Sembrar')).toBe(false);
  });
});
