// Overflow banner check (VITE_E2E build): floods the dish with matter until view.overgrown,
// screenshots the banner, taps "Limpiar placa".
// Usage: node tests/e2e/overgrown-check.mjs [out dir (default overgrown-shots)] [dist dir (default dist-e2e, `npm run e2e`)]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { E2E_DIST, findChromium, freePort, startPreview } from './vite-server.mjs';

const out = process.argv[2] ?? 'overgrown-shots';
const dist = process.argv[3] ?? E2E_DIST;
mkdirSync(out, { recursive: true });
const port = await freePort();
const server = await startPreview(dist, port, { timeoutMs: 60000 });
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
let ok = false;
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-CO' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => !!window.bioluma, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.locator('[data-testid="splash"]').click();
  // A new player gets the opening intro once after the title (docs/STORY.md §11): "Saltar intro".
  const introSkip = page.locator('[data-testid="intro-skip"]');
  await introSkip.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
  if (!(await introSkip.isVisible().catch(() => false))) throw new Error('the opening intro did not open after the title');
  await introSkip.click();
  for (let i = 0; i < 20 && (await page.locator('[data-testid="intro"]').isVisible().catch(() => false)); i++) await page.waitForTimeout(200);
  if (await page.locator('[data-testid="intro"]').isVisible().catch(() => false)) throw new Error('"Saltar intro" did not close the intro');
  // Skip the story tutorial (two taps) so the banner is alone on screen.
  const skip = page.locator('[data-testid="tutorial-skip"]');
  await skip.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
  for (let k = 0; k < 2 && (await skip.isVisible().catch(() => false)); k++) {
    await skip.click();
    await page.waitForTimeout(400);
  }
  // Flood: cover the whole dish with matter (rewritten every 100 ms) until the real detector flags it.
  // A fixed LCG, not Math.random: the same flood every run.
  const flagged = await page.evaluate(async () => {
    const b = window.bioluma;
    const n = b.sim.gridW * b.sim.gridH;
    let r = 12345;
    const rnd = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < 80 && !b.game.view().overgrown; i++) {
      const f = new Float32Array(n);
      for (let k = 0; k < n; k++) f[k] = 0.35 + 0.55 * rnd();
      b.sim.writeState(f);
      await new Promise((res) => setTimeout(res, 100));
    }
    return !!b.game.view().overgrown;
  });
  // The banner shows on the next UI frame (a software-GL frame can take a second or more).
  await page.waitForFunction(() => document.querySelector('.overgrown-banner')?.hidden === false, null, { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(400);
  const banner = await page.evaluate(() => {
    const el = document.querySelector('.overgrown-banner');
    return el && !el.hidden ? el.textContent : null;
  });
  await page.screenshot({ path: `${out}/overgrown-banner.png` });
  const seedsBefore = await page.evaluate(() => window.bioluma.game.view().stats.seeds);
  const clean = page.locator('[data-testid="overgrown-clean"]');
  if (await clean.isVisible().catch(() => false)) await clean.click({ timeout: 10000 });
  // It hides on the next UI frame after the clean.
  await page.waitForFunction(() => !!document.querySelector('.overgrown-banner')?.hidden, null, { timeout: 10000 }).catch(() => undefined);
  const after = await page.evaluate(() => ({ overgrown: !!window.bioluma.game.view().overgrown, banner: !document.querySelector('.overgrown-banner')?.hidden }));
  await page.screenshot({ path: `${out}/overgrown-cleaned.png` });
  console.log(JSON.stringify({ flagged, banner, seedsBefore, after, errors }));
  ok = flagged && !!banner && !after.banner && errors.length === 0;
} catch (err) {
  console.error(err);
} finally {
  await browser.close();
  server.stop();
}
console.log(ok ? 'overflow banner OK' : 'overflow banner FAIL');
process.exit(ok ? 0 : 1);
