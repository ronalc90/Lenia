// End-to-end smoke test of the real game in headless Chromium.
// Usage: npm run e2e   (builds dist-e2e/ with VITE_E2E=1, the debug handle, then runs this script)
//        node tests/e2e/smoke.mjs [--dist <VITE_E2E=1 build>] [--single] [--shots <dir>]
//   --single  serves dist-e2e-single/ (`VITE_E2E=1 SINGLE=1 npx vite build --outDir dist-e2e-single`,
//             or `npm run e2e:single`); a plain `SINGLE=1` build has no debug handle and cannot be tested.
// Serves the build with `vite preview`, plays the first seconds of the first lab session with real taps
// (the clock starts, the Bestiary drawer opens), fails on console errors.
// The full sessions 1–3 play-through is tests/e2e/session-play.mjs.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { E2E_DIST, ROOT, findChromium, freePort, startPreview } from './vite-server.mjs';

const args = process.argv.slice(2);
const single = args.includes('--single');
const shotsDir = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const dist = args.includes('--dist') ? args[args.indexOf('--dist') + 1] : single ? `${ROOT}/dist-e2e-single` : E2E_DIST;
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const port = await freePort();
const server = await startPreview(dist, port, { timeoutMs: 60000 });

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
    // Every frame: VELA's controls exist once. Her box fades out as a copy when it moves (storyUI hideBox); in v0.028
    // the copy kept «Saltar tutorial»'s test id, every strict locator on it threw and the tutorial was never skipped.
    await page.evaluate(() => {
      window.__dupIds = [];
      const look = () => {
        for (const id of ['tutorial-skip', 'story-skip', 'tutorial-next', 'sow'])
          if (document.querySelectorAll(`[data-testid="${id}"]`).length > 1 && !window.__dupIds.includes(id)) window.__dupIds.push(id);
        requestAnimationFrame(look);
      };
      look();
    });
    await page.waitForTimeout(800);
    if (shotsDir) await page.screenshot({ path: `${shotsDir}/${vp.name}-0-start.png` });

    // Title screen, then skip the tutorial (QA selectors exposed by the UI).
    const splash = page.locator('[data-testid="splash"]');
    if (await splash.isVisible().catch(() => false)) {
      await splash.click();
      await page.waitForTimeout(700);
    }
    // A new player gets the opening intro once after the title (docs/STORY.md §11): it opens, then "Saltar intro".
    const introSkip = page.locator('[data-testid="intro-skip"]');
    await introSkip.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
    if (!(await introSkip.isVisible().catch(() => false))) throw new Error(`[${vp.name}] the opening intro did not open after the title`);
    await introSkip.click();
    // It fades out (260 ms); a slow software-GL frame can hold the close for a while, so wait up to 4 s.
    for (let i = 0; i < 20 && (await page.locator('[data-testid="intro"]').isVisible().catch(() => false)); i++) await page.waitForTimeout(200);
    if (await page.locator('[data-testid="intro"]').isVisible().catch(() => false)) throw new Error(`[${vp.name}] "Saltar intro" did not close the intro`);
    // The story tutorial (VELA) starts a moment after the title; skipping all of it takes two taps.
    const skip = page.locator('[data-testid="tutorial-skip"]');
    await skip.waitFor({ state: 'visible', timeout: 6000 }).catch(() => undefined);
    for (let k = 0; k < 2 && (await skip.isVisible().catch(() => false)); k++) {
      await skip.click();
      await page.waitForTimeout(400);
    }

    // A first-time explainer (Momento) pauses the game with a card: tap "¡Entendido!" like a player.
    const gotIt = async () => {
      // VELA's tutorial may start later (after the intro and the first Momento): skip it whenever it shows.
      for (let k = 0; k < 2 && (await skip.isVisible().catch(() => false)); k++) {
        await skip.click().catch(() => undefined);
        await page.waitForTimeout(400);
      }
      // A VELA line without the skip link: tap through it like a player.
      const next = page.locator('[data-testid="tutorial-next"]');
      for (let k = 0; k < 8 && (await next.isVisible().catch(() => false)); k++) {
        await next.click({ timeout: 5000 }).catch(() => undefined);
        await page.waitForTimeout(500);
      }
      const ok = page.locator('.mo-card .mo-ok');
      for (let k = 0; k < 4 && (await ok.isVisible().catch(() => false)); k++) {
        await ok.click().catch(() => undefined);
        await page.waitForTimeout(700);
      }
    };

    // Tap the dish a few times (real input path: in a session they pulse and ripple, ADR-031) and sow with the
    // Sembrar button after each one, as a player does.
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
      await gotIt();
      const x = box.x + box.width * fx;
      const y = box.y + box.height * fy;
      if (vp.hasTouch) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
      await page.waitForTimeout(250);
      const sow = await page.locator('[data-testid="sow"]').boundingBox().catch(() => null);
      if (sow) {
        const sx = sow.x + sow.width / 2;
        const sy = sow.y + sow.height / 2;
        if (vp.hasTouch) await page.touchscreen.tap(sx, sy);
        else await page.mouse.click(sx, sy);
        await page.waitForTimeout(250);
      }
    }
    await page.waitForTimeout(1500);
    if (shotsDir) await page.screenshot({ path: `${shotsDir}/${vp.name}-1-seeded.png` });

    // The Bestiary drawer opens from the dock and closes again (while the ~15 s first run still plays:
    // after it the summary card owns the screen).
    await gotIt();
    const best = page.locator('.bl-dock [data-tab="bestiary"]');
    if (!(await best.isVisible())) throw new Error(`[${vp.name}] no Bestiary button in the dock`);
    await best.click();
    await page.waitForTimeout(400);
    if (!(await page.locator('.bl-drawer').isVisible())) throw new Error(`[${vp.name}] the Bestiary drawer did not open`);
    if (shotsDir) await page.screenshot({ path: `${shotsDir}/${vp.name}-1b-bestiary.png` });
    await page.locator('.bl-drawer .drawer-x').click();
    // It slides out (200 ms `exit`, B-5) and is then hidden; a slow software-GL frame may add a little.
    for (let i = 0; i < 12 && (await page.locator('.bl-drawer').isVisible()); i++) await page.waitForTimeout(100);
    if (await page.locator('.bl-drawer').isVisible()) throw new Error(`[${vp.name}] the Bestiary drawer did not close`);

    // Frame floor with the session time-lapse on (CLAUDE.md hard gates, ADR-027): frames drawn in 3 s
    // while the run plays at game.speed (×3).
    const perf = await page.evaluate(
      () =>
        new Promise((done) => {
          let n = 0;
          const t0 = performance.now();
          const tick = () => {
            n++;
            if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
            else done({ fps: (n * 1000) / (performance.now() - t0), speed: window.bioluma.game.speed, phase: window.bioluma.game.session?.phase ?? null });
          };
          requestAnimationFrame(tick);
        }),
    );
    console.log(`[${vp.name}] fps ${perf.fps.toFixed(1)} at ×${perf.speed} (${perf.phase})`);
    if (process.env.FPS_FLOOR && perf.speed > 0 && perf.fps < Number(process.env.FPS_FLOOR))
      throw new Error(`[${vp.name}] ${perf.fps.toFixed(1)} fps at ×${perf.speed}: below the ${process.env.FPS_FLOOR} fps floor`);

    // Let the simulation run; then check the game reacted.
    for (let k = 0; k < 12; k++) {
      await page.waitForTimeout(1000);
      await gotIt();
    }
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
        session: v.session ? { n: v.session.n, phase: v.session.phase, remaining: Math.round(v.session.remaining) } : null,
        clock: !!document.querySelector('.bl-hud .ss-hud'),
      };
    });
    console.log(`[${vp.name}]`, JSON.stringify(state));
    if (state.step < 100) throw new Error(`[${vp.name}] simulation barely advanced: ${state.step} steps`);
    if (state.seeds < 1) throw new Error(`[${vp.name}] no seeds registered from the Sembrar button`);
    // The live game plays lab sessions: the first seed started the clock, shown in the HUD (a first run
    // lasts ~15 s, ADR-027, so by now it may be over already).
    const dup = await page.evaluate(() => window.__dupIds);
    if (dup.length) throw new Error(`[${vp.name}] two elements at once with the test id ${dup.join(', ')}`);
    if (!state.session || state.session.phase === 'ready') throw new Error(`[${vp.name}] the session clock is not running: ${JSON.stringify(state.session)}`);
    if (!state.clock) throw new Error(`[${vp.name}] no session clock in the HUD`);
    if (shotsDir) await page.screenshot({ path: `${shotsDir}/${vp.name}-2-running.png` });

    await ctx.close();
  }
} catch (err) {
  failed = true;
  console.error(err);
} finally {
  await browser.close();
  server.stop();
}
if (errors.length) {
  console.error('Console errors:\n' + errors.join('\n'));
  failed = true;
}
console.log(failed ? 'SMOKE: FAIL' : 'SMOKE: OK');
process.exit(failed ? 1 : 0);
