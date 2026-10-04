// @ts-check
'use strict';
/**
 * Preload (sandboxed, context-isolated). Exposes a tiny, explicit API to the page as
 * `window.bioluma_platform`; the page never gets ipcRenderer or Node. The contract is the
 * `DesktopBridge` interface in platforms/shared/platform.ts; keep both in sync.
 */
const { contextBridge, ipcRenderer } = require('electron');

/** Static info passed by the main process through webPreferences.additionalArguments. */
function readInfo() {
  const arg = process.argv.find((a) => a.startsWith('--bioluma-info='));
  try {
    return arg ? JSON.parse(decodeURIComponent(arg.slice('--bioluma-info='.length))) : {};
  } catch {
    return {};
  }
}
const info = readInfo();

contextBridge.exposeInMainWorld('bioluma_platform', {
  kind: 'electron',
  os: String(info.os || process.platform),
  version: String(info.version || ''),
  store: info.store === 'steam' ? 'steam' : 'standalone',
  steam: info.steam === true,
  /** @param {string} id game achievement id (src/game/balance.ts ACHIEVEMENTS) */
  unlockAchievement: (id) => ipcRenderer.invoke('bioluma:achievement', String(id)),
  /** @param {Record<string, number>} stats absolute STAT_* values (Steam progress stats) */
  setStats: (stats) => ipcRenderer.invoke('bioluma:stats', { ...stats }),
  toggleFullscreen: () => ipcRenderer.invoke('bioluma:fullscreen'),
  /** @param {string} url */
  openExternal: (url) => ipcRenderer.invoke('bioluma:open-external', String(url)),
  quit: () => ipcRenderer.send('bioluma:quit'),
  cloudSave: {
    read: () => ipcRenderer.invoke('bioluma:save-read'),
    /** @param {string} text */
    write: (text) => ipcRenderer.invoke('bioluma:save-write', String(text)),
  },
});
