#!/usr/bin/env node
/**
 * Visual check of the art direction on art-dev.html (docs/ARTE.md):
 *   node tests/e2e/art-shots.mjs                  (every section, both sizes, both themes)
 *   ONLY=vela,icons node tests/e2e/art-shots.mjs  (some sections)
 *   T=1.3 node tests/e2e/art-shots.mjs            (freeze the animation clock at another time)
 * Starts Vite on a free port, opens art-dev.html in headless Chromium at 390×844 (phone, DPR 2) and
 * 1366×768 (laptop), dark and light, and saves one full-page PNG per section as
 * art-<section>-<phone|laptop>-<theme>.png into $ART_SHOTS_DIR (default: the session scratchpad).
 * Google Fonts are fetched with curl (it honours the sandbox proxy and its CA bundle) and cached, so
 * the shots show Fraunces / Inter like players see them; without network the page falls back.
 * Fails on console errors, page errors or horizontal overflow.
 * Uses playwright-core with the Chromium under /opt/pw-browsers (never `playwright install`).
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = process.env.ART_SHOTS_DIR ?? '/tmp/claude-0/-home-user-Lenia/a5114f5a-39a4-539d-9a6a-14e769759a92/scratchpad/art/shots';
const FONT_CACHE = path.join(os.tmpdir(), 'bioluma-font-cache');
mkdirSync(OUT, { recursive: true });
mkdirSync(FONT_CACHE, { recursive: true });

const SECTIONS = ['tokens', 'icons', 'iconlab', 'emblems', 'components', 'vela', 'cast', 'worlds', 'matter', 'dish', 'motion'];
const only = (process.env.ONLY ?? '').split(',').filter(Boolean);
const T = process.env.T ?? '2.5';
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844, dpr: 2, mobile: true },
  { name: 'laptop', width: 1366, height: 768, dpr: 1, mobile: false },
].filter((v) => !process.env.VP || process.env.VP === v.name);
const THEMES = ['dark', 'light'].filter((t) => !process.env.THEME || process.env.THEME === t);

function findChrome() {
  const base = '/opt/pw-browsers';
  for (const d of readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const p = path.join(base, d, 'chrome-linux', 'chrome');
    if (existsSync(p)) return p;
  }
  throw new Error('Chromium not found under /opt/pw-browsers');
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

async function waitFor(url, ms = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
/** Fetch a Google Fonts URL through curl (proxy + CA bundle from the environment), cached on disk. */
function fetchFont(url) {
  const key = createHash('sha1').update(url).digest('hex');
  const file = path.join(FONT_CACHE, key);
  if (!existsSync(file)) {
    const body = execFileSync('curl', ['-sS', '-f', '-m', '25', '-A', UA, url], { maxBuffer: 32 * 1024 * 1024 });
    writeFileSync(file, body);
  }
  return readFileSync(file);
}

const port = await freePort();
const vite = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, BROWSER: 'none' },
  detached: true,
});
/** Stop npx and the Vite server it started (the whole process group). */
function stopVite() {
  try {
    process.kill(-vite.pid, 'SIGTERM');
  } catch {
    vite.kill('SIGTERM');
  }
}
let viteLog = '';
vite.stdout.on('data', (d) => (viteLog += d));
vite.stderr.on('data', (d) => (viteLog += d));

const errors = [];
const shots = [];
let browser;
try {
  await waitFor(`http://127.0.0.1:${port}/art-dev.html`);
  browser = await chromium.launch({
    executablePath: findChrome(),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  for (const vp of VIEWPORTS)
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.dpr,
        isMobile: vp.mobile,
        hasTouch: vp.mobile,
      });
      await context.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, async (route) => {
        const url = route.request().url();
        try {
          const body = fetchFont(url);
          const css = url.includes('googleapis');
          await route.fulfill({
            status: 200,
            body,
            headers: { 'content-type': css ? 'text/css; charset=utf-8' : 'font/woff2', 'access-control-allow-origin': '*' },
          });
        } catch {
          await route.abort();
        }
      });
      const page = await context.newPage();
      page.on('console', (m) => {
        if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|net::ERR/.test(m.text())) errors.push(`[${vp.name}/${theme}] ${m.text()}`);
      });
      page.on('pageerror', (e) => errors.push(`[${vp.name}/${theme}] pageerror: ${e.message}`));
      for (const sec of SECTIONS.filter((s) => !only.length || only.includes(s))) {
        await page.goto(`http://127.0.0.1:${port}/art-dev.html?theme=${theme}&section=${sec}&t=${T}`, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => window.__artReady === true, null, { timeout: 20000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(350);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
        if (overflow) errors.push(`[${vp.name}/${theme}] ${sec}: horizontal overflow`);
        const file = path.join(OUT, `art-${sec}-${vp.name}-${theme}.png`);
        await page.screenshot({ path: file, fullPage: true });
        shots.push(file);
      }
      await context.close();
    }
} finally {
  await browser?.close();
  stopVite();
}

console.log(`${shots.length} screenshots in ${OUT}`);
if (errors.length) {
  console.error(errors.join('\n'));
  if (/error/i.test(viteLog)) console.error(viteLog.slice(-2000));
  process.exit(1);
}
console.log('OK: no console errors, no horizontal overflow.');
process.exit(0);
