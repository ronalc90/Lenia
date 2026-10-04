// Regenerates src/ui/art/art.css from tokens.ts (no dependencies, Node ≥ 22):
//   node --experimental-strip-types --no-warnings src/ui/art/write-css.mjs
import { writeFileSync } from 'node:fs';

const { tokensCss } = await import('./tokens.ts');
writeFileSync(new URL('./art.css', import.meta.url), tokensCss());
console.log('wrote src/ui/art/art.css');
