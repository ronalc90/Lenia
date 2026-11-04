import { describe, expect, it } from 'vitest';
import type { CreatureView } from '../core/types';
import { SPECIES_MIN_STABLE_STEPS } from '../game/balance';
import { SESSION_SIM_PACE, SIM_STEPS_PER_SEC } from '../game/cycleBalance';
import { bestiaryEmptyHint, COLLECT_AFTER_S } from './bestiaryHint';

const cv = (state: CreatureView['state'], speciesId: string | null = null): CreatureView => ({ id: 1, x: 0, y: 0, r: 8, state, behavior: null, speciesId, speciesName: null, eps: 0, age: 600 });

describe('when a creature counts for the collection (QA-CLARIDAD-2 C4)', () => {
  it('an empty Bestiary with a creature alive says why it is not there yet and how long it takes', () => {
    const h = bestiaryEmptyHint({ species: [], creatures: [cv('stable')] })!;
    expect(h.es).toMatch(/aún no tiene nombre/);
    expect(h.es).toContain(`${COLLECT_AFTER_S} s`);
    expect(h.en).toContain(`${COLLECT_AFTER_S} s`);
    expect(bestiaryEmptyHint({ species: [], creatures: [cv('born')] })).not.toBeNull();
  });

  it('the seconds it names follow the detector’s gate at the session pace', () => {
    const s = SPECIES_MIN_STABLE_STEPS / (SIM_STEPS_PER_SEC * SESSION_SIM_PACE);
    expect(Math.abs(COLLECT_AFTER_S - s)).toBeLessThanOrEqual(2.5);
  });

  it('says nothing new when the dish is empty or a species is already in', () => {
    expect(bestiaryEmptyHint({ species: [], creatures: [] })).toBeNull();
    expect(bestiaryEmptyHint({ species: [], creatures: [cv('dead'), cv('exploded')] })).toBeNull();
    expect(bestiaryEmptyHint({ species: [{} as never], creatures: [cv('stable')] })).toBeNull();
  });
});
