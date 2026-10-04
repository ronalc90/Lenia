/**
 * Environmental hints: light drawn OVER the dish, derived from the real
 * creatures' positions. They never touch the simulation (GDD pillar 1): the
 * creatures are real, only the glow around them is storytelling.
 */
import type { GameView } from '../../core/types';
import type { HintView } from '../../story/types';
import type { Rect } from './spotlight';

interface Live extends HintView {
  age: number;
}

export interface HintEnv {
  /** Dish rectangle, root-relative CSS px. */
  dish: Rect | null;
  /** Grid → root-relative CSS px (null if unknown or off-screen). */
  toScreen: ((x: number, y: number) => { x: number; y: number } | null) | null;
  view: GameView | null;
  rm: boolean;
}

const TAU = Math.PI * 2;

function envelope(age: number, dur: number): number {
  const fin = Math.min(1, age / 0.7);
  const fout = Math.min(1, Math.max(0, (dur - age) / 1.2));
  return Math.max(0, Math.min(fin, fout));
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a.toFixed(3)})`;
}

export class HintLayer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private live: Live[] = [];
  private W = 0;
  private H = 0;
  private dpr = 1;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'sty-layer sty-hints';
    this.ctx = this.canvas.getContext('2d');
  }

  add(h: HintView): void {
    // One of each kind at a time: a new one restarts it.
    this.live = this.live.filter((x) => x.kind !== h.kind);
    this.live.push({ ...h, age: 0 });
  }

  get active(): boolean {
    return this.live.length > 0;
  }

  resize(W: number, H: number, dpr: number): void {
    if (W === this.W && H === this.H && dpr === this.dpr) return;
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(W * dpr));
    this.canvas.height = Math.max(1, Math.round(H * dpr));
  }

  frame(t: number, dt: number, env: HintEnv): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const h of this.live) h.age += dt;
    this.live = this.live.filter((h) => h.age < h.duration);
    if (!this.live.length || !env.dish) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const d = env.dish;
    ctx.save();
    ctx.beginPath();
    ctx.rect(d.x, d.y, d.w, d.h);
    ctx.clip();
    const stable: { x: number; y: number; r: number }[] = [];
    if (env.view && env.toScreen) {
      for (const c of env.view.creatures) {
        if (c.state !== 'stable') continue;
        const p = env.toScreen(c.x, c.y);
        if (p) stable.push({ x: p.x, y: p.y, r: 22 });
      }
    }
    const golden = env.view?.golden && env.toScreen ? env.toScreen(env.view.golden.x, env.view.golden.y) : null;
    for (const h of this.live) {
      const a = env.rm ? Math.min(1, envelope(h.age, h.duration) * 1.4) : envelope(h.age, h.duration);
      if (a <= 0) continue;
      switch (h.kind) {
        case 'lamp':
          this.lamp(ctx, d, a, h.color ?? '#FFD9A0');
          break;
        case 'dawn':
          this.dawn(ctx, d, a, h.color ?? '#FFE9C7', t, env.rm);
          break;
        case 'constellation':
          this.constellation(ctx, stable, a, h.age, env.rm);
          break;
        case 'echo':
          this.echo(ctx, stable, a, h.age, env.rm);
          break;
        case 'gather': {
          const p = h.x !== undefined && h.y !== undefined && env.toScreen ? env.toScreen(h.x, h.y) : null;
          if (p) this.gather(ctx, stable, p, a, h.age, env.rm);
          break;
        }
        case 'orbit':
          if (golden) this.orbit(ctx, stable, golden, a, t, env.rm);
          break;
        case 'tint':
          if (golden) this.tint(ctx, golden, a, h.color ?? '#FFD166', t, env.rm);
          break;
      }
    }
    ctx.restore();
  }

  private lamp(ctx: CanvasRenderingContext2D, d: Rect, a: number, color: string): void {
    const g = ctx.createRadialGradient(d.x + d.w / 2, d.y - d.h * 0.1, 0, d.x + d.w / 2, d.y, d.h * 0.9);
    g.addColorStop(0, hexA(color, 0.42 * a));
    g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(d.x, d.y, d.w, d.h);
  }

  private dawn(ctx: CanvasRenderingContext2D, d: Rect, a: number, color: string, t: number, rm: boolean): void {
    const y0 = d.y + d.h * 0.7;
    const g = ctx.createLinearGradient(0, y0, 0, d.y + d.h);
    g.addColorStop(0, hexA(color, 0));
    g.addColorStop(1, hexA(color, 0.28 * a));
    ctx.fillStyle = g;
    ctx.fillRect(d.x, y0, d.w, d.y + d.h - y0);
    // The thin grey-gold horizon line.
    ctx.strokeStyle = hexA(color, 0.5 * a);
    ctx.lineWidth = 1;
    const yl = d.y + d.h - 6 - (rm ? 0 : Math.sin(t * 0.5) * 1.5);
    ctx.beginPath();
    ctx.moveTo(d.x, yl);
    ctx.lineTo(d.x + d.w, yl);
    ctx.stroke();
  }

  private constellation(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], a: number, age: number, rm: boolean): void {
    if (pts.length < 3) return;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const ordered = [...pts].sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
    // Draw the polygon progressively, like someone joining the dots.
    const prog = rm ? 1 : Math.min(1, age / 2.5);
    const segs = ordered.length;
    const upto = prog * segs;
    ctx.save();
    ctx.strokeStyle = `rgba(200, 225, 255, ${0.65 * a})`;
    ctx.lineWidth = 1.2;
    ctx.shadowColor = '#9EC8FF';
    ctx.shadowBlur = 8;
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    for (let i = 0; i < segs && i < upto; i++) {
      const p = ordered[i];
      const q = ordered[(i + 1) % segs];
      const f = Math.min(1, upto - i);
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + (q.x - p.x) * f, p.y + (q.y - p.y) * f);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    for (const p of ordered) {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 10);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * a})`);
      g.addColorStop(1, 'rgba(158,200,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  private echo(ctx: CanvasRenderingContext2D, pts: { x: number; y: number; r: number }[], a: number, age: number, rm: boolean): void {
    ctx.save();
    ctx.lineWidth = 1.6;
    pts.forEach((p, i) => {
      for (let k = 0; k < 3; k++) {
        const local = rm ? 0.5 : age - i * 0.22 - k * 0.6;
        if (local < 0) continue;
        const q = (local % 1.8) / 1.8;
        ctx.strokeStyle = i % 2 ? `rgba(184, 146, 255, ${(1 - q) * 0.7 * a})` : `rgba(158, 240, 255, ${(1 - q) * 0.7 * a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.6 + q * 44, 0, TAU);
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  private gather(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], to: { x: number; y: number }, a: number, age: number, rm: boolean): void {
    ctx.save();
    ctx.lineWidth = 1;
    for (const p of pts) {
      const mx = (p.x + to.x) / 2 + (p.y - to.y) * 0.18;
      const my = (p.y + to.y) / 2 - (p.x - to.x) * 0.18;
      ctx.strokeStyle = `rgba(158, 240, 255, ${0.35 * a})`;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(mx, my, to.x, to.y);
      ctx.stroke();
      // A bead of light travelling along each thread.
      const s = rm ? 0.5 : (age * 0.6) % 1;
      const bx = (1 - s) * (1 - s) * p.x + 2 * (1 - s) * s * mx + s * s * to.x;
      const by = (1 - s) * (1 - s) * p.y + 2 * (1 - s) * s * my + s * s * to.y;
      ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`;
      ctx.beginPath();
      ctx.arc(bx, by, 1.8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  private orbit(ctx: CanvasRenderingContext2D, pts: { x: number; y: number; r: number }[], g: { x: number; y: number }, a: number, t: number, rm: boolean): void {
    if (!pts.length) return;
    let best = pts[0];
    let bd = Infinity;
    for (const p of pts) {
      const d = (p.x - g.x) ** 2 + (p.y - g.y) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    const R = best.r + 16;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 209, 102, ${0.45 * a})`;
    ctx.setLineDash([1.5, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(best.x, best.y, R, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    const ang = rm ? -0.8 : t * 2.4;
    for (let i = 0; i < 10; i++) {
      const aa = ang - i * 0.09;
      const x = best.x + Math.cos(aa) * R;
      const y = best.y + Math.sin(aa) * R;
      ctx.fillStyle = `rgba(255, 220, 140, ${(1 - i / 10) * 0.9 * a})`;
      ctx.beginPath();
      ctx.arc(x, y, 3 - i * 0.22, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  private tint(ctx: CanvasRenderingContext2D, g: { x: number; y: number }, a: number, color: string, t: number, rm: boolean): void {
    const r = 30 + (rm ? 0 : Math.sin(t * 3) * 4);
    const grad = ctx.createRadialGradient(g.x, g.y, 2, g.x, g.y, r);
    grad.addColorStop(0, hexA(color, 0.75 * a));
    grad.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(g.x, g.y, r, 0, TAU);
    ctx.fill();
  }
}
