// Bumps version.json (0.003 → 0.004). Run before publishing each update: `npm run bump`.
// It also sets package.json (and the lockfile's root entry) to the same release as semver (0.004 → 0.4.0):
// the release workflow, the portal zips, electron-builder and the Android versionName read package.json.
// `node scripts/bump-version.mjs --sync` only copies the current version.json into package.json.
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../version.json', import.meta.url);
const pkgFile = new URL('../package.json', import.meta.url);
const lockFile = new URL('../package-lock.json', import.meta.url);

/** version.json "0.027" as the semver npm and electron-builder accept ("0.27.0": no leading zeros). */
function semverOf(version) {
  const [major, minor] = String(version).split('.');
  return `${Number(major)}.${Number(minor)}.0`;
}

const data = JSON.parse(readFileSync(file, 'utf8'));
let version = data.version;
if (!process.argv.includes('--sync')) {
  const [major, minor] = String(data.version).split('.');
  const width = Math.max(3, minor.length);
  version = `${major}.${String(Number(minor) + 1).padStart(width, '0')}`;
  writeFileSync(file, JSON.stringify({ ...data, version }) + '\n');
  console.log(`version ${data.version} → ${version}`);
}

const semver = semverOf(version);
// Only the "version" line changes, so the rest of package.json keeps its exact text.
const pkg = readFileSync(pkgFile, 'utf8');
writeFileSync(pkgFile, pkg.replace(/("version":\s*)"[^"]*"/, `$1"${semver}"`));
const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
lock.version = semver;
if (lock.packages?.['']) lock.packages[''].version = semver;
writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
console.log(`package.json ${semver}`);
