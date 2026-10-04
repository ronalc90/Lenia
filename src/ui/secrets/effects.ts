/**
 * Overlay effects for secrets, drawn on a transparent 2D canvas over the dish. They decorate;
 * they never touch the simulation (pillar 1). One rAF loop runs only while something is
 * alive, so an idle dish costs nothing. Every effect has a calm variant for reduceMotion.
 *
 * Positions arrive in grid cells and go through the shared Camera, so effects stay glued to
 * the dish while the player pans and zooms.
 */
import type { Camera } from '../../core/camera';
import type { Lang, Text } from '../../core/types';
import type { GridPt, MoteHue, SecretEffect } from '../../secrets/types';

const HUES: Record<MoteHue, [number, number, number]> = {
  gold: [255, 209, 102],
  cyan: [91, 192, 235],
  green: [125, 255, 160],
  violet: [184, 146, 255],
  pink: [255, 143, 171],
  silver: [214, 226, 255],
  ember: [255, 140, 60],
};

const rgba = (h: MoteHue, a: number) => `rgba(${HUES[h][0]},${HUES[h][1]},${HUES[h][2]},${a})`;

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  ph: number;
  tw: number;
  a: number;
}

interface Running {
  e: SecretEffect;
  t0: number;
  dur: number;
  rm: boolean;
  motes?: Mote[];
  /** Screen-space burst (reveal); not tied to the dish. */
  screen?: { x: number; y: number };
  glider?: { cells: Set<string>; trail: Set<string>[]; gen: number };
  seed: number;
}

function envelope(t: number, dur: number, fadeIn: number, fadeOut: number): number {
  if (t < 0 || t > dur) return 0;
  const a = Math.min(1, t / Math.max(1e-3, fadeIn));
  const b = Math.min(1, (dur - t) / Math.max(1e-3, fadeOut));
  return Math.max(0, Math.min(a, b));
}

const ease = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

/** Tiny deterministic hash for per-effect variation without Math.random in the hot path. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** One Game of Life step on a sparse set of "x,y" cells (B3/S23). */
export function lifeStep(cells: Set<string>): Set<string> {
  const counts = new Map<string, number>();
  for (const k of cells) {
    const [x, y] = k.split(',').map(Number);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const n = `${x + dx},${y + dy}`;
        counts.set(n, (counts.get(n) ?? 0) + 1);
      }
  }
  const out = new Set<string>();
  for (const [k, c] of counts) if (c === 3 || (c === 2 && cells.has(k))) out.add(k);
  return out;
}

export class EffectsLayer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private running: Running[] = [];
  private raf = 0;
  private sprites = new Map<MoteHue, HTMLCanvasElement>();
  private aurora: HTMLCanvasElement | null = null;
  /** Pre-rendered vignette (pulse) and moon (halo + disc), keyed by size/hue. */
  private cache = new Map<string, HTMLCanvasElement>();
  private seq = 1;
  private ro: ResizeObserver | null = null;

  constructor(
    private host: HTMLElement,
    private camera: Camera,
    private reduceMotion: () => boolean,
    private lang: () => Lang,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'bls-fx';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d');
    host.appendChild(this.canvas);
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(host);
    }
  }

  resize(): void {
    const r = this.host.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  get active(): boolean {
    return this.running.length > 0;
  }

  add(e: SecretEffect): void {
    if (e.kind === 'logoWake') return; // handled by the UI (HUD class), not drawn here
    const rm = this.reduceMotion();
    const run: Running = { e, t0: performance.now() / 1000, dur: e.duration, rm, seed: this.seq++ };
    if (e.kind === 'motes') run.motes = this.makeMotes(e.count, e.from, rm ? 0.25 : 1, run.seed);
    if (e.kind === 'glider') {
      // .O. / ..O / OOO
      const cells = new Set(['1,0', '2,1', '0,2', '1,2', '2,2']);
      run.glider = { cells, trail: [], gen: 0 };
    }
    this.running.push(run);
    this.kick();
  }

  /** Burst of motes from a screen point (the reveal seal). */
  burst(px: number, py: number, hue: MoteHue, count = 36): void {
    if (this.reduceMotion()) return;
    const seed = this.seq++;
    const motes: Mote[] = [];
    for (let i = 0; i < count; i++) {
      const a = hash(seed * 31 + i) * Math.PI * 2;
      const sp = 40 + hash(seed * 17 + i) * 130;
      motes.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, r: 0.8 + hash(i * 7 + seed) * 1.8, ph: hash(i + seed * 3) * 6.28, tw: 3 + hash(i * 3) * 4, a: 1 });
    }
    this.running.push({ e: { kind: 'motes', count, hue, duration: 2.2, from: 'center' }, t0: performance.now() / 1000, dur: 2.2, rm: false, motes, screen: { x: px, y: py }, seed });
    this.kick();
  }

  clear(): void {
    this.running = [];
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro?.disconnect();
    this.canvas.remove();
  }

  // ───────────────────────────── loop ─────────────────────────────

  private kick(): void {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (ms: number): void => {
    this.raf = 0;
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ms / 1000;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    this.running = this.running.filter((r) => now - r.t0 <= r.dur);
    if (!this.running.length) return; // idle: canvas cleared, loop stops
    const dish = this.dishRect();
    for (const r of this.running) {
      const t = now - r.t0;
      ctx.save();
      if (!r.screen) {
        ctx.beginPath();
        ctx.rect(dish.x, dish.y, dish.w, dish.h);
        ctx.clip();
      }
      this.draw(ctx, r, t, dish);
      ctx.restore();
    }
    this.kick();
  };

  /** Advance all effects by `seconds` and render one frame (headless screenshots / tests). */
  renderAt(seconds: number): void {
    for (const r of this.running) r.t0 = performance.now() / 1000 - seconds;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.frame(performance.now());
  }

  /** Dish rectangle in CSS px (letterboxed at zoom 1, the whole canvas when zoomed in). */
  private dishRect(): { x: number; y: number; w: number; h: number } {
    const c = this.camera;
    if (c.zoom > 1.001) return { x: 0, y: 0, w: this.w, h: this.h };
    const s = c.scale;
    const w = c.gridW * s;
    const h = c.gridH * s;
    return { x: (this.w - w) / 2, y: (this.h - h) / 2, w, h };
  }

  private toScreen(p: GridPt): { x: number; y: number } {
    return this.camera.gridToScreen(p.x, p.y);
  }

  private sprite(h: MoteHue): HTMLCanvasElement {
    let s = this.sprites.get(h);
    if (!s) {
      s = document.createElement('canvas');
      s.width = s.height = 64;
      const g = s.getContext('2d')!;
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.12, rgba(h, 0.95));
      grad.addColorStop(0.35, rgba(h, 0.32));
      grad.addColorStop(1, rgba(h, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      this.sprites.set(h, s);
    }
    return s;
  }

  private makeMotes(n: number, from: 'top' | 'bottom' | 'center' | 'swirl', k: number, seed: number): Mote[] {
    const out: Mote[] = [];
    const count = Math.max(4, Math.round(n * k));
    for (let i = 0; i < count; i++) {
      const r1 = hash(seed * 13 + i);
      const r2 = hash(seed * 29 + i * 3);
      const r3 = hash(seed * 7 + i * 11);
      const m: Mote = { x: r1, y: r2, vx: 0, vy: 0, r: 0.7 + r3 * 1.9, ph: r2 * 6.28, tw: 2 + r1 * 5, a: 0.55 + r3 * 0.45 };
      if (from === 'top') {
        m.y = -0.05 - r2 * 0.6;
        m.vy = 0.06 + r3 * 0.09;
        m.vx = (r1 - 0.5) * 0.02;
      } else if (from === 'bottom') {
        m.y = 1.05 + r2 * 0.6;
        m.vy = -(0.06 + r3 * 0.1);
        m.vx = (r1 - 0.5) * 0.02;
      } else if (from === 'center') {
        const a = r1 * Math.PI * 2;
        const sp = 0.05 + r3 * 0.22;
        m.x = 0.5;
        m.y = 0.5;
        m.vx = Math.cos(a) * sp;
        m.vy = Math.sin(a) * sp * 0.8;
      } else {
        // swirl: polar (x = angle, y = radius)
        m.x = r1 * Math.PI * 2;
        m.y = 0.02 + r2 * 0.08;
        m.vx = 0.9 + r3 * 1.4;
        m.vy = 0.05 + r1 * 0.08;
      }
      out.push(m);
    }
    return out;
  }

  // ───────────────────────────── drawers ─────────────────────────────

  private draw(ctx: CanvasRenderingContext2D, r: Running, t: number, d: { x: number; y: number; w: number; h: number }): void {
    const e = r.e;
    switch (e.kind) {
      case 'motes':
        return this.drawMotes(ctx, r, t, d, e.hue, e.from);
      case 'trace':
        return this.drawTrace(ctx, r, t, e.points, e.color);
      case 'halo':
        return this.drawHalo(ctx, r, t, e.x, e.y, e.r, e.color);
      case 'constellation':
        return this.drawConstellation(ctx, r, t, e.points, e.label, e.closed);
      case 'aurora':
        return this.drawAurora(ctx, r, t, d);
      case 'glider':
        return this.drawGlider(ctx, r, t, e.x, e.y);
      case 'moon':
        return this.drawMoon(ctx, r, t, d, e.illumination, e.waxing);
      case 'pulse':
        return this.drawPulse(ctx, r, t, d, e.color, e.beats);
      case 'whisper':
        return this.drawWhisper(ctx, r, t, d, e.text);
      case 'ripple':
        return this.drawRipple(ctx, r, t, d, e.x, e.y);
      case 'logoWake':
        return;
    }
  }

  private drawMotes(ctx: CanvasRenderingContext2D, r: Running, t: number, d: { x: number; y: number; w: number; h: number }, hue: MoteHue, from: string): void {
    const env = envelope(t, r.dur, 0.35, r.dur * 0.35);
    const spr = this.sprite(hue);
    const tm = r.rm ? 0 : t;
    ctx.globalCompositeOperation = 'lighter';
    for (const m of r.motes ?? []) {
      let x: number;
      let y: number;
      if (r.screen) {
        // Screen burst: ballistic with drag, drifting up.
        const drag = 1 - Math.exp(-2.2 * t);
        x = m.x + (m.vx / 2.2) * drag;
        y = m.y + (m.vy / 2.2) * drag - 14 * t;
      } else if (from === 'swirl') {
        const ang = m.x + m.vx * tm;
        const rad = (m.y + m.vy * tm) * Math.min(d.w, d.h);
        x = d.x + d.w / 2 + Math.cos(ang) * rad;
        y = d.y + d.h / 2 + Math.sin(ang) * rad;
      } else if (from === 'center') {
        const drag = 1 - Math.exp(-0.9 * tm);
        x = d.x + (m.x + (m.vx / 0.9) * drag) * d.w;
        y = d.y + (m.y + (m.vy / 0.9) * drag) * d.h - tm * 4;
      } else {
        x = d.x + (m.x + m.vx * tm + Math.sin(tm * 0.8 + m.ph) * 0.012) * d.w;
        y = d.y + (m.y + m.vy * tm) * d.h;
      }
      const tw = r.rm ? 1 : 0.55 + 0.45 * Math.sin(t * m.tw + m.ph);
      const a = env * m.a * tw;
      if (a <= 0.01) continue;
      const s = m.r * 7;
      ctx.globalAlpha = a;
      ctx.drawImage(spr, x - s / 2, y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private strokePath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], upto: number): void {
    const n = Math.max(2, Math.floor(pts.length * upto));
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else {
        // Skip toroidal jumps between consecutive screen points.
        const q = pts[i - 1];
        if (Math.abs(p.x - q.x) > this.w / 2 || Math.abs(p.y - q.y) > this.h / 2) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
    }
    ctx.stroke();
  }

  private drawTrace(ctx: CanvasRenderingContext2D, r: Running, t: number, pts: GridPt[], hue: MoteHue): void {
    const env = envelope(t, r.dur, 0.05, r.dur * 0.55);
    const prog = r.rm ? 1 : ease(t / 0.9);
    const sp = pts.map((p) => this.toScreen(p));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(hue, 0.1 * env);
    ctx.lineWidth = 12;
    this.strokePath(ctx, sp, prog);
    ctx.strokeStyle = rgba(hue, 0.32 * env);
    ctx.lineWidth = 4.5;
    this.strokePath(ctx, sp, prog);
    ctx.strokeStyle = `rgba(255,255,255,${0.85 * env})`;
    ctx.lineWidth = 1.4;
    this.strokePath(ctx, sp, prog);
    if (prog < 1) {
      const head = sp[Math.min(sp.length - 1, Math.floor(sp.length * prog))];
      const s = 26;
      ctx.drawImage(this.sprite(hue), head.x - s / 2, head.y - s / 2, s, s);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawHalo(ctx: CanvasRenderingContext2D, r: Running, t: number, gx: number, gy: number, gr: number, hue: MoteHue): void {
    const env = envelope(t, r.dur, 0.25, 1.4);
    const c = this.toScreen({ x: gx, y: gy });
    const s = this.camera.scale;
    const grow = r.rm ? 1 : 1 + 0.6 * (1 - ease(t / 0.7));
    const breathe = r.rm ? 1 : 1 + 0.035 * Math.sin(t * 2.4);
    const rad = Math.max(14, gr * s) * grow * breathe;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(c.x, c.y, rad * 0.75, c.x, c.y, rad * 1.45);
    g.addColorStop(0, rgba(hue, 0));
    g.addColorStop(0.35, rgba(hue, 0.16 * env));
    g.addColorStop(1, rgba(hue, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, rad * 1.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(hue, 0.85 * env);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(c.x, c.y, rad, 0, Math.PI * 2);
    ctx.stroke();
    // Reticle ticks, turning slowly.
    const rot = r.rm ? 0 : t * 0.35;
    ctx.strokeStyle = rgba(hue, 0.55 * env);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = rot + (i / 12) * Math.PI * 2;
      const r0 = rad + 4;
      const r1 = rad + (i % 3 === 0 ? 11 : 7);
      ctx.moveTo(c.x + Math.cos(a) * r0, c.y + Math.sin(a) * r0);
      ctx.lineTo(c.x + Math.cos(a) * r1, c.y + Math.sin(a) * r1);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  private star(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, a: number): void {
    ctx.drawImage(this.sprite('silver'), x - size, y - size, size * 2, size * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.75 * a})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - size * 1.3, y);
    ctx.lineTo(x + size * 1.3, y);
    ctx.moveTo(x, y - size * 1.3);
    ctx.lineTo(x, y + size * 1.3);
    ctx.stroke();
  }

  private drawConstellation(ctx: CanvasRenderingContext2D, r: Running, t: number, pts: GridPt[], label: Text | null, closed: boolean): void {
    if (pts.length < 2) return;
    const env = envelope(t, r.dur, 0.4, 1.8);
    const sp = pts.map((p) => this.toScreen(p));
    const segs = closed ? sp.length : sp.length - 1;
    const prog = r.rm ? segs : Math.min(segs, Math.max(0, (t - 0.5) / 0.45));
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < Math.ceil(prog); i++) {
      const a = sp[i];
      const b = sp[(i + 1) % sp.length];
      if (Math.abs(a.x - b.x) > this.w / 2 || Math.abs(a.y - b.y) > this.h / 2) continue;
      const f = Math.min(1, prog - i);
      ctx.strokeStyle = `rgba(200,220,255,${0.13 * env})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
      ctx.stroke();
      ctx.strokeStyle = `rgba(220,232,255,${0.6 * env})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
      ctx.stroke();
    }
    sp.forEach((p, i) => {
      const appear = r.rm ? 1 : ease((t - i * 0.12) / 0.5);
      const tw = r.rm ? 1 : 0.8 + 0.2 * Math.sin(t * 3 + i * 1.7);
      this.star(ctx, p.x, p.y, 9 * appear * tw, env * appear);
    });
    ctx.globalCompositeOperation = 'source-over';
    if (label) {
      const top = sp.reduce((m, p) => (p.y < m.y ? p : m), sp[0]);
      const la = env * (r.rm ? 1 : ease((t - 0.5 - segs * 0.45) / 0.8));
      if (la > 0.01) {
        ctx.font = "600 11px 'JetBrains Mono', ui-monospace, Menlo, monospace";
        (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '2.5px';
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(220,232,255,${0.85 * la})`;
        ctx.shadowColor = 'rgba(120,170,255,0.8)';
        ctx.shadowBlur = 10;
        const cx = sp.reduce((s, p) => s + p.x, 0) / sp.length;
        ctx.fillText(label[this.lang()].toUpperCase(), cx, Math.max(16, top.y - 22));
        ctx.shadowBlur = 0;
        (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px';
      }
    }
  }

  private drawAurora(ctx: CanvasRenderingContext2D, r: Running, t: number, d: { x: number; y: number; w: number; h: number }): void {
    const env = envelope(t, r.dur, 2.2, 3.5);
    if (env <= 0) return;
    // Low-resolution buffer, scaled up: the softness is free.
    const lw = Math.max(32, Math.round(d.w / 4));
    const lh = Math.max(32, Math.round(d.h / 4));
    if (!this.aurora) this.aurora = document.createElement('canvas');
    const buf = this.aurora;
    if (buf.width !== lw || buf.height !== lh) {
      buf.width = lw;
      buf.height = lh;
    }
    const g = buf.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, lw, lh);
    g.globalCompositeOperation = 'lighter';
    const tm = r.rm ? 4 : t;
    // Each curtain: a wavy lower edge (bright green, like real aurorae) with rays rising and
    // fading into violet. Columns vary in height and brightness (the "rays").
    const curtains: { base: number; amp: number; len: number; lo: string; hi: string; sp: number; ph: number; k: number }[] = [
      { base: 0.34, amp: 0.06, len: 0.3, lo: '70,255,170', hi: '120,110,255', sp: 0.42, ph: 0, k: 1 },
      { base: 0.26, amp: 0.05, len: 0.24, lo: '90,240,210', hi: '200,110,255', sp: 0.31, ph: 2.1, k: 0.75 },
      { base: 0.44, amp: 0.04, len: 0.2, lo: '60,230,150', hi: '80,160,255', sp: 0.55, ph: 4.2, k: 0.55 },
    ];
    for (const c of curtains) {
      for (let x = 0; x < lw; x++) {
        const u = x / lw;
        const edge = (c.base + Math.sin(u * 4.6 + tm * c.sp + c.ph) * c.amp + Math.sin(u * 11 - tm * c.sp * 1.6 + c.ph) * c.amp * 0.4) * lh;
        const ray = 0.45 + 0.55 * Math.abs(Math.sin(u * 37 + tm * 0.9 + c.ph) * Math.sin(u * 17 - tm * 0.35));
        const len = c.len * lh * (0.55 + 0.45 * Math.sin(u * 8 + tm * 0.5 + c.ph * 2)) * (0.7 + 0.3 * ray);
        const fold = 0.6 + 0.4 * Math.sin(u * 3.1 - tm * 0.25 + c.ph); // brightness along the curtain
        const a = c.k * fold * ray;
        const grad = g.createLinearGradient(0, edge + 2, 0, edge - len);
        grad.addColorStop(0, `rgba(${c.lo},0)`);
        grad.addColorStop(0.06, `rgba(${c.lo},${(0.95 * a).toFixed(3)})`);
        grad.addColorStop(0.3, `rgba(${c.lo},${(0.45 * a).toFixed(3)})`);
        grad.addColorStop(0.7, `rgba(${c.hi},${(0.22 * a).toFixed(3)})`);
        grad.addColorStop(1, `rgba(${c.hi},0)`);
        g.fillStyle = grad;
        g.fillRect(x, edge - len, 1, len + 2);
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    // Two passes: a wide soft glow, then the curtains themselves.
    ctx.globalAlpha = env * 0.45;
    ctx.drawImage(buf, d.x - d.w * 0.02, d.y - d.h * 0.015, d.w * 1.04, d.h * 1.03);
    ctx.globalAlpha = env * 0.85;
    ctx.drawImage(buf, d.x, d.y, d.w, d.h);
    // A few stars above the curtains.
    ctx.globalAlpha = env;
    for (let i = 0; i < 22; i++) {
      const sx = d.x + hash(i * 5.3) * d.w;
      const sy = d.y + hash(i * 9.1) * d.h * 0.32;
      const tw = r.rm ? 0.7 : 0.4 + 0.6 * Math.abs(Math.sin(t * (0.8 + hash(i) * 1.6) + i));
      const s = 2 + hash(i * 2.7) * 4;
      ctx.globalAlpha = env * tw * 0.8;
      ctx.drawImage(this.sprite('silver'), sx - s, sy - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawGlider(ctx: CanvasRenderingContext2D, r: Running, t: number, gx: number, gy: number): void {
    const st = r.glider!;
    const GEN = 0.3;
    const want = r.rm ? 0 : Math.floor(t / GEN);
    while (st.gen < want) {
      st.trail.unshift(st.cells);
      if (st.trail.length > 10) st.trail.pop();
      st.cells = lifeStep(st.cells);
      st.gen++;
    }
    const env = envelope(t, r.dur, 0.4, 1.5);
    const cellGrid = Math.max(6, 22 / Math.max(0.5, this.camera.scale)); // ≥ ~22 px per Life cell
    const s = this.camera.scale * cellGrid;
    const phase = r.rm ? 1 : (t % GEN) / GEN;
    const draw = (cells: Set<string>, alpha: number, core: boolean) => {
      for (const k of cells) {
        const [cx, cy] = k.split(',').map(Number);
        const p = this.toScreen({ x: gx + (cx - 1.5) * cellGrid, y: gy + (cy - 1.5) * cellGrid });
        const pad = s * 0.1;
        ctx.globalAlpha = alpha;
        ctx.drawImage(this.sprite('green'), p.x - s, p.y - s, s * 2, s * 2);
        if (core) {
          ctx.fillStyle = 'rgba(190,255,205,0.9)';
          ctx.fillRect(p.x - s / 2 + pad, p.y - s / 2 + pad, s - 2 * pad, s - 2 * pad);
        } else {
          ctx.strokeStyle = 'rgba(160,255,190,0.7)';
          ctx.lineWidth = 1;
          ctx.strokeRect(p.x - s / 2 + pad, p.y - s / 2 + pad, s - 2 * pad, s - 2 * pad);
        }
      }
    };
    ctx.globalCompositeOperation = 'lighter';
    st.trail.forEach((cells, i) => draw(cells, env * 0.22 * (1 - i / st.trail.length) * (i === 0 ? 1 - phase * 0.5 : 1), false));
    draw(st.cells, env * (0.6 + 0.4 * Math.min(1, phase * 3)), true);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawMoon(ctx: CanvasRenderingContext2D, r: Running, t: number, d: { x: number; y: number; w: number; h: number }, illum: number, waxing: boolean): void {
    const env = envelope(t, r.dur, 1.6, 2.4);
    const R = Math.min(d.w, d.h) * 0.075;
    const cx = d.x + d.w * 0.76;
    const cy = d.y + d.h * 0.15 + (r.rm ? 0 : Math.sin(t * 0.4) * 1.5);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = env;
    ctx.drawImage(this.moonSprite(R, 'halo'), cx - R * 4.2, cy - R * 4.2, R * 8.4, R * 8.4);
    ctx.globalAlpha = 1;
    // Moonlight on the "water": a soft column below the moon with a few drifting glints.
    const top = cy + R * 1.6;
    const bottom = d.y + d.h;
    if (bottom > top) {
      // Soft column: horizontal falloff, fading with depth (strips, no hard edges).
      const span = Math.min(bottom - top, d.h * 0.55);
      const hw = R * 1.1;
      const hg = ctx.createLinearGradient(cx - hw, 0, cx + hw, 0);
      hg.addColorStop(0, 'rgba(214,226,255,0)');
      hg.addColorStop(0.5, 'rgba(214,226,255,1)');
      hg.addColorStop(1, 'rgba(214,226,255,0)');
      ctx.fillStyle = hg;
      const strips = 24;
      for (let k = 0; k < strips; k++) {
        const f = 1 - k / strips;
        ctx.globalAlpha = 0.09 * f * f * env;
        ctx.fillRect(cx - hw, top + (k * span) / strips, hw * 2, span / strips + 0.5);
      }
      ctx.globalAlpha = 1;
      for (let i = 0; i < 14; i++) {
        const v = hash(i * 3.7 + 1);
        const yy = top + v * v * Math.min(bottom - top, d.h * 0.5);
        const fall = 1 - (yy - top) / Math.min(bottom - top, d.h * 0.5);
        const tw = r.rm ? 0.6 : 0.5 + 0.5 * Math.sin(t * (1.5 + hash(i) * 2) + i * 2.3);
        const wob = r.rm ? 0 : Math.sin(t * 1.3 + i) * R * 0.3;
        const len = R * (0.25 + 0.6 * hash(i * 9.1)) * (0.4 + fall);
        ctx.globalAlpha = 0.5 * fall * tw * env;
        ctx.drawImage(this.glint(), cx - len + wob, yy, len * 2, 1.5);
      }
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
    // Disc (with craters), pre-rendered.
    ctx.globalAlpha = env;
    ctx.drawImage(this.moonSprite(R, 'disc'), cx - R, cy - R, R * 2, R * 2);
    ctx.globalAlpha = 1;
    // Terminator (skip when practically full).
    if (illum < 0.97) {
      const k = 1 - 2 * illum; // +1 new … −1 full
      ctx.fillStyle = `rgba(11,14,18,${0.82 * env})`;
      ctx.beginPath();
      const dark = waxing ? -1 : 1; // dark limb on the left while waxing
      ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, dark < 0);
      ctx.ellipse(cx, cy, Math.abs(k) * R, R, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === dark < 0);
      ctx.fill();
    }
  }

  /** Horizontal glint (bright centre, transparent ends) for the moonlight on the water. */
  private glint(): HTMLCanvasElement {
    let c = this.cache.get('glint');
    if (!c) {
      c = document.createElement('canvas');
      c.width = 64;
      c.height = 2;
      const g = c.getContext('2d')!;
      const lg = g.createLinearGradient(0, 0, 64, 0);
      lg.addColorStop(0, 'rgba(230,238,255,0)');
      lg.addColorStop(0.5, 'rgba(230,238,255,1)');
      lg.addColorStop(1, 'rgba(230,238,255,0)');
      g.fillStyle = lg;
      g.fillRect(0, 0, 64, 2);
      this.cache.set('glint', c);
    }
    return c;
  }

  private moonSprite(R: number, part: 'halo' | 'disc'): HTMLCanvasElement {
    const key = `moon:${part}:${Math.round(R)}`;
    let c = this.cache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    const k = Math.min(2, window.devicePixelRatio || 1);
    if (part === 'halo') {
      const S = Math.max(8, Math.round(R * 8.4 * k * 0.5)); // half resolution: it is a blur
      c.width = c.height = S;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(S / 2, S / 2, (S / 2) * (0.8 / 4.2), S / 2, S / 2, S / 2);
      grad.addColorStop(0, 'rgba(210,222,255,0.22)');
      grad.addColorStop(1, 'rgba(210,222,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, S, S);
    } else {
      const S = Math.max(8, Math.round(R * 2 * k));
      c.width = c.height = S;
      const g = c.getContext('2d')!;
      const r = S / 2;
      const disc = g.createRadialGradient(r - r * 0.3, r - r * 0.3, r * 0.1, r, r, r);
      disc.addColorStop(0, 'rgb(250,248,240)');
      disc.addColorStop(1, 'rgb(196,206,226)');
      g.fillStyle = disc;
      g.beginPath();
      g.arc(r, r, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(120,132,160,0.12)';
      for (const [ox, oy, rr] of [
        [-0.3, -0.25, 0.22],
        [0.28, 0.12, 0.3],
        [-0.1, 0.42, 0.14],
        [0.35, -0.38, 0.1],
      ]) {
        g.beginPath();
        g.arc(r + ox * r, r + oy * r, rr * r, 0, Math.PI * 2);
        g.fill();
      }
    }
    this.cache.set(key, c);
    return c;
  }

  private drawPulse(ctx: CanvasRenderingContext2D, r: Running, t: number, d: { x: number; y: number; w: number; h: number }, hue: MoteHue, beats: number): void {
    const period = r.dur / Math.max(1, beats);
    const ph = (t % period) / period;
    // lub-dub: two bumps per beat.
    const bump = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2));
    const k = r.rm ? 0.5 * envelope(t, r.dur, 0.6, 1) : 0.22 + bump(ph, 0.12, 0.07) + 0.7 * bump(ph, 0.34, 0.07);
    const a = Math.min(1, k) * envelope(t, r.dur, 0.1, 0.6);
    if (a <= 0.01) return;
    const key = `pulse:${hue}:${Math.round(d.w)}x${Math.round(d.h)}`;
    let v = this.cache.get(key);
    if (!v) {
      // Quarter-resolution vignette, drawn once and scaled (smooth anyway).
      v = document.createElement('canvas');
      v.width = Math.max(8, Math.round(d.w / 4));
      v.height = Math.max(8, Math.round(d.h / 4));
      const g = v.getContext('2d')!;
      const R = (Math.max(v.width, v.height) / 2) * 1.05;
      const grad = g.createRadialGradient(v.width / 2, v.height / 2, R * 0.5, v.width / 2, v.height / 2, R);
      grad.addColorStop(0, rgba(hue, 0));
      grad.addColorStop(0.55, rgba(hue, 0.12));
      grad.addColorStop(1, rgba(hue, 0.55));
      g.fillStyle = grad;
      g.fillRect(0, 0, v.width, v.height);
      this.cache.set(key, v);
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    ctx.drawImage(v, d.x, d.y, d.w, d.h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawWhisper(ctx: CanvasRenderingContext2D, r: Running, t: number, d: { x: number; y: number; w: number; h: number }, text: Text): void {
    const env = envelope(t, r.dur, 0.7, 1.0);
    if (env <= 0.01) return;
    const y = d.y + d.h * 0.7 - (r.rm ? 0 : t * 2.5);
    const size = Math.max(15, Math.min(20, d.w / 20));
    const bed = ctx.createRadialGradient(d.x + d.w / 2, y, 0, d.x + d.w / 2, y, Math.min(d.w * 0.45, 220));
    bed.addColorStop(0, `rgba(7,9,12,${0.55 * env})`);
    bed.addColorStop(1, 'rgba(7,9,12,0)');
    ctx.fillStyle = bed;
    ctx.save();
    ctx.translate(d.x + d.w / 2, y);
    ctx.scale(1, 0.32);
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(d.w * 0.45, 220), 0, Math.PI * 2);
    ctx.restore();
    ctx.fill();
    ctx.font = `italic 500 ${size}px Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`;
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0.6px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(91,192,235,0.75)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = `rgba(230,237,243,${0.92 * env})`;
    ctx.fillText(text[this.lang()], d.x + d.w / 2, y, d.w - 32);
    ctx.shadowBlur = 0;
    (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px';
  }

  private drawRipple(ctx: CanvasRenderingContext2D, r: Running, t: number, d: { x: number; y: number; w: number; h: number }, gx: number | null, gy: number | null): void {
    const c = gx !== null && gy !== null ? this.toScreen({ x: gx, y: gy }) : { x: d.x + d.w / 2, y: d.y + d.h / 2 };
    const maxR = Math.hypot(d.w, d.h) * 0.55;
    const rings = r.rm ? 1 : 4;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < rings; i++) {
      const lt = t - i * 0.28;
      if (lt <= 0) continue;
      const u = lt / (r.dur - i * 0.28);
      if (u >= 1) continue;
      const rad = (r.rm ? 0.4 : ease(u)) * maxR;
      const a = (1 - u) * 0.55;
      ctx.strokeStyle = `rgba(150,215,245,${a})`;
      ctx.lineWidth = 1.6 * (1 - u) + 0.4;
      ctx.beginPath();
      for (let k = 0; k <= 72; k++) {
        const ang = (k / 72) * Math.PI * 2;
        const wob = r.rm ? 0 : Math.sin(ang * 6 + t * 5 + i) * 2.2 * (1 - u);
        const x = c.x + Math.cos(ang) * (rad + wob);
        const y = c.y + Math.sin(ang) * (rad + wob);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
