/**
 * Upgrade cards shared by the Laboratorio (essence) and Bestiario (samples) tabs.
 * One-line cards: name + level, effect, big buy button with cost on the right.
 * Locked ones go last, greyed, with their unlock condition.
 */
import type { BuyQty, GameView, UpgradeView } from '../core/types';
import { currencyAmount, currencyIcon, retrigger, type Ctx } from './ctx';
import { h, ic, reconcile, setAttr, setHTML, setStyle, setText, show, toggle } from './dom';
import { fmtClock, fmtShort } from './format';
import { icon } from './icons';
import { getLang, t, tx } from './i18n';

type Item = { kind: 'up'; u: UpgradeView } | { kind: 'locked'; u: UpgradeView } | { kind: 'hdr' };

interface Row {
  el: HTMLElement;
  u?: UpgradeView;
  name?: HTMLElement;
  icw?: HTMLElement;
  lvl?: HTMLElement;
  eff?: HTMLElement;
  desc?: HTMLElement;
  btn?: HTMLButtonElement;
  qty?: HTMLElement;
  cost?: HTMLElement;
  fill?: HTMLElement;
  hint?: HTMLElement;
  lastLevel?: number;
}

const COLORS = { essence: '#5BC0EB', samples: '#8AE234', genome: '#B892FF' };

/** Icon per upgrade id (game ids from src/game/defs.ts), with keyword fallbacks. */
const UP_ICONS: Record<string, string> = {
  dropper: 'seed',
  autoSeeder: 'bolt',
  culture: 'heart',
  calibrator: 'calibrate',
  stabilizer: 'shield',
  dish: 'target',
  incubator: 'speed',
  swimAffinity: 'swimmer',
  sessileAffinity: 'pulsing',
  colonyAffinity: 'colony',
  reserve: 'moon',
  fastPipette: 'essence',
  nutrient: 'sparkle',
  microscope: 'follow',
  cataloguing: 'journal',
  archive: 'print',
  marker: 'still',
};

export function upgradeIcon(id: string): string {
  if (UP_ICONS[id]) return UP_ICONS[id];
  const k = id.toLowerCase();
  const rules: [string, string][] = [
    ['drop', 'seed'], ['seed', 'bolt'], ['cult', 'heart'], ['calib', 'calibrate'], ['stab', 'shield'],
    ['incub', 'speed'], ['swim', 'swimmer'], ['sess', 'pulsing'], ['colon', 'colony'], ['reserv', 'moon'],
    ['pipet', 'essence'], ['nutri', 'sparkle'], ['micro', 'follow'], ['catal', 'journal'], ['archiv', 'print'],
    ['mark', 'still'], ['dish', 'target'], ['plate', 'target'],
  ];
  return rules.find(([kw]) => k.includes(kw))?.[1] ?? 'lab';
}

/** When maxed, show only the current value ("+30 % → +33 %" becomes "+30 %"). */
export function effectText(effect: string, maxed: boolean): string {
  if (!maxed) return effect;
  const i = effect.indexOf('→');
  return i > 0 ? effect.slice(0, i).trim() : effect;
}

export class UpgradeList {
  readonly el = h('div', { class: 'up-list' });
  private rows = new Map<string, Row>();
  private expanded = new Set<string>();
  private nextId: string | null = null;

  constructor(
    private ctx: Ctx,
    private tab: 'lab' | 'bestiary',
  ) {}

  /** Number of upgrades this list shows (for empty states). */
  count(v: GameView): number {
    return v.upgrades.filter((u) => u.tab === this.tab).length;
  }

  rebuild(): void {
    this.rows.clear();
    this.el.textContent = '';
  }

  update(v: GameView): void {
    const ups = v.upgrades.filter((u) => u.tab === this.tab);
    const items: Item[] = ups.filter((u) => u.unlocked).map((u) => ({ kind: 'up', u }) as Item);
    const locked = ups.filter((u) => !u.unlocked);
    if (locked.length) {
      items.push({ kind: 'hdr' });
      for (const u of locked) items.push({ kind: 'locked', u });
    }
    // The "next useful action": the first affordable upgrade gently pulses.
    const next = items.find((it) => it.kind === 'up' && it.u.affordable && !it.u.maxed);
    this.nextId = next && next.kind === 'up' ? next.u.id : null;
    reconcile(
      this.el,
      items,
      (it) => (it.kind === 'hdr' ? '#hdr' : it.kind === 'up' ? it.u.id : it.u.id + '#L'),
      this.rows,
      (it) => this.create(it),
      (row, it) => this.updateRow(row, it, v),
    );
  }

  private create(it: Item): Row {
    if (it.kind === 'hdr') {
      return { el: h('div', { class: 'sec-h' }, ic('lock', 24), h('span', null, t('lockedSection'))) };
    }
    if (it.kind === 'locked') {
      const name = h('div', { class: 'up-name' });
      const hint = h('div', { class: 'up-hint' });
      const el = h('div', { class: 'up-card locked' }, ic('lock', 24), h('div', { class: 'up-main' }, name, hint));
      return { el, name, hint };
    }
    const name = h('span', { class: 'up-name' });
    const lvl = h('span', { class: 'up-lvl' });
    const eff = h('div', { class: 'up-effect' });
    const desc = h('div', { class: 'up-desc', hidden: true });
    const fill = h('span', { class: 'b-fill' });
    const qty = h('span', { class: 'b-qty' });
    const cost = h('span', { class: 'b-cost' });
    const btn = h('button', { class: 'buy', type: 'button' }, fill, qty, cost);
    const main = h('div', { class: 'up-main' }, h('div', { class: 'up-title' }, name, lvl), eff, desc);
    const icw = h('span', { class: 'up-ic', html: icon(upgradeIcon(it.u.id), 20) });
    const el = h('div', { class: 'up-card', 'data-up': it.u.id }, icw, main, btn);
    const row: Row = { el, name, icw, lvl, eff, desc, btn, qty, cost, fill, u: it.u, lastLevel: it.u.level };
    main.addEventListener('click', () => {
      const id = row.u!.id;
      if (this.expanded.has(id)) this.expanded.delete(id);
      else this.expanded.add(id);
      show(desc, this.expanded.has(id));
    });
    this.bindBuy(row);
    return row;
  }

  /** Tap buys once; holding repeats (incremental-game staple). */
  private bindBuy(row: Row): void {
    const btn = row.btn!;
    let delay = 0;
    let rep = 0;
    const stop = () => {
      clearTimeout(delay);
      clearInterval(rep);
      delay = rep = 0;
    };
    const buyOnce = (): boolean => {
      const u = row.u!;
      if (u.maxed) return false;
      const ok = this.ctx.actions.buyUpgrade(u.id, this.ctx.buyQty as BuyQty);
      if (ok) {
        retrigger(row.el, 'bought');
        this.ctx.fxBurst(btn, COLORS[u.currency], '+' + (u.qty || 1));
        this.ctx.sound('buy');
        this.ctx.vibrate(8);
      } else if (!delay && !rep) {
        retrigger(btn, 'deny');
        this.ctx.sound('deny');
      }
      return ok;
    };
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      stop();
      if (!buyOnce()) return;
      delay = window.setTimeout(() => {
        rep = window.setInterval(() => {
          if (!buyOnce()) stop();
        }, 110);
      }, 420);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, stop);
    // Keyboard activation (click with detail 0); pointer clicks are handled above.
    btn.addEventListener('click', (e) => {
      if ((e as MouseEvent).detail === 0) buyOnce();
    });
  }

  private updateRow(row: Row, it: Item, v: GameView): void {
    if (it.kind === 'hdr') return;
    const u = it.u;
    row.u = u;
    if (it.kind === 'locked') {
      setText(row.name!, tx(u.name));
      setText(row.hint!, tx(u.unlockHint));
      return;
    }
    const lang = getLang();
    setText(row.name!, tx(u.name));
    let lvlText = u.maxLevel !== null ? `${t('level')} ${u.level}/${u.maxLevel}` : `${t('level')} ${u.level}`;
    // Time to afford at the current income (QA3 F13), on the level line so the card never grows.
    if (!u.maxed && !u.affordable && u.currency === 'essence' && v.essencePerSec > 0) {
      const eta = (u.cost - v.essence) / v.essencePerSec;
      if (eta > 0 && eta < 86_400) lvlText += ` · ⏱ ${fmtClock(eta)}`;
    }
    setText(row.lvl!, lvlText);
    if (row.lastLevel !== undefined && u.level > row.lastLevel) {
      retrigger(row.lvl!, 'pop');
      retrigger(row.el, 'lvlup');
    }
    row.lastLevel = u.level;
    setText(row.eff!, effectText(tx(u.effect), u.maxed));
    setText(row.desc!, tx(u.desc));
    show(row.desc!, this.expanded.has(u.id));

    const afford = u.affordable && !u.maxed;
    toggle(row.el, 'afford', afford);
    toggle(row.el, 'maxed', u.maxed);
    toggle(row.el, 'cur-samples', u.currency === 'samples');
    toggle(row.btn!, 'afford', afford);
    toggle(row.btn!, 'next', afford && u.id === this.nextId);
    toggle(row.btn!, 'maxed', u.maxed);
    if (u.maxed) {
      setText(row.qty!, '');
      setHTML(row.cost!, `${icon('check', 15)}${t('maxed')}`);
      setStyle(row.fill!, '--p', '0');
      setAttr(row.btn!, 'aria-label', `${tx(u.name)}: ${t('maxed')}`);
    } else {
      const q = Math.max(1, u.qty);
      setText(row.qty!, `+${q}`);
      setHTML(row.cost!, `${icon(currencyIcon(u.currency), 15)}${fmtShort(u.cost, lang)}`);
      const have = currencyAmount(v, u.currency);
      setStyle(row.fill!, '--p', u.cost > 0 ? Math.min(1, have / u.cost).toFixed(3) : '1');
      setAttr(row.btn!, 'aria-label', `${t('buy')} ${tx(u.name)} — ${fmtShort(u.cost, lang)}`);
    }
    setAttr(row.btn!, 'aria-disabled', afford ? null : 'true');
  }
}

/** ×1 / ×10 / ×max selector bound to ctx.buyQty. */
export class QtySelector {
  readonly el: HTMLElement;
  private btns: { q: BuyQty; b: HTMLButtonElement }[] = [];

  constructor(private ctx: Ctx) {
    this.el = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': t('buyQty') });
    this.build();
  }

  private build(): void {
    this.el.textContent = '';
    this.btns = ([1, 10, 'max'] as BuyQty[]).map((q) => {
      const b = h('button', {
        type: 'button',
        role: 'radio',
        text: q === 'max' ? t('qtyMax') : `×${q}`,
        onclick: () => {
        this.ctx.sound('toggle');
        this.ctx.setBuyQty(q);
      },
      });
      this.el.appendChild(b);
      return { q, b };
    });
    this.update();
  }

  rebuild(): void {
    this.build();
  }

  update(): void {
    for (const { q, b } of this.btns) {
      toggle(b, 'on', q === this.ctx.buyQty);
      setAttr(b, 'aria-checked', q === this.ctx.buyQty ? 'true' : 'false');
    }
  }
}
