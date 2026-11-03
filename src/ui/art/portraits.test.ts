import { afterEach, describe, expect, it } from 'vitest';
import { ART_MOODS, drawPortrait, drawVela, type ArtMood, type PortraitState } from './portraits';
import { bezier, countUp, ease, setReduceMotion } from './motion';
import { SCOPE_COLS, SWEEP_PERIOD, VelaScope, velaLamp, velaLed, velaTrace, type VelaPose } from './vela';
import { setCanvasFactory, type LayerCanvas } from './vector';

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
  const grad = { addColorStop: (_at: number, c: string) => void log.push(`stop(${c})`) };
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
    createConicGradient: () => grad,
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

const inBox = (pts: [number, number][], what: string) => {
  for (const [x, y] of pts) {
    expect(x, `${what} x`).toBeGreaterThanOrEqual(-1);
    expect(x, `${what} x`).toBeLessThanOrEqual(101);
    expect(y, `${what} y`).toBeGreaterThanOrEqual(-1);
    expect(y, `${what} y`).toBeLessThanOrEqual(101);
  }
};

const pose = (mood: ArtMood, over: Partial<VelaPose> = {}): VelaPose => ({ mood, moodAge: 3, talk: 0, talking: false, blink: 0, reduceMotion: false, ...over });

/** Mean absolute deflection of a trace (u). */
const level = (y: Float32Array) => y.reduce((a, v) => a + Math.abs(v), 0) / y.length;

afterEach(() => setCanvasFactory(null));

describe('VELA, the MC-7 culture monitor (docs/ARTE-REALISTA.md §4)', () => {
  it('draws all nine states (talking over every mood), with and without her wardrobe, inside the box', () => {
    expect(ART_MOODS).toHaveLength(8);
    for (const mood of ART_MOODS)
      for (const talking of [false, true])
        for (const wear of [[], ['scarf', 'medal', 'flower']]) {
          const r = recorder();
          drawVela(r.ctx, state({ mood, talking, talk: talking ? 0.8 : 0, wear, moodAge: 0.3 }), 2.3);
          expect(r.pts.length, mood).toBeGreaterThan(200);
          inBox(r.pts, mood);
        }
  });

  it('the mini and the close-up stay inside the box too, in every state', () => {
    for (const mood of ART_MOODS)
      for (const opts of [{ mini: true, size: 28 }, { mini: true, size: 48 }, { close: true, size: 116 }]) {
        const r = recorder();
        drawVela(r.ctx, state({ mood, talking: true, talk: 0.7 }), 1.1, opts);
        expect(r.pts.length, mood).toBeGreaterThan(100);
        inBox(r.pts, `${mood} ${JSON.stringify(opts)}`);
      }
  });

  it('is deterministic for a given time (no randomness in the art)', () => {
    for (const mood of ART_MOODS) {
      const a = recorder();
      const b = recorder();
      drawPortrait(a.ctx, state({ mood, talking: true, talk: 0.5 }), 4.2, null);
      drawPortrait(b.ctx, state({ mood, talking: true, talk: 0.5 }), 4.2, null);
      expect(a.log, mood).toEqual(b.log);
    }
    const c = recorder();
    drawPortrait(c.ctx, state({ speaker: 'albor' }), 4.2, null);
    const d = recorder();
    drawPortrait(d.ctx, state({ speaker: 'albor' }), 4.2, null);
    expect(c.log).toEqual(d.log);
  });

  it('the lamp warms and the trace changes with the mood', () => {
    const lamp = (m: ArtMood) => velaLamp(m, 5, 3, 0, 0, true);
    // Blackbody temperatures of §4.5: worried and alarm sag to 2200 K, happy and proud glow at 3200 K, awed at 3600 K.
    expect(lamp('happy').K).toBeGreaterThan(lamp('neutral').K);
    expect(lamp('neutral').K).toBeGreaterThan(lamp('worried').K);
    expect(lamp('awed').K).toBeGreaterThan(lamp('happy').K);
    expect(lamp('happy').on).toBeGreaterThan(lamp('neutral').on);
    expect(lamp('neutral').on).toBeGreaterThan(lamp('worried').on);
    expect(lamp('alarm').on).toBeLessThan(0.2);
    expect(lamp('sleepy').on).toBeCloseTo(0.25, 5);
    for (const m of ART_MOODS) {
      const { K } = lamp(m);
      expect(K, m).toBeGreaterThanOrEqual(1900);
      expect(K, m).toBeLessThanOrEqual(3600);
    }
    // Talking lifts the lamp (+15 % × talk); the worried filament flickers far more than the idle one.
    expect(velaLamp('neutral', 5, 3, 1, 0, false).on).toBeGreaterThan(velaLamp('neutral', 5, 3, 0, 0, false).on + 0.1);
    const spread = (m: ArtMood) => {
      let lo = 9;
      let hi = 0;
      for (let i = 0; i < 400; i++) {
        const v = velaLamp(m, i * 0.037, 5, 0, 0, false).on;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      return hi - lo;
    };
    expect(spread('worried')).toBeGreaterThan(3 * spread('neutral'));
    // The trace: each state has its own shape on the glass.
    const tr = (m: ArtMood) => {
      const y = new Float32Array(SCOPE_COLS);
      velaTrace(y, m, 6, 6, 0, false, true);
      return y;
    };
    const peak = (y: Float32Array) => Math.max(...Array.from(y, Math.abs));
    expect(peak(tr('awed'))).toBeGreaterThan(7); // the QRS-like peak of a new record
    expect(peak(tr('alarm'))).toBeLessThan(0.6); // nearly flat, with background noise
    expect(peak(tr('sleepy'))).toBe(0); // standby: no trace
    expect(level(tr('happy'))).toBeGreaterThan(1.5 * level(tr('neutral'))); // the clean 1-Hz sine is wider
    expect(Array.from(tr('worried'))).not.toEqual(Array.from(tr('neutral')));
    // And the drawing follows: the lens is made with a cooler colour when she worries than when she is happy.
    const lensStops = (m: ArtMood) => {
      const r = recorder();
      drawVela(r.ctx, state({ mood: m, reduceMotion: true }), 1);
      return r.log.filter((l) => l.startsWith('stop(')).join();
    };
    expect(lensStops('worried')).not.toEqual(lensStops('happy'));
  });

  it('alarm lights the LED: 2 Hz at 50 %, never more than 3 flashes a second, steady under Reduce motion', () => {
    for (const m of ART_MOODS) if (m !== 'alarm') for (let i = 0; i < 40; i++) expect(velaLed(m, i * 0.05, false), m).toBe(0);
    let lit = 0;
    let edges = 0;
    let prev = velaLed('alarm', 0, false);
    for (let i = 1; i <= 400; i++) {
      const v = velaLed('alarm', i / 100, false);
      lit += v;
      if (v !== prev) edges++;
      prev = v;
    }
    expect(lit / 400).toBeCloseTo(0.5, 1);
    expect(edges / 2 / 4).toBeLessThanOrEqual(3); // flashes per second over 4 s
    expect(edges / 2 / 4).toBeGreaterThanOrEqual(1.5);
    for (let i = 0; i < 40; i++) expect(velaLed('alarm', i * 0.05, true)).toBe(1);
    // The LED's red only appears in the drawing when it is lit.
    const red = (m: ArtMood) => {
      const r = recorder();
      drawVela(r.ctx, state({ mood: m, reduceMotion: true }), 1);
      return r.log.includes('stop(#ff3b2e)');
    };
    expect(red('alarm')).toBe(true);
    expect(red('neutral')).toBe(false);
    expect(red('worried')).toBe(false);
  });

  it('reduce motion freezes the trace: the same frame at any instant, in every state', () => {
    for (const mood of ART_MOODS) {
      const a = recorder();
      const b = recorder();
      drawVela(a.ctx, state({ mood, reduceMotion: true, moodAge: 0.05 }), 1, {});
      drawVela(b.ctx, state({ mood, reduceMotion: true, moodAge: 9 }), 7.7, {});
      expect(a.log, mood).toEqual(b.log);
    }
    const y1 = new Float32Array(SCOPE_COLS);
    const y2 = new Float32Array(SCOPE_COLS);
    expect(velaTrace(y1, 'happy', 0.4, 0.1, 0, false, true)).toBe(-1);
    velaTrace(y2, 'happy', 33, 20, 0, false, true);
    expect(Array.from(y1)).toEqual(Array.from(y2));
    // Without it the trace is alive: the beam sweeps left to right and the picture changes.
    const y3 = new Float32Array(SCOPE_COLS);
    const b1 = velaTrace(y3, 'happy', 0.4, 0.4, 0, false, false);
    const b2 = velaTrace(y3, 'happy', 0.5, 0.5, 0, false, false);
    expect(b2).toBeGreaterThan(b1);
    expect(b2 - b1).toBeCloseTo((0.1 / SWEEP_PERIOD) * SCOPE_COLS, 6);
  });

  it('talking animates the trace with the dialogue: the voice and each typed letter are written by the beam', () => {
    const run = (talk: number, ticks: boolean) => {
      const sc = new VelaScope();
      const p = pose('neutral', { talk, talking: talk > 0 });
      let t = 0;
      sc.step(t, 0, pose('neutral'));
      for (let i = 0; i < 120; i++) {
        t += 1 / 60;
        p.moodAge = 3 + t;
        if (ticks && i % 4 === 0) sc.tick();
        sc.step(t, 1 / 60, p);
      }
      return sc;
    };
    const quiet = run(0, false);
    const voice = run(0.9, false);
    const typing = run(0.9, true);
    expect(level(voice.y)).toBeGreaterThan(2 * level(quiet.y));
    expect(Array.from(typing.y)).not.toEqual(Array.from(voice.y));
    // Talking lifts the lamp, with thermal inertia (never in one frame).
    expect(voice.lamp).toBeGreaterThan(quiet.lamp);
    const sc = new VelaScope();
    sc.step(0, 0, pose('neutral'));
    const before = sc.lamp;
    sc.step(1 / 60, 1 / 60, pose('happy', { moodAge: 0 }));
    const after = sc.lamp;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThan(velaLamp('happy', 1 / 60, 0, 0, 0, true).on);
  });

  it('caches the static layers: a second frame paints only the screen, the lamp and the LED', () => {
    const canvases: { log: string[] }[] = [];
    setCanvasFactory((w, h) => {
      const r = recorder();
      canvases.push(r);
      return { width: w, height: h, getContext: () => r.ctx } as unknown as LayerCanvas;
    });
    const s = state({ mood: 'happy', wear: ['scarf', 'medal', 'flower'] });
    const first = recorder();
    drawVela(first.ctx, s, 1, { size: 211, dpr: 2 });
    const painted = canvases.reduce((a, c) => a + c.log.length, 0);
    const second = recorder();
    drawVela(second.ctx, s, 1.5, { size: 211, dpr: 2 });
    expect(canvases.reduce((a, c) => a + c.log.length, 0)).toBe(painted); // nothing repainted
    expect(second.log.filter((l) => l.startsWith('drawImage')).length).toBeGreaterThanOrEqual(4);
    expect(second.log.length * 4).toBeLessThan(painted);
    // No gradient is made in the frame itself: lit lens, halo and LED are kept per context.
    const third = recorder();
    drawVela(third.ctx, state({ mood: 'alarm' }), 2, { size: 211, dpr: 2 });
    drawVela(third.ctx, state({ mood: 'alarm' }), 2.01, { size: 211, dpr: 2 });
    const grads = third.log.filter((l) => /^create(Linear|Radial|Conic)Gradient/.test(l)).length;
    third.log.length = 0;
    drawVela(third.ctx, state({ mood: 'alarm' }), 2.02, { size: 211, dpr: 2 });
    expect(grads).toBeGreaterThan(0);
    expect(third.log.filter((l) => /^create(Linear|Radial|Conic)Gradient/.test(l))).toHaveLength(0);
  });

  it('draws a lighter avatar in mini mode, its label only from 40 px', () => {
    const full = recorder();
    const mini = recorder();
    drawVela(full.ctx, state(), 2, {});
    drawVela(mini.ctx, state(), 2, { mini: true, size: 48 });
    expect(mini.log.length).toBeLessThan(full.log.length);
    const glyphs = (size: number) => {
      const r = recorder();
      drawVela(r.ctx, state({ mood: 'happy' }), 2, { mini: true, size });
      return r.log.filter((l) => l.startsWith('lineTo')).length;
    };
    expect(glyphs(48)).toBeGreaterThan(glyphs(28));
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
