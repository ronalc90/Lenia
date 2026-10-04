import { describe, expect, it } from 'vitest';
import { Camera, mod, wrapDelta } from './camera';

describe('camera (grid ⇄ CSS pixels)', () => {
  it('at zoom 1 the dish is contained and centred; cell i spans [i, i+1)', () => {
    // 64×80 dish in a 640×1000 view: limited by the width → 10 px per cell, 100 px letterbox.
    const cam = new Camera(64, 80, 640, 1000);
    expect(cam.scale).toBe(10);
    expect(cam.gridToScreen(0, 0)).toEqual({ x: 0, y: 100 }); // top-left corner of cell 0
    expect(cam.gridToScreen(20.5, 30.5)).toEqual({ x: 205, y: 405 }); // centre of cell (20, 30)
    const g = cam.screenToGrid(209.9, 400.1);
    expect([Math.floor(g.x), Math.floor(g.y)]).toEqual([20, 30]);
    expect(cam.isOnDish(320, 99)).toBe(false);
    expect(cam.isOnDish(320, 101)).toBe(true);
  });

  it('round-trips and wraps on the torus', () => {
    const cam = new Camera(64, 80, 640, 800);
    cam.zoomAt(2, 320, 400);
    cam.panBy(-300, 0); // look across the right edge
    for (const [x, y] of [
      [1.25, 3.5],
      [63.75, 79.5],
      [32, 40],
    ]) {
      const p = cam.gridToScreen(x, y);
      const back = cam.screenToGrid(p.x, p.y);
      expect(back.x).toBeCloseTo(x, 9);
      expect(back.y).toBeCloseTo(y, 9);
    }
    // A point just past the edge is the same cell as one at the start.
    const a = cam.screenToGrid(cam.gridToScreen(63.9, 10).x + cam.scale * 0.2, cam.gridToScreen(63.9, 10).y);
    expect(a.x).toBeCloseTo(0.1, 9);
  });

  it('zoom stays in [1, 3] and zoom 1 recentres the dish', () => {
    const cam = new Camera(64, 80, 640, 800);
    cam.zoomAt(10, 100, 100);
    expect(cam.zoom).toBe(3);
    cam.panBy(50, 50);
    cam.zoomAt(0.01, 100, 100);
    expect(cam.zoom).toBe(1);
    expect([cam.cx, cam.cy]).toEqual([32, 40]);
  });

  it('wrap helpers', () => {
    expect(mod(-1, 64)).toBe(63);
    expect(wrapDelta(60, 64)).toBe(-4);
    expect(wrapDelta(-60, 64)).toBe(4);
    expect(Math.abs(wrapDelta(32, 64))).toBe(32);
  });
});
