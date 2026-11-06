/**
 * Research tree screen (docs/CICLO.md §4.4): a full-screen radial node graph between lab sessions.
 *
 *  - Centre node (the night) and 7 STRAIGHT routes radiating out (node k needs only node k − 1);
 *    icon tiles joined by lines (bright when owned); a "?" one step beyond what you can see; rings
 *    the night has not opened yet sit behind a dashed moon circle (rings are bands around the centre).
 *  - Pan with one finger / mouse drag, pinch or wheel to zoom, +/− and "centre" buttons (48 px).
 *  - The camera never moves by itself (docs/CLARIDAD2.md §2.10, ./camera.ts): opening frames every buyable
 *    node; a tap on a visible node leaves the camera where it is (one under the sheet moves the least it can,
 *    same zoom, and comes back when the sheet closes); a tap within 350 ms of a camera move is ignored.
 *  - «Puedes comprar (n)» at the bottom: the buyable nodes in a row (tap = its sheet), or the cheapest one.
 *  - Tap a node: a sheet with NAME, «Ruta Placa · paso 2 de 7» and its levels as dots, "antes → después" with numbers
 *    ("Sesión 3:30 → 4:00"), a one-line description, the price as an equation with its one rule in
 *    plain words (tap it: the shared "¿Por qué cuesta esto?" sheet, src/ui/moments/price.ts), a bar
 *    chart of the next levels, the "Datos have/need" bar ("te faltan 12 — unas 2 sesiones") and a
 *    big buy button. A world node shows the species that live there.
 *  - Buying: the PriceTicker next to the Datos says "−12 · Más tiempo".
 *  - Buying: the tile pops, particles burst in the branch colour, new lines grow towards the nodes
 *    it reveals, "?" tiles flip open. Reduce motion: fades only.
 *
 * The view is pure UI: it reads TreeViewData, computes states with src/game/tree.ts and asks the host
 * to buy (opts.onBuy → the host runs session.researchBuy, saves, and calls update()).
 */
import type { Lang, Pattern, Text } from '../../core/types';
import {
  BRANCHES,
  TREE_BANDS,
  TREE_BY_ID,
  TREE_EDGES,
  TREE_GATES,
  TREE_LAYOUT,
  TREE_NODES,
  TREE_RADIUS,
  beforeAfter,
  branchAngle,
  costRows,
  nightInfo,
  nightNotYetText,
  nodeText,
  priceRule,
  routeNodes,
  sessionsToAfford,
  treeEffects,
  treeStates,
  type BuyResult,
  type NodeState,
  type TreeCtx,
  type TreeNodeDef,
} from '../../game/tree';
import { BRANCH_TEXT, DATOS_NAME, SESSION_UI, TREE_UI, type BranchId } from '../../game/treeText';
import type { WorldId } from '../../game/worlds';
import { datosMissingText, fmt, fmtFactor, fmtShort, gateCount } from '../format';
import { PriceTicker, type PriceExplain } from '../moments/price';
import '../moments/moments.css';
import { mountPortrait } from '../portrait';
import { ROUTE_ICON } from '../art/icons';
import { DURATION, EASING, pop, staggerIn } from '../art/motion';
import { nodeWhy, WHY_UI } from './why';
import { D, FAR_Z, Z_MAX, Z_MIN, buyPressAllowed, freeTop, gateLabelAngle, openingCam, revealCam, tapAllowed, type Area, type Cam } from './camera';
import { treeIcon } from './icons';
import { screenChanged } from '../pressGuard';
import { DISH_DIAMETERS } from '../../core/dish';
import '../art/art.css';
import './tree.css';

export interface TreeViewData {
  levels: Readonly<Record<string, number>>;
  datos: number;
  sessions: number;
  /** Species in the Bestiary (night gates). */
  species: number;
  /** Datos of the last sessions ("unas N sesiones"). */
  recentDatos: readonly number[];
}

export type TreeSound = 'tap' | 'open' | 'close' | 'buy' | 'reveal' | 'deny' | 'night';

export interface TreeViewOptions {
  lang(): Lang;
  reduceMotion?(): boolean;
  /** Buy one level of a node; the host stores the result and calls update(). Null/!ok = refused. */
  onBuy(id: string): BuyResult | null;
  /** The big "Nueva sesión" button. */
  onNewSession?(): void;
  /** Optional × (e.g. looking at the tree from the summary). */
  onClose?(): void;
  /** The go button's label when it is not "Nueva sesión" (e.g. back to a run that waits); null = default. */
  goText?(): Text | null;
  onSound?(kind: TreeSound): void;
  /** Species of a world for its node sheet (portraits; unfound ones as silhouettes). */
  worldSpecies?(world: WorldId): { code: string; name: string; portrait: Pattern | null; found: boolean }[];
  /** Dish diameter (cells) of a Placa level on this device (core/dish dishDiameterFor, capped by quality). */
  dishDiameter?(level: number): number;
}

export interface TreeView {
  readonly el: HTMLElement;
  readonly isOpen: boolean;
  /** A node's sheet is open (it covers the lower part of the tree). */
  readonly sheetOpen: boolean;
  update(d: TreeViewData): void;
  open(): void;
  close(): void;
  /** Select a node (opens its sheet) or null. */
  select(id: string | null): void;
  /** Pan/zoom to a node. */
  focus(id: string, zoom?: number): void;
  /** Re-fit the camera to what is visible. */
  fit(): void;
  /** Rebuild texts after a language change. */
  relabel(): void;
  dispose(): void;
}

/** World half-size (layout units) for the SVG layer and the pan limits. */
const S = TREE_RADIUS + 1.8;
/** Where the night labels sit on their circles: between Mundos and Destello. */
const GATE_LABEL_ANGLE = ((-90 + 5.5 * (360 / 7)) * Math.PI) / 180;
/** Night boundaries: dashed circles between the last ring of a night and the first of the next. */
const GATES = TREE_GATES;

const tx = (t: Text, l: Lang): string => t[l];
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const branchOf = (def: TreeNodeDef): BranchId | 'core' => def.branch;

interface NodeEl {
  def: TreeNodeDef;
  el: HTMLButtonElement;
  tile: HTMLElement;
  badge: HTMLElement;
  moon: HTMLElement;
  lock: HTMLElement;
  name: HTMLElement;
  cost: HTMLElement;
  status?: NodeState['status'];
  key?: string;
}

export function createTreeView(root: HTMLElement, opts: TreeViewOptions): TreeView {
  const lang = () => opts.lang();
  const rm = () => !!opts.reduceMotion?.();
  const sound = (k: TreeSound) => opts.onSound?.(k);

  // ───────────── DOM skeleton ─────────────
  const el = document.createElement('div');
  el.className = 'rt';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.tabIndex = -1;
  el.innerHTML = `
    <div class="rt-vp"><div class="rt-world"></div></div>
    <header class="rt-top">
      <div class="rt-datos" role="status"><span class="rt-dic">${treeIcon('datos', 30)}</span><div><b>0</b><small></small></div><span class="rt-tick"></span></div>
      <div class="rt-title"><h2></h2><p></p><span class="rt-nightchip" hidden></span></div>
      <button type="button" class="rt-go">${treeIcon('play', 22)}<span></span></button>
    </header>
    <div class="rt-tools">
      <button type="button" class="rt-tool" data-z="in">${treeIcon('plus', 24)}</button>
      <button type="button" class="rt-tool" data-z="out">${treeIcon('minus', 24)}</button>
      <button type="button" class="rt-tool" data-z="fit">${treeIcon('centre', 24)}</button>
    </div>
    <div class="rt-hint"></div>
    <nav class="rt-strip"><span class="rt-strip-h"></span><div class="rt-strip-row"></div></nav>
    <section class="rt-sheet" aria-live="polite"></section>
    <div class="rt-fx"></div>`;
  root.appendChild(el);
  const vp = el.querySelector('.rt-vp') as HTMLElement;
  const topBar = el.querySelector('.rt-top') as HTMLElement;
  const world = el.querySelector('.rt-world') as HTMLElement;
  const datosEl = el.querySelector('.rt-datos') as HTMLElement;
  const datosNum = datosEl.querySelector('b') as HTMLElement;
  const datosLbl = datosEl.querySelector('small') as HTMLElement;
  const titleH = el.querySelector('.rt-title h2') as HTMLElement;
  const titleP = el.querySelector('.rt-title p') as HTMLElement;
  const nightChip = el.querySelector('.rt-nightchip') as HTMLElement;
  const goBtn = el.querySelector('.rt-go') as HTMLButtonElement;
  const goLbl = goBtn.querySelector('span') as HTMLElement;
  const hint = el.querySelector('.rt-hint') as HTMLElement;
  const strip = el.querySelector('.rt-strip') as HTMLElement;
  const stripH = strip.querySelector('.rt-strip-h') as HTMLElement;
  const stripRow = strip.querySelector('.rt-strip-row') as HTMLElement;
  const sheet = el.querySelector('.rt-sheet') as HTMLElement;
  const fx = el.querySelector('.rt-fx') as HTMLElement;
  // Shared price components (Momentos): one tap on a price explains it; a chip says what it cost.
  const ticker = new PriceTicker();
  (el.querySelector('.rt-tick') as HTMLElement).appendChild(ticker.el);

  // SVG layer: rings, night gates, fog band, edges.
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  const W = S * D;
  svg.setAttribute('class', 'rt-lines');
  svg.setAttribute('viewBox', `${-W} ${-W} ${2 * W} ${2 * W}`);
  svg.setAttribute('width', String(2 * W));
  svg.setAttribute('height', String(2 * W));
  svg.style.left = `${-W}px`;
  svg.style.top = `${-W}px`;
  const gFog = document.createElementNS(NS, 'g');
  const gRings = document.createElementNS(NS, 'g');
  const gEdges = document.createElementNS(NS, 'g');
  svg.append(gFog, gRings, gEdges);
  world.appendChild(svg);
  // Faint guide circles through the middle of every ring's band.
  for (const band of TREE_BANDS.values()) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('r', String(((band.from + band.to) / 2) * D));
    c.setAttribute('class', 'rt-ring');
    gRings.appendChild(c);
  }
  const fogPath = document.createElementNS(NS, 'path');
  fogPath.setAttribute('class', 'rt-fogband');
  fogPath.setAttribute('fill-rule', 'evenodd');
  gFog.appendChild(fogPath);
  const gateEls = GATES.map((g) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('r', String(g.r * D));
    c.setAttribute('class', 'rt-gate');
    gRings.appendChild(c);
    const label = document.createElement('div');
    label.className = 'rt-gate-label';
    label.style.left = `${Math.cos(GATE_LABEL_ANGLE) * g.r * D}px`;
    label.style.top = `${Math.sin(GATE_LABEL_ANGLE) * g.r * D}px`;
    world.appendChild(label);
    // w, h: the label's own size (measured once per text); a: the angle it sits at now.
    return { g, c, label, text: '', w: 0, h: 0, a: GATE_LABEL_ANGLE };
  });

  // Edges.
  const edgeEls = TREE_EDGES.map((e) => {
    const a = TREE_LAYOUT.get(e.from)!;
    const b = TREE_LAYOUT.get(e.to)!;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', String(a.x * D));
    line.setAttribute('y1', String(a.y * D));
    line.setAttribute('x2', String(b.x * D));
    line.setAttribute('y2', String(b.y * D));
    const def = TREE_BY_ID[e.to];
    line.setAttribute('class', `rt-edge b-${branchOf(def)}`);
    const len = Math.hypot(a.x - b.x, a.y - b.y) * D;
    line.style.setProperty('--len', String(Math.ceil(len)));
    gEdges.appendChild(line);
    return { ...e, line, len, cls: '' };
  });

  // Branch names around the rim: a compass shown when zoomed out (names under nodes hide then).
  const branchEls = BRANCHES.map((b) => {
    const a = (branchAngle(b) * Math.PI) / 180;
    const l = document.createElement('div');
    l.className = `rt-branch b-${b}`;
    l.style.left = `${Math.cos(a) * (TREE_RADIUS + 1.05) * D}px`;
    l.style.top = `${Math.sin(a) * (TREE_RADIUS + 1.05) * D}px`;
    world.appendChild(l);
    return { b, l };
  });

  // Nodes.
  const nodes = new Map<string, NodeEl>();
  for (const def of TREE_NODES) {
    const p = TREE_LAYOUT.get(def.id)!;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `rt-node b-${branchOf(def)}${def.big ? ' big' : ''}`;
    b.dataset.id = def.id;
    b.style.left = `${p.x * D}px`;
    b.style.top = `${p.y * D}px`;
    b.innerHTML = `<span class="rt-tile"></span><span class="rt-badge" hidden></span><span class="rt-moonb" hidden></span><span class="rt-lockb" hidden>${treeIcon(
      'lock',
      13,
    )}</span><span class="rt-label"><span class="rt-name"></span><span class="rt-cost" hidden></span></span>`;
    world.appendChild(b);
    nodes.set(def.id, {
      def,
      el: b,
      tile: b.querySelector('.rt-tile') as HTMLElement,
      badge: b.querySelector('.rt-badge') as HTMLElement,
      moon: b.querySelector('.rt-moonb') as HTMLElement,
      lock: b.querySelector('.rt-lockb') as HTMLElement,
      name: b.querySelector('.rt-name') as HTMLElement,
      cost: b.querySelector('.rt-cost') as HTMLElement,
    });
  }

  // ───────────── state ─────────────
  let data: TreeViewData = { levels: { lab: 1 }, datos: 0, sessions: 0, species: 0, recentDatos: [] };
  let states = new Map<string, NodeState>();
  let selected: string | null = null;
  let open = false;
  let shownDatos = 0;
  let datosTween = 0;
  let sheetKey = '';
  const cam: Cam = { x: 0, y: 0, z: 1 };
  let camAnim = 0;
  /** When the camera last moved (a tap within TAP_QUIET_MS of it is ignored). */
  let lastCamMove = -Infinity;
  let lastCamKey = '';
  /** The night labels' texts or the free area changed: place them again at the next camera apply. */
  let gatesDirty = true;
  /** Where the camera was when the sheet opened: it goes back there when the sheet closes (if the player did not pan). */
  let homeCam: Cam | null = null;
  /** The World bought this visit: «Nueva sesión» pulses with «¡Juega en el Mundo 2!». */
  let playWorld: string | null = null;
  let stripKey = '';
  /** The node of the very first purchase, while its sheet stays open ("¡Es tuya para siempre!"). */
  let firstBought: string | null = null;
  /** The node whose «¿Por qué cuesta esto?» is unfolded (one at a time; folded again on another node). */
  let whyOpenFor: string | null = null;
  /** The node the sheet last entered for (its blocks stagger in once per node). */
  let staggerFor: string | null = null;
  let peekTimer = 0;
  /** When the sheet last turned to a node (its buy button waits TAP_QUIET_MS like a node tap). */
  let sheetAt = -Infinity;
  /** When the last finger came down on the sheet (the event's timestamp: QA-3 §2). */
  let sheetPressAt = -Infinity;

  const ctxOf = (d: TreeViewData): TreeCtx => ({ levels: d.levels, datos: d.datos, sessions: d.sessions, species: d.species });
  const vpSize = () => ({ w: vp.clientWidth || window.innerWidth, h: vp.clientHeight || window.innerHeight });
  const desktop = () => vpSize().w >= 900;

  // ───────────── camera ─────────────
  function applyCam(): void {
    const key = `${cam.x.toFixed(1)}|${cam.y.toFixed(1)}|${cam.z.toFixed(4)}`;
    if (key !== lastCamKey || gatesDirty) {
      if (key !== lastCamKey) lastCamMove = performance.now();
      lastCamKey = key;
      placeGateLabels();
    }
    world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`;
    el.classList.toggle('far', cam.z < FAR_Z);
    // Route names and night labels keep a readable size on screen when zoomed far out.
    world.style.setProperty('--rt-iz', String(Math.min(3, Math.max(1, 0.45 / cam.z))));
    world.style.setProperty('--rt-izg', String(Math.min(4, Math.max(1, 0.8 / cam.z))));
    // …and the buyable nodes' prices too: the opening frame of a big tree can be far out (./camera openingCam).
    world.style.setProperty('--rt-ic', String(Math.min(2.6, Math.max(1, 0.62 / cam.z))));
  }
  /**
   * Night labels slide along their dashed circles so all of each stays inside the free area, or hide when
   * none of the circle is on screen (./camera gateLabelAngle; integrator review v0.023: «ne 2»).
   */
  function placeGateLabels(): void {
    if (!open) return;
    gatesDirty = false;
    let area: Area | null = null;
    // On-screen scale of a label: the world's zoom times its own counter-scale (--rt-izg above).
    const k = (cam.z * Math.min(4, Math.max(1, 0.8 / cam.z))) / 2;
    for (const ge of gateEls) {
      if (ge.label.hidden) continue;
      if (!ge.w) {
        ge.w = ge.label.offsetWidth;
        ge.h = ge.label.offsetHeight;
        if (!ge.w) continue;
      }
      area ??= freeArea(false);
      const a = gateLabelAngle(cam, ge.g.r * D, { w: ge.w * k, h: ge.h * k }, area, GATE_LABEL_ANGLE);
      const vis = a === null ? 'hidden' : '';
      if (ge.label.style.visibility !== vis) ge.label.style.visibility = vis;
      if (a !== null && a !== ge.a) {
        ge.a = a;
        ge.label.style.left = `${Math.cos(a) * ge.g.r * D}px`;
        ge.label.style.top = `${Math.sin(a) * ge.g.r * D}px`;
      }
    }
  }
  function clampCam(): void {
    const { w, h } = vpSize();
    cam.z = Math.min(Z_MAX, Math.max(Z_MIN, cam.z));
    const lim = S * D * cam.z * 0.85;
    cam.x = Math.min(w / 2 + lim, Math.max(w / 2 - lim, cam.x));
    cam.y = Math.min(h / 2 + lim, Math.max(h / 2 - lim, cam.y));
  }
  /** Screen point where the world origin should sit so world point (wx, wy) shows at (sx, sy). */
  function animateTo(wx: number, wy: number, z: number, sx: number, sy: number): void {
    const target = { z: Math.min(Z_MAX, Math.max(Z_MIN, z)), x: 0, y: 0 };
    target.x = sx - wx * target.z;
    target.y = sy - wy * target.z;
    cancelAnimationFrame(camAnim);
    if (rm()) {
      Object.assign(cam, target);
      clampCam();
      applyCam();
      return;
    }
    const from = { ...cam };
    const t0 = performance.now();
    const dur = 380;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      cam.x = from.x + (target.x - from.x) * e;
      cam.y = from.y + (target.y - from.y) * e;
      cam.z = from.z + (target.z - from.z) * e;
      clampCam();
      applyCam();
      camAnim = k < 1 ? requestAnimationFrame(step) : 0;
    };
    camAnim = requestAnimationFrame(step);
  }
  function zoomAt(factor: number, sx: number, sy: number): void {
    const z = Math.min(Z_MAX, Math.max(Z_MIN, cam.z * factor));
    const wx = (sx - cam.x) / cam.z;
    const wy = (sy - cam.y) / cam.z;
    cam.z = z;
    cam.x = sx - wx * z;
    cam.y = sy - wy * z;
    clampCam();
    applyCam();
  }
  /**
   * The visible area (viewport px) minus the top bar and VELA's dock, the strip at the bottom and (on phones)
   * the open sheet. The bar is measured: on a 390-px phone it wraps to two rows (Datos + button, then the
   * title) and a fixed inset let it cover the top node.
   */
  function freeArea(withSheet = true): Area {
    const { w, h } = vpSize();
    const bar = topBar.getBoundingClientRect();
    const vpTop = vp.getBoundingClientRect().top;
    // VELA docked at the top of the Tree (QA4 F-01) is part of the bar: no node under her bubble (./camera freeTop).
    const dock = document.querySelector('.sty.sty-docked .sty-box:not([hidden])')?.getBoundingClientRect();
    const top = freeTop(bar.height > 0 ? bar.bottom - vpTop : 0, dock && dock.height > 0 ? { top: dock.top - vpTop, bottom: dock.bottom - vpTop } : null, h);
    // Room for the strip and the first visit's hint at the bottom: no node under them.
    const low = Math.max(strip.offsetHeight, hint.offsetHeight + (strip.offsetHeight ? strip.offsetHeight + 8 : 0));
    let bottom = low > 0 ? low + 24 : 18;
    let right = 0;
    if (withSheet && selected && open) {
      if (desktop()) right = 410;
      else bottom = Math.max(bottom, Math.min(h * 0.66, (sheet.offsetHeight || h * 0.5) + 8));
    }
    return { left: 0, top, right: w - right, bottom: Math.max(top + 60, h - bottom) };
  }
  /** Frame what can be bought (./camera openingCam): on open, on «centrar», when VELA docks. */
  function fitView(animate = true): void {
    const c = openingCam(states, freeArea(false));
    if (animate) animateTo(0, 0, c.z, c.x, c.y);
    else {
      Object.assign(cam, c);
      clampCam();
      applyCam();
    }
  }
  /** Bring a node into the free area with the least move and no zoom change (null move = it already shows). */
  function revealNode(id: string): void {
    const p = TREE_LAYOUT.get(id);
    if (!p) return;
    const next = revealCam(cam, { x: p.x * D, y: p.y * D }, freeArea());
    if (next) animateTo(0, 0, next.z, next.x, next.y);
  }
  /** Pan/zoom to a node (API `focus`, deliberate navigation only: never on a tap). */
  function focusNode(id: string, zoom?: number): void {
    const p = TREE_LAYOUT.get(id);
    if (!p) return;
    const a = freeArea();
    animateTo(p.x * D, p.y * D, zoom ?? Math.max(cam.z, 0.95), (a.left + a.right) / 2, (a.top + a.bottom) / 2);
  }

  // ───────────── input: pan, pinch, wheel, taps ─────────────
  const pointers = new Map<number, { x: number; y: number }>();
  /** `at`: when the camera last moved before this touch began (a tap counts only on a still camera). */
  let drag: { sx: number; sy: number; cx: number; cy: number; moved: boolean; node: string | null; at: number } | null = null;
  let pinch: { d: number; z: number; mx: number; my: number; wx: number; wy: number } | null = null;
  let suppressClickUntil = 0;

  function local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const r = vp.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  vp.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    try {
      vp.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
    const animating = camAnim !== 0;
    cancelAnimationFrame(camAnim);
    camAnim = 0;
    if (pointers.size === 1) {
      const nodeEl = (e.target as HTMLElement).closest('.rt-node') as HTMLElement | null;
      drag = { sx: p.x, sy: p.y, cx: cam.x, cy: cam.y, moved: false, node: nodeEl?.dataset.id ?? null, at: animating ? performance.now() : lastCamMove };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: cam.z, mx, my, wx: (mx - cam.x) / cam.z, wy: (my - cam.y) / cam.z };
      if (drag) drag.moved = true;
    }
  });
  vp.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      homeCam = null;
      cam.z = Math.min(Z_MAX, Math.max(Z_MIN, (pinch.z * d) / pinch.d));
      cam.x = mx - pinch.wx * cam.z;
      cam.y = my - pinch.wy * cam.z;
      clampCam();
      applyCam();
      return;
    }
    if (!drag) return;
    const dx = p.x - drag.sx;
    const dy = p.y - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > 7) {
      drag.moved = true;
      vp.classList.add('dragging');
    }
    if (drag.moved) {
      homeCam = null;
      cam.x = drag.cx + dx;
      cam.y = drag.cy + dy;
      clampCam();
      applyCam();
    }
  });
  const end = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size > 0) return;
    vp.classList.remove('dragging');
    const d = drag;
    drag = null;
    if (!d || d.moved || e.type === 'pointercancel') return;
    suppressClickUntil = performance.now() + 450;
    // QA-CLARIDAD #12: a tap that lands while (or just after) the camera moves is not aimed at what is under it.
    if (!tapAllowed(performance.now(), d.at)) return;
    if (d.node) tapNode(d.node);
    else if (selected) api.select(null);
    // First visit, nothing bought yet (QA4 F-11): a tap anywhere on the tree opens the green node the
    // hand points at, so a child who taps "somewhere" still finds the sheet with its big "Comprar".
    else if (guideNode()) tapNode(guideNode()!);
  };
  vp.addEventListener('pointerup', end);
  vp.addEventListener('pointercancel', end);
  vp.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      homeCam = null;
      const p = local(e);
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), p.x, p.y);
    },
    { passive: false },
  );
  // Keyboard activation of a node button (Tab + Enter/Space).
  world.addEventListener('click', (e) => {
    if (performance.now() < suppressClickUntil || !tapAllowed(performance.now(), lastCamMove)) return;
    const n = (e.target as HTMLElement).closest('.rt-node') as HTMLElement | null;
    if (n?.dataset.id) tapNode(n.dataset.id);
  });
  el.addEventListener('keydown', (e) => {
    if (!open) return;
    const { w, h } = vpSize();
    if (e.key === 'Escape') {
      if (selected) api.select(null);
      else opts.onClose?.();
    } else if (e.key === '+' || e.key === '=') zoomAt(1.2, w / 2, h / 2);
    else if (e.key === '-') zoomAt(1 / 1.2, w / 2, h / 2);
    else if (e.key.startsWith('Arrow') && !(e.target as HTMLElement).closest('.rt-sheet')) {
      const s = 60;
      cam.x += e.key === 'ArrowLeft' ? s : e.key === 'ArrowRight' ? -s : 0;
      cam.y += e.key === 'ArrowUp' ? s : e.key === 'ArrowDown' ? -s : 0;
      clampCam();
      applyCam();
    }
  });
  el.querySelector('.rt-tools')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('.rt-tool') as HTMLElement | null;
    if (!b) return;
    const { w, h } = vpSize();
    sound('tap');
    homeCam = null;
    if (b.dataset.z === 'in') zoomAt(1.3, w / 2, h / 2);
    else if (b.dataset.z === 'out') zoomAt(1 / 1.3, w / 2, h / 2);
    else fitView();
  });
  goBtn.addEventListener('click', () => {
    sound('tap');
    opts.onNewSession?.();
  });

  function tapNode(id: string): void {
    const st = states.get(id);
    if (!st || st.status === 'hidden') return;
    el.classList.add('touched');
    sound('open');
    api.select(id);
  }

  // ───────────── rendering ─────────────
  function nodeLabel(def: TreeNodeDef, l: Lang): string {
    return tx(nodeText(def.id).name, l);
  }

  function renderNodes(): void {
    const l = lang();
    const night = nightInfo(ctxOf(data));
    for (const n of nodes.values()) {
      const st = states.get(n.def.id)!;
      const key = `${st.status}|${st.level}|${st.affordable}|${st.cost}|${st.nightNeeded}|${l}|${selected === n.def.id}|${n.def.id === 'lab' ? night.ready : ''}`;
      if (key === n.key) continue;
      n.key = key;
      const hidden = st.status === 'hidden';
      n.el.hidden = hidden;
      if (hidden) continue;
      const mystery = st.status === 'mystery';
      const c = n.el.classList;
      for (const s of ['owned', 'available', 'locked', 'mystery']) c.toggle(`st-${s}`, st.status === s);
      c.toggle('can', st.affordable && n.def.id !== 'lab');
      c.toggle('max', st.maxed && n.def.maxLevel > 1);
      c.toggle('sel', selected === n.def.id);
      c.toggle('ready', n.def.id === 'lab' && night.ready && st.block !== 'maxed');
      n.tile.innerHTML = treeIcon(mystery ? 'question' : n.def.icon, n.def.big ? 46 : 32);
      const name = mystery ? '' : n.def.id === 'lab' ? tx(TREE_UI.night(st.level), l) : nodeLabel(n.def, l);
      n.name.textContent = name;
      n.el.setAttribute(
        'aria-label',
        mystery ? (st.nightNeeded ? tx(TREE_UI.nightLocked(st.nightNeeded), l) : tx(TREE_UI.mystery, l)) : `${nodeLabel(n.def, l)} · ${st.level}/${st.maxLevel}`,
      );
      // Level badge: "2/5" (multi-level), ✓ (owned single level).
      const showBadge = !mystery && n.def.id !== 'lab' && (n.def.maxLevel > 1 ? st.level > 0 : st.level > 0);
      n.badge.hidden = !showBadge;
      if (showBadge) n.badge.innerHTML = n.def.maxLevel > 1 ? `${st.level}/${n.def.maxLevel >= 99 ? '∞' : n.def.maxLevel}` : treeIcon('check', 13);
      n.moon.hidden = !(mystery && st.nightNeeded);
      if (st.nightNeeded) n.moon.innerHTML = `${treeIcon('moon', 13)}${st.nightNeeded}`;
      n.lock.hidden = st.status !== 'locked';
      const showCost = !mystery && n.def.id !== 'lab' && !st.maxed && !isDeviceMax(st) && Number.isFinite(st.cost);
      n.el.classList.toggle('devmax', isDeviceMax(st));
      n.cost.hidden = !showCost;
      if (showCost) n.cost.innerHTML = `${treeIcon('datos', 12)}${fmtShort(st.cost, l)}`;
    }
  }

  function renderEdges(): void {
    for (const e of edgeEls) {
      const a = states.get(e.from)!;
      const b = states.get(e.to)!;
      let cls = '';
      if (b.status === 'hidden' || a.status === 'hidden') cls = 'hide';
      else if (a.status === 'owned' && b.status === 'owned') cls = 'on';
      else if (b.status === 'mystery' || a.status === 'mystery') cls = 'fog';
      else if (a.status === 'owned') cls = 'next';
      if (cls === e.cls) continue;
      e.cls = cls;
      e.line.style.display = cls === 'hide' ? 'none' : '';
      e.line.classList.toggle('on', cls === 'on');
      e.line.classList.toggle('next', cls === 'next');
      e.line.classList.toggle('fog', cls === 'fog');
    }
  }

  function renderGates(): void {
    const l = lang();
    const night = nightInfo(ctxOf(data)).night;
    const closed = GATES.filter((g) => g.night > night);
    let moved = false;
    for (const ge of gateEls) {
      const { g, c, label } = ge;
      const isClosed = g.night > night;
      c.style.display = isClosed ? '' : 'none';
      if (label.hidden !== !isClosed) {
        label.hidden = !isClosed;
        moved = true;
      }
      const text = tx(TREE_UI.night(g.night), l);
      if (ge.text !== text) {
        ge.text = text;
        label.innerHTML = `${treeIcon('moon', 13)}${esc(text)}`;
        ge.w = ge.h = 0;
        moved = true;
      }
    }
    if (moved) gatesDirty = true;
    if (open && gatesDirty) applyCam();
    // Fog over everything the night has not opened yet (an annulus from the first closed gate out).
    if (closed.length) {
      const r0 = closed[0].r * D;
      const r1 = S * D * 1.6;
      fogPath.setAttribute('d', `M${-r1} 0a${r1} ${r1} 0 1 0 ${2 * r1} 0a${r1} ${r1} 0 1 0 ${-2 * r1} 0zM${-r0} 0a${r0} ${r0} 0 1 1 ${2 * r0} 0a${r0} ${r0} 0 1 1 ${-2 * r0} 0z`);
    } else fogPath.setAttribute('d', '');
  }

  function renderTop(): void {
    const l = lang();
    datosLbl.textContent = tx(DATOS_NAME, l);
    titleH.innerHTML = `<span class="long">${esc(tx(TREE_UI.title, l))}</span><span class="short">${esc(tx(TREE_UI.titleShort, l))}</span>`;
    const night = nightInfo(ctxOf(data));
    const ready = [...states.values()].filter((s) => s.affordable && s.id !== 'lab').length;
    // One line that always fits (B-9: never "…"): «Noche 2 · 10 listas»; «¡La noche puede avanzar!» is a
    // chip of its own, with the moon.
    const parts = [`${tx(TREE_UI.night(night.night), l)}`];
    if (ready) parts.push(`<b>${l === 'es' ? `${ready} ${ready === 1 ? 'lista' : 'listas'}` : `${ready} ready`}</b>`);
    titleP.innerHTML = parts.join(' · ');
    nightChip.hidden = !(night.ready && night.next);
    nightChip.innerHTML = `${treeIcon('moon', 16)}<span>${esc(tx(TREE_UI.nightReady, l))}</span>`;
    const custom = opts.goText?.() ?? null;
    // After buying a World the way to it pulses: «¡Juega en el Mundo 2!» (docs/CLARIDAD2.md §2.10).
    const world = !custom && playWorld ? nodeText(playWorld).name : null;
    goLbl.textContent = world ? tx(TREE_UI.playWorld(world), l) : tx(custom ?? TREE_UI.newSession, l);
    goBtn.classList.toggle('pulse', !!world);
    goBtn.hidden = !opts.onNewSession;
    for (const { b, l: lab } of branchEls) lab.textContent = tx(BRANCH_TEXT[b].name, l);
    for (const [k, t] of [
      ['in', TREE_UI.zoomIn],
      ['out', TREE_UI.zoomOut],
      ['fit', TREE_UI.centre],
    ] as const) {
      const b = el.querySelector(`.rt-tool[data-z="${k}"]`) as HTMLElement;
      b.setAttribute('aria-label', tx(t, l));
      b.title = tx(t, l);
    }
    el.setAttribute('aria-label', tx(TREE_UI.title, l));
  }

  /**
   * «Puedes comprar (n)» (docs/CLARIDAD2.md §2.10, QA-CLARIDAD #38): every node the player can buy now, cheapest
   * first, one tap away (its sheet); none → «Lo más barato: Reloj grande · 30 Datos · unas 2 sesiones».
   */
  function renderStrip(): void {
    const l = lang();
    const buy = [...states.values()].filter((st) => st.affordable && st.status !== 'hidden' && st.id !== 'lab').sort((a, b) => a.cost - b.cost);
    const key = `${l}|${buy.map((b) => `${b.id}:${b.cost}`).join(',')}|${selected ?? ''}|${data.datos}`;
    if (key === stripKey) return;
    stripKey = key;
    stripRow.innerHTML = buy
      .map((st) => {
        const def = TREE_BY_ID[st.id];
        const name = tx(nodeText(st.id).name, l);
        return `<button type="button" class="rt-sbtn b-${branchOf(def)}${selected === st.id ? ' sel' : ''}" data-pick="${st.id}" aria-label="${esc(`${name} · ${fmt(st.cost, l)} ${tx(DATOS_NAME, l)}`)}"><span class="ic">${treeIcon(def.icon, 22)}</span><span class="nm">${esc(name)}</span><b>${treeIcon('datos', 14)}${fmtShort(st.cost, l)}</b></button>`;
      })
      .join('');
    stripRow.hidden = !buy.length;
    if (buy.length) stripH.textContent = tx(TREE_UI.canBuyStrip(buy.length), l);
    else {
      // The cheapest node that only waits for Datos, and how many sessions away.
      let best: NodeState | null = null;
      for (const st of states.values()) if (st.block === 'datos' && st.id !== 'lab' && (!best || st.cost < best.cost)) best = st;
      stripH.textContent = best ? tx(TREE_UI.cheapestNow(nodeText(best.id).name, fmt(best.cost, l), sessionsToAfford(best.missingDatos, data.recentDatos) ?? 0), l) : '';
    }
    strip.classList.toggle('none', !buy.length);
    strip.hidden = !stripH.textContent;
    strip.setAttribute('aria-label', stripH.textContent ?? '');
  }
  stripRow.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-pick]') as HTMLElement | null;
    if (!b?.dataset.pick) return;
    sound('open');
    el.classList.add('touched');
    api.select(b.dataset.pick);
  });

  function tweenDatos(to: number): void {
    cancelAnimationFrame(datosTween);
    const l = lang();
    const from = shownDatos;
    if (rm() || from === to || !open) {
      shownDatos = to;
      datosNum.textContent = fmt(to, l);
      return;
    }
    const t0 = performance.now();
    const step = () => {
      // Down to the new Datos in 600 ms, easing out (B-6): the price leaves the wallet you can see.
      const k = Math.min(1, (performance.now() - t0) / 600);
      shownDatos = from + (to - from) * (1 - Math.pow(1 - k, 3));
      datosNum.textContent = fmt(Math.round(shownDatos), l);
      if (k < 1) datosTween = requestAnimationFrame(step);
      else shownDatos = to;
    };
    datosTween = requestAnimationFrame(step);
  }

  // ───────────── the sheet ─────────────
  function needChip(id: string, l: Lang): string {
    const def = TREE_BY_ID[id];
    return `<button type="button" class="rt-need b-${branchOf(def)}" data-go="${id}">${treeIcon(def.icon, 22)}${esc(tx(nodeText(id).name, l))}</button>`;
  }

  /** A gate condition with «tienes / hace falta» (TREE_UI.gateSessions / gateSpecies) and its bar. */
  function gateLine(text: string, have: number, need: number): string {
    const g = gateCount(have, need);
    return `<div class="rt-gatebar${g.done ? ' done' : ''}"><div class="row"><span>${esc(text)}</span></div><div class="track"><div class="fill" style="transform:scaleX(${g.frac.toFixed(3)})"></div></div></div>`;
  }

  /**
   * The centre (QA-CLARIDAD #37): the PRIZE first («Noche 2 · capítulo 2 de la historia. +10 % de Datos y
   * mejoras nuevas. Nada se borra.»), then one line per condition with what you have and what it needs, then
   * the button.
   */
  function nightSheet(st: NodeState, l: Lang): string {
    const ni = nightInfo(ctxOf(data));
    if (!ni.next || !ni.gate) return `<p class="rt-note">${esc(tx(TREE_UI.maxed, l))}</p>`;
    let body = `<p class="rt-prize">${treeIcon('moon', 22)}<span>${esc(tx(TREE_UI.nightPrize(ni.next), l))}</span></p>`;
    body += `<div class="rt-box rt-gate-box">${gateLine(tx(TREE_UI.gateSessions(data.sessions, ni.gate.sessions), l), data.sessions, ni.gate.sessions)}${gateLine(
      tx(TREE_UI.gateSpecies(data.species, ni.gate.species), l),
      data.species,
      ni.gate.species,
    )}</div>`;
    // The night's button (owner bug B-10.2): «Empezar la Noche N» is the primary action (accent, moon);
    // «Aún no» is a secondary, informative button with the reason, never a ghost that looks broken.
    if (ni.ready) {
      body += `<button type="button" class="rt-buy rt-night-go" data-buy="lab"${st.affordable ? '' : ' disabled'}>${treeIcon('moon', 24)}<span>${esc(
        l === 'es' ? `Empezar la Noche ${ni.next}` : `Start Night ${ni.next}`,
      )}</span>${ni.cost > 0 ? `<b>· ${fmt(ni.cost, l)}</b>` : ''}</button>`;
    } else {
      // The same counts as the two bars above (QA-CLARIDAD-2 C5).
      const why = nightNotYetText(ctxOf(data)) ?? TREE_UI.nightNotYet(1);
      body += `<button type="button" class="rt-notyet" data-notyet="1">${treeIcon('moon', 22)}<span>${esc(tx(why, l))}</span></button>`;
    }
    return body;
  }

  /**
   * «¿Por qué cuesta esto?» unfolds INSIDE the sheet (owner bug B-10.5): what the upgrade is for, why it
   * matters, what it opens, the price as an equation and the next levels. One sheet, never two.
   */
  function whyBox(def: TreeNodeDef, st: NodeState, l: Lang): string {
    const open = whyOpenFor === def.id;
    const btn = `<button type="button" class="rt-pricebox" data-why="${def.id}" aria-expanded="${open}" aria-controls="rt-why">${treeIcon('question', 20)}<span>${esc(
      tx(TREE_UI.why, l),
    )}</span><span class="rt-tap">${treeIcon(open ? 'chevronUp' : 'chevronDown', 18)}</span></button>`;
    if (!open) return btn;
    const w = nodeWhy(def.id, st.level, l, { ...ctxOf(data), recentDatos: data.recentDatos });
    if (!w) return btn;
    const br = branchOf(def);
    const row = (ic: string, label: Text, text: string) =>
      `<div class="rt-why-row"><span class="rt-why-ic">${treeIcon(ic, 20)}</span><div><small>${esc(tx(label, l))}</small><p>${esc(text)}</p></div></div>`;
    const eq = w.equation;
    return `${btn}<div class="rt-why" id="rt-why">
      ${row(br === 'core' ? 'lab' : ROUTE_ICON[br], WHY_UI.forWhat, w.forWhat)}
      ${row('star', WHY_UI.matters, w.matters)}
      ${row('plus', WHY_UI.unlocks, w.unlocks)}
      <p class="rt-rule rt-rule-first">${esc(w.rule)}</p>
      <div class="rt-eq" role="group" aria-label="${esc(tx(WHY_UI.price, l))}"><span class="term"><b>${esc(eq.start)}</b><small>${esc(eq.startLabel)}</small></span><span class="op" aria-hidden="true">×</span><span class="term"><b>${esc(
        eq.growth,
      )}</b><small>${esc(eq.growthLabel)}</small></span><span class="op" aria-hidden="true">=</span><span class="term total"><b>${esc(eq.total)}</b><small>${esc(eq.totalLabel)}</small></span></div>
      ${barsBox(def, st, l)}
    </div>`;
  }

  function barsBox(def: TreeNodeDef, st: NodeState, l: Lang): string {
    const rows = costRows(def.id, st.level, 3, data.levels);
    if (rows.length < 2) return '';
    const max = Math.max(...rows.map((r) => r.cost));
    const bars = rows
      .map(
        (r, i) =>
          `<div class="rt-bar${i === 0 ? ' first' : ''}"><span class="v">${esc(tx(r.value, l))}</span><span class="col" style="height:${Math.max(
            10,
            (r.cost / max) * 62,
          ).toFixed(0)}px"></span><span class="c">${fmtShort(r.cost, l)}</span><span class="l">${esc(tx(TREE_UI.levelN(r.level), l))}</span></div>`,
      )
      .join('');
    return `<div class="rt-nextlv"><h4>${esc(tx(TREE_UI.nextLevels, l))}</h4><div class="rt-bars">${bars}</div></div>`;
  }

  function haveBox(st: NodeState, l: Lang): string {
    const ok = data.datos >= st.cost;
    const k = st.cost > 0 ? Math.min(1, data.datos / st.cost) : 1;
    const missing = Math.max(0, st.cost - data.datos);
    const n = sessionsToAfford(missing, data.recentDatos);
    // A Placa level this device cannot show (RF-12): the button says why; «¡Puedes comprarlo!» would lie.
    const why =
      st.block === 'device'
        ? ''
        : ok
          ? l === 'es'
            ? '¡Puedes comprarlo!'
            : 'You can buy it!'
          : datosMissingText(missing, l, n ? tx(TREE_UI.sessions(n), l) : null);
    return `<div class="rt-have${ok ? ' ok' : ''}"><div class="row"><span>${esc(tx(DATOS_NAME, l))}</span><b>${esc(
      tx(TREE_UI.haveCost(fmt(data.datos, l), fmt(st.cost, l)), l),
    )}</b></div><div class="track"><div class="fill" style="transform:scaleX(${k.toFixed(3)})"></div></div>${why ? `<div class="why">${esc(why)}</div>` : ''}</div>`;
  }

  /** "Ahora → Con un nivel más", both with numbers (owner rule: always more, always visible). */
  function beforeAfterBox(def: TreeNodeDef, st: NodeState, l: Lang): string {
    const ba = beforeAfter(data.levels, def.id);
    if (!ba.after) return `<div class="rt-ba done"><div class="col now"><small>${esc(tx(TREE_UI.now, l))}</small><b>${esc(tx(ba.before, l))}</b></div></div>`;
    void st;
    return `<div class="rt-ba"><div class="col now"><small>${esc(tx(TREE_UI.now, l))}</small><b>${esc(tx(ba.before, l))}</b></div><span class="arrow" aria-hidden="true">${treeIcon(
      'play',
      22,
    )}</span><div class="col nxt"><small>${esc(tx(TREE_UI.next, l))}</small><b>${esc(tx(ba.after, l))}</b></div></div>`;
  }

  /**
   * Placa nodes: the dish today (solid glass) and the size one more level gives (the dashed growth
   * ring of docs/ARTE.md §8.3), drawn to scale.
   */
  function dishBox(def: TreeNodeDef, l: Lang): string {
    if (def.id !== 'dish' && def.id !== 'dishXL') return '';
    const dia = (lv: number) => opts.dishDiameter?.(lv) ?? DISH_DIAMETERS[Math.min(DISH_DIAMETERS.length - 1, Math.max(0, lv))];
    const nowLv = treeEffects(data.levels).dishLevel;
    const nextLv = treeEffects({ ...data.levels, [def.id]: (data.levels[def.id] ?? 0) + 1 }).dishLevel;
    const dNow = dia(nowLv);
    const dNext = dia(nextLv);
    const grows = dNext > dNow;
    const big = Math.max(dNow, dNext);
    const W = 200;
    const H = 132;
    const rNow = (58 * dNow) / big;
    const rNext = (58 * dNext) / big;
    const cx = W / 2;
    const cy = H / 2;
    const ring = grows
      ? `<circle cx="${cx}" cy="${cy}" r="${rNext.toFixed(1)}" fill="none" stroke="var(--bl-accent, #5bc0eb)" stroke-width="2.5" stroke-dasharray="7 6" opacity=".9"/>`
      : '';
    const svg = `<svg class="rt-dishpv" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
      <circle cx="${cx + 2}" cy="${cy + 4}" r="${(rNow + 2).toFixed(1)}" fill="rgba(0,0,0,.35)"/>
      <circle cx="${cx}" cy="${cy}" r="${rNow.toFixed(1)}" fill="#131c26" stroke="#cfe8f5" stroke-width="2.5"/>
      <path d="M ${(cx - rNow * 0.62).toFixed(1)} ${(cy - rNow * 0.55).toFixed(1)} A ${rNow.toFixed(1)} ${rNow.toFixed(1)} 0 0 1 ${(cx - rNow * 0.1).toFixed(1)} ${(cy - rNow * 0.98).toFixed(1)}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>
      ${ring}</svg>`;
    const legend = grows
      ? `<span class="k now">${esc(tx(TREE_UI.now, l))}</span><span class="k nxt">${esc(tx(TREE_UI.next, l))}</span>`
      : `<span class="k now">${esc(tx(TREE_UI.now, l))}</span>`;
    return `<div class="rt-box rt-dishbox">${svg}<div class="rt-dishleg">${legend}</div></div>`;
  }

  /** World nodes: the species that live there (found ones in colour, the rest as silhouettes). */
  function worldBox(def: TreeNodeDef, l: Lang): string {
    if (!def.world || !opts.worldSpecies) return '';
    const sp = opts.worldSpecies(def.world);
    if (!sp.length) return '';
    const cells = sp
      .map((x) => `<span class="rt-sp${x.found ? ' found' : ''}" data-code="${esc(x.code)}" title="${esc(x.found ? x.name : '?')}"></span>`)
      .join('');
    return `<div class="rt-box"><h4>${esc(tx(SESSION_UI.worldSpecies(sp.length), l))}</h4><div class="rt-species">${cells}</div></div>`;
  }

  /**
   * A Placa level this phone cannot show (QA-CLARIDAD #11, RF-12): BuyBlock 'device' today; PA's `deviceMax`
   * state when it lands. No price, no bar, no «Comprar»: «✓ Máximo en este móvil».
   */
  function isDeviceMax(st: NodeState): boolean {
    return st.block === 'device' || (st as NodeState & { deviceMax?: boolean }).deviceMax === true;
  }

  /** The levels as dots ●●○ (∞ routes: «nivel 3»), with the words for a screen reader. */
  function levelDots(level: number, max: number, l: Lang): string {
    const words = tx(TREE_UI.levelOf(level, max >= 99 ? '∞' : String(max)), l);
    if (max >= 99 || max > 10) return `<span class="rt-chip lv">${esc(words)}</span>`;
    const dots = Array.from({ length: max }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
    return `<span class="rt-chip lv rt-dots" role="img" aria-label="${esc(words)}">${dots}</span>`;
  }

  function renderSheet(force = false): void {
    if (!selected) {
      sheet.classList.remove('show', 'peek');
      el.classList.remove('sheet-open');
      sheetKey = '';
      staggerFor = null;
      return;
    }
    const l = lang();
    const def = TREE_BY_ID[selected];
    const st = states.get(selected);
    if (!def || !st) return;
    const key = `${selected}|${st.status}|${st.level}|${st.cost}|${data.datos}|${data.sessions}|${data.species}|${l}`;
    el.classList.add('sheet-open');
    sheet.classList.add('show');
    sheet.className = `rt-sheet show b-${branchOf(def)}`;
    if (key === sheetKey && !force) return;
    sheetKey = key;
    const mystery = st.status === 'mystery';
    const br = branchOf(def);
    const name = mystery ? '?' : selected === 'lab' ? tx(TREE_UI.night(st.level), l) : tx(nodeText(def.id).name, l);
    const chips: string[] = [];
    const devMax = isDeviceMax(st);
    if (!mystery && br !== 'core') {
      // ONE counter (QA-CLARIDAD: «Mejora 1 de 7» next to «Nivel 0 de 6»): «Ruta Placa · paso 1 de 7», and the
      // levels as dots ●●○ beside it.
      const n = routeNodes(br).length;
      chips.push(`<span class="rt-chip br">${treeIcon(ROUTE_ICON[br], 14)}${esc(tx(TREE_UI.routeStep(BRANCH_TEXT[br].name, def.step, n), l))}</span>`);
      if (devMax) chips.push(`<span class="rt-chip done">${esc(tx(TREE_UI.deviceMax, l))}</span>`);
      else if (st.maxed) chips.push(`<span class="rt-chip done">${treeIcon('check', 14)}${esc(tx(TREE_UI.maxed, l))}</span>`);
      else if (def.maxLevel > 1) chips.push(levelDots(st.level, def.maxLevel, l));
    }
    let body = '';
    if (selected === 'lab') body = nightSheet(st, l);
    else if (mystery) {
      body = `<p class="rt-note">${esc(tx(st.nightNeeded ? TREE_UI.nightLocked(st.nightNeeded) : TREE_UI.mystery, l))}</p>`;
      if (st.nightNeeded) {
        const ni = nightInfo(ctxOf(data));
        if (ni.gate)
          body +=
            gateLine(tx(TREE_UI.gateSessions(data.sessions, ni.gate.sessions), l), data.sessions, ni.gate.sessions) +
            gateLine(tx(TREE_UI.gateSpecies(data.species, ni.gate.species), l), data.species, ni.gate.species);
      }
    } else {
      // What it does first (before → after, in words), then the button; the price's arithmetic and
      // the next levels' prices stay below it, behind "¿Por qué cuesta esto?" (CLARIDAD J-90).
      body += beforeAfterBox(def, st, l);
      // Until the first purchase, the sheet says how to read it (CLARIDAD J-168).
      const firstBuy = Object.entries(data.levels).every(([id, n]) => id === 'lab' || !n);
      if (firstBuy && !st.maxed) body += `<p class="rt-bahint">${esc(tx(SESSION_UI.sheetHint, l))}</p>`;
      // …and right after it, that it is forever (CLARIDAD J-120; it was a Momento card that waited for
      // the next session to start and then told it again).
      else if (firstBought === selected) body += `<p class="rt-bahint got">${esc(tx(SESSION_UI.sheetHintBought, l))}</p>`;
      body += `<p class="rt-desc">${esc(tx(nodeText(def.id).desc, l))}</p>`;
      body += worldBox(def, l);
      body += dishBox(def, l);
      if (devMax) {
        // QA-CLARIDAD #11: no Datos bar and no «Comprar» for a dish this phone cannot show; one line instead.
        body += `<p class="rt-note rt-devmax">${esc(tx(TREE_UI.deviceMaxLine, l))}</p>`;
      } else if (!st.maxed) {
        if (st.status === 'locked') {
          body += `<div class="rt-needs">${esc(tx(TREE_UI.needs, l))}: ${st.missingRequires.map((id) => needChip(id, l)).join('')}</div>`;
        } else {
          body += haveBox(st, l);
          // The button names its node: the only way to buy is a tap on «Comprar Más tiempo · 2».
          body += `<button type="button" class="rt-buy" data-buy="${def.id}"${st.affordable ? '' : ' disabled'}>${
            st.affordable
              ? `<span>${esc(tx(TREE_UI.buy, l))} ${esc(tx(nodeText(def.id).name, l))}</span><span class="rt-buy-c">${treeIcon('datos', 22)}<b>${fmt(st.cost, l)}</b></span>`
              : esc(datosMissingText(st.missingDatos, l))
          }</button>`;
        }
        body += whyBox(def, st, l);
      }
    }
    const fresh = staggerFor !== selected;
    if (fresh) {
      // Stamped again when it is drawn: on a slow phone the frame comes well after the DOM change.
      sheetAt = performance.now();
      requestAnimationFrame(() => (sheetAt = Math.max(sheetAt, performance.now())));
    }
    staggerFor = selected;
    sheet.innerHTML = `<div class="rt-grab"></div>
      <div class="rt-sh-head">
        <div class="rt-sh-ic${mystery ? ' mystery' : ''}">${treeIcon(mystery ? 'question' : def.icon, 34)}</div>
        <div class="rt-sh-tt"><h3>${esc(name)}</h3><div class="rt-chips">${chips.join('')}</div></div>
        <button type="button" class="rt-x" aria-label="${esc(tx(TREE_UI.close, l))}">${treeIcon('close', 22)}</button>
      </div>${body}`;
    if (def.world && opts.worldSpecies) {
      const sp = opts.worldSpecies(def.world);
      for (const cell of sheet.querySelectorAll<HTMLElement>('.rt-sp')) {
        const x = sp.find((q) => q.code === cell.dataset.code);
        // Found: the creature, sharp (B-1); not yet: a dashed ring with a drawn «?», never a grey blob.
        if (x?.found && x.portrait) mountPortrait(cell, x.portrait, 44, { fill: 0.85 });
        else cell.insertAdjacentHTML('beforeend', `<span class="qm">${treeIcon('question', 18)}</span>`);
      }
    }
    // A sheet that opens (or turns to another node) brings its blocks in one after another: 40 ms
    // apart after 80 ms, at most six waiting (B-5). A re-render of the same node (a buy) does not.
    if (fresh) staggerIn(sheet.children);
  }

  sheet.addEventListener('pointerdown', (e) => (sheetPressAt = e.timeStamp), { capture: true });
  sheet.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.rt-x')) {
      sound('close');
      api.select(null);
      return;
    }
    const go = t.closest('[data-go]') as HTMLElement | null;
    if (go?.dataset.go) {
      sound('tap');
      api.select(go.dataset.go);
      return;
    }
    const why = t.closest('[data-why]') as HTMLElement | null;
    if (why?.dataset.why) {
      // Unfold / fold the explanation in place (150-ms fade, no height animation: B-5).
      const id = why.dataset.why;
      whyOpenFor = whyOpenFor === id ? null : id;
      sound(whyOpenFor ? 'open' : 'close');
      renderSheet(true);
      const box = sheet.querySelector('.rt-why') as HTMLElement | null;
      if (box) {
        if (!rm()) box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION.quick, easing: EASING.standard });
        requestAnimationFrame(() => box.scrollIntoView({ block: 'nearest', behavior: rm() ? 'auto' : 'smooth' }));
      }
      return;
    }
    const notYet = t.closest('[data-notyet]') as HTMLElement | null;
    if (notYet) {
      // «Aún no» explains itself: the gate's counters are what is missing.
      sound('deny');
      const gate = sheet.querySelector('.rt-gate-box') as HTMLElement | null;
      if (gate) {
        gate.scrollIntoView({ block: 'nearest', behavior: rm() ? 'auto' : 'smooth' });
        for (const b of gate.querySelectorAll<HTMLElement>('.rt-gatebar:not(.done)')) pop(b, 1.04);
      }
      return;
    }
    const buy = t.closest('[data-buy]') as HTMLButtonElement | null;
    // Buying only with the sheet's button, which names its node, and never with a finger that came down right
    // after the camera moved or the sheet turned to another node (QA-CLARIDAD #12, QA-3 §2: purchases by accident).
    // A keyboard press has no finger: it counts when it happens.
    const pressAt = (e as MouseEvent).detail === 0 ? performance.now() : sheetPressAt;
    if (buy?.dataset.buy && !buy.disabled && buyPressAllowed(pressAt, sheetAt, lastCamMove)) doBuy(buy.dataset.buy, buy);
  });

  // ───────────── buying ─────────────
  function nodeScreen(id: string): { x: number; y: number } | null {
    const p = TREE_LAYOUT.get(id);
    if (!p) return null;
    return { x: cam.x + p.x * D * cam.z, y: cam.y + p.y * D * cam.z };
  }

  function burst(id: string): void {
    if (rm()) return;
    const p = nodeScreen(id);
    const n = nodes.get(id);
    if (!p || !n) return;
    const color = getComputedStyle(n.el).getPropertyValue('--bc').trim() || '#8ae234';
    const ring = document.createElement('div');
    ring.className = 'rt-ringfx';
    ring.style.left = `${p.x}px`;
    ring.style.top = `${p.y}px`;
    ring.style.setProperty('--c', color);
    fx.appendChild(ring);
    setTimeout(() => ring.remove(), 800);
    for (let i = 0; i < 16; i++) {
      const d = document.createElement('span');
      d.className = 'rt-p';
      d.style.left = `${p.x}px`;
      d.style.top = `${p.y}px`;
      d.style.setProperty('--c', i % 3 === 0 ? 'var(--bl-good)' : color);
      fx.appendChild(d);
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
      const r = 50 + Math.random() * 60;
      requestAnimationFrame(() => {
        d.style.transform = `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r}px) scale(${0.4 + Math.random() * 0.6})`;
        d.style.opacity = '0';
      });
      setTimeout(() => d.remove(), 800);
    }
  }

  function floatText(text: string, x: number, y: number, color?: string): void {
    const f = document.createElement('div');
    f.className = 'rt-float';
    f.textContent = text;
    f.style.left = `${x}px`;
    f.style.top = `${y}px`;
    if (color) f.style.setProperty('--c', color);
    fx.appendChild(f);
    setTimeout(() => f.remove(), 1200);
  }

  function doBuy(id: string, btn?: HTMLElement): void {
    // A Placa level this phone cannot show is never on sale, whatever the game says (QA-CLARIDAD #11, QA-3 §2).
    const st = states.get(id);
    if (st && isDeviceMax(st)) {
      sound('deny');
      return;
    }
    // Before onBuy: the host's nodeBought handler calls update() with the new levels synchronously.
    const wasFirst = id !== 'lab' && Object.entries(data.levels).every(([k, n]) => k === 'lab' || !n);
    const res = opts.onBuy(id);
    if (!res || !res.ok) {
      sound('deny');
      btn?.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260 });
      return;
    }
    sound(id === 'lab' ? 'night' : 'buy');
    const prev = data;
    if (wasFirst) firstBought = id;
    // A new World: «Nueva sesión» pulses with «¡Juega en el Mundo 2!» (the start card brings it picked).
    if (TREE_BY_ID[id]?.world) playWorld = id;
    data = { ...data, levels: res.levels, datos: res.datos };
    recompute();
    const n = nodes.get(id);
    // The purchase is seen (B-9, the audit's «celebration behind the sheet»): on a phone the sheet sinks
    // until only 96 px peek out, the node pops and bursts in plain view, the Datos count down, the new
    // lines grow; at 900 ms the sheet comes back with the new level. Reduce motion: no peek, a fade.
    const peek = !rm() && !desktop() && selected === id;
    if (peek) {
      sheet.classList.add('peek');
      window.clearTimeout(peekTimer);
      peekTimer = window.setTimeout(() => {
        sheet.classList.remove('peek');
        const lv = sheet.querySelector('.rt-chip.lv, .rt-chip.done') as HTMLElement | null;
        if (lv) pop(lv, 1.12);
      }, DURATION.celebrate + 200);
    }
    if (n && !rm()) {
      pop(n.tile, 1.18);
    }
    burst(id);
    const p = nodeScreen(id);
    const lvl = res.levels[id] ?? 0;
    if (p && !rm()) floatText(id === 'lab' ? tx(TREE_UI.night(lvl), lang()) : `${lvl}/${TREE_BY_ID[id].maxLevel >= 99 ? '∞' : TREE_BY_ID[id].maxLevel}`, p.x, p.y - 40);
    pop(datosEl, 1.06);
    if (res.cost > 0) ticker.show({ text: `−${fmt(res.cost, lang())} · ${id === 'lab' ? tx(TREE_UI.night(lvl), lang()) : tx(nodeText(id).name, lang())}`, dir: -1 });
    if (res.revealed.length) {
      setTimeout(() => sound('reveal'), 220);
      for (const r of res.revealed) {
        const rn = nodes.get(r);
        if (rn && !rm()) {
          rn.el.classList.remove('reveal');
          requestAnimationFrame(() => rn.el.classList.add('reveal'));
        }
      }
      for (const e of edgeEls) {
        if ((e.from === id && res.revealed.includes(e.to)) || (res.revealed.includes(e.to) && states.get(e.from)?.status === 'owned')) {
          e.line.style.strokeDasharray = String(Math.ceil(e.len));
          e.line.classList.remove('grow');
          if (!rm()) requestAnimationFrame(() => e.line.classList.add('grow'));
          setTimeout(() => {
            e.line.style.strokeDasharray = '';
            e.line.classList.remove('grow');
            renderEdges();
          }, 800);
        }
      }
    }
    void prev;
    renderSheet(true);
  }

  /**
   * The node the first-visit guide points at (QA4 F-11): nothing bought yet and something affordable,
   * the cheapest green node (ties: the Clock first, it is what the first run teaches). null otherwise.
   */
  function guideNode(): string | null {
    if (Object.entries(data.levels).some(([k, n]) => k !== 'lab' && n > 0)) return null;
    let best: string | null = null;
    let cost = Infinity;
    for (const [id, st] of states) {
      if (id === 'lab' || !st.affordable || st.status === 'hidden') continue;
      if (st.cost < cost || (st.cost === cost && id === 'clock')) {
        best = id;
        cost = st.cost;
      }
    }
    return best;
  }

  /**
   * The ONE node that wears the "buy me next" ring (docs/ARTE-PULIDO.md B-9): the hand's node on the first
   * visit, else the cheapest node ready to buy; none while the night itself can move on (the centre wears
   * the ring then). Everything else stays still: seven halos breathing at once said nothing.
   */
  function recommendedNode(): string | null {
    const g = guideNode();
    if (g) return g;
    if (nightInfo(ctxOf(data)).ready) return null;
    let best: string | null = null;
    let cost = Infinity;
    for (const [id, st] of states) {
      if (id === 'lab' || !st.affordable || st.status === 'hidden') continue;
      if (st.cost < cost) {
        best = id;
        cost = st.cost;
      }
    }
    return best;
  }

  let handEl: HTMLElement | null = null;
  /** The drawn hand over the guide's node and the big "¡Toca el nodo verde!" (first visit only). */
  function renderGuide(): void {
    const id = open ? guideNode() : null;
    const rec = open ? recommendedNode() : null;
    el.classList.toggle('rt-first', !!id);
    for (const n of nodes.values()) {
      n.el.classList.toggle('guide', n.def.id === id);
      n.el.classList.toggle('rec', n.def.id === rec);
    }
    const host = id ? nodes.get(id)?.el : null;
    if (host && handEl?.parentElement !== host) {
      handEl?.remove();
      handEl = document.createElement('span');
      handEl.className = 'rt-hand';
      handEl.setAttribute('aria-hidden', 'true');
      handEl.innerHTML = treeIcon('pointer', 34);
      host.appendChild(handEl);
    } else if (!host && handEl) {
      handEl.remove();
      handEl = null;
    }
    // The first visit's line (QA-CLARIDAD #10: the nodes are not green, they glow in their route's colour);
    // after it the strip says what can be bought.
    hint.textContent = id ? tx(TREE_UI.tapGlowing, lang()) : '';
    hint.hidden = !id;
  }

  function recompute(): void {
    states = treeStates(ctxOf(data));
    renderNodes();
    renderEdges();
    renderGates();
    renderTop();
    renderGuide();
    renderStrip();
    tweenDatos(data.datos);
    renderSheet();
  }

  // ───────────── public API ─────────────
  const onResize = () => {
    if (!open) return;
    clampCam();
    applyCam();
  };
  window.addEventListener('resize', onResize);
  // VELA docks at the top of the Tree or leaves: fit the tree to the room that is left.
  const onDock = () => {
    if (open) requestAnimationFrame(() => fitView(!rm()));
  };
  window.addEventListener('bl-story-dock', onDock);

  const api: TreeView = {
    el,
    get isOpen() {
      return open;
    },
    get sheetOpen() {
      return open && selected !== null;
    },
    update(d) {
      data = { ...d, levels: { ...d.levels } };
      recompute();
    },
    open() {
      if (open) return;
      open = true;
      el.hidden = false;
      // The taps that opened it (a child taps four times) never buy what is under them now (QA-3 §2).
      screenChanged();
      el.classList.toggle('rm', rm());
      shownDatos = data.datos;
      datosNum.textContent = fmt(data.datos, lang());
      recompute();
      // Every visit starts on the whole tree: a pan left over from the last visit (a node picked near
      // the edge) put the centre under the top bar, and new nodes may have appeared since.
      requestAnimationFrame(() => fitView(false));
      requestAnimationFrame(() => el.focus({ preventScroll: true }));
    },
    close() {
      if (!open) return;
      open = false;
      el.hidden = true;
      screenChanged();
      selected = null;
      homeCam = null;
      playWorld = null;
      firstBought = null;
      renderSheet();
    },
    select(id) {
      const prev = selected;
      selected = id && TREE_BY_ID[id] && states.get(id)?.status !== 'hidden' ? id : null;
      if (selected !== prev) screenChanged();
      // The camera of the tree as the player left it: the sheet's reveals are undone when it closes.
      if (!prev && selected) homeCam = { ...cam };
      if (selected !== firstBought) firstBought = null;
      if (selected !== whyOpenFor) whyOpenFor = null;
      if (prev && nodes.get(prev)) nodes.get(prev)!.key = '';
      if (selected && nodes.get(selected)) nodes.get(selected)!.key = '';
      renderNodes();
      renderSheet(true);
      renderStrip();
      // QA-CLARIDAD #12: a visible node never moves the camera; one under the sheet moves the least it can.
      if (selected) {
        const id = selected;
        requestAnimationFrame(() => {
          if (selected === id) revealNode(id);
        });
      } else if (prev && homeCam) {
        const back = homeCam;
        homeCam = null;
        animateTo(0, 0, back.z, back.x, back.y);
      } else homeCam = null;
    },
    focus(id, zoom) {
      focusNode(id, zoom);
    },
    fit() {
      fitView();
    },
    relabel() {
      for (const n of nodes.values()) n.key = '';
      recompute();
      renderSheet(true);
    },
    dispose() {
      cancelAnimationFrame(camAnim);
      cancelAnimationFrame(datosTween);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('bl-story-dock', onDock);
      el.remove();
    },
  };
  applyCam();
  return api;
}

/**
 * The price of a node as the shared "¿Por qué cuesta esto?" sheet (src/ui/moments/price.ts):
 * [start · ring] × [growth^level · levels bought] = [price], the rule in words, the next levels as
 * rows ("nivel 3 · 12 Datos → Sesión 4:30") and how far the player is ("te faltan 5 — unas 2 sesiones").
 */
export function nodePriceExplain(
  id: string,
  level: number,
  lang: Lang,
  have?: { datos: number; recentDatos: readonly number[]; levels?: Readonly<Record<string, number>> },
): PriceExplain | null {
  const def = TREE_BY_ID[id];
  if (!def || id === 'lab') return null;
  const r = priceRule(id);
  const levels = { ...(have?.levels ?? {}), [id]: level };
  const next = costRows(id, level, 3, levels);
  const cost = next[0]?.cost;
  if (cost === undefined) return null;
  const g = (Math.round(r.growth * 100) / 100).toString().replace('.', lang === 'es' ? ',' : '.');
  const rows: PriceExplain['rows'] = next.map((row) => ({
    icon: 'up',
    label: tx(TREE_UI.levelN(row.level), lang),
    text: `${fmtShort(row.cost, lang)} ${tx(DATOS_NAME, lang)} → ${tx(row.value, lang)}`,
    tone: row.level === level + 1 ? 'info' : 'grey',
  }));
  let advice = tx(TREE_UI.priceWhy, lang);
  if (have) {
    const missing = Math.max(0, cost - have.datos);
    const n = sessionsToAfford(missing, have.recentDatos);
    advice = missing > 0 ? datosMissingText(missing, lang, n ? tx(TREE_UI.sessions(n), lang) : null) : lang === 'es' ? '¡Puedes comprarlo!' : 'You can buy it!';
  }
  return {
    title: tx(nodeText(id).name, lang),
    icon: 'upgrade',
    total: fmtShort(cost, lang),
    totalLabel: tx(DATOS_NAME, lang),
    totalIcon: 'book',
    terms: [
      { icon: 'tag', value: fmtShort(r.start, lang), label: tx(TREE_UI.ringStart(String(def.ring)), lang), active: true },
      {
        icon: 'up',
        value: fmtFactor(Math.pow(r.growth, level), lang),
        label: level > 0 ? tx(TREE_UI.levelsBought(level, g), lang) : tx(TREE_UI.levelN(1), lang),
        active: level > 0,
      },
    ],
    rows,
    rule: `${r.single ? tx(TREE_UI.priceRuleOne(fmtShort(r.start, lang)), lang) : tx(TREE_UI.priceRule(fmtShort(r.start, lang), g), lang)} ${tx(TREE_UI.priceWhy, lang)}`,
    advice,
    closeLabel: tx(TREE_UI.close, lang),
  };
}
