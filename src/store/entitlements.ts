/**
 * Entitlements: what the player owns, the supporter subscription and what is equipped per slot.
 *
 * TRUST MODEL. The server is authoritative (purchases are granted by verified webhooks / receipts,
 * see api/store-webhook.ts). This class is a client cache: it persists to localStorage so the
 * wardrobe works offline and instantly, and it is overwritten by `applyServerSnapshot`. Editing
 * localStorage can only change what *you* see; anything other players see (ranking badge, frame,
 * name colour) is read from the server record, never from this cache.
 *
 * Free items (defaults, achievement unlocks) are granted locally and never removed by a snapshot.
 */
import { Bus } from '../core/bus';
import {
  COSMETICS,
  DEFAULT_ITEM,
  SLOTS,
  cosmeticById,
  itemById,
  itemsForSlot,
  supporterPaletteFor,
  type CosmeticItem,
  type Slot,
  type SlotData,
} from './catalog';
import { isServerSnapshot, type ServerSnapshot } from './protocol';

export type GrantSource = 'purchase' | 'bundle' | 'achievement' | 'rotation' | 'grant' | 'dev';

export interface OwnedRecord {
  source: GrantSource;
  /** Grant time (ms). */
  at: number;
  /** Provider or origin ('lemonsqueezy', 'googleplay', 'devmock', 'server'...). */
  provider?: string;
  /** Came from a server snapshot (authoritative). */
  server?: boolean;
}

export interface SubscriptionState {
  plan: 'month' | 'year';
  status: string;
  expiresAt: number;
  willRenew: boolean;
  provider: string;
  manageUrl?: string;
  since: number;
}

export interface StoreReceipt {
  provider: string;
  itemId?: string;
  /** Purchase token / transaction id / signed receipt, opaque to the client. */
  token: string;
  extra?: Record<string, unknown>;
}

/** Sends a native-store receipt to the server for verification; returns the new snapshot or null. */
export type ReceiptVerifier = (receipt: StoreReceipt) => Promise<ServerSnapshot | null>;

export type ChangeReason = 'load' | 'grant' | 'revoke' | 'equip' | 'subscription' | 'expire' | 'sync' | 'reset';

export interface StoreEvents {
  changed: { reason: ChangeReason; ids?: string[]; slot?: Slot };
  /** The subscription became active for the first time ever: add SUPPORTER_JOURNAL to the journal. */
  supporterWelcome: { since: number };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface EntitlementsOptions {
  /** Defaults to globalThis.localStorage when reachable; null = memory only. */
  storage?: StorageLike | null;
  key?: string;
  now?: () => number;
}

interface PersistedV1 {
  v: 1;
  owned: Record<string, OwnedRecord>;
  sub: SubscriptionState | null;
  equipped: Partial<Record<Slot, string>>;
  syncedAt: number;
  thanked: boolean;
  subWasActive: boolean;
}

export const STORE_STORAGE_KEY = 'bioluma.store.v1';

function defaultStorage(): StorageLike | null {
  try {
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
    return ls ?? null;
  } catch {
    return null; // access can throw (privacy mode, sandboxed iframe)
  }
}

function emptyState(): PersistedV1 {
  return { v: 1, owned: {}, sub: null, equipped: {}, syncedAt: 0, thanked: false, subWasActive: false };
}

const SOURCES: GrantSource[] = ['purchase', 'bundle', 'achievement', 'rotation', 'grant', 'dev'];

/** Defensive parse of whatever is in storage: unknown items/slots/fields are dropped. */
function sanitize(raw: unknown): PersistedV1 {
  const s = emptyState();
  if (!raw || typeof raw !== 'object') return s;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return s;
  if (o.owned && typeof o.owned === 'object') {
    for (const [id, rec] of Object.entries(o.owned as Record<string, unknown>)) {
      if (!cosmeticById(id) || !rec || typeof rec !== 'object') continue;
      const r = rec as Record<string, unknown>;
      if (!SOURCES.includes(r.source as GrantSource) || typeof r.at !== 'number') continue;
      s.owned[id] = {
        source: r.source as GrantSource,
        at: r.at,
        provider: typeof r.provider === 'string' ? r.provider : undefined,
        server: r.server === true ? true : undefined,
      };
    }
  }
  if (o.sub && typeof o.sub === 'object') {
    const u = o.sub as Record<string, unknown>;
    if ((u.plan === 'month' || u.plan === 'year') && typeof u.expiresAt === 'number') {
      s.sub = {
        plan: u.plan,
        status: typeof u.status === 'string' ? u.status : 'active',
        expiresAt: u.expiresAt,
        willRenew: u.willRenew === true,
        provider: typeof u.provider === 'string' ? u.provider : 'unknown',
        manageUrl: typeof u.manageUrl === 'string' && /^https:\/\//.test(u.manageUrl) ? u.manageUrl : undefined,
        since: typeof u.since === 'number' ? u.since : u.expiresAt,
      };
    }
  }
  if (o.equipped && typeof o.equipped === 'object') {
    for (const [slot, id] of Object.entries(o.equipped as Record<string, unknown>)) {
      const it = typeof id === 'string' ? cosmeticById(id) : undefined;
      if (it && (SLOTS as string[]).includes(slot) && it.slot === slot) s.equipped[slot as Slot] = id as string;
    }
  }
  s.syncedAt = typeof o.syncedAt === 'number' ? o.syncedAt : 0;
  s.thanked = o.thanked === true;
  s.subWasActive = o.subWasActive === true;
  return s;
}

export class Entitlements {
  private state: PersistedV1;
  private readonly storage: StorageLike | null;
  private readonly key: string;
  private readonly now: () => number;
  private readonly bus = new Bus<StoreEvents>();
  private verifier: ReceiptVerifier | null = null;

  constructor(opts: EntitlementsOptions = {}) {
    this.storage = opts.storage === undefined ? defaultStorage() : opts.storage;
    this.key = opts.key ?? STORE_STORAGE_KEY;
    this.now = opts.now ?? (() => Date.now());
    this.state = this.load();
  }

  /** Subscribe to `changed` / `supporterWelcome`. Returns an unsubscribe function. */
  on<K extends keyof StoreEvents>(type: K, fn: (e: StoreEvents[K]) => void): () => void {
    return this.bus.on(type, fn);
  }

  // ───────────── ownership ─────────────

  isSubscriber(at: number = this.now()): boolean {
    const s = this.state.sub;
    return !!s && at < s.expiresAt;
  }

  subscription(): Readonly<SubscriptionState> | null {
    return this.state.sub;
  }

  /** Is this cosmetic usable now? (Bundles/subscriptions: "has bought it" / "is active".) */
  isOwned(id: string, at: number = this.now()): boolean {
    const item = itemById(id);
    if (!item) return false;
    if (item.kind === 'subscription') return this.isSubscriber(at);
    if (item.kind === 'bundle') return item.contains.every((c) => !!this.state.owned[c]);
    switch (item.unlock.type) {
      case 'default':
        return true;
      case 'subscription':
        return this.isSubscriber(at);
      case 'rotation':
        return !!this.state.owned[id] || (this.isSubscriber(at) && supporterPaletteFor(at).id === id);
      default:
        return !!this.state.owned[id];
    }
  }

  ownedRecord(id: string): Readonly<OwnedRecord> | null {
    return this.state.owned[id] ?? null;
  }

  /** Every cosmetic usable right now (defaults included). */
  ownedIds(at: number = this.now()): string[] {
    const out: string[] = [];
    for (const slot of SLOTS) for (const it of this.slotItems(slot)) if (this.isOwned(it.id, at)) out.push(it.id);
    return out;
  }

  /** Owned items of one slot, in catalog order. */
  ownedForSlot<S extends Slot>(slot: S, at: number = this.now()): Extract<CosmeticItem, { slot: S }>[] {
    return this.slotItems(slot).filter((i) => this.isOwned(i.id, at)) as Extract<CosmeticItem, { slot: S }>[];
  }

  private slotItems(slot: Slot): CosmeticItem[] {
    return itemsForSlot(slot);
  }

  /**
   * Grant items (bundles expand to their contents; subscriptions are ignored: use setSubscription).
   * Returns the cosmetic ids that were newly added.
   */
  grant(ids: string | string[], source: GrantSource, meta: { provider?: string; server?: boolean; at?: number } = {}): string[] {
    const added = this.grantSilently(Array.isArray(ids) ? ids : [ids], source, meta);
    if (added.length) {
      this.persist();
      this.bus.emit('changed', { reason: 'grant', ids: added });
    }
    return added;
  }

  private grantSilently(ids: string[], source: GrantSource, meta: { provider?: string; server?: boolean; at?: number }): string[] {
    const added: string[] = [];
    const at = meta.at ?? this.now();
    for (const id of ids) {
      const item = itemById(id);
      if (!item || item.kind === 'subscription') continue;
      const targets = item.kind === 'bundle' ? item.contains : [id];
      const src: GrantSource = item.kind === 'bundle' && source === 'purchase' ? 'bundle' : source;
      for (const c of targets) {
        if (!cosmeticById(c)) continue;
        const prev = this.state.owned[c];
        // A server grant upgrades a local record; otherwise the first grant wins.
        if (prev && !(meta.server && !prev.server)) continue;
        this.state.owned[c] = { source: src, at, provider: meta.provider, server: meta.server ? true : undefined };
        if (!prev) added.push(c);
      }
    }
    return added;
  }

  /** Remove items (refunds, chargebacks). Achievement unlocks are never revoked. */
  revoke(ids: string | string[]): string[] {
    const removed: string[] = [];
    for (const id of Array.isArray(ids) ? ids : [ids]) {
      const item = itemById(id);
      const targets = item?.kind === 'bundle' ? item.contains : [id];
      for (const c of targets) {
        const rec = this.state.owned[c];
        if (rec && rec.source !== 'achievement') {
          delete this.state.owned[c];
          removed.push(c);
        }
      }
    }
    if (removed.length) {
      this.persist();
      this.bus.emit('changed', { reason: 'revoke', ids: removed });
    }
    return removed;
  }

  setSubscription(sub: SubscriptionState | null): void {
    this.state.sub = sub ? { ...sub } : null;
    this.persist();
    this.bus.emit('changed', { reason: 'subscription' });
    this.tick();
  }

  /** Grant the free cosmetics unlocked by these achievement ids (call with every done achievement). */
  syncAchievements(doneIds: readonly string[]): string[] {
    const done = new Set(doneIds);
    const ids = COSMETICS
      .filter((i) => i.unlock.type === 'achievement' && done.has(i.unlock.achievement))
      .map((i) => i.id);
    return this.grant(ids, 'achievement', { provider: 'achievement' });
  }

  // ───────────── equipment ─────────────

  /** Equip an owned cosmetic in its slot. Returns false (and changes nothing) if not owned. */
  equip(id: string): boolean {
    const item = cosmeticById(id);
    if (!item || !this.isOwned(id)) return false;
    if (this.state.equipped[item.slot] === id) return true;
    this.state.equipped[item.slot] = id;
    this.persist();
    this.bus.emit('changed', { reason: 'equip', ids: [id], slot: item.slot });
    return true;
  }

  /** Back to the slot's default. */
  unequip(slot: Slot): void {
    if (!this.state.equipped[slot]) return;
    delete this.state.equipped[slot];
    this.persist();
    this.bus.emit('changed', { reason: 'equip', slot });
  }

  /**
   * Effective equipped id: the chosen item while it is owned, else the default. (An expired
   * subscription's name colour falls back automatically and comes back on renewal.)
   */
  equippedId(slot: Slot, at: number = this.now()): string {
    const id = this.state.equipped[slot];
    return id && this.isOwned(id, at) ? id : DEFAULT_ITEM[slot];
  }

  equipped<S extends Slot>(slot: S, at: number = this.now()): Extract<CosmeticItem, { slot: S }> {
    return cosmeticById(this.equippedId(slot, at)) as Extract<CosmeticItem, { slot: S }>;
  }

  equippedData<S extends Slot>(slot: S): SlotData[S] {
    return this.equipped(slot).data as SlotData[S];
  }

  listEquipped(at: number = this.now()): Record<Slot, CosmeticItem> {
    const out = {} as Record<Slot, CosmeticItem>;
    for (const s of SLOTS) out[s] = this.equipped(s, at);
    return out;
  }

  isEquipped(id: string): boolean {
    const it = cosmeticById(id);
    return !!it && this.equippedId(it.slot) === id;
  }

  // ───────────── server sync ─────────────

  /**
   * Replace the purchased part of the cache with the authoritative server state. Achievement and
   * dev-mock grants are kept; purchases missing from the snapshot (refunds) are removed.
   */
  applyServerSnapshot(snap: unknown): boolean {
    if (!isServerSnapshot(snap)) return false;
    const before = JSON.stringify(this.state.owned) + JSON.stringify(this.state.sub);
    for (const [id, rec] of Object.entries(this.state.owned)) {
      if (rec.source !== 'achievement' && rec.source !== 'dev') delete this.state.owned[id];
    }
    for (const it of snap.items) {
      if (!cosmeticById(it.id)) continue;
      const source: GrantSource = it.source === 'bundle' || it.source === 'rotation' || it.source === 'grant' ? it.source : 'purchase';
      const prev = this.state.owned[it.id];
      if (prev?.source === 'achievement') continue;
      this.state.owned[it.id] = { source, at: it.at, provider: 'server', server: true };
    }
    const s = snap.subscription;
    this.state.sub = s
      ? {
          plan: s.plan,
          status: s.status,
          expiresAt: s.expiresAt,
          willRenew: s.willRenew,
          provider: s.provider,
          manageUrl: s.manageUrl && /^https:\/\//.test(s.manageUrl) ? s.manageUrl : undefined,
          since: s.since,
        }
      : null;
    this.state.syncedAt = this.now();
    this.persist();
    if (before !== JSON.stringify(this.state.owned) + JSON.stringify(this.state.sub)) {
      this.bus.emit('changed', { reason: 'sync' });
    }
    this.tick();
    return true;
  }

  lastSyncedAt(): number {
    return this.state.syncedAt;
  }

  setVerifier(fn: ReceiptVerifier | null): void {
    this.verifier = fn;
  }

  /** Native-store receipt → server verification → snapshot applied. False if unverifiable. */
  async verifyReceipt(receipt: StoreReceipt): Promise<boolean> {
    if (!this.verifier) return false;
    try {
      const snap = await this.verifier(receipt);
      return snap ? this.applyServerSnapshot(snap) : false;
    } catch (err) {
      console.warn('[store] receipt verification failed', err);
      return false;
    }
  }

  // ───────────── time ─────────────

  /**
   * Detects subscription start/expiry and claims the supporter palette of the month. Called after
   * every subscription change; the integrator also calls it about once a minute.
   */
  tick(at: number = this.now()): void {
    const active = this.isSubscriber(at);
    let dirty = false;
    if (active) {
      const pal = supporterPaletteFor(at);
      if (!this.state.owned[pal.id]) {
        this.state.owned[pal.id] = { source: 'rotation', at, provider: 'subscription' };
        dirty = true;
      }
    }
    if (active && !this.state.subWasActive) {
      this.state.subWasActive = true;
      dirty = true;
      if (!this.state.thanked) {
        this.state.thanked = true;
        this.persist();
        this.bus.emit('supporterWelcome', { since: this.state.sub?.since ?? at });
      }
    } else if (!active && this.state.subWasActive) {
      this.state.subWasActive = false;
      this.persist();
      this.bus.emit('changed', { reason: 'expire' });
      return;
    }
    if (dirty) {
      this.persist();
      this.bus.emit('changed', { reason: 'grant' });
    }
  }

  /** Wipe the cache (dev tools / "sign out of store"). */
  reset(): void {
    this.state = emptyState();
    this.persist();
    this.bus.emit('changed', { reason: 'reset' });
  }

  /** Persisted shape (debugging, tests). */
  toJSON(): unknown {
    return JSON.parse(JSON.stringify(this.state));
  }

  // ───────────── persistence ─────────────

  private load(): PersistedV1 {
    if (!this.storage) return emptyState();
    try {
      const raw = this.storage.getItem(this.key);
      return raw ? sanitize(JSON.parse(raw)) : emptyState();
    } catch {
      return emptyState();
    }
  }

  private persist(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(this.key, JSON.stringify(this.state));
    } catch {
      /* quota / privacy mode: the cache stays in memory */
    }
  }
}
