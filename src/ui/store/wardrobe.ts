/**
 * Vestidor (wardrobe): equip what you own. Works with the store disabled (free and achievement
 * cosmetics need no money), so it is available everywhere, galaxy.click included.
 *
 *   openWardrobe({ root: document.body, entitlements, lang: 'es', openStore: store.visible ? (tab) => ... : undefined });
 */
import type { Lang } from '../../core/types';
import { ACHIEVEMENT_TEXT } from '../../game/content';
import {
  SLOTS,
  SLOT_NAME,
  itemsForSlot,
  type CosmeticItem,
  type Slot,
  type StoreTab,
} from '../../store/catalog';
import type { Entitlements } from '../../store/entitlements';
import { drawHalo, drawSpark, drawSparkTrail, drawTrailParticle, drawTrailRipple, stepTrailParticle, trailBurst, type TrailParticle } from '../../store/draw';
import { el, ensureStyles, iconEl, namePlate, swatch, toaster } from './dom';
import { sicon, svgInner } from './icons';
import { PreviewLoop, dishBackground, drawCreature, type DrawFn } from './preview';
import css from './store.css?inline';
import { tr, tx } from './strings';

export interface WardrobeOptions {
  root: HTMLElement;
  entitlements: Entitlements;
  lang: Lang;
  playerName?: string;
  playerTag?: string;
  reduceMotion?: boolean;
  /** Present only when the store is visible on this host. */
  openStore?: (tab: StoreTab) => void;
  sound?: (name: 'tap' | 'confirm' | 'deny') => void;
  onClose?: () => void;
}

export interface WardrobeHandle {
  readonly el: HTMLElement;
  close(): void;
}

const SLOT_ICON: Record<Slot, string> = {
  palette: 'palette',
  dish: 'dish',
  halo: 'halo',
  trail: 'seed',
  spark: 'sparkle',
  music: 'music',
  badge: 'crown',
  frame: 'user',
  nameColor: 'name',
};
const SLOT_TAB: Record<Slot, StoreTab> = {
  palette: 'palettes',
  dish: 'dish',
  halo: 'effects',
  trail: 'effects',
  spark: 'effects',
  music: 'music',
  badge: 'profile',
  frame: 'profile',
  nameColor: 'profile',
};

/** Small visual for an option chip. */
function optionDot(it: CosmeticItem): HTMLElement {
  const d = el('span', { class: 'bst-dot' });
  switch (it.slot) {
    case 'palette':
      d.append(swatch(it.data, 24));
      break;
    case 'dish': {
      const s = el('span', { class: 'bst-swatch' });
      s.style.width = s.style.height = '24px';
      s.style.background = `radial-gradient(circle, ${it.data.agarIn} 40%, ${it.data.agarOut})`;
      s.style.boxShadow = `inset 0 0 0 1.5px ${it.data.rim}`;
      d.append(s);
      break;
    }
    case 'halo':
      d.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="${it.data.color}" opacity=".35"/><circle cx="12" cy="12" r="9" fill="none" stroke="${it.data.color}" stroke-width="2"/>${
        it.data.color2 ? `<circle cx="12" cy="12" r="11" fill="none" stroke="${it.data.color2}" stroke-width="1" opacity=".7"/>` : ''
      }</svg>`;
      break;
    case 'trail':
      d.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="${it.data.ripple}" stroke-width="1.6" opacity=".8"/><circle cx="12" cy="12" r="5" fill="none" stroke="${it.data.ripple}" stroke-width="1.2" opacity=".5"/>${it.data.colors
        .map((c, i) => `<circle cx="${6 + i * 6}" cy="${5 + (i % 2) * 2}" r="1.6" fill="${c}"/>`)
        .join('')}</svg>`;
      break;
    case 'spark':
      d.innerHTML = sicon('sparkle', 22);
      d.style.color = it.data.core;
      d.style.filter = `drop-shadow(0 0 5px ${it.data.glow})`;
      break;
    case 'music':
      d.innerHTML = sicon('music', 20);
      d.style.color = '#8CD7FF';
      break;
    case 'badge':
      if (it.data.svg) {
        d.innerHTML = svgInner(it.data.svg, 20);
        d.style.color = it.data.color;
        d.style.background = it.data.bg;
      } else d.innerHTML = sicon('close', 16);
      break;
    case 'frame': {
      const s = el('span');
      s.style.cssText = `width:24px;height:16px;border-radius:5px;display:block;`;
      if (it.data.style === 'none') s.style.border = '1.5px solid rgba(230,237,243,.2)';
      else if (it.data.style === 'gradient') s.style.background = `linear-gradient(120deg, ${it.data.colors.join(',')})`;
      else s.style.border = `2px ${it.data.style === 'dotted' ? 'dotted' : 'solid'} ${it.data.colors[0]}`;
      d.append(s);
      break;
    }
    case 'nameColor': {
      const s = el('span', { text: 'Aa' });
      s.style.cssText = 'font-weight:800;font-size:15px;';
      if (it.data.gradient) {
        s.style.backgroundImage = `linear-gradient(90deg, ${it.data.gradient[0]}, ${it.data.gradient[1]})`;
        s.style.webkitBackgroundClip = 'text';
        s.style.backgroundClip = 'text';
        s.style.color = 'transparent';
      } else s.style.color = it.data.color;
      d.append(s);
      break;
    }
  }
  return d;
}

export function openWardrobe(o: WardrobeOptions): WardrobeHandle {
  ensureStyles(css);
  const { entitlements: ent, lang } = o;
  const reduceMotion = o.reduceMotion ?? (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const loop = new PreviewLoop(reduceMotion);
  const toast = toaster();
  const sound = (n: 'tap' | 'confirm' | 'deny') => o.sound?.(n);
  const refreshers: (() => void)[] = [];
  const prevFocus = document.activeElement as HTMLElement | null;

  const wrap = el('div', { class: 'bst bst-wrap bst-wd' });
  const modal = el('section', { class: 'bst-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'bst-wd-title', tabindex: '-1' });
  const head = el(
    'header',
    { class: 'bst-head' },
    el('div', { class: 'bst-crest', html: sicon('hanger', 22) }),
    el('div', { class: 'bst-titles' }, el('h2', { id: 'bst-wd-title', text: tr('wardrobeTitle', lang) }), el('p', { class: 'bst-promise' }, iconEl('shield', 14), tr('cosmeticOnly', lang))),
    el('button', { class: 'bst-close', type: 'button', 'aria-label': tr('close', lang), html: sicon('close', 22), onclick: () => close() }),
  );
  const body = el('div', { class: 'bst-body' });

  // Mirror: the equipped look, all together.
  const mirror = el('div', { class: 'bst-mirror' });
  const cv = el('canvas', { class: 'bst-canvas' });
  const plateBox = el('div', { class: 'bst-mirror-plate' });
  mirror.append(cv, plateBox);
  const trail: { x: number; y: number; t: number }[] = [];
  let seeds: { x: number; y: number; t0: number; parts: TrailParticle[] }[] = [];
  let nextSeed = 1;
  const draw: DrawFn = (ctx, w, h, t, dt) => {
    const dpr = ctx.getTransform().a;
    const pal = ent.equipped('palette');
    ctx.drawImage(dishBackground(ent.equippedData('dish'), Math.round(w * dpr), Math.round(h * dpr), Math.round(6 * dpr)), 0, 0, w, h);
    const cx = w * 0.38;
    const cy = h * 0.44;
    const size = Math.min(w, h) * 0.95;
    drawCreature(loop, ctx, pal.id, pal.data, cx, cy, size, t, 4);
    drawHalo(ctx, cx, cy, size * 0.29, t, ent.equippedData('halo'), { reduceMotion });
    // Seed trail somewhere on the right half.
    const ts = ent.equippedData('trail');
    if (!reduceMotion && t >= nextSeed) {
      seeds.push({ x: w * (0.66 + Math.random() * 0.2), y: h * (0.55 + Math.random() * 0.2), t0: t, parts: trailBurst(ts, 8) });
      if (seeds.length > 2) seeds.shift();
      nextSeed = t + 2.2;
    }
    seeds = seeds.filter((s) => t - s.t0 < 1.3);
    for (const s of seeds) {
      drawTrailRipple(ctx, s.x, s.y, t - s.t0, Math.min(w, h) * 0.16, ts);
      for (const p of s.parts) {
        const k = (t - s.t0) / p.life;
        if (k >= 1) continue;
        stepTrailParticle(p, ts, dt);
        drawTrailParticle(ctx, s.x, s.y, p, ts, k);
      }
    }
    // Spark drifting top-right.
    const sk = ent.equippedData('spark');
    const tt = reduceMotion ? 1 : t;
    const sx = w * 0.76 + Math.sin(tt * 0.6) * w * 0.12;
    const sy = h * 0.28 + Math.sin(tt * 0.9 + 1) * h * 0.1;
    if (!reduceMotion) {
      const last = trail[trail.length - 1];
      if (!last || t - last.t > 0.035) {
        trail.push({ x: sx, y: sy, t });
        if (trail.length > 18) trail.shift();
      }
      drawSparkTrail(ctx, trail, sk);
    }
    drawSpark(ctx, sx, sy, tt, sk, { reduceMotion });
  };
  loop.add(cv, draw);
  const renderPlate = () => {
    plateBox.textContent = '';
    plateBox.append(namePlate(o.playerName || tr('yourName', lang), o.playerTag ?? '0000', ent.equippedData('badge'), ent.equippedData('frame'), ent.equippedData('nameColor'), true));
  };
  renderPlate();
  refreshers.push(renderPlate);

  body.append(el('p', { class: 'bst-intro', text: tr('wardrobeLead', lang) }), mirror);

  for (const slot of SLOTS) {
    const all = itemsForSlot(slot) as CosmeticItem[];
    const row = el('div', { class: 'bst-wd-row', role: 'radiogroup', 'aria-label': tx(SLOT_NAME[slot], lang) });
    const count = el('span', { class: 'bst-wd-count' });
    const block = el('section', { class: 'bst-wd-slot' }, el('div', { class: 'bst-wd-head' }, el('h3', { class: 'bst-h' }, iconEl(SLOT_ICON[slot], 16), tx(SLOT_NAME[slot], lang)), count), row);
    const render = () => {
      row.textContent = '';
      let locked = 0;
      for (const it of all) {
        const owned = ent.isOwned(it.id);
        // Locked achievement items are shown (they are free goals); paid ones only count.
        if (!owned && it.unlock.type !== 'achievement') {
          locked++;
          continue;
        }
        if (!owned) locked++;
        const on = ent.isEquipped(it.id);
        const b = el('button', { class: `bst-opt${on ? ' on' : ''}${owned ? '' : ' locked'}`, type: 'button', role: 'radio', 'aria-checked': String(on) }, owned ? optionDot(it) : el('span', { class: 'bst-dot', html: sicon('trophy', 18) }), el('span', { text: tx(it.name, lang) }));
        b.addEventListener('click', () => {
          if (!owned) {
            sound('deny');
            const a = it.unlock.type === 'achievement' ? ACHIEVEMENT_TEXT[it.unlock.achievement] : undefined;
            toast.show(a ? tr('lockAchievement', lang, { name: tx(a.name, lang) }) : tr('lockAchievementGeneric', lang), 'info');
            return;
          }
          if (ent.equip(it.id)) {
            sound('confirm');
            toast.show(tr('equippedToast', lang, { name: tx(it.name, lang) }), 'good');
          }
        });
        row.append(b);
      }
      // Keep the equipped option in view (horizontal scroll only, never the page).
      requestAnimationFrame(() => {
        const on = row.querySelector<HTMLElement>('.bst-opt.on');
        if (on && (on.offsetLeft < row.scrollLeft || on.offsetLeft + on.offsetWidth > row.scrollLeft + row.clientWidth)) {
          row.scrollLeft = Math.max(0, on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2);
        }
      });
      count.textContent = locked ? tr('lockedCount', lang, { n: locked }) : '';
      if (o.openStore && locked) {
        const more = el('button', { class: 'bst-opt', type: 'button' }, el('span', { class: 'bst-dot', html: sicon('bag', 18) }), el('span', { text: tr('moreInStore', lang) }));
        more.addEventListener('click', () => (sound('tap'), o.openStore!(SLOT_TAB[slot])));
        row.append(more);
      }
    };
    render();
    refreshers.push(render);
    body.append(block);
  }
  if (o.openStore) {
    const more = el('button', { class: 'bst-btn ghost block bst-wd-more', type: 'button' }, iconEl('bag', 20), el('span', { text: tr('storeShort', lang) }));
    more.addEventListener('click', () => (sound('tap'), o.openStore!('palettes')));
    body.append(more);
  }

  modal.append(head, body, toast.el);
  const scrim = el('div', { class: 'bst-scrim', onclick: () => close() });
  wrap.append(scrim, modal);
  o.root.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('in'));
  modal.focus({ preventScroll: true });

  const off = ent.on('changed', () => {
    for (const f of refreshers) f();
    loop.refresh();
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    off();
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
  return { el: wrap, close };
}
