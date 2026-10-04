// Abuelo Jorge, 68, Spanish only, system theme LIGHT, reads slowly, never played idle games. ~12 min wall.
import { writeFileSync } from 'node:fs';
import { launch, Diary, installEventLog, eventLog, coach, contrastReport, OUT } from './qa2-lib.mjs';
const port = 5400 + Math.floor(Math.random() * 100);
const BUDGET = (+process.env.BUDGET || 700) * 1000;
const { page, errors, close } = await launch({ port, locale: 'es-CO', dsf: 1, colorScheme: 'light' });
const d = new Diary(page, 'jorge');
const sleep = (ms) => page.waitForTimeout(ms);
const seen = new Set();
const once = async (key, name, note) => {
  if (seen.has(key)) return false;
  seen.add(key);
  await d.shot(name, note);
  return true;
};
const contrast = {};
const grabContrast = async (key) => {
  contrast[key] = await contrastReport(page);
};
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
try {
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => !!window.bioluma, null, { timeout: 20000 });
  await installEventLog(page);
  d.reset();
  await sleep(1500);
  await d.shot('splash-light', 'system theme = light');
  await grabContrast('splash');
  await sleep(4000); // reads the title
  await page.locator('[data-testid="splash"]').tap();
  await sleep(1200);
  await d.shot('tut-1-seed', 'tutorial 1');
  await grabContrast('tut1');
  box = await page.locator('canvas.gl-dish').boundingBox();
  await sleep(6000); // reads the bubble slowly
  await tapDish(0.5, 0.4);
  await sleep(1500);
  await d.shot('after-first-tap');
  await grabContrast('after-first-tap');
  await sleep(3000);
  const t0 = Date.now();
  let lastSeedAt = 0;
  const phaseDone = new Set();
  while (Date.now() - t0 < BUDGET - 20000) {
    const el = (Date.now() - t0) / 1000;
    const c = await coach(page);
    const st = await d.state();
    if (c) {
      const first = await once('coach-' + c.title, 'tut-' + c.title.replace(/\W+/g, '_'), `coach "${c.title}" / "${c.text}" / btn=${c.next?.label ?? 'none'}`);
      if (first) await grabContrast('coach-' + c.title);
      if (c.next) {
        await sleep(6500); // slow reader
        await page.touchscreen.tap(c.next.x, c.next.y);
        await sleep(900);
        continue;
      }
      if (/Gotero|Laboratorio/.test(c.title)) {
        await sleep(3000);
        if (await tapSel('[data-up="dropper"] .buy')) {
          await sleep(1200);
          await once('bought-dropper', 'bought-dropper', 'bought Gotero after tutorial');
          continue;
        }
      }
    }
    // Jorge seeds one at a time, then watches
    if (el - lastSeedAt > 12 && st.essence >= 3 && !st.creatures.includes('stable')) {
      lastSeedAt = el;
      await tapDish(0.2 + Math.random() * 0.6, 0.15 + Math.random() * 0.4);
      await sleep(2500);
    }
    // events
    const ev = await eventLog(page);
    for (const e of ev) {
      const key = 'ev-' + e.n;
      if (['creatureStable', 'speciesNew', 'creatureExploded', 'seedDenied'].includes(e.n) && !seen.has(key)) await once(key, 'event-' + e.n, JSON.stringify(e));
    }
    // light-theme panels as they unlock
    for (const tab of ['bestiary', 'calibrate', 'genome']) {
      if (st.tabs[tab] && !phaseDone.has('tab-' + tab)) {
        phaseDone.add('tab-' + tab);
        await sleep(2000);
        await tapSel(`[data-tab="${tab}"]`);
        await sleep(1200);
        await d.shot('tab-' + tab);
        await grabContrast('tab-' + tab);
        if (tab === 'bestiary') {
          // open species card
          const opened = await page.evaluate(() => {
            const el = document.querySelector('.bl-panels [data-species], .bl-panels .sp-card, .bl-panels .species-card, .bl-panels .sp');
            if (el) { el.click(); return el.className; }
            return null;
          });
          await sleep(1200);
          await d.shot('species-card', 'tapped first species in bestiary: ' + opened);
          await grabContrast('species-card');
          await page.keyboard.press('Escape');
          await tapSel('.modal-close');
          await sleep(500);
        }
        if (tab === 'calibrate') {
          await sleep(1500);
          await d.shot('tab-calibrate-2');
        }
        await tapSel('[data-tab="lab"]');
        await sleep(500);
      }
    }
    // Settings: ~ 4 minutes in
    if (!phaseDone.has('settings') && el > 150) {
      phaseDone.add('settings');
      await d.shot('before-settings', 'wants to turn the sound down; looks at HUD');
      await grabContrast('hud-main');
      await sleep(2500);
      await tapSel('.hud-btn[aria-label="Ajustes"]');
      await sleep(1000);
      await d.shot('settings-top');
      await grabContrast('settings');
      // scroll the modal body
      await page.evaluate(() => { const b = document.querySelector('.modal-body, .bl-modals [class*=body]'); if (b) b.scrollTop = 260; });
      await sleep(600);
      await d.shot('settings-scrolled-1');
      await page.evaluate(() => { const b = document.querySelector('.modal-body, .bl-modals [class*=body]'); if (b) b.scrollTop = 99999; });
      await sleep(600);
      await d.shot('settings-bottom');
      await page.evaluate(() => { const b = document.querySelector('.modal-body, .bl-modals [class*=body]'); if (b) b.scrollTop = 0; });
      await sleep(400);
      // drag sfx slider to 0 via touch
      const r = await page.locator('.range').first().boundingBox();
      if (r) {
        await page.touchscreen.tap(r.x + 2, r.y + r.height / 2);
        await sleep(600);
        await d.shot('settings-sfx-0', 'tapped left end of Efectos slider');
      }
      // theme to dark and back
      const darkBtn = page.locator('.seg button', { hasText: 'Oscuro' }).first();
      if (await darkBtn.isVisible().catch(() => false)) {
        const b = await darkBtn.boundingBox();
        await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
        await sleep(800);
        await d.shot('settings-dark-theme');
        await grabContrast('settings-dark');
        const lb = page.locator('.seg button', { hasText: 'Claro' }).first();
        const b2 = await lb.boundingBox();
        await page.touchscreen.tap(b2.x + b2.width / 2, b2.y + b2.height / 2);
        await sleep(600);
      }
      await tapSel('.modal-close');
      await sleep(600);
      // HUD mute button
      await tapSel('.hud-btn[aria-label="Silenciar"]');
      await sleep(700);
      await d.shot('hud-mute-tapped', 'HUD speaker tapped');
      await tapSel('.hud-btn[aria-label="Activar sonido"]');
      await sleep(500);
    }
    if (!phaseDone.has('journal') && el > 260) {
      phaseDone.add('journal');
      await tapSel('.hud-btn[aria-label="Bitácora"]');
      await sleep(1000);
      await d.shot('journal');
      await grabContrast('journal');
      await page.keyboard.press('Escape');
      await tapSel('.modal-close');
      await sleep(500);
    }
    if (!phaseDone.has('stats') && el > 300) {
      phaseDone.add('stats');
      await tapSel('.hud-ess');
      await sleep(1000);
      await d.shot('stats-modal');
      await grabContrast('stats');
      await page.keyboard.press('Escape');
      await tapSel('.modal-close');
      await sleep(500);
    }
    // buy affordable things slowly
    const buyable = await page.evaluate(() => [...document.querySelectorAll('[data-up]')].filter((e) => e.querySelector('.buy:not([disabled])') && e.offsetParent).map((e) => e.getAttribute('data-up')));
    if (buyable.length) {
      await sleep(3000);
      const id = buyable[0];
      if (await tapSel(`[data-up="${id}"] .buy`)) {
        await sleep(900);
        await once('buy-' + id, 'bought-' + id, 'bought ' + id);
      }
    }
    await sleep(2000);
    if (Math.round(el) % 60 < 4) await once('p' + Math.floor(el / 60), 'periodic', `t=${Math.round(el)}s`);
  }
  await d.shot('final');
  await grabContrast('final');
  // "Letra grande" experiment: what happens if the root font-size is 20px (user raised system font size)?
  await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; });
  await sleep(1200);
  await d.shot('bigtext-main', 'root font-size 20px (+25%)');
  await tapSel('[data-tab="lab"]');
  await sleep(600);
  await d.shot('bigtext-lab');
  await tapSel('.hud-btn[aria-label="Ajustes"]');
  await sleep(900);
  await d.shot('bigtext-settings');
  await tapSel('.modal-close');
  await sleep(400);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  const vp = await page.evaluate(() => document.querySelector('meta[name=viewport]')?.getAttribute('content'));
  console.log('viewport meta:', vp);
  writeFileSync(`${OUT}/qa-qa2-jorge-events.json`, JSON.stringify(await eventLog(page), null, 1));
  writeFileSync(`${OUT}/qa-qa2-jorge-contrast.json`, JSON.stringify(contrast, null, 1));
  d.save();
} catch (e) {
  console.error('FATAL', e);
  d.save();
  try { writeFileSync(`${OUT}/qa-qa2-jorge-contrast.json`, JSON.stringify(contrast, null, 1)); writeFileSync(`${OUT}/qa-qa2-jorge-events.json`, JSON.stringify(await eventLog(page), null, 1)); } catch {}
} finally {
  console.log('errors', errors);
  await close();
}
