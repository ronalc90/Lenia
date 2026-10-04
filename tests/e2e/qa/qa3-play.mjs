// QA #3 — Part A: play the real game like an attentive player and log the pacing.
// Usage: node tests/e2e/qa/qa3-play.mjs <url> [minutes=8] [mobile|desktop] [--tutorial]
// Player policy (all through the real UI): follow the tutorial, tap free spots of the dish when a
// seed is cheap, catch every golden spark (tap on it), buy the cheapest affordable Lab upgrade by
// tapping its card button, open the Bestiary on new species, move μ with the real slider every
// ~2 min once the Calibrador is owned. Writes a JSON timeline + screenshots to the scratchpad.
import { writeFileSync } from 'node:fs';
import { launch, openGame, passSplash, snap, SHOTS } from './qa3-lib.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const url = args[0] ?? 'http://localhost:5737/';
const minutes = Number(args[1] ?? 8);
const vpName = args[2] ?? 'mobile';
const withTutorial = process.argv.includes('--tutorial');
const tag = `qa3-play-${vpName}${url.includes('5739') ? '-head' : ''}`;

const browser = await launch();
const { page, errors, vp } = await openGame(browser, url, vpName);
await page.screenshot({ path: `${SHOTS}/${tag}-00-title.png` });
await passSplash(page, { skipTutorial: !withTutorial });

// Record bus events with timestamps.
await page.evaluate(() => {
  const b = window.bioluma;
  window.__qa = { t0: performance.now(), ev: [] };
  const rec = (name) => (p) => window.__qa.ev.push({ t: (performance.now() - window.__qa.t0) / 1000, name, p: JSON.parse(JSON.stringify(p ?? {})) });
  for (const n of ['upgradeBought', 'speciesNew', 'goldenSpawn', 'goldenCollected', 'goldenMissed', 'achievement', 'toast', 'creatureStable', 'creatureDied', 'creatureExploded', 'behaviorNew', 'seed', 'seedDenied', 'extinctionDone'])
    b.bus.on(n, rec(n));
});

const t0 = Date.now();
const el = () => (Date.now() - t0) / 1000;
const timeline = [];
const shotsAt = [5, 15, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900];
let shotIdx = 0;
let lastSeed = -99;
let lastCal = -999;
let calMoves = 0;
let lastSnap = -99;
const actions = [];

async function tapGrid(gx, gy) {
  const p = await page.evaluate(([x, y]) => {
    const r = document.querySelector('canvas.gl-dish').getBoundingClientRect();
    const s = window.bioluma.camera.gridToScreen(x, y);
    return { x: r.left + s.x, y: r.top + s.y, ok: s.x > 4 && s.y > 4 && s.x < r.width - 4 && s.y < r.height - 4 };
  }, [gx, gy]);
  if (!p.ok) return false;
  if (vp.hasTouch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  return true;
}

while (el() < minutes * 60) {
  const t = el();
  // Tutorial buttons ("next" / "got it").
  const next = page.locator('[data-testid="tutorial-next"]');
  if (await next.isVisible().catch(() => false)) {
    await page.waitForTimeout(1200); // reading time
    await next.click().catch(() => {});
    actions.push({ t, a: 'tutorial-next' });
  }
  // Modal open (era summary, species card...): close it.
  const closeBtn = page.locator('.modal [data-close], .modal .close, .modal-close').first();
  if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click().catch(() => {});

  const st = await page.evaluate(() => {
    const v = window.bioluma.game.view();
    return {
      g: v.golden,
      essence: v.essence,
      seedCost: v.seedCost,
      canSeed: v.canSeed,
      free: v.charges.free + (v.pipette.progress >= 1 ? 1 : 0),
      cr: v.creatures.map((c) => [c.x, c.y, c.state]),
      ups: v.upgrades.filter((u) => u.tab === 'lab' && u.unlocked && !u.maxed && u.affordable).sort((a, b) => a.cost - b.cost).map((u) => u.id),
      cal: v.calibration,
      tabs: v.tabs,
      eps: v.essencePerSec,
      grid: [window.bioluma.sim.gridW, window.bioluma.sim.gridH],
      R: window.bioluma.sim.params.R,
      tut: !!document.querySelector('.coach:not([hidden])'),
    };
  });
  // 1) Golden spark: a human reacts within ~1 s.
  if (st.g) {
    await tapGrid(st.g.x, st.g.y);
    actions.push({ t, a: 'tap-golden' });
    await page.waitForTimeout(150);
    continue;
  }
  // 2) Buy the cheapest affordable Lab upgrade through its card.
  if (st.ups.length && st.tabs.lab) {
    const id = st.ups[0];
    const tab = page.locator('[data-tab="lab"]');
    if (await tab.isVisible().catch(() => false)) {
      const active = await tab.getAttribute('aria-selected').catch(() => null);
      if (active !== 'true') await tab.click().catch(() => {});
      const btn = page.locator(`[data-up="${id}"] .buy`);
      if (await btn.isVisible().catch(() => false)) {
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await btn.click().catch(() => {});
        actions.push({ t, a: 'buy', id });
      }
    }
  }
  // 3) Seed a free spot when it is cheap (≤ 35 % of the bank) or free, or the dish is empty.
  const alive = st.cr.filter((c) => c[2] === 'stable' || c[2] === 'born').length;
  if (t - lastSeed > 2.5 && st.canSeed && (st.free > 0 || alive === 0 || st.seedCost <= 0.35 * st.essence)) {
    const [W, H] = st.grid;
    let best = null;
    let bestD = -1;
    for (let i = 0; i < 40; i++) {
      const x = 8 + Math.random() * (W - 16);
      const y = 8 + Math.random() * (H - 16);
      let d = 1e9;
      for (const c of st.cr) {
        let dx = Math.abs(c[0] - x);
        let dy = Math.abs(c[1] - y);
        dx = Math.min(dx, W - dx);
        dy = Math.min(dy, H - dy);
        d = Math.min(d, Math.hypot(dx, dy));
      }
      if (d > bestD) {
        bestD = d;
        best = { x, y };
      }
    }
    if (best && bestD > 2.2 * st.R) {
      if (await tapGrid(best.x, best.y)) {
        lastSeed = t;
        actions.push({ t, a: 'seed', cost: st.seedCost });
      }
    }
  }
  // 4) Move μ with the real slider every ~2 min once unlocked (explorer habit).
  if (st.cal.muRange && t - lastCal > 120) {
    lastCal = t;
    const tab = page.locator('[data-tab="calibrate"]');
    if (await tab.isVisible().catch(() => false)) {
      await tab.click().catch(() => {});
      await page.waitForTimeout(400);
      const [m0, m1] = st.cal.muRange;
      // Alternate between the Orbium home and a nearby regime.
      const target = calMoves % 2 === 0 ? Math.min(m1, 0.15 + 0.02 + Math.random() * 0.01) : 0.15;
      const ok = await page.evaluate((val) => {
        const r = [...document.querySelectorAll('input[type="range"]')].find((x) => x.offsetParent !== null);
        if (!r) return false;
        const min = Number(r.min);
        const max = Number(r.max);
        // Slider may be normalised: map μ to its scale.
        const frac = (val - window.bioluma.game.view().calibration.muRange[0]) / (window.bioluma.game.view().calibration.muRange[1] - window.bioluma.game.view().calibration.muRange[0]);
        r.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        r.value = String(min + frac * (max - min));
        r.dispatchEvent(new Event('input', { bubbles: true }));
        r.dispatchEvent(new Event('change', { bubbles: true }));
        r.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        return true;
      }, target);
      calMoves++;
      actions.push({ t, a: 'move-mu', target, ok });
      await page.screenshot({ path: `${SHOTS}/${tag}-cal-${calMoves}.png` });
      await page.locator('[data-tab="lab"]').click().catch(() => {});
    }
  }
  // Timeline every 5 s.
  if (t - lastSnap >= 5) {
    lastSnap = t;
    const s = await snap(page);
    timeline.push({ t: Math.round(t), ...s });
  }
  if (shotIdx < shotsAt.length && t >= shotsAt[shotIdx]) {
    await page.screenshot({ path: `${SHOTS}/${tag}-t${String(shotsAt[shotIdx]).padStart(4, '0')}.png` });
    shotIdx++;
  }
  await page.waitForTimeout(600);
}

const ev = await page.evaluate(() => window.__qa.ev);
await page.screenshot({ path: `${SHOTS}/${tag}-end.png` });
const out = { url, minutes, vpName, withTutorial, timeline, actions, events: ev, errors };
writeFileSync(`${SHOTS}/${tag}.json`, JSON.stringify(out, null, 1));
await browser.close();

// Summary.
const first = (n) => ev.find((e) => e.name === n)?.t ?? null;
const steps = timeline.length ? timeline[timeline.length - 1].step / (timeline[timeline.length - 1].t || 1) : 0;
console.log(`sim steps/s ≈ ${steps.toFixed(1)} (target 30)`);
console.log('first stable', first('creatureStable'), 'first species', first('speciesNew'), 'first golden spawn', first('goldenSpawn'));
console.log('purchases:', ev.filter((e) => e.name === 'upgradeBought').map((e) => `${e.t.toFixed(0)}s ${e.p.id}→${e.p.level}`).join(', '));
console.log('species:', ev.filter((e) => e.name === 'speciesNew').map((e) => `${e.t.toFixed(0)}s ${e.p.name}(${e.p.rarity})`).join(', '));
console.log('goldens:', ev.filter((e) => e.name.startsWith('golden')).map((e) => `${e.t.toFixed(0)}s ${e.name}`).join(', '));
console.log('achievements:', ev.filter((e) => e.name === 'achievement').map((e) => `${e.t.toFixed(0)}s ${e.p.id}`).join(', '));
console.log('toasts:', ev.filter((e) => e.name === 'toast').map((e) => `${e.t.toFixed(0)}s ${e.p.text?.es}`).join(' | '));
for (const s of timeline.filter((_, i) => i % 6 === 0)) console.log(`${String(s.t).padStart(4)}s E=${s.essence.toFixed(1)} eps=${s.eps.toFixed(2)} stable=${s.stable} alive=${s.alive} sp=${s.species} seed=${s.seedCost.toFixed(1)} obj="${s.objective}" step=${s.step}`);
console.log('errors:', errors.slice(0, 5));
