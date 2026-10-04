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

  it('round dish: fits the circle, never wraps, keeps the view over the glass', () => {
    const cam = new Camera(232, 232, 400, 400);
    cam.setDish({ cx: 116, cy: 116, radius: 48 });
    // The 96-cell disc plus the glass margin spans the 400 px width.
    expect(cam.scale).toBeCloseTo(400 / (96 * (1 + Camera.DISH_FIT_MARGIN)), 9);
    expect(cam.gridToScreen(116, 116)).toEqual({ x: 200, y: 200 });
    // No wrapped copies: a point at the far grid edge stays far away.
    expect(cam.gridToScreen(231, 116).x).toBeGreaterThan(400);
    const g = cam.screenToGrid(-50, 200);
    expect(g.x).toBeLessThan(116 - 48); // not folded back into the grid
    expect(cam.isOnDish(200, 200)).toBe(true);
    expect(cam.isOnDish(200, 200 - 47 * cam.scale)).toBe(true);
    expect(cam.isOnDish(200, 200 - 50 * cam.scale)).toBe(false);
    // Zoom 1 recentres on the dish; zoomed in, panning stops at the rim.
    cam.panBy(1000, 0);
    expect([cam.cx, cam.cy]).toEqual([116, 116]);
    cam.zoomAt(2, 200, 200);
    cam.panBy(-100000, 0);
    expect(cam.cx - 116).toBeCloseTo(48 * (1 + Camera.DISH_FIT_MARGIN) * 0.5, 6);
    // A larger fit radius (the dish grew) zooms out.
    const s0 = cam.scale;
    cam.setDish({ cx: 116, cy: 116, radius: 64 }, 64);
    expect(cam.scale).toBeCloseTo((s0 * 48) / 64, 9);
    // Back to the torus.
    cam.setDish(null);
    cam.zoomAt(0.1, 0, 0);
    expect(cam.scale).toBeCloseTo(400 / 232, 9);
  });

  it('round dish on a tall phone panel: the dish hugs the top, the spare height goes under it', () => {
    const cam = new Camera(232, 232, 400, 800);
    cam.setDish({ cx: 116, cy: 116, radius: 48 });
    const r = 48 * (1 + Camera.DISH_FIT_MARGIN) * cam.scale; // 200 px
    const c = cam.gridToScreen(116, 116);
    expect(c.x).toBeCloseTo(200, 6);
    expect(c.y).toBeCloseTo(r + (800 - 2 * r) * Camera.DISH_TOP_SHARE, 6);
    expect(cam.screenToGrid(c.x, c.y).y).toBeCloseTo(116, 6);
    expect(cam.isOnDish(c.x, c.y)).toBe(true);
    // Panning at zoom 1 keeps the home view; a resize to a square panel centres the dish again.
    cam.panBy(0, 300);
    expect(cam.gridToScreen(116, 116).y).toBeCloseTo(c.y, 6);
    cam.setView(400, 400);
    expect(cam.gridToScreen(116, 116).y).toBeCloseTo(200, 6);
  });
});
