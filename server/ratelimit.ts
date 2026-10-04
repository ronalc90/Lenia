/**
 * In-memory token buckets, per serverless instance. Coarse by design: it sheds bursts from one IP that
 * land on the same warm instance. The persistent per-player 60 s rule lives in the player record, and
 * the proof of work makes every request cost the sender CPU.
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; t: number }>();

  /**
   * @param capacity burst size
   * @param refillPerSec tokens regained per second
   * @param maxKeys bound on tracked keys (oldest dropped) so a flood cannot grow memory without limit
   */
  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    private readonly maxKeys = 10_000,
  ) {}

  /** Take one token; false = limited. `retryAfterSec` tells when the next token is available. */
  take(key: string, now: number): { ok: boolean; retryAfterSec: number } {
    let b = this.buckets.get(key);
    if (!b) {
      if (this.buckets.size >= this.maxKeys) {
        const oldest = this.buckets.keys().next().value;
        if (oldest !== undefined) this.buckets.delete(oldest);
      }
      b = { tokens: this.capacity, t: now };
    } else {
      this.buckets.delete(key); // re-insert: Map order = recency
    }
    b.tokens = Math.min(this.capacity, b.tokens + ((now - b.t) / 1000) * this.refillPerSec);
    b.t = now;
    this.buckets.set(key, b);
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { ok: true, retryAfterSec: 0 };
    }
    return { ok: false, retryAfterSec: Math.ceil((1 - b.tokens) / this.refillPerSec) };
  }
}
