/**
 * Settings → Export / Import (RF-02): one versioned text that carries ALL the progress of a device, not
 * only the game state. A "BIOLUMA2." bundle holds:
 *  - game     the game export ("BIOLUMA1." + its checksummed save: Esencia, species, research tree,
 *             nights, settings, cosmetics owned in the game state);
 *  - parts    the serialize() of every module that keeps its own key: the story (VELA, choices,
 *             endings, journal), the Encargos chain, the secrets and the Momentos already seen;
 *  - raw      a few small keys copied as they are (the secrets' journal entries, the extra Bitácora,
 *             the character's look, the intro already seen).
 * Not carried, on purpose: the dish picture (another grid on another device: the session gets its
 * starter again, RF-05), the ranking identity and its anti-cheat marks (they belong to the device's key
 * pair), the store's signed entitlements (restored from the server) and device-only UI preferences.
 *
 * Old "BIOLUMA1." exports (game only) still import: `legacy` tells the caller so it can fit the
 * device's story to the imported game. Pure: no DOM; the caller reloads the page afterwards.
 */
import { EXPORT_PREFIX } from '../game/balance';
import { base64ToUtf8, deserializeState, utf8ToBase64 } from '../game/state';

export const BUNDLE_PREFIX = 'BIOLUMA2.';
export const BUNDLE_VERSION = 2;

export interface TransferStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** A module with its own saved state. */
export interface Transferable {
  serialize(): unknown;
  load(data: unknown): unknown;
}

export interface DecodedSave {
  /** The game export ("BIOLUMA1."…). */
  game: string;
  /** Module states by name (null for a legacy export). */
  parts: Record<string, unknown> | null;
  /** Raw keys (null for a legacy export). */
  raw: Record<string, string> | null;
  legacy: boolean;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** True when the game part loads (same checks as Game.importString, without touching a game). */
function gameLoads(game: string): boolean {
  try {
    return game.startsWith(EXPORT_PREFIX) && deserializeState(base64ToUtf8(game.slice(EXPORT_PREFIX.length))) !== null;
  } catch {
    return false;
  }
}

/** Read an export of either version; null when it is not a loadable Bioluma save. */
export function decodeSaveText(text: unknown): DecodedSave | null {
  const t = String(text ?? '').trim();
  if (t.startsWith(EXPORT_PREFIX)) return gameLoads(t) ? { game: t, parts: null, raw: null, legacy: true } : null;
  if (!t.startsWith(BUNDLE_PREFIX)) return null;
  let o: unknown;
  try {
    o = JSON.parse(base64ToUtf8(t.slice(BUNDLE_PREFIX.length)));
  } catch {
    return null;
  }
  if (!isObj(o) || o.v !== BUNDLE_VERSION || typeof o.game !== 'string' || !gameLoads(o.game)) return null;
  const parts = isObj(o.parts) ? o.parts : {};
  const raw: Record<string, string> = {};
  if (isObj(o.raw)) for (const [k, v] of Object.entries(o.raw)) if (typeof v === 'string') raw[k] = v;
  return { game: o.game, parts, raw, legacy: false };
}

export function encodeSave(game: string, parts: Record<string, unknown>, raw: Record<string, string>): string {
  return BUNDLE_PREFIX + utf8ToBase64(JSON.stringify({ v: BUNDLE_VERSION, game, parts, raw }));
}

export interface SaveTransferDeps {
  game: { exportString(): string; importString(s: string): boolean };
  /** Modules with their own state, by a stable name (story, encargos, secrets, moments). */
  parts: Record<string, Transferable>;
  storage: TransferStorage | null;
  /** Keys copied as they are. Only these are ever written on import. */
  rawKeys: readonly string[];
}

export interface SaveTransfer {
  exportText(): string;
  /** Replace the progress with an export. `legacy` = an old game-only export. */
  importText(text: string): { ok: boolean; legacy: boolean };
}

export function createSaveTransfer(deps: SaveTransferDeps): SaveTransfer {
  return {
    exportText() {
      const parts: Record<string, unknown> = {};
      for (const [name, m] of Object.entries(deps.parts)) {
        try {
          parts[name] = m.serialize();
        } catch {
          /* a broken module never blocks the export of the rest */
        }
      }
      const raw: Record<string, string> = {};
      for (const k of deps.rawKeys) {
        try {
          const v = deps.storage?.getItem(k);
          if (typeof v === 'string') raw[k] = v;
        } catch {
          /* storage blocked */
        }
      }
      return encodeSave(deps.game.exportString(), parts, raw);
    },
    importText(text) {
      const d = decodeSaveText(text);
      if (!d || !deps.game.importString(d.game)) return { ok: false, legacy: false };
      if (d.parts) {
        for (const [name, m] of Object.entries(deps.parts)) {
          if (!(name in d.parts)) continue;
          try {
            m.load(d.parts[name]);
          } catch {
            /* a damaged part keeps this device's own state */
          }
        }
      }
      if (d.raw) {
        for (const k of deps.rawKeys) {
          const v = d.raw[k];
          if (typeof v !== 'string') continue;
          try {
            deps.storage?.setItem(k, v);
          } catch {
            /* storage blocked */
          }
        }
      }
      return { ok: true, legacy: d.legacy };
    },
  };
}
