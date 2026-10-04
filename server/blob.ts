/**
 * Vercel Blob storage for the ranking, dependency-free (plain fetch, no @vercel/blob).
 *
 * ── REST protocol ──────────────────────────────────────────────────────────────────────────────────
 * Mirrors what @vercel/blob 2.8.0 sends (read from its dist/ source, API version 12). If Vercel changes
 * it, this adapter is the ONLY place to update; VERCEL_BLOB_API_URL / VERCEL_BLOB_API_VERSION_OVERRIDE
 * are honoured like in the SDK.
 *   PUT  {api}/?pathname=<p>          headers: authorization: Bearer <token>, x-api-version: 12,
 *        x-vercel-blob-store-id, x-vercel-blob-access: private, x-add-random-suffix: 0,
 *        x-allow-overwrite: 0|1, x-content-type, x-cache-control-max-age, [x-if-match: <etag>]
 *        → 200 JSON { url, pathname, etag, … } | error JSON { error: { code, message } }
 *        (code "precondition_failed" when x-if-match does not match)
 *   GET  https://<storeId>.private.blob.vercel-storage.com/<p>[?cache=0]   authorization: Bearer <token>
 *        → 200 body + ETag header | 404.  `?cache=0` bypasses the CDN (consistent read, costs a
 *        "simple operation"); without it a read may be up to 60 s stale.
 * Use a PRIVATE store: player records are not secret (public keys), but nobody else needs to read them.
 *
 * ── Why write-behind ───────────────────────────────────────────────────────────────────────────────
 * The Hobby plan includes 2 000 "advanced operations" (put/copy/list) per MONTH and blocks the store for
 * 30 days when exceeded. One put per submission would burn that with a single player in a few days.
 * So accepted submissions are buffered in the instance's memory and persisted at most once per
 * LEADERBOARD_FLUSH_MINUTES (default 60) across ALL instances: 2 puts per flush → ≈1 440 puts/month.
 * Two documents:
 *   <prefix>/players.json  every known player (keyed by hashed id), capped at maxPlayers
 *   <prefix>/boards.json   top 200 per board, DERIVED from players.json on every flush (small: GETs read it)
 * Concurrency: a flush re-reads players.json with ?cache=0, merges its buffered records per player
 * (newer wins, flags are sticky, best scores are maxed, the first registered key wins), and writes with
 * x-if-match (optimistic locking, retried on conflict). boards.json is last-writer-wins, which is fine
 * because every writer derives it from a fresh players.json. Costs: buffered data of an instance that
 * dies before flushing is lost (the client resubmits every ~5 min), and boards lag up to one interval.
 */
import { BOARD_NAMES, type BoardName } from './protocol.js';
import { deriveBoards, upsertEntry, type BoardEntry, type LeaderboardStore, type PlayerRecord } from './store.js';

export interface BlobAuth {
  token: string;
  storeId: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface BlobClientOptions {
  /** Called per request so short-lived OIDC tokens can rotate. */
  auth: () => BlobAuth | null;
  fetch?: FetchLike;
  apiUrl?: string;
  apiVersion?: string;
  /** CDN cache seconds for written blobs (Blob minimum is 60). */
  cacheMaxAge?: number;
}

export class BlobError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly code = 'unknown',
  ) {
    super(`blob: ${message}`);
  }
}

export type PutResult = { ok: true; etag: string } | { ok: false; conflict: true };

export class BlobClient {
  private readonly fetchFn: FetchLike;
  private readonly apiUrl: string;
  private readonly apiVersion: string;
  private readonly cacheMaxAge: number;

  constructor(private readonly opts: BlobClientOptions) {
    this.fetchFn = opts.fetch ?? ((i, init) => fetch(i, init));
    this.apiUrl = (opts.apiUrl ?? 'https://vercel.com/api/blob').replace(/\/+$/, '');
    this.apiVersion = opts.apiVersion ?? '12';
    this.cacheMaxAge = Math.max(60, opts.cacheMaxAge ?? 60);
  }

  private auth(): BlobAuth {
    const a = this.opts.auth();
    if (!a || !a.token || !a.storeId) throw new BlobError('no credentials', 0, 'no_credentials');
    return a;
  }

  blobUrl(pathname: string, fresh: boolean): string {
    const { storeId } = this.auth();
    const path = pathname.split('/').map(encodeURIComponent).join('/');
    return `https://${storeId}.private.blob.vercel-storage.com/${path}${fresh ? '?cache=0' : ''}`;
  }

  /** null when the blob does not exist. */
  async getJson<T>(pathname: string, opts: { fresh?: boolean } = {}): Promise<{ data: T; etag: string } | null> {
    const { token } = this.auth();
    const res = await this.fetchFn(this.blobUrl(pathname, !!opts.fresh), {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new BlobError(`GET ${pathname} → ${res.status}`, res.status);
    const text = await res.text();
    try {
      return { data: JSON.parse(text) as T, etag: res.headers.get('etag') ?? '' };
    } catch {
      throw new BlobError(`GET ${pathname}: invalid JSON`, res.status, 'bad_json');
    }
  }

  /**
   * Write JSON. `ifMatch`: only if the current ETag matches. `create`: only if it does not exist yet.
   * Neither: unconditional overwrite. Conflicts resolve to { ok: false, conflict: true }.
   */
  async putJson(pathname: string, data: unknown, opts: { ifMatch?: string; create?: boolean } = {}): Promise<PutResult> {
    const { token, storeId } = this.auth();
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      'x-api-version': this.apiVersion,
      'x-vercel-blob-store-id': storeId,
      'x-vercel-blob-access': 'private',
      'x-add-random-suffix': '0',
      'x-allow-overwrite': opts.create ? '0' : '1',
      'x-content-type': 'application/json',
      'x-cache-control-max-age': String(this.cacheMaxAge),
    };
    if (opts.ifMatch) headers['x-if-match'] = opts.ifMatch;
    const res = await this.fetchFn(`${this.apiUrl}/?${new URLSearchParams({ pathname }).toString()}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });
    if (res.ok) {
      let etag = '';
      try {
        etag = String(((await res.json()) as { etag?: unknown }).etag ?? '');
      } catch {
        /* body is informative only */
      }
      return { ok: true, etag };
    }
    let code = 'unknown';
    try {
      code = String(((await res.json()) as { error?: { code?: unknown } }).error?.code ?? 'unknown');
    } catch {
      /* not JSON */
    }
    // ETag mismatch, or "already exists" when creating: someone else wrote first.
    if (res.status === 412 || code === 'precondition_failed' || (opts.create && res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 403)) {
      return { ok: false, conflict: true };
    }
    throw new BlobError(`PUT ${pathname} → ${res.status} ${code}`, res.status, code);
  }
}

// ───────────────────────────── write-behind store ──────────────────

interface PlayersDoc {
  v: 1;
  updatedAt: number;
  players: Record<string, PlayerRecord>;
}
interface BoardsDoc {
  v: 1;
  updatedAt: number;
  boards: Record<BoardName, BoardEntry[]>;
}

export interface BlobStoreOptions {
  client: BlobClient;
  /** Path prefix inside the store, e.g. "bioluma-leaderboard/v1" (use another per environment). */
  prefix?: string;
  /** Minimum time between two flushes across all instances. */
  flushIntervalMs?: number;
  /** GET freshness: boards.json is re-read (through the CDN) after this. */
  boardsTtlMs?: number;
  /** players.json is re-read after this, or sooner when an unknown player shows up. */
  playersTtlMs?: number;
  /** Re-read players.json for an unknown key only if the cached copy is older than this. */
  missRefreshMs?: number;
  maxPlayers?: number;
  now?: () => number;
  /** Errors during background-ish work (flush) are reported here instead of thrown. */
  onError?: (e: unknown) => void;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Merge two versions of one player written by different instances. */
export function mergePlayer(theirs: PlayerRecord | undefined, mine: PlayerRecord): PlayerRecord {
  if (!theirs) return mine;
  if (theirs.pub !== mine.pub) {
    // Two instances registered different keys for one id: the first registration wins (TOFU).
    return mine.registeredAt < theirs.registeredAt ? mine : theirs;
  }
  const newer = mine.updatedAt >= theirs.updatedAt ? mine : theirs;
  const lastNewer = mine.last.at >= theirs.last.at ? mine : theirs;
  return {
    ...newer,
    last: lastNewer.last,
    registeredAt: Math.min(mine.registeredAt, theirs.registeredAt),
    best: {
      essence: Math.max(mine.best.essence, theirs.best.essence),
      species: Math.max(mine.best.species, theirs.best.species),
      era: Math.max(mine.best.era, theirs.best.era),
    },
    flagged: mine.flagged || theirs.flagged,
    flags: [...new Set([...theirs.flags, ...mine.flags])].slice(0, 16),
    accepted: Math.max(mine.accepted, theirs.accepted),
    updatedAt: Math.max(mine.updatedAt, theirs.updatedAt),
  };
}

export class BlobStore implements LeaderboardStore {
  readonly kind = 'blob' as const;
  private readonly client: BlobClient;
  private readonly playersPath: string;
  private readonly boardsPath: string;
  private readonly flushIntervalMs: number;
  private readonly boardsTtlMs: number;
  private readonly playersTtlMs: number;
  private readonly missRefreshMs: number;
  private readonly maxPlayers: number;
  private readonly now: () => number;
  private readonly onError: (e: unknown) => void;

  private players = new Map<string, PlayerRecord>();
  private playersLoadedAt = -Infinity;
  /** Accepted but not yet persisted (overlay on top of `players`). */
  private dirty = new Map<string, PlayerRecord>();
  private boards: Record<BoardName, BoardEntry[]> | null = null;
  private boardsLoadedAt = -Infinity;
  /** Last flush time we know of (from either document). */
  private remoteUpdatedAt = 0;
  private flushing: Promise<void> | null = null;
  private lastAttemptAt = -Infinity;

  constructor(opts: BlobStoreOptions) {
    this.client = opts.client;
    const prefix = (opts.prefix ?? 'bioluma-leaderboard/v1').replace(/^\/+|\/+$/g, '');
    this.playersPath = `${prefix}/players.json`;
    this.boardsPath = `${prefix}/boards.json`;
    this.flushIntervalMs = opts.flushIntervalMs ?? 60 * 60_000;
    this.boardsTtlMs = opts.boardsTtlMs ?? 60_000;
    this.playersTtlMs = opts.playersTtlMs ?? 30 * 60_000;
    this.missRefreshMs = opts.missRefreshMs ?? 60_000;
    this.maxPlayers = opts.maxPlayers ?? 3000;
    this.now = opts.now ?? (() => Date.now());
    this.onError = opts.onError ?? ((e) => console.error('[leaderboard] blob flush failed', e));
  }

  /** Buffered (not yet persisted) player records. */
  get pending(): number {
    return this.dirty.size;
  }

  private async loadPlayers(): Promise<void> {
    try {
      const doc = await this.client.getJson<PlayersDoc>(this.playersPath);
      this.players = new Map(Object.entries(doc?.data.players ?? {}));
      this.remoteUpdatedAt = Math.max(this.remoteUpdatedAt, doc?.data.updatedAt ?? 0);
      this.playersLoadedAt = this.now();
    } catch (e) {
      // A stale copy is better than nothing; with no copy at all we must not guess (an unknown player
      // would be treated as new and could have their id re-registered), so the error propagates.
      if (this.playersLoadedAt === -Infinity) throw e;
      this.onError(e);
    }
  }

  private async loadBoards(): Promise<void> {
    if (this.boards && this.now() - this.boardsLoadedAt < this.boardsTtlMs) return;
    try {
      const doc = await this.client.getJson<BoardsDoc>(this.boardsPath);
      const empty = Object.fromEntries(BOARD_NAMES.map((b) => [b, []])) as unknown as Record<BoardName, BoardEntry[]>;
      this.boards = { ...empty, ...(doc?.data.boards ?? {}) };
      this.remoteUpdatedAt = Math.max(this.remoteUpdatedAt, doc?.data.updatedAt ?? 0);
      this.boardsLoadedAt = this.now();
    } catch (e) {
      if (!this.boards) throw e;
      this.onError(e);
    }
  }

  async getPlayer(id: string): Promise<PlayerRecord | null> {
    const pending = this.dirty.get(id);
    if (pending) return clone(pending);
    const age = this.now() - this.playersLoadedAt;
    if (age >= this.playersTtlMs || (!this.players.has(id) && age >= this.missRefreshMs)) await this.loadPlayers();
    const p = this.players.get(id);
    return p ? clone(p) : null;
  }

  async putPlayer(rec: PlayerRecord): Promise<void> {
    this.dirty.set(rec.key, clone(rec));
  }

  /** Stored board with this instance's buffered records overlaid (a provisional local view). */
  async getBoard(name: BoardName): Promise<BoardEntry[]> {
    await this.loadBoards();
    let entries = this.boards![name] ?? [];
    for (const rec of this.dirty.values()) entries = upsertEntry(name, entries, rec);
    return clone(entries);
  }

  /** Boards are derived from player records on flush; the local view is the overlay in getBoard. */
  async putBoard(): Promise<void> {
    /* intentionally empty, see class comment */
  }

  async flush(force = false): Promise<void> {
    if (!this.dirty.size) return;
    if (this.flushing) return this.flushing;
    const now = this.now();
    try {
      await this.loadBoards(); // learns remoteUpdatedAt cheaply (CDN read, cached for boardsTtlMs)
    } catch (e) {
      this.onError(e);
      return;
    }
    if (!force && (now - this.remoteUpdatedAt < this.flushIntervalMs || now - this.lastAttemptAt < this.boardsTtlMs * 5)) return;
    this.lastAttemptAt = now;
    this.flushing = this.doFlush(force)
      .catch((e) => this.onError(e))
      .finally(() => {
        this.flushing = null;
      });
    return this.flushing;
  }

  private async doFlush(force: boolean): Promise<void> {
    const batch = new Map(this.dirty);
    for (let attempt = 0; attempt < 4; attempt++) {
      const cur = await this.client.getJson<PlayersDoc>(this.playersPath, { fresh: true });
      const remoteAt = cur?.data.updatedAt ?? 0;
      this.remoteUpdatedAt = Math.max(this.remoteUpdatedAt, remoteAt);
      // Another instance flushed since our cached view (or just beat us to the write): keep buffering
      // until the next slot instead of spending more puts in this one.
      if (!force && this.now() - remoteAt < this.flushIntervalMs) return;
      const merged = new Map<string, PlayerRecord>(Object.entries(cur?.data.players ?? {}));
      for (const [k, mine] of batch) merged.set(k, mergePlayer(merged.get(k), mine));
      this.evict(merged);
      const at = this.now();
      const doc: PlayersDoc = { v: 1, updatedAt: at, players: Object.fromEntries(merged) };
      const res = await this.client.putJson(this.playersPath, doc, cur ? { ifMatch: cur.etag } : { create: true });
      if (!res.ok) continue; // somebody wrote in between: re-read, re-merge
      this.players = merged;
      this.playersLoadedAt = at;
      for (const [k, rec] of batch) if (this.dirty.get(k) === rec) this.dirty.delete(k);
      const boards = deriveBoards(merged.values());
      await this.client.putJson(this.boardsPath, { v: 1, updatedAt: at, boards } satisfies BoardsDoc);
      this.boards = boards;
      this.boardsLoadedAt = at;
      this.remoteUpdatedAt = at;
      return;
    }
    throw new BlobError('flush: too many write conflicts', 412, 'conflict');
  }

  /** Keep the document bounded: drop the longest-inactive players that are on no board. */
  private evict(players: Map<string, PlayerRecord>): void {
    if (players.size <= this.maxPlayers) return;
    const keep = new Set<string>();
    for (const list of Object.values(deriveBoards(players.values()))) for (const e of list) keep.add(e.key);
    const candidates = [...players.values()].filter((p) => !keep.has(p.key)).sort((a, b) => a.last.at - b.last.at);
    for (const p of candidates) {
      if (players.size <= this.maxPlayers) break;
      players.delete(p.key);
    }
  }
}

// ───────────────────────────── credentials ─────────────────────────

export type Env = Record<string, string | undefined>;

/**
 * BLOB_READ_WRITE_TOKEN ("vercel_blob_rw_<storeId>_<secret>") wins; otherwise an OIDC token (request
 * header x-vercel-oidc-token on Vercel, or VERCEL_OIDC_TOKEN) paired with BLOB_STORE_ID. Same order as
 * the SDK. null = no Blob configured (the API falls back to the per-instance memory store).
 */
export function blobAuthFromEnv(env: Env, oidcHeader?: string | null): BlobAuth | null {
  const norm = (id: string | undefined) => (id ? id.trim().replace(/^store_/, '') : '');
  const rw = env.BLOB_READ_WRITE_TOKEN?.trim();
  if (rw) {
    const storeId = norm(env.BLOB_STORE_ID) || rw.split('_')[3] || '';
    return storeId ? { token: rw, storeId } : null;
  }
  const oidc = (oidcHeader || env.VERCEL_OIDC_TOKEN || '').trim();
  const storeId = norm(env.BLOB_STORE_ID);
  return oidc && storeId ? { token: oidc, storeId } : null;
}
