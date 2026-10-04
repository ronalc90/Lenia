// @ts-check
'use strict';
/**
 * Bioluma desktop (Electron main process).
 *
 * Loads the built web game (../../dist copied to ./web by scripts/copy-web.mjs) from disk through a
 * privileged custom scheme, app://bioluma/, so ES modules, fetch and WebGL behave like on https while
 * the service worker stays off (src/main.ts registers it only on https:). Security: context
 * isolation, renderer sandbox, no Node in the page, strict CSP header, navigation locked to the app
 * origin, external https links handed to the system browser, all permission requests denied except
 * fullscreen and clipboard write (save export).
 *
 * Flags: --dev (DevTools allowed, F12), --fullscreen (start fullscreen),
 *        --self-test (load the game, print a JSON report, exit 0/1; used by CI on every OS;
 *        BIOLUMA_SELF_TEST_SHOT=/path.png also saves a screenshot).
 */
const { app, BrowserWindow, Menu, ipcMain, protocol, screen, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createSteam } = require('./steam.cjs');

const pkg = require('./package.json');
/** Injected by electron-builder `extraMetadata` (see electron-builder.steam.cjs). */
const meta = /** @type {{ steamAppId?: number, steamRelaunch?: boolean, store?: 'steam' | 'standalone' }} */ (pkg.bioluma || {});

const SCHEME = 'app';
const HOST = 'bioluma';
const ORIGIN = `${SCHEME}://${HOST}`;
const WEB_ROOT = path.join(__dirname, 'web');
const DEV = process.argv.includes('--dev');
const SELF_TEST = process.argv.includes('--self-test');
const BG = '#0B0E12';

/** Content Security Policy sent with every app:// response. Google Fonts load when online (fallback: system fonts). */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self' https:", // leaderboard / analytics endpoints must be absolute https URLs
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

const log = (/** @type {string} */ msg) => console.log(`[bioluma] ${msg}`);

// ── Must happen before 'ready' ──────────────────────────────────────────────────────────────────
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true },
  },
]);

// CI runners have no GPU: allow Chromium's software WebGL only for the self-test.
if (SELF_TEST) app.commandLine.appendSwitch('enable-unsafe-swiftshader');

if (!SELF_TEST && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  main();
}

function main() {
  const steamAppId = meta.steamAppId || (DEV ? readDevSteamAppId() : undefined);
  const steam = createSteam({
    appId: steamAppId,
    relaunchViaSteam: app.isPackaged && meta.steamRelaunch === true && !SELF_TEST,
    userData: () => app.getPath('userData'),
    log,
  });
  if (steam.restart) {
    app.quit();
    return;
  }

  /** @type {BrowserWindow | null} */
  let win = null;

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    registerProtocol();
    lockDownSession();
    setMenu();
    registerIpc(() => win, steam);
    win = createWindow(steam);
    win.on('closed', () => (win = null));
    app.on('activate', () => {
      if (!win) {
        win = createWindow(steam);
        win.on('closed', () => (win = null));
      }
    });
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => steam.flush());
}

/** steam_appid.txt next to package.json, for local testing only (480 = Spacewar). */
function readDevSteamAppId() {
  try {
    const id = Number(fs.readFileSync(path.join(__dirname, 'steam_appid.txt'), 'utf8').trim());
    return Number.isInteger(id) && id > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}

function registerProtocol() {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== HOST || request.method !== 'GET') return new Response('Not found', { status: 404 });
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(WEB_ROOT, rel));
    if (!file.startsWith(WEB_ROOT + path.sep)) return new Response('Forbidden', { status: 403 });
    try {
      const body = await fs.promises.readFile(file); // works inside app.asar
      const type = MIME[/** @type {keyof typeof MIME} */ (path.extname(file).toLowerCase())] || 'application/octet-stream';
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': type,
          'Content-Security-Policy': CSP,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-cache',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function lockDownSession() {
  const allowed = new Set(['fullscreen', 'clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
}

function setMenu() {
  if (process.platform === 'darwin') {
    // macOS keeps a minimal menu in the system bar: Cmd+Q, copy/paste in text fields, fullscreen.
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]),
    );
  } else {
    Menu.setApplicationMenu(null); // no menu bar on Windows/Linux (also removes Ctrl+R reload)
  }
}

/** @param {() => BrowserWindow | null} getWin @param {ReturnType<typeof createSteam>} steam */
function registerIpc(getWin, steam) {
  /** Only accept IPC from our own page. */
  const trusted = (/** @type {Electron.IpcMainInvokeEvent} */ e) => e.senderFrame?.url.startsWith(`${ORIGIN}/`) === true;
  ipcMain.handle('bioluma:achievement', (e, id) => trusted(e) && steam.unlock(id));
  ipcMain.handle('bioluma:fullscreen', (e) => {
    const w = getWin();
    if (!trusted(e) || !w) return false;
    w.setFullScreen(!w.isFullScreen());
    return w.isFullScreen();
  });
  ipcMain.handle('bioluma:open-external', async (e, url) => {
    if (!trusted(e) || !isExternalHttp(url)) return false;
    await shell.openExternal(url);
    return true;
  });
  ipcMain.handle('bioluma:stats', (e, stats) => trusted(e) && steam.setStats(stats));
  ipcMain.handle('bioluma:save-read', (e) => (trusted(e) ? steam.readSave() : null));
  ipcMain.handle('bioluma:save-write', (e, text) => (trusted(e) ? steam.writeSave(text) : false));
  // Cosmetic DLC (src/store/providers/steam.ts): no-ops returning []/false/null without Steam.
  ipcMain.handle('bioluma:dlc-owned', (e, ids) => (trusted(e) ? steam.ownedDlc(ids) : []));
  ipcMain.handle('bioluma:dlc-store', (e, id) => (trusted(e) ? steam.openDlcStore(id) : false));
  ipcMain.handle('bioluma:auth-ticket', (e) => (trusted(e) ? steam.authTicket() : null));
  ipcMain.on('bioluma:quit', (e) => {
    if (trusted(e)) app.quit();
  });
}

/** @param {unknown} url */
function isExternalHttp(url) {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

// ── Window state (size, position, fullscreen) persisted in userData/window-state.json ─────────────
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

/** @returns {{ width: number, height: number, x?: number, y?: number, maximized?: boolean, fullscreen?: boolean }} */
function loadWindowState() {
  const fallback = { width: 1280, height: 800 }; // Steam Deck native resolution
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    const visible =
      typeof s.x !== 'number' ||
      screen.getAllDisplays().some(({ workArea: a }) => s.x >= a.x - 50 && s.y >= a.y - 50 && s.x < a.x + a.width && s.y < a.y + a.height);
    return visible && s.width >= 400 && s.height >= 600 ? s : fallback;
  } catch {
    return fallback;
  }
}

/** @param {BrowserWindow} win */
function saveWindowState(win) {
  try {
    const b = win.getNormalBounds();
    const s = { ...b, maximized: win.isMaximized(), fullscreen: win.isFullScreen() };
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify(s));
  } catch {
    /* not critical */
  }
}

/** @param {ReturnType<typeof createSteam>} steam */
function createWindow(steam) {
  const state = loadWindowState();
  const info = {
    os: process.platform,
    version: app.getVersion(),
    store: meta.store || (meta.steamAppId ? 'steam' : 'standalone'),
    steam: steam.available,
  };
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 400,
    minHeight: 600,
    title: 'Bioluma',
    backgroundColor: BG,
    show: false,
    autoHideMenuBar: true,
    icon: process.platform === 'linux' ? path.join(__dirname, 'build', 'icon.png') : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      devTools: DEV,
      additionalArguments: [`--bioluma-info=${encodeURIComponent(JSON.stringify(info))}`],
    },
  });

  win.once('ready-to-show', () => {
    if (state.maximized) win.maximize();
    win.show();
    if (state.fullscreen || process.argv.includes('--fullscreen') || steam.isSteamDeck()) win.setFullScreen(true);
  });
  win.on('close', () => saveWindowState(win));

  const wc = win.webContents;
  // External links: never open a second Electron window; http(s) goes to the system browser.
  wc.setWindowOpenHandler(({ url }) => {
    if (isExternalHttp(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (url.startsWith(`${ORIGIN}/`)) return;
    e.preventDefault();
    if (isExternalHttp(url)) void shell.openExternal(url);
  });
  wc.on('will-attach-webview', (e) => e.preventDefault());

  // Keys handled before the page sees them. Escape is left to the game (closes panels).
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const toggleFs = input.key === 'F11' || (input.alt && input.key === 'Enter');
    if (toggleFs) {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    } else if (DEV && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
      wc.toggleDevTools();
      e.preventDefault();
    } else if (DEV && input.control && input.key.toLowerCase() === 'r') {
      wc.reload();
      e.preventDefault();
    }
  });

  wc.on('render-process-gone', (_e, details) => {
    log(`renderer gone: ${details.reason}`);
    if (details.reason !== 'clean-exit' && !win.isDestroyed()) wc.reload();
  });

  if (SELF_TEST) runSelfTest(win);
  void win.loadURL(`${ORIGIN}/index.html`);
  return win;
}

/** Boots the game, checks the essentials from inside the page and exits with 0 (ok) or 1. */
function runSelfTest(/** @type {BrowserWindow} */ win) {
  const wc = win.webContents;
  /** @type {string[]} */ const errors = [];
  wc.on('console-message', (/** @type {any} */ e, /** @type {any} */ level, /** @type {any} */ message) => {
    const lvl = e && typeof e.level === 'string' ? e.level : level; // Electron >= 35 passes one event object
    const msg = e && typeof e.message === 'string' ? e.message : message;
    if (lvl === 'error' || lvl === 3) errors.push(String(msg));
  });
  const bail = setTimeout(() => {
    console.log('[bioluma:self-test] {"ok":false,"reason":"timeout"}');
    app.exit(2);
  }, 45_000);
  wc.once('did-finish-load', () => void check().catch((err) => {
    console.log(`[bioluma:self-test] ${JSON.stringify({ ok: false, reason: String((err && err.message) || err), errors })}`);
    app.exit(1);
  }));
  async function check() {
    await new Promise((r) => setTimeout(r, 5000)); // let the game boot and render a few frames
    const report = await wc.executeJavaScript(`(async () => ({
      url: location.href,
      bridge: window.bioluma_platform && window.bioluma_platform.kind,
      store: window.bioluma_platform && window.bioluma_platform.store,
      booted: !document.getElementById('boot'),
      appDom: document.querySelectorAll('#app *').length,
      webgl2: !!document.createElement('canvas').getContext('webgl2'),
      // app:// cannot host service workers at all (getRegistrations throws SecurityError): that is the goal.
      serviceWorkers: await navigator.serviceWorker.getRegistrations().then((r) => r.length, () => 0),
      nodeLeak: typeof require !== 'undefined' || typeof process !== 'undefined',
    }))()`);
    const shot = process.env.BIOLUMA_SELF_TEST_SHOT;
    if (shot) fs.writeFileSync(shot, (await wc.capturePage()).toPNG());
    const csp = errors.filter((m) => /Content Security Policy|Refused to/i.test(m));
    const ok = report.bridge === 'electron' && report.booted && report.appDom > 0 && report.serviceWorkers === 0 && !report.nodeLeak && csp.length === 0;
    console.log(`[bioluma:self-test] ${JSON.stringify({ ok, ...report, errors })}`);
    clearTimeout(bail);
    app.exit(ok ? 0 : 1);
  }
}
