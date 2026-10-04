/**
 * Moon phase from a date (pure; no network). Low-precision formulas from Jean Meeus,
 * "Astronomical Algorithms" (2nd ed.), ch. 47–48: the phase angle i from the Moon's mean
 * elongation D and the Sun/Moon mean anomalies M, M′ with the six largest periodic terms.
 * Accurate to about ±0.5 % illumination, which is plenty for "is it a full moon tonight?".
 */

/** Synodic month (days). */
export const SYNODIC_MONTH = 29.530588853;

/** Illumination at or above this counts as a full moon (≈ ±1.3 days around the instant of full). */
export const FULL_MOON_ILLUMINATION = 0.98;

export type MoonPhaseName =
  | 'new'
  | 'waxingCrescent'
  | 'firstQuarter'
  | 'waxingGibbous'
  | 'full'
  | 'waningGibbous'
  | 'lastQuarter'
  | 'waningCrescent';

export interface MoonInfo {
  /** 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter, → 1 = new again. */
  phase: number;
  /** Illuminated fraction of the disc, 0..1. */
  illumination: number;
  /** Days since new moon (0..29.53). */
  ageDays: number;
  waxing: boolean;
  name: MoonPhaseName;
}

const RAD = Math.PI / 180;

/** Julian Day of a JS Date (UTC). */
export function julianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

function norm360(a: number): number {
  return ((a % 360) + 360) % 360;
}

export function moonInfo(date: Date): MoonInfo {
  // ΔT (TT − UT, ≈ 69 s) is negligible at this precision.
  const T = (julianDay(date) - 2451545) / 36525;
  const D = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + (T * T * T) / 545868 - (T * T * T * T) / 113065000);
  const M = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T + (T * T * T) / 24490000);
  const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + (T * T * T) / 69699 - (T * T * T * T) / 14712000);
  // Phase angle (Meeus 48.4).
  const i =
    180 -
    D -
    6.289 * Math.sin(Mp * RAD) +
    2.1 * Math.sin(M * RAD) -
    1.274 * Math.sin((2 * D - Mp) * RAD) -
    0.658 * Math.sin(2 * D * RAD) -
    0.214 * Math.sin(2 * Mp * RAD) -
    0.11 * Math.sin(D * RAD);
  const illumination = (1 + Math.cos(i * RAD)) / 2;
  // True elongation ψ = 180° − i, folded into 0..360 so that it grows through the month.
  const psi = norm360(180 - i);
  const phase = psi / 360;
  const waxing = phase < 0.5;
  return { phase, illumination, ageDays: phase * SYNODIC_MONTH, waxing, name: phaseName(phase) };
}

function phaseName(p: number): MoonPhaseName {
  const names: MoonPhaseName[] = [
    'new',
    'waxingCrescent',
    'firstQuarter',
    'waxingGibbous',
    'full',
    'waningGibbous',
    'lastQuarter',
    'waningCrescent',
  ];
  return names[Math.floor(((p + 1 / 16) % 1) * 8)];
}

export function isFullMoon(date: Date, threshold = FULL_MOON_ILLUMINATION): boolean {
  return moonInfo(date).illumination >= threshold;
}
