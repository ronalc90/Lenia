/**
 * Ending cinematics (~30–40 s each, skippable): a canvas animation built from
 * the real catalog creatures, poetic text cards, dawn, a closing line, a
 * credits roll and "Continue the experiment". Deterministic in time (seekable
 * for screenshots). Reduce motion: still frames that cross-fade.
 *
 *  harvest  many species → one shape copied in rows, a counter, a stamp, cold dawn
 *  law      chaos → perfect orbits → a six-fold mandala that crystallises, a prism of dawn
 *  memory   creatures rise like lanterns and become a named constellation, warm dawn
 *  tide     they multiply, mutate and spill over the rim; the microscope light goes off; aurora
 *  albor    three taps answered by all; the Spark rises to become the sun; two figures at
 *           dawn; pull back: the station's lights form an Orbium inside someone's eyepiece
 */
import type { Lang } from '../../core/types';
import { ENDINGS } from '../../story/endings';
import type { EndingId } from '../../story/types';
import { catalogPattern } from '../../sim/catalog';
import { drawVela, type PortraitState } from './portraits';
import { SPRITE_CODES, sprite, tinted, type Sprite } from './sprites';
import { S, tr } from './strings';

const TAU = Math.PI * 2;
const TITLE_END = 4.0;
const CARD = 5.6;
const CREDITS_SPEED = 34; // px/s

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Agent {
  sp: Sprite;
  ax: number;
  ay: number;
  fx: number;
  fy: number;
  px: number;
  py: number;
  scale: number;
  hue: string | null;
  born: number;
}

function agentPos(a: Agent, t: number): { x: number; y: number; ang: number } {
  const x = a.ax * Math.sin(a.fx * t + a.px);
  const y = a.ay * Math.sin(a.fy * t + a.py);
  const dx = a.ax * a.fx * Math.cos(a.fx * t + a.px);
  const dy = a.ay * a.fy * Math.cos(a.fy * t + a.py);
  return { x, y, ang: Math.atan2(dy, dx) };
}

export interface CinematicOpts {
  lang(): Lang;
  rm(): boolean;
  onDone(): void;
}

export class Cinematic {
  readonly el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private titleEl: HTMLDivElement;
  private cardEl: HTMLDivElement;
  private creditsEl: HTMLDivElement;
  private creditsInner: HTMLDivElement;
  private goBtn: HTMLButtonElement;
  private skipBtn: HTMLButtonElement;
  private t = 0;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private shownCard = -2;
  private stars: { x: number; y: number; r: number; tw: number }[] = [];
  private agents: Agent[] = [];
  private extra: Agent[] = [];
  private orbiumDots: { x: number; y: number; v: number }[] = [];
  private readonly closingAt: number;
  private readonly creditsAt: number;
  private done = false;

  constructor(
    parent: HTMLElement,
    readonly id: EndingId,
    private opts: CinematicOpts,
  ) {
    const def = ENDINGS[id];
    this.closingAt = TITLE_END + def.cards.length * CARD + 0.4;
    this.creditsAt = this.closingAt + 5.5;
    this.el = document.createElement('div');
    this.el.className = `sty-end end-${id}`;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-live', 'polite');
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'sty-end-title';
    this.cardEl = document.createElement('div');
    this.cardEl.className = 'sty-end-card';
    this.creditsEl = document.createElement('div');
    this.creditsEl.className = 'sty-end-credits';
    this.creditsInner = document.createElement('div');
    this.creditsInner.className = 'inner';
    this.creditsEl.appendChild(this.creditsInner);
    this.skipBtn = document.createElement('button');
    this.skipBtn.type = 'button';
    this.skipBtn.className = 'sty-end-skip';
    this.skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.skip();
    });
    this.goBtn = document.createElement('button');
    this.goBtn.type = 'button';
    this.goBtn.className = 'sty-end-go';
    this.goBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.finish();
    });
    this.el.append(this.canvas, this.titleEl, this.cardEl, this.creditsEl, this.skipBtn, this.goBtn);
    parent.appendChild(this.el);
    this.relabel();
    this.build();
    requestAnimationFrame(() => this.el.classList.add('show'));
  }

  private build(): void {
    const r = rng(this.id.length * 7919 + 17);
    this.stars = Array.from({ length: 140 }, () => ({ x: r(), y: r() * 0.78, r: 0.3 + r() * 1.2, tw: r() * TAU }));
    const codes = [...SPRITE_CODES];
    this.agents = codes.map((code) => ({
      sp: sprite(code, 96),
      ax: 0.35 + r() * 0.35,
      ay: 0.35 + r() * 0.35,
      fx: 0.18 + r() * 0.22,
      fy: 0.15 + r() * 0.25,
      px: r() * TAU,
      py: r() * TAU,
      scale: code === '3GH2n' || code === 'K4d' ? 1.1 : 0.85 + r() * 0.25,
      hue: null,
      born: 0,
    }));
    if (this.id === 'tide') {
      const hues = ['#6EE7C8', '#5BC0EB', '#8AE234', '#9EF0FF', '#B892FF'];
      this.extra = Array.from({ length: 64 }, (_, i) => ({
        sp: sprite(codes[i % codes.length], 96),
        ax: 0.4 + r() * 1.8,
        ay: 0.3 + r() * 1.2,
        fx: 0.12 + r() * 0.3,
        fy: 0.1 + r() * 0.3,
        px: r() * TAU,
        py: r() * TAU,
        scale: 0.45 + r() * 0.7,
        hue: hues[i % hues.length],
        born: r(),
      }));
    }
    if (this.id === 'albor') {
      const p = catalogPattern('O2u');
      const pts: { x: number; y: number; v: number }[] = [];
      for (let y = 0; y < p.h; y++)
        for (let x = 0; x < p.w; x++) {
          const v = p.data[y * p.w + x];
          if (v > 0.12) pts.push({ x: (x + (r() - 0.5) * 0.5) / p.w - 0.5, y: (y + (r() - 0.5) * 0.5) / p.h - 0.5, v });
        }
      // A few scattered lights: the rest of the island.
      for (let i = 0; i < 40; i++) pts.push({ x: (r() - 0.5) * 1.6, y: (r() - 0.5) * 1.6, v: r() * 0.25 });
      this.orbiumDots = pts;
    }
  }

  relabel(): void {
    const L = this.opts.lang();
    const def = ENDINGS[this.id];
    this.titleEl.textContent = tr(def.title, L);
    this.skipBtn.textContent = `${tr(S.skip, L)} ›`;
    this.goBtn.textContent = tr(S.continueExp, L);
    this.creditsInner.innerHTML = '';
    S.credits.forEach((c, i) => {
      const el = document.createElement(i === 0 ? 'b' : 'p');
      el.textContent = tr(c, L);
      this.creditsInner.appendChild(el);
    });
    this.shownCard = -2;
  }

  get time(): number {
    return this.t;
  }

  /** Jump to time `t` (dev / screenshots). */
  seek(t: number): void {
    this.t = t;
    this.draw();
  }

  skip(): void {
    if (this.t < this.closingAt) this.t = this.closingAt;
    this.goBtn.classList.add('show');
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.el.classList.remove('show');
    setTimeout(() => this.el.remove(), 700);
    this.opts.onDone();
  }

  dispose(): void {
    this.done = true;
    this.el.remove();
  }

  frame(dt: number): void {
    if (this.done) return;
    this.t += Math.min(dt, 0.1);
    this.draw();
  }

  private resize(): void {
    const W = this.el.clientWidth || 360;
    const H = this.el.clientHeight || 640;
    const dpr = Math.min(2, (globalThis.devicePixelRatio as number | undefined) ?? 1);
    if (W !== this.W || H !== this.H || dpr !== this.dpr) {
      this.W = W;
      this.H = H;
      this.dpr = dpr;
      this.canvas.width = Math.round(W * dpr);
      this.canvas.height = Math.round(H * dpr);
    }
  }

  // ───────────── text timeline ─────────────

  private texts(): void {
    const t = this.t;
    const def = ENDINGS[this.id];
    const L = this.opts.lang();
    const titleA = smooth(0.3, 1.2, t) * (1 - smooth(TITLE_END - 1, TITLE_END - 0.2, t));
    this.titleEl.style.opacity = titleA.toFixed(3);
    let idx = -1;
    let a = 0;
    if (t >= TITLE_END && t < this.closingAt) {
      idx = Math.floor((t - TITLE_END) / CARD);
      const local = t - TITLE_END - idx * CARD;
      a = smooth(0, 0.9, local) * (1 - smooth(CARD - 0.9, CARD - 0.05, local));
      // The short breath between the last card and the closing line.
      if (idx >= def.cards.length) {
        idx = -1;
        a = 0;
      }
    } else if (t >= this.closingAt) {
      idx = 99;
      a = smooth(this.closingAt, this.closingAt + 1.6, t) * (1 - smooth(this.creditsAt - 0.5, this.creditsAt + 1, t));
    }
    if (idx !== this.shownCard) {
      this.shownCard = idx;
      this.cardEl.classList.toggle('closing', idx === 99);
      this.cardEl.textContent = idx === 99 ? tr(def.closing, L) : idx >= 0 ? tr(def.cards[idx], L) : '';
    }
    this.cardEl.style.opacity = a.toFixed(3);
    if (t >= this.closingAt + 3.5) this.goBtn.classList.add('show');
    this.skipBtn.style.opacity = t >= this.closingAt ? '0' : '1';
    this.skipBtn.style.pointerEvents = t >= this.closingAt ? 'none' : 'auto';
    // Credits: scroll up through the window once, then rest centred in it.
    const winH = this.creditsEl.clientHeight || this.H * 0.6;
    const inH = this.creditsInner.offsetHeight || 300;
    const rest = Math.max(0, (winH - inH) / 2);
    const rm = this.opts.rm();
    const y = rm ? rest : Math.max(rest, winH - Math.max(0, t - this.creditsAt) * CREDITS_SPEED);
    this.creditsInner.style.transform = `translate(-50%, ${y.toFixed(1)}px)`;
    this.creditsEl.style.opacity = t > this.creditsAt ? (rm ? '1' : smooth(this.creditsAt, this.creditsAt + 1, t).toFixed(3)) : '0';
  }

  // ───────────── drawing ─────────────

  private draw(): void {
    this.resize();
    this.texts();
    const ctx = this.ctx;
    if (!ctx) return;
    const rm = this.opts.rm();
    // Reduce motion: a still per card (motion time frozen in its middle).
    let tm = this.t;
    if (rm) {
      if (tm < TITLE_END) tm = 2;
      else if (tm < this.closingAt) tm = TITLE_END + (Math.floor((tm - TITLE_END) / CARD) + 0.7) * CARD;
      else tm = this.closingAt + 2;
    }
    const p = clamp((tm - TITLE_END) / (this.closingAt - TITLE_END));
    const dawn = smooth(this.closingAt - 7, this.closingAt + 3, tm);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const { W, H } = this;
    this.sky(ctx, W, H, tm, dawn);
    switch (this.id) {
      case 'harvest':
        this.harvest(ctx, W, H, tm, p);
        break;
      case 'law':
        this.law(ctx, W, H, tm, p, dawn);
        break;
      case 'memory':
        this.memory(ctx, W, H, tm, p);
        break;
      case 'tide':
        this.tide(ctx, W, H, tm, p);
        break;
      case 'albor':
        this.albor(ctx, W, H, tm, p);
        break;
    }
    // A soft shadow behind the card so text stays readable over busy scenes.
    const cardA = Number(this.cardEl.style.opacity || 0);
    if (cardA > 0.01) {
      const cr = this.cardEl.getBoundingClientRect();
      const er = this.el.getBoundingClientRect();
      const ccx = cr.left - er.left + cr.width / 2;
      const ccy = cr.top - er.top + cr.height / 2;
      const rx = Math.max(cr.width * 0.75, 120);
      ctx.save();
      ctx.translate(ccx, ccy);
      ctx.scale(1, Math.max(0.25, (cr.height + 50) / (rx * 2)));
      const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      sh.addColorStop(0, `rgba(3,4,8,${(0.55 * cardA).toFixed(3)})`);
      sh.addColorStop(1, 'rgba(3,4,8,0)');
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    // The scene steps back for the credits.
    const back = smooth(this.creditsAt - 0.5, this.creditsAt + 2.5, this.t) * 0.86;
    if (back > 0) {
      ctx.fillStyle = `rgba(4,6,10,${back.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    // Vignette.
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    // Fade in from black.
    const fin = 1 - smooth(0, 1.4, this.t);
    if (fin > 0) {
      ctx.fillStyle = `rgba(4,6,10,${fin.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  private dawnColor(): [string, string] {
    switch (this.id) {
      case 'harvest':
        return ['#C8C2B0', '#6D6A62'];
      case 'law':
        return ['#EBDDFF', '#7A5FB8'];
      case 'memory':
        return ['#FFE2A8', '#C27A3A'];
      case 'tide':
        return ['#D8FFF0', '#2E9E8C'];
      case 'albor':
        return ['#FFE9C7', '#FF9F5A'];
    }
  }

  private sky(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, dawn: number): void {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#03050A');
    g.addColorStop(0.6, '#070B16');
    g.addColorStop(1, '#0D1328');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const rm = this.opts.rm();
    for (const s of this.stars) {
      const tw = rm ? 0.8 : 0.55 + 0.45 * Math.sin(t * 1.3 + s.tw);
      ctx.globalAlpha = tw * (1 - dawn * 0.75);
      ctx.fillStyle = '#DCE8FF';
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (dawn > 0) {
      const [hi, lo] = this.dawnColor();
      const hy = H * 0.86;
      const dg = ctx.createLinearGradient(0, hy - H * 0.6 * dawn, 0, H);
      dg.addColorStop(0, 'rgba(0,0,0,0)');
      dg.addColorStop(0.55, this.rgba(lo, 0.35 * dawn));
      dg.addColorStop(0.85, this.rgba(hi, 0.75 * dawn));
      dg.addColorStop(1, this.rgba(hi, 0.9 * dawn));
      ctx.fillStyle = dg;
      ctx.fillRect(0, 0, W, H);
      // Horizon line.
      ctx.strokeStyle = this.rgba(hi, 0.8 * dawn);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, hy);
      ctx.lineTo(W, hy);
      ctx.stroke();
    }
  }

  private rgba(hex: string, a: number): string {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a).toFixed(3)})`;
  }

  private dishGeom(W: number, H: number): { cx: number; cy: number; R: number } {
    return { cx: W / 2, cy: H * 0.42, R: Math.min(W * 0.4, H * 0.27) };
  }

  private drawDish(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, alpha: number, broken = 0): void {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
    g.addColorStop(0, 'rgba(20,28,52,0.55)');
    g.addColorStop(1, 'rgba(8,12,22,0.75)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();
    ctx.shadowColor = '#5BC0EB';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = 'rgba(175,235,255,0.7)';
    ctx.lineWidth = 2;
    if (broken > 0) ctx.setLineDash([Math.max(2, 40 * (1 - broken)), 8 + broken * 30]);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, R - 6, Math.PI * 1.1, Math.PI * 1.45);
    ctx.stroke();
    ctx.restore();
  }

  private drawSprite(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, size: number, ang: number, alpha: number): void {
    if (alpha <= 0.01 || size <= 0.5) return;
    ctx.save();
    ctx.globalAlpha = clamp(alpha);
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  private ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number, w = 1.6): void {
    if (a <= 0) return;
    ctx.strokeStyle = this.rgba(color, a);
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
  }

  // ═════════════ HARVEST ═════════════
  private harvest(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, p: number): void {
    const { cx, cy, R } = this.dishGeom(W, H);
    this.drawDish(ctx, cx, cy, R, 1);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R - 2, 0, TAU);
    ctx.clip();
    const sz = R * 0.34;
    const others = 1 - smooth(0.25, 0.45, p);
    for (const a of this.agents.slice(1)) {
      const q = agentPos(a, t);
      this.drawSprite(ctx, a.sp.canvas, cx + q.x * R, cy + q.y * R, sz * a.scale, q.ang, others);
    }
    // The grid of copies.
    const orb = this.agents[0].sp;
    const grey = tinted(orb, '#BFAF8C', 0.85);
    const cols = 6;
    const cell = (R * 2) / cols;
    const fill = smooth(0.12, 0.62, p);
    const march = Math.sin(t * 1.3) * cell * 0.12;
    const drain = smooth(0.4, 0.85, p);
    let n = 0;
    const total = cols * cols;
    for (let j = 0; j < cols; j++)
      for (let i = 0; i < cols; i++) {
        const x = cx - R + cell * (i + 0.5) + march;
        const y = cy - R + cell * (j + 0.5);
        if ((x - cx) ** 2 + (y - cy) ** 2 > (R - cell * 0.3) ** 2) continue;
        const k = clamp(fill * total - n);
        n++;
        if (k <= 0) continue;
        const pop = 1 + (1 - k) * 0.4;
        this.drawSprite(ctx, orb.canvas, x, y, cell * 0.95 * k * pop, -Math.PI / 2, k * (1 - drain));
        this.drawSprite(ctx, grey, x, y, cell * 0.95 * k * pop, -Math.PI / 2, k * drain);
      }
    ctx.restore();
    // The counter.
    const shown = Math.floor(Math.pow(10, 1 + smooth(0.05, 0.95, p) * 8));
    ctx.save();
    ctx.font = `600 ${Math.round(Math.min(W, H) * 0.06)}px 'JetBrains Mono', ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = this.rgba('#F2A541', (0.25 + 0.55 * smooth(0.1, 0.3, p)) * smooth(TITLE_END - 0.5, TITLE_END + 0.5, t));
    ctx.fillText(shown.toLocaleString(this.opts.lang() === 'es' ? 'es-ES' : 'en-US'), W / 2, cy - R - Math.min(W, H) * 0.06);
    ctx.restore();
    // The Committee's plane crossing the dawn.
    const plane = smooth(0.7, 1, p);
    if (plane > 0 && plane < 1) {
      const px = lerp(-20, W + 20, plane);
      const py = H * 0.8 - Math.sin(plane * Math.PI) * 20;
      const blink = Math.sin(t * 8) > 0 ? 1 : 0.3;
      ctx.fillStyle = `rgba(255,120,90,${blink})`;
      ctx.beginPath();
      ctx.arc(px, py, 2.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(230,237,243,0.8)';
      ctx.fillRect(px - 9, py - 0.8, 18, 1.6);
    }
    // The stamp.
    const sAt = 0.74;
    if (p > sAt) {
      const k = clamp((p - sAt) / 0.035);
      const scale = lerp(2.4, 1, k * k);
      const shake = k < 1 ? 0 : Math.max(0, 1 - (p - sAt - 0.035) / 0.04) * 6;
      ctx.save();
      ctx.translate(cx + Math.sin(t * 60) * shake, cy + R * 0.15);
      ctx.rotate(-0.2);
      ctx.scale(scale, scale);
      ctx.globalAlpha = 0.9 * k;
      ctx.strokeStyle = '#E4572E';
      ctx.fillStyle = '#E4572E';
      ctx.lineWidth = 4;
      const w = R * 1.25;
      const h = R * 0.36;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 8);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 5);
      ctx.stroke();
      ctx.font = `800 ${Math.round(h * 0.42)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.opts.lang() === 'es' ? 'APROBADO' : 'APPROVED', 0, 2);
      ctx.restore();
    }
  }

  // ═════════════ LAW ═════════════
  private law(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, p: number, dawn: number): void {
    const { cx, cy, R } = this.dishGeom(W, H);
    this.drawDish(ctx, cx, cy, R, 1);
    const order = smooth(0.28, 0.6, p);
    const freeze = smooth(0.7, 1, p);
    // Time slows to a stop as the laws become perfect.
    const tt = 4 + (t - 4) * (1 - freeze * 0.85);
    const rings = [0.32, 0.58, 0.82];
    ctx.save();
    // Orbit guides + spokes.
    ctx.strokeStyle = this.rgba('#B892FF', 0.35 * order);
    ctx.lineWidth = 1;
    for (const rr of rings) {
      ctx.beginPath();
      ctx.arc(cx, cy, rr * R, 0, TAU);
      ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      ctx.strokeStyle = this.rgba('#B892FF', 0.12 * order);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, R - 2, 0, TAU);
    ctx.clip();
    const sz = R * 0.26;
    const violet = this.agents.map((a) => tinted(a.sp, '#B892FF', 0.55));
    this.agents.forEach((a, i) => {
      const wild = agentPos({ ...a, fx: a.fx * 2.2, fy: a.fy * 2.4 }, tt);
      const ring = i % 3;
      const slot = Math.floor(i / 3);
      const perRing = ring === 0 ? 2 : 3;
      const w = [0.9, 0.55, 0.35][ring];
      const ang = (slot / perRing) * TAU + w * tt;
      const ox = Math.cos(ang) * rings[ring];
      const oy = Math.sin(ang) * rings[ring];
      const x = lerp(wild.x, ox, order);
      const y = lerp(wild.y, oy, order);
      const heading = lerp(wild.ang, ang + Math.PI / 2, order);
      // Six-fold kaleidoscope copies: the mandala.
      for (let k = 0; k < 6; k++) {
        const rot = (k / 6) * TAU;
        const rx = x * Math.cos(rot) - y * Math.sin(rot);
        const ry = x * Math.sin(rot) + y * Math.cos(rot);
        const alpha = k === 0 ? 1 : 0.45 * order;
        this.drawSprite(ctx, k === 0 ? a.sp.canvas : violet[i], cx + rx * R, cy + ry * R, sz * a.scale, heading + rot, alpha);
      }
    });
    ctx.restore();
    // Crystal: hexagram + hexagon.
    const cr = smooth(0.62, 0.9, p);
    if (cr > 0) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(freeze * 0.2);
      ctx.strokeStyle = this.rgba('#E9DCFF', 0.75 * cr);
      ctx.shadowColor = '#B892FF';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 1.4;
      for (const off of [0, Math.PI]) {
        ctx.beginPath();
        for (let k = 0; k <= 3; k++) {
          const a = off - Math.PI / 2 + (k / 3) * TAU;
          const px = Math.cos(a) * R * 0.92 * cr;
          const py = Math.sin(a) * R * 0.92 * cr;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6) * TAU;
        const px = Math.cos(a) * R * 0.46 * cr;
        const py = Math.sin(a) * R * 0.46 * cr;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }
    // Prism: a beam of dawn splits into colours.
    if (dawn > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,250,240,${0.5 * dawn})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, H * 0.86);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      const cols = ['#FF6B6B', '#FFB86B', '#FFE66B', '#7BE07B', '#5BC0EB', '#9B7BFF'];
      cols.forEach((c, i) => {
        const a = -0.38 + i * 0.09;
        ctx.strokeStyle = this.rgba(c, 0.45 * dawn);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * W, cy + Math.sin(a) * W);
        ctx.stroke();
      });
      ctx.restore();
    }
  }

  // ═════════════ MEMORY ═════════════
  private memory(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, p: number): void {
    const { cx, cy, R } = this.dishGeom(W, H);
    const sink = smooth(0.3, 0.7, p);
    // The dish sinks and dims while they rise.
    const dcy = cy + sink * H * 0.16;
    const dR = R * (1 - sink * 0.3);
    this.drawDish(ctx, cx, dcy, dR, 1 - sink * 0.82);
    const n = this.agents.length;
    // A hand-placed constellation: a lantern arc across the upper sky.
    const layout = [
      [0.16, 0.33],
      [0.3, 0.19],
      [0.48, 0.27],
      [0.63, 0.12],
      [0.82, 0.21],
      [0.74, 0.37],
      [0.42, 0.41],
    ];
    const stars = layout.map(([x, y]) => ({ x: W * x, y: H * y }));
    const gold = this.agents.map((a) => tinted(a.sp, '#FFD166', 0.7));
    // Constellation lines.
    const lines = smooth(0.66, 0.9, p);
    if (lines > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(255,214,140,${0.45 * lines})`;
      ctx.lineWidth = 1;
      ctx.shadowColor = '#FFD166';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      const upto = lines * (n - 1);
      for (let i = 0; i < n - 1 && i < upto; i++) {
        const a = stars[i];
        const b = stars[i + 1];
        const f = clamp(upto - i);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(lerp(a.x, b.x, f), lerp(a.y, b.y, f));
      }
      ctx.stroke();
      ctx.restore();
    }
    this.agents.forEach((a, i) => {
      const q = agentPos(a, t);
      const sx = cx + q.x * dR * 0.8;
      const sy = dcy + q.y * dR * 0.8;
      // Each one lifts off in turn.
      const lift = smooth(0.3 + i * 0.045, 0.55 + i * 0.045, p);
      const sway = Math.sin(t * 1.4 + i) * 14 * (1 - lift) * lift * 4;
      const x = lerp(sx, stars[i].x, lift) + sway;
      const y = lerp(sy, stars[i].y, lift);
      const size = lerp(R * 0.3 * a.scale, R * 0.16, lift);
      if (lift > 0.02 && lift < 0.98) {
        ctx.save();
        ctx.strokeStyle = `rgba(255,209,102,${0.25 * (1 - lift)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo((x + sx) / 2 + 20, (y + sy) / 2, sx, sy);
        ctx.stroke();
        ctx.restore();
      }
      // Lantern glow.
      const gl = ctx.createRadialGradient(x, y, 0, x, y, size * 1.3);
      gl.addColorStop(0, `rgba(255,214,140,${0.45 * lift})`);
      gl.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = gl;
      ctx.beginPath();
      ctx.arc(x, y, size * 1.3, 0, TAU);
      ctx.fill();
      this.drawSprite(ctx, a.sp.canvas, x, y, size, lerp(q.ang, -Math.PI / 2, lift), 1 - lift * 0.6);
      this.drawSprite(ctx, gold[i], x, y, size, lerp(q.ang, -Math.PI / 2, lift), lift);
      const label = smooth(0.72 + i * 0.03, 0.85 + i * 0.03, p);
      if (label > 0) {
        ctx.save();
        ctx.globalAlpha = label * 0.85;
        ctx.fillStyle = '#FFE9C7';
        ctx.font = `italic 500 ${Math.round(Math.max(10, Math.min(W, H) * 0.028))}px Georgia, serif`;
        ctx.textAlign = x > W / 2 ? 'right' : 'left';
        ctx.fillText(a.sp.name, x + (x > W / 2 ? -size * 0.7 : size * 0.7), y + size * 0.65);
        ctx.restore();
      }
    });
  }

  // ═════════════ TIDE ═════════════
  private tide(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, p: number): void {
    const { cx, cy, R } = this.dishGeom(W, H);
    const spill = smooth(0.3, 0.75, p);
    const lightOff = smooth(0.76, 0.86, p);
    // Aurora.
    const aur = smooth(0.55, 0.95, p);
    if (aur > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let b = 0; b < 3; b++) {
        const base = H * (0.12 + b * 0.08);
        const g = ctx.createLinearGradient(0, base - 40, 0, base + 60);
        const col = ['#6EE7C8', '#5BC0EB', '#B892FF'][b];
        g.addColorStop(0, this.rgba(col, 0));
        g.addColorStop(0.5, this.rgba(col, 0.22 * aur));
        g.addColorStop(1, this.rgba(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, base + 60);
        for (let x = 0; x <= W; x += 12) ctx.lineTo(x, base + Math.sin(x * 0.012 + t * 0.4 + b * 2) * 26);
        ctx.lineTo(W, base + 60);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    // The microscope's light cone (switched off near the end).
    const cone = 1 - lightOff;
    if (cone > 0) {
      const g = ctx.createLinearGradient(0, 0, 0, cy + R);
      g.addColorStop(0, `rgba(230,245,255,${0.16 * cone})`);
      g.addColorStop(1, 'rgba(230,245,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.2, 0);
      ctx.lineTo(cx + R * 0.2, 0);
      ctx.lineTo(cx + R * 1.1, cy + R);
      ctx.lineTo(cx - R * 1.1, cy + R);
      ctx.closePath();
      ctx.fill();
    }
    this.drawDish(ctx, cx, cy, R, 1 - spill * 0.85, spill);
    const reach = 1 + spill * 2.4;
    const sz = R * 0.3;
    for (const a of this.agents) {
      const q = agentPos({ ...a, ax: a.ax * reach, ay: a.ay * reach }, t);
      this.drawSprite(ctx, a.sp.canvas, cx + q.x * R, cy + q.y * R, sz * a.scale, q.ang, 1);
    }
    // Mutated offspring, flowing out like a tide of light.
    this.extra.forEach((a, i) => {
      const appear = smooth(0.25 + a.born * 0.35, 0.35 + a.born * 0.35, p);
      if (appear <= 0) return;
      const flow = spill * (t * 0.05 + a.born) * W;
      const q = agentPos(a, t);
      let x = cx + q.x * R * (0.6 + spill) + flow;
      x = ((x % (W + 80)) + W + 80) % (W + 80) - 40;
      const y = cy + q.y * R * (0.5 + spill * 1.2) + spill * H * 0.12 * Math.sin(i);
      this.drawSprite(ctx, tinted(a.sp, a.hue ?? '#6EE7C8', 0.6), x, y, sz * a.scale, q.ang, appear * 0.9);
    });
  }

  // ═════════════ ALBOR (secret) ═════════════
  private albor(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, p: number): void {
    const { cx, cy, R } = this.dishGeom(W, H);
    const pull = smooth(0.74, 0.9, p);
    const land = smooth(0.42, 0.56, p);
    const hy = H * 0.6;
    const sunX = W * 0.64;
    const sceneA = 1 - pull;
    if (sceneA > 0) {
      ctx.save();
      const s = lerp(1, 0.05, pull);
      ctx.translate(W / 2, H * 0.45);
      ctx.scale(s, s);
      ctx.translate(-W / 2, -H * 0.45);
      ctx.globalAlpha = sceneA;
      if (land > 0) this.firstLight(ctx, W, H, t, p, land, hy, sunX);
      // Three taps, then everyone answers at once.
      const taps = [0.5, 1.2, 1.9];
      taps.forEach((at, i) => {
        const age = t - TITLE_END - at;
        if (age > 0 && age < 1.6) this.ring(ctx, cx + (i - 1) * 26, cy + R * 1.2, 6 + age * 40, '#FFFFFF', (1 - age / 1.6) * 0.9, 2);
      });
      const dishA = smooth(0.02, 0.12, p) * (1 - land);
      const dcy = cy - land * H * 0.1;
      this.drawDish(ctx, cx, dcy, R, dishA);
      const hues = ['#5BC0EB', '#B892FF', '#8AE234', '#FFD166', '#FF8FAB', '#6EE7C8', '#F2A541'];
      this.agents.forEach((a, i) => {
        const q = agentPos(a, t);
        const x = cx + q.x * R * 0.8;
        const y = dcy + q.y * R * 0.8;
        this.drawSprite(ctx, a.sp.canvas, x, y, R * 0.28 * a.scale, q.ang, dishA);
        const sing = smooth(0.1, 0.16, p) * dishA;
        for (let k = 0; k < 2; k++) {
          const ph = (((t * 0.7 + k * 0.5) % 1) + 1) % 1;
          this.ring(ctx, x, y, 8 + ph * R * 0.5, hues[i], (1 - ph) * 0.55 * sing);
        }
      });
      // The Spark leaves the dish and flies to the horizon, where the sun will rise.
      const rise = smooth(0.25, 0.55, p);
      const fade = 1 - smooth(0.52, 0.6, p);
      if (rise > 0 && fade > 0) {
        const path = (k: number) => ({
          x: lerp(cx, sunX, k),
          y: lerp(dcy, hy, k) - Math.sin(k * Math.PI) * H * 0.3,
        });
        for (let k = 16; k >= 0; k--) {
          const q = path(clamp(rise - k * 0.012));
          ctx.fillStyle = `rgba(255,214,120,${((1 - k / 17) * 0.6 * fade).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(q.x, q.y, 4 - k * 0.2, 0, TAU);
          ctx.fill();
        }
        const b = path(rise);
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 28);
        g.addColorStop(0, `rgba(255,255,240,${fade})`);
        g.addColorStop(0.3, `rgba(255,209,102,${0.9 * fade})`);
        g.addColorStop(1, 'rgba(255,209,102,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 28, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    // Pull back: from high above, the station's lights draw an Orbium… inside someone's eyepiece.
    if (pull > 0) {
      const S2 = Math.min(W, H) * 0.56;
      const ox = W / 2;
      const oy = H * 0.42;
      ctx.save();
      ctx.globalAlpha = pull;
      ctx.fillStyle = '#020306';
      ctx.fillRect(0, 0, W, H);
      // Additive glows: many small station lights add up to one living shape.
      ctx.globalCompositeOperation = 'lighter';
      for (const d of this.orbiumDots) {
        const tw = this.opts.rm() ? 0.85 : 0.65 + 0.35 * Math.sin(t * 2 + d.x * 40 + d.y * 23);
        const x = ox + d.x * S2;
        const y = oy + d.y * S2;
        const r = 2 + d.v * 7;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,${200 + Math.round(d.v * 40)},${130 + Math.round(d.v * 80)},${(tw * (0.25 + d.v * 0.6)).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,190,120,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgba(255,240,220,${(tw * d.v * 0.9).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, 0.5 + d.v * 1.1, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      const lens = smooth(0.84, 0.98, p);
      if (lens > 0) {
        const LR = lerp(Math.max(W, H), S2 * 0.72, lens);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        ctx.arc(ox, oy, LR, 0, TAU, true);
        ctx.fillStyle = `rgba(2,3,6,${lens})`;
        ctx.fill('evenodd');
        ctx.restore();
        ctx.strokeStyle = `rgba(200,215,255,${0.8 * lens})`;
        ctx.lineWidth = 2;
        ctx.shadowColor = '#B892FF';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(ox, oy, LR, 0, TAU);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1;
        for (let i = 0; i < 72; i++) {
          const a = (i / 72) * TAU + t * 0.03;
          const len = i % 6 === 0 ? 9 : 4;
          ctx.beginPath();
          ctx.moveTo(ox + Math.cos(a) * (LR + 4), oy + Math.sin(a) * (LR + 4));
          ctx.lineTo(ox + Math.cos(a) * (LR + 4 + len), oy + Math.sin(a) * (LR + 4 + len));
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  /** The secret ending's dawn: a warm sky, the sun on the sea, two figures on the shore. */
  private firstLight(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, p: number, a: number, hy: number, sunX: number): void {
    const rm = this.opts.rm();
    ctx.save();
    ctx.globalAlpha *= a;
    const sky = ctx.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, '#0B1024');
    sky.addColorStop(0.55, '#3A2A4A');
    sky.addColorStop(0.85, '#D9875A');
    sky.addColorStop(1, '#FFD9A8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, hy);
    const sea = ctx.createLinearGradient(0, hy, 0, H);
    sea.addColorStop(0, '#3B2C3E');
    sea.addColorStop(0.3, '#161A2A');
    sea.addColorStop(1, '#070A12');
    ctx.fillStyle = sea;
    ctx.fillRect(0, hy, W, H - hy);
    // The sun rises out of the sea.
    const sun = smooth(0.5, 0.7, p);
    const sr = Math.min(W, H) * 0.085;
    const sy = hy + sr * 0.9 - sun * sr * 2;
    const glow = ctx.createRadialGradient(sunX, sy, sr * 0.3, sunX, sy, sr * 6);
    glow.addColorStop(0, `rgba(255,236,200,${0.85 * sun})`);
    glow.addColorStop(0.25, `rgba(255,170,100,${0.35 * sun})`);
    glow.addColorStop(1, 'rgba(255,150,80,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, hy);
    ctx.clip();
    ctx.fillStyle = `rgba(255,247,230,${sun})`;
    ctx.beginPath();
    ctx.arc(sunX, sy, sr, 0, TAU);
    ctx.fill();
    ctx.restore();
    // The sun's path on the water.
    for (let i = 0; i < 16; i++) {
      const y = hy + 3 + i * i * 0.9;
      if (y > H) break;
      const w = (8 + i * 4) * (0.6 + 0.4 * sun) * (rm ? 1 : 0.8 + 0.2 * Math.sin(t * 2 + i * 1.7));
      ctx.fillStyle = `rgba(255,214,160,${(0.5 * sun * (1 - i / 16)).toFixed(3)})`;
      ctx.fillRect(sunX - w / 2, y, w, 1.4);
    }
    ctx.strokeStyle = 'rgba(255,224,180,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, hy);
    ctx.lineTo(W, hy);
    ctx.stroke();
    // The shore with the station's little lights, and the two figures.
    ctx.fillStyle = '#07080D';
    ctx.beginPath();
    ctx.moveTo(0, hy + 14);
    ctx.lineTo(W * 0.38, hy + 6);
    ctx.quadraticCurveTo(W * 0.46, hy + 4, W * 0.5, hy + 18);
    ctx.lineTo(W * 0.5, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
    const figs = smooth(0.54, 0.64, p);
    if (figs > 0) {
      const base = hy + 7;
      const hh = H * 0.11;
      const ax = W * 0.2;
      ctx.save();
      ctx.globalAlpha *= figs;
      // Albor: hair bob, coat; a warm rim on the sun side.
      ctx.fillStyle = '#0A0709';
      ctx.strokeStyle = 'rgba(255,200,140,0.75)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(ax, base - hh * 0.86, hh * 0.1, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ax, base - hh * 0.86, hh * 0.1, -0.9, 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ax - hh * 0.17, base);
      ctx.lineTo(ax - hh * 0.13, base - hh * 0.5);
      ctx.quadraticCurveTo(ax - hh * 0.12, base - hh * 0.72, ax, base - hh * 0.74);
      ctx.quadraticCurveTo(ax + hh * 0.12, base - hh * 0.72, ax + hh * 0.13, base - hh * 0.5);
      ctx.lineTo(ax + hh * 0.17, base);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(ax + hh * 0.13, base - hh * 0.5);
      ctx.quadraticCurveTo(ax + hh * 0.12, base - hh * 0.72, ax, base - hh * 0.74);
      ctx.stroke();
      ctx.restore();
      // VELA floats beside her, glowing.
      const vs = H * 0.085;
      const st: PortraitState = {
        speaker: 'vela',
        mood: 'happy',
        moodAge: 10,
        talk: 0,
        talking: false,
        blink: 0,
        live: false,
        pulses: [],
        reduceMotion: rm,
      };
      ctx.save();
      ctx.globalAlpha *= figs;
      ctx.translate(W * 0.33 - vs / 2, base - vs * 1.18);
      ctx.scale(vs / 100, vs / 100);
      drawVela(ctx, st, t);
      ctx.restore();
    }
    // Station windows on the shore.
    for (let i = 0; i < 6; i++) {
      const x = W * (0.05 + i * 0.05);
      const on = rm || Math.sin(t * 0.7 + i * 2.1) > -0.6;
      ctx.fillStyle = on ? 'rgba(255,214,140,0.85)' : 'rgba(255,214,140,0.25)';
      ctx.fillRect(x, hy + 22 + (i % 2) * 6, 2.4, 2.4);
    }
    ctx.restore();
  }
}
