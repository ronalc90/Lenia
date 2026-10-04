import type { DishShape } from './dish';
import type { CameraState } from './types';

/**
 * Maps between grid cells and canvas CSS pixels. Shared by the WebGL renderer
 * and the 2D overlay so both draw in exactly the same place.
 *
 * Two topologies:
 *  - toroidal (default, legacy): at zoom 1 the whole grid is fitted ("contain") and centred;
 *    camera centres wrap and every grid point is drawn at its copy nearest the centre.
 *  - round dish (ADR-025, after `setDish`): at zoom 1 the disc of radius `fitRadius` (plus a
 *    margin for the glass) is fitted and centred on the dish; nothing wraps, and panning keeps
 *    the view over the dish.
 */
export class Camera implements CameraState {
  zoom = 1;
  cx: number;
  cy: number;
  /** Round dish (null = toroidal grid). */
  private dishShape: DishShape | null = null;
  /** Radius (cells) fitted at zoom 1 in dish mode; lags the rim while the dish grows. */
  fitRadius = 0;

  /** Room around the dish at zoom 1 for the glass wall and its shadow, as a share of the radius. */
  static readonly DISH_FIT_MARGIN = 0.07;

  constructor(
    public gridW: number,
    public gridH: number,
    /** Canvas size in CSS pixels. */
    public viewW = 1,
    public viewH = 1,
  ) {
    this.cx = gridW / 2;
    this.cy = gridH / 2;
  }

  setView(w: number, h: number): void {
    this.viewW = Math.max(1, w);
    this.viewH = Math.max(1, h);
  }

  /** The round dish, or null on the torus. */
  get dish(): DishShape | null {
    return this.dishShape;
  }

  /**
   * Switch to the round dish (or back to the torus with null). `fitRadius` is the radius fitted at
   * zoom 1 (defaults to the rim; pass DishAnimator.fit while the dish grows).
   */
  setDish(d: DishShape | null, fitRadius?: number): void {
    this.dishShape = d ? { ...d } : null;
    this.fitRadius = d ? Math.max(1, fitRadius ?? d.radius) : 0;
    this.clampCenter();
  }

  /** CSS pixels per grid cell. */
  get scale(): number {
    if (this.dishShape) {
      const span = 2 * this.fitRadius * (1 + Camera.DISH_FIT_MARGIN);
      return (Math.min(this.viewW, this.viewH) / span) * this.zoom;
    }
    return Math.min(this.viewW / this.gridW, this.viewH / this.gridH) * this.zoom;
  }

  gridToScreen(x: number, y: number): { x: number; y: number } {
    const s = this.scale;
    let dx = x - this.cx;
    let dy = y - this.cy;
    if (!this.dishShape) {
      // Pick the wrapped copy of (x, y) closest to the camera center.
      dx = wrapDelta(dx, this.gridW);
      dy = wrapDelta(dy, this.gridH);
    }
    return { x: this.viewW / 2 + dx * s, y: this.viewH / 2 + dy * s };
  }

  screenToGrid(px: number, py: number): { x: number; y: number } {
    const p = this.screenToGridRaw(px, py);
    if (this.dishShape) return p;
    return { x: mod(p.x, this.gridW), y: mod(p.y, this.gridH) };
  }

  /** True if a CSS-pixel point lies over the dish area (inside the glass, or the grid on the torus). */
  isOnDish(px: number, py: number): boolean {
    const s = this.scale;
    const d = this.dishShape;
    if (d) {
      const g = this.screenToGridRaw(px, py);
      return Math.hypot(g.x - d.cx, g.y - d.cy) <= d.radius + 0.5 / s;
    }
    const halfW = (this.gridW * s) / 2;
    const halfH = (this.gridH * s) / 2;
    return (
      Math.abs(px - this.viewW / 2) <= halfW + 0.5 && Math.abs(py - this.viewH / 2) <= halfH + 0.5
    );
  }

  /** Zoom around a CSS-pixel anchor point, clamped to [1, 3]. */
  zoomAt(factor: number, px: number, py: number): void {
    const before = this.screenToGridRaw(px, py);
    this.zoom = Math.min(3, Math.max(1, this.zoom * factor));
    const after = this.screenToGridRaw(px, py);
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
    this.clampCenter();
  }

  panBy(dpx: number, dpy: number): void {
    const s = this.scale;
    this.cx -= dpx / s;
    this.cy -= dpy / s;
    this.clampCenter();
  }

  /** Re-apply the pan limits (after the dish or the zoom changed from outside). */
  clamp(): void {
    this.clampCenter();
  }

  private screenToGridRaw(px: number, py: number): { x: number; y: number } {
    const s = this.scale;
    return { x: this.cx + (px - this.viewW / 2) / s, y: this.cy + (py - this.viewH / 2) / s };
  }

  private clampCenter(): void {
    const d = this.dishShape;
    if (d) {
      // Keep the view over the dish: the centre may wander as far as the zoom lets the rim stay
      // in view (none at zoom 1).
      const lim = Math.max(0, this.fitRadius * (1 + Camera.DISH_FIT_MARGIN) * (1 - 1 / this.zoom));
      const dx = this.cx - d.cx;
      const dy = this.cy - d.cy;
      const r = Math.hypot(dx, dy);
      if (this.zoom <= 1.0001 || r === 0) {
        this.cx = d.cx;
        this.cy = d.cy;
      } else if (r > lim) {
        this.cx = d.cx + (dx / r) * lim;
        this.cy = d.cy + (dy / r) * lim;
      }
      return;
    }
    if (this.zoom <= 1.0001) {
      this.cx = this.gridW / 2;
      this.cy = this.gridH / 2;
    } else {
      this.cx = mod(this.cx, this.gridW);
      this.cy = mod(this.cy, this.gridH);
    }
  }
}

export function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Shortest signed delta on a ring of length n. */
export function wrapDelta(d: number, n: number): number {
  return d - Math.round(d / n) * n;
}
