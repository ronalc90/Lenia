import { describe, expect, it } from 'vitest';
import type { GameView } from '../core/types';
import { SECRET_DEFS } from '../secrets/data';
import { makeView } from '../story/testUtil';
import { STRINGS } from '../ui/i18n';
import { MS } from '../ui/moments/strings';
import { seedPriceSheetExplain } from '../ui/seed-price';
import { BEHAVIOR_ORDER, behaviorGuide } from './behaviors';
import { MOMENTS } from './catalog';

/**
 * Regression guard for docs/CLARIDAD.md P1-10: no simulation jargon and no retired system in what the
 * player reads. Allowed only where the classic loop still runs (removed with it: B-01…B-03, B-13).
 */
const JARGON = /μ|σ|régimen|regime|Genoma|Genome|Muestra|Sample|Extinci|Extinct|Calibr|espécimen|specimen|\bpasos\b|Ø/i;

/** Chrome strings of the classic panels (Calibrar, Genoma, Muestras): deleted with them (CLARIDAD B-01…B-03). */
const CLASSIC_KEYS = new Set([
  'samples',
  'genome',
  'tabCalibrate',
  'tabGenome',
  'introCalibrate',
  'introGenome',
  'bestiaryUpgrades',
  'lockCalibrate',
  'lockGenome',
  'sliderLocked',
  'regimes',
  'regimeName',
  'regimesEmpty',
  'regimesLocked',
  'deleteRegime',
  'extinctionLocked',
  'genomeGained',
  'tutCalibrateTitle',
  'tutGenomeTitle',
  'tutGenome',
]);
/** The classic Extinction cards (CLARIDAD B-13). */
const CLASSIC_MOMENTS = new Set(['extinctionReady', 'extinction']);

function texts(x: unknown, path: string, out: [string, string][]): void {
  if (typeof x === 'string') out.push([path, x]);
  else if (Array.isArray(x)) x.forEach((v, i) => texts(v, `${path}[${i}]`, out));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) if (typeof v !== 'function') texts(v, `${path}.${k}`, out);
}

function jargon(x: unknown, path: string): string[] {
  const all: [string, string][] = [];
  texts(x, path, all);
  return all.filter(([, s]) => JARGON.test(s)).map(([p, s]) => `${p}: ${s}`);
}

describe('plain words (CLARIDAD P1-10)', () => {
  it('UI chrome strings', () => {
    const own = Object.fromEntries(Object.entries(STRINGS).filter(([k]) => !CLASSIC_KEYS.has(k)));
    expect(jargon(own, 'STRINGS')).toEqual([]);
  });

  it('Momentos: cards, strings and the behaviour guide', () => {
    const cards = MOMENTS.filter((m) => !CLASSIC_MOMENTS.has(m.id)).map((m) => ({ id: m.id, title: m.title, lines: m.lines, brief: m.brief }));
    expect(jargon(cards, 'MOMENTS')).toEqual([]);
    expect(jargon(MS, 'MS')).toEqual([]);
    expect(jargon(BEHAVIOR_ORDER.map((b) => behaviorGuide(b)), 'GUIDE')).toEqual([]);
  });

  it('secrets: names, hints and journal', () => {
    expect(jargon(SECRET_DEFS, 'SECRETS')).toEqual([]);
  });

  it('the seed price sheet, in both loops', () => {
    const classic: GameView = {
      ...makeView({ seedCost: 9 }),
      seedPrice: { base: 2, alive: 2, crowdMult: 1.5, freeSlots: 1, used: 2, satMult: 3, bigMult: 2.25, freeSeeds: 1 },
    };
    const sessions: GameView = {
      ...makeView({ seedCost: 5, cycle: 'sessions' }),
      seedPrice: { base: 4, alive: 4, crowdMult: 1, freeSlots: 4, used: 4, satMult: 1, bigMult: 2.25, freeSeeds: 0, cheapMult: 0.8, stepMult: 1.6, bought: 10, capacity: 4, full: true },
    };
    for (const lang of ['es', 'en'] as const)
      for (const v of [classic, sessions]) expect(jargon(seedPriceSheetExplain(v, lang, { onSeeDish: () => undefined, onSeeTree: () => undefined }), 'PRICE')).toEqual([]);
  });
});
