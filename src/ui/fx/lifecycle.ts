/**
 * The life cycle on the dish, as timings and curves (docs/ARTE-PULIDO.md A-4): sowing (a drop, a
 * ripple, a light in the agar), incubating (a progress arc and a heartbeat that quickens, J6), being
 * born (anticipation, a flash, a pop of the halo, particles) and dissolving. Pure functions of time so
 * they are tested without a canvas; src/ui/overlay.ts draws them, the shader pulses come from the
 * same table (src/ui/fx/stage.ts).
 *
 * Game durations stay in src/game/cycleBalance.ts (SEED_BLOOM_MS, CREATURE_ALIVE_MS, DISSOLVE_MS) and
 * are not changed here; every other number is the spec's (ARTE-PULIDO §4, A-4 table).
 */
import { CREATURE_ALIVE_MS, DISSOLVE_MS, SEED_BLOOM_MS } from '../../game/cycleBalance';
import { ease } from '../art/motion';

export const LIFE = {
  // ── Sowing (A-4 "Sembrar") ──
  /** The drop falls 0–120 ms, scale 1.6 → 1 (`enter`), white core turning accent. */
  dropMs: 120,
  dropScale0: 1.6,
  /** Drop core radius, CSS px. */
  dropPx: 7,
  /** Squash on the agar: x 1.25 / y 0.80 (volume kept, M10), peak this long after landing (s). */
  squash: 0.25,
  squashPeakS: 0.03,
  /** The drop melts into the agar by the end of the seed bloom (cycleBalance SEED_BLOOM_MS). */
  dropFadeS: SEED_BLOOM_MS / 1000,
  /** Ripple 60–410 ms: radius 6 → 34 px CSS, stroke 2 → 0.6 px, opacity 0.85 → 0, `enter`. */
  rippleT0: 0.06,
  rippleT1: 0.41,
  rippleR0: 6,
  rippleR1: 34,
  rippleW0: 2,
  rippleW1: 0.6,
  rippleA0: 0.85,
  /** Reduce motion: the ripple is a fade of ≤ 80 ms (ARTE §7), at this radius. */
  rippleRmS: 0.08,
  rippleRmR: 20,
  /** 6 additive motes, 60–90 px/s, life 450 ms, drag 2.4/s, from 60 ms. */
  sowMotes: 6,
  sowSpeed: [60, 90] as const,
  sowLife: 0.45,
  drag: 2.4,
  /** Light in the agar: a disc of 1.2 R lightened +12 % that fades in 500 ms (`standard`). */
  agarPulse: 0.12,
  agarPulseS: 0.5,
  agarPulseR: 1.2,
  /** Refused sowing: orange ripple without motes, shaking ±3 px for 3 cycles in 240 ms. */
  deniedS: 0.24,
  deniedShakePx: 3,
  deniedCycles: 3,

  // ── Incubating (A-4 "Incubando") ──
  /** Progress arc: halo radius + 6 px, 2 px wide, species colour at 70 %, track at 12 %. */
  arcGapPx: 6,
  arcWidth: 2,
  arcAlpha: 0.7,
  arcTrackAlpha: 0.12,
  /** The arc follows the real progress with critical damping, k = 6/s. */
  arcK: 6,
  /** Heartbeat of the halo: period 1.2 s → 0.45 s and opacity swing 0.15 → 0.35 as progress 0 → 90 %. */
  beatSlow: 1.2,
  beatFast: 0.45,
  beatAmp0: 0.15,
  beatAmp1: 0.35,
  beatFull: 0.9,
  /** Mean opacity of the beating halo. */
  beatBase: 0.32,
  /** Anticipation (M9): from 92 % the halo draws in to 0.9 in 150 ms (`exit`). */
  anticipateAt: 0.92,
  anticipateScale: 0.9,
  anticipateS: 0.15,
  /** The matter itself beats too (shader, uForm): brightness swing at full amplitude. */
  matterBeat: 0.14,

  // ── Born (A-4 "Nace") ──
  /** White flash disc of 0.8 R, opacity 0.9 → 0 in 140 ms (`standard`). */
  flashR: 0.8,
  flashA: 0.9,
  flashS: 0.14,
  /** Halo pop 1 → 1.18 → 1 in CREATURE_ALIVE_MS with the fast spring (M5: 800 / 0.6). */
  popPeak: 0.18,
  popS: CREATURE_ALIVE_MS / 1000,
  /** 16 particles of the species' colour + 6 white, additive, 110–160 px/s, 700 ms, drag 2.4. */
  bornSpecies: 16,
  bornWhite: 6,
  bornSpeed: [110, 160] as const,
  bornLife: 0.7,
  /** The matter "inhales": +18 % brightness in the creature for 300 ms (`standard`). */
  inhale: 0.18,
  inhaleS: 0.3,
  /** Camera trauma (A-9). */
  bornTrauma: 0.12,
  /** A new species: ×1.5 particles and trauma +0.25 (the Momento tells the rest). */
  speciesMult: 1.5,
  speciesTrauma: 0.25,

  // ── Dissolving (A-4 "Muere / se disuelve") ──
  /** The matter greys and dims 40 % in DISSOLVE_MS (`exit`); 10 grey motes rise 18 px; a 1 px ring. */
  dissolveS: DISSOLVE_MS / 1000,
  dissolveDim: 0.4,
  dissolveMotes: 10,
  dissolveRise: 18,
} as const;

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// ───────────────────────────── sowing ─────────────────────────────

export interface DropShape {
  /** Uniform scale of the falling drop (1.6 → 1). */
  scale: number;
  /** Squash on landing: sx · sy = 1 (volume kept). */
  sx: number;
  sy: number;
  /** 0 = white core, 1 = accent. */
  tint: number;
  alpha: number;
}

const dropOut: DropShape = { scale: 1, sx: 1, sy: 1, tint: 1, alpha: 1 };

/** The seed's drop `t` seconds after the tap (the returned object is reused). */
export function seedDrop(t: number): DropShape {
  const o = dropOut;
  const fall = LIFE.dropMs / 1000;
  if (t < fall) {
    const u = clamp01(t / fall);
    o.scale = lerp(LIFE.dropScale0, 1, ease.enter(u));
    o.sx = o.scale;
    o.sy = o.scale;
    o.tint = u;
    o.alpha = 1;
    return o;
  }
  // Landed: a quick squash (gamma pulse peaking squashPeakS after landing) that springs back.
  const tau = t - fall;
  const k = tau / LIFE.squashPeakS;
  const e = k * Math.exp(1 - k);
  o.scale = 1;
  o.sx = 1 + LIFE.squash * e;
  o.sy = 1 / o.sx;
  o.tint = 1;
  o.alpha = 1 - ease.standard(clamp01((t - fall) / Math.max(1e-3, LIFE.dropFadeS - fall)));
  return o;
}

export interface RippleShape {
  r: number;
  width: number;
  alpha: number;
}
const rippleOut: RippleShape = { r: 0, width: 0, alpha: 0 };

/** The sowing ripple `t` seconds after the tap, or null when not showing (the object is reused). */
export function rippleAt(t: number, reduceMotion: boolean): RippleShape | null {
  const o = rippleOut;
  if (reduceMotion) {
    if (t < 0 || t >= LIFE.rippleRmS) return null;
    o.r = LIFE.rippleRmR;
    o.width = 1.5;
    o.alpha = LIFE.rippleA0 * (1 - t / LIFE.rippleRmS);
    return o;
  }
  if (t < LIFE.rippleT0 || t >= LIFE.rippleT1) return null;
  const e = ease.enter((t - LIFE.rippleT0) / (LIFE.rippleT1 - LIFE.rippleT0));
  o.r = lerp(LIFE.rippleR0, LIFE.rippleR1, e);
  o.width = lerp(LIFE.rippleW0, LIFE.rippleW1, e);
  o.alpha = LIFE.rippleA0 * (1 - e);
  return o;
}

/** Horizontal shake (px) of a refused sowing's ripple: ±3 px, 3 cycles, amplitude easing out. */
export function deniedShake(t: number): number {
  if (t < 0 || t >= LIFE.deniedS) return 0;
  const u = t / LIFE.deniedS;
  return LIFE.deniedShakePx * (1 - ease.standard(u)) * Math.sin(u * LIFE.deniedCycles * Math.PI * 2);
}

// ───────────────────────────── incubating ─────────────────────────────

/** Heartbeat period (s) at incubation progress p (0..1): 1.2 s → 0.45 s by 90 %. */
export function beatPeriod(p: number): number {
  return lerp(LIFE.beatSlow, LIFE.beatFast, clamp01(p / LIFE.beatFull));
}

/** Peak-to-peak opacity swing of the beat at progress p: 0.15 → 0.35 by 90 %. */
export function beatAmp(p: number): number {
  return lerp(LIFE.beatAmp0, LIFE.beatAmp1, clamp01(p / LIFE.beatFull));
}

/** 0..1 shape of one beat (sine), `phase` in beats (integrated by the caller as the period changes). */
export function beatWave(phase: number): number {
  return 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
}

/** Halo opacity for a beat phase at progress p (reduce motion: steady, no loop). */
export function beatValue(phase: number, p: number, reduceMotion: boolean): number {
  if (reduceMotion) return LIFE.beatBase;
  return LIFE.beatBase + beatAmp(p) * (beatWave(phase) - 0.5);
}

/** Halo opacity at time t for a fixed progress (tests, previews). */
export function heartbeat(t: number, p: number, reduceMotion: boolean): number {
  return beatValue(t / beatPeriod(p), p, reduceMotion);
}

/**
 * Anticipation (M9): halo scale once the progress passed 92 %; `since` = seconds since it did.
 * Draws in to 0.9 in 150 ms (`exit`) and holds until the birth.
 */
export function anticipation(p: number, since: number): number {
  if (p < LIFE.anticipateAt) return 1;
  return lerp(1, LIFE.anticipateScale, ease.exit(clamp01(since / LIFE.anticipateS)));
}

/**
 * The progress arc: a critically damped follower (k = 6/s) of the real progress, so 10 Hz reports
 * never make it jump. The first target snaps (a creature first seen mid-way starts where it is).
 */
export class IncubationArc {
  value = 0;
  private v = 0;
  private goal = 0;
  private started = false;

  target(p: number): void {
    const g = clamp01(p);
    if (!this.started) {
      this.started = true;
      this.value = g;
      this.v = 0;
    }
    this.goal = g;
  }

  update(dt: number): void {
    const k = LIFE.arcK;
    let left = Math.max(0, Math.min(0.25, dt));
    // Semi-implicit Euler in ≤ 1/120 s substeps: stable and without overshoot for k = 6.
    while (left > 1e-6) {
      const h = Math.min(left, 1 / 120);
      const a = -k * k * (this.value - this.goal) - 2 * k * this.v;
      this.v += a * h;
      this.value += this.v * h;
      if ((this.goal - this.value) * (this.v > 0 ? 1 : -1) < 0 && Math.abs(this.v) > 0) {
        // Never past the goal (a report can only move progress forward; a stale one waits).
        this.value = this.goal;
        this.v = 0;
      }
      left -= h;
    }
  }
}

// ───────────────────────────── born / dissolving ─────────────────────────────

// Fast spatial spring (M5: stiffness 800, damping ratio 0.6, mass 1).
const W0 = Math.sqrt(800);
const ZW = 0.6 * W0;
const WD = W0 * Math.sqrt(1 - 0.36);
// Impulse amplitude giving a 1.18 peak (peak of e^(−ζωt)·sin(ωd t) at tan(ωd t) = ωd / ζω).
const T_PEAK = Math.atan2(WD, ZW) / WD;
const POP_A = LIFE.popPeak / (Math.exp(-ZW * T_PEAK) * Math.sin(WD * T_PEAK));

/**
 * Halo scale `t` seconds after the birth: 1 → 1.18 → 1 (fast spring), starting from `from` (the
 * anticipation's 0.9) so the contraction releases into the pop.
 */
export function birthHalo(t: number, from = 1): number {
  if (t <= 0) return from;
  if (t >= LIFE.popS) return 1;
  const env = Math.exp(-ZW * t);
  const c = Math.cos(WD * t);
  const s = Math.sin(WD * t);
  return 1 + POP_A * env * s + (from - 1) * env * (c + (ZW / WD) * s);
}

/** 0 → 1 over the dissolve (`exit`), then 1. */
export function dissolveAmount(t: number): number {
  if (t <= 0) return 0;
  if (t >= LIFE.dissolveS) return 1;
  return ease.exit(t / LIFE.dissolveS);
}
