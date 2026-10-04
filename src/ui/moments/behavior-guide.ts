/**
 * "Guía de comportamientos": what each behaviour means, for anyone.
 *
 * Every behaviour answers four things, with icons (data: src/moments/behaviors.ts):
 *   👁 Qué es              what you see, with the looping real-Lenia diagram
 *   ↑ Qué cambia           "Nadadora: ×1,6 Esencia" · comparada con una quieta ×1
 *   ⚗ Cómo conseguir más   which rules/shapes do it (+ a real catalog example)
 *   ⬆ Cómo mejorarla       its Afinidad (level, +8 % por nivel) with a jump button
 * plus the honest note (dividers can overflow the dish; colony = 3+ alike within 3 R).
 *
 *  - behaviorRowsHtml(b, ctx)        the rows (also used inside the behaviour Momentos)
 *  - createBehaviorGuide(el, opts)   all six side by side; unseen ones as silhouettes
 *                                    with a hint ("¿Has visto alguna girar?")
 *  - createBehaviorGuideSheet(root)  the same as a sheet: open(focus?) from the
 *                                    Bestiary header, a status pill or a species card
 */
import type { Behavior, Lang, Text, UpgradeView } from '../../core/types';
import { NODE_TEXT } from '../../game/treeText';
import {
  BEHAVIOR_ORDER,
  LEGACY_AFFINITY,
  affinityStepText,
  baselineText,
  behaviorGuide,
  bonusText,
  exampleWorldText,
} from '../../moments/behaviors';
import { BEHAVIOR_COLOR } from '../../core/palette';
import { moIcon } from './icons';
import { Illustration } from './illustrations';
import { MS, tr } from './strings';

/** Extra ways to boost a behaviour (e.g. research-tree nodes, once they exist). */
export interface ExtraBooster {
  id: string;
  name: Text;
  why: Text;
  /** Owned / bought level. */
  level?: number;
}

export interface BehaviorRowsCtx {
  lang: Lang;
  upgrades?: readonly UpgradeView[];
  /** Show the "Qué es" row (the Momento card lets VELA say it instead). */
  showWhat?: boolean;
  /** Not seen yet: the hint replaces "Qué es". */
  unseen?: boolean;
  /** Jump buttons ("Ver") next to boosters. */
  canJump?: boolean;
  extra?: readonly ExtraBooster[];
  /** The player's name for a catalog species once it is in the Bestiary (null: not found yet → "?"). */
  knownName?(latin: string): string | null;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}

function row(icon: Parameters<typeof moIcon>[0], label: string, body: string, cls = '', button = ''): string {
  return `<div class="mo-bh-row ${cls}"><span class="mo-bh-ic">${moIcon(icon, 18)}</span><div class="mo-bh-tx"><small>${esc(label)}</small>${body}</div>${button}</div>`;
}

/** The answer rows for one behaviour. */
export function behaviorRowsHtml(b: Behavior, c: BehaviorRowsCtx): string {
  const L = c.lang;
  const g = behaviorGuide(b);
  const out: string[] = [];
  if (c.unseen) out.push(row('eye', tr(MS.bhUnseen, L), `<p>${esc(g.hint[L])}</p>`, 'what'));
  else if (c.showWhat) out.push(row('eye', tr(MS.bhWhat, L), `<p>${esc(g.what[L])}</p>`, 'what'));
  const cmp = b === 'still' ? tr(MS.bhBase, L) : baselineText(L);
  out.push(
    row('up', tr(MS.bhChange, L), `<p><b class="mo-bh-big" style="--b-c:var(--bl-beh-${b}, ${BEHAVIOR_COLOR[b]})">${esc(bonusText(b, L))}</b><span class="mo-bh-cmp">${esc(cmp)}</span></p>`, 'bonus'),
  );
  // Where to find it: the species by its Bestiary name once found (else a "?"), and its World.
  let ex = '';
  if (g.example) {
    let known: string | null = null;
    try {
      known = c.knownName?.(g.example.name) ?? null;
    } catch {
      known = null;
    }
    ex = `<span class="mo-bh-ex">${known ? `<b>${esc(known)}</b>` : '<b class="mo-bh-q" aria-hidden="true">?</b>'} · ${esc(exampleWorldText(g.example, L))}</span>`;
  }
  out.push(row('sliders', tr(MS.bhGet, L), `<p>${esc(g.how[L])}</p>${ex}`, 'how'));
  // Boosters: its research-tree node (the classic Lab's Afinidad when there is no tree), then extra ones.
  const u = c.upgrades?.find((x) => x.id === g.affinity) ?? c.upgrades?.find((x) => x.id === LEGACY_AFFINITY[g.affinity]);
  const name = NODE_TEXT[g.affinity]?.name ?? u?.name ?? { es: g.affinity, en: g.affinity };
  const lvl = u && u.level > 0 ? ` · ${tr(MS.bhLevel, L, { n: u.level })}` : '';
  const locked = u && !u.unlocked ? `<span class="mo-bh-lock">${moIcon('lock', 12)}${esc(tr(MS.bhLocked, L, { hint: u.unlockHint[L] }))}</span>` : '';
  const jump = c.canJump && (!u || u.unlocked) ? `<button type="button" class="mo-bh-go" data-up="${u?.id ?? g.affinity}">${esc(tr(MS.see, L))}</button>` : '';
  let boost = `<p><b>${esc(name[L])}</b>${esc(lvl)} · ${esc(affinityStepText(L))}</p>${locked}`;
  for (const e of c.extra ?? []) boost += `<p class="mo-bh-extra"><b>${esc(e.name[L])}</b> · ${esc(e.why[L])}</p>`;
  out.push(row('upgrade', tr(MS.bhBoost, L), boost, 'boost', jump));
  if (g.note) out.push(row(g.note.kind === 'risk' ? 'warn' : 'info', tr(g.note.kind === 'risk' ? MS.bhRisk : MS.bhRule, L), `<p>${esc(g.note.text[L])}</p>`, `note ${g.note.kind}`));
  return `<div class="mo-bh-rows">${out.join('')}</div>`;
}

// ───────────────────────────── the guide ─────────────────────────────

export interface BehaviorGuideOpts {
  lang(): Lang;
  reduceMotion?(): boolean;
  /** Behaviours already seen (view.behaviorsSeen); unseen ones are silhouettes. Default: all seen. */
  seen?(): readonly Behavior[];
  upgrades?(): readonly UpgradeView[];
  /** "Ver" next to a booster: open the Lab on that upgrade. Hidden when not given. */
  onShowUpgrade?(upgradeId: string): void;
  extraBoosters?(b: Behavior): readonly ExtraBooster[];
  /** The player's name for a catalog species once found (the example shows it instead of "?"). */
  knownName?(latin: string): string | null;
  /**
   * The ways of moving this game can actually grow (sessions cycle: game/worlds REACHABLE_BEHAVIORS).
   * The others are not listed at all: never a "?" the player can never fill. Default: all six.
   */
  reachable?(): readonly Behavior[] | null;
}

export interface BehaviorGuide {
  readonly el: HTMLElement;
  /** Scroll to and highlight one behaviour. */
  focus(b: Behavior): void;
  refresh(): void;
  dispose(): void;
}

/** One rAF for every running guide diagram. */
const running = new Set<{ illus: Illustration; alive(): boolean }>();
let raf = 0;
function tick(): void {
  raf = 0;
  const t = performance.now() / 1000;
  for (const r of [...running]) {
    if (!r.alive()) {
      running.delete(r);
      continue;
    }
    r.illus.frame(t);
  }
  if (running.size) raf = requestAnimationFrame(tick);
}

export function createBehaviorGuide(container: HTMLElement, opts: BehaviorGuideOpts): BehaviorGuide {
  const el = document.createElement('section');
  el.className = 'mo-bh';
  container.appendChild(el);
  let disposed = false;
  let mine: { illus: Illustration; alive(): boolean }[] = [];
  let lastKey = '';

  function render(force = false): void {
    const L = opts.lang();
    const seen = opts.seen?.() ?? BEHAVIOR_ORDER;
    const ups = opts.upgrades?.() ?? [];
    const can = opts.reachable?.() ?? null;
    const order = can ? BEHAVIOR_ORDER.filter((b) => can.includes(b) || seen.includes(b)) : BEHAVIOR_ORDER;
    const key = JSON.stringify([L, seen, order, ups.map((u) => [u.id, u.level, u.unlocked])]);
    if (!force && key === lastKey) return;
    lastKey = key;
    for (const m of mine) running.delete(m);
    mine = [];
    const n = order.filter((b) => seen.includes(b)).length;
    el.innerHTML = `
      <header class="mo-bh-h">
        <span class="mo-bh-hi">${moIcon('behavior', 22)}</span>
        <div><h3>${esc(tr(MS.bhGuide, L))}</h3><p>${esc(tr(MS.bhIntro, L))}</p></div>
        <span class="mo-bh-n">${esc(tr(MS.bhSeen, L, { n, total: order.length }))}</span>
      </header>
      <div class="mo-bh-grid">
        ${order.map((b) => {
          const g = behaviorGuide(b);
          const unseen = !seen.includes(b);
          return `<article class="mo-bh-e${unseen ? ' unseen' : ''}" data-b="${b}" style="--b-c:var(--bl-beh-${b}, ${BEHAVIOR_COLOR[b]})" tabindex="-1">
            <div class="mo-bh-eh"><span class="mo-bh-glyph">${moIcon(b, 20)}</span><b>${esc(g.name[L])}</b>${
              unseen ? `<span class="mo-bh-q">?</span>` : `<small>${esc(g.see[L])}</small>`
            }</div>
            <div class="mo-bh-anim"><canvas></canvas>${unseen ? '<span class="mo-bh-sil">?</span>' : ''}</div>
            ${behaviorRowsHtml(b, { lang: L, upgrades: ups, showWhat: true, unseen, canJump: !!opts.onShowUpgrade, extra: opts.extraBoosters?.(b), knownName: opts.knownName })}
          </article>`;
        }).join('')}
      </div>`;
    for (const art of el.querySelectorAll<HTMLElement>('.mo-bh-e')) {
      const b = art.dataset.b as Behavior;
      const cv = art.querySelector('canvas') as HTMLCanvasElement;
      const illus = new Illustration(cv, b, { lang: L, data: { behavior: b }, time: 0, rm: opts.reduceMotion?.() ?? false });
      const r = { illus, alive: () => !disposed && el.isConnected };
      mine.push(r);
      running.add(r);
    }
    if (!raf && running.size) raf = requestAnimationFrame(tick);
  }

  el.addEventListener('click', (e) => {
    const go = (e.target as HTMLElement).closest('.mo-bh-go') as HTMLElement | null;
    if (go?.dataset.up) opts.onShowUpgrade?.(go.dataset.up);
  });

  render(true);
  return {
    el,
    focus(b) {
      const art = el.querySelector<HTMLElement>(`.mo-bh-e[data-b="${b}"]`);
      if (!art) return;
      for (const a of el.querySelectorAll('.mo-bh-e.focus')) a.classList.remove('focus');
      art.classList.add('focus');
      // Scroll only the guide's own list (scrollIntoView would also scroll the page's clipped boxes).
      let sc: HTMLElement | null = art.parentElement;
      while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
      if (sc) sc.scrollTo({ top: sc.scrollTop + art.getBoundingClientRect().top - sc.getBoundingClientRect().top - 8, behavior: opts.reduceMotion?.() ? 'auto' : 'smooth' });
      art.focus({ preventScroll: true });
    },
    refresh: () => render(),
    dispose() {
      disposed = true;
      for (const m of mine) running.delete(m);
      el.remove();
    },
  };
}

export interface BehaviorGuideSheet {
  readonly el: HTMLElement;
  readonly isOpen: boolean;
  open(focus?: Behavior | null): void;
  refresh(): void;
  close(): void;
  dispose(): void;
}

/** The guide as a sheet over the game (Bestiary header, status pills, species cards, Momentos). */
export function createBehaviorGuideSheet(root: HTMLElement, opts: BehaviorGuideOpts & { onClose?(): void }): BehaviorGuideSheet {
  const layer = document.createElement('div');
  layer.className = 'mo-sp-layer mo-bh-layer';
  layer.hidden = true;
  const scrim = document.createElement('div');
  scrim.className = 'mo-sp-scrim';
  const sheet = document.createElement('div');
  sheet.className = 'mo-sp mo-bh-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'mo-sp-x mo-bh-x';
  close.innerHTML = moIcon('close', 20);
  const body = document.createElement('div');
  body.className = 'mo-bh-body';
  sheet.append(close, body);
  layer.append(scrim, sheet);
  root.appendChild(layer);
  let guide: BehaviorGuide | null = null;
  let open = false;

  const api: BehaviorGuideSheet = {
    el: layer,
    get isOpen() {
      return open;
    },
    open(focus) {
      const L = opts.lang();
      close.setAttribute('aria-label', tr(MS.close, L));
      sheet.setAttribute('aria-label', tr(MS.bhGuide, L));
      guide?.dispose();
      guide = createBehaviorGuide(body, opts);
      layer.hidden = false;
      layer.classList.toggle('rm', !!opts.reduceMotion?.());
      open = true;
      requestAnimationFrame(() => {
        layer.classList.add('show');
        if (focus) guide?.focus(focus);
      });
    },
    refresh() {
      guide?.refresh();
    },
    close() {
      if (!open) return;
      open = false;
      layer.classList.remove('show');
      setTimeout(() => {
        if (!open) {
          layer.hidden = true;
          guide?.dispose();
          guide = null;
        }
      }, 220);
      opts.onClose?.();
    },
    dispose() {
      window.removeEventListener('keydown', onKey);
      guide?.dispose();
      layer.remove();
    },
  };
  close.addEventListener('click', () => api.close());
  scrim.addEventListener('click', () => api.close());
  const onKey = (e: KeyboardEvent) => {
    if (open && e.key === 'Escape') api.close();
  };
  window.addEventListener('keydown', onKey);
  return api;
}
