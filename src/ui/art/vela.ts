/**
 * VELA · MC-7 culture monitor (ADR-029, docs/ARTE-REALISTA.md §4). The lab's bench-top instrument, joined to
 * the dish by a probe cable: warm white powder-coat chassis, smoked-glass front, a teal phosphor screen whose
 * trace is her voice, an amber filament pilot lamp (her temper, 1900–3600 K), a separate red alarm LED, a
 * speaker grille, a knurled knob, an engraved aluminium name plate and a chrome carry handle. No face, eyes or
 * hands: she speaks through the trace, the screen label, the lamp and the LED (§4.5).
 *
 * Canvas 2D in the 100 × 100 unit box (the Portrait contract). Shapes are hand-written SVG path data turned into
 * Path2D once (§3.3); every surface follows the 8 layers of §3.2 (silhouette, local colour, form shadow,
 * reflected light, specular, rim light, texture, crisp contour), lit by one window up-left, the cyan dish below
 * and her own lamp on the right. Line weights are CSS px at any DPR (§3.8).
 *
 * Performance (§3.9): everything static (chassis, front, bezel, plate, grille, knob, lamp ring, wardrobe) is
 * painted once per size × DPR × language into a LayerCache; a frame is a few drawImage calls plus the screen,
 * the lamp lens and the LED. The trace lives in a reused Float32Array, and no gradient or pattern is made per
 * frame: the lit ones (lens, halo, LED) are kept per context and colour temperature, the brightness is alpha.
 * No layout reads, no Math.random, no ctx.filter, no shadowBlur.
 *
 * Reduce motion (§4.5): the trace is frozen in its final shape for the state, the lamp neither flickers nor
 * breathes (standby = 25 %), the alarm LED is steady, there is no flash; the label still changes. The same frame
 * at any instant.
 */
import type { Lang, Text } from '../../core/types';
import { hexToRgb, type RGB } from './color';
import { BOUNCE, FONT, MATERIAL, MATERIAL_AT, SCREEN } from './tokens';
import {
  LayerCache,
  circ,
  clipPath,
  conicMetal,
  cylinderRamp,
  fillPath,
  fontsEpoch,
  grainPattern,
  hash01,
  kelvin,
  rgba,
  rr,
  strokePath,
  type Ctx2D,
  type LayerCanvas,
} from './vector';

// ── Contract ──────────────────────────────────────────────────────────────────────────────────────────

/** VELA's expression states (§4.5, §4.7). 'talking' is not a mood: it overlays any of them (VelaPose.talking). */
export type ArtMood = 'neutral' | 'happy' | 'worried' | 'awed' | 'sleepy' | 'proud' | 'alarm' | 'thinking';
export const ART_MOODS: readonly ArtMood[] = ['neutral', 'happy', 'worried', 'awed', 'sleepy', 'proud', 'alarm', 'thinking'];

/** What VELA needs to know to draw one frame (a subset of PortraitState). */
export interface VelaPose {
  mood: ArtMood;
  /** Seconds since the mood changed (instrument transitions: lamp inertia, the awed flash, standby fade). */
  moodAge: number;
  /** 0..1 voice level while talking (smoothed by the caller): the trace amplitude and +15 % of the lamp. */
  talk: number;
  talking: boolean;
  /** 0..1 lamp flicker dip (the Portrait's flicker timers, §4.7: they were the eye blinks). */
  blink: number;
  reduceMotion: boolean;
  /** Accessories: 'scarf' | 'medal' | 'flower' (§4.10). */
  wear?: readonly string[];
}

/** How to draw (all optional; the defaults suit any scene that only sets a transform). */
export interface VelaDrawOptions {
  /** The < 56-px avatar (§4.8): only the bezel with its screen and the lamp. */
  mini?: boolean;
  /** The medium avatar of the dialogue (§6.10): the mini's close-up with the screen label and status row. */
  close?: boolean;
  /** The Portrait's live trace (sweep, persistence, typed ticks, lamp inertia); without it the trace is computed. */
  scope?: VelaScope | null;
  /** CSS px of the 100-unit box, and the DPR: exact line weights and cache sizes (else read from the transform). */
  size?: number;
  dpr?: number;
  /** Language of the screen and the plate. */
  lang?: Lang;
  /** What the alarm band names (default «PLACA LLENA» / "DISH FULL"). */
  alarm?: Text | null;
  /** A screen line of the scene's own instead of the state's label (the intro's «MC-7 · AUTOTEST OK»). */
  label?: Text | null;
}

const TAU = Math.PI * 2;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const mod = (a: number, m: number): number => ((a % m) + m) % m;

// ── Helpers shared with scenes and the cast (signatures kept) ───────────────────────────────────────────

/** Smooth pseudo-noise in [-1, 1] (sum of incommensurate sines; deterministic). */
export function wobble(t: number, seed = 0): number {
  return Math.sin(t * 1.7 + seed) * 0.55 + Math.sin(t * 3.13 + seed * 2.3) * 0.3 + Math.sin(t * 7.31 + seed * 5.1) * 0.15;
}

/** Soft radial glow (gradient, no shadowBlur). */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a: number): void {
  if (a <= 0 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(0.45, `rgba(${rgb},${a * 0.38})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** A four-point twinkle (the Spark's shape) — used for glints and awe sparkles. */
export function twinkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  if (alpha <= 0.01) return;
  const c = r * 0.22;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + c, y - c, x + r, y);
  ctx.quadraticCurveTo(x + c, y + c, x, y + r);
  ctx.quadraticCurveTo(x - c, y + c, x - r, y);
  ctx.quadraticCurveTo(x - c, y - c, x, y - r);
  ctx.fill();
  ctx.restore();
}

/**
 * The four edge gradients per context and width: they live in the 100-unit box (user space), so the
 * same objects serve every frame (portraits are drawn every animation frame; ARTE-PULIDO §6.1: no
 * gradients created per frame).
 */
const featherCache = new WeakMap<CanvasRenderingContext2D, Map<number, CanvasGradient[]>>();

function featherGradients(ctx: CanvasRenderingContext2D, w: number): CanvasGradient[] {
  let byW = featherCache.get(ctx);
  if (!byW) featherCache.set(ctx, (byW = new Map()));
  let gs = byW.get(w);
  if (!gs) {
    const lin = (x0: number, y0: number, x1: number, y1: number) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      return g;
    };
    gs = [lin(0, 0, 0, w), lin(0, 100, 0, 100 - w), lin(0, 0, w, 0), lin(100, 0, 100 - w, 0)];
    byW.set(w, gs);
  }
  return gs;
}

/**
 * Fade the outer `w` units of the 100-box to transparent so glows never end in a hard canvas edge
 * (the portrait sits on any panel colour).
 */
export function featherEdges(ctx: CanvasRenderingContext2D, w = 5): void {
  const g = featherGradients(ctx, w);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = g[0];
  ctx.fillRect(0, 0, 100, w);
  ctx.fillStyle = g[1];
  ctx.fillRect(0, 100 - w, 100, w);
  ctx.fillStyle = g[2];
  ctx.fillRect(0, 0, w, 100);
  ctx.fillStyle = g[3];
  ctx.fillRect(100 - w, 0, w, 100);
  ctx.restore();
}

// ── Geometry (§4.2: every number is the bible's table) ─────────────────────────────────────────────────

const GLASS = { x: 18.5, y: 26.5, w: 45, h: 31 } as const;
const LAMP = { x: 77, y: 31, ring: 6.4, lens: 4.7 } as const;
const LED = { x: 77, y: 41.2, r: 1.25 } as const;
const GRILLE = { xs: [72.6, 77, 81.4], ys: [46.5, 50, 53.5, 57], r: 0.85 } as const;
const KNOB = { x: 77, y: 71.5, r: 5.4, face: 4.1 } as const;
const PLATE_BOX = { x: 15.5, y: 64, w: 51, h: 15 } as const;
const TOP_FACE_Y = 18.6;

/** VELA's shapes as SVG path data (paste any into an SVG viewer with viewBox="0 0 100 100"; the «calco» page does). */
export const VELA_PATHS = {
  handle: rr(21, 7.2, 58, 3.2, 1.6),
  postL: rr(22, 8.6, 4, 6, 0.8),
  postR: rr(74, 8.6, 4, 6, 0.8),
  chassis: rr(8, 14, 84, 74, 4.5),
  footL: rr(16, 87.4, 12, 2.8, 1),
  footR: rr(72, 87.4, 12, 2.8, 1),
  fascia: rr(12, 20, 76, 62, 3.5),
  bezel: rr(15.5, 23.5, 51, 37, 3.5),
  glass: rr(18.5, 26.5, 45, 31, 2),
  plate: rr(15.5, 64, 51, 15, 1.2),
  lampRing: circ(LAMP.x, LAMP.y, LAMP.ring) + circ(LAMP.x, LAMP.y, 4.95),
  lens: circ(LAMP.x, LAMP.y, LAMP.lens),
  led: circ(LED.x, LED.y, LED.r),
  knob: circ(KNOB.x, KNOB.y, KNOB.r),
  /** The probe cable: black silicone that leaves the frame bottom-right, towards the dish. */
  cable: 'M92 70C97 71 99 76 98 84C97.4 89 98.6 94.6 101 100',
  strain: rr(90.6, 66.8, 3.2, 6.4, 0.8),
} as const;
const P = VELA_PATHS;
const BEZEL_RING = P.bezel + P.glass;
const CABLE_GLINT = 'M92.4 69.2C96.6 70.2 98.4 75 97.5 83';
const LED_HOUSING = circ(LED.x, LED.y, 1.85);

/** Trace area inside the glass (§4.4: status row on top, label at the bottom). */
const TR_X0 = GLASS.x + 1.5;
const TR_W = GLASS.w - 3;
const TR_Y0 = GLASS.y + 5;
const TR_Y1 = GLASS.y + GLASS.h - 6.5;
const TR_CY = (TR_Y0 + TR_Y1) / 2;
const TR_MAX = (TR_Y1 - TR_Y0) / 2 - 0.5;

// ── States (§4.5) ─────────────────────────────────────────────────────────────────────────────────────

type InkId = keyof typeof SCREEN;
type TraceKind = 'breath' | 'chirp' | 'jitter' | 'spike' | 'sleep' | 'flat' | 'scan';
type GlyphId = '' | 'check' | 'tri' | 'bang' | 'star';

interface VelaState {
  trace: TraceKind;
  /** Trace amplitude (u). */
  amp: number;
  ink: InkId;
  glyph: GlyphId;
  label: Text;
  /** Lamp colour temperature (K) and brightness 0..1; `flick` is the slow flicker depth. */
  K: number;
  lamp: number;
  flick: number;
  /** Screen brightness (sleepy dims the panel to 22 %). */
  screen: number;
}

/** The nine states of §4.5 (talking overlays these). Labels are what a real instrument says, never emoticons. */
export const VELA_STATES: Record<ArtMood, VelaState> = {
  neutral: { trace: 'breath', amp: 1.3, ink: 'teal', glyph: '', label: { es: 'MONITORIZANDO', en: 'MONITORING' }, K: 2700, lamp: 0.62, flick: 0.03, screen: 1 },
  happy: { trace: 'chirp', amp: 3.2, ink: 'teal', glyph: 'check', label: { es: 'ESTABLE', en: 'STABLE' }, K: 3200, lamp: 0.9, flick: 0.02, screen: 1.08 },
  worried: { trace: 'jitter', amp: 2.4, ink: 'amber', glyph: 'tri', label: { es: 'ATENCIÓN', en: 'ATTENTION' }, K: 2200, lamp: 0.45, flick: 0.22, screen: 0.95 },
  awed: { trace: 'spike', amp: 9, ink: 'teal', glyph: 'bang', label: { es: 'NUEVO REGISTRO', en: 'NEW RECORD' }, K: 3600, lamp: 1, flick: 0, screen: 1.12 },
  sleepy: { trace: 'sleep', amp: 0, ink: 'teal', glyph: '', label: { es: 'STANDBY  03:12', en: 'STANDBY  03:12' }, K: 2400, lamp: 0.25, flick: 0, screen: 0.22 },
  alarm: { trace: 'flat', amp: 0.25, ink: 'red', glyph: '', label: { es: 'ALARMA', en: 'ALARM' }, K: 2200, lamp: 0.15, flick: 0, screen: 1.05 },
  proud: { trace: 'chirp', amp: 3, ink: 'gold', glyph: 'star', label: { es: 'RÉCORD', en: 'RECORD' }, K: 3200, lamp: 0.85, flick: 0.01, screen: 1.05 },
  thinking: { trace: 'scan', amp: 1, ink: 'teal', glyph: '', label: { es: 'ANALIZANDO', en: 'ANALYSING' }, K: 2700, lamp: 0.62, flick: 0.03, screen: 1 },
};
const stateOf = (m: string): VelaState => VELA_STATES[m as ArtMood] ?? VELA_STATES.neutral;

const VOICE_LABEL: Text = { es: 'VOZ', en: 'VOICE' };
const DEFAULT_ALARM: Text = { es: 'PLACA LLENA', en: 'DISH FULL' };
const READOUT: Text = { es: '37,0 °C   5,0 % CO₂', en: '37.0 °C   5.0 % CO₂' };
const PLATE_TEXT: Record<Lang, readonly [string, string, string]> = {
  es: ['VELA', 'MONITOR DE CULTIVO · MC-7', 'ESTACIÓN VIGILIA · N.º 0451'],
  en: ['VELA', 'CULTURE MONITOR · MC-7', 'VIGILIA STATION · No. 0451'],
};

/** Inks as ready strings (no per-frame formatting): body, hot core, glow passes. */
interface InkStyle {
  rgb: RGB;
  body: string;
  core: string;
  halo: string;
  mid: string;
  head: string;
  tint: string;
}
function inkStyle(id: InkId): InkStyle {
  const rgb = hexToRgb(SCREEN[id].body);
  return {
    rgb,
    body: SCREEN[id].body,
    core: SCREEN[id].core,
    halo: rgba(rgb[0], rgb[1], rgb[2], 0.16),
    mid: rgba(rgb[0], rgb[1], rgb[2], 0.55),
    head: rgba(rgb[0], rgb[1], rgb[2], 0.35),
    tint: rgba(rgb[0], rgb[1], rgb[2], 0.04),
  };
}
const INKS: Record<InkId, InkStyle> = { teal: inkStyle('teal'), amber: inkStyle('amber'), red: inkStyle('red'), gold: inkStyle('gold') };
const DISH = hexToRgb(BOUNCE.dish);

// ── The trace (§4.5, §4.6, §6.4) ──────────────────────────────────────────────────────────────────────

/** Columns of the trace (one sample each). */
export const SCOPE_COLS = 120;
const COL_W = TR_W / (SCOPE_COLS - 1);
/** Sweep speed (§6.4): 30 u/s, left to right, restarting at the right edge. Never bounces. */
const SWEEP = 30;
const CPS = SWEEP / COL_W;
/** One sweep (s). */
export const SWEEP_PERIOD = SCOPE_COLS / CPS;
/** Columns blanked just ahead of the beam (the erase bar of a patient monitor). */
const GAP = 4;

/** Value noise in [-1, 1]: smooth, deterministic, the same in every engine. */
function vnoise(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash01(Math.imul(i, 7919) + seed);
  const b = hash01(Math.imul(i + 1, 7919) + seed);
  return (a + (b - a) * u) * 2 - 1;
}

function breath(amp: number, tau: number): number {
  // «Respiración» at 0.25 Hz riding a 1.2-Hz carrier (1.7 cycles on the glass) plus 0.25 u of noise.
  return amp * (0.72 + 0.28 * Math.sin(TAU * 0.25 * tau)) * Math.sin(TAU * 1.2 * tau) + 0.25 * vnoise(tau * 24, 3);
}

/** The base signal of a state at write time `tau`, `age` s after the state began (before it: the idle line). */
function baseSignal(st: VelaState, tau: number, age: number): number {
  if (age < 0) return breath(1.3, tau) * 0.6;
  switch (st.trace) {
    case 'breath':
      return breath(st.amp, tau);
    case 'chirp': {
      // A chirp that opens into a clean 1-Hz sine: 4 Hz at the change, 1 Hz after ~1 s; the amplitude opens too.
      const e = Math.exp(-age / 0.4);
      return st.amp * (1 - 0.75 * Math.exp(-age / 0.25)) * Math.sin(TAU * (tau + 1.2 * (1 - e)));
    }
    case 'jitter':
      return st.amp * (0.42 * Math.sin(TAU * 1.1 * tau) + 0.58 * vnoise(tau * 21, 5)) + 0.3 * st.amp * vnoise(tau * 67, 9);
    case 'spike': {
      // QRS-like peak, then e^{-0.12 d}·cos(0.9 d) (d in u): once per sweep, so it holds still where the beam was.
      const k = Math.floor(age / SWEEP_PERIOD);
      const d = (age - k * SWEEP_PERIOD) * SWEEP;
      const a = k === 0 ? st.amp : st.amp * 0.72;
      const q = d < 0.35 ? d / 0.35 : Math.exp(-0.12 * (d - 0.35)) * Math.cos(0.9 * (d - 0.35));
      return a * q + 0.22 * vnoise(tau * 24, 1);
    }
    case 'flat':
      return 0.25 * vnoise(tau * 38, 2) + 0.1 * vnoise(tau * 113, 4);
    case 'scan':
      // Analysing: a sample-and-hold readout, steps of data under the scan bar.
      return st.amp * 1.4 * (Math.round(vnoise(tau * 7.3, 6) * 2.4) / 2.4) + 0.12 * vnoise(tau * 44, 8);
    default:
      return 0;
  }
}

/** Voice bursts (§4.5): two sines, 30 and 47 rad/s, through the talk envelope; up to 6 u. */
function voice(tau: number, env: number): number {
  return 6 * env * (0.6 * Math.sin(30 * tau) + 0.4 * Math.sin(47 * tau + 1.3)) * (0.5 + 0.5 * Math.abs(Math.sin(9 * tau)));
}

function column(st: VelaState, tau: number, age: number, env: number): number {
  let s = baseSignal(st, tau, age);
  if (env > 0.005) s = s * (1 - 0.6 * env) + voice(tau, env);
  return s < -TR_MAX ? -TR_MAX : s > TR_MAX ? TR_MAX : s;
}

const voiceEnv = (talk: number, talking: boolean, rm: boolean): number => (talking ? (rm ? 0.6 : 0.3 + 0.7 * clamp01(talk)) : 0);

/**
 * Fills `out` (SCOPE_COLS samples, u, + up) with the trace a sweeping beam would have written by time `t`
 * (each column at the instant the beam last crossed it) and returns the beam position in columns. Under
 * Reduce motion it is the state's final shape, the same at any instant, and the beam is -1 (none drawn).
 */
export function velaTrace(out: Float32Array, mood: ArtMood, t: number, moodAge: number, talk: number, talking: boolean, rm: boolean): number {
  const st = stateOf(mood);
  const env = voiceEnv(talk, talking, rm);
  if (rm) {
    for (let c = 0; c < SCOPE_COLS; c++) {
      const age = st.trace === 'spike' ? (c - 0.3 * SCOPE_COLS) / CPS : 30 + c / CPS;
      out[c] = column(st, 7 + c / CPS, age, env);
    }
    return -1;
  }
  const beam = mod(t * CPS, SCOPE_COLS);
  for (let c = 0; c < SCOPE_COLS; c++) {
    const back = mod(beam - c, SCOPE_COLS) / CPS;
    out[c] = column(st, t - back, moodAge - back, env);
  }
  return beam;
}

/** Lamp reading: brightness 0..1.15 and colour temperature (K). */
export interface LampReading {
  on: number;
  K: number;
}

/**
 * The pilot lamp a state asks for at time `t` (§4.5): its temperature and brightness, the slow filament flicker
 * (±3 %), the worried lamp's irregular sag (±22 %), the awed flash (1 → 0.8 in 600 ms), the standby breath
 * (0.2 Hz, 8–45 %) and +15 % while talking. A dimmer filament is also a cooler one. Reduce motion: steady.
 */
export function velaLamp(mood: ArtMood, t: number, moodAge: number, talk: number, blink: number, rm: boolean, out: LampReading = { on: 0, K: 0 }): LampReading {
  const st = stateOf(mood);
  let on = st.lamp;
  if (mood === 'sleepy') on = rm ? 0.25 : 0.08 + 0.37 * (0.5 - 0.5 * Math.cos(TAU * 0.2 * t));
  else if (mood === 'awed') on = rm ? 0.8 : 0.8 + 0.2 * Math.exp(-moodAge / 0.22);
  else if (!rm) {
    const f = mood === 'worried' ? 0.55 * vnoise(t * 7, 11) + 0.45 * wobble(t * 5.3, 4) : wobble(t * 0.9, 2);
    on *= 1 + st.flick * f;
  }
  if (!rm) {
    on *= 1 - (mood === 'worried' ? 0.35 : 0.06) * clamp01(blink);
    on += 0.15 * clamp01(talk);
  }
  out.on = on < 0 ? 0 : on > 1.15 ? 1.15 : on;
  const K = st.K + (out.on - st.lamp) * 600;
  out.K = K < 1900 ? 1900 : K > 3600 ? 3600 : K;
  return out;
}

/** The alarm LED, 0 or 1 (§4.5): 2 Hz at 50 % (≤ 3 flashes/s, WCAG 2.3.1) in alarm, steady under Reduce motion. */
export function velaLed(mood: ArtMood, t: number, rm: boolean): number {
  if (mood !== 'alarm') return 0;
  return rm ? 1 : mod(Math.floor(t * 4), 2) === 0 ? 1 : 0;
}

/**
 * The live instrument of one Portrait: the trace as a sweeping beam writes it (a column at a time, with the
 * voice level and the typed ticks of that instant, so a sentence leaves its shape on the glass), and the
 * lamp's thermal inertia (τ 60 ms warming, 120 ms cooling, §6.4). Call `step` every frame, `tick` per letter.
 */
export class VelaScope {
  /** Trace samples (u, + up), one per column. */
  readonly y = new Float32Array(SCOPE_COLS);
  /** Beam position in columns. */
  beam = 0;
  /** Lamp brightness and temperature after inertia. */
  lamp = 0;
  kelvin = 2700;
  private warm = false;
  private lampWarm = false;
  private tickE = 0;
  private voiceT = 0;

  /**
   * «◉ VOZ» stays on through the typewriter's pauses at commas and full stops (0.45 s), so the label does not
   * blink between words; it goes when she has finished.
   */
  get speaking(): boolean {
    return this.voiceT > 0;
  }
  private readonly target: LampReading = { on: 0, K: 0 };

  /** One letter typed: a +0.6-u blip where the beam is writing (§4.6). */
  tick(): void {
    this.tickE = Math.min(2, this.tickE + 1);
  }

  /** Forget the trace (a new speaker took the screen). */
  reset(): void {
    this.warm = false;
    this.lampWarm = false;
    this.tickE = 0;
  }

  step(t: number, dt: number, s: VelaPose): void {
    const st = stateOf(s.mood);
    this.voiceT = s.talking ? 0.45 : Math.max(0, this.voiceT - Math.max(0, dt));
    const env = s.talking ? 0.25 + 0.75 * clamp01(s.talk) : 0.8 * clamp01(s.talk);
    if (!this.warm) {
      this.beam = Math.max(0, velaTrace(this.y, s.mood, t, s.moodAge, s.talk, s.talking, false));
      this.warm = true;
    } else if (dt > 0 && !s.reduceMotion) {
      const b1 = this.beam + dt * CPS;
      const first = Math.floor(this.beam) + 1;
      const last = Math.floor(b1);
      if (last - first >= SCOPE_COLS) {
        this.beam = Math.max(0, velaTrace(this.y, s.mood, t, s.moodAge, s.talk, s.talking, false));
      } else {
        for (let c = first; c <= last; c++) {
          const back = (b1 - c) / CPS;
          let v = column(st, t - back, s.moodAge - back, env);
          if (this.tickE > 0.02) {
            v += 0.6 * this.tickE;
            this.tickE *= 0.4;
          }
          this.y[mod(c, SCOPE_COLS)] = v > TR_MAX ? TR_MAX : v;
        }
        this.beam = mod(b1, SCOPE_COLS);
      }
    }
    velaLamp(s.mood, t, s.moodAge, s.talk, s.blink, s.reduceMotion, this.target);
    if (dt <= 0 || s.reduceMotion || !this.lampWarm) {
      this.lamp = this.target.on;
      this.kelvin = this.target.K;
      this.lampWarm = true;
    } else {
      const tau = this.target.on > this.lamp ? 0.06 : 0.12;
      this.lamp += (this.target.on - this.lamp) * (1 - Math.exp(-dt / tau));
      this.kelvin += (this.target.K - this.kelvin) * (1 - Math.exp(-dt / 0.12));
    }
  }
}

// ── Frame state (one draw at a time: module scratch, no allocation) ─────────────────────────────────────

const F = {
  /** Box units per CSS px in the current drawing space. */
  pxu: 1,
  /** One device px in the current drawing space. */
  hair: 1,
  /** Device px per unit of the current drawing space, and the device offset of its origin (pixel snapping). */
  k: 1,
  ox: 0,
  oy: 0,
  size: 100,
  dpr: 1,
  lang: 'es' as Lang,
};
const lw = (css: number): number => css * F.pxu;
/** Centre of the device pixel nearest to x (or y) in the current space: crisp 1-device-px lines. */
const snapX = (v: number): number => (Math.round(v * F.k + F.ox - 0.5) + 0.5 - F.ox) / F.k;
const snapY = (v: number): number => (Math.round(v * F.k + F.oy - 0.5) + 0.5 - F.oy) / F.k;

function setSpace(sizeCss: number, dpr: number, scale: number, ox = 0, oy = 0): void {
  F.size = sizeCss;
  F.dpr = dpr;
  F.pxu = 100 / Math.max(1, sizeCss) / scale;
  F.k = (sizeCss / 100) * dpr * scale;
  F.hair = 1 / F.k;
  F.ox = ox;
  F.oy = oy;
}

const SCRATCH_TRACE = new Float32Array(SCOPE_COLS);
const SCRATCH_LAMP: LampReading = { on: 0, K: 2700 };
const cache = new LayerCache(28);

const fontCache = new Map<number, string>();
/** 'weight size px JetBrains Mono…' for a size in units (cached: no string per frame). */
function mono(weight: number, size: number): string {
  const key = weight * 10000 + Math.round(size * 100);
  let f = fontCache.get(key);
  if (!f) {
    f = `${weight} ${+size.toFixed(2)}px ${FONT.mono}`;
    fontCache.set(key, f);
  }
  return f;
}

const advCache = new Map<string, number>();
let advEpoch = -1;
/** Advance of one character of the (monospaced) screen font, measured once per font and font load. */
function advance(c: Ctx2D, font: string, size: number): number {
  const ep = fontsEpoch();
  if (ep !== advEpoch) {
    advCache.clear();
    advEpoch = ep;
  }
  let a = advCache.get(font);
  if (a === undefined) {
    c.font = font;
    const m = c.measureText('M') as TextMetrics | undefined;
    a = m && Number.isFinite(m.width) && m.width > 0 ? m.width : size * 0.6;
    advCache.set(font, a);
  }
  return a;
}

// ── Static layers (cached) ────────────────────────────────────────────────────────────────────────────

function vertical(c: Ctx2D, y0: number, y1: number, colors: readonly string[], at: readonly number[]): CanvasGradient {
  const g = c.createLinearGradient(0, y0, 0, y1);
  for (let i = 0; i < colors.length; i++) g.addColorStop(at[i], colors[i]);
  return g;
}

/** Contact shadow on the bench (R10: tinted with the night, never pure black; one light from above). */
function paintShadow(c: Ctx2D): void {
  c.save();
  c.translate(50, 90.4);
  c.scale(1, 0.075);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, 47);
  g.addColorStop(0, 'rgba(5,9,15,0.55)');
  g.addColorStop(0.55, 'rgba(5,9,15,0.25)');
  g.addColorStop(1, 'rgba(5,9,15,0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, 47, 0, TAU);
  c.fill();
  c.restore();
}

function paintCable(c: Ctx2D): void {
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = '#0c0d0e';
  c.lineWidth = 2.6;
  strokePath(c, P.cable);
  // Silicone: a softer body towards the window, one long highlight, the dish's cyan on the far side.
  c.strokeStyle = '#25282a';
  c.lineWidth = 1.3;
  c.translate(-0.35, -0.15);
  strokePath(c, P.cable);
  c.translate(0.35, 0.15);
  c.strokeStyle = 'rgba(255,255,255,0.24)';
  c.lineWidth = lw(0.5);
  strokePath(c, CABLE_GLINT);
  c.restore();
  // Strain relief where the cable leaves the chassis: a short moulded boot, lit on top.
  c.fillStyle = vertical(c, 66.8, 73.2, ['#5a5e62', '#d9dbdc', '#7d8185', '#3d4043'], [0, 0.3, 0.62, 1]);
  fillPath(c, P.strain);
  c.strokeStyle = 'rgba(0,0,0,0.8)';
  c.lineWidth = lw(0.6);
  strokePath(c, P.strain);
}

/** Carry handle: a chrome tube (the 5-stop cylinder ramp, §3.5-2) on two stand-offs; the scarf and medal hang here. */
function paintHandle(c: Ctx2D): void {
  for (const [d, x] of [
    [P.postL, 24],
    [P.postR, 76],
  ] as const) {
    c.fillStyle = cylinderRamp(c, x - 2, 0, x + 2, 0, ['#45494d', '#eceded', '#9a9ea2', '#c3d2d9', '#36393c']);
    fillPath(c, d);
    c.strokeStyle = 'rgba(0,0,0,0.8)';
    c.lineWidth = lw(0.6);
    strokePath(c, d);
  }
  c.fillStyle = cylinderRamp(c, 0, 7.2, 0, 10.4);
  fillPath(c, P.handle);
  // The tube's specular is the window: brightest left of centre, fading right (one per surface, §3.2).
  const g = c.createLinearGradient(21, 0, 79, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.15)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.strokeStyle = g;
  c.lineWidth = lw(0.6);
  c.beginPath();
  c.moveTo(23, 8.15);
  c.lineTo(77, 8.15);
  c.stroke();
  c.strokeStyle = 'rgba(0,0,0,0.85)';
  c.lineWidth = lw(0.75);
  strokePath(c, P.handle);
}

/** The chassis in warm white powder coat (§4.3), all eight layers. */
function paintChassis(c: Ctx2D): void {
  // 1 · silhouette + 2 · local colour: lit from above, darker towards the bench.
  c.fillStyle = vertical(c, 14, 88, MATERIAL.coat, MATERIAL_AT.coat);
  fillPath(c, P.chassis);
  c.save();
  clipPath(c, P.chassis);
  // 3 · form shadow: the right flank and the rounded bottom turn away from the window (multiply).
  c.globalCompositeOperation = 'multiply';
  let g = c.createLinearGradient(8, 0, 92, 0);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.7, '#ffffff');
  g.addColorStop(0.95, '#ddd6ca');
  g.addColorStop(1, '#c2b9ab');
  c.fillStyle = g;
  c.fillRect(8, 14, 84, 74);
  g = c.createLinearGradient(0, 83.5, 0, 88);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#c9c1b4');
  c.fillStyle = g;
  c.fillRect(8, 83.5, 84, 4.5);
  // The left rounded edge faces the window: a soft diffuse highlight, not a specular.
  c.globalCompositeOperation = 'screen';
  g = c.createLinearGradient(8, 0, 13, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(8, 18.6, 5, 69);
  // 4 · reflected light: the dish's cyan from below.
  g = c.createLinearGradient(0, 88, 0, 72);
  g.addColorStop(0, rgba(DISH[0], DISH[1], DISH[2], 0.2));
  g.addColorStop(1, rgba(DISH[0], DISH[1], DISH[2], 0));
  c.fillStyle = g;
  c.fillRect(8, 72, 84, 16);
  c.globalCompositeOperation = 'source-over';
  // The top face, seen a little from above, and the edge where it turns into the front.
  g = c.createLinearGradient(0, 14, 0, TOP_FACE_Y);
  g.addColorStop(0, '#fcfbf8');
  g.addColorStop(1, '#eeebe4');
  c.fillStyle = g;
  c.fillRect(8, 14, 84, TOP_FACE_Y - 14);
  // The handle's shadow on the top face and the stand-offs' contact shadows.
  g = c.createLinearGradient(0, 14.6, 0, 17.6);
  g.addColorStop(0, 'rgba(70,60,46,0)');
  g.addColorStop(0.45, 'rgba(70,60,46,0.08)');
  g.addColorStop(1, 'rgba(70,60,46,0)');
  c.fillStyle = g;
  c.fillRect(26, 14.6, 48, 3);
  for (const x of [24, 76]) {
    c.save();
    c.translate(x + 0.5, 14.75);
    c.scale(1, 0.3);
    const r = c.createRadialGradient(0, 0, 0, 0, 0, 2.6);
    r.addColorStop(0, 'rgba(40,34,26,0.28)');
    r.addColorStop(1, 'rgba(40,34,26,0)');
    c.fillStyle = r;
    c.fillRect(-2.6, -2.6, 5.2, 5.2);
    c.restore();
  }
  c.fillStyle = 'rgba(120,112,98,0.55)';
  c.fillRect(8, TOP_FACE_Y, 84, lw(0.6));
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.fillRect(8, TOP_FACE_Y + lw(0.6), 84, lw(0.5));
  // 7 · texture: powder-coat grain, soft-light 6 %.
  const grain = grainPattern(c);
  if (grain) {
    c.globalCompositeOperation = 'soft-light';
    c.globalAlpha = 0.06;
    c.fillStyle = grain;
    const s = Math.max(0.12, F.hair * 1.2);
    c.save();
    c.scale(s, s);
    c.fillRect(8 / s, 14 / s, 84 / s, 74 / s);
    c.restore();
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }
  c.restore();
  // 5 · specular: the window as one long band on the top back edge.
  g = c.createLinearGradient(12, 0, 88, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.65, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.strokeStyle = g;
  c.lineWidth = lw(0.9);
  c.beginPath();
  c.moveTo(13, 14.7);
  c.lineTo(87, 14.7);
  c.stroke();
  // 6 · rim light: the dish below grazes the bottom edge.
  g = c.createLinearGradient(12, 0, 88, 0);
  g.addColorStop(0, rgba(DISH[0], DISH[1], DISH[2], 0));
  g.addColorStop(0.5, rgba(DISH[0], DISH[1], DISH[2], 0.45));
  g.addColorStop(1, rgba(DISH[0], DISH[1], DISH[2], 0));
  c.strokeStyle = g;
  c.lineWidth = lw(0.55);
  c.beginPath();
  c.moveTo(13, 87.35);
  c.lineTo(87, 87.35);
  c.stroke();
  // 8 · crisp contour, only the real silhouette.
  c.strokeStyle = 'rgba(28,26,22,0.9)';
  c.lineWidth = lw(1.25);
  strokePath(c, P.chassis);
}

function paintFeet(c: Ctx2D): void {
  for (const d of [P.footL, P.footR]) {
    c.fillStyle = vertical(c, 87.4, 90.2, MATERIAL.rubber, MATERIAL_AT.rubber);
    fillPath(c, d);
    c.strokeStyle = 'rgba(0,0,0,0.85)';
    c.lineWidth = lw(0.75);
    strokePath(c, d);
  }
}

/** Smoked-glass front, 1 mm inside the chassis (§4.3). */
function paintFascia(c: Ctx2D): void {
  c.fillStyle = vertical(c, 20, 82, ['#272d32', '#1b2024', '#101316'], [0, 0.06, 1]);
  fillPath(c, P.fascia);
  c.save();
  clipPath(c, P.fascia);
  // The recess: the chassis lip shades the top and left of the front.
  let g = c.createLinearGradient(0, 20, 0, 23.5);
  g.addColorStop(0, 'rgba(0,0,0,0.6)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(12, 20, 76, 3.5);
  g = c.createLinearGradient(12, 0, 14, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(12, 20, 2, 62);
  // Reflected light: a breath of the dish's cyan on the lower edge.
  c.globalCompositeOperation = 'screen';
  g = c.createLinearGradient(0, 82, 0, 76);
  g.addColorStop(0, rgba(DISH[0], DISH[1], DISH[2], 0.08));
  g.addColorStop(1, rgba(DISH[0], DISH[1], DISH[2], 0));
  c.fillStyle = g;
  c.fillRect(12, 76, 76, 6);
  c.globalCompositeOperation = 'source-over';
  // Specular: one soft diagonal band (the room's window) with a clean cut, never animated.
  g = c.createLinearGradient(12, 20, 52, 84);
  g.addColorStop(0, 'rgba(255,255,255,0.07)');
  g.addColorStop(0.34, 'rgba(255,255,255,0.025)');
  g.addColorStop(0.35, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(12, 20, 76, 62);
  c.restore();
  // The opening's lower and right lips face the window: they catch it.
  c.fillStyle = 'rgba(255,255,255,0.14)';
  c.fillRect(13.5, 81.6, 73, lw(0.5));
  c.strokeStyle = 'rgba(0,0,0,0.85)';
  c.lineWidth = lw(0.75);
  strokePath(c, P.fascia);
  c.strokeStyle = 'rgba(255,255,255,0.55)';
  c.lineWidth = lw(0.5);
  c.beginPath();
  c.moveTo(15, 82 + lw(0.6));
  c.lineTo(85, 82 + lw(0.6));
  c.moveTo(88 + lw(0.6), 23);
  c.lineTo(88 + lw(0.6), 79);
  c.stroke();
}

/** WORKED EXAMPLE (§3.6): the screen bezel, anodised aluminium, in the eight layers (rim light: per frame). */
function paintBezel(c: Ctx2D): void {
  // 1 · silhouette (ring = bezel minus glass, evenodd) + 2 · local colour.
  c.fillStyle = vertical(c, 23.5, 60.5, MATERIAL.anod, MATERIAL_AT.anod);
  fillPath(c, BEZEL_RING, 'evenodd');
  c.save();
  clipPath(c, BEZEL_RING, 'evenodd');
  // 3 · form shadow: the inner chamfer faces down-right (multiply).
  c.globalCompositeOperation = 'multiply';
  let g = c.createLinearGradient(15.5, 23.5, 66.5, 60.5);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.55, '#d9dde0');
  g.addColorStop(1, '#8e959b');
  c.fillStyle = g;
  c.fillRect(15.5, 23.5, 51, 37);
  // 4 · reflected light: the dish's cyan on the lower rail (screen).
  c.globalCompositeOperation = 'screen';
  g = c.createLinearGradient(0, 60.5, 0, 55);
  g.addColorStop(0, rgba(DISH[0], DISH[1], DISH[2], 0.18));
  g.addColorStop(1, rgba(DISH[0], DISH[1], DISH[2], 0));
  c.fillStyle = g;
  c.fillRect(15.5, 55, 51, 5.5);
  // 7 · texture: anodised grain (soft-light 8 %) and horizontal brushing.
  const grain = grainPattern(c);
  if (grain) {
    c.globalCompositeOperation = 'soft-light';
    c.globalAlpha = 0.08;
    c.fillStyle = grain;
    c.save();
    c.scale(0.2, 0.2);
    c.fillRect(77.5, 117.5, 255, 185);
    c.restore();
    c.globalAlpha = 1;
  }
  c.globalCompositeOperation = 'source-over';
  for (let y = 24; y < 60.5; y += 0.45) {
    c.fillStyle = hash01(Math.round(y * 100)) > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
    c.fillRect(15.5, y, 51, 0.22);
  }
  c.restore();
  // 5 · specular: the window along the top outer chamfer, and the lit inner chamfer.
  g = c.createLinearGradient(19, 0, 63, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.strokeStyle = g;
  c.lineWidth = lw(0.6);
  c.beginPath();
  c.moveTo(19, 24.15);
  c.lineTo(63, 24.15);
  c.stroke();
  c.strokeStyle = 'rgba(160,172,182,0.5)';
  c.lineWidth = lw(0.5);
  c.beginPath();
  c.moveTo(20.5, 26.1);
  c.lineTo(61.5, 26.1);
  c.stroke();
  // 8 · crisp contour where metal meets glass and the front.
  c.strokeStyle = 'rgba(0,0,0,0.9)';
  c.lineWidth = lw(0.75);
  strokePath(c, P.glass);
  c.strokeStyle = 'rgba(0,0,0,0.75)';
  c.lineWidth = lw(1);
  strokePath(c, P.bezel);
}

/** Engraved letters, spaced by hand (no ctx.letterSpacing): dark fill and a light lower lip. */
function engrave(c: Ctx2D, txt: string, x: number, y: number, size: number, weight: number, track: number): void {
  c.font = mono(weight, size);
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  let cx = x;
  for (const ch of txt) {
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fillText(ch, cx + 0.12, y + 0.18);
    c.fillStyle = '#26292c';
    c.fillText(ch, cx, y);
    const m = c.measureText(ch) as TextMetrics | undefined;
    cx += (m && Number.isFinite(m.width) ? m.width : size * 0.6) + track * size;
  }
}

/** Brushed aluminium name plate (§4.2): anisotropic band, streaks along the brushing, two rivets. */
function paintPlate(c: Ctx2D): void {
  const b = PLATE_BOX;
  // It stands proud of the front: its shadow falls down-right.
  c.save();
  c.translate(0.35, 0.5);
  c.fillStyle = 'rgba(0,0,0,0.55)';
  fillPath(c, P.plate);
  c.restore();
  let g = c.createLinearGradient(b.x, 0, b.x + b.w, 0);
  for (let i = 0; i < 4; i++) g.addColorStop(MATERIAL_AT.alu[i], MATERIAL.alu[i]);
  c.fillStyle = g;
  fillPath(c, P.plate);
  c.save();
  clipPath(c, P.plate);
  for (let y = b.y; y < b.y + b.h; y += 0.32) {
    const v = hash01(Math.round(y * 1000));
    c.fillStyle = v > 0.5 ? rgba(255, 255, 255, 0.05 + v * 0.06) : rgba(0, 0, 0, 0.03 + v * 0.05);
    c.fillRect(b.x, y, b.w, 0.16);
  }
  g = c.createLinearGradient(0, b.y, 0, b.y + b.h);
  g.addColorStop(0, 'rgba(255,255,255,0.25)');
  g.addColorStop(0.3, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.12)');
  c.fillStyle = g;
  c.fillRect(b.x, b.y, b.w, b.h);
  c.restore();
  // Stamped edge: lit top, shaded bottom, then the contour.
  c.fillStyle = 'rgba(255,255,255,0.75)';
  c.fillRect(b.x + 1.2, b.y + lw(0.4), b.w - 2.4, lw(0.5));
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.fillRect(b.x + 1.2, b.y + b.h - lw(0.9), b.w - 2.4, lw(0.5));
  c.strokeStyle = 'rgba(0,0,0,0.7)';
  c.lineWidth = lw(0.75);
  strokePath(c, P.plate);
  const [l1, l2, l3] = PLATE_TEXT[F.lang];
  engrave(c, l1, 20, 71.4, 5.2, 700, 0.22);
  engrave(c, l2, 20, 74.9, 2.05, 500, 0.06);
  engrave(c, l3, 20, 77.6, 1.7, 500, 0.06);
  for (const ry of [67, 76]) {
    const rx = 63.6;
    const rg = c.createRadialGradient(rx - 0.35, ry - 0.35, 0.1, rx, ry, 1.1);
    rg.addColorStop(0, '#ffffff');
    rg.addColorStop(0.5, '#a7abaf');
    rg.addColorStop(1, '#53575b');
    c.fillStyle = rg;
    c.beginPath();
    c.arc(rx, ry, 1.05, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.45)';
    c.lineWidth = lw(0.4);
    c.stroke();
  }
}

function paintGrille(c: Ctx2D): void {
  for (const x of GRILLE.xs)
    for (const y of GRILLE.ys) {
      c.fillStyle = '#030405';
      c.beginPath();
      c.arc(x, y, GRILLE.r, 0, TAU);
      c.fill();
      // A punched hole: its lower lip catches the window.
      c.strokeStyle = 'rgba(255,255,255,0.16)';
      c.lineWidth = lw(0.5);
      c.beginPath();
      c.arc(x, y, GRILLE.r, 0.15 * Math.PI, 0.85 * Math.PI);
      c.stroke();
    }
}

/** Knurled knob with a radially brushed face (conic, §3.5-3) over a silkscreened scale. */
function paintKnob(c: Ctx2D): void {
  const k = KNOB;
  // Scale: 11 ticks over 270°, the longer ones at 0, 5 and 10.
  c.strokeStyle = 'rgba(200,206,212,0.45)';
  c.lineWidth = lw(0.5);
  c.beginPath();
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
    const r1 = i % 5 === 0 ? 7.3 : 6.85;
    c.moveTo(k.x + Math.cos(a) * 6.2, k.y + Math.sin(a) * 6.2);
    c.lineTo(k.x + Math.cos(a) * r1, k.y + Math.sin(a) * r1);
  }
  c.stroke();
  // It stands off the front: a soft shadow down-right.
  const sh = c.createRadialGradient(k.x + 0.7, k.y + 0.9, k.r * 0.8, k.x + 0.7, k.y + 0.9, k.r + 1.4);
  sh.addColorStop(0, 'rgba(0,0,0,0.6)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sh;
  c.beginPath();
  c.arc(k.x + 0.7, k.y + 0.9, k.r + 1.4, 0, TAU);
  c.fill();
  c.fillStyle = conicMetal(c, k.x, k.y, -0.6, '#d8dadb', '#5c6064', 4, k.r);
  fillPath(c, P.knob);
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = lw(0.35);
  c.beginPath();
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU;
    c.moveTo(k.x + Math.cos(a) * k.face, k.y + Math.sin(a) * k.face);
    c.lineTo(k.x + Math.cos(a) * k.r, k.y + Math.sin(a) * k.r);
  }
  c.stroke();
  c.fillStyle = conicMetal(c, k.x, k.y, -0.9, '#f1f2f2', '#8d9195', 2, k.face);
  c.beginPath();
  c.arc(k.x, k.y, k.face, 0, TAU);
  c.fill();
  const g = c.createRadialGradient(k.x - 1.2, k.y - 1.4, 0.2, k.x, k.y, k.face);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0.18)');
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.5)';
  c.lineWidth = lw(0.5);
  c.beginPath();
  c.arc(k.x, k.y, k.face - 0.15, Math.PI * 0.95, Math.PI * 1.55);
  c.stroke();
  c.strokeStyle = '#1a1c1e';
  c.lineWidth = lw(0.6);
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(k.x + Math.cos(-2.3) * 0.9, k.y + Math.sin(-2.3) * 0.9);
  c.lineTo(k.x + Math.cos(-2.3) * 3.4, k.y + Math.sin(-2.3) * 3.4);
  c.stroke();
  c.lineCap = 'butt';
  c.strokeStyle = 'rgba(0,0,0,0.85)';
  c.lineWidth = lw(0.75);
  strokePath(c, P.knob);
}

/** The pilot lamp's chrome ring, radially brushed (conic), standing off the front; the lens is drawn per frame. */
function paintLampRing(c: Ctx2D): void {
  const L = LAMP;
  const sh = c.createRadialGradient(L.x + 0.5, L.y + 0.7, L.ring * 0.85, L.x + 0.5, L.y + 0.7, L.ring + 1.3);
  sh.addColorStop(0, 'rgba(0,0,0,0.55)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sh;
  c.beginPath();
  c.arc(L.x + 0.5, L.y + 0.7, L.ring + 1.3, 0, TAU);
  c.fill();
  c.fillStyle = '#140c06';
  c.beginPath();
  c.arc(L.x, L.y, 4.95, 0, TAU);
  c.fill();
  paintLensOff(c);
  c.fillStyle = conicMetal(c, L.x, L.y, -0.7, '#f4f4f1', '#6c6f72', 4, L.ring);
  fillPath(c, P.lampRing, 'evenodd');
  c.strokeStyle = 'rgba(0,0,0,0.6)';
  c.lineWidth = lw(0.5);
  c.beginPath();
  c.arc(L.x, L.y, 4.95, 0, TAU);
  c.stroke();
  c.strokeStyle = 'rgba(0,0,0,0.85)';
  c.lineWidth = lw(0.75);
  c.beginPath();
  c.arc(L.x, L.y, L.ring, 0, TAU);
  c.stroke();
}

/** The alarm LED's housing and its unlit lens (lit: per frame), with the silkscreened «ALM». */
function paintLedHousing(c: Ctx2D, label: boolean): void {
  c.fillStyle = '#0a0b0c';
  fillPath(c, LED_HOUSING);
  c.strokeStyle = 'rgba(255,255,255,0.14)';
  c.lineWidth = lw(0.5);
  c.beginPath();
  c.arc(LED.x, LED.y, 1.85, 0.15 * Math.PI, 0.85 * Math.PI);
  c.stroke();
  const g = c.createRadialGradient(LED.x - 0.3, LED.y - 0.3, 0.1, LED.x, LED.y, LED.r);
  g.addColorStop(0, '#5a2320');
  g.addColorStop(1, '#2a0d0b');
  c.fillStyle = g;
  fillPath(c, P.led);
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.beginPath();
  c.arc(LED.x - 0.4, LED.y - 0.45, 0.32, 0, TAU);
  c.fill();
  if (!label) return;
  c.font = mono(500, 1.45);
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.fillStyle = 'rgba(210,214,218,0.6)';
  c.fillText('ALM', LED.x + 2.5, LED.y + 0.05);
}

/** Everything that never moves, back to front (§4.4: cable, handle, chassis, feet, front, bezel, plate, grille, knob). */
function paintBodyFull(c: Ctx2D): void {
  paintShadow(c);
  paintCable(c);
  paintHandle(c);
  paintChassis(c);
  paintFeet(c);
  paintFascia(c);
  paintBezel(c);
  paintPlate(c);
  paintGrille(c);
  paintKnob(c);
  paintLampRing(c);
  paintLedHousing(c, true);
}

/** The glass in front of the phosphor: VFD control-grid mesh, inner vignette and one sharp reflection (§4.4). */
function paintGlassFront(c: Ctx2D): void {
  const b = GLASS;
  c.save();
  clipPath(c, P.glass);
  // The mesh is a physical grid, but never finer than 3 device px (finer would only beat into moiré).
  const step = Math.max(0.8, 3 * F.hair);
  c.strokeStyle = 'rgba(0,0,0,0.22)';
  c.lineWidth = F.hair;
  c.beginPath();
  for (let x = b.x + step / 2; x < b.x + b.w; x += step) {
    const sx = snapX(x);
    c.moveTo(sx, b.y);
    c.lineTo(sx, b.y + b.h);
  }
  c.stroke();
  let g = c.createRadialGradient(b.x + b.w / 2, b.y + b.h / 2, b.h * 0.35, b.x + b.w / 2, b.y + b.h / 2, b.w * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  c.fillStyle = g;
  c.fillRect(b.x, b.y, b.w, b.h);
  g = c.createLinearGradient(b.x, b.y, b.x + b.w * 0.55, b.y + b.h);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(0.28, 'rgba(255,255,255,0.03)');
  g.addColorStop(0.29, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(b.x, b.y, b.w, b.h);
  c.restore();
}

/** In front of the lamp lens: the 8 cuts of the faceted jewel and the window on its dome (one specular). */
function paintLensFront(c: Ctx2D): void {
  const L = LAMP;
  c.strokeStyle = 'rgba(0,0,0,0.14)';
  c.lineWidth = lw(0.3);
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    c.moveTo(L.x + Math.cos(a) * 1.3, L.y + Math.sin(a) * 1.3);
    c.lineTo(L.x + Math.cos(a) * L.lens, L.y + Math.sin(a) * L.lens);
  }
  c.stroke();
  c.save();
  c.translate(L.x - 1.6, L.y - 1.8);
  c.rotate(-0.6);
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.beginPath();
  c.ellipse(0, 0, 1.25, 0.6, 0, 0, TAU);
  c.fill();
  c.restore();
  // Reflected light: the dish's cyan on the lower rim of the dome.
  c.strokeStyle = rgba(DISH[0], DISH[1], DISH[2], 0.35);
  c.lineWidth = lw(0.45);
  c.beginPath();
  c.arc(L.x, L.y, L.lens - 0.5, 0.2 * Math.PI, 0.55 * Math.PI);
  c.stroke();
}

function paintFrontFull(c: Ctx2D): void {
  paintGlassFront(c);
  paintLensFront(c);
}

// ── The screen avatar (mini < 56 px, close-up for the dialogue, §4.8 / §6.10) ─────────────────────────

/** Bezel scaled × 1.8 around (41, 42) → (50, 54); lamp × 1.5 at the top-right corner. */
const AV_K = 1.8;
const AV_TX = 50 - 41 * AV_K;
const AV_TY = 54 - 42 * AV_K;
const AVL_K = 1.5;
const AVL_X = 86;
const AVL_Y = 16;

function inBezelSpace(c: Ctx2D, fn: (c: Ctx2D) => void): void {
  const { pxu, k, hair, ox, oy } = F;
  c.save();
  c.translate(AV_TX, AV_TY);
  c.scale(AV_K, AV_K);
  F.pxu = pxu / AV_K;
  F.k = k * AV_K;
  F.hair = hair / AV_K;
  F.ox = ox + AV_TX * k;
  F.oy = oy + AV_TY * k;
  fn(c);
  F.pxu = pxu;
  F.k = k;
  F.hair = hair;
  F.ox = ox;
  F.oy = oy;
  c.restore();
}

function inLampSpace(c: Ctx2D, fn: (c: Ctx2D) => void): void {
  const { pxu, k, hair } = F;
  c.save();
  c.translate(AVL_X, AVL_Y);
  c.scale(AVL_K, AVL_K);
  c.translate(-LAMP.x, -LAMP.y);
  F.pxu = pxu / AVL_K;
  F.k = k * AVL_K;
  F.hair = hair / AVL_K;
  fn(c);
  F.pxu = pxu;
  F.k = k;
  F.hair = hair;
  c.restore();
}

function paintBodyAvatar(c: Ctx2D): void {
  // A soft shadow under the bezel, so the badge sits on any panel.
  c.save();
  c.translate(50.6, 55.4);
  c.scale(1, 0.74);
  const g = c.createRadialGradient(0, 0, 36, 0, 0, 52);
  g.addColorStop(0, 'rgba(5,9,15,0.35)');
  g.addColorStop(1, 'rgba(5,9,15,0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, 52, 0, TAU);
  c.fill();
  c.restore();
  inBezelSpace(c, paintBezel);
  inLampSpace(c, paintLampRing);
}

function paintFrontAvatar(c: Ctx2D): void {
  inBezelSpace(c, paintGlassFront);
  inLampSpace(c, paintLensFront);
}

// ── Layer cache glue ──────────────────────────────────────────────────────────────────────────────────

type Mode = 'full' | 'mini' | 'close';
const keyMemo = new Map<string, string>();
let keyEpoch = -1;
/** 'vela|<part>|<mode>|<lang>|<font epoch>' without building a string per frame. */
function layerKey(part: string, mode: Mode, lang: Lang): string {
  const ep = fontsEpoch();
  if (ep !== keyEpoch) {
    keyMemo.clear();
    keyEpoch = ep;
  }
  const memo = part + mode + lang;
  let k = keyMemo.get(memo);
  if (!k) {
    k = `vela|${part}|${mode}|${lang}|${ep}`;
    keyMemo.set(memo, k);
  }
  return k;
}

// The painter handed to the cache is one module function (no closure per frame); what it paints is set here.
let layerPaint: (c: Ctx2D) => void = () => undefined;
let layerSize = 100;
let layerDpr = 1;
function layerPainter(lc: Ctx2D, w: number, h: number): void {
  lc.scale(w / 100, h / 100);
  setSpace(layerSize, layerDpr, 1);
  layerPaint(lc);
}

/** Draws a cached layer of the whole box (painted on a miss), or paints it directly without a canvas. */
function layer(c: Ctx2D, key: string, paint: (c: Ctx2D) => void): void {
  const { pxu, k, hair, ox, oy } = F;
  layerPaint = paint;
  layerSize = F.size;
  layerDpr = F.dpr;
  const img: LayerCanvas | null = cache.get(key, F.size, F.size, F.dpr, layerPainter);
  F.pxu = pxu;
  F.k = k;
  F.hair = hair;
  F.ox = ox;
  F.oy = oy;
  if (img) c.drawImage(img, 0, 0, 100, 100);
  else paint(c);
}

// ── Dynamic layers (every frame) ──────────────────────────────────────────────────────────────────────

/** A frame's look, filled once per draw (module scratch). */
const D = {
  st: VELA_STATES.neutral,
  mood: 'neutral' as ArtMood,
  ink: INKS.teal,
  t: 0,
  age: 10,
  rm: false,
  talking: false,
  talk: 0,
  /** Screen brightness (state × standby fade). */
  level: 1,
  /** Label opacity (fades in 200 ms on a change). */
  labelA: 1,
  /** Exposure flash of the awed state, 0..1. */
  flash: 0,
  lamp: 0.6,
  K: 2700,
  led: 0,
  beam: -1,
  trace: SCRATCH_TRACE as Float32Array,
  ampK: 1,
  alarm: DEFAULT_ALARM as Text,
  label: null as Text | null,
};

let alarmMemo: { p: Text | null; lang: Lang; s: string } = { p: null, lang: 'es', s: '' };
function alarmText(): string {
  if (alarmMemo.p !== D.alarm || alarmMemo.lang !== F.lang) {
    alarmMemo = { p: D.alarm, lang: F.lang, s: `${stateOf('alarm').label[F.lang]} · ${D.alarm[F.lang]}` };
  }
  return alarmMemo.s;
}

/** Instrument glyphs drawn as vectors (not emoticons, not font-dependent): ✓ ▲ ! ★ ◉. `x` is the left, `y` the middle. */
function glyph(c: Ctx2D, id: GlyphId | 'voice', x: number, y: number, f: number): void {
  switch (id) {
    case 'check':
      c.lineWidth = f * 0.17;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(x + 0.08 * f, y + 0.02 * f);
      c.lineTo(x + 0.32 * f, y + 0.27 * f);
      c.lineTo(x + 0.78 * f, y - 0.32 * f);
      c.stroke();
      return;
    case 'tri':
      c.beginPath();
      c.moveTo(x, y + 0.34 * f);
      c.lineTo(x + 0.41 * f, y - 0.38 * f);
      c.lineTo(x + 0.82 * f, y + 0.34 * f);
      c.closePath();
      c.fill();
      return;
    case 'bang':
      c.fillRect(x + 0.28 * f, y - 0.38 * f, 0.22 * f, 0.5 * f);
      c.fillRect(x + 0.28 * f, y + 0.2 * f, 0.22 * f, 0.17 * f);
      return;
    case 'star': {
      const cx = x + 0.4 * f;
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 0.17 * f : 0.41 * f;
        if (i) c.lineTo(cx + Math.cos(a) * r, y + 0.04 * f + Math.sin(a) * r);
        else c.moveTo(cx + Math.cos(a) * r, y + 0.04 * f + Math.sin(a) * r);
      }
      c.closePath();
      c.fill();
      return;
    }
    case 'voice':
      c.lineWidth = f * 0.09;
      c.beginPath();
      c.arc(x + 0.38 * f, y, 0.32 * f, 0, TAU);
      c.stroke();
      c.beginPath();
      c.arc(x + 0.38 * f, y, 0.13 * f + 0.05 * f * D.talk, 0, TAU);
      c.fill();
      return;
    default:
  }
}

/** The 3-pass phosphor stroke (halo, body, hot core) of trace columns [c0, c1] at opacity `a` (R9). */
function strokeRun(c: Ctx2D, c0: number, c1: number, a: number, w: number): void {
  if (c1 <= c0) return;
  const y = D.trace;
  const k = D.ampK;
  c.beginPath();
  c.moveTo(TR_X0 + c0 * COL_W, TR_CY - y[c0] * k);
  for (let i = c0 + 1; i <= c1; i++) c.lineTo(TR_X0 + i * COL_W, TR_CY - y[i] * k);
  c.globalAlpha = a;
  c.strokeStyle = D.ink.halo;
  c.lineWidth = w * 2.4;
  c.stroke();
  c.strokeStyle = D.ink.mid;
  c.lineWidth = w;
  c.stroke();
  c.strokeStyle = D.ink.core;
  c.globalAlpha = Math.min(1, a * 0.9);
  c.lineWidth = w * 0.42;
  c.stroke();
}

/** Persistence segments (columns behind the beam) and their opacity: the phosphor fades as the sweep ages. */
const SEG_FROM = [0, 14, 40, 76] as const;
const SEG_TO = [14, 40, 76, SCOPE_COLS - GAP] as const;
const SEG_A = [1, 0.86, 0.72, 0.6] as const;

function paintTrace(c: Ctx2D): void {
  const lev = Math.min(1, D.level);
  // Body ≥ 1.2 CSS px (it must read at 28 px) and ~0.85 u in a large portrait.
  const w = Math.max(0.85, lw(1.2));
  c.lineJoin = 'round';
  c.lineCap = 'round';
  if (D.beam < 0) {
    strokeRun(c, 0, SCOPE_COLS - 1, lev, w);
    c.globalAlpha = 1;
    return;
  }
  const head = Math.floor(D.beam);
  for (let s = 0; s < 4; s++) {
    // Columns head - from … head - to, split where they wrap past the left edge of the glass.
    const hi = head - SEG_FROM[s];
    const lo = head - SEG_TO[s];
    const a = SEG_A[s] * lev;
    if (lo >= 0) strokeRun(c, lo, hi, a, w);
    else if (hi >= 0) {
      strokeRun(c, 0, hi, a, w);
      strokeRun(c, SCOPE_COLS + lo, SCOPE_COLS - 1, a, w);
    } else strokeRun(c, SCOPE_COLS + lo, SCOPE_COLS + hi, a, w);
  }
  // The beam itself: a hot dot where it writes.
  const hx = TR_X0 + head * COL_W;
  const hy = TR_CY - D.trace[head] * D.ampK;
  c.globalAlpha = lev;
  c.fillStyle = D.ink.head;
  c.beginPath();
  c.arc(hx, hy, w * 1.5, 0, TAU);
  c.fill();
  c.fillStyle = D.ink.core;
  c.beginPath();
  c.arc(hx, hy, w * 0.55, 0, TAU);
  c.fill();
  c.globalAlpha = 1;
}

/** Graticule 6 × 4 in hairlines with minor ticks on the centre axes (a scope's), never brighter than 10 %. */
function paintGraticule(c: Ctx2D): void {
  c.strokeStyle = INKS.teal.body;
  c.globalAlpha = 0.1 * Math.min(1, D.level);
  c.lineWidth = F.hair;
  c.beginPath();
  for (let i = 1; i < 6; i++) {
    const x = snapX(TR_X0 + (TR_W / 6) * i);
    c.moveTo(x, TR_Y0);
    c.lineTo(x, TR_Y1);
  }
  for (let i = 1; i < 4; i++) {
    const y = snapY(TR_Y0 + ((TR_Y1 - TR_Y0) / 4) * i);
    c.moveTo(TR_X0, y);
    c.lineTo(TR_X0 + TR_W, y);
  }
  if (F.k > 2.2) {
    const yc = snapY(TR_CY);
    for (let i = 1; i < 30; i++) {
      const x = snapX(TR_X0 + (TR_W / 30) * i);
      c.moveTo(x, yc - 0.45);
      c.lineTo(x, yc + 0.45);
    }
    const xc = snapX(TR_X0 + TR_W / 2);
    for (let i = 1; i < 20; i++) {
      const y = snapY(TR_Y0 + ((TR_Y1 - TR_Y0) / 20) * i);
      c.moveTo(xc - 0.45, y);
      c.lineTo(xc + 0.45, y);
    }
  }
  c.stroke();
  c.globalAlpha = 1;
}

/**
 * Everything behind the glass, in the bezel's own units (§4.4 step 10): background → graticule → status row →
 * trace (3 passes) → label → flash. `detail`: 2 = status row and full label, 1 = glyph only, 0 = no label.
 */
function paintScreen(c: Ctx2D, detail: 0 | 1 | 2): void {
  const b = GLASS;
  const st = D.st;
  const ink = D.ink;
  const lev = Math.min(1, D.level);
  c.save();
  clipPath(c, P.glass);
  c.fillStyle = MATERIAL.glass;
  c.fillRect(b.x, b.y, b.w, b.h);
  // The panel never reaches true black: a floor of emission in the state's ink.
  c.globalAlpha = Math.min(1, 0.9 * D.level);
  c.fillStyle = ink.tint;
  c.fillRect(b.x, b.y, b.w, b.h);
  c.globalAlpha = 1;
  if (detail > 0) paintGraticule(c);
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  if (detail === 2) {
    c.font = mono(500, 2.2);
    c.fillStyle = ink.body;
    c.globalAlpha = 0.72 * lev;
    c.fillText('MC-7', b.x + 1.6, b.y + 2.6);
    c.fillText(READOUT[F.lang], b.x + 9.5, b.y + 2.6);
    c.globalAlpha = 1;
  }
  // The trace, or what stands in for it.
  if (st.trace === 'sleep' && !D.talking) {
    const x = TR_X0 + (D.rm ? 10 : mod(D.t * 2.2, TR_W));
    c.globalAlpha = 0.35 * Math.max(0.3, lev);
    c.fillStyle = ink.body;
    c.beginPath();
    c.arc(x, TR_CY, 0.5, 0, TAU);
    c.fill();
    c.globalAlpha = 1;
  } else {
    if (st.trace === 'scan') {
      // The scan bar sweeps at 0.8 Hz: a fading wake and a bright leading edge.
      const x = TR_X0 + (D.rm ? 0.62 : mod(D.t * 0.8, 1)) * TR_W;
      c.fillStyle = ink.body;
      for (let i = 0; i < 4; i++) {
        c.globalAlpha = (0.1 - i * 0.022) * lev;
        c.fillRect(x - (i + 1) * 1.1, TR_Y0, 1.1, TR_Y1 - TR_Y0);
      }
      c.globalAlpha = 0.75 * lev;
      c.fillRect(x - lw(0.5), TR_Y0, lw(1), TR_Y1 - TR_Y0);
      c.globalAlpha = 1;
    }
    paintTrace(c);
  }
  // Label (or the alarm band).
  const yL = b.y + b.h - 3.2;
  if (D.mood === 'alarm' && detail > 0) {
    c.fillStyle = 'rgba(255,90,74,0.92)';
    c.fillRect(b.x, b.y + b.h - 6.6, b.w, 6.6);
    // 45° hazard hatch, each stroke cut to the band by hand (no clip, every vertex inside the glass).
    c.strokeStyle = 'rgba(60,0,0,0.25)';
    c.lineWidth = 1.1;
    c.beginPath();
    const bot = b.y + b.h;
    const right = b.x + b.w;
    for (let x = b.x - 6.6; x < right; x += 2.6) {
      const x0 = Math.max(b.x, x);
      const x1 = Math.min(right, x + 6.6);
      c.moveTo(x0, bot - (x0 - x));
      c.lineTo(x1, bot - (x1 - x));
    }
    c.stroke();
    c.fillStyle = '#1a0300';
    if (detail === 2) {
      c.font = mono(700, 2.6);
      c.fillText(alarmText(), b.x + 1.8, yL);
    } else {
      c.font = mono(700, 4.4);
      c.fillText('!', b.x + 2, yL - 0.4);
    }
  } else if (detail > 0) {
    c.globalAlpha = D.labelA * Math.max(0.55, lev);
    c.fillStyle = ink.body;
    c.strokeStyle = ink.body;
    if (detail === 1) {
      // Mini: one big glyph (or the voice ring) reads where words cannot.
      const f = 7;
      const id: GlyphId | 'voice' = D.talking ? 'voice' : st.glyph;
      if (id) glyph(c, id, b.x + 1.8, b.y + b.h - 4.2, f);
    } else {
      const f = 2.7;
      const font = mono(700, f);
      const adv = advance(c, font, f);
      c.font = font;
      let x = b.x + 1.8;
      if (D.talking) {
        glyph(c, 'voice', x, yL, f);
        x += f * 1.2;
        const v = VOICE_LABEL[F.lang];
        c.fillText(v, x, yL);
        x += adv * (v.length + 1.4);
      }
      if (st.glyph) {
        glyph(c, st.glyph, x, yL, f);
        x += f * 1.2;
      }
      const label = (D.label ?? st.label)[F.lang];
      c.fillText(label, x, yL);
      if (D.mood === 'thinking') {
        // «…» typing out at 2.5 Hz (still under Reduce motion: all three).
        const n = D.rm ? 3 : 1 + (Math.floor(D.t * 2.5) % 3);
        const x0 = x + adv * label.length + 0.3;
        for (let i = 0; i < n; i++) c.fillRect(x0 + i * adv * 0.62, yL + 0.5, 0.5, 0.5);
      }
    }
    c.globalAlpha = 1;
  }
  // Exposure flash (awed): one per state change, 120 ms up and 600 ms down.
  if (D.flash > 0.01) {
    c.globalAlpha = 0.32 * D.flash;
    c.fillStyle = ink.body;
    c.fillRect(b.x, b.y, b.w, b.h);
    c.globalAlpha = 1;
  }
  // Worried: an amber frame of 0.5 px inside the glass.
  if (D.mood === 'worried') {
    c.strokeStyle = ink.body;
    c.globalAlpha = 0.7 * D.labelA;
    c.lineWidth = lw(1);
    strokePath(c, P.glass);
    c.globalAlpha = 1;
  }
  c.restore();
}

/** The phosphor's light on the bezel's inner chamfer, in the state's ink (it tints the metal amber or red). */
function paintScreenSpill(c: Ctx2D): void {
  c.save();
  clipPath(c, BEZEL_RING, 'evenodd');
  c.strokeStyle = D.ink.body;
  c.globalAlpha = 0.12 * Math.min(1, D.level);
  c.lineWidth = lw(2.2);
  strokePath(c, P.glass);
  c.restore();
}

// Per-frame light without per-frame gradients: every gradient below lives in user space, so it is made once per
// context (and colour temperature, in 50-K steps) and drawn with globalAlpha for the brightness.
const OFF_RGB: RGB = [60, 38, 20];
const OFF_RGB2: RGB = [27, 17, 9];
const CORE_RGB: RGB = [255, 246, 224];
const G_LENS = 1;
const G_HALO = 2;
const G_LED = 3;
const G_LED_HALO = 4;
const G_LED_OFF = 5;
const dynGrad = new WeakMap<object, Map<number, CanvasGradient>>();

function mixTo(from: RGB, to: RGB, k: number): string {
  return rgba(from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k, 1);
}

/** `kb`: colour temperature in 50-K steps; `r`: the halo radius, or 1 / 2 for the small / big LED. */
function buildGradient(c: Ctx2D, kind: number, kb: number, r: number): CanvasGradient {
  const L = LAMP;
  switch (kind) {
    case G_LENS: {
      // The lit lens at full brightness; over the unlit one at alpha `on` it is exactly off + (lit − off)·on.
      const K = kb * 50;
      const g = c.createRadialGradient(L.x - 1.1, L.y - 1.2, 0.2, L.x, L.y, L.lens);
      g.addColorStop(0, mixTo(OFF_RGB, CORE_RGB, 1));
      g.addColorStop(0.28, mixTo(OFF_RGB, kelvin(K), 1));
      g.addColorStop(0.72, mixTo(OFF_RGB, kelvin(Math.max(1900, K - 700)), 0.9));
      g.addColorStop(1, mixTo(OFF_RGB2, kelvin(1900), 0.55));
      return g;
    }
    case G_HALO: {
      const hot = kelvin(kb * 50);
      const g = c.createRadialGradient(L.x, L.y, L.lens * 0.6, L.x, L.y, r);
      g.addColorStop(0, rgba(hot[0], hot[1], hot[2], 0.42));
      g.addColorStop(Math.min(0.9, 9 / r), rgba(hot[0], hot[1], hot[2], 0.1));
      g.addColorStop(1, rgba(hot[0], hot[1], hot[2], 0));
      return g;
    }
    case G_LED:
    case G_LED_HALO: {
      const x = r === 1 ? LED.x : L.x;
      const y = r === 1 ? LED.y : L.y;
      const rr0 = r === 1 ? LED.r : L.lens;
      if (kind === G_LED_HALO) {
        const h = c.createRadialGradient(x, y, rr0 * 0.4, x, y, rr0 * 4.8);
        h.addColorStop(0, 'rgba(255,59,46,0.45)');
        h.addColorStop(1, 'rgba(255,59,46,0)');
        return h;
      }
      const g = c.createRadialGradient(x - rr0 * 0.25, y - rr0 * 0.25, rr0 * 0.08, x, y, rr0);
      g.addColorStop(0, '#ffd9d2');
      g.addColorStop(1, '#ff3b2e');
      return g;
    }
    default: {
      const g = c.createRadialGradient(L.x - 1, L.y - 1, 0.3, L.x, L.y, L.lens);
      g.addColorStop(0, '#5a2320');
      g.addColorStop(1, '#2a0d0b');
      return g;
    }
  }
}

function dynGradient(c: Ctx2D, kind: number, kb: number, r: number): CanvasGradient {
  let m = dynGrad.get(c);
  if (!m) {
    m = new Map();
    dynGrad.set(c, m);
  }
  const key = kind * 1e6 + kb * 1000 + r;
  let g = m.get(key);
  if (!g) {
    g = buildGradient(c, kind, kb, r);
    m.set(key, g);
  }
  return g;
}

const kBucket = (K: number): number => Math.round(K / 50);

/** The unlit lens (static: part of the cached body). */
function paintLensOff(c: Ctx2D): void {
  const L = LAMP;
  const g = c.createRadialGradient(L.x - 1.1, L.y - 1.2, 0.2, L.x, L.y, L.lens);
  g.addColorStop(0, mixTo(OFF_RGB, OFF_RGB, 0));
  g.addColorStop(0.72, mixTo(OFF_RGB, OFF_RGB, 0));
  g.addColorStop(1, mixTo(OFF_RGB2, OFF_RGB2, 0));
  c.fillStyle = g;
  fillPath(c, P.lens);
}

/** The lens lit by the filament: blackbody colour at K (§4.3, R5), mixed from the unlit lens by the brightness. */
function paintLens(c: Ctx2D, on: number, K: number): void {
  if (on <= 0.004) return;
  c.globalAlpha = Math.min(1, on);
  c.fillStyle = dynGradient(c, G_LENS, kBucket(K), 0);
  fillPath(c, P.lens);
  c.globalAlpha = 1;
}

/** The lamp's light on the front (screen blend): an inner glow and a wide one (r 24) in one gradient. */
function paintHalo(c: Ctx2D, on: number, K: number, r: number, clip: string | null): void {
  if (on <= 0.01) return;
  const L = LAMP;
  c.save();
  if (clip) clipPath(c, clip);
  c.globalCompositeOperation = 'screen';
  c.globalAlpha = Math.min(1, on);
  c.fillStyle = dynGradient(c, G_HALO, kBucket(K), r);
  c.fillRect(L.x - r, L.y - r, 2 * r, 2 * r);
  c.restore();
}

const rimByCtx = new WeakMap<object, CanvasGradient>();
/** Rim light (§3.6 layer 6): the lamp grazes the bezel's right rail, as bright as the lamp is. */
function paintBezelRim(c: Ctx2D, on: number): void {
  let g = rimByCtx.get(c);
  if (!g) {
    g = c.createLinearGradient(66.5, 0, 62, 0);
    g.addColorStop(0, 'rgba(255,177,110,0.45)');
    g.addColorStop(1, 'rgba(255,177,110,0)');
    rimByCtx.set(c, g);
  }
  c.globalAlpha = Math.min(1, on * 1.2);
  c.strokeStyle = g;
  c.lineWidth = lw(0.55);
  c.beginPath();
  c.moveTo(66.15, 27);
  c.lineTo(66.15, 57);
  c.stroke();
  c.globalAlpha = 1;
}

/** The lit alarm LED and its red halo (§4.3): `big` is the mini's LED in the lamp's ring. Unlit, it is the body's. */
function paintLedLit(c: Ctx2D, big: boolean): void {
  const x = big ? LAMP.x : LED.x;
  const y = big ? LAMP.y : LED.y;
  const r = big ? LAMP.lens : LED.r;
  const code = big ? 2 : 1;
  c.fillStyle = dynGradient(c, G_LED, 0, code);
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  c.save();
  c.globalCompositeOperation = 'screen';
  c.fillStyle = dynGradient(c, G_LED_HALO, 0, code);
  c.fillRect(x - r * 4.8, y - r * 4.8, r * 9.6, r * 9.6);
  c.restore();
  c.fillStyle = 'rgba(255,255,255,0.6)';
  c.beginPath();
  c.arc(x - r * 0.32, y - r * 0.36, r * 0.26, 0, TAU);
  c.fill();
}

// ── Wardrobe (§4.10): the same ids, drawn as objects that hang on an instrument ──────────────────────

const WEAR_SCARF = 1;
const WEAR_MEDAL = 2;
const WEAR_FLOWER = 4;
function wearMask(wear: readonly string[] | undefined): number {
  let m = 0;
  if (!wear) return 0;
  for (let i = 0; i < wear.length; i++) {
    const w = wear[i];
    if (w === 'scarf') m |= WEAR_SCARF;
    else if (w === 'medal') m |= WEAR_MEDAL;
    else if (w === 'flower') m |= WEAR_FLOWER;
  }
  return m;
}

/** Albor's mustard scarf, knotted on the handle and hanging down the left (knit ribs, a cylinder ramp each). */
const SCARF_TAIL_FRONT = 'M25.2 8.4C19.4 9.6 14 12.2 12.1 17.6L10.7 45.6L16.4 46.4L17.5 20.8C18.9 16.6 22.4 14 27.4 12.6Z';
const SCARF_TAIL_BACK = 'M23.4 9.2C16.8 10.6 10.2 13.4 7.6 18.6L4.6 40.2L9.7 41.4L12.8 21.4C14.8 17.2 19 14.4 24.6 13.2Z';
const SCARF_KNOT = 'M24 6.2C26.2 4.9 30.6 4.8 32.6 6.2C34 7.6 34.1 10.6 32.7 12.1C30.6 13.6 26.1 13.7 24.1 12.3C22.6 10.8 22.6 7.6 24 6.2Z';
const MUSTARD = ['#6e4d10', '#d8ab3f', '#c4952c', '#e7c46a', '#5d410d'] as const;

function knitTail(c: Ctx2D, d: string, x0: number, x1: number, y0: number, y1: number, ribs: number, shade: number): void {
  c.fillStyle = '#b8892a';
  fillPath(c, d);
  c.save();
  clipPath(c, d);
  // Ribs: columns of stitches, each a little cylinder (dark edge · light · local · bounce · dark edge).
  const w = (x1 - x0) / ribs;
  for (let i = 0; i < ribs; i++) {
    const a = x0 + i * w;
    c.fillStyle = cylinderRamp(c, a, 0, a + w, 0, MUSTARD, [0, 0.3, 0.55, 0.8, 1]);
    c.fillRect(a, y0, w, y1 - y0);
  }
  // Stitch rows every 0.8 u: a fine dark line and its lit lip.
  for (let y = y0; y < y1; y += 0.8) {
    c.fillStyle = 'rgba(70,45,8,0.28)';
    c.fillRect(x0 - 4, y, x1 - x0 + 8, lw(0.4));
    c.fillStyle = 'rgba(255,236,170,0.12)';
    c.fillRect(x0 - 4, y + lw(0.4), x1 - x0 + 8, lw(0.35));
  }
  // Form shadow: the tail folds away from the window towards its bottom and right.
  c.globalCompositeOperation = 'multiply';
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, shade > 0.5 ? '#9c8a6a' : '#c9b48f');
  c.fillStyle = g;
  c.fillRect(x0 - 4, y0, x1 - x0 + 8, y1 - y0);
  c.globalCompositeOperation = 'source-over';
  c.restore();
  c.strokeStyle = 'rgba(40,26,4,0.85)';
  c.lineWidth = lw(0.75);
  strokePath(c, d);
}

function paintScarf(c: Ctx2D): void {
  knitTail(c, SCARF_TAIL_BACK, 4, 25, 9, 42, 5, 1);
  // Fringe of the back tail.
  c.strokeStyle = '#a77d22';
  c.lineWidth = lw(0.8);
  c.lineCap = 'round';
  c.beginPath();
  for (let i = 0; i < 5; i++) {
    const x = 5.1 + i * 1;
    c.moveTo(x, 40.6 + i * 0.22);
    c.lineTo(x - 0.25, 43.2 + i * 0.22);
  }
  c.stroke();
  knitTail(c, SCARF_TAIL_FRONT, 10, 28, 8, 47, 4, 0);
  c.strokeStyle = '#c99a33';
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const x = 11.2 + i * 1;
    c.moveTo(x, 46 + i * 0.12);
    c.lineTo(x + 0.15, 48.8 + i * 0.12);
  }
  c.stroke();
  c.lineCap = 'butt';
  // The knot round the tube: wraps of knit, the window's light on the top.
  c.fillStyle = cylinderRamp(c, 0, 4.8, 0, 13.8, MUSTARD, [0, 0.26, 0.52, 0.82, 1]);
  fillPath(c, SCARF_KNOT);
  c.save();
  clipPath(c, SCARF_KNOT);
  c.strokeStyle = 'rgba(70,45,8,0.45)';
  c.lineWidth = lw(0.5);
  c.beginPath();
  for (let i = 0; i < 5; i++) {
    const x = 24.6 + i * 1.8;
    c.moveTo(x, 4.6);
    c.quadraticCurveTo(x + 0.9, 9.4, x, 14);
  }
  c.stroke();
  c.restore();
  c.strokeStyle = 'rgba(40,26,4,0.85)';
  c.lineWidth = lw(0.75);
  strokePath(c, SCARF_KNOT);
}

/** A bioluminescent flower in a test tube, clipped to the right flank: glass with Fresnel edges, light petals. */
const TUBE = 'M93.2 25.4H96.8V50.6A1.8 1.8 0 0 1 93.2 50.6Z';
function paintFlower(c: Ctx2D): void {
  // Spring clip on the flank.
  c.fillStyle = cylinderRamp(c, 0, 33.4, 0, 37.2, ['#3c3f42', '#e3e4e4', '#8f9397', '#b9c7ce', '#2f3235']);
  c.fillRect(91.4, 33.4, 6.2, 3.8);
  c.strokeStyle = 'rgba(0,0,0,0.75)';
  c.lineWidth = lw(0.6);
  c.strokeRect(91.4, 33.4, 6.2, 3.8);
  // Water, stem and the glass's faint body.
  c.save();
  clipPath(c, TUBE);
  c.fillStyle = 'rgba(190,225,240,0.10)';
  c.fillRect(93.2, 25.4, 3.6, 27);
  c.fillStyle = rgba(DISH[0], DISH[1], DISH[2], 0.16);
  c.fillRect(93.2, 39.5, 3.6, 13);
  c.restore();
  c.strokeStyle = '#2f5d4a';
  c.lineWidth = lw(1.1);
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(95.1, 51);
  c.quadraticCurveTo(94.4, 36, 95.4, 22.6);
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.6)';
  c.lineWidth = lw(0.4);
  c.beginPath();
  c.moveTo(93.4, 39.5);
  c.lineTo(96.6, 39.5);
  c.stroke();
  // Glass: Fresnel brightens the edges, one specular streak faces the window, the dish lights the bottom.
  c.strokeStyle = 'rgba(225,240,248,0.7)';
  c.lineWidth = lw(0.6);
  strokePath(c, TUBE);
  c.strokeStyle = 'rgba(255,255,255,0.8)';
  c.lineWidth = lw(0.6);
  c.beginPath();
  c.moveTo(93.9, 27);
  c.lineTo(93.9, 47);
  c.stroke();
  c.strokeStyle = rgba(DISH[0], DISH[1], DISH[2], 0.5);
  c.beginPath();
  c.arc(95, 50.6, 1.35, 0.15 * Math.PI, 0.85 * Math.PI);
  c.stroke();
  c.lineCap = 'butt';
  // Petals of light (the one living thing VELA wears).
  c.save();
  c.globalCompositeOperation = 'screen';
  const halo = c.createRadialGradient(95.4, 21.4, 0.5, 95.4, 21.4, 6);
  halo.addColorStop(0, 'rgba(120,225,255,0.5)');
  halo.addColorStop(1, 'rgba(120,225,255,0)');
  c.fillStyle = halo;
  c.fillRect(89.4, 15.4, 12, 12);
  c.restore();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * TAU;
    c.save();
    c.translate(95.4 + Math.cos(a) * 1.5, 21.4 + Math.sin(a) * 1.5);
    c.rotate(a);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1.6);
    g.addColorStop(0, '#e9fbff');
    g.addColorStop(0.6, '#8fe0f6');
    g.addColorStop(1, 'rgba(91,192,235,0.5)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(0, 0, 1.6, 0.95, 0, 0, TAU);
    c.fill();
    c.restore();
  }
  c.fillStyle = '#ffe9a8';
  c.beginPath();
  c.arc(95.4, 21.4, 0.62, 0, TAU);
  c.fill();
}

function paintWear(c: Ctx2D, mask: number): void {
  if (mask & WEAR_FLOWER) paintFlower(c);
  if (mask & WEAR_SCARF) paintScarf(c);
}

/** The Committee's medal on its ribbon (brass, turned: conic; the ribbon a cylinder ramp), hung from the tube. */
const MEDAL_PIVOT = { x: 64, y: 9.4 } as const;
function paintMedal(c: Ctx2D): void {
  const cx = 64;
  const cy = 19.2;
  // Ribbon: a folded V of grosgrain, navy with a gold centre stripe.
  for (const [x0, x1] of [
    [61.4, 64.2],
    [64, 66.8],
  ] as const) {
    c.fillStyle = cylinderRamp(c, x0, 0, x1, 0, ['#14223a', '#3a5f8c', '#23406a', '#2f6f8f', '#101b2e']);
    c.beginPath();
    c.moveTo(x0, 8.6);
    c.lineTo(x1, 8.6);
    c.lineTo(x1 === 64.2 ? 65 : 66.2, 16.4);
    c.lineTo(x0 === 61.4 ? 62.4 : 63, 16.4);
    c.closePath();
    c.fill();
  }
  c.fillStyle = 'rgba(231,196,106,0.85)';
  c.fillRect(63.55, 8.6, 0.9, 7.8);
  c.strokeStyle = 'rgba(0,0,0,0.6)';
  c.lineWidth = lw(0.5);
  c.strokeRect(61.4, 8.6, 5.4, 7.8);
  // The jump ring and the disc.
  c.strokeStyle = '#b48a32';
  c.lineWidth = lw(0.8);
  c.beginPath();
  c.arc(cx, 16.2, 0.6, 0, TAU);
  c.stroke();
  c.fillStyle = conicMetal(c, cx, cy, -0.8, '#fff0b8', '#9a6c1c', 5, 3.3);
  c.beginPath();
  c.arc(cx, cy, 3.3, 0, TAU);
  c.fill();
  c.fillStyle = conicMetal(c, cx, cy, -0.4, '#f3d277', '#b07f26', 3, 2.4);
  c.beginPath();
  c.arc(cx, cy, 2.45, 0, TAU);
  c.fill();
  // Embossed: a ring of life (an Orbium's halo) with its dot; lit up-left, shaded down-right.
  c.lineWidth = lw(0.6);
  c.strokeStyle = 'rgba(255,248,214,0.85)';
  c.beginPath();
  c.arc(cx - 0.08, cy - 0.08, 1.25, 0, TAU);
  c.stroke();
  c.strokeStyle = 'rgba(110,72,10,0.7)';
  c.beginPath();
  c.arc(cx + 0.08, cy + 0.08, 1.25, 0, TAU);
  c.stroke();
  c.fillStyle = 'rgba(120,80,14,0.8)';
  c.beginPath();
  c.arc(cx + 0.45, cy - 0.35, 0.42, 0, TAU);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.8)';
  c.beginPath();
  c.ellipse(cx - 1.4, cy - 1.6, 0.8, 0.38, -0.7, 0, TAU);
  c.fill();
  c.strokeStyle = 'rgba(40,26,4,0.85)';
  c.lineWidth = lw(0.75);
  c.beginPath();
  c.arc(cx, cy, 3.3, 0, TAU);
  c.stroke();
}

/** The medal swings like a damped pendulum (ζ 0.15, 1.2 Hz) when the state changes (§4.10, §6.4); still under rm. */
function medalAngle(age: number, rm: boolean): number {
  if (rm) return 0;
  const w = TAU * 1.2;
  const z = 0.15;
  return 0.12 * Math.exp(-z * w * age) * Math.cos(w * Math.sqrt(1 - z * z) * age);
}

// ── Scale and the entry points ────────────────────────────────────────────────────────────────────────

/** Size of the box in CSS px from the options, or from the transform (scenes), quantised so caches hold. */
function resolveScale(ctx: Ctx2D, opts: VelaDrawOptions): void {
  const dprEnv = typeof globalThis.devicePixelRatio === 'number' && globalThis.devicePixelRatio > 0 ? globalThis.devicePixelRatio : 1;
  if (opts.size && opts.size > 0) {
    setSpace(opts.size, opts.dpr && opts.dpr > 0 ? opts.dpr : dprEnv, 1);
    return;
  }
  const m = typeof ctx.getTransform === 'function' ? (ctx.getTransform() as DOMMatrix | undefined) : undefined;
  if (m && Number.isFinite(m.a) && Number.isFinite(m.b)) {
    const dev = Math.hypot(m.a, m.b) * 100;
    // 2^(1/8) steps: a scene that zooms VELA repaints her cache at most every 9 %.
    const q = dev > 1 ? Math.pow(2, Math.round(Math.log2(dev) * 8) / 8) : 100;
    const dpr = Math.min(3, dprEnv);
    setSpace(q / dpr, dpr, 1);
    return;
  }
  setSpace(100, 1, 1);
}

function frameLook(s: VelaPose, t: number, opts: VelaDrawOptions): void {
  const st = stateOf(s.mood);
  const rm = s.reduceMotion;
  const age = Math.max(0, s.moodAge);
  D.st = st;
  D.mood = VELA_STATES[s.mood] ? s.mood : 'neutral';
  D.ink = INKS[st.ink];
  D.t = t;
  D.age = age;
  D.rm = rm;
  D.talking = s.talking || (!rm && !!opts.scope && opts.scope.speaking);
  D.talk = rm ? 0.6 : clamp01(s.talk);
  D.alarm = opts.alarm ?? DEFAULT_ALARM;
  D.label = opts.label ?? null;
  // Standby dims the screen in 400 ms; the label fades in over 200 ms; the awed flash is one per change.
  const fade = rm ? 1 : clamp01(age / 0.4);
  D.level = st.screen + (1 - st.screen) * (1 - fade) * (s.mood === 'sleepy' ? 1 : 0);
  if (s.mood === 'sleepy' && s.talking) D.level = Math.max(D.level, 0.6);
  D.labelA = rm ? 1 : clamp01(age / 0.2);
  D.flash = rm || s.mood !== 'awed' ? 0 : age < 0.12 ? age / 0.12 : Math.exp(-(age - 0.12) / 0.25);
  const sc = opts.scope && !rm ? opts.scope : null;
  if (sc) {
    D.trace = sc.y;
    D.beam = sc.beam;
    D.lamp = sc.lamp;
    D.K = sc.kelvin;
  } else {
    D.trace = SCRATCH_TRACE;
    D.beam = velaTrace(SCRATCH_TRACE, s.mood, t, s.moodAge, s.talk, s.talking, rm);
    velaLamp(s.mood, t, s.moodAge, s.talk, s.blink, rm, SCRATCH_LAMP);
    D.lamp = SCRATCH_LAMP.on;
    D.K = SCRATCH_LAMP.K;
  }
  D.led = velaLed(s.mood, t, rm);
  D.ampK = opts.mini ? 0.8 : 1;
}

let wearNow = 0;
function paintWearNow(c: Ctx2D): void {
  paintWear(c, wearNow);
}

function drawFull(c: Ctx2D, s: VelaPose): void {
  const lang = F.lang;
  layer(c, layerKey('body', 'full', lang), paintBodyFull);
  paintScreen(c, 2);
  paintScreenSpill(c);
  paintLens(c, D.lamp, D.K);
  layer(c, layerKey('front', 'full', 'es'), paintFrontFull);
  paintHalo(c, D.lamp, D.K, 24, P.fascia);
  paintBezelRim(c, D.lamp);
  if (D.led) paintLedLit(c, false);
  const mask = wearMask(s.wear);
  wearNow = mask & (WEAR_SCARF | WEAR_FLOWER);
  if (wearNow) layer(c, WEAR_KEYS[wearNow], paintWearNow);
  if (mask & WEAR_MEDAL) {
    const a = medalAngle(D.age, D.rm);
    c.save();
    if (a !== 0) {
      c.translate(MEDAL_PIVOT.x, MEDAL_PIVOT.y);
      c.rotate(a);
      c.translate(-MEDAL_PIVOT.x, -MEDAL_PIVOT.y);
    }
    layer(c, 'vela|medal', paintMedal);
    c.restore();
  }
}
const WEAR_KEYS = ['', 'vela|wear|1', 'vela|wear|2', 'vela|wear|3', 'vela|wear|4', 'vela|wear|5', 'vela|wear|6', 'vela|wear|7'];

let avatarDetail: 0 | 1 | 2 = 2;
function paintAvatarScreen(b: Ctx2D): void {
  paintScreen(b, avatarDetail);
  paintScreenSpill(b);
}
function paintAvatarLamp(l: Ctx2D): void {
  if (D.mood !== 'alarm') {
    paintLens(l, D.lamp, D.K);
    return;
  }
  // The lamp gives way to a big red LED in the same ring (§4.8).
  if (D.led) paintLedLit(l, true);
  else {
    l.fillStyle = dynGradient(l, G_LED_OFF, 0, 2);
    fillPath(l, P.lens);
  }
}
function paintAvatarHalo(l: Ctx2D): void {
  paintHalo(l, D.lamp * 0.8, D.K, 10, null);
}

function drawAvatar(c: Ctx2D, mode: Mode): void {
  layer(c, layerKey('body', mode, F.lang), paintBodyAvatar);
  avatarDetail = mode === 'close' ? 2 : F.size >= 40 ? 1 : 0;
  inBezelSpace(c, paintAvatarScreen);
  inLampSpace(c, paintAvatarLamp);
  layer(c, layerKey('front', mode, 'es'), paintFrontAvatar);
  if (D.mood !== 'alarm') inLampSpace(c, paintAvatarHalo);
}

/**
 * Draw VELA into the 100 × 100 box. `opts.mini` is the < 56-px avatar (bezel, screen and lamp only; §4.8),
 * `opts.close` the same close-up with the screen's words (§6.10). `opts.scope` is the Portrait's live trace.
 */
export function drawVelaArt(ctx: Ctx2D, s: VelaPose, t: number, opts: VelaDrawOptions = {}): void {
  resolveScale(ctx, opts);
  F.lang = opts.lang === 'en' ? 'en' : 'es';
  frameLook(s, t, opts);
  ctx.save();
  if (opts.mini || opts.close) drawAvatar(ctx, opts.mini ? 'mini' : 'close');
  else drawFull(ctx, s);
  ctx.restore();
}

/**
 * The pilot lamp alone (chrome ring, lit lens, its glow), centred at (x, y) with the portrait's proportions
 * (ring r 6.4 units of the current transform): for scenes that light a room with VELA's lamp. Replaces the
 * flask's candle flame.
 */
export function drawPilotLamp(ctx: Ctx2D, x: number, y: number, mood: ArtMood, t: number, rm: boolean, talk = 0): void {
  resolveScale(ctx, {});
  velaLamp(mood, t, 10, talk, 0, rm, SCRATCH_LAMP);
  ctx.save();
  ctx.translate(x - LAMP.x, y - LAMP.y);
  layer(ctx, 'vela|lamp', paintLampRing);
  paintLens(ctx, SCRATCH_LAMP.on, SCRATCH_LAMP.K);
  layer(ctx, 'vela|lens', paintLensFront);
  paintHalo(ctx, SCRATCH_LAMP.on, SCRATCH_LAMP.K, 24, null);
  ctx.restore();
}
