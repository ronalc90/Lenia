/**
 * Minimal key-value storage for store entitlements.
 *
 * The interface matches a Cloudflare Workers KV binding (`env.STORE_KV`: get(key) → string|null,
 * put(key, value)), which is where the store API runs in production: payments cannot run on Vercel
 * Hobby (commercial use is forbidden there), so the store endpoints deploy to Cloudflare Pages
 * Functions with a KV namespace bound as STORE_KV. The ranking's LeaderboardStore (server/store.ts)
 * is ranking-specific, so it is only reused to look up registered public keys (verify.ts).
 *
 * Without a binding, an in-memory map is used: fine for tests and `vite dev`, NOT for production
 * (lost on cold start, per instance). The handlers log a warning when that happens.
 * Consistency: KV is last-write-wins and eventually consistent; one player's webhooks rarely race.
 * If that ever matters, move records to a Durable Object or D1 (same interface).
 */

export interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export class MemoryKV implements KV {
  private map = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }
  async put(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  get size(): number {
    return this.map.size;
  }
}

let fallback: MemoryKV | null = null;

/** The KV for this environment: the STORE_KV binding when present, else a per-instance memory map. */
export function kvFromEnv(env: Record<string, unknown>): { kv: KV; persistent: boolean } {
  const b = env.STORE_KV as Partial<KV> | undefined;
  if (b && typeof b.get === 'function' && typeof b.put === 'function') return { kv: b as KV, persistent: true };
  if (!fallback) {
    fallback = new MemoryKV();
    console.warn('[store] no STORE_KV binding: entitlements live in memory (dev/test only)');
  }
  return { kv: fallback, persistent: false };
}

/** Tests: forget the memory fallback. */
export function resetMemoryKV(): void {
  fallback = null;
}
