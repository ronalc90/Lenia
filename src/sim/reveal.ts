/**
 * Calm start of a run (docs/ARTE-PULIDO.md A-6, §3.17 owner bug "la criatura inicial corre a toda
 * velocidad al empezar"). Every run's starter / Nevera creatures are pre-incubated (ADR-027,
 * PREINCUBATE_STEPS real steps, the detector reading every 10th) so they are alive when the clock
 * starts. That incubation used to run with the culture on screen — up to 40 extra steps a frame, also
 * under a Momento's "PAUSA" card — so the starter shot across the dish before the player's eyes.
 *
 * Now the culture is not lit while it incubates (the renderer's matter fade is 0: agar and glass are
 * drawn, the matter is not), the incubation never advances while a Momento pauses the dish, and when
 * it is done the candle lights the culture (fade 0 → 1 in REVEAL.fadeMs, the dish holding still), then
 * the dish's pace climbs from rest to its normal time-lapse over the ramp. The ramp only advances
 * while the dish steps, so a start card that pauses the dish never hands the player a dish already at
 * full speed.
 *
 * Pure state machine (no GL, no DOM): src/main.ts drives it once a frame. The simulation, the detector
 * and the economy are untouched: nothing is paid before the clock, and the clock counts dish time.
 */

/** Smoothstep 0..1: the pace ramp (ease in and out, monotonic). */
const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** `enter` (Material emphasized decelerate, 0.05, 0.7, 0.1, 1) approximated by an exponential-out curve. */
const enterOut = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : (1 - Math.exp(-6 * t)) / (1 - Math.exp(-6)));

export const REVEAL = {
  /** The candle lights the culture: matter fade 0 → 1 in 700 ms, `enter` (ARTE-PULIDO A-6). */
  fadeMs: 700,
  /**
   * Steps a frame the hidden incubation may run at most; src/main.ts also stops at a wall-time budget
   * per frame (INCUBATE_FRAME_MS), so a slow phone keeps its frame rate and a fast one is done in a
   * few frames (the detector still reads every 10th step).
   */
  hiddenBudget: 400,
  /** Pace ramp (s) when no other is given; src/main.ts passes cycleBalance.SESSION_PACE_RAMP_S. */
  rampS: 1,
} as const;

export interface RevealContext {
  /** The run still waits for its first seed (session phase 'ready'): incubation may continue. */
  ready: boolean;
  /** A Momento has paused the dish: the incubation waits (it would run under a "PAUSA" card). */
  momentPaused: boolean;
  /** The tab is hidden (no steps at all). */
  hidden: boolean;
  /** The dish is stepping this frame (no pause source): the pace ramp advances only then. */
  stepping: boolean;
}

export interface RevealFrame {
  /** Extra incubation steps allowed this frame (only while the culture is hidden). */
  incubateBudget: number;
  /** 0..1 multiplier of the dish's regular pace (0 → 1 over the ramp after the culture is lit). */
  pace: number;
  /** 0..1 share of the matter drawn (WebGLSimulation.setMatterFade). */
  fade: number;
  /** True on the one frame the culture starts to light (a birth pulse on each starter creature). */
  lit: boolean;
}

export class CultureReveal {
  private steps = 0;
  /** Progress of the fade-in, 0..1 (1 = fully lit). */
  private fadeT = 1;
  /** Progress of the pace ramp, 0..1. */
  private rampT = 1;
  private hiddenNow = false;
  private readonly out: RevealFrame = { incubateBudget: 0, pace: 1, fade: 1, lit: false };
  private readonly fadeS: number;
  private readonly rampS: number;
  private readonly budget: number;

  constructor(opts: { fadeMs?: number; rampS?: number; hiddenBudget?: number } = {}) {
    this.fadeS = Math.max(1e-3, (opts.fadeMs ?? REVEAL.fadeMs) / 1000);
    this.rampS = Math.max(0, opts.rampS ?? REVEAL.rampS);
    this.budget = Math.max(1, Math.floor(opts.hiddenBudget ?? REVEAL.hiddenBudget));
  }

  /** Incubation steps still to run. */
  get left(): number {
    return this.steps;
  }

  get incubating(): boolean {
    return this.steps > 0;
  }

  /** The culture is not incubating and fully lit (a Momento about it may open). */
  get lit(): boolean {
    return this.steps === 0 && this.fadeT >= 1;
  }

  /** The culture is fully lit and the dish at its normal pace. */
  get settled(): boolean {
    return this.steps === 0 && this.fadeT >= 1 && this.rampT >= 1;
  }

  /** Start (or restart) a hidden incubation of `steps` real simulation steps. */
  incubate(steps: number): void {
    this.steps = Math.max(0, Math.floor(steps));
    if (this.steps > 0) {
      this.hiddenNow = true;
      this.fadeT = 0;
      this.rampT = 0;
    }
  }

  /** Steps the dish really ran for the incubation. */
  ran(steps: number): void {
    if (steps > 0) this.steps = Math.max(0, this.steps - Math.floor(steps));
  }

  /** Stop incubating now (lost GL context): the culture is lit at once. */
  cancel(): void {
    this.steps = 0;
  }

  frame(dt: number, c: RevealContext): RevealFrame {
    const o = this.out;
    o.lit = false;
    o.incubateBudget = 0;
    // The clock started (first seed) or the run is over: what incubated so far is the culture.
    if (this.steps > 0 && !c.ready) this.steps = 0;
    if (this.steps > 0) {
      o.incubateBudget = c.momentPaused || c.hidden ? 0 : Math.min(this.steps, this.budget);
      o.fade = 0;
      // Hidden: the regular steps are incubation too (nothing is seen, nothing is paid).
      o.pace = 1;
      return o;
    }
    if (this.hiddenNow) {
      this.hiddenNow = false;
      o.lit = true;
    }
    const d = Math.max(0, Math.min(0.25, dt));
    this.fadeT = Math.min(1, this.fadeT + d / this.fadeS);
    // The dish holds still while the candle lights the culture, then climbs to its pace (A-6: the
    // starter swims ~0.6 cells a step; a ramp from the first lit frame moved it a whole R in that
    // first visible second).
    if (c.stepping && this.fadeT >= 1) this.rampT = this.rampS > 0 ? Math.min(1, this.rampT + d / this.rampS) : 1;
    o.fade = enterOut(this.fadeT);
    o.pace = smooth(this.rampT);
    return o;
  }
}
