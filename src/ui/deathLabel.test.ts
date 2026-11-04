import { describe, expect, it } from 'vitest';
import { deathLabel, shapelessLabel } from './deathLabel';

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
