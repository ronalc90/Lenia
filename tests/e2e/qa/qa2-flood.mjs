// At the current tree: kid taps until the dish overflows (dishOvergrown), then screenshot what the player sees.
import { launch, Diary, installEventLog, eventLog } from './qa2-lib.mjs';
const port = 6200 + Math.floor(Math.random() * 90);
const L = await launch({ port, locale: 'es-CO', dsf: 1 });
const page = L.page;
const d = new Diary(page, 'flood');
const sleep = (ms) => page.waitForTimeout(ms);
try {
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => !!window.bioluma, null, { timeout: 20000 });
  await installEventLog(page);
  d.reset();
  await sleep(500);
  await page.locator('[data-testid="splash"]').tap();
  await sleep(600);
  const skip = page.locator('[data-testid="tutorial-skip"]');
  if (await skip.isVisible().catch(() => false)) await skip.tap();
  await sleep(400);
  let flooded = false;
  const step0 = await page.evaluate(() => window.bioluma.sim.stepCount);
  let nextAt = step0;
  for (let i = 0; i < 4000 && !flooded; i++) {
    const st = await page.evaluate(() => ({ step: window.bioluma.sim.stepCount, over: !!window.bioluma.game.view().overgrown }));
    if (st.over) { flooded = true; break; }
    if (st.step - step0 > 3600) break;
    if (st.step >= nextAt) {
      const pt = await page.evaluate(() => { const b = window.bioluma; const g = { x: b.camera.gridW * (0.1 + Math.random() * 0.8), y: b.camera.gridH * (0.1 + Math.random() * 0.8) }; const p = b.camera.gridToScreen(g.x, g.y); const r = document.querySelector('.bl-dish').getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y, on: b.camera.isOnDish(p.x, p.y) }; });
      if (pt.on) await page.touchscreen.tap(pt.x, pt.y);
      nextAt = st.step + 18 * (0.7 + Math.random() * 0.6);
    }
    await sleep(60);
  }
  console.log('flooded:', flooded);
  if (flooded) {
    await d.shot('flood-0.0s', 'dishOvergrown fired');
    await sleep(1500);
    await d.shot('flood-1.5s');
    await sleep(3500);
    await d.shot('flood-5s');
    const v = await page.evaluate(() => { const v = window.bioluma.game.view(); return { overgrown: v.overgrown, eps: v.essencePerSec, hasSterilize: typeof window.bioluma.game.actions.sterilizeDish }; });
    console.log(JSON.stringify(v));
    // is there any visible button that cleans?
    const btns = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.offsetParent).map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim()).filter(Boolean));
    console.log('visible buttons:', JSON.stringify(btns));
  }
  d.save();
} catch (e) { console.error('FATAL', e); } finally { console.log('errors', L.errors); await L.close(); }
