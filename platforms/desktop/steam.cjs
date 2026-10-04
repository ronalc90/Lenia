// @ts-check
'use strict';
/**
 * Optional Steamworks bridge for the Electron main process (steamworks.js, an optionalDependency).
 *
 * The game must run identically without Steam: if the build has no Steam app id, if steamworks.js is
 * not installed, or if the Steam client is not running, every call below is a harmless no-op.
 *
 * Achievement ids: the game uses the ids of src/game/balance.ts ACHIEVEMENTS ("firstSeed",
 * "essence1e4", ...) plus the planned ones of platforms/steam/achievements.json (story endings,
 * secrets, eras...). The bridge map gameId -> Steam API name is that file's `bridgeMap`, copied
 * next to this file as steam-achievements.json by scripts/copy-web.mjs; ids missing from the map
 * fall back to steamApiName(), the same rule the generator uses (gen-achievements.ts).
 * Stats (STAT_*) back the progress bars and auto-unlock of tiered achievements.
 */
const fs = require('node:fs');
const path = require('node:path');

/** "firstSeed" -> "ACH_FIRST_SEED", "essence1e4" -> "ACH_ESSENCE_1E4", "eps100" -> "ACH_EPS_100". */
function steamApiName(id) {
  const snake = String(id)
    .replace(/([a-z])([A-Z])/g, '$1_$2') // camelCase boundaries
    .replace(/([a-z])(\d)/, '$1_$2'); // first letter->digit boundary only (keeps "1e4" intact)
  return `ACH_${snake.toUpperCase()}`;
}

const SAVE_FILE = 'bioluma-save.txt';
const STAT_STORE_MS = 60_000; // Steam asks games not to call StoreStats too often

/** @returns {Record<string, string>} gameId -> Steam API name */
function loadBridgeMap() {
  try {
    const map = JSON.parse(fs.readFileSync(path.join(__dirname, 'steam-achievements.json'), 'utf8'));
    return map && typeof map === 'object' ? map : {};
  } catch {
    return {};
  }
}

/**
 * @param {{ appId?: number, relaunchViaSteam?: boolean, userData: () => string, log: (msg: string) => void }} opts
 */
function createSteam(opts) {
  /** @type {any} */ let sw = null;
  /** @type {any} */ let client = null;
  let restart = false;

  if (opts.appId) {
    try {
      sw = require('steamworks.js');
    } catch (err) {
      opts.log(`steamworks.js not available: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (sw && opts.appId) {
    try {
      // Opt-in (STEAM_RELAUNCH=1 at build time): launched outside Steam, quit and let Steam relaunch
      // the game through the client. Off by default so the game also starts without Steam at all.
      if (opts.relaunchViaSteam && sw.restartAppIfNecessary(opts.appId)) {
        restart = true;
        opts.log('relaunching through Steam');
      }
    } catch {
      /* no Steam installed: keep going without it */
    }
    if (!restart) {
      try {
        client = sw.init(opts.appId);
        // Must run before app 'ready': adds the GPU switches the overlay needs.
        sw.electronEnableSteamOverlay();
        opts.log(`Steam ready (app ${opts.appId})`);
      } catch (err) {
        client = null;
        opts.log(`Steam not running, continuing without it: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  const localSavePath = () => path.join(opts.userData(), 'saves', SAVE_FILE);
  const bridgeMap = loadBridgeMap();
  /** @type {NodeJS.Timeout | null} */ let storeTimer = null;
  let lastStore = 0;
  const storeStats = () => {
    storeTimer = null;
    lastStore = Date.now();
    try {
      client?.stats.store();
    } catch {
      /* ignore */
    }
  };

  return {
    /** True when the game should quit because Steam is relaunching it. */
    restart,
    get available() {
      return !!client;
    },
    isSteamDeck() {
      try {
        return !!client?.utils.isSteamRunningOnSteamDeck();
      } catch {
        return false;
      }
    },
    /** @param {string} id game achievement id */
    unlock(id) {
      if (!client || typeof id !== 'string' || !/^[A-Za-z0-9_]{1,64}$/.test(id)) return false;
      try {
        const name = bridgeMap[id] || steamApiName(id);
        return client.achievement.isActivated(name) || client.achievement.activate(name);
      } catch {
        return false;
      }
    },
    /**
     * Absolute values of STAT_* integer stats (see platforms/steam/achievements.json `stats`).
     * Written immediately, stored to Steam at most once a minute.
     * @param {Record<string, number>} stats
     */
    setStats(stats) {
      if (!client || !stats || typeof stats !== 'object') return false;
      let changed = false;
      for (const [name, value] of Object.entries(stats)) {
        if (!/^STAT_[A-Z0-9_]{1,60}$/.test(name) || typeof value !== 'number' || !Number.isFinite(value)) continue;
        try {
          const v = Math.max(0, Math.min(2147483647, Math.floor(value)));
          if ((client.stats.getInt(name) ?? 0) < v) changed = client.stats.setInt(name, v) || changed;
        } catch {
          /* stat not defined in Steamworks yet */
        }
      }
      if (changed && !storeTimer) storeTimer = setTimeout(storeStats, Math.max(0, lastStore + STAT_STORE_MS - Date.now()));
      return changed;
    },
    /** Flush pending stats (call on quit). */
    flush() {
      if (storeTimer) {
        clearTimeout(storeTimer);
        storeStats();
      }
    },
    /** Save text: always a local file in userData/saves, plus Steam Cloud (Remote Storage) when available. */
    async writeSave(text) {
      if (typeof text !== 'string' || text.length > 1_000_000) return false;
      let ok = false;
      try {
        const file = localSavePath();
        await fs.promises.mkdir(path.dirname(file), { recursive: true });
        await fs.promises.writeFile(`${file}.tmp`, text, 'utf8');
        await fs.promises.rename(`${file}.tmp`, file);
        ok = true;
      } catch (err) {
        opts.log(`local save mirror failed: ${err}`);
      }
      try {
        if (client?.cloud.isEnabledForAccount() && client.cloud.isEnabledForApp()) {
          ok = client.cloud.writeFile(SAVE_FILE, text) || ok;
        }
      } catch {
        /* cloud quota not configured: local file is enough */
      }
      return ok;
    },
    /**
     * Cosmetic DLC owned by this Steam account (src/store/providers/steam.ts). Empty without Steam.
     * @param {unknown} appIds
     * @returns {number[]}
     */
    ownedDlc(appIds) {
      if (!client || !Array.isArray(appIds)) return [];
      return appIds.filter((id) => {
        if (!Number.isInteger(id) || id <= 0) return false;
        try {
          return !!client.apps.isDlcInstalled(id);
        } catch {
          return false;
        }
      });
    },
    /**
     * Open the Steam overlay on a DLC's store page with it added to the cart. False without Steam.
     * @param {unknown} appId
     */
    openDlcStore(appId) {
      if (!client || !Number.isInteger(appId) || /** @type {number} */ (appId) <= 0) return false;
      try {
        client.overlay.activateToStore(appId, 2 /* EOverlayToStoreFlag AddToCartAndShow */);
        return true;
      } catch {
        return false;
      }
    },
    /** Hex session ticket for server-side ownership checks (ISteamUser), or null. */
    async authTicket() {
      if (!client?.auth?.getSessionTicket) return null;
      try {
        const t = await client.auth.getSessionTicket();
        const bytes = t?.getBytes?.();
        return bytes ? Buffer.from(bytes).toString('hex') : null;
      } catch {
        return null;
      }
    },
    async readSave() {
      try {
        if (client?.cloud.isEnabledForApp() && client.cloud.fileExists(SAVE_FILE)) return client.cloud.readFile(SAVE_FILE);
      } catch {
        /* fall through to the local file */
      }
      try {
        return await fs.promises.readFile(localSavePath(), 'utf8');
      } catch {
        return null;
      }
    },
  };
}

module.exports = { createSteam, steamApiName };
