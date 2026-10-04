/**
 * Apple App Store (iOS via Capacitor) — STUB. Not in the current budget (Apple Developer Program is
 * 99 USD/year and needs a Mac); kept so the store has a slot ready when iOS happens.
 *
 * Rules to remember: App Review guideline 3.1.1 requires In-App Purchase for digital goods and
 * cosmetics inside an iOS app; the Small Business Program cuts the fee to 15% (first 1M USD/yr).
 * Since 2025 US-storefront apps may also link out to web checkout (guideline 3.1.1(a) update), but
 * keep IAP as the default path.
 *
 * Expected native plugin (added by the platforms engineer), StoreKit 2 under the hood:
 *   BiolumaStoreKit.getProducts({ ids }) → { products: { id, displayPrice }[] }
 *   BiolumaStoreKit.purchase({ id, appAccountToken }) → { jwsTransaction } | { cancelled: true } | { pending: true }
 *   BiolumaStoreKit.restore() → { transactions: string[] }     // AppStore.sync() + currentEntitlements
 *   BiolumaStoreKit.manage() → void                             // showManageSubscriptions
 * `jwsTransaction` goes to the server, which verifies the JWS with Apple's root certificates (or the
 * App Store Server API) and listens to App Store Server Notifications v2 for renewals/refunds.
 * `appAccountToken` must be a UUID: derive it from the player id.
 * Product ids: catalog skuFor(item, 'apple') = "bioluma." + item id.
 */
import { ALL_ITEMS, itemById, isForSale, skuFor } from '../catalog';
import type { PaymentProvider, PlayerIdentity, ProviderContext, PurchaseOptions, Result } from './types';
import { fail, ok } from './types';

interface CapLike {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  nativePromise?: (plugin: string, method: string, options?: object) => Promise<unknown>;
}

export interface AppleConfig {
  enabled: boolean;
  testMode: boolean;
  identity: PlayerIdentity | null;
}

const PLUGIN = 'BiolumaStoreKit';

export class AppleProvider implements PaymentProvider {
  readonly id = 'apple' as const;
  readonly label = { es: 'Pago con el App Store', en: 'Pay with the App Store' };
  readonly seller = { es: 'Pago procesado por Apple.', en: 'Payment processed by Apple.' };
  private prices = new Map<string, string>();

  constructor(
    private readonly ctx: ProviderContext,
    private readonly cfg: AppleConfig,
  ) {}

  get testMode(): boolean {
    return this.cfg.testMode;
  }

  private cap(): CapLike | null {
    if (typeof window === 'undefined') return null;
    const c = (window as Window & { Capacitor?: CapLike }).Capacitor;
    return c?.isNativePlatform?.() && c.getPlatform?.() === 'ios' && typeof c.nativePromise === 'function' ? c : null;
  }

  available(): boolean {
    return this.cfg.enabled && !!this.cfg.identity && !!this.cap();
  }

  async prepare(): Promise<void> {
    const cap = this.cap();
    if (!cap) return;
    try {
      const ids = ALL_ITEMS.filter(isForSale).map((i) => String(skuFor(i, 'apple')));
      const r = (await cap.nativePromise!(PLUGIN, 'getProducts', { ids })) as { products?: { id: string; displayPrice: string }[] };
      for (const p of r.products ?? []) this.prices.set(p.id, p.displayPrice);
    } catch {
      /* plugin missing */
    }
  }

  priceLabel(itemId: string): string | null {
    const it = itemById(itemId);
    return it ? (this.prices.get(String(skuFor(it, 'apple'))) ?? null) : null;
  }

  async purchase(itemId: string, opts: PurchaseOptions = {}): Promise<Result> {
    const cap = this.cap();
    if (!this.available() || !cap) return fail('unavailable');
    const item = itemById(itemId);
    if (!item || !isForSale(item)) return fail('not_for_sale');
    if (opts.signal?.aborted) return fail('cancelled');
    try {
      const r = (await cap.nativePromise!(PLUGIN, 'purchase', {
        id: skuFor(item, 'apple'),
        appAccountToken: await this.cfg.identity!.playerId(),
      })) as { jwsTransaction?: string; cancelled?: boolean; pending?: boolean };
      if (r.cancelled) return fail('cancelled');
      if (r.pending || !r.jwsTransaction) return fail('pending'); // Ask to Buy / SCA
      const before = new Set(this.ctx.entitlements.ownedIds());
      const okv = await this.ctx.entitlements.verifyReceipt({ provider: 'apple', itemId, token: r.jwsTransaction });
      return okv ? ok(this.ctx.entitlements.ownedIds().filter((id) => !before.has(id)), itemId) : fail('pending');
    } catch (err) {
      return fail('error', String(err));
    }
  }

  async restore(): Promise<Result> {
    const cap = this.cap();
    if (!this.available() || !cap) return fail('unavailable');
    const before = new Set(this.ctx.entitlements.ownedIds());
    try {
      const r = (await cap.nativePromise!(PLUGIN, 'restore', {})) as { transactions?: string[] };
      for (const jws of r.transactions ?? []) await this.ctx.entitlements.verifyReceipt({ provider: 'apple', token: jws });
    } catch (err) {
      return fail('network', String(err));
    }
    return ok(this.ctx.entitlements.ownedIds().filter((id) => !before.has(id)));
  }

  manageSubscription(): void {
    void this.cap()?.nativePromise?.(PLUGIN, 'manage', {}).catch(() => undefined);
  }
}

