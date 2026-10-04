/**
 * Genoma tab: the 3-branch tree (vertical chains of node cards) and the
 * Extinguish button fixed at the bottom (press-and-hold 1.5 s with a ring).
 */
import type { GameView, GenomeNodeView } from '../core/types';
import { introEl, retrigger, type Ctx, type Panel } from './ctx';
import { append, h, ic, reconcile, setAttr, setDisabled, setHTML, setStyle, setText, show, toggle } from './dom';
import { fmt, fmtShort } from './format';
import { getLang, t, tx, type StrKey } from './i18n';
import { icon } from './icons';

const BRANCHES: { id: GenomeNodeView['branch']; label: StrKey; icon: string }[] = [
  { id: 'rules', label: 'branchRules', icon: 'layers' },
  { id: 'heritage', label: 'branchHeritage', icon: 'shield' },
  { id: 'fauna', label: 'branchFauna', icon: 'bestiary' },
];

const HOLD_MS = 1500;

interface NodeRow {
  el: HTMLButtonElement;
  icw: HTMLElement;
  name: HTMLElement;
  cost: HTMLElement;
  n?: GenomeNodeView;
  owned?: boolean;
}

export class GenomePanel implements Panel {
  readonly el = h('section', { class: 'panel', role: 'tabpanel' });
  private scroll = h('div', { class: 'panel-scroll' });
  private foot = h('div', { class: 'gn-foot' });
  private amount = h('div', { class: 'gn-amount' });
  private cols = new Map<string, HTMLElement>();
  private rows = new Map<string, Map<string, NodeRow>>();
  private detail = h('div', { class: 'gn-detail', hidden: true });
  private selected: string | null = null;
  private detailKey = '';
  // Extinguish
  private ext!: HTMLButtonElement;
  private extRing!: HTMLElement;
  private extTitle!: HTMLElement;
  private extSub!: HTMLElement;
  private extG1!: HTMLElement;
  private extG2!: HTMLElement;
  private holdStart = 0;
  private holdRaf = 0;

  constructor(private ctx: Ctx) {
    this.el.append(this.scroll, this.foot);
    this.build();
  }

  private build(): void {
    this.scroll.textContent = '';
    this.foot.textContent = '';
    const intro = introEl(this.ctx, 'genome');
    if (intro) this.scroll.appendChild(intro);
    this.scroll.appendChild(
      h(
        'div',
        { class: 'gn-head' },
        ic('genome', 24),
        h('div', null, this.amount, h('div', { class: 'gn-sub' }, t('genomeBonus'))),
      ),
    );
    const tree = h('div', { class: 'tree' });
    this.cols.clear();
    this.rows.clear();
    for (const b of BRANCHES) {
      const list = h('div', { class: 'branch-list' });
      tree.appendChild(h('div', { class: 'branch' }, h('div', { class: 'branch-h' }, t(b.label)), list));
      this.cols.set(b.id, list);
      this.rows.set(b.id, new Map());
    }
    this.scroll.append(tree, this.detail);
    this.detailKey = '';

    // Extinguish button
    this.extRing = h('span', { class: 'ext-ring' }, ic('rebirth', 24));
    this.extTitle = h('div', { class: 'ext-title' });
    this.extSub = h('div', { class: 'ext-sub' });
    this.extG1 = h('div', { class: 'g1' });
    this.extG2 = h('div', { class: 'g2' });
    this.ext = h(
      'button',
      { type: 'button', class: 'ext-btn' },
      h('span', { class: 'hold' }),
      this.extRing,
      h('div', { class: 'ext-txt' }, this.extTitle, this.extSub),
      h('div', { class: 'ext-gain' }, this.extG1, this.extG2),
    );
    this.bindHold();
    this.foot.appendChild(this.ext);
  }

  rebuild(): void {
    this.build();
  }

  private bindHold(): void {
    const b = this.ext;
    const start = () => {
      if (b.disabled || this.holdStart) return;
      this.holdStart = performance.now();
      b.classList.add('holding');
      this.ctx.sound('hold');
      this.ctx.vibrate(12);
      const tick = () => {
        const p = Math.min(1, (performance.now() - this.holdStart) / HOLD_MS);
        setStyle(this.extRing, '--hp', p.toFixed(3));
        setStyle(b, '--hp', p.toFixed(3));
        if (p >= 1) {
          this.cancelHold();
          this.ctx.sound('confirm');
          this.ctx.vibrate([30, 40, 60]);
          this.ctx.deps.onExtinguish();
          return;
        }
        this.holdRaf = requestAnimationFrame(tick);
      };
      this.holdRaf = requestAnimationFrame(tick);
    };
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      start();
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => this.cancelHold());
    b.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
        e.preventDefault();
        start();
      }
    });
    b.addEventListener('keyup', (e) => {
      if (e.key === 'Enter' || e.key === ' ') this.cancelHold();
    });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private cancelHold(): void {
    if (this.holdRaf) cancelAnimationFrame(this.holdRaf);
    this.holdRaf = 0;
    this.holdStart = 0;
    this.ext.classList.remove('holding');
    setStyle(this.extRing, '--hp', '0');
    setStyle(this.ext, '--hp', '0');
  }

  update(v: GameView): void {
    const lang = getLang();
    setHTML(this.amount, `${fmt(v.genome, lang)} <span style="font-size:.8125rem;color:var(--dim);font-weight:600;font-family:var(--font)">${t('genome')}</span>`);
    for (const b of BRANCHES) {
      const nodes = v.genomeNodes.filter((n) => n.branch === b.id);
      reconcile(
        this.cols.get(b.id)!,
        nodes,
        (n) => n.id,
        this.rows.get(b.id)!,
        (n) => this.makeNode(n),
        (row, n) => this.updateNode(row, n, b.icon),
      );
    }
    this.updateDetail(v);
    this.updateExt(v);
  }

  /** Flash a node after purchase (bus genomeBought). */
  flash(id: string): void {
    for (const m of this.rows.values()) {
      const r = m.get(id);
      if (r) retrigger(r.el, 'bought');
    }
  }

  private makeNode(n: GenomeNodeView): NodeRow {
    const icw = h('span', { class: 'g-ic' });
    const name = h('span', { class: 'g-name' });
    const cost = h('span', { class: 'g-cost' });
    const el = h('button', { type: 'button', class: 'gnode' }, icw, name, cost);
    const row: NodeRow = { el, icw, name, cost, n };
    el.addEventListener('click', () => {
      this.selected = this.selected === row.n!.id ? null : row.n!.id;
      this.detailKey = '';
      this.update(this.ctx.view);
      if (this.selected) {
        requestAnimationFrame(() => this.detail.scrollIntoView({ block: 'nearest', behavior: this.ctx.view.settings.reduceMotion ? 'auto' : 'smooth' }));
      }
    });
    return row;
  }

  private updateNode(row: NodeRow, n: GenomeNodeView, branchIcon: string): void {
    row.n = n;
    setText(row.name, tx(n.name));
    const iconName = n.owned ? 'check' : n.available ? branchIcon : 'lock';
    setHTML(row.icw, icon(iconName, 18));
    setHTML(row.cost, n.owned ? `${icon('check', 13)}${t('owned')}` : `${icon('genome', 13)}${fmtShort(n.cost, getLang())}`);
    toggle(row.el, 'owned', n.owned);
    toggle(row.el, 'afford', !n.owned && n.available && n.affordable);
    toggle(row.el, 'unavail', !n.owned && !n.available);
    toggle(row.el, 'sel', this.selected === n.id);
    if (row.owned === false && n.owned) retrigger(row.el, 'bought');
    row.owned = n.owned;
    setAttr(row.el, 'aria-pressed', this.selected === n.id ? 'true' : 'false');
  }

  private updateDetail(v: GameView): void {
    const n = this.selected ? v.genomeNodes.find((x) => x.id === this.selected) : undefined;
    if (!n) {
      show(this.detail, false);
      return;
    }
    const key = `${n.id}|${n.owned}|${n.available}|${n.affordable}|${getLang()}`;
    show(this.detail, true);
    if (key === this.detailKey) return;
    this.detailKey = key;
    this.detail.textContent = '';
    const missing = n.requires
      .map((id) => v.genomeNodes.find((x) => x.id === id))
      .filter((x): x is GenomeNodeView => !!x && !x.owned)
      .map((x) => tx(x.name));
    const btn = h('button', { type: 'button', class: 'btn block ' + (n.owned ? 'ghost' : 'violet') });
    if (n.owned) btn.append(ic('check', 24), t('owned'));
    else btn.append(ic('genome', 24), `${t('buy')} · `, h('span', { class: 'mono' }, fmt(n.cost, getLang())));
    setDisabled(btn, n.owned || !n.available || !n.affordable);
    btn.addEventListener('click', () => {
      if (this.ctx.actions.buyGenomeNode(n.id)) {
        this.ctx.sound('buy');
        this.ctx.fxBurst(btn, '#B892FF');
        this.ctx.vibrate([10, 30, 10]);
      }
    });
    append(this.detail, [
      h('h4', null, tx(n.name)),
      h('p', null, tx(n.desc)),
      missing.length ? h('div', { class: 'req' }, `${t('requires')}: ${missing.join(', ')}`) : null,
      btn,
    ]);
  }

  private updateExt(v: GameView): void {
    const e = v.extinction;
    const lang = getLang();
    if (!this.holdStart) setDisabled(this.ext, !e.available);
    setText(this.extTitle, t('extinguish'));
    setText(this.extSub, e.available ? t('holdToConfirm') : tx(e.requirement) || t('extinctionLocked'));
    setHTML(this.extG1, `+${fmt(e.genomeGain, lang)}${icon('genome', 16)}`);
    setText(this.extG2, `${t('gainIn10')}: +${fmt(e.gainIn10Min, lang)}`);
    show(this.extG2, e.available || e.gainIn10Min > 0);
  }
}
