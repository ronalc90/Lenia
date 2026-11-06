/**
 * Jargon guard (docs/CLARIDAD.md P1-10; CLAUDE.md: every QA finding gets its test). Walks every
 * player-facing Text of the game and story modules and fails on words a child does not know or that
 * name a retired system: μ, σ, régimen/regime, Genoma/Genome, Muestra/Sample (the old currency),
 * Extinci/Extinct, Calibr, espécimen/specimen, "pasos" (simulation steps), Ø, and "/s" inside a
 * sentence (only the "+1/s" chip may say it, and the unit of the new currency after a number, "2 luz/s" /
 * "2 glow/s": ADR-030, docs/CLARIDAD2.md §2.1 and §6 #3 name it so on the counter and the Nutrientes tip).
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
/** "pasos" = simulation steps; «primeros pasos» (the summary's first steps, ADR-030) is plain Spanish. */
const BANNED_ANY = [/μ/, /σ/, /r[ée]gimen|regime/i, /genom[ae]/i, /extinci|extinct/i, /calibr/i, /esp[ée]cimen|specimen/i, /(?<!primeros )\bpasos\b/i, /Ø/];
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
    // "/s" only as the bare "+1/s" chip, or that chip quoted to explain it («+1/s»), or "N luz/s" (ADR-030).
    const bare = s.replace(/[«"“]\+?[\d.,]+\/s[»"”]/g, '').replace(/\+?[\d.,]+ (luz|glow)\/s\b/g, '');
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
    expect(problems('x', { es: 'Ahora 2 luz/s → con Nutrientes 2,5 luz/s.', en: 'Now 2 glow/s → with Nutrients 2.5 glow/s.' })).toEqual([]);
    expect(problems('x', { es: 'Tu luz/s sube.', en: 'Your glow/s rises.' }).length).toBe(2);
  });
});

/**
 * ADR-030: the in-run currency is Luz / Glow on screen (code ids stay `essence`) and the boost is Nutrientes.
 * The game's own texts are checked now; the story's, the Encargos' and the UI's (other packages) when the
 * integrator turns LUZ_RENAME on, after every package has landed.
 */
const LUZ_RENAME = true;
const OLD_NAMES = [/esencia/i, /essence/i, /\babono\b/i, /fertili[sz]er/i];
const oldNames = (all: [string, Text][]) =>
  all.flatMap(([p, t]) => (['es', 'en'] as const).filter((l) => OLD_NAMES.some((re) => re.test(t[l]))).map((l) => `${p} ${l}: «${t[l]}»`));

function gameTexts(): [string, Text][] {
  const all: [string, Text][] = [];
  const tx = Object.fromEntries(Object.entries(TEXT).filter(([k]) => !CLASSIC_ONLY_TEXT.includes(k)));
  texts(tx, 'TEXT', all);
  texts(ACHIEVEMENT_TEXT, 'ACHIEVEMENT_TEXT', all);
  texts(JOURNAL, 'JOURNAL', all);
  texts(SESSION_OBJECTIVE_TEXT, 'SESSION_OBJECTIVE_TEXT', all);
  texts(NODE_TEXT, 'NODE_TEXT', all);
  texts(BRANCH_TEXT, 'BRANCH_TEXT', all);
  texts(VALUE_TEXT, 'VALUE_TEXT', all);
  texts(TREE_UI, 'TREE_UI', all);
  texts(SESSION_UI, 'SESSION_UI', all);
  texts(VELA_LINES, 'VELA_LINES', all);
  texts(WORLD_TEXT, 'WORLD_TEXT', all);
  return all;
}

describe('Luz and Nutrientes (ADR-030)', () => {
  it('no player text of the game says Esencia/Essence or Abono', () => {
    expect(oldNames(gameTexts())).toEqual([]);
  });

  it.skipIf(!LUZ_RENAME)('no player text says Esencia/Essence (story, Encargos and endings too)', () => {
    const all: [string, Text][] = sceneTexts();
    for (const e of [...CHAIN, ...SIDE]) for (const k of ['ask', 'why', 'thanks'] as const) all.push([`${e.id}.${k}`, e[k]]);
    texts(STORY_JOURNAL, 'STORY_JOURNAL', all);
    texts(ENDINGS, 'ENDINGS', all);
    expect(oldNames(all)).toEqual([]);
  });

  it('no multiplier with two decimals outside "Show the maths" (the tree\'s before → after is the maths)', () => {
    const all: [string, Text][] = [];
    const tx = Object.fromEntries(Object.entries(TEXT).filter(([k]) => !CLASSIC_ONLY_TEXT.includes(k)));
    texts(tx, 'TEXT', all);
    texts(SESSION_UI, 'SESSION_UI', all);
    texts(TREE_UI, 'TREE_UI', all);
    texts(VELA_LINES, 'VELA_LINES', all);
    const twoDecimals = /×\d+[.,]\d\d/;
    expect(all.filter(([, t]) => twoDecimals.test(t.es) || twoDecimals.test(t.en)).map(([p, t]) => `${p}: «${t.es}»`)).toEqual([]);
  });
});

describe('the night requirement reads right in both languages (QA4 F-19)', () => {
  it('one species is singular: "1 especie", "1 species"; one session too', async () => {
    const { TREE_UI } = await import('./treeText');
    const { TEXT } = await import('./content');
    const g = TREE_UI.nightGate(4, 1, 6);
    expect(g.es).toContain('4 sesiones y 1 especie ');
    expect(g.es).not.toMatch(/1 especies/);
    const r = TEXT.nightRequirement(2, 1, 1);
    expect(r.es).toBe('Noche 2: 1 sesión y 1 especie');
    expect(r.en).toBe('Night 2: 1 session and 1 species');
    expect(TREE_UI.nightProgress(1, 4, 0, 1).es).toContain('Especies 0/1');
  });
});

describe('the node sheet counts in words, never as fractions (QA4 F-15)', () => {
  it('"Tienes 3 · Cuesta 2", "Nivel 0 de 6" and "mejora 1 de 7"', async () => {
    const { TREE_UI } = await import('./treeText');
    expect(TREE_UI.haveCost('3', '2').es).toBe('Tienes 3 · Cuesta 2');
    expect(TREE_UI.haveCost('3', '2').en).not.toContain('/');
    expect(TREE_UI.levelOf(0, '6').es).toBe('Nivel 0 de 6');
    expect(TREE_UI.step(1, 7).es).toBe('mejora 1 de 7');
  });
});

describe('the clarity-pass texts exist in both languages before anyone wires them (ADR-030, docs/CLARIDAD2.md §8.2)', () => {
  it('every new key of SESSION_UI, TREE_UI, NODE_TEXT, VALUE_TEXT and TEXT gives Spanish and English', async () => {
    const { SESSION_UI, TREE_UI, NODE_TEXT, VALUE_TEXT, BRANCH_TEXT } = await import('./treeText');
    const { TEXT } = await import('./content');
    const W = { es: 'Mundo 4', en: 'World 4' };
    const got: Text[] = [
      SESSION_UI.luz, SESSION_UI.luzPerSec('12'), SESSION_UI.collected, SESSION_UI.sweptEnd, SESSION_UI.datosNext('38', '12'),
      SESSION_UI.lessReason({ prize: 10, before: '2', now: '6', grew: true }), SESSION_UI.lessAction(W), SESSION_UI.fromLight,
      SESSION_UI.discoveryOnce, SESSION_UI.collection(3, 7), SESSION_UI.nextSpeciesIn(W, '400'), SESSION_UI.startCarry('20', '300', '320'),
      SESSION_UI.freeSeeds(1, '4'), SESSION_UI.fridgeWaking, SESSION_UI.worldLeft(1), SESSION_UI.worldDone, SESSION_UI.paused,
      SESSION_UI.boostReady(7), SESSION_UI.boostCost('16'), SESSION_UI.boostNoTime, SESSION_UI.boostTip('2', '2,5'),
      TREE_UI.tapGlowing, TREE_UI.routeStep(W, 1, 7), TREE_UI.deviceMax, TREE_UI.deviceMaxLine, TREE_UI.canBuyStrip(3),
      TREE_UI.cheapestNow(W, '30', 2), TREE_UI.nightPrize(2), TREE_UI.gateSessions(3, 4), TREE_UI.gateSpecies(3, 1), TREE_UI.playWorld(W),
      ...['pipette', 'pipetteFast', 'dropBig', 'pipetteMore', 'pipetteMagnet', 'pipetteMaster'].flatMap((id) => [NODE_TEXT[id].name, NODE_TEXT[id].desc]),
      BRANCH_TEXT.collect.name, VALUE_TEXT.pipettes(0), VALUE_TEXT.pipettes(3), VALUE_TEXT.dropHolds(4), VALUE_TEXT.magnet(2), VALUE_TEXT.instant,
      TEXT.gift.spark, TEXT.giftLine(5, TEXT.gift.firstSeed), TEXT.deathGlass, TEXT.deathCrowd, TEXT.deathFaded, TEXT.merged,
      TEXT.contactSoon, TEXT.contactSteer,
    ];
    for (const x of got) {
      expect(x.es.length, JSON.stringify(x)).toBeGreaterThan(0);
      expect(x.en.length, JSON.stringify(x)).toBeGreaterThan(0);
      expect(x.es, 'new texts say Luz, never Esencia').not.toMatch(/esencia|essence/i);
      expect(x.en).not.toMatch(/esencia|essence|undefined/i);
    }
    expect(SESSION_UI.datosNext('38', '12').es).toBe('38 Datos · próximo en 12 de luz');
    expect(SESSION_UI.boostTip('2', '2,5').es).toBe('Ahora 2 luz/s → con Nutrientes 2,5 luz/s. Hasta el final de la sesión. El siguiente cuesta el doble.');
    expect(TREE_UI.gateSessions(3, 4).es).toBe('Juega 4 sesiones · llevas 3');
    expect(TREE_UI.gateSpecies(3, 1).es).toBe('Especies en tu colección · ✓ tienes 3 (hace falta 1)');
    expect(TREE_UI.nightPrize(2).es).toBe('Noche 2 · capítulo 2 de la historia. +10 % de Datos y mejoras nuevas. Nada se borra.');
  });
});

describe('the pulse-pass texts exist in both languages before anyone wires them (ADR-031, docs/MECANICAS.md §10.4)', () => {
  it('every new key gives Spanish and English, says Luz, and the numbers read in each language', async () => {
    const { SESSION_UI, TREE_UI, NODE_TEXT } = await import('./treeText');
    const { TEXT } = await import('./content');
    const got: Text[] = [
      TEXT.sow, TEXT.sowFree, TEXT.sowCost(4), TEXT.sowFull(4), TEXT.sowSnap, TEXT.sowSure,
      TEXT.tutSow, TEXT.tutPulse, TEXT.tutStreak, TEXT.tutDrag,
      TEXT.streak(1.25), TEXT.streakMax, TEXT.streakLine(1.25), TEXT.chispazo(5), TEXT.chispazoHint(10),
      TEXT.motesNew, TEXT.motesCatch, TEXT.refund(4), TEXT.refundFree, TEXT.struggling, TEXT.contactAct, TEXT.saved(5),
      TEXT.mergedLeft, TEXT.glassLeft, TEXT.lostLeft, TEXT.blobWatched, TEXT.blobDissolved,
      TEXT.learned(2), TEXT.learnedSeed(2), TEXT.mergedCard2, TEXT.settingEasyPulse,
      SESSION_UI.finger(74, 1.25, 4, '96'), SESSION_UI.refundLine(2, '8'), SESSION_UI.savedLine(1, 1, '18'),
      SESSION_UI.tipSteer, SESSION_UI.pulseThanks, TREE_UI.routePulse,
      ...['pulse', 'streakLong', 'chispazoOften'].flatMap((id) => [NODE_TEXT[id].name, NODE_TEXT[id].desc]),
    ];
    for (const x of got) {
      expect(x.es.length, JSON.stringify(x)).toBeGreaterThan(0);
      expect(x.en.length, JSON.stringify(x)).toBeGreaterThan(0);
      expect(x.es, 'new texts say Luz, never Esencia').not.toMatch(/esencia|essence|undefined|NaN/i);
      expect(x.en).not.toMatch(/esencia|essence|undefined|NaN/i);
    }
    expect(TEXT.streak(1.25)).toEqual({ es: 'Racha ×1,25', en: 'Streak ×1.25' });
    expect(TEXT.chispazo(5)).toEqual({ es: '¡CHISPAZO! +5', en: 'FLASH! +5' });
    expect(TEXT.refund(4).es).toBe('No prendió · +4 de vuelta');
    expect(TEXT.learned(2).es).toBe('Aprendiste por qué pasa: +2 Datos');
    expect(SESSION_UI.finger(74, 1.25, 4, '96').es).toBe('Tu dedo: 74 toques · mejor racha ×1,25 · 4 Chispazos · +96 de luz');
    expect(SESSION_UI.finger(1, 1, 1, '1').en).toBe('Your finger: 1 tap · best streak ×1 · 1 Flash · +1 glow');
    // VELA's tutorial lines and the tree's names stay kid-short (script.test.ts: ≤ 12 words; tree.test.ts: names ≤ 4).
    for (const x of [TEXT.tutSow, TEXT.tutPulse, TEXT.tutStreak, TEXT.tutDrag])
      for (const l of ['es', 'en'] as const) expect(x[l].split(/\s+/).length, x[l]).toBeLessThanOrEqual(12);
    for (const id of ['pulse', 'streakLong', 'chispazoOften'])
      for (const l of ['es', 'en'] as const) {
        expect(NODE_TEXT[id].name[l].split(/\s+/).length).toBeLessThanOrEqual(4);
        expect(NODE_TEXT[id].desc[l].split(/\s+/).length).toBeLessThanOrEqual(12);
      }
  });
});
