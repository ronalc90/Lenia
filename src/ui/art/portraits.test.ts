import { describe, expect, it } from 'vitest';
import { ART_MOODS, drawPortrait, drawVela, type PortraitState } from './portraits';
import { bezier, countUp, ease, setReduceMotion } from './motion';

/**
 * A recording CanvasRenderingContext2D: logs every call, tracks the transform, and collects the
 * device-space points of every path vertex (glow arcs excluded) so tests can check the drawing
 * stays inside the 100-unit portrait box and is deterministic.
 */
function recorder() {
  const log: string[] = [];
  const pts: [number, number][] = [];
  let m = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  const mul = (a: number[], b: number[]) => [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
  const put = (x: number, y: number) => pts.push([m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  const grad = { addColorStop: () => undefined };
  const impl: Record<string, (...a: number[]) => unknown> = {
    save: () => void stack.push([...m]),
    restore: () => void (m = stack.pop() ?? [1, 0, 0, 1, 0, 0]),
    translate: (x, y) => void (m = mul(m, [1, 0, 0, 1, x, y])),
    scale: (x, y) => void (m = mul(m, [x, 0, 0, y, 0, 0])),
    rotate: (a) => void (m = mul(m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0])),
    setTransform: (a, b, c, d, e, f) => void (m = [a, b, c, d, e, f]),
    moveTo: (x, y) => put(x, y),
    lineTo: (x, y) => put(x, y),
    quadraticCurveTo: (_cx, _cy, x, y) => put(x, y),
    bezierCurveTo: (_a, _b, _c, _d, x, y) => put(x, y),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(`${key}(${args.join(',')}) got a non-finite number`);
        log.push(`${key}(${args.map((a) => (typeof a === 'number' ? a.toFixed(3) : typeof a)).join(',')})`);
        return impl[key]?.(...(args as number[]));
      };
    },
    set(target, key: string, v) {
      log.push(`${key}=${typeof v === 'number' ? v.toFixed(3) : String(typeof v === 'object' ? 'obj' : v)}`);
      target[key] = v;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log, pts };
}

const state = (over: Partial<PortraitState> = {}): PortraitState => ({
  speaker: 'vela',
  mood: 'neutral',
  moodAge: 3,
  talk: 0,
  talking: false,
  blink: 0,
  live: false,
  pulses: [0.3],
  reduceMotion: false,
  ...over,
});

describe('character art', () => {
  it('draws VELA in every mood, talking or not, with and without her wardrobe, inside the box', () => {
    for (const mood of ART_MOODS)
      for (const talking of [false, true])
        for (const wear of [[], ['scarf', 'medal', 'flower']]) {
          const r = recorder();
          drawVela(r.ctx, state({ mood, talking, talk: talking ? 0.8 : 0, wear }), 2.3);
          expect(r.pts.length, mood).toBeGreaterThan(50);
          for (const [x, y] of r.pts) {
            expect(x, `${mood} x`).toBeGreaterThanOrEqual(-1);
            expect(x, `${mood} x`).toBeLessThanOrEqual(101);
            expect(y, `${mood} y`).toBeGreaterThanOrEqual(-1);
            expect(y, `${mood} y`).toBeLessThanOrEqual(101);
          }
        }
  });

  it('draws the rest of the cast (tape, telex, eyepiece, notebook, live Albor)', () => {
    for (const speaker of ['albor', 'committee', 'coro', 'you'] as const)
      for (const live of [false, true]) {
        const r = recorder();
        drawPortrait(r.ctx, state({ speaker, live, talking: true, talk: 0.6 }), 1.7, null);
        expect(r.log.length, speaker).toBeGreaterThan(40);
        for (const [x, y] of r.pts) {
          expect(Math.min(x, y), speaker).toBeGreaterThanOrEqual(-1);
          expect(Math.max(x, y), speaker).toBeLessThanOrEqual(101);
        }
      }
  });

  it('is deterministic for a given time (no randomness in the art)', () => {
    const a = recorder();
    const b = recorder();
    drawPortrait(a.ctx, state({ mood: 'awed' }), 4.2, null);
    drawPortrait(b.ctx, state({ mood: 'awed' }), 4.2, null);
    expect(a.log).toEqual(b.log);
    const c = recorder();
    drawPortrait(c.ctx, state({ speaker: 'albor' }), 4.2, null);
    const d = recorder();
    drawPortrait(d.ctx, state({ speaker: 'albor' }), 4.2, null);
    expect(c.log).toEqual(d.log);
  });

  it('holds still under Reduce motion: the same frame at any time', () => {
    const a = recorder();
    const b = recorder();
    drawVela(a.ctx, state({ reduceMotion: true }), 1, {});
    drawVela(b.ctx, state({ reduceMotion: true }), 7.7, {});
    expect(a.log).toEqual(b.log);
  });

  it('draws a lighter avatar in mini mode', () => {
    const full = recorder();
    const mini = recorder();
    drawVela(full.ctx, state(), 2, {});
    drawVela(mini.ctx, state(), 2, { mini: true });
    expect(mini.log.length).toBeLessThan(full.log.length);
  });
});

describe('motion', () => {
  it('easings start at 0, end at 1, and pop overshoots', () => {
    for (const f of Object.values(ease)) {
      expect(f(0)).toBe(0);
      expect(f(1)).toBe(1);
    }
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => ease.pop(i / 49)))).toBeGreaterThan(1.02);
    const lin = bezier(0, 0, 1, 1);
    expect(lin(0.5)).toBeCloseTo(0.5, 3);
  });

  it('counting up writes the final value at once under Reduce motion', () => {
    setReduceMotion(true);
    const el = { textContent: '' } as unknown as HTMLElement;
    countUp(el, 0, 1240, (n) => `${n}`);
    expect(el.textContent).toBe('1240');
    setReduceMotion(null);
  });
});
