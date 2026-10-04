// Lucía, 5: taps everything, impatient. Spanish, dark, touch 390x844. ~13 min wall clock.
import { writeFileSync } from 'node:fs';
import { launch, Diary, installEventLog, eventLog, coach, OUT } from './qa2-lib.mjs';
const port = 5300 + Math.floor(Math.random() * 100);
const BUDGET = (+process.env.BUDGET || 780) * 1000;
const { page, errors, close } = await launch({ port, locale: 'es-CO', dsf: 1 });
const PERSONA = process.env.PERSONA || 'lucia';
const PACE = process.env.PACE || 'steady';
const d = new Diary(page, PERSONA);
const sleep = (ms) => page.waitForTimeout(ms);
const seen = new Set();
const once = async (key, name, note) => {
  if (seen.has(key)) return;
  seen.add(key);
  await d.shot(name, note);
};
const rnd = (a, b) => a + Math.random() * (b - a);
let box;
const tapDish = async (fx, fy) => page.touchscreen.tap(box.x + box.width * fx, box.y + box.height * fy);
const dishTapRandom = async () => tapDish(rnd(0.1, 0.9), rnd(0.1, 0.55));
const gridToPage = (gx, gy) =>
  page.evaluate(([gx, gy]) => {
    const p = window.bioluma.camera.gridToScreen(gx, gy);
    const r = document.querySelector('.bl-dish').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, [gx, gy]);
const tapSel = async (sel) => {
  const l = page.locator(sel).first();
  if (!(await l.isVisible().catch(() => false))) return false;
  const b = await l.boundingBox();
  if (!b) return false;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  return true;
};
try {
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => !!window.bioluma, null, { timeout: 20000 });
  await installEventLog(page);
  d.reset();
  await sleep(700);
  await d.shot('splash', 'title screen');
  await sleep(1500);
  await page.locator('[data-testid="splash"]').tap();
  await sleep(300);
  await d.shot('after-splash', 'tutorial step 1');
  await sleep(1000);
  box = await page.locator('canvas.gl-dish').boundingBox();
  // taps the dimmed HUD / bubble first
  await page.touchscreen.tap(60, 40);
  await sleep(200);
  await page.touchscreen.tap(195, 200);
  await sleep(300);
  await d.shot('tap-outside-spotlight', 'tapped HUD + bubble while the tutorial dims everything');
  // first tap on the dish
  await tapDish(0.5, 0.45);
  await sleep(400);
  await d.shot('first-tap-0.4s');
  await sleep(1500);
  await d.shot('first-tap-2s');
  // rapid tapping until essence runs out -> denied
  const nBurst = PACE === 'burst' ? 16 : 7;
  for (let i = 0; i < nBurst; i++) {
    await dishTapRandom();
    await sleep(PACE === 'burst' ? 350 : 900);
    if (i === 3) await d.shot('rapid-4-taps');
  }
  await d.shot('rapid-taps-done', 'is essence out? denied feedback?');
  const lastShotAt = {};
  const every = (key, secs) => {
    const t = d.now();
    if (lastShotAt[key] === undefined || t - lastShotAt[key] >= secs) {
      lastShotAt[key] = t;
      return true;
    }
    return false;
  };
  const t0 = Date.now();
  let phase = 0;
  const exploreAt = { pause: 150, eraser: 200, essenceBtn: 260, journal: 300, objective: 340, creature: 120, settings: 380, tabs: 90 };
  const done = new Set();
  while (Date.now() - t0 < BUDGET - 25000) {
    const el = (Date.now() - t0) / 1000;
    const c = await coach(page);
    const st = await d.state();
    // --- kid logic: biggest blue button wins
    if (c) {
      await once('coach-' + c.title, 'tut-' + c.title.replace(/\W+/g, '_'), `coach: "${c.title}" / "${c.text}" button=${c.next?.label ?? 'none'}`);
      if (c.next) {
        await sleep(600);
        await page.touchscreen.tap(c.next.x, c.next.y);
        await sleep(500);
        continue;
      }
      // spotlight steps without button: tap the glowing target
      if (/Gotero|Laboratorio/.test(c.title)) {
        if (await tapSel('[data-up="dropper"] .buy')) {
          await sleep(500);
          await once('bought-dropper', 'bought-dropper', 'tapped glowing buy button');
          continue;
        }
      }
      if (/destello/i.test(c.title) && st.golden) {
        const v = await page.evaluate(() => window.bioluma.game.view().golden);
        const p = await gridToPage(v.x, v.y);
        await page.touchscreen.tap(p.x, p.y);
        await sleep(400);
        await once('golden-tap', 'golden-tapped');
        continue;
      }
    }
    // golden spark when it shows
    if (st.golden) {
      await once('golden-seen', 'golden-spark', 'golden spark present');
      const v = await page.evaluate(() => window.bioluma.game.view().golden);
      const p = await gridToPage(v.x, v.y);
      await page.touchscreen.tap(p.x, p.y);
      await sleep(500);
      await once('golden-caught', 'golden-after-tap');
      continue;
    }
    // --- exploration (things a kid pokes)
    if (!done.has('creature') && el > exploreAt.creature && st.creatures.includes('stable')) {
      done.add('creature');
      const cr = await page.evaluate(() => window.bioluma.game.view().creatures.filter((c) => c.state === 'stable').map((c) => ({ x: c.x, y: c.y })));
      if (cr[0]) {
        const p = await gridToPage(cr[0].x, cr[0].y);
        await page.touchscreen.tap(p.x, p.y);
        await sleep(500);
        await d.shot('tap-creature', 'tapped a stable creature');
        await sleep(2500);
        await d.shot('tap-creature+3s');
        await page.touchscreen.tap(box.x + 20, box.y + 40);
        await sleep(300);
      }
      continue;
    }
    if (!done.has('pause') && el > exploreAt.pause) {
      done.add('pause');
      await tapSel('.fab-pause');
      await sleep(500);
      await d.shot('pause-on', 'tapped big pause button');
      await tapSel('.fab-pause');
      await sleep(400);
      continue;
    }
    if (!done.has('eraser') && el > exploreAt.eraser) {
      done.add('eraser');
      if (await tapSel('.fab-erase')) {
        await sleep(500);
        await d.shot('eraser-on', 'tapped red eraser button');
        const cr = await page.evaluate(() => window.bioluma.game.view().creatures.map((c) => ({ x: c.x, y: c.y, s: c.state })));
        if (cr[0]) {
          const p = await gridToPage(cr[0].x, cr[0].y);
          await page.touchscreen.tap(p.x, p.y);
          await sleep(500);
          await d.shot('erased-creature', 'erased a creature with eraser');
        }
        await tapSel('.fab-erase');
        await sleep(300);
      }
      continue;
    }
    if (!done.has('essenceBtn') && el > exploreAt.essenceBtn) {
      done.add('essenceBtn');
      await page.touchscreen.tap(40, 30);
      await sleep(700);
      await d.shot('tap-essence-counter', 'tapped the Esencia counter');
      await page.keyboard.press('Escape');
      await tapSel('.modal .close, .modal-close');
      await sleep(400);
      continue;
    }
    if (!done.has('journal') && el > exploreAt.journal) {
      done.add('journal');
      await page.touchscreen.tap(284, 28);
      await sleep(700);
      await d.shot('tap-book-journal', 'tapped book icon (Bitácora)');
      await tapSel('.modal-close');
      await sleep(400);
      continue;
    }
    if (!done.has('objective') && el > exploreAt.objective) {
      done.add('objective');
      await page.touchscreen.tap(195, 72);
      await sleep(600);
      await d.shot('tap-objective-bar', 'tapped the Objetivo bar');
      continue;
    }
    if (!done.has('settings') && el > exploreAt.settings) {
      done.add('settings');
      await page.touchscreen.tap(364, 28);
      await sleep(700);
      await d.shot('tap-settings', 'tapped gear');
      await tapSel('.modal-close');
      await sleep(400);
      continue;
    }
    // tabs: tap each visible tab once when new
    for (const tab of ['bestiary', 'calibrate', 'genome']) {
      if (st.tabs[tab] && !done.has('tab-' + tab)) {
        done.add('tab-' + tab);
        await tapSel(`[data-tab="${tab}"]`);
        await sleep(700);
        await d.shot('tab-' + tab, 'tapped new tab ' + tab);
        await tapSel('[data-tab="lab"]');
        await sleep(300);
      }
    }
    // buy anything affordable & big (kid taps glowing blue buttons)
    const buyable = await page.evaluate(() => [...document.querySelectorAll('[data-up]')].filter((e) => e.querySelector('.buy:not([disabled])') && e.offsetParent).map((e) => e.getAttribute('data-up')));
    if (buyable.length && every('buy', 8)) {
      const id = buyable[0];
      if (await tapSel(`[data-up="${id}"] .buy`)) {
        await sleep(500);
        await once('buy-' + id, 'bought-' + id, 'tapped glowing buy button for ' + id);
      }
    }
    // keep seeding in bursts
    for (let k = 0; k < (PACE === 'burst' ? 3 : 2); k++) {
      await dishTapRandom();
      await sleep(PACE === 'burst' ? rnd(250, 500) : rnd(700, 1200));
    }
    // event-driven shots
    const ev = await eventLog(page);
    for (const e of ev) {
      const key = 'ev-' + e.n;
      if (['creatureStable', 'speciesNew', 'creatureExploded', 'behaviorNew', 'creatureDivided', 'goldenSpawn', 'seedDenied'].includes(e.n) && !seen.has(key)) {
        await once(key, 'event-' + e.n, JSON.stringify(e));
      }
    }
    await sleep(600);
    if (every('periodic', 45)) await d.shot('periodic', `t=${Math.round(el)}s`);
  }
  await d.shot('final');
  const ev = await eventLog(page);
  writeFileSync(`${OUT}/qa-qa2-${PERSONA}-events.json`, JSON.stringify(ev, null, 1));
  d.save();
} catch (e) {
  console.error('FATAL', e);
  d.save();
  try {
    writeFileSync(`${OUT}/qa-qa2-${PERSONA}-events.json`, JSON.stringify(await eventLog(page), null, 1));
  } catch {}
} finally {
  console.log('errors', errors);
  await close();
}
