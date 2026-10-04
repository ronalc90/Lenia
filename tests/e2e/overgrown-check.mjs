// Overflow banner check (VITE_E2E build): floods the dish with matter until view.overgrown,
// screenshots the banner, taps "Limpiar placa". Usage: node tests/e2e/overgrown-check.mjs <out dir> [dist dir]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

function findChromium() {
  const base = '/opt/pw-browsers';
  for (const d of readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const p = `${base}/${d}/chrome-linux/chrome`;
    if (existsSync(p)) return p;
  }
  throw new Error('chromium not found under /opt/pw-browsers');
}
const out = process.argv[2] ?? 'overgrown-shots';
const dist = process.argv[3] ?? 'dist';
mkdirSync(out, { recursive: true });
const port = 6500 + Math.floor(Math.random() * 300);
const server = spawn('npx', ['vite', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res) => server.stdout.on('data', (d) => String(d).includes(String(port)) && res()));
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-CO' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => !!window.bioluma, null, { timeout: 30000 });
await page.waitForTimeout(800);
await page.locator('[data-testid="splash"]').click();
await page.waitForTimeout(1500);
// Skip the story tutorial (two taps) so the banner is alone on screen.
const skip = page.locator('[data-testid="tutorial-skip"]');
await skip.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
for (let k = 0; k < 2 && (await skip.isVisible().catch(() => false)); k++) {
  await skip.click();
  await page.waitForTimeout(400);
}
// Flood: cover the whole dish with matter (rewritten every 100 ms) until the real detector flags it.
const flagged = await page.evaluate(async () => {
  const b = window.bioluma;
  const n = b.sim.gridW * b.sim.gridH;
  for (let i = 0; i < 80 && !b.game.view().overgrown; i++) {
    const f = new Float32Array(n);
    for (let k = 0; k < n; k++) f[k] = 0.35 + 0.55 * Math.random();
    b.sim.writeState(f);
    await new Promise((res) => setTimeout(res, 100));
  }
  return !!b.game.view().overgrown;
});
await page.waitForTimeout(600);
const banner = await page.evaluate(() => {
  const el = document.querySelector('.overgrown-banner');
  return el && !el.hidden ? el.textContent : null;
});
await page.screenshot({ path: `${out}/overgrown-banner.png` });
const seedsBefore = await page.evaluate(() => window.bioluma.game.view().stats.seeds);
await page.locator('[data-testid="overgrown-clean"]').click();
await page.waitForTimeout(1200);
const after = await page.evaluate(() => ({ overgrown: !!window.bioluma.game.view().overgrown, banner: !document.querySelector('.overgrown-banner')?.hidden }));
await page.screenshot({ path: `${out}/overgrown-cleaned.png` });
console.log(JSON.stringify({ flagged, banner, seedsBefore, after, errors }));
await browser.close();
server.kill();
const ok = flagged && !!banner && !after.banner && errors.length === 0;
console.log(ok ? 'overflow banner OK' : 'overflow banner FAIL');
process.exit(ok ? 0 : 1);
