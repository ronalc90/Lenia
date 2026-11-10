// Screenshots of real play (no debug shortcuts): title → opening intro (skipped) → VELA's tutorial → the first
// sessions (start card, run, summary, research tree).
// Usage: node tests/e2e/play-shots.mjs [--dist dist-e2e] [--seconds 120] [--every 8] [--out play-shots] [--vp mobile|desktop] [--lang es|en]
// Reads the dialogue like a player (taps it when a line finished), sows with the Sembrar button (a tap on the dish
// never sows, ADR-031), pulses stable creatures, answers the session cards. Needs a VITE_E2E=1 build (`npm run e2e`).
// Fails on page errors, when it sowed no seed and when no session clock ever ran. Prints a short timeline of story
// scenes and game state.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { E2E_DIST, findChromium, freePort, startPreview } from './vite-server.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const dist = resolve(opt('--dist', E2E_DIST));
const seconds = Number(opt('--seconds', '120'));
const every = Number(opt('--every', '8'));
const out = resolve(opt('--out', 'play-shots'));
const vpName = opt('--vp', 'mobile');
const lang = opt('--lang', 'es');
mkdirSync(out, { recursive: true });

const port = await freePort();
const server = await startPreview(dist, port, { timeoutMs: 60000 });
const vp = vpName === 'desktop' ? { width: 1366, height: 768, isMobile: false, hasTouch: false, dsf: 1 } : { width: 390, height: 844, isMobile: true, hasTouch: true, dsf: 2 };
const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
const problems = [];
let n = 0;
try {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dsf,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    locale: lang === 'en' ? 'en-US' : 'es-CO',
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_CERT|fonts\.(googleapis|gstatic)|net::ERR/.test(m.text())) errors.push(m.text());
  });
  const shot = async (label) => {
    const f = `${out}/${vpName}-${String(n++).padStart(2, '0')}-${label}.png`;
    await page.screenshot({ path: f });
    return f;
  };
  const tap = async (x, y) => (vp.hasTouch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
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

  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => !!window.bioluma, null, { timeout: 30000 });
  await page.evaluate(() => {
    // Seeds the player's gestures planted (the Sembrar button), as session-play counts them.
    window.__manualSeeds = 0;
    window.bioluma.bus.on('seed', (e) => {
      if (e.manual) window.__manualSeeds++;
    });
  });
  await page.waitForSelector('[data-testid="splash"]', { timeout: 20000 });
  await page.waitForTimeout(900);
  await shot('title');
  await page.locator('[data-testid="splash"]').click();
  // A new player gets the opening intro once after the title (docs/STORY.md §11): one look, then "Saltar intro".
  const introSkip = page.locator('[data-testid="intro-skip"]');
  await introSkip.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
  if (await introSkip.isVisible().catch(() => false)) {
    await page.waitForTimeout(600);
    await shot('intro');
    await introSkip.click();
    for (let i = 0; i < 20 && (await page.locator('[data-testid="intro"]').isVisible().catch(() => false)); i++) await page.waitForTimeout(200);
  } else problems.push('the opening intro did not open after the title');

  const t0 = Date.now();
  let nextShot = 0;
  let lastScene = '';
  let lastCard = '';
  let pulses = 0;
  let summaryAt = 0;
  let sessionsRun = 0;
  let lastRunN = 0;
  while (Date.now() - t0 < seconds * 1000) {
    const el = (Date.now() - t0) / 1000;
    const st = await page.evaluate(() => {
      const b = window.bioluma;
      const v = b.game.view();
      const vis = (sel) => {
        const e = document.querySelector(sel);
        if (!e || e.closest('[hidden]')) return false;
        const r = e.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      };
      const box = document.querySelector('.sty-box');
      const task = document.querySelector('.sty-task');
      return {
        phase: v.session?.phase ?? null,
        n: v.session?.n ?? 0,
        creatures: v.creatures.filter((x) => x.state !== 'dead').length,
        intro: vis('[data-testid="intro-skip"]'),
        stable: v.creatures.filter((x) => x.state === 'stable').map((x) => b.ui.gridToClient(x.x, x.y)).filter(Boolean),
        line: vis('.sty-box'),
        name: document.querySelector('.sty-name')?.textContent ?? '',
        text: document.querySelector('.sty-text')?.textContent ?? '',
        done: !!box?.classList.contains('done'),
        taskText: task && !task.hidden ? (task.querySelector('.sty-task-text')?.textContent ?? '') : '',
        choice: vis('.sty-opt'),
        moment: vis('.mo-card .mo-ok'),
        sheet: [...document.querySelectorAll('.mo-sp-layer')].some((l) => !l.hidden && l.classList.contains('show')),
        reveal: vis('.bls-reveal'),
        drawer: !!b.ui.drawerOpen,
        welcome: vis('.ss-welcome .ss-card [data-act="go"]'),
        startGo: vis('.ss-layer:not(.ss-welcome) [data-act="go"]'),
        summaryTree: vis('.ss-layer [data-act="tree"]'),
        treeOpen: !!b.flow.treeOpen,
        sow: vis('[data-testid="sow"][data-state="ready"]') || vis('[data-testid="sow"][data-state="free"]'),
      };
    });
    if (st.phase === 'running' && st.n !== lastRunN) {
      lastRunN = st.n;
      sessionsRun++;
    }
    const sceneKey = st.line ? st.text.slice(0, 40) : st.taskText ? `task:${st.taskText.slice(0, 40)}` : '';
    const card = st.moment ? 'moment' : st.startGo ? `start-${st.n}` : st.summaryTree ? `summary-${st.n}` : st.treeOpen ? `tree-${st.n}` : '';
    if (sceneKey && sceneKey !== lastScene) {
      lastScene = sceneKey;
      console.log(`${el.toFixed(1).padStart(6)} s  ${st.line ? `${st.name}: ${st.text}` : `TASK ${st.taskText}`}`);
      await shot(st.line ? 'line' : 'task');
    } else if (card && card !== lastCard) {
      lastCard = card;
      console.log(`${el.toFixed(1).padStart(6)} s  [${card}]`);
      await shot(card);
    } else if (el >= nextShot) {
      nextShot = el + every;
      await shot(`t${Math.round(el)}s`);
    }
    // Session 1 starts on an empty dish and VELA's line waits for the first seed (ADR-030): press Sembrar.
    if (st.intro) await tapSel('[data-testid="intro-skip"]');
    else if (st.phase === 'ready' && st.n === 1 && st.creatures === 0 && st.sow) await tapSel('[data-testid="sow"]');
    else if (st.choice) await tapSel('.sty-opt');
    else if (st.line) {
      // Read for a moment like a player, then advance.
      await page.waitForTimeout(st.done ? 700 : 1200);
      await tapSel('.sty-box');
    } else if (st.moment) {
      await page.waitForTimeout(800);
      await tapSel('.mo-card .mo-ok');
    } else if (st.sheet) {
      if (!(await tapSel('.mo-sp-layer.show .mo-sp-x'))) await page.keyboard.press('Escape');
    } else if (st.reveal) await tapSel('.bls-reveal');
    else if (st.welcome) await tapSel('.ss-welcome [data-act="go"]');
    else if (st.drawer) {
      if (!(await tapSel('.modal .modal-close')) && !(await tapSel('.bl-drawer .drawer-x'))) await page.keyboard.press('Escape');
    } else if (st.treeOpen) {
      await page.waitForTimeout(1200);
      for (let i = 0; i < 4 && (await page.evaluate(() => window.bioluma.flow.treeOpen)); i++) {
        if (await page.evaluate(() => window.bioluma.story.current()?.phase === 'lines')) await tapSel('.sty-box');
        else await tapSel('.rt-go');
        await page.waitForTimeout(700);
      }
    } else if (st.summaryTree) {
      if (!summaryAt) summaryAt = Date.now();
      if (Date.now() - summaryAt > 2500) {
        await tapSel('.ss-layer [data-act="tree"]');
        summaryAt = 0;
      }
    } else if (st.startGo) {
      await page.waitForTimeout(700);
      await tapSel('.ss-layer:not(.ss-welcome) [data-act="go"]');
    } else if (st.phase === 'running') {
      if (st.creatures < 4 && st.sow) await tapSel('[data-testid="sow"]');
      else if (st.stable.length) {
        // A pulse on a stable creature, like a player who taps what glows (ADR-031).
        const p = st.stable[pulses++ % st.stable.length];
        await tap(p.x, p.y);
      }
    }
    await page.waitForTimeout(500);
  }
  const state = await page.evaluate(() => {
    const b = window.bioluma;
    const v = b.game.view();
    return { seeds: window.__manualSeeds ?? 0, session: v.session?.n ?? 0, phase: v.session?.phase ?? null, luz: Math.round(v.essence), species: v.species.length, story: b.story?.serialize?.().done };
  });
  console.log('END', JSON.stringify({ ...state, sessionsRun, pulses }));
  await shot('end');
  if (state.seeds < 1) problems.push('no seed sown with the Sembrar button');
  if (sessionsRun < 1) problems.push(`no session clock ran in ${seconds} s (session ${state.session}, ${state.phase})`);
} catch (err) {
  problems.push(String(err?.stack ?? err));
} finally {
  await browser.close();
  server.stop();
}
console.log(`${n} screenshots in ${out}`);
if (errors.length) console.log(`ERRORS\n${errors.slice(0, 10).join('\n')}`);
if (problems.length) console.log(`PROBLEMS\n${problems.join('\n')}`);
const failed = errors.length > 0 || problems.length > 0;
console.log(failed ? 'PLAY-SHOTS: FAIL' : 'PLAY-SHOTS: OK');
process.exit(failed ? 1 : 0);
