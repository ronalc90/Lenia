/**
 * Live previews for the store and wardrobe.
 *
 * One shared CPU Lenia (64×64 torus, Orbium unicaudatus from the catalog) steps ~15×/s while any
 * preview is on screen. Its field is cropped around the creature (the "camera" follows it),
 * upsampled once per step with a cubic B-spline, and coloured per palette with the same recipe as
 * the WebGL RENDER shader: LUT colour, gel relief, shadow tint, iso-contour, edge sheen and bloom.
 * So a palette card shows the real creature, alive, in that palette.
 *
 * Cards draw from cached canvases; one requestAnimationFrame loop drives everything, previews
 * off screen are skipped (IntersectionObserver) and reduced motion renders a single still frame.
 */
import { CpuLenia } from '../../sim/cpu';
import { catalogByCode, catalogPattern, paramsOf } from '../../sim/catalog';
import type { DishTheme, HaloStyle, MatterStop, PaletteData, SparkSkin, TrailStyle, AmbiencePreset } from '../../store/catalog';
import { hexToRgb, paletteLUT } from '../../store/apply';
import { drawHalo, drawSpark, drawSparkTrail, drawTrailParticle, drawTrailRipple, rgba, stepTrailParticle, trailBurst, type TrailParticle } from '../../store/draw';

// ───────────────────────────── live field ─────────────────────────────

const SIM = 64;
/** Cells shown around the creature. */
const CROP = 40;

export interface Upsampled {
  n: number;
  scale: number;
  v: Float32Array;
  /** Gradient in matter per grid cell. */
  gx: Float32Array;
  gy: Float32Array;
}

export class LiveField {
  private sim: CpuLenia;
  private mass0 = 1;
  /** Camera centre (grid cells, may be fractional). */
  cx = SIM / 2;
  cy = SIM / 2;
  version = 0;
  private ups = new Map<number, { version: number; u: Upsampled }>();
  private glowSrc: { version: number; g: Float32Array } | null = null;

  constructor(private readonly code = 'O2u') {
    const e = catalogByCode(code);
    if (!e) throw new Error(`unknown species ${code}`);
    this.sim = new CpuLenia(SIM, SIM, paramsOf(e));
    this.reseed();
  }

  private reseed(): void {
    this.sim.A.fill(0);
    this.sim.placeCentered(catalogPattern(this.code), SIM / 2, SIM / 2);
    this.sim.step(40); // settle into its living shape
    this.mass0 = Math.max(1, this.sim.mass());
    this.track();
    this.version++;
  }

  /** Circular (torus) centroid of matter. */
  private track(): void {
    const A = this.sim.A;
    let sx = 0;
    let cxs = 0;
    let sy = 0;
    let cys = 0;
    const k = (Math.PI * 2) / SIM;
    for (let y = 0; y < SIM; y++) {
      for (let x = 0; x < SIM; x++) {
        const a = A[y * SIM + x];
        if (a <= 0.02) continue;
        sx += a * Math.sin(x * k);
        cxs += a * Math.cos(x * k);
        sy += a * Math.sin(y * k);
        cys += a * Math.cos(y * k);
      }
    }
    const wrap = (v: number) => ((v % SIM) + SIM) % SIM;
    this.cx = wrap(Math.atan2(sx, cxs) / k);
    this.cy = wrap(Math.atan2(sy, cys) / k);
  }

  step(): void {
    this.sim.step(1);
    const m = this.sim.mass();
    if (m < this.mass0 * 0.35 || m > this.mass0 * 3 || this.sim.stepCount > 20000) this.reseed();
    else {
      this.track();
      this.version++;
    }
  }

  /** Field cropped around the creature and upsampled `scale`× (cached per step). */
  upsampled(scale: number): Upsampled {
    const hit = this.ups.get(scale);
    if (hit && hit.version === this.version) return hit.u;
    const n = CROP * scale;
    const u: Upsampled = hit?.u ?? { n, scale, v: new Float32Array(n * n), gx: new Float32Array(n * n), gy: new Float32Array(n * n) };
    const A = this.sim.A;
    const x0 = this.cx - CROP / 2;
    const y0 = this.cy - CROP / 2;
    // Separable cubic B-spline: per output column/row, 4 source indices and weights.
    const taps = (origin: number) => {
      const idx = new Int32Array(n * 4);
      const w = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        const g = origin + (i + 0.5) / scale - 0.5;
        const f0 = Math.floor(g);
        const t = g - f0;
        const t2 = t * t;
        const t3 = t2 * t;
        const ws = [(1 - 3 * t + 3 * t2 - t3) / 6, (4 - 6 * t2 + 3 * t3) / 6, (1 + 3 * t + 3 * t2 - 3 * t3) / 6, t3 / 6];
        for (let k = 0; k < 4; k++) {
          idx[i * 4 + k] = (((f0 - 1 + k) % SIM) + SIM) % SIM;
          w[i * 4 + k] = ws[k];
        }
      }
      return { idx, w };
    };
    const tx = taps(x0);
    const ty = taps(y0);
    // Horizontal pass over every source row, then vertical.
    const tmp = new Float32Array(SIM * n);
    for (let y = 0; y < SIM; y++) {
      const row = y * SIM;
      for (let i = 0; i < n; i++) {
        const b = i * 4;
        tmp[y * n + i] =
          A[row + tx.idx[b]] * tx.w[b] + A[row + tx.idx[b + 1]] * tx.w[b + 1] + A[row + tx.idx[b + 2]] * tx.w[b + 2] + A[row + tx.idx[b + 3]] * tx.w[b + 3];
      }
    }
    for (let j = 0; j < n; j++) {
      const b = j * 4;
      const r0 = ty.idx[b] * n;
      const r1 = ty.idx[b + 1] * n;
      const r2 = ty.idx[b + 2] * n;
      const r3 = ty.idx[b + 3] * n;
      const w0 = ty.w[b];
      const w1 = ty.w[b + 1];
      const w2 = ty.w[b + 2];
      const w3 = ty.w[b + 3];
      for (let i = 0; i < n; i++) u.v[j * n + i] = tmp[r0 + i] * w0 + tmp[r1 + i] * w1 + tmp[r2 + i] * w2 + tmp[r3 + i] * w3;
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const l = u.v[j * n + Math.max(0, i - 1)];
        const r = u.v[j * n + Math.min(n - 1, i + 1)];
        const t = u.v[Math.max(0, j - 1) * n + i];
        const d = u.v[Math.min(n - 1, j + 1) * n + i];
        u.gx[k] = (r - l) * 0.5 * scale;
        u.gy[k] = (d - t) * 0.5 * scale;
      }
    }
    this.ups.set(scale, { version: this.version, u });
    return u;
  }

  /** Bright matter at crop resolution, blurred (bloom source), cached per step. */
  glow(): Float32Array {
    if (this.glowSrc && this.glowSrc.version === this.version) return this.glowSrc.g;
    const n = CROP;
    const A = this.sim.A;
    const x0 = Math.round(this.cx - CROP / 2);
    const y0 = Math.round(this.cy - CROP / 2);
    let g: Float32Array = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const v = A[(((y0 + j) % SIM) + SIM) % SIM * SIM + ((((x0 + i) % SIM) + SIM) % SIM)];
        const t = Math.min(1, Math.max(0, (v - 0.2) / 0.6));
        g[j * n + i] = t * t * (3 - 2 * t);
      }
    }
    // Three box passes ≈ gaussian, radius 2 cells each way.
    const box = (src: Float32Array, horiz: boolean): Float32Array => {
      const out = new Float32Array(n * n);
      const r = 2;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          let s = 0;
          for (let k = -r; k <= r; k++) {
            const ii = horiz ? Math.min(n - 1, Math.max(0, i + k)) : i;
            const jj = horiz ? j : Math.min(n - 1, Math.max(0, j + k));
            s += src[jj * n + ii];
          }
          out[j * n + i] = s / (2 * r + 1);
        }
      }
      return out;
    };
    for (let p = 0; p < 2; p++) g = box(box(g, true), false);
    this.glowSrc = { version: this.version, g };
    return g;
  }
}

// ───────────────────────────── palette colouring ─────────────────────────────

interface Painted {
  version: number;
  matter: HTMLCanvasElement;
  light: HTMLCanvasElement;
  glow: HTMLCanvasElement;
}

const unit = (hex: string): [number, number, number] => hexToRgb(hex).map((c) => c / 255) as [number, number, number];
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function canvasOf(n: number, prev?: HTMLCanvasElement): HTMLCanvasElement {
  const c = prev ?? document.createElement('canvas');
  if (c.width !== n) c.width = n;
  if (c.height !== n) c.height = n;
  return c;
}

/** Colours the live field with one palette, emulating src/sim/shaders.ts RENDER. */
export class PaletteCache {
  private cache = new Map<string, Painted>();
  private luts = new Map<string, Uint8Array>();
  constructor(private readonly field: LiveField) {}

  get(id: string, pal: PaletteData, scale: number): Painted {
    const key = `${id}@${scale}`;
    const hit = this.cache.get(key);
    if (hit && hit.version === this.field.version) return hit;
    const u = this.field.upsampled(scale);
    const n = u.n;
    let lut = this.luts.get(id);
    if (!lut) {
      lut = paletteLUT(pal.stops as MatterStop[]);
      this.luts.set(id, lut);
    }
    const matter = canvasOf(n, hit?.matter);
    const light = canvasOf(n, hit?.light);
    const mctx = matter.getContext('2d')!;
    const lctx = light.getContext('2d')!;
    const mi = mctx.createImageData(n, n);
    const li = lctx.createImageData(n, n);
    const shadow = unit(pal.shadow);
    const contour = unit(pal.contour);
    // Light from the top-left, towards the viewer (shader LIGHT).
    const L = [-0.45, -0.55, 0.7];
    const ll = Math.hypot(L[0], L[1], L[2]);
    const lx = L[0] / ll;
    const ly = L[1] / ll;
    const lz = L[2] / ll;
    const hx = lx;
    const hy = ly;
    const hz = lz + 1;
    const hl = Math.hypot(hx, hy, hz);
    for (let k = 0; k < n * n; k++) {
      const v = Math.min(1, Math.max(0, u.v[k]));
      const li4 = Math.round(v * 255) * 4;
      let r = lut[li4] / 255;
      let g = lut[li4 + 1] / 255;
      let b = lut[li4 + 2] / 255;
      const a = lut[li4 + 3] / 255;
      const gxv = u.gx[k];
      const gyv = u.gy[k];
      // Relief.
      let nx = -gxv * 5;
      let ny = -gyv * 5;
      let nz = 1;
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl;
      ny /= nl;
      nz /= nl;
      const shade = nx * lx + ny * ly + nz * lz - lz;
      const sh = Math.min(0.85, Math.max(0, -shade * 1.4));
      r = r + (r * shadow[0] - r) * sh;
      g = g + (g * shadow[1] - g) * sh;
      b = b + (b * shadow[2] - b) * sh;
      const lift = 1 + 0.35 * Math.max(shade, 0);
      r *= lift;
      g *= lift;
      b *= lift;
      const spec = Math.pow(Math.max((nx * hx + ny * hy + nz * hz) / hl, 0), 48) * 0.35 * smooth(0.15, 0.45, v);
      r += 0.9 * spec;
      g += 0.97 * spec;
      b += spec;
      const p = k * 4;
      mi.data[p] = Math.min(255, r * 255);
      mi.data[p + 1] = Math.min(255, g * 255);
      mi.data[p + 2] = Math.min(255, b * 255);
      mi.data[p + 3] = a * 255;
      // Additive light: edge sheen + thin iso-contour at v = 0.13.
      const gm = Math.hypot(gxv, gyv);
      const edge = smooth(0.02, 0.16, gm);
      const fw = Math.max(1e-5, (Math.abs(gxv) + Math.abs(gyv)) / u.scale);
      const dist = Math.abs(v - 0.13) / fw;
      const line = 1 - smooth(0.45 - 0.5, 0.45 + 0.75, dist);
      const add = 0.14 * edge * (1 - smooth(0.25, 0.65, v)) + line * (0.25 + 0.75 * edge) * 0.85;
      li.data[p] = Math.min(255, contour[0] * add * 255);
      li.data[p + 1] = Math.min(255, contour[1] * add * 255);
      li.data[p + 2] = Math.min(255, contour[2] * add * 255);
      li.data[p + 3] = 255;
    }
    mctx.putImageData(mi, 0, 0);
    lctx.putImageData(li, 0, 0);
    // Bloom at crop resolution.
    const gsrc = this.field.glow();
    const gn = CROP;
    const glow = canvasOf(gn, hit?.glow);
    const gctx = glow.getContext('2d')!;
    const gi = gctx.createImageData(gn, gn);
    const wide = unit(pal.glowWide);
    const core = unit(pal.glowCore);
    const amt = 0.55;
    for (let k = 0; k < gn * gn; k++) {
      const gl = gsrc[k];
      const p = k * 4;
      gi.data[p] = Math.min(255, (wide[0] * gl + core[0] * gl * gl * 1.4) * amt * 255);
      gi.data[p + 1] = Math.min(255, (wide[1] * gl + core[1] * gl * gl * 1.4) * amt * 255);
      gi.data[p + 2] = Math.min(255, (wide[2] * gl + core[2] * gl * gl * 1.4) * amt * 255);
      gi.data[p + 3] = 255;
    }
    gctx.putImageData(gi, 0, 0);
    const painted = { version: this.field.version, matter, light, glow };
    this.cache.set(key, painted);
    return painted;
  }
}

// ───────────────────────────── dish background ─────────────────────────────

const bgCache = new Map<string, HTMLCanvasElement>();

/** Agar, vignette, inner wall shadow and rim, as in the RENDER shader (cached per size). */
export function dishBackground(d: DishTheme, w: number, h: number, inset: number): HTMLCanvasElement {
  const key = `${d.bg}${d.agarIn}${d.agarOut}${d.rim}${d.rimStrength}${d.rimStyle}${d.grid}|${w}x${h}|${inset}`;
  const hit = bgCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = d.bg;
  ctx.fillRect(0, 0, w, h);
  const x0 = inset;
  const y0 = inset;
  const dw = w - inset * 2;
  const dh = h - inset * 2;
  const r = Math.min(dw, dh) * 0.06;
  const path = () => {
    ctx.beginPath();
    ctx.roundRect(x0, y0, dw, dh, r);
  };
  // Outer rim halo (glow style is stronger).
  const haloAmt = d.rimStyle === 'glow' ? 0.22 : 0.08;
  ctx.save();
  ctx.shadowColor = rgba(d.rim, haloAmt);
  ctx.shadowBlur = Math.max(6, inset * 1.6);
  path();
  ctx.fillStyle = d.agarOut;
  ctx.fill();
  ctx.restore();
  // Agar with vignette.
  ctx.save();
  path();
  ctx.clip();
  const grd = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(dw, dh) * 0.62);
  grd.addColorStop(0, d.agarIn);
  grd.addColorStop(0.55, d.agarIn);
  grd.addColorStop(1, d.agarOut);
  ctx.fillStyle = grd;
  ctx.fillRect(x0, y0, dw, dh);
  if (d.grid) {
    const step = Math.max(10, Math.round(Math.min(dw, dh) / 9));
    ctx.strokeStyle = d.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0 + (dw % step) / 2; x < x0 + dw; x += step) {
      ctx.moveTo(Math.round(x) + 0.5, y0);
      ctx.lineTo(Math.round(x) + 0.5, y0 + dh);
    }
    for (let y = y0 + (dh % step) / 2; y < y0 + dh; y += step) {
      ctx.moveTo(x0, Math.round(y) + 0.5);
      ctx.lineTo(x0 + dw, Math.round(y) + 0.5);
    }
    ctx.stroke();
  }
  // Inner wall shadow.
  ctx.lineWidth = Math.max(8, inset * 2.4);
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.filter = 'blur(6px)';
  path();
  ctx.stroke();
  ctx.filter = 'none';
  ctx.restore();
  // Rim line(s).
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = rgba(d.rim, Math.min(1, d.rimStrength * 2.4));
  path();
  ctx.stroke();
  if (d.rimStyle === 'double') {
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = rgba(d.rim, Math.min(1, d.rimStrength * 1.5));
    ctx.beginPath();
    ctx.roundRect(x0 + 3.5, y0 + 3.5, dw - 7, dh - 7, Math.max(0, r - 3));
    ctx.stroke();
  }
  if (bgCache.size > 80) bgCache.clear();
  bgCache.set(key, c);
  return c;
}

// ───────────────────────────── preview loop ─────────────────────────────

export type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number, dt: number) => void;

interface Entry {
  canvas: HTMLCanvasElement;
  draw: DrawFn;
  visible: boolean;
  usesField: boolean;
}

export interface PreviewHandle {
  destroy(): void;
}

/** Shared animation loop + live field for every preview on screen. */
export class PreviewLoop {
  readonly field = new LiveField();
  readonly palettes = new PaletteCache(this.field);
  private entries = new Set<Entry>();
  private io: IntersectionObserver | null = null;
  private raf = 0;
  private last = 0;
  private stepAcc = 0;
  private dead = false;
  /** Simulation steps per second while previews are visible. */
  stepsPerSecond = 15;

  constructor(readonly reduceMotion = false) {
    if (typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver(
        (records) => {
          for (const r of records) {
            for (const e of this.entries) if (e.canvas === r.target) e.visible = r.isIntersecting;
          }
          if (this.reduceMotion) this.drawAll(this.stillTime(), 0);
        },
        { rootMargin: '80px' },
      );
    }
    if (!reduceMotion) this.raf = requestAnimationFrame(this.frame);
  }

  private stillTime(): number {
    return 2.4; // a pleasant phase for every animation
  }

  add(canvas: HTMLCanvasElement, draw: DrawFn, usesField = true): PreviewHandle {
    const e: Entry = { canvas, draw, visible: !this.io, usesField };
    this.entries.add(e);
    this.io?.observe(canvas);
    if (this.reduceMotion) requestAnimationFrame(() => this.drawOne(e, this.stillTime(), 0));
    return {
      destroy: () => {
        this.entries.delete(e);
        this.io?.unobserve(canvas);
      },
    };
  }

  /** Redraw everything now (reduced motion: after an equip change). */
  refresh(): void {
    if (this.reduceMotion) this.drawAll(this.stillTime(), 0);
  }

  private frame = (ms: number) => {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.frame);
    const t = ms / 1000;
    const dt = this.last ? Math.min(0.1, t - this.last) : 0;
    this.last = t;
    let fieldVisible = false;
    for (const e of this.entries) if (e.visible && e.usesField) fieldVisible = true;
    if (fieldVisible) {
      this.stepAcc += dt * this.stepsPerSecond;
      let n = 0;
      while (this.stepAcc >= 1 && n < 3) {
        this.field.step();
        this.stepAcc -= 1;
        n++;
      }
      if (this.stepAcc > 3) this.stepAcc = 0;
    }
    this.drawAll(t, dt);
  };

  private drawAll(t: number, dt: number): void {
    for (const e of this.entries) if (e.visible) this.drawOne(e, t, dt);
  }

  private drawOne(e: Entry, t: number, dt: number): void {
    const c = e.canvas;
    if (!c.isConnected) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    if (!cw || !ch) return;
    const W = Math.round(cw * dpr);
    const H = Math.round(ch * dpr);
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    try {
      e.draw(ctx, cw, ch, t, dt);
    } catch (err) {
      console.error('[store preview]', err);
    }
  }

  destroy(): void {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.io?.disconnect();
    this.entries.clear();
  }
}

// ───────────────────────────── renderers ─────────────────────────────

/** Draw the live creature coloured with `pal`, centred at (x, y), `size` CSS px across the crop. */
export function drawCreature(
  loop: PreviewLoop,
  ctx: CanvasRenderingContext2D,
  id: string,
  pal: PaletteData,
  x: number,
  y: number,
  size: number,
  t: number,
  scale = 3,
): void {
  const p = loop.palettes.get(id, pal, scale);
  const rot = loop.reduceMotion ? 0.35 : 0.35 + t * 0.06;
  const breath = loop.reduceMotion ? 1 : 1 + 0.012 * Math.sin(t * 1.3);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(breath, breath);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(p.matter, -size / 2, -size / 2, size, size);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(p.light, -size / 2, -size / 2, size, size);
  const gs = size * 1.08;
  ctx.globalAlpha = loop.reduceMotion ? 1 : 0.9 + 0.1 * Math.sin(t * 1.3);
  ctx.drawImage(p.glow, -gs / 2, -gs / 2, gs, gs);
  ctx.restore();
}

interface Mote {
  x: number;
  y: number;
  r: number;
  ph: number;
  vy: number;
}
function makeMotes(n: number): Mote[] {
  return Array.from({ length: n }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.1, ph: Math.random() * 6.28, vy: 0.01 + Math.random() * 0.02 }));
}
function drawMotes(ctx: CanvasRenderingContext2D, motes: Mote[], color: string, w: number, h: number, t: number, dt: number, still: boolean): void {
  for (const m of motes) {
    if (!still) {
      m.y -= m.vy * dt;
      if (m.y < 0) {
        m.y += 1;
        m.x = Math.random();
      }
    }
    const tw = 0.5 + 0.5 * Math.sin(t * 1.3 + m.ph);
    ctx.fillStyle = rgba(color, 0.06 + 0.16 * tw);
    ctx.beginPath();
    ctx.arc(m.x * w + Math.sin(t * 0.5 + m.ph) * 4, m.y * h, m.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export interface Look {
  paletteId: string;
  palette: PaletteData;
  dish: DishTheme;
}

const INSET = 5;

/** Palette card / detail: the live creature in this palette on the current dish. */
export function palettePreview(loop: PreviewLoop, id: string, pal: PaletteData, look: () => Look, opts: { scale?: number; zoom?: number } = {}): DrawFn {
  const motes = makeMotes(10);
  return (ctx, w, h, t, dt) => {
    const dpr = ctx.getTransform().a;
    const d = look().dish;
    ctx.drawImage(dishBackground(d, Math.round(w * dpr), Math.round(h * dpr), Math.round(INSET * dpr)), 0, 0, w, h);
    drawMotes(ctx, motes, d.motes, w, h, t, dt, loop.reduceMotion);
    const size = Math.min(w, h) * (opts.zoom ?? 1.25);
    drawCreature(loop, ctx, id, pal, w / 2, h / 2, size, t, opts.scale ?? 3);
  };
}

/** Dish card: that dish with the creature in the currently equipped palette. */
export function dishPreview(loop: PreviewLoop, d: DishTheme, look: () => Look): DrawFn {
  const motes = makeMotes(14);
  return (ctx, w, h, t, dt) => {
    const dpr = ctx.getTransform().a;
    ctx.drawImage(dishBackground(d, Math.round(w * dpr), Math.round(h * dpr), Math.round(INSET * dpr)), 0, 0, w, h);
    drawMotes(ctx, motes, d.motes, w, h, t, dt, loop.reduceMotion);
    const L = look();
    drawCreature(loop, ctx, L.paletteId, L.palette, w / 2, h / 2, Math.min(w, h) * 0.95, t);
  };
}

/** Halo card: creature + that halo style. */
export function haloPreview(loop: PreviewLoop, s: HaloStyle, look: () => Look): DrawFn {
  return (ctx, w, h, t) => {
    const dpr = ctx.getTransform().a;
    const L = look();
    ctx.drawImage(dishBackground(L.dish, Math.round(w * dpr), Math.round(h * dpr), Math.round(INSET * dpr)), 0, 0, w, h);
    const size = Math.min(w, h) * 0.8;
    drawCreature(loop, ctx, L.paletteId, L.palette, w / 2, h / 2, size, t);
    drawHalo(ctx, w / 2, h / 2, size * 0.33, t, s, { reduceMotion: loop.reduceMotion });
  };
}

/**
 * Seed trail card: seeds land every ~0.7 s with that ripple and particle burst. The ripple is shown
 * at 0.5 s instead of the game's 0.3 s (and particles live a bit longer) so a card is never empty;
 * size and shape are the game's.
 */
export function trailPreview(loop: PreviewLoop, s: TrailStyle, look: () => Look): DrawFn {
  let seeds: { x: number; y: number; t0: number; parts: TrailParticle[] }[] = [];
  let next = 0;
  const RIPPLE = 0.5;
  const spore = (ctx: CanvasRenderingContext2D, x: number, y: number, k: number, L: Look) => {
    const c = L.palette.stops[Math.min(3, L.palette.stops.length - 1)];
    const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
    g.addColorStop(0, `rgba(${Math.min(255, c[1] + 90)},${Math.min(255, c[2] + 90)},${Math.min(255, c[3] + 90)},${(0.9 * k).toFixed(3)})`);
    g.addColorStop(0.45, `rgba(${c[1]},${c[2]},${c[3]},${(0.55 * k).toFixed(3)})`);
    g.addColorStop(1, `rgba(${c[1]},${c[2]},${c[3]},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
  };
  return (ctx, w, h, t, dt) => {
    const dpr = ctx.getTransform().a;
    const L = look();
    ctx.drawImage(dishBackground(L.dish, Math.round(w * dpr), Math.round(h * dpr), Math.round(INSET * dpr)), 0, 0, w, h);
    const maxR = Math.min(w, h) * 0.3;
    if (loop.reduceMotion) {
      // Still frame: one ripple mid-way and a frozen burst.
      if (!seeds.length) {
        const parts = trailBurst(s, 12);
        for (const p of parts) for (let k = 0; k < 9; k++) stepTrailParticle(p, s, 0.03);
        seeds = [{ x: w / 2, y: h / 2, t0: 0, parts }];
      }
      spore(ctx, w / 2, h / 2, 1, L);
      drawTrailRipple(ctx, w / 2, h / 2, 0.22, maxR, s, RIPPLE);
      for (const p of seeds[0].parts) drawTrailParticle(ctx, w / 2, h / 2, p, s, 0.3);
      return;
    }
    if (t >= next) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * Math.min(w, h) * 0.16;
      const parts = trailBurst(s, 12);
      for (const p of parts) p.life *= 1.5;
      seeds.push({ x: w / 2 + Math.cos(a) * r, y: h / 2 + Math.sin(a) * r, t0: t, parts });
      if (seeds.length > 4) seeds.shift();
      next = t + 0.6 + Math.random() * 0.35;
    }
    seeds = seeds.filter((sd) => t - sd.t0 < 1.8);
    for (const sd of seeds) {
      const el = t - sd.t0;
      const k = Math.min(1, el / 0.15) * (1 - Math.max(0, (el - 1.1) / 0.7));
      spore(ctx, sd.x, sd.y, k, L);
      drawTrailRipple(ctx, sd.x, sd.y, el, maxR, s, RIPPLE);
      for (const p of sd.parts) {
        const pt = el / p.life;
        if (pt >= 1) continue;
        stepTrailParticle(p, s, dt);
        drawTrailParticle(ctx, sd.x, sd.y, p, s, pt);
      }
    }
  };
}

/** Golden spark card: the spark drifting with its trail and sparkles. */
export function sparkPreview(loop: PreviewLoop, s: SparkSkin, look: () => Look): DrawFn {
  const trail: { x: number; y: number; t: number }[] = [];
  let parts: { x: number; y: number; vx: number; vy: number; t0: number; life: number; c: string; size: number }[] = [];
  let lastEmit = 0;
  return (ctx, w, h, t, dt) => {
    const dpr = ctx.getTransform().a;
    const L = look();
    ctx.drawImage(dishBackground(L.dish, Math.round(w * dpr), Math.round(h * dpr), Math.round(INSET * dpr)), 0, 0, w, h);
    const tt = loop.reduceMotion ? 1.2 : t;
    const pos = (q: number) => ({ x: w / 2 + Math.sin(q * 0.7) * w * 0.26, y: h / 2 + Math.sin(q * 1.13 + 0.6) * h * 0.2 });
    const p = pos(tt);
    const p2 = pos(tt + 0.05);
    const heading = Math.atan2(p2.y - p.y, p2.x - p.x);
    if (loop.reduceMotion) {
      const pts = Array.from({ length: 16 }, (_, i) => pos(tt - (16 - i) * 0.035));
      drawSparkTrail(ctx, pts, s);
    } else {
      const lastPt = trail[trail.length - 1];
      if (!lastPt || t - lastPt.t > 0.035) {
        trail.push({ ...p, t });
        if (trail.length > 22) trail.shift();
      }
      drawSparkTrail(ctx, trail, s);
      if (t - lastEmit > 0.09) {
        lastEmit = t;
        const a = Math.random() * Math.PI * 2;
        parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * 22, vy: Math.sin(a) * 22 - 8, t0: t, life: 0.7 + Math.random() * 0.4, c: s.particles[Math.floor(Math.random() * s.particles.length)], size: 1 + Math.random() * 1.2 });
      }
      parts = parts.filter((q) => t - q.t0 < q.life);
      for (const q of parts) {
        q.vx *= Math.exp(-1.2 * dt);
        q.vy = q.vy * Math.exp(-1.2 * dt) + 10 * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        const k = (t - q.t0) / q.life;
        ctx.fillStyle = rgba(q.c, k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9);
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.size * (1 - k * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    drawSpark(ctx, p.x, p.y, tt, s, { reduceMotion: loop.reduceMotion, heading });
  };
}

/** Music card: a slow aurora of sine ribbons whose speed follows the tempo and colour the mood. */
export function musicPreview(loop: PreviewLoop, m: AmbiencePreset, colors: [string, string], look: () => Look): DrawFn {
  return (ctx, w, h, t) => {
    const dpr = ctx.getTransform().a;
    ctx.drawImage(dishBackground(look().dish, Math.round(w * dpr), Math.round(h * dpr), Math.round(INSET * dpr)), 0, 0, w, h);
    const tt = loop.reduceMotion ? 3 : t;
    const beat = (tt * m.bpm) / 60;
    const pulse = loop.reduceMotion ? 0.5 : Math.pow(1 - (beat % 1), 3);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const ribbons = 5;
    for (let k = 0; k < ribbons; k++) {
      const f = k / (ribbons - 1);
      const amp = h * (0.09 + 0.05 * Math.sin(tt * 0.4 + k)) * (1 + 0.25 * pulse * (1 - f));
      const freq = 1.2 + k * 0.45 + (m.mode === 'lydian' || m.mode === 'ionian' ? 0.3 : 0);
      const col = k % 2 ? colors[1] : colors[0];
      ctx.strokeStyle = rgba(col, 0.18 + 0.22 * (1 - f));
      ctx.lineWidth = 1.2 + 2.2 * (1 - f);
      ctx.beginPath();
      for (let x = INSET + 4; x <= w - INSET - 4; x += 3) {
        const u = x / w;
        const y = h / 2 + Math.sin(u * Math.PI * 2 * freq + beat * 0.5 + k * 1.3) * amp * Math.sin(u * Math.PI);
        if (x === INSET + 4) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Beat dots along the bottom: one per beat of the bar.
    for (let b = 0; b < 4; b++) {
      const on = Math.floor(beat) % 4 === b;
      ctx.fillStyle = rgba(colors[0], on ? 0.75 : 0.18);
      ctx.beginPath();
      ctx.arc(w / 2 + (b - 1.5) * 12, h - INSET - 10, on ? 2.6 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };
}
