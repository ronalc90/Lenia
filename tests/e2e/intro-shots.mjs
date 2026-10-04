#!/usr/bin/env node
/**
 * Visual check of the opening intro and the doctors (intro-dev.html):
 *   node tests/e2e/intro-shots.mjs            (ONLY=gallery|intro to narrow)
 * Starts Vite on a free port, opens the dev page in headless Chromium and captures:
 *  - the character gallery (every doctor in every mood, gestures, dialogue portraits) in both themes;
 *  - every intro panel at phone (390×844) and desktop (1366×768), dark and light, es and en;
 *  - Reduce motion, and a click-through that checks Next / Skip / the look picker work.
 * PNGs go to $INTRO_SHOTS_DIR (default: the session scratchpad) as intro-*.png.
 * Fails on console errors, page errors, horizontal overflow, or a text line over 12 words.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = process.env.INTRO_SHOTS_DIR ?? '/tmp/claude-0/-home-user-Lenia/a5114f5a-39a4-539d-9a6a-14e769759a92/scratchpad/intro';
const ONLY = process.env.ONLY ?? '';
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

/** Hero times of the scenes (src/ui/intro/scenes.ts HERO_TIME), in panel order. */
const HERO = [3.2, 2.4, 3.4, 3.6, 2.6, 2.5, 2.2, 3.9, 4.2, 2.6];
const PANELS = HERO.length;
const SIZES = {
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { width: 1366, height: 768, deviceScaleFactor: 1 },
};

const errors = [];
const shots = [];

const port = await freePort();
const vite = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const base = `http://127.0.0.1:${port}/intro-dev.html`;
const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

async function page(size, theme) {
  const ctx = await browser.newContext({ viewport: { width: SIZES[size].width, height: SIZES[size].height }, ...SIZES[size], colorScheme: theme });
  const p = await ctx.newPage();
  p.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_CERT_AUTHORITY_INVALID|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED/.test(m.text())) errors.push(`${size}/${theme}: ${m.text()}`);
  });
  p.on('pageerror', (e) => errors.push(`${size}/${theme}: ${e.message}`));
  return { p, ctx };
}

async function overflow(p, label) {
  const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
  if (o.sw > o.w + 1) errors.push(`${label}: horizontal overflow ${o.sw} > ${o.w}`);
}

async function shot(p, name, full = false) {
  const file = path.join(OUT, `intro-${name}.png`);
  await p.screenshot({ path: file, fullPage: full });
  shots.push(file);
}

try {
  await waitFor(base);
  if (!ONLY || ONLY === 'gallery') {
    for (const theme of ['dark', 'light']) {
      const { p, ctx } = await page('desktop', theme);
      await p.goto(`${base}?view=gallery&theme=${theme}&t=1.2`);
      await p.waitForTimeout(1600);
      await overflow(p, `gallery ${theme}`);
      await shot(p, `gallery-${theme}`, true);
      await ctx.close();
    }
    const { p, ctx } = await page('phone', 'dark');
    await p.goto(`${base}?view=gallery&t=1.2&lang=en`);
    await p.waitForTimeout(1500);
    await overflow(p, 'gallery phone');
    await shot(p, 'gallery-phone-en', false);
    await ctx.close();
  }
  if (!ONLY || ONLY === 'intro') {
    const runs = [
      ['phone', 'dark', 'es'],
      ['desktop', 'dark', 'es'],
      ['phone', 'light', 'en'],
      ['desktop', 'light', 'en'],
    ];
    for (const [size, theme, lang] of runs) {
      const { p, ctx } = await page(size, theme);
      for (let i = 0; i < PANELS; i++) {
        await p.goto(`${base}?view=intro&theme=${theme}&lang=${lang}&panel=${i}&t=${HERO[i]}`);
        await p.waitForTimeout(1900);
        await overflow(p, `intro ${size} ${theme} ${i}`);
        // Every line ≤ 12 words; buttons ≥ 48 px.
        const check = await p.evaluate(() => {
          const lines = [...document.querySelectorAll('.bl-intro-ln p')].map((e) => e.textContent ?? '');
          const long = lines.filter((l) => l.trim().split(/\s+/).length > 12);
          const small = [...document.querySelectorAll('.bl-intro button')]
            .filter((b) => !b.hidden && b.getBoundingClientRect().width > 0)
            .filter((b) => b.getBoundingClientRect().height < 47.5)
            .map((b) => b.className);
          const copy = document.querySelector('.bl-intro-copy');
          const clipped = copy ? copy.scrollHeight > copy.clientHeight + 2 : false;
          return { long, small, clipped };
        });
        if (check.long.length) errors.push(`panel ${i}: lines over 12 words: ${check.long.join(' | ')}`);
        if (check.small.length) errors.push(`panel ${i} ${size}: buttons under 48 px: ${check.small.join(', ')}`);
        if (check.clipped) errors.push(`panel ${i} ${size} ${theme} ${lang}: the text card overflows`);
        await shot(p, `${size}-${theme}-${lang}-${String(i + 1).padStart(2, '0')}`);
      }
      await ctx.close();
    }
    // Reduce motion (finished states) and the look picker on another look.
    {
      const { p, ctx } = await page('phone', 'dark');
      await p.goto(`${base}?view=intro&panel=3&rm=1`);
      await p.waitForTimeout(900);
      await shot(p, 'phone-rm-04');
      await p.goto(`${base}?view=intro&panel=2&look=beanie&t=3.4`);
      await p.waitForTimeout(1500);
      await shot(p, 'phone-look-beanie');
      await p.goto(`${base}?view=intro&panel=9&look=bun&t=2.6`);
      await p.waitForTimeout(1500);
      await shot(p, 'phone-look-bun-10');
      // Click-through: Next ×2, pick a look, Back, Skip.
      await p.goto(`${base}?view=intro`);
      await p.waitForTimeout(600);
      await p.click('[data-testid="intro-next"]');
      await p.click('[data-testid="intro-next"]');
      await p.waitForTimeout(300);
      const panel = await p.evaluate(() => document.querySelector('.bl-intro')?.getAttribute('data-panel'));
      if (panel !== 'arrive') errors.push(`click-through: expected panel 'arrive', got ${panel}`);
      await p.click('.bl-intro-look:nth-child(3)');
      const look = await p.evaluate(() => localStorage.getItem('bioluma.look'));
      if (look !== 'bun') errors.push(`look picker: expected 'bun', got ${look}`);
      await p.keyboard.press('ArrowLeft');
      await p.click('[data-testid="intro-skip"]');
      await p.waitForTimeout(500);
      const gone = await p.evaluate(() => !document.querySelector('.bl-intro'));
      if (!gone) errors.push('skip: the intro is still on screen');
      await ctx.close();
    }
  }
} catch (e) {
  errors.push(String(e?.stack ?? e));
} finally {
  await browser.close();
  vite.kill();
}

console.log(`${shots.length} screenshots in ${OUT}`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
