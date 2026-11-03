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

  /** Add trauma (clamped to 1). */
  add(amount: number): void {
    if (amount > 0) this.trauma = Math.min(1, this.trauma + amount);
  }

  /** A zoom punch (a birth). */
  punch(): void {
    this.punchAt = this.t;
  }

  /**
   * Advance by dt seconds. `still`: reduce motion, a drag or a long press — no shake, no punch, no
   * breathing (the trauma still decays so nothing fires late).
   */
  update(dt: number, still: boolean): void {
    const d = Math.max(0, Math.min(0.25, dt));
    this.t += d;
    this.trauma = Math.max(0, this.trauma - SHAKE.decay * d);
    if (still) {
      this.x = 0;
      this.y = 0;
      this.zoom = 1;
      this.breathX = 0;
      this.breathY = 0;
      this.punchAt = -1;
      return;
    }
    const k = SHAKE.maxPx * this.trauma * this.trauma;
    const n = this.t * SHAKE.hz;
    this.x = k * noise1(n, 17);
    this.y = k * noise1(n, 91);
    const pt = this.punchAt >= 0 ? this.t - this.punchAt : -1;
    if (pt >= 0 && pt < 0.6) this.zoom = 1 + PUNCH_A * Math.exp(-ZW * pt) * Math.sin(WD * pt);
    else {
      this.zoom = 1;
      this.punchAt = -1;
    }
    const b = (this.t / SHAKE.breathS) * Math.PI * 2;
    this.breathX = SHAKE.breathPx * Math.sin(b);
    this.breathY = SHAKE.breathPx * Math.sin(b * 0.5 + 1.3) * 0.7;
  }
}
