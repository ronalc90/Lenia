/**
 * A tiny live Lenia world (CPU reference, 64×64, toroidal) holding one real
 * Orbium. The Choir's portrait is this lens: the creatures literally speak
 * from inside a microscope, not as a drawing (GDD pillar 1: life is real).
 */
import { matterLUT } from '../../core/palette';
import { CpuLenia } from '../../sim/cpu';
import { catalogByCode, catalogPattern, paramsOf } from '../../sim/catalog';

const LUT = matterLUT();

export class LeniaLens {
  readonly size = 64;
  private sim: CpuLenia;
  private img: ImageData | null = null;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private acc = 0;
  /** Mass-weighted centre on the torus, in cells. */
  cx = 32;
  cy = 32;

  constructor(code = 'O2u') {
    const entry = catalogByCode(code) ?? catalogByCode('O2u')!;
    this.sim = new CpuLenia(this.size, this.size, paramsOf(entry));
    this.sim.placeCentered(catalogPattern(entry.code), 30, 34);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.ctx = this.canvas.getContext('2d');
    // Warm up so the very first frame already shows a settled creature.
    this.sim.step(30);
    this.paint();
  }

  /** Advance the simulation at `stepsPerSec` (real time `dt` seconds). */
  update(dt: number, stepsPerSec = 24): void {
    this.acc += Math.min(dt, 0.1) * stepsPerSec;
    let n = Math.floor(this.acc);
    if (n <= 0) return;
    this.acc -= n;
    n = Math.min(n, 3);
    this.sim.step(n);
    // Revive if it ever dies (never seen with Orbium, but a portrait must not go blank).
    if (this.sim.mass() < 5) this.sim.placeCentered(catalogPattern('O2u'), 32, 32);
    this.paint();
  }

  private paint(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const N = this.size;
    if (!this.img) this.img = ctx.createImageData(N, N);
    const d = this.img.data;
    const A = this.sim.A;
    let sx = 0;
    let sy = 0;
    let cx2 = 0;
    let cy2 = 0;
    const k = (Math.PI * 2) / N;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const a = A[i];
        const li = Math.min(255, Math.max(0, Math.round(a * 255))) * 4;
        d[i * 4] = LUT[li];
        d[i * 4 + 1] = LUT[li + 1];
        d[i * 4 + 2] = LUT[li + 2];
        d[i * 4 + 3] = LUT[li + 3];
        if (a > 0.05) {
          sx += a * Math.sin(x * k);
          cx2 += a * Math.cos(x * k);
          sy += a * Math.sin(y * k);
          cy2 += a * Math.cos(y * k);
        }
      }
    }
    ctx.putImageData(this.img, 0, 0);
    this.cx = ((Math.atan2(sx, cx2) / k) % N + N) % N;
    this.cy = ((Math.atan2(sy, cy2) / k) % N + N) % N;
  }
}
