// QA #3 — how long does a stable creature live (and keep paying) at the starting regime?
// Usage: node tests/e2e/qa/qa3-lifetime.mjs <url> [n=4] [secs=150] [desktop|mobile]
// Places n guaranteed Orbium spores (debug: charges.guaranteed + seedAt + sim.seed) on spread
// points, then samples the detector's creature list every second. Reports: stable lifetimes in
// sim steps, how many "died" events had matter still present nearby (re-identification rather
// than a real death), and the time each creature spent unpaid (born) vs paying (stable).
import { writeFileSync } from 'node:fs';
import { launch, openGame, passSplash, SHOTS } from './qa3-lib.mjs';

const [url = 'http://localhost:5737/', nArg = '4', secsArg = '150', vpName = 'desktop'] = process.argv.slice(2);
const n = Number(nArg);
const secs = Number(secsArg);
const browser = await launch();
const { page, errors } = await openGame(browser, url, vpName);
await passSplash(page, { skipTutorial: true });
await page.evaluate((n) => {
  const { game, sim, bus } = window.bioluma;
  window.__lt = { ev: [] };
  for (const name of ['creatureStable', 'creatureDied', 'creatureExploded', 'creatureBorn', 'creatureDivided'])
    bus.on(name, (p) => window.__lt.ev.push({ step: sim.stepCount, name, id: p.id ?? p.parentId, x: p.x, y: p.y }));
  game.state.charges.guaranteed = n;
  const pts = [[0.25, 0.2], [0.75, 0.45], [0.3, 0.7], [0.7, 0.92], [0.5, 0.5], [0.1, 0.45]];
  for (let i = 0; i < n; i++) {
    const [fx, fy] = pts[i % pts.length];
    const spec = game.actions.seedAt(fx * sim.gridW, fy * sim.gridH);
    if (spec) sim.seed(spec);
  }
}, n);
const samples = [];
const t0 = Date.now();
while ((Date.now() - t0) / 1000 < secs) {
  await page.waitForTimeout(1000);
  samples.push(
    await page.evaluate(() => {
      const { game, sim } = window.bioluma;
      const v = game.view();
      return { step: sim.stepCount, eps: v.essencePerSec, cr: v.creatures.map((c) => [c.id, c.state, Math.round(c.x), Math.round(c.y), +c.eps.toFixed(2)]) };
    }),
  );
}
const ev = await page.evaluate(() => window.__lt.ev);
await page.screenshot({ path: `${SHOTS}/qa3-lifetime-${vpName}-end.png` });
writeFileSync(`${SHOTS}/qa3-lifetime-${vpName}.json`, JSON.stringify({ samples, ev, errors }, null, 1));
await browser.close();

// Analysis.
const stableAt = new Map();
const lifetimes = [];
let reident = 0;
let realDeath = 0;
for (const e of ev) {
  if (e.name === 'creatureStable') stableAt.set(e.id, e.step);
  if (e.name === 'creatureDied' || e.name === 'creatureExploded') {
    if (stableAt.has(e.id)) {
      lifetimes.push(e.step - stableAt.get(e.id));
      stableAt.delete(e.id);
    }
    // Was there another creature within 1 R of the death point in the next sample?
    const next = samples.find((s) => s.step > e.step + 5);
    const near = next?.cr.some((c) => c[0] !== e.id && Math.hypot(c[2] - e.x, c[3] - e.y) < 13);
    if (near) reident++;
    else realDeath++;
  }
}
const last = samples[samples.length - 1];
const stepsPerSec = (last.step - samples[0].step) / (samples.length - 1);
const epsSeries = samples.map((s) => s.eps.toFixed(1));
console.log(`steps/s ${stepsPerSec.toFixed(1)}; final creatures ${JSON.stringify(last.cr)}`);
console.log(`stable lifetimes (steps): ${lifetimes.join(', ') || '—'}; still stable at end: ${stableAt.size}`);
console.log(`death/explosion events: ${reident + realDeath} (matter still nearby → likely re-identification: ${reident}; real: ${realDeath})`);
console.log(`events: ${ev.map((e) => `${e.step}:${e.name.replace('creature', '')}#${e.id}`).join(' ')}`);
console.log(`eps every 10 s: ${epsSeries.filter((_, i) => i % 10 === 0).join(' ')}`);
console.log('errors', errors.slice(0, 3));
