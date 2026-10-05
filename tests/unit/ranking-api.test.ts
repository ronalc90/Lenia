import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  finalizeSubmission,
  generateKeyPair,
  importPrivateKey,
  powChallenge,
  powValid,
  randomHex,
  solvePow,
  type Submission,
  type SubmissionPayload,
} from '../../server/protocol';
import { RateLimiter } from '../../server/ratelimit';
import { createLeaderboardService, type EntryView, type LeaderboardService } from '../../server/service';
import { MemoryStore, type LeaderboardStore } from '../../server/store';

const BITS = 4;
const ORIGIN = 'https://bioluma.test';
const T0 = Date.UTC(2026, 9, 10, 12);

interface Player {
  id: string;
  pub: string;
  priv: CryptoKey;
}

async function newPlayer(id: string = crypto.randomUUID()): Promise<Player> {
  const kp = await generateKeyPair();
  return { id, pub: kp.pub, priv: await importPrivateKey(kp.priv) };
}

/** Plausible stats after `minutes` of play (≈ 5 essence/s). */
function stats(minutes: number, over: Partial<SubmissionPayload> = {}) {
  const e = minutes * 60 * 5;
  return {
    lifetimeEssence: e,
    eraEssence: e,
    genome: 0,
    speciesCount: Math.min(6, Math.floor(minutes / 10)),
    behaviorsCount: Math.min(3, Math.floor(minutes / 20)),
    era: 1,
    playTimeSec: minutes * 60,
    seeds: Math.round(minutes * 3),
    epsPeak: 40,
    createdAt: T0 - 24 * 3600 * 1000,
    ...over,
  };
}

let clock = T0;

async function signed(p: Player, over: Partial<SubmissionPayload> = {}, bits = BITS): Promise<Submission> {
  const { powSolution: _ignored, ...rest } = { powSolution: 0, ...over };
  return finalizeSubmission(
    {
      version: 1,
      playerId: p.id,
      publicKey: p.pub,
      name: 'Ana',
      ...stats(60),
      clientTime: clock,
      nonce: randomHex(16),
      integrity: { speedHack: false, clockRollback: false, tampered: false },
      ...rest,
    },
    p.priv,
    bits,
  );
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-real-ip': '10.0.0.1', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function get(query: string, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/api/leaderboard?${query}`, { headers: { 'x-real-ip': '10.0.0.2', ...headers } });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe('ranking API (memory store)', () => {
  let store: MemoryStore;
  let svc: LeaderboardService;

  beforeEach(() => {
    clock = T0;
    store = new MemoryStore();
    svc = createLeaderboardService({ store, now: () => clock, powBits: BITS, log: () => undefined });
  });

  async function submit(sub: Submission | unknown, headers?: Record<string, string>) {
    const res = await svc.submit(post(sub, headers));
    return { status: res.status, body: await json(res), headers: res.headers };
  }
  async function board(query: string) {
    const res = await svc.leaderboard(get(query));
    return { status: res.status, body: await json(res) };
  }

  it('registers a player on the first submission and shows them on every board', async () => {
    const p = await newPlayer();
    const r = await submit(await signed(p));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, status: 'accepted', flagged: false, ranks: { essence: 1, species: 1, era: 1 } });
    expect(r.body.name).toMatch(/^Ana#\d{4}$/);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
    const b = await board(`board=essence&player=${p.id}`);
    expect(b.status).toBe(200);
    const entries = b.body.entries as EntryView[];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ rank: 1, score: 18000, era: 1, isMe: true });
    expect(entries[0].name).toBe(r.body.name);
    expect(b.body.me).toMatchObject({ rank: 1, isMe: true });
    // Without the player param nobody is "me".
    expect(((await board('board=essence')).body.entries as EntryView[])[0].isMe).toBe(false);
    expect(typeof b.body.serverTime).toBe('number');
  });

  it('a sessions-cycle player at Night 3 is accepted and stays accepted (RF-01: rejected from Night 2 on before)', async () => {
    const p = await newPlayer();
    // Night 3 after 9 sessions (NIGHT_GATES), no Genome: the classic rules alone would reject it.
    const night3 = { lifetimeEssence: 9000, eraEssence: 9000, era: 3, epsPeak: 20, cycle: 'sessions' as const, sessions: 9, datos: 420, speciesCount: 2, behaviorsCount: 1, playTimeSec: 900, seeds: 60 };
    const r = await submit(await signed(p, night3));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ ok: true, status: 'accepted', flagged: false });
    // Two sessions and a minute later: still accepted against the stored (sessions) baseline.
    clock += 3 * 60_000;
    const later = await submit(await signed(p, { ...night3, lifetimeEssence: 12_000, eraEssence: 12_000, sessions: 11, datos: 560, playTimeSec: 1060, seeds: 72, clientTime: clock }));
    expect(later.status, JSON.stringify(later.body)).toBe(200);
    expect(later.body).toMatchObject({ status: 'accepted', flagged: false });
    // The same save claiming the classic loop (no cycle) is judged by the classic rules.
    const q = await newPlayer();
    const classic = await submit(await signed(q, { ...night3, cycle: undefined, sessions: undefined, datos: undefined }));
    expect(classic.status).toBe(422);
  });

  it('ranks players per board and serves the top 50 plus my own row', async () => {
    const players = await Promise.all(Array.from({ length: 55 }, () => newPlayer()));
    for (let i = 0; i < players.length; i++) {
      const r = await submit(await signed(players[i], { ...stats(10 + i), name: `Player ${i}` }), { 'x-real-ip': `10.1.0.${i}` });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    }
    const last = players[0]; // fewest minutes → least essence → rank 55
    const b = await board(`board=essence&player=${last.id}`);
    const entries = b.body.entries as EntryView[];
    expect(entries).toHaveLength(50);
    expect(entries.map((e) => e.rank)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(entries[0].name.startsWith('Player 54#')).toBe(true);
    expect(entries.every((e, i) => i === 0 || entries[i - 1].score >= e.score)).toBe(true);
    expect(b.body.me).toMatchObject({ rank: 55, isMe: true });
    expect(b.body.total).toBe(55);
    const sp = (await board('board=species')).body.entries as EntryView[];
    expect(sp[0].score).toBe(6);
  });

  it('enforces 60 s between submissions of one player, then accepts progress and keeps the best', async () => {
    const p = await newPlayer();
    expect((await submit(await signed(p))).status).toBe(200);
    clock += 30_000;
    const early = await submit(await signed(p, { ...stats(60.5), clientTime: clock }));
    expect(early.status).toBe(429);
    expect(Number(early.headers.get('retry-after'))).toBeGreaterThan(0);
    clock += 40_000;
    const ok = await submit(await signed(p, { ...stats(61), clientTime: clock }));
    expect(ok.status).toBe(200);
    const b = await board(`board=essence&player=${p.id}`);
    expect((b.body.me as EntryView).score).toBe(61 * 60 * 5);
  });

  it('refuses a second key for an existing player id (trust on first use)', async () => {
    const p = await newPlayer();
    expect((await submit(await signed(p))).status).toBe(200);
    clock += 120_000;
    const impostor = await newPlayer(p.id);
    const r = await submit(await signed(impostor, { ...stats(70), clientTime: clock }));
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('key_mismatch');
  });

  it('rejects a forged payload: bad signature, or proof of work that does not match', async () => {
    const p = await newPlayer();
    const sub = await signed(p);
    // With BITS = 4 one forgery in 16 still meets the difficulty by luck: pick one that does not, so the
    // test is deterministic (the point is that the work is bound to the payload).
    let forged = { ...sub, lifetimeEssence: sub.lifetimeEssence * 2 };
    for (let k = 3; await powValid(await powChallenge(forged), forged.powSolution, BITS); k++) {
      forged = { ...sub, lifetimeEssence: sub.lifetimeEssence * k };
    }
    expect((await submit(forged)).body.error).toBe('pow'); // the work is bound to the payload
    // Redo the work for the forged numbers but keep the old signature.
    const reworked = { ...forged, powSolution: await solvePow(await powChallenge(forged), BITS) };
    const r = await submit(reworked);
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('bad_signature');
  });

  it('rejects replays of an old signed submission', async () => {
    const p = await newPlayer();
    const sub = await signed(p);
    expect((await submit(sub)).status).toBe(200);
    clock += 120_000;
    const r = await submit(sub, { 'x-real-ip': '10.9.9.9' });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('replay');
  });

  it('rejects client clocks far from the server clock (the client corrects with serverTime)', async () => {
    const p = await newPlayer();
    const r = await submit(await signed(p, { clientTime: clock - 20 * 60_000 }));
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('clock');
    expect(r.body.serverTime).toBe(clock);
  });

  it('rejects names the filter refuses', async () => {
    const p = await newPlayer();
    const r = await submit(await signed(p, { name: 'pendejo' }));
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('name_profanity');
  });

  it('rejects implausible scores and leaves the board untouched', async () => {
    const p = await newPlayer();
    const r = await submit(await signed(p, { lifetimeEssence: 1e40, eraEssence: 1e40, epsPeak: 1e36 }));
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('implausible');
    expect(r.body.reasons).toContain('essence_rate');
    expect((await board('board=essence')).body.entries).toEqual([]);
  });

  it('flags suspicious players: kept, greyed for themselves, hidden from the top board', async () => {
    const honest = await newPlayer();
    const cheater = await newPlayer();
    expect((await submit(await signed(honest))).status).toBe(200);
    const r = await submit(await signed(cheater, { ...stats(90), integrity: { speedHack: false, clockRollback: false, tampered: true } }), {
      'x-real-ip': '10.0.0.7',
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, status: 'flagged', flagged: true, reasons: ['integrity_tamper'] });
    const b = await board(`board=essence&player=${cheater.id}`);
    const entries = b.body.entries as EntryView[];
    expect(entries).toHaveLength(1);
    expect(entries[0].isMe).toBe(false);
    // Would be #1 (more essence) but is flagged: shown to themselves with the flag.
    expect(b.body.me).toMatchObject({ rank: 1, isMe: true, flagged: true });
    // Flags are sticky: a clean report later does not clear them.
    clock += 120_000;
    const later = await submit(await signed(cheater, { ...stats(92), clientTime: clock }), { 'x-real-ip': '10.0.0.7' });
    expect(later.body.status).toBe('flagged');
  });

  it('a speed-hacked play clock is rejected against server time', async () => {
    const p = await newPlayer();
    expect((await submit(await signed(p))).status).toBe(200);
    clock += 5 * 60_000; // 5 real minutes…
    const r = await submit(await signed(p, { ...stats(80), clientTime: clock })); // …but 20 more minutes played
    expect(r.status).toBe(422);
    expect(r.body.reasons).toContain('playtime_speed');
  });

  describe('request hygiene', () => {
    it('refuses foreign origins and cross-site requests (same-origin only, no CORS headers)', async () => {
      const p = await newPlayer();
      expect((await submit(await signed(p), { origin: 'https://evil.example' })).status).toBe(403);
      const res = await svc.submit(
        new Request(`${ORIGIN}/api/submit`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
          body: '{}',
        }),
      );
      expect(res.status).toBe(403);
      expect((await svc.leaderboard(get('board=essence', { origin: 'https://evil.example' }))).status).toBe(403);
    });

    it('accepts extra origins listed in the configuration', async () => {
      const s2 = createLeaderboardService({ store, now: () => clock, powBits: BITS, allowedOrigins: ['https://bioluma.games'], log: () => undefined });
      const p = await newPlayer();
      const res = await s2.submit(post(await signed(p), { origin: 'https://bioluma.games' }));
      expect(res.status).toBe(200);
    });

    it('requires POST + JSON and limits body size', async () => {
      expect((await svc.submit(new Request(`${ORIGIN}/api/submit`))).status).toBe(405);
      expect((await svc.submit(post('{}', { 'content-type': 'text/plain' }))).status).toBe(415);
      expect((await svc.submit(post('x'.repeat(10_000)))).status).toBe(413);
      expect((await svc.submit(post('{not json'))).status).toBe(400);
      const p = await newPlayer();
      const r = await submit({ ...(await signed(p)), extra: true });
      expect(r.status).toBe(400);
      expect(r.body.field).toBe('unknown_field:extra');
      expect((await svc.submit(new Request(`${ORIGIN}/api/submit`, { method: 'OPTIONS' }))).status).toBe(204);
    });

    it('rejects insufficient proof of work', async () => {
      const p = await newPlayer();
      const strict = createLeaderboardService({ store, now: () => clock, powBits: 24, log: () => undefined });
      const res = await strict.submit(post(await signed(p, {}, 2)));
      expect(res.status).toBe(400);
      expect(await json(res)).toMatchObject({ error: 'pow', powBits: 24 });
    });

    it('limits submissions per IP', async () => {
      const s2 = createLeaderboardService({ store, now: () => clock, powBits: BITS, submitLimiter: new RateLimiter(2, 0.001), log: () => undefined });
      const codes: number[] = [];
      for (let i = 0; i < 3; i++) codes.push((await s2.submit(post(await signed(await newPlayer())))).status);
      expect(codes).toEqual([200, 200, 429]);
    });

    it('validates leaderboard queries', async () => {
      expect((await board('board=money')).status).toBe(400);
      expect((await board('board=era&player=../../x')).status).toBe(400);
      expect((await svc.leaderboard(new Request(`${ORIGIN}/api/leaderboard?board=era`, { method: 'POST' }))).status).toBe(405);
      expect((await board('board=era')).body).toMatchObject({ ok: true, entries: [], me: null, total: 0 });
    });

    it('answers 503 (not a crash) when storage is down', async () => {
      const broken: LeaderboardStore = {
        kind: 'memory',
        getPlayer: () => Promise.reject(new Error('down')),
        putPlayer: () => Promise.reject(new Error('down')),
        getBoard: () => Promise.reject(new Error('down')),
        putBoard: () => Promise.reject(new Error('down')),
      };
      const s2 = createLeaderboardService({ store: broken, now: () => clock, powBits: BITS, log: () => undefined });
      expect((await s2.submit(post(await signed(await newPlayer())))).status).toBe(503);
      expect((await s2.leaderboard(get('board=essence'))).status).toBe(503);
    });
  });
});

describe('Vercel entry points (api/*.ts)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: T0 });
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
    vi.stubEnv('BLOB_STORE_ID', '');
    vi.stubEnv('LEADERBOARD_STORE', 'memory');
  });
  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    (await import('../../server/env')).resetServiceCache();
  });

  it('declare the edge runtime and serve submit + leaderboard with the default difficulty', async () => {
    const submitMod = await import('../../api/submit');
    const boardMod = await import('../../api/leaderboard');
    expect(submitMod.config).toEqual({ runtime: 'edge' });
    expect(boardMod.config).toEqual({ runtime: 'edge' });
    clock = Date.now();
    const p = await newPlayer();
    const sub = await signed(p, { clientTime: Date.now() }, 14);
    const res = await submitMod.default(post(sub));
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    const b = await boardMod.default(get(`board=essence&player=${p.id}`));
    const body = await json(b);
    expect((body.entries as EntryView[])[0]).toMatchObject({ rank: 1, isMe: true });
  });
});
