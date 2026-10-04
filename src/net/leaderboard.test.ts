import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGame, type Game } from '../game/game';
import type { StorageLike } from '../game/save';
import { creature, recordingBus, report, seededRng } from '../game/testUtil';
import { SIGN_PREFIX, utf8, verifyBytes } from '../../server/protocol';
import { RateLimiter } from '../../server/ratelimit';
import { createLeaderboardService } from '../../server/service';
import { MemoryStore } from '../../server/store';
import { createLeaderboardClient, LEADERBOARD_ERRORS, type LeaderboardClientOptions } from './leaderboard';

const T0 = Date.UTC(2026, 9, 10, 12);
const BITS = 4;
/** Captured before any test fakes timers: lets async crypto finish while setTimeout is faked. */
const realSetTimeout = globalThis.setTimeout;
const realTick = () => new Promise<void>((r) => realSetTimeout(r, 1));

function memStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

/** A real game, a real service (memory store) and a fetch that routes to it, on one controllable clock. */
function harness(opts: { clientSkewMs?: number; integrity?: LeaderboardClientOptions['integrity']; storage?: StorageLike } = {}) {
  const clock = { t: T0 };
  const rec = recordingBus();
  const game = createGame({ bus: rec.bus, rng: seededRng(3), now: () => clock.t });
  const store = new MemoryStore();
  const svc = createLeaderboardService({ store, now: () => clock.t, powBits: BITS, submitLimiter: new RateLimiter(1000, 1000), log: () => undefined });
  const calls: string[] = [];
  /** Status of every submit the service answered. */
  const answered: number[] = [];
  let online = true;
  let apiDeployed = true;
  const fetchFn = async (url: string, init?: RequestInit): Promise<Response> => {
    if (!online) throw new TypeError('Failed to fetch');
    calls.push(url);
    if (!apiDeployed) return new Response('<html>404</html>', { status: 404 });
    const req = new Request(`https://bioluma.test${url}`, init);
    if (!url.startsWith('/api/submit')) return svc.leaderboard(req);
    const res = await svc.submit(req);
    answered.push(res.status);
    return res;
  };
  const storage = opts.storage ?? memStorage();
  const client = createLeaderboardClient({
    game,
    storage,
    fetch: fetchFn,
    bus: rec.bus,
    now: () => clock.t + (opts.clientSkewMs ?? 0),
    powBits: BITS,
    integrity: opts.integrity,
  });
  /** Play for `sec` seconds: the game and every clock move together. */
  const play = (sec: number, n = 2) => {
    const rep = report(Array.from({ length: n }, (_, i) => creature({ id: i + 1, x: 30 + i * 60 })));
    for (let i = 0; i < sec * 4; i++) {
      clock.t += 250;
      game.tick(0.25, rep);
    }
  };
  return {
    clock,
    game,
    store,
    client,
    calls,
    answered,
    storage,
    bus: rec.bus,
    play,
    setOnline: (v: boolean) => (online = v),
    setApiDeployed: (v: boolean) => (apiDeployed = v),
  };
}

const submits = (calls: string[]) => calls.filter((c) => c.startsWith('/api/submit')).length;

describe('leaderboard client', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('validates names locally (in the player language), then registers the player', async () => {
    const h = harness();
    h.play(120);
    expect(h.client.getName()).toBeNull();
    expect(await h.client.setName('ab')).toEqual({ ok: false, error: LEADERBOARD_ERRORS.name_length.es });
    expect(await h.client.setName('mierda')).toEqual({ ok: false, error: LEADERBOARD_ERRORS.name_profanity.es });
    expect(submits(h.calls)).toBe(0);
    expect(await h.client.setName('  Ana  ')).toEqual({ ok: true });
    expect(h.client.getName()).toBe('Ana');
    expect(h.store.size).toBe(1);
    const top = await h.client.fetchTop('essence');
    if ('error' in top) throw new Error(top.error);
    expect(top.entries).toHaveLength(1);
    expect(top.entries[0]).toMatchObject({ rank: 1, isMe: true });
    expect(top.entries[0].name).toMatch(/^Ana#\d{4}$/);
    expect(top.me).toMatchObject({ rank: 1, isMe: true });
  });

  it('speaks English when the game does', async () => {
    const h = harness();
    h.game.actions.setSetting('lang', 'en');
    expect(await h.client.setName('x')).toEqual({ ok: false, error: LEADERBOARD_ERRORS.name_length.en });
  });

  it('is opt-in: nothing is submitted before a name exists', async () => {
    const h = harness();
    expect(await h.client.submitNow()).toEqual({ ok: false, error: LEADERBOARD_ERRORS.no_name.es });
    expect(h.calls).toEqual([]);
    // Without a registration the player id is not even sent when reading.
    await h.client.fetchTop('species');
    expect(h.calls[0]).toBe('/api/leaderboard?board=species');
  });

  it('keeps its identity (id + key) across reloads', async () => {
    const storage = memStorage();
    const h = harness({ storage });
    h.play(60);
    await h.client.setName('Ana');
    const again = createLeaderboardClient({ game: h.game, storage, fetch: async () => new Response('{}'), powBits: BITS });
    expect(again.playerId).toBe(h.client.playerId);
    expect(again.getName()).toBe('Ana');
    expect(JSON.parse(storage.map.get('bioluma.lb.key')!)).toHaveProperty('pub');
    // The same key signs later submissions: no key mismatch.
    h.play(70);
    expect(await h.client.submitNow()).toEqual({ ok: true });
  });

  it('works offline and never throws', async () => {
    const h = harness();
    h.setOnline(false);
    expect(await h.client.fetchTop('essence')).toEqual({ error: 'offline' });
    expect(await h.client.setName('Ana')).toEqual({ ok: true }); // saved, sent later
    h.clock.t += 61_000;
    expect(await h.client.submitNow()).toEqual({ ok: false, error: LEADERBOARD_ERRORS.offline.es });
    h.setOnline(true);
    h.setApiDeployed(false); // e.g. the single-file build or a static host without /api
    const r = await h.client.fetchTop('era');
    expect('error' in r && /offline/.test(r.error)).toBe(true);
    h.clock.t += 61_000;
    expect((await h.client.submitNow()).ok).toBe(false);
  });

  it('learns the server clock and retries once when the device clock is off', async () => {
    const h = harness({ clientSkewMs: -45 * 60_000 });
    h.play(60);
    expect(await h.client.setName('Ana')).toEqual({ ok: true });
    expect(h.store.size).toBe(1);
    expect(submits(h.calls)).toBe(2); // refused once ("clock"), then accepted
  });

  it('also recovers when the device clock runs ahead', async () => {
    const h = harness({ clientSkewMs: 3 * 3600_000 });
    h.play(60);
    expect(await h.client.setName('Ana')).toEqual({ ok: true });
    expect(h.store.size).toBe(1);
    // …and keeps working on the next submission (clientTime only advances on acceptance).
    h.play(70);
    expect(await h.client.submitNow()).toEqual({ ok: true });
  });

  it('sends integrity flags; the server shows the player greyed', async () => {
    const h = harness({ integrity: { report: () => ({ speedHack: false, clockRollback: false, tampered: true }) } });
    h.play(60);
    await h.client.setName('Ana');
    const top = await h.client.fetchTop('essence');
    if ('error' in top) throw new Error(top.error);
    expect(top.entries).toEqual([]);
    expect(top.me).toMatchObject({ isMe: true, flagged: true });
  });

  it('reports the server refusing a score in the player language', async () => {
    const h = harness();
    h.play(30);
    await h.client.setName('Ana');
    (h.game.state.stats as { totalEssence: number }).totalEssence = 1e40; // console cheat
    h.clock.t += 61_000;
    expect(await h.client.submitNow()).toEqual({ ok: false, error: LEADERBOARD_ERRORS.implausible.es });
  });

  it('auto-submits after 30 s, then every ~5 min while there is progress, and after an extinction', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const h = harness();
    const until = async (cond: () => boolean) => {
      for (let i = 0; i < 2000 && !cond(); i++) await realTick();
      expect(cond(), `calls: ${JSON.stringify(h.calls)} answered: ${JSON.stringify(h.answered)}`).toBe(true);
    };
    const advance = async (ms: number) => {
      h.clock.t += ms;
      await vi.advanceTimersByTimeAsync(ms);
    };
    h.play(60);
    h.storage.setItem('bioluma.lb.name', 'Ana');
    h.client.startAutoSubmit();
    await advance(29_000);
    expect(submits(h.calls)).toBe(0);
    await advance(2_000);
    await until(() => h.answered.length === 1);
    // No progress → the periodic tick skips.
    await advance(6 * 60_000);
    expect(submits(h.calls)).toBe(1);
    // Progress → submitted on the next period.
    h.play(30);
    await advance(6 * 60_000);
    await until(() => h.answered.length === 2);
    // Extinction → a submission shortly after (respecting the 60 s rule).
    h.play(30);
    h.bus.emit('extinctionDone', { era: 2, genome: 5 });
    await advance(70_000);
    await until(() => h.answered.length === 3);
    expect(h.answered).toEqual([200, 200, 200]);
    h.client.stop();
    h.play(30);
    await advance(20 * 60_000);
    expect(submits(h.calls)).toBe(3);
  });

  it('shows my own row from the last accepted submission while the server boards catch up', async () => {
    const h = harness();
    h.play(60);
    await h.client.setName('Ana');
    // Another (fresh) API instance whose stored boards do not include us yet.
    const empty = createLeaderboardService({ store: new MemoryStore(), now: () => h.clock.t, log: () => undefined });
    const lagging = createLeaderboardClient({
      game: h.game,
      storage: h.storage,
      powBits: BITS,
      now: () => h.clock.t,
      fetch: async (url, init) => empty.leaderboard(new Request(`https://bioluma.test${url}`, init)),
    });
    const top = await lagging.fetchTop('species');
    if ('error' in top) throw new Error(top.error);
    expect(top.entries).toEqual([]);
    expect(top.me).toMatchObject({ rank: 1, isMe: true, score: h.game.state.species.length, era: 1 });
    expect(top.me?.name).toMatch(/^Ana#\d{4}$/);
  });

  it('lends its identity to other signed APIs, but never signs ranking-shaped messages', async () => {
    const h = harness();
    const id = h.client.identity;
    expect(await id.playerId()).toBe(h.client.playerId);
    const pub = await id.publicKey();
    const sig = await id.sign('GET /api/entitlements 123');
    expect(await verifyBytes(pub, sig, utf8('GET /api/entitlements 123'))).toBe(true);
    await expect(id.sign(`${SIGN_PREFIX}{"forged":true}`)).rejects.toThrow();
  });

  it('a broken game state resolves to an error instead of throwing', async () => {
    const storage = memStorage();
    storage.setItem('bioluma.lb.name', 'Ana');
    const broken = {
      get state(): never {
        throw new Error('boom');
      },
    } as unknown as Game;
    const c = createLeaderboardClient({ game: broken, storage, fetch: async () => new Response('{}'), powBits: BITS });
    const r = await c.submitNow();
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
  });
});
