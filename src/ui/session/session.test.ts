import { describe, expect, it } from 'vitest';
import * as C from '../../game/cycleBalance';
import { beginSession, computeDatos, freshResearch, noteEncargo, noteEssence, noteSpecies, warnSeconds, countdownSeconds } from '../../game/session';
import { treeEffects } from '../../game/tree';
import { nodePriceExplain } from '../tree/treeView';
import { fmt } from '../format';
import { hudState } from './hud';
import { datosExplain, equationRows } from './summary';

describe('the Datos equation on the end card', () => {
  it('shows every step with numbers that add up to the total', () => {
    const fx = treeEffects({ lab: 3, encyclopedia: 1 });
    const { session } = beginSession(freshResearch(), fx);
    noteEssence(session, 12.4 * C.DATOS_ESSENCE_DIV);
    noteSpecies(session, fx, 'a', true);
    noteEncargo(session, fx);
    const d = computeDatos(session, fx, 0);
    const rows = equationRows(d, 'es', 3);
    expect(rows.map((r) => r.kind)).toEqual(['essence', 'mult', 'species', 'encargos', 'book']);
    expect(rows[0].tiles[0].value).toBe(fmt(12.4 * C.DATOS_ESSENCE_DIV, 'es'));
    expect(rows[0].ops).toEqual(['÷']);
    expect(rows[0].result).toBe('12');
    expect(rows[1].result).toBe(String(d.fromEssence));
    const added = rows.slice(2).reduce((a, r) => a + Number(r.result.replace('+', '')), 0);
    expect(d.fromEssence + added).toBe(d.total);
  });

  it('opens as the shared price sheet from the HUD preview, adding up to the same total', () => {
    const fx = treeEffects({ lab: 2 });
    const { session } = beginSession(freshResearch(), fx);
    noteEssence(session, 9.5 * C.DATOS_ESSENCE_DIV);
    noteSpecies(session, fx, 'a', true);
    const d = computeDatos(session, fx, 0);
    const x = datosExplain(d, 'es', 2, { name: { es: 'Más tiempo', en: 'More time' }, missing: 4 });
    expect(x.terms.map((t) => t.value)).toEqual(['9', '×1,1']);
    expect(x.total).toBe(String(d.fromEssence)); // 9 × 1,1 → 9: the equation adds up by itself
    expect(x.rule).toMatch(new RegExp(`^Por cada ${C.DATOS_ESSENCE_DIV} de Esencia, 1 Dato`));
    expect(x.rows!.map((r) => r.label)).toEqual([`+${C.DATOS_PER_NEW_SPECIES}`, '=']);
    expect(x.rows![1].text).toBe(`${d.total} Datos al terminar`);
    expect(d.fromEssence + C.DATOS_PER_NEW_SPECIES).toBe(d.total);
    expect(x.advice).toBe('Más tiempo: te faltan 4 Datos');
  });

  it('calls the silent goals of session 1 "first goals", not requests nobody saw', () => {
    const fx = treeEffects({});
    const { session } = beginSession(freshResearch(), fx);
    noteEssence(session, 3 * C.DATOS_ESSENCE_DIV);
    noteEncargo(session, fx);
    noteEncargo(session, fx);
    const d = computeDatos(session, fx, 0);
    const label = (first: boolean) => equationRows(d, 'es', 1, first).find((r) => r.kind === 'encargos')!.tiles[0].label;
    expect(label(true)).toBe('primeras metas');
    expect(label(false)).toBe('encargos');
  });

  it('says "minimum" when a session earned almost nothing', () => {
    const fx = treeEffects({});
    const { session } = beginSession(freshResearch(), fx);
    const rows = equationRows(computeDatos(session, fx, 0), 'en', 1);
    expect(rows[rows.length - 1].kind).toBe('minimum');
    expect(rows[rows.length - 1].result).toBe(`+${C.DATOS_MIN}`);
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
