// Plays the first lab sessions of the real game like a player (taps only) on a phone and on a desktop,
// in both themes and both languages, and screenshots every step: title, VELA's first lines, the first
// seeds and Momentos, the clock running, the last minute, "¡Tiempo!", the summary, the research tree
// (a buy), the start card (a World picked), and sessions 2 and 3.
//
// The only shortcut is time: the e2e build's debug handle runs the dish faster and ties the session
// clock to the steps the dish really ran (`bioluma.debugTime`, never in a release build; a software-
// rendered test browser runs far below 30 steps/s). Everything else is a tap where a player taps.
//
// Usage: node tests/e2e/session-play.mjs [--dist <dir>] [--out <dir>] [--only mobile-es-dark]
//                                        [--sessions 3] [--scale 6] [--wiki <dir>]
//   Without --dist it builds with VITE_E2E=1 into a temp dir first. --wiki also copies the wiki's
//   pictures (m-*, en-*, d-*: docs/wiki/README.md) into <dir>, as tests/e2e/wiki-shots.mjs does.
// Fails on console/page errors, horizontal overflow, a HUD / dish / dock that moves, a session that
// never ends, a summary or tree that never shows, or a purchase that does not land.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const out = resolve(opt('--out', `${tmpdir()}/bioluma-play`));
const only = opt('--only', '');
const SESSIONS = Number(opt('--sessions', '3'));
const SCALE = Number(opt('--scale', '6'));
const WIKI = opt('--wiki', '') ? resolve(opt('--wiki', '')) : '';
if (WIKI) mkdirSync(WIKI, { recursive: true });
/** Wiki picture prefix per case: Spanish phone, English phone, desktop. */
const WIKI_PREFIX = { 'mobile-es-dark': 'm', 'mobile-en-light': 'en', 'desktop-es-dark': 'd' };
/** Screenshot label (first match) → wiki picture name. */
const WIKI_NAMES = [
  [/^title$/, '01-title'],
  [/^scene-t_intro$/, '02-vela-hello'],
  [/^moment-seed$/, '03-moment-seed'],
  [/^s1-running$/, '04-clock-running'],
  [/^moment-income$/, '05-moment-essence'],
  [/^moment-clock$/, '06-moment-clock'],
  [/^s1-times-up$/, '07-times-up'],
  [/^s1-summary$/, '08-summary'],
  [/^s1-tree$/, '09-tree'],
  [/^s1-node-/, '10-node-sheet'],
  [/^s1-bought-/, '11-bought'],
  [/^s2-start-card$/, '12-start-card'],
  [/^s2-world-picked$/, '13-worlds'],
  [/^s2-running$/, '14-session-2'],
  [/^s\d-boost-ready$/, '15-abono'],
  [/^moment-golden$/, '16-spark'],
  [/^s2-bestiary$/, '17-bestiary'],
  [/^s2-species$/, '18-species-card'],
  [/^s2-pause$/, '19-pause'],
  [/^s2-summary$/, '20-summary-2'],
];
let dist = opt('--dist', '');
mkdirSync(out, { recursive: true });

if (!dist) {
  dist = resolve(`${tmpdir()}/bioluma-play-dist`);
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

const port = 7300 + Math.floor(Math.random() * 600);
const server = spawn('npx', ['vite', 'preview', '--outDir', dist, '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('preview did not start')), 120000);
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
const story = [];

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
  const wikiDone = new Set();
  const shot = async (label) => {
    const f = `${out}/play-${c.name}-${String(n++).padStart(2, '0')}-${label}.png`;
    await page.screenshot({ path: f });
    shots.push(f);
    const pre = WIKI && WIKI_PREFIX[c.name];
    const hit = pre ? WIKI_NAMES.find(([re]) => re.test(label)) : null;
    if (hit && !wikiDone.has(hit[1])) {
      wikiDone.add(hit[1]);
      copyFileSync(f, `${WIKI}/${pre}-${hit[1]}.png`);
    }
    return f;
  };
  const say = (line) => story.push(`[${c.name}] ${line}`);
  const tap = async (x, y) => (c.mobile ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const visible = (sel) => page.locator(sel).first().isVisible().catch(() => false);
  const tapSel = async (sel) => {
    const loc = page.locator(sel).first();
    const box = await loc.boundingBox().catch(() => null);
    if (!box) return false;
    await tap(box.x + box.width / 2, box.y + box.height / 2);
    return true;
  };
  const view = () => page.evaluate(() => {
    const v = window.bioluma.game.view();
    return {
      essence: Math.round(v.essence),
      eps: v.essencePerSec,
      creatures: v.creatures.filter((x) => x.state !== 'dead').length,
      species: v.species.length,
      session: v.session ? { n: v.session.n, phase: v.session.phase, remaining: Math.round(v.session.remaining), world: v.session.world } : null,
      datos: v.research?.datos ?? 0,
      world: v.research?.world ?? null,
      worlds: v.research?.worlds ?? [],
      paused: window.bioluma.game.isPaused,
    };
  });
  /** Boxes that must never move (no layout shift): HUD, dish, dock. */
  const frame = () =>
    page.evaluate(() => {
      const r = (sel) => {
        const e = document.querySelector(sel);
        if (!e) return null;
        const b = e.getBoundingClientRect();
        return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)].join(',');
      };
      return { hud: r('.bl-hud'), dish: r('.bl-dish'), dock: r('.bl-dock'), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
    });
  let base = null;
  const checkStable = async (label) => {
    const f = await frame();
    if (f.overflow) problems.push(`[${c.name}] ${label}: horizontal overflow`);
    if (base) for (const k of ['hud', 'dish', 'dock']) if (f[k] !== base[k]) problems.push(`[${c.name}] ${label}: ${k} moved ${base[k]} → ${f[k]}`);
  };
  /** Several of these on screen at once would be the "stacked bubbles" bug. */
  const overlapCheck = async (label) => {
    const hits = await page.evaluate(() => {
      const sels = ['.bl-objective:not([hidden])', '.sty-box', '.sty-task', '.enc-bubble', '.mo-card', '.mo-brief', '.ss-banner', '.toast'];
      const boxes = [];
      for (const s of sels)
        for (const e of document.querySelectorAll(s)) {
          const st = getComputedStyle(e);
          if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.3) continue;
          let hidden = false;
          for (let p = e; p; p = p.parentElement) if (p.hidden) hidden = true;
          if (hidden) continue;
          const b = e.getBoundingClientRect();
          if (b.width < 2 || b.height < 2) continue;
          boxes.push({ s, b: [b.left, b.top, b.right, b.bottom] });
        }
      const out = [];
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i].b;
          const b = boxes[j].b;
          const ix = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
          const iy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
          if (ix > 8 && iy > 8 && boxes[i].s !== boxes[j].s) out.push(`${boxes[i].s} × ${boxes[j].s}`);
        }
      return out;
    });
    if (hits.length) problems.push(`[${c.name}] ${label}: overlapping messages: ${hits.join(', ')}`);
    return hits;
  };

  const seenScenes = new Set();
  const seenMoments = new Set();
  /**
   * Answer whatever talks to the player, like a player: read VELA's lines (tap the box), pick the first
   * answer of a choice, close a Momento card ("¡Entendido!"), close the welcome card. Screenshots the
   * first line of every scene and every Momento card once. Returns true when something was answered.
   */
  let sheets = 0;
  const seenSecrets = new Set();
  const settle = async (label = '') => {
    let did = false;
    sheets = 0;
    let drawers = 0;
    for (let i = 0; i < 30; i++) {
      const st = await page.evaluate(() => {
        const s = window.bioluma.story.current();
        const m = window.bioluma.moments.current();
        const card = document.querySelector('.mo-card');
        return {
          scene: s?.scene.id ?? null,
          phase: s?.phase ?? null,
          moment: m?.id ?? null,
          momentCard: !!card && !card.closest('[hidden]') && getComputedStyle(card).display !== 'none' && !!document.querySelector('.mo-card .mo-ok') && document.querySelector('.mo-card .mo-ok').getBoundingClientRect().width > 0,
        };
      });
      if (st.phase === 'lines' && (await visible('.sty-box'))) {
        if (!seenScenes.has(st.scene)) {
          seenScenes.add(st.scene);
          await page.waitForTimeout(500);
          await shot(`scene-${st.scene}`);
          await overlapCheck(`scene ${st.scene}`);
          say(`VELA scene «${st.scene}»${label ? ` (${label})` : ''}`);
        }
        await tapSel('.sty-box');
        await page.waitForTimeout(250);
        did = true;
        continue;
      }
      if (st.phase === 'choice' && (await visible('.sty-opt'))) {
        await shot(`choice-${st.scene}`);
        say(`VELA asks a question in «${st.scene}»: first answer picked`);
        await tapSel('.sty-opt');
        await page.waitForTimeout(400);
        did = true;
        continue;
      }
      if (st.momentCard) {
        // (A card still fading out has no current Momento: just tap it away.)
        if (st.moment && !seenMoments.has(st.moment)) {
          seenMoments.add(st.moment);
          await page.waitForTimeout(900);
          // A slow (software GL) frame can hold the card's fade-in: wait until it is fully there.
          await page
            .waitForFunction(() => {
              const card = document.querySelector('.mo-card');
              return !!card && card.classList.contains('show') && Number(getComputedStyle(card).opacity) > 0.98;
            }, null, { timeout: 4000 })
            .catch(() => {});
          await page.evaluate(() => window.bioluma.momentsUI.debug?.finishTyping?.());
          await page.waitForTimeout(200);
          await shot(`moment-${st.moment}`);
          await overlapCheck(`moment ${st.moment}`);
          say(`Momento card «${st.moment}»`);
        }
        await tapSel('.mo-card .mo-ok');
        await page.waitForTimeout(700);
        did = true;
        continue;
      }
      // A sheet opened by a tap (the Behaviour Guide from a creature's pill, a price sheet): look, close it.
      if (await page.evaluate(() => [...document.querySelectorAll('.mo-sp-layer')].some((l) => !l.hidden && l.classList.contains('show')))) {
        sheets++;
        if (sheets === 1) {
          await page.waitForTimeout(300);
          await shot('sheet');
        }
        if (sheets > 3) problems.push(`[${c.name}] a sheet would not close with its × (${label})`);
        // The × of the open sheet, like a finger; Escape as a last resort (a keyboard player).
        if (!(await tapSel('.mo-sp-layer.show .mo-sp-x')) || sheets > 2) await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        did = true;
        if (sheets > 4) break;
        continue;
      }
      // A secret found (a date, a gesture): read it, tap it away.
      if (await visible('.bls-reveal')) {
        const name = await page.locator('.bls-reveal .bls-name').first().textContent().catch(() => '');
        if (!seenSecrets.has(name)) {
          seenSecrets.add(name);
          await page.waitForTimeout(1200);
          await shot('secret');
          say(`A secret card: «${(name ?? '').trim()}»${label ? ` (${label})` : ''}`);
        }
        await tapSel('.bls-reveal');
        await page.waitForTimeout(600);
        did = true;
        continue;
      }
      // The Bestiary drawer left open (a species chip, a Momento's link): look, then close it like a player.
      if (await page.evaluate(() => !!window.bioluma.ui.drawerOpen)) {
        drawers++;
        if (drawers === 1) {
          await shot('drawer-open');
          say(`The Bestiary drawer was open${label ? ` (${label})` : ''}: closed it.`);
        }
        if (await visible('.modal .modal-close')) await tapSel('.modal .modal-close');
        else if (!(await tapSel('.bl-drawer .drawer-x')) || drawers > 2) await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        did = true;
        if (drawers > 4) break;
        continue;
      }
      if (await visible('.ss-welcome .ss-card [data-act="go"]')) {
        await shot('welcome');
        await tapSel('.ss-welcome [data-act="go"]');
        await page.waitForTimeout(500);
        did = true;
        continue;
      }
      break;
    }
    return did;
  };

  const dishBox = async () => page.locator('canvas.gl-dish').boundingBox();
  /** Seed spots spread over the dish (fractions of the canvas). */
  const SPOTS = [
    [0.5, 0.5],
    [0.28, 0.3],
    [0.72, 0.32],
    [0.3, 0.72],
    [0.7, 0.7],
    [0.5, 0.18],
    [0.5, 0.84],
    [0.16, 0.5],
    [0.84, 0.5],
  ];
  let spot = 0;
  const seedOnce = async () => {
    const d = await dishBox();
    if (!d) return false;
    // The camera fits the 4:5 grid in the middle of the dish box: aim inside it.
    const gw = Math.min(d.width, d.height * 0.8);
    const gh = gw / 0.8;
    const gx = d.x + (d.width - gw) / 2;
    const gy = d.y + (d.height - gh) / 2;
    // Like a player: sow on empty glass, away from the creatures and the labels above them.
    const busy = await page.evaluate(() => {
      const b = window.bioluma;
      return b.game.view().creatures.map((c) => b.ui.gridToClient(c.x, c.y)).filter(Boolean);
    });
    for (let k = 0; k < SPOTS.length; k++) {
      const [fx, fy] = SPOTS[spot++ % SPOTS.length];
      const x = gx + gw * fx;
      const y = gy + gh * fy;
      if (busy.some((p) => Math.abs(p.x - x) < 70 && y > p.y - 90 && y < p.y + 60)) continue;
      await tap(x, y);
      await page.waitForTimeout(250);
      return true;
    }
    return false;
  };

  // ── Title ──
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => !!window.bioluma, null, { timeout: 30000 });
  await page.evaluate((s) => Object.assign(window.bioluma.debugTime, { scale: s, lockstep: true }), SCALE);
  await page.waitForTimeout(900);
  await shot('title');
  if (await visible('[data-testid="splash"]')) {
    await tapSel('[data-testid="splash"]');
    await page.waitForTimeout(1200);
  }
  base = await frame();
  say('Title screen → tap → the dish, the clock "2:00" in the HUD, VELA starts talking.');
  await page.waitForTimeout(1200);
  await shot('vela-hello');
  await settle('intro');

  for (let k = 1; k <= SESSIONS; k++) {
    // ── Start card (from session 2) ──
    let v = await view();
    if (k > 1) {
      for (let i = 0; i < 20 && !(await visible('.ss-layer:not(.ss-welcome) [data-act="go"]')); i++) {
        await settle(`start ${k}`);
        await page.waitForTimeout(300);
      }
      if (await visible('.ss-layer:not(.ss-welcome) [data-act="go"]')) {
        await page.waitForTimeout(600);
        await shot(`s${k}-start-card`);
        await overlapCheck(`start card ${k}`);
        // A second World open: pick the newest like a curious player.
        const worlds = await page.locator('.ss-world').count();
        if (worlds > 1) {
          const last = page.locator('.ss-world').last();
          const b = await last.boundingBox();
          if (b) await tap(b.x + b.width / 2, b.y + b.height / 2);
          await page.waitForTimeout(500);
          await shot(`s${k}-world-picked`);
          say(`Start card ${k}: ${worlds} Worlds, picked the newest one.`);
        } else say(`Start card ${k}: the Tree's gifts, the Encargo, "¡Empezar!".`);
        await settle(`start ${k}`);
        await tapSel('.ss-layer:not(.ss-welcome) [data-act="go"]');
        await page.waitForTimeout(600);
      } else problems.push(`[${c.name}] session ${k}: no start card`);
      await checkStable(`session ${k} ready`);
      await shot(`s${k}-ready`);
      // VELA's request "Mira tu criatura en el Bestiario": the Bestiary from the dock, one species card.
      if (k === 2 && (await visible('.bl-dock [data-tab="bestiary"]'))) {
        await settle(`bestiary ${k}`);
        await tapSel('.bl-dock [data-tab="bestiary"]');
        await page.waitForTimeout(700);
        await shot(`s${k}-bestiary`);
        await checkStable(`bestiary ${k}`);
        if (await visible('.bl-drawer button.sp')) {
          await tapSel('.bl-drawer button.sp');
          await page.waitForTimeout(900);
          await shot(`s${k}-species`);
          say(`Session ${k}: opened the Bestiary from the dock and a species card.`);
          if (await visible('.modal .modal-close')) await tapSel('.modal .modal-close');
          else await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        }
        if (await visible('.bl-drawer .drawer-x')) await tapSel('.bl-drawer .drawer-x');
        await page.waitForTimeout(500);
        await settle(`bestiary ${k}`);
      }
    }

    // ── Seed: the first tap starts the clock ──
    for (let i = 0; i < 4; i++) {
      await settle(`seed ${k}`);
      await seedOnce();
    }
    await settle(`seed ${k}`);
    v = await view();
    if (!v.session || v.session.phase !== 'running') problems.push(`[${c.name}] session ${k}: the clock did not start after seeding (${JSON.stringify(v.session)})`);
    say(`Session ${k}: seeded, the clock runs (${v.session?.remaining ?? '?'} s left, ${v.creatures} creatures).`);
    await page.waitForTimeout(1500);
    await settle(`run ${k}`);
    await shot(`s${k}-running`);
    await overlapCheck(`session ${k} running`);
    await checkStable(`session ${k} running`);

    // ── Play until "¡Tiempo!" ──
    let shotHalf = false;
    let shotWarn = false;
    let boosted = 0;
    let boostTries = 0;
    const boostCovers = new Set();
    const t0 = Date.now();
    for (;;) {
      v = await view();
      if (!v.session || v.session.phase === 'over') break;
      if (Date.now() - t0 > 420000) {
        problems.push(`[${c.name}] session ${k} never ended (${JSON.stringify(v.session)})`);
        break;
      }
      const answered = await settle(`run ${k}`);
      // A player keeps sowing while there is room and Essence.
      if (!answered && v.creatures < 4) await seedOnce();
      // Abono when it glows.
      if (boosted < 1 && (await visible('.dock-boost.can'))) {
        const before = await page.evaluate(() => window.bioluma.game.view().boost?.count ?? 0);
        if (boostTries === 0) await shot(`s${k}-boost-ready`);
        // What is under the finger (a Momento opening, VELA's box…): a player would see it first.
        const cover = await page.evaluate(() => {
          const b = document.querySelector('.dock-boost')?.getBoundingClientRect();
          if (!b) return 'no button';
          const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
          return e && e.closest('.dock-boost') ? '' : e ? `${e.tagName.toLowerCase()}.${String(e.className).split(' ').join('.')}` : 'nothing';
        });
        if (cover) boostCovers.add(cover);
        // Something covers the button (a Momento card opened at that instant): deal with it first, like a player.
        if (cover && cover !== 'no button') {
          await settle(`boost ${k}`);
          continue;
        }
        await tapSel('.dock-boost');
        boostTries++;
        await page.waitForTimeout(400);
        // A Momento opening at that instant eats the tap (the game is paused under it): tap again later.
        const after = await page.evaluate(() => window.bioluma.game.view().boost?.count ?? 0);
        if (after > before) {
          boosted++;
          await shot(`s${k}-boost-bought`);
          say(`Session ${k}: bought Abono from the dock${boostTries > 1 ? ` (tap ${boostTries})` : ''}.`);
        } else if (boostTries >= 4) {
          boosted++;
          problems.push(`[${c.name}] session ${k}: Abono glowed but ${boostTries} taps did not buy it (under the finger: ${[...boostCovers].join(', ') || 'the button'})`);
        }
      }
      // A Spark crossing the dish: tap it.
      const g = await page.evaluate(() => {
        const r = window.bioluma.ui.targetRect('golden');
        const d = document.querySelector('.bl-dish')?.getBoundingClientRect();
        return r && d && (r.width !== d.width || r.height !== d.height) ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
      });
      if (g) {
        await tap(g.x, g.y);
        say(`Session ${k}: caught a Spark.`);
        await page.waitForTimeout(300);
      }
      if (!shotHalf && v.session.remaining < 75) {
        shotHalf = true;
        await shot(`s${k}-midway`);
        await overlapCheck(`session ${k} midway`);
        // Session 2: the pause button, its card ("Seguir" · "Terminar ahora"), then back to the dish.
        if (k === 2 && (await visible('.fab-pause'))) {
          await tapSel('.fab-pause');
          await page.waitForTimeout(600);
          await shot(`s${k}-pause`);
          if (!(await visible('.pause-card'))) problems.push(`[${c.name}] session ${k}: no pause card`);
          await tapSel('.pause-card .btn.primary');
          await page.waitForTimeout(500);
          if (await page.evaluate(() => window.bioluma.game.isPaused && !window.bioluma.flow.busy && !window.bioluma.moments.current()))
            problems.push(`[${c.name}] session ${k}: still paused after "Seguir"`);
          say(`Session ${k}: paused (the card offers "Seguir" and "Terminar ahora"), then went on.`);
        }
      }
      if (!shotWarn && v.session.remaining <= 20 && v.session.remaining > 3) {
        shotWarn = true;
        await shot(`s${k}-last-seconds`);
      }
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(500);
    await shot(`s${k}-times-up`);
    v = await view();
    say(`Session ${k}: "¡Tiempo!" (${v.essence} Essence, ${v.species} species).`);

    // ── Summary ──
    for (let i = 0; i < 30 && !(await visible('.ss-layer [data-act="tree"]')); i++) {
      await settle(`summary ${k}`);
      await page.waitForTimeout(300);
    }
    if (!(await visible('.ss-layer [data-act="tree"]'))) {
      problems.push(`[${c.name}] session ${k}: no summary`);
      break;
    }
    await page.waitForTimeout(4500); // the staged tally
    await shot(`s${k}-summary`);
    await overlapCheck(`summary ${k}`);
    v = await view();
    say(`Summary ${k}: ${v.datos} Datos in the wallet; tap "Ir al Árbol".`);

    // ── Tree: buy what glows ──
    for (let i = 0; i < 5 && !(await page.evaluate(() => window.bioluma.flow.treeOpen)); i++) {
      await settle(`summary ${k}`);
      await tapSel('.ss-layer [data-act="tree"]');
      await page.waitForTimeout(900);
    }
    if (!(await page.evaluate(() => window.bioluma.flow.treeOpen))) problems.push(`[${c.name}] summary ${k}: "Ir al Árbol" did not open the tree`);
    await settle(`tree ${k}`);
    await shot(`s${k}-tree`);
    await overlapCheck(`tree ${k}`);
    const want = k === 1 ? ['worldCold', 'clock', 'dropper'] : ['clock', 'dropper', 'dish', 'culture', 'startEssence', 'worldGyro', 'fridge'];
    let bought = 0;
    for (let tries = 0; tries < 6 && bought < 3; tries++) {
      await settle(`tree ${k}`);
      // Only nodes a finger can reach: inside the screen, below the tree's header, above the sheet.
      const ids = await page.evaluate(() => {
        const top = document.querySelector('.rt-top')?.getBoundingClientRect().bottom ?? 0;
        const sheet = document.querySelector('.rt-sheet.show')?.getBoundingClientRect().top ?? innerHeight;
        return [...document.querySelectorAll('.rt-node.can')]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            const cy = r.top + r.height / 2;
            const cx = r.left + r.width / 2;
            return cy > top + 8 && cy < Math.min(sheet, innerHeight) - 8 && cx > 8 && cx < innerWidth - 8;
          })
          .map((e) => e.dataset.id);
      });
      if (!ids.length && (await visible('.rt-x'))) {
        await tapSel('.rt-x');
        await page.waitForTimeout(400);
        continue;
      }
      if (!ids.length) break;
      const id = want.find((w) => ids.includes(w)) ?? ids[0];
      await tapSel(`.rt-node[data-id="${id}"]`);
      await page.waitForTimeout(700);
      await settle(`tree ${k}`);
      if (bought === 0) await shot(`s${k}-node-${id}`);
      const before = (await view()).datos;
      if (await visible('.rt-buy:not(:disabled)')) {
        await tapSel('.rt-buy');
        await page.waitForTimeout(900);
        const after = (await view()).datos;
        if (after >= before) problems.push(`[${c.name}] tree ${k}: buying ${id} did not spend Datos (${before} → ${after})`);
        else {
          bought++;
          say(`Tree ${k}: bought «${id}» (${before} → ${after} Datos).`);
        }
        await settle(`tree ${k}`);
        if (bought === 1) await shot(`s${k}-bought-${id}`);
      } else break;
    }
    if (bought === 0) problems.push(`[${c.name}] tree ${k}: nothing bought`);
    if (k < SESSIONS) {
      // Close the sheet if it is open, then "Nueva sesión".
      if (await visible('.rt-x')) await tapSel('.rt-x');
      await page.waitForTimeout(300);
      await settle(`tree ${k}`);
      for (let i = 0; i < 4 && (await page.evaluate(() => window.bioluma.flow.treeOpen)); i++) {
        await tapSel('.rt-go');
        await page.waitForTimeout(900);
        await settle(`tree ${k}`);
      }
    }
  }
  await shot('end');
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
console.log(story.join('\n'));
console.log(`\n${shots.length} screenshots in ${out}`);
if (problems.length) {
  console.error('Problems:\n' + problems.join('\n'));
  failed = true;
}
if (errors.length) {
  console.error('Console errors:\n' + errors.join('\n'));
  failed = true;
}
console.log(failed ? 'SESSION PLAY: FAIL' : 'SESSION PLAY: OK');
process.exit(failed ? 1 : 0);
