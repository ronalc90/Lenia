// QA #3 — repro: an explosion at the starting regime turns into a "worm labyrinth" that the detector
// pays as dozens of stable creatures and registers as dozens of new species (Samples, Genome,
// achievements, collection milestones).
// Usage: node tests/e2e/qa/qa3-soup.mjs <url> [mobile|desktop] [stack=4] [secs=90]
// Steps (real input only): fresh save → title → skip tutorial → tap the SAME point of the dish
// `stack` times, 0.4 s apart (overlapping spores) → wait → log species/alive/achievements.
import { writeFileSync } from 'node:fs';
import { launch, openGame, passSplash, snap, tapDish, SHOTS } from './qa3-lib.mjs';

const [url = 'http://localhost:5737/', vpName = 'desktop', stackArg = '4', secsArg = '90'] = process.argv.slice(2);
const stack = Number(stackArg);
const secs = Number(secsArg);
const tag = `qa3-soup-${vpName}-x${stack}`;
const browser = await launch();
const { page, errors, vp } = await openGame(browser, url, vpName);
await passSplash(page, { skipTutorial: true });
// Spores ~0.6 R apart, 2.5 s apart (a player tapping "around" the first one).
const offs = [[0, 0], [0.06, 0], [0, 0.05], [-0.06, 0], [0, -0.05], [0.06, 0.05], [-0.06, -0.05], [0.06, -0.05]];
for (let i = 0; i < stack; i++) {
  await tapDish(page, vp, 0.5 + offs[i % offs.length][0], 0.5 + offs[i % offs.length][1]);
  await page.waitForTimeout(2500);
}
const rows = [];
const t0 = Date.now();
while ((Date.now() - t0) / 1000 < secs) {
  await page.waitForTimeout(5000);
  const s = await snap(page);
  const extra = await page.evaluate(() => {
    const v = window.bioluma.game.view();
    return {
      names: v.species.map((x) => x.name).slice(0, 50),
      states: v.creatures.reduce((m, c) => ((m[c.state] = (m[c.state] ?? 0) + 1), m), {}),
      calib: [v.calibration.mu, v.calibration.sigma, v.calibration.R],
    };
  });
  const row = { t: Math.round((Date.now() - t0) / 1000), step: s.step, essence: Math.round(s.essence), eps: +s.eps.toFixed(1), samples: s.samples, species: s.species, stable: s.stable, alive: s.alive, states: extra.states, seedCost: s.seedCost, mult: +s.mult.global.toFixed(3), achievements: s.achievements, genomeIfExtinct: s.ext.g };
  rows.push(row);
  console.log(JSON.stringify(row));
  if (rows.length === 3 || rows.length === 8) await page.screenshot({ path: `${SHOTS}/${tag}-${row.t}s.png` });
}
await page.screenshot({ path: `${SHOTS}/${tag}-end.png` });
writeFileSync(`${SHOTS}/${tag}.json`, JSON.stringify({ rows, errors }, null, 1));
console.log('errors', errors.slice(0, 5));
await browser.close();
