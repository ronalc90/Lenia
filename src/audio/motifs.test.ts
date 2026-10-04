import { describe, expect, it } from 'vitest';
import {
  CADENCE_TAILS,
  MELODY_RANGE,
  MOTIF_BANK,
  composeSectionMelody,
  hash32,
  mulberry32,
  realizeMotif,
  shiftMotif,
  varyMotif,
  type Variation,
} from './motifs';
import { CHORDS, TONIC_PC, pc } from './theory';
import { SECTIONS } from './progression';

const chordsOf = (s: 'A' | 'B') => SECTIONS[s].map((n) => CHORDS[n]);

describe('rng', () => {
  it('is deterministic and in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(hash32('a', 1)).toBe(hash32('a', 1));
    expect(hash32('a', 1)).not.toBe(hash32('a', 2));
  });
});

describe('motif bank', () => {
  it('holds short 2-bar motifs, sorted, inside the block', () => {
    for (const m of [...MOTIF_BANK, ...CADENCE_TAILS]) {
      expect(m.length).toBeGreaterThan(0);
      expect(m.length).toBeLessThanOrEqual(7);
      for (let i = 0; i < m.length; i++) {
        expect(m[i].t).toBeGreaterThanOrEqual(0);
        expect(m[i].t + m[i].d).toBeLessThanOrEqual(8);
        if (i > 0) expect(m[i].t).toBeGreaterThanOrEqual(m[i - 1].t + m[i - 1].d - 1e-9);
      }
    }
  });

  it('variations stay inside the block and keep note count reasonable', () => {
    const kinds: Variation[] = ['invert', 'shift', 'ornament', 'syncopate', 'simplify', 'tail'];
    const rng = mulberry32(3);
    for (const m of MOTIF_BANK) {
      for (const k of kinds) {
        const v = varyMotif(m, rng, k);
        expect(v.length).toBeGreaterThanOrEqual(m.length - 1);
        expect(v.length).toBeLessThanOrEqual(m.length + 1);
        for (const x of v) {
          expect(x.t).toBeGreaterThanOrEqual(0);
          expect(x.t).toBeLessThan(8);
          expect(x.d).toBeGreaterThan(0);
        }
      }
    }
    expect(shiftMotif(MOTIF_BANK[0], 2).map((x) => x.s)).toEqual(MOTIF_BANK[0].map((x) => x.s + 2));
  });

  it('realizes motifs on chord-scale notes, strong notes on stable tones', () => {
    const ch = chordsOf('A');
    for (const m of MOTIF_BANK) {
      for (const anchor of [72, 77, 81]) {
        const notes = realizeMotif(m, 0, ch, anchor);
        for (const n of notes) {
          const c = ch[Math.floor(n.beat / 4)];
          expect(c.scale).toContain(pc(n.midi));
          expect(c.avoid).not.toContain(pc(n.midi));
          if (n.strong) expect(c.stable).toContain(pc(n.midi));
          expect(n.midi).toBeGreaterThanOrEqual(MELODY_RANGE.lo - 2);
          expect(n.midi).toBeLessThanOrEqual(MELODY_RANGE.hi + 2);
        }
      }
    }
  });
});

describe('section melody', () => {
  const sections: ('A' | 'B')[] = ['A', 'B'];
  it('is deterministic for a seed', () => {
    for (const s of sections) {
      const a = composeSectionMelody({ section: s, chords: chordsOf(s), theme: MOTIF_BANK[2], rng: mulberry32(9) });
      const b = composeSectionMelody({ section: s, chords: chordsOf(s), theme: MOTIF_BANK[2], rng: mulberry32(9) });
      expect(a).toEqual(b);
    }
  });

  it('respects harmony, range and resolves to D at the end', () => {
    for (let seed = 1; seed < 40; seed++) {
      for (const s of sections) {
        const theme = MOTIF_BANK[seed % MOTIF_BANK.length];
        const ch = chordsOf(s);
        const mel = composeSectionMelody({ section: s, chords: ch, theme, rng: mulberry32(seed), variant: seed });
        expect(mel.length).toBeGreaterThan(8);
        for (let i = 0; i < mel.length; i++) {
          const n = mel[i];
          expect(n.beat).toBeGreaterThanOrEqual(0);
          expect(n.beat).toBeLessThan(32);
          const c = ch[Math.floor(n.beat / 4)];
          expect(c.scale).toContain(pc(n.midi));
          expect(c.avoid).not.toContain(pc(n.midi));
          if (n.strong) expect(c.stable).toContain(pc(n.midi));
          const lo = n.voice === 'echo' ? MELODY_RANGE.lo - 12 : MELODY_RANGE.lo;
          const hi = n.voice === 'echo' ? MELODY_RANGE.hi - 12 : MELODY_RANGE.hi;
          expect(n.midi).toBeGreaterThanOrEqual(lo - 2);
          expect(n.midi).toBeLessThanOrEqual(hi + 2);
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThanOrEqual(1);
        }
        const last = mel[mel.length - 1];
        expect(pc(last.midi)).toBe(TONIC_PC);
        expect(last.beat).toBeGreaterThanOrEqual(24);
      }
    }
  });

  it('A sections have period form: X, varied Y ending open, X again, cadence', () => {
    for (let seed = 1; seed < 30; seed++) {
      const theme = MOTIF_BANK[seed % MOTIF_BANK.length];
      const mel = composeSectionMelody({ section: 'A', chords: chordsOf('A'), theme, rng: mulberry32(seed) });
      const block = (b: number) => mel.filter((n) => n.beat >= b && n.beat < b + 8);
      const x1 = block(0).map((n) => [n.beat, n.midi]);
      const x2 = block(16).map((n) => [n.beat - 16, n.midi]);
      expect(x2).toEqual(x1); // the theme repeats exactly
      const y = block(8);
      expect(y.map((n) => n.midi)).not.toEqual(block(0).map((n) => n.midi));
      expect(pc(y[y.length - 1].midi)).not.toBe(TONIC_PC); // question
    }
  });

  it('is singable: mostly steps and thirds, never more than an octave', () => {
    let small = 0;
    let total = 0;
    for (let seed = 1; seed < 120; seed++) {
      for (const sec of sections) {
        const mel = composeSectionMelody({ section: sec, chords: chordsOf(sec), theme: MOTIF_BANK[seed % MOTIF_BANK.length], rng: mulberry32(seed), variant: seed }).filter(
          (n) => n.voice === 'lead',
        );
        for (let i = 1; i < mel.length; i++) {
          const leap = Math.abs(mel[i].midi - mel[i - 1].midi);
          expect(leap).toBeLessThanOrEqual(12);
          if (leap <= 4) small++;
          total++;
        }
      }
    }
    expect(small / total).toBeGreaterThan(0.75);
  });

  it('B sections answer the call with a lower echo voice', () => {
    const mel = composeSectionMelody({ section: 'B', chords: chordsOf('B'), theme: MOTIF_BANK[0], rng: mulberry32(5) });
    const echo = mel.filter((n) => n.voice === 'echo');
    expect(echo.length).toBeGreaterThan(0);
    for (const n of echo) {
      expect(n.beat).toBeGreaterThanOrEqual(8);
      expect(n.beat).toBeLessThan(16);
    }
  });
});
