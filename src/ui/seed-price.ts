/**
 * The seed price, explained: ONE module (docs/CLARIDAD2.md §2.11; the old copy in src/ui/moments/seedprice.ts
 * is gone). Owner: "prices must never feel random".
 *
 *   seedPriceSheetExplain(view, lang, opts)  → the price card for the shared sheet (src/ui/moments/price)
 *   seedPriceChange(prev, next, lang)        → the label-maker chip that says what changed, or null
 *   createSeedMeter(lang)                    → the room in words + that chip, for the seed pill
 *
 * The colour rule (tokens MEANING): a cost is amber, with ↑ or the price ("4 luz", "×3 ↑ placa llena"); a gain is
 * green with ×, + or − ("−15 % ↓ Semillas baratas": a discount is a gain); a factor at ×1 is not shown.
 * Sessions loop: one price (base × «Semillas baratas»); living creatures NEVER raise it (the old
 * "+1 criatura viva → ×1,25" read as a prize and was the classic loop's surcharge); the limit is room. The
 * classic loop (PHASE-2B-REMOVE) folds its crowding into the price instead of naming the living as a cost.
 */
import type { GameView, Lang, SeedPriceView, Text } from '../core/types';
import { TEXT } from '../game/content';
import { NODE_TEXT, SESSION_UI } from '../game/treeText';
import { moIcon } from './moments/icons';
import { PriceTicker, type PriceExplain, type PriceReason, type PriceRowView, type PriceTermView } from './moments/price';
import { fmt, fmtMult } from './format';

/** What the game may send (fields beyond the base can disappear when a rule is removed). */
export type SeedPriceParts = Pick<SeedPriceView, 'base'> & Partial<Omit<SeedPriceView, 'base'>>;

const T = {
  title: { es: 'Precio de la semilla', en: 'Seed price' },
  base: { es: 'base', en: 'base' },
  unit: { es: '{n} luz', en: '{n} glow' },
  bought1: { es: '1 comprada hoy', en: '1 bought today' },
  boughtN: { es: '{n} compradas hoy', en: '{n} bought today' },
  full: { es: 'placa llena', en: 'dish full' },
  total: { es: 'precio', en: 'price' },
  // The room: wells of a multiwell plate and words (docs/ARTE-REALISTA.md §6.9; plan §6 #2).
  wells: { es: 'Huecos', en: 'Room' },
  room1: { es: 'Cabe 1 más', en: 'Room for 1 more' },
  roomN: { es: 'Caben {n} más', en: 'Room for {n} more' },
  // «Placa llena (4 de 4)»: «· caben 4» read as «4 more fit» (QA-CLARIDAD-2 C6).
  roomFull: { es: 'Placa llena ({n} de {n})', en: 'Dish full ({n} of {n})' },
  roomOver: { es: '{n} de más', en: '{n} too many' },
  // The pill's short room words.
  pill1: { es: 'Cabe 1 más', en: '1 more' },
  pillN: { es: 'Caben {n} más', en: '{n} more' },
  pillFull: { es: 'Llena ({n} de {n})', en: 'Full ({n} of {n})' },
  big: { es: 'Mantén pulsado: semilla grande {m}', en: 'Hold: big seed {m}' },
  growing: { es: 'Hay semillas naciendo: espera un poco.', en: 'Seeds are hatching: wait a moment.' },
  ruleSession: { es: 'Una semilla cuesta lo mismo toda la sesión.', en: 'A seed costs the same all session long.' },
  ruleStep: { es: 'Hoy cada semilla sube un poco.', en: 'Today each seed costs a little more.' },
  ruleSat: { es: 'Con la placa llena, cuesta mucho más.', en: 'With the dish full, it costs much more.' },
  fullTree: { es: '¿Placa llena? Compra «{node}» en el Árbol.', en: 'Dish full? Buy “{node}” in the Tree.' },
  seeTree: { es: 'Ver en el Árbol', en: 'See in the Tree' },
  freeNow: { es: 'La próxima es gratis.', en: 'The next one is free.' },
  seeDish: { es: 'Más sitio: ver la Placa', en: 'More room: see the Dish' },
  close: { es: 'Cerrar', en: 'Close' },
  // The label-maker chip (Mono capitals in CSS), only when something really changed.
  rsFree: { es: '¡Gratis!', en: 'Free!' },
  rsCheap: { es: '{pct} · {node}', en: '{pct} · {node}' },
  rsSlots: { es: 'Placa más grande: caben {n}', en: 'Bigger dish: room for {n}' },
  rsFull: { es: 'Placa llena {s}', en: 'Dish full {s}' },
  rsRoom: { es: 'Hay sitio otra vez', en: 'Room again' },
  rsSession: { es: 'Sesión nueva: precio de siempre', en: 'New session: usual price' },
  rsBase: { es: 'Nuevo precio: {b}', en: 'New price: {b}' },
  rsUp: { es: 'Sube el precio', en: 'Price up' },
  rsDown: { es: 'Baja el precio', en: 'Price down' },
  rsBig: { es: 'Semilla grande {m}', en: 'Big seed {m}' },
} satisfies Record<string, Text>;

function tr(text: Text, lang: Lang, vars?: Record<string, string | number>): string {
  let s = text[lang];
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

const EPS = 1e-9;
const active = (m: number | undefined): m is number => typeof m === 'number' && Number.isFinite(m) && m > 1 + EPS;
/** A discount factor in use (below ×1). */
const cheaper = (m: number | undefined): m is number => typeof m === 'number' && Number.isFinite(m) && m > 0 && m < 1 - EPS;

/**
 * The classic loop's crowding is part of the price itself (never a "+1 viva" factor): the base the card shows.
 * In the sessions loop crowdMult is 1 and this is the base.
 */
const baseOf = (p: SeedPriceParts): number => p.base * (active(p.crowdMult) ? p.crowdMult : 1);

/**
 * The per-seed step (SEED_PRICE_STEP; 1 from ADR-030 on) only while it moves the whole-Luz price: ×1,05 on 3
 * still reads 3, and saying "it went up" there would be a lie.
 */
function stepShows(p: SeedPriceParts): p is SeedPriceParts & { stepMult: number } {
  if (!active(p.stepMult)) return false;
  const before = baseOf(p) * (cheaper(p.cheapMult) ? p.cheapMult : 1);
  return Math.max(1, Math.round(before * p.stepMult)) > Math.max(1, Math.round(before));
}

function boughtText(p: SeedPriceParts, lang: Lang): string {
  const n = Math.max(0, p.bought ?? 0);
  return n === 1 ? tr(T.bought1, lang) : tr(T.boughtN, lang, { n });
}

/** Room on the dish, when the game counts it. */
function slotsOf(p: SeedPriceParts): { free: number; used: number; over: number } | null {
  if (typeof p.freeSlots !== 'number' || !(p.freeSlots > 0)) return null;
  const used = Math.max(0, p.used ?? 0);
  return { free: p.freeSlots, used, over: Math.max(0, used - p.freeSlots) };
}

/** "Caben 2 más", "Cabe 1 más", "Placa llena (3 de 3)", "1 de más". */
function roomText(s: { free: number; used: number; over: number }, lang: Lang): string {
  const left = Math.max(0, s.free - s.used);
  return s.over > 0 ? tr(T.roomOver, lang, { n: s.over }) : left === 0 ? tr(T.roomFull, lang, { n: s.free }) : left === 1 ? tr(T.room1, lang) : tr(T.roomN, lang, { n: left });
}

/** The pill's short room words: "Caben 2 más", "Cabe 1 más", "Llena (4 de 4)", "1 de más". */
export function pillRoomText(s: { free: number; used: number; over: number }, lang: Lang): string {
  const left = Math.max(0, s.free - s.used);
  return s.over > 0 ? tr(T.roomOver, lang, { n: s.over }) : left === 0 ? tr(T.pillFull, lang, { n: s.free }) : left === 1 ? tr(T.pill1, lang) : tr(T.pillN, lang, { n: left });
}

/**
 * The readings of the card, left to right: the base price (a cost: amber, no arrow), then only the factors that
 * change it now: a discount (gain, ↓), a full dish or today's step (cost, ↑).
 */
export function seedPriceTerms(p: SeedPriceParts, lang: Lang): PriceTermView[] {
  const terms: PriceTermView[] = [{ icon: 'drop', value: tr(T.unit, lang, { n: fmt(baseOf(p), lang) }), label: tr(T.base, lang), active: true, tone: 'cost' }];
  if (cheaper(p.cheapMult)) terms.push({ icon: 'gift', value: fmtMult(p.cheapMult, lang), sign: '↓', label: NODE_TEXT.cheapSeeds.name[lang], active: true, tone: 'gain' });
  if (active(p.satMult)) terms.push({ icon: 'slot', value: fmtMult(p.satMult, lang), sign: '↑', label: tr(T.full, lang), active: true, tone: 'cost' });
  if (stepShows(p)) terms.push({ icon: 'up', value: fmtMult(p.stepMult, lang), sign: '↑', label: boughtText(p, lang), active: true, tone: 'cost' });
  return terms;
}

/** The free seeds waiting, or nothing: the equation already says what it costs and why. */
export function seedPriceToday(p: SeedPriceParts, _cost: number, lang: Lang): string | undefined {
  return (p.freeSeeds ?? 0) > 0 ? tr(T.freeNow, lang) : undefined;
}

/** The rule in one sentence (plan §6 #10): "Una semilla cuesta 4 de luz. Siempre." */
export function seedPriceRule(p: SeedPriceParts, lang: Lang): string {
  if (active(p.satMult)) return tr(T.ruleSat, lang);
  if (stepShows(p)) return tr(T.ruleStep, lang);
  if (cheaper(p.cheapMult)) return tr(T.ruleSession, lang);
  return SESSION_UI.seedAlways(fmt(baseOf(p), lang))[lang];
}

/** The seed price as a PriceExplain for the shared price sheet, or null when the game sends no breakdown. */
export function seedPriceSheetExplain(v: GameView, lang: Lang, o: { onSeeDish?(): void; onSeeTree?(): void } = {}): PriceExplain | null {
  const p = v.seedPrice as SeedPriceParts | undefined;
  if (!p || !Number.isFinite(p.base)) return null;
  const rows: PriceRowView[] = [];
  const slots = slotsOf(p);
  if (slots) rows.push({ icon: 'slot', label: tr(T.wells, lang), dots: slots, text: roomText(slots, lang), tone: slots.over > 0 ? 'cost' : undefined });
  const freeSeeds = p.freeSeeds ?? 0;
  if (freeSeeds > 0) rows.push({ icon: 'gift', text: SESSION_UI.freeSeeds(freeSeeds, fmt(baseOf(p), lang))[lang], tone: 'gain' });
  // (ADR-027 v0.027) The run's Nevera creature is still waking: that is why the seeds wait, not other seeds hatching.
  if (v.session?.wakeHold) rows.push({ icon: 'clock', text: TEXT.wakeSow[lang], tone: 'grey' });
  else if (v.seedsGrowing) rows.push({ icon: 'clock', text: tr(T.growing, lang), tone: 'grey' });
  if (active(p.bigMult) && v.tools.longPress) rows.push({ icon: 'big', text: tr(T.big, lang, { m: fmtMult(p.bigMult, lang) }), tone: 'cost' });
  const full = !!p.full || (slots !== null && slots.used >= slots.free);
  const crowded = (slots?.over ?? 0) > 0 || active(p.satMult) || (p.capacity !== undefined && full);
  // Sessions loop: room comes from the research tree («Más sitio»), not from a Lab upgrade (J-75).
  const tree = p.capacity !== undefined;
  if (tree && full) rows.push({ icon: 'slot', text: tr(T.fullTree, lang, { node: NODE_TEXT.slots.name[lang] }), tone: 'info' });
  const see = tree ? o.onSeeTree : o.onSeeDish;
  return {
    title: tr(T.title, lang),
    icon: 'tag',
    total: tr(T.unit, lang, { n: fmt(v.seedCost, lang) }),
    totalLabel: tr(T.total, lang),
    totalIcon: 'essence',
    totalTone: 'cost',
    terms: seedPriceTerms(p, lang),
    rows,
    rule: seedPriceRule(p, lang),
    advice: seedPriceToday(p, v.seedCost, lang),
    action: crowded && see ? { label: tr(tree ? T.seeTree : T.seeDish, lang), run: see } : undefined,
    closeLabel: tr(T.close, lang),
  };
}

/** What the seed pill remembers between views (to say why the price moved). */
export interface SeedPriceSnap {
  cost: number;
  base: number;
  satMult: number | undefined;
  freeSlots: number | undefined;
  freeSeeds: number;
  stepMult: number | undefined;
  cheapMult: number | undefined;
}

export function seedPriceSnap(v: GameView): SeedPriceSnap | null {
  const p = v.seedPrice as SeedPriceParts | undefined;
  if (!p) return null;
  return { cost: v.seedCost, base: baseOf(p), satMult: p.satMult, freeSlots: p.freeSlots, freeSeeds: p.freeSeeds ?? 0, stepMult: p.stepMult, cheapMult: p.cheapMult };
}

/**
 * The label-maker chip (docs/ARTE-REALISTA.md §6.9): what changed, in one line, or null when nothing the player
 * can see changed. Never "+1 criatura viva": a creature on the dish does not move the price (and in the classic
 * loop, where it did, a rise reads "Sube el precio" and a fall "Hay sitio otra vez": nothing cheers a death).
 */
export function seedPriceChange(prev: SeedPriceSnap, next: SeedPriceSnap, lang: Lang): PriceReason | null {
  const dir: -1 | 0 | 1 = next.cost < prev.cost - EPS ? -1 : next.cost > prev.cost + EPS ? 1 : 0;
  if (next.freeSeeds > prev.freeSeeds) return { text: tr(T.rsFree, lang), dir: -1 };
  if (typeof next.freeSlots === 'number' && typeof prev.freeSlots === 'number' && next.freeSlots > prev.freeSlots)
    return { text: tr(T.rsSlots, lang, { n: next.freeSlots }), dir: dir || -1 };
  const k0 = prev.cheapMult ?? 1;
  const k1 = next.cheapMult ?? 1;
  if (k1 < k0 - EPS) return { text: tr(T.rsCheap, lang, { pct: fmtMult(k1, lang), node: NODE_TEXT.cheapSeeds.name[lang] }), dir: -1 };
  if (!dir) return null;
  const t0 = prev.stepMult ?? 1;
  const t1 = next.stepMult ?? 1;
  if (t1 < t0 - EPS && dir < 0) return { text: tr(T.rsSession, lang), dir };
  const s0 = prev.satMult ?? 1;
  const s1 = next.satMult ?? 1;
  if (s1 > s0 + EPS) return { text: tr(T.rsFull, lang, { s: fmtMult(s1, lang) }), dir: 1 };
  if (s1 < s0 - EPS) return { text: tr(T.rsRoom, lang), dir: -1 };
  if (Math.abs(next.base - prev.base) > EPS) return { text: tr(T.rsBase, lang, { b: fmt(next.base, lang) }), dir };
  return { text: tr(dir > 0 ? T.rsUp : T.rsDown, lang), dir };
}

/** "Semilla grande ×2" while the player holds for a big seed (null when there is no big seed). */
export function bigSeedChip(v: GameView, lang: Lang): PriceReason | null {
  const m = (v.seedPrice as SeedPriceParts | undefined)?.bigMult;
  return active(m) ? { text: tr(T.rsBig, lang, { m: fmtMult(m, lang) }), dir: 1 } : null;
}

export interface SeedMeter {
  readonly el: HTMLElement;
  /** Each view: refresh the dots and, when the price moved, show why for ~2 s. */
  update(v: GameView): void;
  /** Show a reason now (big seed, "wait, seeds are hatching"). */
  flash(r: PriceReason): void;
}

/**
 * The room left on the dish next to the seed price, in words ("Caben 2 más", "Llena · caben 3"; only when the
 * game counts room), and the label-maker chip, which floats above the pill (absolutely positioned: the pill
 * never changes size because of it).
 */
export function createSeedMeter(lang: () => Lang): SeedMeter {
  const el = document.createElement('span');
  el.className = 'mo-meter';
  const dots = document.createElement('span');
  dots.className = 'mo-dots';
  const ticker = new PriceTicker();
  el.append(dots, ticker.el);
  let last: SeedPriceSnap | null = null;
  let dotsKey = '';
  return {
    el,
    update(v) {
      const p = v.seedPrice as SeedPriceParts | undefined;
      const slots = p ? slotsOf(p) : null;
      const L = lang();
      const key = slots ? `${slots.free}|${slots.used}|${L}` : '';
      if (key !== dotsKey) {
        dotsKey = key;
        dots.hidden = !slots;
        el.classList.toggle('over', !!slots && slots.over > 0);
        if (slots) {
          const left = Math.max(0, slots.free - slots.used);
          const words = pillRoomText(slots, L);
          dots.innerHTML = `${moIcon('creatures', 14)}<span>${words}</span>`;
          dots.classList.toggle('full', left === 0 || slots.over > 0);
          el.setAttribute('aria-label', roomText(slots, L));
        } else {
          dots.innerHTML = '';
          el.removeAttribute('aria-label');
        }
      }
      const snap = seedPriceSnap(v);
      if (last && snap) {
        const r = seedPriceChange(last, snap, lang());
        if (r) ticker.show(r);
      }
      last = snap;
    },
    flash: (r) => ticker.show(r),
  };
}
