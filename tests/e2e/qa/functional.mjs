// QA #1 functional regression suite for Bioluma (real game in headless Chromium).
//
// Usage:
//   VITE_E2E=1 npx vite build --outDir /tmp/bioluma-e2e   # build with the debug handle
//   node tests/e2e/qa/functional.mjs --dist /tmp/bioluma-e2e [--only boot,rename] [--skip-slow] [--shots dir]
//   BIOLUMA_URL=http://localhost:5417/ node tests/e2e/qa/functional.mjs   # reuse a running preview
//
// Exit code 1 if any check fails. Each test runs in its own browser context. The debug handle
// (window.bioluma) is used only to craft saves for late-game screens and to read state; every
// player action goes through real input (mouse, touch, keyboard).
import { mkdirSync } from 'node:fs';
import * as lib from './qa1-lib.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const only = arg('--only', '')
  .split(',')
  .filter(Boolean);
const skipSlow = args.includes('--skip-slow');
const shots = arg('--shots', null);
if (shots) mkdirSync(shots, { recursive: true });
const shot = (page, name) => (shots ? page.screenshot({ path: `${shots}/${name}.png` }) : null);

const results = [];
const check = (name, ok, detail = '') => lib.check(results, name, ok, detail);

const server = await lib.serve(arg('--dist', 'dist'));
const URL0 = server.url;
const browser = await lib.launch();

const tutorialDone = '{"done":[],"skipped":true}';

/** Valid save (base fixture + patch) as the localStorage string. */
function saveWith(patch) {
  const d = lib.baseState();
  patch?.(d);
  return lib.wrapSave(d);
}

async function booted(page, ms = 60000) {
  try {
    await page.waitForFunction(() => !!window.bioluma, null, { timeout: ms });
    return true;
  } catch {
    return false;
  }
}

const tests = {
  // ── Blocker: a returning player (away > 60 s) must get a working game ──
  async offlineBoot() {
    const { ctx, page, log } = await lib.bootWithStorage(browser, URL0, {
      'bioluma.game': saveWith((d) => {
        d.essence = 100;
        d.epsHistory = Array(30).fill(10);
      }),
      'bioluma.savedAt': String(Date.now() - 2 * 3600e3),
      'bioluma.tutorial': tutorialDone,
    });
    const ok = await booted(page);
    check('offline 2h: game boots (debug handle present)', ok);
    check('offline 2h: no uncaught page error', !log.errors.some((e) => e.startsWith('pageerror')), log.errors.join(' | '));
    if (ok) {
      const v = await lib.view(page);
      check('offline 2h: essence granted (avg 10/s × 0.5 × 7200 s)', Math.abs(v.essence - 36100) < 500, `essence=${v.essence}`);
      const steps0 = await page.evaluate(() => window.bioluma.sim.stepCount);
      await page.waitForTimeout(2000);
      check('offline 2h: simulation runs after boot', (await page.evaluate(() => window.bioluma.sim.stepCount)) > steps0);
    }
    await shot(page, 'offline-2h');
    await ctx.close();

    // Away 61 s with no production history: still a return, still must boot.
    const b = await lib.bootWithStorage(browser, URL0, {
      'bioluma.game': saveWith(),
      'bioluma.savedAt': String(Date.now() - 61e3),
      'bioluma.tutorial': tutorialDone,
    });
    check('away 61 s, no history: game boots', await booted(b.page), b.log.errors.join(' | '));
    await b.ctx.close();

    // Clock moved backwards: boots, no gain.
    const c = await lib.bootWithStorage(browser, URL0, {
      'bioluma.game': saveWith((d) => {
        d.essence = 100;
        d.epsHistory = Array(30).fill(10);
      }),
      'bioluma.savedAt': String(Date.now() + 3600e3),
      'bioluma.tutorial': tutorialDone,
    });
    const cok = await booted(c.page);
    check('clock backwards: game boots', cok);
    if (cok) check('clock backwards: no offline essence', (await lib.view(c.page)).essence === 100);
    await c.ctx.close();
  },

  // ── Corrupted UI prefs must not brick the game ──
  async corruptPrefs() {
    for (const [k, v] of [
      ['bioluma.tutorial', 'null'],
      ['bioluma.tutorial', '{"done":true}'],
      ['bioluma.ui.v1', '{"intros":5,"hints":"x"}'],
      ['bioluma.game', '{not json'],
    ]) {
      const { ctx, page, log } = await lib.bootWithStorage(browser, URL0, { [k]: v });
      const ok = await booted(page, 30000);
      await page.waitForTimeout(1500);
      const errs = log.errors.filter((e) => e.startsWith('pageerror'));
      check(`corrupt ${k}=${v}: boots without page errors`, ok && errs.length === 0, errs.join(' | '));
      await ctx.close();
    }
  },

  // ── Storage blocked / full ──
  async storage() {
    const variants = {
      blocked: () => {
        for (const m of ['getItem', 'setItem', 'removeItem', 'clear', 'key'])
          Storage.prototype[m] = function () {
            throw new DOMException('blocked', 'SecurityError');
          };
      },
      getterThrows: () => {
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new DOMException('blocked', 'SecurityError');
          },
        });
      },
      quotaFull: () => {
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) {
          if (String(k).startsWith('bioluma')) throw new DOMException('full', 'QuotaExceededError');
          return orig.call(this, k, v);
        };
      },
    };
    for (const [name, init] of Object.entries(variants)) {
      const { ctx, page, log } = await lib.openPage(browser, URL0, { vp: 'mobile', init: [init] });
      const ok = await booted(page, 30000);
      check(`storage ${name}: game boots`, ok, log.errors.join(' | '));
      if (!ok) {
        await ctx.close();
        continue;
      }
      await lib.startGame(page);
      await page.evaluate(() => {
        window.__toasts = [];
        window.bioluma.bus.on('toast', (t) => window.__toasts.push(t.text.en));
      });
      await lib.tapDish(page, 0.5, 0.5, true);
      await page.waitForTimeout(500);
      check(`storage ${name}: seeding works`, (await lib.view(page)).stats.seeds >= 1);
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      await page.waitForTimeout(300);
      const toasts = await page.evaluate(() => window.__toasts);
      check(
        `storage ${name}: player is warned that progress cannot be saved`,
        toasts.some((t) => /Could not save/.test(t)),
        JSON.stringify(toasts),
      );
      check(`storage ${name}: no page errors`, !log.errors.some((e) => e.startsWith('pageerror')), log.errors.join(' | '));
      await ctx.close();
    }
  },

  // ── WebGL2 unavailable → friendly screen, no crash ──
  async noWebgl() {
    const init = () => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t, ...a) {
        if (t === 'webgl2') return null;
        return orig.call(this, t, ...a);
      };
    };
    for (const vp of ['mobile', 'desktop']) {
      const { ctx, page, log } = await lib.openPage(browser, URL0, { vp, init: [init] });
      await page.waitForTimeout(4000);
      const txt = await page.evaluate(() => document.body.innerText);
      check(`no WebGL2 (${vp}): unsupported screen shown`, /WebGL2/.test(txt) && /(Reintentar|Retry)/.test(txt), txt.slice(0, 120));
      check(`no WebGL2 (${vp}): no uncaught page error`, !log.errors.some((e) => e.startsWith('pageerror')));
      await shot(page, `nowebgl-${vp}`);
      await ctx.close();
    }
  },

  // ── Bestiary rename (real mouse click on the pencil) + sanitisation ──
  async rename() {
    const species = [
      { id: 'sp1', n: 1, customName: '<img src=x onerror=window.__xss=1>', era: 1, muRange: [0.14, 0.16], sigmaRange: [0.014, 0.016] },
      { id: 'sp2', n: 2, customName: null, era: 1, muRange: [0.14, 0.16], sigmaRange: [0.014, 0.016] },
    ];
    for (const vp of ['desktop', 'mobile']) {
      const { ctx, page, log } = await lib.bootWithStorage(
        browser,
        URL0,
        {
          'bioluma.game': saveWith((d) => {
            d.species = species;
            d.specimenCounter = 2;
            d.flags = { tabLab: true, tabBestiary: true };
          }),
          'bioluma.savedAt': String(Date.now()),
          'bioluma.tutorial': tutorialDone,
        },
        { vp },
      );
      await lib.startGame(page);
      await page.locator('[data-tab="bestiary"]').click();
      await page.waitForTimeout(500);
      check(`rename (${vp}): imported HTML name is not executed`, (await page.evaluate(() => window.__xss)) === undefined);
      await page.locator('.sp').nth(1).click();
      await page.waitForTimeout(600);
      const pencil = page.locator('.modal button[aria-label="Renombrar"], .modal button[aria-label="Rename"]');
      if (vp === 'mobile') await pencil.tap();
      else await pencil.click();
      await page.waitForTimeout(600);
      const hasInput = (await page.locator('.modal input[type=text]').count()) > 0;
      check(`rename (${vp}): pencil opens the name field`, hasInput);
      await shot(page, `rename-${vp}`);
      if (!hasInput) {
        // Work around to keep testing the rest: open it without focus on the button.
        await page.evaluate(() => {
          document.activeElement?.blur();
          document.querySelector('.modal button[aria-label="Renombrar"], .modal button[aria-label="Rename"]').click();
        });
        await page.waitForTimeout(400);
      }
      const inp = page.locator('.modal input[type=text]');
      const maxlen = Number(await inp.getAttribute('maxlength'));
      const typed = 'Ñ'.repeat(maxlen);
      await inp.fill(typed);
      await inp.press('Enter');
      await page.waitForTimeout(400);
      let name = (await lib.view(page)).species.find((s) => s.id === 'sp2').name;
      check(`rename (${vp}): a name as long as the field allows is kept`, name === typed, `maxlength=${maxlen} stored=${name.length}`);
      await page.evaluate(() => {
        document.activeElement?.blur();
        document.querySelector('.modal button[aria-label="Renombrar"], .modal button[aria-label="Rename"]').click();
      });
      await page.waitForTimeout(300);
      await page.locator('.modal input[type=text]').fill('A'.repeat(23) + '🦠🦠');
      await page.locator('.modal input[type=text]').press('Enter');
      await page.waitForTimeout(300);
      name = (await lib.view(page)).species.find((s) => s.id === 'sp2').name;
      check(`rename (${vp}): truncation never leaves a broken emoji`, !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(name), JSON.stringify(name));
      await page.evaluate(() => {
        document.activeElement?.blur();
        document.querySelector('.modal button[aria-label="Renombrar"], .modal button[aria-label="Rename"]').click();
      });
      await page.waitForTimeout(300);
      await page.locator('.modal input[type=text]').fill('   ');
      await page.locator('.modal input[type=text]').press('Enter');
      await page.waitForTimeout(300);
      name = (await lib.view(page)).species.find((s) => s.id === 'sp2').name;
      check(`rename (${vp}): blank name keeps a readable name`, name.trim().length > 0, JSON.stringify(name));
      check(`rename (${vp}): no page errors`, !log.errors.some((e) => e.startsWith('pageerror')));
      await ctx.close();
    }
  },

  // ── Import / export ──
  async importExport() {
    const { ctx, page, log } = await lib.bootWithStorage(
      browser,
      URL0,
      {
        'bioluma.game': saveWith((d) => {
          d.essence = 4321;
          d.samples = 7;
        }),
        'bioluma.savedAt': String(Date.now()),
        'bioluma.tutorial': tutorialDone,
      },
      { vp: 'desktop' },
    );
    await lib.startGame(page);
    const data = await lib.stateData(page);
    const tamper = { ...data, essence: 1e300 };
    const neg = { ...data, essence: -5 };
    const garbage = {
      empty: '',
      text: 'hello',
      prefixOnly: 'BIOLUMA1.',
      badBase64: 'BIOLUMA1.!!!@@@',
      badUtf8: 'BIOLUMA1.' + Buffer.from([0xff, 0xfe]).toString('base64'),
      rawJson: lib.wrapSave(data),
      badChecksum: lib.exportOf('{"v":1,"sum":"00000000","data":' + JSON.stringify(tamper) + '}'),
      version0: lib.exportOf(lib.wrapSave(data, 0)),
      version2: lib.exportOf(lib.wrapSave(data, 2)),
      negative: lib.exportOf(lib.wrapSave(neg)),
      huge: 'BIOLUMA1.' + 'A'.repeat(4 * 1024 * 1024),
    };
    await page.locator('button[aria-label="Ajustes"]').click();
    await page.waitForTimeout(500);
    for (const [name, str] of Object.entries(garbage)) {
      if (!(await page.locator('.modal textarea').count())) {
        await page.locator('button[aria-label="Ajustes"]').click();
        await page.waitForTimeout(400);
      }
      // Let earlier toasts expire so the next one is attributable to this import.
      await page.waitForFunction(() => !/No se pudo importar|Could not import/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
      await page.locator('.modal textarea').evaluate((e, s) => {
        e.value = s;
        e.dispatchEvent(new Event('input', { bubbles: true }));
      }, str);
      await page.locator('.modal button', { hasText: 'Importar' }).click();
      await page.waitForTimeout(600);
      const v = await lib.view(page);
      check(`import ${name}: rejected, state unchanged`, Math.round(v.essence) >= 4321 && v.samples === 7, `essence=${v.essence}`);
      const fb = await page.evaluate(() => (document.body.innerText.match(/(No se pudo importar|Could not import)[^\n]*/) || [''])[0]);
      check(`import ${name}: player gets feedback`, fb.length > 0, fb);
    }
    // Round trip through the real buttons.
    await page.locator('.modal button', { hasText: 'Exportar' }).click();
    await page.waitForTimeout(300);
    const exported = await page.locator('.modal textarea').inputValue();
    check('export: produces a BIOLUMA1. string', exported.startsWith('BIOLUMA1.'));
    await page.evaluate(() => window.bioluma.game.actions.setSetting('lang', 'es'));
    const ok = await page.evaluate((s) => window.bioluma.game.importString(s), exported);
    check('export → import round trip accepted', ok === true);
    check('import/export: no page errors', !log.errors.some((e) => e.startsWith('pageerror')));
    await ctx.close();
  },

  // ── Settings: language switch relabels the open modal ──
  async language() {
    const { ctx, page } = await lib.bootWithStorage(
      browser,
      URL0,
      { 'bioluma.game': saveWith(), 'bioluma.savedAt': String(Date.now()), 'bioluma.tutorial': tutorialDone },
      { vp: 'desktop' },
    );
    await lib.startGame(page);
    await page.locator('button[aria-label="Ajustes"]').click();
    await page.waitForTimeout(500);
    await page.locator('.modal button', { hasText: 'English' }).click();
    await page.waitForTimeout(800);
    const title = await page.evaluate(() => document.querySelector('.modal h3')?.innerText);
    check('language es→en: open settings modal title relabels', title === 'Settings', `title=${title}`);
    const body = await page.evaluate(() => document.querySelector('.modal').innerText);
    check('language es→en: settings body relabels', /Language/.test(body) && !/Idioma/.test(body));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const anomalies = await lib.scanText(page);
    check('language: no NaN/undefined in UI', anomalies.length === 0, anomalies.join(' ; '));
    await ctx.close();
  },

  // ── Keyboard shortcuts, pause stops production ──
  async keyboard() {
    const { ctx, page, log } = await lib.bootWithStorage(
      browser,
      URL0,
      {
        'bioluma.game': saveWith((d) => {
          d.flags = { tabLab: true, tabBestiary: true, tabCalibrate: true, tabGenome: true };
          d.unlocked = ['dropper', 'calibrator'];
          d.species = [{ id: 'sp1', n: 1, era: 1, muRange: [0.14, 0.16], sigmaRange: [0.014, 0.016] }];
          d.genome = 1;
          d.era = 2;
        }),
        'bioluma.savedAt': String(Date.now()),
        'bioluma.tutorial': tutorialDone,
      },
      { vp: 'desktop' },
    );
    await lib.startGame(page);
    const active = () => page.evaluate(() => document.querySelector('[data-tab].active')?.dataset.tab);
    for (const [k, tab] of [
      ['1', 'lab'],
      ['2', 'bestiary'],
      ['3', 'calibrate'],
      ['4', 'genome'],
    ]) {
      await page.keyboard.press(k);
      await page.waitForTimeout(300);
      check(`key ${k} → ${tab}`, (await active()) === tab);
    }
    await page.keyboard.press('Space');
    await page.waitForTimeout(600);
    const s0 = await page.evaluate(() => window.bioluma.sim.stepCount);
    await page.waitForTimeout(1500);
    check('space pauses the simulation', (await page.evaluate(() => window.bioluma.sim.stepCount)) === s0);
    await page.keyboard.press('Space');
    await page.waitForTimeout(1500);
    check('space resumes', (await page.evaluate(() => window.bioluma.sim.stepCount)) > s0);
    const m0 = (await lib.view(page)).settings.muted;
    await page.keyboard.press('m');
    await page.waitForTimeout(300);
    check('M toggles mute', (await lib.view(page)).settings.muted === !m0);
    check('keyboard: no page errors', !log.errors.some((e) => e.startsWith('pageerror')));
    await ctx.close();
  },

  // ── Upgrades: the price on the button is the price charged ──
  async upgrades() {
    const { ctx, page } = await lib.bootWithStorage(
      browser,
      URL0,
      {
        'bioluma.game': saveWith((d) => {
          d.essence = 1e6;
          d.unlocked = ['dropper', 'culture', 'stabilizer', 'calibrator'];
          d.flags = { tabLab: true, eps10: true };
          d.upgrades = { dropper: 2 };
        }),
        'bioluma.savedAt': String(Date.now()),
        'bioluma.tutorial': tutorialDone,
      },
      { vp: 'desktop' },
    );
    await lib.startGame(page);
    for (const q of ['×10', '×máx', '×1']) {
      await page.locator('button:visible', { hasText: new RegExp('^' + q + '$') }).first().click();
      await page.waitForTimeout(1200);
      for (const id of ['culture', 'dropper']) {
        const u0 = (await lib.view(page)).upgrades.find((u) => u.id === id);
        if (u0.maxed || !u0.affordable) continue;
        const e0 = (await lib.view(page)).essence;
        await page.locator(`[data-up="${id}"] button`).first().click();
        await page.waitForTimeout(500);
        const v = await lib.view(page);
        const u1 = v.upgrades.find((u) => u.id === id);
        check(`buy ${id} ${q}: levels bought = shown qty`, u1.level - u0.level === u0.qty, `shown +${u0.qty}, got +${u1.level - u0.level}`);
        check(`buy ${id} ${q}: essence charged = shown cost`, Math.abs(e0 - v.essence - u0.cost) < 1e-6 * u0.cost + 1, `shown ${u0.cost}, charged ${e0 - v.essence}`);
      }
    }
    const d = (await lib.view(page)).upgrades.find((u) => u.id === 'dropper');
    check('dropper capped at max level', d.level === d.maxLevel && d.maxed);
    await ctx.close();
  },

  // ── Extinction: release early cancels, full hold extinguishes ──
  async extinction() {
    const { ctx, page, log } = await lib.bootWithStorage(
      browser,
      URL0,
      {
        'bioluma.game': saveWith((d) => {
          d.essence = 5e6;
          d.eraEssence = 5e6;
          d.flags = { tabLab: true, tabGenome: true };
        }),
        'bioluma.savedAt': String(Date.now()),
        'bioluma.tutorial': tutorialDone,
      },
      { vp: 'desktop' },
    );
    await lib.startGame(page);
    await page.keyboard.press('4');
    await page.waitForTimeout(1200);
    const btn = page.locator('button:has-text("Extinguir")').first();
    const b = await btn.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(400);
    await page.mouse.up();
    await page.waitForTimeout(2000);
    check('extinction: releasing before 1.5 s cancels', (await lib.view(page)).era === 1);
    await page.mouse.down();
    await page.waitForTimeout(400);
    await page.mouse.move(b.x - 300, b.y - 300);
    await page.waitForTimeout(1800);
    await page.mouse.up();
    check('extinction: sliding off the button cancels', (await lib.view(page)).era === 1);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(2300);
    await page.mouse.up();
    await page.waitForTimeout(2500);
    const v = await lib.view(page);
    check('extinction: full hold → Era 2', v.era === 2, `era=${v.era}`);
    check('extinction: genome gained', v.genome > 0);
    check('extinction: essence reset', v.essence <= 100, `essence=${v.essence}`);
    check('extinction: second extinction not available right away', !v.extinction.available);
    check('extinction: no page errors', !log.errors.some((e) => e.startsWith('pageerror')));
    await ctx.close();
  },

  // ── Regimes: save (named), load, two-step delete, cap ──
  async regimes() {
    const { ctx, page } = await lib.bootWithStorage(
      browser,
      URL0,
      {
        'bioluma.game': saveWith((d) => {
          d.essence = 1e5;
          d.upgrades = { calibrator: 4 };
          d.unlocked = ['dropper', 'calibrator'];
          d.flags = { tabLab: true, tabCalibrate: true };
          d.species = [{ id: 'sp1', n: 1, era: 1, muRange: [0.14, 0.16], sigmaRange: [0.014, 0.016] }];
        }),
        'bioluma.savedAt': String(Date.now()),
        'bioluma.tutorial': tutorialDone,
      },
      { vp: 'desktop' },
    );
    await lib.startGame(page);
    await page.keyboard.press('3');
    await page.waitForTimeout(800);
    const add = page.locator('button.regime-add');
    for (let i = 0; i < 9; i++) {
      if ((await page.evaluate(() => window.bioluma.game.state.regimes.length)) >= 8) {
        await page.waitForTimeout(800);
        check('regimes: "Guardar" hidden at 8/8', !(await add.isVisible().catch(() => false)));
        break;
      }
      await page.evaluate((i) => window.bioluma.game.actions.setCalibration({ mu: 0.12 + i * 0.01 }), i);
      await add.click();
      await page.waitForTimeout(250);
      await page.locator('.regime-form input').fill(i === 0 ? '<b>x</b>' : `r${i}`);
      await page.locator('.regime-form input').press('Enter');
      await page.waitForTimeout(250);
    }
    const names = await page.evaluate(() => window.bioluma.game.state.regimes.map((r) => r.name));
    check('regimes: capped at 8', names.length === 8, `n=${names.length}`);
    check('regimes: HTML stripped from names', !names.some((n) => /[<>]/.test(n)), JSON.stringify(names));
    await page.locator('.regime .rg-load').nth(2).click();
    await page.waitForTimeout(500);
    check('regimes: load applies μ', Math.abs((await lib.view(page)).calibration.mu - 0.14) < 1e-9);
    await page.locator('.regime .rg-del').nth(0).click();
    await page.waitForTimeout(150);
    check('regimes: first tap only arms delete', (await page.evaluate(() => window.bioluma.game.state.regimes.length)) === 8);
    await page.locator('.regime .rg-del').nth(0).click();
    await page.waitForTimeout(300);
    check('regimes: second tap deletes', (await page.evaluate(() => window.bioluma.game.state.regimes.length)) === 7);
    await ctx.close();
  },

  // ── Tap spam: no NaN, seed cost stays sane ──
  async tapSpam() {
    const { ctx, page, log } = await lib.openPage(browser, URL0, { vp: 'mobile' });
    await lib.startGame(page);
    const box = await lib.dishBox(page);
    for (let i = 0; i < 25; i++) await page.touchscreen.tap(box.x + box.width * (0.2 + 0.6 * ((i * 37) % 100) / 100), box.y + box.height * (0.15 + 0.6 * ((i * 53) % 100) / 100));
    await page.waitForTimeout(1000);
    const v = await lib.view(page);
    check('tap spam: essence never negative', v.essence >= 0, `essence=${v.essence}`);
    check('tap spam: some seeds placed', v.stats.seeds > 0);
    const an = await lib.scanText(page);
    check('tap spam: no NaN/undefined/[object Object] in UI', an.length === 0, an.join(' ; '));
    check('tap spam: no page errors', !log.errors.some((e) => e.startsWith('pageerror')));
    await ctx.close();
  },

  // ── Slow: a dish-filling explosion must not be paid as dozens of "species" ──
  async explosion() {
    if (skipSlow) return;
    const { ctx, page } = await lib.bootWithStorage(browser, URL0, {
      'bioluma.game': saveWith(),
      'bioluma.savedAt': String(Date.now()),
      'bioluma.tutorial': tutorialDone,
    });
    await lib.startGame(page);
    // Debug handle: two big dense blobs, which at the base rules (μ 0.15, σ 0.015) grow into a
    // worm pattern that covers the dish (same outcome as tap-spamming overlapping seeds).
    await page.evaluate(() => {
      const s = window.bioluma.sim;
      s.seed({ x: s.gridW * 0.25, y: s.gridH * 0.25, radius: 22, density: 1, noise: 0.3, shape: 'blob', rngSeed: 3 });
      s.seed({ x: s.gridW * 0.7, y: s.gridH * 0.75, radius: 18, density: 1, noise: 0.6, shape: 'ring', rngSeed: 5 });
    });
    const t0 = Date.now();
    let fill = 0;
    while (Date.now() - t0 < 240000) {
      await page.waitForTimeout(5000);
      fill = await page.evaluate(() => window.bioluma.detector.lastReport?.fill ?? 0);
      const steps = await page.evaluate(() => window.bioluma.sim.stepCount);
      if (fill > 0.3 && steps > 2200) break;
    }
    const v = await lib.view(page);
    await shot(page, 'explosion');
    if (fill < 0.25) {
      check('explosion: scenario reached (dish ≥ 25 % covered)', false, `fill=${fill.toFixed(2)} (machine too slow?)`);
    } else {
      check('explosion: worm soup does not register > 5 species', v.species.length <= 5, `species=${v.species.length} fill=${fill.toFixed(2)}`);
      check('explosion: seed cost stays readable (< 1e6)', v.seedCost < 1e6, `seedCost=${v.seedCost.toExponential(2)}`);
      check('explosion: a covered dish does not pay > 20/s at t≈2 min', v.essencePerSec < 20, `eps=${v.essencePerSec.toFixed(1)}`);
    }
    await ctx.close();
  },
};

let crashed = false;
try {
  for (const [name, fn] of Object.entries(tests)) {
    if (only.length && !only.includes(name)) continue;
    console.log(`\n── ${name} ──`);
    try {
      await fn();
    } catch (err) {
      // Keep the scene of the failure for the report.
      for (const ctx of browser.contexts()) for (const p of ctx.pages()) await shot(p, `fail-${name}`).catch(() => {});
      check(`${name}: test ran to completion`, false, String(err?.message ?? err).split('\n').slice(0, 4).join(' / '));
      for (const ctx of browser.contexts()) await ctx.close().catch(() => {});
    }
  }
} catch (err) {
  crashed = true;
  console.error(err);
} finally {
  await browser.close();
  server.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\nQA1 functional: ${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log(`  FAIL ${f.name}${f.detail ? ' — ' + f.detail : ''}`);
process.exit(failed.length || crashed ? 1 : 0);
