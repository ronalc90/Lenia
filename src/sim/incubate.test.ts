import { describe, expect, it } from 'vitest';
import { IncubationPacer, type IncubatingDish, type IncubationIO } from './incubate';

/**
 * A model device: the GPU runs queued work in order (`msPerStep` per step, `renderMs` per frame), a
 * synchronous read waits until everything queued before it is done, the detector costs `detectMs`
 * of CPU, frames start on a 60 Hz vsync (or late, when the previous frame overran).
 */
interface Device {
  msPerStep: number;
  renderMs: number;
  detectMs: number;
  /** Readback overhead of a read (copy + decode), ms. */
  readMs?: number;
}

const EVERY = 10;
const BUDGET = 8;
const VSYNC = 1000 / 60;

function play(dev: Device, steps: number, opts: { minSteps?: number; maxFrames?: number } = {}) {
  let clock = 0;
  let gpuFreeAt = 0;
  let step = 0;
  let detected = -1;
  const reads: number[] = [];
  const blind: number[] = [];
  const dish: IncubatingDish = {
    get stepCount() {
      return step;
    },
    contextLost: false,
    advance(k: number) {
      // Never past a boundary the detector has not read (the dish never steps blind).
      if (step % EVERY === 0 && detected !== step) blind.push(step);
      gpuFreeAt = Math.max(gpuFreeAt, clock) + k * dev.msPerStep;
      step += k;
    },
  };
  const io: IncubationIO = {
    due: () => step % EVERY === 0 && detected !== step,
    read: () => {
      const wait = Math.max(0, gpuFreeAt - clock) + (dev.readMs ?? 0.3);
      clock += wait + dev.detectMs;
      detected = step;
      reads.push(step);
      return wait;
    },
    now: () => clock,
  };
  const pacer = new IncubationPacer({ budgetMs: BUDGET, every: EVERY, maxSteps: 400, minSteps: opts.minSteps });
  const frames: { ms: number; reads: number; ran: number }[] = [];
  let left = steps;
  let frameStart = 0;
  while (left > 0 && frames.length < (opts.maxFrames ?? 5000)) {
    clock = frameStart;
    const f = pacer.frame(dish, left, io);
    left -= f.ran;
    frames.push({ ms: f.ms, reads: f.reads, ran: f.ran });
    // The frame's render goes after the incubation's steps.
    gpuFreeAt = Math.max(gpuFreeAt, clock) + dev.renderMs;
    frameStart = Math.max(frameStart + VSYNC, Math.ceil((clock + 1) / VSYNC) * VSYNC);
  }
  return { frames, reads, blind, left, pacer };
}

describe('hidden incubation pacing', () => {
  // ARTE-PULIDO §6: one 232² step ≈ 1.75 ms of a mid-range phone's GPU (≤ 3.5 ms for 2 steps).
  const midPhone: Device = { msPerStep: 1.75, renderMs: 3, detectMs: 3 };

  it('reads every 10th step exactly once and never steps past an unread boundary', () => {
    for (const dev of [midPhone, { msPerStep: 0.05, renderMs: 0.5, detectMs: 0.3 }, { msPerStep: 8, renderMs: 6, detectMs: 6 }]) {
      const { reads, blind, left } = play(dev, 1250);
      expect(left).toBe(0);
      expect(blind).toEqual([]);
      expect(reads).toEqual(Array.from({ length: 125 }, (_, i) => i * EVERY));
    }
  });

  it('a mid-range phone keeps its frames under the budget instead of 25–40 ms stalls', () => {
    const { frames, left } = play(midPhone, 1250);
    expect(left).toBe(0);
    expect(Math.max(...frames.map((f) => f.reads))).toBe(1);
    // The first frames learn the GPU's pace; after that the incubation stays in its budget, but for a
    // probe now and then (one boundary's wait over, never a stall of a whole frame).
    const ms = frames.slice(6).map((f) => f.ms).sort((a, b) => a - b);
    expect(ms[Math.floor(ms.length * 0.95)]).toBeLessThanOrEqual(BUDGET);
    expect(ms[ms.length - 1]).toBeLessThan(12);
    expect(frames.filter((f) => f.ms > BUDGET).length).toBeLessThan(frames.length / 20);
    // Still done in a few seconds of 60 Hz frames (1250 steps are ~2.2 s of this GPU's time at best;
    // the old loop took ~2.9 s at 30 fps on this model, the frames waiting on the GPU).
    expect(frames.length).toBeLessThan(4.5 * 60);
  });

  it('the old loop on the same phone: every frame waited for the previous frame’s steps', () => {
    // Reference for the numbers above: the v0.019 loop (budget checked only before each read).
    let clock = 0;
    let gpuFreeAt = 0;
    let step = 0;
    let detected = -1;
    const ms: number[] = [];
    let frameStart = 0;
    while (step < 1250) {
      clock = frameStart;
      const t0 = clock;
      let budget = 400;
      while (budget > 0 && clock < t0 + BUDGET) {
        if (step % EVERY === 0 && detected !== step) {
          clock += Math.max(0, gpuFreeAt - clock) + 0.3 + midPhone.detectMs;
          detected = step;
        }
        const k = Math.min(budget, EVERY - (step % EVERY));
        gpuFreeAt = Math.max(gpuFreeAt, clock) + k * midPhone.msPerStep;
        step += k;
        budget -= k;
      }
      ms.push(clock - t0);
      gpuFreeAt = Math.max(gpuFreeAt, clock) + midPhone.renderMs;
      frameStart = Math.max(frameStart + VSYNC, Math.ceil((clock + 1) / VSYNC) * VSYNC);
    }
    const sorted = [...ms].sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length / 2)]).toBeGreaterThan(BUDGET);
  });

  it('a fast GPU still incubates the starter within a second', () => {
    const { frames, left, pacer } = play({ msPerStep: 0.05, renderMs: 0.5, detectMs: 0.3 }, 1250);
    expect(left).toBe(0);
    expect(frames.length).toBeLessThan(60);
    // It learned that a second read in a frame is cheap: several boundaries a frame.
    expect(Math.max(...frames.map((f) => f.reads))).toBeGreaterThan(1);
    expect(pacer.inFrameReadMs).not.toBeNull();
    expect(Math.max(...frames.map((f) => f.ms))).toBeLessThanOrEqual(BUDGET + 1);
  });

  it('a very slow GPU queues the fewest steps a frame and is read once a frame', () => {
    const { frames, pacer } = play({ msPerStep: 8, renderMs: 6, detectMs: 6 }, 400);
    expect(Math.max(...frames.map((f) => f.reads))).toBe(1);
    expect(pacer.pace).toBe(2);
  });

  it('lockstep tests keep one boundary a frame at least', () => {
    const { frames } = play({ msPerStep: 30, renderMs: 300, detectMs: 1 }, 200, { minSteps: EVERY });
    expect(frames.every((f) => f.ran >= EVERY)).toBe(true);
    expect(frames.length).toBe(20);
  });

  it('a lost context stops the frame', () => {
    const pacer = new IncubationPacer({ budgetMs: BUDGET, every: EVERY, maxSteps: 400 });
    const dish: IncubatingDish = { stepCount: 0, contextLost: true, advance: () => undefined };
    const f = pacer.frame(dish, 100, { due: () => false, read: () => 0, now: () => 0 });
    expect(f.ran).toBe(0);
  });
});
