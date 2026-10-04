import { describe, expect, it } from 'vitest';
import { Composer, signatureFor, type Inst } from './score';
import { LAYER_MIX, LAYERS, MAX_LEVEL, progressScore, stepLevel, targetLevel, type MusicState } from './intensity';
import { ARP16, ARP8, arpPool, bassBar, BASS_HI, BASS_LO } from './patterns';
import { barInfo } from './progression';
import { CHORDS, pc } from './theory';

const S = (eps: number, species: number, creatures: number, behaviors = 0, era = 1): MusicState => ({
  eps,
  species,
  creatures,
  behaviors,
  era,
  paused: false,
});

describe('intensity mapping', () => {
  it('maps the game arc to levels 0..5', () => {
    expect(targetLevel(S(0, 0, 0), 0)).toBe(0); // empty dish: pad only
    expect(targetLevel(S(50, 4, 0), 3)).toBe(0); // nothing alive: back to the pad
    expect(targetLevel(S(1, 1, 1), 0)).toBe(1); // first creature
    expect(targetLevel(S(1.5, 2, 3), 1)).toBe(2); // several species → arpeggio
    expect(targetLevel(S(12, 3, 4, 2), 2)).toBe(3); // ~10 E/s → melody
    expect(targetLevel(S(45, 5, 6, 3), 3)).toBe(4); // ~40 E/s → percussion
    expect(targetLevel(S(300, 7, 8, 4), 4)).toBe(5); // late game
  });

  it('is monotonic in essence per second', () => {
    let prev = 0;
    for (let eps = 0.1; eps < 1e6; eps *= 1.5) {
      const l = targetLevel(S(eps, 8, 8, 4), 0);
      expect(l).toBeGreaterThanOrEqual(prev);
      expect(l).toBeLessThanOrEqual(MAX_LEVEL);
      prev = l;
    }
    expect(prev).toBe(MAX_LEVEL);
  });

  it('keeps a single-species dish out of the percussion levels', () => {
    expect(targetLevel(S(1e5, 1, 9, 1), 0)).toBeLessThanOrEqual(3);
  });

  it('has hysteresis against flapping', () => {
    const s = S(38, 5, 6, 0); // just under the level-4 threshold
    expect(progressScore(s)).toBeLessThan(4);
    expect(progressScore(s)).toBeGreaterThan(3.6);
    expect(targetLevel(s, 4)).toBe(4); // stays
    expect(targetLevel(s, 3)).toBe(3); // would not rise
  });

  it('survives garbage input', () => {
    expect(targetLevel(S(NaN, 2, 3), 0)).toBeGreaterThanOrEqual(1);
    expect(targetLevel(S(Infinity, 2, 3), 0)).toBeLessThanOrEqual(MAX_LEVEL);
  });

  it('adds layers as the level rises and steps one level at a time', () => {
    for (const L of LAYERS) {
      const firstOn = LAYER_MIX[L].findIndex((g) => g > 0);
      for (let l = firstOn; l <= MAX_LEVEL; l++) expect(LAYER_MIX[L][l]).toBeGreaterThan(0);
    }
    expect(LAYER_MIX.pad[0]).toBeGreaterThan(0);
    expect(LAYER_MIX.bass[0]).toBe(0);
    expect(stepLevel(0, 5)).toBe(1);
    expect(stepLevel(5, 0)).toBe(4);
    expect(stepLevel(3, 3)).toBe(3);
  });
});

describe('patterns', () => {
  it('arpeggio pools are chord tones in register', () => {
    for (const c of Object.values(CHORDS)) {
      const pool = arpPool(c, 62);
      expect(pool).toHaveLength(8);
      for (const m of pool) expect(c.tones).toContain(pc(m));
    }
    for (const shape of [...ARP8, ...ARP16]) for (const i of shape) expect(i).toBeLessThan(8);
  });

  it('bass figures stay low and on chord/scale notes', () => {
    for (let bar = 0; bar < 32; bar++) {
      const info = barInfo(bar);
      for (let level = 1; level <= 5; level++) {
        const notes = bassBar(info.chord, info.next, level);
        expect(pc(notes[0].midi)).toBe(info.chord.root);
        for (const n of notes) {
          expect(n.midi).toBeGreaterThanOrEqual(BASS_LO - 5);
          expect(n.midi).toBeLessThanOrEqual(BASS_HI + 7);
          expect(info.chord.scale).toContain(pc(n.midi));
          expect(n.beat + n.dur).toBeLessThanOrEqual(4);
        }
      }
    }
  });
});

describe('composer', () => {
  const instsAt = (level: number, bars = 16): Set<Inst> => {
    const c = new Composer(7);
    const set = new Set<Inst>();
    for (let b = 0; b < bars; b++) for (const e of c.plan(b, level, { signatures: [signatureFor('x')] }).events) set.add(e.inst);
    return set;
  };

  it('layers instruments by intensity', () => {
    expect(instsAt(0).size).toBe(0); // pad only (the pad is persistent, not events)
    expect(instsAt(1)).toEqual(new Set(['bass', 'sig']));
    expect(instsAt(2).has('pluck')).toBe(true);
    expect(instsAt(2).has('bell')).toBe(false);
    expect(instsAt(3).has('bell')).toBe(true);
    const l4 = instsAt(4);
    expect(l4.has('shaker') && l4.has('hat')).toBe(true);
    expect(l4.has('kick')).toBe(false);
    const l5 = instsAt(5, 32);
    expect(l5.has('kick') && l5.has('rim') && l5.has('glint') && l5.has('echo')).toBe(true);
  });

  it('keeps every event inside its bar, in range, sorted', () => {
    const c = new Composer(11);
    for (let b = 0; b < 64; b++) {
      const p = c.plan(b, 5, { signatures: [signatureFor('a'), signatureFor('b')] });
      let prev = -1;
      for (const e of p.events) {
        expect(e.beat).toBeGreaterThanOrEqual(0);
        expect(e.beat).toBeLessThan(4);
        expect(e.beat).toBeGreaterThanOrEqual(prev);
        prev = e.beat;
        expect(e.vel).toBeGreaterThan(0);
        expect(e.vel).toBeLessThanOrEqual(1);
        expect(Math.abs(e.pan)).toBeLessThanOrEqual(1);
        if (e.inst === 'pluck' || e.inst === 'glint' || e.inst === 'sig') expect(p.info.chord.scale).toContain(pc(e.midi));
        if (e.inst === 'pluck') expect(p.info.chord.tones).toContain(pc(e.midi));
      }
      expect(new Set(p.pad.map(pc))).toEqual(new Set(p.info.chord.pad));
    }
  });

  it('is deterministic per seed and differs across seeds', () => {
    const run = (seed: number) => {
      const c = new Composer(seed);
      return Array.from({ length: 32 }, (_, b) => c.plan(b, 5).events.map((e) => `${e.inst}${e.midi}@${e.beat}`).join(',')).join('|');
    };
    expect(run(3)).toBe(run(3));
    expect(run(3)).not.toBe(run(4));
  });

  it('plays a fresh species signature on beat 1', () => {
    const c = new Composer(1);
    const p = c.plan(0, 2, { fresh: signatureFor('orbium') });
    const sig = p.events.filter((e) => e.inst === 'sig');
    expect(sig.length).toBeGreaterThan(0);
    expect(sig[0].beat).toBe(0);
    expect(p.info.chord.stable).toContain(pc(sig[0].midi));
  });

  it('gives species stable, varied signatures', () => {
    const a = signatureFor('orbium');
    expect(signatureFor('orbium')).toEqual(a);
    const all = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => JSON.stringify(signatureFor(id))));
    expect(all.size).toBeGreaterThan(3);
  });
});
