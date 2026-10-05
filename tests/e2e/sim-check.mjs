// GPU simulation check in headless Chromium (SwiftShader).
// Usage: node tests/e2e/sim-check.mjs [--shot <png>] [--quick] [--visual-only] [--quality low|medium|high]
//        [--looks palette.id:dish.id,palette.id:dish.id]  (extra screenshots <shot>-<palette>-<dish>.png)
//
// Starts a Vite dev server on the repo, opens tests/e2e/sim-test.html and runs:
//  - Orbium GPU vs CpuLenia on 128×128 after 100 steps (max |ΔA| < 0.02, mass ±1%)
//  - 2000-step Orbium stability (mass within ±20%) and snapshot() vs snapshotFromCpu
//  - lane / storage-format consistency, seeds/erase/capture/import/export vs CPU mirrors,
//    R=18 multi-ring and R=27 kernels vs CPU, context loss + restore
//  - steps/s at 192×240, R=13 and render cost
//  - round walled dish (ADR-025): GPU vs CPU at the glass, seeds/erase without wrap, deflection
//    turns, lysis, rim growth/shrink, a swimmer bouncing off the glass in the real GPU dish
//  - screenshot of several species after 300 steps, and of round dishes (--dish-shot <png>)
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const quick = args.includes('--quick');
const visQuality = args.includes('--quality') ? args[args.indexOf('--quality') + 1] : 'medium';
const visualOnly = args.includes('--visual-only');
const looks = args.includes('--looks')
  ? args[args.indexOf('--looks') + 1].split(',').filter(Boolean).map((x) => x.split(':'))
  : [];
const dishShot = args.includes('--dish-shot')
  ? resolve(args[args.indexOf('--dish-shot') + 1])
  : `${tmpdir()}/bioluma-shots/sim-dish.png`;
const shot = args.includes('--shot')
  ? resolve(args[args.indexOf('--shot') + 1])
  : `${tmpdir()}/bioluma-shots/sim-render.png`;

function findChromium() {
  const base = '/opt/pw-browsers';
  for (const d of readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const p = `${base}/${d}/chrome-linux/chrome`;
    if (existsSync(p)) return p;
  }
  throw new Error('chromium not found under /opt/pw-browsers');
}

const server = await createServer({
  root,
  configFile: resolve(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { port: 5300 + Math.floor(Math.random() * 400), strictPort: false, host: '127.0.0.1' },
});
await server.listen();
const url = `${server.resolvedUrls.local[0]}tests/e2e/sim-test.html`;

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const failures = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  ${detail}` : ''}`);
  if (!ok) failures.push(name);
};
const fmt = (x, d = 5) => (typeof x === 'number' ? Number(x.toPrecision(d)) : x);

try {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 860 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => window.simTestReady === true, null, { timeout: 30000 });
  const run = (fn, ...a) =>
    page.evaluate(([f, a]) => window.simTest[f](...a), [fn, a]);

  if (!visualOnly) {
    // ── accuracy vs CPU ──
    const acc = await run('accuracy', {});
    console.log('backend', JSON.stringify(acc.info));
    check('initial seed equals CPU placeCentered', acc.initDiff < 1e-3, `max|Δ| ${fmt(acc.initDiff)}`);
    check('Orbium 100 steps: max |GPU − CPU| < 0.02', acc.diff100 < 0.02, `max|Δ| ${fmt(acc.diff100)}`);
    check(
      'Orbium 100 steps: mass within 1%',
      Math.abs(acc.massRatio100 - 1) < 0.01,
      `gpu ${fmt(acc.massGpu100)} cpu ${fmt(acc.massCpu100)} ratio ${fmt(acc.massRatio100)}`,
    );
    check(
      'Orbium 2000 steps: mass within ±20%',
      Math.abs(acc.massRatio2000 - 1) < 0.2 && acc.fill2000 < 400,
      `ratio ${fmt(acc.massRatio2000)} fill ${acc.fill2000}`,
    );
    check(
      'snapshot() == snapshotFromCpu(GPU state)',
      acc.snapValueDiff < 1e-4 && acc.snapGradDiff < 1e-4 && acc.snapW === 64 && acc.snapStep === 2000,
      `value ${fmt(acc.snapValueDiff)} grad ${fmt(acc.snapGradDiff)} (max grad ${fmt(acc.snapGradMax)})`,
    );

    if (!quick) {
      for (const [cfg, code] of [[{ format: 'float' }, 'O2u'], [{}, 'OG2g'], [{ format: 'float' }, 'OG2g']]) {
        const a = await run('accuracy', cfg, code);
        console.log(`INFO  ${code} ${a.info.storage}x${a.info.lanes}: max|Δ| at 100 steps ${fmt(a.diff100)}, mass 100 ${fmt(a.massRatio100)}, mass 2000/100 ${fmt(a.massRatio2000)}`);
      }
    }

    check('snapshotAsync() equals snapshot()', acc.asyncSnapDiff === 0 && acc.asyncSnapStep === 2000, `diff ${acc.asyncSnapDiff}`);

    // ── fallback storage: RGBA8 16-bit ──
    const accU8 = await run('accuracy', { format: 'u8' });
    check(
      'RGBA8 fallback: Orbium 100 steps vs CPU',
      accU8.diff100 < 0.02 && Math.abs(accU8.massRatio100 - 1) < 0.01 && Math.abs(accU8.massRatio2000 - 1) < 0.2,
      `storage ${accU8.info.storage}x${accU8.info.lanes} max|Δ| ${fmt(accU8.diff100)} mass ${fmt(accU8.massRatio100)} / ${fmt(accU8.massRatio2000)}`,
    );

    const lanes = await run('laneConsistency');
    const laneMax = Math.max(lanes.f16x2, lanes.f16x1, lanes.f32x4, lanes.u8x2, lanes.u8x1);
    check('lane packings / formats agree after 30 steps', laneMax < 0.01, JSON.stringify(Object.fromEntries(Object.entries(lanes).map(([k, v]) => [k, fmt(v, 3)]))));

    const seeds = await run('seedChecks');
    check('seed shapes/noise/bias/rotation match CPU mirror', seeds.seedDiff < 2e-3, `max|Δ| ${fmt(seeds.seedDiff)} mass ${fmt(seeds.seedMass)}`);
    check('erase matches CPU mirror', seeds.eraseDiff < 2e-3, `max|Δ| ${fmt(seeds.eraseDiff)}`);
    check('capture wraps correctly', seeds.capDiff < 1e-6, `max|Δ| ${fmt(seeds.capDiff)}`);
    check('clear empties the dish', seeds.clearedMass === 0);
    check('export/import 8-bit round trip', seeds.ioDiff <= 0.5 / 255 + 1e-3, `max|Δ| ${fmt(seeds.ioDiff)}`);
    check('import of another size is centred/cropped', Math.abs(seeds.bigImportMass - seeds.expectedBigMass) < 1, `${fmt(seeds.bigImportMass)}`);

    // ── round walled dish (ADR-025) ──
    for (const cfg of quick ? [{}] : [{}, { format: 'u8' }, { format: 'float' }]) {
      const d = await run('dishChecks', cfg);
      const tag = cfg.format ? ` [${cfg.format}]` : '';
      check(
        `dish${tag}: Orbium into the glass, GPU vs CPU after 60 steps`,
        d.initDiff < 1e-3 && d.wallDiff60 < 0.02 && Math.abs(d.wallMassRatio60 - 1) < 0.01 && d.wallOutside60 === 0 && d.wallCpuMass60 > 20 && d.wallContact60 < 2,
        `max|Δ| ${fmt(d.wallDiff60)} mass ${fmt(d.wallMassRatio60)} cpu mass ${fmt(d.wallCpuMass60)} gap to glass ${fmt(d.wallContact60, 3)} outside ${d.wallOutside60}`,
      );
      check(
        `dish${tag}: seeds/erase without wrap match CPU, nothing outside`,
        d.seedDiff < 2e-3 && d.eraseDiff < 2e-3 && d.seedOutside === 0 && d.wrapLeak === 0,
        `seed ${fmt(d.seedDiff)} erase ${fmt(d.eraseDiff)} outside ${d.seedOutside} wrap ${fmt(d.wrapLeak)}`,
      );
      check(`dish${tag}: deflection turn matches rotateDiscCpu`, d.turnDiff < 2e-3 && Math.abs(d.turnMassRatio - 1) < 0.03, `max|Δ| ${fmt(d.turnDiff)} mass ${fmt(d.turnMassRatio)}`);
      check(`dish${tag}: lysis matches CPU and dissolves`, d.lysisDiff < 0.02 && d.lysisMassDrop < 0.95 && d.lysisMassDrop > 0.05, `max|Δ| ${fmt(d.lysisDiff)} mass ×${fmt(d.lysisMassDrop)}`);
      check(
        `dish${tag}: rim growth keeps matter, shrink clears, torus restored`,
        d.growDiff === 0 && d.shrinkOutside === 0 && d.torusWrapsAgain === 1,
        `grow ${fmt(d.growDiff)} shrink ${d.shrinkOutside} torus ${d.torusWrapsAgain}`,
      );
    }
    const b = await run('bounce', {}, quick ? 1200 : 2000, true);
    check(
      'dish: Orbium bounces off the glass in the GPU dish (Ø96, deflection from snapshots)',
      b.turns >= 4 && b.nearRim >= 4 && b.massRatio > 0.75 && b.massRatio < 1.3,
      JSON.stringify(Object.fromEntries(Object.entries(b).map(([k, v]) => [k, fmt(v, 3)]))),
    );
    if (!quick) {
      const nb = await run('bounce', {}, 1200, false);
      check('dish: without deflection the bare glass kills Orbium (control)', nb.massRatio < 0.2, `mass ×${fmt(nb.massRatio, 3)}`);
      const dp = await run('dishPerf', 1500, 224);
      const dp96 = await run('dishPerf', 1500, 96);
      console.log(`PERF  round dish ${dp.grid}² Ø${dp.diameter}: ${fmt(dp.stepsPerSec, 4)} steps/s; Ø96: ${fmt(dp96.stepsPerSec, 4)} steps/s`);
      const rc = await run('dishRenderCost', 10);
      console.log(`PERF  screen pass 780×1688: torus ${fmt(rc.torusMs, 3)} ms, round dish (glass, frost, ring, 10 tints) ${fmt(rc.dishMs, 3)} ms`);
    }

    if (!quick) {
      const big = await run('bigKernels');
      check(
        'R=18 multi-ring and R=27 match CPU after 50 steps',
        big.R18_3GH2n_diff50 < 0.03 &&
          big.R27_scaledOrbium_diff50 < 0.03 &&
          big.R18_3GH2n_cpuMass50 > 50 &&
          big.R27_scaledOrbium_cpuMass50 > 50 &&
          Math.abs(big.R27_scaledOrbium_massRatio - 1) < 0.01,
        JSON.stringify(Object.fromEntries(Object.entries(big).map(([k, v]) => [k, fmt(v, 3)]))),
      );
    }

    const lost = await run('contextLoss');
    if (lost.skipped) console.log('SKIP  context loss (WEBGL_lose_context unavailable)');
    else
      check(
        'context loss: no throw, restore keeps state',
        lost.lostCalls === 1 && lost.restoredCalls === 1 && Math.abs(lost.massAfterRestore - lost.massBefore) < 0.5 && lost.massAfter10More > 0,
        JSON.stringify(lost),
      );
    if (!lost.skipped) check('context loss before any backup: dish comes back empty', lost.massNoBackup === 0, `mass ${lost.massNoBackup}`);

    // ── performance ──
    const perf = await run('perf', 192, 240, 13, quick ? 1500 : 3000, {});
    console.log(`PERF  192×240 R=13 (${perf.info.storage}x${perf.info.lanes}, ${fmt(perf.info.fetchesPerCell, 3)} fetches/cell): ${fmt(perf.stepsPerSec, 4)} steps/s → recommended '${perf.recommended}'  [${perf.info.renderer}]`);
    if (!quick) {
      const perf27 = await run('perf', 192, 240, 27, 2000, {});
      console.log(`PERF  192×240 R=27: ${fmt(perf27.stepsPerSec, 4)} steps/s`);
      const perfF32 = await run('perf', 192, 240, 13, 2000, { format: 'float' });
      console.log(`PERF  192×240 R=13 RGBA32F (${perfF32.info.storage}x${perfF32.info.lanes}): ${fmt(perfF32.stepsPerSec, 4)} steps/s`);
      const perfU8 = await run('perf', 192, 240, 13, 2000, { format: 'u8' });
      console.log(`PERF  192×240 R=13 RGBA8 fallback (${perfU8.info.lanes} lanes): ${fmt(perfU8.stepsPerSec, 4)} steps/s`);
      const perfL1 = await run('perf', 192, 240, 13, 2000, { maxLanes: 1 });
      console.log(`PERF  192×240 R=13 unpacked (1 lane, for comparison): ${fmt(perfL1.stepsPerSec, 4)} steps/s`);
      for (const q of ['low', 'medium', 'high']) {
        const r = await run('renderPerf', q, 10);
        console.log(`PERF  render+step ${q} at ${r.backing.join('×')}: ${fmt(r.msPerFrame, 3)} ms/frame (SwiftShader)`);
      }
    }
  }

  // ── visuals ──
  const vis = await run('visual', visQuality);
  console.log('visual', JSON.stringify(vis.map((v) => [v.label, fmt(v.mass, 4)])));
  for (const v of vis) check(`visual dish alive: ${v.label}`, v.mass > 20);
  await page.evaluate(() => window.simTest.rerender());
  mkdirSync(dirname(shot), { recursive: true });
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`screenshot → ${shot}`);
  // Cosmetic looks (palette + dish theme), then back to the defaults: must match the first shot.
  for (const [pal, dish] of looks) {
    await page.evaluate(([p, d]) => window.simTest.restyle(p, d), [pal, dish ?? 'dish.nightlab']);
    const out = shot.replace(/\.png$/, `-${pal}-${dish ?? 'dish.nightlab'}.png`);
    await page.screenshot({ path: out, fullPage: true });
    console.log(`screenshot → ${out}`);
  }
  if (looks.length) {
    await page.evaluate(() => window.simTest.restyle('palette.bioluma', 'dish.nightlab'));
    const out = shot.replace(/\.png$/, '-restored-default.png');
    await page.screenshot({ path: out, fullPage: true });
    console.log(`screenshot → ${out}`);
  }
  // Round dishes rendered by the GPU path.
  await page.evaluate(() => {
    document.getElementById('panels').innerHTML = '';
  });
  const dv = await run('dishVisual', visQuality);
  for (const v of dv) check(`dish visual: ${v.label} (alive, nothing outside the glass)`, v.mass > 20 && v.outside === 0, `mass ${fmt(v.mass, 4)}`);
  mkdirSync(dirname(dishShot), { recursive: true });
  await page.screenshot({ path: dishShot, fullPage: true });
  console.log(`screenshot → ${dishShot}`);
  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} catch (err) {
  console.error(err);
  failures.push(String(err));
} finally {
  await browser.close();
  await server.close();
}
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall sim checks passed');
