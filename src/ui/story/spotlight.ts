/**
 * Coach-mark spotlight: a dimmed backdrop with a soft-edged cut-out around a
 * target, a pulsing ring, and either a bouncing arrow (small targets) or a
 * "tap here" ripple (the dish). Drawn on one canvas; never blocks input (the
 * player can always tap anything, so a wrong rect can never soft-lock).
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpotOpts {
  /** Backdrop darkness 0..1. */
  dim: number;
  /** Where the arrow comes from (the dialogue side); null = no arrow. */
  arrow: 'above' | 'below' | null;
  /** Show a tapping ripple in the middle (for "tap the dish"). */
  tap: boolean;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function roundRect(ctx: CanvasRenderingContext2D, r: Rect, rad: number): void {
  const R = Math.max(0, Math.min(rad, r.w / 2, r.h / 2));
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, R);
}

export class Spotlight {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private hole: Rect | null = null;
  private target: Rect | null = null;
  private alpha = 0;
  private opts: SpotOpts = { dim: 0, arrow: null, tap: false };
  private born = 0;
  private W = 0;
  private H = 0;
  private dpr = 1;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'sty-layer sty-spot';
    this.ctx = this.canvas.getContext('2d');
  }

  /** Point at `r` (root-relative CSS px), or fade out with null. */
  set(r: Rect | null, opts: Partial<SpotOpts> = {}, now = 0): void {
    this.opts = { ...this.opts, ...opts };
    if (r && !this.target && !this.hole) {
      // Iris in from a much larger hole.
      this.hole = { x: r.x - 160, y: r.y - 160, w: r.w + 320, h: r.h + 320 };
      this.born = now;
    }
    this.target = r ? { ...r } : null;
  }

  get active(): boolean {
    return this.alpha > 0.003 || !!this.target;
  }

  resize(W: number, H: number, dpr: number): void {
    if (W === this.W && H === this.H && dpr === this.dpr) return;
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(W * dpr));
    this.canvas.height = Math.max(1, Math.round(H * dpr));
  }

  frame(t: number, dt: number, rm: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { W, H, dpr } = this;
    const k = rm ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 9);
    const want = this.target ? this.opts.dim : 0;
    this.alpha = lerp(this.alpha, want, rm ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 6));
    if (this.target) {
      const h = (this.hole ??= { ...this.target });
      h.x = lerp(h.x, this.target.x, k);
      h.y = lerp(h.y, this.target.y, k);
      h.w = lerp(h.w, this.target.w, k);
      h.h = lerp(h.h, this.target.h, k);
    } else if (this.alpha < 0.003) {
      this.hole = null;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.alpha < 0.003) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = `rgba(3, 5, 9, ${this.alpha.toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
    const hole = this.hole;
    if (!hole) return;
    const rad = Math.min(26, hole.h / 2, hole.w / 2);

    // Soft cut-out: the blurred shadow of a shape drawn off-canvas.
    const OFF = W + H + 200;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 22 * dpr;
    ctx.shadowOffsetX = OFF * dpr;
    ctx.fillStyle = '#000';
    roundRect(ctx, { x: hole.x - OFF, y: hole.y, w: hole.w, h: hole.h }, rad);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    roundRect(ctx, { x: hole.x + 6, y: hole.y + 6, w: Math.max(0, hole.w - 12), h: Math.max(0, hole.h - 12) }, Math.max(0, rad - 6));
    ctx.fill();
    ctx.restore();

    const vis = Math.min(1, this.alpha / Math.max(0.05, this.opts.dim));
    // Steady outline + two pulsing rings.
    ctx.save();
    ctx.globalAlpha = vis;
    ctx.strokeStyle = 'rgba(91, 192, 235, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#5BC0EB';
    ctx.shadowBlur = 10;
    roundRect(ctx, hole, rad);
    ctx.stroke();
    if (!rm) {
      for (const ph of [0, 0.5]) {
        const p = ((t - this.born) / 1.6 + ph) % 1;
        const pad = 3 + p * 12;
        ctx.globalAlpha = vis * (1 - p) * 0.8;
        ctx.lineWidth = 2;
        roundRect(ctx, { x: hole.x - pad, y: hole.y - pad, w: hole.w + pad * 2, h: hole.h + pad * 2 }, rad + pad);
        ctx.stroke();
      }
    }
    ctx.restore();

    const cx = hole.x + hole.w / 2;
    if (this.opts.arrow) {
      const bounce = rm ? 0 : Math.abs(Math.sin(t * 4)) * 7;
      const down = this.opts.arrow === 'above';
      const ay = down ? hole.y - 14 - bounce : hole.y + hole.h + 14 + bounce;
      ctx.save();
      ctx.globalAlpha = vis;
      ctx.translate(cx, ay);
      if (!down) ctx.rotate(Math.PI);
      ctx.fillStyle = '#9EF0FF';
      ctx.shadowColor = '#5BC0EB';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-11, -14);
      ctx.lineTo(-4, -14);
      ctx.lineTo(-4, -26);
      ctx.lineTo(4, -26);
      ctx.lineTo(4, -14);
      ctx.lineTo(11, -14);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (this.opts.tap) {
      // "Tap here": a finger-sized dot that presses, with ripples.
      const cy = hole.y + hole.h * 0.5;
      const p = rm ? 0.5 : (t % 1.5) / 1.5;
      ctx.save();
      ctx.globalAlpha = vis;
      for (let i = 0; i < 2; i++) {
        const q = rm ? 0.4 + i * 0.3 : (p + i * 0.35) % 1;
        ctx.strokeStyle = `rgba(158, 240, 255, ${(1 - q) * 0.8})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 14 + q * 46, 0, Math.PI * 2);
        ctx.stroke();
      }
      const press = rm ? 1 : 1 - Math.max(0, Math.sin(p * Math.PI * 2)) * 0.18;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22 * press);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.45, 'rgba(158,240,255,0.55)');
      g.addColorStop(1, 'rgba(91,192,235,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, 22 * press, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
