// Layout stability of the real game: no pop-in, no layout shift during the first minute of play.
// Usage: node tests/e2e/layout-shift.mjs [--dist <dir>] [--seconds 60] [--shots <dir>] [--tag <name>]
// Serves <dir> (default dist/) with `vite preview`, opens the game at 390×844 (touch) and 1366×768,
// dismisses the splash, skips the tutorial if offered, then taps the dish for N seconds like a player.
// Checks: cumulative layout-shift score (every shift, input or not) < 0.05, and the bounding boxes of
// the dish, the side/bottom panel, the tab bar and the HUD identical at t = 1 s and at the end.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const dist = resolve(opt('--dist', 'dist'));
const seconds = Number(opt('--seconds', '60'));
const shots = opt('--shots', null);
const tag = opt('--tag', 'run');
if (shots) mkdirSync(shots, { recursive: true });

function findChromium() {
  const base = '/opt/pw-browsers';
  for (const d of readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const p = `${base}/${d}/chrome-linux/chrome`;
    if (existsSync(p)) return p;
  }
  throw new Error('chromium not found under /opt/pw-browsers');
}

const port = 4700 + Math.floor(Math.random() * 800);
const server = spawn('npx', ['vite', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('preview did not start')), 30000);
  server.stdout.on('data', (d) => {
    if (String(d).includes(String(port))) {
      clearTimeout(t);
      res();
    }
  });
});

const SELECTORS = { dish: '.bl-dish', panel: '.bl-sheet', tabs: '.bl-tabs', hud: '.bl-hud' };
const failures = [];
const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
try {
  for (const vp of [
    { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true },
    { name: 'desktop', width: 1366, height: 768, isMobile: false, hasTouch: false },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.isMobile ? 2 : 1,
      isMobile: vp.isMobile,
      hasTouch: vp.hasTouch,
      locale: 'es-CO',
    });
    await ctx.addInitScript(() => {
      const w = window;
      w.__shifts = [];
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            w.__shifts.push({
              t: Math.round(e.startTime),
              value: e.value,
              input: e.hadRecentInput,
              nodes: (e.sources || []).map((s) => (s.node && s.node.className ? String(s.node.className).slice(0, 60) : s.node?.nodeName ?? '?')),
            });
          }
        }).observe({ type: 'layout-shift', buffered: true });
      } catch {
        /* not supported */
      }
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:${port}/`);
    await page.waitForSelector('.bl-dish', { timeout: 20000 });
    await page.waitForTimeout(800);
    if (shots) await page.screenshot({ path: `${shots}/${tag}-${vp.name}-0-splash.png` });
    const splash = page.locator('[data-testid="splash"]');
    if (await splash.isVisible().catch(() => false)) await splash.click();
    await page.waitForTimeout(1000);
    const boxes = async () =>
      page.evaluate((sel) => {
        const out = {};
        for (const [k, s] of Object.entries(sel)) {
          const el = document.querySelector(s);
          const r = el && el.offsetParent !== null ? el.getBoundingClientRect() : null;
          out[k] = r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null;
        }
        return out;
      }, SELECTORS);
    const b1 = await boxes();
    if (shots) await page.screenshot({ path: `${shots}/${tag}-${vp.name}-1s.png` });
    const dish = await page.locator('.bl-dish').boundingBox();
    const t0 = Date.now();
    let i = 0;
    while (Date.now() - t0 < seconds * 1000) {
      // Advance any dialogue / tutorial line that asks for a tap, then sow like a player.
      const next = page.locator('[data-testid="tutorial-next"]');
      if (await next.isVisible().catch(() => false)) await next.click().catch(() => undefined);
      const x = dish.x + dish.width * (0.25 + 0.5 * ((i * 0.618) % 1));
      const y = dish.y + dish.height * (0.25 + 0.5 * ((i * 0.381) % 1));
      if (vp.hasTouch) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
      i++;
      await page.waitForTimeout(1400);
    }
    const b2 = await boxes();
    if (shots) await page.screenshot({ path: `${shots}/${tag}-${vp.name}-${seconds}s.png` });
    const shifts = await page.evaluate(() => window.__shifts);
    const clsAll = shifts.reduce((s, e) => s + e.value, 0);
    const clsNoInput = shifts.filter((e) => !e.input).reduce((s, e) => s + e.value, 0);
    const worst = [...shifts].sort((a, b) => b.value - a.value).slice(0, 5);
    console.log(`[${vp.name}] CLS all ${clsAll.toFixed(4)} · without recent input ${clsNoInput.toFixed(4)} · ${shifts.length} shifts`);
    for (const w of worst) console.log(`   ${w.t} ms  ${w.value.toFixed(4)}  input=${w.input}  ${w.nodes.join(' | ')}`);
    console.log(`[${vp.name}] boxes at 1 s  ${JSON.stringify(b1)}`);
    console.log(`[${vp.name}] boxes at end  ${JSON.stringify(b2)}`);
    if (clsAll >= 0.05) failures.push(`${vp.name}: CLS ${clsAll.toFixed(4)} >= 0.05`);
    for (const k of Object.keys(SELECTORS)) {
      if (JSON.stringify(b1[k]) !== JSON.stringify(b2[k])) failures.push(`${vp.name}: ${k} moved ${JSON.stringify(b1[k])} → ${JSON.stringify(b2[k])}`);
    }
    if (errors.length) failures.push(`${vp.name}: page errors: ${errors.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
if (failures.length) {
  console.log(`\nFAIL\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('\nlayout stable');
process.exit(0);
