/**
 * Esencia flies to the counter (docs/ARTE-PULIDO.md A-5, N3): motes of light leave the creature
 * that paid and fall into the HUD's Esencia icon, which answers when they land (B-6, through
 * FxAnchors). The reward is seen travelling, like every good incremental.
 *
 * One canvas of its own over the page (z 25: above the HUD 20, under sheets 30), pointer-events
 * none, hidden (display: none) whenever nothing is in flight, so an idle game composites nothing.
 * A fixed pool of motes, pre-rendered sprites, no allocation per frame.
 */
import { bezier } from '../art/motion';
import { SPR, SpriteAtlas } from './sprites';
import type { FxAnchorId, FxAnchors } from './types';

export const FLY = {
  /** Mote: a 5 px core in a 14 px halo (CSS px). */
  corePx: 5,
  haloPx: 14,
  /** Duration clamp(520, 560 + 0.12 · distance px, 760) ms. */
  durMin: 520,
  durBase: 560,
  durPerPx: 0.12,
  durMax: 760,
  /** Control point: the midpoint pushed sideways 25–35 % of the distance, alternating sides. */
  bendMin: 0.25,
  bendMax: 0.35,
  /** Scale 1 → 0.6 on the way; the species colour turns accent over the last 30 %. */
  scaleEnd: 0.6,
  accentFrom: 0.7,
  /** Trail samples. */
  trail: 4,
  /** Motes of one payment leave 60 ms apart; arrivals within 80 ms land as one. */
  staggerMs: 60,
  groupMs: 80,
  /** Payments smaller than 0.5 % of the HUD's Esencia do not fly (only their "+N"). */
  minShare: 0.005,
  /** At most one flight per creature every this many ms (cycleBalance SESSION_INCOME_POP_INTERVAL 0.8 s). */
  perCreatureMs: 800,
} as const;

/** Accelerating into the counter: cubic-bezier(0.55, 0, 1, 0.45). */
const accel = bezier(0.55, 0, 1, 0.45);

/** Flight time (ms) for a distance in CSS px. */
export function flyDuration(distPx: number): number {
  return Math.min(FLY.durMax, Math.max(FLY.durMin, FLY.durBase + FLY.durPerPx * distPx));
}

/** Point of the quadratic Bézier p0 → c → p1 at u (writes `out`). */
export function bezierPoint(u: number, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, out: { x: number; y: number }): void {
  const v = 1 - u;
  out.x = v * v * x0 + 2 * v * u * cx + u * u * x1;
  out.y = v * v * y0 + 2 * v * u * cy + u * u * y1;
}

/**
 * Record a position in a trail of FLY.trail points (x, y pairs, oldest first) holding `n` of them; returns
 * the new count. The buffer shifts only once full: shifting earlier pulled unset slots (or the previous
 * flight's points) into view, drawn as ghosts at the screen's corner (integrator review of v0.019).
 */
export function pushTrail(tr: Float32Array, n: number, x: number, y: number): number {
  if (n < FLY.trail) {
    tr[n * 2] = x;
    tr[n * 2 + 1] = y;
    return n + 1;
  }
  for (let k = 0; k < FLY.trail - 1; k++) {
    tr[k * 2] = tr[k * 2 + 2];
    tr[k * 2 + 1] = tr[k * 2 + 3];
  }
  tr[(FLY.trail - 1) * 2] = x;
  tr[(FLY.trail - 1) * 2 + 1] = y;
  return n;
}

/** Control point: the midpoint pushed perpendicular by `bend` of the distance on `side` (±1). */
export function flyControl(x0: number, y0: number, x1: number, y1: number, bend: number, side: number, out: { x: number; y: number }): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  out.x = (x0 + x1) / 2 - dy * bend * side;
  out.y = (y0 + y1) / 2 + dx * bend * side;
}

/** Progress along the path at time fraction t (accelerating). */
export function flyProgress(t: number): number {
  return accel(Math.min(1, Math.max(0, t)));
}

interface Mote {
  on: boolean;
  t0: number;
  dur: number;
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
  color: number;
  to: FxAnchorId;
  trail: Float32Array;
  trailN: number;
}

const ANCHORS: readonly FxAnchorId[] = ['essence', 'datos', 'clock', 'bestiary'];

export interface FlyOptions {
  anchors: () => FxAnchors;
  /** The light theme: no additive light over pale surfaces. */
  light: () => boolean;
  reduceMotion: () => boolean;
  /** Where motes go when the anchor is not known (top left, under the safe area). */
  fallback?: () => { x: number; y: number };
  /** The accent the motes turn into (the HUD's Esencia colour). */
  accent?: string;
}

export class FlyLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly atlas = new SpriteAtlas();
  private readonly motes: Mote[] = [];
  private readonly accent: number;
  private readonly white: number;
  private readonly pending = new Float32Array(ANCHORS.length);
  private readonly pendingAt = new Float64Array(ANCHORS.length);
  private shown = false;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private side = 1;
  private max = 12;
  private readonly pt = { x: 0, y: 0 };

  constructor(
    host: HTMLElement,
    private readonly opts: FlyOptions,
  ) {
    const c = document.createElement('canvas');
    c.className = 'bl-fx-fly';
    c.setAttribute('aria-hidden', 'true');
    const st = c.style;
    st.position = 'fixed';
    st.left = '0';
    st.top = '0';
    st.width = '100%';
    st.height = '100%';
    st.pointerEvents = 'none';
    st.zIndex = 'var(--bl-z-fx, 25)';
    st.display = 'none';
    host.appendChild(c);
    this.canvas = c;
    this.ctx = c.getContext('2d');
    this.accent = this.atlas.color(opts.accent ?? '#5bc0eb');
    this.white = this.atlas.color('#ffffff');
    for (let i = 0; i < 12; i++) {
      this.motes.push({ on: false, t0: 0, dur: 0, x0: 0, y0: 0, cx: 0, cy: 0, x1: 0, y1: 0, color: 0, to: 'essence', trail: new Float32Array(FLY.trail * 2), trailN: 0 });
    }
  }

  /** Motes in flight at most (profile: 6 on low, 12 otherwise). */
  setMax(n: number): void {
    this.max = Math.max(1, Math.min(this.motes.length, Math.floor(n)));
  }

  get busy(): boolean {
    return this.shown;
  }

  /** Motes in flight now (tests, the capture tool). */
  get inFlight(): number {
    let n = 0;
    for (const m of this.motes) if (m.on) n++;
    return n;
  }

  /**
   * Send `n` motes of colour `hex` from a client point (CSS px of the viewport) to an anchor, leaving
   * 60 ms apart. Reduce motion: no flight, the anchor is told at once.
   */
  launch(fromX: number, fromY: number, to: FxAnchorId, hex: string, n: number, now: number): void {
    if (!(n > 0)) return;
    if (this.opts.reduceMotion()) {
      this.opts.anchors().arrive(to, n);
      return;
    }
    const r = this.opts.anchors().rect(to);
    let x1: number;
    let y1: number;
    if (r && r.width > 0) {
      x1 = r.left + r.width / 2;
      y1 = r.top + r.height / 2;
    } else {
      const f = this.opts.fallback?.() ?? { x: 28, y: 28 };
      x1 = f.x;
      y1 = f.y;
    }
    const color = this.atlas.color(hex);
    const dist = Math.hypot(x1 - fromX, y1 - fromY);
    for (let k = 0; k < n; k++) {
      const m = this.free();
      if (!m) {
        // The sky is full: what cannot fly still counts.
        this.arrive(to, n - k, now);
        break;
      }
      this.side = -this.side;
      const bend = FLY.bendMin + (FLY.bendMax - FLY.bendMin) * ((k * 0.618 + 0.3) % 1);
      flyControl(fromX, fromY, x1, y1, bend, this.side, this.pt);
      m.on = true;
      m.t0 = now + k * FLY.staggerMs;
      m.dur = flyDuration(dist);
      m.x0 = fromX;
      m.y0 = fromY;
      m.cx = this.pt.x;
      m.cy = this.pt.y;
      m.x1 = x1;
      m.y1 = y1;
      m.color = color;
      m.to = to;
      m.trailN = 0;
    }
    this.show();
  }

  private free(): Mote | null {
    let live = 0;
    let spare: Mote | null = null;
    for (const m of this.motes) {
      if (m.on) live++;
      else spare ??= m;
    }
    return live < this.max ? spare : null;
  }

  private arrive(to: FxAnchorId, n: number, now: number): void {
    const i = ANCHORS.indexOf(to);
    if (this.pending[i] === 0) this.pendingAt[i] = now;
    this.pending[i] += n;
  }

  private show(): void {
    if (this.shown) return;
    this.shown = true;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = globalThis.innerWidth || 1;
    const h = globalThis.innerHeight || 1;
    if (w !== this.w || h !== this.h || dpr !== this.dpr) {
      this.w = w;
      this.h = h;
      this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.canvas.style.display = 'block';
  }

  /** Every animation frame (performance.now() ms). Cheap no-op while nothing flies. */
  frame(now: number): void {
    if (!this.shown) return;
    const ctx = this.ctx;
    let flying = 0;
    if (ctx) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      ctx.globalCompositeOperation = this.opts.light() ? 'source-over' : 'lighter';
    }
    for (const m of this.motes) {
      if (!m.on) continue;
      flying++;
      const t = (now - m.t0) / m.dur;
      if (t < 0) continue;
      if (t >= 1) {
        m.on = false;
        this.arrive(m.to, 1, now);
        continue;
      }
      const u = flyProgress(t);
      bezierPoint(u, m.x0, m.y0, m.cx, m.cy, m.x1, m.y1, this.pt);
      const x = this.pt.x;
      const y = this.pt.y;
      const sc = 1 + (FLY.scaleEnd - 1) * u;
      const toAccent = t <= FLY.accentFrom ? 0 : (t - FLY.accentFrom) / (1 - FLY.accentFrom);
      const fadeIn = Math.min(1, t / 0.08);
      if (ctx) {
        // Trail: the last 4 positions, fainter and smaller.
        for (let k = 0; k < m.trailN; k++) {
          const f = (k + 1) / (FLY.trail + 1);
          this.atlas.draw(ctx, SPR.disc, toAccent > 0.5 ? this.accent : m.color, m.trail[k * 2], m.trail[k * 2 + 1], FLY.haloPx * sc * (0.9 + 0.8 * f), 0.4 * f * fadeIn);
        }
        // Halo (14 px of visible light: the sprite's falloff needs ×2.4) and a hot 5 px core.
        if (toAccent < 1) this.atlas.draw(ctx, SPR.disc, m.color, x, y, FLY.haloPx * sc * 2.4, (1 - toAccent) * fadeIn);
        if (toAccent > 0) this.atlas.draw(ctx, SPR.disc, this.accent, x, y, FLY.haloPx * sc * 2.4, toAccent * fadeIn);
        this.atlas.draw(ctx, SPR.disc, this.white, x, y, FLY.corePx * sc * 2.6, 0.95 * fadeIn);
      }
      m.trailN = pushTrail(m.trail, m.trailN, x, y);
    }
    if (ctx) {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // Arrivals within 80 ms land as one (the HUD beats once).
    let waiting = false;
    for (let i = 0; i < ANCHORS.length; i++) {
      if (this.pending[i] === 0) continue;
      if (now - this.pendingAt[i] >= FLY.groupMs || flying === 0) {
        const n = this.pending[i];
        this.pending[i] = 0;
        this.opts.anchors().arrive(ANCHORS[i], n);
      } else waiting = true;
    }
    if (flying === 0 && !waiting) {
      this.shown = false;
      if (ctx) ctx.clearRect(0, 0, this.w, this.h);
      this.canvas.style.display = 'none';
    }
  }

  dispose(): void {
    this.canvas.remove();
  }
}
