import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * ADR-030 (docs/CLARIDAD2.md §2.1): the in-run currency is «Luz» / "Glow" on screen and the boost is
 * «Nutrientes» / "Nutrients". Code ids stay `essence` (and the save format with them), so this reads the
 * string literals of every shipped source file, comments blanked out: a literal that says Esencia, Essence
 * as a word, Abono or Fertiliser is player text that missed the rename (story, Encargos, Momento plates,
 * secrets, the store and the intro included). Dev-only pages (dev.ts, devSections.ts, mock.ts) are skipped.
 */
const SRC = new URL('../../src/', import.meta.url).pathname;
const DEV_ONLY = /(^|\/)(dev|devSections|mock)\.ts$/;

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir.replace(/\/$/, '')}/${e.name}`;
    if (e.isDirectory()) out.push(...files(p));
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') && !DEV_ONLY.test(p)) out.push(p);
  }
  return out;
}

/** Comments blanked out (same length), so line numbers stay true and strings inside them are skipped. */
function code(s: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  return s.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, pre: string) => pre + blank(m.slice(pre.length)));
}

const LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
/** Old names as player words: «Esencia» in any case, "Essence" as a word, «Abono», "Fertiliser". */
const OLD = [/esencia/i, /\bEssence\b/, /\bESSENCE\b/, /\babonos?\b/i, /fertili[sz]er/i];
/** "essence" in lowercase only counts inside a phrase (a lone 'essence' is an icon or a field name). */
const OLD_PHRASE = /\bessence\b/;

describe('no player text says Esencia or Abono (ADR-030)', () => {
  it('every string literal of the game says Luz / Glow and Nutrientes / Nutrients', () => {
    const hits: string[] = [];
    for (const f of files(SRC)) {
      const src = code(readFileSync(f, 'utf8'));
      for (const m of src.matchAll(LITERAL)) {
        // What a player reads: the literal without its ${…} code.
        const lit = m[0].slice(1, -1).replace(/\$\{[^}]*\}/g, '');
        const old = OLD.some((re) => re.test(lit)) || (OLD_PHRASE.test(lit) && /\s/.test(lit));
        if (!old) continue;
        const line = src.slice(0, m.index).split('\n').length;
        hits.push(`${f.slice(SRC.length)}:${line} ${m[0].slice(0, 90)}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
