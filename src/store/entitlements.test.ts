import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ITEM, SLOTS, supporterPaletteFor } from './catalog';
import { Entitlements, STORE_STORAGE_KEY, type StorageLike, type SubscriptionState } from './entitlements';
import type { ServerSnapshot } from './protocol';

class MemStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
}

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 10); // 2026-11-10

function make(storage: StorageLike | null = new MemStorage(), clock = { t: T0 }) {
  return { ent: new Entitlements({ storage, now: () => clock.t }), clock, storage };
}

function sub(expiresAt: number, extra: Partial<SubscriptionState> = {}): SubscriptionState {
  return { plan: 'month', status: 'active', expiresAt, willRenew: true, provider: 'devmock', since: T0, ...extra };
}

describe('ownership and equipment', () => {
  it('owns every slot default and nothing paid at start', () => {
    const { ent } = make();
    for (const s of SLOTS) {
      expect(ent.isOwned(DEFAULT_ITEM[s])).toBe(true);
      expect(ent.equippedId(s)).toBe(DEFAULT_ITEM[s]);
    }
    expect(ent.isOwned('palette.aurora')).toBe(false);
    expect(ent.isOwned('badge.mecenas')).toBe(false);
    expect(ent.isOwned('nope')).toBe(false);
  });

  it('equips only owned items, in their own slot', () => {
    const { ent } = make();
    expect(ent.equip('palette.aurora')).toBe(false);
    expect(ent.equippedId('palette')).toBe('palette.bioluma');
    ent.grant('palette.aurora', 'purchase');
    expect(ent.equip('palette.aurora')).toBe(true);
    expect(ent.equippedId('palette')).toBe('palette.aurora');
    expect(ent.listEquipped().palette.id).toBe('palette.aurora');
    expect(ent.equip('bundle.founder')).toBe(false); // not a cosmetic
    ent.unequip('palette');
    expect(ent.equippedId('palette')).toBe('palette.bioluma');
  });

  it('expands bundles into their contents', () => {
    const { ent } = make();
    const added = ent.grant('bundle.founder', 'purchase');
    expect(added).toContain('badge.founder');
    expect(added).toContain('dish.brass');
    expect(ent.ownedRecord('dish.brass')?.source).toBe('bundle');
    expect(ent.isOwned('bundle.founder')).toBe(true);
    expect(ent.equip('dish.brass')).toBe(true);
  });

  it('emits `changed` on grants and equips', () => {
    const { ent } = make();
    const fn = vi.fn();
    ent.on('changed', fn);
    ent.grant('trail.stars', 'purchase');
    ent.equip('trail.stars');
    ent.equip('trail.stars'); // no-op
    expect(fn.mock.calls.map((c) => c[0].reason)).toEqual(['grant', 'equip']);
  });

  it('grants achievement cosmetics and never revokes them', () => {
    const { ent } = make();
    expect(ent.syncAchievements(['species10', 'golden10', 'unknownAchievement'])).toEqual(['palette.mono', 'palette.glacier']);
    expect(ent.syncAchievements(['species10'])).toEqual([]);
    expect(ent.revoke('palette.mono')).toEqual([]);
    expect(ent.isOwned('palette.mono')).toBe(true);
  });
});

describe('persistence', () => {
  it('survives a reload and ignores garbage', () => {
    const storage = new MemStorage();
    const a = make(storage).ent;
    a.grant('palette.ember', 'purchase');
    a.equip('palette.ember');
    const b = make(storage).ent;
    expect(b.isOwned('palette.ember')).toBe(true);
    expect(b.equippedId('palette')).toBe('palette.ember');

    storage.setItem(STORE_STORAGE_KEY, '{not json');
    expect(make(storage).ent.equippedId('palette')).toBe('palette.bioluma');

    storage.setItem(
      STORE_STORAGE_KEY,
      JSON.stringify({ v: 1, owned: { 'palette.fake': { source: 'purchase', at: 1 }, 'halo.petals': { source: 'hacked', at: 1 } }, equipped: { palette: 'halo.orbit' } }),
    );
    const c = make(storage).ent;
    expect(c.isOwned('halo.petals')).toBe(false);
    expect(c.equippedId('palette')).toBe('palette.bioluma');
  });

  it('works without storage and when storage throws', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    for (const s of [null, throwing]) {
      const { ent } = make(s);
      ent.grant('palette.toxic', 'purchase');
      expect(ent.equip('palette.toxic')).toBe(true);
    }
  });
});

describe('subscription', () => {
  it('unlocks supporter cosmetics only while active, with automatic fallback on expiry', () => {
    const { ent, clock } = make();
    expect(ent.equip('name.mecenas.gold')).toBe(false);
    ent.setSubscription(sub(T0 + 30 * DAY));
    expect(ent.isSubscriber()).toBe(true);
    expect(ent.equip('name.mecenas.gold')).toBe(true);
    expect(ent.equip('badge.mecenas')).toBe(true);
    clock.t = T0 + 31 * DAY;
    expect(ent.isSubscriber()).toBe(false);
    expect(ent.equippedId('nameColor')).toBe('name.default');
    expect(ent.equippedId('badge')).toBe('badge.none');
    // Renewal brings the previous choice back.
    ent.setSubscription(sub(T0 + 61 * DAY));
    expect(ent.equippedId('nameColor')).toBe('name.mecenas.gold');
  });

  it('emits supporterWelcome once and `expire` when it lapses', () => {
    const { ent, clock } = make();
    const welcome = vi.fn();
    const changed = vi.fn();
    ent.on('supporterWelcome', welcome);
    ent.on('changed', changed);
    ent.setSubscription(sub(T0 + 30 * DAY));
    ent.setSubscription(sub(T0 + 60 * DAY));
    expect(welcome).toHaveBeenCalledTimes(1);
    clock.t = T0 + 61 * DAY;
    ent.tick();
    expect(changed.mock.calls.some((c) => c[0].reason === 'expire')).toBe(true);
    ent.setSubscription(sub(T0 + 90 * DAY));
    expect(welcome).toHaveBeenCalledTimes(1); // thanked only the first time ever
  });

  it('claims the palette of the month and keeps it after the subscription ends', () => {
    const { ent, clock } = make();
    const nov = supporterPaletteFor(T0).id;
    expect(ent.isOwned(nov)).toBe(false);
    ent.setSubscription(sub(T0 + 40 * DAY));
    expect(ent.isOwned(nov)).toBe(true);
    clock.t = T0 + 25 * DAY; // December
    ent.tick();
    const dec = supporterPaletteFor(clock.t).id;
    expect(dec).not.toBe(nov);
    expect(ent.isOwned(dec)).toBe(true);
    clock.t = T0 + 100 * DAY;
    ent.tick();
    expect(ent.isSubscriber()).toBe(false);
    expect(ent.isOwned(nov)).toBe(true);
    expect(ent.isOwned(dec)).toBe(true);
    expect(ent.isOwned(supporterPaletteFor(clock.t).id)).toBe(false);
  });
});

describe('server snapshot (authoritative)', () => {
  const snap = (items: { id: string; source?: string }[], subscription: ServerSnapshot['subscription'] = null): ServerSnapshot => ({
    v: 1,
    playerId: '0123456789abcdef0123',
    items: items.map((i) => ({ id: i.id, source: (i.source ?? 'purchase') as 'purchase', at: T0 })),
    subscription,
    serverTime: T0,
  });

  it('replaces purchases, keeps achievement and dev grants, and revokes refunds', () => {
    const { ent } = make();
    ent.syncAchievements(['species10']);
    ent.grant('halo.hex', 'dev', { provider: 'devmock' });
    ent.grant('palette.coral', 'purchase'); // a local purchase the server does not confirm
    expect(ent.applyServerSnapshot(snap([{ id: 'palette.aurora' }, { id: 'dish.brass', source: 'bundle' }]))).toBe(true);
    expect(ent.isOwned('palette.aurora')).toBe(true);
    expect(ent.ownedRecord('palette.aurora')?.server).toBe(true);
    expect(ent.isOwned('dish.brass')).toBe(true);
    expect(ent.isOwned('palette.coral')).toBe(false);
    expect(ent.isOwned('palette.mono')).toBe(true);
    expect(ent.isOwned('halo.hex')).toBe(true);
    // Refund: next snapshot no longer lists aurora.
    ent.equip('palette.aurora');
    ent.applyServerSnapshot(snap([{ id: 'dish.brass', source: 'bundle' }]));
    expect(ent.isOwned('palette.aurora')).toBe(false);
    expect(ent.equippedId('palette')).toBe('palette.bioluma');
  });

  it('takes the subscription from the server and rejects malformed snapshots', () => {
    const { ent } = make();
    ent.applyServerSnapshot(snap([], { plan: 'year', status: 'active', expiresAt: T0 + 365 * DAY, willRenew: true, provider: 'lemonsqueezy', since: T0, manageUrl: 'https://x.lemonsqueezy.com/billing' }));
    expect(ent.isSubscriber()).toBe(true);
    expect(ent.subscription()?.manageUrl).toBe('https://x.lemonsqueezy.com/billing');
    expect(ent.applyServerSnapshot({ v: 2 })).toBe(false);
    expect(ent.applyServerSnapshot(null)).toBe(false);
    expect(ent.isSubscriber()).toBe(true);
  });

  it('verifies receipts through the hook', async () => {
    const { ent } = make();
    expect(await ent.verifyReceipt({ provider: 'googleplay', token: 't' })).toBe(false); // no verifier
    ent.setVerifier(async (r) => (r.token === 'good' ? snap([{ id: 'spark.comet' }]) : null));
    expect(await ent.verifyReceipt({ provider: 'googleplay', token: 'bad' })).toBe(false);
    expect(await ent.verifyReceipt({ provider: 'googleplay', token: 'good' })).toBe(true);
    expect(ent.isOwned('spark.comet')).toBe(true);
  });
});
