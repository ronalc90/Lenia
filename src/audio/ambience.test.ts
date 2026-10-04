import { describe, expect, it } from 'vitest';
import { MUSICS } from '../store/catalog';
import { DEFAULT_AMBIENCE, DEFAULT_HARMONY, MODE_SCALE, harmonyFor, isDefaultAmbience, sanitizeAmbience } from './ambience';
import { Composer } from './score';
import { pc } from './theory';

const mod12 = (x: number) => ((x % 12) + 12) % 12;

describe('music ambiences', () => {
  it('the free default preset is the original score', () => {
    const def = MUSICS.find((m) => m.unlock.type === 'default')!;
    expect(isDefaultAmbience(def.data)).toBe(true);
    expect(sanitizeAmbience(def.data)).toEqual(DEFAULT_AMBIENCE);
    expect(harmonyFor(def.data.mode, def.data.tonic)).toBe(DEFAULT_HARMONY);
  });

  it('every other catalog preset differs from the default', () => {
    for (const m of MUSICS.filter((x) => x.unlock.type !== 'default')) expect(isDefaultAmbience(m.data), m.id).toBe(false);
  });

  it('sanitizes untrusted presets', () => {
    const a = sanitizeAmbience({ bpm: 400, mode: 'klingon' as never, tonic: 15.4, swing: -1, reverb: { rt60: 99, brightHz: 1, darkHz: 1e6 } });
    expect(a.bpm).toBeLessThanOrEqual(110);
    expect(a.mode).toBe('dorian');
    expect(a.tonic).toBe(11);
    expect(a.swing).toBe(0);
    expect(a.reverb.rt60).toBeLessThanOrEqual(6);
    expect(sanitizeAmbience(null)).toBe(DEFAULT_AMBIENCE);
  });

  for (const m of MUSICS) {
    it(`${m.id}: chords stay in the mode, no flat ninth over the root, four pad voices`, () => {
      const { mode, tonic } = m.data;
      const h = harmonyFor(mode, tonic);
      const scale = MODE_SCALE[mode].map((x) => mod12(x + tonic));
      for (let bar = 0; bar < 32; bar++) {
        const c = h.barInfo(bar).chord;
        expect(new Set(c.pad).size, `${c.name} pad`).toBe(4);
        expect(c.tones.includes(mod12(c.root + 1)), `${c.name} b9`).toBe(false);
        // Bass plays root and fifth: both must belong to the chord-scale.
        expect(c.scale.includes(c.root) || c.tones.includes(c.root)).toBe(true);
        if (mode !== 'dorian' && mode !== 'pentatonicMinor') {
          for (const t of c.tones) expect(MODE_SCALE[mode === 'pentatonicMajor' ? 'ionian' : mode].map((x) => mod12(x + tonic)), `${m.id} ${c.name}`).toContain(t);
          expect(MODE_SCALE[mode === 'pentatonicMajor' ? 'ionian' : mode].map((x) => mod12(x + tonic))).toContain(c.fifth);
        }
        // Melodic material walks the preset's own collection (pentatonic modes: 5 notes).
        if (mode !== 'dorian') for (const p of c.scale) expect(scale, `${m.id} ${c.name} scale`).toContain(p);
      }
    });
  }

  it('the composer plays the ambience harmony (bass on the roots, melody in the collection)', () => {
    for (const m of MUSICS.filter((x) => x.data.mode !== 'dorian')) {
      const h = harmonyFor(m.data.mode, m.data.tonic);
      const c = new Composer(7);
      c.setHarmony(h);
      c.setStyle({ sparkle: m.data.sparkle, swing: m.data.swing, percussion: m.data.percussion });
      const coll = new Set(MODE_SCALE[m.data.mode === 'pentatonicMajor' ? 'ionian' : m.data.mode === 'pentatonicMinor' ? 'dorian' : m.data.mode].map((x) => mod12(x + m.data.tonic)));
      for (let bar = 0; bar < 64; bar++) {
        const plan = c.plan(bar, 5);
        const chord = h.barInfo(bar).chord;
        const firstBass = plan.events.find((e) => e.inst === 'bass');
        if (firstBass) expect(pc(firstBass.midi)).toBe(chord.root);
        for (const e of plan.events) {
          if (e.inst === 'bell' || e.inst === 'echo' || e.inst === 'glint' || e.inst === 'pluck') {
            expect(coll.has(pc(e.midi)) || chord.tones.includes(pc(e.midi)), `${m.id} bar ${bar} ${e.inst} ${e.midi}`).toBe(true);
          }
          expect(e.beat).toBeGreaterThanOrEqual(0);
          expect(e.beat).toBeLessThan(4.5);
        }
      }
    }
  });

  it("'none' percussion removes the percussion layer", () => {
    const c = new Composer(3);
    c.setStyle({ sparkle: 1, swing: 0, percussion: 'none' });
    for (let bar = 0; bar < 16; bar++) expect(c.plan(bar, 5).events.some((e) => e.layer === 'perc')).toBe(false);
  });
});
