import { describe, expect, it } from 'vitest';
import { placeLabel, type LabelObstacles, type LabelPlacement, type LabelRequest } from './labelPlace';

const BOUNDS = { l: 6, t: 6, r: 384, b: 600 };

function req(x: number, y: number, over: Partial<LabelRequest> = {}): LabelRequest {
  return { x, y, w: 180, h: 32, gap: 20, bounds: BOUNDS, slot: -1, ...over };
}
function obstacles(boxes: number[] = [], discs: number[] = []): LabelObstacles {
  return { boxes, nBoxes: boxes.length / 4, discs, nDiscs: discs.length / 3 };
}
const out = (): LabelPlacement => ({ x: 0, y: 0, slot: -1, clear: false });
const boxOf = (p: LabelPlacement, r: LabelRequest): [number, number, number, number] => [p.x - r.w / 2, p.y - r.h / 2, p.x + r.w / 2, p.y + r.h / 2];
const overlaps = (a: number[], b: number[]): boolean => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
/** How deep a disc reaches into a box (0 = it does not touch it). */
function coverage(b: number[], x: number, y: number, r: number): number {
  const dx = Math.max(b[0] - x, 0, x - b[2]);
  const dy = Math.max(b[1] - y, 0, y - b[3]);
  return Math.max(0, r - Math.hypot(dx, dy));
}

describe('label placement (one solver for every message over the dish)', () => {
  it('two messages anchored at nearly the same point never overlap', () => {
    // The grey «Se apagó…» and the green «¡Nadadora!» brief, born 3 px apart (integrator review v0.023, shot 06).
    const ra = req(200, 300);
    const a = out();
    expect(placeLabel(ra, obstacles(), a)).toBe(true);
    const first = boxOf(a, ra);
    const rb = req(203, 302, { w: 260, h: 48 });
    const b = out();
    expect(placeLabel(rb, obstacles(first), b)).toBe(true);
    expect(overlaps(first, boxOf(b, rb))).toBe(false);
    // …and the second still reads as being about the same spot.
    expect(Math.hypot(b.x - 203, b.y - 302)).toBeLessThan(160);
  });

  it('a message steps off a living creature when the dish has room', () => {
    const body = [200, 300, 44];
    const r = req(200, 300);
    const p = out();
    expect(placeLabel(r, obstacles([], body), p)).toBe(true);
    expect(p.clear).toBe(true);
    expect(coverage(boxOf(p, r), 200, 300, 44)).toBe(0);
  });

  it('steps off a neighbour too, not only the creature it talks about', () => {
    // A seed went dark right under a creature that is being born (shot 06).
    const r = req(200, 300);
    const p = out();
    placeLabel(r, obstacles([], [200, 240, 40]), p);
    expect(coverage(boxOf(p, r), 200, 240, 40)).toBe(0);
  });

  it('covers a body only when no slot is free of bodies, and then as little as it can', () => {
    const tight = { l: 100, t: 200, r: 300, b: 400 };
    const discs = [200, 300, 120];
    const r = req(200, 300, { bounds: tight, w: 160 });
    const p = out();
    expect(placeLabel(r, obstacles([], discs), p)).toBe(true);
    expect(p.clear).toBe(false);
    const box = boxOf(p, r);
    expect(box[0]).toBeGreaterThanOrEqual(tight.l);
    expect(box[2]).toBeLessThanOrEqual(tight.r);
    expect(box[1]).toBeGreaterThanOrEqual(tight.t);
    expect(box[3]).toBeLessThanOrEqual(tight.b);
  });

  it('gives up rather than overlap another message', () => {
    const r = req(200, 300, { bounds: { l: 150, t: 250, r: 250, b: 350 }, w: 90 });
    const p = out();
    expect(placeLabel(r, obstacles([0, 0, 400, 600]), p)).toBe(false);
  });

  it('keeps its slot while that slot stays clear (no jumping between frames)', () => {
    const r = req(200, 300);
    const p = out();
    placeLabel(r, obstacles([], [200, 250, 30]), p);
    const slot = p.slot;
    expect(slot).not.toBe(0);
    // The neighbour moved away: the label stays where it is instead of jumping back above.
    const again = out();
    placeLabel({ ...r, slot }, obstacles(), again);
    expect(again.slot).toBe(slot);
  });

  it('stays inside its bounds, flipping below when there is no room above', () => {
    const r = req(30, 20);
    const p = out();
    placeLabel(r, obstacles(), p);
    const box = boxOf(p, r);
    expect(box[0]).toBeGreaterThanOrEqual(BOUNDS.l);
    expect(box[1]).toBeGreaterThanOrEqual(BOUNDS.t);
    expect(p.y).toBeGreaterThan(20);
  });
});
