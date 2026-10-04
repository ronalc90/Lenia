/**
 * Jargon guard (docs/CLARIDAD.md P1-10; CLAUDE.md: every QA finding gets its test). Walks every
 * player-facing Text of the game and story modules and fails on words a child does not know or that
 * name a retired system: μ, σ, régimen/regime, Genoma/Genome, Muestra/Sample (the old currency),
 * Extinci/Extinct, Calibr, espécimen/specimen, "pasos" (simulation steps), Ø, and "/s" inside a
 * sentence (only the "+1/s" chip may say it).
 *
 * Skipped on purpose (PHASE-2B-REMOVE, deleted with the classic loop): content.ts CLASSIC_ONLY_TEXT,
 * CLASSIC_ACHIEVEMENT_TEXT, UPGRADE_TEXT / GENOME_TEXT / OBJECTIVE_TEXT (classic panels), the
 * `classic` overrides of the Encargos and script.ts CLASSIC_ONLY_SCENES.
 */
import { describe, expect, it } from 'vitest';
import type { Text } from '../core/types';
import { ENDINGS, LEANING_NAMES } from '../story/endings';
import { CHAIN, COSMETIC_NAMES, SIDE } from '../story/encargoScript';
import { ACT_TITLES, CLASSIC_ONLY_SCENES, SCENES, SPEAKER_NAMES, STORY_JOURNAL } from '../story/script';
import type { LineDef } from '../story/types';
import { ACHIEVEMENT_TEXT, BEHAVIOR_NAMES, CLASSIC_ONLY_TEXT, JOURNAL, SESSION_OBJECTIVE_TEXT, TEXT } from './content';
import { BRANCH_TEXT, NODE_TEXT, SESSION_UI, TREE_UI, VALUE_TEXT, VELA_LINES, WORLD_TEXT } from './treeText';

/** Banned anywhere (case-insensitive). */
const BANNED_ANY = [/μ/, /σ/, /r[ée]gimen|regime/i, /genom[ae]/i, /extinci|extinct/i, /calibr/i, /esp[ée]cimen|specimen/i, /\bpasos\b/i, /Ø/];
/** The old currency (capitalised; a story "sample" sent to the Committee is fine). */
const BANNED_CASE = [/\bMuestras?\b/, /\bSamples?\b/];

const isText = (x: unknown): x is Text => !!x && typeof x === 'object' && typeof (x as Text).es === 'string' && typeof (x as Text).en === 'string';

/** Every Text inside a value: Text itself, arrays, records, and functions called with sample arguments. */
function texts(x: unknown, path: string, out: [string, Text][], depth = 0): void {
  if (depth > 4 || x === null || x === undefined) return;
  if (isText(x)) {
    out.push([path, x]);
    return;
  }
  if (typeof x === 'function') {
    const samples: unknown[][] = [
      [3, 7, 2, 5],
      ['3', '7', '2', '5'],
      [{ es: '×2', en: '×2' }, 7],
      ['swimmer', 3],
    ];
    for (const args of samples) {
      try {
        const r = (x as (...a: unknown[]) => unknown)(...args);
        if (isText(r)) {
          out.push([`${path}()`, r]);
          return;
        }
      } catch {
        /* try the next argument shapes */
      }
    }
    return;
  }
  if (Array.isArray(x)) {
    x.forEach((v, i) => texts(v, `${path}[${i}]`, out, depth + 1));
    return;
  }
  if (typeof x === 'object') for (const [k, v] of Object.entries(x as Record<string, unknown>)) texts(v, `${path}.${k}`, out, depth + 1);
}

function problems(path: string, t: Text): string[] {
  const out: string[] = [];
  for (const lang of ['es', 'en'] as const) {
    const s = t[lang];
    for (const re of [...BANNED_ANY, ...BANNED_CASE]) if (re.test(s)) out.push(`${path} ${lang}: «${s}» (${re})`);
    // "/s" only as the bare "+1/s" chip, or that chip quoted to explain it («+1/s»).
    const bare = s.replace(/[«"“]\+?[\d.,]+\/s[»"”]/g, '');
    if (/\/s\b/.test(bare) && !/^\+?[\d\s.,]*\/s$/.test(bare.trim())) out.push(`${path} ${lang}: «${s}» ("/s" inside a sentence)`);
  }
  return out;
}

const sceneTexts = (): [string, Text][] => {
  const out: [string, Text][] = [];
  const line = (p: string, l: LineDef) => out.push([p, l.text]);
  for (const s of SCENES) {
    if (CLASSIC_ONLY_SCENES.includes(s.id)) continue;
    out.push([`${s.id}.title`, s.title]);
    if (Array.isArray(s.lines)) s.lines.forEach((l, i) => line(`${s.id}.lines[${i}]`, l));
    if (s.wait?.text) out.push([`${s.id}.wait`, s.wait.text]);
    if (s.choice && s.choice.options !== 'final')
      for (const o of s.choice.options) {
        out.push([`${s.id}.${o.id}.label`, o.label]);
        o.reply?.forEach((l, i) => line(`${s.id}.${o.id}.reply[${i}]`, l));
      }
  }
  return out;
};

describe('clarity: no jargon in what the player reads', () => {
  it('game texts (Esencia, tree, sessions, worlds, achievements, journal) speak plainly', () => {
    const all: [string, Text][] = [];
    const tx = Object.fromEntries(Object.entries(TEXT).filter(([k]) => !CLASSIC_ONLY_TEXT.includes(k)));
    texts(tx, 'TEXT', all);
    texts(BEHAVIOR_NAMES, 'BEHAVIOR_NAMES', all);
    texts(ACHIEVEMENT_TEXT, 'ACHIEVEMENT_TEXT', all);
    texts(JOURNAL.filter((j) => !['calibrator', 'extinctionNear', 'firstExtinction'].includes(j.id)), 'JOURNAL', all);
    texts(SESSION_OBJECTIVE_TEXT, 'SESSION_OBJECTIVE_TEXT', all);
    texts(NODE_TEXT, 'NODE_TEXT', all);
    texts(BRANCH_TEXT, 'BRANCH_TEXT', all);
    texts(VALUE_TEXT, 'VALUE_TEXT', all);
    texts(TREE_UI, 'TREE_UI', all);
    texts(SESSION_UI, 'SESSION_UI', all);
    texts(VELA_LINES, 'VELA_LINES', all);
    texts(WORLD_TEXT, 'WORLD_TEXT', all);
    expect(all.length).toBeGreaterThan(300);
    expect(all.flatMap(([p, t]) => problems(p, t))).toEqual([]);
  });

  it('story, Encargos and endings speak plainly', () => {
    const all: [string, Text][] = sceneTexts();
    for (const e of [...CHAIN, ...SIDE]) for (const k of ['ask', 'why', 'thanks'] as const) all.push([`${e.id}.${k}`, e[k]]);
    texts(STORY_JOURNAL, 'STORY_JOURNAL', all);
    texts(ENDINGS, 'ENDINGS', all);
    texts(LEANING_NAMES, 'LEANING_NAMES', all);
    texts(ACT_TITLES, 'ACT_TITLES', all);
    texts(SPEAKER_NAMES, 'SPEAKER_NAMES', all);
    texts(COSMETIC_NAMES, 'COSMETIC_NAMES', all);
    expect(all.length).toBeGreaterThan(200);
    expect(all.flatMap(([p, t]) => problems(p, t))).toEqual([]);
  });

  it('the guard itself catches the old words', () => {
    expect(problems('x', { es: 'Mueve μ en Calibrar.', en: 'Move μ in Calibrate.' }).length).toBeGreaterThan(0);
    expect(problems('x', { es: 'Gana 3 Esencia/s.', en: 'Earn 3 Essence/s.' }).length).toBe(2);
    expect(problems('x', { es: '+3/s', en: '+3/s' })).toEqual([]);
    expect(problems('x', { es: 'Enviar la muestra', en: 'Send the sample' })).toEqual([]);
    expect(problems('x', { es: 'Arriba: «+1/s» es tu Esencia.', en: 'Up top: "+1/s" is your Essence.' })).toEqual([]);
  });
});
