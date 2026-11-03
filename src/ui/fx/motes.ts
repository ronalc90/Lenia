/**
 * Ambient motes with depth (docs/ARTE-PULIDO.md A-8): three layers drifting in the agar — far
 * 1 px specks, middle 1.5 px, and a few near "bokeh" discs out of focus — wandering on smooth noise
 * (never jittering per frame) with parallax against the bench's breathing (A-9). Sprites only, no
 * shadowBlur; off with Reduce motion; 60 % in the light theme. Positions live in the dish's unit disc.
 */
import { noise1 } from './noise';
import type { SpriteAtlas } from './sprites';
import { SPR } from './sprites';

interface Layer {
  n: number;
  /** Speck size (px): far and middle are points of light, near is a bokeh disc (min, max). */
  px: readonly [number, number];
  alpha: number;
  /** Drift speed (px/s) and parallax factor with the camera's breathing. */
  speed: number;
  parallax: number;
  sprite: number;
}

export const MOTE_LAYERS: readonly Layer[] = [
  { n: 14, px: [1, 1], alpha: 0.25, speed: 2, parallax: 0.3, sprite: SPR.disc },
  { n: 10, px: [1.5, 1.5], alpha: 0.35, speed: 4, parallax: 0.6, sprite: SPR.disc },
  { n: 4, px: [6, 9], alpha: 0.1, speed: 6, parallax: 1, sprite: SPR.bokeh },
];
const TOTAL = MOTE_LAYERS.reduce((s, l) => s + l.n, 0);
/** Light theme: 60 % opacity. */
const LIGHT_ALPHA = 0.6;
/** A point of light is drawn as a glow sprite this many times its speck size. */
const GLOW = 3.2;

export class AmbientMotes {
  private readonly u = new Float32Array(TOTAL);
  private readonly v = new Float32Array(TOTAL);
  private readonly size = new Float32Array(TOTAL);
  private readonly layer = new Uint8Array(TOTAL);
  private readonly seed = new Uint16Array(TOTAL);
  private readonly violet = new Uint8Array(TOTAL);
  private count = TOTAL;

  constructor() {
    let i = 0;
    let h = 0x2545f491;
    const rnd = () => {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      return (h >>> 0) / 4294967296;
    };
    for (let L = 0; L < MOTE_LAYERS.length; L++) {
      const ly = MOTE_LAYERS[L];
      for (let k = 0; k < ly.n; k++, i++) {
        // Uniform in the disc.
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()) * 0.95;
        this.u[i] = Math.cos(a) * r;
        this.v[i] = Math.sin(a) * r;
        this.size[i] = ly.px[0] + (ly.px[1] - ly.px[0]) * rnd();
        this.layer[i] = L;
        this.seed[i] = (rnd() * 60000) | 0;
        this.violet[i] = rnd() < 0.3 ? 1 : 0;
      }
    }
  }

  /** Motes drawn (profile: 16 on low, 28 otherwise), taken evenly from every layer. */
  setCount(n: number): void {
    this.count = Math.max(0, Math.min(TOTAL, Math.floor(n)));
  }

  /**
   * Drift and draw. (cx, cy, R) = the dish on screen (CSS px); (bx, by) = the bench's breathing;
   * colours are atlas indices (cyan and violet, or a cosmetic's single colour).
   */
  draw(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, time: number, dt: number, cx: number, cy: number, R: number, bx: number, by: number, light: boolean, cyan: number, violet: number): void {
    if (!(R > 4)) return;
    const d = Math.min(Math.max(dt, 0), 0.05);
    const keep = this.count / TOTAL;
    for (let i = 0; i < TOTAL; i++) {
      // Thin every layer evenly on a low profile.
      if (keep < 1 && ((i * 0.618) % 1) > keep) continue;
      const ly = MOTE_LAYERS[this.layer[i]];
      const s = this.seed[i];
      // A slow wander on smooth noise with a gentle upward drift (warm agar convects).
      const nx = noise1(time * 0.11 + s * 0.013, s);
      const ny = noise1(time * 0.09 + s * 0.029, s + 7);
      const sp = (ly.speed * d) / R;
      this.u[i] += nx * sp;
      this.v[i] += (ny * 0.6 - 0.8) * sp;
      const rr = this.u[i] * this.u[i] + this.v[i] * this.v[i];
      if (rr > 0.95 * 0.95) {
        // Out of the agar: back in from the opposite side.
        this.u[i] = -this.u[i] * 0.9;
        this.v[i] = -this.v[i] * 0.9;
      }
      const tw = 0.6 + 0.4 * (0.5 + 0.5 * noise1(time * 0.7 + s * 0.31, s + 3));
      const a = ly.alpha * tw * (light ? LIGHT_ALPHA : 1);
      const x = cx + this.u[i] * R + bx * ly.parallax;
      const y = cy + this.v[i] * R + by * ly.parallax;
      const px = ly.sprite === SPR.bokeh ? this.size[i] : this.size[i] * GLOW;
      atlas.draw(ctx, ly.sprite, this.violet[i] ? violet : cyan, x, y, px, a);
    }
  }
}
