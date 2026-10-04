/**
 * Store feature flags. PAYMENTS ARE OFF BY DEFAULT.
 *
 * - `STORE_ENABLED` (false) is the master switch for real money. The integrator turns it on, or a
 *   build sets VITE_STORE_ENABLED=1, only once accounts, products and the webhook exist.
 * - Per-host rules apply even when it is on: the store is never shown on galaxy.click (portal
 *   rules), itch.io or CrazyGames (unverified rules), and never takes live payments on a Vercel
 *   Hobby preview (*.vercel.app: Hobby forbids charging; previews use the mock or test mode).
 * - The mock store (fake purchases, clearly labelled) is available in `vite dev` and with
 *   `?store=mock` on hosts where the store could appear. `?store=off` hides everything.
 * - The wardrobe (equipping free/owned cosmetics) involves no money and is always available.
 *
 * resolveStoreFlags is pure so the rules are unit tested; storeFlagsFromEnv reads the browser.
 */
import type { ProviderId } from './providers/types';

/** Master switch for real payments. Keep false until the owner has set everything up. */
export const STORE_ENABLED = false;

export type StoreHost =
  | 'web' // own domain (Cloudflare Pages production)
  | 'preview' // *.vercel.app, *.pages.dev previews, localhost preview builds
  | 'galaxy'
  | 'itch'
  | 'crazygames'
  | 'android' // TWA / Capacitor (Google Play)
  | 'ios' // Capacitor (App Store)
  | 'steam' // Electron Steam build
  | 'desktop' // Electron standalone (no Steam)
  | 'dev'; // vite dev server

/** Where real payments may run when STORE_ENABLED. Change only with an ADR (docs/MONETIZACION.md). */
export const HOST_PAYMENTS: Record<StoreHost, boolean> = {
  web: true,
  preview: false,
  galaxy: false,
  itch: false,
  crazygames: false,
  android: true,
  ios: false, // no Apple developer account yet (99 USD/yr, not in the budget)
  steam: true,
  desktop: false,
  dev: false,
};

/** Hosts where even the mock store must never appear (portal rules). */
const NEVER_SHOW: ReadonlySet<StoreHost> = new Set(['galaxy', 'itch', 'crazygames']);

/** Payment provider preference per host (first available wins). */
export const HOST_PROVIDERS: Record<StoreHost, ProviderId[]> = {
  web: ['lemonsqueezy'],
  preview: ['lemonsqueezy'],
  galaxy: [],
  itch: [],
  crazygames: [],
  android: ['googleplay'],
  ios: ['apple'],
  steam: ['steam'],
  desktop: ['lemonsqueezy'],
  dev: ['lemonsqueezy'],
};

export interface StoreFlags {
  /** Show the store button/modal at all. */
  visible: boolean;
  /** Real-money purchases allowed (providers other than the mock). */
  payments: boolean;
  /** Mock provider active (fake purchases, banner shown). */
  mock: boolean;
  /** Real provider in sandbox/test mode (Lemon Squeezy test mode, Play license testers). */
  testMode: boolean;
  /** Wardrobe for owned/free cosmetics (no money involved). */
  wardrobe: boolean;
  host: StoreHost;
  /** Provider ids to try, in order ('devmock' first when mock). */
  providers: ProviderId[];
  /** Why the store is hidden/limited (for logs and the dev page). */
  reason: string;
}

/** Loose shape of platforms/shared/platform.ts PlatformInfo (passed in, never imported). */
export interface HostPlatformInfo {
  kind: string;
  os: string;
  portal: string | null;
  steam: boolean;
}

export interface StoreFlagInput {
  /** Master switch; defaults to STORE_ENABLED. */
  storeEnabled?: boolean;
  /** import.meta.env.DEV */
  isDev?: boolean;
  /** location.search */
  search?: string;
  /** location.hostname */
  hostname?: string;
  /** detectPlatform() result (src/platform/platform.ts once moved there). */
  platform?: HostPlatformInfo;
  /** VITE_BUILD_TARGET for portal builds: 'galaxy' | 'itch' | 'crazygames' forces that host. */
  buildTarget?: string;
  /** Hosts the owner has explicitly cleared (or blocked) for payments, overriding HOST_PAYMENTS. */
  hostPayments?: Partial<Record<StoreHost, boolean>>;
}

export function detectHost(i: StoreFlagInput): StoreHost {
  const target = (i.buildTarget ?? '').toLowerCase();
  if (target === 'galaxy' || target === 'itch' || target === 'crazygames') return target;
  const p = i.platform;
  if (p?.portal === 'galaxy' || p?.portal === 'itch' || p?.portal === 'crazygames') return p.portal;
  const host = (i.hostname ?? '').toLowerCase();
  if (host === 'galaxy.click' || host.endsWith('.galaxy.click')) return 'galaxy';
  if (host.endsWith('.itch.zone') || host.endsWith('.hwcdn.net') || host.endsWith('itch.io')) return 'itch';
  if (host.includes('crazygames')) return 'crazygames';
  if (p?.kind === 'electron') return p.steam ? 'steam' : 'desktop';
  if (p?.kind === 'twa' || (p?.kind === 'capacitor' && p.os === 'android')) return 'android';
  if (p?.kind === 'capacitor' && p.os === 'ios') return 'ios';
  if (i.isDev) return 'dev';
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app') || host.endsWith('.pages.dev') || host === '') {
    return 'preview';
  }
  return 'web';
}

export function resolveStoreFlags(i: StoreFlagInput = {}): StoreFlags {
  const host = detectHost(i);
  const params = new URLSearchParams(i.search ?? '');
  const q = params.get('store');
  const enabled = i.storeEnabled ?? STORE_ENABLED;
  const base = { host, wardrobe: true, testMode: false };

  if (NEVER_SHOW.has(host)) {
    return { ...base, visible: false, payments: false, mock: false, providers: [], reason: `hidden on ${host} (portal rules)` };
  }
  if (q === 'off') {
    return { ...base, visible: false, payments: false, mock: false, providers: [], reason: '?store=off' };
  }
  const mock = q === 'mock' || (host === 'dev' && q !== 'live');
  if (mock) {
    return { ...base, visible: true, payments: false, mock: true, testMode: true, providers: ['devmock'], reason: 'mock store (fake purchases)' };
  }
  if (!enabled) {
    return { ...base, visible: false, payments: false, mock: false, providers: [], reason: 'STORE_ENABLED is false' };
  }
  const allowed = i.hostPayments?.[host] ?? HOST_PAYMENTS[host];
  if (!allowed) {
    // Previews may still exercise the real checkout in provider test mode (no money moves).
    if (host === 'preview' || host === 'dev') {
      return { ...base, visible: true, payments: false, mock: false, testMode: true, providers: HOST_PROVIDERS[host], reason: `${host}: test mode only` };
    }
    return { ...base, visible: false, payments: false, mock: false, providers: [], reason: `payments not cleared on ${host}` };
  }
  return { ...base, visible: true, payments: true, mock: false, providers: HOST_PROVIDERS[host], reason: 'live' };
}

/** Browser convenience: reads Vite env, location and an optional platform detection result. */
export function storeFlagsFromEnv(platform?: HostPlatformInfo): StoreFlags {
  const env = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env ?? {};
  const loc = typeof location !== 'undefined' ? location : undefined;
  return resolveStoreFlags({
    storeEnabled: env.VITE_STORE_ENABLED === '1' || env.VITE_STORE_ENABLED === 'true' || STORE_ENABLED,
    isDev: env.DEV === true,
    search: loc?.search ?? '',
    hostname: loc?.hostname ?? '',
    platform,
    buildTarget: typeof env.VITE_BUILD_TARGET === 'string' ? env.VITE_BUILD_TARGET : undefined,
  });
}
