// Screenshots of real play (no debug shortcuts): title → story tutorial with VELA → first minutes.
// Usage: node tests/e2e/play-shots.mjs [--dist dist] [--seconds 120] [--every 8] [--out <dir>] [--vp mobile|desktop] [--lang es|en]
// Reads the dialogue like a player (taps it when a line finished), sows on the dish, opens tabs the
// story points at. Fails on page errors. Prints a short timeline of story scenes and game state.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const dist = resolve(opt('--dist', 'dist'));
const seconds = Number(opt('--seconds', '120'));
const every = Number(opt('--every', '8'));
const out = resolve(opt('--out', 'play-shots'));
const vpName = opt('--vp', 'mobile');
const lang = opt('--lang', 'es');
mkdirSync(out, { recursive: true });

function findChromium() {
  const base = '/opt/pw-browsers';
  for (const d of readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const p = `${base}/${d}/chrome-linux/chrome`;
    if (existsSync(p)) return p;
  }
  throw new Error('chromium not found under /opt/pw-browsers');
}
const port = 5600 + Math.floor(Math.random() * 800);
const server = spawn('npx', ['vite', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('preview did not start')), 30000);
  server.stdout.on('data', (d) => String(d).includes(String(port)) && (clearTimeout(t), res()));
});
const vp = vpName === 'desktop' ? { width: 1366, height: 768, isMobile: false, hasTouch: false, dsf: 1 } : { width: 390, height: 844, isMobile: true, hasTouch: true, dsf: 2 };
const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
let n = 0;
try {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dsf,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    locale: lang === 'en' ? 'en-US' : 'es-CO',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_CERT|fonts\.(googleapis|gstatic)|net::ERR/.test(m.text())) errors.push(m.text());
  });
  const shot = async (label) => {
    const f = `${out}/${vpName}-${String(n++).padStart(2, '0')}-${label}.png`;
    await page.screenshot({ path: f });
    return f;
  };
  const tap = async (x, y) => (vp.hasTouch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector('[data-testid="splash"]', { timeout: 20000 });
  await page.waitForTimeout(900);
  await shot('title');
  await page.locator('[data-testid="splash"]').click();
  const t0 = Date.now();
  let nextShot = 0;
  let i = 0;
  let lastScene = '';
  while (Date.now() - t0 < seconds * 1000) {
    const el = (Date.now() - t0) / 1000;
    const st = await page.evaluate(() => {
      const box = document.querySelector('.sty-box');
      const visible = !!box && !box.hidden && getComputedStyle(box).display !== 'none';
      const name = document.querySelector('.sty-name')?.textContent ?? '';
      const text = document.querySelector('.sty-text')?.textContent ?? '';
      const done = !!box?.classList.contains('done');
      const task = document.querySelector('.sty-task');
      const taskText = task && !task.hidden ? (task.querySelector('.sty-task-text')?.textContent ?? '') : '';
      const choice = document.querySelector('.sty-choice');
      const choiceOpen = !!choice && !choice.hidden;
      return { visible, name, text, done, taskText, choiceOpen };
    });
    const sceneKey = st.visible ? st.text.slice(0, 40) : st.taskText ? `task:${st.taskText.slice(0, 40)}` : '';
    if (sceneKey && sceneKey !== lastScene) {
      lastScene = sceneKey;
      console.log(`${el.toFixed(1).padStart(6)} s  ${st.visible ? `${st.name}: ${st.text}` : `TASK ${st.taskText}`}`);
      await shot(st.visible ? 'line' : 'task');
    } else if (el >= nextShot) {
      nextShot = el + every;
      await shot(`t${Math.round(el)}s`);
    }
    if (st.choiceOpen) {
      await page.locator('.sty-choice button').first().click().catch(() => undefined);
    } else if (st.visible) {
      // Read for a moment like a player, then advance.
      await page.waitForTimeout(st.done ? 700 : 1200);
      await page.locator('.sty-box').click().catch(() => undefined);
    } else {
      // Sow (and open a tab the story might point at, every now and then).
      const dish = await page.locator('.bl-dish').boundingBox();
      const fx = 0.3 + 0.4 * ((i * 0.618) % 1);
      const fy = 0.3 + 0.4 * ((i * 0.381) % 1);
      await tap(dish.x + dish.width * fx, dish.y + dish.height * fy);
      i++;
      await page.waitForTimeout(1500);
    }
  }
  const state = await page.evaluate(() => {
    const b = window.bioluma;
    if (!b) return null;
    const v = b.game.view();
    return { seeds: v.stats.seeds, essence: Math.round(v.essence), species: v.species.length, tabs: v.tabs, story: b.story?.serialize?.().done };
  });
  console.log('END', JSON.stringify(state));
  await shot('end');
} finally {
  await browser.close();
  server.kill();
}
if (errors.length) {
  console.log(`ERRORS\n${errors.slice(0, 10).join('\n')}`);
  process.exit(1);
}
console.log(`${n} screenshots in ${out}`);
process.exit(0);
