/**
 * Drawing helpers shared by the people of scientific realism (ADR-029, docs/ARTE-REALISTA.md §3, §5):
 * hand-written SVG path data replayed onto any 2D context, tapered tubes for fingers and sleeves, the
 * "offset stroke" light bands (rim, bounce and form shadow on any silhouette) and a sprite cache on
 * top of the vector kit's `LayerCache`.
 *
 * Why paths are replayed instead of `new Path2D(d)`: the same code then runs on a real canvas, in a
 * cache pass and on the recording context of the tests (which checks every vertex stays in its box).
 * The SVG string is still the authoring format (§3.3): it is parsed once, at module load, into a flat
 * list of numbers, and replaying it allocates nothing.
 */
import { LayerCache, conicMetal, type Ctx2D } from '../vector';

export type { Ctx2D } from '../vector';

export const TAU = Math.PI * 2;

/** A parsed path: [op, ...args] repeated. op 0 = M x y · 1 = L x y · 2 = C 6 · 3 = Q 4 · 4 = Z. */
export type Shape = readonly number[];

const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, Z: 0 };

/**
 * Parses absolute and relative M L H V C S Q T Z (no arcs: circles are `ctx.ellipse`, rounded
 * rectangles `rrect`). Runs at module load or in a cache pass, never per frame.
 */
export function parsePath(d: string): Shape {
  const out: number[] = [];
  const tok = d.match(/[MLHVCSQTZmlhvcsqtz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  let i = 0;
  let cmd = 'M';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cx = 0; // last control point (for S / T)
  let cy = 0;
  let prev = '';
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    if (up === 'Z') {
      out.push(4);
      x = sx;
      y = sy;
      prev = 'Z';
      continue;
    }
    if (i >= tok.length || /[A-Za-z]/.test(tok[i])) {
      if (ARGS[up] === 0) continue;
      break; // a command without numbers: malformed, stop
    }
    switch (up) {
      case 'M':
        x = ox + num();
        y = oy + num();
        sx = x;
        sy = y;
        out.push(0, x, y);
        cmd = rel ? 'l' : 'L'; // implicit lineto after the first pair
        break;
      case 'L':
        x = ox + num();
        y = oy + num();
        out.push(1, x, y);
        break;
      case 'H':
        x = ox + num();
        out.push(1, x, y);
        break;
      case 'V':
        y = (rel ? y : 0) + num();
        out.push(1, x, y);
        break;
      case 'C': {
        const a = ox + num();
        const b = oy + num();
        cx = ox + num();
        cy = oy + num();
        x = ox + num();
        y = oy + num();
        out.push(2, a, b, cx, cy, x, y);
        break;
      }
      case 'S': {
        const a = prev === 'C' || prev === 'S' ? 2 * x - cx : x;
        const b = prev === 'C' || prev === 'S' ? 2 * y - cy : y;
        cx = ox + num();
        cy = oy + num();
        x = ox + num();
        y = oy + num();
        out.push(2, a, b, cx, cy, x, y);
        break;
      }
      case 'Q':
        cx = ox + num();
        cy = oy + num();
        x = ox + num();
        y = oy + num();
        out.push(3, cx, cy, x, y);
        break;
      case 'T':
        cx = prev === 'Q' || prev === 'T' ? 2 * x - cx : x;
        cy = prev === 'Q' || prev === 'T' ? 2 * y - cy : y;
        x = ox + num();
        y = oy + num();
        out.push(3, cx, cy, x, y);
        break;
      default:
        i++;
    }
    prev = up;
  }
  return out;
}

/** Adds a parsed shape to the current path (no beginPath: several shapes can make one clip or fill). */
export function addShape(ctx: Ctx2D, s: Shape, dx = 0, dy = 0): void {
  for (let i = 0; i < s.length; ) {
    switch (s[i]) {
      case 0:
        ctx.moveTo(s[i + 1] + dx, s[i + 2] + dy);
        i += 3;
        break;
      case 1:
        ctx.lineTo(s[i + 1] + dx, s[i + 2] + dy);
        i += 3;
        break;
      case 2:
        ctx.bezierCurveTo(s[i + 1] + dx, s[i + 2] + dy, s[i + 3] + dx, s[i + 4] + dy, s[i + 5] + dx, s[i + 6] + dy);
        i += 7;
        break;
      case 3:
        ctx.quadraticCurveTo(s[i + 1] + dx, s[i + 2] + dy, s[i + 3] + dx, s[i + 4] + dy);
        i += 5;
        break;
      default:
        ctx.closePath();
        i += 1;
    }
  }
}

/** beginPath + the shape. */
export function trace(ctx: Ctx2D, s: Shape, dx = 0, dy = 0): void {
  ctx.beginPath();
  addShape(ctx, s, dx, dy);
}

/** Bounding box of a shape's points (control points included): [x0, y0, x1, y1]. */
export function bounds(s: Shape): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < s.length; ) {
    const n = s[i] === 0 || s[i] === 1 ? 2 : s[i] === 2 ? 6 : s[i] === 3 ? 4 : 0;
    for (let k = 0; k < n; k += 2) {
      const x = s[i + 1 + k];
      const y = s[i + 2 + k];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    i += 1 + n;
  }
  return [x0, y0, x1, y1];
}

/** Rounded rectangle with cubic corners, added to the current path. */
export function rrect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  const c = k * 0.4477; // 1 - 0.5523: the cubic quarter-circle handle
  ctx.moveTo(x + k, y);
  ctx.lineTo(x + w - k, y);
  ctx.bezierCurveTo(x + w - c, y, x + w, y + c, x + w, y + k);
  ctx.lineTo(x + w, y + h - k);
  ctx.bezierCurveTo(x + w, y + h - c, x + w - c, y + h, x + w - k, y + h);
  ctx.lineTo(x + k, y + h);
  ctx.bezierCurveTo(x + c, y + h, x, y + h - c, x, y + h - k);
  ctx.lineTo(x, y + k);
  ctx.bezierCurveTo(x, y + c, x + c, y, x + k, y);
  ctx.closePath();
}

/** Ellipse added to the current path (its own subpath). */
export function oval(ctx: Ctx2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.moveTo(x + Math.cos(rot) * Math.max(0.01, rx), y + Math.sin(rot) * Math.max(0.01, rx));
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
}

// ── Tubes: fingers, thumbs, cords (§3.5-2) ────────────────────────────────────────────────────────────

/**
 * Outline of a tapered tube along a centreline (x0 y0 x1 y1 …) with a radius per point and a round
 * cap at the end (`cap` = how far the cap bulges past the last point, in radii). The base is left
 * open-ended flat (it hides in the palm or a cuff). Catmull-Rom through the offset points, so a bent
 * finger stays smooth. Pure: returns a Shape.
 */
export function tube(pts: readonly number[], radii: readonly number[], cap = 1): Shape {
  const n = pts.length / 2;
  const L: number[] = [];
  const R: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let tx = pts[b * 2] - pts[a * 2];
    let ty = pts[b * 2 + 1] - pts[a * 2 + 1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const r = radii[Math.min(i, radii.length - 1)];
    // Left = the normal rotated −90° from the tangent (in y-down space).
    L.push(pts[i * 2] + ty * r, pts[i * 2 + 1] - tx * r);
    R.push(pts[i * 2] - ty * r, pts[i * 2 + 1] + tx * r);
  }
  const out: number[] = [0, L[0], L[1]];
  catmull(out, L);
  // Round cap: two cubics from L[n-1] through the apex to R[n-1].
  const ex = pts[(n - 1) * 2];
  const ey = pts[(n - 1) * 2 + 1];
  let tx = ex - pts[(n - 2) * 2];
  let ty = ey - pts[(n - 2) * 2 + 1];
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl;
  ty /= tl;
  const r = radii[Math.min(n - 1, radii.length - 1)];
  const ax = ex + tx * r * cap;
  const ay = ey + ty * r * cap;
  const k = 0.5523;
  const lx = L[(n - 1) * 2];
  const ly = L[(n - 1) * 2 + 1];
  const rx = R[(n - 1) * 2];
  const ry = R[(n - 1) * 2 + 1];
  out.push(2, lx + tx * r * cap * k, ly + ty * r * cap * k, ax + (lx - ex) * k, ay + (ly - ey) * k, ax, ay);
  out.push(2, ax + (rx - ex) * k, ay + (ry - ey) * k, rx + tx * r * cap * k, ry + ty * r * cap * k, rx, ry);
  const back: number[] = [];
  for (let i = n - 1; i >= 0; i--) back.push(R[i * 2], R[i * 2 + 1]);
  catmull(out, back);
  out.push(4);
  return out;
}

/** Appends Catmull-Rom cubic segments through p (from its first point, already the current point). */
function catmull(out: number[], p: readonly number[]): void {
  const n = p.length / 2;
  for (let i = 0; i < n - 1; i++) {
    const i0 = Math.max(0, i - 1);
    const i3 = Math.min(n - 1, i + 2);
    const x1 = p[i * 2];
    const y1 = p[i * 2 + 1];
    const x2 = p[(i + 1) * 2];
    const y2 = p[(i + 1) * 2 + 1];
    out.push(2, x1 + (x2 - p[i0 * 2]) / 6, y1 + (y2 - p[i0 * 2 + 1]) / 6, x2 - (p[i3 * 2] - x1) / 6, y2 - (p[i3 * 2 + 1] - y1) / 6, x2, y2);
  }
}

/** A smooth open curve through points (x0 y0 x1 y1 …), as a Shape (for strands, seams, wrinkles). */
export function curve(pts: readonly number[]): Shape {
  const out: number[] = [0, pts[0], pts[1]];
  catmull(out, pts);
  return out;
}

// ── Light (§3.2 layers 3, 4, 6) ───────────────────────────────────────────────────────────────────────

/**
 * An inner band along the edges of a silhouette that face direction (lx, ly) (a unit vector toward
 * the light): the path is stroked shifted away from the light by half the band, inside its own clip,
 * so only the edges facing the light keep a band, thickest where they face it squarely. Three nested
 * passes give a soft falloff. Call with the clip already set to the same silhouette.
 */
export function edgeBand(ctx: Ctx2D, s: Shape, lx: number, ly: number, width: number, color: string, alpha: number, op: GlobalCompositeOperation = 'source-over'): void {
  ctx.save();
  ctx.globalCompositeOperation = op;
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  for (let p = 0; p < 3; p++) {
    const w = width * (1 - p * 0.33);
    ctx.globalAlpha = alpha * (p === 0 ? 0.45 : p === 1 ? 0.65 : 1);
    ctx.lineWidth = w;
    trace(ctx, s, -lx * w * 0.5, -ly * w * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

/** A soft elliptical spot (radial gradient through a transform): highlights, folds, contact shadows. */
export function spot(ctx: Ctx2D, x: number, y: number, rx: number, ry: number, rot: number, rgb: string, a: number, op: GlobalCompositeOperation = 'source-over'): void {
  if (a <= 0 || rx <= 0 || ry <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = op;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(0.55, `rgba(${rgb},${a * 0.45})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * The kit's `conicMetal`, guarded: a context whose `createConicGradient` gives nothing usable (an old
 * engine, a recording context in tests) gets the radial fallback instead of a throw.
 */
export function metal(ctx: Ctx2D, x: number, y: number, a0: number, light: string, dark: string, n = 4, r = 1): CanvasGradient {
  try {
    return conicMetal(ctx, x, y, a0, light, dark, n, r);
  } catch {
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1e-3, r));
    g.addColorStop(0, light);
    g.addColorStop(1, dark);
    return g;
  }
}

/** '#rrggbb' → 'r,g,b' (cached: the same strings come back every frame). */
const rgbCache = new Map<string, string>();
export function rgbOf(hex: string): string {
  let v = rgbCache.get(hex);
  if (!v) {
    const h = hex.replace('#', '');
    v = `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`;
    rgbCache.set(hex, v);
  }
  return v;
}

/** Linear blend of two '#rrggbb' colours → '#rrggbb'. Cache-pass helper. */
export function mixHex(a: string, b: string, k: number): string {
  const pa = rgbOf(a).split(',').map(Number);
  const pb = rgbOf(b).split(',').map(Number);
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

// ── The sprite cache (§3.9) ───────────────────────────────────────────────────────────────────────────

/** Static layers of the people: coats, hands, the Polaroid, the notebook, the recorder's body. */
export const PEOPLE_CACHE = new LayerCache(48);

/** The page's device pixel ratio as the portraits use it (1–3). */
export function screenDpr(): number {
  const d = (globalThis as { devicePixelRatio?: number }).devicePixelRatio;
  return typeof d === 'number' && d > 0 ? Math.min(3, Math.max(1, d)) : 1;
}

interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

function transformOf(ctx: Ctx2D): Affine | null {
  try {
    const m = (ctx.getTransform as (() => Affine | undefined) | undefined)?.call(ctx);
    if (m && typeof m.a === 'number' && Number.isFinite(m.a) && Number.isFinite(m.d)) return m;
  } catch {
    /* a context without transforms (tests) */
  }
  return null;
}

/** CSS px per current unit and the DPR, read from the context (1 and 1 when unknown). */
export function metrics(ctx: Ctx2D): { css: number; dpr: number } {
  const m = transformOf(ctx);
  const dpr = screenDpr();
  if (!m) return { css: 1, dpr: 1 };
  const s = Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d));
  return { css: s > 0 ? s / dpr : 1, dpr };
}

/** Paints a static layer in its own units, with `css` = CSS px per unit (for §3.8 line weights). */
export type SpritePainter = (ctx: Ctx2D, css: number, dpr: number) => void;

/**
 * Draws the static layer `key` covering (x, y, w, h) in the current units: painted once on an
 * offscreen canvas at the current device resolution, then blitted (pixel-exact when the transform has
 * no rotation). Without a canvas or a readable transform (tests), it paints straight onto `ctx`.
 */
export function sprite(ctx: Ctx2D, key: string, x: number, y: number, w: number, h: number, paint: SpritePainter): void {
  const m = transformOf(ctx);
  if (!m) {
    paint(ctx, 1, 1);
    return;
  }
  const dpr = screenDpr();
  const s = Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d));
  const css = s / dpr;
  const cssW = Math.max(1, Math.round(w * css));
  const cssH = Math.max(1, Math.round(h * css));
  const layer = PEOPLE_CACHE.get(key, cssW, cssH, dpr, (c, cw, ch) => {
    c.scale(cw / w, ch / h);
    c.translate(-x, -y);
    paint(c, cw / w, dpr);
  });
  if (!layer) {
    paint(ctx, css, dpr);
    return;
  }
  if (Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9 && m.a > 0 && m.d > 0) {
    // Axis-aligned: put the layer's pixels on the device grid, 1:1.
    const dx = Math.round(m.a * x + m.e);
    const dy = Math.round(m.d * y + m.f);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, dx, dy);
    ctx.restore();
  } else {
    ctx.drawImage(layer, x, y, w, h);
  }
}

/** The UI language as the page states it (`<html lang>`), for text drawn inside the art. */
export function pageLang(): 'es' | 'en' {
  const d = (globalThis as { document?: { documentElement?: { lang?: string } } }).document;
  return d?.documentElement?.lang?.startsWith('en') ? 'en' : 'es';
}

/** Deterministic integer hash → [0, 1). */
export function hash(i: number, seed = 0): number {
  let x = Math.imul((i | 0) + Math.imul(seed | 0, 668265263), 374761393);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** Monospace text with hand-set tracking (§4.2: never depend on ctx.letterSpacing). Left-aligned at (x, y). */
export function trackedText(ctx: Ctx2D, s: string, x: number, y: number, size: number, tracking: number): number {
  let cx = x;
  for (const ch of s) {
    ctx.fillText(ch, cx, y);
    const m = ctx.measureText(ch) as TextMetrics | undefined;
    cx += (m && Number.isFinite(m.width) ? m.width : size * 0.6) + size * tracking;
  }
  return cx - x - size * tracking;
}
