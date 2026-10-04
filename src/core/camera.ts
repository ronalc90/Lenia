import type { CameraState } from './types';

/**
 * Maps between grid cells and canvas CSS pixels. Shared by the WebGL renderer
 * and the 2D overlay so both draw in exactly the same place.
 *
 * At zoom 1 the whole grid is fitted ("contain") and centered in the canvas.
 * The dish is toroidal, so camera centers wrap.
 */
export class Camera implements CameraState {
  zoom = 1;
  cx: number;
  cy: number;

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

  /** CSS pixels per grid cell. */
  get scale(): number {
    return Math.min(this.viewW / this.gridW, this.viewH / this.gridH) * this.zoom;
  }

  gridToScreen(x: number, y: number): { x: number; y: number } {
    const s = this.scale;
    // Pick the wrapped copy of (x, y) closest to the camera center.
    const dx = wrapDelta(x - this.cx, this.gridW);
    const dy = wrapDelta(y - this.cy, this.gridH);
    return { x: this.viewW / 2 + dx * s, y: this.viewH / 2 + dy * s };
  }

  screenToGrid(px: number, py: number): { x: number; y: number } {
    const s = this.scale;
    const x = this.cx + (px - this.viewW / 2) / s;
    const y = this.cy + (py - this.viewH / 2) / s;
    return { x: mod(x, this.gridW), y: mod(y, this.gridH) };
  }

  /** True if a CSS-pixel point lies over the dish area (not the letterbox). */
  isOnDish(px: number, py: number): boolean {
    const s = this.scale;
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

  private screenToGridRaw(px: number, py: number): { x: number; y: number } {
    const s = this.scale;
    return { x: this.cx + (px - this.viewW / 2) / s, y: this.cy + (py - this.viewH / 2) / s };
  }

  private clampCenter(): void {
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
