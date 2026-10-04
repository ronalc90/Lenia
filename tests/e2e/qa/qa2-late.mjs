// FAST-FORWARD (declared): reaches the Calibrar tab and the Extinction ritual, which a real novice only meets after the first
// minutes. Play is real until the first stable creature + tutorial; then `bioluma.game.state` is nudged (essence, eraEssence) -
// nothing else - so purchases, tabs, tutorial steps, ritual and summary are the genuine code paths.
import { writeFileSync } from 'node:fs';
import { launch, Diary, installEventLog, eventLog, coach, contrastReport, OUT } from './qa2-lib.mjs';
const port = 5900 + Math.floor(Math.random() * 90);
const LANG = process.env.LANG_QA || 'es-CO';
const PERSONA = process.env.PERSONA || 'late';
const { page, errors, close } = await launch({ port, locale: LANG, dsf: 1 });
const d = new Diary(page, PERSONA);
const sleep = (ms) => page.waitForTimeout(ms);
const rnd = (a, b) => a + Math.random() * (b - a);
const tapSel = async (sel) => {
  const l = page.locator(sel).first();
  if (!(await l.isVisible().catch(() => false))) return false;
  const b = await l.boundingBox({ timeout: 3000 }).catch(() => null);
  if (!b) return false;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  return true;
};
const closeBtn = '.modal-close';
try {
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => !!window.bioluma, null, { timeout: 20000 });
  await installEventLog(page);
  d.reset();
  await sleep(500);
  await page.locator('[data-testid="splash"]').tap();
  await sleep(800);
  const box = await page.locator('canvas.gl-dish').boundingBox();
  // real play until the first stable creature (gentle: <=2 nurseries)
  for (let i = 0; i < 120; i++) {
    const st = await d.state();
    if (st.creatures.includes('stable')) break;
    const unstable = st.creatures.filter((s) => s === 'born').length;
    if (unstable < 2 && st.essence >= 3) await page.touchscreen.tap(box.x + box.width * rnd(0.2, 0.8), box.y + box.height * rnd(0.3, 0.6));
    const c = await coach(page);
    if (c?.next && /Entendido|Got it/.test(c.next.label)) await page.touchscreen.tap(c.next.x, c.next.y);
    await sleep(1400);
  }
  // run the tutorial to the end (real taps on its buttons; buy Gotero when asked)
  let idle = 0;
  for (let i = 0; i < 40 && idle < 4; i++) {
    const c = await coach(page);
    if (c) {
      idle = 0;
      if (c.next) await page.touchscreen.tap(c.next.x, c.next.y);
      else if (/Laboratorio|Lab/.test(c.title)) await tapSel('[data-up="dropper"] .buy');
      await sleep(900);
    } else { idle++; await sleep(900); }
  }
  await d.shot('ready', 'first stable creature; tutorial finished');
  // ---------- FAST-FORWARD 1: "minute ~8" wallet ----------
  await page.evaluate(() => { window.bioluma.game.state.essence = Math.max(window.bioluma.game.state.essence, 800); });
  await sleep(1500);
  await tapSel('[data-tab="lab"]');
  await sleep(800);
  await d.shot('lab-with-money', 'wallet nudged to 800: what does the Lab look like / what glows?');
  const calUnlocked = await page.evaluate(() => window.bioluma.game.view().upgrades.find((u) => u.id === 'calibrator'));
  console.log('calibrator view', JSON.stringify({ unlocked: calUnlocked?.unlocked, affordable: calUnlocked?.affordable, cost: calUnlocked?.cost }));
  // bring the card into view and buy it
  await page.evaluate(() => document.querySelector('[data-up="calibrator"]')?.scrollIntoView({ block: 'center' }));
  await sleep(500);
  await d.shot('lab-calibrator-card');
  const bought = await tapSel('[data-up="calibrator"] .buy');
  console.log('bought calibrator tap', bought);
  await sleep(1500);
  await d.shot('after-buy-calibrator', 'new tab pops?');
  // tutorial step for calibrate?
  for (let i = 0; i < 6; i++) {
    const c = await coach(page);
    if (c) { await d.shot('coach-' + (c.title || '').replace(/\W+/g, '_'), `coach ${c.title} / ${c.text}`); if (c.next) await page.touchscreen.tap(c.next.x, c.next.y); await sleep(1000); } else await sleep(600);
  }
  await tapSel('[data-tab="calibrate"]');
  await sleep(1200);
  await d.shot('calibrar-top');
  await page.evaluate(() => { const sc = document.querySelector('#bl-panel-calibrate .panel-scroll'); if (sc) sc.scrollTop = 220; });
  await sleep(500);
  await d.shot('calibrar-scrolled');
  await page.evaluate(() => { const sc = document.querySelector('#bl-panel-calibrate .panel-scroll'); if (sc) sc.scrollTop = 99999; });
  await sleep(500);
  await d.shot('calibrar-bottom');
  await page.evaluate(() => { const sc = document.querySelector('#bl-panel-calibrate .panel-scroll'); if (sc) sc.scrollTop = 0; });
  await sleep(300);
  // move mu (first slider)
  const before = await page.evaluate(() => window.bioluma.game.view().calibration.mu);
  const r = await page.locator('#bl-panel-calibrate .range').first().boundingBox();
  if (r) {
    await page.touchscreen.tap(r.x + r.width * 0.85, r.y + r.height / 2);
    await sleep(900);
    await d.shot('calibrar-mu-moved', 'tapped the mu slider at 85%');
    await sleep(4500);
    await d.shot('calibrar-mu-moved+5s', 'what happened to the creatures?');
  }
  const after = await page.evaluate(() => window.bioluma.game.view().calibration.mu);
  console.log('mu', before, '->', after);
  const contrast = { calibrar: await contrastReport(page) };
  // ---------- FAST-FORWARD 2: extinction ----------
  await tapSel('[data-tab="lab"]');
  await page.evaluate(() => { const g = window.bioluma.game.state; g.eraEssence = 300000; g.stats.totalEssence = Math.max(g.stats.totalEssence, 300000); g.essence += 20000; });
  await sleep(2500);
  await d.shot('after-eraEssence-nudge', 'Genoma tab + toast?');
  for (let i = 0; i < 6; i++) {
    const c = await coach(page);
    if (c) { await d.shot('coach-' + (c.title || '').replace(/\W+/g, '_'), `coach ${c.title} / ${c.text}`); if (c.next) await page.touchscreen.tap(c.next.x, c.next.y); await sleep(1000); } else await sleep(500);
  }
  await tapSel('[data-tab="genome"]');
  await sleep(1200);
  await d.shot('genoma-top');
  await page.evaluate(() => { const sc = document.querySelector('#bl-panel-genome .panel-scroll'); if (sc) sc.scrollTop = 200; });
  await sleep(500);
  await d.shot('genoma-scrolled');
  // hold the extinguish button for 1.8 s (mouse events produce pointer events too)
  const eb = await page.locator('.ext-btn').first().boundingBox();
  if (eb) {
    await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2);
    await page.mouse.down();
    await sleep(700);
    await d.shot('extinguish-holding-0.7s', 'holding the button');
    await sleep(1300);
    await page.mouse.up();
    await sleep(1200);
    await d.shot('ritual-1', 'ritual starts');
    await sleep(2200);
    await d.shot('ritual-2');
    await sleep(2500);
    await d.shot('era-summary', 'summary after the ritual');
    const ctr = await contrastReport(page);
    contrast.summary = ctr;
    await page.evaluate(() => { const b = document.querySelector('.modal-body'); if (b) b.scrollTop = 9999; });
    await sleep(500);
    await d.shot('era-summary-bottom');
    await tapSel('.modal .btn.primary, .modal-body .btn');
    await sleep(1500);
    await d.shot('after-summary', 'genoma tab opened?');
    await page.evaluate(() => { const sc = document.querySelector('#bl-panel-genome .panel-scroll'); if (sc) sc.scrollTop = 0; });
    await sleep(500);
    await d.shot('genoma-era2');
    await d.shot('dish-era2', 'what does the dish look like after the reset');
  }
  writeFileSync(`${OUT}/qa-qa2-${PERSONA}-events.json`, JSON.stringify(await eventLog(page), null, 1));
  writeFileSync(`${OUT}/qa-qa2-${PERSONA}-contrast.json`, JSON.stringify(contrast, null, 1));
  d.save();
} catch (e) {
  console.error('FATAL', e);
  d.save();
} finally {
  console.log('errors', errors);
  await close();
}
