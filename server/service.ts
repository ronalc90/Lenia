/**
 * Ranking HTTP logic, independent of Vercel: takes a Web `Request`, returns a Web `Response`.
 * api/submit.ts and api/leaderboard.ts are thin wrappers; tests call these handlers directly.
 *
 * Order of checks in submit (cheapest first, so spam is shed before touching storage):
 *   method/origin/content-type/size → per-IP bucket → JSON shape → clock window → proof of work →
 *   per-player 60 s gate → player record → key match + ECDSA signature → replay → name → plausibility.
 */
import { validateName } from './names.js';
import {
  BOARD_NAMES,
  BOARD_SERVED,
  MAX_BODY_BYTES,
  MAX_CLOCK_SKEW_MS,
  POW_BITS,
  SUBMIT_MIN_INTERVAL_MS,
  parseSubmission,
  playerKey,
  powChallenge,
  powValid,
  signedBytes,
  tagFromKey,
  verifyBytes,
  type BoardName,
  type Submission,
} from './protocol.js';
import { RateLimiter } from './ratelimit.js';
import { entryFor, rankOn, upsertEntry, type BoardEntry, type LeaderboardStore, type PlayerRecord } from './store.js';
import { validateSubmission, type Baseline } from './validate.js';

export interface ServiceOptions {
  store: LeaderboardStore;
  now?: () => number;
  /** Origins allowed besides the request's own (e.g. a custom domain serving the game). */
  allowedOrigins?: string[];
  powBits?: number;
  /** Per-IP buckets (defaults: submit 20 burst / 1 per 30 s; read 60 burst / 1 per s). */
  submitLimiter?: RateLimiter;
  readLimiter?: RateLimiter;
  log?: (msg: string, data?: unknown) => void;
}

export interface LeaderboardService {
  submit(req: Request): Promise<Response>;
  leaderboard(req: Request): Promise<Response>;
}

/** Wire shape of one row (src/net mirrors it as LeaderboardEntry). */
export interface EntryView {
  rank: number;
  name: string;
  score: number;
  species: number;
  era: number;
  isMe: boolean;
  flagged?: boolean;
}

const PLAYER_ID = /^[0-9a-fA-F-]{16,64}$/;

export function createLeaderboardService(opts: ServiceOptions): LeaderboardService {
  const store = opts.store;
  const now = opts.now ?? (() => Date.now());
  const powBits = opts.powBits ?? POW_BITS;
  const submitLimiter = opts.submitLimiter ?? new RateLimiter(20, 1 / 30);
  const readLimiter = opts.readLimiter ?? new RateLimiter(60, 1);
  const log = opts.log ?? ((msg: string, data?: unknown) => console.warn(`[leaderboard] ${msg}`, data ?? ''));
  /** Last verified attempt per player key on this instance (memory gate in front of the store). */
  const recent = new Map<string, number>();
  const inflight = new Set<string>();

  function json(status: number, body: Record<string, unknown>, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify({ ...body, serverTime: now() }), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        ...headers,
      },
    });
  }
  const fail = (status: number, error: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
    json(status, { ok: false, error, ...extra }, headers);
  const limited = (retryAfterSec: number) =>
    fail(429, 'rate_limited', { retryAfter: retryAfterSec }, { 'retry-after': String(Math.max(1, Math.ceil(retryAfterSec))) });

  /** Same-origin only: no CORS headers are ever sent, and a foreign Origin is refused outright. */
  function originOk(req: Request): boolean {
    const origin = req.headers.get('origin');
    if (!origin) return req.headers.get('sec-fetch-site') !== 'cross-site';
    try {
      const o = new URL(origin);
      const hosts = [new URL(req.url).host, req.headers.get('x-forwarded-host'), req.headers.get('host')].filter(Boolean);
      return hosts.includes(o.host) || (opts.allowedOrigins ?? []).includes(origin);
    } catch {
      return false;
    }
  }

  function clientIp(req: Request): string {
    return (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim().slice(0, 64);
  }

  /** Read at most `max` bytes of body; null if larger. */
  async function readBody(req: Request, max: number): Promise<string | null> {
    const declared = Number(req.headers.get('content-length') ?? 'NaN');
    if (Number.isFinite(declared) && declared > max) return null;
    if (!req.body) return '';
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
    const all = new Uint8Array(size);
    let o = 0;
    for (const c of chunks) {
      all.set(c, o);
      o += c.byteLength;
    }
    return new TextDecoder().decode(all);
  }

  function view(e: BoardEntry, rank: number, meKey: string | null, flagged = false): EntryView {
    const v: EntryView = { rank, name: `${e.name}#${e.tag}`, score: e.score, species: e.species, era: e.era, isMe: e.key === meKey };
    if (flagged) v.flagged = true;
    return v;
  }

  async function flushQuietly(): Promise<void> {
    try {
      await store.flush?.();
    } catch (e) {
      log('flush failed', String(e));
    }
  }

  // ───────────────────────────── POST /api/submit ────────────────────

  async function submit(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { allow: 'POST' } });
    if (req.method !== 'POST') return fail(405, 'method', {}, { allow: 'POST' });
    if (!originOk(req)) return fail(403, 'origin');
    if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return fail(415, 'content_type');
    const t = now();
    const ipGate = submitLimiter.take(`s:${clientIp(req)}`, t);
    if (!ipGate.ok) return limited(ipGate.retryAfterSec);

    const text = await readBody(req, MAX_BODY_BYTES);
    if (text === null) return fail(413, 'too_large');
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return fail(400, 'bad_json');
    }
    const parsed = parseSubmission(body);
    if (!parsed.ok) return fail(400, 'bad_request', { field: parsed.error });
    const sub: Submission = parsed.sub;

    if (Math.abs(sub.clientTime - t) > MAX_CLOCK_SKEW_MS) return fail(400, 'clock');
    if (!(await powValid(await powChallenge(sub), sub.powSolution, powBits))) return fail(400, 'pow', { powBits });

    const key = await playerKey(sub.playerId);
    const lastTry = recent.get(key);
    if (inflight.has(key)) return limited(5);
    if (lastTry !== undefined && t - lastTry < SUBMIT_MIN_INTERVAL_MS) return limited((SUBMIT_MIN_INTERVAL_MS - (t - lastTry)) / 1000);
    inflight.add(key);
    try {
      let rec: PlayerRecord | null;
      try {
        rec = await store.getPlayer(key);
      } catch (e) {
        log('store read failed', String(e));
        return fail(503, 'storage');
      }
      if (rec && rec.pub !== sub.publicKey) return fail(403, 'key_mismatch');
      if (!(await verifyBytes(sub.publicKey, sub.sig, signedBytes(sub)))) return fail(401, 'bad_signature');
      // From here on the request provably comes from the key holder: it counts against their gate.
      recent.set(key, t);
      if (recent.size > 50_000) recent.delete(recent.keys().next().value as string);
      if (rec && t - rec.last.at < SUBMIT_MIN_INTERVAL_MS) return limited((SUBMIT_MIN_INTERVAL_MS - (t - rec.last.at)) / 1000);
      if (rec && sub.clientTime <= rec.last.clientTime) return fail(409, 'replay');

      const nm = validateName(sub.name);
      if (!nm.ok) return fail(422, nm.error);

      const stats = {
        lifetimeEssence: sub.lifetimeEssence,
        eraEssence: sub.eraEssence,
        genome: sub.genome,
        speciesCount: sub.speciesCount,
        behaviorsCount: sub.behaviorsCount,
        era: sub.era,
        playTimeSec: sub.playTimeSec,
        seeds: sub.seeds,
        createdAt: sub.createdAt,
        epsPeak: sub.epsPeak,
      };
      const result = validateSubmission(rec?.last ?? null, stats, t, sub.integrity);
      if (result.verdict === 'reject') {
        log('rejected', { key: key.slice(0, 8), reasons: result.hard });
        return fail(422, 'implausible', { reasons: result.hard });
      }

      const baseline: Baseline = { ...stats, at: t, clientTime: sub.clientTime };
      const flags = [...new Set([...(rec?.flags ?? []), ...result.soft])].slice(0, 16);
      const next: PlayerRecord = {
        key,
        pub: sub.publicKey,
        name: nm.name,
        tag: tagFromKey(key),
        registeredAt: rec?.registeredAt ?? t,
        last: baseline,
        best: {
          essence: Math.max(rec?.best.essence ?? 0, sub.lifetimeEssence),
          species: Math.max(rec?.best.species ?? 0, sub.speciesCount),
          era: Math.max(rec?.best.era ?? 0, sub.era),
        },
        flagged: (rec?.flagged ?? false) || result.verdict === 'flag',
        flags,
        accepted: (rec?.accepted ?? 0) + 1,
        updatedAt: t,
      };
      const ranks = {} as Record<BoardName, number>;
      try {
        await store.putPlayer(next);
        for (const b of BOARD_NAMES) {
          const entries = upsertEntry(b, await store.getBoard(b), next);
          await store.putBoard(b, entries);
          ranks[b] = rankOn(entries, key);
        }
      } catch (e) {
        log('store write failed', String(e));
        return fail(503, 'storage');
      }
      await flushQuietly();
      return json(200, {
        ok: true,
        status: next.flagged ? 'flagged' : 'accepted',
        flagged: next.flagged,
        ...(next.flagged ? { reasons: flags } : {}),
        name: `${next.name}#${next.tag}`,
        ranks,
      });
    } finally {
      inflight.delete(key);
    }
  }

  // ───────────────────────────── GET /api/leaderboard ────────────────

  async function leaderboard(req: Request): Promise<Response> {
    if (req.method !== 'GET') return fail(405, 'method', {}, { allow: 'GET' });
    if (!originOk(req)) return fail(403, 'origin');
    const gate = readLimiter.take(`r:${clientIp(req)}`, now());
    if (!gate.ok) return limited(gate.retryAfterSec);
    const url = new URL(req.url);
    const board = url.searchParams.get('board') ?? 'essence';
    if (!(BOARD_NAMES as readonly string[]).includes(board)) return fail(400, 'board');
    const player = url.searchParams.get('player');
    if (player !== null && !PLAYER_ID.test(player)) return fail(400, 'player');
    const meKey = player ? await playerKey(player) : null;
    try {
      const entries = await store.getBoard(board as BoardName);
      const top = entries.slice(0, BOARD_SERVED).map((e, i) => view(e, i + 1, meKey));
      let me: EntryView | null = null;
      if (meKey) {
        const r = rankOn(entries, meKey);
        if (r > 0) me = view(entries[r - 1], r, meKey);
        else {
          // Not on the stored board: flagged, below the stored top, or not flushed yet. Show the place
          // the score would take (a lower bound when the board is full).
          const rec = await store.getPlayer(meKey);
          if (rec) {
            const e = entryFor(board as BoardName, rec);
            me = view(e, entries.filter((x) => x.score > e.score).length + 1, meKey, rec.flagged);
          }
        }
      }
      await flushQuietly();
      return json(200, { ok: true, board, entries: top, me, total: entries.length });
    } catch (e) {
      log('store read failed', String(e));
      return fail(503, 'storage');
    }
  }

  return { submit, leaderboard };
}
