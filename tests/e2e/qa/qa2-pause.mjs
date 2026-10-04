// Does the big round pause button work with real touch taps? (alone / with a creature card open / while a tutorial bubble is up)
import { launch } from './qa2-lib.mjs';
const port = 6000 + Math.floor(Math.random() * 90);
const L = await launch({ port, locale: 'es-CO', dsf: 1 });
const page = L.page;
const sleep = (ms) => page.waitForTimeout(ms);
const steps = () => page.evaluate(() => window.bioluma.sim.stepCount);
const paused = () => page.evaluate(() => ({ p: window.bioluma.game.isPaused, cls: document.querySelector('.fab-pause')?.className, txt: document.querySelector('.fab-pause')?.textContent?.trim() }));
const tapFab = async () => {
  const b = await page.locator('.fab-pause').first().boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  return b;
};
try {
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => !!window.bioluma, null, { timeout: 20000 });
  await sleep(500);
  await page.locator('[data-testid="splash"]').tap();
  await sleep(700);
  // 1. during tutorial step 1
  let b = await tapFab();
  await sleep(800);
  console.log('A tutorial step1: fab rect', JSON.stringify(b), JSON.stringify(await paused()));
  const skip = page.locator('[data-testid="tutorial-skip"]');
  if (await skip.isVisible().catch(() => false)) await skip.tap();
  await sleep(500);
  // 2. plain
  const s0 = await steps();
  b = await tapFab();
  await sleep(1500);
  const s1 = await steps();
  await sleep(1500);
  const s2 = await steps();
  console.log('B plain pause tap: steps during 3 s', s0, s1, s2, JSON.stringify(await paused()));
  b = await tapFab();
  await sleep(1500);
  const s3 = await steps();
  console.log('C resume tap: steps', s2, '->', s3, JSON.stringify(await paused()));
  // 3. with a creature card open: seed until something exists
  for (let i = 0; i < 8; i++) {
    const pt = await page.evaluate(() => { const bb = window.bioluma; const g = { x: bb.camera.gridW * (0.3 + Math.random() * 0.4), y: bb.camera.gridH * (0.3 + Math.random() * 0.4) }; const p = bb.camera.gridToScreen(g.x, g.y); const r = document.querySelector('.bl-dish').getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; });
    await page.touchscreen.tap(pt.x, pt.y);
    await sleep(700);
  }
  const cr = await page.evaluate(() => window.bioluma.game.view().creatures.map((c) => ({ x: c.x, y: c.y })));
  if (cr[0]) {
    const p = await page.evaluate(([gx, gy]) => { const bb = window.bioluma; const q = bb.camera.gridToScreen(gx, gy); const r = document.querySelector('.bl-dish').getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; }, [cr[0].x, cr[0].y]);
    await page.touchscreen.tap(p.x, p.y);
    await sleep(700);
    console.log('D card open?', await page.evaluate(() => !!document.querySelector('.ccard')));
    const t0 = await steps();
    b = await tapFab();
    await sleep(1500);
    const t1 = await steps();
    await sleep(1500);
    const t2 = await steps();
    console.log('E pause with card open: steps', t0, t1, t2, JSON.stringify(await paused()), 'card still open?', await page.evaluate(() => !!document.querySelector('.ccard')));
  }
} catch (e) { console.error('FATAL', e); } finally { await L.close(); }
