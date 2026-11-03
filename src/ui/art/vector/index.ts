/**
 * The vector kit of scientific realism (ADR-029, docs/ARTE-REALISTA.md §3). Shared by VELA (P1), the people
 * (P2), the scenes (P3) and the plates (P4); P1 owns it and may refine any implementation without changing a
 * signature.
 *
 *  - Paths are hand-written SVG path data (`rr`, `circ` build the parametric ones) in the 100 × 100 box,
 *    turned into `Path2D` once, at module load (§3.3).
 *  - Line weights are CSS px at any DPR (§3.8): `px`, `hairline`, `lineWidth`, `snap`.
 *  - Light and material: `kelvin` (blackbody lamp colour), `cylinderRamp` (tubes, handles, fingers),
 *    `conicMetal` (turned or radially brushed metal), `grainPattern` (powder coat, paper).
 *  - `LayerCache`: static layers drawn once per key × size × DPR on an offscreen canvas (§3.9).
 *
 * Deterministic (no Math.random), no ctx.filter (Safari has none), no shadowBlur. The per-frame calls
 * (`px`, `hairline`, `lineWidth`, `snap`, `kelvin`, `kelvinHex`, `hash01`, `grainPattern` and a
 * `LayerCache.get` hit) allocate nothing; `cylinderRamp` and `conicMetal` return a new gradient, so build
 * them in a cache pass or keep the result.
 */
import type { RGB } from '../color';
import { n } from '../geometry';
import { LINE, MATERIAL, MATERIAL_AT, type LineToken } from '../tokens';

/** Any 2D context the kit draws on (on screen or in a cache). */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/** A canvas a cached layer lives on. */
export type LayerCanvas = HTMLCanvasElement | OffscreenCanvas;
/** Makes a canvas of `w` × `h` device pixels, or null when there is none (Node tests, old workers). */
export type CanvasFactory = (w: number, h: number) => LayerCanvas | null;

// ── Paths (§3.3) ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Rounded rectangle as SVG path data, clockwise from the end of the top-left corner. The radius is
 * clamped to half the short side; `r <= 0` gives square corners. `rr(15.5, 23.5, 51, 37, 3.5)` is VELA's
 * bezel (§3.6).
 */
export function rr(x: number, y: number, w: number, h: number, r: number): string {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  if (k === 0) return `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + h)}H${n(x)}Z`;
  const a = `A${n(k)} ${n(k)} 0 0 1 `;
  return (
    `M${n(x + k)} ${n(y)}H${n(x + w - k)}${a}${n(x + w)} ${n(y + k)}V${n(y + h - k)}${a}${n(x + w - k)} ${n(y + h)}` +
    `H${n(x + k)}${a}${n(x)} ${n(y + h - k)}V${n(y + k)}${a}${n(x + k)} ${n(y)}Z`
  );
}

/** Circle as SVG path data (two half arcs). A ring is `circ(outer) + circ(inner)` filled with 'evenodd'. */
export function circ(cx: number, cy: number, r: number): string {
  const R = Math.max(0, r);
  const a = `A${n(R)} ${n(R)} 0 1 0 `;
  return `M${n(cx - R)} ${n(cy)}${a}${n(cx + R)} ${n(cy)}${a}${n(cx - R)} ${n(cy)}Z`;
}

// ── Units and the pixel grid (§3.8) ───────────────────────────────────────────────────────────────────

/** Box units per CSS px for a picture `cssSize` px wide (`PX = 100 / cssSize`): `ctx.lineWidth = 1.25 * px(size)`. */
export function px(cssSize: number, box = 100): number {
  return cssSize > 0 ? box / cssSize : 1;
}

/** One device pixel in box units (the `hair` weight: retículas, scale ticks, VFD mesh). */
export function hairline(cssSize: number, dpr: number, box = 100): number {
  return px(cssSize, box) / (dpr > 0 ? dpr : 1);
}

/** A line weight of the §3.8 scale (or any CSS px value) in box units. */
export function lineWidth(weight: LineToken | 'hair' | number, cssSize: number, dpr: number, box = 100): number {
  if (weight === 'hair') return hairline(cssSize, dpr, box);
  return (typeof weight === 'number' ? weight : LINE[weight]) * px(cssSize, box);
}

/**
 * Moves a box coordinate to the centre of the nearest device pixel, so a 1-device-pixel horizontal or
 * vertical line is crisp: `(round(v·k) + 0.5) / k` with `k = cssSize / box · dpr`.
 */
export function snap(v: number, cssSize: number, dpr: number, box = 100): number {
  const k = (cssSize / box) * (dpr > 0 ? dpr : 1);
  return k > 0 ? (Math.round(v * k) + 0.5) / k : v;
}

// ── Texture (§3.2 layer 7) ────────────────────────────────────────────────────────────────────────────

/** Deterministic integer hash → [0, 1). Same value in every engine (Math.imul). */
export function hash01(i: number): number {
  let x = Math.imul(i | 0, 374761393);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** Side of the noise tile (px). */
export const GRAIN_SIZE = 64;

let factory: CanvasFactory | null = null;
let grainTile: LayerCanvas | null = null;
let grainByCtx = new WeakMap<object, CanvasPattern>();

function defaultCanvas(w: number, h: number): LayerCanvas | null {
  // An HTMLCanvasElement first: every engine can drawImage() it (OffscreenCanvas only since Safari 16.4).
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null;
}

/** Replaces how the kit makes canvases (tests with a fake canvas, workers); null restores the default. */
export function setCanvasFactory(f: CanvasFactory | null): void {
  factory = f;
  grainTile = null;
  grainByCtx = new WeakMap();
}

/** A canvas of `w` × `h` device pixels from the current factory, or null. Never throws. */
export function makeCanvas(w: number, h: number): LayerCanvas | null {
  try {
    return (factory ?? defaultCanvas)(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  } catch {
    return null;
  }
}

function context2d(c: LayerCanvas): Ctx2D | null {
  try {
    return (c.getContext('2d') as Ctx2D | null) ?? null;
  } catch {
    return null;
  }
}

function buildGrainTile(): LayerCanvas | null {
  const c = makeCanvas(GRAIN_SIZE, GRAIN_SIZE);
  const g = c && context2d(c);
  if (!c || !g) return null;
  try {
    const im = g.createImageData(GRAIN_SIZE, GRAIN_SIZE);
    for (let i = 0; i < GRAIN_SIZE * GRAIN_SIZE; i++) {
      const v = Math.round(hash01(i + 17) * 255);
      im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v;
      im.data[i * 4 + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    return c;
  } catch {
    return null;
  }
}

/**
 * A repeating 64 × 64 grey noise pattern (deterministic), for the texture layer: fill with
 * `globalCompositeOperation = 'soft-light'` at 3–8 % alpha, scaled with `pattern.setTransform` in the cache
 * pass (§3.6: scale 0.2). The tile is built once; the pattern is kept per context. Null without a canvas.
 */
export function grainPattern(ctx: Ctx2D): CanvasPattern | null {
  const hit = grainByCtx.get(ctx);
  if (hit) return hit;
  if (!grainTile) grainTile = buildGrainTile();
  if (!grainTile) return null;
  try {
    const p = ctx.createPattern(grainTile, 'repeat');
    if (p) grainByCtx.set(ctx, p);
    return p;
  } catch {
    return null;
  }
}

// ── Light (§4.3, R5) ──────────────────────────────────────────────────────────────────────────────────

interface KelvinEntry {
  rgb: RGB;
  hex: string;
}
const kelvinCache = new Map<number, KelvinEntry>();
const clampByte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

function kelvinEntry(K: number): KelvinEntry {
  // 10-K buckets: finer than the fit's own accuracy, and a lamp sweeping 2200 → 3600 K makes 140 entries.
  const b = Math.round((Number.isFinite(K) ? Math.min(40000, Math.max(1000, K)) : 6600) / 10);
  let e = kelvinCache.get(b);
  if (!e) {
    // Tanner Helland, "How to convert temperature (K) to RGB" (2012): a fit of the CIE 1964 blackbody table.
    const t = b / 10;
    const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
    const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    const bl = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    const rgb: RGB = [clampByte(r), clampByte(g), clampByte(bl)];
    e = { rgb, hex: '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('') };
    kelvinCache.set(b, e);
  }
  return e;
}

/**
 * The colour of a blackbody (filament) at `K` kelvin as sRGB 0..255, 1000–40000 K, in 10-K steps.
 * 2700 K is warm amber `[255, 167, 87]`, 6500 K is near white. The tuple is shared: do not mutate it.
 */
export function kelvin(K: number): RGB {
  return kelvinEntry(K).rgb;
}

/** `kelvin(K)` as '#rrggbb' (the `LAMP` tokens are exactly these). Cached, so it does not allocate per frame. */
export function kelvinHex(K: number): string {
  return kelvinEntry(K).hex;
}

// ── Gradients (§3.5) ──────────────────────────────────────────────────────────────────────────────────

/** Offsets of the 5-stop cylinder ramp: dark edge · specular 0.28 · local 0.5 · reflected light 0.82 · dark edge. */
export const CYLINDER_AT: readonly number[] = MATERIAL_AT.chrome;

/**
 * Linear gradient across a cylinder (a tube, a handle, a finger, a sleeve), from one silhouette edge
 * (x0, y0) to the other (x1, y1), perpendicular to its axis. Defaults to chrome; pass any material's
 * colours (and offsets; without them, or with a different count, the stops are evenly spaced).
 */
export function cylinderRamp(
  ctx: Ctx2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  colors: readonly string[] = MATERIAL.chrome,
  at: readonly number[] = CYLINDER_AT,
): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  const even = at.length !== colors.length;
  const last = Math.max(1, colors.length - 1);
  for (let i = 0; i < colors.length; i++) g.addColorStop(even ? i / last : Math.min(1, Math.max(0, at[i])), colors[i]);
  return g;
}

/**
 * Turned or radially brushed metal (knobs, chrome rings, brass): a conic gradient around (x, y) starting at
 * angle `a0` (radians) that alternates `light` and `dark` `n` times. Without `createConicGradient` (Safari
 * < 16.1) it falls back to a radial gradient from `light` at the centre to `dark` at radius `r`.
 */
export function conicMetal(ctx: Ctx2D, x: number, y: number, a0: number, light: string, dark: string, n = 4, r = 1): CanvasGradient {
  const segments = Math.max(1, Math.round(n)) * 2;
  if (typeof ctx.createConicGradient === 'function') {
    const g = ctx.createConicGradient(a0, x, y);
    for (let i = 0; i <= segments; i++) g.addColorStop(i / segments, i % 2 ? dark : light);
    return g;
  }
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1e-3, r));
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  return g;
}

// ── Layer cache (§3.9) ────────────────────────────────────────────────────────────────────────────────

/** Paints one static layer. `ctx` is scaled so 1 unit = 1 CSS px over `cssW` × `cssH`. */
export type LayerPainter = (ctx: Ctx2D, cssW: number, cssH: number, dpr: number) => void;

interface LayerEntry {
  w: number;
  h: number;
  dpr: number;
  canvas: LayerCanvas;
  used: number;
}

/** Frees a canvas's backing store now (Safari caps the total canvas memory of a page). */
function release(c: LayerCanvas): void {
  c.width = 0;
  c.height = 0;
}

/**
 * Static layers on offscreen canvases, keyed by what changes their look (`id|theme|wardrobe`, the
 * caller's key) × CSS size × DPR. `get` paints a layer only the first time that combination is seen and
 * then returns the same canvas, so a frame does a `drawImage` and nothing else. A new DPR for a key
 * (the window moved to another screen) repaints it and frees that key's canvases of the old DPR; two
 * sizes of one key live side by side (a 240-px portrait and a 48-px avatar). Past `max` canvases the
 * least recently used one is freed.
 */
export class LayerCache {
  private readonly byKey = new Map<string, LayerEntry[]>();
  private clock = 0;
  private count = 0;

  constructor(private readonly max = 32) {}

  /** Number of cached canvases. */
  get size(): number {
    return this.count;
  }

  /** Whether `get` would return a cached canvas without painting. */
  has(key: string, cssW: number, cssH: number, dpr: number): boolean {
    return this.find(key, cssW, cssH, dpr) !== null;
  }

  /**
   * The layer `key` at `cssW` × `cssH` CSS px and `dpr`, painted by `paint` on a miss. Null when no canvas
   * can be made (draw the layer directly then). Draw it with `ctx.drawImage(layer, x, y, w, h)`.
   */
  get(key: string, cssW: number, cssH: number, dpr: number, paint: LayerPainter): LayerCanvas | null {
    const hit = this.find(key, cssW, cssH, dpr);
    if (hit) {
      hit.used = ++this.clock;
      return hit.canvas;
    }
    const wPx = Math.max(1, Math.round(cssW * dpr));
    const hPx = Math.max(1, Math.round(cssH * dpr));
    const canvas = makeCanvas(wPx, hPx);
    const ctx = canvas && context2d(canvas);
    if (!canvas || !ctx) return null;
    ctx.setTransform(wPx / Math.max(1e-6, cssW), 0, 0, hPx / Math.max(1e-6, cssH), 0, 0);
    try {
      paint(ctx, cssW, cssH, dpr);
    } catch (err) {
      release(canvas);
      throw err;
    }
    const list = this.byKey.get(key) ?? [];
    // One screen at a time: canvases of this key at another DPR will not be asked for again.
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].dpr !== dpr) {
        release(list[i].canvas);
        list.splice(i, 1);
        this.count--;
      }
    }
    list.push({ w: cssW, h: cssH, dpr, canvas, used: ++this.clock });
    this.byKey.set(key, list);
    this.count++;
    while (this.count > this.max) this.evictOldest();
    return canvas;
  }

  /** Forgets every size of `key` (its look changed for good). */
  delete(key: string): void {
    const list = this.byKey.get(key);
    if (!list) return;
    for (const e of list) release(e.canvas);
    this.count -= list.length;
    this.byKey.delete(key);
  }

  /** Forgets everything (a theme change, a lost context). */
  clear(): void {
    for (const list of this.byKey.values()) for (const e of list) release(e.canvas);
    this.byKey.clear();
    this.count = 0;
  }

  private find(key: string, cssW: number, cssH: number, dpr: number): LayerEntry | null {
    const list = this.byKey.get(key);
    if (!list) return null;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.w === cssW && e.h === cssH && e.dpr === dpr) return e;
    }
    return null;
  }

  private evictOldest(): void {
    let oldKey: string | null = null;
    let oldIdx = -1;
    let oldUsed = Infinity;
    for (const [k, list] of this.byKey) {
      for (let i = 0; i < list.length; i++) {
        if (list[i].used < oldUsed) {
          oldUsed = list[i].used;
          oldKey = k;
          oldIdx = i;
        }
      }
    }
    if (oldKey === null) return;
    const list = this.byKey.get(oldKey) as LayerEntry[];
    release(list[oldIdx].canvas);
    list.splice(oldIdx, 1);
    if (list.length === 0) this.byKey.delete(oldKey);
    this.count--;
  }
}
