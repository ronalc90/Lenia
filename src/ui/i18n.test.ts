import { describe, expect, it } from 'vitest';
import { behaviorName, rarityName, setLang, STRINGS, t, tx } from './i18n';

describe('i18n', () => {
  it('has every UI string in Spanish and English with matching placeholders', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const [key, text] of Object.entries(STRINGS)) {
      expect(text.es.trim(), `${key}.es`).not.toBe('');
      expect(text.en.trim(), `${key}.en`).not.toBe('');
      expect(ph(text.es), `${key} placeholders`).toBe(ph(text.en));
    }
  });

  it('switches language and fills placeholders', () => {
    setLang('en');
    expect(t('newSpeciesN', { n: 3 })).toBe('3 new species!');
    expect(tx({ es: 'hola', en: 'hello' })).toBe('hello');
    expect(behaviorName('swimmer')).toBe('Swimmer');
    expect(behaviorName(null)).toBe('Watching how it moves…');
    setLang('es');
    expect(t('newSpeciesN', { n: 3 })).toBe('¡3 especies nuevas!');
    expect(rarityName('veryRare')).toBe('Muy rara');
    expect(tx(null)).toBe('');
  });
});

// QA-4 N6 (c2-026, c2-030): the English dish showed «Centrar». Its label was written once, in Spanish, before the
// language was known; the static labels are rewritten on every language change.
describe('static labels follow the language (QA-4 N6)', async () => {
  const ui = ((await import('./ui.ts?raw')) as { default: string }).default;
  const relabel = ui.slice(ui.indexOf('private relabelStatic(): void {'), ui.indexOf('private ensureBestiary('));
  it('QA-4 N6: «Centrar» is relabelled in English', () => {
    expect(relabel).toMatch(/fabCentre/);
    expect(relabel).toMatch(/t\('recenter'\)/);
    setLang('en');
    expect(t('recenter')).toBe('Re-centre');
    setLang('es');
  });
});

// QA-4 N17 (c4-013): «¡Toca el círculo que brilla!» while the Tree's nodes are square tiles.
describe('the Tree names what the player sees (QA-4 N17)', async () => {
  const { TREE_UI } = await import('../game/treeText');
  it('QA-4 N17: the glowing node is a square, not a circle', () => {
    for (const k of ['tapGlowing', 'hintFirst'] as const) {
      expect(TREE_UI[k].es).not.toMatch(/círculo/);
      expect(TREE_UI[k].en).not.toMatch(/circle/);
      expect(TREE_UI[k].es).toMatch(/cuadro/);
    }
  });
});
