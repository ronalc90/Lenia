/**
 * Recommended matter palette (docs/ARTE.md §8) — data for the dish agent; nothing here touches the
 * simulation. Three things:
 *
 *  1. MATTER_ART.night — the 256-entry colormap of the dish (both themes: the dish is always night,
 *     GDD §14). Same idea as core/palette MATTER_STOPS (indigo → cyan → warm white), but the white
 *     arrives later (0.86 instead of 0.7) so a creature's inner structure stays visible instead of
 *     blowing out, and luminance rises evenly (tested).
 *     MATTER_ART.paper — the same creatures as ink on paper, for portraits on light surfaces
 *     (Bestiary cards in the light theme), never for the dish.
 *  2. Species tints: one LUT row per colour family of src/species COLOR_FAMILIES. The family hue
 *     replaces the body (mid-tones) at the SAME OKLCH lightness as the base palette, while the faint
 *     haze and the hot core stay shared — every species is equally bright and still "bioluma".
 *     `matterLUT2D()` packs untinted + 12 rows into one 256×13 RGBA8 texture.
 *  3. ART_RENDER_STYLE — recommended SimRenderStyle values (frost-white glass rim, deeper night).
 */
import { mix, oklch, rgbToOklch, type RGB } from './color';

/** [value 0..1, r, g, b (0..255), alpha 0..1] */
export type Stop = readonly [number, number, number, number, number];

export const MATTER_ART: { night: readonly Stop[]; paper: readonly Stop[] } = {
  night: [
    [0.0, 8, 10, 24, 0],
    [0.04, 22, 20, 70, 0.35],
    [0.12, 46, 34, 134, 0.82],
    [0.24, 38, 84, 204, 1],
    [0.38, 30, 148, 226, 1],
    [0.54, 58, 196, 240, 1],
    [0.7, 132, 228, 250, 1],
    [0.84, 206, 246, 252, 1],
    [0.94, 255, 240, 214, 1],
    [1.0, 255, 250, 240, 1],
  ],
  paper: [
    [0.0, 255, 255, 255, 0],
    [0.04, 150, 170, 235, 0.25],
    [0.12, 96, 120, 222, 0.6],
    [0.26, 48, 92, 206, 0.9],
    [0.45, 22, 70, 182, 1],
    [0.65, 26, 44, 140, 1],
    [0.85, 40, 26, 110, 1],
    [1.0, 58, 18, 96, 1],
  ],
};

/** Colour families (hue°) — mirror of src/species/identity COLOR_FAMILIES, in the same order. */
export const FAMILY_HUES: readonly { id: string; hue: number }[] = [
  { id: 'coral', hue: 8 },
  { id: 'dorado', hue: 45 },
  { id: 'lima', hue: 80 },
  { id: 'verde', hue: 112 },
  { id: 'jade', hue: 145 },
  { id: 'turquesa', hue: 172 },
  { id: 'celeste', hue: 198 },
  { id: 'azul', hue: 222 },
  { id: 'indigo', hue: 246 },
  { id: 'violeta', hue: 272 },
  { id: 'malva', hue: 298 },
  { id: 'rosado', hue: 325 },
];

/** Sample a stop list at v (0..1) → [r, g, b, a]. */
export function sampleStops(stops: readonly Stop[], v: number): [number, number, number, number] {
  const x = Math.min(1, Math.max(0, v));
  for (let i = 1; i < stops.length; i++) {
    const [v1, r1, g1, b1, a1] = stops[i];
    if (x <= v1) {
      const [v0, r0, g0, b0, a0] = stops[i - 1];
      const t = (x - v0) / (v1 - v0 || 1);
      return [r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t, a0 + (a1 - a0) * t];
    }
  }
  const l = stops[stops.length - 1];
  return [l[1], l[2], l[3], l[4]];
}

/** 256×1 RGBA8 LUT of a stop list (drop-in for core/palette matterLUT → WebGLSimulation.setMatterLUT). */
export function lutFromStops(stops: readonly Stop[]): Uint8Array {
  const out = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b, a] = sampleStops(stops, i / 255);
    out[i * 4] = Math.round(r);
    out[i * 4 + 1] = Math.round(g);
    out[i * 4 + 2] = Math.round(b);
    out[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}

/** How much of the family hue each band takes: none in the haze, full in the body, a hint in the core. */
function tintWeight(v: number): number {
  if (v <= 0.04) return 0;
  if (v < 0.14) return ((v - 0.04) / 0.1) * 0.85;
  if (v <= 0.7) return 0.85;
  if (v < 0.94) return 0.85 - ((v - 0.7) / 0.24) * 0.7;
  return 0.15;
}

/**
 * The night stops re-coloured for one family hue: each stop keeps its OKLCH lightness (so the
 * species is exactly as bright as an untinted one) and takes the family hue with the chroma the
 * band allows. Returns a stop list at the same values as MATTER_ART.night.
 */
export function tintedStops(hue: number): Stop[] {
  return MATTER_ART.night.map(([v, r, g, b, a]) => {
    const base: RGB = [r, g, b];
    const [L, C] = rgbToOklch(base);
    // Chroma: generous in the body, softer near white so the core stays "hot".
    const target = oklch(L, Math.max(C, L > 0.85 ? 0.07 : 0.15), hue);
    const c = mix(base, target, tintWeight(v));
    return [v, Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), a] as const;
  });
}

/** Index of the nearest colour family for a hue (0..11); row = index + 1 in matterLUT2D. */
export function familyIndex(hue: number): number {
  let best = 0;
  let bestD = 999;
  FAMILY_HUES.forEach((f, i) => {
    const d = Math.min(Math.abs(f.hue - hue) % 360, 360 - (Math.abs(f.hue - hue) % 360));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/**
 * One 256×13 RGBA8 texture: row 0 = untinted night palette, rows 1..12 = the families in
 * FAMILY_HUES order. Suggested shader use: `mix(lut(v, 0), lut(v, row), weight * uTintAmt)`.
 */
export function matterLUT2D(): Uint8Array {
  const rows = [MATTER_ART.night, ...FAMILY_HUES.map((f) => tintedStops(f.hue))];
  const out = new Uint8Array(256 * rows.length * 4);
  rows.forEach((stops, r) => out.set(lutFromStops(stops), r * 256 * 4));
  return out;
}

/** UI accent of each family (rings, labels, chips): equal lightness for all hues. Dark / light theme. */
export function familyAccent(hue: number, theme: 'dark' | 'light'): RGB {
  return theme === 'dark' ? oklch(0.8, 0.13, hue) : oklch(0.5, 0.13, hue);
}

/** Recommended tint strength for the existing hue-mix shader (dishgl TINT_GLSL uTintAmt). */
export const TINT_AMOUNT = 0.6;

/**
 * Recommended render style (same shape as src/sim/style SimRenderStyle, linear 0..1 triples as the
 * shader expects). Changes from DEFAULT_RENDER_STYLE: a deeper night outside the dish, a slightly
 * bluer agar, and a FROST-WHITE glass rim (cyan is reserved for life).
 */
export const ART_RENDER_STYLE = {
  bg: [6 / 255, 9 / 255, 13 / 255],
  agarIn: [19 / 255, 28 / 255, 38 / 255],
  agarOut: [12 / 255, 19 / 255, 27 / 255],
  rim: [207 / 255, 232 / 255, 245 / 255],
  rimAmt: 0.26,
  rimStyle: 'line',
  contour: [0.42, 0.88, 1.0],
  glowCore: [0.5, 0.88, 1.0],
  glowWide: [0.3, 0.38, 0.95],
  shadow: [0.42, 0.7, 1.0],
  grid: [0, 0, 0, 0],
} as const;
