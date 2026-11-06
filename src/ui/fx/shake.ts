/**
 * A living camera that never makes you dizzy (docs/ARTE-PULIDO.md A-9).
 *
 * Trauma (J4, Eiserloh GDC 2016): events add to a 0..1 value that decays 1.8/s; the offset is
 * 4 px × trauma² × smooth noise at 18 Hz per axis (two seeds), so small events barely show and big
 * ones do; no rotation. A birth also gives a zoom punch 1 → 1.012 → 1 in ~300 ms with the default
 * spatial spring (M5: 380 / 0.8). Never while a finger drags or long-presses, never with Reduce
 * motion, never more than 4 px.
 *
 * Applied where it costs nothing and never moves the grid camera (touches keep mapping exactly):
 * the dish shader offsets its whole image (bench included, so no edge ever shows) and the overlay
 * translates its dish-attached drawing by the same pixels.
 *
 * The ¡Chispazo! (ADR-031, docs/MECANICAS.md §3.2) also *kicks* the dish: it jolts down at most 1.5 px and
 * settles like a knocked instrument (a damped spring, ζ 0.5, ωn 45 rad/s: still in ~130 ms, ARTE-REALISTA
 * §6.4). The kick is the one motion that lands under a finger: at 8 taps a second a finger is on the glass
 * most of the time, and the kick is what tells the hit. It never moves the grid camera (taps keep mapping
 * exactly) and never happens with Reduce motion.
 */
import { noise1 } from './noise';

export const SHAKE = {
  /** Maximum offset in CSS px at trauma 1. */
  maxPx: 4,
  /** Trauma lost per second. */
  decay: 1.8,
  /** Noise frequency (Hz) per axis. */
  hz: 18,
  /** Trauma per event (A-4, A-7, A-12). */
  born: 0.12,
  species: 0.25,
  spark: 0.35,
  timesUp: 0.3,
  /** ¡Chispazo! trauma, below the Destello's (MECANICAS §1.2: «Chispazo = trauma 0,15»). */
  chispazo: 0.15,
  /** The Chispazo's kick: the dish jolts down this far at most (CSS px) and zooms in this much. */
  kickPx: 1.5,
  kickZoom: 0.003,
  /** Zoom punch on a birth: +1.2 % peak. */
  punch: 0.012,
  /** Breathing of the bench, vignette and motes: ±1.5 px over 12 s (parallax; the dish never breathes). */
  breathPx: 1.5,
  breathS: 12,
} as const;

// Default spatial spring (M5: stiffness 380, damping ratio 0.8, mass 1) for the zoom punch.
const W0 = Math.sqrt(380);
const ZW = 0.8 * W0;
const WD = W0 * Math.sqrt(1 - 0.64);
const T_PEAK = Math.atan2(WD, ZW) / WD;
/** Impulse amplitude so the punch peaks at +SHAKE.punch. */
const PUNCH_A = SHAKE.punch / (Math.exp(-ZW * T_PEAK) * Math.sin(WD * T_PEAK));

// The Chispazo's kick: a knocked instrument (ζ 0.5, ωn 45 rad/s), normalised so its first swing is 1.
const K_W0 = 45;
const K_ZW = 0.5 * K_W0;
const K_WD = K_W0 * Math.sqrt(1 - 0.25);
const K_PEAK = Math.exp(-K_ZW * (Math.atan2(K_WD, K_ZW) / K_WD)) * Math.sin(Math.atan2(K_WD, K_ZW));
/** After this long the kick is under 0.01 px: it ends. */
const KICK_S = 0.35;

export class Shake {
  trauma = 0;
  /** Offset (CSS px) and zoom of this frame, read by the shader and the overlay. */
  x = 0;
  y = 0;
  zoom = 1;
  /** Bench / vignette / motes parallax (CSS px). */
  breathX = 0;
  breathY = 0;
  private t = 0;
  private punchAt = -1;
  private kickAt = -1;
  /** Kick direction (unit vector, mostly down: a tap pushes the dish into the bench). */
  private kx = 0;
  private ky = 1;
  private kicks = 0;

  /** Add trauma (clamped to 1). */
  add(amount: number): void {
    if (amount > 0) this.trauma = Math.min(1, this.trauma + amount);
  }

  /** A zoom punch (a birth). */
  punch(): void {
    this.punchAt = this.t;
  }

  /** The ¡Chispazo! kick (restarts, never adds up). Nothing with Reduce motion. */
  kick(reduceMotion: boolean): void {
    if (reduceMotion) return;
    this.kickAt = this.t;
    // Down, a little to one side and then the other, so a run of Chispazos is not a metronome.
    const a = (this.kicks++ % 2 === 0 ? 1 : -1) * 0.22;
    this.kx = Math.sin(a);
    this.ky = Math.cos(a);
  }

  /** A kick is under way. */
  get kicking(): boolean {
    return this.kickAt >= 0;
  }

  /**
   * Advance by dt seconds. `still`: reduce motion, a drag or a long press — no shake, no punch, no
   * breathing (the trauma still decays so nothing fires late).
   */
  update(dt: number, still: boolean): void {
    const d = Math.max(0, Math.min(0.25, dt));
    this.t += d;
    this.trauma = Math.max(0, this.trauma - SHAKE.decay * d);
    // The kick (see the header): it lands even under a finger.
    let kick = 0;
    const kt = this.kickAt >= 0 ? this.t - this.kickAt : -1;
    if (kt >= 0 && kt < KICK_S) kick = (Math.exp(-K_ZW * kt) * Math.sin(K_WD * kt)) / K_PEAK;
    else this.kickAt = -1;
    const kx = SHAKE.kickPx * kick * this.kx;
    const ky = SHAKE.kickPx * kick * this.ky;
    if (still) {
      this.x = kx;
      this.y = ky;
      this.zoom = 1 + SHAKE.kickZoom * kick;
      this.breathX = 0;
      this.breathY = 0;
      this.punchAt = -1;
      return;
    }
    const k = SHAKE.maxPx * this.trauma * this.trauma;
    const n = this.t * SHAKE.hz;
    this.x = k * noise1(n, 17) + kx;
    this.y = k * noise1(n, 91) + ky;
    // Never past the cap, whatever adds up.
    const m = Math.hypot(this.x, this.y);
    if (m > SHAKE.maxPx) {
      this.x *= SHAKE.maxPx / m;
      this.y *= SHAKE.maxPx / m;
    }
    const pt = this.punchAt >= 0 ? this.t - this.punchAt : -1;
    if (pt >= 0 && pt < 0.6) this.zoom = 1 + PUNCH_A * Math.exp(-ZW * pt) * Math.sin(WD * pt);
    else {
      this.zoom = 1;
      this.punchAt = -1;
    }
    this.zoom += SHAKE.kickZoom * kick;
    const b = (this.t / SHAKE.breathS) * Math.PI * 2;
    this.breathX = SHAKE.breathPx * Math.sin(b);
    this.breathY = SHAKE.breathPx * Math.sin(b * 0.5 + 1.3) * 0.7;
  }
}
