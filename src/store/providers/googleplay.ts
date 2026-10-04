/**
 * Google Play Billing (Android). Play policy: digital goods sold inside an app distributed on Play
 * must use Play Billing (15% service fee on the first 1M USD/yr with the 15% tier enrolment).
 *
 * Two bridges, tried in order:
 *  1. TWA (Bubblewrap, the plan's Android path): the Digital Goods API + Payment Request API
 *     (`window.getDigitalGoodsService('https://play.google.com/billing')`). Requires enabling
 *     "playBilling" in the Bubblewrap twa-manifest and the products in Play Console.
 *  2. Capacitor shell: a native plugin named `BiolumaBilling` (added by the platforms engineer),
 *     called through `window.Capacitor.nativePromise` like platforms/shared/platform.ts does.
 *     Expected methods (all return Promises):
 *       getProducts({ ids: string[] }) → { products: { id, price: string, currency, type }[] }
 *       purchase({ id, type: 'inapp'|'subs', obfuscatedAccountId }) → { purchaseToken, orderId } | { cancelled: true }
 *       restore() → { purchases: { id, purchaseToken }[] }
 *       manage({ id }) → void   (opens Play subscription center)
 *
 * Either way the purchase token goes to the server (Entitlements.verifyReceipt → integrator's
 * verifier → POST /api/store-receipt, not built yet). THE SERVER MUST verify the token with the
 * Play Developer API and ACKNOWLEDGE it within 3 days, or Google refunds the purchase automatically.
 * Product ids: catalog skuFor(item, 'googleplay') (the item id, e.g. 'palette.aurora'); the
 * subscription is one Play product 'sub.mecenas' with base plans 'month' and 'year'.
 */
import { ALL_ITEMS, itemById, isForSale, skuFor } from '../catalog';
import type { PaymentProvider, PlayerIdentity, ProviderContext, PurchaseOptions, Result } from './types';
import { fail, ok } from './types';

const PLAY_METHOD = 'https://play.google.com/billing';
const SUB_PRODUCT = 'sub.mecenas';

interface DGItemDetails {
  itemId: string;
  price: { currency: string; value: string };
  type?: 'product' | 'subscription';
}
interface DGService {
  getDetails(ids: string[]): Promise<DGItemDetails[]>;
  listPurchases(): Promise<{ itemId: string; purchaseToken: string }[]>;
}
interface CapLike {
  isNativePlatform?: () => boolean;
  nativePromise?: (plugin: string, method: string, options?: object) => Promise<unknown>;
}
type PlayWindow = Window & {
  getDigitalGoodsService?: (method: string) => Promise<DGService>;
  Capacitor?: CapLike;
};

export interface GooglePlayConfig {
  enabled: boolean;
  testMode: boolean;
  identity: PlayerIdentity | null;
  /** Play package name, for the subscription-center deep link. */
  packageName?: string;
}

/** Play product + base plan for a catalog item. */
export function playProductFor(itemId: string): { product: string; basePlan?: string; type: 'inapp' | 'subs' } | null {
  const item = itemById(itemId);
  if (!item) return null;
  if (item.kind === 'subscription') return { product: SUB_PRODUCT, basePlan: item.period, type: 'subs' };
  const sku = skuFor(item, 'googleplay');
  return typeof sku === 'string' ? { product: sku, type: 'inapp' } : null;
}

export class GooglePlayProvider implements PaymentProvider {
  readonly id = 'googleplay' as const;
  readonly label = { es: 'Pago con Google Play', en: 'Pay with Google Play' };
  readonly seller = { es: 'Pago procesado por Google Play.', en: 'Payment processed by Google Play.' };
  private prices = new Map<string, string>();
  private dg: DGService | null = null;

  constructor(
    private readonly ctx: ProviderContext,
    private readonly cfg: GooglePlayConfig,
  ) {}

  get testMode(): boolean {
    return this.cfg.testMode;
  }

  private get w(): PlayWindow | null {
    return typeof window === 'undefined' ? null : (window as PlayWindow);
  }

  private cap(): CapLike | null {
    const c = this.w?.Capacitor;
    return c?.isNativePlatform?.() && typeof c.nativePromise === 'function' ? c : null;
  }

  available(): boolean {
    if (!this.cfg.enabled || !this.cfg.identity) return false;
    return typeof this.w?.getDigitalGoodsService === 'function' || !!this.cap();
  }

  async prepare(): Promise<void> {
    try {
      const w = this.w;
      if (w?.getDigitalGoodsService) {
        this.dg = await w.getDigitalGoodsService(PLAY_METHOD);
        const ids = allPlayProducts();
        for (const d of await this.dg.getDetails(ids)) this.prices.set(d.itemId, formatPrice(d.price.value, d.price.currency));
        return;
      }
      const cap = this.cap();
      if (cap) {
        const r = (await cap.nativePromise!('BiolumaBilling', 'getProducts', { ids: allPlayProducts() })) as {
          products?: { id: string; price: string }[];
        };
        for (const p of r.products ?? []) this.prices.set(p.id, p.price);
      }
    } catch (err) {
      console.warn('[store] Play prices unavailable', err);
    }
  }

  priceLabel(itemId: string): string | null {
    const p = playProductFor(itemId);
    return p ? (this.prices.get(p.basePlan ? `${p.product}:${p.basePlan}` : p.product) ?? this.prices.get(p.product) ?? null) : null;
  }

  async purchase(itemId: string, opts: PurchaseOptions = {}): Promise<Result> {
    if (!this.available()) return fail('unavailable');
    const item = itemById(itemId);
    const prod = playProductFor(itemId);
    if (!item || !prod || !isForSale(item)) return fail('not_for_sale');
    if (opts.signal?.aborted) return fail('cancelled');
    let token: string | null = null;
    try {
      if (this.w?.getDigitalGoodsService && typeof PaymentRequest !== 'undefined') {
        const req = new PaymentRequest([{ supportedMethods: PLAY_METHOD, data: { sku: prod.product, ...(prod.basePlan ? { basePlanId: prod.basePlan } : {}) } }], {
          total: { label: 'Total', amount: { currency: 'USD', value: '0' } },
        });
        const res = await req.show();
        token = (res.details as { purchaseToken?: string }).purchaseToken ?? null;
        await res.complete(token ? 'success' : 'fail');
      } else {
        const cap = this.cap();
        if (!cap) return fail('unavailable');
        const r = (await cap.nativePromise!('BiolumaBilling', 'purchase', {
          id: prod.product,
          basePlan: prod.basePlan,
          type: prod.type,
          obfuscatedAccountId: await this.cfg.identity!.playerId(),
        })) as { purchaseToken?: string; cancelled?: boolean };
        if (r.cancelled) return fail('cancelled');
        token = r.purchaseToken ?? null;
      }
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === 'AbortError') return fail('cancelled');
      return fail('error', String(err));
    }
    if (!token) return fail('error', 'no purchase token');
    const before = new Set(this.ctx.entitlements.ownedIds());
    const verified = await this.ctx.entitlements.verifyReceipt({ provider: 'googleplay', itemId, token, extra: { product: prod.product, basePlan: prod.basePlan } });
    if (!verified) return fail('pending', 'purchase not verified yet');
    return ok(this.ctx.entitlements.ownedIds().filter((id) => !before.has(id)), itemId);
  }

  async restore(): Promise<Result> {
    if (!this.available()) return fail('unavailable');
    const before = new Set(this.ctx.entitlements.ownedIds());
    try {
      let purchases: { itemId: string; purchaseToken: string }[] = [];
      if (this.w?.getDigitalGoodsService) {
        this.dg ??= await this.w.getDigitalGoodsService(PLAY_METHOD);
        purchases = await this.dg.listPurchases();
      } else {
        const r = (await this.cap()?.nativePromise?.('BiolumaBilling', 'restore', {})) as { purchases?: { id: string; purchaseToken: string }[] } | undefined;
        purchases = (r?.purchases ?? []).map((p) => ({ itemId: p.id, purchaseToken: p.purchaseToken }));
      }
      for (const p of purchases) await this.ctx.entitlements.verifyReceipt({ provider: 'googleplay', token: p.purchaseToken, extra: { product: p.itemId } });
      const snap = await this.ctx.fetchSnapshot?.();
      if (snap) this.ctx.entitlements.applyServerSnapshot(snap);
    } catch (err) {
      return fail('network', String(err));
    }
    return ok(this.ctx.entitlements.ownedIds().filter((id) => !before.has(id)));
  }

  manageSubscription(): void {
    const cap = this.cap();
    if (cap) {
      void cap.nativePromise!('BiolumaBilling', 'manage', { id: SUB_PRODUCT }).catch(() => undefined);
      return;
    }
    const pkg = this.cfg.packageName ? `&package=${encodeURIComponent(this.cfg.packageName)}` : '';
    const url = `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(SUB_PRODUCT)}${pkg}`;
    if (this.ctx.openExternal) this.ctx.openExternal(url);
    else window.open(url, '_blank', 'noopener');
  }
}

/** Every Play product id the catalog sells (subscription product once). */
function allPlayProducts(): string[] {
  const out = new Set<string>();
  for (const it of ALL_ITEMS) {
    if (!isForSale(it)) continue;
    const p = playProductFor(it.id);
    if (p) out.add(p.product);
  }
  return [...out];
}

function formatPrice(value: string, currency: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return `${currency} ${value}`;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${value}`;
  }
}
