// Copies the built web game (../../dist, from `npm run build` at the repo root) into ./web, which
// electron-builder packages and main.cjs serves as app://bioluma/.
//   node scripts/copy-web.mjs            (fails if dist/ is missing)
//   BIOLUMA_WEB_DIR=/path/to/dist node scripts/copy-web.mjs
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
const src = resolve(process.env.BIOLUMA_WEB_DIR || join(app, '..', '..', 'dist'));
const dest = join(app, 'web');

const index = join(src, 'index.html');
if (!existsSync(index)) {
  console.error(`[copy-web] ${index} not found. Run "npm run build" at the repo root first.`);
  process.exit(1);
}
const html = readFileSync(index, 'utf8');
if (/(?:src|href)="\/(?!\/)/.test(html)) {
  console.error('[copy-web] index.html uses absolute paths ("/..."); the Vite base must stay "./".');
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
// The service worker is never registered outside https, but drop it so nothing can cache stale files.
cpSync(src, dest, { recursive: true, filter: (p) => !p.endsWith('sw.js') && !p.endsWith('.map') });
console.log(`[copy-web] ${src} -> ${dest}`);

// Steam bridge map (gameId -> Steam API name) from platforms/steam/achievements.json.
const plan = join(app, '..', 'steam', 'achievements.json');
if (existsSync(plan)) {
  const { bridgeMap } = JSON.parse(readFileSync(plan, 'utf8'));
  writeFileSync(join(app, 'steam-achievements.json'), JSON.stringify(bridgeMap, null, 2) + '\n');
  console.log(`[copy-web] steam-achievements.json (${Object.keys(bridgeMap).length} achievements)`);
}
