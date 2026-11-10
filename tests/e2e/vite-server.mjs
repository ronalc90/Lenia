// Shared by the e2e scripts: run the project's own Vite (never `npx`, which may stop to ask the registry and
// miss the start window) and make sure every server a script starts stops with it: on success, on a thrown
// error, on process.exit and on Ctrl-C / SIGTERM. `npx vite` also left the real server running when only the
// npm wrapper was killed, so servers run in their own process group and the whole group is stopped.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** The project's Vite binary (node_modules/.bin/vite). */
export const VITE = path.join(ROOT, 'node_modules/.bin/vite');
/** Default output of `npm run e2e`: never dist/, so a build with the debug handle (VITE_E2E) is never packaged. */
export const E2E_DIST = path.join(ROOT, 'dist-e2e');

export function findChromium() {
  const base = '/opt/pw-browsers';
  for (const d of readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    for (const sub of ['chrome-linux64', 'chrome-linux']) {
      const p = `${base}/${d}/${sub}/chrome`;
      if (existsSync(p)) return p;
    }
  }
  throw new Error('chromium not found under /opt/pw-browsers');
}

/** A TCP port that is free right now (the OS picks it; no random guesses that collide with a sibling run). */
export function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

const live = new Set();
let hooked = false;
function hookExit() {
  if (hooked) return;
  hooked = true;
  process.on('exit', () => {
    for (const stop of [...live]) stop();
  });
  for (const [sig, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
    ['SIGHUP', 129],
  ]) {
    process.on(sig, () => {
      for (const stop of [...live]) stop();
      process.exit(code);
    });
  }
}

/**
 * Ties a spawned server to this script: it is stopped (its process group when `detached`) when the script
 * exits for any reason. Returns the stop function (safe to call more than once).
 */
export function stopWithScript(child) {
  hookExit();
  const stop = () => {
    live.delete(stop);
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      try {
        child.kill('SIGTERM');
      } catch {
        /* already gone */
      }
    }
  };
  live.add(stop);
  return stop;
}

/** `vite build` with the debug handle (VITE_E2E=1) into `outDir`; throws when the build fails. */
export function viteBuild(outDir, env = {}) {
  const r = spawnSync(VITE, ['build', '--outDir', path.resolve(outDir), '--emptyOutDir'], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, VITE_E2E: '1', ...env },
  });
  if (r.status !== 0) throw new Error(`vite build into ${outDir} failed`);
}

/**
 * Starts `vite <args>` (own process group, tied to this script) and resolves with `{ child, stop, log }`
 * once its output mentions `ready` (e.g. the port). Rejects, and stops it, on timeout or early exit.
 */
export function startVite(args, { ready, timeoutMs = 120_000, env = {} } = {}) {
  const child = spawn(VITE, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BROWSER: 'none', ...env }, detached: true });
  const stop = stopWithScript(child);
  const server = { child, stop, log: '' };
  return new Promise((resolve, reject) => {
    const fail = (why) => {
      clearTimeout(timer);
      stop();
      reject(new Error(`vite ${args.join(' ')}: ${why}\n${server.log.slice(-2000)}`));
    };
    const timer = setTimeout(() => fail(`did not start in ${Math.round(timeoutMs / 1000)} s`), timeoutMs);
    const onData = (d) => {
      server.log += d;
      if (ready && server.log.includes(ready)) {
        clearTimeout(timer);
        resolve(server);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (e) => fail(e.message));
    child.on('exit', (code, sig) => fail(`exited early (${sig ?? code})`));
  });
}

/** `vite preview` of a build on `port` (127.0.0.1 and localhost); throws when `dist` holds no build. */
export function startPreview(dist, port, opts = {}) {
  const dir = path.resolve(dist);
  if (!existsSync(path.join(dir, 'index.html'))) throw new Error(`no build in ${dir}: run \`npm run e2e\` or pass --dist <VITE_E2E=1 build>`);
  return startVite(['preview', '--outDir', dir, '--port', String(port), '--strictPort'], { ready: String(port), ...opts });
}
