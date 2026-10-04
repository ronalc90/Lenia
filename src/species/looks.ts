/**
 * The Bestiary's species as a child sees them (docs/ESPECIES.md): one entry per VISIBLY different
 * form, its own colour from first sight, 2–3 feature chips and a one-line comparison against the
 * closest species already known ("Como la Nadadora, pero con un agujero y más pequeña").
 *
 * Every feature is backed by a measurement of the real creature at its world's preset
 * (scripts/world-check.ts --features → looks.json, src/species/look.ts): nothing is said or drawn
 * that its matter does not show. Catalog forms that a child cannot tell from a species already in
 * the list (Orbium bicaudatus, the Orbium pairs, Scutium valvatus…) are its VARIANTS: they never
 * found a new species and never fire "¡Nueva especie!" — at most a small "variante" note.
 *
 * Pure data and pure functions (no DOM): the species card and the new-species Momento draw the
 * side-by-side comparison from `compareLooks` (which features differ, with anchors for arrows).
 */
import type { Behavior, Text } from '../core/types';
import { fixedFamily, lookalikeOf, type ColorFamily } from './identity';
import measured from './looks.json';

// ───────────────────────────── measured data ─────────────────────────────

/** One row of looks.json: a catalog form at its world's preset (scripts/world-check.ts --features --write). */
export interface MeasuredLook {
  code: string;
  world: string;
  /** Kernel radius of that world (cells). */
  R: number;
  behavior: Behavior | null;
  /** Farthest body cell from the centre, in R. */
  radiusR: number;
  areaR2: number;
  holes: number;
  holeAreaR2: number;
  bodies: number;
  /** Length / width (1 = round). */
  elongation: number;
  polarity: number;
  points: number;
  /** Bright centre ratio (look.ts Look.core). */
  core: number;
  /** Static signature distance to its catalog reference (< 1.2 = the game can reveal it). */
  formDist: number;
}

export const MEASURED_LOOKS: readonly MeasuredLook[] = measured as MeasuredLook[];

export function measuredLook(code: string): MeasuredLook | undefined {
  return MEASURED_LOOKS.find((m) => m.code === code);
}

// ───────────────────────────── species and variants ─────────────────────────────

export type SizeClass = 'S' | 'M' | 'L' | 'XL';

/** Visible features a child can point at. */
export type FeatureId =
  | 'hole'
  | 'holes'
  | 'brightCore'
  | 'long'
  | 'oval'
  | 'round'
  | 'twisted'
  | 'legs'
  | 'comb'
  | 'spins'
  | 'still'
  | 'swims';

export interface Noun {
  es: string;
  /** Spanish gender (article and adjective agreement). */
  g: 'm' | 'f';
  en: string;
}

export interface SpeciesLook {
  /** Canonical catalog code (the one its world seeds). */
  code: string;
  /** What a child calls it ("Nadadora", "Anillo"…), never shared with another species. */
  noun: Noun;
  /** The body in plain words, with its article ("un anillo con un agujero"). */
  body: Text;
  /**
   * Features seen on the sheet that no number here measures (patas, patitas, retorcida): checked by
   * eye on the contact sheet (docs/ESPECIES.md §1). Everything else comes from `measuredFeatures`.
   */
  seen: FeatureId[];
}

/** A catalog form that looks like one of the species: counted as that species, with a small note. */
export interface VariantOf {
  of: string;
  /** "variante: …" line of the card. */
  note: Text;
}

/**
 * The species a player can register: ONE per World, in World order (the Bestiary order). Their
 * colours are identity FIXED_COLORS: no two share a family, neighbours ≥ 60° apart (looks.test.ts).
 */
export const SPECIES_LOOKS: readonly SpeciesLook[] = [
  {
    code: 'O2u',
    noun: { es: 'Nadadora', g: 'f', en: 'Swimmer' },
    body: { es: 'un disco de centro brillante', en: 'a disc with a bright centre' },
    seen: [],
  },
  {
    code: 'C0v',
    noun: { es: 'Anillo', g: 'm', en: 'Ring' },
    body: { es: 'un anillo con un agujero', en: 'a ring with a hole' },
    seen: [],
  },
  {
    code: 'OG2g',
    noun: { es: 'Remolino', g: 'm', en: 'Whirl' },
    body: { es: 'un disco que gira', en: 'a spinning disc' },
    seen: [],
  },
  {
    code: 'S2s',
    noun: { es: 'Escudo', g: 'm', en: 'Shield' },
    body: { es: 'un escudo hueco', en: 'a hollow shield' },
    seen: [],
  },
  {
    code: 'H3cp',
    noun: { es: 'Bailarina', g: 'f', en: 'Dancer' },
    body: { es: 'un cuerpo retorcido con patas', en: 'a twisted body with legs' },
    seen: ['twisted', 'legs'],
  },
  {
    code: 'P4cp',
    noun: { es: 'Escalera', g: 'f', en: 'Ladder' },
    body: { es: 'una escalera con agujeros', en: 'a ladder with holes' },
    seen: [],
  },
  {
    code: '3GH2n',
    noun: { es: 'Oruga', g: 'f', en: 'Caterpillar' },
    body: { es: 'una oruga con muchas patitas', en: 'a caterpillar with many little legs' },
    seen: ['comb'],
  },
];

/**
 * The note of each look-alike form (identity LOOKALIKE_OF: catalog forms a child cannot tell from a
 * species above, docs/ESPECIES.md §2). The detector's own groups (CATALOG_GROUPS) are variants too.
 */
export const VARIANTS: Readonly<Record<string, VariantOf>> = {
  O2b: { of: 'O2u', note: { es: 'variante: dos colas', en: 'variant: two tails' } },
  O2ui: { of: 'O2u', note: { es: 'variante: más fina', en: 'variant: thinner' } },
  O2p: { of: 'O2u', note: { es: 'variante: fantasma', en: 'variant: ghost' } },
  O4s: { of: 'O2u', note: { es: 'variante: rayada', en: 'variant: striped' } },
  O4i: { of: 'O2u', note: { es: 'variante: pareja pegada', en: 'variant: joined pair' } },
  O4d: { of: 'O2u', note: { es: 'variante: pareja', en: 'variant: pair' } },
  O4a: { of: 'O2u', note: { es: 'variante: pareja', en: 'variant: pair' } },
  OG2r: { of: 'OG2g', note: { es: 'variante: que da vueltas', en: 'variant: revolving' } },
  PS3am: { of: 'S2s', note: { es: 'variante: de fuego', en: 'variant: fire' } },
  S1s: { of: 'S2s', note: { es: 'variante: pequeña', en: 'variant: small' } },
  S1v: { of: 'S2s', note: { es: 'variante: pequeña', en: 'variant: small' } },
  PG1a: { of: 'S2s', note: { es: 'variante: pequeña que gira', en: 'variant: small, spinning' } },
  P3sp: { of: 'H3cp', note: { es: 'variante: más recta, que nada', en: 'variant: straighter, swims' } },
};

const LOOK_BY_CODE = new Map(SPECIES_LOOKS.map((s) => [s.code, s]));

/** The species a catalog form counts as (itself when it is a species; its species when a variant). */
export function lookSpecies(code: string): string {
  return lookalikeOf(code);
}

/** True when a catalog form is a variant of a Bestiary species (never "¡Nueva especie!"). */
export function isVariant(code: string): boolean {
  return lookSpecies(code) !== code;
}

/** The note of a variant ("variante: pareja"), null for a species itself. */
export function variantNote(code: string): Text | null {
  return VARIANTS[code]?.note ?? null;
}

export function speciesLook(code: string): SpeciesLook | undefined {
  return LOOK_BY_CODE.get(lookSpecies(code));
}

/** The colour family of a species (its variants share it). */
export function speciesFamily(code: string): ColorFamily | undefined {
  return fixedFamily(code) ?? undefined;
}

/** "Anillo verde" / "Green ring": the common name of a World species or of a form that looks like it. */
export function lookName(code: string): Text | null {
  const l = speciesLook(code);
  const f = fixedFamily(code);
  if (!l || !f) return null;
  return { es: `${l.noun.es} ${l.noun.g === 'f' ? f.f : f.m}`, en: `${f.en.charAt(0).toUpperCase()}${f.en.slice(1)} ${l.noun.en.toLowerCase()}` };
}

// ───────────────────────────── measured features ─────────────────────────────

/** Length / width from which a body reads as long, and up to which it reads as round. [measured] */
export const LONG_ELONGATION = 1.6;
export const ROUND_ELONGATION = 1.3;
/** Centre brighter than this × its body band: a bright centre (Orbium 3.7; next is Escalera 2.2). [measured] */
export const BRIGHT_CORE = 2.5;

/** The features a measurement shows (holes, outline, bright centre, way of moving). */
export function measuredFeatures(m: MeasuredLook): FeatureId[] {
  const out: FeatureId[] = [];
  if (m.holes >= 2) out.push('holes');
  else if (m.holes === 1) out.push('hole');
  if (m.core >= BRIGHT_CORE) out.push('brightCore');
  out.push(m.elongation >= LONG_ELONGATION ? 'long' : m.elongation <= ROUND_ELONGATION ? 'round' : 'oval');
  out.push(m.behavior === 'spinner' ? 'spins' : m.behavior === 'still' || m.behavior === 'pulsing' ? 'still' : 'swims');
  return out;
}

/** Every feature of a species: measured ones, then the ones seen on the contact sheet. */
export function speciesFeatures(code: string): FeatureId[] {
  const l = speciesLook(code);
  if (!l) return [];
  const m = measuredLook(l.code);
  return [...(m ? measuredFeatures(m) : []), ...l.seen];
}

// ───────────────────────────── size ─────────────────────────────

/**
 * Size classes by the body's radius in grid cells (what the eye sees on the dish, whatever R):
 * the Ø128 start dish fills a phone (1 cell ≈ 2.8 px). Bounds measured on the world
 * species (looks.json): the Anillo ≈ 7 cells, the Nadadora ≈ 11, the Escalera ≈ 24, the Oruga (R 18) ≈ 35.
 */
export const SIZE_BOUNDS: readonly [SizeClass, number][] = [
  ['S', 9],
  ['M', 16],
  ['L', 30],
  ['XL', Infinity],
];

/** Body radius in cells of a measured form. */
export function radiusCells(m: Pick<MeasuredLook, 'radiusR' | 'R'>): number {
  return m.radiusR * m.R;
}

export function sizeClassOf(cells: number): SizeClass {
  for (const [c, max] of SIZE_BOUNDS) if (cells < max) return c;
  return 'XL';
}

export function speciesSize(code: string): SizeClass {
  const m = measuredLook(lookSpecies(code));
  return m ? sizeClassOf(radiusCells(m)) : 'M';
}

// ───────────────────────────── chips ─────────────────────────────

export interface FeatureChip {
  id: FeatureId | 'size';
  /** Size class, for the size chip. */
  size?: SizeClass;
  label: Text;
}

const FEATURE_LABEL: Record<FeatureId, Text> = {
  hole: { es: 'agujero', en: 'hole' },
  holes: { es: 'agujeros', en: 'holes' },
  brightCore: { es: 'centro brillante', en: 'bright centre' },
  long: { es: 'larga', en: 'long' },
  oval: { es: 'ovalada', en: 'oval' },
  round: { es: 'redonda', en: 'round' },
  twisted: { es: 'retorcida', en: 'twisted' },
  legs: { es: 'patas', en: 'legs' },
  comb: { es: 'muchas patitas', en: 'many little legs' },
  spins: { es: 'gira', en: 'spins' },
  still: { es: 'quieta', en: 'stays still' },
  swims: { es: 'nada', en: 'swims' },
};

const SIZE_LABEL: Record<SizeClass, Text> = {
  S: { es: 'pequeña', en: 'small' },
  M: { es: 'mediana', en: 'medium' },
  L: { es: 'grande', en: 'big' },
  XL: { es: 'gigante', en: 'giant' },
};

/** How many Bestiary species show a feature (rarer = more telling). */
function featureCount(f: FeatureId): number {
  return SPECIES_LOOKS.filter((s) => speciesFeatures(s.code).includes(f)).length;
}

/**
 * 2–3 chips for the card: the size class first, then its most telling features (the rarest in the
 * Bestiary first; ties keep the measured order: holes, centre, outline, motion).
 */
export function featureChips(code: string, max = 3): FeatureChip[] {
  const size = speciesSize(code);
  const out: FeatureChip[] = [{ id: 'size', size, label: SIZE_LABEL[size] }];
  const fs = speciesFeatures(code);
  const ranked = fs.map((f, i) => ({ f, i, n: featureCount(f) })).sort((a, b) => a.n - b.n || a.i - b.i);
  for (const { f } of ranked) {
    if (out.length >= max) break;
    out.push({ id: f, label: FEATURE_LABEL[f] });
  }
  return out;
}

// ───────────────────────────── comparison ─────────────────────────────

/** A feature that differs between two species, for the arrows of the side-by-side card. */
export interface LookDiff {
  kind: 'holes' | 'centre' | 'legs' | 'outline' | 'size' | 'motion' | 'colour';
  /** Which portrait shows the feature the arrow points at ('a' = the new species, 'b' = the known one). */
  side: 'a' | 'b' | 'both';
  /** Where the arrow points on that portrait: look.ts LookAnchors key (measureLook(portrait, R).anchors). */
  anchor: 'holes' | 'tip' | 'centre';
  /** The phrase about the NEW species: "con un agujero", "mucho más grande"… */
  text: Text;
  /** How visible the difference is at phone size (bigger first; colour 0.5). */
  weight: number;
}

/** Shape and motion feature groups (one value of each per species). */
const OUTLINE: readonly FeatureId[] = ['long', 'oval', 'round'];
const MOTION: readonly FeatureId[] = ['spins', 'still', 'swims'];

/** Spanish adjective agreeing with the new species' noun: "pequeña" / "pequeño"; "grande" either way. */
const adj = (g: 'm' | 'f', fem: string): string => (g === 'f' || !fem.endsWith('a') ? fem : fem.slice(0, -1) + 'o');

/** Size ratio from which a child sees "bigger / smaller" side by side, and "much". [design: 1.35 ≈ the eye's area step ×1.8] */
export const SIZE_STEP = 1.35;
export const SIZE_MUCH = 2;

/**
 * Every visible difference of `a` (the new species) against `b` (one already known), most visible
 * first. Pure: data for the comparison line and the arrows.
 */
export function compareLooks(aCode: string, bCode: string): LookDiff[] {
  const a = speciesLook(aCode);
  const b = speciesLook(bCode);
  if (!a || !b) return [];
  const fa = speciesFeatures(a.code);
  const fb = speciesFeatures(b.code);
  const g = a.noun.g;
  const out: LookDiff[] = [];
  const holes = (f: FeatureId[]) => (f.includes('holes') ? 2 : f.includes('hole') ? 1 : 0);
  const ha = holes(fa);
  const hb = holes(fb);
  if (ha !== hb) {
    if (ha > hb) {
      out.push({
        kind: 'holes',
        side: 'a',
        anchor: 'holes',
        text: ha === 1 ? { es: 'con un agujero', en: 'with a hole' } : hb === 1 ? { es: 'con más agujeros', en: 'with more holes' } : { es: 'con agujeros', en: 'with holes' },
        weight: 5,
      });
    } else out.push({ kind: 'holes', side: 'b', anchor: 'holes', text: hb - ha > 1 && ha ? { es: 'con menos agujeros', en: 'with fewer holes' } : { es: 'sin agujeros', en: 'without holes' }, weight: 4 });
  }
  if (fa.includes('brightCore') !== fb.includes('brightCore')) {
    out.push(
      fa.includes('brightCore')
        ? { kind: 'centre', side: 'a', anchor: 'centre', text: { es: 'con el centro brillante', en: 'with a bright centre' }, weight: 3.5 }
        : { kind: 'centre', side: 'b', anchor: 'centre', text: { es: 'sin centro brillante', en: 'without a bright centre' }, weight: 3.5 },
    );
  }
  const legs = (f: FeatureId[]) => (f.includes('comb') ? 2 : f.includes('legs') ? 1 : 0);
  if (legs(fa) !== legs(fb)) {
    out.push(
      legs(fa) > legs(fb)
        ? { kind: 'legs', side: 'a', anchor: 'tip', text: legs(fa) === 2 ? { es: 'con muchas patitas', en: 'with many little legs' } : { es: 'con patas', en: 'with legs' }, weight: 4 }
        : { kind: 'legs', side: 'b', anchor: 'tip', text: { es: 'sin patas', en: 'without legs' }, weight: 3 },
    );
  }
  const oa = fa.find((f) => OUTLINE.includes(f));
  const ob = fb.find((f) => OUTLINE.includes(f));
  if (oa && ob && oa !== ob) {
    const t: Record<string, Text> = {
      long: { es: `más ${adj(g, 'larga')}`, en: 'longer' },
      oval: { es: `más ${adj(g, oa === 'oval' && ob === 'long' ? 'corta' : 'alargada')}`, en: ob === 'long' ? 'shorter' : 'more stretched' },
      round: { es: `más ${adj(g, 'redonda')}`, en: 'rounder' },
    };
    // round ↔ long is plain to see; a step to or from oval is subtler.
    const far = (oa === 'long' && ob === 'round') || (oa === 'round' && ob === 'long');
    out.push({ kind: 'outline', side: 'a', anchor: oa === 'round' ? 'centre' : 'tip', text: t[oa], weight: far ? 3.5 : 2 });
  }
  const ma = measuredLook(a.code);
  const mb = measuredLook(b.code);
  if (ma && mb) {
    const ratio = radiusCells(ma) / radiusCells(mb);
    if (ratio >= SIZE_STEP || ratio <= 1 / SIZE_STEP) {
      const big = ratio > 1;
      const much = ratio >= SIZE_MUCH || ratio <= 1 / SIZE_MUCH;
      out.push({
        kind: 'size',
        side: 'both',
        anchor: 'centre',
        text: {
          es: `${much ? 'mucho ' : ''}más ${big ? 'grande' : adj(g, 'pequeña')}`,
          en: `${much ? 'much ' : ''}${big ? 'bigger' : 'smaller'}`,
        },
        weight: much ? 4.5 : 3.2,
      });
    }
  }
  const va = fa.find((f) => MOTION.includes(f));
  const vb = fb.find((f) => MOTION.includes(f));
  if (va && vb && va !== vb) {
    const t: Record<string, Text> = {
      spins: { es: 'que gira en el sitio', en: 'that spins in place' },
      still: { es: `que se queda ${adj(g, 'quieta')}`, en: 'that stays still' },
      swims: { es: 'que nada', en: 'that swims' },
    };
    out.push({ kind: 'motion', side: 'a', anchor: 'centre', text: t[va], weight: 2.5 });
  }
  const f = fixedFamily(a.code);
  if (f && f.id !== fixedFamily(b.code)?.id) {
    out.push({ kind: 'colour', side: 'a', anchor: 'centre', text: { es: `de color ${f.m}`, en: f.en }, weight: 0.5 });
  }
  return out.sort((p, q) => q.weight - p.weight);
}

/**
 * How easy two species are to tell apart at phone size: the sum of their visible differences
 * (colour not counted — it differs anyway). Below LOOKALIKE a child cannot tell them apart.
 */
export function visualDistance(aCode: string, bCode: string): number {
  if (lookSpecies(aCode) === lookSpecies(bCode)) return 0;
  return compareLooks(aCode, bCode)
    .filter((d) => d.kind !== 'colour')
    .reduce((s, d) => s + d.weight, 0);
}

/**
 * Two Bestiary species need differences worth at least this (e.g. a hole + another way of moving, or
 * a ×2 size + another outline); colour comes on top. Pairs below it are variants of one species.
 */
export const LOOKALIKE = 5;

/** The known species that looks most like `code` (null when none is known). */
export function closestKnown(code: string, known: readonly string[]): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  const self = lookSpecies(code);
  for (const k of known) {
    const s = lookSpecies(k);
    if (s === self || !LOOK_BY_CODE.has(s)) continue;
    const d = visualDistance(code, s);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

const article = (n: Noun): Text => ({ es: `${n.g === 'f' ? 'la' : 'el'} ${n.es}`, en: `the ${n.en.toLowerCase()}` });

/**
 * One kid-friendly line: "Como la Nadadora, pero con un agujero y más pequeño." Against the closest
 * species already known (`known` = catalog codes in the Bestiary); the first species says what it is
 * ("Tu primera especie: un disco de centro brillante."). The two most visible differences are named.
 */
export function compareLine(code: string, known: readonly string[]): Text {
  const l = speciesLook(code);
  if (!l) return { es: 'Una forma nueva.', en: 'A new shape.' };
  const near = closestKnown(code, known);
  if (!near) return { es: `Tu primera especie: ${l.body.es}.`, en: `Your first species: ${l.body.en}.` };
  const n = LOOK_BY_CODE.get(near)!;
  const all = compareLooks(code, near);
  const top = all.filter((d) => d.kind !== 'colour').slice(0, 2);
  const parts = top.length ? top : all.slice(0, 1);
  const es = parts.map((d) => d.text.es);
  const en = parts.map((d) => d.text.en);
  return {
    es: `Como ${article(n.noun).es}, pero ${es.join(' y ')}.`,
    en: `Like ${article(n.noun).en}, but ${en.join(' and ')}.`,
  };
}

/** The new species' card data in one call: chips, the line and the differences to draw arrows on. */
export function newSpeciesComparison(code: string, known: readonly string[]): {
  species: string;
  versus: string | null;
  line: Text;
  chips: FeatureChip[];
  diffs: LookDiff[];
} {
  const versus = closestKnown(code, known);
  return {
    species: lookSpecies(code),
    versus,
    line: compareLine(code, known),
    chips: featureChips(code),
    diffs: versus ? compareLooks(code, versus).filter((d) => d.kind !== 'colour').slice(0, 2) : [],
  };
}
