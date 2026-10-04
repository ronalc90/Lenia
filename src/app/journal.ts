/**
 * Bitácora entries that live outside the game save: the supporter thank-you note (src/store
 * SUPPORTER_JOURNAL, once ever) and any other provider of `JournalEntryView`s (the story layer).
 * They are appended to `view.journal` before the view reaches the UI, so the existing journal modal,
 * toast and unread dot work unchanged.
 */
import type { GameView, JournalEntryView, Text } from '../core/types';
import { SUPPORTER_JOURNAL } from '../store/catalog';

const KEY = 'bioluma.journal.extra.v1';

/** Texts of the extra entries this module owns. */
const TEXTS: Record<string, Text> = { [SUPPORTER_JOURNAL.id]: SUPPORTER_JOURNAL.text };

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export interface ExtraJournal {
  /** Add an owned entry once ever (true if it is new). */
  add(id: string): boolean;
  /** Other sources of entries (e.g. story.journalViews), merged after the owned ones. */
  addSource(fn: () => readonly JournalEntryView[]): void;
  /** The view with every extra entry appended to `journal`. */
  merge(view: GameView): GameView;
  /** Mark the owned entries read (sources mark their own). */
  markRead(): void;
  /** Forget everything (reset save). */
  reset(): void;
}

function storage(): StorageLike | null {
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
  } catch {
    return null;
  }
}

export function createExtraJournal(store: StorageLike | null = storage()): ExtraJournal {
  let entries: { id: string; read: boolean }[] = [];
  try {
    const raw: unknown = JSON.parse(store?.getItem(KEY) ?? '[]');
    if (Array.isArray(raw)) {
      entries = raw
        .filter((e): e is { id: string; read: boolean } => !!e && typeof e.id === 'string' && e.id in TEXTS)
        .map((e) => ({ id: e.id, read: e.read === true }));
    }
  } catch {
    entries = [];
  }
  const sources: (() => readonly JournalEntryView[])[] = [];
  const persist = () => {
    try {
      store?.setItem(KEY, JSON.stringify(entries));
    } catch {
      /* quota / privacy mode */
    }
  };
  return {
    add(id) {
      if (!(id in TEXTS) || entries.some((e) => e.id === id)) return false;
      entries.push({ id, read: false });
      persist();
      return true;
    },
    addSource(fn) {
      sources.push(fn);
    },
    merge(view) {
      if (!entries.length && !sources.length) return view;
      const extra: JournalEntryView[] = entries.map((e) => ({ id: e.id, text: TEXTS[e.id], read: e.read }));
      for (const fn of sources) {
        try {
          extra.push(...fn());
        } catch (err) {
          console.warn('[journal] source failed', err);
        }
      }
      return extra.length ? { ...view, journal: [...view.journal, ...extra] } : view;
    },
    markRead() {
      if (!entries.some((e) => !e.read)) return;
      for (const e of entries) e.read = true;
      persist();
    },
    reset() {
      entries = [];
      persist();
    },
  };
}
