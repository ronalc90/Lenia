// QA #3 — step-shader (re)compile cost per R: setParams({R}) + one step + finish(), uncached vs cached.
// Usage: node tests/e2e/qa/qa3-compile.mjs <url> [mobile|desktop]
import { launch, openGame, passSplash } from './qa3-lib.mjs';
const [url = 'http://localhost:5737/', vpName = 'mobile'] = process.argv.slice(2);
const browser = await launch();
const { page } = await openGame(browser, url, vpName);
await passSplash(page, { skipTutorial: true });
const rows = await page.evaluate(() => {
  const { sim } = window.bioluma;
  const out = [];
  const time = (R) => {
    sim.finish();
    const t0 = performance.now();
    sim.setParams({ R });
    sim.advance(1);
    sim.finish();
    return Math.round(performance.now() - t0);
  };
  const base = time(13); // cached (current)
  for (const R of [14, 18, 22, 27, 10]) out.push({ R, firstMs: time(R), againMs: (time(13), time(R)) });
  out.push({ R: 13, cachedStepMs: base });
  return out;
});
for (const r of rows) console.log(JSON.stringify(r));
await browser.close();
