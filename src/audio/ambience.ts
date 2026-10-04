/**
 * Music ambiences (cosmetic presets from src/store/catalog.ts MUSICS) mapped onto the engine:
 * tempo, harmony (mode + tonic), timbres, room, percussion style, ornament density and swing.
 *
 * The default preset ("Laboratorio nocturno": D dorian, 76 BPM) is the score exactly as it was:
 * DEFAULT_HARMONY is progression.ts itself, and every other default parameter is an identity
 * (scales of 1, swing 0, the original instruments). SFX cues never change with an ambience; they
 * keep picking consonant notes from whatever chord is sounding (as they always did).
 *
 * Other modes use small hand-written progressions (A A B A, 8 bars per section, like the default)
 * whose chords are derived from root + chord tones relative to the tonic, then transposed. The
 * composer works on pitch classes and fixed registers, so a new tonic needs no octave shifting.
 */
import type { AmbiencePreset, MusicMode, Timbre } from '../store/catalog';
import { BARS_PER_SECTION, FORM, SECTIONS, barInfo, sectionChords, type BarInfo, type SectionName } from './progression';
import { CHORDS, TONIC_PC, type Chord, type ChordName } from './theory';

export type Ambience = AmbiencePreset;
export type { MusicMode, Timbre };

/** The original score's parameters (identical to the catalog's 'music.nightlab'). */
export const DEFAULT_AMBIENCE: Ambience = Object.freeze({
  bpm: 76,
  mode: 'dorian',
  tonic: TONIC_PC,
  pad: 'warm',
  arp: 'pluck',
  lead: 'glass',
  bass: 'sine',
  reverb: Object.freeze({ rt60: 3.2, brightHz: 5200, darkHz: 900 }),
  reverbMix: 0.55,
  delayMix: 0.5,
  percussion: 'soft',
  sparkle: 1,
  swing: 0,
  detune: 6,
}) as Ambience;

/** Tempo range the engine accepts (catalog: 56..96). */
export const BPM_RANGE = { min: 50, max: 110 } as const;

/** Defensive copy of an untrusted preset: clamped numbers, unknown enums → defaults. */
export function sanitizeAmbience(a: Partial<Ambience> | null | undefined): Ambience {
  const d = DEFAULT_AMBIENCE;
  if (!a || typeof a !== 'object') return d;
  const num = (x: unknown, lo: number, hi: number, def: number) =>
    typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : def;
  const pick = <T extends string>(x: unknown, ok: readonly T[], def: T): T => (ok.includes(x as T) ? (x as T) : def);
  const TIMBRES: Timbre[] = ['warm', 'glass', 'choir', 'reed', 'bell', 'pluck', 'sine'];
  const MODES = Object.keys(MODE_SCALE) as MusicMode[];
  const rv = a.reverb && typeof a.reverb === 'object' ? a.reverb : d.reverb;
  return {
    bpm: num(a.bpm, BPM_RANGE.min, BPM_RANGE.max, d.bpm),
    mode: pick(a.mode, MODES, d.mode),
    tonic: Math.round(num(a.tonic, 0, 11, d.tonic)),
    pad: pick(a.pad, TIMBRES, d.pad),
    arp: pick(a.arp, TIMBRES, d.arp),
    lead: pick(a.lead, TIMBRES, d.lead),
    bass: pick(a.bass, TIMBRES, d.bass),
    reverb: {
      rt60: num(rv.rt60, 0.8, 6, d.reverb.rt60),
      brightHz: num(rv.brightHz, 1500, 12000, d.reverb.brightHz),
      darkHz: num(rv.darkHz, 300, 4000, d.reverb.darkHz),
    },
    reverbMix: num(a.reverbMix, 0, 1, d.reverbMix),
    delayMix: num(a.delayMix, 0, 1, d.delayMix),
    percussion: pick(a.percussion, ['soft', 'brushes', 'clicks', 'none'] as const, d.percussion),
    sparkle: num(a.sparkle, 0, 2, d.sparkle),
    swing: num(a.swing, 0, 0.3, d.swing),
    detune: num(a.detune, 0, 30, d.detune),
  };
}

export function sameAmbience(a: Ambience, b: Ambience): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function isDefaultAmbience(a: Ambience): boolean {
  return sameAmbience(sanitizeAmbience(a), DEFAULT_AMBIENCE);
}

// ───────────────────────────── harmony ─────────────────────────────

/** Where the composer gets its chords (progression.ts for the default score). */
export interface Harmony {
  /** `${mode}:${tonic}`, stable for caching. */
  readonly id: string;
  readonly tonic: number;
  /** Pitch classes that make good "open" (non-final) phrase endings. */
  readonly open: readonly number[];
  barInfo(bar: number): BarInfo;
  sectionChords(bar: number): Chord[];
}

/** The original score, untouched. */
export const DEFAULT_HARMONY: Harmony = {
  id: `dorian:${TONIC_PC}`,
  tonic: TONIC_PC,
  // A, E, G, C: the fifth, ninth, eleventh and seventh of D (motifs.ts composeSectionMelody).
  open: [9, 4, 7, 0],
  barInfo,
  sectionChords,
};

/** Seven-note (or pentatonic) collections relative to the tonic. */
export const MODE_SCALE: Record<MusicMode, readonly number[]> = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonicMinor: [0, 3, 5, 7, 10],
  pentatonicMajor: [0, 2, 4, 7, 9],
};

/** A chord relative to the tonic: root and chord tones (root first). */
interface RelChord {
  name: string;
  root: number;
  tones: readonly number[];
}
const rc = (name: string, root: number, tones: number[]): RelChord => ({ name, root, tones });

interface Progression {
  /** Harmonic collection of the chords (chord-scales). */
  scale: readonly number[];
  sections: Record<SectionName, readonly RelChord[]>;
  open: readonly number[];
}

// Minor family endings: fifth, ninth, eleventh, seventh. Major family: fifth, ninth, sixth, third.
const OPEN_MINOR = [7, 2, 5, 10];
const OPEN_MAJOR = [7, 2, 9, 4];

const AEOLIAN: Progression = (() => {
  const i9 = rc('i9', 0, [0, 3, 7, 10, 2]);
  const VI = rc('bVImaj9', 8, [8, 0, 3, 7, 10]);
  const III = rc('bIIImaj9', 3, [3, 7, 10, 2, 5]);
  const VII = rc('bVII6/9', 10, [10, 2, 5, 7, 0]);
  const iv9 = rc('iv9', 5, [5, 8, 0, 3, 7]);
  const v11 = rc('v7(11)', 7, [7, 10, 2, 5, 0]);
  return {
    scale: MODE_SCALE.aeolian,
    sections: { A: [i9, VI, III, VII, i9, VI, iv9, v11], B: [VI, VII, v11, i9, iv9, VI, III, v11] },
    open: OPEN_MINOR,
  };
})();

const IONIAN: Progression = (() => {
  const I = rc('Imaj9', 0, [0, 4, 7, 11, 2]);
  const vi = rc('vi9', 9, [9, 0, 4, 7, 11]);
  const IV = rc('IVmaj9', 5, [5, 9, 0, 4, 7]);
  const V69 = rc('V6/9', 7, [7, 11, 2, 4, 9]);
  const iii = rc('iii7', 4, [4, 7, 11, 2]);
  const IV69 = rc('IV6/9', 5, [5, 9, 0, 2, 7]);
  const Vsus = rc('V7sus4', 7, [7, 0, 2, 5, 9]);
  const ii = rc('ii9', 2, [2, 5, 9, 0, 4]);
  return {
    scale: MODE_SCALE.ionian,
    sections: { A: [I, vi, IV, V69, I, iii, IV69, Vsus], B: [IV, V69, iii, vi, ii, IV, I, Vsus] },
    open: OPEN_MAJOR,
  };
})();

const LYDIAN: Progression = (() => {
  const I = rc('Imaj9', 0, [0, 4, 7, 11, 2]);
  const II = rc('II(add9)', 2, [2, 6, 9, 4]);
  const I69 = rc('I6/9', 0, [0, 4, 7, 9, 2]);
  const vii = rc('vii7', 11, [11, 2, 6, 9]);
  const vi = rc('vi9', 9, [9, 0, 4, 7, 11]);
  const V = rc('Vmaj9', 7, [7, 11, 2, 6, 9]);
  const iii = rc('iii7', 4, [4, 7, 11, 2]);
  return {
    scale: MODE_SCALE.lydian,
    sections: { A: [I, II, I69, vii, I, II, vi, V], B: [II, iii, vi, I, II, vii, I69, V] },
    open: OPEN_MAJOR,
  };
})();

const MIXOLYDIAN: Progression = (() => {
  const I = rc('I9', 0, [0, 4, 7, 10, 2]);
  const VII = rc('bVII6/9', 10, [10, 2, 5, 7, 0]);
  const IV = rc('IV6/9', 5, [5, 9, 0, 2, 7]);
  const v = rc('v9', 7, [7, 10, 2, 5, 9]);
  const ii = rc('ii7', 2, [2, 5, 9, 0]);
  const vi = rc('vi7', 9, [9, 0, 4, 7]);
  return {
    scale: MODE_SCALE.mixolydian,
    sections: { A: [I, VII, IV, v, I, VII, ii, VII], B: [IV, v, ii, I, vi, IV, v, VII] },
    open: OPEN_MAJOR,
  };
})();

const mod12 = (x: number) => ((x % 12) + 12) % 12;

/** Build an engine Chord from a relative chord (pad = the non-root tones, avoid = half step above a tone). */
export function chordFromRel(r: RelChord, tonic: number, melodic: readonly number[]): Chord {
  const tr = (x: number) => mod12(x + tonic);
  const tones = r.tones.map(tr);
  const root = tr(r.root);
  const upper = tones.filter((t) => t !== root);
  const pad = (upper.length >= 4 ? upper.slice(0, 4) : [...upper, root]).slice(0, 4);
  const scale = melodic.map(tr);
  const inScale = tones.filter((t) => scale.includes(t));
  const stable = inScale.length >= 2 ? inScale : tones;
  const avoid = scale.filter((p) => !tones.includes(p) && tones.includes(mod12(p - 1)));
  return { name: r.name, root, tones, pad, scale, stable, avoid, fifth: mod12(root + 7) };
}

/** An existing chord moved by `shift` semitones (dorian on another tonic). */
function transposeChord(c: Chord, shift: number, melodic?: readonly number[]): Chord {
  const t = (xs: readonly number[]) => xs.map((x) => mod12(x + shift));
  const scale = melodic ?? t(c.scale);
  const tones = t(c.tones);
  const stable = melodic ? tones.filter((x) => scale.includes(x)) : t(c.stable);
  return {
    name: c.name,
    root: mod12(c.root + shift),
    tones,
    pad: t(c.pad),
    scale,
    stable: stable.length >= 2 ? stable : tones,
    avoid: melodic ? scale.filter((p) => !tones.includes(p) && tones.includes(mod12(p - 1))) : t(c.avoid),
    fifth: mod12(c.fifth + shift),
  };
}

/** Harmony from explicit 8-chord sections (same A A B A form as the default score). */
function sectionHarmony(id: string, tonic: number, open: readonly number[], sections: Record<SectionName, readonly Chord[]>): Harmony {
  const chordFor = (bar: number) => {
    const b = Math.max(0, Math.floor(bar));
    const sectionIndex = Math.floor(b / BARS_PER_SECTION);
    const section = FORM[sectionIndex % FORM.length];
    const barInSection = b % BARS_PER_SECTION;
    return { chord: sections[section][barInSection], section, barInSection, sectionIndex };
  };
  return {
    id,
    tonic,
    open,
    barInfo(bar: number): BarInfo {
      const cur = chordFor(bar);
      const nxt = chordFor(bar + 1);
      return {
        bar: Math.max(0, Math.floor(bar)),
        chord: cur.chord,
        next: nxt.chord,
        section: cur.section,
        barInSection: cur.barInSection,
        sectionIndex: cur.sectionIndex,
        formIndex: Math.floor(cur.sectionIndex / FORM.length),
        sectionInForm: cur.sectionIndex % FORM.length,
      };
    },
    sectionChords(bar: number): Chord[] {
      return [...sections[chordFor(bar).section]];
    },
  };
}

const harmonyCache = new Map<string, Harmony>();

/** The harmony of a mode on a tonic (pitch class 0..11). Default (dorian, D) = the original score. */
export function harmonyFor(mode: MusicMode, tonic: number): Harmony {
  const t = mod12(Math.round(tonic));
  const id = `${mode}:${t}`;
  if (id === DEFAULT_HARMONY.id) return DEFAULT_HARMONY;
  const hit = harmonyCache.get(id);
  if (hit) return hit;
  let h: Harmony;
  const melodic = mode === 'pentatonicMinor' || mode === 'pentatonicMajor' ? MODE_SCALE[mode].map((x) => mod12(x + t)) : undefined;
  if (mode === 'dorian' || mode === 'pentatonicMinor') {
    // The original progression moved to the new tonic (pentatonic: melodic layers on 5 notes).
    const shift = t - TONIC_PC;
    const map = (names: readonly ChordName[]) => names.map((n) => transposeChord(CHORDS[n], shift, melodic));
    const open = DEFAULT_HARMONY.open.map((p) => mod12(p + shift));
    h = sectionHarmony(id, t, open, { A: map(SECTIONS.A), B: map(SECTIONS.B) });
  } else {
    const prog = mode === 'aeolian' ? AEOLIAN : mode === 'lydian' ? LYDIAN : mode === 'mixolydian' ? MIXOLYDIAN : IONIAN;
    const mel = melodic ? MODE_SCALE[mode] : prog.scale;
    const mk = (xs: readonly RelChord[]) => xs.map((r) => chordFromRel(r, t, mel));
    h = sectionHarmony(id, t, prog.open.map((p) => mod12(p + t)), { A: mk(prog.sections.A), B: mk(prog.sections.B) });
  }
  harmonyCache.set(id, h);
  return h;
}

/** Composer-side style knobs (identity values = the original score). */
export interface ScoreStyle {
  /** Multiplier on SPARKLE_PROB (0..2). */
  sparkle: number;
  /** Extra swing of off-beat eighths, in beats × 2 (0..0.3). */
  swing: number;
  percussion: Ambience['percussion'];
}

export const DEFAULT_SCORE_STYLE: ScoreStyle = Object.freeze({ sparkle: 1, swing: 0, percussion: 'soft' }) as ScoreStyle;

export function scoreStyleOf(a: Ambience): ScoreStyle {
  return { sparkle: a.sparkle, swing: a.swing, percussion: a.percussion };
}
