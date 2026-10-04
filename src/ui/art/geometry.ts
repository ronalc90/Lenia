/**
 * Shared vector motifs of the icon set (docs/ARTE.md §5). Every helper returns SVG path data on the
 * 24-unit grid, rounded to 2 decimals, so the same drop / star / moon / clock appears identical in
 * every icon that uses it. Pure string builders, no DOM.
 */

/** Round to 2 decimals and drop trailing zeros. */
export const n = (v: number): string => {
  const r = Math.round(v * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toString();
};

const pt = (x: number, y: number): string => `${n(x)} ${n(y)}`;

/**
 * Esencia drop: tip at (cx, tip), round belly of radius r centred 1.82·r below the tip.
 * The main icon uses drop(12, 3.25, 6): belly 6..18 wide, bottom at 20.17.
 */
export function drop(cx: number, tip: number, r: number): string {
  const cy = tip + 1.82 * r;
  return (
    `M${pt(cx, tip)}C${pt(cx + 0.62 * r, tip + 0.78 * r)} ${pt(cx + r, tip + 1.33 * r)} ${pt(cx + r, cy)}` +
    `A${n(r)} ${n(r)} 0 0 1 ${pt(cx - r, cy)}` +
    `C${pt(cx - r, tip + 1.33 * r)} ${pt(cx - 0.62 * r, tip + 0.78 * r)} ${pt(cx, tip)}Z`
  );
}

/** Small highlight arc inside a drop (lower left of the belly). */
export function dropShine(cx: number, tip: number, r: number): string {
  const cy = tip + 1.82 * r;
  const rr = r * 0.46;
  const a0 = Math.PI * 0.62;
  const a1 = Math.PI * 0.98;
  const x0 = cx + Math.cos(a1) * rr * 1.05;
  const y0 = cy + Math.sin(a1) * rr * 1.05;
  const x1 = cx + Math.cos(a0) * rr * 1.05;
  const y1 = cy + Math.sin(a0) * rr * 1.05;
  return `M${pt(x0 - 0.15 * r, y0 + 0.05 * r)}A${n(rr)} ${n(rr)} 0 0 0 ${pt(x1 - 0.12 * r, y1 + 0.12 * r)}`;
}

/**
 * The Spark (Destello): a four-point star with concave sides. `k` is how plump the sides are
 * (0.18 slim .. 0.3 chubby).
 */
export function star4(cx: number, cy: number, r: number, k = 0.24): string {
  const c = r * k;
  return (
    `M${pt(cx, cy - r)}Q${pt(cx + c, cy - c)} ${pt(cx + r, cy)}` +
    `Q${pt(cx + c, cy + c)} ${pt(cx, cy + r)}` +
    `Q${pt(cx - c, cy + c)} ${pt(cx - r, cy)}` +
    `Q${pt(cx - c, cy - c)} ${pt(cx, cy - r)}Z`
  );
}

/**
 * Crescent moon: the disc (cx, cy, r) minus a disc of radius r2 centred at (cx + dx, cy + dy).
 * Falls back to a plain circle when the two circles do not intersect.
 */
export function crescent(cx: number, cy: number, r: number, dx: number, dy: number, r2: number): string {
  const d = Math.hypot(dx, dy);
  if (d >= r + r2 || d <= Math.abs(r - r2)) return circlePath(cx, cy, r);
  const a = (r * r - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r * r - a * a));
  const ux = dx / d;
  const uy = dy / d;
  const mx = cx + ux * a;
  const my = cy + uy * a;
  const p1x = mx - uy * h;
  const p1y = my + ux * h;
  const p2x = mx + uy * h;
  const p2y = my - ux * h;
  // Outer arc the long way round (away from the bite), inner arc back along the bite.
  return `M${pt(p1x, p1y)}A${n(r)} ${n(r)} 0 1 1 ${pt(p2x, p2y)}A${n(r2)} ${n(r2)} 0 0 0 ${pt(p1x, p1y)}Z`;
}

/** A full circle as path data (for fills inside compound paths). */
export function circlePath(cx: number, cy: number, r: number): string {
  return `M${pt(cx - r, cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`;
}

/** An open arc from angle a0 to a1 (degrees, 0 = +x, clockwise on screen). */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const r0 = (a0 * Math.PI) / 180;
  const r1 = (a1 * Math.PI) / 180;
  const large = Math.abs(a1 - a0) % 360 > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M${pt(cx + Math.cos(r0) * r, cy + Math.sin(r0) * r)}A${n(r)} ${n(r)} 0 ${large} ${sweep} ${pt(cx + Math.cos(r1) * r, cy + Math.sin(r1) * r)}`;
}

/** Point on a circle (degrees). */
export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}

/** Open chevron arrow head at (x, y) pointing along `deg`, arms of length `s`. */
export function head(x: number, y: number, deg: number, s = 2.6): string {
  const [ax, ay] = polar(x, y, s, deg + 180 - 40);
  const [bx, by] = polar(x, y, s, deg + 180 + 40);
  return `M${pt(ax, ay)}L${pt(x, y)}L${pt(bx, by)}`;
}

/** Arc with an arrow head at its end (a1). */
export function arcArrow(cx: number, cy: number, r: number, a0: number, a1: number, s = 2.4): string {
  const [x, y] = polar(cx, cy, r, a1);
  const tangent = a1 + (a1 > a0 ? 90 : -90);
  return arc(cx, cy, r, a0, a1) + head(x, y, tangent, s);
}

/** Gear outline with `teeth` rounded-ish teeth between radii rIn and rOut. */
export function gear(cx: number, cy: number, rIn: number, rOut: number, teeth = 8): string {
  const pts: string[] = [];
  const step = 360 / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step - 90;
    for (const [da, r] of [
      [-0.5, rIn],
      [-0.2, rIn],
      [-0.12, rOut],
      [0.12, rOut],
      [0.2, rIn],
    ] as const) {
      const [x, y] = polar(cx, cy, r, a + da * step);
      pts.push(pt(x, y));
    }
  }
  return `M${pts.join('L')}Z`;
}

/** Archimedean spiral from the centre out (turns, start radius r0, end radius r1). */
export function spiral(cx: number, cy: number, r0: number, r1: number, turns: number, startDeg = 0): string {
  const steps = Math.max(12, Math.round(turns * 28));
  const out: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const [x, y] = polar(cx, cy, r0 + (r1 - r0) * t, startDeg + t * turns * 360);
    out.push(pt(x, y));
  }
  return `M${out.join('L')}`;
}

/** Infinity sign centred at (cx, cy), half-width w, half-height h. */
export function infinity(cx: number, cy: number, w: number, h: number): string {
  const k = 0.35 * w;
  return (
    `M${pt(cx, cy)}C${pt(cx + k, cy - h)} ${pt(cx + w, cy - h)} ${pt(cx + w, cy)}` +
    `C${pt(cx + w, cy + h)} ${pt(cx + k, cy + h)} ${pt(cx, cy)}` +
    `C${pt(cx - k, cy - h)} ${pt(cx - w, cy - h)} ${pt(cx - w, cy)}` +
    `C${pt(cx - w, cy + h)} ${pt(cx - k, cy + h)} ${pt(cx, cy)}Z`
  );
}

/** Ellipse as path data: semi-axis `a` along `deg`, `b` across (for fills that need one path). */
export function ellipsePath(cx: number, cy: number, a: number, b: number, deg: number): string {
  const [x1, y1] = polar(cx, cy, a, deg);
  const [x2, y2] = polar(cx, cy, a, deg + 180);
  return `M${pt(x1, y1)}A${n(a)} ${n(b)} ${n(deg)} 1 0 ${pt(x2, y2)}A${n(a)} ${n(b)} ${n(deg)} 1 0 ${pt(x1, y1)}Z`;
}
