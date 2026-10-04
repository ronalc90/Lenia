// Bumps version.json (0.003 → 0.004). Run before publishing each update: `npm run bump`.
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../version.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
const [major, minor] = String(data.version).split('.');
const width = Math.max(3, minor.length);
const next = `${major}.${String(Number(minor) + 1).padStart(width, '0')}`;
writeFileSync(file, JSON.stringify({ ...data, version: next }) + '\n');
console.log(`version ${data.version} → ${next}`);
