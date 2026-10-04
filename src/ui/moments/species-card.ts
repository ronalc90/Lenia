/**
 * Species card and species comparison ("¿Por qué esta rinde más?").
 *
 * Owner: "I see the same specimens with the same colour… explain WHY they are
 * different; the difference, the improvement and the behaviour must be clear."
 *
 *   ┌ portrait in the species' own hue │ Orbium unicaudatus · Espécimen 1
 *   │                                  │ [disco con cola] [➤ nadadora]
 *   │ looping behaviour diagram (real Lenia, the same one the Momentos use)
 *   │ [forma ×1,2] [nadadora ×1,6] [común ×1,1] = +1,9/s
 *   └ Cómo mejorarla: Afinidad nadadora (+8 % por nivel) [Ver] · Catalogación [Ver]
 *
 * "vs" mode puts two cards side by side and says in one sentence which factor
 * makes the difference ("Orbium nada (×1,6) y Scutium se queda quieta (×1,0).").
 *
 * Pure parts (speciesInputFromView, speciesBreakdown, compareSpecies,
 * shapeLabel, boostersFor) have no DOM and are tested.
 */
import { BEHAVIOR_COLOR } from '../../core/palette';
import type { Behavior, GameView, Lang, Pattern, Rarity, Text, UpgradeView } from '../../core/types';
import { AFFINITY_BONUS, BEHAVIOR_MULT, UNCLASSIFIED_MULT } from '../../game/balance';
import { AFFINITY_TREE_BONUS } from '../../game/cycleBalance';
import { fmtFixed, fmtRate } from '../format';
import { AFFINITY_OF, LEGACY_AFFINITY } from '../../moments/behaviors';
import { moIcon } from './icons';
import { Illustration } from './illustrations';
import { MS, tr } from './strings';
import { measureLook } from '../../species/look';
import { compareLooks, type LookDiff } from '../../species/looks';

// ───────────────────────────── data ─────────────────────────────

export interface Booster {
  id: string;
  name: Text;
  /** What it does for this species, kid-simple. */
  why: Text;
  level: number;
  unlocked: boolean;
  maxed: boolean;
}

export interface SpeciesCardInput {
  id: string;
  /** Its one name everywhere (the Bestiary's common name, or the player's). */
  name: string;
  catalogName: string | null;
  /** Small italic Latin line (SpeciesView.scientificName; the catalog name when absent). */
  scientificName?: string | null;
  /** What its body looks like in plain words (SpeciesView.shapeLabel), when the game says it. */
  shape?: Text;
  subtitle?: string;
  /** Accent hue in degrees (SpeciesView.hue); undefined → the game's cyan. */
  hue?: number;
  rarity: Rarity;
  behavior: Behavior | null;
  portrait: Pattern | null;
  /** Species multiplier m_esp (rarity × Catalogación). */
  speciesMult: number;
  /** Behaviour multiplier m_comp × affinity. */
  behaviorMult: number;
  /** Shape factor (measured complexity, Orbium ≈ 1) of its best living creature; null = none alive now. */
  form: number | null;
  /** Global multiplier (Genoma, mejoras) × buffs. */
  global: number;
  /** Essence per second of its best living creature; null = none alive now. */
  eps: number | null;
  boosters: Booster[];
  /** Canonical catalog code of its look (SpeciesView.lookCode): the comparison names what you SEE. */
  lookCode?: string;
  /** 2–3 visual feature chips (SpeciesView.chips), size first. */
  chips?: { id: string; label: Text }[];
  /** "variante: pareja"… (SpeciesView.variantNotes). */
  variantNotes?: Text[];
  /** Marks drawn on the portrait (set by the comparison): where the differing feature is. */
  marks?: LookMark[];
}

/** A mark on a portrait: normalised position (0..1 of the portrait picture) and what it points at. */
export interface LookMark {
  x: number;
  y: number;
  text: Text;
}

/**
 * Where each difference sits on a portrait (pure): the hole, the tip of a long body or legs, or the
 * centre, measured on the portrait itself (species/look measureLook), so a mark only lands on matter
 * or holes the creature really has. `side` = which card this portrait belongs to.
 */
export function lookMarks(p: Pattern | null, diffs: readonly LookDiff[], side: 'a' | 'b'): LookMark[] {
  if (!p) return [];
  const mine = diffs.filter((d) => d.side === side || d.side === 'both');
  if (!mine.length) return [];
  // R only sets the smallest hole/body counted: a portrait spans ~4–5 R.
  const look = measureLook(p, Math.max(p.w, p.h) / 5);
  return mine.map((d) => {
    const at = d.anchor === 'holes' ? (look.anchors.holes[0] ?? look.anchors.centre) : d.anchor === 'tip' ? look.anchors.tip : look.anchors.centre;
    return { x: at[0], y: at[1], text: d.text };
  });
}

/** The affinity upgrade of a behaviour in this view: the research-tree node, else the classic Lab's. */
function affinityUpgrade(b: Behavior | null, upgrades: readonly UpgradeView[]): UpgradeView | undefined {
  const id = AFFINITY_OF[b ?? 'none'];
  return upgrades.find((x) => x.id === id) ?? upgrades.find((x) => x.id === LEGACY_AFFINITY[id]);
}

/**
 * Upgrades that make this species earn more (present in the view). `bonus` = the affinity step per
 * level (classic Lab AFFINITY_BONUS; the research tree's AFFINITY_TREE_BONUS in sessions).
 */
export function boostersFor(behavior: Behavior | null, upgrades: readonly UpgradeView[], bonus = AFFINITY_BONUS): Booster[] {
  const pct = Math.round(bonus * 100);
  const aff = affinityUpgrade(behavior, upgrades);
  const want: { id: string; why: Text }[] = [
    {
      id: aff?.id ?? AFFINITY_OF[behavior ?? 'none'],
      why: {
        es: `+${pct} % por nivel para ${behaviorName(behavior, 'es', true)}`,
        en: `+${pct}% per level for ${behaviorName(behavior, 'en', true)}`,
      },
    },
    { id: 'cataloguing', why: { es: 'Sube a todas las especies descubiertas', en: 'Raises every species you found' } },
    { id: 'nutrient', why: { es: 'Criaturas con más forma dan más Esencia.', en: 'Creatures with more shape give more Essence.' } },
  ];
  const out: Booster[] = [];
  for (const w of want) {
    const u = upgrades.find((x) => x.id === w.id);
    if (!u) continue;
    out.push({ id: u.id, name: u.name, why: w.why, level: u.level, unlocked: u.unlocked, maxed: u.maxed });
  }
  return out;
}

/** m_comp × affinity, as the game computes it (src/game/game.ts behaviorMult). */
export function behaviorMultFor(b: Behavior | null, upgrades: readonly UpgradeView[], bonus = AFFINITY_BONUS): number {
  const base = b ? BEHAVIOR_MULT[b] : UNCLASSIFIED_MULT;
  const lvl = affinityUpgrade(b, upgrades)?.level ?? 0;
  return base * (1 + bonus * lvl);
}

/** Build the card input from the game view (best living creature of the species, if any). */
export function speciesInputFromView(v: GameView, speciesId: string): SpeciesCardInput | null {
  const sp = v.species.find((s) => s.id === speciesId);
  if (!sp) return null;
  const mine = v.creatures.filter((c) => c.speciesId === speciesId && c.state === 'stable');
  const best = mine.reduce<(typeof mine)[number] | null>((a, c) => (!a || c.eps > a.eps ? c : a), null);
  const behavior = best?.behavior ?? sp.behavior;
  // Sessions mode: the research tree's affinity step; the game's own figure when it sends one.
  const bonus = (v as { cycle?: string }).cycle === 'sessions' ? AFFINITY_TREE_BONUS : AFFINITY_BONUS;
  const bm = sp.production?.behaviorMult ?? behaviorMultFor(behavior, v.upgrades, bonus);
  const global = (v.multipliers?.global ?? 1) * (v.multipliers?.buffs ?? 1);
  const eps = best && best.eps > 0 ? best.eps : null;
  const form = eps !== null ? eps / Math.max(1e-9, bm * sp.mult * global) : null;
  return {
    id: sp.id,
    name: sp.name,
    catalogName: sp.catalogName,
    scientificName: sp.scientificName,
    shape: sp.shapeLabel,
    subtitle: sp.subtitle,
    hue: sp.hue ?? best?.hue,
    rarity: sp.rarity,
    behavior,
    portrait: sp.portrait,
    speciesMult: sp.mult,
    behaviorMult: bm,
    form,
    global,
    eps,
    boosters: boostersFor(behavior, v.upgrades, bonus),
    ...(sp.lookCode ? { lookCode: sp.lookCode } : {}),
    ...(sp.chips ? { chips: sp.chips } : {}),
    ...(sp.variantNotes?.length ? { variantNotes: sp.variantNotes } : {}),
  };
}

// ───────────────────────────── words ─────────────────────────────

/** One word per way of moving (docs/CLARIDAD.md J-147): [singular, "for the …" plural]. */
const BEHAVIOR_NAME: Record<Behavior | 'none', [Text, Text]> = {
  still: [{ es: 'quieta', en: 'still' }, { es: 'las quietas', en: 'still ones' }],
  pulsing: [{ es: 'late', en: 'pulses' }, { es: 'las que laten', en: 'the ones that pulse' }],
  swimmer: [{ es: 'nadadora', en: 'swimmer' }, { es: 'las nadadoras', en: 'swimmers' }],
  spinner: [{ es: 'gira', en: 'spins' }, { es: 'las que giran', en: 'the ones that spin' }],
  divider: [{ es: 'se divide', en: 'splits' }, { es: 'las que se dividen', en: 'the ones that split' }],
  colony: [{ es: 'colonia', en: 'colony' }, { es: 'las colonias', en: 'colonies' }],
  none: [{ es: 'aún no sabemos cómo se mueve', en: 'not sure how it moves yet' }, { es: 'las quietas', en: 'still ones' }],
};

const BEHAVIOR_VERB: Record<Behavior | 'none', Text> = {
  still: { es: 'se queda quieta', en: 'stays still' },
  pulsing: { es: 'late', en: 'pulses' },
  swimmer: { es: 'nada', en: 'swims' },
  spinner: { es: 'gira', en: 'spins' },
  divider: { es: 'se divide', en: 'splits' },
  colony: { es: 'vive en colonia', en: 'lives in a colony' },
  none: { es: 'todavía no se sabe cómo se mueve', en: 'has not shown how it moves yet' },
};

const RARITY_NAME: Record<Rarity, Text> = {
  common: { es: 'común', en: 'common' },
  uncommon: { es: 'poco común', en: 'uncommon' },
  rare: { es: 'rara', en: 'rare' },
  veryRare: { es: 'muy rara', en: 'very rare' },
};

export function behaviorName(b: Behavior | null, lang: Lang, plural = false): string {
  return BEHAVIOR_NAME[b ?? 'none'][plural ? 1 : 0][lang];
}

/** Body shapes by catalog genus (Chan's names describe the shape). */
const GENUS_SHAPE: [RegExp, Text][] = [
  [/^Gyrorbium/i, { es: 'disco que gira', en: 'turning disc' }],
  [/^(Synorbium|Parorbium)/i, { es: 'disco doble', en: 'double disc' }],
  [/^Orbium/i, { es: 'disco con cola', en: 'disc with a tail' }],
  [/^Pentahelicium/i, { es: 'estrella de 5 brazos', en: '5-armed star' }],
  [/^Helicium/i, { es: 'molinillo', en: 'pinwheel' }],
  [/^(Gyropteron|Synptera|Paraptera)/i, { es: 'con alas', en: 'winged' }],
  [/^Catenoscutium/i, { es: 'cadena de escudos', en: 'chain of shields' }],
  [/^Triscutium/i, { es: 'triple escudo', en: 'triple shield' }],
  [/^(Scutium|Discutium|Pyroscutium)/i, { es: 'escudo', en: 'shield' }],
  [/^Circium/i, { es: 'anillo', en: 'ring' }],
  [/^Hydrogeminium/i, { es: 'gemelas', en: 'twins' }],
  [/^Kronium/i, { es: 'corona', en: 'crown' }],
];

/** "disco con cola", "anillo"…: the game's word when it sends one, else the catalog genus, else the portrait. */
export function shapeLabel(sp: { catalogName: string | null; portrait: Pattern | null; shape?: Text }, lang: Lang): string {
  if (sp.shape) return sp.shape[lang];
  if (sp.catalogName) for (const [re, t] of GENUS_SHAPE) if (re.test(sp.catalogName)) return t[lang];
  const p = sp.portrait;
  if (p) {
    // Moments of the matter: centre emptiness (ring) and elongation.
    let m = 0;
    let sx = 0;
    let sy = 0;
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) {
        const a = p.data[y * p.w + x];
        m += a;
        sx += a * x;
        sy += a * y;
      }
    if (m > 0) {
      const cx = sx / m;
      const cy = sy / m;
      let xx = 0;
      let yy = 0;
      let xy = 0;
      for (let y = 0; y < p.h; y++)
        for (let x = 0; x < p.w; x++) {
          const a = p.data[y * p.w + x];
          xx += a * (x - cx) ** 2;
          yy += a * (y - cy) ** 2;
          xy += a * (x - cx) * (y - cy);
        }
      const tr2 = (xx + yy) / m;
      const det = (xx * yy - xy * xy) / (m * m);
      const disc = Math.sqrt(Math.max(0, (tr2 * tr2) / 4 - det));
      const l1 = tr2 / 2 + disc;
      const l2 = Math.max(1e-9, tr2 / 2 - disc);
      const centre = p.data[Math.round(cy) * p.w + Math.round(cx)] ?? 0;
      const peak = Math.max(...p.data);
      if (centre < peak * 0.25) return lang === 'es' ? 'anillo' : 'ring';
      if (l1 / l2 > 2.2) return lang === 'es' ? 'alargada' : 'long';
      return lang === 'es' ? 'redonda' : 'round';
    }
  }
  return lang === 'es' ? 'forma nueva' : 'new shape';
}

export interface BreakdownTerm {
  kind: 'form' | 'behavior' | 'rarity' | 'global';
  mult: number;
  /** "×1,6". */
  value: string;
  /** "nadadora", "común", "forma", "mejoras". */
  label: string;
}

/** The yield as a visual equation: forma × comportamiento × rareza (× mejoras) = +N/s. */
export function speciesBreakdown(s: SpeciesCardInput, lang: Lang): { terms: BreakdownTerm[]; total: string; perSec: boolean } {
  const x = (m: number) => `×${fmtFixed(m, 2, lang).replace(/[.,]?0+$/, '')}`;
  const terms: BreakdownTerm[] = [];
  if (s.form !== null) terms.push({ kind: 'form', mult: s.form, value: x(s.form), label: lang === 'es' ? 'forma' : 'shape' });
  terms.push({ kind: 'behavior', mult: s.behaviorMult, value: x(s.behaviorMult), label: behaviorName(s.behavior, lang) });
  terms.push({ kind: 'rarity', mult: s.speciesMult, value: x(s.speciesMult), label: RARITY_NAME[s.rarity][lang] });
  if (Math.abs(s.global - 1) > 0.005) terms.push({ kind: 'global', mult: s.global, value: x(s.global), label: lang === 'es' ? 'mejoras' : 'upgrades' });
  if (s.eps !== null) return { terms, total: `+${fmtRate(s.eps, lang)}/s`, perSec: true };
  const prod = terms.reduce((p, t) => p * t.mult, 1);
  return { terms, total: x(prod), perSec: false };
}

/**
 * Which one earns more, and in one sentence why they are different. Two Bestiary species with look
 * data are compared by what you SEE (a hole, a bright centre, legs, the size: species/looks
 * compareLooks; docs/ESPECIES.md) — never "they are very alike" — with the yield factor as `detail`.
 */
export function compareSpecies(
  a: SpeciesCardInput,
  b: SpeciesCardInput,
  lang: Lang,
): { winner: 'a' | 'b' | 'tie'; reason: string; detail?: string; diffs?: LookDiff[] } {
  const y = compareYield(a, b, lang);
  if (a.lookCode && b.lookCode && a.lookCode !== b.lookCode) {
    const diffs = compareLooks(a.lookCode, b.lookCode).filter((d) => d.kind !== 'colour').slice(0, 2);
    if (diffs.length) {
      const words = diffs.map((d) => d.text[lang]).join(lang === 'es' ? ' y ' : ' and ');
      const vs = lang === 'es' ? `frente a ${b.name}` : `next to ${b.name}`;
      return { winner: y.winner, reason: `${a.name}, ${vs}: ${words}.`, detail: y.winner === 'tie' ? undefined : y.reason, diffs };
    }
  }
  return y;
}

/** Which one earns more, and the one factor that explains most of it, in one sentence. */
function compareYield(a: SpeciesCardInput, b: SpeciesCardInput, lang: Lang): { winner: 'a' | 'b' | 'tie'; reason: string } {
  const val = (s: SpeciesCardInput) => s.eps ?? (s.form ?? 1) * s.behaviorMult * s.speciesMult * s.global;
  const va = val(a);
  const vb = val(b);
  const winner = Math.abs(va - vb) / Math.max(1e-9, Math.max(va, vb)) < 0.03 ? 'tie' : va > vb ? 'a' : 'b';
  // One name per species everywhere: the common one (docs/CLARIDAD.md J-148).
  const na = a.name;
  const nb = b.name;
  const x = (m: number) => `×${fmtFixed(m, 2, lang).replace(/[.,]?0+$/, '')}`;
  const factors = [
    { kind: 'behavior', ra: a.behaviorMult, rb: b.behaviorMult },
    { kind: 'rarity', ra: a.speciesMult, rb: b.speciesMult },
    { kind: 'form', ra: a.form ?? 1, rb: b.form ?? 1 },
  ].sort((p, q) => Math.abs(Math.log(q.ra / q.rb)) - Math.abs(Math.log(p.ra / p.rb)));
  const f = factors[0];
  if (winner === 'tie' || Math.abs(Math.log(f.ra / f.rb)) < 0.02) {
    return { winner: 'tie', reason: lang === 'es' ? 'Rinden casi lo mismo: se parecen mucho.' : 'They earn about the same: they are very alike.' };
  }
  if (f.kind === 'behavior') {
    return {
      winner,
      reason:
        lang === 'es'
          ? `${na} ${BEHAVIOR_VERB[a.behavior ?? 'none'].es} (${x(a.behaviorMult)}) y ${nb} ${BEHAVIOR_VERB[b.behavior ?? 'none'].es} (${x(b.behaviorMult)}).`
          : `${na} ${BEHAVIOR_VERB[a.behavior ?? 'none'].en} (${x(a.behaviorMult)}) and ${nb} ${BEHAVIOR_VERB[b.behavior ?? 'none'].en} (${x(b.behaviorMult)}).`,
    };
  }
  const [hi, lo, rh, rl] = f.ra > f.rb ? [na, nb, f.ra, f.rb] : [nb, na, f.rb, f.ra];
  if (f.kind === 'rarity') {
    return {
      winner,
      reason: lang === 'es' ? `${hi} es más rara (${x(rh)}) que ${lo} (${x(rl)}).` : `${hi} is rarer (${x(rh)}) than ${lo} (${x(rl)}).`,
    };
  }
  return {
    winner,
    reason:
      lang === 'es'
        ? `${hi} tiene más forma: más borde, más Esencia (${x(rh)} frente a ${x(rl)}).`
        : `${hi} has more shape: more edge, more Essence (${x(rh)} vs ${x(rl)}).`,
  };
}

// ───────────────────────────── DOM ─────────────────────────────

/** Species accent colour (CSS) from its hue; the game's cyan when the hue is unknown. */
export function hueColor(hue: number | undefined, light = 62): string {
  return hue === undefined ? '#5BC0EB' : `hsl(${Math.round(hue)} 72% ${light}%)`;
}

/** Paint a bestiary portrait in the species' own hue (bright core, coloured body, dark rim). */
export function paintPortrait(canvas: HTMLCanvasElement, p: Pattern | null, hue: number | undefined): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!p) return;
  const src = document.createElement('canvas');
  src.width = p.w;
  src.height = p.h;
  const sctx = src.getContext('2d');
  if (!sctx) return;
  const img = sctx.createImageData(p.w, p.h);
  const h = hue ?? 196;
  for (let i = 0; i < p.w * p.h; i++) {
    const a = Math.min(1, Math.max(0, p.data[i]));
    // hsl → rgb with lightness rising with matter (white-hot core).
    const l = 0.18 + 0.72 * a;
    const sat = 0.75 * (1 - Math.max(0, a - 0.7) * 2);
    const c = (1 - Math.abs(2 * l - 1)) * sat;
    const hp = (h % 360) / 60;
    const xx = c * (1 - Math.abs((hp % 2) - 1));
    const [r1, g1, b1] = hp < 1 ? [c, xx, 0] : hp < 2 ? [xx, c, 0] : hp < 3 ? [0, c, xx] : hp < 4 ? [0, xx, c] : hp < 5 ? [xx, 0, c] : [c, 0, xx];
    const m = l - c / 2;
    img.data[i * 4] = Math.round((r1 + m) * 255);
    img.data[i * 4 + 1] = Math.round((g1 + m) * 255);
    img.data[i * 4 + 2] = Math.round((b1 + m) * 255);
    img.data[i * 4 + 3] = Math.round(Math.min(1, a * 2.2) * 255);
  }
  sctx.putImageData(img, 0, 0);
  const s = (Math.min(W, H) * 0.86) / Math.max(p.w, p.h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.shadowColor = hueColor(hue, 60);
  ctx.shadowBlur = W * 0.08;
  ctx.drawImage(src, (W - p.w * s) / 2, (H - p.h * s) / 2, p.w * s, p.h * s);
}

const MOTION_CHIPS: ReadonlySet<string> = new Set(['spins', 'still', 'swims']);

/** CSS position of a mark on the round portrait (paintPortrait fits the picture to 86 % of the box). */
function markStyle(p: Pattern | null, m: LookMark): string {
  const side = p ? Math.max(p.w, p.h) : 1;
  const fx = p ? p.w / side : 1;
  const fy = p ? p.h / side : 1;
  const x = 50 + (m.x - 0.5) * fx * 86;
  const y = 50 + (m.y - 0.5) * fy * 86;
  return `left:${x.toFixed(1)}%;top:${y.toFixed(1)}%`;
}

export interface SpeciesCardOpts {
  lang(): Lang;
  reduceMotion?(): boolean;
  /** "Ver" on a booster: open the Lab / Bestiary on that upgrade. Hidden when not given. */
  onShowUpgrade?(upgradeId: string): void;
  /** Smaller layout (comparison columns, the Momento card). */
  compact?: boolean;
  /** Tap on the behaviour tag: open the Behaviour Guide at it. */
  onBehavior?(b: Behavior): void;
}

export interface SpeciesCard {
  readonly el: HTMLElement;
  update(input: SpeciesCardInput): void;
  dispose(): void;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}

/** A running mini behaviour diagram per card (one rAF for all of them). */
const minis = new Set<{ illus: Illustration; alive: () => boolean }>();
let miniRaf = 0;
function tickMinis(): void {
  miniRaf = 0;
  const t = performance.now() / 1000;
  for (const m of [...minis]) {
    if (!m.alive()) {
      minis.delete(m);
      continue;
    }
    m.illus.frame(t);
  }
  if (minis.size) miniRaf = requestAnimationFrame(tickMinis);
}

export function createSpeciesCard(container: HTMLElement, input: SpeciesCardInput, opts: SpeciesCardOpts): SpeciesCard {
  const el = document.createElement('article');
  el.className = 'mo-spc' + (opts.compact ? ' compact' : '');
  container.appendChild(el);
  let disposed = false;
  let mini: { illus: Illustration; alive: () => boolean } | null = null;
  /** What the card's structure depends on: an update that changes only the numbers patches them in place. */
  let shapeKey = '';
  let lastPortrait: unknown = null;

  /** The yield equation's numbers changed, nothing else: rewrite those text nodes only (no HTML rebuild). */
  function patchNumbers(s: SpeciesCardInput, L: Lang): boolean {
    const b = speciesBreakdown(s, L);
    const terms = el.querySelectorAll<HTMLElement>('.mo-spc-eq .mo-spc-t:not(.total)');
    if (terms.length !== b.terms.length) return false;
    b.terms.forEach((t, i) => {
      const v = terms[i].querySelector('b');
      if (v && v.textContent !== t.value) v.textContent = t.value;
      const lbl = terms[i].querySelector('small');
      if (lbl && lbl.textContent !== t.label) lbl.textContent = t.label;
    });
    const total = el.querySelector('.mo-spc-eq .total b');
    if (total && total.textContent !== b.total) total.textContent = b.total;
    return true;
  }

  function render(s: SpeciesCardInput): void {
    const L = opts.lang();
    const key = [L, s.name, s.catalogName, s.scientificName, s.subtitle, s.hue, s.behavior, s.shape?.es, (s.chips ?? []).map((c) => c.id).join(','), (s.marks ?? []).map((m) => m.text.es).join(','), (s.variantNotes ?? []).map((n) => n.es).join(','), s.boosters.map((x) => `${x.id}:${x.level}:${x.unlocked}:${x.maxed}`).join(',')].join('|');
    if (key === shapeKey && s.portrait === lastPortrait && patchNumbers(s, L)) return;
    shapeKey = key;
    lastPortrait = s.portrait;
    const col = hueColor(s.hue);
    el.style.setProperty('--sp-c', col);
    const b = speciesBreakdown(s, L);
    const bcol = BEHAVIOR_COLOR[s.behavior ?? 'still'] ?? col;
    const boosters = s.boosters.filter((x) => x.unlocked && !x.maxed);
    // Its one name is the title; the Latin goes small underneath (when it says something new).
    const latin = s.scientificName === undefined ? s.catalogName : s.scientificName;
    const sci = latin && latin !== s.name ? latin : '';
    el.innerHTML = `
      <header class="mo-spc-h">
        <span class="mo-spc-pt"><canvas width="128" height="128"></canvas>${(s.marks ?? [])
          .map((m, i) => `<span class="mo-spc-mark" style="${markStyle(s.portrait, m)}" aria-hidden="true" data-i="${i + 1}"></span>`)
          .join('')}</span>
        <div class="mo-spc-n">
          <b>${esc(s.name)}</b>
          ${sci ? `<small class="latin">${esc(sci)}</small>` : s.subtitle ? `<small>${esc(s.subtitle)}</small>` : ''}
          <span class="mo-spc-tags">
            ${
              s.chips?.length
                ? s.chips
                    .filter((c) => !MOTION_CHIPS.has(c.id)) // the behaviour tag next to them says how it moves
                    .map((c) => `<span class="mo-spc-tag chip">${esc(c.label[L])}</span>`)
                    .join('')
                : `<span class="mo-spc-tag">${moIcon('drop', 14)}${esc(shapeLabel(s, L))}</span>`
            }
            ${
              opts.onBehavior && s.behavior
                ? `<button type="button" class="mo-spc-tag beh" data-beh="${s.behavior}" style="--b-c:${bcol}" aria-label="${esc(tr(MS.bhOpen, L))}: ${esc(behaviorName(s.behavior, L))}">${moIcon(s.behavior, 14)}${esc(behaviorName(s.behavior, L))} ${moIcon('info', 12)}</button>`
                : `<span class="mo-spc-tag beh" style="--b-c:${bcol}">${moIcon(s.behavior ?? 'still', 14)}${esc(behaviorName(s.behavior, L))}</span>`
            }
          </span>
          ${s.marks?.some((m) => m.text[L]) ? `<span class="mo-spc-diff">${s.marks.filter((m) => m.text[L]).map((m) => `<span>➜ ${esc(m.text[L])}</span>`).join('')}</span>` : ''}
          ${s.variantNotes?.length ? `<small class="mo-spc-var">${esc(s.variantNotes.map((n) => n[L]).join(' · '))}</small>` : ''}
        </div>
      </header>
      <div class="mo-spc-anim" aria-hidden="true"><canvas></canvas></div>
      <div class="mo-spc-eq" role="group" aria-label="${L === 'es' ? 'Cuánto rinde' : 'What it earns'}">
        ${b.terms
          .map(
            (t) =>
              `<span class="mo-spc-t k-${t.kind}"><b>${t.value}</b><small>${esc(t.label)}</small></span>`,
          )
          .join('<i aria-hidden="true">·</i>')}
        <i aria-hidden="true">=</i><span class="mo-spc-t total"><b>${b.total}</b><small>${
          b.perSec ? (L === 'es' ? 'Esencia' : 'Essence') : L === 'es' ? 'si estuviera viva' : 'if alive'
        }</small></span>
      </div>
      ${
        boosters.length
          ? `<div class="mo-spc-up"><span class="mo-spc-up-l">${moIcon('up', 14)}${L === 'es' ? 'Cómo mejorarla' : 'How to boost it'}</span>
        ${boosters
          .map(
            (u) => `<div class="mo-spc-u"><span><b>${esc(u.name[L])}${u.level ? ` ${u.level}` : ''}</b><small>${esc(u.why[L])}</small></span>${
              opts.onShowUpgrade ? `<button type="button" class="mo-spc-go" data-up="${u.id}">${tr(MS.see, L)}</button>` : ''
            }</div>`,
          )
          .join('')}</div>`
          : ''
      }
    `;
    paintPortrait(el.querySelector('.mo-spc-pt canvas') as HTMLCanvasElement, s.portrait, s.hue);
    const cv = el.querySelector('.mo-spc-anim canvas') as HTMLCanvasElement;
    if (mini) minis.delete(mini);
    const illus = new Illustration(cv, s.behavior ?? 'still', { lang: L, data: { behavior: s.behavior ?? undefined }, time: 0, rm: opts.reduceMotion?.() ?? false, mini: true });
    mini = { illus, alive: () => !disposed && el.isConnected };
    minis.add(mini);
    if (!miniRaf) miniRaf = requestAnimationFrame(tickMinis);
  }

  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const go = t.closest('.mo-spc-go') as HTMLElement | null;
    if (go?.dataset.up) opts.onShowUpgrade?.(go.dataset.up);
    const beh = t.closest('[data-beh]') as HTMLElement | null;
    if (beh?.dataset.beh) opts.onBehavior?.(beh.dataset.beh as Behavior);
  });

  render(input);
  return {
    el,
    update: render,
    dispose() {
      disposed = true;
      if (mini) minis.delete(mini);
      el.remove();
    },
  };
}

export interface SpeciesCompare {
  readonly el: HTMLElement;
  dispose(): void;
}

/** Two species side by side + the one-sentence reason ("¿Por qué esta rinde más?"). */
export function createSpeciesCompare(
  container: HTMLElement,
  a: SpeciesCardInput,
  b: SpeciesCardInput,
  opts: SpeciesCardOpts & { title?: boolean; dense?: boolean },
): SpeciesCompare {
  const L = opts.lang();
  const el = document.createElement('section');
  el.className = 'mo-cmp' + (opts.dense ? ' dense' : '');
  const cmp = compareSpecies(a, b, L);
  const head = document.createElement('div');
  head.className = 'mo-cmp-h';
  head.innerHTML = `${opts.title === false ? '' : `<h3>${tr(MS.cmpTitle, L)}</h3>`}<p>${esc(cmp.reason)}</p>${cmp.detail ? `<p class="detail">${esc(cmp.detail)}</p>` : ''}`;
  const cols = document.createElement('div');
  cols.className = 'mo-cmp-cols';
  el.append(head, cols);
  container.appendChild(el);
  const cards = [a, b].map((s, i) => {
    const col = document.createElement('div');
    col.className = 'mo-cmp-col' + ((cmp.winner === 'a' && i === 0) || (cmp.winner === 'b' && i === 1) ? ' win' : '');
    if (col.classList.contains('win')) col.insertAdjacentHTML('afterbegin', `<span class="mo-cmp-win">${moIcon('up', 14)}${tr(MS.cmpMore, L)}</span>`);
    cols.appendChild(col);
    // Rings on both portraits; the words only on the new species' card (they describe it).
    const marks = (cmp.diffs ? lookMarks(s.portrait, cmp.diffs, i === 0 ? 'a' : 'b') : []).map((m) => (i === 0 ? m : { ...m, text: { es: '', en: '' } }));
    return createSpeciesCard(col, marks.length ? { ...s, marks } : s, { ...opts, compact: true });
  });
  const vs = document.createElement('span');
  vs.className = 'mo-cmp-vs';
  vs.textContent = 'vs';
  cols.insertBefore(vs, cols.children[1]);
  return {
    el,
    dispose() {
      for (const c of cards) c.dispose();
      el.remove();
    },
  };
}
