import { describe, expect, it } from 'vitest';
import { isProfane, normalizeName, validateName } from '../../server/names';

describe('ranking names', () => {
  it.each(['Ana', 'Peña_42', 'José María', 'xX-Orbium-Xx', 'Zoë', '李小龍研究', 'Lenia Fan 7', 'abcdefghijklmnop'])('accepts %s', (n) => {
    const r = validateName(n);
    expect(r).toEqual({ ok: true, name: normalizeName(n) });
  });

  it('trims and collapses whitespace', () => {
    expect(validateName('   Ana    Lu  ')).toEqual({ ok: true, name: 'Ana Lu' });
  });

  it.each([
    ['ab', 'name_length'],
    ['   a  ', 'name_length'],
    ['abcdefghijklmnopq', 'name_length'],
    ['Ana.B', 'name_chars'],
    ['<script>', 'name_chars'],
    ['hola🙂', 'name_chars'],
    ['1234', 'name_chars'],
    ['___', 'name_chars'],
  ])('rejects %s (%s)', (n, error) => {
    expect(validateName(n)).toEqual({ ok: false, error });
  });

  it.each(['fuck you', 'XxShitxX', 'pendejo', 'Gilipollas', 'hijueputa', 'la puta', 'p0lla', 'puuuta', 'MIERDA', 'c4bron', 'culo 3', 'Hdp'])(
    'blocks profanity: %s',
    (n) => {
      expect(isProfane(n)).toBe(true);
      expect(validateName(n)).toEqual({ ok: false, error: 'name_profanity' });
    },
  );

  it.each(['Computadora', 'Therapist', 'Maricarmen', 'Vergara', 'Nazira', 'Calculo', 'Canal 5', 'Cocktail', 'Shiitake', 'Concha', 'Disputa'])(
    'does not block innocent names: %s',
    (n) => {
      expect(isProfane(n)).toBe(false);
      expect(validateName(n).ok).toBe(true);
    },
  );

  it('reserves official-looking names', () => {
    expect(validateName('Admin')).toEqual({ ok: false, error: 'name_reserved' });
    expect(validateName('Bioluma Fan')).toEqual({ ok: false, error: 'name_reserved' });
  });
});
