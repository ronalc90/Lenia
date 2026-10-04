/**
 * Render style of the screen pass: the dish and the accent colours that used to be constants in
 * shaders.ts RENDER. Cosmetics (src/store/apply.ts renderStyleFor) pass a style through
 * `WebGLSimulation.setRenderStyle`; nothing here touches the simulation itself.
 *
 * All colours are linear 0..1 RGB triples ready for gl.uniform3fv (the shader treats them exactly
 * like the old constants: no gamma conversion).
 */

export type Vec3 = readonly [number, number, number];

export interface SimRenderStyle {
  bg: Vec3;
  agarIn: Vec3;
  agarOut: Vec3;
  rim: Vec3;
  /** Rim line intensity (default 0.22). */
  rimAmt: number;
  /** 'double' adds a second rim line 3 px inside; 'glow' widens the outer rim halo. */
  rimStyle: 'line' | 'double' | 'glow';
  /** Iso-contour and edge sheen (the old CYAN). */
  contour: Vec3;
  glowCore: Vec3;
  glowWide: Vec3;
  /** Multiplier applied to matter in shadowed relief. */
  shadow: Vec3;
  /** Optional lab grid over the agar, rgba 0..1; a = 0 disables it. */
  grid: readonly [number, number, number, number];
}

/** Exactly the constants the RENDER shader had before styles existed (today's look). */
export const DEFAULT_RENDER_STYLE: SimRenderStyle = Object.freeze({
  bg: [11 / 255, 14 / 255, 18 / 255],
  agarIn: [20 / 255, 27 / 255, 34 / 255],
  agarOut: [14 / 255, 19 / 255, 25 / 255],
  rim: [91 / 255, 192 / 255, 235 / 255],
  rimAmt: 0.22,
  rimStyle: 'line',
  contour: [0.4, 0.9, 1.0],
  glowCore: [0.45, 0.85, 1.0],
  glowWide: [0.28, 0.36, 0.95],
  shadow: [0.42, 0.7, 1.0],
  grid: [0, 0, 0, 0],
} as SimRenderStyle);

/** Rim halo factor outside the dish (shader `uRimHalo`): 'glow' rims are wider. */
export const RIM_HALO = { normal: 0.025, glow: 0.06 } as const;

/**
 * Half an 8-bit step (plus a hair): catalog colours are '#RRGGBB', and the old shader constants
 * (e.g. CYAN = 0.40, 0.90, 1.00) are not representable in hex. A hex colour that rounds to a
 * built-in constant IS that constant by intent, so it snaps back and the default look stays
 * bit-identical.
 */
const SNAP = 0.51 / 255;

function snap(v: Vec3, def: Vec3): Vec3 {
  for (let i = 0; i < 3; i++) if (!(Math.abs(v[i] - def[i]) <= SNAP)) return clamp3(v);
  return def;
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const clamp3 = (v: Vec3): Vec3 => [clamp01(v[0]), clamp01(v[1]), clamp01(v[2])];

/** Validated copy of a style: clamped values, defaults snapped exactly (see SNAP). */
export function normalizeRenderStyle(s: SimRenderStyle): SimRenderStyle {
  const d = DEFAULT_RENDER_STYLE;
  const rimAmt = Number.isFinite(s.rimAmt) ? Math.min(0.5, Math.max(0, s.rimAmt)) : d.rimAmt;
  const g = s.grid ?? d.grid;
  return {
    bg: snap(s.bg, d.bg),
    agarIn: snap(s.agarIn, d.agarIn),
    agarOut: snap(s.agarOut, d.agarOut),
    rim: snap(s.rim, d.rim),
    rimAmt: Math.abs(rimAmt - d.rimAmt) < 1e-9 ? d.rimAmt : rimAmt,
    rimStyle: s.rimStyle === 'double' || s.rimStyle === 'glow' ? s.rimStyle : 'line',
    contour: snap(s.contour, d.contour),
    glowCore: snap(s.glowCore, d.glowCore),
    glowWide: snap(s.glowWide, d.glowWide),
    shadow: snap(s.shadow, d.shadow),
    grid: [clamp01(g[0]), clamp01(g[1]), clamp01(g[2]), clamp01(g[3])],
  };
}
