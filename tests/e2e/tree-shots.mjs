#!/usr/bin/env node
/**
 * Visual check of the research tree and the session screens on tree-dev.html:
 *   node tests/e2e/tree-shots.mjs            (all)
 *   ONLY=summary node tests/e2e/tree-shots.mjs
 * Starts Vite on a free port, opens the dev page in headless Chromium at 390×844 (phone) and
 * 1366×768 (laptop), dark and light, es/en, and captures the tree (several progress stages, node
 * sheets, a purchase), the session HUD states, the start card and the end-of-session summary into
 * $TREE_SHOTS_DIR (default: <OS temp dir>/bioluma-shots) as tree-*.png and session-*.png.
 * Fails on console errors, page errors, horizontal overflow or tap targets under 48 px.
 */
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = process.env.TREE_SHOTS_DIR ?? `${tmpdir()}/bioluma-shots`;
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

const PHONE = { width: 390, height: 844 };
const LAPTOP = { width: 1366, height: 768 };

/** [file name, query, viewport, settle ms, checkTargets] */
const PLAN = [
  // Tree: progress stages (phone, dark).
  ['tree-new', '?view=tree&preset=new&datos=28&menu=0', PHONE, 700, true],
  ['tree-early', '?view=tree&preset=early&menu=0', PHONE, 700, true],
  ['tree-mid', '?view=tree&preset=mid&menu=0', PHONE, 700, true],
  ['tree-late', '?view=tree&preset=late&menu=0', PHONE, 700, true],
  ['tree-all-overview', '?view=tree&preset=all&menu=0&zoom=0.2&focus=lab', PHONE, 900, false],
  // The 7 straight routes, whole tree (laptop).
  ['tree-routes-laptop', '?view=tree&preset=all&menu=0&zoom=0.21&focus=lab', LAPTOP, 900, false],
  ['tree-routes-late-laptop', '?view=tree&preset=late&menu=0', LAPTOP, 900, true],
  // Node sheets: antes → después, the price equation, the next levels.
  ['tree-sheet-clock', '?view=tree&preset=early&menu=0&sel=clock', PHONE, 900, true],
  ['tree-sheet-culture', '?view=tree&preset=early&datos=4&menu=0&sel=culture', PHONE, 900, true],
  ['tree-sheet-why', '?view=tree&preset=early&datos=4&menu=0&sel=culture&why=1', PHONE, 1300, false],
  ['tree-sheet-mystery', '?view=tree&preset=early&menu=0&sel=fridge', PHONE, 900, true],
  ['tree-sheet-moon', '?view=tree&preset=early&add=clock2:1,fridge:1&menu=0&sel=sprint', PHONE, 900, true],
  ['tree-sheet-available', '?view=tree&preset=mid&menu=0&sel=sprint', PHONE, 900, true],
  ['tree-sheet-world', '?view=tree&preset=mid&datos=900&menu=0&sel=worldShields', PHONE, 900, true],
  ['tree-sheet-night', '?view=tree&preset=mid&sessions=8&menu=0&sel=lab', PHONE, 900, true],
  ['tree-sheet-max', '?view=tree&preset=late&menu=0&sel=culture', PHONE, 900, true],
  // Purchase animation (mid-burst) and the price ticker.
  ['tree-buy', '?view=tree&preset=early&datos=40&menu=0&buy=clock2', PHONE, 820, false],
  // Light / English / laptop.
  ['tree-mid-light-en', '?view=tree&preset=mid&menu=0&theme=light&lang=en', PHONE, 700, true],
  ['tree-sheet-light-en', '?view=tree&preset=late&menu=0&theme=light&lang=en&sel=autoSeeder', PHONE, 900, true],
  ['tree-mid-laptop', '?view=tree&preset=mid&menu=0', LAPTOP, 700, true],
  ['tree-sheet-laptop', '?view=tree&preset=mid&menu=0&sel=fridge', LAPTOP, 900, true],
  ['tree-sheet-why-laptop', '?view=tree&preset=mid&menu=0&sel=fridge&why=1', LAPTOP, 1300, false],
  ['tree-late-laptop-light', '?view=tree&preset=late&menu=0&theme=light', LAPTOP, 700, true],
  ['tree-rm', '?view=tree&preset=early&menu=0&rm=1&sel=dish', PHONE, 500, true],
  // Session HUD (clock + "+N Datos al terminar · next node").
  ['session-hud-wait', '?view=hud&phase=ready&t=210&total=210&menu=0', PHONE, 500, false],
  ['session-hud-run', '?view=hud&t=154&total=210&menu=0&ext=5', PHONE, 400, false],
  ['session-hud-why', '?view=hud&t=120&total=210&menu=0&essence=1240&why=1', PHONE, 700, false],
  ['session-hud-warn', '?view=hud&t=24&total=210&menu=0', PHONE, 500, false],
  ['session-hud-sprint-light', '?view=hud&t=18&total=210&sprint=2&menu=0&theme=light', PHONE, 500, false],
  ['session-hud-lastminute', '?view=hud&t=59&total=210&banner=1&menu=0', PHONE, 450, false],
  ['session-hud-timesup', '?view=hud&t=0&total=210&phase=over&stamp=1&menu=0', PHONE, 600, false],
  // Start card with the world picker.
  ['session-start', '?view=start&preset=mid&menu=0', PHONE, 700, true],
  ['session-start-late', '?view=start&preset=late&menu=0&fresh=worldLegs,clock3', PHONE, 700, true],
  ['session-start-light-en', '?view=start&preset=mid&menu=0&theme=light&lang=en', PHONE, 700, true],
  ['session-start-laptop', '?view=start&preset=late&menu=0', LAPTOP, 700, true],
  // Summary.
  ['session-summary-first', '?view=summary&sum=first&preset=new&menu=0&instant=1', PHONE, 900, true],
  ['session-summary-rich', '?view=summary&sum=rich&menu=0&instant=1', PHONE, 900, true],
  ['session-summary-poor', '?view=summary&sum=poor&preset=s1&menu=0&instant=1', PHONE, 900, true],
  ['session-summary-tally', '?view=summary&sum=first&preset=new&menu=0', PHONE, 1500, false],
  ['session-summary-light-en', '?view=summary&sum=rich&menu=0&instant=1&theme=light&lang=en', PHONE, 900, true],
  ['session-summary-laptop', '?view=summary&sum=rich&menu=0&instant=1', LAPTOP, 900, true],
];

const errors = [];
const shots = [];

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
  const base = `http://127.0.0.1:${port}/tree-dev.html`;
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox'] });
  try {
    await waitFor(base);
    const only = process.env.ONLY;
    const contexts = new Map();
    for (const [name, query, vp, settle, checkTargets] of PLAN) {
      if (only && !name.includes(only)) continue;
      const key = `${vp.width}x${vp.height}`;
      if (!contexts.has(key)) {
        const mobile = vp.width < 600;
        contexts.set(key, await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile }));
      }
      const page = await contexts.get(key).newPage();
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        const url = msg.location()?.url ?? '';
        if (/fonts\.(googleapis|gstatic)\.com|ERR_CERT|net::ERR/.test(url + text)) return;
        errors.push(`[${name}] console: ${text}`);
      });
      page.on('pageerror', (err) => errors.push(`[${name}] pageerror: ${err.message}`));
      await page.goto(base + query, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__tree?.ready === true, null, { timeout: 20000 });
      await page.evaluate(() => document.fonts?.ready);
      await page.waitForTimeout(settle);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (overflow) errors.push(`[${name}] horizontal overflow`);
      if (checkTargets) {
        const small = await page.evaluate(() => {
          const out = [];
          for (const b of document.querySelectorAll('.rt-go, .rt-tool, .rt-buy, .rt-x, .rt-need, .rt-pricebox, .ss-btn, .ss-world')) {
            const r = b.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (r.width < 47.5 || r.height < 43.5) out.push(`${b.className} ${Math.round(r.width)}×${Math.round(r.height)}`);
          }
          return out;
        });
        for (const s of small) errors.push(`[${name}] small target: ${s}`);
      }
      const file = path.join(OUT, `${name}.png`);
      await page.screenshot({ path: file });
      shots.push(file);
      await page.close();
    }
    if (!process.env.ONLY || process.env.ONLY === 'interact') await interact(browser, base);
  } finally {
    await browser.close();
    try {
      process.kill(-vite.pid);
    } catch {
      vite.kill();
    }
  }
  console.log(`${shots.length} screenshots in ${OUT}`);
  if (errors.length) {
    console.error(errors.join('\n'));
    if (/error/i.test(viteLog)) console.error(viteLog.slice(-2000));
    process.exit(1);
  }
}

/** Real input on a phone: tap a node, buy it, pan with a drag, zoom with the wheel. */
async function interact(browser, base) {
  const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => errors.push(`[interact] pageerror: ${err.message}`));
  await page.goto(base + '?view=tree&preset=early&datos=40&menu=0', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__tree?.ready === true);
  await page.waitForTimeout(500);
  const box = await page.locator('.rt-node[data-id="clock2"] .rt-tile').boundingBox();
  if (!box) errors.push('[interact] clock2 not on screen');
  else {
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(500);
    const open = await page.evaluate(() => document.querySelector('.rt-sheet')?.classList.contains('show'));
    if (!open) errors.push('[interact] tapping a node did not open its sheet');
    const before = await page.evaluate(() => window.__tree.research().datos);
    await page.locator('.rt-buy[data-buy="clock2"]').click();
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ d: window.__tree.research().datos, l: window.__tree.research().levels.clock2 }));
    if (!(after.d < before) || after.l !== 1) errors.push(`[interact] buy failed: ${before} → ${JSON.stringify(after)}`);
    await page.locator('.rt-x').click();
    await page.waitForTimeout(450); // the sheet slides away
  }
  const tf = () => page.evaluate(() => document.querySelector('.rt-world').style.transform);
  const t0 = await tf();
  await page.mouse.move(200, 600);
  await page.mouse.down();
  await page.mouse.move(260, 520, { steps: 6 });
  await page.mouse.up();
  const t1 = await tf();
  if (t0 === t1) errors.push('[interact] drag did not pan');
  await page.mouse.move(195, 500);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(100);
  const t2 = await tf();
  const scale = (t) => Number(/scale\(([\d.]+)\)/.exec(t)?.[1] ?? 0);
  if (!(scale(t2) > scale(t1))) errors.push(`[interact] wheel did not zoom in (${t1} → ${t2})`);
  // Pinch (two synthetic pointers moving apart) zooms in.
  const t3 = await page.evaluate(() => {
    const vp = document.querySelector('.rt-vp');
    const ev = (type, id, x, y) =>
      vp.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: id === 1, button: 0 }));
    ev('pointerdown', 1, 170, 500);
    ev('pointerdown', 2, 220, 500);
    for (let i = 1; i <= 6; i++) {
      ev('pointermove', 1, 170 - i * 12, 500);
      ev('pointermove', 2, 220 + i * 12, 500);
    }
    ev('pointerup', 1, 98, 500);
    ev('pointerup', 2, 292, 500);
    return document.querySelector('.rt-world').style.transform;
  });
  if (!(scale(t3) > scale(t2))) errors.push(`[interact] pinch did not zoom in (${t2} → ${t3})`);
  await page.keyboard.press('Escape');
  await ctx.close();
  console.log('interaction check done');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
