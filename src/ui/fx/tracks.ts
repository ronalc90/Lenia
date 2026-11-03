/**
 * Where each creature's matter is, frame by frame (docs/ARTE-PULIDO.md §3.7: the spotlight ring
 * lagged off its creature during camera moves).
 *
 * src/main.ts writes one track per detected body after every snapshot: its centroid moved on to the
 * dish step of that moment and its heading after the glass deflector's turn (the same bodies the
 * species tints follow). The overlay asks for a creature at the dish step being drawn and gets the
 * matter's position — no wall clock, no glide: a paused dish keeps it still, a slow phone moves it
 * exactly as far as its dish ran, and rings, labels and the Momento focus sit on the tinted matter.
 */

interface Track {
  x: number;
  y: number;
  vx: number;
  vy: number;
  step: number;
}

export class MatterTracks {
  /**
   * Steps a track may be pushed ahead before it is not trusted (snapshots come every 10 steps; with
   * the async readback a body is 10–30 steps old; the detector gate never lets the dish run blind).
   */
  static readonly MAX_AHEAD = 60;

  private readonly map = new Map<number, Track>();
  private readonly spare: Track[] = [];
  private readonly scratch = { x: 0, y: 0 };

  /** A body of the latest snapshot: position (cells) at dish step `step`, velocity in cells per step. */
  set(id: number, x: number, y: number, vx: number, vy: number, step: number): void {
    let t = this.map.get(id);
    if (!t) {
      t = this.spare.pop() ?? { x: 0, y: 0, vx: 0, vy: 0, step: 0 };
      this.map.set(id, t);
    }
    t.x = x;
    t.y = y;
    t.vx = Number.isFinite(vx) ? vx : 0;
    t.vy = Number.isFinite(vy) ? vy : 0;
    t.step = step;
  }

  /**
   * The creature's matter at dish step `step`, or null when unknown or stale. The returned object is
   * reused by the next call: copy what you keep.
   */
  at(id: number, step: number): { x: number; y: number } | null {
    const t = this.map.get(id);
    if (!t) return null;
    const ahead = step - t.step;
    if (ahead > MatterTracks.MAX_AHEAD) return null;
    const k = ahead > 0 ? ahead : 0;
    const o = this.scratch;
    o.x = t.x + t.vx * k;
    o.y = t.y + t.vy * k;
    return o;
  }

  has(id: number): boolean {
    return this.map.has(id);
  }

  /** Forget every creature not in `ids` (called with the latest snapshot's bodies). */
  retain(ids: ReadonlySet<number>): void {
    for (const [id, t] of this.map) {
      if (ids.has(id)) continue;
      this.map.delete(id);
      this.spare.push(t);
    }
  }

  clear(): void {
    for (const t of this.map.values()) this.spare.push(t);
    this.map.clear();
  }
}
