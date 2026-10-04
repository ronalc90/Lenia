/**
 * Ranking cosmetics: the badge, frame and name colour other players see next to a name.
 *
 * The client only says what it WANTS (signed `cosmetics` field of a submission); the server decides
 * what is shown with the store's entitlement record (server/store/entitlements.ts publicCosmetics):
 * free achievement items and defaults always, paid items only when the record owns them, supporter
 * items while the subscription is active. Without a store backend (no record) only free items show.
 * Only non-default choices are stored and sent, so most rows carry nothing extra.
 */
import { DEFAULT_ITEM, cosmeticById } from '../src/store/catalog.js';
import { activeSub, emptyRecord, publicCosmetics, subExpiresAt, type EntRecord } from './store/entitlements.js';

export type ProfileSlot = 'badge' | 'frame' | 'nameColor';
export const PROFILE_SLOTS: readonly ProfileSlot[] = ['badge', 'frame', 'nameColor'];

/** What a client asks to show (catalog ids). */
export type WantedCosmetics = Partial<Record<ProfileSlot, string>>;

/** What the server resolved for a player (non-default ids only). */
export interface RankCosmetics extends WantedCosmetics {
  /** Supporter-only items stop showing after this time (ms) unless a newer submission renews them. */
  subUntil?: number;
}

const ID_RE = /^[a-z0-9.]{3,48}$/;

/** Strict check of the untrusted `cosmetics` field: null when malformed. */
export function parseWantedCosmetics(x: unknown): WantedCosmetics | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null;
  const out: WantedCosmetics = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (!(PROFILE_SLOTS as readonly string[]).includes(k) || typeof v !== 'string' || !ID_RE.test(v)) return null;
    out[k as ProfileSlot] = v;
  }
  return out;
}

/** Resolve wanted cosmetics against the player's store record (null = no store backend / no record). */
export function resolveRankCosmetics(rec: EntRecord | null, key: string, wanted: WantedCosmetics, now: number): RankCosmetics | undefined {
  const r = rec ?? emptyRecord(key);
  const picked = publicCosmetics(r, wanted, now);
  const out: RankCosmetics = {};
  let supporter = false;
  for (const slot of PROFILE_SLOTS) {
    if (picked[slot] === DEFAULT_ITEM[slot]) continue;
    out[slot] = picked[slot];
    if (cosmeticById(picked[slot])?.unlock.type === 'subscription') supporter = true;
  }
  if (supporter) {
    const s = activeSub(r, now);
    out.subUntil = s ? subExpiresAt(s) : now;
  }
  return Object.keys(out).length ? out : undefined;
}

/** What a ranking row shows now (supporter items drop once the subscription has lapsed). */
export function visibleCosmetics(c: RankCosmetics | undefined, now: number): WantedCosmetics | undefined {
  if (!c) return undefined;
  const out: WantedCosmetics = {};
  for (const slot of PROFILE_SLOTS) {
    const id = c[slot];
    const it = id ? cosmeticById(id) : undefined;
    if (!it || it.slot !== slot) continue;
    if (it.unlock.type === 'subscription' && !(typeof c.subUntil === 'number' && now < c.subUntil)) continue;
    out[slot] = id;
  }
  return Object.keys(out).length ? out : undefined;
}
