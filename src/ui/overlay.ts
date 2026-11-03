/**
 * The 2D overlay canvas drawn on top of the WebGL dish: the life cycle's light (a seed's drop and
 * ripple, the heartbeat and progress arc of a forming creature, the anticipation and burst of a
 * birth, the dissolve of a death; docs/ARTE-PULIDO.md A-4), floating numbers, behaviour markers, the
 * Spark (A-7), ambient motes (A-8) and labels. Everything is positioned through the shared Camera so
 * it lines up with the GL render exactly, and creature anchors follow the matter itself
 * (src/ui/fx/tracks.ts), so rings, labels and the Momento focus never trail it (§3.7).
 *
 * Draws in CSS pixels (the context is pre-scaled by devicePixelRatio), moved by the same camera
 * micro-motion as the dish shader (A-9). Frames allocate nothing (A-10, §6.1): pooled particles,
 * pooled effects, pre-rendered sprites, globalAlpha instead of rgba() strings, no shadowBlur, text
 * measured only when it changes.
 */
import { wrapDelta, type Camera } from '../core/camera';
import { BEHAVIOR_COLOR, UI as C } from '../core/palette';
import type { Behavior, CreatureState, CreatureView, GameView, Lang } from '../core/types';
import type { TapCreature, TapScene } from './dishTap';
import { DROP_FX, DropLayer, type CreatureResolver } from './fx/drops';
import { PipetteLayer } from './fx/pipettes';
import { behaviorName, stateName } from './i18n';
import { placeLabel, type LabelObstacles, type LabelPlacement, type LabelRequest } from './labelPlace';
import { earningNow, StatusLayer } from './moments/status';
import { DISSOLVE_MS, STABLE_AGE_STEPS } from '../game/cycleBalance';
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
import { anticipation, beatAmp, beatPeriod, beatValue, beatWave, birthHalo, deniedShake, IncubationArc, LIFE, rippleAt, seedDrop } from './fx/lifecycle';
import { AmbientMotes } from './fx/motes';
import { ParticlePool, type Projector } from './fx/particles';
import { SHAKE } from './fx/shake';
import { SPARK, SparkFx } from './fx/spark';
import { SPR, SpriteAtlas } from './fx/sprites';
import { dishFx, PULSE } from './fx/stage';

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
const TAU = Math.PI * 2;

interface Smoothed {
  id: number;
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
  /** Age in steps at the dish step `ageStep` (incubation progress between 10 Hz views). */
  age: number;
  ageStep: number;
  /** Forming: the progress arc, the heartbeat's phase (beats) and when it passed 92 % (fx s, -1). */
  arc: IncubationArc | null;
  beat: number;
  antAt: number;
  /** Birth (fx s) for the halo pop, and the halo scale it starts from (the anticipation's). */
  bornAt: number;
  bornFrom: number;
}

/** Duration of the ring pulse when a creature becomes stable or is a new species (s). */
const RING_PULSE_S = 1.6;

interface Ripple {
  on: boolean;
  x: number;
  y: number;
  t0: number;
  dur: number;
  color: string;
  maxR: number;
  rings: number;
  width: number;
  /** Refused sowing: the ring shakes ±3 px (A-4). */
  shake: boolean;
  /** Successful-seed ripple drawn with an equipped trail skin (src/store/draw.ts). */
  skin?: TrailStyle;
  /** Creature id this ring sits on: it follows the creature as it swims (QA4 F-13). */
  follow?: number;
}

/** A seed landing (A-4 "Sembrar"): the drop, the ripple, the motes. */
interface Sow {
  on: boolean;
  x: number;
  y: number;
  t0: number;
  big: boolean;
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
  on: boolean;
  x: number;
  y: number;
  t0: number;
  dur: number;
  text: string;
  /** Width of `text` at the float's font, measured when the text changes. */
  tw: number;
  color: string;
  size: number;
  rise: number;
  drop: boolean; // draw an essence droplet before the text
  jitter: number;
  /** Extra start height above the anchor (CSS px): an income number starts above its creature's body. */
  lift: number;
  /** Creature id + running amount, so rapid incomes merge into one number. */
  cid?: number;
  amount?: number;
}

interface Flash {
  on: boolean;
  x: number;
  y: number;
  t0: number;
  color: number;
  css: string;
  r: number;
  /** Birth flash (A-4): a white disc of 0.8 R in 140 ms, no ring. */
  quick: boolean;
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
  /** Creature id the label sits on: it follows the creature (QA4 F-13). */
  follow?: number;
  /** With `follow`: a second creature; the label sits half-way between the two (the contact warning). */
  between?: number;
  /** Fitted text and widths, measured once (A-10: no measureText per frame). */
  fit?: { text: string; sub: string; w1: number; w2: number; maxW: number };
  /** Last frame's slot (./labelPlace), so the label keeps its side while that side stays clear. */
  slot?: number;
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
  on: boolean;
  x: number;
  y: number;
  t0: number;
  dur: number;
}

const MAX_FLOATS = 40;
const MAX_RIPPLES = 24;
const MAX_SOWS = 8;
const MAX_FLASHES = 16;
const MAX_SPOTS = 4;
/** Income numbers visible at once; more income merges into the nearest number. */
const MAX_INCOME_FLOATS = 12;
/** Income numbers closer than this (CSS px) merge into one. */
const MERGE_RADIUS_PX = 34;
/** Skin particles (equipped trail cosmetics only). */
const MAX_SKIN_PARTICLES = 210;
/** "+N" over the paying creature (A-5): 15 px / 600, rises 22 px in 700 ms, fades in the last 35 %. */
const INCOME_PX = 15;
const INCOME_RISE = 22;
const INCOME_S = 0.7;
const INCOME_FADE = 0.35;
/** Kernel radius when the view has none (Orbium's R): sizes the light pulses in cells. */
const DEFAULT_R = 13;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Stable creatures up to which each one gets its name drawn (a crowded dish stays readable). */
const MAX_NAMED_CREATURES = 8;

/** Species accent hue → '#RRGGBB' (hsl(h 70% L%)), cached: the halo/name colour of a species. */
const hueCache = new Map<number, string>();
export function hueHex(hue: number, light = 62): string {
  const key = Math.round(hue) * 1000 + light;
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

/** A dark "spotlight" sprite: transparent in the middle, night towards the edge (new species). */
function spotSprite(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(128, 128, 128 / 2.6, 128, 128, 128);
  gr.addColorStop(0, 'rgba(4,6,9,0)');
  gr.addColorStop(1, 'rgba(4,6,9,1)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  return c;
}

export class Overlay {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w = 1;
  private h = 1;
  private dpr = 1;
  /** Effect clock (s): holds still during the Spark's hit-stop. */
  private now = 0;
  private hold = 0;
  private light = false;

  private creatures = new Map<number, Smoothed>();
  private alive = new Set<number>();
  private golden: { x: number; y: number; tx: number; ty: number; life: number; born: number } | null = null;
  private goldenTrail: { x: number; y: number; t: number }[] = [];
  private lastSparkEmit = 0;
  private readonly spark = new SparkFx();
  private readonly ripples: Ripple[] = Array.from({ length: MAX_RIPPLES }, () => ({ on: false, x: 0, y: 0, t0: 0, dur: 0, color: '', maxR: 0, rings: 1, width: 1, shake: false }));
  private rippleHead = 0;
  private readonly sows: Sow[] = Array.from({ length: MAX_SOWS }, () => ({ on: false, x: 0, y: 0, t0: 0, big: false }));
  private sowHead = 0;
  private readonly floats: Float[] = Array.from({ length: MAX_FLOATS }, () => ({ on: false, x: 0, y: 0, t0: 0, dur: 0, text: '', tw: 0, color: '', size: 12, rise: 0, drop: false, jitter: 0, lift: 0 }));
  private floatHead = 0;
  private readonly flashes: Flash[] = Array.from({ length: MAX_FLASHES }, () => ({ on: false, x: 0, y: 0, t0: 0, color: 0, css: '', r: 1, quick: false }));
  private flashHead = 0;
  private readonly spots: Spot[] = Array.from({ length: MAX_SPOTS }, () => ({ on: false, x: 0, y: 0, t0: 0, dur: 0 }));
  private spotHead = 0;
  private spotImg: HTMLCanvasElement | null = null;
  private readonly atlas = new SpriteAtlas();
  private readonly pool = new ParticlePool();
  private readonly motesFx = new AmbientMotes();
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
  /** Living creatures' bodies as drawn this frame (x, y, r in CSS px): messages step off them (./labelPlace). */
  private bodyDiscs = new Float32Array(3 * 64);
  private bodyN = 0;
  private readonly bodyView = { discs: this.bodyDiscs, n: 0 };
  /** A message drawn outside this canvas (the Momento brief, canvas px): nothing here is drawn under it. */
  private readonly kept = { on: false, l: 0, t: 0, r: 0, b: 0 };
  private readonly labelObs: LabelObstacles = { boxes: this.occ, nBoxes: 0, discs: this.bodyDiscs, nDiscs: 0 };
  private readonly labelReq: LabelRequest = { x: 0, y: 0, w: 0, h: 0, gap: 0, bounds: { l: 0, t: 0, r: 0, b: 0 }, slot: -1 };
  private readonly labelOut: LabelPlacement = { x: 0, y: 0, slot: -1, clear: false };
  /** Name / status lines asked for by drawCreatures this frame (drawn later, unclipped, without overlaps). */
  private nameQ: { x: number; y: number; s: Smoothed | null; text: string; color: string }[] = [];
  private nameN = 0;
  private arrows: SeedArrow[] = [];
  private lastBlockedLabel = -Infinity;
  private charge: { x: number; y: number; t0: number } | null = null;
  /** Kernel radius (cells) of the dish's world: sizes the light pulses. */
  private kernelR = DEFAULT_R;
  /** Atlas colours. */
  private readonly c: { accent: number; white: number; gold: number; grey: number; danger: number; warn: number; good: number; violet: number; mote: number; moteSkin: number };
  private readonly hueIdx = new Map<number, number>();
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
  private readonly pillOpts: { lang: Lang; time: number; dt: number; reduceMotion: boolean; onAll: boolean; selectedId: number | null; view: { w: number; h: number }; earning: boolean } = {
    lang: 'es',
    time: 0,
    dt: 0,
    reduceMotion: false,
    onAll: true,
    selectedId: null,
    view: this.pillView,
    earning: true,
  };
  /** Screen position of a creature for its pill (same point as its name label), or null. */
  private readonly pillPos = (c: CreatureView): { x: number; y: number; r: number } | null => {
    const s = this.creatures.get(c.id);
    if (!s) return null;
    const e = this.exactPos(s, c.id, this.pillNowMs);
    const o = this.pillScratch;
    o.x = this.map.px(e ? e.x : s.x);
    o.y = this.map.py(e ? e.y : s.y);
    o.r = this.haloRadius(s);
    return o;
  };

  // ── Collected light (ADR-030): drops, pipettes, the collision warning and the finger guide ──
  /** Drops of light on the dish (src/ui/fx/drops.ts). */
  readonly drops = new DropLayer();
  /** The collecting pipettes on the rim (src/ui/fx/pipettes.ts). */
  readonly pipettes = new PipetteLayer();
  /** GameView.dangers as last seen (the red link between two creatures about to touch). */
  private dangers: readonly { a: number; b: number; inS: number }[] = [];
  /** Pairs already labelled "¡Cuidado! Se van a tocar" (once per pair, docs/CLARIDAD2.md §2.5). */
  private dangerSeen = new Set<number>();
  /**
   * Text of the contact label for a pair (`steer`: one of them is a swimmer the finger can guide), or
   * null when a Momento already says it (then only the red link is drawn). Set by the UI.
   */
  dangerText: ((steer: boolean) => string | null) | null = null;
  /** The finger guide (§2.5): a 1 px line from the guided swimmer to the finger (overlay px). */
  private guide = { on: false, id: -1, x: 0, y: 0, t0: 0, out: -1 };
  /** Creatures as drawn this frame, for the tap router (reused objects). */
  private readonly tapCreatures: TapCreature[] = [];
  private readonly scene: TapScene = { drops: this.drops.tap, dropCount: 0, creatures: this.tapCreatures, creatureCount: 0, collecting: false, dropPx: DROP_FX.tapPx, creaturePadPx: 16 };
  /** Places an owned drop on its creature (no allocation: writes the caller's object). */
  private readonly resolveCreature: CreatureResolver = (id, out) => {
    const s = this.creatures.get(id);
    if (!s || s.state !== 'stable') return false;
    const e = this.exactPos(s, id, this.frameMs);
    out.x = this.map.px(e ? e.x : s.x);
    out.y = this.map.py(e ? e.y : s.y);
    out.r = this.outlineRadius(s);
    out.hue = s.hue;
    return true;
  };
  private frameMs = 0;

  // ── This frame's grid → screen mapping (no allocation; refreshed at the start of draw()) ──
  private ms = 1;
  private mcx = 0;
  private mcy = 0;
  private mhw = 0;
  private mhh = 0;
  private mww = 0;
  private mwh = 0;
  private readonly map: Projector = {
    px: (x: number) => this.mhw + (this.mww ? wrapDelta(x - this.mcx, this.mww) : x - this.mcx) * this.ms,
    py: (y: number) => this.mhh + (this.mwh ? wrapDelta(y - this.mcy, this.mwh) : y - this.mcy) * this.ms,
  };
  private readonly pos = { x: 0, y: 0 };

  constructor(private camera: Camera) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'bl-overlay';
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    const a = this.atlas;
    this.c = {
      accent: a.color(C.accent),
      white: a.color('#ffffff'),
      gold: a.color(C.gold),
      grey: a.color('#8e99a4'),
      danger: a.color(C.danger),
      warn: a.color(C.warn),
      good: a.color(C.good),
      violet: a.color('#b892ff'),
      mote: a.color('#8cd7ff'),
      moteSkin: a.color('#8cd7ff'),
    };
    this.applyProfile();
  }

  /** The effects profile's budgets (particles, ambient motes). */
  private profileQ = '';
  private applyProfile(): void {
    if (dishFx.quality === this.profileQ) return;
    this.profileQ = dishFx.quality;
    this.pool.setCapacity(dishFx.profile.particles);
    this.motesFx.setCount(dishFx.profile.motes);
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

  /** The frame handed to the layers, reused every frame (RF-11: no allocation per frame and layer). */
  private readonly layerFrame: OverlayLayerFrame = {
    ctx: null as unknown as CanvasRenderingContext2D,
    time: 0,
    dt: 0,
    rect: { x: 0, y: 0, w: 0, h: 0 },
    scale: 1,
    reduceMotion: false,
    paused: false,
    gridToScreen: (x, y) => this.camera.gridToScreen(x, y),
  };

  private runLayers(slot: OverlayLayerSlot, time: number, dt: number, rect: { x: number; y: number; w: number; h: number }, scale: number): void {
    if (!this.layers.length) return;
    const frame = this.layerFrame;
    frame.ctx = this.ctx;
    frame.time = time;
    frame.dt = dt;
    frame.rect = rect;
    frame.scale = scale;
    frame.reduceMotion = this.reduceMotion;
    frame.paused = this.paused;
    // A failing layer is removed by replacing the array, so this one stays intact while it is walked.
    const list = this.layers;
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
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
    if (this.motesColor) this.c.moteSkin = this.atlas.color(this.motesColor);
  }

  setView(view: GameView): void {
    this.reduceMotion = view.settings.reduceMotion;
    // No rate on the pills while the clock waits for the first seed (RF-10).
    this.pillOpts.earning = earningNow(view);
    this.cviews = view.creatures;
    this.lang = view.settings.lang;
    this.markers = !!(view.tools as { markers?: boolean }).markers;
    const R = view.calibration?.R;
    if (typeof R === 'number' && R > 0) this.kernelR = R;
    const alive = this.alive;
    alive.clear();
    const step = dishFx.simStep;
    for (const c of view.creatures) {
      alive.add(c.id);
      let s = this.creatures.get(c.id);
      if (!s) {
        s = {
          id: c.id,
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
          age: c.age,
          ageStep: step,
          arc: null,
          beat: (c.id * 0.37) % 1,
          antAt: -1,
          bornAt: -1,
          bornFrom: 1,
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
        // Born now (the bus's creatureStable may have come first and started the pop already).
        if (c.state === 'stable' && s.state === 'born' && s.bornAt < 0) this.startBirth(s);
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
        if (c.age !== s.age) {
          s.age = c.age;
          s.ageStep = step;
        }
      }
    }
    for (const id of this.creatures.keys()) if (!alive.has(id)) this.creatures.delete(id);

    if (view.golden) {
      if (!this.golden) {
        this.golden = { x: view.golden.x, y: view.golden.y, tx: view.golden.x, ty: view.golden.y, life: 1, born: this.now };
        this.goldenTrail = [];
        if (!this.spark.on || this.spark.end !== 'none') this.spark.spawn(view.golden.x, view.golden.y, this.now);
      }
      this.golden.tx = view.golden.x;
      this.golden.ty = view.golden.y;
      this.golden.life = view.golden.life;
    } else if (this.golden) {
      // Gone without being collected: it is lost (A-7: it shrinks away, six motes fall).
      if (this.spark.on && this.spark.end === 'none') this.loseSpark(this.golden.x, this.golden.y);
      this.golden = null;
      this.goldenTrail = [];
    }

    // Collected light (ADR-030). Pipettes first: a drop that vanishes under a pipette's tip was sipped.
    const nowMs = performance.now();
    this.pipettes.setView(view.pipettes, nowMs, (id) => this.drops.posOf(id), (id) => this.drops.hueOf(id));
    this.drops.setView(view.drops, (owner) => this.creatures.get(owner)?.hue, this.now, (id) => this.pipettes.sipping(id));
    this.scene.collecting = this.drops.active;
    this.dangers = view.dangers ?? NO_DANGERS;
    for (const d of this.dangers) {
      const key = Math.min(d.a, d.b) * 65536 + Math.max(d.a, d.b);
      if (this.dangerSeen.has(key)) continue;
      this.dangerSeen.add(key);
      if (this.dangerSeen.size > 256) this.dangerSeen.clear();
      const a = this.creatures.get(d.a);
      const b = this.creatures.get(d.b);
      if (!a || !b) continue;
      const text = this.dangerText?.(a.behavior === 'swimmer' || b.behavior === 'swimmer') ?? null;
      // On the link, between the two (it moves with them): a pill on either creature would be hidden by its own.
      if (text) this.pushLabel({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t0: this.now, dur: 2.2, text, sub: '', color: C.danger, glyph: null, follow: d.a, between: d.b });
    }
  }

  // ───────────────────────────── queries (hit testing) ─────────────────────────────

  screenOf(x: number, y: number): { x: number; y: number } {
    return this.camera.gridToScreen(x, y);
  }

  goldenScreen(): { x: number; y: number } | null {
    return this.golden ? this.camera.gridToScreen(this.golden.x, this.golden.y) : null;
  }

  /** Where a creature's matter is on screen (the spotlight and the info card follow this). */
  creatureScreen(id: number): { x: number; y: number; r: number } | null {
    const s = this.creatures.get(id);
    if (!s) return null;
    const e = this.exactPos(s, id, performance.now());
    const p = this.camera.gridToScreen(e ? e.x : s.x, e ? e.y : s.y);
    return { x: p.x, y: p.y, r: this.haloRadius(s) };
  }

  /** Where a creature's matter is in the grid (the Momento focus and the follow camera use this). */
  creaturePos(id: number): { x: number; y: number } | null {
    const s = this.creatures.get(id);
    if (!s) return null;
    const e = this.exactPos(s, id, performance.now());
    return e ? { x: e.x, y: e.y } : { x: s.x, y: s.y };
  }

  /** Status pill under a CSS-pixel point (≥ 44 px tall hit area), or null. */
  statusHit(px: number, py: number): { id: number; behavior: Behavior | null; state: CreatureState } | null {
    return this.pillsShown() ? this.statusLayer.hitTest(px, py) : null;
  }

  private pillsShown(): boolean {
    return this.statusOnAll && !this.statusHidden && dishFx.matterFade > 0.5;
  }

  /** Stable creature under a CSS-pixel point, or null. */
  creatureAt(px: number, py: number): number | null {
    let best: number | null = null;
    let bestD = Infinity;
    for (const s of this.creatures.values()) {
      const id = s.id;
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
    const sowing = kind === 'seed' || kind === 'big';
    if (sowing) {
      // A-4: light in the agar where the seed lands (also under an equipped trail skin).
      dishFx.pulse(x, y, this.kernelR * LIFE.agarPulseR * (kind === 'big' ? 1.4 : 1), PULSE.sow, LIFE.agarPulse, LIFE.agarPulseS);
      if (!this.trailSkin) {
        this.sow(x, y, kind === 'big');
        return;
      }
    }
    const spec: Record<typeof kind, [number, string, number, number, number]> = {
      // [duration s, colour, max radius, rings, width]
      seed: [0.35, C.accent, base, 2, 2],
      big: [0.35, C.accent, base * 1.6, 3, 2.4],
      auto: [0.36, '#7FA8C0', base * 0.8, 1, 1.2],
      denied: [LIFE.deniedS, C.danger, base * 0.7, 1, 2.2],
      erase: [0.3, C.warn, base * 0.9, 1, 1.6],
      print: [0.5, C.good, base * 1.4, 3, 2],
    };
    const [dur, color, maxR, rings, width] = spec[kind];
    const skin = sowing && this.trailSkin ? this.trailSkin : undefined;
    const rp = this.addRipple(x, y, dur, color, maxR, skin ? skin.rings : rings, width);
    rp.shake = kind === 'denied';
    rp.skin = skin;
    if (skin && !this.reduceMotion) {
      for (const p of trailBurst(skin, kind === 'big' ? 10 : 6)) {
        if (this.skinParticles.length >= MAX_SKIN_PARTICLES) this.skinParticles.shift();
        this.skinParticles.push({ ax: x, ay: y, t0: this.now, p, skin });
      }
    }
  }

  /** A-4 "Sembrar": the drop falls and squashes, the ripple opens, six motes fly out. */
  private sow(x: number, y: number, big: boolean): void {
    const e = this.sows[this.sowHead];
    this.sowHead = (this.sowHead + 1) % MAX_SOWS;
    e.on = true;
    e.x = x;
    e.y = y;
    e.t0 = this.now;
    e.big = big;
    if (!this.reduceMotion) {
      this.pool.burst(x, y, big ? 10 : LIFE.sowMotes, this.now, {
        speed: LIFE.sowSpeed,
        life: LIFE.sowLife,
        size: 6,
        sprite: SPR.disc,
        color: this.c.accent,
        drag: LIFE.drag,
        grav: 0,
        delay: LIFE.rippleT0,
        from: 5,
      });
    }
  }

  private addRipple(x: number, y: number, dur: number, color: string, maxR: number, rings: number, width: number, follow?: number): Ripple {
    const rp = this.ripples[this.rippleHead];
    this.rippleHead = (this.rippleHead + 1) % MAX_RIPPLES;
    rp.on = true;
    rp.x = x;
    rp.y = y;
    rp.t0 = this.now;
    rp.dur = dur;
    rp.color = color;
    rp.maxR = maxR;
    rp.rings = rings;
    rp.width = width;
    rp.shake = false;
    rp.skin = undefined;
    rp.follow = follow;
    return rp;
  }

  /**
   * A tap with no room (it would fuse with nearby matter): a red "no" ring where the finger was, and the
   * reason pinned to the spot (one label at a time). Nothing was charged.
   */
  seedBlocked(x: number, y: number, text: string, sub: string, near?: { x: number; y: number; r: number; id?: number }): void {
    const base = Math.max(22, 13 * this.camera.scale * 1.25);
    const follow = near?.id;
    if (near) {
      // The ring sits on the matter in the way (owner: "a veces dice que hay entidades al lado estando la
      // placa vacía") and follows it while it swims on (QA4 F-13: a swimmer moved off and the ring was left
      // over an empty spot); a small tick marks the finger.
      this.addRipple(near.x, near.y, 0.7, C.danger, Math.max(base * 0.8, near.r * this.camera.scale * 1.15), 2, 2.6, follow);
      this.addRipple(x, y, 0.4, C.danger, base * 0.45, 1, 2).shake = true;
    } else this.addRipple(x, y, 0.55, C.danger, base * 0.95, 2, 2.6).shake = true;
    if (this.now - this.lastBlockedLabel < BLOCKED_LABEL_GAP_S) return;
    this.lastBlockedLabel = this.now;
    // The reason next to the creature in the way when there is one, else at the finger.
    if (near) this.pushLabel({ x: near.x, y: near.y, t0: this.now, dur: 2.4, text, sub, color: C.danger, glyph: null, follow });
    else this.pushLabel({ x, y, t0: this.now, dur: 2.4, text, sub, color: C.danger, glyph: null });
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
      this.pushLabel({ x, y, t0: this.now, dur: 2.4, text: why.text, sub: why.sub, color: '#FF7A5C', glyph: null });
      return;
    }
    this.pushFloat(x, y, 1, costText, '#FF7A5C', 14, 10, true, 0);
  }

  /**
   * "+N" on the paying creature (A-5): 15 px / 600 in the species' colour, rising 22 px. The motes that
   * fly to the counter are src/ui/fx/fly.ts (driven by src/main.ts).
   */
  income(id: number, x: number, y: number, amount: number, format: (n: number) => string, gold: boolean): void {
    const p = this.camera.gridToScreen(x, y);
    if (p.x < -20 || p.y < -20 || p.x > this.w + 20 || p.y > this.h + 20) return;
    // Merge with a fresh float from the same creature instead of stacking.
    for (const f of this.floats) {
      if (f.on && f.cid === id && this.now - f.t0 < 0.8) {
        f.amount = (f.amount ?? 0) + amount;
        this.setFloatText(f, '+' + format(f.amount));
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
      if (!f.on || f.cid === undefined || f.cid === COLLECT_FLOAT || this.now - f.t0 > f.dur * 0.7) continue;
      live++;
      const d = Math.hypot(this.map.px(f.x) - p.x, this.map.py(f.y) - p.y);
      if (d < best) {
        best = d;
        nearest = f;
      }
    }
    if (nearest && (best < MERGE_RADIUS_PX || live >= MAX_INCOME_FLOATS)) {
      nearest.amount = (nearest.amount ?? 0) + amount;
      this.setFloatText(nearest, '+' + format(nearest.amount));
      nearest.t0 = Math.max(nearest.t0, this.now - 0.25);
      nearest.cid = id;
      return;
    }
    const s = this.creatures.get(id);
    const hue = s?.hue;
    const color = gold ? C.gold : hue !== undefined ? hueHex(hue, 82) : '#B8EEFF';
    const f = this.pushFloat(x, y, INCOME_S, '+' + format(amount), color, INCOME_PX, this.reduceMotion ? 0 : INCOME_RISE, false, ((id * 0.618) % 1 - 0.5) * 14);
    f.cid = id;
    f.amount = amount;
    // Born above the body, not on it (the matter is bright: a number on it does not read).
    f.lift = s ? this.bodyRadius(s) * 0.6 : 0;
  }

  speciesBurst(x: number, y: number, title: string, name: string): void {
    this.flash(x, y, C.good, this.c.good, 1.5, false);
    if (!this.reduceMotion) {
      // A-4 "Especie nueva": what a birth gives ×1.5, and a stronger camera.
      this.pool.burst(x, y, Math.round(LIFE.bornSpecies * LIFE.speciesMult), this.now, { speed: [120, 180], life: 1.0, size: 9, sprite: SPR.star, color: this.c.good, drag: LIFE.drag, grav: 20 });
      this.pool.burst(x, y, Math.round(LIFE.bornWhite * LIFE.speciesMult), this.now, { speed: LIFE.bornSpeed, life: LIFE.bornLife, size: 6, sprite: SPR.disc, color: this.c.white, drag: LIFE.drag, grav: 0 });
      this.addSpot(x, y, 1.1);
      dishFx.shake.add(SHAKE.species);
    }
    this.pushLabel({ x, y, t0: this.now, dur: 2.6, text: title, sub: name, color: C.good, glyph: null });
  }

  behaviorLabel(x: number, y: number, b: Behavior, title: string, name: string): void {
    const col = BEHAVIOR_COLOR[b] ?? C.accent;
    const ci = this.atlas.color(col);
    this.flash(x, y, col, ci, 1.2, false);
    if (!this.reduceMotion) this.pool.burst(x, y, 18, this.now, { speed: [60, 110], life: 0.9, size: 8, sprite: SPR.star, color: ci, drag: LIFE.drag, grav: 0 });
    this.pushLabel({ x, y, t0: this.now, dur: 2.2, text: title, sub: name, color: col, glyph: b });
  }

  /**
   * A-4 "Nace": the anticipation releases into a flash (a white disc of 0.8 R, 140 ms), the halo pops
   * 1 → 1.18 → 1, 16 particles of the species' colour and 6 white ones burst, the matter inhales, the
   * camera gets a touch of trauma and a zoom punch.
   */
  stableDing(x: number, y: number): void {
    const s = this.nearest(x, y);
    if (s && s.bornAt < 0) this.startBirth(s);
    else if (!s) this.birthAt(x, y, undefined, this.kernelR * 0.7);
  }

  private startBirth(s: Smoothed): void {
    s.bornFrom = s.antAt >= 0 && !this.reduceMotion ? LIFE.anticipateScale : 1;
    s.bornAt = this.now;
    s.pulseAt = this.now;
    const e = this.exactPos(s, s.id, performance.now());
    this.birthAt(e ? e.x : s.x, e ? e.y : s.y, s.hue, s.r);
  }

  private birthAt(x: number, y: number, hue: number | undefined, r: number): void {
    if (dishFx.matterFade < 0.05) return; // an unlit culture (A-6): its light comes with the reveal
    const body = Math.max(8, r * 1.7 * this.camera.scale);
    this.flash(x, y, '#ffffff', this.c.white, (body * LIFE.flashR) / 18, true);
    dishFx.pulse(x, y, Math.max(this.kernelR, r * 2.2), PULSE.birth, LIFE.inhale, LIFE.inhaleS);
    if (this.reduceMotion) return;
    const ci = hue !== undefined ? this.hueColor(hue) : this.c.accent;
    this.pool.burst(x, y, LIFE.bornSpecies, this.now, { speed: LIFE.bornSpeed, life: LIFE.bornLife, size: 8, sprite: SPR.disc, color: ci, drag: LIFE.drag, grav: 0, from: body * 0.5 });
    this.pool.burst(x, y, LIFE.bornWhite, this.now, { speed: LIFE.bornSpeed, life: LIFE.bornLife * 0.8, size: 5, sprite: SPR.disc, color: this.c.white, drag: LIFE.drag, grav: 0, from: body * 0.4 });
    dishFx.shake.add(SHAKE.born);
    dishFx.shake.punch();
  }

  explodedPulse(x: number, y: number): void {
    this.flash(x, y, C.warn, this.c.warn, 1.8, false);
  }

  dividedPulse(x: number, y: number): void {
    this.addRipple(x, y, 0.6, BEHAVIOR_COLOR.divider, 40, 2, 1.6);
  }

  bornRing(x: number, y: number): void {
    this.addRipple(x, y, 0.5, '#6F8FA8', 26, 1, 1);
  }

  /** A-4 "Muere / se disuelve": the matter greys and dims, ten grey motes rise 18 px, a 1 px ring. */
  puff(x: number, y: number): void {
    const s = this.nearest(x, y);
    dishFx.pulse(x, y, Math.max(this.kernelR, (s?.r ?? this.kernelR * 0.6) * 2.4), PULSE.dissolve, 1, DISSOLVE_MS / 1000);
    this.addRipple(x, y, DISSOLVE_MS / 1000, '#7D8790', 24, 1, 1);
    if (this.reduceMotion) return;
    const r0 = s ? Math.max(6, s.r * 1.2 * this.camera.scale) : 10;
    this.pool.burst(x, y, LIFE.dissolveMotes, this.now, {
      speed: [LIFE.dissolveRise * LIFE.drag * 0.8, LIFE.dissolveRise * LIFE.drag * 1.2],
      life: DISSOLVE_MS / 1000,
      size: 6,
      sprite: SPR.disc,
      color: this.c.grey,
      drag: LIFE.drag,
      grav: 0,
      dir: -Math.PI / 2,
      spread: 1.3,
      from: r0,
    });
  }

  /** A-7 "Recoger": a 60 ms hold, the star swells into a golden flash, 24 + 6 particles, trauma. */
  goldenCollected(x: number, y: number, reward: string): void {
    if (!this.sparkSkin) this.spark.finish('collected', this.now);
    else this.flash(x, y, C.gold, this.c.gold, 2.2, false);
    if (!this.reduceMotion) {
      this.hold = SPARK.holdS;
      const sk = this.sparkSkin?.particles[0];
      const gold = sk ? this.atlas.color(sk) : this.c.gold;
      this.pool.burst(x, y, SPARK.goldN, this.now + SPARK.holdS, { speed: [50, 230], life: 1.0, size: 10, sprite: SPR.star, color: gold, drag: 2, grav: 30 });
      this.pool.burst(x, y, SPARK.whiteN, this.now + SPARK.holdS, { speed: [90, 140], life: 0.6, size: 6, sprite: SPR.disc, color: this.c.white, drag: LIFE.drag, grav: 0 });
      dishFx.shake.add(SHAKE.spark);
    }
    this.pushLabel({ x, y, t0: this.now, dur: 2.4, text: reward, sub: '', color: C.gold, glyph: null });
    this.golden = null;
    this.goldenTrail = [];
  }

  /** A-7 "Perder": it shrinks away and six motes fall (no trauma). */
  private loseSpark(x: number, y: number): void {
    this.spark.finish('lost', this.now);
    if (!this.reduceMotion) this.pool.burst(x, y, SPARK.loseN, this.now, { speed: [10, 30], life: 0.9, size: 7, sprite: SPR.disc, color: this.c.gold, drag: 1.2, grav: 60, dir: Math.PI / 2, spread: 2.4 });
  }

  goldenSpawned(x: number, y: number): void {
    if (this.sparkSkin) {
      if (!this.reduceMotion) this.pool.burst(x, y, 16, this.now, { speed: [30, 80], life: 0.8, size: 7, sprite: SPR.star, color: this.atlas.color(this.sparkSkin.particles[0] ?? C.gold), drag: LIFE.drag, grav: 0 });
      return;
    }
    // The announcement (A-7) plays first; the star appears after it.
    this.spark.spawn(x, y, this.now);
  }

  /** Long-press charge ring at a CSS-pixel point (cleared on release/fire). */
  chargeStart(px: number, py: number): void {
    this.charge = { x: px, y: py, t0: this.now };
    dishFx.pointerDown = true;
  }

  chargeEnd(): void {
    this.charge = null;
  }

  // ───────────────────────────── internals ─────────────────────────────

  private nearest(x: number, y: number): Smoothed | null {
    let best: Smoothed | null = null;
    let bd = Infinity;
    for (const s of this.creatures.values()) {
      const d = Math.hypot(this.camera.deltaX(s.x - x), this.camera.deltaY(s.y - y));
      if (d < bd && d < Math.max(8, s.r * 3)) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  private hueColor(hue: number): number {
    const k = Math.round(hue);
    let i = this.hueIdx.get(k);
    if (i === undefined) {
      i = this.atlas.color(hueHex(k, 66));
      this.hueIdx.set(k, i);
    }
    return i;
  }

  private pushLabel(l: Label): void {
    this.labels.push(l);
    if (this.labels.length > 12) this.labels.shift();
  }

  private pushFloat(x: number, y: number, dur: number, text: string, color: string, size: number, rise: number, drop: boolean, jitter: number): Float {
    const f = this.floats[this.floatHead];
    this.floatHead = (this.floatHead + 1) % MAX_FLOATS;
    f.on = true;
    f.x = x;
    f.y = y;
    f.t0 = this.now;
    f.dur = dur;
    f.color = color;
    f.size = size;
    f.rise = rise;
    f.drop = drop;
    f.jitter = jitter;
    f.lift = 0;
    f.cid = undefined;
    f.amount = undefined;
    f.text = '';
    this.setFloatText(f, text);
    return f;
  }

  /** Text and its width, measured only when the text changes. */
  private setFloatText(f: Float, text: string): void {
    if (text === f.text) return;
    f.text = text;
    this.ctx.font = this.floatFont(f.size);
    f.tw = this.ctx.measureText(text).width;
  }

  private fonts = new Map<number, string>();
  private floatFont(size: number): string {
    let s = this.fonts.get(size);
    if (!s) {
      s = `${size === INCOME_PX ? 600 : 700} ${size}px ${SANS}`;
      this.fonts.set(size, s);
    }
    return s;
  }

  private flash(x: number, y: number, css: string, color: number, r: number, quick: boolean): void {
    const f = this.flashes[this.flashHead];
    this.flashHead = (this.flashHead + 1) % MAX_FLASHES;
    f.on = true;
    f.x = x;
    f.y = y;
    f.t0 = this.now;
    f.css = css;
    f.color = color;
    f.r = r;
    f.quick = quick;
  }

  private addSpot(x: number, y: number, dur: number): void {
    const sp = this.spots[this.spotHead];
    this.spotHead = (this.spotHead + 1) % MAX_SPOTS;
    sp.on = true;
    sp.x = x;
    sp.y = y;
    sp.t0 = this.now;
    sp.dur = dur;
  }

  private haloRadius(s: Smoothed): number {
    return Math.max(7, s.r * 1.9) * this.camera.scale + 3;
  }

  /** The creature's outline on screen (CSS px): the extent of its matter (deflector extentK 1.9). */
  private outlineRadius(s: Smoothed): number {
    return Math.max(7, s.r * 1.9) * this.camera.scale;
  }

  /** The visible body's radius on screen (CSS px): the forming halo and the birth light hug it. */
  private bodyRadius(s: Smoothed): number {
    return Math.max(8, s.r * 1.7 * this.camera.scale);
  }

  /** Clip rect for dish-attached drawing (the dish at zoom 1, the whole view when zoomed). */
  private readonly rect = { x: 0, y: 0, w: 0, h: 0 };
  private dishRect(): { x: number; y: number; w: number; h: number } {
    const cam = this.camera;
    const round = cam.dish;
    const o = this.rect;
    if (round) {
      // Round dish: the bounding box of the glass (clipped to the view when zoomed in).
      const px = this.map.px(round.cx);
      const py = this.map.py(round.cy);
      const r = round.radius * cam.scale;
      o.x = Math.max(0, px - r);
      o.y = Math.max(0, py - r);
      o.w = Math.min(this.w, px + r) - o.x;
      o.h = Math.min(this.h, py + r) - o.y;
      return o;
    }
    if (cam.zoom > 1.001) {
      o.x = 0;
      o.y = 0;
      o.w = this.w;
      o.h = this.h;
      return o;
    }
    const s = cam.scale;
    o.w = cam.gridW * s;
    o.h = cam.gridH * s;
    o.x = (this.w - o.w) / 2;
    o.y = (this.h - o.h) / 2;
    return o;
  }

  // ───────────────────────────── frame ─────────────────────────────

  draw(time: number, dt: number): void {
    // Effect clock: the Spark's hit-stop holds particles and the Spark still (A-7), not the dish.
    const fdt = this.hold > 0 ? 0 : dt;
    if (this.hold > 0) this.hold -= dt;
    this.now += fdt;
    void time;
    this.applyProfile();
    this.occN = 0;
    this.nameN = 0;
    // The brief is placed first (it is the Momento); every label, number and name here keeps out of it.
    if (this.kept.on) this.occupy(this.kept.l, this.kept.t, this.kept.r, this.kept.b);
    const ctx = this.ctx;
    const cam = this.camera;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // This frame's mapping.
    this.ms = cam.scale;
    this.mcx = cam.cx;
    this.mcy = cam.cy;
    this.mhw = cam.viewW / 2;
    this.mhh = cam.viewH / 2;
    this.mww = cam.dish ? 0 : cam.gridW;
    this.mwh = cam.dish ? 0 : cam.gridH;
    // Camera micro-motion (A-9): the same shift and zoom punch as the dish shader, about the dish centre.
    const sh = dishFx.shake;
    const round = cam.dish;
    const dcx = round ? this.map.px(round.cx) : this.w / 2;
    const dcy = round ? this.map.py(round.cy) : this.h / 2;
    const z = sh.zoom;
    ctx.setTransform(this.dpr * z, 0, 0, this.dpr * z, this.dpr * (dcx * (1 - z) + sh.x), this.dpr * (dcy * (1 - z) + sh.y));
    this.light = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light';
    const scale = cam.scale;
    const rm = this.reduceMotion;

    // Creatures: extrapolate the latest (≈10 Hz) report with its velocity
    // (≤ 0.5 s ahead), then glide toward that prediction (~0.25 per 60 Hz frame)
    // so names and markers follow fast swimmers without lag or snapping.
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 10);
    const kGlide = 1 - Math.pow(0.75, Math.min(dt, 0.1) * 60);
    const nowMs = performance.now();
    this.frameMs = nowMs;
    const rate = this.paused ? 0 : this.simRate;
    for (const s of this.creatures.values()) {
      const id = s.id;
      const e = this.exactPos(s, id, nowMs);
      if (e) {
        s.x += cam.deltaX(e.x - s.x) * kGlide;
        s.y += cam.deltaY(e.y - s.y) * kGlide;
        continue;
      }
      let px = s.tx;
      let py = s.ty;
      if (rate > 0 && (s.vx || s.vy)) {
        const ahead = Math.min(0.5, Math.max(0, (nowMs - s.at) / 1000)) * rate;
        px = cam.wrapX(s.tx + s.vx * ahead);
        py = cam.wrapY(s.ty + s.vy * ahead);
        s.x = cam.wrapX(s.x + cam.deltaX(px - s.x) * kGlide);
        s.y = cam.wrapY(s.y + cam.deltaY(py - s.y) * kGlide);
      } else {
        s.x = cam.wrapX(s.x + cam.deltaX(px - s.x) * k);
        s.y = cam.wrapY(s.y + cam.deltaY(py - s.y) * k);
      }
    }
    const g = this.golden;
    if (g) {
      g.x = cam.wrapX(g.x + cam.deltaX(g.tx - g.x) * k);
      g.y = cam.wrapY(g.y + cam.deltaY(g.ty - g.y) * k);
      if (!this.sparkSkin) this.spark.move(g.x, g.y, g.life, this.now);
    }

    const rect = this.dishRect();
    ctx.save();
    ctx.beginPath();
    if (round) {
      // Round dish: dish-attached drawing stays inside the glass (the GPU draws the glass itself).
      ctx.arc(dcx, dcy, round.radius * scale, 0, TAU);
    } else ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();

    if (!round) this.drawDishFrame(rect);
    if (!rm && round) this.drawMotes(dt, dcx, dcy, round.radius * scale);
    this.drawSpots();
    this.drawCreatures(rect, rm, dt);
    this.runLayers('creatures', this.now, dt, rect, scale);
    if (this.dangers.length) this.drawDangers(rm);
    this.drops.draw(ctx, this.atlas, this.now, dt, rm, dishFx.matterFade, this.map.px, this.map.py, this.resolveCreature, cam.zoom);
    this.fillTapScene();
    this.drawFlashes();
    this.drawSows(rm);
    this.drawRipples();
    if (this.arrows.length) this.drawArrows();
    this.pool.step(this.now, fdt);
    ctx.globalCompositeOperation = 'lighter';
    this.pool.draw(ctx, this.atlas, this.now, this.map);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (this.skinParticles.length) this.drawSkinParticles(fdt);
    if (this.sparkSkin) {
      if (g) this.drawGoldenSkin(g, rm, this.sparkSkin);
    } else if (this.spark.on) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = C.gold;
      this.spark.draw(ctx, this.atlas, this.map, this.now, rm, this.c.gold, this.c.white);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    this.drawFloats();
    ctx.restore();
    // Pipettes rest on the rim, half over the glass: drawn unclipped, above the dish's own light.
    if (round && this.pipettes.count) this.pipettes.draw(ctx, this.atlas, nowMs, rm, dcx, dcy, round.radius * scale, this.dpr, dishFx.matterFade);
    if (this.guide.on || this.guide.out >= 0) this.drawGuide(rm);
    // Status pills: unclipped (like the labels) so a creature at the dish edge keeps its pill.
    if (this.pillsShown()) this.drawStatusPills(this.now, dt, rm);
    // Labels are drawn unclipped and kept on screen, so a creature at the dish edge never cuts them.
    this.drawLabels();
    // Names last: inside the dish, shortened with "…", and hidden where a number or a label already is.
    this.drawNames(rect);

    if (g) this.drawGoldenIndicator(g);
    this.drawCharge();
    this.runLayers('top', this.now, dt, rect, scale);
    ctx.globalAlpha = 1;
  }

  /** Creatures as drawn this frame for the tap router (stable and forming ones; no allocation once warm). */
  private fillTapScene(): void {
    const list = this.tapCreatures;
    let n = 0;
    for (const s of this.creatures.values()) {
      if (s.state === 'dead') continue;
      let c = list[n];
      if (!c) {
        c = { id: 0, x: 0, y: 0, r: 0, state: 'stable', behavior: null };
        list.push(c);
      }
      const e = this.exactPos(s, s.id, this.frameMs);
      c.id = s.id;
      c.x = this.map.px(e ? e.x : s.x);
      c.y = this.map.py(e ? e.y : s.y);
      c.r = this.outlineRadius(s);
      c.state = s.state;
      c.behavior = s.behavior;
      if (n < 64) {
        const k = n * 3;
        this.bodyDiscs[k] = c.x;
        this.bodyDiscs[k + 1] = c.y;
        this.bodyDiscs[k + 2] = c.r;
      }
      n++;
    }
    this.bodyN = this.bodyView.n = Math.min(n, 64);
    this.scene.creatureCount = n;
    this.scene.dropCount = this.drops.tapCount;
  }

  /** Living creatures' bodies as drawn in the latest frame (x, y, r triples, canvas CSS px): the brief steps off them. */
  bodies(): { readonly discs: Float32Array; readonly n: number } {
    return this.bodyView;
  }

  /**
   * A message drawn over this canvas by someone else (the Momento brief), in canvas CSS px, or null when it
   * is gone: labels, numbers and names keep out of it (./labelPlace: two messages never overlap).
   */
  keepClear(box: { l: number; t: number; r: number; b: number } | null): void {
    const k = this.kept;
    k.on = !!box;
    if (!box) return;
    k.l = box.l;
    k.t = box.t;
    k.r = box.r;
    k.b = box.b;
  }

  /** What is under a finger, as drawn in the latest frame (src/ui/dishTap.ts reads it). Reused object. */
  tapScene(): TapScene {
    return this.scene;
  }

  /** The red link between two creatures about to touch (GameView.dangers): it beats at 2 Hz, steady with Reduce motion. */
  private drawDangers(rm: boolean): void {
    const ctx = this.ctx;
    const beat = rm ? 1 : 0.6 + 0.4 * (0.5 + 0.5 * Math.cos(this.now * Math.PI * 4));
    ctx.strokeStyle = C.danger;
    for (const d of this.dangers) {
      const a = this.creatures.get(d.a);
      const b = this.creatures.get(d.b);
      if (!a || !b) continue;
      const ea = this.exactPos(a, a.id, this.frameMs);
      const ax = this.map.px(ea ? ea.x : a.x);
      const ay = this.map.py(ea ? ea.y : a.y);
      const eb = this.exactPos(b, b.id, this.frameMs);
      const bx = this.map.px(eb ? eb.x : b.x);
      const by = this.map.py(eb ? eb.y : b.y);
      const dx = bx - ax;
      const dy = by - ay;
      const L = Math.hypot(dx, dy) || 1;
      const ux = dx / L;
      const uy = dy / L;
      const ra = this.outlineRadius(a);
      const rb = this.outlineRadius(b);
      const urgent = clamp01(1 - d.inS / 2);
      // From outline to outline, with a caliper's end ticks; rings on both bodies.
      const x0 = ax + ux * ra;
      const y0 = ay + uy * ra;
      const x1 = bx - ux * rb;
      const y1 = by - uy * rb;
      ctx.globalAlpha = (0.75 + 0.25 * urgent) * beat;
      ctx.lineWidth = 2 + urgent;
      ctx.beginPath();
      if (L > ra + rb) {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.moveTo(x0 - uy * 5, y0 + ux * 5);
        ctx.lineTo(x0 + uy * 5, y0 - ux * 5);
        ctx.moveTo(x1 - uy * 5, y1 + ux * 5);
        ctx.lineTo(x1 + uy * 5, y1 - ux * 5);
      }
      ctx.stroke();
      ctx.lineWidth = 1.25;
      ctx.globalAlpha = 0.6 * beat;
      ctx.beginPath();
      ctx.arc(ax, ay, ra + 2, 0, TAU);
      ctx.moveTo(bx + rb + 2, by);
      ctx.arc(bx, by, rb + 2, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** The finger guide: start (or move) the 1 px line from swimmer `id` to the finger (overlay px). */
  steerGuide(id: number, x: number, y: number): void {
    const g = this.guide;
    if (!g.on) g.t0 = this.now;
    g.on = true;
    g.id = id;
    g.x = x;
    g.y = y;
    g.out = -1;
  }

  /** The finger of the guide while it is down (overlay px), or null. */
  guidePoint(): { x: number; y: number } | null {
    return this.guide.on ? this.guide : null;
  }

  /** The effect clock (s): effects started from outside line up with the overlay's own. */
  get clock(): number {
    return this.now;
  }

  /** The finger lifted: the guide line fades out (it keeps the heading the swimmer is turning to). */
  steerGuideEnd(): void {
    if (!this.guide.on) return;
    this.guide.on = false;
    this.guide.out = this.now;
  }

  /** Where a creature is drawn (overlay px), for the guide's heading; null when it is gone. Reused object. */
  creatureDrawn(id: number): { x: number; y: number } | null {
    const s = this.creatures.get(id);
    if (!s) return null;
    const e = this.exactPos(s, id, performance.now());
    this.pos2.x = this.map.px(e ? e.x : s.x);
    this.pos2.y = this.map.py(e ? e.y : s.y);
    return this.pos2;
  }
  private readonly pos2 = { x: 0, y: 0 };

  private drawGuide(rm: boolean): void {
    const g = this.guide;
    const s = this.creatures.get(g.id);
    const fade = g.on ? 1 : 1 - (this.now - g.out) / 0.3;
    if (!s || fade <= 0) {
      g.on = false;
      g.out = -1;
      return;
    }
    const e = this.exactPos(s, s.id, this.frameMs);
    const x0 = this.map.px(e ? e.x : s.x);
    const y0 = this.map.py(e ? e.y : s.y);
    const dx = g.x - x0;
    const dy = g.y - y0;
    const L = Math.hypot(dx, dy);
    if (L < 2) return;
    const r = this.outlineRadius(s) + 3;
    const ctx = this.ctx;
    ctx.globalAlpha = 0.85 * fade;
    ctx.strokeStyle = '#eaf4fb';
    ctx.fillStyle = '#eaf4fb';
    ctx.lineWidth = 1;
    ctx.setLineDash(rm ? NO_DASH : ARROW_DASH);
    ctx.lineDashOffset = rm ? 0 : -this.now * 14;
    ctx.beginPath();
    ctx.moveTo(x0 + (dx / L) * r, y0 + (dy / L) * r);
    ctx.lineTo(g.x, g.y);
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
    // The leader's dot at the finger (2.5 px, ARTE-REALISTA §3.8) and the heading tick on the outline.
    ctx.beginPath();
    ctx.arc(g.x, g.y, 2.5, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x0, y0, r, Math.atan2(dy, dx) - 0.35, Math.atan2(dy, dx) + 0.35);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /**
   * Light collected at overlay point (x, y): a "+N" that rises from the drop (merged with one a moment
   * old nearby, so a swipe shows one running total, never a wall of numbers).
   */
  collected(x: number, y: number, amount: number, hue: number, format: (n: number) => string): void {
    const gx = this.mcx + (x - this.mhw) / (this.ms || 1);
    const gy = this.mcy + (y - this.mhh) / (this.ms || 1);
    for (const f of this.floats) {
      if (!f.on || f.cid !== COLLECT_FLOAT || this.now - f.t0 > 0.5) continue;
      if (Math.hypot(this.map.px(f.x) - x, this.map.py(f.y) - y) > 60) continue;
      f.amount = (f.amount ?? 0) + amount;
      this.setFloatText(f, '+' + format(f.amount));
      f.t0 = this.now - 0.02;
      f.x = gx;
      f.y = gy;
      return;
    }
    const f = this.pushFloat(gx, gy, 0.9, '+' + format(amount), hueHex(hue, 82), INCOME_PX + 1, this.reduceMotion ? 0 : 26, false, 0);
    f.cid = COLLECT_FLOAT;
    f.amount = amount;
    f.lift = 6;
  }

  /**
   * A seed that never became stable went dark (docs/CLARIDAD2.md §2.5, QA 071): a grey fade of the
   * matter (600 ms), one grey ring, no particles of any colour, and why, in a 2 s label on the spot.
   * `fade` false: only the label (a living creature already dissolves through `puff`).
   */
  wentDark(x: number, y: number, text: string, fade = true): void {
    if (fade) {
      dishFx.pulse(x, y, this.kernelR * 1.6, PULSE.dissolve, 1, 0.6);
      this.addRipple(x, y, 0.6, '#8e99a4', 22, 1, 1);
    }
    if (text && this.now - this.lastBlockedLabel >= BLOCKED_LABEL_GAP_S * 0.5) {
      this.lastBlockedLabel = this.now;
      this.pushLabel({ x, y, t0: this.now, dur: 2, text, sub: '', color: '#C3CBD3', glyph: null });
    }
  }

  /** A drop got ripe for the first time: "¡Lista!" beside it (1.4 s). */
  ripeLabel(x: number, y: number, text: string): void {
    const gx = this.mcx + (x - this.mhw) / (this.ms || 1);
    const gy = this.mcy + (y - this.mhh) / (this.ms || 1);
    this.pushLabel({ x: gx, y: gy, t0: this.now, dur: 1.4, text, sub: '', color: '#BFE9FA', glyph: null });
  }

  /** The state a creature had when last seen (a death tells a seed from a living creature). */
  stateOf(id: number): CreatureState | null {
    return this.creatures.get(id)?.state ?? null;
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
    ctx.strokeStyle = C.accent;
    ctx.globalAlpha = 0.32 * a;
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
    ctx.globalAlpha = 0.13 * a;
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
    ctx.globalAlpha = 1;
  }

  /** A-8: three layers of motes with parallax against the bench's breathing. */
  private drawMotes(dt: number, cx: number, cy: number, R: number): void {
    const ctx = this.ctx;
    const sh = dishFx.shake;
    ctx.globalCompositeOperation = 'lighter';
    const cyan = this.motesColor ? this.c.moteSkin : this.c.mote;
    const violet = this.motesColor ? this.c.moteSkin : this.c.violet;
    this.motesFx.draw(ctx, this.atlas, this.now, dt, cx, cy, R, sh.breathX, sh.breathY, this.light, cyan, violet);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /** A new species: the dish dims around it for a moment (a pre-rendered spotlight, no gradient per frame). */
  private drawSpots(): void {
    const ctx = this.ctx;
    for (const sp of this.spots) {
      if (!sp.on) continue;
      const t = (this.now - sp.t0) / sp.dur;
      if (t >= 1) {
        sp.on = false;
        continue;
      }
      const env = t < 0.15 ? t / 0.15 : t > 0.7 ? (1 - t) / 0.3 : 1;
      const x = this.map.px(sp.x);
      const y = this.map.py(sp.y);
      const r0 = 34 + 10 * easeOutCubic(clamp01(t * 2));
      const R = r0 * 2.6;
      this.spotImg ??= spotSprite();
      ctx.globalAlpha = 0.6 * env;
      ctx.drawImage(this.spotImg, Math.round(x - R), Math.round(y - R), R * 2, R * 2);
      // Beyond the sprite: the same night.
      ctx.fillStyle = '#040609';
      ctx.fillRect(0, 0, this.w, Math.max(0, y - R));
      ctx.fillRect(0, y + R, this.w, Math.max(0, this.h - y - R));
      ctx.fillRect(0, y - R, Math.max(0, x - R), R * 2);
      ctx.fillRect(x + R, y - R, Math.max(0, this.w - x - R), R * 2);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Where the matter is right now: the body of the latest snapshot moved on by the steps the dish
   * really ran (src/ui/fx/tracks.ts, fed by src/main.ts), or, without a track, the latest detector
   * position pushed forward by its velocity. Null when that cannot be known exactly (stale report
   * while running, or a creature that moves without a reported velocity): then no ring is drawn.
   * The returned object is reused: read it at once.
   */
  private exactPos(s: Smoothed, id: number, nowMs: number): { x: number; y: number } | null {
    if (id >= 0) {
      const t = dishFx.tracks.at(id, dishFx.simStep);
      if (t) {
        this.pos.x = t.x;
        this.pos.y = t.y;
        return this.pos;
      }
    }
    const rate = this.paused ? 0 : this.simRate;
    const age = Math.max(0, (nowMs - s.at) / 1000);
    if (!s.vx && !s.vy) {
      if (s.jump > 1.5 && rate > 0 && age < 0.6) return null;
      this.pos.x = s.tx;
      this.pos.y = s.ty;
      return this.pos;
    }
    if (rate > 0 && age > 0.5) return null;
    const ahead = age * rate;
    this.pos.x = this.camera.wrapX(s.tx + s.vx * ahead);
    this.pos.y = this.camera.wrapY(s.ty + s.vy * ahead);
    return this.pos;
  }

  private drawCreatures(rect: { x: number; y: number; w: number; h: number }, rm: boolean, dt: number): void {
    const ctx = this.ctx;
    const nowMs = performance.now();
    const vis = dishFx.matterFade;
    dishFx.beginForming();
    // No permanent ring: state is told by the small label under each creature (while the dish is
    // not crowded). A ring appears only around the selected creature and as a short pulse when one
    // becomes stable or is a new species — always at the exact matter position, or not at all.
    let labelled = 0;
    for (const c of this.creatures.values()) if (c.state === 'stable' || c.state === 'born') labelled++;
    const showLabels = vis > 0.5 && labelled > 0 && labelled <= MAX_NAMED_CREATURES;
    void rect;
    for (const s of this.creatures.values()) {
      const id = s.id;
      // Labels and markers follow the matter itself when its position is known exactly.
      const e = this.exactPos(s, id, nowMs);
      const gx = e ? e.x : s.x;
      const gy = e ? e.y : s.y;
      const x = this.map.px(gx);
      const y = this.map.py(gy);
      const R = this.haloRadius(s);
      if (s.state === 'born') this.drawForming(s, x, y, gx, gy, rm, vis, dt);
      if (s.bornAt >= 0) this.drawBirthHalo(s, x, y, rm, vis);
      if (vis <= 0.02) continue;
      if (s.state === 'stable') {
        if (this.markers && s.behavior) this.drawMarker(x + R * 0.71, y - R * 0.71, s.behavior, s.hx, s.hy, s.hue, this.now, rm);
        // A bare "Estable" under it would repeat its status pill: the name line waits for a species.
        // One label per creature: a creature with a status pill has no name line under it.
        if (showLabels && !(this.pillsShown() && this.statusLayer.hasPill(id)) && (s.name || s.behavior || !this.pillsShown())) this.queueName(x, y + R + 4, id === this.selectedId ? s : null, this.nameText(s), s.hue !== undefined ? hueHex(s.hue, 78) : '#C9D6E2');
      } else if (s.state === 'born') {
        // The progress arc says how far along it is; the status pill (when on) says it in words.
        if (showLabels && !this.pillsShown()) this.queueName(x, y + Math.min(R, 28) + 4, null, this.bornText, '#9FB8CC');
      } else if (s.state === 'exploded') {
        // Shapeless matter: a warm glow pulsing from its centre (sprites, no gradient per frame).
        const pulse = rm ? 0.6 : 0.55 + 0.45 * Math.sin(this.now * TAU * 1.1 + s.phase * 6);
        const rr = Math.max(R * 1.3, 20);
        ctx.globalCompositeOperation = 'lighter';
        this.atlas.draw(ctx, SPR.disc, this.c.warn, x, y, rr * 2, 0.34 * pulse * vis);
        this.atlas.draw(ctx, SPR.disc, this.c.danger, x, y, rr * 2.6, 0.14 * pulse * vis);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }

      const selected = id === this.selectedId;
      const pulseAge = s.pulseAt >= 0 ? this.now - s.pulseAt : Infinity;
      const pulsing = s.state === 'stable' && pulseAge >= 0 && pulseAge < RING_PULSE_S;
      if (!selected && !pulsing) continue;
      if (!e) continue;
      const hc = s.hue !== undefined ? hueHex(s.hue) : C.accent;
      if (pulsing) {
        const u = pulseAge / RING_PULSE_S;
        const a = Math.pow(1 - u, 1.5) * vis;
        if (this.haloSkin) {
          ctx.save();
          ctx.globalAlpha = a;
          drawHalo(ctx, x, y, R, this.now, this.haloSkin, { phase: s.phase, reduceMotion: rm });
          ctx.restore();
        } else {
          const rr = R + (rm ? 2 : 2 + 12 * Math.sqrt(u));
          ctx.strokeStyle = hc;
          ctx.lineWidth = 5;
          ctx.globalAlpha = 0.1 * a;
          ctx.beginPath();
          ctx.arc(x, y, rr, 0, TAU);
          ctx.stroke();
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.6 * a;
          ctx.beginPath();
          ctx.arc(x, y, rr, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      if (selected) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = hc;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(x, y, R + 3, 0, TAU);
        ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#FFFFFF';
        ctx.globalAlpha = 0.8;
        ctx.setLineDash(DASH);
        ctx.lineDashOffset = rm ? 0 : this.now * 10;
        ctx.beginPath();
        ctx.arc(x, y, R + 7, 0, TAU);
        ctx.stroke();
        ctx.setLineDash(NO_DASH);
        ctx.globalAlpha = 1;
      }
    }
    dishFx.endForming();
  }

  /**
   * A-4 "Incubando": the halo beats faster as the creature forms (1.2 s → 0.45 s), a progress arc
   * follows the real progress without jumps, and from 92 % the halo draws in (anticipation). The
   * matter itself beats too (the shader, through dishFx).
   */
  private drawForming(s: Smoothed, x: number, y: number, gx: number, gy: number, rm: boolean, vis: number, dt: number): void {
    const ctx = this.ctx;
    const ahead = dishFx.simStep > 0 ? Math.max(0, dishFx.simStep - s.ageStep) : 0;
    const p = Math.min(0.995, (s.age + ahead) / STABLE_AGE_STEPS);
    s.arc ??= new IncubationArc(); // once per creature, not per frame
    s.arc.target(p);
    s.arc.update(dt);
    if (!rm) s.beat += Math.min(dt, 0.1) / beatPeriod(p);
    if (p >= LIFE.anticipateAt && s.antAt < 0) s.antAt = this.now;
    const ant = s.antAt >= 0 && !rm ? anticipation(p, this.now - s.antAt) : 1;
    const body = this.bodyRadius(s);
    const ci = s.hue !== undefined ? this.hueColor(s.hue) : this.c.accent;
    // The halo: a soft light around the body, beating.
    ctx.globalCompositeOperation = 'lighter';
    this.atlas.draw(ctx, SPR.disc, ci, x, y, body * 2.7 * ant, beatValue(s.beat, p, rm) * vis);
    ctx.globalCompositeOperation = 'source-over';
    // The progress arc: a faint track and the arc itself, from the top, clockwise.
    const ar = body * 1.15 * ant + LIFE.arcGapPx;
    const css = s.hue !== undefined ? hueHex(s.hue, 70) : C.accent;
    ctx.strokeStyle = css;
    ctx.lineWidth = LIFE.arcWidth;
    ctx.lineCap = 'round';
    ctx.globalAlpha = LIFE.arcTrackAlpha * vis;
    ctx.beginPath();
    ctx.arc(x, y, ar, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = LIFE.arcAlpha * vis;
    ctx.beginPath();
    ctx.arc(x, y, ar, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.005, s.arc.value));
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.globalAlpha = 1;
    // The matter's own heartbeat (brightness offset at the beat's amplitude).
    const amp = (beatAmp(p) / LIFE.beatAmp1) * LIFE.matterBeat * (rm ? 0 : 1);
    dishFx.addForming(gx, gy, Math.max(this.kernelR * 0.8, s.r * 2.2), amp * (beatWave(s.beat) - 0.5) * 2);
  }

  /** A-4: the halo pops 1 → 1.18 → 1 from the anticipation's 0.9 and fades. */
  private drawBirthHalo(s: Smoothed, x: number, y: number, rm: boolean, vis: number): void {
    const t = this.now - s.bornAt;
    const end = LIFE.popS + 0.35;
    if (t > end) {
      s.bornAt = -1;
      return;
    }
    const sc = rm ? 1 : birthHalo(t, s.bornFrom);
    const fade = 1 - clamp01((t - LIFE.popS * 0.4) / (end - LIFE.popS * 0.4));
    const ci = s.hue !== undefined ? this.hueColor(s.hue) : this.c.accent;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    this.atlas.draw(ctx, SPR.disc, ci, x, y, this.bodyRadius(s) * 2.7 * sc, 0.55 * fade * vis);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
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
  private nameCache = new WeakMap<Smoothed, { base: string; beh: string; text: string }>();
  private nameText(s: Smoothed): string {
    const base = s.name ?? stateName('stable');
    const beh = s.behavior ? behaviorName(s.behavior) : '';
    const c = this.nameCache.get(s);
    if (c && c.base === base && c.beh === beh) return c.text;
    // "Nadadora celeste · Nadadora" says it twice: a name that already holds the behaviour stands alone.
    const text = beh && !base.toLowerCase().includes(beh.toLowerCase()) ? `${base} · ${beh}` : base;
    this.nameCache.set(s, { base, beh, text });
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

  /** Fitted names and their widths, measured once per (text, room) (A-10). */
  private nameFit = new Map<string, { maxW: number; text: string; w: number }>();
  private fittedName(text: string, maxW: number): { text: string; w: number } {
    let f = this.nameFit.get(text);
    if (!f || f.maxW !== maxW) {
      const t = this.fit(text, maxW);
      f = { maxW, text: t, w: this.ctx.measureText(t).width };
      if (this.nameFit.size > 64) this.nameFit.clear();
      this.nameFit.set(text, f);
    }
    return f;
  }

  /**
   * The creature lines, after numbers and labels: the selected creature first, then the rest; each kept
   * inside the dish (moved in, never cut), shortened with "…", and skipped when it would overlap.
   */
  private drawNames(rect: { x: number; y: number; w: number; h: number }): void {
    if (!this.nameN) return;
    const ctx = this.ctx;
    ctx.font = NAME_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(8,10,14,0.85)';
    const maxW = Math.round(Math.min(150, rect.w - 12));
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < this.nameN; i++) {
        const q = this.nameQ[i];
        if ((pass === 0) !== (q.s !== null)) continue;
        const f = this.fittedName(q.text, maxW);
        const w = f.w;
        const x = Math.min(rect.x + rect.w - w / 2 - 4, Math.max(rect.x + w / 2 + 4, q.x));
        const y = Math.min(rect.y + rect.h - 18, q.y);
        if (!this.roomFor(x - w / 2 - 2, y - 1, x + w / 2 + 2, y + 15)) continue;
        this.occupy(x - w / 2 - 2, y - 1, x + w / 2 + 2, y + 15);
        ctx.globalAlpha = dishFx.matterFade;
        ctx.strokeText(f.text, x, y);
        ctx.fillStyle = q.color;
        ctx.fillText(f.text, x, y);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Behaviour marker: shape + colour (never colour alone). */
  private drawMarker(x: number, y: number, b: Behavior, hx: number, hy: number, hue: number | undefined, time: number, rm: boolean): void {
    const ctx = this.ctx;
    const col = BEHAVIOR_COLOR[b] ?? C.accent;
    ctx.save();
    ctx.translate(x, y);
    // Dark backing disc for contrast over bright matter, ringed in the species' colour.
    ctx.fillStyle = 'rgba(11,14,18,0.78)';
    ctx.beginPath();
    ctx.arc(0, 0, 7.5, 0, TAU);
    ctx.fill();
    if (hue !== undefined) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = hueHex(hue);
      ctx.stroke();
    }
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
      case 'swimmer': {
        ctx.rotate(Math.atan2(hy, hx));
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

  private drawFlashes(): void {
    const ctx = this.ctx;
    for (const f of this.flashes) {
      if (!f.on) continue;
      const dur = f.quick ? LIFE.flashS : 0.7;
      const t = (this.now - f.t0) / dur;
      if (t >= 1) {
        f.on = false;
        continue;
      }
      const x = this.map.px(f.x);
      const y = this.map.py(f.y);
      ctx.globalCompositeOperation = 'lighter';
      if (f.quick) {
        // Birth: a white disc, 0.9 → 0 (standard).
        this.atlas.draw(ctx, SPR.disc, f.color, x, y, 18 * f.r * 2.4, LIFE.flashA * (1 - easeOutCubic(t)));
        ctx.globalCompositeOperation = 'source-over';
        continue;
      }
      const r = (18 + 30 * easeOutCubic(t)) * f.r * 0.7;
      this.atlas.draw(ctx, SPR.disc, f.color, x, y, r * 2, 0.6 * (1 - t));
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = 2 * (1 - t) + 0.5;
      ctx.strokeStyle = f.css;
      ctx.globalAlpha = 0.7 * (1 - t);
      ctx.beginPath();
      ctx.arc(x, y, r * 0.8, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** A-4 "Sembrar": the drop (white → accent, falling 1.6 → 1, squashing), its ripple, its light. */
  private drawSows(rm: boolean): void {
    const ctx = this.ctx;
    for (const e of this.sows) {
      if (!e.on) continue;
      const t = this.now - e.t0;
      if (t > Math.max(LIFE.rippleT1, LIFE.dropFadeS) + 0.05) {
        e.on = false;
        continue;
      }
      const x = this.map.px(e.x);
      const y = this.map.py(e.y);
      ctx.globalCompositeOperation = 'lighter';
      if (!rm) {
        const d = seedDrop(t);
        if (d.alpha > 0.01) {
          const size = LIFE.dropPx * 2.6 * d.scale * (e.big ? 1.3 : 1);
          if (d.tint < 1) this.atlas.drawScaled(ctx, SPR.disc, this.c.white, x, y, size * d.sx, size * d.sy, d.alpha * (1 - d.tint));
          this.atlas.drawScaled(ctx, SPR.disc, this.c.accent, x, y, size * d.sx, size * d.sy, d.alpha * Math.max(0.35, d.tint));
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      const rp = rippleAt(t, rm);
      if (rp) {
        const k = e.big ? 1.6 : 1;
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = rp.width;
        ctx.globalAlpha = rp.alpha;
        ctx.beginPath();
        ctx.arc(x, y, rp.r * k, 0, TAU);
        ctx.stroke();
        if (e.big && !rm) {
          ctx.globalAlpha = rp.alpha * 0.6;
          ctx.beginPath();
          ctx.arc(x, y, rp.r * k * 0.7, 0, TAU);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawArrows(): void {
    const ctx = this.ctx;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      const t = (this.now - a.t0) / SEED_ARROW_S;
      if (t >= 1) {
        this.arrows.splice(i, 1);
        continue;
      }
      // From the finger to the seed, the short way round the torus.
      const px = this.map.px(a.fx);
      const py = this.map.py(a.fy);
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
      const ex = px + dx * grow;
      const ey = py + dy * grow;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(8,10,14,0.7)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2.4;
      ctx.setLineDash(ARROW_DASH);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
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
      ctx.arc(px, py, 4, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawRipples(): void {
    const ctx = this.ctx;
    for (const rp of this.ripples) {
      if (!rp.on) continue;
      const total = rp.dur + (rp.rings - 1) * 0.07;
      if (this.now - rp.t0 > total) {
        rp.on = false;
        continue;
      }
      if (rp.follow !== undefined) {
        const s = this.creatures.get(rp.follow);
        if (s) {
          rp.x = s.x;
          rp.y = s.y;
        }
      }
      let x = this.map.px(rp.x);
      const y = this.map.py(rp.y);
      if (rp.skin) {
        drawTrailRipple(ctx, x, y, this.now - rp.t0, rp.maxR, rp.skin, rp.dur);
        continue;
      }
      // A refused sowing shakes "no" (A-4): ±3 px, three cycles, settling.
      if (rp.shake && !this.reduceMotion) x += deniedShake(this.now - rp.t0);
      ctx.strokeStyle = rp.color;
      for (let r = 0; r < rp.rings; r++) {
        const t = (this.now - rp.t0 - r * 0.07) / rp.dur;
        if (t < 0 || t > 1) continue;
        // Reduce motion: the ring does not grow, it only fades.
        const rad = this.reduceMotion ? rp.maxR * (1 - r * 0.18) : 3 + (rp.maxR - 3) * easeOutCubic(t) * (1 - r * 0.18);
        ctx.lineWidth = rp.width * (1 - t) + 0.4;
        ctx.globalAlpha = 0.9 * Math.pow(1 - t, 1.4);
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, TAU);
        ctx.stroke();
      }
      // Inner flash for the first 120 ms.
      const t0 = (this.now - rp.t0) / 0.12;
      if (t0 < 1) {
        ctx.fillStyle = rp.color;
        ctx.globalAlpha = 0.28 * (1 - t0);
        ctx.beginPath();
        ctx.arc(x, y, rp.maxR * 0.35, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Seed-trail particles of an equipped skin (drag + the skin's gravity, src/store/draw.ts). */
  private drawSkinParticles(dt: number): void {
    const d = Math.min(dt, 0.05);
    for (let i = this.skinParticles.length - 1; i >= 0; i--) {
      const sp = this.skinParticles[i];
      const t = (this.now - sp.t0) / sp.p.life;
      if (t >= 1) {
        this.skinParticles.splice(i, 1);
        continue;
      }
      stepTrailParticle(sp.p, sp.skin, d);
      drawTrailParticle(this.ctx, this.map.px(sp.ax), this.map.py(sp.ay), sp.p, sp.skin, t);
    }
  }

  /** Golden spark with an equipped skin: same position, size, life and blink as the default. */
  private drawGoldenSkin(g: NonNullable<Overlay['golden']>, rm: boolean, skin: SparkSkin): void {
    const ctx = this.ctx;
    const time = this.now;
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
        const cols = skin.particles.length ? skin.particles : [skin.core];
        const col = this.atlas.color(cols[Math.floor(this.pool.rand() * cols.length)]);
        this.pool.burst(g.x, g.y, 1, time, { speed: [18, 26], life: 0.9, size: 6, sprite: SPR.star, color: col, drag: 1.2, grav: 10, from: 6 });
      }
    }
    drawSpark(ctx, p.x, p.y, time, skin, { alpha: A, reduceMotion: rm, heading });
  }

  /** When zoomed in and the spark is off-screen, its star points at it from the edge. */
  private drawGoldenIndicator(g: NonNullable<Overlay['golden']>): void {
    const px = this.map.px(g.x);
    const py = this.map.py(g.y);
    const m = 22;
    if (px >= 0 && py >= 0 && px <= this.w && py <= this.h) return;
    const cx = this.w / 2;
    const cy = this.h / 2;
    const a = Math.atan2(py - cy, px - cx);
    const ex = Math.min(this.w - m, Math.max(m, px));
    const ey = Math.min(this.h - m, Math.max(m, py));
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.fillStyle = 'rgba(11,14,18,0.7)';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, TAU);
    ctx.fill();
    // The same star as the Spark (A-7), and a small chevron towards it.
    ctx.globalCompositeOperation = 'lighter';
    this.atlas.draw(ctx, SPR.star, this.c.gold, 0, 0, 18, 1);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.rotate(a);
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    ctx.moveTo(19, 0);
    ctx.lineTo(13, -4);
    ctx.lineTo(13, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawCharge(): void {
    const c = this.charge;
    if (!c) return;
    // Hidden for the first 120 ms so quick taps never flash it.
    const t = (this.now - c.t0 - 0.12) / 0.28;
    if (t <= 0) return;
    const p = Math.min(1, t);
    const ctx = this.ctx;
    const r = 30;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.atlas.draw(ctx, SPR.disc, this.c.accent, c.x, c.y, r * 2.6 * (0.6 + 0.4 * p), 0.22 * p);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#FFFFFF';
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = C.accent;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, -Math.PI / 2, -Math.PI / 2 + p * TAU);
    ctx.stroke();
    ctx.restore();
  }

  private drawFloats(): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const f of this.floats) {
      if (!f.on) continue;
      const t = (this.now - f.t0) / f.dur;
      if (t >= 1) {
        f.on = false;
        continue;
      }
      // Income and collected light share the look (no outline, a long fade); only income follows a creature.
      const income = f.cid !== undefined;
      // A-5: "+N" stays over its creature while it rises (a swimmer does not leave it behind).
      const owner = income && f.cid !== COLLECT_FLOAT ? this.creatures.get(f.cid!) : undefined;
      if (owner) {
        f.x = owner.x;
        f.y = owner.y;
      }
      const fx = this.map.px(f.x);
      const fy = this.map.py(f.y);
      const y = fy - 10 - f.lift - f.rise * easeOutCubic(t);
      const x = fx + f.jitter;
      const fadeAt = income ? 1 - INCOME_FADE : 0.6;
      const a = t < 0.08 ? t / 0.08 : t > fadeAt ? 1 - (t - fadeAt) / (1 - fadeAt) : 1;
      const pop = this.reduceMotion || f.cid === COLLECT_FLOAT ? 1 : 1 + 0.25 * Math.max(0, 1 - t / 0.12);
      const size = f.size;
      ctx.font = this.floatFont(size);
      const tw = f.tw;
      const dropW = f.drop ? size * 0.75 : 0;
      const tx = x + dropW / 2;
      ctx.save();
      if (pop !== 1) {
        ctx.translate(tx, y);
        ctx.scale(pop, pop);
        ctx.translate(-tx, -y);
      }
      ctx.globalAlpha = a;
      // A-5: the number glows in its creature's colour; a dark stroke only over pale ground (light theme).
      if (!income || this.light) {
        ctx.lineWidth = income ? 2 : 3.5;
        ctx.strokeStyle = 'rgba(8,10,14,0.85)';
        ctx.strokeText(f.text, tx, y);
      }
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, tx, y);
      if (f.drop) this.drawDroplet(tx - tw / 2 - dropW * 0.6, y, size * 0.42, f.color);
      ctx.restore();
      // Names stay out of a number's way while it floats.
      this.occupy(tx - tw / 2 - dropW - 2, y - size / 2 - 2, tx + tw / 2 + 2, y + size / 2 + 2);
    }
    ctx.globalAlpha = 1;
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

  private drawLabels(): void {
    const ctx = this.ctx;
    for (let i = this.labels.length - 1; i >= 0; i--) {
      const L = this.labels[i];
      const t = (this.now - L.t0) / L.dur;
      if (t >= 1) {
        this.labels.splice(i, 1);
        continue;
      }
      if (L.follow !== undefined) {
        const s = this.creatures.get(L.follow);
        const o = L.between !== undefined ? this.creatures.get(L.between) : undefined;
        if (s && o) {
          L.x = (s.x + o.x) / 2;
          L.y = (s.y + o.y) / 2;
        } else if (s) {
          L.x = s.x;
          L.y = s.y;
        }
      }
      const px = this.map.px(L.x);
      const py = this.map.py(L.y);
      const a = t < 0.1 ? t / 0.1 : t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      const lift = this.reduceMotion ? 0 : 14 * easeOutCubic(clamp01(t * 3)) + t * 8;
      const pop = this.reduceMotion ? 1 : 1 + 0.18 * Math.max(0, 1 - t / 0.1);
      // Never wider than the screen: long words end in "…" (docs/ARTE.md §10). Measured once.
      const maxText = Math.max(60, this.w - 48);
      let fit = L.fit;
      if (!fit || fit.maxW !== maxText) {
        ctx.font = LABEL_FONT;
        const text = this.fit(L.text, maxText - (L.glyph ? 18 : 0));
        const w1 = ctx.measureText(text).width;
        ctx.font = LABEL_SUB_FONT;
        const sub = L.sub ? this.fit(L.sub, maxText) : '';
        const w2 = sub ? ctx.measureText(sub).width : 0;
        fit = L.fit = { text, sub, w1, w2, maxW: maxText };
      }
      const glyphW = L.glyph ? 18 : 0;
      const W = Math.max(fit.w1 + glyphW, fit.w2) + 24;
      const H = fit.sub ? 44 : 28;
      // On screen, off every other message (the brief included) and off living creatures while the dish has
      // room (./labelPlace). Newest first: when no slot is free of messages the older label waits.
      const rq = this.labelReq;
      rq.x = px;
      rq.y = py;
      rq.w = W;
      rq.h = H;
      rq.gap = 40 + lift;
      rq.bounds.l = 6;
      rq.bounds.t = 6;
      rq.bounds.r = this.w - 6;
      rq.bounds.b = this.h - 6;
      rq.slot = L.slot ?? -1;
      const ob = this.labelObs;
      ob.nBoxes = this.occN;
      ob.nDiscs = this.bodyN;
      const at = this.labelOut;
      if (!placeLabel(rq, ob, at)) continue;
      L.slot = at.slot;
      const x = at.x;
      const y = at.y;
      this.occupy(x - W / 2, y - H / 2, x + W / 2, y + H / 2);
      ctx.save();
      if (pop !== 1) {
        ctx.translate(x, y);
        ctx.scale(pop, pop);
        ctx.translate(-x, -y);
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(11,14,18,0.86)';
      roundRect(ctx, x - W / 2, y - H / 2, W, H, H / 2 > 14 ? 14 : H / 2);
      ctx.fill();
      ctx.strokeStyle = L.color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = a * 0.75;
      ctx.stroke();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = LABEL_FONT;
      ctx.fillStyle = L.color;
      const ty = fit.sub ? y - 8 : y + 0.5;
      ctx.fillText(fit.text, x + glyphW / 2, ty);
      if (L.glyph) this.drawMarker(x - fit.w1 / 2 - 4 + glyphW / 2 - 6, ty, L.glyph, 1, 0, undefined, this.now, this.reduceMotion);
      if (fit.sub) {
        ctx.font = LABEL_SUB_FONT;
        ctx.fillStyle = C.text;
        ctx.fillText(fit.sub, x, y + 10);
      }
      ctx.restore();
    }
  }
}

/** `Float.cid` of a collected-light number (never a creature id: those are ≥ 0). */
const COLLECT_FLOAT = -7;
const NO_DANGERS: readonly { a: number; b: number; inS: number }[] = [];

const NAME_FONT = `600 12px ${SANS}`;
const LABEL_FONT = `700 14px ${SANS}`;
const LABEL_SUB_FONT = `500 12px ${SANS}`;
const DASH = [2, 4];
const ARROW_DASH = [5, 4];
const NO_DASH: number[] = [];

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

