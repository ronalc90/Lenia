/**
 * Species identity: a colour family per species (maximally separated in the bestiary), a Spanish /
 * English common name from its body, behaviour and colour ("Nadadora celeste" / "Sky swimmer"), a
 * procedural Latin name as the scientific line of discoveries, and the catalog species the detector
 * cannot tell apart (grouped so they never register twice).
 *
 * Everything here is pure and deterministic: the same signature (and the same bestiary order)
 * always yields the same hue and name. The game freezes both at registration time.
 */
import type { Behavior, Text } from '../core/types';
import { SIG } from '../detect/signature';
import { CATALOG } from '../sim/catalog';
import type { ShapeKind } from './shape';

// ───────────────────────────── catalog groups ─────────────────────────────

/**
 * Catalog species whose detector signatures are closer than the species threshold, so the detector
 * cannot tell them apart (scripts/species-audit.ts prints the pairwise distances): Orbium
 * unicaudatus vs bicaudatus (0.46) and Discutium solidus vs Pyroscutium ambiguus (0.31). Each group
 * counts as ONE species in the bestiary; the first code is the canonical one.
 */
export const CATALOG_GROUPS: readonly (readonly string[])[] = [
  ['O2u', 'O2b'],
  ['S2s', 'PS3am'],
];

/** Canonical code of a catalog species' group (itself when it is not grouped). */
export function catalogGroup(code: string): string {
  for (const g of CATALOG_GROUPS) if (g.includes(code)) return g[0];
  return code;
}

/** True when two catalog codes are the same species for the bestiary. */
export function sameCatalogSpecies(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && catalogGroup(a) === catalogGroup(b);
}

// ───────────────────────────── colour ─────────────────────────────

export interface ColorFamily {
  id: string;
  /** Hue in degrees. */
  hue: number;
  /** Spanish adjective, masculine / feminine. */
  m: string;
  f: string;
  en: string;
}

/**
 * Colour families of the bestiary. Every species gets its own family (so its halo, card and tinted
 * matter differ at a glance) until the 12 are used; the family name is part of its common name
 * ("Nadadora celeste", "Pareja dorada"). Spread around the whole wheel, ~25–45° apart.
 */
export const COLOR_FAMILIES: readonly ColorFamily[] = [
  { id: 'coral', hue: 8, m: 'coral', f: 'coral', en: 'coral' },
  { id: 'dorado', hue: 45, m: 'dorado', f: 'dorada', en: 'golden' },
  { id: 'lima', hue: 80, m: 'lima', f: 'lima', en: 'lime' },
  { id: 'verde', hue: 112, m: 'verde', f: 'verde', en: 'green' },
  { id: 'jade', hue: 145, m: 'jade', f: 'jade', en: 'jade' },
  { id: 'turquesa', hue: 172, m: 'turquesa', f: 'turquesa', en: 'turquoise' },
  { id: 'celeste', hue: 198, m: 'celeste', f: 'celeste', en: 'sky' },
  { id: 'azul', hue: 222, m: 'azul', f: 'azul', en: 'blue' },
  { id: 'indigo', hue: 246, m: 'índigo', f: 'índigo', en: 'indigo' },
  { id: 'violeta', hue: 272, m: 'violeta', f: 'violeta', en: 'violet' },
  { id: 'malva', hue: 298, m: 'malva', f: 'malva', en: 'mauve' },
  { id: 'rosado', hue: 325, m: 'rosado', f: 'rosada', en: 'pink' },
];

/**
 * Preferred colour family of each catalog species. World species and their look-alikes match
 * FIXED_COLORS (and always get it); the others use it when it is free and well apart (classic loop).
 */
export const CATALOG_COLORS: Readonly<Record<string, string>> = {
  O2u: 'celeste',
  O2b: 'celeste',
  O2ui: 'celeste',
  O2p: 'celeste',
  O4s: 'celeste',
  O4i: 'celeste',
  OG2g: 'violeta',
  OG2r: 'violeta',
  O4d: 'celeste',
  O4a: 'celeste',
  H3cp: 'turquesa',
  H3s: 'celeste',
  H5s: 'rosado',
  P3sp: 'turquesa',
  P4cp: 'dorado',
  PG1c: 'malva',
  PG1a: 'coral',
  S1s: 'coral',
  S1v: 'coral',
  'SN+': 'verde',
  S2s: 'coral',
  PS3am: 'coral',
  S3s: 'violeta',
  C0v: 'verde',
  '3GH2n': 'rosado',
  K4d: 'coral',
};

/**
 * The Bestiary species' OWN colour, fixed from the first time they are seen (docs/ESPECIES.md §3):
 * one family each, Bestiary neighbours ≥ 60° apart; their look-alike forms (species/looks VARIANTS,
 * `LOOKALIKE_OF`) wear the same colour. `speciesHue` returns it whatever else is in the Bestiary.
 */
export const FIXED_COLORS: Readonly<Record<string, string>> = {
  O2u: 'celeste',
  C0v: 'verde',
  OG2g: 'violeta',
  S2s: 'coral',
  H3cp: 'turquesa',
  P4cp: 'dorado',
  '3GH2n': 'rosado',
};

/**
 * Catalog forms a child cannot tell from a Bestiary species (measured, docs/ESPECIES.md §2): the
 * Orbium family and its pairs look like the Nadadora, the small Scutium cups like the Escudo, etc.
 * They count as that species (a "variante"), never as a new one. Notes: species/looks VARIANTS.
 */
export const LOOKALIKE_OF: Readonly<Record<string, string>> = {
  O2b: 'O2u',
  O2ui: 'O2u',
  O2p: 'O2u',
  O4s: 'O2u',
  O4i: 'O2u',
  O4d: 'O2u',
  O4a: 'O2u',
  OG2r: 'OG2g',
  PS3am: 'S2s',
  S1s: 'S2s',
  S1v: 'S2s',
  PG1a: 'S2s',
  P3sp: 'H3cp',
};

/** The Bestiary species a catalog form counts as by its LOOK (itself, its detector group, or the species it looks like). */
export function lookalikeOf(code: string): string {
  const g = catalogGroup(code);
  return LOOKALIKE_OF[code] ?? LOOKALIKE_OF[g] ?? g;
}

/** The fixed colour family of a catalog form (its species'), or null when it has none. */
export function fixedFamily(code: string | null | undefined): ColorFamily | null {
  if (!code) return null;
  const id = FIXED_COLORS[lookalikeOf(code)];
  return id ? COLOR_FAMILIES.find((f) => f.id === id)! : null;
}

/** FNV-1a over a string → uint32. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

/**
 * A stable key of a signature: each known feature rounded to a coarse step (so tiny float noise
 * cannot change a name or hue), unknown features as "?".
 */
export function signatureKey(sig: readonly number[]): string {
  const STEP = [0.05, 0.05, 0.03, 1, 0.03, 0.05, 0.05, 0.05, 0.05, 0.05, 0.25, 0.05, 0.2, 0.03, 0.2];
  return sig.map((v, i) => (v >= 0 ? Math.round(v / (STEP[i] ?? 0.05)).toString(36) : '?')).join('.');
}

const wrap360 = (h: number): number => ((h % 360) + 360) % 360;
/** Circular distance between two hues in degrees. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(wrap360(a) - wrap360(b));
  return Math.min(d, 360 - d);
}

/** The colour family a hue belongs to (nearest family hue). */
export function colorFamily(hue: number): ColorFamily {
  let best = COLOR_FAMILIES[0];
  for (const f of COLOR_FAMILIES) if (hueDistance(f.hue, hue) < hueDistance(best.hue, hue)) best = f;
  return best;
}

/** A free family keeps at least this share of the best achievable separation to be chosen by preference. */
const SEPARATION_KEEP = 0.75;

/**
 * Accent hue (degrees) of a new species. A World species (FIXED_COLORS, and the forms that look like
 * one) always gets its own family. Others: `taken` = hues of the species already in the bestiary.
 * While a colour family is free the hue is a family hue: among the free families whose distance to
 * every taken hue is at least SEPARATION_KEEP of the best possible, the one nearest to the species'
 * preference (its catalog colour, else a hash of its signature) wins — so the first species keep
 * their "natural" colour and every new one lands far from the others. With all 12 families used,
 * the most separated hue of the wheel. Deterministic for the same inputs.
 */
export function speciesHue(sig: readonly number[], catalogCode: string | null = null, taken: readonly number[] = []): number {
  // A Bestiary species (or a form that looks like one) has its own colour from first sight.
  const fixed = fixedFamily(catalogCode);
  if (fixed) return fixed.hue;
  const prefId = catalogCode ? CATALOG_COLORS[catalogGroup(catalogCode)] ?? CATALOG_COLORS[catalogCode] : undefined;
  const pref = prefId
    ? COLOR_FAMILIES.find((f) => f.id === prefId)!.hue
    : COLOR_FAMILIES[hashString(signatureKey(sig)) % COLOR_FAMILIES.length].hue;
  const gap = (h: number): number => {
    let g = 360;
    for (const t of taken) g = Math.min(g, hueDistance(h, t));
    return g;
  };
  const used = new Set(taken.map((t) => colorFamily(t).id));
  const free = COLOR_FAMILIES.filter((f) => !used.has(f.id));
  if (free.length) {
    const best = Math.max(...free.map((f) => gap(f.hue)));
    const ok = free.filter((f) => gap(f.hue) >= SEPARATION_KEEP * best);
    ok.sort((a, b) => hueDistance(a.hue, pref) - hueDistance(b.hue, pref) || a.hue - b.hue);
    return ok[0].hue;
  }
  let bestH = pref;
  let bestGap = -1;
  for (let h = 0; h < 360; h++) {
    const g = gap(h);
    if (g > bestGap || (g === bestGap && hueDistance(h, pref) < hueDistance(bestH, pref))) {
      bestGap = g;
      bestH = h;
    }
  }
  return bestH;
}

// ───────────────────────────── names ─────────────────────────────

/** Behaviour → Latin epithets (participles and adjectives, the way Chan names his species). */
const EPITHETS: Record<Behavior | 'none', readonly string[]> = {
  swimmer: ['natans', 'vagans', 'velox', 'migrans'],
  spinner: ['gyrans', 'rotans', 'volvens', 'vertens'],
  pulsing: ['pulsans', 'palpitans', 'respirans', 'tremens'],
  divider: ['dividuus', 'fissilis', 'geminans', 'partiens'],
  colony: ['gregarius', 'socialis', 'consors', 'congregans'],
  still: ['solidus', 'sessilis', 'quietus', 'placidus'],
  none: ['ignotus', 'novus', 'obscurus', 'rarus'],
};

/** Shape roots (Latin stems): what the body looks like. */
const ROOTS = {
  elongated: ['fus', 'line', 'bacul', 'virg'],
  polar: ['orb', 'lun', 'falc', 'cauda'],
  dense: ['scut', 'lamin', 'clype', 'disc'],
  diffuse: ['nebul', 'vel', 'umbr', 'vapor'],
  round: ['glob', 'circ', 'sphaer', 'gutt'],
  plain: ['lum', 'gel', 'plasm', 'noct'],
} as const;
const SUFFIXES = ['ium', 'ium', 'ium', 'ella', 'ion', 'ula'] as const;
/** Stem + suffix combinations that read as ordinary English/Spanish words, not as a genus. */
const NOT_LATIN = new Set(['fusion', 'lineion', 'discion', 'nebula', 'circula', 'vapora']);

export interface NameParts {
  genus: string;
  epithet: string;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const VOWEL = /[aeiou]$/;
const isVowelStart = (s: string): boolean => /^[aeiou]/.test(s);

function join(a: string, b: string): string {
  if (!a) return b;
  if (a.endsWith('a') && isVowelStart(b)) return a.slice(0, -1) + b; // "tetra" + "orb" → "tetrorb"
  if (!VOWEL.test(a) && !isVowelStart(b)) return a + 'i' + b; // "magn" + "scut" → "magniscut"
  return a + b;
}

function stemJoin(root: string, suffix: string): string {
  // "line" + "ium" → "linium", "cauda" + "ella" → "caudella"
  return VOWEL.test(root) && isVowelStart(suffix) ? root.slice(0, -1) + suffix : root + suffix;
}

/** Shape traits read from a signature (indices of detect/signature SIG). */
export function shapeTraits(sig: readonly number[]): {
  size: 'small' | 'medium' | 'large';
  symmetry: 0 | 3 | 4 | 5 | 6;
  body: keyof typeof ROOTS;
} {
  const g = (i: number, d = 0): number => (sig[i] >= 0 ? sig[i] : d);
  const mass = g(SIG.MASS, 0.5);
  const size = mass < 0.3 ? 'small' : mass > 1.8 ? 'large' : 'medium';
  // n-fold symmetry: the strongest of H3..H6 when it clearly dominates.
  let symmetry: 0 | 3 | 4 | 5 | 6 = 0;
  let best = 0;
  for (const [n, i, min] of [
    [3, SIG.H3, 0.15],
    [4, SIG.H4, 0.2],
    [5, SIG.H5, 0.18],
    [6, SIG.H6, 0.18],
  ] as const) {
    const v = g(i);
    if (v >= min && v > best) {
      best = v;
      symmetry = n;
    }
  }
  const h1 = g(SIG.H1);
  const h2 = g(SIG.H2);
  const dens = g(SIG.DENSITY, 0.6);
  const maxH = Math.max(h1, h2, g(SIG.H3), g(SIG.H4), g(SIG.H5), g(SIG.H6));
  let body: keyof typeof ROOTS = 'plain';
  if (h2 >= 0.45) body = 'elongated';
  else if (h1 >= 0.07 && h2 < 0.35) body = 'polar';
  else if (dens >= 0.72) body = 'dense';
  else if (dens < 0.48) body = 'diffuse';
  else if (maxH < 0.06) body = 'round';
  return { size, symmetry, body };
}

/**
 * Procedural binomial for a species that is not in Chan's catalog, e.g. "Lunium natans",
 * "Trinebulella gyrans", "Magnifusium pulsans". Genus from the body shape (n-fold symmetry and
 * size prefixes, a shape root, a Lenia-style suffix), epithet from the behaviour. Neutral Latin:
 * the same string in Spanish and English. `taken` (lower-case full names) is avoided by stepping
 * through the variants; catalog names are always avoided.
 */
export function latinName(
  sig: readonly number[],
  behavior: Behavior | null,
  opts: { rings?: number; taken?: Iterable<string> } = {},
): NameParts {
  const t = shapeTraits(sig);
  const h = hashString(signatureKey(sig) + '|' + (behavior ?? 'none') + '|' + (opts.rings ?? 1));
  const taken = new Set<string>([...CATALOG.map((e) => e.name.toLowerCase())]);
  for (const n of opts.taken ?? []) taken.add(n.toLowerCase());
  const symPrefix = t.symmetry === 3 ? 'tri' : t.symmetry === 4 ? 'tetra' : t.symmetry === 5 ? 'penta' : t.symmetry === 6 ? 'hexa' : '';
  const sizePrefix = t.size === 'small' ? 'parv' : t.size === 'large' ? 'magn' : '';
  const ringPrefix = (opts.rings ?? 1) >= 3 ? 'hydro' : (opts.rings ?? 1) === 2 ? 'bi' : '';
  const roots = ROOTS[t.body];
  const eps = EPITHETS[behavior ?? 'none'];
  let fallback: NameParts | null = null;
  // One prefix at most (symmetry, else kernel rings, else size) keeps names short and sayable.
  const prefix = symPrefix || ringPrefix || sizePrefix;
  // Walk variants deterministically: root, suffix, epithet, then an extra prefix.
  for (let k = 0; k < 64; k++) {
    const r = roots[(h + k) % roots.length];
    const suf = SUFFIXES[((h >>> 4) + Math.floor(k / roots.length)) % SUFFIXES.length];
    const ep = eps[((h >>> 9) + Math.floor(k / (roots.length * 2))) % eps.length];
    const extra = k >= 32 ? ['lum', 'cryo', 'noct', 'astr'][(h >>> 13) % 4] : '';
    const genus = cap(stemJoin(join(join(extra, prefix), r), suf));
    if (NOT_LATIN.has(genus.toLowerCase())) continue;
    const parts = { genus, epithet: ep };
    fallback ??= parts;
    if (!taken.has(`${genus} ${ep}`.toLowerCase())) return parts;
  }
  return fallback!;
}

/** "Genus epithet". */
export function formatLatin(n: NameParts): string {
  return `${n.genus} ${n.epithet}`;
}

// ───────────────────────────── common names ─────────────────────────────

interface Noun {
  es: string;
  /** Grammatical gender of the Spanish noun (adjective agreement). */
  g: 'm' | 'f';
  en: string;
}

/** What the body looks like → noun. */
const SHAPE_NOUNS: Record<ShapeKind, Noun> = {
  pair: { es: 'Pareja', g: 'f', en: 'pair' },
  ring: { es: 'Anillo', g: 'm', en: 'ring' },
  trefoil: { es: 'Trébol', g: 'm', en: 'clover' },
  lobes: { es: 'Flor', g: 'f', en: 'flower' },
  // A child knows a leaf, not a spindle (CLARIDAD J-151).
  spindle: { es: 'Hoja', g: 'f', en: 'leaf' },
  tailed: { es: 'Cometa', g: 'm', en: 'comet' },
  shield: { es: 'Escudo', g: 'm', en: 'shield' },
  crescent: { es: 'Media luna', g: 'f', en: 'crescent' },
  cloud: { es: 'Nube', g: 'f', en: 'cloud' },
  disc: { es: 'Disco', g: 'm', en: 'disc' },
};

/** Plain bodies (a disc, a comet, a cloud) are named by what they do instead. */
const BEHAVIOR_NOUNS: Partial<Record<Behavior, Noun>> = {
  swimmer: { es: 'Nadadora', g: 'f', en: 'swimmer' },
  spinner: { es: 'Remolino', g: 'm', en: 'whirl' },
  pulsing: { es: 'Medusa', g: 'f', en: 'jelly' },
};
const PLAIN_SHAPES: ReadonlySet<ShapeKind> = new Set<ShapeKind>(['tailed', 'disc', 'cloud']);

/** Behaviour adjectives (m / f / en), used only to tell apart two names that would collide. */
const BEHAVIOR_ADJ: Record<Behavior, { m: string; f: string; en: string }> = {
  swimmer: { m: 'nadador', f: 'nadadora', en: 'swimming' },
  spinner: { m: 'giratorio', f: 'giratoria', en: 'spinning' },
  pulsing: { m: 'latiente', f: 'latiente', en: 'pulsing' },
  divider: { m: 'divisor', f: 'divisora', en: 'dividing' },
  colony: { m: 'colonial', f: 'colonial', en: 'colonial' },
  still: { m: 'quieto', f: 'quieta', en: 'still' },
};

/** Plain numbers to tell twins apart ("Nadadora celeste 2"), never Roman numerals (CLARIDAD J-153). */
const TWIN_NUMBERS = ['2', '3', '4', '5', '6', '7', '8', '9', '10'];
const capFirst = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The noun of a species' common name. */
export function nameNoun(kind: ShapeKind, behavior: Behavior | null): Noun {
  return (PLAIN_SHAPES.has(kind) && behavior && BEHAVIOR_NOUNS[behavior]) || SHAPE_NOUNS[kind];
}

/**
 * Common name of a species in Spanish and English, e.g. "Nadadora celeste" / "Sky swimmer",
 * "Pareja dorada" / "Golden pair", "Media luna violeta" / "Violet crescent": the body (or what a plain
 * body does) plus its colour family, so the name says what the player sees. Unique in the bestiary:
 * a collision adds the behaviour ("Trébol giratorio rosado"), then a numeral. `taken` = Spanish and
 * English names already used (case-insensitive).
 */
export function commonName(kind: ShapeKind, behavior: Behavior | null, hue: number, taken: Iterable<string> = []): Text {
  const used = new Set<string>();
  for (const n of taken) used.add(n.toLowerCase());
  // A body noun already in the bestiary ("Media luna violeta") makes the next one be named by what
  // it does instead ("Remolino dorado"), so names differ in more than the colour.
  const nounUsed = (n: Noun) => [...used].some((u) => u.startsWith(n.es.toLowerCase() + ' '));
  let noun = nameNoun(kind, behavior);
  const alt = behavior ? BEHAVIOR_NOUNS[behavior] : undefined;
  if (alt && alt !== noun && nounUsed(noun) && !nounUsed(alt)) noun = alt;
  const col = colorFamily(hue);
  const c = noun.g === 'f' ? col.f : col.m;
  const adj = behavior ? BEHAVIOR_ADJ[behavior] : null;
  const a = adj ? (noun.g === 'f' ? adj.f : adj.m) : null;
  const options: Text[] = [{ es: `${noun.es} ${c}`, en: capFirst(`${col.en} ${noun.en}`) }];
  if (a && adj && !(noun === BEHAVIOR_NOUNS[behavior!])) {
    // "latiente" is not a word a child knows: "Trébol rosado que late" (CLARIDAD J-152).
    const es = behavior === 'pulsing' ? `${noun.es} ${c} que late` : `${noun.es} ${a} ${c}`;
    options.push({ es, en: capFirst(`${col.en} ${adj.en} ${noun.en}`) });
  }
  for (const o of options) if (!used.has(o.es.toLowerCase()) && !used.has(o.en.toLowerCase())) return o;
  const base = options[options.length - 1];
  for (const r of TWIN_NUMBERS) {
    const o = { es: `${base.es} ${r}`, en: `${base.en} ${r}` };
    if (!used.has(o.es.toLowerCase()) && !used.has(o.en.toLowerCase())) return o;
  }
  return base;
}
