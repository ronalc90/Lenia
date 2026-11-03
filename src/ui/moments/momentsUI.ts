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
 *
 * The card is a scientific PLATE (docs/ARTE-REALISTA.md §6.5, ./plates.ts): «LÁMINA 07» in Mono, the diagram
 * with registration marks and a 1-px leader line, panels a / b / c in time order (stills of the same real
 * simulation; the one playing now is outlined), a scale bar (1 cell = 0,7 mm), the Latin name in italics, a
 * colour key where every colour has a shape, and VELA's line as the caption «Fig. 7 · …» with her mini avatar.
 */
import './moments.css';
import type { Camera } from '../../core/camera';
import type { Behavior, Lang, Pattern, UpgradeView } from '../../core/types';
import { BRIEF_MS } from '../../moments/config';
import type { Moments } from '../../moments/moments';
import type { Chip, MomentAction, MomentId, MomentView, UiTarget, VelaMood } from '../../moments/types';
import { restartClass } from '../art/motion';
import { placeLabel, type LabelObstacles, type LabelPlacement, type LabelRequest } from '../labelPlace';
import { Portrait } from '../story/portraits';
import { behaviorRowsHtml, createBehaviorGuideSheet, type BehaviorGuideSheet, type ExtraBooster } from './behavior-guide';
import { createHelp, type HelpSheet } from './help';
import { moIcon } from './icons';
import { Illustration, ILLUS_H, ILLUS_W, type CompareSide } from './illustrations';
import { KEY_TEXT, figPrefix, momentPlateKind, plateLabel, plateOf, scaleBar, scaleText, type PlateDef, type PlateKey } from './plates';
import { compareSpecies, createSpeciesCompare, speciesBreakdown, type SpeciesCardInput, type SpeciesCompare } from './species-card';
import { MS, tr } from './strings';

/** The slice of the story Portrait the card needs (a factory can supply another). */
export interface PortraitLike {
  readonly canvas: HTMLCanvasElement;
  set(speaker: 'vela', mood: VelaMood): void;
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
  /** Living creatures' bodies on the dish canvas (overlay.bodies: x, y, r triples, dish px): a brief steps off them. */
  creatureBodies?(): { readonly discs: ArrayLike<number>; readonly n: number } | null;
  /** Where the brief is (dish px), null when it is gone: the dish's own labels keep out of it (overlay.keepClear). */
  onBriefBox?(box: { l: number; t: number; r: number; b: number } | null): void;
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
  /** The player's name for a catalog species once it is in the Bestiary (the guide's examples). */
  knownName?(latin: string): string | null;
  /** Ways of moving the game can grow (sessions: game/worlds REACHABLE_BEHAVIORS); the guide lists only these. */
  reachableBehaviors?(): readonly Behavior[] | null;
}

export interface MomentsUI {
  /** 1 = normal … 0 = stopped. Multiply simulation steps and the economy's dt by it. */
  timeScale(): number;
  /** A card, label or replay is on screen. */
  readonly busy: boolean;
  /** A paused card is on screen (not a brief label): the rest of the screen waits under its scrim. */
  readonly cardOpen: boolean;
  /** Mount the "¿Qué pasó?" sheet (Settings / Bitácora). */
  mountHelp(container: HTMLElement): HelpSheet;
  /** The Behaviour Guide sheet, optionally scrolled to one behaviour (Bestiary header, status pill, species card). */
  openBehaviorGuide(focus?: Behavior | null): void;
  /** Close the sheets opened from the dish (the behaviour guide): a session card is coming (QA4 F-05). */
  closeSheets(): void;
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
  /** The plate of this card (null: a kind without one yet). */
  plate: PlateDef | null;
  /** When its a / b / c stills were last drawn, and whether they can still change (clips not done). */
  stillsAt: number;
  stillsDone: boolean;
  /** The panel shown as "now" (outlined). */
  activePanel: number;
}

/** Tallest plate panel a / b / c, CSS px (the card must still leave the event in sight on a phone). */
const PANEL_H = 56;

/** A tiny swatch in the key's shape (12 px, currentColor): meaning never hangs on colour alone (F3). */
function keySwatch(shape: (typeof KEY_TEXT)[PlateKey]['shape']): string {
  const P: Record<typeof shape, string> = {
    dot: '<circle cx="6" cy="6" r="4.5" fill="currentColor"/>',
    ring: '<circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    square: '<rect x="1.75" y="1.75" width="8.5" height="8.5" fill="currentColor"/>',
    triangle: '<path d="M6 1.5 10.75 10H1.25Z" fill="currentColor"/>',
    drop: '<path d="M6 1.25C7.6 3.6 9.5 5.4 9.5 7.4A3.5 3.5 0 0 1 2.5 7.4C2.5 5.4 4.4 3.6 6 1.25Z" fill="currentColor"/>',
    arrowUp: '<path d="M6 10.5V2M2.75 5.25 6 2l3.25 3.25" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    plus: '<path d="M6 2v8M2 6h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    star: '<path d="M6 .75 7.3 4.7 11.25 6 7.3 7.3 6 11.25 4.7 7.3.75 6 4.7 4.7Z" fill="currentColor"/>',
    dash: '<path d="M1.5 6h9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 1.6"/>',
  };
  return `<svg class="mo-sw" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">${P[shape]}</svg>`;
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
  // «LÁMINA 07» before the pause line: the plate's number, so the player collects them (§6.5 rule 1).
  const plateTag = document.createElement('span');
  plateTag.className = 'mo-plate-no';
  const eyebrow = document.createElement('div');
  eyebrow.className = 'mo-eyebrow';
  eyebrow.append(plateTag, pausedTag);
  const titles = document.createElement('div');
  titles.className = 'mo-titles';
  titles.append(eyebrow, title);
  head.append(headIcon, titles);
  const illusBox = document.createElement('div');
  illusBox.className = 'mo-illus';
  const illusCanvas = document.createElement('canvas');
  // Registration marks at the corners and the leader line (1 px, a 2.5-px dot on the feature) over the diagram.
  const leader = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  leader.setAttribute('class', 'mo-leader');
  leader.setAttribute('viewBox', `0 0 ${ILLUS_W} ${ILLUS_H}`);
  leader.setAttribute('preserveAspectRatio', 'none');
  leader.setAttribute('aria-hidden', 'true');
  const leaderLabel = document.createElement('span');
  leaderLabel.className = 'mo-leader-l';
  illusBox.append(illusCanvas, leader, leaderLabel);
  illusBox.insertAdjacentHTML('beforeend', '<i class="mo-reg tl"></i><i class="mo-reg tr"></i><i class="mo-reg bl"></i><i class="mo-reg br"></i>');
  // Panels a / b / c in time order, then the scale bar, the Latin name and the colour key.
  const panelsEl = document.createElement('div');
  panelsEl.className = 'mo-panels';
  const plateFoot = document.createElement('div');
  plateFoot.className = 'mo-plate-foot';
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
  // VELA's line is the plate's caption: «Fig. 7 · …» (§6.5 rule 7).
  const figEl = document.createElement('span');
  figEl.className = 'mo-fig';
  const talkLabel = document.createElement('small');
  talkLabel.className = 'mo-talk-label';
  talkLabel.hidden = true;
  talkCol.append(talkLabel, figEl, linesEl);
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
  card.append(head, illusBox, panelsEl, plateFoot, cmpBox, talk, bhBox, chipsEl, actions);
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

  /** Camera centre at zoom 1: the round dish's centre, or the middle of the torus. */
  const homeX = () => cam.homeX;
  const homeY = () => cam.homeY;

  function camTarget(m: MomentView): CamState | null {
    const g = focusGrid(m);
    const base = cam.dish ? cam.scale / Math.max(1e-6, cam.zoom) : Math.min(cam.viewW / cam.gridW, cam.viewH / cam.gridH);
    // Zoom so the creature shows ~TARGET_PX wide, never more than the moment asks for.
    const fit = TARGET_PX / (2 * CREATURE_CELLS * Math.max(0.01, base));
    const z = clamp(Math.min(m.focus.zoom, Math.max(MIN_ZOOM, fit)), 1, 3);
    if (!g || m.focus.zoom <= 1.001) return { zoom: 1, cx: homeX(), cy: homeY() };
    const d = dishRect();
    const sp = stagePoint();
    // Several creatures (comparison): centre between them and zoom out until they all fit.
    const pts = focusPoints(m);
    let gx = g.x;
    let gy = g.y;
    let zz = z;
    if (pts.length > 1) {
      const dx = pts.map((p) => cam.deltaX(p.x - g.x));
      const dy = pts.map((p) => cam.deltaY(p.y - g.y));
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
    return { zoom: zz, cx: cam.wrapX(cx), cy: cam.wrapY(cy) };
  }

  function applyCam(from: CamState, to: CamState, k: number): void {
    const e = ease(k);
    const z = from.zoom + (to.zoom - from.zoom) * e;
    cam.zoom = z;
    if (z <= 1.0005) {
      cam.cx = homeX();
      cam.cy = homeY();
    } else {
      // At zoom ~1 the centre must be the dish centre; blend the centre in with the zoom.
      const fx = from.zoom <= 1.0005 ? homeX() : from.cx;
      const fy = from.zoom <= 1.0005 ? homeY() : from.cy;
      const tx = to.zoom <= 1.0005 ? homeX() : to.cx;
      const ty = to.zoom <= 1.0005 ? homeY() : to.cy;
      cam.cx = fx + cam.deltaX(tx - fx) * e;
      cam.cy = fy + cam.deltaY(ty - fy) * e;
      if (cam.dish) cam.clamp(); // the view stays over the round dish
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
    const plate = a.plate;
    plateTag.textContent = plate ? plateLabel(plate.no, lang) : '';
    plateTag.hidden = !plate;
    figEl.textContent = plate ? figPrefix(plate.no).trim() : '';
    figEl.hidden = !plate;
    card.classList.toggle('plate', !!plate);
    renderPlate(a, lang);
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
      ? behaviorRowsHtml(b, { lang, upgrades: opts.upgrades?.() ?? [], canJump: !!opts.onShowUpgrade && !m.replay, extra: opts.extraBoosters?.(b), knownName: opts.knownName })
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

  /** The plate's leader line, panels a / b / c, scale bar, Latin name and key (static parts; stills drawn later). */
  function renderPlate(a: Active, lang: Lang): void {
    const plate = a.plate;
    const m = a.m;
    leader.innerHTML = '';
    leaderLabel.textContent = '';
    leaderLabel.hidden = true;
    panelsEl.innerHTML = '';
    plateFoot.innerHTML = '';
    panelsEl.hidden = !plate;
    plateFoot.hidden = !plate;
    if (!plate) return;
    const L = plate.leader;
    if (L) {
      // From the label's top edge to the feature: a 1-px line (non-scaling) and a 2.5-px dot.
      leader.innerHTML = `<line x1="${L.lx + 6}" y1="${L.ly - 13}" x2="${L.x}" y2="${L.y}" vector-effect="non-scaling-stroke"/><circle cx="${L.x}" cy="${L.y}" r="1.4"/>`;
      leaderLabel.textContent = L.text[lang];
      leaderLabel.style.left = `${(L.lx / ILLUS_W) * 100}%`;
      leaderLabel.style.top = `${(L.ly / ILLUS_H) * 100}%`;
      leaderLabel.hidden = false;
    }
    const loop = a.illus?.loop ?? 0;
    const tags = ['a', 'b', 'c'];
    const [, , cw, ch] = plate.crop;
    panelsEl.style.setProperty('--mo-pan-ar', `${cw} / ${ch}`);
    panelsEl.innerHTML = plate.panels
      .map(
        (at, i) =>
          `<figure class="mo-pan" data-i="${i}"><canvas></canvas><figcaption><b>${tags[i]}</b><span>t = ${Math.round(at * loop)} s</span></figcaption></figure>`,
      )
      .join('');
    const bar = scaleBar(plate);
    const latin = m.data.speciesId ? (opts.speciesInfo?.(m.data.speciesId)?.scientificName ?? opts.speciesInfo?.(m.data.speciesId)?.catalogName ?? null) : null;
    const key = plate.key
      .map((k) => `<span class="mo-key k-${k}">${keySwatch(KEY_TEXT[k].shape)}<span>${escapeHtml(KEY_TEXT[k].label[lang])}</span></span>`)
      .join('');
    plateFoot.innerHTML = `<span class="mo-scale"><i style="width:${Math.round(bar.box)}px"></i><b>${scaleText(bar.mm)}</b></span>${
      latin ? `<i class="mo-latin">${escapeHtml(latin)}</i>` : ''
    }<span class="mo-keys">${key}</span>`;
    a.stillsAt = -Infinity;
    a.stillsDone = false;
    a.activePanel = -1;
  }

  /**
   * CSS sizes of the stills (their crop's aspect, at most PANEL_H tall, a third of the row wide) and of the scale
   * bar (its share of the diagram's width): measured once per card, from the laid-out frame.
   */
  function sizePlate(plate: PlateDef, figs: NodeListOf<HTMLElement>): void {
    const [, , cw, ch] = plate.crop;
    const n = Math.max(1, figs.length);
    const cell = Math.max(40, (panelsEl.clientWidth - (n - 1) * 8) / n);
    const h = Math.min(PANEL_H, (cell * ch) / cw);
    for (const f of figs) {
      const c = f.querySelector('canvas')!;
      c.style.height = `${h.toFixed(1)}px`;
      c.style.width = `${((h * cw) / ch).toFixed(1)}px`;
    }
    const bar = plateFoot.querySelector('.mo-scale i') as HTMLElement | null;
    if (bar) bar.style.width = `${Math.max(8, (illusBox.clientWidth * scaleBar(plate).box) / ILLUS_W).toFixed(1)}px`;
  }

  /** Draw the plate's stills (until the clips are all simulated) and outline the panel playing now. */
  function plateFrame(a: Active, t: number): void {
    const plate = a.plate;
    if (!plate || !a.illus || panelsEl.hidden) return;
    const figs = panelsEl.querySelectorAll<HTMLElement>('.mo-pan');
    if (!a.stillsDone && t - a.stillsAt > 0.4) {
      if (a.stillsAt === -Infinity) sizePlate(plate, figs);
      a.stillsAt = t;
      const done = a.illus.ready;
      figs.forEach((f, i) => a.illus!.still(f.querySelector('canvas')!, plate.panels[i], plate.crop));
      a.stillsDone = done;
    }
    // The panel nearest to where the loop is now (reduce motion: none, the diagram cross-fades its stills).
    let active = -1;
    if (!rm()) {
      const ph = a.illus.phase(t);
      let best = Infinity;
      plate.panels.forEach((at, i) => {
        const d = Math.abs(at - ph);
        if (d < best) {
          best = d;
          active = i;
        }
      });
    }
    if (active !== a.activePanel) {
      a.activePanel = active;
      figs.forEach((f, i) => f.classList.toggle('on', i === active));
    }
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
      knownName: opts.knownName,
      reachable: opts.reachableBehaviors,
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
      plate: plateOf(momentPlateKind(m)),
      stillsAt: -Infinity,
      stillsDone: false,
      activePanel: -1,
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
        hue: m.data.speciesId ? opts.speciesInfo?.(m.data.speciesId)?.hue : undefined,
        compare: m.illustration === 'compare' ? compareSides(m) : undefined,
      });
    }
    // The plate's panels need the diagram (its loop, its stills): drawn once it exists.
    renderPlate(a, L());
    if (!a.illus) panelsEl.hidden = true;
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
    restartClass(okBtn, 'nudge');
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

  /**
   * What a brief label must never cover (integrator review): the HUD, the dish's corner buttons, its seed
   * pill and the objective. Measured once when a brief starts (they do not move during its 3 s).
   */
  const BRIEF_AVOID = '.bl-hud, .bl-dish-ui > :not(.toasts):not([hidden]), .bl-dish > .bl-objective:not([hidden])';
  const briefAvoid: { l: number; t: number; r: number; b: number }[] = [];
  function measureBriefAvoid(): void {
    briefAvoid.length = 0;
    if (typeof document === 'undefined') return;
    const lr = layerRect();
    for (const el of document.querySelectorAll<HTMLElement>(BRIEF_AVOID)) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      briefAvoid.push({ l: r.left - lr.left, t: r.top - lr.top, r: r.right - lr.left, b: r.bottom - lr.top });
    }
  }

  function startBrief(m: MomentView): void {
    brief = { m, at: clock() };
    briefReq.slot = -1;
    measureBriefAvoid();
    const lang = L();
    const chip = m.chips[0];
    briefEl.style.setProperty('--mo-c', m.color);
    briefEl.innerHTML = `<span class="mo-brief-ic">${moIcon(m.icon, 22)}</span><b>${escapeHtml(m.brief[lang])}</b>${
      chip ? `<span class="mo-brief-chip t-${chip.tone}">${escapeHtml(chip.text[lang])}</span>` : ''
    }`;
    briefEl.hidden = false;
    briefEl.classList.toggle('rm', rm());
    restartClass(briefEl, 'show');
    layer.classList.add('on');
    opts.onSound?.('brief');
    kick();
  }

  function endBrief(): void {
    brief = null;
    briefEl.hidden = true;
    briefEl.classList.remove('show');
    if (!act) layer.classList.remove('on');
    tellBriefBox(null);
  }

  // One solver for the brief and the dish's labels (../labelPlace): the brief steps off living creatures
  // and out of the controls; the dish's labels then keep out of the brief. Reused every frame.
  const briefCtl = new Float32Array(4 * 16);
  let briefBodies = new Float32Array(3 * 64);
  const briefObs: LabelObstacles = { boxes: briefCtl, nBoxes: 0, discs: briefBodies, nDiscs: 0 };
  const briefReq: LabelRequest = { x: 0, y: 0, w: 0, h: 0, gap: 0, bounds: { l: 0, t: 0, r: 0, b: 0 }, slot: -1 };
  const briefAt: LabelPlacement = { x: 0, y: 0, slot: -1, clear: false };
  const briefBox = { l: 0, t: 0, r: 0, b: 0 };
  function tellBriefBox(box: typeof briefBox | null): void {
    try {
      opts.onBriefBox?.(box);
    } catch {
      /* the dish may be gone */
    }
  }
  /** The brief's slot next to its creature (layer px), or false: no slot clear of the controls. */
  function solveBrief(x: number, y: number, w: number, h: number, lr: DOMRect, d: DOMRect | null): boolean {
    const ox = d ? d.left - lr.left : 0;
    const oy = d ? d.top - lr.top : 0;
    let n = 0;
    for (const a of briefAvoid) {
      if (n >= 16) break;
      const k = n++ * 4;
      briefCtl[k] = a.l - 2;
      briefCtl[k + 1] = a.t - 2;
      briefCtl[k + 2] = a.r + 2;
      briefCtl[k + 3] = a.b + 2;
    }
    briefObs.nBoxes = n;
    let bodies: { readonly discs: ArrayLike<number>; readonly n: number } | null = null;
    try {
      bodies = opts.creatureBodies?.() ?? null;
    } catch {
      bodies = null;
    }
    const nb = bodies ? bodies.n : 0;
    if (briefBodies.length < nb * 3) briefBodies = briefObs.discs = new Float32Array(nb * 3);
    for (let i = 0; i < nb; i++) {
      const k = i * 3;
      briefBodies[k] = bodies!.discs[k] + ox;
      briefBodies[k + 1] = bodies!.discs[k + 1] + oy;
      briefBodies[k + 2] = bodies!.discs[k + 2];
    }
    briefObs.nDiscs = nb;
    briefReq.x = x;
    briefReq.y = y;
    briefReq.w = w;
    briefReq.h = h;
    // The old spot (its centre 46 px above the creature) is the first slot; the bob gets 2 px of air.
    briefReq.gap = Math.max(8, 46 - h / 2);
    briefReq.bounds.l = 8;
    briefReq.bounds.t = 8;
    briefReq.bounds.r = lr.width - 8;
    briefReq.bounds.b = lr.height - 8;
    if (!placeLabel(briefReq, briefObs, briefAt)) return false;
    briefReq.slot = briefAt.slot;
    return true;
  }

  function placeBrief(t: number): void {
    if (!brief) return;
    const m = brief.m;
    const lr = layerRect();
    let x = lr.width / 2;
    let y = lr.height * 0.3;
    const g = focusGrid(m);
    const p = g ? gridToLocal(g.x, g.y) : null;
    const w = briefEl.offsetWidth || 160;
    const h = briefEl.offsetHeight || 40;
    let solved = false;
    if (p) {
      solved = solveBrief(p.x, p.y, w, h, lr, dishRect());
      x = solved ? briefAt.x : p.x;
      y = solved ? briefAt.y : p.y - 46;
    } else {
      const r = targetRect(m);
      if (r) {
        x = r.left - lr.left + r.width / 2;
        // Below a target in the upper half; above one in the lower half (QA4 F-05: under the seed pill the
        // label landed on the dock's Tree button).
        const below = r.bottom - lr.top + 34;
        y = r.top + r.height / 2 - lr.top > lr.height * 0.5 ? r.top - lr.top - 34 : below;
      } else {
        const d = dishRect();
        if (d) {
          x = d.left - lr.left + d.width / 2;
          y = d.top - lr.top + d.height * 0.35;
        }
      }
    }
    x = clamp(x, w / 2 + 8, lr.width - w / 2 - 8);
    y = clamp(y, h / 2 + 8, lr.height - h / 2 - 8);
    // Step out of a control it would cover: below one in the upper half, above one in the lower half.
    for (let pass = 0; pass < 2 && !solved; pass++)
      for (const a of briefAvoid) {
        const M = 6;
        if (x + w / 2 > a.l - M && x - w / 2 < a.r + M && y + h / 2 > a.t - M && y - h / 2 < a.b + M) {
          y = (a.t + a.b) / 2 < lr.height / 2 ? a.b + M + h / 2 : a.t - M - h / 2;
          y = clamp(y, h / 2 + 8, lr.height - h / 2 - 8);
        }
      }
    const age = t - brief.at;
    const life = BRIEF_MS / 1000;
    const fade = age > life - 0.5 ? Math.max(0, (life - age) / 0.5) : 1;
    const bob = rm() ? 0 : Math.sin(age * 3) * 2;
    briefEl.style.transform = `translate(${(x - w / 2).toFixed(1)}px, ${(y - h / 2 + bob).toFixed(1)}px)`;
    briefEl.style.opacity = fade.toFixed(3);
    // Tell the dish where the brief is (dish px, with the bob's 2 px): its labels keep out of it.
    const d = dishRect();
    if (d) {
      const ox = d.left - lr.left;
      const oy = d.top - lr.top;
      briefBox.l = x - w / 2 - ox;
      briefBox.t = y - h / 2 - 2 - oy;
      briefBox.r = x + w / 2 - ox;
      briefBox.b = y + h / 2 + 2 - oy;
      tellBriefBox(briefBox);
    }
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
          plateFrame(a, t);
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
    get cardOpen() {
      return !!act && act.phase !== 'exit';
    },
    openBehaviorGuide(focus) {
      openGuide(focus ?? null);
    },
    closeSheets() {
      guideSheet?.close();
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
      tellBriefBox(null);
      layer.remove();
    },
  };
}
