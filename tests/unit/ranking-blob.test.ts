import { describe, expect, it } from 'vitest';
import { BlobClient, BlobError, BlobStore, blobAuthFromEnv, mergePlayer } from '../../server/blob';
import { finalizeSubmission, generateKeyPair, importPrivateKey, randomHex, type Submission } from '../../server/protocol';
import { RateLimiter } from '../../server/ratelimit';
import { createLeaderboardService, type EntryView } from '../../server/service';
import type { PlayerRecord } from '../../server/store';

const STORE = 'abc123store';
const TOKEN = `vercel_blob_rw_${STORE}_s3cr3t`;
const T0 = Date.UTC(2026, 9, 10, 12);
const MIN = 60_000;

/**
 * In-memory stand-in for Vercel Blob, speaking the same HTTP protocol the adapter uses (see the header
 * of server/blob.ts): PUT on the API host, GET on the private store host, ETags, x-if-match → 412,
 * x-allow-overwrite: 0 on an existing blob → 400, and a CDN layer that serves reads up to 60 s stale
 * unless ?cache=0.
 */
class FakeBlob {
  objects = new Map<string, { body: string; etag: string }>();
  cdn = new Map<string, { body: string; etag: string; at: number }>();
  puts = 0;
  freshGets = 0;
  version = 0;
  /** Runs once right after the next fresh GET (simulates another instance writing in between). */
  afterFreshGet: (() => void) | null = null;
  constructor(readonly now: () => number) {}

  write(pathname: string, body: string): string {
    const etag = `"v${++this.version}"`;
    this.objects.set(pathname, { body, etag });
    return etag;
  }

  fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const u = new URL(url);
    const h = new Headers(init.headers);
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
    if (h.get('authorization') !== `Bearer ${TOKEN}`) return json(403, { error: { code: 'forbidden' } });
    if ((init.method ?? 'GET') === 'PUT') {
      expect(u.origin + u.pathname).toBe('https://vercel.com/api/blob/');
      expect(h.get('x-api-version')).toBe('12');
      expect(h.get('x-vercel-blob-store-id')).toBe(STORE);
      expect(h.get('x-vercel-blob-access')).toBe('private');
      expect(h.get('x-add-random-suffix')).toBe('0');
      expect(h.get('x-content-type')).toBe('application/json');
      expect(Number(h.get('x-cache-control-max-age'))).toBeGreaterThanOrEqual(60);
      this.puts++;
      const pathname = u.searchParams.get('pathname')!;
      const cur = this.objects.get(pathname);
      if (h.get('x-allow-overwrite') === '0' && cur) return json(400, { error: { code: 'bad_request', message: 'This blob already exists' } });
      const ifMatch = h.get('x-if-match');
      if (ifMatch && cur?.etag !== ifMatch) return json(412, { error: { code: 'precondition_failed' } });
      const etag = this.write(pathname, String(init.body));
      return json(200, { url: `https://${STORE}.private.blob.vercel-storage.com/${pathname}`, pathname, etag });
    }
    expect(u.host).toBe(`${STORE}.private.blob.vercel-storage.com`);
    const pathname = decodeURIComponent(u.pathname.slice(1));
    const fresh = u.searchParams.get('cache') === '0';
    let obj: { body: string; etag: string } | undefined;
    if (fresh) {
      this.freshGets++;
      obj = this.objects.get(pathname);
      const hook = this.afterFreshGet;
      this.afterFreshGet = null;
      hook?.();
    } else {
      const c = this.cdn.get(pathname);
      if (c && this.now() - c.at < 60_000) obj = c;
      else {
        obj = this.objects.get(pathname);
        if (obj) this.cdn.set(pathname, { ...obj, at: this.now() });
      }
    }
    if (!obj) return new Response('not found', { status: 404 });
    return new Response(obj.body, { status: 200, headers: { etag: obj.etag } });
  };

  doc<T>(pathname: string): T {
    return JSON.parse(this.objects.get(pathname)!.body) as T;
  }
}

function rec(key: string, over: Partial<PlayerRecord> = {}): PlayerRecord {
  return {
    key,
    pub: `pub-${key}`,
    name: `P${key}`,
    tag: '0001',
    registeredAt: T0,
    last: { lifetimeEssence: 100, eraEssence: 100, genome: 0, speciesCount: 1, behaviorsCount: 1, era: 1, playTimeSec: 60, seeds: 3, createdAt: T0 - MIN, epsPeak: 5, at: T0, clientTime: T0 },
    best: { essence: 100, species: 1, era: 1 },
    flagged: false,
    flags: [],
    accepted: 1,
    updatedAt: T0,
    ...over,
  };
}

const PLAYERS = 'bioluma-leaderboard/v1/players.json';
const BOARDS = 'bioluma-leaderboard/v1/boards.json';

describe('BlobClient (REST adapter)', () => {
  it('writes and reads JSON with the SDK protocol, private store host and auth', async () => {
    const fake = new FakeBlob(() => T0);
    const c = new BlobClient({ auth: () => ({ token: TOKEN, storeId: STORE }), fetch: fake.fetch });
    expect(await c.getJson('a/b c.json')).toBeNull();
    const put = await c.putJson('a/b c.json', { x: 1 });
    expect(put).toEqual({ ok: true, etag: '"v1"' });
    expect(fake.objects.has('a/b c.json')).toBe(true);
    expect(c.blobUrl('a/b c.json', true)).toBe(`https://${STORE}.private.blob.vercel-storage.com/a/b%20c.json?cache=0`);
    expect(await c.getJson('a/b c.json', { fresh: true })).toEqual({ data: { x: 1 }, etag: '"v1"' });
  });

  it('turns ETag mismatches and create-on-existing into conflicts', async () => {
    const fake = new FakeBlob(() => T0);
    const c = new BlobClient({ auth: () => ({ token: TOKEN, storeId: STORE }), fetch: fake.fetch });
    await c.putJson('k.json', { v: 1 }, { create: true });
    expect(await c.putJson('k.json', { v: 2 }, { create: true })).toEqual({ ok: false, conflict: true });
    expect(await c.putJson('k.json', { v: 2 }, { ifMatch: '"stale"' })).toEqual({ ok: false, conflict: true });
    expect((await c.putJson('k.json', { v: 3 }, { ifMatch: '"v1"' })).ok).toBe(true);
  });

  it('throws on auth / server errors and when no credentials exist', async () => {
    const fake = new FakeBlob(() => T0);
    const bad = new BlobClient({ auth: () => ({ token: 'nope', storeId: STORE }), fetch: fake.fetch });
    await expect(bad.putJson('x.json', {})).rejects.toBeInstanceOf(BlobError);
    await expect(bad.getJson('x.json')).rejects.toBeInstanceOf(BlobError);
    const none = new BlobClient({ auth: () => null, fetch: fake.fetch });
    await expect(none.getJson('x.json')).rejects.toThrow(/no credentials/);
  });
});

describe('BlobStore (write-behind)', () => {
  function setup(nowRef: { t: number }, fake = new FakeBlob(() => nowRef.t), extra: { maxPlayers?: number } = {}) {
    const client = new BlobClient({ auth: () => ({ token: TOKEN, storeId: STORE }), fetch: fake.fetch });
    const store = new BlobStore({ client, now: () => nowRef.t, flushIntervalMs: 60 * MIN, onError: (e) => { throw e; }, ...extra });
    return { fake, store };
  }

  it('flushes at once when nothing is stored, then at most once per interval (2 puts per flush)', async () => {
    const now = { t: T0 };
    const { fake, store } = setup(now);
    await store.putPlayer(rec('a'));
    await store.flush();
    expect(fake.puts).toBe(2);
    expect(Object.keys(fake.doc<{ players: object }>(PLAYERS).players)).toEqual(['a']);
    now.t += 5 * MIN;
    await store.putPlayer(rec('b', { best: { essence: 500, species: 2, era: 1 } }));
    await store.flush();
    expect(fake.puts).toBe(2); // buffered
    expect((await store.getBoard('essence')).map((e) => e.key)).toEqual(['b', 'a']); // local overlay
    expect(await store.getPlayer('b')).toMatchObject({ key: 'b' });
    now.t += 56 * MIN;
    await store.flush();
    expect(fake.puts).toBe(4);
    expect(store.pending).toBe(0);
    expect(fake.doc<{ boards: { essence: { key: string }[] } }>(BOARDS).boards.essence.map((e) => e.key)).toEqual(['b', 'a']);
  });

  it('a second instance respects the global interval and merges instead of overwriting', async () => {
    const now = { t: T0 };
    const fake = new FakeBlob(() => now.t);
    const a = setup(now, fake).store;
    const b = setup(now, fake).store;
    await a.putPlayer(rec('a'));
    await a.flush();
    now.t += 10 * MIN;
    await b.putPlayer(rec('b'));
    await b.flush();
    expect(fake.puts).toBe(2); // B saw A's recent flush and keeps buffering
    now.t += 51 * MIN;
    await a.putPlayer(rec('a', { best: { essence: 900, species: 3, era: 1 }, updatedAt: now.t }));
    await a.flush();
    await b.flush(true); // B flushes right after: re-reads with ?cache=0 and merges
    const players = fake.doc<{ players: Record<string, PlayerRecord> }>(PLAYERS).players;
    expect(Object.keys(players).sort()).toEqual(['a', 'b']);
    expect(players.a.best.essence).toBe(900);
    const boards = fake.doc<{ boards: { essence: { key: string }[] } }>(BOARDS).boards;
    expect(boards.essence.map((e) => e.key)).toEqual(['a', 'b']);
  });

  it('retries on an ETag conflict and keeps the other writer\'s data', async () => {
    const now = { t: T0 };
    const fake = new FakeBlob(() => now.t);
    const { store } = setup(now, fake);
    await store.putPlayer(rec('seed'));
    await store.flush();
    now.t += 61 * MIN;
    await store.putPlayer(rec('mine'));
    // Another instance writes between our consistent read and our conditional write.
    fake.afterFreshGet = () => {
      const doc = fake.doc<{ players: Record<string, PlayerRecord> }>(PLAYERS);
      doc.players.theirs = rec('theirs');
      fake.write(PLAYERS, JSON.stringify(doc));
    };
    await store.flush();
    expect(fake.freshGets).toBe(3); // first flush + conflicting attempt + retry
    expect(Object.keys(fake.doc<{ players: object }>(PLAYERS).players).sort()).toEqual(['mine', 'seed', 'theirs']);
  });

  it('keeps players on a board when the document has to be trimmed', async () => {
    const now = { t: T0 };
    const { fake, store } = setup(now, undefined, { maxPlayers: 4 });
    for (let i = 0; i < 5; i++) await store.putPlayer(rec(`f${i}`, { flagged: true, last: { ...rec('x').last, at: T0 + i } }));
    await store.putPlayer(rec('good1'));
    await store.putPlayer(rec('good2'));
    await store.flush(true);
    const keys = Object.keys(fake.doc<{ players: object }>(PLAYERS).players).sort();
    expect(keys).toHaveLength(4);
    expect(keys).toContain('good1');
    expect(keys).toContain('good2');
    expect(keys).toContain('f4'); // most recently active flagged ones survive
  });

  it('merging two versions of a player: first registered key wins, flags stick, best is maxed', () => {
    const first = rec('k', { registeredAt: T0, pub: 'A' });
    const later = rec('k', { registeredAt: T0 + 5, pub: 'B', updatedAt: T0 + 99 });
    expect(mergePlayer(first, later).pub).toBe('A');
    expect(mergePlayer(later, first).pub).toBe('A');
    const old = rec('k', { flagged: true, flags: ['integrity_tamper'], best: { essence: 1000, species: 9, era: 2 } });
    const fresh = rec('k', { updatedAt: T0 + 50, best: { essence: 500, species: 10, era: 2 }, name: 'New' });
    const m = mergePlayer(old, fresh);
    expect(m).toMatchObject({ name: 'New', flagged: true, flags: ['integrity_tamper'], best: { essence: 1000, species: 10, era: 2 } });
  });
});

describe('ranking service on Blob: two serverless instances, quota-friendly', () => {
  it('serves consistent boards across instances and stays within a few puts per hour', async () => {
    const now = { t: T0 };
    const fake = new FakeBlob(() => now.t);
    const mk = () => {
      const client = new BlobClient({ auth: () => ({ token: TOKEN, storeId: STORE }), fetch: fake.fetch });
      const store = new BlobStore({ client, now: () => now.t, onError: (e) => { throw e; } });
      return createLeaderboardService({ store, now: () => now.t, powBits: 4, submitLimiter: new RateLimiter(1000, 1000), log: () => undefined });
    };
    const instances = [mk(), mk()];
    const players = await Promise.all(
      Array.from({ length: 8 }, async (_, i) => {
        const kp = await generateKeyPair();
        return { id: crypto.randomUUID(), pub: kp.pub, priv: await importPrivateKey(kp.priv), name: `Bot ${i}` };
      }),
    );
    const sign = (p: (typeof players)[number], minutes: number): Promise<Submission> =>
      finalizeSubmission(
        {
          version: 1,
          playerId: p.id,
          publicKey: p.pub,
          name: p.name,
          lifetimeEssence: minutes * 300,
          eraEssence: minutes * 300,
          genome: 0,
          speciesCount: 2,
          behaviorsCount: 1,
          era: 1,
          playTimeSec: minutes * 60,
          seeds: 10 + Math.round(minutes),
          epsPeak: 40,
          createdAt: T0 - 3600_000,
          clientTime: now.t,
          nonce: randomHex(16),
          integrity: { speedHack: false, clockRollback: false, tampered: false },
        },
        p.priv,
        4,
      );
    const req = (body: Submission) =>
      new Request('https://bioluma.test/api/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

    // Six hours: every player submits every 5 minutes through a random-ish instance.
    let accepted = 0;
    for (let step = 0; step < 72; step++) {
      for (let i = 0; i < players.length; i++) {
        const res = await instances[(step + i) % 2].submit(req(await sign(players[i], 30 + step * 5 + i)));
        expect(res.status, await res.clone().text()).toBe(200);
        accepted++;
      }
      now.t += 5 * MIN;
    }
    expect(accepted).toBe(576);
    // One flush per hour across both instances, 2 puts each (+ the very first one).
    expect(fake.puts).toBeLessThanOrEqual(2 * (6 + 2));
    // Buffered records reach the store within one flush slot per instance (each instance defers while
    // another one has just written), so after two slots every instance shows the same, complete board.
    for (let slot = 0; slot < 2; slot++) {
      now.t += 61 * MIN;
      for (const inst of instances) await inst.leaderboard(new Request('https://bioluma.test/api/leaderboard?board=essence'));
    }
    expect(fake.puts).toBeLessThanOrEqual(2 * (6 + 4));
    now.t += 2 * MIN; // let CDN copies and board caches expire
    for (const inst of instances) {
      const body = (await (await inst.leaderboard(new Request('https://bioluma.test/api/leaderboard?board=essence'))).json()) as { entries: EntryView[] };
      expect(body.entries).toHaveLength(8);
      expect(body.entries[0].name.startsWith('Bot 7#')).toBe(true);
    }
  });
});

describe('blobAuthFromEnv', () => {
  it('takes the store id from the read-write token', () => {
    expect(blobAuthFromEnv({ BLOB_READ_WRITE_TOKEN: TOKEN })).toEqual({ token: TOKEN, storeId: STORE });
  });
  it('prefers an explicit BLOB_STORE_ID (with or without store_ prefix)', () => {
    expect(blobAuthFromEnv({ BLOB_READ_WRITE_TOKEN: TOKEN, BLOB_STORE_ID: 'store_zzz' })).toEqual({ token: TOKEN, storeId: 'zzz' });
  });
  it('falls back to OIDC (request header or env) + BLOB_STORE_ID', () => {
    expect(blobAuthFromEnv({ BLOB_STORE_ID: 'store_s1' }, 'oidc-jwt')).toEqual({ token: 'oidc-jwt', storeId: 's1' });
    expect(blobAuthFromEnv({ BLOB_STORE_ID: 's1', VERCEL_OIDC_TOKEN: 'env-jwt' })).toEqual({ token: 'env-jwt', storeId: 's1' });
    expect(blobAuthFromEnv({ VERCEL_OIDC_TOKEN: 'env-jwt' })).toBeNull();
  });
  it('returns null when nothing is configured', () => {
    expect(blobAuthFromEnv({})).toBeNull();
    expect(blobAuthFromEnv({ BLOB_READ_WRITE_TOKEN: '' })).toBeNull();
  });
});
