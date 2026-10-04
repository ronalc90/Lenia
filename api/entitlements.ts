/**
 * GET /api/entitlements: the authoritative store state of the calling player.
 * Requires the player's ECDSA P-256 signature (headers in src/store/protocol.ts); the key must match
 * the one the ranking registered for that player, or the one pinned on the first store read (TOFU).
 *
 * Environment:
 *   STORE_KV                  KV namespace binding (Cloudflare). Missing → in-memory (dev/test only).
 *   STORE_ALLOWED_ORIGINS     Extra comma-separated origins (e.g. https://localhost for a Capacitor shell).
 *                             Same-origin requests never get CORS headers.
 *
 * Deploy next to the webhook (Cloudflare Pages Functions):
 *   functions/api/entitlements.ts → `export { onRequestGet, onRequestOptions } from '../../api/entitlements';`
 */
import { ENTITLEMENTS_PATH, HDR } from '../src/store/protocol.js';
import { RateLimiter } from '../server/ratelimit.js';
import { claimRotation, loadRecord, saveRecord, snapshotOf } from '../server/store/entitlements.js';
import { kvFromEnv, type KV } from '../server/store/kv.js';
import { verifyPlayerRequest } from '../server/store/verify.js';

export const config = { runtime: 'edge' };

export interface EntitlementsEnv {
  STORE_KV?: unknown;
  STORE_ALLOWED_ORIGINS?: string;
  [k: string]: unknown;
}

export interface EntitlementsDeps {
  kv?: KV;
  now?: () => number;
  /** Public key the ranking registered for a player key (wire to server/store.ts getPlayer(key)?.pub). */
  registeredKey?: (key: string) => Promise<string | null>;
  limiter?: RateLimiter;
}

const defaultLimiter = new RateLimiter(30, 0.5);

function corsFor(req: Request, env: EntitlementsEnv): { ok: boolean; headers: Record<string, string> } {
  const origin = req.headers.get('origin');
  if (!origin) return { ok: req.headers.get('sec-fetch-site') !== 'cross-site', headers: {} };
  try {
    if (new URL(origin).host === new URL(req.url).host) return { ok: true, headers: {} };
  } catch {
    return { ok: false, headers: {} };
  }
  const allowed = String(env.STORE_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!allowed.includes(origin)) return { ok: false, headers: {} };
  return {
    ok: true,
    headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': Object.values(HDR).join(', '),
      'access-control-max-age': '600',
      vary: 'Origin',
    },
  };
}

export async function handleEntitlements(req: Request, env: EntitlementsEnv, deps: EntitlementsDeps = {}): Promise<Response> {
  const cors = corsFor(req, env);
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors.headers } });
  if (!cors.ok) return reply(403, { error: 'origin' });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors.headers });
  if (req.method !== 'GET') return reply(405, { error: 'method' });
  const now = deps.now?.() ?? Date.now();
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!(deps.limiter ?? defaultLimiter).take(ip, now).ok) return reply(429, { error: 'rate' });

  const kv = deps.kv ?? kvFromEnv(env).kv;
  const auth = await verifyPlayerRequest(req, ENTITLEMENTS_PATH, {
    now,
    registeredKey: deps.registeredKey,
    pinnedKey: async (key) => (await loadRecord(kv, key)).pub ?? null,
  });
  if (!auth.ok) return reply(auth.status, { error: auth.error });
  try {
    const rec = await loadRecord(kv, auth.key);
    let dirty = false;
    if (!auth.registered && !rec.pub) {
      rec.pub = auth.pub; // trust on first use for players who never submitted a score
      dirty = true;
    }
    // Yearly subscribers get no monthly invoice: claim the palette of the month on read.
    if (claimRotation(rec, now)) dirty = true;
    if (dirty) await saveRecord(kv, rec, now);
    return reply(200, snapshotOf(rec, auth.playerId, now));
  } catch (err) {
    console.error('[entitlements] failed', err);
    return reply(500, { error: 'storage' });
  }
}

function processEnv(): EntitlementsEnv {
  try {
    return ((globalThis as { process?: { env?: EntitlementsEnv } }).process?.env ?? {}) as EntitlementsEnv;
  } catch {
    return {};
  }
}

/** Vercel Edge Function entry. */
export default async function handler(req: Request): Promise<Response> {
  return handleEntitlements(req, processEnv());
}

/** Cloudflare Pages Functions entries. */
export const onRequestGet = (context: { request: Request; env: EntitlementsEnv }): Promise<Response> => handleEntitlements(context.request, context.env);
export const onRequestOptions = onRequestGet;
