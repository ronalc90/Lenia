/**
 * Generic "why does this cost that?" components. Owner: "prices must be clear —
 * why they cost that and why they go up; otherwise it looks random/unfair".
 * Principle: no price ever changes without a visible reason.
 *
 *  - createPriceSheet(root)   a sheet that explains ANY price from a PriceExplain
 *                             object: the price as an equation with icons and
 *                             today's numbers, extra rows (slot dots, free items),
 *                             the rule in plain words and an optional action.
 *                             Seeds use it today (seedprice.ts); tree nodes or
 *                             upgrades can pass their own PriceExplain.
 *  - PriceTicker              the little ↑ amber / ↓ green arrow plus a one-line
 *                             reason chip (~2 s) shown next to a price whenever
 *                             it changes ("+1 criatura viva → ×1,25").
 */
import { moIcon, type MoIconName } from './icons';

export type PriceTone = 'info' | 'good' | 'warn' | 'bad' | 'grey';

export interface PriceTermView {
  icon: MoIconName;
  /** "2", "×1,25", "×3". */
  value: string;
  /** What this factor is, today ("2 vivas", "placa llena: 1 de más"). */
  label: string;
  /** Changes the price right now (inactive factors are shown dimmed at ×1). */
  active: boolean;
  tone?: PriceTone;
}

export interface PriceRowView {
  icon: MoIconName;
  /** Short label on the left ("Espacios baratos"); optional. */
  label?: string;
  text: string;
  tone?: PriceTone;
  /** Slot dots shown between label and text. */
  dots?: { free: number; used: number; over: number };
}

export interface PriceExplain {
  title: string;
  icon: MoIconName;
  /** Price as shown ("9", "120"). */
  total: string;
  totalLabel: string;
  totalIcon: MoIconName;
  /** Factors multiplied left to right (the first one is the base). */
  terms: PriceTermView[];
  rows?: PriceRowView[];
  /** The rule in plain words (always shown). */
  rule: string;
  /** A one-line advice under the rule (e.g. "Mejora la Placa"). */
  advice?: string;
  action?: { label: string; run(): void };
  closeLabel: string;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}

/** Slot dots markup (free slots filled per creature, extra ones reddish). */
export function dotsHtml(d: { free: number; used: number; over: number }, max = 6): string {
  const out: string[] = [];
  for (let i = 0; i < d.free; i++) out.push(`<i class="mo-dot${i < Math.min(d.used, d.free) ? ' on' : ''}"></i>`);
  for (let i = 0; i < Math.min(d.over, max); i++) out.push('<i class="mo-dot over"></i>');
  if (d.over > max) out.push(`<em>+${d.over - max}</em>`);
  return out.join('');
}

export function priceSheetHtml(x: PriceExplain): string {
  const tiles = x.terms
    .map(
      (t, i) =>
        `${i > 0 ? '<span class="mo-sp-op" aria-hidden="true">×</span>' : ''}<div class="mo-sp-tile${t.active ? ' on' : ''}${
          t.tone ? ` t-${t.tone}` : ''
        }">
          <span class="mo-sp-ti">${moIcon(t.icon, 18)}</span>
          <b class="mo-sp-v">${esc(t.value)}</b>
          <span class="mo-sp-l">${esc(t.label)}</span>
        </div>`,
    )
    .join('');
  const rows = (x.rows ?? [])
    .map(
      (r) =>
        `<div class="mo-sp-row${r.tone ? ` t-${r.tone}` : ''}">${moIcon(r.icon, 18)}${r.label ? `<span class="mo-sp-rl">${esc(r.label)}</span>` : ''}${
          r.dots ? `<span class="mo-dots" aria-hidden="true">${dotsHtml(r.dots)}</span>` : ''
        }<span class="mo-sp-rv">${esc(r.text)}</span></div>`,
    )
    .join('');
  return `
    <div class="mo-sp-head">
      <span class="mo-sp-hi">${moIcon(x.icon, 22)}</span>
      <h3>${esc(x.title)}</h3>
      <button type="button" class="mo-sp-x" aria-label="${esc(x.closeLabel)}">${moIcon('close', 20)}</button>
    </div>
    <div class="mo-sp-eq">${tiles}<span class="mo-sp-op eq" aria-hidden="true">=</span>
      <div class="mo-sp-tile k-total on"><span class="mo-sp-ti">${moIcon(x.totalIcon, 18)}</span><b class="mo-sp-v">${esc(x.total)}</b><span class="mo-sp-l">${esc(x.totalLabel)}</span></div>
    </div>
    <p class="mo-sp-rule">${esc(x.rule)}</p>
    ${rows}
    ${x.advice ? `<p class="mo-sp-hint">${esc(x.advice)}</p>` : ''}
    ${x.action ? `<button type="button" class="mo-btn mo-sp-act">${esc(x.action.label)}</button>` : ''}
  `;
}

export interface PriceSheet {
  readonly el: HTMLElement;
  readonly isOpen: boolean;
  open(x: PriceExplain): void;
  /** Refresh while open (no-op when closed or unchanged). */
  update(x: PriceExplain): void;
  close(): void;
  dispose(): void;
}

export function createPriceSheet(root: HTMLElement, opts: { reduceMotion?(): boolean; onClose?(): void } = {}): PriceSheet {
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
  let lastHtml = '';
  let current: PriceExplain | null = null;

  function render(x: PriceExplain): void {
    current = x;
    const html = priceSheetHtml(x);
    if (html === lastHtml) return;
    lastHtml = html;
    sheet.setAttribute('aria-label', x.title);
    sheet.innerHTML = html;
  }

  sheet.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.mo-sp-x')) api.close();
    else if (t.closest('.mo-sp-act')) {
      const run = current?.action?.run;
      api.close();
      run?.();
    }
  });
  scrim.addEventListener('click', () => api.close());
  const onKey = (e: KeyboardEvent) => {
    if (open && e.key === 'Escape') api.close();
  };
  window.addEventListener('keydown', onKey);

  const api: PriceSheet = {
    el: layer,
    get isOpen() {
      return open;
    },
    open(x) {
      lastHtml = '';
      render(x);
      layer.hidden = false;
      layer.classList.toggle('rm', !!opts.reduceMotion?.());
      open = true;
      requestAnimationFrame(() => layer.classList.add('show'));
      (sheet.querySelector('.mo-sp-x') as HTMLElement | null)?.focus();
    },
    update(x) {
      if (open) render(x);
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

export interface PriceReason {
  text: string;
  /** −1 cheaper, +1 pricier, 0 neutral. */
  dir: -1 | 0 | 1;
}

/** How long the reason chip stays next to the price (ms). */
export const REASON_MS = 2200;

/**
 * ↑/↓ arrow + one-line reason chip next to a price. `show(reason)` on every
 * change; the chip floats above its host (absolutely positioned) so the price
 * pill does not change width.
 */
export class PriceTicker {
  readonly el: HTMLElement;
  private arrow: HTMLElement;
  private chip: HTMLElement;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.el = document.createElement('span');
    this.el.className = 'mo-ticker';
    this.arrow = document.createElement('span');
    this.arrow.className = 'mo-meter-arrow';
    this.chip = document.createElement('span');
    this.chip.className = 'mo-why';
    this.chip.setAttribute('role', 'status');
    this.el.append(this.arrow, this.chip);
  }

  show(r: PriceReason): void {
    const cls = r.dir < 0 ? 'down' : r.dir > 0 ? 'up' : 'flat';
    this.arrow.innerHTML = r.dir ? moIcon(r.dir < 0 ? 'down' : 'up', 14) : '';
    this.arrow.className = `mo-meter-arrow ${r.dir ? `show ${cls}` : ''}`;
    this.chip.textContent = r.text;
    this.chip.className = `mo-why show ${cls}`;
    // Restart the CSS animations.
    void this.chip.offsetWidth;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.arrow.className = 'mo-meter-arrow';
      this.chip.className = 'mo-why';
    }, REASON_MS);
  }
}
