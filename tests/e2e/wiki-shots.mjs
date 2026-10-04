#!/usr/bin/env node
/**
 * Regenerates the wiki's game pictures (docs/wiki/images/m-*, en-*, d-*) from the REAL game, played
 * like a player by tests/e2e/session-play.mjs: the title, VELA's first words, the first seeds and
 * Momentos, the clock, "¡Tiempo!", the summary, the research tree, the start card with two Worlds,
 * session 2 with its Encargo, Abono, a Spark, the Bestiary, the pause card.
 *
 *   node tests/e2e/wiki-shots.mjs                 # build (e2e flavour) + play + write the pictures
 *   node tests/e2e/wiki-shots.mjs --dist <dir>    # reuse a build made with VITE_E2E=1
 *   node tests/e2e/wiki-shots.mjs --out <dir>     # somewhere else than docs/wiki/images
 *
 * Names: m-NN-*  Spanish phone (390×844, dark), en-NN-*  English phone (light), d-NN-*  desktop
 * (1366×768, Spanish, dark). Phone pictures are resized to 560 px wide; every picture is a dithered
 * 256-colour PNG8 under 400 KB when ImageMagick `convert` is there (copied raw otherwise).
 * The behaviour icons, hero and social-preview banners are not touched.
 *
 * What is real: everything. The only shortcut is time (session-play's lockstep clock in the e2e
 * build). Needs playwright-core + a Chromium under /opt/pw-browsers (never `playwright install`).
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const OUT = path.resolve(opt('--out', path.join(ROOT, 'docs/wiki/images')));
const WORK = mkdtempSync(path.join(os.tmpdir(), 'bioluma-wiki-'));
const RAW = path.join(WORK, 'raw');
const MAX_KB = 390;
mkdirSync(OUT, { recursive: true });
mkdirSync(RAW, { recursive: true });
const log = (...a) => console.log('[wiki-shots]', ...a);

let dist = opt('--dist', '');
if (!dist) {
  dist = path.join(WORK, 'dist');
  log(`building (VITE_E2E=1) into ${dist}…`);
  const b = spawnSync('npx', ['vite', 'build', '--outDir', dist, '--emptyOutDir'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, VITE_E2E: '1' } });
  if (b.status !== 0) throw new Error('build failed');
}

// Play: the Spanish phone, the English phone and the desktop (each writes its own prefix).
let failed = false;
for (const only of ['mobile-es-dark', 'mobile-en-light', 'desktop-es-dark']) {
  log(`playing ${only}…`);
  const r = spawnSync('node', [path.join(ROOT, 'tests/e2e/session-play.mjs'), '--dist', dist, '--only', only, '--sessions', '2', '--wiki', RAW, '--out', path.join(WORK, only)], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    failed = true;
    log(`${only}: the play-through reported problems (pictures are still written)`);
  }
}

// Post-process into the wiki.
const hasConvert = spawnSync('convert', ['-version'], { stdio: 'ignore' }).status === 0;
const kb = (f) => Math.round(statSync(f).size / 1024);
function quantise(src, out, resize) {
  for (const colors of [256, 192, 128, 96, 64]) {
    spawnSync('convert', [src, '-strip', ...resize, '-dither', 'FloydSteinberg', '-colors', String(colors), '-define', 'png:compression-level=9', `PNG8:${out}`]);
    if (kb(out) <= MAX_KB) return;
  }
}
if (!hasConvert) log('ImageMagick `convert` not found: copying raw PNGs (they may exceed 400 KB)');
const made = readdirSync(RAW).filter((f) => f.endsWith('.png'));
for (const f of made) {
  const out = path.join(OUT, f);
  if (!hasConvert) copyFileSync(path.join(RAW, f), out);
  else quantise(path.join(RAW, f), out, f.startsWith('m-') || f.startsWith('en-') ? ['-resize', '560x'] : []);
}
log(`${made.length} pictures written to ${OUT}`);

// Pictures of the retired loop (Laboratorio, Calibrar, Genoma, Extinción) that no page shows any more.
const pages = readdirSync(path.join(ROOT, 'docs/wiki')).filter((f) => f.endsWith('.md'));
const used = new Set();
for (const p of pages) for (const m of readFileSync(path.join(ROOT, 'docs/wiki', p), 'utf8').matchAll(/images\/([\w.-]+\.png)/g)) used.add(m[1]);
if (OUT === path.join(ROOT, 'docs/wiki/images')) {
  for (const f of readdirSync(OUT)) {
    if (!f.endsWith('.png') || used.has(f) || made.includes(f)) continue;
    if (/^(m|en|d)-\d\d-/.test(f)) {
      rmSync(path.join(OUT, f));
      log(`removed unused ${f}`);
    }
  }
}
const missing = [...used].filter((f) => !existsSync(path.join(OUT, f)));
if (missing.length) {
  log(`pages show pictures that do not exist: ${missing.join(', ')}`);
  failed = true;
}
rmSync(WORK, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
