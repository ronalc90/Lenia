// Frame-time and long-task measurement of real play on a phone viewport (390×844, dsf 2, touch).
//
// Plays like a player in REAL time (no debug time-lapse, no lockstep): title → intro skipped → VELA's
// tutorial skipped → sessions one after another (sowing with the Sembrar button, pulses on creatures,
// Momentos, Sparks, the summary, the research tree with a buy, the Bestiary and a species card now and
// then), and records in the page:
//   - every rAF timestamp (frame-time histogram, p50/p95/p99, frames > 50 / > 100 ms per minute),
//   - `longtask` and `long-animation-frame` entries (with script attribution and forced layout),
//   - optionally (--trace <file>) a Chrome trace with JS sampling and GC for attribution (run it on an
//     unminified build: `VITE_E2E=1 node_modules/.bin/vite build --minify false --outDir <dir>`).
//
// Usage: node tests/e2e/perf-play.mjs [--dist <VITE_E2E=1 build, default dist-e2e/>] [--seconds 150] [--quality medium|low]
//          [--throttle 1] [--canvas-scale 1] [--instrument] [--trace <file.json>] [--json <out.json>] [--label x]
//   --throttle 4      CDP CPU throttling (a phone's JS is ~3-5× slower than this machine's).
//   --canvas-scale    SwiftShader only: shrink the dish's drawing buffer so software GL does not hide the CPU side.
//   --instrument      wrap the game's hot functions (debug handle), rAF/timer callbacks, layout reads, storage,
//                     JSON and the GL readbacks: calls per second, ms per second, and what ran inside long frames.
//   PERF_VERBOSE=1    print what the player does.
// Before/after of a change: build both with `VITE_E2E=1 node_modules/.bin/vite build --outDir <dir>` and run them one after the
// other with the same flags (e.g. --quality medium --throttle 4 --canvas-scale 0.25 --seconds 150).
// The game picks its grid from the device (cores / memory): --quality sets what the page reports, so a
// 4-core test machine can play the 'medium' profile a modern phone gets. SwiftShader renders on the CPU:
// compare runs of the same build settings on the same machine, never against a phone.
// Fails (exit 1) when the run plays no session or sows no seed: a script that cannot play measures nothing.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { E2E_DIST, findChromium, freePort, startPreview } from './vite-server.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const dist = resolve(opt('--dist', E2E_DIST));
const SECONDS = Number(opt('--seconds', '150'));
const QUALITY = opt('--quality', 'medium');
const THROTTLE = Number(opt('--throttle', '1'));
const TRACE = opt('--trace', '');
const JSON_OUT = opt('--json', '');
const LABEL = opt('--label', '');
/** Wrap the game's hot functions (debug handle) and every rAF / timer callback with timers: per-frame breakdown. */
const INSTRUMENT = args.includes('--instrument');
/**
 * SwiftShader only: draw the dish into a drawing buffer this fraction of its size (the CSS box, the
 * camera and every JS path are unchanged). Software GL spends ~1.4 s per frame on a dsf-2 phone canvas,
 * which hides the CPU side this script measures; 0.25 makes that cost ~16× smaller.
 */
const CANVAS_SCALE = Number(opt('--canvas-scale', '1'));
if (!existsSync(`${dist}/index.html`)) throw new Error(`no build in ${dist}`);

const port = await freePort();
const server = await startPreview(dist, port, { timeoutMs: 60000 });
const stopServer = () => server.stop();

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-CO' });
const HW = QUALITY === 'low' ? { cores: 4, mem: 2 } : { cores: 8, mem: 8 };
await ctx.addInitScript((hw) => {
  if (hw.instrument) {
    // Every call record: [start, duration, name index]; names interned. Only calls ≥ 0.3 ms are kept.
    const I = (window.__inst = { rec: new Float64Array(3 << 20), n: 0, names: [], idx: new Map() });
    I.name = (k) => {
      let i = I.idx.get(k);
      if (i === undefined) I.idx.set(k, (i = I.names.push(k) - 1));
      return i;
    };
    // Every call counted (count, total ms) by name index; only calls ≥ 0.3 ms are recorded one by one.
    I.cnt = new Float64Array(2 * 512);
    I.push = (t0, d, k) => {
      I.cnt[2 * k]++;
      I.cnt[2 * k + 1] += d;
      if (d < 0.3 || I.n + 3 > I.rec.length) return;
      I.rec[I.n++] = t0;
      I.rec[I.n++] = d;
      I.rec[I.n++] = k;
    };
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => {
      const k = I.name(`rAF:${cb.name || 'anon'}`);
      return raf((t) => {
        const t0 = performance.now();
        try {
          cb(t);
        } finally {
          I.push(t0, performance.now() - t0, k);
        }
      });
    };
    const st = window.setTimeout.bind(window);
    window.setTimeout = (cb, ms, ...a) => {
      if (typeof cb !== 'function') return st(cb, ms, ...a);
      const k = I.name(`timeout:${cb.name || 'anon'}`);
      return st(() => {
        const t0 = performance.now();
        try {
          cb(...a);
        } finally {
          I.push(t0, performance.now() - t0, k);
        }
      }, ms);
    };
    const wrapProto = (proto, names, label) => {
      for (const n of names) {
        const f = proto[n];
        if (typeof f !== 'function') continue;
        const k = I.name(`${label}.${n}`);
        proto[n] = function (...a) {
          const t0 = performance.now();
          try {
            return f.apply(this, a);
          } finally {
            I.push(t0, performance.now() - t0, k);
          }
        };
      }
    };
    wrapProto(Storage.prototype, ['setItem', 'getItem'], 'localStorage');
    const js = JSON.stringify;
    const kj = I.name('JSON.stringify');
    JSON.stringify = function (...a) {
      const t0 = performance.now();
      try {
        return js.apply(this, a);
      } finally {
        I.push(t0, performance.now() - t0, kj);
      }
    };
    const jp = JSON.parse;
    const kp = I.name('JSON.parse');
    JSON.parse = function (...a) {
      const t0 = performance.now();
      try {
        return jp.apply(this, a);
      } finally {
        I.push(t0, performance.now() - t0, kp);
      }
    };
    wrapProto(Element.prototype, ['getBoundingClientRect'], 'Element');
    wrapProto(HTMLElement.prototype, ['animate'], 'HTMLElement');
    wrapProto(CanvasRenderingContext2D.prototype, ['drawImage', 'fillText', 'measureText', 'putImageData', 'getImageData'], 'ctx2d');
    wrapProto(WebGL2RenderingContext.prototype, ['readPixels', 'getBufferSubData', 'clientWaitSync', 'linkProgram', 'compileShader', 'getProgramParameter', 'getShaderParameter', 'texImage2D', 'texSubImage2D', 'bufferData', 'getError'], 'gl');
    // The game's own objects, once the debug handle exists.
    const hook = () => {
      const b = window.bioluma;
      if (!b) return void st(hook, 50);
      const wrapObj = (o, names, label) => {
        if (!o) return;
        for (const n of names) {
          const f = o[n];
          if (typeof f !== 'function') continue;
          const k = I.name(`${label}.${n}`);
          o[n] = function (...a) {
            const t0 = performance.now();
            try {
              return f.apply(this, a);
            } finally {
              I.push(t0, performance.now() - t0, k);
            }
          };
        }
      };
      wrapObj(b.sim, ['advance', 'render', 'snapshot', 'snapshotAsync', 'seed', 'erase', 'applyTurns', 'setCreatureTints', 'captureAsync', 'exportState', 'exportStateAsync', 'setParams', 'resizeCanvas', 'setMatterLUT', 'setRenderStyle', 'setDish'], 'sim');
      wrapObj(b.detector, ['update'], 'detector');
      wrapObj(b.game, ['tick', 'view', 'serialize', 'setSpeciesPortrait'], 'game');
      wrapObj(b.ui, ['frame', 'update', 'setCreatureLabels', 'targetRect', 'gridToClient', 'creaturePos'], 'ui');
      wrapObj(b.ui.overlay, ['draw', 'setView'], 'overlay');
      wrapObj(b.flow, ['update'], 'flow');
      wrapObj(b.fly, ['frame', 'launch'], 'fly');
      wrapObj(b.dishFx, ['tick'], 'dishFx');
      wrapObj(b.momentsUI, ['timeScale', 'relabel'], 'momentsUI');
      wrapObj(b.storyUI, ['relabel'], 'storyUI');
      wrapObj(b.priceSheet, ['update'], 'priceSheet');
      wrapObj(b.story, ['serialize', 'signal'], 'story');
      wrapObj(b.moments, ['labelsOnAll', 'notify'], 'moments');
    };
    st(hook, 0);
  }
  Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => hw.cores });
  Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => hw.mem });
  const N = 1 << 17;
  const P = (window.__perf = { t: new Float64Array(N), inc: new Uint8Array(N), n: 0, lt: [], loaf: [], marks: [] });
  const tick = (t) => {
    if (P.n < N) {
      // 1 while the run's culture incubates unlit (the frames the incubation pacing is about).
      P.inc[P.n] = window.bioluma?.culture?.incubating ? 1 : 0;
      P.t[P.n++] = t;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) P.lt.push([e.startTime, e.duration]);
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    /* not supported */
  }
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        P.loaf.push({
          s: e.startTime,
          d: e.duration,
          b: e.blockingDuration,
          rs: e.renderStart,
          sl: e.styleAndLayoutStart,
          scripts: e.scripts.map((x) => ({
            inv: x.invoker,
            type: x.invokerType,
            fn: x.sourceFunctionName,
            url: (x.sourceURL || '').split('/').pop(),
            pos: x.sourceCharPosition,
            d: x.duration,
            fsl: x.forcedStyleAndLayoutDuration,
            ex: x.executionStart,
          })),
        });
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {
    /* not supported */
  }
  if (hw.canvasScale < 1) {
    const shrink = () => {
      const s = window.bioluma?.sim;
      const cv = document.querySelector('canvas.gl-dish');
      if (!s || !cv || !cv.width) return void setTimeout(shrink, 50);
      const orig = s.resizeCanvas.bind(s);
      const k = hw.canvasScale;
      s.resizeCanvas = (w, h) => orig(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
      orig(Math.max(1, Math.round(cv.width * k)), Math.max(1, Math.round(cv.height * k)));
    };
    setTimeout(shrink, 0);
  }
}, { ...HW, instrument: INSTRUMENT, canvasScale: CANVAS_SCALE });

const page = await ctx.newPage();
const errors = [];
const info = [];
page.on('console', (m) => {
  if (m.type() === 'info' && /^\[(fx|dish)\]/.test(m.text())) info.push(m.text());
  if (m.type() === 'error' && !/ERR_CERT|fonts\.(googleapis|gstatic)|net::ERR/.test(m.text())) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
if (THROTTLE > 1) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
}
if (TRACE)
  await browser.startTracing(page, {
    path: TRACE,
    categories: [
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
      'v8.execute',
      'v8',
      'blink.user_timing',
      'disabled-by-default-v8.cpu_profiler',
    ],
  });

const tap = (x, y) => page.touchscreen.tap(x, y);
const mark = (label) => page.evaluate((l) => window.__perf.marks.push([performance.now(), l]), label);
/** Centre of the first visible element matching `sel`, or null. */
const centre = (sel) =>
  page.evaluate((sel) => {
    for (const e of document.querySelectorAll(sel)) {
      if (e.closest('[hidden]')) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
      const st = getComputedStyle(e);
      if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) < 0.3) continue;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return null;
  }, sel);
const tapSel = async (sel) => {
  const c = await centre(sel);
  if (!c) return false;
  await tap(c.x, c.y);
  return true;
};

// ── Title, intro, tutorial ──
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => !!window.bioluma, null, { timeout: 60000 });
const quality = await page.evaluate(() => {
  // Seeds the player's gestures planted (the Sembrar button), as session-play counts them.
  window.__manualSeeds = 0;
  window.bioluma.bus.on('seed', (e) => {
    if (e.manual) window.__manualSeeds++;
  });
  return window.bioluma.sim.gridW;
});
if (process.env.PERF_VERBOSE) console.log(`booted, grid ${quality}`);
await page.waitForTimeout(1500);
await mark('title');
const vlog = (m) => process.env.PERF_VERBOSE && console.log(m);
vlog(`title fps ${await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => (++n, performance.now() - t0 < 1000 ? requestAnimationFrame(f) : r(n)); requestAnimationFrame(f); }))}`);
if (await tapSel('[data-testid="splash"]')) await page.waitForTimeout(1500);
vlog('splash tapped');
// The opening intro of a new player (docs/STORY.md §11): a slow page may open it seconds after the title.
await page.locator('[data-testid="intro-skip"]').waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
for (let i = 0; i < 10 && !(await tapSel('[data-testid="intro-skip"]')); i++) await page.waitForTimeout(300);
for (let i = 0; i < 20 && (await page.locator('[data-testid="intro"]').isVisible().catch(() => false)); i++) await page.waitForTimeout(200);
await page.waitForTimeout(1200);
vlog('intro skipped');
// VELA's first scene: "Saltar tutorial", then "¿Seguro? Toca otra vez".
for (let i = 0; i < 20; i++) {
  if (await page.evaluate(() => window.bioluma.story.serialize().tutorialSkipped)) break;
  if (await tapSel('.sty-skip')) await page.waitForTimeout(400);
  else await page.waitForTimeout(300);
}
const playStart = await page.evaluate(() => {
  if (window.__inst) window.__inst.cnt.fill(0);
  return performance.now();
});
await mark('play');
if (process.env.PERF_VERBOSE) console.log('playing');
const log = (m) => process.env.PERF_VERBOSE && console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

// ── Play in real time ──
const t0 = Date.now();
let sessions = 0;
let treeBuys = 0;
let bestiaryVisits = 0;
let sparks = 0;
let seeds = 0;
let pulses = 0;
let lastSessionN = 0;
let summaryAt = 0;
const state = () =>
  page.evaluate(() => {
    const b = window.bioluma;
    const v = b.game.view();
    const vis = (sel) => {
      const e = document.querySelector(sel);
      if (!e || e.closest('[hidden]')) return false;
      const r = e.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    };
    const st = b.story.current();
    const golden = b.ui.targetRect('golden');
    const dish = document.querySelector('.bl-dish')?.getBoundingClientRect();
    return {
      phase: v.session?.phase ?? null,
      n: v.session?.n ?? 0,
      creatures: v.creatures.filter((x) => x.state !== 'dead').length,
      intro: vis('[data-testid="intro-skip"]'),
      storyLines: st?.phase === 'lines' && vis('.sty-box'),
      storyChoice: st?.phase === 'choice' && vis('.sty-opt'),
      momentCard: vis('.mo-card .mo-ok'),
      sheet: [...document.querySelectorAll('.mo-sp-layer')].some((l) => !l.hidden && l.classList.contains('show')),
      reveal: vis('.bls-reveal'),
      drawer: !!b.ui.drawerOpen,
      welcome: vis('.ss-welcome .ss-card [data-act="go"]'),
      startGo: vis('.ss-layer:not(.ss-welcome) [data-act="go"]'),
      summaryTree: vis('.ss-layer [data-act="tree"]'),
      treeOpen: !!b.flow.treeOpen,
      golden: golden && dish && (golden.width !== dish.width || golden.height !== dish.height) ? { x: golden.x + golden.width / 2, y: golden.y + golden.height / 2 } : null,
      boost: vis('.dock-boost.can'),
      // ADR-031: sowing is the Sembrar button (a tap on the dish never sows); a tap on a stable creature pulses.
      sow: vis('[data-testid="sow"][data-state="ready"]') || vis('[data-testid="sow"][data-state="free"]'),
      sown: window.__manualSeeds ?? 0,
      sowState: document.querySelector('[data-testid="sow"]')?.dataset.state ?? null,
      scene: st?.scene.id ?? null,
      stable: v.creatures.filter((x) => x.state === 'stable').map((x) => b.ui.gridToClient(x.x, x.y)).filter(Boolean),
    };
  });

while (Date.now() - t0 < SECONDS * 1000) {
  const s = await state();
  log(`${s.phase} n=${s.n} c=${s.creatures} sow=${s.sowState}${s.intro ? ' intro' : ''}${s.storyLines ? ` story:${s.scene}` : ''}${s.momentCard ? ' moment' : ''}${s.sheet ? ' sheet' : ''}${s.drawer ? ' drawer' : ''}${s.startGo ? ' start' : ''}${s.summaryTree ? ' summary' : ''}${s.treeOpen ? ' tree' : ''}`);
  // Session 1 starts on an empty dish and VELA's line waits for the first seed (ADR-030): press Sembrar.
  seeds = s.sown;
  if (s.intro) await tapSel('[data-testid="intro-skip"]');
  else if (s.phase === 'ready' && s.n === 1 && s.creatures === 0 && s.sow) await tapSel('[data-testid="sow"]');
  else if (s.storyLines) await tapSel('.sty-box');
  else if (s.storyChoice) await tapSel('.sty-opt');
  else if (s.momentCard) {
    await page.waitForTimeout(800); // a player reads it
    await tapSel('.mo-card .mo-ok');
  } else if (s.sheet) {
    if (!(await tapSel('.mo-sp-layer.show .mo-sp-x'))) await page.keyboard.press('Escape');
  } else if (s.reveal) await tapSel('.bls-reveal');
  else if (s.welcome) await tapSel('.ss-welcome [data-act="go"]');
  else if (s.drawer) {
    if (!(await tapSel('.modal .modal-close')) && !(await tapSel('.bl-drawer .drawer-x'))) await page.keyboard.press('Escape');
  } else if (s.treeOpen) {
    // Buy one thing that glows, then "Nueva sesión".
    await mark('tree');
    const ids = await page.evaluate(() => {
      const top = document.querySelector('.rt-top')?.getBoundingClientRect().bottom ?? 0;
      return [...document.querySelectorAll('.rt-node.can')]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          const cy = r.top + r.height / 2;
          return cy > top + 8 && cy < innerHeight - 120 && r.left > 0 && r.right < innerWidth;
        })
        .map((e) => e.dataset.id);
    });
    if (ids.length) {
      await tapSel(`.rt-node[data-id="${ids[0]}"]`);
      await page.waitForTimeout(900);
      if (await tapSel(`.rt-sheet.show .rt-buy[data-buy="${ids[0]}"]:not(:disabled)`)) treeBuys++;
      await page.waitForTimeout(900);
      await tapSel('.rt-x');
      await page.waitForTimeout(400);
    }
    for (let i = 0; i < 4 && (await page.evaluate(() => window.bioluma.flow.treeOpen)); i++) {
      if (await page.evaluate(() => !!document.querySelector('.sty-box') && window.bioluma.story.current()?.phase === 'lines')) await tapSel('.sty-box');
      else await tapSel('.rt-go');
      await page.waitForTimeout(700);
    }
  } else if (s.summaryTree) {
    if (!summaryAt) summaryAt = Date.now();
    if (Date.now() - summaryAt > 3500) {
      await mark('summary→tree');
      await tapSel('.ss-layer [data-act="tree"]');
      summaryAt = 0;
    }
  } else if (s.startGo) {
    await mark('start');
    await page.waitForTimeout(700);
    await tapSel('.ss-layer:not(.ss-welcome) [data-act="go"]');
  } else if (s.phase === 'ready' || s.phase === 'running') {
    if (s.n !== lastSessionN) {
      lastSessionN = s.n;
      sessions++;
      // Every other session: the Bestiary from the dock and a species card, like a curious player.
      if (s.n >= 2 && s.n % 2 === 0 && (await centre('.bl-dock [data-tab="bestiary"]'))) {
        await mark('bestiary');
        await tapSel('.bl-dock [data-tab="bestiary"]');
        await page.waitForTimeout(800);
        if (await tapSel('.bl-drawer button.sp')) {
          await page.waitForTimeout(1200);
          if (!(await tapSel('.modal .modal-close'))) await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        }
        await tapSel('.bl-drawer .drawer-x');
        bestiaryVisits++;
        await page.waitForTimeout(400);
        continue;
      }
    }
    if (s.golden) {
      await tap(s.golden.x, s.golden.y);
      sparks++;
    } else if (s.boost && s.phase === 'running') await tapSel('.dock-boost');
    else if (s.creatures < 4 && s.sow) await tapSel('[data-testid="sow"]');
    else if (s.stable.length && s.phase === 'running') {
      // A pulse on a stable creature, like a player who taps what glows.
      const p = s.stable[pulses % s.stable.length];
      await tap(p.x, p.y);
      pulses++;
    }
  }
  await page.waitForTimeout(350);
}
seeds = await page.evaluate(() => window.__manualSeeds ?? 0);
const playEnd = await page.evaluate(() => performance.now());
const raw = await page.evaluate(() => {
  const P = window.__perf;
  const I = window.__inst;
  return {
    t: Array.from(P.t.subarray(0, P.n)),
    inc: Array.from(P.inc.subarray(0, P.n)),
    lt: P.lt,
    loaf: P.loaf,
    marks: P.marks,
    fx: window.bioluma.dishFx?.profile?.name ?? null,
    inst: I ? { rec: Array.from(I.rec.subarray(0, I.n)), names: I.names, cnt: Array.from(I.cnt.subarray(0, 2 * I.names.length)), countFrom: I.countFrom ?? 0 } : null,
  };
});
if (TRACE) await browser.stopTracing();
await browser.close();
stopServer();

// ── Numbers ──
const inWin = (s) => s >= playStart && s <= playEnd;
const dts = [];
for (let i = 1; i < raw.t.length; i++) if (inWin(raw.t[i - 1])) dts.push(raw.t[i] - raw.t[i - 1]);
const incDts = [];
for (let i = 1; i < raw.t.length; i++) if (inWin(raw.t[i - 1]) && raw.inc[i]) incDts.push(raw.t[i] - raw.t[i - 1]);
const incSorted = [...incDts].sort((a, b) => a - b);
const sorted = [...dts].sort((a, b) => a - b);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
const minutes = (playEnd - playStart) / 60000;
const BUCKETS = [17, 25, 34, 50, 100, 200, Infinity];
const hist = BUCKETS.map((b, i) => [`${i ? BUCKETS[i - 1] : 0}–${b === Infinity ? '∞' : b}`, dts.filter((d) => d > (i ? BUCKETS[i - 1] : 0) && d <= b).length]);
const lts = raw.lt.filter(([s]) => inWin(s));
const loafs = raw.loaf.filter((l) => inWin(l.s));
const summary = {
  label: LABEL,
  quality: QUALITY,
  grid: quality,
  throttle: THROTTLE,
  canvasScale: CANVAS_SCALE,
  seconds: Math.round((playEnd - playStart) / 1000),
  frames: dts.length,
  fps: dts.length / ((playEnd - playStart) / 1000),
  p50: pct(50),
  p95: pct(95),
  p99: pct(99),
  max: sorted[sorted.length - 1] ?? 0,
  over50PerMin: dts.filter((d) => d > 50).length / minutes,
  over100PerMin: dts.filter((d) => d > 100).length / minutes,
  longtasks: lts.length,
  longtaskMs: lts.reduce((a, [, d]) => a + d, 0),
  longtaskMax: lts.reduce((a, [, d]) => Math.max(a, d), 0),
  loafs: loafs.length,
  loafBlockingMs: loafs.reduce((a, l) => a + l.b, 0),
  forcedLayoutMs: loafs.reduce((a, l) => a + l.scripts.reduce((x, s) => x + (s.fsl || 0), 0), 0),
  sessions,
  seeds,
  treeBuys,
  bestiaryVisits,
  sparks,
  pulses,
  fxProfileEnd: raw.fx,
  fxLowered: info.filter((l) => l.startsWith('[fx] effects profile lowered')).length,
  incubationFrames: incDts.length,
  incubationP50: incSorted[Math.floor(incSorted.length / 2)] ?? 0,
  incubationP95: incSorted[Math.floor(incSorted.length * 0.95)] ?? 0,
  histogram: Object.fromEntries(hist),
};
// Script attribution of long animation frames (> 50 ms): total ms per script entry point.
const attr = new Map();
for (const l of loafs)
  for (const s of l.scripts) {
    const k = `${s.type}:${s.inv}${s.fn ? ` → ${s.fn}` : ''} @${s.url}:${s.pos}`;
    const a = attr.get(k) ?? { ms: 0, n: 0, max: 0, fsl: 0 };
    a.ms += s.d;
    a.n++;
    a.max = Math.max(a.max, s.d);
    a.fsl += s.fsl || 0;
    attr.set(k, a);
  }
const topAttr = [...attr].sort((a, b) => b[1].ms - a[1].ms).slice(0, 15);
const marksIn = raw.marks.map(([t, l]) => [Math.round(t - playStart), l]);
const worst = [...loafs]
  .sort((a, b) => b.d - a.d)
  .slice(0, 12)
  .map((l) => {
    const near = marksIn.filter(([t]) => Math.abs(t - (l.s - playStart)) < 3000).map(([, x]) => x);
    return {
      at: Math.round(l.s - playStart),
      ms: Math.round(l.d),
      blocking: Math.round(l.b),
      render: Math.round(l.d - (l.rs - l.s)),
      near,
      scripts: l.scripts
        .filter((s) => s.d > 3)
        .map((s) => `${Math.round(s.d)}ms ${s.type}:${s.inv}${s.fn ? `→${s.fn}` : ''}@${s.url}:${s.pos}${s.fsl ? ` (forced layout ${Math.round(s.fsl)})` : ''}`),
    };
  });

console.log(`\n== perf-play ${LABEL} (${QUALITY}, grid ${quality}², throttle ×${THROTTLE}, canvas ×${CANVAS_SCALE}${INSTRUMENT ? ', instrumented' : ''}) ==`);
console.log(JSON.stringify(summary, null, 1));
console.log('\nTop LoAF script attribution (ms total, count, max, forced layout):');
for (const [k, a] of topAttr) console.log(`  ${a.ms.toFixed(0).padStart(6)} ms  ×${String(a.n).padStart(3)}  max ${a.max.toFixed(0).padStart(4)}  fsl ${a.fsl.toFixed(0).padStart(4)}  ${k}`);
console.log('\nWorst animation frames:');
for (const w of worst) console.log(`  t=${(w.at / 1000).toFixed(1)}s ${w.ms} ms (blocking ${w.blocking}, render ${w.render}) near [${w.near.join(', ')}]\n    ${w.scripts.join('\n    ')}`);
if (info.length) console.log(`\nGame notes:\n  ${info.join('\n  ')}`);
if (errors.length) console.log(`\nConsole errors:\n  ${errors.slice(0, 10).join('\n  ')}`);
if (JSON_OUT)
  writeFileSync(
    JSON_OUT,
    JSON.stringify({ summary, topAttr, worst, marks: marksIn, dts, counts: raw.inst ? raw.inst.names.map((k, i) => [k, raw.inst.cnt[2 * i], raw.inst.cnt[2 * i + 1]]) : null }, null, 1),
  );

if (TRACE) analyzeTrace(TRACE, playStart, playEnd);
if (raw.inst) analyzeInstrument(raw.inst);
const played = sessions > 0 && seeds > 0;
if (!played) console.error(`\nPERF-PLAY: FAIL: the run played ${sessions} session(s) and sowed ${seeds} seed(s); nothing was measured`);

/** Per-function totals over the play window, and the calls inside every frame callback over 50 ms. */
function analyzeInstrument(inst) {
  const { rec, names } = inst;
  const calls = [];
  for (let i = 0; i < rec.length; i += 3) if (inWin(rec[i])) calls.push({ t: rec[i], d: rec[i + 1], k: names[rec[i + 2]] });
  const tot = new Map();
  for (const c of calls) {
    const a = tot.get(c.k) ?? { ms: 0, n: 0, max: 0, over16: 0 };
    a.ms += c.d;
    a.n++;
    a.max = Math.max(a.max, c.d);
    if (c.d > 16) a.over16++;
    tot.set(c.k, a);
  }
  const secs = minutes * 60;
  const counted = names.map((k, i) => [k, inst.cnt[2 * i], inst.cnt[2 * i + 1]]).filter(([, n]) => n > 0).sort((a, b) => b[2] - a[2]);
  console.log(`\nEvery call over ${secs.toFixed(0)} s (calls per s, ms per s, mean ms):`);
  for (const [k, n, ms] of counted.slice(0, 30)) console.log(`  ${(n / secs).toFixed(1).padStart(7)}/s  ${(ms / secs).toFixed(2).padStart(7)} ms/s  ${(ms / n).toFixed(3).padStart(7)}  ${k}`);
  console.log(`\nInstrumented calls ≥ 0.3 ms over ${(minutes * 60).toFixed(0)} s (total ms, per s, count, max, count > 16 ms):`);
  for (const [k, a] of [...tot].sort((x, y) => y[1].ms - x[1].ms).slice(0, 40))
    console.log(`  ${a.ms.toFixed(0).padStart(7)}  ${(a.ms / (minutes * 60)).toFixed(1).padStart(6)}/s  ×${String(a.n).padStart(6)}  max ${a.max.toFixed(1).padStart(6)}  >16:${String(a.over16).padStart(4)}  ${k}`);
  // The longest single JS calls (GPU waits excluded): where a phone's 3-5× slower CPU turns into a hitch.
  const isGpuWait = (k) => /^gl\.(readPixels|getBufferSubData|clientWaitSync)$|^sim\.snapshot$|^timeout:poll$/.test(k);
  const longest = calls.filter((c) => !/^(rAF|timeout):/.test(c.k) && !isGpuWait(c.k) && c.d > 8).sort((a, b) => b.d - a.d).slice(0, 30);
  console.log(`\nLongest single calls (no GPU waits), > 8 ms: ${longest.length}`);
  for (const c of longest) {
    const near = marksIn.filter(([t]) => Math.abs(t - (c.t - playStart)) < 2500).map(([, x]) => x);
    const inside = calls.filter((x) => x !== c && x.t >= c.t && x.t + x.d <= c.t + c.d + 0.01).sort((a, b) => b.d - a.d).slice(0, 4);
    console.log(`  t=${((c.t - playStart) / 1000).toFixed(1)}s ${c.k} ${c.d.toFixed(1)} ms [${near.join(',')}] ${inside.map((x) => `${x.k} ${x.d.toFixed(1)}`).join(', ')}`);
  }
  // Long callbacks (frame or timer): what ran inside.
  const roots = calls.filter((c) => /^(rAF|timeout):/.test(c.k) && c.d > 50).sort((a, b) => b.d - a.d);
  console.log(`\nCallbacks > 50 ms: ${roots.length} (${roots.filter((r) => r.d > 100).length} > 100 ms). The 25 longest:`);
  for (const r of roots.slice(0, 25)) {
    const inner = calls.filter((c) => c !== r && c.t >= r.t && c.t + c.d <= r.t + r.d + 0.01 && !/^(rAF|timeout):/.test(c.k));
    const by = new Map();
    for (const c of inner) by.set(c.k, (by.get(c.k) ?? 0) + c.d);
    const near = marksIn.filter(([t]) => Math.abs(t - (r.t - playStart)) < 2500).map(([, x]) => x);
    console.log(`  t=${((r.t - playStart) / 1000).toFixed(1)}s ${r.k} ${r.d.toFixed(0)} ms [${near.join(',')}]: ${[...by].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}`);
  }
}

/** Attribute the long main-thread tasks of a Chrome trace: JS self time (sampled), GC, layout, by task. */
function analyzeTrace(file) {
  const tr = JSON.parse(readFileSync(file, 'utf8'));
  const ev = tr.traceEvents ?? tr;
  const main = ev.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain' && ev.some((x) => x.pid === e.pid && x.name === 'ProfileChunk'));
  if (!main) return console.log('trace: no renderer main thread with samples');
  const { pid, tid } = main;
  const mine = ev.filter((e) => e.pid === pid && e.tid === tid && e.ph === 'X');
  // CPU profile samples.
  const nodes = new Map();
  const samples = [];
  let profStart = 0;
  for (const e of ev) {
    if (e.pid !== pid) continue;
    if (e.name === 'Profile') profStart = e.args.data.startTime;
    if (e.name !== 'ProfileChunk') continue;
    const d = e.args.data;
    for (const n of d.cpuProfile?.nodes ?? []) nodes.set(n.id, n);
    let t = samples.length ? samples[samples.length - 1][0] : profStart;
    const ids = d.cpuProfile?.samples ?? [];
    for (let i = 0; i < ids.length; i++) {
      t += d.timeDeltas[i];
      samples.push([t, ids[i]]);
    }
  }
  samples.sort((a, b) => a[0] - b[0]);
  const fnOf = (id) => {
    const n = nodes.get(id);
    if (!n) return '?';
    const cf = n.callFrame;
    return `${cf.functionName || '(anon)'}${cf.url ? `@${cf.url.split('/').pop()}:${cf.lineNumber + 1}` : ''}`;
  };
  const stackOf = (id) => {
    const out = [];
    for (let n = nodes.get(id); n; n = n.parent ? nodes.get(n.parent) : null) out.push(n);
    return out;
  };
  const tasks = mine.filter((e) => (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') && e.dur > 50000);
  const gcNames = /GC|Scavenge|MarkCompact|Sweep/;
  const gc = mine.filter((e) => gcNames.test(e.name));
  const gcTotal = gc.reduce((a, e) => a + e.dur, 0) / 1000;
  const gcBig = gc.filter((e) => e.dur > 10000);
  console.log(`\nTrace: ${tasks.length} main-thread tasks > 50 ms; GC total ${gcTotal.toFixed(0)} ms in ${gc.length} events, ${gcBig.length} > 10 ms (max ${(Math.max(0, ...gc.map((e) => e.dur)) / 1000).toFixed(1)} ms)`);
  const gcByName = new Map();
  for (const e of gc) gcByName.set(e.name, (gcByName.get(e.name) ?? 0) + e.dur / 1000);
  console.log(`  GC by event: ${[...gcByName].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v.toFixed(0)} ms`).join(', ')}`);
  // Self time over the whole trace and inside long tasks.
  const selfAll = new Map();
  const selfLong = new Map();
  const inclLong = new Map();
  let si = 0;
  const longSorted = [...tasks].sort((a, b) => a.ts - b.ts);
  for (let i = 1; i < samples.length; i++) {
    const [t, id] = samples[i];
    const dt = (t - samples[i - 1][0]) / 1000;
    const f = fnOf(id);
    selfAll.set(f, (selfAll.get(f) ?? 0) + dt);
    while (si < longSorted.length && longSorted[si].ts + longSorted[si].dur < t) si++;
    const lt = longSorted[si];
    if (lt && t >= lt.ts && t <= lt.ts + lt.dur) {
      selfLong.set(f, (selfLong.get(f) ?? 0) + dt);
      const seen = new Set();
      for (const n of stackOf(id)) {
        const g = fnOf(n.id);
        if (seen.has(g)) continue;
        seen.add(g);
        inclLong.set(g, (inclLong.get(g) ?? 0) + dt);
      }
    }
  }
  const top = (m, k = 20) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k);
  console.log('\nJS self time, whole run (ms):');
  for (const [f, ms] of top(selfAll, 25)) console.log(`  ${ms.toFixed(0).padStart(7)}  ${f}`);
  console.log('\nJS self time inside tasks > 50 ms (ms):');
  for (const [f, ms] of top(selfLong, 20)) console.log(`  ${ms.toFixed(0).padStart(7)}  ${f}`);
  console.log('\nInclusive time inside tasks > 50 ms (ms):');
  for (const [f, ms] of top(inclLong, 30)) console.log(`  ${ms.toFixed(0).padStart(7)}  ${f}`);
  // Each of the 15 longest tasks: what ran inside it.
  console.log('\nLongest tasks:');
  const kids = (t) => mine.filter((e) => e.ts >= t.ts && e.ts + e.dur <= t.ts + t.dur && e !== t);
  for (const t of [...tasks].sort((a, b) => b.dur - a.dur).slice(0, 15)) {
    const k = kids(t);
    const byName = new Map();
    for (const e of k) if (!/RunTask/.test(e.name)) byName.set(e.name, (byName.get(e.name) ?? 0) + e.dur / 1000);
    const fc = k.filter((e) => e.name === 'FunctionCall' || e.name === 'TimerFire' || e.name === 'FireAnimationFrame' || e.name === 'EventDispatch');
    const self = new Map();
    for (const [st, id] of samples) if (st >= t.ts && st <= t.ts + t.dur) self.set(fnOf(id), (self.get(fnOf(id)) ?? 0) + 1);
    console.log(
      `  ${(t.dur / 1000).toFixed(0)} ms: ${top(byName, 6).map(([n, v]) => `${n} ${v.toFixed(0)}`).join(', ')}` +
        `\n     entry: ${fc.slice(0, 3).map((e) => `${e.name}(${e.args?.data?.functionName ?? e.args?.data?.type ?? ''}${e.args?.data?.url ? `@${String(e.args.data.url).split('/').pop()}:${e.args.data.lineNumber}` : ''})`).join(' ')}` +
        `\n     samples: ${top(self, 6).map(([f, n]) => `${f}×${n}`).join(', ')}`,
    );
  }
}

process.exit(played ? 0 : 1);
