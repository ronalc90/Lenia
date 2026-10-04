/**
 * Storage wrapper for the ranking identity and integrity flags: every access is try/catch'ed and falls
 * back to memory (private windows, blocked storage, node tests), like src/game/save.ts does.
 */
import type { StorageLike } from '../game/save';

export function safeStorage(preferred?: StorageLike | null): StorageLike {
  const memory = new Map<string, string>();
  let backing: StorageLike | null = preferred ?? null;
  if (preferred === undefined) {
    try {
      backing = (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
    } catch {
      backing = null;
    }
  }
  return {
    getItem(k) {
      try {
        const v = backing?.getItem(k);
        if (v !== undefined && v !== null) return v;
      } catch {
        /* blocked */
      }
      return memory.get(k) ?? null;
    },
    setItem(k, v) {
      memory.set(k, v);
      try {
        backing?.setItem(k, v);
      } catch {
        /* quota / blocked: the memory copy keeps this session working */
      }
    },
    removeItem(k) {
      memory.delete(k);
      try {
        backing?.removeItem(k);
      } catch {
        /* ignore */
      }
    },
  };
}

export function readJson<T>(s: StorageLike, key: string): T | null {
  try {
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
