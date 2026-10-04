// QA #3 — regression check of the "worm labyrinth" exploit (QA3 finding #1) on a given build.
// Usage: node tests/e2e/qa/qa3-overgrowth.mjs <url> [mobile|desktop] [secs=150]
// Setup (debug handle): 8 guaranteed Orbium spores — 1 at the centre + 7 on a 2-column lattice,
// the layout that turned into a dish-filling maze in 3/3 perf runs on build d19aace. Then the dish
// runs untouched. PASS = no species storm (≤ 3 new species), production 0 while flooded, toast/clean-up offered.
import { writeFileSync } from 'node:fs';
import { launch, openGame, passSplash, snap, SHOTS } from './qa3-lib.mjs';

const [url = 'http://localhost:5739/', vpName = 'mobile', secsArg = '150'] = process.argv.slice(2);
const secs = Number(secsArg);
const tag = `qa3-overgrowth-${vpName}-${url.match(/:(\d+)/)?.[1]}${process.argv.includes('--flood') ? '-flood' : ''}`;
const browser = await launch();
const { page, errors } = await openGame(browser, url, vpName);
await passSplash(page, { skipTutorial: true });
await page.evaluate(() => {
  const { game, sim, bus } = window.bioluma;
  window.__og = { toasts: [], overgrown: [] };
  bus.on('toast', (p) => window.__og.toasts.push({ step: sim.stepCount, es: p.text?.es }));
  bus.on('dishOvergrown', (p) => window.__og.overgrown.push({ step: sim.stepCount, on: p.on }));
  const st = game.state;
  st.essence = 1e6;
  st.charges.guaranteed = 8;
  const W = sim.gridW;
  const H = sim.gridH;
  const pts = [[W / 2, H / 2]];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 2 && pts.length < 8; c++) pts.push([((c + 0.5) * W) / 2 + (r % 2) * 6, ((r + 0.5) * H) / 4]);
  for (const [x, y] of pts) {
    const spec = game.actions.seedAt(x, y);
    if (spec) sim.seed(spec);
  }
}, null);
if (process.argv.includes('--flood')) {
  // Force a flood after the creatures settle: brush-like dabs over ~45 % of the dish.
  await page.waitForTimeout(40000);
  await page.evaluate(() => {
    const { sim } = window.bioluma;
    const R = sim.params.R;
    let k = 1;
    for (let y = 6; y < sim.gridH; y += 14) for (let x = 6; x < sim.gridW; x += 14) if ((x + y) % 28 < 18) sim.seed({ x, y, radius: R * 0.55, density: 0.9, noise: 0.3, shape: 'blob', bias: 0, rotation: 0, rngSeed: k++ });
  });
}
const rows = [];
const t0 = Date.now();
let shot = false;
while ((Date.now() - t0) / 1000 < secs) {
  await page.waitForTimeout(5000);
  const s = await snap(page);
  const x = await page.evaluate(() => {
    const { game, detector } = window.bioluma;
    const v = game.view();
    const rep = detector.lastReport ?? null;
    return { overgrown: v.overgrown ?? null, fill: rep ? +rep.fill.toFixed(3) : null, states: v.creatures.reduce((m, c) => ((m[c.state] = (m[c.state] ?? 0) + 1), m), {}) };
  });
  const row = { t: Math.round((Date.now() - t0) / 1000), step: s.step, eps: +s.eps.toFixed(1), species: s.species, samples: s.samples, achievements: s.achievements, genomeIfExtinct: s.ext.g, seedCost: Math.round(s.seedCost), mult: +s.mult.global.toFixed(3), ...x };
  rows.push(row);
  console.log(JSON.stringify(row));
  if (!shot && (x.overgrown || (x.fill ?? 0) > 0.25)) {
    shot = true;
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/${tag}-flooded.png` });
  }
}
await page.screenshot({ path: `${SHOTS}/${tag}-end.png` });
const og = await page.evaluate(() => window.__og);
const cleanBtn = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.offsetParent && /limpi|clean/i.test(b.textContent ?? '')).map((b) => b.textContent.trim()));
console.log('overgrown events', JSON.stringify(og.overgrown));
console.log('toasts', og.toasts.map((t) => `${t.step}:${t.es}`).join(' | '));
console.log('visible clean-up buttons:', JSON.stringify(cleanBtn));
const last = rows[rows.length - 1];
console.log(last.species <= 3 ? 'PASS: no species storm' : `FAIL: ${last.species} species registered`);
writeFileSync(`${SHOTS}/${tag}.json`, JSON.stringify({ rows, og, cleanBtn, errors }, null, 1));
await browser.close();
