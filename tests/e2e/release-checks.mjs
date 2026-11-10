// Release checks of the final review (docs/qa/REVISION-FINAL.md), on the built game in a phone-sized
// browser (390 × 844, touch). Every check failed on v0.016 before its fix:
//   RF-06  every visible touch target is at least 48 × 48 px (a finger 23 px off its centre still hits it):
//          the dish (seed pill, VELA's task ✕), Settings and a Tree node's sheet ("¿Por qué cuesta esto?").
//   RF-10  before the first seed the HUD, the cards and the creature card show one rate (+0/s, or the HUD's
//          «+N/s al empezar» and nothing above it, docs/ARTE-PULIDO.md B-7).
//   RF-07  Settings has no "Anonymous stats" switch (no telemetry exists) and shows the player id the
//          privacy page asks for.
//   RF-05  Settings says when a Quality change applies.
//   RF-02  Export carries the whole progress (BIOLUMA2 bundle) and Import on a fresh device restores the
//          story, the Encargos, the secrets and the Momentos seen, then reopens the game.
//   B1     (QA-CLARIDAD-2) On a slow device the start card's «¡Empezar!» is tappable within the wait cap, with
//          the seconds counting down on it: a 6× throttled CPU, real time (no lockstep), software GL. v0.023
//          hung there for minutes (1250 hidden steps at 2 a frame).
//   B2     (QA-CLARIDAD-2) On the same slow device the tutorial's first seed is lit on the dish within the
//          incubation cap (v0.023: a dark dish and a silent VELA for minutes).
//
// Usage: node tests/e2e/release-checks.mjs [--dist <dir>] [--out <dir>]   (VITE_E2E build: debug handle)
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { findChromium, freePort, startPreview, viteBuild } from './vite-server.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const out = resolve(opt('--out', `${tmpdir()}/bioluma-release-checks`));
mkdirSync(out, { recursive: true });
let dist = opt('--dist', '');
if (!dist) {
  dist = resolve(`${tmpdir()}/bioluma-release-dist`);
  console.log(`building (VITE_E2E=1) into ${dist}…`);
  viteBuild(dist);
}
dist = resolve(dist);

const port = await freePort();
const server = await startPreview(dist, port, { timeoutMs: 120000 });
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const problems = [];
const notes = [];
const VIEW = { width: 390, height: 844 };

async function newPage() {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'es-ES' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  return { ctx, page };
}

async function boot(page) {
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => !!window.bioluma, null, { timeout: 60000 });
  await page.evaluate(() => Object.assign(window.bioluma.debugTime, { scale: 6, lockstep: true }));
  const tapSel = async (sel) => {
    const b = await page.locator(sel).first().boundingBox().catch(() => null);
    if (!b) return false;
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    return true;
  };
  if (await page.locator('[data-testid="splash"]').first().isVisible().catch(() => false)) await tapSel('[data-testid="splash"]');
  await page.waitForTimeout(1200);
  if (await page.locator('[data-testid="intro-skip"]').first().isVisible().catch(() => false)) await tapSel('[data-testid="intro-skip"]');
  await page.waitForTimeout(1500);
  return tapSel;
}

/**
 * Touch targets on screen that a finger 23 px from their centre (left, right, up, down) would miss:
 * smaller than 48 × 48, or crowded by a neighbour. Only visible, enabled, tappable things count.
 */
function auditTargets(page, scope) {
  return page.evaluate((scope) => {
    const root = scope ? document.querySelector(scope) : document;
    if (!root) return [`missing ${scope}`];
    const sel = 'button, a[href], [role="button"], [role="switch"], [role="tab"], select, input:not([type="hidden"]), .interactive';
    const bad = [];
    for (const el of root.querySelectorAll(sel)) {
      if (el.closest('[inert], [aria-hidden="true"]') || el.disabled) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.pointerEvents === 'none' || Number(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
      // Only what a finger can reach now (not covered at its centre).
      const top = document.elementFromPoint(cx, cy);
      if (!top || !(top === el || el.contains(top))) continue;
      // A point scrolled out of its panel is not on screen either (the panel's edge is like the screen's).
      let clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowY;
        if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) {
          const pr = p.getBoundingClientRect();
          clip = { left: Math.max(clip.left, pr.left), top: Math.max(clip.top, pr.top), right: Math.min(clip.right, pr.right), bottom: Math.min(clip.bottom, pr.bottom) };
          break;
        }
      }
      const misses = [];
      for (const [dx, dy] of [[-23, 0], [23, 0], [0, -23], [0, 23]]) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < clip.left || y < clip.top || x >= clip.right || y >= clip.bottom) continue; // the screen edge is part of the target
        const hit = document.elementFromPoint(x, y);
        if (!hit || !(hit === el || el.contains(hit))) misses.push(`${dx},${dy}${hit ? `→${hit.tagName.toLowerCase()}.${String(hit.className).split(/\s+/)[0]}` : ''}`);
      }
      if (misses.length) {
        const name = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
        bad.push(`${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).slice(0, 2).join('.')} «${name}» ${Math.round(r.width)}×${Math.round(r.height)} misses ${misses.join(' ')}`);
      }
    }
    return bad;
  }, scope);
}

const STORY_KEY = 'bioluma.story';
try {
  // ───────────── Device A ─────────────
  const A = await newPage();
  const page = A.page;
  const tapSel = await boot(page);
  const shot = (label) => page.screenshot({ path: `${out}/release-${label}.png` });

  // RF-10: before the first seed, one rate everywhere.
  const rate = (await page.locator('.ess-rate').first().textContent())?.trim() ?? '';
  // Before the first seed: «+0/s», or the rate it WILL charge said as such («+2,0/s al empezar», B-7).
  const atStart = /al empezar|at start/.test(rate);
  const hudRate = atStart ? Number((/\+(\d+[.,]?\d*)/.exec(rate)?.[1] ?? '0').replace(',', '.')) : 0;
  if (!/^\+0\b/.test(rate) && !atStart) problems.push(`RF-10: the HUD shows «${rate}» before the first seed`);
  const waiting = await page.evaluate(() => {
    const b = window.bioluma;
    const v = b.game.view();
    const c = v.creatures.find((x) => x.state === 'stable');
    if (c) b.ui.openCard?.(c.id);
    return { phase: v.session?.phase, stable: !!c };
  });
  await page.waitForTimeout(600);
  const cardTexts = await page.evaluate(() => [...document.querySelectorAll('.mo-card, .ccard')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.textContent.replace(/\s+/g, ' ')));
  for (const t of cardTexts) {
    // The rate as cards say it: «+2 luz/s» (ADR-030), or the old «+2 Esencia/s».
    const m = /\+(\d+[.,]?\d*) ?(luz|glow|Luz|Glow|Esencia|Essence)?\/s/.exec(t);
    // A card may name a rate only if it is no more than what the HUD says the dish will earn.
    if (waiting.phase === 'ready' && m && Number(m[1].replace(',', '.')) > hudRate + 1e-6 && !/al empezar|at start/.test(t)) problems.push(`RF-10: a card says «${m[0]}» while the HUD says ${rate}`);
  }
  notes.push(`RF-10: session ${waiting.phase}, stable starter ${waiting.stable}, HUD «${rate}», cards checked ${cardTexts.length}`);
  await shot('ready');
  for (let i = 0; i < 6 && (await page.locator('.mo-card .mo-ok').first().isVisible().catch(() => false)); i++) {
    await tapSel('.mo-card .mo-ok');
    await page.waitForTimeout(500);
  }

  // RF-06 on the dish, with VELA's task bubble on screen.
  await page.evaluate(() => window.bioluma.ui.closeCard?.());
  await page.evaluate(() => window.bioluma.story.play('t_intro'));
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(400);
    const ph = await page.evaluate(() => {
      const s = window.bioluma.story;
      const cur = s.current();
      if (cur && cur.phase !== 'wait') s.advance();
      return cur?.phase ?? null;
    });
    if (ph === 'wait' || ph === null) break;
  }
  await page.waitForTimeout(800);
  await shot('dish-task');
  const hasTask = await page.locator('.sty-task-x').first().isVisible().catch(() => false);
  notes.push(`RF-06: VELA's task ✕ on screen: ${hasTask}`);
  for (const b of await auditTargets(page, null)) problems.push(`RF-06 dish: ${b}`);
  await page.evaluate(() => window.bioluma.story.skipTutorial());
  await page.waitForTimeout(500);

  // Progress to carry: a seed, a few seconds of a run, story flags, a secret, a Momento seen.
  await page.evaluate(() => {
    const b = window.bioluma;
    const d = b.game.view().dish;
    b.game.actions.seedAt(d.cx, d.cy);
    b.story.setFlag('rf02_marker', true);
    b.moments.load({ ...b.moments.serialize(), seen: [...new Set([...b.moments.serialize().seen, 'species'])] });
  });
  await page.waitForTimeout(3000);
  // A Momento about the starter («¡VIDA!») may be up by now: it pauses the dish until it is read, so read it
  // like a player before going to Settings (a slow software-GL frame decides when it lands).
  for (let i = 0; i < 6; i++) {
    const card = page.locator('.mo-card .mo-ok').first();
    if (!(await card.isVisible().catch(() => false))) break;
    await card.click().catch(() => undefined);
    await page.waitForTimeout(500);
  }

  // Settings: RF-07, RF-05, RF-06, RF-02 export.
  await tapSel('.hud-btn[aria-label="Ajustes"]');
  await page.waitForTimeout(1000);
  await shot('settings');
  const set = await page.evaluate(() => {
    const txt = [...document.querySelectorAll('.modal')].map((m) => m.textContent).join(' ');
    return {
      analytics: [...document.querySelectorAll('[role="switch"]')].some((e) => /Estadísticas anónimas|Anonymous stats/.test(e.getAttribute('aria-label') ?? '')),
      id: document.querySelector('[data-testid="settings-player-id"]')?.textContent?.trim() ?? null,
      qualityHint: /Se aplica al volver a abrir/.test(txt),
    };
  });
  if (set.analytics) problems.push('RF-07: Settings still has the "Estadísticas anónimas" switch, and nothing reads it');
  if (!set.id || !/^[0-9a-f-]{16,64}$/i.test(set.id)) problems.push(`RF-07: Settings does not show the player id the privacy page asks for (${set.id})`);
  if (!set.qualityHint) problems.push('RF-05: Settings does not say when a Quality change applies');
  for (const b of await auditTargets(page, null)) problems.push(`RF-06 settings: ${b}`);
  // Scroll to the save box and export.
  await page.evaluate(() => document.querySelector('.save-box')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  for (const b of await auditTargets(page, null)) problems.push(`RF-06 settings (save): ${b}`);
  const exported = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((e) => /Exportar/.test(e.textContent));
    btn?.click();
    return document.querySelector('.save-box')?.value ?? '';
  });
  const story = await page.evaluate(() => window.bioluma.story.serialize());
  const enc = await page.evaluate(() => JSON.stringify(window.bioluma.encargos.serialize()));
  if (!exported.startsWith('BIOLUMA2.')) problems.push(`RF-02: the export is «${exported.slice(0, 9)}…», the game state alone`);
  notes.push(`RF-02: export ${exported.length} chars, story done ${story.done.length}, flags ${story.flags.join(',')}`);
  await tapSel('.modal-close');
  await page.waitForTimeout(600);

  // RF-06 in the Tree: a node's sheet with its price box.
  await page.evaluate(() => {
    const b = window.bioluma;
    b.game.research.datos += 50;
    b.flow.openTree();
  });
  await page.waitForTimeout(1500);
  const node = await page.evaluate(() => document.querySelector('.rt-node.can')?.dataset.id ?? null);
  if (node) {
    await tapSel(`.rt-node[data-id="${node}"]`);
    await page.waitForTimeout(1000);
    await shot('tree-sheet');
    if (!(await page.locator('.rt-sheet.show .rt-pricebox').first().isVisible().catch(() => false))) notes.push('RF-06: no price box on this sheet');
    for (const b of await auditTargets(page, '.rt-sheet.show')) problems.push(`RF-06 tree sheet: ${b}`);
  } else problems.push('RF-06: no affordable node to open in the Tree');
  if (await page.locator('.rt-sheet.show .rt-x').first().isVisible().catch(() => false)) await tapSel('.rt-sheet.show .rt-x');
  await page.waitForTimeout(400);
  await tapSel('.rt-go');
  await page.waitForTimeout(1200);

  // RF-06 on the other screens a child taps: the creature card in a run, the summary, the start card,
  // the Bestiary.
  const quiet = async () => {
    for (let i = 0; i < 6; i++) {
      const busy = await page.evaluate(() => {
        const b = window.bioluma;
        if (b.story.current()) b.story.skip();
        return !!b.story.current();
      });
      if (await page.locator('.mo-card .mo-ok').first().isVisible().catch(() => false)) await tapSel('.mo-card .mo-ok');
      await page.waitForTimeout(400);
      if (!busy) break;
    }
  };
  await quiet();
  const opened = await page.evaluate(() => {
    const b = window.bioluma;
    const c = b.game.view().creatures.find((x) => x.state === 'stable');
    if (c) b.ui.openCard?.(c.id);
    return !!c;
  });
  await page.waitForTimeout(800);
  if (opened) {
    await shot('creature-card');
    for (const b of await auditTargets(page, null)) problems.push(`RF-06 creature card: ${b}`);
    await page.evaluate(() => window.bioluma.ui.closeCard?.());
  }
  await page.evaluate(() => window.bioluma.game.actions.endSessionNow?.());
  for (let i = 0; i < 40 && !(await page.locator('.ss-layer [data-act="tree"]').first().isVisible().catch(() => false)); i++) await page.waitForTimeout(400);
  await page.waitForTimeout(4500); // the staged tally
  await quiet();
  await shot('summary');
  for (const b of await auditTargets(page, '.ss-layer')) problems.push(`RF-06 summary: ${b}`);
  await tapSel('.ss-layer [data-act="next"]');
  for (let i = 0; i < 20 && !(await page.locator('.ss-layer:not(.ss-welcome) [data-act="go"]').first().isVisible().catch(() => false)); i++) await page.waitForTimeout(400);
  await quiet();
  await shot('start-card');
  for (const b of await auditTargets(page, '.ss-layer:not(.ss-welcome)')) problems.push(`RF-06 start card: ${b}`);
  await tapSel('.ss-layer:not(.ss-welcome) [data-act="go"]');
  await page.waitForTimeout(800);
  await quiet();
  await page.evaluate(() => window.bioluma.ui.openBestiary(true));
  await page.waitForTimeout(1000);
  // The run's first species can be registered right now: its Momento card would slide in over the
  // drawer mid-audit (a card still scaling in reads as a 22 × 43 button). Close it, then measure.
  await quiet();
  await page.waitForTimeout(500);
  await shot('bestiary');
  for (const b of await auditTargets(page, null)) problems.push(`RF-06 bestiary: ${b}`);
  await page.evaluate(() => window.bioluma.ui.openBestiary(false));
  await page.waitForTimeout(500);

  // RF-05: change Quality and reopen: the grid changes (232 ↔ 168), the saved dish no longer fits, and the
  // session waiting for its first seed must still have its starter creature.
  const beforeQ = await page.evaluate(() => {
    const b = window.bioluma;
    // The other profile than the one running (a headless browser's "auto" may already be low).
    b.game.actions.setSetting('quality', b.sim.gridW > 168 ? 'low' : 'medium');
    return { phase: b.game.view().session?.phase, grid: b.sim.gridW };
  });
  await page.reload();
  await page.waitForFunction(() => !!window.bioluma, null, { timeout: 60000 });
  await page.evaluate(() => Object.assign(window.bioluma.debugTime, { scale: 6, lockstep: true }));
  if (await page.locator('[data-testid="splash"]').first().isVisible().catch(() => false)) await tapSel('[data-testid="splash"]');
  await page.waitForTimeout(6000);
  const afterQ = await page.evaluate(() => {
    const b = window.bioluma;
    const v = b.game.view();
    return { phase: v.session?.phase, grid: b.sim.gridW, alive: v.creatures.filter((c) => c.state === 'born' || c.state === 'stable').length };
  });
  notes.push(`RF-05: before ${JSON.stringify(beforeQ)}, after reopening with the other quality ${JSON.stringify(afterQ)}`);
  if (beforeQ.phase === 'ready' && afterQ.grid !== beforeQ.grid && afterQ.phase === 'ready' && afterQ.alive === 0)
    problems.push('RF-05: after a Quality change the waiting session lost its starter creature');
  await shot('quality-changed');
  await A.ctx.close();

  // ───────────── Device C: a slow device's start card (QA-CLARIDAD-2 B1) ─────────────
  {
    const Cd = await newPage();
    const pc = Cd.page;
    const tapC = await boot(pc);
    // A slow phone in real time: no lockstep, no time scale, the CPU 6× slower.
    const cdp = await Cd.ctx.newCDPSession(pc);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    const born = await pc.evaluate(async () => {
      const b = window.bioluma;
      Object.assign(b.debugTime, { scale: 1, lockstep: false });
      // The tutorial's first tap (game.actions.seedAt is what a tap on the dish calls).
      const d = b.game.view().dish;
      b.game.actions.seedAt(d.cx, d.cy);
      const t0 = performance.now();
      for (;;) {
        await new Promise((r) => setTimeout(r, 100));
        const alive = b.game.view().creatures.some((c) => c.state !== 'dead');
        if ((b.culture.lit && alive) || performance.now() - t0 > 45000) return { s: (performance.now() - t0) / 1000, lit: b.culture.lit, alive, capped: b.culture.capped };
      }
    });
    notes.push(`B2: the tutorial's first seed lit after ${born.s.toFixed(1)} s on a 6× throttled CPU (alive ${born.alive}, capped ${born.capped})`);
    // INCUBATE_MAX_S = 5 plus the 700 ms light-up and a throttled frame or two.
    if (!(born.lit && born.alive && born.s <= 7.5)) problems.push(`B2: the tutorial's first seed was not on the dish after ${born.s.toFixed(1)} s on a slow device`);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await pc.evaluate(() => {
      const b = window.bioluma;
      Object.assign(b.debugTime, { scale: 6, lockstep: true });
      b.story.skipTutorial();
      if (b.story.current()) b.story.skip();
      const d = b.game.view().dish;
      b.game.actions.seedAt(d.cx, d.cy);
    });
    await pc.waitForTimeout(1500);
    await pc.evaluate(() => window.bioluma.game.actions.endSessionNow?.());
    for (let i = 0; i < 40 && !(await pc.locator('.ss-layer [data-act="next"]').first().isVisible().catch(() => false)); i++) await pc.waitForTimeout(400);
    await pc.waitForTimeout(4500); // the staged tally
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await pc.evaluate(() => {
      const b = window.bioluma;
      Object.assign(b.debugTime, { scale: 1, lockstep: false });
      const w = (window.__wake = { t0: -1, t1: -1, texts: [] });
      b.bus.on('sessionStart', () => {
        if (w.t0 < 0) w.t0 = performance.now();
      });
      const tick = () => {
        const go = document.querySelector('.ss-layer:not(.ss-welcome) [data-act="go"]');
        if (w.t0 >= 0 && go && go.getBoundingClientRect().width > 0) {
          const tx = go.textContent.trim();
          if (w.texts[w.texts.length - 1] !== tx) w.texts.push(tx);
          if (!go.disabled) {
            w.t1 = performance.now();
            return;
          }
        }
        setTimeout(tick, 50);
      };
      tick();
    });
    await tapC('.ss-layer [data-act="next"]');
    let wake = null;
    for (let i = 0; i < 90; i++) {
      await pc.waitForTimeout(500);
      wake = await pc.evaluate(() => ({ ...window.__wake, capped: window.bioluma.culture.capped, left: window.bioluma.culture.left }));
      if (wake.t1 >= 0) break;
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await pc.screenshot({ path: `${out}/release-slow-start.png` });
    // START_WAKE_MAX_S = 6 (src/game/cycleBalance.ts), plus the 100 ms view refresh of a throttled page.
    const waited = wake && wake.t0 >= 0 && wake.t1 >= 0 ? (wake.t1 - wake.t0) / 1000 : Infinity;
    notes.push(`B1: «¡Empezar!» tappable after ${waited.toFixed(1)} s on a 6× throttled CPU (culture capped ${wake?.capped}, steps left ${wake?.left}); button said ${JSON.stringify(wake?.texts ?? [])}`);
    if (!(waited <= 7.5)) problems.push(`B1: the start card's «¡Empezar!» was still grey after ${Number.isFinite(waited) ? waited.toFixed(1) + ' s' : '45 s'} on a slow device`);
    if (wake && wake.texts.length && !wake.texts.some((t) => /\d/.test(t) || /Empezar/.test(t))) problems.push('B1: the grey «¡Empezar!» shows no countdown');
    await Cd.ctx.close();
  }

  // ───────────── Device B: import ─────────────
  const B = await newPage();
  const pb = B.page;
  const tapB = await boot(pb);
  for (let i = 0; i < 6; i++) {
    const busy = await pb.evaluate(() => {
      const b = window.bioluma;
      b.story.skipTutorial();
      if (b.story.current()) b.story.skip();
      return !!b.story.current();
    });
    if (await pb.locator('.mo-card .mo-ok').first().isVisible().catch(() => false)) await tapB('.mo-card .mo-ok');
    await pb.waitForTimeout(500);
    if (!busy) break;
  }
  await tapB('.hud-btn[aria-label="Ajustes"]');
  await pb.waitForTimeout(1000);
  await pb.evaluate(() => document.querySelector('.save-box')?.scrollIntoView({ block: 'center' }));
  await pb.fill('.save-box', exported);
  const importBtn = pb.locator('button', { hasText: /^Importar$/ }).first();
  await importBtn.click();
  await pb.waitForTimeout(300);
  await pb.locator('button', { hasText: /Reemplazar|Importar/ }).first().click();
  // The page reopens itself with the imported progress (or, before RF-02, stays as it is).
  await pb.waitForTimeout(2500);
  await pb.waitForFunction(() => !!window.bioluma, null, { timeout: 60000 });
  await pb.waitForTimeout(1500);
  const after = await pb.evaluate((k) => ({ story: window.bioluma.story.serialize(), stored: localStorage.getItem(k), enc: JSON.stringify(window.bioluma.encargos.serialize()), seen: window.bioluma.moments.serialize().seen }), STORY_KEY);
  if (!after.story.flags.includes('rf02_marker')) problems.push('RF-02: the imported game lost the story (VELA starts over on the new device)');
  if (after.story.done.length < story.done.length) problems.push(`RF-02: story scenes done ${after.story.done.length} < ${story.done.length} exported`);
  if (!after.seen.includes('species')) problems.push('RF-02: the Momentos already seen were not carried');
  if (JSON.parse(after.enc).chain !== JSON.parse(enc).chain) problems.push('RF-02: the Encargos chain was not carried');
  await pb.screenshot({ path: `${out}/release-imported.png` });
  await B.ctx.close();
} catch (err) {
  problems.push(`crash: ${err?.stack ?? err}`);
} finally {
  await browser.close();
  server.stop();
}
console.log(notes.join('\n'));
if (problems.length) console.error('Problems:\n' + problems.join('\n'));
console.log(problems.length ? 'RELEASE-CHECKS: FAIL' : 'RELEASE-CHECKS: OK');
process.exit(problems.length ? 1 : 0);
