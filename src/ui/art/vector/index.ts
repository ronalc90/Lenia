/**
 * The vector kit of scientific realism (ADR-029, docs/ARTE-REALISTA.md §3). Shared by VELA (P1), the people
 * (P2), the scenes (P3) and the plates (P4); P1 owns it and may refine any implementation without changing a
 * signature.
 *
 *  - Paths are hand-written SVG path data (`rr`, `circ` build the parametric ones) in the 100 × 100 box,
 *    turned into `Path2D` once, the first time they are drawn (§3.3): `fillPath`, `strokePath`, `clipPath`.
 *    Without Path2D (Node tests) `tracePath` walks the same data with moveTo / lineTo / bezierCurveTo /
 *    ellipse, so a recording context sees every vertex.
 *  - Line weights are CSS px at any DPR (§3.8): `px`, `hairline`, `lineWidth`, `snap`.
 *  - Light and material: `kelvin` (blackbody lamp colour), `cylinderRamp` (tubes, handles, fingers),
 *    `conicMetal` (turned or radially brushed metal), `grainPattern` (powder coat, paper).
 *  - `LayerCache`: static layers drawn once per key × size × DPR on an offscreen canvas (§3.9);
 *    `fontsEpoch` for the key of a layer with text, so it is repainted once the web fonts arrive.
 *  - `rgba`: colour strings from a bounded cache (a per-frame colour without a new string).
 *
 * Deterministic (no Math.random), no ctx.filter (Safari has none), no shadowBlur. The per-frame calls
 * (`px`, `hairline`, `lineWidth`, `snap`, `kelvin`, `kelvinHex`, `hash01`, `grainPattern`, `rgba`, the path
 * helpers once a path has been drawn, and a `LayerCache.get` hit) allocate nothing; `cylinderRamp` and `conicMetal` return a new gradient, so build
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

// ── Path data on a context (§3.3) ─────────────────────────────────────────────────────────────────────
//
// Every shape is SVG path data. In a browser it becomes a Path2D the first time it is drawn and is kept
// (one Map lookup per draw afterwards, no allocation). Where Path2D does not exist (Node tests, some
// workers) the same data is traced with moveTo / lineTo / bezierCurveTo / ellipse, so a recording
// context sees every vertex and the geometry can be tested.

const path2dCache = new Map<string, Path2D | null>();

/** The Path2D of SVG path data `d`, built once and kept; null where Path2D does not exist. */
export function path2d(d: string): Path2D | null {
  const hit = path2dCache.get(d);
  if (hit !== undefined) return hit;
  let p: Path2D | null = null;
  if (typeof Path2D === 'function') {
    try {
      p = new Path2D(d);
    } catch {
      p = null;
    }
  }
  path2dCache.set(d, p);
  return p;
}

// Parsed path data for the tracer: [op, ...args] runs in one number array per `d`.
const OP_M = 0;
const OP_L = 1;
const OP_C = 2;
const OP_Q = 3;
const OP_A = 4;
const OP_Z = 5;
const parsedCache = new Map<string, number[]>();
const PATH_TOKEN = /[MmLlHhVvCcQqAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

/**
 * SVG path data → absolute ops. Supports M L H V C Q A Z and their relative forms (what `rr`, `circ` and
 * hand-written data use). Arc flags must be separated by spaces or commas ('0 0 1', never '001').
 */
function parsePath(d: string): number[] {
  const hit = parsedCache.get(d);
  if (hit) return hit;
  const tok = d.match(PATH_TOKEN) ?? [];
  const out: number[] = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const num = (): number => Number(tok[i++]);
  const isNum = (): boolean => i < tok.length && !/[A-Za-z]/.test(tok[i]);
  while (i < tok.length) {
    if (!isNum()) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M':
        x = ox + num();
        y = oy + num();
        sx = x;
        sy = y;
        out.push(OP_M, x, y);
        cmd = rel ? 'l' : 'L'; // implicit lineto after a moveto
        break;
      case 'L':
        x = ox + num();
        y = oy + num();
        out.push(OP_L, x, y);
        break;
      case 'H':
        x = ox + num();
        out.push(OP_L, x, y);
        break;
      case 'V':
        y = oy + num();
        out.push(OP_L, x, y);
        break;
      case 'C': {
        const a = ox + num();
        const b = oy + num();
        const c = ox + num();
        const e = oy + num();
        x = ox + num();
        y = oy + num();
        out.push(OP_C, a, b, c, e, x, y);
        break;
      }
      case 'Q': {
        const a = ox + num();
        const b = oy + num();
        x = ox + num();
        y = oy + num();
        out.push(OP_Q, a, b, x, y);
        break;
      }
      case 'A': {
        const rx = num();
        const ry = num();
        const rot = num();
        const large = num();
        const sweep = num();
        const x0 = x;
        const y0 = y;
        x = ox + num();
        y = oy + num();
        out.push(OP_A, x0, y0, rx, ry, rot, large, sweep, x, y);
        break;
      }
      case 'Z':
        x = sx;
        y = sy;
        out.push(OP_Z);
        break;
      default:
        i = tok.length; // unknown command: stop rather than loop
    }
  }
  parsedCache.set(d, out);
  return out;
}

/** An SVG arc (endpoint form) as a canvas ellipse (centre form), W3C SVG implementation notes F.6.5. */
function arcOnto(ctx: Ctx2D, x1: number, y1: number, rxIn: number, ryIn: number, rotDeg: number, large: number, sweep: number, x2: number, y2: number): void {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) {
    ctx.lineTo(x2, y2);
    return;
  }
  const phi = (rotDeg * Math.PI) / 180;
  const cs = Math.cos(phi);
  const sn = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const xp = cs * dx + sn * dy;
  const yp = -sn * dx + cs * dy;
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) {
    rx *= Math.sqrt(lam);
    ry *= Math.sqrt(lam);
  }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const den = rx * rx * yp * yp + ry * ry * xp * xp;
  const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * yp) / ry;
  const cyp = (-co * ry * xp) / rx;
  const cx = cs * cxp - sn * cyp + (x1 + x2) / 2;
  const cy = sn * cxp + cs * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const ux = (xp - cxp) / rx;
  const uy = (yp - cyp) / ry;
  const th = ang(1, 0, ux, uy);
  let dth = ang(ux, uy, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dth > 0) dth -= Math.PI * 2;
  else if (sweep && dth < 0) dth += Math.PI * 2;
  ctx.ellipse(cx, cy, rx, ry, phi, th, th + dth, !sweep);
}

/** Adds SVG path data `d` to the context's current path (no beginPath): the tracer behind the helpers. */
export function tracePath(ctx: Ctx2D, d: string): void {
  const o = parsePath(d);
  let i = 0;
  while (i < o.length) {
    switch (o[i]) {
      case OP_M:
        ctx.moveTo(o[i + 1], o[i + 2]);
        i += 3;
        break;
      case OP_L:
        ctx.lineTo(o[i + 1], o[i + 2]);
        i += 3;
        break;
      case OP_C:
        ctx.bezierCurveTo(o[i + 1], o[i + 2], o[i + 3], o[i + 4], o[i + 5], o[i + 6]);
        i += 7;
        break;
      case OP_Q:
        ctx.quadraticCurveTo(o[i + 1], o[i + 2], o[i + 3], o[i + 4]);
        i += 5;
        break;
      case OP_A:
        arcOnto(ctx, o[i + 1], o[i + 2], o[i + 3], o[i + 4], o[i + 5], o[i + 6], o[i + 7], o[i + 8], o[i + 9]);
        i += 10;
        break;
      default:
        ctx.closePath();
        i += 1;
    }
  }
}

/** Fills path data (`'evenodd'` for rings and bezels). */
export function fillPath(ctx: Ctx2D, d: string, rule: CanvasFillRule = 'nonzero'): void {
  const p = path2d(d);
  if (p) ctx.fill(p, rule);
  else {
    ctx.beginPath();
    tracePath(ctx, d);
    ctx.fill(rule);
  }
}

/** Strokes path data with the current stroke style and line width. */
export function strokePath(ctx: Ctx2D, d: string): void {
  const p = path2d(d);
  if (p) ctx.stroke(p);
  else {
    ctx.beginPath();
    tracePath(ctx, d);
    ctx.stroke();
  }
}

/** Clips to path data (inside a save / restore): layers 3–7 of §3.2 are clipped to the layer-1 silhouette. */
export function clipPath(ctx: Ctx2D, d: string, rule: CanvasFillRule = 'nonzero'): void {
  const p = path2d(d);
  if (p) ctx.clip(p, rule);
  else {
    ctx.beginPath();
    tracePath(ctx, d);
    ctx.clip(rule);
  }
}

// ── Colour strings without allocation ─────────────────────────────────────────────────────────────────

const rgbaCache = new Map<number, string>();

/**
 * 'rgba(r,g,b,a)' for 0..255 channels and alpha 0..1 (quantised to 1/255), from a bounded cache, so a
 * per-frame colour (a lamp's brightness, a trace's fade) costs a Map lookup, not a new string.
 */
export function rgba(r: number, g: number, b: number, a = 1): string {
  const R = clampByteFast(r);
  const G = clampByteFast(g);
  const B = clampByteFast(b);
  const A = clampByteFast(a * 255);
  const key = ((R << 24) | (G << 16) | (B << 8) | A) >>> 0;
  let s = rgbaCache.get(key);
  if (s === undefined) {
    if (rgbaCache.size > 4096) rgbaCache.clear();
    s = `rgba(${R},${G},${B},${+(A / 255).toFixed(3)})`;
    rgbaCache.set(key, s);
  }
  return s;
}

function clampByteFast(v: number): number {
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}

// ── Fonts ─────────────────────────────────────────────────────────────────────────────────────────────

let fontGen = 0;
let fontWatch = false;

/**
 * A counter that goes up each time the page finishes loading fonts. Put it in the key of a cached layer
 * that draws text (an engraved plate), so the layer painted with a fallback face is repainted once
 * JetBrains Mono or Inter arrive.
 */
export function fontsEpoch(): number {
  if (!fontWatch) {
    fontWatch = true;
    try {
      const fonts = typeof document !== 'undefined' ? (document as Document & { fonts?: FontFaceSet }).fonts : undefined;
      fonts?.addEventListener?.('loadingdone', () => void fontGen++);
    } catch {
      /* no FontFaceSet: the epoch stays 0 */
    }
  }
  return fontGen;
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
  // An engine (or a test double) may lack createConicGradient or hand back nothing: use the radial then.
  const cg = typeof ctx.createConicGradient === 'function' ? (ctx.createConicGradient(a0, x, y) as CanvasGradient | undefined) : undefined;
  if (cg && typeof cg.addColorStop === 'function') {
    for (let i = 0; i <= segments; i++) cg.addColorStop(i / segments, i % 2 ? dark : light);
    return cg;
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
