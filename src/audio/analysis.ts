/**
 * Pure analysis helpers for rendered audio (used by the offline render
 * check and its unit tests): peak / RMS in dBFS, NaN and clip counts,
 * silence gaps, coarse spectral balance and a 16-bit WAV encoder.
 */

export function toDb(x: number): number {
  return x > 0 ? 20 * Math.log10(x) : -Infinity;
}

export interface Section {
  name: string;
  start: number;
  end: number;
  /** Music should be audible throughout (silence gaps are errors). */
  expectSound: boolean;
  /** Acceptable RMS range in dBFS. */
  rmsRange?: [number, number];
}

export interface BandLevel {
  name: string;
  lo: number;
  hi: number;
  /** Band power relative to the section's total power, dB. */
  relDb: number;
}

export interface SectionStats {
  name: string;
  start: number;
  end: number;
  rmsDb: number;
  peakDb: number;
  /** Longest run (s) of 50 ms windows below −60 dBFS. */
  longestSilence: number;
  bands: BandLevel[];
  /** Spectral centroid in Hz. */
  centroid: number;
  /** L/R correlation (1 = mono, 0 = uncorrelated). */
  correlation: number;
  ok: boolean;
  problems: string[];
}

export interface Analysis {
  sampleRate: number;
  duration: number;
  nanCount: number;
  peakDb: number;
  peakTime: number;
  clipCount: number;
  dcOffset: number[];
  /** Isolated discontinuities (likely clicks): count and first times (s). */
  clicks: { count: number; times: number[] };
  /** RMS per 0.5 s window (dBFS, both channels). */
  windows: { t: number; rmsDb: number; peakDb: number }[];
  sections: SectionStats[];
}

export const BANDS: { name: string; lo: number; hi: number }[] = [
  { name: 'sub <90', lo: 20, hi: 90 },
  { name: 'low 90-300', lo: 90, hi: 300 },
  { name: 'lowmid 300-1k', lo: 300, hi: 1000 },
  { name: 'mid 1k-3k', lo: 1000, hi: 3000 },
  { name: 'high 3k-8k', lo: 3000, hi: 8000 },
  { name: 'air >8k', lo: 8000, hi: 20000 },
];

/** In-place iterative radix-2 FFT. `re.length` must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Average power spectrum (Hann, 50 % overlap) of mono samples [a, b). */
export function powerSpectrum(x: Float32Array, a: number, b: number, size = 4096): Float64Array {
  const ps = new Float64Array(size / 2);
  const win = new Float64Array(size);
  for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  let frames = 0;
  for (let s = a; s + size <= b; s += size / 2) {
    for (let i = 0; i < size; i++) {
      re[i] = x[s + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < size / 2; k++) ps[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  if (frames > 0) for (let k = 0; k < ps.length; k++) ps[k] /= frames;
  return ps;
}

export function analyze(chs: Float32Array[], sr: number, sections: Section[]): Analysis {
  const n = chs[0].length;
  let nan = 0;
  let peak = 0;
  let peakIdx = 0;
  let clip = 0;
  const dc = chs.map(() => 0);
  for (let c = 0; c < chs.length; c++) {
    const d = chs[c];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const v = d[i];
      if (!Number.isFinite(v)) {
        nan++;
        continue;
      }
      sum += v;
      const a = Math.abs(v);
      if (a > peak) {
        peak = a;
        peakIdx = i;
      }
      if (a >= 0.999) clip++;
    }
    dc[c] = sum / n;
  }
  const rmsOf = (a: number, b: number) => {
    let s = 0;
    let p = 0;
    let cnt = 0;
    for (const d of chs) {
      for (let i = a; i < b; i++) {
        const v = Number.isFinite(d[i]) ? d[i] : 0;
        s += v * v;
        p = Math.max(p, Math.abs(v));
        cnt++;
      }
    }
    return { rms: Math.sqrt(s / Math.max(1, cnt)), peak: p };
  };
  const windows: Analysis['windows'] = [];
  const hop = Math.floor(sr * 0.5);
  for (let a = 0; a + hop <= n; a += hop) {
    const r = rmsOf(a, a + hop);
    windows.push({ t: a / sr, rmsDb: round1(toDb(r.rms)), peakDb: round1(toDb(r.peak)) });
  }
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const d of chs) s += Number.isFinite(d[i]) ? d[i] : 0;
    mono[i] = s / chs.length;
  }
  const out: SectionStats[] = sections.map((sec) => {
    const a = Math.max(0, Math.floor(sec.start * sr));
    const b = Math.min(n, Math.floor(sec.end * sr));
    const r = rmsOf(a, b);
    // Silence gaps.
    const w = Math.floor(sr * 0.05);
    let run = 0;
    let longest = 0;
    for (let s = a; s + w <= b; s += w) {
      const x = rmsOf(s, s + w).rms;
      if (toDb(x) < -60) {
        run += 0.05;
        longest = Math.max(longest, run);
      } else run = 0;
    }
    // Spectrum.
    const ps = powerSpectrum(mono, a, b);
    const binHz = sr / 4096;
    let total = 0;
    let cen = 0;
    for (let k = 1; k < ps.length; k++) {
      total += ps[k];
      cen += ps[k] * k * binHz;
    }
    const bands = BANDS.map((bd) => {
      let p = 0;
      for (let k = Math.max(1, Math.floor(bd.lo / binHz)); k < Math.min(ps.length, Math.ceil(bd.hi / binHz)); k++) p += ps[k];
      return { ...bd, relDb: round1(10 * Math.log10(Math.max(1e-20, p) / Math.max(1e-20, total))) };
    });
    // Stereo correlation.
    let lr = 0;
    let ll = 0;
    let rr = 0;
    if (chs.length >= 2) {
      for (let i = a; i < b; i++) {
        const l = chs[0][i];
        const rr_ = chs[1][i];
        lr += l * rr_;
        ll += l * l;
        rr += rr_ * rr_;
      }
    }
    const corr = ll > 0 && rr > 0 ? lr / Math.sqrt(ll * rr) : 1;
    const problems: string[] = [];
    const rmsDb = toDb(r.rms);
    if (sec.expectSound && longest >= 0.3) problems.push(`silence gap ${longest.toFixed(2)} s`);
    if (sec.rmsRange && (rmsDb < sec.rmsRange[0] || rmsDb > sec.rmsRange[1])) {
      problems.push(`RMS ${rmsDb.toFixed(1)} dBFS outside [${sec.rmsRange[0]}, ${sec.rmsRange[1]}]`);
    }
    return {
      name: sec.name,
      start: sec.start,
      end: sec.end,
      rmsDb: round1(rmsDb),
      peakDb: round1(toDb(r.peak)),
      longestSilence: round1(longest * 100) / 100,
      bands,
      centroid: Math.round(total > 0 ? cen / total : 0),
      correlation: Math.round(corr * 100) / 100,
      ok: problems.length === 0,
      problems,
    };
  });
  return {
    sampleRate: sr,
    duration: n / sr,
    nanCount: nan,
    peakDb: round1(toDb(peak)),
    peakTime: Math.round((peakIdx / sr) * 100) / 100,
    clipCount: clip,
    dcOffset: dc.map((x) => Math.round(x * 1e5) / 1e5),
    clicks: detectClicks(chs, sr),
    windows,
    sections: out,
  };
}

/**
 * Click detector: flags samples whose second difference is far above the
 * local second-difference RMS (an isolated discontinuity), merged per 20 ms.
 */
export function detectClicks(chs: Float32Array[], sr: number, ratio = 12, floor = 0.004): { count: number; times: number[] } {
  const half = 256;
  const times: number[] = [];
  let lastIdx = -Infinity;
  for (const x of chs) {
    const n = x.length;
    const pre = new Float64Array(n + 1);
    const d2 = new Float32Array(n);
    for (let i = 2; i < n; i++) {
      const v = x[i] - 2 * x[i - 1] + x[i - 2];
      d2[i] = Number.isFinite(v) ? v : 0;
    }
    for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + d2[i] * d2[i];
    for (let i = 2; i < n; i++) {
      const a = Math.abs(d2[i]);
      if (a < floor) continue;
      const lo = Math.max(0, i - half);
      const hi = Math.min(n, i + half);
      const others = pre[hi] - pre[lo] - a * a;
      const rms = Math.sqrt(Math.max(0, others) / Math.max(1, hi - lo - 1));
      if (a > ratio * rms && i - lastIdx > sr * 0.02) {
        times.push(Math.round((i / sr) * 1000) / 1000);
        lastIdx = i;
      }
    }
    lastIdx = -Infinity;
  }
  times.sort((p, q) => p - q);
  return { count: times.length, times: times.slice(0, 20) };
}

function round1(x: number): number {
  return Number.isFinite(x) ? Math.round(x * 10) / 10 : x;
}

/** 16-bit PCM WAV (interleaved), with light TPDF dither. */
export function encodeWav16(chs: Float32Array[], sr: number, dither = true): Uint8Array {
  const nch = chs.length;
  const n = chs[0].length;
  const dataBytes = n * nch * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, nch, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * nch * 2, true);
  v.setUint16(32, nch * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, dataBytes, true);
  let o = 44;
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      let x = chs[c][i];
      if (!Number.isFinite(x)) x = 0;
      let s = x * 32767 + (dither ? rnd() - rnd() : 0);
      s = Math.max(-32768, Math.min(32767, Math.round(s)));
      v.setInt16(o, s, true);
      o += 2;
    }
  }
  return new Uint8Array(buf);
}
