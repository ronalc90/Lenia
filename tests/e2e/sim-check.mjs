// GPU simulation check in headless Chromium (SwiftShader).
// Usage: node tests/e2e/sim-check.mjs [--shot <png>] [--quick] [--visual-only] [--quality low|medium|high]
//
// Starts a Vite dev server on the repo, opens tests/e2e/sim-test.html and runs:
//  - Orbium GPU vs CpuLenia on 128×128 after 100 steps (max |ΔA| < 0.02, mass ±1%)
//  - 2000-step Orbium stability (mass within ±20%) and snapshot() vs snapshotFromCpu
//  - lane / storage-format consistency, seeds/erase/capture/import/export vs CPU mirrors,
//    R=18 multi-ring and R=27 kernels vs CPU, context loss + restore
//  - steps/s at 192×240, R=13 and render cost
//  - screenshot of several species after 300 steps
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const quick = args.includes('--quick');
const visQuality = args.includes('--quality') ? args[args.indexOf('--quality') + 1] : 'medium';
const visualOnly = args.includes('--visual-only');
const shot = args.includes('--shot')
  ? resolve(args[args.indexOf('--shot') + 1])
  : '/tmp/claude-0/-home-user-Lenia/a5114f5a-39a4-539d-9a6a-14e769759a92/scratchpad/sim-render.png';

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
