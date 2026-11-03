/**
 * Drops of light on the dish (ADR-030, docs/CLARIDAD2.md §2.2): every stable creature fills its own
 * drop with what it makes; the player taps or swipes to collect it, pipettes collect it for them, and
 * a drop whose creature went dark stays where it was, loose, until someone takes it.
 *
 * Drawn as lab light, not as a cartoon (docs/ARTE-REALISTA.md §3, §6.4): a sessile bead of luminous
 * liquid sitting on the agar, painted once per species colour with the 8 layers (contact shadow,
 * body, caustic, meniscus edge, the dish's cyan bounce, one window specular, the meniscus rim light, a
 * fine contour) and blitted every frame; around it a 1 px meter ring that fills clockwise like a
 * gauge; the bioluminescent glow breathes slowly once the drop is ripe (never a bounce, never with
 * Reduce motion). Collecting is a meniscus ring and the bead drawing in (150 ms), or the bead being
 * sipped into a pipette's tip.
 *
 * Frames allocate nothing: drop states and pops are pooled, the bead sprites are cached per hue, colours
 * are atlas indices, positions are written into reused objects.
 */
import type { DropView } from '../../core/types';
import { LIGHT_POP_MS, LIGHT_RIPE_SHARE, LIGHT_TAP_RADIUS_PX } from '../../game/cycleBalance';
import { rgba } from '../art/vector';
import { SPR, type SpriteAtlas } from './sprites';
import type { TapDrop } from '../dishTap';

/**
 * Feel numbers of the drops. `ripe`, `tapPx`, `popMs` are the game's cycleBalance LIGHT_RIPE_SHARE,
 * LIGHT_TAP_RADIUS_PX and LIGHT_POP_MS (docs/CLARIDAD2.md §3.2): the dish draws what the game counts.
 * The rest is drawing.
 */
export const DROP_FX = {
  /** A drop is ripe (its glow breathes, "¡Lista!" the first time) at this share of its cap. */
  ripe: LIGHT_RIPE_SHARE,
  /** Touch radius in CSS px at any zoom: a 64 px target (CLAUDE.md asks for 48). */
  tapPx: LIGHT_TAP_RADIUS_PX,
  /** The bead drawing in when collected, ms (Reduce motion: a fade of the same length). */
  popMs: LIGHT_POP_MS,
  /** Bead radius (CSS px at zoom 1): empty → full, by the square root of the fill (its area grows with the light). */
  rMin: 4,
  rMax: 11,
  /** Zoomed in, a bead grows with the dish (it is a thing on the agar), up to this factor. */
  zoomMax: 2.6,
  /** The meter ring sits this far outside the bead (CSS px). */
  ringGap: 3,
  /** An owned drop sits on its creature's outline, up and to the right (radians from +x, y down). */
  anchorAngle: -Math.PI / 4,
  /** Ripe glow: one slow breath per this many seconds (an instrument's LED breathes, ≤ 3 Hz). */
  breathS: 1.6,
  /** Drops drawn at once (more are still collectable; the game caps them anyway). */
  max: 32,
  /** Pops in flight at once. */
  maxPops: 24,
  /** Default hue (the Luz accent, #5bc0eb) for a drop whose species has no colour yet. */
  defaultHue: 197,
} as const;

/** Bead radius in CSS px for a fill 0..1 at camera zoom `zoom` (1 = the whole dish). */
export function beadRadius(fill: number, zoom = 1): number {
  const f = fill <= 0 ? 0 : fill >= 1 ? 1 : fill;
  const z = zoom <= 1 ? 1 : Math.min(DROP_FX.zoomMax, Math.pow(zoom, 0.8));
  return (DROP_FX.rMin + (DROP_FX.rMax - DROP_FX.rMin) * Math.sqrt(f)) * z;
}

/**
 * Glow strength 0..1 at time t (s): grows with the fill; a ripe drop breathes between 70 % and 100 %
 * of it, a full one holds at 100 % (it is waiting, steady); Reduce motion holds still.
 */
export function dropGlow(fill: number, t: number, reduceMotion: boolean): number {
  const f = fill <= 0 ? 0 : fill >= 1 ? 1 : fill;
  const base = 0.25 + 0.75 * f;
  if (reduceMotion || f < DROP_FX.ripe || f >= 1) return base;
  const ph = (t / DROP_FX.breathS) % 1;
  return base * (0.85 + 0.15 * Math.cos(ph * Math.PI * 2));
}

/** Where an owned drop's centre sits from its creature's centre (CSS px): on the outline, up-right. */
export function dropAnchor(outlinePx: number, beadPx: number, out: { x: number; y: number }): void {
  const d = outlinePx + beadPx + DROP_FX.ringGap + 1;
  out.x = Math.cos(DROP_FX.anchorAngle) * d;
  out.y = Math.sin(DROP_FX.anchorAngle) * d;
}

/** Bead scale while being collected: 1 → 0 over popMs, easing in (it is drawn in, not popped). */
export function popScale(t: number): number {
  const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return 1 - u * u;
}

/** HSL (h, s, l in 0..1) → [r, g, b] 0..255. */
function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Side of a cached bead sprite in device px, and the bead's radius inside it. */
const SPRITE = 64;
const SPRITE_R = 22;

/**
 * Paint the bead of hue `hue` (the 8 layers of ARTE-REALISTA §3.2) on a SPRITE × SPRITE canvas, light
 * from the top left (the room's window), the dish's cyan from below.
 */
function paintBead(hue: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SPRITE;
  const g = c.getContext('2d')!;
  const cx = SPRITE / 2;
  const cy = SPRITE / 2;
  const R = SPRITE_R;
  // A bead of liquid light: bright all through (it emits), hottest at the caustic, a little deeper at the rim.
  const [wr, wg, wb] = hsl(hue, 0.9, 0.94);
  const [hr, hg, hb] = hsl(hue, 0.88, 0.76);
  const [mr, mg, mb] = hsl(hue, 0.8, 0.58);
  const [dr, dg, db] = hsl(hue, 0.75, 0.4);
  // 1 · contact shadow: the bead sits on the agar (a soft ring under it, offset away from the window).
  const sh = g.createRadialGradient(cx + 2, cy + 3, R * 0.6, cx + 2, cy + 3, R * 1.25);
  sh.addColorStop(0, 'rgba(0,0,0,0.55)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh;
  g.beginPath();
  g.arc(cx + 2, cy + 3, R * 1.25, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.clip();
  // 2 · body: the luminous liquid; the caustic (light focused through the lens of the drop) lies
  // opposite the window, low and to the right, so the liquid is hottest there.
  const body = g.createRadialGradient(cx + R * 0.28, cy + R * 0.32, 0, cx, cy, R);
  body.addColorStop(0, rgba(wr, wg, wb, 1));
  body.addColorStop(0.3, rgba(hr, hg, hb, 1));
  body.addColorStop(0.72, rgba(mr, mg, mb, 0.97));
  body.addColorStop(1, rgba(dr, dg, db, 0.95));
  g.fillStyle = body;
  g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  // 3 · meniscus edge: refraction darkens the rim of a drop all round, most on the window's side.
  g.globalCompositeOperation = 'multiply';
  const edge = g.createRadialGradient(cx + R * 0.12, cy + R * 0.12, R * 0.62, cx, cy, R);
  edge.addColorStop(0, '#ffffff');
  edge.addColorStop(1, '#9aa3aa');
  g.fillStyle = edge;
  g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  // 4 · bounce: the dish's cyan, from below.
  g.globalCompositeOperation = 'screen';
  const bounce = g.createLinearGradient(0, cy + R, 0, cy + R * 0.35);
  bounce.addColorStop(0, 'rgba(91,192,235,0.22)');
  bounce.addColorStop(1, 'rgba(91,192,235,0)');
  g.fillStyle = bounce;
  g.fillRect(cx - R, cy, 2 * R, R);
  g.globalCompositeOperation = 'source-over';
  // 5 · specular: one reflection of the window, a soft ellipse at the top left.
  g.save();
  g.translate(cx - R * 0.4, cy - R * 0.44);
  g.rotate(-Math.PI / 5);
  g.scale(1, 0.55);
  const spec = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.34);
  spec.addColorStop(0, 'rgba(255,255,255,0.92)');
  spec.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = spec;
  g.beginPath();
  g.arc(0, 0, R * 0.34, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.restore();
  // 6 · rim light: the meniscus catches the liquid's own light on the far side (bottom right).
  g.lineWidth = 1.4;
  const rim = g.createLinearGradient(cx - R * 0.2, cy - R * 0.2, cx + R, cy + R);
  rim.addColorStop(0, rgba(hr, hg, hb, 0));
  rim.addColorStop(1, rgba(hr, hg, hb, 0.6));
  g.strokeStyle = rim;
  g.beginPath();
  g.arc(cx, cy, R - 1.2, -Math.PI * 0.05, Math.PI * 0.62);
  g.stroke();
  // 7 · texture: a liquid has none (layer skipped on purpose: grain would read as a solid bead).
  // 8 · contour: where the liquid meets the agar, fine (a dark ring would make it a glass marble).
  g.lineWidth = 1.2;
  g.strokeStyle = 'rgba(4,10,16,0.5)';
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.stroke();
  return c;
}

interface DropState {
  id: number;
  /** Still in the latest view. */
  live: boolean;
  owner: number | null;
  /** Grid position from the view (loose drops sit here; owned ones follow their creature). */
  gx: number;
  gy: number;
  amount: number;
  /** Fill from the view, and the one drawn (eased, so 10 Hz views do not step). */
  fill: number;
  shown: number;
  hue: number;
  /** Where it was drawn this frame (overlay CSS px) and its bead radius. */
  x: number;
  y: number;
  r: number;
  drawn: boolean;
  /** Collected by the player's own finger (the pop already started), and when (overlay s). */
  taken: boolean;
  takenAt: number;
  /** It has been ripe once (the "¡Lista!" label is told once per drop). */
  ripeSeen: boolean;
}

interface Pop {
  on: boolean;
  x: number;
  y: number;
  t0: number;
  r: number;
  hue: number;
  /** Sipped into a pipette tip (no meniscus ring: the bead goes into the glass). */
  sipped: boolean;
}

/** Resolves a creature's drawn centre and outline (overlay CSS px) into `out`; false when not drawn. */
export type CreatureResolver = (id: number, out: { x: number; y: number; r: number; hue: number | undefined }) => boolean;

export class DropLayer {
  private readonly states = new Map<number, DropState>();
  private readonly spare: DropState[] = [];
  private readonly pops: Pop[] = Array.from({ length: DROP_FX.maxPops }, () => ({ on: false, x: 0, y: 0, t0: 0, r: 0, hue: 0, sipped: false }));
  private popHead = 0;
  private readonly sprites = new Map<number, HTMLCanvasElement>();
  private readonly glowIdx = new Map<number, number>();
  private readonly scratch = { x: 0, y: 0, r: 0, hue: undefined as number | undefined };
  private readonly off = { x: 0, y: 0 };
  /** Drops as drawn this frame, for the tap router (reused objects). */
  readonly tap: TapDrop[] = Array.from({ length: DROP_FX.max }, () => ({ id: 0, x: 0, y: 0, amount: 0, owner: null }));
  tapCount = 0;
  /** Whether the view carries drops at all (collection is in play). */
  active = false;
  /** A drop went ripe for the first time: (x, y) in overlay px (the overlay labels it). */
  onRipe: ((x: number, y: number) => void) | null = null;

  /** The latest view's drops (null/undefined: the game has no collection). */
  setView(drops: readonly DropView[] | null | undefined, hueOf: (owner: number) => number | undefined, now: number, sippedBy: (dropId: number) => boolean): void {
    this.active = !!drops;
    for (const s of this.states.values()) s.live = false;
    if (drops) {
      for (const d of drops) {
        let s = this.states.get(d.id);
        if (!s) {
          s = this.spare.pop() ?? ({} as DropState);
          s.id = d.id;
          s.shown = d.fill;
          s.x = s.y = s.r = 0;
          s.drawn = false;
          s.taken = false;
          s.takenAt = 0;
          s.ripeSeen = d.fill >= DROP_FX.ripe;
          s.hue = DROP_FX.defaultHue;
          this.states.set(d.id, s);
        }
        s.live = true;
        // A game that keeps the drop's id after a collection (it refills from empty) shows it again at once.
        if (s.taken && (d.amount < s.amount * 0.5 || now - s.takenAt > 0.4)) {
          s.taken = false;
          s.shown = d.fill;
        }
        s.owner = d.owner;
        s.gx = d.x;
        s.gy = d.y;
        s.amount = d.amount;
        s.fill = d.fill;
        if (d.owner !== null) {
          const h = hueOf(d.owner);
          if (h !== undefined) s.hue = h;
        }
      }
    }
    // Gone from the view: it was collected (light is never lost). Draw it in, unless the finger did already.
    for (const s of this.states.values()) {
      if (s.live) continue;
      if (!s.taken && s.drawn) this.pop(s.x, s.y, s.r, s.hue, now, sippedBy(s.id));
      this.states.delete(s.id);
      this.spare.push(s);
    }
  }

  /** The player collected drop `id` (a tap or a swipe): it draws in now, before the next view. */
  take(id: number, now: number): { x: number; y: number; hue: number } | null {
    const s = this.states.get(id);
    if (!s || s.taken) return null;
    s.taken = true;
    s.takenAt = now;
    if (s.drawn) this.pop(s.x, s.y, s.r, s.hue, now, false);
    return s.drawn ? { x: s.x, y: s.y, hue: s.hue } : null;
  }

  /** Drawn position of drop `id` this frame (overlay CSS px), or null. The object is reused. */
  posOf(id: number): { x: number; y: number } | null {
    const s = this.states.get(id);
    if (!s || !s.drawn || s.taken) return null;
    this.off.x = s.x;
    this.off.y = s.y;
    return this.off;
  }

  /**
   * The drawn drop the game reported at grid point (gx, gy) (lightCollected carries the drop's own
   * point), else the nearest within `maxCells`; null when none. The object is reused.
   */
  atGrid(gx: number, gy: number, maxCells: number): { id: number; x: number; y: number } | null {
    let best: DropState | null = null;
    let bd = maxCells;
    for (const s of this.states.values()) {
      if (!s.drawn) continue;
      const d = Math.hypot(s.gx - gx, s.gy - gy);
      if (d <= bd) {
        bd = d;
        best = s;
      }
    }
    if (!best) return null;
    this.near.id = best.id;
    this.near.x = best.x;
    this.near.y = best.y;
    return this.near;
  }
  private readonly near = { id: 0, x: 0, y: 0 };

  /** Hue of drop `id` (its species), or the default. */
  hueOf(id: number): number {
    return this.states.get(id)?.hue ?? DROP_FX.defaultHue;
  }

  private pop(x: number, y: number, r: number, hue: number, now: number, sipped: boolean): void {
    const p = this.pops[this.popHead];
    this.popHead = (this.popHead + 1) % this.pops.length;
    p.on = true;
    p.x = x;
    p.y = y;
    p.r = r;
    p.hue = hue;
    p.t0 = now;
    p.sipped = sipped;
  }

  private sprite(hue: number): HTMLCanvasElement {
    const k = Math.round(hue / 5) * 5;
    let c = this.sprites.get(k);
    if (!c) {
      c = paintBead(k);
      this.sprites.set(k, c);
    }
    return c;
  }

  private glow(atlas: SpriteAtlas, hue: number): number {
    const k = Math.round(hue / 5) * 5;
    let i = this.glowIdx.get(k);
    if (i === undefined) {
      const [r, g, b] = hsl(k, 0.8, 0.62);
      i = atlas.color('#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1));
      this.glowIdx.set(k, i);
    }
    return i;
  }

  /**
   * Draw every drop and pop. `px`/`py` map grid → overlay px; `creature` places owned drops on their
   * creature. `vis` is the matter's visibility (an unlit culture shows no light).
   */
  draw(
    ctx: CanvasRenderingContext2D,
    atlas: SpriteAtlas,
    now: number,
    dt: number,
    rm: boolean,
    vis: number,
    px: (x: number) => number,
    py: (y: number) => number,
    creature: CreatureResolver,
    zoom = 1,
  ): void {
    this.tapCount = 0;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 8);
    for (const s of this.states.values()) {
      s.drawn = false;
      if (s.taken) continue;
      s.shown += (s.fill - s.shown) * (rm ? 1 : k);
      const r = beadRadius(s.shown, zoom);
      let x: number;
      let y: number;
      const sc = this.scratch;
      if (s.owner !== null && creature(s.owner, sc)) {
        if (sc.hue !== undefined) s.hue = sc.hue;
        dropAnchor(sc.r, r, this.off);
        x = sc.x + this.off.x;
        y = sc.y + this.off.y;
      } else {
        x = px(s.gx);
        y = py(s.gy);
      }
      s.x = x;
      s.y = y;
      s.r = r;
      s.drawn = true;
      if (this.tapCount < this.tap.length) {
        const t = this.tap[this.tapCount++];
        t.id = s.id;
        t.x = x;
        t.y = y;
        t.amount = s.amount;
        t.owner = s.owner;
      }
      if (!s.ripeSeen && s.fill >= DROP_FX.ripe) {
        s.ripeSeen = true;
        this.onRipe?.(x, y);
      }
      if (vis <= 0.02) continue;
      this.drawBead(ctx, atlas, s.hue, x, y, r, s.shown, s.owner === null, now, rm, vis, 1);
    }
    // Collected: the bead draws in (a meniscus ring opens once), or is sipped into the glass.
    const ms = DROP_FX.popMs / 1000;
    for (const p of this.pops) {
      if (!p.on) continue;
      const t = (now - p.t0) / ms;
      if (t >= 1) {
        p.on = false;
        continue;
      }
      if (vis <= 0.02) continue;
      const sc = rm ? 1 : popScale(t);
      const a = rm ? 1 - t : 1;
      if (sc > 0.02) this.drawBead(ctx, atlas, p.hue, p.x, p.y, p.r * sc, 1, false, now, true, vis * a, sc);
      if (!p.sipped && !rm) {
        ctx.globalAlpha = 0.7 * (1 - t) * vis;
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#e8f6ff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + DROP_FX.ringGap + 8 * t, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawBead(
    ctx: CanvasRenderingContext2D,
    atlas: SpriteAtlas,
    hue: number,
    x: number,
    y: number,
    r: number,
    fill: number,
    loose: boolean,
    now: number,
    rm: boolean,
    alpha: number,
    ring: number,
  ): void {
    // Bioluminescent glow under the glass of the drop (additive, a pre-rendered disc).
    const gl = dropGlow(fill, now, rm) * (loose ? 0.7 : 1);
    ctx.globalCompositeOperation = 'lighter';
    atlas.draw(ctx, SPR.disc, this.glow(atlas, hue), x, y, r * 6.5, 0.55 * gl * alpha);
    ctx.globalCompositeOperation = 'source-over';
    // The bead itself (cached 8-layer sprite).
    const img = this.sprite(hue);
    const s = (SPRITE / SPRITE_R) * r;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x - s / 2, y - s / 2, s, s);
    // The meter: a 1 px track and the fill clockwise from the top, like a gauge (a loose drop is full of
    // what it will ever hold: no meter, only its bead).
    if (!loose && ring >= 1) {
      const rr = r + DROP_FX.ringGap;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(220,235,245,1)';
      ctx.globalAlpha = 0.16 * alpha;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.stroke();
      const f = fill <= 0 ? 0 : fill >= 1 ? 1 : fill;
      if (f > 0.01) {
        ctx.globalAlpha = (f >= 1 ? 0.95 : 0.75) * alpha;
        ctx.strokeStyle = f >= DROP_FX.ripe ? '#eaf8ff' : '#a9d8ec';
        ctx.lineWidth = f >= 1 ? 1.5 : 1;
        ctx.beginPath();
        ctx.arc(x, y, rr, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Forget everything (a new dish, a new session). */
  clear(): void {
    for (const s of this.states.values()) this.spare.push(s);
    this.states.clear();
    for (const p of this.pops) p.on = false;
    this.tapCount = 0;
  }
}
