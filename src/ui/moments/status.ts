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
import type { Behavior, CreatureState, CreatureView, Lang } from '../../core/types';
import { STABLE_AGE_STEPS, STATUS_MAX } from '../../moments/config';
import { fmtRate } from '../format';
import { MS, tr } from './strings';

const TAU = Math.PI * 2;
const SANS = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
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

/** What the pill says for one creature. */
export function statusInfo(c: CreatureView, lang: Lang, stableAge = STABLE_AGE_STEPS): StatusInfo {
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
        detail: c.eps > 0 ? `+${fmtRate(c.eps, lang)}/s` : null,
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
 * above it, else below, else stacked further up; kept inside the view.
 */
export function placePill(x: number, y: number, r: number, w: number, h: number, taken: readonly Box[], view: { w: number; h: number }): Box & { below: boolean } {
  const clampX = (bx: number) => Math.max(4, Math.min(view.w - w - 4, bx));
  const cands: (Box & { below: boolean })[] = [
    { x: clampX(x - w / 2), y: y - r - 8 - h, w, h, below: false },
    { x: clampX(x - w / 2), y: y + r + 8, w, h, below: true },
    { x: clampX(x - w / 2), y: y - r - 8 - 2 * h - 4, w, h, below: false },
    { x: clampX(x - w / 2), y: y + r + 8 + h + 4, w, h, below: true },
  ];
  for (const c of cands) {
    if (c.y < 4 || c.y + h > view.h - 4) continue;
    if (!taken.some((t) => overlaps(c, t))) return c;
  }
  const first = cands[0].y >= 4 ? cands[0] : cands[1];
  return first;
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
  ctx.font = `700 12px ${SANS}`;
  const wl = ctx.measureText(info.label).width;
  ctx.font = `600 12px ${MONO}`;
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
): Box {
  const info = statusInfo(c, o.lang);
  const rm = !!o.reduceMotion;
  const m = measure(ctx, info);
  const view = o.view ?? { w: ctx.canvas.width, h: ctx.canvas.height };
  const box = placePill(pos.x, pos.y, pos.r, m.w, PILL_H, o.taken ?? [], view);
  o.taken?.push(box);
  const a = o.alpha ?? 1;
  if (a <= 0.01) return box;
  ctx.save();
  ctx.globalAlpha *= a;
  // Tail towards the creature.
  const tx = Math.max(box.x + 10, Math.min(box.x + box.w - 10, pos.x));
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
  ctx.lineWidth = o.selected ? 2 : 1.4;
  ctx.strokeStyle = info.color;
  ctx.globalAlpha *= o.selected ? 1 : 0.85;
  ctx.stroke();
  ctx.globalAlpha = a;
  const cy = box.y + box.h / 2;
  let x = box.x + 8;
  stateIcon(ctx, info, x + 7, cy, o.time, rm);
  x += 14 + 5;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `700 12px ${SANS}`;
  ctx.fillStyle = info.kind === 'dead' ? '#C9D1D9' : info.color;
  ctx.fillText(info.label, x, cy + 0.5);
  x += m.wl;
  if (info.detail) {
    x += 5;
    ctx.font = `600 12px ${MONO}`;
    ctx.fillStyle = '#E6EDF3';
    ctx.fillText(info.detail, x, cy + 0.5);
    x += m.wd;
  }
  if (info.behavior) drawBehaviorGlyph(ctx, info.behavior, x + 10, cy, o.time, rm);
  ctx.restore();
  return box;
}

/**
 * Stateful helper for the overlay: picks which creatures get a pill, fades
 * pills in/out, avoids overlaps and draws them. One call per overlay frame.
 */
export class StatusLayer {
  private alpha = new Map<number, number>();
  /** Pills drawn last frame (for taps): box in overlay CSS px. */
  private hits: { box: Box; id: number; behavior: Behavior | null; state: CreatureState }[] = [];

  /**
   * Which pill is under a tap (overlay CSS px), with a ≥ 44 px tall hit area.
   * Tapping a pill with a behaviour → open the Behaviour Guide at it.
   */
  hitTest(px: number, py: number): { id: number; behavior: Behavior | null; state: CreatureState } | null {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      const pad = Math.max(0, (44 - h.box.h) / 2);
      if (px >= h.box.x - 4 && px <= h.box.x + h.box.w + 4 && py >= h.box.y - pad && py <= h.box.y + h.box.h + pad)
        return { id: h.id, behavior: h.behavior, state: h.state };
    }
    return null;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    creatures: readonly CreatureView[],
    /** Screen position + halo radius of a creature (overlay smoothing), or null if off-screen. */
    toScreen: (c: CreatureView) => { x: number; y: number; r: number } | null,
    o: { lang: Lang; time: number; dt: number; reduceMotion: boolean; onAll: boolean; selectedId: number | null; view: { w: number; h: number } },
  ): void {
    const picked = new Map(pickStatusIds(creatures, { onAll: o.onAll, selectedId: o.selectedId }).map((p) => [p.id, p.alpha]));
    const k = o.reduceMotion ? 1 : Math.min(1, o.dt * 6);
    const taken: Box[] = [];
    this.hits = [];
    // Selected first so it always gets the best spot.
    const order = [...creatures].sort((a, b) => (b.id === o.selectedId ? 1 : 0) - (a.id === o.selectedId ? 1 : 0));
    for (const c of order) {
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
      const box = drawCreatureStatus(ctx, c, p, {
        lang: o.lang,
        time: o.time,
        reduceMotion: o.reduceMotion,
        alpha: a,
        selected: c.id === o.selectedId,
        taken,
        view: o.view,
      });
      if (a > 0.5) this.hits.push({ box, id: c.id, behavior: c.state === 'stable' ? c.behavior : null, state: c.state });
    }
    const alive = new Set(creatures.map((c) => c.id));
    for (const id of [...this.alpha.keys()]) if (!alive.has(id)) this.alpha.delete(id);
  }
}
