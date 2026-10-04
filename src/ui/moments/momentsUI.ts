/**
 * Momentos UI: renders src/moments on top of the game.
 *
 *  full card   the game slows to a stop (timeScale 1 → 0 in ~0.45 s), the
 *              camera zooms on the event, the rest of the dish dims around a
 *              soft spotlight with a pulsing ring and a bouncing arrow, and a
 *              card slides up: icon + big title, a looping diagram drawn from
 *              real Lenia, VELA's animated portrait saying 1–2 short lines,
 *              consequence chips, a big "¡Entendido!" and "No volver a
 *              explicar". Closing eases the camera back and fades the game in.
 *  brief       no pause: a big animated label pinned to the event for ~3 s.
 *  replay      the help sheet re-watches a card: no pause, no camera.
 *
 * Mobile first (390×844), also 1366×768 (card beside the event). es/en, light
 * and dark themes, honours reduce motion (no camera move, fades, still
 * diagrams). Runs one rAF loop only while something is on screen.
 */
import './moments.css';
import { wrapDelta, type Camera } from '../../core/camera';
import type { Behavior, Lang, Pattern, UpgradeView } from '../../core/types';
import { BRIEF_MS } from '../../moments/config';
import type { Moments } from '../../moments/moments';
import type { Chip, MomentAction, MomentId, MomentView, UiTarget } from '../../moments/types';
import { Portrait } from '../story/portraits';
import { behaviorRowsHtml, createBehaviorGuideSheet, type BehaviorGuideSheet, type ExtraBooster } from './behavior-guide';
import { createHelp, type HelpSheet } from './help';
import { moIcon } from './icons';
import { Illustration, type CompareSide } from './illustrations';
import { compareSpecies, createSpeciesCompare, speciesBreakdown, type SpeciesCardInput, type SpeciesCompare } from './species-card';
import { MS, tr } from './strings';

/** The slice of the story Portrait the card needs (a factory can supply another). */
export interface PortraitLike {
  readonly canvas: HTMLCanvasElement;
  set(speaker: 'vela', mood: 'neutral' | 'happy' | 'worried' | 'awed'): void;
  frame(t: number, dt: number, talkTarget: number, talking: boolean): void;
  state: { reduceMotion: boolean };
}

export type MomentsSound = 'open' | 'blip' | 'close' | 'brief';

export interface MomentsUIOptions {
  /** The shared camera (grid ⇄ dish canvas pixels). */
  camera: Camera;
  /** Viewport rect of the dish canvas (the camera's view box), or null when hidden. */
  getDishRect(): DOMRect | null;
  lang(): Lang;
  reduceMotion?(): boolean;
  /** Stop (true) / resume (false) the simulation + economy. Prefer timeScale() for a smooth ease. */
  onPause?(on: boolean): void;
  /** The camera was moved by a moment (each animated frame). */
  onFocus?(x: number, y: number, zoom: number): void;
  /** Viewport rect of a UI element ('hud.essence', 'tab.bestiary', 'seed'…), or null. */
  getTargetRect?(id: UiTarget): DOMRect | null;
  /** Live grid position of a creature (overlay.creaturePos), so the zoom follows it. */
  creaturePos?(id: number): { x: number; y: number } | null;
  /** Bestiary portrait of a species, for the "new species" diagram. */
  speciesPortrait?(speciesId: string): Pattern | null;
  /** The card's primary button (e.g. 'sterilize' → actions.sterilizeDish()). */
  onAction?(action: MomentAction, id: MomentId): void;
  /** VELA (defaults to the story's animated portrait). */
  portraitFactory?(): PortraitLike;
  onSound?(kind: MomentsSound): void;
  /** Card theme; default follows <html data-theme> ('light' → paper card). */
  theme?(): 'dark' | 'light';
  /** Species card data (speciesInputFromView(view, id)): the "two species" moment compares them side by side. */
  speciesInfo?(speciesId: string): SpeciesCardInput | null;
  /** "Ver" on a species card / behaviour booster (opens the Lab on that upgrade). */
  onShowUpgrade?(upgradeId: string): void;
  /** Upgrades (view.upgrades): behaviour cards show the level of its Afinidad. */
  upgrades?(): readonly UpgradeView[];
  /** Behaviours seen (view.behaviorsSeen): the Behaviour Guide shows the others as silhouettes. */
  seenBehaviors?(): readonly Behavior[];
  /** More ways to boost a behaviour (research-tree nodes, later). */
  extraBoosters?(b: Behavior): readonly ExtraBooster[];
}

export interface MomentsUI {
  /** 1 = normal … 0 = stopped. Multiply simulation steps and the economy's dt by it. */
  timeScale(): number;
  /** A card, label or replay is on screen. */
  readonly busy: boolean;
  /** Mount the "¿Qué pasó?" sheet (Settings / Bitácora). */
  mountHelp(container: HTMLElement): HelpSheet;
  /** The Behaviour Guide sheet, optionally scrolled to one behaviour (Bestiary header, status pill, species card). */
  openBehaviorGuide(focus?: Behavior | null): void;
  /** Re-render texts after a language change. */
  relabel(): void;
  readonly debug: {
    /** Freeze the animation clock at t seconds after the moment opened (null = run). */
    freezeAt(t: number | null): void;
    finishTyping(): void;
    /** Simulate every diagram clip now (screenshots). */
    prepare(): void;
  };
  dispose(): void;
}

const SLOW_S = 0.45;
const CAM_S = 0.8;
const RESUME_S = 0.6;
const EXIT_S = 0.5;
const CPS = 38;
/** Typical creature radius in cells (Orbium ≈ 10, kernel R = 13). */
const CREATURE_CELLS = 12;
/** On-screen width the zoom aims for (CSS px). */
const TARGET_PX = 150;
/** A grid moment always zooms in at least this much (the eye follows the motion). */
const MIN_ZOOM = 1.25;

const ease = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

interface CamState {
  zoom: number;
  cx: number;
  cy: number;
}

interface Active {
  m: MomentView;
  phase: 'enter' | 'open' | 'exit';
  /** Clock time when the moment opened / the phase started. */
  openedAt: number;
  phaseAt: number;
  saved: CamState | null;
  target: CamState | null;
  paused: boolean;
  illus: Illustration | null;
  typed: number;
  full: string;
  lastBlip: number;
}

function chipHtml(c: Chip, L: Lang): string {
  const ic = c.icon ? moIcon(c.icon, 16) : '';
  return `<span class="mo-chip t-${c.tone}">${ic}<span>${escapeHtml(c.text[L])}</span></span>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}

function themeNow(opts: MomentsUIOptions): 'dark' | 'light' {
  if (opts.theme) return opts.theme();
  try {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function createMomentsUI(root: HTMLElement, moments: Moments, opts: MomentsUIOptions): MomentsUI {
  const rm = () => opts.reduceMotion?.() ?? false;
  const L = () => opts.lang();
  const cam = opts.camera;

  // ───────────── DOM ─────────────
  const layer = document.createElement('div');
  layer.className = 'mo';
  try {
    if (getComputedStyle(root).position === 'static') layer.style.position = 'fixed';
  } catch {
    /* non-DOM env */
  }
  const spot = document.createElement('canvas');
  spot.className = 'mo-spot';
  const catcher = document.createElement('div');
  catcher.className = 'mo-catch';
  const card = document.createElement('div');
  card.className = 'mo-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'mo-title');
  card.hidden = true;
  const head = document.createElement('div');
  head.className = 'mo-head';
  const headIcon = document.createElement('span');
  headIcon.className = 'mo-head-ic';
  const title = document.createElement('h2');
  title.className = 'mo-title';
  title.id = 'mo-title';
  const pausedTag = document.createElement('span');
  pausedTag.className = 'mo-paused';
  const titles = document.createElement('div');
  titles.className = 'mo-titles';
  titles.append(pausedTag, title);
  head.append(headIcon, titles);
  const illusBox = document.createElement('div');
  illusBox.className = 'mo-illus';
  const illusCanvas = document.createElement('canvas');
  illusBox.appendChild(illusCanvas);
  const cmpBox = document.createElement('div');
  cmpBox.className = 'mo-cmpbox';
  cmpBox.hidden = true;
  let cmp: SpeciesCompare | null = null;
  const talk = document.createElement('div');
  talk.className = 'mo-talk';
  const velaWrap = document.createElement('div');
  velaWrap.className = 'mo-vela';
  const portrait: PortraitLike = opts.portraitFactory ? opts.portraitFactory() : (new Portrait('mo-vela-cv') as unknown as PortraitLike);
  velaWrap.appendChild(portrait.canvas);
  const linesEl = document.createElement('div');
  linesEl.className = 'mo-lines';
  linesEl.setAttribute('aria-live', 'polite');
  const talkCol = document.createElement('div');
  const talkLabel = document.createElement('small');
  talkLabel.className = 'mo-talk-label';
  talkLabel.hidden = true;
  talkCol.append(talkLabel, linesEl);
  talk.append(velaWrap, talkCol);
  // Behaviour Momentos: what changes, how to get more, how to boost it (+ the guide).
  const bhBox = document.createElement('div');
  bhBox.className = 'mo-bhbox';
  bhBox.hidden = true;
  const chipsEl = document.createElement('div');
  chipsEl.className = 'mo-chips';
  const actions = document.createElement('div');
  actions.className = 'mo-actions';
  const primary = document.createElement('button');
  primary.type = 'button';
  primary.className = 'mo-btn mo-primary';
  const okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.className = 'mo-btn mo-ok';
  const neverBtn = document.createElement('button');
  neverBtn.type = 'button';
  neverBtn.className = 'mo-never';
  actions.append(primary, okBtn, neverBtn);
  card.append(head, illusBox, cmpBox, talk, bhBox, chipsEl, actions);
  const briefEl = document.createElement('div');
  briefEl.className = 'mo-brief';
  briefEl.hidden = true;
  briefEl.setAttribute('role', 'status');
  layer.append(spot, catcher, card, briefEl);
  root.appendChild(layer);
  const sctx = spot.getContext('2d');

  // ───────────── state ─────────────
  let act: Active | null = null;
  let brief: { m: MomentView; at: number } | null = null;
  let raf = 0;
  let last = 0;
  let frozen: number | null = null;
  let disposed = false;
  const clock = () => performance.now() / 1000;

  function anyOn(): boolean {
    return !!act || !!brief;
  }

  function kick(): void {
    if (raf || disposed) return;
    last = clock();
    raf = requestAnimationFrame(loop);
  }

  // ───────────── geometry ─────────────

  function dishRect(): DOMRect | null {
    try {
      return opts.getDishRect();
    } catch {
      return null;
    }
  }

  function layerRect(): DOMRect {
    return layer.getBoundingClientRect();
  }

  /** Grid point → layer-local px. */
  function gridToLocal(x: number, y: number): { x: number; y: number } | null {
    const d = dishRect();
    if (!d) return null;
    const lr = layerRect();
    const p = cam.gridToScreen(x, y);
    return { x: d.left - lr.left + p.x, y: d.top - lr.top + p.y };
  }

  function focusGrid(m: MomentView): { x: number; y: number } | null {
    const g = m.focus.grid;
    if (!g) return null;
    if (g.id !== null) {
      try {
        const p = opts.creaturePos?.(g.id);
        if (p) return p;
      } catch {
        /* fall back to the event position */
      }
    }
    return { x: g.x, y: g.y };
  }

  /** The main creature and the others to keep in view (live positions when known). */
  function focusPoints(m: MomentView): { x: number; y: number }[] {
    const main = focusGrid(m);
    if (!main) return [];
    const out = [main];
    for (const o of m.focus.others ?? []) {
      let p: { x: number; y: number } | null = null;
      if (o.id !== null) {
        try {
          p = opts.creaturePos?.(o.id) ?? null;
        } catch {
          p = null;
        }
      }
      out.push(p ?? { x: o.x, y: o.y });
    }
    return out;
  }

  function targetRect(m: MomentView): DOMRect | null {
    for (const id of m.focus.target ?? []) {
      if (id === 'dish') continue;
      try {
        const r = opts.getTargetRect?.(id);
        if (r && r.width > 0 && r.height > 0) return r;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  function wide(): boolean {
    const lr = layerRect();
    return lr.width >= 760 && lr.width > lr.height;
  }

  /** Where the event should appear (layer px) so the card never covers it. */
  function stagePoint(): { x: number; y: number } | null {
    const d = dishRect();
    if (!d) return null;
    const lr = layerRect();
    const left = d.left - lr.left;
    const top = d.top - lr.top;
    if (wide()) {
      const cw = card.offsetWidth || 400;
      if (card.classList.contains('left')) {
        const l2 = Math.max(left, cw + 40);
        return { x: (l2 + left + d.width) / 2, y: top + d.height / 2 };
      }
      const cardLeft = lr.width - cw - 24;
      const right = Math.min(left + d.width, cardLeft - 16);
      return { x: (left + right) / 2, y: top + d.height / 2 };
    }
    const ch = card.offsetHeight || 380;
    const cardTop = lr.height - ch - 12;
    const bottom = Math.min(top + d.height, cardTop - 12);
    return { x: left + d.width / 2, y: clamp((top + bottom) / 2, top + 60, top + d.height - 40) };
  }

  function camTarget(m: MomentView): CamState | null {
    const g = focusGrid(m);
    const base = Math.min(cam.viewW / cam.gridW, cam.viewH / cam.gridH);
    // Zoom so the creature shows ~TARGET_PX wide, never more than the moment asks for.
    const fit = TARGET_PX / (2 * CREATURE_CELLS * Math.max(0.01, base));
    const z = clamp(Math.min(m.focus.zoom, Math.max(MIN_ZOOM, fit)), 1, 3);
    if (!g || m.focus.zoom <= 1.001) return { zoom: 1, cx: cam.gridW / 2, cy: cam.gridH / 2 };
    const d = dishRect();
    const sp = stagePoint();
    // Several creatures (comparison): centre between them and zoom out until they all fit.
    const pts = focusPoints(m);
    let gx = g.x;
    let gy = g.y;
    let zz = z;
    if (pts.length > 1) {
      const dx = pts.map((p) => wrapDelta(p.x - g.x, cam.gridW));
      const dy = pts.map((p) => wrapDelta(p.y - g.y, cam.gridH));
      const minX = Math.min(...dx);
      const maxX = Math.max(...dx);
      const minY = Math.min(...dy);
      const maxY = Math.max(...dy);
      gx = g.x + (minX + maxX) / 2;
      gy = g.y + (minY + maxY) / 2;
      const span = Math.max(maxX - minX, (maxY - minY) * 1.6) + 2 * CREATURE_CELLS;
      const room = Math.min(cam.viewW, cam.viewH) * 0.75;
      zz = clamp(Math.min(z, room / (span * Math.max(0.01, base))), 1, 3);
    }
    const s1 = base * zz;
    let cx = gx;
    let cy = gy;
    if (d && sp) {
      const lr = layerRect();
      const sx = sp.x - (d.left - lr.left);
      const sy = sp.y - (d.top - lr.top);
      cx = gx - (sx - cam.viewW / 2) / s1;
      cy = gy - (sy - cam.viewH / 2) / s1;
    }
    return { zoom: zz, cx: ((cx % cam.gridW) + cam.gridW) % cam.gridW, cy: ((cy % cam.gridH) + cam.gridH) % cam.gridH };
  }

  function applyCam(from: CamState, to: CamState, k: number): void {
    const e = ease(k);
    const z = from.zoom + (to.zoom - from.zoom) * e;
    cam.zoom = z;
    if (z <= 1.0005) {
      cam.cx = cam.gridW / 2;
      cam.cy = cam.gridH / 2;
    } else {
      // At zoom ~1 the centre must be the dish centre; blend the centre in with the zoom.
      const fx = from.zoom <= 1.0005 ? cam.gridW / 2 : from.cx;
      const fy = from.zoom <= 1.0005 ? cam.gridH / 2 : from.cy;
      const tx = to.zoom <= 1.0005 ? cam.gridW / 2 : to.cx;
      const ty = to.zoom <= 1.0005 ? cam.gridH / 2 : to.cy;
      cam.cx = fx + wrapDelta(tx - fx, cam.gridW) * e;
      cam.cy = fy + wrapDelta(ty - fy, cam.gridH) * e;
    }
    opts.onFocus?.(cam.cx, cam.cy, cam.zoom);
  }

  // ───────────── card ─────────────

  function linesText(m: MomentView): string {
    return m.lines.map((l) => l[L()]).join('\n');
  }

  function renderLines(a: Active): void {
    const shown = a.full.slice(0, a.typed);
    const parts = shown.split('\n');
    const all = a.full.split('\n');
    linesEl.innerHTML = all
      .map((full, i) => {
        const s = parts[i] ?? '';
        const rest = full.slice(s.length);
        return `<p>${escapeHtml(s)}<span class="mo-rest" aria-hidden="true">${escapeHtml(rest)}</span></p>`;
      })
      .join('');
  }

  function fillCard(a: Active): void {
    const m = a.m;
    const lang = L();
    card.style.setProperty('--mo-c', m.color);
    card.dataset.theme = themeNow(opts);
    card.classList.toggle('rm', rm());
    card.classList.toggle('replay', m.replay);
    headIcon.innerHTML = moIcon(m.icon, 26);
    title.textContent = m.title[lang];
    pausedTag.innerHTML = m.replay ? '' : `${moIcon('pause', 12)}<span>${escapeHtml(tr(MS.paused, lang))}</span>`;
    pausedTag.hidden = m.replay;
    const b = behaviorOf(m);
    // A behaviour card's first chip is its bonus: the "Qué cambia" row shows it, big.
    const chips = b ? m.chips.slice(1) : m.chips;
    chipsEl.innerHTML = chips.map((c) => chipHtml(c, lang)).join('');
    chipsEl.hidden = !chips.length;
    card.classList.toggle('rich', !!b);
    talkLabel.hidden = !b;
    talkLabel.textContent = b ? tr(MS.bhWhat, lang) : '';
    bhBox.hidden = !b;
    bhBox.innerHTML = b
      ? behaviorRowsHtml(b, { lang, upgrades: opts.upgrades?.() ?? [], canJump: !!opts.onShowUpgrade && !m.replay, extra: opts.extraBoosters?.(b) })
      : '';
    if (b) {
      // "+1 Muestra" and the way to the full guide share one line.
      chipsEl.hidden = false;
      chipsEl.insertAdjacentHTML(
        'beforeend',
        `<button type="button" class="mo-bh-open" data-b="${b}" aria-label="${escapeHtml(tr(MS.bhOpen, lang))}">${moIcon('behavior', 16)}${escapeHtml(tr(MS.bhOpenShort, lang))}</button>`,
      );
    }
    if (m.action) {
      primary.hidden = false;
      primary.textContent = m.action.label[lang];
      okBtn.textContent = tr(MS.gotItPlain, lang);
      okBtn.classList.add('secondary');
    } else {
      primary.hidden = true;
      okBtn.textContent = m.replay ? tr(MS.close, lang) : tr(MS.gotIt, lang);
      okBtn.classList.remove('secondary');
    }
    neverBtn.textContent = tr(MS.never, lang);
    neverBtn.hidden = m.replay || m.action !== null;
    a.full = linesText(m);
    a.typed = Math.min(a.typed, a.full.length);
    renderLines(a);
    portrait.set('vela', m.mood);
    portrait.state.reduceMotion = rm();
  }

  /** The behaviour a card is about (behaviour Momentos only). */
  function behaviorOf(m: MomentView): Behavior | null {
    return m.id.startsWith('behavior.') ? (m.id.slice(9) as Behavior) : null;
  }

  let guideSheet: BehaviorGuideSheet | null = null;
  function openGuide(focus?: Behavior | null): void {
    guideSheet ??= createBehaviorGuideSheet(root, {
      lang: L,
      reduceMotion: rm,
      seen: opts.seenBehaviors,
      upgrades: opts.upgrades,
      onShowUpgrade: opts.onShowUpgrade
        ? (id) => {
            guideSheet?.close();
            opts.onShowUpgrade?.(id);
          }
        : undefined,
      extraBoosters: opts.extraBoosters,
    });
    guideSheet.open(focus ?? null);
  }

  /** Two real species cards side by side, with the one-sentence reason (false → use the canvas). */
  function mountCompare(m: MomentView): boolean {
    cmp?.dispose();
    cmp = null;
    cmpBox.hidden = true;
    illusBox.hidden = false;
    if (m.illustration !== 'compare') return false;
    const sa = m.data.speciesId ? (opts.speciesInfo?.(m.data.speciesId) ?? null) : null;
    const sb = m.data.otherSpeciesId ? (opts.speciesInfo?.(m.data.otherSpeciesId) ?? null) : null;
    if (!sa || !sb) return false;
    illusBox.hidden = true;
    cmpBox.hidden = false;
    cmp = createSpeciesCompare(cmpBox, sa, sb, { lang: L, reduceMotion: rm, compact: true, title: false, dense: true, onShowUpgrade: opts.onShowUpgrade, onBehavior: (b) => openGuide(b) });
    return true;
  }

  /** Canvas fallback of the comparison (when no species data is wired). */
  function compareSides(m: MomentView): CompareSide[] {
    const lang = L();
    const ids = [m.data.speciesId, m.data.otherSpeciesId];
    const infos = ids.map((id) => (id ? (opts.speciesInfo?.(id) ?? null) : null));
    const sides: CompareSide[] = ids.map((id, i) => {
      const info = infos[i];
      const name = info ? (info.catalogName ?? info.name) : i === 0 ? (m.data.speciesName ?? '?') : '?';
      return {
        name,
        portrait: info?.portrait ?? (id ? (opts.speciesPortrait?.(id) ?? null) : null),
        hue: info?.hue,
        behavior: info?.behavior ?? null,
        value: info ? speciesBreakdown(info, lang).total : '?',
        win: false,
      };
    });
    if (infos[0] && infos[1]) {
      const w = compareSpecies(infos[0], infos[1], lang).winner;
      if (w === 'a') sides[0].win = true;
      if (w === 'b') sides[1].win = true;
    }
    return sides;
  }

  function startCard(m: MomentView): void {
    const now = clock();
    const a: Active = {
      m,
      phase: 'enter',
      openedAt: now,
      phaseAt: now,
      saved: null,
      target: null,
      paused: false,
      illus: null,
      typed: 0,
      full: '',
      lastBlip: 0,
    };
    act = a;
    fillCard(a);
    if (rm()) {
      // Reduce motion: no typewriter, the whole text at once.
      a.typed = a.full.length;
      renderLines(a);
    }
    illusBox.classList.remove('ready');
    if (mountCompare(m)) {
      a.illus = null;
      chipsEl.hidden = true; // the two cards already name both species
    } else {
      a.illus = new Illustration(illusCanvas, m.illustration, {
        lang: L(),
        data: m.data,
        time: now,
        rm: rm(),
        portrait: m.data.speciesId ? (opts.speciesPortrait?.(m.data.speciesId) ?? null) : null,
        compare: m.illustration === 'compare' ? compareSides(m) : undefined,
      });
    }
    card.hidden = false;
    card.classList.remove('show');
    layer.classList.add('on');
    layer.classList.toggle('blocking', true);
    // Layout first (for the stage point), then slide in.
    void card.offsetHeight;
    placeCard(m);
    if (!m.replay) {
      a.saved = { zoom: cam.zoom, cx: cam.cx, cy: cam.cy };
      if (!rm() && (m.focus.grid || cam.zoom > 1.001 || m.focus.zoom <= 1)) a.target = camTarget(m);
    }
    opts.onSound?.('open');
    setTimeout(() => {
      if (act === a) {
        card.classList.add('show');
        okBtn.focus({ preventScroll: true });
      }
    }, m.replay || rm() ? 0 : 260);
    kick();
  }

  /**
   * Card placement: phones → bottom sheet; wide screens → beside the event.
   * A moment about a UI element only (no dish focus) puts the card on the far
   * side of that element so the arrow and the element stay visible.
   */
  function placeCard(m: MomentView): void {
    const lr = layerRect();
    const r = m.focus.grid || m.replay ? null : targetRect(m);
    const isWide = wide();
    let side: '' | 'right' | 'left' = isWide ? 'right' : '';
    let top = false;
    if (r) {
      const cx = r.left - lr.left + r.width / 2;
      if (isWide && cx > lr.width * 0.55) side = 'left';
      if (!isWide) {
        // Bottom sheet unless it would hide the element and the top would not.
        const ch = card.offsetHeight || 380;
        const y0 = r.top - lr.top;
        const y1 = r.bottom - lr.top;
        const hits = (a: number, b: number) => y1 > a && y0 < b;
        const bottomHits = hits(lr.height - 12 - ch, lr.height - 12);
        const topHits = hits(64, 64 + ch);
        top = bottomHits && !topHits;
      }
    }
    card.classList.toggle('side', side !== '');
    card.classList.toggle('left', side === 'left');
    card.classList.toggle('top', top);
  }

  function finishTyping(): void {
    if (!act) return;
    act.typed = act.full.length;
    renderLines(act);
  }

  /** Start the exit. 'dismiss' / 'never' tell the core; 'external' = the core already closed it. */
  function close(how: 'dismiss' | 'never' | 'external'): void {
    const a = act;
    if (!a || a.phase === 'exit') return;
    a.phase = 'exit';
    a.phaseAt = clock();
    card.classList.remove('show');
    layer.classList.remove('blocking');
    if (a.paused) {
      a.paused = false;
      opts.onPause?.(false);
    }
    if (a.target && a.saved) {
      // From where the camera is now back to where the player had it.
      a.target = { zoom: cam.zoom, cx: cam.cx, cy: cam.cy };
    }
    opts.onSound?.('close');
    if (how === 'dismiss') moments.dismiss();
    else if (how === 'never') moments.neverAgain();
    kick();
  }

  function finishExit(): void {
    const a = act;
    if (!a) return;
    if (a.saved && a.target) {
      cam.zoom = a.saved.zoom;
      cam.cx = a.saved.cx;
      cam.cy = a.saved.cy;
      opts.onFocus?.(cam.cx, cam.cy, cam.zoom);
    }
    act = null;
    cmp?.dispose();
    cmp = null;
    card.hidden = true;
    if (!brief) layer.classList.remove('on');
    if (sctx) sctx.clearRect(0, 0, spot.width, spot.height);
  }

  // The button always closes, even while VELA is still talking (no double taps).
  okBtn.addEventListener('click', () => close('dismiss'));
  primary.addEventListener('click', () => {
    const a = act;
    if (!a?.m.action) return;
    const action = a.m.action.id;
    const id = a.m.id;
    close('dismiss');
    opts.onAction?.(action, id);
  });
  neverBtn.addEventListener('click', () => close('never'));
  linesEl.addEventListener('click', finishTyping);
  const onBhClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    const go = t.closest('.mo-bh-go') as HTMLElement | null;
    if (go?.dataset.up) {
      // Jumping to the upgrade ends the explanation (the Lab opens underneath).
      const id = go.dataset.up;
      close('dismiss');
      opts.onShowUpgrade?.(id);
      return;
    }
    const open = t.closest('.mo-bh-open') as HTMLElement | null;
    if (open?.dataset.b) openGuide(open.dataset.b as Behavior);
  };
  bhBox.addEventListener('click', onBhClick);
  chipsEl.addEventListener('click', onBhClick);
  // Taps outside the card do nothing (the game is paused); nudge the button.
  catcher.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    okBtn.classList.remove('nudge');
    void okBtn.offsetWidth;
    okBtn.classList.add('nudge');
  });
  const onKey = (e: KeyboardEvent) => {
    if (!act || act.phase === 'exit' || guideSheet?.isOpen) return;
    if (e.key === 'Escape' || ((e.key === 'Enter' || e.key === ' ') && document.activeElement === document.body)) {
      e.preventDefault();
      close('dismiss');
    }
  };
  window.addEventListener('keydown', onKey);

  // ───────────── brief labels ─────────────

  function startBrief(m: MomentView): void {
    brief = { m, at: clock() };
    const lang = L();
    const chip = m.chips[0];
    briefEl.style.setProperty('--mo-c', m.color);
    briefEl.innerHTML = `<span class="mo-brief-ic">${moIcon(m.icon, 22)}</span><b>${escapeHtml(m.brief[lang])}</b>${
      chip ? `<span class="mo-brief-chip t-${chip.tone}">${escapeHtml(chip.text[lang])}</span>` : ''
    }`;
    briefEl.hidden = false;
    briefEl.classList.toggle('rm', rm());
    briefEl.classList.remove('show');
    void briefEl.offsetWidth;
    briefEl.classList.add('show');
    layer.classList.add('on');
    opts.onSound?.('brief');
    kick();
  }

  function endBrief(): void {
    brief = null;
    briefEl.hidden = true;
    briefEl.classList.remove('show');
    if (!act) layer.classList.remove('on');
  }

  function placeBrief(t: number): void {
    if (!brief) return;
    const m = brief.m;
    const lr = layerRect();
    let x = lr.width / 2;
    let y = lr.height * 0.3;
    const g = focusGrid(m);
    const p = g ? gridToLocal(g.x, g.y) : null;
    if (p) {
      x = p.x;
      y = p.y - 46;
    } else {
      const r = targetRect(m);
      if (r) {
        x = r.left - lr.left + r.width / 2;
        y = r.bottom - lr.top + 34;
      } else {
        const d = dishRect();
        if (d) {
          x = d.left - lr.left + d.width / 2;
          y = d.top - lr.top + d.height * 0.35;
        }
      }
    }
    const w = briefEl.offsetWidth || 160;
    const h = briefEl.offsetHeight || 40;
    x = clamp(x, w / 2 + 8, lr.width - w / 2 - 8);
    y = clamp(y, h / 2 + 8, lr.height - h / 2 - 8);
    const age = t - brief.at;
    const life = BRIEF_MS / 1000;
    const fade = age > life - 0.5 ? Math.max(0, (life - age) / 0.5) : 1;
    const bob = rm() ? 0 : Math.sin(age * 3) * 2;
    briefEl.style.transform = `translate(${(x - w / 2).toFixed(1)}px, ${(y - h / 2 + bob).toFixed(1)}px)`;
    briefEl.style.opacity = fade.toFixed(3);
  }

  // ───────────── spotlight ─────────────

  function drawSpot(a: Active, t: number): void {
    const ctx = sctx;
    if (!ctx) return;
    const lr = layerRect();
    const dpr = Math.min(2, (globalThis.devicePixelRatio as number | undefined) ?? 1);
    const W = Math.round(lr.width * dpr);
    const H = Math.round(lr.height * dpr);
    if (spot.width !== W || spot.height !== H) {
      spot.width = W;
      spot.height = H;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const since = t - a.openedAt;
    const out = a.phase === 'exit' ? 1 - Math.min(1, (t - a.phaseAt) / EXIT_S) : 1;
    const dimA = Math.min(1, since / 0.35) * out;
    if (dimA <= 0.01) return;
    const m = a.m;
    const col = m.color;
    const g = focusGrid(m);
    const p = !m.replay && g ? gridToLocal(g.x, g.y) : null;
    const r = !m.replay ? targetRect(m) : null;
    const rad = m.illustration === 'golden' ? 30 : clamp(CREATURE_CELLS * cam.scale * 1.15, 34, 120);
    ctx.save();
    ctx.fillStyle = `rgba(3,5,8,${(0.66 * dimA).toFixed(3)})`;
    ctx.fillRect(0, 0, lr.width, lr.height);
    ctx.globalCompositeOperation = 'destination-out';
    const extra = !m.replay && p ? focusPoints(m).slice(1).map((q) => gridToLocal(q.x, q.y)).filter((q): q is { x: number; y: number } => !!q) : [];
    for (const q of p ? [p, ...extra] : []) {
      const grd = ctx.createRadialGradient(q.x, q.y, rad * 0.9, q.x, q.y, rad * 1.7);
      grd.addColorStop(0, 'rgba(0,0,0,1)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(q.x, q.y, rad * 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
    if (r) {
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.beginPath();
      ctx.roundRect(r.left - lr.left - 6, r.top - lr.top - 6, r.width + 12, r.height + 12, 12);
      ctx.fill();
    }
    if (!p && !r && !m.replay && m.focus.target?.includes('dish')) {
      const d = dishRect();
      if (d) {
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.beginPath();
        ctx.roundRect(d.left - lr.left, d.top - lr.top, d.width, d.height, 16);
        ctx.fill();
      }
    }
    ctx.restore();
    const reduce = rm();
    const pulse = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(t * 4);
    // Ring + arrow on the event.
    if (p) {
      ctx.save();
      ctx.globalAlpha = dimA;
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 8]);
      ctx.lineDashOffset = reduce ? 0 : -t * 20;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad + 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      for (const q of extra) {
        ctx.save();
        ctx.globalAlpha = dimA;
        ctx.strokeStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 10;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = reduce ? 0 : t * 16;
        ctx.beginPath();
        ctx.arc(q.x, q.y, rad + pulse * 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      const up = p.y - rad - 60 > 8;
      const bob = reduce ? 0 : Math.sin(t * 5) * 6;
      const ay = up ? p.y - rad - 18 - bob : p.y + rad + 18 + bob;
      bigArrow(ctx, p.x, ay, up ? Math.PI / 2 : -Math.PI / 2, col, dimA);
    }
    if (r) {
      const x = r.left - lr.left;
      const y = r.top - lr.top;
      ctx.save();
      ctx.globalAlpha = dimA;
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(x - 6 - pulse * 2, y - 6 - pulse * 2, r.width + 12 + pulse * 4, r.height + 12 + pulse * 4, 14);
      ctx.stroke();
      ctx.restore();
      if (!p) {
        const bob = reduce ? 0 : Math.sin(t * 5) * 5;
        const below = y + r.height + 70 < lr.height * 0.55 || y < lr.height * 0.25;
        const ax = x + r.width / 2;
        const ayy = below ? y + r.height + 24 + bob : y - 24 - bob;
        bigArrow(ctx, ax, ayy, below ? -Math.PI / 2 : Math.PI / 2, col, dimA);
      }
    }
    // Essence: particles flowing from the creature to the counter.
    if (p && r && m.illustration === 'essence') {
      const x1 = r.left - lr.left + r.width / 2;
      const y1 = r.top - lr.top + r.height / 2;
      const mx = (p.x + x1) / 2;
      const my = Math.min(p.y, y1) - 60;
      ctx.save();
      ctx.globalAlpha = dimA;
      ctx.setLineDash([3, 7]);
      ctx.strokeStyle = 'rgba(91,192,235,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(mx, my, x1, y1);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 0; i < 6; i++) {
        const k = reduce ? i / 6 : (t * 0.6 + i / 6) % 1;
        const x = (1 - k) * (1 - k) * p.x + 2 * (1 - k) * k * mx + k * k * x1;
        const y = (1 - k) * (1 - k) * p.y + 2 * (1 - k) * k * my + k * k * y1;
        ctx.fillStyle = '#9EF0FF';
        ctx.shadowColor = '#5BC0EB';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function bigArrow(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, col: string, alpha: number): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(dir - Math.PI / 2);
    ctx.fillStyle = col;
    ctx.strokeStyle = '#0B0E12';
    ctx.lineWidth = 2;
    ctx.shadowColor = col;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.lineTo(-14, 0);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-6, -16);
    ctx.lineTo(6, -16);
    ctx.lineTo(6, 0);
    ctx.lineTo(14, 0);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.stroke();
    ctx.restore();
  }

  // ───────────── loop ─────────────

  function timeScaleNow(t: number): number {
    const a = act;
    if (!a || a.m.replay) return 1;
    if (a.phase === 'exit') return Math.min(1, (t - a.phaseAt) / RESUME_S);
    return 1 - ease((t - a.openedAt) / SLOW_S);
  }

  function loop(): void {
    raf = 0;
    if (disposed) return;
    const real = clock();
    const dt = Math.min(0.1, real - last);
    last = real;
    const a = act;
    const t = frozen !== null && a ? a.openedAt + frozen : real;
    if (a) {
      const since = t - a.openedAt;
      if (a.phase === 'enter') {
        if (!a.paused && !a.m.replay && timeScaleNow(t) <= 0.001) {
          a.paused = true;
          opts.onPause?.(true);
        }
        if (a.target && a.saved) applyCam(a.saved, camTarget(a.m) ?? a.target, since / CAM_S);
        if (since >= Math.max(CAM_S, SLOW_S)) {
          a.phase = 'open';
          a.phaseAt = t;
          if (!a.paused && !a.m.replay) {
            a.paused = true;
            opts.onPause?.(true);
          }
        }
      } else if (a.phase === 'exit') {
        const k = (t - a.phaseAt) / EXIT_S;
        if (a.target && a.saved) applyCam(a.target, a.saved, k);
        if (k >= 1 && (t - a.phaseAt) >= RESUME_S) finishExit();
      }
      if (act) {
        // VELA speaks.
        if (a.typed < a.full.length && frozen === null) {
          const before = Math.floor(a.typed);
          a.typed = Math.min(a.full.length, a.typed + dt * CPS);
          if (Math.floor(a.typed) !== before) {
            renderLines(a);
            if (real - a.lastBlip > 0.09) {
              a.lastBlip = real;
              opts.onSound?.('blip');
            }
          }
        }
        const talking = a.typed < a.full.length;
        portrait.frame(t, dt, talking ? 0.35 + 0.35 * Math.abs(Math.sin(t * 17)) : 0, talking);
        if (a.illus) {
          a.illus.frame(t, frozen);
          illusBox.classList.add('ready');
        }
        drawSpot(a, t);
      }
    }
    if (brief) {
      if (real - brief.at > BRIEF_MS / 1000 + 0.2) endBrief();
      else placeBrief(real);
    }
    if (anyOn()) raf = requestAnimationFrame(loop);
  }

  // ───────────── moments events ─────────────

  const offs = [
    moments.on('open', ({ moment }) => {
      if (moment.mode === 'brief') {
        startBrief(moment);
        return;
      }
      if (act) {
        // Replaced (dev / replay): drop the old one without camera games.
        if (act.paused) opts.onPause?.(false);
        if (act.saved && act.target) {
          cam.zoom = act.saved.zoom;
          cam.cx = act.saved.cx;
          cam.cy = act.saved.cy;
        }
        act = null;
      }
      startCard(moment);
    }),
    moments.on('close', ({ id }) => {
      if (brief && brief.m.id === id) endBrief();
      if (act && act.m.id === id && act.phase !== 'exit') close('external');
    }),
  ];

  // A moment already open when the UI mounts.
  const cur = moments.current();
  if (cur) {
    if (cur.mode === 'brief') startBrief(cur);
    else startCard(cur);
  }

  return {
    timeScale() {
      return timeScaleNow(frozen !== null && act ? act.openedAt + frozen : clock());
    },
    get busy() {
      return anyOn();
    },
    openBehaviorGuide(focus) {
      openGuide(focus ?? null);
    },
    mountHelp(container) {
      return createHelp(container, moments, { lang: L, reduceMotion: rm, onOpenGuide: () => openGuide() });
    },
    relabel() {
      if (act) {
        fillCard(act);
        if (cmp) mountCompare(act.m);
      }
      if (brief) startBrief(brief.m);
    },
    debug: {
      freezeAt(t) {
        frozen = t;
        if (act && t !== null) {
          act.typed = act.full.length;
          renderLines(act);
          card.classList.add('show');
        }
        kick();
      },
      finishTyping,
      prepare() {
        act?.illus?.prepare();
      },
    },
    dispose() {
      disposed = true;
      for (const off of offs) off();
      window.removeEventListener('keydown', onKey);
      if (raf) cancelAnimationFrame(raf);
      guideSheet?.dispose();
      layer.remove();
    },
  };
}
