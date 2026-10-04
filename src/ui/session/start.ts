/**
 * Start-of-session card (docs/CICLO.md §2.1): "Sesión 4 · Tienes 3:30 de laboratorio", the world
 * picker (the only rules choice: unlocked worlds as cards with their species, never numbers), what
 * the tree gives at the start (Esencia, free seeds, creatures out of the Nevera), what is new since
 * last time, the current Encargo, "El reloj empieza con tu primera gota" and a big "¡Empezar!".
 */
import type { Lang, Pattern, Text } from '../../core/types';
import type { SessionStart } from '../../game/session';
import { TREE_BY_ID, nodeText } from '../../game/tree';
import { SESSION_UI, WORLD_TEXT } from '../../game/treeText';
import { WORLD_BY_ID, type WorldId } from '../../game/worlds';
import { fmt, fmtClock } from '../format';
import { renderPattern } from '../portrait';
import { treeIcon } from '../tree/icons';
import './session.css';

export interface SessionStartOptions {
  lang(): Lang;
  reduceMotion?(): boolean;
  speciesInfo?(id: string): { name: string; portrait: Pattern | null; hue?: number } | null;
  /** A world's species for its card: catalog code, portrait, found already (unfound = silhouette). */
  worldSpecies?(world: WorldId): { code: string; portrait: Pattern | null; found: boolean }[];
  /** The player tapped a world card (the host stores it: session.researchPickWorld). */
  onPickWorld?(world: WorldId): void;
  onGo(): void;
}

export interface SessionStartExtras {
  /** The current Encargo, if any ("Ten 3 criaturas a la vez"). */
  encargo?: Text | null;
}

export interface SessionStartView {
  readonly el: HTMLElement;
  readonly isOpen: boolean;
  show(start: SessionStart, extras?: SessionStartExtras): void;
  hide(): void;
  dispose(): void;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function createSessionStart(root: HTMLElement, opts: SessionStartOptions): SessionStartView {
  const rm = () => !!opts.reduceMotion?.();
  const layer = document.createElement('div');
  layer.className = 'ss-layer';
  layer.hidden = true;
  layer.innerHTML = `<div class="ss-scrim"></div><section class="ss-card" role="dialog" aria-modal="true"></section>`;
  root.appendChild(layer);
  const card = layer.querySelector('.ss-card') as HTMLElement;
  let open = false;
  let current: { start: SessionStart; extras: SessionStartExtras } | null = null;

  /** The world cards: species portraits, "Encontradas 1/2" or "+2 especies", "¡Nuevo!". */
  function worldsHtml(start: SessionStart, l: Lang): string {
    const one = (w: WorldId) => {
      const def = WORLD_BY_ID[w];
      const sp = opts.worldSpecies?.(w) ?? def.species.map((code) => ({ code, portrait: null, found: false }));
      const found = sp.filter((x) => x.found).length;
      const isNew = !!def.node && start.fresh.includes(def.node);
      const picked = w === start.world;
      const foot = found === 0 ? SESSION_UI.worldSpecies(sp.length)[l] : found === sp.length ? SESSION_UI.worldAllFound[l] : SESSION_UI.worldFound(found, sp.length)[l];
      const cells = sp.map((x) => `<span class="sp${x.found ? ' found' : ''}" data-w="${w}" data-code="${esc(x.code)}"></span>`).join('');
      return `<button type="button" class="ss-world${picked ? ' on' : ''}" data-world="${w}" style="--wh:${def.hue}" aria-pressed="${picked}">
        <span class="ss-wtop"><b>${esc(WORLD_TEXT[w].name[l])}</b>${isNew ? `<em class="ss-wnew">${esc(SESSION_UI.worldNew[l])}</em>` : ''}${
          picked ? `<span class="ss-wpick">${treeIcon('check', 16)}</span>` : ''
        }</span>
        <span class="ss-wdesc">${esc(WORLD_TEXT[w].desc[l])}</span>
        <span class="ss-wsp">${cells}</span>
        <span class="ss-wfoot">${esc(foot)}</span>
      </button>`;
    };
    return `<div class="ss-box ss-worlds-box"><h4>${esc(SESSION_UI.pickWorld[l])}</h4><div class="ss-worlds">${start.worlds.map(one).join('')}</div></div>`;
  }

  function paintWorldPortraits(): void {
    for (const m of card.querySelectorAll<HTMLElement>('.ss-world .sp')) {
      const sp = opts.worldSpecies?.(m.dataset.w as WorldId)?.find((x) => x.code === m.dataset.code);
      if (sp?.portrait) m.appendChild(renderPattern(sp.portrait, 40, 0.85));
      if (!sp?.found) m.insertAdjacentHTML('beforeend', '<i>?</i>');
    }
  }

  const api: SessionStartView = {
    el: layer,
    get isOpen() {
      return open;
    },
    show(start, extras = {}) {
      current = { start, extras };
      const l = opts.lang();
      const gifts: string[] = [];
      if (start.startEssence > 0)
        gifts.push(`<span class="ss-gift" style="--c:var(--ss-essence)">${treeIcon('drop', 20)}${esc(l === 'es' ? `${fmt(start.startEssence, l)} Esencia` : `${fmt(start.startEssence, l)} Essence`)}</span>`);
      if (start.freeSeeds > 0)
        gifts.push(
          `<span class="ss-gift" style="--c:var(--ss-good)">${treeIcon('gift', 20)}${esc(
            l === 'es' ? `${start.freeSeeds} ${start.freeSeeds === 1 ? 'siembra gratis' : 'siembras gratis'}` : `${start.freeSeeds} free ${start.freeSeeds === 1 ? 'seed' : 'seeds'}`,
          )}</span>`,
        );
      if (start.fridgeSlots > 0 || start.fridge.length) {
        const minis = start.fridge
          .map((id) => {
            const info = opts.speciesInfo?.(id);
            return `<span class="mini" style="--hue:${info?.hue ?? 195}" data-sp="${esc(id)}"></span>`;
          })
          .join('');
        gifts.push(`<span class="ss-gift" style="--c:var(--ss-accent)">${treeIcon('snow', 20)}${minis}${esc(SESSION_UI.startKeep(Math.max(start.fridge.length, start.fridgeSlots))[l])}</span>`);
      }
      const fresh = start.fresh
        .filter((id) => TREE_BY_ID[id])
        .slice(0, 8)
        .map((id) => `<span class="n b-${TREE_BY_ID[id].branch}">${treeIcon(TREE_BY_ID[id].icon, 22)}${esc(id === 'lab' ? (l === 'es' ? 'Noche nueva' : 'New night') : nodeText(id).name[l])}</span>`)
        .join('');
      card.innerHTML = `
        <div class="ss-head"><h2>${esc(SESSION_UI.startTitle(start.n)[l])}</h2></div>
        <div class="ss-start-time"><div class="big">${treeIcon('clockIcon', 40)}</div><div><b>${fmtClock(start.seconds)}</b><span>${esc(
          SESSION_UI.startTime(fmtClock(start.seconds))[l],
        )}</span></div></div>
        ${start.worlds.length > 1 ? worldsHtml(start, l) : ''}
        ${gifts.length ? `<div class="ss-box"><div class="ss-gifts">${gifts.join('')}</div></div>` : ''}
        ${fresh ? `<div class="ss-box"><h4>${esc(SESSION_UI.startNew[l])}</h4><div class="ss-new">${fresh}</div></div>` : ''}
        ${extras.encargo ? `<div class="ss-box"><h4>${esc(SESSION_UI.startGoal[l])}</h4><div class="ss-goal">${treeIcon('encargo', 24)}<span>${esc(extras.encargo[l])}</span></div></div>` : ''}
        <p class="ss-hint">${treeIcon('drop', 18)}${esc(SESSION_UI.startHint[l])}</p>
        <div class="ss-actions"><button type="button" class="ss-btn primary" data-act="go">${treeIcon('play', 24)}<span class="tx">${esc(SESSION_UI.startGo[l])}</span></button></div>`;
      for (const m of card.querySelectorAll<HTMLElement>('[data-sp]')) {
        const info = opts.speciesInfo?.(m.dataset.sp!);
        if (info?.portrait) m.appendChild(renderPattern(info.portrait, 52, 0.8));
      }
      paintWorldPortraits();
      card.setAttribute('aria-label', SESSION_UI.startTitle(start.n)[l]);
      layer.hidden = false;
      layer.classList.toggle('rm', rm());
      open = true;
      // The picked world in view (it may be the newest, at the end of the row).
      const list = card.querySelector('.ss-worlds') as HTMLElement | null;
      const on = card.querySelector('.ss-world.on') as HTMLElement | null;
      if (list && on) list.scrollLeft = Math.max(0, on.offsetLeft - list.offsetLeft - 12);
      requestAnimationFrame(() => layer.classList.add('show'));
    },
    hide() {
      if (!open) return;
      open = false;
      layer.classList.remove('show');
      setTimeout(() => {
        if (!open) layer.hidden = true;
      }, rm() ? 0 : 320);
    },
    dispose() {
      layer.remove();
    },
  };
  card.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-act="go"]')) opts.onGo();
    const w = t.closest('[data-world]') as HTMLElement | null;
    if (w && current) {
      const world = w.dataset.world as WorldId;
      if (world === current.start.world) return;
      opts.onPickWorld?.(world);
      const scroll = card.scrollTop;
      const list = card.querySelector('.ss-worlds') as HTMLElement | null;
      const sx = list?.scrollLeft ?? 0;
      api.show({ ...current.start, world }, current.extras);
      card.scrollTop = scroll;
      const list2 = card.querySelector('.ss-worlds') as HTMLElement | null;
      if (list2) list2.scrollLeft = sx;
    }
  });
  return api;
}
