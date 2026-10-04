// Sam, 14, impatient gamer. Phone is in Spanish (es-CO) -> must find Settings > Language and switch to English
// (set LOCALE=en-US to start in English instead). Plays efficiently for ~12 min wall.
import { writeFileSync } from 'node:fs';
import { launch, Diary, installEventLog, eventLog, coach, OUT } from './qa2-lib.mjs';
const port = 5500 + Math.floor(Math.random() * 100);
const BUDGET = (+process.env.BUDGET || 700) * 1000;
const LOCALE = process.env.LOCALE || 'es-CO';
const PERSONA = process.env.PERSONA || 'sam';
const { page, errors, close } = await launch({ port, locale: LOCALE, dsf: 1 });
const d = new Diary(page, PERSONA);
const sleep = (ms) => page.waitForTimeout(ms);
const seen = new Set();
const once = async (key, name, note) => {
  if (seen.has(key)) return false;
  seen.add(key);
  await d.shot(name, note);
  return true;
};
const rnd = (a, b) => a + Math.random() * (b - a);
let box;
const tapDish = async (fx, fy) => page.touchscreen.tap(box.x + box.width * fx, box.y + box.height * fy);
const tapSel = async (sel) => {
  const l = page.locator(sel).first();
  if (!(await l.isVisible().catch(() => false))) return false;
  const b = await l.boundingBox();
  if (!b) return false;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  return true;
};
const gridToPage = (gx, gy) =>
  page.evaluate(([gx, gy]) => {
    const p = window.bioluma.camera.gridToScreen(gx, gy);
    const r = document.querySelector('.bl-dish').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, [gx, gy]);
try {
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => !!window.bioluma, null, { timeout: 20000 });
  await installEventLog(page);
  d.reset();
  await sleep(600);
  await d.shot('splash', LOCALE);
  await page.locator('[data-testid="splash"]').tap();
  await sleep(500);
  box = await page.locator('canvas.gl-dish').boundingBox();
  await d.shot('tut-1', 'first screen after splash, in ' + LOCALE);
  if (LOCALE.startsWith('es')) {
    // Sam wants English: gear -> Language
    await tapSel('.hud-btn[aria-label="Ajustes"]');
    await sleep(800);
    await d.shot('gear-blocked', 'tapped gear during tutorial step 1: does Settings open?');
    await tapSel('.hud-btn[aria-label="Ajustes"]');
    await sleep(600);
    // gives up, seeds once (first tap), then retries
    await tapDish(0.5, 0.45);
    await sleep(2500);
    await tapSel('.hud-btn[aria-label="Ajustes"]');
    await sleep(900);
    await d.shot('settings-es', 'gear after first seed');
    const en = page.locator('.seg button', { hasText: 'English' }).first();
    const b = await en.boundingBox({ timeout: 4000 }).catch(() => null);
    if (b) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await sleep(700);
    await d.shot('settings-en', 'switched to English');
    await page.evaluate(() => { const b = document.querySelector('.modal-body, .bl-modals [class*=body]'); if (b) b.scrollTop = 400; });
    await sleep(400);
    await d.shot('settings-en-scrolled');
    await page.evaluate(() => { const b = document.querySelector('.modal-body, .bl-modals [class*=body]'); if (b) b.scrollTop = 99999; });
    await sleep(400);
    await d.shot('settings-en-bottom');
    await tapSel('.modal-close');
    await sleep(700);
    await d.shot('tut-1-en', 'back to game: tutorial relabelled?');
  }
  await tapDish(0.3, 0.6);
  await sleep(300);
  await d.shot('second-tap');
  const t0 = Date.now();
  const done = new Set();
  let lastSeed = 0;
  while (Date.now() - t0 < BUDGET - 20000) {
    const el = (Date.now() - t0) / 1000;
    const c = await coach(page);
    const st = await d.state();
    if (c) {
      await once('coach-' + c.title, 'tut-' + c.title.replace(/\W+/g, '_'), `coach "${c.title}" / "${c.text}" / btn=${c.next?.label ?? 'none'}`);
      if (c.next) {
        await sleep(500);
        await page.touchscreen.tap(c.next.x, c.next.y);
        await sleep(400);
        continue;
      }
      if (/Dropper|Lab/i.test(c.title) && (await tapSel('[data-up="dropper"] .buy'))) {
        await sleep(500);
        await once('bought-dropper', 'bought-dropper');
        continue;
      }
    }
    if (st.golden) {
      const v = await page.evaluate(() => window.bioluma.game.view().golden);
      const p = await gridToPage(v.x, v.y);
      await once('golden-seen', 'golden-spark');
      await page.touchscreen.tap(p.x, p.y);
      await sleep(500);
      await once('golden-caught', 'golden-after-tap');
      continue;
    }
    // efficient seeding: only when affordable, spaced apart, ~1 per 1.3 s, max 3 unstable around
    const unstable = st.creatures.filter((s) => s === 'born').length;
    if (el - lastSeed > 1.3 && unstable < 3 && st.essence >= 3) {
      lastSeed = el;
      await tapDish(rnd(0.15, 0.85), rnd(0.12, 0.55));
    }
    // buy all affordable upgrades
    const buyable = await page.evaluate(() => [...document.querySelectorAll('[data-up]')].filter((e) => e.querySelector('.buy:not([disabled])') && e.offsetParent).map((e) => e.getAttribute('data-up')));
    for (const id of buyable.slice(0, 2)) {
      if (await tapSel(`[data-up="${id}"] .buy`)) {
        await sleep(300);
        await once('buy-' + id, 'bought-' + id, 'bought ' + id + ' at ' + Math.round(el) + 's');
      }
    }
    for (const tab of ['bestiary', 'calibrate', 'genome']) {
      if (st.tabs[tab] && !done.has('tab-' + tab)) {
        done.add('tab-' + tab);
        await tapSel(`[data-tab="${tab}"]`);
        await sleep(700);
        await d.shot('tab-' + tab, 'new tab');
        if (tab === 'bestiary') {
          const opened = await page.evaluate(() => {
            const el = document.querySelector('.bl-panels [data-species], .bl-panels .sp-card, .bl-panels .species-card, .bl-panels .sp');
            if (el) { el.click(); return el.className; }
            return null;
          });
          await sleep(800);
          await d.shot('species-card', 'opened ' + opened);
          await page.keyboard.press('Escape');
          await tapSel('.modal-close');
          await sleep(300);
        }
        if (tab === 'calibrate') {
          const r = await page.locator('.bl-panels .range').first().boundingBox();
          if (r) {
            await page.touchscreen.tap(r.x + r.width * 0.7, r.y + r.height / 2);
            await sleep(900);
            await d.shot('calibrate-moved', 'tapped mu slider at 70%');
          }
        }
        await tapSel('[data-tab="lab"]');
        await sleep(300);
      }
    }
    // gear-check at 5 minutes: journal & stats
    if (!done.has('journal') && el > 200) {
      done.add('journal');
      await tapSel('.hud-btn[aria-label="Journal"]');
      await sleep(900);
      await d.shot('journal');
      // achievements tab
      const ach = page.locator('.modal [role=tab], .bl-modals button', { hasText: 'Achievements' }).first();
      if (await ach.isVisible().catch(() => false)) {
        const b = await ach.boundingBox();
        await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
        await sleep(700);
        await d.shot('achievements');
      }
      const st2 = page.locator('.bl-modals button', { hasText: 'Statistics' }).first();
      if (await st2.isVisible().catch(() => false)) {
        const b = await st2.boundingBox();
        await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
        await sleep(700);
        await d.shot('statistics');
      }
      await page.keyboard.press('Escape');
      await tapSel('.modal-close');
      await sleep(400);
    }
    if (!done.has('leaderboard') && el > 230) {
      done.add('leaderboard');
    }
    const ev = await eventLog(page);
    for (const e of ev) {
      const key = 'ev-' + e.n;
      if (['creatureStable', 'speciesNew', 'creatureExploded', 'behaviorNew', 'creatureDivided', 'seedDenied', 'goldenSpawn'].includes(e.n) && !seen.has(key)) await once(key, 'event-' + e.n, JSON.stringify(e));
    }
    await sleep(500);
    if (Math.round(el) % 60 < 2) await once('p' + Math.floor(el / 60), 'periodic', `t=${Math.round(el)}s`);
  }
  await d.shot('final');
  writeFileSync(`${OUT}/qa-qa2-${PERSONA}-events.json`, JSON.stringify(await eventLog(page), null, 1));
  d.save();
} catch (e) {
  console.error('FATAL', e);
  d.save();
  try { writeFileSync(`${OUT}/qa-qa2-${PERSONA}-events.json`, JSON.stringify(await eventLog(page), null, 1)); } catch {}
} finally {
  console.log('errors', errors);
  await close();
}
