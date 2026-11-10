import { describe, expect, it } from 'vitest';
import * as C from '../../game/cycleBalance';
import { beginSession, computeDatos, freshResearch, noteEncargo, noteEssence, noteSpecies, warnSeconds, countdownSeconds } from '../../game/session';
import { treeEffects } from '../../game/tree';
import { nodePriceExplain } from '../tree/treeView';
import { fmt } from '../format';
import { HUD_WAKE_SHORT, NEEDLE, clockWaitOf, dialTarget, extendChip, hudSub, hudWaitSub, stepNeedle, streakChip } from './hud';
import { TEXT } from '../../game/content';
import { hudState } from './hud';
import { moreBelow } from './scrollCue';
import { datosExplain, fingerLines, reportDataOf, reportHeadline, reportRows, reportScroll, velaTip, type ReportData } from './summary';
import type { SessionSummary } from '../../game/session';

const NAMES: Record<string, string> = { a: 'Remolino violeta', b: 'Nadadora celeste' };
const ctxOf = (n = 4) => ({ speciesName: (id: string) => NAMES[id] ?? '?', night: n });

/** A finished session as the game hands it to the report (game/session.ts summarize). */
function summaryOf(over: Partial<SessionSummary> & { datos: SessionSummary['datos'] }): SessionSummary {
  const d = over.datos;
  return { n: 4, seconds: 30, essence: d.essence, species: [], best: null, records: [], vela: 'poor', keep: [], nightReady: false, goals: [], fromLight: d.fromEssence, discovery: 0, lessReason: null, ...over };
}

describe('the session report tells a story (docs/CLARIDAD2.md §2.9)', () => {
  it('the exciting row comes first', () => {
    const fx = treeEffects({ lab: 2 });
    const { session } = beginSession(freshResearch(), fx);
    noteEssence(session, 963);
    noteSpecies(session, fx, 'a', true);
    const sum = summaryOf({ datos: computeDatos(session, fx, 0), species: [{ id: 'a', isNew: true }] });
    const h = reportHeadline(sum, 'es', ctxOf());
    expect(h.kind).toBe('species');
    expect(h.title).toBe('¡Especie nueva! Remolino violeta');
    expect(h.amount).toBe(`+${C.DATOS_PER_NEW_SPECIES} Datos`);
    expect(h.note).toBe('Premio de descubrimiento: solo la primera vez');
    // Without a discovery the headline is the light: never an empty card.
    const plain = summaryOf({ datos: computeDatos(beginSession(freshResearch(), fx).session, fx, 0) });
    expect(reportHeadline(plain, 'en', ctxOf()).kind).toBe('light');
    // Then the rows in their fixed order: light, ÷, night, discoveries, requests, records, … total.
    const kinds = reportRows(sum, {}, 'es', ctxOf()).map((r) => r.kind);
    expect(kinds.slice(0, 3)).toEqual(['light', 'div', 'night']);
    expect(kinds.indexOf('species')).toBeGreaterThan(kinds.indexOf('night'));
    expect(kinds[kinds.length - 1]).toBe('total');
  });

  it('rows add up to the total', () => {
    const fx = treeEffects({ lab: 3, encyclopedia: 1 });
    const { session } = beginSession(freshResearch(), fx);
    noteEssence(session, 12.4 * C.DATOS_ESSENCE_DIV);
    noteSpecies(session, fx, 'a', true);
    noteSpecies(session, fx, 'b', true);
    noteEncargo(session, fx);
    noteEncargo(session, fx);
    const d = computeDatos(session, fx, 1);
    const sum = summaryOf({ datos: d, species: [{ id: 'a', isNew: true }, { id: 'b', isNew: true }], records: [{ kind: 'essence', value: 2000, previous: 900, name: { es: 'Más luz en una sesión', en: 'Most glow in a session' } }] });
    for (const data of [{}, { encargoNames: [{ es: 'Ten 3 criaturas a la vez', en: 'Have 3 creatures at once' }, { es: 'Atrapa un Destello', en: 'Catch a Spark' }], swept: 24 }] as ReportData[]) {
      const rows = reportRows(sum, data, 'es', ctxOf(3));
      const total = rows.find((r) => r.kind === 'total')!;
      expect(rows.filter((r) => r.kind !== 'total').reduce((a, r) => a + r.adds, 0)).toBe(d.total);
      expect(total.adds).toBe(0);
      expect(total.value).toBe(`${fmt(d.total, 'es')} Datos`);
    }
    // The light row says how much Luz, the next one what it became: "963 ÷ 25 = 38".
    const rows = reportRows(sum, {}, 'es', ctxOf(3));
    expect(rows[0]).toMatchObject({ kind: 'light', label: 'Luz recogida', value: fmt(d.essence, 'es'), adds: 0 });
    expect(rows[1]).toMatchObject({ kind: 'div', label: `÷ ${C.DATOS_ESSENCE_DIV}`, adds: d.base });
  });

  it('names every reward: each species, each request and each record by its name', () => {
    const fx = treeEffects({ lab: 1 });
    const { session } = beginSession(freshResearch(), fx);
    noteEssence(session, 300);
    noteSpecies(session, fx, 'a', true);
    noteEncargo(session, fx);
    const d = computeDatos(session, fx, 1);
    const sum = summaryOf({ datos: d, species: [{ id: 'a', isNew: true }], records: [{ kind: 'essence', value: 300, previous: 200, name: { es: 'Más luz en una sesión', en: 'Most glow in a session' } }] });
    const rows = reportRows(sum, { encargoNames: [{ es: 'Ten 3 criaturas a la vez', en: 'Have 3 creatures at once' }] }, 'es', ctxOf());
    const label = (k: string) => rows.filter((r) => r.kind === k).map((r) => r.label);
    expect(label('species')).toEqual(['Especie nueva · Remolino violeta']);
    expect(label('encargo')).toEqual(['✓ Ten 3 criaturas a la vez']);
    expect(label('record')[0]).toMatch(/^✓ /);
    // "7 × 2 encargos" (QA-CLARIDAD #24) never comes back when the names are known.
    expect(rows.map((r) => r.label).join(' ')).not.toMatch(/\d+ × \d+ encargos/);
  });

  it('QA#9: first steps are named', () => {
    const fx = treeEffects({});
    const { session } = beginSession(freshResearch(), fx);
    noteEssence(session, 3 * C.DATOS_ESSENCE_DIV);
    noteEncargo(session, fx);
    noteEncargo(session, fx);
    const sum = summaryOf({ n: 1, datos: computeDatos(session, fx, 0) });
    const rows = reportRows(sum, {}, 'es', ctxOf(1));
    const steps = rows.filter((r) => r.kind === 'step');
    expect(steps.map((r) => r.label)).toEqual(['✓ sembrar', '✓ primera criatura']);
    expect(rows.find((r) => r.kind === 'section' && r.section === 'steps')?.label).toBe('Primeros pasos');
    expect(rows.map((r) => r.label).join(' ')).not.toMatch(/primeras metas|encargos/i);
    noteEncargo(session, fx); // the third one: collect the light (ADR-030)
    const three = summaryOf({ n: 1, datos: computeDatos(session, fx, 0) });
    const named = reportRows(three, { firstSteps: ['sow', 'creature', 'collect'] }, 'en', ctxOf(1)).filter((r) => r.kind === 'step');
    expect(named.map((r) => r.label)).toEqual(['✓ sow', '✓ first creature', '✓ collect glow']);
  });

  it('a smaller payout says why, in a neutral line, and what to do', () => {
    const fx = treeEffects({ lab: 1 });
    const { session } = beginSession(freshResearch(), fx);
    noteEssence(session, 6 * C.DATOS_ESSENCE_DIV);
    const sum = summaryOf({ n: 2, datos: computeDatos(session, fx, 0) });
    const data: ReportData = { previous: { total: 21, fromLight: 2, prize: 10 }, lessWorld: { es: 'Mundo 2', en: 'World 2' } };
    const rows = reportRows(sum, data, 'es', ctxOf(1));
    const less = rows.find((r) => r.kind === 'less')!;
    expect(less.tone).toBe('info');
    expect(less.label).toBe('Hoy no hubo especie nueva (ayer +10). Tu luz sí creció: 6 Datos (ayer 2).');
    expect(less.note).toBe('Para descubrir otra: compra Mundo 2 en el Árbol.');
    // "ayer 2 ↑" next to the Datos the light gave.
    expect(rows.find((r) => r.kind === 'div')?.note).toBe('↑ ayer 2');
    // As many or more than yesterday: no such line.
    expect(reportRows(sum, { previous: { total: 3, fromLight: 2, prize: 0 } }, 'es', ctxOf(1)).some((r) => r.kind === 'less')).toBe(false);
  });

  it('QA-CLARIDAD-2 C1: a report with a new species never says there was none, and its numbers match the rows', () => {
    // Session 5 of the QA: a new species (+14), Night 2 (+10 %), fewer Datos than the day before (+15 prize).
    const fx = treeEffects({ lab: 2 });
    const { session } = beginSession(freshResearch(), fx);
    noteEssence(session, 643);
    noteSpecies(session, fx, 'a', true);
    const d = computeDatos(session, fx, 0);
    const sum = summaryOf({ n: 5, datos: d, species: [{ id: 'a', isNew: true }] });
    const prev = { total: d.total + 20, fromLight: d.fromEssence + 2, prize: 15 };
    const rows = reportRows(sum, { previous: prev }, 'es', ctxOf(2));
    const less = rows.find((r) => r.kind === 'less')!;
    expect(less.label).not.toMatch(/no hubo especie nueva/);
    // The light's Datos it compares are the ones a row shows (never «25 ↓ ayer 29» above and «29 → 27» below).
    const shown = rows.filter((r) => r.kind !== 'less').map((r) => `${r.value} ${r.note ?? ''}`).join(' | ');
    expect(shown).toContain(fmt(d.fromEssence, 'es'));
    expect(less.label).toContain(`${fmt(d.fromEssence, 'es')} Datos`);
    expect(less.label).toContain(`ayer ${fmt(prev.fromLight, 'es')}`);
    const note = rows.find((r) => r.note && /ayer/.test(r.note))!;
    expect(note.note).toContain(fmt(d.fromEssence, 'es'));
    // Without a new species today it still says so.
    const plain = summaryOf({ n: 5, datos: computeDatos(beginSession(freshResearch(), fx).session, fx, 0) });
    const r2 = reportRows(plain, { previous: { total: 99, fromLight: 9, prize: 15 } }, 'es', ctxOf(2)).find((r) => r.kind === 'less')!;
    expect(r2.label).toMatch(/^Hoy no hubo especie nueva \(ayer \+15\)\./);
  });

  it('QA-CLARIDAD-2 C12: the final sweep says what VELA did, not «ya está en la luz de arriba»', () => {
    const fx = treeEffects({});
    const { session } = beginSession(freshResearch(), fx);
    noteEssence(session, 90);
    const sum = summaryOf({ datos: computeDatos(session, fx, 0) });
    const sweep = reportRows(sum, { swept: 53 }, 'es', ctxOf(1)).find((r) => r.kind === 'light')!;
    expect(`${sweep.label} ${sweep.value} ${sweep.note ?? ''}`).not.toMatch(/luz de arriba/);
    expect(sweep.note).toBe('incluye +53 que VELA recogió al final');
    expect(sweep.adds).toBe(0);
  });

  // QA-4 pulido 11 (c1-152): «VELA recogió las gotas que quedaban +92 luz · ya contada…» on a row of its own read as a
  // gain the sum left out. It is said on the «Luz recogida» row it belongs to.
  it('QA-4: the final sweep is told on «Luz recogida», never as a row of its own', () => {
    const fx = treeEffects({});
    const { session } = beginSession(freshResearch(), fx);
    noteEssence(session, 90);
    const sum = summaryOf({ datos: computeDatos(session, fx, 0) });
    const rows = reportRows(sum, { swept: 24 }, 'es', ctxOf(1));
    expect(rows.find((r) => r.kind === 'swept')).toBeUndefined();
    expect(rows.find((r) => r.kind === 'light')).toMatchObject({ adds: 0, note: 'incluye +24 que VELA recogió al final' });
  });

  it('no two-decimal multiplier anywhere in the report', () => {
    const fx = treeEffects({ lab: 3, encyclopedia: 1 });
    const { session } = beginSession(freshResearch(), fx);
    noteEssence(session, 5000);
    const sum = summaryOf({ datos: computeDatos(session, fx, 0) });
    for (const lang of ['es', 'en'] as const) for (const r of reportRows(sum, {}, lang, ctxOf(3))) expect(`${r.label} ${r.value} ${r.note ?? ''}`).not.toMatch(/×\d+[.,]\d/);
  });
});

describe('the report reads the game\'s own summary (ADR-030 integration)', () => {
  it('goals become one named row each, the sweep is told and the collection names the next World', () => {
    const fx = treeEffects({});
    const { session } = beginSession(freshResearch(), fx);
    noteEssence(session, 3 * C.DATOS_ESSENCE_DIV);
    noteEncargo(session, fx, { kind: 'step', name: { es: 'sembrar', en: 'sow' } });
    noteEncargo(session, fx, { kind: 'encargo', name: { es: 'Ten 3 criaturas a la vez', en: 'Have 3 creatures at once' } });
    const d = computeDatos(session, fx, 0);
    const goals = [...session.goals!, { kind: 'step' as const, name: { es: 'recoger luz', en: 'collect glow' }, datos: 0 }];
    const sum = summaryOf({
      n: 2,
      datos: d,
      goals,
      light: { made: 75, gifts: 0, hand: 50, pipette: 0, sweep: 25, capped: 0 },
      collection: { have: 3, total: 7, next: { world: 'gyro', cost: 400 } },
      previous: { total: 30, fromLight: 2, prize: 10 },
      lessReason: { prize: 10, before: 2, now: 3, grew: true },
      lessAction: { es: 'Para descubrir otra: compra Mundo 3 en el Árbol.', en: 'To discover another: buy World 3 in the Tree.' },
      behaviors: ['spinner'],
    });
    const data = reportDataOf(sum);
    expect(data.swept).toBe(25);
    expect(data.collection).toMatchObject({ have: 3, total: 7, nextCost: 400 });
    expect(data.collection?.nextWorld?.es).toBeTruthy();
    const rows = reportRows(sum, data, 'es', ctxOf(1));
    const label = (k: string) => rows.filter((r) => r.kind === k).map((r) => r.label);
    expect(label('step')).toEqual(['✓ sembrar', '✓ recoger luz']);
    expect(label('encargo')).toEqual(['✓ Ten 3 criaturas a la vez']);
    // Rows still add up: the collect step adds nothing of its own.
    expect(rows.filter((r) => r.kind !== 'total').reduce((a, r) => a + r.adds, 0)).toBe(d.total);
    expect(rows.find((r) => r.kind === 'less')?.note).toBe('Para descubrir otra: compra Mundo 3 en el Árbol.');
    expect(rows.find((r) => r.kind === 'light')?.note).toMatch(/\+25/);
  });
});

describe('the Datos sheet of the HUD preview', () => {
  it('opens as the shared price sheet from the HUD preview, adding up to the same total', () => {
    const fx = treeEffects({ lab: 2 });
    const { session } = beginSession(freshResearch(), fx);
    noteEssence(session, 9.5 * C.DATOS_ESSENCE_DIV);
    noteSpecies(session, fx, 'a', true);
    const d = computeDatos(session, fx, 0);
    const x = datosExplain(d, 'es', 2, { name: { es: 'Más tiempo', en: 'More time' }, missing: 4 });
    expect(x.terms.map((t) => t.value)).toEqual(['9', '+10 %']); // no two-decimal multiplier (§2.13)
    expect(x.total).toBe(String(d.fromEssence)); // 9 × 1,1 → 9: the equation adds up by itself
    expect(x.rule).toMatch(new RegExp(`^Por cada ${C.DATOS_ESSENCE_DIV} de luz, 1 Dato`)); // ADR-030: Luz on screen
    expect(x.rows!.map((r) => r.label)).toEqual([`+${C.DATOS_PER_NEW_SPECIES}`, '=']);
    expect(x.rows![1].text).toBe(`${d.total} Datos al terminar`);
    expect(d.fromEssence + C.DATOS_PER_NEW_SPECIES).toBe(d.total);
    expect(x.advice).toBe('Más tiempo: te faltan 4 Datos');
  });

});

describe('the HUD clock', () => {
  const v = (remaining: number, total = 150, phase: 'ready' | 'running' | 'over' = 'running') => ({ phase, remaining, total, n: 1, sprint: null });
  it('waits, runs, turns amber in the last quarter, counts the last third and ends', () => {
    expect(hudState(v(150, 150, 'ready'))).toBe('wait');
    expect(hudState(v(120))).toBe('run');
    expect(hudState(v(warnSeconds(150)))).toBe('warn');
    expect(hudState(v(countdownSeconds(150)))).toBe('count');
    expect(hudState(v(0))).toBe('over');
  });
  it('does not paint a 15 s run amber from its first second', () => {
    expect(hudState(v(14, 15))).toBe('run');
    expect(hudState(v(Math.max(warnSeconds(15), countdownSeconds(15)), 15))).toBe('count');
    expect(hudState(v(Math.max(warnSeconds(15), countdownSeconds(15)) + 0.5, 15))).toBe('run');
  });
});

describe('the stopwatch dial (docs/ARTE-REALISTA.md §6.4, §6.8)', () => {
  const run = (target: number, ms: number) => {
    const n = { x: 0, v: 0 };
    let peak = 0;
    let at99 = -1;
    for (let t = 0; t < ms; t += 1000 / 120) {
      stepNeedle(n, target, 1 / 120);
      peak = Math.max(peak, n.x);
      if (at99 < 0 && Math.abs(n.x - target) <= 0.01 * target) at99 = t;
    }
    return { n, peak, at99 };
  };
  it('the needle is an underdamped second-order instrument: ζ 0,8, ωn 19, ~99 % in 300 ms, ~1,5 % overshoot', () => {
    expect(NEEDLE).toEqual({ zeta: 0.8, omega: 19 });
    const r = run(100, 1200);
    expect(r.at99).toBeGreaterThan(150);
    expect(r.at99).toBeLessThan(420);
    expect(r.peak).toBeGreaterThan(100.5);
    expect(r.peak).toBeLessThan(103);
    expect(r.n.x).toBeCloseTo(100, 1);
  });
  it('points at the time used; in the last seconds it steps a whole second at a time, and a bonus moves it back', () => {
    const v = (remaining: number, total = 30) => ({ phase: 'running' as const, remaining, total, n: 2, sprint: null });
    expect(dialTarget(v(30))).toBe(0);
    expect(dialTarget(v(15))).toBeCloseTo(180, 5);
    // Last 10 s: the needle waits on whole seconds (a detent), so 4.4 s left reads as 5.
    expect(dialTarget(v(4.4))).toBeCloseTo(dialTarget(v(5)), 5);
    // "+3 s · especie nueva": more time, the needle goes back.
    expect(dialTarget(v(18, 33))).toBeLessThan(dialTarget(v(15))); // 15 s left of 30, then +3 s: 18 of 33
    expect(dialTarget({ ...v(30), phase: 'ready' })).toBe(0);
  });
  it('says "⏸ En pausa" while the clock waits for the player, no wider than "Sesión 3"', () => {
    expect(hudSub({ phase: 'running', remaining: 20, total: 30, n: 3, sprint: null }, true, 'es')).toBe('⏸ En pausa');
    expect(hudSub({ phase: 'running', remaining: 20, total: 30, n: 3, sprint: null }, false, 'es')).toBe('Sesión 3');
    expect(hudSub({ phase: 'running', remaining: 20, total: 30, n: 3, sprint: null }, true, 'en')).toBe('⏸ Paused');
  });
});

describe('tree price for the shared "¿Por qué cuesta esto?" sheet', () => {
  it('is start × growth^level with the rule in words, the next levels and what is missing', () => {
    const x = nodePriceExplain('clock', 2, 'es', { datos: 3, recentDatos: [4, 4, 4], levels: { clock: 2 } })!;
    expect(x.terms.map((t) => t.value)).toEqual(['2', '×2,25']);
    expect(x.total).toBe('5');
    expect(x.rule).toContain('cada nivel cuesta la mitad más');
    expect(x.rows!.map((r) => r.text)).toEqual(['5 Datos → Sesión 0:30', '7 Datos → Sesión 0:35', '10 Datos → Sesión 0:40']);
    expect(x.advice).toBe('Te faltan 2 Datos — una sesión más');
    expect(nodePriceExplain('clock', C.TIME_CLOCK_LEVELS, 'es')).toBeNull(); // maxed
    expect(nodePriceExplain('lab', 1, 'es')).toBeNull();
  });
});

describe('a burst of notices is one message (QA-CLARIDAD-2 C9)', () => {
  const g = (o: Partial<Parameters<typeof extendChip>[0]>) => ({ seconds: 0, species: 0, encargo: 0, golden: 0, other: 0, first: false, ...o });
  it('7 «+3 s · encargo» at once become one chip that says what gave the clock its seconds', () => {
    const c = extendChip(g({ seconds: 21, encargo: 7 }), 'es');
    expect(c.long).toBe(true);
    expect(c.text).toBe('¡+21 s de reloj! 7 encargos cumplidos');
    expect(extendChip(g({ seconds: 24, encargo: 7, species: 1 }), 'es').text).toBe('¡+24 s de reloj! 7 encargos cumplidos y 1 especie nueva');
    expect(extendChip(g({ seconds: 21, encargo: 7 }), 'en').text).toBe('+21 s on the clock! 7 requests done');
  });

  it('one bonus alone stays the short chip («+3 s · encargo»), the first species its long line', () => {
    expect(extendChip(g({ seconds: 3, encargo: 1 }), 'es')).toEqual({ long: false, text: '+3 s', why: 'encargo' });
    expect(extendChip(g({ seconds: 3, species: 1, first: true }), 'es')).toEqual({ long: true, text: '¡Especie nueva: +3 segundos!', why: '' });
  });

  it('the light of several requests says where it came from («+189 · meta cumplida» meant nothing)', () => {
    expect(TEXT.giftLine(189, TEXT.giftMany(7)).es).toBe('+189 · 7 encargos cumplidos');
    expect(TEXT.giftLine(27, TEXT.gift.goal).es).toBe('+27 · encargo cumplido');
  });
});

describe('the finger in the report (ADR-031, docs/MECANICAS.md §6.1 step 11, §6.2, §6.3)', () => {
  const two = /×\d+[.,]\d\d/;

  it('the report shows taps, best streak and Flashes in both languages', () => {
    const fx = treeEffects({});
    const { session } = beginSession(freshResearch(), fx);
    noteEssence(session, 210);
    // The game's summary carries the finger's session (game/session.ts summarize, ADR-031).
    const sum = summaryOf({ n: 1, datos: computeDatos(session, fx, 0), finger: { taps: 74, bestMult: 1.25, chispazos: 4, motesCaught: 0, motesThrown: 0, luz: 96 } });
    const data = reportDataOf(sum);
    expect(data.finger).toMatchObject({ taps: 74, bestStreak: 1.25, chispazos: 4, luz: 96 });
    const es = fingerLines(data, 'es');
    const en = fingerLines(data, 'en');
    // The main flow's multiplier words (docs/CLARIDAD2.md §2.13): «+25 %», never «×1,25».
    expect(es[0]).toBe('Tu dedo: 74 toques en criaturas · mejor racha +25 % · 4 Chispazos · +96 de luz');
    expect(en[0]).toBe('Your finger: 74 taps on creatures · best streak +25% · 4 Flashes · +96 glow');
    // Session 2: the glimmers caught out of the ones thrown.
    const s2 = fingerLines({ finger: { taps: 160, bestStreak: 1.25, chispazos: 9, luz: 300, motes: { caught: 27, thrown: 45 } } }, 'es');
    expect(s2[0]).toMatch(/· brillos atrapados 27 de 45$/);
    expect(fingerLines({ finger: { taps: 160, bestStreak: 1.25, chispazos: 9, luz: 300, motes: { caught: 27, thrown: 45 } } }, 'en')[0]).toMatch(/· glimmers 27 of 45$/);
    for (const l of [...es, ...en, ...s2]) expect(l).not.toMatch(two);
    // A player who only watched has no finger line (never a «0 toques» that reads like a reproach).
    expect(fingerLines({ finger: { taps: 0, bestStreak: 1, chispazos: 0, luz: 0 } }, 'es')).toEqual([]);
    expect(fingerLines({}, 'es')).toEqual([]);
  });

  it('losses that gave back are told as gifts, and the tip after a fusion is to steer', () => {
    const fx = treeEffects({});
    const { session } = beginSession(freshResearch(), fx);
    const losses = { fails: 0, refunds: 2, refunded: 8, deaths: 1, merged: 1, burst: 18, saved: 1, learned: 0 };
    const data = reportDataOf(summaryOf({ datos: computeDatos(session, fx, 0), losses }));
    expect(data.refunds).toEqual({ seeds: 2, luz: 8 });
    expect(data.losses).toEqual({ saved: 1, merged: 1, luz: 18 });
    // Nothing lost, nothing to tell.
    expect(reportDataOf(summaryOf({ datos: computeDatos(session, fx, 0), losses: { ...losses, refunds: 0, merged: 0, saved: 0 } })).losses).toBeUndefined();
    expect(fingerLines(data, 'es')).toEqual(['Semillas que no prendieron: 2 (te devolví 8 de luz)', 'Salvaste a 1 · se juntaron 1 · su luz: +18']);
    expect(fingerLines(data, 'en')).toEqual(['Seeds that didn’t take: 2 (8 glow back)', 'You saved 1 · 1 merged · their glow: +18']);
    // Free seeds come back as free seeds: no «0 de luz».
    expect(fingerLines({ refunds: { seeds: 3, luz: 0 } }, 'es')).toEqual(['Semillas que no prendieron: 3 (volvieron como semillas gratis)']);
    // VELA's line after a fusion: positive, never «Siembra más lejos» (sowing is always safe now).
    expect(velaTip({ losses: { saved: 0, merged: 2, luz: 30 } }, 'es')).toBe('¡Guiar a las nadadoras las salva!');
    expect(velaTip({ merged: 2 }, 'en')).toBe('Steering swimmers saves them!');
    expect(velaTip({}, 'es')).toBeNull();
  });
});

// QA-3 §3 (game package v0.027): seeds that formed and then crashed were reported as «no prendieron», and the Nevera
// creature lost before it lived was not in the report at all.
describe('the report tells crashed seeds and lost Nevera creatures apart, in one short line each', () => {
  it('crashed seeds are not «no prendieron»; a lost Nevera creature says a sure seed came back', () => {
    const fx = treeEffects({});
    const { session } = beginSession(freshResearch(), fx);
    const losses = { fails: 0, refunds: 3, refunded: 12, deaths: 0, merged: 0, burst: 0, saved: 0, learned: 0, crashed: 2, plantsLost: 1 };
    const data = reportDataOf(summaryOf({ datos: computeDatos(session, fx, 0), losses }));
    expect(fingerLines(data, 'es')).toEqual(['Semillas que no prendieron: 1 · chocaron: 2 (te devolví 12 de luz)', 'La de la nevera no llegó a vivir: te di una semilla segura']);
    expect(fingerLines(data, 'en')).toEqual(['Seeds that didn’t take: 1 · crashed: 2 (12 glow back)', 'The fridge creature didn’t make it: here is a sure seed']);
    // All of them crashed: never «no prendieron: 0».
    const all = reportDataOf(summaryOf({ datos: computeDatos(session, fx, 0), losses: { ...losses, refunds: 2, crashed: 2, plantsLost: 0 } }));
    expect(fingerLines(all, 'es')).toEqual(['Semillas que chocaron: 2 (te devolví 12 de luz)']);
    // Two Nevera creatures, nothing else lost.
    const two = reportDataOf(summaryOf({ datos: computeDatos(session, fx, 0), losses: { ...losses, refunds: 0, refunded: 0, crashed: 0, plantsLost: 2 } }));
    expect(fingerLines(two, 'es')).toEqual(['2 de la nevera no llegaron a vivir: te di 2 semillas seguras']);
    expect(fingerLines(two, 'en')).toEqual(['2 fridge creatures didn’t make it: 2 sure seeds back']);
  });
});

describe('the clock pill while the Nevera creature wakes (SessionClockView.wakeHold)', () => {
  it('it says the clock waits for it, instead of «Siembra para empezar» or «Sesión 3»', () => {
    const v = { phase: 'ready' as const, remaining: 20, total: 20, n: 3, sprint: null, wakeHold: true };
    expect(hudWaitSub(v, 'es')).toBe(TEXT.wakeHold.es);
    expect(hudSub({ ...v, phase: 'running' }, false, 'en')).toBe(HUD_WAKE_SHORT.en);
    expect(hudWaitSub({ ...v, wakeHold: false }, 'es')).not.toBe(TEXT.wakeHold.es);
    expect(hudSub({ ...v, phase: 'running', wakeHold: false }, false, 'es')).toBe('Sesión 3');
  });
});

describe('the streak chip by the counter (ADR-031, docs/MECANICAS.md §3.2)', () => {
  const st = (hits: number, over: Partial<NonNullable<Parameters<typeof streakChip>[0]>> = {}) => ({
    hits,
    max: 10,
    mult: 1 + 0.025 * hits,
    toChispazo: 10 - (hits % 10),
    every: 10,
    draining: false,
    ...over,
  });

  it('counts the taps in a row with ten dots to the next Chispazo, never a two-decimal multiplier', () => {
    expect(streakChip(undefined, 'es')).toBeNull();
    expect(streakChip(st(0), 'es')).toBeNull();
    const three = streakChip(st(3), 'es')!;
    expect(three.text).toBe('Racha +8 %');
    expect(three.dots).toBe(3);
    expect(three.every).toBe(10);
    expect(streakChip(st(8), 'es')!.text).toBe('Racha +20 %');
    expect(streakChip(st(8), 'en')!.text).toBe('Streak +20%');
    // Full: «¡Racha máxima!» and what it does to all the light, under the counter.
    const full = streakChip(st(10, { toChispazo: 10 }), 'es')!;
    expect(full.full).toBe(true);
    expect(full.text).toBe('¡Racha máxima! +25 %');
    expect(full.line).toBe('+25 % por tu racha');
    // QA-4 pulido 5 (c1-087, c1-143, c1-151): «¡Racha máxima!» with half its dots empty read as «not full». Full = all lit.
    expect(full.dots).toBe(full.every);
    expect(streakChip(st(10, { toChispazo: 4 }), 'es')!.dots).toBe(10);
    for (let n = 1; n <= 30; n++)
      for (const l of ['es', 'en'] as const) {
        const c = streakChip(st(n, { max: 30 }), l)!;
        expect(`${c.text} ${c.line ?? ''}`).not.toMatch(/×\d+[.,]\d\d/);
      }
    // Draining after a pause: it greys and goes down slowly (the game never resets it at once).
    expect(streakChip(st(6, { draining: true }), 'es')!.draining).toBe(true);
  });
});

// QA-4 N7 (c4-025): «¡Récord! Más luz en una sesión 14 (antes 14)»: the record was real but both
// numbers were rounded down to the same one (14,6 over 14,2). When they read the same, the report shows the decimals.
// QA-4 N16 (c1-152, c1-186): long reports opened scrolled down to the total, the new species above out of sight.
describe('the report says true things and starts at the top (QA-4 N7, N16, N19)', () => {
  const fx = treeEffects({ lab: 2 });
  it('QA-4 N7: a record never reads «14 (antes 14)»', () => {
    const sum = summaryOf({ datos: computeDatos(beginSession(freshResearch(), fx).session, fx, 1), records: [{ kind: 'essence', value: 14.6, previous: 14.2, name: { es: '', en: '' } }] });
    for (const l of ['es', 'en'] as const) {
      const h = reportHeadline(sum, l, ctxOf());
      expect(h.kind).toBe('record');
      const m = h.note!.match(/^(.+?) \((?:antes|before) (.+)\)$/);
      expect(m, h.note).not.toBeNull();
      expect(m![1]).not.toBe(m![2]);
    }
    expect(reportHeadline(sum, 'es', ctxOf()).note).toBe('14,6 (antes 14,2)');
  });

  it('QA-4 N16: the report scrolls to its total only when the headline stays in sight', () => {
    // Short report: the total is 40 px under the buttons and the headline 120 px down: reveal the total.
    expect(reportScroll(40, 120)).toBe(40);
    // Long report (1362 px): revealing the total would hide the new species: it starts at the top.
    expect(reportScroll(600, 120)).toBe(0);
    expect(reportScroll(-10, 120)).toBe(0);
  });

  it('QA-4 N19: the finger line says the taps were on creatures', () => {
    const es = fingerLines({ finger: { taps: 12, bestStreak: 1.1, chispazos: 1, luz: 30 } }, 'es')[0];
    const en = fingerLines({ finger: { taps: 1, bestStreak: 1.03, chispazos: 0, luz: 1 } }, 'en')[0];
    expect(es).toMatch(/12 toques en criaturas/);
    expect(en).toMatch(/1 tap on creatures/);
  });
});

describe('a long session card says it goes on (QA-4 N16)', () => {
  it('QA-4 N16: «more» while content hides below the buttons, not at the end', () => {
    expect(moreBelow(0, 600, 1362)).toBe(true);
    expect(moreBelow(762, 600, 1362)).toBe(false);
    expect(moreBelow(0, 600, 604)).toBe(false);
  });
});

// QA-4 (c1-040, c1-155, c2-035): «EL RELOJ ESPERA A QUE DESPIERTE» made the clock pill grow over the LUZ counter and
// the Journal. The pill's own label stays as short as «Sesión 3»; the long sentence is the wide screen's.
describe('the clock pill never grows over the HUD (QA-4)', () => {
  it('QA-4: the pill\'s label while the creature wakes is as short as «Sesión 12»', () => {
    const v = { phase: 'ready' as const, remaining: 20, total: 20, n: 12, sprint: null, wakeHold: true };
    for (const l of ['es', 'en'] as const) {
      expect(hudSub(v, false, l).length).toBeLessThanOrEqual(hudSub({ ...v, wakeHold: false }, false, l).length + 4);
      expect(hudSub(v, false, l)).toBe(HUD_WAKE_SHORT[l]);
    }
  });

  it('QA-4: the wait is read from the game\'s clockWait when it has one, else from wakeHold', () => {
    expect(clockWaitOf({ wakeHold: true })).toBe(true);
    expect(clockWaitOf({ wakeHold: false })).toBe(false);
    expect(clockWaitOf(null)).toBe(false);
    expect(clockWaitOf({ clockWait: 'wake', wakeHold: false })).toBe(true);
    expect(clockWaitOf({ clockWait: { reason: 'wake' } })).toBe(true);
    expect(clockWaitOf({ clockWait: 'seed', wakeHold: true })).toBe(false);
    expect(clockWaitOf({ clockWait: null, wakeHold: true })).toBe(false);
  });
});
