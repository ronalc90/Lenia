// Lucía pokes every button once a first creature exists (clean state, no explosion): pause, eraser, creature card,
// objective bar, Esencia counter, seed pill, speaker, book.
import { writeFileSync } from 'node:fs';
import { launch, Diary, installEventLog, eventLog, coach, OUT } from './qa2-lib.mjs';
const port = 5700 + Math.floor(Math.random() * 100);
const { page, errors, close } = await launch({ port, locale: 'es-CO', dsf: 1 });
const d = new Diary(page, 'poke');
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
  await sleep(500);
  await page.locator('[data-testid="splash"]').tap();
  await sleep(800);
  const box = await page.locator('canvas.gl-dish').boundingBox();
  // gentle seeding until the first stable creature
  let n = 0;
  for (let i = 0; i < 80; i++) {
    const st = await d.state();
    if (st.creatures.includes('stable')) break;
    const unstable = st.creatures.filter((s) => s === 'born').length;
    if (unstable < 2 && st.essence >= 3) await page.touchscreen.tap(box.x + box.width * rnd(0.2, 0.8), box.y + box.height * rnd(0.12, 0.5));
    // dismiss tutorial bubbles with their buttons only
    const c = await coach(page);
    if (c?.next && /Entendido|Got it/.test(c.next.label)) await page.touchscreen.tap(c.next.x, c.next.y);
    await sleep(1500);
  }
  // let the tutorial run: tap the button / buy the Gotero when the spotlight asks for it, until nothing is left
  let idle = 0;
  for (let i = 0; i < 40 && idle < 4; i++) {
    const c = await coach(page);
    if (c) {
      idle = 0;
      await d.shot('tut-' + i + '-' + (c.title || '').replace(/\W+/g, '_'));
      if (c.next) await page.touchscreen.tap(c.next.x, c.next.y);
      else if (/Laboratorio/.test(c.title)) await tapSel('[data-up="dropper"] .buy');
      else if (/destello/i.test(c.title)) await sleep(2000);
      await sleep(900);
    } else {
      idle++;
      await sleep(900);
    }
  }
  await d.shot('ready', 'first creature exists, tutorial dismissed');
  // --- pokes
  const st0 = await d.state();
  const cr = await page.evaluate(() => window.bioluma.game.view().creatures.filter((c) => c.state === 'stable').map((c) => ({ x: c.x, y: c.y })));
  // 1. tap the creature
  if (cr[0]) {
    const p = await gridToPage(cr[0].x, cr[0].y);
    await page.touchscreen.tap(p.x, p.y);
    await sleep(600);
    await d.shot('poke-creature-card');
    await page.touchscreen.tap(box.x + 25, box.y + 60); // tap empty dish to close
    await sleep(500);
  }
  // 2. pause
  await tapSel('.fab-pause');
  await sleep(700);
  await d.shot('poke-pause-on');
  const paused1 = await page.evaluate(() => document.querySelector('.fab-pause')?.textContent);
  await tapSel('.fab-pause');
  await sleep(700);
  await d.shot('poke-pause-off', 'paused label before: ' + paused1);
  // 3. eraser
  const stE0 = await d.state();
  await tapSel('.fab-erase');
  await sleep(700);
  await d.shot('poke-eraser-on');
  const cr2 = await page.evaluate(() => window.bioluma.game.view().creatures.map((c) => ({ x: c.x, y: c.y, s: c.state })));
  if (cr2[0]) {
    const p = await gridToPage(cr2[0].x, cr2[0].y);
    await page.touchscreen.tap(p.x, p.y);
    await sleep(900);
    await d.shot('poke-erased', 'tapped creature at ' + JSON.stringify(cr2[0]));
    await page.touchscreen.tap(p.x + 3, p.y + 3);
    await sleep(900);
    await d.shot('poke-erased-2');
  }
  await tapSel('.fab-erase');
  await sleep(500);
  const stE1 = await d.state();
  console.log('eraser: before', stE0.creatures, 'after', stE1.creatures);
  // 4. objective bar, essence counter, pill, speaker, book
  await page.touchscreen.tap(195, 72);
  await sleep(600);
  await d.shot('poke-objective');
  await page.touchscreen.tap(40, 30);
  await sleep(800);
  await d.shot('poke-essence-counter');
  await tapSel('.modal-close');
  await sleep(500);
  await tapSel('.mode-pill');
  await sleep(600);
  await d.shot('poke-seed-pill');
  await tapSel('.hud-btn[aria-label="Silenciar"]');
  await sleep(700);
  await d.shot('poke-mute');
  await tapSel('.hud-btn[aria-label="Activar sonido"]');
  await sleep(400);
  await tapSel('.hud-btn[aria-label="Bitácora"]');
  await sleep(800);
  await d.shot('poke-journal');
  await tapSel('.modal-close');
  await sleep(500);
  // 5. tabs & sheet handle
  await tapSel('.bl-handle');
  await sleep(700);
  await d.shot('poke-sheet-collapse');
  await tapSel('.bl-handle');
  await sleep(500);
  // 6. try to play while tapping dish way off dish (black bars)
  await page.touchscreen.tap(8, box.y + 300);
  await sleep(500);
  await d.shot('poke-black-bar-tap', 'tapped the black margin left of the dish');
  // 7. mid-game language switch: are saved names / toasts / cards translated?
  await tapSel('.hud-btn[aria-label="Ajustes"]');
  await sleep(800);
  const en = page.locator('.seg button', { hasText: 'English' }).first();
  const eb = await en.boundingBox({ timeout: 3000 }).catch(() => null);
  if (eb) await page.touchscreen.tap(eb.x + eb.width / 2, eb.y + eb.height / 2);
  await sleep(800);
  await tapSel('.modal-close');
  await sleep(700);
  await d.shot('lang-switched-main', 'switched to English mid-game');
  await tapSel('[data-tab="bestiary"]');
  await sleep(900);
  await d.shot('lang-switched-bestiary');
  await page.evaluate(() => { const sc = document.querySelector('#bl-panel-bestiary .panel-scroll'); if (sc) sc.scrollTop = 99999; });
  await sleep(500);
  await d.shot('lang-switched-bestiary-scrolled', 'species grid');
  const opened = await page.evaluate(() => {
    const el = document.querySelector('.bl-panels .sp-grid > *:first-child');
    if (el) { el.click(); return el.className; }
    return null;
  });
  await sleep(900);
  await d.shot('lang-switched-species-card', 'opened ' + opened);
  writeFileSync(`${OUT}/qa-qa2-poke-events.json`, JSON.stringify(await eventLog(page), null, 1));
  d.save();
} catch (e) {
  console.error('FATAL', e);
  d.save();
} finally {
  console.log('errors', errors);
  await close();
}
