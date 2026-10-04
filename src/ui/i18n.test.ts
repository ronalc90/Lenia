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
    expect(t('eraEnd', { n: 3 })).toBe('End of Era 3');
    expect(tx({ es: 'hola', en: 'hello' })).toBe('hello');
    expect(behaviorName('swimmer')).toBe('Swimmer');
    expect(behaviorName(null)).toBe('Classifying…');
    setLang('es');
    expect(t('eraEnd', { n: 3 })).toBe('Fin de la Era 3');
    expect(rarityName('veryRare')).toBe('Muy rara');
    expect(tx(null)).toBe('');
  });
});
