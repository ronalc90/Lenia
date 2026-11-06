import { describe, expect, it } from 'vitest';
import { deathLabel, dissolvedLabel, learnedLabel, refundLabel, shapelessLabel } from './deathLabel';

describe('every death keeps a short cause label (QA-CLARIDAD-2 C7)', () => {
  it('a living creature that went dark always says why, whatever the cause', () => {
    for (const cause of ['glass', 'crowd', 'faded', undefined] as const) {
      const t = deathLabel(cause, true);
      expect(t, String(cause)).not.toBeNull();
      expect(t!.es.length).toBeGreaterThan(3);
      expect(t!.en.length).toBeGreaterThan(3);
    }
    // The three Nadadoras of session 6 went dark in open agar: no longer silent.
    expect(deathLabel('faded', true)!.es).toMatch(/forma/);
    expect(deathLabel('glass', true)!.es).toMatch(/cristal/);
  });

  it('a seed that never took keeps its own words', () => {
    expect(deathLabel('faded', false)!.es).toMatch(/no prendió/);
    expect(deathLabel('crowd', false)!.es).toMatch(/cerca de otra/);
  });

  it('a living creature that lost its shape alone (no fusion, no flood) says so too', () => {
    expect(shapelessLabel(null, true, false)).not.toBeNull();
    // A fusion: the label the first «¡Se juntaron!» card taught (that card is the first one).
    expect(shapelessLabel('touch', true, true)!.es).toMatch(/juntaron/);
    expect(shapelessLabel('touch', true, false)).toBeNull();
    // A spore that never was a creature: nothing (the dish explains lysis on its own).
    expect(shapelessLabel(null, false, true)).toBeNull();
  });
});

describe('every loss is named where it happens and says what it left (ADR-031, docs/MECANICAS.md §4)', () => {
  const left = { es: /su luz quedó aquí/, en: /glow stayed here/ };

  it('every death names its cause and what it left behind', () => {
    // A living creature: its cause and «su luz quedó aquí», in both languages, whatever killed it.
    const cases = [
      [deathLabel('glass', true), /cristal/, /glass/],
      [deathLabel('faded', true), /forma/, /shape/],
      [deathLabel(undefined, true), /forma/, /shape/],
      [deathLabel('crowd', true), /sitio/, /room/],
      [shapelessLabel('touch', true, true), /juntaron/, /merged/],
      [shapelessLabel(null, true, false), /forma/, /shape/],
    ] as const;
    for (const [t, es, en] of cases) {
      expect(t, JSON.stringify(t)).not.toBeNull();
      expect(t!.es).toMatch(es);
      expect(t!.es).toMatch(left.es);
      expect(t!.en).toMatch(en);
      expect(t!.en).toMatch(left.en);
    }
    // A seed that never took: its price came back, said with the number (or the free seed it was).
    expect(refundLabel({ amount: 4, free: false })).toEqual({ es: 'No prendió · +4 de vuelta', en: 'Didn’t take · +4 back' });
    expect(refundLabel({ amount: 0, free: true }).es).toBe('No prendió · semilla gratis de vuelta');
    expect(deathLabel('faded', false, { amount: 4, free: false })!.es).toBe('No prendió · +4 de vuelta');
    // The first time a cause is seen it teaches, for Datos (one line, a chip without a pause).
    expect(learnedLabel('faded', 2).es).toBe('Aprendiste: no todas prenden. +2 Datos');
    expect(learnedLabel('touch', 2).en).toBe('Now you know why: +2 Data');
  });

  it('a runaway blob says VELA dissolved it and pays nothing', () => {
    const t = dissolvedLabel(true, false)!;
    expect(t.es).toBe('VELA disolvió una mancha que crecía sin parar');
    expect(t.en).toBe('VELA dissolved a blob that kept growing');
    // Nothing to collect: it never was a creature (only what is stable pays).
    for (const l of ['es', 'en'] as const) {
      expect(t[l]).not.toMatch(/\+\d/);
      expect(t[l]).not.toMatch(left[l]);
    }
    // The player's own tools (Goma, cleaning the dish) and matter that was never a blob say nothing.
    expect(dissolvedLabel(true, true)).toBeNull();
    expect(dissolvedLabel(false, false)).toBeNull();
  });

  it('no loss scolds the player', () => {
    const all = [
      ...(['glass', 'crowd', 'faded', undefined] as const).map((c) => deathLabel(c, true)),
      shapelessLabel('touch', true, true),
      shapelessLabel(null, true, false),
      refundLabel({ amount: 4, free: false }),
      dissolvedLabel(true, false),
    ];
    for (const t of all) for (const l of ['es', 'en'] as const) expect(t![l]).not.toMatch(/Muy cerca|se fundirían|¡Cuidado!|Too close:|Careful!/);
  });
});
