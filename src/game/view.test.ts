import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import { creature, recordingBus, report, seededRng } from './testUtil';

describe('creature views', () => {
  it('carry the detector velocity (cells per step) and never a non-finite one', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(4) });
    g.tick(
      0.1,
      report([
        creature({ id: 1, x: 20, vx: 0.25, vy: -0.1 }),
        creature({ id: 2, x: 120, vx: Number.NaN, vy: Number.POSITIVE_INFINITY }),
      ]),
    );
    const views = g.view().creatures;
    const a = views.find((c) => c.id === 1)!;
    const b = views.find((c) => c.id === 2)!;
    expect([a.vx, a.vy]).toEqual([0.25, -0.1]);
    expect([b.vx, b.vy]).toEqual([0, 0]);
  });
});

describe('purchases', () => {
  it('an absurd (infinite) bank never turns essence into NaN when buying ×max', () => {
    const { bus } = recordingBus();
    const g = createGame({ bus, rng: seededRng(9) });
    const st = g.state as unknown as { essence: number; unlocked: string[] };
    st.unlocked.push('autoSeeder');
    st.essence = Number.POSITIVE_INFINITY;
    g.actions.buyUpgrade('autoSeeder', 'max');
    expect(Number.isNaN(g.state.essence)).toBe(false);
  });
});
