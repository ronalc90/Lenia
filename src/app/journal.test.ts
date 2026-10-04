import { describe, expect, it } from 'vitest';
import type { GameView } from '../core/types';
import { SUPPORTER_JOURNAL } from '../store/catalog';
import { createExtraJournal } from './journal';

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

const view = (journal: GameView['journal'] = []) => ({ journal }) as unknown as GameView;

describe('extra journal entries', () => {
  it('adds the supporter thanks once ever, unread, and persists it', () => {
    const store = memory();
    const j = createExtraJournal(store);
    expect(j.add(SUPPORTER_JOURNAL.id)).toBe(true);
    expect(j.add(SUPPORTER_JOURNAL.id)).toBe(false);
    expect(j.merge(view()).journal).toEqual([{ id: SUPPORTER_JOURNAL.id, text: SUPPORTER_JOURNAL.text, read: false }]);
    j.markRead();
    const again = createExtraJournal(store);
    expect(again.merge(view()).journal[0].read).toBe(true);
  });

  it('ignores unknown ids and merges other sources after the game entries', () => {
    const j = createExtraJournal(memory());
    expect(j.add('not.a.real.entry')).toBe(false);
    j.addSource(() => [{ id: 'story.x', text: { es: 'a', en: 'a' }, read: false }]);
    const merged = j.merge(view([{ id: 'g1', text: { es: 'g', en: 'g' }, read: true }])).journal.map((e) => e.id);
    expect(merged).toEqual(['g1', 'story.x']);
  });

  it('returns the same view when there is nothing to add', () => {
    const v = view();
    expect(createExtraJournal(memory()).merge(v)).toBe(v);
  });
});
