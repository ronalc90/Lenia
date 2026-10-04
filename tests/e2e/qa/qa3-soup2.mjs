// QA #3 — deterministic-ish repro of the "worm labyrinth" exploit at the starting regime.
// Usage: node tests/e2e/qa/qa3-soup2.mjs <url> [desktop|mobile] [radiusR=2.5] [secs=120]
// One oversized, noisy blob (what a collision / explosion leaves behind) is placed with
// `bioluma.sim.seed` (debug handle) at μ 0.15 σ 0.015 R 13; nothing else is touched. Logs what the
// detector + game make of the aftermath.
import { writeFileSync } from 'node:fs';
import { launch, openGame, passSplash, snap, SHOTS } from './qa3-lib.mjs';

const [url = 'http://localhost:5737/', vpName = 'desktop', rArg = '2.5', secsArg = '120'] = process.argv.slice(2);
const radiusR = Number(rArg);
const secs = Number(secsArg);
const tag = `qa3-soup2-${vpName}-r${radiusR}`;
const browser = await launch();
const { page, errors } = await openGame(browser, url, vpName);
await passSplash(page, { skipTutorial: true });
await page.evaluate((radiusR) => {
  const { sim } = window.bioluma;
  const R = sim.params.R;
  sim.seed({ x: sim.gridW / 2, y: sim.gridH / 2, radius: R * radiusR, density: 0.8, noise: 0.5, shape: 'blob', bias: 0, rotation: 0, rngSeed: 12345 });
}, radiusR);
const rows = [];
const t0 = Date.now();
while ((Date.now() - t0) / 1000 < secs) {
  await page.waitForTimeout(5000);
  const s = await snap(page);
  const st = await page.evaluate(() => window.bioluma.game.view().creatures.reduce((m, c) => ((m[c.state] = (m[c.state] ?? 0) + 1), m), {}));
  const row = { t: Math.round((Date.now() - t0) / 1000), step: s.step, eps: +s.eps.toFixed(1), samples: s.samples, species: s.species, states: st, mult: +s.mult.global.toFixed(3), achievements: s.achievements, genomeIfExtinct: s.ext.g };
  rows.push(row);
  console.log(JSON.stringify(row));
  if (rows.length % 6 === 0) await page.screenshot({ path: `${SHOTS}/${tag}-${row.t}s.png` });
}
await page.screenshot({ path: `${SHOTS}/${tag}-end.png` });
writeFileSync(`${SHOTS}/${tag}.json`, JSON.stringify({ rows, errors }, null, 1));
await browser.close();
