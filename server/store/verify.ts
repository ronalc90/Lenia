/**
 * Signature checks for the store API (Web Crypto only; Workers, Vercel Edge, Node >= 19).
 *
 * - Lemon Squeezy webhooks: header `X-Signature` = hex HMAC-SHA256 of the RAW request body with the
 *   webhook signing secret (env LEMONSQUEEZY_WEBHOOK_SECRET). Compared in constant time.
 * - Player requests: ECDSA P-256 over src/store/protocol.ts entitlementsMessage(), reusing the
 *   ranking's key format and verifier (server/protocol.ts verifyBytes). The key must be the one the
 *   ranking registered for this player (trust on first use there); if the player never submitted a
 *   score, the store record pins the first key it sees (its own trust on first use).
 */
import { ENT_MAX_SKEW_MS, HDR, PLAYER_ID_RE, entitlementsMessage } from '../../src/store/protocol.js';
import { playerKey, publicKeyBytes, toHex, utf8, verifyBytes } from '../protocol.js';

type Bytes = Uint8Array<ArrayBuffer>;
const ab = (u: Uint8Array): Bytes => u as Bytes;

export async function hmacSha256Hex(secret: string, data: string | Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', ab(utf8(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, ab(typeof data === 'string' ? utf8(data) : data));
  return toHex(new Uint8Array(mac));
}

/** Constant-time comparison of two strings (length leak only). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True only for a non-empty secret and a matching lowercase-hex signature. */
export async function verifyLemonSqueezySignature(rawBody: string, signature: string | null, secret: string | undefined): Promise<boolean> {
  if (!secret || !signature) return false;
  const sig = signature.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sig)) return false;
  return timingSafeEqual(await hmacSha256Hex(secret, rawBody), sig);
}

export type PlayerAuth =
  | { ok: true; playerId: string; /** playerKey(playerId): storage key, raw ids are never stored. */ key: string; pub: string; registered: boolean }
  | { ok: false; status: number; error: string };

export interface PlayerAuthOptions {
  now?: number;
  maxSkewMs?: number;
  /** Public key the ranking registered for this player key (server/store.ts getPlayer(key).pub). */
  registeredKey?: (key: string) => Promise<string | null>;
  /** Public key pinned in the store record (TOFU), if any. */
  pinnedKey?: (key: string) => Promise<string | null>;
}

/**
 * Checks the x-bioluma-* headers of a request for `method path`. On success the caller may pin
 * `pub` in the store record when `registered` is false and nothing was pinned yet.
 */
export async function verifyPlayerRequest(req: Request, path: string, opts: PlayerAuthOptions = {}): Promise<PlayerAuth> {
  const h = (n: string) => req.headers.get(n) ?? '';
  const playerId = h(HDR.player);
  const pub = h(HDR.key);
  const tsRaw = h(HDR.ts);
  const nonce = h(HDR.nonce);
  const sig = h(HDR.sig);
  if (!PLAYER_ID_RE.test(playerId)) return { ok: false, status: 400, error: 'player' };
  if (!publicKeyBytes(pub)) return { ok: false, status: 400, error: 'key' };
  if (!/^[0-9a-f]{32}$/.test(nonce)) return { ok: false, status: 400, error: 'nonce' };
  const ts = Number(tsRaw);
  const now = opts.now ?? Date.now();
  if (!/^\d{1,16}$/.test(tsRaw) || Math.abs(now - ts) > (opts.maxSkewMs ?? ENT_MAX_SKEW_MS)) return { ok: false, status: 401, error: 'clock' };
  const ok = await verifyBytes(pub, sig, utf8(entitlementsMessage(req.method, path, playerId, ts, nonce)));
  if (!ok) return { ok: false, status: 401, error: 'signature' };
  const key = await playerKey(playerId);
  const registered = (await opts.registeredKey?.(key).catch(() => null)) ?? null;
  if (registered) {
    if (registered !== pub) return { ok: false, status: 403, error: 'key_mismatch' };
    return { ok: true, playerId, key, pub, registered: true };
  }
  const pinned = (await opts.pinnedKey?.(key).catch(() => null)) ?? null;
  if (pinned && pinned !== pub) return { ok: false, status: 403, error: 'key_mismatch' };
  return { ok: true, playerId, key, pub, registered: false };
}
