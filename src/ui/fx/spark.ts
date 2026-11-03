/**
 * The Spark (Destello), polished (docs/ARTE-PULIDO.md A-7): it is announced (ten golden motes
 * implode and a ring closes, 300 ms), lives as a pre-rendered four-point star (rays turning once in
 * 12 s, a twinkle 1 ↔ 1.08 every 900 ms, a 12-sample trail fading in 400 ms), and ends either
 * collected (the overlay holds still 60 ms, the star swells ×1.4 into a golden flash of 0 → 90 px in
 * 220 ms; particles and flying motes come from the overlay and src/main.ts) or lost (it shrinks to
 * nothing in 400 ms, six motes fall). Reduce motion: no turning rays, no hold, plain fades.
 *
 * Only the default look: an equipped Spark skin keeps its own drawing (src/store/draw.ts).
 */
import { ease } from '../art/motion';
import type { Projector } from './particles';
import { SPR, type SpriteAtlas } from './sprites';

export const SPARK = {
  announceS: 0.3,
  implodeN: 10,
  implodeFromPx: 64,
  ringFrom: 40,
  ringTo: 8,
  /** Star sprite size (CSS px) and its glow. */
  starPx: 32,
  glowPx: 96,
  turnS: 12,
  twinkleS: 0.9,
  twinkle: 0.08,
  trailN: 12,
  trailS: 0.4,
  /** Collected: overlay hit-stop, swell, golden flash. */
  holdS: 0.06,
  collectScale: 1.4,
  flashPx: 90,
  flashS: 0.22,
  goldN: 24,
  whiteN: 6,
  /** Lost: shrink in 400 ms (`exit`), six motes fall. */
  loseS: 0.4,
  loseN: 6,
} as const;

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

export type SparkEnd = 'none' | 'collected' | 'lost';

export class SparkFx {
  on = false;
  x = 0;
  y = 0;
  born = 0;
  /** Remaining life 0..1 from the game (blinks near the end). */
  life = 1;
  end: SparkEnd = 'none';
  endAt = 0;
  private readonly trail = new Float32Array(SPARK.trailN * 3);
  private trailN = 0;
  private trailHead = 0;

  spawn(x: number, y: number, now: number): void {
    this.on = true;
    this.end = 'none';
    this.x = x;
    this.y = y;
    this.born = now;
    this.life = 1;
    this.trailN = 0;
    this.trailHead = 0;
  }

  /** Follow the game's position (grid cells); samples the trail every 35 ms. */
  move(x: number, y: number, life: number, now: number): void {
    this.x = x;
    this.y = y;
    this.life = life;
    const last = this.trailN ? this.trail[((this.trailHead + SPARK.trailN - 1) % SPARK.trailN) * 3 + 2] : -1;
    if (now - last >= 0.035) {
      const k = this.trailHead * 3;
      this.trail[k] = x;
      this.trail[k + 1] = y;
      this.trail[k + 2] = now;
      this.trailHead = (this.trailHead + 1) % SPARK.trailN;
      this.trailN = Math.min(SPARK.trailN, this.trailN + 1);
    }
  }

  finish(kind: 'collected' | 'lost', now: number): void {
    if (!this.on || this.end !== 'none') return;
    this.end = kind;
    this.endAt = now;
  }

  /** Still drawing (alive, or its ending playing out). */
  active(now: number): boolean {
    if (!this.on) return false;
    if (this.end === 'collected' && now - this.endAt > SPARK.flashS + 0.05) this.on = false;
    if (this.end === 'lost' && now - this.endAt > SPARK.loseS) this.on = false;
    return this.on;
  }

  /** Visible star (after the announcement), 0..1. */
  shown(now: number): number {
    return clamp01((now - this.born - SPARK.announceS) / 0.15);
  }

  draw(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, map: Projector, now: number, rm: boolean, gold: number, white: number): void {
    if (!this.active(now)) return;
    const px = map.px(this.x);
    const py = map.py(this.y);
    const age = now - this.born;
    // Announcement: motes implode, a ring closes (anticipation, M9).
    if (age < SPARK.announceS + 0.05 && this.end === 'none') {
      const u = clamp01(age / SPARK.announceS);
      const e = ease.enter(u);
      if (!rm) {
        for (let k = 0; k < SPARK.implodeN; k++) {
          const a = (k / SPARK.implodeN) * Math.PI * 2 + u * 0.8;
          const r = SPARK.implodeFromPx * (1 - e);
          atlas.draw(ctx, SPR.disc, k % 3 ? gold : white, px + Math.cos(a) * r, py + Math.sin(a) * r, 7, 0.9 * Math.min(1, u * 3));
        }
      }
      if (!rm) {
        const rr = SPARK.ringFrom + (SPARK.ringTo - SPARK.ringFrom) * e;
        ctx.globalAlpha = 0.8 * Math.min(1, u * 2.5) * (1 - clamp01((age - SPARK.announceS) / 0.05));
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, rr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    let A = this.shown(now);
    if (A <= 0) return;
    let scale = 1;
    if (this.end === 'collected') {
      const t = (now - this.endAt) / SPARK.flashS;
      scale = rm ? 1 : 1 + (SPARK.collectScale - 1) * ease.enter(clamp01(t * 2));
      A *= 1 - ease.exit(clamp01(t));
      // The golden flash opens behind the star (Reduce motion: it only fades).
      const fr = rm ? SPARK.flashPx * 0.6 : SPARK.flashPx * ease.enter(clamp01(t));
      atlas.draw(ctx, SPR.disc, gold, px, py, fr * 2, 0.9 * (1 - clamp01(t)));
    } else if (this.end === 'lost') {
      const t = clamp01((now - this.endAt) / SPARK.loseS);
      scale = rm ? 1 : 1 - ease.exit(t);
      A *= rm ? 1 - t : 1 - 0.5 * t;
    }
    if (this.life < 0.18 && this.end === 'none') A *= 0.55 + 0.45 * Math.sin(now * 18);
    // Trail: 12 samples fading over 400 ms.
    if (!rm && this.end === 'none') {
      for (let k = 0; k < this.trailN; k++) {
        const j = ((this.trailHead + SPARK.trailN - 1 - k) % SPARK.trailN) * 3;
        const t = (now - this.trail[j + 2]) / SPARK.trailS;
        if (t >= 1 || t < 0) continue;
        atlas.draw(ctx, SPR.disc, gold, map.px(this.trail[j]), map.py(this.trail[j + 1]), 12 * (1 - t), 0.5 * (1 - t) * A);
      }
    }
    const tw = rm ? 1 : 1 + SPARK.twinkle * (0.5 + 0.5 * Math.sin((age / SPARK.twinkleS) * Math.PI * 2));
    atlas.draw(ctx, SPR.disc, gold, px, py, SPARK.glowPx * scale * tw, 0.75 * A);
    const rot = rm ? 0 : (age / SPARK.turnS) * Math.PI * 2;
    const s = SPARK.starPx * scale * tw;
    ctx.save();
    ctx.translate(Math.round(px), Math.round(py));
    ctx.rotate(rot);
    atlas.draw(ctx, SPR.star, gold, 0, 0, s * 1.15, A);
    ctx.rotate(Math.PI / 4);
    atlas.draw(ctx, SPR.star, white, 0, 0, s * 0.62, 0.6 * A);
    ctx.restore();
    atlas.draw(ctx, SPR.disc, white, px, py, 9 * scale, A);
    ctx.globalAlpha = 1;
  }
}
