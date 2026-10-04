/**
 * "Why does sowing cost this much?" — the seed price explained as a friendly
 * equation with icons (src/core/types SeedPriceView):
 *
 *   [💧 2] × [×1,5 · 2 vivas] × [×3 · placa llena: 2 de 1] = [9]
 *   ●●○ cheap slots · 🎁 free seeds · hold for a big seed · "Mejora la Placa"
 *
 *  - createSeedPriceSheet(root, opts)  the sheet the seed button opens (hold the
 *                                      price or tap its "i")
 *  - SlotMeter                         a tiny DOM meter for next to the seed button:
 *                                      a dot per cheap slot, filled per creature,
 *                                      reddish past capacity; ↓ green / ↑ amber
 *                                      arrow when the price changes
 *  - drawSlotMeter(ctx, …)             the same meter on a canvas
 *  - priceTerms(…)                     the pure breakdown (tested)
 */
import { UI } from '../../core/palette';
import type { GameView, Lang, SeedPriceView } from '../../core/types';
import { fmt, fmtFixed } from '../format';
import { moIcon } from './icons';
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

export function createSeedPriceSheet(root: HTMLElement, opts: SeedPriceSheetOpts): SeedPriceSheet {
  const layer = document.createElement('div');
  layer.className = 'mo-sp-layer';
  layer.hidden = true;
  const scrim = document.createElement('div');
  scrim.className = 'mo-sp-scrim';
  const sheet = document.createElement('div');
  sheet.className = 'mo-sp';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  layer.append(scrim, sheet);
  root.appendChild(layer);
  let open = false;
  let lastKey = '';

  function render(v: GameView): void {
    const p = v.seedPrice;
    const L = opts.lang();
    if (!p) {
      sheet.innerHTML = '';
      return;
    }
    const b = priceTerms(p, v.seedCost, L);
    const key = JSON.stringify([b, L]);
    if (key === lastKey) return;
    lastKey = key;
    const tiles = b.terms
      .map((t) => {
        return `<div class="mo-sp-tile k-${t.kind}${t.active ? ' on' : ''}">
          <span class="mo-sp-ti">${moIcon(ICON_OF[t.kind], 18)}</span>
          <b class="mo-sp-v">${t.value}</b>
          <span class="mo-sp-l">${t.label}</span>
        </div>`;
      })
      .join('');
    const dots: string[] = [];
    for (let i = 0; i < b.slots.free; i++) dots.push(`<i class="mo-dot${i < Math.min(b.slots.used, b.slots.free) ? ' on' : ''}"></i>`);
    for (let i = 0; i < Math.min(b.slots.over, 6); i++) dots.push('<i class="mo-dot over"></i>');
    const freeLeft = Math.max(0, b.slots.free - b.slots.used);
    const slotText =
      b.slots.over > 0 ? tr(MS.spSlotsOver, L, { n: b.slots.over }) : tr(MS.spSlotsFree, L, { n: freeLeft });
    sheet.setAttribute('aria-label', tr(MS.spTitle, L));
    sheet.innerHTML = `
      <div class="mo-sp-head">
        <span class="mo-sp-hi">${moIcon('tag', 22)}</span>
        <h3>${tr(MS.spTitle, L)}</h3>
        <button type="button" class="mo-sp-x" aria-label="${tr(MS.close, L)}">${moIcon('close', 20)}</button>
      </div>
      <div class="mo-sp-eq">${tiles}<span class="mo-sp-op eq" aria-hidden="true">=</span>
        <div class="mo-sp-tile k-total on"><span class="mo-sp-ti">${moIcon('essence', 18)}</span><b class="mo-sp-v">${b.total}</b><span class="mo-sp-l">${tr(MS.spTotal, L)}</span></div>
      </div>
      <div class="mo-sp-row ${b.slots.over > 0 ? 'over' : ''}">
        <span class="mo-sp-rl">${tr(MS.spSlots, L)}</span>
        <span class="mo-dots" aria-hidden="true">${dots.join('')}</span>
        <span class="mo-sp-rv">${slotText}</span>
      </div>
      ${
        b.freeSeeds > 0
          ? `<div class="mo-sp-row gift">${moIcon('gift', 18)}<span class="mo-sp-rv">${
              b.freeSeeds === 1 ? tr(MS.spFree1, L) : tr(MS.spFree, L, { n: b.freeSeeds })
            }</span></div>`
          : ''
      }
      <div class="mo-sp-row big">${moIcon('big', 18)}<span class="mo-sp-rv">${tr(MS.spBig, L, { m: b.bigMult })}</span></div>
      <p class="mo-sp-hint">${b.adviseDish ? tr(MS.spHint, L) : tr(MS.spHintRoom, L)}</p>
      ${b.adviseDish && opts.onSeeDish ? `<button type="button" class="mo-btn mo-sp-dish">${tr(MS.spDish, L)}</button>` : ''}
    `;
    sheet.querySelector('.mo-sp-x')?.addEventListener('click', () => api.close());
    sheet.querySelector('.mo-sp-dish')?.addEventListener('click', () => {
      api.close();
      opts.onSeeDish?.();
    });
  }

  scrim.addEventListener('click', () => api.close());
  const onKey = (e: KeyboardEvent) => {
    if (open && e.key === 'Escape') api.close();
  };
  window.addEventListener('keydown', onKey);

  const api: SeedPriceSheet = {
    el: layer,
    get isOpen() {
      return open;
    },
    open(view) {
      lastKey = '';
      render(view);
      layer.hidden = false;
      layer.classList.toggle('rm', !!opts.reduceMotion?.());
      open = true;
      requestAnimationFrame(() => layer.classList.add('show'));
      (sheet.querySelector('.mo-sp-x') as HTMLElement | null)?.focus();
    },
    update(view) {
      if (open) render(view);
    },
    close() {
      if (!open) return;
      open = false;
      layer.classList.remove('show');
      setTimeout(() => {
        if (!open) layer.hidden = true;
      }, 220);
      opts.onClose?.();
    },
    dispose() {
      window.removeEventListener('keydown', onKey);
      layer.remove();
    },
  };
  return api;
}

// ───────────────────────────── slot meter ─────────────────────────────

/**
 * Tiny meter for next to the seed button: a dot per cheap slot (filled per
 * creature), reddish dots past capacity, and an arrow when the price changes.
 */
export class SlotMeter {
  readonly el: HTMLElement;
  private dots: HTMLElement;
  private arrowEl: HTMLElement;
  private lastCost: number | null = null;
  private lastKey = '';
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private lang: () => Lang) {
    this.el = document.createElement('span');
    this.el.className = 'mo-meter';
    this.dots = document.createElement('span');
    this.dots.className = 'mo-dots';
    this.arrowEl = document.createElement('span');
    this.arrowEl.className = 'mo-meter-arrow';
    this.el.append(this.dots, this.arrowEl);
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
      let html = '';
      for (let i = 0; i < p.freeSlots; i++) html += `<i class="mo-dot${i < Math.min(p.used, p.freeSlots) ? ' on' : ''}"></i>`;
      for (let i = 0; i < Math.min(over, 4); i++) html += '<i class="mo-dot over"></i>';
      if (over > 4) html += `<em>+${over - 4}</em>`;
      this.dots.innerHTML = html;
      this.el.classList.toggle('over', over > 0);
      const L = this.lang();
      this.el.setAttribute(
        'aria-label',
        over > 0 ? tr(MS.spSlotsOver, L, { n: over }) : tr(MS.spSlotsFree, L, { n: Math.max(0, p.freeSlots - p.used) }),
      );
    }
    const cost = view.seedCost;
    if (this.lastCost !== null && Math.abs(cost - this.lastCost) > 1e-9) {
      const down = cost < this.lastCost;
      const L = this.lang();
      this.arrowEl.innerHTML = moIcon(down ? 'down' : 'up', 14);
      this.arrowEl.title = tr(down ? MS.cheaper : MS.pricier, L);
      this.arrowEl.className = `mo-meter-arrow show ${down ? 'down' : 'up'}`;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => (this.arrowEl.className = 'mo-meter-arrow'), 1800);
    }
    this.lastCost = cost;
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
