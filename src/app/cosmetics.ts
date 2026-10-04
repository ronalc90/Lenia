/**
 * Cosmetics wiring (store + wardrobe): entitlements, the store controller and the lazy UI entry points.
 * Everything here is visual or audible only; nothing reaches the economy (docs/MONETIZACION.md, ADR-021).
 *
 *   const cos = setupCosmetics({ ... });
 *   cos.bind({ sim, overlay: ui, portraits, audio });   // equipped cosmetics → renderer/overlay/audio
 *   cos.syncAchievements(doneIds);                     // free cosmetics unlocked by achievements
 *
 * The store UI (src/ui/store) is loaded with a dynamic import the first time the wardrobe or the store
 * opens, so it never weighs on the first load.
 */
import type { Lang } from '../core/types';
import type { PlatformInfo } from '../platform/platform';
import { createSnapshotFetcher } from '../store/api';
import { bindCosmetics, type CosmeticTargets } from '../store/apply';
import { DEFAULT_ITEM, type AmbiencePreset, type StoreTab } from '../store/catalog';
import { Entitlements } from '../store/entitlements';
import { storeFlagsFromEnv, type StoreFlags } from '../store/flags';
import type { PlayerIdentity, ProvidersConfig } from '../store/providers';
import { StoreController } from '../store/store';
import type { StoreUIHandle, WardrobeHandle } from '../ui/store';
import { playerKey, tagFromKey } from '../../server/protocol.js';

export interface CosmeticsOptions {
  platform: PlatformInfo;
  openExternal(url: string): void;
  /** Player identity (ranking key); null = only the mock store can work, the wardrobe always does. */
  identity: PlayerIdentity | null;
  lang(): Lang;
  reduceMotion(): boolean;
  /** Ranking name without tag, when the player chose one. */
  playerName(): string | null;
  /** Audition a music preset with the real engine (null = stop); undefined = the store's own synth. */
  previewMusic?(): ((preset: AmbiencePreset | null) => void) | undefined;
  sound(kind: 'tap' | 'confirm' | 'deny'): void;
  /** Mount point for the modals (the game root). */
  root(): HTMLElement;
  /** Store API origin ('' = same origin). Undefined = no API here (no snapshot fetches). */
  apiBase?: string;
  /** Legal pages shown in the store footer. */
  legal?: { terms: string; privacy: string; refunds?: string };
}

export interface Cosmetics {
  readonly entitlements: Entitlements;
  readonly store: StoreController;
  readonly flags: StoreFlags;
  /** Push equipped cosmetics to the targets now and on every change. */
  bind(targets: CosmeticTargets): () => void;
  syncAchievements(doneIds: readonly string[]): void;
  openWardrobe(): void;
  /** Present only where the store may show (never on portals, never with STORE_ENABLED off). */
  readonly openStore: ((tab?: StoreTab) => void) | undefined;
  /** Equipped ranking cosmetics (non-default ids) for leaderboard submissions. */
  profileCosmetics(): { badge?: string; frame?: string; nameColor?: string } | null;
  dispose(): void;
}

/** Lemon Squeezy store + checkout links from the build env (JSON map itemId → checkout UUID). */
function lemonConfigFromEnv(): ProvidersConfig['lemonsqueezy'] | undefined {
  const env = import.meta.env as Record<string, string | boolean | undefined>;
  const store = typeof env.VITE_LEMONSQUEEZY_STORE === 'string' ? env.VITE_LEMONSQUEEZY_STORE : '';
  if (!store) return undefined;
  let checkouts: Record<string, string> = {};
  try {
    const raw = env.VITE_LEMONSQUEEZY_CHECKOUTS;
    const parsed: unknown = typeof raw === 'string' && raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (typeof v === 'string') checkouts[k] = v;
    }
  } catch {
    checkouts = {};
  }
  return { store, checkouts };
}

export function setupCosmetics(o: CosmeticsOptions): Cosmetics {
  const flags = storeFlagsFromEnv(o.platform);
  const entitlements = new Entitlements();
  // Snapshot reads only where a store API can exist: real/test payments, or a cache that once synced.
  const canFetch = o.identity && o.apiBase !== undefined && (flags.payments || flags.testMode || entitlements.lastSyncedAt() > 0);
  const fetchSnapshot = canFetch ? createSnapshotFetcher(o.identity!, { baseUrl: o.apiBase }) : undefined;
  // Payment providers load only where the store may show (never with STORE_ENABLED off), so the
  // default build carries none of them in its main bundle.
  const store = new StoreController(flags, entitlements, []);
  const providersReady: Promise<void> = flags.visible
    ? import('../store/providers')
        .then((m) => {
          const list = m.createProviders(
            flags,
            { entitlements, fetchSnapshot, openExternal: (u) => o.openExternal(u) },
            { identity: o.identity, lemonsqueezy: lemonConfigFromEnv() },
          );
          store.providers.push(...list);
        })
        .catch((err) => console.error('[store] providers failed to load', err))
    : Promise.resolve();
  const tick = setInterval(() => entitlements.tick(), 60_000);
  if (fetchSnapshot) {
    void fetchSnapshot().then((s) => {
      if (s) entitlements.applyServerSnapshot(s);
    });
  }

  let tag = '';
  void o.identity
    ?.playerId()
    .then((id) => playerKey(id))
    .then((k) => (tag = tagFromKey(k)))
    .catch(() => undefined);

  let storeUI: StoreUIHandle | null = null;
  let wardrobeUI: WardrobeHandle | null = null;
  let loading = false;
  const load = () => import('../ui/store');

  const common = () => ({
    root: o.root(),
    lang: o.lang(),
    reduceMotion: o.reduceMotion() || undefined,
    playerName: o.playerName() ?? undefined,
    playerTag: tag || undefined,
    sound: o.sound,
  });

  const openStore = (tab?: StoreTab) => {
    if (loading) return;
    loading = true;
    void Promise.all([load(), providersReady])
      .then(([m]) => {
        wardrobeUI?.close();
        storeUI?.close();
        void store.prepare();
        storeUI = m.openStore({
          ...common(),
          store,
          tab,
          legal: o.legal,
          previewMusic: o.previewMusic?.(),
          openWardrobe: () => openWardrobe(),
          onClose: () => (storeUI = null),
        });
      })
      .catch((err) => console.error('[store] UI failed to load', err))
      .finally(() => (loading = false));
  };

  const openWardrobe = () => {
    if (loading) return;
    loading = true;
    void load()
      .then((m) => {
        storeUI?.close();
        wardrobeUI?.close();
        wardrobeUI = m.openWardrobe({
          ...common(),
          entitlements,
          openStore: store.visible ? (t) => openStore(t) : undefined,
          onClose: () => (wardrobeUI = null),
        });
      })
      .catch((err) => console.error('[wardrobe] UI failed to load', err))
      .finally(() => (loading = false));
  };

  return {
    entitlements,
    store,
    flags,
    bind: (targets) => bindCosmetics(entitlements, targets),
    syncAchievements: (ids) => void entitlements.syncAchievements(ids),
    openWardrobe,
    openStore: store.visible ? openStore : undefined,
    profileCosmetics() {
      const out: { badge?: string; frame?: string; nameColor?: string } = {};
      for (const slot of ['badge', 'frame', 'nameColor'] as const) {
        const id = entitlements.equippedId(slot);
        if (id !== DEFAULT_ITEM[slot]) out[slot] = id;
      }
      return Object.keys(out).length ? out : null;
    },
    dispose() {
      clearInterval(tick);
      storeUI?.close();
      wardrobeUI?.close();
    },
  };
}
