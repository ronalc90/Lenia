// QA #3 — CPU profile of the main thread (unminified e2e build) in two states:
//   "still": N Scutium solidus (sessile, no collisions) at μ .29 σ .045 — a clean N-creature dish;
//   "orbium": N Orbium at the start regime (they collide and may turn into the worm labyrinth).
// Usage: node tests/e2e/qa/qa3-profile.mjs <url-of-unminified-build> [still|orbium] [n=20] [secs=20] [mobile|desktop]
// Prints the top self-time functions and writes the .cpuprofile to the scratchpad.
import { writeFileSync } from 'node:fs';
import { launch, openGame, passSplash, SHOTS } from './qa3-lib.mjs';

const [url = 'http://localhost:5738/', kind = 'still', nArg = '20', secsArg = '20', vpName = 'mobile'] = process.argv.slice(2);
const n = Number(nArg);
const browser = await launch();
const { page, errors } = await openGame(browser, url, vpName);
await passSplash(page, { skipTutorial: true });
const placed = await page.evaluate(
  ({ n, kind }) => {
    const { game, sim } = window.bioluma;
    const st = game.state;
    st.essence = 1e9;
    if (kind === 'still') {
      st.upgrades.calibrator = 3;
      game.actions.setCalibration({ mu: 0.29, sigma: 0.045 });
    }
    st.charges.guaranteed = n;
    const W = sim.gridW;
    const H = sim.gridH;
    const cols = n <= 1 ? 1 : n <= 8 ? 2 : 4;
    const rows = Math.ceil(n / cols);
    let k = 0;
    for (let r = 0; r < rows && k < n; r++)
      for (let c = 0; c < cols && k < n; c++, k++) {
        const spec = game.actions.seedAt(((c + 0.5) * W) / cols, ((r + 0.5) * H) / rows);
        if (spec) sim.seed(spec);
      }
    return k;
  },
  { n, kind },
);
// Let them mature.
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(2000);
  const s = await page.evaluate(() => window.bioluma.game.view().creatures.filter((c) => c.state === 'stable').length);
  if (s >= Math.min(n, 0.8 * n)) break;
}
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
await cdp.send('Profiler.start');
const before = await page.evaluate(() => ({ step: window.bioluma.sim.stepCount, t: performance.now() }));
await page.waitForTimeout(Number(secsArg) * 1000);
const after = await page.evaluate(() => {
  const v = window.bioluma.game.view();
  return { step: window.bioluma.sim.stepCount, t: performance.now(), stable: v.creatures.filter((c) => c.state === 'stable').length, alive: v.creatures.length, species: v.species.length };
});
const { profile } = await cdp.send('Profiler.stop');
writeFileSync(`${SHOTS}/qa3-profile-${kind}-${n}-${vpName}.cpuprofile`, JSON.stringify(profile));
await page.screenshot({ path: `${SHOTS}/qa3-profile-${kind}-${n}-${vpName}.png` });

// Self time per function.
const byId = new Map(profile.nodes.map((x) => [x.id, x]));
const self = new Map();
const dts = profile.timeDeltas;
for (let i = 0; i < profile.samples.length; i++) {
  const node = byId.get(profile.samples[i]);
  const cf = node.callFrame;
  const key = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`;
  self.set(key, (self.get(key) ?? 0) + (dts[i] ?? 0) / 1000);
}
const total = [...self.values()].reduce((a, b) => a + b, 0);
const idle = (self.get('(idle) :0') ?? 0) + (self.get('(program) :0') ?? 0);
console.log(`placed ${placed}, after: ${JSON.stringify(after)}, steps/s ${(((after.step - before.step) / (after.t - before.t)) * 1000).toFixed(1)}`);
console.log(`profile ${(total / 1000).toFixed(1)} s, idle+program ${(idle / 1000).toFixed(1)} s`);
for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${v.toFixed(0).padStart(7)} ms  ${k}`);
console.log('errors', errors.slice(0, 3));
await browser.close();
