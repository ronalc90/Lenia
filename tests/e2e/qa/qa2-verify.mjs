// Targeted re-verification (run against QA_DIST): tutorial bubble geometry, swallowed taps, blocked HUD, fly-in animation.
import { launch } from './qa2-lib.mjs';
const port = 6100 + Math.floor(Math.random() * 90);
const L = await launch({ port, locale: 'es-CO', dsf: 1 });
const page = L.page;
const sleep = (ms) => page.waitForTimeout(ms);
const seeds = () => page.evaluate(() => window.bioluma.game.view().stats.seeds);
const bubble = () => page.evaluate(() => {
  const b = document.querySelector('.coach-bubble');
  if (!b || b.closest('.coach')?.hidden) return null;
  const r = b.getBoundingClientRect();
  const sk = document.querySelector('.coach-skip')?.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), skip: sk ? { x: Math.round(sk.left), y: Math.round(sk.top), w: Math.round(sk.width), h: Math.round(sk.height) } : null, title: document.querySelector('.coach-title')?.textContent };
});
try {
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => !!window.bioluma, null, { timeout: 20000 });
  await sleep(600);
  await page.locator('[data-testid="splash"]').tap();
  // sample the bubble position as it pops in
  const trail = [];
  for (let i = 0; i < 12; i++) { trail.push(await bubble()); await sleep(80); }
  console.log('BUBBLE TRAIL (x,y per ~80ms):', JSON.stringify(trail.filter(Boolean).map((b) => [b.x, b.y])));
  await sleep(1200);
  const b = await bubble();
  console.log('BUBBLE settled:', JSON.stringify(b));
  const dish = await page.locator('.bl-dish').boundingBox();
  console.log('DISH box', JSON.stringify(dish));
  // 1. tap the centre of the dish (inside the bubble)
  const cx = 195, cy = b ? b.y + b.h / 2 : 393;
  const s0 = await seeds();
  await page.touchscreen.tap(cx, cy);
  await sleep(900);
  console.log('TAP inside bubble (', cx, Math.round(cy), ') seeds', s0, '->', await seeds());
  // 2. HUD during tutorial
  await page.touchscreen.tap(364, 28);
  await sleep(700);
  console.log('GEAR during step 1 -> modal open:', await page.evaluate(() => !!document.querySelector('.modal')));
  const m0 = await page.evaluate(() => window.bioluma.game.view().settings.muted);
  await page.touchscreen.tap(324, 28);
  await sleep(500);
  console.log('SPEAKER during step 1 -> muted', m0, '->', await page.evaluate(() => window.bioluma.game.view().settings.muted));
  // 3. tap just under the bubble -> seeds
  const s1 = await seeds();
  await page.touchscreen.tap(195, b ? b.y + b.h + 40 : 450);
  await sleep(900);
  console.log('TAP below bubble seeds', s1, '->', await seeds());
  // 4. 'Paciencia' bubble: wait until it has settled, then count how many random taps on the visible dish land on it
  let b2 = null;
  for (let i = 0; i < 30; i++) {
    const a = await bubble();
    await sleep(400);
    const c = await bubble();
    if (a && c && a.x === c.x && a.y === c.y && a.title === 'Paciencia de laboratorio' && c.y > 100) { b2 = c; break; }
  }
  console.log('BUBBLE step 2 (settled):', JSON.stringify(b2));
  if (b2) {
    const s2 = await seeds();
    let swallowed = 0, tried = 0, seeded = 0;
    for (let i = 0; i < 20; i++) {
      const x = 50 + Math.random() * 290, y = 110 + Math.random() * 340; // visible dish above the sheet
      const onBubble = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.coach-bubble'), [x, y]);
      const before = await seeds();
      await page.touchscreen.tap(x, y);
      await sleep(300);
      const after = await seeds();
      tried++;
      if (onBubble) swallowed++;
      if (after > before) seeded++;
      if (after === before && !onBubble) console.log('  (no seed, not on bubble: probably unaffordable) at', Math.round(x), Math.round(y));
    }
    console.log(`STEP 2: of ${tried} taps on the dish, ${swallowed} landed on the bubble (swallowed), ${seeded} seeded; seeds ${s2} -> ${await seeds()}`);
  }
} catch (e) { console.error('FATAL', e); } finally { await L.close(); }
