/**
 * Canvas 2D drawing of skinnable effects: stable-creature halo, seed ripple + particles, golden
 * spark. Used by the store previews and meant to replace the hard-coded versions in
 * src/ui/overlay.ts (integrator), so what you preview is exactly what you get.
 *
 * FAIR PLAY: every style keeps the geometry of the default (halo radius, ripple radius/duration,
 * spark glow radius ~26–32 px and core size ~13–15 px). Only colour and ornament change.
 */
import type { HaloStyle, SparkSkin, TrailStyle } from './catalog';

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

function mixHex(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

const TAU = Math.PI * 2;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export interface HaloOpts {
  /** Per-creature phase 0..1 so halos do not pulse in sync. */
  phase?: number;
  reduceMotion?: boolean;
}

/**
 * Halo around a STABLE creature at (x, y) with radius R (CSS px). Same envelope as the overlay's
 * default: wide soft ring + main ring pulsing at 0.5 Hz + a travelling shimmer.
 */
export function drawHalo(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, time: number, s: HaloStyle, o: HaloOpts = {}): void {
  const rm = !!o.reduceMotion;
  const ph = o.phase ?? 0;
  const pulse = rm ? 0.5 : 0.5 + 0.5 * Math.sin((time * 0.5 + ph) * TAU);
  const r = R + (rm ? 0 : pulse * 1.5);
  const a0 = time * 1.4 + ph * TAU;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Soft outer ring (all styles).
  ctx.lineWidth = 6;
  ctx.strokeStyle = rgba(s.color, 0.05 + 0.06 * pulse);
  ctx.beginPath();
  ctx.arc(x, y, R + 1, 0, TAU);
  ctx.stroke();

  const main = 0.22 + 0.3 * pulse;
  switch (s.shape) {
    case 'ring':
    case 'double': {
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(s.color, main);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      if (s.shape === 'double') {
        const c2 = s.color2 ?? s.color;
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = rgba(c2, main * 0.7);
        ctx.beginPath();
        ctx.arc(x, y, r + 4.5, 0, TAU);
        ctx.stroke();
        if (!rm) {
          ctx.strokeStyle = rgba(s.shimmer, 0.3 + 0.25 * pulse);
          ctx.beginPath();
          ctx.arc(x, y, r + 4.5, -a0 * 0.8, -a0 * 0.8 + 0.45);
          ctx.stroke();
        }
      }
      break;
    }
    case 'orbit': {
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = rgba(s.color, main * 0.85);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      const sa = rm ? -Math.PI / 4 : time * 1.1 + ph * TAU;
      const sr = r + 3.5;
      // Fading tail behind the moon.
      for (let i = 1; i <= 8; i++) {
        const b = sa - i * 0.07;
        ctx.fillStyle = rgba(s.color, 0.32 * (1 - i / 9));
        ctx.beginPath();
        ctx.arc(x + Math.cos(b) * sr, y + Math.sin(b) * sr, 1.9 * (1 - i / 12), 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = rgba(s.shimmer, 0.95);
      ctx.beginPath();
      ctx.arc(x + Math.cos(sa) * sr, y + Math.sin(sa) * sr, 2.4, 0, TAU);
      ctx.fill();
      break;
    }
    case 'petals': {
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(s.color, main * 0.45);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      const rot = rm ? 0 : time * 0.25 + ph;
      const open = 0.3 + 0.12 * pulse;
      ctx.lineWidth = 2.2;
      for (let k = 0; k < 6; k++) {
        const c = rot + (k / 6) * TAU;
        ctx.strokeStyle = rgba(k % 2 ? s.color : mixHex(s.color, s.shimmer, 0.35), main + 0.08);
        ctx.beginPath();
        ctx.arc(x, y, r + 1.5, c - open, c + open);
        ctx.stroke();
      }
      break;
    }
    case 'hex': {
      const rot = rm ? 0 : time * 0.2 + ph;
      const hr = r + 2.2; // circumradius slightly larger so the flats sit on the ring
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(s.color, main + 0.05);
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) {
        const a = rot + (k / 6) * TAU;
        const px = x + Math.cos(a) * hr;
        const py = y + Math.sin(a) * hr;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      if (!rm) {
        const k = Math.floor(time * 2) % 6;
        const a = rot + (k / 6) * TAU;
        ctx.fillStyle = rgba(s.shimmer, 0.55 + 0.3 * pulse);
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * hr, y + Math.sin(a) * hr, 2, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'gradient': {
      const c2 = s.color2 ?? s.color;
      const seg = 36;
      const sweep = rm ? 0 : time * 0.6 + ph * TAU;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'butt';
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * TAU;
        const t = 0.5 + 0.5 * Math.cos(a - sweep);
        ctx.strokeStyle = rgba(mixHex(s.color, c2, t), main + 0.06);
        ctx.beginPath();
        ctx.arc(x, y, r, a, a + TAU / seg + 0.01);
        ctx.stroke();
      }
      ctx.lineCap = 'round';
      break;
    }
  }
  // Travelling shimmer (all but orbit/hex, which have their own highlight).
  if (!rm && s.shape !== 'orbit' && s.shape !== 'hex') {
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(s.shimmer, 0.35 + 0.25 * pulse);
    ctx.beginPath();
    ctx.arc(x, y, r, a0, a0 + 0.55);
    ctx.stroke();
  }
  ctx.restore();
}

// ───────────────────────────── seed trail ─────────────────────────────

export interface TrailParticle {
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  /** Seconds. */
  life: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
}

/** Particles for one successful seed (same count/speed envelope as the default burst). */
export function trailBurst(s: TrailStyle, count: number, rng: () => number = Math.random): TrailParticle[] {
  const out: TrailParticle[] = [];
  for (let i = 0; i < count; i++) {
    const a = rng() * TAU;
    const sp = 30 + rng() * 40;
    out.push({
      ox: Math.cos(a) * 4,
      oy: Math.sin(a) * 4,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.45 + rng() * 0.35,
      size: s.particle === 'bubble' ? 1.6 + rng() * 1.8 : 1.2 + rng() * 1,
      color: s.colors[Math.floor(rng() * s.colors.length)] ?? s.ripple,
      rot: rng() * TAU,
      vr: (rng() - 0.5) * 8,
    });
  }
  return out;
}

/** Advance a particle by dt seconds (drag + style gravity). */
export function stepTrailParticle(p: TrailParticle, s: TrailStyle, dt: number): void {
  const damp = Math.exp(-2.2 * dt);
  p.vx *= damp;
  p.vy = p.vy * damp + s.gravity * dt;
  p.ox += p.vx * dt;
  p.oy += p.vy * dt;
  p.rot += p.vr * dt;
}

/** Draw a particle at (x+ox, y+oy); t = 0..1 of its life. */
export function drawTrailParticle(ctx: CanvasRenderingContext2D, x: number, y: number, p: TrailParticle, s: TrailStyle, t: number): void {
  const a = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
  const px = x + p.ox;
  const py = y + p.oy;
  ctx.save();
  switch (s.particle) {
    case 'dot':
      ctx.fillStyle = rgba(p.color, a);
      ctx.beginPath();
      ctx.arc(px, py, p.size * (1 - t * 0.4), 0, TAU);
      ctx.fill();
      break;
    case 'star': {
      const sz = p.size * 2.4 * (1 - t * 0.5);
      ctx.fillStyle = rgba(p.color, a);
      ctx.translate(px, py);
      ctx.rotate(p.rot * 0.2);
      ctx.beginPath();
      ctx.moveTo(0, -sz);
      ctx.quadraticCurveTo(0, 0, sz, 0);
      ctx.quadraticCurveTo(0, 0, 0, sz);
      ctx.quadraticCurveTo(0, 0, -sz, 0);
      ctx.quadraticCurveTo(0, 0, 0, -sz);
      ctx.fill();
      break;
    }
    case 'petal': {
      const sz = p.size * 2.2;
      ctx.translate(px, py);
      ctx.rotate(p.rot);
      ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(p.rot * 1.3)));
      ctx.fillStyle = rgba(p.color, a * 0.95);
      ctx.beginPath();
      ctx.ellipse(0, 0, sz, sz * 0.55, 0, 0, TAU);
      ctx.fill();
      break;
    }
    case 'bubble':
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(p.color, a * 0.9);
      ctx.beginPath();
      ctx.arc(px, py, p.size * (1 + t * 0.6), 0, TAU);
      ctx.stroke();
      ctx.fillStyle = rgba('#FFFFFF', a * 0.6);
      ctx.beginPath();
      ctx.arc(px - p.size * 0.35, py - p.size * 0.35, Math.max(0.5, p.size * 0.25), 0, TAU);
      ctx.fill();
      break;
    case 'spark': {
      const len = 2 + Math.hypot(p.vx, p.vy) * 0.06;
      const ang = Math.atan2(p.vy, p.vx);
      ctx.strokeStyle = rgba(p.color, a);
      ctx.lineWidth = Math.max(0.8, p.size * 0.9);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - Math.cos(ang) * len, py - Math.sin(ang) * len);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/** Seed ripple rings at progress `elapsed` seconds (default duration 0.3 s, like the overlay). */
export function drawTrailRipple(ctx: CanvasRenderingContext2D, x: number, y: number, elapsed: number, maxR: number, s: TrailStyle, dur = 0.3): boolean {
  let alive = false;
  for (let r = 0; r < s.rings; r++) {
    const t = (elapsed - r * 0.07) / dur;
    if (t < 0 || t > 1) {
      if (t < 0) alive = true;
      continue;
    }
    alive = true;
    const rad = 3 + (maxR - 3) * easeOutCubic(t) * (1 - r * 0.18);
    ctx.lineWidth = 2 * (1 - t) + 0.4;
    ctx.strokeStyle = rgba(s.ripple, 0.9 * Math.pow(1 - t, 1.4));
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, TAU);
    ctx.stroke();
  }
  const t0 = elapsed / 0.12;
  if (t0 < 1) {
    ctx.fillStyle = rgba(s.ripple, 0.28 * (1 - t0));
    ctx.beginPath();
    ctx.arc(x, y, maxR * 0.35, 0, TAU);
    ctx.fill();
  }
  return alive;
}

// ───────────────────────────── golden spark ─────────────────────────────

export interface SparkOpts {
  /** 0..1 fade-in × blink (the overlay computes it from life). */
  alpha?: number;
  reduceMotion?: boolean;
  /** Direction of travel in radians (comet tail, moth heading). */
  heading?: number;
}

/** Trail dots behind the spark: `pts` oldest → newest, screen px. */
export function drawSparkTrail(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], s: SparkSkin, alpha = 1): void {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const f = i / n;
    ctx.fillStyle = rgba(s.trail, (s.shape === 'comet' ? 0.5 : 0.35) * f * alpha);
    ctx.beginPath();
    ctx.arc(pts[i].x, pts[i].y, 1 + (s.shape === 'comet' ? 4.5 : 3.5) * f, 0, TAU);
    ctx.fill();
  }
}

/** The spark body: glow (radius 26..32 px) + core (~13–15 px). Same footprint for every skin. */
export function drawSpark(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, s: SparkSkin, o: SparkOpts = {}): void {
  const A = o.alpha ?? 1;
  const rm = !!o.reduceMotion;
  const pulse = rm ? 0.5 : 0.5 + 0.5 * Math.sin(time * 4.2);
  const glowR = 26 + 6 * pulse;
  const grd = ctx.createRadialGradient(x, y, 0, x, y, glowR);
  grd.addColorStop(0, rgba(mixHex(s.core, '#FFFFFF', 0.55), 0.85 * A));
  grd.addColorStop(0.25, rgba(s.glow, 0.5 * A));
  grd.addColorStop(1, rgba(s.glow, 0));
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, glowR, 0, TAU);
  ctx.fill();
  const coreHi = mixHex(s.core, '#FFFFFF', 0.7);
  ctx.save();
  ctx.translate(x, y);
  switch (s.shape) {
    case 'star': {
      const rot = rm ? 0 : time * 0.9;
      for (const [sz, extra, alpha] of [
        [13 + 2 * pulse, 0, 1],
        [8, Math.PI / 4, 0.6],
      ] as const) {
        ctx.save();
        ctx.rotate(rot + extra);
        ctx.fillStyle = rgba(coreHi, alpha * A);
        ctx.beginPath();
        ctx.moveTo(0, -sz);
        ctx.quadraticCurveTo(1.6, -1.6, sz, 0);
        ctx.quadraticCurveTo(1.6, 1.6, 0, sz);
        ctx.quadraticCurveTo(-1.6, 1.6, -sz, 0);
        ctx.quadraticCurveTo(-1.6, -1.6, 0, -sz);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'orb': {
      // Firefly: soft body that blinks calmly (never below 70%).
      const blink = rm ? 1 : 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(time * 2.6));
      const body = ctx.createRadialGradient(0, 0, 0, 0, 0, 9);
      body.addColorStop(0, rgba('#FFFFFF', A));
      body.addColorStop(0.45, rgba(s.core, 0.95 * A * blink));
      body.addColorStop(1, rgba(s.core, 0));
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, 0, 9 + 2 * pulse, 0, TAU);
      ctx.fill();
      const wing = rm ? 0.6 : 0.6 + 0.4 * Math.sin(time * 14);
      ctx.fillStyle = rgba('#FFFFFF', 0.35 * A);
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(sgn * 5.5, -6, 5, 2.4 * wing + 0.6, sgn * 0.6, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'comet': {
      const hd = o.heading ?? -Math.PI / 6;
      ctx.rotate(hd);
      const tail = ctx.createLinearGradient(0, 0, -30, 0);
      tail.addColorStop(0, rgba(s.glow, 0.75 * A));
      tail.addColorStop(1, rgba(s.glow, 0));
      ctx.fillStyle = tail;
      ctx.beginPath();
      ctx.moveTo(2, -6);
      ctx.quadraticCurveTo(-14, -4, -30, 0);
      ctx.quadraticCurveTo(-14, 4, 2, 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = rgba(coreHi, A);
      ctx.beginPath();
      ctx.arc(0, 0, 6.5 + 1.2 * pulse, 0, TAU);
      ctx.fill();
      break;
    }
    case 'moth': {
      const flap = rm ? 0.8 : 0.45 + 0.55 * Math.abs(Math.sin(time * 6));
      ctx.rotate((o.heading ?? -Math.PI / 2) + Math.PI / 2);
      ctx.fillStyle = rgba(s.core, 0.92 * A);
      for (const sgn of [-1, 1]) {
        ctx.save();
        ctx.scale(sgn * flap, 1);
        ctx.beginPath();
        ctx.moveTo(0, -1);
        ctx.bezierCurveTo(7, -13, 15, -7, 12, 1);
        ctx.bezierCurveTo(10, 5, 4, 3, 0, 1);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, 2);
        ctx.bezierCurveTo(6, 4, 9, 11, 4, 12);
        ctx.bezierCurveTo(1, 12, 0, 7, 0, 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = rgba('#FFFFFF', A);
      ctx.beginPath();
      ctx.ellipse(0, 1, 1.6, 5.5, 0, 0, TAU);
      ctx.fill();
      break;
    }
    case 'flake': {
      const rot = rm ? 0 : time * 0.5;
      ctx.rotate(rot);
      ctx.strokeStyle = rgba(coreHi, A);
      ctx.lineCap = 'round';
      ctx.lineWidth = 2;
      for (let k = 0; k < 6; k++) {
        ctx.save();
        ctx.rotate((k / 6) * TAU);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -13 - pulse * 1.5);
        ctx.moveTo(0, -7);
        ctx.lineTo(-3.5, -10);
        ctx.moveTo(0, -7);
        ctx.lineTo(3.5, -10);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
  }
  ctx.restore();
  ctx.fillStyle = rgba('#FFFFFF', A);
  ctx.beginPath();
  ctx.arc(x, y, s.shape === 'moth' ? 0 : 3, 0, TAU);
  ctx.fill();
}
