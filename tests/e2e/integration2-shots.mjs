// Screenshots of the second integration in the REAL game (not the dev pages): a Momento card mid-pause,
// the creature status pills, an Encargo (offer bubble, "¿Por qué?" dialogue, progress badge, celebration),
// the seed price sheet opened by ONE tap on the price, the Behaviour Guide, a secret reveal (Konami typed
// for real) and the basement. 390×844 and 1366×768, es/en, dark/light.
//
// Usage: node tests/e2e/integration2-shots.mjs [--dist <dir>] [--out <dir>] [--only mobile-es-dark]
//   Without --dist it builds with VITE_E2E=1 into a temp dir first.
// Fails on console/page errors, horizontal overflow, or when a layer pushes the HUD / dish / tabs around
// (their boxes are measured before and after every overlay: nothing may shift).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const out = resolve(opt('--out', `${tmpdir()}/bioluma-int2`));
const only = opt('--only', '');
let dist = opt('--dist', '');
mkdirSync(out, { recursive: true });

if (!dist) {
  dist = resolve(`${tmpdir()}/bioluma-int2-dist`);
  console.log(`building (VITE_E2E=1) into ${dist}…`);
  const b = spawnSync('npx', ['vite', 'build', '--outDir', dist, '--emptyOutDir'], {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, VITE_E2E: '1' },
  });
  if (b.status !== 0) throw new Error('build failed');
}
dist = resolve(dist);

function findChromium() {
  const base = '/opt/pw-browsers';
  for (const d of readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const p = `${base}/${d}/chrome-linux/chrome`;
    if (existsSync(p)) return p;
  }
  throw new Error('chromium not found under /opt/pw-browsers');
}

const port = 6400 + Math.floor(Math.random() * 800);
const server = spawn('npx', ['vite', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('preview did not start')), 30000);
  server.stdout.on('data', (d) => String(d).includes(String(port)) && (clearTimeout(t), res()));
});

const CASES = [
  { name: 'mobile-es-dark', width: 390, height: 844, mobile: true, lang: 'es', theme: 'dark' },
  { name: 'desktop-en-light', width: 1366, height: 768, mobile: false, lang: 'en', theme: 'light' },
  { name: 'mobile-en-light', width: 390, height: 844, mobile: true, lang: 'en', theme: 'light' },
  { name: 'desktop-es-dark', width: 1366, height: 768, mobile: false, lang: 'es', theme: 'dark' },
].filter((c) => !only || c.name === only);

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
const problems = [];
const shots = [];

async function runCase(c) {
  const ctx = await browser.newContext({
    viewport: { width: c.width, height: c.height },
    deviceScaleFactor: c.mobile ? 2 : 1,
    isMobile: c.mobile,
    hasTouch: c.mobile,
    locale: c.lang === 'es' ? 'es-CO' : 'en-US',
  });
  await ctx.addInitScript((theme) => {
    try {
      localStorage.setItem('bioluma.theme', theme);
    } catch {
      /* ignore */
    }
  }, c.theme);
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_CERT|fonts\.(googleapis|gstatic)|net::ERR/.test(m.text() + (m.location()?.url ?? '')))
      errors.push(`[${c.name}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${c.name}] pageerror: ${e.message}`));
  let n = 0;
  const shot = async (label) => {
    const f = `${out}/int2-${c.name}-${String(n++).padStart(2, '0')}-${label}.png`;
    await page.screenshot({ path: f });
    shots.push(f);
    return f;
  };
  const tap = async (x, y) => (c.mobile ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  /** Boxes that must never move when a layer appears (no layout shift). */
  const frame = () =>
    page.evaluate(() => {
      const r = (sel) => {
        const e = document.querySelector(sel);
        if (!e) return null;
        const b = e.getBoundingClientRect();
        return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)].join(',');
      };
      return {
        hud: r('.bl-hud'),
        dish: r('.bl-dish'),
        tabs: r('.bl-tabs'),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
  let base = null;
  /** Scroll a sheet (only its own scroll box) to an element, like a finger would; never the page. */
  const scrollSheetTo = (sel) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      let sc = el?.parentElement ?? null;
      while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
      if (el && sc) sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - 12;
    }, sel);
  const checkStable = async (label) => {
    const f = await frame();
    if (f.overflow) problems.push(`[${c.name}] ${label}: horizontal overflow`);
    if (base) for (const k of ['hud', 'dish', 'tabs']) if (f[k] !== base[k]) problems.push(`[${c.name}] ${label}: ${k} moved ${base[k]} → ${f[k]}`);
    if (base && f.hud !== base.hud) {
      // Who moved it: a container scrolled sideways (focus / scrollIntoView), or something wider than the screen.
      const who = await page.evaluate(() => {
        const out = [];
        for (let e = document.querySelector('.bl-hud'); e; e = e.parentElement)
          if (e.scrollLeft || e.scrollTop) out.push(`${e.tagName.toLowerCase()}.${[...e.classList].join('.')} scroll ${e.scrollLeft},${e.scrollTop}`);
        if (window.scrollX || window.scrollY) out.push(`window scroll ${window.scrollX},${window.scrollY}`);
        for (const e of document.querySelectorAll('body *')) {
          const r = e.getBoundingClientRect();
          if (r.width && r.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed') out.push(`wide: ${e.tagName.toLowerCase()}.${[...e.classList].join('.')} right ${Math.round(r.right)}`);
          if (out.length > 12) break;
        }
        return out;
      });
      problems.push(`[${c.name}] ${label}: ${who.join(' | ') || 'no scrolled container found'}`);
    }
  };
  const advanceStory = async () => {
    for (let i = 0; i < 40; i++) {
      const phase = await page.evaluate(() => window.bioluma.story.current()?.phase ?? null);
      if (phase !== 'lines') return phase;
      await page.evaluate(() => window.bioluma.story.advance());
      await page.waitForTimeout(60);
    }
    return 'lines';
  };

  /** Tap a control like a player: if VELA's box is over it, read her lines first. */
  const tapEl = async (loc) => {
    for (let i = 0; i < 4; i++) {
      await advanceStory();
      if (await loc.click({ timeout: 4000 }).then(() => true).catch(() => false)) return true;
    }
    return false;
  };

  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => !!window.bioluma, null, { timeout: 20000 });
  await page.waitForTimeout(600);
  const splash = page.locator('[data-testid="splash"]');
  if (await splash.isVisible().catch(() => false)) {
    await splash.click();
    await page.waitForTimeout(900);
  }
  base = await frame();

  // VELA's first lines play (the story tutorial); read them like a player would, quickly.
  await page.waitForTimeout(1500);
  await advanceStory();
  await page.waitForTimeout(400);

  // ── 1. A Momento: the first manual seed pauses and explains (zoom, spotlight, VELA's card). ──
  const dish = await page.locator('canvas.gl-dish').boundingBox();
  if (!dish) throw new Error('dish canvas not found');
  // VELA's task hint may sit where we tap: try a few open spots until a seed lands.
  for (const [fx, fy] of [
    [0.5, 0.6],
    [0.35, 0.7],
    [0.65, 0.45],
    [0.5, 0.35],
  ]) {
    await tap(dish.x + dish.width * fx, dish.y + dish.height * fy);
    await page.waitForTimeout(300);
    if (await page.evaluate(() => window.bioluma.game.view().stats.seeds > 0)) break;
  }
  // The card waits while VELA is talking: read her lines like a player while it comes.
  let opened = false;
  for (let i = 0; i < 40 && !opened; i++) {
    opened = await page.evaluate(() => window.bioluma.moments.current()?.mode === 'full' && !document.querySelector('.mo-card')?.hidden);
    if (!opened) {
      await advanceStory();
      await page.waitForTimeout(400);
    }
  }
  if (!opened) {
    const why = await page.evaluate(() => {
      const b = window.bioluma;
      return {
        seeds: b.game.view().stats.seeds,
        seen: b.moments.help().filter((e) => e.seen).map((e) => e.id),
        mode: b.moments.mode,
        busy: b.moments.isBusy(),
        current: b.moments.current()?.id ?? null,
        story: b.story.current()?.scene.id ?? null,
        phase: b.story.current()?.phase ?? null,
        enc: b.encUI.busy,
        secret: b.secretsUI.busy,
        blocked: b.ui.blocked(),
      };
    });
    problems.push(`[${c.name}] the seed Momento did not open: ${JSON.stringify(why)}`);
  }
  await page.waitForTimeout(1600); // the slow-down, the zoom and the card slide
  // Under a loaded machine the slow-down runs on fewer frames: give the pause a few more seconds to land.
  await page
    .waitForFunction(() => !window.bioluma.moments.current() || window.bioluma.game.isPaused, null, { timeout: 8000 })
    .catch(() => undefined);
  await page.evaluate(() => window.bioluma.momentsUI.debug.finishTyping());
  await page.waitForTimeout(300);
  const paused = await page.evaluate(() => ({ pausing: window.bioluma.moments.isPausing(), gamePaused: window.bioluma.game.isPaused, id: window.bioluma.moments.current()?.id ?? null }));
  if (!paused.pausing || !paused.gamePaused) problems.push(`[${c.name}] Momento open but the game is not paused: ${JSON.stringify(paused)}`);
  await shot(`moment-${paused.id ?? 'none'}`);
  await checkStable('moment card');
  const step0 = await page.evaluate(() => window.bioluma.sim.stepCount);
  await page.waitForTimeout(700);
  const step1 = await page.evaluate(() => window.bioluma.sim.stepCount);
  if (step1 !== step0) problems.push(`[${c.name}] the dish kept running under a Momento (${step0} → ${step1})`);
  const ok = page.locator('.mo-card .mo-ok');
  if (await ok.isVisible().catch(() => false)) await ok.click();
  await page.waitForTimeout(900);
  const resumed = await page.evaluate(() => window.bioluma.game.isPaused);
  if (resumed) problems.push(`[${c.name}] the game stayed paused after "¡Entendido!"`);

  // Later Momentos would interrupt the next shots: explanations off for the rest (pills still show in Era 1).
  await page.evaluate(() => window.bioluma.moments.setMode('off'));
  await advanceStory();

  // ── 2. Status pills: a few seeds (real taps), then the pills over the forming creatures. ──
  for (const [fx, fy] of [
    [0.25, 0.3],
    [0.72, 0.35],
    [0.3, 0.72],
    [0.7, 0.7],
  ]) {
    await tap(dish.x + dish.width * fx, dish.y + dish.height * fy);
    await page.waitForTimeout(220);
  }
  await page.waitForTimeout(2500);
  await advanceStory();
  await shot('status-pills');
  await checkStable('status pills');

  // ── 3. The seed price: ONE tap on the price pill opens the sheet that explains it. ──
  const pill = page.locator('.mode-pill.price');
  if (await pill.isVisible().catch(() => false)) {
    // VELA may start talking right now (her box can sit over the pill): read her lines, then tap.
    await tapEl(pill);
    await page.waitForTimeout(1200); // the sheet slides and fades in
    const open = await page.evaluate(() => window.bioluma.priceSheet.isOpen);
    if (!open) problems.push(`[${c.name}] tapping the price did not open the price sheet`);
    await shot('price-sheet');
    await checkStable('price sheet');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    if (await page.evaluate(() => window.bioluma.priceSheet.isOpen)) {
      await page.evaluate(() => window.bioluma.priceSheet.close());
      await page.waitForTimeout(400);
    }
  } else problems.push(`[${c.name}] no clickable seed price pill`);

  // ── 4. Encargo: the offer bubble hanging from the objective bar, with its progress badge. ──
  await advanceStory();
  await page.waitForFunction(() => !!window.bioluma.encargos.current(), null, { timeout: 15000 }).catch(() => problems.push(`[${c.name}] no Encargo offered`));
  await page.evaluate(() => {
    const b = window.bioluma;
    const cur = b.encargos.current();
    if (cur) {
      b.encUI.debug.hold(true);
      b.encUI.debug.offer(cur);
    }
  });
  await page.waitForTimeout(1200);
  await shot('encargo-offer');
  await checkStable('encargo offer');
  await page.evaluate(() => window.bioluma.encUI.debug.hold(false));
  await page.waitForTimeout(7000); // it tucks back into the bar
  await shot('encargo-badge');
  // "¿Por qué?": tap the badge → VELA's full dialogue.
  const badge = page.locator('.obj-slot .enc-badge');
  // Right after a completion the next request comes ~2 s later: wait for the badge to be back.
  await badge.waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
  if (await badge.isVisible().catch(() => false)) {
    await tapEl(badge);
    await page.waitForTimeout(1500);
    await shot('encargo-why');
    await checkStable('encargo why');
    await advanceStory();
    await page.waitForTimeout(600);
  } else problems.push(`[${c.name}] the Encargo badge is not in the objective bar`);
  // Completion: the celebration with its rewards (the chain advances). Wait for the next main request
  // to be offered (there is a short gap after each completion).
  await page.waitForFunction(() => !!window.bioluma.encargos.main(), null, { timeout: 12000 }).catch(() => undefined);
  const before = await page.evaluate(() => window.bioluma.encargos.chainProgress().done);
  await page.evaluate(() => window.bioluma.encargos.debug.complete());
  await page.waitForTimeout(1300);
  await shot('encargo-done');
  const after = await page.evaluate(() => window.bioluma.encargos.chainProgress().done);
  if (after <= before) problems.push(`[${c.name}] the Encargo chain did not advance (${before} → ${after})`);
  await page.waitForTimeout(4500);

  // ── 4b. The species sheet with its species card (yield equation, how to boost it), once a species is
  //        registered (real detection: it can take a while on a software GPU, so only on the first case).
  if (c === CASES[0]) {
    // A clean dish and two seeds far apart (blobs that touch melt into shapeless matter).
    await page.evaluate(() => window.bioluma.game.actions.sterilizeDish?.());
    await page.waitForTimeout(600);
    for (const [fx, fy] of [
      [0.3, 0.45],
      [0.7, 0.78],
    ]) {
      await tap(dish.x + dish.width * fx, dish.y + dish.height * fy);
      await page.waitForTimeout(300);
    }
    const got = await page
      .waitForFunction(() => window.bioluma.game.view().species.length > 0, null, { timeout: 150000, polling: 1000 })
      .then(() => true)
      .catch(() => false);
    if (got) {
      await advanceStory();
      await tapEl(page.locator('[data-tab="bestiary"]'));
      await page.waitForTimeout(700);
      await advanceStory();
      const sp = page.locator('.sp-grid .sp:not(.unknown)').first();
      if (await sp.isVisible().catch(() => false)) {
        await tapEl(sp);
        await page.waitForTimeout(1200);
        await shot('species-sheet');
        await scrollSheetTo('.spc-extras');
        await page.waitForTimeout(500);
        await shot('species-card');
        await checkStable('species sheet');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      }
    } else console.log(`[${c.name}] no species registered in time: species sheet shot skipped`);
  }

  // ── 5. The Behaviour Guide (what "swims" means and what it earns). ──
  await page.evaluate(() => window.bioluma.momentsUI.openBehaviorGuide('swimmer'));
  await page.waitForTimeout(900);
  await shot('behavior-guide');
  await checkStable('behaviour guide');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // ── 6. A secret typed for real (Konami), its reveal card over the dish. ──
  await page.locator('body').click({ position: { x: 5, y: c.height - 5 } }).catch(() => undefined);
  for (const k of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) {
    await page.keyboard.press(k);
    await page.waitForTimeout(60);
  }
  // The card waits while VELA is talking (one thing at a time): read her lines, then it shows.
  for (let i = 0; i < 30 && !(await page.locator('.bls-reveal').count()); i++) {
    await advanceStory();
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1600);
  if (!(await page.locator('.bls-reveal').count())) {
    const why = await page.evaluate(() => {
      const b = window.bioluma;
      return { found: b.secrets.list().filter((x) => x.found).map((x) => x.id), story: b.story.current()?.phase ?? null, moment: b.momentsUI.busy, card: b.secretsUI.busy };
    });
    console.log(`[${c.name}] no reveal card on screen at the shot: ${JSON.stringify(why)}`);
  }
  const konami = await page.evaluate(() => window.bioluma.secrets.isFound('konami'));
  if (!konami) problems.push(`[${c.name}] Konami did not find the secret`);
  await shot('secret-reveal');
  await checkStable('secret reveal');
  const bonus = await page.evaluate(() => window.bioluma.game.view().multipliers?.parts?.find((p) => p.id === 'secrets')?.mult ?? null);
  if (bonus !== null && !(bonus > 1)) problems.push(`[${c.name}] the secret bonus is not applied (${bonus})`);
  await page.waitForTimeout(6500);

  // ── 7. The basement (10 secrets): Settings → "Laboratorio del sótano". ──
  await page.evaluate(() => {
    const s = window.bioluma.secrets;
    for (const id of ['answer', 'logo', 'heart', 'spiral', 'halo', 'infinity', 'patience', 'shake', 'seven'])
      if (!s.isFound(id)) s.forceFind(id);
  });
  await page.waitForTimeout(400);
  // Reveal cards queue up; clear them for the Settings shot.
  await page.evaluate(() => document.querySelectorAll('.bls-reveal').forEach((e) => e.remove()));
  await tapEl(page.locator('.hud-btn').last());
  await page.waitForTimeout(700);
  const open = page.locator('[data-testid="basement-open"]');
  if (await open.isVisible().catch(() => false)) {
    await scrollSheetTo('[data-testid="basement-open"]');
    await page.waitForTimeout(300);
    await tapEl(open);
    await page.waitForTimeout(700);
    await shot('basement');
  } else problems.push(`[${c.name}] no basement entry in Settings with 10 secrets`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await ctx.close();
}

try {
  for (const c of CASES) await runCase(c);
} catch (err) {
  problems.push(String(err?.stack ?? err));
} finally {
  await browser.close();
  server.kill();
}
for (const f of shots) console.log(f);
if (errors.length) console.error('Console errors:\n' + errors.join('\n'));
if (problems.length) console.error('Problems:\n' + problems.join('\n'));
const failed = errors.length > 0 || problems.length > 0;
console.log(failed ? 'INTEGRATION2: FAIL' : 'INTEGRATION2: OK');
process.exit(failed ? 1 : 0);
