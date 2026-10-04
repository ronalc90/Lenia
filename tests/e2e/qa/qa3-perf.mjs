// QA #3 — Part B: performance of the real game in headless Chromium (SwiftShader = CPU GL).
// Usage:
//   node tests/e2e/qa/qa3-perf.mjs <url> matrix  [secs=60] [mobile|desktop|both]
//   node tests/e2e/qa/qa3-perf.mjs <url> memory  [minutes=10] [mobile|desktop]
//   node tests/e2e/qa/qa3-perf.mjs <url> rslider [mobile|desktop]
//   node tests/e2e/qa/qa3-perf.mjs <url> stepcost [mobile|desktop]
// Fast-forward used (documented in the report): the debug handle sets essence / charges / upgrade
// levels on `bioluma.game.state` and seeds through `game.actions.seedAt` + `sim.seed` (the same path a
// tap takes, minus the pointer), so N creatures exist without minutes of play.
import { writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { launch, openGame, passSplash, pct, SHOTS } from './qa3-lib.mjs';

const STILL = process.argv.includes('--still');
const [url = 'http://localhost:5737/', mode = 'matrix', a1, a2] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const results = { mode, url, at: new Date().toISOString(), rows: [] };

/** Seed N more pure-template creatures on a fixed 4×5 lattice (48-cell pitch; guaranteed charges). */
async function populate(page, n) {
  return page.evaluate(async (n) => {
    const { game, sim } = window.bioluma;
    const st = game.state;
    st.essence = 1e9;
    st.charges.guaranteed += n;
    const W = sim.gridW;
    const H = sim.gridH;
    // Fill order: centre-ish slots first so 1 and 8 creatures are spread out.
    const order = [7, 0, 3, 16, 19, 9, 10, 13, 1, 2, 4, 5, 6, 8, 11, 12, 14, 15, 17, 18];
    window.__slot = window.__slot ?? 0;
    let k = 0;
    while (k < n && window.__slot < order.length) {
      const i = order[window.__slot++];
      const c = i % 4;
      const r = Math.floor(i / 4);
      const spec = game.actions.seedAt(((c + 0.5) * W) / 4, ((r + 0.5) * H) / 5);
      if (spec) sim.seed(spec);
      k++;
    }
    return k;
  }, n);
}

async function counts(page) {
  return page.evaluate(() => {
    const v = window.bioluma.game.view();
    return { stable: v.creatures.filter((c) => c.state === 'stable').length, alive: v.creatures.length, speed: v.tools.speed };
  });
}

/** Run a measurement window: rAF frame times, long tasks, sim steps/s, CDP metrics. */
async function measure(page, cdp, secs, label) {
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const c0 = await counts(page);
  await page.evaluate(() => {
    window.__perf = { frames: [], long: [], step0: window.bioluma.sim.stepCount, t0: performance.now() };
    let last = performance.now();
    const loop = (t) => {
      if (!window.__perf) return;
      window.__perf.frames.push(t - last);
      last = t;
      window.__perf.raf = requestAnimationFrame(loop);
    };
    window.__perf.raf = requestAnimationFrame(loop);
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__perf?.long.push(e.duration);
      });
      po.observe({ type: 'longtask', buffered: false });
      window.__perf.po = po;
    } catch {}
  });
  const load0 = loadavg()[0];
  await page.waitForTimeout(secs * 1000);
  const r = await page.evaluate(() => {
    const p = window.__perf;
    cancelAnimationFrame(p.raf);
    p.po?.disconnect();
    window.__perf = null;
    const el = (performance.now() - p.t0) / 1000;
    return {
      frames: p.frames.slice(1),
      long: p.long,
      steps: window.bioluma.sim.stepCount - p.step0,
      el,
      heap: performance.memory?.usedJSHeapSize ?? null,
      dom: document.getElementsByTagName('*').length,
    };
  });
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const c1 = await counts(page);
  const ft = r.frames;
  const per = (k) => +(((m1[k] - m0[k]) / r.el) * 1000).toFixed(1); // ms of work per wall second
  const row = {
    label,
    secs: +r.el.toFixed(1),
    fps: +(ft.length / r.el).toFixed(1),
    p50: +pct(ft, 50).toFixed(1),
    p95: +pct(ft, 95).toFixed(1),
    p99: +pct(ft, 99).toFixed(1),
    max: +Math.max(...ft).toFixed(0),
    over50ms: ft.filter((x) => x > 50).length,
    stepsPerSec: +(r.steps / r.el).toFixed(1),
    longTasks: r.long.length,
    longMs: Math.round(r.long.reduce((a, b) => a + b, 0)),
    scriptMsPerS: per('ScriptDuration'),
    layoutMsPerS: per('LayoutDuration'),
    styleMsPerS: per('RecalcStyleDuration'),
    taskMsPerS: per('TaskDuration'),
    layouts: m1.LayoutCount - m0.LayoutCount,
    heapMB: r.heap ? +(r.heap / 1048576).toFixed(1) : null,
    dom: r.dom,
    listeners: m1.JSEventListeners,
    creatures: `${c0.stable}/${c0.alive}→${c1.stable}/${c1.alive}`,
    speed: c1.speed,
    load: +((load0 + loadavg()[0]) / 2).toFixed(1),
  };
  console.log(JSON.stringify(row));
  results.rows.push(row);
  return row;
}

async function waitStable(page, want, maxSecs = 60) {
  const t0 = Date.now();
  let c = await counts(page);
  while ((Date.now() - t0) / 1000 < maxSecs) {
    c = await counts(page);
    if (c.stable >= want) break;
    await page.waitForTimeout(2000);
  }
  return c;
}

async function setPanel(page, open) {
  const isCollapsed = await page.evaluate(() => document.querySelector('.bl-sheet')?.closest('[class*="sheet-collapsed"]') !== null);
  if (isCollapsed === !open) return;
  await page.locator('.bl-handle').click().catch(() => {});
  await page.waitForTimeout(600);
}

async function fresh(browser, vpName) {
  const g = await openGame(browser, url, vpName);
  await passSplash(g.page, { skipTutorial: true });
  const cdp = await g.page.context().newCDPSession(g.page);
  await cdp.send('Performance.enable');
  return { ...g, cdp };
}

const browser = await launch();
try {
  if (mode === 'matrix') {
    const secs = Number(a1 ?? 60);
    const vps = (a2 ?? 'both') === 'both' ? ['mobile', 'desktop'] : [a2];
    for (const vpName of vps) {
      const { page, cdp, ctx, errors } = await fresh(browser, vpName);
      // Unlock ×2/×4 for later (Incubadora II) through the debug handle.
      await page.evaluate((still) => {
        const { game } = window.bioluma;
        const st = game.state;
        st.upgrades.incubator = 2;
        if (!st.unlocked.includes('incubator')) st.unlocked.push('incubator');
        // --still: Scutium solidus regime (sessile, no collisions) so N creatures stay N.
        if (still) {
          st.upgrades.calibrator = 3;
          game.actions.setCalibration({ mu: 0.29, sigma: 0.045 });
        }
      }, STILL);
      await measure(page, cdp, Math.min(20, secs), `${vpName} empty dish ×1 panel open`);
      await populate(page, 1);
      await waitStable(page, 1);
      await measure(page, cdp, secs, `${vpName} 1 creature ×1 panel open`);
      await populate(page, 7);
      await waitStable(page, 7);
      await measure(page, cdp, secs, `${vpName} ~8 creatures ×1 panel open`);
      await setPanel(page, false);
      await page.screenshot({ path: `${SHOTS}/qa3-perf-${vpName}${STILL ? '-still' : ''}-8-panel-closed.png` });
      await measure(page, cdp, secs, `${vpName} ~8 creatures ×1 panel closed`);
      await setPanel(page, true);
      await populate(page, 12);
      await waitStable(page, 16);
      await page.screenshot({ path: `${SHOTS}/qa3-perf-${vpName}${STILL ? '-still' : ''}-20.png` });
      await measure(page, cdp, secs, `${vpName} ~20 creatures ×1 panel open`);
      await page.evaluate(() => window.bioluma.game.actions.setSpeed(2));
      await measure(page, cdp, secs, `${vpName} ~20 creatures ×2 panel open`);
      await page.evaluate(() => window.bioluma.game.actions.setSpeed(4));
      await measure(page, cdp, secs, `${vpName} ~20 creatures ×4 panel open`);
      await setPanel(page, false);
      await measure(page, cdp, secs, `${vpName} ~20 creatures ×4 panel closed`);
      await page.screenshot({ path: `${SHOTS}/qa3-perf-${vpName}${STILL ? '-still' : ''}-20-x4.png` });
      results.rows.push({ label: `${vpName} console errors`, errors: errors.slice(0, 5) });
      await ctx.close();
    }
  } else if (mode === 'memory') {
    const minutes = Number(a1 ?? 10);
    const vpName = a2 ?? 'mobile';
    const { page, cdp, ctx } = await fresh(browser, vpName);
    // Realistic churn: Sembrador on, many creatures dying and being born, golden sparks, income pops.
    await page.evaluate(() => {
      const st = window.bioluma.game.state;
      st.upgrades.autoSeeder = 25; // ~2.4 s interval
      st.upgrades.dish = 4;
      st.upgrades.dropper = 2;
      st.essence = 1e12;
      for (const id of ['autoSeeder', 'dish', 'dropper']) if (!st.unlocked.includes(id)) st.unlocked.push(id);
      st.goldenTimer = 5;
    });
    await populate(page, 8);
    const samples = [];
    const t0 = Date.now();
    for (let i = 0; i <= minutes * 2; i++) {
      if (i > 0) await page.waitForTimeout(30000);
      await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
      const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
      const s = await page.evaluate(() => {
        const { game, sim } = window.bioluma;
        const v = game.view();
        // Keep sparks coming and the bank full so the Sembrador keeps churning.
        game.state.essence = 1e12;
        if (game.state.goldenTimer > 20) game.state.goldenTimer = 20;
        if (v.golden) game.actions.collectGolden();
        return {
          heap: performance.memory.usedJSHeapSize,
          dom: document.getElementsByTagName('*').length,
          canvases: document.getElementsByTagName('canvas').length,
          step: sim.stepCount,
          stable: v.creatures.filter((c) => c.state === 'stable').length,
          alive: v.creatures.length,
          species: v.species.length,
          seeds: v.stats.seeds,
          born: v.stats.creaturesBorn,
          saveKB: Math.round(((localStorage.getItem('bioluma.game')?.length ?? 0) + (localStorage.getItem('bioluma.dish')?.length ?? 0)) / 1024),
        };
      });
      const row = {
        min: +((Date.now() - t0) / 60000).toFixed(1),
        heapMB: +(s.heap / 1048576).toFixed(2),
        cdpHeapMB: +(m.JSHeapUsedSize / 1048576).toFixed(2),
        dom: s.dom,
        nodes: m.Nodes,
        listeners: m.JSEventListeners,
        docs: m.Documents,
        frames: m.Frames,
        canvases: s.canvases,
        step: s.step,
        stable: s.stable,
        alive: s.alive,
        species: s.species,
        seeds: s.seeds,
        born: s.born,
        saveKB: s.saveKB,
        load: +loadavg()[0].toFixed(1),
      };
      console.log(JSON.stringify(row));
      results.rows.push(row);
    }
    // Heap snapshot summary at the end (largest constructors).
    await page.screenshot({ path: `${SHOTS}/qa3-perf-memory-end.png` });
    await ctx.close();
  } else if (mode === 'rslider') {
    const vpName = a1 ?? 'mobile';
    const { page, cdp, ctx } = await fresh(browser, vpName);
    await page.evaluate(() => {
      const st = window.bioluma.game.state;
      st.upgrades.calibrator = 4;
      if (!st.unlocked.includes('calibrator')) st.unlocked.push('calibrator');
    });
    await populate(page, 3);
    await waitStable(page, 2, 40);
    await page.locator('[data-tab="calibrate"]').click().catch(() => {});
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/qa3-perf-${vpName}-calibrate.png` });
    // Frame recorder for the whole sweep.
    await page.evaluate(() => {
      window.__fr = [];
      let last = performance.now();
      const loop = (t) => {
        window.__fr.push([t, t - last]);
        last = t;
        if (window.__fr) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    const events = [];
    // Real UI path: drive the visible R range input (input events, like a finger drag).
    for (const R of [14, 15, 16, 18, 20, 24, 27, 13, 20, 27]) {
      const t = await page.evaluate((R) => {
        const inputs = [...document.querySelectorAll('input[type="range"]')].filter((x) => x.offsetParent !== null);
        // R slider is the one whose max is 27 (or uses integer steps 10..27).
        const r = inputs.find((x) => Number(x.max) === 27 && Number(x.min) === 10) ?? inputs[inputs.length - 1];
        const t = performance.now();
        r.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        r.value = String(R);
        r.dispatchEvent(new Event('input', { bubbles: true }));
        r.dispatchEvent(new Event('change', { bubbles: true }));
        r.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        return { t, R: window.bioluma.game.view().calibration.R, max: r.max, min: r.min };
      }, R);
      events.push(t);
      await page.waitForTimeout(2500);
    }
    const fr = await page.evaluate(() => {
      const f = window.__fr;
      window.__fr = null;
      return f;
    });
    for (const e of events) {
      const win = fr.filter(([t]) => t >= e.t && t <= e.t + 2500).map(([, d]) => d);
      const row = { R: e.R, slider: `${e.min}-${e.max}`, maxFrameMs: Math.round(Math.max(...win)), p95: Math.round(pct(win, 95)), frames: win.length };
      console.log(JSON.stringify(row));
      results.rows.push(row);
    }
    await ctx.close();
  } else if (mode === 'stepcost') {
    // Raw simulation throughput per R (GPU work isolated, rendering paused by not yielding).
    const vpName = a1 ?? 'mobile';
    const { page, ctx } = await fresh(browser, vpName);
    await populate(page, 4);
    for (const R of [13, 18, 27]) {
      const row = await page.evaluate((R) => {
        const { sim } = window.bioluma;
        sim.setParams({ R });
        sim.advance(1);
        sim.finish();
        const t0 = performance.now();
        let n = 0;
        while (performance.now() - t0 < 3000) {
          sim.advance(5);
          sim.finish();
          n += 5;
        }
        return { R, stepsPerSec: +(n / ((performance.now() - t0) / 1000)).toFixed(1), fetches: sim.info?.fetchesPerCell };
      }, R);
      console.log(JSON.stringify(row));
      results.rows.push(row);
    }
    await page.evaluate(() => window.bioluma.sim.setParams({ R: 13 }));
    await ctx.close();
  }
} finally {
  await browser.close();
  writeFileSync(`${SHOTS}/qa3-perf-${mode}-${a2 ?? a1 ?? ''}${STILL ? '-still' : ''}.json`, JSON.stringify(results, null, 1));
}
