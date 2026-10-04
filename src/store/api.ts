/**
 * Client side of GET /api/entitlements: a signed request with the player's ranking key.
 */
import { ENTITLEMENTS_PATH, HDR, entitlementsMessage, isServerSnapshot, type ServerSnapshot } from './protocol';
import type { PlayerIdentity } from './providers/types';

export interface SnapshotFetcherOptions {
  /** API origin ('' = same origin). */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Server clock offset learned elsewhere (ranking `serverTime`), added to now(). */
  clockOffsetMs?: () => number;
}

function nonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Headers proving the request comes from the holder of the player's key. */
export async function signedEntitlementHeaders(id: PlayerIdentity, method = 'GET', path = ENTITLEMENTS_PATH, ts = Date.now()): Promise<Record<string, string>> {
  const playerId = await id.playerId();
  const n = nonce();
  const sig = await id.sign(entitlementsMessage(method, path, playerId, ts, n));
  return {
    [HDR.player]: playerId,
    [HDR.key]: await id.publicKey(),
    [HDR.ts]: String(ts),
    [HDR.nonce]: n,
    [HDR.sig]: sig,
  };
}

/** Returns a function that fetches the authoritative snapshot, or null on any failure. */
export function createSnapshotFetcher(id: PlayerIdentity, opts: SnapshotFetcherOptions = {}): () => Promise<ServerSnapshot | null> {
  const f = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  return async () => {
    try {
      const ts = (opts.now?.() ?? Date.now()) + (opts.clockOffsetMs?.() ?? 0);
      const headers = await signedEntitlementHeaders(id, 'GET', ENTITLEMENTS_PATH, ts);
      const res = await f(`${opts.baseUrl ?? ''}${ENTITLEMENTS_PATH}`, { method: 'GET', headers, cache: 'no-store' });
      if (!res.ok) return null;
      const body: unknown = await res.json();
      return isServerSnapshot(body) ? body : null;
    } catch {
      return null;
    }
  };
}
