/**
 * Creature status pills, drawn by the dish overlay right above each creature,
 * so anyone can tell creatures apart and see what each one is doing:
 *
 *   ◔ Naciendo 62 %        forming: a ring fills up to "stable" (~400 steps)
 *   ✓ Estable +1,2/s  ➜    paying, with its behaviour glyph once classified
 *   ✗ Explotó              too much matter: pays nothing (orange)
 *   ◌ Se disuelve…         fading away (grey)
 *
 * Legible on the dark dish at 360 px wide (dark backing, coloured rim, 12 px
 * bold, ≥ 12 px). Crowded dishes show at most 6 (the most interesting: forming ones,
 * accidents, the newest), always the tapped one; overlaps are pushed apart.
 *
 * Pure parts (statusInfo, pickStatusIds, placePills) have no DOM and are tested.
 */
import { BEHAVIOR_COLOR, UI } from '../../core/palette';
import type { Behavior, CreatureState, CreatureView, GameView, Lang } from '../../core/types';
import { STABLE_AGE_STEPS, STATUS_MAX } from '../../moments/config';
import { fmtRate } from '../format';
import { MS, tr } from './strings';

const TAU = Math.PI * 2;
const SANS = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
/** Numbers in Inter (docs/ARTE.md §4: the mono is only for instruments). */
const MONO = 'Inter, "Inter Fallback", system-ui, sans-serif';
const FONT_LABEL = `700 12px ${SANS}`;
const FONT_DETAIL = `600 12px ${MONO}`;
const FORMING = '#9FD3F0';
const GREY = '#9AA6B2';

export interface StatusInfo {
  kind: CreatureState;
  label: string;
  /** "62 %", "+1,2/s" or null. */
  detail: string | null;
  color: string;
  /** 0..1 towards stable (forming only). */
  progress: number | null;
  behavior: Behavior | null;
}

/**
 * True while the dish earns (the session clock runs, or no session at all). Before the first seed the
 * HUD says +0/s, so no label or card may show a rate either (RF-10: one number everywhere).
 */
export function earningNow(v: Pick<GameView, 'session'>): boolean {
  return !v.session || v.session.phase === 'running';
}

/** What the pill says for one creature (`earning` false: no rate while the clock waits, RF-10). */
export function statusInfo(c: CreatureView, lang: Lang, stableAge = STABLE_AGE_STEPS, earning = true): StatusInfo {
  switch (c.state) {
    case 'born': {
      const p = Math.max(0, Math.min(0.99, c.age / Math.max(1, stableAge)));
      const pct = Math.floor(p * 100);
      return { kind: 'born', label: tr(MS.stBorn, lang), detail: lang === 'es' ? `${pct} %` : `${pct}%`, color: FORMING, progress: p, behavior: null };
    }
    case 'stable':
      return {
        kind: 'stable',
        label: tr(MS.stStable, lang),
        detail: earning && c.eps > 0 ? `+${fmtRate(c.eps, lang)}/s` : null,
        color: UI.good,
        progress: null,
        behavior: c.behavior,
      };
    case 'exploded':
      return { kind: 'exploded', label: tr(MS.stExploded, lang), detail: null, color: UI.warn, progress: null, behavior: null };
    default:
      return { kind: 'dead', label: tr(MS.stDead, lang), detail: null, color: GREY, progress: null, behavior: null };
  }
}

export interface PickOpts {
  /** Labels on every creature (Era 1 / setting) or only the tapped one. */
  onAll: boolean;
  selectedId: number | null;
  max?: number;
  /** Prefer creatures near this grid point (e.g. the view centre when zoomed). */
  near?: { x: number; y: number } | null;
}

/**
 * Which creatures get a pill and how opaque: always the tapped one; otherwise
 * the most informative (forming → accidents → newest stable), at most `max`.
 */
export function pickStatusIds(creatures: readonly CreatureView[], o: PickOpts): { id: number; alpha: number }[] {
  const max = o.max ?? STATUS_MAX;
  const sel = o.selectedId;
  if (!o.onAll) return creatures.some((c) => c.id === sel) ? [{ id: sel!, alpha: 1 }] : [];
  const score = (c: CreatureView): number => {
    if (c.id === sel) return 1e9;
    let s: number;
    if (c.state === 'born') s = 4 - Math.min(1, c.age / STABLE_AGE_STEPS) * 0.5;
    else if (c.state === 'exploded') s = 3.4;
    else if (c.state === 'dead') s = 3.2;
    else s = 1 + 1 / (1 + c.age / 1000);
    if (o.near) s -= Math.hypot(c.x - o.near.x, c.y - o.near.y) / 400;
    return s;
  };
  const ranked = [...creatures].sort((a, b) => score(b) - score(a) || a.id - b.id).slice(0, max);
  const crowded = creatures.length > max;
  return ranked.map((c) => ({ id: c.id, alpha: c.id === sel || !crowded ? 1 : 0.82 }));
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Box, b: Box, pad = 3) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

/**
 * Place a pill of size w×h for a creature at (x, y) with halo radius r:
 * above it, else below, else stacked further up; kept inside the view. When every spot is taken the
 * first one is returned with `blocked` (the caller hides that pill: one label at a time, ARTE §10).
 */
export function placePill(
  x: number,
  y: number,
  r: number,
  w: number,
  h: number,
  taken: readonly Box[],
  view: { w: number; h: number },
): Box & { below: boolean; blocked?: boolean } {
  const out: PlacedBox = { x: 0, y: 0, w: 0, h: 0, below: false, blocked: false };
  placePillInto(out, x, y, r, w, h, taken, taken.length, view);
  return out.blocked ? out : { x: out.x, y: out.y, w: out.w, h: out.h, below: out.below };
}

interface PlacedBox extends Box {
  below: boolean;
  blocked: boolean;
}

/** placePill without allocating: writes into `out`; only the first `n` boxes of `taken` count. */
function placePillInto(
  out: PlacedBox,
  x: number,
  y: number,
  r: number,
  w: number,
  h: number,
  taken: readonly Box[],
  n: number,
  view: { w: number; h: number },
): void {
  const bx = Math.max(4, Math.min(view.w - w - 4, x - w / 2));
  out.x = bx;
  out.w = w;
  out.h = h;
  for (let k = 0; k < 4; k++) {
    const below = k % 2 === 1;
    const cy = k === 0 ? y - r - 8 - h : k === 1 ? y + r + 8 : k === 2 ? y - r - 8 - 2 * h - 4 : y + r + 8 + h + 4;
    if (cy < 4 || cy + h > view.h - 4) continue;
    out.y = cy;
    out.below = below;
    let free = true;
    for (let i = 0; i < n && free; i++) if (overlaps(out, taken[i])) free = false;
    if (free) {
      out.blocked = false;
      return;
    }
  }
  const up = y - r - 8 - h;
  out.below = !(up >= 4);
  out.y = up >= 4 ? up : y + r + 8;
  out.blocked = n > 0;
}

// ───────────────────────────── drawing ─────────────────────────────

export interface DrawStatusOpts {
  lang: Lang;
  /** Seconds (animations). */
  time: number;
  reduceMotion?: boolean;
  alpha?: number;
  selected?: boolean;
  /** Pills already placed this frame (overlap avoidance); the new box is pushed into it. */
  taken?: Box[];
  /** View size in CSS px (keeps pills on screen). */
  view?: { w: number; h: number };
}

const PILL_H = 24;

function measure(ctx: CanvasRenderingContext2D, info: StatusInfo): { w: number; wl: number; wd: number } {
  ctx.font = FONT_LABEL;
  const wl = ctx.measureText(info.label).width;
  ctx.font = FONT_DETAIL;
  const wd = info.detail ? ctx.measureText(info.detail).width : 0;
  const glyph = info.behavior ? 16 : 0;
  return { w: 8 + 14 + 5 + wl + (wd ? 5 + wd : 0) + glyph + 9, wl, wd };
}

/** Small behaviour glyph (shape + colour, never colour alone). */
export function drawBehaviorGlyph(ctx: CanvasRenderingContext2D, b: Behavior, x: number, y: number, time: number, rm: boolean, s = 1): void {
  const col = BEHAVIOR_COLOR[b] ?? UI.accent;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  switch (b) {
    case 'still':
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, TAU);
      ctx.fill();
      break;
    case 'pulsing': {
      const pr = rm ? 4.8 : 4 + Math.sin(time * TAU) * 1;
      ctx.beginPath();
      ctx.arc(0, 0, 1.9, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, pr, 0, TAU);
      ctx.stroke();
      break;
    }
    case 'swimmer':
      ctx.beginPath();
      ctx.moveTo(4.6, 0);
      ctx.lineTo(-3, -3.6);
      ctx.lineTo(-1.4, 0);
      ctx.lineTo(-3, 3.6);
      ctx.closePath();
      ctx.fill();
      break;
    case 'spinner':
      ctx.rotate(rm ? 0 : time * 2.2);
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const tt = i / 24;
        const a = tt * Math.PI * 3;
        const r = 0.6 + tt * 4.2;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.stroke();
      break;
    case 'divider':
      ctx.beginPath();
      ctx.arc(-2.6, 0, 2.1, 0, TAU);
      ctx.arc(2.6, 0, 2.1, 0, TAU);
      ctx.fill();
      break;
    case 'colony':
      ctx.beginPath();
      ctx.arc(0, -2.4, 1.8, 0, TAU);
      ctx.arc(-2.4, 1.8, 1.8, 0, TAU);
      ctx.arc(2.4, 1.8, 1.8, 0, TAU);
      ctx.fill();
      break;
  }
  ctx.restore();
}

function stateIcon(ctx: CanvasRenderingContext2D, info: StatusInfo, x: number, y: number, time: number, rm: boolean): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (info.kind === 'born') {
    ctx.strokeStyle = 'rgba(159,211,240,0.25)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(x, y, 5.6, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = info.color;
    ctx.beginPath();
    ctx.arc(x, y, 5.6, -Math.PI / 2, -Math.PI / 2 + TAU * (info.progress ?? 0));
    ctx.stroke();
    if (!rm) {
      const a = time * 4;
      ctx.fillStyle = info.color;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 1.6, y + Math.sin(a) * 1.6, 1.1, 0, TAU);
      ctx.fill();
    }
  } else if (info.kind === 'stable' || info.kind === 'exploded') {
    ctx.fillStyle = info.color;
    ctx.beginPath();
    ctx.arc(x, y, 6.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#0B0E12';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    if (info.kind === 'stable') {
      ctx.moveTo(x - 2.8, y + 0.2);
      ctx.lineTo(x - 0.6, y + 2.4);
      ctx.lineTo(x + 3, y - 2);
    } else {
      ctx.moveTo(x - 2.3, y - 2.3);
      ctx.lineTo(x + 2.3, y + 2.3);
      ctx.moveTo(x + 2.3, y - 2.3);
      ctx.lineTo(x - 2.3, y + 2.3);
    }
    ctx.stroke();
  } else {
    ctx.strokeStyle = info.color;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([2, 2]);
    ctx.lineDashOffset = rm ? 0 : -time * 6;
    ctx.beginPath();
    ctx.arc(x, y, 5.4, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw one status pill for creature `c` whose centre is at screen `pos` (CSS
 * px of the overlay canvas, `r` = halo radius). Returns the pill box.
 */
export function drawCreatureStatus(
  ctx: CanvasRenderingContext2D,
  c: CreatureView,
  pos: { x: number; y: number; r: number },
  o: DrawStatusOpts,
): Box & { blocked?: boolean } {
  const info = statusInfo(c, o.lang);
  const rm = !!o.reduceMotion;
  const m = measure(ctx, info);
  const view = o.view ?? { w: ctx.canvas.width, h: ctx.canvas.height };
  const box = placePill(pos.x, pos.y, pos.r, m.w, PILL_H, o.taken ?? [], view);
  // No free spot: this pill waits (the selected one always shows).
  if (box.blocked && !o.selected) return box;
  o.taken?.push(box);
  drawPill(ctx, info, m, box, pos.x, o.alpha ?? 1, !!o.selected, o.time, rm);
  return box;
}

/** Draw a placed pill (no allocation: the caller owns `info`, `m` and `box`). */
function drawPill(
  ctx: CanvasRenderingContext2D,
  info: StatusInfo,
  m: { wl: number; wd: number },
  box: Box & { below: boolean },
  posX: number,
  a: number,
  selected: boolean,
  time: number,
  rm: boolean,
): void {
  if (a <= 0.01) return;
  ctx.save();
  ctx.globalAlpha *= a;
  // Tail towards the creature.
  const tx = Math.max(box.x + 10, Math.min(box.x + box.w - 10, posX));
  ctx.fillStyle = 'rgba(8,11,15,0.88)';
  ctx.beginPath();
  if (box.below) {
    ctx.moveTo(tx - 5, box.y + 0.5);
    ctx.lineTo(tx, box.y - 5);
    ctx.lineTo(tx + 5, box.y + 0.5);
  } else {
    ctx.moveTo(tx - 5, box.y + box.h - 0.5);
    ctx.lineTo(tx, box.y + box.h + 5);
    ctx.lineTo(tx + 5, box.y + box.h - 0.5);
  }
  ctx.fill();
  // Body.
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, box.h / 2);
  ctx.fill();
  ctx.lineWidth = selected ? 2 : 1.4;
  ctx.strokeStyle = info.color;
  ctx.globalAlpha *= selected ? 1 : 0.85;
  ctx.stroke();
  ctx.globalAlpha = a;
  const cy = box.y + box.h / 2;
  let x = box.x + 8;
  stateIcon(ctx, info, x + 7, cy, time, rm);
  x += 14 + 5;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = FONT_LABEL;
  ctx.fillStyle = info.kind === 'dead' ? '#C9D1D9' : info.color;
  ctx.fillText(info.label, x, cy + 0.5);
  x += m.wl;
  if (info.detail) {
    x += 5;
    ctx.font = FONT_DETAIL;
    ctx.fillStyle = '#E6EDF3';
    ctx.fillText(info.detail, x, cy + 0.5);
    x += m.wd;
  }
  if (info.behavior) drawBehaviorGlyph(ctx, info.behavior, x + 10, cy, time, rm);
  ctx.restore();
}

/**
 * Stateful helper for the overlay: picks which creatures get a pill, fades
 * pills in/out, avoids overlaps and draws them. One call per overlay frame.
 */
/** A creature's pill text, measured once and rebuilt only when what it says changes (never per frame). */
interface PillCache {
  state: CreatureState;
  pct: number;
  eps: number;
  behavior: Behavior | null;
  lang: Lang;
  info: StatusInfo;
  wl: number;
  wd: number;
  w: number;
}

interface PillHit {
  box: PlacedBox;
  id: number;
  behavior: Behavior | null;
  state: CreatureState;
}

export class StatusLayer {
  /** Pills drawn by the last draw() (the overlay keeps creature names clear of them). */
  get placedCount(): number {
    return this.nBoxes;
  }
  /** The i-th pill box of the last draw() (left, top, width, height in CSS px). Reused: read it now. */
  placedBox(i: number): Readonly<Box> {
    return this.boxes[i];
  }

  /** Creature `id` got a pill in the last draw() (the overlay then leaves out its name: one label per creature). */
  hasPill(id: number): boolean {
    for (let i = 0; i < this.nHits; i++) if (this.hits[i].id === id) return true;
    return false;
  }

  private alpha = new Map<number, number>();
  /** Per-view work (which creatures get a pill, draw order), redone only when the list changes: no per-frame maps or sorts. */
  private key: { list: readonly CreatureView[] | null; onAll: boolean; sel: number | null } = { list: null, onAll: false, sel: null };
  private picked = new Map<number, number>();
  private order: CreatureView[] = [];
  private cache = new Map<number, PillCache>();
  /** Pills placed this frame (overlap avoidance) and the ones drawn (for taps): pooled, reused every frame. */
  private boxes: PlacedBox[] = [];
  private nBoxes = 0;
  private hits: PillHit[] = [];
  private nHits = 0;

  /**
   * Which pill is under a tap (overlay CSS px), with a ≥ 44 px tall hit area.
   * Tapping a pill with a behaviour → open the Behaviour Guide at it.
   */
  hitTest(px: number, py: number): { id: number; behavior: Behavior | null; state: CreatureState } | null {
    for (let i = this.nHits - 1; i >= 0; i--) {
      const h = this.hits[i];
      const pad = Math.max(0, (44 - h.box.h) / 2);
      if (px >= h.box.x - 4 && px <= h.box.x + h.box.w + 4 && py >= h.box.y - pad && py <= h.box.y + h.box.h + pad)
        return { id: h.id, behavior: h.behavior, state: h.state };
    }
    return null;
  }

  private infoOf(ctx: CanvasRenderingContext2D, c: CreatureView, lang: Lang, earning: boolean): PillCache {
    const pct = c.state === 'born' ? Math.floor(Math.max(0, Math.min(0.99, c.age / Math.max(1, STABLE_AGE_STEPS))) * 100) : -1;
    const eps = c.state === 'stable' && earning ? c.eps : 0;
    const behavior = c.state === 'stable' ? c.behavior : null;
    let e = this.cache.get(c.id);
    if (e && e.state === c.state && e.pct === pct && e.eps === eps && e.behavior === behavior && e.lang === lang) return e;
    const info = statusInfo(c, lang, STABLE_AGE_STEPS, earning);
    const m = measure(ctx, info);
    if (!e) {
      e = { state: c.state, pct, eps, behavior, lang, info, wl: m.wl, wd: m.wd, w: m.w };
      this.cache.set(c.id, e);
    } else Object.assign(e, { state: c.state, pct, eps, behavior, lang, info, wl: m.wl, wd: m.wd, w: m.w });
    return e;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    creatures: readonly CreatureView[],
    /** Screen position + halo radius of a creature (overlay smoothing), or null if off-screen. */
    toScreen: (c: CreatureView) => { x: number; y: number; r: number } | null,
    o: { lang: Lang; time: number; dt: number; reduceMotion: boolean; onAll: boolean; selectedId: number | null; view: { w: number; h: number }; earning?: boolean },
  ): void {
    const key = this.key;
    if (key.list !== creatures || key.onAll !== o.onAll || key.sel !== o.selectedId) {
      key.list = creatures;
      key.onAll = o.onAll;
      key.sel = o.selectedId;
      this.picked.clear();
      for (const p of pickStatusIds(creatures, { onAll: o.onAll, selectedId: o.selectedId })) this.picked.set(p.id, p.alpha);
      // Selected first so it always gets the best spot.
      this.order.length = 0;
      for (const c of creatures) this.order.push(c);
      this.order.sort((a, b) => (b.id === o.selectedId ? 1 : 0) - (a.id === o.selectedId ? 1 : 0));
      // Forget creatures that are gone.
      for (const id of this.alpha.keys()) if (!creatures.some((c) => c.id === id)) this.alpha.delete(id);
      for (const id of this.cache.keys()) if (!creatures.some((c) => c.id === id)) this.cache.delete(id);
    }
    const picked = this.picked;
    const k = o.reduceMotion ? 1 : Math.min(1, o.dt * 6);
    this.nBoxes = 0;
    this.nHits = 0;
    for (const c of this.order) {
      const target = picked.get(c.id) ?? 0;
      const cur = this.alpha.get(c.id) ?? 0;
      const a = cur + (target - cur) * k;
      if (a < 0.02 && target === 0) {
        this.alpha.delete(c.id);
        continue;
      }
      this.alpha.set(c.id, a);
      const p = toScreen(c);
      if (!p || p.x < -p.r || p.y < -p.r || p.x > o.view.w + p.r || p.y > o.view.h + p.r) continue;
      const pc = this.infoOf(ctx, c, o.lang, o.earning ?? true);
      if (this.nBoxes === this.boxes.length) this.boxes.push({ x: 0, y: 0, w: 0, h: 0, below: false, blocked: false });
      const box = this.boxes[this.nBoxes];
      placePillInto(box, p.x, p.y, p.r, pc.w, PILL_H, this.boxes, this.nBoxes, o.view);
      const selected = c.id === o.selectedId;
      // No free spot: this pill waits (the selected one always shows).
      if (box.blocked && !selected) continue;
      this.nBoxes++;
      drawPill(ctx, pc.info, pc, box, p.x, a, selected, o.time, o.reduceMotion);
      if (a > 0.5) {
        if (this.nHits === this.hits.length) this.hits.push({ box, id: 0, behavior: null, state: 'born' });
        const h = this.hits[this.nHits++];
        h.box = box;
        h.id = c.id;
        h.behavior = c.state === 'stable' ? c.behavior : null;
        h.state = c.state;
      }
    }
  }
}
