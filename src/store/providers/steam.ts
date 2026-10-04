/**
 * Steam (Electron build). Valve requires Steam's own payment for anything sold inside a Steam
 * build; the 30% revenue share applies. We sell cosmetics as DLC (one app id per item or pack),
 * which needs no publisher server for the purchase itself: the Steam overlay store sells it, the
 * Steam client reports ownership. Subscriptions are not offered on Steam (Valve's recurring
 * microtransactions need special approval), so the Mecenas card hides there.
 *
 * Bridge: the Electron preload (platforms/desktop/preload.cjs, owned by the platforms engineer)
 * must add to `window.bioluma_platform`:
 *
 *   steamStore?: {
 *     ownedDlc(appIds: number[]): Promise<number[]>;     // steamworks.js apps.isDlcInstalled()
 *     openDlcStore(appId: number): Promise<boolean>;     // overlay.activateToStore(appId, AddToCartAndShow)
 *     onDlcInstalled?(cb: (appId: number) => void): () => void;  // DlcInstalled_t callback
 *     authTicket?(): Promise<string>;                     // for server-side ownership checks
 *   }
 *
 * DLC app ids come from the catalog (`skus.steam`) or the `dlc` config map. Ownership is reported by
 * the local Steam client; if a receipt verifier is configured we pass it an auth ticket so the server
 * can confirm with ISteamUser/CheckAppOwnership (needed before showing anything in the ranking).
 */
import { ALL_ITEMS, itemById, isForSale } from '../catalog';
import type { PaymentProvider, ProviderContext, PurchaseOptions, Result } from './types';
import { fail, ok } from './types';

export interface SteamStoreBridge {
  ownedDlc(appIds: number[]): Promise<number[]>;
  openDlcStore(appId: number): Promise<boolean>;
  onDlcInstalled?(cb: (appId: number) => void): () => void;
  authTicket?(): Promise<string>;
}

type SteamWindow = Window & { bioluma_platform?: { kind?: string; steam?: boolean; steamStore?: SteamStoreBridge } };

export interface SteamConfig {
  enabled: boolean;
  /** itemId → DLC app id (overrides catalog skus.steam). */
  dlc?: Record<string, number>;
  /** How long to wait for the purchase to show up after the overlay opens. */
  waitForMs?: number;
}

export class SteamProvider implements PaymentProvider {
  readonly id = 'steam' as const;
  readonly label = { es: 'Compra en la tienda de Steam', en: 'Buy on the Steam store' };
  readonly seller = { es: 'Vendedor: Valve (Steam).', en: 'Seller: Valve (Steam).' };
  readonly testMode = false;

  constructor(
    private readonly ctx: ProviderContext,
    private readonly cfg: SteamConfig,
  ) {}

  private bridge(): SteamStoreBridge | null {
    if (typeof window === 'undefined') return null;
    const b = (window as SteamWindow).bioluma_platform;
    return b?.kind === 'electron' && b.steam && b.steamStore ? b.steamStore : null;
  }

  private appIdFor(itemId: string): number | null {
    const fromCfg = this.cfg.dlc?.[itemId];
    if (fromCfg) return fromCfg;
    const s = itemById(itemId)?.skus?.steam;
    return typeof s === 'number' ? s : null;
  }

  available(): boolean {
    return this.cfg.enabled && !!this.bridge();
  }

  async purchase(itemId: string, opts: PurchaseOptions = {}): Promise<Result> {
    const b = this.bridge();
    if (!this.cfg.enabled || !b) return fail('unavailable');
    const item = itemById(itemId);
    if (!item || !isForSale(item) || item.kind === 'subscription') return fail('not_for_sale');
    const appId = this.appIdFor(itemId);
    if (!appId) return fail('not_for_sale', 'no DLC app id');
    if (!(await b.openDlcStore(appId))) return fail('error', 'overlay unavailable');
    const until = Date.now() + (this.cfg.waitForMs ?? 120_000);
    while (Date.now() < until && !opts.signal?.aborted) {
      const owned: number[] = await b.ownedDlc([appId]).catch(() => [] as number[]);
      if (owned.includes(appId)) {
        const r = await this.restore();
        return r.ok ? ok(r.granted, itemId) : r;
      }
      await new Promise((res) => setTimeout(res, 1500));
    }
    return fail(opts.signal?.aborted ? 'cancelled' : 'pending');
  }

  async restore(): Promise<Result> {
    const b = this.bridge();
    if (!this.cfg.enabled || !b) return fail('unavailable');
    const map = new Map<number, string>();
    for (const id of Object.keys(this.cfg.dlc ?? {})) map.set(this.cfg.dlc![id], id);
    // Catalog skus.steam too.
    for (const id of catalogSteamItems()) {
      const a = this.appIdFor(id);
      if (a) map.set(a, id);
    }
    if (!map.size) return ok([]);
    const owned = await b.ownedDlc([...map.keys()]).catch(() => null);
    if (!owned) return fail('network');
    const ids = owned.map((a) => map.get(a)).filter((x): x is string => !!x);
    const ent = this.ctx.entitlements;
    // Server confirmation when available (needed for anything other players see).
    const ticket = await b.authTicket?.().catch(() => undefined);
    if (ticket && (await ent.verifyReceipt({ provider: 'steam', token: ticket, extra: { dlc: owned } }))) {
      return ok(ids.filter((id) => ent.isOwned(id)));
    }
    // Local fallback: Steam's own ownership report, visible only on this machine.
    return ok(ent.grant(ids, 'grant', { provider: 'steam' }));
  }
}

function catalogSteamItems(): string[] {
  return ALL_ITEMS.filter((i) => typeof i.skus?.steam === 'number').map((i) => i.id);
}
