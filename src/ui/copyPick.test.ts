import { describe, expect, it } from 'vitest';
import { copyPick, type CopyPickView } from './copyPick';

const sp = (id: string, copyCost: number | null, copyBlocked: 'noCopier' | 'noSession' | 'otherWorld' | null = null) => ({ id, name: id.toUpperCase(), hue: 200, copyCost, copyBlocked });
const view = (print: number, species: CopyPickView['species'], phase: 'ready' | 'running' | 'over' = 'running'): CopyPickView => ({
  cycle: 'sessions',
  research: { levels: { print } },
  session: { phase },
  species,
});

// QA-CLARIDAD #39 / QA#3 (docs/CLARIDAD2.md §2.12): the Copiadora was bought and nothing on the dish
// said where to use it. The seed pill carries «Copiar» once it is bought.
describe('the Copiar button of the seed pill', () => {
  it('QA#3: with the Copiadora bought, the seed pill shows Copy', () => {
    expect(copyPick(view(0, [sp('a', 8)])).show).toBe(false);
    const p = copyPick(view(1, [sp('a', 8), sp('b', null, 'otherWorld')]));
    expect(p.show).toBe(true);
    expect(p.enabled).toBe(true);
    // Only the species of this world that can be copied now, with what each costs.
    expect(p.species.map((s) => s.id)).toEqual(['a']);
    expect(p.species[0].cost).toBe(8);
  });

  it('with none of this world yet, the button is there but greyed out and says why', () => {
    const p = copyPick(view(1, [sp('b', null, 'otherWorld')]));
    expect(p.show).toBe(true);
    expect(p.enabled).toBe(false);
    expect(p.reason?.es).toBe('Copiar · ninguna de este mundo todavía');
    expect(p.reason?.en).toBeTruthy();
  });

  it('no button between sessions or in the classic loop', () => {
    expect(copyPick(view(1, [sp('a', 8)], 'over')).show).toBe(false);
    expect(copyPick({ ...view(1, [sp('a', 8)]), cycle: 'classic' }).show).toBe(false);
  });

  it('the Archivo free copy reads as free', () => {
    const p = copyPick(view(1, [sp('a', 0)]));
    expect(p.species[0].cost).toBe(0);
  });
});
