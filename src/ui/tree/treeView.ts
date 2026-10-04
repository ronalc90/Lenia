/**
 * Research tree screen (docs/CICLO.md §4.4): a full-screen radial node graph between lab sessions.
 *
 *  - Centre node (the night) and 7 STRAIGHT routes radiating out (node k needs only node k − 1);
 *    icon tiles joined by lines (bright when owned); a "?" one step beyond what you can see; rings
 *    the night has not opened yet sit behind a dashed moon circle (rings are bands around the centre).
 *  - Pan with one finger / mouse drag, pinch or wheel to zoom, +/− and "centre" buttons (48 px).
 *  - Tap a node: a sheet with NAME, "Paso 2 de 7", LEVEL x/y, "antes → después" with numbers
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
import * as C from '../../game/cycleBalance';
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
  nodeText,
  priceRule,
  routeNodes,
  sessionsToAfford,
  treeStates,
  type BuyResult,
  type NodeState,
  type TreeCtx,
  type TreeNodeDef,
} from '../../game/tree';
import { BRANCH_TEXT, DATOS_NAME, SESSION_UI, TREE_UI, type BranchId } from '../../game/treeText';
import type { WorldId } from '../../game/worlds';
import { fmt, fmtShort } from '../format';
import { createPriceSheet, PriceTicker, type PriceExplain } from '../moments/price';
import '../moments/moments.css';
import { renderPattern } from '../portrait';
import { treeIcon } from './icons';
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
  onSound?(kind: TreeSound): void;
  /** Species of a world for its node sheet (portraits; unfound ones as silhouettes). */
  worldSpecies?(world: WorldId): { code: string; name: string; portrait: Pattern | null; found: boolean }[];
}

export interface TreeView {
  readonly el: HTMLElement;
  readonly isOpen: boolean;
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

/** Pixels per layout unit at zoom 1 (one step along a route; leaves room for the name under a tile). */
const D = 128;
/** World half-size (layout units) for the SVG layer and the pan limits. */
const S = TREE_RADIUS + 1.8;
const Z_MIN = 0.16;
const Z_MAX = 1.9;
/** Below this zoom node names and branch labels fade out. */
const FAR_Z = 0.55;
/** Where the night labels sit on their circles: between Mundos and Destello. */
const GATE_LABEL_ANGLE = ((-90 + 5.5 * (360 / 7)) * Math.PI) / 180;
/** Night boundaries: dashed circles between the last ring of a night and the first of the next. */
const GATES = TREE_GATES;

const tx = (t: Text, l: Lang): string => t[l];
/** Factors exactly as the rule makes them, up to 2 decimals ("×2,25", "×1.5", "×8"). */
const dec2 = (x: number, l: Lang): string => {
  const v = Math.round(x * 100) / 100;
  return v >= 1000 ? fmt(Math.round(v), l) : String(v).replace('.', l === 'es' ? ',' : '.');
};
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const branchOf = (def: TreeNodeDef): BranchId | 'core' => def.branch;
const BRANCH_ICON: Record<BranchId, string> = {
  time: 'clock',
  dropper: 'dropper',
  dish: 'dish',
  life: 'culture',
  discovery: 'microscope',
  worlds: 'world',
  spark: 'spark',
};

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
      <div class="rt-title"><h2></h2><p></p></div>
      <button type="button" class="rt-go">${treeIcon('play', 22)}<span></span></button>
    </header>
    <div class="rt-tools">
      <button type="button" class="rt-tool" data-z="in">${treeIcon('plus', 24)}</button>
      <button type="button" class="rt-tool" data-z="out">${treeIcon('minus', 24)}</button>
      <button type="button" class="rt-tool" data-z="fit">${treeIcon('centre', 24)}</button>
    </div>
    <div class="rt-hint"></div>
    <section class="rt-sheet" aria-live="polite"></section>
    <div class="rt-fx"></div>`;
  root.appendChild(el);
  const vp = el.querySelector('.rt-vp') as HTMLElement;
  const world = el.querySelector('.rt-world') as HTMLElement;
  const datosEl = el.querySelector('.rt-datos') as HTMLElement;
  const datosNum = datosEl.querySelector('b') as HTMLElement;
  const datosLbl = datosEl.querySelector('small') as HTMLElement;
  const titleH = el.querySelector('.rt-title h2') as HTMLElement;
  const titleP = el.querySelector('.rt-title p') as HTMLElement;
  const goBtn = el.querySelector('.rt-go') as HTMLButtonElement;
  const goLbl = goBtn.querySelector('span') as HTMLElement;
  const hint = el.querySelector('.rt-hint') as HTMLElement;
  const sheet = el.querySelector('.rt-sheet') as HTMLElement;
  const fx = el.querySelector('.rt-fx') as HTMLElement;
  // Shared price components (Momentos): one tap on a price explains it; a chip says what it cost.
  const ticker = new PriceTicker();
  (el.querySelector('.rt-tick') as HTMLElement).appendChild(ticker.el);
  const priceSheet = createPriceSheet(root, { reduceMotion: rm });

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
    return { g, c, label };
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
  const cam = { x: 0, y: 0, z: 1 };
  let camAnim = 0;
  let fitted = false;

  const ctxOf = (d: TreeViewData): TreeCtx => ({ levels: d.levels, datos: d.datos, sessions: d.sessions, species: d.species });
  const vpSize = () => ({ w: vp.clientWidth || window.innerWidth, h: vp.clientHeight || window.innerHeight });
  const desktop = () => vpSize().w >= 900;

  // ───────────── camera ─────────────
  function applyCam(): void {
    world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`;
    el.classList.toggle('far', cam.z < FAR_Z);
    // Route names and night labels keep a readable size on screen when zoomed far out.
    world.style.setProperty('--rt-iz', String(Math.min(3, Math.max(1, 0.45 / cam.z))));
    world.style.setProperty('--rt-izg', String(Math.min(4, Math.max(1, 0.8 / cam.z))));
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
      if (k < 1) camAnim = requestAnimationFrame(step);
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
  /** The visible area minus the top bar and (on phones) the open sheet. */
  function freeArea(): { cx: number; cy: number; w: number; h: number } {
    const { w, h } = vpSize();
    const top = 78;
    let bottom = 18;
    let right = 0;
    if (selected && open) {
      if (desktop()) right = 410;
      else bottom = Math.min(h * 0.62, sheet.offsetHeight || h * 0.5);
    }
    const aw = w - right;
    const ah = h - top - bottom;
    return { cx: aw / 2, cy: top + ah / 2, w: aw, h: ah };
  }
  function fitView(animate = true): void {
    let minX = -0.6;
    let maxX = 0.6;
    let minY = -0.6;
    let maxY = 0.6;
    for (const [id, st] of states) {
      if (st.status === 'hidden' || st.status === 'mystery') continue;
      const p = TREE_LAYOUT.get(id)!;
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const a = freeArea();
    const pad = 0.75;
    // Never so far that names and prices become unreadable: the player pans for the rest.
    const z = Math.max(FAR_Z + 0.04, Math.min(1.1, Math.min(a.w / ((maxX - minX + 2 * pad) * D), a.h / ((maxY - minY + 2 * pad) * D))));
    const wx = ((minX + maxX) / 2) * D;
    const wy = ((minY + maxY) / 2) * D;
    if (animate) animateTo(wx, wy, z, a.cx, a.cy);
    else {
      cam.z = Math.min(Z_MAX, Math.max(Z_MIN, z));
      cam.x = a.cx - wx * cam.z;
      cam.y = a.cy - wy * cam.z;
      clampCam();
      applyCam();
    }
  }
  function focusNode(id: string, zoom?: number): void {
    const p = TREE_LAYOUT.get(id);
    if (!p) return;
    const a = freeArea();
    animateTo(p.x * D, p.y * D, zoom ?? Math.max(cam.z, 0.95), a.cx, a.cy);
  }

  // ───────────── input: pan, pinch, wheel, taps ─────────────
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { sx: number; sy: number; cx: number; cy: number; moved: boolean; node: string | null } | null = null;
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
    cancelAnimationFrame(camAnim);
    if (pointers.size === 1) {
      const nodeEl = (e.target as HTMLElement).closest('.rt-node') as HTMLElement | null;
      drag = { sx: p.x, sy: p.y, cx: cam.x, cy: cam.y, moved: false, node: nodeEl?.dataset.id ?? null };
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
    if (d.node) tapNode(d.node);
    else if (selected) api.select(null);
  };
  vp.addEventListener('pointerup', end);
  vp.addEventListener('pointercancel', end);
  vp.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const p = local(e);
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), p.x, p.y);
    },
    { passive: false },
  );
  // Keyboard activation of a node button (Tab + Enter/Space).
  world.addEventListener('click', (e) => {
    if (performance.now() < suppressClickUntil) return;
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
    sound('open');
    if (cam.z < 0.62) focusNode(id, 0.95);
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
      const showCost = !mystery && n.def.id !== 'lab' && !st.maxed && Number.isFinite(st.cost);
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
    for (const { g, c, label } of gateEls) {
      const isClosed = g.night > night;
      c.style.display = isClosed ? '' : 'none';
      label.hidden = !isClosed;
      label.innerHTML = `${treeIcon('moon', 13)}${esc(tx(TREE_UI.night(g.night), l))}`;
    }
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
    const parts = [`${tx(TREE_UI.night(night.night), l)}`];
    if (ready) parts.push(`<b>${esc(tx(TREE_UI.affordable(ready), l))}</b>`);
    if (night.ready && night.next) parts.push(`<b>${esc(tx(TREE_UI.nightReady, l))}</b>`);
    titleP.innerHTML = parts.join(' · ');
    goLbl.textContent = tx(TREE_UI.newSession, l);
    goBtn.hidden = !opts.onNewSession;
    hint.textContent = tx(TREE_UI.hint, l);
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
      const k = Math.min(1, (performance.now() - t0) / 450);
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

  function gateBar(label: string, have: number, need: number): string {
    const k = need > 0 ? Math.min(1, have / need) : 1;
    return `<div class="rt-gatebar"><div class="row"><span>${esc(label)}</span><b>${have}/${need}</b></div><div class="track"><div class="fill" style="width:${(k * 100).toFixed(1)}%"></div></div></div>`;
  }

  function nightSheet(st: NodeState, l: Lang): string {
    const ni = nightInfo(ctxOf(data));
    const def = TREE_BY_ID.lab;
    let body = `<div class="rt-eff"><span class="now">${esc(tx(TREE_UI.night(ni.night), l))}</span>${
      ni.next ? `<span class="arrow">→</span><span class="nxt">${esc(tx(TREE_UI.night(ni.next), l))}</span>` : ''
    }</div><p class="rt-desc">${esc(tx(nodeText('lab').desc, l))}</p>`;
    if (ni.next && ni.gate) {
      const alt = ni.gate.sessions + C.NIGHT_GATE_FALLBACK;
      body += `<div class="rt-box"><h4>${esc(tx(TREE_UI.night(ni.next), l))}</h4><p class="rt-rule" style="margin:0 0 8px">${esc(
        tx(TREE_UI.nightGate(ni.gate.sessions, ni.gate.species, alt), l),
      )}</p>${gateBar(
        l === 'es' ? 'Sesiones' : 'Sessions',
        data.sessions,
        ni.gate.sessions,
      )}${gateBar(l === 'es' ? 'Especies' : 'Species', data.species, ni.gate.species)}<p class="rt-rule">${esc(tx(TREE_UI.nightRule, l))}</p></div>`;
      const label = ni.ready
        ? `${treeIcon('moon', 24)}${esc(l === 'es' ? `Empezar la Noche ${ni.next}` : `Start Night ${ni.next}`)}${ni.cost > 0 ? ` · <b>${fmt(ni.cost, l)}</b>` : ''}`
        : esc(l === 'es' ? 'Aún no' : 'Not yet');
      body += `<button type="button" class="rt-buy" data-buy="lab"${st.affordable ? '' : ' disabled'}>${label}</button>`;
    } else body += `<p class="rt-note">${esc(tx(TREE_UI.maxed, l))}</p>`;
    void def;
    return body;
  }

  function priceBox(def: TreeNodeDef, st: NodeState, l: Lang): string {
    const r = priceRule(def.id);
    const g = r.growth;
    const growthTxt = (Math.round(g * 100) / 100).toString().replace('.', l === 'es' ? ',' : '.');
    const startTile = `<div class="t"><b>${fmtShort(r.start, l)}</b><span>${esc(tx(TREE_UI.ringStart(String(def.ring)), l))}</span></div>`;
    const lv = st.level;
    const factor = Math.pow(g, lv);
    // Level 0 has nothing to multiply: [start] = [price]. Later: [start] × [×4 · 2 niveles comprados].
    const tiles =
      r.single || lv === 0
        ? `${startTile}<span class="op">=</span>`
        : `${startTile}<span class="op">×</span><div class="t"><b>×${dec2(factor, l)}</b><span>${esc(
            tx(TREE_UI.levelsBought(lv, growthTxt), l),
          )}</span></div><span class="op">=</span>`;
    const total = `<div class="t total"><b>${fmtShort(st.cost, l)}</b><span>${esc(tx(DATOS_NAME, l))}</span></div>`;
    const rule = r.single ? tx(TREE_UI.priceRuleOne(fmtShort(r.start, l)), l) : tx(TREE_UI.priceRule(fmtShort(r.start, l), growthTxt), l);
    return `<button type="button" class="rt-box rt-pricebox" data-price="${def.id}"><h4>${esc(tx(TREE_UI.why, l))}<span class="rt-tap">${treeIcon('plus', 14)}${esc(
      tx(TREE_UI.tapPrice, l),
    )}</span></h4><div class="rt-eq">${tiles}${total}</div><p class="rt-rule">${esc(rule)}</p></button>`;
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
    return `<div class="rt-box"><h4>${esc(tx(TREE_UI.nextLevels, l))}</h4><div class="rt-bars">${bars}</div></div>`;
  }

  function haveBox(st: NodeState, l: Lang): string {
    const ok = data.datos >= st.cost;
    const k = st.cost > 0 ? Math.min(1, data.datos / st.cost) : 1;
    const missing = Math.max(0, st.cost - data.datos);
    const n = sessionsToAfford(missing, data.recentDatos);
    const why = ok
      ? l === 'es'
        ? '¡Puedes comprarlo!'
        : 'You can buy it!'
      : tx(TREE_UI.missing(fmt(missing, l), n ? tx(TREE_UI.sessions(n), l) : null), l);
    return `<div class="rt-have${ok ? ' ok' : ''}"><div class="row"><span>${esc(tx(DATOS_NAME, l))}</span><b>${fmt(data.datos, l)} / ${fmt(
      st.cost,
      l,
    )}</b></div><div class="track"><div class="fill" style="width:${(k * 100).toFixed(1)}%"></div></div><div class="why">${esc(why)}</div></div>`;
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

  function renderSheet(force = false): void {
    if (!selected) {
      sheet.classList.remove('show');
      el.classList.remove('sheet-open');
      sheetKey = '';
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
    if (!mystery && br !== 'core') {
      const n = routeNodes(br).length;
      chips.push(`<span class="rt-chip br">${treeIcon(BRANCH_ICON[br], 14)}${esc(tx(BRANCH_TEXT[br].name, l))} · ${esc(tx(TREE_UI.step(def.step, n), l))}</span>`);
      chips.push(
        st.maxed
          ? `<span class="rt-chip done">${treeIcon('check', 14)}${esc(tx(TREE_UI.maxed, l))}</span>`
          : `<span class="rt-chip lv">${esc(tx(TREE_UI.level, l))} ${st.level}/${def.maxLevel >= 99 ? '∞' : def.maxLevel}</span>`,
      );
    }
    let body = '';
    if (selected === 'lab') body = nightSheet(st, l);
    else if (mystery) {
      body = `<p class="rt-note">${esc(tx(st.nightNeeded ? TREE_UI.nightLocked(st.nightNeeded) : TREE_UI.mystery, l))}</p>`;
      if (st.nightNeeded) {
        const ni = nightInfo(ctxOf(data));
        if (ni.gate) body += gateBar(l === 'es' ? 'Sesiones' : 'Sessions', data.sessions, ni.gate.sessions) + gateBar(l === 'es' ? 'Especies' : 'Species', data.species, ni.gate.species);
      }
    } else {
      body += beforeAfterBox(def, st, l);
      body += `<p class="rt-desc">${esc(tx(nodeText(def.id).desc, l))}</p>`;
      body += worldBox(def, l);
      if (!st.maxed) {
        body += priceBox(def, st, l) + barsBox(def, st, l);
        if (st.status === 'locked') {
          body += `<div class="rt-needs">${esc(tx(TREE_UI.needs, l))}: ${st.missingRequires.map((id) => needChip(id, l)).join('')}</div>`;
        } else {
          body += haveBox(st, l);
          body += `<button type="button" class="rt-buy" data-buy="${def.id}"${st.affordable ? '' : ' disabled'}>${
            st.affordable ? `${esc(tx(TREE_UI.buy, l))} · ${treeIcon('datos', 22)}<b>${fmt(st.cost, l)}</b>` : esc(tx(TREE_UI.missing(fmt(st.missingDatos, l), null), l))
          }</button>`;
        }
      }
    }
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
        if (x?.portrait) cell.appendChild(renderPattern(x.portrait, 44, 0.85));
        if (!x?.found) cell.insertAdjacentHTML('beforeend', `<i>?</i>`);
      }
    }
  }

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
      focusNode(go.dataset.go);
      return;
    }
    const price = t.closest('[data-price]') as HTMLElement | null;
    if (price?.dataset.price) {
      const st = states.get(price.dataset.price);
      const x = st ? nodePriceExplain(price.dataset.price, st.level, lang(), data) : null;
      if (x) {
        sound('open');
        priceSheet.open(x);
      }
      return;
    }
    const buy = t.closest('[data-buy]') as HTMLButtonElement | null;
    if (buy?.dataset.buy && !buy.disabled) doBuy(buy.dataset.buy, buy);
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
      d.style.setProperty('--c', i % 3 === 0 ? 'var(--rt-good)' : color);
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
    const res = opts.onBuy(id);
    if (!res || !res.ok) {
      sound('deny');
      btn?.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260 });
      return;
    }
    sound(id === 'lab' ? 'night' : 'buy');
    const prev = data;
    data = { ...data, levels: res.levels, datos: res.datos };
    recompute();
    const n = nodes.get(id);
    if (n && !rm()) {
      n.el.classList.remove('pop');
      void n.el.offsetWidth;
      n.el.classList.add('pop');
    }
    burst(id);
    const p = nodeScreen(id);
    const lvl = res.levels[id] ?? 0;
    if (p && !rm()) floatText(id === 'lab' ? tx(TREE_UI.night(lvl), lang()) : `${lvl}/${TREE_BY_ID[id].maxLevel >= 99 ? '∞' : TREE_BY_ID[id].maxLevel}`, p.x, p.y - 40);
    datosEl.classList.remove('bump');
    void datosEl.offsetWidth;
    datosEl.classList.add('bump');
    if (res.cost > 0) ticker.show({ text: `−${fmt(res.cost, lang())} · ${id === 'lab' ? tx(TREE_UI.night(lvl), lang()) : tx(nodeText(id).name, lang())}`, dir: -1 });
    if (res.revealed.length) {
      setTimeout(() => sound('reveal'), 220);
      for (const r of res.revealed) {
        const rn = nodes.get(r);
        if (rn && !rm()) {
          rn.el.classList.remove('reveal');
          void rn.el.offsetWidth;
          rn.el.classList.add('reveal');
        }
      }
      for (const e of edgeEls) {
        if ((e.from === id && res.revealed.includes(e.to)) || (res.revealed.includes(e.to) && states.get(e.from)?.status === 'owned')) {
          e.line.style.strokeDasharray = String(Math.ceil(e.len));
          e.line.classList.remove('grow');
          void (e.line as unknown as HTMLElement).getBoundingClientRect();
          if (!rm()) e.line.classList.add('grow');
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

  function recompute(): void {
    states = treeStates(ctxOf(data));
    renderNodes();
    renderEdges();
    renderGates();
    renderTop();
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

  const api: TreeView = {
    el,
    get isOpen() {
      return open;
    },
    update(d) {
      data = { ...d, levels: { ...d.levels } };
      recompute();
    },
    open() {
      if (open) return;
      open = true;
      el.hidden = false;
      el.classList.toggle('rm', rm());
      shownDatos = data.datos;
      datosNum.textContent = fmt(data.datos, lang());
      recompute();
      if (!fitted) {
        fitted = true;
        requestAnimationFrame(() => fitView(false));
      }
      requestAnimationFrame(() => el.focus({ preventScroll: true }));
    },
    close() {
      if (!open) return;
      open = false;
      el.hidden = true;
      selected = null;
      priceSheet.close();
      renderSheet();
    },
    select(id) {
      const prev = selected;
      selected = id && TREE_BY_ID[id] && states.get(id)?.status !== 'hidden' ? id : null;
      if (prev && nodes.get(prev)) nodes.get(prev)!.key = '';
      if (selected && nodes.get(selected)) nodes.get(selected)!.key = '';
      renderNodes();
      renderSheet(true);
      if (selected) requestAnimationFrame(() => focusNode(selected!, Math.max(cam.z, 0.85)));
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
      priceSheet.dispose();
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
    advice = missing > 0 ? tx(TREE_UI.missing(fmt(missing, lang), n ? tx(TREE_UI.sessions(n), lang) : null), lang) : lang === 'es' ? '¡Puedes comprarlo!' : 'You can buy it!';
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
        value: `×${dec2(Math.pow(r.growth, level), lang)}`,
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
