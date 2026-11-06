import { describe, expect, it } from 'vitest';
import type { Projector } from './particles';
import type { SpriteAtlas } from './sprites';
import type { CreatureResolver } from './drops';
import { chargeAt, chispazoScale, glowAt, hitStop, moteThrow, numRise, numScale, PULSE_FX, PulseLayer } from './pulse';

/** A canvas that only counts what is drawn (no DOM in unit tests). */
function fakeCtx(): CanvasRenderingContext2D & { texts: string[] } {
  const texts: string[] = [];
  const noop = () => undefined;
  return {
    texts,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
    lineJoin: 'round',
    beginPath: noop,
    arc: noop,
    stroke: noop,
    fill: noop,
    fillText: (t: string) => void texts.push(t),
    strokeText: noop,
  } as unknown as CanvasRenderingContext2D & { texts: string[] };
}
const atlas = { draw: () => undefined, color: () => 0 } as unknown as SpriteAtlas;
const map: Projector = { px: (x) => x * 3, py: (y) => y * 3 };
/** Creature 1 sits at grid (50, 50); creature 2 at (20, 80). */
const creatures: CreatureResolver = (id, out) => {
  if (id !== 1 && id !== 2) return false;
  out.x = map.px(id === 1 ? 50 : 20);
  out.y = map.py(id === 1 ? 50 : 80);
  out.r = 30;
  out.hue = 190;
  return true;
};

function layer(): PulseLayer {
  const L = new PulseLayer();
  L.setText((n) => `+${Math.round(n)}`, (n) => `¡CHISPAZO! +${Math.round(n)}`, 'es');
  return L;
}
function frame(L: PulseLayer, now: number, rm = false, ctx = fakeCtx()): CanvasRenderingContext2D & { texts: string[] } {
  L.draw(ctx, atlas, now, 1 / 60, rm, 1, map, creatures);
  return ctx;
}

describe('the pulse, timed (fx/pulse.ts, MECANICAS §3.2)', () => {
  it('a pulse glows for 250 ms: a quick rise like a dinoflagellate flash, then a fall', () => {
    expect(glowAt(-0.01)).toBe(0);
    expect(glowAt(PULSE_FX.glowRiseS)).toBeCloseTo(1, 5);
    let prev = 1;
    for (let t = PULSE_FX.glowRiseS; t <= PULSE_FX.glowS; t += 0.01) {
      const g = glowAt(t);
      expect(g).toBeLessThanOrEqual(prev + 1e-9);
      prev = g;
    }
    expect(glowAt(PULSE_FX.glowS)).toBe(0);
    expect(PULSE_FX.glowS).toBe(0.25);
  });

  it('the halo charges with each tap and drains in 300 ms', () => {
    let c = chargeAt(0, 0);
    // Taps 100 ms apart: it climbs.
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      c = Math.min(1, chargeAt(c, 0.1) + PULSE_FX.chargeStep);
      seen.push(c);
    }
    expect(seen[3]).toBeGreaterThan(seen[0]);
    expect(seen[3]).toBeLessThanOrEqual(1);
    // From full, nothing left after 300 ms.
    expect(chargeAt(1, PULSE_FX.chargeS)).toBe(0);
    expect(chargeAt(1, PULSE_FX.chargeS / 2)).toBeCloseTo(0.5, 5);
  });

  it('the +N grows 4 % a hit up to ×1.4', () => {
    expect(numScale(0, false)).toBe(1);
    expect(numScale(5, false)).toBeCloseTo(1.2, 9);
    expect(numScale(10, false)).toBeCloseTo(1.4, 9);
    expect(numScale(30, false)).toBeCloseTo(1.4, 9);
    expect(PULSE_FX.growPerHit).toBe(0.04);
    expect(PULSE_FX.growMax).toBe(1.4);
  });

  it('Reduce motion: no scale, no rise, no hit-stop, no flying glimmers', () => {
    expect(numScale(10, true)).toBe(1);
    expect(numRise(0.5, true)).toBe(0);
    expect(numRise(0.5, false)).toBeGreaterThan(0);
    expect(hitStop(true)).toBe(0);
    expect(hitStop(false)).toBeCloseTo(0.06, 9);
    expect(chispazoScale(0, true)).toBe(1);
    expect(moteThrow(0, true)).toBe(1);
    expect(moteThrow(0, false)).toBe(0);
  });

  it('the Chispazo label settles in without a bounce', () => {
    let prev = chispazoScale(0, false);
    expect(prev).toBeLessThan(1);
    for (let t = 0.02; t < 0.5; t += 0.02) {
      const s = chispazoScale(t, false);
      expect(s).toBeGreaterThanOrEqual(prev);
      expect(s).toBeLessThanOrEqual(1);
      prev = s;
    }
    expect(chispazoScale(0.5, false)).toBe(1);
  });
});

describe('the pulse layer (fx/pulse.ts)', () => {
  it('a tap glows its creature at once, before the game answers', () => {
    const L = layer();
    L.glow(1, 50, 50, 0);
    expect(L.glowing(1, 0.02)).toBeGreaterThan(0.5);
    expect(L.glowing(2, 0.02)).toBe(0);
    expect(L.glowing(1, 0.3)).toBe(0);
  });

  it('a paid pulse shows «+N» over the creature, sized by the streak', () => {
    const L = layer();
    L.paid(1, 50, 50, 3, 1, false, 0);
    const ctx = frame(L, 0.05);
    expect(ctx.texts).toEqual(['+3']);
    expect(L.numSize(1)).toBeCloseTo(PULSE_FX.numPx * numScale(1, false), 6);
    L.paid(2, 20, 80, 1, 10, false, 0.5);
    expect(L.numSize(2)).toBeCloseTo(PULSE_FX.numPx * 1.4, 6);
  });

  it('fast taps merge their numbers: at ten a second, one number for two taps', () => {
    const L = layer();
    for (let i = 0; i < 6; i++) L.paid(1, 50, 50, 1, i + 1, false, i * 0.1);
    // Six taps in 0.5 s: three numbers of «+2».
    expect(L.liveNums(0.5)).toBe(3);
    expect(frame(L, 0.5).texts).toEqual(['+2', '+2', '+2']);
    // Five a second (slower than 6/s) never merge.
    const S = layer();
    for (let i = 0; i < 4; i++) S.paid(1, 50, 50, 1, i + 1, false, i * 0.2);
    expect(S.liveNums(0.65)).toBe(4);
  });

  it('a Chispazo shows its own label, asks for the hit-stop and the kick, and makes no «+N»', () => {
    const L = layer();
    const r = L.paid(1, 50, 50, 25, 10, true, 0);
    expect(r).toBe(true);
    expect(L.paid(1, 50, 50, 5, 11, false, 0.1)).toBe(false);
    const ctx = frame(L, 0.12);
    expect(ctx.texts).toContain('¡CHISPAZO! +25');
    expect(ctx.texts.filter((t) => t === '+25').length).toBe(0);
  });

  it('a glimmer flies out from its creature and is a target where it lands', () => {
    const L = layer();
    // The game threw it at grid (60, 50), from creature 1 at (50, 50).
    L.setMotes([{ id: 7, x: 60, y: 50, age: 0, life: 2.5, owner: 1 }], 0, (id, out) => {
      out.x = 50;
      out.y = 50;
      return id === 1;
    });
    frame(L, 0);
    expect(L.tapCount).toBe(1);
    expect(L.tap[0].x).toBeCloseTo(150, 0); // still on the creature
    frame(L, PULSE_FX.moteThrowS + 0.01);
    expect(L.tap[0].id).toBe(7);
    expect(L.tap[0].x).toBeCloseTo(180, 0); // where the game put it
    // With Reduce motion it is there from the start.
    const R = layer();
    R.setMotes([{ id: 7, x: 60, y: 50, age: 0, life: 2.5, owner: 1 }], 0, () => false);
    frame(R, 0, true);
    expect(R.tap[0].x).toBeCloseTo(180, 0);
  });

  it('a caught glimmer pops where it was drawn and is no target any more', () => {
    const L = layer();
    L.setMotes([{ id: 7, x: 60, y: 50, age: 1, life: 2.5, owner: null }], 0, () => false);
    frame(L, 0.1);
    const at = L.take(7, 0.1);
    expect(at).not.toBeNull();
    expect(at!.x).toBeCloseTo(180, 0);
    frame(L, 0.12);
    expect(L.tapCount).toBe(0);
    // The game's answer: «+N» where it was.
    L.caught(7, 60, 50, 4, 0.12);
    expect(frame(L, 0.15).texts).toContain('+4');
  });

  it('pools: 600 taps allocate nothing after warm-up', () => {
    const L = layer();
    const owner = (id: number, out: { x: number; y: number }) => {
      out.x = 50;
      out.y = 50;
      return id === 1;
    };
    const motes = Array.from({ length: 5 }, (_, i) => ({ id: i, x: 55 + i, y: 50, age: 0, life: 2.5, owner: 1 }));
    const play = (from: number, n: number) => {
      for (let i = from; i < from + n; i++) {
        const t = i * 0.1;
        const id = 1 + (i % 2);
        L.glow(id, 50, 50, t);
        const ch = i % 10 === 9;
        L.paid(id, 50, 50, 1 + (i % 4), (i % 10) + 1, ch, t);
        if (ch) {
          for (const m of motes) m.id = (i * 7 + m.x) % 40;
          L.setMotes(motes, t, owner);
        } else if (i % 10 === 3) L.setMotes(motes.slice(0, 0), t, owner);
        if (i % 5 === 0) L.grey(2, 20, 80, t);
        if (i % 7 === 0) L.ripple(100, 100, t);
        if (i % 10 === 1 && L.tapCount) L.take(L.tap[0].id, t);
        frame(L, t + 0.016);
      }
    };
    play(0, 100);
    const warm = L.allocations;
    play(100, 600);
    expect(L.allocations).toBe(warm);
    expect(L.capacity()).toEqual({ glows: PULSE_FX.maxGlows, nums: PULSE_FX.maxNums, motes: PULSE_FX.maxMotes, bursts: PULSE_FX.maxBursts, marks: PULSE_FX.maxMarks });
  });
});
