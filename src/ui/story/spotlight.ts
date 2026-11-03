/**
 * Coach-mark spotlight: a dimmed backdrop with a soft-edged cut-out around a target, a ring that pulses,
 * and either a bouncing arrow (small targets) or a "tap here" dot (the dish). It never blocks input (the
 * player can always tap anything, so a wrong rect can never soft-lock).
 *
 * Cheap (docs/ARTE-PULIDO.md B-17): the backdrop is drawn on its canvas only when the hole moves or
 * changes size (and during the 320-ms iris-in), with a stepped feather instead of `shadowBlur`; fading
 * is the element's opacity; the ring, the arrow and the tap dot are DOM pieces moved with `transform` and
 * animated by CSS (transform/opacity). The hole follows its target every frame, without lag.
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

/** Iris-in: the hole closes from 160 px around the target in this many seconds (`enter` curve). */
const IRIS_S = 0.32;
/** Feather of the cut-out edge (px) and its steps. */
const FEATHER = 22;
const FEATHER_STEPS = 6;

function roundRect(ctx: CanvasRenderingContext2D, r: Rect, rad: number): void {
  const R = Math.max(0, Math.min(rad, r.w / 2, r.h / 2));
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, R);
}

/** cubic-bezier(.05, .7, .1, 1) is close to this for a 0..1 iris. */
const irisEase = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 4);

export class Spotlight {
  /** Everything of the spotlight (backdrop canvas + ring + arrow + tap dot). */
  readonly el: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private ring: HTMLDivElement;
  private arrow: HTMLDivElement;
  private tapDot: HTMLDivElement;
  private target: Rect | null = null;
  /** The hole as last drawn (null = nothing drawn). */
  private drawn: Rect | null = null;
  private drawnDim = -1;
  private irisFrom: Rect | null = null;
  private born = -1;
  private opts: SpotOpts = { dim: 0, arrow: null, tap: false };
  private W = 0;
  private H = 0;
  private dpr = 1;
  private shown = false;
  private hideAt = 0;
  private clock = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'sty-layer sty-spotwrap';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'sty-spot';
    this.ctx = this.canvas.getContext('2d');
    this.ring = document.createElement('div');
    this.ring.className = 'sty-ring';
    this.arrow = document.createElement('div');
    this.arrow.className = 'sty-arrow';
    this.arrow.innerHTML =
      '<svg viewBox="0 0 24 30" width="24" height="30" aria-hidden="true"><path d="M12 29 1 16h7V1h8v15h7z" fill="#9EF0FF" stroke="#0b2a3a" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    this.tapDot = document.createElement('div');
    this.tapDot.className = 'sty-tapdot';
    this.tapDot.innerHTML = '<i></i><i></i><b></b>';
    this.el.append(this.canvas, this.ring, this.arrow, this.tapDot);
  }

  /** Point at `r` (root-relative CSS px), or fade out with null. */
  set(r: Rect | null, opts: Partial<SpotOpts> = {}, now = 0): void {
    this.opts = { ...this.opts, ...opts };
    if (r && !this.target) {
      // Iris in from a much larger hole (unless we are still fading out of the last target: then glide).
      this.irisFrom = this.drawn && this.shown ? { ...this.drawn } : { x: r.x - 160, y: r.y - 160, w: r.w + 320, h: r.h + 320 };
      this.born = now;
    }
    this.target = r ? { ...r } : null;
  }

  get active(): boolean {
    return !!this.target || this.shown;
  }

  /** The hole the spotlight shows now (root-relative), or null. For tests and dev pages. */
  get hole(): Rect | null {
    return this.target ? { ...this.target } : null;
  }

  resize(W: number, H: number, dpr: number): void {
    if (W === this.W && H === this.H && dpr === this.dpr) return;
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(W * dpr));
    this.canvas.height = Math.max(1, Math.round(H * dpr));
    this.drawn = null; // a resize clears the canvas
  }

  frame(t: number, _dt: number, rm: boolean): void {
    this.clock = t;
    const want = !!this.target && this.opts.dim > 0;
    if (want !== this.shown) {
      this.shown = want;
      this.el.classList.toggle('on', want);
      if (!want) this.hideAt = t;
    }
    if (!this.target) {
      // Faded out (CSS opacity): clear once the fade is over.
      if (this.drawn && t - this.hideAt > 0.3) {
        this.ctx?.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawn = null;
      }
      return;
    }
    let hole = this.target;
    const k = rm ? 1 : (t - this.born) / IRIS_S;
    if (k < 1 && this.irisFrom) {
      const e = irisEase(k);
      const f = this.irisFrom;
      hole = { x: f.x + (hole.x - f.x) * e, y: f.y + (hole.y - f.y) * e, w: f.w + (hole.w - f.w) * e, h: f.h + (hole.h - f.h) * e };
    }
    const moved =
      !this.drawn ||
      this.drawnDim !== this.opts.dim ||
      Math.abs(this.drawn.x - hole.x) > 0.5 ||
      Math.abs(this.drawn.y - hole.y) > 0.5 ||
      Math.abs(this.drawn.w - hole.w) > 0.5 ||
      Math.abs(this.drawn.h - hole.h) > 0.5;
    if (moved) this.drawBackdrop(hole);
    this.placePieces(hole, rm);
  }

  /** The dim layer with a feathered cut-out (no shadowBlur: stepped rounded rects, destination-out). */
  private drawBackdrop(hole: Rect): void {
    const ctx = this.ctx;
    this.drawn = { ...hole };
    this.drawnDim = this.opts.dim;
    if (!ctx) return;
    const { W, H, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(3, 5, 9, ${this.opts.dim.toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'destination-out';
    const rad = Math.min(26, hole.h / 2, hole.w / 2);
    for (let i = FEATHER_STEPS; i >= 1; i--) {
      const pad = (FEATHER * i) / FEATHER_STEPS - 6;
      ctx.globalAlpha = 0.42;
      roundRect(ctx, { x: hole.x - pad, y: hole.y - pad, w: hole.w + pad * 2, h: hole.h + pad * 2 }, rad + Math.max(0, pad));
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    roundRect(ctx, hole, rad);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  private pieceKey = '';
  /** Ring, arrow and tap dot follow the hole with transforms; their size is written only when it changes. */
  private placePieces(hole: Rect, rm: boolean): void {
    const key = `${hole.x.toFixed(1)}|${hole.y.toFixed(1)}|${hole.w.toFixed(1)}|${hole.h.toFixed(1)}|${this.opts.arrow}|${this.opts.tap}|${rm}`;
    if (key === this.pieceKey) return;
    const sizeChanged = !this.pieceKey || this.pieceKey.split('|').slice(2, 4).join('|') !== key.split('|').slice(2, 4).join('|');
    this.pieceKey = key;
    const rad = Math.min(26, hole.h / 2, hole.w / 2);
    const rs = this.ring.style;
    if (sizeChanged) {
      rs.width = `${hole.w}px`;
      rs.height = `${hole.h}px`;
      rs.borderRadius = `${rad}px`;
    }
    rs.transform = `translate(${hole.x}px, ${hole.y}px)`;
    const big = hole.w * hole.h > this.W * this.H * 0.3;
    const showArrow = !!this.opts.arrow && !big;
    this.arrow.hidden = !showArrow;
    if (showArrow) {
      const down = this.opts.arrow === 'above';
      const cx = hole.x + hole.w / 2 - 12;
      const y = down ? hole.y - 44 : hole.y + hole.h + 14;
      this.arrow.style.transform = `translate(${cx}px, ${y}px)${down ? '' : ' rotate(180deg)'}`;
    }
    this.tapDot.hidden = !this.opts.tap;
    if (this.opts.tap) this.tapDot.style.transform = `translate(${hole.x + hole.w / 2}px, ${hole.y + hole.h / 2}px)`;
    this.el.classList.toggle('rm', rm);
    void this.clock;
  }
}
