/**
 * Builds the ranking service from environment variables, once per serverless instance.
 *
 *   BLOB_READ_WRITE_TOKEN        Vercel Blob read-write token (added when you create a Blob store and
 *                                connect it to the project). Use a PRIVATE store.
 *   BLOB_STORE_ID                Alternative to the token: store id + Vercel OIDC (header x-vercel-oidc-token).
 *   LEADERBOARD_FLUSH_MINUTES    Minimum minutes between Blob writes (default 60; ≈2 puts per flush).
 *   LEADERBOARD_BLOB_PREFIX      Path prefix in the store (default "bioluma-leaderboard/v1"); give
 *                                Preview a different one so tests never touch the real ranking.
 *   LEADERBOARD_ALLOWED_ORIGINS  Extra comma-separated origins allowed to call the API.
 *   LEADERBOARD_STORE=memory     Force the in-memory store (per instance, lost on cold start).
 * Without Blob credentials the in-memory store is used: the API works, but each instance keeps its own
 * short-lived leaderboard (fine for local dev and tests, not for production).
 */
import { BlobClient, BlobStore, blobAuthFromEnv, type BlobAuth, type Env } from './blob.js';
import { createLeaderboardService, type LeaderboardService } from './service.js';
import { MemoryStore, type LeaderboardStore } from './store.js';

export function processEnv(): Env {
  try {
    return (globalThis as { process?: { env?: Env } }).process?.env ?? {};
  } catch {
    return {};
  }
}

let cached: { service: LeaderboardService; store: LeaderboardStore } | null = null;
/** Latest OIDC token seen on a request (rotates; read lazily by the Blob client). */
let oidcFromRequest: string | null = null;

/** Service for this request (singleton per instance). */
export function serviceFor(req: Request, env: Env = processEnv()): LeaderboardService {
  const header = req.headers.get('x-vercel-oidc-token');
  if (header) oidcFromRequest = header;
  if (cached) return cached.service;
  const store = createStore(env);
  const service = createLeaderboardService({
    store,
    allowedOrigins: (env.LEADERBOARD_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  });
  cached = { service, store };
  return service;
}

export function createStore(env: Env): LeaderboardStore {
  const auth = (): BlobAuth | null => blobAuthFromEnv(env, oidcFromRequest);
  if (env.LEADERBOARD_STORE === 'memory' || !auth()) {
    if (!env.LEADERBOARD_STORE) console.warn('[leaderboard] no Blob credentials: using the per-instance memory store');
    return new MemoryStore();
  }
  const minutes = Number(env.LEADERBOARD_FLUSH_MINUTES);
  return new BlobStore({
    client: new BlobClient({ auth, apiUrl: env.VERCEL_BLOB_API_URL, apiVersion: env.VERCEL_BLOB_API_VERSION_OVERRIDE }),
    prefix: env.LEADERBOARD_BLOB_PREFIX,
    flushIntervalMs: Number.isFinite(minutes) && minutes > 0 ? Math.max(1, minutes) * 60_000 : undefined,
  });
}

/** Tests: drop the singleton. */
export function resetServiceCache(): void {
  cached = null;
  oidcFromRequest = null;
}
