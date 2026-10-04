// QA #3 shared helpers (balance & performance). Serves nothing itself: pass the URL of a running
// `vite preview` of a VITE_E2E=1 build (exposes window.bioluma).
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

export const SHOTS = '/tmp/claude-0/-home-user-Lenia/a5114f5a-39a4-539d-9a6a-14e769759a92/scratchpad';
mkdirSync(SHOTS, { recursive: true });

export function findChromium() {
  const base = '/opt/pw-browsers';
  for (const d of readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const p = `${base}/${d}/chrome-linux/chrome`;
    if (existsSync(p)) return p;
  }
  throw new Error('chromium not found under /opt/pw-browsers');
}

export const VIEWPORTS = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { width: 1366, height: 768, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};

export async function launch(extraArgs = []) {
  return chromium.launch({
    executablePath: findChromium(),
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--autoplay-policy=no-user-gesture-required',
      '--enable-precise-memory-info',
      '--js-flags=--expose-gc',
      ...extraArgs,
    ],
  });
}

/** New context + page for a viewport; collects console errors (fonts ignored). */
export async function openGame(browser, url, vpName = 'mobile', { lang = 'es-CO', initSave = null } = {}) {
  const vp = VIEWPORTS[vpName];
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    locale: lang,
  });
  if (initSave) {
    await ctx.addInitScript((s) => {
      if (!sessionStorage.getItem('qa3-init')) {
        sessionStorage.setItem('qa3-init', '1');
        for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
      }
    }, initSave);
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_CERT|fonts\.(googleapis|gstatic)|ERR_TUNNEL|net::/.test(m.text() + (m.location()?.url ?? '')))
      errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(url);
  await page.waitForFunction(() => !!window.bioluma, null, { timeout: 20000 });
  await page.waitForTimeout(600);
  return { ctx, page, errors, vp };
}

export async function passSplash(page, { skipTutorial = true } = {}) {
  const splash = page.locator('[data-testid="splash"]');
  if (await splash.isVisible().catch(() => false)) {
    await splash.click();
    await page.waitForTimeout(700);
  }
  if (skipTutorial) {
    const skip = page.locator('[data-testid="tutorial-skip"]');
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
      await page.waitForTimeout(300);
    }
  }
}

/** Tap the dish at fractional coords (real input path). */
export async function tapDish(page, vp, fx, fy) {
  const box = await page.locator('canvas.gl-dish').boundingBox();
  const x = box.x + box.width * fx;
  const y = box.y + box.height * fy;
  if (vp.hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** Compact snapshot of game state. */
export async function snap(page) {
  return page.evaluate(() => {
    const b = window.bioluma;
    const v = b.game.view();
    return {
      step: b.sim.stepCount,
      essence: v.essence,
      eps: v.essencePerSec,
      samples: v.samples,
      genome: v.genome,
      era: v.era,
      seedCost: v.seedCost,
      stable: v.creatures.filter((c) => c.state === 'stable').length,
      alive: v.creatures.length,
      species: v.species.length,
      behaviors: v.behaviorsSeen.slice(),
      objective: v.objective ? v.objective.es : null,
      objProg: v.objectiveProgress,
      golden: !!v.golden,
      buffs: v.buffs.map((x) => `${x.id}×${x.mult}`),
      speeds: v.tools.speeds,
      ext: { p: v.extinction.progress, avail: v.extinction.available, g: v.extinction.genomeGain, g10: v.extinction.gainIn10Min },
      ups: v.upgrades.filter((u) => u.unlocked && !u.maxed).map((u) => ({ id: u.id, lvl: u.level, cost: Math.round(u.cost), cur: u.currency, ok: u.affordable })),
      mult: v.multipliers,
      seeds: v.stats.seeds,
      playTime: v.stats.playTime,
      achievements: v.achievements.filter((a) => a.done).length,
    };
  });
}

export function pct(arr, p) {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
