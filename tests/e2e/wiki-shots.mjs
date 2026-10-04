#!/usr/bin/env node
/**
 * Regenerates the wiki screenshots (docs/wiki/images/*.png) from the REAL game.
 *
 *   node tests/e2e/wiki-shots.mjs                       # build (e2e flavour) + capture everything (~15 min)
 *   node tests/e2e/wiki-shots.mjs --dist <dir>          # reuse a build made with VITE_E2E=1
 *   node tests/e2e/wiki-shots.mjs --only mobile,english,desktop,ranking,icons,cards
 *   node tests/e2e/wiki-shots.mjs --out <dir> --raw <dir>
 *   node tests/e2e/wiki-shots.mjs --save-cache <file>   # keep the "species discovered" save between runs
 *   node tests/e2e/wiki-shots.mjs --no-tutorial         # iteration aid: skip the real tutorial part
 *
 * Image names: m-NN-*  Spanish phone (390×844 @1.5x → 560 px wide), en-NN-*  English phone,
 *              d-NN-*  desktop (1366×768), icon-*  behaviour icons, hero / social-preview  banners.
 *
 * What is real and what is not:
 *   - Every creature, glow and ripple is the real WebGL2 simulation, played by real taps on the dish.
 *   - The title screen and the first-minutes tutorial are played from a fresh save, nothing faked.
 *   - Later-game panels (Laboratorio, Bestiario, Calibrar, Genoma, Extinción) would take hours to
 *     reach, so after the tutorial the script imports a crafted save (more Essence, some upgrades,
 *     a few free "Mutágeno" seeds) through the game's own importString, then discovers species by
 *     really changing the rule (μ, σ) and really seeding. The Incubadora (×4) shortens the waiting.
 *     Species are never injected: the Bestiario only shows what the simulation produced.
 *   - The only debug pokes are `game.state.goldenTimer` (so the golden spark shows up on schedule)
 *     and `game.state.essence` (so the Laboratorio shows both affordable and unaffordable rows).
 *   - The ranking modal is not wired into the real build yet; it is captured from `ui-dev.html`
 *     (mock data, clearly an example) with the Vite dev server.
 *
 * Needs: playwright-core + a Chromium under /opt/pw-browsers (never `playwright install`).
 * Optional: ImageMagick `convert` (256-colour PNG8, keeps every image well below 400 KB).
 * Google Fonts are fetched with `curl` (honours proxies / CA bundles) and handed to the page.
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const OUT = path.resolve(opt('--out', path.join(ROOT, 'docs/wiki/images')));
const WORK = mkdtempSync(path.join(process.env.WIKI_SHOTS_TMP ?? os.tmpdir(), 'bioluma-wiki-'));
const RAW = path.resolve(opt('--raw', path.join(WORK, 'raw')));
const ONLY = new Set(opt('--only', 'mobile,english,desktop,ranking,icons,cards').split(','));
const CACHE = opt('--save-cache', '');
/** Optional subset of stages (iteration aid): tutorial,lively,golden,tabs,modals,extinction (phones), play,divider (desktop) */
const STAGES = new Set(opt('--stages', '').split(',').filter(Boolean));
const want = (k) => STAGES.size === 0 || STAGES.has(k);
const MAX_KB = 390; // KiB: stays under 400 000 bytes
mkdirSync(OUT, { recursive: true });
mkdirSync(RAW, { recursive: true });

const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };

const log = (...a) => console.log('[wiki-shots]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const consoleErrors = [];

// ───────────────────────────── infrastructure ─────────────────────────────

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

async function waitForHttp(url, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startServer(cmdArgs, port) {
  const proc = spawn('npx', ['vite', ...cmdArgs, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
    detached: true, // own process group so npx + vite die together
  });
  return () => {
    try {
      process.kill(-proc.pid, 'SIGTERM');
    } catch {
      proc.kill('SIGTERM');
    }
  };
}

/** Google Fonts through curl (honours the sandbox proxy + CA bundle); cached per URL. */
const fontCache = new Map();
function fetchWithCurl(url, ua, asText) {
  const key = `${asText}|${url}`;
  if (fontCache.has(key)) return fontCache.get(key);
  const caFile = process.env.SSL_CERT_FILE || process.env.CURL_CA_BUNDLE || (existsSync('/root/.ccr/ca-bundle.crt') ? '/root/.ccr/ca-bundle.crt' : '');
  const cmd = ['-sS', '--max-time', '20', '-A', ua, ...(caFile ? ['--cacert', caFile] : []), url];
  let body = null;
  try {
    body = execFileSync('curl', cmd, { maxBuffer: 20 * 1024 * 1024 });
  } catch {
    body = null;
  }
  fontCache.set(key, body);
  return body;
}

async function installFonts(ctx) {
  await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, async (route) => {
    const req = route.request();
    const isCss = req.url().includes('fonts.googleapis.com');
    const body = fetchWithCurl(req.url(), req.headers()['user-agent'] ?? 'Mozilla/5.0 Chrome/120', isCss);
    if (!body) return route.abort();
    return route.fulfill({
      status: 200,
      contentType: isCss ? 'text/css; charset=utf-8' : 'font/woff2',
      headers: { 'access-control-allow-origin': '*' },
      body,
    });
  });
}

function buildDir() {
  const d = opt('--dist', '');
  if (d) return path.resolve(d);
  const dist = path.join(WORK, 'dist');
  log('building the e2e flavour of the game (VITE_E2E=1)…');
  const r = spawnSync('npx', ['vite', 'build', '--outDir', dist, '--emptyOutDir'], {
    cwd: ROOT,
    env: { ...process.env, VITE_E2E: '1' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (r.status !== 0) throw new Error('vite build failed');
  return dist;
}

// ───────────────────────────── page helpers ─────────────────────────────

function watch(page, label) {
  page.setDefaultTimeout(20000);
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    const url = m.location()?.url ?? '';
    if (/fonts\.(googleapis|gstatic)\.com|ERR_CERT|net::ERR/.test(url + text)) return; // optional web fonts
    consoleErrors.push(`[${label}] ${text}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`[${label}] pageerror: ${e.message}`));
}

async function newPage(browser, kind, extra = {}) {
  const ctx = await browser.newContext({ ...kind, locale: 'es-CO', colorScheme: 'dark', ...extra });
  // Pretend to be a mid-range phone / laptop so the game picks the "medium" dish (192×240).
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
  });
  await installFonts(ctx);
  const page = await ctx.newPage();
  watch(page, kind === MOBILE ? 'mobile' : 'desktop');
  return { ctx, page };
}

async function openGame(page, port) {
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => !!window.bioluma, null, { timeout: 30000 });
  await page.evaluate(() => document.fonts?.ready);
}

const view = (page) => page.evaluate(() => window.bioluma.game.view());
const stableCount = (page) => page.evaluate(() => window.bioluma.game.view().creatures.filter((c) => c.state === 'stable').length);

/** One-line status for the log (helps when a run misbehaves). */
async function describe(page, label) {
  const d = await page.evaluate(() => {
    const b = window.bioluma;
    const v = b.game.view();
    const by = {};
    for (const c of v.creatures) by[c.state] = (by[c.state] ?? 0) + 1;
    return { zoom: +b.camera.zoom.toFixed(2), creatures: by, eps: +v.essencePerSec.toFixed(1), species: v.species.length, step: b.sim.stepCount };
  });
  log(`  ${label}: ${JSON.stringify(d)}`);
  return d;
}

/**
 * The part of the canvas that is really the dish view: the canvas keeps its full height under the bottom
 * sheet, but the camera only maps the visible part (camera.viewW × viewH from the canvas top-left).
 */
const dishView = (page) =>
  page.evaluate(() => {
    const box = document.querySelector('canvas.gl-dish').getBoundingClientRect();
    const cam = window.bioluma.camera;
    return { x: box.left, y: box.top, w: Math.min(cam.viewW, box.width), h: Math.min(cam.viewH, box.height) };
  });

async function tapAt(page, x, y, touch) {
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** Tap the dish at fractions of the visible dish view. */
async function tapDish(page, fx, fy, touch) {
  const r = await dishView(page);
  await tapAt(page, r.x + r.w * fx, r.y + r.h * fy, touch);
}

/** Page-coordinate position of a creature (or the golden spark) via the game's own camera. */
async function screenPosOf(page, what) {
  return page.evaluate((what) => {
    const b = window.bioluma;
    const v = b.game.view();
    const box = document.querySelector('canvas.gl-dish').getBoundingClientRect();
    const target = what === 'golden' ? v.golden : v.creatures.filter((c) => c.state === 'stable')[0];
    if (!target) return null;
    const p = b.camera.gridToScreen(target.x, target.y);
    return { x: box.left + p.x, y: box.top + p.y, fx: p.x / b.camera.viewW, fy: p.y / b.camera.viewH };
  }, what);
}

async function waitUntil(page, fn, arg, timeoutMs, what) {
  try {
    await page.waitForFunction(fn, arg, { timeout: timeoutMs, polling: 250 });
    return true;
  } catch {
    log(`  (timeout waiting for ${what})`);
    return false;
  }
}

/** Wait for the simulation itself (not the wall clock) to advance: the machine may be busy. */
async function waitSteps(page, n, timeoutMs = 300000) {
  const start = await page.evaluate(() => window.bioluma.sim.stepCount);
  return waitUntil(page, ({ start, n }) => window.bioluma.sim.stepCount >= start + n, { start, n }, timeoutMs, `${n} simulation steps`);
}

/** Import a (modified) save through the game's own importString; the checksum is recomputed. */
async function importPatched(page, saveString, patch) {
  const ok = await page.evaluate(
    ({ saveString, patch }) => {
      const checksum = (s) => {
        let h = 0x811c9dc5;
        for (let i = 0; i < s.length; i++) {
          h ^= s.charCodeAt(i);
          h = Math.imul(h, 0x01000193) >>> 0;
        }
        return h.toString(16).padStart(8, '0');
      };
      const g = window.bioluma.game;
      const prefix = 'BIOLUMA1.';
      const bin = atob((saveString ?? g.exportString()).slice(prefix.length));
      const outer = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
      const d = outer.data;
      for (const [k, v] of Object.entries(patch)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && d[k] && typeof d[k] === 'object') Object.assign(d[k], v);
        else d[k] = v;
      }
      outer.sum = checksum(JSON.stringify(d));
      const bytes = new TextEncoder().encode(JSON.stringify(outer));
      let s = '';
      bytes.forEach((b) => (s += String.fromCharCode(b)));
      return g.importString(prefix + btoa(s));
    },
    { saveString, patch },
  );
  if (!ok) throw new Error('crafted save rejected by importString');
}

const exportSave = (page) => page.evaluate(() => window.bioluma.game.exportString());

/** Change the rule exactly like the Calibrar sliders do, wipe the dish like Extinction/import do. */
async function setRegime(page, mu, sigma) {
  await page.evaluate(
    ({ mu, sigma }) => {
      const b = window.bioluma;
      b.bus.emit('dishClear', {});
      b.game.actions.setCalibration({ mu, sigma });
    },
    { mu, sigma },
  );
  await sleep(500);
}

/** Spots away from the HUD buttons (pause, speed, eraser, seed pill) and from each other. */
const SPOTS = [
  [0.3, 0.25], [0.7, 0.25], [0.5, 0.4], [0.25, 0.55], [0.75, 0.55], [0.5, 0.7], [0.22, 0.38], [0.78, 0.4], [0.3, 0.72], [0.72, 0.72],
];

/** Close an open creature card and undo any zoom/follow: a tap on a card or a zoomed view must not seed. */
const tidyView = (page) =>
  page.evaluate(() => {
    document.querySelector('.ccard-close')?.click();
    const c = window.bioluma.camera;
    if (Math.abs(c.zoom - 1) > 0.001) c.zoomAt(1 / c.zoom, c.viewW / 2, c.viewH / 2);
  });

/** Seed `n` spots with real taps (Mutágeno charges make them take); a tap the busy page dropped is retried nearby. */
async function seedMany(page, n, touch, from = 0) {
  for (let i = 0; i < n; i++) {
    const [fx, fy] = SPOTS[(i + from) % SPOTS.length];
    for (let attempt = 0; attempt < 4; attempt++) {
      await tidyView(page);
      const before = await page.evaluate(() => window.bioluma.game.view().stats.seeds);
      await tapDish(page, fx + attempt * 0.02, fy + attempt * 0.02, touch);
      if (await waitUntil(page, (b) => window.bioluma.game.view().stats.seeds > b, before, 8000, 'a seed to register')) break;
    }
    await sleep(250);
  }
}

/** Fold / unfold the bottom sheet (folded = the whole dish is visible). Mobile layout only. */
async function setFold(page, folded) {
  const isFolded = () => page.evaluate(() => document.querySelector('.bl')?.classList.contains('sheet-collapsed') ?? false);
  // The sheet only exists once a tab is unlocked (right after an import it may still be hidden).
  await page.locator('.bl-handle').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  for (let i = 0; i < 3 && (await isFolded()) !== folded; i++) {
    if (!(await page.locator('.bl-handle').isVisible())) return;
    await page.locator('.bl-handle').click({ force: true }); // a real click: the handle listens to pointer events
    await sleep(900);
  }
}

// ───────────────────────────── screenshots ─────────────────────────────

const shots = [];
function makeShooter(prefix) {
  return async (page, name, { settle = 350 } = {}) => {
    await sleep(settle);
    const file = path.join(RAW, `${prefix}${name}.png`);
    await page.screenshot({ path: file });
    shots.push({ name: `${prefix}${name}`, file, kind: prefix });
    log('shot', `${prefix}${name}`);
  };
}

/** Run a stage; a failing stage is reported but does not stop the others. */
async function stage(name, fn) {
  try {
    await fn();
  } catch (err) {
    failures.push(`${name}: ${String(err.message).split('\n')[0]}`);
    log(`!! stage "${name}" failed: ${String(err.message).split('\n')[0]}`);
  }
}

const tab = (page, id) => page.locator(`.bl-tabs .tab[data-tab="${id}"]`);
async function openTab(page, id, settle = 450) {
  await tab(page, id).click();
  await sleep(settle);
}
/** Scroll the active panel so that `selector` sits at its top. */
async function scrollPanelTo(page, selector, offset = 8) {
  await page
    .evaluate(
      ({ selector, offset }) => {
        const sc = document.querySelector('.panel:not([hidden]) .panel-scroll');
        const el = sc?.querySelector(selector);
        if (sc && el) sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - offset;
      },
      { selector, offset },
    )
    .catch(() => {});
  await sleep(250);
}
async function clickHud(page, labels) {
  for (const l of labels) {
    const b = page.locator(`.hud-btn[aria-label="${l}"]`);
    if (await b.count()) {
      await b.first().click();
      return;
    }
  }
  throw new Error(`HUD button not found: ${labels.join('/')}`);
}

// ───────────────────────────── shared game stages ─────────────────────────────

/** Regimes that really produce different catalog species (μ, σ from Chan's catalog). */
const REGIMES = [
  { name: 'Gyrorbium', mu: 0.156, sigma: 0.0224 },
  { name: 'Scutium', mu: 0.29, sigma: 0.045 },
  { name: 'Helicium', mu: 0.35, sigma: 0.06 },
];
/** Parorbium divides over and over (the dish fills, the bestiary floods): shown last, desktop only. */
const DIVIDER = { name: 'Parorbium', mu: 0.174, sigma: 0.022 };

const CRAFT = {
  essence: 1e8,
  samples: 14,
  upgrades: { dropper: 3, calibrator: 3, stabilizer: 3, culture: 3, incubator: 2, dish: 1, swimAffinity: 1, sessileAffinity: 1, reserve: 1, fastPipette: 1, microscope: 2, cataloguing: 1 },
  unlocked: ['dropper', 'culture', 'calibrator', 'stabilizer', 'dish', 'incubator', 'swimAffinity', 'sessileAffinity', 'reserve', 'fastPipette', 'microscope', 'cataloguing', 'archive', 'marker'],
  eraEssence: 262000,
  eraTime: 3300,
  charges: { free: 0, guaranteed: 120 },
};

/** Real taps until something is stable (the tutorial's "Paciencia de laboratorio"). */
async function sowUntilStable(page, touch, timeoutMs = 150000) {
  const t0 = Date.now();
  let taps = 0;
  while (Date.now() - t0 < timeoutMs && !(await stableCount(page))) {
    await sleep(3000);
    const v = await view(page);
    const forming = v.creatures.filter((c) => c.state === 'born').length;
    if (!forming && v.essence >= v.seedCost && taps < 14) {
      const [fx, fy] = SPOTS[(taps * 3) % SPOTS.length];
      await tapDish(page, fx, fy, touch);
      taps++;
    }
  }
  return stableCount(page);
}

/** Click without waiting for "stable": the coach bubble follows a swimming creature. */
const jsClick = (page, selector) => page.locator(selector).first().evaluate((el) => el.click());

/** Wait for the coach bubble whose title matches `re`; resolves false on timeout. */
function waitCoach(page, re, ms = 8000) {
  return waitUntil(page, (src) => new RegExp(src, 'i').test(document.querySelector('.coach:not([hidden]) .coach-title')?.textContent ?? ''), re.source, ms, `coach "${re.source}"`);
}

/** Title + the real tutorial from a fresh save (shots 01–07). */
async function titleAndTutorial(page, S, touch) {
  await stage('title', async () => {
    await sleep(2400);
    await S(page, '01-title', { settle: 0 });
  });
  await stage('tutorial', async () => {
    if (touch) await page.touchscreen.tap(195, 420);
    else await page.mouse.click(683, 400); // dismiss the splash
    await page.waitForSelector('.coach-skip', { timeout: 15000 });
    await S(page, '02-tutorial-seed', { settle: 900 });

    await tapDish(page, 0.5, 0.5, touch);
    // The first seed: just the dish (the coach bubble of the next step is still flying in).
    await page.addStyleTag({ content: '.coach{visibility:hidden!important}' }).then((h) => h.evaluate((el) => (el.id = 'wiki-hide-coach')));
    await sleep(250);
    await S(page, '03-seeding', { settle: 0 });
    await page.evaluate(() => document.getElementById('wiki-hide-coach')?.remove());
    if (await waitCoach(page, /Paciencia|patience/, 6000)) {
      await S(page, '04-tutorial-wait', { settle: 900 });
      await jsClick(page, '.coach-next');
    }
    await tapDish(page, 0.3, 0.3, touch);
    await sleep(250);
    await tapDish(page, 0.7, 0.7, touch);

    if (!(await sowUntilStable(page, touch))) throw new Error('no stable creature appeared in time');
    await waitCoach(page, /Vida|Life/, 10000);
    await S(page, '05-tutorial-life', { settle: 1500 });
    await jsClick(page, '.coach-next');
    await waitCoach(page, /Esencia|Essence/, 6000);
    await S(page, '06-tutorial-essence', { settle: 1700 });
    await jsClick(page, '.coach-next');
    await waitCoach(page, /Laboratorio|Lab/, 8000);
    await S(page, '07-tutorial-lab', { settle: 2400 });
    await jsClick(page, '.coach-skip').catch(() => {});
    await sleep(500);
  });
}

async function skipSplashAndTutorial(page, touch) {
  if (touch) await page.touchscreen.tap(195, 420);
  else await page.mouse.click(683, 400);
  await sleep(900);
  await jsClick(page, '.coach-skip').catch(() => {});
  await sleep(300);
}

/** Species discovery by really moving μ and σ and seeding, at ×4. */
async function discoverSpecies(page, touch) {
  for (const r of REGIMES) {
    const before = (await view(page)).species.length;
    await setRegime(page, r.mu, r.sigma);
    // Seeds are a dice roll even with Mutágeno: if nothing was registered, sow once more.
    for (let attempt = 0; attempt < 2; attempt++) {
      await seedMany(page, 4, touch, REGIMES.indexOf(r) * 4 + attempt * 2);
      if (await waitUntil(page, (n) => window.bioluma.game.view().species.length > n, before, 90000, `${r.name} species`)) break;
    }
    await waitSteps(page, r.name === 'Scutium' ? 1800 : 1100); // behaviour classification needs ≈1000 steps
    await describe(page, r.name);
  }
}

/** The base save every other run imports: crafted economy + species really discovered. */
async function progressSave(page, state, touch, lang) {
  if (!state.save && CACHE && existsSync(CACHE)) state.save = readFileSync(CACHE, 'utf8').trim();
  if (state.save) {
    log('importing the discovered-species save');
    await importPatched(page, state.save, { settings: { lang }, upgrades: { autoSeeder: 0 } }); // no auto-seeder: it would flood the dish while the script waits
    await sleep(500);
    await page.evaluate(() => window.bioluma.game.actions.setSpeed(4));
    return;
  }
  await importPatched(page, null, { ...CRAFT, settings: { lang } });
  await sleep(600);
  await page.evaluate(() => window.bioluma.game.actions.setSpeed(4));
  await setFold(page, true);
  await discoverSpecies(page, touch);
  state.save = await exportSave(page);
  if (CACHE) {
    writeFileSync(CACHE, state.save);
    log(`save cached in ${CACHE}`);
  }
}

/**
 * A calm, lively dish: a few Gyrorbium (spinners) seeded with real taps, shot as soon as they are stable.
 * Fast swimmers (Orbium at the default rule) collide within ~700 steps and the dish dissolves into
 * labyrinth patterns (real Lenia behaviour, but not a picture to show); the slow, circling Gyrorbium
 * keep apart. The crowd stays small and is re-seeded before every group of shots.
 */
async function calmDish(page, touch, { seeds = 4, stable = 3, from = 2 } = {}) {
  // Speed ×1 on purpose: swimmers cover ~0.24 cells per step, and at ×4 on a busy machine the detector
  // sees them too rarely to track them (they would stay "forming" forever).
  await page.evaluate(() => window.bioluma.game.actions.setSpeed(1));
  await setRegime(page, 0.156, 0.0224);
  await seedMany(page, seeds, touch, from);
  await waitUntil(page, (n) => window.bioluma.game.view().creatures.filter((c) => c.state === 'stable').length >= n, stable, 600000, `${stable} stable creatures`);
  await describe(page, 'calm dish');
}

/** The hero shot of the dish, then the creature-card shot. */
async function livelyDish(page, S, touch, { extraShots = true } = {}) {
  await setFold(page, true);
  await calmDish(page, touch, { seeds: 5, stable: 4, from: 0 });
  await page.evaluate(() => (window.bioluma.game.state.essence = 18450));
  await S(page, '08-dish-alive', { settle: 700 });
  if (!extraShots) return;
  const p = await screenPosOf(page, 'creature');
  if (p) {
    await tapAt(page, p.x, p.y, touch);
    await S(page, '09-creature-card', { settle: 700 });
    await page.locator('.ccard-close').click().catch(() => {});
    await sleep(300);
  } else log('  (no stable creature to tap)');
}

/** The golden spark appears on schedule; shoot it near the middle of the dish, then tap it. */
async function goldenSpark(page, S, touch) {
  await calmDish(page, touch, { seeds: 4, stable: 3 });
  await page.evaluate(() => (window.bioluma.game.state.goldenTimer = 0.5));
  if (!(await waitUntil(page, () => !!window.bioluma.game.view().golden, null, 25000, 'golden spark'))) throw new Error('no golden spark');
  let p = null;
  for (let i = 0; i < 40; i++) {
    p = await screenPosOf(page, 'golden');
    if (p && p.fx > 0.28 && p.fx < 0.72 && p.fy > 0.28 && p.fy < 0.72) break;
    await sleep(250);
  }
  await S(page, '10-golden-spark', { settle: 50 });
  p = (await screenPosOf(page, 'golden')) ?? p;
  if (p) await tapAt(page, p.x, p.y, touch);
  await S(page, '11-golden-reward', { settle: 500 });
}

async function tabShots(page, S, { grid = true } = {}) {
  await openTab(page, 'lab', 500);
  await S(page, '12-lab');
  await openTab(page, 'bestiary', 600);
  await scrollPanelTo(page, '.chips');
  await S(page, '13-bestiary');
  // A species with its real catalog name (Latin, italic) makes the best card.
  const latin = page.locator('.sp .sp-name.latin').first();
  if (await latin.count()) {
    await latin.click();
    await S(page, '14-species-card', { settle: 700 });
    await page.locator('.modal-close').click();
    await sleep(300);
  }
  await openTab(page, 'calibrate', 600);
  await S(page, '15-calibrate');
  await openTab(page, 'genome', 600);
  if (grid) await scrollPanelTo(page, '.gnode', 70);
  await S(page, '16-genome');
}

async function achievementsShot(page, S) {
  await clickHud(page, ['Bitácora', 'Journal']);
  await sleep(500);
  await page.locator('.modal .seg button').nth(1).click();
  await S(page, '17-achievements', { settle: 500 });
  return async () => {
    await page.locator('.modal .seg button').nth(0).click();
    await S(page, '18-journal', { settle: 400 });
    await page.locator('.modal-close').click();
    await sleep(350);
  };
}

/** Hold the Extinguir button for real, then the era summary and the new tree. */
async function extinctionShots(page, S) {
  await openTab(page, 'genome', 600);
  await scrollPanelTo(page, '.gnode', 70);
  let done = false;
  for (let attempt = 0; attempt < 3 && !done; attempt++) {
    const box = await page.locator('.ext-btn').first().boundingBox();
    if (!box) throw new Error('extinguish button not found');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await sleep(2700); // the game wants 1.5 s of held button; the ritual (white dish) runs after that
    await S(page, '23-extinction-ritual', { settle: 0 });
    await page.mouse.up();
    done = await waitUntil(page, () => !!document.querySelector('.big-card'), null, 20000, 'the era summary');
  }
  if (!done) throw new Error('the Extinction did not start');
  await S(page, '24-era-summary', { settle: 800 });
  await jsClick(page, '.big-card .btn:last-of-type');
  await sleep(900);
  await openTab(page, 'genome', 600);
  await scrollPanelTo(page, '.gnode', 70);
  await S(page, '25-genome-after');
}

// ───────────────────────────── the phone runs ─────────────────────────────

async function mobileRun(browser, port, state) {
  const S = makeShooter('m-');
  const { ctx, page } = await newPage(browser, MOBILE);
  await openGame(page, port);

  if (want('tutorial') && !args.includes('--no-tutorial')) await titleAndTutorial(page, S, true);
  else await skipSplashAndTutorial(page, true);

  if (['lively', 'golden', 'tabs', 'modals', 'extinction'].some(want)) {
    await stage('mobile progress (crafted save + real discovery)', () => progressSave(page, state, true, 'es'));
  }
  if (want('lively')) await stage('mobile lively dish', () => livelyDish(page, S, true));
  if (want('golden')) await stage('mobile golden spark', () => goldenSpark(page, S, true));

  if (want('tabs')) await stage('mobile tabs', async () => {
    await setFold(page, false);
    await calmDish(page, true, { seeds: 4, stable: 2 });
    await page.evaluate(() => (window.bioluma.game.state.essence = 18450));
    await tabShots(page, S);
  });

  if (want('modals')) await stage('mobile modals', async () => {
    const journal = await achievementsShot(page, S);
    await journal();

    await clickHud(page, ['Ajustes', 'Settings']);
    await sleep(600);
    await S(page, '19-settings');
    // Light theme (the dish always stays dark).
    await page.locator('.modal .seg.text button', { hasText: /^(Claro|Light)$/ }).click();
    await S(page, '20-settings-light', { settle: 600 });
    await page.locator('.modal-close').click();
    await sleep(400);
    await openTab(page, 'lab', 500);
    await S(page, '21-light-lab', { settle: 600 });

    // English + back to the dark bestiary for the language picture.
    await clickHud(page, ['Ajustes', 'Settings']);
    await sleep(500);
    await page.locator('.modal .seg.text button', { hasText: /^(Oscuro|Dark)$/ }).click();
    await page.locator('.modal .seg.text button', { hasText: /^English$/ }).click();
    await sleep(400);
    await page.locator('.modal-close').click();
    await sleep(400);
    await openTab(page, 'bestiary', 500);
    await scrollPanelTo(page, '.chips');
    await S(page, '22-english-bestiary', { settle: 600 });
    await clickHud(page, ['Ajustes', 'Settings']);
    await sleep(500);
    await page.locator('.modal .seg.text button', { hasText: /^Español$/ }).click();
    await page.locator('.modal-close').click();
    await sleep(400);
  });

  if (want('extinction')) await stage('mobile extinction', () => extinctionShots(page, S));
  await ctx.close();
}

/** Same journey in English (locale en-US makes the first run English from the start). */
async function englishRun(browser, port, state) {
  const S = makeShooter('en-');
  const { ctx, page } = await newPage(browser, MOBILE, { locale: 'en-US' });
  await openGame(page, port);

  if (want('tutorial') && !args.includes('--no-tutorial')) await titleAndTutorial(page, S, true);
  else await skipSplashAndTutorial(page, true);

  if (['lively', 'golden', 'tabs', 'extinction'].some(want)) {
    await stage('english progress', () => progressSave(page, state, true, 'en'));
  }
  if (want('lively')) await stage('english lively dish', () => livelyDish(page, S, true));
  if (want('golden')) await stage('english golden spark', () => goldenSpark(page, S, true));
  if (want('tabs')) {
    await stage('english tabs', async () => {
      await setFold(page, false);
      await calmDish(page, true, { seeds: 4, stable: 2 });
      await page.evaluate(() => (window.bioluma.game.state.essence = 18450));
      await tabShots(page, S);
      await achievementsShot(page, S);
      await page.locator('.modal-close').click();
      await sleep(350);
    });
    await stage('english settings', async () => {
      await clickHud(page, ['Settings', 'Ajustes']);
      await sleep(600);
      await S(page, '19-settings');
      await page.locator('.modal .seg.text button', { hasText: /^(Light|Claro)$/ }).click();
      await S(page, '20-settings-light', { settle: 600 });
      await page.locator('.modal .seg.text button', { hasText: /^(Dark|Oscuro)$/ }).click();
      await page.locator('.modal-close').click();
      await sleep(400);
    });
  }
  if (want('extinction')) await stage('english extinction', () => extinctionShots(page, S));
  await ctx.close();
}

// ───────────────────────────── desktop run ─────────────────────────────

async function desktopRun(browser, port, state) {
  const S = makeShooter('d-');
  const { ctx, page } = await newPage(browser, DESKTOP);
  await openGame(page, port);
  if (want('play')) {
    await stage('desktop title', async () => {
      await sleep(2400);
      await S(page, '01-title', { settle: 0 });
    });
  }
  await skipSplashAndTutorial(page, false);
  await stage('desktop progress', () => progressSave(page, state, false, 'es'));
  if (want('play')) {
    await stage('desktop play', async () => {
      await calmDish(page, false, { seeds: 5, stable: 4, from: 0 });
      await page.evaluate(() => (window.bioluma.game.state.essence = 18450));
      await openTab(page, 'lab', 600);
      await S(page, '02-play', { settle: 1200 });
      await openTab(page, 'bestiary', 600);
      await scrollPanelTo(page, '.chips');
      await S(page, '03-bestiary');
      await openTab(page, 'calibrate', 600);
      await S(page, '04-calibrate');
      await openTab(page, 'genome', 600);
      await S(page, '05-genome');
      await clickHud(page, ['Ajustes', 'Settings']);
      await sleep(600);
      await S(page, '06-settings');
      await page.locator('.modal-close').click();
      await sleep(400);
    });
  }
  if (want('divider')) {
    await stage('desktop divider', async () => {
      // Parorbium splits again and again: "one becomes two". One seed, shot at the first division (3 pieces):
      // left alone the dish fills with stripes (and the bestiary floods), so this stage is the last one.
      await page.evaluate(() => window.bioluma.game.actions.setSpeed(1));
      await page.evaluate(() => (window.bioluma.game.state.essence = 18450));
      await setRegime(page, DIVIDER.mu, DIVIDER.sigma);
      await openTab(page, 'lab', 600);
      await seedMany(page, 1, false, 2);
      await waitUntil(page, () => window.bioluma.game.view().creatures.filter((c) => c.state === 'stable' || c.state === 'born').length >= 3, null, 240000, 'the first division');
      await S(page, '07-dish-divider', { settle: 0 });
      await page.evaluate(() => window.bioluma.game.actions.setSpeed(1));
    });
  }
  await ctx.close();
}

// ───────────────────────────── ranking (mock, ui-dev.html) ─────────────────────────────

async function rankingRun(browser) {
  const port = await freePort();
  const stop = startServer([], port);
  try {
    const base = `http://127.0.0.1:${port}/ui-dev.html`;
    await waitForHttp(base);
    for (const [prefix, lang] of [['m-', 'es'], ['en-', 'en']]) {
      const S = makeShooter(prefix);
      const { ctx, page } = await newPage(browser, MOBILE, { locale: lang === 'en' ? 'en-US' : 'es-CO' });
      await page.goto(`${base}?splash=0${lang === 'en' ? '&lang=en' : ''}`);
      await page.waitForSelector('.bl-tabs .tab:not([hidden])');
      await sleep(600);
      await stage(`ranking ${lang}`, async () => {
        await clickHud(page, ['Ranking', 'Leaderboard']);
        await sleep(400);
        await page.locator('.lb-input').fill('Pilar');
        await page.locator('.lb-nick .btn').click();
        await sleep(2200);
        await S(page, '26-ranking-example', { settle: 300 });
      });
      await ctx.close();
    }
  } finally {
    stop();
  }
}

// ───────────────────────────── behaviour icons (from src/ui/icons.ts) ─────────────────────────────

async function iconsRun(browser) {
  const iconsSrc = readFileSync(path.join(ROOT, 'src/ui/icons.ts'), 'utf8');
  const paletteSrc = readFileSync(path.join(ROOT, 'src/core/palette.ts'), 'utf8');
  const behaviours = ['still', 'pulsing', 'swimmer', 'spinner', 'divider', 'colony'];
  const tiles = behaviours.map((b) => {
    const body = new RegExp(`\\n\\s*${b}:\\s*'([^']*)'`).exec(iconsSrc)?.[1];
    const color = new RegExp(`${b}:\\s*'(#[0-9A-Fa-f]{6})'`).exec(paletteSrc)?.[1];
    if (!body || !color) throw new Error(`icon or colour of "${b}" not found`);
    return `<div class="t" id="${b}" style="color:${color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg></div>`;
  });
  const ctx = await browser.newContext({ viewport: { width: 700, height: 300 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setContent(
    `<style>body{margin:0;background:#0b0e12}.t{display:inline-grid;place-items:center;width:84px;height:84px;margin:8px;border-radius:22px;background:#141a21;box-shadow:inset 0 0 0 1px #243241}.t svg{width:56px;height:56px;filter:drop-shadow(0 0 5px currentColor)}</style>${tiles.join('')}`,
  );
  for (const b of behaviours) {
    const file = path.join(RAW, `icon-${b}.png`);
    await page.locator(`#${b}`).screenshot({ path: file, omitBackground: true });
    shots.push({ name: `icon-${b}`, file, kind: 'icon-' });
    log('shot', `icon-${b}`);
  }
  await ctx.close();
}

// ───────────────────────────── post-processing ─────────────────────────────

const hasConvert = () => spawnSync('convert', ['-version'], { stdio: 'ignore' }).status === 0;
const kb = (f) => Math.round(statSync(f).size / 1024);

/** 256-colour dithered PNG8: visually identical on these dark UIs, about half the bytes. */
function quantise(src, out, resize = []) {
  for (const colors of [256, 192, 128, 96, 64]) {
    spawnSync('convert', [src, '-strip', ...resize, '-dither', 'FloydSteinberg', '-colors', String(colors), '-define', 'png:compression-level=9', `PNG8:${out}`]);
    if (kb(out) <= MAX_KB) return;
  }
}

function optimise() {
  const convert = hasConvert();
  if (!convert) log('ImageMagick `convert` not found: copying raw PNGs (they may exceed 400 KB)');
  for (const s of shots) {
    const out = path.join(OUT, `${s.name}.png`);
    if (!convert) copyFileSync(s.file, out);
    else if (s.kind === 'icon-') spawnSync('convert', [s.file, '-strip', `PNG32:${out}`]);
    else quantise(s.file, out, s.kind === 'm-' || s.kind === 'en-' ? ['-resize', '560x'] : []);
  }
}

// ───────────────────────────── banners (hero, social preview) ─────────────────────────────

const dataUrl = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;

async function cardsRun(browser) {
  const need = ['m-01-title', 'm-08-dish-alive', 'm-13-bestiary'].map((n) => path.join(OUT, `${n}.png`));
  if (!need.every(existsSync)) {
    log('cards: the phone screenshots are missing, skipping the banners');
    return;
  }
  const [a, b, c] = need.map(dataUrl);
  const css = `
    *{box-sizing:border-box}
    body{margin:0;width:100vw;height:100vh;overflow:hidden;font-family:Inter,system-ui,sans-serif;color:#E6EDF3;
      background:radial-gradient(900px 600px at 78% 40%,rgba(91,192,235,.22),transparent 60%),radial-gradient(700px 500px at 10% 90%,rgba(120,80,255,.16),transparent 60%),linear-gradient(135deg,#0b0e12,#111a24)}
    .wrap{position:absolute;inset:0;display:flex;align-items:center;padding:0 5.5vw}
    .txt{flex:1.12;z-index:2}
    h1{margin:0;font-size:7vw;line-height:1;font-weight:800;letter-spacing:.12em;color:#EAF9FF;text-shadow:0 0 28px rgba(91,192,235,.65),0 0 70px rgba(91,192,235,.35)}
    .tag{margin-top:1.8vw;font-size:2.2vw;font-weight:500;color:#9FB2C4;letter-spacing:.02em;line-height:1.35}
    .tag b{display:block;color:#CFE9F7;font-weight:700}
    .pills{margin-top:2.4vw;display:flex;gap:1vw;flex-wrap:wrap}
    .pills span{border:1px solid rgba(91,192,235,.45);background:rgba(20,30,40,.7);border-radius:99px;padding:.6vw 1.4vw;font-size:1.45vw;font-weight:700;color:#BFE6F7}
    .phones{flex:.88;position:relative;height:100%}
    .ph{position:absolute;width:13vw;border-radius:2vw;overflow:hidden;border:.18vw solid #2b3d4e;box-shadow:0 1.4vw 3.4vw rgba(0,0,0,.65),0 0 3vw rgba(91,192,235,.2)}
    .ph img{display:block;width:100%}
    .p1{left:0;top:21%;transform:rotate(-5deg)}.p2{left:12.9vw;top:8%;z-index:2}.p3{left:25.8vw;top:23%;transform:rotate(5deg)}
    .social .wrap{padding:0 5vw}.social .txt{flex:1.2}.social h1{font-size:7vw}.social .ph{width:15vw}.social .p2{left:15vw}.social .p3{display:none}.social .phones{flex:.62}
    .social .tag{font-size:2.3vw}.social .pills span{font-size:1.5vw}
  `;
  const html = (cls) =>
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@500;700;800&display=swap"><style>${css}</style><body class="${cls}"><div class="wrap"><div class="txt"><h1>BIOLUMA</h1><div class="tag"><b>Vida artificial que brilla</b>Artificial life that glows</div><div class="pills"><span>Gratis · Free</span><span>Sin anuncios · No ads</span><span>PWA</span></div></div><div class="phones"><div class="ph p1"><img src="${a}"></div><div class="ph p2"><img src="${b}"></div><div class="ph p3"><img src="${c}"></div></div></div></body>`;
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 800 }, deviceScaleFactor: 1 });
  await installFonts(ctx);
  const page = await ctx.newPage();
  for (const [name, w, h, cls] of [['hero', 1600, 800, 'hero'], ['social-preview', 1280, 640, 'social']]) {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(html(cls));
    await page.evaluate(() => Promise.all(['800 80px Inter', '700 30px Inter', '500 30px Inter'].map((f) => document.fonts.load(f))));
    await sleep(500);
    const raw = path.join(RAW, `${name}.png`);
    await page.screenshot({ path: raw });
    if (hasConvert()) quantise(raw, path.join(OUT, `${name}.png`));
    else copyFileSync(raw, path.join(OUT, `${name}.png`));
    log('card', name);
  }
  await ctx.close();
}

// ───────────────────────────── main ─────────────────────────────

async function main() {
  const needGame = ['mobile', 'english', 'desktop'].some((k) => ONLY.has(k));
  const dist = needGame ? buildDir() : '';
  const port = dist ? await freePort() : 0;
  const stopPreview = dist ? startServer(['preview', '--outDir', dist], port) : () => {};
  const browser = await chromium.launch({
    executablePath: findChrome(),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  });
  const state = { save: null };
  try {
    if (dist) await waitForHttp(`http://127.0.0.1:${port}/`);
    if (ONLY.has('mobile')) await mobileRun(browser, port, state);
    if (ONLY.has('english')) await englishRun(browser, port, state);
    if (ONLY.has('desktop')) await desktopRun(browser, port, state);
    if (ONLY.has('ranking')) await rankingRun(browser).catch((e) => failures.push(`ranking: ${e.message}`));
    if (ONLY.has('icons')) await iconsRun(browser).catch((e) => failures.push(`icons: ${e.message}`));
    optimise();
    if (ONLY.has('cards')) await cardsRun(browser).catch((e) => failures.push(`cards: ${e.message}`));
  } finally {
    await browser.close();
    stopPreview();
  }
  const files = readdirSync(OUT).filter((f) => f.endsWith('.png')).sort();
  for (const f of files) log(`${String(kb(path.join(OUT, f))).padStart(5)} KB  ${f}${kb(path.join(OUT, f)) > MAX_KB ? '   <-- over the size limit' : ''}`);
  if (consoleErrors.length) log('Console errors:\n  ' + consoleErrors.join('\n  '));
  if (failures.length) log('Failed stages:\n  ' + failures.join('\n  '));
  rmSync(WORK, { recursive: true, force: true });
  process.exit(failures.length || consoleErrors.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
