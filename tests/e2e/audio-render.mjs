#!/usr/bin/env node
/**
 * Offline audio render check for Bioluma.
 *
 * Serves the repo with Vite, opens tests/e2e/audio-test.html in headless
 * Chromium (playwright-core, browser under /opt/pw-browsers), and renders
 * the REAL audio engine through an OfflineAudioContext:
 *   - preview:    intensity sweep 0 → 5 + a burst of every SFX (incl. floods)
 *   - extinction: sweep, cut to silence, single note, gentle re-entry
 *   - controls:   pause duck and recovery
 * Checks: no NaN, peak < −1 dBFS, no clipping, RMS per section in range,
 * no silence gaps where music should play, levels rise with intensity,
 * floods rate-limited. Writes the preview to a 16-bit stereo WAV.
 *
 * Usage: node tests/e2e/audio-render.mjs [--out path.wav] [--full]
 *   --full also renders one whole A A B A form (≈ 107 s) to <out>-full-form.wav
 */
import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const defaultOut = '/tmp/claude-0/-home-user-Lenia/a5114f5a-39a4-539d-9a6a-14e769759a92/scratchpad/bioluma-music-preview.wav';
const outPath = outIdx >= 0 ? args[outIdx + 1] : process.env.BIOLUMA_WAV ?? defaultOut;

function findChromium() {
  const base = '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  const dirs = readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse();
  for (const d of dirs) {
    const p = `${base}/${d}/chrome-linux/chrome`;
    if (existsSync(p)) return p;
  }
  return undefined;
}

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`);
};

function report(r) {
  const a = r.analysis;
  console.log(`\n[${r.name}] ${a.duration.toFixed(1)} s @ ${a.sampleRate} Hz, rendered in ${r.renderMs} ms`);
  console.log(`  peak ${a.peakDb} dBFS at ${a.peakTime}s, clips ${a.clipCount}, NaN ${a.nanCount}, DC ${a.dcOffset.join('/')}, clicks ${a.clicks.count} ${a.clicks.times.join(' ')}`);
  if (r.levels?.length) console.log(`  levels per bar: ${r.levels.join(' ')}`);
  console.log(`  sfx: played ${r.sfxStats.played}, dropped ${r.sfxStats.dropped}, stolen ${r.sfxStats.stolen}`);
  for (const s of a.sections) {
    const bands = s.bands.map((b) => `${b.name.split(' ')[0]} ${b.relDb}`).join(', ');
    console.log(
      `  ${s.ok ? '·' : '!'} ${s.name.padEnd(18)} ${s.start.toFixed(1)}–${s.end.toFixed(1)}s  RMS ${String(s.rmsDb).padStart(6)}  peak ${String(s.peakDb).padStart(6)}  ` +
        `gap ${s.longestSilence}s  centroid ${s.centroid} Hz  corr ${s.correlation}  [${bands}]${s.problems.length ? '  ← ' + s.problems.join('; ') : ''}`,
    );
  }
  check(a.nanCount === 0, `${r.name}: no NaN samples`);
  check(a.peakDb < -1, `${r.name}: peak ${a.peakDb} dBFS < -1 dBFS`);
  check(a.clipCount === 0, `${r.name}: no clipped samples`);
  check(a.clicks.count === 0, `${r.name}: no clicks detected${a.clicks.count ? ' (at ' + a.clicks.times.join(', ') + ' s)' : ''}`);
  check(Math.abs(a.dcOffset[0]) < 0.005 && Math.abs(a.dcOffset[1]) < 0.005, `${r.name}: DC offset small`);
  for (const s of a.sections) check(s.ok, `${r.name}/${s.name}: ${s.ok ? 'RMS & continuity in range' : s.problems.join('; ')}`);
}

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 5300 + Math.floor(Math.random() * 400), strictPort: false },
});
await server.listen();
const base = server.resolvedUrls?.local?.[0] ?? `http://127.0.0.1:${server.config.server.port}/`;

const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('  [console]', m.text());
  });
  await page.goto(new URL('tests/e2e/audio-test.html', base).href);
  await page.waitForFunction(() => window.__audioTestReady === true, null, { timeout: 30000 });

  const preview = await page.evaluate(() => window.biolumaAudioTest('preview', true), null);
  report(preview);
  const secs = Object.fromEntries(preview.analysis.sections.map((s) => [s.name.split(' ')[0], s]));
  check(secs.L5.rmsDb > secs.L0.rmsDb + 6, `preview: full intensity is clearly louder than the empty dish (${secs.L0.rmsDb} → ${secs.L5.rmsDb} dB)`);
  check(secs.L2.rmsDb >= secs.L0.rmsDb && secs.L4.rmsDb >= secs.L2.rmsDb - 1, 'preview: loudness grows with intensity');
  check(preview.levels.includes(5) && preview.levels[0] === 0, `preview: level sweeps 0 → 5`);
  check(preview.sfxStats.dropped >= 40, `preview: floods rate-limited (${preview.sfxStats.dropped} dropped)`);
  if (preview.wav) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, Buffer.from(preview.wav, 'base64'));
    console.log(`  wrote ${outPath}`);
  }

  const ext = await page.evaluate(() => window.biolumaAudioTest('extinction', !!window), null);
  report(ext);
  if (ext.wav) writeFileSync(outPath.replace(/\.wav$/, '') + '-extinction.wav', Buffer.from(ext.wav, 'base64'));

  console.log('\n[realtime API smoke]');
  const smoke = await page.evaluate(() => window.biolumaRealtimeSmoke(), null);
  console.log('  ' + smoke.join('\n  '));
  check(
    smoke.join('|') ===
      'running after unlock: true|running while muted: false|running after unmute: true|running while hidden: false|running after resume: true|running after dispose: false',
    'realtime: unlock / mute / hide / resume / dispose drive the AudioContext state',
  );

  const ctl = await page.evaluate(() => window.biolumaAudioTest('controls', false), null);
  report(ctl);
  const [playing, paused, resumed] = ctl.analysis.sections;
  check(paused.rmsDb < playing.rmsDb - 4, `controls: pause ducks the music (${playing.rmsDb} → ${paused.rmsDb} dB)`);
  const hi = (s) => s.bands.find((b) => b.name.startsWith('high')).relDb;
  check(hi(paused) < hi(playing) - 15, `controls: pause low-passes the music (3-8 kHz band ${hi(playing)} → ${hi(paused)} dB rel)`);
  check(Math.abs(resumed.rmsDb - playing.rmsDb) < 4, 'controls: music recovers after unpause');

  if (args.includes('--full')) {
    // Optional: one whole A A B A form at a busy dish, for listening.
    const form = await page.evaluate(() => window.biolumaAudioTest('form', true), null);
    report(form);
    writeFileSync(outPath.replace(/\.wav$/, '') + '-full-form.wav', Buffer.from(form.wav, 'base64'));
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} audio check(s) failed:\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('\nAll audio checks passed.');
