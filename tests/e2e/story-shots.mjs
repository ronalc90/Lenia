#!/usr/bin/env node
/**
 * Visual check of the story layer on story-dev.html:
 *   node tests/e2e/story-shots.mjs
 * Starts Vite on a free port, opens the dev page in headless Chromium at
 * 360×640 (minimum mobile) and captures the companion gallery, dialogues of
 * every speaker, a spotlight step, a task, a choice, the final question, the
 * archive, environmental hints, and frames of every ending, into
 * $STORY_SHOTS_DIR (default: the session scratchpad) as story-*.png.
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
  process.env.STORY_SHOTS_DIR ?? '/tmp/claude-0/-home-user-Lenia/a5114f5a-39a4-539d-9a6a-14e769759a92/scratchpad';
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
const shots = [];

/** [file suffix, query string, settle ms] */
const PLAN = [
  ['companion', '?gallery=1&menu=0', 1500],
  ['dialogue-intro', '?scene=t_intro&line=1&menu=0', 1400],
  ['dialogue-intro-en', '?scene=t_intro&line=3&menu=0&lang=en', 1400],
  ['spotlight-essence', '?scene=t_essence&line=0&menu=0', 1600],
  ['spotlight-dropper', '?scene=t_lab&line=1&menu=0', 1600],
  ['task-tap-dish', '?scene=t_intro&to=wait&menu=0', 1600],
  ['task-golden', '?scene=t_golden&to=wait&menu=0', 1600],
  ['choice-lamp', '?scene=a1_extinction&to=choice&menu=0', 1600],
  ['choice-sample-en', '?scene=a2_sample&to=choice&menu=0&lang=en', 1600],
  ['choice-final', '?scene=a3_final&to=choice&menu=0', 1600],
  ['dialogue-albor', '?scene=a2_tape1&line=1&menu=0', 1400],
  ['dialogue-committee', '?scene=a1_committee&line=0&menu=0', 1400],
  ['dialogue-choir', '?scene=a2_coro_first&line=3&menu=0', 1600],
  ['dialogue-you', '?scene=a2_constellation&line=1&menu=0', 1600],
  ['dialogue-reduced-motion', '?scene=t_stable&line=1&menu=0&rm=1', 1400],
  ['hint-constellation', '?hint=constellation&menu=0', 2600],
  ['hint-echo', '?hint=echo&menu=0', 1600],
  ['archive', '?archive=1&menu=0', 1400],
  ['archive-en', '?archive=1&menu=0&lang=en', 1400],
  ...['harvest', 'law', 'memory', 'tide', 'albor'].flatMap((id) => {
    const closing = id === 'albor' ? 26.8 : 21.2;
    return [
      [`ending-${id}-a`, `?ending=${id}&t=9&menu=0`, 900],
      [`ending-${id}-b`, `?ending=${id}&t=${id === 'albor' ? 20 : 17}&menu=0`, 900],
      [`ending-${id}-closing`, `?ending=${id}&t=${closing + 3}&menu=0`, 900],
    ];
  }),
  ['ending-tide-credits-en', '?ending=tide&t=33&menu=0&lang=en', 900],
  ['ending-law-reduced-motion', '?ending=law&t=15&menu=0&rm=1', 900],
];

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
  const base = `http://127.0.0.1:${port}/story-dev.html`;
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox'] });
  try {
    await waitFor(base);
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const only = process.env.ONLY;
    for (const [name, query, settle] of PLAN) {
      if (only && !name.includes(only)) continue;
      const page = await ctx.newPage();
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        const url = msg.location()?.url ?? '';
        if (/fonts\.(googleapis|gstatic)\.com|ERR_CERT|net::ERR/.test(url + text)) return;
        errors.push(`[${name}] console: ${text}`);
      });
      page.on('pageerror', (err) => errors.push(`[${name}] pageerror: ${err.message}`));
      await page.goto(base + query);
      await page.waitForTimeout(settle);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      if (overflow) errors.push(`[${name}] horizontal overflow`);
      const file = path.join(OUT, `story-${name}.png`);
      await page.screenshot({ path: file });
      shots.push(file);
      await page.close();
    }
  } finally {
    await browser.close();
    try {
      process.kill(-vite.pid);
    } catch {
      /* already gone */
    }
  }
  console.log(`${shots.length} screenshots in ${OUT}`);
  if (errors.length) {
    console.error(errors.join('\n'));
    if (process.env.VERBOSE) console.error(viteLog);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
