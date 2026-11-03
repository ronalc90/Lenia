import { describe, expect, it } from 'vitest';
import { Bus, type GameEvents } from '../core/bus';
import { createMoments } from '../moments/moments';
import { makeView, memoryStorage, species } from '../moments/testUtil';
import { momentWaits, type MomentScreen } from './momentGate';

const free: MomentScreen = { covered: false, intro: false, shortRun: false, flow: false, story: false, sheet: false, celebration: false, drawer: false, lit: true };

describe('a Momento waits for a free screen', () => {
  it('opens on a free, lit dish', () => {
    expect(momentWaits(free)).toBe(false);
  });

  it('waits while any surface is up, the Bestiary drawer included', () => {
    for (const k of ['covered', 'intro', 'shortRun', 'flow', 'story', 'sheet', 'celebration', 'drawer'] as const) expect(momentWaits({ ...free, [k]: true })).toBe(true);
    expect(momentWaits({ ...free, lit: false })).toBe(true);
  });

  it('a new species registered while the Bestiary is open shows its card once the drawer closes', () => {
    const bus = new Bus<GameEvents>();
    let t = 1_000_000;
    const screen = { ...free, drawer: true };
    const sp = species('sp1');
    const view = makeView({ stats: { ...makeView().stats, seeds: 1 }, species: [sp] });
    const m = createMoments({ bus, getView: () => view, storage: memoryStorage(), now: () => t, pollMs: 0, isBlocked: () => momentWaits(screen) });
    t += 5000;
    bus.emit('speciesNew', { speciesId: 'sp1', name: 'sp1', rarity: 'common', x: 40, y: 40 });
    for (let i = 0; i < 8; i++) {
      t += 250;
      m.tick();
    }
    expect(m.current()).toBeNull();
    screen.drawer = false;
    for (let i = 0; i < 8 && !m.current(); i++) {
      t += 250;
      m.tick();
    }
    expect(m.current()?.id).toBe('species');
  });
});
