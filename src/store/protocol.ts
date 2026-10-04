/**
 * Store wire protocol shared by the client (src/store) and the API (api/store-webhook.ts,
 * api/entitlements.ts). Pure, no DOM, no Node APIs.
 *
 * Reading entitlements requires the player's ECDSA P-256 signature (same keys as the ranking,
 * server/protocol.ts: raw 65-byte public key and 64-byte IEEE-P1363 signature, both base64url):
 *
 *   GET /api/entitlements
 *   x-bioluma-player: <playerId>          x-bioluma-key: <publicKey>
 *   x-bioluma-ts:     <ms since epoch>    x-bioluma-nonce: <32 hex>
 *   x-bioluma-sig:    sign(entitlementsMessage(...))
 *
 * The server checks the clock window and the key binding (key registered by the ranking for that
 * player, or trust on first use in the store record), then returns a ServerSnapshot.
 */

export const STORE_PROTOCOL_VERSION = 1;
export const ENTITLEMENTS_PATH = '/api/entitlements';
export const WEBHOOK_PATH = '/api/store-webhook';
/** Signed requests older/newer than this are refused (replay window). */
export const ENT_MAX_SKEW_MS = 5 * 60_000;

export const HDR = {
  player: 'x-bioluma-player',
  key: 'x-bioluma-key',
  ts: 'x-bioluma-ts',
  nonce: 'x-bioluma-nonce',
  sig: 'x-bioluma-sig',
} as const;

/** Player ids are UUID-like (server/protocol.ts UUIDISH). Also used to validate checkout custom data. */
export const PLAYER_ID_RE = /^[0-9a-fA-F-]{16,64}$/;

/** Exact bytes (as UTF-8) the player signs for an entitlements request. */
export function entitlementsMessage(method: string, path: string, playerId: string, ts: number, nonce: string): string {
  return `bioluma-ent-v${STORE_PROTOCOL_VERSION}\n${method.toUpperCase()}\n${path}\n${playerId}\n${ts}\n${nonce}`;
}

export type SnapshotSource = 'purchase' | 'bundle' | 'rotation' | 'grant';

export interface SnapshotItem {
  id: string;
  source: SnapshotSource;
  /** Grant time (ms). */
  at: number;
}

export interface SnapshotSubscription {
  plan: 'month' | 'year';
  /** Provider status, e.g. 'active', 'cancelled', 'past_due', 'expired'. */
  status: string;
  /** Benefits last until this time (ms); renewals push it forward. */
  expiresAt: number;
  willRenew: boolean;
  provider: string;
  /** Customer portal (cancel, change card) when the provider gives one. */
  manageUrl?: string;
  /** First activation (ms). */
  since: number;
}

/** What GET /api/entitlements returns: the authoritative state for one player. */
export interface ServerSnapshot {
  v: 1;
  playerId: string;
  items: SnapshotItem[];
  subscription: SnapshotSubscription | null;
  serverTime: number;
}

/** Structural check of an untrusted snapshot (client side, before applying it). */
export function isServerSnapshot(x: unknown): x is ServerSnapshot {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (o.v !== 1 || typeof o.playerId !== 'string' || typeof o.serverTime !== 'number' || !Array.isArray(o.items)) return false;
  for (const it of o.items as unknown[]) {
    if (!it || typeof it !== 'object') return false;
    const r = it as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.source !== 'string' || typeof r.at !== 'number') return false;
  }
  if (o.subscription !== null) {
    const s = o.subscription as Record<string, unknown> | undefined;
    if (!s || typeof s !== 'object' || typeof s.expiresAt !== 'number' || (s.plan !== 'month' && s.plan !== 'year')) return false;
  }
  return true;
}
