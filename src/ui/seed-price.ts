/**
 * The seed price, explained from whatever `view.seedPrice` carries (owner: "prices must never feel
 * random"). Generic on purpose: a factor that is ×1 or absent is not shown, so the same UI is right
 * with today's crowding/saturation rule and with a fixed price per session plus a slot limit.
 *
 *   seedPriceSheetExplain(view, lang, opts)  → PriceExplain for the generic price sheet (src/ui/moments/price)
 *   seedPriceChange(prev, next, lang)        → the one-line "why it changed" chip, or null
 *   createSeedMeter(lang)                    → slot dots + ↑/↓ reason chip for the seed pill
 *
 * Words a five-year-old understands: "sitios", "vivas", "placa llena". Both languages.
 * Sessions loop (docs/CICLO.md): base × «Semillas baratas» × a small step per seed bought this session;
 * living creatures never raise it, the limit is room (CLARIDAD J-121, J-75).
 */
import type { GameView, Lang, SeedPriceView, Text } from '../core/types';
import { NODE_TEXT } from '../game/treeText';
import { moIcon } from './moments/icons';
import { PriceTicker, type PriceExplain, type PriceReason, type PriceRowView, type PriceTermView } from './moments/price';
import { fmt, fmtFixed } from './format';

/** What the game may send (fields beyond the base can disappear when a rule is removed). */
export type SeedPriceParts = Pick<SeedPriceView, 'base'> & Partial<Omit<SeedPriceView, 'base'>>;

const T = {
  title: { es: '¿Cuánto cuesta sembrar?', en: 'What does a seed cost?' },
  base: { es: 'una semilla', en: 'one seed' },
  bought1: { es: '1 comprada hoy', en: '1 bought today' },
  boughtN: { es: '{n} compradas hoy', en: '{n} bought today' },
  alive1: { es: '1 viva', en: '1 alive' },
  aliveN: { es: '{n} vivas', en: '{n} alive' },
  full: { es: 'placa llena', en: 'dish full' },
  total: { es: 'precio', en: 'price' },
  slots: { es: 'Sitios', en: 'Room' },
  slotsLeft1: { es: 'Queda 1', en: '1 left' },
  slotsLeft: { es: 'Quedan {n}', en: '{n} left' },
  slotsNone: { es: 'Está llena', en: 'It is full' },
  slotsOver: { es: '{n} de más', en: '{n} too many' },
  // The room count next to the price: words, not bare dots (docs/ARTE.md §2.11).
  room1: { es: '1 sitio', en: '1 spot' },
  roomN: { es: '{n} sitios', en: '{n} spots' },
  roomFull: { es: 'Llena', en: 'Full' },
  free1: { es: 'Tienes 1 semilla gratis', en: 'You have 1 free seed' },
  freeN: { es: 'Tienes {n} semillas gratis', en: 'You have {n} free seeds' },
  big: { es: 'Mantén pulsado: semilla grande ×{m}', en: 'Hold: big seed ×{m}' },
  growing: { es: 'Hay semillas naciendo: espera un poco.', en: 'Seeds are hatching: wait a moment.' },
  ruleFixed: { es: 'Sembrar cuesta siempre lo mismo: {b} de Esencia.', en: 'A seed always costs the same: {b} Essence.' },
  ruleBase: { es: 'Cada semilla cuesta {b} de Esencia.', en: 'Each seed costs {b} Essence.' },
  ruleStep: {
    es: 'Cada semilla que compras hoy cuesta un poquito más. En la próxima sesión vuelve a costar lo de siempre.',
    en: 'Each seed you buy today costs a tiny bit more. Next session it costs the usual price again.',
  },
  ruleCheap: { es: 'Con «{node}» cuesta menos.', en: 'With “{node}” it costs less.' },
  ruleCrowd: { es: 'Cuantas más criaturas viven, más cuesta.', en: 'The more creatures live, the more it costs.' },
  ruleSat: { es: 'Con la placa llena, cuesta mucho más.', en: 'With the dish full, it costs much more.' },
  ruleSlots: { es: 'En la placa caben {n}.', en: 'The dish has room for {n}.' },
  today: { es: 'Ahora cuesta {t}.', en: 'It costs {t} now.' },
  todayBecause: { es: 'Ahora cuesta {t} porque {why}.', en: 'It costs {t} now because {why}.' },
  whyAlive1: { es: 'hay 1 criatura viva', en: '1 creature is alive' },
  whyAliveN: { es: 'hay {n} criaturas vivas', en: '{n} creatures are alive' },
  whyFull: { es: 'la placa está llena', en: 'the dish is full' },
  whyBought1: { es: 'ya compraste 1 hoy', en: 'you already bought 1 today' },
  whyBoughtN: { es: 'ya compraste {n} hoy', en: 'you already bought {n} today' },
  fullTree: { es: '¿Placa llena? Compra «{node}» en el Árbol.', en: 'Dish full? Buy “{node}” in the Tree.' },
  seeTree: { es: 'Ver en el Árbol', en: 'See in the Tree' },
  and: { es: ' y ', en: ' and ' },
  freeNow: { es: 'La próxima es gratis.', en: 'The next one is free.' },
  seeDish: { es: 'Más sitio: ver la Placa', en: 'More room: see the Dish' },
  close: { es: 'Cerrar', en: 'Close' },
  // Reason chips (one line, next to the price, ~2 s).
  rsFree: { es: '¡Gratis! (lluvia de semillas)', en: 'Free! (seed shower)' },
  rsStep: { es: 'Una más hoy → un poquito más', en: 'One more today → a tiny bit more' },
  rsSession: { es: 'Sesión nueva → precio de siempre', en: 'New session → usual price' },
  rsCheap: { es: '{node} → más barato', en: '{node} → cheaper' },
  rsSlots: { es: 'Placa más grande: caben {n}', en: 'Bigger dish: room for {n}' },
  rsFull: { es: 'Placa llena → ×{s}', en: 'Dish full → ×{s}' },
  rsRoom: { es: 'Hay sitio otra vez → más barato', en: 'Room again → cheaper' },
  rsAlive1: { es: '+1 criatura viva → ×{m}', en: '+1 creature alive → ×{m}' },
  rsAliveN: { es: '+{n} criaturas vivas → ×{m}', en: '+{n} creatures alive → ×{m}' },
  rsBase: { es: 'Nuevo precio: {b}', en: 'New price: {b}' },
  rsUp: { es: 'Sube el precio', en: 'Price up' },
  rsDown: { es: 'Baja el precio', en: 'Price down' },
  rsBig: { es: 'Semilla grande ×{m}', en: 'Big seed ×{m}' },
} satisfies Record<string, Text>;

function tr(text: Text, lang: Lang, vars?: Record<string, string | number>): string {
  let s = text[lang];
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

/** "1,50" → "1,5", "3,00" → "3". */
function mult(n: number, lang: Lang): string {
  return fmtFixed(n, 2, lang).replace(/[.,]?0+$/, '');
}

const EPS = 1e-9;
const active = (m: number | undefined): m is number => typeof m === 'number' && Number.isFinite(m) && m > 1 + EPS;
/** A discount factor in use (below ×1). */
const cheaper = (m: number | undefined): m is number => typeof m === 'number' && Number.isFinite(m) && m > 0 && m < 1 - EPS;

/**
 * The per-seed step only when it moves the whole-Esencia price (×1,05 on 3 still reads 3: saying
 * "it went up" there would be a lie).
 */
function stepShows(p: SeedPriceParts): p is SeedPriceParts & { stepMult: number } {
  if (!active(p.stepMult)) return false;
  const before = p.base * (cheaper(p.cheapMult) ? p.cheapMult : 1);
  return Math.max(1, Math.round(before * p.stepMult)) > Math.max(1, Math.round(before));
}

function boughtText(p: SeedPriceParts, one: Text, many: Text, lang: Lang): string {
  const n = Math.max(0, p.bought ?? 0);
  return n === 1 ? tr(one, lang) : tr(many, lang, { n });
}

/** Room on the dish, when the game counts it. */
function slotsOf(p: SeedPriceParts): { free: number; used: number; over: number } | null {
  if (typeof p.freeSlots !== 'number' || !(p.freeSlots > 0)) return null;
  const used = Math.max(0, p.used ?? 0);
  return { free: p.freeSlots, used, over: Math.max(0, used - p.freeSlots) };
}

/** The factors shown in the equation: the base always, the others only while they change the price. */
export function seedPriceTerms(p: SeedPriceParts, lang: Lang): PriceTermView[] {
  const terms: PriceTermView[] = [{ icon: 'drop', value: fmt(p.base, lang), label: tr(T.base, lang), active: true }];
  if (active(p.crowdMult)) {
    const n = Math.max(0, p.alive ?? 0);
    terms.push({ icon: 'creatures', value: `×${mult(p.crowdMult, lang)}`, label: n === 1 ? tr(T.alive1, lang) : tr(T.aliveN, lang, { n }), active: true });
  }
  if (active(p.satMult)) terms.push({ icon: 'slot', value: `×${mult(p.satMult, lang)}`, label: tr(T.full, lang), active: true, tone: 'warn' });
  if (cheaper(p.cheapMult)) terms.push({ icon: 'gift', value: `×${mult(p.cheapMult, lang)}`, label: NODE_TEXT.cheapSeeds.name[lang], active: true, tone: 'good' });
  if (stepShows(p)) terms.push({ icon: 'creatures', value: `×${mult(p.stepMult, lang)}`, label: boughtText(p, T.bought1, T.boughtN, lang), active: true });
  return terms;
}

/** "Ahora cuesta 9 porque hay 2 criaturas vivas y la placa está llena." — only the reasons that apply. */
export function seedPriceToday(p: SeedPriceParts, cost: number, lang: Lang): string {
  if ((p.freeSeeds ?? 0) > 0) return tr(T.freeNow, lang);
  const why: string[] = [];
  if (active(p.crowdMult)) {
    const n = Math.max(0, p.alive ?? 0);
    why.push(n === 1 ? tr(T.whyAlive1, lang) : tr(T.whyAliveN, lang, { n }));
  }
  if (active(p.satMult)) why.push(tr(T.whyFull, lang));
  if (stepShows(p)) why.push(boughtText(p, T.whyBought1, T.whyBoughtN, lang));
  const total = fmt(cost, lang);
  return why.length ? tr(T.todayBecause, lang, { t: total, why: why.join(tr(T.and, lang)) }) : tr(T.today, lang, { t: total });
}

/** The rule in plain words, built from the factors that exist. */
export function seedPriceRule(p: SeedPriceParts, lang: Lang): string {
  const b = fmt(p.base, lang);
  // A rule is told while it changes the price (×1 crowding in the sessions loop is no rule at all);
  // the per-session step is told from the first seed, since it is the rule of that loop.
  const crowd = active(p.crowdMult);
  const sat = active(p.satMult);
  const step = typeof p.stepMult === 'number';
  const parts = [crowd || sat || step ? tr(T.ruleBase, lang, { b }) : tr(T.ruleFixed, lang, { b })];
  if (step) parts.push(tr(T.ruleStep, lang));
  if (cheaper(p.cheapMult)) parts.push(tr(T.ruleCheap, lang, { node: NODE_TEXT.cheapSeeds.name[lang] }));
  if (crowd) parts.push(tr(T.ruleCrowd, lang));
  if (sat) parts.push(tr(T.ruleSat, lang));
  const slots = slotsOf(p);
  if (slots) parts.push(tr(T.ruleSlots, lang, { n: slots.free }));
  return parts.join(' ');
}

/** The seed price as a PriceExplain for the generic price sheet, or null when the game sends no breakdown. */
export function seedPriceSheetExplain(v: GameView, lang: Lang, o: { onSeeDish?(): void; onSeeTree?(): void } = {}): PriceExplain | null {
  const p = v.seedPrice as SeedPriceParts | undefined;
  if (!p || !Number.isFinite(p.base)) return null;
  const rows: PriceRowView[] = [];
  const slots = slotsOf(p);
  if (slots) {
    const left = Math.max(0, slots.free - slots.used);
    rows.push({
      icon: 'slot',
      label: tr(T.slots, lang),
      dots: slots,
      text: slots.over > 0 ? tr(T.slotsOver, lang, { n: slots.over }) : left === 0 ? tr(T.slotsNone, lang) : left === 1 ? tr(T.slotsLeft1, lang) : tr(T.slotsLeft, lang, { n: left }),
      tone: slots.over > 0 ? 'warn' : undefined,
    });
  }
  const freeSeeds = p.freeSeeds ?? 0;
  if (freeSeeds > 0) rows.push({ icon: 'gift', text: freeSeeds === 1 ? tr(T.free1, lang) : tr(T.freeN, lang, { n: freeSeeds }), tone: 'good' });
  if (v.seedsGrowing) rows.push({ icon: 'clock', text: tr(T.growing, lang), tone: 'grey' });
  if (active(p.bigMult) && v.tools.longPress) rows.push({ icon: 'big', text: tr(T.big, lang, { m: mult(p.bigMult, lang) }) });
  const full = !!p.full || (slots !== null && slots.used >= slots.free);
  const crowded = (slots?.over ?? 0) > 0 || active(p.satMult) || (p.capacity !== undefined && full);
  // Sessions loop: room comes from the research tree («Más sitio»), not from a Lab upgrade (J-75).
  const tree = p.capacity !== undefined;
  if (tree && full) rows.push({ icon: 'slot', text: tr(T.fullTree, lang, { node: NODE_TEXT.slots.name[lang] }), tone: 'warn' });
  const see = tree ? o.onSeeTree : o.onSeeDish;
  return {
    title: tr(T.title, lang),
    icon: 'tag',
    total: fmt(v.seedCost, lang),
    totalLabel: tr(T.total, lang),
    totalIcon: 'essence',
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
  alive: number;
  crowdMult: number | undefined;
  satMult: number | undefined;
  freeSlots: number | undefined;
  freeSeeds: number;
  stepMult: number | undefined;
  cheapMult: number | undefined;
}

export function seedPriceSnap(v: GameView): SeedPriceSnap | null {
  const p = v.seedPrice as SeedPriceParts | undefined;
  if (!p) return null;
  return {
    cost: v.seedCost,
    base: p.base,
    alive: p.alive ?? 0,
    crowdMult: p.crowdMult,
    satMult: p.satMult,
    freeSlots: p.freeSlots,
    freeSeeds: p.freeSeeds ?? 0,
    stepMult: p.stepMult,
    cheapMult: p.cheapMult,
  };
}

/** One line saying why the seed price just changed (only causes the game still has), or null. */
export function seedPriceChange(prev: SeedPriceSnap, next: SeedPriceSnap, lang: Lang): PriceReason | null {
  const dir: -1 | 0 | 1 = next.cost < prev.cost - EPS ? -1 : next.cost > prev.cost + EPS ? 1 : 0;
  if (next.freeSeeds > prev.freeSeeds) return { text: tr(T.rsFree, lang), dir: -1 };
  if (typeof next.freeSlots === 'number' && typeof prev.freeSlots === 'number' && next.freeSlots > prev.freeSlots)
    return { text: tr(T.rsSlots, lang, { n: next.freeSlots }), dir: dir || -1 };
  if (!dir) return null;
  const k0 = prev.cheapMult ?? 1;
  const k1 = next.cheapMult ?? 1;
  if (k1 < k0 - EPS && dir < 0) return { text: tr(T.rsCheap, lang, { node: NODE_TEXT.cheapSeeds.name[lang] }), dir };
  const t0 = prev.stepMult ?? 1;
  const t1 = next.stepMult ?? 1;
  if (t1 > t0 + EPS && dir > 0) return { text: tr(T.rsStep, lang), dir };
  if (t1 < t0 - EPS && dir < 0) return { text: tr(T.rsSession, lang), dir };
  const s0 = prev.satMult ?? 1;
  const s1 = next.satMult ?? 1;
  if (s1 > s0 + EPS) return { text: tr(T.rsFull, lang, { s: mult(s1, lang) }), dir: 1 };
  if (s1 < s0 - EPS) return { text: s1 <= 1 + EPS ? tr(T.rsRoom, lang) : tr(T.rsFull, lang, { s: mult(s1, lang) }), dir: -1 };
  const c0 = prev.crowdMult ?? 1;
  const c1 = next.crowdMult ?? 1;
  const d = next.alive - prev.alive;
  if (Math.abs(c1 - c0) > EPS && d !== 0) {
    if (d > 0) return { text: d === 1 ? tr(T.rsAlive1, lang, { m: mult(c1, lang) }) : tr(T.rsAliveN, lang, { n: d, m: mult(c1, lang) }), dir: 1 };
    // Fewer creatures: room again (never "one died → cheaper": nothing cheers a death).
    return { text: tr(T.rsRoom, lang), dir: -1 };
  }
  if (Math.abs(next.base - prev.base) > EPS) return { text: tr(T.rsBase, lang, { b: fmt(next.base, lang) }), dir };
  return { text: tr(dir > 0 ? T.rsUp : T.rsDown, lang), dir };
}

/** "Semilla grande ×2,25" while the player holds for a big seed (null when there is no big seed). */
export function bigSeedChip(v: GameView, lang: Lang): PriceReason | null {
  const m = (v.seedPrice as SeedPriceParts | undefined)?.bigMult;
  return active(m) ? { text: tr(T.rsBig, lang, { m: mult(m, lang) }), dir: 1 } : null;
}

export interface SeedMeter {
  readonly el: HTMLElement;
  /** Each view: refresh the dots and, when the price moved, show why for ~2 s. */
  update(v: GameView): void;
  /** Show a reason now (big seed, "wait, seeds are hatching"). */
  flash(r: PriceReason): void;
}

/**
 * The room left on the dish next to the seed price, in words ("2 sitios", "Llena"; only when the game
 * counts room), and the ↑/↓ "why" chip, which floats above the pill (absolutely positioned: the pill
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
          const words = slots.over > 0 ? tr(T.slotsOver, L, { n: slots.over }) : left === 0 ? tr(T.roomFull, L) : left === 1 ? tr(T.room1, L) : tr(T.roomN, L, { n: left });
          dots.innerHTML = `${moIcon('creatures', 14)}<span>${words}</span>`;
          dots.classList.toggle('full', left === 0 || slots.over > 0);
          el.setAttribute(
            'aria-label',
            slots.over > 0 ? tr(T.slotsOver, L, { n: slots.over }) : left === 0 ? tr(T.slotsNone, L) : left === 1 ? tr(T.slotsLeft1, L) : tr(T.slotsLeft, L, { n: left }),
          );
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
