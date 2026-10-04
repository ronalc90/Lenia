// QA #3 — Part A: the first prestige (Extinción) and the start of Era 2, in the real UI.
// Usage: node tests/e2e/qa/qa3-prestige.mjs <url> [mobile|desktop]
// FAST-FORWARD (documented): after a real first creature, the debug handle sets
// `game.state.eraEssence` just below the Extinction threshold (250 000) and gives the bank and a
// handful of Lab levels a mid-Era player would have; the last few hundred Essence are earned by
// the live dish so the "extinction ready" toast / tutorial step fire naturally. Everything after
// that (Genome tab, hold-to-confirm, ritual, era summary, node purchase, Era 2) is real UI input.
import { writeFileSync } from 'node:fs';
import { launch, openGame, passSplash, snap, tapDish, SHOTS } from './qa3-lib.mjs';

const [url = 'http://localhost:5737/', vpName = 'mobile'] = process.argv.slice(2);
const tag = `qa3-prestige-${vpName}`;
const browser = await launch();
const { page, errors, vp } = await openGame(browser, url, vpName);
await passSplash(page, { skipTutorial: false });
const log = [];
const L = (m) => {
  log.push(m);
  console.log(m);
};

await page.evaluate(() => {
  window.__qa = { ev: [], t0: performance.now() };
  for (const n of ['toast', 'extinctionStart', 'extinctionDone', 'genomeBought', 'achievement', 'journalNew'])
    window.bioluma.bus.on(n, (p) => window.__qa.ev.push({ t: +((performance.now() - window.__qa.t0) / 1000).toFixed(1), n, p: JSON.parse(JSON.stringify(p ?? {})) }));
});

// Real taps until a stable creature exists (tutorial "got it" pressed when shown).
for (let i = 0; i < 40; i++) {
  const nx = page.locator('[data-testid="tutorial-next"]');
  if (await nx.isVisible().catch(() => false)) await nx.click().catch(() => {});
  const s = await snap(page);
  if (s.stable >= 1) break;
  if (s.alive < 3) await tapDish(page, vp, 0.2 + Math.random() * 0.6, 0.15 + Math.random() * 0.7);
  await page.waitForTimeout(2500);
}
L('first creature: ' + JSON.stringify(await snap(page)));

// Fast-forward to a late-Era-1 state.
await page.evaluate(() => {
  const st = window.bioluma.game.state;
  st.eraEssence = 249850;
  st.stats.totalEssence = Math.max(st.stats.totalEssence, 249850);
  st.essence = 2500;
  // No Sembrador here: several Orbium colliding turn into the worm labyrinth (finding #1).
  Object.assign(st.upgrades, { dropper: 2, culture: 8, calibrator: 2, stabilizer: 6, swimAffinity: 4 });
  for (const id of ['dropper', 'culture', 'calibrator', 'stabilizer', 'swimAffinity'])
    if (!st.unlocked.includes(id)) st.unlocked.push(id);
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/${tag}-1-late-era1.png` });

// A modal coach step that waits for a purchase blocks every other tab: do what it asks.
async function obeyCoach(i) {
  const nx = page.locator('[data-testid="tutorial-next"]');
  if (await nx.isVisible().catch(() => false)) {
    await page.screenshot({ path: `${SHOTS}/${tag}-2-tutorial-${i}.png` });
    await nx.click().catch(() => {});
    return;
  }
  const coachUp = await page.evaluate(() => { const c = document.querySelector('.coach-next, .coach-skip'); return !!c && c.offsetParent !== null; });
  if (coachUp) {
    await page.screenshot({ path: `${SHOTS}/${tag}-2-coach-${i}.png` });
    const buy = page.locator('[data-up="dropper"] .buy');
    if (await buy.isVisible().catch(() => false)) await buy.click().catch(() => {});
  }
}
// Let the dish earn the rest; tutorial steps get acknowledged.
for (let i = 0; i < 150; i++) {
  await obeyCoach(i);
  const s = await snap(page);
  if (s.ext.avail) {
    L('extinction available: ' + JSON.stringify(s.ext));
    break;
  }
  await page.waitForTimeout(2000);
}
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/${tag}-3-ready.png` });

// Genome tab.
await obeyCoach(999);
await page.locator('[data-tab="genome"]').click().catch(() => {});
await page.waitForTimeout(1200);
const nx = page.locator('[data-testid="tutorial-next"]');
if (await nx.isVisible().catch(() => false)) await nx.click().catch(() => {});
await page.screenshot({ path: `${SHOTS}/${tag}-4-genome-tab.png` });
const extText = await page.locator('.ext-btn').innerText().catch(() => '');
L('extinguish button text: ' + extText.replace(/\n/g, ' | '));

// Short tap must NOT extinguish.
const btn = page.locator('.ext-btn');
await btn.scrollIntoViewIfNeeded().catch(() => {});
const bb = await btn.boundingBox();
await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
await page.mouse.down();
await page.waitForTimeout(400);
await page.mouse.up();
await page.waitForTimeout(500);
L('after short tap era=' + (await snap(page)).era);

// Hold 1.6 s.
const before = await snap(page);
await page.mouse.down();
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOTS}/${tag}-5-holding.png` });
await page.waitForTimeout(900);
await page.mouse.up();
let waited = 0;
for (const ms of [300, 1200, 2500, 4000]) {
  await page.waitForTimeout(ms - waited);
  waited = ms;
  await page.screenshot({ path: `${SHOTS}/${tag}-6-ritual-${ms}.png` });
}
const after = await snap(page);
L(`era ${before.era} → ${after.era}, genome ${before.genome} → ${after.genome}, essence → ${after.essence}`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/${tag}-7-summary.png` });
const modalText = await page.locator('.modal').first().innerText().catch(() => '');
L('modal after extinction: ' + modalText.replace(/\n/g, ' | ').slice(0, 600));
const close = page.locator('.modal .btn.violet, .modal .btn.primary, .modal .modal-close').first();
if (await close.isVisible().catch(() => false)) await close.click().catch(() => {});
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOTS}/${tag}-8-tree.png` });

// Buy the cheapest affordable node through the UI (tap node → detail → Comprar).
const nodes = await page.evaluate(() => window.bioluma.game.view().genomeNodes.filter((n) => n.affordable).map((n) => [n.id, n.cost]));
L('affordable nodes: ' + JSON.stringify(nodes));
const gnodes = page.locator('.gnode');
const n = await gnodes.count();
for (let i = 0; i < n; i++) {
  const g = gnodes.nth(i);
  const cls = (await g.getAttribute('class')) ?? '';
  if (cls.includes('afford')) {
    await g.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/${tag}-9-node-detail.png` });
    await page.locator('.gn-detail .btn.violet').click().catch(() => {});
    await page.waitForTimeout(500);
    break;
  }
}
L('genome after buy: ' + JSON.stringify(await page.evaluate(() => { const v = window.bioluma.game.view(); return { genome: v.genome, owned: v.genomeNodes.filter((n) => n.owned).map((n) => n.id), mult: v.multipliers }; })));
await page.screenshot({ path: `${SHOTS}/${tag}-10-bought.png` });

// Era 2: first 90 s of real play.
await page.locator('[data-tab="lab"]').click().catch(() => {});
const era2 = [];
for (let i = 0; i < 30; i++) {
  const nx2 = page.locator('[data-testid="tutorial-next"]');
  if (await nx2.isVisible().catch(() => false)) await nx2.click().catch(() => {});
  const s = await snap(page);
  era2.push({ t: i * 3, e: +s.essence.toFixed(1), eps: +s.eps.toFixed(2), stable: s.stable, alive: s.alive, seed: +s.seedCost.toFixed(1), obj: s.objective });
  if (s.alive < 3 && s.essence >= s.seedCost) await tapDish(page, vp, 0.2 + Math.random() * 0.6, 0.15 + Math.random() * 0.7);
  await page.waitForTimeout(3000);
}
await page.screenshot({ path: `${SHOTS}/${tag}-11-era2-90s.png` });
const ev = await page.evaluate(() => window.__qa.ev);
writeFileSync(`${SHOTS}/${tag}.json`, JSON.stringify({ log, era2, ev, errors }, null, 1));
console.log('era2:', era2.filter((_, i) => i % 3 === 0).map((x) => JSON.stringify(x)).join('\n'));
console.log('events:', ev.map((e) => `${e.t}s ${e.n} ${e.p.text?.es ?? e.p.id ?? JSON.stringify(e.p)}`).join('\n'));
console.log('errors:', errors.slice(0, 5));
await browser.close();
