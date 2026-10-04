/**
 * The dish, as the art bible wants it to look (docs/ARTE.md §8.3) — a Canvas 2D reference for the
 * dish agent's shader, and a ready illustration for splash / loading / store screens.
 *
 * Layers, bottom to top: the steel lab bench in the polar night (frost in the corners), the dish's
 * soft shadow and the cool light it throws on the bench, the agar (bluer at the centre, a lit
 * meniscus at the wall), the creatures (real patterns through MATTER_ART + family tints), the glass
 * wall (frost-white rim, thicker at the bottom), frost crystals on the glass, a warm candle
 * reflection (VELA is nearby), and the growth ring (dashed, the next dish size).
 */
import { MATTER_ART, tintedStops, type Stop } from './matter';
import { renderSpecimen, type FieldPattern } from './specimen';

export interface DishCreature {
  pattern: FieldPattern;
  /** Centre in dish units (-1..1). */
  x: number;
  y: number;
  /** Size as a share of the dish radius. */
  size: number;
  rotate?: number;
  /** Family hue (degrees) or null = untinted. */
  hue?: number | null;
}

export interface DishRefOptions {
  creatures: DishCreature[];
  /** Show the growth ring (next size) at this radius share (e.g. 1.18), or 0. */
  growth?: number;
  /** Light theme: the bench is a pale lab bench; the dish stays night (GDD §14). */
  light?: boolean;
  /** Draw frost on the glass. */
  frost?: boolean;
}

const TAU = Math.PI * 2;

function frostFern(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, depth: number): void {
  if (depth === 0 || len < 1.5) return;
  const x2 = x + Math.cos(ang) * len;
  const y2 = y + Math.sin(ang) * len;
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  for (let i = 1; i <= 2; i++) {
    const t = i / 3;
    const bx = x + (x2 - x) * t;
    const by = y + (y2 - y) * t;
    frostFern(ctx, bx, by, ang - 1, len * 0.45, depth - 1);
    frostFern(ctx, bx, by, ang + 1, len * 0.45, depth - 1);
  }
  frostFern(ctx, x2, y2, ang, len * 0.55, depth - 1);
}

/** Draw the reference dish into `ctx` filling a `w × h` area. */
export function drawDishReference(ctx: CanvasRenderingContext2D, w: number, h: number, opts: DishRefOptions): void {
  const light = !!opts.light;
  // 1. Bench.
  const bench = ctx.createLinearGradient(0, 0, 0, h);
  if (light) {
    bench.addColorStop(0, '#dfe7ee');
    bench.addColorStop(1, '#c9d4de');
  } else {
    bench.addColorStop(0, '#0b1017');
    bench.addColorStop(1, '#05080c');
  }
  ctx.fillStyle = bench;
  ctx.fillRect(0, 0, w, h);
  // Brushed-steel streaks.
  ctx.save();
  ctx.globalAlpha = light ? 0.08 : 0.025;
  ctx.strokeStyle = light ? '#ffffff' : '#9fb4c8';
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const y = (i / 40) * h + ((i * 37) % 11);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + ((i * 13) % 7) - 3);
    ctx.stroke();
  }
  ctx.restore();

  const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, light ? 'rgba(24,36,52,0.18)' : 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.38;
  const wall = R * 0.045;

  // 2. Shadow and the cool light the culture throws on the bench.
  ctx.save();
  ctx.fillStyle = light ? 'rgba(24,36,52,0.25)' : 'rgba(0,0,0,0.6)';
  ctx.filter = `blur(${R * 0.08}px)`;
  ctx.beginPath();
  ctx.ellipse(cx + R * 0.04, cy + R * 0.08, R * 1.02, R * 1.02, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  const spill = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.6);
  spill.addColorStop(0, light ? 'rgba(10,114,166,0.12)' : 'rgba(91,192,235,0.12)');
  spill.addColorStop(1, 'rgba(91,192,235,0)');
  ctx.fillStyle = spill;
  ctx.fillRect(0, 0, w, h);

  // 3. Agar.
  const agar = ctx.createRadialGradient(cx - R * 0.15, cy - R * 0.2, R * 0.1, cx, cy, R);
  agar.addColorStop(0, '#16212d');
  agar.addColorStop(0.75, '#111a24');
  agar.addColorStop(1, '#0c131b');
  ctx.fillStyle = agar;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();
  // Lit meniscus where the agar climbs the wall.
  const men = ctx.createRadialGradient(cx, cy, R * 0.86, cx, cy, R);
  men.addColorStop(0, 'rgba(150,205,240,0)');
  men.addColorStop(1, 'rgba(150,205,240,0.16)');
  ctx.fillStyle = men;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.fill();

  // 4. Creatures.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R - wall * 0.5, 0, TAU);
  ctx.clip();
  for (const c of opts.creatures) {
    const stops: readonly Stop[] = c.hue == null ? MATTER_ART.night : tintedStops(c.hue);
    const px = Math.round(R * c.size * 2);
    const cv = renderSpecimen(c.pattern, px, stops, { rotate: c.rotate ?? 0, pad: 0.1, bloom: 0.6 });
    ctx.drawImage(cv, cx + c.x * R - px / 2, cy + c.y * R - px / 2);
  }
  ctx.restore();

  // 5. Glass: two walls with clear glass between them (thickness), a lid sheen across the agar,
  //    frost-white highlights top-left (room light) and a warm glint top-right (VELA's candle).
  ctx.save();
  ctx.fillStyle = 'rgba(200,232,255,0.07)';
  ctx.beginPath();
  ctx.arc(cx, cy, R + wall * 0.5, 0, TAU);
  ctx.arc(cx, cy, R - wall * 0.5, 0, TAU, true);
  ctx.fill();
  const outer = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  outer.addColorStop(0, 'rgba(240,250,255,0.9)');
  outer.addColorStop(0.55, 'rgba(160,205,232,0.45)');
  outer.addColorStop(1, 'rgba(110,160,200,0.35)');
  ctx.strokeStyle = outer;
  ctx.lineWidth = Math.max(1.2, R * 0.008);
  ctx.beginPath();
  ctx.arc(cx, cy, R + wall * 0.5, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(190,225,250,0.35)';
  ctx.lineWidth = Math.max(1, R * 0.005);
  ctx.beginPath();
  ctx.arc(cx, cy, R - wall * 0.5, 0, TAU);
  ctx.stroke();
  // Lid sheen: a broad, faint crescent of reflected light.
  const sheen = ctx.createLinearGradient(cx - R, cy - R, cx, cy);
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.arc(cx, cy, R - wall * 0.5, Math.PI * 0.95, Math.PI * 1.75);
  ctx.arc(cx + R * 0.18, cy + R * 0.16, R * 0.95, Math.PI * 1.75, Math.PI * 0.95, true);
  ctx.closePath();
  ctx.fill();
  // Specular strokes on the wall.
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(1.5, wall * 0.35);
  ctx.beginPath();
  ctx.arc(cx, cy, R + wall * 0.2, Math.PI * 1.1, Math.PI * 1.32);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = Math.max(1, wall * 0.2);
  ctx.beginPath();
  ctx.arc(cx, cy, R + wall * 0.2, Math.PI * 1.36, Math.PI * 1.42);
  ctx.stroke();
  const warm = ctx.createRadialGradient(cx + R * 0.62, cy - R * 0.78, 0, cx + R * 0.62, cy - R * 0.78, R * 0.09);
  warm.addColorStop(0, 'rgba(255,200,130,0.45)');
  warm.addColorStop(1, 'rgba(255,200,130,0)');
  ctx.fillStyle = warm;
  ctx.fillRect(cx + R * 0.4, cy - R, R * 0.45, R * 0.45);
  ctx.strokeStyle = 'rgba(255,214,160,0.9)';
  ctx.lineWidth = Math.max(1.2, wall * 0.25);
  ctx.beginPath();
  ctx.arc(cx, cy, R + wall * 0.15, Math.PI * 1.69, Math.PI * 1.75);
  ctx.stroke();
  ctx.restore();

  // 6. Frost on the glass: a soft haze plus many fine crystals along two arcs (polar night).
  if (opts.frost !== false) {
    let seed = 1234567;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (const [a0, a1] of [
      [2.2, 3.05],
      [5.45, 6.05],
    ]) {
      ctx.save();
      ctx.strokeStyle = 'rgba(225,242,255,0.22)';
      ctx.lineWidth = wall * 1.6;
      ctx.lineCap = 'round';
      ctx.filter = `blur(${wall * 0.8}px)`;
      ctx.beginPath();
      ctx.arc(cx, cy, R + wall * 0.3, a0 + 0.08, a1 - 0.08);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = 'rgba(232,246,255,0.5)';
      ctx.lineWidth = Math.max(0.6, R * 0.0035);
      ctx.beginPath();
      const n = 26;
      for (let i = 0; i < n; i++) {
        const a = a0 + (a1 - a0) * rnd();
        const edge = Math.sin(((a - a0) / (a1 - a0)) * Math.PI); // longer in the middle of the arc
        const rr = R + wall * (rnd() - 0.2);
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        const dir = a + Math.PI + (rnd() - 0.5) * 1.4; // inward-ish
        frostFern(ctx, x, y, dir, R * (0.02 + 0.07 * edge * rnd()), 2);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // 7. Growth ring: the next dish size, dashed and gently glowing.
  if (opts.growth && opts.growth > 1) {
    const gr = R * opts.growth;
    ctx.save();
    ctx.setLineDash([R * 0.04, R * 0.035]);
    ctx.strokeStyle = light ? 'rgba(10,114,166,0.7)' : 'rgba(91,192,235,0.55)';
    ctx.lineWidth = Math.max(1.5, R * 0.01);
    ctx.beginPath();
    ctx.arc(cx, cy, gr, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}
