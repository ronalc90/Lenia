import type { Body, Turn } from './deflect';

/** What the deflector needs from one detector creature. */
export interface ReportBody {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  steerable: boolean;
}

interface Seen {
  x: number;
  y: number;
  step: number;
}

/**
 * Bodies for the glass deflector, moved on to where the matter is NOW (QA4 F-07).
 *
 * The dish reads its snapshot asynchronously (main.ts): when the report of step S arrives the dish
 * has already run `lag` more steps, so each body is extrapolated. A turn's pivot must sit on the
 * creature's real centroid: a turn around a point a few cells off moves part of the body out of the
 * rotated disc and tears it (measured: a pure Orbium starter died in open water at step ~130).
 *
 * The detector's velocity is a smoothed estimate that does not know about the deflector's own turn
 * applied right before this snapshot, so it pointed the old way. The velocity used here is the
 * centroid's motion since the previous report, turned by the deflector turns applied after that
 * report's snapshot (a rigid turn about the centroid turns the heading by the same angle). A body
 * seen for the first time keeps the detector's velocity.
 */
export class BodyExtrapolator {
  private seen = new Map<number, Seen>();
  private turns: { id: number; step: number; angle: number }[] = [];
  private nowStep = 0;

  /** Clear between dishes. */
  reset(): void {
    this.seen.clear();
    this.turns.length = 0;
  }

  /** Bodies at `nowStep` from a report taken at `reportStep`. */
  bodies(creatures: readonly ReportBody[], reportStep: number, nowStep: number): Body[] {
    this.nowStep = nowStep;
    const lag = Math.max(0, nowStep - reportStep);
    const out: Body[] = [];
    const next = new Map<number, Seen>();
    for (const c of creatures) {
      let vx = c.vx;
      let vy = c.vy;
      const p = this.seen.get(c.id);
      if (p && reportStep > p.step) {
        const d = reportStep - p.step;
        // Turns applied after the previous snapshot and up to this one: the motion measured between
        // the two snapshots was before them, the motion from here on is after them.
        let a = 0;
        for (const t of this.turns) if (t.id === c.id && t.step > p.step && t.step <= reportStep) a += t.angle;
        const fx = (c.x - p.x) / d;
        const fy = (c.y - p.y) / d;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        vx = fx * ca - fy * sa;
        vy = fx * sa + fy * ca;
      }
      next.set(c.id, { x: c.x, y: c.y, step: reportStep });
      out.push({ id: c.id, x: c.x + vx * lag, y: c.y + vy * lag, vx, vy, radius: c.radius, steerable: c.steerable });
    }
    this.seen = next;
    // Keep only the turns a later report can still need.
    this.turns = this.turns.filter((t) => t.step > reportStep - 1);
    return out;
  }

  /** The turns the deflector returned for the last `bodies` call, applied to the dish now. */
  noteTurns(turns: readonly Turn[]): void {
    for (const t of turns) this.turns.push({ id: t.id, step: this.nowStep, angle: t.angle });
  }
}
