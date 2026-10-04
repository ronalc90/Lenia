// End-to-end smoke test of the real game in headless Chromium.
// Usage: npm run build && node tests/e2e/smoke.mjs [--single] [--shots <dir>]
// Serves dist/ (or dist-single/) with `vite preview`, plays the first minutes
// through the debug handle + real taps, fails on console errors.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const single = args.includes('--single');
const shotsDir = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

function findChromium() {
  const base = '/opt/pw-browsers';
  for (const d of readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const p = `${base}/${d}/chrome-linux/chrome`;
    if (existsSync(p)) return p;
  }
  throw new Error('chromium not found under /opt/pw-browsers');
}

const port = 4173 + Math.floor(Math.random() * 500);
const server = spawn(
  'npx',
  ['vite', 'preview', '--port', String(port), '--strictPort', ...(single ? ['--outDir', 'dist-single'] : [])],
  { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, SINGLE: single ? '1' : '' } },
);
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('preview did not start')), 20000);
  server.stdout.on('data', (d) => {
    if (String(d).includes(String(port))) {
      clearTimeout(t);
      res();
    }
  });
});

const errors = [];
const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
let failed = false;
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
    const page = await ctx.newPage();
    page.on('console', (m) => {
      // Google Fonts can't be reached through the sandbox proxy; that's environmental.
      if (m.type() === 'error' && !/ERR_CERT|fonts\.(googleapis|gstatic)/.test(m.text() + (m.location()?.url ?? '')))
        errors.push(`[${vp.name}] ${m.text()}`);
    });
    page.on('pageerror', (e) => errors.push(`[${vp.name}] pageerror: ${e.message}`));
    await page.goto(`http://localhost:${port}/`);
    await page.waitForFunction(() => !!window.bioluma, null, { timeout: 15000 });
    await page.waitForTimeout(800);
    if (shotsDir) await page.screenshot({ path: `${shotsDir}/${vp.name}-0-start.png` });

    // Title screen, then skip the tutorial (QA selectors exposed by the UI).
    const splash = page.locator('[data-testid="splash"]');
    if (await splash.isVisible().catch(() => false)) {
      await splash.click();
      await page.waitForTimeout(700);
    }
    // The story tutorial (VELA) starts a moment after the title; skipping all of it takes two taps.
    const skip = page.locator('[data-testid="tutorial-skip"]');
    await skip.waitFor({ state: 'visible', timeout: 6000 }).catch(() => undefined);
    for (let k = 0; k < 2 && (await skip.isVisible().catch(() => false)); k++) {
      await skip.click();
      await page.waitForTimeout(400);
    }

    // Seed by tapping the dish a few times (real input path).
    const box = await page.locator('canvas.gl-dish').boundingBox();
    if (!box) throw new Error('dish canvas not found');
    const taps = [
      [0.3, 0.35],
      [0.7, 0.4],
      [0.5, 0.7],
      [0.25, 0.75],
      [0.75, 0.75],
    ];
    for (const [fx, fy] of taps) {
      const x = box.x + box.width * fx;
      const y = box.y + box.height * fy;
      if (vp.hasTouch) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(1500);
    if (shotsDir) await page.screenshot({ path: `${shotsDir}/${vp.name}-1-seeded.png` });

    // Let the simulation run; then check the game reacted.
    await page.waitForTimeout(12000);
    const state = await page.evaluate(() => {
      const b = window.bioluma;
      const v = b.game.view();
      return {
        step: b.sim.stepCount,
        essence: v.essence,
        eps: v.essencePerSec,
        seeds: v.stats.seeds,
        creatures: v.creatures.map((c) => c.state),
        species: v.species.length,
      };
    });
    console.log(`[${vp.name}]`, JSON.stringify(state));
    if (state.step < 100) throw new Error(`[${vp.name}] simulation barely advanced: ${state.step} steps`);
    if (state.seeds < 1) throw new Error(`[${vp.name}] no seeds registered from taps`);
    if (shotsDir) await page.screenshot({ path: `${shotsDir}/${vp.name}-2-running.png` });

    // Visit every visible tab.
    const tabs = await page.locator('[data-tab]').all();
    for (const [i, t] of tabs.entries()) {
      if (await t.isVisible()) {
        await t.click();
        await page.waitForTimeout(300);
        if (shotsDir) await page.screenshot({ path: `${shotsDir}/${vp.name}-3-tab${i}.png` });
      }
    }
    await ctx.close();
  }
} catch (err) {
  failed = true;
  console.error(err);
} finally {
  await browser.close();
  server.kill();
}
if (errors.length) {
  console.error('Console errors:\n' + errors.join('\n'));
  failed = true;
}
console.log(failed ? 'SMOKE: FAIL' : 'SMOKE: OK');
process.exit(failed ? 1 : 0);
