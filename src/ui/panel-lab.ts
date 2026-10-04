/** Laboratorio tab: essence upgrades with the ×1/×10/×max selector. */
import type { GameView } from '../core/types';
import { introEl, type Ctx, type Panel } from './ctx';
import { h, show } from './dom';
import { emptyState } from './empty';
import { t } from './i18n';
import { QtySelector, UpgradeList } from './upgrades';

export class LabPanel implements Panel {
  readonly el = h('section', { class: 'panel', role: 'tabpanel' });
  private scroll = h('div', { class: 'panel-scroll' });
  private qty: QtySelector;
  private list: UpgradeList;
  private empty = h('div');
  private introSlot = h('div');

  constructor(private ctx: Ctx) {
    this.qty = new QtySelector(ctx);
    this.list = new UpgradeList(ctx, 'lab');
    this.el.appendChild(this.scroll);
    this.build();
  }

  private build(): void {
    this.scroll.textContent = '';
    this.introSlot = h('div');
    const intro = introEl(this.ctx, 'lab');
    if (intro) this.introSlot.appendChild(intro);
    this.empty.textContent = '';
    this.empty.appendChild(emptyState('dish', t('tabLab'), t('labEmpty'), t('labEmptyHint')));
    this.scroll.append(
      this.introSlot,
      h('div', { class: 'toolbar' }, h('span', { class: 'lbl' }, t('buyQty')), h('span', { class: 'grow' }), this.qty.el),
      this.list.el,
      this.empty,
    );
  }

  rebuild(): void {
    this.qty.rebuild();
    this.list.rebuild();
    this.build();
  }

  update(v: GameView): void {
    this.qty.update();
    this.list.update(v);
    show(this.empty, this.list.count(v) === 0);
  }
}
