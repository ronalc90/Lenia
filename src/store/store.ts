/**
 * Store controller: the one object the UI talks to. Picks the provider, enforces the purchase
 * rules (owned, not for sale, early access, one checkout at a time) and reports status.
 *
 *   const flags = storeFlagsFromEnv(platformInfo);
 *   const entitlements = new Entitlements();
 *   const fetchSnapshot = identity ? createSnapshotFetcher(identity) : undefined;
 *   const ctx = { entitlements, fetchSnapshot, openExternal: (u) => platform.openExternal(u) };
 *   const store = new StoreController(flags, entitlements, createProviders(flags, ctx, config));
 */
import { Bus } from '../core/bus';
import type { Lang } from '../core/types';
import { formatUSD, inEarlyAccess, isForSale, itemById, priceUSD } from './catalog';
import type { Entitlements } from './entitlements';
import type { StoreFlags } from './flags';
import type { PaymentProvider, PurchaseOptions, Result } from './providers/types';
import { fail } from './providers/types';

export type BuyBlock = 'owned' | 'not_for_sale' | 'early_access' | 'disabled' | 'no_provider' | 'unavailable_here';

export interface StoreStatusEvents {
  /** busyItem = the item whose checkout is open, null when idle. */
  status: { busyItem: string | null; result?: Result };
}

export class StoreController {
  private readonly bus = new Bus<StoreStatusEvents>();
  private busy: string | null = null;
  private abort: AbortController | null = null;

  constructor(
    readonly flags: StoreFlags,
    readonly entitlements: Entitlements,
    readonly providers: PaymentProvider[],
    private readonly now: () => number = () => Date.now(),
  ) {}

  on<K extends keyof StoreStatusEvents>(type: K, fn: (e: StoreStatusEvents[K]) => void): () => void {
    return this.bus.on(type, fn);
  }

  /** Store button/modal visible at all. */
  get visible(): boolean {
    return this.flags.visible;
  }

  /** The provider used for purchases here, or null (wardrobe-only). */
  get provider(): PaymentProvider | null {
    return this.providers.find((p) => p.available()) ?? null;
  }

  get busyItem(): string | null {
    return this.busy;
  }

  /** Subscriptions are not sold through every provider (Steam). */
  get sellsSubscriptions(): boolean {
    const p = this.provider;
    return !!p && p.id !== 'steam';
  }

  canBuy(itemId: string): { ok: true } | { ok: false; reason: BuyBlock } {
    if (!this.flags.visible) return { ok: false, reason: 'disabled' };
    const item = itemById(itemId);
    if (!item || !isForSale(item)) return { ok: false, reason: 'not_for_sale' };
    const ent = this.entitlements;
    const at = this.now();
    if (item.kind === 'subscription') {
      if (ent.isSubscriber(at)) return { ok: false, reason: 'owned' };
      if (!this.sellsSubscriptions && this.provider) return { ok: false, reason: 'unavailable_here' };
    } else if (ent.isOwned(itemId, at)) {
      return { ok: false, reason: 'owned' };
    }
    if (inEarlyAccess(item, at) && !ent.isSubscriber(at)) return { ok: false, reason: 'early_access' };
    if (!this.provider) return { ok: false, reason: 'no_provider' };
    return { ok: true };
  }

  /** Store-localised price when known, else the USD reference. null = not sold alone. */
  priceLabel(itemId: string, lang: Lang): string | null {
    const item = itemById(itemId);
    if (!item) return null;
    const local = this.provider?.priceLabel?.(itemId);
    if (local) return local;
    const usd = priceUSD(item);
    return usd === null ? null : formatUSD(usd, lang);
  }

  /** Load localised prices etc. Call when the store opens. */
  async prepare(): Promise<void> {
    await Promise.all(this.providers.map((p) => p.prepare?.().catch(() => undefined)));
    this.entitlements.tick();
  }

  async buy(itemId: string, opts: PurchaseOptions = {}): Promise<Result> {
    const gate = this.canBuy(itemId);
    if (!gate.ok) {
      const map: Record<BuyBlock, Result> = {
        owned: fail('owned'),
        not_for_sale: fail('not_for_sale'),
        early_access: fail('not_for_sale', 'early access'),
        disabled: fail('disabled'),
        no_provider: fail('unavailable'),
        unavailable_here: fail('unavailable'),
      };
      return map[gate.reason];
    }
    if (this.busy) return fail('error', 'another checkout is open');
    const provider = this.provider!;
    this.busy = itemId;
    this.abort = new AbortController();
    const onAbort = () => this.abort?.abort();
    opts.signal?.addEventListener('abort', onAbort);
    this.bus.emit('status', { busyItem: itemId });
    let result: Result;
    try {
      result = await provider.purchase(itemId, { signal: this.abort.signal });
    } catch (err) {
      result = fail('error', String(err));
    } finally {
      opts.signal?.removeEventListener('abort', onAbort);
      this.busy = null;
      this.abort = null;
    }
    this.bus.emit('status', { busyItem: null, result });
    return result;
  }

  /** Give up waiting for the open checkout (the UI's "Cancel" while waiting). */
  cancelCheckout(): void {
    this.abort?.abort();
  }

  async restore(): Promise<Result> {
    const p = this.provider;
    if (!p) return fail('unavailable');
    try {
      const r = await p.restore();
      this.entitlements.tick();
      return r;
    } catch (err) {
      return fail('error', String(err));
    }
  }

  manageSubscription(): void {
    this.provider?.manageSubscription?.();
  }
}
