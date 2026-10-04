#!/usr/bin/env node
/**
 * Visual check of the secrets UI on secrets-dev.html:
 *   node tests/e2e/secrets-shots.mjs
 * Starts Vite on a free port, opens the playground in headless Chromium (390×844 mobile and
 * 1366×768 desktop), triggers reveals, overlay effects and the basement page, and saves
 * PNGs as secrets-*.png in $SECRETS_SHOTS_DIR (default: the session scratchpad).
 * Also measures the frame rate while the heaviest effects run, and fails on console errors.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = process.env.SECRETS_SHOTS_DIR ?? '/tmp/claude-0/-home-user-Lenia/a5114f5a-39a4-539d-9a6a-14e769759a92/scratchpad';
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function watch(page, label) {
  page.setDefaultTimeout(10000);
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    const url = msg.location()?.url ?? '';
    if (/fonts\.(googleapis|gstatic)\.com/.test(url + text)) return;
    errors.push(`[${label}] console: ${text}`);
  });
  page.on('pageerror', (err) => errors.push(`[${label}] pageerror: ${err.message}`));
}

async function shot(page, name) {
  const file = path.join(OUT, `secrets-${name}.png`);
  await page.screenshot({ path: file });
  shots.push(file);
  if (process.env.VERBOSE) console.log('shot', name);
}

async function main() {
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
  const base = `http://127.0.0.1:${port}/secrets-dev.html`;
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    await waitFor(base);
    const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
    const desktop = { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 };

    async function open(ctxOpts, qs, label) {
      const ctx = await browser.newContext(ctxOpts);
      const page = await ctx.newPage();
      watch(page, label);
      await page.goto(`${base}?${qs}`);
      await page.waitForFunction(() => '__secrets' in window);
      await sleep(400);
      return { ctx, page };
    }

    // 1. Reveal of a touch secret (ES, mobile).
    {
      const { ctx, page } = await open(mobile, 'panel=0&freeze=1', 'reveal-konami');
      await page.evaluate(() => {
        for (const k of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'])
          window.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
      });
      await sleep(2300);
      await shot(page, 'reveal-konami-es');
      await ctx.close();
    }
    // 2. Hidden species reveal (EN, mobile): Orbium ignis with its ember portrait.
    {
      const { ctx, page } = await open(mobile, 'panel=0&lang=en&reveal=ignis', 'reveal-ignis');
      await sleep(2600);
      await shot(page, 'reveal-ignis-en');
      await ctx.close();
    }
    // 3. Phantom + cryptid portraits (ES).
    for (const id of ['phantasma', 'cryptid']) {
      const { ctx, page } = await open(mobile, `panel=0&reveal=${id}&freeze=1`, `reveal-${id}`);
      await sleep(2600);
      await shot(page, `reveal-${id}-es`);
      await ctx.close();
    }
    // 4. Overlay effects (mobile, no drawer).
    for (const [fx, wait] of [
      ['aurora', 5500],
      ['orion', 3200],
      ['seven', 4200],
      ['glider', 3000],
      ['moon', 3000],
      ['halo', 1500],
      ['trace', 900],
      ['motes', 2800],
      ['swirl', 2200],
      ['pulse', 140],
      ['whisper', 1500],
      ['ripple', 900],
    ]) {
      const { ctx, page } = await open(mobile, `panel=0&freeze=1`, `fx-${fx}`);
      await page.evaluate((k) => window.__fx(k), fx);
      await sleep(wait);
      await shot(page, `fx-${fx}`);
      await ctx.close();
    }
    // 5. A real gesture drawn with the pointer: heart on the dish → reveal + pulse + trace.
    {
      const { ctx, page } = await open(desktop, 'freeze=1', 'gesture-heart');
      const box = await page.locator('.dish').boundingBox();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height * 0.45;
      const S = Math.min(box.width, box.height) * 0.018;
      await page.mouse.move(cx, cy - 5 * S);
      await page.mouse.down();
      for (let i = 0; i <= 90; i++) {
        const t = (i / 90) * Math.PI * 2;
        await page.mouse.move(cx + S * 16 * Math.sin(t) ** 3, cy - S * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)));
      }
      await page.mouse.up();
      await sleep(700);
      await shot(page, 'gesture-heart-desktop');
      const found = await page.evaluate(() => window.__secrets.isFound('heart'));
      if (!found) errors.push('[gesture-heart] heart drawn with the mouse was not recognised');
      await ctx.close();
    }
    // 6. Basement page (mobile ES with hints climbed; desktop EN).
    {
      const { ctx, page } = await open(mobile, 'panel=0&found=12&hints=1&basement=1', 'basement-es');
      await sleep(700);
      await shot(page, 'basement-es');
      await page.evaluate(() => document.querySelector('.sheet').scrollTo(0, 820));
      await sleep(250);
      await shot(page, 'basement-es-scrolled');
      // Overflow check at phone width.
      const wide = await page.evaluate(() => [...document.querySelectorAll('.bls-basement *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).length);
      if (wide) errors.push(`[basement-es] ${wide} elements overflow horizontally`);
      await ctx.close();
    }
    {
      const { ctx, page } = await open(desktop, 'lang=en&found=20&basement=1&colormap=ember', 'basement-en');
      await sleep(700);
      await shot(page, 'basement-en-desktop');
      await ctx.close();
    }
    // 7. Reduced motion reveal + a dish painted with a secret palette.
    {
      const { ctx, page } = await open(mobile, 'panel=0&rm=1&found=4&colormap=aurora&reveal=aurora', 'rm');
      await sleep(600);
      await shot(page, 'reveal-aurora-reduced-motion');
      await ctx.close();
    }
    // 8. All found (desktop).
    {
      const { ctx, page } = await open(desktop, 'freeze=1&found=26', 'all');
      await page.evaluate(() => window.__secrets.onBasementOpened());
      await sleep(400);
      await page.evaluate(() => document.querySelector('.bls-reveal')?.dispatchEvent(new PointerEvent('pointerup')));
      await sleep(3200);
      await shot(page, 'all-found-desktop');
      await ctx.close();
    }
    // 9. Frame rate with the heaviest effects stacked (mobile emulation).
    {
      const { ctx, page } = await open(mobile, 'panel=0', 'fps');
      const fps = await page.evaluate(async () => {
        for (const k of ['aurora', 'motes', 'seven', 'ripple', 'glider']) window.__fx(k);
        let n = 0;
        const t0 = performance.now();
        await new Promise((res) => {
          const f = () => {
            n++;
            if (performance.now() - t0 < 3000) requestAnimationFrame(f);
            else res(null);
          };
          requestAnimationFrame(f);
        });
        return (n * 1000) / (performance.now() - t0);
      });
      console.log(`stacked effects: ${fps.toFixed(1)} fps (headless, software GL)`);
      await ctx.close();
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
    if (process.env.VERBOSE) console.error(viteLog);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
