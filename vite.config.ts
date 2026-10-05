import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { stampServiceWorker } from './src/app/swVersion';

// `SINGLE=1 vite build` inlines everything into one HTML file (used for the
// shareable test build); the default build is a normal multi-file PWA build.
const single = process.env.SINGLE === '1';

/** Release number (bumped with `npm run bump` on every published update). */
const version: string = JSON.parse(readFileSync(new URL('./version.json', import.meta.url), 'utf8')).version;

/** Exact commit of this build: Vercel provides it; locally ask git. */
function gitSha(): string {
  const env = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (env) return env.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

const build = { version, sha: gitSha(), date: new Date().toISOString() };

/** Emits /version.json next to the game so a deployment can be checked from any device, and stamps sw.js. */
function versionFile(): Plugin {
  return {
    name: 'bioluma-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(build, null, 2) + '\n' });
    },
    // public/sw.js is copied as is; give its cache this release's name (RF-11).
    writeBundle(options) {
      const sw = join(options.dir ?? 'dist', 'sw.js');
      if (existsSync(sw)) writeFileSync(sw, stampServiceWorker(readFileSync(sw, 'utf8'), `${build.version}-${build.sha}`));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: single ? [viteSingleFile()] : [versionFile()],
  define: {
    __SINGLE_FILE__: JSON.stringify(single),
    __APP_VERSION__: JSON.stringify(build.version),
    __GIT_SHA__: JSON.stringify(build.sha),
    __BUILD_DATE__: JSON.stringify(build.date),
  },
  build: {
    outDir: single ? 'dist-single' : 'dist',
    target: 'es2022',
    assetsInlineLimit: single ? 100_000_000 : 4096,
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
} as never);
