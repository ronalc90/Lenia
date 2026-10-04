import { describe, expect, it } from 'vitest';
import { createSecretJournal, SECRET_JOURNAL_KEY } from './journal';

function memory() {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

describe('secret journal entries', () => {
  it('keeps the first granted text of each secret, unread until read', () => {
    const j = createSecretJournal(memory());
    expect(j.add('secret.answer', { es: 'Cuarenta y dos.', en: 'Forty-two.' })).toBe(true);
    expect(j.add('secret.answer', { es: 'otra', en: 'other' })).toBe(false);
    expect(j.views()).toEqual([{ id: 'secret.answer', text: { es: 'Cuarenta y dos.', en: 'Forty-two.' }, read: false }]);
    j.markRead();
    expect(j.views()[0].read).toBe(true);
  });

  it('survives a reload and ignores corrupt storage', () => {
    const s = memory();
    createSecretJournal(s).add('secret.logo', { es: 'Toc', en: 'Knock' });
    expect(createSecretJournal(s).views().map((e) => e.id)).toEqual(['secret.logo']);
    s.setItem(SECRET_JOURNAL_KEY, '{not json');
    expect(createSecretJournal(s).views()).toEqual([]);
    s.setItem(SECRET_JOURNAL_KEY, JSON.stringify([{ id: 'nope', text: 1 }, { id: 'secret.x', text: { es: 'a', en: 'b' } }]));
    expect(createSecretJournal(s).views().map((e) => e.id)).toEqual(['secret.x']);
  });

  it('returns the same array until something changes (cheap merges)', () => {
    const j = createSecretJournal(memory());
    j.add('secret.heart', { es: 'a', en: 'b' });
    expect(j.views()).toBe(j.views());
    j.reset();
    expect(j.views()).toEqual([]);
  });
});
