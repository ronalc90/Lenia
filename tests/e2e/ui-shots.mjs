#!/usr/bin/env node
/**
 * Visual check of the UI on ui-dev.html (mock game):
 *   node tests/e2e/ui-shots.mjs
 * Starts Vite on a free port, opens the dev page in headless Chromium at
 * 390×844 (mobile), 360×640 (minimum) and 1366×768 (desktop), clicks through
 * every tab, modal and juice state, and saves PNGs to $UI_SHOTS_DIR
 * (default: the session scratchpad). Fails on console errors, page errors or
 * horizontal overflow.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT =
  process.env.UI_SHOTS_DIR ?? '/tmp/claude-0/-home-user-Lenia/a5114f5a-39a4-539d-9a6a-14e769759a92/scratchpad';
mkdirSync(OUT, { recursive: true });

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

async function waitFor(url, ms = 30000) {
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

const errors = [];
const overflow = [];
const shots = [];

function watch(page, label) {
  page.setDefaultTimeout(8000);
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    const url = msg.location()?.url ?? '';
    // Web fonts are optional (offline / proxied CI): ignore their load failures.
    if (/fonts\.(googleapis|gstatic)\.com/.test(url + text)) return;
    errors.push(`[${label}] console: ${text}`);
  });
  page.on('pageerror', (err) => errors.push(`[${label}] pageerror: ${err.message}`));
}

async function shot(page, name) {
  const file = path.join(OUT, `ui-${name}.png`);
  if (process.env.VERBOSE) console.log('shot', name);
  await page.screenshot({ path: file });
  shots.push(file);
  // Horizontal overflow check: any visible element sticking out of the viewport.
  const bad = await page.evaluate(() => {
    const W = window.innerWidth;
    const out = [];
    if (document.documentElement.scrollWidth > W + 1) out.push(`document scrollWidth ${document.documentElement.scrollWidth} > ${W}`);
    for (const el of document.querySelectorAll('.bl *')) {
      if (el.closest('.chips, .bl-fx, canvas, .toasts')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (r.right > W + 1.5 || r.left < -1.5) {
        // Ignore elements clipped by an overflow:hidden ancestor that itself fits.
        let p = el.parentElement;
        let clipped = false;
        while (p && p !== document.body) {
          const ps = getComputedStyle(p);
          if (ps.overflowX !== 'visible') {
            const pr = p.getBoundingClientRect();
            if (pr.right <= W + 1.5 && pr.left >= -1.5) clipped = true;
            break;
          }
          p = p.parentElement;
        }
        if (!clipped) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').join('.')} [${Math.round(r.left)}..${Math.round(r.right)}]`);
      }
    }
    return out.slice(0, 8);
  });
  if (bad.length) overflow.push(`${name}: ${bad.join(' | ')}`);
}

const pause = (page, ms) => page.waitForTimeout(ms);

async function clickTab(page, index) {
  await page.locator('.bl-tabs .tab').nth(index).click();
  await pause(page, 350);
}

/** Screen position (page coords) of the first stable creature. */
async function stableCreaturePos(page) {
  return page.evaluate(() => {
    const g = window.__game;
    const cam = window.__camera;
    const r = document.querySelector('.bl-dish').getBoundingClientRect();
    // Prefer a stable creature well inside the visible dish (zoom may hide some).
    const cands = g.creatures
      .filter((x) => x.state === 'stable')
      .map((c) => ({ c, p: cam.gridToScreen(c.x, c.y) }))
      .filter(({ p }) => p.x > 60 && p.y > 140 && p.x < r.width - 60 && p.y < r.height - 60);
    const pick = cands[0] ?? { p: cam.gridToScreen(g.creatures[0].x, g.creatures[0].y) };
    return { x: r.left + pick.p.x, y: r.top + pick.p.y };
  });
}

async function run() {
  const port = await freePort();
  const vite = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
    detached: true, // own process group, so npx + vite die together
  });
  let viteLog = '';
  vite.stdout.on('data', (d) => (viteLog += d));
  vite.stderr.on('data', (d) => (viteLog += d));
  const base = `http://127.0.0.1:${port}/ui-dev.html`;
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox'] });
  try {
    await waitFor(base);

    // ───────────── Mobile 390×844 ─────────────
    const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' };
    {
      const ctx = await browser.newContext(mobile);
      const page = await ctx.newPage();
      watch(page, 'mobile');
      await page.goto(base + '?splash=0');
      await page.waitForSelector('.bl-tabs .tab:not([hidden])');
      await pause(page, 900);
      await shot(page, 'mobile-lab');

      // Juice: species burst + income floats + golden spark visible.
      await page.evaluate(() => window.__game.fakeDiscovery());
      await pause(page, 450);
      await shot(page, 'mobile-juice');

      // Creature card
      await pause(page, 2600);
      const cp = await stableCreaturePos(page);
      await page.touchscreen.tap(cp.x, cp.y);
      await pause(page, 300);
      await shot(page, 'mobile-creature');
      await page.locator('.ccard-close').click();

      // Gestures (CDP multi-touch): long press → big seed, pinch → zoom, no seeding.
      {
        const cdp = await ctx.newCDPSession(page);
        const box = await page.locator('.bl-dish').boundingBox();
        const cx = box.x + box.width * 0.5;
        const cy = box.y + box.height * 0.82;
        const before = await page.evaluate(() => window.__game.stats.seeds);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
        await pause(page, 330);
        await shot(page, 'mobile-longpress-charge');
        await pause(page, 250);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await pause(page, 120);
        const after = await page.evaluate(() => window.__game.stats.seeds);
        if (after !== before + 1) errors.push(`[gesture] long press did not seed once (${before} → ${after})`);
        await shot(page, 'mobile-longpress-seed');

        const seeds0 = after;
        const z0 = await page.evaluate(() => window.__camera.zoom);
        const my = box.y + box.height * 0.5;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 30, y: my, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 30, y: my, id: 1 }, { x: cx + 30, y: my, id: 2 }] });
        for (let i = 1; i <= 8; i++) {
          const d = 30 + i * 14;
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - d, y: my, id: 1 }, { x: cx + d, y: my, id: 2 }] });
          await pause(page, 16);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await pause(page, 200);
        const z1 = await page.evaluate(() => window.__camera.zoom);
        const seeds1 = await page.evaluate(() => window.__game.stats.seeds);
        if (!(z1 > z0 * 1.8)) errors.push(`[gesture] pinch did not zoom (${z0} → ${z1})`);
        if (seeds1 !== seeds0) errors.push('[gesture] pinch seeded');
        await shot(page, 'mobile-pinched');
        await page.evaluate(() => window.__camera.zoomAt(1 / window.__camera.zoom, 10, 10));
        await cdp.detach();
      }

      // Fast swimmers at ×4: halos must stay glued to the sprites (velocity extrapolation).
      await page.locator('.fab-speed').click();
      await page.locator('.fab-speed').click();
      await page.evaluate(() => {
        for (const c of window.__game.creatures) if (c.vx || c.vy) { c.vx *= 2; c.vy *= 2; }
      });
      await pause(page, 900);
      await shot(page, 'mobile-fast-align');
      await page.locator('.fab-speed').click();
      await pause(page, 200);

      // Seed denied (broke) feedback
      await page.evaluate(() => (window.__game.essence = 0));
      await pause(page, 150);
      const dish = await page.locator('.bl-dish').boundingBox();
      await page.touchscreen.tap(dish.x + dish.width * 0.5, dish.y + dish.height * 0.18);
      await pause(page, 200);
      await shot(page, 'mobile-denied');
      await page.evaluate(() => (window.__game.essence = 18450));

      await clickTab(page, 1);
      await shot(page, 'mobile-bestiary');
      await page.locator('.panel:not([hidden]) .panel-scroll').evaluate((el) => (el.scrollTop = 10000));
      await pause(page, 200);
      await shot(page, 'mobile-bestiary-grid');
      await page.locator('.sp:not(.unknown)').first().click();
      await pause(page, 400);
      await shot(page, 'mobile-species');
      await page.locator('.modal .btn.good').click(); // Print → print mode
      await pause(page, 300);
      await shot(page, 'mobile-print-mode');
      await page.keyboard.press('Escape');

      await clickTab(page, 2);
      await shot(page, 'mobile-calibrate');
      await clickTab(page, 3);
      await page.locator('.gnode').nth(1).click();
      await pause(page, 250);
      await shot(page, 'mobile-genome');

      await page.locator('.bl-handle').click();
      await pause(page, 400);
      await shot(page, 'mobile-collapsed');
      await page.locator('.bl-handle').click();
      await pause(page, 300);

      await page.locator('.hud-btn[aria-label="Ajustes"]').click();
      await pause(page, 400);
      await shot(page, 'mobile-settings');
      await page.locator('.modal-body').evaluate((el) => (el.scrollTop = 10000));
      await pause(page, 150);
      await shot(page, 'mobile-settings-bottom');
      await page.locator('.modal-close').click();
      await pause(page, 300);

      await page.locator('.hud-btn[aria-label="Bitácora"]').click();
      await pause(page, 400);
      await shot(page, 'mobile-journal');
      await page.locator('.modal .seg button').nth(1).click();
      await pause(page, 150);
      await shot(page, 'mobile-achievements');
      await page.locator('.modal-close').click();
      await pause(page, 300);

      // Extinction ritual: mid-whitening, then the era summary card.
      await clickTab(page, 3);
      await page.evaluate(() => window.__game.extinguish());
      await pause(page, 1600);
      await shot(page, 'mobile-ritual');
      await pause(page, 2600);
      await shot(page, 'mobile-era');
      await ctx.close();
    }

    // Fresh first-run + offline card + English
    {
      const ctx = await browser.newContext(mobile);
      const page = await ctx.newPage();
      watch(page, 'fresh');
      await page.goto(base + '?scene=fresh&splash=0&tutorial=0');
      await pause(page, 900);
      await shot(page, 'mobile-fresh');
      await page.goto(base + '?scene=early&lang=en&offline=1&splash=0');
      await pause(page, 1500);
      await shot(page, 'mobile-offline-en');
      await page.locator('.modal .btn.primary').click();
      await pause(page, 400);
      await shot(page, 'mobile-early-en');
      await ctx.close();
    }

    // Title screen, interactive tutorial and leaderboard.
    {
      const ctx = await browser.newContext(mobile);
      const page = await ctx.newPage();
      watch(page, 'splash');
      await page.goto(base + '?scene=fresh&tutorial=1');
      await pause(page, 2600);
      await shot(page, 'mobile-splash');
      await page.locator('[data-testid="splash"]').tap();
      await pause(page, 1200);
      await shot(page, 'mobile-tut-seed');
      const box = await page.locator('.bl-dish').boundingBox();
      await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.55);
      await pause(page, 1400);
      await shot(page, 'mobile-tut-wait');
      await pause(page, 3200);
      await shot(page, 'mobile-tut-stable');
      await page.locator('[data-testid="tutorial-next"]').click();
      await pause(page, 1300);
      await shot(page, 'mobile-tut-essence');
      await page.locator('[data-testid="tutorial-next"]').click();
      await pause(page, 1500);
      await shot(page, 'mobile-tut-lab');
      await page.locator('[data-up="dropper"] .buy').click();
      await pause(page, 900);
      await page.evaluate(() => {
        const g = window.__game;
        g.golden = { x: 60, y: 90, vx: 2, vy: 1, life: 1 };
      });
      await pause(page, 1600);
      await shot(page, 'mobile-tut-golden');
      await page.locator('[data-testid="tutorial-skip"]').click();
      await pause(page, 400);
      await ctx.close();
    }
    {
      const ctx = await browser.newContext(mobile);
      const page = await ctx.newPage();
      watch(page, 'ranking');
      await page.goto(base + '?splash=0');
      await page.waitForSelector('.bl-tabs .tab:not([hidden])');
      await pause(page, 500);
      await page.locator('.hud-btn[aria-label="Ranking"]').click();
      await pause(page, 400);
      await page.locator('.lb-input').fill('ab');
      await shot(page, 'mobile-rank-nick');
      await page.locator('.lb-input').fill('Pilar');
      await page.locator('.lb-nick .btn').click();
      await pause(page, 750);
      await shot(page, 'mobile-rank-loading');
      await pause(page, 900);
      await shot(page, 'mobile-rank');
      await page.locator('.modal .seg button').nth(1).click();
      await pause(page, 1000);
      await shot(page, 'mobile-rank-species');
      await page.goto(base + '?splash=0&lb=error');
      await page.waitForSelector('.bl-tabs .tab:not([hidden])');
      await pause(page, 400);
      await page.locator('.hud-btn[aria-label="Ranking"]').click();
      await page.locator('.lb-input').fill('Pilar');
      await page.locator('.lb-nick .btn').click();
      await pause(page, 1600);
      await shot(page, 'mobile-rank-error');
      await ctx.close();
    }

    // Light theme (daylight lab): main panels, modals, ranking and tutorial.
    {
      const ctx = await browser.newContext(mobile);
      const page = await ctx.newPage();
      watch(page, 'light');
      await page.goto(base + '?splash=0&theme=light');
      await page.waitForSelector('.bl-tabs .tab:not([hidden])');
      await pause(page, 900);
      await shot(page, 'light-mobile-lab');
      await clickTab(page, 1);
      await shot(page, 'light-mobile-bestiary');
      await page.locator('.sp:not(.unknown)').first().click();
      await pause(page, 400);
      await shot(page, 'light-mobile-species');
      await page.locator('.modal-close').click();
      await pause(page, 300);
      await clickTab(page, 2);
      await shot(page, 'light-mobile-calibrate');
      await clickTab(page, 3);
      await shot(page, 'light-mobile-genome');
      await page.locator('.hud-btn[aria-label="Ajustes"]').click();
      await pause(page, 400);
      await shot(page, 'light-mobile-settings');
      await page.locator('.modal-close').click();
      await pause(page, 300);
      await page.locator('.hud-btn[aria-label="Ranking"]').click();
      await page.locator('.lb-input').fill('Pilar');
      await page.locator('.lb-nick .btn').click();
      await pause(page, 1800);
      await shot(page, 'light-mobile-rank');
      await page.locator('.modal-close').click();
      await pause(page, 300);
      await page.goto(base + '?scene=fresh&tutorial=1&splash=0&theme=light');
      await pause(page, 1200);
      const box = await page.locator('.bl-dish').boundingBox();
      await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.55);
      await pause(page, 4600);
      await page.locator('[data-testid="tutorial-next"]').click();
      await pause(page, 1300);
      await page.locator('[data-testid="tutorial-next"]').click();
      await pause(page, 1500);
      await shot(page, 'light-mobile-tut-lab');
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, colorScheme: 'dark' });
      const page = await ctx.newPage();
      watch(page, 'light-desktop');
      await page.goto(base + '?splash=0&theme=light');
      await page.waitForSelector('.bl-tabs .tab:not([hidden])');
      await pause(page, 900);
      await shot(page, 'light-desktop-lab');
      await page.keyboard.press('2');
      await pause(page, 350);
      await shot(page, 'light-desktop-bestiary');
      await page.keyboard.press('4');
      await pause(page, 350);
      await shot(page, 'light-desktop-genome');
      await page.locator('.hud-btn[aria-label="Ajustes"]').click();
      await pause(page, 400);
      await shot(page, 'light-desktop-settings');
      await ctx.close();
    }

    // System text at 130% (accessibility): layout must not break.
    {
      const ctx = await browser.newContext(mobile);
      const page = await ctx.newPage();
      watch(page, 'text130');
      await page.goto(base + '?splash=0');
      await page.addStyleTag({ content: 'html { font-size: 130% !important; }' });
      await page.waitForSelector('.bl-tabs .tab:not([hidden])');
      await pause(page, 800);
      await shot(page, 'mobile-text130');
      await clickTab(page, 3);
      await shot(page, 'mobile-text130-genome');
      await ctx.close();
    }

    // Reduce motion: everything still renders, no errors.
    {
      const ctx = await browser.newContext(mobile);
      const page = await ctx.newPage();
      watch(page, 'rm');
      await page.goto(base + '?rm=1&splash=0');
      await page.waitForSelector('.bl-tabs .tab:not([hidden])');
      await page.evaluate(() => window.__game.fakeDiscovery());
      await pause(page, 600);
      await shot(page, 'mobile-reduce-motion');
      await ctx.close();
    }

    // Minimum size 360×640
    {
      const ctx = await browser.newContext({ ...mobile, viewport: { width: 360, height: 640 } });
      const page = await ctx.newPage();
      watch(page, 'min');
      await page.goto(base + '?splash=0');
      await page.waitForSelector('.bl-tabs .tab:not([hidden])');
      await pause(page, 800);
      await shot(page, 'min-lab');
      await clickTab(page, 3);
      await shot(page, 'min-genome');
      await ctx.close();
    }

    // ───────────── Desktop 1366×768 ─────────────
    {
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, colorScheme: 'dark' });
      const page = await ctx.newPage();
      watch(page, 'desktop');
      await page.goto(base + '?splash=0');
      await page.waitForSelector('.bl-tabs .tab:not([hidden])');
      await pause(page, 900);
      await shot(page, 'desktop-lab');
      await page.keyboard.press('2');
      await pause(page, 350);
      await shot(page, 'desktop-bestiary');
      await page.keyboard.press('3');
      await pause(page, 350);
      await shot(page, 'desktop-calibrate');
      await page.keyboard.press('4');
      await pause(page, 350);
      await shot(page, 'desktop-genome');
      await page.locator('.hud-btn[aria-label="Ajustes"]').click();
      await pause(page, 400);
      await shot(page, 'desktop-settings');
      await page.keyboard.press('Escape');
      await pause(page, 300);
      // Zoom with the wheel over the dish, then a creature card.
      const box = await page.locator('.bl-dish').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -250);
      await pause(page, 300);
      const cp = await stableCreaturePos(page);
      await page.mouse.click(cp.x, cp.y);
      await pause(page, 300);
      await shot(page, 'desktop-zoom-card');
      await page.locator('.hud-btn[aria-label="Ranking"]').click();
      await page.locator('.lb-input').fill('Pilar');
      await page.locator('.lb-nick .btn').click();
      await pause(page, 1800);
      await shot(page, 'desktop-rank');
      await page.keyboard.press('Escape');
      await pause(page, 300);
      await page.goto(base);
      await pause(page, 2600);
      await shot(page, 'desktop-splash');
      await page.goto(base + '?unsupported=1&splash=0');
      await pause(page, 500);
      await shot(page, 'desktop-unsupported');
      await ctx.close();
    }
  } finally {
    await browser.close();
    try {
      process.kill(-vite.pid, 'SIGTERM');
    } catch {
      vite.kill('SIGTERM');
    }
  }

  console.log(`Saved ${shots.length} screenshots to ${OUT}`);
  if (overflow.length) console.log('Overflow:\n  ' + overflow.join('\n  '));
  if (errors.length) console.log('Errors:\n  ' + errors.join('\n  '));
  if (errors.length || overflow.length) {
    if (!errors.length) console.log(viteLog.slice(-2000));
    process.exit(1);
  }
  console.log('OK: no console errors, no horizontal overflow.');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
