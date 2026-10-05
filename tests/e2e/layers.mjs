// One layer at a time (QA4 F-01, F-06, F-03): a player who never taps VELA's bubble must still be able
// to tap every primary button of the session screens with ONE tap. Checks with elementFromPoint at the
// centre of each button: the summary ("Ir al Árbol", "Nueva sesión"), the Tree ("Comprar", the night's
// sheet, "Nueva sesión"), the start card ("¡Empezar!") and the seed bar while a session runs, with VELA
// scenes forced on screen at the worst moments (a chain of lines and a story choice over the summary, a
// world scene over the night sheet). Also: buying from the Tree opened with the dock before the run
// keeps the Tree open (F-06), and the "Toca la placa" task never outlives the first tap (F-03).
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
    const p = `${base}/${d}/chrome-linux/chrome`;
    if (existsSync(p)) return p;
  }
  throw new Error('chromium not found under /opt/pw-browsers');
}

const port = 7900 + Math.floor(Math.random() * 600);
const server = spawn('npx', ['vite', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
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
  if (!/^\+0\b/.test((rate ?? '').trim())) problems.push(`[${c.name}] the HUD shows «${rate}» before the first seed (F-20)`);
  // ── Session 1, never tapping VELA's bubble ──
  await page.evaluate(() => {
    window.__blocked = [];
    window.bioluma.bus.on('seedBlocked', (p) => window.__blocked.push(p.reason));
  });
  for (const [fx, fy] of [
    [0.2, 0.5],
    [0.8, 0.5],
    [0.5, 0.2],
    [0.5, 0.8],
  ]) {
    await closeMoments();
    const p0 = await dishPoint(fx, fy);
    await tap(p0.x, p0.y);
    await page.waitForTimeout(1200);
    if ((await state()).phase === 'running') break;
    say(`tap at ${fx},${fy} refused: ${await page.evaluate(() => window.__blocked.join(',') + ' moment=' + (window.bioluma.moments.current()?.id ?? '-'))}`);
  }
  let s = await state();
  if (s.phase !== 'running') problems.push(`[${c.name}] the first tap did not start the clock (${JSON.stringify(s)})`);
  // F-03: the tap the tutorial asked for ends its task (no "¡Toca la placa!" loop).
  if (s.scene === 't_intro') problems.push(`[${c.name}] VELA still asks to tap the dish after the first tap (F-03)`);
  // The worst case: a chain of lines on screen when the clock runs out.
  await page.evaluate(() => window.bioluma.story.play('t_essence'));
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
  await mustHit('.rt-go', 'tree');
  await tapSel('.rt-go');
  await page.waitForTimeout(1500);

  // ── Start card of session 2 with a scene forced on ──
  await page.evaluate(() => window.bioluma.story.play('a1_committee'));
  await page.waitForTimeout(800);
  for (let i = 0; i < 10 && !(await visible('.ss-layer:not(.ss-welcome) [data-act="go"]')); i++) await page.waitForTimeout(400);
  await shot('start-card');
  await mustHit('.ss-layer:not(.ss-welcome) [data-act="go"]', 'start card 2');
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
    const b = document.querySelector('.mode-pill')?.getBoundingClientRect();
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
  // The seed bar is free on the dish.
  await closeMoments();
  const opens = await page.evaluate(() => window.__treeOpens ?? []);
  if (opens.length) problems.push(`[${c.name}] the Tree reopened by itself: ${opens.join(' || ')}; clicks: ${(await page.evaluate(() => window.__clicks ?? [])).join(' | ')}`);
  await shot('session-2');
  await mustHit('.mode-pill', 'session 2 ready');
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
