import { describe, expect, it } from 'vitest';
import { PALETTES } from './catalog';
import { Entitlements } from './entitlements';
import { STORE_ENABLED, resolveStoreFlags } from './flags';
import { createProviders, DevMockProvider, LemonSqueezyProvider, playProductFor } from './providers';
import { StoreController } from './store';

const DAY = 86_400_000;

function setup(search = '?store=mock', clock = { t: Date.UTC(2026, 10, 10) }) {
  const flags = resolveStoreFlags({ hostname: 'bioluma.example', search });
  const entitlements = new Entitlements({ storage: null, now: () => clock.t });
  const providers = createProviders(flags, { entitlements, now: () => clock.t }, { devmock: { latencyMs: 1 } });
  return { flags, entitlements, providers, store: new StoreController(flags, entitlements, providers, () => clock.t), clock };
}

describe('store flags', () => {
  it('ships with payments off', () => {
    expect(STORE_ENABLED).toBe(false);
    const f = resolveStoreFlags({ hostname: 'bioluma.example' });
    expect(f.visible).toBe(false);
    expect(f.payments).toBe(false);
    expect(f.wardrobe).toBe(true); // free cosmetics still work
  });

  it('never shows the store on game portals, not even the mock', () => {
    for (const input of [
      { hostname: 'galaxy.click', storeEnabled: true, search: '?store=mock' },
      { buildTarget: 'galaxy', hostname: 'bioluma.example', storeEnabled: true },
      { platform: { kind: 'web', os: 'android', portal: 'galaxy', steam: false }, storeEnabled: true },
      { hostname: 'html-classic.itch.zone', storeEnabled: true, search: '?store=mock' },
      { hostname: 'www.crazygames.com', storeEnabled: true },
    ]) {
      const f = resolveStoreFlags(input);
      expect(f.visible, JSON.stringify(input)).toBe(false);
      expect(f.providers).toEqual([]);
    }
  });

  it('uses the mock in dev and with ?store=mock; ?store=off hides', () => {
    expect(resolveStoreFlags({ isDev: true, hostname: 'localhost' })).toMatchObject({ visible: true, mock: true, payments: false, providers: ['devmock'] });
    expect(resolveStoreFlags({ hostname: 'bioluma.example', search: '?store=mock' })).toMatchObject({ visible: true, mock: true });
    expect(resolveStoreFlags({ hostname: 'bioluma.example', search: '?store=off', storeEnabled: true }).visible).toBe(false);
  });

  it('takes live payments only on cleared hosts once enabled', () => {
    expect(resolveStoreFlags({ hostname: 'bioluma.example', storeEnabled: true })).toMatchObject({ visible: true, payments: true, providers: ['lemonsqueezy'] });
    // Vercel Hobby preview: test mode only.
    expect(resolveStoreFlags({ hostname: 'bioluma-git-x.vercel.app', storeEnabled: true })).toMatchObject({ payments: false, testMode: true });
    expect(resolveStoreFlags({ platform: { kind: 'twa', os: 'android', portal: null, steam: false }, storeEnabled: true })).toMatchObject({
      host: 'android',
      payments: true,
      providers: ['googleplay'],
    });
    expect(resolveStoreFlags({ platform: { kind: 'electron', os: 'windows', portal: null, steam: true }, storeEnabled: true }).providers).toEqual(['steam']);
    expect(resolveStoreFlags({ platform: { kind: 'capacitor', os: 'ios', portal: null, steam: false }, storeEnabled: true }).visible).toBe(false);
    expect(resolveStoreFlags({ platform: { kind: 'capacitor', os: 'ios', portal: null, steam: false }, storeEnabled: true, hostPayments: { ios: true } }).payments).toBe(true);
  });

  it('creates no providers when the store is hidden', () => {
    const flags = resolveStoreFlags({ hostname: 'bioluma.example' });
    const ent = new Entitlements({ storage: null });
    expect(createProviders(flags, { entitlements: ent }, { devmock: {} })).toEqual([]);
    const store = new StoreController(flags, ent, []);
    expect(store.visible).toBe(false);
    expect(store.canBuy('palette.aurora')).toEqual({ ok: false, reason: 'disabled' });
  });
});

describe('dev mock flow', () => {
  it('buys a cosmetic instantly and refuses to sell it twice', async () => {
    const { store, entitlements, providers } = setup();
    expect(providers.map((p) => p.id)).toEqual(['devmock']);
    expect(store.provider?.testMode).toBe(true);
    expect(store.canBuy('palette.aurora')).toEqual({ ok: true });
    const r = await store.buy('palette.aurora');
    expect(r).toMatchObject({ ok: true, granted: ['palette.aurora'] });
    expect(entitlements.ownedRecord('palette.aurora')?.source).toBe('dev');
    expect(store.canBuy('palette.aurora')).toEqual({ ok: false, reason: 'owned' });
    expect(await store.buy('palette.aurora')).toMatchObject({ ok: false, reason: 'owned' });
  });

  it('does not sell free, achievement or exclusive items', async () => {
    const { store } = setup();
    for (const id of ['palette.bioluma', 'palette.mono', 'badge.mecenas', 'dish.brass', 'palette.mecenas.2026-11', 'missing']) {
      expect(store.canBuy(id), id).toEqual({ ok: false, reason: 'not_for_sale' });
    }
  });

  it('subscribes, unlocks supporter cosmetics and cancels through manage', async () => {
    const { store, entitlements, clock } = setup();
    expect((await store.buy('sub.mecenas.month')).ok).toBe(true);
    expect(entitlements.isSubscriber()).toBe(true);
    expect(entitlements.equip('badge.mecenas')).toBe(true);
    expect(store.canBuy('sub.mecenas.year')).toEqual({ ok: false, reason: 'owned' });
    clock.t += 31 * DAY;
    expect(entitlements.isSubscriber()).toBe(false);
    expect(entitlements.equippedId('badge')).toBe('badge.none');
    await store.buy('sub.mecenas.year');
    expect(entitlements.subscription()?.plan).toBe('year');
    store.manageSubscription();
    expect(entitlements.isSubscriber()).toBe(false);
  });

  it('gates early-access items to supporters', async () => {
    const { store, entitlements, clock } = setup();
    const item = PALETTES.find((p) => p.id === 'palette.sakura')!;
    const saved = item.earlyAccessUntil;
    item.earlyAccessUntil = new Date(clock.t + 14 * DAY).toISOString();
    try {
      expect(store.canBuy('palette.sakura')).toEqual({ ok: false, reason: 'early_access' });
      await store.buy('sub.mecenas.month');
      expect(store.canBuy('palette.sakura')).toEqual({ ok: true });
      entitlements.setSubscription(null);
      clock.t += 15 * DAY;
      expect(store.canBuy('palette.sakura')).toEqual({ ok: true });
    } finally {
      item.earlyAccessUntil = saved;
    }
  });

  it('reports cancellations and allows one checkout at a time', async () => {
    const { store, providers } = setup();
    (providers[0] as DevMockProvider).failNext = 'cancelled';
    expect(await store.buy('halo.hex')).toMatchObject({ ok: false, reason: 'cancelled' });
    const a = store.buy('halo.hex');
    expect(store.busyItem).toBe('halo.hex');
    expect(await store.buy('halo.petals')).toMatchObject({ ok: false, reason: 'error' });
    expect((await a).ok).toBe(true);
    expect(store.busyItem).toBeNull();
    expect((await store.restore()).ok).toBe(true);
  });

  it('shows USD reference prices', () => {
    const { store } = setup();
    expect(store.priceLabel('palette.aurora', 'es')).toBe('US$ 2,99');
    expect(store.priceLabel('bundle.founder', 'en')).toBe('US$9.99');
    expect(store.priceLabel('palette.mono', 'en')).toBeNull();
  });
});

describe('provider details', () => {
  it('Lemon Squeezy checkout URL carries the player id as custom data', async () => {
    const ent = new Entitlements({ storage: null });
    const ls = new LemonSqueezyProvider(
      { entitlements: ent, fetchSnapshot: async () => null },
      {
        enabled: true,
        testMode: true,
        store: 'bioluma',
        checkouts: { 'palette.aurora': '1f2e3d4c-aaaa-bbbb-cccc-0123456789ab' },
        identity: { playerId: async () => '0123456789abcdef-0123', publicKey: async () => 'k', sign: async () => 's' },
      },
    );
    const url = new URL((await ls.checkoutUrl('palette.aurora'))!);
    expect(url.origin).toBe('https://bioluma.lemonsqueezy.com');
    expect(url.pathname).toBe('/buy/1f2e3d4c-aaaa-bbbb-cccc-0123456789ab');
    expect(url.searchParams.get('checkout[custom][player_id]')).toBe('0123456789abcdef-0123');
    expect(url.searchParams.get('embed')).toBe('1');
    expect(await ls.checkoutUrl('palette.ember')).toBeNull(); // no link configured
  });

  it('maps catalog items to Play products and base plans', () => {
    expect(playProductFor('palette.aurora')).toEqual({ product: 'palette.aurora', type: 'inapp' });
    expect(playProductFor('sub.mecenas.year')).toEqual({ product: 'sub.mecenas', basePlan: 'year', type: 'subs' });
  });
});
