import { describe, expect, it } from 'vitest';
import { MatterTracks } from './tracks';

/**
 * Owner bug (docs/ARTE-PULIDO.md §3.7, audit/spark-strip.png): the spotlight ring lagged off its
 * creature while the camera moved. The overlay anchored rings, labels and the Momento focus on a
 * position glided towards the last 10 Hz report and pushed ahead by wall-clock time, so it trailed
 * the matter (and drifted on while the dish eased to a stop). The anchor is now the matter itself:
 * the deflector-corrected body of the last snapshot moved on by the steps the dish really ran.
 */
describe('matter tracks (overlay anchors)', () => {
  it('a swimming creature is anchored where its matter is at the dish step being drawn', () => {
    const t = new MatterTracks();
    t.set(7, 100, 50, 0.2, -0.1, 1000);
    const p = t.at(7, 1030)!;
    expect(p.x).toBeCloseTo(106, 6);
    expect(p.y).toBeCloseTo(47, 6);
  });

  it('a paused dish keeps the anchor still however long the pause lasts', () => {
    const t = new MatterTracks();
    t.set(1, 80, 80, 0.3, 0, 500);
    const a = t.at(1, 520)!;
    const b = t.at(1, 520)!; // same step later in wall time: nothing moves
    expect(b.x).toBe(a.x);
    expect(b.y).toBe(a.y);
  });

  it('a stale track is not trusted (the creature is anchored by the caller’s fallback)', () => {
    const t = new MatterTracks();
    t.set(3, 10, 10, 0.25, 0, 0);
    expect(t.at(3, 10)).not.toBeNull();
    expect(t.at(3, 10 + MatterTracks.MAX_AHEAD + 1)).toBeNull();
    expect(t.at(99, 10)).toBeNull();
  });

  it('a new snapshot replaces the old body (a turned swimmer heads its new way)', () => {
    const t = new MatterTracks();
    t.set(5, 50, 50, 0.2, 0, 100);
    t.set(5, 52, 50, 0, 0.2, 110);
    const p = t.at(5, 120)!;
    expect(p.x).toBeCloseTo(52, 6);
    expect(p.y).toBeCloseTo(52, 6);
  });

  it('forgets creatures that are gone, and never allocates per query', () => {
    const t = new MatterTracks();
    t.set(1, 0, 0, 0, 0, 0);
    t.set(2, 0, 0, 0, 0, 0);
    t.retain(new Set([2]));
    expect(t.at(1, 0)).toBeNull();
    const a = t.at(2, 0);
    const b = t.at(2, 0);
    expect(a).toBe(b); // one scratch object, reused
  });
});
