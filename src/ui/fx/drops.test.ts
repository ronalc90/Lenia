import { describe, expect, it } from 'vitest';
import { beadRadius, DROP_FX, dropAnchor, dropGlow, popScale } from './drops';

describe('drops of light (fx/drops.ts, ADR-030)', () => {
  it('a drop grows with its light and is always a touchable target', () => {
    expect(beadRadius(0)).toBe(DROP_FX.rMin);
    expect(beadRadius(1)).toBe(DROP_FX.rMax);
    expect(beadRadius(0.25)).toBeLessThan(beadRadius(0.5));
    expect(beadRadius(2)).toBe(DROP_FX.rMax);
    // The touch radius is far larger than the bead: a 64 px target at any zoom (CLAUDE.md asks for 48).
    expect(2 * DROP_FX.tapPx).toBeGreaterThanOrEqual(48);
  });

  it('only a ripe drop breathes; a full one waits steady; Reduce motion holds still', () => {
    const at = (f: number, rm = false) => [0, 0.4, 0.8, 1.2].map((t) => dropGlow(f, t, rm));
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    expect(spread(at(0.4))).toBe(0);
    expect(spread(at(0.8))).toBeGreaterThan(0);
    expect(spread(at(1))).toBe(0);
    expect(spread(at(0.8, true))).toBe(0);
    expect(dropGlow(1, 0, false)).toBeGreaterThan(dropGlow(0.2, 0, false));
  });

  it('an owned drop sits on its creature outline, up and to the right, never on the body', () => {
    const o = { x: 0, y: 0 };
    dropAnchor(30, 6, o);
    expect(Math.hypot(o.x, o.y)).toBeGreaterThan(30 + 6);
    expect(o.x).toBeGreaterThan(0);
    expect(o.y).toBeLessThan(0);
  });

  it('a collected bead draws in (no overshoot, no bounce)', () => {
    let prev = popScale(0);
    expect(prev).toBe(1);
    for (let t = 0.1; t <= 1.0001; t += 0.1) {
      const v = popScale(t);
      expect(v).toBeLessThanOrEqual(prev);
      expect(v).toBeGreaterThanOrEqual(0);
      prev = v;
    }
    expect(popScale(1)).toBe(0);
  });
});

describe('a collected drop (DropLayer)', () => {
  it('shows again when the game keeps its id and refills it from empty', async () => {
    const { DropLayer } = await import('./drops');
    const L = new DropLayer();
    const none = () => false;
    L.setView([{ id: 1, x: 10, y: 10, amount: 8, fill: 0.8, owner: null }], () => undefined, 0, none);
    // Not drawn yet (no frame): taking it still marks it.
    L.take(1, 0.1);
    // The next view: same id, emptied by the collection.
    L.setView([{ id: 1, x: 10, y: 10, amount: 0.1, fill: 0.01, owner: null }], () => undefined, 0.2, none);
    expect((L as unknown as { states: Map<number, { taken: boolean }> }).states.get(1)?.taken).toBe(false);
  });
});
