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
import { fmtFixed, fmtRate } from '../format';
import { moIcon } from './icons';
import { Illustration } from './illustrations';
import { MS, tr } from './strings';

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
  name: string;
  catalogName: string | null;
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
}

const AFFINITY_OF: Record<string, 'swimAffinity' | 'sessileAffinity' | 'colonyAffinity'> = {
  swimmer: 'swimAffinity',
  spinner: 'swimAffinity',
  divider: 'colonyAffinity',
  colony: 'colonyAffinity',
  still: 'sessileAffinity',
  pulsing: 'sessileAffinity',
  none: 'sessileAffinity',
};

/** Upgrades that make this species earn more (present in the view). */
export function boostersFor(behavior: Behavior | null, upgrades: readonly UpgradeView[]): Booster[] {
  const pct = Math.round(AFFINITY_BONUS * 100);
  const want: { id: string; why: Text }[] = [
    {
      id: AFFINITY_OF[behavior ?? 'none'],
      why: {
        es: `+${pct} % por nivel a las ${behaviorName(behavior, 'es', true)}`,
        en: `+${pct}% per level for ${behaviorName(behavior, 'en', true)}`,
      },
    },
    { id: 'cataloguing', why: { es: 'Sube a todas las especies registradas', en: 'Raises every registered species' } },
    { id: 'nutrient', why: { es: 'Más forma medida: más Esencia', en: 'More measured shape: more Essence' } },
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
export function behaviorMultFor(b: Behavior | null, upgrades: readonly UpgradeView[]): number {
  const base = b ? BEHAVIOR_MULT[b] : UNCLASSIFIED_MULT;
  const lvl = upgrades.find((u) => u.id === AFFINITY_OF[b ?? 'none'])?.level ?? 0;
  return base * (1 + AFFINITY_BONUS * lvl);
}

/** Build the card input from the game view (best living creature of the species, if any). */
export function speciesInputFromView(v: GameView, speciesId: string): SpeciesCardInput | null {
  const sp = v.species.find((s) => s.id === speciesId);
  if (!sp) return null;
  const mine = v.creatures.filter((c) => c.speciesId === speciesId && c.state === 'stable');
  const best = mine.reduce<(typeof mine)[number] | null>((a, c) => (!a || c.eps > a.eps ? c : a), null);
  const behavior = best?.behavior ?? sp.behavior;
  const bm = behaviorMultFor(behavior, v.upgrades);
  const global = (v.multipliers?.global ?? 1) * (v.multipliers?.buffs ?? 1);
  const eps = best && best.eps > 0 ? best.eps : null;
  const form = eps !== null ? eps / Math.max(1e-9, bm * sp.mult * global) : null;
  return {
    id: sp.id,
    name: sp.name,
    catalogName: sp.catalogName,
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
    boosters: boostersFor(behavior, v.upgrades),
  };
}

// ───────────────────────────── words ─────────────────────────────

const BEHAVIOR_NAME: Record<Behavior | 'none', [Text, Text]> = {
  // [singular, plural]
  still: [{ es: 'quieta', en: 'still' }, { es: 'quietas', en: 'still ones' }],
  pulsing: [{ es: 'late', en: 'pulsing' }, { es: 'que laten', en: 'pulsing ones' }],
  swimmer: [{ es: 'nadadora', en: 'swimmer' }, { es: 'nadadoras', en: 'swimmers' }],
  spinner: [{ es: 'giratoria', en: 'spinner' }, { es: 'giratorias', en: 'spinners' }],
  divider: [{ es: 'divisora', en: 'divider' }, { es: 'divisoras', en: 'dividers' }],
  colony: [{ es: 'colonia', en: 'colony' }, { es: 'colonias', en: 'colonies' }],
  none: [{ es: 'aún sin clasificar', en: 'not sorted yet' }, { es: 'quietas', en: 'still ones' }],
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
  [/^Helicium/i, { es: 'hélice', en: 'propeller' }],
  [/^(Gyropteron|Synptera|Paraptera)/i, { es: 'con alas', en: 'winged' }],
  [/^Catenoscutium/i, { es: 'cadena de escudos', en: 'chain of shields' }],
  [/^Triscutium/i, { es: 'triple escudo', en: 'triple shield' }],
  [/^(Scutium|Discutium|Pyroscutium)/i, { es: 'escudo', en: 'shield' }],
  [/^Circium/i, { es: 'anillo', en: 'ring' }],
  [/^Hydrogeminium/i, { es: 'gemelas', en: 'twins' }],
  [/^Kronium/i, { es: 'corona', en: 'crown' }],
];

/** "disco con cola", "anillo"…: from the catalog genus, else measured on the portrait. */
export function shapeLabel(sp: { catalogName: string | null; portrait: Pattern | null }, lang: Lang): string {
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

/** Which one earns more, and the one factor that explains most of it, in one sentence. */
export function compareSpecies(a: SpeciesCardInput, b: SpeciesCardInput, lang: Lang): { winner: 'a' | 'b' | 'tie'; reason: string } {
  const val = (s: SpeciesCardInput) => s.eps ?? (s.form ?? 1) * s.behaviorMult * s.speciesMult * s.global;
  const va = val(a);
  const vb = val(b);
  const winner = Math.abs(va - vb) / Math.max(1e-9, Math.max(va, vb)) < 0.03 ? 'tie' : va > vb ? 'a' : 'b';
  const na = a.catalogName ?? a.name;
  const nb = b.catalogName ?? b.name;
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

export interface SpeciesCardOpts {
  lang(): Lang;
  reduceMotion?(): boolean;
  /** "Ver" on a booster: open the Lab / Bestiary on that upgrade. Hidden when not given. */
  onShowUpgrade?(upgradeId: string): void;
  /** Smaller layout (comparison columns, the Momento card). */
  compact?: boolean;
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

  function render(s: SpeciesCardInput): void {
    const L = opts.lang();
    const col = hueColor(s.hue);
    el.style.setProperty('--sp-c', col);
    const b = speciesBreakdown(s, L);
    const bcol = BEHAVIOR_COLOR[s.behavior ?? 'still'] ?? col;
    const boosters = s.boosters.filter((x) => x.unlocked && !x.maxed);
    el.innerHTML = `
      <header class="mo-spc-h">
        <span class="mo-spc-pt"><canvas width="128" height="128"></canvas></span>
        <div class="mo-spc-n">
          <b class="${s.catalogName ? 'latin' : ''}">${esc(s.catalogName ?? s.name)}</b>
          ${s.subtitle || s.catalogName ? `<small>${esc(s.subtitle ?? s.name)}</small>` : ''}
          <span class="mo-spc-tags">
            <span class="mo-spc-tag">${moIcon('drop', 14)}${esc(shapeLabel(s, L))}</span>
            <span class="mo-spc-tag beh" style="--b-c:${bcol}">${moIcon(s.behavior ?? 'still', 14)}${esc(behaviorName(s.behavior, L))}</span>
          </span>
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
    const go = (e.target as HTMLElement).closest('.mo-spc-go') as HTMLElement | null;
    if (go?.dataset.up) opts.onShowUpgrade?.(go.dataset.up);
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
  head.innerHTML = `${opts.title === false ? '' : `<h3>${tr(MS.cmpTitle, L)}</h3>`}<p>${esc(cmp.reason)}</p>`;
  const cols = document.createElement('div');
  cols.className = 'mo-cmp-cols';
  el.append(head, cols);
  container.appendChild(el);
  const cards = [a, b].map((s, i) => {
    const col = document.createElement('div');
    col.className = 'mo-cmp-col' + ((cmp.winner === 'a' && i === 0) || (cmp.winner === 'b' && i === 1) ? ' win' : '');
    if (col.classList.contains('win')) col.insertAdjacentHTML('afterbegin', `<span class="mo-cmp-win">${moIcon('up', 14)}${tr(MS.cmpMore, L)}</span>`);
    cols.appendChild(col);
    return createSpeciesCard(col, s, { ...opts, compact: true });
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
