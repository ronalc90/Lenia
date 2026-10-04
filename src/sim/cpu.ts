import type { LeniaParams, Pattern } from '../core/types';

/**
 * Reference Lenia on the CPU (FFT convolution, toroidal). Used by unit tests,
 * the detector calibration and the balance bot. Grid sides must be powers of 2.
 *
 * Exactly Chan's kn=1 / gn=1 formulation:
 *   kernel core  K(r) = (4 r (1 - r))^4 per ring, rings = b peaks
 *   growth       G(u) = 2 * max(0, 1 - (u - mu)^2 / (9 sigma^2))^4 - 1
 *   update       A <- clip(A + dt * G(K * A), 0, 1)
 */
export class CpuLenia {
  readonly A: Float32Array;
  private kre: Float64Array;
  private kim: Float64Array;
  private re: Float64Array;
  private im: Float64Array;
  private params: LeniaParams;
  stepCount = 0;

  constructor(
    readonly w: number,
    readonly h: number,
    params: LeniaParams,
  ) {
    if ((w & (w - 1)) !== 0 || (h & (h - 1)) !== 0) throw new Error('CpuLenia needs power-of-2 sides');
    this.A = new Float32Array(w * h);
    this.re = new Float64Array(w * h);
    this.im = new Float64Array(w * h);
    this.kre = new Float64Array(w * h);
    this.kim = new Float64Array(w * h);
    this.params = { ...params, rings: [...params.rings] };
    this.buildKernel();
  }

  setParams(p: Partial<LeniaParams>): void {
    const kernelChanged = p.R !== undefined || p.rings !== undefined;
    this.params = { ...this.params, ...p, rings: [...(p.rings ?? this.params.rings)] };
    if (kernelChanged) this.buildKernel();
  }

  /** Place a pattern with its top-left at (x, y), wrapping; values are max-blended. */
  place(p: Pattern, x: number, y: number, scale = 1): void {
    const pw = Math.round(p.w * scale);
    const ph = Math.round(p.h * scale);
    for (let j = 0; j < ph; j++) {
      for (let i = 0; i < pw; i++) {
        const v = p.data[Math.min(p.h - 1, Math.floor(j / scale)) * p.w + Math.min(p.w - 1, Math.floor(i / scale))];
        const gx = (((x + i) % this.w) + this.w) % this.w;
        const gy = (((y + j) % this.h) + this.h) % this.h;
        const k = gy * this.w + gx;
        this.A[k] = Math.max(this.A[k], v);
      }
    }
  }

  /** Place a pattern centered at (cx, cy). */
  placeCentered(p: Pattern, cx: number, cy: number): void {
    this.place(p, Math.round(cx - p.w / 2), Math.round(cy - p.h / 2));
  }

  step(n = 1): void {
    const { mu, sigma, dt } = this.params;
    const N = this.w * this.h;
    const inv9s2 = 1 / (9 * sigma * sigma);
    for (let s = 0; s < n; s++) {
      for (let i = 0; i < N; i++) {
        this.re[i] = this.A[i];
        this.im[i] = 0;
      }
      fft2(this.re, this.im, this.w, this.h, false);
      for (let i = 0; i < N; i++) {
        const a = this.re[i];
        const b = this.im[i];
        this.re[i] = a * this.kre[i] - b * this.kim[i];
        this.im[i] = a * this.kim[i] + b * this.kre[i];
      }
      fft2(this.re, this.im, this.w, this.h, true);
      for (let i = 0; i < N; i++) {
        const u = this.re[i];
        const d = u - mu;
        const q = Math.max(0, 1 - d * d * inv9s2);
        const g = 2 * q * q * q * q - 1;
        const v = this.A[i] + dt * g;
        this.A[i] = v < 0 ? 0 : v > 1 ? 1 : v;
      }
      this.stepCount++;
    }
  }

  mass(): number {
    let m = 0;
    for (let i = 0; i < this.A.length; i++) m += this.A[i];
    return m;
  }

  private buildKernel(): void {
    const { w, h } = this;
    const k = buildKernelImage(w, h, this.params.R, this.params.rings);
    this.kre.set(k);
    this.kim.fill(0);
    fft2(this.kre, this.kim, w, h, false);
  }
}

/** Kernel core for one ring, r in [0, 1]. */
export function kernelCore(r: number): number {
  const q = 4 * r * (1 - r);
  return q * q * q * q;
}

/** Kernel weight at normalized distance D (= dist / R), before normalization. */
export function kernelShell(D: number, rings: number[]): number {
  if (D >= 1) return 0;
  const B = rings.length;
  const Dk = D * B;
  const idx = Math.min(Math.floor(Dk), B - 1);
  return kernelCore(Dk % 1) * rings[idx];
}

/** Normalized kernel laid out for FFT (origin at [0,0], wrapping). */
export function buildKernelImage(w: number, h: number, R: number, rings: number[]): Float64Array {
  const k = new Float64Array(w * h);
  let sum = 0;
  const r = Math.ceil(R);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const v = kernelShell(Math.hypot(dx, dy) / R, rings);
      if (v <= 0) continue;
      const x = (dx + w) % w;
      const y = (dy + h) % h;
      k[y * w + x] += v;
      sum += v;
    }
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  return k;
}

// ── FFT (iterative radix-2, in place) ──

function fft1(re: Float64Array, im: Float64Array, n: number, off: number, stride: number, inverse: boolean): void {
  // bit reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const a = off + i * stride;
      const b = off + j * stride;
      let t = re[a];
      re[a] = re[b];
      re[b] = t;
      t = im[a];
      im[a] = im[b];
      im[b] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = off + (i + j) * stride;
        const b = off + (i + j + len / 2) * stride;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[off + i * stride] /= n;
      im[off + i * stride] /= n;
    }
  }
}

export function fft2(re: Float64Array, im: Float64Array, w: number, h: number, inverse: boolean): void {
  for (let y = 0; y < h; y++) fft1(re, im, w, y * w, 1, inverse);
  for (let x = 0; x < w; x++) fft1(re, im, h, x, w, inverse);
}
