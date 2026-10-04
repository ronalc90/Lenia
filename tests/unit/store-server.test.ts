import { beforeAll, describe, expect, it } from 'vitest';
import { handleEntitlements } from '../../api/entitlements';
import { handleStoreWebhook } from '../../api/store-webhook';
import { generateKeyPair, importPrivateKey, playerKey, signBytes, utf8, type KeyPairJson } from '../../server/protocol';
import { RateLimiter } from '../../server/ratelimit';
import { activeSub, loadRecord, publicCosmetics, RENEWAL_GRACE_MS } from '../../server/store/entitlements';
import { MemoryKV } from '../../server/store/kv';
import { hmacSha256Hex, verifyLemonSqueezySignature } from '../../server/store/verify';
import { createSnapshotFetcher, signedEntitlementHeaders } from '../../src/store/api';
import { supporterPaletteFor } from '../../src/store/catalog';
import { Entitlements } from '../../src/store/entitlements';
import { ENTITLEMENTS_PATH, isServerSnapshot, type ServerSnapshot } from '../../src/store/protocol';
import type { PlayerIdentity } from '../../src/store/providers/types';

const SECRET = 'whsec_test_0123456789';
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 10, 12); // 2026-11-10
const PLAYER = '6f1c2a9e-1b2c-4d5e-8f90-0123456789ab';
const VARIANTS = JSON.stringify({ '1001': 'palette.aurora', '1002': 'bundle.founder', '2001': 'sub.mecenas.month', '2002': 'sub.mecenas.year' });
const env = { LEMONSQUEEZY_WEBHOOK_SECRET: SECRET, LEMONSQUEEZY_VARIANTS: VARIANTS };

async function post(kv: MemoryKV, body: unknown, opts: { secret?: string; sig?: string; env?: Record<string, unknown>; now?: number } = {}) {
  const raw = JSON.stringify(body);
  const sig = opts.sig ?? (await hmacSha256Hex(opts.secret ?? SECRET, raw));
  const req = new Request('https://bioluma.example/api/store-webhook', { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'x-signature': sig } });
  const res = await handleStoreWebhook(req, (opts.env ?? env) as never, { kv, now: () => opts.now ?? NOW });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const order = (id: number, variant: number, extra: Record<string, unknown> = {}, player: string | null = PLAYER) => ({
  meta: { event_name: 'order_created', custom_data: player ? { player_id: player } : {}, test_mode: false },
  data: { type: 'orders', id: String(id), attributes: { status: 'paid', first_order_item: { variant_id: variant }, ...extra } },
});

const subEvent = (event: string, attrs: Record<string, unknown>) => ({
  meta: { event_name: event, custom_data: { player_id: PLAYER } },
  data: {
    type: 'subscriptions',
    id: '777',
    attributes: {
      variant_id: 2001,
      status: 'active',
      created_at: new Date(NOW).toISOString(),
      updated_at: new Date(NOW).toISOString(),
      urls: { customer_portal: 'https://bioluma.lemonsqueezy.com/billing?x=1' },
      ...attrs,
    },
  },
});

async function record(kv: MemoryKV) {
  return loadRecord(kv, await playerKey(PLAYER));
}

describe('Lemon Squeezy signature', () => {
  it('accepts only the HMAC-SHA256 of the raw body with the secret', async () => {
    const body = '{"meta":{"event_name":"order_created"}}';
    const good = await hmacSha256Hex(SECRET, body);
    expect(good).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyLemonSqueezySignature(body, good, SECRET)).toBe(true);
    expect(await verifyLemonSqueezySignature(body, good.toUpperCase(), SECRET)).toBe(true);
    expect(await verifyLemonSqueezySignature(body + ' ', good, SECRET)).toBe(false);
    expect(await verifyLemonSqueezySignature(body, good, 'other-secret')).toBe(false);
    expect(await verifyLemonSqueezySignature(body, good, undefined)).toBe(false);
    expect(await verifyLemonSqueezySignature(body, null, SECRET)).toBe(false);
    expect(await verifyLemonSqueezySignature(body, 'zz' + good.slice(2), SECRET)).toBe(false);
  });

  it('refuses unsigned, mis-signed or unconfigured webhooks before parsing', async () => {
    const kv = new MemoryKV();
    expect((await post(kv, order(1, 1001), { sig: 'deadbeef' })).status).toBe(401);
    expect((await post(kv, order(1, 1001), { secret: 'wrong' })).status).toBe(401);
    expect((await post(kv, order(1, 1001), { env: { LEMONSQUEEZY_VARIANTS: VARIANTS } })).status).toBe(503);
    expect(kv.size).toBe(0);
    const get = await handleStoreWebhook(new Request('https://x/api/store-webhook'), env, { kv });
    expect(get.status).toBe(405);
  });
});

describe('webhook grants', () => {
  it('grants a paid order to the player in custom data, idempotently', async () => {
    const kv = new MemoryKV();
    const r = await post(kv, order(10, 1001));
    expect(r).toMatchObject({ status: 200, body: { action: 'granted', ids: ['palette.aurora'] } });
    expect((await post(kv, order(10, 1001))).body.action).toBe('noop'); // retry/replay
    const rec = await record(kv);
    expect(Object.keys(rec.items)).toEqual(['palette.aurora']);
    // Raw player ids are never stored.
    expect(JSON.stringify([...(kv as unknown as { map: Map<string, string> }).map])).not.toContain(PLAYER);
  });

  it('expands bundles and revokes exactly the refunded order', async () => {
    const kv = new MemoryKV();
    await post(kv, order(10, 1001));
    const b = await post(kv, order(11, 1002));
    expect(b.body.ids).toContain('badge.founder');
    const refund = await post(kv, { ...order(11, 1002), meta: { event_name: 'order_refunded', custom_data: { player_id: PLAYER } } });
    expect(refund.body.action).toBe('refunded');
    const rec = await record(kv);
    expect(Object.keys(rec.items)).toEqual(['palette.aurora']);
  });

  it('flags orders it cannot attribute (422) and ignores what it should', async () => {
    const kv = new MemoryKV();
    expect((await post(kv, order(12, 9999))).status).toBe(422); // unknown variant
    expect((await post(kv, order(13, 1001, {}, null))).status).toBe(422); // no player id
    expect((await post(kv, order(14, 1001, {}, 'not a player id!'))).status).toBe(422);
    expect((await post(kv, order(15, 1001, { status: 'pending' }))).body.action).toBe('ignored');
    expect((await post(kv, { meta: { event_name: 'affiliate_activated' }, data: {} })).body.action).toBe('ignored');
    const test = { ...order(16, 1001), meta: { ...order(16, 1001).meta, test_mode: true } };
    expect((await post(kv, test)).body.action).toBe('ignored');
    expect((await post(kv, test, { env: { ...env, LEMONSQUEEZY_ALLOW_TEST: '1' } })).body.action).toBe('granted');
  });
});

describe('subscriptions and expiry', () => {
  it('activates, claims the palette of the month, survives cancellation until ends_at, then expires', async () => {
    const kv = new MemoryKV();
    const renews = NOW + 30 * DAY;
    await post(kv, subEvent('subscription_created', { renews_at: new Date(renews).toISOString(), ends_at: null }));
    let rec = await record(kv);
    expect(activeSub(rec, NOW)?.plan).toBe('month');
    expect(rec.items[supporterPaletteFor(NOW).id]?.source).toBe('rotation');
    // Grace: a late renewal webhook does not blink benefits off.
    expect(activeSub(rec, renews + RENEWAL_GRACE_MS - 1)).not.toBeNull();
    expect(activeSub(rec, renews + RENEWAL_GRACE_MS + 1)).toBeNull();

    const later = new Date(NOW + DAY).toISOString();
    await post(kv, subEvent('subscription_cancelled', { status: 'cancelled', ends_at: new Date(renews).toISOString(), updated_at: later }));
    rec = await record(kv);
    expect(activeSub(rec, NOW + 2 * DAY)?.status).toBe('cancelled');
    expect(activeSub(rec, renews + 1)).toBeNull();

    // A stale (older) delivery cannot resurrect it.
    await post(kv, subEvent('subscription_updated', { status: 'active', renews_at: new Date(NOW + 400 * DAY).toISOString() }));
    rec = await record(kv);
    expect(rec.subs['ls:777'].status).toBe('cancelled');

    await post(kv, subEvent('subscription_expired', { status: 'expired', ends_at: new Date(renews).toISOString(), updated_at: new Date(renews).toISOString() }));
    rec = await record(kv);
    expect(activeSub(rec, NOW + 2 * DAY)).toBeNull();
    // The claimed palette stays.
    expect(rec.items[supporterPaletteFor(NOW).id]).toBeDefined();
  });

  it('only shows paid profile cosmetics in the ranking when the record owns them', async () => {
    const kv = new MemoryKV();
    let rec = await record(kv);
    const want = { badge: 'badge.mecenas', frame: 'frame.gilded', nameColor: 'name.mecenas.gold' } as const;
    expect(publicCosmetics(rec, want, NOW)).toEqual({ badge: 'badge.none', frame: 'frame.none', nameColor: 'name.default' });
    await post(kv, order(20, 1002)); // founder pack: gilded frame
    await post(kv, subEvent('subscription_created', { renews_at: new Date(NOW + 30 * DAY).toISOString() }));
    rec = await record(kv);
    expect(publicCosmetics(rec, want, NOW)).toEqual(want);
    expect(publicCosmetics(rec, want, NOW + 60 * DAY)).toEqual({ badge: 'badge.none', frame: 'frame.gilded', nameColor: 'name.default' });
  });
});

describe('GET /api/entitlements (signed)', () => {
  let keys: KeyPairJson;
  let other: KeyPairJson;
  let id: PlayerIdentity;

  beforeAll(async () => {
    keys = await generateKeyPair();
    other = await generateKeyPair();
    const priv = await importPrivateKey(keys.priv);
    id = { playerId: async () => PLAYER, publicKey: async () => keys.pub, sign: async (m) => signBytes(priv, utf8(m)) };
  });

  const call = async (kv: MemoryKV, headers: Record<string, string>, extra: { registeredKey?: (k: string) => Promise<string | null>; env?: Record<string, unknown>; origin?: string; method?: string; now?: number } = {}) => {
    const h = new Headers(headers);
    if (extra.origin) h.set('origin', extra.origin);
    const req = new Request(`https://bioluma.example${ENTITLEMENTS_PATH}`, { method: extra.method ?? 'GET', headers: h });
    return handleEntitlements(req, (extra.env ?? {}) as never, { kv, now: () => extra.now ?? NOW, registeredKey: extra.registeredKey, limiter: new RateLimiter(1000, 1000) });
  };

  it('returns the snapshot to the key holder and pins the key on first use', async () => {
    const kv = new MemoryKV();
    await post(kv, order(30, 1001));
    const res = await call(kv, await signedEntitlementHeaders(id, 'GET', ENTITLEMENTS_PATH, NOW));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull(); // same-origin: no CORS
    const snap = (await res.json()) as ServerSnapshot;
    expect(isServerSnapshot(snap)).toBe(true);
    expect(snap.playerId).toBe(PLAYER);
    expect(snap.items.map((i) => i.id)).toEqual(['palette.aurora']);
    expect((await record(kv)).pub).toBe(keys.pub);

    // Someone else's key for the same player id is refused after the pin.
    const priv2 = await importPrivateKey(other.priv);
    const impostor: PlayerIdentity = { playerId: async () => PLAYER, publicKey: async () => other.pub, sign: async (m) => signBytes(priv2, utf8(m)) };
    expect((await call(kv, await signedEntitlementHeaders(impostor, 'GET', ENTITLEMENTS_PATH, NOW))).status).toBe(403);
  });

  it('requires the ranking-registered key when there is one', async () => {
    const kv = new MemoryKV();
    const registeredKey = async () => other.pub;
    const res = await call(kv, await signedEntitlementHeaders(id, 'GET', ENTITLEMENTS_PATH, NOW), { registeredKey });
    expect(res.status).toBe(403);
    const ok = await call(kv, await signedEntitlementHeaders(id, 'GET', ENTITLEMENTS_PATH, NOW), { registeredKey: async () => keys.pub });
    expect(ok.status).toBe(200);
  });

  it('rejects bad signatures, stale clocks, wrong paths and foreign origins', async () => {
    const kv = new MemoryKV();
    const h = await signedEntitlementHeaders(id, 'GET', ENTITLEMENTS_PATH, NOW);
    expect((await call(kv, { ...h, 'x-bioluma-sig': h['x-bioluma-sig'].replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) })).status).toBe(401);
    expect((await call(kv, h, { now: NOW + 10 * 60_000 })).status).toBe(401);
    expect((await call(kv, await signedEntitlementHeaders(id, 'GET', '/api/other', NOW))).status).toBe(401);
    expect((await call(kv, { ...h, 'x-bioluma-player': 'x' })).status).toBe(400);
    expect((await call(kv, h, { origin: 'https://evil.example' })).status).toBe(403);
    const cors = await call(kv, h, { origin: 'https://localhost', env: { STORE_ALLOWED_ORIGINS: 'https://localhost' } });
    expect(cors.status).toBe(200);
    expect(cors.headers.get('access-control-allow-origin')).toBe('https://localhost');
    expect((await call(kv, {}, { method: 'POST' })).status).toBe(405);
  });

  it('claims the palette of the month for yearly subscribers on read', async () => {
    const kv = new MemoryKV();
    await post(kv, subEvent('subscription_created', { variant_id: 2002, renews_at: new Date(NOW + 365 * DAY).toISOString() }));
    const dec = NOW + 30 * DAY;
    const res = await call(kv, await signedEntitlementHeaders(id, 'GET', ENTITLEMENTS_PATH, dec), { now: dec });
    const snap = (await res.json()) as ServerSnapshot;
    expect(snap.subscription).toMatchObject({ plan: 'year', willRenew: true });
    expect(snap.items.map((i) => i.id)).toEqual(expect.arrayContaining([supporterPaletteFor(NOW).id, supporterPaletteFor(dec).id]));
  });

  it('round-trips through the client fetcher into Entitlements', async () => {
    const kv = new MemoryKV();
    await post(kv, order(40, 1002));
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) =>
      handleEntitlements(new Request(new URL(String(input), 'https://bioluma.example'), init), {} as never, {
        kv,
        now: () => NOW,
        limiter: new RateLimiter(1000, 1000),
      })) as typeof fetch;
    const fetchSnapshot = createSnapshotFetcher(id, { fetchImpl, now: () => NOW });
    const ent = new Entitlements({ storage: null, now: () => NOW });
    const snap = await fetchSnapshot();
    expect(snap).not.toBeNull();
    expect(ent.applyServerSnapshot(snap)).toBe(true);
    expect(ent.isOwned('bundle.founder')).toBe(true);
    expect(ent.equip('badge.founder')).toBe(true);
  });
});
