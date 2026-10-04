/**
 * DEV MOCK — FAKE PURCHASES, NO MONEY. Enabled only by flags.mock (vite dev or ?store=mock).
 * Grants instantly with source 'dev', so a later server snapshot never removes or confuses them,
 * and they never reach the ranking (the server does not know about them).
 */
import { itemById, isForSale } from '../catalog';
import type { PaymentProvider, ProviderContext, PurchaseOptions, Result } from './types';
import { fail, ok } from './types';

export interface DevMockOptions {
  /** Must be true (flags.mock); otherwise available() is false. */
  enabled: boolean;
  /** Simulated latency in ms (default 450) so the UI's busy states are visible. */
  latencyMs?: number;
  /** Subscription length; default 30 / 365 days. Use a few minutes to test expiry. */
  subscriptionMs?: { month: number; year: number };
  /** Make the next purchase fail with this reason (UI testing). */
  failNext?: 'cancelled' | 'network' | 'pending' | null;
}

const DAY = 86_400_000;

export class DevMockProvider implements PaymentProvider {
  readonly id = 'devmock' as const;
  readonly label = { es: 'Tienda de prueba (compras falsas)', en: 'Test store (fake purchases)' };
  readonly seller = { es: 'Modo prueba: no se cobra dinero real.', en: 'Test mode: no real money is charged.' };
  readonly testMode = true;
  failNext: DevMockOptions['failNext'];

  constructor(
    private readonly ctx: ProviderContext,
    private readonly opts: DevMockOptions,
  ) {
    this.failNext = opts.failNext ?? null;
  }

  available(): boolean {
    return this.opts.enabled;
  }

  private wait(signal?: AbortSignal): Promise<boolean> {
    const ms = this.opts.latencyMs ?? 450;
    return new Promise((resolve) => {
      if (signal?.aborted) return resolve(false);
      const t = setTimeout(() => resolve(true), ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(t);
        resolve(false);
      });
    });
  }

  async purchase(itemId: string, opts: PurchaseOptions = {}): Promise<Result> {
    if (!this.available()) return fail('disabled');
    const item = itemById(itemId);
    if (!item || !isForSale(item)) return fail('not_for_sale');
    if (!(await this.wait(opts.signal))) return fail('cancelled');
    const forced = this.failNext;
    if (forced) {
      this.failNext = null;
      return fail(forced, 'devmock forced failure');
    }
    const ent = this.ctx.entitlements;
    if (item.kind === 'subscription') {
      const now = this.ctx.now?.() ?? Date.now();
      const len = item.period === 'year' ? (this.opts.subscriptionMs?.year ?? 365 * DAY) : (this.opts.subscriptionMs?.month ?? 30 * DAY);
      const prev = ent.subscription();
      ent.setSubscription({
        plan: item.period,
        status: 'active',
        expiresAt: Math.max(now, prev?.expiresAt ?? 0) + len,
        willRenew: true,
        provider: 'devmock',
        since: prev?.since ?? now,
      });
      return ok([], itemId);
    }
    if (ent.isOwned(itemId)) return fail('owned');
    const granted = ent.grant(itemId, 'dev', { provider: 'devmock' });
    return ok(granted, itemId);
  }

  async restore(): Promise<Result> {
    if (!this.available()) return fail('disabled');
    await this.wait();
    return ok([]);
  }

  manageSubscription(): void {
    // The mock has no portal: cancelling ends the subscription now.
    const sub = this.ctx.entitlements.subscription();
    if (sub) this.ctx.entitlements.setSubscription({ ...sub, willRenew: false, status: 'cancelled', expiresAt: this.ctx.now?.() ?? Date.now() });
  }

  priceLabel(): string | null {
    return null; // catalog USD prices
  }
}
