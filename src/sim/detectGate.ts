/**
 * The dish never steps blind (ADR-025, docs/DISH.md §4): swimmers stay off the absorbing glass only
 * if the deflector sees them every `every` steps. At a snapshot boundary whose snapshot has not been
 * taken (one still in flight), stepping waits: a slow readback makes the dish run slower instead of
 * letting a fresh Orbium cross half the Ø96 dish unsteered (~60 steps) and die on the glass — the
 * empty session-1 dish of v0.014.
 */
export function mustWaitForDetection(stepCount: number, detectedStep: number, every: number): boolean {
  return stepCount % every === 0 && detectedStep !== stepCount;
}

/** The part of the simulation stepDish needs (webgl.ts Simulation). */
export interface SteppableDish {
  readonly stepCount: number;
  readonly contextLost: boolean;
  advance(steps: number): void;
}

/**
 * Run up to `n` steps, never past a snapshot boundary whose snapshot is due (`detectionDue`), and call
 * `onBoundary` when a boundary is reached. Returns the steps the dish REALLY ran (its stepCount moved):
 * the session clock is dish time (QA4 F-02), so with a lost WebGL context — where advance() does
 * nothing — the clock stands still instead of spending the session on a frozen dish (RF-08).
 */
export function stepDish(dish: SteppableDish, n: number, every: number, detectionDue: () => boolean, onBoundary: () => void): number {
  if (dish.contextLost) return 0;
  const start = dish.stepCount;
  let left = n;
  while (left > 0 && !detectionDue()) {
    const before = dish.stepCount;
    dish.advance(Math.min(left, every - (before % every)));
    const ran = dish.stepCount - before;
    if (ran <= 0) break; // context lost mid-frame
    left -= ran;
    if (dish.stepCount % every === 0) onBoundary();
  }
  return dish.stepCount - start;
}
