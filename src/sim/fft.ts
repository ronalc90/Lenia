/**
 * FFT for grid sides that are not powers of two (the live 4:5 grids: 128×160, 192×240, 224×280).
 * A side n = P·Q with P a power of two and Q odd (here 1, 3, 5, 7, 15…) is transformed as Q radix-2
 * FFTs of length P followed by a Q-point DFT per output bin (one decimation-in-time step):
 *
 *   X[k1 + P·k2] = Σ_{n2<Q} W_n^{n2·k1} · W_Q^{n2·k2} · FFT_P(x[Q·n1 + n2])[k1]
 *
 * Cost ≈ Q·P·log P + n·Q per transform; Q ≤ 15 for every grid we use. Used by CpuLenia when a side is
 * not a power of two (the power-of-two path in cpu.ts is unchanged). Allocation-free after the plan.
 */

interface Plan {
  n: number;
  P: number;
  Q: number;
  /** cos/sin of −2π j / n, j < n. */
  cw: Float64Array;
  sw: Float64Array;
  /** Q×Q DFT matrix: cos/sin of −2π (a·b mod Q) / Q. */
  cq: Float64Array;
  sq: Float64Array;
  /** Scratch: Q sub-sequences of length P (re, im), and one output line. */
  ar: Float64Array;
  ai: Float64Array;
  or: Float64Array;
  oi: Float64Array;
}

const plans = new Map<number, Plan>();

function planFor(n: number): Plan {
  let p = plans.get(n);
  if (p) return p;
  let P = 1;
  while (n % (P * 2) === 0) P *= 2;
  const Q = n / P;
  if (!Number.isInteger(Q) || Q > 63) throw new Error(`fft: unsupported length ${n}`);
  const cw = new Float64Array(n);
  const sw = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    cw[j] = Math.cos((-2 * Math.PI * j) / n);
    sw[j] = Math.sin((-2 * Math.PI * j) / n);
  }
  const cq = new Float64Array(Q * Q);
  const sq = new Float64Array(Q * Q);
  for (let a = 0; a < Q; a++)
    for (let b = 0; b < Q; b++) {
      cq[a * Q + b] = Math.cos((-2 * Math.PI * ((a * b) % Q)) / Q);
      sq[a * Q + b] = Math.sin((-2 * Math.PI * ((a * b) % Q)) / Q);
    }
  p = { n, P, Q, cw, sw, cq, sq, ar: new Float64Array(n), ai: new Float64Array(n), or: new Float64Array(n), oi: new Float64Array(n) };
  plans.set(n, p);
  return p;
}

/** In-place radix-2 FFT of a contiguous block [off, off + n) (n a power of two). */
function fftPow2(re: Float64Array, im: Float64Array, off: number, n: number, inverse: boolean): void {
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[off + i];
      re[off + i] = re[off + j];
      re[off + j] = t;
      t = im[off + i];
      im[off + i] = im[off + j];
      im[off + j] = t;
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
        const a = off + i + j;
        const b = a + len / 2;
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
}

/**
 * In-place 1D DFT of n values read/written at re[off + i·stride] (unnormalised forward; the inverse
 * divides by n, like cpu.ts fft2).
 */
export function fftAny(re: Float64Array, im: Float64Array, n: number, off: number, stride: number, inverse: boolean): void {
  const p = planFor(n);
  const { P, Q, ar, ai, or, oi, cw, sw, cq, sq } = p;
  // Q sub-sequences x[Q·n1 + n2], each transformed with a length-P FFT.
  for (let n2 = 0; n2 < Q; n2++) {
    const base = n2 * P;
    for (let n1 = 0; n1 < P; n1++) {
      const k = off + (Q * n1 + n2) * stride;
      ar[base + n1] = re[k];
      ai[base + n1] = im[k];
    }
    if (P > 1) fftPow2(ar, ai, base, P, inverse);
  }
  if (Q === 1) {
    for (let i = 0; i < n; i++) {
      or[i] = ar[i];
      oi[i] = ai[i];
    }
  } else {
    const sgn = inverse ? -1 : 1;
    // Twiddles W_n^{n2·k1} (conjugated for the inverse), in place.
    for (let n2 = 1; n2 < Q; n2++) {
      for (let k1 = 0; k1 < P; k1++) {
        const j = n2 * k1; // < n
        const c = cw[j];
        const sn = sgn * sw[j];
        const i = n2 * P + k1;
        const yr = ar[i];
        const yi = ai[i];
        ar[i] = yr * c - yi * sn;
        ai[i] = yr * sn + yi * c;
      }
    }
    // Q-point DFT across the sub-sequences for every k1.
    for (let k1 = 0; k1 < P; k1++) {
      for (let k2 = 0; k2 < Q; k2++) {
        let sr = 0;
        let si = 0;
        const row = k2 * Q;
        for (let n2 = 0; n2 < Q; n2++) {
          const c = cq[row + n2];
          const sn = sgn * sq[row + n2];
          const yr = ar[n2 * P + k1];
          const yi = ai[n2 * P + k1];
          sr += yr * c - yi * sn;
          si += yr * sn + yi * c;
        }
        or[k1 + P * k2] = sr;
        oi[k1 + P * k2] = si;
      }
    }
  }
  const s = inverse ? 1 / n : 1;
  for (let i = 0; i < n; i++) {
    re[off + i * stride] = or[i] * s;
    im[off + i * stride] = oi[i] * s;
  }
}

/** 2D DFT of a w×h row-major grid, any sides of the form 2^a·Q (Q odd, ≤ 63). */
export function fft2Any(re: Float64Array, im: Float64Array, w: number, h: number, inverse: boolean): void {
  for (let y = 0; y < h; y++) fftAny(re, im, w, y * w, 1, inverse);
  for (let x = 0; x < w; x++) fftAny(re, im, h, x, w, inverse);
}
