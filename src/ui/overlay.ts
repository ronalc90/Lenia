/**
 * The 2D overlay canvas drawn on top of the WebGL dish: halos, ripples,
 * floating numbers, behaviour markers, the golden spark and bursts. Everything is positioned through the shared Camera so it
 * lines up with the GL render exactly.
 *
 * Draws in CSS pixels (the context is pre-scaled by devicePixelRatio).
 */
import type { Camera } from '../core/camera';
import { BEHAVIOR_COLOR, UI as C } from '../core/palette';
import type { Behavior, CreatureState, CreatureView, GameView, Lang } from '../core/types';
import { behaviorName, stateName } from './i18n';
import { StatusLayer } from './moments/status';
import { CREATURE_ALIVE_MS, DISSOLVE_MS, SEED_BLOOM_MS } from '../game/cycleBalance';
import { defaultItem, type DishTheme, type HaloStyle, type SparkSkin, type TrailStyle } from '../store/catalog';
import {
  drawHalo,
  drawSpark,
  drawSparkTrail,
  drawTrailParticle,
  drawTrailRipple,
  stepTrailParticle,
  trailBurst,
  type TrailParticle,
} from '../store/draw';

/** Equipped cosmetics the overlay draws (src/store/apply.ts bindCosmetics → setCosmetics). */
export interface OverlayCosmetics {
  halo: HaloStyle;
  trail: TrailStyle;
  spark: SparkSkin;
  dish: DishTheme;
}

/** Same data as the slot's default item: keep the built-in drawing (today's look, byte for byte). */
function nonDefault<T>(data: T, slot: 'halo' | 'trail' | 'spark'): T | null {
  return JSON.stringify(data) === JSON.stringify(defaultItem(slot).data) ? null : data;
}

/**
 * Extra drawing layer (seam for Momentos / Secrets / Encargos): called every frame with the overlay's
 * 2D context in CSS pixels. 'creatures' layers run right after the creature halos, clipped to the dish;
 * 'top' layers run last, unclipped (above labels and the golden indicator).
 */
export interface OverlayLayerFrame {
  ctx: CanvasRenderingContext2D;
  time: number;
  dt: number;
  /** Visible dish rectangle (CSS px, overlay canvas coordinates). */
  rect: { x: number; y: number; w: number; h: number };
  /** CSS px per grid cell. */
  scale: number;
  reduceMotion: boolean;
  paused: boolean;
  /** Grid cell → overlay canvas coordinates (CSS px). */
  gridToScreen(x: number, y: number): { x: number; y: number };
}
export type OverlayLayer = (f: OverlayLayerFrame) => void;
export type OverlayLayerSlot = 'creatures' | 'top';

const SANS = 'Inter, "Inter Fallback", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

interface Smoothed {
  x: number;
  y: number;
  tx: number;
  ty: number;
  r: number;
  hx: number; // heading (unit vector) from recent motion
  hy: number;
  state: CreatureView['state'];
  behavior: Behavior | null;
  seenAt: number;
  phase: number;
  /** Velocity in cells per simulation step (0 if the view has none). */
  vx: number;
  vy: number;
  /** performance.now() (ms) when the detector last reported a new position/velocity. */
  at: number;
  /** Cells it jumped at that report (moving without a velocity → its ring cannot be kept in sync). */
  jump: number;
  /** Overlay time (s) of the last "became stable / new species" pulse, -1 = none. */
  pulseAt: number;
  /** Species accent hue (degrees) and name, once registered. */
  hue?: number;
  name: string | null;
}

/** Duration of the ring pulse when a creature becomes stable or is a new species (s). */
const RING_PULSE_S = 1.6;

interface Ripple {
  x: number;
  y: number;
  t0: number;
  dur: number;
  color: string;
  maxR: number;
  rings: number;
  width: number;
  /** Successful-seed ripple drawn with an equipped trail skin (src/store/draw.ts). */
  skin?: TrailStyle;
}

/** A seed-trail particle of an equipped skin, anchored to a grid point. */
interface SkinParticle {
  ax: number;
  ay: number;
  t0: number;
  p: TrailParticle;
  skin: TrailStyle;
}

interface Float {
  x: number;
  y: number;
  t0: number;
  dur: number;
  text: string;
  color: string;
  size: number;
  rise: number;
  drop: boolean; // draw an essence droplet before the text
  jitter: number;
  /** Creature id + running amount, so rapid incomes merge into one number. */
  cid?: number;
  amount?: number;
}

interface Particle {
  ax: number; // grid anchor
  ay: number;
  ox: number; // px offset from anchor
  oy: number;
  vx: number;
  vy: number;
  t0: number;
  life: number;
  size: number;
  color: string;
  drag: number;
  grav: number;
  star: boolean;
}

interface Label {
  x: number;
  y: number;
  t0: number;
  dur: number;
  text: string;
  sub: string;
  color: string;
  glyph: Behavior | null;
}

/** A seed that landed away from the tap (spacing rule): arrow from the finger to the seed. */
interface SeedArrow {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  t0: number;
}

/** How long the "moved here" arrow stays (s). */
const SEED_ARROW_S = 1.1;
/** At most one "no room here" label in this many seconds (fast taps get one, not ten). */
const BLOCKED_LABEL_GAP_S = 1.2;

interface Spot {
  x: number;
  y: number;
  t0: number;
  dur: number;
}

const MAX_FLOATS = 40;
/** Income numbers visible at once; more income merges into the nearest number. */
const MAX_INCOME_FLOATS = 12;
/** Income numbers closer than this (CSS px) merge into one. */
const MERGE_RADIUS_PX = 34;
const MAX_PARTICLES = 420;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Stable creatures up to which each one gets its name drawn (a crowded dish stays readable). */
const MAX_NAMED_CREATURES = 8;

/** Species accent hue → '#RRGGBB' (hsl(h 70% L%)), cached: the halo/name colour of a species. */
const hueCache = new Map<string, string>();
export function hueHex(hue: number, light = 62): string {
  const key = `${Math.round(hue)}|${light}`;
  let hex = hueCache.get(key);
  if (hex) return hex;
  const s = 0.7;
  const l = light / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  hex = '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  hueCache.set(key, hex);
  return hex;
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}

export class Overlay {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private now = 0;

  private creatures = new Map<number, Smoothed>();
  private golden: { x: number; y: number; tx: number; ty: number; life: number; born: number } | null = null;
  private goldenTrail: { x: number; y: number; t: number }[] = [];
  private lastSparkEmit = 0;
  private ripples: Ripple[] = [];
  private floats: Float[] = [];
  private particles: Particle[] = [];
  private skinParticles: SkinParticle[] = [];
  private layers: { fn: OverlayLayer; slot: OverlayLayerSlot }[] = [];
  /** Equipped skins; null = the slot's default (drawn by the built-in code below). */
  private haloSkin: HaloStyle | null = null;
  private trailSkin: TrailStyle | null = null;
  private sparkSkin: SparkSkin | null = null;
  private motesColor: string | null = null;
  private labels: Label[] = [];
  /**
   * Boxes already drawn this frame (x0, y0, x1, y1): floating numbers and event labels first, then the
   * creature names, which hide rather than overlap (docs/ARTE.md §10: one label at a time).
   */
  private occ = new Float32Array(4 * 96);
  private occN = 0;
  /** Name / status lines asked for by drawCreatures this frame (drawn later, unclipped, without overlaps). */
  private nameQ: { x: number; y: number; s: Smoothed | null; text: string; color: string }[] = [];
  private nameN = 0;
  private spots: Spot[] = [];
  private arrows: SeedArrow[] = [];
  private lastBlockedLabel = -Infinity;
  private flashes: { x: number; y: number; t0: number; color: string; r: number }[] = [];
  private charge: { x: number; y: number; t0: number } | null = null;
  /** Faint ambient motes drifting in the dish (normalized dish coords). */
  private motes = Array.from({ length: 34 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.5 + Math.random() * 1.1,
    vy: 0.006 + Math.random() * 0.014,
    ph: Math.random() * Math.PI * 2,
    violet: Math.random() < 0.3,
  }));
  /** Creature currently selected (info card) for a highlight ring. */
  selectedId: number | null = null;
  reduceMotion = false;
  markers = false;
  /** Simulation steps per second (0 = paused / unknown → no extrapolation). */
  simRate = 0;
  paused = false;
  /**
   * Creature status pills (Momentos, docs/MOMENTOS.md §5.3): "◔ Naciendo 62 %", "✓ Estable +1,2/s ➜"…
   * `statusOnAll` = pills on the most informative creatures (Era 1 / setting); `statusHidden` = they
   * step aside while a Momento card explains. The tapped creature has its info card instead of a pill.
   */
  statusOnAll = false;
  statusHidden = false;
  private statusLayer = new StatusLayer();
  private cviews: CreatureView[] = [];
  /** cviews without the creature whose info card is open (rebuilt only when either changes). */
  private cviewsPill: CreatureView[] = [];
  private cviewsPillKey: { list: CreatureView[] | null; sel: number | null } = { list: null, sel: null };
  private lang: Lang = 'es';
  private pillNowMs = 0;
  private readonly pillScratch = { x: 0, y: 0, r: 0 };
  private readonly pillView = { w: 1, h: 1 };
  /** The status layer's options, reused every frame (no per-frame allocation). */
  private readonly pillOpts: { lang: Lang; time: number; dt: number; reduceMotion: boolean; onAll: boolean; selectedId: number | null; view: { w: number; h: number } } = {
    lang: 'es',
    time: 0,
    dt: 0,
    reduceMotion: false,
    onAll: true,
    selectedId: null,
    view: this.pillView,
  };
  /** Screen position of a creature for its pill (same point as its name label), or null. */
  private readonly pillPos = (c: CreatureView): { x: number; y: number; r: number } | null => {
    const s = this.creatures.get(c.id);
    if (!s) return null;
    const e = this.exactPos(s, this.pillNowMs);
    const p = this.camera.gridToScreen(e ? e.x : s.x, e ? e.y : s.y);
    const o = this.pillScratch;
    o.x = p.x;
    o.y = p.y;
    o.r = this.haloRadius(s);
    return o;
  };

  constructor(private camera: Camera) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'bl-overlay';
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = Math.min(dpr, 2);
    this.canvas.width = Math.max(1, Math.round(w * this.dpr));
    this.canvas.height = Math.max(1, Math.round(h * this.dpr));
  }

  /**
   * Equipped cosmetics. Only the stable halo, the successful-seed ripple/burst, the golden spark
   * and the dish motes are skinnable: the "forming" ring, the red "denied" ripple, the spark's
   * size, hit area and off-screen indicator never change (fair play, docs/MONETIZACION.md).
   */
  /** Register an extra drawing layer; returns its remover. A layer that throws is dropped. */
  addLayer(fn: OverlayLayer, slot: OverlayLayerSlot = 'creatures'): () => void {
    const entry = { fn, slot };
    this.layers.push(entry);
    return () => {
      this.layers = this.layers.filter((l) => l !== entry);
    };
  }

  private runLayers(slot: OverlayLayerSlot, time: number, dt: number, rect: { x: number; y: number; w: number; h: number }, scale: number): void {
    if (!this.layers.length) return;
    const frame: OverlayLayerFrame = {
      ctx: this.ctx,
      time,
      dt,
      rect,
      scale,
      reduceMotion: this.reduceMotion,
      paused: this.paused,
      gridToScreen: (x, y) => this.camera.gridToScreen(x, y),
    };
    for (const l of [...this.layers]) {
      if (l.slot !== slot) continue;
      this.ctx.save();
      try {
        l.fn(frame);
      } catch (e) {
        console.error('[bioluma] overlay layer failed; removed', e);
        this.layers = this.layers.filter((x) => x !== l);
      }
      this.ctx.restore();
    }
  }

  setCosmetics(c: OverlayCosmetics): void {
    this.haloSkin = nonDefault(c.halo, 'halo');
    this.trailSkin = nonDefault(c.trail, 'trail');
    this.sparkSkin = nonDefault(c.spark, 'spark');
    const motes = c.dish.motes;
    this.motesColor = motes.toUpperCase() === defaultItem('dish').data.motes.toUpperCase() ? null : motes;
  }

  setView(view: GameView): void {
    this.reduceMotion = view.settings.reduceMotion;
    this.cviews = view.creatures;
    this.lang = view.settings.lang;
    this.markers = !!(view.tools as { markers?: boolean }).markers;
    const alive = new Set<number>();
    for (const c of view.creatures) {
      alive.add(c.id);
      let s = this.creatures.get(c.id);
      if (!s) {
        s = {
          x: c.x,
          y: c.y,
          tx: c.x,
          ty: c.y,
          r: c.r,
          hx: 1,
          hy: 0,
          state: c.state,
          behavior: c.behavior,
          seenAt: this.now,
          phase: (c.id * 0.6180339) % 1,
          vx: c.vx ?? 0,
          vy: c.vy ?? 0,
          at: performance.now(),
          jump: 0,
          pulseAt: -1,
          hue: c.hue,
          name: c.speciesName,
        };
        this.creatures.set(c.id, s);
      } else {
        const dx = this.camera.deltaX(c.x - s.tx);
        const dy = this.camera.deltaY(c.y - s.ty);
        const d = Math.hypot(dx, dy);
        if (d > 0.05) {
          // Low-pass the heading so arrows don't flicker.
          s.hx = s.hx * 0.6 + (dx / d) * 0.4;
          s.hy = s.hy * 0.6 + (dy / d) * 0.4;
          const n = Math.hypot(s.hx, s.hy) || 1;
          s.hx /= n;
          s.hy /= n;
        }
        // Teleport if the jump is large (e.g. after load).
        if (d > 25) {
          s.x = c.x;
          s.y = c.y;
        }
        // Only a new report restarts the extrapolation clock (the view may repeat the same report).
        if (c.x !== s.tx || c.y !== s.ty || (c.vx ?? 0) !== s.vx || (c.vy ?? 0) !== s.vy) {
          s.at = performance.now();
          s.jump = d;
        }
        // One short ring pulse when it becomes stable or its species is registered (new species).
        if ((c.state === 'stable' && s.state !== 'stable') || (c.speciesName && !s.name)) s.pulseAt = this.now;
        s.tx = c.x;
        s.ty = c.y;
        s.vx = c.vx ?? 0;
        s.vy = c.vy ?? 0;
        if (s.vx || s.vy) {
          const n = Math.hypot(s.vx, s.vy);
          s.hx = s.vx / n;
          s.hy = s.vy / n;
        }
        s.r = c.r;
        s.state = c.state;
        s.behavior = c.behavior;
        s.hue = c.hue;
        s.name = c.speciesName;
      }
    }
    for (const id of [...this.creatures.keys()]) if (!alive.has(id)) this.creatures.delete(id);

    if (view.golden) {
      if (!this.golden) {
        this.golden = { x: view.golden.x, y: view.golden.y, tx: view.golden.x, ty: view.golden.y, life: 1, born: this.now };
        this.goldenTrail = [];
      }
      this.golden.tx = view.golden.x;
      this.golden.ty = view.golden.y;
      this.golden.life = view.golden.life;
    } else {
      this.golden = null;
      this.goldenTrail = [];
    }
  }

  // ───────────────────────────── queries (hit testing) ─────────────────────────────

  screenOf(x: number, y: number): { x: number; y: number } {
    return this.camera.gridToScreen(x, y);
  }

  goldenScreen(): { x: number; y: number } | null {
    return this.golden ? this.camera.gridToScreen(this.golden.x, this.golden.y) : null;
  }

  creatureScreen(id: number): { x: number; y: number; r: number } | null {
    const s = this.creatures.get(id);
    if (!s) return null;
    const p = this.camera.gridToScreen(s.x, s.y);
    return { x: p.x, y: p.y, r: this.haloRadius(s) };
  }

  creaturePos(id: number): { x: number; y: number } | null {
    const s = this.creatures.get(id);
    return s ? { x: s.x, y: s.y } : null;
  }

  /** Status pill under a CSS-pixel point (≥ 44 px tall hit area), or null. */
  statusHit(px: number, py: number): { id: number; behavior: Behavior | null; state: CreatureState } | null {
    return this.pillsShown() ? this.statusLayer.hitTest(px, py) : null;
  }

  private pillsShown(): boolean {
    return this.statusOnAll && !this.statusHidden;
  }

  /** Stable creature under a CSS-pixel point, or null. */
  creatureAt(px: number, py: number): number | null {
    let best: number | null = null;
    let bestD = Infinity;
    for (const [id, s] of this.creatures) {
      if (s.state !== 'stable') continue;
      const p = this.camera.gridToScreen(s.x, s.y);
      const d = Math.hypot(p.x - px, p.y - py);
      const hit = Math.max(18, this.haloRadius(s) * 0.95);
      if (d <= hit && d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  // ───────────────────────────── effects API ─────────────────────────────

  ripple(x: number, y: number, kind: 'seed' | 'big' | 'auto' | 'denied' | 'erase' | 'print'): void {
    const s = this.camera.scale;
    const base = Math.max(22, 13 * s * 1.25);
    const spec: Record<typeof kind, Omit<Ripple, 'x' | 'y' | 't0'>> = {
      // The seed ring opens in SEED_BLOOM_MS (RITMO §4.4): quick, so a 15 s run feels alive at once.
      seed: { dur: SEED_BLOOM_MS / 1000, color: C.accent, maxR: base, rings: 2, width: 2 },
      big: { dur: SEED_BLOOM_MS / 1000, color: C.accent, maxR: base * 1.6, rings: 3, width: 2.4 },
      auto: { dur: 0.36, color: '#7FA8C0', maxR: base * 0.8, rings: 1, width: 1.2 },
      denied: { dur: 0.22, color: C.danger, maxR: base * 0.7, rings: 1, width: 2.2 },
      erase: { dur: 0.3, color: C.warn, maxR: base * 0.9, rings: 1, width: 1.6 },
      print: { dur: 0.5, color: C.good, maxR: base * 1.4, rings: 3, width: 2 },
    };
    const skin = (kind === 'seed' || kind === 'big') && this.trailSkin ? this.trailSkin : undefined;
    this.ripples.push({ x, y, t0: this.now, ...spec[kind], ...(skin ? { rings: skin.rings, skin } : {}) });
    if (this.ripples.length > 24) this.ripples.shift();
    if ((kind === 'seed' || kind === 'big') && !this.reduceMotion) {
      if (skin) {
        for (const p of trailBurst(skin, kind === 'big' ? 10 : 6)) {
          if (this.skinParticles.length >= MAX_PARTICLES / 2) this.skinParticles.shift();
          this.skinParticles.push({ ax: x, ay: y, t0: this.now, p, skin });
        }
      } else {
        this.burst(x, y, kind === 'big' ? 10 : 6, C.accent, { speed: 60, life: 0.45, size: 1.6, grav: 0 });
      }
    }
  }

  /**
   * A tap with no room (it would fuse with nearby matter): a red "no" ring where the finger was, and the
   * reason pinned to the spot (one label at a time). Nothing was charged.
   */
  seedBlocked(x: number, y: number, text: string, sub: string, near?: { x: number; y: number; r: number }): void {
    const base = Math.max(22, 13 * this.camera.scale * 1.25);
    if (near) {
      // The ring sits on the matter in the way (owner: "a veces dice que hay entidades al lado estando la
      // placa vacía"); a small tick marks the finger.
      this.ripples.push({ x: near.x, y: near.y, t0: this.now, dur: 0.7, color: C.danger, maxR: Math.max(base * 0.8, near.r * this.camera.scale * 1.15), rings: 2, width: 2.6 });
      this.ripples.push({ x, y, t0: this.now, dur: 0.4, color: C.danger, maxR: base * 0.45, rings: 1, width: 2 });
    } else this.ripples.push({ x, y, t0: this.now, dur: 0.55, color: C.danger, maxR: base * 0.95, rings: 2, width: 2.6 });
    if (this.ripples.length > 24) this.ripples.shift();
    if (this.now - this.lastBlockedLabel < BLOCKED_LABEL_GAP_S) return;
    this.lastBlockedLabel = this.now;
    this.labels.push({ x, y, t0: this.now, dur: 2.4, text, sub, color: C.danger, glyph: null });
  }

  /** The seed was moved to the nearest spot with room: a short arrow from the tap to where it landed. */
  seedMoved(fromX: number, fromY: number, toX: number, toY: number): void {
    if (this.arrows.length >= 6) this.arrows.shift();
    this.arrows.push({ fx: fromX, fy: fromY, tx: toX, ty: toY, t0: this.now });
  }

  /** Seed refused: red ripple + cost in red near the finger for 1 s. */
  denied(x: number, y: number, costText: string, why?: { text: string; sub: string }): void {
    this.ripple(x, y, 'denied');
    // With a reason (CLARIDAD J-161) the label says it all, pinned to the spot (one label at a time).
    if (why && this.now - this.lastBlockedLabel >= BLOCKED_LABEL_GAP_S) {
      this.lastBlockedLabel = this.now;
      this.labels.push({ x, y, t0: this.now, dur: 2.4, text: why.text, sub: why.sub, color: '#FF7A5C', glyph: null });
      return;
    }
    this.pushFloat({ x, y, t0: this.now, dur: 1, text: costText, color: '#FF7A5C', size: 14, rise: 10, drop: true, jitter: 0 });
  }

  income(id: number, x: number, y: number, amount: number, format: (n: number) => string, gold: boolean): void {
    const p = this.camera.gridToScreen(x, y);
    if (p.x < -20 || p.y < -20 || p.x > this.w + 20 || p.y > this.h + 20) return;
    // Merge with a fresh float from the same creature instead of stacking.
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      if (f.cid === id && this.now - f.t0 < 0.8) {
        f.amount = (f.amount ?? 0) + amount;
        f.text = '+' + format(f.amount);
        f.t0 = this.now - 0.02;
        f.x = x;
        f.y = y;
        return;
      }
    }
    // Crowded dish: never a wall of numbers. Join the nearest live income number when one is close
    // (or when MAX_INCOME_FLOATS are already showing); the merged number shows the running total.
    let nearest: Float | null = null;
    let best = Infinity;
    let live = 0;
    for (const f of this.floats) {
      if (f.cid === undefined || this.now - f.t0 > f.dur * 0.7) continue;
      live++;
      const q = this.camera.gridToScreen(f.x, f.y);
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < best) {
        best = d;
        nearest = f;
      }
    }
    if (nearest && (best < MERGE_RADIUS_PX || live >= MAX_INCOME_FLOATS)) {
      nearest.amount = (nearest.amount ?? 0) + amount;
      nearest.text = '+' + format(nearest.amount);
      nearest.t0 = Math.max(nearest.t0, this.now - 0.25);
      nearest.cid = id;
      return;
    }
    this.pushFloat({
      x,
      y,
      t0: this.now,
      dur: 1.15,
      text: '+' + format(amount),
      color: gold ? C.gold : '#A6E8FF',
      size: 12,
      rise: this.reduceMotion ? 6 : 30,
      drop: false,
      jitter: (Math.random() - 0.5) * 14,
      cid: id,
      amount,
    });
  }

  speciesBurst(x: number, y: number, title: string, name: string): void {
    this.flash(x, y, C.good, 1.5);
    if (!this.reduceMotion) {
      this.burst(x, y, 36, C.good, { speed: 150, life: 1.1, size: 2.2, grav: 20, star: true });
      this.burst(x, y, 14, '#FFFFFF', { speed: 90, life: 0.8, size: 1.4, grav: 0 });
      this.spots.push({ x, y, t0: this.now, dur: 1.1 });
    }
    this.labels.push({ x, y, t0: this.now, dur: 2.6, text: title, sub: name, color: C.good, glyph: null });
  }

  behaviorLabel(x: number, y: number, b: Behavior, title: string, name: string): void {
    const col = BEHAVIOR_COLOR[b] ?? C.accent;
    this.flash(x, y, col, 1.2);
    if (!this.reduceMotion) this.burst(x, y, 18, col, { speed: 110, life: 0.9, size: 1.8, grav: 0, star: true });
    this.labels.push({ x, y, t0: this.now, dur: 2.2, text: title, sub: name, color: col, glyph: b });
  }

  stableDing(x: number, y: number): void {
    // "¡Viva!": a ring that opens in CREATURE_ALIVE_MS as the creature turns stable (RITMO §4.4).
    this.ripples.push({ x, y, t0: this.now, dur: CREATURE_ALIVE_MS / 1000, color: C.accent, maxR: Math.max(26, 13 * this.camera.scale * 1.4), rings: 1, width: 2.2 });
    if (this.ripples.length > 24) this.ripples.shift();
    this.flash(x, y, C.accent, 1);
    if (!this.reduceMotion) this.burst(x, y, 10, C.accent, { speed: 70, life: 0.6, size: 1.4, grav: 0 });
  }

  explodedPulse(x: number, y: number): void {
    this.flash(x, y, C.warn, 1.8);
  }

  dividedPulse(x: number, y: number): void {
    this.ripples.push({ x, y, t0: this.now, dur: 0.6, color: BEHAVIOR_COLOR.divider, maxR: 40, rings: 2, width: 1.6 });
  }

  bornRing(x: number, y: number): void {
    this.ripples.push({ x, y, t0: this.now, dur: 0.5, color: '#6F8FA8', maxR: 26, rings: 1, width: 1 });
  }

  puff(x: number, y: number): void {
    if (this.reduceMotion) {
      this.ripples.push({ x, y, t0: this.now, dur: DISSOLVE_MS / 1000, color: '#7D8790', maxR: 24, rings: 1, width: 1 });
      return;
    }
    // Death and lysis fade out in DISSOLVE_MS (RITMO §4.4).
    this.burst(x, y, 12, '#8E99A4', { speed: 28, life: DISSOLVE_MS / 1000, size: 2.6, grav: -14, drag: 1.5 });
  }

  goldenCollected(x: number, y: number, reward: string): void {
    this.flash(x, y, C.gold, 2.2);
    if (!this.reduceMotion) {
      this.burst(x, y, 44, this.sparkSkin?.particles[0] ?? C.gold, { speed: 190, life: 1.2, size: 2.4, grav: 40, star: true });
      this.burst(x, y, 16, '#FFFFFF', { speed: 120, life: 0.7, size: 1.5, grav: 0 });
    }
    this.labels.push({ x, y, t0: this.now, dur: 2.4, text: reward, sub: '', color: C.gold, glyph: null });
    this.golden = null;
    this.goldenTrail = [];
  }

  goldenSpawned(x: number, y: number): void {
    if (!this.reduceMotion) this.burst(x, y, 16, this.sparkSkin?.particles[0] ?? C.gold, { speed: 80, life: 0.8, size: 1.6, grav: 0, star: true });
  }

  /** Long-press charge ring at a CSS-pixel point (cleared on release/fire). */
  chargeStart(px: number, py: number): void {
    this.charge = { x: px, y: py, t0: this.now };
  }

  chargeEnd(): void {
    this.charge = null;
  }

  // ───────────────────────────── internals ─────────────────────────────

  private pushFloat(f: Float): void {
    if (this.floats.length >= MAX_FLOATS) this.floats.shift();
    this.floats.push(f);
  }

  private flash(x: number, y: number, color: string, r: number): void {
    this.flashes.push({ x, y, t0: this.now, color, r });
    if (this.flashes.length > 16) this.flashes.shift();
  }

  private burst(
    x: number,
    y: number,
    n: number,
    color: string,
    o: { speed: number; life: number; size: number; grav: number; drag?: number; star?: boolean },
  ): void {
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = o.speed * (0.35 + Math.random() * 0.65);
      this.particles.push({
        ax: x,
        ay: y,
        ox: 0,
        oy: 0,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        t0: this.now,
        life: o.life * (0.6 + Math.random() * 0.4),
        size: o.size * (0.6 + Math.random() * 0.7),
        color,
        drag: o.drag ?? 2.4,
        grav: o.grav,
        star: !!o.star && Math.random() < 0.35,
      });
    }
  }

  private haloRadius(s: Smoothed): number {
    return Math.max(7, s.r * 1.9) * this.camera.scale + 3;
  }

  /** Clip rect for dish-attached drawing (the dish at zoom 1, the whole view when zoomed). */
  private dishRect(): { x: number; y: number; w: number; h: number } {
    const cam = this.camera;
    const round = cam.dish;
    if (round) {
      // Round dish: the bounding box of the glass (clipped to the view when zoomed in).
      const p = cam.gridToScreen(round.cx, round.cy);
      const r = round.radius * cam.scale;
      const x0 = Math.max(0, p.x - r);
      const y0 = Math.max(0, p.y - r);
      return { x: x0, y: y0, w: Math.min(this.w, p.x + r) - x0, h: Math.min(this.h, p.y + r) - y0 };
    }
    if (cam.zoom > 1.001) return { x: 0, y: 0, w: this.w, h: this.h };
    const s = cam.scale;
    const dw = cam.gridW * s;
    const dh = cam.gridH * s;
    return { x: (this.w - dw) / 2, y: (this.h - dh) / 2, w: dw, h: dh };
  }

  /** Call fn at every toroidal copy of a screen point whose disc touches the rect. */
  private copies(px: number, py: number, rad: number, rect: { x: number; y: number; w: number; h: number }, fn: (x: number, y: number) => void): void {
    // Round dish: nothing wraps, one copy.
    if (this.camera.dish) {
      fn(px, py);
      return;
    }
    const W = this.camera.gridW * this.camera.scale;
    const H = this.camera.gridH * this.camera.scale;
    for (const ox of [0, -W, W]) {
      const x = px + ox;
      if (x + rad < rect.x || x - rad > rect.x + rect.w) continue;
      for (const oy of [0, -H, H]) {
        const y = py + oy;
        if (y + rad < rect.y || y - rad > rect.y + rect.h) continue;
        fn(x, y);
      }
    }
  }

  // ───────────────────────────── frame ─────────────────────────────

  draw(time: number, dt: number): void {
    this.now = time;
    this.occN = 0;
    this.nameN = 0;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    const cam = this.camera;
    const scale = cam.scale;
    const rm = this.reduceMotion;

    // Creatures: extrapolate the latest (≈10 Hz) report with its velocity
    // (≤ 0.5 s ahead), then glide toward that prediction (~0.25 per 60 Hz frame)
    // so halos follow fast swimmers without lag or snapping.
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 10);
    const kGlide = 1 - Math.pow(0.75, Math.min(dt, 0.1) * 60);
    const nowMs = performance.now();
    const rate = this.paused ? 0 : this.simRate;
    for (const s of this.creatures.values()) {
      let px = s.tx;
      let py = s.ty;
      if (rate > 0 && (s.vx || s.vy)) {
        const ahead = Math.min(0.5, Math.max(0, (nowMs - s.at) / 1000)) * rate;
        px = this.camera.wrapX(s.tx + s.vx * ahead);
        py = this.camera.wrapY(s.ty + s.vy * ahead);
        s.x = this.camera.wrapX(s.x + this.camera.deltaX(px - s.x) * kGlide);
        s.y = this.camera.wrapY(s.y + this.camera.deltaY(py - s.y) * kGlide);
      } else {
        s.x = this.camera.wrapX(s.x + this.camera.deltaX(px - s.x) * k);
        s.y = this.camera.wrapY(s.y + this.camera.deltaY(py - s.y) * k);
      }
    }
    const g = this.golden;
    if (g) {
      g.x = this.camera.wrapX(g.x + this.camera.deltaX(g.tx - g.x) * k);
      g.y = this.camera.wrapY(g.y + this.camera.deltaY(g.ty - g.y) * k);
    }

    const rect = this.dishRect();
    ctx.save();
    ctx.beginPath();
    const round = cam.dish;
    if (round) {
      // Round dish: dish-attached drawing stays inside the glass (the GPU draws the glass itself).
      const c = cam.gridToScreen(round.cx, round.cy);
      ctx.arc(c.x, c.y, round.radius * scale, 0, Math.PI * 2);
    } else ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();

    if (!round) this.drawDishFrame(rect);
    if (!rm) this.drawMotes(time, dt, rect);
    this.drawSpots(time);
    this.drawCreatures(time, rect, scale, rm);
    this.runLayers('creatures', time, dt, rect, scale);
    this.drawFlashes(time);
    this.drawRipples(time);
    if (this.arrows.length) this.drawArrows(time);
    this.drawParticles(time, dt);
    if (this.skinParticles.length) this.drawSkinParticles(time, dt);
    if (g) this.drawGolden(time, g, rm);
    this.drawFloats(time);
    ctx.restore();
    // Status pills: unclipped (like the labels) so a creature at the dish edge keeps its pill.
    if (this.pillsShown()) this.drawStatusPills(time, dt, rm);
    // Labels are drawn unclipped and kept on screen, so a creature at the dish edge never cuts them.
    this.drawLabels(time);
    // Names last: inside the dish, shortened with "…", and hidden where a number or a label already is.
    this.drawNames(rect);

    if (g) this.drawGoldenIndicator(g);
    this.drawCharge(time);
    this.runLayers('top', time, dt, rect, scale);
  }

  private drawStatusPills(time: number, dt: number, rm: boolean): void {
    // The creature with its info card open has the card instead of a pill (both would sit above it).
    const sel = this.selectedId;
    const key = this.cviewsPillKey;
    if (key.list !== this.cviews || key.sel !== sel) {
      key.list = this.cviews;
      key.sel = sel;
      this.cviewsPill = sel === null ? this.cviews : this.cviews.filter((c) => c.id !== sel);
    }
    this.pillNowMs = performance.now();
    this.pillView.w = this.w;
    this.pillView.h = this.h;
    const o = this.pillOpts;
    o.lang = this.lang;
    o.time = time;
    o.dt = dt;
    o.reduceMotion = rm;
    this.statusLayer.draw(this.ctx, this.cviewsPill, this.pillPos, o);
    // A name under a creature at the dish's edge could land on a pill pushed inside: names keep clear.
    for (let i = 0; i < this.statusLayer.placedCount; i++) {
      const b = this.statusLayer.placedBox(i);
      this.occupy(b.x, b.y, b.x + b.w, b.y + b.h);
    }
  }

  private drawDishFrame(rect: { x: number; y: number; w: number; h: number }): void {
    // Instrument corner brackets + edge ticks, fading out as you zoom in.
    const z = this.camera.zoom;
    const a = clamp01(1 - (z - 1) * 4);
    if (a <= 0) return;
    const ctx = this.ctx;
    const L = 14;
    const x0 = rect.x + 0.75;
    const y0 = rect.y + 0.75;
    const x1 = rect.x + rect.w - 0.75;
    const y1 = rect.y + rect.h - 0.75;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(C.accent, 0.32 * a);
    ctx.beginPath();
    ctx.moveTo(x0, y0 + L);
    ctx.lineTo(x0, y0);
    ctx.lineTo(x0 + L, y0);
    ctx.moveTo(x1 - L, y0);
    ctx.lineTo(x1, y0);
    ctx.lineTo(x1, y0 + L);
    ctx.moveTo(x1, y1 - L);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1 - L, y1);
    ctx.moveTo(x0 + L, y1);
    ctx.lineTo(x0, y1);
    ctx.lineTo(x0, y1 - L);
    ctx.stroke();
    // Ticks every 16 cells, longer every 64.
    const s = this.camera.scale;
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(C.accent, 0.13 * a);
    ctx.beginPath();
    for (let gx = 16; gx < this.camera.gridW; gx += 16) {
      const x = Math.round(rect.x + gx * s) + 0.5;
      const len = gx % 64 === 0 ? 6 : 3;
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + len);
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y1 - len);
    }
    for (let gy = 16; gy < this.camera.gridH; gy += 16) {
      const y = Math.round(rect.y + gy * s) + 0.5;
      const len = gy % 64 === 0 ? 6 : 3;
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + len, y);
      ctx.moveTo(x1, y);
      ctx.lineTo(x1 - len, y);
    }
    ctx.stroke();
  }

  private drawMotes(time: number, dt: number, rect: { x: number; y: number; w: number; h: number }): void {
    const ctx = this.ctx;
    const d = Math.min(dt, 0.05);
    for (const m of this.motes) {
      m.y -= m.vy * d;
      if (m.y < 0) {
        m.y += 1;
        m.x = Math.random();
      }
      const tw = 0.5 + 0.5 * Math.sin(time * 1.3 + m.ph);
      const x = rect.x + m.x * rect.w + Math.sin(time * 0.5 + m.ph) * 6;
      const y = rect.y + m.y * rect.h;
      if (this.motesColor) ctx.fillStyle = rgba(this.motesColor, m.violet ? 0.04 + 0.1 * tw : 0.05 + 0.15 * tw);
      else ctx.fillStyle = m.violet ? `rgba(184,146,255,${(0.05 + 0.13 * tw).toFixed(3)})` : `rgba(140,215,255,${(0.05 + 0.15 * tw).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawSpots(time: number): void {
    const ctx = this.ctx;
    for (let i = this.spots.length - 1; i >= 0; i--) {
      const sp = this.spots[i];
      const t = (time - sp.t0) / sp.dur;
      if (t >= 1) {
        this.spots.splice(i, 1);
        continue;
      }
      const env = t < 0.15 ? t / 0.15 : t > 0.7 ? (1 - t) / 0.3 : 1;
      const p = this.camera.gridToScreen(sp.x, sp.y);
      const r0 = 34 + 10 * easeOutCubic(clamp01(t * 2));
      const grd = ctx.createRadialGradient(p.x, p.y, r0, p.x, p.y, r0 * 2.6);
      grd.addColorStop(0, 'rgba(4,6,9,0)');
      grd.addColorStop(1, `rgba(4,6,9,${(0.6 * env).toFixed(3)})`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  /**
   * Where the matter is right now: the latest detector position pushed forward by its velocity
   * (no smoothing, no lag). Null when that cannot be known exactly (stale report while running, or a
   * creature that moves without a reported velocity) — then no ring is drawn at all.
   */
  private exactPos(s: Smoothed, nowMs: number): { x: number; y: number } | null {
    const rate = this.paused ? 0 : this.simRate;
    const age = Math.max(0, (nowMs - s.at) / 1000);
    if (!s.vx && !s.vy) return s.jump > 1.5 && rate > 0 && age < 0.6 ? null : { x: s.tx, y: s.ty };
    if (rate > 0 && age > 0.5) return null;
    const ahead = age * rate;
    return { x: this.camera.wrapX(s.tx + s.vx * ahead), y: this.camera.wrapY(s.ty + s.vy * ahead) };
  }

  private drawCreatures(time: number, rect: { x: number; y: number; w: number; h: number }, scale: number, rm: boolean): void {
    const ctx = this.ctx;
    const nowMs = performance.now();
    // No permanent ring: state is told by the small label under each creature (while the dish is
    // not crowded). A ring appears only around the selected creature and as a short pulse when one
    // becomes stable or is a new species — always at the exact matter position, or not at all.
    let labelled = 0;
    for (const c of this.creatures.values()) if (c.state === 'stable' || c.state === 'born') labelled++;
    const showLabels = labelled > 0 && labelled <= MAX_NAMED_CREATURES;
    // Where the dish is drawn (one tile of the torus, centred; taller than the view when zoomed):
    // a creature's name belongs to the copy whose centre is in it.
    const tw = this.camera.gridW * this.camera.scale;
    const th = this.camera.gridH * this.camera.scale;
    const tx0 = (this.w - tw) / 2;
    const ty0 = (this.h - th) / 2;
    for (const [id, s] of this.creatures) {
      // Labels and markers follow the matter itself when its position is known exactly.
      const e = this.exactPos(s, nowMs);
      const p = this.camera.gridToScreen(e ? e.x : s.x, e ? e.y : s.y);
      const R = this.haloRadius(s);
      this.copies(p.x, p.y, R + 14, rect, (x, y) => {
        // One name per creature: the toroidal copy whose centre is on the dish. A copy just past an edge
        // (only its margin on the dish) put a second name on the far side, under nothing.
        const home = !!this.camera.dish || (x >= tx0 && x < tx0 + tw && y >= ty0 && y < ty0 + th);
        if (s.state === 'stable') {
          if (this.markers && s.behavior) this.drawMarker(x + R * 0.71, y - R * 0.71, s, time, rm);
          // A bare "Estable" under it would repeat its status pill: the name line waits for a species.
          // One label per creature: a creature with a status pill has no name line under it.
          if (home && showLabels && !(this.pillsShown() && this.statusLayer.hasPill(id)) && (s.name || s.behavior || !this.pillsShown())) this.queueName(x, y + R + 4, id === this.selectedId ? s : null, this.nameText(s), s.hue !== undefined ? hueHex(s.hue, 78) : '#C9D6E2');
        } else if (s.state === 'born') {
          // The status pill already says "Naciendo 62 %" when pills are on.
          if (home && showLabels && !this.pillsShown()) this.queueName(x, y + Math.min(R, 28) + 4, null, this.bornText, '#9FB8CC');
        } else if (s.state === 'exploded') {
          // Orange tint pulsing from the center.
          const pulse = rm ? 0.6 : 0.55 + 0.45 * Math.sin(time * Math.PI * 2 * 1.1 + s.phase * 6);
          const rr = Math.max(R * 1.3, 20);
          const grd = ctx.createRadialGradient(x, y, 0, x, y, rr);
          grd.addColorStop(0, rgba(C.warn, 0.34 * pulse));
          grd.addColorStop(0.6, rgba(C.danger, 0.12 * pulse));
          grd.addColorStop(1, rgba(C.danger, 0));
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(x, y, rr, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      const selected = id === this.selectedId;
      const pulseAge = s.pulseAt >= 0 ? time - s.pulseAt : Infinity;
      const pulsing = s.state === 'stable' && pulseAge >= 0 && pulseAge < RING_PULSE_S;
      if (!selected && !pulsing) continue;
      if (!e) continue;
      const q = p;
      const hc = s.hue !== undefined ? hueHex(s.hue) : C.accent;
      this.copies(q.x, q.y, R + 24, rect, (x, y) => {
        if (pulsing) {
          const u = pulseAge / RING_PULSE_S;
          const a = Math.pow(1 - u, 1.5);
          if (this.haloSkin) {
            ctx.save();
            ctx.globalAlpha = a;
            drawHalo(ctx, x, y, R, time, this.haloSkin, { phase: s.phase, reduceMotion: rm });
            ctx.restore();
          } else {
            const rr = R + (rm ? 2 : 2 + 12 * Math.sqrt(u));
            ctx.lineWidth = 6;
            ctx.strokeStyle = rgba(hc, 0.12 * a);
            ctx.beginPath();
            ctx.arc(x, y, rr, 0, Math.PI * 2);
            ctx.stroke();
            ctx.lineWidth = 2;
            ctx.strokeStyle = rgba(hc, 0.75 * a);
            ctx.beginPath();
            ctx.arc(x, y, rr, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        if (selected) {
          ctx.save();
          ctx.lineWidth = 2;
          ctx.strokeStyle = rgba(hc, 0.55);
          ctx.beginPath();
          ctx.arc(x, y, R + 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = rgba('#FFFFFF', 0.8);
          ctx.setLineDash([2, 4]);
          ctx.lineDashOffset = rm ? 0 : time * 10;
          ctx.beginPath();
          ctx.arc(x, y, R + 7, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      });
    }
    void scale;
  }

  /** "Naciendo…" under a forming creature (cached per language: no string per frame). */
  private bornKey = '';
  private bornCache = '';
  private get bornText(): string {
    const key = stateName('born');
    if (key !== this.bornKey) {
      this.bornKey = key;
      this.bornCache = `${key}…`;
    }
    return this.bornCache;
  }

  /** "Nadadora celeste · Nadadora" under a stable creature (cached per creature until it changes). */
  private nameCache = new WeakMap<Smoothed, { key: string; text: string }>();
  private nameText(s: Smoothed): string {
    const base = s.name ?? stateName('stable');
    const beh = s.behavior ? behaviorName(s.behavior) : '';
    const key = `${base}|${beh}`;
    const c = this.nameCache.get(s);
    if (c && c.key === key) return c.text;
    // "Nadadora celeste · Nadadora" says it twice: a name that already holds the behaviour stands alone.
    const text = beh && !base.toLowerCase().includes(beh.toLowerCase()) ? `${base} · ${beh}` : base;
    this.nameCache.set(s, { key, text });
    return text;
  }

  private queueName(x: number, y: number, selected: Smoothed | null, text: string, color: string): void {
    let q = this.nameQ[this.nameN];
    if (!q) q = this.nameQ[this.nameN] = { x: 0, y: 0, s: null, text: '', color: '' };
    q.x = x;
    q.y = y;
    q.s = selected;
    q.text = text;
    q.color = color;
    this.nameN++;
  }

  /** Room for a box (no overlap with anything drawn this frame)? */
  private roomFor(x0: number, y0: number, x1: number, y1: number): boolean {
    const o = this.occ;
    for (let i = 0; i < this.occN; i++) {
      const k = i * 4;
      if (x0 < o[k + 2] && x1 > o[k] && y0 < o[k + 3] && y1 > o[k + 1]) return false;
    }
    return true;
  }

  private occupy(x0: number, y0: number, x1: number, y1: number): void {
    if (this.occN * 4 >= this.occ.length) return;
    const k = this.occN++ * 4;
    this.occ[k] = x0;
    this.occ[k + 1] = y0;
    this.occ[k + 2] = x1;
    this.occ[k + 3] = y1;
  }

  /** Longest prefix of `text` that fits `maxW` with "…" (only allocates when it must shorten). */
  private fit(text: string, maxW: number): string {
    const ctx = this.ctx;
    if (ctx.measureText(text).width <= maxW) return text;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ctx.measureText(text.slice(0, mid).trimEnd() + '…').width <= maxW) lo = mid;
      else hi = mid - 1;
    }
    return text.slice(0, lo).trimEnd() + '…';
  }

  /**
   * The creature lines, after numbers and labels: the selected creature first, then the rest; each kept
   * inside the dish (moved in, never cut), shortened with "…", and skipped when it would overlap.
   */
  private drawNames(rect: { x: number; y: number; w: number; h: number }): void {
    if (!this.nameN) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `600 12px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(8,10,14,0.85)';
    const maxW = Math.min(150, rect.w - 12);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < this.nameN; i++) {
        const q = this.nameQ[i];
        if ((pass === 0) !== (q.s !== null)) continue;
        const text = this.fit(q.text, maxW);
        const w = ctx.measureText(text).width;
        const x = Math.min(rect.x + rect.w - w / 2 - 4, Math.max(rect.x + w / 2 + 4, q.x));
        const y = Math.min(rect.y + rect.h - 18, q.y);
        if (!this.roomFor(x - w / 2 - 2, y - 1, x + w / 2 + 2, y + 15)) continue;
        this.occupy(x - w / 2 - 2, y - 1, x + w / 2 + 2, y + 15);
        ctx.strokeText(text, x, y);
        ctx.fillStyle = q.color;
        ctx.fillText(text, x, y);
      }
    }
    ctx.restore();
  }

  /** Behaviour marker: shape + colour (never colour alone). */
  private drawMarker(x: number, y: number, s: Smoothed, time: number, rm: boolean): void {
    const ctx = this.ctx;
    const b = s.behavior!;
    const col = BEHAVIOR_COLOR[b] ?? C.accent;
    ctx.save();
    ctx.translate(x, y);
    // Dark backing disc for contrast over bright matter, ringed in the species' colour.
    ctx.fillStyle = 'rgba(11,14,18,0.78)';
    ctx.beginPath();
    ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
    ctx.fill();
    if (s.hue !== undefined) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = hueHex(s.hue);
      ctx.stroke();
    }
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    switch (b) {
      case 'still':
        ctx.beginPath();
        ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'pulsing': {
        const pr = rm ? 4.8 : 4 + Math.sin(time * Math.PI * 2) * 1;
        ctx.beginPath();
        ctx.arc(0, 0, 1.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, pr, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'swimmer': {
        const a = Math.atan2(s.hy, s.hx);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(4.6, 0);
        ctx.lineTo(-3, -3.6);
        ctx.lineTo(-1.4, 0);
        ctx.lineTo(-3, 3.6);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'spinner': {
        ctx.rotate(rm ? 0 : time * 2.2);
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const tt = i / 24;
          const a = tt * Math.PI * 3;
          const r = 0.6 + tt * 4.2;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        break;
      }
      case 'divider':
        ctx.beginPath();
        ctx.arc(-2.6, 0, 2.1, 0, Math.PI * 2);
        ctx.arc(2.6, 0, 2.1, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'colony':
        ctx.beginPath();
        ctx.arc(0, -2.4, 1.8, 0, Math.PI * 2);
        ctx.arc(-2.4, 1.8, 1.8, 0, Math.PI * 2);
        ctx.arc(2.4, 1.8, 1.8, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
    ctx.restore();
  }

  private drawFlashes(time: number): void {
    const ctx = this.ctx;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      const dur = 0.7;
      const t = (time - f.t0) / dur;
      if (t >= 1) {
        this.flashes.splice(i, 1);
        continue;
      }
      const p = this.camera.gridToScreen(f.x, f.y);
      const r = (18 + 30 * easeOutCubic(t)) * f.r * 0.7;
      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      grd.addColorStop(0, rgba(f.color, 0.45 * (1 - t)));
      grd.addColorStop(1, rgba(f.color, 0));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2 * (1 - t) + 0.5;
      ctx.strokeStyle = rgba(f.color, 0.7 * (1 - t));
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawArrows(time: number): void {
    const ctx = this.ctx;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      const t = (time - a.t0) / SEED_ARROW_S;
      if (t >= 1) {
        this.arrows.splice(i, 1);
        continue;
      }
      // From the finger to the seed, the short way round the torus.
      const p = this.camera.gridToScreen(a.fx, a.fy);
      const s = this.camera.scale;
      const dx = this.camera.deltaX(a.tx - a.fx) * s;
      const dy = this.camera.deltaY(a.ty - a.fy) * s;
      const len = Math.hypot(dx, dy);
      if (len < 4) continue;
      const ux = dx / len;
      const uy = dy / len;
      // The arrow grows from the finger, then fades (reduce motion: drawn whole, fading).
      const grow = this.reduceMotion ? 1 : easeOutCubic(Math.min(1, t / 0.35));
      const alpha = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      const ex = p.x + dx * grow;
      const ey = p.y + dy * grow;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(8,10,14,0.7)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2.4;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);
      // Head.
      const hs = 8;
      ctx.fillStyle = C.accent;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - ux * hs - uy * hs * 0.6, ey - uy * hs + ux * hs * 0.6);
      ctx.lineTo(ex - ux * hs + uy * hs * 0.6, ey - uy * hs - ux * hs * 0.6);
      ctx.closePath();
      ctx.fill();
      // The finger's spot: a small hollow dot.
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawRipples(time: number): void {
    const ctx = this.ctx;
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rp = this.ripples[i];
      const total = rp.dur + (rp.rings - 1) * 0.07;
      if (time - rp.t0 > total) {
        this.ripples.splice(i, 1);
        continue;
      }
      const p = this.camera.gridToScreen(rp.x, rp.y);
      if (rp.skin) {
        drawTrailRipple(ctx, p.x, p.y, time - rp.t0, rp.maxR, rp.skin, rp.dur);
        continue;
      }
      for (let r = 0; r < rp.rings; r++) {
        const t = (time - rp.t0 - r * 0.07) / rp.dur;
        if (t < 0 || t > 1) continue;
        // Reduce motion: the ring does not grow, it only fades.
        const rad = this.reduceMotion ? rp.maxR * (1 - r * 0.18) : 3 + (rp.maxR - 3) * easeOutCubic(t) * (1 - r * 0.18);
        ctx.lineWidth = rp.width * (1 - t) + 0.4;
        ctx.strokeStyle = rgba(rp.color, 0.9 * Math.pow(1 - t, 1.4));
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Inner flash for the first 120 ms.
      const t0 = (time - rp.t0) / 0.12;
      if (t0 < 1) {
        ctx.fillStyle = rgba(rp.color, 0.28 * (1 - t0));
        ctx.beginPath();
        ctx.arc(p.x, p.y, rp.maxR * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawParticles(time: number, dt: number): void {
    const ctx = this.ctx;
    const d = Math.min(dt, 0.05);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      const t = (time - pt.t0) / pt.life;
      if (t >= 1) {
        this.particles.splice(i, 1);
        continue;
      }
      const damp = Math.exp(-pt.drag * d);
      pt.vx *= damp;
      pt.vy = pt.vy * damp + pt.grav * d;
      pt.ox += pt.vx * d;
      pt.oy += pt.vy * d;
      const p = this.camera.gridToScreen(pt.ax, pt.ay);
      const x = p.x + pt.ox;
      const y = p.y + pt.oy;
      const a = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      ctx.fillStyle = rgba(pt.color, a);
      if (pt.star) {
        const s = pt.size * 2.2 * (1 - t * 0.5);
        ctx.beginPath();
        ctx.moveTo(x, y - s);
        ctx.quadraticCurveTo(x, y, x + s, y);
        ctx.quadraticCurveTo(x, y, x, y + s);
        ctx.quadraticCurveTo(x, y, x - s, y);
        ctx.quadraticCurveTo(x, y, x, y - s);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, pt.size * (1 - t * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Seed-trail particles of an equipped skin (drag + the skin's gravity, src/store/draw.ts). */
  private drawSkinParticles(time: number, dt: number): void {
    const d = Math.min(dt, 0.05);
    for (let i = this.skinParticles.length - 1; i >= 0; i--) {
      const sp = this.skinParticles[i];
      const t = (time - sp.t0) / sp.p.life;
      if (t >= 1) {
        this.skinParticles.splice(i, 1);
        continue;
      }
      stepTrailParticle(sp.p, sp.skin, d);
      const a = this.camera.gridToScreen(sp.ax, sp.ay);
      drawTrailParticle(this.ctx, a.x, a.y, sp.p, sp.skin, t);
    }
  }

  /** Golden spark with an equipped skin: same position, size, life and blink as the default. */
  private drawGoldenSkin(time: number, g: NonNullable<Overlay['golden']>, rm: boolean, skin: SparkSkin): void {
    const ctx = this.ctx;
    const p = this.camera.gridToScreen(g.x, g.y);
    const last = this.goldenTrail[this.goldenTrail.length - 1];
    if (!last || time - last.t > 0.035) {
      this.goldenTrail.push({ x: g.x, y: g.y, t: time });
      if (this.goldenTrail.length > 22) this.goldenTrail.shift();
    }
    const appear = clamp01((time - g.born) / 0.5);
    const blink = g.life < 0.18 ? 0.55 + 0.45 * Math.sin(time * 18) : 1;
    const A = appear * blink;
    // Heading from the drift (comet tail, moth body).
    const old = this.goldenTrail[Math.max(0, this.goldenTrail.length - 6)];
    let heading: number | undefined;
    if (old) {
      const q = this.camera.gridToScreen(old.x, old.y);
      if (Math.hypot(p.x - q.x, p.y - q.y) > 1 && Math.abs(q.x - p.x) < 80 && Math.abs(q.y - p.y) < 80) heading = Math.atan2(p.y - q.y, p.x - q.x);
    }
    if (!rm) {
      const pts: { x: number; y: number }[] = [];
      for (const tp of this.goldenTrail) {
        const q = this.camera.gridToScreen(tp.x, tp.y);
        if (Math.abs(q.x - p.x) > 80 || Math.abs(q.y - p.y) > 80) continue; // wrapped
        pts.push(q);
      }
      drawSparkTrail(ctx, pts, skin, A);
      if (time - this.lastSparkEmit > 0.09) {
        this.lastSparkEmit = time;
        if (this.particles.length < MAX_PARTICLES) {
          const a = Math.random() * Math.PI * 2;
          const cols = skin.particles.length ? skin.particles : [skin.core];
          this.particles.push({
            ax: g.x,
            ay: g.y,
            ox: Math.cos(a) * 6,
            oy: Math.sin(a) * 6,
            vx: Math.cos(a) * 22,
            vy: Math.sin(a) * 22 - 8,
            t0: time,
            life: 0.7 + Math.random() * 0.4,
            size: 1 + Math.random() * 1.2,
            color: cols[Math.floor(Math.random() * cols.length)],
            drag: 1.2,
            grav: 10,
            star: Math.random() < 0.4,
          });
        }
      }
    }
    drawSpark(ctx, p.x, p.y, time, skin, { alpha: A, reduceMotion: rm, heading });
  }

  private drawGolden(time: number, g: NonNullable<Overlay['golden']>, rm: boolean): void {
    if (this.sparkSkin) {
      this.drawGoldenSkin(time, g, rm, this.sparkSkin);
      return;
    }
    const ctx = this.ctx;
    const p = this.camera.gridToScreen(g.x, g.y);
    // Trail (grid positions so it survives zoom), sampled every 35 ms.
    const last = this.goldenTrail[this.goldenTrail.length - 1];
    if (!last || time - last.t > 0.035) {
      this.goldenTrail.push({ x: g.x, y: g.y, t: time });
      if (this.goldenTrail.length > 22) this.goldenTrail.shift();
    }
    const appear = clamp01((time - g.born) / 0.5);
    const blink = g.life < 0.18 ? 0.55 + 0.45 * Math.sin(time * 18) : 1;
    const A = appear * blink;
    if (!rm) {
      const n = this.goldenTrail.length;
      for (let i = 0; i < n; i++) {
        const tp = this.goldenTrail[i];
        const q = this.camera.gridToScreen(tp.x, tp.y);
        if (Math.abs(q.x - p.x) > 80 || Math.abs(q.y - p.y) > 80) continue; // wrapped
        const f = i / n;
        ctx.fillStyle = rgba(C.gold, 0.35 * f * A);
        ctx.beginPath();
        ctx.arc(q.x, q.y, 1 + 3.5 * f, 0, Math.PI * 2);
        ctx.fill();
      }
      if (time - this.lastSparkEmit > 0.09) {
        this.lastSparkEmit = time;
        if (this.particles.length < MAX_PARTICLES) {
          const a = Math.random() * Math.PI * 2;
          this.particles.push({
            ax: g.x,
            ay: g.y,
            ox: Math.cos(a) * 6,
            oy: Math.sin(a) * 6,
            vx: Math.cos(a) * 22,
            vy: Math.sin(a) * 22 - 8,
            t0: time,
            life: 0.7 + Math.random() * 0.4,
            size: 1 + Math.random() * 1.2,
            color: Math.random() < 0.3 ? '#FFFFFF' : C.gold,
            drag: 1.2,
            grav: 10,
            star: Math.random() < 0.4,
          });
        }
      }
    }
    const pulse = rm ? 0.5 : 0.5 + 0.5 * Math.sin(time * 4.2);
    const glowR = 26 + 6 * pulse;
    const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
    grd.addColorStop(0, rgba('#FFF3C4', 0.85 * A));
    grd.addColorStop(0.25, rgba(C.gold, 0.5 * A));
    grd.addColorStop(1, rgba(C.gold, 0));
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
    ctx.fill();
    // 4-point star, slowly rotating, plus a fainter 45° one.
    const rot = rm ? 0 : time * 0.9;
    for (const [sz, extra, alpha] of [
      [13 + 2 * pulse, 0, 1],
      [8, Math.PI / 4, 0.6],
    ] as const) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(rot + extra);
      ctx.fillStyle = rgba('#FFF8E1', alpha * A);
      ctx.beginPath();
      ctx.moveTo(0, -sz);
      ctx.quadraticCurveTo(1.6, -1.6, sz, 0);
      ctx.quadraticCurveTo(1.6, 1.6, 0, sz);
      ctx.quadraticCurveTo(-1.6, 1.6, -sz, 0);
      ctx.quadraticCurveTo(-1.6, -1.6, 0, -sz);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = rgba('#FFFFFF', A);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  /** When zoomed in and the spark is off-screen, a gold chevron points at it from the edge. */
  private drawGoldenIndicator(g: NonNullable<Overlay['golden']>): void {
    const p = this.camera.gridToScreen(g.x, g.y);
    const m = 22;
    if (p.x >= 0 && p.y >= 0 && p.x <= this.w && p.y <= this.h) return;
    const cx = this.w / 2;
    const cy = this.h / 2;
    const a = Math.atan2(p.y - cy, p.x - cx);
    const ex = Math.min(this.w - m, Math.max(m, p.x));
    const ey = Math.min(this.h - m, Math.max(m, p.y));
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.fillStyle = 'rgba(11,14,18,0.7)';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(a);
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-4, -6);
    ctx.lineTo(-1, 0);
    ctx.lineTo(-4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawCharge(time: number): void {
    const c = this.charge;
    if (!c) return;
    // Hidden for the first 120 ms so quick taps never flash it.
    const t = (time - c.t0 - 0.12) / 0.28;
    if (t <= 0) return;
    const p = Math.min(1, t);
    const ctx = this.ctx;
    const r = 30;
    ctx.save();
    ctx.fillStyle = rgba(C.accent, 0.1 * p);
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * (0.6 + 0.4 * p), 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba('#FFFFFF', 0.12);
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = rgba(C.accent, 0.95);
    ctx.shadowColor = C.accent;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawFloats(time: number): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      const t = (time - f.t0) / f.dur;
      if (t >= 1) {
        this.floats.splice(i, 1);
        continue;
      }
      const p = this.camera.gridToScreen(f.x, f.y);
      const y = p.y - 10 - f.rise * easeOutCubic(t);
      const x = p.x + f.jitter;
      const a = t < 0.08 ? t / 0.08 : t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      const pop = this.reduceMotion ? 1 : 1 + 0.3 * Math.max(0, 1 - t / 0.12);
      const size = Math.round(f.size * pop);
      ctx.font = `700 ${size}px ${SANS}`;
      const tw = ctx.measureText(f.text).width;
      const dropW = f.drop ? size * 0.75 : 0;
      const tx = x + dropW / 2;
      ctx.globalAlpha = a;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(8,10,14,0.85)';
      ctx.strokeText(f.text, tx, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, tx, y);
      if (f.drop) this.drawDroplet(tx - tw / 2 - dropW * 0.6, y, size * 0.42, f.color);
      ctx.globalAlpha = 1;
      // Names stay out of a number's way while it floats.
      this.occupy(tx - tw / 2 - dropW - 2, y - size / 2 - 2, tx + tw / 2 + 2, y + size / 2 + 2);
    }
  }

  private drawDroplet(x: number, y: number, r: number, color: string): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 1.5);
    ctx.bezierCurveTo(x + r * 0.9, y - r * 0.4, x + r, y + 0.1 * r, x + r, y + 0.35 * r);
    ctx.arc(x, y + 0.35 * r, r, 0, Math.PI);
    ctx.bezierCurveTo(x - r, y + 0.1 * r, x - r * 0.9, y - r * 0.4, x, y - r * 1.5);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(8,10,14,0.85)';
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fill();
  }

  private drawLabels(time: number): void {
    const ctx = this.ctx;
    for (let i = this.labels.length - 1; i >= 0; i--) {
      const L = this.labels[i];
      const t = (time - L.t0) / L.dur;
      if (t >= 1) {
        this.labels.splice(i, 1);
        continue;
      }
      const p = this.camera.gridToScreen(L.x, L.y);
      const a = t < 0.1 ? t / 0.1 : t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      const lift = this.reduceMotion ? 0 : 14 * easeOutCubic(clamp01(t * 3)) + t * 8;
      const pop = this.reduceMotion ? 1 : 1 + 0.18 * Math.max(0, 1 - t / 0.1);
      ctx.save();
      ctx.globalAlpha = a;
      // Never wider than the screen: long words end in "…" (docs/ARTE.md §10).
      const maxText = Math.max(60, this.w - 48);
      ctx.font = `700 ${Math.round(14 * pop)}px ${SANS}`;
      const text = this.fit(L.text, maxText - (L.glyph ? 18 : 0));
      const w1 = ctx.measureText(text).width;
      ctx.font = `500 12px ${SANS}`;
      const sub = L.sub ? this.fit(L.sub, maxText) : '';
      const w2 = sub ? ctx.measureText(sub).width : 0;
      const glyphW = L.glyph ? 18 : 0;
      const W = Math.max(w1 + glyphW, w2) + 24;
      const H = sub ? 44 : 28;
      // Keep the pill on screen.
      let x = p.x;
      let y = p.y - 40 - lift - H / 2;
      x = Math.min(this.w - W / 2 - 6, Math.max(W / 2 + 6, x));
      if (y - H / 2 < 6) y = p.y + 40 + H / 2;
      // One label at a time where they would collide: the newest wins, the older one waits.
      if (!this.roomFor(x - W / 2, y - H / 2, x + W / 2, y + H / 2)) {
        ctx.restore();
        continue;
      }
      this.occupy(x - W / 2, y - H / 2, x + W / 2, y + H / 2);
      ctx.fillStyle = 'rgba(11,14,18,0.86)';
      ctx.strokeStyle = rgba(L.color, 0.75);
      ctx.lineWidth = 1.5;
      roundRect(ctx, x - W / 2, y - H / 2, W, H, H / 2 > 14 ? 14 : H / 2);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(14 * pop)}px ${SANS}`;
      ctx.fillStyle = L.color;
      const ty = sub ? y - 8 : y + 0.5;
      ctx.fillText(text, x + glyphW / 2, ty);
      if (L.glyph) {
        const fake: Smoothed = { x: 0, y: 0, tx: 0, ty: 0, r: 0, hx: 1, hy: 0, state: 'stable', behavior: L.glyph, seenAt: 0, phase: 0, vx: 0, vy: 0, at: 0, jump: 0, pulseAt: -1, name: null };
        this.drawMarker(x - w1 / 2 - 4 + glyphW / 2 - 6, ty, fake, time, this.reduceMotion);
      }
      if (sub) {
        ctx.font = `500 12px ${SANS}`;
        ctx.fillStyle = C.text;
        ctx.fillText(sub, x, y + 10);
      }
      ctx.restore();
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
