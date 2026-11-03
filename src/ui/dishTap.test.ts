import { describe, expect, it } from 'vitest';
import { dropsOnSegment, routeTap, type TapCreature, type TapDrop, type TapScene } from './dishTap';

function scene(drops: TapDrop[], creatures: TapCreature[], collecting = true): TapScene {
  return { drops, dropCount: drops.length, creatures, creatureCount: creatures.length, collecting, dropPx: 32, creaturePadPx: 16 };
}
const orbium = (id: number, x: number, y: number, behavior: TapCreature['behavior'] = 'swimmer'): TapCreature => ({ id, x, y, r: 24, state: 'stable', behavior });
const drop = (id: number, x: number, y: number, owner: number | null = null, amount = 5): TapDrop => ({ id, x, y, amount, owner });

describe('a finger on the dish (dishTap.ts, ADR-030 §2.2.1)', () => {
  it('a tap on a drop collects and never sows', () => {
    const s = scene([drop(7, 100, 100)], []);
    expect(routeTap('tap', 100, 100, s)).toEqual({ kind: 'collect', drop: 7, creature: null });
    // 30 px away is still on it (a 64 px target, above the 48 px minimum).
    expect(routeTap('tap', 130, 100, s).kind).toBe('collect');
    // Empty agar further away: a seed, as always.
    expect(routeTap('tap', 200, 100, s)).toEqual({ kind: 'sow', big: false });
    // An empty drop (collected a moment ago) is not a target.
    expect(routeTap('tap', 100, 100, scene([drop(7, 100, 100, null, 0)], []))).toEqual({ kind: 'sow', big: false });
  });

  it('a tap on a creature collects its light; a long press opens its card', () => {
    const s = scene([drop(3, 160, 60, 1)], [orbium(1, 100, 100)]);
    // On the body, away from the drop itself: its own drop is collected.
    expect(routeTap('tap', 90, 110, s)).toEqual({ kind: 'collect', drop: 3, creature: 1 });
    expect(routeTap('long', 100, 100, s)).toEqual({ kind: 'card', id: 1 });
    // No light yet: the tap never sows on it; it points at the long press.
    const dry = scene([], [orbium(1, 100, 100)]);
    expect(routeTap('tap', 100, 100, dry)).toEqual({ kind: 'cardHint', id: 1 });
    // A long press on empty agar is the big seed.
    expect(routeTap('long', 300, 300, s)).toEqual({ kind: 'sow', big: true });
    // Without collection (no drops in the view) the short tap still opens the card, as before.
    expect(routeTap('tap', 100, 100, scene([], [orbium(1, 100, 100)], false))).toEqual({ kind: 'card', id: 1 });
  });

  it('a swipe across three drops collects all three', () => {
    const s = scene([drop(1, 50, 100), drop(2, 150, 110), drop(3, 250, 95), drop(4, 150, 300)], []);
    expect(routeTap('drag', 10, 100, s)).toEqual({ kind: 'sweep' });
    const out: number[] = [];
    let n = dropsOnSegment(s, 10, 100, 160, 100, out, 0);
    n = dropsOnSegment(s, 160, 100, 290, 100, out, n);
    // Passing over drop 2 again does not count it twice.
    n = dropsOnSegment(s, 290, 100, 140, 105, out, n);
    expect(out.slice(0, n).sort()).toEqual([1, 2, 3]);
  });

  it('a drag from a swimmer steers it and collects nothing', () => {
    const s = scene([drop(5, 120, 100, 1)], [orbium(1, 100, 100), orbium(2, 300, 300, 'spinner')]);
    expect(routeTap('drag', 105, 100, s)).toEqual({ kind: 'steer', id: 1 });
    // A spinner is not guided: a drag from it is a sweep like any other.
    expect(routeTap('drag', 300, 300, s)).toEqual({ kind: 'sweep' });
    // Without collection a drag from empty agar is left to the brush / eraser.
    expect(routeTap('drag', 10, 10, scene([], [], false))).toEqual({ kind: 'none' });
  });
});
