/**
 * The Store modal: tabs Paletas · Placa · Efectos · Música · Perfil · Mecenas.
 *
 *   const ui = openStore({ root: document.body, store, lang: 'es', playerName: 'Ada', playerTag: '0420' });
 *
 * Buying is always two deliberate steps (card → detail → buy) and then the provider's own checkout.
 * Every purchase surface repeats the fair-play promise; nothing here changes gameplay.
 */
import type { Lang } from '../../core/types';
import { ACHIEVEMENT_TEXT } from '../../game/content';
import {
  BADGES,
  BUNDLES,
  DISHES,
  FAIR_PLAY_NOTE,
  FRAMES,
  HALOS,
  MUSICS,
  NAME_COLORS,
  PALETTES,
  PRICE_USD,
  RARITY_COLOR,
  RARITY_NAME,
  SLOT_NAME,
  SPARKS,
  SUBSCRIPTIONS,
  SUPPORTER_PALETTES,
  SUPPORTER_PERKS,
  TRAILS,
  bundleValueUSD,
  bundlesContaining,
  cosmeticById,
  formatUSD,
  inEarlyAccess,
  itemById,
  supporterPaletteFor,
  type AmbiencePreset,
  type BundleItem,
  type CosmeticItem,
  type StoreItem,
  type StoreTab,
} from '../../store/catalog';
import { paletteCss } from '../../store/apply';
import type { Result } from '../../store/providers/types';
import type { StoreController } from '../../store/store';
import { el, ensureStyles, iconEl, namePlate, swatch, toaster, type Toaster } from './dom';
import { sicon } from './icons';
import { createMusicDemo, type MusicDemo } from './music-demo';
import {
  PreviewLoop,
  dishPreview,
  drawCreature,
  haloPreview,
  musicPreview,
  palettePreview,
  sparkPreview,
  trailPreview,
  dishBackground,
  type DrawFn,
  type Look,
  type PreviewHandle,
} from './preview';
import { drawSpark } from '../../store/draw';
import css from './store.css?inline';
import { monthName, shortDate, tr, tx, type StoreStr } from './strings';

export interface StoreUIOptions {
  /** Element the modal mounts into (full-screen container or document.body). */
  root: HTMLElement;
  store: StoreController;
  lang: Lang;
  playerName?: string;
  playerTag?: string;
  tab?: StoreTab;
  reduceMotion?: boolean;
  legal?: { terms: string; privacy: string; refunds?: string };
  /** Audition an ambience with the real engine (null = stop). Without it a small built-in synth plays. */
  previewMusic?: (preset: AmbiencePreset | null) => void;
  /** Open the wardrobe (Vestidor) from the header button. */
  openWardrobe?: () => void;
  sound?: (name: 'tap' | 'confirm' | 'deny') => void;
  onClose?: () => void;
}

export interface StoreUIHandle {
  readonly el: HTMLElement;
  setTab(tab: StoreTab): void;
  /** Open the detail sheet of an item. */
  show(itemId: string): void;
  close(): void;
}

const TABS: { id: StoreTab; label: StoreStr; icon: string }[] = [
  { id: 'palettes', label: 'tabPalettes', icon: 'palette' },
  { id: 'dish', label: 'tabDish', icon: 'dish' },
  { id: 'effects', label: 'tabEffects', icon: 'sparkle' },
  { id: 'music', label: 'tabMusic', icon: 'music' },
  { id: 'profile', label: 'tabProfile', icon: 'user' },
  { id: 'supporter', label: 'tabSupporter', icon: 'heart' },
];

const MUSIC_COLORS: Record<string, [string, string]> = {
  'music.nightlab': ['#5BC0EB', '#7A6CFF'],
  'music.patience': ['#B892FF', '#5BC0EB'],
  'music.deepsea': ['#2EA6C8', '#3A5BD9'],
  'music.greenhouse': ['#8AE234', '#F2C14E'],
  'music.musicbox': ['#FFD166', '#FF9EC8'],
  'music.lofi': ['#FF9E8A', '#B892FF'],
};

const MODE_NAME: Record<string, { es: string; en: string }> = {
  dorian: { es: 'Dórico', en: 'Dorian' },
  aeolian: { es: 'Eólico', en: 'Aeolian' },
  lydian: { es: 'Lidio', en: 'Lydian' },
  mixolydian: { es: 'Mixolidio', en: 'Mixolydian' },
  ionian: { es: 'Mayor', en: 'Major' },
  pentatonicMinor: { es: 'Pentatónica', en: 'Pentatonic' },
  pentatonicMajor: { es: 'Pentatónica mayor', en: 'Major pentatonic' },
};
const KEY_NAME = ['Do', 'Do♯', 'Re', 'Mi♭', 'Mi', 'Fa', 'Fa♯', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];
const KEY_NAME_EN = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export function openStore(o: StoreUIOptions): StoreUIHandle {
  ensureStyles(css);
  const { store, lang } = o;
  const ent = store.entitlements;
  const reduceMotion = o.reduceMotion ?? (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const loop = new PreviewLoop(reduceMotion);
  const handles: PreviewHandle[] = [];
  const refreshers = new Set<() => void>();
  const demo: MusicDemo | null = o.previewMusic ? null : createMusicDemo();
  let playingMusic: string | null = null;
  let tab: StoreTab = o.tab ?? 'palettes';
  let plan: 'month' | 'year' = 'month';
  const sound = (n: 'tap' | 'confirm' | 'deny') => o.sound?.(n);
  const prevFocus = document.activeElement as HTMLElement | null;

  const look = (): Look => {
    const p = ent.equipped('palette');
    return { paletteId: p.id, palette: p.data, dish: ent.equippedData('dish') };
  };

  // ───────────── shell ─────────────
  const toast: Toaster = toaster();
  const wrap = el('div', { class: 'bst bst-wrap' });
  const scrim = el('div', { class: 'bst-scrim', onclick: () => close() });
  const modal = el('section', { class: 'bst-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'bst-title', tabindex: '-1' });
  const provider = store.provider;
  if (store.flags.mock || provider?.testMode) {
    modal.append(el('div', { class: 'bst-test', role: 'note' }, iconEl('info', 16), tr(store.flags.mock ? 'testBanner' : 'sandboxBanner', lang)));
  }
  const head = el(
    'header',
    { class: 'bst-head' },
    el('div', { class: 'bst-crest', html: sicon('bag', 22) }),
    el(
      'div',
      { class: 'bst-titles' },
      el('h2', { id: 'bst-title' }, el('span', { class: 'long', text: tr('storeTitle', lang) }), el('span', { class: 'short', text: tr('storeShort', lang) })),
      el('p', { class: 'bst-promise' }, iconEl('shield', 14), tr('cosmeticOnly', lang)),
    ),
    o.openWardrobe
      ? el('button', { class: 'bst-headbtn', type: 'button', 'aria-label': tr('wardrobe', lang), onclick: () => (sound('tap'), o.openWardrobe!()) }, iconEl('hanger', 20), el('span', { text: tr('wardrobe', lang) }))
      : null,
    el('button', { class: 'bst-close', type: 'button', 'aria-label': tr('close', lang), html: sicon('close', 22), onclick: () => close() }),
  );
  const tabsEl = el('nav', { class: 'bst-tabs', role: 'tablist' });
  const tabBtns = new Map<StoreTab, HTMLButtonElement>();
  for (const t of TABS) {
    const b = el(
      'button',
      { class: `bst-tab${t.id === 'supporter' ? ' gold' : ''}`, type: 'button', role: 'tab', 'aria-selected': 'false', onclick: () => setTab(t.id) },
      iconEl(t.icon, 18),
      el('span', { text: tr(t.label, lang) }),
    );
    tabBtns.set(t.id, b);
    tabsEl.append(b);
  }
  const body = el('div', { class: 'bst-body' });
  const panes = new Map<StoreTab, HTMLElement>();

  const restoreBtn = el('button', { class: 'bst-btn ghost small', type: 'button' }, iconEl('restore', 18), el('span', { text: tr('restore', lang) }));
  restoreBtn.disabled = !provider;
  restoreBtn.addEventListener('click', async () => {
    sound('tap');
    restoreBtn.disabled = true;
    restoreBtn.classList.add('busy');
    const r = await store.restore();
    restoreBtn.disabled = false;
    restoreBtn.classList.remove('busy');
    if (r.ok) toast.show(r.granted.length ? tr('restoredNew', lang, { n: r.granted.length }) : tr('restored', lang), 'good');
    else toast.show(tr(r.reason === 'network' ? 'offline' : r.reason === 'unavailable' ? 'unavailable' : 'failed', lang), 'warn');
  });
  const legal = o.legal ?? { terms: '#terms', privacy: '#privacy', refunds: '#refunds' };
  const links = el(
    'div',
    { class: 'bst-links' },
    el('a', { href: legal.terms, target: '_blank', rel: 'noopener', text: tr('terms', lang) }),
    el('a', { href: legal.privacy, target: '_blank', rel: 'noopener', text: tr('privacy', lang) }),
    legal.refunds ? el('a', { href: legal.refunds, target: '_blank', rel: 'noopener', text: tr('refunds', lang) }) : null,
  );
  const foot = el(
    'footer',
    { class: 'bst-foot' },
    el('div', { class: 'bst-foot-row' }, restoreBtn, links),
    el('p', { class: 'bst-seller', text: `${provider?.seller ? tx(provider.seller, lang) + ' ' : ''}${tr('pricesNote', lang)}` }),
  );
  const detail = el('div', { class: 'bst-detail', hidden: true });
  modal.append(head, tabsEl, body, detail, toast.el);
  wrap.append(scrim, modal);
  o.root.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('in'));
  modal.focus({ preventScroll: true });

  // ───────────── helpers ─────────────
  const priceOf = (id: string) => store.priceLabel(id, lang) ?? '';

  function addPreview(canvas: HTMLCanvasElement, draw: DrawFn, usesField = true): void {
    handles.push(loop.add(canvas, draw, usesField));
  }

  function lockText(it: StoreItem): string | null {
    if (it.kind !== 'cosmetic') return null;
    const u = it.unlock;
    if (u.type === 'achievement') {
      const a = ACHIEVEMENT_TEXT[u.achievement];
      return a ? tr('lockAchievement', lang, { name: tx(a.name, lang) }) : tr('lockAchievementGeneric', lang);
    }
    if (u.type === 'bundle') return tr('lockBundle', lang, { name: bundlesContaining(it.id).map((b) => tx(b.name, lang)).join(', ') });
    if (u.type === 'subscription') return tr('lockSubscription', lang);
    if (u.type === 'rotation') return tr('lockRotation', lang, { month: monthName(u.month, lang) });
    return null;
  }

  function tagFor(it: StoreItem): { text: string; cls: string } | null {
    if (inEarlyAccess(it, Date.now())) return { text: tr('earlyTag', lang), cls: 'gold' };
    if (it.kind !== 'cosmetic') return null;
    switch (it.unlock.type) {
      case 'achievement':
        return { text: tr('achievementTag', lang), cls: 'good' };
      case 'subscription':
        return { text: tr('supporterTag', lang), cls: 'gold' };
      case 'rotation':
        return { text: tr('monthlyTag', lang), cls: 'gold' };
      case 'bundle':
        return { text: tr('bundleTag', lang), cls: 'gold' };
    }
    if (it.since && Date.now() - Date.parse(it.since) < 30 * 86_400_000) return { text: tr('newTag', lang), cls: 'accent' };
    return null;
  }

  /** Bottom-right state of a card: price, Tuya, Equipada, lock. */
  function stateChip(it: StoreItem): HTMLElement {
    const chip = el('span', { class: 'bst-state' });
    const update = () => {
      chip.className = 'bst-state';
      chip.textContent = '';
      if (it.kind === 'cosmetic') {
        if (ent.isEquipped(it.id)) {
          chip.classList.add('equipped');
          chip.append(iconEl('check', 14), tr('equipped', lang));
          return;
        }
        if (ent.isOwned(it.id)) {
          chip.classList.add('owned');
          chip.append(tr('owned', lang));
          return;
        }
        if (it.unlock.type !== 'purchase') {
          chip.classList.add('locked');
          chip.append(iconEl(it.unlock.type === 'achievement' ? 'trophy' : 'lock', 14));
          return;
        }
      }
      if (it.kind === 'bundle' && ent.isOwned(it.id)) {
        chip.classList.add('owned');
        chip.append(tr('owned', lang));
        return;
      }
      chip.classList.add('price');
      chip.append(priceOf(it.id));
    };
    update();
    refreshers.add(update);
    return chip;
  }

  function previewFor(it: CosmeticItem, canvas: HTMLCanvasElement, big = false): void {
    switch (it.slot) {
      case 'palette':
        addPreview(canvas, palettePreview(loop, it.id, it.data, look, big ? { scale: 6, zoom: 1.2 } : {}));
        break;
      case 'dish':
        addPreview(canvas, dishPreview(loop, it.data, look));
        break;
      case 'halo':
        addPreview(canvas, haloPreview(loop, it.data, look));
        break;
      case 'trail':
        addPreview(canvas, trailPreview(loop, it.data, look), false);
        break;
      case 'spark':
        addPreview(canvas, sparkPreview(loop, it.data, look), false);
        break;
      case 'music':
        addPreview(canvas, musicPreview(loop, it.data, MUSIC_COLORS[it.id] ?? ['#5BC0EB', '#B892FF'], look), false);
        break;
      default:
        break;
    }
  }

  function profilePreview(it: CosmeticItem): HTMLElement {
    const box = el('div', { class: 'bst-plate-stage' });
    const render = () => {
      box.textContent = '';
      const badge = it.slot === 'badge' ? it.data : ent.equippedData('badge');
      const frame = it.slot === 'frame' ? it.data : ent.equippedData('frame');
      const color = it.slot === 'nameColor' ? it.data : ent.equippedData('nameColor');
      box.append(namePlate(o.playerName || tr('yourName', lang), o.playerTag ?? '0000', badge, frame, color, true));
    };
    render();
    refreshers.add(render);
    return box;
  }

  // ───────────── cards ─────────────
  function card(it: CosmeticItem): HTMLElement {
    const c = el('button', { class: `bst-card r-${it.rarity}`, type: 'button', 'data-id': it.id, 'aria-label': tx(it.name, lang) });
    const prev = el('div', { class: 'bst-prev' });
    if (it.slot === 'badge' || it.slot === 'frame' || it.slot === 'nameColor') {
      prev.classList.add('plate');
      prev.append(profilePreview(it));
    } else {
      const cv = el('canvas', { class: 'bst-canvas' });
      prev.append(cv);
      previewFor(it, cv);
      if (it.slot === 'palette') {
        const strip = el('span', { class: 'bst-strip' });
        strip.style.background = paletteCss(it.data.stops);
        prev.append(strip);
      }
      if (it.slot === 'music') {
        const keyName = (lang === 'es' ? KEY_NAME : KEY_NAME_EN)[it.data.tonic];
        prev.append(el('span', { class: 'bst-music-meta', text: `${it.data.bpm} BPM · ${keyName}` }), listenButton(it.id, it.data, true));
      }
    }
    const tag = tagFor(it);
    if (tag) prev.append(el('span', { class: `bst-tag ${tag.cls}`, text: tag.text }));
    const rar = el('span', { class: 'bst-rarity' });
    rar.style.setProperty('--rc', RARITY_COLOR[it.rarity]);
    rar.textContent = tx(RARITY_NAME[it.rarity], lang);
    c.append(prev, el('div', { class: 'bst-meta' }, el('div', { class: 'bst-name', text: tx(it.name, lang) }), el('div', { class: 'bst-row' }, rar, stateChip(it))));
    const syncCls = () => {
      c.classList.toggle('is-equipped', ent.isEquipped(it.id));
      c.classList.toggle('is-owned', ent.isOwned(it.id));
    };
    syncCls();
    refreshers.add(syncCls);
    c.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.bst-listen')) return;
      sound('tap');
      showDetail(it.id);
    });
    return c;
  }

  function listenButton(id: string, preset: AmbiencePreset, compact = false): HTMLButtonElement {
    const b = el('button', { class: `bst-listen${compact ? ' compact' : ''}`, type: 'button' });
    const render = () => {
      const on = playingMusic === id;
      b.innerHTML = sicon(on ? 'stop' : 'play', compact ? 16 : 18) + (compact ? '' : `<span>${tr(on ? 'stop' : 'listen', lang)}</span>`);
      b.setAttribute('aria-label', tr(on ? 'stop' : 'listen', lang));
      b.classList.toggle('on', on);
    };
    render();
    refreshers.add(render);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (playingMusic === id) stopMusic();
      else {
        stopMusic();
        playingMusic = id;
        if (o.previewMusic) o.previewMusic(preset);
        else
          demo?.play(id, preset, () => {
            if (playingMusic === id) {
              playingMusic = null;
              refreshAll();
            }
          });
      }
      refreshAll();
    });
    return b;
  }

  function stopMusic(): void {
    if (!playingMusic) return;
    playingMusic = null;
    if (o.previewMusic) o.previewMusic(null);
    else demo?.stop();
  }

  function grid(items: CosmeticItem[]): HTMLElement {
    const g = el('div', { class: 'bst-grid' });
    for (const it of items) g.append(card(it));
    return g;
  }

  function section(title: string, icon: string, kids: HTMLElement[]): HTMLElement {
    return el('section', { class: 'bst-section' }, el('h3', { class: 'bst-h' }, iconEl(icon, 16), title), ...kids);
  }

  function packCard(b: BundleItem): HTMLElement {
    const c = el('button', { class: 'bst-pack', type: 'button', 'data-id': b.id });
    const cv = el('canvas', { class: 'bst-canvas' });
    const first = cosmeticById(b.contains.find((id) => id.startsWith('palette.')) ?? '') as CosmeticItem | undefined;
    const prev = el('div', { class: 'bst-prev' }, cv);
    if (first?.slot === 'palette') {
      const dishItem = DISHES.find((d) => b.contains.includes(d.id));
      addPreview(cv, palettePreview(loop, first.id, first.data, () => ({ ...look(), dish: dishItem?.data ?? look().dish })));
    }
    const chips = el('div', { class: 'bst-pack-chips' });
    for (const id of b.contains) {
      const it = cosmeticById(id);
      if (!it) continue;
      chips.append(contentChip(it));
    }
    c.append(
      prev,
      el(
        'div',
        { class: 'bst-pack-info' },
        el('div', { class: 'bst-name', text: tx(b.name, lang) }),
        chips,
        el('div', { class: 'bst-row' }, el('span', { class: 'bst-was', text: tr('separately', lang, { price: formatUSD(bundleValueUSD(b), lang) }) }), stateChip(b)),
      ),
    );
    c.addEventListener('click', () => (sound('tap'), showDetail(b.id)));
    return c;
  }

  function contentChip(it: CosmeticItem): HTMLElement {
    const ch = el('span', { class: 'bst-chip' });
    if (it.slot === 'palette') ch.append(swatch(it.data, 14));
    else ch.append(iconEl(({ dish: 'dish', halo: 'halo', trail: 'seed', spark: 'sparkle', music: 'music', badge: 'crown', frame: 'user', nameColor: 'name' } as Record<string, string>)[it.slot] ?? 'sparkle', 14));
    ch.append(tx(it.name, lang));
    if (it.unlock.type === 'bundle') ch.append(el('em', { text: tr('exclusiveMark', lang) }));
    const sync = () => ch.classList.toggle('have', ent.isOwned(it.id));
    sync();
    refreshers.add(sync);
    return ch;
  }

  // ───────────── panes ─────────────
  function buildPane(t: StoreTab): HTMLElement {
    const pane = el('div', { class: `bst-pane pane-${t}`, role: 'tabpanel' });
    const intro = (k: StoreStr) => el('p', { class: 'bst-intro', text: tr(k, lang) });
    switch (t) {
      case 'palettes': {
        pane.append(intro('introPalettes'), grid(PALETTES));
        const claimed = SUPPORTER_PALETTES.filter((p) => ent.isOwned(p.id));
        if (claimed.length) pane.append(section(tr('sectionMonthly', lang), 'heart', [grid(claimed)]));
        const packs = BUNDLES.filter((b) => b.tab === 'palettes');
        if (packs.length) pane.append(section(tr('sectionPacks', lang), 'gift', packs.map(packCard)));
        break;
      }
      case 'dish':
        pane.append(intro('introDish'), grid(DISHES));
        break;
      case 'effects':
        pane.append(
          intro('introEffects'),
          section(tr('sectionHalo', lang), 'halo', [grid(HALOS)]),
          section(tr('sectionTrail', lang), 'seed', [grid(TRAILS)]),
          section(tr('sectionSpark', lang), 'sparkle', [grid(SPARKS)]),
        );
        break;
      case 'music':
        pane.append(intro('introMusic'), grid(MUSICS));
        break;
      case 'profile': {
        const hero = el('div', { class: 'bst-plate-hero' });
        const render = () => {
          hero.textContent = '';
          hero.append(namePlate(o.playerName || tr('yourName', lang), o.playerTag ?? '0000', ent.equippedData('badge'), ent.equippedData('frame'), ent.equippedData('nameColor')));
        };
        render();
        refreshers.add(render);
        pane.append(
          intro('introProfile'),
          hero,
          section(tr('sectionBadges', lang), 'crown', [grid(BADGES)]),
          section(tr('sectionFrames', lang), 'user', [grid(FRAMES)]),
          section(tr('sectionNameColors', lang), 'name', [grid(NAME_COLORS)]),
        );
        break;
      }
      case 'supporter':
        pane.append(supporterPane());
        break;
    }
    return pane;
  }

  function supporterPane(): HTMLElement {
    const box = el('div', { class: 'bst-sup' });
    const month = supporterPaletteFor(Date.now());
    // Hero
    const crest = el('div', { class: 'bst-sup-crest', html: sicon('heart', 30) });
    const heroCv = el('canvas', { class: 'bst-canvas' });
    const heroPrev = el('div', { class: 'bst-sup-prev' }, heroCv, el('span', { class: 'bst-sup-month', text: tr('thisMonth', lang, { name: tx(month.name, lang) }) }));
    addPreview(heroCv, palettePreview(loop, month.id, month.data, look, { scale: 4, zoom: 1.15 }));
    const perks = el('ul', { class: 'bst-perks' });
    for (const p of SUPPORTER_PERKS) {
      perks.append(el('li', null, el('span', { class: 'bst-perk-ic', html: sicon(p.icon, 18) }), el('div', null, el('strong', { text: tx(p.title, lang) }), el('span', { text: tx(p.desc, lang) }))));
    }
    const planBox = el('div', { class: 'bst-plans', role: 'radiogroup', 'aria-label': tr('supTitle', lang) });
    const subBtn = el('button', { class: 'bst-btn gold block', type: 'button' });
    const status = el('div', { class: 'bst-sub-status' });
    const month$ = SUBSCRIPTIONS.find((s) => s.period === 'month')!;
    const year$ = SUBSCRIPTIONS.find((s) => s.period === 'year')!;
    const savePct = Math.round((1 - PRICE_USD.subYear / (PRICE_USD.subMonth * 12)) * 100);
    const planBtn = (p: 'month' | 'year') => {
      const item = p === 'month' ? month$ : year$;
      const b = el(
        'button',
        { class: 'bst-plan', type: 'button', role: 'radio', 'aria-checked': 'false' },
        el('span', { class: 'bst-plan-name', text: tr(p === 'month' ? 'planMonth' : 'planYear', lang) }),
        el('span', { class: 'bst-plan-price' }, el('strong', { text: priceOf(item.id) }), el('small', { text: tr(p === 'month' ? 'perMonth' : 'perYear', lang) })),
        p === 'year' ? el('span', { class: 'bst-plan-save', text: tr('save', lang, { pct: savePct }) }) : null,
      );
      b.addEventListener('click', () => {
        plan = p;
        sound('tap');
        refreshAll();
      });
      refreshers.add(() => {
        b.classList.toggle('on', plan === p);
        b.setAttribute('aria-checked', String(plan === p));
      });
      return b;
    };
    planBox.append(planBtn('month'), planBtn('year'));
    const busyLine = el('div', { class: 'bst-wait', hidden: true });
    subBtn.addEventListener('click', () => void buy(plan === 'month' ? month$.id : year$.id));
    const manageBtn = el('button', { class: 'bst-btn ghost block', type: 'button' }, iconEl('external', 18), el('span', { text: tr('manage', lang) }));
    manageBtn.addEventListener('click', () => (sound('tap'), store.manageSubscription()));
    const updateSub = () => {
      const active = ent.isSubscriber();
      const s = ent.subscription();
      status.hidden = !active;
      planBox.hidden = active || !store.sellsSubscriptions;
      subBtn.hidden = active || !store.sellsSubscriptions;
      manageBtn.hidden = !active || !provider?.manageSubscription;
      if (active && s) {
        status.textContent = '';
        status.append(
          el('span', { class: 'bst-sub-badge', html: sicon('heart', 18) }),
          el('div', null, el('strong', { text: tr('subActive', lang) }), el('span', { text: tr(s.willRenew ? 'subUntilRenew' : 'subUntilEnd', lang, { date: shortDate(s.expiresAt, lang) }) })),
        );
      }
      const item = plan === 'month' ? month$ : year$;
      const busy = store.busyItem === item.id;
      subBtn.disabled = !!store.busyItem || !store.canBuy(item.id).ok;
      subBtn.classList.toggle('busy', busy);
      subBtn.innerHTML = sicon('heart', 20) + `<span>${tr('subscribe', lang, { price: `${priceOf(item.id)}${tr(plan === 'month' ? 'perMonth' : 'perYear', lang)}` })}</span>`;
      busyLine.hidden = !busy;
    };
    refreshers.add(updateSub);
    busyLine.append(el('span', { class: 'bst-spinner' }), el('span', { text: tr('waiting', lang) }), cancelLink());
    const hero = el(
      'div',
      { class: 'bst-sup-hero' },
      el('div', { class: 'bst-sup-top' }, crest, el('div', null, el('h3', { text: tr('supTitle', lang) }), el('p', { text: tr('supLead', lang) }))),
      el('div', { class: 'bst-sup-mid' }, heroPrev, perks),
      fairBox(),
      status,
      planBox,
      store.sellsSubscriptions || !provider ? null : el('p', { class: 'bst-fine', text: tr('noSubsHere', lang) }),
      subBtn,
      busyLine,
      manageBtn,
      el('p', { class: 'bst-fine', text: tr('subFine', lang) }),
    );
    box.append(hero);
    updateSub();
    // Founder pack
    const founder = BUNDLES.find((b) => b.id === 'bundle.founder');
    if (founder) box.append(founderCard(founder));
    return box;
  }

  function fairBox(): HTMLElement {
    return el('div', { class: 'bst-fair' }, iconEl('shield', 18), el('div', null, el('strong', { text: tr('fairTitle', lang) }), el('span', { text: tx(FAIR_PLAY_NOTE, lang) })));
  }

  function cancelLink(): HTMLButtonElement {
    const b = el('button', { class: 'bst-link', type: 'button', text: tr('cancelWait', lang) });
    b.addEventListener('click', () => store.cancelCheckout());
    return b;
  }

  function founderCard(b: BundleItem): HTMLElement {
    const cv = el('canvas', { class: 'bst-canvas' });
    const gold = cosmeticById('palette.goldleaf');
    const brass = cosmeticById('dish.brass');
    const firefly = cosmeticById('spark.firefly');
    if (gold?.slot === 'palette' && brass?.slot === 'dish' && firefly?.slot === 'spark') {
      // The "founder look": gold-leaf creature on the brass dish with a firefly drifting by.
      const draw: DrawFn = (ctx, w, h, t) => {
        const dpr = ctx.getTransform().a;
        ctx.drawImage(dishBackground(brass.data, Math.round(w * dpr), Math.round(h * dpr), Math.round(5 * dpr)), 0, 0, w, h);
        drawCreature(loop, ctx, gold.id, gold.data, w * 0.42, h / 2, Math.min(w, h) * 1.15, t, 4);
        const tt = reduceMotion ? 1 : t;
        drawSpark(ctx, w * 0.74 + Math.sin(tt * 0.8) * w * 0.08, h * 0.38 + Math.sin(tt * 1.3) * h * 0.12, tt, firefly.data, { reduceMotion });
      };
      addPreview(cv, draw);
    }
    const chips = el('div', { class: 'bst-pack-chips' });
    for (const id of b.contains) {
      const it = cosmeticById(id);
      if (it) chips.append(contentChip(it));
    }
    const btn = el('button', { class: 'bst-btn gold block', type: 'button' });
    const have = el('p', { class: 'bst-fine' });
    const busyLine = el('div', { class: 'bst-wait', hidden: true }, el('span', { class: 'bst-spinner' }), el('span', { text: tr('waiting', lang) }), cancelLink());
    const update = () => {
      const owned = b.contains.filter((id) => ent.isOwned(id)).length;
      const all = owned === b.contains.length;
      const busy = store.busyItem === b.id;
      btn.disabled = all || !!store.busyItem || !store.canBuy(b.id).ok;
      btn.classList.toggle('busy', busy);
      btn.innerHTML = all ? sicon('check', 20) + `<span>${tr('ownedAll', lang)}</span>` : sicon('gift', 20) + `<span>${tr('buyFor', lang, { price: priceOf(b.id) })}</span>`;
      have.textContent = owned && !all ? tr('alreadyHave', lang, { n: owned, total: b.contains.length }) : '';
      have.hidden = !have.textContent;
      busyLine.hidden = !busy;
    };
    refreshers.add(update);
    update();
    btn.addEventListener('click', () => void buy(b.id));
    return el(
      'div',
      { class: 'bst-founder' },
      el('div', { class: 'bst-prev' }, cv, el('span', { class: 'bst-tag gold', text: tr('bundleTag', lang) })),
      el(
        'div',
        { class: 'bst-founder-info' },
        el('h3', { text: tx(b.name, lang) }),
        el('p', { class: 'bst-desc', text: tx(b.desc, lang) }),
        el('div', { class: 'bst-label', text: tr('includes', lang) }),
        chips,
        el('div', { class: 'bst-was', text: tr('separately', lang, { price: formatUSD(bundleValueUSD(b), lang) }) }),
        have,
        btn,
        busyLine,
      ),
    );
  }

  // ───────────── detail sheet ─────────────
  let detailHandles: PreviewHandle[] = [];
  let detailRefresh: (() => void) | null = null;

  function showDetail(id: string): void {
    const it = itemById(id);
    if (!it) return;
    if (it.kind === 'subscription') return setTab('supporter');
    if (it.id === 'bundle.founder') {
      setTab('supporter');
      return;
    }
    closeDetail(true);
    detail.textContent = '';
    const sheet = el('div', { class: 'bst-sheet', role: 'dialog', 'aria-label': tx(it.name, lang) });
    const back = el('button', { class: 'bst-close', type: 'button', 'aria-label': tr('back', lang), html: sicon('close', 22), onclick: () => closeDetail() });
    const big = el('div', { class: 'bst-big' });
    if (it.kind === 'cosmetic' && (it.slot === 'badge' || it.slot === 'frame' || it.slot === 'nameColor')) {
      big.classList.add('plate');
      big.append(namePlate(o.playerName || tr('yourName', lang), o.playerTag ?? '0000', it.slot === 'badge' ? it.data : ent.equippedData('badge'), it.slot === 'frame' ? it.data : ent.equippedData('frame'), it.slot === 'nameColor' ? it.data : ent.equippedData('nameColor')));
    } else {
      const cv = el('canvas', { class: 'bst-canvas' });
      big.append(cv);
      const before = handles.length;
      if (it.kind === 'cosmetic') previewFor(it, cv, true);
      else if (it.kind === 'bundle') {
        const pal = cosmeticById(it.contains.find((x) => x.startsWith('palette.')) ?? '');
        const dishItem = DISHES.find((d) => it.contains.includes(d.id));
        if (pal?.slot === 'palette') addPreview(cv, palettePreview(loop, pal.id, pal.data, () => ({ ...look(), dish: dishItem?.data ?? look().dish }), { scale: 6, zoom: 1.2 }));
      }
      detailHandles = handles.splice(before);
    }
    const chips = el('div', { class: 'bst-chips' });
    const rar = el('span', { class: 'bst-rarity big' });
    rar.style.setProperty('--rc', RARITY_COLOR[it.rarity]);
    rar.textContent = tx(RARITY_NAME[it.rarity], lang);
    chips.append(rar);
    if (it.kind === 'cosmetic') chips.append(el('span', { class: 'bst-chip', text: tx(SLOT_NAME[it.slot], lang) }));
    const extra = el('div', { class: 'bst-extra' });
    if (it.kind === 'cosmetic' && it.slot === 'palette') {
      const bar = el('div', { class: 'bst-gradbar' });
      bar.style.background = paletteCss(it.data.stops);
      extra.append(bar);
    }
    if (it.kind === 'cosmetic' && it.slot === 'music') {
      const m = it.data;
      const keyName = (lang === 'es' ? KEY_NAME : KEY_NAME_EN)[m.tonic];
      extra.append(
        el(
          'div',
          { class: 'bst-chips' },
          el('span', { class: 'bst-chip', text: tr('bpm', lang, { n: m.bpm }) }),
          el('span', { class: 'bst-chip', text: `${keyName} ${MODE_NAME[m.mode]?.[lang] ?? m.mode}` }),
          el('span', { class: 'bst-chip', text: m.percussion === 'none' ? (lang === 'es' ? 'Sin percusión' : 'No percussion') : lang === 'es' ? 'Percusión suave' : 'Soft percussion' }),
        ),
        listenButton(it.id, m),
      );
    }
    if (it.kind === 'bundle') {
      const cc = el('div', { class: 'bst-pack-chips' });
      for (const cid of it.contains) {
        const c = cosmeticById(cid);
        if (c) cc.append(contentChip(c));
      }
      extra.append(el('div', { class: 'bst-label', text: tr('includes', lang) }), cc, el('div', { class: 'bst-was', text: tr('separately', lang, { price: formatUSD(bundleValueUSD(it), lang) }) }));
    }
    const note = el('p', { class: 'bst-lock' });
    const action = el('button', { class: 'bst-btn block', type: 'button' });
    const busyLine = el('div', { class: 'bst-wait', hidden: true }, el('span', { class: 'bst-spinner' }), el('span', { text: tr('waiting', lang) }), cancelLink());
    const update = () => {
      action.className = 'bst-btn block';
      action.disabled = false;
      note.textContent = '';
      action.onclick = null;
      const busy = store.busyItem === it.id;
      busyLine.hidden = !busy;
      if (it.kind === 'cosmetic' && ent.isOwned(it.id)) {
        if (ent.isEquipped(it.id)) {
          action.classList.add('done');
          action.disabled = true;
          action.innerHTML = sicon('check', 20) + `<span>${tr('equipped', lang)}</span>`;
        } else {
          action.classList.add('primary');
          action.innerHTML = sicon('hanger', 20) + `<span>${tr('equip', lang)}</span>`;
          action.onclick = () => {
            if (ent.equip(it.id)) {
              sound('confirm');
              toast.show(tr('equippedToast', lang, { name: tx(it.name, lang) }), 'good');
              loop.refresh();
            }
          };
        }
        return;
      }
      if (it.kind === 'bundle' && ent.isOwned(it.id)) {
        action.classList.add('done');
        action.disabled = true;
        action.innerHTML = sicon('check', 20) + `<span>${tr('ownedAll', lang)}</span>`;
        return;
      }
      const lock = lockText(it);
      if (it.kind === 'cosmetic' && it.unlock.type !== 'purchase') {
        note.textContent = lock ?? '';
        if (it.unlock.type === 'subscription' && store.sellsSubscriptions) {
          action.classList.add('gold');
          action.innerHTML = sicon('heart', 20) + `<span>${tr('supTitle', lang)}</span>`;
          action.onclick = () => (closeDetail(), setTab('supporter'));
        } else if (it.unlock.type === 'bundle') {
          const bb = bundlesContaining(it.id)[0];
          action.classList.add('gold');
          action.innerHTML = sicon('gift', 20) + `<span>${bb ? tx(bb.name, lang) : ''}</span>`;
          action.onclick = () => (closeDetail(), bb && bb.tab === 'supporter' ? setTab('supporter') : bb && showDetail(bb.id));
        } else {
          action.classList.add('locked');
          action.disabled = true;
          action.innerHTML = sicon(it.unlock.type === 'achievement' ? 'trophy' : 'lock', 20) + `<span>${it.unlock.type === 'achievement' ? tr('achievementTag', lang) : tr('supporterTag', lang)}</span>`;
        }
        return;
      }
      const gate = store.canBuy(it.id);
      const premium = it.kind === 'bundle' || it.rarity === 'legendary' || it.rarity === 'exclusive';
      action.classList.add(premium ? 'gold' : 'primary');
      action.classList.toggle('busy', busy);
      action.innerHTML = sicon(it.kind === 'bundle' ? 'gift' : 'bag', 20) + `<span>${tr('buyFor', lang, { price: priceOf(it.id) })}</span>`;
      if (!gate.ok) {
        action.disabled = true;
        if (gate.reason === 'early_access' && it.earlyAccessUntil) note.textContent = tr('lockEarly', lang, { date: shortDate(Date.parse(it.earlyAccessUntil), lang) });
        else if (gate.reason === 'no_provider' || gate.reason === 'disabled' || gate.reason === 'unavailable_here') note.textContent = tr('unavailable', lang);
      } else {
        action.disabled = !!store.busyItem;
        action.onclick = () => void buy(it.id);
      }
      if (it.kind === 'cosmetic') {
        const also = bundlesContaining(it.id);
        if (also.length && !note.textContent) note.textContent = tr('alsoIn', lang, { name: also.map((b) => tx(b.name, lang)).join(', ') });
      }
    };
    detailRefresh = update;
    update();
    sheet.append(
      el('div', { class: 'bst-sheet-head' }, el('h3', { text: tx(it.name, lang) }), back),
      big,
      chips,
      el('p', { class: 'bst-desc', text: tx(it.desc, lang) }),
      extra,
      note,
      action,
      busyLine,
      el('p', { class: 'bst-fine fair' }, iconEl('shield', 14), tx(FAIR_PLAY_NOTE, lang)),
    );
    detail.append(el('div', { class: 'bst-detail-scrim', onclick: () => closeDetail() }), sheet);
    detail.hidden = false;
    requestAnimationFrame(() => detail.classList.add('in'));
    back.focus({ preventScroll: true });
  }

  function closeDetail(instant = false): void {
    if (detail.hidden) return;
    for (const h of detailHandles) h.destroy();
    detailHandles = [];
    detailRefresh = null;
    detail.classList.remove('in');
    if (instant || reduceMotion) {
      detail.hidden = true;
      detail.textContent = '';
    } else
      setTimeout(() => {
        if (!detail.classList.contains('in')) {
          detail.hidden = true;
          detail.textContent = '';
        }
      }, 200);
  }

  // ───────────── purchase ─────────────
  async function buy(id: string): Promise<void> {
    sound('tap');
    const it = itemById(id);
    const r: Result = await store.buy(id);
    if (r.ok) {
      sound('confirm');
      if (it?.kind === 'subscription') toast.show(tr('subscribed', lang), 'good');
      else toast.show(tr('purchased', lang, { name: it ? tx(it.name, lang) : id }), 'good');
    } else {
      const msg: Partial<Record<string, StoreStr>> = { cancelled: 'cancelled', pending: 'pending', network: 'offline', unavailable: 'unavailable', disabled: 'unavailable' };
      if (r.reason !== 'owned') {
        sound(r.reason === 'cancelled' ? 'tap' : 'deny');
        toast.show(tr(msg[r.reason] ?? 'failed', lang), r.reason === 'pending' ? 'info' : 'warn');
      }
    }
    refreshAll();
  }

  // ───────────── state ─────────────
  function refreshAll(): void {
    for (const f of refreshers) f();
    detailRefresh?.();
  }

  function setTab(t: StoreTab): void {
    tab = t;
    for (const [id, b] of tabBtns) {
      b.setAttribute('aria-selected', String(id === t));
      b.classList.toggle('on', id === t);
    }
    let pane = panes.get(t);
    if (!pane) {
      pane = buildPane(t);
      panes.set(t, pane);
      body.append(pane);
    }
    for (const [id, p] of panes) p.hidden = id !== t;
    body.append(foot); // legal footer always last in the scroll
    body.scrollTop = 0;
    tabBtns.get(t)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    refreshAll();
  }

  const offChanged = ent.on('changed', () => {
    refreshAll();
    loop.refresh();
  });
  const offStatus = store.on('status', () => refreshAll());
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (!detail.hidden) closeDetail();
    else close();
  };
  document.addEventListener('keydown', onKey, true);
  void store.prepare().then(refreshAll);
  setTab(tab);

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    store.cancelCheckout();
    stopMusic();
    offChanged();
    offStatus();
    document.removeEventListener('keydown', onKey, true);
    wrap.classList.remove('in');
    wrap.classList.add('out');
    const done = () => {
      loop.destroy();
      wrap.remove();
      prevFocus?.focus?.({ preventScroll: true });
      o.onClose?.();
    };
    if (reduceMotion) done();
    else setTimeout(done, 200);
  }

  return {
    el: wrap,
    setTab,
    show: showDetail,
    close,
  };
}
