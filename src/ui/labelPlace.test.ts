import { describe, expect, it } from 'vitest';
import { placeLabel, stackLabel, type LabelObstacles, type LabelPlacement, type LabelRequest } from './labelPlace';

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

// QA-3 §2, N3 (v0.026, shots 051, 075, 103): from session 2 on, the objective pill «Mira tu criatura en el Bestiario.»
// sat exactly over the streak chip: only a green edge and «○○» showed, so the child never saw the streak.
describe('the HUD chips under the Luz counter step under the messages over the dish (QA-3 N3)', () => {
  // 390-px phone: the chip's home is under the counter, the objective pill floats over the top of the dish.
  const chip = { x: 168, y: 86, w: 200, h: 28, bounds: { l: 0, t: 62, r: 390, b: 700 } };
  const pill = [75, 77, 315, 124];
  const out: LabelPlacement = { x: 0, y: 0, slot: -1, clear: false };

  it('QA-3: with the objective pill over its home, the streak chip goes just under the pill, never under it', () => {
    const o: LabelObstacles = { boxes: pill, nBoxes: 1, discs: [], nDiscs: 0 };
    expect(stackLabel(chip, o, out)).toBe(true);
    const top = out.y - chip.h / 2;
    expect(top).toBeGreaterThanOrEqual(pill[3]);
    expect(top).toBeLessThan(pill[3] + 12);
    expect(out.x).toBe(chip.x);
  });

  it('nothing over its home: it stays home', () => {
    expect(stackLabel(chip, { boxes: [], nBoxes: 0, discs: [], nDiscs: 0 }, out)).toBe(true);
    expect(out.y).toBe(chip.y);
  });

  it('past the pill and a toast under it: it clears both', () => {
    const toast = [70, 130, 320, 166];
    const o: LabelObstacles = { boxes: [...pill, ...toast], nBoxes: 2, discs: [], nDiscs: 0 };
    expect(stackLabel(chip, o, out)).toBe(true);
    expect(out.y - chip.h / 2).toBeGreaterThanOrEqual(toast[3]);
  });

  it('a message beside its home (not over it) does not move it', () => {
    const o: LabelObstacles = { boxes: [300, 70, 380, 110], nBoxes: 1, discs: [], nDiscs: 0 };
    expect(stackLabel(chip, o, out)).toBe(true);
    expect(out.y).toBe(chip.y);
  });

  it('no room below the bounds: false (the caller keeps it home)', () => {
    const o: LabelObstacles = { boxes: [0, 60, 390, 700], nBoxes: 1, discs: [], nDiscs: 0 };
    expect(stackLabel(chip, o, out)).toBe(false);
  });
});
