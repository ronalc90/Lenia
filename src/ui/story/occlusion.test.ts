import { describe, expect, it } from 'vitest';
import { samplePoints, visibleShare, VISIBLE_SHARE } from './occlusion';

/** A fake page: named boxes stacked bottom to top; the top-most box under a point wins. */
function page(boxes: { id: string; x: number; y: number; w: number; h: number }[]) {
  return (x: number, y: number): string | null => {
    for (let i = boxes.length - 1; i >= 0; i--) {
      const b = boxes[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    }
    return null;
  };
}

describe('spotlight occlusion (owner bug B-10.1)', () => {
  const dockBtn = { id: 'dock.bestiary', x: 10, y: 780, w: 80, h: 56 };

  it('samples the centre and four points inset far enough to sit inside rounded corners', () => {
    expect(samplePoints({ x: 0, y: 0, w: 100, h: 50 })).toEqual([
      [50, 25],
      [15, 15],
      [85, 15],
      [15, 35],
      [85, 35],
    ]);
  });

  it('a rounded button with nothing over it is visible (its corners are not "covered" by its parent)', () => {
    // A pill (radius = half its height) and a 16 px-radius card: hits outside the rounded shape fall
    // through to the parent, as the browser's hit test does.
    const rounded = (b: { x: number; y: number; w: number; h: number; r: number }, parent: string) => (x: number, y: number): string | null => {
      if (x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) return parent;
      const cx = Math.min(Math.max(x, b.x + b.r), b.x + b.w - b.r);
      const cy = Math.min(Math.max(y, b.y + b.r), b.y + b.h - b.r);
      return Math.hypot(x - cx, y - cy) <= b.r ? 'btn' : parent;
    };
    const pill = { x: 20, y: 700, w: 140, h: 48, r: 24 };
    const card = { x: 10, y: 780, w: 80, h: 56, r: 16 };
    expect(visibleShare(pill, rounded(pill, 'dock'), (id) => id === 'btn')).toBe(1);
    expect(visibleShare(card, rounded(card, 'dock'), (id) => id === 'btn')).toBe(1);
  });

  it('a dock button under the open Bestiary drawer is not visible', () => {
    const drawer = { id: 'drawer', x: 0, y: 300, w: 390, h: 544 };
    const share = visibleShare(dockBtn, page([dockBtn, drawer]), (id) => id === 'dock.bestiary');
    expect(share).toBe(0);
    expect(share).toBeLessThan(VISIBLE_SHARE);
  });

  it('the same button with nothing over it is visible', () => {
    expect(visibleShare(dockBtn, page([dockBtn]), (id) => id === 'dock.bestiary')).toBe(1);
  });

  it('a button half under a sheet is not a target to point at', () => {
    const sheet = { id: 'sheet', x: 0, y: 808, w: 390, h: 100 };
    const share = visibleShare(dockBtn, page([dockBtn, sheet]), (id) => id === 'dock.bestiary');
    expect(share).toBeLessThan(VISIBLE_SHARE);
  });
});
