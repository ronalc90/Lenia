/**
 * The juice of a tap (ADR-031, docs/MECANICAS.md §1.2, §3.2): what a finger on a creature looks like, so that
 * tapping a lot feels like an instrument answering, never like a punishment.
 *
 *  - **The glow.** A tapped dinoflagellate flashes: light rises in a few tens of ms and fades in a couple of
 *    hundred (MECANICAS §1.4). The creature flashes for 250 ms in its own colour, and its halo *charges*: each
 *    tap adds to it, it drains in 300 ms, so a quick run of taps visibly fills it (§3.3: «el halo sube con cada
 *    toque y baja en 300 ms»). Drawn on the overlay; the field is never written (§7.2).
 *  - **«+N».** Rises from above the body in the creature's colour, 4 % larger per hit of the streak up to ×1,4
 *    (§3.2). Faster than six taps a second, the numbers of one creature merge in 1/6 s windows (§7.3: never a
 *    wall of numbers).
 *  - **¡Chispazo!** Every N-th hit (the game says which): a warm-white label with what it paid, a 60 ms
 *    hit-stop, a ring of light and a kick of the dish (the overlay does the last two through src/ui/fx/shake.ts
 *    and src/ui/fx/stage.ts). No «+N» of its own: the label says it.
 *  - **Glimmers** (GameView.motes): thrown from the creature to where the game put them (280 ms), a small hot
 *    core with a soft glow that twinkles under 3 Hz like an instrument's LED; caught, a meniscus ring opens
 *    where it was; not caught, it sinks into the agar (the game turns it into a loose drop: light shown is
 *    never taken away).
 *  - **Grey** (a forming seed, a shapeless blob): a dim grey blink, «aún no brilla». **Ripple** (empty agar): two
 *    fine water rings.
 *
 * Reduce motion: no growth, no rise, no hit-stop, no kick, no throw (glimmers appear in place), no twinkle;
 * light still flashes and fades (§3.5).
 *
 * Frames allocate nothing: fixed pools (≤ 24 numbers, ≤ 16 glows, ≤ 15 glimmers, ≤ 4 Chispazos, ≤ 12 marks),
 * colours as atlas indices cached per hue, texts cached per amount and fonts per size; `allocations` counts
 * every cache entry or object made, so a test can hold it still.
 */
import type { CreatureResolver } from './drops';
import type { Projector } from './particles';
import { SPR, type SpriteAtlas } from './sprites';
import type { TapMote } from '../dishTap';

export const PULSE_FX = {
  // ── The glow (MECANICAS §1.4, §3.1: «brilla 250 ms») ──
  glowS: 0.25,
  /** The flash peaks this soon (s): light, not a cartoon pop. */
  glowRiseS: 0.025,
  /** Peak opacity of the glow and its size (× the body's radius on screen). */
  glowAlpha: 0.85,
  glowR: 2.4,
  /** The hot white core of the flash (× body radius, peak opacity). */
  coreR: 1.15,
  coreAlpha: 0.5,
  /**
   * The matter itself lights up too (a display pulse of the dish shader, src/ui/fx/stage.ts; the field is never
   * written): this much brighter for this long, at most one every tapFlareGapS (the shader keeps 4 pulses).
   */
  tapFlare: 0.25,
  tapFlareS: 0.25,
  tapFlareGapS: 0.15,
  /** Halo charge: +this per tap (0..1), each level drained to 0 in chargeS (§3.3). */
  chargeStep: 0.25,
  chargeS: 0.3,
  /** At full charge the glow is this much larger and the halo ring this bright. */
  chargeGrow: 0.2,
  ringAlpha: 0.7,

  // ── «+N» (§3.2: «crece un 4 % por toque (tope ×1,4)») ──
  numPx: 15,
  numS: 0.75,
  numRise: 28,
  /** Fades over the last share of its life. */
  numFade: 0.35,
  growPerHit: 0.04,
  growMax: 1.4,
  /** Above six taps a second, a creature's numbers merge in windows this long (s, §7.3). */
  mergeS: 1 / 6,
  /** Numbers of a run alternate this far left and right (px), so a fountain stays readable. */
  numJitterPx: 9,

  // ── ¡Chispazo! (§3.2: «Hit-stop de 60 ms, sacudida de 0,15 y un acorde») ──
  chispazoPx: 22,
  chispazoS: 1.2,
  chispazoRise: 16,
  /** Warm white: a lamp near 3600 K (ARTE-REALISTA §6.1 lamp.3600 lightened), never the Destello's gold. */
  chispazoColor: '#FFF1DE',
  /** Grows 0.92 → 1 over this long, easing out, never past 1 (instrument motion, ARTE-REALISTA §6.4). */
  chispazoInS: 0.12,
  holdS: 0.06,
  /** The label never goes above this (CSS px from the top of the view): it moves under the creature instead. */
  labelTopPx: 76,
  /** The ring of light: from the outline to ×ringTo of it in ringS. */
  ringS: 0.45,
  ringTo: 1.75,
  /** Decorative sparks of the burst (the overlay's particle pool). */
  sparksN: 10,
  /** The matter itself flares (shader life pulse, display only): amount and length. */
  flareAmount: 0.35,
  flareS: 0.3,

  // ── Glimmers (§3.2: «Cinco chispitas del color de la criatura salen a 40–60 px») ──
  /** Touch radius (CSS px): a 72 px target, above the 48 px minimum. */
  motePx: 36,
  moteCorePx: 4.5,
  moteGlowPx: 22,
  /** The ring that marks a glimmer as a target (CSS px, ARTE-REALISTA §3.8 `detail` line). */
  moteRingPx: 8,
  moteThrowS: 0.28,
  /** Twinkle: 2.2 Hz, under the 3/s of an instrument's LED (ARTE-REALISTA §6.4). */
  moteTwinkleHz: 2.2,
  /** In its last share of life it dims as it sinks into the agar. */
  moteSinkShare: 0.25,
  catchS: 0.32,
  settleS: 0.3,

  // ── Grey blink and water ripple (§3.1) ──
  greyS: 0.3,
  rippleS: 0.45,
  rippleR: 26,
  rippleColor: '#BFE3F2',

  // ── Pools ──
  maxGlows: 16,
  maxNums: 24,
  maxMotes: 15,
  maxBursts: 4,
  maxMarks: 12,
} as const;

const TAU = Math.PI * 2;
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const SANS = 'Inter, "Inter Fallback", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
/** The glow's fall: an exponential (a lamp's thermal tail) that reaches exactly 0 at glowS. */
const FALL_K = 2.2;
const FALL_END = Math.exp(-FALL_K);

/** Glow envelope 0..1 at t s after the tap: a 25 ms rise, then an exponential fall to 0 at 250 ms. */
export function glowAt(t: number): number {
  if (!(t >= 0) || t >= PULSE_FX.glowS) return 0;
  if (t < PULSE_FX.glowRiseS) return t / PULSE_FX.glowRiseS;
  const u = (t - PULSE_FX.glowRiseS) / (PULSE_FX.glowS - PULSE_FX.glowRiseS);
  return (Math.exp(-FALL_K * u) - FALL_END) / (1 - FALL_END);
}

/** Halo charge left `elapsed` s after it was `charge`: each level drains linearly to 0 in chargeS. */
export function chargeAt(charge: number, elapsed: number): number {
  if (!(charge > 0)) return 0;
  return charge * Math.max(0, 1 - Math.max(0, elapsed) / PULSE_FX.chargeS);
}

/** Size factor of a «+N» after `hits` of the streak: +4 % a hit, at most ×1,4; 1 with Reduce motion. */
export function numScale(hits: number, reduceMotion: boolean): number {
  if (reduceMotion || !(hits > 0)) return 1;
  return Math.min(PULSE_FX.growMax, 1 + PULSE_FX.growPerHit * hits);
}

/** How far a «+N» has risen at t s (px); 0 with Reduce motion. */
export function numRise(t: number, reduceMotion: boolean): number {
  if (reduceMotion) return 0;
  return PULSE_FX.numRise * easeOutCubic(clamp01(t / PULSE_FX.numS));
}

/** Opacity of a «+N» at t s: a 60 ms fade in, steady, a fade over its last numFade. */
function numAlpha(t: number, dur: number, fade: number): number {
  const u = t / dur;
  if (u < 0 || u >= 1) return 0;
  if (t < 0.06) return t / 0.06;
  const at = 1 - fade;
  return u > at ? 1 - (u - at) / fade : 1;
}

/** Scale of the Chispazo label at t s: 0.92 → 1, easing out, never past 1; 1 with Reduce motion. */
export function chispazoScale(t: number, reduceMotion: boolean): number {
  if (reduceMotion) return 1;
  return 0.92 + 0.08 * easeOutCubic(clamp01(t / PULSE_FX.chispazoInS));
}

/** The Chispazo's hit-stop (s): none with Reduce motion. */
export function hitStop(reduceMotion: boolean): number {
  return reduceMotion ? 0 : PULSE_FX.holdS;
}

/** How far a glimmer has flown from its creature at t s (0..1, easing out); 1 with Reduce motion. */
export function moteThrow(t: number, reduceMotion: boolean): number {
  if (reduceMotion) return 1;
  return easeOutCubic(clamp01(t / PULSE_FX.moteThrowS));
}

/** HSL (h 0..360, s, l 0..1) → '#rrggbb'. */
function hslHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return '#' + ((1 << 24) | (f(0) << 16) | (f(8) << 8) | f(4)).toString(16).slice(1);
}

/** Light of the Luz accent (#5bc0eb) for a creature whose species has no colour yet. */
const DEFAULT_HUE = 197;

interface Glow {
  on: boolean;
  id: number;
  gx: number;
  gy: number;
  t0: number;
  /** Halo charge at t0 (after this tap's step). */
  charge: number;
}

interface Num {
  on: boolean;
  id: number;
  gx: number;
  gy: number;
  t0: number;
  amount: number;
  text: string;
  size: number;
  jitter: number;
  /** Anchored to a glimmer's drawn point (overlay px) rather than a creature, in that glimmer's hue. */
  free: boolean;
  fx: number;
  fy: number;
  hue: number;
}

interface Burst {
  on: boolean;
  id: number;
  gx: number;
  gy: number;
  t0: number;
  text: string;
  /** Width of `text` at chispazoPx (measured once, when first drawn): the label is kept on screen. */
  tw: number;
}

interface Mote {
  /** In use (live, or playing its catch / settle). */
  used: boolean;
  live: boolean;
  id: number;
  gx: number;
  gy: number;
  /** Grid point it was thrown from (its creature then), and when it was first seen (fx s). */
  ox: number;
  oy: number;
  born: number;
  /** Its age and life (s) from the game at the last view, and when that view came (fx s). */
  age: number;
  life: number;
  ageAt: number;
  owner: number | null;
  hue: number;
  /** Drawn this frame at (x, y) overlay px; `placed`: drawn at least once (x, y hold its last point). */
  drawn: boolean;
  placed: boolean;
  x: number;
  y: number;
  /** Caught by the finger (pops), or left to settle (sinks), since `endAt` (fx s). */
  end: 'none' | 'caught' | 'settled';
  endAt: number;
}

interface Mark {
  on: boolean;
  kind: 'grey' | 'ripple';
  id: number;
  gx: number;
  gy: number;
  t0: number;
}

/** A glimmer from GameView.motes. */
export interface MoteIn {
  id: number;
  x: number;
  y: number;
  age: number;
  life: number;
  owner: number | null;
}

/** Writes a creature's grid point into `out`; false when it is gone. */
export type GridResolver = (id: number, out: { x: number; y: number }) => boolean;

export class PulseLayer {
  /** Objects and cache entries made (constructor included): a test holds this still after warm-up. */
  allocations = 0;
  private readonly glows: Glow[];
  private readonly nums: Num[];
  private readonly bursts: Burst[];
  private readonly motes: Mote[];
  private readonly marks: Mark[];
  private numHead = 0;
  private burstHead = 0;
  private markHead = 0;
  /** Numbers launched in a row (alternating jitter). */
  private numSeq = 0;
  /** Glimmers as drawn this frame, for the tap router (reused objects). */
  readonly tap: TapMote[];
  tapCount = 0;
  private readonly hueIdx = new Map<number, number>();
  private readonly cssCache = new Map<number, string>();
  private readonly fonts = new Map<number, string>();
  private readonly plusCache = new Map<number, string>();
  private readonly burstCache = new Map<number, string>();
  private plusFmt: (n: number) => string = (n) => '+' + Math.round(n);
  private burstFmt: (n: number) => string = (n) => '+' + Math.round(n);
  private textKey = '';
  private readonly where = { x: 0, y: 0, r: 0, hue: undefined as number | undefined };
  private readonly grid = { x: 0, y: 0 };
  private readonly out = { x: 0, y: 0, hue: 0 };
  private whiteIdx = -1;
  private warmIdx = -1;
  private greyIdx = -1;

  constructor() {
    this.glows = Array.from({ length: PULSE_FX.maxGlows }, () => ({ on: false, id: 0, gx: 0, gy: 0, t0: 0, charge: 0 }));
    this.nums = Array.from({ length: PULSE_FX.maxNums }, () => ({ on: false, id: 0, gx: 0, gy: 0, t0: 0, amount: 0, text: '', size: PULSE_FX.numPx, jitter: 0, free: false, fx: 0, fy: 0, hue: DEFAULT_HUE }));
    this.bursts = Array.from({ length: PULSE_FX.maxBursts }, () => ({ on: false, id: 0, gx: 0, gy: 0, t0: 0, text: '', tw: 0 }));
    this.motes = Array.from({ length: PULSE_FX.maxMotes }, () => ({
      used: false,
      live: false,
      id: 0,
      gx: 0,
      gy: 0,
      ox: 0,
      oy: 0,
      born: 0,
      age: 0,
      life: 1,
      ageAt: 0,
      owner: null,
      hue: DEFAULT_HUE,
      drawn: false,
      placed: false,
      x: 0,
      y: 0,
      end: 'none' as Mote['end'],
      endAt: 0,
    }));
    this.marks = Array.from({ length: PULSE_FX.maxMarks }, () => ({ on: false, kind: 'grey' as Mark['kind'], id: 0, gx: 0, gy: 0, t0: 0 }));
    this.tap = Array.from({ length: PULSE_FX.maxMotes }, () => ({ id: 0, x: 0, y: 0 }));
    this.allocations += 6;
  }

  /** Pool sizes (fixed). */
  capacity(): { glows: number; nums: number; motes: number; bursts: number; marks: number } {
    return { glows: this.glows.length, nums: this.nums.length, motes: this.motes.length, bursts: this.bursts.length, marks: this.marks.length };
  }

  /**
   * How «+N» and the Chispazo label read (`plus(n)` → "+3", `burst(n)` → "¡CHISPAZO! +25"), for language `key`;
   * a new key empties the text caches.
   */
  setText(plus: (n: number) => string, burst: (n: number) => string, key: string): void {
    this.plusFmt = plus;
    this.burstFmt = burst;
    if (key === this.textKey) return;
    this.textKey = key;
    this.plusCache.clear();
    this.burstCache.clear();
    for (const n of this.nums) n.text = '';
  }

  // ───────────────────────────── events ─────────────────────────────

  /** The finger pulsed creature `id` (grid point gx, gy as a fallback): it glows now, before the game answers. */
  glow(id: number, gx: number, gy: number, now: number): void {
    let g: Glow | null = null;
    for (const x of this.glows) if (x.on && x.id === id) g = x;
    const charge = g ? chargeAt(g.charge, now - g.t0) : 0;
    g ??= this.freeGlow();
    g.on = true;
    g.id = id;
    g.gx = gx;
    g.gy = gy;
    g.t0 = now;
    g.charge = Math.min(1, charge + PULSE_FX.chargeStep);
  }

  /** A glow slot: a free one, else the oldest. */
  private freeGlow(): Glow {
    let oldest = this.glows[0];
    for (const x of this.glows) {
      if (!x.on) return x;
      if (x.t0 < oldest.t0) oldest = x;
    }
    return oldest;
  }

  /** Glow envelope of creature `id` at `now` (0 when it is not glowing). */
  glowing(id: number, now: number): number {
    for (const g of this.glows) if (g.on && g.id === id) return glowAt(now - g.t0);
    return 0;
  }

  /**
   * The game paid `amount` for a pulse of creature `id` (bus 'pulse'), `hits` = the streak after it. A Chispazo
   * gets its label (and returns true: the overlay holds, kicks and flares); otherwise a «+N».
   */
  paid(id: number, gx: number, gy: number, amount: number, hits: number, chispazo: boolean, now: number): boolean {
    if (chispazo) {
      const b = this.bursts[this.burstHead];
      this.burstHead = (this.burstHead + 1) % this.bursts.length;
      b.on = true;
      b.id = id;
      b.gx = gx;
      b.gy = gy;
      b.t0 = now;
      b.text = this.burstText(amount);
      b.tw = 0;
      // The label says what it paid: this creature's numbers in flight make way for it.
      if (id >= 0) for (const n of this.nums) if (n.on && !n.free && n.id === id) n.on = false;
      return true;
    }
    if (!(amount > 0)) return false;
    this.number(id, gx, gy, amount, hits, now, false, 0, 0, DEFAULT_HUE);
    return false;
  }

  /** A glimmer the game says was caught (bus 'moteCaught'): «+N» where it was drawn (else at its grid point). */
  caught(moteId: number, gx: number, gy: number, amount: number, now: number): void {
    if (!(amount > 0)) return;
    const m = this.findMote(moteId);
    if (m && m.placed) this.number(-1, gx, gy, amount, 4, now, true, m.x, m.y, m.hue);
    else this.number(-1, gx, gy, amount, 0, now, false, 0, 0, DEFAULT_HUE);
  }

  private number(id: number, gx: number, gy: number, amount: number, hits: number, now: number, free: boolean, fx: number, fy: number, hue: number): void {
    const size = PULSE_FX.numPx * numScale(hits, false);
    // Faster than six a second: this creature's latest number (< 1/6 s old) takes the amount.
    if (id >= 0) {
      let last: Num | null = null;
      for (const n of this.nums) if (n.on && !n.free && n.id === id && (!last || n.t0 > last.t0)) last = n;
      if (last && now - last.t0 < PULSE_FX.mergeS) {
        last.amount += amount;
        last.text = this.plusText(last.amount);
        last.size = Math.max(last.size, size);
        last.gx = gx;
        last.gy = gy;
        return;
      }
    }
    const n = this.nums[this.numHead];
    this.numHead = (this.numHead + 1) % this.nums.length;
    n.on = true;
    n.id = id;
    n.gx = gx;
    n.gy = gy;
    n.t0 = now;
    n.amount = amount;
    n.text = this.plusText(amount);
    n.size = size;
    n.jitter = (this.numSeq++ % 2 === 0 ? -1 : 1) * PULSE_FX.numJitterPx * (0.5 + 0.5 * ((this.numSeq * 0.618) % 1));
    n.free = free;
    n.fx = fx;
    n.fy = fy;
    n.hue = hue;
  }

  /** Live numbers at `now` (tests, the dev counter). */
  liveNums(now: number): number {
    let k = 0;
    for (const n of this.nums) if (n.on && now >= n.t0 && now - n.t0 < PULSE_FX.numS) k++;
    return k;
  }

  /** Font size of creature `id`'s latest number (0: none). */
  numSize(id: number): number {
    let last: Num | null = null;
    for (const n of this.nums) if (n.on && n.id === id && (!last || n.t0 > last.t0)) last = n;
    return last ? last.size : 0;
  }

  /** A forming seed or a shapeless blob was tapped: a grey blink. */
  grey(id: number, gx: number, gy: number, now: number): void {
    this.mark('grey', id, gx, gy, now);
  }

  /** Empty agar was tapped at grid (gx, gy): two fine water rings. */
  ripple(gx: number, gy: number, now: number): void {
    this.mark('ripple', -1, gx, gy, now);
  }

  private mark(kind: Mark['kind'], id: number, gx: number, gy: number, now: number): void {
    const m = this.marks[this.markHead];
    this.markHead = (this.markHead + 1) % this.marks.length;
    m.on = true;
    m.kind = kind;
    m.id = id;
    m.gx = gx;
    m.gy = gy;
    m.t0 = now;
  }

  // ───────────────────────────── glimmers ─────────────────────────────

  /**
   * The latest view's glimmers (GameView.motes; undefined = none). A new one is thrown from its creature
   * (`owner`'s grid point, else where it lies); one that left the view sinks into the agar if its life was
   * up (the game made it a loose drop), else simply goes.
   */
  setMotes(list: readonly MoteIn[] | undefined, now: number, owner: GridResolver, hueOf?: (owner: number) => number | undefined): void {
    for (const m of this.motes) if (m.used) m.live = false;
    if (list) {
      for (const v of list) {
        let m = this.findMote(v.id);
        if (m && m.end !== 'none') continue; // caught: the game's next view drops it
        if (!m) {
          m = this.freeMote();
          if (!m) continue;
          m.used = true;
          m.id = v.id;
          m.end = 'none';
          m.drawn = false;
          m.placed = false;
          m.owner = v.owner;
          // Seen for the first time at age `age`: born that long ago (a reload shows it where it lies).
          m.born = now - Math.max(0, v.age);
          if (v.owner !== null && owner(v.owner, this.grid)) {
            m.ox = this.grid.x;
            m.oy = this.grid.y;
          } else {
            m.ox = v.x;
            m.oy = v.y;
          }
          const h = v.owner !== null ? hueOf?.(v.owner) : undefined;
          m.hue = h ?? DEFAULT_HUE;
        }
        m.live = true;
        m.gx = v.x;
        m.gy = v.y;
        m.age = v.age;
        m.life = v.life > 0 ? v.life : 1;
        m.ageAt = now;
      }
    }
    for (const m of this.motes) {
      if (!m.used || m.live || m.end !== 'none') continue;
      const age = m.age + (now - m.ageAt);
      if (age >= m.life * 0.9) {
        m.end = 'settled';
        m.endAt = now;
      } else m.used = false;
    }
  }

  /** The finger caught glimmer `id`: it pops where it is drawn now. Returns that point (reused object) or null. */
  take(id: number, now: number): { x: number; y: number; hue: number } | null {
    const m = this.findMote(id);
    if (!m || m.end !== 'none') return null;
    m.end = 'caught';
    m.endAt = now;
    if (!m.placed) return null;
    this.out.x = m.x;
    this.out.y = m.y;
    this.out.hue = m.hue;
    return this.out;
  }

  private findMote(id: number): Mote | null {
    for (const m of this.motes) if (m.used && m.id === id) return m;
    return null;
  }

  private freeMote(): Mote | null {
    for (const m of this.motes) if (!m.used) return m;
    // Full: the oldest settling or caught one makes room.
    let best: Mote | null = null;
    for (const m of this.motes) if (m.end !== 'none' && (!best || m.endAt < best.endAt)) best = m;
    return best;
  }

  // ───────────────────────────── caches ─────────────────────────────

  private plusText(amount: number): string {
    const k = amount >= 1 ? Math.round(amount) : Math.round(amount * 10) / 10;
    let s = this.plusCache.get(k);
    if (s === undefined) {
      if (this.plusCache.size >= 256) this.plusCache.clear();
      s = this.plusFmt(k);
      this.plusCache.set(k, s);
      this.allocations++;
    }
    return s;
  }

  private burstText(amount: number): string {
    const k = amount >= 1 ? Math.round(amount) : Math.round(amount * 10) / 10;
    let s = this.burstCache.get(k);
    if (s === undefined) {
      if (this.burstCache.size >= 64) this.burstCache.clear();
      s = this.burstFmt(k);
      this.burstCache.set(k, s);
      this.allocations++;
    }
    return s;
  }

  private font(px: number, weight: number): string {
    const k = Math.round(px) * 10 + (weight >= 700 ? 1 : 0);
    let s = this.fonts.get(k);
    if (s === undefined) {
      s = `${weight} ${Math.round(px)}px ${SANS}`;
      this.fonts.set(k, s);
      this.allocations++;
    }
    return s;
  }

  private color(atlas: SpriteAtlas, hue: number, light: number): number {
    const k = Math.round(hue / 5) * 5 * 100 + light;
    let i = this.hueIdx.get(k);
    if (i === undefined) {
      i = atlas.color(hslHex(Math.round(hue / 5) * 5, 0.8, light / 100));
      this.hueIdx.set(k, i);
      this.allocations++;
    }
    return i;
  }

  /** '#rrggbb' of hue (rounded to 5°) at lightness `light` %, saturation `sat` %, cached. */
  private css(hue: number, sat: number, light: number): string {
    const h = Math.round(hue / 5) * 5;
    const k = h * 10000 + sat * 100 + light;
    let s = this.cssCache.get(k);
    if (s === undefined) {
      s = hslHex(h, sat / 100, light / 100);
      this.cssCache.set(k, s);
      this.allocations++;
    }
    return s;
  }

  private colorsReady(atlas: SpriteAtlas): void {
    if (this.whiteIdx >= 0) return;
    this.whiteIdx = atlas.color('#ffffff');
    this.warmIdx = atlas.color(PULSE_FX.chispazoColor);
    this.greyIdx = atlas.color('#8e99a4');
    this.allocations++;
  }

  // ───────────────────────────── frame ─────────────────────────────

  /** Where creature `id` is drawn (into this.where), else the grid fallback mapped; false when neither. */
  private place(id: number, gx: number, gy: number, map: Projector, creature: CreatureResolver): boolean {
    const w = this.where;
    if (id >= 0 && creature(id, w)) return true;
    w.x = map.px(gx);
    w.y = map.py(gy);
    w.r = 12;
    w.hue = undefined;
    return false;
  }

  /**
   * The light of the taps (glows, Chispazo rings, glimmers, grey blinks, ripples), additive over the matter.
   * Call after the creatures and the drops; `drawText` comes later, over everything.
   */
  drawLight(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, now: number, rm: boolean, vis: number, map: Projector, creature: CreatureResolver): void {
    this.colorsReady(atlas);
    const w = this.where;
    // Glows: the flash and the charged halo.
    for (const g of this.glows) {
      if (!g.on) continue;
      const t = now - g.t0;
      const env = glowAt(t);
      const c = chargeAt(g.charge, t);
      if (env <= 0 && c <= 0 && t > 0) {
        g.on = false;
        continue;
      }
      if (vis <= 0.02) continue;
      this.place(g.id, g.gx, g.gy, map, creature);
      const hue = w.hue ?? DEFAULT_HUE;
      const body = Math.max(8, w.r * 0.9);
      const grow = rm ? 1 : 1 + PULSE_FX.chargeGrow * c;
      ctx.globalCompositeOperation = 'lighter';
      atlas.draw(ctx, SPR.disc, this.color(atlas, hue, 70), w.x, w.y, body * PULSE_FX.glowR * 2 * grow, PULSE_FX.glowAlpha * env * vis);
      atlas.draw(ctx, SPR.disc, this.whiteIdx, w.x, w.y, body * PULSE_FX.coreR * 2, PULSE_FX.coreAlpha * env * vis);
      ctx.globalCompositeOperation = 'source-over';
      // The halo ring: a fine line at the outline, as bright as the charge (an instrument's gauge, not a pop).
      const a = PULSE_FX.ringAlpha * Math.max(env * 0.6, c) * vis;
      if (a > 0.01) {
        ctx.strokeStyle = this.css(hue, 85, 80);
        ctx.lineWidth = 1 + c;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.r + 2 + (rm ? 0 : 3 * c), 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    // Chispazo rings: a warm ring of light leaving the outline.
    for (const b of this.bursts) {
      if (!b.on) continue;
      const t = now - b.t0;
      if (t >= PULSE_FX.chispazoS) {
        b.on = false;
        continue;
      }
      if (vis <= 0.02 || t >= PULSE_FX.ringS) continue;
      this.place(b.id, b.gx, b.gy, map, creature);
      const u = t / PULSE_FX.ringS;
      const rr = w.r * (rm ? 1.2 : 1 + (PULSE_FX.ringTo - 1) * easeOutCubic(u));
      ctx.globalCompositeOperation = 'lighter';
      atlas.draw(ctx, SPR.disc, this.warmIdx, w.x, w.y, w.r * 3.2, 0.5 * (1 - u) * vis);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = PULSE_FX.chispazoColor;
      ctx.lineWidth = 2 * (1 - u) + 0.75;
      ctx.globalAlpha = 0.85 * (1 - u) * vis;
      ctx.beginPath();
      ctx.arc(w.x, w.y, rr, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    this.drawMotes(ctx, atlas, now, rm, vis, map);
    this.drawMarks(ctx, atlas, now, rm, vis, map, creature);
  }

  private drawMotes(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, now: number, rm: boolean, vis: number, map: Projector): void {
    this.tapCount = 0;
    for (const m of this.motes) {
      if (!m.used) continue;
      m.drawn = false;
      if (m.end === 'caught') {
        const t = (now - m.endAt) / PULSE_FX.catchS;
        if (t >= 1) {
          m.used = false;
          continue;
        }
        if (vis <= 0.02) continue;
        // Caught: a bright flash where it was and two meniscus rings opening (the light went into the finger).
        const ci = this.color(atlas, m.hue, 70);
        const f = 1 - t;
        ctx.globalCompositeOperation = 'lighter';
        atlas.draw(ctx, SPR.disc, ci, m.x, m.y, PULSE_FX.moteGlowPx * 2 * (1 + (rm ? 0 : 0.9 * t)), 0.95 * f * vis);
        atlas.draw(ctx, SPR.disc, this.whiteIdx, m.x, m.y, PULSE_FX.moteCorePx * 4 * f, 0.9 * f * vis);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#e8f6ff';
        for (let r = 0; r < 2; r++) {
          const u = rm ? 0.5 : Math.max(0, t - r * 0.2) / (1 - r * 0.2);
          ctx.lineWidth = 1.5 * (1 - u) + 0.5;
          ctx.globalAlpha = 0.85 * (1 - u) * vis;
          ctx.beginPath();
          ctx.arc(m.x, m.y, PULSE_FX.moteRingPx + (rm ? 6 : 22 * u), 0, TAU);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        continue;
      }
      // Where it is: thrown from its creature to its grid point.
      const k = moteThrow(now - m.born, rm);
      const x = map.px(m.ox + (m.gx - m.ox) * k);
      const y = map.py(m.oy + (m.gy - m.oy) * k);
      if (m.end === 'settled') {
        const t = (now - m.endAt) / PULSE_FX.settleS;
        if (t >= 1) {
          m.used = false;
          continue;
        }
        if (vis > 0.02) {
          ctx.globalCompositeOperation = 'lighter';
          atlas.draw(ctx, SPR.disc, this.color(atlas, m.hue, 70), x, y, PULSE_FX.moteGlowPx * (1 - 0.5 * t), 0.4 * (1 - t) * vis);
          ctx.globalCompositeOperation = 'source-over';
        }
        continue;
      }
      m.drawn = true;
      m.placed = true;
      m.x = x;
      m.y = y;
      if (this.tapCount < this.tap.length) {
        const tp = this.tap[this.tapCount++];
        tp.id = m.id;
        tp.x = x;
        tp.y = y;
      }
      if (vis <= 0.02) continue;
      const age = m.age + (now - m.ageAt);
      const left = 1 - clamp01((age / m.life - (1 - PULSE_FX.moteSinkShare)) / PULSE_FX.moteSinkShare);
      const tw = rm ? 1 : 0.85 + 0.15 * Math.sin(TAU * PULSE_FX.moteTwinkleHz * now + m.id * 1.7);
      ctx.globalCompositeOperation = 'lighter';
      atlas.draw(ctx, SPR.disc, this.color(atlas, m.hue, 70), x, y, PULSE_FX.moteGlowPx * 2, 0.55 * tw * (0.4 + 0.6 * left) * vis);
      atlas.draw(ctx, SPR.disc, this.whiteIdx, x, y, PULSE_FX.moteCorePx * 2 * 1.6, 0.9 * (0.5 + 0.5 * left) * vis);
      ctx.globalCompositeOperation = 'source-over';
      // A fine ring: it is a target (it reads as a thing to catch, not a speck of dust).
      ctx.strokeStyle = this.css(m.hue, 80, 84);
      ctx.lineWidth = 0.75;
      ctx.globalAlpha = 0.55 * left * vis;
      ctx.beginPath();
      ctx.arc(x, y, PULSE_FX.moteRingPx, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawMarks(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, now: number, rm: boolean, vis: number, map: Projector, creature: CreatureResolver): void {
    const w = this.where;
    for (const m of this.marks) {
      if (!m.on) continue;
      const dur = m.kind === 'grey' ? PULSE_FX.greyS : PULSE_FX.rippleS;
      const t = (now - m.t0) / dur;
      if (t >= 1) {
        m.on = false;
        continue;
      }
      if (vis <= 0.02 || t < 0) continue;
      if (m.kind === 'grey') {
        // «Aún no brilla»: a dim grey disc and a fine grey ring on its outline, gone in 300 ms.
        this.place(m.id, m.gx, m.gy, map, creature);
        atlas.draw(ctx, SPR.disc, this.greyIdx, w.x, w.y, w.r * 2.2, 0.22 * (1 - t) * vis);
        ctx.strokeStyle = '#8e99a4';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.7 * (1 - t) * vis;
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.r + 2, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }
      // Water: two fine rings 80 ms apart (Reduce motion: they do not grow, they fade).
      const x = map.px(m.gx);
      const y = map.py(m.gy);
      ctx.strokeStyle = PULSE_FX.rippleColor;
      for (let r = 0; r < 2; r++) {
        const u = (now - m.t0 - r * 0.08) / (dur - 0.08);
        if (u < 0 || u > 1) continue;
        const rad = rm ? PULSE_FX.rippleR * 0.8 : 4 + (PULSE_FX.rippleR - 4) * easeOutCubic(u) * (1 - r * 0.25);
        ctx.lineWidth = 1.25 * (1 - u) + 0.4;
        ctx.globalAlpha = 0.6 * Math.pow(1 - u, 1.4) * vis;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  /**
   * «+N» and the Chispazo labels, over everything and unclipped (a creature at the rim keeps its label, kept
   * inside the `viewW` px wide view).
   */
  drawText(
    ctx: CanvasRenderingContext2D,
    now: number,
    rm: boolean,
    vis: number,
    map: Projector,
    creature: CreatureResolver,
    light: boolean,
    viewW = Infinity,
    liftOf: ((id: number) => number) | null = null,
  ): void {
    const w = this.where;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const n of this.nums) {
      if (!n.on) continue;
      const t = now - n.t0;
      if (t >= PULSE_FX.numS) {
        n.on = false;
        continue;
      }
      if (vis <= 0.02) continue;
      let x: number;
      let y: number;
      let hue: number;
      if (n.free) {
        x = n.fx;
        y = n.fy - 8;
        hue = n.hue;
      } else {
        this.place(n.id, n.gx, n.gy, map, creature);
        x = w.x;
        // Born above the body (and above its status pill, when it has one): the matter is bright.
        y = w.y - w.r * 0.6 - 10 - (liftOf ? liftOf(n.id) : 0);
        hue = w.hue ?? DEFAULT_HUE;
      }
      const a = numAlpha(t, PULSE_FX.numS, PULSE_FX.numFade) * vis;
      if (a <= 0) continue;
      const size = rm ? PULSE_FX.numPx : n.size;
      ctx.font = this.font(size, 600);
      ctx.globalAlpha = a;
      const tx = x + (rm ? 0 : n.jitter);
      const ty = y - numRise(t, rm);
      if (light) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(8,10,14,0.85)';
        ctx.strokeText(n.text, tx, ty);
      }
      ctx.fillStyle = this.css(hue, 70, 82);
      ctx.fillText(n.text, tx, ty);
    }
    for (const b of this.bursts) {
      if (!b.on) continue;
      const t = now - b.t0;
      if (t >= PULSE_FX.chispazoS || vis <= 0.02) continue;
      this.place(b.id, b.gx, b.gy, map, creature);
      const a = numAlpha(t, PULSE_FX.chispazoS, 0.4) * vis;
      if (a <= 0) continue;
      const s = chispazoScale(t, rm);
      const rise = rm ? 0 : PULSE_FX.chispazoRise * easeOutCubic(clamp01(t / PULSE_FX.chispazoS));
      if (b.tw === 0) {
        ctx.font = this.font(PULSE_FX.chispazoPx, 700);
        b.tw = ctx.measureText(b.text).width || 1;
      }
      ctx.font = this.font(PULSE_FX.chispazoPx * s, 700);
      ctx.globalAlpha = a;
      // Above the numbers of the next taps; under the creature when the top of the view has no room (the dish's
      // corner buttons live there); never off the edge of the view.
      let y = w.y - w.r - 34 - rise - (liftOf ? liftOf(b.id) : 0);
      if (y < PULSE_FX.labelTopPx) y = w.y + w.r + 30 + rise;
      const half = b.tw / 2 + 8;
      const x = viewW > 2 * half ? Math.min(viewW - half, Math.max(half, w.x)) : w.x;
      // Over bright matter a fine dark edge keeps it legible (AA on any culture).
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(8,10,14,0.8)';
      ctx.strokeText(b.text, x, y);
      ctx.fillStyle = PULSE_FX.chispazoColor;
      ctx.fillText(b.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  /** Both passes at once (tests; the overlay calls them apart). */
  draw(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, now: number, dt: number, rm: boolean, vis: number, map: Projector, creature: CreatureResolver): void {
    void dt;
    this.drawLight(ctx, atlas, now, rm, vis, map, creature);
    this.drawText(ctx, now, rm, vis, map, creature, false);
  }

  /** Forget everything (a new dish, a new session). */
  clear(): void {
    for (const g of this.glows) g.on = false;
    for (const n of this.nums) n.on = false;
    for (const b of this.bursts) b.on = false;
    for (const m of this.motes) m.used = false;
    for (const m of this.marks) m.on = false;
    this.tapCount = 0;
  }
}
