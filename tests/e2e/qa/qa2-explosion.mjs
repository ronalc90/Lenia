// How often does a tapping player trigger the dish-filling "explosion"? No screenshots (fast).
// Profiles: kid (tap every ~0.6 s anywhere), normal (every ~3 s), careful (every ~8 s, only when affordable).
import { writeFileSync } from 'node:fs';
import { launch, installEventLog, eventLog, OUT } from './qa2-lib.mjs';
const port = 5600 + Math.floor(Math.random() * 100);
const DUR_STEPS = +process.env.STEPS || 2400; // sim steps (30 steps = 1 s of game time at nominal speed)
const PROFILES = (process.env.PROFILES || 'kid,normal,careful').split(',');
const TRIALS = +process.env.TRIALS || 1;
const L = await launch({ port, locale: 'es-CO', dsf: 1 });
const results = [];
try {
  for (let trial = 0; trial < TRIALS; trial++)
    for (const prof of PROFILES) {
      const ctx = await L.browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'es-CO' });
      const page = await ctx.newPage();
      await page.goto(`http://localhost:${port}/`);
      await page.waitForFunction(() => !!window.bioluma, null, { timeout: 20000 });
      await installEventLog(page);
      await page.waitForTimeout(500);
      await page.locator('[data-testid="splash"]').tap();
      await page.waitForTimeout(600);
      // skip tutorial so taps are never swallowed by the bubble
      const skip = page.locator('[data-testid="tutorial-skip"]');
      if (await skip.isVisible().catch(() => false)) await skip.tap();
      await page.waitForTimeout(400);
      const box = await page.locator('canvas.gl-dish').boundingBox();
      const step0 = await page.evaluate(() => window.bioluma.sim.stepCount);
      // tap gap in SIM steps (game-time), so a slow headless GPU does not bias the result
      const gapSteps = prof === 'kid' ? 18 : prof === 'normal' ? 90 : 240;
      let taps = 0;
      let nextAt = step0;
      while (true) {
        const st = await page.evaluate(() => { const v = window.bioluma.game.view(); return { step: window.bioluma.sim.stepCount, can: v.canSeed }; });
        if (st.step - step0 > DUR_STEPS) break;
        if (st.step >= nextAt) {
          if (prof !== 'careful' || st.can) {
            // random grid cell -> screen point (always on the visible dish, even with the bottom sheet open)
            const pt = await page.evaluate(() => {
              const b = window.bioluma;
              const g = { x: b.camera.gridW * (0.1 + Math.random() * 0.8), y: b.camera.gridH * (0.1 + Math.random() * 0.8) };
              const p = b.camera.gridToScreen(g.x, g.y);
              const r = document.querySelector('.bl-dish').getBoundingClientRect();
              return { x: r.left + p.x, y: r.top + p.y, on: b.camera.isOnDish(p.x, p.y) };
            });
            if (pt.on) { await page.touchscreen.tap(pt.x, pt.y); taps++; }
          }
          nextAt = st.step + gapSteps * (0.7 + Math.random() * 0.6);
        }
        await page.waitForTimeout(60);
      }
      const ev = await eventLog(page);
      const fin = await page.evaluate(() => { const v = window.bioluma.game.view(); return { essence: Math.floor(v.essence), eps: v.essencePerSec, species: v.species.length, creatures: v.creatures.length, stable: v.creatures.filter((c) => c.state === 'stable').length, seedCost: v.seedCost, step: window.bioluma.sim.stepCount, seeds: v.stats.seeds }; });
      const first = (n) => ev.find((e) => e.n === n)?.t ?? null;
      const stepOf = (n) => ev.find((e) => e.n === n)?.step ?? null;
      const over = ev.filter((e) => e.n === 'dishOvergrown' && e.id === 'on');
      const r = { prof, trial, taps, overgrown: over.length, stepFirstOvergrown: over[0]?.step ?? null, toasts: ev.filter((e) => e.n === 'toast').map((e) => e.txt.split(' / ')[0]).slice(0, 12), stepFirstStable: stepOf('creatureStable'), stepFirstExploded: stepOf('creatureExploded'), seedsBeforeExplosion: (() => { const x = ev.find((e) => e.n === 'creatureExploded'); return x ? ev.filter((e) => e.n === 'seed' && e.step <= x.step).length : null; })(), firstStable: first('creatureStable'), firstSpecies: first('speciesNew'), firstExploded: first('creatureExploded'), exploded: ev.filter((e) => e.n === 'creatureExploded').length, denied: ev.filter((e) => e.n === 'seedDenied').length, fin };
      console.log(JSON.stringify(r));
      results.push(r);
      await ctx.close();
    }
  writeFileSync(`${OUT}/qa-qa2-explosion.json`, JSON.stringify(results, null, 1));
} catch (e) {
  console.error('FATAL', e);
} finally {
  console.log('errors', L.errors);
  await L.close();
}
