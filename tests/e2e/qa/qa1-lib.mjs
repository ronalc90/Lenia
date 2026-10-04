// Shared helpers for QA scripts (QA #1 functional). Headless Chromium via playwright-core.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export function findChromium() {
  const base = '/opt/pw-browsers';
  for (const d of readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const p = `${base}/${d}/chrome-linux/chrome`;
    if (existsSync(p)) return p;
  }
  throw new Error('chromium not found under /opt/pw-browsers');
}

export const GL_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--autoplay-policy=no-user-gesture-required',
];

export const VIEWPORTS = {
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { width: 1366, height: 768, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
};

/** Start `vite preview` on an outDir; resolves { url, kill }. If BIOLUMA_URL is set, reuse it. */
export async function serve(outDir) {
  if (process.env.BIOLUMA_URL) return { url: process.env.BIOLUMA_URL, kill() {} };
  const port = 5000 + Math.floor(Math.random() * 999);
  // Spawn vite itself (not through npx) so kill() really stops the server; run from the repo root.
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const server = spawn(process.execPath, [`${root}node_modules/vite/bin/vite.js`, 'preview', '--outDir', outDir, '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('preview did not start')), 20000);
    server.stdout.on('data', (d) => {
      if (String(d).includes(String(port))) {
        clearTimeout(t);
        res();
      }
    });
  });
  return { url: `http://localhost:${port}/`, kill: () => server.kill() };
}

export async function launch() {
  return chromium.launch({ executablePath: findChromium(), args: GL_ARGS });
}

const IGNORE = /ERR_CERT|fonts\.(googleapis|gstatic)|Failed to load resource/;

/** New context + page with console capture. */
export async function openPage(browser, url, { vp = 'mobile', locale = 'es-CO', init = [], storage } = {}) {
  const v = VIEWPORTS[vp] ?? vp;
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: v.deviceScaleFactor ?? 1,
    isMobile: !!v.isMobile,
    hasTouch: !!v.hasTouch,
    locale,
    ...(storage ? { storageState: storage } : {}),
  });
  for (const s of init) await ctx.addInitScript(s);
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  page.setDefaultNavigationTimeout(120000);
  const log = { errors: [], warnings: [], all: [] };
  page.on('console', (m) => {
    const t = m.text() + ' ' + (m.location()?.url ?? '');
    if (IGNORE.test(t)) return;
    log.all.push(`${m.type()}: ${m.text()}`);
    if (m.type() === 'error') log.errors.push(m.text());
    if (m.type() === 'warning') log.warnings.push(m.text());
  });
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  await page.goto(url);
  return { ctx, page, log, vp: v };
}

export async function waitGame(page) {
  await page.waitForFunction(() => !!window.bioluma, null, { timeout: 90000 });
}

/** Splash → skip tutorial. */
export async function startGame(page) {
  await waitGame(page);
  await page.waitForTimeout(600);
  const splash = page.locator('[data-testid="splash"]');
  if (await splash.isVisible().catch(() => false)) {
    await splash.click();
    await page.waitForTimeout(800);
  }
  const skip = page.locator('[data-testid="tutorial-skip"]');
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(500);
  }
}

export async function dishBox(page) {
  const box = await page.locator('canvas.gl-dish').boundingBox();
  if (!box) throw new Error('dish canvas not found');
  return box;
}

export async function tapDish(page, fx, fy, touch) {
  const box = await dishBox(page);
  const x = box.x + box.width * fx;
  const y = box.y + box.height * fy;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** Text anomalies visible to the player. */
export async function scanText(page) {
  return page.evaluate(() => {
    const txt = document.body.innerText;
    const bad = [];
    for (const re of [/\bNaN\b/, /\bInfinity\b/, /\bundefined\b/, /\[object Object\]/, /\bnull\b/]) {
      const m = txt.match(re);
      if (m) {
        const i = txt.indexOf(m[0]);
        bad.push(`${m[0]} … "${txt.slice(Math.max(0, i - 40), i + 40).replace(/\n/g, ' | ')}"`);
      }
    }
    // Attributes too (aria-labels, titles).
    for (const el of document.querySelectorAll('[aria-label],[title]')) {
      for (const a of ['aria-label', 'title']) {
        const v = el.getAttribute(a);
        if (v && /NaN|Infinity|undefined|\[object Object\]/.test(v)) bad.push(`attr ${a}="${v}"`);
      }
    }
    return bad;
  });
}

export const view = (page) => page.evaluate(() => window.bioluma.game.view());

export function check(results, name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

/** FNV-1a 32-bit hex — same as the game's save checksum. */
export function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Wrap a raw data object as a valid save JSON string (v1 + checksum). */
export function wrapSave(data, v = 1) {
  const d = JSON.stringify(data);
  return `{"v":${v},"sum":"${fnv(d)}","data":${d}}`;
}

/** Export string ("BIOLUMA1." + base64(utf8 JSON)). */
export function exportOf(saveJson) {
  return 'BIOLUMA1.' + Buffer.from(saveJson, 'utf8').toString('base64');
}

/** Current state as a plain object (from the live game). */
export async function stateData(page) {
  return page.evaluate(() => JSON.parse(window.bioluma.game.serialize()).data);
}

/**
 * Craft a save from the page's current state + patch and import it through the real
 * import path (game.importString). Debug-handle use: only to reach late-game screens.
 */
export async function importPatched(page, patch) {
  const data = await stateData(page);
  const merged = typeof patch === 'function' ? patch(data) ?? data : Object.assign(data, patch);
  const str = exportOf(wrapSave(merged));
  return page.evaluate((s) => window.bioluma.game.importString(s), str);
}

/**
 * Close `page` (its pagehide autosave runs), then on a fresh page of the same context edit
 * localStorage from a same-origin static file before loading the game again.
 */
export async function reopenWithStorage(ctx, page, url, edit, arg) {
  await page.close({ runBeforeUnload: true });
  const p = await ctx.newPage();
  await p.goto(new URL('manifest.webmanifest', url).href);
  await p.evaluate(edit, arg);
  return p;
}

/**
 * Fresh context whose localStorage is pre-filled (via a same-origin static file) before the
 * game boots. `kv` maps keys to string values; `null` removes the key.
 */
export async function bootWithStorage(browser, url, kv, opts = {}) {
  const v = VIEWPORTS[opts.vp ?? 'mobile'] ?? opts.vp;
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: v.deviceScaleFactor ?? 1,
    isMobile: !!v.isMobile,
    hasTouch: !!v.hasTouch,
    locale: opts.locale ?? 'es-CO',
  });
  for (const s of opts.init ?? []) await ctx.addInitScript(s);
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  page.setDefaultNavigationTimeout(120000);
  const log = { errors: [], warnings: [], all: [] };
  page.on('console', (m) => {
    const t = m.text() + ' ' + (m.location()?.url ?? '');
    if (IGNORE.test(t)) return;
    log.all.push(`${m.type()}: ${m.text()}`);
    if (m.type() === 'error') log.errors.push(m.text());
    if (m.type() === 'warning') log.warnings.push(m.text());
  });
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  await page.goto(new URL('manifest.webmanifest', url).href);
  await page.evaluate((kv) => {
    for (const [k, val] of Object.entries(kv)) {
      if (val === null) localStorage.removeItem(k);
      else localStorage.setItem(k, val);
    }
  }, kv);
  await page.goto(url);
  return { ctx, page, log };
}

export function baseState() {
  return JSON.parse(readFileSync(new URL('./qa1-base-state.json', import.meta.url), 'utf8'));
}

/** Raw touch gestures through CDP (Playwright only has tap). points: [[x,y], ...] per finger. */
export async function touch(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, pts) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: pts.map(([x, y], i) => ({ x, y, id: i, radiusX: 4, radiusY: 4, force: 1 })),
    });
  return {
    start: (pts) => send('touchStart', pts),
    move: (pts) => send('touchMove', pts),
    end: () => send('touchEnd', []),
    async longPress(x, y, ms = 700) {
      await send('touchStart', [[x, y]]);
      await page.waitForTimeout(ms);
      await send('touchEnd', []);
    },
    async drag(path, stepMs = 30) {
      await send('touchStart', [path[0]]);
      for (const p of path.slice(1)) {
        await send('touchMove', [p]);
        await page.waitForTimeout(stepMs);
      }
      await send('touchEnd', []);
    },
    async pinch(cx, cy, d0, d1, steps = 8) {
      await send('touchStart', [[cx - d0, cy], [cx + d0, cy]]);
      for (let i = 1; i <= steps; i++) {
        const d = d0 + ((d1 - d0) * i) / steps;
        await send('touchMove', [[cx - d, cy], [cx + d, cy]]);
        await page.waitForTimeout(30);
      }
      await send('touchEnd', []);
    },
    detach: () => cdp.detach(),
  };
}
