/**
 * The collecting pipettes of the ↓ Recoger route (ADR-030, docs/CLARIDAD2.md §2.2.3): lab micropipettes
 * with a glass tip that rest on the rim of the dish like tools in a rack and go out for the ripe drops.
 * The game decides every trip (deterministic, the bot sees it: GameView.pipettes); this layer only
 * animates the path dock → drop → dock as instrument motion (docs/ARTE-REALISTA.md §6.4): an ease in and
 * out with no overshoot, the instrument lifted off the bench on the way (its shadow moves away), the
 * glass tip lit cyan while it carries light home. They are instruments, never living things (pillar 1).
 *
 * The body is drawn once with the vector kit (8 layers, §3.2) into a cached layer and blitted rotated;
 * the window's specular stays on the side that faces it by flipping the (axis-symmetric) body. Frames
 * allocate nothing.
 */
import type { PipetteView } from '../../core/types';
import { MATERIAL, MATERIAL_AT } from '../art/tokens';
import { cylinderRamp, LayerCache, rgba, type Ctx2D } from '../art/vector';
import { SPR, type SpriteAtlas } from './sprites';

export const PIPETTE_FX = {
  /** Length on screen: this share of the dish's radius, within [min, max] CSS px. */
  lengthK: 0.3,
  minPx: 40,
  maxPx: 64,
  /** The resting tip sits this far inside the glass (CSS px). */
  restInset: 5,
  /** How far up a pipette is lifted half-way (its shadow's offset, CSS px) and how much nearer it looks. */
  liftPx: 7,
  liftScale: 0.06,
  /** At most this many are drawn (the route ends at 8). */
  max: 8,
  /** The loaded glow (the Luz accent, cyan) at the tip. */
  loaded: '#5bc0eb',
} as const;

/** 0..1 of the way from the dock to the drop for a trip at u (0..1): out, then back, eased in and out. */
export function tripReach(u: number): number {
  const t = u <= 0 ? 0 : u >= 1 ? 0 : u < 0.5 ? u * 2 : (1 - u) * 2;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Angle of a dock (0..1 clockwise from the top), radians from +x with y down. */
export function dockAngle(dock: number): number {
  return -Math.PI / 2 + dock * Math.PI * 2;
}

/** Signed smallest angle a → b. */
function angDelta(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

/**
 * Where a pipette's tip is and where it points (tip forward), for a trip at `u` toward a drop at (tx, ty)
 * from its dock on a dish centred at (cx, cy) of radius R (overlay px). Writes `out`.
 */
export function pipettePose(
  dock: number,
  u: number,
  tx: number | null,
  ty: number | null,
  cx: number,
  cy: number,
  R: number,
  out: { x: number; y: number; angle: number; lift: number },
): void {
  const a = dockAngle(dock);
  const rx = cx + Math.cos(a) * (R - PIPETTE_FX.restInset);
  const ry = cy + Math.sin(a) * (R - PIPETTE_FX.restInset);
  const rest = a + Math.PI; // pointing at the centre
  const e = tx === null || ty === null ? 0 : tripReach(u);
  out.x = rx + ((tx ?? rx) - rx) * e;
  out.y = ry + ((ty ?? ry) - ry) * e;
  const path = tx === null || ty === null || (tx === rx && ty === ry) ? rest : Math.atan2(ty! - ry, tx! - rx);
  const turn = Math.min(1, e * 3);
  out.angle = rest + angDelta(rest, path) * turn;
  out.lift = Math.sin(Math.PI * Math.min(1, e));
}

interface PipState {
  id: number;
  live: boolean;
  dock: number;
  target: number | null;
  /** Reported trip, when, and its rate (per ms) measured between reports. */
  trip: number;
  at: number;
  rate: number;
  /** Last known position of its target drop (overlay px): it keeps going there after the drop is gone. */
  tx: number | null;
  ty: number | null;
  /** Carrying light home (sipped its drop on this trip). */
  loaded: boolean;
  hue: number;
}

export type DropPos = (id: number) => { x: number; y: number } | null;

/** Paint the micropipette lying along +x, glass tip at x = pad, in a box H px high (CSS px). */
function paintPipette(g: Ctx2D, H: number, L: number, pad: number): void {
  const cy = H / 2;
  const x0 = pad;
  const tipEnd = x0 + 0.34 * L;
  const shaft0 = x0 + 0.4 * L;
  const shaft1 = x0 + 0.86 * L;
  const knob1 = x0 + 0.97 * L;
  const hs = 0.085 * L; // half the shaft's height
  const ht = 0.055 * L; // half the tip's base
  // Glass tip (layers 1, 2, 5, 8 for a clear material: faint body, a window line, a fine edge).
  g.beginPath();
  g.moveTo(x0, cy - 0.4);
  g.lineTo(tipEnd, cy - ht);
  g.lineTo(tipEnd, cy + ht);
  g.lineTo(x0, cy + 0.4);
  g.closePath();
  g.fillStyle = 'rgba(205,232,242,0.26)';
  g.fill();
  g.lineWidth = 0.75;
  g.strokeStyle = 'rgba(10,20,28,0.55)';
  g.stroke();
  g.lineWidth = 0.6;
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.beginPath();
  g.moveTo(x0 + 0.06 * L, cy - ht * 0.25);
  g.lineTo(tipEnd - 1, cy - ht * 0.8);
  g.stroke();
  // Tip collar (polypropylene, translucent).
  g.fillStyle = 'rgba(226,230,234,0.85)';
  g.fillRect(tipEnd, cy - hs * 0.78, shaft0 - tipEnd, hs * 1.56);
  g.lineWidth = 0.75;
  g.strokeStyle = 'rgba(10,14,18,0.7)';
  g.strokeRect(tipEnd, cy - hs * 0.78, shaft0 - tipEnd, hs * 1.56);
  // Shaft: brushed aluminium, a cylinder ramp across it (the window's band near the top edge).
  const shaft = (): void => {
    const r = hs * 0.6;
    g.beginPath();
    g.moveTo(shaft0, cy - hs);
    g.lineTo(shaft1 - r, cy - hs);
    g.quadraticCurveTo(shaft1, cy - hs, shaft1, cy - hs + r);
    g.lineTo(shaft1, cy + hs - r);
    g.quadraticCurveTo(shaft1, cy + hs, shaft1 - r, cy + hs);
    g.lineTo(shaft0, cy + hs);
    g.closePath();
  };
  shaft();
  g.fillStyle = cylinderRamp(g, 0, cy - hs, 0, cy + hs, [MATERIAL.alu[3], '#f4f5f6', MATERIAL.alu[2], MATERIAL.alu[1], '#7d8287'], [0, 0.26, 0.5, 0.8, 1]);
  g.fill();
  g.save();
  shaft();
  g.clip();
  // 3 · form shadow (multiply), the end away from the window a touch darker.
  g.globalCompositeOperation = 'multiply';
  const fs = g.createLinearGradient(shaft0, 0, shaft1, 0);
  fs.addColorStop(0, '#ffffff');
  fs.addColorStop(1, '#c9ccd0');
  g.fillStyle = fs;
  g.fillRect(shaft0, cy - hs, shaft1 - shaft0, 2 * hs);
  // 4 · the dish's cyan bounce on the lower edge (screen).
  g.globalCompositeOperation = 'screen';
  const bounce = g.createLinearGradient(0, cy + hs, 0, cy + hs * 0.2);
  bounce.addColorStop(0, 'rgba(91,192,235,0.22)');
  bounce.addColorStop(1, 'rgba(91,192,235,0)');
  g.fillStyle = bounce;
  g.fillRect(shaft0, cy, shaft1 - shaft0, hs);
  g.globalCompositeOperation = 'source-over';
  // 7 · brushing: fine strokes along the shaft.
  for (let i = 0; i < 6; i++) {
    const yy = cy - hs + ((i + 0.5) / 6) * 2 * hs;
    g.fillStyle = i % 2 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    g.fillRect(shaft0, yy, shaft1 - shaft0, 0.22);
  }
  g.restore();
  // Grip ring (rubber, matte: no specular).
  const gr0 = x0 + 0.56 * L;
  const gr1 = x0 + 0.63 * L;
  g.fillStyle = cylinderRamp(g, 0, cy - hs * 1.08, 0, cy + hs * 1.08, [MATERIAL.rubber[0], '#4a4d50', MATERIAL.rubber[1]], [0, 0.35, 1]);
  g.fillRect(gr0, cy - hs * 1.08, gr1 - gr0, hs * 2.16);
  // Plunger knob (chrome, the full 5-stop cylinder).
  const kh = hs * 1.15;
  g.fillStyle = cylinderRamp(g, 0, cy - kh, 0, cy + kh, MATERIAL.chrome, MATERIAL_AT.chrome);
  g.beginPath();
  g.moveTo(shaft1, cy - kh * 0.8);
  g.lineTo(knob1 - kh * 0.5, cy - kh);
  g.quadraticCurveTo(knob1, cy - kh, knob1, cy);
  g.quadraticCurveTo(knob1, cy + kh, knob1 - kh * 0.5, cy + kh);
  g.lineTo(shaft1, cy + kh * 0.8);
  g.closePath();
  g.fill();
  // 6 · rim light: the warm lamp on the far edge of the knob.
  g.lineWidth = 0.55;
  g.strokeStyle = 'rgba(255,177,110,0.4)';
  g.beginPath();
  g.moveTo(knob1 - kh * 0.4, cy + kh * 0.95);
  g.quadraticCurveTo(knob1 - 0.3, cy + kh * 0.6, knob1 - 0.3, cy);
  g.stroke();
  // 8 · contour: only where the instrument ends (shaft and knob), 1.25 px (the contour token).
  g.lineWidth = 1.25;
  g.strokeStyle = 'rgba(10,14,18,0.85)';
  shaft();
  g.stroke();
  g.beginPath();
  g.moveTo(shaft1, cy - kh * 0.8);
  g.lineTo(knob1 - kh * 0.5, cy - kh);
  g.quadraticCurveTo(knob1, cy - kh, knob1, cy);
  g.quadraticCurveTo(knob1, cy + kh, knob1 - kh * 0.5, cy + kh);
  g.lineTo(shaft1, cy + kh * 0.8);
  g.stroke();
}

export class PipetteLayer {
  private readonly states = new Map<number, PipState>();
  private readonly cache = new LayerCache(4);
  private readonly pose = { x: 0, y: 0, angle: 0, lift: 0 };
  private loadedIdx = -1;
  private shadowIdx = -1;

  get count(): number {
    return this.states.size;
  }

  /** The latest view's pipettes. `dropPos` gives a drop's drawn position (it is remembered for the trip). */
  setView(pipettes: readonly PipetteView[] | null | undefined, now: number, dropPos: DropPos, hueOf: (id: number) => number): void {
    for (const s of this.states.values()) s.live = false;
    if (pipettes) {
      for (let i = 0; i < pipettes.length && i < PIPETTE_FX.max; i++) {
        const p = pipettes[i];
        let s = this.states.get(p.id);
        if (!s) {
          s = { id: p.id, live: true, dock: p.dock, target: null, trip: 0, at: now, rate: 0, tx: null, ty: null, loaded: false, hue: 0 };
          this.states.set(p.id, s);
        }
        s.live = true;
        s.dock = p.dock;
        const newTrip = p.target !== s.target || p.trip < s.trip - 1e-6;
        if (newTrip) {
          s.target = p.target;
          s.loaded = false;
          s.tx = s.ty = null;
          // The rate of the last trip stands for this one until two reports measure it.
        } else if (now > s.at && p.trip > s.trip) s.rate = (p.trip - s.trip) / (now - s.at);
        s.trip = p.trip;
        s.at = now;
        if (s.target !== null) {
          const q = dropPos(s.target);
          if (q) {
            s.tx = q.x;
            s.ty = q.y;
            s.hue = hueOf(s.target);
          }
          if (s.trip >= 0.5) s.loaded = true;
        }
      }
    }
    for (const [id, s] of this.states) if (!s.live) this.states.delete(id);
  }

  /** A pipette is at drop `id` now (it is being sipped, not tapped). */
  sipping(id: number): boolean {
    for (const s of this.states.values()) if (s.target === id && s.trip > 0.3 && s.trip < 0.8) return true;
    return false;
  }

  /** Draw every pipette (overlay px; the dish centred at cx, cy with radius R). */
  draw(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, now: number, rm: boolean, cx: number, cy: number, R: number, dpr: number, vis: number): void {
    if (!this.states.size || vis <= 0.02) return;
    if (this.loadedIdx < 0) {
      this.loadedIdx = atlas.color(PIPETTE_FX.loaded);
      this.shadowIdx = atlas.color('#000000');
    }
    const L = Math.round(Math.max(PIPETTE_FX.minPx, Math.min(PIPETTE_FX.maxPx, R * PIPETTE_FX.lengthK)));
    const pad = 3;
    const W = L + 2 * pad;
    const H = Math.ceil(0.3 * L);
    const layer = this.cache.get(`pipette|${L}`, W, H, dpr, (g) => paintPipette(g, H, L, pad));
    const o = this.pose;
    for (const s of this.states.values()) {
      // Between two views the trip goes on at the rate it was going (never past the next quarter).
      let u = s.trip;
      if (s.target !== null && s.rate > 0 && !rm) u = Math.min(1, s.trip + Math.min(0.25, s.rate * (now - s.at)));
      pipettePose(s.dock, u, s.target === null ? null : s.tx, s.target === null ? null : s.ty, cx, cy, R, o);
      const lift = rm ? 0 : o.lift;
      const scale = 1 + PIPETTE_FX.liftScale * lift;
      const body = o.angle + Math.PI; // the body extends behind the tip
      const ca = Math.cos(body);
      const sa = Math.sin(body);
      // Shadow on the bench / agar: away from the window, further the higher it is lifted.
      const sx = 1.5 + PIPETTE_FX.liftPx * lift;
      const sy = 2 + PIPETTE_FX.liftPx * 1.2 * lift;
      ctx.save();
      ctx.translate(o.x + ca * L * 0.55 + sx, o.y + sa * L * 0.55 + sy);
      ctx.rotate(body);
      ctx.scale(1, 0.22);
      atlas.draw(ctx, SPR.disc, this.shadowIdx, 0, 0, L * 1.1, (0.38 - 0.16 * lift) * vis);
      ctx.restore();
      // The instrument, lit from the window (flip so its specular faces the top left).
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(body);
      // Local "up" (−y) after the rotation points to (sin, −cos); the window is up-left (−1, −1).
      const facing = ca - sa;
      ctx.scale(scale, facing >= 0 ? scale : -scale);
      ctx.globalAlpha = vis;
      if (layer) ctx.drawImage(layer, -pad, -H / 2, W, H);
      else paintPipette(ctx, H, L, pad);
      ctx.restore();
      // Loaded: the glass tip carries light home (cyan), fading as it docks.
      if (s.loaded && u < 1) {
        const k = u < 0.5 ? 1 : Math.min(1, (1 - u) * 2.5);
        ctx.globalCompositeOperation = 'lighter';
        atlas.draw(ctx, SPR.disc, this.loadedIdx, o.x - Math.cos(o.angle) * L * 0.12, o.y - Math.sin(o.angle) * L * 0.12, L * 0.42, 0.55 * k * vis);
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = rgba(160, 228, 250, 0.9 * k * vis);
        ctx.beginPath();
        ctx.moveTo(o.x - Math.cos(o.angle) * 2, o.y - Math.sin(o.angle) * 2);
        ctx.lineTo(o.x - Math.cos(o.angle) * L * 0.26, o.y - Math.sin(o.angle) * L * 0.26);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.states.clear();
  }
}
