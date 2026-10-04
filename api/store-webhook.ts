/**
 * POST /api/store-webhook: Lemon Squeezy webhook → verified grants (src/store/protocol.ts WEBHOOK_PATH).
 *
 * Environment:
 *   LEMONSQUEEZY_WEBHOOK_SECRET  Signing secret set on the webhook in the Lemon Squeezy dashboard. REQUIRED;
 *                                without it every request is refused (503).
 *   LEMONSQUEEZY_VARIANTS        JSON map {"<variant id>": "<catalog item id>"} for every product variant,
 *                                e.g. {"512345":"palette.aurora","512399":"sub.mecenas.month"}.
 *   LEMONSQUEEZY_ALLOW_TEST=1    Also process test-mode events (preview/staging only, never production).
 *   STORE_KV                     KV namespace binding (Cloudflare). Missing → in-memory (dev/test only).
 *
 * The buyer is identified by checkout custom data `player_id` (set by src/store/providers/lemonsqueezy.ts);
 * WHAT was bought comes only from the signed payload's variant id.
 *
 * Runtime: Web Request/Response only. Deploy where charging is allowed (Cloudflare Pages Functions:
 * functions/api/store-webhook.ts → `export { onRequestPost } from '../../api/store-webhook';`).
 * The default export also runs as a Vercel Edge Function, but Vercel Hobby forbids payment processing.
 */
import { kvFromEnv, type KV } from '../server/store/kv.js';
import { processLemonEvent, variantMap, type LemonPayload } from '../server/store/entitlements.js';
import { verifyLemonSqueezySignature } from '../server/store/verify.js';

export const config = { runtime: 'edge' };

export interface StoreWebhookEnv {
  LEMONSQUEEZY_WEBHOOK_SECRET?: string;
  LEMONSQUEEZY_VARIANTS?: string;
  LEMONSQUEEZY_ALLOW_TEST?: string;
  STORE_KV?: unknown;
  [k: string]: unknown;
}

/** Hard cap on webhook bodies (Lemon Squeezy payloads are a few KB). */
const MAX_BODY = 256 * 1024;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function handleStoreWebhook(req: Request, env: StoreWebhookEnv, deps: { kv?: KV; now?: () => number } = {}): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const secret = typeof env.LEMONSQUEEZY_WEBHOOK_SECRET === 'string' ? env.LEMONSQUEEZY_WEBHOOK_SECRET : '';
  if (!secret) return json(503, { error: 'not_configured' });
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > MAX_BODY) return json(413, { error: 'too_large' });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { error: 'too_large' });
  // Verify over the exact raw bytes BEFORE parsing anything.
  if (!(await verifyLemonSqueezySignature(raw, req.headers.get('x-signature'), secret))) return json(401, { error: 'signature' });
  let payload: LemonPayload;
  try {
    payload = JSON.parse(raw) as LemonPayload;
  } catch {
    return json(400, { error: 'json' });
  }
  const kv = deps.kv ?? kvFromEnv(env).kv;
  try {
    const out = await processLemonEvent(payload, {
      kv,
      variants: variantMap(typeof env.LEMONSQUEEZY_VARIANTS === 'string' ? env.LEMONSQUEEZY_VARIANTS : undefined),
      now: deps.now?.() ?? Date.now(),
      allowTest: env.LEMONSQUEEZY_ALLOW_TEST === '1',
    });
    if (out.status !== 200) console.warn('[store-webhook]', payload.meta?.event_name, out.detail);
    return json(out.status, out);
  } catch (err) {
    // Storage failure: 500 makes Lemon Squeezy retry.
    console.error('[store-webhook] failed', err);
    return json(500, { error: 'storage' });
  }
}

function processEnv(): StoreWebhookEnv {
  try {
    return ((globalThis as { process?: { env?: StoreWebhookEnv } }).process?.env ?? {}) as StoreWebhookEnv;
  } catch {
    return {};
  }
}

/** Vercel Edge Function entry. */
export default async function handler(req: Request): Promise<Response> {
  return handleStoreWebhook(req, processEnv());
}

/** Cloudflare Pages Functions entry (bindings arrive in context.env). */
export const onRequestPost = (context: { request: Request; env: StoreWebhookEnv }): Promise<Response> =>
  handleStoreWebhook(context.request, context.env);
