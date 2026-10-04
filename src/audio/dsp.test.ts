import { describe, expect, it } from 'vitest';
import { analyze, detectClicks, encodeWav16, fft, powerSpectrum, toDb } from './analysis';
import { DEFAULT_REVERB, makeNoise, makeReverbIR, warmWaveCoefficients } from './fx';
import { PURCHASE_STEPS, SFX, MAX_SFX_VOICES, sliderFreq } from './sfx';
import { D_DORIAN, midiToFreq, pc } from './theory';
import { volumeCurve } from './engine';

const sine = (f: number, sr: number, n: number, a = 0.5) => Float32Array.from({ length: n }, (_, i) => a * Math.sin((2 * Math.PI * f * i) / sr));

describe('analysis', () => {
  it('fft finds a sine', () => {
    const n = 1024;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 32 * i) / n);
    fft(re, im);
    let best = 0;
    for (let k = 1; k < n / 2; k++) if (Math.hypot(re[k], im[k]) > Math.hypot(re[best], im[best])) best = k;
    expect(best).toBe(32);
    const ps = powerSpectrum(sine(1000, 44100, 44100), 0, 44100);
    let pk = 0;
    for (let k = 1; k < ps.length; k++) if (ps[k] > ps[pk]) pk = k;
    expect((pk * 44100) / 4096).toBeCloseTo(1000, -1);
  });

  it('measures peak, RMS, silence gaps and band balance', () => {
    const sr = 8000;
    const x = sine(440, sr, sr * 2, 0.5);
    x.fill(0, sr / 2, sr); // 0.5 s hole
    const a = analyze([x, x], sr, [{ name: 'all', start: 0, end: 2, expectSound: true, rmsRange: [-20, 0] }]);
    expect(a.nanCount).toBe(0);
    expect(a.peakDb).toBeCloseTo(toDb(0.5), 0);
    expect(a.sections[0].longestSilence).toBeGreaterThanOrEqual(0.45);
    expect(a.sections[0].ok).toBe(false); // gap flagged
    expect(a.sections[0].correlation).toBeCloseTo(1, 5);
    const lowmid = a.sections[0].bands.find((b) => b.name.startsWith('lowmid'))!;
    expect(lowmid.relDb).toBeGreaterThan(-1);
  });

  it('detects a click but not smooth audio', () => {
    const sr = 44100;
    const x = sine(220, sr, sr, 0.3);
    expect(detectClicks([x], sr).count).toBe(0);
    x[20000] += 0.2;
    expect(detectClicks([x], sr).count).toBe(1);
  });

  it('counts NaNs', () => {
    const x = new Float32Array(100);
    x[5] = NaN;
    expect(analyze([x], 100, []).nanCount).toBe(1);
  });

  it('writes a valid 16-bit stereo WAV', () => {
    const l = sine(440, 8000, 800);
    const w = encodeWav16([l, l], 8000, false);
    const v = new DataView(w.buffer);
    expect(String.fromCharCode(...w.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...w.subarray(8, 12))).toBe('WAVE');
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(8000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(800 * 4);
    expect(w.length).toBe(44 + 800 * 4);
  });
});

describe('generated DSP data', () => {
  it('reverb IR is finite, unit energy, decaying and fast to build', () => {
    const sr = 48000;
    const t0 = performance.now();
    makeReverbIR(sr, DEFAULT_REVERB);
    expect(performance.now() - t0).toBeLessThan(150);
    const [l, r] = makeReverbIR(sr, DEFAULT_REVERB);
    expect(l.length).toBe(Math.floor(DEFAULT_REVERB.seconds * sr));
    for (const ch of [l, r]) {
      let e = 0;
      let head = 0;
      let tail = 0;
      let bad = 0;
      for (let i = 0; i < ch.length; i++) {
        if (!Number.isFinite(ch[i])) bad++;
        e += ch[i] * ch[i];
        if (i < ch.length * 0.2) head += ch[i] * ch[i];
        if (i > ch.length * 0.8) tail += ch[i] * ch[i];
      }
      expect(bad).toBe(0);
      expect(e).toBeCloseTo(1, 4);
      expect(tail).toBeLessThan(head * 0.01);
    }
    // Decorrelated channels for width.
    let lr = 0;
    for (let i = 0; i < l.length; i++) lr += l[i] * r[i];
    expect(Math.abs(lr)).toBeLessThan(0.2);
  });

  it('noise buffers are normalised', () => {
    for (const k of ['white', 'pink', 'brown'] as const) {
      const n = makeNoise(k, 20000, 3);
      const peak = n.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
      expect(peak).toBeCloseTo(0.95, 5);
    }
  });

  it('warm wave has falling harmonics', () => {
    const { imag } = warmWaveCoefficients();
    for (let k = 2; k < imag.length; k++) expect(imag[k]).toBeLessThan(imag[k - 1]);
  });
});

describe('sfx rules', () => {
  it('purchase pitches climb D dorian from A5 = 880 Hz', () => {
    expect(midiToFreq(PURCHASE_STEPS[0])).toBeCloseTo(880, 6);
    for (let i = 1; i < PURCHASE_STEPS.length; i++) expect(PURCHASE_STEPS[i]).toBeGreaterThan(PURCHASE_STEPS[i - 1]);
    for (const m of PURCHASE_STEPS) expect(D_DORIAN).toContain(pc(m));
  });

  it('slider tone follows mu from 200 to 800 Hz', () => {
    expect(sliderFreq(0.08)).toBeCloseTo(200, 6);
    expect(sliderFreq(0.4)).toBeCloseTo(800, 6);
    expect(sliderFreq(0.15)).toBeGreaterThan(sliderFreq(0.12));
    expect(sliderFreq(-1)).toBe(200);
  });

  it('caps voices at 6 and rate-limits floods', () => {
    expect(MAX_SFX_VOICES).toBe(6);
    expect(SFX.income.minInterval).toBeGreaterThanOrEqual(3);
    expect(SFX.income.priority).toBe(0);
    expect(SFX.extinction.priority).toBeGreaterThan(SFX.speciesNew.priority);
    for (const d of Object.values(SFX)) {
      expect(d.minInterval).toBeGreaterThan(0);
      expect(d.gain).toBeGreaterThan(0);
    }
  });

  it('volume curve is monotonic from silence to unity', () => {
    expect(volumeCurve(0)).toBe(0);
    expect(volumeCurve(1)).toBe(1);
    expect(volumeCurve(0.5)).toBeGreaterThan(0.3);
    expect(volumeCurve(NaN)).toBe(0);
  });
});
