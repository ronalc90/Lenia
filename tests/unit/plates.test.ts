import { describe, expect, it } from 'vitest';
import { MOMENTS } from '../../src/moments/catalog';
import { momentPlateKind, plateOf } from '../../src/ui/moments/plates';

// The Momento catalog (src/moments) numbers its cards; the plates (src/ui/moments/plates.ts) number their
// drawings. The report's «Láminas de hoy» shows the drawing's number for a card's plate (ADR-030 §2.8),
// so both must say the same «LÁMINA n» for the same card.
describe('every Momento plate carries the number of its drawing', () => {
  it('a card and its illustration agree on the plate number', () => {
    const off = MOMENTS.filter((m) => plateOf(momentPlateKind(m))?.no !== m.plate).map((m) => `${m.id}: card ${m.plate}, drawing ${plateOf(momentPlateKind(m))?.no}`);
    expect(off).toEqual([]);
  });

  it('every card has a drawing with a number', () => {
    expect(MOMENTS.filter((m) => !plateOf(momentPlateKind(m))).map((m) => `${m.id} (${m.illustration})`)).toEqual([]);
  });
});
