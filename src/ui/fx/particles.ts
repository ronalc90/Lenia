/**
 * Particles without garbage (docs/ARTE-PULIDO.md A-10): a fixed pool in structure-of-arrays form
 * (Float32Array per field, Uint8Array for sprite and colour), recycled as a ring — when full the
 * oldest is reused; no push / shift / splice, no objects, no strings per frame. Positions are a grid
 * anchor (so a burst stays on its creature through zooms and pans) plus a pixel offset that the
 * velocity moves. Drawing blits pre-rendered sprites (src/ui/fx/sprites.ts) with globalAlpha.
 */
import type { SpriteAtlas } from './sprites';

/** Grid → CSS px mapping for one frame, without allocating (the overlay implements it). */
export interface Projector {
  px(gridX: number): number;
  py(gridY: number): number;
}

export interface BurstOpts {
  /** Speed range, px/s. */
  speed: readonly [number, number];
  /** Life, s (each particle 70–100 % of it). */
  life: number;
  /** Sprite size, px (each 70–130 %). */
  size: number;
  sprite: number;
  color: number;
  /** Velocity damping per second (A-4: 2.4). */
  drag: number;
  /** Downward acceleration, px/s² (negative rises). */
  grav: number;
  /** Start delay, s. */
  delay?: number;
  /** Start ring radius, px (motes born on a creature's edge rather than its centre). */
  from?: number;
  /** Direction bias (radians) and spread (radians, 2π = all around). */
  dir?: number;
  spread?: number;
}

/** Absolute capacity: the high profile's (§6.1). */
export const MAX_PARTICLES = 384;

export class ParticlePool {
  readonly ax = new Float32Array(MAX_PARTICLES);
  readonly ay = new Float32Array(MAX_PARTICLES);
  readonly ox = new Float32Array(MAX_PARTICLES);
  readonly oy = new Float32Array(MAX_PARTICLES);
  readonly vx = new Float32Array(MAX_PARTICLES);
  readonly vy = new Float32Array(MAX_PARTICLES);
  readonly t0 = new Float32Array(MAX_PARTICLES);
  readonly life = new Float32Array(MAX_PARTICLES);
  readonly size = new Float32Array(MAX_PARTICLES);
  readonly drag = new Float32Array(MAX_PARTICLES);
  readonly grav = new Float32Array(MAX_PARTICLES);
  readonly sprite = new Uint8Array(MAX_PARTICLES);
  readonly color = new Uint8Array(MAX_PARTICLES);
  /** Capacity in use (profile: 128 / 256 / 384). */
  private cap = MAX_PARTICLES;
  private head = 0;
  /** Deterministic RNG state (xorshift32): no Math.random in the effects. */
  private rng = 0x9e3779b9;

  setCapacity(n: number): void {
    const c = Math.max(8, Math.min(MAX_PARTICLES, Math.floor(n)));
    if (c === this.cap) return;
    this.cap = c;
    this.head = 0;
    this.life.fill(0);
  }

  get capacity(): number {
    return this.cap;
  }

  /** Live particles (for tests and the dev counter). */
  liveCount(now: number): number {
    let n = 0;
    for (let i = 0; i < this.cap; i++) if (this.life[i] > 0 && now - this.t0[i] < this.life[i]) n++;
    return n;
  }

  /** Uniform random in [0, 1). */
  rand(): number {
    let x = this.rng | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x;
    return (x >>> 0) / 4294967296;
  }

  emit(ax: number, ay: number, ox: number, oy: number, vx: number, vy: number, now: number, life: number, size: number, sprite: number, color: number, drag: number, grav: number): void {
    const i = this.head;
    this.head = (this.head + 1) % this.cap;
    this.ax[i] = ax;
    this.ay[i] = ay;
    this.ox[i] = ox;
    this.oy[i] = oy;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.t0[i] = now;
    this.life[i] = life;
    this.size[i] = size;
    this.drag[i] = drag;
    this.grav[i] = grav;
    this.sprite[i] = sprite;
    this.color[i] = color;
  }

  /** n particles from a grid point, radially (or in a cone). */
  burst(ax: number, ay: number, n: number, now: number, o: BurstOpts): void {
    const spread = o.spread ?? Math.PI * 2;
    const dir = o.dir ?? 0;
    const delay = o.delay ?? 0;
    for (let k = 0; k < n; k++) {
      const a = dir + (spread >= Math.PI * 2 ? (k + this.rand()) / n : this.rand() - 0.5) * spread;
      const sp = o.speed[0] + (o.speed[1] - o.speed[0]) * this.rand();
      const c = Math.cos(a);
      const s = Math.sin(a);
      const r0 = o.from ?? 0;
      this.emit(ax, ay, c * r0, s * r0, c * sp, s * sp, now + delay, o.life * (0.7 + 0.3 * this.rand()), o.size * (0.7 + 0.6 * this.rand()), o.sprite, o.color, o.drag, o.grav);
    }
  }

  /** Integrate velocities (dt s; a hit-stop passes 0). */
  step(now: number, dt: number): void {
    if (!(dt > 0)) return;
    const d = Math.min(dt, 0.05);
    for (let i = 0; i < this.cap; i++) {
      const L = this.life[i];
      if (L <= 0) continue;
      const age = now - this.t0[i];
      if (age >= L) {
        this.life[i] = 0;
        continue;
      }
      if (age < 0) continue;
      const damp = Math.exp(-this.drag[i] * d);
      this.vx[i] *= damp;
      this.vy[i] = this.vy[i] * damp + this.grav[i] * d;
      this.ox[i] += this.vx[i] * d;
      this.oy[i] += this.vy[i] * d;
    }
  }

  /** Blit every live particle: fade in over the first 10 %, out after; shrink to 60 %. */
  draw(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, now: number, map: Projector): void {
    for (let i = 0; i < this.cap; i++) {
      const L = this.life[i];
      if (L <= 0) continue;
      const t = (now - this.t0[i]) / L;
      if (t < 0 || t >= 1) continue;
      const a = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      const x = map.px(this.ax[i]) + this.ox[i];
      const y = map.py(this.ay[i]) + this.oy[i];
      atlas.draw(ctx, this.sprite[i], this.color[i], x, y, this.size[i] * (1 - 0.4 * t), a);
    }
  }

  clear(): void {
    this.life.fill(0);
  }
}
