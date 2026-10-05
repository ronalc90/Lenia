/** Test helpers for the Momentos module. */
import { Bus, type GameEvents } from '../core/bus';
import type { GameView } from '../core/types';
import { creature, makeView, memoryStorage, species } from '../story/testUtil';
import { createMoments, type Moments } from './moments';
import type { MomentsDeps } from './types';

export { creature, makeView, memoryStorage, species };

export interface Harness {
  bus: Bus<GameEvents>;
  m: Moments;
  /** Mutable view returned by getView. */
  view: GameView;
  storage: ReturnType<typeof memoryStorage>;
  /** Advance the fake clock (ms), ticking like the poll timer. */
  advance(ms: number): void;
  now(): number;
  blocked: { on: boolean };
}

/** Moments over a fake clock that starts past the boot quiet time. */
export function harness(over: Partial<MomentsDeps> = {}, view: Partial<GameView> = {}, storage = memoryStorage()): Harness {
  const bus = new Bus<GameEvents>();
  let t = 1_000_000;
  const blocked = { on: false };
  const h = {
    bus,
    // A player who has sown (most moments are about what their seeds did).
    view: makeView({ stats: { ...makeView().stats, seeds: 1 }, ...view }),
    storage,
    blocked,
  } as Harness;
  h.m = createMoments({
    bus,
    getView: () => h.view,
    storage,
    now: () => t,
    pollMs: 0,
    isBlocked: () => blocked.on,
    ...over,
  });
  // Past the boot quiet window.
  t += 5000;
  // Like the real poll timer: tick at most every 250 ms of fake time.
  h.advance = (ms: number) => {
    let left = ms;
    while (left > 0) {
      const d = Math.min(250, left);
      t += d;
      left -= d;
      h.m.tick();
    }
  };
  h.now = () => t;
  return h;
}
