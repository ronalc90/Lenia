/**
 * Bioluma platform layer: one tiny, dependency-free module that tells the game where it runs
 * (browser, installed PWA, TWA, Electron/Steam, Capacitor Android/iOS, galaxy.click, itch.io,
 * CrazyGames) and exposes the few native hooks the game needs.
 *
 * It never imports a wrapper SDK. It talks to:
 *   - Electron: `window.bioluma_platform`, exposed by platforms/desktop/preload.cjs
 *     (contextBridge; Steam achievements, fullscreen, external links, Steam Cloud file mirror);
 *   - Capacitor: the `window.Capacitor` global that the native shell injects (native-bridge.js);
 *     we call core plugins by name (`App`, `Haptics`, `SystemBars`) through `nativePromise` /
 *     `nativeCallback`, exactly what @capacitor/core does internally, so the web build needs no
 *     npm dependency (platforms/mobile/scripts/check-bridge.mjs verifies those globals still exist);
 *   - galaxy.click: the documented postMessage cloud-save API (https://galaxy.click/docs/dev).
 *
 * INTEGRATION (src/main.ts, integrator-owned). Move this file to src/platform/platform.ts so the
 * root tsconfig checks it, then:
 *
 *   import { initPlatform } from './platform/platform';
 *   const platform = initPlatform({
 *     onBack: () => ui.handleBack(),   // true when a modal/card/mode was closed (see note below)
 *     onPause: save,                   // Capacitor app went to background: save now
 *   });
 *   bus.on('achievement', (e) => platform.unlockAchievement(e.id));          // Steam
 *   platform.syncAchievements(game.view().achievements.filter((a) => a.done).map((a) => a.id));
 *   // every autosave (30 s): absolute values, see STEAM_STATS below and platforms/steam/achievements.json
 *   platform.reportStats({ STAT_SPECIES: v.species.length, STAT_ERA: v.era, ... });
 *   // story / secrets (platforms/steam/achievements.json lists them all, hidden on Steam):
 *   platform.unlockAchievement(endingAchievementId('harvest'));   // -> 'endingHarvest' -> ACH_ENDING_HARVEST
 *   platform.unlockAchievement(secretAchievementId('fullMoon'));  // -> 'secretFullMoon' -> ACH_SECRET_FULL_MOON
 *   if (!platform.shouldRegisterServiceWorker()) skip registerServiceWorker();
 *   // Settings > "Install app" button: show only when platform.installHint() !== null.
 *   // Optional juice: platform.haptic('light') on seed, 'success' on new species (honour a setting).
 *
 * `ui.handleBack()` does not exist yet: it should run the same branch as the Escape key in
 * ui.ts bindKeys() and return whether something was closed. Without `onBack`, a back press sends a
 * synthetic Escape and a second press within 2 s minimises the app.
 */

export type PlatformKind = 'web' | 'pwa' | 'twa' | 'electron' | 'capacitor';
export type PlatformOS = 'android' | 'ios' | 'windows' | 'macos' | 'linux' | 'other';
export type Portal = 'galaxy' | 'itch' | 'crazygames' | null;
export type Haptic = 'light' | 'medium' | 'heavy' | 'success' | 'warning';

/** Steam INT stats (platforms/steam/achievements.json `stats`): progress bars + auto-unlock of tiers. */
export const STEAM_STATS = [
  'STAT_SEEDS', // stats.seeds (lifetime)
  'STAT_SPECIES', // species registered
  'STAT_CATALOG_SPECIES', // catalog species registered (new metric)
  'STAT_BEHAVIORS', // behaviours seen
  'STAT_GOLDEN', // sparks caught
  'STAT_ERA', // stats.extinctions + 1
  'STAT_GENOME_NODES', // genome nodes bought
  'STAT_STABLE_PEAK', // most stable creatures at once
  'STAT_EPS_PEAK', // peak essence per second (int)
  'STAT_ESSENCE_LOG10', // floor(log10(total essence))
  'STAT_PLAY_MINUTES', // floor(playTime / 60)
] as const;
export type SteamStat = (typeof STEAM_STATS)[number];

const cap = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
/** Achievement id of a story ending (src/story EndingId): 'harvest' -> 'endingHarvest'. */
export const endingAchievementId = (endingId: string): string => `ending${cap(endingId)}`;
/** Achievement id of a secret (src/secrets SecretId): 'fullMoon' -> 'secretFullMoon'. */
export const secretAchievementId = (secretId: string): string => `secret${cap(secretId)}`;

/** Shape of `window.bioluma_platform` exposed by platforms/desktop/preload.cjs. */
export interface DesktopBridge {
  kind: 'electron';
  os: 'win32' | 'darwin' | 'linux';
  version: string;
  store: 'steam' | 'standalone';
  /** Steam client connected and the app id initialised. */
  steam: boolean;
  unlockAchievement(id: string): Promise<boolean>;
  setStats(stats: Partial<Record<SteamStat, number>>): Promise<boolean>;
  toggleFullscreen(): Promise<boolean>;
  openExternal(url: string): Promise<boolean>;
  quit(): void;
  /** Plain-text save mirrored to a file that Steam Auto-Cloud syncs. */
  cloudSave: { read(): Promise<string | null>; write(text: string): Promise<boolean> };
}

/** A remote save slot (galaxy.click account, Steam Cloud file). Data is `game.exportString()`. */
export interface CloudSave {
  readonly provider: 'galaxy' | 'steam';
  load(): Promise<string | null>;
  save(data: string, label?: string): Promise<boolean>;
}

export interface PlatformInfo {
  kind: PlatformKind;
  os: PlatformOS;
  /** Embedded in a game portal iframe. */
  portal: Portal;
  /** Electron or Capacitor shell (local files, no browser chrome). */
  native: boolean;
  /** Steam client available (Electron Steam build only). */
  steam: boolean;
}

export interface Platform extends PlatformInfo {
  /** 'prompt' = we hold a beforeinstallprompt; 'ios' = show "Share > Add to Home Screen"; null = hide. */
  installHint(): 'prompt' | 'ios' | null;
  /** Shows the browser install dialog (only when installHint() === 'prompt'). */
  promptInstall(): Promise<boolean>;
  /** False in native shells and portal iframes (assets are local / third-party storage). */
  shouldRegisterServiceWorker(): boolean;
  unlockAchievement(id: string): void;
  /** Re-sends every unlocked achievement (Steam ignores ones already set). Call once at boot. */
  syncAchievements(ids: readonly string[]): void;
  /** Absolute stat values for Steam (no-op elsewhere). Cheap: call it on every autosave. */
  reportStats(stats: Partial<Record<SteamStat, number>>): void;
  haptic(kind: Haptic): void;
  toggleFullscreen(): void;
  /** Hide (true) or show the Android/iOS system bars. No-op elsewhere. */
  setImmersive(on: boolean): void;
  openExternal(url: string): void;
  /** Cloud save for this host, or null (plain browser: local save only). */
  cloudSave: CloudSave | null;
  dispose(): void;
}

export interface PlatformOptions {
  /** Android back button / TWA back gesture. Return true when the game consumed it. */
  onBack?: () => boolean;
  /** Capacitor: app sent to background. */
  onPause?: () => void;
  /** Capacitor: app back in the foreground. */
  onResume?: () => void;
}

// ───────────────────────────── host globals (typed loosely, never imported) ─────────────────────

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  nativePromise?: (plugin: string, method: string, options?: object) => Promise<unknown>;
  nativeCallback?: (plugin: string, method: string, options: object, cb: (data: unknown) => void) => unknown;
}
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
type HostWindow = Window & {
  bioluma_platform?: DesktopBridge;
  Capacitor?: CapacitorGlobal;
};

const GALAXY_ORIGIN = 'https://galaxy.click';
const TWA_FLAG = 'bioluma.twa';

function capacitorOf(w: HostWindow): CapacitorGlobal | null {
  const cap = w.Capacitor;
  return cap?.isNativePlatform?.() && typeof cap.nativePromise === 'function' ? cap : null;
}

function osOf(w: HostWindow): PlatformOS {
  const ua = w.navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  // iPadOS reports "Macintosh" but has touch.
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && w.navigator.maxTouchPoints > 1)) return 'ios';
  if (/windows/i.test(ua)) return 'windows';
  if (/mac os x|macintosh/i.test(ua)) return 'macos';
  if (/linux|cros/i.test(ua)) return 'linux';
  return 'other';
}

function portalOf(w: HostWindow): Portal {
  const host = w.location.hostname;
  let ref = '';
  try {
    ref = w.document.referrer ? new URL(w.document.referrer).origin : '';
  } catch {
    /* ignore malformed referrer */
  }
  const parent = w.location.ancestorOrigins?.[0] ?? ref;
  const parentHost = parent.replace(/^https?:\/\//, '');
  if (parent === GALAXY_ORIGIN) return 'galaxy';
  if (host.endsWith('.itch.zone') || host.endsWith('.hwcdn.net') || /(^|\.)itch\.io$/.test(parentHost)) return 'itch';
  if (/(^|\.)crazygames\./.test(host) || /(^|\.)crazygames\./.test(parentHost)) return 'crazygames';
  return null;
}

/** Pure detection, safe to call any time. */
export function detectPlatform(w: HostWindow = window as HostWindow): PlatformInfo {
  const bridge = w.bioluma_platform;
  if (bridge?.kind === 'electron') {
    const os: PlatformOS = bridge.os === 'win32' ? 'windows' : bridge.os === 'darwin' ? 'macos' : 'linux';
    return { kind: 'electron', os, portal: null, native: true, steam: !!bridge.steam };
  }
  const cap = capacitorOf(w);
  if (cap) {
    const os: PlatformOS = cap.getPlatform?.() === 'ios' ? 'ios' : 'android';
    return { kind: 'capacitor', os, portal: null, native: true, steam: false };
  }
  const os = osOf(w);
  const portal = w.self !== w.top ? portalOf(w) : null;
  // A TWA opens the start URL with an android-app:// referrer; remember it for later reloads.
  let twa = w.document.referrer.startsWith('android-app://');
  try {
    if (twa) w.sessionStorage.setItem(TWA_FLAG, '1');
    else twa = w.sessionStorage.getItem(TWA_FLAG) === '1';
  } catch {
    /* storage blocked */
  }
  const standalone =
    w.matchMedia?.('(display-mode: standalone)').matches ||
    w.matchMedia?.('(display-mode: fullscreen)').matches ||
    (w.navigator as { standalone?: boolean }).standalone === true;
  const kind: PlatformKind = twa ? 'twa' : standalone ? 'pwa' : 'web';
  return { kind, os, portal, native: false, steam: false };
}

// ───────────────────────────── cloud saves ─────────────────────────────

function galaxyCloudSave(w: HostWindow, slot = 0, timeoutMs = 10_000): CloudSave {
  type Reply = { type?: string; error?: boolean; slot?: number; content?: string; message?: string };
  const ask = (msg: object, want: string): Promise<Reply | null> =>
    new Promise((resolve) => {
      const done = (r: Reply | null) => {
        w.removeEventListener('message', onMsg);
        clearTimeout(timer);
        resolve(r);
      };
      const onMsg = (e: MessageEvent) => {
        const d = e.data as Reply | null;
        if (e.origin === GALAXY_ORIGIN && d && d.type === want && d.slot === slot) done(d);
      };
      const timer = setTimeout(() => done(null), timeoutMs);
      w.addEventListener('message', onMsg);
      w.top?.postMessage(msg, GALAXY_ORIGIN);
    });
  return {
    provider: 'galaxy',
    async load() {
      const r = await ask({ action: 'load', slot }, 'save_content');
      return r && !r.error && typeof r.content === 'string' ? r.content : null; // empty_slot / no_account -> null
    },
    async save(data, label = 'Bioluma') {
      // Limit: 256,000 bytes per slot, 11 slots (0..10).
      const r = await ask({ action: 'save', slot, label, data }, 'saved');
      return !!r && !r.error;
    },
  };
}

// ───────────────────────────── initialisation ─────────────────────────────

export function initPlatform(opts: PlatformOptions = {}): Platform {
  const w = window as HostWindow;
  const info = detectPlatform(w);
  const bridge = info.kind === 'electron' ? w.bioluma_platform! : null;
  const cap = info.kind === 'capacitor' ? capacitorOf(w) : null;
  const cleanups: (() => void)[] = [];
  const call = (plugin: string, method: string, options: object = {}) =>
    void cap?.nativePromise?.(plugin, method, options).catch(() => undefined);

  // Back button: our handler, else synthetic Escape; two unconsumed presses within 2 s leave the app.
  let lastBack = 0;
  const handleBack = (exit: () => void) => {
    if (opts.onBack) {
      if (!opts.onBack()) exit();
      return;
    }
    const now = Date.now();
    if (now - lastBack < 2000) return exit();
    lastBack = now;
    w.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  };

  if (cap?.nativeCallback) {
    const listen = (eventName: string, fn: () => void) => cap.nativeCallback!('App', 'addListener', { eventName }, fn);
    // Registering a backButton listener disables Capacitor's default (history back / finish).
    listen('backButton', () => handleBack(() => call('App', 'minimizeApp')));
    if (opts.onPause) listen('pause', opts.onPause);
    if (opts.onResume) listen('resume', opts.onResume);
    call('SystemBars', 'setStyle', { style: 'DARK' }); // light icons on the dark game background
  } else if (info.kind === 'twa' || (info.kind === 'pwa' && info.os === 'android')) {
    // Installed web app on Android: trap one history entry so the back gesture reaches the game.
    const trap = () => w.history.pushState({ biolumaBackTrap: true }, '');
    trap();
    const onPopState = () => {
      let leaving = false;
      handleBack(() => {
        leaving = true;
        w.history.back(); // past our entry: the TWA / standalone window closes
      });
      if (!leaving) trap();
    };
    w.addEventListener('popstate', onPopState);
    cleanups.push(() => w.removeEventListener('popstate', onPopState));
  }

  // PWA install prompt (Chromium). Never offered inside native shells or portal iframes.
  let deferred: InstallPromptEvent | null = null;
  const onBip = (e: Event) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
  };
  const onInstalled = () => (deferred = null);
  if (!info.native && !info.portal && info.kind === 'web') {
    w.addEventListener('beforeinstallprompt', onBip);
    w.addEventListener('appinstalled', onInstalled);
    cleanups.push(() => {
      w.removeEventListener('beforeinstallprompt', onBip);
      w.removeEventListener('appinstalled', onInstalled);
    });
  }

  const cloudSave: CloudSave | null =
    info.portal === 'galaxy'
      ? galaxyCloudSave(w)
      : bridge
        ? { provider: 'steam', load: () => bridge.cloudSave.read(), save: (d) => bridge.cloudSave.write(d) }
        : null;

  const unlockAchievement = (id: string) => void bridge?.unlockAchievement(id).catch(() => false);

  return {
    ...info,
    installHint() {
      if (deferred) return 'prompt';
      return info.kind === 'web' && info.os === 'ios' && !info.portal ? 'ios' : null;
    },
    async promptInstall() {
      if (!deferred) return false;
      const ev = deferred;
      deferred = null;
      await ev.prompt();
      return (await ev.userChoice).outcome === 'accepted';
    },
    shouldRegisterServiceWorker() {
      return !info.native && !info.portal && w.location.protocol === 'https:';
    },
    unlockAchievement,
    syncAchievements(ids) {
      if (bridge?.steam) ids.forEach(unlockAchievement);
    },
    reportStats(stats) {
      if (bridge?.steam) void bridge.setStats(stats).catch(() => false);
    },
    haptic(kind) {
      if (cap) {
        if (kind === 'success' || kind === 'warning') call('Haptics', 'notification', { type: kind.toUpperCase() });
        else call('Haptics', 'impact', { style: kind.toUpperCase() });
      } else if (info.os === 'android') {
        w.navigator.vibrate?.(kind === 'heavy' ? 30 : kind === 'medium' ? 18 : 10);
      }
    },
    toggleFullscreen() {
      if (bridge) return void bridge.toggleFullscreen();
      const d = w.document;
      if (d.fullscreenElement) void d.exitFullscreen().catch(() => undefined);
      else void d.documentElement.requestFullscreen?.().catch(() => undefined);
    },
    setImmersive(on) {
      call('SystemBars', on ? 'hide' : 'show');
    },
    openExternal(url) {
      if (!/^https:\/\//.test(url)) return;
      if (bridge) void bridge.openExternal(url);
      else w.open(url, '_blank', 'noopener,noreferrer'); // Capacitor opens http(s) popups in the system browser
    },
    cloudSave,
    dispose() {
      cleanups.forEach((f) => f());
    },
  };
}
