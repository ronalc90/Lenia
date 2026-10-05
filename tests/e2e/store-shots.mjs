#!/usr/bin/env node
/**
 * Visual check of the store + wardrobe on store-dev.html (dev mock provider, fake purchases):
 *   node tests/e2e/store-shots.mjs
 * Starts Vite on a free port, opens the dev page in headless Chromium (390×844 mobile, 360×640
 * minimum, 1280×800 desktop), walks every tab, a detail sheet, a mock purchase + equip, the
 * supporter states and the wardrobe, and saves PNGs as store-*.png to $STORE_SHOTS_DIR (default:
 * <OS temp dir>/bioluma-shots). Fails on console errors, page errors or horizontal overflow.
 * Uses playwright-core with the Chromium under /opt/pw-browsers (never `playwright install`).
 */
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = process.env.STORE_SHOTS_DIR ?? `${tmpdir()}/bioluma-shots`;
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
  page.setDefaultTimeout(10000);
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    const url = msg.location()?.url ?? '';
    if (/fonts\.(googleapis|gstatic)\.com/.test(url + text)) return; // optional web fonts
    errors.push(`[${label}] console: ${text}`);
  });
  page.on('pageerror', (err) => errors.push(`[${label}] pageerror: ${err.message}`));
}

async function shot(page, name) {
  const file = path.join(OUT, `store-${name}.png`);
  await page.screenshot({ path: file });
  shots.push(file);
  const bad = await page.evaluate(() => {
    const W = window.innerWidth;
    const out = [];
    if (document.documentElement.scrollWidth > W + 1) out.push(`document scrollWidth ${document.documentElement.scrollWidth} > ${W}`);
    for (const el of document.querySelectorAll('.bst *')) {
      if (el.closest('.bst-tabs, .bst-wd-row, canvas')) continue; // horizontal scrollers by design
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (r.right > W + 1.5 || r.left < -1.5) {
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

/** Targets smaller than 44×44 CSS px among visible buttons (48 is the goal; 44 the hard floor). */
async function smallTargets(page, name) {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('.bst button, .bst a')]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        const cs = getComputedStyle(b);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !b.closest('[hidden]') && (r.height < 39.5 || r.width < 39.5);
      })
      .map((b) => `${b.className || b.tagName}:${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`)
      .slice(0, 6),
  );
  if (small.length) overflow.push(`${name} small targets: ${small.join(' | ')}`);
}

const pause = (page, ms) => page.waitForTimeout(ms);

async function run() {
  const port = await freePort();
  const vite = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, BROWSER: 'none' },
    detached: true,
  });
  let viteLog = '';
  vite.stdout.on('data', (d) => (viteLog += d));
  vite.stderr.on('data', (d) => (viteLog += d));
  const base = `http://127.0.0.1:${port}/store-dev.html`;
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    await waitFor(base);
    const open = async (vp, params, label) => {
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: vp.width < 700, isMobile: vp.width < 700 });
      const page = await ctx.newPage();
      watch(page, label);
      await page.goto(`${base}?${params}`);
      await page.waitForSelector('.bst-modal');
      await pause(page, 1300); // entry animation + live field warm-up
      return { ctx, page };
    };
    const mobile = { width: 390, height: 844 };

    // Every tab on mobile.
    {
      const { ctx, page } = await open(mobile, 'open=store&tab=palettes', 'mobile');
      await shot(page, 'palettes');
      await smallTargets(page, 'palettes');
      await page.locator('.bst-body').evaluate((b) => (b.scrollTop = b.scrollHeight));
      await pause(page, 500);
      await shot(page, 'palettes-bottom');
      for (const [i, name] of [
        [1, 'dish'],
        [2, 'effects'],
        [3, 'music'],
        [4, 'profile'],
        [5, 'supporter'],
      ]) {
        await page.locator('.bst-tab').nth(i).click();
        await pause(page, 700);
        await shot(page, name);
        await smallTargets(page, name);
      }
      await page.locator('.bst-body').evaluate((b) => (b.scrollTop = b.scrollHeight));
      await pause(page, 600);
      await shot(page, 'supporter-founder');
      await page.locator('.bst-tab').nth(2).click();
      await page.locator('.bst-body').evaluate((b) => (b.scrollTop = 900));
      await pause(page, 700);
      await shot(page, 'effects-sparks');
      await ctx.close();
    }

    // Detail sheet → mock purchase → equip.
    {
      const { ctx, page } = await open(mobile, 'open=store&tab=palettes&latency=2500', 'buy');
      await page.locator('.bst-card[data-id="palette.aurora"]').click();
      await pause(page, 900);
      await shot(page, 'detail-aurora');
      await smallTargets(page, 'detail');
      await page.locator('.bst-sheet .bst-btn.block').click();
      await pause(page, 250);
      await shot(page, 'detail-buying');
      await page.waitForFunction(() => window.__store.entitlements.isOwned('palette.aurora'));
      await pause(page, 400);
      await shot(page, 'detail-bought');
      await page.locator('.bst-sheet .bst-btn.block').click(); // Equipar
      await pause(page, 500);
      await shot(page, 'detail-equipped');
      const eq = await page.evaluate(() => window.__store.entitlements.equippedId('palette'));
      if (eq !== 'palette.aurora') errors.push(`[buy] expected aurora equipped, got ${eq}`);
      await page.keyboard.press('Escape');
      await pause(page, 500);
      await shot(page, 'palettes-after-equip');
      // Locked achievement item.
      await page.locator('.bst-card[data-id="palette.mono"]').click();
      await pause(page, 700);
      await shot(page, 'detail-achievement');
      await ctx.close();
    }

    // Music detail, profile detail, pack detail.
    {
      const { ctx, page } = await open(mobile, 'open=store&tab=music&detail=music.deepsea', 'music');
      await pause(page, 600);
      await shot(page, 'detail-music');
      await page.keyboard.press('Escape');
      await pause(page, 300);
      await page.evaluate(() => window.__store.showStore('profile'));
      await pause(page, 600);
      await page.locator('.bst-card[data-id="frame.gilded"]').click();
      await pause(page, 600);
      await shot(page, 'detail-frame');
      await page.keyboard.press('Escape');
      await pause(page, 300);
      await page.evaluate(() => window.__store.showStore('palettes'));
      await pause(page, 500);
      await page.locator('.bst-pack').first().click();
      await pause(page, 800);
      await shot(page, 'detail-pack');
      await ctx.close();
    }

    // Supporter: subscribe through the mock, then the active state.
    {
      const { ctx, page } = await open(mobile, 'open=store&tab=supporter', 'subscribe');
      await page.locator('.bst-plan').nth(1).click();
      await pause(page, 200);
      await shot(page, 'supporter-yearly');
      await page.locator('.bst-sup-hero .bst-btn.gold').click();
      await page.waitForFunction(() => window.__store.entitlements.isSubscriber());
      await pause(page, 600);
      await shot(page, 'supporter-active');
      await page.locator('.bst-tab').nth(4).click();
      await pause(page, 500);
      await page.locator('.bst-card[data-id="name.mecenas.gold"]').click();
      await pause(page, 500);
      await page.locator('.bst-sheet .bst-btn.block').click();
      await pause(page, 300);
      await page.keyboard.press('Escape');
      await page.locator('.bst-card[data-id="badge.mecenas"]').click();
      await pause(page, 400);
      await page.locator('.bst-sheet .bst-btn.block').click();
      await pause(page, 300);
      await page.keyboard.press('Escape');
      await pause(page, 400);
      await shot(page, 'profile-supporter');
      await ctx.close();
    }

    // Wardrobe with achievements + some purchases.
    {
      const { ctx, page } = await open(mobile, 'open=wardrobe&ach=1&own=palette.ember,halo.petals,spark.comet&equip=palette.ember,halo.petals,spark.comet,badge.naturalist,frame.petri', 'wardrobe');
      await pause(page, 600);
      await shot(page, 'wardrobe');
      await smallTargets(page, 'wardrobe');
      await page.locator('.bst-body').evaluate((b) => (b.scrollTop = b.scrollHeight));
      await pause(page, 500);
      await shot(page, 'wardrobe-bottom');
      await ctx.close();
    }

    // Minimum size, English, desktop, reduced motion.
    {
      const { ctx, page } = await open({ width: 360, height: 640 }, 'open=store&tab=palettes', 'min');
      await shot(page, 'min-palettes');
      await page.locator('.bst-tab').nth(5).click();
      await pause(page, 600);
      await shot(page, 'min-supporter');
      await ctx.close();
    }
    {
      const { ctx, page } = await open(mobile, 'open=store&tab=supporter&lang=en', 'en');
      await shot(page, 'en-supporter');
      await ctx.close();
    }
    {
      const { ctx, page } = await open({ width: 1280, height: 800 }, 'open=store&tab=palettes&ach=1', 'desktop');
      await shot(page, 'desktop-palettes');
      await page.locator('.bst-card[data-id="palette.prism"]').click();
      await pause(page, 900);
      await shot(page, 'desktop-detail');
      await page.keyboard.press('Escape');
      await page.locator('.bst-tab').nth(5).click();
      await pause(page, 800);
      await shot(page, 'desktop-supporter');
      await ctx.close();
    }
    {
      const { ctx, page } = await open(mobile, 'open=store&tab=effects&rm=1', 'reduced');
      await shot(page, 'reduced-effects');
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
  console.log(`saved ${shots.length} screenshots to ${OUT}`);
  if (overflow.length) console.log('LAYOUT ISSUES:\n  ' + overflow.join('\n  '));
  if (errors.length) {
    console.error('ERRORS:\n  ' + errors.join('\n  '));
    if (process.env.VERBOSE) console.error(viteLog);
    process.exit(1);
  }
  if (overflow.length) process.exit(2);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
