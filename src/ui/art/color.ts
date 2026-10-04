/**
 * Colour math for the art direction (docs/ARTE.md §3): sRGB ↔ linear, WCAG contrast, OKLab/OKLCH.
 * Pure functions, no DOM. OKLCH is used so the species tints and route colours have matched
 * perceived lightness (a yellow creature must not read twice as bright as a blue one).
 * Formulas: WCAG 2.2 relative luminance; OKLab by Björn Ottosson (2020), public domain.
 */

export type RGB = readonly [number, number, number];

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** '#RGB' / '#RRGGBB' → [r, g, b] 0..255. Invalid input → [0, 0, 0]. */
export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [0, 0, 0];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** [r, g, b] 0..255 → '#rrggbb'. */
export function rgbToHex(c: RGB): string {
  return '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

/** sRGB channel 0..1 → linear light. */
export function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Linear light → sRGB channel 0..1. */
export function fromLinear(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** WCAG relative luminance of an sRGB colour (0..255 channels). */
export function luminance(c: RGB): number {
  return 0.2126 * toLinear(c[0] / 255) + 0.7152 * toLinear(c[1] / 255) + 0.0722 * toLinear(c[2] / 255);
}

/** WCAG contrast ratio between two colours (1..21). */
export function contrast(a: RGB | string, b: RGB | string): number {
  const la = luminance(typeof a === 'string' ? hexToRgb(a) : a);
  const lb = luminance(typeof b === 'string' ? hexToRgb(b) : b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Composite `fg` with opacity `a` over an opaque `bg`. */
export function over(fg: RGB, a: number, bg: RGB): RGB {
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
}

/** Linear interpolation between two colours. */
export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** sRGB (0..255) → OKLab [L 0..1, a, b]. */
export function rgbToOklab(c: RGB): [number, number, number] {
  const r = toLinear(c[0] / 255);
  const g = toLinear(c[1] / 255);
  const b = toLinear(c[2] / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab → linear sRGB (may be out of gamut). */
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

/**
 * OKLCH → sRGB 0..255. Out-of-gamut colours keep their lightness and hue and lose chroma
 * (binary search), which is how the tints stay luminance-matched.
 */
export function oklch(L: number, C: number, hDeg: number): RGB {
  const h = (hDeg * Math.PI) / 180;
  let lo = 0;
  let hi = C;
  let lin = oklabToLinear(L, C * Math.cos(h), C * Math.sin(h));
  if (!inGamut(lin)) {
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      const v = oklabToLinear(L, mid * Math.cos(h), mid * Math.sin(h));
      if (inGamut(v)) lo = mid;
      else hi = mid;
    }
    lin = oklabToLinear(L, lo * Math.cos(h), lo * Math.sin(h));
  }
  return [fromLinear(clamp01(lin[0])) * 255, fromLinear(clamp01(lin[1])) * 255, fromLinear(clamp01(lin[2])) * 255];
}

/** sRGB → [L, C, h°]. */
export function rgbToOklch(c: RGB): [number, number, number] {
  const [L, a, b] = rgbToOklab(c);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return [L, Math.hypot(a, b), (h + 360) % 360];
}

/** 'rgba(r,g,b,a)' string for canvas fills. */
export function rgba(c: RGB, a = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${+a.toFixed(3)})`;
}
