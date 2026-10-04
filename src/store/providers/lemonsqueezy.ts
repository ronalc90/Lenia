/**
 * Lemon Squeezy (web). Merchant of Record: Lemon Squeezy is the legal seller, collects and remits
 * VAT/sales tax worldwide and pays out to Colombia (bank/PayPal payouts), so the owner does not
 * register for foreign taxes. Fee: 5% + 0.50 USD per order (check current pricing).
 *
 * Flow:
 *   1. purchase(item) opens the hosted checkout of the item's variant in the lemon.js overlay
 *      (or a new tab), passing the player id as custom data:
 *        https://<store>.lemonsqueezy.com/buy/<variant-uuid>?embed=1&checkout[custom][player_id]=<id>
 *   2. Lemon Squeezy calls our webhook (api/store-webhook.ts), which verifies the HMAC signature and
 *      grants the item to that player id. THE CLIENT NEVER GRANTS.
 *   3. After "Checkout.Success" (overlay event) or when the player comes back to the tab, we poll the
 *      signed GET /api/entitlements until the item shows up, then apply the snapshot.
 *
 * Third-party script: lemon.js is loaded lazily from app.lemonsqueezy.com only when the player opens
 * a checkout (never on page load, never when the store is disabled). Not an npm dependency.
 */
import { itemById, isForSale } from '../catalog';
import type { ServerSnapshot } from '../protocol';
import type { PaymentProvider, PlayerIdentity, ProviderContext, PurchaseOptions, Result } from './types';
import { fail, ok } from './types';

export interface LemonSqueezyConfig {
  /** Allowed by flags (payments or testMode). */
  enabled: boolean;
  testMode: boolean;
  /** Store subdomain: 'bioluma' → https://bioluma.lemonsqueezy.com. */
  store: string;
  /**
   * itemId → checkout link id (the UUID in the variant's "Share" checkout URL). Test-mode and live
   * links differ. Items without a link are not purchasable here.
   */
  checkouts: Record<string, string>;
  identity: PlayerIdentity | null;
  /** Use the lemon.js overlay (default true); false opens a new tab. */
  overlay?: boolean;
  lemonJsUrl?: string;
  /** Snapshot polling after checkout. */
  pollEveryMs?: number;
  pollForMs?: number;
}

interface LemonJs {
  Setup(o: { eventHandler: (e: { event: string; data?: unknown }) => void }): void;
  Url: { Open(url: string): void; Close(): void };
}
type LemonWindow = Window & { LemonSqueezy?: LemonJs; createLemonSqueezy?: () => void };

const DEFAULT_LEMON_JS = 'https://app.lemonsqueezy.com/js/lemon.js';
const MY_ORDERS = 'https://app.lemonsqueezy.com/my-orders';

export class LemonSqueezyProvider implements PaymentProvider {
  readonly id = 'lemonsqueezy' as const;
  readonly label = { es: 'Pago seguro con Lemon Squeezy', en: 'Secure checkout by Lemon Squeezy' };
  readonly seller = {
    es: 'Vendedor: Lemon Squeezy (Merchant of Record). Impuestos incluidos según tu país.',
    en: 'Seller: Lemon Squeezy (Merchant of Record). Taxes handled for your country.',
  };
  private lemon: Promise<LemonJs | null> | null = null;
  private onSuccess: (() => void) | null = null;

  constructor(
    private readonly ctx: ProviderContext,
    private readonly cfg: LemonSqueezyConfig,
  ) {}

  get testMode(): boolean {
    return this.cfg.testMode;
  }

  available(): boolean {
    return this.cfg.enabled && !!this.cfg.identity && !!this.ctx.fetchSnapshot && /^[a-z0-9-]+$/.test(this.cfg.store) && typeof window !== 'undefined';
  }

  /** The checkout URL for an item (exposed for tests and the docs). */
  async checkoutUrl(itemId: string): Promise<string | null> {
    const slug = this.cfg.checkouts[itemId];
    if (!slug || !this.cfg.identity || !/^[A-Za-z0-9-]+$/.test(slug)) return null;
    const pid = await this.cfg.identity.playerId();
    const u = new URL(`https://${this.cfg.store}.lemonsqueezy.com/buy/${slug}`);
    if (this.cfg.overlay !== false) u.searchParams.set('embed', '1');
    u.searchParams.set('media', '0');
    u.searchParams.set('checkout[custom][player_id]', pid);
    // Informational only: the webhook trusts the variant id, never this field.
    u.searchParams.set('checkout[custom][item_id]', itemId);
    return u.toString();
  }

  async purchase(itemId: string, opts: PurchaseOptions = {}): Promise<Result> {
    if (!this.available()) return fail('unavailable');
    const item = itemById(itemId);
    if (!item || !isForSale(item)) return fail('not_for_sale');
    if (item.kind !== 'subscription' && this.ctx.entitlements.isOwned(itemId)) return fail('owned');
    const url = await this.checkoutUrl(itemId);
    if (!url) return fail('not_for_sale', 'no checkout link configured');
    if (opts.signal?.aborted) return fail('cancelled');

    const success = new Promise<'success' | 'focus' | 'abort'>((resolve) => {
      this.onSuccess = () => resolve('success');
      opts.signal?.addEventListener('abort', () => resolve('abort'));
      if (this.cfg.overlay === false) {
        // New-tab flow: when the player comes back, check the server.
        const onFocus = () => {
          if (document.visibilityState === 'visible') {
            window.removeEventListener('focus', onFocus);
            resolve('focus');
          }
        };
        setTimeout(() => window.addEventListener('focus', onFocus), 800);
      }
    });

    const lemon = this.cfg.overlay === false ? null : await this.loadLemon();
    if (lemon) lemon.Url.Open(url);
    else if (!window.open(url, '_blank', 'noopener')) return fail('error', 'popup blocked');

    const how = await success;
    this.onSuccess = null;
    if (how === 'abort') {
      try {
        lemon?.Url.Close();
      } catch {
        /* overlay already gone */
      }
      return fail('cancelled');
    }
    const want = item.kind === 'bundle' ? item.contains : item.kind === 'subscription' ? [] : [itemId];
    const granted = await this.pollUntil(item.kind === 'subscription' ? 'subscription' : want, opts.signal);
    if (granted) return ok(granted, itemId);
    // Paid but the webhook has not arrived (or a slow payment method): tell the UI to restore later.
    return how === 'success' ? fail('pending') : fail('cancelled');
  }

  /** Poll the server until the items (or an active subscription) appear. Returns granted ids or null. */
  private async pollUntil(want: string[] | 'subscription', signal?: AbortSignal): Promise<string[] | null> {
    const every = this.cfg.pollEveryMs ?? 2000;
    const until = Date.now() + (this.cfg.pollForMs ?? 45_000);
    const ent = this.ctx.entitlements;
    const before = new Set(ent.ownedIds());
    while (Date.now() < until && !signal?.aborted) {
      const snap: ServerSnapshot | null = (await this.ctx.fetchSnapshot?.()) ?? null;
      if (snap) {
        ent.applyServerSnapshot(snap);
        const done = want === 'subscription' ? ent.isSubscriber() : want.every((id) => ent.isOwned(id));
        if (done) return ent.ownedIds().filter((id) => !before.has(id));
      }
      await new Promise((r) => setTimeout(r, every));
    }
    return null;
  }

  async restore(): Promise<Result> {
    if (!this.available()) return fail('unavailable');
    const ent = this.ctx.entitlements;
    const before = new Set(ent.ownedIds());
    const snap = await this.ctx.fetchSnapshot?.();
    if (!snap) return fail('network');
    ent.applyServerSnapshot(snap);
    return ok(ent.ownedIds().filter((id) => !before.has(id)));
  }

  manageSubscription(): void {
    const url = this.ctx.entitlements.subscription()?.manageUrl ?? MY_ORDERS;
    if (this.ctx.openExternal) this.ctx.openExternal(url);
    else window.open(url, '_blank', 'noopener');
  }

  priceLabel(): string | null {
    return null; // Lemon Squeezy localises at checkout; the store shows the USD reference price.
  }

  private loadLemon(): Promise<LemonJs | null> {
    if (!this.lemon) {
      this.lemon = new Promise<LemonJs | null>((resolve) => {
        const w = window as LemonWindow;
        const ready = () => {
          try {
            w.createLemonSqueezy?.();
            const L = w.LemonSqueezy ?? null;
            L?.Setup({
              eventHandler: (e) => {
                if (e.event === 'Checkout.Success') this.onSuccess?.();
              },
            });
            resolve(L);
          } catch {
            resolve(null);
          }
        };
        if (w.LemonSqueezy) return ready();
        const s = document.createElement('script');
        s.src = this.cfg.lemonJsUrl ?? DEFAULT_LEMON_JS;
        s.defer = true;
        s.onload = ready;
        s.onerror = () => {
          this.lemon = null; // retry next time; this purchase falls back to a new tab
          resolve(null);
        };
        document.head.appendChild(s);
      });
    }
    return this.lemon;
  }
}
