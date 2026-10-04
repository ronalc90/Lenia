// How fast does a stable creature (and therefore the tutorial bubble that tracks it) move on screen, at nominal 30 steps/s?
import { launch, installEventLog } from './qa2-lib.mjs';
const port = 5800 + Math.floor(Math.random() * 100);
const L = await launch({ port, locale: 'es-CO', dsf: 1 });
const page = L.page;
try {
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => !!window.bioluma, null, { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.locator('[data-testid="splash"]').tap();
  await page.waitForTimeout(600);
  const skip = page.locator('[data-testid="tutorial-skip"]');
  if (await skip.isVisible().catch(() => false)) await skip.tap();
  await page.waitForTimeout(400);
  let got = null;
  for (let i = 0; i < 120 && !got; i++) {
    const st = await page.evaluate(() => { const v = window.bioluma.game.view(); return { stable: v.creatures.filter((c) => c.state === 'stable').length, young: v.creatures.filter((c) => c.state === 'born').length, can: v.canSeed }; });
    if (st.stable) { got = true; break; }
    if (st.young < 2 && st.can) {
      const pt = await page.evaluate(() => { const b = window.bioluma; const g = { x: b.camera.gridW * (0.2 + Math.random() * 0.6), y: b.camera.gridH * (0.2 + Math.random() * 0.6) }; const p = b.camera.gridToScreen(g.x, g.y); const r = document.querySelector('.bl-dish').getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; });
      await page.touchscreen.tap(pt.x, pt.y);
    }
    await page.waitForTimeout(1500);
  }
  const samples = [];
  for (let i = 0; i < 14; i++) {
    const s = await page.evaluate(() => { const b = window.bioluma; const v = b.game.view(); const c = v.creatures.find((c) => c.state === 'stable'); if (!c) return null; const p = b.camera.gridToScreen(c.x, c.y); return { step: b.sim.stepCount, id: c.id, x: c.x, y: c.y, px: p.x, py: p.y, scale: b.camera.scale, beh: c.behavior }; });
    if (s) samples.push(s);
    await page.waitForTimeout(1200);
  }
  console.log(JSON.stringify(samples));
  // speed between consecutive samples with the same id, ignoring torus wraps
  let tot = 0, n = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (a.id !== b.id || b.step === a.step) continue;
    const dx = Math.abs(b.px - a.px), dy = Math.abs(b.py - a.py);
    if (dx > 150 || dy > 150) continue;
    const d = Math.hypot(dx, dy);
    const pps = (d / (b.step - a.step)) * 30;
    tot += pps; n++;
  }
  console.log('avg screen speed at 30 steps/s: ' + (n ? (tot / n).toFixed(1) : 'n/a') + ' px/s over ' + n + ' intervals; camera.scale=' + samples[0]?.scale);
} catch (e) { console.error('FATAL', e); } finally { await L.close(); }
