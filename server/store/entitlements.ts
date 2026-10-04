/**
 * Authoritative entitlement records (server side) and the Lemon Squeezy event → grant logic.
 *
 * One JSON record per player in KV under "ent:" + playerKey(playerId) (a hash: raw player ids are
 * never stored, same rule as the ranking). Grants are idempotent: replaying a webhook changes nothing.
 * Subscriptions keep the provider's latest `updated_at`, so out-of-order deliveries cannot roll back.
 */
import {
  ALL_ITEMS,
  DEFAULT_ITEM,
  cosmeticById,
  itemById,
  supporterPaletteFor,
  type CosmeticItem,
  type Slot,
} from '../../src/store/catalog.js';
import { PLAYER_ID_RE, type ServerSnapshot, type SnapshotSource, type SnapshotSubscription } from '../../src/store/protocol.js';
import { playerKey } from '../protocol.js';
import type { KV } from './kv.js';

/** Late renewal webhooks / card retries should not blink benefits off. */
export const RENEWAL_GRACE_MS = 3 * 86_400_000;

export interface ServerSub {
  id: string;
  provider: string;
  plan: 'month' | 'year';
  status: string;
  /** ms or null */
  renewsAt: number | null;
  endsAt: number | null;
  since: number;
  /** Provider updated_at (ms): newer events win. */
  updatedAt: number;
  manageUrl?: string;
}

export interface EntRecord {
  v: 1;
  key: string;
  /** Public key pinned on the first signed read when the ranking has none (TOFU). */
  pub?: string;
  items: Record<string, { source: SnapshotSource; at: number; order?: string }>;
  subs: Record<string, ServerSub>;
  /** order id → cosmetic ids it granted (refunds revoke exactly these). */
  orders: Record<string, { items: string[]; at: number; refunded?: boolean }>;
  updatedAt: number;
}

export const recordKey = (key: string) => `ent:${key}`;

export function emptyRecord(key: string): EntRecord {
  return { v: 1, key, items: {}, subs: {}, orders: {}, updatedAt: 0 };
}

export async function loadRecord(kv: KV, key: string): Promise<EntRecord> {
  const raw = await kv.get(recordKey(key));
  if (!raw) return emptyRecord(key);
  try {
    const r = JSON.parse(raw) as EntRecord;
    return r && r.v === 1 ? { ...emptyRecord(key), ...r } : emptyRecord(key);
  } catch {
    return emptyRecord(key);
  }
}

export async function saveRecord(kv: KV, rec: EntRecord, now: number): Promise<void> {
  rec.updatedAt = now;
  await kv.put(recordKey(rec.key), JSON.stringify(rec));
}

// ───────────────────────────── grants ─────────────────────────────

/** Grant an item (bundles expand). Returns cosmetic ids newly added. */
export function grantItem(rec: EntRecord, itemId: string, at: number, order?: string): string[] {
  const item = itemById(itemId);
  if (!item || item.kind === 'subscription') return [];
  const ids = item.kind === 'bundle' ? item.contains : [itemId];
  const source: SnapshotSource = item.kind === 'bundle' ? 'bundle' : 'purchase';
  const added: string[] = [];
  for (const id of ids) {
    if (!cosmeticById(id) || rec.items[id]) continue;
    rec.items[id] = { source, at, order };
    added.push(id);
  }
  if (order) {
    const o = rec.orders[order] ?? { items: [], at };
    o.items = [...new Set([...o.items, ...added])];
    rec.orders[order] = o;
  }
  return added;
}

/** Refund: remove exactly what the order granted. */
export function refundOrder(rec: EntRecord, order: string): string[] {
  const o = rec.orders[order];
  if (!o || o.refunded) return [];
  for (const id of o.items) if (rec.items[id]?.order === order) delete rec.items[id];
  o.refunded = true;
  return o.items;
}

/** Benefits end time of a subscription (0 = inactive). */
export function subExpiresAt(s: ServerSub): number {
  switch (s.status) {
    case 'active':
    case 'on_trial':
    case 'past_due':
      return Math.max(s.renewsAt ?? 0, s.endsAt ?? 0) + RENEWAL_GRACE_MS;
    case 'cancelled':
      // Cancelled = will not renew, but stays active until ends_at.
      return s.endsAt ?? s.renewsAt ?? 0;
    default:
      // expired, unpaid, paused, refunded
      return 0;
  }
}

export function upsertSub(rec: EntRecord, s: ServerSub): boolean {
  const prev = rec.subs[s.id];
  if (prev && prev.updatedAt > s.updatedAt) return false; // stale delivery
  rec.subs[s.id] = { ...s, since: prev ? Math.min(prev.since, s.since) : s.since };
  return true;
}

export function activeSub(rec: EntRecord, now: number): ServerSub | null {
  let best: ServerSub | null = null;
  for (const s of Object.values(rec.subs)) {
    const exp = subExpiresAt(s);
    if (exp > now && (!best || exp > subExpiresAt(best))) best = s;
  }
  return best;
}

/** Claim the supporter palette of the current month for an active subscriber. True if added. */
export function claimRotation(rec: EntRecord, now: number): boolean {
  if (!activeSub(rec, now)) return false;
  const pal = supporterPaletteFor(now);
  if (rec.items[pal.id]) return false;
  rec.items[pal.id] = { source: 'rotation', at: now };
  return true;
}

export function snapshotOf(rec: EntRecord, playerId: string, now: number): ServerSnapshot {
  const s = activeSub(rec, now) ?? latestSub(rec);
  const sub: SnapshotSubscription | null = s
    ? {
        plan: s.plan,
        status: s.status,
        expiresAt: subExpiresAt(s),
        willRenew: s.status === 'active' || s.status === 'on_trial' || s.status === 'past_due',
        provider: s.provider,
        manageUrl: s.manageUrl,
        since: s.since,
      }
    : null;
  return {
    v: 1,
    playerId,
    items: Object.entries(rec.items).map(([id, r]) => ({ id, source: r.source, at: r.at })),
    subscription: sub,
    serverTime: now,
  };
}

function latestSub(rec: EntRecord): ServerSub | null {
  let best: ServerSub | null = null;
  for (const s of Object.values(rec.subs)) if (!best || s.updatedAt > best.updatedAt) best = s;
  return best;
}

/**
 * What other players may see (ranking rows): badge, frame and name colour. Equipped choices are
 * sent by the client; the server only accepts ones this record owns, else the defaults.
 */
export function publicCosmetics(rec: EntRecord, wanted: Partial<Record<'badge' | 'frame' | 'nameColor', string>>, now: number): Record<'badge' | 'frame' | 'nameColor', string> {
  const sub = !!activeSub(rec, now);
  const owns = (it: CosmeticItem | undefined): boolean => {
    if (!it) return false;
    if (it.unlock.type === 'default') return true;
    if (it.unlock.type === 'subscription') return sub;
    // Achievement items are client-side unlocks: trust them only as far as the ranking trusts
    // achievements (cosmetic, harmless). Paid items must be in the record.
    if (it.unlock.type === 'achievement') return true;
    return !!rec.items[it.id];
  };
  const pick = (slot: Slot & ('badge' | 'frame' | 'nameColor')): string => {
    const id = wanted[slot];
    const it = id ? cosmeticById(id) : undefined;
    return it && it.slot === slot && owns(it) ? it.id : DEFAULT_ITEM[slot];
  };
  return { badge: pick('badge'), frame: pick('frame'), nameColor: pick('nameColor') };
}

// ───────────────────────────── Lemon Squeezy ─────────────────────────────

export interface LemonPayload {
  meta?: { event_name?: string; custom_data?: Record<string, unknown> | null; test_mode?: boolean };
  data?: { type?: string; id?: string | number; attributes?: Record<string, unknown> };
}

export type LemonOutcome =
  | { status: 200; action: 'granted' | 'refunded' | 'subscription' | 'noop' | 'ignored'; detail?: string; ids?: string[] }
  | { status: 422; action: 'unprocessable'; detail: string };

/** variant id (string) → item id: env LEMONSQUEEZY_VARIANTS JSON, then catalog skus.lemonsqueezy. */
export function variantMap(envJson: string | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const it of ALL_ITEMS) if (it.skus?.lemonsqueezy) m.set(String(it.skus.lemonsqueezy), it.id);
  if (envJson) {
    try {
      const o = JSON.parse(envJson) as Record<string, unknown>;
      for (const [variant, id] of Object.entries(o)) if (typeof id === 'string' && itemById(id)) m.set(String(variant), id);
    } catch {
      console.error('[store] LEMONSQUEEZY_VARIANTS is not valid JSON');
    }
  }
  return m;
}

const ms = (v: unknown): number | null => {
  if (typeof v !== 'string' || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

export interface LemonDeps {
  kv: KV;
  variants: Map<string, string>;
  now: number;
  /** Accept test-mode events (previews). Production: false. */
  allowTest: boolean;
}

/**
 * Apply one verified Lemon Squeezy webhook. Unknown events are acknowledged (200, ignored).
 * A paid order we cannot attribute (no/invalid player id, unknown variant) returns 422 so it shows as
 * failed in the Lemon Squeezy webhook log and can be re-sent after fixing the configuration.
 */
export async function processLemonEvent(p: LemonPayload, d: LemonDeps): Promise<LemonOutcome> {
  const event = p.meta?.event_name ?? '';
  if (p.meta?.test_mode && !d.allowTest) return { status: 200, action: 'ignored', detail: 'test_mode' };
  const a = p.data?.attributes ?? {};
  const dataId = String(p.data?.id ?? '');
  const pid = p.meta?.custom_data?.player_id;
  const playerId = typeof pid === 'string' && PLAYER_ID_RE.test(pid) ? pid : null;

  const handled = [
    'order_created',
    'order_refunded',
    'subscription_created',
    'subscription_updated',
    'subscription_cancelled',
    'subscription_resumed',
    'subscription_expired',
    'subscription_paused',
    'subscription_unpaused',
    'subscription_payment_success',
    'subscription_payment_recovered',
  ];
  if (!handled.includes(event)) return { status: 200, action: 'ignored', detail: event };
  if (!playerId) return { status: 422, action: 'unprocessable', detail: 'missing player_id custom data' };

  const key = await playerKey(playerId);
  const rec = await loadRecord(d.kv, key);
  let out: LemonOutcome = { status: 200, action: 'noop' };

  if (event === 'order_created') {
    const first = a.first_order_item as Record<string, unknown> | undefined;
    const variant = String(first?.variant_id ?? '');
    const itemId = d.variants.get(variant);
    if (a.status !== 'paid') return { status: 200, action: 'ignored', detail: `order status ${String(a.status)}` };
    if (!itemId) return { status: 422, action: 'unprocessable', detail: `unknown variant ${variant}` };
    const item = itemById(itemId)!;
    if (item.kind === 'subscription') {
      out = { status: 200, action: 'noop', detail: 'subscription order (handled by subscription_* events)' };
    } else {
      const ids = grantItem(rec, itemId, d.now, `ls:${dataId}`);
      out = { status: 200, action: ids.length ? 'granted' : 'noop', ids };
    }
  } else if (event === 'order_refunded') {
    const ids = refundOrder(rec, `ls:${dataId}`);
    out = { status: 200, action: ids.length ? 'refunded' : 'noop', ids };
  } else {
    // subscription_* events. Invoice events carry the subscription id in attributes.
    const isInvoice = p.data?.type === 'subscription-invoices';
    const subId = isInvoice ? String(a.subscription_id ?? '') : dataId;
    if (!subId) return { status: 422, action: 'unprocessable', detail: 'no subscription id' };
    if (!isInvoice) {
      const variant = String(a.variant_id ?? '');
      const itemId = d.variants.get(variant);
      const item = itemId ? itemById(itemId) : undefined;
      if (!item || item.kind !== 'subscription') return { status: 422, action: 'unprocessable', detail: `unknown subscription variant ${variant}` };
      const urls = (a.urls ?? {}) as Record<string, unknown>;
      upsertSub(rec, {
        id: `ls:${subId}`,
        provider: 'lemonsqueezy',
        plan: item.period,
        status: String(a.status ?? 'active'),
        renewsAt: ms(a.renews_at),
        endsAt: ms(a.ends_at),
        since: ms(a.created_at) ?? d.now,
        updatedAt: ms(a.updated_at) ?? d.now,
        manageUrl: typeof urls.customer_portal === 'string' && urls.customer_portal.startsWith('https://') ? urls.customer_portal : undefined,
      });
    }
    claimRotation(rec, d.now);
    out = { status: 200, action: 'subscription', detail: event };
  }
  await saveRecord(d.kv, rec, d.now);
  return out;
}
