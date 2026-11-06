// One layer at a time (QA4 F-01, F-06, F-03): a player who never taps VELA's bubble must still be able
// to tap every primary button of the session screens with ONE tap. Checks with elementFromPoint at the
// centre of each button: the summary ("Ir al Árbol", "Nueva sesión"), the Tree ("Comprar", the night's
// sheet, "Nueva sesión"), the start card ("¡Empezar!") and the seed bar while a session runs, with VELA
// scenes forced on screen at the worst moments (a chain of lines and a story choice over the summary, a
// world scene over the night sheet). Also: buying from the Tree opened with the dock before the run
// keeps the Tree open (F-06), and the "Toca la placa" task never outlives the first tap (F-03).
// Polish-pass owner bugs (docs/ARTE-PULIDO.md B-10): «¿Por qué?» unfolds in the same sheet without
// repeating it; the night's sheet stays clear and full-colour under VELA, its counters never overflow;
// the spotlight never points at a button the open Bestiary covers; a tapped toast closes.
// Clarity pass 2 (ADR-030, docs/CLARIDAD2.md): session 1 starts on an empty dish and its clock waits for VELA
// (a player who never taps her bubble still gets it); the clock stands still while VELA talks; QA#17 a tap
// that closes VELA's line over the dock never buys Nutrientes; QA#29 buying Nutrientes keeps the dock's
// three cells in place.
//
// Usage: node tests/e2e/layers.mjs [--dist <dir>] [--out <dir>] [--only mobile|desktop]
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const out = resolve(opt('--out', `${tmpdir()}/bioluma-layers`));
const only = opt('--only', '');
mkdirSync(out, { recursive: true });
let dist = opt('--dist', '');
if (!dist) {
  dist = resolve(`${tmpdir()}/bioluma-layers-dist`);
  console.log(`building (VITE_E2E=1) into ${dist}…`);
  const b = spawnSync('npx', ['vite', 'build', '--outDir', dist, '--emptyOutDir'], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, VITE_E2E: '1' } });
  if (b.status !== 0) throw new Error('build failed');
}
dist = resolve(dist);

function findChromium() {
  const base = '/opt/pw-browsers';
  for (const d of readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    for (const sub of ['chrome-linux', 'chrome-linux64']) {
      const p = `${base}/${d}/${sub}/chrome`;
      if (existsSync(p)) return p;
    }
  }
  throw new Error('chromium not found under /opt/pw-browsers');
}

const port = 7900 + Math.floor(Math.random() * 600);
// The project's own vite when installed: `npx` may first ask the registry and miss the start window.
const localVite = existsSync('node_modules/.bin/vite') ? 'node_modules/.bin/vite' : null;
const server = spawn(localVite ?? 'npx', [...(localVite ? [] : ['vite']), 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('preview did not start')), 120000);
  server.stdout.on('data', (d) => String(d).includes(String(port)) && (clearTimeout(t), res()));
});
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

const CASES = [
  { name: 'mobile', width: 390, height: 844, mobile: true },
  { name: 'desktop', width: 1366, height: 768, mobile: false },
].filter((c) => !only || c.name === only);

const problems = [];
const notes = [];

async function runCase(c) {
  const ctx = await browser.newContext({ viewport: { width: c.width, height: c.height }, deviceScaleFactor: 1, isMobile: c.mobile, hasTouch: c.mobile, locale: 'es-ES' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${c.name}] pageerror: ${e.message}`));
  const say = (s) => notes.push(`[${c.name}] ${s}`);
  const shot = (label) => page.screenshot({ path: `${out}/layers-${c.name}-${label}.png` });
  const tap = async (x, y) => (c.mobile ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const box = (sel) => page.locator(sel).first().boundingBox().catch(() => null);
  const visible = (sel) => page.locator(sel).first().isVisible().catch(() => false);
  /** What a finger at the centre of `sel` would hit: '' when it is the element itself, else the cover. */
  const cover = (sel) =>
    page.evaluate((sel) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0);
      if (!el) return `missing ${sel}`;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (hit && (hit === el || el.contains(hit))) return '';
      return hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).trim().split(/\s+/).join('.')} «${(hit.textContent ?? '').trim().slice(0, 40)}»` : 'nothing';
    }, sel);
  const mustHit = async (sel, label) => {
    const cv = await cover(sel);
    if (cv) {
      problems.push(`[${c.name}] ${label}: ${sel} is covered by ${cv}`);
      await shot(`covered-${label.replace(/\W+/g, '-')}`);
    } else say(`${label}: ${sel} tappable`);
  };
  const tapSel = async (sel) => {
    const b = await box(sel);
    if (!b) return false;
    await tap(b.x + b.width / 2, b.y + b.height / 2);
    return true;
  };
  const state = () =>
    page.evaluate(() => {
      const b = window.bioluma;
      const v = b.game.view();
      return { phase: v.session?.phase ?? null, n: v.session?.n ?? 0, datos: v.research?.datos ?? 0, tree: b.flow.treeOpen, scene: b.story.current()?.scene.id ?? null, scenePhase: b.story.current()?.phase ?? null };
    });
  const closeMoments = async () => {
    for (let i = 0; i < 6; i++) {
      if (!(await visible('.mo-card .mo-ok'))) return;
      await tapSel('.mo-card .mo-ok');
      await page.waitForTimeout(500);
    }
  };
  const dishPoint = async (fx, fy) =>
    page.evaluate(
      ([fx, fy]) => {
        const b = window.bioluma;
        const d = b.game.view().dish;
        const p = b.ui.gridToClient(d.cx + (fx - 0.5) * d.radius * 1.2, d.cy + (fy - 0.5) * d.radius * 1.2);
        return p;
      },
      [fx, fy],
    );

  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => !!window.bioluma, null, { timeout: 60000 });
  await page.evaluate(() => Object.assign(window.bioluma.debugTime, { scale: 6, lockstep: true }));
  if (await visible('[data-testid="splash"]')) await tapSel('[data-testid="splash"]');
  await page.waitForTimeout(1200);
  if (await visible('[data-testid="intro-skip"]')) await tapSel('[data-testid="intro-skip"]');
  await page.waitForTimeout(1500);
  // F-07: nothing died before the first seed.
  const faded = await page.evaluate(() => window.bioluma.moments.current()?.id ?? null);
  if (faded === 'dissolve') problems.push(`[${c.name}] "Se apagó" before any seed (F-07)`);

  // F-20: before the first seed nothing is earned, and the HUD says so.
  const rate = await page.locator('.ess-rate').first().textContent();
  // Nothing is earned yet: «+0/s», or the rate it will charge said as such («+2/s al empezar», B-7).
  if (!/^\+0\b|al empezar|at start/.test((rate ?? '').trim())) problems.push(`[${c.name}] the HUD shows «${rate}» before the first seed (F-20)`);
  // ── Session 1, never tapping VELA's bubble ──
  await page.evaluate(() => {
    window.__blocked = [];
    window.bioluma.bus.on('seedBlocked', (p) => window.__blocked.push(p.reason));
  });
  // ADR-031: a player sows with the Sembrar button (a tap on the dish never sows).
  for (let k = 0; k < 4; k++) {
    await closeMoments();
    if (!(await tapSel('[data-testid="sow"]'))) problems.push(`[${c.name}] session 1: no Sembrar button to sow with (ADR-031)`);
    await page.waitForTimeout(1200);
    if ((await state()).phase === 'running' || (await page.evaluate(() => window.bioluma.game.view().stats.seeds > 0))) break;
    say(`Sembrar ${k + 1} refused: ${await page.evaluate(() => window.__blocked.join(',') + ' moment=' + (window.bioluma.moments.current()?.id ?? '-'))}`);
  }
  // ADR-030 §2.4: the first seed plants the first creature and the clock waits for VELA's «Tu reloj empieza
  // ahora». A player who never taps her bubble still gets the clock (her lines close on their own, or the
  // tutorial's failsafe starts it).
  for (let i = 0; i < 150 && (await state()).phase === 'ready'; i++) {
    await closeMoments();
    await page.waitForTimeout(400);
  }
  let s = await state();
  if (s.phase !== 'running') problems.push(`[${c.name}] the clock never started after the first tap (${JSON.stringify(s)})`);
  // F-03: the tap the tutorial asked for ends its task (no "¡Toca la placa!" loop).
  if (s.scene === 't_intro') problems.push(`[${c.name}] VELA still asks to tap the dish after the first tap (F-03)`);
  // A chain of lines over the running clock: the clock waits while VELA talks (ADR-030 §2.3, QA#7), so a
  // session can never run out behind her bubble.
  await page.evaluate(() => window.bioluma.story.play('t_essence'));
  await page.waitForTimeout(900);
  const elapsed = () => page.evaluate(() => window.bioluma.game.view().session?.elapsed ?? 0);
  const e0 = await elapsed();
  await page.waitForTimeout(2500);
  const e1 = await elapsed();
  const talking = await page.evaluate(() => window.bioluma.story.current()?.phase === 'lines');
  if (talking && Math.abs(e1 - e0) > 0.05) problems.push(`[${c.name}] the clock ran ${(e1 - e0).toFixed(2)} s while VELA talked (ADR-030 §2.3)`);
  else if (talking) say('the clock stands still while VELA talks');
  await page.evaluate(() => window.bioluma.story.current() && window.bioluma.story.skip());
  for (let i = 0; i < 200 && (await state()).phase !== 'over'; i++) {
    await closeMoments();
    await page.waitForTimeout(400);
  }
  for (let i = 0; i < 40 && !(await visible('.ss-layer [data-act="tree"]')); i++) await page.waitForTimeout(400);
  await page.waitForTimeout(4500); // the staged tally
  // Worse: a story choice too.
  await page.evaluate(() => window.bioluma.story.play('a1_night'));
  await page.waitForTimeout(800);
  await shot('summary');
  await mustHit('.ss-layer [data-act="tree"]', 'summary 1');
  await mustHit('.ss-layer [data-act="next"]', 'summary 1');
  // One tap opens the Tree.
  await tapSel('.ss-layer [data-act="tree"]');
  await page.waitForTimeout(1200);
  if (!(await state()).tree) problems.push(`[${c.name}] one tap on "Ir al Árbol" did not open the Tree (F-01)`);
  await shot('tree');
  // F-11: the first visit points at a green node; a tap anywhere on the tree opens it.
  const guide = await page.evaluate(() => document.querySelector('.rt-node.guide')?.dataset.id ?? null);
  if (!guide || !(await page.evaluate(() => !!document.querySelector('.rt.rt-first')))) problems.push(`[${c.name}] first Tree visit: no hand on a green node (F-11)`);
  else {
    const empty = await page.evaluate(() => {
      const vp = document.querySelector('.rt-vp').getBoundingClientRect();
      for (let y = vp.bottom - 60; y > vp.top + 120; y -= 23)
        for (let x = vp.left + 20; x < vp.right - 20; x += 31) {
          const e = document.elementFromPoint(x, y);
          if (e && e.closest('.rt-vp') && !e.closest('.rt-node') && !e.closest('button')) return { x, y };
        }
      return null;
    });
    if (empty) {
      await tap(empty.x, empty.y);
      await page.waitForTimeout(800);
      const sel = await page.evaluate(() => document.querySelector('.rt-node.sel')?.dataset.id ?? null);
      if (sel !== guide) problems.push(`[${c.name}] first Tree visit: a tap on the tree opened «${sel}», not the green node «${guide}» (F-11)`);
      else say(`first Tree visit: the hand points at «${guide}»; a tap anywhere opens it`);
      await shot('tree-guide');
      if (await visible('.rt-sheet.show .rt-x')) await tapSel('.rt-sheet.show .rt-x');
      await page.waitForTimeout(400);
    }
  }
  // The Tree scene docks at the top: a node's sheet stays usable under it.
  await page.evaluate(() => window.bioluma.story.play('t_world'));
  await page.waitForTimeout(800);
  // Nodes a finger can reach: below the bars (and VELA docked there), above the sheet.
  const reachable = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.rt-node.can')]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return !!hit && e.contains(hit);
        })
        .map((e) => e.dataset.id),
    );
  await page.waitForTimeout(1200);
  const can = await reachable();
  if (can.length) {
    await tapSel(`.rt-node[data-id="${can[0]}"]`);
    await page.waitForTimeout(900);
    await shot('tree-sheet');
    await mustHit('.rt-sheet.show .rt-buy', 'tree sheet');
    await mustHit('.rt-sheet.show .rt-x', 'tree sheet');
    const before = (await state()).datos;
    await tapSel('.rt-sheet.show .rt-buy');
    await page.waitForTimeout(900);
    if ((await state()).datos >= before) problems.push(`[${c.name}] one tap on "Comprar" did not buy (${before} Datos)`);
  } else problems.push(`[${c.name}] no affordable node after session 1`);
  // F-21: five quick buys; the sheet always shows the node's real level and its × closes it.
  await page.evaluate(() => {
    const b = window.bioluma;
    b.game.research.datos += 200;
    b.flow.openTree();
  });
  for (let i = 0; i < 5; i++) {
    const id = await page.evaluate(() => document.querySelector('.rt-node.can')?.dataset.id ?? null);
    if (!id) break;
    await tapSel(`.rt-node[data-id="${id}"]`);
    await page.waitForTimeout(150);
    await tapSel('.rt-sheet.show .rt-buy');
    await page.waitForTimeout(150);
    const ok = await page.evaluate((id) => {
      const lv = window.bioluma.game.research.levels[id] ?? 0;
      const chip = document.querySelector('.rt-sheet.show .rt-chip.lv')?.textContent ?? '';
      return { lv, chip, sel: document.querySelector('.rt-sheet.show h3, .rt-sheet.show .rt-name')?.textContent ?? '' };
    }, id);
    if (ok.chip && !ok.chip.includes(String(ok.lv))) problems.push(`[${c.name}] quick buys: the sheet of «${id}» says «${ok.chip}», the node is at level ${ok.lv} (F-21)`);
  }
  await shot('quick-buys');
  if (await visible('.rt-sheet.show .rt-x')) {
    await mustHit('.rt-sheet.show .rt-x', 'sheet after quick buys');
    await tapSel('.rt-sheet.show .rt-x');
    await page.waitForTimeout(500);
    if (await visible('.rt-sheet.show')) problems.push(`[${c.name}] the sheet's × did not close it after quick buys (F-21)`);
  }
  await page.waitForTimeout(500);
  // ── Owner bugs of the polish pass (docs/ARTE-PULIDO.md B-10), each failed on v0.018 ──
  // B-10.5: «¿Por qué cuesta esto?» unfolds in the same sheet (never a second, stacked sheet) and says
  // something the sheet does not.
  {
    // A node a finger can reach (not under VELA's docked bubble or the bars).
    const id = await page.evaluate(
      () =>
        [...document.querySelectorAll('.rt-node.st-available:not([data-id="lab"]), .rt-node.can:not([data-id="lab"]), .rt-node.st-owned:not([data-id="lab"]):not(.max)')].find((e) => {
          const r = e.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return !!hit && e.contains(hit);
        })?.dataset.id ?? null,
    );
    if (id) {
      await tapSel(`.rt-node[data-id="${id}"]`);
      await page.waitForTimeout(700);
      // A player scrolls the sheet down to it.
      await page.evaluate(() => document.querySelector('.rt-sheet.show .rt-pricebox')?.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(250);
      await tapSel('.rt-sheet.show .rt-pricebox');
      await page.waitForTimeout(500);
      const why = await page.evaluate(() => {
        const sheet = document.querySelector('.rt-sheet.show');
        const fold = sheet?.querySelector('.rt-why');
        const stacked = [...document.querySelectorAll('.pp-layer, .mo-price, .pp-sheet')].filter((e) => e.getBoundingClientRect().height > 0 && !e.closest('[hidden]')).length;
        const body = [...(sheet?.querySelectorAll('.rt-desc, .rt-ba b, .rt-have .why') ?? [])].map((e) => e.textContent.trim().toLowerCase());
        const said = [...(fold?.querySelectorAll('.rt-why-row p') ?? [])].map((e) => e.textContent.trim().toLowerCase());
        return { fold: !!fold, stacked, repeats: said.filter((t) => body.includes(t)) };
      });
      await shot('tree-why');
      if (!why.fold) problems.push(`[${c.name}] «¿Por qué cuesta esto?» did not unfold inside the node sheet (B-10.5)`);
      if (why.stacked) problems.push(`[${c.name}] «¿Por qué?» opened a second sheet over the node sheet (B-10.5)`);
      if (why.repeats.length) problems.push(`[${c.name}] «¿Por qué?» repeats the sheet: ${why.repeats.join(' | ')} (B-10.5)`);
      else if (why.fold) say('«¿Por qué?» unfolds in place and repeats nothing');
      // Its × scrolled away with the explanation: close it as a player who scrolled back would.
      await page.evaluate(() => document.querySelector('.rt-sheet.show .rt-x')?.click());
      await page.waitForTimeout(500);
    }
  }
  // B-4: one press gesture: a finger down on a node sinks it within a frame (an animation of scale or
  // transform), and it springs back on release.
  {
    const pressed = await page.evaluate(async () => {
      const n = document.querySelector('.rt-node:not([hidden])');
      if (!n) return null;
      const r = n.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, pointerId: 77, pointerType: 'touch', clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, isPrimary: true };
      n.dispatchEvent(new PointerEvent('pointerdown', o));
      await new Promise((res) => requestAnimationFrame(() => res(null)));
      const anims = n.getAnimations().map((a) => JSON.stringify(a.effect?.getKeyframes?.() ?? []));
      n.dispatchEvent(new PointerEvent('pointercancel', o));
      return anims.some((k) => /scale|transform/.test(k));
    });
    if (pressed === false) problems.push(`[${c.name}] pressing a Tree node does not animate it (B-4)`);
  }
  // B-10.2: the night's sheet with VELA talking over the Tree: VELA docks above, nothing dims the sheet,
  // «Empezar la Noche 2» is the sheet's own, full-colour, tappable button.
  const sessionsBefore = await page.evaluate(() => {
    const b = window.bioluma;
    const n = b.game.research.sessions;
    b.game.research.sessions = Math.max(n, 40);
    return n;
  });
  await page.evaluate(() => window.bioluma.flow.openTree());
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('.rt-node[data-id="lab"]')?.click());
  await page.waitForTimeout(800);
  await page.evaluate(() => window.bioluma.story.play('t_world'));
  await page.waitForTimeout(1500);
  await shot('night-sheet-vela');
  const night = await page.evaluate(() => {
    const btn = document.querySelector('.rt-sheet.show .rt-buy[data-buy="lab"], .rt-sheet.show .rt-notyet');
    if (!btn) return { missing: true };
    const r = btn.getBoundingClientRect();
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    let op = 1;
    for (let e = btn; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
    let dim = 0;
    const spot = document.querySelector('canvas.sty-spot');
    const wrap = document.querySelector('.sty-spotwrap');
    if (spot && spot.width && wrap && Number(getComputedStyle(wrap).opacity) > 0.01) {
      const sr = spot.getBoundingClientRect();
      const k = spot.width / sr.width;
      dim = spot.getContext('2d').getImageData(Math.round((cx - sr.x) * k), Math.round((cy - sr.y) * k), 1, 1).data[3];
    }
    return {
      hit: !!hit && (hit === btn || btn.contains(hit)),
      cover: hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).split(' ')[0]}` : 'nothing',
      op,
      dim,
      scrim: !!document.querySelector('.sty-scrim.show'),
      text: btn.textContent.trim(),
      ready: btn.classList.contains('rt-buy'),
      scene: window.bioluma.story.current()?.scene.id ?? null,
    };
  });
  if (night.missing) problems.push(`[${c.name}] the night sheet has no main button (B-10.2)`);
  else {
    if (!night.hit) problems.push(`[${c.name}] the night's button is covered by ${night.cover} with VELA talking (B-10.2)`);
    if (night.op < 0.99) problems.push(`[${c.name}] the night's button is faded (opacity ${night.op.toFixed(2)}) (B-10.2)`);
    if (night.dim > 8 || night.scrim) problems.push(`[${c.name}] VELA dims the night sheet (spotlight alpha ${night.dim}, scrim ${night.scrim}) (B-10.2)`);
    if (night.ready && !/Noche|Night/.test(night.text)) problems.push(`[${c.name}] the night's button says «${night.text}» (B-10.2)`);
    say(`night sheet with VELA (${night.scene}): «${night.text}» tappable=${night.hit} opacity=${night.op.toFixed(2)} dim=${night.dim}`);
    const counters = await page.evaluate(() => [...document.querySelectorAll('.rt-sheet.show .rt-gatebar b')].map((b) => b.textContent.trim()));
    for (const t of counters) {
      const m = /(\d+)\/(\d+)/.exec(t);
      if (m && Number(m[1]) > Number(m[2])) problems.push(`[${c.name}] a night counter overflows: «${t}» (B-10.3)`);
    }
  }
  await page.evaluate((n) => {
    const b = window.bioluma;
    if (b.story.current()) b.story.skip();
    b.game.research.sessions = n;
  }, sessionsBefore);
  await page.evaluate(() => document.querySelector('.rt-sheet.show .rt-x')?.click());
  await page.waitForTimeout(500);
  await mustHit('.rt-go', 'tree');
  await tapSel('.rt-go');
  await page.waitForTimeout(1500);

  // ── Start card of session 2 with a scene forced on ──
  await page.evaluate(() => window.bioluma.story.play('a1_committee'));
  await page.waitForTimeout(800);
  for (let i = 0; i < 10 && !(await visible('.ss-layer:not(.ss-welcome) [data-act="go"]')); i++) await page.waitForTimeout(400);
  await shot('start-card');
  await mustHit('.ss-layer:not(.ss-welcome) [data-act="go"]', 'start card 2');
  // QA#14 (docs/CLARIDAD2.md §2.12): «¡Empezar!» waits until the Nevera's creature is lit on the dish (a
  // software-rendered test browser incubates slowly); a player taps it once it is enabled.
  const goReady = await page
    .waitForFunction(() => {
      const b = document.querySelector('.ss-layer:not(.ss-welcome) [data-act="go"]');
      return !!b && !b.disabled;
    }, null, { timeout: 180000, polling: 250 })
    .then(() => true, () => false);
  if (!goReady) problems.push(`[${c.name}] start card 2: «¡Empezar!» never enabled (the dish never lit)`);
  await tapSel('.ss-layer:not(.ss-welcome) [data-act="go"]');
  await page.waitForTimeout(800);
  // F-06: the Tree from the dock before the first seed; buying keeps it open.
  // Whatever VELA starts now (the Bestiary lesson opens the drawer): the rest of the tutorial is skipped
  // here (its layering was checked above), the drawer closed.
  for (let i = 0; i < 8; i++) {
    const busy = await page.evaluate(() => {
      const b = window.bioluma;
      b.story.skipTutorial();
      if (b.story.current()) b.story.skip();
      if (b.ui.drawerOpen) b.ui.openBestiary(false);
      return !!b.story.current() || b.ui.drawerOpen;
    });
    await closeMoments();
    await page.waitForTimeout(500);
    if (!busy) break;
  }
  if (await tapSel('.dock-tree')) {
    await page.waitForTimeout(1200);
    for (let k = 0; k < 2; k++) {
      await page.waitForTimeout(600);
      const id = (await reachable())[0];
      if (!id) break;
      await tapSel(`.rt-node[data-id="${id}"]`);
      await page.waitForTimeout(800);
      await tapSel('.rt-sheet.show .rt-buy');
      await page.waitForTimeout(1200);
      const st = await state();
      if (!st.tree) {
        problems.push(`[${c.name}] buying «${id}» from the Tree opened with the dock closed the Tree (F-06)`);
        break;
      } else say(`bought «${id}» from the dock's Tree; the Tree stays open`);
      if (await visible('.ss-layer:not(.ss-welcome) [data-act="go"]')) problems.push(`[${c.name}] the start card came back after a buy (F-06)`);
      if (k === 0) await shot('dock-tree-bought');
      if (await visible('.rt-sheet.show .rt-x')) await tapSel('.rt-sheet.show .rt-x');
    }
    // Back to the dish with the Tree's own button ("A la placa"): the run waits, no new session.
    const label = (await page.locator('.rt-go').first().textContent())?.trim();
    if (!/placa|dish/i.test(label ?? '')) problems.push(`[${c.name}] the dock's Tree button says «${label}», not "A la placa" (F-06)`);
    await page.waitForTimeout(400);
    await tapSel('.rt-go');
    await page.waitForTimeout(800);
    const back = await state();
    await page.evaluate(() => {
      const f = window.bioluma.flow;
      const o = f.openTree.bind(f);
      window.__treeOpens = [];
      window.__clicks = [];
      document.addEventListener(
        'click',
        (e) => window.__clicks.push(`${e.target?.className} @${Math.round(e.clientX)},${Math.round(e.clientY)} trusted=${e.isTrusted} detail=${e.detail}`),
        true,
      );
      f.openTree = () => {
        window.__treeOpens.push((new Error().stack ?? '').split('\n').slice(1, 5).join(' < '));
        o();
      };
    });
    if (back.tree || back.n !== 2 || back.phase !== 'ready') problems.push(`[${c.name}] "A la placa" did not go back to the waiting run 2 (${JSON.stringify(back)})`);
    if (await visible('.ss-layer:not(.ss-welcome) [data-act="go"]')) problems.push(`[${c.name}] "A la placa" brought the start card back (F-06)`);
  } else problems.push(`[${c.name}] no Tree button in the dock`);
  // F-09: zoomed in (a child's taps, a followed creature): "Centrar" brings the whole dish back.
  // (VELA's lines are read first, like a player: her bubble is the one message while she talks.)
  for (let i = 0; i < 6; i++) {
    const talking = await page.evaluate(() => {
      const b = window.bioluma;
      if (b.story.current()) b.story.skip();
      if (b.ui.drawerOpen) b.ui.openBestiary(false);
      return !!b.story.current();
    });
    await closeMoments();
    await page.waitForTimeout(400);
    if (!talking) break;
  }
  await page.evaluate(() => {
    const cam = window.bioluma.camera;
    cam.zoomAt(2.2, cam.viewW * 0.3, cam.viewH * 0.3);
  });
  await page.waitForTimeout(1500);
  if (!(await visible('[data-testid="recenter"]'))) problems.push(`[${c.name}] zoomed in but no "Centrar" button (F-09)`);
  else {
    await mustHit('[data-testid="recenter"]', 'zoomed dish');
    await tapSel('[data-testid="recenter"]');
    await page.waitForTimeout(1000);
    const z = await page.evaluate(() => window.bioluma.camera.zoom);
    if (z !== 1) problems.push(`[${c.name}] "Centrar" left the zoom at ${z} (F-09)`);
    else say('"Centrar" brings the whole dish back');
  }
  // F-10: "Limpiar placa" is away from the seed bar and needs a long press.
  const geo = await page.evaluate(() => {
    const a = document.querySelector('[data-testid="clean-dish"]')?.getBoundingClientRect();
    // The seed bar: the Sembrar button in sessions (ADR-031), else the seed pill.
    const b = (document.querySelector('.sow-btn:not([hidden])') ?? document.querySelector('.mode-pill'))?.getBoundingClientRect();
    return a && b ? Math.hypot(a.x + a.width / 2 - (b.x + b.width / 2), a.y + a.height / 2 - (b.y + b.height / 2)) : -1;
  });
  if (!(geo > 200)) problems.push(`[${c.name}] "Limpiar placa" is ${geo.toFixed(0)} px from the seed bar (F-10)`);
  const alive = () => page.evaluate(() => window.bioluma.game.view().creatures.filter((x) => x.state !== 'dead').length);
  const before = await alive();
  await mustHit('[data-testid="clean-dish"]', 'dish tools');
  await tapSel('[data-testid="clean-dish"]');
  await page.waitForTimeout(150);
  await tapSel('[data-testid="clean-dish"]');
  await page.waitForTimeout(900);
  if (before > 0 && (await alive()) === 0) problems.push(`[${c.name}] two quick taps on "Limpiar placa" wiped the dish (F-10)`);
  else say(`two quick taps on "Limpiar placa" keep the dish (${before} creatures)`);
  // B-10.1: VELA asks to open the Bestiary while it is already open: the spotlight never points at the
  // covered dock button (it points at a card in the drawer, or nowhere), and the task counts as done.
  await closeMoments();
  await page.evaluate(() => window.bioluma.ui.openBestiary(true));
  await page.waitForTimeout(700);
  await page.evaluate(() => window.bioluma.story.play('t_bestiary'));
  await page.waitForTimeout(1600);
  await shot('spotlight-drawer');
  const spotDrawer = await page.evaluate(() => {
    const b = window.bioluma;
    const r = b.storyUI.debug.spotRect?.();
    const dock = document.querySelector('.bl-dock')?.getBoundingClientRect();
    const drawer = document.querySelector('.bl-drawer')?.getBoundingClientRect();
    const layer = document.querySelector('.sty')?.getBoundingClientRect() ?? { left: 0, top: 0 };
    if (!r) return { ring: null };
    const ring = { left: r.x + layer.left, top: r.y + layer.top, right: r.x + layer.left + r.w, bottom: r.y + layer.top + r.h };
    const meets = (a, d) => !!d && a.left < d.right && a.right > d.left && a.top < d.bottom && a.bottom > d.top;
    const inside = !!drawer && ring.left >= drawer.left - 12 && ring.right <= drawer.right + 12 && ring.top >= drawer.top - 12 && ring.bottom <= drawer.bottom + 12;
    return { ring, onDock: meets(ring, dock), inside };
  });
  if (spotDrawer.ring && (spotDrawer.onDock || !spotDrawer.inside))
    problems.push(`[${c.name}] with the Bestiary open VELA's spotlight points at ${JSON.stringify(spotDrawer.ring)} (on the dock: ${spotDrawer.onDock}) (B-10.1)`);
  else say(`spotlight with the drawer open: ${spotDrawer.ring ? 'on a card in the drawer' : 'no ring'}`);
  for (let i = 0; i < 12; i++) {
    const st = await page.evaluate(() => {
      const b = window.bioluma;
      const cur = b.story.current();
      if (cur?.scene.id === 't_bestiary' && cur.line) b.storyUI.debug.completeTyping();
      return { id: cur?.scene.id ?? null, wait: !!cur?.wait };
    });
    if (st.id !== 't_bestiary') break;
    if (st.wait) break;
    await tapSel('.sty-box:not([hidden])');
    await page.waitForTimeout(450);
  }
  await page.waitForTimeout(800);
  const left = await page.evaluate(() => window.bioluma.story.current()?.scene.id ?? null);
  if (left === 't_bestiary') problems.push(`[${c.name}] «Abre el Bestiario» still waits with the Bestiary open (B-10.1)`);
  await page.evaluate(() => {
    const b = window.bioluma;
    if (b.story.current()) b.story.skip();
    b.ui.openBestiary(false);
  });
  await page.waitForTimeout(600);
  // Reopening the Bestiary while it slides out keeps its backdrop (integrator review of v0.019).
  await page.evaluate(() => window.bioluma.ui.openBestiary(true));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.bioluma.ui.openBestiary(false));
  await page.waitForTimeout(60);
  await page.evaluate(() => window.bioluma.ui.openBestiary(true));
  // Measure once its fades are over (a slow software-GL frame can hold the timeline for a while).
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(150);
    const busy = await page.evaluate(() => {
      const el = document.querySelector('.bl-drawer-scrim');
      return !!el && el.getAnimations().some((a) => a.playState === 'running' || a.pending);
    });
    if (!busy) break;
  }
  await page.waitForTimeout(150);
  const scrimOpacity = await page.evaluate(() => {
    const el = document.querySelector('.bl-drawer-scrim');
    return el && !el.hidden ? Number(getComputedStyle(el).opacity) : -1;
  });
  if (scrimOpacity < 0.5) problems.push(`[${c.name}] reopened Bestiary without its backdrop (opacity ${scrimOpacity})`);
  else say(`reopened Bestiary keeps its backdrop (opacity ${scrimOpacity.toFixed(2)})`);
  await page.evaluate(() => window.bioluma.ui.openBestiary(false));
  await page.waitForTimeout(600);
  // B-10.4: any toast closes when tapped (≤ 200 ms), with or without an action.
  // (a warning: it shows even while something else talks)
  await page.evaluate(() => window.bioluma.bus.emit('toast', { text: { es: 'Prueba de aviso', en: 'Toast test' }, kind: 'warn' }));
  // Toasts show one at a time: a toast already up goes first (a tap closes it too), then ours.
  const ours = '.toast[data-text="Prueba de aviso"]:not(.out), .toast[data-text="Toast test"]:not(.out)';
  for (let i = 0; i < 20 && !(await visible(ours)); i++) {
    if (await visible('.toast:not(.out)')) await tapSel('.toast:not(.out)');
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(300);
  if (await visible(ours)) {
    await tapSel(ours);
    await page.waitForTimeout(260);
    const still = await page.evaluate(() =>
      [...document.querySelectorAll('.toast')].some((t) => /Prueba de aviso|Toast test/.test(t.textContent ?? '') && !t.classList.contains('out') && t.getBoundingClientRect().height > 0),
    );
    if (still) problems.push(`[${c.name}] a tapped toast did not close (B-10.4)`);
    else say('a tapped toast closes');
  } else notes.push(`[${c.name}] B-10.4: no toast showed (held)`);
  // The seed bar is free on the dish.
  await closeMoments();
  const opens = await page.evaluate(() => window.__treeOpens ?? []);
  if (opens.length) problems.push(`[${c.name}] the Tree reopened by itself: ${opens.join(' || ')}; clicks: ${(await page.evaluate(() => window.__clicks ?? [])).join(' | ')}`);
  await shot('session-2');
  await mustHit('[data-testid="sow"]', 'session 2 ready');

  // ── Nutrientes in a running session 2 (docs/CLARIDAD2.md §2.7, §2.14) ──
  await closeMoments();
  for (let i = 0; i < 4 && (await state()).phase === 'ready'; i++) {
    // ADR-031: the first seed of a session (it starts the clock) comes from the Sembrar button.
    await tapSel('[data-testid="sow"]');
    await page.waitForTimeout(800);
    await closeMoments();
  }
  if ((await state()).phase !== 'running') problems.push(`[${c.name}] session 2: the clock did not start`);
  // Plenty of light, and wait until Nutrientes is on sale (BOOST_FROM_SECONDS of clock, something alive).
  const onSale = async () => {
    for (let i = 0; i < 120; i++) {
      await page.evaluate(() => {
        const b = window.bioluma;
        if (b.game.state.essence < 5000) b.game.state.essence = 5000;
        if (b.story.current()) b.story.skip();
        // A loaded software-GL machine must not run out of clock before the checks (test scaffolding, like the light).
        const se = b.game.session;
        if (se && se.phase === 'running' && se.limit + se.bonus - se.elapsed < 20) se.bonus += 20;
      });
      await closeMoments();
      if ((await state()).phase !== 'running') return false;
      if (await visible('.dock-boost.can')) return true;
      await page.waitForTimeout(400);
    }
    return false;
  };
  const boosts = () => page.evaluate(() => window.bioluma.game.view().boost?.count ?? 0);
  const cells = () =>
    page.evaluate(() =>
      [...(document.querySelector('.bl-dock .dock-in')?.children ?? [])].map((e) => {
        const r = e.getBoundingClientRect();
        return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(',');
      }),
    );
  if (await onSale()) {
    // QA#17: VELA's one-line bubble over the dock; a finger taps it to close it and the rest of the double
    // tap lands where the bubble was: on Nutrientes. Nothing is bought.
    await page.evaluate(() => window.bioluma.story.play('t_seedcost'));
    await page.waitForTimeout(900);
    await page.evaluate(() => window.bioluma.storyUI.debug.completeTyping());
    await page.waitForTimeout(200);
    const b0 = await box('.dock-boost');
    const under = await cover('.dock-boost');
    if (b0 && under) {
      const n0 = await boosts();
      const cx = b0.x + b0.width / 2;
      const cy = b0.y + b0.height / 2;
      // The finger taps VELA's box where it covers the button (it closes her last line), and the rest of a
      // quick double tap lands on the same spot the moment the box no longer covers the button. A real second
      // tap on a loaded software-GL machine arrives far too late to test that moment, so the page dispatches it
      // itself, armed before the first tap: from that tap, every frame looks at the spot and presses as soon as
      // the button is what a finger there would hit.
      await page.evaluate(({ x, y }) => {
        window.__presses = [];
        window.__second = null;
        const note = (k) => (e) => window.__presses.push({ k, t: performance.now(), on: String(e.target?.className?.baseVal ?? e.target?.className ?? '').split(' ')[0] });
        window.addEventListener('pointerdown', note('down'), true);
        window.addEventListener('click', note('click'), true);
        const arm = (e) => {
          if (!e.isTrusted) return;
          window.removeEventListener('pointerdown', arm, true);
          const t0 = performance.now();
          const poll = () => {
            const hit = document.elementFromPoint(x, y);
            const btn = document.querySelector('.dock-boost');
            if (hit && btn && btn.contains(hit)) {
              const o = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'touch', isPrimary: true, pointerId: 9 };
              hit.dispatchEvent(new PointerEvent('pointerdown', o));
              hit.dispatchEvent(new PointerEvent('pointerup', o));
              hit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y, detail: 1 }));
              window.__second = { ms: Math.round(performance.now() - t0) };
            } else if (performance.now() - t0 > 5000) window.__second = { ms: -1 };
            else requestAnimationFrame(poll);
          };
          requestAnimationFrame(poll);
        };
        window.addEventListener('pointerdown', arm, true);
      }, { x: cx, y: cy });
      await tap(cx, cy);
      const second = await page
        .waitForFunction(() => window.__second, null, { timeout: 15000, polling: 100 })
        .then((h) => h.jsonValue(), () => ({ ms: -1 }));
      await page.waitForTimeout(400);
      await shot('qa17-after-double-tap');
      const log = (await page.evaluate(() => window.__presses)).map((p) => `${p.k}@${Math.round(p.t)} ${p.on}`).join(', ');
      // The second tap lands in the very frame the box stops covering the button: it is the rest of the
      // double tap whatever the frame rate (the guard counts 350 ms from the moment the cover goes).
      if (second.ms < 0) problems.push(`[${c.name}] QA#17: VELA's box never uncovered the Nutrientes button after closing her line (${log})`);
      else if ((await boosts()) !== n0) problems.push(`[${c.name}] QA#17: a tap that closed VELA's line over the dock bought Nutrientes (the rest of the double tap, ${second.ms} ms after the first, as the box cleared; under the finger: ${under}; ${log})`);
      else say(`QA#17: closing VELA's line over the dock (${under.split(' ')[0]}) bought nothing (second tap as the box cleared, ${second.ms} ms after the first)`);
    } else say(`QA#17: VELA's bubble does not cover the Nutrientes button here (${under || 'free'})`);
    await page.evaluate(() => window.bioluma.story.current() && window.bioluma.story.skip());
    await page.waitForTimeout(700);
    // QA#29: a plain tap buys it, and the dock's three cells do not move.
    if (await onSale()) {
      // A player taps once the button is plainly there (nothing on top of it for a moment).
      for (let i = 0; i < 20 && (await cover('.dock-boost')); i++) await page.waitForTimeout(200);
      await page.waitForTimeout(600);
      const before = await cells();
      const n0 = await boosts();
      await tapSel('.dock-boost');
      await page.waitForTimeout(900);
      const after = await cells();
      await shot('qa29-boost-bought');
      if ((await boosts()) <= n0) problems.push(`[${c.name}] a plain tap on Nutrientes did not buy it`);
      if (before.length !== 3 || before.join('|') !== after.join('|')) problems.push(`[${c.name}] QA#29: buying Nutrientes moved the dock: ${before.join(' ')} → ${after.join(' ')}`);
      else say('QA#29: buying Nutrientes keeps the dock\'s three cells in place');
    } else problems.push(`[${c.name}] Nutrientes not on sale again after VELA's line`);
  } else problems.push(`[${c.name}] session 2: Nutrientes never went on sale`);
  await ctx.close();
}

let failed = false;
try {
  for (const c of CASES) {
    console.log(`case ${c.name}…`);
    await runCase(c);
  }
} catch (err) {
  failed = true;
  console.error(err);
} finally {
  await browser.close();
  server.kill();
}
console.log(notes.join('\n'));
if (problems.length) {
  console.error('Problems:\n' + problems.join('\n'));
  failed = true;
}
console.log(failed ? 'LAYERS: FAIL' : 'LAYERS: OK');
process.exit(failed ? 1 : 0);
