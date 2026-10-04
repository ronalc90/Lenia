/**
 * "Why does sowing cost this much?" — the seed price explained as a friendly
 * equation with icons (src/core/types SeedPriceView):
 *
 *   [💧 2] × [×1,5 · 2 vivas] × [×3 · placa llena: 2 de 1] = [9]
 *   ●●○ cheap slots · 🎁 free seeds · hold for a big seed · "Mejora la Placa"
 *
 *  - createSeedPriceSheet(root, opts)  the sheet ONE tap on the price opens: the
 *                                      equation with today's numbers, the rule in
 *                                      plain words, "today it costs N because…"
 *                                      (built on the generic price.ts sheet)
 *  - SlotMeter                         a tiny DOM meter for next to the seed button:
 *                                      a dot per cheap slot, filled per creature,
 *                                      reddish past capacity; every price change
 *                                      shows ↓ green / ↑ amber + a reason chip
 *  - seedPriceReason(prev, next)       why it changed, in one line (tested)
 *  - drawSlotMeter(ctx, …)             the same meter on a canvas
 *  - priceTerms(…)                     the pure breakdown (tested)
 */
import { UI } from '../../core/palette';
import type { GameView, Lang, SeedPriceView } from '../../core/types';
import { fmt, fmtFixed } from '../format';
import { createPriceSheet, dotsHtml, PriceTicker, type PriceExplain, type PriceReason, type PriceRowView } from './price';
import { MS, tr } from './strings';

export interface PriceTerm {
  kind: 'base' | 'crowd' | 'sat';
  /** "2", "×1,5", "×3". */
  value: string;
  label: string;
  /** Only shown when it changes the price (crowd > 1, saturation > 1). */
  active: boolean;
}

export interface PriceBreakdown {
  terms: PriceTerm[];
  total: string;
  /** Cheap slots: free, used (counted creatures), over capacity. */
  slots: { free: number; used: number; over: number };
  freeSeeds: number;
  bigMult: string;
  /** "Upgrade the Dish" is the useful advice (saturated or crowded). */
  adviseDish: boolean;
}

/** Trim "1,50" → "1,5", "3,00" → "3". */
function mult(n: number, lang: Lang): string {
  const s = fmtFixed(n, 2, lang);
  return s.replace(/[.,]?0+$/, '');
}

/** The price split into the terms the player sees. */
export function priceTerms(p: SeedPriceView, cost: number, lang: Lang): PriceBreakdown {
  const over = Math.max(0, p.used - p.freeSlots);
  const left = Math.max(0, p.freeSlots - p.used);
  const alive =
    p.alive <= 0 ? tr(MS.spAlive0, lang) : p.alive === 1 ? tr(MS.spAlive1, lang) : tr(MS.spAlive, lang, { n: p.alive });
  const terms: PriceTerm[] = [
    { kind: 'base', value: fmt(p.base, lang), label: tr(MS.spBase, lang), active: true },
    { kind: 'crowd', value: `×${mult(p.crowdMult, lang)}`, label: alive, active: p.crowdMult > 1 + 1e-9 },
    {
      kind: 'sat',
      value: `×${mult(p.satMult, lang)}`,
      label:
        over > 0
          ? tr(MS.spFull, lang, { over })
          : left === 0
            ? tr(MS.spRoom0, lang)
            : left === 1
              ? tr(MS.spRoom1, lang)
              : tr(MS.spRoom, lang, { n: left }),
      active: p.satMult > 1 + 1e-9,
    },
  ];
  return {
    terms,
    total: fmt(cost, lang),
    slots: { free: p.freeSlots, used: p.used, over },
    freeSeeds: p.freeSeeds,
    bigMult: mult(p.bigMult, lang),
    adviseDish: over > 0 || p.crowdMult * p.satMult >= 2,
  };
}

// ───────────────────────────── today's reason, in words ─────────────────────────────

/** "Hoy cuesta 9 porque hay 2 criaturas vivas y la placa está llena (2 de 1 espacios)." */
export function seedPriceToday(p: SeedPriceView, cost: number, lang: Lang): string {
  const total = fmt(cost, lang);
  const over = p.used > p.freeSlots;
  if (p.freeSeeds > 0)
    return lang === 'es'
      ? `Tienes ${p.freeSeeds} ${p.freeSeeds === 1 ? 'siembra gratis' : 'siembras gratis'}: la próxima no cuesta nada.`
      : `You have ${p.freeSeeds} free ${p.freeSeeds === 1 ? 'seed' : 'seeds'}: the next one costs nothing.`;
  if (p.alive <= 0)
    return lang === 'es' ? `Hoy cuesta ${total}: el mínimo, la placa está vacía.` : `It costs ${total} now: the minimum, the dish is empty.`;
  const alive =
    lang === 'es'
      ? `hay ${p.alive} ${p.alive === 1 ? 'criatura viva' : 'criaturas vivas'}`
      : `${p.alive} ${p.alive === 1 ? 'creature is' : 'creatures are'} alive`;
  const full =
    lang === 'es'
      ? ` y la placa está llena (${p.used} de ${p.freeSlots} espacios)`
      : ` and the dish is full (${p.used} of ${p.freeSlots} slots)`;
  return lang === 'es' ? `Hoy cuesta ${total} porque ${alive}${over ? full : ''}.` : `It costs ${total} now because ${alive}${over ? full : ''}.`;
}

/** The seed price as a generic PriceExplain (equation, slots, free seeds, big seed, rule, today). */
export function seedPriceExplain(v: GameView, lang: Lang, o: { onSeeDish?(): void } = {}): PriceExplain | null {
  const p = v.seedPrice;
  if (!p) return null;
  const b = priceTerms(p, v.seedCost, lang);
  const rows: PriceRowView[] = [
    {
      icon: 'slot',
      label: tr(MS.spSlots, lang),
      dots: b.slots,
      text:
        b.slots.over > 0
          ? tr(MS.spSlotsOver, lang, { n: b.slots.over, s: mult(p.satMult > 1 ? Math.pow(p.satMult, 1 / b.slots.over) : 3, lang) })
          : tr(MS.spSlotsFree, lang, { n: Math.max(0, b.slots.free - b.slots.used) }),
      tone: b.slots.over > 0 ? 'warn' : undefined,
    },
  ];
  if (b.freeSeeds > 0) rows.push({ icon: 'gift', text: b.freeSeeds === 1 ? tr(MS.spFree1, lang) : tr(MS.spFree, lang, { n: b.freeSeeds }), tone: 'good' });
  rows.push({ icon: 'big', text: tr(MS.spBig, lang, { m: b.bigMult }) });
  return {
    title: tr(MS.spTitle, lang),
    icon: 'tag',
    total: b.total,
    totalLabel: tr(MS.spTotal, lang),
    totalIcon: 'essence',
    terms: b.terms.map((t) => ({ icon: ICON_OF[t.kind], value: t.value, label: t.label, active: t.active, tone: t.kind === 'sat' && t.active ? 'warn' : undefined })),
    rows,
    rule: tr(MS.spRule, lang),
    advice: seedPriceToday(p, v.seedCost, lang),
    action: b.adviseDish && o.onSeeDish ? { label: tr(MS.spDish, lang), run: o.onSeeDish } : undefined,
    closeLabel: tr(MS.close, lang),
  };
}

// ───────────────────────────── why it changed ─────────────────────────────

export interface PriceSnap extends SeedPriceView {
  cost: number;
}

export function snapOf(v: GameView): PriceSnap | null {
  return v.seedPrice ? { ...v.seedPrice, cost: v.seedCost } : null;
}

/**
 * One line saying why the seed price just changed, from what changed in the
 * breakdown ("+1 criatura viva → ×1,25", "Placa llena: 4 de 3 espacios → ×3",
 * "Murió una criatura → más barato", "¡Gratis! (lluvia de esporas)"). Null when
 * nothing the player can see changed.
 */
export function seedPriceReason(prev: PriceSnap, next: PriceSnap, lang: Lang): PriceReason | null {
  const eps = 1e-9;
  const dir: -1 | 0 | 1 = next.cost < prev.cost - eps ? -1 : next.cost > prev.cost + eps ? 1 : 0;
  if (next.freeSeeds > prev.freeSeeds) return { text: tr(MS.rsFree, lang), dir: -1 };
  if (next.freeSlots > prev.freeSlots) return { text: tr(MS.rsSlots, lang, { n: next.freeSlots }), dir: dir || -1 };
  if (!dir && Math.abs(next.base - prev.base) < eps) return null;
  if (next.satMult > prev.satMult + eps)
    return { text: tr(MS.rsFull, lang, { used: next.used, free: next.freeSlots, s: mult(next.satMult, lang) }), dir: 1 };
  if (next.satMult < prev.satMult - eps)
    return {
      text: next.satMult <= 1 + eps ? tr(MS.rsRoom, lang) : tr(MS.rsFull, lang, { used: next.used, free: next.freeSlots, s: mult(next.satMult, lang) }),
      dir: -1,
    };
  const d = next.alive - prev.alive;
  if (d > 0) return { text: tr(d === 1 ? MS.rsAlive1 : MS.rsAliveN, lang, { n: d, m: mult(next.crowdMult, lang) }), dir: 1 };
  if (d < 0) return { text: tr(d === -1 ? MS.rsDied1 : MS.rsDiedN, lang, { n: -d }), dir: -1 };
  if (Math.abs(next.base - prev.base) > eps) return { text: tr(MS.rsBase, lang, { b: fmt(next.base, lang) }), dir };
  return dir ? { text: tr(MS.rsOther, lang), dir } : null;
}

/** For a long-press: "Semilla grande ×2,25". */
export function bigSeedReason(p: SeedPriceView, lang: Lang): PriceReason {
  return { text: tr(MS.rsBig, lang, { m: mult(p.bigMult, lang) }), dir: 1 };
}

// ───────────────────────────── the sheet ─────────────────────────────

export interface SeedPriceSheetOpts {
  lang(): Lang;
  reduceMotion?(): boolean;
  /** "Ver Placa": open the Lab on the Dish upgrade. Hidden when not given. */
  onSeeDish?(): void;
  onClose?(): void;
}

export interface SeedPriceSheet {
  readonly el: HTMLElement;
  readonly isOpen: boolean;
  open(view: GameView): void;
  /** Refresh numbers while open (call with each view). */
  update(view: GameView): void;
  close(): void;
  dispose(): void;
}

const ICON_OF: Record<PriceTerm['kind'], 'drop' | 'creatures' | 'slot'> = { base: 'drop', crowd: 'creatures', sat: 'slot' };

/** The seed price sheet: createPriceSheet fed by seedPriceExplain. Open it with ONE tap on the price. */
export function createSeedPriceSheet(root: HTMLElement, opts: SeedPriceSheetOpts): SeedPriceSheet {
  const sheet = createPriceSheet(root, { reduceMotion: opts.reduceMotion, onClose: opts.onClose });
  const explain = (v: GameView) => seedPriceExplain(v, opts.lang(), { onSeeDish: opts.onSeeDish });
  return {
    el: sheet.el,
    get isOpen() {
      return sheet.isOpen;
    },
    open(view) {
      const x = explain(view);
      if (x) sheet.open(x);
    },
    update(view) {
      if (!sheet.isOpen) return;
      const x = explain(view);
      if (x) sheet.update(x);
    },
    close: () => sheet.close(),
    dispose: () => sheet.dispose(),
  };
}

// ───────────────────────────── slot meter ─────────────────────────────

/**
 * Tiny meter for next to the seed button: a dot per cheap slot (filled per
 * creature), reddish dots past capacity, and — every time the price changes —
 * an ↑ amber / ↓ green arrow with a one-line reason chip for ~2 s.
 */
export class SlotMeter {
  readonly el: HTMLElement;
  private dots: HTMLElement;
  private ticker = new PriceTicker();
  private last: PriceSnap | null = null;
  private lastKey = '';

  constructor(private lang: () => Lang) {
    this.el = document.createElement('span');
    this.el.className = 'mo-meter';
    this.dots = document.createElement('span');
    this.dots.className = 'mo-dots';
    this.el.append(this.dots, this.ticker.el);
  }

  update(view: GameView): void {
    const p = view.seedPrice;
    if (!p) {
      this.el.hidden = true;
      return;
    }
    this.el.hidden = false;
    const over = Math.max(0, p.used - p.freeSlots);
    const key = `${p.freeSlots}|${p.used}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.dots.innerHTML = dotsHtml({ free: p.freeSlots, used: p.used, over }, 4);
      this.el.classList.toggle('over', over > 0);
      const L = this.lang();
      this.el.setAttribute(
        'aria-label',
        over > 0 ? tr(MS.spSlotsOver, L, { n: over, s: mult(Math.pow(p.satMult, 1 / over), L) }) : tr(MS.spSlotsFree, L, { n: Math.max(0, p.freeSlots - p.used) }),
      );
    }
    const snap = snapOf(view)!;
    if (this.last) {
      const r = seedPriceReason(this.last, snap, this.lang());
      if (r) this.ticker.show(r);
    }
    this.last = snap;
  }

  /** Show a reason now (e.g. bigSeedReason while the player holds for a big seed). */
  flash(r: PriceReason): void {
    this.ticker.show(r);
  }
}

/**
 * The slot meter on a canvas (e.g. inside a canvas HUD). `change` −1/0/+1 and
 * `changeAge` (s since the price changed) animate the arrow. Returns its width.
 */
export function drawSlotMeter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  p: SeedPriceView,
  o: { time: number; change?: -1 | 0 | 1; changeAge?: number; dot?: number } = { time: 0 },
): number {
  const d = o.dot ?? 7;
  const gap = 3;
  const over = Math.max(0, p.used - p.freeSlots);
  const n = p.freeSlots + Math.min(over, 4);
  ctx.save();
  for (let i = 0; i < n; i++) {
    const cx = x + d / 2 + i * (d + gap);
    const isOver = i >= p.freeSlots;
    const on = isOver || i < Math.min(p.used, p.freeSlots);
    ctx.beginPath();
    ctx.arc(cx, y, d / 2, 0, Math.PI * 2);
    if (on) {
      ctx.fillStyle = isOver ? UI.danger : UI.good;
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(138,226,52,0.7)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
  let w = n * (d + gap);
  const age = o.changeAge ?? 99;
  if (o.change && age < 1.8) {
    const a = 1 - Math.max(0, age - 1.2) / 0.6;
    const dy = (o.change < 0 ? 1 : -1) * Math.min(1, age / 0.3) * 3;
    const col = o.change < 0 ? UI.good : UI.warn;
    const ax = x + w + 6;
    ctx.globalAlpha = a;
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, y - 5 + dy);
    ctx.lineTo(ax, y + 5 + dy);
    ctx.stroke();
    ctx.beginPath();
    const tip = o.change < 0 ? y + 7 + dy : y - 7 + dy;
    const base = o.change < 0 ? y + 2 + dy : y - 2 + dy;
    ctx.moveTo(ax, tip);
    ctx.lineTo(ax - 4, base);
    ctx.lineTo(ax + 4, base);
    ctx.closePath();
    ctx.fill();
    w += 12;
  }
  ctx.restore();
  return w;
}
