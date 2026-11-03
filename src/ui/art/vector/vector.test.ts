import { afterEach, describe, expect, it } from 'vitest';
import { LAMP, MATERIAL } from '../tokens';
import {
  CYLINDER_AT,
  LayerCache,
  circ,
  conicMetal,
  cylinderRamp,
  grainPattern,
  hairline,
  hash01,
  kelvin,
  kelvinHex,
  lineWidth,
  px,
  rr,
  setCanvasFactory,
  snap,
  type Ctx2D,
  type LayerCanvas,
} from './index';

/** A canvas double: records what the kit asks of its context. */
interface FakeCanvas {
  width: number;
  height: number;
  ctx: FakeCtx;
  getContext(kind: string): FakeCtx;
}

class FakeGradient {
  stops: [number, string][] = [];
  constructor(readonly kind: string) {}
  addColorStop(at: number, color: string): void {
    this.stops.push([at, color]);
  }
}

class FakeCtx {
  calls: string[] = [];
  transform: number[] = [];
  createConicGradient?: (a: number, x: number, y: number) => FakeGradient;
  constructor(conic = true) {
    if (conic) this.createConicGradient = () => new FakeGradient('conic');
  }
  setTransform(...m: number[]): void {
    this.transform = m;
  }
  createLinearGradient(): FakeGradient {
    return new FakeGradient('linear');
  }
  createRadialGradient(): FakeGradient {
    return new FakeGradient('radial');
  }
  createImageData(w: number, h: number): { data: Uint8ClampedArray } {
    return { data: new Uint8ClampedArray(w * h * 4) };
  }
  putImageData(): void {
    this.calls.push('putImageData');
  }
  createPattern(): object {
    this.calls.push('createPattern');
    return { pattern: true };
  }
  fillRect(): void {
    this.calls.push('fillRect');
  }
}

const made: FakeCanvas[] = [];
function fakeCanvas(w: number, h: number): FakeCanvas {
  const ctx = new FakeCtx();
  const c: FakeCanvas = { width: w, height: h, ctx, getContext: () => ctx };
  made.push(c);
  return c;
}
const useFakeCanvas = () => setCanvasFactory((w, h) => fakeCanvas(w, h) as unknown as LayerCanvas);
const asCtx = (c: FakeCtx) => c as unknown as Ctx2D;

afterEach(() => {
  setCanvasFactory(null);
  made.length = 0;
});

describe('paths are SVG path data (docs/ARTE-REALISTA.md §3.3)', () => {
  it("a rounded rectangle is the bezel path of the bible's worked example", () => {
    expect(rr(15.5, 23.5, 51, 37, 3.5)).toBe(
      'M19 23.5H63A3.5 3.5 0 0 1 66.5 27V57A3.5 3.5 0 0 1 63 60.5H19A3.5 3.5 0 0 1 15.5 57V27A3.5 3.5 0 0 1 19 23.5Z',
    );
  });

  it('the corner radius never exceeds half the short side, and zero gives square corners', () => {
    expect(rr(0, 0, 10, 4, 9)).toBe(rr(0, 0, 10, 4, 2));
    expect(rr(1, 2, 3, 4, 0)).toBe('M1 2H4V6H1Z');
  });

  it('a circle is two half arcs that close where they start, without float noise', () => {
    expect(circ(77, 31, 6.4)).toBe('M70.6 31A6.4 6.4 0 1 0 83.4 31A6.4 6.4 0 1 0 70.6 31Z');
    expect(circ(0.1 + 0.2, 0, 1)).not.toContain('0000');
  });
});

describe('line weights are CSS px at any DPR (§3.8)', () => {
  it('px converts CSS px to box units and hairline is one device pixel', () => {
    expect(px(200)).toBe(0.5);
    expect(px(0)).toBe(1);
    expect(hairline(200, 2)).toBe(0.25);
    expect(lineWidth('contour', 100, 1)).toBe(1.25);
    expect(lineWidth('hair', 100, 3)).toBeCloseTo(1 / 3, 10);
    expect(lineWidth(2, 50, 1)).toBe(4);
  });

  it('snap puts a coordinate on the centre of a device pixel', () => {
    for (const [size, dpr] of [
      [240, 2],
      [48, 3],
      [100, 1],
    ]) {
      const k = (size / 100) * dpr;
      for (const v of [0, 12.34, 50, 99.9]) {
        const s = snap(v, size, dpr);
        expect(s * k - 0.5).toBeCloseTo(Math.round(s * k - 0.5), 9);
        expect(Math.abs(s - v)).toBeLessThanOrEqual(1 / k);
      }
    }
  });
});

describe('blackbody light (§4.3, Helland R5)', () => {
  it('kelvin 2700 K is warm amber, 6500 K is near white', () => {
    expect(kelvin(2700)).toEqual([255, 167, 87]);
    const [r, g, b] = kelvin(6500);
    expect(Math.min(r, g, b)).toBeGreaterThanOrEqual(245);
    expect(r).toBe(255);
  });

  it('reproduces every lamp token exactly', () => {
    for (const [k, hex] of Object.entries(LAMP)) expect(kelvinHex(Number(k)), `${k} K`).toBe(hex);
  });

  it('is deterministic, clamps to 1000–40000 K and reuses its result (no allocation per frame)', () => {
    expect(kelvin(2700)).toBe(kelvin(2700));
    expect(kelvin(500)).toEqual(kelvin(1000));
    expect(kelvin(1e6)).toEqual(kelvin(40000));
    expect(kelvin(Number.NaN)).toEqual(kelvin(6600));
    const [r1, , b1] = kelvin(1900);
    const [r2, , b2] = kelvin(12000);
    expect(r1).toBeGreaterThan(r2); // cold light loses red...
    expect(b2).toBeGreaterThan(b1); // ...and gains blue
  });
});

describe('texture', () => {
  it('the hash is deterministic and stays in [0, 1)', () => {
    expect(hash01(42)).toBe(hash01(42));
    let lo = 1;
    let hi = 0;
    for (let i = 0; i < 4096; i++) {
      const v = hash01(i);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThan(1);
    expect(hi - lo).toBeGreaterThan(0.95);
  });

  it('grain is null without a canvas and never throws', () => {
    expect(grainPattern(asCtx(new FakeCtx()))).toBeNull();
  });

  it('grain builds its tile once and keeps one pattern per context', () => {
    useFakeCanvas();
    const ctx = new FakeCtx();
    const p = grainPattern(asCtx(ctx));
    expect(p).not.toBeNull();
    expect(grainPattern(asCtx(ctx))).toBe(p);
    expect(ctx.calls.filter((c) => c === 'createPattern')).toHaveLength(1);
    grainPattern(asCtx(new FakeCtx()));
    expect(made).toHaveLength(1);
    expect(made[0].width).toBe(64);
    expect(made[0].ctx.calls).toContain('putImageData');
  });
});

describe('gradients (§3.5)', () => {
  it('the cylinder ramp is the five chrome stops: edge, specular at 0.28, local, reflected at 0.82, edge', () => {
    const g = cylinderRamp(asCtx(new FakeCtx()), 0, 7.2, 0, 10.4) as unknown as FakeGradient;
    expect(g.stops).toEqual(CYLINDER_AT.map((at, i) => [at, MATERIAL.chrome[i]]));
    expect(CYLINDER_AT).toEqual([0, 0.28, 0.5, 0.82, 1]);
  });

  it('a ramp with its own colours and no matching offsets spaces them evenly', () => {
    const g = cylinderRamp(asCtx(new FakeCtx()), 0, 0, 1, 0, ['#000', '#fff', '#000']) as unknown as FakeGradient;
    expect(g.stops).toEqual([
      [0, '#000'],
      [0.5, '#fff'],
      [1, '#000'],
    ]);
  });

  it('turned metal alternates light and dark round the centre, and falls back to a radial', () => {
    const g = conicMetal(asCtx(new FakeCtx()), 77, 71.5, -0.6, '#d8dadb', '#5c6064', 4) as unknown as FakeGradient;
    expect(g.kind).toBe('conic');
    expect(g.stops).toHaveLength(9);
    expect(g.stops[0]).toEqual([0, '#d8dadb']);
    expect(g.stops[1][1]).toBe('#5c6064');
    expect(g.stops[8]).toEqual([1, '#d8dadb']);
    const f = conicMetal(asCtx(new FakeCtx(false)), 0, 0, 0, '#fff', '#000', 4, 5) as unknown as FakeGradient;
    expect(f.kind).toBe('radial');
    expect(f.stops).toEqual([
      [0, '#fff'],
      [1, '#000'],
    ]);
  });
});

describe('LayerCache (§3.9)', () => {
  it('returns the same canvas for the same key and redraws on a new DPR', () => {
    useFakeCanvas();
    const cache = new LayerCache();
    let paints = 0;
    const paint = () => void paints++;
    const a = cache.get('vela|dark|', 240, 240, 2, paint);
    expect(a).not.toBeNull();
    expect(cache.get('vela|dark|', 240, 240, 2, paint)).toBe(a);
    expect(paints).toBe(1);
    expect((a as unknown as FakeCanvas).width).toBe(480);
    const b = cache.get('vela|dark|', 240, 240, 3, paint);
    expect(b).not.toBe(a);
    expect(paints).toBe(2);
    expect((b as unknown as FakeCanvas).width).toBe(720);
    // The old DPR's canvas is freed, not kept.
    expect((a as unknown as FakeCanvas).width).toBe(0);
    expect(cache.size).toBe(1);
  });

  it('paints in CSS px: the context is scaled by the DPR', () => {
    useFakeCanvas();
    const cache = new LayerCache();
    let seen: [number, number, number] = [0, 0, 0];
    const c = cache.get('plate', 120, 60, 2, (_ctx, w, h, dpr) => (seen = [w, h, dpr]));
    expect(seen).toEqual([120, 60, 2]);
    expect((c as unknown as FakeCanvas).ctx.transform).toEqual([2, 0, 0, 2, 0, 0]);
  });

  it('keeps two sizes of one key side by side (portrait and avatar)', () => {
    useFakeCanvas();
    const cache = new LayerCache();
    let paints = 0;
    const paint = () => void paints++;
    const big = cache.get('vela', 240, 240, 2, paint);
    const mini = cache.get('vela', 48, 48, 2, paint);
    expect(cache.get('vela', 240, 240, 2, paint)).toBe(big);
    expect(cache.get('vela', 48, 48, 2, paint)).toBe(mini);
    expect(paints).toBe(2);
    expect(cache.has('vela', 48, 48, 2)).toBe(true);
    cache.delete('vela');
    expect(cache.size).toBe(0);
    expect(cache.has('vela', 48, 48, 2)).toBe(false);
  });

  it('frees the least recently used canvas past its limit', () => {
    useFakeCanvas();
    const cache = new LayerCache(2);
    const paint = () => undefined;
    const a = cache.get('a', 10, 10, 1, paint);
    cache.get('b', 10, 10, 1, paint);
    cache.get('a', 10, 10, 1, paint); // a is now the most recent
    cache.get('c', 10, 10, 1, paint);
    expect(cache.size).toBe(2);
    expect(cache.has('a', 10, 10, 1)).toBe(true);
    expect(cache.has('b', 10, 10, 1)).toBe(false);
    expect((a as unknown as FakeCanvas).width).toBe(10);
    cache.clear();
    expect(cache.size).toBe(0);
    expect((a as unknown as FakeCanvas).width).toBe(0);
  });

  it('returns null when no canvas can be made, so the caller draws directly', () => {
    const cache = new LayerCache();
    expect(cache.get('vela', 100, 100, 1, () => undefined)).toBeNull();
    expect(cache.size).toBe(0);
  });

  it('does not keep a layer whose painter failed', () => {
    useFakeCanvas();
    const cache = new LayerCache();
    expect(() =>
      cache.get('x', 10, 10, 1, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(cache.size).toBe(0);
  });
});
