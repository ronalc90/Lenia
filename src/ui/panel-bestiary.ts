/**
 * Bestiario tab: sample upgrades on top, then the 3-per-row portrait grid with
 * behaviour/rarity filter chips and a "Descubiertas N / total" counter (total = species the Worlds grow).
 */
import type { Behavior, GameView, Rarity, SpeciesView } from '../core/types';
import { BEHAVIOR_COLOR } from '../core/palette';
import { introEl, type Ctx, type Panel } from './ctx';
import { h, ic, reconcile, setAttr, setText, show, toggle } from './dom';
import { fmtFixed } from './format';
import { BEHAVIORS, behaviorName, getLang, RARITIES, rarityName, t } from './i18n';
import { icon } from './icons';
import { portraitURL } from './portrait';
import { QtySelector, UpgradeList } from './upgrades';
import { TOTAL_WORLD_SPECIES } from '../game/worlds';

/** Species cards per page in the grid. */
const PAGE = 60;

interface Card {
  el: HTMLElement;
  portrait?: HTMLElement;
  img?: HTMLImageElement;
  name?: HTMLElement;
  /** Small italic scientific line (SpeciesView.scientificName). */
  sci?: HTMLElement;
  meta?: HTMLElement;
  dot?: HTMLElement;
  sp?: SpeciesView;
}

type GridItem = { kind: 'sp'; s: SpeciesView } | { kind: 'unknown'; i: number };

export class BestiaryPanel implements Panel {
  readonly el = h('section', { class: 'panel', role: 'tabpanel' });
  private scroll = h('div', { class: 'panel-scroll' });
  private qty: QtySelector;
  private ups: UpgradeList;
  private upsHead = h('div', { class: 'sec-h' });
  private upsWrap = h('div');
  private count = h('span', { class: 'count' });
  private chips = h('div', { class: 'chips', role: 'toolbar' });
  private grid = h('div', { class: 'sp-grid' });
  private empty = h('div', { class: 'empty' });
  private cards = new Map<string, Card>();
  private fBehavior: Behavior | null = null;
  private fRarity: Rarity | null = null;
  private chipKey = '';
  /** Cards rendered (grows by PAGE with "Show more"). */
  private limit = PAGE;
  private more = h('button', { type: 'button', class: 'btn block sp-more', hidden: true });

  constructor(private ctx: Ctx) {
    this.more.addEventListener('click', () => {
      this.limit += PAGE;
      this.update(this.ctx.view);
    });
    this.qty = new QtySelector(ctx);
    this.ups = new UpgradeList(ctx, 'bestiary');
    this.el.appendChild(this.scroll);
    this.build();
  }

  private build(): void {
    this.scroll.textContent = '';
    const intro = introEl(this.ctx, 'bestiary');
    this.upsHead = h('div', { class: 'sec-h' }, ic('samples', 24), h('span', { class: 'grow' }, t('bestiaryUpgrades')), this.qty.el);
    this.upsWrap = h('div', null, this.upsHead, this.ups.el);
    // The player's creatures first (QA2 H-14: "look at your specimen"), the Samples upgrades after.
    // "Comportamientos": what swimming, spinning… mean and what each one earns (Behaviour Guide).
    let guide: HTMLElement | null = null;
    if (this.ctx.deps.onBehaviorInfo) {
      guide = h('button', { type: 'button', class: 'bh-guide', 'aria-label': t('behaviorGuideAria') }, ic('info', 16), t('behaviorGuide'));
      guide.addEventListener('click', () => this.ctx.deps.onBehaviorInfo?.(this.fBehavior));
    }
    this.scroll.append(
      ...(intro ? [intro] : []),
      h('div', { class: 'sec-h' }, ic('bestiary', 24), h('span', { class: 'grow' }, t('registered')), this.count, guide),
      this.chips,
      this.grid,
      this.more,
      this.empty,
      this.upsWrap,
    );
    this.chipKey = '';
  }

  rebuild(): void {
    this.qty.rebuild();
    this.ups.rebuild();
    this.cards.clear();
    this.grid.textContent = '';
    this.build();
  }

  update(v: GameView): void {
    this.qty.update();
    const hasUps = this.ups.count(v) > 0;
    show(this.upsWrap, hasUps);
    if (hasUps) this.ups.update(v);

    // Out of every species some World grows (CLARIDAD J-79); a stray beyond them just counts up.
    const found = v.species.length;
    setText(this.count, found <= TOTAL_WORLD_SPECIES ? `${found} / ${TOTAL_WORLD_SPECIES}` : String(found));
    this.updateChips(v);

    const list = v.species.filter(
      (s) => (!this.fBehavior || s.behavior === this.fBehavior) && (!this.fRarity || s.rarity === this.fRarity),
    );
    const filtering = this.fBehavior !== null || this.fRarity !== null;
    // Pages of cards: a 5,000-species save must not build 5,000 cards every update (QA1 #14).
    const shown = list.length > this.limit ? list.slice(0, this.limit) : list;
    const items: GridItem[] = shown.map((s) => ({ kind: 'sp', s }));
    const rest = list.length - shown.length;
    show(this.more, rest > 0);
    if (rest > 0) setText(this.more, t('showMore', { n: String(Math.min(rest, PAGE)) }));
    if (!filtering && rest === 0) {
      // Silhouettes invite discovery: complete the row, plus one more row.
      const n = ((3 - (list.length % 3)) % 3) + 3;
      for (let i = 0; i < n; i++) items.push({ kind: 'unknown', i });
    }
    reconcile(
      this.grid,
      items,
      (it) => (it.kind === 'sp' ? it.s.id : '?' + it.i),
      this.cards,
      (it) => this.createCard(it),
      (c, it) => this.updateCard(c, it),
    );
    setText(this.empty, v.species.length === 0 ? t('emptyBestiary') : t('noMatches'));
    show(this.empty, list.length === 0 && (filtering || v.species.length === 0));
    if (v.species.length === 0) show(this.grid, true);
  }

  private updateChips(v: GameView): void {
    const behaviors = BEHAVIORS.filter((b) => v.behaviorsSeen.includes(b) || v.species.some((s) => s.behavior === b));
    const rarities = RARITIES.filter((r) => v.species.some((s) => s.rarity === r));
    const key = `${getLang()}|${behaviors.join(',')}|${rarities.join(',')}|${this.fBehavior}|${this.fRarity}`;
    if (key === this.chipKey) return;
    this.chipKey = key;
    // Drop filters that no longer apply.
    if (this.fBehavior && !behaviors.includes(this.fBehavior)) this.fBehavior = null;
    if (this.fRarity && !rarities.includes(this.fRarity)) this.fRarity = null;
    this.chips.textContent = '';
    show(this.chips, v.species.length > 0);
    const chip = (label: string, on: boolean, onClick: () => void, iconName?: string, color?: string) => {
      const b = h('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false' });
      if (iconName) {
        const i = ic(iconName, 24);
        if (color) i.style.color = color;
        b.appendChild(i);
      }
      b.append(label);
      b.addEventListener('click', () => {
        onClick();
        this.chipKey = '';
        this.update(this.ctx.view);
      });
      this.chips.appendChild(b);
    };
    chip(t('all'), !this.fBehavior && !this.fRarity, () => {
      this.fBehavior = null;
      this.fRarity = null;
    });
    for (const b of behaviors)
      chip(behaviorName(b), this.fBehavior === b, () => (this.fBehavior = this.fBehavior === b ? null : b), b, `var(--bl-beh-${b}, ${BEHAVIOR_COLOR[b]})`);
    if (rarities.length > 1) {
      this.chips.appendChild(h('span', { class: 'chip-sep' }));
      for (const r of rarities) chip(rarityName(r), this.fRarity === r, () => (this.fRarity = this.fRarity === r ? null : r));
    }
  }

  private createCard(it: GridItem): Card {
    if (it.kind === 'unknown') {
      const el = h(
        'div',
        { class: 'sp unknown', 'aria-hidden': 'true' },
        h('div', { class: 'portrait unknown' }, '?'),
        h('div', { class: 'sp-name' }, t('unknownSpecies')),
        h('div', { class: 'sp-sci' }, ' '),
        h('div', { class: 'sp-meta' }, ' '),
      );
      return { el };
    }
    const portrait = h('div', { class: 'portrait' });
    const img = h('img', { alt: '', draggable: 'false' });
    const name = h('div', { class: 'sp-name' });
    // Always present (a blank line until there is a Latin name): every card keeps the same height.
    const sci = h('div', { class: 'sp-sci' }, ' ');
    const meta = h('div', { class: 'sp-meta' });
    const dot = h('span', { class: 'dot pulse', hidden: true });
    const el = h('button', { type: 'button', class: 'sp' }, portrait, name, sci, meta, dot);
    const card: Card = { el, portrait, img, name, sci, meta, dot, sp: it.s };
    el.addEventListener('click', () => this.ctx.openSpecies(card.sp!.id));
    return card;
  }

  private updateCard(c: Card, it: GridItem): void {
    if (it.kind === 'unknown') return;
    const s = it.s;
    c.sp = s;
    const p = c.portrait!;
    p.className = `portrait r-${s.rarity}`;
    if (s.portrait) {
      const url = portraitURL(s.portrait);
      if (c.img!.getAttribute('src') !== url) c.img!.src = url;
      if (c.img!.parentElement !== p) {
        p.textContent = '';
        p.appendChild(c.img!);
      }
    } else if (!p.querySelector('.noimg')) {
      p.textContent = '';
      p.appendChild(h('span', { class: 'noimg' }));
    }
    // With species identity (a scientific line exists) the plain name is the label, the Latin one below.
    const named = s.scientificName !== undefined;
    const display = named ? s.name : (s.catalogName ?? s.name);
    setText(c.name!, display);
    toggle(c.name!, 'latin', !named && !!s.catalogName);
    const sci = named && s.scientificName && s.scientificName !== s.name ? s.scientificName : '';
    setText(c.sci!, sci || ' ');
    setAttr(c.el, 'title', sci || null);
    if (s.hue !== undefined) c.el.style.setProperty('--sp', `hsl(${Math.round(s.hue)} 70% 60%)`);
    toggle(c.el, 'has-sp', s.hue !== undefined);
    const metaKey = `${s.behavior}|${s.mult}|${getLang()}`;
    if (c.meta!.dataset.k !== metaKey) {
      c.meta!.dataset.k = metaKey;
      // The theme's behaviour colour (AA on paper too, docs/ARTE.md §3).
      const col = s.behavior ? `var(--bl-beh-${s.behavior}, ${BEHAVIOR_COLOR[s.behavior]})` : 'var(--dim)';
      c.meta!.innerHTML = `<span class="icw" style="color:${col}">${icon(s.behavior ?? 'unknown', 14)}</span>×${fmtFixed(s.mult, 1, getLang())}`;
    }
    show(c.dot!, s.isNew);
    setAttr(c.el, 'aria-label', `${display}, ${rarityName(s.rarity)}, ${behaviorName(s.behavior)}`);
  }
}
