#!/usr/bin/env node
/**
 * Visual check of the Momentos layer on moments-dev.html:
 *   node tests/e2e/moments-shots.mjs            (all)
 *   ONLY=stable node tests/e2e/moments-shots.mjs
 * Starts Vite on a free port, opens the dev page in headless Chromium at
 * 390×844 (phone) and 1366×768 (laptop), dark and light theme, and captures
 * every moment card (frozen at its most telling frame), brief labels, the
 * creature status pills, the help sheet and the seed price sheet into
 * $MOMENTS_SHOTS_DIR (default: the session scratchpad) as moments-*.png.
 * Fails on console errors, page errors or horizontal overflow.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT =
  process.env.MOMENTS_SHOTS_DIR ?? '/tmp/claude-0/-home-user-Lenia/a5114f5a-39a4-539d-9a6a-14e769759a92/scratchpad';
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

/** Most telling loop time of each moment's diagram (seconds). */
const FREEZE = {
  seed: 4.9,
  dissolve: 4.3,
  explode: 4.3,
  stable: 4.4,
  income: 3.3,
  species: 3.2,
  secondSpecies: 2,
  'behavior.still': 2,
  'behavior.pulsing': 2.2,
  'behavior.swimmer': 3.4,
  'behavior.spinner': 2.6,
  'behavior.divider': 4.6,
  'behavior.colony': 3.2,
  division: 3.4,
  golden: 3.2,
  upgrade: 3.8,
  autoseed: 4.7,
  calibration: 4.7,
  seedPrice: 4.6,
  seedCheaper: 3.2,
  overgrown: 5.6,
  extinctionReady: 4.1,
  extinction: 3.2,
  offline: 3.6,
};
const IDS = Object.keys(FREEZE);

const PHONE = { width: 390, height: 844 };
const LAPTOP = { width: 1366, height: 768 };

/** [name, query, viewport, settle ms] */
const PLAN = [
  // Every card on a phone, dark.
  ...IDS.map((id) => [`card-${id}`, `?m=${id}&t=${FREEZE[id]}&menu=0`, PHONE, 900]),
  // English + light theme on a phone.
  ...['seed', 'stable', 'explode', 'income', 'behavior.swimmer', 'seedPrice', 'overgrown', 'extinction'].map((id) => [
    `card-${id}-light-en`,
    `?m=${id}&t=${FREEZE[id]}&menu=0&theme=light&lang=en`,
    PHONE,
    900,
  ]),
  // Laptop, dark and light.
  ...['seed', 'stable', 'species', 'golden', 'calibration', 'seedPrice', 'extinctionReady'].map((id) => [
    `card-${id}-laptop`,
    `?m=${id}&t=${FREEZE[id]}&menu=0`,
    LAPTOP,
    900,
  ]),
  ...['dissolve', 'behavior.spinner', 'income'].map((id) => [`card-${id}-laptop-light`, `?m=${id}&t=${FREEZE[id]}&menu=0&theme=light`, LAPTOP, 900]),
  // Reduce motion (still diagrams, no zoom).
  ['card-stable-reduced-motion', '?m=stable&menu=0&rm=1', PHONE, 1600],
  // Brief labels (no pause).
  ['brief-stable', '?m=stable&mode=brief&menu=0', PHONE, 900],
  ['brief-explode-en', '?m=explode&mode=brief&menu=0&lang=en', PHONE, 900],
  ['brief-seedCheaper', '?m=seedCheaper&menu=0', PHONE, 900],
  ['brief-income-laptop', '?m=income&mode=brief&menu=0', LAPTOP, 900],
  // Status pills on every creature.
  ['status-pills', '?status=1&menu=0&still=1', PHONE, 1200],
  ['status-pills-en-light', '?status=1&menu=0&still=1&lang=en&theme=light', PHONE, 1200],
  ['status-pills-laptop', '?status=1&menu=0&still=1', LAPTOP, 1200],
  // Help sheet + replay.
  ['help', '?help=1&seen=all&menu=0', PHONE, 900],
  ['help-light-en', '?help=1&menu=0&theme=light&lang=en&seen=all', PHONE, 900],
  ['help-replay-species', '?replay=species&t=3.2&menu=0', PHONE, 900],
  // Species card and comparison ("¿Por qué esta rinde más?").
  ['species-card', '?card=sp1&menu=0&still=1', PHONE, 1500],
  ['species-card-light-en', '?card=sp2&menu=0&still=1&theme=light&lang=en', PHONE, 1500],
  ['species-vs', '?vs=1&menu=0&still=1', PHONE, 1500],
  ['species-vs-light-en', '?vs=1&menu=0&still=1&theme=light&lang=en', PHONE, 1500],
  ['species-vs-laptop', '?vs=1&menu=0&still=1', LAPTOP, 1500],
  ['card-secondSpecies-laptop', '?m=secondSpecies&t=2&menu=0', LAPTOP, 1200],
  ['card-secondSpecies-light-en', '?m=secondSpecies&t=2&menu=0&theme=light&lang=en', PHONE, 1200],
  // Behaviour cards (4 answers) and the Behaviour Guide.
  ['card-behavior.divider-light-en', `?m=behavior.divider&t=${FREEZE['behavior.divider']}&menu=0&theme=light&lang=en`, PHONE, 900],
  ['card-behavior.colony-laptop', `?m=behavior.colony&t=${FREEZE['behavior.colony']}&menu=0`, LAPTOP, 900],
  ['guide', '?guide=1&menu=0&still=1', PHONE, 1500],
  ['guide-focus-spinner-light-en', '?guide=1&focus=spinner&menu=0&still=1&theme=light&lang=en', PHONE, 1500],
  ['guide-laptop', '?guide=1&menu=0&still=1&bseen=still,swimmer,spinner,pulsing', LAPTOP, 1500],
  // Every price change says why (chip above the price, ~2 s).
  ['price-ticker-up', '?ticker=up&menu=0&still=1', PHONE, 800],
  ['price-ticker-full', '?ticker=full&menu=0&still=1', PHONE, 800],
  ['price-ticker-down-en', '?ticker=down&menu=0&still=1&lang=en', PHONE, 800],
  ['price-ticker-free', '?ticker=free&menu=0&still=1', PHONE, 800],
  ['price-ticker-big-laptop', '?ticker=big&menu=0&still=1', LAPTOP, 800],
  // Seed price sheet.
  ['price-sheet', '?price=1&menu=0&still=1', PHONE, 900],
  ['price-sheet-light-en', '?price=1&menu=0&still=1&theme=light&lang=en', PHONE, 900],
  ['price-sheet-laptop', '?price=1&menu=0&still=1', LAPTOP, 900],
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
  const base = `http://127.0.0.1:${port}/moments-dev.html`;
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox'] });
  try {
    await waitFor(base);
    const only = process.env.ONLY;
    const contexts = new Map();
    for (const [name, query, vp, settle] of PLAN) {
      if (only && !name.includes(only)) continue;
      const key = `${vp.width}x${vp.height}`;
      if (!contexts.has(key)) {
        const mobile = vp.width < 600;
        contexts.set(
          key,
          await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile }),
        );
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
      await page.waitForFunction(() => window.__moments?.ready === true, null, { timeout: 20000 });
      await page.evaluate(() => document.fonts?.ready);
      await page.waitForTimeout(settle);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (overflow) errors.push(`[${name}] horizontal overflow`);
      const file = path.join(OUT, `moments-${name}.png`);
      await page.screenshot({ path: file });
      shots.push(file);
      await page.close();
    }
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

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
