/**
 * Bitácora entries of the secrets ("secret.<id>"). The secrets module emits `grantJournal` with the
 * exact text once (some texts carry the moment's number, e.g. the palindrome); this keeps those texts
 * and their read flag so the journal modal, the unread dot and the export work like any other entry.
 * Spoilers: docs/SECRETS.md.
 */
import type { JournalEntryView, Text } from '../core/types';
import type { StorageLike } from './types';

export const SECRET_JOURNAL_KEY = 'bioluma.secrets.journal';

export interface SecretJournal {
  /** A secret's entry (idempotent: the first text wins). Returns true if it is new. */
  add(id: string, text: Text): boolean;
  /** Entries in the GameView shape, oldest first. */
  views(): JournalEntryView[];
  markRead(): void;
  reset(): void;
}

interface Entry {
  id: string;
  text: Text;
  read: boolean;
}

const isText = (x: unknown): x is Text =>
  !!x && typeof x === 'object' && typeof (x as Text).es === 'string' && typeof (x as Text).en === 'string';

function defaultStorage(): StorageLike | null {
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
  } catch {
    return null;
  }
}

export function createSecretJournal(store: StorageLike | null = defaultStorage()): SecretJournal {
  let entries: Entry[] = [];
  try {
    const raw: unknown = JSON.parse(store?.getItem(SECRET_JOURNAL_KEY) ?? '[]');
    if (Array.isArray(raw))
      entries = raw
        .filter((e): e is Entry => !!e && typeof e.id === 'string' && e.id.startsWith('secret.') && isText(e.text))
        .map((e) => ({ id: e.id, text: { es: e.text.es, en: e.text.en }, read: e.read === true }));
  } catch {
    entries = [];
  }
  // Same objects until something changes: the merged view stays cheap at 10 updates per second.
  let cache: JournalEntryView[] | null = null;
  const persist = () => {
    cache = null;
    try {
      store?.setItem(SECRET_JOURNAL_KEY, JSON.stringify(entries));
    } catch {
      /* quota / private mode: the entries live for this session */
    }
  };
  return {
    add(id, text) {
      if (entries.some((e) => e.id === id)) return false;
      entries.push({ id, text: { es: text.es, en: text.en }, read: false });
      persist();
      return true;
    },
    views() {
      cache ??= entries.map((e) => ({ id: e.id, text: e.text, read: e.read }));
      return cache;
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
