/**
 * Safe local persistence (doc §16). Every storage access is wrapped in try/catch and falls back
 * to an in-memory store, so the game keeps working in private windows / blocked storage / node.
 *
 * Layout (localStorage):
 *   bioluma.game       versioned game JSON with checksum (Game.serialize())
 *   bioluma.game.bak   last copy that passed verification (used if the main one is corrupt)
 *   bioluma.dish       "WxH:" + base64(zero-run-length-encoded 8-bit grid)
 *   bioluma.dish.bak   previous dish
 *   bioluma.savedAt    ms timestamp of the last successful game write (offline calculation)
 *   bioluma.game.unreadable  a save no build could read (corrupt, or from a newer version), kept
 *                      aside so the next autosave cannot destroy it (recoverable by hand)
 *
 * Priorities when the storage is full: the game state first, then its backup, the dish last
 * (dish copies are dropped to make room for the game).
 */
import * as B from './balance';
import { base64ToBytes, bytesToBase64, deserializeState } from './state';

const K_GAME = 'bioluma.game';
const K_GAME_BAK = 'bioluma.game.bak';
const K_DISH = 'bioluma.dish';
const K_DISH_BAK = 'bioluma.dish.bak';
const K_TIME = 'bioluma.savedAt';
const K_UNREADABLE = 'bioluma.game.unreadable';
/** What may be deleted to make room for the game state, least valuable first. */
const DROPPABLE = [K_DISH_BAK, K_DISH, K_GAME_BAK];

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const memory = new Map<string, string>();
const memoryStorage: StorageLike = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
};

let override: StorageLike | null | undefined;

/** Tests: inject a storage (null = force the in-memory fallback, undefined = auto). */
export function setStorage(s: StorageLike | null | undefined): void {
  override = s;
  memory.clear();
}

function storage(): StorageLike {
  if (override !== undefined) return override ?? memoryStorage;
  try {
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
    if (ls) {
      const probe = '__bioluma_probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    }
  } catch {
    /* storage blocked */
  }
  return memoryStorage;
}

/**
 * False when the browser storage is blocked (private window, "block all cookies") and saves only
 * live in memory for this session: the player must be told (QA1 #3). writeSave() then reports
 * false so the integrator's "could not save" warning shows.
 */
export function isPersistent(): boolean {
  return storage() !== memoryStorage;
}

function get(k: string): string | null {
  try {
    return storage().getItem(k);
  } catch {
    return memory.get(k) ?? null;
  }
}

function set(k: string, v: string): boolean {
  try {
    storage().setItem(k, v);
    return true;
  } catch {
    memory.set(k, v); // quota exceeded / blocked: keep it for this session at least
    return false;
  }
}

function remove(k: string): void {
  try {
    storage().removeItem(k);
  } catch {
    /* ignore */
  }
  memory.delete(k);
}

/** Write the game state; on failure (quota) free optional copies one by one and retry. */
function setGame(v: string): boolean {
  if (set(K_GAME, v)) return true;
  for (const k of DROPPABLE) {
    if (get(k) === null) continue;
    remove(k);
    if (set(K_GAME, v)) return true;
  }
  return false;
}

// ───────────────────────────── dish encoding ───────────────────────

/** Zero-run RLE: bytes 1..255 literal; 0 followed by a count byte (1..255) = run of zeros. */
export function encodeDish(grid: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < grid.length) {
    const v = grid[i];
    if (v !== 0) {
      out.push(v);
      i++;
      continue;
    }
    let run = 0;
    while (i < grid.length && grid[i] === 0 && run < 255) {
      run++;
      i++;
    }
    out.push(0, run);
  }
  return Uint8Array.from(out);
}

export function decodeDish(rle: Uint8Array, expected: number): Uint8Array | null {
  const out = new Uint8Array(expected);
  let o = 0;
  for (let i = 0; i < rle.length; i++) {
    const v = rle[i];
    if (v !== 0) {
      if (o >= expected) return null;
      out[o++] = v;
    } else {
      const run = rle[++i];
      if (!run || o + run > expected) return null;
      o += run; // already zero
    }
  }
  return o === expected ? out : null;
}

function packDish(dish: Uint8Array, w: number, h: number): string {
  return `${w}x${h}:${bytesToBase64(encodeDish(dish))}`;
}

function unpackDish(s: string | null): { dish: Uint8Array; w: number; h: number } | null {
  if (!s) return null;
  try {
    const m = /^(\d{1,5})x(\d{1,5}):([A-Za-z0-9+/=]*)$/.exec(s);
    if (!m) return null;
    const w = Number(m[1]);
    const h = Number(m[2]);
    if (!(w > 0 && h > 0 && w * h <= 4096 * 4096)) return null;
    const dish = decodeDish(base64ToBytes(m[3]), w * h);
    return dish ? { dish, w, h } : null;
  } catch {
    return null;
  }
}

// ───────────────────────────── public API ──────────────────────────

export interface LoadedSave {
  /** Game.serialize() string that passed checksum/range validation, or null. */
  game: string | null;
  dish: Uint8Array | null;
  dishW: number;
  dishH: number;
  /** ms timestamp of the last write, or 0. */
  savedAt: number;
}

const validGame = (s: string | null): s is string => !!s && deserializeState(s) !== null;

/** Load the newest valid save (falls back to the last good copy). Never throws. */
export function loadSave(): LoadedSave {
  const out: LoadedSave = { game: null, dish: null, dishW: 0, dishH: 0, savedAt: 0 };
  try {
    const main = get(K_GAME);
    const bak = get(K_GAME_BAK);
    out.game = validGame(main) ? main : validGame(bak) ? bak : null;
    // Nothing readable but something is there (corrupt, or written by a newer build): park it
    // where the autosave will not overwrite it, instead of losing it two saves from now.
    if (out.game === null && (main || bak) && get(K_UNREADABLE) === null) set(K_UNREADABLE, (main || bak)!);
    const d = unpackDish(get(K_DISH)) ?? unpackDish(get(K_DISH_BAK));
    if (d) {
      out.dish = d.dish;
      out.dishW = d.w;
      out.dishH = d.h;
    }
    const t = Number(get(K_TIME));
    out.savedAt = Number.isFinite(t) && t > 0 ? t : 0;
  } catch {
    /* corrupted storage: start fresh */
  }
  return out;
}

/**
 * Write the game (and optionally the dish). The previous valid copy is kept as backup.
 * Returns false if persistent storage refused the write (data kept in memory for the session).
 */
export function writeSave(gameStr: string, dish?: Uint8Array, w?: number, h?: number, now: number = Date.now()): boolean {
  let ok = true;
  try {
    const prev = get(K_GAME);
    if (prev && prev !== gameStr && validGame(prev)) ok = set(K_GAME_BAK, prev) && ok;
    const gameOk = setGame(gameStr);
    ok = gameOk && ok;
    if (dish && w && h && dish.length === w * h) {
      const prevDish = get(K_DISH);
      if (prevDish) set(K_DISH_BAK, prevDish);
      ok = set(K_DISH, packDish(dish, w, h)) && ok;
    }
    // The offline clock only moves with the game it belongs to: if the game write failed, the
    // stored state is older than `now` and the next session must count from that older time.
    if (gameOk) ok = set(K_TIME, String(Math.floor(now))) && ok;
  } catch {
    ok = false;
  }
  // Kept in memory only (storage blocked): nothing survives closing the tab — not a success.
  return ok && isPersistent();
}

/** Forget the saved dish (an import: the old picture does not belong to the imported game). */
export function clearDish(): void {
  for (const k of [K_DISH, K_DISH_BAK]) remove(k);
}

/** Remove every Bioluma key (Settings → delete save). */
export function clearSave(): void {
  for (const k of [K_GAME, K_GAME_BAK, K_DISH, K_DISH_BAK, K_TIME, K_UNREADABLE]) remove(k);
}

/**
 * Seconds away for offline progress (doc §12 clock rules): device-clock difference, never
 * negative (a clock that went backwards counts 0), capped at 24 h.
 */
export function offlineSeconds(savedAt: number, now: number = Date.now()): number {
  if (!(savedAt > 0) || !Number.isFinite(now)) return 0;
  const d = (now - savedAt) / 1000;
  if (!(d > 0)) return 0;
  return Math.min(d, B.OFFLINE_HARD_CAP);
}
