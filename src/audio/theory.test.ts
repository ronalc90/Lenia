import { describe, expect, it } from 'vitest';
import {
  CHORDS,
  D_DORIAN,
  bassPitch,
  freqToMidi,
  midiToFreq,
  nearestPitchWithPc,
  noteName,
  pc,
  pitchesInRange,
  scaleStep,
  voiceLead,
} from './theory';
import { BARS_PER_FORM, BPM, FORM, SECONDS_PER_BAR, SECTIONS, barInfo, sectionChords } from './progression';

describe('pitch helpers', () => {
  it('converts MIDI and frequency', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
    expect(midiToFreq(81)).toBeCloseTo(880, 6);
    expect(midiToFreq(62)).toBeCloseTo(293.665, 2);
    expect(freqToMidi(440)).toBeCloseTo(69, 9);
    expect(noteName(62)).toBe('D4');
    expect(pc(-1)).toBe(11);
  });

  it('finds the nearest pitch of a pitch class set', () => {
    expect(nearestPitchWithPc(61, [2])).toBe(62);
    expect(nearestPitchWithPc(64, [2, 5])).toBe(65);
    expect(nearestPitchWithPc(63.5, [2, 5], 1)).toBe(65);
  });

  it('steps along a scale', () => {
    expect(scaleStep(62, 1, D_DORIAN)).toBe(64); // D → E
    expect(scaleStep(62, 2, D_DORIAN)).toBe(65); // D → F
    expect(scaleStep(62, 7, D_DORIAN)).toBe(74); // octave
    expect(scaleStep(62, -1, D_DORIAN)).toBe(60); // D → C
    expect(scaleStep(63, 0, D_DORIAN)).toBe(62); // Eb snaps down to D
  });

  it('lists pitches in range', () => {
    expect(pitchesInRange([2, 9], 60, 72)).toEqual([62, 69]);
  });
});

describe('chord vocabulary', () => {
  it('is internally consistent', () => {
    for (const c of Object.values(CHORDS)) {
      expect(c.pad).toHaveLength(4);
      expect(c.scale).toHaveLength(7);
      for (const p of c.tones) expect(c.scale).toContain(p);
      for (const p of c.stable) expect(c.scale).toContain(p);
      for (const p of c.pad) expect(c.tones).toContain(p);
      for (const p of c.avoid) {
        expect(c.scale).toContain(p);
        expect(c.stable).not.toContain(p);
        expect(c.tones).not.toContain(p);
      }
      expect(c.tones[0]).toBe(c.root);
      expect(c.stable).toContain(c.fifth);
    }
  });
});

describe('voice leading', () => {
  it('voices every chord of the form inside the range with its pad tones', () => {
    let prev: number[] | null = null;
    for (let bar = 0; bar < BARS_PER_FORM * 2; bar++) {
      const c = barInfo(bar).chord;
      const v = voiceLead(prev, c.pad, 52, 74, 63);
      expect(v).toHaveLength(4);
      expect([...v].sort((a, b) => a - b)).toEqual(v);
      expect(new Set(v.map(pc))).toEqual(new Set(c.pad));
      for (const m of v) {
        expect(m).toBeGreaterThanOrEqual(52);
        expect(m).toBeLessThanOrEqual(74);
      }
      expect(v[1] - v[0]).toBeGreaterThanOrEqual(3);
      if (prev) {
        // Smooth: total movement stays small (common tones held, steps elsewhere).
        const moved = v.reduce((s, m, i) => s + Math.abs(m - prev![i]), 0);
        expect(moved).toBeLessThanOrEqual(10);
      }
      prev = v;
    }
  });

  it('prefers holding common tones', () => {
    // Dm9 → Bbmaj7 rootless: F A C E → D F A C. F, A, C should not move.
    const a = voiceLead(null, CHORDS.Dm9.pad, 52, 74, 63);
    const b = voiceLead(a, CHORDS.Bbmaj7.pad, 52, 74, 63);
    const kept = a.filter((m) => b.includes(m));
    expect(kept.length).toBeGreaterThanOrEqual(3);
  });

  it('places bass roots in range, near the previous note', () => {
    expect(bassPitch(2, 33, 45)).toBe(38);
    expect(bassPitch(10, 33, 45, 38)).toBe(34);
    const p = bassPitch(5, 33, 45, 38);
    expect(p).toBe(41);
  });
});

describe('progression', () => {
  it('runs A A B A at 76 BPM in 4/4', () => {
    expect(BPM).toBe(76);
    expect(SECONDS_PER_BAR).toBeCloseTo((60 / 76) * 4, 9);
    expect(FORM).toEqual(['A', 'A', 'B', 'A']);
    expect(BARS_PER_FORM).toBe(32);
    expect(SECTIONS.A).toHaveLength(8);
    expect(SECTIONS.B).toHaveLength(8);
  });

  it('starts on the tonic and loops', () => {
    expect(barInfo(0).chord.name).toBe('Dm9');
    expect(barInfo(7).chord.name).toBe('A7sus4');
    expect(barInfo(16).section).toBe('B');
    expect(barInfo(32).chord.name).toBe('Dm9');
    expect(barInfo(32).formIndex).toBe(1);
    expect(barInfo(31).next.name).toBe('Dm9');
    expect(sectionChords(17).map((c) => c.name)).toEqual(SECTIONS.B.map((n) => CHORDS[n].name));
  });

  it('every section ends on a chord that holds the tonic D (soft cadence)', () => {
    for (const s of Object.values(SECTIONS)) expect(CHORDS[s[7]].stable).toContain(2);
  });
});
