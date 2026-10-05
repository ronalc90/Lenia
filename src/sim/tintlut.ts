/**
 * Species tint colormaps (docs/ARTE.md §8.2): one row per species hue, made from the CURRENT matter
 * colormap (the art palette, or a cosmetic one), so tints follow whatever palette is equipped.
 *
 * Each entry keeps its OKLCH lightness — every species is exactly as bright as untinted matter —
 * and takes the hue with the chroma the band allows: none in the faint haze, all of the body, a clear
 * hint in the hot core (the art direction's banding, src/ui/art/matter.ts tintedStops, made stronger
 * so every colour family reads at phone size). Row 0 of the texture is the colormap itself.
 *
 * OKLab: Björn Ottosson (2020), public domain. Pure functions, no GL.
 */
import { MATTER_STOPS } from '../core/palette';

/** Tinted rows besides row 0 (distinct species hues on screen at once; colour families: 12). */
export const MAX_TINT_ROWS = 15;
/** Rows of the tint texture: the colormap plus MAX_TINT_ROWS tinted copies. */
export const TINT_LUT_ROWS = 1 + MAX_TINT_ROWS;
/**
 * Default tint strength: 1 = the art direction's tinted palette exactly (matterLUT2D; the rows
 * already carry its banding). src/ui/art/matter.ts TINT_AMOUNT (0.6) was tuned for the earlier
 * hue-mix shader: with these rows 0.6 mixes a hue with its complement towards grey.
 */
export const TINT_AMOUNT_DEFAULT = 1;

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const fromLinear = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = toLinear(r / 255);
  const lg = toLinear(g / 255);
  const lb = toLinear(b / 255);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (v: readonly number[]): boolean => v.every((x) => x >= -1e-4 && x <= 1 + 1e-4);
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** OKLCH → sRGB 0..255; out of gamut keeps lightness and hue and loses chroma. */
function oklch(L: number, C: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  let lin = oklabToLinear(L, C * Math.cos(h), C * Math.sin(h));
  if (!inGamut(lin)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklabToLinear(L, mid * Math.cos(h), mid * Math.sin(h)))) lo = mid;
      else hi = mid;
    }
    lin = oklabToLinear(L, lo * Math.cos(h), lo * Math.sin(h));
  }
  return [fromLinear(clamp01(lin[0])) * 255, fromLinear(clamp01(lin[1])) * 255, fromLinear(clamp01(lin[2])) * 255];
}

/**
 * Share of the hue each matter value takes: none in the faint haze, all of the body, and still a
 * clear hint in the hot core. Stronger than the art direction's first rows (matter.ts tintedStops:
 * 0.85 body, 0.15 core) by the owner's call: "cada especie un color claramente distinto" at phone
 * size, where most of a creature is its bright core. v0.015: the core kept 80 % of the hue at chroma
 * 0.15 and solid bodies like the Anillo still read white with a coloured rim (QA4); now the whole
 * creature takes its hue (chroma 0.19, lightness capped at TINT_L_MAX: docs/ESPECIES.md).
 */
export function tintWeight(v: number): number {
  if (v <= 0.04) return 0;
  if (v < 0.12) return (v - 0.04) / 0.08;
  return 1;
}

/** Chroma the tinted body reaches (OKLCH), and the floor near white so the core still shows its hue. */
const BODY_CHROMA = 0.19;
const CORE_CHROMA = 0.19;
/**
 * Lightness cap of a tinted colour (OKLCH). Near white no hue fits in sRGB: a solid creature whose
 * body is mostly hot core (the Anillo verde) read "white with a thin green halo" (QA4, owner: "que un
 * niño diga verde"). Capping its lightness keeps the hue in the core; the glow stays bright (bloom).
 */
const TINT_L_MAX = 0.8;
/** The cap rises to this at the hottest matter, so the core still glows brighter than the body. */
const TINT_L_MAX_CORE = 0.88;
const lightCap = (v: number): number => (v <= 0.7 ? TINT_L_MAX : TINT_L_MAX + ((TINT_L_MAX_CORE - TINT_L_MAX) * (v - 0.7)) / 0.3);

/**
 * Knots where the hue is applied exactly: the values of the matter colormap's stops
 * (core/palette MATTER_STOPS = the art night palette). Between knots the tinted colour is
 * interpolated, as the art direction's own rows are (matter.ts tints its stops and interpolates),
 * plus whatever detail the current colormap has between them.
 */
const KNOTS: readonly number[] = MATTER_STOPS.map((s) => s[0]);

/** Colormap colour at v by linear interpolation of its 256 entries. */
/** sRGB 0..255 of `hsl(h s% l%)` (CSS Color 4). */
function hslRgb(h: number, sat: number, light: number): [number, number, number] {
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    return light - sat * Math.min(light, 1 - light) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/**
 * OKLCH hue (degrees) of a species accent `hsl(h 70% 60%)` (SpeciesView.hue, the colour of its card,
 * label, halo and Bestiary portrait). The two hue wheels differ by up to ~40° (HSL 200 sky blue is
 * OKLCH ~235), so the dish converts: the tint on the dish is the card's colour family.
 */
export function accentHueToOklch(hslHue: number): number {
  const h = ((hslHue % 360) + 360) % 360;
  const [r, g, b] = hslRgb(h, 0.7, 0.6);
  const [, A, B] = rgbToOklab(r, g, b);
  return ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
}

function sampleLut(base: Uint8Array, v: number, c: number): number {
  const x = Math.min(255, Math.max(0, v * 255));
  const i = Math.min(254, Math.floor(x));
  const t = x - i;
  return base[i * 4 + c] * (1 - t) + base[(i + 1) * 4 + c] * t;
}

/**
 * Writes the tinted copy of a 256×1 RGBA8 colormap for `hueDeg` into `out` at byte `offset`
 * (alpha unchanged). For the art palette this reproduces src/ui/art/matter.ts matterLUT2D.
 */
export function tintRow(base: Uint8Array, hueDeg: number, out: Uint8Array, offset = 0): void {
  // Tinted and plain colour at every knot.
  const nk = KNOTS.length;
  const plain = new Float64Array(nk * 3);
  const tinted = new Float64Array(nk * 3);
  for (let k = 0; k < nk; k++) {
    const v = KNOTS[k];
    const r = sampleLut(base, v, 0);
    const g = sampleLut(base, v, 1);
    const b = sampleLut(base, v, 2);
    plain.set([r, g, b], k * 3);
    const w = tintWeight(v);
    if (w === 0) {
      tinted.set([r, g, b], k * 3);
      continue;
    }
    const [L, A, B] = rgbToOklab(r, g, b);
    const t = oklch(Math.min(L, lightCap(v)), Math.max(Math.hypot(A, B), L > 0.85 ? CORE_CHROMA : BODY_CHROMA), hueDeg);
    tinted.set([Math.round(r + (t[0] - r) * w), Math.round(g + (t[1] - g) * w), Math.round(b + (t[2] - b) * w)], k * 3);
  }
  let k = 0;
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    while (k < nk - 2 && v > KNOTS[k + 1]) k++;
    const span = KNOTS[k + 1] - KNOTS[k] || 1;
    const t = Math.min(1, Math.max(0, (v - KNOTS[k]) / span));
    const o = offset + i * 4;
    for (let c = 0; c < 3; c++) {
      const lerpT = tinted[k * 3 + c] + (tinted[(k + 1) * 3 + c] - tinted[k * 3 + c]) * t;
      const lerpP = plain[k * 3 + c] + (plain[(k + 1) * 3 + c] - plain[k * 3 + c]) * t;
      out[o + c] = Math.round(Math.min(255, Math.max(0, base[i * 4 + c] + lerpT - lerpP)));
    }
    out[o + 3] = base[i * 4 + 3];
  }
}

/**
 * Rows of the tint texture for a colormap: species hues get rows 1..MAX_TINT_ROWS on first use
 * (hues within half a degree share a row; when all rows are taken a new hue uses the nearest row).
 * `data` is the whole 256 × TINT_LUT_ROWS RGBA8 texture; `dirty` says it must be re-uploaded.
 */
export class TintRows {
  readonly data = new Uint8Array(256 * TINT_LUT_ROWS * 4);
  dirty = true;
  private base = new Uint8Array(256 * 4);
  private hues: number[] = [];

  constructor(base: Uint8Array) {
    this.setBase(base);
  }

  /** New matter colormap (256×1 RGBA8): row 0 and every tinted row are rebuilt. */
  setBase(base: Uint8Array): void {
    this.base.set(base);
    this.data.set(base, 0);
    this.hues.forEach((h, j) => tintRow(this.base, accentHueToOklch(h), this.data, (j + 1) * 256 * 4));
    this.dirty = true;
  }

  /** Row index (1..) for a species accent hue (SpeciesView.hue, HSL degrees). */
  rowFor(hueDeg: number): number {
    const h = ((hueDeg % 360) + 360) % 360;
    let best = -1;
    let bestD = Infinity;
    this.hues.forEach((x, j) => {
      const d = Math.min(Math.abs(x - h), 360 - Math.abs(x - h));
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    });
    if (best >= 0 && (bestD < 0.5 || this.hues.length >= MAX_TINT_ROWS)) return best + 1;
    this.hues.push(h);
    tintRow(this.base, accentHueToOklch(h), this.data, this.hues.length * 256 * 4);
    this.dirty = true;
    return this.hues.length;
  }
}
