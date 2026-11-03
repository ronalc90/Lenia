/**
 * Pacing of the unlit incubation (ADR-027 amendment v0.019, docs/ARTE-PULIDO.md A-6).
 *
 * While a run's starter incubates hidden, the detector reads every 10th step synchronously (the
 * deflector steers from it: the dish never steps blind). A synchronous readback waits for every GPU
 * command queued before it, so the old loop, which checked its 8 ms budget only before each read,
 * started every frame with a read that waited for the steps the previous frame had queued, and a
 * second read in the same frame waited for the 10 steps just queued: 25–40 ms frames for the ~2 s of
 * every run start on a mid-range phone, which also tripped the effects watchdog (QA review of v0.019).
 *
 * Here a frame:
 *  1. reads first, when a read is due (the GPU had a whole frame for what the last one queued);
 *  2. then queues steps up to its allowance, stopping at the next 10-step boundary;
 *  3. reads again in the same frame only when the measured cost of such a read (it waits for the
 *     steps just queued) fits what is left of the budget: a fast GPU still incubates in a few frames,
 *     a phone's GPU is never waited on twice a frame;
 *  4. adapts the allowance to the wait of its first read (AIMD): a GPU that did not finish last
 *     frame's steps within the frame gets fewer, one that idled gets more.
 *
 * Pure (no GL, no DOM): src/main.ts passes the dish and the read; tests drive a model GPU.
 */

/** The part of the simulation the incubation drives (webgl.ts WebGLSimulation). */
export interface IncubatingDish {
  readonly stepCount: number;
  readonly contextLost: boolean;
  advance(steps: number): void;
}

export interface IncubationIO {
  /** The snapshot of the dish's current step is due (a boundary the detector has not read). */
  due(): boolean;
  /**
   * Read the dish now, synchronously, and run the detector on it. Returns the milliseconds the
   * readback itself waited (the GPU's backlog; the detector's own time is not part of it).
   */
  read(): number;
  /** Monotonic clock, ms. */
  now(): number;
}

export const INCUBATE = {
  /** Readback wait above which the GPU did not keep up with last frame's steps: halve the allowance. */
  waitHighMs: 2,
  /** Readback wait below which the GPU idled: one more step a frame. */
  waitLowMs: 0.5,
  /** Fewest steps a frame queues (a GPU this slow incubates slowly instead of stalling the page). */
  minSteps: 2,
  /** Steps a frame starts with: one boundary, the old loop's first frame. */
  startSteps: 10,
  /**
   * After a slow read the allowance climbs back only to one step below where the GPU fell behind;
   * that ceiling rises by one after this many reads in a row that found the GPU idle (a GPU near its
   * limit is probed now and then, not every few frames).
   */
  probeAfter: 16,
  /** Weight of the newest in-frame read in its running estimate. */
  readEstWeight: 0.5,
  /** A frame whose first read did not wait lets the in-frame estimate decay by this (it is retried). */
  readEstDecay: 0.9,
} as const;

export interface IncubationOptions {
  /** Wall time one frame may spend on the incubation (src/main.ts INCUBATE_FRAME_MS). */
  budgetMs: number;
  /** Detector cadence in steps (src/main.ts DETECT_EVERY). */
  every: number;
  /** Fewest steps a frame queues (default INCUBATE.minSteps; tests in lockstep pass `every`). */
  minSteps?: number;
  /** Most steps a frame may queue (src/sim/reveal.ts REVEAL.hiddenBudget). */
  maxSteps: number;
}

export interface IncubationFrame {
  /** Steps the dish really ran this frame. */
  ran: number;
  /** Synchronous reads taken this frame. */
  reads: number;
  /** Wall time the frame spent on the incubation, ms. */
  ms: number;
}

export class IncubationPacer {
  /** Steps the next frame may queue. */
  allowance: number;
  /** Running cost (wait + detector) of a read taken after steps queued in the same frame; null = never measured. */
  private readEst: number | null = null;
  /** Highest allowance since the GPU last fell behind (see INCUBATE.probeAfter). */
  private ceiling = Infinity;
  private idleReads = 0;
  private readonly budget: number;
  private readonly every: number;
  private readonly min: number;
  private readonly max: number;
  private readonly out: IncubationFrame = { ran: 0, reads: 0, ms: 0 };

  constructor(o: IncubationOptions) {
    this.budget = Math.max(0, o.budgetMs);
    this.every = Math.max(1, Math.floor(o.every));
    this.max = Math.max(1, Math.floor(o.maxSteps));
    this.min = Math.max(1, Math.min(this.max, Math.floor(o.minSteps ?? INCUBATE.minSteps)));
    this.allowance = Math.max(this.min, Math.min(this.max, INCUBATE.startSteps));
  }

  /** Measured cost of an in-frame read (ms), or null before the first one. */
  get inFrameReadMs(): number | null {
    return this.readEst;
  }

  /**
   * One frame of the hidden incubation: at most `left` steps (what the incubation still needs).
   * The returned object is reused from frame to frame.
   */
  frame(dish: IncubatingDish, left: number, io: IncubationIO): IncubationFrame {
    const out = this.out;
    out.ran = 0;
    out.reads = 0;
    const t0 = io.now();
    /** Steps this frame may still reach (lowered to the floor once a read ate the budget). */
    let allow = Math.min(Math.floor(left), this.allowance);
    /** Wait of the read the frame started with (-1: it started mid-boundary, nothing to learn). */
    let firstWait = -1;
    let queued = false;
    while (out.ran < allow && !dish.contextLost) {
      if (io.due()) {
        if (queued && !this.readFits(io.now() - t0, firstWait)) break;
        const a = io.now();
        const wait = io.read();
        const cost = io.now() - a;
        if (!queued) firstWait = wait;
        else this.readEst = this.readEst === null ? cost : this.readEst + INCUBATE.readEstWeight * (cost - this.readEst);
        out.reads++;
        // Re-checked after the read: a read that ate the budget queues only the floor this frame.
        if (io.now() - t0 >= this.budget) allow = Math.min(allow, Math.max(out.ran, this.min));
        if (out.ran >= allow) break;
      }
      const before = dish.stepCount;
      const toBoundary = this.every - (before % this.every);
      dish.advance(Math.min(allow - out.ran, toBoundary));
      const did = dish.stepCount - before;
      if (did <= 0) break; // context lost mid-frame
      out.ran += did;
      queued = true;
    }
    out.ms = io.now() - t0;
    this.adapt(firstWait);
    return out;
  }

  /**
   * A read after steps queued this frame waits for them. Only when its measured cost fits what is
   * left of the budget; never measured: tried once, and only when the frame's first read found an
   * idle GPU with most of the budget left.
   */
  private readFits(elapsed: number, firstWait: number): boolean {
    if (this.readEst === null) return firstWait >= 0 && firstWait < INCUBATE.waitLowMs && elapsed < this.budget / 4;
    return elapsed + this.readEst <= this.budget;
  }

  private adapt(firstWait: number): void {
    if (firstWait > INCUBATE.waitHighMs) {
      // The GPU had not finished what the last frames queued: back off, and remember where.
      this.ceiling = Math.max(this.min, this.allowance - 1);
      this.allowance = Math.floor(this.allowance / 2);
      this.idleReads = 0;
    } else if (firstWait >= 0 && firstWait < INCUBATE.waitLowMs) {
      if (this.readEst !== null) this.readEst *= INCUBATE.readEstDecay;
      if (++this.idleReads >= INCUBATE.probeAfter) {
        this.idleReads = 0;
        this.ceiling++;
      }
      const up = this.allowance >= this.every ? this.every : 1;
      this.allowance = Math.min(this.ceiling, this.allowance + up);
    }
    // Past one boundary a frame only while a second read in the frame is cheap (a fast GPU); two
    // boundaries while that is still unmeasured, so the first idle frame can try one.
    const cap = this.readEst === null ? 2 * this.every : this.readEst < this.budget / 2 ? this.max : this.every;
    this.allowance = Math.max(this.min, Math.min(this.max, cap, this.allowance));
  }

}
